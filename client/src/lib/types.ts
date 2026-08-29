export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
/**
 * N'a de sens que si `Referentiel` = 'SYCEBNL' (le SYSCOHADA n'a qu'un seul
 * jeu). SYCEBNL en prévoit 3 (Partie 4, ch. 2 à 4 du texte officiel) ; seuls
 * les deux premiers sont construits — le Système Minimal de Trésorerie
 * (SMT, < 30 M FCFA) n'a pas de valeur ici.
 */
export type JeuEtatsFinanciersSycebnl = 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' | 'PROJETS_DEVELOPPEMENT';
export type RoleUtilisateur = 'ADMIN_CABINET' | 'COMPTABLE' | 'LECTURE_SEULE';

export interface Utilisateur {
  id: string;
  email: string;
  role: RoleUtilisateur;
  estActif: boolean;
  createdAt: string;
}
export type ClasseCompte =
  | 'CLASSE_1' | 'CLASSE_2' | 'CLASSE_3' | 'CLASSE_4'
  | 'CLASSE_5' | 'CLASSE_6' | 'CLASSE_7' | 'CLASSE_8' | 'CLASSE_9';
export type StatutExercice = 'OUVERT' | 'CLOTURE';

export type TypeCompteDetailTotal = 'DETAIL' | 'TOTAL';

export interface Compte {
  id: string;
  tenantId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  estActif: boolean;
  /** Rattachement à un Bailleur (comptabilité analytique par projet/bailleur) — voir Bailleur. */
  bailleurId: string | null;
}

/**
 * Bailleur (ou sous-projet) — regroupe les sous-comptes 162-164/462-464 qui
 * lui sont propres (docs/plan-de-construction.md item 14, jeu « projets de
 * développement »).
 */
export interface Bailleur {
  id: string;
  tenantId: string;
  code: string;
  nom: string;
  estActif: boolean;
  createdAt: string;
}

/** Une ligne (par bailleur) de la NOTE 9 — Fonds du bailleur. */
export interface LigneNoteBailleur {
  bailleur: { id: string; code: string; nom: string };
  decaisse: number;
  consomme: number;
  soldeRestant: number;
}

export interface TotalNoteBailleur {
  decaisse: number;
  consomme: number;
  soldeRestant: number;
}

/** NOTE 9 : FONDS DU BAILLEUR (jeu « projets de développement », Partie 4 ch. 3). */
export interface NoteBailleur {
  investissement: LigneNoteBailleur[];
  investissementNonAffecte: TotalNoteBailleur;
  totalInvestissement: TotalNoteBailleur;
  administration: LigneNoteBailleur[];
  administrationNonAffecte: TotalNoteBailleur;
  totalAdministration: TotalNoteBailleur;
  totalFondsDuBailleur: TotalNoteBailleur;
}

export interface Exercice {
  id: string;
  tenantId: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutExercice;
}

export type GranulariteCloture = 'PARTIELLE' | 'TOTALE' | 'PERIODE';

export interface Cloture {
  id: string;
  exerciceId: string;
  granularite: GranulariteCloture;
  journalId: string | null;
  journal?: Journal | null;
  dateLimite: string;
  annulable: boolean;
  createdAt: string;
  annuleeAt: string | null;
}

export type TypeJournal = 'ACHATS' | 'VENTES' | 'TRESORERIE' | 'GENERAL' | 'SITUATION';
export type NumerotationPiece = 'MANUELLE' | 'CONTINUE_JOURNAL' | 'CONTINUE_FICHIER' | 'MENSUELLE';

export interface Journal {
  id: string;
  code: string;
  intitule: string;
  type: TypeJournal;
  compteTresorerieId: string | null;
  compteTresorerie?: Compte | null;
  numerotation: NumerotationPiece;
  estActif: boolean;
}

export interface LigneEcriture {
  id: string;
  compteId: string;
  libelle: string | null;
  debit: string;
  credit: string;
  compte?: Compte;
}

export interface Ecriture {
  id: string;
  exerciceId: string;
  journalId: string;
  journal?: Journal;
  numeroPiece: number | null;
  date: string;
  libelle: string;
  reference: string | null;
  createdAt: string;
  createdBy: string;
  lignes: LigneEcriture[];

