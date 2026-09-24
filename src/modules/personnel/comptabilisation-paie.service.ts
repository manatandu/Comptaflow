import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StatutEcriture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { moisValide } from './bulletin-paie';
import { propositionPaieDuMois, type BulletinAComptabiliser } from './comptabilisation-paie';
import type { Referentiel } from './passation-paie';
import { ComptabilisationPaieDto } from './dto/personnel.dto';

/**
 * P9 · passer la paie du mois au journal, et défaire ce passage tant que
 * l'écriture est au brouillard. Voir `comptabilisation-paie.ts` pour les
 * règles ; ce service ne fait que lire, poster et lier.
 */
@Injectable()
export class ComptabilisationPaieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private verifierMois(mois: string) {
    if (!moisValide(mois)) throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
  }

  async proposition(tenantId: string, mois: string) {
    this.verifierMois(mois);
    const [tenant, bulletins] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } }),
      this.prisma.bulletinPaie.findMany({
        where: { tenantId, moisDePaie: mois },
        orderBy: { numero: 'asc' },
        select: {
          id: true,
          numero: true,
          nomComplet: true,
          statut: true,
          ecritureId: true,
          netAPayerFc: true,
          entree: true,
          calcul: true,
        },
        // Un mois de paie ne dépasse pas l'effectif du dossier · la borne
        // est là pour qu'aucune route ne rende une collection sans limite.
        take: 5_000,
      }),
    ]);
    const lus: BulletinAComptabiliser[] = bulletins.map((b) => ({
      id: b.id,
      numero: b.numero,
      nomComplet: b.nomComplet,
      statut: b.statut,
      ecritureId: b.ecritureId,
      netAPayerFc: Number(b.netAPayerFc),
      entree: b.entree,
      calcul: b.calcul,
    }));
    const proposition = propositionPaieDuMois(mois, tenant.referentiel as Referentiel, lus);

    // Les pièces déjà passées, avec leur statut · c'est lui qui dit si la
    // comptabilisation peut encore se défaire.
    const ids = [...new Set([...proposition.dejaPasses, ...proposition.annulesApresPassation].map((b) => b.ecritureId))];
    const pieces = ids.length
      ? await this.prisma.ecriture.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, numeroPiece: true, date: true, statut: true },
        })
      : [];
    return { ...proposition, pieces };
  }

  /**
   * PASSER · la proposition est REJOUÉE ici, jamais reçue du client. Le
   * client ne choisit que le journal, la date et le libellé, qui
   * appartiennent au cabinet.
   */
  async comptabiliser(tenantId: string, userId: string, mois: string, dto: ComptabilisationPaieDto) {
    const p = await this.proposition(tenantId, mois);
    if (p.refus.length > 0) {
      throw new BadRequestException({
        message: `La paie de ${mois} n'est pas passée · ${p.refus.length} bulletin(s) refusé(s).`,
        motifs: p.refus.map((r) => `n° ${r.numero} · ${r.nomComplet} · ${r.motifs.join(' ')}`),
      });
    }
    if (p.aPasser.length === 0 || p.lignes.length === 0) {
      throw new BadRequestException(`Aucun bulletin émis à passer pour ${mois}.`);
    }
    if (!p.equilibree) {
      throw new BadRequestException(p.reserves[p.reserves.length - 1] ?? "L'écriture de paie ne s'équilibre pas.");
    }

    const journal = await this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId }, select: { id: true } });
    if (!journal) throw new BadRequestException('Journal introuvable dans ce dossier.');

    const numeros = [...new Set(p.lignes.map((l) => l.compte))];
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, numero: { in: numeros } },
      select: { id: true, numero: true, typeCompte: true },
    });
    const parNumero = new Map(comptes.map((c) => [c.numero, c]));
    // Le compte doit être OUVERT et IMPUTABLE dans ce dossier. Le refus nomme
    // le numéro, avant que la saisie ne le refuse sans dire lequel.
    const manquants = numeros.filter((n) => parNumero.get(n)?.typeCompte !== TypeCompteDetailTotal.DETAIL);
    if (manquants.length) {
      throw new BadRequestException(
        `Ces comptes ne sont pas ouverts en imputation dans ce dossier : ${manquants.join(', ')}. ` +
          'Ouvrez-les au plan comptable avant de passer la paie.',
      );
    }

    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      libelle: dto.libelle?.trim() || `Paie du mois ${mois}`,
      reference: `Bulletins n° ${p.aPasser.map((b) => b.numero).join(', ')}`.slice(0, 190),
      lignes: p.lignes.map((l) => ({
        compteId: parNumero.get(l.compte)!.id,
        libelle: `${l.intitule} · paie ${mois}`,
        ...(l.sens === 'DEBIT' ? { debit: l.montantFc } : { credit: l.montantFc }),
      })),
    });

    // LE LIEN SE POSE SUR LES SEULS BULLETINS ENCORE LIBRES. Deux clics
    // simultanés proposeraient la même écriture deux fois ; le second trouve
    // les bulletins déjà liés, et son écriture est retirée plutôt que de
    // laisser un salaire passé deux fois.
    const ids = p.aPasser.map((b) => b.id);
    const lies = await this.prisma.bulletinPaie.updateMany({
      where: { tenantId, id: { in: ids }, ecritureId: null, statut: 'EMIS' },
      data: { ecritureId: ecriture.id },
    });
    if (lies.count !== ids.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bulletinPaie.updateMany({ where: { tenantId, ecritureId: ecriture.id }, data: { ecritureId: null } });
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: ecriture.id } });
        await tx.ecriture.deleteMany({ where: { tenantId, id: ecriture.id } });
      });
      throw new ConflictException(
        `La paie de ${mois} a changé pendant la passation (un bulletin passé ou annulé entre-temps). ` +
          "Rien n'est enregistré · relisez la proposition et recommencez.",
      );
    }
    return { ecriture, bulletins: p.aPasser };
  }

  /**
   * DÉFAIRE la passation, tant que l'écriture est au BROUILLARD. Validée, elle
   * est entrée au livre-journal et ne se retire plus (AUDCIF art. 22, 2°) ·
   * seule une écriture en négatif la corrige (art. 20).
   */
  async annulerComptabilisation(tenantId: string, ecritureId: string) {
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      select: {
        id: true,
        statut: true,
        numeroPiece: true,
        exercice: { select: { statut: true } },
        lignes: { select: { lettre: true } },
      },
    });
    if (!ecriture) throw new NotFoundException('Écriture introuvable dans ce dossier.');
    const porte = await this.prisma.bulletinPaie.count({ where: { tenantId, ecritureId } });
    if (porte === 0) throw new BadRequestException("Cette écriture ne passe aucun bulletin de paie.");
    if (ecriture.statut === StatutEcriture.VALIDEE) {
      throw new BadRequestException(
        `L'écriture n° ${ecriture.numeroPiece ?? ''} est validée · elle est entrée au livre-journal et ne se retire plus ` +
          '(AUDCIF art. 22, 2°). Une erreur se corrige par une écriture en négatif (art. 20).',
      );
    }
    if (ecriture.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice de cette écriture est clôturé.");
    }
    if (ecriture.lignes.some((l) => l.lettre)) {
      throw new BadRequestException("Une ligne de cette écriture est lettrée · délettrez-la d'abord.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.bulletinPaie.updateMany({ where: { tenantId, ecritureId }, data: { ecritureId: null } });
      await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
      await tx.ecriture.deleteMany({ where: { tenantId, id: ecritureId } });
    });
    return { annule: true, bulletinsLiberes: porte };
  }
}
