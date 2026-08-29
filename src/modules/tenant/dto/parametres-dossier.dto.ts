import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';

export class ModifierJeuEtatsDto {
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeuEtatsFinanciersSycebnl!: JeuEtatsFinanciersSycebnl;
}

/**
 * Identifiants légaux congolais du dossier · exigés en en-tête de chaque page
 * d'un état financier déposé (CPCC, Notes de cours d'organisation comptable,
 * § 7.4 règle 7-a). Chaîne vide reçue = effacement de l'identifiant.
 */
export class ModifierIdentiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroImpot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  idNat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  rccm?: string;
}
