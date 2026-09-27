import { ControlesService } from './controles.service';

/**
 * AUDIT FINAL F68 · les comptes dormants.
 *
 * Le solde sommait toutes les lignes de tous les exercices, reports compris ·
 * un compte reporté deux fois affichait trois fois son solde. Le report du
 * 1er janvier comptait comme un mouvement · un compte à solde ne devenait
 * jamais dormant. Et `Math.max(...dates)` levait sur un gros volume.
 *
 * La doublure HONORE les filtres de la requête (drapeaux de l'écriture,
 * borne de date) · une doublure qui rendrait tout validerait un service qui
 * relirait les reports.
 */

interface Ligne {
  compteId: string;
  debit: number;
  credit: number;
  ecriture: {
    tenantId: string;
    exerciceId: string;
    date: Date;
    estGenereeParCloture: boolean;
    estSoldeDesComptesDeGestion: boolean;
    estANouveauProvisoire: boolean;
  };
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function ligne(compteId: string, exerciceId: string, date: string, debit: number, credit: number, genre = 'MOUVEMENT'): Ligne {
  return {
    compteId,
    debit,
    credit,
    ecriture: {
      tenantId: 't1',
      exerciceId,
      date: d(date),
      estGenereeParCloture: genre !== 'MOUVEMENT',
      estSoldeDesComptesDeGestion: genre === 'SOLDE_GESTION',
      estANouveauProvisoire: genre === 'PROVISOIRE',
    },
  };
}

const LIGNES: Ligne[] = [
  // Banque · ouverture du dossier, un mouvement en 2024, puis deux reports.
  ligne('banque', 'ex24', '2024-01-01', 1_000, 0, 'OUVERTURE'),
  ligne('banque', 'ex24', '2024-03-10', 200, 0),
  ligne('banque', 'ex25', '2025-01-01', 1_200, 0, 'REPORT'),
  ligne('banque', 'ex26', '2026-01-01', 1_200, 0, 'PROVISOIRE'),
  // Charge de 2024, soldée par la clôture.
  ligne('charge', 'ex24', '2024-05-02', 300, 0),
  ligne('charge', 'ex24', '2024-12-31', 0, 300, 'SOLDE_GESTION'),
  // Client · la seule ouverture du dossier, jamais mouvementé depuis. Un
  // à-nouveau provisoire rejoue un solde déjà compté · même logé dans le
  // premier exercice, il ne s'ajoute pas à l'ouverture.
  ligne('client', 'ex24', '2024-01-01', 50, 0, 'OUVERTURE'),
  ligne('client', 'ex24', '2024-01-01', 50, 0, 'PROVISOIRE'),
  // Produit mouvementé récemment · pas dormant.
  ligne('produit', 'ex26', '2026-06-01', 0, 500),
  // Un autre dossier · jamais lu.
  { ...ligne('banque', 'ex24', '2026-08-01', 9_999, 0), ecriture: { ...ligne('banque', 'ex24', '2026-08-01', 0, 0).ecriture, tenantId: 't2' } },
];

function correspond(l: Ligne, filtre: Record<string, unknown>): boolean {
  return Object.entries(filtre).every(([cle, attendu]) => {
    const valeur = (l.ecriture as unknown as Record<string, unknown>)[cle];
    if (attendu && typeof attendu === 'object' && 'gte' in (attendu as object)) {
      return (valeur as Date).getTime() >= ((attendu as { gte: Date }).gte).getTime();
    }
    return valeur === attendu;
  });
}

function monde() {
  const findMany = jest.fn(({ where }: { where: { compteId: { in: string[] }; ecriture: Record<string, unknown> } }) => {
    const plusRecente = new Map<string, Ligne>();
    for (const l of LIGNES) {
      if (!where.compteId.in.includes(l.compteId) || !correspond(l, where.ecriture)) continue;
      const deja = plusRecente.get(l.compteId);
      if (!deja || l.ecriture.date > deja.ecriture.date) plusRecente.set(l.compteId, l);
    }
    return Promise.resolve([...plusRecente.values()].map((l) => ({ compteId: l.compteId, ecriture: { date: l.ecriture.date } })));
  });
  const prisma = {
    compte: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'client', numero: '41110000', intitule: 'Client A', classe: 'CLASSE_4', estActif: true },
        { id: 'banque', numero: '52110000', intitule: 'Banque', classe: 'CLASSE_5', estActif: true },
        { id: 'charge', numero: '60500000', intitule: 'Eau', classe: 'CLASSE_6', estActif: true },
        { id: 'inutile', numero: '62200000', intitule: 'Locations', classe: 'CLASSE_6', estActif: true },
        { id: 'sommeil', numero: '62300000', intitule: 'Redevances', classe: 'CLASSE_6', estActif: false },
        { id: 'produit', numero: '70100000', intitule: 'Ventes', classe: 'CLASSE_7', estActif: true },
      ]),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex24' }) },
    ligneEcriture: {
      groupBy: jest.fn(({ where }: { where: { ecriture: Record<string, unknown> } }) => {
        const groupes = new Map<string, { debit: number; credit: number; n: number }>();
        for (const l of LIGNES) {
          if (!correspond(l, where.ecriture)) continue;
          const g = groupes.get(l.compteId) ?? { debit: 0, credit: 0, n: 0 };
          g.debit += l.debit;
          g.credit += l.credit;
          g.n += 1;
          groupes.set(l.compteId, g);
        }
        return Promise.resolve(
          [...groupes].map(([compteId, g]) => ({ compteId, _sum: { debit: g.debit, credit: g.credit }, _count: { _all: g.n } })),
        );
      }),
      findMany,
    },
  };
  return { svc: new ControlesService(prisma as never), findMany };
}

