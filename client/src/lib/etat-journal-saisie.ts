/**
 * États d'une case de la fenêtre des journaux de saisie (point 17, Sage i7).
 * Le serveur les calcule (`journaux/etat-journaux-saisie.ts`) ; l'écran ne
 * fait que les nommer. « Non imprimé » n'existe pas ici · OmegaX ne trace pas
 * l'impression d'un journal.
 */
export type EtatMoisJournal = 'VIDE' | 'BROUILLARD' | 'JOURNAL' | 'CLOTURE';

export interface CaseJournalMois {
  mois: string;
  etat: EtatMoisJournal;
  nombreEcritures: number;
  enBrouillard: number;
  aNouveauProvisoire: number;
  figeJusquau: string | null;
}

export interface LigneGrilleSaisie {
  id: string;
  code: string;
  intitule: string;
  type: string;
  estActif: boolean;
  cases: CaseJournalMois[];
}

export const ETATS_JOURNAL: Record<EtatMoisJournal, { sigle: string; libelle: string; classe: string }> = {
  VIDE: { sigle: '', libelle: 'Aucune écriture', classe: '' },
  BROUILLARD: { sigle: 'B', libelle: 'Brouillard', classe: 'bg-warning-soft text-warning' },
  JOURNAL: { sigle: 'J', libelle: 'Journal (tout validé)', classe: 'bg-positive-soft text-positive' },
  CLOTURE: { sigle: 'C', libelle: 'Clôturé', classe: 'bg-chrome-alt text-text-dim' },
};

/** L'infobulle d'une case · ce qu'elle contient, et ce qui la fige. */
export function bulleCase(c: CaseJournalMois): string {
  const seulAN = c.etat === 'VIDE' && c.aNouveauProvisoire > 0;
  const morceaux = [seulAN ? 'À-nouveau provisoire seul' : ETATS_JOURNAL[c.etat].libelle];
  if (c.nombreEcritures > 0 && !seulAN) morceaux.push(`${c.nombreEcritures} écriture${c.nombreEcritures > 1 ? 's' : ''}`);
  if (c.enBrouillard > 0) morceaux.push(`${c.enBrouillard} au brouillard`);
  if (c.aNouveauProvisoire > 0) morceaux.push(seulAN ? 'au brouillard jusqu’à la clôture' : 'à-nouveau provisoire, au brouillard jusqu’à la clôture');
  if (c.figeJusquau) morceaux.push(`figé jusqu'au ${c.figeJusquau.split('-').reverse().join('/')}`);
  return morceaux.join(' · ');
}

/** Le sigle d'une case · un mois qui ne porte que l'à-nouveau provisoire l'annonce. */
export function sigleCase(c: CaseJournalMois): string {
  if (c.etat === 'VIDE' && c.aNouveauProvisoire > 0) return 'AN';
  return ETATS_JOURNAL[c.etat].sigle;
}

const MOIS_COURTS = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
/** Entête de colonne · « Jui » ne distingue pas juin de juillet. */
export function moisCourt(mois: number): string {
  return MOIS_COURTS[mois];
}
