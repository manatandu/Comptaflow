import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Correction d'une écriture par INSCRIPTION EN NÉGATIF · art. 20 de l'AUDCIF,
 * repris par la Partie 2 ch. 2 du SYCEBNL.
 *
 * Aucun montant ni aucun compte ne figure ici : ils sont repris de l'écriture
 * corrigée, à l'identique et changés de signe. Les laisser au client ferait
 * de la correction une écriture libre, alors que le texte impose l'inscription
 * en négatif « des ÉLÉMENTS ERRONÉS » · ceux-là précisément, pas d'autres.
 */
export class CorrigerEcritureDto {
  /**
   * Date de la correction, et non de l'erreur. Elle est soumise aux mêmes
   * verrous de période que toute écriture : une erreur commise dans un mois
   * déjà clôturé se corrige à une date ouverte, ce qui est exact · l'exercice,
   * lui, reste le même (le texte vise l'erreur « commise et découverte sur
   * l'exercice en cours »). Par défaut : aujourd'hui.
   */
  @IsOptional()
  @IsDateString()
  date?: string;

  /**
   * Obligatoire. Une écriture en négatif dont on ignore la raison est une
   * altération du livre-journal, pas une correction · et les documents
   * comptables se tiennent « sans blanc ni altération d'aucune sorte ».
   */
  @IsString()
  @IsNotEmpty()
  motifCorrection!: string;
}
