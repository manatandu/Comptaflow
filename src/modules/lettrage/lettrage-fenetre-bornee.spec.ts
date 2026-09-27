import { StatutLettrage } from '@prisma/client';
import { LettrageService, PLAFOND_LIGNES_LETTRAGE } from './lettrage.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F185 · la fenêtre de lettrage lisait toutes les lignes du
 * compte, tous exercices confondus. Elle montre une tranche, dit qu'elle en
 * est une, et prend ses totaux sur le compte entier.
 */
function harnais(total: number, aggregat = { debit: 0, credit: 0 }) {
  const lignes = Array.from({ length: Math.min(total, PLAFOND_LIGNES_LETTRAGE) }, (_, i) => ({
    id: `l${i}`,
    libelle: null,
    debit: 10,
    credit: 0,
    lettre: null,
    lettrageId: i === 0 ? 'g-solde' : null,
    lettrage: null,
    devise: null,
    montantDevise: null,
    ecriture: { date: new Date('2026-01-01'), libelle: 'x', reference: null, journal: { code: 'VT' } },
  }));
  const prisma = {
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', numero: '41110000', intitule: 'C', lettrable: true }) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(lignes),
      count: jest.fn().mockResolvedValue(total),
      aggregate: jest.fn().mockResolvedValue({ _sum: aggregat }),
    },
    lettrage: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { svc: new LettrageService(prisma as unknown as PrismaService), prisma };
}

describe('fenêtre de lettrage · une tranche qui se dit (F185)', () => {
  it('la lecture est bornée au plafond, et les totaux viennent de l’agrégat du compte entier', async () => {
    const { svc, prisma } = harnais(PLAFOND_LIGNES_LETTRAGE + 1, { debit: 999_999, credit: 1 });
    const r = await svc.lister('t', 'c1');
    expect(prisma.ligneEcriture.findMany.mock.calls[0][0].take).toBe(PLAFOND_LIGNES_LETTRAGE);
    expect(r.tronque).toBe(true);
    expect(r.total).toBe(PLAFOND_LIGNES_LETTRAGE + 1);
    expect(r.totaux).toEqual({ debit: 999_999, credit: 1 });
    // Même périmètre pour la tranche, le décompte et les totaux.
    const where = prisma.ligneEcriture.findMany.mock.calls[0][0].where;
    expect(prisma.ligneEcriture.count.mock.calls[0][0].where).toEqual(where);
    expect(prisma.ligneEcriture.aggregate.mock.calls[0][0].where).toEqual(where);
  });

  it('tronquée, elle garde les groupes partiels et ceux de ses lignes', async () => {
    const { svc, prisma } = harnais(PLAFOND_LIGNES_LETTRAGE + 1);
    await svc.lister('t', 'c1');
    expect(prisma.lettrage.findMany.mock.calls[0][0].where).toEqual({
      compteId: 'c1',
      tenantId: 't',
      OR: [{ statut: StatutLettrage.PARTIEL }, { id: { in: ['g-solde'] } }],
    });
  });

  it('entière, elle rend tous les groupes du compte, comme avant', async () => {
    const { svc, prisma } = harnais(3);
    const r = await svc.lister('t', 'c1');
    expect(r.tronque).toBe(false);
    expect(prisma.lettrage.findMany.mock.calls[0][0].where).toEqual({ compteId: 'c1', tenantId: 't' });
  });
});
