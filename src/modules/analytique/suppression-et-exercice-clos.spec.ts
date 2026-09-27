import { AnalytiqueService } from './analytique.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';

/**
 * AUDIT FINAL F142 ET F143.
 *
 * F142 · la suppression d'une section ne comptait ni ses engagements, ni rien
 * d'autre que ses ventilations · la clé étrangère refusait avec une erreur
 * technique, et les budgets, effacés d'abord hors transaction, étaient perdus.
 *
 * F143 · les budgets et les engagements d'un exercice clôturé se retouchaient,
 * et la note d'exécution budgétaire d'un exercice arrêté changeait après coup.
 */

type Faux = Record<string, unknown>;

/**
 * La doublure HONORE les filtres que le service pose · le décompte des
 * références se fait relation par relation, lue dans le schéma, et une
 * doublure qui répondrait « un » partout validerait une liste qu'aucune
 * requête ne ramène.
 */
function prismaSuppression(usages: { engagements?: number; ventilations?: number; lignesOd?: number; ods?: number; budgetsClos?: number } = {}) {
  const ops: string[] = [];
  const compteur = (n: number | undefined, champ: string) =>
    jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const v = where[champ];
      const vise = v === 's1' || (typeof v === 'object' && v !== null && (v as { in: string[] }).in?.includes('s1')) || v === 'p1';
      return Promise.resolve(vise ? (n ?? 0) : 0);
    });
  const tx = {
    budgetSection: { deleteMany: jest.fn(() => (ops.push('budgets'), Promise.resolve({ count: 1 }))) },
    sectionAnalytique: {
      delete: jest.fn(() => (ops.push('section'), Promise.resolve({}))),
      deleteMany: jest.fn(() => (ops.push('sections'), Promise.resolve({ count: 1 }))),
    },
    planAnalytique: { delete: jest.fn(() => (ops.push('plan'), Promise.resolve({}))) },
  };
  const prisma = {
    sectionAnalytique: {
      findFirst: jest.fn().mockResolvedValue({ id: 's1', code: 'EAU', plan: { code: 'PROJ' } }),
      findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
      delete: tx.sectionAnalytique.delete,
      deleteMany: tx.sectionAnalytique.deleteMany,
      count: jest.fn().mockResolvedValue(0),
    },
    planAnalytique: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', code: 'PROJ' }), delete: tx.planAnalytique.delete },
    engagementDepense: { count: compteur(usages.engagements, 'sectionId') },
    ventilationAnalytique: { count: compteur(usages.ventilations, 'sectionId') },
    ligneOdAnalytique: { count: compteur(usages.lignesOd, 'sectionId') },
    odAnalytique: { count: compteur(usages.ods, 'planId') },
    budgetSection: {
      deleteMany: tx.budgetSection.deleteMany,
      count: jest.fn(({ where }: { where: { exercice?: { statut: string } } }) =>
        Promise.resolve(where.exercice?.statut === 'CLOTURE' ? (usages.budgetsClos ?? 0) : 0),
      ),
    },
    $transaction: jest.fn(async (fn: (t: Faux) => Promise<unknown>) => fn(tx as unknown as Faux)),
  } as Faux;
  return { prisma, ops };
}

const service = (prisma: Faux) => new AnalytiqueService(prisma as unknown as PrismaService);

