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

/**
 * AUDIT FINAL F45 · la réinitialisation de l'administrateur d'un cabinet
 * CLIENT, à travers la vraie garde. La lecture se faisait dans le contexte de
 * l'opérateur · la garde rendait le compte inexistant, et la route de dernier
 * recours répondait 404 pour tout autre dossier que celui de l'éditeur.
 */
describe('console · réinitialisation de l’administrateur d’un cabinet client, à travers la garde', () => {
  const admin = { id: 'adm', tenantId: 'CLIENT', email: 'admin@client.cd', role: 'ADMIN_CABINET' };
  const comptable = { id: 'cpt', tenantId: 'CLIENT', email: 'compta@client.cd', role: 'COMPTABLE' };
  // La doublure honore les trois termes du filtre · dossier, adresse et rôle.
  const brut = {
    user: {
      findFirst: jest.fn(
        async ({ where }: { where: { tenantId: string; email: string; role?: string } }) =>
          [admin, comptable].find(
            (u) => u.tenantId === where.tenantId && u.email === where.email && (where.role === undefined || u.role === where.role),
          ) ?? null,
      ),
      findUnique: async () => admin,
      update: jest.fn(async () => ({ ...admin })),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const garde = (op: keyof typeof brut.user) => (args: unknown) =>
    garderCloisonnement(brut as never, { model: 'User', operation: op, args, query: () => (brut.user[op] as (a: unknown) => Promise<unknown>)(args) });
  const prisma = { user: { findFirst: garde('findFirst'), update: garde('update') } };
  const service = () => new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never);

  it('l’opérateur, connecté au dossier de l’éditeur, réinitialise l’administrateur du client', async () => {
    const r = await dansContexteAudit({ acteurId: 'op', acteurEmail: 'op@vmg', tenantId: 'EDITEUR' } as never, () =>
      service().reinitialiserAdmin('CLIENT', { email: ' Admin@Client.CD ', motDePasseProvisoire: 'provisoire-1234' }),
    );
    expect(r).toEqual({ reinitialise: true, email: 'admin@client.cd' });
    expect(brut.user.update).toHaveBeenCalledTimes(1);
  });

  it('l’opérateur ne réinitialise que l’administrateur, jamais un autre compte du dossier', async () => {
    await expect(
      dansContexteAudit({ acteurId: 'op', acteurEmail: 'op@vmg', tenantId: 'EDITEUR' } as never, () =>
        service().reinitialiserAdmin('CLIENT', { email: 'compta@client.cd', motDePasseProvisoire: 'provisoire-1234' }),
      ),
    ).rejects.toThrow(/Aucun administrateur/);
  });

  it('un compte qui n’est pas l’administrateur de CE dossier reste introuvable', async () => {
    await expect(
      dansContexteAudit({ acteurId: 'op', acteurEmail: 'op@vmg', tenantId: 'EDITEUR' } as never, () =>
        service().reinitialiserAdmin('AUTRE', { email: 'admin@client.cd', motDePasseProvisoire: 'provisoire-1234' }),
      ),
    ).rejects.toThrow(/Aucun administrateur/);
  });
});
