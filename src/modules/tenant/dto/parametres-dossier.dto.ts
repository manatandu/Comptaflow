import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength, IsDateString, IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import {
  FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada,
  JeuEtatsFinanciersSycebnl,
  MethodeCotisations,
  RegimeExigibiliteTva,
  SystemeComptableSyscohada,
  MethodeInventaireStocks,
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

  /** Chaîne vide = effacement · seule une adresse non vide est contrôlée. */
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsEmail({}, { message: "Le courriel de l'entité n'est pas une adresse valide." })
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteWeb?: string;

  /**
   * Capital social · AUSCGIE art. 17. `null` l'efface. Refusé par le service
   * à une EBNL et à une personne physique (`motifRefusCapital`).
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le capital social est un montant, à deux décimales au plus.' })
  @Min(0.01, { message: 'Le capital social est un montant positif.' })
  capitalSocial?: number | null;

  /** AUSCGIE art. 269-2 · « à capital variable » ajouté à la forme sociale. */
  @IsOptional()
  @IsBoolean()
  capitalVariable?: boolean;

  /**
   * MONNAIE FONCTIONNELLE · celle dans laquelle l'entité vit réellement
   * (USD, EUR...). Code ISO 4217, chaîne vide = effacement.
   *
   * Elle ne déplace PAS la tenue, qui reste en francs congolais · loi
   * n° 23/053 art. 141, 1° et AUDCIF art. 17, 1°, ni l'un ni l'autre ne
   * prévoyant d'option. Elle nomme la monnaie du SECOND jeu de documents,
   * produit à côté du jeu légal et sans valeur légale.
   *
   * LA MONNAIE DE TENUE N'EST PLUS DANS CE DTO. Elle y figurait, et comme
   * elle ne convertissait rien, la changer imprimait « montants en USD » sur
   * une liasse en francs. Un champ qu'on ne peut plus envoyer vaut mieux
   * qu'un champ qu'on refuse : il n'y a plus de geste à refuser.
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  deviseFonctionnelle?: string;
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

/** Réponse à une question déclarée · la troisième valeur n'est pas « non ». */
export const REPONSES_FAIT = ['OUI', 'NON', 'PAS_ENCORE_DIT'] as const;
export type ReponseFait = (typeof REPONSES_FAIT)[number];

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

  /**
   * LA RÉPONSE, AVEC SA TROISIÈME VALEUR. « PAS_ENCORE_DIT » remet
   * `assujettiTva` à faux ET efface la réponse · un menu ne se masque que sur
   * une réponse donnée (`client/src/lib/profil-dossier.ts`). `assujettiTva`
   * seul reste accepté et vaut réponse.
   */
  @IsOptional()
  @IsIn(REPONSES_FAIT)
  reponseAssujettissementTva?: ReponseFait;

  /** L'entité vend-elle des biens ou des services ? Même trois valeurs. */
  @IsOptional()
  @IsIn(REPONSES_FAIT)
  venteBiensServices?: ReponseFait;

  @IsOptional()
  @IsDateString()
  dateOptionTva?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  effectifPermanent?: number;

  /**
   * ART. 212, POINT 2 du Code du travail · « le numéro d'immatriculation de
   * l'employeur à l'Institut National de Sécurité Sociale ». Deuxième des
   * quinze énonciations obligatoires de tout contrat écrit, et la seule qui
   * soit du côté de l'employeur : tant qu'elle manque, AUCUN contrat du
   * dossier n'est complet, quel que soit le soin mis aux fiches.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroAffiliationCnssEmployeur?: string;

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

/**
 * Mode de tenue des stocks · AUDCIF Titre VII ch. 3 section 3 et SYCEBNL
 * Partie 2 ch. 3 section 3, dans les mêmes mots. Pas de valeur par défaut,
 * ici comme en base : présumer l'INTERMITTENT ferait proposer une écriture de
 * variation à un dossier qui tient le permanent, où la variation serait alors
 * comptée deux fois.
 */
export class ModifierMethodeInventaireStocksDto {
  @IsEnum(MethodeInventaireStocks)
  methodeInventaireStocks!: MethodeInventaireStocks;
}


/**
 * Double regard à la validation · une écriture n'est-elle validable que par un
 * autre utilisateur que celui qui l'a saisie.
 *
 * OBLIGATOIRE et non optionnel : une case à cocher qu'on peut omettre laisse
 * l'appelant croire qu'il l'a décochée. Motif établi par
 * `ModifierMethodeCotisationsDto`.
 *
 * Le défaut `false` du schéma n'est PAS une position d'OmegaX sur la bonne
 * organisation comptable · c'est le constat qu'aucun texte lu ne l'impose.
 * L'AUDCIF art. 22, 2° impose la validation et ne nomme personne ; l'art. 69 la
 * délègue expressément à l'entité, et le SYCEBNL fait de même par son
 * art. 16, 2), l'art. 69 lui étant exclu par son art. 3.
 */
export class ModifierDoubleRegardDto {
  @IsBoolean()
  doubleRegardValidation!: boolean;
}

/**
 * LONGUEUR MAXIMALE DES NUMÉROS DE COMPTE DU DOSSIER · plage de Sage, 3 à 13
 * chiffres (skill `sage-i7`, comptabilité générale). La même plage que celle
 * du DTO de création de compte, qui valide le format sans connaître le dossier.
 *
 * Le PLANCHER réel n'est pas ici et ne peut pas y être : il vaut la longueur du
 * plus long numéro DÉJÀ OUVERT, et un DTO ne connaît pas le dossier. C'est
 * `TenantService.modifierLongueurCompte` qui le lit en base et refuse de
 * descendre en dessous · sinon des comptes existants, mouvementés et repris
 * dans des états, deviendraient invalides rétroactivement.
 */
export class ModifierLongueurCompteDto {
  @IsInt()
  @Min(3)
  @Max(13)
  longueurCompte!: number;
}
