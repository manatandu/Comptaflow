/**
 * LE SMIG, LES ALLOCATIONS FAMILIALES MINIMA ET LA CONTRE-VALEUR DU LOGEMENT.
 *
 * SOURCE UNIQUE · décret n° 25/22 du 30 mai 2025 portant fixation du salaire
 * minimum interprofessionnel garanti, des allocations familiales minima et de
 * la contre-valeur du logement. Douze articles. Signé à Kinshasa le 30 mai
 * 2025 par la Première Ministre Judith SUMINWA TULUKA et le Ministre de
 * l'Emploi et Travail Éphraïm AKWAKWA NAMETU. Pris en exécution de l'article
 * 87 du Code du travail. Il entre en vigueur à la date de sa signature
 * (art. 12) et abroge le décret n° 18/017 du 22 mai 2018 (art. 11).
 *
 * CE FICHIER NE CALCULE AUCUN BULLETIN. Il rend ce que le texte fixe, et il
 * REFUSE ce que le texte ne fixe pas. Le moteur de rémunération est de P2.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUE TOUT LE MONDE MANQUE, ET QUE LE TEXTE POSE EN DEUX
 * ARTICLES SÉPARÉS.
 *
 * ART. 2 · « Le taux journalier du Salaire Minimum Interprofessionnel Garanti
 * est fixé à 21 500 Francs Congolais pour le travailleur manœuvre ordinaire. »
 *
 * ART. 3 · « Le taux journalier du Salaire Minimum Interprofessionnel Garanti
 * fixé à l'article 2 du présent décret EST PAYÉ : à partir de la paie du mois
 * de mai 2025, à 14 500 Francs Congolais ; à partir de la paie du mois de
 * janvier 2026, à 21 500 Francs Congolais. »
 *
 * LE SMIG EST DE 21 500 FC DEPUIS LE 30 MAI 2025. Il n'est pas « passé de
 * 14 500 à 21 500 ». Ce que l'article 3 échelonne est son PAIEMENT, pas son
 * montant. La presse et les commentaires lisent presque tous « le SMIG passe
 * à 21 500 en janvier 2026 » · le texte dit autre chose, et la différence
 * n'est pas d'école : tout ce qui se calcule SUR le SMIG (le plancher
 * d'assiette CNSS, la quotité saisissable, les allocations familiales) se
 * calcule sur 21 500 dès mai 2025, quand bien même la paie versée est
 * échelonnée. Confondre les deux minore une assiette pendant huit mois.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Le taux journalier du SMIG, article 2. En francs congolais. */
export const SMIG_JOURNALIER_FC = 21_500;

/** Le décret que ce fichier transcrit, et rien d'autre. */
export const DECRET_SMIG = {
  reference: 'Décret n° 25/22 du 30 mai 2025',
  objet:
    'portant fixation du salaire minimum interprofessionnel garanti, des allocations familiales minima et de la contre-valeur du logement',
  signeLe: '2025-05-30',
  entreEnVigueurLe: '2025-05-30',
  /** Art. 12 · « qui entre en vigueur à la date de sa signature ». */
  formuleEntreeEnVigueur: 'qui entre en vigueur à la date de sa signature',
  /** Art. 11. */
  abroge: 'Décret n° 18/017 du 22 mai 2018',
  fondement: 'Code du travail, article 87',
} as const;

export interface PalierDePaiement {
  /** Le premier mois de PAIE concerné, au format AAAA-MM. */
  aPartirDeLaPaieDe: string;
  montantJournalierFc: number;
}

/**
 * L'échelonnement du PAIEMENT, article 3. Deux paliers, et le texte n'en
 * prévoit pas de troisième.
 */
export const PALIERS_DE_PAIEMENT: readonly PalierDePaiement[] = [
  { aPartirDeLaPaieDe: '2025-05', montantJournalierFc: 14_500 },
  { aPartirDeLaPaieDe: '2026-01', montantJournalierFc: 21_500 },
];

