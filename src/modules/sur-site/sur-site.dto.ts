import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CopieExterneDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dossier?: string | null;

  /** La phrase qui chiffre la copie externe (audit final F44) · jamais rangée ni rendue, seule sa clé dérivée l'est. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  phrase?: string | null;
}

export class DeposerLicenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20_000)
  contenu!: string;
}
