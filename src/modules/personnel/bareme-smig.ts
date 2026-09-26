/**
 * LE SMIG, LA TENSION SALARIALE, LES ALLOCATIONS FAMILIALES MINIMA ET LA
 * CONTRE-VALEUR DU LOGEMENT.
 *
 * SOURCE · Journal officiel de la République Démocratique du Congo, première
 * partie, NUMÉRO SPÉCIAL du 28 octobre 2025, qui publie ensemble :
 *  · le DÉCRET n° 25/21 du 30 mai 2025 déterminant les MODALITÉS de fixation
 *    et d'ajustement (17 articles) ;
 *  · le DÉCRET n° 25/22 du 30 mai 2025 portant FIXATION (12 articles) ;
 *  · ses deux ANNEXES, arrêtées le 17 septembre 2025.
 *
 * Les deux décrets entrent en vigueur à la date de leur signature (25/21
 * art. 17 ; 25/22 art. 12), soit le 30 mai 2025. Le 25/21 abroge le décret
 * n° 079/2002 du 3 juillet 2002 ; le 25/22 abroge le décret n° 18/017 du
 * 22 mai 2018.
 *
 * CE FICHIER NE CALCULE AUCUN BULLETIN. Il rend ce que les textes fixent, et
 * il refuse ce qu'ils ne fixent pas. Le moteur de rémunération est de P2.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION DES ARTICLES 2 ET 3, ET CE QUE L'ANNEXE EN FAIT.
 *
 * ART. 2 · « Le taux journalier du SMIG est fixé à 21 500 Francs Congolais
 * pour le travailleur manœuvre ordinaire. »
 * ART. 3 · « Le taux journalier du SMIG fixé à l'article 2 du présent Décret
 * EST PAYÉ : à partir de la paie du mois de mai 2025, à 14 500 Francs
 * Congolais ; à partir de la paie du mois de janvier 2026, à 21 500 Francs
 * Congolais. »
 *
 * LUS SEULS, CES DEUX ARTICLES LAISSENT UNE QUESTION OUVERTE : sur lequel des
 * deux montants s'assied ce qui se calcule « sur le SMIG » ? LES ANNEXES LA
 * TRANCHENT, et dans un sens qu'on n'aurait pas parié. L'annexe 1, valable de
 * mai à décembre 2025, porte en colonne 19 une allocation familiale de
 * 537,04 FC, soit 14 500 / 27 · elle s'assied donc sur le montant PAYÉ, et
 * non sur les 21 500 de l'article 2. Toute la grille en fait autant.
 *
 * D'OÙ LA RÈGLE DE CE FICHIER · pour tout ce que les annexes couvrent (les
 * dix-sept taux de la tension salariale, l'allocation familiale, la
 * contre-valeur du logement), LA BASE EST LE MONTANT DU PALIER EN COURS.
 * Les 21 500 de l'article 2 restent le SMIG en droit, et ils ne sont pas
 * l'assiette de ces trois grandeurs avant janvier 2026.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Le taux journalier du SMIG, article 2 du décret n° 25/22. */
export const SMIG_JOURNALIER_FC = 21_500;

export const DECRET_SMIG = {
  reference: 'Décret n° 25/22 du 30 mai 2025',
  objet:
    'portant fixation du salaire minimum interprofessionnel garanti, des allocations familiales minima et de la contre-valeur du logement',
  signeLe: '2025-05-30',
  entreEnVigueurLe: '2025-05-30',
  /** Art. 12. */
  formuleEntreeEnVigueur: 'qui entre en vigueur à la date de sa signature',
  /** Art. 11. */
  abroge: 'Décret n° 18/017 du 22 mai 2018',
  fondement: 'Code du travail, article 87',
  /** Les annexes ne sont pas du même jour que le décret. */
  annexesArreteesLe: '2025-09-17',
  publieAu: "Journal officiel, première partie, numéro spécial du 28 octobre 2025",
} as const;

/**
 * LE DÉCRET COMPAGNON, n° 25/21 du même jour · celui que le 25/22 vise à son
 * article 6 et que P0 avait déclaré manquant.
 *
 * Il pose les CRITÈRES (art. 4), le déclencheur d'ajustement (art. 5), la
 * tension salariale (art. 6), le budget-type familial (art. 7 à 9), la
 * commission tripartite (art. 11 et 12) et les deux grandeurs dérivées
 * (art. 13 à 15).
 */
