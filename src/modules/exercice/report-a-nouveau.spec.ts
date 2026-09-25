import { budgetsAReporter, CompteRan, lignesReportANouveau, resultatDesComptesDeGestion } from './report-a-nouveau';

const l = (debit: number, credit: number, lettre: string | null = null) => ({
  debit,
  credit,
  lettre,
  libelle: 'L',
  dateEcheance: null,
});
const comptes: CompteRan[] = [
  { id: '601', numero: '601', intitule: 'Achats', modeReportANouveau: 'AUCUN', lignes: [l(1000, 0)] },
  { id: '701', numero: '701', intitule: 'Ventes', modeReportANouveau: 'AUCUN', lignes: [l(0, 1500)] },
  { id: '521', numero: '521', intitule: 'Banque', modeReportANouveau: 'SOLDE', lignes: [l(1500, 0), l(0, 1000)] },
  { id: '131', numero: '131', intitule: 'Excédent', modeReportANouveau: 'SOLDE', lignes: [] },
  { id: '411', numero: '411', intitule: 'Clients', modeReportANouveau: 'DETAIL', lignes: [l(300, 0), l(200, 0, 'AA')] },
  { id: '401', numero: '401', intitule: 'Fournisseurs', modeReportANouveau: 'DETAIL', lignes: [l(0, 300)] },
];

describe('Report à-nouveau · un seul calcul pour la clôture et le provisoire', () => {
  it('le résultat est lu sur les comptes de gestion · négatif = excédent', () => {
    expect(resultatDesComptesDeGestion(comptes)).toBe(-500);
  });

  it('reporte les soldes, le détail non lettré, et le résultat sur son compte · le report s’équilibre', () => {
    const r = lignesReportANouveau(comptes, { compteId: '131', montant: -500 });
    expect(r.find((x) => x.compteId === '521')).toMatchObject({ debit: 500, credit: 0 });
    expect(r.find((x) => x.compteId === '131')).toMatchObject({ debit: 0, credit: 500 });
    expect(r.filter((x) => x.compteId === '411')).toHaveLength(1); // la ligne lettrée ne passe pas
    expect(r.some((x) => x.compteId === '601' || x.compteId === '701')).toBe(false);
    const d = r.reduce((s, x) => s + x.debit, 0);
    const c = r.reduce((s, x) => s + x.credit, 0);
    expect(d).toBe(c);
  });

  it("reporte un budget sans jamais écraser celui déjà saisi, ni doter une convention close", () => {
    const r = budgetsAReporter(
      [
        { sectionId: 'a', mois: null, montant: 100 },
        { sectionId: 'b', mois: null, montant: 200 },
        { sectionId: 'c', mois: 3, montant: 30 },
      ],
      [{ sectionId: 'a', mois: null }],
      new Set(['b']),
    );
    expect(r).toEqual([{ sectionId: 'c', mois: 3, montant: 30 }]);
  });
});
