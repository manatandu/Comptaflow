import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { OrganeDesignationAuditeur } from '@prisma/client';

export class EnregistrerMandatDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  /**
   * Exigée, jamais vérifiée · SYCEBNL art. 20 pour une EBNL ; loi n° 15/002,
   * art. 59, et AUSCGIE art. 695 (SA, SARL par l'art. 377) pour une société.
   * Voir `fondementInscription`.
   */
  @IsString()
  @MaxLength(120)
  inscriptionOrdre!: string;

  @IsEnum(OrganeDesignationAuditeur)
  organeDesignation!: OrganeDesignationAuditeur;

  @IsDateString()
  dateDesignation!: string;

  /** Année de clôture du premier exercice couvert. */
  @IsInt()
  @Min(1900)
  @Max(2200)
  premierExercice!: number;

  // Bornes larges à dessein · la vraie borne est le texte, et c'est le service
  // qui l'oppose avec son article. Un DTO qui refuserait à sa place rendrait un
  // message de validation sans source.
  @IsInt()
  @Min(1)
  @Max(12)
  nombreExercices!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rang?: number;

  /** AUSCGIE art. 706 et 728 · le mandat que celui-ci continue (SA, SAS). */
  @IsOptional()
  @IsUUID()
  mandatOrigineId?: string;

  // Les deux valeurs de l'enum `NatureSuccessionMandat` du schéma, écrites
  // ici · art. 706 (remplacement) et 728 (suppléant).
  @IsOptional()
  @IsIn(['REMPLACEMENT', 'SUPPLEANT'], { message: 'La succession se déclare REMPLACEMENT ou SUPPLEANT.' })
  natureSuccession?: 'REMPLACEMENT' | 'SUPPLEANT';
}

export class RefusProrogationDto {
  @IsBoolean()
  refus!: boolean;
}

export class CloreMandatDto {
  @IsDateString()
  finAnticipeeLe!: string;

  @IsString()
  @MaxLength(500)
  motifFin!: string;
}
