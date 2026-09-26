import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes, LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { CumulService } from '../consolidation/cumul.service';
import { PerimetreService } from '../consolidation/perimetre.service';
import { ResultatCumul } from '../consolidation/cumul-consolidation';
import { construireTableauFluxConsolide, lignesAvecMouvements, variationsDuPerimetre } from '../consolidation/flux-capitaux-consolides';
import { LIBELLE_POSTE, PosteConsolidation } from '../consolidation/cumul-consolidation';
import {
  ActiviteIfrsDto,
  EffetChangeIfrsDto,
  MouvementCpIfrsDto,
  NotesIfrsDto,
  PremiereApplicationIfrsDto,
  RegleConsolidationIfrsDto,
  RegleIfrsDto,
  RetraitementIfrsDto,
  TresorerieIfrsDto,
} from './dto/ifrs.dto';
import {
  construireEtatsIfrs,
  ENTREE_EN_VIGUEUR_IFRS18,
  EtatsIfrs,
  LIBELLES_GROUPES,
  motifRefusPartsMinoritaires,
  motifRefusRetraitement,
  RefusIfrs,
  RetraitementDeclare,
  rubriqueDuCompte,
} from './etats-ifrs';
import { construireEtatsIfrsConsolides, EtatsIfrsConsolides, motifRefusRegleConsolidation, POSTES_A_DECLARER, POSTES_RANGES } from './etats-ifrs-consolides';
import { construireNotesIfrs, motifsRefusDeclarationsNotes, normaliserDeclarationsNotes, SOUS_TOTAUX_REFERENCE } from './notes-ifrs';
import { CATEGORIES_FLUX, CategorieFlux, construireFluxTresorerieIfrs, EntreesFluxIfrs, TableauFluxIfrs } from './flux-tresorerie-ifrs';
import { RUBRIQUE_PAR_CODE } from './rubriques-ifrs';
import { construirePremiereApplication, lignesOuverture, motifRefusAjustementTransition, PremiereApplication, RetraitementIfrs1 } from './premiere-application-ifrs';
import { motifRefusRegle, RUBRIQUES_IFRS } from './rubriques-ifrs';
import { COMPOSANTES_CP, construireVariationCapitauxPropres, motifRefusMouvementCp, VariationCapitauxPropres } from './variation-capitaux-propres-ifrs';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1. Le grand livre est lu
 * comme par les états légaux (`chargerLignes`, livre-journal seul), et rien
 * n'y est écrit · les règles et les retraitements vivent dans leurs tables.
 *
 * LE COMPARATIF est un second calcul sur l'exercice précédent, avec SES
 * retraitements et les mêmes règles · sans exercice précédent, la colonne est
 * vide et non nulle.
 *
 * LA VARIATION DES CAPITAUX PROPRES (tranche 2) lit TROIS exercices · son bloc
 * N part de la clôture N-1, et son bloc comparatif, que le § 10 f) exige
 * autant que les autres, part de la clôture N-2. Un bloc qui n'a pas son
 * exercice de départ n'est pas rendu, et le jeu le dit non publiable.
 *
 * LA PREMIÈRE APPLICATION (tranche 4, IFRS 1) se DÉCLARE · le premier
 * exercice IFRS du dossier, ou le fait que l'entité applique déjà les IFRS
 * (§ 4 et 5). Sur le premier exercice, l'exercice comparatif ne part plus de
 * la clôture N-2, qui n'a jamais été IFRS · il part de l'état d'ouverture à
 * la date de transition (§ 6), bâti sur le report à-nouveau de l'exercice
 * comparatif et sur ses AJUSTEMENTS DE TRANSITION (`aLaTransition`), qui ne
 * se mêlent jamais aux retraitements de l'exercice. Les capitaux propres
 * SYSCOHADA des rapprochements du § 24 sont lus par la correspondance du
 * bilan légal (`resoudreBilanSurLignes`), jamais réécrite ici.
 *
 * LE TABLEAU DES FLUX (tranche 3, IAS 7 modifiée par IFRS 18) part du
 * tableau SYSCOHADA de l'exercice (`resoudreFluxDetailleSurLignes`), qui lit
 * les flux réels du grand livre · il exige donc l'exercice précédent, comme
 * lui, et le comparatif exige N-2. Sans eux, le tableau n'est pas rendu.
 *
 * LES NOTES (tranche 5, IFRS 18 § 113 à 132, IAS 8) se bâtissent EN
 * DERNIER · la déclaration de conformité du § 6B dépend de tous les autres
 * motifs de non-publication. Les déclarations sont PAR EXERCICE, et celles de
 * l'exercice précédent sont rendues à l'écran pour être reprises, jamais
 * recopiées d'office · une méthode ou un jugement de l'an dernier peut ne plus
 * valoir.
 */
type RetraitementLu = {
  id: string;
  libelle: string;
  fondement: string;
  correctionErreur: boolean;
  lignes: { rubrique: string; montant: number }[];
  partMinoritairesResultat: number | null;
  partMinoritairesOci: number | null;
  partMinoritairesCapitauxPropres: number | null;
};

const versMoteur = (r: RetraitementLu): RetraitementIfrs1 => ({
  id: r.id,
  libelle: r.libelle,
  fondement: r.fondement,
  correctionErreur: r.correctionErreur,
  lignes: r.lignes.map((l) => ({ rubrique: l.rubrique, montant: l.montant })),
});

/** Un retraitement CONSOLIDÉ porte, en plus, la part des minoritaires de chacun de ses effets (IFRS 10 § B94). */
const versMoteurConsolide = (r: RetraitementLu): RetraitementDeclare => ({
  ...versMoteur(r),
  partMinoritairesResultat: r.partMinoritairesResultat,
  partMinoritairesOci: r.partMinoritairesOci,
  partMinoritairesCapitauxPropres: r.partMinoritairesCapitauxPropres,
});

const nombreOuNull = (x: Prisma.Decimal | number | null | undefined) => (x == null ? null : Number(x));

/**
 * Ce que les tranches C1 et C2 ne servent pas des comptes consolidés IFRS ·
 * dit sur le jeu, jamais tu. Chaque motif nomme la norme qui l'exige.
 */
export const MOTIFS_CONSOLIDES_NON_SERVIS = [
  'État des variations des capitaux propres consolidé non servi par cette tranche · sa colonne des participations ne donnant pas le contrôle (IFRS 18 § 107 a) comprise.',
  'Notes des états consolidés non servies par cette tranche · dont les informations d’IFRS 12 sur les intérêts détenus dans d’autres entités (IFRS 18 § 113 b).',
  'Première application des IFRS aux comptes consolidés non servie par cette tranche (IFRS 1) · les ajustements de transition du groupe ne se déclarent pas encore.',
];

