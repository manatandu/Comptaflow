import { IsDateString, IsUUID } from 'class-validator';

/** Clôture PARTIELLE d'un journal : verrouille jusqu'à dateLimite, réversible. */
export class ClorePartielleDto {
  @IsUUID()
  journalId!: string;

  @IsDateString()
  dateLimite!: string;
}

/** Clôture TOTALE d'un journal : le fige entièrement, définitive. */
export class CloreTotaleDto {
  @IsUUID()
  journalId!: string;
}

/** Clôture de PERIODE : verrouille jusqu'à dateLimite, tous journaux confondus, définitive. */
export class ClorePeriodeDto {
  @IsDateString()
  dateLimite!: string;
}
