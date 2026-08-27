import { IsDateString } from 'class-validator';

export class CreerExerciceDto {
  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;
}
