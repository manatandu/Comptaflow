/**
 * A8 · CE QUI MANQUE POUR ÉMETTRE LE DÉCOMPTE FINAL, dit avant le clic.
 *
 * Le décompte émis se rapporte à UN salarié (celui choisi dans le registre) et
 * remplace le bulletin du MOIS DE CESSATION · sans l'un ou l'autre, le bouton
 * reste grisé, et l'écran dit pourquoi plutôt que de se taire (§ 9 ter).
 * Les refus de fond (contrat non terminé, solde partiel, bulletin actif du
 * mois) restent au serveur, qui les nomme.
 */
export type NatureBulletin = 'MOIS' | 'DECOMPTE_FINAL';

/** Le nom du double du livre de paie · le décompte se dit comme tel, partout. */
export function natureDuBulletin(nature: NatureBulletin | undefined): string {
  return nature === 'DECOMPTE_FINAL' ? 'Décompte final' : 'Bulletin de paie';
}

export function motifDecompteNonEmissible(salarieId: string | null | undefined, moisDeCessation: string): string | null {
  if (!salarieId) return 'Choisissez d’abord le salarié dans le registre.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(moisDeCessation.trim())) return 'Renseignez le mois de cessation (AAAA-MM).';
  return null;
}
