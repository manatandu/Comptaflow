import { ComptabilisationFactureService } from './comptabilisation-facture.service';

const D = (n: number) => ({ toString: () => String(n), valueOf: () => n });

function monde(
  o: {
    lie?: boolean;
    journal?: string;
    numero?: string;
    libreAuLien?: boolean;
    dossierDuTaux?: string;
    referentiel?: 'SYSCOHADA' | 'SYCEBNL';
    /** Comptes de TVA subdivisés que le dossier a ouverts (numéro → id). */
    ouverts?: Record<string, string>;
    taux?: number;
    montantTva?: number;
    imposable?: boolean;
  } = {},
) {
  // La doublure HONORE le filtre · par identifiant (le compte de gestion
  // choisi) ou par numéro (les subdivisions de TVA ouvertes), jamais une
  // liste rendue quel que soit le `where`.
  const plan = [
    { id: 'c706', numero: o.numero ?? '70610000', tenantId: 't' },
    ...Object.entries(o.ouverts ?? {}).map(([numero, id]) => ({ id, numero, tenantId: 't' })),
  ];
  const creees: Record<string, unknown>[] = [];
  const prisma = {
    facture: {
      findFirst: jest.fn(async () => ({
        id: 'f1', sens: 'VENTE', nature: 'FACTURE', numeroSerie: 'F-7', contrepartieNom: 'ASBL', autresImpotsEtTaxes: null,
        ecritureId: o.lie ? 'e0' : null, dateFacture: new Date('2026-10-15T00:00:00Z'),
        tiers: { comptesRattaches: [{ compteId: 'c411' }] },
        lignes: [
          {
            id: 'l1', designation: 'Service', montantHT: D(1000), montantTva: D(o.montantTva ?? 160), imposable: o.imposable ?? true, tauxTvaId: 't16',
            tauxTva: { tenantId: o.dossierDuTaux ?? 't', taux: D(o.taux ?? 16), compteCollecteId: 'c443', compteDeductibleId: 'c445' },
          },
        ],
      })),
      updateMany: jest.fn(async () => ({ count: o.libreAuLien === false ? 0 : 1 })),
    },
    journal: { findFirst: jest.fn(async () => ({ type: o.journal ?? 'VENTES' })) },
    compte: {
      findMany: jest.fn(async ({ where }: { where: { tenantId: string; id?: { in: string[] }; numero?: { in: string[] } } }) =>
        plan.filter(
          (c) => c.tenantId === where.tenantId && (!where.id || where.id.in.includes(c.id)) && (!where.numero || where.numero.in.includes(c.numero)),
        ),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ referentiel: o.referentiel ?? 'SYSCOHADA' })) },
    exercice: { findFirst: jest.fn(async () => ({ id: 'ex' })) },
    ecriture: { delete: jest.fn() },
  };
  const ecritures = {
    creer: jest.fn(async (_t: string, _u: string, dto: Record<string, unknown>) => (creees.push(dto), { id: 'e1' })),
    retirerCompensation: jest.fn(async () => undefined),
  };
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

  it('refuse le taux d’un autre dossier porté par une pièce ancienne (audit final F120)', async () => {
    const m = monde({ dossierDuTaux: 'voisin' });
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' })).rejects.toThrow(/Taux de taxe introuvable/);
    expect(m.ecritures.creer).not.toHaveBeenCalled();
  });

  it('un second clic qui a lié la facture entre-temps retire l’écriture créée', async () => {
    const m = monde({ libreAuLien: false });
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'j', compteGestionId: 'c706' })).rejects.toThrow(/vient d’être liée/);
    // Lignes puis tête, par la compensation commune (F1).
    expect(m.ecritures.retirerCompensation).toHaveBeenCalledWith('t', 'e1');
  });

  // AUDIT FINAL F116 · le compte de TVA de la facture passée au journal est
  // routé comme à la saisie, et la ligne au taux zéro existe.
  const ligneTva = (m: ReturnType<typeof monde>) =>
    (m.creees[0].lignes as { compteId: string; debit: number; credit: number; tauxTvaId?: string | null }[]).filter((l) =>
      ['c443', 'c4432', 'c445'].includes(l.compteId),
    );

  it('F116 · une prestation vendue collecte au 4432 quand le dossier SYSCOHADA l’a ouvert', async () => {
    const m = monde({ ouverts: { '44320000': 'c4432', '44310000': 'c4431' } });
    await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' });
    expect(ligneTva(m)).toEqual([expect.objectContaining({ compteId: 'c4432', credit: 160, tauxTvaId: 't16' })]);
  });

  it('F116 · sans la subdivision ouverte, ou au SYCEBNL, le compte du taux fait foi', async () => {
    const sansSubdivision = monde({ ouverts: {} });
    await sansSubdivision.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' });
    expect(ligneTva(sansSubdivision)).toEqual([expect.objectContaining({ compteId: 'c443', credit: 160 })]);

    const sycebnl = monde({ referentiel: 'SYCEBNL', ouverts: { '44320000': 'c4432' } });
    await sycebnl.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' });
    expect(ligneTva(sycebnl)).toEqual([expect.objectContaining({ compteId: 'c443', credit: 160 })]);
  });

  it('F116 · une ligne imposable au taux zéro pose sa ligne de TVA, à zéro, avec son taux (art. 43)', async () => {
    const m = monde({ taux: 0, montantTva: 0 });
    await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' });
    expect(ligneTva(m)).toEqual([expect.objectContaining({ compteId: 'c443', debit: 0, credit: 0, tauxTvaId: 't16' })]);
  });

  it('F116 · une ligne exonérée, sans taxe, ne pose aucune ligne de TVA', async () => {
    const m = monde({ taux: 0, montantTva: 0, imposable: false });
    await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'jv', compteGestionId: 'c706' });
    expect(ligneTva(m)).toEqual([]);
  });
});
