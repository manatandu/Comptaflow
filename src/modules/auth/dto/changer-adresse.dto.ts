import { IsEmail, MinLength } from 'class-validator';

/**
 * Changement de sa PROPRE adresse de connexion · exige le mot de passe
 * actuel, pour la même raison que le changement de mot de passe : un poste
 * laissé ouvert ne doit pas permettre de détourner le compte.
 */
export class ChangerAdresseDto {
  @MinLength(1, { message: 'Le mot de passe actuel est requis' })
  motDePasseActuel!: string;

  @IsEmail({}, { message: "L'adresse n'est pas une adresse électronique valide" })
  nouvelleAdresse!: string;
}
