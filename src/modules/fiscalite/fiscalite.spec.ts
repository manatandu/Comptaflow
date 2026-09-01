import { FormeJuridiqueSyscohada, Referentiel, SensRetraitementFiscal, TypeCompteDetailTotal } from '@prisma/client';
import { FiscaliteService } from './fiscalite.service';
import { CATALOGUE_RETRAITEMENTS, CODE_LIBRE } from './catalogue-retraitements';

/**
 * RÉSULTAT FISCAL · ce qui casserait en silence.
 *
 * Un impôt faux ne lève aucune erreur : il se paie, ou se redresse au
 * contrôle. Les cinq règles vérifiées ici sont celles où l'écart entre le
 * texte et l'intuition est le plus grand · le résultat comptable lu dans la
 * bonne source, l'impôt minimum qui prime sur l'impôt théorique, le déficit
 * qui s'impute dans l'ordre et se perd au-delà de trois exercices, le régime
 * qui bascule avec la forme et le chiffre d'affaires, et le refus du SYCEBNL.
 */

type Ligne = { numero: string; solde: number; typeCompte?: TypeCompteDetailTotal };
const D = TypeCompteDetailTotal.DETAIL;
const ligne = (numero: string, solde: number, typeCompte: TypeCompteDetailTotal = D): Ligne => ({ numero, solde, typeCompte });

function service(options: {
  referentiel?: Referentiel;
  forme?: FormeJuridiqueSyscohada | null;
  balances: Record<string, Ligne[]>;
  exercices?: { id: string; dateDebut: Date; dateFin: Date }[];
  retraitements?: Record<string, { sens: SensRetraitementFiscal; montant: number }[]>;
  dossier?: { acomptesVerses?: number; deficitAnterieurSaisi?: number | null; natureActivite?: 'VENTE' | 'PRESTATIONS' | null };
}) {
  const exercices = options.exercices ?? [
    { id: 'N', dateDebut: new Date(Date.UTC(2026, 0, 1)), dateFin: new Date(Date.UTC(2026, 11, 31)) },
  ];
  const crees: Record<string, unknown>[] = [];
  const prisma = {
    tenant: {
      findUnique: async () => ({
        id: 't1',
        referentiel: options.referentiel ?? Referentiel.SYSCOHADA,
        formeJuridiqueSyscohada: options.forme === undefined ? FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE : options.forme,
      }),
    },
    exercice: {
      findFirst: async ({ where }: { where: { id: string } }) => exercices.find((e) => e.id === where.id) ?? null,
      findMany: async ({ where, take }: { where: { dateFin: { lt: Date } }; take: number }) =>
        exercices
          .filter((e) => e.dateFin < where.dateFin.lt)
          .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())
          .slice(0, take),
    },
    retraitementFiscal: {
      findMany: async ({ where }: { where: { exerciceId: string } }) =>
        (options.retraitements?.[where.exerciceId] ?? []).map((r, i) => ({
          id: `r${i}`,
          code: 'X',
          libelle: 'x',
          commentaire: null,
          ...r,
        })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        crees.push(data);
        return data;
      },
    },
    dossierFiscalExercice: {
      findUnique: async () =>
        options.dossier
          ? { acomptesVerses: 0, deficitAnterieurSaisi: null, natureActivite: null, ...options.dossier }
          : null,
    },
  };
  const ecritures = {
    balance: async (_t: string, exerciceId: string) => ({
      lignes: (options.balances[exerciceId] ?? []).map((l) => ({ ...l, typeCompte: l.typeCompte ?? D })),
      totaux: { debit: 0, credit: 0 },
    }),
  };
  return { s: new FiscaliteService(prisma as never, ecritures as never), crees };
}

