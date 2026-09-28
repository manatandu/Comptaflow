/**
 * LES REPORTS À-NOUVEAU ÉCARTÉS DU POINTAGE SE DISENT (audit final F205).
 *
 * Le serveur ne propose plus un report à-nouveau au pointage · il recopie un
 * solde, ce n'est pas une opération de la banque, et le pointer comptait
 * l'ouverture deux fois (`estANouveauEcarte`, `rapprochement.service.ts`).
 * Écartée sans un mot, la ligne disparaissait de la fenêtre, et le comptable
 * qui la cherchait concluait à une ligne perdue, ou à un compte vide quand
 * elle était la seule. Le serveur les compte par la base ; l'écran le dit.
 *
 * Aucun montant n'est affiché · la somme de reports de plusieurs exercices
 * compterait la première ouverture autant de fois qu'un report la recopie.
 *
 * La règle vit hors du composant pour se vérifier sans monter React.
 */
export function mentionANouveauxEcartes(nombre: number): string | null {
  // Zéro est une réponse lue · il n'y a rien à dire, pas une absence à signaler.
  if (!(nombre > 0)) return null;
  return nombre === 1
    ? '1 report à-nouveau écarté du pointage.'
    : `${nombre.toLocaleString('fr-FR')} reports à-nouveau écartés du pointage.`;
}
