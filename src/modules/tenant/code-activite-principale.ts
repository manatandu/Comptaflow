import { Referentiel } from '@prisma/client';
import { GROUPES_ACTIVITES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-notes-syscohada-3';

/**
 * CODE ACTIVITÉ PRINCIPALE (passe R3) · AUDCIF Titre IX ch. 6, NOTE 36,
 * « codes activités économiques », nomenclature à SIX chiffres, groupe sur
 * trois et poste sur trois ; la fiche R1 (ch. 2) le déclare, et la Fiche 1
 * de la liasse (gabarit ETAFI) le porte en ZI.
 *
 * TROIS DÉCISIONS, chacune tenue par la source.
 *  · SYSCOHADA SEUL · la NOTE 36 est une note du SYSCOHADA. Le servir à une
 *    association lui imprimerait un code d'une nomenclature que son
 *    référentiel ne lui demande pas.
 *  · LE FORMAT EST UN REFUS, LE GROUPE UN AVERTISSEMENT · le texte fixe six
 *    chiffres et énumère 44 groupes, mais aucun texte lu ne donne la liste
 *    des POSTES (le Titre IX n'en cite que des exemples), et le Titre XI
 *    porte une autre codification (AFRISTAT, alphanumérique). Refuser un
 *    groupe hors liste serait trancher ce que la source laisse ouvert.
 *  · SAISI, JAMAIS DÉDUIT · ni de `Tenant.activite`, ni de la balance.
 */

export const MOTIF_CODE_ACTIVITE_SYCEBNL =
  "Le code activité principale est celui de la NOTE 36 du SYSCOHADA (AUDCIF Titre IX ch. 6) · un dossier SYCEBNL n'en porte pas.";

export const MOTIF_CODE_ACTIVITE_FORMAT =
  "Le code activité principale s'écrit sur six chiffres, groupe puis poste (AUDCIF Titre IX ch. 6, NOTE 36) · par exemple 031003.";

/** Six chiffres, les espaces de lecture (« 031 003 ») retirés. `null` efface. */
export function normaliserCodeActivite(valeur: string | null | undefined): string | null | undefined {
  if (valeur === undefined) return undefined;
  if (valeur === null) return null;
  const compact = valeur.replace(/\s+/g, '');
  return compact === '' ? null : compact;
}

/** Refus nommé, ou `null`. Un effacement (`null`) est toujours permis. */
export function motifRefusCodeActivite(referentiel: Referentiel, code: string | null | undefined): string | null {
  if (code === undefined || code === null) return null;
  if (referentiel !== Referentiel.SYSCOHADA) return MOTIF_CODE_ACTIVITE_SYCEBNL;
  if (!/^\d{6}$/.test(code)) return MOTIF_CODE_ACTIVITE_FORMAT;
  return null;
}

/**
 * Avertissement quand le GROUPE (trois premiers chiffres) n'est pas l'un des
 * 44 de la NOTE 36 · rendu, jamais opposé.
 */
export function avertissementCodeActivite(code: string | null | undefined): string | null {
  if (!code || !/^\d{6}$/.test(code)) return null;
  const groupe = code.slice(0, 3);
  if (GROUPES_ACTIVITES_SYSCOHADA.some((g) => g.code === groupe)) return null;
  return (
    `Le groupe ${groupe} n'est pas l'un des 44 groupes de la NOTE 36 (001 à 044). ` +
    "Le code est enregistré tel quel · vérifiez-le avant qu'il ne s'imprime sur la Fiche 1 de la liasse."
  );
}
