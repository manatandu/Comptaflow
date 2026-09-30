import type { RegimeSalarial } from '../bareme-irpp';
import { BAREMES_SERVIS, MOTIF_BAREME_NON_SAISISSABLE } from '../baremes-dossier';
import { PLAFOND_ENFANTS_PAR_FICHE } from '../bornes-registre';
import { MOTIF_MONNAIE_EXIGEE } from '../regles-contrat-travail';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PeriodiciteRemuneration, SexeTravailleur, TypeContratTravail } from '@prisma/client';

export class EnfantAChargeDto {
  @IsString()
  @MaxLength(120)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  postNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  prenoms?: string;

  /**
   * Exigée par l'art. 212, point 7 · facultative à la SAISIE pour que le
   * registre puisse être complété plus tard, et réclamée par le CONTRÔLE.
   * L'imposer ici ferait renoncer à enregistrer l'enfant, et son absence
   * deviendrait muette au lieu d'être signalée.
   */
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;
}

export class SalarieDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  matricule?: string;

  @IsString()
  @MaxLength(120)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  postNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  prenoms?: string;

  @IsEnum(SexeTravailleur)
  sexe!: SexeTravailleur;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroAffiliationCnss?: string;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  millesimeNaissance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationalite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomConjoint?: string;

  @IsOptional()
  @IsDateString()
  aptitudeConstateeLe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aptitudeConstateePar?: string;

  @IsOptional()
  @IsBoolean()
  aptitudeProvisoire?: boolean;

  @IsOptional()
  @IsDateString()
  declarationEngagementLe?: string;

  @IsOptional()
  @IsDateString()
  declarationDepartLe?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  /**
   * Bornée à ce que la fiche montre (audit final F259) · la fiche REMPLACE
   * ses enfants en bloc, et un tableau plus long que la tranche affichée
   * ferait naître des enfants que l'écran ne rendrait plus, donc qu'un
   * enregistrement suivant effacerait.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PLAFOND_ENFANTS_PAR_FICHE, {
    message: `Une fiche porte au plus ${PLAFOND_ENFANTS_PAR_FICHE} enfants à charge, ce que l'écran du registre peut montrer.`,
  })
  @ValidateNested({ each: true })
  @Type(() => EnfantAChargeDto)
  enfants?: EnfantAChargeDto[];
}

/**
 * Le refus d'une monnaie de rémunération que le registre ne connaît pas, en
 * français (relecture adverse de F226) · la validation du corps rendait le
 * message anglais de class-validator.
 */
export const MOTIF_MONNAIE_REMUNERATION =
  'La monnaie de la rémunération convenue est le franc congolais (CDF) ou le dollar américain (USD).';

export class ContratTravailDto {
  @IsEnum(TypeContratTravail)
  type!: TypeContratTravail;

  @IsOptional()
  @IsBoolean()
  constateParEcrit?: boolean;

  @IsDateString()
  dateEntreeEnVigueur!: string;

  @IsOptional()
  @IsDateString()
  dateConclusion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lieuConclusion?: string;

  @IsOptional()
  @IsDateString()
  dateFinPrevue?: string;

  @IsOptional()
  @IsBoolean()
  separeDeSaFamille?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ouvrageDetermine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motifRemplacement?: string;

  @IsOptional()
  @IsBoolean()
  emploiPermanent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  natureTravail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lieuExecution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorieProfessionnelle?: string;

  /**
   * La classe de la tension salariale, de 1 à 17 · elle vient du DÉCRET, et
   * non de la convention collective du dossier, qui est une autre grille.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(17)
  classeProfessionnelle?: number;

  /**
   * L'unité dans laquelle la rémunération est stipulée. Sans elle, le
   * contrôle du minimum légal s'abstient · il ne suppose pas le mois.
   */
  @IsOptional()
  @IsEnum(PeriodiciteRemuneration)
  periodiciteRemuneration?: PeriodiciteRemuneration;

  @IsOptional()
  @IsBoolean()
  manoeuvreSansSpecialite?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remunerationBase?: number;

