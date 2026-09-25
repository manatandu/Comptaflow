import { Prisma, TypeJournal } from '@prisma/client';
import { ibanValide, motifRefusJournalBanque, normaliserIban } from './banques';
import { BanquesService } from './banques.service';

/**
 * POINT 19 · banques (Sage, Structure / Banque) et libellés pré-enregistrés
 * (Structure / Libellé).
 */
describe('Banques · règles', () => {
  it('IBAN · ISO 13616, espaces et casse sans importance, clé contrôlée', () => {
    expect(ibanValide('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(ibanValide('fr14 2004 1010 0505 0001 3m02 606')).toBe(true);
    expect(ibanValide('GB83 WEST 1234 5698 7654 32')).toBe(false); // clé fausse
    expect(ibanValide('GB82WEST')).toBe(false); // trop court
    expect(normaliserIban(' fr14 2004 ')).toBe('FR142004');
  });

  it('un RIB ne se rattache qu’à un journal de banque · ni achats, ni caisse', () => {
    expect(motifRefusJournalBanque(null)).toMatch(/introuvable/);
    expect(motifRefusJournalBanque({ code: 'ACH', type: TypeJournal.ACHATS, compteTresorerie: null })).toMatch(/pas un journal de trésorerie/);
    expect(motifRefusJournalBanque({ code: 'CA', type: TypeJournal.TRESORERIE, compteTresorerie: { numero: '57110000' } })).toMatch(/caisse/);
    expect(motifRefusJournalBanque({ code: 'BQ', type: TypeJournal.TRESORERIE, compteTresorerie: { numero: '52110000' } })).toBeNull();
  });
});

describe('Banques · service', () => {
  const monter = (opts: { journal?: unknown; ribPris?: unknown; conflit?: boolean } = {}) => {
    const crees: Record<string, unknown>[] = [];
    const appels: Record<string, unknown> = {};
    const prisma = {
      banque: { findFirst: async () => ({ id: 'b1' }) },
      journal: {
        findFirst: async (a: unknown) => {
          appels.journal = a;
          return opts.journal ?? null;
        },
      },
      ribBanque: {
        findFirst: async (a: unknown) => {
          appels.ribPris = a;
          return opts.ribPris ?? null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (opts.conflit) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
          crees.push(data);
          return data;
        },
      },
      libelleEcriture: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (opts.conflit) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
          crees.push(data);
          return data;
        },
      },
    };
    return { svc: new BanquesService(prisma as never), crees, appels };
  };
  const banque = { code: 'BQ', type: TypeJournal.TRESORERIE, compteTresorerie: { numero: '52110000' } };

  it('pose le RIB normalisé, rattaché à son journal de banque du dossier', async () => {
    const { svc, crees, appels } = monter({ journal: banque });
    await svc.creerRib('t1', 'b1', { abrege: ' BEU1 ', iban: 'gb82 west 1234 5698 7654 32', devise: 'usd', codeBic: 'beufr542', journalId: 'j1' });
    expect(crees[0]).toMatchObject({ abrege: 'BEU1', iban: 'GB82WEST12345698765432', devise: 'USD', codeBic: 'BEUFR542', journalId: 'j1', tenantId: 't1' });
    expect(appels.journal).toMatchObject({ where: { id: 'j1', tenantId: 't1' } });
  });

  it('refuse un IBAN faux, un journal qui n’est pas de banque, un journal déjà pris, sans rien écrire', async () => {
    let m = monter({ journal: banque });
    await expect(m.svc.creerRib('t1', 'b1', { abrege: 'X', iban: 'GB83WEST12345698765432' })).rejects.toThrow(/IBAN/);
    m = monter({ journal: { ...banque, compteTresorerie: { numero: '57110000' } } });
    await expect(m.svc.creerRib('t1', 'b1', { abrege: 'X', journalId: 'j1' })).rejects.toThrow(/caisse/);
    m = monter({ journal: banque, ribPris: { abrege: 'BEU2' } });
    await expect(m.svc.creerRib('t1', 'b1', { abrege: 'X', journalId: 'j1' })).rejects.toThrow(/porte déjà le RIB BEU2/);
    expect(m.appels.ribPris).toMatchObject({ where: { tenantId: 't1', journalId: 'j1' } });
    expect(m.crees).toHaveLength(0);
  });

  it('un RIB sans abrégé est refusé · c’est lui qui le désigne', async () => {
    await expect(monter().svc.creerRib('t1', 'b1', { abrege: '  ' })).rejects.toThrow(/abrégé/);
  });

  it('un doublon est refusé en le nommant', async () => {
    await expect(monter({ conflit: true }).svc.creerLibelle('t1', { code: 'loy', intitule: 'Loyer du mois' })).rejects.toThrow(
      /code LOY existe déjà/,
    );
  });

  it('le code du libellé se range en majuscules', async () => {
    const { svc, crees } = monter();
    await svc.creerLibelle('t1', { code: ' loy ', intitule: ' Loyer du mois ' });
    expect(crees[0]).toEqual({ tenantId: 't1', code: 'LOY', intitule: 'Loyer du mois' });
  });
});
