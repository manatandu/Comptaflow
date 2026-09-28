import { NotFoundException } from '@nestjs/common';
import { Prisma, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MOTIF_EXERCICE_INTROUVABLE, exerciceDuDossierOuRefus } from '../../common/exercice-introuvable';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { AucunPlanABudgetsException, EtatsFinanciersProjetBudgetService } from './etats-financiers-projet-budget.service';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { MOTIF_EXERCICE_INTROUVABLE as MOTIF_REEXPORTE } from './etats-financiers.communs';

/**
 * LES JUMEAUX DE L'AUDIT FINAL F222 · un exercice inconnu du dossier est un
 * 404 nommé, jamais une erreur brute de Prisma servie en 500, jamais un état
 * tout à zéro.
 *
 * F222 avait posé le refus sur les états qui cherchent leur comparatif
 * (`trouverExerciceN1`). Sept lecteurs y échappaient · la balance âgée, le
 * justificatif de solde, la balance cumulée (donc la Note 9 du jeu projets et
 * les colonnes cumulées du tableau emplois ressources), le tableau des
 * amortissements, le tableau d'exécution budgétaire et le tableau de
 * réconciliation de trésorerie. Les cinq premiers lisaient l'exercice par
 * `findFirstOrThrow`, le dernier ne le lisait pas du tout.
 *
 * LA DOUBLURE HONORE LE FILTRE QU'ELLE REÇOIT · `findFirst` ne rend l'exercice
 * que si l'identifiant ET le dossier concordent, et `findFirstOrThrow` fait ce
 * que Prisma fait vraiment (une P2025, qui n'est pas une exception HTTP). Une
 * doublure qui rendrait l'exercice quel que soit le dossier validerait un
 * service qui sert l'exercice d'un voisin.
 */

const EXERCICE = {
  id: 'e1',
  tenantId: 't1',
  dateDebut: new Date('2026-01-01T00:00:00Z'),
  dateFin: new Date('2026-12-31T00:00:00Z'),
};
const COMPTE = { id: 'c1', tenantId: 't1', numero: '47100000', intitule: 'Débiteurs divers' };

type Ou = { id?: string; tenantId?: string };

function p2025(modele: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`No ${modele} found`, { code: 'P2025', clientVersion: '5' });
}

function prismaFactice(avecPlan: boolean): PrismaService {
  const exercice = ({ where }: { where: Ou }) =>
    where.id !== undefined
      ? where.id === EXERCICE.id && where.tenantId === EXERCICE.tenantId
        ? EXERCICE
        : null
      : where.tenantId === EXERCICE.tenantId
        ? EXERCICE
        : null;
  return {
    exercice: {
      findFirst: jest.fn().mockImplementation((a: { where: Ou }) => Promise.resolve(exercice(a))),
      findFirstOrThrow: jest.fn().mockImplementation((a: { where: Ou }) => {
        const e = exercice(a);
        return e ? Promise.resolve(e) : Promise.reject(p2025('Exercice'));
      }),
    },
    compte: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Ou }) =>
          Promise.resolve(where.id === COMPTE.id && where.tenantId === COMPTE.tenantId ? COMPTE : null),
        ),
      findFirstOrThrow: jest.fn().mockImplementation(({ where }: { where: Ou }) =>
        where.id === COMPTE.id && where.tenantId === COMPTE.tenantId ? Promise.resolve(COMPTE) : Promise.reject(p2025('Compte')),
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYCEBNL,
        systemeComptableSyscohada: null,
        jeuEtatsFinanciersSycebnl: 'PROJETS',
      }),
    },
    planAnalytique: {
      // Le plan à budgets existe ou n'existe pas, selon le cas · c'est ce qui
      // décidait, avant la correction, entre un 500 et un faux motif.
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Ou }) =>
          Promise.resolve(avecPlan && where.tenantId === 't1' ? { id: 'p1', tenantId: 't1' } : null),
        ),
    },
  } as unknown as PrismaService;
}

function ecritures(prisma: PrismaService): EcritureService {
  return new EcritureService(prisma, {} as never, {} as never, {} as never);
}

/** Les deux formes du même refus · l'exercice d'un voisin, et un identifiant inconnu. */
const CAS: Array<[string, string, string]> = [
  ['l’exercice d’un AUTRE dossier', 't2', 'e1'],
  ['un exercice inconnu', 't1', 'inconnu'],
];