describe('Résultat fiscal · lecture de la balance', () => {
  it('lit le résultat dans les classes 6, 7, 8 avant clôture, et le chiffre d’affaires dans 701 à 707 seulement', async () => {
    const { s } = service({
      balances: {
        N: [
          ligne('70110000', -1000), // vente · crédit
          ligne('70610000', -500), // service · crédit
          ligne('75800000', -200), // autre produit · PAS du chiffre d'affaires
          ligne('60110000', 900), // achat · débit
          ligne('70', -1500, TypeCompteDetailTotal.TOTAL), // agrégat d'affichage, ignoré
        ],
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.sourceResultat).toBe('CLASSES_6_7_8');
    expect(r.resultatComptable).toBe(800);
    expect(r.chiffreAffaires).toBe(1500);
  });

  it('bascule sur le compte 13 quand les classes de gestion sont soldées', async () => {
    const { s } = service({ balances: { N: [ligne('13100000', -800)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.sourceResultat).toBe('COMPTE_13');
    expect(r.resultatComptable).toBe(800);
  });
});

describe('Impôt sur les sociétés · art. 56 et 57', () => {
  it('applique 30 % du résultat fiscal après réintégrations et déductions', async () => {
    const { s } = service({
      balances: { N: [ligne('70110000', -100_000), ligne('60110000', 60_000)] },
      retraitements: {
        N: [
          { sens: SensRetraitementFiscal.REINTEGRATION, montant: 5_000 },
          { sens: SensRetraitementFiscal.DEDUCTION, montant: 1_000 },
        ],
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.resultatComptable).toBe(40_000);
    expect(r.resultatFiscal).toBe(44_000);
    expect(r.impotTheorique).toBe(13_200);
    expect(r.impotMinimum).toBe(1_000);
    expect(r.impotDu).toBe(13_200);
    expect(r.minimumApplique).toBe(false);
  });

  it('retient l’impôt minimum de 1 % du chiffre d’affaires quand il dépasse l’impôt théorique, déficit compris', async () => {
    const { s } = service({
      balances: { N: [ligne('70110000', -1_000_000), ligne('60110000', 1_200_000)] },
      dossier: { acomptesVerses: 4_000 },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.resultatFiscal).toBe(-200_000);
    expect(r.impotTheorique).toBe(0);
    expect(r.impotMinimum).toBe(10_000);
    expect(r.impotDu).toBe(10_000);
    expect(r.minimumApplique).toBe(true);
    expect(r.soldeAPayer).toBe(6_000);
    // Les acomptes du prochain exercice se calent sur l'impôt de celui-ci ·
    // 30 %, 30 %, 20 % (art. 57 bis LPF).
    expect(r.acomptesProchainExercice.map((a) => a.montant)).toEqual([3_000, 3_000, 2_000]);
  });
});

describe('Report des déficits · art. 51 et 52', () => {
  const ex = (id: string, annee: number) => ({
    id,
    dateDebut: new Date(Date.UTC(annee, 0, 1)),
    dateFin: new Date(Date.UTC(annee, 11, 31)),
  });

  it('impute le déficit antérieur sur le bénéfice, sans jamais dépasser celui-ci', async () => {
    const { s } = service({
      exercices: [ex('N-1', 2025), ex('N', 2026)],
      balances: {
        'N-1': [ligne('60110000', 30_000)], // perte 30 000
        N: [ligne('70110000', -20_000)], // bénéfice 20 000
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.deficitAnterieur.montant).toBe(30_000);
    expect(r.deficitImpute).toBe(20_000);
    expect(r.resultatFiscal).toBe(0);
  });

  it('consomme les déficits dans l’ordre sur les bénéfices intermédiaires, et perd ce qui a plus de trois exercices', async () => {
    const { s } = service({
      exercices: [ex('N-4', 2022), ex('N-3', 2023), ex('N-2', 2024), ex('N-1', 2025), ex('N', 2026)],
      balances: {
        'N-4': [ligne('60110000', 100_000)], // perte hors fenêtre · perdue
        'N-3': [ligne('60110000', 10_000)], // perte 10 000
        'N-2': [ligne('70110000', -4_000)], // bénéfice 4 000 · consomme 4 000 de N-3
        'N-1': [ligne('60110000', 5_000)], // perte 5 000
        N: [ligne('70110000', -1_000)],
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.deficitAnterieur.montant).toBe(11_000);
    expect(r.deficitAnterieur.detail.map((d) => d.montant)).toEqual([6_000, 5_000]);
  });

  it('laisse un déficit saisi à la main primer sur le calcul · dossier repris à un confrère', async () => {
    const { s } = service({
      exercices: [ex('N-1', 2025), ex('N', 2026)],
      balances: { 'N-1': [ligne('60110000', 30_000)], N: [ligne('70110000', -50_000)] },
      dossier: { deficitAnterieurSaisi: 7_000 },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.deficitAnterieur).toMatchObject({ montant: 7_000, saisi: true });
    expect(r.resultatFiscal).toBe(43_000);
  });
});

describe('Régime selon la forme juridique · art. 3 à 6 et 107 à 128', () => {
  it('une entreprise individuelle bascule de régime avec son chiffre d’affaires', async () => {
    const cas = async (ca: number, nature?: 'VENTE' | 'PRESTATIONS') => {
      const { s } = service({
        forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
        balances: { N: [ligne('70110000', -ca)] },
        dossier: nature ? { natureActivite: nature } : undefined,
      });
      return s.resultatFiscal('t1', 'N');
    };
    const micro = await cas(20_000_000);
    expect(micro.regime).toBe('IRPP_MICRO_ENTREPRISE');
    expect(micro.impotDu).toBeNull();

    const petiteSansNature = await cas(100_000_000);
    expect(petiteSansNature.regime).toBe('IRPP_PETITE_ENTREPRISE');
    // Le taux ne se devine pas : sans nature d'activité, pas de montant.
    expect(petiteSansNature.impotDu).toBeNull();
    expect((await cas(100_000_000, 'VENTE')).impotDu).toBe(1_000_000);
    expect((await cas(100_000_000, 'PRESTATIONS')).impotDu).toBe(2_000_000);

    const reel = await cas(400_000_000);
    expect(reel.regime).toBe('IRPP_REGIME_REEL');
    expect(reel.impotDu).toBeNull();
    expect(reel.impotMinimum).toBe(4_000_000);
  });

  it('une société de personnes est signalée comme imposable sur option seulement', async () => {
    const { s } = service({ forme: FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF, balances: { N: [] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IMPOT_SOCIETES');
    expect(r.observations.join(' ')).toMatch(/SUR OPTION/);
  });

  it('une forme non renseignée est dite, pas devinée en silence', async () => {
    const { s } = service({ forme: null, balances: { N: [] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.observations.join(' ')).toMatch(/pas renseignée/);
  });
});

describe('Cloisonnement et saisie', () => {
  it('refuse un dossier SYCEBNL · une EBNL est exemptée (art. 5)', async () => {
    const { s } = service({ referentiel: Referentiel.SYCEBNL, balances: { N: [] } });
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/SYSCOHADA/);
  });

  it('impose un fondement écrit à une ligne libre, et le sens du catalogue aux autres', async () => {
    const { s, crees } = service({ balances: { N: [] } });
    await expect(
      s.ajouterRetraitement('t1', 'N', { code: CODE_LIBRE, libelle: 'x', montant: 10 }),
    ).rejects.toThrow(/fondement/);
    // Une déduction demandée sur un code de réintégration est ignorée · le
    // sens d'un code est celui du catalogue.
    await s.ajouterRetraitement('t1', 'N', {
      code: 'AMENDES_PENALITES',
      sens: SensRetraitementFiscal.DEDUCTION,
      montant: 10,
    });
    expect(crees[0].sens).toBe(SensRetraitementFiscal.REINTEGRATION);
  });

  it('chaque entrée du catalogue cite un article et porte un sens', () => {
    for (const r of CATALOGUE_RETRAITEMENTS) {
      expect(r.source.length).toBeGreaterThan(8);
      expect([SensRetraitementFiscal.REINTEGRATION, SensRetraitementFiscal.DEDUCTION]).toContain(r.sens);
      if (r.plafond) expect(r.plafond.part).toBeGreaterThan(0);
    }
    // Pas de doublon de code · un retraitement enregistré se relit par son code.
    expect(new Set(CATALOGUE_RETRAITEMENTS.map((r) => r.code)).size).toBe(CATALOGUE_RETRAITEMENTS.length);
  });
});
