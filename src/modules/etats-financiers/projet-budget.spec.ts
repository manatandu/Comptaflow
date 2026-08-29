import { StatutEcriture } from '@prisma/client';
import { EtatsFinanciersProjetBudgetService } from './etats-financiers-projet-budget.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * TABLEAU D'EXÉCUTION BUDGÉTAIRE et TABLEAU DE RÉCONCILIATION DE TRÉSORERIE.
 *
 * Le point sensible du premier est la frontière décaissement/engagement : le
 * guide la pose sur le solde créditeur des comptes fournisseurs, le service
 * la pose écriture par écriture (trésorerie touchée, ou tiers lettré). Les
 * tests vérifient que les deux lectures donnent le même agrégé.
 */

function ligneBalance(numero: string, mouvement: { debit?: number; credit?: number }, report: { debit?: number; credit?: number } = {}) {
  const reportDebit = report.debit ?? 0;
  const reportCredit = report.credit ?? 0;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe: 'CLASSE_5' as const,
    typeCompte: 'DETAIL' as const,
    totalDebit: reportDebit + (mouvement.debit ?? 0),
    totalCredit: reportCredit + (mouvement.credit ?? 0),
    reportDebit,
    reportCredit,
    mouvementDebit: mouvement.debit ?? 0,
    mouvementCredit: mouvement.credit ?? 0,
    solde: reportDebit + (mouvement.debit ?? 0) - reportCredit - (mouvement.credit ?? 0),
  };
}

function ecriture(
  id: string,
  lignes: Array<{ numero: string; debit?: number; credit?: number; lettre?: string | null; section?: string }>,
) {
  return {
    id,
    date: new Date('2026-05-01'),
    statut: StatutEcriture.VALIDEE,
    lignes: lignes.map((l, i) => ({
      id: `${id}-${i}`,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      lettre: l.lettre ?? null,
      compte: { numero: l.numero, intitule: `Compte ${l.numero}` },
      ventilations: l.section
        ? [{ planId: 'p1', sectionId: l.section, debit: l.debit ?? 0, credit: l.credit ?? 0 }]
        : [],
    })),
  };
}

