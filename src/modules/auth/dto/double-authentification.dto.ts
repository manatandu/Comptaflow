import { IsString, MaxLength, MinLength } from 'class-validator';

/** Un code de l'application (six chiffres) ou un code de secours (dix caractères). */
export class CodeDoubleAuthDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class DesactiverDoubleAuthDto extends CodeDoubleAuthDto {
  @IsString()
  motDePasseActuel!: string;
}
