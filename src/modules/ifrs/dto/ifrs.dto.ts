import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { ActivitePrincipaleIfrs, ComposanteCpIfrs, TypeMouvementCpIfrs } from '@prisma/client';

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
