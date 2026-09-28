import type { RoleUtilisateur } from './types';

/**
 * LES DEUX RÔLES CANTONNÉS, côté écran · la règle est celle du serveur
 * (`src/common/guards/roles-cantonnes.ts`), qui refuse de toute façon. L'écran
 * la reprend pour ne pas proposer une fenêtre vouée au refus, jamais pour la
 * remplacer (CLAUDE.md § 6 · masquer ET refuser, toujours les deux).
 *
 * AIDE_COMPTABLE · tout, sauf le personnel (données nominatives), et sans les
 * gestes de validation, de correction, d'affectation ni de passation de paie.
 * GESTIONNAIRE_PAIE · le personnel et la paie, plus le cours du jour que sa
 * paie en dollars lit, rien d'autre.
 */
export const ADRESSES_PAIE = ['/personnel'] as const;

/**
 * CE QUE LA PAIE EXIGE HORS DE LA PAIE (audit final F247) · la fenêtre Devises,
 * où le gestionnaire cote le cours de l'USD du jour, sans lequel un salaire
 * stipulé en dollars ne se calcule pas. Le serveur borne la cotation à ce
 * cours-là (`motifRefusCotationGestionnairePaie`, conversion-usd.ts) et ferme
 * le reste du module · la fenêtre ne lui montre que ce geste. Liste À PART de
 * `ADRESSES_PAIE`, qui sert aussi à FERMER le personnel à l'aide-comptable ·
 * y ajouter Devises la lui aurait retirée. Une liste se nomme par sa fin.
 */
export const ADRESSES_UTILES_A_LA_PAIE = ['/devises'] as const;

/** La seule devise que la paie convertit, et le seul cours que le gestionnaire cote. */
export const DEVISE_COTEE_PAR_LA_PAIE = 'USD';

function correspond(adresse: string, liste: readonly string[]): boolean {
  return liste.some((a) => adresse === a || adresse.startsWith(`${a}?`));
}

export function fenetreOuverteAuRole(adresse: string, role: RoleUtilisateur | undefined): boolean {
  const estPaie = correspond(adresse, ADRESSES_PAIE);
  if (role === 'GESTIONNAIRE_PAIE') return estPaie || correspond(adresse, ADRESSES_UTILES_A_LA_PAIE);
  if (role === 'AIDE_COMPTABLE') return !estPaie;
  return true;
}

/**
 * La cotation bornée au cours du jour de l'USD, et rien d'autre de la fenêtre
 * Devises (ni la réévaluation, ni la liste des réévaluations passées, que le
 * serveur lui refuse) · c'est le gestionnaire de paie, et lui seul.
 */
export function cotationBorneeAuCoursDuJour(role: RoleUtilisateur | undefined): boolean {
  return role === 'GESTIONNAIRE_PAIE';
}

/**
 * Le jour de Kinshasa (UTC+1, sans heure d'été), AAAA-MM-JJ · la date que le
 * serveur exige du gestionnaire (`jourDeKinshasa`, common/echeance.ts). Une
 * horloge de poste fausse se voit au refus du serveur, qui nomme le bon jour.
 */
export function jourDeKinshasaIso(maintenant: Date): string {
  return new Date(maintenant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Valider, corriger, affecter, passer la paie au journal · ni l'aide ni le gestionnaire de paie. */
export function peutValiderPourRole(role: RoleUtilisateur | undefined): boolean {
  return role === 'ADMIN_CABINET' || role === 'COMPTABLE';
}

/** Saisir · l'aide-comptable et le gestionnaire de paie saisissent, chacun dans son périmètre. */
export function peutEcrirePourRole(role: RoleUtilisateur | undefined): boolean {
  return peutValiderPourRole(role) || role === 'AIDE_COMPTABLE' || role === 'GESTIONNAIRE_PAIE';
}