  /**
   * Correction d'erreur par inscription en négatif — art. 20 de l'AUDCIF,
   * repris par la Partie 2 ch. 2 du SYCEBNL. `correction` est posé sur
   * l'écriture ERRONÉE (elle a été annulée par celle-ci) ; `corrigeEcriture`
   * et `motifCorrection` sur l'écriture de CORRECTION.
   */
  /** Écriture de solde des classes 6/7 ou de report à-nouveau : non corrigeable à la main. */
  estGenereeParCloture?: boolean;
  corrigeEcritureId: string | null;
  motifCorrection: string | null;
  correction?: { id: string; numeroPiece: number | null; date: string } | null;
  corrigeEcriture?: { id: string; numeroPiece: number | null; date: string; libelle: string } | null;
}

export interface LigneLettrage {
  id: string;
  date: string;
  journalCode: string;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  lettre: string | null;
}

export type StatutRapprochement = 'EN_COURS' | 'CLOTURE';

export interface RapprochementBancaire {
  id: string;
  tenantId: string;
  compteId: string;
  compte?: Compte;
  dateReleve: string;
  soldeReleve: number;
  statut: StatutRapprochement;
  createdAt: string;
  createdBy: string;
  clotureAt: string | null;
}

export interface LignePointage {
  id: string;
  date: string;
  journalCode: string;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  pointee: boolean;
}

export interface DetailRapprochement {
  rapprochement: RapprochementBancaire;
  soldeDepart: number;
  soldePointe: number;
  ecart: number;
  equilibre: boolean;
  lignes: LignePointage[];
}

export interface LigneBalance {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export interface LigneGrandLivre {
  id: string;
  date: string;
  journalCode: string;
  numeroPiece: number | null;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  lettre: string | null;
  soldeProgressif: number;
  /** Comptes de sens opposé dans la même écriture — voir ExportService.grandLivreExcel. */
  contrepartie: string[];
}

/** Un poste ACTIF ou PASSIF du bilan officiel SYCEBNL (REF à deux lettres, ex. "BW", "CA"). */
/**
 * `brut`/`amortissement` : ACTIF seulement (le texte officiel exige Brut /
 * Amort. et dépréc. / Net côté actif, rien que Net côté passif).
 * `*N1` : comparatif N-1, exigé sur le bilan ET le compte de résultat —
 * `undefined` (jamais 0) quand il n'y a pas d'exercice antérieur.
 */
export interface LigneBilan {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  brut?: number;
  brutN1?: number;
  amortissement?: number;
  amortissementN1?: number;
  /** Ligne de sous-total ou de total (ex. AZ, BT, DZ) — pas un poste de détail. */
  estTotal: boolean;
  comptes: CompteDuPoste[];
}

export interface Bilan {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  /** false = premier exercice du dossier, aucun N-1 à afficher. */
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  /** Comptes de bilan (classes 1-5) qu'aucun poste officiel ne réclame — jamais masqués. */
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatClasses678: number;
    resultatCompte13: number;
    doubleComptageProbable: boolean;
  };
}

export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/**
 * BILAN et COMPTE D'EXPLOITATION du jeu « projets de développement et
 * assimilés » (Partie 4, ch. 3) — structure volontairement proche de
 * `Bilan`/`CompteDeResultat` (mêmes conventions Brut/Amort/Net et
 * comparatif N-1), mais PAS interchangeable : REF, libellés et comptes
 * rattachés sont propres à ce jeu (voir `correspondance-projet-*.ts` côté
 * serveur). `controle` diffère aussi : pas de double source à arbitrer côté
 * bilan (`equilibre` seulement), et `boucleAZero` (pas `coherent`) côté
 * compte d'exploitation — ce jeu vise XC = 0, pas un résultat net.
 */
export interface BilanProjet {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPoste[];
}

