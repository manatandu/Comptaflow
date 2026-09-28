import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUREE_COMPTEUR_MS, valeurIntermediaire } from './compteur-valeur';
import { montant } from './montants';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * UN CHIFFRE ANIMÉ NE FINIT JAMAIS FAUX.
 *
 * `depart + (cible - depart) × 1` n'est pas `cible` en flottant pour toute
 * paire · le jeu d'essai a été CHERCHÉ pour le montrer (3,3 + (0,7 − 3,3) × 1
 * rend 0,7000000000000002 ; l'intuition, 0,1 vers 0,3, tombe juste et ne
 * prouvait rien, ce que la première version de ce test a montré). Si la
 * dernière étape passait par le calcul, c'est ce nombre qui resterait à
 * l'écran.
 */
describe('compteur des indicateurs', () => {
  it('le jeu d’essai porte bien un résidu flottant · sans quoi le test suivant ne prouve rien', () => {
    expect(3.3 + (0.7 - 3.3) * 1).not.toBe(0.7);
  });

  it('la dernière étape rend la cible EXACTE, et au-delà aussi', () => {
    expect(valeurIntermediaire(3.3, 0.7, 1)).toBe(0.7);
    expect(valeurIntermediaire(3.3, 0.7, 1.7)).toBe(0.7);
    expect(valeurIntermediaire(0, 1234567.89, 1)).toBe(1234567.89);
  });

  it('avant le départ, la valeur de départ exacte', () => {
    expect(valeurIntermediaire(12, 99, 0)).toBe(12);
    expect(valeurIntermediaire(12, 99, -1)).toBe(12);
    expect(valeurIntermediaire(12, 99, Number.NaN)).toBe(12);
  });

  it('monte sans dépasser, dans les deux sens · un négatif ne passe pas par le positif', () => {
    let precedent = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = valeurIntermediaire(0, -500, t);
      expect(v).toBeLessThanOrEqual(precedent);
      expect(v).toBeGreaterThanOrEqual(-500);
      precedent = v;
    }
  });

  it('écrit par montant(), la fin est le montant de la balance au centime', () => {
    expect(montant(valeurIntermediaire(0, 2500.005, 1))).toBe(montant(2500.005));
  });

  it('dure dans la fourchette des entrées de l’interface (120 à 280 ms)', () => {
    expect(DUREE_COMPTEUR_MS).toBeGreaterThanOrEqual(120);
    expect(DUREE_COMPTEUR_MS).toBeLessThanOrEqual(280);
  });

  it('lit la préférence de mouvement réduit du système', () => {
    const source = readFileSync(join(__dirname, 'compteur.ts'), 'utf8');
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });
});
