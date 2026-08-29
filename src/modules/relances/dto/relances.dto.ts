import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { TypeRelance } from '@prisma/client';

export class CreerNiveauDto {
  @IsInt()
  niveau!: number;

  @IsString()
  libelle!: string;

  @IsEnum(TypeRelance)
  type!: TypeRelance;

  /** Négatif pour une relance préventive (ex. -7 : une semaine avant). */
  @IsInt()
  joursApresEcheance!: number;

  @IsString()
  modeleTexte!: string;
}

export class ModifierNiveauDto {
  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsInt()
  joursApresEcheance?: number;

  @IsOptional()
  @IsString()
  modeleTexte?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class EmettreRelancesDto {
  @IsUUID()
  exerciceId!: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  compteIds!: string[];

  @IsUUID()
  niveauId!: string;

  @IsOptional()
  @IsDateString()
  dateReference?: string;
}
