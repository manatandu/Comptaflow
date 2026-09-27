import { TiersService } from './tiers.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F149 · un Équilibre qui n'est pas en dernier rendait une
 * échéance NÉGATIVE · il absorbait tout le reste, et les échéances qui le
 * suivaient se calculaient sur un reste épuisé.
 */
type Echeance = { id: string; ordre: number; type: string; valeur: number | null; delaiJours: number; echeance: string };

function service(existantes: Echeance[]) {
  const create = jest.fn(async ({ data }: { data: unknown }) => data);
  const prisma = {
    modeleReglement: { findFirst: jest.fn(async () => ({ id: 'm1', delaiJours: 30, echeance: 'NET' })) },
    echeanceReglement: {
      // La doublure rend les échéances dans l'ordre demandé, comme en base.
      findMany: jest.fn(async ({ orderBy }: { orderBy?: { ordre: 'asc' } }) =>
        orderBy ? [...existantes].sort((a, b) => a.ordre - b.ordre) : existantes,
      ),
      create,
    },
  } as unknown as PrismaService;
  return { svc: new TiersService(prisma), create };
}

const ech = (id: string, ordre: number, type: string, valeur: number | null): Echeance => ({
  id, ordre, type, valeur, delaiJours: 30 * ordre, echeance: 'NET',
});

describe('F149 · l’Équilibre se place en dernier', () => {
  it('refuse un Équilibre suivi d’une autre échéance', async () => {
    const { svc, create } = service([ech('a', 2, 'POURCENTAGE', 40)]);
    await expect(svc.ajouterEcheance('t1', 'm1', { ordre: 1, type: 'EQUILIBRE', delaiJours: 0 } as never)).rejects.toThrow(/se place en dernier/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse une échéance après l’Équilibre', async () => {
    const { svc, create } = service([ech('e', 2, 'EQUILIBRE', null)]);
    await expect(svc.ajouterEcheance('t1', 'm1', { ordre: 3, type: 'POURCENTAGE', valeur: 30, delaiJours: 90 } as never)).rejects.toThrow(/placez celle-ci avant elle/);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepte une échéance avant l’Équilibre, et l’Équilibre en dernier', async () => {
    const { svc } = service([ech('e', 3, 'EQUILIBRE', null)]);
    await expect(svc.ajouterEcheance('t1', 'm1', { ordre: 1, type: 'POURCENTAGE', valeur: 30, delaiJours: 0 } as never)).resolves.toBeDefined();
    const { svc: s2 } = service([ech('a', 1, 'POURCENTAGE', 30)]);
    await expect(s2.ajouterEcheance('t1', 'm1', { ordre: 2, type: 'EQUILIBRE', delaiJours: 60 } as never)).resolves.toBeDefined();
  });
});

describe('F149 · aucune échéance n’est négative', () => {
  it('un Équilibre ancien placé en premier reçoit le reste APRÈS les autres', async () => {
    const { svc } = service([ech('e', 1, 'EQUILIBRE', null), ech('a', 2, 'POURCENTAGE', 30), ech('b', 3, 'MONTANT', 100)]);
    const r = await svc.calculerEcheances('t1', 'm1', { dateFacture: '2026-03-01', montantTotal: 1_000 } as never);
    expect(r.map((x) => [x.ordre, x.montant])).toEqual([[1, 600], [2, 300], [3, 100]]);
  });

  it('un pourcentage est borné au reste', async () => {
    const { svc } = service([ech('a', 1, 'MONTANT', 900), ech('b', 2, 'POURCENTAGE', 50), ech('c', 3, 'MONTANT', 10)]);
    const r = await svc.calculerEcheances('t1', 'm1', { dateFacture: '2026-03-01', montantTotal: 1_000 } as never);
    expect(r.every((x) => x.montant >= 0)).toBe(true);
    expect(r.reduce((s, x) => s + x.montant, 0)).toBe(1_000);
  });
});
