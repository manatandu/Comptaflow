import { Prisma } from '@prisma/client';
import { DevisesService } from './devises.service';
import {
  disponibilitesInversees,
  libelleMontantsAContrePasser,
  libelleMontantsDeLEcart,
  montantsAContrePasser,
  motifRefusInversion,
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
  numeroPiece?: number;
  lignes: ReturnType<typeof l>[];
  estGenereeParCloture?: boolean;
  /** Une inscription en négatif · l'écriture qu'elle corrige. */
  corrige?: { id: string; numeroPiece: number };
  /** L'écriture a été corrigée · son négatif. */
  correction?: { numeroPiece: number } | null;
  reevaluationExtourne?: { id: string } | null;
  reevaluationContrePassationDeclaree?: { id: string } | null;
}

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
    return true;
  }
  return valeur === filtre;
}

/** La doublure honore le filtre d'écriture que le service pose · dossier, exercice, à-nouveau, liens, paires neutralisées. */
function ecritureRetenue(e: EcritureFaite, w: Record<string, unknown> = {}): boolean {
  if (w.tenantId !== undefined && (e.tenantId ?? 't') !== w.tenantId) return false;
  if (!correspond(e.id, w.id)) return false;
  if (!correspond(e.exercice.id, w.exerciceId)) return false;
  if (w.estGenereeParCloture !== undefined && (e.estGenereeParCloture ?? false) !== w.estGenereeParCloture) return false;
  if (w.corrigeEcritureId === null && e.corrige) return false;
  if (w.correction !== undefined && e.correction) return false;
  if (w.reevaluationExtourne !== undefined && e.reevaluationExtourne) return false;
  if (w.reevaluationContrePassationDeclaree !== undefined && e.reevaluationContrePassationDeclaree) return false;
  return true;
}

