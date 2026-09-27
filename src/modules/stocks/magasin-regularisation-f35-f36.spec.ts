import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MethodeInventaireStocks, Referentiel, SensMouvementStock } from '@prisma/client';
import { ConfronterInventaireDto } from './dto/magasin.dto';
import { MagasinService } from './magasin.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F35 ET F36 · LE BONI ET LE MALI D'INVENTAIRE AU MAGASIN.
 *
 * F36 · la confrontation rejouait TOUS les mouvements, y compris ceux saisis
 * après le comptage · l'écart était faux de leur montant. Elle ne rejoue plus
 * que le magasin au jour du comptage, mouvements du jour compris.
 *
 * F35 · la régularisation postait l'écriture et laissait la fiche à la
 * quantité théorique. Une nouvelle confrontation reproposait le même écart,
 * passé deux fois, et la fiche n'égalait plus jamais le compte. Chaque
 * différence entre désormais au magasin, liée à l'écriture.
 *
 * La doublure des mouvements HONORE la borne de date · une doublure qui
 * rendrait tous les mouvements validerait n'importe quelle requête.
 */

type Mvt = { ordre: number; date: string; sens: SensMouvementStock; quantite: number; cout: number | null };

// 100 à 12, 200 à 15, une sortie de 50 · 250 unités à 14 en C.M.P.A.C.E. Puis
// une sortie de 100 le 20 décembre, APRÈS le comptage du 30 juin.
const MOUVEMENTS: Mvt[] = [
  { ordre: 1, date: '2026-01-05', sens: SensMouvementStock.ENTREE, quantite: 100, cout: 1200 },
  { ordre: 2, date: '2026-02-10', sens: SensMouvementStock.ENTREE, quantite: 200, cout: 3000 },
  { ordre: 3, date: '2026-03-15', sens: SensMouvementStock.SORTIE, quantite: 50, cout: null },
  { ordre: 4, date: '2026-12-20', sens: SensMouvementStock.SORTIE, quantite: 100, cout: null },
];

function harnais(options: { echecInscription?: boolean } = {}) {
  const requetes: Array<{ lte?: Date }> = [];
  const crees: Array<Record<string, unknown>> = [];
  const supprimees: string[] = [];
  const postees: Array<{ date: string; lignes: Array<{ debit?: number; credit?: number }> }> = [];
  const prisma: Record<string, unknown> = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        methodeInventaireStocks: MethodeInventaireStocks.PERMANENT,
      }),
    },
    articleStock: {
      findMany: jest.fn().mockImplementation(
        ({ where, include }: { where: { tenantId: string; id: { in: string[] } }; include: { mouvements: { where?: { date?: { lte?: Date } } } } }) => {
          const lte = include.mouvements.where?.date?.lte;
          requetes.push({ lte });
          if (where.tenantId !== 't1' || !where.id.in.includes('a1')) return Promise.resolve([]);
          return Promise.resolve([
            {
              id: 'a1',
              code: 'ART-001',
              designation: 'Ciment 50 kg',
              uniteMesure: 'sac',
              methodeValorisation: 'CMPACE',
              compte: { numero: '33100000', intitule: 'Autres approvisionnements' },
              mouvements: MOUVEMENTS.filter((m) => !lte || new Date(m.date) <= lte).map((m) => ({
                ...m,
                date: new Date(m.date),
              })),
            },
          ]);
        },
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j1' }) },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { numero: { in: string[] } } }) =>
        Promise.resolve(where.numero.in.filter((n) => n.length === 8).map((n) => ({ id: `c${n}`, numero: n }))),
      ),
    },
    mouvementStock: {
      aggregate: jest.fn().mockResolvedValue({ _max: { ordre: 4 } }),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        if (options.echecInscription) return Promise.reject(new Error('contrainte'));
        crees.push(data);
        return Promise.resolve(data);
      }),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    ecriture: {
      delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        supprimees.push(where.id);
        return Promise.resolve({});
      }),
    },
  };
  prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { date: string; lignes: Array<{ debit?: number; credit?: number }> }) => {
      postees.push({ date: dto.date, lignes: dto.lignes });
      return Promise.resolve({ id: 'eReg', numeroPiece: 'OD-1' });
    }),
  } as unknown as EcritureService;
  return {
    svc: new MagasinService(prisma as unknown as PrismaService, ecritures),
    requetes,
    crees,
    supprimees,
    postees,
  };
}

