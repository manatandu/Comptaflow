import { controlesDeLAgregat, controlesEnEchec } from './controles-agregat-groupe';
import type { BalanceAgregeeGroupe } from './types';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * CE QUI CASSERAIT EN SILENCE SANS CES TESTS.
 *
 * L'agrégat du groupe élimine désormais les opérations réciproques au-delà du
 * seul compte 58. Le serveur rend avec lui six contrôles, dont trois qu'aucun
 * écran ne lisait. Un contrôle rouge qui n'arrive pas jusqu'à l'écran ne
 * lève aucune erreur : le total s'affiche, il est faux, et il a l'air juste.
 *
 * Les tests vérifient que chaque contrôle en échec NOMME ce qu'il faut
 * corriger. Un « ! » sans nom de dossier ne se corrige pas : le siège tient
 * des centaines de cellules.
 */

const VERT: BalanceAgregeeGroupe = {
  exercice: { id: 'ex', dateDebut: '2025-01-01T00:00:00.000Z', dateFin: '2025-12-31T00:00:00.000Z' },
  dossiers: [
    { id: 'm', nom: 'Siège', estMere: true, totalDebit: 1000, totalCredit: 1000, solde58: 0, equilibre: true },
    { id: 'c1', nom: 'Antenne Nord', estMere: false, totalDebit: 500, totalCredit: 500, solde58: 0, equilibre: true },
  ],
  cellulesSansExercice: [],
  cellulesPeriodeDiscordante: [],
  lignes: [],
  totaux: { debit: 1500, credit: 1500 },
  eliminations: [],
  totauxEliminations: { debit: 0, credit: 0 },
  ecartsReciprocite: [],
  rattachementsRefuses: [],
  avertissements: [],
  controles: {
    ecartLiaison: 0,
    liaisonNeutralisee: true,
    tousEquilibres: true,
    periodesConcordantes: true,
    reciprocitesEquilibrees: true,
    ecartElimination: 0,
    eliminationsSymetriques: true,
    rattachementsValides: true,
  },
  detailParDossier: [],
};

const agregat = (partiel: Partial<BalanceAgregeeGroupe>): BalanceAgregeeGroupe => ({
  ...VERT,
  ...partiel,
  controles: { ...VERT.controles, ...(partiel.controles ?? {}) },
});

const parCle = (a: BalanceAgregeeGroupe, cle: string) => controlesDeLAgregat(a).find((c) => c.cle === cle)!;

describe('controlesDeLAgregat · un groupe sans anomalie', () => {
  it('rend les six contrôles, tous au vert et sans détail', () => {
    const rendus = controlesDeLAgregat(VERT);
    expect(rendus.map((c) => c.cle)).toEqual([
      'equilibre',
      'periodes',
      'liaison',
      'rattachements',
      'reciprocites',
      'eliminations',
    ]);
    expect(rendus.every((c) => c.ok)).toBe(true);
    expect(rendus.every((c) => c.detail === null)).toBe(true);
  });

  it('ne met rien en échec · un dossier sans rattachement de cellule est intact', () => {
    // Le cas de TOUS les dossiers existants : aucun tiers ne porte de cellule,
    // rien n'est éliminé, l'agrégat est au centime celui d'avant.
    expect(controlesEnEchec(VERT)).toEqual([]);
  });
});

describe('controlesDeLAgregat · ce que chaque échec doit nommer', () => {
  it('nomme le dossier déséquilibré et ses deux totaux', () => {
    const c = parCle(
      agregat({
        dossiers: [
          VERT.dossiers[0],
          { id: 'c1', nom: 'Antenne Nord', estMere: false, totalDebit: 500, totalCredit: 460, solde58: 0, equilibre: false },
        ],
        controles: { ...VERT.controles, tousEquilibres: false },
      }),
      'equilibre',
    );
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('Antenne Nord');
    expect(c.detail).toContain('500.00');
    expect(c.detail).toContain('460.00');
    // Le siège est équilibré · il n'a rien à faire dans le message.
    expect(c.detail).not.toContain('Siège');
  });

  it('nomme la cellule écartée pour période décalée, avec ses dates', () => {
    const c = parCle(
      agregat({
        cellulesPeriodeDiscordante: [
          { id: 'c2', nom: 'Antenne Sud', dateDebut: '2025-07-01T00:00:00.000Z', dateFin: '2026-06-30T00:00:00.000Z' },
        ],
        controles: { ...VERT.controles, periodesConcordantes: false },
      }),
      'periodes',
    );
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('Antenne Sud');
    // La date est DÉCOUPÉE de la chaîne ISO, jamais relue par `new Date()` ·
    // à l'ouest de Greenwich, minuit UTC recule d'un jour et l'écran
    // accuserait la cellule d'une période qu'elle n'a pas.
    expect(c.detail).toContain('01/07/2025');
    expect(c.detail).toContain('30/06/2026');
  });

  it('chiffre l’écart des virements internes (58)', () => {
    const c = parCle(agregat({ controles: { ...VERT.controles, liaisonNeutralisee: false, ecartLiaison: -1250.5 } }), 'liaison');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('-1250.50');
    expect(c.detail).toContain('un seul côté');
  });

  it('nomme le tiers dont le rattachement a été ignoré, et dit que rien n’a été éliminé', () => {
    // Éliminer sur la foi d'un rattachement hors groupe retirerait de
    // l'agrégat une vente RÉELLE · le refus doit s'expliquer.
    const c = parCle(
      agregat({
        rattachementsRefuses: [
          { dossier: 'Siège', codeTiers: 'C0042', nomTiers: 'Paroisse voisine', motif: 'le dossier désigné n’appartient pas à ce groupe' },
        ],
        controles: { ...VERT.controles, rattachementsValides: false },
      }),
      'rattachements',
    );
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('C0042');
    expect(c.detail).toContain('Paroisse voisine');
    expect(c.detail).toContain('n’appartient pas à ce groupe');
    expect(c.detail).toContain('rien n’a été éliminé');
  });

  it('nomme les deux dossiers d’une réciprocité qui ne se boucle pas, et son écart', () => {
    const c = parCle(
      agregat({
        ecartsReciprocite: [
          { dossier: 'Antenne Nord', contrepartie: 'Siège', solde: 800, soldeContrepartie: -750, ecart: 50 },
        ],
        controles: { ...VERT.controles, reciprocitesEquilibrees: false },
      }),
      'reciprocites',
    );
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('Antenne Nord');
    expect(c.detail).toContain('Siège');
    expect(c.detail).toContain('50.00');
    expect(c.detail).toContain('deux montants différents');
  });

  it('chiffre l’élimination boiteuse par son écart ET ses deux totaux', () => {
    const c = parCle(
      agregat({
        totauxEliminations: { debit: 900, credit: 850 },
        controles: { ...VERT.controles, eliminationsSymetriques: false, ecartElimination: 50 },
      }),
      'eliminations',
    );
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('50.00');
    expect(c.detail).toContain('900.00');
    expect(c.detail).toContain('850.00');
  });
});

describe('controlesEnEchec', () => {
  it('ne garde que ce qui appelle un geste', () => {
    const rendus = controlesEnEchec(
      agregat({ controles: { ...VERT.controles, reciprocitesEquilibrees: false, liaisonNeutralisee: false } }),
    );
    expect(rendus.map((c) => c.cle)).toEqual(['liaison', 'reciprocites']);
  });
});
