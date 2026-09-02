import { IsEnum, IsString, MinLength } from 'class-validator';
import { JeuNotesAnnexes } from '@prisma/client';

export class RattacherDto {
  /**
   * Jeu de notes visé · les deux jeux SYCEBNL et le Système normal
   * SYSCOHADA. C'est bien `JeuNotesAnnexes` et non le jeu d'états financiers
   * du dossier : le SMT n'a aucune rubrique à rattacher, et le SYSCOHADA en a
   * 36 notes. `NoteAnnexeService` refuse ensuite tout jeu étranger au
   * référentiel du dossier.
   */
  @IsEnum(JeuNotesAnnexes)
  jeu!: JeuNotesAnnexes;

  /** Code officiel de la note : « 24 », « 5A », « 29B », « 16B bis ». */
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
