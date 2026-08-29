import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ClasseCompte, ModeReportANouveau, TypeCompteDetailTotal } from '@prisma/client';

export class CreerCompteDto {
  // Borne large ici (3 à 13 chiffres · plage Sage complète) : la longueur
  // réellement autorisée dépend du dossier (Tenant.longueurCompte, 8 par
  // défaut) et est vérifiée dynamiquement par CompteService.creer(), pas ici
  // · un DTO ne connaît pas le tenant.
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
  // regroupement par racine (§3.1) · ne reçoit jamais d'écriture directement,
  // voir EcritureService.creer().
  @IsOptional()
  @IsEnum(TypeCompteDetailTotal)
  typeCompte?: TypeCompteDetailTotal;

  // Ouvre ce compte au lettrage · « liberté de définir la liste des comptes
  // auxquels s'applique le lettrage » (CPCC, ch. 6). Omis, le défaut se
  // déduit du numéro (voir estLettrableParDefaut).
  @IsOptional()
  @IsBoolean()
  lettrable?: boolean;

  // Taux de TVA proposé automatiquement quand ce compte est saisi · `null`
  // explicite pour ne rien proposer.
  @IsOptional()
  @IsString()
  tauxTvaDefautId?: string | null;
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

  // Rattachement à un Bailleur (§ comptabilité analytique par projet/
  // bailleur, docs/plan-de-construction.md item 14) · `null` explicite pour
  // détacher, `undefined`/absent pour ne pas toucher au rattachement actuel.
  @IsOptional()
  @IsString()
  bailleurId?: string | null;

  @IsOptional()
  @IsBoolean()
  lettrable?: boolean;

  @IsOptional()
  @IsString()
  tauxTvaDefautId?: string | null;
}
