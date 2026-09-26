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
      documentTiers: { ...maj(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      ribTiers: { ...maj(), count: jest.fn().mockResolvedValue(1) },
      ligneOrdreVirement: maj(),
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

    for (const m of ['relance', 'demandeConfirmation', 'facture', 'devis', 'consignation', 'documentTiers', 'ligneOrdreVirement'] as const) {
      expect(tx[m].updateMany).toHaveBeenCalledWith({ where: { tiersId: 'doublon', tenantId: 't' }, data: { tiersId: 'garde' } });
    }
    // Le compte principal de la fiche conservée reste le seul.
    expect(tx.tiersCompte.updateMany).toHaveBeenCalledWith({ where: { tiersId: 'doublon' }, data: { estPrincipal: false } });
    // Même règle pour les RIB · le prochain virement part sur le principal de la fiche gardée.
    expect(tx.ribTiers.count).toHaveBeenCalledWith({ where: { tenantId: 't', tiersId: 'garde', estPrincipal: true } });
    expect(tx.ribTiers.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't', tiersId: 'doublon' }, data: { estPrincipal: false } });
    expect(tx.tiers.update).toHaveBeenCalledWith({ where: { id: 'garde' }, data: { numeroImpot: 'A123' } });
    expect(tx.tiers.delete).toHaveBeenCalledWith({ where: { id: 'doublon' } });
    expect(r.reporte).toHaveLength(9);
  });

  it('une pièce que la fiche conservée détient déjà n’est pas reportée · l’unicité (tiers, empreinte) tiendrait sinon la fusion en échec', async () => {
    const maj = () => ({ updateMany: jest.fn().mockResolvedValue({ count: 0 }) });
    const ordre: string[] = [];
    const documentTiers = {
      findMany: jest.fn().mockResolvedValue([{ empreinte: 'abc' }]),
      deleteMany: jest.fn(async () => {
        ordre.push('deleteMany');
        return { count: 1 };
      }),
      updateMany: jest.fn(async () => {
        ordre.push('updateMany');
        return { count: 0 };
      }),
    };
    const tx: Record<string, unknown> = {
      tiersCompte: maj(), relance: maj(), demandeConfirmation: maj(), facture: maj(), devis: maj(), consignation: maj(),
      ribTiers: { ...maj(), count: jest.fn().mockResolvedValue(0) }, ligneOrdreVirement: maj(),
      documentTiers,
      tiers: { update: jest.fn(), delete: jest.fn() },
    };
    const prisma = {
      tiers: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 'doublon' ? fiche('doublon') : { ...fiche('garde'), comptesRattaches: [] }),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    await new TiersService(prisma as never).fusionner('t', 'doublon', 'garde');
    expect(documentTiers.findMany).toHaveBeenCalledWith({ where: { tenantId: 't', tiersId: 'garde' }, select: { empreinte: true } });
    expect(documentTiers.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't', tiersId: 'doublon', empreinte: { in: ['abc'] } },
    });
    expect(ordre).toEqual(['deleteMany', 'updateMany']);
  });

  it("sans RIB principal sur la fiche gardée, ceux du doublon arrivent tels quels", async () => {
    const maj = () => ({ updateMany: jest.fn().mockResolvedValue({ count: 0 }) });
    const ribTiers = { ...maj(), count: jest.fn().mockResolvedValue(0) };
    const tx: Record<string, unknown> = {
      tiersCompte: maj(), relance: maj(), demandeConfirmation: maj(), facture: maj(), devis: maj(), consignation: maj(),
      ribTiers, ligneOrdreVirement: maj(),
      documentTiers: { ...maj(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      tiers: { update: jest.fn(), delete: jest.fn() },
    };
    const prisma = {
      tiers: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 'doublon' ? fiche('doublon') : { ...fiche('garde'), comptesRattaches: [] }),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    await new TiersService(prisma as never).fusionner('t', 'doublon', 'garde');
    expect(ribTiers.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { estPrincipal: false } }));
    expect(ribTiers.updateMany).toHaveBeenCalledWith({ where: { tiersId: 'doublon', tenantId: 't' }, data: { tiersId: 'garde' } });
  });
});
