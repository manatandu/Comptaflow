import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NumerotationPiece, Prisma, Referentiel, TypeJournal } from '@prisma/client';
import { journauxDefaut } from './journal-seed';
import { CreerJournalDto, ModifierJournalDto } from './dto/journal.dto';
import { prochainNumeroPiece } from './numerotation-piece';

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appelé une fois à la création du tenant, juste après le seed du plan de
   * comptes (voir AuthService.register) · les comptes de trésorerie
   * référencés par journauxDefaut() doivent déjà exister · le compte de
   * caisse diffère selon le référentiel, voir journal-seed.ts.
   */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedJournauxDefaut(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    for (const j of journauxDefaut(referentiel)) {
      let compteTresorerieId: string | undefined;
      if (j.numeroCompteTresorerie) {
        const compte = await client.compte.findUnique({
          where: { tenantId_numero: { tenantId, numero: j.numeroCompteTresorerie } },
        });
        compteTresorerieId = compte?.id;
      }
      await client.journal.upsert({
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
   * Numéro de pièce · le calcul vit dans `numerotation-piece.ts`, appelable
   * sans injecter ce service · quatre chemins de création d'écriture ne
   * l'appelaient pas du tout (voir le commentaire de ce fichier). La méthode
   * reste ici pour les appelants qui ont déjà le service en main.
   */
  async prochainNumeroPiece(
    tenantId: string,
    journal: { id: string; numerotation: NumerotationPiece },
    exerciceId: string,
    date: Date,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number | null> {
    return prochainNumeroPiece(tx, tenantId, journal, exerciceId, date);
  }
}
