import {
  coordonneesImprimees,
  motifRefusAnnulation,
  motifRefusDeviseDonneur,
  motifRefusImpression,
  motifRefusRibTiers,
} from './ribs-tiers';
import { RibsTiersService } from './ribs-tiers.service';

describe('RIB des tiers · ce qui permet de payer', () => {
  it('refuse un RIB sans banque, ou sans aucun numéro de compte', () => {
    expect(motifRefusRibTiers({ banque: '', numeroCompte: '123' })).toMatch(/banque/);
    expect(motifRefusRibTiers({ banque: 'Rawbank', iban: '', numeroCompte: '  ' })).toMatch(/ni numéro de compte/);
    expect(motifRefusRibTiers({ banque: 'Rawbank', numeroCompte: '00012' })).toBeNull();
  });

  it("contrôle l'IBAN par sa clé ISO 13616, et seulement lui", () => {
    expect(motifRefusRibTiers({ banque: 'B', iban: 'GB82 WEST 1234 5698 7654 32' })).toBeNull();
    expect(motifRefusRibTiers({ banque: 'B', iban: 'GB83WEST12345698765432' })).toMatch(/IBAN invalide/);
    // Le RIB national se conserve sans se vérifier · aucun format n'est au corpus.
    expect(motifRefusRibTiers({ banque: 'B', codeBanque: 'x', numeroCompte: '??' })).toBeNull();
  });

  it("imprime l'IBAN par groupes de quatre, sinon le RIB national dans l'ordre de la fiche", () => {
    expect(coordonneesImprimees({ iban: 'gb82west12345698765432', numeroCompte: '9' })).toBe('IBAN GB82 WEST 1234 5698 7654 32');
    expect(coordonneesImprimees({ codeBanque: '00011', codeGuichet: '01000', numeroCompte: '1234567', cle: '42' })).toBe(
      '00011 01000 1234567 42',
    );
  });
});

describe("ordre de virement · le donneur d'ordre en monnaie de tenue", () => {
  it('admet le franc et un RIB sans devise, refuse toute autre monnaie', () => {
    expect(motifRefusDeviseDonneur(null, 'BQ')).toBeNull();
    expect(motifRefusDeviseDonneur('cdf', 'BQ')).toBeNull();
    expect(motifRefusDeviseDonneur('USD', 'BQ')).toMatch(/USD.*CDF/);
  });
});

describe("ordre de virement · l'état « en attente d'impression »", () => {
  it('un ordre annulé ne se réimprime pas', () => {
    expect(motifRefusImpression('A_IMPRIMER')).toBeNull();
    expect(motifRefusImpression('IMPRIME')).toBeNull();
    expect(motifRefusImpression('ANNULE')).not.toBeNull();
  });

  it("l'annulation exige un motif, et ne se fait qu'une fois", () => {
    expect(motifRefusAnnulation('IMPRIME', '  ')).toMatch(/motif/);
    expect(motifRefusAnnulation('ANNULE', 'rejet banque')).toMatch(/déjà annulé/);
    expect(motifRefusAnnulation('IMPRIME', 'rejet banque')).toBeNull();
  });
});

describe('RibsTiersService · un seul principal par tiers', () => {
  function monter(existants: number) {
    const appels: string[] = [];
    const tx = {
      ribTiers: {
        updateMany: jest.fn(async () => {
          appels.push('retire');
          return { count: 1 };
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          appels.push('cree');
          return data;
        }),
      },
    };
    const prisma = {
      tiers: { findFirst: jest.fn(async () => ({ id: 'ti' })) },
      ribTiers: { count: jest.fn(async () => existants) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { service: new RibsTiersService(prisma as never), tx, appels };
  }

  it("le premier RIB d'un tiers est principal d'office", async () => {
    const { service } = monter(0);
    const r = (await service.creer('t', 'ti', { banque: 'Rawbank', numeroCompte: '1' })) as unknown as { estPrincipal: boolean };
    expect(r.estPrincipal).toBe(true);
  });

  it("un second RIB n'est principal que s'il est coché, et retire alors la marque au précédent, AVANT de créer", async () => {
    const sans = monter(1);
    expect(((await sans.service.creer('t', 'ti', { banque: 'B', numeroCompte: '2' })) as unknown as { estPrincipal: boolean }).estPrincipal).toBe(false);
    expect(sans.tx.ribTiers.updateMany).not.toHaveBeenCalled();

    const avec = monter(1);
    await avec.service.creer('t', 'ti', { banque: 'B', numeroCompte: '2', estPrincipal: true });
    expect(avec.tx.ribTiers.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't', tiersId: 'ti' }, data: { estPrincipal: false } });
    expect(avec.appels).toEqual(['retire', 'cree']);
  });

  it("normalise l'IBAN avant de le ranger, et refuse un RIB qui ne permet pas de payer", async () => {
    const { service } = monter(0);
    const r = (await service.creer('t', 'ti', { banque: 'B', iban: 'gb82 west 1234 5698 7654 32' })) as unknown as { iban: string };
    expect(r.iban).toBe('GB82WEST12345698765432');
    await expect(service.creer('t', 'ti', { banque: 'B' })).rejects.toThrow(/ni numéro de compte/);
  });
});

describe('suppression du tiers · ses RIB partent avec lui, un ordre de virement le retient', () => {
  function monter(comptes: Record<string, number>) {
    const deleteMany = jest.fn(() => 'rib-supprimes');
    const delegue = (nom: string) => ({
      count: jest.fn(async () => comptes[nom] ?? 0),
      deleteMany: nom === 'ribTiers' ? deleteMany : jest.fn(() => nom),
      delete: jest.fn(() => nom),
    });
    const prisma: Record<string, unknown> = new Proxy(
      {
        tiers: { findFirst: jest.fn(async () => ({ id: 'ti', code: 'F001', comptesRattaches: [] })), delete: jest.fn(() => 'tiers') },
        $transaction: jest.fn(async (ops: unknown[]) => ops),
      } as Record<string, unknown>,
      { get: (cible, nom: string) => (nom in cible ? cible[nom] : (cible[nom] = delegue(nom))) },
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TiersService } = require('./tiers.service');
    return { service: new TiersService(prisma as never), deleteMany, prisma };
  }

  it('un tiers qui porte des RIB se supprime, et ses RIB sont retirés dans la même transaction', async () => {
    const { service, deleteMany, prisma } = monter({ ribTiers: 2 });
    await expect(service.supprimer('t', 'ti')).resolves.toEqual({ supprime: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't', tiersId: 'ti' } });
    const ops = ((prisma.$transaction as jest.Mock).mock.calls[0] as unknown[][])[0];
    expect(ops[0]).toBe('rib-supprimes');
  });

  it("un tiers payé par un ordre de virement ne se supprime pas", async () => {
    const { service } = monter({ ligneOrdreVirement: 1 });
    await expect(service.supprimer('t', 'ti')).rejects.toThrow(/ordres de virement/);
  });
});
