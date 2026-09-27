import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F84 · la liste des comptes qu'on détache d'une rubrique se bâtit
 * sur les RATTACHEMENTS du dossier, pas sur les comptes que la balance chiffre ·
 * un compte rattaché sans solde n'y figurait pas, et un rattachement erroné ne
 * se défaisait plus.
 */
const rendu = readFileSync(join(__dirname, 'NotesAnnexesRendu.tsx'), 'utf8');

describe('F84 · détacher un compte rattaché', () => {
  it('le bouton de détachement parcourt les numéros rattachés', () => {
    const i = rendu.indexOf('title="Détacher"');
    expect(i).toBeGreaterThan(0);
    // La dernière liste parcourue avant le bouton est celle des rattachements.
    const listes = [...rendu.slice(0, i).matchAll(/\{\(?([\w.? ]+?)(?:\s*\?\?\s*\[\])?\)?\.map\(\((\w+)\)/g)];
    const derniere = listes[listes.length - 1];
    expect(derniere[1]).toBe('l.comptesRattaches');
    expect(rendu.slice(derniere.index!, i)).toContain(`compteParNumero.get(${derniere[2]})`);
  });
});

/**
 * AUDIT FINAL F86 · dans l'état d'exécution budgétaire, une RUBRIQUE est un
 * sous-total · rendue comme une ligne de détail, la colonne additionnée
 * comptait chaque dépense deux fois.
 */
describe('F86 · la rubrique de l’exécution budgétaire se lit comme un sous-total', () => {
  it('la ligne de l’écran lit estRubrique pour son style', () => {
    const page = readFileSync(join(__dirname, '../pages/EtatsFinanciersPage.tsx'), 'utf8');
    const i = page.indexOf('executionBudget.lignes.map((l) =>');
    expect(i).toBeGreaterThan(0);
    const ligne = page.slice(i, page.indexOf('</div>', i));
    expect(ligne).toMatch(/l\.estRubrique \? 'font-bold/);
  });
});
