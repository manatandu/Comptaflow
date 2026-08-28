export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
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

export interface LigneBilan {
  numero: string;
  intitule: string;
  montant: number;
}

export interface Bilan {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  equilibre: boolean;
}

export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/** Poste du compte de résultat SYCEBNL (code REF officiel : RA, TA, TM…). */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  comptes: CompteDuPoste[];
}

export interface CompteDeResultat {
  produits: PosteCalcule[];
  totalProduits: number; // XA
  charges: PosteCalcule[];
  totalCharges: number; // XB
  resultatActivitesOrdinaires: number; // XC
  produitsHao: PosteCalcule; // TM
  chargesHao: PosteCalcule; // TN
  resultatHao: number; // XD
  resultatNet: number; // XE
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
