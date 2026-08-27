import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Referentiel, TypeLicence } from '@prisma/client';

/**
 * Inscription = création du tenant (cabinet/association) + de son admin +
 * de sa licence + du plan de comptes initial + de l'exercice, en une seule
 * opération (voir AuthService.register). Le type de licence par défaut est
 * ABONNEMENT ; la vente d'une licence perpétuelle passe par un flux
 * commercial séparé (Phase 2), pas par l'auto-inscription publique.
 *
 * Ce DTO sert aussi bien à l'inscription initiale (page /inscription) qu'à
 * l'assistant « Nouveau fichier comptable » (créer un dossier supplémentaire
 * sous une nouvelle adresse e-mail — voir NouveauFichierWizard côté client) :
 * même endpoint, même règles, l'assistant ne fait qu'en habiller la saisie.
 */
export class RegisterDto {
  @IsString()
  nomEntite!: string;

  @IsEnum(Referentiel)
  referentiel!: Referentiel;

  @IsEmail()
  email!: string;

  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  motDePasse!: string;

  @IsOptional()
  @IsEnum(TypeLicence)
  typeLicence?: TypeLicence;

  // Coordonnées — écran « Coordonnées de l'entreprise » de l'assistant.
  @IsOptional()
  @IsString()
  activite?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  pays?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  devise?: string;

  // Exercice — écran « Définition de l'exercice » de l'assistant. Si omis,
  // l'exercice de l'année civile en cours est créé automatiquement
  // (voir ExerciceService.creerExerciceCourant).
  @IsOptional()
  @IsDateString()
  dateDebutExercice?: string;

  @IsOptional()
  @IsDateString()
  dateFinExercice?: string;
}
