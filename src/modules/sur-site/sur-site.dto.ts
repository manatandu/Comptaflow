import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CopieExterneDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dossier?: string | null;
}

export class DeposerLicenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20_000)
  contenu!: string;
}