export type MotifRefusSmig = 'MOIS_MAL_FORME' | 'ANTERIEUR_AU_DECRET';

export interface MontantPayable {
  montantJournalierFc: number | null;
  /** Le palier appliqué, ou null si le mois est hors du champ du décret. */
  palier: PalierDePaiement | null;
  refus: MotifRefusSmig | null;
  explication: string;
}

/**
 * Le montant journalier À PAYER pour un mois de paie donné.
 *
 * AVANT LA PAIE DE MAI 2025, ON NE REND RIEN. Le décret abroge celui de 2018
 * mais ne le reproduit pas · reconstituer l'ancien montant de mémoire serait
 * exactement la faute que le dépôt s'interdit. Un exercice antérieur se
 * liquide sur le décret n° 18/017, qui n'est pas au corpus.
 */
export function montantJournalierPayable(moisDePaie: string): MontantPayable {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(moisDePaie)) {
    return {
      montantJournalierFc: null,
      palier: null,
      refus: 'MOIS_MAL_FORME',
      explication: 'Le mois de paie doit être écrit AAAA-MM.',
    };
  }
  // Les paliers sont ordonnés · on retient le dernier dont le mois est atteint.
  let retenu: PalierDePaiement | null = null;
  for (const p of PALIERS_DE_PAIEMENT) {
    if (moisDePaie >= p.aPartirDeLaPaieDe) retenu = p;
  }
  if (!retenu) {
    return {
      montantJournalierFc: null,
      palier: null,
      refus: 'ANTERIEUR_AU_DECRET',
      explication:
        "Ce mois de paie est antérieur à mai 2025, premier palier de l'article 3 du décret n° 25/22. " +
        "Le décret n° 18/017 du 22 mai 2018 régissait alors ; il est abrogé par l'article 11 et " +
        "n'est PAS au corpus d'OmegaX · son montant n'est pas reconstitué ici.",
    };
  }
  return {
    montantJournalierFc: retenu.montantJournalierFc,
    palier: retenu,
    refus: null,
    explication:
      `Article 3 du décret n° 25/22 : à partir de la paie du mois de ${retenu.aPartirDeLaPaieDe}, ` +
      `${retenu.montantJournalierFc} FC par jour. RAPPEL · le SMIG lui-même est fixé à ` +
      `${SMIG_JOURNALIER_FC} FC par l'article 2 depuis le 30 mai 2025 · l'article 3 échelonne son ` +
      "PAIEMENT, pas son montant.",
  };
}

/**
 * LES MULTIPLICATEURS SONT DANS LE TEXTE, article 7.
 *
 * « La valeur hebdomadaire, mensuelle et annuelle du Salaire Minimum
 * Interprofessionnel Garanti, de l'allocation familiale minimum et de la
 * contre-valeur du logement s'obtient en multipliant par 6, 26 et 312. »
 *
 * ILS S'APPLIQUENT AUX TROIS GRANDEURS, pas au seul SMIG · l'article les
 * nomme toutes les trois. Et ils sont FIXES : 6 jours par semaine, 26 par
 * mois, 312 par an, quel que soit le calendrier. Aucun mois n'a 30 ni 31
 * jours pour ce calcul, et aucune année n'en a 365.
 */
export const MULTIPLICATEURS_ARTICLE_7 = { SEMAINE: 6, MOIS: 26, ANNEE: 312 } as const;
export type PeriodeSmig = keyof typeof MULTIPLICATEURS_ARTICLE_7;

export function valeurPeriodique(montantJournalierFc: number, periode: PeriodeSmig): number {
  return montantJournalierFc * MULTIPLICATEURS_ARTICLE_7[periode];
}

