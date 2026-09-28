import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estANouveauEcarte,
  filtreANouveauEcarte,
  RapprochementService,
  type RegleANouveau,
} from './rapprochement.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F205 · le report à-nouveau n'est pas une opération de la banque.
 * Il restait proposé au pointage d'une année sur l'autre, et le pointer
 * comptait l'ouverture deux fois : le solde de départ (celui du rapprochement
 * clos précédent) la contient déjà, ou les lignes de l'exercice qu'il recopie
 * sont au dossier et se pointent une à une.
 *
 * La doublure HONORE les filtres (égalités, `in`, `not`, bornes de date, `OR`,
 * `NOT`, filtres par relation) · une doublure qui rendrait tout validerait une
 * requête qui ne filtre rien.
 */

type Filtre = Record<string, unknown>;

function correspond(objet: unknown, filtre: Filtre): boolean {
  const o = (objet ?? {}) as Record<string, unknown>;
  return Object.entries(filtre).every(([cle, v]) => {
    if (cle === 'OR') return (v as Filtre[]).some((f) => correspond(o, f));
    if (cle === 'AND') return (Array.isArray(v) ? v : [v]).every((f) => correspond(o, f as Filtre));
    if (cle === 'NOT') return !(Array.isArray(v) ? v : [v]).some((f) => correspond(o, f as Filtre));
    const valeur = o[cle];
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      const op = v as Record<string, unknown>;
      // Filtres de liste · `none` et `some` sur une relation multiple.
      if (Array.isArray(valeur) && ('none' in op || 'some' in op)) {
        const touche = valeur.some((x) => correspond(x, (op.none ?? op.some) as Filtre));
        return 'none' in op ? !touche : touche;
      }
      const operateurs = ['in', 'not', 'gte', 'lte', 'lt', 'gt'].filter((k) => k in op);
      if (operateurs.length === 0) return correspond(valeur, op);
      const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
      return operateurs.every((k) => {
        if (k === 'in') return (op.in as unknown[]).includes(valeur);
        if (k === 'not') return valeur !== op.not;
        if (k === 'gte') return n(valeur) >= n(op.gte);
        if (k === 'lte') return n(valeur) <= n(op.lte);
        if (k === 'lt') return n(valeur) < n(op.lt);
        return n(valeur) > n(op.gt);
      });
    }
    return valeur === v;
  });
}

interface Ecr {
  tenantId: string;
  exerciceId: string;
  date: Date;
  estGenereeParCloture: boolean;
  estSoldeDesComptesDeGestion: boolean;
  reference: string | null;
  libelle: string;
  journal: { code: string };
}
interface Ligne {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  libelle: string | null;
  rapprochementId: string | null;
  ligneReleveId: string | null;
  ecriture: Ecr;
}

const ecr = (exerciceId: string, date: string, aNouveau = false): Ecr => ({
  tenantId: 't1',
  exerciceId,
  date: new Date(`${date}T00:00:00Z`),
  estGenereeParCloture: aNouveau,
  estSoldeDesComptesDeGestion: false,
  reference: null,
  libelle: aNouveau ? 'Report à-nouveau' : 'Opération',
  journal: { code: aNouveau ? 'AN' : 'BQ' },
});
const ligne = (id: string, e: Ecr, debit: number, rapprochementId: string | null = null): Ligne => ({
  id,
  compteId: '521',
  debit,
  credit: 0,
  libelle: null,
  rapprochementId,
  ligneReleveId: null,
  ecriture: e,
});

/**
 * Deux exercices · 2025 ouvert par un bilan d'ouverture importé (« bo »), une
 * remise en 2025 (« l25 »), le report à-nouveau de 2026 (« ran26 » = 1 300,
 * soit bo + l25) et une remise de 2026 (« l26 »).
 */
