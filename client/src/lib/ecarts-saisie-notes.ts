import type { NoteCalculee } from './types';
import { montant } from './montants';

/**
 * Écart qu'une cellule SAISIE présente avec ce que le modèle écrit · un total
 * différent de la somme de ses lignes, une colonne « C = A - B » différente
 * de sa formule (serveur, `controles-saisie-notes.ts`, passe R6, B12). Dit
 * sous la ligne, jamais corrigé · la cellule reste celle que le dossier a
 * tapée.
 */
export interface EcartSaisieNote {
  colonne: number;
  saisi: number | null;
  attendu: number;
}

/**
 * Texte d'un écart, écrit une fois pour l'écran · hors du composant, pour se
 * vérifier sans monter React (même parti que `resoudreExercice`).
 */
export function texteEcartSaisie(note: NoteCalculee, e: EcartSaisieNote): string {
  const colonne = note.colonnes[e.colonne]?.libelle ?? `colonne ${e.colonne + 1}`;
  const saisi = e.saisi === null ? 'vide' : `saisi ${montant(e.saisi)}`;
  return `Contrôle · ${colonne} : ${saisi}, attendu ${montant(e.attendu)} d'après les cellules saisies.`;
}
