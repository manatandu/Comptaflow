import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { celluleLibreSaisissable, texteCelluleLibre } from './cellules-notes';
import type { ColonneNote, LigneNoteCalculee } from './types';

// AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
// tri-notes.spec.ts) : describe/it/expect arrivent par les globales.

/**
 * PASSE O3, CONSTAT A1/D1 · les sûretés réelles de la note 1 sortaient en
 * case VIDE et non modifiable sur une ligne de dette chiffrée. Une case
 * blanche sous « Hypothèques » se lit « aucune hypothèque », et rien à l'écran
 * ne permettait de la remplir.
 */
const HYPOTHEQUES: ColonneNote = { type: 'LIBRE', libelle: 'SÛRETÉS RÉELLES : Hypothèques', saisieSurLigneChiffree: true };
const NOTE: ColonneNote = { type: 'LIBRE', libelle: 'Note' };
const MONTANT: ColonneNote = { type: 'EXERCICE_N', libelle: 'Montant brut', saisieSurLigneChiffree: true };

const dette = (champs: Partial<LigneNoteCalculee> = {}): LigneNoteCalculee => ({
  cle: 'dettes-garanties-etablissements-de-credit',
  libelle: 'Emprunts et dettes des établissements de crédit',
  montantN: 50_000_000,
  estTotal: false,
  comptes: [],
  saisieLibre: [null, null, 'Hypothèque, immeuble de Gombe', null, null],
  ...champs,
});

describe('cellule LIBRE d’une ligne chiffrée', () => {
  it('s’ouvre sur une colonne LIBRE déclarée, d’une ligne servie avec sa clé', () => {
    expect(celluleLibreSaisissable(HYPOTHEQUES, dette())).toBe(true);
    expect(texteCelluleLibre(dette(), 2)).toBe('Hypothèque, immeuble de Gombe');
    expect(texteCelluleLibre(dette(), 3)).toBe('');
  });

  it('reste fermée sur la colonne « Note », sur une colonne chiffrée, sur un total, sans clé ou sans saisie servie', () => {
    expect(celluleLibreSaisissable(NOTE, dette())).toBe(false);
    expect(celluleLibreSaisissable(MONTANT, dette())).toBe(false);
    expect(celluleLibreSaisissable(HYPOTHEQUES, dette({ estTotal: true }))).toBe(false);
    expect(celluleLibreSaisissable(HYPOTHEQUES, dette({ cle: undefined }))).toBe(false);
    expect(celluleLibreSaisissable(HYPOTHEQUES, dette({ saisieLibre: undefined }))).toBe(false);
  });

  it('l’écran des notes s’en sert, et enregistre la cellule par le même chemin que les rubriques en saisie', () => {
    const rendu = readFileSync(join(__dirname, '../components/NotesAnnexesRendu.tsx'), 'utf8');
    const debut = rendu.indexOf('function LigneTableauNote');
    const fin = rendu.indexOf('\nexport function BlocTableauNote', debut);
    expect(debut).toBeGreaterThan(0);
    const composant = rendu.slice(debut, fin);
    const i = composant.indexOf('if (celluleLibreSaisissable(c, ligne))');
    expect(i).toBeGreaterThan(0);
    // La branche ouverte rend un champ qui enregistre SA colonne.
    const branche = composant.slice(i, composant.indexOf('const v = valeurColonne(ligne, c.type);', i));
    expect(branche).toContain('<input');
    expect(branche).toContain('saisie.enregistrer(note.code, ligne.cle!, ci, e.target.value)');
    expect(branche).toContain('texteCelluleLibre(ligne, ci)');
  });

  it('la règle est celle du serveur · colonne LIBRE ET déclarée', () => {
    const serveur = readFileSync(
      join(__dirname, '../../../src/modules/notes-annexes/cellules-libres-en-saisie.ts'),
      'utf8',
    );
    expect(serveur).toContain("colonne.type === 'LIBRE' && colonne.saisieSurLigneChiffree === true");
  });
});
