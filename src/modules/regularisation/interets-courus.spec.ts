import { Referentiel, TypeRegularisation } from '@prisma/client';
import { RegularisationService } from './regularisation.service';
import { chargeInteretsProposee, compteInteretsCourus, motifRefusChargeInterets } from './interets-courus';

/**
 * LIGNE A12 · intérêts courus sur emprunts, D 671 / C 166 au SYSCOHADA,
 * D 671 / C 186 au SYCEBNL, contre-passés à l'ouverture (AUDCIF, Titre VII,
 * fiche du compte 16 ; SYCEBNL, Partie 2 ch. 3, fiche du compte 18).
 */

const racine = (r: Referentiel, n: string) => {
  const x = compteInteretsCourus(r, n);
  return 'racine' in x ? x.racine : `REFUS:${x.refus}`;
};

describe('A12 · le compte d’intérêts courus se lit sur l’emprunt, par plan', () => {
  it('SYSCOHADA · 16x vers 166x, le chiffre de la catégorie repris', () => {
    expect(
      ['16110000', '16200000', '16300000', '16400000', '16510000', '16720000', '16840000'].map((n) => racine(Referentiel.SYSCOHADA, n)),
    ).toEqual(['1661', '1662', '1663', '1664', '1665', '1667', '1668']);
  });

  it('SYCEBNL · 18x vers 186x ; le 16 y est un fonds', () => {
    expect(['18100000', '18200000', '18300000', '18510000', '18800000'].map((n) => racine(Referentiel.SYCEBNL, n))).toEqual([
      '1861',
      '1862',
      '1863',
      '1865',
      '1868',
    ]);
    expect(racine(Referentiel.SYCEBNL, '16200000')).toMatch(/fonds affecté/);
  });

  it('un numéro, deux plans · le 18 du SYSCOHADA n’est pas un emprunt du 16', () => {
    expect(racine(Referentiel.SYSCOHADA, '18100000')).toMatch(/participations \(18\)/);
  });

  it('trois refus écrits · 184 SYCEBNL sans 1864, rente viagère, location acquisition', () => {
    expect(racine(Referentiel.SYCEBNL, '18400000')).toMatch(/aucun intérêt couru.*à la main/);
    expect(racine(Referentiel.SYSCOHADA, '16810000')).toMatch(/1681/);
    expect(racine(Referentiel.SYCEBNL, '18710000')).toMatch(/location acquisition/);
    expect(racine(Referentiel.SYSCOHADA, '16610000')).toMatch(/désignez l’emprunt/);
  });

  it('chaque racine rendue est un 166x ou un 186x, jamais un autre compte', () => {
    for (const r of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      for (let a = 10; a < 20; a++) {
        for (let b = 0; b < 10; b++) {
          const x = compteInteretsCourus(r, `${a}${b}00000`);
          if ('racine' in x) expect(x.racine).toMatch(r === Referentiel.SYSCOHADA ? /^166[1-578]$/ : /^186[1-358]$/);
        }
      }
    }
  });

  it('la charge · 6711, 6712, 6741, 6742, 6748 ; primes de remboursement et intérêts commerciaux refusés', () => {
    for (const n of ['67110000', '67120000', '67410000', '67420000', '67480000']) expect(motifRefusChargeInterets(n)).toBeNull();
    for (const n of ['67130000', '67140000', '67440000', '67450000', '60500000']) expect(motifRefusChargeInterets(n)).toMatch(/671.*674/);
  });

  it('la charge proposée nomme la même dette, sinon rien', () => {
    expect(chargeInteretsProposee(Referentiel.SYSCOHADA, '16200000')).toBe('6712');
    expect(chargeInteretsProposee(Referentiel.SYCEBNL, '18100000')).toBe('6711');
    expect(chargeInteretsProposee(Referentiel.SYCEBNL, '18510000')).toBe('6741');
    expect(chargeInteretsProposee(Referentiel.SYSCOHADA, '16400000')).toBe('6742');
    expect(chargeInteretsProposee(Referentiel.SYSCOHADA, '16840000')).toBeNull();
  });
});

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function monde(referentiel: Referentiel) {
  const comptes: Record<string, { id: string; numero: string; classe: string }> = {
    emprunt: { id: 'emprunt', numero: referentiel === Referentiel.SYSCOHADA ? '16200000' : '18200000', classe: 'CLASSE_1' },
    charge: { id: 'charge', numero: '67120000', classe: 'CLASSE_6' },
    commerciale: { id: 'commerciale', numero: '67440000', classe: 'CLASSE_6' },
  };
  const exercices: Record<string, unknown> = {
    n: { id: 'n', statut: 'OUVERT', dateDebut: d('2026-01-01'), dateFin: d('2026-12-31') },
    n1: { id: 'n1', statut: 'OUVERT', dateDebut: d('2027-01-01'), dateFin: d('2027-12-31') },
  };
  let enregistree: Record<string, unknown> | null = null;
  const ecritures: Array<{ date: string; lignes: Array<{ compteId: string; debit?: number; credit?: number }> }> = [];
  const prisma = {
    exercice: { findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(exercices[where.id] ?? null)) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { id?: string; numero?: { startsWith: string } } }) => {
        if (where.id) return Promise.resolve(comptes[where.id] ?? null);
        const r = where.numero?.startsWith ?? '';
        return Promise.resolve({ id: `cpt${r}`, numero: `${r}0000`.slice(0, 8), classe: 'CLASSE_1' });
      }),
    },
    tenant: { findFirst: jest.fn().mockResolvedValue({ referentiel }) },
    journal: { findMany: jest.fn().mockResolvedValue([{ id: 'od', code: 'OD', type: 'GENERAL' }]) },
    ecriture: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ lignes: ecritures[Number(where.id.slice(1)) - 1].lignes })),
    },
    regularisation: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        enregistree = { id: 'r1', ecritureRepriseId: null, ...data };
        return Promise.resolve(enregistree);
      }),
      findFirst: jest.fn(() => Promise.resolve(enregistree)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({}),
    },
  };
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { date: string; lignes: Array<{ compteId: string; debit?: number; credit?: number }> }) => {
      ecritures.push(dto);
      return Promise.resolve({ id: `e${ecritures.length}` });
    }),
  };
  return { svc: new RegularisationService(prisma as never, ecritureService as never), ecritures };
}

