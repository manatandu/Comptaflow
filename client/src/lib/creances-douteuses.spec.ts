import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { annonceRevue, compte416Initial, motifAnnulationValide, motifListe651Vide, piecesAEnvoyer } from './creances-douteuses';
import { montant } from './montants';

const page = readFileSync(join(__dirname, '../pages/CreancesDouteusesPage.tsx'), 'utf8');

describe('créances douteuses · écran (ligne A7)', () => {
  it('annonce l’écart seul, dotation, reprise ou maintien, montants écrits par lib/montants', () => {
    expect(annonceRevue(0, 400_000)).toBe(`Dotation de ${montant(400_000)} · D 6594 / C 491, au dernier jour de l'exercice.`);
    expect(annonceRevue(400_000, 250_000)).toBe(`Reprise de ${montant(150_000)} · D 491 / C 7594, au dernier jour de l'exercice.`);
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

  it('M8 · une liste 651 vide dit pourquoi et quoi faire ; non lue, elle ne dit rien', () => {
    expect(motifListe651Vide(null)).toBeNull();
    expect(motifListe651Vide([{}])).toBeNull();
    expect(motifListe651Vide([])).toContain('Plan comptable');
    expect(page).toContain('motifListe651Vide(comptes651)');
  });

  it('B2 · l’annulation d’une revue exige un motif de 3 à 500 caractères, dans sa modale', () => {
    expect(motifAnnulationValide('ab')).toBe(false);
    expect(motifAnnulationValide('Erreur')).toBe(true);
    expect(motifAnnulationValide('x'.repeat(501))).toBe(false);
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/annuler`');
    expect(page).toContain('Annuler la revue de la dépréciation');
  });

  it('la dépréciation se saisit en montant, jamais en taux · l’écran envoie le montant déclaré', () => {
    const corps = page.slice(page.indexOf('async function envoyer'));
    expect(corps).toContain('depreciationNecessaire: necessaire');
  });

  it('M8 · gestes réservés à peutValider, formulaire gardé à la fermeture, aucun formatage de montant recopié', () => {
    expect(page).toContain('peutValider &&');
    expect(page).not.toMatch(/\bpeutEcrire\b/);
    expect(page).toContain('useGardeFermeture(');
    expect(page).not.toMatch(/toFixed\(/);
  });
});
