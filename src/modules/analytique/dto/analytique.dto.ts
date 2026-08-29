import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TypeCompteDetailTotal } from '@prisma/client';

export class CreerPlanAnalytiqueDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  /** Chiffres de classe séparés par des virgules, ex. "2,6,7,9". */
  @IsOptional()
  @Matches(/^[1-9](,[1-9])*$/, {
    message: 'classesVentilees doit être une liste de chiffres de classe séparés par des virgules, ex. "2,6,7,9"',
  })
  classesVentilees?: string;

  @IsOptional()
  @IsBoolean()
  ventilationObligatoire?: boolean;

  @IsOptional()
  @IsBoolean()
  gererBudgets?: boolean;

  @IsOptional()
  @IsInt()
  ordre?: number;
}

export class ModifierPlanAnalytiqueDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @Matches(/^[1-9](,[1-9])*$/)
  classesVentilees?: string;

  @IsOptional()
  @IsBoolean()
  ventilationObligatoire?: boolean;

  @IsOptional()
  @IsBoolean()
  gererBudgets?: boolean;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class CreerSectionDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsOptional()
  @IsEnum(TypeCompteDetailTotal)
  type?: TypeCompteDetailTotal;

  @IsOptional()
  @IsString()
  bailleurId?: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;
}

export class ModifierSectionDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsString()
  bailleurId?: string | null;

  @IsOptional()
  @IsDateString()
  dateDebut?: string | null;

  @IsOptional()
  @IsDateString()
  dateFin?: string | null;

  @IsOptional()
  @IsBoolean()
  estActive?: boolean;
}

/** Dotation annuelle d'une section : le service la répartit sur les mois couverts. */
export class DoterBudgetDto {
  @IsString()
  exerciceId!: string;

  @IsNumber()
  montantAnnuel!: number;
}

/** Retouche d'un mois précis, après répartition. */
export class ModifierBudgetMoisDto {
  @IsString()
  exerciceId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mois!: number;

  @IsNumber()
  montant!: number;
}

export class LigneVentilationDto {
  @IsString()
  sectionId!: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;
}

/**
 * Remplace la ventilation d'une ligne SUR LES PLANS TOUCHÉS par les sections
 * fournies. Une liste vide efface toute ventilation de la ligne.
 */
export class VentilerLigneDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneVentilationDto)
  ventilations!: LigneVentilationDto[];
}

export class VentilerLotDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VentilerUneLigneDto)
  lignes!: VentilerUneLigneDto[];
}

export class VentilerUneLigneDto {
  @IsString()
  ligneEcritureId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneVentilationDto)
  ventilations!: LigneVentilationDto[];
}
