import { GranulariteCloture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService, type MemoireControles } from './ecriture.service';

/**
 * LES CONTRÔLES D'ENTRÉE D'UN LOT (audit final F2) · un import de six mille
 * pièces relisait l'exercice, le journal, les comptes et les clôtures à chaque
 * pièce, vingt-quatre mille requêtes avant la première écriture. Avec une
 * mémoire, chaque chose se lit une fois pour le lot, et les RÈGLES restent
 * celles de la saisie à l'unité : un refus reste un refus.
 */
function service(clotures: Array<{ granularite: GranulariteCloture; journalId: string | null; dateLimite: Date }> = []) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: StatutExercice.OUVERT,
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, numero: id, typeCompte: TypeCompteDetailTotal.DETAIL }))),
      ),
    },
  };
  const journal = { trouver: jest.fn().mockResolvedValue({ id: 'j', code: 'OD', estActif: true }) };
  const exercice = {
    cloturesApplicables: jest.fn().mockResolvedValue(clotures),
    verifierEcritureAutorisee: jest.fn(),
  };
  const s = new EcritureService(prisma as never, journal as never, exercice as never, {} as never);
  return { s, prisma, journal, exercice };
}

const piece = (jour: string, a: string, b: string) => ({
  exerciceId: 'ex',
  journalId: 'j',
  date: new Date(`2026-${jour}`),
  lignes: [
    { compteId: a, debit: 100, credit: 0 },
    { compteId: b, debit: 0, credit: 100 },
  ],
  exigerVentilationObligatoire: false,
});

describe('Contrôles d’entrée · la mémoire d’un lot', () => {
  it('lit une fois exercice, journal et clôtures, et seulement les comptes jamais vus', async () => {
    const { s, prisma, journal, exercice } = service();
    const memoire: MemoireControles = new Map();
    await s.controlesDEntree('t', piece('03-10', 'c601', 'c401'), undefined, memoire);
    await s.controlesDEntree('t', piece('03-11', 'c601', 'c401'), undefined, memoire);
    await s.controlesDEntree('t', piece('03-12', 'c601', 'c521'), undefined, memoire);
    expect({
      exercices: prisma.exercice.findFirst.mock.calls.length,
      journaux: journal.trouver.mock.calls.length,
      clotures: exercice.cloturesApplicables.mock.calls.length,
      comptes: prisma.compte.findMany.mock.calls.map((c) => c[0].where.id.in),
    }).toEqual({ exercices: 1, journaux: 1, clotures: 1, comptes: [['c601', 'c401'], ['c521']] });
  });

  it('refuse, avec la mémoire, la pièce datée d’une période close, comme à l’unité', async () => {
    const { s } = service([{ granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: new Date('2026-03-31') }]);
    const memoire: MemoireControles = new Map();
    await expect(s.controlesDEntree('t', piece('03-10', 'c601', 'c401'), undefined, memoire)).rejects.toThrow(/clôturée/);
    await expect(s.controlesDEntree('t', piece('04-02', 'c601', 'c401'), undefined, memoire)).resolves.toBeDefined();
  });

  it('refuse, avec la mémoire, un compte d’un autre dossier que le lot a déjà cherché', async () => {
    const { s, prisma } = service();
    prisma.compte.findMany.mockResolvedValue([{ id: 'c601', numero: 'c601', typeCompte: TypeCompteDetailTotal.DETAIL }]);
    const memoire: MemoireControles = new Map();
    await expect(s.controlesDEntree('t', piece('03-10', 'c601', 'etranger'), undefined, memoire)).rejects.toThrow(/introuvables/);
    await expect(s.controlesDEntree('t', piece('03-11', 'c601', 'etranger'), undefined, memoire)).rejects.toThrow(/introuvables/);
  });
});
