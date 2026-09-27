import { Collecte, PremiersSelon, pageApres } from './lecture-par-lots';

/**
 * AUDIT FINAL F185 · les outils du parcours par tranches. Chacun garde peu et
 * compte tout ; s'il se trompe, un écran montre une liste plausible et fausse.
 */
describe('lecture par tranches · les outils', () => {
  it('pageApres ordonne par identifiant, et exclut le curseur de la tranche suivante', () => {
    expect(pageApres(undefined, 500)).toEqual({ orderBy: { id: 'asc' }, take: 500 });
    expect(pageApres('e-9', 500)).toEqual({ orderBy: { id: 'asc' }, take: 500, cursor: { id: 'e-9' }, skip: 1 });
  });

  it('une collecte garde sa tête, compte tout, et dit qu’elle est tronquée', () => {
    const c = new Collecte<number>(3);
    for (let i = 0; i < 5; i++) c.ajouter(i);
    expect(c.elements).toEqual([0, 1, 2]);
    expect(c.nombre).toBe(5);
    expect(c.tronquee).toBe(true);
    const d = new Collecte<number>(3);
    d.ajouter(1);
    expect(d.tronquee).toBe(false);
  });

  it('les N premiers selon un ordre, quel que soit l’ordre d’arrivée', () => {
    const p = new PremiersSelon<number>(3, (a, b) => a - b);
    for (const x of [9, 4, 8, 1, 7, 2, 6, 3, 5, 0]) p.ajouter(x);
    expect(p.elements()).toEqual([0, 1, 2]);
    expect(p.nombre).toBe(10);
    expect(p.tronquee).toBe(true);
  });

  it('sous la capacité, tout est gardé et rien n’est dit tronqué', () => {
    const p = new PremiersSelon<number>(5, (a, b) => a - b);
    for (const x of [3, 1, 2]) p.ajouter(x);
    expect(p.elements()).toEqual([1, 2, 3]);
    expect(p.tronquee).toBe(false);
  });
});
