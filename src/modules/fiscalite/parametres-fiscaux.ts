/**
 * PARAMÈTRES CHIFFRÉS DE L'IMPÔT SUR LES BÉNÉFICES · loi n° 23/053 du
 * 30 novembre 2023, applicable depuis le 1er janvier 2026, et ses arrêtés
 * d'application du 19 février 2025.
 *
 * Un seul fichier pour tous les chiffres, comme le socle de la compétence
 * `fiscalite-rdc` dont ils sont lus : un taux recopié dans le service
 * divergerait à la première loi de finances. Chaque valeur cite son article.
 *
 * Plusieurs de ces valeurs sont expressément RÉAJUSTABLES par arrêté du
 * Ministre des Finances (art. 107, 109 et 128) · la date ci-dessous est celle
 * de leur dernière vérification, pas celle de leur promulgation.
 */

export const DERNIERE_VERIFICATION_FISCALE = '2026-09-03';

/** Loi de finances n° 25/060 du 29 décembre 2025 · aucune de ces valeurs n'a bougé pour 2026. */
export const IMPOT_SOCIETES = {
  /** Art. 56 · taux sur le bénéfice net imposable. */
  taux: 0.3,
  /**
   * Art. 57 · impôt minimum assis sur le chiffre d'affaires déclaré, dû
   * lorsque le résultat est déficitaire, ou bénéficiaire mais susceptible de
   * donner une imposition inférieure.
   */
  tauxMinimum: 0.01,
  /** Art. 51 · les pertes se reportent sur les trois exercices suivants. */
  exercicesReportDeficit: 3,
  /**
   * Art. 57 bis LPF, tel que modifié par la loi de finances n° 25/060 · la
   * rédaction de 2023 (« avant le 1er août… ») est périmée.
   */
  acomptes: [
    { quotite: 0.3, echeance: '25 juillet' },
    { quotite: 0.3, echeance: '25 septembre' },
    { quotite: 0.2, echeance: '25 novembre' },
  ],
  /** Art. 12 LPF · déclaration au 30 avril de l'année suivant les revenus. */
  echeanceDeclaration: '30 avril',
} as const;

/** Régimes d'imposition des PERSONNES PHYSIQUES · Titre III de la loi 23/053. */
export const IMPOT_REVENU_PERSONNES_PHYSIQUES = {
  /** Art. 107 · chiffre d'affaires annuel hors taxes au plus égal à ce seuil. */
  seuilMicroEntreprise: 25_000_000,
  /** Art. 109 · de 25 000 001 à 300 000 000 FC. Au-delà, régime réel (art. 112). */
  seuilPetiteEntreprise: 300_000_000,
  /** Art. 127 · petites entreprises, sur le chiffre d'affaires annuel réalisé. */
  tauxPetiteEntreprise: { VENTE: 0.01, PRESTATIONS: 0.02 },
  /**
   * Art. 128 et arrêté n° 015/CAB/MIN/FINANCES/2025 du 19 février 2025 ·
   * forfait annuel des micro-entreprises, libellé EN DOLLARS. Sa valeur en
   * francs dépend du taux de change fixé par une circulaire que le dépôt n'a
   * pas · il ne se convertit donc pas ici, il se lit tel quel.
   */
  forfaitMicroEntrepriseUsd: 30,
  /** Art. 122 · minimum de perception au régime réel, dont les micro-entreprises sont dispensées. */
  tauxMinimumRegimeReel: 0.01,
  /** Art. 17 LPF · déclaration au 30 avril. */
  echeanceDeclaration: '30 avril',
} as const;

/** Prélèvement exceptionnel sur le personnel expatrié · art. 145 à 149, non déductible (art. 50, 2°). */
export const TAUX_PRELEVEMENT_EXPATRIES = 0.25;

/**
 * MODALITÉS DE PAIEMENT DE L'IRPP AU RÉGIME DES PETITES ENTREPRISES ·
 * art. 57, al. 3 et art. 57 quater de la loi de procédures fiscales.
 *
 * CE N'EST PAS L'ÉCHÉANCIER DE L'IMPÔT SUR LES SOCIÉTÉS. L'art. 57 bis, qui
 * porte les trois acomptes de 30 %, 30 % et 20 % aux 25 juillet, 25 septembre
 * et 25 novembre, vise « les acomptes provisionnels visés à l'article 57,
 * ALINÉA 2 » · c'est-à-dire l'impôt sur les sociétés et l'IRPP au RÉGIME RÉEL.
 * La petite entreprise relève de l'alinéa 3, qui lui donne un mode de
 * paiement à elle :
 *
 *   Art. 57, al. 3 : « L'Impôt sur le Revenu des Personnes Physiques dans les
 *   catégories de bénéfices des activités industrielles, commerciales,
 *   immobilières et artisanales, de bénéfices des professions non
 *   commerciales et de bénéfices de l'exploitation agricole suivant le régime
 *   d'imposition des petites entreprises est payé en deux quotités. »
 *
 *   Art. 57 quater : « Les deux quotités […] représentent respectivement 60 %
 *   et 40 % de l'impôt dû. La 1ère quotité […] est payée à la souscription de
 *   la déclaration auto liquidative, au plus tard le 31 janvier de l'année qui
 *   suit celle de la réalisation des revenus. »
 *
 * RÉSERVE SUR LA SECONDE ÉCHÉANCE, et elle est dans le texte officiel, pas
 * dans cette lecture · le troisième alinéa de l'art. 57 quater écrit une
 * seconde fois « La 1ère quotité est acquittée à l'aide d'un bordereau de
 * versement, au plus tard le 30 avril de la même année ». La compilation DGI
 * au 19 juillet 2026 porte le défaut tel quel. Le 31 janvier de la première
 * quotité est incontestable ; le 30 avril est la date que porte l'alinéa
 * consacré au second versement, mais sous un libellé fautif · d'où la
 * réserve, servie avec la ligne.
 */
export const QUOTITES_PETITE_ENTREPRISE = [
  {
    rang: 1,
    quotite: 0.6,
    echeance: '31 janvier',
    source: 'Loi de procédures fiscales, art. 57, al. 3 et art. 57 quater, al. 2',
    reserve: null as string | null,
  },
  {
    rang: 2,
    quotite: 0.4,
    echeance: '30 avril',
    source: 'Loi de procédures fiscales, art. 57, al. 3 et art. 57 quater, al. 3',
    reserve:
      "Échéance à confirmer auprès du service gestionnaire : l'art. 57 quater, al. 3 écrit une seconde fois « La 1ère quotité est acquittée […] au plus tard le 30 avril de la même année ». Le défaut de rédaction est celui du texte officiel, repris tel quel par la compilation DGI au 19 juillet 2026.",
  },
] as const;

/**
 * Fenêtre d'exercices antérieurs observée pour appliquer l'art. 113 de la loi
 * n° 23/053 · le déclassement d'un régime ne joue qu'après DEUX exercices
 * consécutifs sous le seuil, et d'un seul cran à la fois. Deux exercices
 * suffiraient à la règle elle-même ; trois permettent de reconstituer le
 * régime EN VIGUEUR à l'exercice précédent, dont dépend le cran.
 */
export const EXERCICES_OBSERVES_REGIME = 3;
