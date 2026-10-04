/**
 * LA FACTURE D'ACHAT DATÉE À SA RÉCEPTION (ligne A21) · ce que l'écran demande
 * au passage de l'écriture. La règle vit au serveur (`facturation/date-reception.ts`,
 * AUDCIF art. 16, al. 2 · « celle de la réception des pièces d'origine
 * externe ») ; l'écran ne fait que savoir QUAND la date manque, pour la
 * demander plutôt que d'essuyer un refus.
 */

export interface PiecePourReception {
  sens: 'VENTE' | 'ACHAT';
  dateReception?: string | null;
}

/**
 * Une facture reçue sans date de réception (enregistrée avant A21, ou sans la
 * date) la fait DÉCLARER au passage de l'écriture · jamais préremplie, ni de
 * la date de facture, ni d'aujourd'hui, ce qui reviendrait à la deviner.
 */
export function receptionADeclarer(p: PiecePourReception): boolean {
  return p.sens === 'ACHAT' && !p.dateReception;
}

/**
 * Le corps de `POST /facturation/:id/comptabiliser`. La date n'est envoyée
 * que lorsqu'elle est à déclarer · une date déjà portée par la facture ne se
 * redit pas (le serveur refuserait une date différente).
 */
export function corpsComptabilisation(
  p: PiecePourReception,
  journalId: string,
  compteGestionId: string,
  dateReceptionSaisie: string,
): { journalId: string; compteGestionId: string | null; dateReception?: string } {
  return {
    journalId,
    compteGestionId: compteGestionId || null,
    ...(receptionADeclarer(p) && dateReceptionSaisie ? { dateReception: dateReceptionSaisie } : {}),
  };
}

/** Le passage est possible · journal, compte, et la réception quand elle manque. */
export function passageComplet(p: PiecePourReception, journalId: string, compteGestionId: string, dateReceptionSaisie: string): boolean {
  return !!journalId && !!compteGestionId && (!receptionADeclarer(p) || !!dateReceptionSaisie);
}