/**
 * LE SMIG HORAIRE N'EXISTE PAS DANS CE DÉCRET.
 *
 * L'article 7 donne trois multiplicateurs, et aucun DIVISEUR. Le Guide
 * d'application SYCEBNL évalue pourtant le bénévolat « sur la base du SMIG
 * horaire » (Partie 3 ch. 6, App. 20). Passer du journalier à l'horaire
 * suppose une durée légale du travail, qui est ailleurs (Code du travail,
 * Titre VI) et qui n'est pas dans ce texte.
 *
 * OmegaX ne fait donc PAS cette division. Le taux horaire de valorisation
 * reste saisi et justifié par le dossier, comme il l'était déjà.
 */
export const RESERVE_SMIG_HORAIRE =
  "Le décret n° 25/22 fixe un taux JOURNALIER et donne, à son article 7, trois multiplicateurs " +
  '(6, 26, 312) vers la semaine, le mois et l’année. Il ne donne AUCUN taux horaire et aucun ' +
  'diviseur. Déduire un SMIG horaire suppose une durée légale du travail, qui relève du Titre VI ' +
  "du Code du travail et non de ce décret · OmegaX ne fait pas cette division, et le taux horaire " +
  'de valorisation reste une donnée du dossier, à justifier.';

export interface MontantDerive {
  montantFc: number;
  /** Faux quand la division ne tombe pas juste · voir la réserve. */
  exact: boolean;
  article: string;
  formule: string;
  reserve: string | null;
}

/**
 * L'ALLOCATION FAMILIALE MINIMUM, PAR ENFANT ET PAR JOUR · article 5.
 *
 * « Le montant journalier des allocations familiales par enfant, fixé à la
 * colonne 19 du tableau en annexe au présent Décret, est égal à 1/27ème par
 * enfant de celui du Salaire Minimum Interprofessionnel Garanti du manœuvre
 * ordinaire. »
 *
 * DEUX SOURCES DANS UNE SEULE PHRASE, ET ELLES NE SONT PAS ÉQUIVALENTES.
 * L'annexe FIXE le montant ; la fraction 1/27 le DÉCRIT. Tant que l'annexe
 * n'est pas au corpus, la fraction est ce qu'on a de mieux · elle n'est pas
 * le texte de référence pour autant, et 21 500 / 27 ne tombe pas juste
 * (796,296…). Le décret ne prescrit AUCUN arrondi. OmegaX rend donc la
 * valeur non arrondie et le DIT · arrondir en silence produirait, sur douze
 * mois et plusieurs enfants, un écart que personne ne saurait expliquer.
 */
export const DIVISEUR_ALLOCATION_FAMILIALE = 27;

export function allocationFamilialeJournaliere(
  smigJournalierFc: number,
  nombreEnfants = 1,
): MontantDerive {
  const parEnfant = smigJournalierFc / DIVISEUR_ALLOCATION_FAMILIALE;
  const exact = Number.isInteger(parEnfant);
  return {
    montantFc: parEnfant * nombreEnfants,
    exact,
    article: 'art. 5',
    formule: '1/27e du SMIG journalier du manœuvre ordinaire, par enfant',
    reserve: exact
      ? null
      : "LE MONTANT DE RÉFÉRENCE EST CELUI DE LA COLONNE 19 DU TABLEAU EN ANNEXE au décret, que " +
        "l'article 5 désigne comme la source ; la fraction 1/27e en est la description. Cette annexe " +
        "n'est PAS au corpus d'OmegaX. La division ne tombe pas juste et le décret ne prescrit aucun " +
        'arrondi : la valeur ci-dessus est rendue NON ARRONDIE, et c’est à la colonne 19 qu’il faut ' +
        'la confronter avant tout versement.',
  };
}

