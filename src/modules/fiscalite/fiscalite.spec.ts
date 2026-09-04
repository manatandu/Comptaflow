import { FormeJuridiqueSyscohada, Referentiel, SensRetraitementFiscal, TypeCompteDetailTotal } from '@prisma/client';
import { FiscaliteService, arrondirImpotArt150 } from './fiscalite.service';
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
  dossier?: {
    acomptesVerses?: number;
    supplementsAdministration?: number;
    deficitAnterieurSaisi?: number | null;
    natureActivite?: 'VENTE' | 'PRESTATIONS' | null;
  };
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
          ? {
              acomptesVerses: 0,
              supplementsAdministration: 0,
              deficitAnterieurSaisi: null,
              natureActivite: null,
              ...options.dossier,
            }
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

  /**
   * LE COMPTE 13 N'EST PAS ENTIÈREMENT LE RÉSULTAT, EN SYSCOHADA.
   *
   * Le compte 13 du SYCEBNL n'a que deux subdivisions, 131 bénéfice et 139
   * perte : y sommer tout ce qui commence par « 13 » y est exact. Le plan
   * SYSCOHADA en porte neuf de plus, et deux familles font des dégâts
   * opposés · les tests qui suivent figent chacune.
   */
  it('IGNORE le résultat en instance d’affectation (130) · sinon l’impôt est payé deux fois', async () => {
    const { s } = service({
      balances: {
        // Bénéfice de l'exercice : 800. Et 5 000 encore en instance
        // d'affectation, qui sont le résultat de l'exercice PRÉCÉDENT tant
        // que l'assemblée n'a pas statué · déjà imposés une fois.
        N: [ligne('13100000', -800), ligne('13010000', -5_000)],
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.resultatComptable).toBe(800);
  });

  it('IGNORE les soldes intermédiaires de gestion (132 à 138) · ce sont des étapes du même résultat', async () => {
    const { s } = service({
      balances: {
        N: [
          ligne('13100000', -800), // résultat net
          ligne('13200000', -12_000), // marge commerciale
          ligne('13300000', -9_000), // valeur ajoutée
          ligne('13400000', -5_000), // excédent brut d'exploitation
          ligne('13500000', -2_000), // résultat d'exploitation
          ligne('13600000', -300), // résultat financier
          ligne('13700000', -1_700), // résultat des activités ordinaires
          ligne('13800000', 900), // résultat hors activités ordinaires
        ],
      },
    });
    const r = await s.resultatFiscal('t1', 'N');
    // Sommer les neuf donnerait 29 900 au lieu de 800 · un impôt trente-sept
    // fois trop élevé, au terme d'un calcul qui a l'air parfaitement normal.
    expect(r.resultatComptable).toBe(800);
  });

  it('retient la PERTE portée au 139', async () => {
    const { s } = service({ balances: { N: [ligne('13900000', 1_500)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.resultatComptable).toBe(-1_500);
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

/**
 * BASE DES ACOMPTES PROVISIONNELS · art. 57 bis de la loi de procédures
 * fiscales, TEL QUE MODIFIÉ par la loi de finances n° 25/060 du 29 décembre
 * 2025 : les acomptes sont calculés « sur base de l'impôt déclaré au titre de
 * l'exercice précédent, AUGMENTÉ DES SUPPLÉMENTS ÉVENTUELS ÉTABLIS PAR
 * L'ADMINISTRATION DES IMPÔTS […] QUE CES SOMMES FASSENT OU NON L'OBJET DE
 * CONTESTATION ».
 *
 * CE QUE RIEN NE VOYAIT. Un supplément naît d'un avis de redressement, jamais
 * d'une écriture : aucun solde de compte ne le porte, et le logiciel ne peut
 * que le recevoir. Assis sur le seul impôt calculé, les trois acomptes
 * proposés à un dossier redressé sont sous-évalués, et l'insuffisance de
 * versement se paie même quand le redressement est contesté. Rien dans le
 * calcul ne se déséquilibre : les trois montants restent 30/30/20 d'une base,
 * mais de la mauvaise.
 *
 * Les ÉCHÉANCES elles-mêmes viennent de la loi de finances et non de la
 * rédaction de 2023 (« avant le 1er août… »), périmée · d'où le dernier test.
 */
describe('Base des acomptes provisionnels · art. 57 bis LPF', () => {
  const dossierRedresse = (supplements: number) =>
    service({
      balances: { N: [ligne('70110000', -1_000_000), ligne('60110000', 1_200_000)] },
      dossier: { supplementsAdministration: supplements },
    });

  it('ajoute les suppléments de l’Administration à la base des trois acomptes', async () => {
    const { s } = dossierRedresse(5_000);
    const r = await s.resultatFiscal('t1', 'N');
    // Impôt minimum de 10 000, plus 5 000 de supplément : la base est 15 000.
    expect(r.impotDu).toBe(10_000);
    expect(r.baseAcomptes).toBe(15_000);
    expect(r.acomptesProchainExercice.map((a) => a.montant)).toEqual([4_500, 4_500, 3_000]);
  });

  it('ne touche NI le solde à payer NI l’impôt dû de l’exercice', async () => {
    // Le supplément porte sur un exercice ANTÉRIEUR · l'imputer ici ferait
    // payer deux fois le même redressement.
    const { s } = dossierRedresse(5_000);
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.impotDu).toBe(10_000);
    expect(r.soldeAPayer).toBe(10_000);
  });

  it('sans supplément, la base est l’impôt dû seul', async () => {
    const { s } = dossierRedresse(0);
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.baseAcomptes).toBe(10_000);
    expect(r.acomptesProchainExercice.map((a) => a.montant)).toEqual([3_000, 3_000, 2_000]);
  });

  it('porte les échéances de la loi de finances, pas celles de la rédaction de 2023', async () => {
    const { s } = dossierRedresse(0);
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.acomptesProchainExercice.map((a) => a.echeance)).toEqual(['25 juillet', '25 septembre', '25 novembre']);
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

/**
 * LE RÉGIME D'UNE PERSONNE PHYSIQUE NE SE LIT PAS DANS UN SEUL EXERCICE ·
 * art. 113 de la loi n° 23/053 :
 *
 *   « Les entreprises dont le chiffre d'affaires hors taxes devient inférieur
 *   à la limite de leur régime d'imposition ne sont soumises au régime
 *   d'imposition immédiatement inférieur que lorsque leur chiffre d'affaires
 *   est resté en dessous de cette limite pendant deux exercices consécutifs.
 *   Toutefois, les entreprises dont le chiffre d'affaires hors taxes devient
 *   supérieur à la limite de leur régime d'imposition sont soumises
 *   immédiatement au régime supérieur […]. »
 *
 * L'article est ASYMÉTRIQUE : montée immédiate, descente après deux exercices
 * consécutifs et d'un seul cran. Trancher sur le chiffre d'affaires de
 * l'exercice en cours, ce que faisait le service, déclassait dès la première
 * mauvaise année · avec un impôt et un calendrier de paiement qui n'étaient
 * pas ceux du contribuable.
 */
describe('Régime des personnes physiques · art. 113, déclassement et reclassement', () => {
  const ex = (id: string, annee: number) => ({
    id,
    dateDebut: new Date(Date.UTC(annee, 0, 1)),
    dateFin: new Date(Date.UTC(annee, 11, 31)),
  });
  const individuelle = (
    exercices: { id: string; dateDebut: Date; dateFin: Date }[],
    balances: Record<string, Ligne[]>,
    nature?: 'VENTE' | 'PRESTATIONS',
  ) =>
    service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      exercices,
      balances,
      dossier: nature ? { natureActivite: nature } : undefined,
    }).s;

  it('NE DÉCLASSE PAS après un seul exercice sous le seuil', async () => {
    // 400 000 000 en 2025 (régime réel), 100 000 000 en 2026 · un seul
    // exercice sous la limite : le régime réel est maintenu.
    const s = individuelle(
      [ex('N-1', 2025), ex('N', 2026)],
      { 'N-1': [ligne('70110000', -400_000_000)], N: [ligne('70110000', -100_000_000)] },
      'VENTE',
    );
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_REGIME_REEL');
    // L'impôt des petites entreprises aurait été de 1 000 000 (1 % du chiffre
    // d'affaires) · il n'est pas dû, et le barème du revenu global n'est pas
    // ici : aucun montant n'est annoncé.
    expect(r.impotDu).toBeNull();
    expect(r.observations.join(' ')).toMatch(/Art. 113/);
    expect(r.observations.join(' ')).toMatch(/MAINTENU/);
  });

  it('déclasse après DEUX exercices consécutifs sous le seuil', async () => {
    const s = individuelle(
      [ex('N-2', 2024), ex('N-1', 2025), ex('N', 2026)],
      {
        'N-2': [ligne('70110000', -400_000_000)],
        'N-1': [ligne('70110000', -100_000_000)],
        N: [ligne('70110000', -100_000_000)],
      },
      'VENTE',
    );
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_PETITE_ENTREPRISE');
    expect(r.impotDu).toBe(1_000_000);
  });

  it('ne descend que d’UN CRAN · le régime réel tombe aux petites entreprises, pas aux micro', async () => {
    // Chiffre d'affaires effondré à 20 000 000, sous le seuil des
    // micro-entreprises, deux exercices de suite. L'art. 113 ne donne que le
    // régime « immédiatement inférieur » : il faudra deux exercices de plus
    // sous 25 000 000 pour descendre encore.
    const s = individuelle(
      [ex('N-2', 2024), ex('N-1', 2025), ex('N', 2026)],
      {
        'N-2': [ligne('70110000', -400_000_000)],
        'N-1': [ligne('70110000', -20_000_000)],
        N: [ligne('70110000', -20_000_000)],
      },
      'VENTE',
    );
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_PETITE_ENTREPRISE');
    expect(r.impotDu).toBe(200_000);
  });

  it('reclasse IMMÉDIATEMENT vers le haut · art. 113, al. 2', async () => {
    const s = individuelle([ex('N-1', 2025), ex('N', 2026)], {
      'N-1': [ligne('70110000', -20_000_000)],
      N: [ligne('70110000', -400_000_000)],
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_REGIME_REEL');
  });

  it('AVERTIT de l’option pour le régime réel, qu’aucune écriture ne porte · art. 110 et 111', async () => {
    const s = individuelle([ex('N', 2026)], { N: [ligne('70110000', -100_000_000)] }, 'VENTE');
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_PETITE_ENTREPRISE');
    const dit = r.observations.join(' ');
    expect(dit).toMatch(/Art. 110 et 111/);
    expect(dit).toMatch(/1er février/);
    expect(dit).toMatch(/irrévocable/);
    // Et le dossier sans historique le dit, au lieu de faire comme si le
    // chiffre d'affaires d'un exercice suffisait.
    expect(dit).toMatch(/Aucun exercice antérieur/);
  });
});

/**
 * LE CALENDRIER DE PAIEMENT D'UNE PETITE ENTREPRISE · art. 57, al. 3 et
 * art. 57 quater de la loi de procédures fiscales.
 *
 * Ce que le service faisait : les trois acomptes de l'art. 57 bis, servis dès
 * que l'impôt était calculable, donc à toute petite entreprise dont la nature
 * d'activité était renseignée. Total juste, dates fausses, article faux · le
 * renvoi de l'art. 57 bis à « l'article 57, ALINÉA 2 » exclut la petite
 * entreprise, régie par l'alinéa 3.
 */
describe('Paiement en deux quotités · art. 57, al. 3 et 57 quater LPF', () => {
  const petite = async (nature: 'VENTE' | 'PRESTATIONS') => {
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70610000', -100_000_000)] },
      dossier: { natureActivite: nature },
    });
    return s.resultatFiscal('t1', 'N');
  };

  it('sert 60 % au 31 janvier et 40 % ensuite, sur l’impôt de l’exercice', async () => {
    const r = await petite('PRESTATIONS');
    expect(r.impotDu).toBe(2_000_000);
    expect(r.quotitesPetiteEntreprise.map((q) => [q.quotite, q.echeance, q.montant])).toEqual([
      [0.6, '31 janvier', 1_200_000],
      [0.4, '30 avril', 800_000],
    ]);
  });

  it('NE SERT PAS les trois acomptes de l’impôt sur les sociétés', async () => {
    const r = await petite('PRESTATIONS');
    expect(r.acomptesProchainExercice).toEqual([]);
    expect(r.baseAcomptes).toBeNull();
    expect(r.observations.join(' ')).toMatch(/DEUX QUOTITÉS/);
  });

  it('porte la réserve sur la seconde échéance, que le texte officiel libelle mal', async () => {
    const r = await petite('VENTE');
    expect(r.quotitesPetiteEntreprise[0].reserve).toBeNull();
    expect(r.quotitesPetiteEntreprise[1].reserve).toMatch(/57 quater/);
    expect(r.observations.join(' ')).toMatch(/à confirmer auprès du service gestionnaire/);
  });

  it('laisse à l’impôt sur les sociétés ses trois acomptes, et aucune quotité', async () => {
    const { s } = service({
      balances: { N: [ligne('70110000', -100_000_000), ligne('60110000', 60_000_000)] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.quotitesPetiteEntreprise).toEqual([]);
    expect(r.acomptesProchainExercice.map((a) => a.echeance)).toEqual(['25 juillet', '25 septembre', '25 novembre']);
  });

  it('une micro-entreprise ne reçoit ni acompte ni quotité', async () => {
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70110000', -20_000_000)] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_MICRO_ENTREPRISE');
    expect(r.acomptesProchainExercice).toEqual([]);
    expect(r.quotitesPetiteEntreprise).toEqual([]);
  });
});

/**
 * LES DÉCHÉANCES DU REPORT DÉFICITAIRE SE DISENT, ELLES NE SE CALCULENT PAS ·
 * art. 51, al. 2 (absence de déclaration après mise en demeure) et art. 52,
 * 1° (nouvel exploitant d'une entreprise déficitaire, changement complet
 * d'activité). Ni la mise en demeure ni le changement d'exploitant n'entrent
 * dans un journal : les deviner serait pire que les signaler.
 */
describe('Déchéances du report déficitaire · avertissements, art. 51 al. 2 et 52, 1°', () => {
  const ex = (id: string, annee: number) => ({
    id,
    dateDebut: new Date(Date.UTC(annee, 0, 1)),
    dateFin: new Date(Date.UTC(annee, 11, 31)),
  });

  it('avertit dès qu’un déficit antérieur est imputé', async () => {
    const { s } = service({
      exercices: [ex('N-1', 2025), ex('N', 2026)],
      balances: { 'N-1': [ligne('60110000', 30_000)], N: [ligne('70110000', -20_000)] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.deficitImpute).toBe(20_000);
    const dit = r.observations.join(' ');
    expect(dit).toMatch(/Art. 51, al. 2/);
    expect(dit).toMatch(/mise en demeure/);
    expect(dit).toMatch(/Art. 52, 1°/);
    expect(dit).toMatch(/nouvel exploitant/);
  });

  it('ne dit rien quand il n’y a aucun déficit à reporter', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -20_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.deficitAnterieur.montant).toBe(0);
    expect(r.observations.join(' ')).not.toMatch(/mise en demeure/);
  });

  it('avertit aussi quand le déficit a été SAISI à la main', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -50_000)] }, dossier: { deficitAnterieurSaisi: 7_000 } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.observations.join(' ')).toMatch(/Art. 51, al. 2/);
  });
});

/**
 * ARRONDI LÉGAL DE L'IMPÔT · loi n° 23/053, art. 150, TITRE VI, chapitre 1
 * « DES DISPOSITIONS RELATIVES AUX ARRONDIS » :
 *
 *   « Lorsque le montant de l'Impôt sur les Sociétés, de l'Impôt minimum, de
 *   l'Impôt sur le Revenu des Personnes Physiques et de tous autres
 *   prélèvements prévus dans la présente Loi comprend une décimale, cette
 *   fraction est arrondie à l'unité supérieure si la première décimale est
 *   supérieure ou égale à 5. Dans le cas contraire, elle est ramenée à
 *   l'unité inférieure.
 *   Lorsque le montant arrondi comprend une tranche supérieure ou égale à 50
 *   Francs congolais, celle-ci est ramenée à la centaine de Francs congolais
 *   supérieure.
 *   Lorsque cette tranche est inférieure à 50 Francs congolais, elle est
 *   ramenée à la centaine de Francs congolais inférieure. »
 *
 * Le module liquidait au CENTIME. L'écart par montant est inférieur à cent
 * francs, mais le montant affiché n'était pas celui qui se déclare, et il
 * servait d'assiette aux acomptes de l'exercice suivant.
 */
describe('Arrondi légal de l’impôt · art. 150', () => {
  it('supprime la décimale, PUIS remonte ou descend à la centaine', () => {
    // 1 % de 123 456 789 = 1 234 567,89 · décimale 8 ≥ 5, donc 1 234 568,
    // puis tranche 68 ≥ 50, donc centaine supérieure.
    expect(arrondirImpotArt150(1_234_567.89)).toBe(1_234_600);
    // Décimale 4 < 5 : unité inférieure, 1 234 549, tranche 49 < 50.
    expect(arrondirImpotArt150(1_234_549.4)).toBe(1_234_500);
    // La décimale seule fait basculer la centaine · 1 234 549,5 devient
    // 1 234 550, dont la tranche atteint 50.
    expect(arrondirImpotArt150(1_234_549.5)).toBe(1_234_600);
    expect(arrondirImpotArt150(0)).toBe(0);
    expect(arrondirImpotArt150(49)).toBe(0);
    expect(arrondirImpotArt150(50)).toBe(100);
    expect(arrondirImpotArt150(1_234_600)).toBe(1_234_600);
  });

  it('l’impôt minimum de l’art. 57 sort arrondi, et sert de base aux acomptes', async () => {
    const { s } = service({
      balances: { N: [ligne('70110000', -123_456_789), ligne('60110000', 200_000_000)] },
      dossier: { supplementsAdministration: 0 },
    });
    const r = await s.resultatFiscal('t1', 'N');
    // Au centime, le module affichait 1 234 567,89.
    expect(r.impotMinimum).toBe(1_234_600);
    expect(r.impotDu).toBe(1_234_600);
    expect(r.minimumApplique).toBe(true);
    expect(r.baseAcomptes).toBe(1_234_600);
  });

  it('l’IRPP d’une petite entreprise aussi · l’article le nomme', async () => {
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70110000', -123_456_789)] },
      dossier: { natureActivite: 'PRESTATIONS' },
    });
    const r = await s.resultatFiscal('t1', 'N');
    // 2 % de 123 456 789 = 2 469 135,78 · décimale 7, donc 2 469 136, puis
    // tranche 36 < 50, donc centaine inférieure.
    expect(r.impotDu).toBe(2_469_100);
    expect(r.quotitesPetiteEntreprise.map((q) => q.montant)).toEqual([1_481_460, 987_640]);
  });
});

