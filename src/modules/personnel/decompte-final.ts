/**
 * LE DÉCOMPTE FINAL · P4. Préavis, congé, gratification et prorata.
 *
 * SOURCE · Code du travail (loi n° 015/2002), lu verbatim. Le séminaire CPCC
 * « Calcul et comptabilisation du décompte final » donne la seule MÉTHODE
 * complète du corpus, et le journal de P0 le disait déjà : c'est le meilleur
 * document de méthode du dépôt ET le plus daté. Il porte lui-même la règle qui
 * sauve · « en cas de désaccord entre ce fichier et un article du Code,
 * L'ARTICLE PRIME ».
 *
 * LA CONFRONTATION A ÉTÉ FAITE, ET LE SÉMINAIRE SE TROMPE TROIS FOIS SUR LE
 * CONGÉ, TOUJOURS DANS LE MÊME SENS · IL GONFLE.
 *
 *   ARTICLE 141, verbatim · « La durée du congé est d'au moins UN JOUR
 *   OUVRABLE par mois entier de service pour le travailleur âgé de PLUS DE
 *   DIX-HUIT ANS. Elle est d'au moins UN JOUR OUVRABLE ET DEMI par mois entier
 *   de service pour le travailleur âgé de MOINS DE DIX-HUIT ANS. Elle augmente
 *   d'UN JOUR OUVRABLE par tranche de cinq années d'ancienneté. »
 *
 *   Le séminaire écrit 1,5 jour pour le MAJEUR (soit 18 jours l'an), 2 jours
 *   pour le MINEUR, et 2 jours par tranche de cinq ans. Il a DÉCALÉ D'UN CRAN :
 *   la règle des mineurs est servie aux majeurs, et celle des mineurs est
 *   inventée. Une indemnité compensatrice calculée ainsi est de CINQUANTE POUR
 *   CENT trop élevée.
 *
 * ET LE BARÈME DE PRÉAVIS PAR CATÉGORIE DU SÉMINAIRE N'EST PAS DANS LE CODE.
 * L'article 64 pose QUATORZE JOURS OUVRABLES plus SEPT par année entière, sans
 * aucune catégorie, et renvoie le reste à un ARRÊTÉ du Ministre qui n'est pas
 * au corpus. Le « 1 mois + 9 jours » de la maîtrise et le « 3 mois + 16 jours »
 * des cadres viennent de là. OmegaX calcule le PLANCHER du Code et le DIT ·
 * l'appliquer à un cadre SOUS-ESTIMERAIT son préavis, et c'est le travailleur
 * qui paierait.
 *
 * ────────────────────────────────────────────────────────────────────────
 * « JOUR OUVRABLE » · LA MÊME QUESTION QU'AU 18/09, ET LA RÉPONSE EST INVERSE.
 *
 * Le dépôt a appris ce jour-là que « quand la loi emprunte un mot qu'elle ne
 * définit pas, la question n'est pas QUELLE SOURCE le définit mais DEVANT QUI
 * l'obligation s'exécute ». Une échéance fiscale s'exécute à un GUICHET, d'où
 * le décret n° 24/09 et le samedi NON ouvrable.
 *
 * UN PRÉAVIS S'EXÉCUTE ENTRE L'EMPLOYEUR ET LE TRAVAILLEUR, et le Code du
 * travail définit le mot lui-même, article 7, point 9 · « chaque jour de la
 * semaine à l'exception du jour de repos hebdomadaire et des jours fériés
 * légaux ». Le repos hebdomadaire a lieu le dimanche (art. 121, al. 2). LE
 * SAMEDI EST DONC OUVRABLE ICI, et `jour-ouvrable.ts` du module des retenues
 * NE DOIT PAS être réemployé · il répond à une autre question.
 *
 * ET L'ARITHMÉTIQUE LE CONFIRME PAR UN AUTRE CHEMIN · l'article 7 du décret
 * n° 25/22 convertit le taux journalier en mensuel par VINGT-SIX, ce qui fait
 * six jours par semaine. Vingt-six et « samedi ouvrable » disent la même chose.
 * ────────────────────────────────────────────────────────────────────────
 */

import { MULTIPLICATEURS_ARTICLE_7 } from './bareme-smig';

/** Article 64 · « ne peut être inférieure à quatorze jours ouvrables ». */
export const PREAVIS_PLANCHER_JOURS = 14;
/** Article 64 · « augmenté de sept jours ouvrables par année entière ». */
export const PREAVIS_PAR_ANNEE_JOURS = 7;
/** Article 258 · le préavis du délégué syndical est « le double ». */
export const PREAVIS_DELEGUE_MULTIPLICATEUR = 2;
/** Article 258 · « sans pouvoir être inférieure à trois mois ». */
export const PREAVIS_DELEGUE_PLANCHER_MOIS = 3;

