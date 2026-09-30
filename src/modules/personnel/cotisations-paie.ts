import { MULTIPLICATEURS_ARTICLE_7, SMIG_JOURNALIER_FC, annexeApplicable, type Annexe } from './bareme-smig';

/**
 * LES COTISATIONS D'UN BULLETIN, ET LE NET À PAYER.
 *
 * Trois organismes, trois textes, et des dates d'effet qui ne coïncident pas.
 * Chaque taux porte ici SA source et SA borne, et c'est le SEUL endroit où il
 * est chiffré pour le CALCUL. Le registre des retenues
 * (`correspondance-retenues.ts`) les CITE en texte pour la DÉCLARATION et n'en
 * applique aucun · les deux disent donc la même chose deux fois, et
 * `cotisations-paie.spec.ts` confronte chaque version ici à la citation
 * là-bas (audit final F109 · cet en-tête prétendait qu'ils se lisaient au même
 * endroit, dans un fichier qui écrit n'en porter aucun).
 *
 * ────────────────────────────────────────────────────────────────────────
 * TROIS ASSIETTES POSSIBLES, ET LE TEXTE N'EN NOMME EXPRESSÉMENT QU'UNE.
 *
 * LA CNSS est la seule dont l'assiette soit ROUTÉE par la loi : l'article 13
 * de la loi n° 16/009 assied les cotisations « sur l'ensemble de la
 * rémunération du travailleur assujetti TEL QUE PRÉVU À L'ARTICLE 7, LITERA H,
 * DU CODE DU TRAVAIL », et l'arrêté n° 146/2018, article 17, point 1, recopie
 * la définition avec ses cinq exclusions.
 *
 * L'INPP dit « les rémunérations versées à ses travailleurs ». L'ONEM dit « la
 * rémunération mensuelle payée aux travailleurs ». NI L'UN NI L'AUTRE NE
 * RENVOIE À L'ARTICLE 7. OmegaX retient pour les deux la MÊME assiette que la
 * CNSS, parce que les deux arrêtés sont pris par le Ministre ayant le Travail
 * dans ses attributions et que « rémunération » est un mot DÉFINI par le Code
 * dont ils relèvent. C'est une LECTURE, elle est portée en réserve sur chaque
 * ligne, et elle n'est pas neutre : lue comme le brut versé, l'assiette INPP
 * d'un dossier qui loge son personnel serait sensiblement plus large.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ET L'ASSIETTE N'EST PAS CE QU'ON PAIE. Le logement, le transport, les soins
 * de santé et les allocations familiales sortent de la rémunération, mais ils
 * sont bien VERSÉS au travailleur. Le net à payer part donc du TOTAL VERSÉ,
 * jamais de l'assiette · partir de l'assiette amputerait le net de tout ce que
 * les cinq exclusions représentent, sur un bulletin dont les cotisations
 * seraient justes.
 */

export type ChargeCotisation = 'EMPLOYEUR' | 'TRAVAILLEUR';

export type NatureEmployeurInpp = 'PUBLIC' | 'PRIVE';

export type LigneCotisation = {
  readonly cle: string;
  readonly libelle: string;
  readonly organisme: 'CNSS' | 'INPP' | 'ONEM';
  readonly charge: ChargeCotisation;
  readonly tauxPourCent: number;
  readonly assietteFc: number;
  readonly montantFc: number;
  readonly source: string;
  readonly reserve: string | null;
};

/**
 * Décret n° 18/041 du 24 novembre 2018, articles 2 à 4. Trois branches, et la
 * branche des pensions est la SEULE partagée · c'est elle qui porte la
 * quote-part ouvrière, et elle seule se retient sur la paie.
 */
