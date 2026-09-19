/**
 * LA QUOTITÉ CESSIBLE ET SAISISSABLE · ARTICLE 114 DU CODE DU TRAVAIL.
 *
 * Ce fichier ne saisit rien et n'exécute rien. Il dit, pour une rémunération
 * donnée, QUELLE PART un créancier peut atteindre · le reste est insaisissable,
 * et c'est une règle de PROTECTION, pas une règle de calcul. Cette qualité
 * commande toutes les lectures d'éditeur qui suivent.
 *
 * ARTICLE 114, LES QUATRE ALINÉAS, VERBATIM :
 *  1. « La rémunération du travailleur n'est cessible et saisissable qu'à
 *     concurrence d'un cinquième sur la partie n'excédant pas CINQ FOIS le
 *     salaire mensuel minimum interprofessionnel DE SA CATÉGORIE et d'un
 *     tiers sur le surplus. »
 *  2. « Elle est cessible et saisissable à concurrence de DEUX CINQUIÈMES
 *     lorsque la créance est fondée sur une obligation alimentaire légale. »
 *  3. « La saisie et la cession autorisées pour toute créance et celles
 *     autorisées pour cause d'obligation alimentaire légale peuvent s'opérer
 *     CUMULATIVEMENT. »
 *  4. « Le calcul des quotités cessibles et saisissables se fait APRÈS
 *     déduction des retenues fiscales et sociales ET DE L'ÉVALUATION
 *     FORFAITAIRE DU LOGEMENT, tel que défini à l'article 139 du présent
 *     Code. »
 *
 * ────────────────────────────────────────────────────────────────────────
 * LE MOT « LOGEMENT » PORTE ICI TROIS OBJETS DISTINCTS, ET LES CONFONDRE
 * FAUSSE LE CALCUL DANS LES DEUX SENS.
 *
 *  1. L'INDEMNITÉ DE LOGEMENT · articles 7 litera h et 138. Elle est HORS
 *     rémunération. Elle n'a donc pas à être déduite : elle n'est jamais
 *     entrée dans la base.
 *  2. LA VALEUR MAXIMALE DE REMBOURSEMENT DU LOGEMENT FOURNI EN NATURE ·
 *     article 139 a), fixée par un ARRÊTÉ du Ministre du Travail pris après
 *     avis du Conseil National du Travail. C'EST CELLE-LÀ, ET ELLE SEULE,
 *     que l'alinéa 4 de l'article 114 fait déduire. CET ARRÊTÉ N'EST PAS AU
 *     CORPUS D'OMEGAX.
 *  3. LA CONTRE-VALEUR DU LOGEMENT · décret n° 25/22 article 6, colonne 20
 *     des annexes, défalcable de l'indemnité de logement POUR CAUSE DE
 *     MUTATION SEULEMENT (décret n° 25/21, article 15). Un décret du Premier
 *     ministre, pas un arrêté ministériel · un autre auteur, un autre objet,
 *     une autre condition.
 *
 * CORRECTION D'UNE ERREUR DE CE DÉPÔT · la passe de recherche du 19/09/2026
 * a conclu que « l'arrêté de l'article 139 n'existe pas, il est dans le
 * décret SMIG ». C'EST FAUX, et c'était le point 3 pris pour le point 2.
 * L'article 139 a) annonce un arrêté qui fixe « les cas dans lesquels le
 * logement doit être fourni, SA VALEUR MAXIMALE DE REMBOURSEMENT, et les
 * conditions auxquelles il doit répondre » · un décret portant fixation
 * d'une contre-valeur n'est pas cet arrêté, et n'en tient pas lieu.
 * Conséquence pratique : dès qu'un logement est FOURNI EN NATURE avec
 * remboursement, la quotité N'EST PAS CHIFFRABLE, et OmegaX s'en abstient.
 * ────────────────────────────────────────────────────────────────────────
 *
 * « SA CATÉGORIE » · CE QUE LE DÉPÔT EN FAIT, ET POURQUOI IL DEMANDE LA
 * CLASSE. Les annexes du décret n° 25/22 portent SEPT catégories et
 * DIX-SEPT classes · une catégorie couvre plusieurs échelons, à des taux
 * différents. « Le salaire mensuel minimum interprofessionnel de sa
 * catégorie » ne désigne donc pas un nombre tant que l'échelon n'est pas
 * connu. OmegaX demande la CLASSE, qui est la détermination la plus fine que
 * le décret porte, et refuse plutôt que de prendre le premier échelon de la
 * catégorie pour le compte de tous : ce choix abaisserait le seuil, ferait
 * basculer plus tôt au tiers, et AUGMENTERAIT la part saisissable. Une règle
 * de protection ne se tranche pas contre celui qu'elle protège.
 *
 * LA CONVENTION COLLECTIVE NE BLOQUE PAS CE CALCUL, contrairement à ce que
 * le journal P0 annonçait. L'article 114 vise le salaire minimum
 * INTERPROFESSIONNEL, qui est celui du décret · une convention collective ne
 * peut être que plus favorable, et ce qu'elle ajoute n'est pas ce seuil.
 *
 * LE MENSUEL SE TIRE DU JOURNALIER · le décret ne fixe qu'un taux journalier.
 * Son article 7 donne le multiplicateur du mois, vingt-six. Le mensuel
 * minimum de la classe est donc le taux journalier de la colonne fois 26.
 */

