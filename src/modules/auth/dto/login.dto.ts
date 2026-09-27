import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { CourrielNormalise } from '../../../common/courriel';

export class LoginDto {
  @CourrielNormalise()
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
