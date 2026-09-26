import { PlateformeService } from './plateforme.service';
import { garderCloisonnement } from '../../common/cloisonnement/extension-cloisonnement';
import { dansContexteAudit } from '../../common/audit/contexte-audit';

/**
 * La console modifie la licence d'un AUTRE dossier que celui de l'opérateur ·
 * à travers la vraie garde de cloisonnement. Sans la sortie déclarée, la
 * ligne cible est « inexistante » et la console répond « Cabinet introuvable ».
 */
describe('console · licence d’un cabinet client, à travers la garde', () => {
  const brut = {
    licence: {
      findUnique: async () => ({ tenantId: 'CLIENT', type: 'ABONNEMENT', statut: 'ACTIVE' }),
      findFirst: async () => ({ tenantId: 'CLIENT' }),
      update: async () => ({ type: 'ABONNEMENT', statut: 'SUSPENDUE', dateDebut: new Date(), dateExpiration: null, dernierHeartbeatAt: null }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  // Chaque appel passe par `garderCloisonnement`, comme en production.
  const garde = (op: keyof typeof brut.licence) => (args: unknown) =>
    garderCloisonnement(brut as never, { model: 'Licence', operation: op, args, query: () => (brut.licence[op] as (a: unknown) => Promise<unknown>)(args) });
  const prisma = { licence: { findUnique: garde('findUnique'), update: garde('update'), updateMany: garde('updateMany') } };

  it('l’opérateur, connecté à son dossier, suspend la licence d’un client', async () => {
    const service = new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never);
    const r = await dansContexteAudit({ acteurId: 'op', acteurEmail: 'op@vmg', tenantId: 'EDITEUR' } as never, () =>
      service.modifierLicence('CLIENT', { statut: 'SUSPENDUE' } as never),
    );
    expect(r).toMatchObject({ statut: 'SUSPENDUE' });
  });
});

describe('console · échéance de la licence d’un abonné', () => {
  const monte = (licence: Record<string, unknown> | null) => {
    const prisma = {
      licence: {
        findUnique: jest.fn(async () => licence),
        create: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    return { s: new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never), prisma };
  };

  it('crée la licence d’abonnement si elle manque, et ne recule jamais l’échéance', async () => {
    const a = monte(null);
    await a.s.echeanceAbonnement('c', '2026-11-15');
    expect(a.prisma.licence.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'c', type: 'ABONNEMENT', statut: 'ACTIVE' }) });
    const b = monte({ type: 'ABONNEMENT', dateExpiration: new Date('2027-01-01T23:59:59Z') });
    await expect(b.s.echeanceAbonnement('c', '2026-12-15')).resolves.toBe('2027-01-01');
    expect(b.prisma.licence.update).not.toHaveBeenCalled();
    const c = monte({ type: 'ABONNEMENT', dateExpiration: new Date('2026-11-15T23:59:59Z') });
    await c.s.echeanceAbonnement('c', '2026-12-15');
    expect(c.prisma.licence.update).toHaveBeenCalledWith({ where: { tenantId: 'c' }, data: { dateExpiration: new Date('2026-12-15T23:59:59Z') } });
  });

  it('refuse une licence perpétuelle ou celle de l’éditeur', async () => {
    await expect(monte({ type: 'PERPETUEL_SAAS' }).s.echeanceAbonnement('c', '2026-12-15')).rejects.toThrow(/perpétuelle/);
    await expect(monte({ type: 'PROPRIETAIRE' }).s.echeanceAbonnement('c', '2026-12-15')).rejects.toThrow(/éditeur/);
  });
});
