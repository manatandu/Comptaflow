import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
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

/**
 * COMBIEN DE COMPTES PAR ÉMISSION (audit final F241).
 *
 * L'émission ne tente plus aucun envoi dans la requête · elle écrit les
 * relances et leurs lettres en file, une insertion groupée pour chacune, dans
 * une seule transaction, et la remise se fait ensuite par la reprise,
 * vingt-cinq messages par appel (`REPRISE_PAR_APPEL`). La requête reste
 * pourtant bornée : une sélection sans plafond tiendrait la transaction, et
 * le verrou du dossier, aussi longtemps que le dossier a de tiers. Cinq
 * cents, comme les autres fenêtres de travail (historique des rappels, file
 * des courriers) · au-delà, la sélection se découpe, et le refus le dit.
 */
export const PLAFOND_COMPTES_PAR_EMISSION = 500;

export class EmettreRelancesDto {
  @IsUUID()
  exerciceId!: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(PLAFOND_COMPTES_PAR_EMISSION, {
    message: `Au plus ${PLAFOND_COMPTES_PAR_EMISSION} comptes par émission · découpez la sélection.`,
  })
  // UN COMPTE NOMMÉ DEUX FOIS RECEVAIT DEUX LETTRES dans la même émission
  // (audit final F241) · le doublon est refusé à la porte, et le service ne
  // parcourt de toute façon chaque compte qu'une fois.
  @ArrayUnique({ message: 'Un même compte figure deux fois dans la sélection.' })
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
