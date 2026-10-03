import { Prisma, StatutExercice } from '@prisma/client';
import { ExerciceService } from './exercice.service';
import { CompteRan, lignesReportANouveau } from './report-a-nouveau';
import { LOT_LECTURE } from '../../common/lecture-par-lots';

/**
 * AUDIT FINAL F185, LE RESTE · la clôture et le report provisoire lisaient
 * toutes les lignes de l'exercice, y compris celles des comptes au SOLDE et de
 * gestion, dont le calcul ne garde que des sommes. Ils demandent désormais ces
 * sommes à la base, et ne lisent ligne à ligne, par tranches, que les comptes
 * au DÉTAIL. Ce spec exige que le report soit le MÊME, au centime, que celui de
 * la lecture d'avant, sur un jeu qui porte ce qui la rendait délicate · deux
 * devises, une ligne inscrite en négatif, une ligne à deux côtés égaux, des
 * lignes en devise sans montant ou à montant nul, une ligne sans devise mais
 * avec un montant, des lettrées au DÉTAIL comme au SOLDE, une lettre vide, du
 * brouillard, un autre exercice et un autre dossier.
 */

// ---------------------------------------------------------------------------
// L'ANCIENNE LECTURE · le calcul d'avant F185, recopié tel quel. C'est la
// référence : il lisait chaque ligne et en tirait le sens une par une.
// ---------------------------------------------------------------------------
type LigneAncienne = {
  debit: number;
  credit: number;
  lettre: string | null;
  libelle: string;
  dateEcheance: Date | null;
  deviseId?: string | null;
  montantDevise?: number | null;
  coursApplique?: number | null;
};
type CompteAncien = { id: string; numero: string; intitule: string; modeReportANouveau: string; lignes: LigneAncienne[] };
const arrondi2 = (x: number) => Math.round(x * 100) / 100;
const soldeAncien = (c: CompteAncien) => c.lignes.reduce((s, l) => s + l.debit - l.credit, 0);
function soldesParDeviseAncien(c: CompteAncien) {
  const parDevise = new Map<string, { deviseId: string; francs: number; devise: number }>();
  for (const l of c.lignes) {
    if (!l.deviseId || !l.montantDevise) continue;
    const net = l.debit - l.credit;
    const sens = net >= 0 ? 1 : -1;
    const g = parDevise.get(l.deviseId) ?? { deviseId: l.deviseId, francs: 0, devise: 0 };
    g.francs += net;
    g.devise += sens * l.montantDevise;
    parDevise.set(l.deviseId, g);
  }
  return [...parDevise.values()]
    .map((g) => ({ ...g, francs: arrondi2(g.francs), devise: arrondi2(g.devise) }))
    .filter((g) => Math.abs(g.francs) > 0.005 && Math.abs(g.devise) > 0.005 && Math.sign(g.francs) === Math.sign(g.devise));
}
function reportLigneALigne(comptes: CompteAncien[], resultat: { compteId: string; montant: number } | null) {
  const lignes: Record<string, unknown>[] = [];
  for (const c of comptes.filter((x) => x.modeReportANouveau === 'SOLDE')) {
    const s = soldeAncien(c) + (resultat && c.id === resultat.compteId ? resultat.montant : 0);
    if (Math.abs(s) <= 0.005) continue;
    let reste = s;
    for (const g of soldesParDeviseAncien(c)) {
      lignes.push({
        compteId: c.id,
        debit: g.francs > 0 ? g.francs : 0,
        credit: g.francs < 0 ? -g.francs : 0,
        libelle: `Report à-nouveau ${c.numero} · ${c.intitule} · en devise`,
        deviseId: g.deviseId,
        montantDevise: Math.abs(g.devise),
        coursApplique: Math.round((Math.abs(g.francs) / Math.abs(g.devise)) * 1e6) / 1e6,
      });
      reste -= g.francs;
    }
    reste = arrondi2(reste);
    if (Math.abs(reste) <= 0.005) continue;
    lignes.push({ compteId: c.id, debit: reste > 0 ? reste : 0, credit: reste < 0 ? -reste : 0, libelle: `Report à-nouveau ${c.numero} · ${c.intitule}` });
  }
  for (const c of comptes.filter((x) => x.modeReportANouveau === 'DETAIL')) {
    for (const l of c.lignes) {
      if (l.lettre) continue;
      lignes.push({
        compteId: c.id,
        debit: l.debit,
        credit: l.credit,
        libelle: `RAN détail ${c.numero} · ${l.libelle}`,
        dateEcheance: l.dateEcheance,
        ...(l.deviseId && l.montantDevise
          ? { deviseId: l.deviseId, montantDevise: l.montantDevise, ...(l.coursApplique ? { coursApplique: l.coursApplique } : {}) }
          : {}),
      });
    }
  }
  return lignes;
}

