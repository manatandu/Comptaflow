import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ModeEcartEvaluation, MotifExclusionConsolidation, NatureResultatInterne } from '@prisma/client';

export class EntitePerimetreDto {
  @IsUUID()
  exerciceId!: string;

  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional() @IsBoolean() designationMajoriteDeuxExercices?: boolean;
  @IsOptional() @IsBoolean() aucunAutreAssocieSuperieur?: boolean;
  @IsOptional() @IsBoolean() controleContractuel?: boolean;
  @IsOptional() @IsBoolean() accordControleConjoint?: boolean;
  @IsOptional() @IsBoolean() influenceNotableDeclaree?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(MotifExclusionConsolidation)
  motifExclusion?: MotifExclusionConsolidation | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  justificationExclusion?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dateCloture?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  secteurActivite?: string | null;
}

export class ModifierEntitePerimetreDto {
  @IsOptional() @IsString() @MaxLength(200) nom?: string;
  @IsOptional() @IsBoolean() designationMajoriteDeuxExercices?: boolean;
  @IsOptional() @IsBoolean() aucunAutreAssocieSuperieur?: boolean;
  @IsOptional() @IsBoolean() controleContractuel?: boolean;
  @IsOptional() @IsBoolean() accordControleConjoint?: boolean;
  @IsOptional() @IsBoolean() influenceNotableDeclaree?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(MotifExclusionConsolidation)
  motifExclusion?: MotifExclusionConsolidation | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  justificationExclusion?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dateCloture?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  secteurActivite?: string | null;
}

export class LienParticipationDto {
  @IsUUID()
  exerciceId!: string;

  /** Absent ou null · la détentrice est le dossier lui-même, c'est-à-dire la consolidante. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  detentriceId?: string | null;

  @IsUUID()
  detenueId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  pctDroitsVote!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  pctCapital!: number;
}

export class FaitsConsolidationDto {
  @IsUUID()
  exerciceId!: string;

  @IsOptional() @IsBoolean() sousControleEntiteOhadaConsolidante?: boolean;
  @IsOptional() @IsBoolean() siegesDansDeuxRegions?: boolean;
  @IsOptional() @IsBoolean() appelPublicEpargne?: boolean;
  @IsOptional() @IsBoolean() demandeAssociesDixieme?: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) chiffreAffairesN?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) chiffreAffairesN1?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) seuilEquivalentFc?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) sourceSeuil?: string | null;
}

export class ImporterBalanceEntiteDto {
  @IsString()
  @MaxLength(200)
  nomFichier!: string;

  /** Fichier CSV ou XLSX, en base64, au canevas de la balance agrégée (Numéro, Intitulé, Débit, Crédit). */
  @IsString()
  contenuBase64!: string;
}

export class AcquisitionDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) coutAcquisition!: number;
  @IsString() @MaxLength(13) compteTitres!: string;
  @IsDateString() dateEntree!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) capitauxPropresEntree!: number;
  @IsEnum(['LIMITEE', 'NON_DETERMINABLE']) modeDureeEcart!: 'LIMITEE' | 'NON_DETERMINABLE';
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(1) @Max(99) dureeEcartAnnees?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depreciationEcartOuverture?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depreciationEcartCloture?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dividendesExercice?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(13) compteDividendes?: string | null;
  @IsOptional() @IsBoolean() obligationNonDesengagement?: boolean;
}

export class ResultatInterneDto {
  @IsUUID() exerciceId!: string;
  /** Absent ou null · la consolidante. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendeuseId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() acheteuseId?: string | null;
  @IsEnum(NatureResultatInterne) nature!: NatureResultatInterne;
  @IsString() @MaxLength(13) compteActif!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) margeOuverture!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) margeCloture!: number;
  @IsString() @MaxLength(300) libelle!: string;
}

export class OperationReciproqueDto {
  @IsUUID() exerciceId!: string;
  /** Absent ou null · la consolidante. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() entiteAId?: string | null;
  @IsString() @MaxLength(13) compteA!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() entiteBId?: string | null;
  @IsString() @MaxLength(13) compteB!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) montant!: number;
  @IsString() @MaxLength(300) libelle!: string;
}

/** Tranche 4a · un écart d'évaluation, rattaché à une participation (D4C ch. XII-6 § 1). */
export class EcartEvaluationDto {
  @IsString() @MaxLength(13) compte!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(13) compteAmortissement?: string | null;
  @IsString() @MaxLength(300) libelle!: string;
  /** De combien l'élément vaut de PLUS au bilan consolidé qu'aux livres de la détenue, négatif s'il vaut moins. */
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
  @IsEnum(ModeEcartEvaluation) mode!: ModeEcartEvaluation;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(1) @Max(99) dureeAnnees?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dateRealisation?: string | null;
}

/**
 * Tranche 4a · la fiscalité d'une entité du périmètre, ou de la consolidante
 * quand `entiteId` est absent. Le taux se déclare AVEC sa source ; les impôts
 * différés individuels en montants d'impôt, null valant « pas de réponse ».
 */
export class FiscaliteEntiteDto {
  @IsUUID() exerciceId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() entiteId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) @Max(100) tauxImpotDiffere?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) sourceTauxImpot?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) idaOuverture?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) idaCloture?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) idpOuverture?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) idpCloture?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) justificationIda?: string | null;
  /** Tranche 4b · les 478 et 479 de la clôture N-1, en montants positifs. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) ecartConversionActifN1?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) ecartConversionPassifN1?: number | null;
}

/** Tranche 4b · la provision pour pertes de change d'une entité, ou de la consolidante (`entiteId` absent). */
export class ProvisionChangeDto {
  @IsUUID() exerciceId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() entiteId?: string | null;
  @IsString() @MaxLength(13) compteProvision!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cloture!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dotation!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) reprise!: number;
}

/**
 * Tranche 4c · la monnaie de la balance importée d'une entité, et ce qu'il faut
 * pour la convertir au cours de clôture (D4C ch. XII-4 § 3). Les cours sont en
 * unités de monnaie de présentation pour UNE unité de la monnaie de l'entité.
 */
export class MonnaieEntiteDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^[A-Za-z]{3}$/, { message: 'La monnaie se donne par son code ISO à trois lettres (USD, EUR, XAF...).' })
  monnaieBalance?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) justificationMonnaie?: string | null;
  @IsOptional() @IsBoolean() hyperinflation?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) coursCloture?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) coursProduitsCharges?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) coursEntree?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) capitauxPropresHistoriques?: number | null;
}