/**
 * ART. 44, AL. 2, 2° · LE PLAFOND SERVI À L'ÉCRAN DE SAISIE.
 *
 * La page calcule l'excédent à réintégrer à partir de `plafonds.montantAdmis`
 * et de la charge que le comptable vient de taper. Servir 0,5 % du chiffre
 * d'affaires à un dossier dont le droit à déduction n'est pas ouvert, c'est
 * lui faire déclarer un déficit reportable trop élevé.
 */
describe('Plafond des dons servi à l’écran · condition de l’art. 44', () => {
  const dons = (r: { plafonds: { code: string; montantAdmis: number | null; enonce: string; conditionOuverte: boolean | null }[] }) =>
    r.plafonds.find((p) => p.code === 'DONS_EXCEDENT')!;

  it('dossier DÉFICITAIRE · le plafond est servi à zéro, et le seuil est dit', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -100_000_000), ligne('60110000', 102_800_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.resultatFiscalBrut).toBe(-2_800_000);
    expect(dons(r).montantAdmis).toBe(0);
    expect(dons(r).conditionOuverte).toBe(false);
    expect(dons(r).enonce.replace(/[\u202f\u00a0]/g, ' ')).toContain('dépassent 2 800 000');
  });

  it('dossier BÉNÉFICIAIRE · le plafond joue, et le relevé du 1° est rappelé', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -100_000_000), ligne('60110000', 60_000_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(dons(r).montantAdmis).toBe(500_000);
    expect(dons(r).conditionOuverte).toBe(true);
    expect(dons(r).enonce).toContain('relevé');
  });

  it('les plafonds SANS condition d’ouverture ne bougent pas, déficit ou non', async () => {
    // Art. 49, 1° · 2 ‰ du chiffre d'affaires, sans aucune condition de
    // résultat. Neutraliser tous les plafonds d'un dossier déficitaire serait
    // l'erreur opposée, et elle ferait payer trop.
    const { s } = service({ balances: { N: [ligne('70110000', -100_000_000), ligne('60110000', 102_800_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    const cadeaux = r.plafonds.find((p) => p.code === 'CADEAUX_EXCEDENT')!;
    expect(cadeaux.montantAdmis).toBe(200_000);
    expect(cadeaux.conditionOuverte).toBeNull();
  });
});

/**
 * LES DEUX BRANCHES D'ASSIETTE DES ACOMPTES QUE LE MODULE NE CALCULE PAS ·
 * art. 57 bis, al. 1er LPF, dans sa rédaction issue de la L.F. n° 25/060 :
 * les acomptes sont calculés « sur base de l'impôt déclaré au titre de
 * l'exercice précédent, augmenté des suppléments éventuels établis par
 * l'Administration des Impôts, ou, en cas d'absence de déclaration, de
 * l'impôt reconstitué d'office ».
 *
 * Aucune écriture ne dit qu'un exercice n'a pas été déclaré, ni ce que
 * l'Administration a reconstitué · le module le DIT plutôt que de l'inventer.
 */
describe('Assiette des acomptes · les branches que le module ne peut pas calculer', () => {
  it('avertit de la base reconstituée d’office, qui REMPLACE l’impôt déclaré', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -1_000_000), ligne('60110000', 1_200_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.observations.join(' ')).toContain("reconstitué d'office");
    expect(r.observations.join(' ')).toContain('REMPLACE');
  });

  it('dit qu’aucun acompte n’est dû quand le dossier n’a pas d’exercice antérieur', async () => {
    const { s } = service({ balances: { N: [ligne('70110000', -1_000_000), ligne('60110000', 1_200_000)] } });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.observations.join(' ')).toContain("AUCUN acompte n'est dû au titre de la présente année");
  });

  it('se tait sur ce point dès qu’un exercice antérieur est tenu', async () => {
    const { s } = service({
      exercices: [
        { id: 'N-1', dateDebut: new Date(Date.UTC(2025, 0, 1)), dateFin: new Date(Date.UTC(2025, 11, 31)) },
        { id: 'N', dateDebut: new Date(Date.UTC(2026, 0, 1)), dateFin: new Date(Date.UTC(2026, 11, 31)) },
      ],
      balances: { N: [ligne('70110000', -1_000_000), ligne('60110000', 1_200_000)], 'N-1': [] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.observations.join(' ')).not.toContain("AUCUN acompte n'est dû");
    // La branche reconstituée d'office, elle, reste servie · c'est l'exercice
    // précédent qui peut ne pas avoir été déclaré.
    expect(r.observations.join(' ')).toContain("reconstitué d'office");
  });

  it('ne sert AUCUNE de ces observations à qui ne verse pas d’acompte', async () => {
    // Art. 57, al. 3 · une micro-entreprise acquitte un forfait annuel.
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70110000', -20_000_000)] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_MICRO_ENTREPRISE');
    expect(r.observations.join(' ')).not.toContain("reconstitué d'office");
  });
});

/**
 * ART. 64, 3° ET ART. 108 · les contribuables dispensés de patente sont
 * EXEMPTÉS d'IRPP et exclus du régime des micro-entreprises. Le module
 * annonçait à tout dossier de personne physique à faible chiffre d'affaires
 * un régime et une base d'imposition, sans jamais poser la question.
 *
 * La dispense est un fait administratif : le logiciel ne la devine pas, il la
 * rappelle avec la liste limitative que l'art. 108 énumère lui-même.
 */
describe('Contribuables dispensés de patente · art. 64, 3° et 108', () => {
  it('avertit le dossier classé en micro-entreprise', async () => {
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70110000', -20_000_000)] },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_MICRO_ENTREPRISE');
    const dit = r.observations.join(' ');
    expect(dit).toContain("dispensés de l'obligation d'obtenir la patente");
    expect(dit).toContain('vendeurs de journaux à la criée');
    expect(dit).toContain('EXEMPTÉS');
  });

  it('ne le sert pas à une petite entreprise, que l’art. 108 ne vise pas', async () => {
    const { s } = service({
      forme: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      balances: { N: [ligne('70110000', -100_000_000)] },
      dossier: { natureActivite: 'VENTE' },
    });
    const r = await s.resultatFiscal('t1', 'N');
    expect(r.regime).toBe('IRPP_PETITE_ENTREPRISE');
    expect(r.observations.join(' ')).not.toContain('patente');
  });
});

