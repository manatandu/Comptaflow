import { TypeJournal } from '@prisma/client';

/**
 * BANQUES ET RIB (point 19 de la comparaison Sage i7).
 *
 * Sage, Structure / Banque : « il est indispensable de créer un compte
 * bancaire pour un journal de banque », et « on définit les coordonnées de
 * l'établissement bancaire ». La fiche porte l'établissement, puis ses RIB ·
 * abrégé, devise, BIC, code banque, code guichet, numéro de compte, clé, IBAN,
 * journal banque. Les formats nationaux du RIB ne sont décrits nulle part dans
 * le corpus · OmegaX ne les contrôle pas, il les conserve.
 *
 * UN SEUL CONTRÔLE DE FORMAT, CELUI D'UNE NORME PUBLIÉE · l'IBAN (ISO 13616),
 * deux lettres de pays, deux chiffres de contrôle, et le reste modulo 97 égal
 * à 1. Un IBAN qui échoue est faux à coup sûr ; un compte congolais sans IBAN
 * est courant, et le champ reste facultatif.
 */

/** L'IBAN sans espaces et en majuscules, tel qu'il se compare et se stocke. */
export function normaliserIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/** ISO 13616 · structure, puis contrôle modulo 97 sur le compte replacé en tête. */
export function ibanValide(brut: string): boolean {
  const iban = normaliserIban(brut);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const reordonne = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of reordonne) {
    const v = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const chiffre of v) reste = (reste * 10 + Number(chiffre)) % 97;
  }
  return reste === 1;
}

/**
 * Le journal d'un RIB · Sage parle d'un « journal de banque ». Un journal de
 * trésorerie qui porte une caisse (57, dans les deux plans) n'en est pas un ·
 * le RIB rattacherait un relevé bancaire aux espèces.
 */
export function motifRefusJournalBanque(journal: {
  code: string;
  type: TypeJournal;
  compteTresorerie: { numero: string } | null;
} | null): string | null {
  if (!journal) return 'Journal introuvable dans ce dossier.';
  if (journal.type !== TypeJournal.TRESORERIE) {
    return `Le journal ${journal.code} n'est pas un journal de trésorerie · un RIB ne se rattache qu'à un journal de banque.`;
  }
  if (journal.compteTresorerie?.numero.startsWith('57')) {
    return `Le journal ${journal.code} porte une caisse (${journal.compteTresorerie.numero}) · un RIB ne se rattache qu'à un journal de banque.`;
  }
  return null;
}
