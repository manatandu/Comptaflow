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

/**
 * Sortir un tiers du circuit de relance, ou l'y remettre · Sage, Rappels et
 * relevés : « exclure du circuit ». Le motif n'est pas exigé ICI mais dans le
 * service : il ne l'est que pour EXCLURE, et une remise dans le circuit n'a
 * rien à justifier.
 */
export class HorsRelanceDto {
  @IsBoolean()
  horsRelance!: boolean;

  @IsOptional()
  @IsString()
  motif?: string;
}
