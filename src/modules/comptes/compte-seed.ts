import { ClasseCompte } from '@prisma/client';

/**
 * Plan de comptes SYCEBNL de base proposé automatiquement à la création d'un
 * tenant (voir l'écran « Onboarding » du canevas de design). Numéros et
 * intitulés vérifiés contre le référentiel officiel (skill `sycebnl`,
 * `partie2-ch3-classe*`) — ne pas ajouter de compte ici sans l'avoir vérifié
 * de la même façon : ce fichier fait autorité pour le MVP.
 *
 * Volontairement minimal (Phase 1) : juste assez de comptes pour les
 * opérations couvertes par la saisie guidée (dons, cotisations, achats,
 * salaires, trésorerie, fonds propres/affectés/reportés). Étoffé au fil des
 * phases suivantes plutôt que d'un coup.
 */
export const PLAN_COMPTES_SYCEBNL: Array<{
  numero: string;
  intitule: string;
  classe: ClasseCompte;
}> = [
  // Classe 1 — Fonds propres et ressources durables
  { numero: '101000', intitule: 'Dotation non consomptible sans droit de reprise', classe: ClasseCompte.CLASSE_1 },
  { numero: '160000', intitule: 'Fonds affectés', classe: ClasseCompte.CLASSE_1 },
  { numero: '170000', intitule: 'Fonds reportés', classe: ClasseCompte.CLASSE_1 },

  // Classe 5 — Trésorerie
  { numero: '521100', intitule: 'Banque', classe: ClasseCompte.CLASSE_5 },
  { numero: '571000', intitule: 'Caisse', classe: ClasseCompte.CLASSE_5 },

  // Classe 6 — Charges des activités ordinaires
  { numero: '605000', intitule: 'Achats de fournitures', classe: ClasseCompte.CLASSE_6 },
  { numero: '618100', intitule: 'Voyages et déplacements du personnel', classe: ClasseCompte.CLASSE_6 },
  { numero: '661000', intitule: 'Rémunérations du personnel', classe: ClasseCompte.CLASSE_6 },

  // Classe 7 — Produits des activités ordinaires
  { numero: '701000', intitule: 'Cotisations des adhérents', classe: ClasseCompte.CLASSE_7 },
  { numero: '704100', intitule: 'Dons (revenus liés à la générosité)', classe: ClasseCompte.CLASSE_7 },
  { numero: '711000', intitule: "Subventions d'exploitation", classe: ClasseCompte.CLASSE_7 },
];