export const DECRET_MODALITES = {
  reference: 'Décret n° 25/21 du 30 mai 2025',
  objet:
    "déterminant les modalités de fixation et d'ajustement du salaire minimum interprofessionnel garanti, des allocations familiales minima et de la contre-valeur du logement",
  signeLe: '2025-05-30',
  entreEnVigueurLe: '2025-05-30',
  abroge: 'Décret n° 079/2002 du 3 juillet 2002',
  fondement: 'Code du travail, article 96',
  /**
   * ART. 5 · le seuil qui ouvre un ajustement. « Est prise en considération
   * pour l'ajustement du SMIG l'augmentation ÉGALE OU SUPÉRIEURE À 50 % de
   * l'indice des prix à la consommation constatée par des relevés successifs
   * séparés au moins par mois d'intervalle sur toute l'étendue du territoire
   * national. »
   */
  seuilAjustementIpcPourCent: 50,
  /**
   * ART. 11 · l'ajustement se fait « à partir du mois de JANVIER de chaque
   * année », sur les travaux d'une commission tripartite. Un dossier ne doit
   * donc pas attendre un ajustement en cours d'année · et il doit en attendre
   * un chaque janvier.
   */
  moisDAjustement: 'janvier',
  /**
   * ART. 15 · « Lorsque, pour cause de MUTATION, l'employeur assure au
   * travailleur un logement en nature, il peut défalquer de l'indemnité de
   * logement de celui-ci un montant minimum équivalent au montant fixé à
   * l'article 14. » C'est ce que « quotité saisissable par l'employeur »
   * veut dire : une DÉFALCATION, et seulement pour cause de mutation.
   */
  defalcationLogementEnNature: 'art. 15, et pour cause de mutation seulement',
} as const;

/* ═══════════════════════════════════════════════════════════════════════
 * LA TENSION SALARIALE · décret n° 25/21 art. 6, décret n° 25/22 art. 4.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface CategorieProfessionnelle {
  /** Le chiffre romain que les annexes portent en en-tête. */
  rang: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII';
  libelle: string;
  /** Les échelons de la catégorie, dans l'ordre. `null` quand il n'y en a pas. */
  echelons: readonly (string | null)[];
  /** Les numéros de classe correspondants, dans le même ordre. */
  classes: readonly number[];
}

/**
 * LES SEPT CATÉGORIES ET LEURS DIX-SEPT CLASSES, telles que les annexes les
 * découpent. « du travailleur manœuvre ordinaire au cadre de collaboration »
 * est exactement ce que couvre cette table, et rien de plus.
 */
export const CATEGORIES: readonly CategorieProfessionnelle[] = [
  { rang: 'I', libelle: 'Manœuvre', echelons: ['Ordinaire', 'Lourd'], classes: [1, 2] },
  { rang: 'II', libelle: 'Travailleur spécialisé', echelons: [null], classes: [3] },
  { rang: 'III', libelle: 'Travailleur semi qualifié', echelons: ['1', '2', '3'], classes: [4, 5, 6] },
  { rang: 'IV', libelle: 'Travailleur qualifié', echelons: ['1', '2'], classes: [7, 8] },
  { rang: 'V', libelle: 'Travailleur hautement qualifié', echelons: [null], classes: [9] },
  { rang: 'VI', libelle: 'Maîtrise', echelons: ['1', '2', '3', '4'], classes: [10, 11, 12, 13] },
  {
    rang: 'VII',
    libelle: 'Cadre de collaboration',
    echelons: ['1', '2', '3', '4'],
    classes: [14, 15, 16, 17],
  },
];

/**
 * LES DIX-SEPT INDICES DE TENSION, classe 1 à classe 17. Base 100 au
 * manœuvre ordinaire, 1 000 au dernier échelon du cadre de collaboration.
 */
export const TENSIONS: readonly number[] = [
  100, 116, 133, 154, 178, 206, 237, 274, 317, 366, 422, 488, 564, 651, 752, 868, 1000,
];

