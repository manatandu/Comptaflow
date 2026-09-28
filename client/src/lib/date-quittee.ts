/**
 * CE QU'UNE CASE DE DATE DES PARAMÈTRES ENVOIE QUAND ON LA QUITTE · audit
 * final F237.
 *
 * Convention du serveur (`ModifierRegimeDto`, `dateSaisieOuEffacement`) :
 * chaîne vide = effacement, date `AAAA-MM-JJ` = la date. La case vidée envoie
 * donc la chaîne vide, et c'est le seul geste qui retire une date erronée.
 *
 * UNE SAISIE INCOMPLÈTE NE PART PAS. Le navigateur rend alors une valeur vide
 * (`validity.badInput`), qui se lirait comme un effacement et retirerait la
 * date enregistrée pendant qu'on la corrige.
 *
 * Une date inchangée ne part pas non plus · le serveur la reçoit en ISO
 * complet (`2026-03-01T00:00:00.000Z`), la case n'en montre que le jour.
 */
export type DateQuittee = { etat: 'INCHANGEE' } | { etat: 'INCOMPLETE' } | { etat: 'A_ENVOYER'; valeur: string };

export function dateQuittee(saisie: string, incomplete: boolean, enregistree: string | null): DateQuittee {
  if (incomplete) return { etat: 'INCOMPLETE' };
  const actuelle = enregistree ? enregistree.slice(0, 10) : '';
  return saisie === actuelle ? { etat: 'INCHANGEE' } : { etat: 'A_ENVOYER', valeur: saisie };
}
