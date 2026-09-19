import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnfantAChargeDto)
  enfants?: EnfantAChargeDto[];
}

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

  @IsNumber()
  @Min(0)
  montantFc!: number;

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
}

export class SimulationPaieDto {
  /** Mois de paie au format AAAA-MM · il borne le barème et le SMIG. */
  @IsString()
  @MaxLength(7)
  moisDePaie!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElementPaieDto)
  elements!: ElementPaieDto[];

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
   * Article 71 · les versements déductibles du brut, quote-part ouvrière de
   * la CNSS en tête. Ils sont SAISIS · les taux vivent au registre des
   * retenues avec leur date d'effet, et ce module ne les recopie pas.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  retenuesArticle71Fc?: number;

  /**
   * Article 69, 1 · le « taux légal » des allocations familiales du mois.
   * Absent, la simulation s'abstient plutôt que de choisir entre les deux
   * montants que le corpus porte.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxLegalAllocationsFamilialesFc?: number;

  /** Nature de l'employeur au sens de l'arrêté INPP · PUBLIC ou PRIVE. */
  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVE'])
  natureEmployeurInpp?: string;

  /** Effectif · il commande la tranche INPP du secteur PRIVÉ seulement. */
  @IsOptional()
  @IsInt()
  @Min(0)
  effectif?: number;

  /** Article 5 du décret n° 18/041 · décision de la Caisse, jamais présumée. */
  @IsOptional()
  @IsBoolean()
  majorationRisquesProfessionnels?: boolean;
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
  @IsBoolean()
  majorationRisquesProfessionnels?: boolean;
}

/**
 * LE DÉCOMPTE FINAL · rien n'est stocké. Les quatre montants saisis sont ceux
 * qu'aucun livre du dossier ne porte, et OmegaX ne les présume pas.
 */
export class DecompteFinalDto {
  @IsInt()
  @Min(0)
  @Max(99)
  anneesAnciennete!: number;

  @IsInt()
  @Min(0)
  @Max(1200)
  moisEntiersDeService!: number;

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

  @IsOptional()
  @IsBoolean()
  delegueSyndical?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remunerationJournaliereFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  arrieresFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moyenneDouzeMoisFc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gratificationFc?: number;
}
