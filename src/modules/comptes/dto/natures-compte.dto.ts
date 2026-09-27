import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ModeReportANouveau } from '@prisma/client';

export class ModifierNatureCompteDto {
  // Les fourchettes sont revérifiées par motifRefusFourchettes (chiffres,
  // du ≤ au, aucun chevauchement) · le DTO ne vérifie que la forme.
  @IsOptional()
  @IsArray()
  fourchettes?: { du: string; au: string }[];

  @IsOptional()
  @IsEnum(ModeReportANouveau)
  modeReportANouveau?: ModeReportANouveau;

  @IsOptional()
  @IsBoolean()
  lettrable?: boolean;
}

export class AlignerNaturesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  compteIds?: string[];
}
