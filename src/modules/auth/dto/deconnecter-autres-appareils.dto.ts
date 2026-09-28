import { MinLength } from 'class-validator';

/**
 * « Déconnecter mes autres appareils » (audit final F270) · exige le mot de
 * passe actuel, comme tout acte qui touche aux accès · une session longue
 * laissée sur un poste ne doit pas suffire à fermer celles du titulaire.
 */
export class DeconnecterAutresAppareilsDto {
  @MinLength(1, { message: 'Le mot de passe actuel est requis' })
  motDePasseActuel!: string;
}
