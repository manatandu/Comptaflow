import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ConditionEcheance } from '@prisma/client';

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
