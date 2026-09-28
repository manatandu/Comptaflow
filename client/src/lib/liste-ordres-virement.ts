/**
 * LA LISTE DES ORDRES DE VIREMENT · une tranche qui se dit (audit final F207).
 *
 * Le serveur ne rend que les ordres les plus récents, et rend à côté le total
 * du dossier et le nombre d'ordres en attente d'impression, lus sur le dossier
 * entier. La liste s'arrêtait jusque-là à cinq cents sans le dire, et un ordre
 * ancien resté à imprimer disparaissait de l'onglet · c'est justement celui
 * que la banque n'a jamais reçu.
 *
 * La règle vit hors du composant pour se vérifier sans monter React.
 */
export interface ListeOrdresVirement<O extends { statut: string }> {
  ordres: O[];
  /** Tous les ordres du dossier, la tranche n'en montrant qu'une partie quand `tronque`. */
  total: number;
  tronque: boolean;
  /** Les ordres en attente d'impression du dossier entier, pas de la seule tranche. */
  enAttenteImpression: number;
}

/** La tranche, dite quand elle en est une · `null` quand la liste est entière. */
export function mentionTrancheOrdres(liste: ListeOrdresVirement<{ statut: string }>): string | null {
  return liste.tronque ? `Les ${liste.ordres.length} ordres les plus récents sur ${liste.total}.` : null;
}

/**
 * Les ordres à imprimer que la tranche ne montre pas · `null` quand elle les
 * montre tous. Comptés sur la tranche REÇUE, jamais supposés absents.
 */
export function mentionAttenteHorsListe(liste: ListeOrdresVirement<{ statut: string }>): string | null {
  const montres = liste.ordres.filter((o) => o.statut === 'A_IMPRIMER').length;
  const horsListe = liste.enAttenteImpression - montres;
  if (horsListe <= 0) return null;
  return horsListe === 1
    ? "1 ordre en attente d'impression n'est pas dans la liste affichée."
    : `${horsListe} ordres en attente d'impression ne sont pas dans la liste affichée.`;
}
