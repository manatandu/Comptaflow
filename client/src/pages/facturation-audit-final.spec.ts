import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL · la fenêtre Facturation. Chaque test découpe le bloc qui porte
 * la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'FacturationPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F114 · la pièce imprimée lit le TTC du serveur, autres taxes comprises', () => {
  it('le total imprimé après les autres impôts et taxes est celui du serveur', () => {
    const pied = bloc('Autres impôts et taxes</td>', '</tbody>');
    expect(pied).toContain('<td className="pr-4">Montant TTC</td><td className="text-right">{montantImprime(f.totaux.montantTTC)}</td>');
  });
});
