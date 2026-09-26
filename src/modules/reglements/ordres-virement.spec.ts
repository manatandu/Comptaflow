import { Prisma } from '@prisma/client';
import { OrdresVirementService } from './ordres-virement.service';

const ribJournal = {
  id: 'rb',
  abrege: 'RAW-CDF',
  devise: 'CDF',
  codeBic: 'RAWBCDKI',
  codeBanque: null,
  codeGuichet: null,
  numeroCompte: '0001',
  cle: null,
  iban: null,
  banque: { intitule: 'Rawbank' },
  journal: { code: 'BQ' },
};

function comptes(ribs: Record<string, unknown[]>) {
  return [
    { id: 'c401', numero: '40110001', tiersCompte: { tiers: { id: 'tA', code: 'F001', nom: 'Fournisseur A', ribs: ribs.tA ?? [] } } },
    { id: 'c402', numero: '40110002', tiersCompte: { tiers: { id: 'tB', code: 'F002', nom: 'Fournisseur B', ribs: ribs.tB ?? [] } } },
    { id: 'c409', numero: '40110009', tiersCompte: null },
  ];
}

function monter(opts: { rib?: unknown; ribs?: Record<string, unknown[]> } = {}) {
  const prisma = {
    ribBanque: { findFirst: jest.fn(async () => (opts.rib === undefined ? ribJournal : opts.rib)) },
    journal: { findFirst: jest.fn(async () => ({ code: 'BQ' })) },
    compte: { findMany: jest.fn(async () => comptes(opts.ribs ?? {})) },
  };
  return { service: new OrdresVirementService(prisma as never), prisma };
}

const principal = (extra: Record<string, unknown> = {}) => ({
  banque: 'Equity BCDC',
  titulaire: null,
  iban: null,
  codeBanque: '00011',
  codeGuichet: null,
  numeroCompte: '777',
  cle: '12',
  codeBic: null,
  ...extra,
});

describe("préparer l'ordre · tout ce qu'il exige, avant la première pièce", () => {
  it('recopie le donneur (RIB du journal) et le RIB principal de chaque tiers', async () => {
    const { service, prisma } = monter({ ribs: { tA: [principal({ titulaire: 'SARL A' })], tB: [principal({ iban: 'GB82WEST12345698765432' })] } });
    const p = await service.preparer('t', 'bq', ['c401', 'c402']);
    expect(p.donneur).toEqual({ banque: 'Rawbank', coordonnees: '0001', codeBic: 'RAWBCDKI' });
    expect(p.beneficiaires.get('c401')).toMatchObject({ tiersId: 'tA', beneficiaire: 'SARL A', coordonnees: '00011 777 12' });
    expect(p.beneficiaires.get('c402')).toMatchObject({ beneficiaire: 'Fournisseur B', coordonnees: 'IBAN GB82 WEST 1234 5698 7654 32' });
    // Seul le principal est lu · le filtre est dans la REQUÊTE, pas dans une doublure qui rendrait tout.
    const select = (prisma.compte.findMany.mock.calls[0] as unknown as [{ select: { tiersCompte: { select: { tiers: { select: { ribs: unknown } } } } } }])[0];
    expect(select.select.tiersCompte.select.tiers.select.ribs).toEqual({ where: { tenantId: 't', estPrincipal: true } });
  });

  it("refuse un journal sans RIB · l'ordre n'aurait pas de compte à débiter", async () => {
    const { service } = monter({ rib: null, ribs: { tA: [principal()] } });
    await expect(service.preparer('t', 'bq', ['c401'])).rejects.toThrow(/Aucun RIB .* journal BQ/);
  });

  it('refuse un compte donneur tenu dans une autre monnaie que la monnaie de tenue', async () => {
    const { service } = monter({ rib: { ...ribJournal, devise: 'USD' }, ribs: { tA: [principal()] } });
    await expect(service.preparer('t', 'bq', ['c401'])).rejects.toThrow(/USD/);
  });

  it('nomme TOUS les tiers sans RIB principal et tout compte sans tiers, en un seul refus', async () => {
    const { service } = monter({ ribs: { tA: [principal()] } });
    await expect(service.preparer('t', 'bq', ['c401', 'c402', 'c409'])).rejects.toThrow(
      /F002 · Fournisseur B n'a pas de RIB principal ; le compte 40110009 n'est rattaché à aucun tiers/,
    );
  });
});