/** Le total CP du bilan légal (« capitaux propres et ressources assimilées »), crédit en positif. */
const REF_CAPITAUX_PROPRES_SYSCOHADA = 'CP';
const EPS = 0.005;

type Parametres = { decouvertsDansTresorerie: boolean | null; tresorerieEnDevises: boolean | null } | null;

@Injectable()
export class IfrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly etatsSyscohada: EtatsFinanciersSyscohadaService,
    private readonly cumuls: CumulService,
    private readonly perimetre: PerimetreService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    return ex;
  }

  /**
   * `aLaTransition` sépare deux objets qui vivent sur le même exercice · les
   * retraitements de l'exercice et les ajustements de transition datés de son
   * ouverture (IFRS 1 § 11). Les additionner mettrait l'effet de la
   * transition deux fois dans la clôture du comparatif.
   *
   * `consolide` sépare de même les retraitements des comptes INDIVIDUELS de
   * ceux des comptes CONSOLIDÉS · un retraitement du groupe (l'annulation de
   * l'amortissement d'un écart d'acquisition) n'a aucun sens sur la balance
   * de la seule société mère, et l'inverse fausserait la consolidation, où
   * les comptes individuels sont déjà cumulés.
   */
  private async retraitementsDe(tenantId: string, exerciceId: string, aLaTransition = false, consolide = false) {
    const rs = await this.prisma.retraitementIfrs.findMany({
      where: { tenantId, exerciceId, aLaTransition, consolide },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rs.map((r) => ({
      ...r,
      partMinoritairesResultat: nombreOuNull(r.partMinoritairesResultat),
      partMinoritairesOci: nombreOuNull(r.partMinoritairesOci),
      partMinoritairesCapitauxPropres: nombreOuNull(r.partMinoritairesCapitauxPropres),
      lignes: r.lignes.map((l) => ({ ...l, montant: Number(l.montant) })),
    }));
  }

  private async precedent(tenantId: string, dateDebut: Date) {
    return this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
  }

  private async mouvementsDe(tenantId: string, exerciceId: string) {
    const ms = await this.prisma.mouvementCapitauxPropresIfrs.findMany({ where: { tenantId, exerciceId }, orderBy: { createdAt: 'asc' } });
    return ms.map((m) => ({ ...m, montant: Number(m.montant) }));
  }

  /** Un bloc de la variation des capitaux propres, ou le motif qui l'empêche. */
  private async blocVariation(tenantId: string, exerciceId: string, cloture: EtatsIfrs, ouverture: EtatsIfrs | null) {
    if (!ouverture) return { bloc: null, motif: 'Sans état IFRS de l’exercice précédent, le rapprochement ouverture → clôture du § 107 c ne s’établit pas.' };
    try {
      return { bloc: construireVariationCapitauxPropres(cloture, ouverture, await this.mouvementsDe(tenantId, exerciceId)), motif: null };
    } catch (e) {
      if (e instanceof RefusIfrs) return { bloc: null, motif: e.message };
      throw e;
    }
  }

  private async calculer(
    tenantId: string,
    ex: { id: string; dateDebut: Date },
    regles: { prefixe: string; rubrique: string }[],
    activite: ActiviteIfrsDto['activitePrincipale'],
    lignesChargees?: LigneBalancePourEtat[],
  ): Promise<EtatsIfrs> {
    const lignes = lignesChargees ?? (await chargerLignes(this.ecritures, tenantId, ex.id));
    const retraitements = (await this.retraitementsDe(tenantId, ex.id)).map(versMoteur);
    try {
      return construireEtatsIfrs(
        { dateDebut: ex.dateDebut },
        lignes.map((l) => ({ numero: l.numero, intitule: l.intitule, solde: Number(l.solde) })),
        regles,
        retraitements,
        activite ?? null,
      );
    } catch (e) {
      if (e instanceof RefusIfrs) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private capitauxPropresSyscohada(lignes: LigneBalancePourEtat[]): number {
    return this.etatsSyscohada.resoudreBilanSurLignes(lignes).resolution.parRef.get(REF_CAPITAUX_PROPRES_SYSCOHADA)?.montant ?? 0;
  }

  /**
   * L'état d'ouverture IFRS (IFRS 1 § 6) et les rapprochements du § 24, pour
   * un premier exercice IFRS dont `comparatif` est l'exercice précédent. Le
   * bilan d'ouverture légal est le report à-nouveau des classes 1 à 5 de
   * l'exercice comparatif · lu dans la même balance que ses soldes.
   */
  private async premiereApplication(
    tenantId: string,
    comparatif: { id: string; dateDebut: Date },
    lignesComparatif: LigneBalancePourEtat[],
    etatComparatif: EtatsIfrs,
    regles: { prefixe: string; rubrique: string }[],
    activite: ActiviteIfrsDto['activitePrincipale'],
  ): Promise<PremiereApplication> {
    const ouvertureLegale: LigneBalancePourEtat[] = lignesComparatif
      .filter((l) => /^[1-5]/.test(l.numero))
      .map((l) => {
        const rd = Number(l.reportDebit ?? 0);
        const rc = Number(l.reportCredit ?? 0);
        return { ...l, totalDebit: rd, totalCredit: rc, mouvementDebit: 0, mouvementCredit: 0, solde: rd - rc };
      });
    const ajustements = (await this.retraitementsDe(tenantId, comparatif.id, true)).map(versMoteur);
    const retraitementsComparatif = (await this.retraitementsDe(tenantId, comparatif.id)).map(versMoteur);
    const ouverture = construireEtatsIfrs(
      { dateDebut: comparatif.dateDebut },
      lignesOuverture(ouvertureLegale.map((l) => ({ numero: l.numero, intitule: l.intitule, reportDebit: l.totalDebit, reportCredit: l.totalCredit }))),
      regles,
      ajustements,
      activite ?? null,
    );
    return construirePremiereApplication({
      dateTransition: comparatif.dateDebut,
      ouverture,
      ajustementsTransition: ajustements,
      capitauxPropresSyscohadaTransition: this.capitauxPropresSyscohada(ouvertureLegale),
      comparatif: etatComparatif,
      retraitementsComparatif,
      capitauxPropresSyscohadaComparatif: this.capitauxPropresSyscohada(lignesComparatif),
    });
  }

  /**
   * Le tableau des flux IFRS d'un exercice, ou le motif qui l'empêche. Les
   * lignes N-1 sont celles de l'exercice précédent, jamais un report à-nouveau ·
   * le tableau SYSCOHADA de départ a tranché que le report n'équivaut pas à
   * une variation de poste.
   */
  private async fluxDe(
    tenantId: string,
    exerciceId: string,
    etat: EtatsIfrs,
    lignesN: LigneBalancePourEtat[],
    lignesN1: LigneBalancePourEtat[] | null,
    regles: { prefixe: string; rubrique: string }[],
    parametres: Parametres,
  ): Promise<{ tableau: TableauFluxIfrs | null; motif: string | null }> {
    if (!lignesN1) {
      return { tableau: null, motif: 'Sans l’exercice précédent, les variations et les flux du tableau SYSCOHADA de départ ne se lisent pas.' };
    }
    const { montants, reserves } = this.etatsSyscohada.resoudreFluxDetailleSurLignes(lignesN, lignesN1);
    const cafgParCategorie = this.cafgParCategorie(lignesN, lignesN1, regles);
    const decouverts = parametres?.decouvertsDansTresorerie ?? null;
    const effet = await this.prisma.effetChangeTresorerieIfrs.findUnique({
      where: { tenantId_exerciceId_consolide: { tenantId, exerciceId, consolide: false } },
    });
    const tableau = construireFluxTresorerieIfrs({
      etat,
      fluxLegaux: Object.fromEntries(montants),
      cafgParCategorie,
      tresorerie: this.perimetreTresorerie(lignesN, lignesN1, regles, decouverts),
      declarations: {
        decouvertsDansTresorerie: decouverts,
        tresorerieEnDevises: parametres?.tresorerieEnDevises ?? null,
        effetChange: effet ? { montant: Number(effet.montant), categorie: effet.categorie } : null,
      },
      reservesLegales: reserves,
    });
    this.controlerCafg(tableau, cafgParCategorie, montants.get('FA') ?? 0, 'la CAFG légale');
    return { tableau, motif: null };
  }

  /**
   * La CAFG (FA) répartie par catégorie · la formule du ch. 5 ne lit que des
   * comptes de gestion, compte par compte, et se calcule donc sur chaque
   * sous-ensemble. La somme est contrôlée plutôt que présumée
   * (`controlerCafg`).
   */
  private cafgParCategorie(lignesN: LigneBalancePourEtat[], lignesN1: LigneBalancePourEtat[], regles: { prefixe: string; rubrique: string }[]) {
    const categorie = (numero: string): CategorieFlux => {
      const code = rubriqueDuCompte(numero, regles);
      return ((code && RUBRIQUE_PAR_CODE.get(code)?.categorie) as CategorieFlux | undefined) ?? 'OPERATIONNELLE';
    };
    const cafg = {} as Record<CategorieFlux, number>;
    for (const c of CATEGORIES_FLUX) {
      const sousEnsemble = lignesN.filter((l) => /^[678]/.test(l.numero) && categorie(l.numero) === c);
      cafg[c] = sousEnsemble.length ? this.etatsSyscohada.resoudreFluxSurLignes(sousEnsemble, lignesN1).get('FA') ?? 0 : 0;
    }
    return cafg;
  }

  private controlerCafg(tableau: TableauFluxIfrs, cafg: Record<CategorieFlux, number>, reference: number, nom: string) {
    const ecart = Math.round((CATEGORIES_FLUX.reduce((s, c) => s + cafg[c], 0) - reference) * 100) / 100;
    if (Math.abs(ecart) > EPS) {
      tableau.motifsNonPubliable.push(`Tableau des flux IFRS · la CAFG répartie par catégorie diffère de ${nom} de ${ecart}.`);
    }
  }

  /**
   * Le périmètre de la trésorerie · IAS 7 contre bilan légal (BT, DT), lu par
   * la correspondance du bilan SYSCOHADA, jamais réécrite. Sert aux comptes
   * individuels comme à la balance consolidée.
   */
  private perimetreTresorerie(
    lignesN: LigneBalancePourEtat[],
    lignesN1: LigneBalancePourEtat[],
    regles: { prefixe: string; rubrique: string }[],
    decouverts: boolean | null,
  ): EntreesFluxIfrs['tresorerie'] {
    const bilanN = this.etatsSyscohada.resoudreBilanSurLignes(lignesN).resolution.parRef;
    const bilanN1 = this.etatsSyscohada.resoudreBilanSurLignes(lignesN1).resolution.parRef;
    const numeros = (ref: string) => [...(bilanN.get(ref)?.comptes ?? []), ...(bilanN1.get(ref)?.comptes ?? [])].map((c) => c.numero);
    const passif = new Set(numeros('DT'));
    const legale = new Set([...numeros('BT'), ...passif]);
    const soldeN = new Map(lignesN.map((l) => [l.numero, Number(l.solde)]));
    const soldeN1 = new Map(lignesN1.map((l) => [l.numero, Number(l.solde)]));
    const intitules = new Map([...lignesN1, ...lignesN].map((l) => [l.numero, l.intitule]));
    const bilan = [...new Set([...soldeN.keys(), ...soldeN1.keys()])].filter((n) => /^[1-5]/.test(n));
    const rangee = new Set(bilan.filter((n) => rubriqueDuCompte(n, regles) === 'SF_TRESORERIE'));
    const incluse = new Set([...rangee, ...(decouverts ? [...passif] : [])]);
    const somme = (m: Map<string, number>, xs: Iterable<string>) => [...xs].reduce((s, n) => s + (m.get(n) ?? 0), 0);
    return {
      ouverture: somme(soldeN1, incluse),
      cloture: somme(soldeN, incluse),
      horsTresorerieIfrs: [...legale]
        .filter((n) => !incluse.has(n))
        .map((n) => ({
          numero: n,
          intitule: intitules.get(n) ?? n,
          activite: passif.has(n) ? ('FINANCEMENT' as const) : ('INVESTISSEMENT' as const),
          variation: (soldeN.get(n) ?? 0) - (soldeN1.get(n) ?? 0),
        }))
        .filter((c) => Math.abs(c.variation) > EPS),
      horsBilanLegal: [...rangee].filter((n) => !legale.has(n) && (Math.abs(soldeN.get(n) ?? 0) > EPS || Math.abs(soldeN1.get(n) ?? 0) > EPS)),
      decouvertsInclus: decouverts ? somme(soldeN, [...passif].filter((n) => !rangee.has(n))) : 0,
      tresoreriePassive: Math.abs(bilanN.get('DT')?.montant ?? 0) > EPS || Math.abs(bilanN1.get('DT')?.montant ?? 0) > EPS,
    };
  }

  async etat(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [parametres, regles, retraitements] = await Promise.all([
      this.prisma.parametresIfrs.findUnique({ where: { tenantId } }),
      this.prisma.regleCorrespondanceIfrs.findMany({ where: { tenantId }, orderBy: { prefixe: 'asc' } }),
      this.retraitementsDe(tenantId, ex.id),
    ]);
    const activite = parametres?.activitePrincipale ?? null;
    const premierId = parametres?.premierExerciceIfrsId ?? null;
    const dejaAdoptant = parametres?.dejaAdoptant ?? false;
    const r = regles.map((x) => ({ prefixe: x.prefixe, rubrique: x.rubrique }));
    const lignesN = await chargerLignes(this.ecritures, tenantId, ex.id);
    const n = await this.calculer(tenantId, ex, r, activite, lignesN);
    const precedent = await this.precedent(tenantId, ex.dateDebut);
    let n1: EtatsIfrs | null = null;
    let motifN1: string | null = null;
    let lignesN1: LigneBalancePourEtat[] = [];
    if (!precedent) motifN1 = 'Aucun exercice précédent dans le dossier · la colonne comparative est vide.';
    else {
      try {
        lignesN1 = await chargerLignes(this.ecritures, tenantId, precedent.id);
        n1 = await this.calculer(tenantId, precedent, r, activite, lignesN1);
      } catch (e) {
        motifN1 = `Le comparatif ne s’établit pas · ${(e as Error).message}`;
      }
    }

    // ─── Première application · IFRS 1 ────────────────────────────────────────
    let premiereApplication: PremiereApplication | null = null;
    let motifPremiereApplication: string | null = null;
    const estPremier = premierId === ex.id;
    if (!premierId && !dejaAdoptant) {
      n.motifsNonPubliable.push(
        'Première application non déclarée · les premiers états financiers IFRS relèvent d’IFRS 1 (§ 2 et 3). Déclarez le premier exercice IFRS du dossier, ou que l’entité présente déjà des états conformes aux IFRS (§ 4 et 5).',
      );
    }
    if (estPremier) {
      if (!precedent || !n1) {
        motifPremiereApplication = `Le premier exercice IFRS présente au moins un exercice comparatif (IFRS 1 § 21), dont l’ouverture est la date de transition (annexe A) · ${motifN1 ?? 'il manque au dossier.'}`;
      } else {
        try {
          premiereApplication = await this.premiereApplication(tenantId, precedent, lignesN1, n1, r, activite);
        } catch (e) {
          if (!(e instanceof RefusIfrs)) throw e;
          motifPremiereApplication = e.message;
        }
      }
      if (premiereApplication) n.motifsNonPubliable.push(...premiereApplication.motifsNonPubliable);
      else n.motifsNonPubliable.push(`Première application non établie · ${motifPremiereApplication}`);
    } else if (premierId && !dejaAdoptant) {
      const premier = await this.prisma.exercice.findFirst({ where: { id: premierId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
      const comparatifDuPremier = premier ? await this.precedent(tenantId, premier.dateDebut) : null;
      const debutTransition = comparatifDuPremier?.dateDebut ?? premier?.dateDebut;
      if (debutTransition && ex.dateFin.getTime() < debutTransition.getTime()) {
        n.motifsNonPubliable.push(
          'Exercice antérieur à la date de transition aux IFRS (IFRS 1, annexe A) · ces états projettent la balance légale sur les rubriques IFRS, ils ne sont pas des états IFRS.',
        );
      }
    }

    // ─── Variation des capitaux propres · deux blocs, N et N-1 (§ 10 f, § 107) ─
    // Sur le premier exercice IFRS, le bloc comparatif part de l'état
    // d'ouverture à la date de transition · la clôture N-2 n'a jamais été IFRS,
    // et la prendre ferait partir le tableau d'un solde que personne n'a publié.
    let n2: EtatsIfrs | null = null;
    const avantPrecedent = precedent && n1 ? await this.precedent(tenantId, precedent.dateDebut) : null;
    const lignesN2 = avantPrecedent ? await chargerLignes(this.ecritures, tenantId, avantPrecedent.id) : null;
    if (avantPrecedent && !estPremier) {
      try {
        n2 = await this.calculer(tenantId, avantPrecedent, r, activite, lignesN2!);
      } catch {
        n2 = null;
      }
    }
    if (estPremier && premiereApplication) n2 = premiereApplication.ouverture;
    const blocN = await this.blocVariation(tenantId, ex.id, n, n1);
    const blocN1 = precedent && n1
      ? await this.blocVariation(tenantId, precedent.id, n1, n2)
      : { bloc: null as VariationCapitauxPropres | null, motif: motifN1 };
    if (blocN.bloc) {
      n.motifsNonPubliable.push(...blocN.bloc.motifsNonPubliable);
      n.mentions.push(...blocN.bloc.mentions);
    } else {
      n.motifsNonPubliable.push(`État des variations des capitaux propres non établi · ${blocN.motif}`);
    }
    if (!blocN1.bloc) {
      n.motifsNonPubliable.push(
        `Bloc comparatif de l’état des variations des capitaux propres non établi (IFRS 18 § 10 f) · ${blocN1.motif ?? 'l’exercice précédent n’a pas d’état IFRS.'}`,
      );
    }

    // ─── Tableau des flux de trésorerie · N et N-1 (IAS 7, § 10 f d'IFRS 18) ──
    const fluxN = await this.fluxDe(tenantId, ex.id, n, lignesN, precedent && n1 ? lignesN1 : null, r, parametres);
    const fluxN1 =
      precedent && n1
        ? await this.fluxDe(tenantId, precedent.id, n1, lignesN1, lignesN2, r, parametres)
        : { tableau: null as TableauFluxIfrs | null, motif: motifN1 };
    if (fluxN.tableau) n.motifsNonPubliable.push(...fluxN.tableau.motifsNonPubliable);
    else n.motifsNonPubliable.push(`Tableau des flux de trésorerie non établi · ${fluxN.motif}`);
    if (!fluxN1.tableau) {
      n.motifsNonPubliable.push(`Tableau des flux de trésorerie comparatif non établi (IFRS 18 § 10 f) · ${fluxN1.motif ?? 'l’exercice précédent n’a pas d’état IFRS.'}`);
    }

    // ─── Notes · IFRS 18 § 113 à 132, IAS 8 ──────────────────────────────────
    const [notesN, notesN1, tenant, mouvements] = await Promise.all([
      this.prisma.notesIfrs.findUnique({ where: { tenantId_exerciceId: { tenantId, exerciceId: ex.id } } }),
      precedent ? this.prisma.notesIfrs.findUnique({ where: { tenantId_exerciceId: { tenantId, exerciceId: precedent.id } } }) : Promise.resolve(null),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { nom: true, pays: true, adresse: true, ville: true, activite: true } }),
      this.mouvementsDe(tenantId, ex.id),
    ]);
    const declarationsNotes = normaliserDeclarationsNotes(notesN?.contenu ?? {});
    const declarationsNotesN1 = notesN1 ? normaliserDeclarationsNotes(notesN1.contenu) : null;
    const notes = construireNotesIfrs({
      declarations: declarationsNotes,
      declarationsN1: declarationsNotesN1,
      // La forme juridique n'est pas reprise de la fiche · son intitulé se
      // déclare, l'énumération du dossier n'étant pas un libellé publiable.
      ficheDossier: {
        nom: tenant?.nom ?? '',
        formeJuridique: null,
        pays: tenant?.pays ?? null,
        adresse: [tenant?.adresse, tenant?.ville].filter((x) => x?.trim()).join(', ') || null,
        activite: tenant?.activite ?? null,
      },
      n,
      n1,
      retraitements: retraitements.map(versMoteur),
      premiereApplication,
      distributionsDeclarees: mouvements.some((m) => m.type === 'DISTRIBUTION'),
      applicationAnticipee: ex.dateDebut.getTime() < ENTREE_EN_VIGUEUR_IFRS18,
      motifsJeu: [...n.motifsNonPubliable],
    });
    n.motifsNonPubliable.push(...notes.motifsNonPubliable);

    return {
      notes: { ...notes, declarations: declarationsNotes, declarationsN1: declarationsNotesN1, sousTotauxReference: SOUS_TOTAUX_REFERENCE },
      activitePrincipale: activite,
      premierExerciceIfrsId: premierId,
      decouvertsDansTresorerie: parametres?.decouvertsDansTresorerie ?? null,
      tresorerieEnDevises: parametres?.tresorerieEnDevises ?? null,
      effetChange: await this.prisma.effetChangeTresorerieIfrs.findUnique({ where: { tenantId_exerciceId_consolide: { tenantId, exerciceId: ex.id, consolide: false } } }),
      fluxTresorerie: { n: fluxN.tableau, motifN: fluxN.motif, n1: fluxN1.tableau, motifN1: fluxN1.motif },
      dejaAdoptant,
      regles,
      retraitements,
      // L'exercice qui porte les ajustements de transition · celui qui précède
      // le premier exercice IFRS, rendu pour que l'écran les y pose.
      exerciceTransitionId: estPremier ? (precedent?.id ?? null) : null,
      ajustementsTransition: precedent && estPremier ? await this.retraitementsDe(tenantId, precedent.id, true) : [],
      rubriques: RUBRIQUES_IFRS,
      groupes: LIBELLES_GROUPES,
      n,
      n1,
      motifN1,
      premiereApplication,
      motifPremiereApplication,
      variationCapitauxPropres: {
        composantes: COMPOSANTES_CP,
        n: blocN.bloc,
        motifN: blocN.motif,
        n1: blocN1.bloc,
        motifN1: blocN1.motif,
        mouvements,
      },
    };
  }

  /**
   * ÉTATS IFRS CONSOLIDÉS, tranche C1 · la balance consolidée du D4C
   * (`CumulService.cumul`, jamais réécrit) projetée par les règles du dossier
   * et par celles des postes, puis corrigée des retraitements CONSOLIDÉS. Un
   * dossier qui ne se consolide pas ne rend pas d'état, et dit pourquoi.
   */
  async etatConsolide(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [parametres, regles, reglesConsolidation, retraitements] = await Promise.all([
      this.prisma.parametresIfrs.findUnique({ where: { tenantId } }),
      this.prisma.regleCorrespondanceIfrs.findMany({ where: { tenantId }, orderBy: { prefixe: 'asc' } }),
      this.prisma.regleConsolidationIfrs.findMany({ where: { tenantId }, orderBy: { poste: 'asc' } }),
      this.retraitementsDe(tenantId, ex.id, false, true),
    ]);
    const activite = parametres?.activitePrincipale ?? null;
    const r = regles.map((x) => ({ prefixe: x.prefixe, rubrique: x.rubrique }));
    const rc = reglesConsolidation.map((x) => ({ poste: x.poste, rubrique: x.rubrique }));
    const commun = {
      activitePrincipale: activite,
      regles,
      reglesConsolidation,
      retraitements,
      rubriques: RUBRIQUES_IFRS,
      groupes: LIBELLES_GROUPES,
      postesRanges: Object.entries(POSTES_RANGES).map(([poste, v]) => ({ poste, libelle: LIBELLE_POSTE[poste as PosteConsolidation], ...v })),
      postesADeclarer: POSTES_A_DECLARER.map((poste) => ({ poste, libelle: LIBELLE_POSTE[poste] })),
      decouvertsDansTresorerie: parametres?.decouvertsDansTresorerie ?? null,
      tresorerieGroupeEnDevises: parametres?.tresorerieGroupeEnDevises ?? null,
      effetChange: await this.prisma.effetChangeTresorerieIfrs.findUnique({
        where: { tenantId_exerciceId_consolide: { tenantId, exerciceId: ex.id, consolide: true } },
      }),
    };

    const jouer = async (e: { id: string; dateDebut: Date }, retr: RetraitementLu[]) => {
      const cumul = await this.cumuls.cumul(tenantId, e.id);
      try {
        return { etat: construireEtatsIfrsConsolides({ dateDebut: e.dateDebut }, cumul, r, rc, retr.map(versMoteurConsolide), activite), cumul };
      } catch (err) {
        if (err instanceof RefusIfrs) throw new BadRequestException(err.message);
        throw err;
      }
    };

    let n: EtatsIfrsConsolides;
    let cumulN: ResultatCumul;
    try {
      ({ etat: n, cumul: cumulN } = await jouer(ex, retraitements));
    } catch (e) {
      if (!(e instanceof BadRequestException)) throw e;
      return { ...commun, n: null, motifN: e.message, n1: null, motifN1: null, fluxTresorerie: null };
    }

    const precedent = await this.precedent(tenantId, ex.dateDebut);
    let n1: EtatsIfrsConsolides | null = null;
    let cumulN1: ResultatCumul | null = null;
    let motifN1: string | null = null;
    if (!precedent) motifN1 = 'Aucun exercice précédent dans le dossier · la colonne comparative est vide.';
    else {
      try {
        ({ etat: n1, cumul: cumulN1 } = await jouer(precedent, await this.retraitementsDe(tenantId, precedent.id, false, true)));
      } catch (e) {
        if (!(e instanceof BadRequestException)) throw e;
        motifN1 = `L’exercice précédent ne se consolide pas · ${e.message}`;
      }
    }
    if (!n1) n.motifsNonPubliable.push(`Comparatif consolidé non établi (IFRS 18 § 10 f) · ${motifN1}`);

    // TRANCHE C2 · le tableau des flux consolidé. Son comparatif est une
    // troisième consolidation (N-2), comme au tableau individuel.
    const tresorerie = { decouvertsDansTresorerie: commun.decouvertsDansTresorerie, tresorerieGroupeEnDevises: commun.tresorerieGroupeEnDevises };
    const fluxN =
      precedent && cumulN1
        ? await this.fluxConsolideDe(tenantId, ex.id, precedent, n, cumulN, cumulN1, r, tresorerie, activite)
        : { tableau: null, motif: `Sans consolidation de l’exercice précédent, le tableau des flux consolidé ne s’établit pas · ${motifN1}` };
    let fluxN1: { tableau: TableauFluxIfrs | null; motif: string | null } = { tableau: null, motif: 'Sans comparatif consolidé, pas de tableau des flux comparatif.' };
    if (precedent && n1 && cumulN1) {
      const avant = await this.precedent(tenantId, precedent.dateDebut);
      let cumulN2: ResultatCumul | null = null;
      let motif = 'Aucun exercice avant l’exercice précédent · le tableau des flux comparatif ne s’établit pas.';
      if (avant) {
        try {
          cumulN2 = await this.cumuls.cumul(tenantId, avant.id);
        } catch (e) {
          if (!(e instanceof BadRequestException)) throw e;
          motif = `L’exercice N-2 ne se consolide pas · ${e.message}`;
        }
      }
      fluxN1 = avant && cumulN2 ? await this.fluxConsolideDe(tenantId, precedent.id, avant, n1, cumulN1, cumulN2, r, tresorerie, activite) : { tableau: null, motif };
    }
    if (fluxN.tableau) n.motifsNonPubliable.push(...fluxN.tableau.motifsNonPubliable);
    else n.motifsNonPubliable.push(`Tableau des flux de trésorerie consolidé non établi (IAS 7, IFRS 18 § 10 d) · ${fluxN.motif}`);
    if (fluxN.tableau && !fluxN1.tableau) n.motifsNonPubliable.push(`Tableau des flux consolidé comparatif non établi (IFRS 18 § 10 f) · ${fluxN1.motif}`);

    n.motifsNonPubliable.push(...MOTIFS_CONSOLIDES_NON_SERVIS);
    return { ...commun, n, motifN: null, n1, motifN1, fluxTresorerie: { n: fluxN.tableau, motifN: fluxN.motif, n1: fluxN1.tableau, motifN1: fluxN1.motif } };
  }

  /**
   * TABLEAU DES FLUX IFRS CONSOLIDÉ (IAS 7 modifiée par IFRS 18), tranche C2.
   * Il part du tableau du D4C (ch. XII-8 § 4, `construireTableauFluxConsolide`),
   * jamais réécrit · ses REFUS sont les siens (périmètre ou pourcentage changé,
   * entité convertie, balance sans mouvements), et ce qu'il lit hors des
   * comptes (flux avec les actionnaires de la mère, dividendes des
   * minoritaires et des mises en équivalence) est repris de lui. Le reste est
   * le moteur des comptes individuels, sur la balance consolidée AVEC ses
   * mouvements · une seconde table divergerait de la première.
   *
   * LES DÉCOUVERTS suivent la déclaration du dossier (méthode uniforme,
   * IFRS 10 § 19) ; LES DEVISES se déclarent pour le groupe, une filiale
   * pouvant en tenir quand la mère n'en tient pas.
   */
  private async fluxConsolideDe(
    tenantId: string,
    exerciceId: string,
    precedent: { id: string },
    etat: EtatsIfrsConsolides,
    cumulN: ResultatCumul,
    cumulN1: ResultatCumul,
    regles: { prefixe: string; rubrique: string }[],
    declarations: { decouvertsDansTresorerie: boolean | null; tresorerieGroupeEnDevises: boolean | null },
    activite: string | null,
  ): Promise<{ tableau: TableauFluxIfrs | null; motif: string | null }> {
    const [perimetreN, perimetreN1] = await Promise.all([this.perimetre.etat(tenantId, exerciceId), this.perimetre.etat(tenantId, precedent.id)]);
    if (perimetreN1.entites.length === 0) {
      return { tableau: null, motif: 'Aucun périmètre déclaré pour l’exercice précédent · les flux ne se lisent pas sur la seule consolidante.' };
    }
    const [consolidanteN, consolidanteN1] = await Promise.all([
      this.cumuls.lignesConsolidante(tenantId, exerciceId),
      this.cumuls.lignesConsolidante(tenantId, precedent.id),
    ]);
    const resolveur = (ln: LigneBalancePourEtat[], ln1: LigneBalancePourEtat[]) => this.etatsSyscohada.resoudreFluxSurLignes(ln, ln1);
    const d4c = construireTableauFluxConsolide(
      { cumulN, cumulN1, consolidanteN, consolidanteN1, variationsPerimetre: variationsDuPerimetre(perimetreN.resultats, perimetreN1.resultats) },
      resolveur,
    );
    if (!d4c.lignes) return { tableau: null, motif: `Le tableau des flux consolidé du D4C ne s’établit pas · ${d4c.obstacles.join(' · ')}` };
    const d = (cle: string) => d4c.lignes?.find((l) => l.cle === cle)?.net ?? 0;

    const lignesN = lignesAvecMouvements(cumulN);
    const lignesN1 = lignesAvecMouvements(cumulN1);
    const { montants, reserves } = this.etatsSyscohada.resoudreFluxDetailleSurLignes(lignesN, lignesN1);
    const mere = resolveur(consolidanteN, consolidanteN1);
    // Les flux avec les actionnaires sont ceux de la mère (FK, FM, FN), et les
    // totaux légaux ceux du tableau du D4C · c'est à LUI que le rapprochement
    // SYSCOHADA → IFRS se fait.
    const fluxLegaux: Record<string, number> = {
      ...Object.fromEntries(montants),
      FK: mere.get('FK') ?? 0,
      FM: mere.get('FM') ?? 0,
      FN: mere.get('FN') ?? 0,
      ZB: d('FLUX_OPERATIONNELS'),
      ZC: d('FLUX_INVESTISSEMENT'),
      ZF: d('FLUX_FINANCEMENT'),
      ZG: d('VARIATION_PERIODE'),
    };
    // La CAFG du D4C est la formule du ch. 5 sur la balance consolidée,
    // diminuée des résultats internes éliminés et des écarts d'évaluation des
    // stocks sortis · la différence, née de l'élimination, reste à l'exploitation.
    const cafgParCategorie = this.cafgParCategorie(lignesN, lignesN1, regles);
    cafgParCategorie.OPERATIONNELLE += d('CAFG') - (montants.get('FA') ?? 0);

    const effet = await this.prisma.effetChangeTresorerieIfrs.findUnique({
      where: { tenantId_exerciceId_consolide: { tenantId, exerciceId, consolide: true } },
    });
    const tableau = construireFluxTresorerieIfrs({
      etat,
      fluxLegaux,
      cafgParCategorie,
      tresorerie: this.perimetreTresorerie(lignesN, lignesN1, regles, declarations.decouvertsDansTresorerie),
      declarations: {
        decouvertsDansTresorerie: declarations.decouvertsDansTresorerie,
        tresorerieEnDevises: declarations.tresorerieGroupeEnDevises,
        effetChange: effet ? { montant: Number(effet.montant), categorie: effet.categorie } : null,
      },
      reservesLegales: reserves,
      consolidation: {
        dividendesRecusMe: d('DIVIDENDES_RECUS_ME'),
        dividendesMinoritaires: d('DIVIDENDES_MINORITAIRES'),
        activiteSelonParagraphe34B: activite === 'INVESTIR_ACTIFS' || activite === 'FINANCER_CLIENTS',
      },
    });
    this.controlerCafg(tableau, cafgParCategorie, d('CAFG'), 'la CAFG du tableau consolidé du D4C');
    return { tableau, motif: null };
  }

  /** Un poste de consolidation qui se déclare, et la rubrique IFRS 18 qui le reçoit. */
  async ajouterRegleConsolidation(tenantId: string, dto: RegleConsolidationIfrsDto) {
    const motif = motifRefusRegleConsolidation(dto.poste, dto.rubrique);
    if (motif) throw new BadRequestException(motif);
    try {
      return await this.prisma.regleConsolidationIfrs.create({ data: { tenantId, poste: dto.poste, rubrique: dto.rubrique } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Le poste ${dto.poste} a déjà une rubrique · retirez la règle avant d’en poser une autre.`);
      }
      throw e;
    }
  }

  async supprimerRegleConsolidation(tenantId: string, id: string) {
    const r = await this.prisma.regleConsolidationIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Règle introuvable dans ce dossier.');
    await this.prisma.regleConsolidationIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * IFRS 18 § 113 à 132 et IAS 8 · les déclarations des notes d'un exercice,
   * en un seul envoi. Ce qui est contradictoire ou mal formé est refusé ; une
   * réponse manquante ne l'est pas, elle rend seulement le jeu non publiable.
   * La forme ENREGISTRÉE est la forme normalisée, celle que le calcul relit.
   */
  async declarerNotes(tenantId: string, dto: NotesIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const contenu = normaliserDeclarationsNotes(dto.contenu);
    const refus = motifsRefusDeclarationsNotes(contenu);
    if (refus.length) throw new BadRequestException(refus.join(' '));
    const json = contenu as unknown as Prisma.InputJsonValue;
    return this.prisma.notesIfrs.upsert({
      where: { tenantId_exerciceId: { tenantId, exerciceId: ex.id } },
      create: { tenantId, exerciceId: ex.id, contenu: json },
      update: { contenu: json },
    });
  }

  /**
   * IAS 7 § 8 et § 28 · des déclarations de méthode, valables pour tous les
   * exercices. Un champ absent de l'envoi garde sa valeur, `null` l'efface ·
   * l'écran des comptes individuels n'envoie pas la trésorerie du groupe.
   */
  async declarerTresorerie(tenantId: string, dto: TresorerieIfrsDto) {
    const data = {
      ...(dto.decouvertsDansTresorerie !== undefined ? { decouvertsDansTresorerie: dto.decouvertsDansTresorerie } : {}),
      ...(dto.tresorerieEnDevises !== undefined ? { tresorerieEnDevises: dto.tresorerieEnDevises } : {}),
      ...(dto.tresorerieGroupeEnDevises !== undefined ? { tresorerieGroupeEnDevises: dto.tresorerieGroupeEnDevises } : {}),
    };
    return this.prisma.parametresIfrs.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  }

  /**
   * IAS 7 § 28 · l'effet de change de l'exercice, déclaré avec sa catégorie et
   * sa justification, pour les comptes individuels OU pour le groupe · jamais
   * l'un lu pour l'autre.
   */
  async declarerEffetChange(tenantId: string, dto: EffetChangeIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const consolide = dto.consolide ?? false;
    if (!dto.justification?.trim()) throw new BadRequestException('Effet de change sans justification · nommez l’écriture de conversion de la trésorerie en devises.');
    if (!(Math.abs(dto.montant) > EPS)) throw new BadRequestException('Effet de change sans montant.');
    const parametres = await this.prisma.parametresIfrs.findUnique({ where: { tenantId } });
    if ((consolide ? parametres?.tresorerieGroupeEnDevises : parametres?.tresorerieEnDevises) === false) {
      throw new BadRequestException(
        `La trésorerie ${consolide ? 'du groupe ' : ''}est déclarée sans devises · il n’y a pas d’effet de change à présenter (IAS 7 § 28).`,
      );
    }
    const data = { montant: dto.montant, categorie: dto.categorie, justification: dto.justification.trim() };
    return this.prisma.effetChangeTresorerieIfrs.upsert({
      where: { tenantId_exerciceId_consolide: { tenantId, exerciceId: ex.id, consolide } },
      create: { tenantId, exerciceId: ex.id, consolide, ...data },
      update: data,
    });
  }

  async supprimerEffetChange(tenantId: string, exerciceId: string, consolide = false) {
    const e = await this.prisma.effetChangeTresorerieIfrs.findUnique({ where: { tenantId_exerciceId_consolide: { tenantId, exerciceId, consolide } } });
    if (!e) throw new NotFoundException('Aucun effet de change déclaré pour cet exercice.');
    await this.prisma.effetChangeTresorerieIfrs.delete({ where: { id: e.id } });
    return { supprime: true };
  }

  /**
   * IFRS 1 § 3 à 5 · premier exercice IFRS OU entité déjà adoptante, jamais
   * les deux · un premier exercice désigne une première application, et une
   * entité déjà adoptante n'en a pas.
   */
  async declarerPremiereApplication(tenantId: string, dto: PremiereApplicationIfrsDto) {
    const premierExerciceIfrsId = dto.premierExerciceIfrsId ?? null;
    const dejaAdoptant = dto.dejaAdoptant ?? false;
    if (premierExerciceIfrsId && dejaAdoptant) {
      throw new BadRequestException('Une entité qui applique déjà les IFRS n’a pas de premier exercice IFRS (IFRS 1 § 4 et 5) · déclarez l’un ou l’autre.');
    }
    if (premierExerciceIfrsId) await this.exercice(tenantId, premierExerciceIfrsId);
    return this.prisma.parametresIfrs.upsert({
      where: { tenantId },
      create: { tenantId, premierExerciceIfrsId, dejaAdoptant },
      update: { premierExerciceIfrsId, dejaAdoptant },
    });
  }

  async declarerActivite(tenantId: string, dto: ActiviteIfrsDto) {
    const activitePrincipale = dto.activitePrincipale ?? null;
    return this.prisma.parametresIfrs.upsert({ where: { tenantId }, create: { tenantId, activitePrincipale }, update: { activitePrincipale } });
  }

  async ajouterRegle(tenantId: string, dto: RegleIfrsDto) {
    const prefixe = dto.prefixe.trim();
    const motif = motifRefusRegle(prefixe, dto.rubrique);
    if (motif) throw new BadRequestException(motif);
    try {
      return await this.prisma.regleCorrespondanceIfrs.create({ data: { tenantId, prefixe, rubrique: dto.rubrique } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Une règle existe déjà pour le préfixe ${prefixe} · retirez-la avant d’en poser une autre.`);
      }
      throw e;
    }
  }

  async supprimerRegle(tenantId: string, id: string) {
    const r = await this.prisma.regleCorrespondanceIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Règle introuvable dans ce dossier.');
    await this.prisma.regleCorrespondanceIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterRetraitement(tenantId: string, dto: RetraitementIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const motif = motifRefusRetraitement({ libelle: dto.libelle, fondement: dto.fondement, lignes: dto.lignes });
    if (motif) throw new BadRequestException(motif);
    const aLaTransition = dto.aLaTransition ?? false;
    const consolide = dto.consolide ?? false;
    const parts = {
      partMinoritairesResultat: dto.partMinoritairesResultat ?? null,
      partMinoritairesOci: dto.partMinoritairesOci ?? null,
      partMinoritairesCapitauxPropres: dto.partMinoritairesCapitauxPropres ?? null,
    };
    // Même règle qu'au calcul · la porte ne laisse entrer que ce que le moteur accepte.
    const motifParts = motifRefusPartsMinoritaires({ id: '', libelle: dto.libelle, fondement: dto.fondement, lignes: dto.lignes, ...parts }, consolide);
    if (motifParts) throw new BadRequestException(motifParts);
    if (consolide && aLaTransition) {
      throw new BadRequestException('La première application des IFRS aux comptes consolidés n’est pas servie · un ajustement de transition se déclare sur les comptes individuels (IFRS 1 § 11).');
    }
    if (aLaTransition) {
      const motifTransition = motifRefusAjustementTransition({ libelle: dto.libelle, lignes: dto.lignes });
      if (motifTransition) throw new BadRequestException(motifTransition);
      // L'ajustement se date de la transition, c'est-à-dire de l'ouverture de
      // l'exercice qui PRÉCÈDE le premier exercice IFRS (annexe A) · posé sur
      // un autre exercice, il ne serait lu par aucun rapprochement.
      const parametres = await this.prisma.parametresIfrs.findUnique({ where: { tenantId } });
      const premier = parametres?.premierExerciceIfrsId
        ? await this.prisma.exercice.findFirst({ where: { id: parametres.premierExerciceIfrsId, tenantId }, select: { id: true, dateDebut: true } })
        : null;
      if (!premier) throw new BadRequestException('Un ajustement de transition suppose un premier exercice IFRS déclaré (IFRS 1 § 3).');
      const comparatif = await this.precedent(tenantId, premier.dateDebut);
      if (!comparatif || comparatif.id !== ex.id) {
        throw new BadRequestException(
          'Un ajustement de transition se pose sur l’exercice comparatif, celui qui précède le premier exercice IFRS · la date de transition est son ouverture (IFRS 1, annexe A).',
        );
      }
    }
    return this.prisma.retraitementIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        libelle: dto.libelle.trim(),
        fondement: dto.fondement.trim(),
        aLaTransition,
        consolide,
        ...parts,
        correctionErreur: dto.correctionErreur ?? false,
        lignes: { create: dto.lignes.map((l, i) => ({ tenantId, ordre: i + 1, rubrique: l.rubrique, montant: l.montant })) },
      },
      include: { lignes: true },
    });
  }

  async supprimerRetraitement(tenantId: string, id: string) {
    const r = await this.prisma.retraitementIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Retraitement introuvable dans ce dossier.');
    await this.prisma.retraitementIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterMouvementCp(tenantId: string, dto: MouvementCpIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const motif = motifRefusMouvementCp(dto);
    if (motif) throw new BadRequestException(motif);
    return this.prisma.mouvementCapitauxPropresIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        type: dto.type,
        composante: dto.composante,
        montant: dto.montant,
        libelle: dto.libelle.trim(),
        justification: dto.justification.trim(),
      },
    });
  }

  async supprimerMouvementCp(tenantId: string, id: string) {
    const m = await this.prisma.mouvementCapitauxPropresIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!m) throw new NotFoundException('Mouvement introuvable dans ce dossier.');
    await this.prisma.mouvementCapitauxPropresIfrs.delete({ where: { id } });
    return { supprime: true };
  }
}
