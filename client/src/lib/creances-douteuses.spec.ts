import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  annonceRevue,
  compte416Initial,
  motifAnnulationValide,
  motifListe651Vide,
  mouvementAAnnulerParDefaut,
  piecesAEnvoyer,
} from './creances-douteuses';
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

describe('créances douteuses · E1 à l’écran', () => {
  it('la bulle d’aide de la revue dit que la base est le TTC inscrit au 416', () => {
    expect(page).toContain('Base de la dépréciation · le montant TTC inscrit au 416');
  });
});

describe('créances douteuses · seconde relecture à l’écran (K4, M-c)', () => {
  it('K4 · un mouvement s’annule dans sa modale, motif exigé · le plus récent est proposé', () => {
    expect(mouvementAAnnulerParDefaut([])).toBeNull();
    expect(mouvementAAnnulerParDefaut([{ id: 'b', date: '2026-12-20' }, { id: 'a', date: '2026-12-10' }])).toBe('b');
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/mouvements/${annulation.mouvementId}/annuler`');
    expect(page).toContain('Annuler une perte ou un recouvrement');
  });

  it('M-c · le mouvement sans revue se dit', () => {
    expect(page).toContain('mouvement(s) sans revue');
  });
});

describe('créances douteuses · A7 scindée à l’écran', () => {
  it('la perte s’envoie sans aucun champ de TVA, au TTC entier, et la bulle dit la récupération par imputation avec ses articles', () => {
    const corps = page.slice(page.indexOf('async function envoyer'), page.indexOf('async function annuler'));
    expect(corps).toContain('comptePerteId: form.comptePerteId || undefined,');
    expect(page).toContain('Perte au TTC entier · D 651 / C 416');
    expect(page).toContain('source="O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127"');
    expect(page).toContain('Pour l\'instant, le cabinet la déclare lui-même.');
  });

  it('le reclassement dit, dans sa bulle, de ne pas lettrer la facture avec lui', () => {
    expect(page).toContain('Ne lettrez pas la facture avec le reclassement');
    expect(page).toContain('Ne lettrez pas la facture avec la pièce du reclassement');
  });
});
