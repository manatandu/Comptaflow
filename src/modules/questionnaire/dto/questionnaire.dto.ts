import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CycleQuestionnaire, ReponseItem } from '@prisma/client';

export class CreerQuestionnaireDto {
  @IsUUID()
  exerciceId!: string;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  /** Vide = tous les cycles du catalogue. */
  @IsOptional()
  @IsArray()
  @IsEnum(CycleQuestionnaire, { each: true })
  cycles?: CycleQuestionnaire[];
}

export class RepondreDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  /** Pour un item fermé seulement · le module refuse un « Oui » ailleurs. */
  @IsOptional()
  @IsEnum(ReponseItem)
  reponse?: ReponseItem;

  /** La donnée ou la description, pour un item DONNEE ou TEXTE_LIBRE. */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  valeur?: string;

  /** Le renvoi au papier de travail, pour un impératif. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  renvoiTravaux?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  commentaire?: string;
}

export class ClorerQuestionnaireDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  motifCloture?: string;
}
