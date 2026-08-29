import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { StatutExoneration, TypeDemandeExoneration } from '@prisma/client';

export class CreerExonerationDto {
  @IsEnum(TypeDemandeExoneration)
  type!: TypeDemandeExoneration;

  @IsString()
  @MaxLength(300)
  objet!: string;

  @IsOptional()
  @IsEnum(StatutExoneration)
  statut?: StatutExoneration;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceArrete?: string;

  @IsOptional()
  @IsDateString()
  dateArrete?: string;

  @IsOptional()
  @IsDateString()
  dateDebutValidite?: string;

  /**
   * Facultative : pour un arrêté prévisionnel, le service la déduit du début
   * de validité et de la durée du texte (deux ans). Une date de fin saisie à
   * la main est la faute la plus coûteuse du registre.
   */
  @IsOptional()
  @IsDateString()
  dateFinValidite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lettreTransport?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurBiens?: number;

  /** Lettre du point 1 de l'article 339 du code des douanes (e, h, i, l, m). */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  franchiseDouaniere?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  piecesFournies?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}

export class ModifierExonerationDto {
  @IsOptional()
  @IsEnum(StatutExoneration)
  statut?: StatutExoneration;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  objet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceArrete?: string;

  @IsOptional()
  @IsDateString()
  dateArrete?: string;

  @IsOptional()
  @IsDateString()
  dateDebutValidite?: string;

  @IsOptional()
  @IsDateString()
  dateFinValidite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lettreTransport?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurBiens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  franchiseDouaniere?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  piecesFournies?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}
