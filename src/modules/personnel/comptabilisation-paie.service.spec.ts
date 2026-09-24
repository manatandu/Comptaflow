import { ComptabilisationPaieService } from './comptabilisation-paie.service';

/**
 * P9 · LE CÂBLAGE. La règle vit dans `comptabilisation-paie.ts` ; ici on
 * vérifie que le service POSTE ce qu'elle propose, LIE les bulletins, et ne
 * laisse jamais un salaire passé deux fois ni un bulletin se dire passé sans
 * écriture.
 */

const bulletin = (numero: number, ecritureId: string | null = null) => ({
  id: `b${numero}`,
  numero,
  nomComplet: `SALARIE ${numero}`,
  statut: 'EMIS',
  ecritureId,
  netAPayerFc: 1_250_000,
  entree: {
    elements: [
      { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
    ],
  },
  calcul: {
    cotisations: {
      lignes: [
        { cle: 'cnss-pf', charge: 'EMPLOYEUR', montantFc: 65_000 },
        { cle: 'cnss-pension-employeur', charge: 'EMPLOYEUR', montantFc: 50_000 },
        { cle: 'cnss-pension-travailleur', charge: 'TRAVAILLEUR', montantFc: 50_000 },
        { cle: 'cnss-rp', charge: 'EMPLOYEUR', montantFc: 15_000 },
        { cle: 'inpp', charge: 'EMPLOYEUR', montantFc: 35_000 },
        { cle: 'onem', charge: 'EMPLOYEUR', montantFc: 5_000 },
      ],
      abstentions: [],
    },
    retenue: { retenueFc: 100_000 },
    net: { netAPayerFc: 1_250_000 },
  },
});

function monter(opts: { bulletins?: unknown[]; lies?: number; ecriture?: Record<string, unknown> | null; porte?: number } = {}) {
  const bulletins = opts.bulletins ?? [bulletin(1), bulletin(2)];
  const tx = {
    bulletinPaie: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    ecriture: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    bulletinPaie: {
      findMany: jest.fn().mockResolvedValue(bulletins),
      updateMany: jest.fn().mockResolvedValue({ count: opts.lies ?? bulletins.length }),
      count: jest.fn().mockResolvedValue(opts.porte ?? 2),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od' }) },
    compte: {
      findMany: jest.fn(async ({ where }: { where: { numero: { in: string[] } } }) =>
        where.numero.in.map((numero) => ({ id: `c-${numero}`, numero, typeCompte: 'DETAIL' })),
      ),
    },
    ecriture: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(
        opts.ecriture === undefined
          ? { id: 'e1', statut: 'BROUILLARD', numeroPiece: 12, exercice: { statut: 'OUVERT' }, lignes: [] }
          : opts.ecriture,
      ),
    },
    $transaction: jest.fn(async (f: (t: typeof tx) => Promise<unknown>) => f(tx)),
  };
  const ecritures = { creer: jest.fn().mockResolvedValue({ id: 'e-paie', numeroPiece: 7 }) };
  const service = new ComptabilisationPaieService(prisma as never, ecritures as never);
  return { service, prisma, ecritures, tx };
}

const dto = { exerciceId: 'ex1', journalId: 'j-od', date: '2026-03-31' };

describe('passer la paie du mois', () => {
  it("poste UNE écriture, avec les lignes de la proposition, et le mois en libellé", async () => {
    const { service, ecritures } = monter();
    await service.comptabiliser('t1', 'u1', '2026-03', dto);
    expect(ecritures.creer).toHaveBeenCalledTimes(1);
    const [, , corps] = ecritures.creer.mock.calls[0];
    expect(corps.libelle).toBe('Paie du mois 2026-03');
    expect(corps.reference).toContain('1, 2');
    const debit = corps.lignes.reduce((n: number, l: { debit?: number }) => n + (l.debit ?? 0), 0);
    const credit = corps.lignes.reduce((n: number, l: { credit?: number }) => n + (l.credit ?? 0), 0);
    expect(debit).toBe(3_440_000);
    expect(credit).toBe(3_440_000);
    expect(corps.lignes[0].compteId).toMatch(/^c-66/);
  });

  it('lie les seuls bulletins encore libres, dans le dossier de la session', async () => {
    const { service, prisma } = monter();
    await service.comptabiliser('t1', 'u1', '2026-03', dto);
    expect(prisma.bulletinPaie.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', id: { in: ['b1', 'b2'] }, ecritureId: null, statut: 'EMIS' },
      data: { ecritureId: 'e-paie' },
    });
  });

  it("retire son écriture quand un autre clic a lié les bulletins entre-temps", async () => {
    const { service, tx } = monter({ lies: 1 });
    await expect(service.comptabiliser('t1', 'u1', '2026-03', dto)).rejects.toThrow(/a changé pendant la passation/);
    expect(tx.ecriture.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', id: 'e-paie' } });
    expect(tx.bulletinPaie.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', ecritureId: 'e-paie' },
      data: { ecritureId: null },
    });
  });

  it("ne poste rien quand tout est déjà passé", async () => {
    const { service, ecritures } = monter({ bulletins: [bulletin(1, 'e0')] });
    await expect(service.comptabiliser('t1', 'u1', '2026-03', dto)).rejects.toThrow(/Aucun bulletin/);
    expect(ecritures.creer).not.toHaveBeenCalled();
  });

  it('refuse un compte non ouvert en imputation, et le nomme', async () => {
    const { service, prisma, ecritures } = monter();
    prisma.compte.findMany.mockImplementation(async ({ where }: { where: { numero: { in: string[] } } }) =>
      where.numero.in.map((numero) => ({ id: `c-${numero}`, numero, typeCompte: numero === '44720000' ? 'TOTAL' : 'DETAIL' })),
    );
    await expect(service.comptabiliser('t1', 'u1', '2026-03', dto)).rejects.toThrow(/44720000/);
    expect(ecritures.creer).not.toHaveBeenCalled();
  });

  it('refuse un mois illisible', async () => {
    const { service } = monter();
    await expect(service.proposition('t1', '2026-3')).rejects.toThrow(/AAAA-MM/);
  });
});

describe('défaire la passation', () => {
  it("libère les bulletins et retire l'écriture au brouillard, dans une transaction", async () => {
    const { service, tx } = monter();
    await expect(service.annulerComptabilisation('t1', 'e1')).resolves.toEqual({ annule: true, bulletinsLiberes: 2 });
    expect(tx.bulletinPaie.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't1', ecritureId: 'e1' }, data: { ecritureId: null } });
    expect(tx.ecriture.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', id: 'e1' } });
  });

  it('refuse une écriture VALIDÉE · elle ne se retire plus (AUDCIF art. 22)', async () => {
    const { service, tx } = monter({
      ecriture: { id: 'e1', statut: 'VALIDEE', numeroPiece: 12, exercice: { statut: 'OUVERT' }, lignes: [] },
    });
    await expect(service.annulerComptabilisation('t1', 'e1')).rejects.toThrow(/validée/);
    expect(tx.ecriture.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse une écriture qui ne passe aucun bulletin · ce chemin n'efface pas le journal", async () => {
    const { service, tx } = monter({ porte: 0 });
    await expect(service.annulerComptabilisation('t1', 'e1')).rejects.toThrow(/aucun bulletin/);
    expect(tx.ecriture.deleteMany).not.toHaveBeenCalled();
  });
});
