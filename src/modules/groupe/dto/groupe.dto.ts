import { IsBase64, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';

/**
 * Création d'une cellule PAR LE SIÈGE (dossier mère). Le rattachement est
 * imposé côté serveur (dossierMereId = le tenant appelant, jamais un choix),
 * la licence est héritée de la mère, et le plafond de cellules fixé par la
 * console plateforme borne le tout · voir GroupeService.creerCellule.
 */
export class CreerCelluleDto {
  @IsString()
  @MaxLength(120)
  nom!: string;

  /**
   * Adresse du responsable du dossier de la cellule · le trésorier si la
   * cellule est autonome, un alias du comptable du siège si elle est opérée
   * par lui (cellules « dépôt Excel »).
   */
  @IsEmail()
  emailAdmin!: string;

  @IsOptional()
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;
}

/** Dépôt d'un canevas de trésorerie rempli · fichier .xlsx encodé en base64. */
export class ImporterCanevasDto {
  @IsString()
  @MaxLength(255)
  nomFichier!: string;

  // ~8 Mo de fichier une fois décodé · aligné sur la limite de l'import.
  @IsBase64()
  @MaxLength(11_000_000)
  contenuBase64!: string;
}
