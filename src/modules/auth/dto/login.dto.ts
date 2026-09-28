import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
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

  /**
   * « Rester connecté sur cet appareil » (audit final F270) · décochée par
   * défaut, et absente vaut décochée. Renvoyée avec le code du second
   * facteur, comme le mot de passe · aucun état n'est gardé entre les deux
   * appels. Le serveur la refuse à la console de l'éditeur (AuthService.login).
   */
  @IsOptional()
  @IsBoolean()
  resterConnecte?: boolean;
}
