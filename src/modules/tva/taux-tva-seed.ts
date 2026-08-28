/**
 * Taux de TVA proposés par défaut à la création d'un tenant, d'après
 * l'Ordonnance-Loi n° 10/001 du 20/08/2010 (art. 35), telle que modifiée par
 * l'art. 46 de la Loi de Finances n° 25/060 du 29/12/2025 (exercice 2026) —
 * skill `fiscalite-rdc`, `tva/references/04-base-imposition-taux.md`.
 *
 * Le taux réduit de 5 % est réservé au seul cas des billets d'avion sur le
 * trafic aérien national (les 24 produits de première nécessité et les 5
 * matières premières industrielles sont, eux, au taux de 1 % — ne pas
 * confondre avec l'ancien taux réduit unique de 8 %, abrogé). Le compte de
 * TVA récupérable n'est volontairement pas seedé pour le taux zéro : les
 * exportations n'ouvrent droit à récupération que sur la TVA d'amont, pas
 * sur l'opération elle-même (aucune TVA n'est facturée au taux zéro).
 *
 * Pas de taux "EXONÉRÉ" seedé : une opération exonérée (ex. art. 15.2/17.8 —
 * ventes, importations et prestations des ASBL conformes à leur objet) ne
 * porte aucune ligne de TVA ; ce n'est pas un taux à 0 %, donc rien à seeder
 * ici (voir le commentaire du modèle TauxTva dans schema.prisma).
 */
export const TAUX_TVA_DEFAUT: Array<{
  code: string;
  intitule: string;
  taux: number;
  numeroCompteCollecte?: string;
  numeroCompteDeductible?: string;
}> = [
  { code: 'TVA16', intitule: 'Taux normal 16 %', taux: 16, numeroCompteCollecte: '443100', numeroCompteDeductible: '445100' },
  { code: 'TVA1', intitule: 'Taux réduit 1 %', taux: 1, numeroCompteCollecte: '443100', numeroCompteDeductible: '445100' },
  { code: 'TVA5', intitule: 'Taux réduit 5 % (billets d’avion, trafic aérien national)', taux: 5, numeroCompteCollecte: '443100', numeroCompteDeductible: '445100' },
  { code: 'TVA0', intitule: 'Taux zéro (exportations)', taux: 0, numeroCompteCollecte: '443100' },
];
