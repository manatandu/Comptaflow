import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { DecisionEcartInventaire, RoleMembreInventaire } from '@prisma/client';

export class CreerCampagneDto {
  @IsUUID()
  exerciceId!: string;

  @IsDateString()
  dateInventaire!: string;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  /** Étape 1 · « établir les procédures d'inventaire et de corrections ». */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  instructions?: string;
}

export class ModifierCampagneDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  instructions?: string;
}

export class AjouterSousCommissionDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  perimetre?: string;
}

export class AjouterMembreDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fonction?: string;

  @IsEnum(RoleMembreInventaire)
  role!: RoleMembreInventaire;
}

export class CreerFicheDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsUUID()
  sousCommissionId?: string;

  @IsString()
  @MaxLength(300)
  designation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emplacement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  uniteMesure?: string;
}

export class SaisirComptageDto {
  /**
   * Une quantité comptée n'est jamais négative · on compte ce qu'on trouve.
   * Le manquant se lit dans l'écart, pas dans le comptage.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantiteComptee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurInventaire?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencePiece?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emplacement?: string;

  @IsOptional()
  @IsUUID()
  sousCommissionId?: string;
}

export class ArbitrerEcartDto {
  @IsEnum(DecisionEcartInventaire)
  decision!: DecisionEcartInventaire;

  /** Exigé pour un écart à redresser · CPCC étape 5, « déterminer le responsable ». */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsable?: string;

  /** Exigé pour tout écart NON redressé · sans motif, il est indiscernable d'un écart effacé. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explication?: string;
}

export class EtablirProcesVerbalDto {
  @IsOptional()
  @IsDateString()
  dateEtablissement?: string;
}