/**
 * LES COLONNES DES ANNEXES, et elles ne se confondent PAS avec les classes.
 *
 * L'article 5 du décret n° 25/22 désigne « la COLONNE 19 du tableau en
 * annexe » comme la source de l'allocation familiale. Cette phrase suffit à
 * fixer la numérotation : la colonne 1 est celle des en-têtes de ligne, les
 * colonnes 2 à 18 portent les dix-sept classes, la colonne 19 l'allocation
 * familiale et la colonne 20 la contre-valeur du logement. Une numérotation
 * qui ferait coïncider colonne et classe mettrait l'allocation en 18 et
 * contredirait l'article.
 */
export const COLONNE_ALLOCATIONS_FAMILIALES = 19;
export const COLONNE_CONTRE_VALEUR_LOGEMENT = 20;
export const colonneDeLaClasse = (classe: number): number => classe + 1;

export interface Annexe {
  /** 1 ou 2 pour les annexes du décret n° 25/22, null pour une version du cabinet. */
  numero: 1 | 2 | null;
  /** Le texte d'une version saisie par le cabinet (baremes-dossier.ts). */
  reference?: string;
  /** Premier mois de paie couvert, AAAA-MM. */
  duMoisDePaie: string;
  /** Dernier mois de paie couvert, AAAA-MM, ou null si non borné. */
  auMoisDePaie: string | null;
  /** Le taux du manœuvre ordinaire, base de toute la colonne. */
  smigJournalierFc: number;
  /** Les dix-sept taux journaliers, classe 1 à 17. */
  tauxParClasse: readonly number[];
  /** Colonne 19. */
  allocationFamilialeJournaliereFc: number;
  /** Colonne 20. */
  contreValeurLogementJournaliereFc: number;
}

/**
 * LES DEUX ANNEXES, TRANSCRITES ET NON CALCULÉES.
 *
 * Les trente-quatre taux sont recopiés du tableau, pas engendrés par la
 * formule · c'est le tableau qui fait foi. Un test les confronte ensuite à
 * `tension × SMIG / 100` et à `SMIG / 27` : la grille est arithmétiquement
 * CLOSE, et cette clôture est la preuve que la transcription est juste. Une
 * transcription qui ne boucle pas est une transcription fausse.
 */
export const ANNEXES: readonly Annexe[] = [
  {
    numero: 1,
    duMoisDePaie: '2025-05',
    auMoisDePaie: '2025-12',
    smigJournalierFc: 14_500,
    tauxParClasse: [
      14_500, 16_820, 19_285, 22_330, 25_810, 29_870, 34_365, 39_730, 45_965, 53_070, 61_190,
      70_760, 81_780, 94_395, 109_040, 125_860, 145_000,
    ],
    allocationFamilialeJournaliereFc: 537.04,
    contreValeurLogementJournaliereFc: 107.41,
  },
  {
    numero: 2,
    duMoisDePaie: '2026-01',
    auMoisDePaie: null,
    smigJournalierFc: 21_500,
    tauxParClasse: [
      21_500, 24_940, 28_595, 33_110, 38_270, 44_290, 50_955, 58_910, 68_155, 78_690, 90_730,
      104_920, 121_260, 139_965, 161_680, 186_620, 215_000,
    ],
    allocationFamilialeJournaliereFc: 796.3,
    contreValeurLogementJournaliereFc: 159.26,
  },
];

/** Les deux diviseurs du texte · art. 5 et art. 6 du décret n° 25/22. */
export const DIVISEUR_ALLOCATION_FAMILIALE = 27;
export const DIVISEUR_CONTRE_VALEUR_LOGEMENT = 5;

/** Les annexes arrondissent au centime. Observé, et non prescrit par le texte. */
export const DECIMALES_ANNEXE = 2;

export type MotifRefusSmig = 'MOIS_MAL_FORME' | 'ANTERIEUR_AU_DECRET' | 'CLASSE_HORS_BAREME';

export interface Applicable<T> {
  valeur: T | null;
  annexe: Annexe | null;
  refus: MotifRefusSmig | null;
  explication: string;
}

const MOIS_VALIDE = /^\d{4}-(0[1-9]|1[0-2])$/;

const REFUS_ANTERIEUR =
  "Ce mois de paie est antérieur à mai 2025, premier mois couvert par l'annexe 1 du décret " +
  "n° 25/22. Les montants applicables avant ce mois ne sont pas au corpus d'OmegaX et ne sont pas " +
  "reconstitués ici.";

