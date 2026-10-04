import { reliquatFondsCommercial } from './prix-global';

/*
  Ligne A22 · le fonds commercial (21500000) n'est visé que s'il reste un
  reliquat, comme au serveur (AUDCIF Titre VIII ch. 2 § 7.2.1).
*/
describe('reliquat du fonds de commerce', () => {
  it('prix moins éléments séparables et stocks, au centime', () => {
    expect(reliquatFondsCommercial('50000000', ['12000000', '3000000.10'], ['4999999.90'])).toBe(30_000_000);
  });

  it('un prix entièrement ventilé ne laisse aucun reliquat · aucun fonds commercial ne naît', () => {
    expect(reliquatFondsCommercial('15000000', ['10000000'], ['5000000'])).toBe(0);
  });

  it('les flottants ne fabriquent pas un reliquat d’un centime', () => {
    expect(reliquatFondsCommercial('0.3', ['0.1', '0.2'], [])).toBe(0);
  });

  it('un montant pas encore saisi n’est pas zéro', () => {
    expect(reliquatFondsCommercial('15000000', ['10000000', ''], [])).toBeNull();
    expect(reliquatFondsCommercial('', ['10000000'], [])).toBeNull();
  });

  it('des éléments au-delà du prix rendent un reliquat négatif, que le serveur refuse', () => {
    expect(reliquatFondsCommercial('10000000', ['12000000'], [])).toBe(-2_000_000);
  });
});
