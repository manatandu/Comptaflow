import { contestationPerimee, contestationPrecochee } from './contestation-precochee';

/** LIGNE A5, DIXIÈME RELECTURE (4) · la case ne se précoche que sur un figé égal au module du jour. */
describe('case de contestation à la retouche', () => {
  const contestee = (fige: number | null) => ({ provisionModuleContestee: true, provisionModuleContesteeMontant: fige });
  it('figé égal au module du jour · précochée', () => {
    expect(contestationPrecochee(contestee(100_000), 100_000)).toBe(true);
    expect(contestationPerimee(contestee(100_000), 100_000)).toBe(false);
  });
  it('figé différent · décochée, et dite périmée', () => {
    expect(contestationPrecochee(contestee(50_000), 150_000)).toBe(false);
    expect(contestationPerimee(contestee(50_000), 150_000)).toBe(true);
  });
  it('figé absent, ou version non contestée · décochée', () => {
    expect(contestationPrecochee(contestee(null), 0)).toBe(false);
    expect(contestationPrecochee({ provisionModuleContestee: false, provisionModuleContesteeMontant: null }, 0)).toBe(false);
    expect(contestationPrecochee(undefined, 0)).toBe(false);
  });
});
