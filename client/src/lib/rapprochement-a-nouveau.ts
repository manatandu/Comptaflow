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

/**
 * LES LIGNES FONDUES DANS LE SOLDE DE DÉPART SE DISENT AUSSI (2026-09-28).
 * Le premier rapprochement part d'un solde lu sur le relevé à une date · ce
 * qui précède cette date est dans ce solde, ou déclaré en en-cours, et le
 * serveur ne le propose plus. Même parti que les à-nouveaux · le nombre,
 * jamais la somme.
 */
export function mentionFonduesDansLeDepart(nombre: number | undefined): string | null {
  if (!(nombre !== undefined && nombre > 0)) return null;
  return nombre === 1
    ? '1 ligne antérieure à la date de départ, comprise dans le solde de départ.'
    : `${nombre.toLocaleString('fr-FR')} lignes antérieures à la date de départ, comprises dans le solde de départ.`;
}

/**
 * LA CLÔTURE DU PREMIER RAPPROCHEMENT SUIT LE SERVEUR · un solde de départ
 * déclaré et un écart d'ouverture NUL, sans quoi le bouton se désactive avec
 * le motif que le serveur opposerait. Une ouverture non lue (null) n'est
 * jamais prise pour un écart nul.
 */
export function motifOuvertureBloquante(detail: {
  premier?: boolean;
  ouverture?: { soldeDepart: number | null; ecart: number | null; motif: string | null } | null;
}): string | null {
  if (!detail.premier || !detail.ouverture) return null;
  const o = detail.ouverture;
  if (o.soldeDepart === null) return 'Déclarez le solde de départ lu sur le relevé.';
  if (o.ecart === null) return o.motif ?? "L'écart d'ouverture ne se calcule pas.";
  if (Math.abs(o.ecart) >= 0.005) return "L'écart d'ouverture n'est pas nul.";
  return null;
}