export interface CompteExploitationProjet {
  revenus: PosteCalcule[];
  totalRevenus: number; // XA
  totalRevenusN1?: number;
  charges: PosteCalcule[]; // TJ et TK peuvent apparaître deux fois — doublon officiel, voir correspondance-projet-compte-exploitation.ts
  totalCharges: number; // XB
  totalChargesN1?: number;
  solde: number; // XC — attendu à 0 en régime normal, PAS un résultat net
  soldeN1?: number;
  exerciceN1Disponible: boolean;
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    boucleAZero: boolean;
  };
}

/** Poste du compte de résultat SYCEBNL (code REF officiel : RA, TA, TM…). */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  /** Comparatif N-1 — undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
}

// --------------------------------------------------------------------------
// Tableau de flux de trésorerie (associations et ordres professionnels
// seulement — Partie 4, ch. 1 § 4). Méthode directe, double bouclage.
// --------------------------------------------------------------------------

export interface LigneFluxTresorerie {
  ref: string;
  libelle: string;
  montant: number;
  /** Comparatif N-1 — undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  /** Repère A à H du modèle officiel — seulement sur les sous-totaux (ZB à ZG). */
  repere?: string;
}

export interface SectionFlux {
  section: string;
}

export interface ControleFluxTresorerie {
  tresorerieOuverture: number;
  variation: number;
  tresorerieClotureParFlux: number;
  tresorerieClotureParBilan: number;
  ecart: number;
  coherent: boolean;
}

export interface TableauFluxTresorerie {
  lignes: Array<LigneFluxTresorerie | SectionFlux>;
  exerciceN1Disponible: boolean;
  comptesNonVentiles: CompteDuPoste[];
  controle: ControleFluxTresorerie;
}

export interface CompteDeResultat {
  produits: PosteCalcule[];
  totalProduits: number; // XA
  totalProduitsN1?: number;
  charges: PosteCalcule[];
  totalCharges: number; // XB
  totalChargesN1?: number;
  resultatActivitesOrdinaires: number; // XC
  resultatActivitesOrdinairesN1?: number;
  produitsHao: PosteCalcule; // TM
  chargesHao: PosteCalcule; // TN
  resultatHao: number; // XD
  resultatHaoN1?: number;
  resultatNet: number; // XE
  resultatNetN1?: number;
  /** false = premier exercice du dossier, aucun N-1 à afficher. */
  exerciceN1Disponible: boolean;
  /** Comptes de gestion qu'aucun poste officiel ne réclame — jamais masqués. */
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatToutesClassesDeGestion: number;
    ecart: number;
    coherent: boolean;
  };
}

export interface AuthResponse {
  tenant?: { id: string; nom: string; referentiel: Referentiel };
  exercice?: Exercice;
  accessToken: string;
}

export type TypeTiers = 'CLIENT' | 'FOURNISSEUR' | 'SALARIE' | 'AUTRE';
export type ConditionEcheance = 'NET' | 'FIN_DE_MOIS';
export type TypeEcheance = 'POURCENTAGE' | 'MONTANT' | 'EQUILIBRE';

export interface EcheanceReglement {
  id: string;
  ordre: number;
  type: TypeEcheance;
  valeur: string | null;
  delaiJours: number;
  echeance: ConditionEcheance;
}

export interface EcheanceCalculee {
  ordre: number;
  type: TypeEcheance | null;
  montant: number;
  dateEcheance: string;
}

export interface ModeleReglement {
  id: string;
  intitule: string;
  delaiJours: number;
  echeance: ConditionEcheance;
  estActif: boolean;
  echeances: EcheanceReglement[];
}

export interface TiersCompte {
  id: string;
  tiersId: string;
  compteId: string;
  estPrincipal: boolean;
  compte: Compte;
}

export interface TauxTva {
  id: string;
  code: string;
  intitule: string;
  taux: string;
  compteCollecteId: string | null;
  compteCollecte?: Compte | null;
  compteDeductibleId: string | null;
  compteDeductible?: Compte | null;
  estActif: boolean;
}

export interface LigneDeclarationTva {
  tauxId: string;
  code: string;
  intitule: string;
  taux: number;
  totalCollecte: number;
  totalDeductible: number;
  net: number;
}

