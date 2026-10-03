import { Prisma } from '@prisma/client';
import { DevisesService } from './devises.service';
import {
  PLAFOND_SOUS_ENSEMBLES,
  disponibilitesInversees,
  jugerLEtat,
  libelleMontantsAContrePasser,
  libelleMontantsDeLEcart,
  montantsAContrePasser,
  motifRefusInversion,
  verdictDeLEtat,
  type EcritureSurLEcart,
  type LigneAContrePasser,
} from './contre-passation-manuelle';
import { estDisponibilite } from './ecarts-disponibilites';
import { PLAFOND_REEVALUATIONS_EXAMINEES, ecrituresDesContrePassationsAnnulees } from './contre-passations-de-disponibilites';

/**
 * A5 BIS · UNE CONTRE-PASSATION FAITE À LA MAIN SE DÉCLARE (troisième tour),
 * ET LA CONTRE-PASSATION PAR LE MODULE N'EST PLUS AVEUGLE (quatrième tour).
 *
 * Le portillon juge toutes les réévaluations antérieures · une
 * contre-passation passée hors du module, par une OD du cabinet, les aurait
 * toutes bloquées, et la seule issue (contre-passer par le module)
 * l'inversait une seconde fois. Le cabinet DÉSIGNE l'écriture, avec un motif ;
 * le serveur vérifie qu'elle inverse exactement, au centime, du côté opposé et
 * en montants positifs, chaque compte de l'écart de conversion (Guide, Partie
 * 2 ch. 22, Application 84, « Contrepassation de l'écart au 01/01/N+1 : 411 ·
 * 4781 » ; Application 85, « 4793 · 4812 »), à la place où le module l'aurait
 * posée, sans lien avec une autre réévaluation, dans le même dossier. Et
 * `extourner` refuse quand le cabinet a déjà touché l'écart à la main.
 *
 * CINQUIÈME TOUR · une seule règle, fondée sur l'ÉTAT RÉEL des comptes de
 * l'écart (le 478 ou le 479 à leur solde, le tiers par son écart d'ouverture et
 * les écritures hors module qui touchent l'écart), jugée contre les écarts en
 * place (`jugerLEtat`) · la doublure honore les requêtes qui la lisent.
 *
 * Jeu d'essai · réévaluation de N au 31/12/2026 · créance de 1 000 USD au
 * coût de 2 000 000, réévaluée à 2 500 (D 411 / C 4791 de 500 000), et banque
 * (D 5211 / C 776 de 100 000, écart réalisé, AUDCIF art. 57, jamais
 * contre-passé). Cours de N+1 · 2 400, d'où un écart de N+1 de 400 000
 * depuis le coût · le 411 juste finit N+1 à 2 400 000.
 */

const l = (compteId: string, numero: string, debit: number, credit: number) => ({ compteId, debit, credit, compte: { numero } });
const ECARTS_N = [
  l('c-4111', '41110000', 500_000, 0),
  l('c-4791', '47910000', 0, 500_000),
  l('c-5211', '52110000', 100_000, 0),
  l('c-776', '77600000', 0, 100_000),
];
const enLignes = (lignes: ReturnType<typeof l>[]): LigneAContrePasser[] =>
  lignes.map((x) => ({ compteId: x.compteId, compteNumero: x.compte.numero, debit: x.debit, credit: x.credit }));

describe('contre-passation-manuelle · la mesure, compte par compte', () => {
  const attendus = montantsAContrePasser(enLignes(ECARTS_N.slice(0, 2)));

  it('les montants à contre-passer · dans le sens de la contre-passation ; ceux de l’écart, dans le sien', () => {
    expect(libelleMontantsAContrePasser(attendus)).toBe('41110000 au crédit de 500000.00, 47910000 au débit de 500000.00');
    expect(libelleMontantsDeLEcart(attendus)).toBe('41110000 au débit de 500000.00, 47910000 au crédit de 500000.00');
  });

  it('deux lignes du même compte (deux devises sur un 411) s’additionnent ; un net nul n’a rien à contre-passer', () => {
    const m = montantsAContrePasser(
      enLignes([l('c-4111', '41110000', 300_000, 0), l('c-4111', '41110000', 200_000, 0), l('c-4791', '47910000', 0, 500_000), l('c-x', '47810000', 10, 10)]),
    );
    expect(m).toEqual([
      { compteId: 'c-4111', compteNumero: '41110000', netCentimes: 50_000_000 },
      { compteId: 'c-4791', compteNumero: '47910000', netCentimes: -50_000_000 },
    ]);
  });

  it('inversion exacte, d’autres comptes admis (une OD d’ouverture groupe plusieurs gestes) · acceptée', () => {
    const od = enLignes([l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 500_000), l('c-601', '60110000', 10_000, 0), l('c-401', '40110000', 0, 10_000)]);
    expect(motifRefusInversion(attendus, od)).toBeNull();
  });

  it('partielle ou débordante · refusée, compte par compte ; l’issue dit de CORRIGER, jamais « passez par le module »', () => {
    const partielle = enLignes([l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)]);
    expect(motifRefusInversion(attendus, partielle)).toMatch(
      /41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 300000\.00 ; 47910000 · attendu débit de 500000\.00, l'écriture porte débit de 300000\.00/,
    );
    const debordante = enLignes([l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 600_000), l('c-x', '70110000', 100_000, 0)]);
    expect(motifRefusInversion(attendus, debordante)).toMatch(/41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 600000\.00/);
    expect(motifRefusInversion(attendus, [])).toMatch(/41110000 · attendu crédit de 500000\.00, l'écriture porte rien/);
    const refus = motifRefusInversion(attendus, partielle)!;
    expect(refus).toMatch(/plusieurs réévaluations à la fois[\s\S]*corrigez-la par inscription en négatif \(AUDCIF art\. 20, al\. 2\)/);
    expect(refus).not.toMatch(/par le module/);
  });

  it('BLOQUANT 1 · une inscription en négatif du même sens a le net d’une inversion · refusée, montants négatifs nommés', () => {
    // D 4111 −500 000 / C 4791 −500 000 · au net, −500 000 sur le 411, l'inverse de l'écart.
    const negatif = enLignes([l('c-4111', '41110000', -500_000, 0), l('c-4791', '47910000', 0, -500_000)]);
    expect(motifRefusInversion(attendus, negatif)).toMatch(/41110000 · montants négatifs \(inscription en négatif\)/);
  });

  it('l’inversion se porte du côté OPPOSÉ · un débit et un crédit sur le même compte, au net juste, sont refusés', () => {
    const melee = enLignes([l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 100_000, 600_000)]);
    expect(motifRefusInversion(attendus, melee)).toMatch(/41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 600000\.00, et un débit de 100000\.00/);
  });

  it('les disponibilités inversées · celles dont l’écriture inverse exactement l’écart passé, et elles seules', () => {
    const ecarts = enLignes(ECARTS_N);
    const toutInverse = enLignes(ECARTS_N.map((x) => ({ ...x, debit: x.credit, credit: x.debit })));
    expect([...disponibilitesInversees(ecarts, toutInverse, estDisponibilite)]).toEqual(['c-5211']);
    const remiseDeCheque = enLignes([l('c-5211', '52110000', 0, 50_000)]);
    expect([...disponibilitesInversees(ecarts, remiseDeCheque, estDisponibilite)]).toEqual([]);
  });
});

