import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ClasseCompte, ModeReportANouveau, TypeCompteDetailTotal } from '@prisma/client';

export class CreerCompteDto {
  // Borne large ici (3 à 13 chiffres — plage Sage complète) : la longueur
  // réellement autorisée dépend du dossier (Tenant.longueurCompte, 8 par
  // défaut) et est vérifiée dynamiquement par CompteService.creer(), pas ici
  // — un DTO ne connaît pas le tenant.
  @Matches(/^\d{3,13}$/, { message: 'Le numéro de compte doit être numérique (3 à 13 chiffres)' })
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
