import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Réimputation · voir reimputation.ts. Aucun montant ici : il est repris de
 * chaque ligne, à l'identique. Seuls changent le compte et, pour une ligne
 * validée, la date de la correction.
 */
export class ReimputerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ligneIds!: string[];

  @IsString()
  compteCibleId!: string;

  /** Date de l'écriture de réimputation des lignes validées · par défaut aujourd'hui. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Obligatoire, comme le motif d'une correction · une réimputation sans raison est une altération. */
  @IsString()
  @IsNotEmpty()
  motif!: string;
}

/** Fusion de comptes · le compte absorbé, le compte conservé, et la raison. */
export class FusionnerComptesDto {
  @IsString()
  compteSourceId!: string;

  @IsString()
  compteCibleId!: string;

  @IsString()
  @IsNotEmpty()
  motif!: string;
}