/** Article 141 · un jour ouvrable par mois entier, travailleur de plus de 18 ans. */
export const CONGE_JOURS_PAR_MOIS_MAJEUR = 1;
/** Article 141 · un jour ouvrable ET DEMI pour le travailleur de moins de 18 ans. */
export const CONGE_JOURS_PAR_MOIS_MINEUR = 1.5;
/** Article 141 · « augmente d'un jour ouvrable par tranche de cinq années ». */
export const CONGE_AJOUT_PAR_TRANCHE_JOURS = 1;
export const CONGE_TRANCHE_ANNEES = 5;

/** Articles 100 et 145, alinéa 2 · « dans les deux jours ouvrables ». */
export const DELAI_PAIEMENT_JOURS_OUVRABLES = 2;

/** Articles 66 et 142 · moyenne « des douze mois précédents ». */
export const MOIS_DE_MOYENNE = 12;

/**
 * Le diviseur du prorata. Ce n'est PAS une constante inventée pour l'occasion ·
 * c'est le multiplicateur ANNÉE de l'article 7 du décret n° 25/22, déjà lu et
 * déjà codé. Le réécrire ici en ferait un second chiffre à maintenir.
 */
export const DIVISEUR_ANNUEL = MULTIPLICATEURS_ARTICLE_7.ANNEE;

export type InitiativeRupture = 'EMPLOYEUR' | 'TRAVAILLEUR';

export type MotifRupture =
  | 'LICENCIEMENT'
  | 'DEMISSION'
  | 'FAUTE_LOURDE'
  | 'FORCE_MAJEURE'
  | 'TERME_DU_CDD'
  | 'COMMUN_ACCORD';

export type VerdictPreavis = {
  /** `null` lorsque aucun préavis n'est dû. */
  readonly joursOuvrables: number | null;
  readonly motifAucunPreavis: string | null;
  readonly reserves: readonly string[];
};

/**
 * LE PRÉAVIS LÉGAL, ARTICLE 64, ET C'EST UN PLANCHER.
 *
 * « SAUF DURÉE PLUS LONGUE fixée par les parties ou par la convention
 * collective » ouvre l'article, et « ne peut être INFÉRIEURE À » le referme.
 * Ce que rend cette fonction est donc le MINIMUM opposable, jamais la durée
 * due. La réserve le dit sur chaque verdict plutôt qu'une fois dans un coin.
 *
 * TROIS CAS OÙ AUCUN PRÉAVIS N'EST DÛ, et chacun est lu au texte · la FAUTE
 * LOURDE (art. 72, « tout contrat de travail peut être résilié immédiatement
 * sans préavis »), la FORCE MAJEURE, et le TERME D'UN CDD, qui s'éteint de
 * plein droit. OmegaX ne QUALIFIE aucun des trois · le motif est déclaré.
 */