import {
  MULTIPLICATEURS_ARTICLE_7,
  annexeApplicable,
  colonneDeLaClasse,
  type Annexe,
} from './bareme-smig';

/** Alinéa 1er · « cinq fois le salaire mensuel minimum […] de sa catégorie ». */
export const MULTIPLE_DU_MINIMUM_CATEGORIEL = 5;

/** Alinéa 1er · un cinquième sous le seuil, un tiers au-dessus. */
export const FRACTION_SOUS_LE_SEUIL = { numerateur: 1, denominateur: 5 } as const;
export const FRACTION_AU_DESSUS_DU_SEUIL = { numerateur: 1, denominateur: 3 } as const;

/** Alinéa 2 · deux cinquièmes pour une obligation alimentaire légale. */
export const FRACTION_OBLIGATION_ALIMENTAIRE = { numerateur: 2, denominateur: 5 } as const;

/** Le mois de l'article 7 du décret n° 25/22 · vingt-six jours. */
export const JOURS_DU_MOIS = MULTIPLICATEURS_ARTICLE_7.MOIS;

export type MotifAbstentionQuotite =
  | 'CLASSE_PROFESSIONNELLE_ABSENTE'
  | 'MOIS_HORS_ANNEXE'
  | 'LOGEMENT_EN_NATURE_NON_CHIFFRABLE';

export type EntreeQuotite = {
  /** AAAA-MM · il choisit l'annexe, donc le seuil. */
  readonly moisDePaie: string;
  /**
   * LA RÉMUNÉRATION AU SENS DE L'ARTICLE 7, litera h · c'est exactement ce
   * que rend `assietteSociale` du module des assiettes. Les cinq exclusions
   * de l'article 7 en sont déjà sorties, l'indemnité de logement comprise.
   */
  readonly remunerationFc: number;
  /** La classe de la tension salariale, 1 à 17. Absente, on s'abstient. */
  readonly classeProfessionnelle?: number | null;
  /** Alinéa 4 · la retenue de l'article 119, telle que liquidée. */
  readonly retenuesFiscalesFc?: number;
  /** Alinéa 4 · la quote-part ouvrière de la CNSS, et elle seule ici. */
  readonly retenuesSocialesFc?: number;
  /**
   * Alinéa 4 · un logement est-il FOURNI EN NATURE avec remboursement ?
   * Répondu oui, la quotité n'est pas chiffrable tant que l'arrêté de
   * l'article 139 a) n'est pas au corpus. Ce n'est pas l'indemnité de
   * logement, qui est hors rémunération et ne se déduit pas.
   */
  readonly logementFourniEnNature?: boolean;
  /** La créance poursuit-elle une obligation alimentaire légale ? */
  readonly obligationAlimentaireLegale?: boolean;
};

