/**
 * LES BORNES D'UN MOIS CHOISI DANS L'EXERCICE, en UTC.
 *
 * L'état budgétaire restreint le réalisé à un mois (1 à 12) · le mois se situe
 * dans l'exercice, l'année suivante quand il précède le mois d'ouverture. Les
 * bornes se posaient à l'heure LOCALE du serveur (`new Date(annee, mois, …)`,
 * `getFullYear`, `getMonth`), alors qu'une écriture est datée à minuit UTC
 * (audit final F81). À l'ouest de Greenwich, l'ouverture d'un exercice au
 * 1er janvier se lisait sur l'année d'avant, et la borne du mois tombait à
 * cinq heures UTC · l'écriture du 1er janvier sortait du réalisé de janvier,
 * sur un état dont chaque ligne restait plausible.
 *
 * La fin est le dernier jour du mois à 23 h 59 min 59 s UTC · la requête la
 * lit en `lte`, et une écriture datée de ce jour à minuit UTC y entre.
 */
export function bornesDuMois(dateDebutExercice: Date, mois: number): { debut: Date; fin: Date } {
  const annee = dateDebutExercice.getUTCFullYear() + (mois < dateDebutExercice.getUTCMonth() + 1 ? 1 : 0);
  return {
    debut: new Date(Date.UTC(annee, mois - 1, 1)),
    fin: new Date(Date.UTC(annee, mois, 0, 23, 59, 59)),
  };
}
