import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ClasseCompte, ModeReportANouveau, TypeCompteDetailTotal } from '@prisma/client';

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

  // Par défaut DETAIL (compte mouvementable normalement). TOTAL = compte de
  // regroupement par racine (§3.1) — ne reçoit jamais d'écriture directement,
  // voir EcritureService.creer().
  @IsOptional()
  @IsEnum(TypeCompteDetailTotal)
  typeCompte?: TypeCompteDetailTotal;
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

  @IsOptional()
  @IsEnum(TypeCompteDetailTotal)
  typeCompte?: TypeCompteDetailTotal;
}
