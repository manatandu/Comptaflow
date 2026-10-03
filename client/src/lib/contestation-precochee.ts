import type { VersionProvisionOuverture } from './types';

/**
 * La case « contestée » d'une version retouchée ne se précoche que si le
 * montant figé à la contestation est ÉGAL à la provision du module du jour
 * (ligne A5, dixième relecture). Sinon un simple « Modifier » refigeait la
 * contestation au montant du jour sans geste exprès · le cabinet la recoche
 * en connaissance de cause, les deux montants affichés.
 */
export function contestationPrecochee(
  version: Pick<VersionProvisionOuverture, 'provisionModuleContestee' | 'provisionModuleContesteeMontant'> | undefined,
  provisionModuleDuJour: number,
): boolean {
  if (!version?.provisionModuleContestee) return false;
  const fige = version.provisionModuleContesteeMontant;
  return fige !== null && fige !== undefined && Math.abs(fige - provisionModuleDuJour) < 0.005;
}

/** Contestée à un montant que le module ne porte plus · les deux montants sont à dire. */
export function contestationPerimee(
  version: Pick<VersionProvisionOuverture, 'provisionModuleContestee' | 'provisionModuleContesteeMontant'> | undefined,
  provisionModuleDuJour: number,
): boolean {
  return !!version?.provisionModuleContestee && !contestationPrecochee(version, provisionModuleDuJour);
}
