import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F134 ET F135 · la fenêtre Inventaire physique. Chaque test
 * découpe le bloc qui porte la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'InventairePage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F134 · le PV d’une caisse s’établit dès la préparation', () => {
  it('les statuts admis sont ceux du serveur, préparation comprise', () => {
    expect(page).toContain("const PEUT_ETABLIR_PV = ['PREPARATION', 'RECENSEMENT', 'ARBITRAGE'];");
  });
});

describe('F135 · une fiche se retire avant le rapprochement', () => {
  it('le bouton appelle la route de suppression, sur une fiche encore saisissable', () => {
    const ligne = bloc('function LigneFiche(', '{edition && (');
    const actions = ligne.slice(ligne.indexOf('{saisissable && !edition && ('));
    expect(actions).toContain('api.delete(`/inventaire/fiches/${fiche.id}`)');
  });
});
