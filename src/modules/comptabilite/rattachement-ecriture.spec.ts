import { decrireLigne, lignesManquantes } from './rattachement-ecriture';

/**
 * LA RÈGLE DU RATTACHEMENT · une écriture désignée après coup doit porter ce
 * que le module a proposé (audit I2). Chaque défaut ci-dessous laisserait le
 * registre se dire comptabilisé sur une pièce qui passe autre chose.
 */
describe('lignesManquantes', () => {
  const ouverture = [
    { compte: '41110001', sens: 'DEBIT' as const, montant: 12000 },
    { compte: '4194', sens: 'CREDIT' as const, montant: 12000 },
  ];

  it('une écriture qui porte chaque ligne proposée, sur une subdivision semée, couvre la proposition', () => {
    const lignes = [
      { numero: '41110001', debit: 12000, credit: 0 },
      { numero: '41940000', debit: 0, credit: 12000 },
    ];
    expect(lignesManquantes(ouverture, lignes)).toEqual([]);
  });

  it('des lignes en plus sont admises (une TVA saisie à la main)', () => {
    const lignes = [
      { numero: '41110001', debit: 13920, credit: 0 },
      { numero: '41940000', debit: 0, credit: 12000 },
      { numero: '44310000', debit: 0, credit: 1920 },
    ];
    // Le tiers porte 13 920 et non 12 000 · la ligne du tiers manque, pas celle du 4194.
    expect(lignesManquantes(ouverture, lignes)).toEqual([ouverture[0]]);
  });

  it('le sens compte · un 4194 débité ne passe pas une consignation émise', () => {
    const lignes = [
      { numero: '41940000', debit: 12000, credit: 0 },
      { numero: '41110001', debit: 0, credit: 12000 },
    ];
    expect(lignesManquantes(ouverture, lignes)).toEqual(ouverture);
  });

  it('le montant compte au centime', () => {
    const lignes = [
      { numero: '41110001', debit: 12000, credit: 0 },
      { numero: '41940000', debit: 0, credit: 11999.99 },
    ];
    expect(lignesManquantes(ouverture, lignes)).toEqual([ouverture[1]]);
  });

  it('une ligne de l’écriture ne sert qu’une fois', () => {
    const deux = [
      { compte: '4194', sens: 'CREDIT' as const, montant: 500 },
      { compte: '4194', sens: 'CREDIT' as const, montant: 500 },
    ];
    expect(lignesManquantes(deux, [{ numero: '41940000', debit: 0, credit: 500 }])).toEqual([deux[1]]);
  });

  it('le message nomme le compte, le sens et le montant', () => {
    expect(decrireLigne({ compte: '4194', sens: 'CREDIT', montant: 12000 })).toMatch(/^4194 au crédit pour 12\s000,00$/);
  });
});
