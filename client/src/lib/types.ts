export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
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
  journalCode: string;
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