const dto = (o: object = {}) => ({
  exerciceId: 'n',
  type: TypeRegularisation.CHARGE_A_PAYER,
  libelle: 'Intérêts courus du prêt BIC',
  compteChargeProduitId: 'charge',
  compteEmpruntId: 'emprunt',
  natureTiers: 'PRETEURS',
  montantTotal: 375_000,
  periodeDebut: '2026-10-01',
  periodeFin: '2026-12-31',
  ...o,
});

describe('A12 · la charge à payer « prêteurs » passe par le module des régularisations', () => {
  it.each([
    [Referentiel.SYSCOHADA, 'cpt1662'],
    [Referentiel.SYCEBNL, 'cpt1862'],
  ])('%s · D 6712 / C %s au dernier jour, contre-passé à l’ouverture de N+1', async (referentiel, interets) => {
    const { svc, ecritures } = monde(referentiel);
    await svc.creer('t1', 'u1', dto() as never);
    expect(ecritures[0]).toMatchObject({
      date: '2026-12-31',
      lignes: [
        { compteId: 'charge', debit: 375_000 },
        { compteId: interets, credit: 375_000 },
      ],
    });
    await svc.reprendre('t1', 'u1', 'r1', 'n1');
    expect(ecritures[1]).toMatchObject({
      date: '2027-01-01',
      lignes: [
        { compteId: interets, debit: 375_000 },
        { compteId: 'charge', credit: 375_000 },
      ],
    });
  });

  it('la simulation rend le montant DÉCLARÉ entier et le compte d’intérêts courus', async () => {
    const { svc } = monde(Referentiel.SYSCOHADA);
    const s = await svc.simuler('t1', dto() as never);
    expect([s.montantExercice, s.compteRattachement?.numero]).toEqual([375_000, '16620000']);
  });

  it('refus nommés · sans emprunt, charge commerciale, période au-delà de la clôture, produit à recevoir', async () => {
    const { svc } = monde(Referentiel.SYSCOHADA);
    await expect(svc.creer('t1', 'u1', dto({ compteEmpruntId: undefined }) as never)).rejects.toThrow(/Désignez l'emprunt/);
    await expect(svc.creer('t1', 'u1', dto({ compteChargeProduitId: 'commerciale' }) as never)).rejects.toThrow(/671.*674/);
    await expect(svc.creer('t1', 'u1', dto({ periodeFin: '2027-01-15' }) as never)).rejects.toThrow(/jusqu'au jour de la clôture/);
    await expect(svc.simuler('t1', dto({ type: TypeRegularisation.PRODUIT_A_RECEVOIR }) as never)).rejects.toThrow(/charge à payer/);
  });

  it('un emprunt désigné pour une autre nature est refusé · le compte de tiers ne se choisit pas', async () => {
    const { svc } = monde(Referentiel.SYSCOHADA);
    await expect(svc.creer('t1', 'u1', dto({ natureTiers: 'FOURNISSEURS' }) as never)).rejects.toThrow(/prêteurs/);
  });
});
