import { Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { planFiscalDegressif } from './amortissement-degressif';
import { moisEntre } from '../../common/mois-entre';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F34 · UN PREMIER EXERCICE DE DIX-HUIT MOIS.
 *
 * AUDCIF art. 7 · la durée « peut être supérieure à douze mois pour le premier
 * exercice commencé au cours du deuxième semestre de l'année ». Le logiciel
 * l'admettait, mais la dotation prenait au plus douze mois : un bien en
 * service sur dix-huit mois recevait douze douzièmes, et six mois d'usage
 * glissaient en silence sur la fin du plan. Le plan fiscal dégressif, lui,
 * doit deux annuités à un tel exercice, qui porte deux périodes imposables
 * (loi n° 23/053, art. 12 et 33).
 */

type Faux = Record<string, unknown>;
const LONG = { dateDebut: '2025-07-01', dateFin: '2026-12-31' };

async function dotation(c: {
  dateMiseEnService: string;
  exercice?: { dateDebut: string; dateFin: string };
  amortissementAnterieur?: number;
  smt?: boolean;
}): Promise<number> {
  const exercice = c.exercice ?? LONG;
  let montant = 0;
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: c.smt ? SystemeComptableSyscohada.MINIMAL_TRESORERIE : SystemeComptableSyscohada.NORMAL,
        jeuEtatsFinanciersSycebnl: null,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'i1',
        designation: 'Camion',
        statut: 'EN_SERVICE',
        valeurOrigine: 12_000_000,
        valeurResiduelle: 0,
        dureeAmortissementAns: 5,
        dateMiseEnService: new Date(c.dateMiseEnService),
        amortissementAnterieur: c.amortissementAnterieur ?? 0,
        modeAmortissement: 'LINEAIRE',
        compteDotationId: 'cd',
        compteAmortissementId: 'ca',
        // `trouver` charge le compte du bien · la dotation lit sa nature
        // (comptes-du-bien.ts, bien que le plan ne fait pas amortir).
        compteImmobilisation: { numero: '24510000' },
        dotations: [],
        depreciations: [],
      }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exN',
        dateDebut: new Date(exercice.dateDebut),
        dateFin: new Date(exercice.dateFin),
      }),
    },
    dotationAmortissement: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
    // Lot 14 · aucune réévaluation sur ce bien · la dotation et la dépréciation
    // lisent les lignes de réévaluation avant d'écrire.
    ligneReevaluationBilan: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  } as Faux;
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { lignes: { debit?: number }[] }) => {
      montant = dto.lignes[0].debit ?? 0;
      return Promise.resolve({ id: 'e1' });
    }),
  } as unknown as EcritureService;
  const svc = new ImmobilisationService(prisma as unknown as PrismaService, ecritures);
  await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
  return Math.round(montant * 100) / 100;
}

describe('F34 · le décompte des mois, écrit une fois', () => {
  it('compte les mois traversés, bornes comprises, sans plafond', () => {
    expect(moisEntre(new Date('2026-01-01'), new Date('2026-12-31'))).toBe(12);
    expect(moisEntre(new Date('2025-07-01'), new Date('2026-12-31'))).toBe(18);
    expect(moisEntre(new Date('2026-03-15'), new Date('2026-04-02'))).toBe(2);
    expect(moisEntre(new Date('2026-05-01'), new Date('2026-04-30'))).toBe(0);
  });
});

