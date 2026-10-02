import { identifiantsUtilises } from '../../common/suppression/references';

/**
 * LES COMPTES PROPOSÉS · décision de Manasse du 2026-09-28 (CLAUDE.md,
 * « Comptes retenus »). Une LISTE DE CHOIX ne propose que les comptes que le
 * cabinet a RETENUS et ceux déjà UTILISÉS ; les états, les imports et les
 * écritures automatiques lisent tout le plan, et rien n'est jamais refusé au
 * motif qu'un compte n'est pas retenu.
 *
 * UN SEUL CALCUL · `identifiantsUtilises` (relations lues dans le schéma) et
 * `Compte.estRetenu`, appelés ici et nulle part ailleurs. Chaque route qui sert
 * une liste de comptes passe par `comptesProposes`, sans quoi une route
 * nouvelle filtrerait à sa façon (ou pas du tout) et la règle divergerait
 * d'une fenêtre à l'autre sans que rien ne le dise.
 */

/**
 * Le lien d'un compte individuel vers son collectif n'est pas un USAGE du
 * collectif · un collectif ne se saisit pas à la place de ses tiers, il ne
 * reste donc pas proposé pour ce seul motif.
 */
const LIENS_QUI_NE_RETIENNENT_PAS = ['Compte.collectifId'];

/** Parmi `ids`, les comptes auxquels quoi que ce soit se réfère. */
export function comptesUtilises(prisma: unknown, tenantId: string, ids: string[]): Promise<Set<string>> {
  return identifiantsUtilises(prisma, 'Compte', ids, tenantId, LIENS_QUI_NE_RETIENNENT_PAS);
}

/** LA RÈGLE elle-même · retenu par le cabinet, ou utilisé quelque part. */
export function estPropose(c: { id: string; estRetenu: boolean }, utilises: Set<string>): boolean {
  return c.estRetenu || utilises.has(c.id);
}

/**
 * Les comptes d'une liste de choix · retenus ou utilisés, dans l'ordre reçu.
 * `ecartes` compte ceux que la règle retire, pour que l'écran dise qu'une
 * liste vide l'est faute de compte RETENU (« retenez-le dans Plan
 * comptable ») et non faute de compte au plan.
 */
export async function comptesProposes<C extends { id: string; estRetenu: boolean }>(
  prisma: unknown,
  tenantId: string,
  comptes: C[],
): Promise<{ proposes: C[]; ecartes: number }> {
  const aVerifier = comptes.filter((c) => !c.estRetenu).map((c) => c.id);
  const utilises = await comptesUtilises(prisma, tenantId, aVerifier);
  const proposes = comptes.filter((c) => estPropose(c, utilises));
  return { proposes, ecartes: comptes.length - proposes.length };
}

/*
  La liste des routes qui servent une liste de choix vit dans
  `listes-de-comptes.ts`, un module SANS IMPORT · le spec de l'écran
  (`client/src/lib/comptes-retenus-ecrans.spec.ts`) l'importe tel quel, et
  il ne peut pas charger Prisma.
*/
export {
  LISTES_DE_COMPTES,
  PARAMETRE_RETENUS,
  ROUTES_QUI_NE_SONT_PAS_DES_LISTES,
  type RegimeListeDeComptes,
} from './listes-de-comptes';
