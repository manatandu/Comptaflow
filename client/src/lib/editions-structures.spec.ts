import { readFileSync } from 'fs';
import { join } from 'path';
import { editionJournaux, editionParametres, editionPlan, editionTaux, editionTiers, perimetreEdition } from './editions-structures';
import type { Compte, Journal, ParametresDossier, TauxTva, Tiers } from './types';

/**
 * POINT 18 · éditions des structures. Deux règles : une liste à plat, jamais
 * l'écran imprimé ; et le périmètre dit, pour qu'une liste filtrée ne se lise
 * jamais comme la liste entière.
 */
describe('Éditions des structures', () => {
  const compte = (numero: string, extra: Partial<Compte> = {}) =>
    ({ numero, intitule: `Compte ${numero}`, typeCompte: 'DETAIL', modeReportANouveau: 'SOLDE', lettrable: false, estActif: true, nature: null, ...extra }) as Compte;

  it('le plan se trie par numéro et garde les comptes en sommeil, dits comme tels', () => {
    const e = editionPlan([compte('52110000'), compte('10', { typeCompte: 'TOTAL' }), compte('40110000', { estActif: false, lettrable: true, modeReportANouveau: 'DETAIL', nature: 'Fournisseurs' })]);
    expect(e.lignes.map((l) => l[0])).toEqual(['10', '40110000', '52110000']);
    expect(e.lignes[0][2]).toBe('Total');
    expect(e.lignes[1]).toEqual(['40110000', 'Compte 40110000', 'Détail', 'Fournisseurs', 'Détail', 'Oui', 'En sommeil']);
  });

  it('le tiers porte son compte PRINCIPAL, pas le premier rattaché', () => {
    const t = {
      code: 'F01',
      nom: 'Fournisseur',
      type: 'FOURNISSEUR',
      estActif: true,
      ville: 'Kinshasa',
      telephone: null,
      numeroImpot: 'A123',
      comptesRattaches: [
        { estPrincipal: false, compte: { numero: '40810000' } },
        { estPrincipal: true, compte: { numero: '40110001' } },
      ],
    } as unknown as Tiers;
    expect(editionTiers([t]).lignes[0]).toEqual(['F01', 'Fournisseur', 'Fournisseur', '40110001', 'Kinshasa', '', 'A123', 'Actif']);
  });

  it('la contrepartie à chaque ligne ne se dit que d’un journal de trésorerie', () => {
    const j = (code: string, type: Journal['type'], contrepartieChaqueLigne?: boolean) =>
      ({ code, intitule: code, type, numerotation: 'CONTINUE_JOURNAL', estActif: true, compteTresorerie: null, contrepartieChaqueLigne }) as Journal;
    const e = editionJournaux([j('BQ', 'TRESORERIE', true), j('ACH', 'ACHATS', true)]);
    expect(e.lignes[0][5]).toBe('');
    expect(e.lignes[1][5]).toBe('Oui');
  });

  it('le taux s’imprime en pourcentage', () => {
    const e = editionTaux([{ code: 'N', intitule: 'Normal', taux: '16.00', estActif: true, compteCollecte: { numero: '44310000' }, compteDeductible: null } as unknown as TauxTva]);
    expect(e.lignes[0]).toEqual(['N', 'Normal', '16 %', '44310000', '', 'Actif']);
  });

  it('le périmètre dit la sélection, ou la liste complète, avec le nombre', () => {
    expect(perimetreEdition([['Recherche', '  401 '], ['Type', null]], 3, 'compte')).toBe('Sélection · Recherche « 401 » · 3 comptes');
    expect(perimetreEdition([], 1, 'journal', 'journaux')).toBe('Liste complète · 1 journal');
    expect(perimetreEdition([['Recherche', '']], 2, 'journal', 'journaux')).toBe('Liste complète · 2 journaux');
  });

  it('les paramètres disent « non renseigné » et suivent le référentiel', () => {
    const base = {
      nom: 'Démo', referentiel: 'SYSCOHADA', activite: null, adresse: null, ville: null, pays: 'RD Congo', telephone: null, email: null, siteWeb: null,
      capitalSocial: 1000000, capitalVariable: true, rccm: null, numeroImpot: null, idNat: null, devise: 'CDF', deviseFonctionnelle: null,
      longueurCompte: 8, assujettiTva: false, doubleRegardValidation: false,
    } as unknown as ParametresDossier;
    const s = editionParametres(base, { jeuOuSysteme: 'Système normal', forme: null });
    const cles = s.lignes.map((l) => l[0]);
    expect(s.lignes.find((l) => l[0] === 'Forme juridique')?.[1]).toBe('non renseigné');
    expect(s.lignes.find((l) => l[0] === 'Capital social')?.[1]).toBe(`${(1000000).toLocaleString('fr-FR')} CDF · à capital variable`);
    expect(cles).toContain('RCCM');
    expect(cles).not.toContain('Enregistrement sectoriel');
    const e = editionParametres({ ...base, referentiel: 'SYCEBNL' } as ParametresDossier, { jeuOuSysteme: null, forme: 'Association' });
    expect(e.lignes.map((l) => l[0])).toContain('Enregistrement sectoriel');
    expect(e.lignes.map((l) => l[0])).not.toContain('Capital social');
    expect(e.lignes[2][0]).toBe("Jeu d'états financiers");
  });

  it('les cinq fenêtres portent leur édition et n’impriment qu’elle', () => {
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8');
    expect(css).toMatch(/\.avec-edition > \*:not\(\.impression-seul\)\s*\{\s*display: none !important;/);
    for (const [page, fonction] of [
      ['PlanComptesPage', 'editionPlan('],
      ['TiersPage', 'editionTiers('],
      ['JournauxPage', 'editionJournaux('],
      ['TauxTvaPage', 'editionTaux('],
      ['ParametresDossierPage', 'editionParametres('],
    ]) {
      const src = readFileSync(join(__dirname, `../pages/${page}.tsx`), 'utf8');
      expect(src).toContain('avec-edition');
      expect(src).toContain(fonction);
      expect(src).toContain('<BoutonImprimer');
    }
  });
});

describe('Impression · la seule fenêtre active', () => {
  it('une fenêtre inactive porte la classe qui la retire du papier', () => {
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8');
    const fenetre = readFileSync(join(__dirname, '../components/chrome/Fenetre.tsx'), 'utf8');
    expect(css).toMatch(/@media print[\s\S]*\.fenetre-inactive \{\s*display: none !important;/);
    expect(fenetre).toContain("${active ? '' : 'fenetre-inactive'}");
  });
});
