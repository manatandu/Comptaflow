import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  CycleCircularisation,
  FormeConfirmation,
  NatureEcartConfirmation,
  StatutDemandeConfirmation,
} from '@prisma/client';

export class CreerCampagneCircularisationDto {
  @IsUUID()
  exerciceId!: string;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  @IsDateString()
  dateArrete!: string;

  @IsEnum(CycleCircularisation)
  cycle!: CycleCircularisation;

  @IsOptional()
  @IsEnum(FormeConfirmation)
  forme?: FormeConfirmation;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  methodeSelection?: string;

  /** ISA 505 § 15 · les quatre conditions, à déclarer une à une pour la forme négative. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditionsNegativeReunies?: string[];
}

export class CreerDemandeDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsUUID()
  tiersId?: string;

  @IsString()
  @MaxLength(300)
  destinataire!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adresse?: string;

  /**
   * Facultatif · à défaut, le solde de la balance à la date de la campagne est
   * repris tel quel. Le renseigner sert au cas d'une banque dont la lettre
   * porte un solde de relevé, distinct du solde comptable.
   */
  @IsOptional()
  @IsNumber()
  soldeAConfirmer?: number;
}

export class EnvoyerDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DepouillerDto {
  @IsEnum(StatutDemandeConfirmation)
  statut!: StatutDemandeConfirmation;

  @IsOptional()
  @IsDateString()
  date?: string;

  /** Exigé sur une réponse reçue · zéro est une réponse, l'absence n'en est pas une. */
  @IsOptional()
  @IsNumber()
  soldeConfirme?: number;

  /** Exigé dès que l'écart n'est pas nul · ISA 505 § 14 et § A22. */
  @IsOptional()
  @IsEnum(NatureEcartConfirmation)
  natureEcart?: NatureEcartConfirmation;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  investigation?: string;

  /** ISA 505 § 7 c) · une réponse parvenue par l'entité n'est pas revenue directement. */
  @IsOptional()
  @IsBoolean()
  reponseIndirecte?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  doutefiabilite?: string;
}

export class ProceduresAlternativesDto {
  @IsString()
  @MaxLength(5000)
  proceduresAlternatives!: string;
}

export class ClorerCampagneDto {
  /** ISA 505 § 8 · le refus de la direction, s'il y en a eu un. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  refusDirectionMotif?: string;
}
