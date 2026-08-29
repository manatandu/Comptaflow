import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, IsDateString, IsInt, Min } from 'class-validator';
import { FormeJuridiqueEbnl, JeuEtatsFinanciersSycebnl } from '@prisma/client';

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


/**
 * Forme juridique au sens de la loi n° 004/2001 · commande les obligations
 * annuelles affichées par le planning de clôture, pas la présentation des
 * états. Modifiable à tout moment, contrairement au jeu d'états : une
 * association peut être reconnue ONG en cours de vie.
 */
export class ModifierFormeJuridiqueDto {
  @IsEnum(FormeJuridiqueEbnl)
  formeJuridique!: FormeJuridiqueEbnl;

  @IsOptional()
  @IsBoolean()
  droitEtranger?: boolean;
}

/**
 * ASSUJETTISSEMENT À LA TVA et EFFECTIF PERMANENT · deux données que le
 * logiciel ne détenait pas et sans lesquelles il ne pouvait appliquer ni les
 * règles de TVA (une ASBL n'est pas assujettie de plein droit) ni le troisième
 * critère de désignation de l'auditeur (SYCEBNL, art. 19).
 */
export class ModifierRegimeDto {
  @IsOptional()
  @IsBoolean()
  assujettiTva?: boolean;

  @IsOptional()
  @IsDateString()
  dateOptionTva?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  effectifPermanent?: number;
}
