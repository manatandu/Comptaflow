import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel, TypeTiers } from '@prisma/client';
import {
  COLLECTIFS_TIERS,
  numeroCollectif,
  prochainNumeroIndividuel,
  racineCollectif,
  regrouperSurCollectifs,
} from './collectifs-tiers';
import { TiersService } from './tiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Point 13 de la comparaison Sage i7 · compte collectif et comptes
 * individuels de tiers.
 */

// LA PRÉMISSE EST RELUE DANS LES DEUX SEMIS · un collectif absent ou mal
// intitulé ferait créer des comptes sous un numéro qui ne dit pas ce qu'il
// porte (le 411 est « Adhérents » au SYCEBNL, « Clients » au SYSCOHADA).
describe('les collectifs existent dans le plan semé, sous l’intitulé qui les justifie', () => {
  const semis = {
    [Referentiel.SYCEBNL]: readFileSync(join(__dirname, '../comptes/compte-seed.ts'), 'utf8'),
    [Referentiel.SYSCOHADA]: readFileSync(join(__dirname, '../comptes/compte-seed-syscohada.ts'), 'utf8'),
  };
  const intitules: Record<Referentiel, Partial<Record<TypeTiers, string>>> = {
    [Referentiel.SYCEBNL]: { FOURNISSEUR: 'Fournisseurs', ADHERENT: 'Adhérents', CLIENT: 'Clients-usagers' },
    [Referentiel.SYSCOHADA]: { FOURNISSEUR: 'Fournisseurs', CLIENT: 'Clients' },
  };
  for (const ref of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
    for (const [type, numero] of Object.entries(COLLECTIFS_TIERS[ref])) {
      it(`${ref} · ${type} → ${numero}`, () => {
        const intitule = intitules[ref][type as TypeTiers];
        expect(semis[ref]).toMatch(new RegExp(`'${numero}',\\s*'${intitule}'`));
      });
    }
  }

  it('aucun collectif pour un salarié ou un tiers « autre », ni d’adhérent au SYSCOHADA', () => {
    for (const ref of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      expect(numeroCollectif(ref, TypeTiers.SALARIE)).toBeNull();
      expect(numeroCollectif(ref, TypeTiers.AUTRE)).toBeNull();
    }
    expect(numeroCollectif(Referentiel.SYSCOHADA, TypeTiers.ADHERENT)).toBeNull();
    expect(numeroCollectif(Referentiel.SYSCOHADA, TypeTiers.CLIENT)).toBe('41110000');
    expect(numeroCollectif(Referentiel.SYCEBNL, TypeTiers.CLIENT)).toBe('41200000');
  });
});

describe('numéro du compte individuel', () => {
  it('racine sans les zéros de complément', () => {
    expect(racineCollectif('40110000')).toBe('4011');
    expect(racineCollectif('41100000')).toBe('411');
  });

  it('prend le premier numéro libre, jamais celui du collectif, à la longueur du dossier', () => {
    expect(prochainNumeroIndividuel('4011', 8, ['40110000'])).toBe('40110001');
    expect(prochainNumeroIndividuel('4011', 8, ['40110000', '40110001', '40110003'])).toBe('40110002');
    expect(prochainNumeroIndividuel('411', 10, ['41100000'])).toBe('4110000001');
  });

  it('rend null quand la racine ne laisse aucune place', () => {
    expect(prochainNumeroIndividuel('4011', 4, [])).toBeNull();
    const pleins = Array.from({ length: 9 }, (_, i) => `4011${i + 1}`);
    expect(prochainNumeroIndividuel('4011', 5, pleins)).toBeNull();
  });
});

describe('balance générale regroupée par collectif', () => {
  const l = (compteId: string, numero: string, debit: number, credit: number) => ({
    compteId,
    numero,
    intitule: numero,
    totalDebit: debit,
    totalCredit: credit,
    reportDebit: 0,
    reportCredit: 0,
    mouvementDebit: debit,
    mouvementCredit: credit,
    solde: debit - credit,
  });
  const collectif = { id: 'c4011', numero: '40110000', intitule: 'Fournisseurs' };

  it('fond les individuels sur leur collectif, avec ou sans ligne propre du collectif, et laisse les totaux intacts', () => {
    const lignes = [l('i1', '40110001', 0, 300), l('c4011', '40110000', 50, 0), l('i2', '40110002', 100, 500), l('b', '52100000', 650, 0)];
    const r = regrouperSurCollectifs(lignes, new Map([['i1', collectif], ['i2', collectif]]));
    expect(r.map((x) => x.numero)).toEqual(['40110000', '52100000']);
    expect(r[0]).toMatchObject({ compteId: 'c4011', totalDebit: 150, totalCredit: 800, solde: -650, regroupe: 2, intitule: 'Fournisseurs' });
    const somme = (t: typeof r) => t.reduce((s, x) => s + x.totalDebit - x.totalCredit, 0);
    expect(somme(r)).toBe(lignes.reduce((s, x) => s + x.solde, 0));
  });

  it('un compte sans collectif reste sur sa ligne', () => {
    const r = regrouperSurCollectifs([l('x', '40120000', 10, 0)], new Map());
    expect(r).toEqual([expect.objectContaining({ numero: '40120000', regroupe: 0 })]);
  });

  it('le service lit le lien du schéma, et rend les totaux de la balance compte par compte', async () => {
    const balance = { lignes: [l('i1', '40110001', 0, 300)], totaux: { debit: 0, credit: 300 } };
    const findMany = jest.fn().mockResolvedValue([{ id: 'i1', collectif }]);
    const r = await EcritureService.prototype.balanceRegroupeeParCollectif.call(
      { balance: jest.fn().mockResolvedValue(balance), prisma: { compte: { findMany } } },
      't1',
      'ex',
    );
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', collectifId: { not: null } });
    expect(r.lignes[0]).toMatchObject({ numero: '40110000', regroupe: 1 });
    expect(r.totaux).toBe(balance.totaux);
  });
});

