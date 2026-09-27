import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F26 · LE SOLDE D'OUVERTURE DES COMPTES DE RETENUE EST UN MOIS
 * « ANTÉRIEUR », IMPUTÉ LE PREMIER.
 *
 * La retenue de décembre N-1 se reverse en janvier N. Sans le solde
 * d'ouverture, ce débit s'imputait sur la retenue de JANVIER, qui paraissait
 * acquittée : un janvier réellement impayé n'était jamais signalé. Et le
 * report à-nouveau, quand il existait, entrait comme une retenue de janvier,
 * avec l'échéance de février au lieu de celle de janvier.
 *
 * La doublure honore l'exercice, le statut, les dates et les racines · une
 * doublure qui rendrait les mêmes lignes à toutes les requêtes compterait
 * l'ouverture deux fois et validerait n'importe quel filtre.
 */

interface Ligne {
  numero: string;
  date: string;
  exerciceId: string;
  debit?: number;
  credit?: number;
  report?: boolean;
  statut?: 'VALIDEE' | 'BROUILLARD';
}

type Filtre = {
  ecriture?: {
    exerciceId?: string;
    statut?: string;
    date?: { gte?: Date; lt?: Date; lte?: Date };
  };
  compte?: { OR?: { numero: { startsWith: string } }[] };
};

function retient(l: Ligne, w: Filtre) {
  const e = w.ecriture ?? {};
  const d = new Date(l.date);
  if (e.exerciceId && l.exerciceId !== e.exerciceId) return false;
  if (e.statut && (l.statut ?? 'VALIDEE') !== e.statut) return false;
  if (e.date?.gte && d < e.date.gte) return false;
  if (e.date?.lt && d >= e.date.lt) return false;
  if (e.date?.lte && d > e.date.lte) return false;
  if (w.compte?.OR && !w.compte.OR.some((c) => l.numero.startsWith(c.numero.startsWith))) return false;
  return true;
}

function service(lignes: Ligne[], exercice = { id: 'e2026', dateDebut: new Date('2026-01-01') }) {
  const requetesAnterieures: Filtre[] = [];
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
    exercice: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === exercice.id ? { dateDebut: exercice.dateDebut } : null),
        ),
    },
    ecriture: {
      // Le dernier report à-nouveau VALIDÉ, daté au plus tard de l'ouverture.
      findFirst: jest.fn().mockImplementation(({ where }: { where: { statut: string; date: { lte: Date } } }) => {
        const reports = lignes
          .filter((l) => l.report && (l.statut ?? 'VALIDEE') === where.statut && new Date(l.date) <= where.date.lte)
          .sort((a, b) => b.date.localeCompare(a.date));
        return Promise.resolve(
          reports[0] ? { date: new Date(reports[0].date), exerciceId: reports[0].exerciceId } : null,
        );
      }),
    },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Filtre }) => {
        if (!where.ecriture?.exerciceId) requetesAnterieures.push(where);
        return Promise.resolve(
          lignes
            .filter((l) => retient(l, where))
            .map((l) => ({
              debit: l.debit ?? 0,
              credit: l.credit ?? 0,
              dateVersement: null,
              compte: { numero: l.numero, intitule: `Compte ${l.numero}` },
              ecriture: {
                date: new Date(l.date),
                libelle: 'Écriture',
                reference: null,
                estGenereeParCloture: !!l.report,
                estSoldeDesComptesDeGestion: false,
              },
            })),
        );
      }),
    },
  } as unknown as PrismaService;
  return { svc: new RetenuesService(prisma), requetesAnterieures };
}

type Mois = { mois: string; anterieur: boolean; retenu: number; reverse: number; solde: number; enRetard: boolean };
const irpp = async (lignes: Ligne[], dateReference: string) => {
  const { svc } = service(lignes);
  const r = await svc.registre('t1', { exerciceId: 'e2026', dateReference });
  return r.natures.find((n) => n.cle === 'irppSalaires') as unknown as {
    mois: Mois[];
    soldeOuverture: number;
    solde: number;
    moisEnRetard: number;
    reverseNonImpute: number;
  };
};

