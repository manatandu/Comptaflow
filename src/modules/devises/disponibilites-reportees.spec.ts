import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LIGNE A5 BIS · LA BANQUE OUVRE N+1 À SA VALEUR DE CLÔTURE DE N.
 *
 * AUDCIF art. 57 · l'écart d'une disponibilité en devise est inscrit
 * « directement dans les produits et charges de l'exercice » ; il n'est plus
 * contre-passé. Or il est passé SANS devise, et l'à-nouveau en SOLDE reporte
 * la ligne de la devise au total de ses seules lignes en devise (coût
 * historique), l'écart tombant dans le reste en francs. Lue sur ses lignes en
 * devise, la caisse de N+1 repartait du coût historique, et la réévaluation
 * de N+1 repassait l'écart de N · deux fois la même perte, écriture
 * équilibrée, balance bouclée.
 *
 * Jeu d'essai · caisse de 1 000 USD (57120000) entrée à 2 800, réévaluée au
 * 31/12/2026 à 2 500 (perte réalisée de 300 000, D 676 / C 5712), cours du
 * 31/12/2027 à 2 400. La perte de 2027 est de 100 000, pas de 400 000.
 */

type Faux = Record<string, unknown>;

interface Exo {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  statut: string;
}

const N: Exo = { id: 'e26', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'CLOTURE' };
const N1: Exo = { id: 'e27', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' };

interface Ligne {
  compteId: string;
  numero: string;
  deviseId: string | null;
  debit: number;
  credit: number;
  montantDevise: number | null;
  exerciceId: string;
  date: Date;
  /** Ouverture · `aNouveau` (report d'OmegaX), `provisoire`, ou absent. */
  ouverture?: 'DEFINITIF' | 'PROVISOIRE' | 'SAISIE';
  creeeLe?: Date;
}

/** La caisse en N · entrée de 1 000 USD au cours de 2 800. */
const caisseN: Ligne = {
  compteId: 'c-5712',
  numero: '57120000',
  deviseId: 'usd',
  debit: 2_800_000,
  credit: 0,
  montantDevise: 1000,
  exerciceId: 'e26',
  date: new Date('2026-03-01'),
};

/** L'à-nouveau de N+1 en SOLDE · la ligne de la devise au total de ses lignes en devise. */
const ouvertureN1 = (ouverture: Ligne['ouverture'] = 'DEFINITIF', creeeLe = new Date('2027-01-10')): Ligne => ({
  ...caisseN,
  exerciceId: 'e27',
  date: N1.dateDebut,
  ouverture,
  creeeLe,
});

interface Reeval {
  exerciceId: string;
  ecartsDisponibilites?: unknown;
  extourneInverseLaCaisse?: boolean;
  statutEcarts?: 'VALIDEE' | 'BROUILLARD';
  valideeAt?: Date | null;
  coursUtilises?: Record<string, number> | null;
  /** Net passé sur la caisse par l'écriture des écarts (débit moins crédit). */
  passeSurLaCaisse?: number;
  dateReevaluation?: Date;
  /** Lignes de l'écriture des écarts, à la place de la caisse et de son 676. */
  lignesEcarts?: { compteId: string; numero: string; debit: number; credit: number }[];
  /** La contre-passation est passée (`ecritureExtourneId`), dans sa forme d'A5 bis. */
  contrePassee?: boolean;
  /** L'exercice qui porte la contre-passation (par défaut, celui qui suit immédiatement). */
  contrePasseeDans?: string;
  /** La ventilation déclarée par le cabinet (B1, c). */
  ventilation?: { compteId: string; deviseId: string; ecart: number }[];
}

function correspond(valeur: unknown, filtre: unknown): boolean {
  if (filtre === undefined) return true;
  if (filtre === null) return valeur === null || valeur === undefined;
  if (filtre instanceof Date) return valeur instanceof Date && valeur.getTime() === filtre.getTime();
  if (typeof filtre === 'object') {
    const f = filtre as Record<string, unknown>;
    if ('in' in f) return (f.in as unknown[]).includes(valeur);
    if ('not' in f) return f.not === null ? valeur !== null && valeur !== undefined : valeur !== f.not;
    const t = (valeur as Date).getTime();
    if ('lt' in f && !(t < (f.lt as Date).getTime())) return false;
    if ('lte' in f && !(t <= (f.lte as Date).getTime())) return false;
    if ('gt' in f && !(t > (f.gt as Date).getTime())) return false;
    if ('gte' in f && !(t >= (f.gte as Date).getTime())) return false;
    return true;
  }
  return valeur === filtre;
}

/** Le cours de la table · un nombre, ou une fonction de la date et de la devise. */
type CoursDeLaTable = number | ((date: Date, deviseId: string) => number | null);

/** La référence de champ `fields.credit` · la doublure la reconnaît dans `debit: { gte | lt }`. */
const CHAMP_CREDIT = { champ: 'credit' };

function monter(p: { lignes: Ligne[]; reeval?: Reeval; reevals?: Reeval[]; cours?: CoursDeLaTable; exercices?: Exo[] }) {
  const exercices = p.exercices ?? [N, N1];
  const reevals = [...(p.reeval ? [p.reeval] : []), ...(p.reevals ?? [])];
  const filtrerExercices = (where: Record<string, unknown> = {}) =>
    exercices.filter((e) =>
      Object.entries(where).every(([cle, f]) => (cle === 'tenantId' ? true : correspond((e as unknown as Record<string, unknown>)[cle], f))),
    );
  const trier = (liste: Exo[], orderBy?: Record<string, string>) => {
    if (!orderBy) return liste;
    const [cle, sens] = Object.entries(orderBy)[0];
    return [...liste].sort((a, b) => {
      const d = (a as unknown as Record<string, Date>)[cle].getTime() - (b as unknown as Record<string, Date>)[cle].getTime();
      return sens === 'desc' ? -d : d;
    });
  };
  const CLES_CONNUES = new Set(['compteId', 'deviseId', 'lettre', 'ecriture']);
  const lignesFiltrees = (where: Record<string, unknown> = {}) => {
    // Une requête que la doublure ne sait pas lire ne ramène rien · ce n'est
    // pas l'objet de ce spec (provision, groupes lettrés).
    if (Object.keys(where).some((k) => !CLES_CONNUES.has(k))) return [];
    const e = (where.ecriture ?? {}) as Record<string, unknown>;
    return p.lignes.filter((l) => {
      if (!correspond(l.compteId, where.compteId)) return false;
      if (!correspond(l.deviseId, where.deviseId)) return false;
      if (!correspond(l.exerciceId, e.exerciceId)) return false;
      if (!correspond(l.date, e.date)) return false;
      if (e.estGenereeParCloture === true && !(l.ouverture === 'DEFINITIF' || l.ouverture === 'PROVISOIRE')) return false;
      return true;
    });
  };
  const habiller = (l: Ligne) => ({
    ...l,
    lettre: null,
    lettrageId: null,
    compte: { id: l.compteId, numero: l.numero, intitule: `Compte ${l.numero}` },
    devise: l.deviseId ? { id: l.deviseId, code: l.deviseId.toUpperCase() } : null,
    ecriture: { estANouveauProvisoire: l.ouverture === 'PROVISOIRE', createdAt: l.creeeLe ?? new Date('2027-01-10') },
  });
  // LA RELECTURE DES SOMMES (M5) · par compte, devise et sens, sur le compte
  // TEL QU'IL ÉTAIT · la doublure honore la saisie avant la réévaluation
  // (`createdAt`, à défaut le 1er juin 2026) et l'à-nouveau du début.
  const grouper = (a: { where: Record<string, unknown> }) => {
    const w = a.where;
    const e = (w.ecriture ?? {}) as Record<string, unknown>;
    const branches = Array.isArray(e.OR) ? (e.OR as Record<string, unknown>[]) : null;
    const sens = w.debit as { gte?: unknown; lt?: unknown } | undefined;
    const retenues = p.lignes.filter((l) => {
      if (!correspond(l.compteId, w.compteId) || !correspond(l.deviseId, w.deviseId)) return false;
      if (!correspond(l.exerciceId, e.exerciceId) || !correspond(l.date, e.date)) return false;
      if (branches) {
        const saisieAvant = branches.some((b) =>
          b.createdAt
            ? correspond(l.creeeLe ?? new Date('2026-06-01'), b.createdAt)
            : b.date !== undefined && correspond(l.date, b.date) && (l.ouverture === 'DEFINITIF' || l.ouverture === 'PROVISOIRE'),
        );
        if (!saisieAvant) return false;
      }
      if (sens?.gte === CHAMP_CREDIT && !(l.debit >= l.credit)) return false;
      if (sens?.lt === CHAMP_CREDIT && !(l.debit < l.credit)) return false;
      return true;
    });
    const groupes = new Map<string, { compteId: string; deviseId: string | null; _sum: { debit: number; credit: number; montantDevise: number } }>();
    for (const l of retenues) {
      const cle = `${l.compteId}|${l.deviseId}`;
      const g = groupes.get(cle) ?? { compteId: l.compteId, deviseId: l.deviseId, _sum: { debit: 0, credit: 0, montantDevise: 0 } };
      g._sum.debit += l.debit;
      g._sum.credit += l.credit;
      g._sum.montantDevise += l.montantDevise ?? 0;
      groupes.set(cle, g);
    }
    return [...groupes.values()];
  };
  const suivantDe = (exerciceId: string) => {
    const i = exercices.findIndex((x) => x.id === exerciceId);
    return i >= 0 && i + 1 < exercices.length ? exercices[i + 1].id : 'e-suivant';
  };
  /** L'exercice qui porte une contre-passation, tel que le portillon le lit (son début). */
  const exerciceDe = (id: string) => ({ dateDebut: exercices.find((x) => x.id === id)?.dateDebut ?? new Date('2028-01-01') });
  const reevaluationDe = (exerciceId: string) => {
    const r = reevals.find((x) => x.exerciceId === exerciceId);
    if (!r) return null;
    const lignesEcarts = r.lignesEcarts ?? [
      { compteId: 'c-676', numero: '67600000', debit: -(r.passeSurLaCaisse ?? -300_000), credit: 0 },
      { compteId: 'c-5712', numero: '57120000', debit: 0, credit: -(r.passeSurLaCaisse ?? -300_000) },
    ];
    return {
      id: `r-${r.exerciceId}`,
      exerciceId: r.exerciceId,
      dateReevaluation: r.dateReevaluation ?? N.dateFin,
      ecritureExtourneId: r.contrePassee || r.extourneInverseLaCaisse ? 'cp' : null,
      createdAt: new Date('2027-01-05'),
      annuleeLe: null,
      coursUtilises: r.coursUtilises === undefined ? { usd: 2500 } : r.coursUtilises,
      ecartsDisponibilites: r.ecartsDisponibilites ?? null,
      ventilationDisponibilites: r.ventilation ?? null,
      ecritureEcarts: {
        statut: r.statutEcarts ?? 'VALIDEE',
        valideeAt: r.valideeAt === undefined ? new Date('2027-01-05') : r.valideeAt,
        lignes: lignesEcarts.map((l) => ({ compteId: l.compteId, debit: l.debit, credit: l.credit, compte: { numero: l.numero } })),
      },
      // L'ancienne contre-passation inversait toute l'écriture ; celle d'A5 bis, le seul écart de conversion.
      ecritureExtourne: r.extourneInverseLaCaisse
        ? {
            exerciceId: r.contrePasseeDans ?? suivantDe(r.exerciceId),
            exercice: exerciceDe(r.contrePasseeDans ?? suivantDe(r.exerciceId)),
            numeroPiece: 12,
            date: new Date('2027-01-01'),
            lignes: lignesEcarts.map((l) => ({ compte: { numero: l.numero } })),
          }
        : r.contrePassee
          ? {
              exerciceId: r.contrePasseeDans ?? suivantDe(r.exerciceId),
              exercice: exerciceDe(r.contrePasseeDans ?? suivantDe(r.exerciceId)),
              numeroPiece: 12,
              date: new Date('2028-01-01'),
              lignes: lignesEcarts.filter((l) => !/^(52|53|55|57|58|676|776)/.test(l.numero)).map((l) => ({ compte: { numero: l.numero } })),
            }
          : null,
    };
  };
  const creer = jest.fn().mockResolvedValue({ id: 'ecr' });
  const create = jest.fn().mockResolvedValue({ id: 'r27' });
  const update = jest.fn(async (a: { data: Record<string, unknown> }) => {
    const r = reevals[0];
    if (r && a.data.ventilationDisponibilites) r.ventilation = a.data.ventilationDisponibilites as Reeval['ventilation'];
    return { id: 'r' };
  });
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    exercice: {
      // La doublure honore le filtre de statut (`not: CLOTURE` de l'ordre,
      // aucun pour le portillon, qui traverse les exercices clôturés, B-II).
      findMany: jest.fn(async (a: { where?: Record<string, unknown>; orderBy?: Record<string, string> } = {}) =>
        trier(filtrerExercices(a.where), a.orderBy),
      ),
      findFirst: jest.fn(async (a: { where?: Record<string, unknown>; orderBy?: Record<string, string> } = {}) =>
        trier(filtrerExercices(a.where), a.orderBy)[0] ?? null,
      ),
    },
    ligneEcriture: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { debit: 0, credit: 0 } }),
      findMany: jest.fn(async (a: { where?: Record<string, unknown> } = {}) => lignesFiltrees(a.where).map(habiller)),
      groupBy: jest.fn(async (a: { where: Record<string, unknown> }) => grouper(a)),
      fields: { credit: CHAMP_CREDIT },
    },
    reevaluation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(async (a: { where?: Record<string, unknown> } = {}) => {
        const id = a.where?.id;
        if (typeof id === 'string') return reevaluationDe(id.replace(/^r-/, ''));
        return reevaluationDe(String(a.where?.exerciceId ?? ''));
      }),
      findFirstOrThrow: jest.fn(async () => ({ id: 'r' })),
      create,
      update,
    },
    devise: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'usd', code: 'USD' },
        { id: 'eur', code: 'EUR' },
        { id: 'gbp', code: 'GBP' },
      ]),
    },
    provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
    ecriture: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(null) },
    coursDevise: {
      findFirst: jest.fn(async (a: { where: { deviseId: string; date: { lte: Date } } }) => {
        const c = typeof p.cours === 'function' ? p.cours(a.where.date.lte, a.where.deviseId) : (p.cours ?? 2400);
        return c === null ? null : { cours: c };
      }),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od' }) },
    compte: { findFirst: jest.fn(async (a: { where: { numero: { startsWith: string } } }) => ({ id: `c-${a.where.numero.startsWith}` })) },
  } as Faux;
  return {
    svc: new DevisesService(prisma as unknown as PrismaService, { creer, retirerCompensation: jest.fn() } as unknown as EcritureService),
    creer,
    create,
    update,
  };
}

