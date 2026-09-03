import { IsDateString, IsOptional } from 'class-validator';

/**
 * DATE D'ARRÊTÉ DES COMPTES · AUDCIF art. 23, applicable aux deux référentiels
 * (l'article n'est pas dans la liste d'exclusion de l'art. 3 du SYCEBNL).
 *
 * `null` efface la date · un arrêté peut être défait, et le texte prévoit
 * expressément le cas : « si certaines informations susceptibles de remettre
 * profondément en cause les états financiers n'étaient connues qu'après
 * l'arrêté, il appartiendrait aux dirigeants de procéder à un NOUVEL ARRÊTÉ
 * des comptes modifiés, dans le délai légal des quatre mois » (Titre VIII
 * ch. 31 § 1.6).
 */
export class ArreterComptesDto {
  @IsOptional()
  @IsDateString()
  dateArreteComptes?: string | null;
}
