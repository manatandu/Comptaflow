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
import { DECOMPTE_A_LA_RUPTURE, SANCTION_ARTICLE_103 } from './livre-de-paie';
// SEUL `jourFerie` est repris du module des retenues · la liste des dix jours
// fériés de l'ordonnance n° 23-042 vaut pour tout « jour ouvrable » du Code
// (art. 7, point 9). Son `estJourOuvrable`, lui, écarte le samedi du guichet
// fiscal et NE S'APPLIQUE PAS à un préavis (voir l'en-tête).
import { jourFerie } from '../retenues/jour-ouvrable';

/** Article 64 · « ne peut être inférieure à quatorze jours ouvrables ». */
export const PREAVIS_PLANCHER_JOURS = 14;
/** Article 64 · « augmenté de sept jours ouvrables par année entière ». */
export const PREAVIS_PAR_ANNEE_JOURS = 7;
/** Article 258 · le préavis du délégué syndical est « le double ». */
export const PREAVIS_DELEGUE_MULTIPLICATEUR = 2;
/** Article 258 · « sans pouvoir être inférieure à trois mois ». */
export const PREAVIS_DELEGUE_PLANCHER_MOIS = 3;
/** Article 258, dernier alinéa · les candidats non élus, « pendant une durée de 6 mois après les élections ». */
export const CANDIDAT_NON_ELU_MOIS = 6;

/**
 * LE PLUS GRAND NOMBRE DE JOURS OUVRABLES QUE TROIS MOIS PUISSENT PORTER.
 * Trois mois consécutifs comptent au plus 92 jours, dont au moins 13
 * dimanches (art. 121, al. 2), soit 79 jours ouvrables au sens de l'art. 7,
 * point 9, avant même les jours fériés. Un préavis doublé qui atteint ce
 * nombre atteint donc le plancher de trois mois de l'art. 258 quelle que soit
 * la date · en dessous, il peut ne pas l'atteindre, et rien ne se tranche sans
 * la date de notification ou la durée retenue par le dossier.
 */
export const JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS = 92 - 13;

/** Article 71 · « un préavis de trois jours ouvrables » pendant l'essai. */
export const PREAVIS_ESSAI_JOURS = 3;
/** Article 71, alinéa 2 · « pendant les trois premiers jours d'essai, [...] sans préavis ». */
export const JOURS_D_ESSAI_SANS_PREAVIS = 3;

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
 * LA MOYENNE MENSUELLE RAMENÉE AU JOUR · convention d'OmegaX, déclarée sur la
 * ligne. Les articles 66 et 142 font entrer la moyenne dans la RÉMUNÉRATION
 * qui sert au préavis et au congé, calculés en jours ouvrables ; ils ne disent
 * pas comment la ramener au jour. Le diviseur retenu est le multiplicateur
 * MOIS de l'article 7 du décret n° 25/22 (vingt-six), le même qui fait du
 * samedi un jour ouvrable dans ce fichier.
 */
export const JOURS_PAR_MOIS_DE_MOYENNE = MULTIPLICATEURS_ARTICLE_7.MOIS;

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

/** Les deux valeurs du registre (`ContratTravail.type`). */
export type TypeContratDecompte = 'DUREE_INDETERMINEE' | 'DUREE_DETERMINEE';

/**
 * CE QUI S'EST PASSÉ PENDANT LE PRÉAVIS · déclaré, jamais présumé. Article 63,
 * alinéa 3 · l'indemnité n'est due que « sans préavis ou sans que le préavis
 * ait été intégralement observé », et par « la partie responsable » « à
 * l'autre partie ». Un préavis presté se paie en salaire, pas en indemnité ·
 * le compter aussi comme indemnité le paierait deux fois.
 */
export type ExecutionPreavis =
  | 'PRESTE'
  | 'NON_OBSERVE'
  | 'DISPENSE_PAR_EMPLOYEUR'
  | 'DISPENSE_A_LA_DEMANDE_DU_TRAVAILLEUR'
  // A9 · Code du travail, art. 66, al. 1 · le travailleur qui REÇOIT le
  // préavis cesse le travail à l'expiration de la moitié du délai.
  | 'DEPART_A_MI_PREAVIS'
  // A9 · art. 67 · le travailleur qui a reçu le préavis part plus tôt pour un
  // nouvel emploi justifié, dans un délai convenu d'au plus sept jours.
  | 'DEPART_POUR_NOUVEL_EMPLOI';

/** Article 67 · « sans qu'il puisse être supérieur à sept jours à dater du jour où il trouve un nouvel engagement ». */
export const DELAI_NOUVEL_EMPLOI_MAXIMUM_JOURS = 7;

/**
 * A9 · LES DEUX DÉPARTS ANTICIPÉS QUE LE CODE OUVRE AU TRAVAILLEUR, verbatim.
 *
 * ARTICLE 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à
 * l'expiration de la moitié du délai de préavis que l'employeur est tenu de
 * lui donner. L'employeur doit la rémunération et les allocations familiales
 * pendant le temps restant à courir. Les montants des commissions, primes,
 * gratifications et participations aux bénéfices entrent en ligne de compte
 * dans la détermination de la rémunération et sont calculés sur la moyenne de
 * ces éléments payés pour les douze mois précédents. »
 *
 * ARTICLE 67 · « Le travailleur qui a reçu le préavis et justifie avoir trouvé
 * un nouvel emploi peut quitter son employeur dans un délai moindre, fixé de
 * commun accord, sans qu'il puisse être supérieur à sept jours à dater du jour
 * où il trouve un nouvel engagement. Dans ce cas, il perd le droit à la
 * rémunération et aux allocations familiales de la période de préavis restant
 * à courir. »
 *
 * CE QUE CES PHRASES FONT AU DÉCOMPTE (relevé CPCC C5).
 *
 *  · CES DEUX DÉPARTS SONT DES DROITS, PAS DES INEXÉCUTIONS. Déclarés jusque-là
 *    comme un préavis « non observé par le travailleur », ils lui faisaient
 *    DEVOIR l'indemnité de l'art. 63, al. 3 · le travailleur payait l'usage
 *    d'un droit que le Code lui donne. Le préavis « non observé » par le
 *    travailleur sur un préavis REÇU de l'employeur est désormais lu à travers
 *    l'art. 66 (voir `decompteFinal`).
 *  · ILS NE VISENT QUE LE PRÉAVIS REÇU DE L'EMPLOYEUR (« Le travailleur qui
 *    reçoit le préavis ») · une démission les refuse (`motifRefusDecompte`).
 *  · « SEPT JOURS » ET NON « SEPT JOURS OUVRABLES » · l'art. 64 écrit
 *    « jours ouvrables » quand il les veut, l'art. 67 ne l'écrit pas. Le délai
 *    se compte en jours de calendrier (lecture d'OmegaX, dite sur la ligne).
 */

export type VerdictPreavis = {
  /** `null` lorsque aucun préavis n'est dû, ou que la durée ne se tranche pas. */
  readonly joursOuvrables: number | null;
  /** Rempli quand AUCUN préavis n'est dû · c'est une réponse, et elle porte son article. */
  readonly motifAucunPreavis: string | null;
  /** Rempli quand la durée ne se tranche pas sans un fait du dossier · ce n'est pas zéro. */
  readonly motifIndetermine: string | null;
  /** L'article qui fixe la durée rendue. */
  readonly fondement: string;
  readonly reserves: readonly string[];
};

/** Un jour AAAA-MM-JJ, en UTC · jamais une date locale, qui reculerait d'un jour. */
const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const ENTREE_EN_VIGUEUR_ORDONNANCE_23_042 = '2023-03-30';

/**
 * LES JOURS OUVRABLES DE TROIS MOIS COMPTÉS DE DATE À DATE, à dater du
 * lendemain de la notification (art. 64, al. 1). Jours ouvrables au sens de
 * l'art. 7, point 9 · le dimanche (art. 121, al. 2) et les jours fériés de
 * l'ordonnance n° 23-042 sont exclus, le samedi compté. Un mois d'arrivée plus
 * court s'arrête à son dernier jour (convention de lecture d'OmegaX, aucun
 * texte lu ne règle le 31). Une période qui commence avant le 30 mars 2023 est
 * refusée · la liste des jours fériés d'avant n'est pas au corpus.
 */
