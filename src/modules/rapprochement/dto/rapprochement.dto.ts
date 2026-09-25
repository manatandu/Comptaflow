import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class OuvrirRapprochementDto {
  @IsUUID('4')
  compteId!: string;

  @IsDateString()
  dateReleve!: string;

  @IsNumber()
  soldeReleve!: number;
}

export class PointerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ligneIds!: string[];
}

const TAILLE_MAX_BASE64 = 11_000_000;

/**
 * Relevé bancaire importé · même voie d'entrée que les autres imports (fichier
 * en base64 dans le corps JSON, CSV ou XLSX).
 */
export class ImporterReleveDto {
  @IsString()
  nomFichier!: string;

  @IsString()
  @MaxLength(TAILLE_MAX_BASE64, { message: 'Fichier trop volumineux (8 Mo maximum)' })
  contenuBase64!: string;

  /** Colonnes désignées par le cabinet quand l'en-tête n'est pas reconnu. */
  @IsOptional()
  @IsObject()
  colonnes?: Record<string, string>;
}

export class CorrespondanceDto {
  @IsUUID('4')
  ligneReleveId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ligneEcritureIds!: string[];
}

export class ConfirmerCorrespondancesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CorrespondanceDto)
  correspondances!: CorrespondanceDto[];
}
