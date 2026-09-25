import { fourchettesEnTexte, texteEnFourchettes } from './natures-compte';

describe('saisie des fourchettes de nature', () => {
  it('lit « 40 » et « 311-315 », et les réécrit à l’identique', () => {
    const f = texteEnFourchettes(' 40, 311-315 ');
    expect(f).toEqual([
      { du: '40', au: '40' },
      { du: '311', au: '315' },
    ]);
    expect(fourchettesEnTexte(f)).toBe('40, 311-315');
  });

  it('une saisie vide rend une liste vide, que le serveur refuse en le disant', () => {
    expect(texteEnFourchettes(' , ')).toEqual([]);
  });
});
