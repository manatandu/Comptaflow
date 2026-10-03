// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { comptesProposablesEcart, corpsReglementEnDevise, nombreSaisi } from './ecart-change';

const plan = ['65800000', '65910000', '67600000', '75880000', '75910000', '77600000', '65110000'].map((numero) => ({ numero }));

describe('comptes proposables pour un écart de change commercial au SYCEBNL', () => {
  it('une perte · sous le 65 hors 659, jamais le 676', () => {
    expect(comptesProposablesEcart(plan, 'PERTE').map((c) => c.numero)).toEqual(['65800000', '65110000']);
  });

  it('un gain · sous le 75 hors 759, jamais le 776', () => {
    expect(comptesProposablesEcart(plan, 'GAIN').map((c) => c.numero)).toEqual(['75880000']);
  });

  it('sens encore inconnu · les deux racines', () => {
    expect(comptesProposablesEcart(plan, null).map((c) => c.numero)).toEqual(['65800000', '75880000', '65110000']);
  });
});

describe('le corps du règlement en devise', () => {
  it('cours exigé, montant en devise facultatif, jamais de montant en francs', () => {
    expect(corpsReglementEnDevise({ compteId: 'c', ligneIds: ['f'], montantDevise: '', cours: '', compteEcartChangeId: undefined, reference: undefined }).motif).toMatch(
      /cours du jour/,
    );
    const { corps } = corpsReglementEnDevise({ compteId: 'c', ligneIds: ['f'], montantDevise: '600', cours: '1 750', compteEcartChangeId: 'k', reference: 'CHQ 1' });
    expect(corps).toEqual({ compteId: 'c', ligneIds: ['f'], coursReglement: 1750, montantDevise: 600, compteEcartChangeId: 'k', reference: 'CHQ 1' });
    expect(corps).not.toHaveProperty('montant');
  });

  it('lit un nombre à la française, et vide n’est pas zéro', () => {
    expect(nombreSaisi('1 750,5')).toBe(1750.5);
    expect(nombreSaisi('')).toBeNull();
    expect(nombreSaisi('abc')).toBeNull();
  });
});
