/**
 * TRI DES CODES DE NOTES ANNEXES · isolé dans un fichier `.ts` pur (pas de
 * JSX), séparé de `components/NotesAnnexesRendu.tsx` qui importe React et
 * les types du client, pour la même raison que `referentiel-fenetre.ts` :
 * un test qui n'a besoin que de cette fonction ne doit pas entraîner tout
 * un arbre de composants avec lui (le lanceur Jest de la racine ramasse
 * `client/src` et ne transforme pas le `.tsx`).
 *
 * Le tri sert les DEUX référentiels · il ne connaît aucun code, aucune note
 * et aucun texte officiel : seulement la forme « numéro puis suffixe » que
 * les deux numérotations partagent.
 */

/**
 * Ordre croissant des codes de note : « 1 » < « 3A » < « 3F » < « 15B » <
 * « 16B » < « 16B bis » < « 16C » < « 36 ». Le texte officiel numérote ses
 * notes dans cet ordre, mais rien côté serveur ne le garantit · il rend les
 * notes dans l'ordre de déclaration de sa table, qui est libre.
 *
 * LE SUFFIXE ADMET DES ESPACES, et ce n'est pas de la coquetterie : la
 * liste de l'AUDCIF Titre IX ch. 6 section 2 contient le code « 16B bis ».
 * Avec un suffixe restreint aux lettres, ce code n'était reconnu par aucune
 * des deux branches et se retrouvait rejeté en fin de liste, après la
 * note 36 · un défaut qui ne casse rien, ne lève aucune erreur, et ne se
 * voit qu'en relisant la fiche récapitulative imprimée.
 *
 * Les codes SYCEBNL (« 5A », « 17B », « 29B ») n'ont pas d'espace : ce tri
 * leur rend exactement l'ordre qu'ils avaient.
 */
export function compareCodesNotes(a: string, b: string): number {
  const decouper = (s: string) => {
    const m = /^(\d+)\s*([A-Za-z ]*)$/.exec(s);
    return m ? { num: Number(m[1]), suffixe: m[2].trim() } : { num: Number.MAX_SAFE_INTEGER, suffixe: s };
  };
  const pa = decouper(a);
  const pb = decouper(b);
  return pa.num !== pb.num ? pa.num - pb.num : pa.suffixe.localeCompare(pb.suffixe);
}