async function attendreLeRefus(appel: Promise<unknown>): Promise<void> {
  const refus = await appel.then(
    () => null,
    (e: unknown) => e,
  );
  expect(refus).toBeInstanceOf(NotFoundException);
  expect((refus as Error).message).toBe(MOTIF_EXERCICE_INTROUVABLE);
}

describe('exercice inconnu du dossier · les jumeaux de F222', () => {
  it('le porteur rend l’exercice lu, refuse l’absence, et les états réexportent le même motif', () => {
    expect(exerciceDuDossierOuRefus(EXERCICE)).toBe(EXERCICE);
    expect(() => exerciceDuDossierOuRefus(null)).toThrow(NotFoundException);
    expect(() => exerciceDuDossierOuRefus(null)).toThrow(MOTIF_EXERCICE_INTROUVABLE);
    // Un seul texte · les exports lisent l'identité en même temps que l'état,
    // et la réponse ne doit pas dépendre de laquelle échoue la première.
    expect(MOTIF_REEXPORTE).toBe(MOTIF_EXERCICE_INTROUVABLE);
  });

  describe.each(CAS)('%s', (_libelle, tenantId, exerciceId) => {
    it('la balance âgée est un 404 nommé', async () => {
      await attendreLeRefus(ecritures(prismaFactice(true)).balanceAgee(tenantId, { exerciceId }));
    });

    it('le justificatif de solde est un 404 nommé', async () => {
      await attendreLeRefus(ecritures(prismaFactice(true)).justificatifSolde(tenantId, { compteId: COMPTE.id, exerciceId }));
    });

    it('la balance cumulée est un 404 nommé', async () => {
      await attendreLeRefus(ecritures(prismaFactice(true)).balanceCumulee(tenantId, exerciceId));
    });

    it('la Note 9 des fonds du bailleur, qui lit la balance cumulée, est un 404 nommé', async () => {
      const prisma = prismaFactice(true);
      const projet = new EtatsFinanciersProjetService(ecritures(prisma), {} as ExerciceService, prisma);
      await attendreLeRefus(projet.noteBailleur(tenantId, exerciceId));
    });

    it('le tableau des amortissements est un 404 nommé', async () => {
      const prisma = prismaFactice(true);
      await attendreLeRefus(new ImmobilisationService(prisma, ecritures(prisma)).tableauAmortissements(tenantId, exerciceId));
    });

    it('le tableau d’exécution budgétaire est un 404 nommé quand le plan à budgets existe', async () => {
      const prisma = prismaFactice(true);
      const budget = new EtatsFinanciersProjetBudgetService(ecritures(prisma), prisma, {} as never);
      await attendreLeRefus(budget.executionBudgetaire(tenantId, exerciceId));
    });

    it('le tableau d’exécution budgétaire est un 404 nommé, et PAS « aucun plan à budgets », quand le plan manque', async () => {
      // Ce refus-là est le seul que la note 35 (24) rattrape pour se replier
      // en saisie · pris pour lui, un exercice inconnu y servait une grille
      // vierge au lieu d'un 404.
      const prisma = prismaFactice(false);
      const budget = new EtatsFinanciersProjetBudgetService(ecritures(prisma), prisma, {} as never);
      const refus = await budget.executionBudgetaire(tenantId, exerciceId).catch((e: unknown) => e);
      expect(refus).not.toBeInstanceOf(AucunPlanABudgetsException);
      await attendreLeRefus(Promise.reject(refus));
    });

    it('le tableau de réconciliation de trésorerie est un 404 nommé', async () => {
      const prisma = prismaFactice(true);
      const budget = new EtatsFinanciersProjetBudgetService(ecritures(prisma), prisma, {} as never);
      await attendreLeRefus(budget.reconciliationTresorerie(tenantId, exerciceId));
    });
  });

  it('le justificatif d’un compte d’un autre dossier est un 404 nommé, l’exercice étant du dossier', async () => {
    const refus = await ecritures(prismaFactice(true))
      .justificatifSolde('t1', { compteId: 'compte-voisin', exerciceId: EXERCICE.id })
      .catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(NotFoundException);
    expect((refus as Error).message).toMatch(/^Compte introuvable dans ce dossier/);
  });
});
