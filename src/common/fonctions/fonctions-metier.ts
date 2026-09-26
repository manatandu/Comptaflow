import { FonctionMetier, RoleUtilisateur } from '@prisma/client';

/**
 * PROFIL DE FONCTIONS (point 15 de la comparaison Sage i7).
 *
 * Les manuels i7 du corpus ne décrivent que l'« autorisation d'accès » par
 * mot de passe de fichier. Le découpage fonction par fonction vient du
 * support Sage X3 (skill sage-i7, paie-et-x3.md · « Profils fonctions
 * (quelles fonctions/menus accessibles) »). OmegaX en retient la partie qui
 * s'accorde avec ses rôles, et rien de plus.
 *
 * TROIS RÈGLES, ET CHACUNE EMPÊCHE UN DÉFAUT PRÉCIS.
 *  1. LE PROFIL RESTREINT, IL N'ÉLARGIT JAMAIS · il se lit APRÈS le rôle
 *     (RolesGuard, rôles cantonnés). Un aide-comptable à qui l'on coche
 *     « Validation » ne valide pas pour autant.
 *  2. IL PORTE SUR CE QUI ÉCRIT · POST, PUT, PATCH et DELETE. Les écrans
 *     lisent les comptes, les journaux, les tiers pour s'afficher ; fermer
 *     leurs lectures casserait la saisie elle-même. La confidentialité d'une
 *     DONNÉE (le personnel) relève du rôle cantonné, pas du profil.
 *  3. L'ADMINISTRATEUR N'EST JAMAIS RESTREINT · c'est lui qui lève la
 *     restriction, et un administrateur restreint verrouillerait le dossier.
 *
 * LA TABLE EST PAR CONTRÔLEUR, pas par URL · un chemin se renomme sans que
 * personne pense à cette table, une classe non rangée fait tomber
 * `fonctions-metier.spec.ts`, qui relit les sources.
 */

export const LIBELLES_FONCTION: Record<FonctionMetier, string> = {
  STRUCTURE: 'Structure · plan comptable, journaux, taxes, devises, paramètres',
  TIERS: 'Tiers et modèles de règlement',
  SAISIE: 'Saisie et correction des écritures, régularisations, import',
  VALIDATION: 'Validation des écritures',
  LETTRAGE: 'Lettrage',
  TRESORERIE: 'Rapprochement bancaire et règlements',
  RELANCES: 'Rappels, relevés et courriers',
  IMMOBILISATIONS: 'Immobilisations',
  STOCKS: 'Stocks, magasin et emballages',
  ANALYTIQUE: 'Analytique, bailleurs et donateurs',
  FISCALITE: 'Fiscalité, TVA et exonérations',
  GESTION_COMMERCIALE: 'Facturation et devis',
  PAIE: 'Personnel et paie',
  CLOTURE: "Fin d'exercice, affectation, notes et documents obligatoires",
  REVISION: 'Révision · inventaire, circularisation, provisions, faiblesses',
  GROUPE_ET_IFRS: 'Groupe, consolidation et IFRS',
};

