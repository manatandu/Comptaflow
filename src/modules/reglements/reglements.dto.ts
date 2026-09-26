import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ReglementTiersDto {
  /** Compte de tiers (40 ou 41) que le règlement solde. */
  @IsUUID('4')
  compteId!: string;

  /** Lignes d'échéance réglées · toutes sur ce compte. */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ligneIds!: string[];

  /** Montant réglé, s'il est inférieur au dû · absent, le dû entier. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  montant?: number;

  /** Numéro du chèque ou du virement, porté en référence de la pièce. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;
}

export class EnregistrerReglementsDto {
  @IsIn(['FOURNISSEUR', 'CLIENT'])
  sens!: 'FOURNISSEUR' | 'CLIENT';

  @IsUUID('4')
  exerciceId!: string;

  /** Journal de TRÉSORERIE · son compte de trésorerie porte la contrepartie. */
  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReglementTiersDto)
  reglements!: ReglementTiersDto[];

  /**
   * Préparer l'ordre de virement de ces règlements (fournisseurs seulement) ·
   * il naît « en attente d'impression », sur les pièces qu'il exécute.
   */
  @IsOptional()
  @IsBoolean()
  ordreVirement?: boolean;
}
