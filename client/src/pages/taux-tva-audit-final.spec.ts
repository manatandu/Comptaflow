import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F122 · les comptes d'un taux de taxe se complètent depuis
 * l'écran. Deux messages (saisie et facture passée au journal) y renvoyaient,
 * et aucun geste n'existait. Chaque test découpe le bloc qui porte la
 * propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'TauxTvaPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F122 · modifier un taux de taxe', () => {
  it('chaque ligne propose « Modifier », qui ouvre la boîte d’édition', () => {
    expect(bloc('onClick={() => ouvrirEdition(t)}', '</button>')).toContain('Modifier');
  });

  it('l’envoi porte les deux comptes, et le pourcentage seulement s’il change (F121)', () => {
    const envoi = bloc('const onModifier = async', 'setEdition(null);');
    expect(envoi).toContain('compteCollecteId: edCollecte || null');
    expect(envoi).toContain('compteDeductibleId: edDeductible || null');
    expect(envoi).toContain('...(Number(edTaux) !== Number(edition.taux) ? { taux: Number(edTaux) } : {})');
  });
});
