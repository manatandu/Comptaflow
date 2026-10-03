import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { motifDecompteNonEmissible, natureDuBulletin } from './decompte-emis';

describe('A8 · ce qui manque pour émettre le décompte final', () => {
  it('nomme le décompte comme tel, et le bulletin ordinaire comme avant', () => {
    expect(natureDuBulletin('DECOMPTE_FINAL')).toBe('Décompte final');
    expect(natureDuBulletin('MOIS')).toBe('Bulletin de paie');
    expect(natureDuBulletin(undefined)).toBe('Bulletin de paie');
  });

  it('dit le salarié, puis le mois, et se tait quand tout y est', () => {
    expect(motifDecompteNonEmissible(null, '2026-05')).toContain('salarié');
    expect(motifDecompteNonEmissible('s-1', '')).toContain('mois de cessation');
    expect(motifDecompteNonEmissible('s-1', '2026-13')).toContain('mois de cessation');
    expect(motifDecompteNonEmissible('s-1', '2026-05')).toBeNull();
  });

  it("l'écran émet par la route du serveur, avec les faits ET la paie du mois, derrière peutEcrire", () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'PersonnelPage.tsx'), 'utf8');
    const debut = page.indexOf('const emettreDecompte = () =>');
    const fin = page.indexOf('const corpsSalarie = () =>', debut);
    const corps = page.slice(debut, fin);
    expect(corps).toContain('/decompte-final`');
    expect(corps).toContain('corpsSimulation()');
    expect(corps).toContain('corpsDecompte()');
    // Le bouton n'existe que pour qui écrit.
    const bouton = page.indexOf('Émettre le décompte final');
    expect(page.lastIndexOf('{peutEcrire && (', bouton)).toBeGreaterThan(page.lastIndexOf('Calculer', bouton));
  });
});
