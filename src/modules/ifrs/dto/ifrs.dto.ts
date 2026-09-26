import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { ActivitePrincipaleIfrs, CategorieEffetChangeIfrs, ComposanteCpIfrs, TypeMouvementCpIfrs } from '@prisma/client';

export class ActiviteIfrsDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEnum(ActivitePrincipaleIfrs) activitePrincipale?: ActivitePrincipaleIfrs | null;
}

export class RegleIfrsDto {
  @IsString() @MaxLength(13) prefixe!: string;
  @IsString() @MaxLength(64) rubrique!: string;
}

export class LigneRetraitementIfrsDto {
  @IsString() @MaxLength(64) rubrique!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
}

export class RetraitementIfrsDto {
  @IsUUID() exerciceId!: string;
  @IsString() @MaxLength(300) libelle!: string;
  @IsString() @MaxLength(1000) fondement!: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => LigneRetraitementIfrsDto) lignes!: LigneRetraitementIfrsDto[];
  /** IFRS 1 § 11 · un ajustement daté de la transition, jamais un retraitement de l'exercice. */
  @IsOptional() @IsBoolean() aLaTransition?: boolean;
  /** IFRS 1 § 26 · une correction d'erreur du référentiel antérieur, distinguée d'un changement de méthode. */
  @IsOptional() @IsBoolean() correctionErreur?: boolean;
  /** Retraitement des comptes CONSOLIDÉS · jamais lu avec ceux des comptes individuels. */
  @IsOptional() @IsBoolean() consolide?: boolean;
  /** IFRS 10 § B94 · la part des participations ne donnant pas le contrôle de chaque effet, en valeur créditrice. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) partMinoritairesResultat?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) partMinoritairesOci?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) partMinoritairesCapitauxPropres?: number | null;
}

/** Un poste de la consolidation qui se déclare, et sa rubrique IFRS 18. */
export class RegleConsolidationIfrsDto {
  @IsString() @MaxLength(64) poste!: string;
  @IsString() @MaxLength(64) rubrique!: string;
}

export class PremiereApplicationIfrsDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() premierExerciceIfrsId?: string | null;
  @IsOptional() @IsBoolean() dejaAdoptant?: boolean;
}

export class MouvementCpIfrsDto {
  @IsUUID() exerciceId!: string;
  @IsEnum(TypeMouvementCpIfrs) type!: TypeMouvementCpIfrs;
  @IsEnum(ComposanteCpIfrs) composante!: ComposanteCpIfrs;
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
  @IsString() @MaxLength(300) libelle!: string;
  @IsString() @MaxLength(1000) justification!: string;
}

export class TresorerieIfrsDto {
  /** IAS 7 § 8 · null efface la déclaration. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() decouvertsDansTresorerie?: boolean | null;
  /** IAS 7 § 28 · null efface la déclaration. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() tresorerieEnDevises?: boolean | null;
  /** IAS 7 § 28, comptes consolidés · null efface la déclaration. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() tresorerieGroupeEnDevises?: boolean | null;
}

export class EffetChangeIfrsDto {
  @IsUUID() exerciceId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
  @IsEnum(CategorieEffetChangeIfrs) categorie!: CategorieEffetChangeIfrs;
  @IsString() @MaxLength(1000) justification!: string;
  /** L'effet de change sur la trésorerie du groupe (tableau consolidé). */
  @IsOptional() @IsBoolean() consolide?: boolean;
}

/** IFRS 18 § 113 à 132, IAS 8 · le contenu est relu par `normaliserDeclarationsNotes`, jamais pris tel quel. */
export class NotesIfrsDto {
  @IsUUID() exerciceId!: string;
  @IsObject() contenu!: Record<string, unknown>;
}
