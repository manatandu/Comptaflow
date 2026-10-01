import { NatureLocationAcquisition, Prisma, Referentiel, StatutExercice } from '@prisma/client';
import { LocationAcquisitionService } from './location-acquisition.service';

/**
 * LE PASSAGE DE LA CLÔTURE · câblage testé avec la règle (F4a) · écritures
 * aux comptes du référentiel, extourne à l'ouverture, ordre des exercices,
 * 623 qui doit porter les loyers, rien laissé au journal sur un refus.
 */
const E2026 = { id: 'e26', tenantId: 't', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z'), statut: StatutExercice.OUVERT };
const E2027 = { ...E2026, id: 'e27', dateDebut: new Date('2027-01-01T00:00:00Z'), dateFin: new Date('2027-12-31T00:00:00Z') };
const CONTRAT = {
  id: 'k1',
  tenantId: 't',
  reference: 'CB-01',
  nature: NatureLocationAcquisition.CREDIT_BAIL_MOBILIER,
  datePriseEffet: new Date('2026-01-01T00:00:00Z'),
  dureeMois: 96,
  periodicite: 'ANNUELLE',
  termeAEchoir: false,
  loyer: 90000,
  prixOption: 0,
  tauxAnnuel: 0.0786,
  valeurContrat: null,
  optionRaisonnablementCertaine: true,
  bienDeFaibleValeur: false,
  optionLevee: null as boolean | null,
  immobilisationId: 'b1',
  immobilisation: { designation: 'Presse' },
};

function monter(o: { contrat?: Partial<typeof CONTRAT>; sortieEchoue?: boolean; clotures?: unknown[]; exercice?: typeof E2026; anterieurs?: unknown[]; porte623?: number; doublon?: boolean; referentiel?: Referentiel } = {}) {
  const creer = jest.fn().mockImplementation((_t: string, _u: string, { libelle }: { libelle: string }) => Promise.resolve({ id: libelle.startsWith('Extourne') ? 'ext' : 'clo' }));
  const retirer = jest.fn();
  const numeros: Record<string, string> = {};
  const prisma = {
    contratLocationAcquisition: { findFirst: jest.fn().mockResolvedValue({ ...CONTRAT, ...o.contrat, clotures: o.clotures ?? [] }),
      update: jest.fn().mockResolvedValue({}),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue(o.exercice ?? E2026),
      findMany: jest.fn().mockResolvedValue(o.anterieurs ?? []),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA }) },
    compte: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        numeros[`id-${where.tenantId_numero.numero}`] = where.tenantId_numero.numero;
        return Promise.resolve({ id: `id-${where.tenantId_numero.numero}` });
      }),
    },
    clotureLocationAcquisition: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { loyers: 0 } }),
      create: jest.fn().mockImplementation(({ data }) =>
        o.doublon ? Promise.reject(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '5' })) : Promise.resolve(data),
      ),
    },
    ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _sum: { debit: o.porte623 ?? 90000, credit: 0 } }) },
  };
  const sortir = jest.fn().mockImplementation(() => (o.sortieEchoue ? Promise.reject(new Error('sortie refusée')) : Promise.resolve({ id: 'b1' })));
  const svc = new LocationAcquisitionService(prisma as never, { creer, retirerCompensation: retirer } as never, { sortir } as never);
  return { svc, prisma, creer, retirer, sortir };
}

