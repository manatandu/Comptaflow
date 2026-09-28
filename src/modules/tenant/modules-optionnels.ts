import { ModuleOptionnel } from '@prisma/client';

/**
 * MODULES ACTIVABLES PAR DOSSIER (décision de Manasse du 2026-09-28). Le
 * logiciel porte l'équivalent de cinq ou six produits Sage ; une petite
 * association voyait la consolidation, les états IFRS et la circularisation
 * dès sa première connexion. Ces cinq modules n'ont d'objet que pour une
 * partie des dossiers · ils se montrent quand le dossier les active.
 *
 * TROIS RÈGLES À NE PAS DÉFAIRE.
 *  1. MASQUER N'EST PAS REFUSER · comme le masquage par profil
 *     (`client/src/lib/profil-dossier.ts`), la route reste ouverte et les
 *     données restent. Désactiver un module ne supprime rien, le réactiver le
 *     rend tel quel. C'est une préférence d'affichage, pas une règle
 *     comptable, et aucun texte ne la fonde.
 *  2. RIEN DE CE QU'UN TEXTE IMPOSE À TOUS N'EST ICI · facturation (O.-L.
 *     n° 10/001, art. 56), inventaire physique (AUDCIF art. 42), provisions,
 *     documents obligatoires, registre des donateurs restent toujours au menu.
 *  3. LES DOSSIERS EXISTANTS GARDENT TOUT · la migration du 2026-09-28 les
 *     active tous, un dossier en cours ne perd pas un menu qu'il utilise. Seul
 *     un dossier NOUVEAU part sans eux, et les dossiers de démonstration les
 *     ont tous.
 */
export const MODULES_OPTIONNELS: readonly ModuleOptionnel[] = [
  ModuleOptionnel.PAIE,
  ModuleOptionnel.REVISION,
  ModuleOptionnel.GESTION_COMMERCIALE,
  ModuleOptionnel.CONSOLIDATION,
  ModuleOptionnel.IFRS,
];

/** Liste normalisée · ordre du catalogue, sans doublon. */
export function normaliserModules(modules: readonly ModuleOptionnel[]): ModuleOptionnel[] {
  return MODULES_OPTIONNELS.filter((m) => modules.includes(m));
}
