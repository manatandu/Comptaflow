import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mentionANouveauxEcartes } from './rapprochement-a-nouveau';

// Aucun import de « vitest » · convention du dépôt, `globals` fournit describe,
// it et expect.

/**
 * AUDIT FINAL F205, LE RESTE · le serveur écarte du pointage les reports
 * à-nouveau qui recopient un solde, et il les compte (`aNouveauEcartes`,
 * `RapprochementService.obtenir`). L'écran n'en disait rien : la ligne
 * disparaissait de la fenêtre, et un compte dont le seul mouvement était un
 * à-nouveau s'affichait « Aucun mouvement pointable », sans dire pourquoi.
 */
describe('les reports à-nouveau écartés du pointage se disent', () => {
  it('un seul report se dit au singulier', () => {
    expect(mentionANouveauxEcartes(1)).toBe('1 report à-nouveau écarté du pointage.');
  });

  it('plusieurs reports se disent au pluriel, avec leur nombre', () => {
    expect(mentionANouveauxEcartes(2)).toBe('2 reports à-nouveau écartés du pointage.');
    expect(mentionANouveauxEcartes(1250)).toBe(`${(1250).toLocaleString('fr-FR')} reports à-nouveau écartés du pointage.`);
  });

  it('zéro est une réponse lue · rien à dire', () => {
    expect(mentionANouveauxEcartes(0)).toBeNull();
  });
});

describe("la fenêtre du rapprochement porte la mention que le serveur compte", () => {
  const page = readFileSync(join(__dirname, '../pages/RapprochementDetailPage.tsx'), 'utf8');

  it('le nombre servi par le serveur passe par la règle, et la mention est rendue', () => {
    expect(page).toContain('mentionANouveauxEcartes(detail.aNouveauEcartes)');
    expect(page).toContain('{mentionANouveau && (');
    expect(page).toContain('<span>{mentionANouveau}</span>');
  });

  it('le type du détail porte le compte que le serveur rend', () => {
    const types = readFileSync(join(__dirname, 'types.ts'), 'utf8');
    const debut = types.indexOf('export interface DetailRapprochement');
    expect(debut).toBeGreaterThan(0);
    const fin = types.indexOf('\n}', debut);
    expect(types.slice(debut, fin)).toContain('aNouveauEcartes: number;');
  });
});