/** La fonction de chaque contrôleur qui écrit. */
export const FONCTION_PAR_CONTROLEUR: Record<string, FonctionMetier> = {
  CompteController: FonctionMetier.STRUCTURE,
  NaturesCompteController: FonctionMetier.STRUCTURE,
  JournalController: FonctionMetier.STRUCTURE,
  TauxTvaController: FonctionMetier.STRUCTURE,
  DevisesController: FonctionMetier.STRUCTURE,
  ModeleSaisieController: FonctionMetier.STRUCTURE,
  BanquesController: FonctionMetier.STRUCTURE,
  EtatsPersonnalisesController: FonctionMetier.REVISION,
  TenantController: FonctionMetier.STRUCTURE,
  AccordCadreController: FonctionMetier.STRUCTURE,
  TiersController: FonctionMetier.TIERS,
  ModeleReglementController: FonctionMetier.TIERS,
  DocumentsTiersController: FonctionMetier.TIERS,
  RibsTiersController: FonctionMetier.TIERS,
  EcritureController: FonctionMetier.SAISIE,
  RegularisationController: FonctionMetier.SAISIE,
  OperationSpecifiqueController: FonctionMetier.SAISIE,
  ImportController: FonctionMetier.SAISIE,
  LettrageController: FonctionMetier.LETTRAGE,
  RapprochementController: FonctionMetier.TRESORERIE,
  ReglementsController: FonctionMetier.TRESORERIE,
  OrdresVirementController: FonctionMetier.TRESORERIE,
  RelancesController: FonctionMetier.RELANCES,
  CourrierController: FonctionMetier.RELANCES,
  ImmobilisationController: FonctionMetier.IMMOBILISATIONS,
  DegressifController: FonctionMetier.IMMOBILISATIONS,
  StockController: FonctionMetier.STOCKS,
  MagasinController: FonctionMetier.STOCKS,
  EmballagesController: FonctionMetier.STOCKS,
  AnalytiqueController: FonctionMetier.ANALYTIQUE,
  BailleurController: FonctionMetier.ANALYTIQUE,
  ConventionFinancementController: FonctionMetier.ANALYTIQUE,
  DonationController: FonctionMetier.ANALYTIQUE,
  FiscaliteController: FonctionMetier.FISCALITE,
  ExonerationsController: FonctionMetier.FISCALITE,
  FacturationController: FonctionMetier.GESTION_COMMERCIALE,
  CommercialController: FonctionMetier.GESTION_COMMERCIALE,
  PersonnelController: FonctionMetier.PAIE,
  AvancesRubriquesController: FonctionMetier.PAIE,
  BaremesPaieController: FonctionMetier.PAIE,
  ExerciceController: FonctionMetier.CLOTURE,
  AffectationController: FonctionMetier.CLOTURE,
  NoteAnnexeController: FonctionMetier.CLOTURE,
  DocumentsObligatoiresController: FonctionMetier.CLOTURE,
  InventaireController: FonctionMetier.REVISION,
  CircularisationController: FonctionMetier.REVISION,
  ProvisionsController: FonctionMetier.REVISION,
  FaiblessesController: FonctionMetier.REVISION,
  QuestionnaireController: FonctionMetier.REVISION,
  MandatAuditeurController: FonctionMetier.REVISION,
  GroupeController: FonctionMetier.GROUPE_ET_IFRS,
  ConsolidationController: FonctionMetier.GROUPE_ET_IFRS,
  IfrsController: FonctionMetier.GROUPE_ET_IFRS,
};

/**
 * Méthodes rangées ailleurs que leur contrôleur · valider n'est pas saisir
 * (AUDCIF art. 22, 2° · la validation fait entrer la pièce au livre-journal,
 * c'est l'acte que la séparation des tâches isole).
 */
export const FONCTION_PAR_METHODE: Record<string, FonctionMetier> = {
  'EcritureController.valider': FonctionMetier.VALIDATION,
  'EcritureController.validerJusqua': FonctionMetier.VALIDATION,
  'EcritureController.imputerOuverture': FonctionMetier.CLOTURE,
  'EcritureController.fusionnerComptes': FonctionMetier.STRUCTURE,
};

/** Contrôleurs qui écrivent sans relever d'un profil, avec leur motif. */
export const CONTROLEURS_HORS_PROFIL: Record<string, string> = {
  AuthController: "Connexion et mot de passe · l'utilisateur lui-même, quel que soit son profil.",
  PlateformeController: "Console de l'opérateur, hors de tout dossier.",
  UtilisateurController: "Gestion des accès · réservée à l'administrateur, que le profil ne restreint jamais.",
};

const METHODES_QUI_ECRIVENT = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function fonctionDeRoute(classe: string, methode: string): FonctionMetier | null {
  return FONCTION_PAR_METHODE[`${classe}.${methode}`] ?? FONCTION_PAR_CONTROLEUR[classe] ?? null;
}

/** Pourquoi la route est refusée à cet utilisateur, ou null. */
export function motifRefusFonction(
  utilisateur: { role: string; restreindreFonctions?: boolean; fonctionsAutorisees?: string[] },
  verbeHttp: string,
  fonction: FonctionMetier | null,
): string | null {
  if (!utilisateur.restreindreFonctions) return null;
  if (utilisateur.role === RoleUtilisateur.ADMIN_CABINET) return null;
  if (!METHODES_QUI_ECRIVENT.has(verbeHttp.toUpperCase())) return null;
  if (!fonction) return null;
  if ((utilisateur.fonctionsAutorisees ?? []).includes(fonction)) return null;
  return `La fonction « ${LIBELLES_FONCTION[fonction]} » ne vous est pas ouverte · voyez l'administrateur du dossier.`;
}
