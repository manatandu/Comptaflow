import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PeriodiciteAbonnement, TypeRegularisation } from '@prisma/client';

export class CreerRegularisationDto {
  @IsUUID()
  exerciceId!: string;

  @IsEnum(TypeRegularisation)
  type!: TypeRegularisation;

  @IsString()
  libelle!: string;

  @IsUUID()
  compteChargeProduitId!: string;

  /** Compte 476 ou 477 · à défaut, le service prend celui du plan SYCEBNL. */
  @IsOptional()
  @IsUUID()
  compteDifferId?: string;

  @IsNumber()
  @Min(0)
  montantTotal!: number;

  @IsDateString()
  periodeDebut!: string;

  @IsDateString()
  periodeFin!: string;

  /** Journal d'accueil des écritures · à défaut le journal général (OD). */
  @IsOptional()
  @IsUUID()
  journalId?: string;

  /**
   * Part différée imposée à la main. Sans elle, le service la calcule au
   * prorata des jours qui débordent l'exercice.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  montantDiffere?: number;
}

export class CreerAbonnementDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  compteDebitId!: string;

  @IsUUID()
  compteCreditId!: string;

  @IsEnum(PeriodiciteAbonnement)
  periodicite!: PeriodiciteAbonnement;

  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  @IsNumber()
  @Min(0)
  montant!: number;
}

export class ModifierAbonnementDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class GenererAbonnementDto {
  @IsUUID()
  exerciceId!: string;

  /** Génère les échéances dues jusqu'à cette date incluse. */
  @IsDateString()
  jusquA!: string;
}