function monter(options: {
  ancre: boolean;
  /** Le bilan d'ouverture est resté libre derrière le rapprochement clos. */
  boLibre?: boolean;
  ran26PointeIci?: boolean;
  releve?: { date: string; credit: number }[];
}) {
  // Rangés du plus récent au plus ancien · une lecture qui oublierait le tri
  // croissant, ou le renverserait, prendrait 2026 pour le premier exercice, et
  // le bilan d'ouverture de 2025 cesserait d'être pointable.
  const exercices = [
    { id: 'ex2026', tenantId: 't1', dateDebut: new Date('2026-01-01T00:00:00Z') },
    { id: 'ex2025', tenantId: 't1', dateDebut: new Date('2025-01-01T00:00:00Z') },
  ];
  const rapprochements = [
    ...(options.ancre
      ? [
          {
            id: 'rap0',
            tenantId: 't1',
            compteId: '521',
            statut: 'CLOTURE',
            soldeReleve: 1300,
            dateReleve: new Date('2025-12-31T00:00:00Z'),
            clotureAt: new Date('2026-01-10T00:00:00Z'),
          },
        ]
      : []),
    {
      id: 'rap1',
      tenantId: 't1',
      compteId: '521',
      statut: 'EN_COURS',
      soldeReleve: 1500,
      dateReleve: new Date('2026-02-28T00:00:00Z'),
      clotureAt: null,
    },
  ];
  const lignes: Ligne[] = [
    ligne('bo', ecr('ex2025', '2025-01-01', true), 1000, options.ancre && !options.boLibre ? 'rap0' : null),
    ligne('l25', ecr('ex2025', '2025-06-10'), 300, options.ancre ? 'rap0' : null),
    ligne('ran26', ecr('ex2026', '2026-01-01', true), 1300, options.ran26PointeIci ? 'rap1' : null),
    ligne('l26', ecr('ex2026', '2026-02-10'), 200),
  ];
  const releve = (options.releve ?? []).map((r, i) => ({
    id: `r${i}`,
    tenantId: 't1',
    rapprochementId: 'rap1',
    rang: i,
    date: new Date(`${r.date}T00:00:00Z`),
    libelle: 'Relevé',
    reference: null,
    debit: 0,
    credit: r.credit,
    lignesEcriture: [] as { id: string }[],
  }));

  const choisir = (where: Filtre) => lignes.filter((l) => correspond(l, where));
  // Le pointage s'écrit dans la doublure · l'écart relu ensuite est celui
  // que la base rendrait.
  const updateMany = jest.fn(async ({ where, data }: { where: Filtre; data: Partial<Ligne> }) => {
    const touchees = choisir(where);
    touchees.forEach((l) => Object.assign(l, data));
    return { count: touchees.length };
  });
  const prisma: Record<string, unknown> = {
    rapprochementBancaire: {
      findFirst: jest.fn(async ({ where, orderBy }: { where: Filtre; orderBy?: unknown }) => {
        const trouves = rapprochements.filter((r) => correspond(r, where));
        if (orderBy) trouves.sort((a, b) => (b.clotureAt?.getTime() ?? 0) - (a.clotureAt?.getTime() ?? 0));
        return trouves[0] ?? null;
      }),
    },
    exercice: {
      // Le tri demandé est honoré, sens compris · sans tri, l'ordre stocké.
      findFirst: jest.fn(async ({ where, orderBy }: { where: Filtre; orderBy?: { dateDebut?: 'asc' | 'desc' } }) => {
        const sens = orderBy?.dateDebut === 'asc' ? 1 : orderBy?.dateDebut === 'desc' ? -1 : 0;
        const tries = sens === 0 ? [...exercices] : [...exercices].sort((a, b) => sens * (a.dateDebut.getTime() - b.dateDebut.getTime()));
        return tries.find((e) => correspond(e, where)) ?? null;
      }),
    },
    ligneReleveBancaire: { findMany: jest.fn(async ({ where }: { where: Filtre }) => releve.filter((r) => correspond(r, where))) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where, take }: { where: Filtre; take?: number }) => choisir(where).slice(0, take)),
      count: jest.fn(async ({ where }: { where: Filtre }) => choisir(where).length),
      aggregate: jest.fn(async ({ where }: { where: Filtre }) => {
        const l = choisir(where);
        return { _sum: { debit: l.reduce((s, x) => s + x.debit, 0), credit: l.reduce((s, x) => s + x.credit, 0) } };
      }),
      updateMany,
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { service: new RapprochementService(prisma as unknown as PrismaService), updateMany };
}

describe('F205 · un rapprochement clos précède · aucun à-nouveau ne se pointe', () => {
  it('la liste ne propose pas le report à-nouveau, et dit combien elle en écarte', async () => {
    const { service } = monter({ ancre: true });
    const r = await service.obtenir('t1', 'rap1');
    expect(r.lignes.map((l) => l.id)).toEqual(['l26']);
    expect(r.totalLignes).toBe(1);
    expect(r.aNouveauEcartes).toBe(1);
    // L'opération de 2026 suffit à rejoindre le relevé · 1 300 de départ + 200.
    expect(r.soldeDepart).toBe(1300);
  });

  it('le pointage direct du report à-nouveau est refusé, rien n’est écrit', async () => {
    const { service, updateMany } = monter({ ancre: true });
    await expect(service.pointer('t1', 'rap1', ['ran26'])).rejects.toThrow(
      /solde de départ, repris du rapprochement précédent, le contient déjà/,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('une opération se pointe toujours, et le rapprochement s’équilibre sans l’à-nouveau', async () => {
    const { service, updateMany } = monter({ ancre: true });
    await service.pointer('t1', 'rap1', ['l26']);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['l26'] } }, data: { rapprochementId: 'rap1' } });
    // 1 300 de départ, repris du rapprochement clos, plus la remise de 200 · le relevé porte 1 500.
    const r = await service.obtenir('t1', 'rap1');
    expect([r.soldePointe, r.ecart, r.equilibre]).toEqual([1500, 0, true]);
  });

  it('un report du même montant qu’une ligne du relevé n’est pas proposé', async () => {
    const { service } = monter({ ancre: true, releve: [{ date: '2026-01-02', credit: 1300 }] });
    const p = await service.proposer('t1', 'rap1');
    expect(p.propositions).toEqual([]);
  });

  it('une correspondance composée à la main sur le report est refusée', async () => {
    const { service, updateMany } = monter({ ancre: true, releve: [{ date: '2026-01-02', credit: 1300 }] });
    await expect(
      service.confirmer('t1', 'rap1', { correspondances: [{ ligneReleveId: 'r0', ligneEcritureIds: ['ran26'] }] }),
    ).rejects.toThrow(/compterait l'ouverture deux fois/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('un report déjà pointé sur CE rapprochement reste montré, pointé, pour se défaire', async () => {
    const { service } = monter({ ancre: true, ran26PointeIci: true });
    const r = await service.obtenir('t1', 'rap1');
    const ran = r.lignes.find((l) => l.id === 'ran26');
    expect(ran?.pointee).toBe(true);
    expect(r.aNouveauEcartes).toBe(0);
  });
});

