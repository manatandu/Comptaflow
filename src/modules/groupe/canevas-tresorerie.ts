/**
 * CANEVAS DE TRÉSORERIE · le fichier Excel officiel qu'une cellule non
 * autonome remplit et dépose. Une seule liste de rubriques, FERMÉE : c'est
 * elle qui rend l'import automatique (aucun mappage de colonnes) et qui
 * force les transferts internes sur le compte 58, condition du contrôle de
 * neutralisation du groupe. Les numéros pointent sur le plan SYCEBNL semé
 * dans chaque dossier (compte-seed.ts) · un trésorier choisit une rubrique
 * dans une liste déroulante, jamais un numéro de compte.
 */

export const MARQUEUR_CANEVAS = 'OMEGAX-CANEVAS-V1';

export type SensRubrique = 'recette' | 'depense';

export interface RubriqueCanevas {
  libelle: string;
  compte: string;
  sens: SensRubrique;
}

export const RUBRIQUES_CANEVAS: RubriqueCanevas[] = [
  // Recettes
  { libelle: 'Cotisations des membres', compte: '70100000', sens: 'recette' },
  { libelle: 'Dons et offrandes', compte: '70410000', sens: 'recette' },
  { libelle: 'Deniers du culte', compte: '70430000', sens: 'recette' },
  { libelle: 'Dîmes, quêtes et assimilées', compte: '70440000', sens: 'recette' },
  { libelle: 'Célébrations', compte: '70450000', sens: 'recette' },
  { libelle: 'Revenus des manifestations', compte: '70600000', sens: 'recette' },
  { libelle: 'Subventions reçues', compte: '71300000', sens: 'recette' },
  { libelle: 'Produits accessoires et autres recettes', compte: '70700000', sens: 'recette' },
  { libelle: 'Transfert reçu du siège ou d’une cellule', compte: '58500000', sens: 'recette' },
  // Dépenses
  { libelle: 'Achats de biens et fournitures', compte: '60100000', sens: 'depense' },
  { libelle: 'Transports et déplacements', compte: '61800000', sens: 'depense' },
  { libelle: 'Locations et charges locatives', compte: '62200000', sens: 'depense' },
  { libelle: 'Entretien et réparations', compte: '62400000', sens: 'depense' },
  { libelle: 'Frais de télécommunications', compte: '62800000', sens: 'depense' },
  { libelle: 'Frais bancaires', compte: '63100000', sens: 'depense' },
  { libelle: 'Frais de formation', compte: '63300000', sens: 'depense' },
  { libelle: 'Impôts et taxes', compte: '64100000', sens: 'depense' },
  { libelle: 'Aides et secours versés', compte: '65200000', sens: 'depense' },
  { libelle: 'Rémunérations du personnel', compte: '66100000', sens: 'depense' },
  { libelle: 'Achat de matériel et mobilier (immobilisation)', compte: '24410000', sens: 'depense' },
  { libelle: 'Charges diverses', compte: '65800000', sens: 'depense' },
  { libelle: 'Transfert envoyé au siège ou à une cellule', compte: '58500000', sens: 'depense' },
];

/** Comptes de trésorerie du canevas · colonne « Caisse ou banque ». */
export const TRESORERIES_CANEVAS: Record<string, { compte: string; journal: 'CA' | 'BQ' }> = {
  Caisse: { compte: '57100000', journal: 'CA' },
  Banque: { compte: '52110000', journal: 'BQ' },
};

/** Première ligne de données du canevas (après marqueur, cartouche et en-têtes). */
export const PREMIERE_LIGNE_DONNEES = 6;
export const DERNIERE_LIGNE_DONNEES = 505;