export type VerdictQuotite = {
  /** La base de l'alinéa 4, après les trois déductions. `null` si abstention. */
  readonly baseFc: number | null;
  /** Cinq fois le mensuel minimum de la classe. `null` si abstention. */
  readonly seuilFc: number | null;
  /** Le mensuel minimum de la classe, avant le multiple de cinq. */
  readonly mensuelMinimumFc: number | null;
  /** La part atteignable pour une créance ordinaire. */
  readonly quotiteOrdinaireFc: number | null;
  /** La part atteignable au titre d'une obligation alimentaire légale. */
  readonly quotiteAlimentaireFc: number | null;
  /** Alinéa 3 · le cumul des deux, quand les deux jouent. */
  readonly quotiteCumuleeFc: number | null;
  /** Ce qui reste hors d'atteinte. */
  readonly partInsaisissableFc: number | null;
  readonly abstentions: readonly { motif: MotifAbstentionQuotite; explication: string }[];
  readonly reserves: readonly string[];
  readonly annexe: Annexe | null;
  readonly colonne: number | null;
};

/**
 * L'ALINÉA 3 AUTORISE LE CUMUL SANS LUI DONNER DE PLAFOND, et OmegaX ne lui
 * en invente pas. Sur une rémunération assez basse, un cinquième plus deux
 * cinquièmes font trois cinquièmes, et rien dans le texte ne les ramène à
 * une fraction moindre. La réserve le dit plutôt que le code ne le borne :
 * borner serait légiférer.
 */
export const RESERVE_CUMUL =
  "ALINÉA 3 · le cumul de la quotité ordinaire et de la quotité alimentaire est AUTORISÉ par le texte, " +
  "qui ne lui fixe AUCUN PLAFOND. OmegaX rend donc la somme telle quelle et ne la ramène pas d'office à " +
  "une fraction moindre. Le montant effectivement retenu relève du titre exécutoire et du juge, pas du logiciel.";

export const RESERVE_CATEGORIE =
  "« SA CATÉGORIE » · les annexes du décret n° 25/22 portent sept catégories et dix-sept classes, et une " +
  "catégorie couvre plusieurs échelons à des taux différents. OmegaX prend le taux de la CLASSE, qui est la " +
  "détermination la plus fine du décret. Prendre le premier échelon de la catégorie abaisserait le seuil et " +
  "augmenterait la part saisissable · l'article 114 protège le travailleur, il ne se tranche pas contre lui.";

export const RESERVE_LOGEMENT =
  "ARTICLE 139 a) · l'arrêté qui fixe « la valeur maximale de remboursement » du logement fourni en nature " +
  "n'est PAS au corpus d'OmegaX. Il ne faut pas le confondre avec la CONTRE-VALEUR du logement du décret " +
  "n° 25/22 (colonne 20), qui est un décret, pas un arrêté, et qui ne se défalque que de l'indemnité de " +
  "logement et POUR CAUSE DE MUTATION (décret n° 25/21, article 15). Ni avec l'indemnité de logement de " +
  "l'article 138, qui est HORS rémunération par l'article 7 litera h et ne se déduit donc pas une deuxième fois.";

/** Le mensuel minimum d'une classe · taux journalier de la colonne fois 26. */
export function mensuelMinimumDeLaClasse(
  moisDePaie: string,
  classeProfessionnelle: number,
): { montantFc: number; annexe: Annexe; colonne: number } | null {
  const a = annexeApplicable(moisDePaie);
  if (!a.valeur) return null;
  if (!Number.isInteger(classeProfessionnelle)) return null;
  if (classeProfessionnelle < 1 || classeProfessionnelle > a.valeur.tauxParClasse.length) return null;
  const journalier = a.valeur.tauxParClasse[classeProfessionnelle - 1];
  return {
    montantFc: journalier * JOURS_DU_MOIS,
    annexe: a.valeur,
    colonne: colonneDeLaClasse(classeProfessionnelle),
  };
}

const ABSTENU: Omit<VerdictQuotite, 'abstentions' | 'reserves' | 'annexe' | 'colonne'> = {
  baseFc: null,
  seuilFc: null,
  mensuelMinimumFc: null,
  quotiteOrdinaireFc: null,
  quotiteAlimentaireFc: null,
  quotiteCumuleeFc: null,
  partInsaisissableFc: null,
};