  /**
   * La monnaie dans laquelle `remunerationBase` est stipulée (audit final
   * F226). Absente, le contrôle du minimum s'abstient · il ne suppose pas le
   * franc, et un salaire en dollars lu comme des francs passait très en deçà
   * du minimum.
   *
   * EXIGÉE DÈS QU'UN MONTANT EST CONVENU (`MOTIF_MONNAIE_EXIGEE`, dont la
   * règle et le motif sont écrits dans `regles-contrat-travail.ts`). Sans
   * montant, le champ reste facultatif ; dit, il doit être l'une des deux
   * monnaies, montant ou non.
   */
  @ValidateIf(
    (o: ContratTravailDto) =>
      (o.deviseRemuneration !== undefined && o.deviseRemuneration !== null) ||
      (o.remunerationBase !== undefined && o.remunerationBase !== null),
  )
  @IsDefined({ message: MOTIF_MONNAIE_EXIGEE })
  @IsEnum(['CDF', 'USD'], { message: MOTIF_MONNAIE_REMUNERATION })
  deviseRemuneration?: 'CDF' | 'USD';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avantagesConvenus?: string;

  @IsOptional()
  @IsBoolean()
  clauseEssai?: boolean;

  @IsOptional()
  @IsBoolean()
  essaiConstateParEcrit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  essaiDureeJours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dureePreavisJours?: number;

  @IsOptional()
  @IsBoolean()
  viseParOnem?: boolean;

  @IsOptional()
  @IsDateString()
  dateVisaOnem?: string;

  /**
   * ART. 41 · le contrat que celui-ci RENOUVELLE. Un renouvellement n'est pas
   * un nouveau contrat, et les compter ensemble ferait manquer la règle.
   */
  @IsOptional()
  @IsString()
  renouvelleDeId?: string;
}

/**
 * AUDIT FINAL F226 · la monnaie de la rémunération d'un contrat saisi avant
 * que le registre ne la demande. Elle COMPLÈTE le contrat, elle ne le modifie
 * pas · une monnaie déjà déclarée ne se change pas ici.
 */
export class DeviseRemunerationDto {
  @IsEnum(['CDF', 'USD'], { message: MOTIF_MONNAIE_REMUNERATION })
  deviseRemuneration!: 'CDF' | 'USD';
}

export class TerminerContratDto {
  @IsDateString()
  dateFin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motifFin?: string;
}

/**
 * UN ÉLÉMENT DE PAIE SOUMIS À LA SIMULATION. Rien n'est stocké · P2a rend
 * deux assiettes et une retenue, le bulletin est de P2b.
 */
export class ElementPaieDto {
  @IsEnum([
    'SALAIRE_OU_TRAITEMENT',
    'COMMISSION',
    'INDEMNITE_DE_VIE_CHERE',
    'PRIME',
    'PARTICIPATION_AUX_BENEFICES',
    'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE',
    'PRESTATION_SUPPLEMENTAIRE',
    'AVANTAGE_EN_NATURE',
    'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE',
    'INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT',
    'SOINS_DE_SANTE',
    'LOGEMENT_OU_SON_INDEMNITE',
    'ALLOCATIONS_FAMILIALES_LEGALES',
    'INDEMNITE_DE_TRANSPORT',
    'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
  ])
  nature!: string;

  @IsString()
  @MaxLength(160)
  libelle!: string;

  /**
   * Le montant en francs congolais · exigé sauf quand l'élément est donné en
   * dollars (`montantUsd`), auquel cas le SERVEUR le calcule au cours du jour
   * et l'écrase (voir conversion-usd.ts).
   */
  @ValidateIf((e: ElementPaieDto) => e.montantUsd === undefined)
  @IsNumber()
  @Min(0)
  montantFc!: number;

  /**
   * Le montant en dollars américains, pour un salaire stipulé en USD
   * (`SimulationPaieDto.deviseStipulation`). Converti au cours du jour saisi
   * au dossier, jamais à un cours fourni par le client.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  montantUsd?: number;

  @IsOptional()
  @IsBoolean()
  remboursementDeDepenseProfessionnelleEffective?: boolean;

  /**
   * Articles 69, 8, b) et c) · l'attestation du cabinet. Laisser le champ
   * ABSENT vaut abstention, jamais immunité.
   */
  @IsOptional()
  @IsBoolean()
  conditionArticle69Attestee?: boolean;

