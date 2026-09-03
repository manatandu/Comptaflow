import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateIf } from 'class-validator';
import { JeuNotesAnnexes } from '@prisma/client';

/**
 * Une CELLULE d'une rubrique de note renseignée hors comptabilité.
 *
 * Le DTO ne valide que la forme. Ce qui relève du texte officiel · la note
 * existe, la rubrique est bien en saisie, la colonne existe, et son type
 * commande texte ou montant · se vérifie dans le service, contre la
 * spécification (`NoteAnnexeService.celluleSaisissable`) : c'est la seule
 * source de vérité, et la dupliquer ici la ferait vieillir d'un côté.
 */
export class SaisirNoteDto {
  @IsUUID()
  exerciceId!: string;

  @IsEnum(JeuNotesAnnexes)
  jeu!: JeuNotesAnnexes;

  /** Code officiel de la note : « 18B », « 29B », « 16B bis ». */
  @IsString()
  @MinLength(1)
  codeNote!: string;

  /** Clé stable de la rubrique (RubriqueNote.cle), jamais son libellé. */
  @IsString()
  @MinLength(1)
  cleRubrique!: string;

  /** Rang de la colonne dans la note, à partir de 0. */
  @IsInt()
  @Min(0)
  colonne!: number;

  /**
   * Ce que le dossier écrit. `null` ou vide EFFACE la cellule · c'est ce que
   * rend un champ qu'on vide, et une cellule vidée ne doit pas rester
   * « renseignée à rien ».
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  valeur?: string | null;
}