/**
 * LA CONTRE-VALEUR DU LOGEMENT · article 6.
 *
 * « Conformément au Décret n° 25/21 du 30 mai 2025 susvisé, le montant
 * journalier de la quotité saisissable par l'employeur au titre de
 * contre-valeur du logement équivaut à 1/5ème du taux journalier des
 * allocations familiales. »
 *
 * ELLE SE CALCULE SUR L'ALLOCATION FAMILIALE, PAS SUR LE SMIG. C'est le piège
 * du chaînage : 1/5 de 1/27 du SMIG, et non 1/5 du SMIG. L'écart est d'un
 * facteur 27.
 *
 * ET ELLE RENVOIE À UN SECOND DÉCRET DU MÊME JOUR, le n° 25/21, « déterminant
 * les modalités de fixation et d'ajustement » des trois grandeurs. Il n'est
 * pas au corpus · ce que l'article 6 en tire est repris tel quel, et rien de
 * plus n'en est déduit.
 */
export const DIVISEUR_CONTRE_VALEUR_LOGEMENT = 5;

export function contreValeurLogementJournaliere(
  allocationFamilialeJournaliereFc: number,
): MontantDerive {
  const montant = allocationFamilialeJournaliereFc / DIVISEUR_CONTRE_VALEUR_LOGEMENT;
  return {
    montantFc: montant,
    exact: Number.isInteger(montant),
    article: 'art. 6',
    formule: "1/5e du taux journalier des ALLOCATIONS FAMILIALES (et non du SMIG)",
    reserve:
      "L'article 6 renvoie au décret n° 25/21 du 30 mai 2025, qui détermine les modalités de " +
      "fixation et d'ajustement et n'est PAS au corpus d'OmegaX. La base est l'allocation " +
      'familiale journalière, non le SMIG : la confusion des deux donne un montant vingt-sept fois ' +
      'trop élevé.',
  };
}

/**
 * CE QUE LE DÉCRET DIT ET QUE LE LOGICIEL NE PORTE PAS ENCORE.
 *
 * Nommé plutôt que tu · une lacune déclarée à tort est aussi fausse qu'une
 * règle inventée, et une lacune TUE se lit comme une absence de règle.
 */
export const LACUNES_DECLAREES: readonly { objet: string; article: string; consequence: string }[] =
  [
    {
      objet: "L'ANNEXE du décret, et sa colonne 19",
      article: 'art. 5',
      consequence:
        "C'est elle qui FIXE le montant journalier des allocations familiales par enfant. La " +
        'fraction 1/27e la décrit ; elle ne la remplace pas. Le tableau en annexe porte aussi la ' +
        "grille de TENSION SALARIALE que l'article 4 applique « du travailleur manœuvre ordinaire " +
        "au cadre de collaboration » · sans elle, aucune catégorie au-dessus du manœuvre ordinaire " +
        'ne se chiffre.',
    },
    {
      objet: 'Le DÉCRET N° 25/21 du 30 mai 2025',
      article: 'art. 6 et visa',
      consequence:
        "Il détermine « les modalités de fixation et d'ajustement » du SMIG, des allocations " +
        'familiales minima et de la contre-valeur du logement. Le décret n° 25/22 en tire la ' +
        "règle du 1/5e ; tout le reste de ses modalités reste inconnu d'OmegaX.",
    },
    {
      objet: 'Le DÉCRET N° 18/017 du 22 mai 2018',
      article: 'art. 11',
      consequence:
        "Abrogé, mais il régissait les exercices antérieurs à mai 2025. Ses montants ne sont pas " +
        'au corpus et ne sont pas reconstitués · un exercice clos avant mai 2025 ne se liquide ' +
        'donc pas ici.',
    },
    {
      objet: "Les SECTEURS AGRO-INDUSTRIELS ET PASTORAUX",
      article: 'art. 10',
      consequence:
        "« Des dispositions spécifiques peuvent être prises pour alléger les difficultés » de ces " +
        "secteurs dans l'application de l'article 3, conformément à l'article 91 du Code du " +
        'travail. Ces dispositions sont des textes à venir ou propres au secteur · OmegaX ne les ' +
        "devine pas et applique le barème commun tant qu'un dossier ne déclare pas le contraire.",
    },
  ];
