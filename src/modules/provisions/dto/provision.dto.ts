import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { NatureProvision, StatutProvision } from '@prisma/client';

export class CreerProvisionDto {
  /** « Une brève description de la nature de l'obligation » · ch. 18 § 5.3. */
  @IsString()
  @MaxLength(500)
  objet!: string;

  @IsEnum(NatureProvision)
  nature!: NatureProvision;

  /** Le 19x, 499 ou 599 qui la porte. Absent tant qu'elle n'est pas comptabilisée. */
  @IsOptional()
  @IsUUID()
  compteId?: string;

  @IsOptional()
  @IsEnum(StatutProvision)
  statut?: StatutProvision;

  @IsOptional()
  @IsBoolean()
  obligationExiste?: boolean;

  @IsOptional()
  @IsBoolean()
  resulteEvenementPasse?: boolean;

  @IsOptional()
  @IsBoolean()
  sortieProbable?: boolean;

  @IsOptional()
  @IsBoolean()
  estimationFiable?: boolean;

  /** La source de l'obligation, en clair. Sans elle, les quatre cases ne sont qu'un formulaire. */
  @IsString()
  @MaxLength(20000)
  justificationObligation!: string;

  @IsOptional()
  @IsDateString()
  echeanceAttendue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  incertitudes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantOuverture?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dotationsExercice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantsUtilises?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reprisesNonUtilisees?: number;

  /** § 3.2 · l'effet de l'écoulement du temps est une charge FINANCIÈRE, pas une dotation. */
  @IsOptional()
  @IsNumber()
  effetActualisation?: number;

  @IsOptional()
  @IsNumber()
  remboursementAttendu?: number;

  @IsOptional()
  @IsBoolean()
  remboursementCertain?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remboursementTiers?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  motifNonComptabilisation?: string;
}

export class ModifierProvisionDto {
  @IsOptional() @IsString() @MaxLength(500) objet?: string;
  @IsOptional() @IsEnum(NatureProvision) nature?: NatureProvision;
  @IsOptional() @IsUUID() compteId?: string;
  @IsOptional() @IsEnum(StatutProvision) statut?: StatutProvision;
  @IsOptional() @IsBoolean() obligationExiste?: boolean;
  @IsOptional() @IsBoolean() resulteEvenementPasse?: boolean;
  @IsOptional() @IsBoolean() sortieProbable?: boolean;
  @IsOptional() @IsBoolean() estimationFiable?: boolean;
  @IsOptional() @IsString() @MaxLength(20000) justificationObligation?: string;
  @IsOptional() @IsDateString() echeanceAttendue?: string;
  @IsOptional() @IsString() @MaxLength(20000) incertitudes?: string;
  @IsOptional() @IsNumber() @Min(0) montantOuverture?: number;
  @IsOptional() @IsNumber() @Min(0) dotationsExercice?: number;
  @IsOptional() @IsNumber() @Min(0) montantsUtilises?: number;
  @IsOptional() @IsNumber() @Min(0) reprisesNonUtilisees?: number;
  @IsOptional() @IsNumber() effetActualisation?: number;
  @IsOptional() @IsNumber() remboursementAttendu?: number;
  @IsOptional() @IsBoolean() remboursementCertain?: boolean;
  @IsOptional() @IsString() @MaxLength(300) remboursementTiers?: string;
  @IsOptional() @IsString() @MaxLength(20000) motifNonComptabilisation?: string;
}

export class StatuerProvisionDto {
  @IsEnum(StatutProvision)
  statut!: StatutProvision;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  motifNonComptabilisation?: string;
}

export class ReporterProvisionsDto {
  @IsUUID()
  exerciceSourceId!: string;

  @IsUUID()
  exerciceCibleId!: string;
}