export function joursOuvrablesDeTroisMois(
  dateNotification: string,
): { jours: number; du: string; auExclu: string } | { refus: string } {
  const m = JOUR.exec(dateNotification);
  if (!m) return { refus: 'La date de notification doit être écrite AAAA-MM-JJ.' };
  const debut = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  if (Number.isNaN(debut.getTime())) return { refus: 'La date de notification est illisible.' };
  const du = debut.toISOString().slice(0, 10);
  if (du < ENTREE_EN_VIGUEUR_ORDONNANCE_23_042) {
    return {
      refus:
        "La période commence avant le 30 mars 2023 · la liste des jours fériés antérieure à l'ordonnance n° 23-042 n'est pas au corpus, et les trois mois ne se comptent pas en jours ouvrables sans elle.",
    };
  }
  const moisCible = debut.getUTCMonth() + PREAVIS_DELEGUE_PLANCHER_MOIS;
  const dernierDuMoisCible = new Date(Date.UTC(debut.getUTCFullYear(), moisCible + 1, 0)).getUTCDate();
  const fin = new Date(
    Date.UTC(debut.getUTCFullYear(), moisCible, Math.min(debut.getUTCDate(), dernierDuMoisCible)),
  );
  let jours = 0;
  for (let d = new Date(debut); d.getTime() < fin.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) continue;
    if (jourFerie(d) !== null) continue;
    jours += 1;
  }
  return { jours, du, auExclu: fin.toISOString().slice(0, 10) };
}

const RESERVE_PLANCHER_64 =
  "PLANCHER, JAMAIS DURÉE DUE · l'article 64 s'ouvre par « sauf durée plus longue fixée par les parties ou par la convention collective » et se referme par « ne peut être inférieure à ». " +
  "Et son dernier alinéa renvoie à un ARRÊTÉ du Ministre du Travail, qui n'est PAS au corpus · c'est de lui que viennent les barèmes par catégorie (maîtrise, cadres) que la pratique applique. Vérifier la convention du dossier avant d'opposer ce chiffre.";

const RESERVE_JOUR_OUVRABLE_CODE =
  "JOURS OUVRABLES AU SENS DU CODE DU TRAVAIL, article 7, point 9 · « chaque jour de la semaine à l'exception du jour de repos hebdomadaire et des jours fériés légaux », le repos ayant lieu le dimanche (art. 121, al. 2). LE SAMEDI EST OUVRABLE. La règle des échéances fiscales, qui écarte le samedi, répond à une autre question · elle vise un guichet de l'Administration.";

/**
 * LE PRÉAVIS LÉGAL, ET C'EST UN PLANCHER.
 *
 * « SAUF DURÉE PLUS LONGUE fixée par les parties ou par la convention
 * collective » ouvre l'article 64, et « ne peut être INFÉRIEURE À » le
 * referme. Ce que rend cette fonction est donc le MINIMUM opposable, porté à
 * la durée que le dossier déclare quand elle est plus longue.
 *
 * L'ARTICLE 64 NE VAUT QUE POUR LE CONTRAT À DURÉE INDÉTERMINÉE. Le contrat à
 * durée déterminée ne se résilie pas par préavis (art. 69, clause « nulle de
 * plein droit »), sa rupture anticipée donne lieu aux dommages-intérêts de
 * l'art. 70 ; l'essai a son propre délai, trois jours ouvrables, aucun pendant
 * les trois premiers jours (art. 71). Sans le type du contrat, la durée ne se
 * tranche pas.
 *
 * CAS OÙ AUCUN PRÉAVIS N'EST DÛ, chacun lu au texte · la FAUTE LOURDE (art. 72),
 * la FORCE MAJEURE CONSTATÉE après deux mois de suspension (art. 57 et 60 c),
 * le TERME D'UN CDD, et le COMMUN ACCORD (art. 61 bis, qui ne fixe aucun
 * préavis). OmegaX ne QUALIFIE aucun d'eux · le motif est déclaré.
 */