interface Exo {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  statut: 'OUVERT' | 'CLOTURE';
}
const N: Exo = { id: 'e26', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'CLOTURE' };
const N1: Exo = { id: 'e27', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' };
const N2: Exo = { id: 'e28', dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31'), statut: 'OUVERT' };

interface EcritureFaite {
  id: string;
  tenantId?: string;
  exercice: Exo;
  /** Par défaut, l'ouverture de son exercice. */
  date?: Date;
  numeroPiece?: number;
  lignes: ReturnType<typeof l>[];
  estGenereeParCloture?: boolean;
  /** Une inscription en négatif · l'écriture qu'elle corrige. */
  corrige?: { id: string; numeroPiece: number };
  /** L'écriture a été corrigée · son négatif. */
  correction?: { numeroPiece: number } | null;
  reevaluationEcarts?: { id: string } | null;
  reevaluationExtourne?: { id: string } | null;
  reevaluationContrePassationDeclaree?: { id: string } | null;
}
const dateDe = (e: EcritureFaite) => e.date ?? e.exercice.dateDebut;

/** N · la vente de 1 000 USD (2 000 000) et l'écriture des écarts du module (réévaluation r1 du 31/12/2026). */
const VENTE_N: EcritureFaite = { id: 'vente', exercice: N, date: new Date('2026-04-01'), lignes: [l('c-4111', '41110000', 2_000_000, 0), l('c-701', '70110000', 0, 2_000_000)] };
const ECARTS_N_ECR: EcritureFaite = { id: 'ecarts-n', exercice: N, date: N.dateFin, numeroPiece: 2, reevaluationEcarts: { id: 'r1' }, lignes: ECARTS_N };
const BASE_N = [VENTE_N, ECARTS_N_ECR];

/** L'à-nouveau de N+1 · la clôture de N, écart de conversion compris (D 4111 2 500 000, C 4791 500 000). */
const AN_N1: EcritureFaite = {
  id: 'an27',
  exercice: N1,
  numeroPiece: 1,
  estGenereeParCloture: true,
  lignes: [l('c-4111', '41110000', 2_500_000, 0), l('c-4791', '47910000', 0, 500_000)],
};

/** L'OD d'ouverture du cabinet dans N+1 · la contre-passation du 411 et du 4791, et un autre geste. */
const OD: EcritureFaite = {
  id: 'od',
  exercice: N1,
  numeroPiece: 7,
  lignes: [l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 500_000), l('c-601', '60110000', 10_000, 0), l('c-401', '40110000', 0, 10_000)],
};

function correspond(valeur: unknown, filtre: unknown): boolean {
  if (filtre === undefined) return true;
  if (filtre && typeof filtre === 'object' && !(filtre instanceof Date)) {
    const f = filtre as Record<string, unknown>;
    if ('in' in f) return (f.in as unknown[]).includes(valeur);
    if ('not' in f) return valeur !== f.not;
    const t = (valeur as Date).getTime();
    if (f.gt && !(t > (f.gt as Date).getTime())) return false;
    if (f.gte && !(t >= (f.gte as Date).getTime())) return false;
    if (f.lt && !(t < (f.lt as Date).getTime())) return false;
    if (f.lte && !(t <= (f.lte as Date).getTime())) return false;
    return true;
  }
  return valeur === filtre;
}

/**
 * La doublure honore le filtre d'écriture que le service pose · dossier,
 * exercice, date, à-nouveau, liens, paires neutralisées, compte touché, et
 * la disjonction de la fenêtre (son exercice depuis la réévaluation, ou la
 * fenêtre) · ce qui dépend de ce qu'une requête RAMÈNE se teste sur la requête.
 */
function ecritureRetenue(e: EcritureFaite, w: Record<string, unknown> = {}): boolean {
  if (w.tenantId !== undefined && (e.tenantId ?? 't') !== w.tenantId) return false;
  if (!correspond(e.id, w.id)) return false;
  if (!correspond(e.exercice.id, w.exerciceId)) return false;
  if (!correspond(dateDe(e), w.date)) return false;
  if (w.estGenereeParCloture !== undefined && (e.estGenereeParCloture ?? false) !== w.estGenereeParCloture) return false;
  // Aucune écriture de la doublure n'est un à-nouveau provisoire ni un solde des comptes de gestion.
  if (w.estANouveauProvisoire === true || w.estSoldeDesComptesDeGestion === true) return false;
  if (w.corrigeEcritureId === null && e.corrige) return false;
  if (w.correction !== undefined && e.correction) return false;
  if (w.reevaluationEcarts !== undefined && e.reevaluationEcarts) return false;
  if (w.reevaluationExtourne !== undefined && e.reevaluationExtourne) return false;
  if (w.reevaluationContrePassationDeclaree !== undefined && e.reevaluationContrePassationDeclaree) return false;
  const some = (w.lignes as { some?: { compteId: { in: string[] } } } | undefined)?.some;
  if (some && !e.lignes.some((x) => some.compteId.in.includes(x.compteId))) return false;
  if (Array.isArray(w.OR) && !(w.OR as Record<string, unknown>[]).some((o) => ecritureRetenue(e, o))) return false;
  if (w.NOT !== undefined && ecritureRetenue(e, w.NOT as Record<string, unknown>)) return false;
  return true;
}

interface ReevaluationFaite {
  id: string;
  exercice: Exo;
  ecritureEcarts: { lignes: ReturnType<typeof l>[] };
  ecritureExtourne?: { exercice: { dateDebut: Date } } | null;
  contrePassationDeclaree?: { exercice: { dateDebut: Date } } | null;
}

function monter(
  p: {
    exercices?: Exo[];
    ecritures?: EcritureFaite[];
    reeval?: Record<string, unknown>;
    /** Les AUTRES réévaluations du dossier (r1 est la réévaluation jugée). */
    autres?: ReevaluationFaite[];
    appui?: { dateReevaluation: Date } | null;
    updateEchoue?: unknown;
    referentiel?: 'SYSCOHADA' | 'SYCEBNL';
  } = {},
) {
  const exercices = p.exercices ?? [N, N1, N2];
  const ecritures = p.ecritures ?? [...BASE_N, AN_N1, OD];
  const reeval = {
    id: 'r1',
    exerciceId: N.id,
    dateReevaluation: N.dateFin,
    annuleeLe: null,
    ecritureExtourneId: null,
    ecritureExtourne: null,
    contrePassationDeclareeId: null,
    contrePassationDeclaree: null,
    motifContrePassationDeclaree: null,
    contrePassationDeclareeLe: null,
    contrePassationDeclareePar: null,
    retraitsContrePassationDeclaree: null,
    annulationsContrePassation: null,
    exercice: { id: N.id, dateDebut: N.dateDebut, dateFin: N.dateFin },
    ecritureEcarts: { lignes: ECARTS_N },
    ...p.reeval,
  };
  const reevaluations: ReevaluationFaite[] = [
    { id: 'r1', exercice: N, ecritureEcarts: reeval.ecritureEcarts as { lignes: ReturnType<typeof l>[] }, ecritureExtourne: null, contrePassationDeclaree: null },
    ...(p.autres ?? []),
  ];
  const filtrer = (where: Record<string, unknown> = {}) =>
    exercices.filter((e) => correspond(e.id, where.id) && correspond(e.dateDebut, where.dateDebut) && correspond(e.statut, where.statut));
  const trier = (liste: Exo[], orderBy?: { dateDebut?: 'asc' | 'desc' }) =>
    [...liste].sort((a, b) => (orderBy?.dateDebut === 'desc' ? -1 : 1) * (a.dateDebut.getTime() - b.dateDebut.getTime()));
  const update = jest.fn(async (_a: { where: unknown; data: Record<string, unknown> }) => {
    if (p.updateEchoue) throw p.updateEchoue;
    return { id: 'r1' };
  });
  const appuiFindFirst = jest.fn(async (_a: { where: Record<string, unknown> }) => p.appui ?? null);
  const creer = jest.fn(async (_t: string, _u: string, _dto: unknown) => ({ id: 'cp' }));
  const toutes = () =>
    ecritures.flatMap((e) => e.lignes.map((x) => ({ ecriture: e, ecritureId: e.id, compteId: x.compteId, debit: x.debit, credit: x.credit })));
  const prisma = {
    tenant: { findUnique: jest.fn(async () => ({ referentiel: p.referentiel ?? 'SYSCOHADA' })) },
    reevaluation: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => (a.where.id === 'r1' ? reeval : appuiFindFirst(a))),
      findFirstOrThrow: jest.fn(async () => ({ id: 'r1' })),
      // Les écarts encore en place · non annulées, d'un exercice qui finit avant la cible ; les lignes filtrées comme le service le demande.
      findMany: jest.fn(
        async (a: {
          where: { exercice?: { dateFin?: { lt: Date } } };
          select?: { ecritureEcarts?: { select?: { lignes?: { where?: { compteId?: { in: string[] } } } } } };
        }) => {
          const comptes = a.select?.ecritureEcarts?.select?.lignes?.where?.compteId?.in;
          const w = a.where as { exercice?: { dateFin?: { lt: Date } }; exerciceId?: unknown; id?: unknown };
          return reevaluations
            .filter((r) => correspond(r.exercice.dateFin, w.exercice?.dateFin) && correspond(r.exercice.id, w.exerciceId) && correspond(r.id, w.id))
            .map((r) => ({
              id: r.id,
              dateReevaluation: r.exercice.dateFin,
              ecritureExtourne: r.ecritureExtourne ?? null,
              contrePassationDeclaree: r.contrePassationDeclaree ?? null,
              ecritureEcarts: { lignes: r.ecritureEcarts.lignes.filter((x) => !comptes || comptes.includes(x.compteId)) },
            }));
        },
      ),
      update,
    },
    ecriture: {
      findFirst: jest.fn(async (a: { where: { id: string; tenantId: string } }) => {
        const e = ecritures.find((x) => x.id === a.where.id && (x.tenantId ?? 't') === a.where.tenantId);
        if (!e) return null;
        return {
          id: e.id,
          numeroPiece: e.numeroPiece ?? 1,
          date: dateDe(e),
          estGenereeParCloture: e.estGenereeParCloture ?? false,
          estANouveauProvisoire: false,
          estSoldeDesComptesDeGestion: false,
          exercice: { id: e.exercice.id, dateDebut: e.exercice.dateDebut, dateFin: e.exercice.dateFin },
          correction: e.correction ?? null,
          corrigeEcritureId: e.corrige?.id ?? null,
          corrigeEcriture: e.corrige ? { numeroPiece: e.corrige.numeroPiece } : null,
          reevaluationEcarts: e.reevaluationEcarts ?? null,
          reevaluationProvision: null,
          reevaluationExtourne: e.reevaluationExtourne ?? null,
          reevaluationContrePassationDeclaree: e.reevaluationContrePassationDeclaree ?? null,
          lignes: e.lignes,
        };
      }),
      findMany: jest.fn(async (a: { where: Record<string, unknown>; distinct?: string[] }) => {
        const retenues = ecritures
          .filter((e) => ecritureRetenue(e, a.where))
          .sort((x, y) => dateDe(x).getTime() - dateDe(y).getTime() || x.id.localeCompare(y.id));
        const rendues = retenues.map((e) => ({
          id: e.id,
          exerciceId: e.exercice.id,
          numeroPiece: e.numeroPiece ?? 1,
          date: dateDe(e),
          libelle: 'OD',
          statut: 'VALIDEE',
          journal: { code: 'OD' },
          exercice: e.exercice,
          lignes: e.lignes,
        }));
        return a.distinct?.includes('exerciceId') ? rendues.filter((e, i) => rendues.findIndex((x) => x.exerciceId === e.exerciceId) === i) : rendues;
      }),
      count: jest.fn(async (a: { where: Record<string, unknown> }) => ecritures.filter((e) => ecritureRetenue(e, a.where)).length),
    },
    ligneEcriture: {
      findMany: jest.fn(async (a: { where: { compteId: string | { in: string[] }; ecritureId?: { in: string[] }; ecriture?: Record<string, unknown> } }) =>
        toutes()
          .filter(
            (x) =>
              (typeof a.where.compteId === 'string' ? x.compteId === a.where.compteId : a.where.compteId.in.includes(x.compteId)) &&
              (!a.where.ecritureId || a.where.ecritureId.in.includes(x.ecritureId)) &&
              ecritureRetenue(x.ecriture, a.where.ecriture),
          )
          .map((x) => ({ ...x, ecriture: { numeroPiece: x.ecriture.numeroPiece ?? 1, date: dateDe(x.ecriture) } })),
      ),
      groupBy: jest.fn(async (a: { where: { compteId: { in: string[] }; ecriture?: Record<string, unknown> } }) => {
        const sommes = new Map<string, { debit: number; credit: number }>();
        for (const x of toutes()) {
          if (!a.where.compteId.in.includes(x.compteId) || !ecritureRetenue(x.ecriture, a.where.ecriture)) continue;
          const s = sommes.get(x.compteId) ?? { debit: 0, credit: 0 };
          sommes.set(x.compteId, { debit: s.debit + x.debit, credit: s.credit + x.credit });
        }
        return [...sommes].map(([compteId, s]) => ({ compteId, _sum: s }));
      }),
    },
    exercice: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => trier(filtrer(a.where))[0] ?? null),
      findMany: jest.fn(async (a: { where: Record<string, unknown>; orderBy?: { dateDebut?: 'asc' | 'desc' } }) => trier(filtrer(a.where), a.orderBy)),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od-journal' }) },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
  };
  const svc = new DevisesService(prisma as never, { creer, retirerCompensation: jest.fn() } as never);
  return { svc, update, prisma, appuiFindFirst, creer };
}