describe('F68 · les comptes dormants', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(d('2026-09-27'));
  });
  afterAll(() => jest.useRealTimers());

  it('le solde est celui du grand livre, jamais multiplié par les reports', async () => {
    const r = await monde().svc.comptesDormants('t1');
    const par = Object.fromEntries(r.map((c) => [c.compteId, c]));
    expect(par.banque.solde).toBe(1_200);
    expect(par.charge.solde).toBe(0);
    expect(par.client.solde).toBe(50);
  });

  it('le report ne compte pas comme un mouvement · la banque est dormante depuis mars 2024', async () => {
    const r = await monde().svc.comptesDormants('t1');
    const banque = r.find((c) => c.compteId === 'banque')!;
    expect(banque.dernierMouvement).toBe('2024-03-10T00:00:00.000Z');
    expect(banque.nombreEcritures).toBe(1);
    // L'écriture qui solde la charge est datée du 31 décembre · elle n'est
    // pas un mouvement de la charge.
    expect(r.find((c) => c.compteId === 'charge')!.dernierMouvement).toBe('2024-05-02T00:00:00.000Z');
  });

  it('un compte repris sans mouvement a servi · il n’est pas « jamais mouvementé »', async () => {
    const r = await monde().svc.comptesDormants('t1');
    const client = r.find((c) => c.compteId === 'client')!;
    expect(client).toMatchObject({ jamaisMouvemente: false, dernierMouvement: null });
    expect(r.find((c) => c.compteId === 'inutile')!.jamaisMouvemente).toBe(true);
  });

  it('écarte le compte récemment mouvementé et le compte en sommeil, et met les soldes devant', async () => {
    const r = await monde().svc.comptesDormants('t1');
    expect(r.map((c) => c.compteId)).toEqual(['client', 'banque', 'charge', 'inutile']);
  });

  it('ne lit la dernière ligne que des comptes dormants qui en ont une', async () => {
    const { svc, findMany } = monde();
    await svc.comptesDormants('t1');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect([...findMany.mock.calls[0][0].where.compteId.in].sort()).toEqual(['banque', 'charge']);
  });
});
