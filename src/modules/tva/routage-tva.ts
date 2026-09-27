/**
 * QUEL COMPTE DE TVA POUR QUELLE CONTREPARTIE, ET LA LIGNE AU TAUX ZÉRO ·
 * version SERVEUR de `client/src/lib/tva-syscohada.ts` et de `estTauxZero`
 * (`client/src/lib/tva-saisie.ts`). Audit final F116.
 *
 * POURQUOI DEUX FICHIERS · le client et le serveur sont deux paquets, et
 * aucun des deux n'importe l'autre à la construction. La facture passée au
 * journal réécrivait la règle AUTREMENT · elle prenait le compte générique du
 * taux (une prestation vendue collectait au 4431 au lieu du 4432) et ne
 * posait aucune ligne au taux zéro, si bien qu'une exportation facturée ne
 * comptait plus au numérateur du prorata (O.-L. n° 10/001, art. 43).
 * `routage-tva-parite.spec.ts` exécute les DEUX versions sur tous les comptes
 * des classes 2, 6 et 7 des deux semis et exige les mêmes réponses · c'est ce
 * qui en fait une seule règle.
 *
 * Table lue au plan SYSCOHADA (voir le fichier client) · 443 et 445 y sont
 * subdivisés ; le plan SYCEBNL ne les subdivise pas, et le compte du taux fait
 * alors foi.
 */

/** Racine du compte de TVA collectée, d'après la contrepartie de produit. */
export function compteTvaCollectee(numeroProduit: string): string | null {
  if (/^70[1234]/.test(numeroProduit) || /^707/.test(numeroProduit)) return '44310000';
  if (/^706/.test(numeroProduit)) return '44320000';
  if (/^705/.test(numeroProduit)) return '44330000';
  return null;
}

/** Racine du compte de TVA récupérable, d'après la contrepartie de charge. */
export function compteTvaRecuperable(numeroCharge: string): string | null {
  if (/^2/.test(numeroCharge)) return '44510000';
  if (/^60/.test(numeroCharge)) return '44520000';
  if (/^61/.test(numeroCharge)) return '44530000';
  if (/^6[23]/.test(numeroCharge)) return '44540000';
  return null;
}

/**
 * Compte de TVA à imputer, ou `null` s'il n'y a rien à router · le compte du
 * taux fait alors foi (dossier SYCEBNL, contrepartie hors des racines, ou
 * subdivision que le dossier n'a pas ouverte).
 */
export function compteTvaPourContrepartie(
  referentiel: string | undefined,
  sens: 'recette' | 'depense',
  numeroContrepartie: string,
  numerosDuPlan: ReadonlySet<string>,
): string | null {
  if (referentiel !== 'SYSCOHADA') return null;
  const vise = sens === 'recette' ? compteTvaCollectee(numeroContrepartie) : compteTvaRecuperable(numeroContrepartie);
  if (!vise || !numerosDuPlan.has(vise)) return null;
  return vise;
}

/**
 * Un TAUX nul qualifie l'opération (exportation, art. 24) et sa ligne doit
 * exister ; une TAXE nulle faute de base ne qualifie rien. Même seuil que la
 * saisie.
 */
export function estTauxZero(taux: number | string): boolean {
  return Number(taux) <= 0.000001;
}
