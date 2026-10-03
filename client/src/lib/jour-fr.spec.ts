import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { jourFr } from './jour-fr';

/**
 * LIGNE A7 QUATER, m8 · le Règlement des tiers affichait la date ISO brute du
 * reclassement d'une créance (« le 2026-06-15 »). On gèle la PRÉSENCE de la
 * mise en forme à l'endroit qui l'affiche, jamais l'absence d'un motif.
 */
describe('jourFr', () => {
  it('rend JJ/MM/AAAA par découpage, sans recul d’un jour à minuit UTC', () => {
    expect(jourFr('2026-06-15')).toBe('15/06/2026');
    expect(jourFr('2027-01-01T00:00:00.000Z')).toBe('01/01/2027');
  });

  it('une chaîne qui n’est pas une date ISO est rendue telle quelle', () => {
    expect(jourFr('inconnue')).toBe('inconnue');
  });

  it('m8 · le Règlement des tiers met en forme la date du reclassement, de l’échéance et du cours', () => {
    const page = readFileSync(join(__dirname, '../pages/ReglementsPage.tsx'), 'utf-8');
    expect(page).toContain('jourFr(g.creanceReclassee.date)');
    expect(page).toContain('jourFr(l.echeance)');
    expect(page).toContain('jourFr(coursCote.date)');
  });
});
