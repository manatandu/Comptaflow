import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber,
  IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { NatureOperationVente, NatureReponseDevis } from '@prisma/client';

export class LigneDevisDto {
  @IsString() @MinLength(1) @MaxLength(500) designation!: string;
  @IsNumber() quantite!: number;
  @IsNumber() prixUnitaire!: number;
  @IsNumber() @Min(0) montantHT!: number;
}

export class EmettreDevisDto {
  @IsString() @MinLength(1) @MaxLength(60) numero!: string;
  @IsDateString() dateEmission!: string;
  @IsEnum(NatureOperationVente) nature!: NatureOperationVente;

  @IsOptional() @IsString() tiersId?: string;
  @IsOptional() @IsString() @MaxLength(300) clientNom?: string;
  @IsOptional() @IsString() @MaxLength(500) objet?: string;

  /** Null ou absent = aucun délai stipulé · l'art. 243 renvoie au délai raisonnable. */
  @IsOptional() @IsInt() @Min(1) delaiJours?: number;
  @IsOptional() @IsBoolean() declareeIrrevocable?: boolean;
  @IsOptional() @IsBoolean() destinataireDetermine?: boolean;
  @IsOptional() @IsBoolean() volonteDEtreLie?: boolean;
  /** Date à laquelle l'offre est PARVENUE au destinataire · art. 242. */
  @IsOptional() @IsDateString() dateReception?: string;

  /** Devis que celui-ci rejette · renseigné pour une contre-proposition. */
  @IsOptional() @IsString() contrePropositionDeId?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneDevisDto)
  lignes!: LigneDevisDto[];
}

export class EnregistrerReponseDto {
  @IsEnum(NatureReponseDevis) natureReponse!: NatureReponseDevis;
  /** Date à laquelle la réponse est PARVENUE à l'auteur de l'offre · art. 244. */
  @IsDateString() dateReponse!: string;
  @IsOptional() @IsString() @MaxLength(2000) detailReponse?: string;
}

export class RevoquerDevisDto {
  @IsDateString() revoqueLe!: string;
  @IsString() @MinLength(3) @MaxLength(500) motifRevocation!: string;
}