export function quotiteSaisissable(entree: EntreeQuotite): VerdictQuotite {
  const abstentions: { motif: MotifAbstentionQuotite; explication: string }[] = [];
  const reserves: string[] = [RESERVE_CATEGORIE, RESERVE_LOGEMENT];

  if (entree.logementFourniEnNature) {
    abstentions.push({
      motif: 'LOGEMENT_EN_NATURE_NON_CHIFFRABLE',
      explication:
        "ALINÉA 4 · le calcul se fait après déduction de « l'évaluation forfaitaire du logement, tel que " +
        "défini à l'article 139 ». Un logement est déclaré fourni EN NATURE, et l'arrêté de l'article 139 a) " +
        "qui en fixe la valeur maximale de remboursement n'est pas au corpus. OmegaX ne chiffre pas la quotité " +
        "plutôt que de la chiffrer sur une base trop haute, ce qui exposerait à la saisie une part protégée.",
    });
  }

  const classe = entree.classeProfessionnelle;
  if (classe === undefined || classe === null) {
    abstentions.push({
      motif: 'CLASSE_PROFESSIONNELLE_ABSENTE',
      explication:
        "ALINÉA 1er · le seuil est « cinq fois le salaire mensuel minimum interprofessionnel de sa catégorie ». " +
        "La classe de la tension salariale du décret n° 25/22 n'est pas renseignée au registre du personnel, et " +
        "sans elle le décret ne porte aucun montant pour ce travailleur.",
    });
  }

  const minimum =
    classe === undefined || classe === null ? null : mensuelMinimumDeLaClasse(entree.moisDePaie, classe);

  if (classe !== undefined && classe !== null && !minimum) {
    abstentions.push({
      motif: 'MOIS_HORS_ANNEXE',
      explication:
        `Aucune annexe du décret n° 25/22 ne couvre le mois de paie ${entree.moisDePaie}, ou la classe ` +
        `${classe} n'est pas une des dix-sept classes de la tension salariale. Le seuil de l'alinéa 1er ne se place pas.`,
    });
  }

  if (abstentions.length > 0 || !minimum) {
    return {
      ...ABSTENU,
      abstentions,
      reserves,
      annexe: minimum ? minimum.annexe : null,
      colonne: minimum ? minimum.colonne : null,
    };
  }

  // ALINÉA 4 · les trois déductions. Le logement n'en est pas une ici : soit
  // il est fourni en nature et on s'est abstenu plus haut, soit c'est une
  // indemnité, et l'article 7 l'a déjà sortie de la rémunération.
  const baseFc = Math.max(
    0,
    entree.remunerationFc -
      Math.max(0, entree.retenuesFiscalesFc ?? 0) -
      Math.max(0, entree.retenuesSocialesFc ?? 0),
  );

  const seuilFc = minimum.montantFc * MULTIPLE_DU_MINIMUM_CATEGORIEL;
  const partBasse = Math.min(baseFc, seuilFc);
  const partHaute = Math.max(0, baseFc - seuilFc);

  const quotiteOrdinaireFc =
    (partBasse * FRACTION_SOUS_LE_SEUIL.numerateur) / FRACTION_SOUS_LE_SEUIL.denominateur +
    (partHaute * FRACTION_AU_DESSUS_DU_SEUIL.numerateur) / FRACTION_AU_DESSUS_DU_SEUIL.denominateur;

  // ALINÉA 2 · deux cinquièmes, et le texte ne les fractionne PAS par tranche.
  // Le découpage au seuil est celui de l'alinéa 1er seulement.
  const quotiteAlimentaireFc = entree.obligationAlimentaireLegale
    ? (baseFc * FRACTION_OBLIGATION_ALIMENTAIRE.numerateur) /
      FRACTION_OBLIGATION_ALIMENTAIRE.denominateur
    : 0;

  const quotiteCumuleeFc = quotiteOrdinaireFc + quotiteAlimentaireFc;
  if (entree.obligationAlimentaireLegale) reserves.push(RESERVE_CUMUL);

  return {
    baseFc,
    seuilFc,
    mensuelMinimumFc: minimum.montantFc,
    quotiteOrdinaireFc,
    quotiteAlimentaireFc,
    quotiteCumuleeFc,
    partInsaisissableFc: Math.max(0, baseFc - quotiteCumuleeFc),
    abstentions,
    reserves,
    annexe: minimum.annexe,
    colonne: minimum.colonne,
  };
}