export function preavisLegal(params: {
  anneesAnciennete: number;
  initiative: InitiativeRupture;
  motif: MotifRupture;
  delegueSyndical?: boolean;
}): VerdictPreavis {
  const reserves: string[] = [];

  if (params.motif === 'FAUTE_LOURDE') {
    return {
      joursOuvrables: null,
      motifAucunPreavis:
        "Article 72 · « Tout contrat de travail peut être résilié immédiatement sans préavis, pour faute lourde. » La qualification de faute lourde appartient au dossier, et l'article l'enferme dans une notification écrite dans les quinze jours ouvrables de la connaissance des faits.",
      reserves,
    };
  }
  if (params.motif === 'FORCE_MAJEURE') {
    return {
      joursOuvrables: null,
      motifAucunPreavis: "La force majeure dispense du préavis. Sa constatation appartient au dossier.",
      reserves,
    };
  }
  if (params.motif === 'TERME_DU_CDD') {
    return {
      joursOuvrables: null,
      motifAucunPreavis:
        "Le contrat à durée déterminée s'éteint de plein droit à l'arrivée du terme · il n'y a pas de résiliation à notifier, donc pas de préavis.",
      reserves,
    };
  }

  const annees = Math.max(0, Math.floor(params.anneesAnciennete));
  let jours = PREAVIS_PLANCHER_JOURS + PREAVIS_PAR_ANNEE_JOURS * annees;

  reserves.push(
    "PLANCHER, JAMAIS DURÉE DUE · l'article 64 s'ouvre par « sauf durée plus longue fixée par les parties ou par la convention collective » et se referme par « ne peut être inférieure à ». " +
      "Et son dernier alinéa renvoie à un ARRÊTÉ du Ministre du Travail, qui n'est PAS au corpus · c'est de lui que viennent les barèmes par catégorie (maîtrise, cadres) que la pratique applique. Vérifier la convention du dossier avant d'opposer ce chiffre.",
  );
  reserves.push(
    "JOURS OUVRABLES AU SENS DU CODE DU TRAVAIL, article 7, point 9 · « chaque jour de la semaine à l'exception du jour de repos hebdomadaire et des jours fériés légaux », le repos ayant lieu le dimanche (art. 121, al. 2). LE SAMEDI EST OUVRABLE. La règle des échéances fiscales, qui écarte le samedi, répond à une autre question · elle vise un guichet de l'Administration.",
  );

  if (params.delegueSyndical) {
    jours *= PREAVIS_DELEGUE_MULTIPLICATEUR;
    reserves.push(
      `ARTICLE 258 · « la durée du préavis à observer en cas de licenciement d'un délégué titulaire ou suppléant est LE DOUBLE de la période applicable en vertu de l'article 64, SANS POUVOIR ÊTRE INFÉRIEURE À TROIS MOIS ». Le doublement est appliqué. LE PLANCHER DE TROIS MOIS NE L'EST PAS · le texte l'exprime en MOIS et le préavis en JOURS OUVRABLES, et aucune source lue ne convertit les uns dans les autres. Confronter ${jours} jours ouvrables à ${PREAVIS_DELEGUE_PLANCHER_MOIS} mois relève du dossier.`,
    );
  }

  if (params.initiative === 'TRAVAILLEUR') {
    // Article 64, alinéa 2 · la MOITIÉ, et jamais davantage.
    jours = jours / 2;
    reserves.push(
      "ARTICLE 64, ALINÉA 2 · « La durée du préavis à donner par le travailleur est égale à LA MOITIÉ de celui qu'aurait dû remettre l'employeur. Elle ne peut en aucun cas excéder cette limite. »",
    );
  }

  return { joursOuvrables: jours, motifAucunPreavis: null, reserves };
}

export type VerdictConge = {
  readonly joursOuvrables: number;
  readonly joursDeBase: number;
  readonly joursDAnciennete: number;
  readonly reserves: readonly string[];
};

/**
 * LE CONGÉ LÉGAL, ARTICLE 141, ET C'EST UN PLANCHER AUSSI · « AU MOINS ».
 *
 * L'âge commande le taux, et dans le sens qu'on n'attend pas · c'est le
 * travailleur de MOINS de dix-huit ans qui a le taux le PLUS ÉLEVÉ (un jour et
 * demi contre un). Le séminaire CPCC inverse la lecture.
 */
export function congeLegal(params: {
  moisEntiersDeService: number;
  moinsDeDixHuitAns: boolean;
  anneesAnciennete: number;
}): VerdictConge {
  const mois = Math.max(0, params.moisEntiersDeService);
  const parMois = params.moinsDeDixHuitAns
    ? CONGE_JOURS_PAR_MOIS_MINEUR
    : CONGE_JOURS_PAR_MOIS_MAJEUR;
  const joursDeBase = mois * parMois;

  const tranches = Math.floor(Math.max(0, params.anneesAnciennete) / CONGE_TRANCHE_ANNEES);
  const joursDAnciennete = tranches * CONGE_AJOUT_PAR_TRANCHE_JOURS;

  const reserves = [
    "ARTICLE 141 · « au moins UN jour ouvrable par mois entier de service pour le travailleur âgé de PLUS de dix-huit ans », « au moins UN jour ouvrable ET DEMI » pour celui de MOINS de dix-huit ans, et « augmente d'UN jour ouvrable par tranche de cinq années d'ancienneté ». C'est un PLANCHER · une convention collective plus favorable prime.",
    "LE SÉMINAIRE CPCC PORTE 1,5 JOUR POUR LE MAJEUR, 2 POUR LE MINEUR ET 2 PAR TRANCHE DE CINQ ANS · il a décalé d'un cran, et une indemnité calculée ainsi est de cinquante pour cent trop élevée. Le fichier porte lui-même la règle : en cas de désaccord, l'article prime.",
    "ARTICLE 141, ALINÉA 2 · les services pris en compte comprennent les jours de repos hebdomadaire, de congé payé et les jours fériés, ainsi que l'incapacité de travail jusqu'à six mois par année, sans cette limite pour un accident du travail ou une maladie professionnelle. OmegaX ne recompose pas ce décompte · les mois entiers de service sont SAISIS.",
  ];

  return {
    joursOuvrables: joursDeBase + joursDAnciennete,
    joursDeBase,
    joursDAnciennete,
    reserves,
  };
}