/** Le solde du 411 dans N+1 · les écritures de la doublure, plus ce que le module y a passé, plus l'écart de N+1 depuis le coût (400 000). */
const soldeFinal411 = (ecritures: EcritureFaite[], creer: jest.Mock) =>
  ecritures
    .filter((e) => e.exercice.id === 'e27')
    .flatMap((e) => e.lignes)
    .filter((x) => x.compteId === 'c-4111')
    .reduce((t, x) => t + x.debit - x.credit, 0) +
  creer.mock.calls.reduce((t, c) => {
    const lignes = (c[2] as { lignes: { compteId: string; debit?: number; credit?: number }[] }).lignes;
    return t + lignes.filter((x) => x.compteId === 'c-4111').reduce((s, x) => s + (x.debit ?? 0) - (x.credit ?? 0), 0);
  }, 0) +
  400_000;

describe('cinquième tour · le jugement de l’état, pur', () => {
  const c = (o: Record<string, number>) => new Map(Object.entries(o));
  const X = { id: 'X', ecart: c({ e479: -500, t411: 500 }) };
  const Y = { id: 'Y', ecart: c({ e479: -400, t411: 400 }) };
  const juger = (p: Partial<Parameters<typeof jugerLEtat>[0]>) =>
    jugerLEtat({
      comptes47: ['e479'],
      comptesTiers: ['t411'],
      lu47: c({ e479: -500 }),
      ecartTiers: c({}),
      enPlace: [X],
      reevaluationId: 'X',
      ecartX: X.ecart,
      retablissable: false,
      ecritures: [],
      ...p,
    });
  const ecr = (id: string, effet: Record<string, number>, o: Partial<EcritureSurLEcart> = {}): EcritureSurLEcart => ({
    id,
    numeroPiece: 1,
    date: new Date('2027-01-01'),
    dansLaCible: true,
    exacte: false,
    horsDeLEcart: false,
    dansLeSens: false,
    effet: c(effet),
    ...o,
  });

  it('lu = attendu, sur le 479 ET sur le tiers · EN_PLACE, aucune issue à dire (le module passe)', () => {
    const j = juger({});
    expect(j.verdict).toBe('EN_PLACE');
    expect(j.issue).toEqual({ gestes: [], fin: 'CONTRE_PASSER' });
  });

  it('contre-passé par une écriture exacte · CONTRE_PASSEE, l’issue · la déclarer', () => {
    const cp = ecr('cp', { e479: 500, t411: -500 }, { exacte: true });
    const j = juger({ lu47: c({ e479: 0 }), ecartTiers: c({ t411: -500 }), ecritures: [cp] });
    expect(j.verdict).toBe('CONTRE_PASSEE');
    expect(j.issue).toMatchObject({ gestes: [], fin: 'DECLARER', ecriture: { id: 'cp' } });
  });

  it('le 479 seul a bougé (contre la banque) · ANOMALIE ; l’issue prouvée · corriger, puis contre-passer', () => {
    const banque = ecr('banque', { e479: 500 }, { horsDeLEcart: true });
    const j = juger({ lu47: c({ e479: 0 }), ecritures: [banque] });
    expect(j.verdict).toBe('ANOMALIE');
    expect(j.issue).toMatchObject({ gestes: [{ type: 'NEUTRALISER', ecritures: [{ id: 'banque' }] }], fin: 'CONTRE_PASSER' });
  });

  it('l’ouverture omet l’écart (X2) · la contre-passation manuelle seule ne se déclare pas ; l’issue · rétablir, puis déclarer', () => {
    const cp = ecr('cp', { e479: 500, t411: -500 }, { exacte: true });
    const j = juger({ lu47: c({ e479: 500 }), ecartTiers: c({ t411: -1000 }), retablissable: true, ecritures: [cp] });
    expect(j.verdict).toBe('ANOMALIE');
    expect(j.issue).toMatchObject({ gestes: [{ type: 'RETABLIR' }], fin: 'DECLARER', ecriture: { id: 'cp' } });
  });

  it('deux écarts de mêmes comptes et montants, un seul contre-passé · AMBIGU ; l’écriture exacte se déclare (elle vaut pour l’un ou l’autre)', () => {
    const Z = { id: 'Z', ecart: c({ e479: -500, t411: 500 }) };
    const cp = ecr('cp', { e479: 500, t411: -500 }, { exacte: true });
    const j = juger({ enPlace: [X, Z], lu47: c({ e479: -500 }), ecartTiers: c({ t411: -500 }), ecritures: [cp] });
    expect(j.verdict).toBe('AMBIGU');
    expect(j.issue).toMatchObject({ gestes: [], fin: 'DECLARER' });
  });

  it('deux réévaluations contre-passées chacune par son OD (X8) · CONTRE_PASSEE pour chacune', () => {
    const cpX = ecr('cpX', { e479: 500, t411: -500 }, { exacte: true });
    const cpY = ecr('cpY', { e479: 400, t411: -400 });
    const j = juger({ enPlace: [X, Y], lu47: c({ e479: 0 }), ecartTiers: c({ t411: -900 }), ecritures: [cpX, cpY] });
    expect(j.verdict).toBe('CONTRE_PASSEE');
    expect(j.issue).toMatchObject({ gestes: [], fin: 'DECLARER', ecriture: { id: 'cpX' } });
  });

  it('aucune correction ne se déduit · `issue` à null (« rapprochez »)', () => {
    const j = juger({ lu47: c({ e479: -600 }), ecartTiers: c({ t411: 3100 }) });
    expect(j.verdict).toBe('ANOMALIE');
    expect(j.issue).toBeNull();
  });

  it('plus de douze écarts en place sur ces comptes · ANOMALIE, la lecture dite non tranchée', () => {
    const beaucoup = Array.from({ length: PLAFOND_SOUS_ENSEMBLES + 1 }, (_, i) => ({ id: `r${i}`, ecart: c({ e479: -1 }) }));
    expect(verdictDeLEtat({ comptes: ['e479'], lu: c({ e479: 0 }), enPlace: beaucoup, reevaluationId: 'r0' })).toMatchObject({ verdict: 'ANOMALIE', trop: true });
  });
});

