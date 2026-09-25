import { EtatsIfrs } from './etats-ifrs';
import { CategorieFlux, construireFluxTresorerieIfrs, EntreesFluxIfrs } from './flux-tresorerie-ifrs';

/**
 * Le moteur du tableau des flux IFRS, sur des entrées chiffrées à la main ·
 * le câblage au tableau SYSCOHADA est éprouvé dans `ifrs.service.spec.ts`.
 */
const etat = (exploitation: { legal: number; retraitements: number }, tresorerie: { legal: number; retraitements: number }) =>
  ({
    resultat: [{ cle: 'RESULTAT_OPERATIONNEL', ...exploitation, ifrs: exploitation.legal + exploitation.retraitements }],
    situation: [{ cle: 'SF_TRESORERIE', ...tresorerie, ifrs: tresorerie.legal + tresorerie.retraitements }],
  }) as unknown as EtatsIfrs;
const cafg = (x: Partial<Record<CategorieFlux, number>>): Record<CategorieFlux, number> => ({
  OPERATIONNELLE: 0,
  INVESTISSEMENT: 0,
  FINANCEMENT: 0,
  IMPOTS: 0,
  ABANDONNEES: 0,
  ...x,
});
// Exploitation 100 encaissés, trésorerie 500 → 600.
const base = (): EntreesFluxIfrs => ({
  etat: etat({ legal: 100, retraitements: 0 }, { legal: 600, retraitements: 0 }),
  fluxLegaux: { ZB: 100, ZC: 0, ZF: 0, ZG: 100 },
  cafgParCategorie: cafg({ OPERATIONNELLE: 100 }),
  tresorerie: { ouverture: 500, cloture: 600, horsTresorerieIfrs: [], horsBilanLegal: [], decouvertsInclus: 0, tresoreriePassive: false },
  declarations: { decouvertsDansTresorerie: null, tresorerieEnDevises: false, effetChange: null },
  reservesLegales: [],
});
const M = (t: ReturnType<typeof construireFluxTresorerieIfrs>, cle: string) => t.lignes.find((l) => l.cle === cle)?.montant;

