import { ComptabilisationFactureService } from './comptabilisation-facture.service';

const D = (n: number) => ({ toString: () => String(n), valueOf: () => n });

function monde(o: { lie?: boolean; journal?: string; numero?: string; libreAuLien?: boolean } = {}) {
  const creees: Record<string, unknown>[] = [];
  const prisma = {
    facture: {
      findFirst: jest.fn(async () => ({
        id: 'f1', sens: 'VENTE', nature: 'FACTURE', numeroSerie: 'F-7', contrepartieNom: 'ASBL', autresImpotsEtTaxes: null,
        ecritureId: o.lie ? 'e0' : null, dateFacture: new Date('2026-10-15T00:00:00Z'),
        tiers: { comptesRattaches: [{ compteId: 'c411' }] },
        lignes: [{ id: 'l1', designation: 'Service', montantHT: D(1000), montantTva: D(160), tauxTvaId: 't16', tauxTva: { compteCollecteId: 'c443', compteDeductibleId: 'c445' } }],
      })),
      updateMany: jest.fn(async () => ({ count: o.libreAuLien === false ? 0 : 1 })),
    },
    journal: { findFirst: jest.fn(async () => ({ type: o.journal ?? 'VENTES' })) },
    compte: { findMany: jest.fn(async () => [{ id: 'c706', numero: o.numero ?? '70610000' }]) },
    exercice: { findFirst: jest.fn(async () => ({ id: 'ex' })) },
    ecriture: { delete: jest.fn() },
  };
  const ecritures = { creer: jest.fn(async (_t: string, _u: string, dto: Record<string, unknown>) => (creees.push(dto), { id: 'e1' })) };
  return { s: new ComptabilisationFactureService(prisma as never, ecritures as never), prisma, ecritures, creees };
}

describe('passer l’écriture d’une facture · service', () => {
  it('crée l’écriture au journal choisi, à la date de la facture, puis lie la facture', async () => {
    const m = monde();
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' })).resolves.toEqual({ ecritureId: 'e1', lignes: 3 });
    expect(m.creees[0]).toMatchObject({ exerciceId: 'ex', journalId: 'jv', date: '2026-10-15', reference: 'F-7' });
    expect(m.prisma.facture.updateMany).toHaveBeenCalledWith({ where: { id: 'f1', tenantId: 't', ecritureId: null }, data: { ecritureId: 'e1' } });
  });

  it('refuse une facture déjà liée, un journal d’un autre type, un compte d’une autre classe', async () => {
    await expect(monde({ lie: true }).s.comptabiliser('t', 'u', 'f1', { journalId: 'j', compteGestionId: 'c706' })).rejects.toThrow(/déjà liée/);
    await expect(monde({ journal: 'ACHATS' }).s.comptabiliser('t', 'u', 'f1', { journalId: 'j', compteGestionId: 'c706' })).rejects.toThrow(/journal de ventes/);
    await expect(monde({ numero: '60100000' }).s.comptabiliser('t', 'u', 'f1', { journalId: 'j', compteGestionId: 'c706' })).rejects.toThrow(/classe 7/);
  });

  it('un second clic qui a lié la facture entre-temps retire l’écriture créée', async () => {
    const m = monde({ libreAuLien: false });
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'j', compteGestionId: 'c706' })).rejects.toThrow(/vient d’être liée/);
    expect(m.prisma.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });
});
