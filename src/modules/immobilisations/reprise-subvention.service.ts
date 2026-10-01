import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutImmobilisation } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifNonAmortissable } from './comptes-du-bien';
import { proposerReprise } from './reprise-subvention';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;
/** Le compte de reprise, même numéro semé aux deux plans (79900000). */
const COMPTE_REPRISE = '79900000';

/**
 * LA REPRISE AU 799 DES SUBVENTIONS EN NATURE (`reprise-subvention.ts`) ·
 * proposée pour un bien et un exercice, passée sur demande du cabinet. La
 * proposition est REJOUÉE au passage, jamais reçue du client.
 */
@Injectable()
export class RepriseSubventionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  /**
   * Les biens entrés par une subvention en nature, avec la proposition de
   * l'exercice · bornée à 200 biens, et le dit (`tronque`).
   */
  async lister(tenantId: string, exerciceId: string) {
    const PLAFOND = 200;
    const biens = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        ecritureAcquisition: { lignes: { some: { compte: { numero: { startsWith: '14' } }, credit: { gt: 0 } } } },
      },
      select: { id: true },
      orderBy: { dateAcquisition: 'asc' },
      take: PLAFOND + 1,
    });
    const retenus = biens.slice(0, PLAFOND);
    const propositions = [];
    for (const b of retenus) propositions.push({ id: b.id, ...(await this.proposer(tenantId, b.id, exerciceId)) });
    return { biens: propositions, tronque: biens.length > PLAFOND };
  }

  async proposer(tenantId: string, immobilisationId: string, exerciceId: string, dureeInalienabiliteAns?: number | null) {
    const immo = await this.prisma.immobilisation.findFirst({
      where: { id: immobilisationId, tenantId },
      select: {
        id: true,
        designation: true,
        valeurOrigine: true,
        statut: true,
        dateSortie: true,
        ecritureAcquisitionId: true,
        compteImmobilisation: { select: { numero: true } },
        dotations: { where: { exerciceId }, select: { montant: true } },
        reprisesSubvention: { select: { exerciceId: true, montant: true } },
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable');
    const [exercice, { referentiel }] = await Promise.all([
      this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } }),
    ]);
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');

    // LA SUBVENTION SUIVIE · ce que l'écriture d'acquisition du bien a porté
    // au crédit d'un 14, compte par compte (la reprise débite les mêmes).
    const lignes14 = immo.ecritureAcquisitionId
      ? await this.prisma.ligneEcriture.findMany({
          where: { ecritureId: immo.ecritureAcquisitionId, ecriture: { tenantId }, compte: { numero: { startsWith: '14' } } },
          select: { compteId: true, credit: true, debit: true, compte: { select: { numero: true } } },
          take: 50,
        })
      : [];
    const parCompte = new Map<string, { numero: string; montant: number }>();
    for (const l of lignes14) {
      const m = n(l.credit) - n(l.debit);
      const c = parCompte.get(l.compteId) ?? { numero: l.compte.numero, montant: 0 };
      c.montant = centimes(c.montant + m);
      parCompte.set(l.compteId, c);
    }
    const subvention = centimes([...parCompte.values()].reduce((s, c) => s + c.montant, 0));
    if (subvention <= 0) {
      return { subvention: 0, cumulRepris: 0, montant: 0, nature: 'EXERCICE' as const, motif: "Ce bien n'est pas entré par une subvention en nature (compte 14).", comptes14: [] as { compteId: string; numero: string; montant: number }[], designation: immo.designation, dateFin: exercice.dateFin, dateSortie: immo.dateSortie };
    }

    const sorti =
      immo.statut !== StatutImmobilisation.EN_SERVICE &&
      !!immo.dateSortie &&
      immo.dateSortie >= exercice.dateDebut &&
      immo.dateSortie <= exercice.dateFin;
    const cumulRepris = centimes(immo.reprisesSubvention.reduce((s, r) => s + n(r.montant), 0));
    const proposition = proposerReprise({
      subvention,
      valeurOrigine: n(immo.valeurOrigine),
      amortissable: !motifNonAmortissable(immo.compteImmobilisation.numero, referentiel),
      dotationExercice: immo.dotations[0] ? n(immo.dotations[0].montant) : null,
      cumulRepris,
      sorti,
      dureeInalienabiliteAns,
    });
    const dejaPassee = immo.reprisesSubvention.some((r) => r.exerciceId === exerciceId);
    // Un bien sorti avant l'exercice n'a plus rien à reprendre ici.
    const sortiAvant = immo.statut !== StatutImmobilisation.EN_SERVICE && !sorti;
    const motif = dejaPassee
      ? 'La reprise de cet exercice est déjà passée.'
      : sortiAvant
        ? 'Le bien est sorti avant cet exercice.'
        : proposition.motif;
    return {
      subvention,
      cumulRepris,
      montant: motif ? 0 : proposition.montant,
      nature: proposition.nature,
      motif,
      comptes14: [...parCompte.entries()].map(([compteId, c]) => ({ compteId, ...c })),
      designation: immo.designation,
      dateFin: exercice.dateFin,
      dateSortie: immo.dateSortie,
    };
  }

  async passer(
    tenantId: string,
    userId: string,
    immobilisationId: string,
    dto: { exerciceId: string; journalId: string; dureeInalienabiliteAns?: number | null },
  ) {
    const p = await this.proposer(tenantId, immobilisationId, dto.exerciceId, dto.dureeInalienabiliteAns);
    if (p.motif) throw new BadRequestException(p.motif);
    if (!(p.montant > 0)) throw new BadRequestException('Rien à reprendre pour cet exercice.');
    const c799 = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: COMPTE_REPRISE } },
      select: { id: true },
    });
    if (!c799) throw new BadRequestException(`Compte ${COMPTE_REPRISE} absent du plan du dossier · ouvrez-le avant la reprise.`);
    // Le débit se répartit sur les 14 crédités à l'acquisition, au prorata,
    // le dernier prenant le reste au centime.
    const debits: { compteId: string; debit: number; credit: number }[] = [];
    let reparti = 0;
    p.comptes14.forEach((c, i) => {
      const part = i === p.comptes14.length - 1 ? centimes(p.montant - reparti) : centimes((p.montant * c.montant) / p.subvention);
      reparti = centimes(reparti + part);
      if (part > 0) debits.push({ compteId: c.compteId, debit: part, credit: 0 });
    });
    // À la clôture de l'exercice pour la quote-part, à la date de cession pour le solde (fiche du compte 14).
    const date = (p.nature === 'SORTIE' && p.dateSortie ? p.dateSortie : p.dateFin)!.toISOString().slice(0, 10);
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date,
      libelle: `Reprise de subvention d'investissement · ${p.designation}`.slice(0, 190),
      lignes: [...debits, { compteId: c799.id, debit: 0, credit: p.montant }],
    });
    try {
      return await this.prisma.repriseSubventionImmobilisation.create({
        data: {
          tenantId,
          immobilisationId,
          exerciceId: dto.exerciceId,
          nature: p.nature,
          montant: p.montant,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      });
    } catch (err) {
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La reprise de cet exercice est déjà passée.');
      }
      throw err;
    }
  }
}