const regularisation = (quantitePhysique: number) => ({
  dateComptage: '2026-06-30',
  comptages: [{ articleId: 'a1', quantitePhysique }],
  exerciceId: 'ex1',
  journalId: 'j1',
  date: '2026-12-31',
});

describe('F36 · le magasin se confronte au jour du comptage', () => {
  it('la sortie saisie après le comptage n’entre pas dans l’écart · mali de 10, et non boni de 90', async () => {
    const { svc } = harnais();
    const r = await svc.confronter('t1', [{ articleId: 'a1', quantitePhysique: 240 }], '2026-06-30');
    const [d] = r.confrontation!.differences;
    expect(d).toMatchObject({ sens: 'MALI', quantiteComptable: 250, ecartQuantite: -10, montant: 140 });
  });

  it('la requête elle-même porte la borne du comptage', async () => {
    const { svc, requetes } = harnais();
    await svc.confronter('t1', [{ articleId: 'a1', quantitePhysique: 240 }], '2026-06-30');
    expect(requetes).toEqual([{ lte: new Date('2026-06-30') }]);
  });

  it('les mouvements du jour même sont compris', async () => {
    const { svc } = harnais();
    const r = await svc.confronter('t1', [{ articleId: 'a1', quantitePhysique: 150 }], '2026-12-20');
    expect(r.confrontation!.sansDifference).toEqual([{ articleId: 'a1', code: 'ART-001', quantite: 150 }]);
  });
});

describe('F35 · la différence entre au magasin avec son écriture', () => {
  it('un mali entre en SORTIE, à la date du comptage, sans coût, lié à l’écriture', async () => {
    const { svc, crees, postees } = harnais();
    await svc.enregistrerRegularisation('t1', 'u1', regularisation(240));
    expect(postees).toHaveLength(1);
    expect(crees).toEqual([
      expect.objectContaining({
        articleId: 'a1',
        sens: SensMouvementStock.SORTIE,
        quantite: 10,
        cout: null,
        date: new Date('2026-06-30'),
        ordre: 5,
        ecritureId: 'eReg',
      }),
    ]);
  });

  it('un boni entre en ENTRÉE, au coût total porté au compte', async () => {
    const { svc, crees, postees } = harnais();
    await svc.enregistrerRegularisation('t1', 'u1', regularisation(260));
    const debitStock = postees[0].lignes.find((l) => (l.debit ?? 0) > 0)!.debit;
    expect(crees).toEqual([
      expect.objectContaining({ sens: SensMouvementStock.ENTREE, quantite: 10, cout: 140, ecritureId: 'eReg' }),
    ]);
    expect(debitStock).toBe(140);
  });

  it('une inscription refusée retire l’écriture · les deux vont ensemble', async () => {
    const { svc, supprimees } = harnais({ echecInscription: true });
    await expect(svc.enregistrerRegularisation('t1', 'u1', regularisation(240))).rejects.toThrow(/contrainte/);
    expect(supprimees).toEqual(['eReg']);
  });
});

describe('F36 · la porte exige la date du comptage', () => {
  it('une confrontation sans date est refusée à la validation', async () => {
    const sans = plainToInstance(ConfronterInventaireDto, { comptages: [] });
    const avec = plainToInstance(ConfronterInventaireDto, { comptages: [], dateComptage: '2026-06-30' });
    expect((await validate(sans)).map((e) => e.property)).toEqual(['dateComptage']);
    expect(await validate(avec)).toEqual([]);
  });
});
