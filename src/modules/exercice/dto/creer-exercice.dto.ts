import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class CreerExerciceDto {
  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  /**
   * EXERCICE DE LIQUIDATION · art. 7 al. 4 de l'AUDCIF : « en cas de cessation
   * d'activité, pour quelque cause que ce soit, la durée des opérations de
   * liquidation est comptée pour un seul exercice ». C'est le seul cas où un
   * exercice échappe à l'année civile · il court de la cessation à la clôture
   * de la liquidation, sur plusieurs années s'il le faut, et ne finit pas
   * nécessairement un 31 décembre.
   *
   * Le drapeau est explicite et non par défaut : un exercice hors année civile
   * est une exception que le cabinet déclare, jamais une tolérance de saisie.
   * L'article n'est pas dans la liste d'exclusion de l'art. 3 du SYCEBNL, et
   * le glossaire SYCEBNL reprend la règle mot pour mot · le drapeau vaut donc
   * pour les deux référentiels.
   */
  @IsOptional()
  @IsBoolean()
  liquidation?: boolean;
}
