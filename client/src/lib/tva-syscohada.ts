/**
 * QUEL COMPTE DE TVA POUR QUELLE CONTREPARTIE · le plan SYSCOHADA subdivise,
 * le plan SYCEBNL non.
 *
 * Le semis rattache un seul compte de collecte et un seul compte de déduction
 * à chaque taux, et la modale d'achat ou de vente avec TVA les imputait tels
 * quels quelle que soit la nature de l'opération. Sur un dossier SYSCOHADA,
 * une prestation vendue collectait donc en 4431 « TVA facturée sur VENTES » au
 * lieu du 4432 « sur prestations de services », et un service extérieur
 * déduisait en 4452 « sur ACHATS » au lieu du 4454 « sur services extérieurs
 * et autres charges ». Rien ne cassait : la TVA était juste au bon montant,
 * dans le mauvais compte, et la ventilation de la déclaration en souffrait.
 *
 * Table lue au plan SYSCOHADA (skill `syscohada`, plan-comptes.tsv) :
 *
 *  · 443 État, TVA facturée · 4431 sur ventes, 4432 sur prestations de
 *    services, 4433 sur travaux, 4434 sur production livrée à soi-même,
 *    4435 sur factures à établir ;
 *  · 445 État, TVA récupérable · 4451 sur immobilisations, 4452 sur achats,
 *    4453 sur transport, 4454 sur services extérieurs et autres charges,
 *    4455 sur factures non parvenues, 4456 transférée par d'autres entités.
 *
 * Et les racines de contrepartie, au même plan : 701 ventes de marchandises,
 * 702 produits finis, 703 produits intermédiaires, 704 produits résiduels,
 * 705 travaux facturés, 706 services vendus, 707 produits accessoires ;
 * 60 achats, 61 transports, 62 services extérieurs, 63 autres services
 * extérieurs.
 *
 * LE PLAN SYCEBNL NE SUBDIVISE NI 443 NI 445 · son 4431 est « État, T.V.A.
 * facturée » et son 4451 « État, T.V.A. récupérable », tous deux génériques.
 * La fonction rend donc `null` pour ce référentiel : le compte du taux semé
 * est le bon, il n'y a rien à router.
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
  // Classe 2 : l'acquisition d'immobilisation passe par le module dédié ou la
  // saisie libre · la modale d'achat ne propose que la classe 6. La ligne est
  // écrite ici parce que la table doit être complète, pas parce que ce chemin
  // l'emprunte aujourd'hui.
  if (/^2/.test(numeroCharge)) return '44510000';
  if (/^60/.test(numeroCharge)) return '44520000';
  if (/^61/.test(numeroCharge)) return '44530000';
  if (/^6[23]/.test(numeroCharge)) return '44540000';
  return null;
}

/**
 * Compte de TVA à imputer, ou `null` s'il n'y a rien à router · le compte du
 * taux semé fait alors foi.
 *
 * `null` couvre trois cas, tous légitimes : un dossier SYCEBNL, dont le plan
 * ne subdivise pas ; une contrepartie hors des racines connues (un produit
 * financier, une charge de personnel) ; et une subdivision que le dossier
 * n'aurait pas ouverte dans son plan. Dans les trois, mieux vaut le compte
 * générique du taux qu'un compte inventé.
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
