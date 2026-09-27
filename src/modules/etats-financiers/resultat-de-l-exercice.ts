/**
 * LE RÉSULTAT DE L'EXERCICE, LU UNE FOIS POUR TOUT LE LOGICIEL.
 *
 * Jusqu'au 2026-09-27, cinq modules le lisaient chacun à sa façon : tout le
 * 13 (états SYCEBNL, Système minimal SYSCOHADA, consolidation), 131 à 139
 * (états SYSCOHADA), 131 et 139 seulement (résultat fiscal). Sur une même
 * balance, l'impôt et le bilan pouvaient donc partir de deux résultats
 * différents, sans qu'aucun total ne cesse de boucler (audit du serveur, I5).
 *
 * LA RÈGLE · 131 À 139, ET JAMAIS LE 130.
 *
 *  · AUDCIF Titre VII, COMPTE 13 : le compte est crédité de la classe 7 et
 *    débité de la classe 6 « à la clôture de l'exercice […] pour solde ».
 *    Titre VIII ch. 19 § 2.4 : il « peut être obtenu par virement successif
 *    des charges et des produits afférents aux soldes intermédiaires », et
 *    « chacun des soldes visés est obtenu par virement du solde
 *    intermédiaire précédent (solde du compte 132 Marge commerciale viré au
 *    compte 133 Valeur ajoutée, par exemple) ». Chaque virement est une
 *    écriture équilibrée À L'INTÉRIEUR du 13 · la somme 131 + 132 + … + 139
 *    vaut donc le résultat, que la cascade soit achevée ou non. Lire le 131
 *    et le 139 seuls rendrait zéro sur une cascade arrêtée au 137.
 *  · Même fiche : « À la réouverture des comptes de l'exercice suivant, les
 *    entités ont la possibilité d'utiliser un compte spécial "Résultat en
 *    instance d'affectation" (130) ». Le 130 porte le résultat de
 *    l'exercice PRÉCÉDENT · le compter ici présenterait le résultat N-1
 *    comme résultat N, et ferait payer l'impôt deux fois sur le même
 *    bénéfice. Au 31 décembre il doit être soldé (« en fin d'exercice, le
 *    résultat de l'exercice précédent non affecté […] est viré au compte de
 *    report à nouveau ») · un résidu est une erreur d'inventaire, signalée
 *    comme compte sans poste, jamais fondue dans le résultat.
 *
 * Le plan SYCEBNL n'ouvre que 131 et 139 sous son 13 · la règle y rend
 * exactement ce que « tout le 13 » rendait, et elle vaut des deux côtés.
 */
export const COMPTES_RESULTAT_DE_L_EXERCICE = ['131', '132', '133', '134', '135', '136', '137', '138', '139'] as const;

/** Le compte porte-t-il le résultat de l'exercice en cours (131 à 139) ? */
export function estCompteDuResultatDeLExercice(numero: string): boolean {
  return COMPTES_RESULTAT_DE_L_EXERCICE.some((p) => numero.startsWith(p));
}

/** Le 130 · résultat de l'exercice PRÉCÉDENT, en instance d'affectation. */
export function estResultatEnInstanceDAffectation(numero: string): boolean {
  return numero.startsWith('130');
}
