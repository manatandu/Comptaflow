import { BadRequestException, ConflictException } from '@nestjs/common';
import { ComptabiliteGestionService } from './comptabilite-gestion.service';
import { OdAnalytiqueService } from '../od-analytique.service';

/**
 * Le service de la ligne A20 sur une doublure qui HONORE la requête · chaque
 * `findMany` filtre ce qu'il rend par son `where` (section, dossier, dates,
 * identifiants), sans quoi un filtre oublié passerait au vert (§ 10 bis,
 * « la doublure doit honorer la requête »).
 */

const T = 'd-1';
const EX_N = { id: 'ex-n', tenantId: T, statut: 'OUVERT', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') };
const EX_N1 = { id: 'ex-n1', tenantId: T, statut: 'OUVERT', dateDebut: new Date('2027-01-01T00:00:00Z'), dateFin: new Date('2027-12-31T00:00:00Z') };

const SECTIONS = [
  { id: 'aux', tenantId: T, planId: 'p', code: 'ATEL', type: 'DETAIL', estActive: true },
  { id: 'a', tenantId: T, planId: 'p', code: 'PROD-A', type: 'DETAIL', estActive: true },
  { id: 'b', tenantId: T, planId: 'p', code: 'PROD-B', type: 'DETAIL', estActive: true },
];
const COMPTES = [
  { id: 'c624', tenantId: T, numero: '62410000', intitule: 'Entretien', classe: 'CLASSE_6', typeCompte: 'DETAIL', comportementGestion: null, partVariableGestionPct: null },
  { id: 'c521', tenantId: T, numero: '52110000', intitule: 'Banque', classe: 'CLASSE_5', typeCompte: 'DETAIL', comportementGestion: null, partVariableGestionPct: null },
  { id: 'c62', tenantId: T, numero: '62', intitule: 'Services', classe: 'CLASSE_6', typeCompte: 'TOTAL', comportementGestion: null, partVariableGestionPct: null },
];

function doublure(etat: {
  ventilations: { id: string; sectionId: string; debit: number; credit: number; compteId: string; date: Date; exerciceId: string }[];
  cles: any[];
  /** Exercices clos (statut CLOTURE) pour la doublure. */
  clos?: string[];
}) {
  const odsCreees: any[] = [];
  const comptesMaj: any[] = [];
  const figes: any[] = [];
  const statut = (e: { id: string; statut: string }) => (etat.clos?.includes(e.id) ? 'CLOTURE' : e.statut);
  // LE VERROU CONSULTATIF, MODÉLISÉ · `$executeRaw` dans une transaction prend
  // un verrou que la transaction rend en finissant ; une seconde transaction
  // qui le demande attend. La doublure ne sérialise RIEN d'elle-même · sans
  // l'appel au verrou, deux répartitions simultanées liraient le même solde.
  let verrou: Promise<void> = Promise.resolve();
  const dans = (val: unknown, filtre: any) => (filtre?.in ? filtre.in.includes(val) : filtre === undefined || filtre === val);
  const prisma: any = {
    exercice: {
      findMany: async ({ where }: any) =>
        [EX_N, EX_N1]
          .filter((e) => e.tenantId === where.tenantId && statut(e) === where.statut && !figes.some((f) => f.exerciceId === e.id))
          .map((e) => ({ id: e.id })),
      findFirst: async ({ where }: any) => {
        if (where.id) {
          const e = [EX_N, EX_N1].find((x) => x.id === where.id && x.tenantId === where.tenantId);
          return e ? { ...e, statut: statut(e) } : null;
        }
        // Le précédent · dateFin < début, le plus tardif.
        return [EX_N, EX_N1].filter((e) => e.tenantId === where.tenantId && e.dateFin < where.dateFin.lt).sort((x, y) => +y.dateFin - +x.dateFin)[0] ?? null;
      },
    },
    cleRepartition: {
      findFirst: async ({ where }: any) => {
        const k = etat.cles.find((c) => c.id === where.id && c.tenantId === where.tenantId);
        if (!k) return null;
        return { ...k, exercice: [EX_N, EX_N1].find((e) => e.id === k.exerciceId), plan: { classesVentilees: '2,6,7,9' }, sectionSource: { code: 'ATEL', intitule: 'Atelier' }, _count: { ods: odsCreees.filter((o) => o.cleRepartitionId === k.id).length } };
      },
      findMany: async ({ where }: any) =>
        etat.cles
          .filter((c) => c.tenantId === where.tenantId && c.exerciceId === where.exerciceId)
          .map((c) => ({ ...c, sectionSource: { code: 'ATEL' } })),
      create: async ({ data }: any) => {
        const k = { id: `k-${etat.cles.length + 1}`, ...data, lignes: data.lignes.create };
        etat.cles.push(k);
        return k;
      },
      delete: async () => ({}),
    },
    sectionAnalytique: {
      findMany: async ({ where }: any) => SECTIONS.filter((s) => s.tenantId === where.tenantId && dans(s.planId, where.planId) && dans(s.id, where.id)),
    },
    ventilationAnalytique: {
      findMany: async ({ where, cursor }: any) => {
        if (cursor) return [];
        const e = where.ligne.ecriture;
        return etat.ventilations
          .filter((v) => v.sectionId === where.sectionId && v.exerciceId === e.exerciceId && v.date >= e.date.gte && v.date <= e.date.lte)
          .map((v) => ({ id: v.id, debit: v.debit, credit: v.credit, ligne: { compteId: v.compteId } }));
      },
    },
    ligneOdAnalytique: {
      findMany: async ({ where, cursor }: any) => {
        if (cursor) return [];
        return odsCreees
          .filter((o) => o.tenantId === where.tenantId && o.exerciceId === where.od.exerciceId && o.date >= where.od.date.gte && o.date <= where.od.date.lte)
          .flatMap((o) => o.lignes.create.filter((l: any) => l.sectionId === where.sectionId).map((l: any, i: number) => ({ id: `${o.compteId}-${i}`, ...l, od: { compteId: o.compteId } })));
      },
    },
    compte: {
      findMany: async ({ where }: any) =>
        COMPTES.filter(
          (c) =>
            c.tenantId === where.tenantId &&
            dans(c.id, where.id) &&
            (where.comportementGestion?.not !== null || c.comportementGestion !== null),
        ),
      update: async (args: any) => {
        comptesMaj.push(args);
        return {};
      },
    },
    cloture: { findMany: async () => [] },
    comportementsGestionFiges: {
      create: async ({ data }: any) => {
        figes.push(data);
        return data;
      },
      findFirst: async ({ where }: any) => figes.find((f) => f.tenantId === where.tenantId && f.exerciceId === where.exerciceId) ?? null,
    },
    odAnalytique: {
      create: async ({ data }: any) => {
        odsCreees.push(data);
        return data;
      },
    },
    $transaction: async (fn: any) => {
      let liberer = () => {};
      const tx = {
        ...prisma,
        $executeRaw: async () => {
          const avant = verrou;
          verrou = new Promise<void>((r) => (liberer = r));
          await avant;
        },
      };
      try {
        return await fn(tx);
      } finally {
        liberer();
      }
    },
  };
  const service = new ComptabiliteGestionService(prisma, new OdAnalytiqueService(prisma));
  return { service, odsCreees, comptesMaj, etat, figes };
}

const cleN = {
  id: 'k-1',
  tenantId: T,
  exerciceId: 'ex-n',
  planId: 'p',
  sectionSourceId: 'aux',
  libelle: 'Atelier par surfaces',
  mode: 'POURCENTAGE',
  unite: null,
  source: 'Plan des surfaces',
  lignes: [
    { sectionCibleId: 'a', valeur: 60 },
    { sectionCibleId: 'b', valeur: 40 },
  ],
};

describe('répartition par clé (ligne A20)', () => {
  const ventilations = [
    { id: 'v1', sectionId: 'aux', debit: 800, credit: 0, compteId: 'c624', date: new Date('2026-03-10T00:00:00Z'), exerciceId: 'ex-n' },
    { id: 'v2', sectionId: 'aux', debit: 200, credit: 0, compteId: 'c624', date: new Date('2026-11-05T00:00:00Z'), exerciceId: 'ex-n' },
    // Une autre section · la doublure honore le filtre, elle n'entre pas.
    { id: 'v3', sectionId: 'a', debit: 5000, credit: 0, compteId: 'c624', date: new Date('2026-03-10T00:00:00Z'), exerciceId: 'ex-n' },
  ];

  it('propose à la date · 1 000 au 31 décembre (60 % et 40 %), 800 au 30 juin', async () => {
    const { service } = doublure({ ventilations, cles: [{ ...cleN }] });
    const fin = await service.proposition(T, 'k-1');
    expect(fin.date).toBe('2026-12-31');
    expect(fin.ods).toHaveLength(1);
    expect(fin.ods[0].lignes.map((l) => [l.code, l.debit, l.credit])).toEqual([['ATEL', 0, 1000], ['PROD-A', 600, 0], ['PROD-B', 400, 0]]);
    const juin = await service.proposition(T, 'k-1', '2026-06-30');
    expect(juin.ods[0].solde).toBe(800);
  });

  it('rejoue avant d’écrire · des soldes périmés sont refusés (409), rien n’est passé', async () => {
    const { service, odsCreees } = doublure({ ventilations, cles: [{ ...cleN }] });
    await expect(service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: { c624: 800 } })).rejects.toBeInstanceOf(ConflictException);
    expect(odsCreees).toHaveLength(0);
  });

  it('passe une OD par compte, liée à la clé, et la section source est vidée · une seconde répartition n’a plus rien', async () => {
    const { service, odsCreees } = doublure({ ventilations, cles: [{ ...cleN }] });
    const r = await service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: { c624: 1000 } });
    expect(r).toEqual({ ods: 1, total: 1000 });
    expect(odsCreees[0]).toMatchObject({ cleRepartitionId: 'k-1', compteId: 'c624', planId: 'p', exerciceId: 'ex-n' });
    await expect(service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: {} })).rejects.toThrow(/déjà passée/);
  });

  it('DEUX CLICS SIMULTANÉS · une seule répartition passe, la seconde reçoit 409 (seconde relecture, BLOQUANT)', async () => {
    // Sur vraie base, sans verrou, les deux passaient · la section répartie
    // finissait à -1 000 au lieu de zéro, le total du plan restant juste.
    const { service, odsCreees } = doublure({ ventilations, cles: [{ ...cleN }] });
    const resultats = await Promise.allSettled([
      service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: { c624: 1000 } }),
      service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: { c624: 1000 } }),
    ]);
    expect(resultats.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refus = resultats.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refus.reason).toBeInstanceOf(ConflictException);
    expect(odsCreees).toHaveLength(1);
  });

  it('une clé qui a produit des OD ne se retire pas', async () => {
    const { service } = doublure({ ventilations, cles: [{ ...cleN }] });
    await service.repartir(T, 'u', 'k-1', { date: '2026-12-31', soldes: { c624: 1000 } });
    await expect(service.supprimerCle(T, 'k-1')).rejects.toThrow(/a produit 1 OD/);
  });

  it('N+1 reprend les clés de N par un geste, source dite, sans doubler une clé déjà déclarée', async () => {
    const { service, etat } = doublure({ ventilations: [], cles: [{ ...cleN }] });
    const r = await service.reprendreCles(T, 'u', 'ex-n1');
    expect(r).toEqual({ reprises: 1, ecartees: [] });
    const reprise = etat.cles.find((c) => c.exerciceId === 'ex-n1');
    expect(reprise.source).toMatch(/reprise de l'exercice clos le 2026-12-31/);
    expect(reprise.lignes).toEqual([
      { tenantId: T, sectionCibleId: 'a', valeur: 60 },
      { tenantId: T, sectionCibleId: 'b', valeur: 40 },
    ]);
    const encore = await service.reprendreCles(T, 'u', 'ex-n1');
    expect(encore.reprises).toBe(0);
    expect(encore.ecartees[0].motif).toMatch(/existe déjà/);
  });
});