  /**
   * Logement, transport ou soins FOURNIS EN NATURE (passe F5) · rien n'est
   * versé, et le service refuse le drapeau sur toute autre nature.
   */
  @IsOptional()
  @IsBoolean()
  enNature?: boolean;

  /**
   * La rubrique du cabinet dont l'élément est tiré. Présente, sa NATURE est
   * relue au serveur et remplace celle que le client envoie · la rubrique
   * nomme, la nature décide (rubriques-paie.ts).
   */
  @IsOptional()
  @IsUUID('4')
  rubriqueId?: string;
}

/** Article 112, c) et f) · une retenue sur une avance du registre. */
export class RetenueAvanceDto {
  @IsUUID('4')
  avanceId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montantFc!: number;
}

export class SimulationPaieDto {
  /** Mois de paie au format AAAA-MM · il borne le barème et le SMIG. */
  @IsString()
  @MaxLength(7)
  moisDePaie!: string;

  /** Retenues d'avance, d'acompte et de prêt · le salarié doit être nommé. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RetenueAvanceDto)
  retenuesAvances?: RetenueAvanceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElementPaieDto)
  elements!: ElementPaieDto[];

  /**
   * LA MONNAIE DANS LAQUELLE LA RÉMUNÉRATION EST STIPULÉE. Francs congolais
   * par défaut (Code du travail, art. 89). « USD » : chaque élément porte son
   * `montantUsd`, converti au cours du dollar SAISI AU DOSSIER POUR LE JOUR
   * DU CALCUL · règle du cabinet, faute de texte (conversion-usd.ts).
   */
  @IsOptional()
  @IsEnum(['CDF', 'USD'])
  deviseStipulation?: 'CDF' | 'USD';

  /**
   * Article 123 · le nombre de personnes à charge RETENU par le cabinet.
   * Le registre en PROPOSE un, il ne le substitue pas : l'article 124 borne
   * la qualité de personne à charge par des ressources propres qu'aucun livre
   * du dossier ne porte.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  personnesACharge?: number;

  /**
   * Article 71 · les AUTRES versements déductibles du brut. La quote-part
   * ouvrière de la CNSS est calculée par la simulation et s'y ajoute d'office ·
   * la saisir ici la déduirait deux fois (audit final F109).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  retenuesArticle71Fc?: number;

  /**
   * Article 69, 1 · le « taux légal » des allocations familiales du mois.
   * NORMALEMENT INUTILE DEPUIS P5 · la simulation le calcule à partir de la
   * colonne 19 du décret n° 25/22 et du nombre d'enfants bénéficiaires.
   * Ce champ reste ouvert pour le mois de paie qu'aucune annexe ne couvre ;
   * fourni, il prime, et l'absence des deux vaut abstention.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxLegalAllocationsFamilialesFc?: number;

  /**
   * Article 69, 1 · le nombre d'ENFANTS BÉNÉFICIAIRES des allocations
   * familiales du mois. Il ne se déduit ni du registre ni des personnes à
   * charge de l'article 124 : l'article 8 de l'arrêté ministériel n° 137/2018
   * interrompt le droit enfant par enfant (fin d'études, vingt-cinq ans,
   * mariage, décès, résidence hors du territoire), et un enfant à charge au
   * sens fiscal n'est donc pas forcément un enfant bénéficiaire.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  enfantsBeneficiairesAllocations?: number;

  /**
   * Article 69, 1 · les jours du mois qui ouvrent droit aux allocations
   * familiales, mention 28 de l'arrêté n° 12/CAB.MIN/ETPS/042 du 8 août 2008
   * (jours payés à 100 %, de congé payé et payés aux deux tiers, mentions 6,
   * 14 et 17). Absent, le plafond est mensualisé à 26 jours (décret n° 25/22,
   * art. 7) et la réserve le dit (passe D2). Ce ne sont pas les `joursPayes`
   * du plancher CNSS, qui ne comptent que les jours payés.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  joursAllocationsFamiliales?: number;

  /** Nature de l'employeur au sens de l'arrêté INPP · PUBLIC ou PRIVE. */
  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVE'])
  natureEmployeurInpp?: string;