/** Le nom d'une annexe dans un message · celle du décret, ou la version du cabinet. */
export const nomAnnexe = (a: Annexe) =>
  a.numero === null ? `la grille saisie par le cabinet (${a.reference ?? 'texte non précisé'})` : `l'annexe ${a.numero} du décret n° 25/22`;

const arrondiAnnexe = (n: number) => Math.round(n * 10 ** DECIMALES_ANNEXE) / 10 ** DECIMALES_ANNEXE;

/**
 * UNE GRILLE DU CABINET · le décret n° 25/21 prévoit l'AJUSTEMENT du SMIG
 * « à partir du mois de janvier de chaque année » (art. 11), par arrêté du
 * Ministre (art. 10), et sa FIXATION par décret (art. 9). Le cabinet saisit
 * le seul taux du manœuvre ordinaire et le texte qui le fonde ; la grille en
 * découle, parce que « la tension salariale en vigueur est appliquée » (art. 6)
 * et que les deux annexes du décret n° 25/22 sont exactement
 * `tension × SMIG / 100` (test de clôture). Les colonnes 19 et 20 suivent les
 * fractions des articles 5 et 6 du décret n° 25/22 (1/27e, puis 1/5e de
 * l'allocation). C'est une LECTURE d'OmegaX, dite dans la réserve · un texte
 * d'ajustement qui publierait sa propre annexe primerait, et une nouvelle
 * tension salariale passe par une mise à jour d'OmegaX.
 */
export function annexeDuCabinet(v: { aPartirDu: string; reference: string; smigJournalierFc: number }): Annexe {
  const smig = v.smigJournalierFc;
  const allocation = arrondiAnnexe(smig / DIVISEUR_ALLOCATION_FAMILIALE);
  return {
    numero: null,
    reference: v.reference,
    duMoisDePaie: v.aPartirDu.slice(0, 7),
    auMoisDePaie: null,
    smigJournalierFc: smig,
    tauxParClasse: TENSIONS.map((t) => arrondiAnnexe((t * smig) / 100)),
    allocationFamilialeJournaliereFc: allocation,
    contreValeurLogementJournaliereFc: arrondiAnnexe(allocation / DIVISEUR_CONTRE_VALEUR_LOGEMENT),
  };
}

export const RESERVE_GRILLE_CABINET =
  "GRILLE SAISIE PAR LE CABINET · OmegaX n'a pas lu ce texte. Le taux du manœuvre ordinaire est celui que le cabinet a déclaré ; les dix-sept classes en sont tirées par la tension salariale du décret n° 25/22 (décret n° 25/21, art. 6), l'allocation familiale et la contre-valeur du logement par les fractions de ses articles 5 et 6.";

/**
 * L'annexe applicable à un mois de paie, ou le motif pour lequel il n'y en a
 * pas. Les grilles du cabinet s'ajoutent aux deux annexes · la plus récente
 * dont le premier mois est atteint l'emporte.
 */
export function annexeApplicable(moisDePaie: string, annexesDossier: readonly Annexe[] = []): Applicable<Annexe> {
  if (!MOIS_VALIDE.test(moisDePaie)) {
    return {
      valeur: null,
      annexe: null,
      refus: 'MOIS_MAL_FORME',
      explication: 'Le mois de paie doit être écrit AAAA-MM.',
    };
  }
  const trouvee = [...ANNEXES, ...annexesDossier]
    .filter((a) => moisDePaie >= a.duMoisDePaie && (a.auMoisDePaie === null || moisDePaie <= a.auMoisDePaie))
    .sort((a, b) => (a.duMoisDePaie < b.duMoisDePaie ? -1 : a.duMoisDePaie > b.duMoisDePaie ? 1 : 0))
    .pop();
  if (!trouvee) {
    return { valeur: null, annexe: null, refus: 'ANTERIEUR_AU_DECRET', explication: REFUS_ANTERIEUR };
  }
  const nom = nomAnnexe(trouvee);
  return {
    valeur: trouvee,
    annexe: trouvee,
    refus: null,
    explication:
      `${nom.charAt(0).toUpperCase()}${nom.slice(1)}, applicable à la paie de ${trouvee.duMoisDePaie}` +
      `${trouvee.auMoisDePaie ? ` à ${trouvee.auMoisDePaie}` : ' et au-delà'}. Manœuvre ordinaire : ` +
      `${trouvee.smigJournalierFc} FC par jour.` +
      (trouvee.numero === null ? ` ${RESERVE_GRILLE_CABINET}` : ''),
  };
}