describe('F34 · la dotation comptable suit la durée de l’exercice', () => {
  // 12 000 000 sur cinq ans · 2 400 000 l'an, 200 000 le mois.
  it('un bien en service dès l’ouverture d’un exercice de dix-huit mois reçoit dix-huit douzièmes', async () => {
    expect(await dotation({ dateMiseEnService: '2025-07-10' })).toBe(3_600_000);
  });

  it('mis en service en mars de la seconde année, de mars à décembre · dix mois', async () => {
    expect(await dotation({ dateMiseEnService: '2026-03-20' })).toBe(2_000_000);
  });

  it('un bien repris dote aussi la période entière, bornée au reliquat', async () => {
    expect(await dotation({ dateMiseEnService: '2020-01-01', amortissementAnterieur: 6_000_000 })).toBe(3_600_000);
    expect(await dotation({ dateMiseEnService: '2020-01-01', amortissementAnterieur: 10_000_000 })).toBe(2_000_000);
  });

  it('un exercice civil garde ses douze mois', async () => {
    expect(
      await dotation({ dateMiseEnService: '2020-01-01', amortissementAnterieur: 1, exercice: { dateDebut: '2027-01-01', dateFin: '2027-12-31' } }),
    ).toBe(2_400_000);
  });

  it('au SMT SYSCOHADA, « sans prorata temporis » garde une annuité par exercice', async () => {
    expect(await dotation({ dateMiseEnService: '2025-07-10', smt: true })).toBe(2_400_000);
  });
});

describe('F34 · le plan fiscal dégressif compte ses périodes imposables', () => {
  const exercices = [
    { id: 'ex1', dateDebut: new Date('2025-07-01'), dateFin: new Date('2026-12-31') },
    { id: 'ex2', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') },
  ];

  it('un exercice de dix-huit mois reçoit deux annuités, la première proratisée', () => {
    // Durée fiscale cinq ans, coefficient 2, taux 40 %. 2025 · six mois,
    // 10 000 000 × 40 % × 6/12 = 2 000 000. 2026 · 8 000 000 × 40 % = 3 200 000.
    const plan = planFiscalDegressif({ base: 10_000_000, dureeFiscaleAns: 5, dateMiseEnService: new Date('2025-07-01'), exercices });
    expect(plan[0]).toMatchObject({ exerciceId: 'ex1', valeurResiduelleDebut: 10_000_000, annuite: 5_200_000 });
    // 2027 · 4 800 000 × 40 % = 1 920 000, au-dessus du linéaire sur 3,5 ans.
    expect(plan[1]).toMatchObject({ exerciceId: 'ex2', valeurResiduelleDebut: 4_800_000, annuite: 1_920_000 });
  });

  it('la bascule en linéaire de l’art. 35 se compte depuis la mise en service, par période', () => {
    const suite = [2028, 2029, 2030].map((a) => ({ id: `ex${a}`, dateDebut: new Date(`${a}-01-01`), dateFin: new Date(`${a}-12-31`) }));
    const plan = planFiscalDegressif({
      base: 10_000_000,
      dureeFiscaleAns: 5,
      dateMiseEnService: new Date('2025-07-01'),
      exercices: [...exercices, ...suite],
    });
    // 2029 · 1 728 000 sur 1,5 an restant = 1 152 000, au-dessus des 691 200
    // du dégressif. 2030 · moins d'un an restant, la valeur résiduelle entière.
    expect(plan.find((l) => l.exerciceId === 'ex2029')).toMatchObject({ annuite: 1_152_000, mode: 'LINEAIRE_ART_35' });
    expect(plan.find((l) => l.exerciceId === 'ex2030')).toMatchObject({ annuite: 576_000, mode: 'LINEAIRE_ART_35' });
    expect(plan.reduce((t, l) => t + l.annuite, 0)).toBeCloseTo(10_000_000, 2);
  });

  it('mis en service pendant la seconde période, une seule annuité, proratisée dans son année', () => {
    const plan = planFiscalDegressif({ base: 10_000_000, dureeFiscaleAns: 5, dateMiseEnService: new Date('2026-04-15'), exercices });
    // Avril à décembre 2026 · neuf mois, 10 000 000 × 40 % × 9/12 = 3 000 000.
    expect(plan[0]).toMatchObject({ exerciceId: 'ex1', annuite: 3_000_000 });
  });

  it('un exercice civil garde une seule période', () => {
    const plan = planFiscalDegressif({
      base: 10_000_000,
      dureeFiscaleAns: 5,
      dateMiseEnService: new Date('2027-01-01'),
      exercices: [exercices[1]],
    });
    expect(plan).toEqual([{ exerciceId: 'ex2', valeurResiduelleDebut: 10_000_000, annuite: 4_000_000, mode: 'DEGRESSIF' }]);
  });
});
