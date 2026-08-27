import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Referentiel, TypeLicence } from '@prisma/client';

/**
 * Inscription = création du tenant (cabinet/association) + de son admin +
 * de sa licence + du plan de comptes initial, en une seule opération
 * transactionnelle (voir AuthService.register). Le type de licence par
 * défaut est ABONNEMENT ; la vente d'une licence perpétuelle passe par un
 * flux commercial séparé (Phase 2), pas par l'auto-inscription publique.
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
}
