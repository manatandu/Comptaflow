import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * Une section du manuel · AUDCIF art. 16 al. 1.
 *
 * Titre et texte LIBRES · le CPCC rappelle que « la législation OHADA ne
 * définit ni la forme ni le contenu du manuel » (§ 0.1.4). Imposer un gabarit
 * ajouterait une exigence que le texte n'écrit pas.
 */
export class SectionManuelDto {
  /** Identifiant stable de la section · sert à retrouver le classement (art. 17, 3°). */
  @IsString()
  @MaxLength(60)
  cle!: string;

  @IsString()
  @MaxLength(200)
  titre!: string;

  @IsString()
  @MaxLength(20_000)
  texte!: string;
}

export class EnregistrerManuelDto {
  /** Date à partir de laquelle cette version décrit l'organisation réelle. */
  @IsDateString()
  dateApplication!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SectionManuelDto)
  sections!: SectionManuelDto[];
}
