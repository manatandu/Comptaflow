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

describe('F117 · les factures barrées se lisent à part sur l’état détaillé', () => {
  it('l’écran montre chaque facture barrée, avec ce qu’elle devient dans les totaux', () => {
    const cadre = bloc('Factures barrées par une note de crédit', '</ul>');
    expect(cadre).toContain("{a.ecarteeDesTotaux ? 'hors des totaux' : 'comprise dans les totaux'}");
    expect(cadre).toContain('{a.motif}');
  });
});

describe('F119 · une note de crédit ne se propose pas à la suppression', () => {
  it('le bouton Supprimer exige une FACTURE ni passée ni barrée', () => {
    const garde = bloc('crédit, qui débarrerait la facture', 'onClick={() => void supprimer(');
    expect(garde).toContain("{peutEcrire && !f.ecritureId && !f.barree && f.nature === 'FACTURE' && (");
  });
});
