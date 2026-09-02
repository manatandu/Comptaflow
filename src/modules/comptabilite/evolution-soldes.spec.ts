import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * DEUX COLONNES NE MONTRENT PAS UNE PROVISION FIGÉE DEPUIS QUATRE ANS.
 *
 * Le logiciel ne comparait que N et N-1, parce que c'est ce que les états
 * financiers publient. Le fichier de préparation de liasse relevé sur le Drive
 * aligne huit exercices, et c'est là que se voient les anomalies lentes : une
 * provision qui ne bouge plus, une créance douteuse jamais apurée, un compte
 * d'attente qui gonfle d'année en année.
 *
 * Ce spec garde la seule subtilité du calcul, celle qui se perd au premier
 * refactoring : VIDE et ZÉRO ne sont pas la même chose.
 */

function harnais(
  exercices: Array<{ id: string; annee: string }>,
  agregatsParExercice: Record<string, Array<{ compteId: string; debit: number; credit: number }>>,
  comptes = [
    { id: 'c1', numero: '471500', intitule: 'Provision fiscale', classe: 4 },
    { id: 'c2', numero: '411001', intitule: 'Clients', classe: 4 },
  ],
) {
  const groupBy = jest.fn().mockImplementation(({ where }) => {
    const id = where.ecriture.exerciceId as string;
    return Promise.resolve(
      (agregatsParExercice[id] ?? []).map((a) => ({
        compteId: a.compteId,
        _sum: { debit: a.debit, credit: a.credit },
      })),
    );
  });
  const prisma = {
    exercice: {
      findMany: jest.fn().mockResolvedValue(
        exercices.map((e) => ({
          id: e.id,
          dateDebut: new Date(`${e.annee}-01-01`),
          dateFin: new Date(`${e.annee}-12-31`),
          statut: 'CLOTURE',
        })),
      ),
    },
    compte: { findMany: jest.fn().mockResolvedValue(comptes) },
    ligneEcriture: { groupBy },
  } as unknown as PrismaService;
  return { service: new EcritureService(prisma, {} as never, {} as never, {} as never), prisma, groupBy };
}

describe('évolution pluriannuelle des soldes', () => {
  it('distingue un solde NUL d’un compte NON MOUVEMENTÉ', () => {
    // Zéro dit « soldé », vide dit « n'existait pas encore ». Les confondre
    // fait lire une extinction là où il n'y a qu'une création · c'est le genre
    // d'erreur qui envoie chercher une écriture d'apurement inexistante.
    const { service } = harnais(
      [
        { id: 'e2025', annee: '2025' },
        { id: 'e2024', annee: '2024' },
      ],
      {
        // 2025 : le compte est là, exactement soldé.
        e2025: [{ compteId: 'c1', debit: 500, credit: 500 }],
        // 2024 : il n'apparaît pas du tout.
        e2024: [],
      },
    );
    return service.evolutionSoldes('t').then((r) => {
      expect(r.lignes[0].soldes).toEqual([0, null]);
    });
  });

  it('range les exercices du plus récent au plus ancien', async () => {
    const { service, prisma } = harnais([{ id: 'e2025', annee: '2025' }], { e2025: [] });
    await service.evolutionSoldes('t');
    expect((prisma.exercice.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual({ dateDebut: 'desc' });
  });

  it('rend le solde SIGNÉ de clôture, à-nouveaux compris', async () => {
    // Le calcul agrège toutes les écritures de l'exercice, à-nouveaux inclus ·
    // c'est la définition de la balance (report + mouvements), et c'est ce qui
    // rend la colonne comparable à la balance de l'année.
    const { service, groupBy } = harnais([{ id: 'e2025', annee: '2025' }], {
      e2025: [
        { compteId: 'c1', debit: 0, credit: 1200.5 },
        { compteId: 'c2', debit: 900, credit: 250 },
      ],
    });
    const r = await service.evolutionSoldes('t');
    expect(r.lignes.find((l) => l.numero === '471500')!.soldes).toEqual([-1200.5]);
    expect(r.lignes.find((l) => l.numero === '411001')!.soldes).toEqual([650]);
    // Aucun filtre n'exclut les à-nouveaux · les exclure ferait, sur un compte
    // de bilan, une colonne qui ne veut rien dire.
    expect(groupBy.mock.calls[0][0].where.ecriture.estGenereeParCloture).toBeUndefined();
  });

  it('écarte les comptes que rien n’a touché sur toute la fenêtre', async () => {
    const { service } = harnais([{ id: 'e2025', annee: '2025' }], {
      e2025: [{ compteId: 'c1', debit: 100, credit: 0 }],
    });
    const r = await service.evolutionSoldes('t');
    expect(r.lignes.map((l) => l.numero)).toEqual(['471500']);
  });

  it('borne la fenêtre demandée', async () => {
    const { service, prisma } = harnais([{ id: 'e2025', annee: '2025' }], { e2025: [] });
    await service.evolutionSoldes('t', { nbExercices: 500 });
    expect((prisma.exercice.findMany as jest.Mock).mock.calls[0][0].take).toBe(20);

    const b = harnais([{ id: 'e2025', annee: '2025' }], { e2025: [] });
    await b.service.evolutionSoldes('t', { nbExercices: 1 });
    expect((b.prisma.exercice.findMany as jest.Mock).mock.calls[0][0].take).toBe(2);
  });

  it('écarte les comptes de Total, qui ne reçoivent jamais d’écriture', async () => {
    const { service, prisma } = harnais([{ id: 'e2025', annee: '2025' }], { e2025: [] });
    await service.evolutionSoldes('t');
    expect((prisma.compte.findMany as jest.Mock).mock.calls[0][0].where.typeCompte).toEqual({ not: 'TOTAL' });
  });
});
