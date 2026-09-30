import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class CreerExerciceDto {
  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  /**
   * EXERCICE DE LIQUIDATION · art. 7 al. 4 de l'AUDCIF : « En cas de cessation
   * d'activité, pour quelque cause que ce soit, la durée des opérations de
   * liquidation est comptée pour un seul exercice, sous réserve de
   * l'établissement de situations annuelles provisoires. » C'est le seul cas
   * où un exercice échappe à l'année civile · il court de la cessation à la
   * clôture de la liquidation et ne finit pas nécessairement un 31 décembre.
   * Il peut couvrir plusieurs années, mais À LA CONDITION que chacune ait sa
   * situation annuelle provisoire · la citation tronquée omettait la réserve
   * qui porte l'exception (passe O1a, D2). Pour une société commerciale, dans
   * les cas de l'AUSCGIE art. 223, le liquidateur établit en outre, dans les
   * trois mois de la clôture de chaque exercice, les états financiers annuels
   * et un rapport écrit (art. 232), puis l'assemblée statue dans les six mois,
   * ou le rapport est déposé au RCCM (art. 233). Le drapeau n'étant pas
   * conservé sur l'exercice, aucune échéance n'en est calculée · c'est dit à
   * l'écran de création.
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