/**
 * LE PRORATA DU SÉMINAIRE, ET IL EST JUSTE · « × jours / 312 ».
 *
 * Le 312 n'est pas une convention du séminaire : c'est le multiplicateur ANNÉE
 * de l'article 7 du décret n° 25/22, qui convertit un taux journalier en taux
 * annuel. Ce prorata est donc le SEUL élément chiffré du séminaire que la
 * confrontation confirme.
 */
export const prorataAnnuel = (montantAnnuelFc: number, joursPrestes: number): number =>
  (Math.max(0, montantAnnuelFc) * Math.max(0, joursPrestes)) / DIVISEUR_ANNUEL;

export type RubriqueDecompte = {
  readonly cle: string;
  readonly libelle: string;
  readonly montantFc: number | null;
  readonly fondement: string;
  readonly reserve: string | null;
};

export type VerdictDecompteFinal = {
  readonly preavis: VerdictPreavis;
  readonly conge: VerdictConge;
  readonly rubriques: readonly RubriqueDecompte[];
  /** `null` dès qu'une rubrique est indéterminée · un solde partiel se lit comme un solde. */
  readonly totalBrutFc: number | null;
  readonly echeancePaiement: string;
  readonly reserves: readonly string[];
};

/**
 * LE DÉCOMPTE FINAL, ET CE QU'IL NE CHIFFRE PAS.
 *
 * QUATRE RUBRIQUES SONT RENDUES `null` PLUTÔT QUE ZÉRO, et la distinction
 * décide de tout · un zéro se lit comme « rien n'est dû », un `null` comme
 * « personne n'a encore répondu ». Le TOTAL devient alors `null` lui aussi ·
 * un solde de tout compte partiel se lit comme un solde de tout compte, et le
 * travailleur signe pour ce qui est écrit.
 *
 * LA GRATIFICATION N'EST PAS LÉGALE · l'article 7, point 8 la range parmi les
 * éléments de la rémunération « lorsqu'elle est versée », et aucun article n'en
 * impose le versement. Elle est SAISIE, et son absence n'est pas un manque.
 *
 * LES COMMISSIONS, PRIMES ET PARTICIPATIONS SE PRENNENT EN MOYENNE · articles
 * 66 et 142, « calculés sur la moyenne de ces éléments payés pour les DOUZE
 * MOIS précédents ». Prendre le dernier mois donnerait un chiffre plausible et
 * faux, dans un sens ou dans l'autre.
 */
