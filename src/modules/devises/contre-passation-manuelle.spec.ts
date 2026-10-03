import { Prisma } from '@prisma/client';
import { DevisesService } from './devises.service';
import {
  disponibilitesInversees,
  libelleMontantsAContrePasser,
  montantsAContrePasser,
  motifRefusInversion,
  type LigneAContrePasser,
} from './contre-passation-manuelle';
import { estDisponibilite } from './ecarts-disponibilites';

/**
 * A5 BIS, TROISIÈME TOUR · UNE CONTRE-PASSATION FAITE À LA MAIN SE DÉCLARE.
 *
 * Le portillon juge toutes les réévaluations antérieures · une
 * contre-passation passée hors du module, par une OD du cabinet, les aurait
 * toutes bloquées, et la seule issue (contre-passer par le module)
 * l'inversait une seconde fois. Le cabinet DÉSIGNE l'écriture, avec un motif ;
 * le serveur vérifie qu'elle inverse exactement, au centime, chaque compte de
 * l'écart de conversion (Guide, Partie 2 ch. 22, Application 84,
 * « Contrepassation de l'écart au 01/01/N+1 : 411 · 4781 » ; Application 85,
 * « 4793 · 4812 »), à la place où le module l'aurait posée, sans lien avec une
 * autre réévaluation, dans le même dossier.
 *
 * Jeu d'essai · réévaluation de N au 31/12/2026 · créance de 1 000 USD
 * (D 411 / C 4791 de 500 000) et banque (D 5211 / C 776 de 100 000, écart
 * réalisé, AUDCIF art. 57, jamais contre-passé).
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

  it('les montants à contre-passer · dans le sens de la contre-passation', () => {
    expect(libelleMontantsAContrePasser(attendus)).toBe('41110000 au crédit de 500000.00, 47910000 au débit de 500000.00');
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

  it('partielle ou débordante · refusée, compte par compte, l’issue dite', () => {
    const partielle = enLignes([l('c-4791', '47910000', 300_000, 0), l('c-4111', '41110000', 0, 300_000)]);
    expect(motifRefusInversion(attendus, partielle)).toMatch(
      /41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 300000\.00 ; 47910000 · attendu débit de 500000\.00, l'écriture porte débit de 300000\.00/,
    );
    const debordante = enLignes([l('c-4791', '47910000', 500_000, 0), l('c-4111', '41110000', 0, 600_000), l('c-x', '70110000', 100_000, 0)]);
    expect(motifRefusInversion(attendus, debordante)).toMatch(/41110000 · attendu crédit de 500000\.00, l'écriture porte crédit de 600000\.00/);
    expect(motifRefusInversion(attendus, [])).toMatch(/41110000 · attendu crédit de 500000\.00, l'écriture porte rien/);
    expect(motifRefusInversion(attendus, partielle)).toMatch(/passez la contre-passation par le module/);
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
  correction?: { numeroPiece: number } | null;
  reevaluationExtourne?: { id: string } | null;
  reevaluationContrePassationDeclaree?: { id: string } | null;
}

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
    const f = filtre as Record<string, Date>;
    const t = (valeur as Date).getTime();
    if (f.gt && !(t > f.gt.getTime())) return false;
    if (f.gte && !(t >= f.gte.getTime())) return false;
    if (f.lt && !(t < f.lt.getTime())) return false;
    return true;
  }
  return valeur === filtre;
}

function monter(
  p: {
    exercices?: Exo[];
    ecritures?: EcritureFaite[];
    reeval?: Record<string, unknown>;
    appui?: { dateReevaluation: Date } | null;
    updateEchoue?: unknown;
    lignesDuDossier?: Array<{ ecritureId: string; compteId: string; debit: number; credit: number }>;
  } = {},
) {
  const exercices = p.exercices ?? [N, N1, N2];
  const ecritures = p.ecritures ?? [OD];
  const reeval = {
    id: 'r1',
    dateReevaluation: N.dateFin,
    annuleeLe: null,
    ecritureExtourneId: null,
    ecritureExtourne: null,
    contrePassationDeclareeId: null,
    contrePassationDeclaree: null,
    exercice: { id: N.id, dateDebut: N.dateDebut, dateFin: N.dateFin },
    ecritureEcarts: { lignes: ECARTS_N },
    ...p.reeval,
  };
  const filtrer = (where: Record<string, unknown> = {}) =>
    exercices.filter((e) => correspond(e.dateDebut, where.dateDebut) && correspond(e.statut, where.statut));
  const trier = (liste: Exo[]) => [...liste].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
  const update = jest.fn(async () => {
    if (p.updateEchoue) throw p.updateEchoue;
    return { id: 'r1' };
  });
  const appuiFindFirst = jest.fn(async (_a: { where: Record<string, unknown> }) => p.appui ?? null);
  const prisma = {
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
          reevaluationEcarts: null,
          reevaluationProvision: null,
          reevaluationExtourne: e.reevaluationExtourne ?? null,
          reevaluationContrePassationDeclaree: e.reevaluationContrePassationDeclaree ?? null,
          lignes: e.lignes,
        };
      }),
      findMany: jest.fn(async (a: { where: { id: { in: string[] } } }) =>
        ecritures
          .filter((e) => a.where.id.in.includes(e.id))
          .map((e) => ({ id: e.id, numeroPiece: e.numeroPiece ?? 1, date: e.exercice.dateDebut, libelle: 'OD', statut: 'VALIDEE', journal: { code: 'OD' }, exercice: e.exercice })),
      ),
    },
    ligneEcriture: {
      findMany: jest.fn(async (a: { where: { compteId: string | { in: string[] }; ecritureId?: { in: string[] }; ecriture?: { exerciceId?: { in: string[] } } } }) => {
        const toutes = ecritures.flatMap((e) => e.lignes.map((x) => ({ ecritureId: e.id, exerciceId: e.exercice.id, compteId: x.compteId, debit: x.debit, credit: x.credit })));
        return toutes.filter(
          (x) =>
            (typeof a.where.compteId === 'string' ? x.compteId === a.where.compteId : a.where.compteId.in.includes(x.compteId)) &&
            (!a.where.ecritureId || a.where.ecritureId.in.includes(x.ecritureId)) &&
            (!a.where.ecriture?.exerciceId || a.where.ecriture.exerciceId.in.includes(x.exerciceId)),
        );
      }),
    },
    exercice: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => trier(filtrer(a.where))[0] ?? null),
      findMany: jest.fn(async (a: { where: Record<string, unknown> }) => trier(filtrer(a.where))),
    },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
  };
  return { svc: new DevisesService(prisma as never, {} as never), update, prisma, appuiFindFirst };
}

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
    const { svc, update } = monter({ ecritures: [partielle] });
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
    await expect(monter({ ecritures: [dansN2] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
      /celui du 2027-01-01 au 2027-12-31/,
    );
  });

  it('en N+2, N+1 clôturé · à sa place, déclarée', async () => {
    const dansN2: EcritureFaite = { ...OD, exercice: N2 };
    const { svc, update } = monter({ exercices: [N, { ...N1, statut: 'CLOTURE' }, N2], ecritures: [dansN2] });
    await svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif');
    expect(update).toHaveBeenCalled();
  });

  it('écriture d’un autre dossier · introuvable', async () => {
    const etrangere: EcritureFaite = { ...OD, tenantId: 'autre' };
    await expect(monter({ ecritures: [etrangere] }).svc.declarerContrePassationManuelle('t', 'u', 'r1', 'od', 'motif')).rejects.toThrow(
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
      const { svc, update } = monter({ ecritures: [{ ...OD, ...defaut }] });
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
});

describe('les écritures candidates', () => {
  it('celles des exercices où la contre-passation est à sa place, qui inversent exactement · une autre OD sur le 4791 écartée', async () => {
    const autre: EcritureFaite = { id: 'od2', exercice: N1, lignes: [l('c-4791', '47910000', 200_000, 0), l('c-4111', '41110000', 0, 200_000)] };
    const plusLoin: EcritureFaite = { ...OD, id: 'od3', exercice: N2 };
    const { svc, prisma } = monter({ ecritures: [OD, autre, plusLoin] });
    const r = await svc.candidatesContrePassationManuelle('t', 'r1');
    expect(r.montants).toBe('41110000 au crédit de 500000.00, 47910000 au débit de 500000.00');
    expect(r.candidates.map((c) => c.id)).toEqual(['od']);
    expect(r.tronque).toBe(false);
    // Lues par le compte d'écart (le pivot), dans N+1 seul · le premier exercice ouvert après la réévaluation.
    expect(prisma.ligneEcriture.findMany.mock.calls[0][0].where).toMatchObject({ compteId: 'c-4791', ecriture: { exerciceId: { in: ['e27'] } } });
  });
});

describe('retirer la déclaration', () => {
  const declaree = { contrePassationDeclareeId: 'od', contrePassationDeclaree: { numeroPiece: 7, exercice: { dateDebut: N1.dateDebut } } };

  it('aucune réévaluation postérieure ne s’y est appuyée · retirée par un `update` unitaire filtré sur l’écriture déclarée', async () => {
    const { svc, update, appuiFindFirst } = monter({ reeval: declaree });
    await svc.retirerContrePassationManuelle('t', 'r1');
    expect(appuiFindFirst.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't', annuleeLe: null, id: { not: 'r1' }, exercice: { dateDebut: { gte: N1.dateDebut } } },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't', contrePassationDeclareeId: 'od' },
      data: { contrePassationDeclareeId: null, motifContrePassationDeclaree: null, contrePassationDeclareeLe: null, contrePassationDeclareePar: null },
    });
  });

  it('la réévaluation de N+1 s’y est appuyée · refus nommé, l’issue dite (l’annuler d’abord)', async () => {
    const { svc, update } = monter({ reeval: declaree, appui: { dateReevaluation: N1.dateFin } });
    await expect(svc.retirerContrePassationManuelle('t', 'r1')).rejects.toThrow(
      /La réévaluation du 2027-12-31 a été calculée avec cette contre-passation en place · annulez-la d'abord/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rien de déclaré · refus nommé', async () => {
    await expect(monter().svc.retirerContrePassationManuelle('t', 'r1')).rejects.toThrow(/Aucune contre-passation manuelle n'est déclarée/);
  });
});
