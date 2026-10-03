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
 * donnée n'entre dans le calcul · ni l'âge, ni un pourcentage.
 */
export function annonceRevue(enPlace: number, necessaire: number | null): string | null {
  if (necessaire == null || !Number.isFinite(necessaire)) return null;
  const ecart = Math.round((necessaire - enPlace) * 100) / 100;
  if (ecart > 0) return `Dotation de ${ecart.toFixed(2)} · D 6594 / C 491, au dernier jour de l'exercice.`;
  if (ecart < 0) return `Reprise de ${(-ecart).toFixed(2)} · D 491 / C 7594, au dernier jour de l'exercice.`;
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

export const LIBELLE_NATURE: Record<NatureCreance, string> = {
  LITIGIEUSE: 'Litigieuse (le client conteste)',
  DOUTEUSE: 'Douteuse (le client se dérobe)',
};
