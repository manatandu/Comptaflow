import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MotifExclusionConsolidation } from '@prisma/client';

export class EntitePerimetreDto {
  @IsUUID()
  exerciceId!: string;

  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional() @IsBoolean() designationMajoriteDeuxExercices?: boolean;
  @IsOptional() @IsBoolean() aucunAutreAssocieSuperieur?: boolean;
  @IsOptional() @IsBoolean() controleContractuel?: boolean;
  @IsOptional() @IsBoolean() accordControleConjoint?: boolean;
  @IsOptional() @IsBoolean() influenceNotableDeclaree?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(MotifExclusionConsolidation)
  motifExclusion?: MotifExclusionConsolidation | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  justificationExclusion?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dateCloture?: string | null;
}

export class ModifierEntitePerimetreDto {
  @IsOptional() @IsString() @MaxLength(200) nom?: string;
  @IsOptional() @IsBoolean() designationMajoriteDeuxExercices?: boolean;
  @IsOptional() @IsBoolean() aucunAutreAssocieSuperieur?: boolean;
  @IsOptional() @IsBoolean() controleContractuel?: boolean;
  @IsOptional() @IsBoolean() accordControleConjoint?: boolean;
  @IsOptional() @IsBoolean() influenceNotableDeclaree?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(MotifExclusionConsolidation)
  motifExclusion?: MotifExclusionConsolidation | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  justificationExclusion?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dateCloture?: string | null;
}

export class LienParticipationDto {
  @IsUUID()
  exerciceId!: string;

  /** Absent ou null · la détentrice est le dossier lui-même, c'est-à-dire la consolidante. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  detentriceId?: string | null;

  @IsUUID()
  detenueId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  pctDroitsVote!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  pctCapital!: number;
}

export class FaitsConsolidationDto {
  @IsUUID()
  exerciceId!: string;

  @IsOptional() @IsBoolean() sousControleEntiteOhadaConsolidante?: boolean;
  @IsOptional() @IsBoolean() siegesDansDeuxRegions?: boolean;
  @IsOptional() @IsBoolean() appelPublicEpargne?: boolean;
  @IsOptional() @IsBoolean() demandeAssociesDixieme?: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) chiffreAffairesN?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) chiffreAffairesN1?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) seuilEquivalentFc?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) sourceSeuil?: string | null;
}
