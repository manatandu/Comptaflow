/**
 * LES EXERCICES OÙ LES ÉCARTS SE CONTRE-PASSENT · ouverts et commençant APRÈS
 * la réévaluation (« à l'ouverture de l'exercice suivant »). La liste servait
 * tout exercice ouvert autre que le courant, antérieur compris · même défaut
 * que celui corrigé aux régularisations (audit final F79), le serveur le
 * refuse aussi (`DevisesService.extourner`).
 */
export function exercicesDeContrePassation<E extends { dateDebut: string; statut: string }>(exercices: E[], dateReevaluation: string): E[] {
  const date = new Date(dateReevaluation).getTime();
  return exercices.filter((e) => e.statut === 'OUVERT' && new Date(e.dateDebut).getTime() > date);
}