  /**
   * Article 121, alinéa 2 · le régime de la retenue. Le personnel domestique
   * et les salariés de micro-entreprises relèvent d'un forfait LIBÉRATOIRE
   * (arrêté n° 019/CAB/MIN/FINANCES/2025, lu, `FORFAITS_ARRETE_019_2025`) que
   * OmegaX ne chiffre pas en francs, faute du cours de conversion · la retenue
   * s'abstient. Non déclaré, le droit commun est retenu ET dit (audit final
   * F105) · il ne se déduit ni d'un montant ni d'une forme juridique.
   */
  @IsOptional()
  @IsEnum(['BAREME_ARTICLE_118', 'FORFAIT_PERSONNEL_DOMESTIQUE', 'FORFAIT_SALARIE_DE_MICRO_ENTREPRISE'])
  regimeSalarial?: RegimeSalarial;

  /**
   * Jours payés d'un mois INCOMPLET, en jours ouvrables, le mois entier en
   * comptant 26 (décret n° 25/22, art. 7). Sert au seul plancher de la CNSS
   * (décret n° 18/041, art. 8) · absent, le mois est entier (audit final F112).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(26)
  joursPayes?: number;

  /** Effectif · il commande la tranche INPP du secteur PRIVÉ seulement. */
  @IsOptional()
  @IsInt()
  @Min(0)
  effectif?: number;

  /**
   * La majoration des risques professionnels NOTIFIÉE par la Caisse, en pour
   * cent du taux · 50 (arrêté n° 140/2018, art. 22) ou 100 en récidive
   * (art. 24, al. 3), le double étant le plafond (décret n° 18/041, art. 5).
   * Décision de la Caisse, jamais présumée.
   */
  @IsOptional()
  @IsIn([50, 100])
  majorationRisquesProfessionnelsPourCent?: 50 | 100;

  /**
   * Article 114 · la CLASSE de la tension salariale, 1 à 17. Elle place le
   * seuil des « cinq fois le salaire mensuel minimum interprofessionnel de sa
   * catégorie ». Absente, la quotité saisissable n'est pas chiffrée.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(17)
  classeProfessionnelle?: number;

  /**
   * Article 114, alinéa 4 · un logement est-il FOURNI EN NATURE ? Ce n'est PAS
   * l'indemnité de logement, qui est hors rémunération par l'article 7 litera
   * h. Répondu oui, OmegaX déduit l'évaluation forfaitaire de l'article 10 de
   * l'arrêté n° 12/CAB.MIN/TPS/110/2005.
   */
  @IsOptional()
  @IsBoolean()
  logementFourniEnNature?: boolean;

  /**
   * Article 10 de l'arrêté de 2005 · « IL PEUT défalquer ». Si l'employeur a
   * déjà opéré la défalcation sur la paie, la rémunération transmise est DÉJÀ
   * nette et OmegaX ne déduit pas une seconde fois.
   */
  @IsOptional()
  @IsBoolean()
  logementEnNatureDejaDefalque?: boolean;

  /** Article 114, alinéa 2 · la créance poursuit-elle une obligation alimentaire légale ? */
  @IsOptional()
  @IsBoolean()
  obligationAlimentaireLegale?: boolean;
}

/**
 * Les paramètres qui commandent les COTISATIONS, et qui ne se devinent pas ·
 * le taux INPP dépend d'abord de la nature de l'employeur, puis, pour le privé
 * seulement, de sa tranche d'effectif ; et la majoration des risques
 * professionnels est une décision de la Caisse.
 */
export class ParametresCotisationsDto {
  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVE'])
  natureEmployeurInpp?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  effectif?: number;

  @IsOptional()
  @IsIn([50, 100])
  majorationRisquesProfessionnelsPourCent?: 50 | 100;
}

/**
 * LE DÉCOMPTE FINAL · rien n'est stocké. Les montants saisis sont ceux
 * qu'aucun livre du dossier ne porte, et OmegaX ne les présume pas. Les faits
 * de la rupture (type de contrat, essai, exécution du préavis, force majeure
 * constatée) se DÉCLARENT · la durée et le sens de l'indemnité en dépendent
 * (Code du travail, art. 63, 64, 69 à 71).
 */
export class DecompteFinalDto {
  @IsInt()
  @Min(0)
  @Max(99)
  anneesAnciennete!: number;

