import { IsEnum, IsString, MinLength } from 'class-validator';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';

export class RattacherDto {
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeu!: JeuEtatsFinanciersSycebnl;

  /** Code officiel de la note : « 24 », « 5A », « 29B ». */
  @IsString()
  @MinLength(1)
  codeNote!: string;

  /** Clé stable de la rubrique (RubriqueNote.cle), jamais son libellé. */
  @IsString()
  @MinLength(1)
  cleRubrique!: string;

  @IsString()
  @MinLength(1)
  compteId!: string;
}
