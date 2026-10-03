import {
  RESERVE_NET_NON_CHIFFRE,
  RESERVE_PRET_EXIGIBILITE,
  RESERVE_SAISIE_NON_PROPOSEE,
  avertissementsSoldesRestants,
  moisEntiersDeService,
  motifRefusGratificationStipulee,
  motifRefusIndemniteStipulee,
  propositionGratification,
  propositionRetenuesDecompte,
  type AvanceARetenir,
} from './decompte-retenues-stipulations';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const AVANCE: AvanceARetenir = { avanceId: 'a1', type: 'AVANCE', dateOctroi: '2026-11-10', libelle: 'Avance du 2026-11-10', soldeFc: 300_000 };
const PRET: AvanceARetenir = { avanceId: 'p1', type: 'PRET', dateOctroi: '2026-03-01', libelle: 'Prêt du 2026-03-01', soldeFc: 450_000.5 };
const SAISIE: AvanceARetenir = { avanceId: 's1', type: 'SAISIE_ARRET', dateOctroi: '2026-05-01', libelle: 'Saisie-arrêt', soldeFc: 90_000 };

describe("A18 · retenues d'avance et de prêt proposées au décompte (Code du travail, art. 112, c et f)", () => {
  it("propose le solde entier quand le net le porte · avances (c) avant prêts (f), plus ancien d'abord", () => {
    const acompte: AvanceARetenir = { avanceId: 'a0', type: 'ACOMPTE', dateOctroi: '2026-12-01', libelle: 'Acompte', soldeFc: 50_000 };
    const p = propositionRetenuesDecompte([PRET, acompte, AVANCE], 2_000_000);
    expect(p.retenues.map((r) => [r.avanceId, r.littera, r.montantProposeFc])).toEqual([
      ['a1', 'c', 300_000],
      ['a0', 'c', 50_000],
      ['p1', 'f', 450_000.5],
    ]);
    expect(p.resteNonRetenuFc).toBe(0);
    expect(p.retenues.find((r) => r.avanceId === 'p1')?.reserve).toContain(RESERVE_PRET_EXIGIBILITE);
    expect(p.retenues.find((r) => r.avanceId === 'a1')?.reserve).toBeNull();
  });

  it('ne dépasse jamais le net disponible · le reste demeure dû au registre, dit sur la ligne', () => {
    const p = propositionRetenuesDecompte([AVANCE, PRET], 400_000);
    expect(p.retenues.map((r) => r.montantProposeFc)).toEqual([300_000, 100_000]);
    expect(p.resteNonRetenuFc).toBe(350_000.5);
    expect(p.retenues[1].reserve).toContain('Ramenée de 450000.50 FC à 100000.00 FC');
  });

  it('un net nul ou négatif ne laisse rien à retenir, jamais un net négatif', () => {
    const p = propositionRetenuesDecompte([AVANCE], -10);
    expect(p.retenues[0].montantProposeFc).toBe(0);
    expect(p.resteNonRetenuFc).toBe(300_000);
  });

  it("net non chiffré · le solde est proposé et la réserve le dit (null n'est pas zéro)", () => {
    const p = propositionRetenuesDecompte([AVANCE], null);
    expect(p.retenues[0].montantProposeFc).toBe(300_000);
    expect(p.reserves).toContain(RESERVE_NET_NON_CHIFFRE);
  });

  it("la saisie-arrêt n'est jamais proposée · nommée, renvoyée à l'acte", () => {
    const p = propositionRetenuesDecompte([SAISIE, AVANCE], 1_000_000);
    expect(p.retenues.map((r) => r.avanceId)).toEqual(['a1']);
    expect(p.saisiesNonProposees).toEqual([{ avanceId: 's1', libelle: 'Saisie-arrêt', soldeFc: 90_000 }]);
    expect(p.reserves).toContain(RESERVE_SAISIE_NON_PROPOSEE);
  });

  it('une avance soldée ne propose rien', () => {
    expect(propositionRetenuesDecompte([{ ...AVANCE, soldeFc: 0 }], 1_000).retenues).toEqual([]);
  });

  it("l'émission avertit d'un solde que le décompte ne retient pas, jamais d'une saisie", () => {
    const a = avertissementsSoldesRestants([AVANCE, PRET, SAISIE], { a1: 300_000, p1: 100_000 });
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('350000.50 FC restent dus');
    expect(a[0]).toContain('art. 112, f');
  });
});

describe('A18 · gratification stipulée, prorata proposé', () => {
  const G = { montantAnnuelFc: 1_200_000, source: 'Contrat, art. 6', debutPeriode: '2027-01-01', finPeriode: '2027-03-31' };

  it('mois entiers date à date · jamais trente jours, jamais un mois entamé', () => {
    expect(moisEntiersDeService(d('2027-01-01'), d('2027-03-31'))).toBe(3);
    expect(moisEntiersDeService(d('2027-03-15'), d('2027-04-14'))).toBe(1);
    expect(moisEntiersDeService(d('2027-03-15'), d('2027-04-13'))).toBe(0);
    // Le 31 janvier a pour anniversaire le 28 février (date qui manque) · servi
    // jusqu'au 27 inclus, le mois est entier ; jusqu'au 26, il ne l'est pas.
    expect(moisEntiersDeService(d('2027-01-31'), d('2027-02-26'))).toBe(0);
    expect(moisEntiersDeService(d('2027-01-31'), d('2027-02-27'))).toBe(1);
    expect(moisEntiersDeService(d('2027-01-31'), d('2027-03-30'))).toBe(2);
    expect(moisEntiersDeService(d('2027-01-01'), d('2027-12-31'))).toBe(12);
    expect(moisEntiersDeService(d('2027-02-01'), d('2027-01-01'))).toBe(0);
  });

  it('propose montant annuel × mois entiers / 12, base dite', () => {
    const p = propositionGratification(G);
    expect(p).toEqual(expect.objectContaining({ montantFc: 300_000, moisEntiers: 3 }));
    expect(p?.base).toContain('Contrat, art. 6');
    expect(p?.base).toContain('× 3 mois entiers');
  });

  it('arrondit au centime', () => {
    expect(propositionGratification({ ...G, montantAnnuelFc: 1_000_000, finPeriode: '2027-01-31' })?.montantFc).toBe(83_333.33);
  });

  it('sans source, sans montant ou au-delà de douze mois · refus nommé, aucune proposition (jamais zéro inventé)', () => {
    expect(motifRefusGratificationStipulee({ ...G, source: ' ' })).toMatch(/source/);
    expect(propositionGratification({ ...G, source: '' })).toBeNull();
    expect(motifRefusGratificationStipulee({ ...G, montantAnnuelFc: 0 })).toMatch(/positif/);
    expect(motifRefusGratificationStipulee({ ...G, finPeriode: '2028-02-15' })).toMatch(/douze mois/);
    expect(motifRefusGratificationStipulee({ ...G, finPeriode: '2027-02-30' })).toMatch(/illisibles/);
    expect(motifRefusGratificationStipulee({ ...G, finPeriode: '2026-12-31' })).toMatch(/précède/);
  });
});

describe('A18 · indemnité de fin de contrat stipulée, jamais calculée', () => {
  it('exige montant positif et source', () => {
    expect(motifRefusIndemniteStipulee({ montantFc: 500_000, source: 'Contrat, art. 12' })).toBeNull();
    expect(motifRefusIndemniteStipulee({ montantFc: 500_000, source: '' })).toMatch(/source/);
    expect(motifRefusIndemniteStipulee({ montantFc: 0, source: 'x' })).toMatch(/positif/);
  });
});
