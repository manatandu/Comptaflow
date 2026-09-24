import type { RoleUtilisateur } from './types';

/**
 * LES DEUX RÔLES CANTONNÉS, côté écran · la règle est celle du serveur
 * (`src/common/guards/roles-cantonnes.ts`), qui refuse de toute façon. L'écran
 * la reprend pour ne pas proposer une fenêtre vouée au refus, jamais pour la
 * remplacer (CLAUDE.md § 6 · masquer ET refuser, toujours les deux).
 *
 * AIDE_COMPTABLE · tout, sauf le personnel (données nominatives), et sans les
 * gestes de validation, de correction, d'affectation ni de passation de paie.
 * GESTIONNAIRE_PAIE · le personnel et la paie, rien d'autre.
 */
export const ADRESSES_PAIE = ['/personnel'] as const;

export function fenetreOuverteAuRole(adresse: string, role: RoleUtilisateur | undefined): boolean {
  const estPaie = ADRESSES_PAIE.some((a) => adresse === a || adresse.startsWith(`${a}?`));
  if (role === 'GESTIONNAIRE_PAIE') return estPaie;
  if (role === 'AIDE_COMPTABLE') return !estPaie;
  return true;
}

/** Valider, corriger, affecter, passer la paie au journal · ni l'aide ni le gestionnaire de paie. */
export function peutValiderPourRole(role: RoleUtilisateur | undefined): boolean {
  return role === 'ADMIN_CABINET' || role === 'COMPTABLE';
}

/** Saisir · l'aide-comptable et le gestionnaire de paie saisissent, chacun dans son périmètre. */
export function peutEcrirePourRole(role: RoleUtilisateur | undefined): boolean {
  return peutValiderPourRole(role) || role === 'AIDE_COMPTABLE' || role === 'GESTIONNAIRE_PAIE';
}