export interface ProrataTva {
  numerateur: number;
  denominateur: number;
  pourcentage: number;
}

export interface DeclarationTva {
  dateDebut: string;
  dateFin: string;
  lignes: LigneDeclarationTva[];
  prorata: ProrataTva;
  totalCollecte: number;
  totalDeductible: number;
  totalDeductibleAdmise: number;
  net: number;
  sens: 'A_PAYER' | 'CREDIT';
}

export interface Tiers {
  id: string;
  type: TypeTiers;
  code: string;
  nom: string;
  estActif: boolean;
  modeleReglementId: string | null;
  modeleReglement?: ModeleReglement | null;
  comptesRattaches: TiersCompte[];
}

export type ModeAmortissement = 'LINEAIRE';
export type StatutImmobilisation = 'EN_SERVICE' | 'CEDEE' | 'MISE_HORS_SERVICE';

export interface FamilleImmobilisation {
  id: string;
  code: string;
  intitule: string;
  compteImmobilisationId: string;
  compteImmobilisation?: Compte;
  compteAmortissementId: string;
  compteAmortissement?: Compte;
  compteDotationId: string;
  compteDotation?: Compte;
  dureeAmortissementAns: number;
  modeAmortissement: ModeAmortissement;
  estActif: boolean;
}

export interface DotationAmortissement {
  id: string;
  exerciceId: string;
  montant: number;
  createdAt: string;
}

export interface Immobilisation {
  id: string;
  familleId: string;
  famille?: FamilleImmobilisation;
  designation: string;
  numeroInventaire: string | null;
  compteImmobilisationId: string;
  compteImmobilisation?: Compte;
  compteAmortissementId: string;
  compteAmortissement?: Compte;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurOrigine: number;
  valeurResiduelle: number;
  dureeAmortissementAns: number;
  modeAmortissement: ModeAmortissement;
  statut: StatutImmobilisation;
  dateSortie: string | null;
  prixCession: number | null;
  dotations: DotationAmortissement[];
}

// --------------------------------------------------------------------------
// Notes annexes — voir src/modules/notes-annexes/note-annexe.types.ts pour
// le contrat complet côté serveur ; miroir strict, pas de type simplifié.
// --------------------------------------------------------------------------

export type TypeColonneNote =
  | 'EXERCICE_N'
  | 'EXERCICE_N1'
  | 'VARIATION_VALEUR'
  | 'VARIATION_POURCENT'
  | 'VARIATION_VALEUR_ABSOLUE'
  | 'OUVERTURE'
  | 'AUGMENTATIONS'
  | 'DIMINUTIONS'
  | 'CLOTURE'
  | 'AUGMENTATION_EXPLOITATION'
  | 'AUGMENTATION_FINANCIERE'
  | 'AUGMENTATION_HAO'
  | 'DIMINUTION_EXPLOITATION'
  | 'DIMINUTION_FINANCIERE'
  | 'DIMINUTION_HAO'
  | 'ECHEANCE_1AN'
  | 'ECHEANCE_2ANS'
  | 'ECHEANCE_PLUS_2ANS'
  | 'LIBRE';

export interface ColonneNote {
  type: TypeColonneNote;
  libelle: string;
}

export interface CompteDeRubrique {
  numero: string;
  intitule: string;
  montant: number;
}

export interface LigneNoteCalculee {
  cle?: string;
  libelle: string;
  montantN: number;
  montantN1?: number;
  variationValeur?: number;
  variationPourcent?: number;
  estTotal: boolean;
  enAttenteDeRattachement?: string;
  rattachementDuDossier?: boolean;
  valeurs?: Partial<Record<TypeColonneNote, number>>;
  ecartCloture?: number;
  echeanceNonVentilee?: number;
  natureNonVentilee?: { augmentation: number; diminution: number };
  comptes: CompteDeRubrique[];
  renvoi?: string;
}

export interface RubriqueEnAttente {
  cle: string;
  libelle: string;
  /** Le texte de `subdivisionAttendue` : ce que le dossier doit avoir créé. */
  attendu: string;
}

