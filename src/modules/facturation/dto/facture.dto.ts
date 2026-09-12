import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SensFacture } from '@prisma/client';

export class LigneFactureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  designation!: string;

  @IsNumber()
  quantite!: number;

  @IsNumber()
  prixUnitaire!: number;

  @IsNumber()
  @Min(0)
  montantHT!: number;

  @IsOptional()
  @IsBoolean()
  imposable?: boolean;

  @IsOptional()
  @IsString()
  tauxTvaId?: string;

  @IsOptional()
  @IsNumber()
  tauxApplique?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantTva?: number;
}

export class EnregistrerFactureDto {
  @IsEnum(SensFacture)
  sens!: SensFacture;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  numeroSerie!: string;

  @IsDateString()
  dateFacture!: string;

  @IsOptional()
  @IsString()
  tiersId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  contrepartieNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  contrepartieNumeroImpot?: string;

  @IsOptional()
  @IsBoolean()
  mentionTvaDebits?: boolean;

  @IsOptional()
  @IsString()
  ecritureId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneFactureDto)
  lignes!: LigneFactureDto[];
}
