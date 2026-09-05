import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StatutMessage } from '@prisma/client';

export class ListerFileDto {
  /** Sans filtre, toute la file du dossier · l'écran de suivi les montre tous. */
  @IsOptional()
  @IsEnum(StatutMessage)
  statut?: StatutMessage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limite?: number;
}

export class ReprendreDto {
  /**
   * Taille du lot repris. Bornée · la reprise est un appel synchrone déclenché
   * par l'écran, voir REPRISE_PAR_APPEL.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
