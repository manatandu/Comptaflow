/**
 * LA LISTE DES ORDRES DE VIREMENT · une tranche qui se dit (audit final F207).
 *
 * Le serveur ne rend que les ordres les plus récents, et rend à côté le total
 * de la liste et le nombre d'ordres en attente d'impression, ce dernier lu sur
 * le dossier entier. La liste s'arrêtait jusque-là à cinq cents sans le dire,
 * et un ordre ancien resté à imprimer disparaissait de l'onglet · c'est
 * justement celui que la banque n'a jamais reçu.
 *
 * LE FILTRE PAR ÉTAT (audit final F207, le reste) · la liste et son total se
 * lisent sur le même filtre, que le serveur RENVOIE (`statut`) · c'est lui, et
 * non le choix courant de l'écran, que la phrase de la tranche nomme, si bien
 * qu'une réponse ne peut pas se dire d'un autre filtre que le sien.
 *
 * La règle vit hors du composant pour se vérifier sans monter React.
 */

/** Les états de l'énumération Prisma `StatutOrdreVirement`, un test les y tient exacts. */
export type StatutOrdre = 'A_IMPRIMER' | 'IMPRIME' | 'ANNULE';

export const LIBELLE_STATUT_ORDRE: Record<StatutOrdre, string> = {
  A_IMPRIMER: "En attente d'impression",
  IMPRIME: 'Imprimé',
  ANNULE: 'Annulé',
};

export interface ListeOrdresVirement<O extends { statut: string }> {
  ordres: O[];
  /** Les ordres du filtre (du dossier entier sans filtre), la tranche n'en montrant qu'une partie quand `tronque`. */
  total: number;
  tronque: boolean;
  /** Les ordres en attente d'impression du dossier entier, pas de la seule tranche ni du seul filtre. */
  enAttenteImpression: number;
  /** Le filtre que le serveur a appliqué, `null` sans filtre. */
  statut: StatutOrdre | null;
}

/** La route de la liste · sans filtre, tous les ordres ; un état se passe tel quel, le serveur refusant l'inconnu. */
export function cheminListeOrdres(filtre: StatutOrdre | null): string {
  return filtre === null ? '/ordres-virement' : `/ordres-virement?statut=${encodeURIComponent(filtre)}`;
}

/** Le filtre que la réponse porte, dit en mots · vide sans filtre. */
function etatDuFiltre(liste: ListeOrdresVirement<{ statut: string }>): string {
  return liste.statut === null ? '' : ` à l'état « ${LIBELLE_STATUT_ORDRE[liste.statut]} »`;
}

/** La tranche, dite quand elle en est une · `null` quand la liste est entière. */
export function mentionTrancheOrdres(liste: ListeOrdresVirement<{ statut: string }>): string | null {
  return liste.tronque
    ? `Les ${liste.ordres.length} ordres les plus récents sur ${liste.total}${etatDuFiltre(liste)}.`
    : null;
}

/**
 * Une liste LUE et vide · filtrée, elle ne dit rien du dossier, seulement de
 * l'état demandé ; sans filtre, le dossier n'a aucun ordre. `null` quand la
 * liste n'est pas vide.
 */
export function mentionListeVide(liste: ListeOrdresVirement<{ statut: string }>): string | null {
  if (liste.total > 0) return null;
  return liste.statut === null
    ? 'Aucun ordre de virement. Cochez « Préparer un ordre de virement » en enregistrant des règlements fournisseurs.'
    : `Aucun ordre${etatDuFiltre(liste)}.`;
}

/**
 * Les ordres à imprimer que la tranche ne montre pas · `null` quand elle les
 * montre tous. Comptés sur la tranche REÇUE, jamais supposés absents · sous
 * un filtre qui les écarte, ils restent dits, puisqu'ils attendent toujours.
 */
export function mentionAttenteHorsListe(liste: ListeOrdresVirement<{ statut: string }>): string | null {
  const montres = liste.ordres.filter((o) => o.statut === 'A_IMPRIMER').length;
  const horsListe = liste.enAttenteImpression - montres;
  if (horsListe <= 0) return null;
  return horsListe === 1
    ? "1 ordre en attente d'impression n'est pas dans la liste affichée."
    : `${horsListe} ordres en attente d'impression ne sont pas dans la liste affichée.`;
}
