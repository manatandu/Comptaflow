/**
 * L'EXERCICE OÙ LES ÉCARTS SE CONTRE-PASSENT · celui qui suit IMMÉDIATEMENT
 * la réévaluation (« à l'ouverture de l'exercice suivant »), et lui seul
 * (relecture adverse d'A5 bis, M1). La liste servait tout exercice ouvert
 * commençant après la réévaluation · une contre-passation posée deux
 * exercices plus loin laissait l'écart de conversion vivre pendant tout
 * l'exercice intermédiaire, que sa réévaluation repassait depuis le coût
 * historique. Le serveur le refuse aussi (`DevisesService.extourner`), et le
 * sert lui-même (`exerciceDeContrePassation` de la liste des réévaluations).
 *
 * `null` · aucun exercice ne suit encore ; un exercice suivant CLÔTURÉ est
 * rendu tel quel, l'écran le dit au lieu d'en proposer un autre.
 */
export function exerciceDeContrePassation<E extends { dateDebut: string; statut: string }>(exercices: E[], dateReevaluation: string): E | null {
  const date = new Date(dateReevaluation).getTime();
  const suivants = exercices
    .filter((e) => new Date(e.dateDebut).getTime() > date)
    .sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime());
  return suivants[0] ?? null;
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
