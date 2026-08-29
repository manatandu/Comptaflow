import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { TypeTiers } from '@prisma/client';

export class CreerTiersDto {
  @IsEnum(TypeTiers)
  type!: TypeTiers;

  @Matches(/^\S+$/, { message: 'Le code ne doit pas contenir d’espaces' })
  code!: string;

  @IsString()
  nom!: string;

  @IsOptional()
  @IsUUID()
  modeleReglementId?: string;

  /*
    COORDONNÉES · elles manquaient, et cela rendait inutilisable une brique
    déjà construite : le module de relances compose des lettres de rappel
    complètes qu'aucun destinataire ne portait. Le Numéro Impôt n'est pas
    décoratif non plus · la liste annuelle des fournisseurs (loi de procédures
    fiscales, art. 47 ter, au plus tard le 31 mars) exige nommément
    « identité, adresse, boîte postale, Numéro Impôt » de chacun.
  */
  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  boitePostale?: string;

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
  @IsEmail({}, { message: 'Adresse électronique invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  numeroImpot?: string;

  @IsOptional()
  @IsString()
  contact?: string;
}

export class ModifierTiersDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;

  // null explicite = détache le modèle de règlement courant
  @IsOptional()
  @IsUUID()
  modeleReglementId?: string | null;

  /*
    COORDONNÉES · elles manquaient, et cela rendait inutilisable une brique
    déjà construite : le module de relances compose des lettres de rappel
    complètes qu'aucun destinataire ne portait. Le Numéro Impôt n'est pas
    décoratif non plus · la liste annuelle des fournisseurs (loi de procédures
    fiscales, art. 47 ter, au plus tard le 31 mars) exige nommément
    « identité, adresse, boîte postale, Numéro Impôt » de chacun.
  */
  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  boitePostale?: string;

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
  @IsEmail({}, { message: 'Adresse électronique invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  numeroImpot?: string;

  @IsOptional()
  @IsString()
  contact?: string;
}

export class RattacherCompteDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsBoolean()
  estPrincipal?: boolean;
}
