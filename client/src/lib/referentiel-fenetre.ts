import type { Referentiel } from './types';

/**
 * DIVISION SYCEBNL / SYSCOHADA · isolé dans un fichier `.ts` pur (pas de
 * JSX), séparé de `registre-fenetres.tsx` qui importe toutes les pages ·
 * un fichier de test qui a seulement besoin de cette fonction ne doit pas
 * entraîner 30 imports de composants React avec lui. Voir
 * `docs/plan-de-construction.md` §8.
 *
 * Absent = fenêtre commune aux deux référentiels (comptabilité générale,
 * immobilisations, trésorerie…). Présent = fenêtre propre à un référentiel,
 * invisible pour l'autre. `referentiel` absent (dossier pas encore chargé) :
 * rien de propre à un référentiel ne s'affiche tant qu'on ne le connaît
 * pas · plus sûr que de montrer, puis retirer, une fenêtre au chargement.
 */
export function fenetreDisponible(
  def: { referentielsApplicables?: Referentiel[] },
  referentiel: Referentiel | undefined,
): boolean {
  if (!def.referentielsApplicables) return true;
  if (!referentiel) return false;
  return def.referentielsApplicables.includes(referentiel);
}
