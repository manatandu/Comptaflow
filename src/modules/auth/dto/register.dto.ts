import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { JeuEtatsFinanciersSycebnl, Referentiel, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';

/**
 * Inscription = création du tenant (cabinet/association) + de son admin +
 * de sa licence + du plan de comptes initial + de l'exercice, en une seule
 * opération (voir AuthService.register). Le type de licence par défaut est
 * ABONNEMENT ; la vente d'une licence perpétuelle passe par un flux
 * commercial séparé (Phase 2), pas par l'auto-inscription publique.
 *
 * Ce DTO sert aussi bien à l'inscription initiale (page /inscription) qu'à
 * l'assistant « Nouveau fichier comptable » (créer un dossier supplémentaire
 * sous une nouvelle adresse e-mail · voir NouveauFichierWizard côté client) :
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

  // Jeu d'états financiers SYCEBNL · écran « Type d'entité » de l'assistant.
  // Article 4 de l'Acte uniforme : une association ou un ordre professionnel
  // n'a pas les mêmes états qu'un projet de développement (tableau
  // emplois-ressources, exécution budgétaire, réconciliation de trésorerie).
  // Omis, on retient les associations et ordres professionnels, cas le plus
  // fréquent (défaut du schéma).
  @IsOptional()
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;

  // Pendant SYSCOHADA · écran « Système comptable » de l'assistant. L'AUDCIF
  // (art. 11) n'admet que deux présentations, le Système normal et le Système
  // minimal de trésorerie, et l'art. 13 réserve le second aux entités sous
  // seuil de chiffre d'affaires. Omis, on retient le Système normal, régime
  // de droit commun de l'art. 11.
  @IsOptional()
  @IsEnum(SystemeComptableSyscohada)
  systemeComptableSyscohada?: SystemeComptableSyscohada;

  @IsOptional()
  @IsEnum(TypeLicence)
  typeLicence?: TypeLicence;

  // Coordonnées · écran « Coordonnées de l'entreprise » de l'assistant.
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

  // LA MONNAIE DE TENUE N'EST PLUS UN CHAMP DE CRÉATION. Elle ne convertissait
  // rien · elle étiquetait le cartouche de chaque état (« montants en X »), si
  // bien qu'un dossier ouvert en USD imprimait une unité fausse sur sa liasse
  // entière dès le premier jour. Et la tenue en franc congolais n'est pas une
  // option : loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°. La colonne prend
  // sa valeur par défaut. Voir src/common/monnaie-de-tenue.ts.

  // Exercice · écran « Définition de l'exercice » de l'assistant. Si omis,
  // l'exercice de l'année civile en cours est créé automatiquement
  // (voir ExerciceService.creerExerciceCourant).
  @IsOptional()
  @IsDateString()
  dateDebutExercice?: string;

  @IsOptional()
  @IsDateString()
  dateFinExercice?: string;
}
