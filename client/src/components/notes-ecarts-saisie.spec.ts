import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NoteCalculee } from '../lib/types';
import { texteEcartSaisie } from '../lib/ecarts-saisie-notes';

/**
 * PASSE R6, B12 · un total ou une formule EN SAISIE qui ne rend pas ce que le
 * modèle écrit se dit sur la ligne, à l'écran comme dans la liasse. Le
 * serveur confronte (`controles-saisie-notes.ts`) · l'écran ne recalcule rien.
 */
const note = {
  code: '5G',
  colonnes: [
    { type: 'LIBRE', libelle: 'Montant brut (A)' },
    { type: 'LIBRE', libelle: 'Amortissements pratiqués (B)' },
    { type: 'LIBRE', libelle: 'Valeur comptable nette (C = A - B)' },
  ],
} as unknown as NoteCalculee;

describe('B12 · écart d’une cellule en saisie', () => {
  it('nomme la colonne, la valeur saisie et l’attendu', () => {
    const t = texteEcartSaisie(note, { colonne: 2, saisi: 900, attendu: 1000 });
    expect(t).toContain('Valeur comptable nette (C = A - B)');
    expect(t).toMatch(/saisi 900/);
    expect(t).toMatch(/attendu 1[\s  .]?000/);
  });

  it('une cellule vide est dite vide, jamais lue comme zéro', () => {
    expect(texteEcartSaisie(note, { colonne: 0, saisi: null, attendu: 1500 })).toMatch(/: vide,/);
  });

  it('la ligne du tableau rend les écarts que le serveur a posés', () => {
    const rendu = readFileSync(join(__dirname, 'NotesAnnexesRendu.tsx'), 'utf8');
    const debut = rendu.indexOf('function LigneTableauNote(');
    expect(debut).toBeGreaterThan(0);
    expect(rendu.slice(debut)).toMatch(/ecartsSaisie[\s\S]*texteEcartSaisie\(/);
  });
});
