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

/**
 * ACTIVER EXIGE LE MOT DE PASSE ACTUEL, en plus du premier code. OWASP ASVS 5.0,
 * exigence 7.5.1, veut une « full re-authentication » avant de modifier la
 * configuration du second facteur ; NIST SP 800-63B-4 veut qu'un
 * authentificateur ne se lie qu'à une session authentifiée au préalable ; et
 * l'OWASP Multifactor Authentication Cheat Sheet ne se fie pas à la seule
 * session. Chez OmegaX, une session « Rester connecté » peut dater de trente
 * jours · volée, elle installerait sa propre application et fermerait la
 * porte au titulaire.
 */
export class ActiverDoubleAuthDto extends CodeDoubleAuthDto {
  @IsString()
  motDePasseActuel!: string;
}

/**
 * DE NOUVEAUX CODES DE SECOURS EXIGENT AUSSI LE MOT DE PASSE · GitHub range
 * leur régénération sous son « sudo mode ». Un code du téléphone ne suffit
 * pas · la session qui le présente peut être celle d'un autre.
 */
export class RegenererCodesSecoursDto extends CodeDoubleAuthDto {
  @IsString()
  motDePasseActuel!: string;
}