  /** Mois entiers de service NON couverts par un congé pris ou payé (art. 141 et 144). */
  @IsInt()
  @Min(0)
  @Max(1200)
  moisNonCouvertsParUnConge!: number;

  @IsOptional()
  @IsBoolean()
  moinsDeDixHuitAns?: boolean;

  @IsEnum(['EMPLOYEUR', 'TRAVAILLEUR'])
  initiative!: string;

  @IsEnum([
    'LICENCIEMENT',
    'DEMISSION',
    'FAUTE_LOURDE',
    'FORCE_MAJEURE',
    'TERME_DU_CDD',
    'COMMUN_ACCORD',
  ])
  motif!: string;

  /** L'article 64 ne régit que le contrat à durée indéterminée (art. 69). */
  @IsEnum(['DUREE_INDETERMINEE', 'DUREE_DETERMINEE'])
  typeContrat!: string;

  @IsOptional()
  @IsBoolean()
  periodeDEssai?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(400)
  joursDEssaiEcoules?: number;

  /** Délégué titulaire ou suppléant, ou candidat non élu dans les six mois (art. 258). */
  @IsOptional()
  @IsBoolean()
  delegueSyndical?: boolean;

  @IsOptional()
  @IsDateString()
  dateNotification?: string;

  /** Durée du préavis de l'employeur retenue par le dossier, en jours ouvrables. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  preavisRetenuJours?: number;

  @IsOptional()
  @IsBoolean()
  forceMajeureConstateeParInspecteur?: boolean;

  @IsOptional()
  @IsBoolean()
  deuxMoisDeSuspension?: boolean;

  @IsOptional()
  @IsEnum(['PRESTE', 'NON_OBSERVE', 'DISPENSE_PAR_EMPLOYEUR', 'DISPENSE_A_LA_DEMANDE_DU_TRAVAILLEUR'])
  executionPreavis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  joursPreavisNonObserves?: number;

  @IsOptional()
  @IsEnum(['EMPLOYEUR', 'TRAVAILLEUR'])
  partieResponsable?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remunerationJournaliereFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moyenneMensuelleArticle66Fc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moyenneMensuelleArticle142Fc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avantagesPendantPreavisFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  joursRestantsJusquAuTerme?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avantagesJusquAuTermeFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantConvenuCommunAccordFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  arrieresFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gratificationFc?: number;

  /** Mois de la cessation, AAAA-MM · il choisit la grille de la colonne 19. */
  @IsOptional()
  @IsString()
  @MaxLength(7)
  moisDeCessation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PLAFOND_ENFANTS_PAR_FICHE)
  enfantsBeneficiairesAllocations?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  joursAllocationsFamiliales?: number;
}

/**
 * LE LIVRE DE PAIE · ce qui se DÉCLARE, et rien de nominatif. La route ne
 * reçoit aucun nom de salarié : elle juge un DOCUMENT et une organisation,
 * pas une paie.
 */
export class LivreDePaieDto {
  /** Article 213 · un livre par siège d'exploitation. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siegeDExploitation?: string;

  /**
   * La forme adoptée. L'article 1er de l'arrêté du 8 août 2008 admet d'office
   * le livre papier ET le fichier informatisé ; tout autre document tombe
   * sous l'autorisation de l'article 215, alinéa 2. Absente, OmegaX retient
   * le cas le plus exigeant.
   */
  @IsOptional()
  @IsEnum(['LIVRE_PAPIER', 'FICHIER_INFORMATISE', 'AUTRE_DOCUMENT'])
  formeDuDocument?: string;

  /** Article 215, alinéa 2 · l'autorisation de l'Inspecteur du Travail. */
  @IsOptional()
  @IsBoolean()
  autorisationInspecteurDuTravail?: boolean;

  /** Article 215, alinéa 3 · l'effectif habituel de l'établissement. */
  @IsOptional()
  @IsInt()
  @Min(0)
  effectifHabituel?: number;

  /** Article 213 · l'employeur occupe-t-il exclusivement du personnel domestique ? */
  @IsOptional()
  @IsBoolean()
  exclusivementPersonnelDomestique?: boolean;