describe('déclaration des comportements (ligne A20)', () => {
  it('refuse un compte de bilan et un compte Total avant toute écriture', async () => {
    const { service, comptesMaj } = doublure({ ventilations: [], cles: [] });
    await expect(
      service.declarerComportements(T, { declarations: [{ compteId: 'c624', comportement: 'CHARGE_FIXE' }, { compteId: 'c521', comportement: 'CHARGE_FIXE' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.declarerComportements(T, { declarations: [{ compteId: 'c62', comportement: 'CHARGE_FIXE' }] })).rejects.toThrow(/Total/);
    expect(comptesMaj).toHaveLength(0);
  });

  it('un exercice clos est figé AVANT la première déclaration qui suit sa clôture, une fois (seconde relecture, mineur a)', async () => {
    const { service, figes } = doublure({ ventilations: [], cles: [], clos: ['ex-n'] });
    COMPTES[0].comportementGestion = 'CHARGE_FIXE' as never;
    try {
      await service.declarerComportements(T, { declarations: [{ compteId: 'c624', comportement: 'CHARGE_VARIABLE' }] });
      // L'instantané porte la déclaration EN VIGUEUR avant le changement.
      expect(figes).toEqual([{ tenantId: T, exerciceId: 'ex-n', comportements: { c624: { comportement: 'CHARGE_FIXE', partVariablePct: null } } }]);
      await service.declarerComportements(T, { declarations: [{ compteId: 'c624', comportement: 'CHARGE_FIXE' }] });
      expect(figes).toHaveLength(1);
    } finally {
      COMPTES[0].comportementGestion = null;
    }
  });

  it('écrit compte par compte (une mise à jour unitaire chacun)', async () => {
    const { service, comptesMaj } = doublure({ ventilations: [], cles: [] });
    await service.declarerComportements(T, { declarations: [{ compteId: 'c624', comportement: 'CHARGE_SEMI_VARIABLE', partVariablePct: 25 }] });
    expect(comptesMaj).toEqual([{ where: { id: 'c624' }, data: { comportementGestion: 'CHARGE_SEMI_VARIABLE', partVariableGestionPct: 25 } }]);
  });
});
