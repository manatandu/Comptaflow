import { BadRequestException } from '@nestjs/common';
import { AnalytiqueService } from './analytique.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Les trois règles qui font la valeur de l'analytique d'une EBNL, et qu'aucune
 * relecture de code ne garantit :
 *
 *  1. la répartition d'un budget sur les mois RÉELLEMENT couverts par la
 *     convention, et non sur douze ;
 *  2. l'équilibre de la ventilation PAR PLAN (une dépense partagée entre deux
 *     projets est légitime, une dépense à moitié ventilée ne l'est pas) ;
 *  3. le refus des sections Total, qui totalisent dans les états et ne
 *     reçoivent pas d'imputation directe.
 */

type Faux = Record<string, unknown>;

function service(prisma: Faux) {
  return new AnalytiqueService(prisma as unknown as PrismaService);
}

describe('budget · répartition sur les mois couverts par la convention', () => {
  const exercice = { id: 'ex1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

  function prismaAvecSection(section: Faux) {
    const creees: Faux[] = [];
    return {
      creees,
      prisma: {
        sectionAnalytique: { findFirst: jest.fn().mockResolvedValue(section) },
        exercice: { findFirst: jest.fn().mockResolvedValue(exercice) },
        budgetSection: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (fn: (tx: Faux) => Promise<void>) => {
          await fn({
            budgetSection: {
              deleteMany: jest.fn(),
              create: jest.fn(),
              createMany: jest.fn(({ data }: { data: Faux[] }) => {
                creees.push(...data);
                return Promise.resolve();
              }),
            },
          });
        }),
      } as Faux,
    };
  }

  it('sans convention, répartit sur les douze mois de l’exercice', async () => {
    const { prisma, creees } = prismaAvecSection({
      id: 's1',
      tenantId: 't1',
      type: 'DETAIL',
      dateDebut: null,
      dateFin: null,
      plan: { gererBudgets: true, code: 'PROJ' },
    });
    await service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 1200 });
    expect(creees).toHaveLength(12);
    expect(creees.map((c) => c.mois)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(creees.every((c) => Number(c.montant) === 100)).toBe(true);
  });

  it('convention de huit mois : huit dotations, pas douze', async () => {
    const { prisma, creees } = prismaAvecSection({
      id: 's1',
      tenantId: 't1',
      type: 'DETAIL',
      dateDebut: new Date('2026-03-01'),
      dateFin: new Date('2026-10-31'),
      plan: { gererBudgets: true, code: 'PROJ' },
    });
    await service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 800 });
    expect(creees).toHaveLength(8);
    expect(creees.map((c) => c.mois)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(creees.every((c) => Number(c.montant) === 100)).toBe(true);
  });

  it('le reliquat d’arrondi tombe sur le dernier mois, la somme reste exacte', async () => {
    const { prisma, creees } = prismaAvecSection({
      id: 's1',
      tenantId: 't1',
      type: 'DETAIL',
      dateDebut: null,
      dateFin: null,
      plan: { gererBudgets: true, code: 'PROJ' },
    });
    await service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 1000 });
    const somme = creees.reduce((t, c) => t + Number(c.montant), 0);
    expect(Math.round(somme * 100) / 100).toBe(1000);
    expect(Number(creees[11].montant)).toBeCloseTo(83.37, 2);
  });

  it('refuse de doter une section Total', async () => {
    const { prisma } = prismaAvecSection({
      id: 's1',
      tenantId: 't1',
      type: 'TOTAL',
      dateDebut: null,
      dateFin: null,
      plan: { gererBudgets: true, code: 'PROJ' },
    });
    await expect(
      service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse quand la convention ne recouvre aucun mois de l’exercice', async () => {
    const { prisma } = prismaAvecSection({
      id: 's1',
      tenantId: 't1',
      type: 'DETAIL',
      dateDebut: new Date('2027-01-01'),
      dateFin: new Date('2027-12-31'),
      plan: { gererBudgets: true, code: 'PROJ' },
    });
    await expect(
      service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ventilation · équilibre par plan', () => {
  const ligne = {
    id: 'l1',
    debit: 1000,
    credit: 0,
    compte: { numero: '60410000', classe: 'CLASSE_6' },
  };
  const sections = [
    { id: 'sA', planId: 'p1', code: 'EAU', type: 'DETAIL', estActive: true, plan: { code: 'PROJ' } },
    { id: 'sB', planId: 'p1', code: 'SANTE', type: 'DETAIL', estActive: true, plan: { code: 'PROJ' } },
    { id: 'sC', planId: 'p2', code: 'UE', type: 'DETAIL', estActive: true, plan: { code: 'BAIL' } },
  ];

  function prisma(sectionsRenvoyees = sections) {
    return {
      ligneEcriture: { findFirst: jest.fn().mockResolvedValue(ligne) },
      // Le double respecte le `where.id.in` : le service compare le nombre de
      // sections trouvées au nombre demandé pour détecter une section d'un
      // autre dossier, et un double qui renvoie tout ferait échouer ce
      // contrôle sur des cas parfaitement valides.
      sectionAnalytique: {
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(sectionsRenvoyees.filter((s) => where.id.in.includes(s.id as string))),
        ),
      },
      ventilationAnalytique: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (tx: Faux) => Promise<void>) => {
        await fn({
          ventilationAnalytique: { deleteMany: jest.fn(), createMany: jest.fn() },
        });
      }),
    } as Faux;
  }

  it('accepte une dépense partagée entre deux projets du même plan', async () => {
    await expect(
      service(prisma()).ventilerLigne('t1', 'l1', [
        { sectionId: 'sA', debit: 600 },
        { sectionId: 'sB', debit: 400 },
      ]),
    ).resolves.toBeDefined();
  });

  it('accepte deux plans à la fois, chacun couvrant la ligne en totalité', async () => {
    await expect(
      service(prisma()).ventilerLigne('t1', 'l1', [
        { sectionId: 'sA', debit: 1000 },
        { sectionId: 'sC', debit: 1000 },
      ]),
    ).resolves.toBeDefined();
  });

  it('refuse une ligne à moitié ventilée sur un plan', async () => {
    await expect(
      service(prisma()).ventilerLigne('t1', 'l1', [{ sectionId: 'sA', debit: 600 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une section Total', async () => {
    const totales = [{ ...sections[0], type: 'TOTAL' }];
    await expect(
      service(prisma(totales)).ventilerLigne('t1', 'l1', [{ sectionId: 'sA', debit: 1000 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une section en sommeil', async () => {
    const dormantes = [{ ...sections[0], estActive: false }];
    await expect(
      service(prisma(dormantes)).ventilerLigne('t1', 'l1', [{ sectionId: 'sA', debit: 1000 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ventilation obligatoire', () => {
  function prisma(plans: Faux[]) {
    return {
      planAnalytique: { findMany: jest.fn().mockResolvedValue(plans) },
      compte: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1', numero: '60410000', classe: 'CLASSE_6' }]),
      },
      sectionAnalytique: { findMany: jest.fn().mockResolvedValue([{ id: 'sA', planId: 'p1' }]) },
    } as Faux;
  }

  it('ne dit rien quand aucun plan n’est obligatoire', async () => {
    await expect(
      service(prisma([])).verifierVentilationObligatoire('t1', [{ compteId: 'c1' }]),
    ).resolves.toBeUndefined();
  });

  it('refuse une charge non ventilée quand le plan l’exige', async () => {
    const plans = [{ id: 'p1', code: 'PROJ', classesVentilees: '2,6,7,9' }];
    await expect(
      service(prisma(plans)).verifierVentilationObligatoire('t1', [{ compteId: 'c1' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('laisse passer une classe hors périmètre du plan', async () => {
    const plans = [{ id: 'p1', code: 'PROJ', classesVentilees: '2,7' }];
    await expect(
      service(prisma(plans)).verifierVentilationObligatoire('t1', [{ compteId: 'c1' }]),
    ).resolves.toBeUndefined();
  });
});