function service(options: {
  balance?: ReturnType<typeof ligneBalance>[];
  ecritures?: ReturnType<typeof ecriture>[];
  sections?: { id: string; code: string; intitule: string }[];
  budgets?: { sectionId: string; montant: number }[];
  plan?: { id: string; code: string; intitule: string } | null;
} = {}) {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({ lignes: options.balance ?? [], totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  const prisma = {
    planAnalytique: {
      findFirst: jest.fn().mockResolvedValue(
        options.plan === undefined ? { id: 'p1', code: 'PROJ', intitule: 'Projets' } : options.plan,
      ),
    },
    sectionAnalytique: { findMany: jest.fn().mockResolvedValue(options.sections ?? []) },
    budgetSection: { findMany: jest.fn().mockResolvedValue(options.budgets ?? []) },
    ecriture: { findMany: jest.fn().mockResolvedValue(options.ecritures ?? []) },
  } as unknown as PrismaService;
  return new EtatsFinanciersProjetBudgetService(ecritureService, prisma);
}

const SECTIONS = [
  { id: 's1', code: 'A1', intitule: 'Formation des animateurs' },
  { id: 's2', code: 'A2', intitule: 'Équipement' },
];

describe("Tableau d'exécution budgétaire", () => {
  it('classe en DÉCAISSEMENT une dépense payée comptant, en ENGAGEMENT une dépense passée en compte fournisseur', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }, { sectionId: 's2', montant: 500_000 }],
      ecritures: [
        ecriture('paye', [
          { numero: '60100000', debit: 300_000, section: 's1' },
          { numero: '52110000', credit: 300_000 },
        ]),
        ecriture('engage', [
          { numero: '24110000', debit: 200_000, section: 's2' },
          { numero: '48100000', credit: 200_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    const a1 = t.lignes.find((l) => l.code === 'A1')!;
    const a2 = t.lignes.find((l) => l.code === 'A2')!;
    expect(a1.decaissement).toBe(300_000);
    expect(a1.engagement).toBe(0);
    expect(a2.decaissement).toBe(0);
    expect(a2.engagement).toBe(200_000);
    expect(a2.realisation).toBe(200_000);
    expect(a2.creditDisponible).toBe(300_000);
  });

  it('une dépense engagée BASCULE en décaissement une fois la ligne fournisseur lettrée', async () => {
    // C'est ce qui donne son utilité au lettrage sur ce jeu d'états : il ne
    // sert pas qu'à justifier un solde.
    const commun = { sections: SECTIONS, budgets: [{ sectionId: 's1', montant: 1_000_000 }] };
    const avant = service({
      ...commun,
      ecritures: [
        ecriture('f', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000 },
        ]),
      ],
    });
    expect((await avant.executionBudgetaire('t1', 'e1')).lignes[0].engagement).toBe(400_000);

    const apres = service({
      ...commun,
      ecritures: [
        ecriture('f', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000, lettre: 'A' },
        ]),
      ],
    });
    const l = (await apres.executionBudgetaire('t1', 'e1')).lignes[0];
    expect(l.engagement).toBe(0);
    expect(l.decaissement).toBe(400_000);
  });

  it('le pourcentage d’exécution est `null` sur un budget nul, jamais un infini', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [],
      ecritures: [
        ecriture('x', [
          { numero: '60100000', debit: 100_000, section: 's1' },
          { numero: '52110000', credit: 100_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.lignes[0].executionPourcent).toBeNull();
    expect(t.lignes[0].creditDisponible).toBe(-100_000);
  });

  it('déclare les engagements que la comptabilité ne porte pas (bons de commande, contrats)', async () => {
    const t = await service({ sections: SECTIONS }).executionBudgetaire('t1', 'e1');
    expect(t.engagementsHorsComptabilite).toContain('bons de commande');
  });

  it('refuse d’établir le tableau sans nomenclature budgétaire, au lieu d’en inventer une', async () => {
    await expect(service({ plan: null }).executionBudgetaire('t1', 'e1')).rejects.toThrow(/nomenclature budgétaire/);
  });
});

describe('Tableau de réconciliation de trésorerie', () => {
  it('ventile les encaissements par nature de contrepartie et boucle avec la balance', async () => {
    const s = service({
      balance: [ligneBalance('52110000', { debit: 1_030_000, credit: 300_000 }, { debit: 200_000 })],
      ecritures: [
        ecriture('b', [
          { numero: '52110000', debit: 1_000_000 },
          { numero: '46200000', credit: 1_000_000 },
        ]),
        ecriture('i', [
          { numero: '52110000', debit: 30_000 },
          { numero: '77100000', credit: 30_000 },
        ]),
        ecriture('d', [
          { numero: '60100000', debit: 300_000 },
          { numero: '52110000', credit: 300_000 },
        ]),
      ],
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    const rep = (r: string) => t.lignes.find((l) => l.rep === r)!.montant;
    expect(rep('A')).toBe(200_000);
    expect(rep('B')).toBe(1_000_000);
    expect(rep('C')).toBe(30_000);
    expect(rep('D')).toBe(0);
    expect(rep('E')).toBe(0);
    expect(rep('F')).toBe(300_000);
    expect(rep('G')).toBe(930_000);
    expect(t.controle.boucle).toBe(true);
  });

  it('un virement interne n’est ni une recette ni une dépense, et E reste nul', async () => {
    const s = service({
      balance: [
        ligneBalance('52110000', { debit: 400_000 }),
        ligneBalance('57100000', { credit: 400_000 }, { debit: 400_000 }),
      ],
      ecritures: [
        ecriture('v', [
          { numero: '52110000', debit: 400_000 },
          { numero: '57100000', credit: 400_000 },
        ]),
      ],
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    expect(t.lignes.find((l) => l.rep === 'F')!.montant).toBe(0);
    expect(t.lignes.find((l) => l.rep === 'E')!.montant).toBe(0);
    expect(t.controle.boucle).toBe(true);
  });

  it('reprend les paiements en instance tels que saisis, et le déclare', async () => {
    // Trésorerie d'OUVERTURE de 500 000 et aucun mouvement : G = A = 500 000.
    const s = service({ balance: [ligneBalance('52110000', {}, { debit: 500_000 })] });
    const t = await s.reconciliationTresorerie('t1', 'e1', 120_000);
    expect(t.lignes.find((l) => l.rep === 'H')!.montant).toBe(120_000);
    expect(t.lignes.find((l) => l.rep === 'I')!.montant).toBe(380_000);
    expect(t.avertissements.some((a) => a.includes('extra-comptables'))).toBe(true);
  });
});
