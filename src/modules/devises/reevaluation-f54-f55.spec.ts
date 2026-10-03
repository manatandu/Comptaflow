import { StatutExercice } from '@prisma/client';
import { DevisesService } from './devises.service';
import { ExerciceService } from '../exercice/exercice.service';
import { lignesReportANouveau, type CompteRan } from '../exercice/report-a-nouveau';

/**
 * AUDIT FINAL F54 ET F55 · la réévaluation des positions en devise.
 *
 * F55 · le report à-nouveau ne recopiait ni la devise ni le montant en
 * devise, et la réévaluation ne lit que l'exercice · une créance en dollars
 * née en N-1 n'était jamais réévaluée.
 *
 * F54 · les écarts sont passés sans devise, et le seul garde-fou portait sur
 * la même date · une seconde réévaluation dans l'exercice repassait l'écart
 * entier et doublait la provision.
 */

const ligne = (debit: number, credit: number, devise?: { id: string; montant: number; cours?: number }, lettre: string | null = null) => ({
  debit,
  credit,
  lettre,
  libelle: 'L',
  dateEcheance: null,
  deviseId: devise?.id ?? null,
  montantDevise: devise?.montant ?? null,
  coursApplique: devise?.cours ?? null,
});

describe('F55 · la devise suit le report à-nouveau', () => {
  it('en DÉTAIL, chaque ligne reportée garde sa devise, son montant et son cours', () => {
    const client: CompteRan = {
      id: '411',
      numero: '41110000',
      intitule: 'Clients',
      modeReportANouveau: 'DETAIL',
      lignes: [ligne(280_000, 0, { id: 'usd', montant: 100, cours: 2800 }), ligne(5_000, 0)],
    };
    const r = lignesReportANouveau([client], null);
    expect(r.map((l) => [l.debit, l.deviseId ?? null, l.montantDevise ?? null, l.coursApplique ?? null])).toEqual([
      [280_000, 'usd', 100, 2800],
      [5_000, null, null, null],
    ]);
  });

  it('en SOLDE, une ligne par devise au cours moyen, et le reste en francs', () => {
    // Banque : 100 USD à 2 800, puis 50 USD sortis à 2 900, et un écart de
    // réévaluation passé sans devise.
    const banque: CompteRan = {
      id: '521',
      numero: '52120000',
      intitule: 'Banque USD',
      modeReportANouveau: 'SOLDE',
      lignes: [
        ligne(280_000, 0, { id: 'usd', montant: 100 }),
        ligne(0, 145_000, { id: 'usd', montant: 50 }),
        ligne(10_000, 0),
      ],
    };
    const r = lignesReportANouveau([banque], null);
    expect(r).toEqual([
      expect.objectContaining({ debit: 135_000, credit: 0, deviseId: 'usd', montantDevise: 50, coursApplique: 2700 }),
      expect.objectContaining({ debit: 10_000, credit: 0 }),
    ]);
    expect(r[1].deviseId).toBeUndefined();
    // Le total reporté ne change pas.
    expect(r.reduce((t, l) => t + l.debit - l.credit, 0)).toBe(145_000);
  });

  it('une dette en devise se reporte au crédit, avec son montant en devise sans signe', () => {
    const fournisseur: CompteRan = {
      id: '162',
      numero: '16200000',
      intitule: 'Emprunt',
      modeReportANouveau: 'SOLDE',
      lignes: [ligne(0, 2_800_000, { id: 'usd', montant: 1000 })],
    };
    expect(lignesReportANouveau([fournisseur], null)).toEqual([
      expect.objectContaining({ debit: 0, credit: 2_800_000, deviseId: 'usd', montantDevise: 1000, coursApplique: 2800 }),
    ]);
  });

  it('une devise dont les deux soldes ne sont pas de même sens reste en francs', () => {
    const banque: CompteRan = {
      id: '521',
      numero: '52120000',
      intitule: 'Banque USD',
      modeReportANouveau: 'SOLDE',
      lignes: [ligne(280_000, 0, { id: 'usd', montant: 100 }), ligne(0, 272_700, { id: 'usd', montant: 101 })],
    };
    const r = lignesReportANouveau([banque], null);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ debit: 7_300 });
    expect(r[0].deviseId).toBeUndefined();
  });
});

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

