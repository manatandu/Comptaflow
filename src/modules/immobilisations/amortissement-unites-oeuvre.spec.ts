import { readFileSync } from 'fs';
import { join } from 'path';
import { ModeAmortissement, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AMORTISSEMENT AUX UNITÉS D'ŒUVRE · AUDCIF art. 45.
 *
 * L'article nomme le mode : « le mode des unités de production / unités
 * d'œuvre (nombre de pièces, heures de fonctionnement, kilomètres, heures de
 * travail…) : charge basée sur l'utilisation ou la production prévue ». Il
 * n'est PAS exclu par le SYCEBNL · son art. 3 écarte les articles 5, 8, 10 à
 * 13, 17 al. 7 et 8, 18, 19 4e tiret, 21, 25 à 34, 49, 69, 70, 71 et 73 à 113,
 * et l'art. 45 n'y figure pas. Le mode vaut donc des deux côtés.
 *
 * LE GLOSSAIRE DONNE LA FORMULE, et rien de plus : « AD = base amortissable ×
 * (nombre d'unités d'œuvre consommées) / (total d'unités d'œuvre prévues) ».
 *
 * DEUX PIÈGES, ET CE FICHIER LES FIGE.
 *
 *  1. AUCUN PRORATA TEMPORIS NE S'Y AJOUTE. Le rapport porte déjà la période :
 *     les unités consommées sont celles de l'exercice, pas celles d'une année
 *     pleine. Proratiser par-dessus amputerait la première annuité une seconde
 *     fois · un camion mis en service en octobre qui a roulé 9 000 km a bien
 *     roulé 9 000 km, pas 9 000 × 3/12.
 *  2. LES UNITÉS NE SONT DANS AUCUN LIVRE. Une durée se déduit d'une date ;
 *     des kilomètres ne se déduisent de rien. Le module refuse de doter tant
 *     que le relevé n'a pas été saisi · supposer zéro ferait passer un exercice
 *     sans relevé pour un exercice sans usage.
 */

type Faux = Record<string, unknown>;

interface Cas {
  valeurOrigine: number;
  valeurResiduelle?: number;
  dureeAns?: number;
  dateMiseEnService?: string;
  unitesOeuvrePrevues?: number;
  /** Le relevé de CET exercice · absent = aucun relevé saisi. */
  consommees?: number;
  /** Les relevés des exercices antérieurs, pour le ré-étalement. */
  consommeesAnterieures?: number;
  depreciations?: Array<{ sens: 'DOTATION' | 'REPRISE'; montant: number; exercice: { dateFin: Date } }>;
  mode?: ModeAmortissement;
}

async function dotation(c: Cas): Promise<number> {
  const exercice = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
  let montant = 0;
  const consommations = [
    ...(c.consommees !== undefined
      ? [{ exerciceId: 'exN', unitesConsommees: c.consommees, exercice: { dateFin: exercice.dateFin } }]
      : []),
    ...(c.consommeesAnterieures
      ? [
          {
            exerciceId: 'exN1',
            unitesConsommees: c.consommeesAnterieures,
            exercice: { dateFin: new Date('2025-12-31') },
          },
        ]
      : []),
  ];
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'i1',
        designation: 'Camion',
        statut: 'EN_SERVICE',
        valeurOrigine: c.valeurOrigine,
        valeurResiduelle: c.valeurResiduelle ?? 0,
        dureeAmortissementAns: c.dureeAns ?? 5,
        dateMiseEnService: new Date(c.dateMiseEnService ?? '2026-01-01'),
        amortissementAnterieur: 0,
        modeAmortissement: c.mode ?? ModeAmortissement.UNITES_DOEUVRE,
        unitesOeuvrePrevues: c.unitesOeuvrePrevues ?? 400_000,
        compteDotationId: 'cd',
        compteAmortissementId: 'ca',
        dotations: [],
        depreciations: c.depreciations ?? [],
      }),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'exN', ...exercice }) },
    consommationUniteOeuvre: { findMany: jest.fn().mockResolvedValue(consommations) },
    dotationAmortissement: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
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

describe('la formule du glossaire, et rien de plus', () => {
  it('AD = base amortissable × consommées / prévues', () => {
    // 60 000 000 sur 400 000 km, 50 000 km parcourus · 7 500 000.
    expect(ImmobilisationService.dotationUnitesOeuvre(60_000_000, 50_000, 400_000)).toBe(7_500_000);
  });

  it('rend zéro sans consommation et sans total prévu · jamais NaN ni Infinity', () => {
    expect(ImmobilisationService.dotationUnitesOeuvre(60_000_000, 0, 400_000)).toBe(0);
    expect(ImmobilisationService.dotationUnitesOeuvre(60_000_000, 50_000, 0)).toBe(0);
    expect(Number.isFinite(ImmobilisationService.dotationUnitesOeuvre(1, 1, 0))).toBe(true);
  });

  it('déduit la valeur résiduelle · c’est la BASE AMORTISSABLE qui est répartie', async () => {
    // (60 000 000 − 10 000 000) × 50 000 / 400 000 = 6 250 000.
    const m = await dotation({ valeurOrigine: 60_000_000, valeurResiduelle: 10_000_000, consommees: 50_000 });
    expect(m).toBe(6_250_000);
  });
});

