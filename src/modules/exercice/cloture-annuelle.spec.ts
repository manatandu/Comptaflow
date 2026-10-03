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

/**
 * LA LECTURE DU REPORT (audit final F185) · la clôture demande à la base les
 * sommes des comptes au SOLDE et de gestion, et ne lit ligne à ligne que le
 * DÉTAIL. Cette doublure les sert depuis les lignes du jeu en HONORANT les
 * filtres que la lecture pose, et lève sur tout filtre qu'elle ne sait pas
 * lire · une doublure qui ignore un filtre valide un code qui ne charge pas.
 */
type LigneJeu = { lignesEcriture: Record<string, unknown>[] } & Record<string, unknown>;
const estReference = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'modelName' in (x as object);
function champ(r: Record<string, unknown>, v: unknown, f: unknown): boolean {
  if (f === null || typeof f !== 'object') return v === f;
  return Object.entries(f as Record<string, unknown>).every(([op, x]) => {
    const o = estReference(x) ? r[x.name] : x;
    if (op === 'not') return o === null ? v !== null : typeof o === 'object' ? !champ(r, v, o) : v !== null && v !== o;
    if (v === null || v === undefined) return false;
    if (op === 'equals') return v === o;
    if (op === 'in') return (o as unknown[]).includes(v);
    if (op === 'gt') return (v as number) > (o as number);
    if (op === 'gte') return (v as number) >= (o as number);
    if (op === 'lt') return (v as number) < (o as number);
    if (op === 'lte') return (v as number) <= (o as number);
    throw new Error(`doublure : filtre « ${op} » non honoré`);
  });
}
function correspond(r: Record<string, unknown>, where: unknown): boolean {
  return Object.entries((where ?? {}) as Record<string, unknown>).every(([cle, f]) => {
    if (cle === 'AND') return ([] as unknown[]).concat(f).every((w) => correspond(r, w));
    if (cle === 'OR') return (f as unknown[]).some((w) => correspond(r, w));
    if (cle === 'NOT') return ([] as unknown[]).concat(f).every((w) => !correspond(r, w));
    if (cle === 'ecriture' || cle === 'compte') return correspond(r[cle] as Record<string, unknown>, f);
    return champ(r, r[cle], f);
  });
}
function lectureDuReport(comptes: LigneJeu[]) {
  const lignes = comptes.flatMap((c) =>
    c.lignesEcriture.map((l, i) => ({
      id: `${c.id}-${String(i).padStart(4, '0')}`,
      compteId: c.id,
      compte: c,
      deviseId: null,
      montantDevise: null,
      coursApplique: null,
      ...l,
      ecriture: { tenantId: 't', exerciceId: 'n', statut: 'VALIDEE', ...(l.ecriture as object) },
    })),
  ) as Record<string, unknown>[];
  const projeter = (r: Record<string, unknown>, select: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(select).map(([k, v]) => [k, v === true ? r[k] : { libelle: (r[k] as { libelle: string }).libelle }]),
    );
  return {
    compte: {
      findMany: jest.fn(async (a: { where: unknown; select: Record<string, unknown>; include?: unknown }) => {
        if (a.include) throw new Error('doublure : include non honoré');
        return comptes
          .filter((c) => correspond({ tenantId: 't', ...c }, a.where))
          .sort((x, y) => ((x.numero as string) < (y.numero as string) ? -1 : 1))
          .map((c) => Object.fromEntries(Object.keys(a.select).map((k) => [k, c[k]])));
      }),
    },
    ligneEcriture: {
      fields: { credit: { modelName: 'LigneEcriture', name: 'credit' } },
      groupBy: jest.fn(async (a: { by: string[]; where: unknown; _sum: Record<string, true> }) => {
        const groupes = new Map<string, Record<string, unknown>>();
        for (const l of lignes.filter((x) => correspond(x, a.where))) {
          const cle = JSON.stringify(a.by.map((k) => l[k]));
          const g = groupes.get(cle) ?? { ...Object.fromEntries(a.by.map((k) => [k, l[k]])), _sum: {} as Record<string, number | null> };
          const somme = g._sum as Record<string, number | null>;
          for (const k of Object.keys(a._sum)) somme[k] = l[k] === null ? (somme[k] ?? null) : (somme[k] ?? 0) + (l[k] as number);
          groupes.set(cle, g);
        }
        return [...groupes.values()];
      }),
      findMany: jest.fn(async (a: { where: unknown; select: Record<string, unknown>; take: number; cursor?: { id: string }; skip?: number }) => {
        let r = lignes.filter((x) => correspond(x, a.where)).sort((x, y) => ((x.id as string) < (y.id as string) ? -1 : 1));
        if (a.cursor) r = r.slice(r.findIndex((x) => x.id === a.cursor!.id) + (a.skip ?? 0));
        return r.slice(0, a.take).map((x) => projeter(x, a.select));
      }),
    },
  };
}

function service(provisoire: { id: string; numeroPiece: number; lignes: { lettre: null; rapprochementId: null }[] } | null) {
  const lecture = lectureDuReport(COMPTES);
  const tx = {
    compte: { findMany: lecture.compte.findMany, findUnique: jest.fn().mockResolvedValue({ id: '131' }) },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn(), update: jest.fn().mockResolvedValue({ ...N, statut: 'CLOTURE' }) },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue(provisoire),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: { ...lecture.ligneEcriture, deleteMany: jest.fn().mockResolvedValue({}) },
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
    // Aucun lettrage dénoué en souffrance (décision D3, `ecartsRealisesNonConstates`).
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
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

  /**
   * AUDIT FINAL F185 · la clôture lisait toutes les lignes de l'exercice avec
   * le plan. Le plan se lit sans elles, les comptes au SOLDE et de gestion en
   * sommes, et le DÉTAIL seul ligne à ligne, par les colonnes du report.
   */
  it('F185 · la clôture lit le plan sans ses lignes, le reste en sommes, le DÉTAIL par les seules colonnes du report', async () => {
    const { s, tx } = service(null);
    await s.cloturer('t', 'n', 'u');
    expect(tx.compte.findMany.mock.calls[0][0].include).toBeUndefined();
    expect(tx.ligneEcriture.groupBy).toHaveBeenCalled();
    const detail = tx.ligneEcriture.findMany.mock.calls[0][0];
    expect(detail.select.ecriture).toEqual({ select: { libelle: true } });
    expect(Object.keys(detail.select).sort()).toEqual(
      ['compteId', 'coursApplique', 'credit', 'dateEcheance', 'debit', 'deviseId', 'ecriture', 'id', 'lettre', 'libelle', 'montantDevise'],
    );
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