describe('F55 · la clôture passe la devise au report', () => {
  const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
  const N1 = { id: 'n1', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
  const prismaLigne = (debit: number, credit: number, devise: { id: string; montant: number } | null) => ({
    debit,
    credit,
    lettre: null,
    libelle: 'L',
    dateEcheance: null,
    deviseId: devise?.id ?? null,
    montantDevise: devise?.montant ?? null,
    coursApplique: null,
    ecriture: { libelle: 'E' },
  });

  it('la ligne de report de la banque en dollars porte la devise et son montant', async () => {
    const comptes = [
      { id: '521', numero: '52120000', intitule: 'Banque USD', modeReportANouveau: 'SOLDE', lignesEcriture: [prismaLigne(280_000, 0, { id: 'usd', montant: 100 })] },
      { id: '101', numero: '10100000', intitule: 'Capital', modeReportANouveau: 'SOLDE', lignesEcriture: [prismaLigne(0, 280_000, null)] },
    ];
    const lecture = lectureDuReport(comptes);
    const tx = {
      compte: { findMany: lecture.compte.findMany, findUnique: jest.fn().mockResolvedValue({ id: '131' }) },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
      exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn(), update: jest.fn().mockResolvedValue({ ...N, statut: 'CLOTURE' }) },
      ecriture: { findFirst: jest.fn().mockResolvedValue(null), delete: jest.fn(), create: jest.fn().mockResolvedValue({}) },
      ligneEcriture: { ...lecture.ligneEcriture, deleteMany: jest.fn() },
    };
    const prisma = {
      exercice: {
        // Aucun exercice antérieur ouvert · l'ordre des réévaluations ne bloque rien (A5).
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(where.dateFin || where.dateDebut ? null : N),
        ),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      ecriture: { count: jest.fn().mockResolvedValue(0) },
      // Aucun lettrage dénoué en souffrance (décision D3).
      ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
      // Aucune créance douteuse à dépréciation orpheline (ligne A7, B1).
      creanceDouteuse: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const s = new ExerciceService(prisma as never, { prochainNumeroPiece: jest.fn().mockResolvedValue(1) } as never);
    await s.cloturer('t', 'n', 'u');
    const ran = tx.ecriture.create.mock.calls.map((c) => c[0].data).find((d) => d.exerciceId === 'n1');
    expect(ran.lignes.create.find((l: { compteId: string }) => l.compteId === '521')).toMatchObject({
      debit: 280_000,
      deviseId: 'usd',
      montantDevise: 100,
      coursApplique: 2800,
    });
  });
});

describe('F54 · une seule réévaluation passée par exercice', () => {
  function service(dejaPassee: { dateReevaluation: Date } | null) {
    const prisma = {
      exercice: {
        // Aucun exercice antérieur ouvert · l'ordre des réévaluations ne bloque rien (A5).
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'ex1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' }),
      },
      ligneEcriture: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }),
        findMany: jest.fn().mockResolvedValue([
          {
            compteId: 'c411',
            deviseId: 'usd',
            debit: 2_800_000,
            credit: 0,
            montantDevise: 1000,
            compte: { id: 'c411', numero: '41110000', intitule: 'Clients' },
            devise: { id: 'usd', code: 'USD' },
          },
        ]),
      },
      coursDevise: { findFirst: jest.fn().mockResolvedValue({ cours: 2500 }) },
      // La doublure honore le filtre · une réévaluation d'une AUTRE date ne
      // répond qu'à une question qui ne porte pas sur la date.
      provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
      // Le verrou des gestes de provision (A5) · une ligne par dossier.
      verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
      // Un à-nouveau validé existe, sans ligne sur les comptes de provision (A5).
      ecriture: { count: jest.fn().mockResolvedValue(1) },
      reevaluation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockImplementation(({ where }: { where: { dateReevaluation?: Date } }) =>
          Promise.resolve(
            dejaPassee && (!where.dateReevaluation || where.dateReevaluation.getTime() === dejaPassee.dateReevaluation.getTime())
              ? dejaPassee
              : null,
          ),
        ),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
      compte: {
        findFirst: jest.fn(({ where }: { where: { numero: { startsWith: string } } }) =>
          Promise.resolve({ id: `c-${where.numero.startsWith}`, numero: where.numero.startsWith.padEnd(8, '0') }),
        ),
      },
    };
    const ecritureService = { creer: jest.fn().mockResolvedValue({ id: 'e1' }) };
    return { s: new DevisesService(prisma as never, ecritureService as never), ecritureService };
  }

  it('refuse une seconde réévaluation à une autre date, et ne passe rien', async () => {
    const { s, ecritureService } = service({ dateReevaluation: new Date('2026-06-30') });
    await expect(s.reevaluer('t1', 'u1', { exerciceId: 'ex1', dateReevaluation: '2026-12-31' })).rejects.toThrow(
      /déjà été passée au 2026-06-30.*repasserait l'écart entier/,
    );
    expect(ecritureService.creer).not.toHaveBeenCalled();
  });

  it('passe la première', async () => {
    const { s, ecritureService } = service(null);
    await s.reevaluer('t1', 'u1', { exerciceId: 'ex1', dateReevaluation: '2026-12-31' });
    expect(ecritureService.creer).toHaveBeenCalled();
  });

  it('le calcul, qui n’enregistre rien, reste ouvert pour une situation intermédiaire', async () => {
    const { s } = service({ dateReevaluation: new Date('2026-06-30') });
    await expect(s.calculer('t1', { exerciceId: 'ex1', dateReevaluation: '2026-12-31' })).resolves.toMatchObject({
      positions: [expect.objectContaining({ ecart: -300_000 })],
    });
  });
});
