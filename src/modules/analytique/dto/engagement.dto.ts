import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { NatureEngagement } from '@prisma/client';

export class CreerEngagementDto {
  @IsString()
  exerciceId!: string;

  /** La ligne budgétaire engagée · le tableau est bâti section par section. */
  @IsString()
  sectionId!: string;

  /**
   * Les deux seules natures du guide (ch. 7, APPLICATION 22, règle (d)) : le
   * bon de commande remis au fournisseur, et le contrat signé par les parties
   * prenantes.
   */
  @IsEnum(NatureEngagement)
  nature!: NatureEngagement;

  /** Numéro du bon de commande ou du contrat · il identifie la pièce. */
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsString()
  @MinLength(1)
  objet!: string;

  /** Le fournisseur, ou la partie prenante signataire. */
  @IsString()
  @MinLength(1)
  beneficiaire!: string;

  /** Remise du bon au fournisseur, ou signature du contrat. */
  @IsDateString()
  date!: string;

  @IsNumber()
  montant!: number;
}

export class RattacherExecutionDto {
  @IsString()
  ecritureId!: string;

  /**
   * Saisi, et non déduit de l'écriture : une facture peut solder deux bons de
   * commande à la fois, et une commande peut être livrée en deux fois.
   */
  @IsNumber()
  montant!: number;
}

export class CloreEngagementDto {
  @IsString()
  @MinLength(1)
  motif!: string;
}

export class ListerEngagementsDto {
  @IsOptional()
  @IsString()
  exerciceId?: string;
}
