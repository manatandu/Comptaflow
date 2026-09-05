import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength, IsDateString, IsInt, Min, ValidateIf } from 'class-validator';
import {
  FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada,
  JeuEtatsFinanciersSycebnl,
  MethodeCotisations,
  RegimeExigibiliteTva,
  SystemeComptableSyscohada,
} from '@prisma/client';

export class ModifierJeuEtatsDto {
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeuEtatsFinanciersSycebnl!: JeuEtatsFinanciersSycebnl;
}

/** Pendant SYSCOHADA du jeu d'états · AUDCIF art. 11 et 13. */
export class ModifierSystemeSyscohadaDto {
  @IsEnum(SystemeComptableSyscohada)
  systemeComptableSyscohada!: SystemeComptableSyscohada;
}

/**
 * Coordonnées et raison sociale du dossier · ce que l'assistant de création
 * demande à son écran « Coordonnées ».
 *
 * Elles étaient GELÉES à la création, alors que l'écran promettait le
 * contraire, et que `adresse + ville + pays` compose l'adresse imprimée en
 * tête de chaque état financier (voir ExportService.identiteLiasse). Un
 * cabinet qui déménage ne peut pas rester à son ancienne adresse sur des
 * documents qu'il signe.
 *
 * Chaîne vide reçue = effacement du champ (`null` en base), même convention
 * que les identifiants légaux.
 */
export class ModifierCoordonneesDto {
  /** Raison sociale · imprimée en tête de liasse, elle ne peut pas être vide. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adresse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ville?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pays?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telephone?: string;

  /**
   * Code ISO 4217. Verrouillé dès la première écriture, voir le service :
   * les montants déjà saisis ne changent pas de valeur quand l'étiquette
   * change, et une liasse qui afficherait des francs en dollars serait fausse.
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  devise?: string;
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

  // Date de DÉLIVRANCE de l'attestation, jamais une échéance · l'arrêté
  // n° 007/2025 n'en fixe aucune. Même garde que la date de l'acte : la chaîne
  // vide est le geste d'EFFACEMENT (le service la convertit en null), et
  // @IsDateString seul la refuserait.
  @IsOptional()
  @ValidateIf((o: ModifierIdentiteDto) => o.dateAttestationExemptionIs !== '')
  @IsDateString()
  dateAttestationExemptionIs?: string;
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
 * Pendant SYSCOHADA de la forme juridique · droit OHADA des affaires, pas loi
 * n° 004/2001. Les CINQ sociétés commerciales par la forme de l'AUSCGIE
 * art. 6, le GIE (art. 869), la société coopérative (AUSCOOP), le commerçant
 * personne physique et l'entreprenant (AUDCG art. 2 et 30), la succursale
 * (AUSCGIE art. 116) et les entités publiques (AUDCIF art. 2).
 *
 * Refusée sur un dossier SYCEBNL : une ASBL n'a pas de forme OHADA, elle a
 * une forme de la loi n° 004/2001 (voir ModifierFormeJuridiqueDto).
 */
export class ModifierFormeSyscohadaDto {
  @IsEnum(FormeJuridiqueSyscohada)
  formeJuridiqueSyscohada!: FormeJuridiqueSyscohada;
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

/**
 * Fait générateur des cotisations et du droit d'entrée · cadre conceptuel
 * SYCEBNL § 5.4.2.1. Pas de valeur par défaut, ici comme en base : le champ
 * est obligatoire dans la requête, et l'absence de choix reste l'état `null`
 * du dossier · un défaut ferait trancher le logiciel à la place des statuts.
 */
export class ModifierMethodeCotisationsDto {
  @IsEnum(MethodeCotisations)
  methodeCotisations!: MethodeCotisations;
}
