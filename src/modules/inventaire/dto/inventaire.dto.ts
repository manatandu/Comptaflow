import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

/**
 * UNE COUPURE COMPTÉE · valeur faciale et nombre.
 *
 * AJOUT DE L'ÉDITEUR, nommé comme tel : aucun texte lu n'exige la ventilation.
 * Elle est là parce que la fiche du compte 57 dit, dans les deux plans, que
 * « le solde du compte caisse doit toujours correspondre exactement à la somme
 * disponible réellement » · et qu'un nombre écrit à la main ne montre pas
 * comment on est arrivé à la somme.
 */
export class CoupureDto {
  @IsNumber()
  @IsPositive()
  valeurUnitaire!: number;

  @IsInt()
  @IsPositive()
  nombre!: number;
}

/** LE PROCÈS-VERBAL DE COMPTAGE D'UNE CAISSE · un par caisse (CPCC, § VI). */
export class EtablirPvCaisseDto {
  @IsUUID()
  compteId!: string;

  /** Celle qui a compté · ce sont SES membres qui signent. */
  @IsUUID()
  sousCommissionId!: string;

  @IsDateString()
  dateComptage!: string;

  /** Ajout de l'éditeur · une caisse bouge dans la journée. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  heureComptage?: string;

  /** Le solde de la balance au moment du comptage · figé sur le PV. */
  @IsNumber()
  soldeComptable!: number;

  @IsNumber()
  @Min(0)
  especesComptees!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoupureDto)
  coupures?: CoupureDto[];

  /** CPCC · « Si oui, une attestation a-t-elle été établie ? ». */
  @IsOptional()
  @IsDateString()
  attestationEtablieLe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  attestationPar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observations?: string;
}
