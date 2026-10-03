import { montant } from './montants';

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES · ce que l'écran calcule pour MONTRER,
 * jamais pour décider (ligne A7). Le serveur rejoue tout et refuse avec son
 * article ; ces fonctions ne font qu'annoncer l'écriture que le clic passera.
 */

export type NatureCreance = 'LITIGIEUSE' | 'DOUTEUSE';

export interface PieceSaisie {
  nature: string;
  reference: string;
  date: string;
}

/**
 * L'écriture de la revue annoncée AVANT le clic · seul l'écart avec la
 * dépréciation en place se passe (fiche du compte 49), et aucune autre
 * donnée n'entre dans le calcul · ni l'âge, ni un pourcentage. Le montant
 * s'écrit par `lib/montants.ts` (relecture adverse, M8).
 */
export function annonceRevue(enPlace: number, necessaire: number | null): string | null {
  if (necessaire == null || !Number.isFinite(necessaire)) return null;
  const ecart = Math.round((necessaire - enPlace) * 100) / 100;
  if (ecart > 0) return `Dotation de ${montant(ecart)} · D 6594 / C 491, au dernier jour de l'exercice.`;
  if (ecart < 0) return `Reprise de ${montant(-ecart)} · D 491 / C 7594, au dernier jour de l'exercice.`;
  return 'Dépréciation maintenue · la revue est gardée, aucune écriture.';
}

/**
 * Le 416 présélectionné pour une créance et une nature · celui que le
 * serveur propose, s'il existe au plan, sinon rien (le choix est demandé).
 */
export function compte416Initial(
  propose: Partial<Record<NatureCreance, string | null>> | undefined,
  nature: NatureCreance,
  comptes416: readonly { id: string; numero: string }[],
): string {
  const racine = propose?.[nature];
  if (racine) return comptes416.find((c) => c.numero.startsWith(racine))?.id ?? '';
  return comptes416.length === 1 ? comptes416[0].id : '';
}

/** Les pièces envoyées · une ligne sans nature ou sans référence est écartée (le serveur exige au moins une pièce). */
export function piecesAEnvoyer(pieces: readonly PieceSaisie[]) {
  return pieces
    .filter((p) => p.nature.trim() && p.reference.trim())
    .map((p) => ({ nature: p.nature.trim(), reference: p.reference.trim(), ...(p.date ? { date: p.date } : {}) }));
}

/**
 * POURQUOI LA LISTE DES 651 EST VIDE, ET QUOI FAIRE (§ 9 ter, relecture
 * adverse M8) · `null` tant qu'elle n'est pas lue, et rien à dire si elle
 * propose quelque chose.
 */
export function motifListe651Vide(comptes: readonly unknown[] | null): string | null {
  if (comptes === null || comptes.length > 0) return null;
  return (
    'Aucun compte 651 retenu au plan · retenez-le (ou ouvrez-le) dans Plan comptable, sous « Pertes sur créances », ' +
    'puis rouvrez ce formulaire.'
  );
}

/** Le motif d'annulation d'une revue, de 3 à 500 caractères (même borne que le serveur). */
export function motifAnnulationValide(motif: string): boolean {
  const m = motif.trim();
  return m.length >= 3 && m.length <= 500;
}

/**
 * LE MOUVEMENT PROPOSÉ À L'ANNULATION (K4) · le plus récent, celui qu'une
 * revue n'a le plus probablement pas encore compté ; le cabinet en choisit un
 * autre dans la modale. `null` sans mouvement.
 */
export function mouvementAAnnulerParDefaut(mouvements: readonly { id: string; date: string }[]): string | null {
  if (mouvements.length === 0) return null;
  return [...mouvements].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.id;
}

/**
 * LA PART DE TVA JAMAIS EXIGIBLE, ANNONCÉE AVANT LE CLIC (troisième relecture,
 * B-1) · elle sort d'office du 443, sans taux, au prorata de la perte ;
 * l'écran ne fait que la montrer, le serveur la calcule. `null` sans montant.
 */
export function annonceTvaNonExigible(nonExigibleCreance: number, perte: number | null, montantCreance: number): string | null {
  if (perte == null || !(montantCreance > 0) || !(nonExigibleCreance > 0)) return null;
  const part = Math.round(((nonExigibleCreance * perte) / montantCreance) * 100) / 100;
  return `TVA jamais exigible · ${montant(part)} sortent d'office du 443, sans taux, hors de toute déclaration.`;
}

export const LIBELLE_NATURE: Record<NatureCreance, string> = {
  LITIGIEUSE: 'Litigieuse (le client conteste)',
  DOUTEUSE: 'Douteuse (le client se dérobe)',
};