describe('aucun prorata temporis ne s’ajoute au rapport', () => {
  it('un bien mis en service en octobre reçoit ses unités entières', async () => {
    // Le piège : au linéaire, une mise en service au 5 octobre proratise à
    // 3/12. Ici le relevé porte déjà la période · 9 000 km sont 9 000 km.
    const m = await dotation({
      valeurOrigine: 60_000_000,
      dateMiseEnService: '2026-10-05',
      consommees: 9_000,
    });
    // 60 000 000 × 9 000 / 400 000 = 1 350 000, et non 337 500.
    expect(m).toBe(1_350_000);
  });

  it('le linéaire, lui, proratise bien · c’est la différence que l’on fige', async () => {
    const m = await dotation({
      valeurOrigine: 60_000_000,
      dureeAns: 5,
      dateMiseEnService: '2026-10-05',
      mode: ModeAmortissement.LINEAIRE,
      consommees: 9_000,
    });
    // 60 000 000 / 5 × 3/12 = 3 000 000.
    expect(m).toBe(3_000_000);
  });
});

describe('le reliquat reste la seule borne', () => {
  it('ne dote jamais au-delà de ce qui reste, même sur un usage supérieur au prévu', async () => {
    // 500 000 km parcourus sur 400 000 prévus · le rapport dépasse 1, et le
    // bien ne peut pourtant pas s'amortir plus que sa base.
    const m = await dotation({ valeurOrigine: 60_000_000, consommees: 500_000 });
    expect(m).toBe(60_000_000);
  });
});

describe('le plan se ré-étale après une dépréciation, en unités', () => {
  it('répartit la valeur révisée sur les unités qui RESTENT, pas sur le total', async () => {
    // 60 000 000 sur 400 000 km. 150 000 km déjà parcourus, dépréciation de
    // 10 000 000 · le reliquat de 50 000 000 se répartit sur les 250 000 km
    // restants. 40 000 km cette année · 50 000 000 × 40 000 / 250 000 =
    // 8 000 000, et non 60 000 000 × 40 000 / 400 000 = 6 000 000.
    const m = await dotation({
      valeurOrigine: 60_000_000,
      consommees: 40_000,
      consommeesAnterieures: 150_000,
      depreciations: [{ sens: 'DOTATION', montant: 10_000_000, exercice: { dateFin: new Date('2025-12-31') } }],
    });
    expect(m).toBe(8_000_000);
  });
});

describe('les unités ne sont dans aucun livre', () => {
  it('refuse de doter tant que le relevé n’a pas été saisi', async () => {
    await expect(dotation({ valeurOrigine: 60_000_000 })).rejects.toThrow(/Aucune consommation d’unités d’œuvre|Aucune consommation d'unités d'œuvre/);
  });

  it('le dit dans les termes du problème · le relevé, pas le calcul', async () => {
    await expect(dotation({ valeurOrigine: 60_000_000 })).rejects.toThrow(/compteur|carnet de bord|fiche de production/);
  });

  it('ne réclame rien à un bien amorti linéairement', async () => {
    const m = await dotation({ valeurOrigine: 60_000_000, dureeAns: 5, mode: ModeAmortissement.LINEAIRE });
    expect(m).toBe(12_000_000);
  });
});

describe('le mode ne s’ouvre pas à moitié', () => {
  const refus = (mode: ModeAmortissement, prevues?: number, libelle?: string) =>
    ImmobilisationService.motifRefusUnitesOeuvre(mode, prevues, libelle);

  it('exige le total d’unités prévues · c’est le dénominateur de la formule', () => {
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, undefined, 'kilomètres')).toMatch(/TOTAL D’UNITÉS PRÉVUES|TOTAL D'UNITÉS PRÉVUES/);
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, 0, 'kilomètres')).not.toBeNull();
    // Un total négatif est refusé au même titre · il ne se distingue pas d'un
    // total absent pour un dénominateur.
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, -1, 'kilomètres')).not.toBeNull();
  });

  it('exige de nommer l’unité · un total sans unité ne se vérifie pas', () => {
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, 400_000, undefined)).toMatch(/Nommer l’unité|Nommer l'unité/);
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, 400_000, '   ')).not.toBeNull();
  });

  it('laisse passer un plan complet', () => {
    expect(refus(ModeAmortissement.UNITES_DOEUVRE, 400_000, 'kilomètres')).toBeNull();
  });

  it('refuse des unités posées sur un plan linéaire', () => {
    expect(refus(ModeAmortissement.LINEAIRE, 400_000)).toMatch(/ne se renseignent qu/);
    expect(refus(ModeAmortissement.LINEAIRE, undefined, 'kilomètres')).not.toBeNull();
    expect(refus(ModeAmortissement.LINEAIRE)).toBeNull();
  });
});

describe('ce que l’énumération des modes ne doit jamais porter', () => {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const enumeration = schema.slice(
    schema.indexOf('enum ModeAmortissement {'),
    schema.indexOf('enum StatutImmobilisation'),
  );

  it('n’ouvre que le linéaire et les unités d’œuvre', () => {
    const valeurs = [...enumeration.matchAll(/^\s{2}([A-Z_]+)$/gm)].map((m) => m[1]);
    expect(valeurs).toEqual(['LINEAIRE', 'UNITES_DOEUVRE']);
  });

  it('ne porte aucun des deux modes que l’art. 45 interdit', () => {
    // « Un mode d'amortissement basé sur les REVENUS générés par
    // l'utilisation de l'actif est interdit pour les immobilisations
    // corporelles. De même, l'amortissement FINANCIER · amortir une
    // immobilisation au même rythme que le coût de son financement · n'est
    // pas autorisé. »
    const valeurs = [...enumeration.matchAll(/^\s{2}([A-Z_]+)$/gm)].map((m) => m[1]);
    expect(valeurs.some((v) => /REVENU|CHIFFRE_AFFAIRES|FINANCIER/.test(v))).toBe(false);
  });
});
