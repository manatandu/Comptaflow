import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CaractereEngagement, NatureRapportBailleur, StatutConvention } from '@prisma/client';

export class CreerConventionDto {
  @IsString()
  bailleurId!: string;

  /** Numéro de la convention, de l'accord-cadre ou de l'arrêté. */
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsString()
  @MinLength(1)
  objet!: string;

  /**
   * L'« écrit signé par les représentants habilités des tiers financeurs » du
   * § 5.4.2.4 · sans lui, aucun engagement ne se comptabilise en créance, si
   * ferme soit-il.
   */
  @IsOptional()
  @IsBoolean()
  ecritSigne?: boolean;

  @IsOptional()
  @IsString()
  signataire?: string;

  @IsOptional()
  @IsDateString()
  dateSignature?: string;

  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  @IsNumber()
  montantAccorde!: number;

  @IsEnum(CaractereEngagement)
  caractere!: CaractereEngagement;

  /** Obligatoire quand l'engagement est CONDITIONNEL. */
  @IsOptional()
  @IsString()
  conditions?: string;
}

export class ModifierConventionDto {
  @IsOptional() @IsString() objet?: string;
  @IsOptional() @IsBoolean() ecritSigne?: boolean;
  @IsOptional() @IsString() signataire?: string;
  @IsOptional() @IsDateString() dateSignature?: string;
  @IsOptional() @IsDateString() dateDebut?: string;
  @IsOptional() @IsDateString() dateFin?: string;
  @IsOptional() @IsNumber() montantAccorde?: number;
  @IsOptional() @IsEnum(CaractereEngagement) caractere?: CaractereEngagement;
  @IsOptional() @IsString() conditions?: string;
}

export class CloreConventionDto {
  @IsEnum(StatutConvention)
  statut!: StatutConvention;

  /** Obligatoire à la RÉSILIATION · elle fait tomber le reste à recevoir. */
  @IsOptional()
  @IsString()
  motif?: string;
}

export class CreerTrancheDto {
  @IsInt()
  @Min(1)
  numero!: number;

  @IsString()
  @MinLength(1)
  libelle!: string;

  @IsNumber()
  montant!: number;

  @IsDateString()
  datePrevue!: string;
}

export class EncaisserTrancheDto {
  @IsDateString()
  dateEncaissement!: string;

  @IsNumber()
  montantEncaisse!: number;
}

export class CreerRapportDto {
  @IsString()
  @MinLength(1)
  intitule!: string;

  @IsEnum(NatureRapportBailleur)
  nature!: NatureRapportBailleur;

  @IsDateString()
  dateEcheance!: string;

  @IsOptional()
  @IsString()
  observation?: string;
}

export class TransmettreRapportDto {
  @IsDateString()
  dateTransmission!: string;
}