/**
 * Le taux journalier d'une CLASSE, pour un mois de paie.
 *
 * LA CLASSE, PAS LA CATÉGORIE · une catégorie en porte jusqu'à quatre, et
 * elles ne paient pas la même chose. Servir « la catégorie Maîtrise » sans
 * son échelon reviendrait à choisir un des quatre au hasard.
 */
export function tauxJournalierDeLaClasse(
  classe: number,
  moisDePaie: string,
  annexesDossier: readonly Annexe[] = [],
): Applicable<{ classe: number; tension: number; tauxFc: number; categorie: CategorieProfessionnelle; echelon: string | null; colonne: number }> {
  const a = annexeApplicable(moisDePaie, annexesDossier);
  if (!a.valeur) return { valeur: null, annexe: null, refus: a.refus, explication: a.explication };
  if (!Number.isInteger(classe) || classe < 1 || classe > TENSIONS.length) {
    return {
      valeur: null,
      annexe: a.valeur,
      refus: 'CLASSE_HORS_BAREME',
      explication:
        `La tension salariale des annexes court de la classe 1 (manœuvre ordinaire) à la classe ` +
        `${TENSIONS.length} (cadre de collaboration, 4e échelon). La classe ${classe} n'y figure pas · ` +
        'ce barème ne monte pas au-delà du cadre de collaboration, et rien ne se déduit au-dessus.',
    };
  }
  const categorie = CATEGORIES.find((c) => c.classes.includes(classe))!;
  return {
    valeur: {
      classe,
      tension: TENSIONS[classe - 1],
      tauxFc: a.valeur.tauxParClasse[classe - 1],
      categorie,
      echelon: categorie.echelons[categorie.classes.indexOf(classe)],
      colonne: colonneDeLaClasse(classe),
    },
    annexe: a.valeur,
    refus: null,
    explication: a.explication,
  };
}

/**
 * L'ALLOCATION FAMILIALE MINIMUM · colonne 19, art. 5 du décret n° 25/22.
 *
 * PAR ENFANT À CHARGE, et le montant vient de l'annexe, pas d'une division.
 * L'article 5 désigne la colonne 19 comme la source et la fraction 1/27e
 * comme sa description · c'est la colonne qui fait foi, et elle est arrondie
 * au centime.
 *
 * ART. 13 DU DÉCRET n° 25/21 · le montant est fixé « conformément à la Loi
 * n° 16/009 du 15 juillet 2016 […] telle qu'appliquée par l'article 3 de
 * l'Arrêté ministériel n° 137/CAB/MINETAT/MTEPS/01/2018 du 8 novembre 2018
 * déterminant le montant, les modalités de paiement des allocations
 * familiales et les conditions de suspension ».
 *
 * CORRECTION DU 19/09/2026 · CET ARRÊTÉ EST AU CORPUS, ET IL L'ÉTAIT DÉJÀ.
 * Ce commentaire le déclarait absent · il est dans le skill des cotisations
 * sociales, douze articles, texte intégral. C'est la CINQUIÈME « lacune
 * déclarée à tort » du dépôt, et la même que les quatre autres : le manque
 * avait été vérifié contre le module qu'on écrivait, pas contre le corpus
 * entier. LES CONDITIONS DE SUSPENSION Y SONT, et les voici · l'allocation
 * cesse à l'interruption de l'activité professionnelle, réputée établie par
 * l'interruption des déclarations et versements au compte individuel
 * (art. 5), à compter du premier jour du mois civil suivant, et elle
 * reprend le premier jour du mois civil du versement retrouvé (art. 6) ;
 * elle est due malgré la suspension du contrat pour maladie ou accident,
 * grossesse ou accouchement, incarcération sur plainte de l'employeur,
 * congé et jours fériés légaux (art. 5) ; le droit s'interrompt par enfant
 * en cas d'arrêt de la fréquentation scolaire, de fin d'études avant
 * vingt-cinq ans, de dépassement de vingt-cinq ans sauf enfant invalide,
 * de mariage ou de décès, et peut l'être si l'enfant ne réside plus sur le
 * territoire national (art. 8).
 *
 * CE QUI NE CHANGE PAS · les 8 100 FC de l'article 3 de cet arrêté NE SONT
 * PAS le montant de la colonne 19. Voir `assiettes-paie.ts` : ce sont deux
 * obligations, deux débiteurs, et non deux lectures d'une même règle.
 */