describe("créer, imprimer, annuler", () => {
  function monterOrdre(statut: string) {
    const ordre = { id: 'o1', statut, lignes: [], journal: { code: 'BQ', intitule: 'Banque' } };
    const update = jest.fn(async () => ordre);
    const lignesUpdate = jest.fn(async () => ({ count: 2 }));
    const prisma = {
      ordreVirement: { findFirst: jest.fn(async () => ordre), update },
      ligneOrdreVirement: { updateMany: lignesUpdate },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    return { service: new OrdresVirementService(prisma as never), update, lignesUpdate };
  }

  it("la PREMIÈRE impression passe l'ordre à IMPRIMÉ et en garde l'auteur ; une réimpression ne change que le compteur", async () => {
    const a = monterOrdre('A_IMPRIMER');
    await a.service.imprimer('t', 'o1', 'x@y.cd');
    expect(a.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({ nombreImpressions: { increment: 1 }, statut: 'IMPRIME', premiereImpressionPar: 'x@y.cd' }),
    });
    const b = monterOrdre('IMPRIME');
    await b.service.imprimer('t', 'o1', 'z@y.cd');
    expect(b.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { nombreImpressions: { increment: 1 } } });
  });

  it('un ordre annulé ne se réimprime pas', async () => {
    const { service, update } = monterOrdre('ANNULE');
    await expect(service.imprimer('t', 'o1', 'x@y.cd')).rejects.toThrow(/annulé/);
    expect(update).not.toHaveBeenCalled();
  });

  it('annuler exige un motif et LIBÈRE les pièces sans les défaire', async () => {
    const sans = monterOrdre('IMPRIME');
    await expect(sans.service.annuler('t', 'o1', 'x@y.cd', ' ')).rejects.toThrow(/motif/);
    expect(sans.lignesUpdate).not.toHaveBeenCalled();

    const avec = monterOrdre('IMPRIME');
    await avec.service.annuler('t', 'o1', 'x@y.cd', 'rejet de la banque');
    expect(avec.lignesUpdate).toHaveBeenCalledWith({ where: { tenantId: 't', ordreId: 'o1' }, data: { ecritureId: null } });
    expect(avec.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({ statut: 'ANNULE', annulePar: 'x@y.cd', motifAnnulation: 'rejet de la banque' }),
    });
  });

  it('numérote en continu par dossier et rejoue sur le numéro suivant quand deux créations se croisent', async () => {
    let dernier = 4;
    let collision = true;
    const create = jest.fn(async ({ data }: { data: { numero: number; total: number } }) => {
      if (collision) {
        collision = false;
        dernier = 5;
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
      }
      return { id: 'o', numero: data.numero, total: data.total };
    });
    const tx = { ordreVirement: { aggregate: jest.fn(async () => ({ _max: { numero: dernier } })), create } };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const service = new OrdresVirementService(prisma as never);
    const preparation = {
      donneur: { banque: 'Rawbank', coordonnees: '0001', codeBic: null },
      beneficiaires: new Map([['c401', { tiersId: 'tA', beneficiaire: 'A', banque: 'B', coordonnees: '1', codeBic: null }]]),
    };
    const r = await service.creer('t', 'x@y.cd', 'bq', '2026-09-25', preparation, [
      { compteId: 'c401', montant: 100.1, reference: null, ecritureId: 'e1', pieceReglement: 'BQ 7' },
      { compteId: 'c401', montant: 0.2, reference: null, ecritureId: 'e2', pieceReglement: 'BQ 8' },
    ]);
    expect(r.numero).toBe(6);
    expect(r.total).toBe(100.3);
    const lignes = (create.mock.calls[1] as unknown as [{ data: { lignes: { create: { tiersId: string; ecritureId: string }[] } } }])[0].data.lignes.create;
    expect(lignes.map((l) => [l.tiersId, l.ecritureId])).toEqual([['tA', 'e1'], ['tA', 'e2']]);
  });
});