describe('F142 · une section utilisée ne se supprime pas, et le refus la nomme', () => {
  it('un engagement retient la section · rien n’est effacé, budgets compris', async () => {
    const { prisma, ops } = prismaSuppression({ engagements: 1 });
    await expect(service(prisma).supprimerSection('t1', 's1')).rejects.toThrow(/section EAU.*engagements de dépense \(1\)/);
    expect(ops).toEqual([]);
  });

  it('les ventilations et les lignes d’OD aussi, chacune par son nom', async () => {
    const { prisma } = prismaSuppression({ ventilations: 2, lignesOd: 1 });
    await expect(service(prisma).supprimerSection('t1', 's1')).rejects.toThrow(
      /ventilations analytiques \(2\).*lignes d'OD analytique \(1\)|lignes d'OD analytique \(1\).*ventilations analytiques \(2\)/,
    );
  });

  it('libre, la section part avec ses budgets, dans une seule transaction', async () => {
    const { prisma, ops } = prismaSuppression();
    await expect(service(prisma).supprimerSection('t1', 's1')).resolves.toEqual({ supprime: true });
    expect(ops).toEqual(['budgets', 'section']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('un plan dont une section est engagée ne se supprime pas non plus', async () => {
    const { prisma, ops } = prismaSuppression({ engagements: 3 });
    await expect(service(prisma).supprimerPlan('t1', 'p1')).rejects.toThrow(/plan PROJ.*engagements de dépense \(3\)/);
    expect(ops).toEqual([]);
  });

  it('un plan qui porte des OD se nomme aussi', async () => {
    const { prisma } = prismaSuppression({ ods: 1 });
    await expect(service(prisma).supprimerPlan('t1', 'p1')).rejects.toThrow(/OD analytiques \(1\)/);
  });

  it('un plan libre part avec ses sections, dans une seule transaction', async () => {
    const { prisma, ops } = prismaSuppression();
    await expect(service(prisma).supprimerPlan('t1', 'p1')).resolves.toEqual({ supprime: true });
    expect(ops).toEqual(['sections', 'plan']);
  });
});

describe('F143 · un exercice clôturé garde son budget', () => {
  it('une section dotée sur un exercice clôturé ne se supprime pas', async () => {
    const { prisma, ops } = prismaSuppression({ budgetsClos: 13 });
    await expect(service(prisma).supprimerSection('t1', 's1')).rejects.toThrow(/budgets d'un exercice clôturé \(13\)/);
    expect(ops).toEqual([]);
  });

  it('ni le plan qui la porte', async () => {
    const { prisma, ops } = prismaSuppression({ budgetsClos: 13 });
    await expect(service(prisma).supprimerPlan('t1', 'p1')).rejects.toThrow(/budgets d'un exercice clôturé/);
    expect(ops).toEqual([]);
  });

  it('la dotation et la retouche d’un mois sont refusées sur un exercice clôturé', async () => {
    const transaction = jest.fn();
    const prisma = {
      sectionAnalytique: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', code: 'EAU', type: 'DETAIL', dateDebut: null, dateFin: null, plan: { gererBudgets: true, code: 'PROJ' } }),
      },
      exercice: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ex1', statut: 'CLOTURE', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }),
      },
      $transaction: transaction,
    } as Faux;
    await expect(service(prisma).doterBudget('t1', 's1', { exerciceId: 'ex1', montantAnnuel: 1200 })).rejects.toThrow(/exercice est clôturé/);
    await expect(service(prisma).modifierBudgetMois('t1', 's1', { exerciceId: 'ex1', mois: 3, montant: 100 })).rejects.toThrow(/exercice est clôturé/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('le report des budgets ne se pose pas sur un exercice suivant clôturé', async () => {
    const createMany = jest.fn();
    const prisma = {
      exercice: {
        findFirst: jest.fn(({ where }: { where: { id?: string } }) =>
          Promise.resolve(
            where.id
              ? { id: 'ex1', statut: 'CLOTURE', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }
              : { id: 'ex2', statut: 'CLOTURE', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
          ),
        ),
      },
      budgetSection: { findMany: jest.fn().mockResolvedValue([]), createMany },
      sectionAnalytique: { findMany: jest.fn().mockResolvedValue([]) },
    } as Faux;
    const exercices = new ExerciceService(prisma as unknown as PrismaService, {} as JournalService);
    await expect(exercices.reporterBudgets('t1', 'ex1')).rejects.toThrow(/exercice est clôturé/);
    expect(createMany).not.toHaveBeenCalled();
  });
});
