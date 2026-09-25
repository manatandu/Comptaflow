import { TiersService } from './tiers.service';

const fiche = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase(),
  type: 'FOURNISSEUR',
  adresse: null,
  boitePostale: null,
  ville: null,
  pays: null,
  telephone: null,
  email: null,
  numeroImpot: null,
  contact: null,
  ...extra,
});

describe('Fusion de tiers · le service', () => {
  it('reporte TOUTES les relations lues dans le schéma, comble les vides, puis supprime le doublon', async () => {
    const maj = () => ({ updateMany: jest.fn().mockResolvedValue({ count: 1 }) });
    const tx = {
      tiersCompte: maj(),
      relance: maj(),
      demandeConfirmation: maj(),
      facture: maj(),
      devis: maj(),
      consignation: maj(),
      tiers: { update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tiers: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'doublon'
              ? fiche('doublon', { numeroImpot: 'A123' })
              : { ...fiche('garde', { adresse: 'Av. X' }), comptesRattaches: [{ estPrincipal: true }] },
          ),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const s = new TiersService(prisma as never);
    const r = await s.fusionner('t', 'doublon', 'garde');

    for (const m of ['relance', 'demandeConfirmation', 'facture', 'devis', 'consignation'] as const) {
      expect(tx[m].updateMany).toHaveBeenCalledWith({ where: { tiersId: 'doublon', tenantId: 't' }, data: { tiersId: 'garde' } });
    }
    // Le compte principal de la fiche conservée reste le seul.
    expect(tx.tiersCompte.updateMany).toHaveBeenCalledWith({ where: { tiersId: 'doublon' }, data: { estPrincipal: false } });
    expect(tx.tiers.update).toHaveBeenCalledWith({ where: { id: 'garde' }, data: { numeroImpot: 'A123' } });
    expect(tx.tiers.delete).toHaveBeenCalledWith({ where: { id: 'doublon' } });
    expect(r.reporte).toHaveLength(6);
  });
});
