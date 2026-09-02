import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersSmtSyscohadaService } from './etats-financiers-smt-syscohada.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';
import { SEUILS_SMT_ART13_FCFA } from './correspondance-smt-syscohada';

/**
 * SERVICE S.M.T SYSCOHADA · ce spec ne relit pas la table (son propre spec
 * s'en charge, poste par poste, contre le plan semé) : il vérifie ce qui
 * casserait EN SILENCE dans le MOTEUR, c'est-à-dire tout ce qu'aucune
 * exception ne signalerait.
 *
 *  - le bilan ne boucle plus (SAZ ≠ SPZ), ou un compte disparaît parce que
 *    le filtre de sens a mangé une dépréciation créditrice ;
 *  - le compte de résultat est reconstruit en ENGAGEMENT au lieu de
 *    TRÉSORERIE, ou la formule G = C - D + E - F cesse de retomber sur le
 *    « Résultat exercice » du bilan (Titre X ch. 2 § 2) ;
 *  - un flux de financement ou d'investissement (emprunt, apport,
 *    acquisition) se met à gonfler A ou B ;
 *  - le journal de la NOTE 4 cesse de se reboucher sur le solde du compte,
 *    ou n'est plus tenu « par banque et pour la caisse » ;
 *  - le contrôle d'éligibilité conclut à la place de l'entité, alors que
 *    l'art. 13 lui laisse la qualification de son activité et que les
 *    seuils sont en F CFA.
 *
 * Les montants du jeu principal sont ceux d'un petit négoce tenu en partie
 * double avec tiers (le cas défavorable : le cas « trésorerie pure » n'a
 * ni créance ni dette et ne testerait aucune ligne de variation).
 */

// ---------------------------------------------------------------------------
// Doublures
// ---------------------------------------------------------------------------

function ligne(
  numero: string,
  classe: ClasseCompte,
  totalDebit: number,
  totalCredit: number,
  report: { debit?: number; credit?: number } = {},
) {
  const reportDebit = report.debit ?? 0;
  const reportCredit = report.credit ?? 0;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    totalDebit,
    totalCredit,
    reportDebit,
    reportCredit,
    mouvementDebit: totalDebit - reportDebit,
    mouvementCredit: totalCredit - reportCredit,
    solde: totalDebit - totalCredit,
  };
}

type LigneTest = ReturnType<typeof ligne>;

/** Une écriture telle que le service la lit via Prisma. */
function ecriture(
  id: string,
  date: string,
  libelle: string,
  lignes: Array<{ numero: string; debit?: number; credit?: number }>,
  options: { estGenereeParCloture?: boolean } = {},
) {
  return {
    id,
    date: new Date(date),
    libelle,
    reference: null,
    estGenereeParCloture: options.estGenereeParCloture ?? false,
    lignes: lignes.map((l, i) => ({
      id: `${id}-${i}`,
      compteId: `id-${l.numero}`,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      compte: { numero: l.numero, intitule: `Compte ${l.numero}` },
    })),
  };
}