function monter(
  p: {
    exercices?: Exo[];
    ecritures?: EcritureFaite[];
    reeval?: Record<string, unknown>;
    appui?: { dateReevaluation: Date } | null;
    updateEchoue?: unknown;
    referentiel?: 'SYSCOHADA' | 'SYCEBNL';
  } = {},
) {
  const exercices = p.exercices ?? [N, N1, N2];
  const ecritures = p.ecritures ?? [AN_N1, OD];
  const reeval = {
    id: 'r1',
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
  const filtrer = (where: Record<string, unknown> = {}) =>
    exercices.filter((e) => correspond(e.id, where.id) && correspond(e.dateDebut, where.dateDebut) && correspond(e.statut, where.statut));
  const trier = (liste: Exo[]) => [...liste].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
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
      update,
    },
    ecriture: {
      findFirst: jest.fn(async (a: { where: { id: string; tenantId: string } }) => {
        const e = ecritures.find((x) => x.id === a.where.id && (x.tenantId ?? 't') === a.where.tenantId);
        if (!e) return null;
        return {
          id: e.id,
          numeroPiece: e.numeroPiece ?? 1,
          date: e.exercice.dateDebut,
          estGenereeParCloture: e.estGenereeParCloture ?? false,
          estANouveauProvisoire: false,
          estSoldeDesComptesDeGestion: false,
          exercice: { dateDebut: e.exercice.dateDebut, dateFin: e.exercice.dateFin },
          correction: e.correction ?? null,
          corrigeEcritureId: e.corrige?.id ?? null,
          corrigeEcriture: e.corrige ? { numeroPiece: e.corrige.numeroPiece } : null,
          reevaluationEcarts: null,
          reevaluationProvision: null,
          reevaluationExtourne: e.reevaluationExtourne ?? null,
          reevaluationContrePassationDeclaree: e.reevaluationContrePassationDeclaree ?? null,
          lignes: e.lignes,
        };
      }),
      findMany: jest.fn(async (a: { where: Record<string, unknown> }) =>
        ecritures
          .filter((e) => ecritureRetenue(e, a.where))
          .map((e) => ({ id: e.id, numeroPiece: e.numeroPiece ?? 1, date: e.exercice.dateDebut, libelle: 'OD', statut: 'VALIDEE', journal: { code: 'OD' }, exercice: e.exercice })),
      ),
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
          .map((x) => ({ ...x, ecriture: { numeroPiece: x.ecriture.numeroPiece ?? 1, date: x.ecriture.exercice.dateDebut } })),
      ),
    },
    exercice: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => trier(filtrer(a.where))[0] ?? null),
      findMany: jest.fn(async (a: { where: Record<string, unknown> }) => trier(filtrer(a.where))),
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
    const { svc, update } = monter({ ecritures: [AN_N1, partielle] });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 300000\.00/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('hors de sa place · dans l’exercice même de la réévaluation, ou en N+2 quand N+1 est ouvert · refus nommé, la cible dite', async () => {
    const dansN: EcritureFaite = { ...OD, exercice: { ...N } };
    await expect(monter({ ecritures: [dansN] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /n'est pas à la place de la contre-passation de la réévaluation du 2026-12-31/,
    );
    const dansN2: EcritureFaite = { ...OD, exercice: N2 };
    await expect(monter({ ecritures: [AN_N1, dansN2] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /celui du 2027-01-01 au 2027-12-31/,
    );
  });

  it('en N+2, N+1 clôturé · à sa place, déclarée', async () => {
    const dansN2: EcritureFaite = { ...OD, exercice: N2 };
    const { svc, update } = monter({ exercices: [N, { ...N1, statut: 'CLOTURE' }, N2], ecritures: [AN_N1, dansN2] });
    await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif');
    expect(update).toHaveBeenCalled();
  });

  it('écriture d’un autre dossier · introuvable', async () => {
    const etrangere: EcritureFaite = { ...OD, tenantId: 'autre' };
    await expect(monter({ ecritures: [AN_N1, etrangere] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
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
      const { svc, update } = monter({ ecritures: [AN_N1, { ...OD, ...defaut }] });
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

  it('elle doit être SEULE · un doublon exact passé à côté est nommé, rien déclaré', async () => {
    const doublon: EcritureFaite = { ...OD, id: 'od2', numeroPiece: 8 };
    const { svc, update } = monter({ ecritures: [AN_N1, OD, doublon] });
    await expect(svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /D'autres écritures passées hors du module touchent aussi le 478 ou le 479 de cet écart \(pièce n° 8/,
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
  const ecritures = [AN_N1, FAUX, NEGATIF];

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
    const m = monter({ ecritures: [AN_N1, negatifD6] });
    expect((await m.svc.candidatesContrePassationManuelle('t', 'r1')).candidates).toEqual([]);
    await expect(m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'neg-d6', 'motif')).rejects.toThrow(/inscription en négatif/);
  });
});

/**
 * QUATRIÈME TOUR, BLOQUANT 2 · `extourner` ne voyait pas ce que le cabinet
 * avait déjà passé à la main.
 */
describe('BLOQUANT 2 · la contre-passation par le module n’est plus aveugle', () => {
  it('sm · OD manuelle exacte en N+1, non déclarée · « Contre-passer » refusé, « déclarez-la », rien écrit ; le 411 reste juste (2 400 000, et non 1 900 000)', async () => {
    const ecritures = [AN_N1, OD];
    const { svc, creer } = monter({ ecritures });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(
      /déjà contre-passé à la main · pièce n° 7 du 2027-01-01 l'inverse exactement\. Déclarez cette écriture/,
    );
    expect(creer).not.toHaveBeenCalled();
    expect(soldeFinal411(ecritures, creer)).toBe(2_400_000);
  });

  it('sk · une seule OD en N+2 pour N et N+1 (900 000) · « Contre-passer » refusé, l’OD nommée, l’issue · la corriger, une contre-passation par réévaluation', async () => {
    const exercices: Exo[] = [N, { ...N1, statut: 'CLOTURE' }, N2];
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
    const m = monter({ exercices, ecritures: [AN_N2, groupee] });
    await expect(m.svc.extourner('t', 'u', 'r1', 'e28')).rejects.toThrow(
      /touchent déjà le 478 ou le 479 de l'écart de la réévaluation du 2026-12-31 \(pièce n° 21 du 2028-01-01\)[\s\S]*plusieurs réévaluations à la fois ne se déclare pas · corrigez-la, puis contre-passez chaque réévaluation séparément/,
    );
    expect(m.creer).not.toHaveBeenCalled();
    // La déclaration est refusée, sans renvoyer au module ; l'écran dit ce que le serveur sert.
    await expect(m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od-groupee', 'motif')).rejects.toThrow(/n'inverse pas exactement/);
    await m.svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od-groupee', 'motif').catch((e: Error) => expect(e.message).not.toMatch(/par le module/));
    const lues = await m.svc.candidatesContrePassationManuelle('t', 'r1');
    expect(lues.candidates).toEqual([]);
    expect(lues.motifHorsModule).toMatch(/pièce n° 21 du 2028-01-01[\s\S]*Corrigez-les par inscription en négatif/);

    // L'issue suivie · l'OD corrigée par son négatif, la paire ne gêne plus ; N se contre-passe (500 000), N+1 de même (400 000).
    const corrigee = { ...groupee, correction: { numeroPiece: 22 } };
    const negatif: EcritureFaite = { ...groupee, id: 'neg-groupee', numeroPiece: 22, corrige: { id: 'od-groupee', numeroPiece: 21 }, lignes: groupee.lignes.map((x) => ({ ...x, debit: -x.debit, credit: -x.credit })) };
    const apres = monter({ exercices, ecritures: [AN_N2, corrigee, negatif] });
    await apres.svc.extourner('t', 'u', 'r1', 'e28');
    const cpN = (apres.creer.mock.calls[0][2] as { lignes: { compteId: string; debit?: number; credit?: number }[] }).lignes;
    // Le 411 de N+2 · à-nouveau 2 900 000, OD et négatif (0), contre-passation de N (−500 000), celle de N+1 (−400 000), écart de N+2 depuis le coût (+600 000).
    const cpN411 = cpN.filter((x) => x.compteId === 'c-4111').reduce((t, x) => t + (x.debit ?? 0) - (x.credit ?? 0), 0);
    expect(2_900_000 + 0 + cpN411 - 400_000 + 600_000).toBe(2_600_000);
  });

  it('une OD partielle sur le 4791 (300 000) · refusée, nommée ; jamais « contre-passez par le module »', async () => {
    const partielle: EcritureFaite = { ...OD, id: 'part', numeroPiece: 9, lignes: [l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)] };
    const { svc, creer } = monter({ ecritures: [AN_N1, partielle] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/pièce n° 9 du 2027-01-01[\s\S]*Corrigez-les par inscription en négatif/);
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
    const { svc, creer } = monter({ ecritures: [IMPORT_NET] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(
      /ne porte pas l'écart de conversion de la réévaluation du 2026-12-31[\s\S]*\(AUDCIF art\. 34\)[\s\S]*Rétablissez l'écart par une OD à l'ouverture \(41110000 au débit de 500000\.00, 47910000 au crédit de 500000\.00\), puis contre-passez/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('au SYCEBNL, la correspondance se cite à son art. 16, 4) (son art. 3 écarte l’art. 34 de l’AUDCIF)', async () => {
    const { svc } = monter({ ecritures: [IMPORT_NET], referentiel: 'SYCEBNL' });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/\(SYCEBNL art\. 16, 4\)\)/);
  });

  it('l’OD de rétablissement passée (D 4111 / C 4791 de l’écart) · « Contre-passer » admis, le net est nul', async () => {
    const retablissement: EcritureFaite = { id: 'retab', exercice: N1, numeroPiece: 2, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ ecritures: [IMPORT_NET, retablissement] });
    await svc.extourner('t', 'u', 'r1', 'e27');
    expect(creer).toHaveBeenCalled();
  });

  it('la même OD sur une ouverture qui PORTE déjà l’écart (sh1 non corrigé) · refusée, elle le doublerait', async () => {
    const faux: EcritureFaite = { id: 'faux', exercice: N1, numeroPiece: 3, lignes: [l('c-4111', '41110000', 500_000, 0), l('c-4791', '47910000', 0, 500_000)] };
    const { svc, creer } = monter({ ecritures: [AN_N1, faux] });
    await expect(svc.extourner('t', 'u', 'r1', 'e27')).rejects.toThrow(/pièce n° 3 du 2027-01-01[\s\S]*Corrigez-les/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('les écritures candidates', () => {
  it('celles des exercices où la contre-passation est à sa place, qui inversent exactement · une autre OD sur le 4791 écartée', async () => {
    const autre: EcritureFaite = { id: 'od2', exercice: N1, lignes: [l('c-4791', '47910000', 200_000, 0), l('c-4111', '41110000', 0, 200_000)] };
    const plusLoin: EcritureFaite = { ...OD, id: 'od3', exercice: N2 };
    const { svc, prisma } = monter({ ecritures: [AN_N1, OD, autre, plusLoin] });
    const r = await svc.candidatesContrePassationManuelle('t', 'r1');
    expect(r.montants).toBe('41110000 au crédit de 500000.00, 47910000 au débit de 500000.00');
    expect(r.candidates.map((c) => c.id)).toEqual(['od']);
    expect(r.tronque).toBe(false);
    // Lues par le compte d'écart, hors module, dans N+1 seul · le premier exercice ouvert après la réévaluation.
    const lecture = prisma.ligneEcriture.findMany.mock.calls.find((c) => c[0].where.ecriture?.estGenereeParCloture === false)![0];
    expect(lecture.where).toMatchObject({
      compteId: { in: ['c-4791'] },
      ecriture: { exerciceId: { in: ['e27'] }, corrigeEcritureId: null, correction: { is: null }, reevaluationExtourne: { is: null } },
    });
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
