import { Prisma } from '@prisma/client';
import { OrdresVirementService, PLAFOND_ORDRES_LISTES } from './ordres-virement.service';

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
    const prisma: Record<string, unknown> = {
      ordreVirement: { findFirst: jest.fn(async () => ordre), update },
      ligneOrdreVirement: { updateMany: lignesUpdate },
      // La transaction exécute sa fonction sur la doublure (audit final F159).
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
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

/**
 * AUDIT FINAL F207 · la liste s'arrêtait aux cinq cents plus récents sans le
 * dire, et un ordre ancien resté à imprimer sortait de l'onglet. La doublure
 * HONORE le filtre (dossier, état), le tri et la borne, pour que le total et
 * le décompte des ordres à imprimer se lisent sur ce que la base rendrait.
 */
describe('la liste des ordres est une tranche qui se dit', () => {
  function monterListe(nombre: number, aImprimer: number[]) {
    const tous = Array.from({ length: nombre }, (_, i) => ({
      id: `o${i + 1}`,
      tenantId: 't',
      numero: i + 1,
      statut: aImprimer.includes(i + 1) ? 'A_IMPRIMER' : 'IMPRIME',
    }));
    // Un ordre d'un autre dossier, que ni la liste ni les décomptes ne voient.
    tous.push({ id: 'x', tenantId: 'autre', numero: 1, statut: 'A_IMPRIMER' });
    const garde = (where: { tenantId: string; statut?: string }) =>
      tous.filter((o) => o.tenantId === where.tenantId && (where.statut === undefined || o.statut === where.statut));
    const prisma = {
      ordreVirement: {
        findMany: jest.fn(async ({ where, orderBy, take }: { where: { tenantId: string }; orderBy: { numero: 'desc' }; take: number }) => {
          expect(orderBy).toEqual({ numero: 'desc' });
          return [...garde(where)].sort((a, b) => b.numero - a.numero).slice(0, take);
        }),
        count: jest.fn(async ({ where }: { where: { tenantId: string; statut?: string } }) => garde(where).length),
      },
    };
    return { service: new OrdresVirementService(prisma as never), prisma };
  }

  it('au-delà du plafond · les plus récents, le total du dossier, et les ordres à imprimer restés hors de la tranche', async () => {
    const { service, prisma } = monterListe(PLAFOND_ORDRES_LISTES + 2, [1, PLAFOND_ORDRES_LISTES + 2]);
    const r = await service.lister('t');
    expect(prisma.ordreVirement.findMany.mock.calls[0][0].take).toBe(PLAFOND_ORDRES_LISTES);
    expect(r.ordres).toHaveLength(PLAFOND_ORDRES_LISTES);
    expect(r.ordres[0].numero).toBe(PLAFOND_ORDRES_LISTES + 2);
    expect(r.total).toBe(PLAFOND_ORDRES_LISTES + 2);
    expect(r.tronque).toBe(true);
    // L'ordre n° 1, à imprimer, n'est pas dans la tranche · il est compté quand même.
    expect(r.ordres.some((o) => o.numero === 1)).toBe(false);
    expect(r.enAttenteImpression).toBe(2);
  });

  it('une liste entière ne se dit pas tronquée', async () => {
    const { service } = monterListe(3, [2]);
    const r = await service.lister('t');
    expect(r).toMatchObject({ total: 3, tronque: false, enAttenteImpression: 1, statut: null });
    expect(r.ordres.map((o) => o.numero)).toEqual([3, 2, 1]);
  });

  /**
   * AUDIT FINAL F207, LE RESTE · le filtre par état. La liste et son total se
   * lisent sur le MÊME filtre, les ordres à imprimer sur le dossier entier.
   */
  it('filtrée par état · la liste et son total ne portent que cet état, et le filtre est rendu', async () => {
    const { service, prisma } = monterListe(6, [2, 5]);
    const r = await service.lister('t', 'A_IMPRIMER' as never);
    expect(prisma.ordreVirement.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't', statut: 'A_IMPRIMER' });
    expect(r.ordres.map((o) => o.numero)).toEqual([5, 2]);
    expect(r).toMatchObject({ total: 2, tronque: false, enAttenteImpression: 2, statut: 'A_IMPRIMER' });
  });

  it('un filtre qui ne garde qu’une partie du dossier ne se dit pas tronqué pour autant', async () => {
    // Le dossier dépasse le plafond, l'état filtré non · un total pris sur le
    // dossier entier annoncerait une tranche sur une liste complète.
    const { service } = monterListe(PLAFOND_ORDRES_LISTES + 2, [1, 3]);
    const r = await service.lister('t', 'A_IMPRIMER' as never);
    expect(r.ordres.map((o) => o.numero)).toEqual([3, 1]);
    expect(r).toMatchObject({ total: 2, tronque: false });
  });

  it('filtrée au-delà du plafond · la tranche se dit, les ordres à imprimer restent comptés sur le dossier', async () => {
    const { service } = monterListe(PLAFOND_ORDRES_LISTES + 3, [1]);
    const r = await service.lister('t', 'IMPRIME' as never);
    expect(r.ordres).toHaveLength(PLAFOND_ORDRES_LISTES);
    expect(r.ordres.every((o) => o.statut === 'IMPRIME')).toBe(true);
    expect(r).toMatchObject({ total: PLAFOND_ORDRES_LISTES + 2, tronque: true, statut: 'IMPRIME' });
    // Aucun ordre à imprimer dans une liste filtrée sur « Imprimé » · celui du
    // dossier est compté quand même, pour que l'écran dise qu'il attend.
    expect(r.enAttenteImpression).toBe(1);
  });

  it('un état inconnu est refusé avant toute lecture, jamais ignoré', async () => {
    const { service, prisma } = monterListe(3, [2]);
    await expect(service.lister('t', 'INCONNU' as never)).rejects.toThrow(/État d'ordre de virement inconnu : INCONNU/);
    expect(prisma.ordreVirement.findMany).not.toHaveBeenCalled();
    expect(prisma.ordreVirement.count).not.toHaveBeenCalled();
  });
});
