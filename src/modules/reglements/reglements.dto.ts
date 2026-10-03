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
  IsPositive,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FacultatifNonNul } from '../../common/facultatif-non-nul';

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

  /**
   * RÈGLEMENT EN DEVISE (ligne A6) · montant réglé dans la devise des
   * factures, s'il est inférieur au dû en devise · absent, le dû entier.
   * Plus que le dû EN DEVISE est refusé (reglement-tiers.ts).
   */
  @FacultatifNonNul('Omettez le montant en devise pour régler le dû entier.')
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montantDevise?: number;

  /**
   * Cours du JOUR DU RÈGLEMENT · exigé dès que les factures sont en devise,
   * sauf si le montant payé en francs (`montant`) est saisi, le cours s'en
   * déduisant alors (AUDCIF art. 52). Jamais deviné.
   */
  @FacultatifNonNul('Le cours du règlement est un nombre positif · omettez-le pour des factures en francs.')
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  coursReglement?: number;

  /**
   * Compte de l'écart de change réalisé, quand le texte n'en donne aucun
   * (créance ou dette commerciale au SYCEBNL) · voir ecart-change-realise.ts.
   */
  @FacultatifNonNul("Omettez le compte d'écart de change quand le texte le donne.")
  @IsUUID('4')
  compteEcartChangeId?: string;
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

  /**
   * Le moyen de paiement est EN DEVISE (banque ou caisse en devises) · la
   * ligne de trésorerie porte alors le montant en devise et le cours du jour,
   * sans quoi la conversion des disponibilités à la clôture (AUDCIF art. 57)
   * ne la trouverait pas. Faux · le règlement se fait en francs.
   */
  @FacultatifNonNul('Omettez « trésorerie en devise » ou passez false.')
  @IsBoolean()
  tresorerieEnDevise?: boolean;

  /**
   * La devise du moyen de paiement, DÉCLARÉE avec « trésorerie en devise » ·
   * jamais déduite de la facture (reglements/ecart-change-realise.ts,
   * `motifRefusTresorerieEnDevise`).
   */
  @FacultatifNonNul('Omettez la devise du moyen de paiement pour un règlement en francs.')
  @IsUUID('4')
  deviseTresorerieId?: string;
}

/**
 * PASSER L'ÉCART DE CHANGE PROPOSÉ d'un lettrage soldé en devise et non en
 * francs (ligne A6) · la proposition est relue au serveur, jamais reçue.
 */
export class PasserEcartChangeDto {
  @IsUUID('4')
  lettrageId!: string;

  @IsUUID('4')
  exerciceId!: string;

  /** Journal d'opérations diverses où passe l'écart. */
  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @FacultatifNonNul("Omettez le compte d'écart de change quand le texte le donne.")
  @IsUUID('4')
  compteEcartChangeId?: string;
}