describe('tableau des flux IFRS · le moteur', () => {
  it('le cas simple boucle sans motif', () => {
    const t = construireFluxTresorerieIfrs(base());
    expect([M(t, 'E_TOTAL'), M(t, 'T_VARIATION'), M(t, 'T_CLOTURE'), M(t, 'T_ECART')]).toEqual([100, 100, 600, undefined]);
    expect(t.motifsNonPubliable).toEqual([]);
  });

  it('les impôts restent à l’exploitation (§ 35), les intérêts suivent leur catégorie (§ 34A)', () => {
    const p = base();
    // CAFG 100 = 130 d'exploitation − 20 d'impôt + 5 reçus − 15 versés.
    p.cafgParCategorie = cafg({ OPERATIONNELLE: 130, IMPOTS: -20, INVESTISSEMENT: 5, FINANCEMENT: -15 });
    p.etat = etat({ legal: 130, retraitements: 0 }, { legal: 600, retraitements: 0 });
    const t = construireFluxTresorerieIfrs(p);
    expect([M(t, 'E_IMPOTS'), M(t, 'E_TOTAL'), M(t, 'I_INTERETS_DIVIDENDES'), M(t, 'F_INTERETS'), M(t, 'T_VARIATION')]).toEqual([-20, 110, 5, -15, 100]);
  });

  it('§ 33A · les dividendes versés au financement, lus sur le tableau SYSCOHADA', () => {
    const p = base();
    p.fluxLegaux = { ...p.fluxLegaux, FN: -40, ZF: -40, ZG: 60 };
    p.tresorerie.cloture = 560;
    const t = construireFluxTresorerieIfrs(p);
    expect([M(t, 'F_DIVIDENDES'), M(t, 'F_TOTAL'), M(t, 'T_ECART')]).toEqual([-40, -40, undefined]);
  });

  it('§ 8 · un crédit de trésorerie hors découverts va au financement ; une trésorerie passive non déclarée n’est pas publiable', () => {
    const p = base();
    // Le crédit de trésorerie passe de 0 à 50 (solde créditeur, variation − 50) · la banque monte de 50 de plus.
    p.tresorerie = { ...p.tresorerie, cloture: 650, horsTresorerieIfrs: [{ numero: '56100000', intitule: 'Crédit', activite: 'FINANCEMENT', variation: -50 }], tresoreriePassive: true };
    p.etat = etat({ legal: 100, retraitements: 0 }, { legal: 650, retraitements: 0 });
    const t = construireFluxTresorerieIfrs(p);
    expect([M(t, 'F_CREDITS_TRESORERIE'), M(t, 'F_TOTAL'), M(t, 'T_CLOTURE'), M(t, 'T_ECART')]).toEqual([50, 50, 650, undefined]);
    expect(t.motifsNonPubliable.join(' ')).toMatch(/IAS 7 § 8/);
    p.declarations.decouvertsDansTresorerie = false;
    expect(construireFluxTresorerieIfrs(p).motifsNonPubliable).toEqual([]);
  });

  it('§ 45 · les découverts inclus se rapprochent de la trésorerie de la situation, présentée à l’actif', () => {
    const p = base();
    // Banque 700 à l'actif, découvert de 100 inclus · 600 au tableau.
    p.etat = etat({ legal: 100, retraitements: 0 }, { legal: 700, retraitements: 0 });
    p.tresorerie = { ...p.tresorerie, decouvertsInclus: -100, tresoreriePassive: true };
    p.declarations.decouvertsDansTresorerie = true;
    const t = construireFluxTresorerieIfrs(p);
    expect(t.rapprochementSituation.map((x) => [x.cle, x.montant])).toEqual([['R_SITUATION', 700], ['R_DECOUVERTS', -100], ['R_TABLEAU', 600]]);
    expect(t.mentions.join(' ')).toMatch(/plus les découverts bancaires remboursables à vue \(§ 8\)/);
  });

  it('ce que les flux n’expliquent pas reste sur un écart nommé', () => {
    const p = base();
    p.tresorerie.cloture = 630;
    const t = construireFluxTresorerieIfrs(p);
    expect(M(t, 'T_ECART')).toBe(30);
    expect(t.motifsNonPubliable.join(' ')).toMatch(/30 de variation de trésorerie que les flux n’expliquent pas/);
  });

  it('un retraitement sur la trésorerie, un compte de trésorerie hors bilan légal, des activités abandonnées · non publiable', () => {
    const p = base();
    p.etat = etat({ legal: 100, retraitements: 0 }, { legal: 600, retraitements: 20 });
    p.tresorerie.horsBilanLegal = ['27500000'];
    p.cafgParCategorie = cafg({ OPERATIONNELLE: 90, ABANDONNEES: 10 });
    const t = construireFluxTresorerieIfrs(p);
    expect(M(t, 'E_ABANDONNEES')).toBe(10);
    expect(t.rapprochementSituation.find((x) => x.cle === 'R_RETRAITEMENTS')?.montant).toBe(-20);
    const m = t.motifsNonPubliable.join(' ');
    expect(m).toMatch(/un retraitement modifie la trésorerie/);
    expect(m).toMatch(/27500000 rangé\(s\) en trésorerie sans être de la trésorerie au bilan légal/);
    expect(m).toMatch(/activités abandonnées ne sont pas ventilés/);
  });

  it('sans activité abandonnée, aucune ligne ne l’annonce ; les réserves du tableau SYSCOHADA sont reprises', () => {
    const p = base();
    p.reservesLegales = ['FB · part HAO non séparable'];
    const t = construireFluxTresorerieIfrs(p);
    expect(M(t, 'E_ABANDONNEES')).toBeUndefined();
    expect(t.mentions).toContain('Tableau SYSCOHADA de départ · FB · part HAO non séparable');
  });
});
