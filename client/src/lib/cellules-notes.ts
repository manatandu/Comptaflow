import type { ColonneNote, LigneNoteCalculee } from './types';

/**
 * CELLULE LIBRE D'UNE LIGNE CHIFFRÉE · ce que l'écran des notes rend
 * modifiable à côté d'un montant calculé.
 *
 * Une cellule chiffrée n'est jamais en saisie ; une cellule LIBRE d'une
 * rubrique chiffrée peut l'être (sûretés réelles de la note 1, nature d'un
 * contrat, échéances). La règle est celle du serveur
 * (`src/modules/notes-annexes/cellules-libres-en-saisie.ts`), qui refuse
 * toute autre cellule · l'écran ne propose que ce que cette porte accepte :
 * colonne LIBRE déclarée, ligne servie avec `saisieLibre` (donc pourvue d'une
 * clé), jamais un total. Une case blanche sous « Hypothèques » se lirait
 * « aucune hypothèque » ; une case qu'on ne peut pas remplir le resterait.
 *
 * Hors de React pour se vérifier seule, comme `tri-notes.ts`.
 */
export function celluleLibreSaisissable(colonne: ColonneNote, ligne: LigneNoteCalculee): boolean {
  return (
    colonne.type === 'LIBRE' &&
    colonne.saisieSurLigneChiffree === true &&
    ligne.saisieLibre !== undefined &&
    !!ligne.cle &&
    !ligne.estTotal
  );
}

/** Le texte que le dossier a écrit dans la cellule, tel qu'il l'a écrit · vide si rien. */
export function texteCelluleLibre(ligne: LigneNoteCalculee, index: number): string {
  const v = ligne.saisieLibre?.[index];
  return v === null || v === undefined ? '' : String(v);
}