export const TAUX_CNSS = {
  prestationsAuxFamilles: { tauxPourCent: 6.5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 2' },
  pensionsEmployeur: { tauxPourCent: 5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 3' },
  pensionsTravailleur: { tauxPourCent: 5, charge: 'TRAVAILLEUR' as ChargeCotisation, article: 'article 3' },
  risquesProfessionnels: { tauxPourCent: 1.5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 4' },
} as const;

/**
 * Article 5 du même décret · le taux des risques professionnels « peut être
 * MAJORÉ par la Caisse JUSQU'À CONCURRENCE DU DOUBLE à l'égard d'un employeur
 * aussi longtemps qu'il ne se conforme pas aux prescriptions de la Loi ».
 * Le double est un PLAFOND, pas LA majoration (passe D2) · la constante borne
 * le contrôle, elle n'est jamais le coefficient appliqué.
 *
 * C'est une DÉCISION DE LA CAISSE, jamais un effet automatique d'un manquement
 * constaté par le logiciel. Elle se déclare, et OmegaX ne la présume pas :
 * l'appliquer d'office ferait cotiser 1,5 point de trop sur tout le parc.
 */
export const MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM = 2;

/**
 * LES DEUX NIVEAUX QUE L'ARRÊTÉ n° 140/2018 NOTIFIE, et aucun autre. Art. 22 ·
 * « majoré de CINQUANTE POUR CENT » faute de correction des anomalies
 * notifiées (ou mise en demeure des art. 171, 172 et 175 du Code du travail
 * restée sans suite) ; art. 24, al. 3 · « en cas de RÉCIDIVE [...] majoré de
 * CENT POUR CENT ». La case à cocher qui doublait toujours faisait cotiser
 * 3 % un employeur notifié à 2,25 %, et ne lui laissait aucune saisie juste.
 */
export const MAJORATIONS_RISQUES_PROFESSIONNELS_POUR_CENT = [50, 100] as const;
export type MajorationRisquesProfessionnels = (typeof MAJORATIONS_RISQUES_PROFESSIONNELS_POUR_CENT)[number];

export function reserveMajorationRisquesProfessionnels(pourCent: MajorationRisquesProfessionnels): string {
  const article =
    pourCent === 100
      ? "majoré de cent pour cent en cas de RÉCIDIVE (arrêté n° 140/2018, art. 24, al. 3), soit le double que l'article 5 du décret n° 18/041 fixe pour plafond"
      : "majoré de cinquante pour cent (arrêté n° 140/2018, art. 22), le double de l'article 5 du décret n° 18/041 n'étant que le plafond";
  return (
    `Taux ${article}. La majoration est notifiée par la Caisse · elle court du premier jour du mois civil qui suit ` +
    "la fin du délai de correction et est suspendue à partir du mois qui suit la correction totale des anomalies " +
    "(art. 24, al. 1 et 2). Elle se déclare, elle ne se déduit d'aucun manquement constaté par le logiciel."
  );
}

/**
 * L'APPRENTI N'EST ASSUJETTI QU'À UNE BRANCHE (passe D2). Loi n° 16/009,
 * art. 3 · « pour toutes les branches » le travailleur ; art. 4, 1° · « pour
 * la branche des risques professionnels », l'apprenti lié par un contrat
 * d'apprentissage. L'arrêté n° 139/2018 en fait un « travailleur assimilé »
 * (art. 1er, 1°) et met les obligations de l'employeur à la charge du MAÎTRE
 * (art. 4, 1°). Poser les pensions sur lui retenait 5 % sans fondement, et la
 * quote-part sortait ensuite de l'assiette fiscale (art. 71) · net, IRPP et
 * 422 faux sur un bulletin équilibré.
 */
export type RegimeCnss = 'TRAVAILLEUR' | 'APPRENTI';

export const NON_DUES_APPRENTI =
  "CNSS · prestations aux familles et pensions NON DUES · l'apprenti n'est assujetti qu'à la branche des risques professionnels (loi n° 16/009, art. 4, 1° ; arrêté n° 139/2018, art. 1er, 1°), aucune quote-part ouvrière n'est retenue.";

export const RESERVE_ASSIETTE_ASSIMILE =
  "Apprenti · travailleur assimilé, la cotisation est à la charge du maître (arrêté n° 139/2018, art. 4, 1°). Pour les assimilés, « les cotisations peuvent être assises sur les revenus fixés par le Conseil d'administration » de la Caisse (loi n° 16/009, art. 13, al. 2) · cette décision n'est pas au corpus, OmegaX garde l'assiette de l'article 7 et le dit.";

export const RESERVE_REGIME_CNSS_INCONNU =
  "CNSS · calcul valable pour un travailleur assujetti à toutes les branches (loi n° 16/009, art. 3). Le contrat du mois n'est pas lu · un apprenti ne cotise qu'aux risques professionnels (art. 4).";

/**
 * INPP · arrêté interministériel n° 002/CAB/MET/2025 et autres du 24 septembre
 * 2025, article 1er, en vigueur « à la date de sa signature ». Avant lui,
 * l'arrêté n° 12/MTPS/123 et autres du 14 février 2006.
 *
 * LE TAUX DÉPEND D'ABORD DE LA NATURE DE L'EMPLOYEUR, puis, pour le privé
 * SEULEMENT, de la tranche d'effectif · jamais d'un chiffre d'affaires ni
 * d'une masse salariale.
 */
export type BaremeInpp = {
  readonly aPartirDu: string;
  readonly reference: string;
  readonly publicPourCent: number;
  readonly priveParTranche: readonly { readonly jusqua: number | null; readonly tauxPourCent: number }[];
};

export const BAREMES_INPP: readonly BaremeInpp[] = [
  {
    aPartirDu: '2006-02-14',
    reference:
      "Arrêté interministériel n° 12/MTPS/123, n° 007/CAB/MIN/FINANCES/2006, n° 001/CAB/MIN/BUD/2006 du 14 février 2006, article 1er",
    publicPourCent: 3,
    priveParTranche: [
      { jusqua: 50, tauxPourCent: 3 },
      { jusqua: 300, tauxPourCent: 2 },
      { jusqua: null, tauxPourCent: 1 },
    ],
  },
  {
    aPartirDu: '2025-09-24',
    reference:
      "Arrêté interministériel n° 002/CAB/MET/2025, n° […]/CAB/MIN/FINANCES/2025, n° 003/CAB/VPM/MIN/BUD/2025 du 24 septembre 2025, article 1er",
    publicPourCent: 4,
    priveParTranche: [
      { jusqua: 50, tauxPourCent: 3.5 },
      { jusqua: 300, tauxPourCent: 3 },
      { jusqua: null, tauxPourCent: 2 },
    ],
  },
] as const;

/**
 * ONEM · arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025, article 1er,
 * 0,5 % de la rémunération mensuelle payée, en vigueur à la date de signature
 * du 25 septembre 2025. Avant, 0,2 % (arrêté n° 095/CAB/MINETAT/MTEPS/01/2018
 * du 17 août 2018). Un exercice à cheval sur septembre 2025 porte les DEUX.
 */
export const BAREMES_ONEM: readonly { aPartirDu: string; tauxPourCent: number; reference: string }[] = [
  {
    aPartirDu: '2018-08-17',
    tauxPourCent: 0.2,
    reference: "Arrêté ministériel n° 095/CAB/MINETAT/MTEPS/01/2018 du 17 août 2018",
  },
  {
    aPartirDu: '2025-09-25',
    tauxPourCent: 0.5,
    reference: "Arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025, article 1er",
  },
] as const;

const RESERVE_ASSIETTE_EMPRUNTEE =
  "LECTURE · ce texte dit « rémunération » sans renvoyer à l'article 7 du Code du travail. OmegaX retient la même assiette que la CNSS, le mot étant DÉFINI par le Code dont cet arrêté relève. Lue comme le brut versé, l'assiette serait plus large de tout le logement et le transport.";

/**
 * L'INPP N'EMPRUNTE PAS SON MOT (passe D2) · la cotisation naît de l'art. 15 b)
 * du Code du travail lui-même, qui ne délègue à l'arrêté que le TAUX, et
 * l'art. 7 définit « rémunération » « au sens du présent code ». Reste une
 * divergence de PÉRIODE que le calcul ne tranche pas · aucun texte lu ne dit
 * comment la proportion au trimestre précédent se forme.
 */
export const RESERVE_ASSIETTE_INPP =
  "Assiette · la cotisation naît de l'article 15 b) du Code du travail, qui ne délègue que le taux à l'arrêté ; « rémunération » s'y lit au sens de l'article 7 du même Code. PÉRIODE · l'article 15 b) rapporte la cotisation mensuelle « à la somme des rémunérations versées [...] au cours du trimestre précédent », et OmegaX la calcule sur le mois, aucun texte lu ne disant comment la proportion se forme.";

/**
 * Le dernier barème dont la date d'effet tombe AU PLUS TARD DANS le mois de
 * paie · la comparaison se fait au MOIS, jamais au jour (audit final F110 ·
 * ce docblock disait « au premier jour du mois », ce que la comparaison ne
 * fait pas). Convention d'OmegaX, et elle est dite · un arrêté signé le 24
 * mord sur la paie de ce mois-là, qui se verse en fin de mois ; comparer au
 * premier jour ferait manquer le premier mois de chaque changement de taux.
 * `cotisations-paie.spec.ts` la fige sur août et septembre 2025.
 */
const baremeDuMois = <T extends { aPartirDu: string }>(
  baremes: readonly T[],
  moisDePaie: string,
): T | null => {
  const applicables = baremes.filter((b) => b.aPartirDu.slice(0, 7) <= moisDePaie.slice(0, 7));
  return applicables.length === 0 ? null : applicables[applicables.length - 1];
};

export function tauxInpp(
  moisDePaie: string,
  nature: NatureEmployeurInpp,
  effectif: number | null,
  versionsDossier: readonly BaremeInpp[] = [],
): { tauxPourCent: number | null; source: string; motifAbstention: string | null; saisieCabinet?: boolean } {
  const bareme = baremeDuMois(fusionner(BAREMES_INPP, versionsDossier), moisDePaie);
  if (!bareme) {
    return {
      tauxPourCent: null,
      source: '',
      motifAbstention: `Aucun barème INPP lu pour le mois ${moisDePaie}.`,
    };
  }
  if (nature === 'PUBLIC') {
    return { tauxPourCent: bareme.publicPourCent, source: bareme.reference, motifAbstention: null, saisieCabinet: bareme.saisieCabinet };
  }
  if (effectif === null || !Number.isFinite(effectif) || effectif <= 0) {
    // L'effectif commande la tranche, et il ne se devine pas. Retenir la
    // tranche la plus basse ferait sous-cotiser un grand employeur ; la plus
    // haute ferait sur-cotiser un petit.
    return {
      tauxPourCent: null,
      source: bareme.reference,
      motifAbstention:
        "Le taux INPP d'un employeur PRIVÉ dépend de sa tranche d'effectif. Renseignez l'effectif, OmegaX ne choisit pas de tranche.",
    };
  }
  for (const tranche of bareme.priveParTranche) {
    if (tranche.jusqua === null || effectif <= tranche.jusqua) {
      return { tauxPourCent: tranche.tauxPourCent, source: bareme.reference, motifAbstention: null, saisieCabinet: bareme.saisieCabinet };
    }
  }
  return { tauxPourCent: null, source: bareme.reference, motifAbstention: 'Tranche introuvable.' };
}

export function tauxOnem(
  moisDePaie: string,
  versionsDossier: VersionsDuDossier['onem'] = [],
): { tauxPourCent: number | null; source: string; saisieCabinet?: boolean } {
  const bareme = baremeDuMois(fusionner(BAREMES_ONEM, versionsDossier), moisDePaie);
  return bareme
    ? { tauxPourCent: bareme.tauxPourCent, source: bareme.reference, saisieCabinet: bareme.saisieCabinet }
    : { tauxPourCent: null, source: '' };
}

/**
 * LES TAUX CNSS PAR DATE D'EFFET · décret n° 18/041 du 24 novembre 2018.
 *
 * CORRECTION DU 2026-09-26 · ce bloc écrivait que les taux étaient « livrés
 * sans date d'effet écrite, puisqu'aucune n'a été lue ». Le décret EST au
 * corpus, et il en porte DEUX. Art. 11 · il « entre en vigueur à la date de
 * sa signature », le 24 novembre 2018. Art. 10 · « à l'exception du taux de
 * la branche des risques professionnels, l'application des taux repris aux
 * articles 2 et 3 du présent Décret est DIFFÉRÉE AU 1er JANVIER 2019 », et
 * « en attendant, à titre transitoire », pensions 7 % (3,5 % employeur,
 * 3,5 % travailleur) et, « dans l'ex-province du Katanga », prestations aux
 * familles 4 % à charge de l'employeur. Lacune déclarée à tort, relevée par
 * Manasse.
 *
 * LE RÉGIME TRANSITOIRE NE DIT RIEN DES PRESTATIONS AUX FAMILLES HORS DE
 * L'EX-KATANGA · le taux antérieur relève de textes pris sous le décret-loi
 * de 1961, qui ne sont pas au corpus, et OmegaX ne connaît pas la province du
 * dossier. Pour novembre et décembre 2018, la ligne s'abstient (null). Avant
 * le 24 novembre 2018, toute la CNSS s'abstient.
 */
export type TauxCnssVersion = {
  readonly aPartirDu: string;
  readonly reference: string;
  readonly prestationsAuxFamilles: number | null;
  readonly pensionsEmployeur: number;
  readonly pensionsTravailleur: number;
  readonly risquesProfessionnels: number;
};

export const BAREMES_CNSS: readonly TauxCnssVersion[] = [
  {
    aPartirDu: '2018-11-24',
    reference: 'Décret n° 18/041 du 24 novembre 2018, articles 4, 10 (régime transitoire) et 11',
    prestationsAuxFamilles: null,
    pensionsEmployeur: 3.5,
    pensionsTravailleur: 3.5,
    risquesProfessionnels: TAUX_CNSS.risquesProfessionnels.tauxPourCent,
  },
  {
    aPartirDu: '2019-01-01',
    reference: 'Décret n° 18/041 du 24 novembre 2018, articles 2 à 4 et 10',
    prestationsAuxFamilles: TAUX_CNSS.prestationsAuxFamilles.tauxPourCent,
    pensionsEmployeur: TAUX_CNSS.pensionsEmployeur.tauxPourCent,
    pensionsTravailleur: TAUX_CNSS.pensionsTravailleur.tauxPourCent,
    risquesProfessionnels: TAUX_CNSS.risquesProfessionnels.tauxPourCent,
  },
];

export const ABSTENTION_CNSS_TRANSITOIRE =
  "CNSS · prestations aux familles, novembre et décembre 2018 · le régime transitoire de l'article 10 du décret n° 18/041 ne fixe ce taux que pour l'ex-province du Katanga (4 % à charge de l'employeur) ; ailleurs le taux antérieur n'est pas au corpus, et OmegaX ne connaît pas la province du dossier.";

/** Les taux CNSS du mois · versions livrées, puis celles du cabinet. */
export function tauxCnss(moisDePaie: string, versionsDossier: readonly VersionCnss[] = []) {
  return baremeDuMois(fusionner<TauxCnssVersion>(BAREMES_CNSS, versionsDossier), moisDePaie);
}

/**
 * UNE VERSION DE BARÈME SAISIE PAR LE CABINET · un arrêté ou un décret paru
 * après la livraison d'OmegaX. Elle ne REMPLACE rien · elle s'ajoute à la suite
 * des versions livrées et ne mord qu'à partir de sa date d'effet
 * (baremes-dossier.ts). Le texte qui la fonde voyage avec chaque ligne.
 */
export type VersionCnss = {
  readonly aPartirDu: string;
  readonly reference: string;
  readonly prestationsAuxFamilles: number;
  readonly pensionsEmployeur: number;
  readonly pensionsTravailleur: number;
  readonly risquesProfessionnels: number;
};

export type VersionsDuDossier = {
  readonly cnss: readonly VersionCnss[];
  readonly inpp: readonly BaremeInpp[];
  readonly onem: readonly { aPartirDu: string; tauxPourCent: number; reference: string }[];
};

export const RESERVE_BAREME_CABINET =
  "BARÈME SAISI PAR LE CABINET · OmegaX n'a pas lu ce texte. Le taux et sa référence sont ceux que le cabinet a déclarés, et c'est à lui d'en répondre.";

/** Les versions livrées puis celles du dossier, dans l'ordre des dates d'effet. */
const fusionner = <T extends { aPartirDu: string }>(livrees: readonly T[], dossier: readonly T[] | undefined) =>
  [...livrees, ...(dossier ?? []).map((v) => ({ ...v, saisieCabinet: true }))].sort((a, b) =>
    a.aPartirDu < b.aPartirDu ? -1 : a.aPartirDu > b.aPartirDu ? 1 : 0,
  ) as (T & { saisieCabinet?: boolean })[];

export type ParametresCotisations = {
  readonly moisDePaie: string;
  /**
   * Jours payés d'un mois INCOMPLET (entrée ou sortie en cours de mois), en
   * jours ouvrables, le mois entier en comptant 26 (décret n° 25/22, art. 7).
   * Sert au seul plancher de la CNSS · voir `plancherCnss`.
   */
  readonly joursPayes?: number | null;
  /** Grilles SMIG saisies par le cabinet (baremes-dossier.ts). */
  readonly annexesSmig?: readonly Annexe[];
  /** Versions de barème ajoutées par le cabinet (baremes-dossier.ts). */
  readonly versionsDossier?: VersionsDuDossier;
  readonly natureEmployeurInpp?: NatureEmployeurInpp | null;
  readonly effectif?: number | null;
  /**
   * La majoration notifiée par la Caisse, en pour cent du taux · 50 ou 100
   * (arrêté n° 140/2018, art. 22 et 24). Absente, aucune majoration.
   */
  readonly majorationRisquesProfessionnelsPourCent?: MajorationRisquesProfessionnels | null;
  /**
   * Le régime CNSS du contrat du mois · null quand aucun contrat n'est lu
   * (simulation sans salarié), et la réserve dit l'hypothèse retenue.
   */
  readonly regimeCnss?: RegimeCnss | null;
};

export type VerdictCotisations = {
  readonly lignes: readonly LigneCotisation[];
  readonly totalEmployeurFc: number;
  readonly totalTravailleurFc: number;
  /** Ce que l'employeur supporte en plus du brut. */
  readonly coutEmployeurSupplementaireFc: number;
  readonly abstentions: readonly string[];
  /** Le plancher de la CNSS, appliqué, vérifié ou non (audit final F112). */
  readonly plancherCnss?: PlancherCnss;
  readonly reserves?: readonly string[];
};

/**
 * LE PLANCHER DE LA CNSS · audit final F112.
 *
 * Deux textes le posent dans les mêmes mots · « En aucun cas, le montant des
 * rémunérations servant de base de calcul des cotisations ne peut être
 * inférieur au salaire minimum interprofessionnel garanti » (décret
 * n° 18/041, art. 8), « … au salaire minimum légal » (loi n° 16/009,
 * art. 13 in fine). Le registre des retenues l'annonçait, le moteur ne le
 * posait pas · une paie sous le SMIG cotisait sur moins que la loi.
 *
 * LE SMIG EST UN TAUX JOURNALIER, celui du manœuvre ordinaire (décret
 * n° 25/22, art. 2), et le mois en compte VINGT-SIX (art. 7). D'où la
 * règle, et chacune de ses branches refuse une supposition :
 *  · SMIG du mois hors corpus (avant mai 2025) · rien n'est vérifié, et c'est
 *    dit ; la CNSS se calcule sur l'assiette ;
 *  · les deux lectures de l'annexe 1 (mai à décembre 2025 · 14 500 FC PAYÉS,
 *    21 500 FC FIXÉS par l'art. 2) · au-dessus des deux planchers, rien ne
 *    change ; en dessous du plus haut, la CNSS S'ABSTIENT, OmegaX ne tranchant
 *    pas ce que le registre dit ouvert ;
 *  · une assiette sous le plancher d'un mois ENTIER sans jours payés déclarés
 *    · mois incomplet ou rémunération sous le minimum, le logiciel ne sait
 *    pas lequel, et la CNSS S'ABSTIENT en demandant les jours ;
 *  · sinon, la base est le plus grand de l'assiette et du SMIG journalier
 *    multiplié par les jours payés (26 à défaut), et le relèvement est dit.
 */
export type PlancherCnss = {
  /** La base de la CNSS · `null` quand elle s'abstient. */
  readonly baseFc: number | null;
  readonly plancherFc: number | null;
  readonly applique: boolean;
  /** La réserve (plancher appliqué ou non vérifié) ou le motif d'abstention. */
  readonly message: string | null;
};

const SOURCES_PLANCHER =
  'décret n° 18/041, art. 8 · loi n° 16/009, art. 13 · SMIG journalier du manœuvre ordinaire, décret n° 25/22, art. 2 et 7';

export function plancherCnss(
  moisDePaie: string,
  assietteSocialeFc: number,
  joursPayes?: number | null,
  annexesSmig: readonly Annexe[] = [],
): PlancherCnss {
  const assiette = Math.max(0, assietteSocialeFc);
  const applicable = annexeApplicable(moisDePaie, annexesSmig);
  const annexe = applicable.annexe;
  if (!annexe) {
    // LE MOTIF VRAI, pas « le SMIG n'est pas au corpus » (passe D2, D4) · le
    // décret n° 18/017 est au corpus et transcrit ; ce qui manque est, selon
    // le mois, l'annexe de ses paliers, le secteur du dossier, ou le texte
    // d'avant 2018. Le barème dit lequel.
    return {
      baseFc: assiette,
      plancherFc: null,
      applique: false,
      message: `PLANCHER NON VÉRIFIÉ · ${applicable.explication} (${SOURCES_PLANCHER}).`,
    };
  }
  const jours = joursPayes ?? MULTIPLICATEURS_ARTICLE_7.MOIS;
  const plancher = annexe.smigJournalierFc * jours;
  // L'annexe du décret dont le taux PAYÉ n'est pas le SMIG FIXÉ par l'art. 2.
  const autreLecture =
    annexe.numero !== null && annexe.smigJournalierFc !== SMIG_JOURNALIER_FC ? SMIG_JOURNALIER_FC * jours : null;
  const plancherHaut = Math.max(plancher, autreLecture ?? 0);
  if (assiette >= plancherHaut) {
    return { baseFc: assiette, plancherFc: plancherHaut, applique: false, message: null };
  }
  if (autreLecture !== null) {
    return {
      baseFc: null,
      plancherFc: null,
      applique: false,
      message:
        `PLANCHER NON TRANCHÉ · l'assiette (${assiette} FC) est sous le SMIG de ${jours} jours au taux FIXÉ ` +
        `par l'art. 2 (${autreLecture} FC), et le décret n° 25/22 échelonne son PAIEMENT à ` +
        `${annexe.smigJournalierFc} FC par jour jusqu'en décembre 2025 (${plancher} FC) · aucun texte lu ne dit ` +
        `lequel des deux fait le plancher (${SOURCES_PLANCHER}).`,
    };
  }
  if (joursPayes === undefined || joursPayes === null) {
    return {
      baseFc: null,
      plancherFc: null,
      applique: false,
      message:
        `ASSIETTE SOUS LE PLANCHER · ${assiette} FC contre ${plancher} FC pour un mois entier. Mois incomplet ` +
        `ou rémunération sous le minimum : déclarez les jours payés du mois, et le plancher sera celui de ces ` +
        `jours (${SOURCES_PLANCHER}).`,
    };
  }
  return {
    baseFc: plancher,
    plancherFc: plancher,
    applique: true,
    message:
      `PLANCHER APPLIQUÉ · la base de la CNSS est relevée de ${assiette} FC au SMIG de ${jours} jour(s) payé(s), ` +
      `${plancher} FC (${SOURCES_PLANCHER}). Le relèvement porte sur la base, les taux restent ceux du décret.`,
  };
}

/**
 * Les cotisations d'un mois, sur l'assiette SOCIALE et sur elle seule.
 *
 * La quote-part ouvrière rendue ici est celle que l'article 71 de la loi
 * n° 23/053 laisse déduire du brut imposable · c'est elle, et non le total des
 * cotisations, qui entre dans l'assiette fiscale. Servir le total y ferait
 * déduire les cotisations patronales, qui ne sont pas retenues sur le revenu
 * du travailleur.
 */
export function cotisations(
  assietteSocialeFc: number,
  parametres: ParametresCotisations,
): VerdictCotisations {
  const lignes: LigneCotisation[] = [];
  const abstentions: string[] = [];
  const reserves: string[] = [];
  const assiette = Math.max(0, assietteSocialeFc);
  // LE PLANCHER NE VAUT QUE POUR LA CNSS · ni l'INPP ni l'ONEM n'en portent
  // (audit final F112). La base de la CNSS peut donc différer de l'assiette.
  const plancher = plancherCnss(parametres.moisDePaie, assiette, parametres.joursPayes, parametres.annexesSmig);
  const sourceCnss =
    "Assiette routée par l'article 13 de la loi n° 16/009 vers l'article 7, litera h du Code du travail, et recopiée à l'article 17, point 1 de l'arrêté n° 146/2018.";

  const poser = (
    cle: string,
    libelle: string,
    organisme: LigneCotisation['organisme'],
    charge: ChargeCotisation,
    tauxPourCent: number,
    source: string,
    reserve: string | null,
    base: number = assiette,
  ) => {
    lignes.push({
      cle,
      libelle,
      organisme,
      charge,
      tauxPourCent,
      assietteFc: base,
      montantFc: (base * tauxPourCent) / 100,
      source,
      reserve,
    });
  };

  const v = parametres.versionsDossier;
  const cnss = tauxCnss(parametres.moisDePaie, v?.cnss);
  if (cnss && plancher.baseFc === null) {
    // Le plancher ne se tranche pas · la CNSS s'abstient entière plutôt que de
    // cotiser sur une base que personne n'a décidée.
    abstentions.push(`CNSS · ${plancher.message}`);
  } else if (!cnss) {
    abstentions.push(
      `CNSS · aucun barème lu pour le mois ${parametres.moisDePaie} · OmegaX n'en tient aucun avant le 24 novembre 2018 (décret n° 18/041, art. 11).`,
    );
  } else {
    // Une version saisie par le cabinet porte SA référence, et la réserve le dit.
    const srcCnss = cnss.saisieCabinet ? `${cnss.reference} (saisi par le cabinet).` : `${cnss.reference}. ${sourceCnss}`;
    const reserveCnss = cnss.saisieCabinet ? RESERVE_BAREME_CABINET : null;
    const baseCnss = plancher.baseFc as number;
    if (plancher.message) reserves.push(`CNSS · ${plancher.message}`);
    const apprenti = parametres.regimeCnss === 'APPRENTI';
    if (parametres.regimeCnss === null || parametres.regimeCnss === undefined) {
      reserves.push(RESERVE_REGIME_CNSS_INCONNU);
    }
    if (apprenti) {
      // Une RÉPONSE, pas une abstention · l'émission n'en est pas bloquée.
      reserves.push(NON_DUES_APPRENTI);
    } else {
      if (cnss.prestationsAuxFamilles === null) {
        abstentions.push(ABSTENTION_CNSS_TRANSITOIRE);
      } else {
        poser('cnss-pf', 'CNSS · prestations aux familles', 'CNSS', 'EMPLOYEUR', cnss.prestationsAuxFamilles, srcCnss, reserveCnss, baseCnss);
      }
      poser('cnss-pension-employeur', 'CNSS · pensions, part employeur', 'CNSS', 'EMPLOYEUR', cnss.pensionsEmployeur, srcCnss, reserveCnss, baseCnss);
      poser('cnss-pension-travailleur', 'CNSS · pensions, quote-part ouvrière', 'CNSS', 'TRAVAILLEUR', cnss.pensionsTravailleur, srcCnss, reserveCnss ?? "C'est la SEULE cotisation retenue sur la paie, et la seule que l'article 71 de la loi n° 23/053 laisse déduire du brut imposable.", baseCnss);
    }

    const majoration = parametres.majorationRisquesProfessionnelsPourCent ?? null;
    if (majoration !== null && !MAJORATIONS_RISQUES_PROFESSIONNELS_POUR_CENT.includes(majoration)) {
      throw new RangeError(
        `Majoration des risques professionnels de ${majoration} % · l'arrêté n° 140/2018 n'en connaît que deux, 50 % (art. 22) et 100 % en récidive (art. 24), le double étant le plafond (décret n° 18/041, art. 5).`,
      );
    }
    const coefficient = 1 + (majoration ?? 0) / 100;
    // Le plafond du texte, jamais le coefficient appliqué.
    if (coefficient > MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM) throw new RangeError('Majoration au-delà du double.');
    const tauxRp = cnss.risquesProfessionnels * coefficient;
    const reservesRp = [
      reserveCnss,
      majoration !== null ? reserveMajorationRisquesProfessionnels(majoration) : null,
      apprenti ? RESERVE_ASSIETTE_ASSIMILE : null,
    ].filter((r): r is string => r !== null);
    poser(
      'cnss-rp',
      'CNSS · risques professionnels',
      'CNSS',
      'EMPLOYEUR',
      tauxRp,
      srcCnss,
      reservesRp.length ? reservesRp.join(' ') : null,
      baseCnss,
    );
  }

  const nature = parametres.natureEmployeurInpp ?? null;
  if (nature === null) {
    abstentions.push(
      "INPP · le taux dépend d'abord de la NATURE de l'employeur, public ou privé. Elle n'est pas renseignée, et OmegaX ne la présume pas.",
    );
  } else {
    const inpp = tauxInpp(parametres.moisDePaie, nature, parametres.effectif ?? null, v?.inpp);
    if (inpp.tauxPourCent === null) {
      abstentions.push(`INPP · ${inpp.motifAbstention}`);
    } else {
      poser('inpp', 'INPP · contribution patronale', 'INPP', 'EMPLOYEUR', inpp.tauxPourCent, `Code du travail, art. 15 b) · ${inpp.source}`, inpp.saisieCabinet ? `${RESERVE_BAREME_CABINET} ${RESERVE_ASSIETTE_INPP}` : RESERVE_ASSIETTE_INPP);
    }
  }

  const onem = tauxOnem(parametres.moisDePaie, v?.onem);
  if (onem.tauxPourCent === null) {
    abstentions.push(`ONEM · aucun barème lu pour le mois ${parametres.moisDePaie}.`);
  } else {
    poser('onem', 'ONEM · contribution patronale', 'ONEM', 'EMPLOYEUR', onem.tauxPourCent, onem.source, onem.saisieCabinet ? `${RESERVE_BAREME_CABINET} ${RESERVE_ASSIETTE_EMPRUNTEE}` : RESERVE_ASSIETTE_EMPRUNTEE);
  }

  const totalEmployeurFc = lignes
    .filter((l) => l.charge === 'EMPLOYEUR')
    .reduce((n, l) => n + l.montantFc, 0);
  const totalTravailleurFc = lignes
    .filter((l) => l.charge === 'TRAVAILLEUR')
    .reduce((n, l) => n + l.montantFc, 0);

  return {
    lignes,
    totalEmployeurFc,
    totalTravailleurFc,
    coutEmployeurSupplementaireFc: totalEmployeurFc,
    abstentions,
    plancherCnss: plancher,
    reserves,
  };
}

/**
 * LA SAISIE-ARRÊT ET LA CESSION NE SONT PAS HORS D'ATTEINTE (passe O4). Le
 * motif disait qu'elles « supposent un acte que le registre ne porte pas » ·
 * l'acte existe, il est NOTIFIÉ à l'employeur par le greffier avec « le mode
 * de calcul de la fraction saisissable et les modalités de son règlement »
 * (AUPSRVE, art. 184, 3°), ou avec le montant des retenues par salaire pour
 * une cession (art. 206). Dès la notification, la quotité est indisponible
 * (art. 187), l'employeur verse chaque mois au greffe avec une note
 * (art. 188) ou au cessionnaire (art. 207), et s'il omet de le faire il est
 * déclaré personnellement débiteur (art. 189). Le registre d'OmegaX ne tient
 * pas encore ces actes · la réserve dit ce qu'il faut faire à la main, avec
 * le compte que le Guide d'application nomme (Partie 1 ch. 3, § 4.3, 422 vers
 * 423) et que les deux semis ouvrent (42320000).
 */
export const RESERVE_SAISIES_ET_CESSIONS =
  "Restent hors du net les indemnités compensatoires de l'article 52 et le cautionnement, qui supposent un acte " +
  "propre, ET LA SAISIE-ARRÊT OU LA CESSION NOTIFIÉE PAR LE GREFFIER, que le registre d'OmegaX ne tient pas " +
  "encore · l'acte notifié porte le mode de calcul et le montant de la retenue (AUPSRVE, art. 184, 3° et 206), " +
  "la quotité est indisponible dès la notification (art. 187), l'employeur verse chaque mois au greffe ou au " +
  "cessionnaire (art. 188 et 207) et, s'il omet de le faire, il en est déclaré personnellement débiteur " +
  "(art. 189). La retenue se passe à la main, du 422 au 42320000 « Personnel, saisies-arrêts » (Guide " +
  "d'application SYSCOHADA, Partie 1 ch. 3, § 4.3), et le net de ce bulletin est à diminuer d'autant.";

export type VerdictNet = {
  /** Tout ce que l'employeur verse, exclusions de l'article 7 comprises. */
  readonly totalVerseFc: number;
  readonly quotePartOuvriereFc: number;
  readonly irppFc: number | null;
  readonly netAPayerFc: number | null;
  readonly reserves: readonly string[];
};

/**
 * LE NET À PAYER PART DU TOTAL VERSÉ, JAMAIS DE L'ASSIETTE.
 *
 * C'est le piège central de ce fichier. Les cinq exclusions de l'article 7 ne
 * sont pas des sommes qu'on ne paie pas · ce sont des sommes qui ne sont pas
 * de la rémunération. Le travailleur reçoit bien son indemnité de logement et
 * son indemnité de transport. Partir de l'assiette sociale amputerait le net
 * de tout ce qu'elles représentent, sur un bulletin dont chaque cotisation
 * serait pourtant exacte.
 *
 * ET AUCUNE AUTRE RETENUE N'EST POSÉE. L'article 112 du Code du travail
 * énumère les retenues autorisées : avances, indemnités compensatoires de
 * l'article 52, cautionnement, prêt, saisie-arrêt. Toutes supposent un acte du
 * dossier (une avance consentie, une décision de justice), aucune ne se
 * calcule. Elles se saisissent, et le net rendu ici est AVANT elles.
 */
export function netAPayer(
  totalVerseFc: number,
  quotePartOuvriereFc: number,
  irppFc: number | null,
  retenuesAvancesFc = 0,
): VerdictNet {
  const reserves = [
    "LE NET PART DU TOTAL VERSÉ · les cinq exclusions de l'article 7, point 8 du Code du travail sortent de l'ASSIETTE des cotisations, pas de ce que l'employeur paie. Le logement et le transport sont bien versés au travailleur, sauf ceux qu'il reçoit EN NATURE, qui ne sont ni dans ce total ni au 422.",
    retenuesAvancesFc > 0
      ? `NET APRÈS LES RETENUES D'AVANCE ET DE PRÊT (article 112, c et f), tirées du registre des avances. ${RESERVE_SAISIES_ET_CESSIONS}`
      : `NET AVANT LES RETENUES DE L'ARTICLE 112 · aucune avance ni aucun prêt n'est retenu sur ce bulletin. ${RESERVE_SAISIES_ET_CESSIONS}`,
    // UNE GARANTIE NÉGATIVE VIEILLIT · cette réserve disait la quotité « non
    // calculée » depuis P2b, alors qu'elle l'est depuis P5 et P6, et chaque
    // bulletin émis la figeait (audit final F106).
    "LA QUOTITÉ SAISISSABLE DE L'ARTICLE 114 EST CALCULÉE À PART · sur le minimum de la classe (décret n° 25/22) et après la défalcation du logement fourni en nature (arrêté n° 12/CAB.MIN/TPS/110/2005, art. 10). Elle dit ce qu'une saisie-arrêt ou une cession pourrait atteindre, et n'est retenue sur aucun bulletin.",
  ];
  // Pas de plancher à zéro · un net négatif est REFUSÉ par l'appelant (les
  // retenues d'avance dépasseraient ce qui est dû), jamais ramené à zéro, ce
  // qui ferait mentir le 422 de la passation.
  const netAPayerFc =
    irppFc === null
      ? null
      : Math.max(0, totalVerseFc - quotePartOuvriereFc - irppFc) - retenuesAvancesFc;
  return {
    totalVerseFc,
    quotePartOuvriereFc,
    irppFc,
    netAPayerFc,
    reserves,
  };
}