export function preavisLegal(params: {
  anneesAnciennete: number;
  initiative: InitiativeRupture;
  motif: MotifRupture;
  typeContrat?: TypeContratDecompte | null;
  periodeDEssai?: boolean;
  joursDEssaiEcoules?: number | null;
  delegueSyndical?: boolean;
  dateNotification?: string | null;
  preavisRetenuJours?: number | null;
  forceMajeureConstateeParInspecteur?: boolean;
  deuxMoisDeSuspension?: boolean;
}): VerdictPreavis {
  const reserves: string[] = [];
  const aucun = (motifAucunPreavis: string, fondement: string): VerdictPreavis => ({
    joursOuvrables: null,
    motifAucunPreavis,
    motifIndetermine: null,
    fondement,
    reserves,
  });
  const indetermine = (motifIndetermine: string, fondement: string): VerdictPreavis => ({
    joursOuvrables: null,
    motifAucunPreavis: null,
    motifIndetermine,
    fondement,
    reserves,
  });

  if (params.motif === 'FAUTE_LOURDE') {
    return aucun(
      "Article 72 · « Tout contrat de travail peut être résilié immédiatement sans préavis, pour faute lourde. » La qualification de faute lourde appartient au dossier, et l'article l'enferme dans une notification écrite dans les quinze jours ouvrables de la connaissance des faits.",
      'Article 72',
    );
  }
  if (params.motif === 'FORCE_MAJEURE') {
    // AUDIT D2-A2 · la force majeure SUSPEND le contrat (art. 57, 8°), elle ne
    // le rompt pas. La résiliation « sans indemnité » n'est ouverte qu'après
    // deux mois de suspension (art. 60 c), et la constatation appartient à
    // l'Inspecteur du travail, pas au dossier (art. 57, dernier alinéa).
    const conditions =
      "Article 57 · « Le cas de force majeure est constaté par l'Inspecteur du Travail. » Article 60 c) · « en cas de force majeure, la partie intéressée peut résilier le contrat sans indemnité, après deux mois de suspension ». Article 80 · « La faillite et la liquidation judiciaire ne sont pas considérées comme des cas de force majeure. »";
    if (params.forceMajeureConstateeParInspecteur === true && params.deuxMoisDeSuspension === true) {
      return aucun(`${conditions} Constat de l'Inspecteur et deux mois de suspension déclarés.`, 'Articles 57 et 60 c)');
    }
    return indetermine(
      `${conditions} Tant que le constat de l'Inspecteur du travail et les deux mois de suspension ne sont pas déclarés, la résiliation sans indemnité n'est pas établie.`,
      'Articles 57 et 60 c)',
    );
  }
  if (params.motif === 'TERME_DU_CDD') {
    return aucun(
      "Article 69 · le contrat à durée déterminée « prend fin à l'expiration du terme fixé par les parties » · il n'y a pas de résiliation à notifier, donc pas de préavis.",
      'Article 69',
    );
  }
  if (params.motif === 'COMMUN_ACCORD') {
    return aucun(
      "Article 61 bis · « le contrat de travail peut être également résilié d'un commun accord des parties ». L'article ne fixe aucun préavis · ce que les parties ont convenu se saisit.",
      'Article 61 bis',
    );
  }

  if (params.typeContrat !== 'DUREE_INDETERMINEE' && params.typeContrat !== 'DUREE_DETERMINEE') {
    return indetermine(
      "Le type de contrat n'est pas déclaré · l'article 64 ne régit que le contrat à durée indéterminée, le contrat à durée déterminée ne se résiliant pas par préavis (art. 69).",
      'Articles 64 et 69',
    );
  }

  if (params.periodeDEssai) {
    // Article 71 · le délai de l'essai, pour chacune des parties. Ni la moitié
    // de l'art. 64, al. 2 ni le doublement de l'art. 258 ne le visent.
    const ecoules = params.joursDEssaiEcoules;
    if (ecoules === undefined || ecoules === null) {
      return indetermine(
        "Article 71 · pendant les trois premiers jours d'essai, le contrat se résilie sans préavis ; ensuite, moyennant un préavis de trois jours ouvrables. Le nombre de jours d'essai écoulés n'est pas renseigné.",
        'Article 71',
      );
    }
    if (ecoules <= JOURS_D_ESSAI_SANS_PREAVIS) {
      return aucun(
        "Article 71, alinéa 2 · « pendant les trois premiers jours d'essai, le contrat peut être résilié sans préavis, la totalité de la rémunération étant due pour toute journée commencée ».",
        'Article 71',
      );
    }
    reserves.push(RESERVE_JOUR_OUVRABLE_CODE);
    return {
      joursOuvrables: PREAVIS_ESSAI_JOURS,
      motifAucunPreavis: null,
      motifIndetermine: null,
      fondement: 'Article 71',
      reserves,
    };
  }

  if (params.typeContrat === 'DUREE_DETERMINEE') {
    // AUDIT D2-A3 et C6 · l'art. 64 servi à un CDD rompu avant terme n'avait
    // aucun fondement. La réparation est celle de l'art. 70, rubrique à part.
    return aucun(
      "Article 69 · « La clause insérée dans un tel contrat prévoyant le droit d'y mettre fin par préavis est nulle de plein droit. » La rupture avant le terme donne lieu aux dommages-intérêts de l'article 70, rubrique à part.",
      'Articles 69 et 70',
    );
  }

  const annees = Math.max(0, Math.floor(params.anneesAnciennete));
  const legal = PREAVIS_PLANCHER_JOURS + PREAVIS_PAR_ANNEE_JOURS * annees;
  const retenu =
    typeof params.preavisRetenuJours === 'number' && params.preavisRetenuJours > 0 ? params.preavisRetenuJours : null;
  let fondement = 'Article 64';

  reserves.push(RESERVE_PLANCHER_64, RESERVE_JOUR_OUVRABLE_CODE);

  // Le préavis de l'employeur · le plancher légal, ou la durée plus longue
  // que le dossier déclare (convention, contrat).
  let employeur = Math.max(legal, retenu ?? 0);
  if (retenu !== null && retenu > legal) {
    reserves.push(
      `DURÉE RETENUE PAR LE DOSSIER · ${retenu} jours ouvrables déclarés, au-dessus du plancher de ${legal} jours de l'article 64.`,
    );
  }

  if (params.delegueSyndical && params.initiative === 'EMPLOYEUR') {
    // AUDIT D2-B1 · le plancher de trois mois n'était pas appliqué, et le
    // chiffre doublé entrait au total alors qu'il était CERTAINEMENT sous le
    // minimum légal pour moins de quatre ans d'ancienneté.
    fondement = 'Articles 64 et 258';
    const double = legal * PREAVIS_DELEGUE_MULTIPLICATEUR;
    employeur = Math.max(double, retenu ?? 0);
    const texte258 =
      "ARTICLE 258 · « Sauf faute lourde, la durée du préavis à observer en cas de licenciement d'un délégué titulaire ou suppléant est LE DOUBLE de la période applicable en vertu des dispositions de l'article 64, SANS POUVOIR ÊTRE INFÉRIEURE À TROIS MOIS. » Et « les candidats non élus ou non réélus bénéficient pendant une durée de 6 mois après les élections des règles de préavis » de cet alinéa.";
    const trois = params.dateNotification ? joursOuvrablesDeTroisMois(params.dateNotification) : null;
    if (trois && 'jours' in trois) {
      employeur = Math.max(employeur, trois.jours);
      reserves.push(
        `${texte258} Doublé : ${double} jours ouvrables. Trois mois du ${trois.du} au ${trois.auExclu} exclu : ${trois.jours} jours ouvrables (dimanches et jours fériés de l'ordonnance n° 23-042 exclus). Le plus grand est retenu.`,
      );
    } else if (double >= JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS || retenu !== null) {
      reserves.push(
        retenu !== null
          ? `${texte258} Doublé : ${double} jours ouvrables ; la durée retenue par le dossier (${retenu} jours) est prise pour la conversion des trois mois.`
          : `${texte258} Doublé : ${double} jours ouvrables, au-delà des ${JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS} jours ouvrables que trois mois peuvent compter · le plancher est atteint.`,
      );
    } else {
      return indetermine(
        `${texte258} Doublé, le préavis fait ${double} jours ouvrables, et trois mois en comptent jusqu'à ${JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS} · il peut rester sous le plancher. Déclarer la date de notification, ou la durée retenue en jours ouvrables.` +
          (trois && 'refus' in trois ? ` ${trois.refus}` : ''),
        fondement,
      );
    }
  }

  let jours = employeur;
  if (params.initiative === 'TRAVAILLEUR') {
    // Article 64, alinéa 2 · la MOITIÉ, et jamais davantage.
    jours = employeur / 2;
    reserves.push(
      "ARTICLE 64, ALINÉA 2 · « La durée du préavis à donner par le travailleur est égale à LA MOITIÉ de celui qu'aurait dû remettre l'employeur. Elle ne peut en aucun cas excéder cette limite. »",
    );
  }

  return { joursOuvrables: jours, motifAucunPreavis: null, motifIndetermine: null, fondement, reserves };
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
 *
 * SEULS LES MOIS NON COUVERTS PAR UN CONGÉ PRIS OU PAYÉ SE COMPTENT (audit
 * D2-C3). L'article 144 REMPLACE le congé par une indemnité · un congé déjà
 * pris ou payé ne se remplace pas deux fois. Et le jour d'ancienneté de
 * l'article 141 s'ajoute à CHAQUE période annuelle non prise, à l'ancienneté
 * atteinte à la fin de cette période · l'ajouter une seule fois sous-évaluait
 * plusieurs années non prises et sur-évaluait une année incomplète.
 *
 * CONVENTION D'OMEGAX, déclarée · les mois non couverts sont les plus récents,
 * d'un seul tenant jusqu'à la cessation. La période en cours, incomplète, reçoit
 * la tranche d'ancienneté au prorata de ses mois · le Code ne dit pas comment
 * répartir la tranche sur une année incomplète.
 */
export function congeLegal(params: {
  moisNonCouvertsParUnConge: number;
  moinsDeDixHuitAns: boolean;
  anneesAnciennete: number;
}): VerdictConge {
  const mois = Math.max(0, Math.floor(params.moisNonCouvertsParUnConge));
  const parMois = params.moinsDeDixHuitAns
    ? CONGE_JOURS_PAR_MOIS_MINEUR
    : CONGE_JOURS_PAR_MOIS_MAJEUR;
  const joursDeBase = mois * parMois;

  const anciennete = Math.max(0, params.anneesAnciennete);
  const reste = mois % 12;
  const anneesCompletes = (mois - reste) / 12;
  const tranches = (a: number) => Math.floor(Math.max(0, a) / CONGE_TRANCHE_ANNEES) * CONGE_AJOUT_PAR_TRANCHE_JOURS;
  // La période en cours finit à la cessation, à l'ancienneté déclarée ; les
  // années complètes non prises la précèdent, une année d'ancienneté chacune.
  let joursDAnciennete = (tranches(anciennete) * reste) / 12;
  for (let i = 0; i < anneesCompletes; i += 1) {
    joursDAnciennete += tranches(anciennete - reste / 12 - i);
  }

  const reserves = [
    "ARTICLE 141 · « au moins UN jour ouvrable par mois entier de service pour le travailleur âgé de PLUS de dix-huit ans », « au moins UN jour ouvrable ET DEMI » pour celui de MOINS de dix-huit ans, et « augmente d'UN jour ouvrable par tranche de cinq années d'ancienneté ». C'est un PLANCHER · une convention collective plus favorable prime.",
    "LE SÉMINAIRE CPCC PORTE 1,5 JOUR POUR LE MAJEUR, 2 POUR LE MINEUR ET 2 PAR TRANCHE DE CINQ ANS · il a décalé d'un cran, et une indemnité calculée ainsi est de cinquante pour cent trop élevée. Le fichier porte lui-même la règle : en cas de désaccord, l'article prime.",
    "ARTICLE 141, ALINÉA 2 · les services pris en compte comprennent les jours de repos hebdomadaire, de congé payé et les jours fériés, ainsi que l'incapacité de travail jusqu'à six mois par année, sans cette limite pour un accident du travail ou une maladie professionnelle. OmegaX ne recompose pas ce décompte · les mois NON COUVERTS PAR UN CONGÉ PRIS OU PAYÉ sont SAISIS (art. 144, le congé est « remplacé »).",
    "TRANCHE D'ANCIENNETÉ · ajoutée à chaque période annuelle non prise, à l'ancienneté atteinte en fin de période, les mois saisis étant lus comme les plus récents ; la période en cours, incomplète, la reçoit au prorata de ses mois. Le Code ne dit pas comment répartir la tranche sur une année incomplète · lecture d'OmegaX. L'article 140 ne laisse cumuler que « la moitié des congés pendant une période de deux ans ».",
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
  /**
   * A8 · la part « avantages de toute nature » comprise dans le montant
   * (art. 63, al. 3 ; art. 70, al. 2). L'émission la ventile par nature ·
   * l'art. 7, point 8 sort NOMMÉMENT de la rémunération le logement ou son
   * indemnité et le transport, qui ne peuvent entrer dans l'assiette sociale
   * sous couvert d'une indemnité de rupture.
   */
  readonly avantagesInclusFc?: number;
};

export type VerdictDecompteFinal = {
  readonly preavis: VerdictPreavis;
  readonly conge: VerdictConge;
  /** Les rubriques du BRUT dû au travailleur. */
  readonly rubriques: readonly RubriqueDecompte[];
  /** `null` dès qu'une rubrique est indéterminée · un solde partiel se lit comme un solde. */
  readonly totalBrutFc: number | null;
  /** Dues au travailleur HORS du brut · les allocations familiales (formule 20 du modèle de 2008). */
  readonly horsBrut: readonly RubriqueDecompte[];
  /** Le brut et ce qui est dû hors du brut · `null` dès qu'une des deux parts l'est. */
  readonly totalDuAuTravailleurFc: number | null;
  /** Dues PAR le travailleur à l'employeur (art. 63, al. 3 ; art. 70, al. 1) · jamais dans les deux totaux. */
  readonly duParLeTravailleur: readonly RubriqueDecompte[];
  readonly echeancePaiement: string;
  readonly reserves: readonly string[];
};

export type ParametresDecompte = {
  anneesAnciennete: number;
  /** Mois entiers de service NON couverts par un congé pris ou payé (art. 141 et 144). */
  moisNonCouvertsParUnConge: number;
  moinsDeDixHuitAns: boolean;
  initiative: InitiativeRupture;
  motif: MotifRupture;
  typeContrat: TypeContratDecompte | null;
  periodeDEssai?: boolean;
  joursDEssaiEcoules?: number | null;
  delegueSyndical?: boolean;
  dateNotification?: string | null;
  preavisRetenuJours?: number | null;
  forceMajeureConstateeParInspecteur?: boolean;
  deuxMoisDeSuspension?: boolean;
  /** Ce qui s'est passé pendant le préavis · déclaré. */
  executionPreavis?: ExecutionPreavis | null;
  /** Jours ouvrables du préavis NON observés, pour `NON_OBSERVE`. */
  joursPreavisNonObserves?: number | null;
  /** La partie qui n'a pas observé le préavis · à défaut, celle qui a pris l'initiative. */
  partieResponsable?: InitiativeRupture | null;
  /** Taux journalier de la rémunération, tel que le contrat le porte. */
  remunerationJournaliereFc: number | null;
  /** Article 66, al. 3 · moyenne MENSUELLE des douze mois des commissions, primes, gratifications et participations. */
  moyenneMensuelleArticle66Fc?: number | null;
  /** Article 142, al. 2 · moyenne MENSUELLE des douze mois des commissions, primes, prestations supplémentaires et participation. */
  moyenneMensuelleArticle142Fc?: number | null;
  /** Article 63, al. 3 · avantages de toute nature pendant le préavis non observé (logement, transport, en nature), pour toute la période. */
  avantagesPendantPreavisFc?: number | null;
  /** Article 70, al. 2 · jours de salaire restant à courir jusqu'au terme du CDD. */
  joursRestantsJusquAuTerme?: number | null;
  /** Article 70, al. 2 · avantages de toute nature jusqu'au terme, pour toute la période. */
  avantagesJusquAuTermeFc?: number | null;
  /**
   * A9 · Article 66, al. 2 · la valeur des avantages en nature (art. 7,
   * point 8) pendant le temps restant à courir, pour toute la période. Le
   * logement et le transport n'y entrent pas · l'art. 66 dit « la
   * rémunération », et l'art. 7, point 8 les en sort nommément.
   */
  avantagesEnNatureRestantsFc?: number | null;
  /** A9 · Article 67 · « justifie avoir trouvé un nouvel emploi » · déclaré, jamais présumé. */
  nouvelEmploiJustifie?: boolean | null;
  /** A9 · Article 67 · le délai de départ fixé de commun accord, en jours, compté du jour du nouvel engagement. */
  delaiDepartNouvelEmploiJours?: number | null;
  /** Article 61 bis · ce que les parties ont convenu. */
  montantConvenuCommunAccordFc?: number | null;
  /** Arriérés de salaire et jours prestés non payés · saisis. */
  arrieresFc?: number | null;
  /** Gratification due, si l'entité en paie · saisie. */
  gratificationFc?: number | null;
  /** Articles 66, al. 2 et 142, al. 3 · nombre d'enfants bénéficiaires. */
  enfantsBeneficiairesAllocations?: number | null;
  /** Jours pour lesquels les allocations sont dues · saisis, jamais déduits. */
  joursAllocationsFamiliales?: number | null;
  /** Colonne 19 de la grille du mois, par enfant et par jour · lue par le service. */
  allocationFamilialeParEnfantFc?: number | null;
  /** Pourquoi le taux de la colonne 19 manque, le cas échéant. */
  explicationAllocationFamiliale?: string | null;
};

/**
 * LES COMBINAISONS QUE LE TEXTE EXCLUT, refusées avant tout calcul. Une
 * démission est l'initiative du travailleur (art. 64, al. 2), un licenciement
 * celle de l'employeur (art. 61) · l'écran laissait « Employeur » par défaut
 * sur une démission et servait au démissionnaire le préavis entier de
 * l'employeur (audit D2-A1).
 */
export function motifRefusDecompte(p: {
  initiative: InitiativeRupture;
  motif: MotifRupture;
  typeContrat?: TypeContratDecompte | null;
  executionPreavis?: ExecutionPreavis | null;
}): string | null {
  // A9 · les articles 66 et 67 s'ouvrent par « Le travailleur qui reçoit le
  // préavis » · ils ne valent que pour le préavis donné par l'employeur.
  if (
    (p.executionPreavis === 'DEPART_A_MI_PREAVIS' || p.executionPreavis === 'DEPART_POUR_NOUVEL_EMPLOI') &&
    p.initiative !== 'EMPLOYEUR'
  ) {
    return p.executionPreavis === 'DEPART_A_MI_PREAVIS'
      ? "Article 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à l'expiration de la moitié du délai » · il vise le préavis donné par l'employeur, pas celui que le travailleur donne."
      : "Article 67 · « Le travailleur qui a reçu le préavis et justifie avoir trouvé un nouvel emploi » · il vise le préavis donné par l'employeur, pas celui que le travailleur donne.";
  }
  // A9 (M3) · et seulement pour le préavis d'un LICENCIEMENT d'un contrat qui
  // en comporte un · ni faute lourde (art. 72), ni force majeure (art. 60 c),
  // ni commun accord (art. 61 bis), ni terme ou rupture d'un CDD (art. 69 et
  // 70) n'ouvrent de délai que le travailleur « reçoit ».
  if (
    (p.executionPreavis === 'DEPART_A_MI_PREAVIS' || p.executionPreavis === 'DEPART_POUR_NOUVEL_EMPLOI') &&
    (p.motif !== 'LICENCIEMENT' || p.typeContrat === 'DUREE_DETERMINEE')
  ) {
    return "Les départs des articles 66 et 67 supposent un préavis de licenciement reçu de l'employeur · la faute lourde (art. 72), la force majeure (art. 60 c), le commun accord (art. 61 bis), le terme du contrat à durée déterminée et sa rupture (art. 69 et 70) n'en comportent pas.";
  }
  if (p.motif === 'DEMISSION' && p.initiative !== 'TRAVAILLEUR') {
    return "Une démission est l'initiative du travailleur · l'article 64, alinéa 2 fixe son préavis à la moitié de celui de l'employeur.";
  }
  if (p.motif === 'LICENCIEMENT' && p.initiative !== 'EMPLOYEUR') {
    return "Un licenciement est l'initiative de l'employeur (art. 61 et 62).";
  }
  if (p.motif === 'TERME_DU_CDD' && p.typeContrat === 'DUREE_INDETERMINEE') {
    return "Un contrat à durée indéterminée n'a pas de terme (art. 69).";
  }
  return null;
}

/**
 * A9 · LE DÉPART AVANT LA MOITIÉ DU PRÉAVIS REÇU · lecture d'OmegaX, dite.
 * Le Code ne dit pas expressément ce que doit le travailleur qui part AVANT
 * la moitié · l'art. 66, al. 1 fixant à cette moitié le délai qu'il est tenu
 * d'observer, seuls les jours d'avant elle lui sont imputés (art. 63, al. 3),
 * et l'art. 66, al. 2 ne joue pas, faute de départ à la moitié.
 */
export const RESERVE_DEPART_AVANT_LA_MOITIE =
  "LECTURE D'OMEGAX · le Code ne dit pas expressément ce que doit le travailleur qui part AVANT la moitié du préavis reçu. " +
  "L'article 66, alinéa 1 fixant à cette moitié le délai qu'il est tenu d'observer, seuls les jours non observés avant elle lui sont imputés (art. 63, al. 3), " +
  "et la rémunération du temps restant (art. 66, al. 2) n'est pas due, faute de départ à la moitié. " +
  "S'il justifie d'un nouvel emploi et d'un délai convenu d'au plus sept jours, c'est un départ de l'article 67 · rien ne lui est alors imputé. " +
  "Et si l'employeur n'a pas respecté ses obligations pendant le préavis (jour de liberté hebdomadaire compris), rien n'est dû par le travailleur · article 65, alinéa 3, « La partie à l'égard de laquelle ces obligations ne seraient pas respectées ne pourra se voir imposer aucun délai de préavis, sans préjudice des dommages-intérêts qu'elle jugerait bon de demander au tribunal compétent. »";

/**
 * A9 (M5) · LA MOITIÉ SE LIT SUR LE PRÉAVIS DÛ. Sans durée retenue par le
 * dossier, `preavisLegal` rend le PLANCHER de l'art. 64, al. 1, et la moitié
 * en est tirée · un préavis conventionnel plus long la déplace. Le refus qui
 * la compare le dit.
 */
function mentionDureeRetenue(params: ParametresDecompte): string {
  return typeof params.preavisRetenuJours === 'number' && params.preavisRetenuJours > 0
    ? ''
    : " La moitié est prise sur le plancher légal de l'article 64 · déclarez la durée retenue si le préavis dû le dépasse (convention collective ou contrat, art. 64, al. 1 et 3).";
}

/** A9 (M3) · le sort des allocations familiales du temps restant, selon l'article qui le régit. */
const AF_DUES_ARTICLE_66 =
  "DÉPART À MI-PRÉAVIS · les allocations familiales du temps restant à courir sont DUES (art. 66, al. 2, « l'employeur doit la rémunération et les allocations familiales pendant le temps restant à courir ») · les jours saisis les comptent.";
const AF_PERDUES_ARTICLE_67 =
  "DÉPART POUR UN NOUVEL EMPLOI · les allocations familiales de la période de préavis restant à courir sont PERDUES (art. 67) · les jours saisis ne la comptent pas.";
const AF_NON_DUES_AVANT_LA_MOITIE =
  "DÉPART AVANT LA MOITIÉ DU PRÉAVIS · les allocations familiales du temps restant ne sont pas dues, l'article 66, alinéa 2 ne jouant pas faute de départ à la moitié (lecture d'OmegaX) · les jours saisis ne le comptent pas.";

const LIBELLE_REMUNERATION_RESTANTE = 'Rémunération du préavis restant à courir';

/**
 * A9 (M4) · LA SOMME DE L'ART. 66 A SA CLÉ · « l'employeur doit la
 * rémunération », c'est une rémunération au sens de l'art. 7, point 8, pas
 * une indemnité de rupture que le corpus ne range nulle part · son émission
 * porte sa propre réserve (`decompte-final-emis.ts`).
 */
export const CLE_REMUNERATION_PREAVIS_RESTANT = 'remuneration-preavis-restant';

/**
 * A9 · ARTICLE 66 · LE DÉPART À MI-PRÉAVIS. L'employeur doit « la rémunération
 * [...] pendant le temps restant à courir », et l'alinéa 3 fait entrer dans
 * cette rémunération la moyenne des douze mois. La rémunération est celle de
 * l'art. 7, point 8 · elle comprend « la valeur des avantages en nature »,
 * elle ne comprend ni les soins de santé, ni le logement ou son indemnité, ni
 * les allocations familiales légales, ni le transport, ni « les frais de
 * voyage ainsi que les avantages accordés exclusivement en vue de faciliter
 * au travailleur l'accomplissement de ses fonctions » · l'art. 66 ne dit pas
 * « avantages de toute nature » comme l'art. 63, al. 3. Et seuls les
 * avantages NON FOURNIS en nature jusqu'au terme se paient en valeur · un
 * avantage que l'employeur continue de fournir serait payé deux fois.
 *
 * LA SOMME VA À L'INDEMNITÉ DE FIN DE CONTRAT (6614) · la fiche du compte 66
 * des deux textes y range les « indemnités de préavis » ; c'est la part du
 * préavis que le travailleur ne preste pas, payée sans travail. La part
 * prestée se paie en salaire, aux éléments du mois (arriérés).
 *
 * RIEN NE SE PRÉSUME · les jours restants se déclarent (au plus la moitié du
 * préavis, sinon le départ n'est pas celui de l'art. 66), le taux journalier,
 * la moyenne et les avantages en nature aussi (zéro est une réponse).
 */
function rubriqueDepartAMiPreavis(
  params: ParametresDecompte,
  jours: number,
  fondementDuree: string,
  jour: number | null,
  moyenne66: number | null,
  conversionMoyenne: string,
): RubriqueDecompte {
  const restants = typeof params.joursPreavisNonObserves === 'number' ? params.joursPreavisNonObserves : null;
  const avantages = typeof params.avantagesEnNatureRestantsFc === 'number' ? params.avantagesEnNatureRestantsFc : null;
  const moitie = jours / 2;
  let reserve: string | null = null;
  if (restants === null) {
    reserve = "Les jours ouvrables du préavis restant à courir à la cessation ne sont pas renseignés · c'est sur eux que l'employeur doit la rémunération (art. 66, al. 2).";
  } else if (restants < 0) {
    reserve = 'Les jours restant à courir ne peuvent être négatifs.';
  } else if (restants > moitie) {
    reserve =
      `${restants} jours restant à courir sur un préavis de ${jours} · le travailleur est parti AVANT la moitié (${moitie} jours). ` +
      "L'article 66 ne l'autorise à cesser le travail qu'« à l'expiration de la moitié du délai de préavis » · ce départ est un préavis non observé par le travailleur (art. 63, al. 3), ou un départ pour un nouvel emploi (art. 67) s'il en justifie." +
      mentionDureeRetenue(params);
  } else if (jour === null) {
    reserve = "Le taux journalier du contrat n'est pas renseigné.";
  } else if (moyenne66 === null) {
    reserve =
      "La moyenne des douze mois de l'article 66, alinéa 3 n'est pas renseignée · elle entre dans la rémunération du temps restant à courir (zéro est une réponse).";
  } else if (avantages === null) {
    reserve =
      "La valeur des avantages en nature non fournis pendant le temps restant à courir n'est pas renseignée · l'article 7, point 8 la compte dans la rémunération, soins de santé, logement, allocations familiales, transport, frais de voyage et avantages de fonction exclus (zéro est une réponse).";
  }
  return {
    // La clé en toutes lettres · `decompte-final-emis.spec.ts` lit les clés dans la SOURCE.
    cle: 'remuneration-preavis-restant',
    libelle: LIBELLE_REMUNERATION_RESTANTE,
    montantFc: reserve === null ? (restants as number) * ((jour as number) + (moyenne66 as number)) + (avantages as number) : null,
    fondement:
      `${fondementDuree} Article 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à l'expiration de la moitié du délai de préavis que l'employeur est tenu de lui donner. L'employeur doit la rémunération et les allocations familiales pendant le temps restant à courir. » ` +
      `${restants ?? '?'} jours × (taux journalier + moyenne de l'art. 66, al. 3) + avantages en nature ; ${conversionMoyenne}. ` +
      "Rémunération au sens de l'article 7, point 8 · ni les soins de santé, ni le logement ou son indemnité, ni les allocations familiales, ni le transport, ni les frais de voyage et avantages de fonction n'y entrent ; seuls les avantages en nature non fournis jusqu'au terme s'y ajoutent en valeur. Les jours prestés se paient en salaire, aux arriérés ; les allocations familiales du temps restant restent dues (rubrique à part).",
    reserve,
  };
}

/**
 * A9 · ARTICLE 67 · LE DÉPART POUR UN NOUVEL EMPLOI. Le travailleur « perd le
 * droit à la rémunération et aux allocations familiales de la période de
 * préavis restant à courir » · rien ne lui est dû pour elle. Et rien n'est dû
 * PAR lui · l'art. 67 l'autorise à quitter dans un délai moindre ; ce n'est
 * pas le préavis « non intégralement observé » de l'art. 63, al. 3, que la
 * partie responsable indemnise.
 *
 * LES DEUX CONDITIONS SE DÉCLARENT · la justification du nouvel emploi
 * (« justifie avoir trouvé ») et le délai convenu, qui ne peut dépasser sept
 * jours à dater du nouvel engagement. « Sept jours » et non « jours
 * ouvrables » · l'art. 64 écrit ce dernier mot quand il le veut, l'art. 67 ne
 * l'écrit pas (jours de calendrier, lecture d'OmegaX). Sans elles, le départ
 * n'est pas celui de l'art. 67, et le zéro ne s'écrit pas.
 *
 * A9 (B1) · LE « DÉLAI MOINDRE » SE LIT CONTRE LA MOITIÉ DE L'ART. 66. Le
 * texte ne dit pas à quoi le délai est « moindre » · lu contre le préavis
 * entier, un travailleur qui part pour un nouvel emploi APRÈS la moitié
 * perdrait ce que l'art. 66 lui garde (28 jours de préavis, 8 restants,
 * 10 000 FC par jour · 80 000 FC sous l'art. 66, zéro sous l'art. 67). LECTURE
 * PROTECTRICE RETENUE (une règle de protection ne se tranche pas contre celui
 * qu'elle protège) · l'art. 67 ne vaut que pour un départ AVANT la moitié ; à
 * la moitié ou après, la rubrique est indéterminée et renvoie au départ à
 * mi-préavis. Le comparateur n'est pas dit par le texte · c'est une lecture
 * d'OmegaX, et elle exige les jours restant à courir, jamais présumés.
 */
function rubriqueDepartPourNouvelEmploi(
  params: ParametresDecompte,
  jours: number,
  fondementDuree: string,
): RubriqueDecompte {
  const TEXTE_67 =
    "Article 67 · « Le travailleur qui a reçu le préavis et justifie avoir trouvé un nouvel emploi peut quitter son employeur dans un délai moindre, fixé de commun accord, sans qu'il puisse être supérieur à sept jours à dater du jour où il trouve un nouvel engagement. Dans ce cas, il perd le droit à la rémunération et aux allocations familiales de la période de préavis restant à courir. »";
  const delai = typeof params.delaiDepartNouvelEmploiJours === 'number' ? params.delaiDepartNouvelEmploiJours : null;
  const restants = typeof params.joursPreavisNonObserves === 'number' ? params.joursPreavisNonObserves : null;
  const moitie = jours / 2;
  let reserve: string | null = null;
  if (restants === null) {
    reserve =
      "Les jours ouvrables du préavis restant à courir au départ ne sont pas renseignés · le délai moindre de l'article 67 se lit contre la moitié du préavis de l'article 66.";
  } else if (restants < 0 || restants > jours) {
    reserve = `Les jours restant à courir (${restants}) doivent être compris entre zéro et la durée du préavis (${jours}).`;
  } else if (restants <= moitie) {
    reserve =
      `${restants} jours restant à courir sur un préavis de ${jours} · le travailleur est parti à la moitié (${moitie} jours) ou après. ` +
      "L'article 66 lui garde alors « la rémunération et les allocations familiales pendant le temps restant à courir » ; l'article 67, qui les lui retire, ne se lit que pour un départ avant la moitié (lecture protectrice d'OmegaX, le texte ne disant pas à quoi le délai est « moindre »). " +
      'Déclarez le départ à mi-préavis.' +
      mentionDureeRetenue(params);
  } else if (params.nouvelEmploiJustifie === false) {
    reserve =
      "Le nouvel emploi n'est pas justifié · l'article 67 exige que le travailleur « justifie avoir trouvé un nouvel emploi ». Sans justification, le départ anticipé est un préavis non observé par le travailleur (art. 63, al. 3).";
  } else if (params.nouvelEmploiJustifie !== true) {
    reserve = "La justification du nouvel emploi n'est pas déclarée (art. 67, « justifie avoir trouvé un nouvel emploi »).";
  } else if (delai === null) {
    reserve = "Le délai de départ convenu de commun accord n'est pas déclaré · l'article 67 le borne à sept jours à dater du nouvel engagement.";
  } else if (delai < 0) {
    reserve = 'Le délai de départ convenu ne peut être négatif.';
  } else if (delai > DELAI_NOUVEL_EMPLOI_MAXIMUM_JOURS) {
    reserve =
      `Délai convenu de ${delai} jours · l'article 67 dit « sans qu'il puisse être supérieur à sept jours à dater du jour où il trouve un nouvel engagement ». ` +
      "Un départ au-delà n'est pas celui de l'article 67.";
  }
  return {
    cle: 'preavis',
    libelle: LIBELLE_REMUNERATION_RESTANTE,
    montantFc: reserve === null ? 0 : null,
    fondement:
      `${fondementDuree} ${TEXTE_67} Le travailleur perd la rémunération du temps restant ; il ne doit rien de son côté, son départ étant autorisé et non une inexécution du préavis (art. 63, al. 3). ` +
      "« Sept jours » et non « jours ouvrables » · jours de calendrier (lecture d'OmegaX, l'art. 64 écrivant « jours ouvrables » quand il les veut). Les jours prestés se paient en salaire, aux arriérés.",
    reserve,
  };
}

/**
 * LE DÉCOMPTE FINAL, ET CE QU'IL NE CHIFFRE PAS.
 *
 * LES RUBRIQUES NON RENSEIGNÉES SONT RENDUES `null` PLUTÔT QUE ZÉRO, et la
 * distinction décide de tout · un zéro se lit comme « rien n'est dû », un
 * `null` comme « personne n'a encore répondu ». Le TOTAL devient alors `null`
 * lui aussi · un solde de tout compte partiel se lit comme un solde de tout
 * compte, et le travailleur signe pour ce qui est écrit.
 *
 * LA GRATIFICATION N'EST PAS LÉGALE · l'article 7, point 8 la range parmi les
 * éléments de la rémunération « lorsqu'elle est versée », et aucun article n'en
 * impose le versement. Elle est SAISIE, et son absence n'est pas un manque.
 *
 * LES COMMISSIONS, PRIMES ET PARTICIPATIONS ENTRENT DANS LA RÉMUNÉRATION ·
 * articles 66, al. 3 et 142, al. 2, « calculés sur la moyenne de ces éléments
 * payés pour les DOUZE MOIS précédents ». Elles ne font pas une somme à part
 * (audit D2-B3, C5) · elles s'ajoutent au taux journalier de CHAQUE jour de
 * préavis et de congé indemnisé. Les deux listes ne sont pas identiques
 * (gratifications à l'art. 66, prestations supplémentaires à l'art. 142) ·
 * deux moyennes, une par rubrique.
 */
export function decompteFinal(params: ParametresDecompte): VerdictDecompteFinal {
  const preavis = preavisLegal(params);
  const conge = congeLegal(params);
  const rubriques: RubriqueDecompte[] = [];
  const horsBrut: RubriqueDecompte[] = [];
  const duParLeTravailleur: RubriqueDecompte[] = [];
  const jour = params.remunerationJournaliereFc ?? null;
  const saisi = (v: number | null | undefined): number | null => (typeof v === 'number' ? v : null);
  const parJour = (mensuelle: number | null) => (mensuelle === null ? null : mensuelle / JOURS_PAR_MOIS_DE_MOYENNE);
  const moyenne66 = parJour(saisi(params.moyenneMensuelleArticle66Fc));
  const moyenne142 = parJour(saisi(params.moyenneMensuelleArticle142Fc));
  const conversionMoyenne =
    `la moyenne mensuelle des douze mois est ramenée au jour par ${JOURS_PAR_MOIS_DE_MOYENNE}, multiplicateur MOIS de l'article 7 du décret n° 25/22 (convention d'OmegaX)`;

  // 1 · Arriérés.
  rubriques.push({
    cle: 'arrieres',
    libelle: 'Arriérés de rémunération et jours prestés non payés',
    montantFc: saisi(params.arrieresFc),
    fondement: "Article 100 · « toute somme restant due en exécution d'un contrat de travail ».",
    reserve:
      saisi(params.arrieresFc) === null
        ? "Aucun livre ne porte ce qui reste dû à la date de cessation · le montant est saisi. Un préavis PRESTÉ s'y paie, en salaire."
        : null,
  });

  // A9 (M3) · le sort des allocations familiales du temps restant n'est dit
  // que si une rubrique des art. 66 ou 67 s'applique EFFECTIVEMENT, ou si le
  // travailleur est parti avant la moitié d'un préavis reçu.
  let sortDuTempsRestant: string | null = null;

  // 2 · Indemnité de préavis (art. 63, al. 3), ou ce qui en tient lieu.
  const LIBELLE_PREAVIS = 'Indemnité compensatrice de préavis';
  if (params.motif === 'COMMUN_ACCORD') {
    const convenu = saisi(params.montantConvenuCommunAccordFc);
    rubriques.push({
      cle: 'preavis',
      libelle: 'Indemnité convenue de rupture d’un commun accord',
      montantFc: convenu,
      fondement: preavis.motifAucunPreavis as string,
      reserve: convenu === null ? "Le montant convenu par les parties n'est pas renseigné · zéro est une réponse, l'absence n'en est pas une." : null,
    });
  } else if (preavis.motifIndetermine !== null) {
    rubriques.push({ cle: 'preavis', libelle: LIBELLE_PREAVIS, montantFc: null, fondement: preavis.fondement, reserve: preavis.motifIndetermine });
  } else if (preavis.joursOuvrables === null) {
    rubriques.push({ cle: 'preavis', libelle: LIBELLE_PREAVIS, montantFc: 0, fondement: preavis.motifAucunPreavis as string, reserve: null });
  } else {
    const jours = preavis.joursOuvrables;
    const execution = params.executionPreavis ?? null;
    const responsable = params.partieResponsable ?? params.initiative;
    const fondementDuree = `${preavis.fondement} · ${jours} jours ouvrables.`;
    if (execution === null) {
      rubriques.push({
        cle: 'preavis',
        libelle: LIBELLE_PREAVIS,
        montantFc: null,
        fondement: fondementDuree,
        reserve:
          "L'exécution du préavis n'est pas déclarée · l'article 63, alinéa 3 ne rend l'indemnité due que si le préavis n'a pas été intégralement observé, et par la partie responsable à l'autre.",
      });
    } else if (execution === 'PRESTE') {
      rubriques.push({
        cle: 'preavis',
        libelle: LIBELLE_PREAVIS,
        montantFc: 0,
        fondement: `${fondementDuree} Préavis presté · il se paie en salaire, aux arriérés, et non en indemnité (art. 63, al. 3).`,
        reserve: null,
      });
    } else if (execution === 'DISPENSE_A_LA_DEMANDE_DU_TRAVAILLEUR') {
      rubriques.push({
        cle: 'preavis',
        libelle: LIBELLE_PREAVIS,
        montantFc: 0,
        fondement: `${fondementDuree} Dispense demandée par le travailleur · il perd le droit à l'indemnité.`,
        reserve: "Lecture du séminaire CPCC (« si le travailleur demande lui-même la dispense, il perd le droit à l'indemnité de préavis ») · le Code ne la nomme pas.",
      });
    } else if (execution === 'DEPART_A_MI_PREAVIS') {
      const r = rubriqueDepartAMiPreavis(params, jours, fondementDuree, jour, moyenne66, conversionMoyenne);
      rubriques.push(r);
      if (r.montantFc !== null) sortDuTempsRestant = AF_DUES_ARTICLE_66;
    } else if (execution === 'DEPART_POUR_NOUVEL_EMPLOI') {
      const r = rubriqueDepartPourNouvelEmploi(params, jours, fondementDuree);
      rubriques.push(r);
      if (r.montantFc === 0) sortDuTempsRestant = AF_PERDUES_ARTICLE_67;
    } else {
      // DISPENSE_PAR_EMPLOYEUR · l'employeur empêche l'exécution, il en répond.
      const nonObserves =
        execution === 'DISPENSE_PAR_EMPLOYEUR' ? jours : saisi(params.joursPreavisNonObserves);
      const doitLEmployeur = execution === 'DISPENSE_PAR_EMPLOYEUR' || responsable === 'EMPLOYEUR';
      // A9 · LE TRAVAILLEUR QUI A REÇU LE PRÉAVIS N'EN DOIT QUE LA MOITIÉ ·
      // l'art. 66, al. 1 le laisse « cesser le travail à l'expiration de la
      // moitié du délai de préavis que l'employeur est tenu de lui donner ».
      // Le délai qu'il est tenu d'observer, au sens de l'art. 63, al. 3 (« le
      // délai de préavis qui n'a pas été effectivement respecté »), est donc
      // cette moitié · seuls les jours non observés AVANT elle lui sont
      // imputables. Lecture d'OmegaX par le texte le plus proche, dite sur la
      // ligne · le Code ne règle pas expressément le départ avant la moitié.
      const preavisRecuParLeTravailleur = !doitLEmployeur && params.initiative === 'EMPLOYEUR';
      const moitie = jours / 2;
      const imputables =
        nonObserves === null || !preavisRecuParLeTravailleur ? nonObserves : nonObserves - moitie;
      // Parti à la moitié ou après · rien d'imputable, c'est l'art. 66.
      const relevantDeLArticle66 =
        preavisRecuParLeTravailleur && nonObserves !== null && nonObserves >= 0 && nonObserves <= moitie;
      const avantages = saisi(params.avantagesPendantPreavisFc);
      let montant: number | null = null;
      let reserve: string | null = null;
      if (nonObserves === null) {
        reserve = "Le nombre de jours ouvrables de préavis non observés n'est pas renseigné.";
      } else if (nonObserves > jours || nonObserves < 0) {
        reserve = `Les jours non observés (${nonObserves}) dépassent la durée du préavis (${jours}).`;
      } else if (relevantDeLArticle66) {
        // RELEVÉ CPCC C5 · « le premier mal saisi fait payer le travailleur ».
        // Parti à la moitié ou après, il a usé d'un droit · rien ne lui est
        // imputé, et c'est l'employeur qui doit le temps restant (art. 66,
        // al. 2). Rien n'est chiffré ici · la somme change de débiteur, et
        // seule la déclaration du départ à mi-préavis la porte.
        reserve =
          `${nonObserves} jours non observés sur ${jours} · le travailleur est parti à la moitié du préavis ou après. ` +
          "Article 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à l'expiration de la moitié du délai de préavis que l'employeur est tenu de lui donner. L'employeur doit la rémunération et les allocations familiales pendant le temps restant à courir. » " +
          'Déclarez le départ à mi-préavis · rien n\'est dû par le travailleur, la rémunération du temps restant l\'est par l\'employeur.' +
          mentionDureeRetenue(params);
      } else if (jour === null) {
        reserve = "Le taux journalier du contrat n'est pas renseigné.";
      } else if (moyenne66 === null) {
        reserve =
          "La moyenne des douze mois de l'article 66, alinéa 3 n'est pas renseignée · elle entre dans la rémunération de chaque jour de préavis (zéro est une réponse).";
      } else if (avantages === null) {
        reserve =
          "Les avantages de toute nature pendant le préavis ne sont pas renseignés · l'article 63, alinéa 3 les compte avec la rémunération (zéro est une réponse).";
      } else {
        montant = (imputables as number) * (jour + moyenne66) + avantages;
      }
      const lectureArticle66 = preavisRecuParLeTravailleur && !relevantDeLArticle66
        ? ` Préavis reçu de l'employeur · le travailleur pouvait cesser à la moitié (${moitie} jours, art. 66, al. 1) ; seuls les ${imputables ?? '?'} jours non observés avant elle lui sont imputés, et les avantages déclarés sont ceux de ces jours.`
        : '';
      const ligne: RubriqueDecompte = {
        cle: 'preavis',
        libelle: LIBELLE_PREAVIS,
        montantFc: montant,
        ...(montant !== null && avantages !== null && avantages > 0 ? { avantagesInclusFc: avantages } : {}),
        fondement: relevantDeLArticle66
          ? `${fondementDuree} Article 66 · le travailleur qui reçoit le préavis peut cesser le travail à l'expiration de la moitié du délai.`
          : `${fondementDuree} Article 63, alinéa 3 · « une indemnité dont le montant correspond à la rémunération et aux avantages de toute nature dont aurait bénéficié le travailleur durant le délai de préavis qui n'a pas été effectivement respecté ». ` +
            `${imputables ?? '?'} jours × (taux journalier + moyenne de l'art. 66) + avantages ; ${conversionMoyenne}.${lectureArticle66}`,
        reserve,
      };
      if (doitLEmployeur || relevantDeLArticle66) {
        // Le départ à la moitié ou après reste dans les rubriques DUES AU
        // travailleur, indéterminé · rangé parmi ce qu'il doit, la rubrique
        // du préavis serait posée à zéro et le solde s'émettrait sans la
        // rémunération que l'employeur lui doit (art. 66, al. 2).
        rubriques.push(ligne);
      } else {
        // AUDIT D2-A1, C4 · le démissionnaire qui n'observe pas son préavis
        // DOIT l'indemnité à l'employeur · la créditer au travailleur
        // inversait le signe.
        if (preavisRecuParLeTravailleur && nonObserves !== null && nonObserves > moitie && nonObserves <= jours) {
          sortDuTempsRestant = AF_NON_DUES_AVANT_LA_MOITIE;
        }
        duParLeTravailleur.push({
          ...ligne,
          libelle: 'Indemnité de préavis due par le travailleur',
          reserve: ligne.reserve ?? (preavisRecuParLeTravailleur ? RESERVE_DEPART_AVANT_LA_MOITIE : null),
        });
        rubriques.push({
          cle: 'preavis',
          libelle: LIBELLE_PREAVIS,
          montantFc: 0,
          fondement: `${fondementDuree} Le préavis non observé l'est par le travailleur · l'indemnité est due PAR lui à l'employeur (art. 63, al. 3), hors du total qui lui revient.`,
          reserve: null,
        });
      }
    }
  }

  // 3 · Rupture d'un CDD avant son terme · article 70.
  if (
    params.typeContrat === 'DUREE_DETERMINEE' &&
    !params.periodeDEssai &&
    (params.motif === 'LICENCIEMENT' || params.motif === 'DEMISSION')
  ) {
    const TEXTE_70 =
      "Article 70 · « Toute rupture du contrat à durée déterminée prononcée en violation de l'article 69 donne lieu à des dommages-intérêts. Lorsque la rupture irrégulière est le fait de l'employeur, ces dommages-intérêts correspondent aux salaires et avantages de toute nature dont le salarié aurait bénéficié pendant la période restant à courir jusqu'au terme de son contrat. »";
    if (params.initiative === 'EMPLOYEUR') {
      const restants = saisi(params.joursRestantsJusquAuTerme);
      const avantages = saisi(params.avantagesJusquAuTermeFc);
      const reserve =
        restants === null
          ? "Les jours de salaire restant à courir jusqu'au terme ne sont pas renseignés."
          : jour === null
            ? "Le taux journalier du contrat n'est pas renseigné."
            : avantages === null
              ? "Les avantages de toute nature jusqu'au terme ne sont pas renseignés (zéro est une réponse)."
              : null;
      rubriques.push({
        cle: 'dommages-interets-art-70',
        libelle: "Dommages-intérêts de rupture d'un contrat à durée déterminée",
        montantFc: reserve === null ? (restants as number) * (jour as number) + (avantages as number) : null,
        ...(reserve === null && (avantages as number) > 0 ? { avantagesInclusFc: avantages as number } : {}),
        fondement: `${TEXTE_70} La qualification de l'irrégularité appartient au dossier.`,
        reserve,
      });
    } else {
      duParLeTravailleur.push({
        cle: 'dommages-interets-art-70',
        libelle: 'Dommages-intérêts dus par le travailleur',
        montantFc: null,
        fondement: TEXTE_70,
        reserve: "Le texte ne chiffre les dommages-intérêts que lorsque la rupture est le fait de l'employeur · ceux dus par le travailleur se fixent au dossier ou par le juge.",
      });
    }
  }

  // 4 · Indemnité compensatrice de congé.
  const reserveConge =
    "ARTICLE 142 · l'allocation se calcule sur « la rémunération », et l'article 7, point 8 en exclut « l'indemnité de logement ou le logement en nature » · ni l'une ni l'autre n'y entre. L'article 142 exclut en outre le logement de la conversion en espèces des avantages en nature, « EXCEPTION FAITE SEULEMENT POUR LE LOGEMENT ». Le séminaire CPCC porte une « indemnité congé / logement » que le texte n'ouvre pas ; une indemnité de logement restant due pendant le congé relève du contrat (art. 138), hors de l'indemnité compensatoire.";
  const fondementConge = `Article 144 · « en cas de résiliation du contrat, QUEL QUE SOIT LE MOMENT où celle-ci intervient, le congé est remplacé par une indemnité compensatoire calculée conformément à l'article 142 ». ${conge.joursOuvrables} jours ouvrables × (taux journalier + moyenne de l'art. 142, al. 2) ; ${conversionMoyenne}.`;
  if (jour === null) {
    rubriques.push({ cle: 'conge', libelle: 'Indemnité compensatrice de congé', montantFc: null, fondement: fondementConge, reserve: "Le taux journalier du contrat n'est pas renseigné." });
  } else if (moyenne142 === null) {
    rubriques.push({
      cle: 'conge',
      libelle: 'Indemnité compensatrice de congé',
      montantFc: null,
      fondement: fondementConge,
      reserve:
        "La moyenne des douze mois de l'article 142, alinéa 2 n'est pas renseignée · elle entre dans l'allocation de chaque jour de congé (zéro est une réponse). Les bulletins émis dans OmegaX la portent quand ils existent · elle est relevée et saisie.",
    });
  } else {
    rubriques.push({
      cle: 'conge',
      libelle: 'Indemnité compensatrice de congé',
      montantFc: conge.joursOuvrables * (jour + moyenne142),
      fondement: fondementConge,
      reserve: reserveConge,
    });
  }

  // 5 · Gratification.
  rubriques.push({
    cle: 'gratification',
    libelle: 'Gratification',
    montantFc: saisi(params.gratificationFc),
    fondement:
      "Article 7, point 8 · les sommes versées à titre de gratification sont des éléments de la rémunération. AUCUN article n'en impose le versement.",
    reserve:
      saisi(params.gratificationFc) === null
        ? "La gratification n'est pas légale · son absence n'est pas un manque, et OmegaX ne la présume ni due ni nulle."
        : null,
  });

  // 6 · Allocations familiales, hors du brut (audit D2-B6).
  const enfants = saisi(params.enfantsBeneficiairesAllocations);
  const joursAf = saisi(params.joursAllocationsFamiliales);
  const tauxAf = saisi(params.allocationFamilialeParEnfantFc);
  let montantAf: number | null = null;
  let reserveAf: string | null = null;
  if (enfants === 0) {
    montantAf = 0;
  } else if (enfants === null || joursAf === null) {
    reserveAf = "Le nombre d'enfants bénéficiaires et les jours pour lesquels les allocations sont dues sont saisis · OmegaX ne déduit aucun décompte de jours.";
  } else if (tauxAf === null) {
    reserveAf = params.explicationAllocationFamiliale ?? "Le taux de la colonne 19 n'est pas lu · le mois de cessation n'est pas renseigné.";
  } else {
    montantAf = enfants * joursAf * tauxAf;
  }
  // A9 · les allocations du temps restant suivent l'article qui le régit ·
  // dues sous l'art. 66, al. 2, perdues sous l'art. 67, non dues avant la
  // moitié. Les jours restent saisis · OmegaX dit ce qu'ils doivent compter,
  // il ne les recompte pas.
  if (reserveAf === null && montantAf !== null && montantAf > 0) reserveAf = sortDuTempsRestant;
  horsBrut.push({
    cle: 'allocations-familiales',
    libelle: 'Allocations familiales',
    montantFc: montantAf,
    fondement:
      "Article 142, alinéa 3 · « Les allocations familiales sont dues pendant toute la durée du congé. » Article 66, alinéa 2 · « L'employeur doit la rémunération et les allocations familiales pendant le temps restant à courir. » Hors du brut, comme la formule 20 du modèle de livre de paie de 2008 ; les inclure dans l'indemnité de préavis (« avantages de toute nature ») est une lecture, et les jours se saisissent.",
    reserve: reserveAf,
  });

  const somme = (lignes: readonly RubriqueDecompte[]) =>
    lignes.some((r) => r.montantFc === null) ? null : lignes.reduce((n, r) => n + (r.montantFc as number), 0);
  const totalBrutFc = somme(rubriques);
  const totalHorsBrut = somme(horsBrut);
  const totalDuAuTravailleurFc = totalBrutFc === null || totalHorsBrut === null ? null : totalBrutFc + totalHorsBrut;

  return {
    preavis,
    conge,
    rubriques,
    totalBrutFc,
    horsBrut,
    totalDuAuTravailleurFc,
    duParLeTravailleur,
    echeancePaiement: `Articles 100 et 145, alinéa 2 · au plus tard dans les ${DELAI_PAIEMENT_JOURS_OUVRABLES} JOURS OUVRABLES qui suivent la cessation des services.`,
    reserves: [
      "UN SOLDE PARTIEL SE LIT COMME UN SOLDE · dès qu'une rubrique est indéterminée, le total l'est aussi. Le travailleur signe pour ce qui est écrit.",
      // AUDIT D2-B4 · « usage professionnel » était une lacune déclarée à tort :
      // l'arrêté de 2008 fait du décompte écrit une OBLIGATION à toute rupture.
      DECOMPTE_A_LA_RUPTURE,
      SANCTION_ARTICLE_103,
      // A8 · UNE GARANTIE NÉGATIVE VIEILLIT (P5) · ces deux phrases disaient
      // qu'OmegaX n'émettait rien et n'appliquait aucune retenue. L'émission
      // existe depuis A8 (`decompte-final-emis.ts`) · elles le disent.
      "CE CALCUL N'EST PAS ENCORE LE DÉCOMPTE ÉCRIT · il le devient à l'ÉMISSION, qui fige le document daté que l'employeur remet au travailleur, dans la numérotation continue des bulletins, avec ses retenues et son net.",
      "LES RETENUES S'APPLIQUENT À L'ÉMISSION · l'assiette sociale, l'assiette fiscale et le barème de l'article 118 valent pour le décompte comme pour un mois ordinaire (`assiettes-paie.ts`, `bareme-irpp.ts`), sur le mois de cessation. Aucune retenue « syndicat » n'est appliquée · l'article 112 énumère les retenues autorisées et ne la nomme pas.",
      ...preavis.reserves,
      ...conge.reserves,
    ],
  };
}
