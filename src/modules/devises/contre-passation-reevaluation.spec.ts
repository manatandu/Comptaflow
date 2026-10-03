import { Prisma } from '@prisma/client';
import { DevisesService } from './devises.service';
import { partagerLignesDEcarts } from './ecarts-disponibilites';

/**
 * LA CONTRE-PASSATION DES ÉCARTS DE CONVERSION · « à l'ouverture de l'exercice
 * SUIVANT ». L'écran servait tout exercice ouvert autre que le courant, et le
 * serveur l'acceptait · une extourne posée sur un exercice antérieur annulait
 * la réévaluation dans la période même où elle avait été constatée, écriture
 * équilibrée, balance bouclée.
 *
 * ET LES DISPONIBILITÉS N'EN SONT PAS (ligne A5 bis) · AUDCIF art. 57, leur
 * écart est inscrit « directement dans les produits et charges de
 * l'exercice » ; Application 86 du Guide, 676 / 5215 sans contre-passation.
 * Seuls le 478, le 479 et le compte de tiers qu'ils ajustent se
 * contre-passent (Application 84 · « 411 · 4781 » au 01/01/N+1 ; Application 85 ·
 * « 4793 · 4812 »).
 *
 * RELECTURE ADVERSE D'A5 BIS · l'exercice qui suit IMMÉDIATEMENT et lui seul
 * (M1) ; la première période close reportée au premier jour ouvert (B3) ; la
 * contre-passation INTÉGRALE par exception nommée (B2, M2) ; sous le verrou,
 * lien par un `update` unitaire (M6) ; une contre-passation mal placée
 * s'annule (M1).
 */

interface LigneFaite {
  compteId: string;
  numero: string;
  debit: number;
  credit: number;
}

const ligne = (l: LigneFaite) => ({ compteId: l.compteId, debit: l.debit, credit: l.credit, libelle: null, compte: { numero: l.numero } });

/**
 * Caisse de 1 000 USD (5712) et créance client de 1 000 USD (4111) réévaluées
 * au 31/12 · cours historique 2 800, clôture 2 500 · perte de 300 000 sur
 * chacune. Comptes pris tels que `reevaluer` les sert au SYSCOHADA · 4781
 * « diminution des créances d'exploitation », 676 « Pertes de change
 * financières ».
 */
const CAISSE_ET_CREANCE: LigneFaite[] = [
  { compteId: 'c-4781', numero: '47810000', debit: 300_000, credit: 0 },
  { compteId: 'c-4111', numero: '41110000', debit: 0, credit: 300_000 },
  { compteId: 'c-676', numero: '67600000', debit: 300_000, credit: 0 },
  { compteId: 'c-5712', numero: '57120000', debit: 0, credit: 300_000 },
];

