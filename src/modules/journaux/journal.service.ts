import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NumerotationPiece, Prisma, TypeJournal } from '@prisma/client';
import { JOURNAUX_DEFAUT } from './journal-seed';
import { CreerJournalDto, ModifierJournalDto } from './dto/journal.dto';

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appelé une fois à la création du tenant, juste après le seed du plan de
   * comptes (voir AuthService.register) · les comptes de trésorerie
   * référencés par JOURNAUX_DEFAUT doivent déjà exister.
   */
  async seedJournauxDefaut(tenantId: string) {
    for (const j of JOURNAUX_DEFAUT) {
      let compteTresorerieId: string | undefined;
      if (j.numeroCompteTresorerie) {
        const compte = await this.prisma.compte.findUnique({
          where: { tenantId_numero: { tenantId, numero: j.numeroCompteTresorerie } },
        });
        compteTresorerieId = compte?.id;
      }
      await this.prisma.journal.upsert({
        where: { tenantId_code: { tenantId, code: j.code } },
        update: {},
        create: {
          tenantId,
          code: j.code,
          intitule: j.intitule,
          type: j.type,
          numerotation: j.numerotation,
          compteTresorerieId,
        },
      });
    }
  }

  async lister(tenantId: string, actifsSeuls?: boolean) {
    return this.prisma.journal.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      include: { compteTresorerie: true },
      orderBy: { code: 'asc' },
    });
  }

  async trouver(tenantId: string, journalId: string) {
    const journal = await this.prisma.journal.findFirst({ where: { id: journalId, tenantId } });
    if (!journal) {
      throw new NotFoundException('Journal introuvable pour ce tenant');
    }
    return journal;
  }

  async creer(tenantId: string, dto: CreerJournalDto) {
    if (dto.type === TypeJournal.TRESORERIE && !dto.compteTresorerieId) {
      throw new BadRequestException('Un journal de type Trésorerie doit avoir un compte de trésorerie associé');
    }
    const existant = await this.prisma.journal.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le journal ${dto.code} existe déjà pour ce tenant`);
    }
    return this.prisma.journal.create({
      data: {
        tenantId,
        code: dto.code,
        intitule: dto.intitule,
        type: dto.type,
        compteTresorerieId: dto.compteTresorerieId,
        numerotation: dto.numerotation ?? NumerotationPiece.MANUELLE,
      },
    });
  }

  async modifier(tenantId: string, journalId: string, dto: ModifierJournalDto) {
    const journal = await this.trouver(tenantId, journalId);

    // Le type n'est pas modifiable ici, mais compteTresorerieId l'est : sans
    // ce contrôle, un appel direct à l'API (ex. { compteTresorerieId: null })
    // pourrait retirer le compte de trésorerie d'un journal TRESORERIE et
    // laisser passer un état invalide que creer() interdit pourtant à la
    // création (voir le contrôle symétrique dans creer() ci-dessus).
    if (journal.type === TypeJournal.TRESORERIE && dto.compteTresorerieId === null) {
      throw new BadRequestException('Un journal de type Trésorerie doit avoir un compte de trésorerie associé');
    }

    return this.prisma.journal.update({ where: { id: journal.id }, data: dto });
  }

  /**
   * Calcule le numéro de pièce de la prochaine écriture selon le mode de
   * numérotation du journal (voir docs/plan-de-construction.md §3.1) :
   * - MANUELLE : pas d'auto-numérotation, retourne null.
   * - CONTINUE_JOURNAL : incrémenté par journal, sur l'exercice.
   * - CONTINUE_FICHIER : incrémenté tous journaux confondus, sur l'exercice.
   * - MENSUELLE : incrémenté par journal, remis à zéro chaque mois civil.
   *
   * Prend un client Prisma optionnel (`tx`) pour pouvoir être appelé DANS la
   * transaction sérialisable qui crée l'écriture (voir
   * EcritureService.creer) : lu et écrit hors transaction, ce calcul serait
   * une lecture-puis-écriture non atomique · deux écritures créées en même
   * temps sur le même journal pourraient recevoir le même numéro de pièce.
   */
  async prochainNumeroPiece(
    tenantId: string,
    journal: { id: string; numerotation: NumerotationPiece },
    exerciceId: string,
    date: Date,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number | null> {
    switch (journal.numerotation) {
      case NumerotationPiece.MANUELLE:
        return null;

      case NumerotationPiece.CONTINUE_JOURNAL: {
        const max = await tx.ecriture.aggregate({
          where: { tenantId, journalId: journal.id, exerciceId },
          _max: { numeroPiece: true },
        });
        return (max._max.numeroPiece ?? 0) + 1;
      }

      case NumerotationPiece.CONTINUE_FICHIER: {
        const max = await tx.ecriture.aggregate({
          where: { tenantId, exerciceId },
          _max: { numeroPiece: true },
        });
        return (max._max.numeroPiece ?? 0) + 1;
      }

      case NumerotationPiece.MENSUELLE: {
        const debutMois = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const debutMoisSuivant = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
        const max = await tx.ecriture.aggregate({
          where: { tenantId, journalId: journal.id, date: { gte: debutMois, lt: debutMoisSuivant } },
          _max: { numeroPiece: true },
        });
        return (max._max.numeroPiece ?? 0) + 1;
      }
    }
  }
}
