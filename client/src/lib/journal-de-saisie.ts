import type { Ecriture } from './types';

/**
 * LE JOURNAL CHARGÉ DANS LA SAISIE (audit final F61). Le serveur plafonne une
 * fenêtre à deux mille pièces · lues dans l'ordre chronologique, la saisie
 * en perdait la FIN, c'est-à-dire la pièce qu'on vient d'enregistrer, et ses
 * totaux additionnaient la seule tranche rendue. Les pièces sont donc
 * demandées les plus récentes d'abord, remises dans l'ordre de lecture, les
 * totaux sont ceux que le serveur prend sur le périmètre entier, et une
 * tranche se DIT.
 */

export interface ReponseJournal {
  ecritures: Ecriture[];
  totaux: { debit: number; credit: number };
  total: number;
  tronque: boolean;
}

export function urlJournalDeSaisie(p: { exerciceId: string; journalId: string; debut: string; fin: string }): string {
  return `/ecritures?exerciceId=${p.exerciceId}&journalId=${p.journalId}&dateDebut=${p.debut}&dateFin=${p.fin}&plusRecentes=1`;
}

export function lireJournalDeSaisie(r: ReponseJournal) {
  return {
    // Les plus récentes arrivent en tête · la grille se lit dans l'ordre.
    ecritures: [...r.ecritures].reverse(),
    totaux: { debit: Number(r.totaux.debit), credit: Number(r.totaux.credit) },
    troncature: r.tronque ? { montrees: r.ecritures.length, total: r.total } : null,
  };
}