export function decompteFinal(params: {
  anneesAnciennete: number;
  moisEntiersDeService: number;
  moinsDeDixHuitAns: boolean;
  initiative: InitiativeRupture;
  motif: MotifRupture;
  delegueSyndical?: boolean;
  /** Taux journalier de la rémunération, tel que le contrat le porte. */
  remunerationJournaliereFc: number | null;
  /** Arriérés de salaire et jours prestés non payés · saisis. */
  arrieresFc?: number | null;
  /** Moyenne des douze mois des commissions, primes et participations · saisie. */
  moyenneDouzeMoisFc?: number | null;
  /** Gratification due, si l'entité en paie · saisie. */
  gratificationFc?: number | null;
}): VerdictDecompteFinal {
  const preavis = preavisLegal(params);
  const conge = congeLegal(params);
  const rubriques: RubriqueDecompte[] = [];
  const jour = params.remunerationJournaliereFc;

  const indetermine = (cle: string, libelle: string, fondement: string, reserve: string) =>
    rubriques.push({ cle, libelle, montantFc: null, fondement, reserve });

  // 1 · Arriérés.
  rubriques.push({
    cle: 'arrieres',
    libelle: 'Arriérés de rémunération et jours prestés non payés',
    montantFc: params.arrieresFc ?? null,
    fondement: "Article 100 · « toute somme restant due en exécution d'un contrat de travail ».",
    reserve:
      params.arrieresFc === undefined || params.arrieresFc === null
        ? "Aucun livre ne porte ce qui reste dû à la date de cessation · le montant est saisi."
        : null,
  });

  // 2 · Indemnité de préavis.
  if (preavis.joursOuvrables === null) {
    rubriques.push({
      cle: 'preavis',
      libelle: 'Indemnité compensatrice de préavis',
      montantFc: 0,
      fondement: preavis.motifAucunPreavis as string,
      reserve: null,
    });
  } else if (jour === null || jour === undefined) {
    indetermine(
      'preavis',
      'Indemnité compensatrice de préavis',
      `Article 64 · ${preavis.joursOuvrables} jours ouvrables.`,
      "Le taux journalier du contrat n'est pas renseigné.",
    );
  } else {
    rubriques.push({
      cle: 'preavis',
      libelle: 'Indemnité compensatrice de préavis',
      montantFc: jour * preavis.joursOuvrables,
      fondement: `Article 64 · ${preavis.joursOuvrables} jours ouvrables au taux journalier.`,
      reserve:
        "PLANCHER · l'arrêté de l'article 64, dernier alinéa, n'est pas au corpus, et une convention collective peut allonger le délai.",
    });
  }

  // 3 · Indemnité compensatrice de congé.
  if (jour === null || jour === undefined) {
    indetermine(
      'conge',
      'Indemnité compensatrice de congé',
      `Articles 141, 142 et 144 · ${conge.joursOuvrables} jours ouvrables.`,
      "Le taux journalier du contrat n'est pas renseigné.",
    );
  } else {
    rubriques.push({
      cle: 'conge',
      libelle: 'Indemnité compensatrice de congé',
      montantFc: jour * conge.joursOuvrables,
      fondement: `Article 144 · « en cas de résiliation du contrat, QUEL QUE SOIT LE MOMENT où celle-ci intervient, le congé est remplacé par une indemnité compensatrice calculée conformément à l'article 142 ». ${conge.joursOuvrables} jours ouvrables.`,
      reserve:
        "ARTICLE 142 · les avantages remis EN NATURE sont payés en espèces à la demande du travailleur, « EXCEPTION FAITE SEULEMENT POUR LE LOGEMENT ». Le séminaire CPCC porte au contraire une « indemnité congé / logement » · le logement EN NATURE n'entre pas dans la conversion, une indemnité de logement en ESPÈCES est de la rémunération et y entre. La distinction appartient au contrat.",
    });
  }

  // 4 · Moyenne des douze mois.
  rubriques.push({
    cle: 'moyenne-douze-mois',
    libelle: 'Commissions, primes, prestations supplémentaires et participations',
    montantFc: params.moyenneDouzeMoisFc ?? null,
    fondement:
      "Articles 66 et 142 · « calculés sur la MOYENNE de ces éléments payés pour les DOUZE MOIS précédents ».",
    reserve:
      params.moyenneDouzeMoisFc === undefined || params.moyenneDouzeMoisFc === null
        ? "La moyenne se prend sur douze mois de paie qu'OmegaX ne détient pas · elle est saisie. Prendre le dernier mois donnerait un chiffre plausible et faux."
        : null,
  });

  // 5 · Gratification.
  rubriques.push({
    cle: 'gratification',
    libelle: 'Gratification',
    montantFc: params.gratificationFc ?? null,
    fondement:
      "Article 7, point 8 · les sommes versées à titre de gratification sont des éléments de la rémunération. AUCUN article n'en impose le versement.",
    reserve:
      params.gratificationFc === undefined || params.gratificationFc === null
        ? "La gratification n'est pas légale · son absence n'est pas un manque, et OmegaX ne la présume ni due ni nulle."
        : null,
  });

  const aUneIndeterminee = rubriques.some((r) => r.montantFc === null);
  const totalBrutFc = aUneIndeterminee
    ? null
    : rubriques.reduce((n, r) => n + (r.montantFc as number), 0);

  return {
    preavis,
    conge,
    rubriques,
    totalBrutFc,
    echeancePaiement: `Articles 100 et 145, alinéa 2 · au plus tard dans les ${DELAI_PAIEMENT_JOURS_OUVRABLES} JOURS OUVRABLES qui suivent la cessation des services.`,
    reserves: [
      "UN SOLDE PARTIEL SE LIT COMME UN SOLDE · dès qu'une rubrique est indéterminée, le total l'est aussi. Le travailleur signe pour ce qui est écrit.",
      "LE DÉCOMPTE FINAL N'EST PAS DÉFINI PAR LE CODE · c'est un usage professionnel, et son fondement est l'article 100, qui n'en donne ni la liste ni la forme.",
      "LES RETENUES NE SONT PAS APPLIQUÉES ICI · l'assiette sociale, l'assiette fiscale et le barème de l'article 118 valent pour le décompte comme pour un mois ordinaire, et ils vivent dans `assiettes-paie.ts` et `bareme-irpp.ts`. Le séminaire CPCC y porte l'IPR à 10 %, ABROGÉ au 1er janvier 2026, et une retenue « syndicat 2 % » qu'AUCUN article ne fonde · l'article 112 énumère les retenues autorisées et ne la nomme pas.",
      ...preavis.reserves,
      ...conge.reserves,
    ],
  };
}