const caisse = (r: { positions: { numero: string; valeurComptable: number; ecart: number }[] }) => r.positions.find((x) => x.numero === '57120000');

describe('A5 bis · la caisse en devise part de sa valeur de clôture précédente', () => {
  it('écart de N gardé et à-nouveau d’OmegaX · la position vaut 2 500 000, la perte de N+1 est de 100 000', async () => {
    const { svc } = monter({
      lignes: [caisseN, ouvertureN1()],
      reeval: { exerciceId: 'e26', ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }] },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(caisse(r)).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
    expect(r.perteRealisee).toBe(100_000);
    expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
  });

  it('réévaluation antérieure à A5 bis, écart non gardé · relu sur son écriture (compte en une seule devise)', async () => {
    const { svc } = monter({ lignes: [caisseN, ouvertureN1()], reeval: { exerciceId: 'e26' } });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(caisse(r)).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
  });

  it('ancienne contre-passation qui a inversé la caisse · la caisse est revenue au coût historique, rien n’est reporté', async () => {
    const { svc } = monter({
      lignes: [caisseN, ouvertureN1()],
      reeval: { exerciceId: 'e26', extourneInverseLaCaisse: true },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(caisse(r)).toMatchObject({ valeurComptable: 2_800_000, ecart: -400_000 });
  });

  it('M1 · une ancienne contre-passation passée plus loin que l’exercice qui suit · la caisse n’y est pas revenue au coût, l’écart est reporté', async () => {
    const { svc } = monter({
      lignes: [caisseN, ouvertureN1()],
      reeval: { exerciceId: 'e26', extourneInverseLaCaisse: true, contrePasseeDans: 'e28' },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(caisse(r)).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
  });

  it('ouverture saisie par le cabinet (pas un report d’OmegaX) · elle porte sa propre valeur, rien n’est ajouté', async () => {
    const { svc } = monter({
      lignes: [caisseN, { ...ouvertureN1('SAISIE'), debit: 2_500_000 }],
      reeval: { exerciceId: 'e26', ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }] },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(caisse(r)).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
  });

  it('à-nouveau provisoire passé avant la validation de l’écart · réserve nommée, passage refusé, rien écrit', async () => {
    const { svc, creer } = monter({
      lignes: [caisseN, ouvertureN1('PROVISOIRE', new Date('2027-01-02'))],
      reeval: { exerciceId: 'e26', ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }], valideeAt: new Date('2027-01-05') },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    // Écriture des écarts déjà validée (M3) · on ne demande pas de la valider,
    // et la clôture de l'exercice précédent est nommée comme seconde issue.
    expect(r.reportsDisponibilitesNonEtablis).toEqual([
      expect.stringMatching(/Relancez l'à-nouveau provisoire, ou clôturez l'exercice précédent/),
    ]);
    expect(r.reportsDisponibilitesNonEtablis[0]).not.toMatch(/Validez/);
    expect(r.avertissements).toEqual(expect.arrayContaining([expect.stringMatching(/Relancez l'à-nouveau provisoire/)]));
    await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(/Relancez l'à-nouveau provisoire/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('écriture des écarts encore au brouillard (M3) · « validez-la », puis relancer ou clôturer', async () => {
    const { svc } = monter({
      lignes: [caisseN, ouvertureN1('PROVISOIRE', new Date('2027-01-02'))],
      reeval: {
        exerciceId: 'e26',
        ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }],
        statutEcarts: 'BROUILLARD',
        valideeAt: null,
      },
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(r.reportsDisponibilitesNonEtablis).toEqual([
      expect.stringMatching(/Validez l'écriture des écarts, puis relancez l'à-nouveau provisoire ou clôturez l'exercice précédent/),
    ]);
  });

  it('la réévaluation garde l’écart de chaque disponibilité pour la suivante', async () => {
    const { svc, create } = monter({ lignes: [{ ...caisseN, exerciceId: 'e27', date: new Date('2027-03-01') }] });
    await svc.reevaluer('t', 'u', { exerciceId: 'e27' });
    expect(create.mock.calls[0][0].data.ecartsDisponibilites).toEqual([{ compteId: 'c-5712', deviseId: 'usd', ecart: -400_000 }]);
  });

  describe('caisse tenue en deux devises, réévaluation antérieure à A5 bis', () => {
    // 100 EUR entrés à 3 000 · cours gardé 3 100 · gain de 10 000 ; USD, perte de 300 000 · net passé · -290 000.
    const euroN: Ligne = { ...caisseN, deviseId: 'eur', debit: 300_000, montantDevise: 100 };
    const lignes = [caisseN, euroN, ouvertureN1(), { ...ouvertureN1(), deviseId: 'eur', debit: 300_000, montantDevise: 100 }];

    it('le cours gardé (D5) rend chaque devise, et leur somme rend la ligne passée · reporté devise par devise', async () => {
      const { svc } = monter({ lignes, reeval: { exerciceId: 'e26', coursUtilises: { usd: 2500, eur: 3100 }, passeSurLaCaisse: -290_000 } });
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      const usd = r.positions.find((x) => x.deviseCode === 'USD');
      expect(usd).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
      expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
    });

    it('sans cours gardé, ou si la somme ne rend pas la ligne · rien n’est deviné, le passage est refusé', async () => {
      for (const reeval of [
        { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -290_000 },
        { exerciceId: 'e26', coursUtilises: { usd: 2500, eur: 3100 }, passeSurLaCaisse: -280_000 },
      ]) {
        const { svc, creer } = monter({ lignes, reeval });
        const r = await svc.calculer('t', { exerciceId: 'e27' });
        expect(r.reportsDisponibilitesNonEtablis).toEqual([expect.stringMatching(/ne se relit pas/)]);
        await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(/ne se relit pas/);
        expect(creer).not.toHaveBeenCalled();
      }
    });

    // --- Relecture adverse d'A5 bis, B1 · le dossier n'est plus enfermé ------

    it('(a) une devise soldée en N, nulle en devise ET en francs, ne compte plus · la devise restante reçoit la ligne', async () => {
      const entreeEur: Ligne = { ...caisseN, deviseId: 'eur', debit: 300_000, montantDevise: 100 };
      const sortieEur: Ligne = { ...caisseN, deviseId: 'eur', debit: 0, credit: 300_000, montantDevise: 100, date: new Date('2026-07-01') };
      const { svc } = monter({
        lignes: [caisseN, entreeEur, sortieEur, ouvertureN1()],
        reeval: { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -300_000 },
      });
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
      expect(caisse(r)).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
    });

    it('(b) sans cours gardé, le cours de la table à la date de la réévaluation rend la ligne au centime · reporté', async () => {
      const cours = (date: Date, deviseId: string) =>
        date.getTime() <= N.dateFin.getTime() ? (deviseId === 'eur' ? 3100 : 2500) : deviseId === 'eur' ? 3000 : 2400;
      const { svc } = monter({ lignes, reeval: { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -290_000 }, cours });
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
      const usd = r.positions.find((x) => x.deviseCode === 'USD');
      expect(usd).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
    });

    it('la relecture voit la caisse TELLE QU’ELLE ÉTAIT · une ligne saisie après la réévaluation, même antidatée, ne la fausse pas', async () => {
      const tardive: Ligne = { ...caisseN, deviseId: 'eur', debit: 30_000, montantDevise: 10, date: new Date('2026-11-01'), creeeLe: new Date('2027-02-01') };
      const { svc } = monter({
        lignes: [...lignes, tardive],
        reeval: { exerciceId: 'e26', coursUtilises: { usd: 2500, eur: 3100 }, passeSurLaCaisse: -290_000 },
      });
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
    });

    it('(c) rien ne se relit · la ventilation se DÉCLARE avec sa source, vérifiée au centime, puis sert au report', async () => {
      const reeval: Reeval = { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -290_000 };
      const { svc, update } = monter({ lignes, reeval });
      const ventilation = [
        { compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 },
        { compteId: 'c-5712', deviseId: 'eur', ecart: 10_000 },
      ];
      // Une somme qui ne rend pas la ligne passée, ou sans source · refus nommé, rien écrit.
      await expect(
        svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', {
          ventilation: [{ ...ventilation[0], ecart: -310_000 }, ventilation[1]],
          source: 'Relevé USD et EUR',
        }),
      ).rejects.toThrow(/ne rend pas la ligne passée/);
      await expect(svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', { ventilation, source: ' ' })).rejects.toThrow(/source/);
      expect(update).not.toHaveBeenCalled();
      await svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', { ventilation, source: 'Relevés USD et EUR au 31/12/2026' });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-e26', tenantId: 't' },
          data: expect.objectContaining({ ventilationDisponibilites: ventilation, ventilationDisponibilitesSource: 'Relevés USD et EUR au 31/12/2026' }),
        }),
      );
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      expect(r.reportsDisponibilitesNonEtablis).toEqual([]);
      expect(r.positions.find((x) => x.deviseCode === 'USD')).toMatchObject({ valeurComptable: 2_500_000, ecart: -100_000 });
    });

    it('m1 · seules les devises que la réévaluation a lues sur le compte, toutes déclarées, chacune dans ses bornes', async () => {
      const reeval: Reeval = { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -290_000 };
      const source = 'Relevés au 31/12/2026';
      for (const [ventilation, motif] of [
        // Une livre que la caisse ne tenait pas · la banque de N+1 en serait faussée.
        [
          [
            { compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 },
            { compteId: 'c-5712', deviseId: 'eur', ecart: 0 },
            { compteId: 'c-5712', deviseId: 'gbp', ecart: 10_000 },
          ],
          /n'a pas été lue par la réévaluation sur ce compte/,
        ],
        // L'euro, lu, omis · chaque devise lue se déclare, zéro compris.
        [[{ compteId: 'c-5712', deviseId: 'usd', ecart: -290_000 }], /Chaque devise lue/],
        // 1 000 USD portés à une valeur négative · aucun cours positif ne le rend.
        [
          [
            { compteId: 'c-5712', deviseId: 'usd', ecart: -3_000_000 },
            { compteId: 'c-5712', deviseId: 'eur', ecart: 2_710_000 },
          ],
          /signe contraire à son montant en devise/,
        ],
      ] as const) {
        const { svc, update } = monter({ lignes, reeval });
        await expect(svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', { ventilation: [...ventilation], source })).rejects.toThrow(motif);
        expect(update).not.toHaveBeenCalled();
      }
    });

    it('m1 · une devise soldée en devise mais non en francs valait zéro · son écart est l’opposé de ses francs', async () => {
      // EUR entrés pour 300 000 et ressortis pour 290 000 · 0 en devise, 10 000 en francs, perte de 10 000.
      const sortieEur: Ligne = { ...caisseN, deviseId: 'eur', debit: 0, credit: 290_000, montantDevise: 100, date: new Date('2026-07-01') };
      const reeval: Reeval = { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -310_000 };
      const avecSortie = [...lignes, sortieEur];
      const source = 'Relevés au 31/12/2026';
      const faux = monter({ lignes: avecSortie, reeval });
      await expect(
        faux.svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', {
          ventilation: [
            { compteId: 'c-5712', deviseId: 'usd', ecart: -305_000 },
            { compteId: 'c-5712', deviseId: 'eur', ecart: -5_000 },
          ],
          source,
        }),
      ).rejects.toThrow(/l'opposé de ses francs \(-10000\.00\)/);
      const juste = monter({ lignes: avecSortie, reeval });
      await juste.svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', {
        ventilation: [
          { compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 },
          { compteId: 'c-5712', deviseId: 'eur', ecart: -10_000 },
        ],
        source,
      });
      expect(juste.update).toHaveBeenCalled();
    });

    it('(c) une ligne qui se relit n’admet pas de déclaration · rien à déclarer', async () => {
      const { svc, update } = monter({ lignes, reeval: { exerciceId: 'e26', coursUtilises: { usd: 2500, eur: 3100 }, passeSurLaCaisse: -290_000 } });
      await expect(
        svc.declarerVentilationDisponibilites('t', 'u', 'r-e26', {
          ventilation: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -290_000 }],
          source: 'Relevé',
        }),
      ).rejects.toThrow(/rien à déclarer/);
      expect(update).not.toHaveBeenCalled();
    });

    it('(d) exercice clôturé · la réserve nomme la déclaration, jamais l’annulation ; ouvert · les deux', async () => {
      const reeval: Reeval = { exerciceId: 'e26', coursUtilises: null, passeSurLaCaisse: -290_000 };
      const clos = await monter({ lignes, reeval }).svc.calculer('t', { exerciceId: 'e27' });
      expect(clos.reportsDisponibilitesNonEtablis[0]).toMatch(/Ventiler l'écart des disponibilités/);
      expect(clos.reportsDisponibilitesNonEtablis[0]).not.toMatch(/annulez/i);
      const ouvert = await monter({ lignes, reeval, exercices: [{ ...N, statut: 'OUVERT' }, N1] }).svc.calculer('t', { exerciceId: 'e27' });
      expect(ouvert.reportsDisponibilitesNonEtablis[0]).toMatch(/Ventiler l'écart des disponibilités.*ou annulez cette réévaluation/);
    });
  });
});

/**
 * LE JEU DE LA RELECTURE ADVERSE D'A5 · 52150000, 1 000 USD entrés pour
 * 2 000 000 ; clôture de N au cours de 2 100 (D 52 / C 776 de 100 000) ;
 * clôture de N+1 au cours de 2 150. Le gain de N+1 est de 50 000, et la
 * banque finit N+1 à 2 150 000. Sans le report, la réévaluation de N+1
 * mesurait 150 000 et la banque finissait à 2 250 000.
 */
describe('A5 bis · la banque en devise sur deux exercices, report en SOLDE et en DÉTAIL', () => {
  const banqueN: Ligne = {
    compteId: 'c-5215',
    numero: '52150000',
    deviseId: 'usd',
    debit: 2_000_000,
    credit: 0,
    montantDevise: 1000,
    exerciceId: 'e26',
    date: new Date('2026-06-01'),
  };
  const ecartsN = [
    { compteId: 'c-5215', numero: '52150000', debit: 100_000, credit: 0 },
    { compteId: 'c-776', numero: '77600000', debit: 0, credit: 100_000 },
  ];
  const ouverture = { exerciceId: 'e27', date: N1.dateDebut, ouverture: 'DEFINITIF' as const };
  // SOLDE · une ligne de la devise au total de ses lignes en devise, et le reste en francs (l'écart) sans devise.
  const reportSolde: Ligne[] = [
    { ...banqueN, ...ouverture },
    { ...banqueN, ...ouverture, deviseId: null, montantDevise: null, debit: 100_000 },
  ];
  // DÉTAIL · chaque ligne non lettrée reportée telle quelle, la ligne d'écart sans devise comprise.
  const reportDetail: Ligne[] = [
    { ...banqueN, ...ouverture, debit: 1_200_000, montantDevise: 600 },
    { ...banqueN, ...ouverture, debit: 800_000, montantDevise: 400 },
    { ...banqueN, ...ouverture, deviseId: null, montantDevise: null, debit: 100_000 },
  ];
  const cours = 2150;

  it.each([
    ['SOLDE', reportSolde],
    ['DÉTAIL', reportDetail],
  ])('nouveau régime (aucune contre-passation de la banque), report en %s · gain de N+1 de 50 000', async (_mode, report) => {
    const { svc } = monter({
      lignes: [banqueN, ...report],
      reeval: { exerciceId: 'e26', lignesEcarts: ecartsN, ecartsDisponibilites: [{ compteId: 'c-5215', deviseId: 'usd', ecart: 100_000 }] },
      cours,
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(r.positions).toEqual([expect.objectContaining({ numero: '52150000', valeurComptable: 2_100_000, valeurReevaluee: 2_150_000, ecart: 50_000 })]);
    expect(r.gainRealise).toBe(50_000);
  });

  it.each([
    ['SOLDE', reportSolde],
    ['DÉTAIL', reportDetail],
  ])('ancien régime (la contre-passation a déjà inversé la banque de 100 000), report en %s · total juste', async (_mode, report) => {
    const { svc } = monter({
      lignes: [banqueN, ...report],
      reeval: { exerciceId: 'e26', lignesEcarts: ecartsN, extourneInverseLaCaisse: true },
      cours,
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    // La banque est revenue au coût historique (report 2 100 000, contre-passation −100 000) ·
    // la réévaluation mesure 150 000, et le résultat de N+1 porte 150 000 − 100 000 = 50 000.
    expect(r.positions).toEqual([expect.objectContaining({ valeurComptable: 2_000_000, ecart: 150_000 })]);
    const contrePassation = -100_000;
    expect(r.gainRealise + contrePassation).toBe(50_000);
  });

  it('trois exercices · les écarts de N-1 et de N s’ajoutent au fil des reports d’OmegaX', async () => {
    const N0: Exo = { id: 'e25', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31'), statut: 'CLOTURE' };
    const banqueN0: Ligne = { ...banqueN, exerciceId: 'e25', date: new Date('2025-06-01') };
    // N-1 au cours de 2 050 · +50 000 ; N au cours de 2 100 · +50 000 sur 2 050 000 ; N+1 au cours de 2 150 · +50 000.
    const { svc } = monter({
      exercices: [N0, N, N1],
      lignes: [
        banqueN0,
        { ...banqueN0, exerciceId: 'e26', date: N.dateDebut, ouverture: 'DEFINITIF' },
        { ...banqueN0, exerciceId: 'e27', date: N1.dateDebut, ouverture: 'DEFINITIF' },
      ],
      reevals: [
        { exerciceId: 'e25', dateReevaluation: N0.dateFin, ecartsDisponibilites: [{ compteId: 'c-5215', deviseId: 'usd', ecart: 50_000 }] },
        { exerciceId: 'e26', ecartsDisponibilites: [{ compteId: 'c-5215', deviseId: 'usd', ecart: 50_000 }] },
      ],
      cours,
    });
    const r = await svc.calculer('t', { exerciceId: 'e27' });
    expect(r.positions).toEqual([expect.objectContaining({ valeurComptable: 2_100_000, ecart: 50_000 })]);
  });

  /**
   * B-I (second tour) · L'ANCIENNE CONTRE-PASSATION DE N POSÉE À L'OUVERTURE
   * DE N+2 (main le permettait). 1 000 USD au coût historique de 1 364 000 ;
   * N · +100 000 (contre-passation d'avant A5 bis, banque comprise, passée en
   * N+2) ; cours de N+2 · 1 600. La banque finit N+2 à 1 600 000 · lue
   * seulement dans l'exercice qui suit N, l'inversion était manquée, l'écart
   * de N reporté une seconde fois, et la banque finissait à 1 500 000.
   */
  describe('B-I · contre-passation de N posée à l’ouverture de N+2', () => {
    const N2: Exo = { id: 'e28', dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31'), statut: 'OUVERT' };
    const banque: Ligne = { ...banqueN, debit: 1_364_000 };
    const ouvertures: Ligne[] = [
      { ...banque, exerciceId: 'e27', date: N1.dateDebut, ouverture: 'DEFINITIF' },
      { ...banque, exerciceId: 'e28', date: N2.dateDebut, ouverture: 'DEFINITIF' },
    ];
    const reevalN: Reeval = { exerciceId: 'e26', lignesEcarts: ecartsN, extourneInverseLaCaisse: true, contrePasseeDans: 'e28' };
    const cours1600 = (date: Date) => (date.getTime() >= N2.dateDebut.getTime() ? 1600 : 1605);

    it('N+1 réévalué après A5 bis (+141 000) · la banque vaut 1 505 000 avant la réévaluation de N+2, et finit à 1 600 000', async () => {
      const { svc } = monter({
        exercices: [N, { ...N1, statut: 'CLOTURE' }, N2],
        lignes: [banque, ...ouvertures],
        reevals: [
          reevalN,
          {
            exerciceId: 'e27',
            dateReevaluation: N1.dateFin,
            lignesEcarts: [
              { compteId: 'c-5215', numero: '52150000', debit: 141_000, credit: 0 },
              { compteId: 'c-776', numero: '77600000', debit: 0, credit: 141_000 },
            ],
            ecartsDisponibilites: [{ compteId: 'c-5215', deviseId: 'usd', ecart: 141_000 }],
          },
        ],
        cours: cours1600,
      });
      const r = await svc.calculer('t', { exerciceId: 'e28' });
      expect(r.positions).toEqual([expect.objectContaining({ valeurComptable: 1_505_000, valeurReevaluee: 1_600_000, ecart: 95_000 })]);
    });

    it('N+1 clôturé sans réévaluation · la banque vaut 1 364 000 avant la réévaluation de N+2, et finit à 1 600 000', async () => {
      const { svc } = monter({
        exercices: [N, { ...N1, statut: 'CLOTURE' }, N2],
        lignes: [banque, ...ouvertures],
        reevals: [reevalN],
        cours: cours1600,
      });
      const r = await svc.calculer('t', { exerciceId: 'e28' });
      expect(r.positions).toEqual([expect.objectContaining({ valeurComptable: 1_364_000, valeurReevaluee: 1_600_000, ecart: 236_000 })]);
    });

    it('lue pour N+1, la même contre-passation n’a pas encore eu lieu · l’écart de N se reporte', async () => {
      const { svc } = monter({ exercices: [N, N1, N2], lignes: [banque, ...ouvertures], reevals: [reevalN], cours: cours1600 });
      const r = await svc.calculer('t', { exerciceId: 'e27' });
      expect(r.positions).toEqual([expect.objectContaining({ valeurComptable: 1_464_000 })]);
    });
  });
});

/**
 * L'ÉCART DE CONVERSION D'UNE CRÉANCE NE SE SOLDE QUE PAR LA CONTRE-PASSATION
 * (Application 84 du Guide, « 411 · 4781 » au 01/01/N+1). 41110000, 1 000 USD pour 2 000 000 ; N au cours
 * de 2 100 (D 411 / C 479 de 100 000) ; N+1 au cours de 2 150. Réévaluer N+1
 * avant de contre-passer N repassait 150 000 au tiers, le 479 de N en place.
 */
describe('A5 bis · la créance en devise · réévaluer N+1 exige la contre-passation de N', () => {
  const creanceN: Ligne = {
    compteId: 'c-4111',
    numero: '41110000',
    deviseId: 'usd',
    debit: 2_000_000,
    credit: 0,
    montantDevise: 1000,
    exerciceId: 'e26',
    date: new Date('2026-06-01'),
  };
  const ecartsN = [
    { compteId: 'c-4111', numero: '41110000', debit: 100_000, credit: 0 },
    { compteId: 'c-4791', numero: '47910000', debit: 0, credit: 100_000 },
  ];
  const report: Ligne = { ...creanceN, exerciceId: 'e27', date: N1.dateDebut, ouverture: 'DEFINITIF' };

  it('non contre-passée · refus nommé, avec son issue, rien écrit', async () => {
    const { svc, creer } = monter({ lignes: [creanceN, report], reeval: { exerciceId: 'e26', lignesEcarts: ecartsN }, cours: 2150 });
    await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(
      /Passez la contre-passation de la réévaluation du 2026-12-31/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('contre-passée · la réévaluation de N+1 passe, sur l’écart depuis le coût historique (150 000, le 479 de N étant soldé)', async () => {
    const { svc, creer } = monter({
      lignes: [creanceN, report],
      reeval: { exerciceId: 'e26', lignesEcarts: ecartsN, contrePassee: true },
      cours: 2150,
    });
    const { rapport } = await svc.reevaluer('t', 'u', { exerciceId: 'e27' });
    expect(rapport.positions).toEqual([expect.objectContaining({ numero: '41110000', valeurComptable: 2_000_000, ecart: 150_000 })]);
    expect(creer).toHaveBeenCalled();
  });

  it('B3 · le refus nomme le report au premier jour non clôturé quand la première période est close (art. 22, 4°)', async () => {
    const { svc } = monter({ lignes: [creanceN, report], reeval: { exerciceId: 'e26', lignesEcarts: ecartsN }, cours: 2150 });
    await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(/premier jour non clôturé.*AUDCIF art\. 22, 4°/);
  });

  it('M1 · contre-passée dans un exercice plus lointain · refus nommé, l’issue (annuler la contre-passation) dite, rien écrit', async () => {
    const { svc, creer } = monter({
      lignes: [creanceN, report],
      reeval: { exerciceId: 'e26', lignesEcarts: ecartsN, contrePassee: true, contrePasseeDans: 'e28' },
      cours: 2150,
    });
    await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(
      /n'est pas à l'ouverture du premier exercice ouvert[\s\S]*Annuler la contre-passation[\s\S]*passez-la à l'ouverture de cet exercice/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  /**
   * B-II (second tour) · LA CONTRE-PASSATION DE N OUBLIÉE, N+1 CLÔTURÉ SANS
   * RÉÉVALUATION. 41110000, 1 000 USD pour 2 000 000 ; N au cours de 2 500
   * (D 411 / C 479 de 500 000) ; N+2 au cours de 2 600. Le portillon ne
   * lisait que N+1, sans réévaluation · N+2 passait, depuis le coût, 600 000
   * de plus au tiers · 411 à 3 100 000 au lieu de 2 600 000, 479 à
   * −1 100 000. Il lit la DERNIÈRE réévaluation antérieure, à travers N+1.
   */
  describe('B-II · N+1 clôturé sans réévaluation', () => {
    const N2: Exo = { id: 'e28', dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31'), statut: 'OUVERT' };
    const exercices = [N, { ...N1, statut: 'CLOTURE' }, N2];
    const ecarts500: Reeval['lignesEcarts'] = [
      { compteId: 'c-4111', numero: '41110000', debit: 500_000, credit: 0 },
      { compteId: 'c-4791', numero: '47910000', debit: 0, credit: 500_000 },
    ];
    const lignes: Ligne[] = [creanceN, report, { ...creanceN, exerciceId: 'e28', date: N2.dateDebut, ouverture: 'DEFINITIF' }];

    it('non contre-passée · N+2 refusé, la cible (cet exercice) nommée, rien écrit', async () => {
      const { svc, creer } = monter({ exercices, lignes, reeval: { exerciceId: 'e26', lignesEcarts: ecarts500 }, cours: 2600 });
      await expect(svc.reevaluer('t', 'u', { exerciceId: 'e28' })).rejects.toThrow(
        /réévaluation du 2026-12-31 n'est pas contre-passée[\s\S]*Passez la contre-passation de la réévaluation du 2026-12-31 \(Devises\) à l'ouverture de cet exercice/,
      );
      expect(creer).not.toHaveBeenCalled();
    });

    it('contre-passée à l’ouverture de N+2 · N+2 passe depuis le coût · 411 à 2 600 000 et 479 à −600 000', async () => {
      const { svc } = monter({
        exercices,
        lignes,
        reeval: { exerciceId: 'e26', lignesEcarts: ecarts500, contrePassee: true, contrePasseeDans: 'e28' },
        cours: 2600,
      });
      const { rapport } = await svc.reevaluer('t', 'u', { exerciceId: 'e28' });
      const p = rapport.positions.find((x) => x.numero === '41110000')!;
      expect(p).toMatchObject({ valeurComptable: 2_000_000, ecart: 600_000 });
      // Le tiers · à-nouveau au coût (2 000 000) et écart de N reporté sans devise (500 000), contre-passation (−500 000), écart de N+2.
      expect(2_000_000 + 500_000 - 500_000 + p.ecart).toBe(2_600_000);
      // Le 479 · écart de N (−500 000), contre-passation (+500 000), écart de N+2.
      expect(-500_000 + 500_000 - p.ecart).toBe(-600_000);
    });

    it('N+1 OUVERT, contre-passation posée en N+2 · N+2 attend N+1, et N+1 nomme la contre-passation à annuler et à repasser chez lui', async () => {
      const { svc } = monter({
        exercices: [N, N1, N2],
        lignes,
        reeval: { exerciceId: 'e26', lignesEcarts: ecarts500, contrePassee: true, contrePasseeDans: 'e28' },
        cours: 2600,
      });
      await expect(svc.reevaluer('t', 'u', { exerciceId: 'e28' })).rejects.toThrow(/antérieur et encore ouvert, n'est pas réévalué/);
      await expect(svc.reevaluer('t', 'u', { exerciceId: 'e27' })).rejects.toThrow(
        /Annuler la contre-passation[\s\S]*passez-la à l'ouverture de cet exercice/,
      );
    });
  });

  it('une réévaluation qui ne portait que des disponibilités n’a rien à contre-passer · ne bloque pas', async () => {
    const { svc, creer } = monter({ lignes: [creanceN, report], reeval: { exerciceId: 'e26' }, cours: 2150 });
    await svc.reevaluer('t', 'u', { exerciceId: 'e27' });
    expect(creer).toHaveBeenCalled();
  });
});