describe('Registre des retenues · le solde d’ouverture (audit final F26)', () => {
  it('exercice précédent ouvert · le reversement de décembre n’acquitte plus janvier', async () => {
    const n = await irpp(
      [
        { numero: '44720000', date: '2025-12-31', exerciceId: 'e2025', credit: 100_000 },
        { numero: '44720000', date: '2026-01-10', exerciceId: 'e2026', debit: 100_000 },
        { numero: '44720000', date: '2026-01-31', exerciceId: 'e2026', credit: 100_000 },
      ],
      '2026-03-01',
    );
    expect(n.soldeOuverture).toBe(100_000);
    const [anterieur, janvier] = n.mois;
    expect(anterieur).toMatchObject({ mois: 'ANTERIEUR', anterieur: true, retenu: 100_000, solde: 0, enRetard: false });
    // Janvier n'a reçu aucun reversement · il est en retard après le
    // 16 février (le 15 est un dimanche, art. 110 bis, al. 2).
    expect(janvier).toMatchObject({ mois: '2026-01', solde: 100_000, enRetard: true });
    expect(n.moisEnRetard).toBe(1);
    expect(n.solde).toBe(100_000);
  });

  it('report à-nouveau validé · il est l’ouverture, pas une retenue de janvier, et garde l’échéance de janvier', async () => {
    const n = await irpp(
      [{ numero: '44720000', date: '2026-01-01', exerciceId: 'e2026', credit: 100_000, report: true }],
      '2026-01-20',
    );
    expect(n.mois.map((m) => m.mois)).toEqual(['ANTERIEUR']);
    // Échu le 15 janvier 2026 · en retard le 20.
    expect(n.mois[0]).toMatchObject({ retenu: 100_000, solde: 100_000, enRetard: true });
  });

  it('l’ouverture se reconstitue depuis le DERNIER report validé, jamais avant lui', async () => {
    const { svc, requetesAnterieures } = service([
      { numero: '44720000', date: '2024-06-30', exerciceId: 'e2024', credit: 999_999 },
      { numero: '44720000', date: '2025-01-01', exerciceId: 'e2025', credit: 30_000, report: true },
      { numero: '44720000', date: '2025-01-10', exerciceId: 'e2025', debit: 30_000 },
      { numero: '44720000', date: '2025-12-31', exerciceId: 'e2025', credit: 50_000 },
    ]);
    const r = await svc.registre('t1', { exerciceId: 'e2026', dateReference: '2026-01-10' });
    const n = r.natures.find((x) => x.cle === 'irppSalaires') as unknown as { soldeOuverture: number; mois: Mois[] };
    expect(n.soldeOuverture).toBe(50_000);
    expect(n.mois[0]).toMatchObject({ mois: 'ANTERIEUR', solde: 50_000, enRetard: false });
    // La requête elle-même porte le livre-journal et les deux bornes.
    expect(requetesAnterieures).toHaveLength(1);
    expect(requetesAnterieures[0].ecriture).toMatchObject({
      statut: 'VALIDEE',
      date: { gte: new Date('2025-01-01'), lt: new Date('2026-01-01') },
    });
  });

  it('un report à-nouveau PROVISOIRE, au brouillard, n’est pas l’ouverture et ne compte pas deux fois', async () => {
    const n = await irpp(
      [
        { numero: '44720000', date: '2025-12-31', exerciceId: 'e2025', credit: 100_000 },
        { numero: '44720000', date: '2026-01-01', exerciceId: 'e2026', credit: 100_000, report: true, statut: 'BROUILLARD' },
      ],
      '2026-01-10',
    );
    expect(n.soldeOuverture).toBe(100_000);
    expect(n.mois.map((m) => m.mois)).toEqual(['ANTERIEUR']);
  });

  it('une ouverture DÉBITRICE (reversement d’avance) s’impute sur la retenue de l’exercice', async () => {
    const n = await irpp(
      [
        { numero: '44720000', date: '2025-12-31', exerciceId: 'e2025', debit: 20_000 },
        { numero: '44720000', date: '2026-01-31', exerciceId: 'e2026', credit: 20_000 },
      ],
      '2026-03-01',
    );
    expect(n.soldeOuverture).toBe(-20_000);
    expect(n.mois.map((m) => m.mois)).toEqual(['2026-01']);
    expect(n.mois[0]).toMatchObject({ solde: 0, enRetard: false });
    expect(n.solde).toBe(0);
  });
});