describe('création du tiers et de son compte', () => {
  function monter(referentiel: Referentiel, comptes: { id: string; numero: string; estActif?: boolean }[]) {
    const crees: Record<string, unknown>[] = [];
    const rattaches: Record<string, unknown>[] = [];
    const p: Record<string, unknown> = {
      tenant: { findUniqueOrThrow: async () => ({ referentiel, longueurCompte: 8 }) },
      tiers: {
        findUnique: async () => null,
        findFirst: async () => ({ id: 'ti9', type: TypeTiers.AUTRE, nom: 'Divers', code: 'D' }),
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ti1', ...data }),
      },
      compte: {
        findFirst: async ({ where }: { where: { numero: string } }) => {
          const c = comptes.find((x) => x.numero === where.numero);
          return c ? { classe: 'CLASSE_4', typeCompte: 'DETAIL', modeReportANouveau: 'DETAIL', lettrable: true, estActif: true, ...c } : null;
        },
        findMany: async ({ where }: { where: { numero: { startsWith: string } } }) =>
          comptes.filter((c) => c.numero.startsWith(where.numero.startsWith)),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          crees.push(data);
          return { id: 'nouveau', ...data };
        },
      },
      tiersCompte: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          rattaches.push(data);
          return data;
        },
      },
    };
    p.$transaction = (f: (tx: unknown) => unknown) => f(p);
    return { service: new TiersService(p as unknown as PrismaService), crees, rattaches };
  }

  it('un fournisseur SYSCOHADA naît avec son compte sous le 4011, principal, rattaché au collectif', async () => {
    const { service, crees, rattaches } = monter(Referentiel.SYSCOHADA, [
      { id: 'c4011', numero: '40110000' },
      { id: 'x', numero: '40110001' },
    ]);
    const t = await service.creer('t1', { type: TypeTiers.FOURNISSEUR, code: 'F1', nom: 'Soco' });
    expect(crees[0]).toMatchObject({ numero: '40110002', intitule: 'Soco', collectifId: 'c4011', lettrable: true, modeReportANouveau: 'DETAIL' });
    expect(rattaches[0]).toMatchObject({ tiersId: 'ti1', estPrincipal: true });
    expect(t.compteIndividuel).toEqual({ id: 'nouveau', numero: '40110002', collectif: '40110000' });
  });

  it('un client SYCEBNL va au 412 Clients-usagers, pas au 411', async () => {
    const { service, crees } = monter(Referentiel.SYCEBNL, [{ id: 'c412', numero: '41200000' }]);
    await service.creer('t1', { type: TypeTiers.CLIENT, code: 'C1', nom: 'Usager' });
    expect(crees[0]).toMatchObject({ numero: '41200001', collectifId: 'c412' });
  });

  it('sans case cochée, ou pour un type sans collectif, le tiers naît sans compte', async () => {
    const { service, crees } = monter(Referentiel.SYSCOHADA, [{ id: 'c4011', numero: '40110000' }]);
    expect((await service.creer('t1', { type: TypeTiers.FOURNISSEUR, code: 'F2', nom: 'X', creerCompteIndividuel: false })).compteIndividuel).toBeNull();
    expect((await service.creer('t1', { type: TypeTiers.AUTRE, code: 'A1', nom: 'Y' })).compteIndividuel).toBeNull();
    expect(crees).toHaveLength(0);
  });

  it('demandé après coup pour un type sans collectif, il est refusé en le disant', async () => {
    const { service } = monter(Referentiel.SYSCOHADA, []);
    await expect(service.creerCompteIndividuel('t1', 'ti9')).rejects.toThrow(/pas de compte collectif proposé/);
  });
});
