import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** Clôture PARTIELLE d'un journal : verrouille jusqu'à dateLimite, réversible. */
export class ClorePartielleDto {
  @IsUUID()
  journalId!: string;

  @IsDateString()
  dateLimite!: string;
}

/**
 * Clôture TOTALE d'un journal jusqu'à une date, définitive. Chez Sage elle
 * vise un journal POUR UNE PÉRIODE (« Clôturer le journal ventes pour le mois
 * de janvier »). Sans date, elle va jusqu'à la fin de l'exercice.
 */
export class CloreTotaleDto {
  @IsUUID()
  journalId!: string;

  @IsOptional()
  @IsDateString()
  dateLimite?: string;
}

/** Clôture de PERIODE : verrouille jusqu'à dateLimite, tous journaux confondus, définitive. */
export class ClorePeriodeDto {
  @IsDateString()
  dateLimite!: string;
}
