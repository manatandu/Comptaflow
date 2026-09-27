import { readFileSync } from 'fs';
import { join } from 'path';
import { lireJournalDeSaisie, urlJournalDeSaisie } from './journal-de-saisie';
import type { Ecriture } from './types';

/**
 * AUDIT FINAL F61 · au-delà de deux mille pièces, la saisie perdait la fin
 * de la période et ses totaux ne portaient que sur la tranche rendue.
 */

const ecriture = (id: string, debit: number) =>
  ({ id, lignes: [{ id: `${id}-l`, debit, credit: 0 }] }) as unknown as Ecriture;

describe('F61 · le journal chargé dans la saisie', () => {
  it('demande les pièces les plus récentes d’abord', () => {
    expect(urlJournalDeSaisie({ exerciceId: 'x', journalId: 'j', debut: '2026-05-01', fin: '2026-05-31' })).toBe(
      '/ecritures?exerciceId=x&journalId=j&dateDebut=2026-05-01&dateFin=2026-05-31&plusRecentes=1',
    );
  });

  it('les remet dans l’ordre de lecture, la plus récente en dernier', () => {
    const lu = lireJournalDeSaisie({
      ecritures: [ecriture('e3', 30), ecriture('e2', 20), ecriture('e1', 10)],
      totaux: { debit: 60, credit: 60 },
      total: 3,
      tronque: false,
    });
    expect(lu.ecritures.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(lu.troncature).toBeNull();
  });

  it('prend les totaux du serveur, jamais la somme de la tranche, et dit la tranche', () => {
    const lu = lireJournalDeSaisie({
      ecritures: [ecriture('e3', 30), ecriture('e2', 20)],
      totaux: { debit: 4_000_000, credit: 4_000_000 },
      total: 2_500,
      tronque: true,
    });
    expect(lu.totaux).toEqual({ debit: 4_000_000, credit: 4_000_000 });
    expect(lu.troncature).toEqual({ montrees: 2, total: 2_500 });
  });

  it('la fenêtre de saisie lit ce journal-là', () => {
    const page = readFileSync(join(__dirname, '../pages/SaisiePage.tsx'), 'utf8');
    expect(page).toContain('urlJournalDeSaisie(');
    expect(page).toContain('lireJournalDeSaisie(r)');
    expect(page).toContain('{totauxJournal.debit.toLocaleString');
    expect(page).toMatch(/\{troncature && \(/);
  });
});