interface Exo {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  statut: string;
}
const N: Exo = { id: 'n', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' };
const N1: Exo = { id: 'e', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' };
const N2: Exo = { id: 'e2', dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31'), statut: 'OUVERT' };

/** Une réévaluation déjà passée dans un exercice suivant, dans l'un ou l'autre régime. */
interface AutreReevaluation {
  exerciceId: string;
  /** Nul · passée sous l'ancien régime (avant A5 bis). */
  ecartsDisponibilites: unknown;
}

function monter(
  dateDebutSuivant: string,
  lignes: LigneFaite[] = [
    { compteId: 'c1', numero: '41110000', debit: 100, credit: 0 },
    { compteId: 'c2', numero: '47910000', debit: 0, credit: 100 },
  ],
  options: { ecartsDisponibilites?: unknown; exercices?: Exo[]; autres?: AutreReevaluation[]; updateEchoue?: unknown; declaree?: boolean } = {},
) {
  // L'exercice choisi pour la contre-passation · `e`, à la date donnée.
  const exercices = options.exercices ?? [N, { ...N1, dateDebut: new Date(dateDebutSuivant) }];
  const creer = jest.fn().mockResolvedValue({ id: 'ex' });
  const retirerCompensation = jest.fn();
  const update = jest.fn(async (_a: { where: unknown; data: Record<string, unknown> }) => {
    if (options.updateEchoue) throw options.updateEchoue;
    return { id: 'r1' };
  });
  const prisma = {
    reevaluation: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => {
        if (a.where.id === 'r1') {
          return {
            id: 'r1',
            exerciceId: 'n',
            exercice: { dateFin: N.dateFin },
            dateReevaluation: new Date('2026-12-31'),
            ecritureExtourneId: null,
            contrePassationDeclareeId: options.declaree ? 'od' : null,
            coursUtilises: null,
            ecartsDisponibilites: options.ecartsDisponibilites ?? null,
            ecritureEcarts: { lignes: lignes.map(ligne) },
          };
        }
        // La réévaluation de l'exercice qui reçoit la contre-passation (B2).
        const filtreJson = a.where.ecartsDisponibilites as { equals?: unknown } | undefined;
        return (
          (options.autres ?? []).find(
            (r) =>
              r.exerciceId === a.where.exerciceId &&
              (filtreJson?.equals !== Prisma.DbNull || r.ecartsDisponibilites === null || r.ecartsDisponibilites === undefined),
          ) ?? null
        );
      }),
      update,
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r1' }),
      // L'état · la seule réévaluation en place est celle-ci.
      findMany: jest.fn().mockResolvedValue([{ id: 'r1', ecritureExtourne: null, contrePassationDeclaree: null, ecritureEcarts: { lignes: lignes.map(ligne) } }]),
    },
    exercice: {
      findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => {
        if (typeof a.where.id === 'string') return exercices.find((x) => x.id === a.where.id) ?? null;
        // La cible (B-II) · le premier exercice OUVERT qui commence après la réévaluation.
        const apres = (a.where.dateDebut as { gt: Date }).gt.getTime();
        return (
          [...exercices]
            .sort((x, y) => x.dateDebut.getTime() - y.dateDebut.getTime())
            .find((x) => x.dateDebut.getTime() > apres && (a.where.statut === undefined || x.statut === a.where.statut)) ?? null
        );
      }),
      // L'état de l'écart (cinquième tour, `etatDeLEcart`) · la doublure
      // honore le filtre de date et l'ordre ; la règle a son propre spec
      // (`contre-passation-manuelle.spec.ts`).
      findMany: jest.fn(async (a: { where: { dateDebut?: { gt?: Date; lte?: Date } }; orderBy?: { dateDebut?: 'asc' | 'desc' } }) =>
        [...exercices]
          .filter(
            (x) =>
              (!a.where.dateDebut?.gt || x.dateDebut.getTime() > a.where.dateDebut.gt.getTime()) &&
              (!a.where.dateDebut?.lte || x.dateDebut.getTime() <= a.where.dateDebut.lte.getTime()),
          )
          .sort((x, y) => (a.orderBy?.dateDebut === 'desc' ? -1 : 1) * (x.dateDebut.getTime() - y.dateDebut.getTime())),
      ),
    },
    // L'état · aucune ouverture fiable, aucune écriture hors module ; le 478
    // ou le 479 porte l'écart de la réévaluation, en place.
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: {
      groupBy: jest.fn(async (a: { where: { compteId: { in: string[] } } }) =>
        lignes
          .filter((x) => a.where.compteId.in.includes(x.compteId))
          .map((x) => ({ compteId: x.compteId, _sum: { debit: x.debit, credit: x.credit } })),
      ),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od' }) },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
  };
  return {
    svc: new DevisesService(prisma as never, { creer, retirerCompensation } as never),
    creer,
    update,
    retirerCompensation,
    prisma,
  };
}

const equilibree = (lignes: { debit?: number; credit?: number }[]) =>
  Math.abs(lignes.reduce((t, l) => t + (l.debit ?? 0) - (l.credit ?? 0), 0)) < 0.005;

describe('contre-passation de la réévaluation', () => {
  it('sur l’exercice qui suit · passée à son ouverture, sens inverse', async () => {
    const { svc, creer } = monter('2027-01-01');
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(creer.mock.calls[0][2]).toMatchObject({ date: '2027-01-01', lignes: [{ compteId: 'c1', credit: 100 }, { compteId: 'c2', debit: 100 }] });
  });

  it('sur un exercice antérieur ou celui de la réévaluation · refusée avant toute écriture', async () => {
    for (const debut of ['2025-01-01', '2026-01-01']) {
      const { svc, creer } = monter(debut);
      await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/exercice suivant/);
      expect(creer).not.toHaveBeenCalled();
    }
  });

  it('M1 · sur un exercice plus lointain que celui qui suit immédiatement, ouvert · refusée, la cible nommée, rien passé', async () => {
    const { svc, creer } = monter('2027-01-01', undefined, { exercices: [N, N1, N2] });
    await expect(svc.extourner('t', 'u', 'r1', 'e2')).rejects.toThrow(
      /premier exercice ouvert qui suit la réévaluation, celui du 2027-01-01 au 2027-12-31/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('B-II · l’exercice qui suit est clôturé · la contre-passation va au premier exercice ouvert après lui', async () => {
    const { svc, creer } = monter('2027-01-01', undefined, { exercices: [N, { ...N1, statut: 'CLOTURE' }, N2] });
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/celui du 2028-01-01 au 2028-12-31/);
    await svc.extourner('t', 'u', 'r1', 'e2');
    expect(creer.mock.calls[0][2]).toMatchObject({ exerciceId: 'e2', date: '2028-01-01' });
  });

  it('B-II · aucun exercice ouvert après la réévaluation · refus nommé, l’issue dite', async () => {
    const { svc, creer } = monter('2027-01-01', undefined, { exercices: [N, { ...N1, statut: 'CLOTURE' }] });
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/Aucun exercice ouvert après celui de la réévaluation/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('B3 · la première période close reporte la pièce au premier jour ouvert (AUDCIF art. 22, 4°) · demandé à chaque contre-passation', async () => {
    const { svc, creer } = monter('2027-01-01');
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(creer.mock.calls[0][2]).toMatchObject({ reporterAuPremierJourOuvert: true });
  });

  it('M6 · lien par un `update` unitaire sur une réévaluation encore libre ; perdu de vitesse, la pièce est retirée et 409', async () => {
    const { svc, update } = monter('2027-01-01');
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't', AND: [{ ecritureExtourneId: null }, { contrePassationDeclareeId: null }] },
      data: { ecritureExtourneId: 'ex', contrePassationIntegrale: null },
    });
    const course = new Prisma.PrismaClientKnownRequestError('perdu', { code: 'P2025', clientVersion: 'x' });
    const perdu = monter('2027-01-01', undefined, { updateEchoue: course });
    await expect(perdu.svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/déjà été extournée/);
    expect(perdu.retirerCompensation).toHaveBeenCalledWith('t', 'ex');
  });
});

describe('troisième tour · une réévaluation contre-passée À LA MAIN et déclarée', () => {
  it('ne se contre-passe pas une seconde fois par le module · refus nommé, rien écrit', async () => {
    const { svc, creer } = monter('2027-01-01', undefined, { declaree: true });
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/déjà contre-passée par une écriture manuelle déclarée/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('A5 bis · la contre-passation ne touche pas les disponibilités (AUDCIF art. 57)', () => {
  it('caisse et créance en USD · seuls le 4781 et le 4111 sont inversés, la caisse et son 676 restent, écriture équilibrée', async () => {
    const { svc, creer } = monter('2027-01-01', CAISSE_ET_CREANCE);
    const r = await svc.extourner('t', 'u', 'r1', 'e');
    const lignes = creer.mock.calls[0][2].lignes as { compteId: string; debit?: number; credit?: number }[];
    expect(lignes).toEqual([
      expect.objectContaining({ compteId: 'c-4781', credit: 300_000 }),
      expect.objectContaining({ compteId: 'c-4111', debit: 300_000 }),
    ]);
    expect(lignes.map((l) => l.compteId)).not.toContain('c-5712');
    expect(lignes.map((l) => l.compteId)).not.toContain('c-676');
    expect(equilibree(lignes)).toBe(true);
    expect(r.avertissement).toBeNull();
  });

  it('les cinq racines de disponibilités et le 776 restent hors de la contre-passation', () => {
    const lignes = [
      { compteNumero: '52150000', debit: 10, credit: 0 },
      { compteNumero: '53100000', debit: 10, credit: 0 },
      { compteNumero: '55100000', debit: 10, credit: 0 },
      { compteNumero: '57120000', debit: 10, credit: 0 },
      { compteNumero: '58500000', debit: 10, credit: 0 },
      { compteNumero: '77600000', debit: 0, credit: 50 },
      { compteNumero: '40110000', debit: 7, credit: 0 },
      { compteNumero: '47930000', debit: 0, credit: 7 },
      // Un découvert (56) est une DETTE · son écart est latent, il se contre-passe.
      { compteNumero: '56100000', debit: 3, credit: 0 },
      { compteNumero: '47940000', debit: 0, credit: 3 },
    ];
    const partage = partagerLignesDEcarts(lignes);
    expect(partage.motifRefus).toBeNull();
    expect(partage.aContrePasser.map((l) => l.compteNumero)).toEqual(['40110000', '47930000', '56100000', '47940000']);
    expect(partage.realisees).toHaveLength(6);
  });

  const retouchee = (): LigneFaite[] => {
    const l = CAISSE_ET_CREANCE.map((x) => (x.compteId === 'c-676' ? { ...x, debit: 250_000 } : x));
    l.push({ compteId: 'c-4111b', numero: '41110000', debit: 50_000, credit: 0 });
    return l;
  };

  it('M2 · une écriture des écarts qui ne se partage pas · refusée, l’issue (contre-passation intégrale) nommée, rien passé', async () => {
    const { svc, creer } = monter('2027-01-01', retouchee());
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/deux parts équilibrées[\s\S]*contre-passation INTÉGRALE/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('M2 · demandée, la contre-passation INTÉGRALE passe toute l’écriture, le dit au libellé et dans la réponse', async () => {
    const { svc, creer, update } = monter('2027-01-01', retouchee());
    const r = await svc.extourner('t', 'u', 'r1', 'e', { integrale: true });
    const piece = creer.mock.calls[0][2];
    expect(piece.libelle).toMatch(/Contre-passation intégrale .*banque et caisse comprises.*ne se partage pas/);
    expect(piece.lignes).toHaveLength(5);
    expect(equilibree(piece.lignes)).toBe(true);
    expect(update.mock.calls[0][0].data).toEqual({ ecritureExtourneId: 'ex', contrePassationIntegrale: 'PARTAGE_IMPOSSIBLE' });
    expect(r.avertissement).toMatch(/INTÉGRALE demandée/);
  });

  it('M2 · demandée sur une écriture qui se partage · refusée, la banque garde son écart (art. 57)', async () => {
    const { svc, creer } = monter('2027-01-01', CAISSE_ET_CREANCE);
    await expect(svc.extourner('t', 'u', 'r1', 'e', { integrale: true })).rejects.toThrow(/n'est ouverte qu'à une écriture des écarts qui ne se partage pas/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une réévaluation qui ne porte que des disponibilités · rien à contre-passer, refus nommé', async () => {
    const { svc, creer } = monter('2027-01-01', CAISSE_ET_CREANCE.slice(2));
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/art\. 57/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('réévaluation antérieure à A5 bis · rien n’est écrit sur elle, `ecartsDisponibilites` nul dit l’ancien régime (B2)', async () => {
    const { svc, update } = monter('2027-01-01', CAISSE_ET_CREANCE);
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(update.mock.calls[0][0].data).toEqual({ ecritureExtourneId: 'ex', contrePassationIntegrale: null });
  });
});

/**
 * B2 · L'EXERCICE SUIVANT DÉJÀ RÉÉVALUÉ SOUS L'ANCIEN RÉGIME. Banque 52150000
 * au coût historique de 1 364 000 ; N · gain de 100 000 (D 5215 / C 776),
 * créance réévaluée de 50 000 (D 4111 / C 4791) ; N+1, réévalué AVANT A5 bis
 * depuis le coût historique · 1 505 000 − 1 364 000 = 141 000 au 776. La
 * contre-passation de N, passée maintenant, doit inverser AUSSI la banque ·
 * sans quoi elle finit N+1 à 1 605 000 au lieu de 1 505 000, et le gain de
 * N+1 est de 141 000 au lieu de 41 000.
 */
describe('B2 · contre-passation dans un exercice réévalué sous l’ancien régime · intégrale, chiffrée', () => {
  const ECARTS_N: LigneFaite[] = [
    { compteId: 'c-5215', numero: '52150000', debit: 100_000, credit: 0 },
    { compteId: 'c-776', numero: '77600000', debit: 0, credit: 100_000 },
    { compteId: 'c-4111', numero: '41110000', debit: 50_000, credit: 0 },
    { compteId: 'c-4791', numero: '47910000', debit: 0, credit: 50_000 },
  ];
  /** Ce que l'exercice N+1 porte déjà · l'à-nouveau de la banque (écart de N compris) et la réévaluation de l'ancien régime. */
  const N1_AVANT: { compteId: string; debit: number; credit: number }[] = [
    { compteId: 'c-5215', debit: 1_464_000, credit: 0 },
    { compteId: 'c-5215', debit: 141_000, credit: 0 },
    { compteId: 'c-776', debit: 0, credit: 141_000 },
  ];
  const soldes = (lignes: { compteId: string; debit?: number; credit?: number }[]) => {
    const s = new Map<string, number>();
    for (const l of lignes) s.set(l.compteId, (s.get(l.compteId) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0));
    return s;
  };

  it('ancien régime en N+1 · la banque est contre-passée aussi · banque 1 505 000 et gain de 41 000', async () => {
    const { svc, creer, update } = monter('2027-01-01', ECARTS_N, { autres: [{ exerciceId: 'e', ecartsDisponibilites: null }] });
    const r = await svc.extourner('t', 'u', 'r1', 'e');
    const piece = creer.mock.calls[0][2];
    expect(piece.libelle).toMatch(/intégrale .*banque et caisse comprises.*ancien régime/);
    const s = soldes([...N1_AVANT, ...piece.lignes]);
    expect(s.get('c-5215')).toBe(1_505_000);
    expect(-(s.get('c-776') ?? 0)).toBe(41_000);
    expect(update.mock.calls[0][0].data).toEqual({ ecritureExtourneId: 'ex', contrePassationIntegrale: 'EXERCICE_SUIVANT_ANCIEN_REGIME' });
    expect(r.avertissement).toMatch(/réévalué avant A5 bis/);
  });

  it('sans l’exception, la même contre-passation aurait laissé la banque à 1 605 000 et le gain à 141 000 (le défaut que B2 ferme)', async () => {
    const { svc, creer } = monter('2027-01-01', ECARTS_N, { autres: [{ exerciceId: 'e', ecartsDisponibilites: [] }] });
    await svc.extourner('t', 'u', 'r1', 'e');
    const s = soldes([...N1_AVANT, ...creer.mock.calls[0][2].lignes]);
    // N+1 réévalué sous le NOUVEAU régime · il aurait mesuré 41 000 depuis la valeur de clôture de N, pas 141 000 ;
    // la contre-passation partielle est alors la bonne. Le jeu N1_AVANT n'est pas le sien · seule la forme compte ici.
    expect(s.get('c-5215')).toBe(1_605_000);
    expect(-(s.get('c-776') ?? 0)).toBe(141_000);
  });

  it('une réévaluation des seules disponibilités, l’exercice suivant à l’ancien régime · contre-passée intégralement', async () => {
    const { svc, creer } = monter('2027-01-01', ECARTS_N.slice(0, 2), { autres: [{ exerciceId: 'e', ecartsDisponibilites: null }] });
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(creer.mock.calls[0][2].lignes).toEqual([
      expect.objectContaining({ compteId: 'c-5215', credit: 100_000 }),
      expect.objectContaining({ compteId: 'c-776', debit: 100_000 }),
    ]);
  });
});

/**
 * M1 · UNE CONTRE-PASSATION MAL PLACÉE S'ANNULE, pour être repassée à
 * l'ouverture de l'exercice qui suit immédiatement · art. 20, al. 2.
 */
describe('M1 · annuler une contre-passation', () => {
  function monterAnnulation(o: {
    statut: 'BROUILLARD' | 'VALIDEE';
    exerciceClos?: boolean;
    lectrice?: boolean;
    lettree?: boolean;
    countSuppression?: number;
  }) {
    const ecritureExtourne = {
      id: 'cp',
      statut: o.statut,
      numeroPiece: 7,
      exerciceId: 'e2',
      exercice: { statut: o.exerciceClos ? 'CLOTURE' : 'OUVERT' },
      lignes: [{ lettre: o.lettree ? 'AA' : null, lettrageId: o.lettree ? 'l1' : null, rapprochementId: null }],
    };
    const tx = {
      ligneEcriture: {
        findMany: jest.fn().mockResolvedValue(ecritureExtourne.lignes),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      ecriture: {
        findFirst: jest.fn().mockResolvedValue({ statut: o.statut }),
        deleteMany: jest.fn().mockResolvedValue({ count: o.countSuppression ?? 1 }),
      },
      reevaluation: {
        update: jest.fn(async (_a: { where: unknown; data: Record<string, unknown> }) => ({})),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r1' }),
      },
    };
    const prisma = {
      reevaluation: {
        findFirst: jest.fn(async (a: { where: Record<string, unknown> }) =>
          a.where.id === 'r1'
            ? { id: 'r1', dateReevaluation: N.dateFin, annuleeLe: null, annulationsContrePassation: null, ecritureExtourne }
            : o.lectrice
              ? { dateReevaluation: N2.dateFin }
              : null,
        ),
      },
      verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const inscrireEnNegatifPourAnnulation = jest.fn().mockResolvedValue({ id: 'neg', numeroPiece: 9 });
    const svc = new DevisesService(prisma as never, { inscrireEnNegatifPourAnnulation } as never);
    return { svc, tx, prisma, inscrireEnNegatifPourAnnulation };
  }

  it('au brouillard · supprimée (lignes filtrées sur le statut), la réévaluation déliée et la trace gardée', async () => {
    const { svc, tx, inscrireEnNegatifPourAnnulation } = monterAnnulation({ statut: 'BROUILLARD' });
    await svc.annulerContrePassation('t', 'u', 'r1', 'Passée en 2028 au lieu de 2027');
    expect(inscrireEnNegatifPourAnnulation).not.toHaveBeenCalled();
    expect(tx.reevaluation.update).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't', ecritureExtourneId: 'cp' },
      data: expect.objectContaining({
        ecritureExtourneId: null,
        contrePassationIntegrale: null,
        annulationsContrePassation: [expect.objectContaining({ ecritureId: 'cp', traitement: 'SUPPRIMEE', motif: 'Passée en 2028 au lieu de 2027' })],
      }),
    });
    expect(tx.ligneEcriture.deleteMany).toHaveBeenCalledWith({ where: { ecritureId: 'cp', ecriture: { tenantId: 't', statut: 'BROUILLARD' } } });
    expect(tx.ecriture.deleteMany).toHaveBeenCalledWith({ where: { id: 'cp', tenantId: 't', statut: 'BROUILLARD' } });
  });

  it('validée entre-temps · rien n’est supprimé, la transaction tombe en 409', async () => {
    const { svc } = monterAnnulation({ statut: 'BROUILLARD', countSuppression: 0 });
    await expect(svc.annulerContrePassation('t', 'u', 'r1', 'Motif valable')).rejects.toThrow(/validée entre-temps/);
  });

  it('validée · inscrite en négatif dans la transaction, jamais supprimée', async () => {
    const { svc, tx, inscrireEnNegatifPourAnnulation } = monterAnnulation({ statut: 'VALIDEE' });
    await svc.annulerContrePassation('t', 'u', 'r1', 'Motif valable');
    expect(inscrireEnNegatifPourAnnulation).toHaveBeenCalledWith('t', 'u', 'cp', 'Motif valable', tx);
    expect(tx.ecriture.deleteMany).not.toHaveBeenCalled();
    expect(tx.reevaluation.update.mock.calls[0][0].data.annulationsContrePassation).toEqual([
      expect.objectContaining({ traitement: 'INSCRITE_EN_NEGATIF', negatifId: 'neg' }),
    ]);
  });

  it('refus nommés avant toute transaction · exercice clôturé, réévaluation qui l’a lue, ligne lettrée, motif vide', async () => {
    for (const [o, motif] of [
      [{ statut: 'VALIDEE', exerciceClos: true }, /exercice clôturé/],
      [{ statut: 'VALIDEE', lectrice: true }, /annulez-la d'abord/],
      [{ statut: 'VALIDEE', lettree: true }, /lettr/],
    ] as const) {
      const { svc, prisma } = monterAnnulation(o);
      await expect(svc.annulerContrePassation('t', 'u', 'r1', 'Motif valable')).rejects.toThrow(motif);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
    const { svc } = monterAnnulation({ statut: 'BROUILLARD' });
    await expect(svc.annulerContrePassation('t', 'u', 'r1', '  ')).rejects.toThrow(/motif/);
  });
});

/**
 * LA LISTE DIT CE QU'IL RESTE À CONTRE-PASSER (M8) · l'écran n'offre pas de
 * « Contre-passer » à une réévaluation des seules disponibilités, sauf quand
 * l'exercice suivant de l'ancien régime l'impose (B2) ; il offre la
 * contre-passation intégrale à l'écriture qui ne se partage pas (M2) ; il ne
 * propose que l'exercice qui suit immédiatement (M1).
 */
describe('liste des réévaluations · ce qu’il reste à contre-passer', () => {
  function lister(lignes: LigneFaite[], o: { suivantAncienRegime?: boolean; contrePassee?: boolean } = {}) {
    const r = {
      id: 'r1',
      exerciceId: 'n',
      dateReevaluation: N.dateFin,
      createdAt: new Date('2027-01-05'),
      annuleeLe: null,
      ecritureExtourneId: o.contrePassee ? 'cp' : null,
      coursUtilises: null,
      ecartsDisponibilites: [],
      ventilationDisponibilites: null,
      ecritureEcarts: { statut: 'VALIDEE', valideeAt: null, lignes: lignes.map(ligne) },
    };
    const prisma = {
      exercice: {
        findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => (typeof a.where.id === 'string' ? N : N1)),
      },
      reevaluation: {
        findMany: jest.fn().mockResolvedValue([r]),
        findFirst: jest.fn().mockResolvedValue(o.suivantAncienRegime ? { id: 'r-e' } : null),
      },
    };
    return new DevisesService(prisma as never, {} as never).listerReevaluations('t', 'n');
  }

  it('créance et caisse · les écarts de conversion seuls, à l’ouverture de l’exercice qui suit immédiatement', async () => {
    const [r] = await lister(CAISSE_ET_CREANCE);
    expect(r).toMatchObject({ contrePassationAPasser: 'ECARTS_DE_CONVERSION', exerciceDeContrePassation: { id: 'e' } });
  });

  it('seules des disponibilités · rien à contre-passer (art. 57), sauf si l’exercice suivant est de l’ancien régime (B2)', async () => {
    expect((await lister(CAISSE_ET_CREANCE.slice(2)))[0].contrePassationAPasser).toBeNull();
    expect((await lister(CAISSE_ET_CREANCE.slice(2), { suivantAncienRegime: true }))[0].contrePassationAPasser).toBe('INTEGRALE_ANCIEN_REGIME');
  });

  it('écriture qui ne se partage pas · intégrale sur demande (M2) ; déjà contre-passée · rien', async () => {
    const retouchee = [...CAISSE_ET_CREANCE.map((x) => (x.compteId === 'c-676' ? { ...x, debit: 250_000 } : x))];
    retouchee.push({ compteId: 'c-4111b', numero: '41110000', debit: 50_000, credit: 0 });
    expect((await lister(retouchee))[0].contrePassationAPasser).toBe('INTEGRALE_SUR_DEMANDE');
    expect((await lister(CAISSE_ET_CREANCE, { contrePassee: true }))[0].contrePassationAPasser).toBeNull();
  });
});
