import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ClasseCompte, ModeReportANouveau } from '@prisma/client';

export class CreerCompteDto {
  @Matches(/^\d{3,8}$/, { message: 'Le numéro de compte doit être numérique (3 à 8 chiffres)' })
  numero!: string;

  @IsString()
  intitule!: string;

  @IsEnum(ClasseCompte)
  classe!: ClasseCompte;

  // Par défaut SOLDE (voir Compte.modeReportANouveau côté schéma) ; un compte
  // de charge/produit créé à la main doit explicitement passer AUCUN.
  @IsOptional()
  @IsEnum(ModeReportANouveau)
  modeReportANouveau?: ModeReportANouveau;
}

export class ModifierCompteDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;

  @IsOptional()
  @IsEnum(ModeReportANouveau)
  modeReportANouveau?: ModeReportANouveau;
}