describe('déclarer une contre-passation faite à la main', () => {
  it('l’OD d’ouverture de N+1 inverse exactement le 411 et le 4791 · déclarée, motif, date et auteur, par un `update` unitaire sur une réévaluation libre', async () => {
    const { svc, update } = monter();
    await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'OD d’ouverture du cabinet, pièce 7');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't', annuleeLe: null, AND: [{ ecritureExtourneId: null }, { contrePassationDeclareeId: null }] },
      data: expect.objectContaining({
        contrePassationDeclareeId: 'od',
        motifContrePassationDeclaree: 'OD d’ouverture du cabinet, pièce 7',
        contrePassationDeclareePar: 'u',
        contrePassationDeclareeLe: expect.any(Date),
      }),
    });
  });

  it('elle n’inverse qu’une part de l’écart · refus nommé compte par compte, rien déclaré', async () => {
    const partielle: EcritureFaite = { ...OD, lignes: [l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)] };
    const { svc, update } = monter({ ecritures: [...BASE_N, AN_N1, partielle] });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 300000\.00/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('hors de sa place · dans l’exercice même AVANT la réévaluation, ou en N+2 quand N+1 est ouvert · refus nommé, la cible dite', async () => {
    const avantLaReevaluation: EcritureFaite = { ...OD, exercice: { ...N }, date: new Date('2026-06-30') };
    await expect(
      monter({ ecritures: [...BASE_N, avantLaReevaluation] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif'),
    ).rejects.toThrow(/n'est pas à la place de la contre-passation de la réévaluation du 2026-12-31/);
    const dansN2: EcritureFaite = { ...OD, exercice: N2 };
    await expect(monter({ ecritures: [...BASE_N, AN_N1, dansN2] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /celui du 2027-01-01 au 2027-12-31/,
    );
  });

  it('X3 · passée DANS N, au plus tôt à la date de la réévaluation, N ouvert, N+1 sans à-nouveau · l’écart n’est plus dans les comptes, déclarée', async () => {
    const dansN: EcritureFaite = { ...OD, exercice: { ...N, statut: 'OUVERT' }, date: N.dateFin };
    const exercices: Exo[] = [{ ...N, statut: 'OUVERT' }, N1, N2];
    const { svc, update } = monter({ exercices, ecritures: [{ ...VENTE_N, exercice: exercices[0] }, { ...ECARTS_N_ECR, exercice: exercices[0] }, dansN] });
    await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'CP passée dans N');
    expect(update).toHaveBeenCalled();
  });

  it('en N+2, N+1 clôturé · à sa place, déclarée', async () => {
    const dansN2: EcritureFaite = { ...OD, exercice: N2 };
    const AN_N2: EcritureFaite = { ...AN_N1, id: 'an28', exercice: N2 };
    const { svc, update } = monter({ exercices: [N, { ...N1, statut: 'CLOTURE' }, N2], ecritures: [...BASE_N, AN_N1, AN_N2, dansN2] });
    await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif');
    expect(update).toHaveBeenCalled();
  });

  it('écriture d’un autre dossier · introuvable', async () => {
    const etrangere: EcritureFaite = { ...OD, tenantId: 'autre' };
    await expect(monter({ ecritures: [...BASE_N, AN_N1, etrangere] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /Écriture introuvable pour ce dossier/,
    );
  });

  it('déjà liée à une réévaluation, déjà déclarée ailleurs, neutralisée, ou engendrée par la clôture · refus nommés', async () => {
    const cas: Array<[Partial<EcritureFaite>, RegExp]> = [
      [{ reevaluationExtourne: { id: 'r0' } }, /écriture d'une réévaluation/],
      [{ reevaluationContrePassationDeclaree: { id: 'r0' } }, /déjà déclarée comme la contre-passation d'une autre réévaluation/],
      [{ correction: { numeroPiece: 9 } }, /neutralisée par son inscription en négatif \(pièce n° 9\)/],
      [{ estGenereeParCloture: true }, /engendrée par la clôture ou l'à-nouveau/],
    ];
    for (const [defaut, motif] of cas) {
      const { svc, update } = monter({ ecritures: [...BASE_N, AN_N1, { ...OD, ...defaut }] });
      await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(motif);
      expect(update).not.toHaveBeenCalled();
    }
  });

  it('réévaluation déjà contre-passée par le module, déjà couverte, annulée, ou sans écart de conversion · refus nommés', async () => {
    const cas: Array<[Record<string, unknown>, RegExp]> = [
      [{ ecritureExtourneId: 'x', ecritureExtourne: { numeroPiece: 3 } }, /déjà contre-passée par le module \(pièce n° 3\)/],
      [{ contrePassationDeclareeId: 'y', contrePassationDeclaree: { numeroPiece: 4 } }, /déjà déclarée pour cette réévaluation \(pièce n° 4\)/],
      [{ annuleeLe: new Date('2027-02-01') }, /annulée, le 2027-02-01/],
      [{ ecritureEcarts: { lignes: ECARTS_N.slice(2) } }, /aucun écart de conversion/],
    ];
    for (const [r, motif] of cas) {
      await expect(monter({ reeval: r }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(motif);
    }
  });

  it('le motif est exigé ; deux déclarations concurrentes · 409 nommé', async () => {
    await expect(monter().svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', ' ')).rejects.toThrow(/motif de la déclaration est obligatoire/);
    const course = new Prisma.PrismaClientKnownRequestError('perdu', { code: 'P2025', clientVersion: 'x' });
    await expect(monter({ updateEchoue: course }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /a changé entre-temps/,
    );
    const doublon = new Prisma.PrismaClientKnownRequestError('doublon', { code: 'P2002', clientVersion: 'x' });
    await expect(monter({ updateEchoue: doublon }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /vient d'être déclarée comme la contre-passation d'une autre réévaluation/,
    );
  });

  it('un doublon exact passé à côté · l’état ne se lit pas contre-passé (deux fois) · refusée, l’issue dit de corriger le doublon puis de déclarer', async () => {
    const doublon: EcritureFaite = { ...OD, id: 'od2', numeroPiece: 8 };
    const { svc, update } = monter({ ecritures: [...BASE_N, AN_N1, OD, doublon] });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /La pièce n° 7 du 2027-01-01 ne se déclare pas[\s\S]*Corrigez la pièce n° 8 du 2027-01-01[\s\S]*puis déclarez la pièce n° 7 du 2027-01-01/,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * QUATRIÈME TOUR, BLOQUANT 1 (sh1) · l'OD manuelle passée dans le MAUVAIS
 * sens (D 4111 / C 4791 de 500 000), corrigée par son inscription en négatif
 * (D 4111 −500 000 / C 4791 −500 000). Le négatif avait le net d'une
 * inversion · proposé, présélectionné, déclaré, l'écart de N restait en
 * place · 411 à 2 900 000 au lieu de 2 400 000.
 */
describe('BLOQUANT 1 · une inscription en négatif n’est pas une contre-passation (sh1)', () => {
  const FAUX: EcritureFaite = {
    id: 'faux',
    exercice: N1,
    numeroPiece: 3,
    correction: { numeroPiece: 4 },
    lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)],
  };
  const NEGATIF: EcritureFaite = {
    id: 'neg',
    exercice: N1,
    numeroPiece: 4,
    corrige: { id: 'faux', numeroPiece: 3 },
    lignes: [l('c-4111', '41110000', -500_000, 0), l('c-4791', '47910000', 0, -500_000)],
  };
  const ecritures = [...BASE_N, AN_N1, FAUX, NEGATIF];

  it('le négatif n’est pas proposé ; la paire neutralisée ne gêne pas · l’écran dit de contre-passer par le module', async () => {
    const r = await monter({ ecritures }).svc.candidatesContrePassationManuelle('t', 'r1');
    expect(r.candidates).toEqual([]);
    expect(r.motifHorsModule).toBeNull();
  });

  it('déclaré quand même · refusé, la correction nommée', async () => {
    const { svc, update } = monter({ ecritures });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'neg', 'CP passée à la main')).rejects.toThrow(
      /La pièce n° 4 du 2027-01-01 est une inscription en négatif \(correction de la pièce n° 3\)/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('chiffré · la contre-passation par le module passe, et le 411 finit N+1 à 2 400 000 (et non 2 900 000)', async () => {
    const { svc, creer } = monter({ ecritures });
    await svc.extourner('t', 'u', 'r1', 'e27');
    expect(creer.mock.calls[0][2]).toMatchObject({ lignes: [{ compteId: 'c-4111', credit: 500_000 }, { compteId: 'c-4791', debit: 500_000 }] });
    expect(soldeFinal411(ecritures, creer)).toBe(2_400_000);
  });

  it('variante D6 · le négatif d’une réévaluation annulée (même sens que l’écart, montants négatifs) · ni proposé, ni déclarable', async () => {
    const negatifD6: EcritureFaite = {
      id: 'neg-d6',
      exercice: N1,
      numeroPiece: 12,
      corrige: { id: 'ecarts-annulee', numeroPiece: 11 },
      lignes: [l('c-4111', '41110000', -500_000, 0), l('c-4791', '47910000', 0, -500_000)],
    };
    const m = monter({ ecritures: [...BASE_N, AN_N1, negatifD6] });
    expect((await m.svc.candidatesContrePassationManuelle('t', 'r1')).candidates).toEqual([]);
    await expect(m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'neg-d6', 'motif')).rejects.toThrow(/inscription en négatif/);
  });
});

/**
 * QUATRIÈME TOUR, BLOQUANT 2 · `extourner` ne voyait pas ce que le cabinet
 * avait déjà passé à la main. CINQUIÈME TOUR · il juge l'état réel des
 * comptes de l'écart.
 */
describe('BLOQUANT 2 · la contre-passation par le module n’est plus aveugle', () => {
  it('sm · OD manuelle exacte en N+1, non déclarée · « Contre-passer » refusé, « déclarez-la », rien écrit ; le 411 reste juste (2 400 000, et non 1 900 000)', async () => {
    const ecritures = [...BASE_N, AN_N1, OD];
    const { svc, creer } = monter({ ecritures });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(
      /déjà contre-passé à la main · la pièce n° 7 du 2027-01-01 l'inverse exactement \(47910000 · attendu 500000\.00 créditeur \(écarts en place\), solde 0\.00 ; 41110000 · [^)]*500000\.00 créditeur\)\. Déclarez cette écriture/,
    );
    expect(creer).not.toHaveBeenCalled();
    expect(soldeFinal411(ecritures, creer)).toBe(2_400_000);
  });

  it('sk · une seule OD en N+2 pour N et N+1 (900 000) · « Contre-passer » refusé, l’OD nommée, l’issue · la corriger, puis contre-passer', async () => {
    const exercices: Exo[] = [N, { ...N1, statut: 'CLOTURE' }, N2];
    const ECARTS_N1_ECR: EcritureFaite = {
      id: 'ecarts-n1',
      exercice: N1,
      date: N1.dateFin,
      reevaluationEcarts: { id: 'r2' },
      lignes: [l('c-4111', '41110000', 400_000, 0), l('c-4791', '47910000', 0, 400_000)],
    };
    const r2: ReevaluationFaite = { id: 'r2', exercice: N1, ecritureEcarts: { lignes: ECARTS_N1_ECR.lignes } };
    const AN_N2: EcritureFaite = {
      id: 'an28',
      exercice: N2,
      estGenereeParCloture: true,
      lignes: [l('c-4111', '41110000', 2_900_000, 0), l('c-4791', '47910000', 0, 900_000)],
    };
    const groupee: EcritureFaite = {
      id: 'od-groupee',
      exercice: N2,
      numeroPiece: 21,
      lignes: [l('c-4791', '47910000', 900_000, 0), l('c-4111', '41110000', 0, 900_000)],
    };
    const fond = [...BASE_N, AN_N1, ECARTS_N1_ECR, AN_N2];
    const m = monter({ exercices, ecritures: [...fond, groupee], autres: [r2] });
    await expect(m.svc.extourner('t', 'u', 'r1', 'e28')).rejects.toThrow(
      /il n'est plus en place \(47910000 · attendu 900000\.00 créditeur[\s\S]*Corrigez la pièce n° 21 du 2028-01-01[\s\S]*inscription en négatif[\s\S]*puis contre-passez/,
    );
    expect(m.creer).not.toHaveBeenCalled();
    // La déclaration est refusée, sans renvoyer au module ; l'écran dit ce que le serveur sert.
    await expect(m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od-groupee', 'motif')).rejects.toThrow(/n'inverse pas exactement/);
    await m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od-groupee', 'motif').catch((e: Error) => expect(e.message).not.toMatch(/par le module/));
    const lues = await m.svc.candidatesContrePassationManuelle('t', 'r1');
    expect(lues.candidates).toEqual([]);
    expect(lues.motifHorsModule).toMatch(/Corrigez la pièce n° 21 du 2028-01-01/);

    // L'issue suivie · l'OD corrigée par son négatif, la paire ne gêne plus ; N se contre-passe (500 000), N+1 de même (400 000).
    const corrigee = { ...groupee, correction: { numeroPiece: 22 } };
    const negatif: EcritureFaite = { ...groupee, id: 'neg-groupee', numeroPiece: 22, corrige: { id: 'od-groupee', numeroPiece: 21 }, lignes: groupee.lignes.map((x) => ({ ...x, debit: -x.debit, credit: -x.credit })) };
    const apres = monter({ exercices, ecritures: [...fond, corrigee, negatif], autres: [r2] });
    await apres.svc.extourner('t', 'u', 'r1', 'e28');
    const cpN = (apres.creer.mock.calls[0][2] as { lignes: { compteId: string; debit?: number; credit?: number }[] }).lignes;
    // Le 411 de N+2 · à-nouveau 2 900 000, OD et négatif (0), contre-passation de N (−500 000), celle de N+1 (−400 000), écart de N+2 depuis le coût (+600 000).
    const cpN411 = cpN.filter((x) => x.compteId === 'c-4111').reduce((t, x) => t + (x.debit ?? 0) - (x.credit ?? 0), 0);
    expect(2_900_000 + 0 + cpN411 - 400_000 + 600_000).toBe(2_600_000);
  });

  it('une OD partielle sur le 4791 (300 000) · refusée, nommée, l’issue prouvée · la corriger, puis contre-passer ; jamais « par le module »', async () => {
    const partielle: EcritureFaite = { ...OD, id: 'part', numeroPiece: 9, lignes: [l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)] };
    const { svc, creer } = monter({ ecritures: [...BASE_N, AN_N1, partielle] });
    let message = '';
    await svc.extourner('t', 'u', 'r1', 'e27').catch((e: Error) => (message = e.message));
    expect(message).toMatch(/Corrigez la pièce n° 9 du 2027-01-01[\s\S]*inscription en négatif[\s\S]*puis contre-passez \(Devises, « Contre-passer »\)/);
    expect(message).not.toMatch(/par le module/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('X1 · un AUTRE écart, hors module, sur le même 4791 (créance reprise sans devise) · en place, puis contre-passé à la main · le module passe', async () => {
    const ecartEur: EcritureFaite = { id: 'eur', exercice: N, date: N.dateFin, numeroPiece: 5, lignes: [l('c-4111', '41110000', 100_000, 0), l('c-4791', '47910000', 0, 100_000)] };
    const AN: EcritureFaite = { ...AN_N1, lignes: [l('c-4111', '41110000', 2_600_000, 0), l('c-4791', '47910000', 0, 600_000)] };
    const cpEur: EcritureFaite = { id: 'cp-eur', exercice: N1, numeroPiece: 8, lignes: [l('c-4791', '47910000', 100_000, 0), l('c-4111', '41110000', 0, 100_000)] };
    // Le module d'abord (X1 bis, ordre inverse) · l'écart EUR est en place, il ne gêne pas.
    const avant = monter({ ecritures: [...BASE_N, ecartEur, AN] });
    await avant.svc.extourner('t', 'u', 'r1', 'e27');
    expect(avant.creer).toHaveBeenCalled();
    // La CP EUR à la main d'abord (X1) · le module passe aussi.
    const apres = monter({ ecritures: [...BASE_N, ecartEur, AN, cpEur] });
    await apres.svc.extourner('t', 'u', 'r1', 'e27');
    expect(apres.creer).toHaveBeenCalled();
  });

  it('X4 · ouverture nette de l’écart, « rétablissement » contre la BANQUE · refusé ; l’issue prouvée · corriger, rétablir, contre-passer', async () => {
    const IMPORT_NET: EcritureFaite = { id: 'import', exercice: N1, numeroPiece: 1, estGenereeParCloture: true, lignes: [l('c-4111', '41110000', 2_000_000, 0)] };
    const pseudo: EcritureFaite = { id: 'pseudo', exercice: N1, numeroPiece: 3, lignes: [l('c-5211', '52110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ ecritures: [...BASE_N, IMPORT_NET, pseudo] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(
      /Corrigez la pièce n° 3 du 2027-01-01[\s\S]*rétablissez l'écart, que l'ouverture de l'exercice du 2027-01-01 au 2027-12-31 omet \(AUDCIF art\. 34\), par une OD à cette ouverture \(41110000 au débit de 500000\.00, 47910000 au crédit de 500000\.00\), puis contre-passez/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('sr · la déclaration dont l’écriture est dans un exercice CLÔTURÉ ne se retire pas (411 à 2 100 000 sinon)', async () => {
    const declaree = {
      contrePassationDeclareeId: 'od',
      contrePassationDeclaree: { numeroPiece: 7, exercice: { dateDebut: N1.dateDebut, statut: 'CLOTURE' } },
    };
    const { svc, update } = monter({ reeval: declaree });
    await expect(svc.retirerContrePassationManuelle('t', 'u', 'r1', 'erreur de déclaration')).rejects.toThrow(
      /L'écriture déclarée \(pièce n° 7\) est dans un exercice clôturé · elle ne se corrige plus \(AUDCIF art\. 20, al\. 3\)/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('déclarée · « Contre-passer » refusé, l’issue dit de CORRIGER l’écriture manuelle avant de passer par le module', async () => {
    const { svc, creer } = monter({ reeval: { contrePassationDeclareeId: 'od' } });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/retirez la déclaration[\s\S]*CORRIGEZ l'écriture par inscription en négatif/);
    expect(creer).not.toHaveBeenCalled();
  });
});

/**
 * QUATRIÈME TOUR, m1 (sf, sf3) · un bilan d'ouverture IMPORTÉ en N+1, déjà
 * net de l'écart de N (411 à 2 000 000, aucun 4791). « Contre-passer »
 * retranchait un écart absent · 411 à 2 700 000 au lieu de 3 200 000.
 */
describe('m1 · l’ouverture qui ne porte pas l’écart', () => {
  const IMPORT_NET: EcritureFaite = { id: 'import', exercice: N1, numeroPiece: 1, estGenereeParCloture: true, lignes: [l('c-4111', '41110000', 2_000_000, 0)] };

  it('« Contre-passer » refusé · l’à-nouveau ne correspond pas à la clôture de N (AUDCIF art. 34), l’issue · rétablir l’écart par une OD, puis contre-passer', async () => {
    const { svc, creer } = monter({ ecritures: [...BASE_N, IMPORT_NET] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(
      /il n'est plus en place[\s\S]*Rétablissez l'écart, que l'ouverture de l'exercice du 2027-01-01 au 2027-12-31 omet \(AUDCIF art\. 34\), par une OD à cette ouverture \(41110000 au débit de 500000\.00, 47910000 au crédit de 500000\.00\), puis contre-passez/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('au SYCEBNL, la correspondance se cite à son art. 16, 4) (son art. 3 écarte l’art. 34 de l’AUDCIF)', async () => {
    const { svc } = monter({ ecritures: [...BASE_N, IMPORT_NET], referentiel: 'SYCEBNL' });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/\(SYCEBNL art\. 16, 4\)\)/);
  });

  it('l’OD de rétablissement passée (D 4111 / C 4791 de l’écart) · « Contre-passer » admis', async () => {
    const retablissement: EcritureFaite = { id: 'retab', exercice: N1, numeroPiece: 2, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ ecritures: [...BASE_N, IMPORT_NET, retablissement] });
    await svc.extourner('t', 'u', 'r1', 'e27');
    expect(creer).toHaveBeenCalled();
  });

  it('X2 · rétablie PUIS contre-passée à la main · la contre-passation se déclare ; seule (sans rétablissement), elle est refusée avec l’issue « rétablissez, puis déclarez »', async () => {
    const retablissement: EcritureFaite = { id: 'retab', exercice: N1, numeroPiece: 2, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const cp: EcritureFaite = { id: 'cp', exercice: N1, numeroPiece: 3, lignes: [l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 500_000)] };
    const seule = monter({ ecritures: [...BASE_N, IMPORT_NET, cp] });
    await expect(seule.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'cp', 'CP à la main')).rejects.toThrow(
      /ne se déclare pas[\s\S]*Rétablissez l'écart[\s\S]*puis déclarez la pièce n° 3 du 2027-01-01/,
    );
    expect(seule.update).not.toHaveBeenCalled();
    const retablie = monter({ ecritures: [...BASE_N, IMPORT_NET, retablissement, cp] });
    await retablie.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'cp', 'CP à la main');
    expect(retablie.update).toHaveBeenCalled();
  });

  it('la même OD sur une ouverture qui PORTE déjà l’écart (sh1 non corrigé) · refusée, elle le doublerait', async () => {
    const faux: EcritureFaite = { id: 'faux', exercice: N1, numeroPiece: 3, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ ecritures: [...BASE_N, AN_N1, faux] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/Corrigez la pièce n° 3 du 2027-01-01/);
    expect(creer).not.toHaveBeenCalled();
  });
});

/**
 * VÉRIFICATION FINALE · UNE FENÊTRE, UNE OUVERTURE. N+1 CLÔTURÉ, repris d'un
 * autre logiciel par un bilan d'ouverture qui omet l'écart de N ; N+2 ouvert
 * par l'à-nouveau de clôture de N+1. Le 478 / 479 se lisait par la chaîne de
 * la cible (N+2 seul) · 4791 à zéro ; le tiers par l'écart de la SEULE
 * dernière ouverture (celle de N+2, qui correspond à N+1) · aucun. Le 47 sans
 * écart, le tiers avec · ni l'omission ni l'art. 34 n'étaient dits, et le
 * refus tombait sur « aucune correction ne se déduit ». Lus sur la même
 * fenêtre, avec la même ouverture, ils disent l'omission de N+1 et l'issue
 * (rétablir à l'ouverture de la cible, puis contre-passer).
 */
describe('vérification finale · le 478 / 479 et le tiers lus sur la même fenêtre, avec la même ouverture', () => {
  const N1_CLOS: Exo = { ...N1, statut: 'CLOTURE' };
  const IMPORT_N1: EcritureFaite = { id: 'import', exercice: N1_CLOS, numeroPiece: 1, estGenereeParCloture: true, lignes: [l('c-4111', '41110000', 2_000_000, 0)] };
  const AN_N2: EcritureFaite = { id: 'an28', exercice: N2, numeroPiece: 1, estGenereeParCloture: true, lignes: [l('c-4111', '41110000', 2_000_000, 0)] };

  it('l’omission dans l’ouverture d’un exercice CLÔTURÉ de la fenêtre est dite (AUDCIF art. 34), l’issue · rétablir à l’ouverture de la cible, puis contre-passer', async () => {
    const { svc, creer } = monter({ exercices: [N, N1_CLOS, N2], ecritures: [...BASE_N, IMPORT_N1, AN_N2] });
    const refus = svc.extourner('t', 'u', 'r1', 'e28');
    await expect(refus).rejects.toThrow(
      /Rétablissez l'écart, que l'ouverture de l'exercice du 2027-01-01 au 2027-12-31 omet \(AUDCIF art\. 34\), par une OD à l'ouverture de l'exercice du 2028-01-01 au 2028-12-31 \(41110000 au débit de 500000\.00, 47910000 au crédit de 500000\.00\), puis contre-passez/,
    );
    await expect(svc.extourner('t', 'u', 'r1', 'e28')).rejects.not.toThrow(/aucune correction ne se déduit/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('l’OD de rétablissement passée dans la cible · « Contre-passer » admis', async () => {
    const retablissement: EcritureFaite = { id: 'retab', exercice: N2, numeroPiece: 2, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ exercices: [N, N1_CLOS, N2], ecritures: [...BASE_N, IMPORT_N1, AN_N2, retablissement] });
    await svc.extourner('t', 'u', 'r1', 'e28');
    expect(creer).toHaveBeenCalled();
  });
});

describe('les écritures candidates', () => {
  it('celles qui inversent exactement, quand l’état dit l’écart contre-passé · une OD en N+2 (hors de la fenêtre) n’est pas lue', async () => {
    const plusLoin: EcritureFaite = { ...OD, id: 'od3', exercice: N2 };
    const { svc, prisma } = monter({ ecritures: [...BASE_N, AN_N1, OD, plusLoin] });
    const r = await svc.candidatesContrePassationManuelle('t', 'r1');
    expect(r.montants).toBe('41110000 au crédit de 500000.00, 47910000 au débit de 500000.00');
    expect(r.candidates.map((c) => c.id)).toEqual(['od']);
    expect(r.tronque).toBe(false);
    // Lues par le compte d'écart, hors module, dans l'exercice réévalué depuis sa date, puis N+1 seul (la fenêtre).
    const lecture = prisma.ecriture.findMany.mock.calls.find((c) => (c[0].where as { lignes?: unknown }).lignes)![0];
    expect(lecture.where).toMatchObject({
      tenantId: 't',
      estGenereeParCloture: false,
      corrigeEcritureId: null,
      correction: { is: null },
      reevaluationEcarts: { is: null },
      reevaluationExtourne: { is: null },
      reevaluationContrePassationDeclaree: { is: null },
      lignes: { some: { compteId: { in: ['c-4791'] } } },
      OR: [{ exerciceId: 'e26', date: { gte: N.dateFin } }, { exerciceId: { in: ['e27'] } }],
    });
  });

  it('une autre OD partielle à côté · l’état ne se lit plus contre-passé · aucune candidate, l’issue prouvée dite (corriger l’autre, puis déclarer)', async () => {
    const autre: EcritureFaite = { id: 'od2', exercice: N1, numeroPiece: 5, lignes: [l('c-4791', '47910000', 200_000, 0), l('c-4111', '41110000', 0, 200_000)] };
    const r = await monter({ ecritures: [...BASE_N, AN_N1, OD, autre] }).svc.candidatesContrePassationManuelle('t', 'r1');
    expect(r.candidates).toEqual([]);
    expect(r.motifHorsModule).toMatch(/Corrigez la pièce n° 5 du 2027-01-01[\s\S]*puis déclarez la pièce n° 7 du 2027-01-01/);
  });
});

describe('retirer la déclaration', () => {
  const declaree = {
    contrePassationDeclareeId: 'od',
    motifContrePassationDeclaree: 'OD du cabinet',
    contrePassationDeclaree: { numeroPiece: 7, exercice: { dateDebut: N1.dateDebut, statut: 'OUVERT' } },
  };

  it('aucune réévaluation postérieure ne s’y est appuyée · retirée par un `update` unitaire filtré, motif et déclaration gardés dans la trace', async () => {
    const { svc, update, appuiFindFirst } = monter({ reeval: declaree });
    await svc.retirerContrePassationManuelle('t', 'u', 'r1', 'OD erronée, corrigée');
    expect(appuiFindFirst.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't', annuleeLe: null, id: { not: 'r1' }, exercice: { dateDebut: { gte: N1.dateDebut } } },
    });
    const appel = update.mock.calls[0][0];
    expect(appel.where).toEqual({ id: 'r1', tenantId: 't', contrePassationDeclareeId: 'od' });
    expect(appel.data).toMatchObject({ contrePassationDeclareeId: null, motifContrePassationDeclaree: null, contrePassationDeclareeLe: null, contrePassationDeclareePar: null });
    expect(appel.data.retraitsContrePassationDeclaree).toEqual([
      expect.objectContaining({ ecritureId: 'od', numeroPiece: 7, motifDeclaration: 'OD du cabinet', motif: 'OD erronée, corrigée', par: 'u' }),
    ]);
  });

  it('m3 · le motif est exigé', async () => {
    await expect(monter({ reeval: declaree }).svc.retirerContrePassationManuelle('t', 'u', 'r1', '  ')).rejects.toThrow(/motif du retrait est obligatoire/);
  });

  it('la réévaluation de N+1 s’y est appuyée · refus nommé, l’issue dite (l’annuler d’abord)', async () => {
    const { svc, update } = monter({ reeval: declaree, appui: { dateReevaluation: N1.dateFin } });
    await expect(svc.retirerContrePassationManuelle('t', 'u', 'r1', 'motif')).rejects.toThrow(
      /La réévaluation du 2027-12-31 a été calculée avec cette contre-passation en place · annulez-la d'abord/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rien de déclaré · refus nommé', async () => {
    await expect(monter().svc.retirerContrePassationManuelle('t', 'u', 'r1', 'motif')).rejects.toThrow(/Aucune contre-passation manuelle n'est déclarée/);
  });
});

describe('m2 · « Annuler la contre-passation » sur une réévaluation déclarée nomme la déclaration et son geste', () => {
  it('refus nommé · retirer la déclaration, corriger l’écriture manuelle', async () => {
    const { svc } = monter({ reeval: { contrePassationDeclareeId: 'od', contrePassationDeclaree: { numeroPiece: 7 } } });
    await expect(svc.annulerContrePassation('t', 'u', 'r1', 'motif')).rejects.toThrow(
      /contre-passée par une écriture manuelle déclarée \(pièce n° 7\)[\s\S]*« Retirer la déclaration »/,
    );
  });
});

describe('troisième tour, mineur 3 · les traces des contre-passations annulées, lues dans un ordre stable', () => {
  it('les plus récentes d’abord, l’identifiant pour départager ; au-delà de la borne, `tronque`', async () => {
    const findMany = jest.fn(async (_a: unknown) =>
      Array.from({ length: PLAFOND_REEVALUATIONS_EXAMINEES + 1 }, (_, i) => ({ annulationsContrePassation: [{ ecritureId: `e${i}` }] })),
    );
    const r = await ecrituresDesContrePassationsAnnulees({ reevaluation: { findMany } } as never, 't');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ dateReevaluation: 'desc' }, { id: 'asc' }], take: PLAFOND_REEVALUATIONS_EXAMINEES + 1 }),
    );
    expect(r.tronque).toBe(true);
    expect(r.ids.size).toBe(PLAFOND_REEVALUATIONS_EXAMINEES);
  });
});

/**
 * VÉRIFICATION FINALE · L'ÉTAT DE L'ÉCART ATTESTÉ. Le cabinet répond par
 * écrit de l'état des comptes de l'écart (AUDCIF art. 69 ; SYCEBNL art. 16,
 * 2)) · les refus de la règle d'état deviennent des avertissements pour cette
 * réévaluation. Trois refus restent · la banque, dont l'écart est réalisé
 * (AUDCIF art. 57, B-I) ; la seconde contre-passation par le module ; la
 * déclaration d'une inscription en négatif (art. 20, al. 2).
 */
describe('vérification finale · l’état de l’écart attesté', () => {
  const ATTESTEE = { etatAtteste: true, motifAttestation: 'Écart repris de l’ancien logiciel, rapproché le 15/01', etatAttesteLe: new Date('2027-01-20') };
  const IMPORT_NET: EcritureFaite = { id: 'import', exercice: N1, numeroPiece: 1, estGenereeParCloture: true, lignes: [l('c-4111', '41110000', 2_000_000, 0)] };

  it('un refus de la règle d’état devient un AVERTISSEMENT · une OD partielle sur le 4791 (300 000), attestée · la contre-passation passe, l’avertissement chiffré dans la réponse', async () => {
    const partielle: EcritureFaite = { ...OD, id: 'part', numeroPiece: 9, lignes: [l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)] };
    const sans = monter({ ecritures: [...BASE_N, AN_N1, partielle] });
    await expect(sans.svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/ne se contre-passe pas en l'état/);
    const { svc, creer } = monter({ ecritures: [...BASE_N, AN_N1, partielle], reeval: ATTESTEE });
    const r = (await svc.extourner('t', 'u', 'r1', 'e27')) as unknown as { avertissement: string | null };
    expect(creer).toHaveBeenCalled();
    expect(r.avertissement).toMatch(/État de l'écart attesté par le cabinet le 2027-01-20 \(« Écart repris de l’ancien logiciel, rapproché le 15\/01 »\)/);
    expect(r.avertissement).toMatch(/Corrigez la pièce n° 9 du 2027-01-01/);
  });

  it('RESTE REFUSÉE · l’ouverture qui omet l’écart l’a déjà sorti des comptes · le contre-passer l’inverserait une seconde fois, attestée ou non', async () => {
    const { svc, creer } = monter({ ecritures: [...BASE_N, IMPORT_NET], reeval: ATTESTEE });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/il n'est plus en place[\s\S]*Rétablissez l'écart/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('la déclaration d’une OD exacte que l’état ne lit pas contre-passée (X2 sans rétablissement), attestée · déclarée, avec l’avertissement', async () => {
    const cp: EcritureFaite = { id: 'cp', exercice: N1, numeroPiece: 3, lignes: [l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 500_000)] };
    const { svc, update } = monter({ ecritures: [...BASE_N, IMPORT_NET, cp], reeval: ATTESTEE });
    const r = await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'cp', 'CP à la main');
    expect(update).toHaveBeenCalled();
    expect(r.avertissement).toMatch(/État de l'écart attesté[\s\S]*ne se déclare pas/);
  });

  it('RESTE REFUSÉE · la seconde contre-passation par le module (l’OD de N+1 a déjà inversé l’écart), attestée ou non', async () => {
    const { svc, creer } = monter({ reeval: ATTESTEE });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/déjà contre-passé à la main/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('RESTE REFUSÉE · la déclaration d’une inscription en négatif, attestée ou non', async () => {
    const FAUX: EcritureFaite = { id: 'faux', exercice: N1, numeroPiece: 3, correction: { numeroPiece: 4 }, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const NEGATIF: EcritureFaite = {
      id: 'neg',
      exercice: N1,
      numeroPiece: 4,
      corrige: { id: 'faux', numeroPiece: 3 },
      lignes: [l('c-4111', '41110000', -500_000, 0), l('c-4791', '47910000', 0, -500_000)],
    };
    const { svc, update } = monter({ ecritures: [...BASE_N, AN_N1, FAUX, NEGATIF], reeval: ATTESTEE });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'neg', 'CP passée à la main')).rejects.toThrow(/est une inscription en négatif/);
    expect(update).not.toHaveBeenCalled();
  });

  it('RESTE REFUSÉE · B-I, la banque seule · son écart est réalisé (AUDCIF art. 57), rien à contre-passer, attestée ou non', async () => {
    const BANQUE = [l('c-5211', '52110000', 100_000, 0), l('c-776', '77600000', 0, 100_000)];
    const { svc, creer } = monter({ reeval: { ...ATTESTEE, ecritureEcarts: { lignes: BANQUE } } });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/ne porte que des disponibilités[\s\S]*AUDCIF art\. 57/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('attester · motif de 10 à 500 caractères ; l’auteur et la date posés par le SERVEUR, par un `update` unitaire filtré sur l’état libre', async () => {
    const court = monter();
    await expect(court.svc.attesterEtatDeLEcart('t', 'u', 'r1', 'court')).rejects.toThrow(/de 10 à 500 caractères/);
    await expect(court.svc.attesterEtatDeLEcart('t', 'u', 'r1', 'x'.repeat(501))).rejects.toThrow(/de 10 à 500 caractères/);
    expect(court.update).not.toHaveBeenCalled();
    const { svc, update } = monter();
    await svc.attesterEtatDeLEcart('t', 'comptable-1', 'r1', '  Écart repris de l’ancien logiciel  ');
    const appel = update.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(appel.where).toMatchObject({ id: 'r1', tenantId: 't', annuleeLe: null, etatAtteste: false });
    expect(appel.data).toMatchObject({ etatAtteste: true, motifAttestation: 'Écart repris de l’ancien logiciel', etatAttestePar: 'comptable-1' });
    expect(appel.data.etatAttesteLe).toBeInstanceOf(Date);
  });

  it('déjà attestée · 409 ; retirer · motif exigé, trace gardée ; refusé si une contre-passation a été passée sous l’attestation', async () => {
    await expect(monter({ reeval: ATTESTEE }).svc.attesterEtatDeLEcart('t', 'u', 'r1', 'une seconde fois')).rejects.toThrow(/déjà attesté/);
    const libre = monter({ reeval: ATTESTEE });
    await libre.svc.retirerAttestationEtatDeLEcart('t', 'u', 'r1', 'Rapprochement refait');
    const appel = libre.update.mock.calls[0][0] as { where: Record<string, unknown>; data: { retraitsAttestation: Array<Record<string, unknown>> } };
    expect(appel.where).toMatchObject({ id: 'r1', etatAtteste: true });
    expect(appel.data).toMatchObject({ etatAtteste: false, motifAttestation: null, etatAttesteLe: null, etatAttestePar: null });
    expect(appel.data.retraitsAttestation[0]).toMatchObject({ motifAttestation: ATTESTEE.motifAttestation, motif: 'Rapprochement refait', par: 'u' });
    const appuyee = monter({ reeval: { ...ATTESTEE, ecritureExtourne: { numeroPiece: 9, createdAt: new Date('2027-01-21') } } });
    await expect(appuyee.svc.retirerAttestationEtatDeLEcart('t', 'u', 'r1', 'Rapprochement refait')).rejects.toThrow(/pièce n° 9\) a été passée sous cette attestation/);
    expect(appuyee.update).not.toHaveBeenCalled();
  });
});

/**
 * VÉRIFICATION FINALE, L1 · la réévaluation de N+1 passée alors que l'écart
 * de N était encore en place (avant A5 bis) · son écart (D 4111 / C 4791 de
 * 400 000, depuis le coût) est dans le solde du 4791, hors de l'attendu.
 * L'issue se dit DANS L'ORDRE · annuler la réévaluation de N+1 (D6),
 * contre-passer celle de N, réévaluer N+1 de nouveau.
 */
describe('vérification finale, L1 · une réévaluation postérieure passée avec l’écart en place', () => {
  const ECARTS_N1: EcritureFaite = {
    id: 'ecarts-n1',
    exercice: N1,
    date: N1.dateFin,
    numeroPiece: 12,
    reevaluationEcarts: { id: 'r2' },
    lignes: [l('c-4111', '41110000', 400_000, 0), l('c-4791', '47910000', 0, 400_000)],
  };
  const R2: ReevaluationFaite = { id: 'r2', exercice: N1, ecritureEcarts: { lignes: ECARTS_N1.lignes } };

  it('« Contre-passer » refusé · annulez la réévaluation du 2027-12-31, PUIS contre-passez celle du 2026-12-31, PUIS réévaluez', async () => {
    const { svc, creer } = monter({ ecritures: [...BASE_N, AN_N1, ECARTS_N1], autres: [R2] });
    let message = '';
    await svc.extourner('t', 'u', 'r1', 'e27').catch((e: Error) => (message = e.message));
    expect(message).toMatch(
      /\(1\) annulez la réévaluation du 2027-12-31 \(Devises, « Annuler la réévaluation »[\s\S]*\(2\) contre-passez la réévaluation du 2026-12-31[\s\S]*\(3\) réévaluez de nouveau l'exercice du 2027-01-01 au 2027-12-31/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('la réévaluation de N+1 annulée (hors de la lecture) · la contre-passation passe', async () => {
    const { svc, creer } = monter({ ecritures: [...BASE_N, AN_N1] });
    await svc.extourner('t', 'u', 'r1', 'e27');
    expect(creer).toHaveBeenCalled();
  });
});
