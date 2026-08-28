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

export interface Compte {
  id: string;
  tenantId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  estActif: boolean;
}

export interface Exercice {
  id: string;
  tenantId: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutExercice;
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

export interface LigneBalance {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  totalDebit: number;
  totalCredit: number;
  solde: number;
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

export interface AuthResponse {
  tenant?: { id: string; nom: string; referentiel: Referentiel };
  exercice?: Exercice;
  accessToken: string;
}
