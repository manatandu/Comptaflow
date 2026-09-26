import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  motDePasse!: string;

  /** Le second facteur · code de l'application ou code de secours. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;
}