/**
 * ART. 133, AL. 2 · « Les amortissements des immobilisations réévaluées
 * doivent être calculés et comptabilisés sur la base des valeurs réévaluées
 * mais l'augmentation corrélative de chaque annuité d'amortissements ne doit
 * pas entraîner de diminution du bénéfice comptable et du bénéfice fiscal.
 * Cette neutralité est obtenue chaque année par une réintégration dans les
 * bénéfices d'une fraction équivalente à l'augmentation corrélative de chaque
 * annuité d'amortissements. »
 *
 * Le catalogue n'avait aucune ligne pour ce redressement, et le seul endroit
 * où le logiciel parlait de réévaluation (contrôle REEVALUATION_IMMO_HORS_MODULE)
 * ne citait que le SYCEBNL et l'AUDCIF. Le comptable qui suivait l'écran
 * jusqu'au bout obtenait un résultat fiscal minoré, chaque année du plan.
 */
describe('Réintégration du supplément d’annuité des biens réévalués · art. 133', () => {
  it('le catalogue porte la ligne, avec son article', () => {
    const entree = CATALOGUE_RETRAITEMENTS.find((r) => r.code === 'REEVALUATION_SUPPLEMENT_ANNUITE');
    expect(entree).toBeDefined();
    expect(entree!.sens).toBe(SensRetraitementFiscal.REINTEGRATION);
    expect(entree!.source).toContain('art. 133');
    // Le montant est la DIFFÉRENCE entre deux plans d'amortissement · aucune
    // balance ne la porte, et le module ne la propose donc pas.
    expect(entree!.assietteHorsPortee).toBeTruthy();
  });
});
