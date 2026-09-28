import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUREE_FERMETURE_MS, marquerFermeture, retirerSiEnFermeture } from './fermeture-fenetre';
import type { FenetreOuverte } from './fenetres';

// Aucun import de « vitest » · convention du dépôt.

const f = (cle: string, enFermeture?: boolean): FenetreOuverte =>
  ({ cle, adresse: cle, titre: cle, titreCourt: cle, etat: 'agrandie', etatAvantReduction: 'agrandie', ordre: 1, version: 0, cadre: { x: 0, y: 0, largeur: 1, hauteur: 1 }, enFermeture }) as FenetreOuverte;

describe('fermeture animée des fenêtres', () => {
  it('marque la fenêtre, puis ne retire qu’une fenêtre encore en fermeture', () => {
    const marquees = marquerFermeture([f('/a'), f('/b')], '/a');
    expect(marquees.map((x) => !!x.enFermeture)).toEqual([true, false]);
    expect(retirerSiEnFermeture(marquees, '/a').map((x) => x.cle)).toEqual(['/b']);
    // Rouverte pendant sa sortie (`ouvrir` lève la marque) · elle reste.
    expect(retirerSiEnFermeture([f('/a', false), f('/b')], '/a').map((x) => x.cle)).toEqual(['/a', '/b']);
  });

  it('la garde du travail non enregistré passe avant la sortie, et rouvrir lève la marque', () => {
    const src = readFileSync(join(__dirname, 'fenetres.tsx'), 'utf8');
    const corps = src.slice(src.indexOf('const fermer = useCallback'), src.indexOf('const fermerTout'));
    expect(corps.indexOf('confirmerPerte(')).toBeLessThan(corps.indexOf('marquerFermeture('));
    expect(corps).toContain('mouvementReduit()');
    expect(src).toContain('enFermeture: false, etat:');
  });

  it('la sortie CSS dure ce que le délai de retrait attend', () => {
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8');
    const m = css.match(/\.anim-fenetre-sortie \{\s*animation: fenetre-out ([0-9.]+)s/);
    expect(m).not.toBeNull();
    expect(Math.round(parseFloat(m![1]) * 1000)).toBe(DUREE_FERMETURE_MS);
    const fenetre = readFileSync(join(__dirname, '../components/chrome/Fenetre.tsx'), 'utf8');
    expect(fenetre).toContain("fenetre.enFermeture ? 'anim-fenetre-sortie pointer-events-none' : 'anim-fenetre'");
  });
});