export function allocationFamilialeJournaliere(
  moisDePaie: string,
  nombreEnfants = 1,
  annexesDossier: readonly Annexe[] = [],
): Applicable<{ parEnfantFc: number; totalFc: number; colonne: number }> {
  const a = annexeApplicable(moisDePaie, annexesDossier);
  if (!a.valeur) return { valeur: null, annexe: null, refus: a.refus, explication: a.explication };
  const parEnfant = a.valeur.allocationFamilialeJournaliereFc;
  return {
    valeur: {
      parEnfantFc: parEnfant,
      totalFc: parEnfant * nombreEnfants,
      colonne: COLONNE_ALLOCATIONS_FAMILIALES,
    },
    annexe: a.valeur,
    refus: null,
    explication:
      `Colonne ${COLONNE_ALLOCATIONS_FAMILIALES} de ${nomAnnexe(a.valeur)} : ${parEnfant} FC ` +
      `par jour et PAR ENFANT à charge, soit 1/27e du taux du manœuvre ordinaire ` +
      `(${a.valeur.smigJournalierFc} FC) arrondi au centime. LES CONDITIONS DE SUSPENSION de ` +
      "l'allocation relèvent de l'arrêté ministériel n° 137/CAB/MINETAT/MTEPS/01/2018 que vise l'article 13 " +
      "du décret n° 25/21 · elles sont au corpus, articles 5, 6 et 8. CE MONTANT EST CELUI QUE L'EMPLOYEUR " +
      "DOIT, et il ne se confond pas avec les 8 100 FC par mois de l'article 3 du même arrêté, qui sont une " +
      "prestation SERVIE DIRECTEMENT PAR LA CAISSE (art. 4).",
  };
}

/**
 * LA CONTRE-VALEUR DU LOGEMENT · colonne 20, art. 6 du décret n° 25/22 et
 * art. 14 du décret n° 25/21.
 *
 * ELLE SE CALCULE SUR L'ALLOCATION FAMILIALE, PAS SUR LE SMIG · « 1/5ème du
 * montant journalier des allocations familiales ». La lire « 1/5e du SMIG »
 * donne un montant vingt-sept fois trop élevé.
 *
 * ET CE N'EST PAS UNE INDEMNITÉ · c'est une DÉFALCATION. L'article 15 du
 * décret n° 25/21 ne l'ouvre que « lorsque, POUR CAUSE DE MUTATION,
 * l'employeur assure au travailleur un logement EN NATURE ». Hors ce cas, la
 * retenir serait une retenue sans titre, et l'article 112 du Code du travail
 * ferme la liste des retenues autorisées.
 */
export function contreValeurLogementJournaliere(
  moisDePaie: string,
  annexesDossier: readonly Annexe[] = [],
): Applicable<{ montantFc: number; colonne: number }> {
  const a = annexeApplicable(moisDePaie, annexesDossier);
  if (!a.valeur) return { valeur: null, annexe: null, refus: a.refus, explication: a.explication };
  return {
    valeur: {
      montantFc: a.valeur.contreValeurLogementJournaliereFc,
      colonne: COLONNE_CONTRE_VALEUR_LOGEMENT,
    },
    annexe: a.valeur,
    refus: null,
    explication:
      `Colonne ${COLONNE_CONTRE_VALEUR_LOGEMENT} de ${nomAnnexe(a.valeur)} : ` +
      `${a.valeur.contreValeurLogementJournaliereFc} FC par jour, soit 1/5e de l'allocation ` +
      "familiale journalière. C'est une DÉFALCATION de l'indemnité de logement, et l'article 15 du " +
      "décret n° 25/21 ne l'ouvre que pour cause de MUTATION avec logement en nature.",
  };
}

