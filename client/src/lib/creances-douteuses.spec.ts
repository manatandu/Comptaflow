import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { annonceRevue, compte416Initial, piecesAEnvoyer } from './creances-douteuses';

const page = readFileSync(join(__dirname, '../pages/CreancesDouteusesPage.tsx'), 'utf8');

describe('créances douteuses · écran (ligne A7)', () => {
  it('annonce l’écart seul, dotation, reprise ou maintien', () => {
    expect(annonceRevue(0, 400_000)).toContain('Dotation de 400000.00 · D 6594 / C 491');
    expect(annonceRevue(400_000, 250_000)).toContain('Reprise de 150000.00 · D 491 / C 7594');
    expect(annonceRevue(400_000, 400_000)).toContain('aucune écriture');
    // Un champ vide n'annonce rien · vide n'est pas zéro.
    expect(annonceRevue(400_000, null)).toBeNull();
  });

  it('présélectionne le 416 proposé, sinon le seul compte, sinon rien', () => {
    const c = [
      { id: 'a', numero: '41610000' },
      { id: 'b', numero: '41620000' },
    ];
    expect(compte416Initial({ DOUTEUSE: '4162' }, 'DOUTEUSE', c)).toBe('b');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', c)).toBe('');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', [c[0]])).toBe('a');
  });

  it('n’envoie que les pièces qui ont une nature et une référence', () => {
    expect(piecesAEnvoyer([{ nature: 'Mise en demeure', reference: 'LR-1', date: '' }, { nature: '', reference: 'x', date: '' }])).toEqual([
      { nature: 'Mise en demeure', reference: 'LR-1' },
    ]);
  });

  it('la dépréciation se saisit en montant, jamais en taux · l’écran envoie le montant déclaré', () => {
    const corps = page.slice(page.indexOf('async function envoyer'));
    expect(corps).toContain('depreciationNecessaire: necessaire');
  });

  it('les gestes d’écriture sont réservés à qui peut écrire', () => {
    expect(page).toContain('peutEcrire &&');
  });
});
