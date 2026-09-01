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
