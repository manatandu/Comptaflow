import {
  AbonnementAFacturer,
  finEssaiDepuis,
  numeroFactureSuivant,
  premierePeriodeFacturable,
  verdictPeriode,
} from './facturation-abonnements';

const ESSENTIEL = { code: 'ESSENTIEL', libelle: 'Essentiel', type: 'FORMULE' as const, prixMensuelUsd: 20, prixAnnuelUsd: 200 };
const PAIE = { code: 'PAIE', libelle: 'Paie', type: 'OPTION' as const, prixMensuelUsd: 10, prixAnnuelUsd: 100 };
const SUPP = { code: 'DOSSIER_SUPPLEMENTAIRE', libelle: 'Dossier supplémentaire', type: 'OPTION' as const, prixMensuelUsd: 12, prixAnnuelUsd: null };

const abo = (x: Partial<AbonnementAFacturer> = {}): AbonnementAFacturer => ({
  formule: ESSENTIEL,
  options: [],
  dossiersSupplementaires: 0,
  periodicite: 'MENSUELLE',
  debut: '2026-10-01',
  finEssai: null,
  actif: true,
  ...x,
});

describe('facturation des abonnements', () => {
  it('trente jours d’essai · le mois où l’essai finit reste gratuit', () => {
    expect(finEssaiDepuis('2026-10-01')).toBe('2026-10-31');
    expect(premierePeriodeFacturable('2026-10-01', '2026-10-31')).toBe('2026-11');
    expect(premierePeriodeFacturable('2026-10-01', '2026-11-01')).toBe('2026-11');
    const a = abo({ finEssai: '2026-10-31' });
    expect(verdictPeriode(a, '2026-10')).toEqual({ du: false, motif: "En essai jusqu'au 2026-10-31." });
    expect(verdictPeriode(a, '2026-11').du).toBe(true);
  });

  it('un début en cours de mois ne facture pas le mois entamé', () => {
    expect(premierePeriodeFacturable('2026-10-15', null)).toBe('2026-11');
    expect(premierePeriodeFacturable('2026-12-02', null)).toBe('2027-01');
  });

  it('additionne formule et options, au prix de la périodicité', () => {
    const v = verdictPeriode(abo({ options: [PAIE] }), '2026-10');
    expect(v).toMatchObject({ du: true, totalUsd: 30 });
    const an = verdictPeriode(abo({ options: [PAIE], periodicite: 'ANNUELLE' }), '2026-10');
    expect(an).toMatchObject({ du: true, totalUsd: 300 });
  });

  it('l’annuel ne revient que tous les douze mois', () => {
    const a = abo({ periodicite: 'ANNUELLE' });
    expect(verdictPeriode(a, '2026-11').du).toBe(false);
    expect(verdictPeriode(a, '2027-04').du).toBe(false);
    expect(verdictPeriode(a, '2027-09').du).toBe(false);
    expect(verdictPeriode(a, '2027-10').du).toBe(true);
  });

  it('compte les dossiers supplémentaires en quantité', () => {
    const v = verdictPeriode(abo({ options: [SUPP], dossiersSupplementaires: 3 }), '2026-10');
    expect(v).toMatchObject({ du: true, totalUsd: 20 + 36 });
    if (v.du) expect(v.lignes.find((l) => l.designation.includes('supplémentaire'))?.quantite).toBe(3);
  });

  it('un prix non fixé refuse la période entière, jamais une facture amputée', () => {
    const v = verdictPeriode(abo({ options: [SUPP], dossiersSupplementaires: 1, periodicite: 'ANNUELLE' }), '2026-10');
    expect(v).toEqual({ du: false, motif: 'Prix annuel non fixé · Dossier supplémentaire.' });
    expect(verdictPeriode(abo({ formule: { ...ESSENTIEL, prixMensuelUsd: null } }), '2026-10').du).toBe(false);
  });

  it('rien avant le début, rien sur un abonnement suspendu', () => {
    expect(verdictPeriode(abo(), '2026-09').du).toBe(false);
    expect(verdictPeriode(abo({ actif: false }), '2026-10').du).toBe(false);
  });

  it('numérote en continu par année', () => {
    expect(numeroFactureSuivant('2026', [])).toBe('VMG-2026-0001');
    expect(numeroFactureSuivant('2026', ['VMG-2026-0004', 'VMG-2025-0009', 'F-12'])).toBe('VMG-2026-0005');
  });
});