/** Une ligne telle que la base la garde · deux décimales, jamais plus. */
const canon = (lignes: Record<string, unknown>[]) =>
  lignes
    .map((l) =>
      JSON.stringify({
        compteId: l.compteId,
        debit: Math.round(Number(l.debit) * 100),
        credit: Math.round(Number(l.credit) * 100),
        libelle: l.libelle,
        deviseId: l.deviseId ?? null,
        montantDevise: l.montantDevise == null ? null : Math.round(Number(l.montantDevise) * 100),
        coursApplique: l.coursApplique == null ? null : Math.round(Number(l.coursApplique) * 1e6),
        dateEcheance: l.dateEcheance ? (l.dateEcheance as Date).toISOString() : null,
      }),
    )
    .sort();

// ---------------------------------------------------------------------------
// LA DOUBLURE · une base en mémoire qui HONORE les filtres que la lecture
// pose, et qui lève sur tout filtre qu'elle ne sait pas lire · une doublure
// qui ignore un filtre valide un code qui ne charge pas (CLAUDE.md, F2a).
// Le NULL suit SQL : une comparaison à NULL n'est jamais vraie.
// ---------------------------------------------------------------------------
type Ecr = { tenantId: string; exerciceId: string; statut: string; libelle: string };
type Cpt = { id: string; tenantId: string; numero: string; intitule: string; modeReportANouveau: string };
type Lgn = {
  id: string;
  compteId: string;
  compte: Cpt;
  ecriture: Ecr;
  debit: number;
  credit: number;
  lettre: string | null;
  libelle: string | null;
  dateEcheance: Date | null;
  deviseId: string | null;
  montantDevise: number | null;
  coursApplique: number | null;
};
const estReference = (x: unknown): x is { name: string } =>
  !!x && typeof x === 'object' && 'modelName' in (x as object) && 'name' in (x as object);
