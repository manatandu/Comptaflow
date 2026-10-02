import {
  CLE_ONGLET_IMMOBILISATIONS,
  lireOngletMemorise,
  memoriserOnglet,
  ongletAOuvrir,
  ongletPermis,
} from './onglets-immobilisations';

/**
 * LES ONGLETS DE LA FENÊTRE IMMOBILISATIONS (ligne A1) · l'onglet ouvert,
 * sa mémoire par poste et la réserve de « Lieux ». Écrit sans import de
 * vitest · le fichier tourne aussi sous Jest (racine du dépôt).
 */
describe('onglet à ouvrir dans la fenêtre Immobilisations', () => {
  it('Biens par défaut, sans mémoire', () => {
    expect(ongletAOuvrir(null, 'biens', true)).toBe('biens');
  });

  it('l’onglet mémorisé sur le poste est repris', () => {
    expect(ongletAOuvrir('financements', 'biens', false)).toBe('financements');
    expect(ongletAOuvrir('operations', 'biens', false)).toBe('operations');
  });

  it('une vue de tableau demandée par le menu prime sur la mémoire', () => {
    expect(ongletAOuvrir('financements', 'immobilisations', true)).toBe('tableaux');
    expect(ongletAOuvrir(null, 'amortissements', true)).toBe('tableaux');
  });

  it('une mémoire inconnue ne fige pas la fenêtre sur du vide', () => {
    expect(ongletAOuvrir('inconnu', 'biens', true)).toBe('biens');
  });

  it('Lieux n’est servi qu’à l’administrateur', () => {
    expect(ongletAOuvrir('lieux', 'biens', true)).toBe('lieux');
    expect(ongletAOuvrir('lieux', 'biens', false)).toBe('biens');
    expect(ongletPermis('lieux', false)).toBe('biens');
    expect(ongletPermis('lieux', true)).toBe('lieux');
  });
});

describe('mémorisation par poste', () => {
  const g = globalThis as { localStorage?: unknown };
  let avant: PropertyDescriptor | undefined;
  beforeEach(() => {
    avant = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  });
  afterEach(() => {
    if (avant) Object.defineProperty(globalThis, 'localStorage', avant);
    else delete g.localStorage;
  });
  const poser = (valeur: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: valeur, configurable: true, writable: true });

  it('écrit et relit sous sa clé', () => {
    const magasin = new Map<string, string>();
    poser({ getItem: (k: string) => magasin.get(k) ?? null, setItem: (k: string, v: string) => void magasin.set(k, v) });
    memoriserOnglet('operations');
    expect(magasin.get(CLE_ONGLET_IMMOBILISATIONS)).toBe('operations');
    expect(lireOngletMemorise()).toBe('operations');
  });

  it('un stockage qui jette (fenêtre privée) ne casse rien', () => {
    const jette = () => {
      throw new Error('bloqué');
    };
    poser({ getItem: jette, setItem: jette });
    expect(lireOngletMemorise()).toBeNull();
    expect(() => memoriserOnglet('biens')).not.toThrow();
  });

  it('un stockage absent ne casse rien', () => {
    poser(undefined);
    expect(lireOngletMemorise()).toBeNull();
    expect(() => memoriserOnglet('biens')).not.toThrow();
  });
});