export interface NoteCalculee {
  code: string;
  sousTableau?: string;
  titre: string;
  colonnes: ColonneNote[];
  lignes: LigneNoteCalculee[];
  commentaire?: string;
  renvoiOfficiel?: string;
  renvoyeeDepuis?: string[];
  horsBalance: boolean;
  exerciceN1Disponible: boolean;
  applicable: boolean;
  rubriquesEnAttente: RubriqueEnAttente[];
}

export interface LigneFicheRecapitulative {
  code: string;
  titre: string;
  applicable: boolean;
  rubriquesEnAttente: RubriqueEnAttente[];
}

export interface ResultatNotesJeu {
  notes: NoteCalculee[];
  exerciceN1Disponible: boolean;
  ficheRecapitulative: LigneFicheRecapitulative[];
  couverture: { transcrites: number; attendues: number };
}

// ---------------------------------------------------------------------------
// Registre des donateurs — articles 17, 18 et 24 de l'Acte uniforme SYCEBNL
// ---------------------------------------------------------------------------

export type TypeDonateur = 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE';
export type ModeLiberation = 'ESPECES' | 'CHEQUE' | 'VIREMENT' | 'NATURE';
export type NatureLiberalite = 'DON' | 'DONATION' | 'LEGS';

export interface Donation {
  id: string;
  /** Numéro d'ordre continu (art. 17) — attribué par le serveur, jamais saisi. */
  numero: number;
  dateOperation: string;
  nature: NatureLiberalite;
  typeDonateur: TypeDonateur;
  nom: string | null;
  prenoms: string | null;
  domicile: string | null;
  denomination: string | null;
  numeroImmatriculation: string | null;
  numeroIdentificationFiscale: string | null;
  adresseSiegeSocial: string | null;
  adresseElectronique: string | null;
  montant: number;
  modeLiberation: ModeLiberation;
  designationNature: string | null;
  signeePar: string | null;
  signeeLe: string | null;
  ecritureId: string | null;
  ecriture: { id: string; date: string; libelle: string; numeroPiece: number | null } | null;
  annulee: boolean;
  motifAnnulation: string | null;
  annuleeLe: string | null;
}

export interface ManquementArticle17 {
  champ: string;
  exigence: string;
}

export interface CompteRegistre {
  numero: string;
  intitule: string;
  lecture: 'NET_CREDIT' | 'CREDIT_SEUL';
  fondement: string;
  montant: number;
  comptes: { numero: string; intitule: string; montant: number }[];
}

/** Constatations de l'article 18 — jamais un avis, voir DonationService. */
export interface RapportConformiteRegistre {
  exercice: { id: string; dateDebut: string; dateFin: string };
  existence: {
    registreOuvert: boolean;
    lignesTotalRegistre: number;
    lignesSurExercice: number;
    lignesAnnuleesSurExercice: number;
  };
  numerotation: {
    exigence: string;
    premier: number | null;
    dernier: number | null;
    trous: number[];
    doublons: number[];
    continue: boolean;
  };
  signature: {
    exigence: string;
    lignesNonSignees: { id: string; numero: number; dateOperation: string; montant: number }[];
  };
  completude: {
    lignesIncompletes: { id: string; numero: number; dateOperation: string; manquements: ManquementArticle17[] }[];
  };
  rapprochement: {
    totalRegistre: number;
    totalComptable: number;
    ecart: number;
    rapproche: boolean;
    lecture: string;
    comptesLiberalite: CompteRegistre[];
    comptesFrontiere: CompteRegistre[];
    comptesHorsPerimetre: CompteRegistre[];
    avertissement: string;
  };
}

// ---------------------------------------------------------------------------
// Documents obligatoires de clôture — livre d'inventaire (art. 14) et rapport
// d'activité (art. 16-3), tous deux pénalement sanctionnés (art. 24).
// ---------------------------------------------------------------------------

export interface DocumentManquantInventaire {
  cle: string;
  libelle: string;
  motif: string;
}

