import { TenantService } from './tenant.service';

/**
 * DÉMARRAGE GUIDÉ · l'état des étapes se lit dans le dossier, borné à lui.
 * La doublure honore son filtre : elle ne compte que les lignes du dossier
 * demandé, si bien qu'une lecture sans `tenantId` rendrait tout le parc.
 */
describe('démarrage guidé · état du dossier', () => {
  const lignes = {
    exercice: [{ tenantId: 'A' }, { tenantId: 'B' }],
    journal: [{ tenantId: 'A' }, { tenantId: 'A' }, { tenantId: 'B' }],
    tiers: [{ tenantId: 'B' }],
    ecriture: [{ tenantId: 'B' }, { tenantId: 'B' }],
  };
  const compter = (table: keyof typeof lignes) =>
    jest.fn(async ({ where }: { where?: { tenantId?: string } }) =>
      lignes[table].filter((l) => where?.tenantId === undefined || l.tenantId === where.tenantId).length,
    );
  const prisma = {
    tenant: { findUnique: jest.fn(async () => ({ modulesActives: ['IFRS', 'PAIE'] })) },
    exercice: { count: compter('exercice') },
    journal: { count: compter('journal') },
    tiers: { count: compter('tiers') },
    ecriture: { count: compter('ecriture') },
  };

  it('compte les étapes du seul dossier, modules normalisés', async () => {
    const r = await new TenantService(prisma as never).demarrage('A');
    expect(r).toEqual({ exercices: 1, journaux: 2, tiers: 0, ecritures: 0, modulesActives: ['PAIE', 'IFRS'] });
  });
});
