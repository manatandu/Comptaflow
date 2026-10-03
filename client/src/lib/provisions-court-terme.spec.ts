import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compteApresChangementDHorizon, comptesDuCourtTerme } from './provisions-compte';

/**
 * Ligne A16 · à moins d'un an, la provision va au 499 ou au 599, jamais au 19
 * (fiches des comptes 19 et 49). Les racines sont des DONNÉES DE TEST, celles
 * que le serveur sert (`comptesCourtTerme`) pour un dossier SYCEBNL.
 */
const racines = [{ compte: '4991' }, { compte: '4998' }, { compte: '599' }];
const natures = [{ nature: 'LITIGE', compte: '191', intitule: 'Provisions pour litiges' }];
const comptes = [
  { id: 'c191', numero: '19100000', intitule: 'Litiges' },
  { id: 'c4991', numero: '49910000', intitule: 'Court terme exploitation' },
];

describe('provision à moins d’un an', () => {
  it('la liste ne retient que les racines du court terme, et garde le compte courant lisible', () => {
    expect(comptesDuCourtTerme(comptes, racines, '').map((c) => c.id)).toEqual(['c4991']);
    expect(comptesDuCourtTerme(comptes, racines, 'c191').map((c) => c.id)).toEqual(['c191', 'c4991']);
  });

  it('passer à moins d’un an retire le 191 en le disant et présélectionne le seul 4991', () => {
    const r = compteApresChangementDHorizon(comptes, natures, racines, 'LITIGE', true, 'c191');
    expect(r.compteId).toBe('c4991');
    expect(r.avis).toContain('19100000');
    expect(r.avis).toContain('499 ou au 599');
  });

  it('revenir à plus d’un an rend le 191', () => {
    expect(compteApresChangementDHorizon(comptes, natures, racines, 'LITIGE', false, 'c4991').compteId).toBe('c191');
  });

  it('la fenêtre envoie l’horizon et les seules conditions propres de la nature', () => {
    const page = readFileSync(join(__dirname, '../pages/ProvisionsPage.tsx'), 'utf8');
    expect(page.match(/courtTerme: f\.courtTerme,/g)?.length).toBe(2);
    expect(page).toContain('Object.fromEntries(conditionsPropresDe(f.nature).map((c) => [c.cle, f.conditionsPropres[c.cle] === true]))');
  });
});
