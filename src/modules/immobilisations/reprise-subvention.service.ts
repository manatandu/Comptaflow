import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutImmobilisation } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifNonAmortissable } from './comptes-du-bien';
import { FONDS_REPRIS, fondsDuCompte, proposerReprise, type FondsRepris } from './reprise-subvention';
import { amortissementsHorsDotations } from './partie-remplacee';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;
type Ref = 'SYSCOHADA' | 'SYCEBNL';

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
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } });
    // Les fonds du référentiel du dossier, jamais ceux de l'autre (le 172
    // SYSCOHADA est une dette de location-acquisition).
    const racines = FONDS_REPRIS[referentiel as Ref].map((f) => f.racine);
    const biens = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        OR: [
          {
            ecritureAcquisition: {
              lignes: { some: { credit: { gt: 0 }, OR: racines.map((r) => ({ compte: { numero: { startsWith: r } } })) } },
            },
          },
          // Lot 5 · la subvention en numéraire RATTACHÉE au bien.
          { subventions: { some: {} } },
        ],
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
        amortissementAnterieur: true,
        amortissementsDetaches: true,
        reprisesAmortissement: true,
        amortissementsReevaluation: true,
        dureeNonLimitee: true,
        degressifFiscal: true,
        compteImmobilisation: { select: { numero: true } },
        // L'historique entier du bien · le rythme prospectif (décision D-12)
        // lit ce qui reste à amortir à l'ouverture. Un bien a une ligne par
        // exercice au plus, la lecture est bornée par sa vie.
        dotations: { select: { montant: true, exerciceId: true, exercice: { select: { dateDebut: true } } } },
        depreciations: { select: { sens: true, montant: true, exerciceId: true, exercice: { select: { dateDebut: true } } } },
        derogatoires: { select: { nature: true, dotation: true, reprise: true, exerciceId: true, exercice: { select: { dateDebut: true } } } },
        reprisesSubvention: { select: { exerciceId: true, montant: true, nature: true } },
        subventions: {
          select: {
            compteSubventionId: true,
            montant: true,
            dureeInalienabiliteAns: true,
            compteSubvention: { select: { numero: true } },
            reductions: { select: { montant: true, exercice: { select: { dateDebut: true } } } },
          },
        },
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable');
    const [exercice, { referentiel, methodeDepreciationBienSubventionne }] = await Promise.all([
      this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { referentiel: true, methodeDepreciationBienSubventionne: true },
      }),
    ]);
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');

    // LE FONDS SUIVI · ce que l'écriture d'acquisition du bien a porté au
    // crédit d'un fonds du référentiel (14, et au SYCEBNL 167, 171, 172),
    // compte par compte (la reprise débite les mêmes).
    const lignesAcquisition = immo.ecritureAcquisitionId
      ? await this.prisma.ligneEcriture.findMany({
          where: { ecritureId: immo.ecritureAcquisitionId, ecriture: { tenantId } },
          select: { compteId: true, credit: true, debit: true, compte: { select: { numero: true } } },
          take: 50,
        })
      : [];
    const avecFonds = lignesAcquisition
      .map((l) => ({ l, fonds: fondsDuCompte(referentiel as Ref, l.compte.numero) }))
      .filter((x): x is { l: (typeof lignesAcquisition)[number]; fonds: FondsRepris } => !!x.fonds);
    const rattachees = immo.subventions ?? [];
    const vide = (motif: string) => ({ subvention: 0, cumulRepris: 0, montant: 0, nature: 'EXERCICE' as const, motif, comptes14: [] as { compteId: string; numero: string; montant: number }[], fonds: null as FondsRepris | null, designation: immo.designation, dateFin: exercice.dateFin, dateSortie: immo.dateSortie });
    // DEUX SOURCES, JAMAIS ENSEMBLE · le rattachement est refusé à sa porte
    // sur un bien entré par un fonds ; si les deux coexistaient, la reprise
    // compterait le bien deux fois.
    if (avecFonds.length > 0 && rattachees.length > 0) {
      return vide("Le bien est entré par un fonds et porte aussi une subvention rattachée · la reprise ne se propose pas, elle se passe à la main.");
    }
    const regles = new Set(avecFonds.map((x) => x.fonds.regle));
    if (regles.size > 1) {
      return vide("L'acquisition porte plusieurs natures de fonds · la reprise ne se propose pas, elle se passe à la main.");
    }
    const fonds = rattachees.length > 0 ? FONDS_REPRIS[referentiel as Ref][0] : (avecFonds[0]?.fonds ?? null);
    const parCompte = new Map<string, { numero: string; montant: number }>();
    for (const { l } of avecFonds) {
      const m = n(l.credit) - n(l.debit);
      const c = parCompte.get(l.compteId) ?? { numero: l.compte.numero, montant: 0 };
      c.montant = centimes(c.montant + m);
      parCompte.set(l.compteId, c);
    }
    // Réductions (§ 4.3.1, § 4.7) passées jusqu'à cet exercice compris.
    let reductions = 0;
    for (const r of rattachees) {
      const red = centimes(
        r.reductions.filter((x) => x.exercice.dateDebut <= exercice.dateDebut).reduce((t, x) => t + n(x.montant), 0),
      );
      reductions = centimes(reductions + red);
      const c = parCompte.get(r.compteSubventionId) ?? { numero: r.compteSubvention.numero, montant: 0 };
      // La reprise débite chaque 14 au prorata de ce qui lui reste.
      c.montant = centimes(c.montant + n(r.montant) - red);
      parCompte.set(r.compteSubventionId, c);
    }
    const subvention = centimes(
      rattachees.length > 0
        ? rattachees.reduce((t, r) => t + n(r.montant), 0)
        : [...parCompte.values()].reduce((t, c) => t + c.montant, 0),
    );
    if (subvention <= 0) {
      return vide("Ce bien n'est pas entré par un fonds qui se reprend (subvention, don ou legs, usufruit).");
    }
    const dureeInalienabilite = dureeInalienabiliteAns ?? rattachees.find((r) => r.dureeInalienabiliteAns)?.dureeInalienabiliteAns ?? null;

    const sorti =
      immo.statut !== StatutImmobilisation.EN_SERVICE &&
      !!immo.dateSortie &&
      immo.dateSortie >= exercice.dateDebut &&
      immo.dateSortie <= exercice.dateFin;
    const cumulRepris = centimes(immo.reprisesSubvention.reduce((t, r) => t + n(r.montant), 0));
    const avant = (x: { exerciceId: string; exercice: { dateDebut: Date } }) =>
      x.exerciceId !== exerciceId && x.exercice.dateDebut < exercice.dateDebut;
    const dotationExercice = immo.dotations.find((d) => d.exerciceId === exerciceId);
    const derogatoires = immo.derogatoires ?? [];
    const derogatoireExercice = derogatoires.find((d) => d.exerciceId === exerciceId && d.nature === 'EXERCICE');
    // Ce qui reste à amortir à l'ouverture · amortissements, dérogatoire net
    // et dépréciations nettes des exercices antérieurs déduits.
    const resteAAmortirOuverture = centimes(
      n(immo.valeurOrigine) -
        amortissementsHorsDotations(immo) -
        immo.dotations.filter(avant).reduce((t, d) => t + n(d.montant), 0) -
        derogatoires.filter(avant).reduce((t, d) => t + n(d.dotation) - n(d.reprise), 0) -
        immo.depreciations.filter(avant).reduce((t, d) => t + (d.sens === 'DOTATION' ? n(d.montant) : -n(d.montant)), 0),
    );
    const proposition = proposerReprise({
      subvention,
      valeurOrigine: n(immo.valeurOrigine),
      amortissable: !motifNonAmortissable(immo.compteImmobilisation.numero, referentiel) && !immo.dureeNonLimitee,
      dotationExercice: dotationExercice ? n(dotationExercice.montant) : null,
      cumulRepris,
      sorti,
      dureeInalienabiliteAns: dureeInalienabilite,
      regle: fonds?.regle,
      depreciationExercice: centimes(
        immo.depreciations.filter((d) => d.exerciceId === exerciceId && d.sens === 'DOTATION').reduce((t, d) => t + n(d.montant), 0),
      ),
      reductions,
      resteAAmortirOuverture,
      derogatoireNetExercice: derogatoireExercice ? centimes(n(derogatoireExercice.dotation) - n(derogatoireExercice.reprise)) : 0,
      exercicesRepris: immo.reprisesSubvention.filter((r) => r.nature === 'EXERCICE' && r.exerciceId !== exerciceId).length,
      methodeDepreciation: methodeDepreciationBienSubventionne ?? null,
    });
    // § 3.2 · « dotation globale » · le dérogatoire de l'exercice se passe
    // avant la reprise, sans quoi elle ne suivrait que l'économique.
    const derogatoireAttendu =
      fonds?.regle === 'SUBVENTION' && immo.degressifFiscal && !sorti && !!dotationExercice && !derogatoireExercice;
    const dejaPassee = immo.reprisesSubvention.some((r) => r.exerciceId === exerciceId);
    // Un bien sorti avant l'exercice n'a plus rien à reprendre ici.
    const sortiAvant = immo.statut !== StatutImmobilisation.EN_SERVICE && !sorti;
    const motif = dejaPassee
      ? 'La reprise de cet exercice est déjà passée.'
      : sortiAvant
        ? 'Le bien est sorti avant cet exercice.'
        : derogatoireAttendu
          ? "Passez d'abord l'amortissement dérogatoire de l'exercice · la reprise suit la dotation globale (AUDCIF Titre VIII ch. 17 § 3.2)."
          : proposition.motif;
    return {
      subvention,
      cumulRepris,
      montant: motif ? 0 : proposition.montant,
      nature: proposition.nature,
      motif,
      reserve: proposition.reserve ?? null,
      reductions,
      comptes14: [...parCompte.entries()].filter(([, c]) => c.montant > 0).map(([compteId, c]) => ({ compteId, ...c })),
      fonds,
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
    const compteReprise = p.fonds!.compteReprise;
    const c799 = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: compteReprise } },
      select: { id: true },
    });
    if (!c799) throw new BadRequestException(`Compte ${compteReprise} absent du plan du dossier · ouvrez-le avant la reprise.`);
    // Le débit se répartit sur les 14 crédités à l'acquisition, au prorata,
    // le dernier prenant le reste au centime.
    const debits: { compteId: string; debit: number; credit: number }[] = [];
    let reparti = 0;
    p.comptes14.forEach((c, i) => {
      const base = p.comptes14.reduce((t, x) => t + x.montant, 0);
      const part = i === p.comptes14.length - 1 ? centimes(p.montant - reparti) : centimes((p.montant * c.montant) / base);
      reparti = centimes(reparti + part);
      if (part > 0) debits.push({ compteId: c.compteId, debit: part, credit: 0 });
    });
    // À la clôture de l'exercice pour la quote-part, à la date de cession pour le solde (fiche du compte 14).
    const date = (p.nature === 'SORTIE' && p.dateSortie ? p.dateSortie : p.dateFin)!.toISOString().slice(0, 10);
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date,
      libelle: `${p.fonds!.libelle} · ${p.designation}`.slice(0, 190),
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
