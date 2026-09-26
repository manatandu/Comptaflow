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
