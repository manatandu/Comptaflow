import { StatutExercice } from '@prisma/client';
import { ExerciceService } from './exercice.service';

// La clôture annuelle n'avait AUCUN test unitaire, et son report à-nouveau
// passe désormais par le calcul partagé avec le report provisoire. Ce spec
// fige les deux écritures qu'elle produit et le remplacement du provisoire.
const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
const ligne = (debit: number, credit: number, lettre: string | null = null) => ({
  debit,
  credit,
  lettre,
  libelle: 'L',
  dateEcheance: null,
  ecriture: { libelle: 'E' },
});
const COMPTES = [
  { id: '601', numero: '60110000', intitule: 'Achats', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(1000, 0)] },
  { id: '701', numero: '70110000', intitule: 'Ventes', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(0, 1500)] },
  { id: '521', numero: '52110000', intitule: 'Banque', modeReportANouveau: 'SOLDE', lignesEcriture: [ligne(1500, 0), ligne(0, 1000)] },
  { id: '131', numero: '13100000', intitule: 'Excédent', modeReportANouveau: 'SOLDE', lignesEcriture: [] },
  { id: '411', numero: '41110000', intitule: 'Clients', modeReportANouveau: 'DETAIL', lignesEcriture: [ligne(300, 0), ligne(200, 0, 'AA'), ligne(0, 200, 'AA')] },
  { id: '401', numero: '40110000', intitule: 'Fournisseurs', modeReportANouveau: 'DETAIL', lignesEcriture: [ligne(0, 300)] },
];

function service(provisoire: { id: string; numeroPiece: number; lignes: { lettre: null; rapprochementId: null }[] } | null) {
  const tx = {
    compte: { findMany: jest.fn().mockResolvedValue(COMPTES), findUnique: jest.fn().mockResolvedValue({ id: '131' }) },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn(), update: jest.fn().mockResolvedValue({ ...N, statut: 'CLOTURE' }) },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue(provisoire),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    // L'exercice lu par son identifiant, et les deux questions d'ordre
    // (précédent encore ouvert, suivant déjà clos) · aucun par défaut.
    exercice: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.dateFin || where.dateDebut ? null : N),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const journalService = { prochainNumeroPiece: jest.fn().mockResolvedValue(50) };
  return { s: new ExerciceService(prisma as never, journalService as never), tx };
}

describe('Clôture annuelle', () => {
  it('solde la gestion sur le résultat, puis passe le report définitif · la ligne lettrée ne passe pas', async () => {
    const { s, tx } = service(null);
    await s.cloturer('t', 'n', 'u');
    const [cloture, ran] = tx.ecriture.create.mock.calls.map((c) => c[0].data);
    expect(cloture.exerciceId).toBe('n');
    expect(cloture.lignes.create.find((l: { compteId: string }) => l.compteId === '131')).toMatchObject({ credit: 500 });
    expect(ran.exerciceId).toBe('n1');
    expect(ran.estANouveauProvisoire).toBeUndefined();
    const lignes = ran.lignes.create as { compteId: string; debit: number; credit: number }[];
    expect(lignes.find((l) => l.compteId === '521')).toMatchObject({ debit: 500 });
    expect(lignes.find((l) => l.compteId === '131')).toMatchObject({ credit: 500 });
    expect(lignes.filter((l) => l.compteId === '411')).toHaveLength(1);
    expect(lignes.reduce((t, l) => t + l.debit - l.credit, 0)).toBe(0);
    expect(tx.exercice.update).toHaveBeenCalledWith({ where: { id: 'n' }, data: { statut: StatutExercice.CLOTURE } });
  });

  /**
   * AUDIT FINAL F4 · l'écriture de solde entrait au brouillard et ne pouvait
   * plus être validée (exercice clos) · absente du livre-journal, elle
   * laissait l'affectation sans résultat. Et elle portait le même drapeau que
   * l'à-nouveau, d'où la fausse ouverture de la balance (F5).
   */
  it('passe les deux écritures VALIDÉES, et marque seule l’écriture de solde', async () => {
    const { s, tx } = service(null);
    await s.cloturer('t', 'n', 'u');
    const [cloture, ran] = tx.ecriture.create.mock.calls.map((c) => c[0].data);
    expect({ statut: cloture.statut, valideeBy: cloture.valideeBy, solde: cloture.estSoldeDesComptesDeGestion }).toEqual({
      statut: 'VALIDEE',
      valideeBy: 'u',
      solde: true,
    });
    expect({ statut: ran.statut, solde: ran.estSoldeDesComptesDeGestion }).toEqual({ statut: 'VALIDEE', solde: undefined });
  });

  it('refuse de clôturer avant l’exercice précédent (audit final F6)', async () => {
    const { s, tx } = service(null);
    (s as any).prisma.exercice.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.dateFin ? { dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') } : where.dateDebut ? null : N,
      ),
    );
    await expect(s.cloturer('t', 'n', 'u')).rejects.toThrow(/2025 n'est pas clôturé/);
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  it('refuse de clôturer quand un exercice postérieur est déjà clos (audit final F6)', async () => {
    const { s, tx } = service(null);
    (s as any).prisma.exercice.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.dateDebut ? { dateDebut: new Date('2027-01-01') } : where.dateFin ? null : N),
    );
    await expect(s.cloturer('t', 'n', 'u')).rejects.toThrow(/postérieur est déjà clôturé/);
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  it('remplace le report PROVISOIRE et lui reprend son numéro de pièce', async () => {
    const { s, tx } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: null, rapprochementId: null }] });
    await s.cloturer('t', 'n', 'u');
    expect(tx.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    const ran = tx.ecriture.create.mock.calls[1][0].data;
    expect(ran.numeroPiece).toBe(3);
  });

  it('refuse de clôturer tant qu’il reste du brouillard', async () => {
    const { s } = service(null);
    (s as any).prisma.ecriture.count.mockResolvedValue(1);
    await expect(s.cloturer('t', 'n', 'u')).rejects.toThrow(/brouillard/);
  });
});

/**
 * AUDIT FINAL F7 · la clôture de période, définitive et valable pour tous
 * les journaux, acceptait n'importe quelle date · une faute sur l'année
 * figeait le dossier entier sans retour.
 */
describe('Clôture de période · bornée à l’exercice', () => {
  const service = () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { exercice: { findFirst: jest.fn().mockResolvedValue(N) }, cloture: { create } };
    return { s: new ExerciceService(prisma as never, {} as never), create };
  };

  it('refuse une date hors de l’exercice, et ne crée rien', async () => {
    const { s, create } = service();
    await expect(s.clorePeriode('t', 'n', 'u', { dateLimite: '2062-03-31' })).rejects.toThrow(/hors de l'exercice/);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepte une date de l’exercice', async () => {
    const { s, create } = service();
    await s.clorePeriode('t', 'n', 'u', { dateLimite: '2026-03-31' });
    expect(create.mock.calls[0][0].data.dateLimite).toEqual(new Date('2026-03-31'));
  });
});
