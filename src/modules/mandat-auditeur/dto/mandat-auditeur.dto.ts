import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OrganeDesignationAuditeur } from '@prisma/client';

export class EnregistrerMandatDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  /** SYCEBNL art. 20 · exigée, jamais vérifiée. Voir le service. */
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
