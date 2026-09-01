import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, IsDateString, IsInt, Min, ValidateIf } from 'class-validator';
import { FormeJuridiqueEbnl, JeuEtatsFinanciersSycebnl, RegimeExigibiliteTva } from '@prisma/client';

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

  // RCCM · sans objet pour une entité SYCEBNL (elle n'est pas commerçante et
  // aucune loi ne l'assujettit au registre) · le champ ne sert qu'aux dossiers
  // SYSCOHADA. Voir docs/identifiants-legaux-ebnl-rdc.md § 1.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  rccm?: string;

  // --- Propres aux entités à but non lucratif -----------------------------
  // Arrêté du Ministre de la Justice (loi 004/2001, art. 3) ou décret
  // présidentiel pour une entité de droit étranger (art. 30) · plus long
  // qu'un numéro : « Arrêté ministériel n° 123/CAB/MIN/J&GS/2024 ».
  @IsOptional()
  @IsString()
  @MaxLength(120)
  actePersonnaliteJuridique?: string;

  // La chaîne vide est le geste d'EFFACEMENT de la date (le service la
  // convertit en null) · @IsDateString seul la refuserait, et l'utilisateur
  // n'aurait aucun moyen de retirer une date saisie par erreur.
  @IsOptional()
  @ValidateIf((o: ModifierIdentiteDto) => o.dateActePersonnalite !== '')
  @IsDateString()
  dateActePersonnalite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  numeroEnregistrementSecteur?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  certificatEnregistrementPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  attestationExemptionIs?: string;
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

  /**
   * Régime d'exigibilité de la TVA · O.-L. n° 10/001, art. 25 et 26. Il
   * décide de la PÉRIODE dans laquelle une TVA facturée se déclare : à la
   * livraison, à l'encaissement (droit commun des prestations de services),
   * ou aux débits sur autorisation.
   */
  @IsOptional()
  @IsEnum(RegimeExigibiliteTva)
  regimeExigibiliteTva?: RegimeExigibiliteTva;

  @IsOptional()
  @IsDateString()
  dateAutorisationDebitsTva?: string;
}