  /**
   * Les rangs (1 à 33) des énonciations de l'art. 1er de l'arrêté
   * n° 12/CAB.MIN/ETPS/042 du 8 août 2008 que le document porte · c'est la
   * liste que le service confronte (`MENTIONS_MODELE_2008`), jamais celle de
   * l'art. 25 de l'arrêté n° 146/2018, dont le rang 4 ne dit pas la même
   * chose (passe D2).
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(33, { each: true })
  mentionsPortees?: number[];
}

/** P8 · annuler un bulletin émis · le motif est la seule trace de la correction. */
export class AnnulationBulletinDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motif!: string;
}

/** P8 · déclarer la remise du décompte écrit au travailleur (art. 103). */
export class RemiseBulletinDto {
  @IsDateString()
  remisLe!: string;
}

/**
 * P9 · passer la paie du mois. Le client ne choisit que ce qui appartient au
 * cabinet · l'exercice, le journal, la date et le libellé. Aucun montant.
 */
export class ComptabilisationPaieDto {
  @IsString()
  exerciceId!: string;

  @IsString()
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;
}

export class RubriquePaieDto {
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) libelle!: string;
  @IsString() nature!: string;
  @IsString() @MinLength(1) @MaxLength(300) fondement!: string;
}

/** Le code et la nature ne changent pas · voir PersonnelService.modifierRubrique. */
export class ModifierRubriquePaieDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) libelle?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) fondement?: string;
  @IsOptional() @IsBoolean() actif?: boolean;
}

export class AvanceSalaireDto {
  @IsEnum(['AVANCE', 'ACOMPTE', 'PRET', 'SAISIE_ARRET'])
  type!: 'AVANCE' | 'ACOMPTE' | 'PRET' | 'SAISIE_ARRET';

  @IsOptional()
  @IsEnum(['IMMOBILIER', 'MOBILIER_ET_INSTALLATION', 'AUTRE'])
  categoriePret?: 'IMMOBILIER' | 'MOBILIER_ET_INSTALLATION' | 'AUTRE';

  @IsDateString()
  dateOctroi!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montantFc!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  retenueMensuelleFc?: number;

  @IsString() @MinLength(1) @MaxLength(200) objet!: string;
  @IsString() @MinLength(1) @MaxLength(200) pieceJustificative!: string;

  // Saisie-arrêt seulement (passe O4-C2) · exigés et refusés ailleurs par
  // `motifRefusSaisieArret`, le service disant pourquoi en français.
  @IsOptional() @IsString() @MaxLength(200) referenceActe?: string;
  @IsOptional() @IsString() @MaxLength(200) greffe?: string;
  @IsOptional() @IsString() @MaxLength(200) destinataire?: string;
}

/** La mainlevée d'une saisie-arrêt (AUPSRVE, art. 201) · déclarée une fois. */
export class FinSaisieArretDto {
  @IsDateString()
  dateFin!: string;
}

/** Les valeurs se vérifient par barème dans baremes-dossier.ts (lireValeurs). */
export class VersionBaremePaieDto {
  // Le refus du barème est celui du service, en français (audit final F227) ·
  // la validation du corps passe avant lui et rendait le message anglais de
  // class-validator.
  @IsEnum(BAREMES_SERVIS, { message: MOTIF_BAREME_NON_SAISISSABLE }) bareme!: 'CNSS' | 'INPP' | 'ONEM' | 'SMIG';
  @IsDateString() aPartirDu!: string;
  @IsString() @MinLength(8) @MaxLength(400) reference!: string;
  @IsObject() valeurs!: Record<string, unknown>;
}

/** Un élément d'un bulletin modèle · personnel/modeles-bulletin.ts. */
export class LigneModeleBulletinDto {
  @IsString()
  @MaxLength(60)
  nature!: string;

  @IsString()
  @MaxLength(160)
  libelle!: string;

  @IsOptional()
  @IsUUID('4')
  rubriqueId?: string | null;

  @IsOptional()
  @IsNumber()
  montant?: number | null;
}

export class ModeleBulletinDto {
  @IsString()
  @MaxLength(80)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categorie?: string;

  /** La monnaie dans laquelle les montants du modèle sont stipulés. */
  @IsEnum(['CDF', 'USD'])
  deviseStipulation!: 'CDF' | 'USD';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneModeleBulletinDto)
  lignes!: LigneModeleBulletinDto[];
}