function champ(r: Record<string, unknown>, v: unknown, f: unknown): boolean {
  if (f === null || typeof f !== 'object' || f instanceof Date) return v === f;
  return Object.entries(f as Record<string, unknown>).every(([op, x]) => {
    const o = estReference(x) ? r[x.name] : x;
    switch (op) {
      case 'equals':
        return v === o;
      case 'not':
        if (o === null) return v !== null;
        if (typeof o === 'object') return !champ(r, v, o);
        return v !== null && v !== o;
      case 'in':
        return (o as unknown[]).includes(v);
      case 'gt':
        return v !== null && (v as number) > (o as number);
      case 'gte':
        return v !== null && (v as number) >= (o as number);
      case 'lt':
        return v !== null && (v as number) < (o as number);
      case 'lte':
        return v !== null && (v as number) <= (o as number);
      default:
        throw new Error(`doublure : filtre « ${op} » non honoré`);
    }
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
function projeter(r: Record<string, unknown>, select: Record<string, unknown> | undefined) {
  if (!select) return { ...r };
  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(select)) {
    if (v === true) sortie[cle] = ['debit', 'credit', 'montantDevise', 'coursApplique'].includes(cle) && r[cle] !== null ? new Prisma.Decimal(r[cle] as number) : r[cle];
    else if (v && typeof v === 'object') sortie[cle] = projeter(r[cle] as Record<string, unknown>, (v as { select: Record<string, unknown> }).select);
  }
  return sortie;
}

const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };

function base(comptes: Cpt[], lignes: Lgn[]) {
  const lus: Lgn[][] = [];
  const tx = {
    // Relues DANS la transaction de clôture (A7, M2).
    creanceDouteuse: { findMany: jest.fn().mockResolvedValue([]) },
    compte: {
      findMany: jest.fn(async (a: { where: unknown; select?: Record<string, unknown>; orderBy?: unknown; include?: unknown }) => {
        if (a.include) throw new Error('doublure : include non honoré');
        expect(a.orderBy).toEqual({ numero: 'asc' });
        return comptes
          .filter((c) => correspond(c as never, a.where))
          .sort((x, y) => (x.numero < y.numero ? -1 : 1))
          .map((c) => projeter(c as never, a.select));
      }),
      findUnique: jest.fn(async (a: { where: { tenantId_numero: { tenantId: string; numero: string } } }) =>
        comptes.find((c) => c.tenantId === a.where.tenantId_numero.tenantId && c.numero === a.where.tenantId_numero.numero) ?? null,
      ),
    },
    ligneEcriture: {
      fields: { credit: { modelName: 'LigneEcriture', name: 'credit' }, debit: { modelName: 'LigneEcriture', name: 'debit' } },
      groupBy: jest.fn(async (a: { by: string[]; where: unknown; _sum: Record<string, true> }) => {
        const groupes = new Map<string, Record<string, unknown>>();
        for (const l of lignes.filter((x) => correspond(x as never, a.where))) {
          const cle = JSON.stringify(a.by.map((k) => (l as never)[k]));
          const g = groupes.get(cle) ?? {
            ...Object.fromEntries(a.by.map((k) => [k, (l as never)[k]])),
            _sum: Object.fromEntries(Object.keys(a._sum).map((k) => [k, null])),
          };
          const somme = g._sum as Record<string, Prisma.Decimal | null>;
          for (const k of Object.keys(a._sum)) {
            const v = (l as never)[k] as number | null;
            if (v !== null) somme[k] = (somme[k] ?? new Prisma.Decimal(0)).plus(v);
          }
          groupes.set(cle, g);
        }
        return [...groupes.values()];
      }),
      findMany: jest.fn(async (a: { where: unknown; select?: Record<string, unknown>; orderBy: unknown; take: number; cursor?: { id: string }; skip?: number }) => {
        expect(a.orderBy).toEqual({ id: 'asc' });
        let r = lignes.filter((x) => correspond(x as never, a.where)).sort((x, y) => (x.id < y.id ? -1 : 1));
        if (a.cursor) r = r.slice(r.findIndex((x) => x.id === a.cursor!.id) + (a.skip ?? 0));
        r = r.slice(0, a.take);
        lus.push(r);
        return r.map((x) => projeter(x as never, a.select));
      }),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn(), update: jest.fn().mockResolvedValue({ ...N, statut: 'CLOTURE' }) },
    ecriture: { findFirst: jest.fn().mockResolvedValue(null), delete: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    exercice: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => Promise.resolve(where.dateFin || where.dateDebut ? null : N)),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    // Aucun lettrage à cheval de deux exercices (A6 bis, B2).
    lettrage: { findMany: jest.fn().mockResolvedValue([]) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    // Aucun lettrage dénoué en souffrance (décision D3, `ecartsRealisesNonConstates`).
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    creanceDouteuse: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new ExerciceService(prisma as never, { prochainNumeroPiece: jest.fn().mockResolvedValue(7) } as never);
  return { service, tx, lus };
}

// ---------------------------------------------------------------------------
// LE JEU
// ---------------------------------------------------------------------------
const compte = (id: string, numero: string, mode: string, tenantId = 't'): Cpt => ({ id, tenantId, numero, intitule: `Compte ${numero}`, modeReportANouveau: mode });
const COMPTES = [
  compte('601', '60110000', 'AUCUN'),
  compte('701', '70110000', 'AUCUN'),
  compte('521', '52110000', 'SOLDE'),
  compte('522', '52120000', 'SOLDE'),
  compte('162', '16200000', 'SOLDE'),
  compte('101', '10100000', 'SOLDE'),
  compte('131', '13100000', 'SOLDE'),
  compte('139', '13900000', 'SOLDE'),
  compte('411', '41110000', 'DETAIL'),
  compte('401', '40110000', 'DETAIL'),
  compte('v521', '52110000', 'SOLDE', 'voisin'),
];
const parId = new Map(COMPTES.map((c) => [c.id, c]));
let rang = 0;
function ligne(
  compteId: string,
  debit: number,
  credit: number,
  x: Partial<Omit<Lgn, 'id' | 'compteId' | 'compte' | 'ecriture' | 'debit' | 'credit'>> & { ecriture?: Partial<Ecr> } = {},
): Lgn {
  rang++;
  return {
    id: `l${String(rang).padStart(6, '0')}`,
    compteId,
    compte: parId.get(compteId)!,
    ecriture: { tenantId: parId.get(compteId)!.tenantId, exerciceId: 'n', statut: 'VALIDEE', libelle: 'Pièce', ...(x.ecriture ?? {}) },
    debit,
    credit,
    lettre: x.lettre ?? null,
    libelle: x.libelle === undefined ? 'L' : x.libelle,
    dateEcheance: x.dateEcheance ?? null,
    deviseId: x.deviseId ?? null,
    montantDevise: x.montantDevise ?? null,
    coursApplique: x.coursApplique ?? null,
  };
}
const usd = { deviseId: 'usd' };
const eur = { deviseId: 'eur' };
const JEU: Lgn[] = [
  ligne('521', 280_000.1, 0, { ...usd, montantDevise: 100.03 }),
  ligne('521', 0, 145_000.2, { ...usd, montantDevise: 50.01 }),
  // Inscription en négatif (réimputation) · au débit, et elle RETRANCHE.
  ligne('521', -28_000.33, 0, { ...usd, montantDevise: 10 }),
  ligne('521', 0, -2_800.07, { ...usd, montantDevise: 1 }),
  // Deux côtés égaux · le sens est positif (débit moins crédit nul).
  ligne('521', 500, 500, { ...usd, montantDevise: 3 }),
  // En devise sans montant, à montant nul, et un montant sans devise · au reste en francs.
  ligne('521', 700.01, 0, { ...usd }),
  ligne('521', 400, 0, { ...usd, montantDevise: 0 }),
  ligne('521', 900.5, 0, { montantDevise: 50 }),
  ligne('521', 10_000.02, 0),
  ligne('521', 330_000.3, 0, { ...eur, montantDevise: 100.07 }),
  ligne('521', 2_800_000.55, 0),
  ligne('521', 200, 0),
  ligne('522', 280_000, 0, { ...eur, montantDevise: 100 }),
  ligne('522', 0, 272_700.11, { ...eur, montantDevise: 101 }),
  ligne('162', 0, 2_800_000.55, { ...usd, montantDevise: 1000.2, coursApplique: 2799.45 }),
  // Lettrées sur des comptes au SOLDE, en devise et en francs · le solde les
  // compte toutes, seul le DÉTAIL écarte ce qui est lettré. Une lecture qui
  // reprendrait le filtre du DÉTAIL pour les sommes perdrait ces deux lignes.
  ligne('162', 1_400.5, 0, { ...usd, montantDevise: 0.5, lettre: 'ZZ' }),
  ligne('521', 0, 1_400.5, { lettre: 'ZZ' }),
  ligne('101', 0, 280_000.1),
  ligne('101', 0, -28_000.33),
  ligne('101', -2_800.07, 0),
  ligne('101', 0, 330_000.3),
  ligne('101', 0, 280_000),
  ligne('601', 145_000.2, 0),
  ligne('601', 272_700.11, 0),
  ligne('601', 300.3, 0),
  ligne('701', 0, 700.01 + 400 + 900.5 + 10_000.02 + 300.1 + 200 + 50.5),
  ligne('411', 300.1, 0, { dateEcheance: new Date('2027-02-01'), ...usd, montantDevise: 0.11, coursApplique: 2728.18 }),
  ligne('411', 200, 0, { lettre: 'AA' }),
  ligne('411', 0, 200, { lettre: 'AA' }),
  ligne('411', 50.5, 0, { lettre: '', libelle: null }),
  ligne('401', 0, 300.3),
  // Brouillard · la clôture le lit (elle l'a refusé plus haut), le provisoire jamais.
  ligne('521', 7_777.77, 0, { ...usd, montantDevise: 2.5, ecriture: { statut: 'BROUILLARD' } }),
  ligne('701', 0, 7_777.77, { ecriture: { statut: 'BROUILLARD' } }),
  ligne('411', 99.99, 0, { ecriture: { statut: 'BROUILLARD' } }),
  ligne('701', 0, 99.99, { ecriture: { statut: 'BROUILLARD' } }),
  // Un autre exercice et un autre dossier · jamais lus.
  ligne('521', 123_456, 0, { ...usd, montantDevise: 44, ecriture: { exerciceId: 'n0' } }),
  ligne('411', 11, 0, { ecriture: { exerciceId: 'n0' } }),
  ligne('v521', 5_555, 0, { ecriture: { exerciceId: 'nv' } }),
];

/** La lecture d'avant · toutes les lignes de chaque compte du dossier. */
function ancienneLecture(filtre: (l: Lgn) => boolean): CompteAncien[] {
  return COMPTES.filter((c) => c.tenantId === 't').map((c) => ({
    ...c,
    lignes: JEU.filter((l) => l.compteId === c.id && l.ecriture.tenantId === 't' && l.ecriture.exerciceId === 'n' && filtre(l)).map((l) => ({
      debit: l.debit,
      credit: l.credit,
      lettre: l.lettre,
      libelle: l.libelle ?? l.ecriture.libelle,
      dateEcheance: l.dateEcheance,
      deviseId: l.deviseId,
      montantDevise: l.montantDevise,
      coursApplique: l.coursApplique,
    })),
  }));
}

describe('F185 · le report se lit en sommes, et rend le report de la lecture ligne à ligne', () => {
  it('le jeu porte bien les cas qui décident · sinon l’égalité ne prouverait rien', () => {
    const r521 = reportLigneALigne(ancienneLecture((l) => l.ecriture.statut === 'VALIDEE'), null).filter((l) => l.compteId === '521');
    // Deux devises au report de la banque, et un reste en francs.
    expect(r521.map((l) => l.deviseId ?? null).sort()).toEqual(['eur', 'usd', null].sort());
    // La ligne inscrite en négatif au débit RETRANCHE, celle au crédit
    // ajoute, les deux côtés égaux comptent en positif · 100,03 − 50,01 − 10
    // + 1 + 3 = 44,02 USD.
    expect(r521.find((l) => l.deviseId === 'usd')).toMatchObject({ montantDevise: 44.02 });
    // Une ligne lettrée d'un compte au SOLDE pèse sur son report · au 162,
    // 1 000,2 − 0,5 = 999,7 USD et 2 800 000,55 − 1 400,5 = 2 798 600,05 FC.
    const r162 = reportLigneALigne(ancienneLecture((l) => l.ecriture.statut === 'VALIDEE'), null).filter((l) => l.compteId === '162');
    expect(r162).toEqual([expect.objectContaining({ deviseId: 'usd', credit: 2_798_600.05, montantDevise: 999.7 })]);
  });

  it('le PROVISOIRE, sur le livre-journal seul, rend le même report au centime', async () => {
    const { service, tx } = base(COMPTES, JEU);
    const r = await service.genererANouveauxProvisoires('t', 'n', 'u');
    const ancien = ancienneLecture((l) => l.ecriture.statut === 'VALIDEE');
    const delta = arrondi2(ancien.filter((c) => c.modeReportANouveau === 'AUCUN').reduce((s, c) => s + soldeAncien(c), 0));
    const attendu = reportLigneALigne(ancien, { compteId: delta > 0 ? '139' : '131', montant: delta });
    const obtenu = tx.ecriture.create.mock.calls[0][0].data.lignes.create;
    expect(canon(obtenu)).toEqual(canon(attendu));
    expect(r.resultat).toBe(delta);
  });

  it('la CLÔTURE rend la même écriture de solde et le même report définitif', async () => {
    const { service, tx } = base(COMPTES, JEU);
    await service.cloturer('t', 'n', 'u');
    const ancien = ancienneLecture(() => true);
    const aucun = ancien
      .filter((c) => c.modeReportANouveau === 'AUCUN')
      .map((c) => ({ c, s: soldeAncien(c) }))
      .filter((x) => Math.abs(x.s) > 0.005);
    const delta = aucun.reduce((t, x) => t + x.s, 0);
    const compteResultat = delta > 0 ? '139' : '131';
    const solde = aucun.map(({ c, s }) => ({ compteId: c.id, debit: s > 0 ? 0 : -s, credit: s > 0 ? s : 0, libelle: `Clôture ${c.numero} · ${c.intitule}` }));
    solde.push({
      compteId: compteResultat,
      debit: delta > 0 ? delta : 0,
      credit: delta < 0 ? -delta : 0,
      libelle: delta > 0 ? "Perte nette de l'exercice" : "Bénéfice net de l'exercice",
    });
    const [cloture, ran] = tx.ecriture.create.mock.calls.map((c) => c[0].data);
    expect(canon(cloture.lignes.create)).toEqual(canon(solde));
    expect(canon(ran.lignes.create)).toEqual(canon(reportLigneALigne(ancien, { compteId: compteResultat, montant: delta })));
  });

  it('le calcul, nourri des lignes elles-mêmes, rend le même report que l’ancien · sommesDesLignes en est la définition', () => {
    const ancien = ancienneLecture((l) => l.ecriture.statut === 'VALIDEE');
    const nouveau = ancien.map((c) => ({ ...c, modeReportANouveau: c.modeReportANouveau as CompteRan['modeReportANouveau'] }));
    const resultat = { compteId: '131', montant: -1234.56 };
    expect(canon(lignesReportANouveau(nouveau, resultat) as never)).toEqual(canon(reportLigneALigne(ancien, resultat)));
  });

  it('aucune ligne d’un compte au SOLDE ou de gestion, ni aucune lettrée, ne monte en mémoire', async () => {
    const { service, tx, lus } = base(COMPTES, JEU);
    await service.genererANouveauxProvisoires('t', 'n', 'u');
    // Le plan se lit sans ses lignes.
    expect(tx.compte.findMany.mock.calls[0][0].include).toBeUndefined();
    const lues = lus.flat();
    expect(lues.length).toBeGreaterThan(0);
    expect(lues.every((l) => l.compte.modeReportANouveau === 'DETAIL')).toBe(true);
    expect(lues.every((l) => !l.lettre)).toBe(true);
    // Les sommes au SOLDE viennent des regroupements, sur le livre-journal seul.
    const perimetre = (a: { where: unknown }) => (a.where as { ecriture: unknown }).ecriture;
    for (const appel of tx.ligneEcriture.groupBy.mock.calls) expect(perimetre(appel[0])).toEqual({ tenantId: 't', exerciceId: 'n', statut: 'VALIDEE' });
    expect(perimetre(tx.ligneEcriture.findMany.mock.calls[0][0])).toEqual({ tenantId: 't', exerciceId: 'n', statut: 'VALIDEE' });
  });

  it('au-delà d’une tranche, chaque mouvement non lettré du DÉTAIL passe une fois, et une seule', async () => {
    const nombre = LOT_LECTURE + 3;
    const factures = Array.from({ length: nombre }, (_, i) => ligne('411', 1 + (i % 7) / 100, 0, { libelle: `F${i}` }));
    const jeu = [...factures, ligne('701', 0, factures.reduce((s, l) => s + l.debit, 0))];
    const { service, tx } = base(COMPTES, jeu);
    await service.genererANouveauxProvisoires('t', 'n', 'u');
    const reportees = (tx.ecriture.create.mock.calls[0][0].data.lignes.create as { compteId: string; libelle: string }[]).filter((l) => l.compteId === '411');
    expect(reportees).toHaveLength(nombre);
    expect(new Set(reportees.map((l) => l.libelle)).size).toBe(nombre);
    const tranches = tx.ligneEcriture.findMany.mock.calls.map((c) => c[0]);
    expect(tranches).toHaveLength(2);
    expect(tranches[1].cursor).toEqual({ id: [...factures].sort((a, b) => (a.id < b.id ? -1 : 1))[LOT_LECTURE - 1].id });
  });
});
