import { RESERVE_INDEMNITE_LOGEMENT_KINSHASA, reserveIndemniteLogementKinshasa } from './indemnite-logement-kinshasa';

/**
 * PASSE F11 · l'indemnité de logement versée à Kinshasa porte une obligation
 * de l'employeur (arrêté provincial n° 016/2023, art. 3 et 7).
 */
describe('Passe F11 · indemnité de logement et relevé à la DGRK', () => {
  const indemnite = [{ nature: 'LOGEMENT_OU_SON_INDEMNITE', montantFc: 300_000 }];

  it('servie à un siège de Kinshasa qui verse une indemnité, depuis janvier 2024', () => {
    expect(reserveIndemniteLogementKinshasa(indemnite, 'Kinshasa / Gombe', '2026-03')).toBe(
      RESERVE_INDEMNITE_LOGEMENT_KINSHASA,
    );
    expect(RESERVE_INDEMNITE_LOGEMENT_KINSHASA).toMatch(/dix jours du paiement/);
    expect(RESERVE_INDEMNITE_LOGEMENT_KINSHASA).toContain('art. 4, al. 2');
    expect(RESERVE_INDEMNITE_LOGEMENT_KINSHASA).toMatch(/100 USD par jour/);
    expect(RESERVE_INDEMNITE_LOGEMENT_KINSHASA).toMatch(/dû par le bénéficiaire/);
  });

  it('rien ailleurs, rien avant 2024, rien pour un logement en nature ou sans indemnité', () => {
    expect(reserveIndemniteLogementKinshasa(indemnite, 'Lubumbashi', '2026-03')).toBeNull();
    expect(reserveIndemniteLogementKinshasa(indemnite, null, '2026-03')).toBeNull();
    expect(reserveIndemniteLogementKinshasa(indemnite, 'Kinshasa', '2023-12')).toBeNull();
    expect(
      reserveIndemniteLogementKinshasa([{ ...indemnite[0], enNature: true }], 'Kinshasa', '2026-03'),
    ).toBeNull();
    expect(
      reserveIndemniteLogementKinshasa([{ nature: 'SALAIRE_OU_TRAITEMENT', montantFc: 1 }], 'Kinshasa', '2026-03'),
    ).toBeNull();
  });
});
