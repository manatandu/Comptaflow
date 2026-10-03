/**
 * L'EXERCICE OÙ LES ÉCARTS SE CONTRE-PASSENT · celui qui suit IMMÉDIATEMENT
 * la réévaluation s'il est OUVERT, sinon le premier exercice ouvert dont
 * tous les intermédiaires sont clôturés (relecture adverse d'A5 bis, M1 et
 * second tour, B-II), et lui seul. La liste servait tout exercice ouvert
 * commençant après la réévaluation · une contre-passation posée plus loin
 * laissait l'écart de conversion vivre pendant un exercice ouvert, que sa
 * réévaluation repassait depuis le coût historique ; refuser un exercice
 * suivant clôturé, à l'inverse, enfermait la contre-passation oubliée. Le
 * serveur tient la même règle (`DevisesService.cibleDeContrePassation`) et
 * sert la cible lui-même (`exerciceDeContrePassation` de la liste).
 *
 * `null` · aucun exercice ouvert après la réévaluation.
 */
export function exerciceDeContrePassation<E extends { dateDebut: string; statut: string }>(exercices: E[], dateReevaluation: string): E | null {
  const date = new Date(dateReevaluation).getTime();
  const suivants = exercices
    .filter((e) => new Date(e.dateDebut).getTime() > date)
    .sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime());
  // Le premier ouvert · ceux qui le précèdent dans la liste sont clôturés (un
  // exercice est ouvert ou clôturé, rien d'autre).
  return suivants.find((e) => e.statut === 'OUVERT') ?? null;
}

/**
 * LE GESTE QUE L'ÉCRAN OFFRE pour une réévaluation, d'après ce que le serveur
 * sert (`contrePassationAPasser`) · aucun « Contre-passer » sur une
 * réévaluation des seules disponibilités (AUDCIF art. 57, leur écart est
 * réalisé), sauf quand l'exercice suivant, réévalué sous l'ancien régime,
 * impose la contre-passation intégrale (B2) ; la contre-passation intégrale
 * à demander quand l'écriture ne se partage pas (M2).
 */
export function libelleContrePassation(
  aPasser: 'ECARTS_DE_CONVERSION' | 'INTEGRALE_ANCIEN_REGIME' | 'INTEGRALE_SUR_DEMANDE' | null | undefined,
): string | null {
  switch (aPasser) {
    case 'ECARTS_DE_CONVERSION':
      return 'Contre-passer les écarts de conversion';
    case 'INTEGRALE_ANCIEN_REGIME':
      return 'Contre-passer, banque et caisse comprises';
    case 'INTEGRALE_SUR_DEMANDE':
      return 'Contre-passation intégrale';
    default:
      return null;
  }
}