export interface TranscriptionInventaire {
  id: string;
  version: number;
  jeu: JeuEtatsFinanciersSycebnl;
  /** États FIGÉS à la date de transcription — jamais recalculés (art. 14). */
  etats: Record<string, unknown>;
  documentsManquants: DocumentManquantInventaire[];
  resumeOperationInventaire: string | null;
  transcritLe: string;
  transcritPar: string;
}

export interface ConformiteInventaire {
  exercice: { id: string; dateDebut: string; dateFin: string };
  jeu: JeuEtatsFinanciersSycebnl;
  exigence: string;
  transcrit: boolean;
  version: number | null;
  transcritLe: string | null;
  etatsExiges: { cle: string; libelle: string; transcrit: boolean; motifIndisponibilite: string | null }[];
  documentsManquants: DocumentManquantInventaire[];
  resume: { exigence: string; renseigne: boolean; remarque: string };
  complete: boolean;
}

export interface TresorerieDuRapport {
  ouverture: number;
  variation: number;
  cloture: number;
  boucle: boolean;
}

export interface RapportActivite {
  id: string;
  version: number;
  etabliLe: string;
  etabliPar: string;
  situationExerciceEcoule: string | null;
  perspectivesDeveloppement: string | null;
  evolutionTresorerie: string | null;
  evenementsPosterieurs: string | null;
  entiteAvecAuditeur: boolean;
  declarationDirigeants: string | null;
  tresorerie: TresorerieDuRapport | null;
}

export interface ConformiteRapportActivite {
  exercice: { id: string; dateDebut: string; dateFin: string };
  exigence: string;
  etabli: boolean;
  version: number | null;
  etabliLe: string | null;
  sections: { cle: string; titre: string; exigence: string; renseignee: boolean }[];
  /** Définie par la clôture et la date d'établissement — voir art. 16-3. */
  fenetreEvenementsPosterieurs: { du: string; au: string } | null;
  tresorerie: TresorerieDuRapport | null;
  declarationRegistreDonateurs: {
    exigence: string;
    remarque: string;
    entiteAvecAuditeur: boolean;
    attendue: boolean;
    renseignee: boolean;
    registreConforme: boolean;
  };
  complet: boolean;
}

// ---------------------------------------------------------------------------
// Écritures-types des opérations spécifiques aux EBNL (Partie 3 · Guide)
// ---------------------------------------------------------------------------

export interface ParametreModele {
  nom: string;
  libelle: string;
  type: 'MONTANT' | 'TAUX' | 'DUREE_ANNEES' | 'MOIS';
  defaut?: number;
  aide?: string;
}

export interface LigneModele {
  compte: string;
  exclusions?: string[];
  libelle: string;
  sens: 'DEBIT' | 'CREDIT';
  auChoix?: boolean;
  note?: string;
}

export interface ModeleEcriture {
  code: string;
  libelle: string;
  objet: string;
  source: string;
  applicationGuide?: string;
  parametres: ParametreModele[];
  lignes: LigneModele[];
  anomalie?: string;
  /** Écriture d'inventaire à extourner à l'ouverture de l'exercice suivant. */
  aExtourner?: boolean;
}

export interface OperationSpecifique {
  code: string;
  libelle: string;
  source: string;
  portee: 'ASSOCIATIONS' | 'PROJETS' | 'TOUS';
  modeles: ModeleEcriture[];
  /** Choix que le TEXTE laisse ouvert — exposé, jamais tranché par le logiciel. */
  politiqueADecider?: string;
}

export interface CatalogueOperations {
  jeu: 'ASSOCIATIONS' | 'PROJETS';
  operations: OperationSpecifique[];
  operationsAutreJeu: OperationSpecifique[];
}

export interface LigneProposee {
  compteId: string | null;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  note?: string;
  choixRequis?: { racine: string; candidats: { id: string; numero: string; intitule: string }[] };
}

export interface EcritureProposee {
  modele: string;
  libelle: string;
  objet: string;
  source: string;
  applicationGuide?: string;
  anomalie?: string;
  aExtourner?: boolean;
  lignes: LigneProposee[];
  totalDebit: number;
  totalCredit: number;
  equilibree: boolean;
  comptesIntrouvables: { compte: string; libelle: string }[];
}
