import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ConditionEcheance, TypeEcheance } from '@prisma/client';

export class CreerModeleReglementDto {
  @IsString()
  intitule!: string;

  @IsInt()
  @Min(0)
  delaiJours!: number;

  @IsOptional()
  @IsEnum(ConditionEcheance)
  echeance?: ConditionEcheance;
}

export class ModifierModeleReglementDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  delaiJours?: number;

  @IsOptional()
  @IsEnum(ConditionEcheance)
  echeance?: ConditionEcheance;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class CreerEcheanceReglementDto {
  @IsInt()
  @Min(1)
  ordre!: number;

  @IsEnum(TypeEcheance)
  type!: TypeEcheance;

  // Pourcentage (0-100) pour POURCENTAGE, montant fixe pour MONTANT ;
  // absent (ou ignoré) pour EQUILIBRE, qui n'a pas de valeur propre.
  @IsOptional()
  @IsNumber()
  @Min(0)
  valeur?: number;

  @IsInt()
  @Min(0)
  delaiJours!: number;

  @IsOptional()
  @IsEnum(ConditionEcheance)
  echeance?: ConditionEcheance;
}

export class CalculerEcheancesDto {
  @IsDateString()
  dateFacture!: string;

  @IsNumber()
  @Min(0.01)
  montantTotal!: number;
}
