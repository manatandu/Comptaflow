import { StatutExercice } from '@prisma/client';
import { ExerciceService } from './exercice.service';

const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
const ligne = (debit: number, credit: number) => ({ debit, credit, lettre: null, libelle: 'L', dateEcheance: null, ecriture: { libelle: 'E' } });
const COMPTES = [
  { id: '601', numero: '60110000', intitule: 'Achats', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(1000, 0)] },
  { id: '701', numero: '70110000', intitule: 'Ventes', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(0, 1500)] },
  { id: '521', numero: '52110000', intitule: 'Banque', modeReportANouveau: 'SOLDE', lignesEcriture: [ligne(1500, 0), ligne(0, 1000)] },
  { id: '131', numero: '13100000', intitule: 'Excédent', modeReportANouveau: 'SOLDE', lignesEcriture: [] },
];

/**
 * LA LECTURE DU REPORT (audit final F185) · le report demande à la base les
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

function service(
  provisoire: {
    id: string;
    numeroPiece: number;
    lignes: { lettre: string | null; lettrageId?: string | null; rapprochementId: string | null }[];
  } | null,
) {
  const lecture = lectureDuReport(COMPTES);
  const tx = {
    compte: {
      findMany: lecture.compte.findMany,
      findUnique: jest.fn().mockResolvedValue({ id: '131', numero: '13100000' }),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn() },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue(provisoire),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: { ...lecture.ligneEcriture, deleteMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(N) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    // Aucun lettrage à cheval de deux exercices (A6 bis, B2).
    lettrage: { findMany: jest.fn().mockResolvedValue([]) },
    ecriture: { count: jest.fn().mockResolvedValue(2) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const journalService = { prochainNumeroPiece: jest.fn().mockResolvedValue(99) };
  return { s: new ExerciceService(prisma as never, journalService as never), tx, journalService };
}

describe('À-nouveaux provisoires · lettrage partiel (audit final F50)', () => {
  it('refuse de remplacer un report dont une ligne est dans un groupe PARTIEL, et lit le groupe', async () => {
    const { s, tx } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: null, lettrageId: 'g1', rapprochementId: null }] });
    await expect(s.genererANouveauxProvisoires('t', 'n', 'u')).rejects.toThrow(/lettrées ou pointées/);
    expect(tx.ecriture.findFirst.mock.calls[0][0].include.lignes.select).toMatchObject({ lettre: true, lettrageId: true });
    expect(tx.ecriture.delete).not.toHaveBeenCalled();
  });
});

describe('À-nouveaux provisoires', () => {
  it('passe au brouillard, marqué provisoire, le report du livre-journal avec le résultat sur le 13 · équilibré', async () => {
    const { s, tx } = service(null);
    const r = await s.genererANouveauxProvisoires('t', 'n', 'u');
    const data = tx.ecriture.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ exerciceId: 'n1', estANouveauProvisoire: true, estGenereeParCloture: true, numeroPiece: 99 });
    expect(data.statut).toBeUndefined(); // brouillard par défaut, jamais validé d'office
    const lignes = data.lignes.create as { compteId: string; debit: number; credit: number }[];
    expect(lignes.find((l) => l.compteId === '131')).toMatchObject({ credit: 500 });
    expect(lignes.reduce((t, l) => t + l.debit - l.credit, 0)).toBe(0);
    // Le livre-journal seul, pour les sommes comme pour le DÉTAIL · le
    // brouillard restant est DIT.
    const statut = (a: { where: unknown }) => (a.where as { ecriture: { statut?: string } }).ecriture.statut;
    expect(tx.ligneEcriture.groupBy.mock.calls.map((c) => statut(c[0]))).toEqual(['VALIDEE', 'VALIDEE', 'VALIDEE']);
    expect(statut(tx.ligneEcriture.findMany.mock.calls[0][0])).toBe('VALIDEE');
    expect(r.brouillardNonRepris).toBe(2);
  });

  it('F185 · le plan se lit sans ses lignes, et une ligne au DÉTAIL par les seules colonnes du report', async () => {
    const { s, tx } = service(null);
    await s.genererANouveauxProvisoires('t', 'n', 'u');
    expect(tx.compte.findMany.mock.calls[0][0].include).toBeUndefined();
    const detail = tx.ligneEcriture.findMany.mock.calls[0][0];
    expect((detail as { include?: unknown }).include).toBeUndefined();
    expect(detail.select.ecriture).toEqual({ select: { libelle: true } });
    expect(Object.keys(detail.select).sort()).toEqual(
      ['compteId', 'coursApplique', 'credit', 'dateEcheance', 'debit', 'deviseId', 'ecriture', 'id', 'lettre', 'libelle', 'montantDevise'],
    );
  });

  it('la relance REMPLACE le report précédent et reprend son numéro de pièce', async () => {
    const { s, tx, journalService } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: null, rapprochementId: null }] });
    await s.genererANouveauxProvisoires('t', 'n', 'u');
    expect(tx.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    expect(tx.ecriture.create.mock.calls[0][0].data.numeroPiece).toBe(3);
    expect(journalService.prochainNumeroPiece).not.toHaveBeenCalled();
  });

  it('refuse de remplacer un report dont une ligne a été lettrée sur le nouvel exercice', async () => {
    const { s, tx } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: 'AA', rapprochementId: null }] });
    await expect(s.genererANouveauxProvisoires('t', 'n', 'u')).rejects.toThrow(/lettrées ou pointées/);
    expect(tx.ecriture.delete).not.toHaveBeenCalled();
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });
});

import { EcritureService } from '../comptabilite/ecriture.service';

describe('Le report provisoire ne se valide pas', () => {
  it('valider le refuse en le nommant', async () => {
    const prisma = {
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p', statut: 'BROUILLARD', estANouveauProvisoire: true, lignes: [], exercice: { statut: 'OUVERT' }, journal: { code: 'OD' }, numeroPiece: 3 },
        ]),
      },
    };
    const s = new EcritureService(prisma as never, {} as never, {} as never, {} as never);
    await expect(s.valider('t', 'u', ['p'])).rejects.toThrow(/PROVISOIRE ne se valide pas/);
  });
});
