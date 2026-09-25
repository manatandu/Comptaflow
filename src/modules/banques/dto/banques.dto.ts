import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Chaîne vide = effacement, comme les coordonnées du dossier. */
export class BanqueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  intitule!: string;

  @IsOptional() @IsString() @MaxLength(200) adresse?: string;
  @IsOptional() @IsString() @MaxLength(20) codePostal?: string;
  @IsOptional() @IsString() @MaxLength(100) ville?: string;
  @IsOptional() @IsString() @MaxLength(100) pays?: string;
  @IsOptional() @IsString() @MaxLength(50) telephone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail({}, { message: 'Courriel de la banque invalide.' }) email?: string;
  @IsOptional() @IsString() @MaxLength(100) contact?: string;
}

export class ModifierBanqueDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) intitule?: string;
  @IsOptional() @IsString() @MaxLength(200) adresse?: string;
  @IsOptional() @IsString() @MaxLength(20) codePostal?: string;
  @IsOptional() @IsString() @MaxLength(100) ville?: string;
  @IsOptional() @IsString() @MaxLength(100) pays?: string;
  @IsOptional() @IsString() @MaxLength(50) telephone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail({}, { message: 'Courriel de la banque invalide.' }) email?: string;
  @IsOptional() @IsString() @MaxLength(100) contact?: string;
}

export class RibDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(17) abrege?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @Matches(/^[A-Za-z]{3}$/, { message: 'Devise : code ISO à trois lettres.' }) devise?: string;
  @IsOptional() @IsString() @MaxLength(11) codeBic?: string;
  @IsOptional() @IsString() @MaxLength(20) codeBanque?: string;
  @IsOptional() @IsString() @MaxLength(20) codeGuichet?: string;
  @IsOptional() @IsString() @MaxLength(34) numeroCompte?: string;
  @IsOptional() @IsString() @MaxLength(4) cle?: string;
  @IsOptional() @IsString() @MaxLength(42) iban?: string;
  @IsOptional() @IsString() @MaxLength(200) commentaire?: string;
  /** Chaîne vide = détacher le RIB de son journal. */
  @IsOptional() @IsString() journalId?: string;
}

export class LibelleDto {
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) intitule!: string;
}

export class ModifierLibelleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) intitule?: string;
}
