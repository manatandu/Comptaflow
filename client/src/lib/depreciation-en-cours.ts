/**
 * LE COMPTE 29 QUI PORTE LA DÉPRÉCIATION EN PLACE (ligne A22) · le serveur
 * n'admet plus qu'un compte 29 par bien tant qu'une dépréciation est en place
 * (`src/modules/immobilisations/depreciation-en-cours.ts`), y compris le
 * 29x9 d'un bien en cours une fois achevé, faute de texte qui la vire. L'écran
 * présélectionne ce compte, sans recalculer la règle · le refus reste au
 * serveur. Null quand rien n'est en place, quand un mouvement ne dit pas son
 * compte, ou quand deux comptes portent un reste (historique réparti, le
 * cabinet choisit).
 */
export function compte29EnPlace(
  depreciations: readonly { sens: 'DOTATION' | 'REPRISE'; montant: number; compteDepreciationId?: string | null }[],
): string | null {
  const cumuls = new Map<string, number>();
  for (const d of depreciations) {
    if (!d.compteDepreciationId) return null;
    const signe = d.sens === 'DOTATION' ? 1 : -1;
    cumuls.set(d.compteDepreciationId, Math.round(((cumuls.get(d.compteDepreciationId) ?? 0) + signe * d.montant) * 100) / 100);
  }
  const porteurs = [...cumuls.entries()].filter(([, c]) => Math.abs(c) > 0.005);
  return porteurs.length === 1 ? porteurs[0][0] : null;
}
