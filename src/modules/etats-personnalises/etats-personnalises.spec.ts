import { calculerColonne, motifRefusDefinition, type LigneBalanceEtat, type LigneDefinition } from './moteur-etat-personnalise';
import { EtatsPersonnalisesService } from './etats-personnalises.service';

/**
 * POINT 20 · états personnalisés. Une définition de rubriques et de totaux,
 * calculée sur un à cinq exercices.
 */
const b = (numero: string, totalDebit: number, totalCredit: number, mouvementDebit = totalDebit, mouvementCredit = totalCredit): LigneBalanceEtat => ({
  numero,
  totalDebit,
  totalCredit,
  mouvementDebit,
  mouvementCredit,
});

const DEF: LigneDefinition[] = [
  { cle: 'CA', libelle: "Chiffre d'affaires", racines: '70 -709', mesure: 'MOUVEMENT', sens: 'CREDIT' },
  { cle: 'ACHATS', libelle: 'Achats', racines: '60', mesure: 'MOUVEMENT', sens: 'DEBIT' },
  { cle: 'MARGE', libelle: 'Marge', total: 'CA-ACHATS' },
  { cle: 'TRESO', libelle: 'Trésorerie', racines: '52 57', mesure: 'SOLDE', sens: 'DEBIT' },
];

describe('État personnalisé · la définition', () => {
  it('une définition bien formée passe', () => {
    expect(motifRefusDefinition(DEF)).toBeNull();
  });

  it('un total ne cite qu’une ligne PRÉCÉDENTE', () => {
    expect(motifRefusDefinition([{ cle: 'T', libelle: 'T', total: 'A' }, { cle: 'A', libelle: 'A', racines: '6', mesure: 'MOUVEMENT', sens: 'DEBIT' }])).toMatch(
      /PRÉCÉDENTE/,
    );
    expect(motifRefusDefinition([{ cle: 'T', libelle: 'T', total: 'T' }])).toMatch(/PRÉCÉDENTE/);
  });

  it('refuse racine doublée, clé doublée, ligne à la fois rubrique et total, racine non numérique', () => {
    expect(motifRefusDefinition([{ cle: 'A', libelle: 'A', racines: '70 70', mesure: 'SOLDE', sens: 'DEBIT' }])).toMatch(/deux fois/);
    expect(motifRefusDefinition([DEF[0], { ...DEF[0] }])).toMatch(/employée deux fois/);
    expect(motifRefusDefinition([{ cle: 'A', libelle: 'A', racines: '70', total: 'B', mesure: 'SOLDE', sens: 'DEBIT' }])).toMatch(/pas les deux/);
    expect(motifRefusDefinition([{ cle: 'A', libelle: 'A', racines: '7O', mesure: 'SOLDE', sens: 'DEBIT' }])).toMatch(/illisibles/);
    expect(motifRefusDefinition([{ cle: 'A', libelle: 'A', racines: '70' } as LigneDefinition])).toMatch(/mesure/);
    expect(motifRefusDefinition([])).toMatch(/au moins une ligne/);
  });
});

describe('État personnalisé · le calcul', () => {
  const balance = [
    b('70110000', 0, 1000),
    b('70910000', 50, 0), // rabais accordés, EXCLUS par « -709 »
    b('60110000', 400, 0),
    b('52110000', 900, 100, 300, 100), // solde 800, mouvement 200
    b('57110000', 70, 0),
    // Clôture · le solde du 70 a été viré, le total est nul, le mouvement non.
    b('70120000', 500, 500, 0, 500),
  ];

  it('le sens, la racine négative, le total et les deux mesures', () => {
    expect(calculerColonne(DEF, balance)).toEqual({ CA: 1500, ACHATS: 400, MARGE: 1100, TRESO: 870 });
    // Sans l'exclusion, les rabais viennent EN DÉDUCTION du chiffre d'affaires.
    expect(calculerColonne([{ ...DEF[0], racines: '70' }], balance).CA).toBe(1450);
  });

  it('la racine la plus longue décide, quel que soit l’ordre · « -709 70 » vaut « 70 -709 »', () => {
    expect(calculerColonne([{ ...DEF[0], racines: '-709 70' }], balance).CA).toBe(1500);
    // « -7011 » n'écarte que le 7011 · le 709 reste inclus par « 70 » et vient en déduction.
    expect(calculerColonne([{ ...DEF[0], racines: '70 -7011' }], balance).CA).toBe(450);
  });

  it('une rubrique faite d’exclusions seules est refusée', () => {
    expect(motifRefusDefinition([{ cle: 'R', libelle: 'R', racines: '-709', mesure: 'MOUVEMENT', sens: 'DEBIT' }])).toMatch(/au moins une racine incluse/);
  });

  it('MOUVEMENT exclut la clôture, SOLDE la reprend', () => {
    const def: LigneDefinition[] = [
      { cle: 'M', libelle: 'M', racines: '70120000', mesure: 'MOUVEMENT', sens: 'CREDIT' },
      { cle: 'S', libelle: 'S', racines: '70120000', mesure: 'SOLDE', sens: 'CREDIT' },
    ];
    const v = calculerColonne(def, balance);
    expect(v).toEqual({ M: 500, S: 0 });
    expect(Object.is(v.S, -0)).toBe(false);
  });
});

describe('État personnalisé · le service', () => {
  const monter = (lignes: unknown = DEF) => {
    const balances: string[] = [];
    const prisma = {
      etatPersonnalise: { findFirst: async () => ({ id: 'e1', nom: 'Marge', lignes }) },
      exercice: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.filter((i) => i.startsWith('x')).map((i, n) => ({ id: i, dateDebut: new Date(2025 + n, 0, 1), dateFin: new Date(2025 + n, 11, 31) })),
      },
    };
    const ecritures = {
      balance: async (_t: string, exerciceId: string, brouillard: boolean) => {
        balances.push(`${exerciceId}:${brouillard}`);
        return { lignes: [b('70110000', 0, exerciceId === 'x1' ? 100 : 200)] };
      },
    };
    return { svc: new EtatsPersonnalisesService(prisma as never, ecritures as never), balances };
  };

  it('une colonne par exercice, lue sur la balance générale', async () => {
    const { svc, balances } = monter();
    const r = await svc.calculer('t1', 'e1', ['x1', 'x2', 'x1'], false);
    expect(r.colonnes.map((c) => c.valeurs.CA)).toEqual([100, 200]);
    expect(balances).toEqual(['x1:false', 'x2:false']);
  });

  it('refuse plus de cinq exercices, un exercice étranger et une définition devenue invalide', async () => {
    await expect(monter().svc.calculer('t1', 'e1', ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'], false)).rejects.toThrow(/Au plus 5/);
    await expect(monter().svc.calculer('t1', 'e1', ['x1', 'autre'], false)).rejects.toThrow(/introuvable/);
    await expect(monter([{ cle: 'T', libelle: 'T', total: 'Z' }]).svc.calculer('t1', 'e1', ['x1'], false)).rejects.toThrow(/à corriger/);
  });
});