/**
 * LES MULTIPLICATEURS SONT DANS LE TEXTE, art. 7 du décret n° 25/22.
 *
 * « La valeur hebdomadaire, mensuelle et annuelle du SMIG, de l'allocation
 * familiale minimum et de la contre-valeur du logement s'obtient en
 * multipliant par 6, 26 et 312. »
 *
 * Ils valent pour LES TROIS GRANDEURS, l'article les nomme toutes. Et ils
 * sont FIXES : aucun mois n'a 30 ni 31 jours pour ce calcul, aucune année
 * n'en a 365.
 */
export const MULTIPLICATEURS_ARTICLE_7 = { SEMAINE: 6, MOIS: 26, ANNEE: 312 } as const;
export type PeriodeSmig = keyof typeof MULTIPLICATEURS_ARTICLE_7;

export function valeurPeriodique(montantJournalierFc: number, periode: PeriodeSmig): number {
  return montantJournalierFc * MULTIPLICATEURS_ARTICLE_7[periode];
}

/**
 * LE SMIG HORAIRE N'EXISTE PAS DANS CES TEXTES.
 *
 * L'article 7 donne trois MULTIPLICATEURS et aucun DIVISEUR. Le Guide
 * d'application SYCEBNL évalue pourtant le bénévolat « sur la base du SMIG
 * horaire ». Passer du journalier à l'horaire suppose une durée légale du
 * travail, qui relève du Titre VI du Code du travail et non d'ici.
 */
export const RESERVE_SMIG_HORAIRE =
  "Le décret n° 25/22 fixe un taux JOURNALIER et donne, à son article 7, trois multiplicateurs " +
  '(6, 26, 312) vers la semaine, le mois et l’année. Il ne donne AUCUN taux horaire et aucun ' +
  'diviseur. Déduire un SMIG horaire suppose une durée légale du travail, qui relève du Titre VI ' +
  "du Code du travail et non de ce décret · OmegaX ne fait pas cette division, et le taux horaire " +
  'de valorisation reste une donnée du dossier, à justifier.';

/**
 * CE QUE LES TEXTES DISENT ET QUE LE LOGICIEL NE PORTE PAS ENCORE.
 *
 * Nommé plutôt que tu · une lacune TUE se lit comme une absence de règle.
 */
export const LACUNES_DECLAREES: readonly { objet: string; article: string; consequence: string }[] =
  [
    {
      objet: "L'ARRÊTÉ MINISTÉRIEL n° 137/CAB/MINETAT/MTEPS/01/2018 du 8 novembre 2018",
      article: 'décret n° 25/21, art. 13',
      consequence:
        "Il détermine « le montant, les modalités de paiement des allocations familiales et LES " +
        'CONDITIONS DE SUSPENSION ». Le montant est repris par la colonne 19 des annexes, mais les ' +
        "conditions de suspension ne le sont pas : OmegaX ne sait pas QUAND l'allocation cesse " +
        "d'être due, et il ne le devine pas.",
    },
    {
      objet: 'Le DÉCRET N° 18/017 du 22 mai 2018',
      article: 'décret n° 25/22, art. 11',
      consequence:
        "Il régit les mois de paie antérieurs à mai 2025. Ses montants ne sont pas au corpus · un " +
        'exercice clos avant mai 2025 ne se liquide donc pas ici.',
    },
    {
      objet: "Les SECTEURS AGRO-INDUSTRIELS ET PASTORAUX",
      article: 'décret n° 25/22, art. 10',
      consequence:
        "« Des dispositions spécifiques peuvent être prises pour alléger les difficultés » de ces " +
        "secteurs dans l'application de l'article 3, sous l'article 91 du Code du travail. Ces " +
        "dispositions sont des textes propres au secteur · OmegaX ne les devine pas et applique le " +
        "barème commun tant qu'un dossier ne déclare pas le contraire.",
    },
    {
      objet: "L'ARRÊTÉ ANNUEL D'AJUSTEMENT",
      article: 'décret n° 25/21, art. 10 et 11',
      consequence:
        "L'ajustement se prend par arrêté du Ministre ayant le travail dans ses attributions, « à " +
        'partir du mois de JANVIER de chaque année », sur les travaux de la commission tripartite. ' +
        "Les annexes ci-dessus ne valent donc que jusqu'au prochain arrêté : un dossier qui arrête " +
        'un exercice postérieur doit vérifier qu\'aucun ajustement n\'est intervenu.',
    },
  ];