function service(
  lignesParExercice: Record<string, LigneTest[]>,
  options: {
    exercices?: Array<{ id: string; dateDebut: Date }>;
    ecritures?: ReturnType<typeof ecriture>[];
    immobilisations?: unknown[];
    tiersComptes?: Array<{ compteId: string; tiers: { nom: string } }>;
    devise?: string;
  } = {},
) {
  const ecritureService = {
    balance: jest.fn().mockImplementation((_t: string, exerciceId: string) => {
      const lignes = lignesParExercice[exerciceId] ?? [];
      return Promise.resolve({ lignes, totaux: { debit: 0, credit: 0 } });
    }),
  } as unknown as EcritureService;

  const exerciceService = {
    lister: jest
      .fn()
      .mockResolvedValue([...(options.exercices ?? [])].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;

  const prisma = {
    // La doublure respecte `where.estGenereeParCloture` : sans quoi le test
    // « les écritures de clôture sont écartées » ne testerait que la doublure.
    ecriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { estGenereeParCloture?: boolean } }) =>
        Promise.resolve(
          (options.ecritures ?? []).filter((e) =>
            where.estGenereeParCloture === undefined ? true : e.estGenereeParCloture === where.estGenereeParCloture,
          ),
        ),
      ),
    },
    immobilisation: { findMany: jest.fn().mockResolvedValue(options.immobilisations ?? []) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue(options.tiersComptes ?? []) },
    tenant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ devise: options.devise ?? 'CDF', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' }),
    },
    exercice: {
      findFirstOrThrow: jest
        .fn()
        .mockResolvedValue({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
  } as unknown as PrismaService;

  return new EtatsFinanciersSmtSyscohadaService(ecritureService, exerciceService, prisma);
}

function poste(etat: { actif: unknown[]; passif: unknown[] }, ref: string) {
  return [...etat.actif, ...etat.passif].find((p) => (p as { ref: string }).ref === ref) as {
    ref: string;
    libelle: string;
    montant: number;
    montantN1?: number;
    note: string | null;
    comptes: Array<{ numero: string; montant: number }>;
  };
}

// ---------------------------------------------------------------------------
// LE DOSSIER DE RÉFÉRENCE · un petit négoce, exercice 2026, aucun antérieur
// ---------------------------------------------------------------------------

/*
  Quatorze opérations, toutes citées dans les tests qui les exploitent :

   1  Dr 521 1 000 000 / Cr 103 1 000 000   apport de l'exploitant
   2  Dr 241   400 000 / Cr 521   400 000   achat d'un matériel
   3  Dr 601   300 000 / Cr 571   300 000   achat de marchandises comptant
   4  Dr 571   500 000 / Cr 701   500 000   vente comptant
   5  Dr 411   200 000 / Cr 701   200 000   vente à crédit (non encaissée)
   6  Dr 622    60 000 / Cr 521    60 000   loyer payé
   7  Dr 661    90 000 / Cr 571    90 000   salaires payés
   8  Dr 641    10 000 / Cr 521    10 000   impôt payé
   9  Dr 671     5 000 / Cr 521     5 000   intérêts payés
  10  Dr 601   150 000 / Cr 401   150 000   achat à crédit
  11  Dr 401   100 000 / Cr 521   100 000   règlement partiel du fournisseur
  12  Dr 521    50 000 / Cr 571    50 000   virement caisse vers banque
  13  Dr 681    80 000 / Cr 284    80 000   dotation aux amortissements
  14  Dr 311   120 000 / Cr 6031  120 000   stock final constaté

  Résultat comptable attendu : 700 000 de ventes - 450 000 d'achats
  + 120 000 de variation de stock - 60 000 - 90 000 - 10 000 - 5 000
  - 80 000 = 125 000.
*/

const BALANCE_NEGOCE: LigneTest[] = [
  ligne('10300000', ClasseCompte.CLASSE_1, 0, 1_000_000),
  ligne('24110000', ClasseCompte.CLASSE_2, 400_000, 0),
  ligne('28410000', ClasseCompte.CLASSE_2, 0, 80_000),
  ligne('31110000', ClasseCompte.CLASSE_3, 120_000, 0),
  ligne('40110000', ClasseCompte.CLASSE_4, 100_000, 150_000),
  ligne('41110000', ClasseCompte.CLASSE_4, 200_000, 0),
  ligne('52110000', ClasseCompte.CLASSE_5, 1_050_000, 575_000),
  ligne('57110000', ClasseCompte.CLASSE_5, 500_000, 440_000),
  ligne('60110000', ClasseCompte.CLASSE_6, 450_000, 0),
  ligne('60310000', ClasseCompte.CLASSE_6, 0, 120_000),
  ligne('62210000', ClasseCompte.CLASSE_6, 60_000, 0),
  ligne('64110000', ClasseCompte.CLASSE_6, 10_000, 0),
  ligne('66110000', ClasseCompte.CLASSE_6, 90_000, 0),
  ligne('67110000', ClasseCompte.CLASSE_6, 5_000, 0),
  ligne('68130000', ClasseCompte.CLASSE_6, 80_000, 0),
  ligne('70110000', ClasseCompte.CLASSE_7, 0, 700_000),
];

const ECRITURES_NEGOCE = [
  ecriture('e01', '2026-01-05', "Apport de l'exploitant", [
    { numero: '52110000', debit: 1_000_000 },
    { numero: '10300000', credit: 1_000_000 },
  ]),
  ecriture('e02', '2026-01-10', 'Achat matériel industriel', [
    { numero: '24110000', debit: 400_000 },
    { numero: '52110000', credit: 400_000 },
  ]),
  ecriture('e03', '2026-02-01', 'Achat de marchandises comptant', [
    { numero: '60110000', debit: 300_000 },
    { numero: '57110000', credit: 300_000 },
  ]),
  ecriture('e04', '2026-03-01', 'Vente comptant', [
    { numero: '57110000', debit: 500_000 },
    { numero: '70110000', credit: 500_000 },
  ]),
  ecriture('e05', '2026-03-15', 'Vente à crédit', [
    { numero: '41110000', debit: 200_000 },
    { numero: '70110000', credit: 200_000 },
  ]),
  ecriture('e06', '2026-04-01', 'Loyer du magasin', [
    { numero: '62210000', debit: 60_000 },
    { numero: '52110000', credit: 60_000 },
  ]),
  ecriture('e07', '2026-04-30', 'Salaires', [
    { numero: '66110000', debit: 90_000 },
    { numero: '57110000', credit: 90_000 },
  ]),
  ecriture('e08', '2026-05-10', 'Impôt foncier', [
    { numero: '64110000', debit: 10_000 },
    { numero: '52110000', credit: 10_000 },
  ]),
  ecriture('e09', '2026-06-01', "Intérêts d'emprunt", [
    { numero: '67110000', debit: 5_000 },
    { numero: '52110000', credit: 5_000 },
  ]),
  ecriture('e10', '2026-07-01', 'Achat de marchandises à crédit', [
    { numero: '60110000', debit: 150_000 },
    { numero: '40110000', credit: 150_000 },
  ]),
  ecriture('e11', '2026-08-01', 'Règlement partiel fournisseur', [
    { numero: '40110000', debit: 100_000 },
    { numero: '52110000', credit: 100_000 },
  ]),
  ecriture('e12', '2026-09-01', 'Virement caisse vers banque', [
    { numero: '52110000', debit: 50_000 },
    { numero: '57110000', credit: 50_000 },
  ]),
  ecriture('e13', '2026-12-31', 'Dotation aux amortissements', [
    { numero: '68130000', debit: 80_000 },
    { numero: '28410000', credit: 80_000 },
  ]),
  ecriture('e14', '2026-12-31', 'Stock final', [
    { numero: '31110000', debit: 120_000 },
    { numero: '60310000', credit: 120_000 },
  ]),
];

function negoce() {
  return service({ e2026: BALANCE_NEGOCE }, { ecritures: ECRITURES_NEGOCE });
}

// ---------------------------------------------------------------------------
// BILAN (Titre X ch. 2 § 1)
// ---------------------------------------------------------------------------

describe('Bilan S.M.T SYSCOHADA', () => {
  it('boucle : SAZ = SPZ, résultat compris', async () => {
    const bilan = await negoce().bilan('t1', 'e2026');
    expect(bilan.totalActif).toBe(1_175_000);
    expect(bilan.totalPassif).toBe(1_175_000);
    expect(bilan.equilibre).toBe(true);
  });

  it('SA1 porte la classe 2 en valeur NETTE · la maquette n’a qu’une colonne de montant', async () => {
    const bilan = await negoce().bilan('t1', 'e2026');
    // 400 000 de matériel moins 80 000 d'amortissement.
    expect(poste(bilan, 'SA1').montant).toBe(320_000);
    expect(poste(bilan, 'SA1').note).toBe('1');
  });

  it('sépare les tiers débiteurs (SA3) des tiers créditeurs (SP4), sans compensation', async () => {
    const bilan = await negoce().bilan('t1', 'e2026');
    expect(poste(bilan, 'SA3').montant).toBe(200_000);
    expect(poste(bilan, 'SP4').montant).toBe(50_000);
  });

  it('SA4 est la caisse (57) et SA5 la banque (52 à 58) · 50 et 51 restent en SA3', async () => {
    const s = service({
      e1: [
        ligne('57110000', ClasseCompte.CLASSE_5, 60_000, 0),
        ligne('52110000', ClasseCompte.CLASSE_5, 475_000, 0),
        ligne('50110000', ClasseCompte.CLASSE_5, 30_000, 0),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'SA4').montant).toBe(60_000);
    expect(poste(bilan, 'SA5').montant).toBe(475_000);
    // Anomalie n° 6 de la table : un titre de placement n'est ni caisse ni
    // banque, il va en « Clients et débiteurs divers ».
    expect(poste(bilan, 'SA3').comptes.map((c) => c.numero)).toContain('50110000');
  });

  it('laisse un découvert bancaire à l’ACTIF en négatif · « Banque (en + ou en –) »', async () => {
    // Découvert de 120 000 creusé par un achat payé à découvert · les deux
    // lignes de l'écriture, pour que le bilan reste une partie double.
    const s = service({
      e1: [
        ligne('52110000', ClasseCompte.CLASSE_5, 0, 120_000),
        ligne('60110000', ClasseCompte.CLASSE_6, 120_000, 0),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    // Il n'y a PAS de poste de trésorerie passif au S.M.T (anomalie n° 7) :
    // le découvert vient en diminution de l'actif, il ne bascule pas.
    expect(poste(bilan, 'SA5').montant).toBe(-120_000);
    expect(bilan.equilibre).toBe(true);
  });

  it('garde les dépréciations créditrices que le filtre de sens aurait mangées', async () => {
    // Anomalies n° 5 et 6 : 491 en moins des créances, 499 au passif · ni
    // l'un ni l'autre ne passe le filtre DEBITEUR / CREDITEUR de son poste.
    const s = service({
      e1: [
        ligne('41110000', ClasseCompte.CLASSE_4, 200_000, 0),
        ligne('49110000', ClasseCompte.CLASSE_4, 0, 30_000),
        ligne('49910000', ClasseCompte.CLASSE_4, 0, 25_000),
        ligne('59900000', ClasseCompte.CLASSE_5, 0, 5_000),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'SA3').montant).toBe(170_000);
    expect(poste(bilan, 'SA3').comptes.map((c) => c.numero)).toContain('49110000');
    expect(poste(bilan, 'SP4').montant).toBe(30_000);
    expect(poste(bilan, 'SP4').comptes.map((c) => c.numero)).toEqual(['49910000', '59900000']);
    expect(bilan.comptesNonRattaches).toEqual([]);
  });

  it('ne laisse AUCUN compte de bilan hors maquette avec le plan officiel', async () => {
    const bilan = await negoce().bilan('t1', 'e2026');
    expect(bilan.comptesNonRattaches).toEqual([]);
  });

  it('signale un compte de bilan hors maquette plutôt que de déséquilibrer en silence', async () => {
    const s = service({ e1: [ligne('06000000', ClasseCompte.CLASSE_1, 7_000, 0)] });
    const bilan = await s.bilan('t1', 'e1');
    expect(bilan.comptesNonRattaches.map((c) => c.numero)).toEqual(['06000000']);
  });

  it('prend le résultat dans les classes 6/7/8 avant clôture, au compte 13 après', async () => {
    const avant = await negoce().bilan('t1', 'e2026');
    expect(poste(avant, 'SP2').montant).toBe(125_000);
    expect(avant.controle.resultatClasses678).toBe(125_000);
    expect(avant.controle.resultatCompte13).toBe(0);
    expect(avant.controle.doubleComptageProbable).toBe(false);

    // Après clôture : les classes 6/7/8 sont soldées, le 13 porte le résultat.
    const apres = service({
      e1: [
        ligne('13100000', ClasseCompte.CLASSE_1, 0, 125_000, { credit: 125_000 }),
        ligne('70110000', ClasseCompte.CLASSE_7, 700_000, 700_000, { debit: 700_000 }),
      ],
    });
    const bilan = await apres.bilan('t1', 'e1');
    expect(bilan.controle.resultatClasses678).toBe(0);
    expect(poste(bilan, 'SP2').montant).toBe(125_000);
  });

  it('signale le double comptage quand les deux sources sont servies à la fois', async () => {
    const s = service({
      e1: [
        ligne('13100000', ClasseCompte.CLASSE_1, 0, 125_000),
        ligne('70110000', ClasseCompte.CLASSE_7, 0, 700_000),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(bilan.controle.doubleComptageProbable).toBe(true);
  });

  it('n’invente pas de comparatif N-1 quand il n’y a pas d’exercice antérieur', async () => {
    const bilan = await negoce().bilan('t1', 'e2026');
    expect(bilan.exerciceN1Disponible).toBe(false);
    expect(poste(bilan, 'SA1').montantN1).toBeUndefined();
    expect(bilan.totalActifN1).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// COMPTE DE RÉSULTAT (Titre X ch. 2 § 2)
// ---------------------------------------------------------------------------

function ligneCr(cr: { lignes: Array<{ ref: string; montant: number }> }, ref: string) {
  return cr.lignes.find((l) => l.ref === ref)!;
}

describe('Compte de résultat S.M.T SYSCOHADA · comptabilité de TRÉSORERIE', () => {
  it('lit A et B dans les MOUVEMENTS de trésorerie, pas dans les soldes 6/7', async () => {
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    // Les ventes soldent 700 000, mais 200 000 ne sont pas encaissés :
    // A ne retient que l'encaissé. Lire le solde du 70 donnerait 700 000
    // ET la variation des créances le recompterait (Titre X ch. 1 § 1).
    expect(ligneCr(cr, 'SR1').montant).toBe(500_000);
    expect(cr.totalRecettes).toBe(500_000);

    // Les achats soldent 450 000, dont 150 000 non payés ; 100 000 de dette
    // antérieure ont en revanche été réglés et sont une dépense de caisse.
    expect(ligneCr(cr, 'SD1').montant).toBe(300_000);
    expect(ligneCr(cr, 'SD2').montant).toBe(60_000);
    expect(ligneCr(cr, 'SD3').montant).toBe(90_000);
    expect(ligneCr(cr, 'SD4').montant).toBe(10_000);
    expect(ligneCr(cr, 'SD5').montant).toBe(5_000);
    expect(ligneCr(cr, 'SD6').montant).toBe(100_000);
    expect(cr.totalDepenses).toBe(565_000);
    expect(cr.soldeCaisse).toBe(-65_000);
  });

  it('G = C – D + E – F boucle sur le « Résultat exercice » du bilan', async () => {
    const s = negoce();
    const [cr, bilan] = await Promise.all([s.compteDeResultat('t1', 'e2026'), s.bilan('t1', 'e2026')]);

    // Convention (N-1) - N, celle du compte 603 · anomalie n° 2 de la table.
    expect(ligneCr(cr, 'SV1').montant).toBe(-120_000);
    expect(ligneCr(cr, 'SV2').montant).toBe(-200_000);
    expect(ligneCr(cr, 'SV3').montant).toBe(-50_000);
    expect(ligneCr(cr, 'SF').montant).toBe(80_000);
    expect(cr.lettres).toEqual({ D: -320_000, E: -50_000, F: 80_000 });

    // -65 000 - (-320 000) + (-50 000) - 80 000 = 125 000.
    expect(cr.resultatExercice).toBe(125_000);
    expect(ligneCr(cr, 'SG').montant).toBe(125_000);
    expect(poste(bilan, 'SP2').montant).toBe(125_000);
    expect(cr.controle.ecart).toBe(0);
    expect(cr.controle.concordant).toBe(true);
    expect(cr.controle.residuel).toBe(0);
  });

  it('tient l’apport et l’acquisition HORS de A et de B, et les expose à part', async () => {
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    // Anomalie n° 13 : les classes 1 et 2 n'ont aucune ligne de variation.
    // Un apport de 1 000 000 compté en A donnerait A = 1 500 000 et un
    // résultat de 1 125 000 pour un résultat comptable de 125 000.
    const numerosEnAB = [...cr.recettes, ...cr.depenses].flatMap((p) => p.comptes.map((c) => c.numero));
    expect(numerosEnAB).not.toContain('10300000');
    expect(numerosEnAB).not.toContain('24110000');

    const financement = cr.fluxHorsResultat.find((r) => r.cle === 'financement')!;
    const investissement = cr.fluxHorsResultat.find((r) => r.cle === 'investissement')!;
    expect(financement.montant).toBe(1_000_000);
    expect(investissement.montant).toBe(-400_000);
    expect(cr.contrepartiesNonRattachees).toEqual([]);
  });

  it('n’écarte PAS le flux hors résultat de G · il n’y est jamais entré', async () => {
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    const horsResultat = cr.fluxHorsResultat.reduce((s, r) => s + r.montant, 0);
    expect(horsResultat).toBe(600_000);
    // Le retrancher une seconde fois (comme le fait le jeu SYCEBNL, dont les
    // postes captaient les classes 1 à 3 par exclusion) donnerait -475 000.
    expect(cr.resultatExercice).toBe(125_000);
  });

  it('écarte le virement interne de A et de B · son flux net est nul', async () => {
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    // Les 50 000 virés de la caisse à la banque ne sont ni une recette ni
    // une dépense pour l'entité (anomalie n° 14) ; sans ce filtre, A ET B
    // seraient gonflés de 50 000 chacun.
    expect(cr.totalRecettes).toBe(500_000);
    expect(cr.totalDepenses).toBe(565_000);
  });

  it('écarte les écritures de clôture · un report à-nouveau n’est pas un encaissement', async () => {
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, 300_000, 0, { debit: 300_000 })] },
      {
        ecritures: [
          ecriture(
            'ran',
            '2026-01-01',
            'Report à-nouveau',
            [
              { numero: '57110000', debit: 300_000 },
              { numero: '10300000', credit: 300_000 },
            ],
            { estGenereeParCloture: true },
          ),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.totalRecettes).toBe(0);
    expect(cr.fluxHorsResultat.every((r) => r.montant === 0)).toBe(true);
  });

  it('lit F dans les MOUVEMENTS : après clôture, le solde des 68/69/85 est nul', async () => {
    /*
      Dossier réduit à une dotation de 80 000, exercice CLÔTURÉ : l'écriture
      de clôture a viré le 681 au compte 139 (Titre VII COMPTE 13), le solde
      du 681 est donc zéro. Lire F dans le SOLDE (ce que le commentaire de
      `COMPTES_DOTATIONS_SMT_SYSCOHADA` annonce) donnerait F = 0 et un
      résultat de 0 au lieu de -80 000, sans qu'aucun contrôle ne le voie.
    */
    const s = service(
      {
        e1: [
          ligne('24110000', ClasseCompte.CLASSE_2, 400_000, 0, { debit: 400_000 }),
          ligne('28410000', ClasseCompte.CLASSE_2, 0, 80_000),
          ligne('10300000', ClasseCompte.CLASSE_1, 0, 400_000, { credit: 400_000 }),
          ligne('13900000', ClasseCompte.CLASSE_1, 80_000, 0, { debit: 80_000 }),
          ligne('68130000', ClasseCompte.CLASSE_6, 80_000, 80_000, { credit: 80_000 }),
        ],
      },
      {
        ecritures: [
          ecriture('d1', '2026-12-31', 'Dotation', [
            { numero: '68130000', debit: 80_000 },
            { numero: '28410000', credit: 80_000 },
          ]),
        ],
      },
    );
    const [cr, bilan] = await Promise.all([s.compteDeResultat('t1', 'e1'), s.bilan('t1', 'e1')]);
    expect(ligneCr(cr, 'SF').montant).toBe(80_000);
    expect(cr.resultatExercice).toBe(-80_000);
    expect(poste(bilan, 'SP2').montant).toBe(-80_000);
    expect(cr.controle.concordant).toBe(true);
    expect(bilan.equilibre).toBe(true);
  });

  it('expose l’écart d’une cession saisie en deux écritures, et l’explique entièrement', async () => {
    /*
      Anomalie n° 22 : le prix de cession (82) est un encaissement et entre
      en A, mais la valeur comptable du bien (81) n'a AUCUNE ligne d'accueil
      dans la maquette du ch. 2 § 2. Un matériel de 400 000 amorti de 80 000
      cédé 120 000 : le résultat comptable est 120 000 - 320 000 = -200 000,
      le G du S.M.T vaut 120 000. L'écart de 320 000 est exposé, décomposé,
      et son résiduel est nul.
    */
    const s = service(
      {
        e1: [
          ligne('24110000', ClasseCompte.CLASSE_2, 400_000, 400_000, { debit: 400_000 }),
          ligne('28410000', ClasseCompte.CLASSE_2, 80_000, 80_000, { credit: 80_000 }),
          ligne('10300000', ClasseCompte.CLASSE_1, 0, 320_000, { credit: 320_000 }),
          ligne('52110000', ClasseCompte.CLASSE_5, 120_000, 0),
          ligne('81200000', ClasseCompte.CLASSE_8, 320_000, 0),
          ligne('82200000', ClasseCompte.CLASSE_8, 0, 120_000),
        ],
      },
      {
        ecritures: [
          ecriture('c1', '2026-06-01', 'Encaissement du prix de cession', [
            { numero: '52110000', debit: 120_000 },
            { numero: '82200000', credit: 120_000 },
          ]),
          ecriture('c2', '2026-06-01', 'Sortie du bien cédé', [
            { numero: '81200000', debit: 320_000 },
            { numero: '28410000', debit: 80_000 },
            { numero: '24110000', credit: 400_000 },
          ]),
        ],
      },
    );
    const [cr, bilan] = await Promise.all([s.compteDeResultat('t1', 'e1'), s.bilan('t1', 'e1')]);
    expect(cr.totalRecettes).toBe(120_000);
    expect(cr.resultatExercice).toBe(120_000);
    expect(poste(bilan, 'SP2').montant).toBe(-200_000);
    expect(cr.controle.ecart).toBe(320_000);
    expect(cr.controle.concordant).toBe(false);
    // 320 000 de valeur comptable sortie sans passer par la caisse.
    expect(cr.controle.composantesEcart.classe2).toBe(320_000);
    expect(cr.controle.residuel).toBe(0);
  });

  it('imprime les lignes dans l’ordre de la maquette, totaux compris', async () => {
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    expect(cr.lignes.map((l) => l.ref)).toEqual([
      'SR1', 'SR2', 'SRA',
      'SD1', 'SD2', 'SD3', 'SD4', 'SD5', 'SD6', 'SDB',
      'SC',
      'SV1', 'SV2', 'SV3',
      'SF',
      'SG',
    ]);
    expect(ligneCr(cr, 'SRA').montant).toBe(500_000);
    expect(ligneCr(cr, 'SDB').montant).toBe(565_000);
    expect(ligneCr(cr, 'SC').montant).toBe(-65_000);
  });
});

// ---------------------------------------------------------------------------
// NOTE 4 · JOURNAL DE TRÉSORERIE
// ---------------------------------------------------------------------------

describe('NOTE 4 · journal de trésorerie SMT', () => {
  it('tient un journal par compte de trésorerie · « un par banque et un pour la caisse »', async () => {
    const j = await negoce().journalTresorerie('t1', 'e2026');
    expect(j.journaux.map((x) => x.numero)).toEqual(['52110000', '57110000']);
  });

  it('chaque journal se reboucle sur le solde du compte à la balance', async () => {
    const j = await negoce().journalTresorerie('t1', 'e2026');
    const banque = j.journaux.find((x) => x.numero === '52110000')!;
    const caisse = j.journaux.find((x) => x.numero === '57110000')!;
    expect(banque.soldeAReporter).toBe(475_000);
    expect(banque.soldeBalance).toBe(475_000);
    expect(banque.boucle).toBe(true);
    expect(caisse.soldeAReporter).toBe(60_000);
    expect(caisse.boucle).toBe(true);
  });

  it('ventile chaque opération dans la colonne officielle de sa nature', async () => {
    const j = await negoce().journalTresorerie('t1', 'e2026');
    const caisse = j.journaux.find((x) => x.numero === '57110000')!;
    const vente = caisse.operations.find((o) => o.libelle === 'Vente comptant')!;
    expect(vente.recette).toBe(500_000);
    expect(vente.ventilation.ventes).toBe(500_000);

    const achat = caisse.operations.find((o) => o.libelle === 'Achat de marchandises comptant')!;
    expect(achat.depense).toBe(300_000);
    expect(achat.ventilation.achatsMarchandises).toBe(300_000);

    const salaires = caisse.operations.find((o) => o.libelle === 'Salaires')!;
    expect(salaires.ventilation.salaires).toBe(90_000);

    const banque = j.journaux.find((x) => x.numero === '52110000')!;
    expect(banque.operations.find((o) => o.libelle === 'Loyer du magasin')!.ventilation.loyers).toBe(60_000);
    expect(banque.operations.find((o) => o.libelle === 'Impôt foncier')!.ventilation.impotsTaxes).toBe(10_000);
    // Colonne ajoutée sur le fondement du NB officiel (anomalie n° 12) :
    // l'apport de l'exploitant a sa colonne, il n'est pas noyé dans « Autres ».
    expect(banque.operations.find((o) => o.libelle === "Apport de l'exploitant")!.ventilation.compteExploitant).toBe(
      1_000_000,
    );
    // Le matériel acheté tombe dans la colonne résiduelle : le ch. 3 n'ouvre
    // « Matériel et Mobilier » que du côté des RECETTES.
    expect(banque.operations.find((o) => o.libelle === 'Achat matériel industriel')!.ventilation.autres).toBe(400_000);
  });

  it('porte le virement interne dans LES DEUX journaux, sans ventilation', async () => {
    const j = await negoce().journalTresorerie('t1', 'e2026');
    const banque = j.journaux.find((x) => x.numero === '52110000')!;
    const caisse = j.journaux.find((x) => x.numero === '57110000')!;
    const cote = (x: typeof banque) => x.operations.find((o) => o.libelle === 'Virement caisse vers banque')!;
    // Absent du compte de résultat, présent ici : sans lui, le solde à
    // reporter de chaque journal serait faux de 50 000.
    expect(cote(banque).recette).toBe(50_000);
    expect(cote(caisse).depense).toBe(50_000);
    expect(cote(banque).virementInterne).toBe(true);
    expect(cote(banque).ventile).toBe(false);
  });

  it('ouvre chaque journal sur le report à-nouveau du compte', async () => {
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, 300_000, 0, { debit: 300_000 })] },
      { ecritures: [] },
    );
    const j = await s.journalTresorerie('t1', 'e1');
    expect(j.journaux[0].reportANouveau).toBe(300_000);
    expect(j.journaux[0].soldeAReporter).toBe(300_000);
    expect(j.journaux[0].boucle).toBe(true);
  });

  it('signale les lignes non ventilables plutôt que d’inventer une clé de répartition', async () => {
    const s = service(
      {
        e1: [
          ligne('52110000', ClasseCompte.CLASSE_5, 60_000, 0),
          ligne('57110000', ClasseCompte.CLASSE_5, 40_000, 0),
          ligne('70110000', ClasseCompte.CLASSE_7, 0, 100_000),
        ],
      },
      {
        ecritures: [
          ecriture('m1', '2026-05-01', 'Encaissement partagé caisse et banque', [
            { numero: '52110000', debit: 60_000 },
            { numero: '57110000', debit: 40_000 },
            { numero: '70110000', credit: 100_000 },
          ]),
        ],
      },
    );
    const j = await s.journalTresorerie('t1', 'e1');
    for (const journal of j.journaux) {
      expect(journal.lignesNonVentilees).toBe(1);
      expect(journal.operations[0].ventile).toBe(false);
      expect(journal.operations[0].ventilation.ventes).toBe(0);
      // Comptée en recette et au solde malgré tout : le journal reste juste.
      expect(journal.boucle).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// NOTES 1, 2 et 3
// ---------------------------------------------------------------------------

describe('Notes annexes S.M.T SYSCOHADA', () => {
  it('NOTE 1 · sert le registre des immobilisations ET les cautions du compte 275', async () => {
    const s = service(
      { e1: [ligne('27510000', ClasseCompte.CLASSE_2, 90_000, 0)] },
      {
        immobilisations: [
          {
            designation: 'Camionnette',
            valeurOrigine: 3_000_000,
            dateAcquisition: new Date('2026-02-01'),
            dateSortie: null,
            prixCession: null,
          },
        ],
      },
    );
    const note = await s.note1MaterielMobilierCautions('t1', 'e1');
    expect(note.lignes.map((l) => l.origine)).toEqual(['REGISTRE', 'BALANCE']);
    expect(note.totalRegistre).toBe(3_000_000);
    // Le titre officiel vise « le matériel, le mobilier ET LES CAUTIONS » :
    // un dépôt de garantie n'est pas au registre des immobilisations.
    expect(note.totalCautions).toBe(90_000);
    expect(note.total).toBe(3_090_000);
    // Titre X ch. 1 § 1 · règle propre au S.M.T, rappelée sur l'état.
    expect(note.amortissement).toEqual({ mode: 'LINEAIRE', prorataTemporis: false });
  });

  it('NOTE 2 · le stock final moins le stock initial EST la ligne SV1', async () => {
    const s = negoce();
    const [note, cr] = await Promise.all([s.note2Stocks('t1', 'e2026'), s.compteDeResultat('t1', 'e2026')]);
    expect(note.valeurStockFinal).toBe(120_000);
    expect(note.valeurStockInitial).toBe(0);
    expect(note.variationSv1).toBe(ligneCr(cr, 'SV1').montant);
    // Aucun inventaire physique dans OmegaX : déclaré, pas simulé.
    expect(note.lignes[0].quantite).toBeNull();
    expect(note.quantitesTenues).toBe(false);
  });

  it('NOTE 3 · deux tableaux, dont les variations SONT les lignes SV2 et SV3', async () => {
    const s = negoce();
    const [note, cr] = await Promise.all([s.note3CreancesDettes('t1', 'e2026'), s.compteDeResultat('t1', 'e2026')]);
    expect(note.creances.map((c) => c.numero)).toEqual(['41110000']);
    expect(note.dettes.map((d) => d.numero)).toEqual(['40110000']);
    expect(note.totalCreances).toBe(200_000);
    expect(note.totalDettes).toBe(50_000);
    expect(note.variationSv2).toBe(ligneCr(cr, 'SV2').montant);
    expect(note.variationSv3).toBe(ligneCr(cr, 'SV3').montant);
    // Ouverture nulle : un pourcentage n'a pas de sens, `null` plutôt qu'un
    // infini affiché.
    expect(note.creances[0].variationPourcent).toBeNull();
  });

  it('NOTE 3 · nomme le tiers rattaché au compte quand il y en a un', async () => {
    const s = service(
      { e1: [ligne('41110000', ClasseCompte.CLASSE_4, 200_000, 0)] },
      { tiersComptes: [{ compteId: 'id-41110000', tiers: { nom: 'Ets Kabila' } }] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].nom).toBe('Ets Kabila');
  });

  it('la fiche récapitulative porte les quatre notes et les deux journaux de suivi', () => {
    const fiche = negoce().ficheNotes();
    expect(fiche.notes.map((n) => n.numero)).toEqual([1, 2, 3, 4]);
    expect(fiche.journauxDeSuivi.map((j) => j.cle)).toEqual(['creancesImpayees', 'dettesAPayer']);
    // Titre X ch. 1 § 2 · trois documents, pas de TFT (anomalie n° 3).
    expect(fiche.documents).toEqual(['BILAN', 'COMPTE_DE_RESULTAT', 'NOTES_ANNEXES']);
    expect(fiche.inventaireExtraComptable).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// ÉLIGIBILITÉ (AUDCIF art. 11 et 13)
// ---------------------------------------------------------------------------

describe('Éligibilité au S.M.T · art. 11 et 13', () => {
  it('mesure le chiffre d’affaires HT sur les comptes 701 à 707, ventilé TA à TD', async () => {
    const s = service({
      e1: [
        ligne('70110000', ClasseCompte.CLASSE_7, 0, 500_000), // TA · ventes de marchandises
        ligne('70210000', ClasseCompte.CLASSE_7, 0, 300_000), // TB · produits fabriqués
        ligne('70610000', ClasseCompte.CLASSE_7, 0, 200_000), // TC · services vendus
        ligne('70710000', ClasseCompte.CLASSE_7, 0, 100_000), // TD · produits accessoires
        ligne('75100000', ClasseCompte.CLASSE_7, 0, 900_000), // hors chiffre d'affaires
      ],
    });
    const e = await s.eligibilite('t1', 'e1');
    expect(e.chiffreAffaires).toBe(1_100_000);
    expect(e.ventilation.map((v) => [v.ref, v.montant])).toEqual([
      ['TA', 500_000],
      ['TB', 300_000],
      ['TC', 200_000],
      ['TD', 100_000],
    ]);
    // Le 75 « Autres produits » n'est pas du chiffre d'affaires (poste TH).
    expect(e.comptesHorsVentilation).toEqual([]);
  });

  it('lit le chiffre d’affaires FACTURÉ, pas encaissé · l’art. 13 dit « chiffre d’affaires »', async () => {
    const e = await negoce().eligibilite('t1', 'e2026');
    // 700 000 facturés, dont 200 000 non encaissés · A vaut 500 000, le
    // chiffre d'affaires 700 000.
    expect(e.chiffreAffaires).toBe(700_000);
  });

  it('présente LES TROIS seuils et ne qualifie pas l’activité à la place de l’entité', async () => {
    const e = await negoce().eligibilite('t1', 'e2026');
    expect(e.seuils.map((s) => [s.cle, s.montantFcfa])).toEqual([
      ['negoce', 60_000_000],
      ['artisanat', 40_000_000],
      ['services', 30_000_000],
    ]);
    expect(e.seuils).toHaveLength(SEUILS_SMT_ART13_FCFA.length);
    for (const s of e.seuils) {
      expect(s.clause).toContain("ou l'équivalent dans l'unité monétaire ayant cours légal");
    }
    // Aucun champ « éligible » : le contrôle ne conclut pas.
    expect(e).not.toHaveProperty('eligible');
    expect(e.qualificationParLEntite).toContain('négoce');
  });

  it('ne convertit pas les F CFA et le dit', async () => {
    const e = await negoce().eligibilite('t1', 'e2026');
    expect(e.conversionAppliquee).toBe(false);
    expect(e.deviseDossier).toBe('CDF');
    expect(e.avertissementConversion).toContain('ne convertit pas');
  });

  it('rappelle l’art. 11 · le Système normal est la règle, le S.M.T l’exception', async () => {
    const e = await negoce().eligibilite('t1', 'e2026');
    expect(e.rappelArticle11).toContain('sauf exception liée à sa taille');
    expect(e.rappelArticle11).toContain('Système normal');
  });
});
