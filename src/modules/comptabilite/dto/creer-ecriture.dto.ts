export class LigneEcritureDto {
  compteId!: string;
  libelle?: string;
  debit?: number;
  credit?: number;
}

export class CreerEcritureDto {
  exerciceId!: string;
  journalCode!: string;
  date!: string; // ISO
  libelle!: string;
  reference?: string;
  lignes!: LigneEcritureDto[];
}