describe('clôture d’un contrat de location-acquisition', () => {
  it('2026 · rien d’échu, les courus d’une année au 176 par le 672', async () => {
    const { svc, creer, prisma } = monter();
    await svc.passer('t', 'u', 'k1', { exerciceId: 'e26', journalId: 'j' });
    expect(creer).toHaveBeenCalledTimes(1);
    const { lignes, date } = creer.mock.calls[0][2];
    expect(date).toBe('2026-12-31');
    expect(lignes.map((l: { compteId: string }) => l.compteId)).toEqual(['id-67230000', 'id-17630000']);
    expect(lignes[0].debit).toBeCloseTo(40868.6, 0);
    expect(prisma.clotureLocationAcquisition.create.mock.calls[0][0].data).toMatchObject({ loyers: 0, ecritureExtourneId: null });
  });

  it('2027 · extourne des courus à l’ouverture, puis 623 viré au 17 et au 672', async () => {
    const { svc, creer } = monter({
      exercice: E2027,
      anterieurs: [E2026],
      clotures: [{ exerciceId: 'e26', interetsCourus: 40868.6 }],
    });
    await svc.passer('t', 'u', 'k1', { exerciceId: 'e27', journalId: 'j' });
    const [ext, clo] = creer.mock.calls.map((c) => c[2]);
    expect(ext.date).toBe('2027-01-01');
    expect(ext.lignes).toEqual([
      { compteId: 'id-17630000', debit: 40868.6, credit: 0 },
      { compteId: 'id-67230000', debit: 0, credit: 40868.6 },
    ]);
    const credit623 = clo.lignes.find((l: { compteId: string }) => l.compteId === 'id-62330000');
    expect(credit623.credit).toBe(90000);
    const capital = clo.lignes.find((l: { compteId: string }) => l.compteId === 'id-17300000');
    expect(capital.debit).toBeCloseTo(49131.4, 0);
    const debits = clo.lignes.reduce((s: number, l: { debit: number }) => s + l.debit, 0);
    const credits = clo.lignes.reduce((s: number, l: { credit: number }) => s + l.credit, 0);
    expect(Math.round(debits * 100)).toBe(Math.round(credits * 100));
  });

  it('SYCEBNL · la dette au 1872, les courus au 1876, les intérêts au 6722', async () => {
    const { svc, creer } = monter({ referentiel: Referentiel.SYCEBNL, exercice: E2027, anterieurs: [E2026], clotures: [{ exerciceId: 'e26', interetsCourus: 1 }] });
    await svc.passer('t', 'u', 'k1', { exerciceId: 'e27', journalId: 'j' });
    const comptes = creer.mock.calls.flatMap((c) => c[2].lignes.map((l: { compteId: string }) => l.compteId));
    expect(new Set(comptes)).toEqual(new Set(['id-18760000', 'id-67220000', 'id-18720000', 'id-62330000']));
  });

  it('refus · exercice antérieur non clôturé, 623 qui ne porte pas les loyers', async () => {
    await expect(monter({ exercice: E2027, anterieurs: [E2026] }).svc.passer('t', 'u', 'k1', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow(
      "dans l'ordre",
    );
    const { svc, creer } = monter({ exercice: E2027, anterieurs: [E2026], clotures: [{ exerciceId: 'e26', interetsCourus: 0 }], porte623: 50000 });
    await expect(svc.passer('t', 'u', 'k1', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow('ne porte que 50000.00');
    expect(creer).not.toHaveBeenCalled();
  });

  it('un double envoi retire ses écritures et rend 409', async () => {
    const { svc, retirer } = monter({ exercice: E2027, anterieurs: [E2026], clotures: [{ exerciceId: 'e26', interetsCourus: 10 }], doublon: true });
    await expect(svc.passer('t', 'u', 'k1', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow('déjà passée');
    expect(retirer.mock.calls.map((c) => c[1])).toEqual(['clo', 'ext']);
  });

  it('refuse la clôture de l’exercice où l’option échoit sans déclaration', async () => {
    // 8 loyers annuels depuis le 31/12/2018 · le dernier et l'option échoient le 31/12/2026.
    const contrat = { datePriseEffet: new Date('2018-12-31T00:00:00Z'), prixOption: 5000 };
    const { svc } = monter({ contrat });
    const p = await svc.proposer('t', 'k1', 'e26');
    expect(p.refus.join(' ')).toContain('déclarez sa levée');
    const levee = await monter({ contrat: { ...contrat, optionLevee: true } }).svc.proposer('t', 'k1', 'e26');
    expect(levee.ventilation.loyers).toBe(95000);
  });
});

describe('levée de l’option (§ 2.1.9)', () => {
  const avecOption = { datePriseEffet: new Date('2018-12-31T00:00:00Z'), prixOption: 5000 };

  it('levée · déclarée seule, conditionnellement, aucune sortie', async () => {
    const { svc, prisma, sortir } = monter({ contrat: avecOption });
    await svc.declarerOption('t', 'u', 'k1', { levee: true });
    expect(prisma.contratLocationAcquisition.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'k1', tenantId: 't', optionLevee: null },
      data: { optionLevee: true },
    });
    expect(sortir).not.toHaveBeenCalled();
  });

  it('non levée · cession au bailleur au capital restant dû, contrepartie la dette du 17', async () => {
    const { svc, sortir, prisma } = monter({ contrat: avecOption });
    await svc.declarerOption('t', 'u', 'k1', { levee: false, exerciceId: 'e26', journalId: 'j', cessionCourante: false });
    expect(sortir.mock.calls[0][2]).toBe('b1');
    expect(sortir.mock.calls[0][3]).toMatchObject({
      type: 'CESSION',
      dateSortie: '2026-12-31',
      prixCession: 5000,
      compteContrepartieId: 'id-17300000',
      cessionCourante: false,
    });
    expect(prisma.contratLocationAcquisition.update.mock.calls[0][0].data.optionLevee).toBe(false);
  });

  it('une sortie refusée retire la déclaration', async () => {
    const { svc, prisma } = monter({ contrat: avecOption, sortieEchoue: true });
    await expect(svc.declarerOption('t', 'u', 'k1', { levee: false, exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('sortie refusée');
    expect(prisma.contratLocationAcquisition.update.mock.calls[1][0].data).toEqual({ optionLevee: null, dateDecisionOption: null });
  });

  it('refus · contrat sans option, déclaration déjà faite, non-levée sans journal', async () => {
    await expect(monter().svc.declarerOption('t', 'u', 'k1', { levee: true })).rejects.toThrow("pas d'option");
    await expect(monter({ contrat: { ...avecOption, optionLevee: true } }).svc.declarerOption('t', 'u', 'k1', { levee: false })).rejects.toThrow(
      'déjà déclarée',
    );
    await expect(monter({ contrat: avecOption }).svc.declarerOption('t', 'u', 'k1', { levee: false })).rejects.toThrow('journal');
  });
});
