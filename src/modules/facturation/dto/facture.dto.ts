import { Type } from 'class-transformer';
import {
  IsUUID,
  IsObject,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SensFacture } from '@prisma/client';

export class LigneFactureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  designation!: string;

  @IsNumber()
  quantite!: number;

  @IsNumber()
  prixUnitaire!: number;

  @IsNumber()
  @Min(0)
  montantHT!: number;

  @IsOptional()
  @IsBoolean()
  imposable?: boolean;

  @IsOptional()
  @IsString()
  tauxTvaId?: string;

  @IsOptional()
  @IsNumber()
  tauxApplique?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantTva?: number;
}

export class EnregistrerFactureDto {
  @IsEnum(SensFacture)
  sens!: SensFacture;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  numeroSerie!: string;

  @IsDateString()
  dateFacture!: string;

  @IsOptional()
  @IsString()
  tiersId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  contrepartieNom?: string;

  /** Art. 26 b) · « l'adresse exacte du client », mention obligatoire. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  contrepartieAdresse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  contrepartieNumeroImpot?: string;

  @IsOptional()
  @IsBoolean()
  mentionTvaDebits?: boolean;

  /** Art. 26 j) · portez 0 s'il n'y en a pas, l'absence n'est pas une réponse. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  autresImpotsEtTaxes?: number;

  @IsOptional()
  @IsString()
  ecritureId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneFactureDto)
  lignes!: LigneFactureDto[];
}

/**
 * NOTE DE CRÉDIT · décret n° 011/42, art. 127. Elle ANNULE ET REMPLACE la
 * facture initiale : ses lignes sont celles de la facture visée, recopiées par
 * le service. Seuls le numéro, la date et l'écriture sont propres à la note.
 */
export class EmettreNoteDeCreditDto {
  /** N° de série de la note · même facturier, même unicité que les factures. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  numeroSerie!: string;

  @IsDateString()
  dateNote!: string;

  /** L'écriture d'annulation, celle qui débite le 443 sur une vente. */
  @IsOptional()
  @IsString()
  ecritureId?: string;
}

/** Passer l'écriture d'une facture · le journal et le compte de gestion sont choisis, jamais devinés. */
export class ComptabiliserFactureDto {
  @IsUUID()
  journalId!: string;

  @IsOptional()
  @IsUUID()
  compteGestionId?: string | null;

  /** Identifiant de ligne de facture → compte de gestion, pour une ligne qui diffère. */
  @IsOptional()
  @IsObject()
  comptesParLigne?: Record<string, string>;
}
