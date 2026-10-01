import { NatureLocationAcquisition } from '@prisma/client';
import { ContratSaisi, construireEcheancier } from './echeancier-location-acquisition';
import { ventilerExercice } from './cloture-location-acquisition';

/**
 * LA CLÔTURE (§ 2.1.8.2) · le 623 se vire au 17 pour le capital et au 672
 * pour les intérêts, au centime ; les courus vont au 176 et s'extournent à
 * l'ouverture (fiche du compte 17). Rejoué sur l'exemple du § 2.1.4.
 */
const EXEMPLE: ContratSaisi = {
  nature: NatureLocationAcquisition.CREDIT_BAIL_MOBILIER,
  datePriseEffet: new Date('2026-01-01T00:00:00Z'),
  dureeMois: 96,
  periodicite: 'ANNUELLE',
  termeAEchoir: false,
  loyer: 90000,
  prixOption: 0,
  optionRaisonnablementCertaine: true,
  bienDeFaibleValeur: false,
  tauxAnnuel: 0.0786,
};
const ex = (an: number) => ({ dateDebut: new Date(`${an}-01-01T00:00:00Z`), dateFin: new Date(`${an}-12-31T00:00:00Z`) });
const ventiler = (c: ContratSaisi, an: number) => {
  const e = construireEcheancier(c);
  return ventilerExercice(e.lignes, c.datePriseEffet, e.dette, e.tauxPeriodique, ex(an));
};

describe('clôture · loyers échus et intérêts courus', () => {
  it('loyers échus au 31/12 · le 623 se vire en entier, 17 + 672 = loyer', () => {
    // Prise d'effet au 31/12/2025 · le premier loyer échoit le 31/12/2026.
    const c = { ...EXEMPLE, datePriseEffet: new Date('2025-12-31T00:00:00Z') };
    const v = ventiler(c, 2026);
    expect(v.rangs).toEqual([1]);
    expect(v.loyers).toBe(90000);
    expect(v.capital + v.interets).toBe(90000);
    expect(v.interets).toBeCloseTo(519956.68 * 0.0786, 0);
    // Échéance le jour de la clôture · rien ne court au-delà.
    expect(v.interetsCourus).toBe(0);
  });

  it('premier loyer en N+1 · rien à virer, une année entière d’intérêts court', () => {
    const v = ventiler(EXEMPLE, 2026);
    expect(v.loyers).toBe(0);
    expect(v.interetsCourus).toBeCloseTo(519956.68 * 0.0786, 0);
  });

  it('l’année suivante, le loyer échu porte les intérêts de l’année passée · d’où l’extourne', () => {
    const e = construireEcheancier(EXEMPLE);
    const v2027 = ventiler(EXEMPLE, 2027);
    expect(v2027.rangs).toEqual([1]);
    expect(v2027.interets).toBe(e.lignes[0].interets);
    // Courus 2026 = intérêts du loyer de janvier 2027 · extournés, la charge de 2027 ne les compte pas deux fois.
    expect(ventiler(EXEMPLE, 2026).interetsCourus).toBeCloseTo(e.lignes[0].interets, 0);
  });

  it('loyers mensuels · douze échéances, une fraction de mois court', () => {
    const c = { ...EXEMPLE, datePriseEffet: new Date('2026-01-15T00:00:00Z'), periodicite: 'MENSUELLE' as const, loyer: 7000 };
    const v = ventiler(c, 2026);
    expect(v.rangs).toHaveLength(11);
    expect(v.loyers).toBe(77000);
    expect(v.interetsCourus).toBeGreaterThan(0);
    const e = construireEcheancier(c);
    // Du 15 au 31 décembre, environ la moitié d'un mois d'intérêts sur le restant.
    expect(v.interetsCourus).toBeLessThan(e.lignes[11].interets);
  });

  it('l’option n’est pas un loyer · sa ligne reste à la levée', () => {
    const c = { ...EXEMPLE, datePriseEffet: new Date('2018-12-31T00:00:00Z'), prixOption: 5000 };
    const v = ventiler(c, 2026);
    expect(v.rangs).toEqual([8]);
    expect(v.loyers).toBe(90000);
  });

  it('option levée · le prix entre avec la dernière échéance ; non levée · jamais, et rien ne court vers lui', () => {
    const c = { ...EXEMPLE, datePriseEffet: new Date('2018-12-31T00:00:00Z'), prixOption: 5000 };
    const e = construireEcheancier(c);
    const v = (levee: boolean | null, an: number) => ventilerExercice(e.lignes, c.datePriseEffet, e.dette, e.tauxPeriodique, ex(an), levee);
    expect(v(true, 2026)).toMatchObject({ rangs: [8, 9], loyers: 95000, optionNonDeclaree: false });
    expect(v(false, 2026)).toMatchObject({ rangs: [8], loyers: 90000, optionNonDeclaree: false });
    expect(v(null, 2026).optionNonDeclaree).toBe(true);
    // Option à échoir l'an suivant (terme à échoir) · non levée, aucun intérêt ne court vers elle.
    const d = { ...c, termeAEchoir: true, datePriseEffet: new Date('2019-01-01T00:00:00Z') };
    const f = construireEcheancier(d);
    const w = (levee: boolean | null) => ventilerExercice(f.lignes, d.datePriseEffet, f.dette, f.tauxPeriodique, ex(2026), levee);
    expect(w(null).interetsCourus).toBeGreaterThan(0);
    expect(w(false).interetsCourus).toBe(0);
  });
});
