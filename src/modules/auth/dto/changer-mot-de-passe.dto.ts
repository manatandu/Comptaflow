import { MinLength } from 'class-validator';

/**
 * Changement de son PROPRE mot de passe · exige l'actuel : un poste laissé
 * ouvert ne doit pas permettre de verrouiller le titulaire hors de son
 * compte en le remplaçant à son insu.
 */
export class ChangerMotDePasseDto {
  @MinLength(1, { message: 'Le mot de passe actuel est requis' })
  motDePasseActuel!: string;

  @MinLength(10, { message: 'Le nouveau mot de passe doit contenir au moins 10 caractères' })
  nouveauMotDePasse!: string;
}
