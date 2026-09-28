import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { StatutOrdreVirement } from '@prisma/client';

export class AnnulerOrdreDto {
  @IsString() @MinLength(1) @MaxLength(200) motif!: string;
}

/**
 * Le filtre de la liste des ordres (audit final F207, le reste). Sans état,
 * tous les ordres du dossier. Un état hors de l'énumération est un 400 · le
 * `ValidationPipe` global refuse aussi toute clé que ce DTO ne déclare pas
 * (`forbidNonWhitelisted`), si bien qu'un paramètre mal nommé n'est jamais
 * ignoré en rendant la liste entière sous un filtre qu'on croit posé.
 */
export class ListerOrdresDto {
  @IsOptional()
  @IsEnum(StatutOrdreVirement)
  statut?: StatutOrdreVirement;
}