describe('F205 · aucun rapprochement ne précède · seul le bilan d’ouverture du dossier se pointe', () => {
  it('le bilan d’ouverture du premier exercice reste proposé, le report de 2026 ne l’est pas', async () => {
    const { service } = monter({ ancre: false });
    const r = await service.obtenir('t1', 'rap1');
    expect(r.lignes.map((l) => l.id)).toEqual(['bo', 'l25', 'l26']);
    expect(r.aNouveauEcartes).toBe(1);
    expect(r.soldeDepart).toBe(0);
  });

  it('le report de 2026 est refusé avec le motif qui renvoie aux lignes de 2025', async () => {
    const { service, updateMany } = monter({ ancre: false });
    await expect(service.pointer('t1', 'rap1', ['ran26'])).rejects.toThrow(/pointez ces lignes/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('le bilan d’ouverture se pointe · sans lui l’ouverture n’entrerait par rien', async () => {
    const { service, updateMany } = monter({ ancre: false });
    await service.pointer('t1', 'rap1', ['bo', 'l25', 'l26']);
    expect(updateMany).toHaveBeenCalled();
    // Une seule ouverture · 1 000 + 300 + 200 rejoignent le relevé de 1 500.
    // Le report de 2026 pointé en plus en aurait compté 2 800.
    const r = await service.obtenir('t1', 'rap1');
    expect([r.soldePointe, r.ecart, r.equilibre]).toEqual([1500, 0, true]);
  });
});

describe('F205 · une ancre écarte AUSSI le bilan d’ouverture du premier exercice', () => {
  it('le bilan d’ouverture libre derrière un rapprochement clos n’est ni proposé ni pointable', async () => {
    const { service, updateMany } = monter({ ancre: true, boLibre: true });
    const r = await service.obtenir('t1', 'rap1');
    expect(r.lignes.map((l) => l.id)).not.toContain('bo');
    expect(r.aNouveauEcartes).toBe(2);
    await expect(service.pointer('t1', 'rap1', ['bo'])).rejects.toThrow(/solde de départ/);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('F205 · la règle, sous ses deux formes, dit la même chose', () => {
  const cas: Array<{ nom: string; e: { estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean; exerciceId: string } }> = [
    { nom: 'opération', e: { estGenereeParCloture: false, estSoldeDesComptesDeGestion: false, exerciceId: 'ex2' } },
    { nom: 'à-nouveau du premier exercice', e: { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false, exerciceId: 'ex1' } },
    { nom: 'à-nouveau d’un exercice suivant', e: { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false, exerciceId: 'ex2' } },
    { nom: 'écriture qui solde la gestion', e: { estGenereeParCloture: true, estSoldeDesComptesDeGestion: true, exerciceId: 'ex2' } },
  ];
  const regles: RegleANouveau[] = [
    { ancre: true, premierExerciceId: 'ex1' },
    { ancre: false, premierExerciceId: 'ex1' },
  ];

  it.each(regles)('ancre %o · prédicat et filtre concordent', (regle) => {
    for (const c of cas) {
      expect([c.nom, estANouveauEcarte(c.e, regle)]).toEqual([c.nom, correspond(c.e, filtreANouveauEcarte(regle))]);
    }
  });

  it('les verdicts attendus', () => {
    const [ancre, sansAncre] = regles;
    expect(cas.map((c) => estANouveauEcarte(c.e, ancre))).toEqual([false, true, true, false]);
    expect(cas.map((c) => estANouveauEcarte(c.e, sansAncre))).toEqual([false, false, true, false]);
  });
});

describe('F205 · la proposition lit la règle dans sa requête', () => {
  it('le filtre des candidates écarte les à-nouveaux en base', () => {
    const src = readFileSync(join(__dirname, 'rapprochement.service.ts'), 'utf8');
    const debut = src.indexOf('  async proposer(');
    const fin = src.indexOf('\n  async ', debut + 5);
    expect(src.slice(debut, fin)).toContain('NOT: filtreANouveauEcarte(regle),');
  });
});
