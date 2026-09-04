import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersSmtService } from './etats-financiers-smt.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';

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

/**
 * Une ligne d'écriture de tiers telle que `partsParEcheance` la lit · seuls
 * comptent le compte, le sens, et l'échéance. `echeance: undefined` est le cas
 * de TOUS les dossiers ouverts avant que ce champ soit servi : la note doit
 * s'y comporter exactement comme avant.
 */
function ligneTiers(
  numero: string,
  montant: { debit?: number; credit?: number },
  echeance?: string,
  lettre: string | null = null,
) {
  return {
    compteId: `id-${numero}`,
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    dateEcheance: echeance ? new Date(echeance) : null,
    lettre,
  };
}

/** Une écriture telle que `mouvementsTresorerie` la lit via Prisma. */
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
    lignesTiers?: ReturnType<typeof ligneTiers>[];
    devise?: string;
    exercicePrecedent?: { id: string; dateDebut: Date; dateFin: Date } | null;
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
    // « les écritures de clôture sont écartées » passerait pour de mauvaises
    // raisons (il ne testerait que la doublure).
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
    // Lignes de tiers de la ventilation par échéance de la Note 3. Vide par
    // défaut : c'est l'état d'un dossier qui n'a jamais saisi d'échéance.
    // La doublure respecte `where.lettre`, comme celle des écritures respecte
    // `estGenereeParCloture` : sans quoi le test « une ligne lettrée est
    // soldée » ne testerait que la doublure.
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { lettre?: string | null } }) =>
        Promise.resolve(
          (options.lignesTiers ?? []).filter((l) => (where.lettre === null ? l.lettre === null : true)),
        ),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ devise: options.devise ?? 'CDF' }) },
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ dateFin: new Date('2026-12-31') }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01') }),
      // Exercice antérieur · `null` par défaut, ce qui est le cas d'un premier
      // exercice. Le cumul biennal de l'article 6 ne se calcule qu'avec lui.
      findFirst: jest.fn().mockResolvedValue(options.exercicePrecedent ?? null),
    },
  } as unknown as PrismaService;

  return new EtatsFinanciersSmtService(ecritureService, exerciceService, prisma);
}

function poste(etat: { actif: unknown[]; passif: unknown[] }, ref: string) {
  return [...etat.actif, ...etat.passif].find((p) => (p as { ref: string }).ref === ref) as {
    ref: string;
    libelle: string;
    montant: number;
    note: string | null;
    comptes: Array<{ numero: string; montant: number }>;
  };
}

// ---------------------------------------------------------------------------
// BILAN (Section 1)
// ---------------------------------------------------------------------------

describe('Bilan S.M.T', () => {
  it('GA porte la classe 2 en valeur NETTE : la maquette n’a qu’une colonne de montant', async () => {
    const s = service({
      e1: [
        ligne('24100000', ClasseCompte.CLASSE_2, 10000, 0),
        ligne('28410000', ClasseCompte.CLASSE_2, 0, 4000),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'GA').montant).toBe(6000);
  });

  it('GD est la caisse (57) et GE tout le reste de la classe 5', async () => {
    const s = service({
      e1: [
        ligne('57100000', ClasseCompte.CLASSE_5, 3000, 500),
        ligne('52100000', ClasseCompte.CLASSE_5, 9000, 1000),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'GD').montant).toBe(2500);
    expect(poste(bilan, 'GE').montant).toBe(8000);
  });

  it('GE accepte un solde NÉGATIF : « Banque (en + ou en -) », ce jeu n’a pas de trésorerie-passif', async () => {
    // Un découvert reste à l'actif en négatif. Les deux autres jeux le
    // basculeraient au poste DW ; cette maquette n'en a pas.
    const s = service({ e1: [ligne('56100000', ClasseCompte.CLASSE_5, 0, 2000)] });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'GE').montant).toBe(-2000);
  });

  it('la classe 4 se partage par le SENS du solde entre GC (débiteurs) et HD (créditeurs)', async () => {
    const s = service({
      e1: [
        ligne('41100000', ClasseCompte.CLASSE_4, 5000, 1000), // débiteur 4000
        ligne('40100000', ClasseCompte.CLASSE_4, 500, 3500), // créditeur 3000
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(poste(bilan, 'GC').montant).toBe(4000);
    expect(poste(bilan, 'HD').montant).toBe(3000);
  });

  it('HB vient des classes 6/7/8 avant clôture, du compte 13 après · jamais des deux', async () => {
    const avant = service({
      e1: [ligne('70100000', ClasseCompte.CLASSE_7, 0, 9000), ligne('60100000', ClasseCompte.CLASSE_6, 4000, 0)],
    });
    expect(poste(await avant.bilan('t1', 'e1'), 'HB').montant).toBe(5000);

    const apres = service({ e1: [ligne('13100000', ClasseCompte.CLASSE_1, 0, 5000)] });
    expect(poste(await apres.bilan('t1', 'e1'), 'HB').montant).toBe(5000);
  });

  it('HC accueille le compte 18 · réserve assumée et VISIBLE dans le drill-down', async () => {
    // Le libellé officiel dit « Autres fonds propres » ; un emprunt n'en est
    // pas un. La maquette n'ouvre aucune autre ligne de passif, et l'écarter
    // déséquilibrerait le bilan · voir le fondement du poste HC dans
    // correspondance-smt.ts. Le compte doit rester nommé dans le détail.
    const s = service({ e1: [ligne('18100000', ClasseCompte.CLASSE_1, 0, 7000)] });
    const hc = poste(await s.bilan('t1', 'e1'), 'HC');
    expect(hc.montant).toBe(7000);
    expect(hc.comptes.map((c) => c.numero)).toContain('18100000');
  });

  it('le bilan boucle : GZ = HZ sur un dossier équilibré', async () => {
    const s = service({
      e1: [
        ligne('57100000', ClasseCompte.CLASSE_5, 9000, 4000), // caisse 5000
        ligne('41100000', ClasseCompte.CLASSE_4, 2000, 0), // créance 2000
        ligne('10100000', ClasseCompte.CLASSE_1, 0, 3000), // dotation 3000
        ligne('40100000', ClasseCompte.CLASSE_4, 0, 1000), // dette 1000
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 7000),
        ligne('60100000', ClasseCompte.CLASSE_6, 4000, 0),
      ],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(bilan.totalActif).toBe(7000);
    expect(bilan.totalPassif).toBe(7000);
    expect(bilan.equilibre).toBe(true);
  });

  it('porte les renvois de note de la maquette (GA → 1, GD et GE → 4, HA → 5)', async () => {
    const bilan = await service({ e1: [] }).bilan('t1', 'e1');
    expect(poste(bilan, 'GA').note).toBe('1');
    expect(poste(bilan, 'GD').note).toBe('4');
    expect(poste(bilan, 'GE').note).toBe('4');
    expect(poste(bilan, 'HA').note).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// COMPTE DE RÉSULTAT (Section 2)
// ---------------------------------------------------------------------------

/** Balance d'un dossier tenu en pure trésorerie : aucun compte de tiers. */
const BALANCE_CAISSE = [
  ligne('57100000', ClasseCompte.CLASSE_5, 9000, 4000),
  ligne('70100000', ClasseCompte.CLASSE_7, 0, 9000),
  ligne('60100000', ClasseCompte.CLASSE_6, 4000, 0),
];

describe('Compte de résultat S.M.T', () => {
  it('lit les recettes et les dépenses dans les MOUVEMENTS de trésorerie, pas dans les soldes 6/7', async () => {
    const s = service(
      { e1: BALANCE_CAISSE },
      {
        ecritures: [
          ecriture('a', '2026-03-01', 'Cotisations', [
            { numero: '57100000', debit: 9000 },
            { numero: '70100000', credit: 9000 },
          ]),
          ecriture('b', '2026-04-01', 'Achat de fournitures', [
            { numero: '60100000', debit: 4000 },
            { numero: '57100000', credit: 4000 },
          ]),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.recettes.find((p) => p.ref === 'KA')!.montant).toBe(9000);
    expect(cr.depenses.find((p) => p.ref === 'JA')!.montant).toBe(4000);
    expect(cr.soldeCaisse).toBe(5000);
  });

  it('un virement caisse vers banque n’est NI une recette NI une dépense', async () => {
    const s = service(
      {
        e1: [
          ligne('57100000', ClasseCompte.CLASSE_5, 0, 2000),
          ligne('52100000', ClasseCompte.CLASSE_5, 2000, 0),
        ],
      },
      {
        ecritures: [
          ecriture('v', '2026-05-01', 'Versement en banque', [
            { numero: '52100000', debit: 2000 },
            { numero: '57100000', credit: 2000 },
          ]),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.totalRecettes).toBe(0);
    expect(cr.totalDepenses).toBe(0);
  });

  it('l’écriture de report à nouveau ne devient pas une recette de l’exercice', async () => {
    // Sans l'exclusion `estGenereeParCloture`, le solde d'ouverture de la
    // caisse ressortirait en KB · le compte de résultat afficherait comme
    // revenu de l'exercice l'argent qui y était déjà.
    const s = service(
      { e1: [ligne('57100000', ClasseCompte.CLASSE_5, 6000, 0, { debit: 6000 })] },
      {
        ecritures: [
          ecriture(
            'ran',
            '2026-01-01',
            'Report à nouveau',
            [
              { numero: '57100000', debit: 6000 },
              { numero: '12100000', credit: 6000 },
            ],
            { estGenereeParCloture: true },
          ),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.totalRecettes).toBe(0);
  });

  it('KZC retrouve le résultat d’engagement d’un dossier tenu en engagement (VC rétablit la dette)', async () => {
    // Facture 1 000 (60/401), réglée 600 seulement. Résultat d'engagement :
    // -1 000. En caisse : -600. La variation des dettes (+400) doit rendre
    // les 400 restants.
    const exercices = [
      { id: 'e0', dateDebut: new Date('2025-01-01') },
      { id: 'e1', dateDebut: new Date('2026-01-01') },
    ];
    const s = service(
      {
        e0: [],
        e1: [
          ligne('60100000', ClasseCompte.CLASSE_6, 1000, 0),
          ligne('40100000', ClasseCompte.CLASSE_4, 600, 1000), // dette résiduelle 400
          ligne('57100000', ClasseCompte.CLASSE_5, 0, 600),
        ],
      },
      {
        exercices,
        ecritures: [
          ecriture('f', '2026-02-01', 'Facture fournisseur', [
            { numero: '60100000', debit: 1000 },
            { numero: '40100000', credit: 1000 },
          ]),
          ecriture('r', '2026-03-01', 'Règlement partiel', [
            { numero: '40100000', debit: 600 },
            { numero: '57100000', credit: 600 },
          ]),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    // Le règlement passe par un compte de tiers : sa nature de charge est
    // inconnue de l'écriture, il tombe donc en JF (voir correspondance-smt.ts).
    expect(cr.depenses.find((p) => p.ref === 'JF')!.montant).toBe(600);
    expect(cr.soldeCaisse).toBe(-600);
    expect(cr.retraitements.find((r) => r.ref === 'VC')!.montant).toBe(400);
    expect(cr.resultatNet).toBe(-1000);
    expect(cr.controle.concordant).toBe(true);
  });

  it('les dotations aux amortissements (68) sont retranchées et ne sont jamais un décaissement', async () => {
    const exercices = [
      { id: 'e0', dateDebut: new Date('2025-01-01') },
      { id: 'e1', dateDebut: new Date('2026-01-01') },
    ];
    const s = service(
      {
        e0: [],
        e1: [
          ...BALANCE_CAISSE,
          ligne('68100000', ClasseCompte.CLASSE_6, 1500, 0),
          ligne('28410000', ClasseCompte.CLASSE_2, 0, 1500),
        ],
      },
      {
        exercices,
        ecritures: [
          ecriture('a', '2026-03-01', 'Cotisations', [
            { numero: '57100000', debit: 9000 },
            { numero: '70100000', credit: 9000 },
          ]),
          ecriture('b', '2026-04-01', 'Achat', [
            { numero: '60100000', debit: 4000 },
            { numero: '57100000', credit: 4000 },
          ]),
          ecriture('d', '2026-12-31', 'Dotation aux amortissements', [
            { numero: '68100000', debit: 1500 },
            { numero: '28410000', credit: 1500 },
          ]),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.totalDepenses).toBe(4000); // la dotation n'a touché aucune trésorerie
    expect(cr.retraitements.find((r) => r.ref === 'JG')!.montant).toBe(1500);
    expect(cr.resultatNet).toBe(3500);
    expect(cr.controle.concordant).toBe(true);
  });

  it('les variations VA/VB/VC se mesurent contre l’OUVERTURE de l’exercice, pas contre l’exercice N-1 du logiciel', async () => {
    // Dossier repris en cours de vie : une dette de 100 existait à
    // l'ouverture (report à nouveau), portée à 250 à la clôture. La variation
    // est de 150, pas de 250. Aucun exercice N-1 n'est enregistré dans
    // OmegaX : lire le N-1 plutôt que le report à nouveau donnerait 250.
    const s = service(
      { e1: [ligne('40100000', ClasseCompte.CLASSE_4, 0, 250, { credit: 100 })] },
      { ecritures: [] },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.retraitements.find((r) => r.ref === 'VC')!.montant).toBe(150);
  });

  it('isole les flux qui ne sont NI produit NI charge, et le contrôle concorde une fois qu’on les retire', async () => {
    // Limite assumée de la maquette officielle : un apport en dotation
    // encaissé et une immobilisation payée gonflent et creusent KZ sans
    // toucher au résultat, et le texte n'ouvre aucune ligne pour les
    // reprendre. Le moteur les calcule et les expose plutôt que de laisser
    // un écart inexpliqué.
    const s = service(
      {
        e1: [
          ligne('57100000', ClasseCompte.CLASSE_5, 500, 600),
          ligne('10110000', ClasseCompte.CLASSE_1, 0, 500),
          ligne('24110000', ClasseCompte.CLASSE_2, 600, 0),
        ],
      },
      {
        ecritures: [
          ecriture('d', '2026-01-10', 'Apport en dotation', [
            { numero: '57100000', debit: 500 },
            { numero: '10110000', credit: 500 },
          ]),
          ecriture('i', '2026-07-15', 'Achat de matériel', [
            { numero: '24110000', debit: 600 },
            { numero: '57100000', credit: 600 },
          ]),
        ],
      },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.soldeCaisse).toBe(-100);
    expect(cr.controle.fluxHorsExploitation).toBe(-100);
    expect(cr.controle.comptesHorsExploitation.map((c) => c.numero)).toEqual(['10110000', '24110000']);
    // Résultat du bilan nul (aucune classe 6/7/8 mouvementée) : KZC vaut le
    // flux hors exploitation, et le contrôle concorde une fois celui-ci retiré.
    expect(cr.controle.resultatBilan).toBe(0);
    expect(cr.controle.ecart).toBe(0);
    expect(cr.controle.concordant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NOTE 4 · JOURNAL UNIQUE DE TRÉSORERIE
// ---------------------------------------------------------------------------

describe('Note 4 · journal unique de trésorerie', () => {
  it('le virement interne EST dans le journal (livre de caisse), et le solde boucle avec la balance', async () => {
    // Il n'est ni recette ni dépense pour l'entité, donc absent du compte de
    // résultat · mais c'est une sortie de la caisse, et l'omettre donnerait un
    // journal dont le solde final ne serait pas celui du compte.
    const s = service(
      {
        e1: [
          ligne('57100000', ClasseCompte.CLASSE_5, 1000, 400),
          ligne('52100000', ClasseCompte.CLASSE_5, 400, 0),
        ],
      },
      {
        ecritures: [
          ecriture('a', '2026-03-01', 'Cotisations', [
            { numero: '57100000', debit: 1000 },
            { numero: '70100000', credit: 1000 },
          ]),
          ecriture('v', '2026-06-01', 'Versement en banque', [
            { numero: '52100000', debit: 400 },
            { numero: '57100000', credit: 400 },
          ]),
        ],
      },
    );
    const { journaux } = await s.journalTresorerie('t1', 'e1');
    const caisse = journaux.find((j) => j.numero === '57100000')!;
    expect(caisse.operations).toHaveLength(2);
    expect(caisse.operations[1].virementInterne).toBe(true);
    expect(caisse.operations[1].depense).toBe(400);
    // La ligne de virement ne reçoit aucune ventilation : les colonnes
    // officielles ne classent que des natures de recette et de dépense.
    expect(Object.values(caisse.operations[1].ventilation).every((v) => v === 0)).toBe(true);
    expect(caisse.soldeAReporter).toBe(600);
    expect(caisse.soldeBalance).toBe(600);
    expect(caisse.boucle).toBe(true);

    const banque = journaux.find((j) => j.numero === '52100000')!;
    expect(banque.operations[0].recette).toBe(400);
    expect(banque.boucle).toBe(true);
  });

  it('ouvre un journal PAR compte de trésorerie, du report à nouveau au solde à reporter', async () => {
    const s = service(
      {
        e1: [
          ligne('57100000', ClasseCompte.CLASSE_5, 1200, 0, { debit: 200 }),
          ligne('52100000', ClasseCompte.CLASSE_5, 500, 0, { debit: 500 }),
        ],
      },
      {
        ecritures: [
          ecriture('a', '2026-03-01', 'Cotisations', [
            { numero: '57100000', debit: 1000 },
            { numero: '70100000', credit: 1000 },
          ]),
        ],
      },
    );
    const { journaux } = await s.journalTresorerie('t1', 'e1');
    expect(journaux.map((j) => j.numero)).toEqual(['52100000', '57100000']);
    const caisse = journaux.find((j) => j.numero === '57100000')!;
    expect(caisse.reportANouveau).toBe(200);
    expect(caisse.operations).toHaveLength(1);
    expect(caisse.soldeAReporter).toBe(1200);
    // Journal de banque : pas d'opération, mais son report reste ouvert.
    expect(journaux.find((j) => j.numero === '52100000')!.operations).toHaveLength(0);
  });

  it('ventile la recette dans la colonne officielle « Cotisations » (compte 701)', async () => {
    const s = service(
      { e1: [ligne('57100000', ClasseCompte.CLASSE_5, 1000, 0)] },
      {
        ecritures: [
          ecriture('a', '2026-03-01', 'Cotisations 2026', [
            { numero: '57100000', debit: 1000 },
            { numero: '70100000', credit: 1000 },
          ]),
        ],
      },
    );
    const { journaux, colonnesRecettes } = await s.journalTresorerie('t1', 'e1');
    expect(colonnesRecettes.map((c) => c.libelle)).toEqual([
      'Cotisations',
      'Subventions',
      'Matériel, mobilier et autres',
      'Autres',
    ]);
    expect(journaux[0].operations[0].ventilation.cotisations).toBe(1000);
  });

  it('une écriture touchant DEUX comptes de trésorerie est comptée mais laissée hors ventilation, et signalée', async () => {
    const s = service(
      {
        e1: [
          ligne('57100000', ClasseCompte.CLASSE_5, 300, 0),
          ligne('52100000', ClasseCompte.CLASSE_5, 700, 0),
        ],
      },
      {
        ecritures: [
          ecriture('m', '2026-06-01', 'Quête répartie caisse et banque', [
            { numero: '57100000', debit: 300 },
            { numero: '52100000', debit: 700 },
            { numero: '70400000', credit: 1000 },
          ]),
        ],
      },
    );
    const { journaux } = await s.journalTresorerie('t1', 'e1');
    const caisse = journaux.find((j) => j.numero === '57100000')!;
    expect(caisse.operations[0].recette).toBe(300);
    expect(caisse.operations[0].ventile).toBe(false);
    expect(caisse.lignesNonVentilees).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// NOTES 1, 2, 3 et 5
// ---------------------------------------------------------------------------

describe('Notes annexes S.M.T', () => {
  it('Note 2 · déclare que les quantités ne sont pas tenues au lieu d’en inventer', async () => {
    const s = service({ e1: [ligne('31100000', ClasseCompte.CLASSE_3, 4000, 1000, { debit: 1000 })] });
    const note = await s.note2Stocks('t1', 'e1');
    expect(note.lignes[0].quantite).toBeNull();
    expect(note.lignes[0].prixUnitaire).toBeNull();
    expect(note.quantitesTenues).toBe(false);
    expect(note.valeurStockFinal).toBe(3000);
    expect(note.valeurStockInitial).toBe(1000);
  });

  it('Note 3 · « Montant au 1er janvier N » est le report à nouveau, pas le solde de N-1', async () => {
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 5000, 1000, { debit: 1500 })] },
      { tiersComptes: [{ compteId: 'id-41100000', tiers: { nom: 'Mutuelle Kin' } }] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].nom).toBe('Mutuelle Kin');
    expect(note.creances[0].montantCloture).toBe(4000);
    expect(note.creances[0].montantOuverture).toBe(1500);
    expect(note.creances[0].variationValeur).toBe(2500);
  });

  it('Note 3 · une ouverture nulle donne une variation en % à `null`, pas un infini', async () => {
    const s = service({ e1: [ligne('41100000', ClasseCompte.CLASSE_4, 4000, 0)] });
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].variationPourcent).toBeNull();
  });

  // -------------------------------------------------------------------------
  // NOTE 3 · « NON ÉCHUES », ce que l'intitulé officiel commande
  // -------------------------------------------------------------------------
  // La maquette (Partie 4, ch. 4, section 3) intitule la note « Etat des
  // créances et des dettes NON ECHUES », et l'AUDCIF précise « au 31 décembre »
  // (titre X, ch. 3). La note prenait toute la classe 4 sans distinguer : une
  // créance dont le terme était passé y était présentée comme non échue.

  it('Note 3 · une créance dont le terme est passé à la clôture est comptée ÉCHUE, pas non échue', async () => {
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 4000, 0)] },
      { lignesTiers: [ligneTiers('41100000', { debit: 4000 }, '2026-11-30')] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantEchu).toBe(4000);
    expect(note.creances[0].montantNonEchu).toBe(0);
    expect(note.totalCreancesNonEchues).toBe(0);
    expect(note.totalCreancesEchues).toBe(4000);
    // Le solde entier reste porté : la note justifie GC au bilan et VB au
    // compte de résultat, qui sont pris sur le solde.
    expect(note.creances[0].montantCloture).toBe(4000);
  });

  it('Note 3 · une créance à terme postérieur à la clôture est la seule à être dite non échue', async () => {
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 4000, 0)] },
      { lignesTiers: [ligneTiers('41100000', { debit: 4000 }, '2027-03-31')] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantNonEchu).toBe(4000);
    expect(note.creances[0].montantEchu).toBe(0);
    expect(note.echeancesTenues).toBe(true);
    expect(note.motifEcheances).toBeNull();
  });

  it('Note 3 · une créance venue à terme LE JOUR de la clôture est échue, la borne est incluse', async () => {
    // L'état est arrêté « au 31 décembre » (AUDCIF, titre X, ch. 3) : au soir
    // de la clôture, le terme du 31 décembre est atteint. Le décaler d'un jour
    // ferait passer pour non échue la créance la plus proche de l'être.
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 4000, 0)] },
      { lignesTiers: [ligneTiers('41100000', { debit: 4000 }, '2026-12-31')] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantEchu).toBe(4000);
    expect(note.creances[0].montantNonEchu).toBe(0);
  });

  it('Note 3 · une dette échue se lit en positif sous le total des dettes, comme le solde', async () => {
    const s = service(
      { e1: [ligne('40100000', ClasseCompte.CLASSE_4, 0, 3000)] },
      { lignesTiers: [ligneTiers('40100000', { credit: 3000 }, '2026-06-30')] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.dettes[0].montantCloture).toBe(3000);
    expect(note.dettes[0].montantEchu).toBe(3000);
    expect(note.totalDettesEchues).toBe(3000);
    expect(note.totalDettesNonEchues).toBe(0);
  });

  it('Note 3 · une ligne SANS échéance n’est rangée ni en échu ni en non échu : elle est nommée', async () => {
    // LE PIÈGE. On ne sait pas quand cette créance vient à terme. La ranger
    // d'office en « non échu » ferait affirmer à l'état un terme que personne
    // n'a saisi ; l'écarter viderait la note. Elle est portée à part.
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 4000, 0)] },
      { lignesTiers: [ligneTiers('41100000', { debit: 4000 })] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantNonVentile).toBe(4000);
    expect(note.creances[0].montantNonEchu).toBe(0);
    expect(note.creances[0].montantEchu).toBe(0);
    expect(note.totalCreancesNonVentilees).toBe(4000);
    expect(note.echeancesTenues).toBe(false);
    expect(note.motifEcheances).toContain('non échues');
  });

  it('Note 3 · un dossier qui n’a jamais saisi d’échéance garde EXACTEMENT la note d’avant', async () => {
    // Aucune reprise de données n'a eu lieu : sur tous les dossiers ouverts
    // avant que l'échéance soit servie, les colonnes de la maquette doivent
    // rendre les mêmes montants qu'hier. La ventilation s'ajoute, elle
    // n'ampute pas.
    const s = service(
      {
        e1: [
          ligne('41100000', ClasseCompte.CLASSE_4, 5000, 1000, { debit: 1500 }),
          ligne('40100000', ClasseCompte.CLASSE_4, 0, 3000),
        ],
      },
      { tiersComptes: [{ compteId: 'id-41100000', tiers: { nom: 'Mutuelle Kin' } }] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantCloture).toBe(4000);
    expect(note.creances[0].montantOuverture).toBe(1500);
    expect(note.creances[0].variationValeur).toBe(2500);
    expect(note.totalCreances).toBe(4000);
    expect(note.totalDettes).toBe(3000);
    // Et la note DIT que sa ventilation est vide au lieu de la faire passer
    // pour un « tout est non échu ».
    expect(note.totalCreancesNonEchues).toBe(0);
    expect(note.totalDettesNonEchues).toBe(0);
    expect(note.echeancesTenues).toBe(false);
  });

  it('Note 3 · une ligne lettrée est soldée et sort de la ventilation', async () => {
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 9000, 5000)] },
      {
        lignesTiers: [
          ligneTiers('41100000', { debit: 5000 }, '2026-05-31', 'A1'),
          ligneTiers('41100000', { credit: 5000 }, undefined, 'A1'),
          ligneTiers('41100000', { debit: 4000 }, '2027-05-31'),
        ],
      },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantNonEchu).toBe(4000);
    expect(note.creances[0].montantEchu).toBe(0);
    expect(note.creances[0].montantNonVentile).toBe(0);
    expect(note.echeancesTenues).toBe(true);
  });

  it('Note 3 · les trois parts somment TOUJOURS au solde présenté, même quand la tenue est incohérente', async () => {
    // Facture datée, règlement non lettré et sans échéance : le solde est nul,
    // la part non échue vaut la facture, et le reste vient l'annuler. Rien ne
    // s'évapore, rien n'apparaît, et la part négative rend la lacune visible
    // au lieu de la laisser passer pour une créance vivante.
    const s = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 5000, 5000)] },
      {
        lignesTiers: [
          ligneTiers('41100000', { debit: 5000 }, '2027-06-30'),
          ligneTiers('41100000', { credit: 5000 }),
        ],
      },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    // Solde nul : le compte ne figure ni en créance ni en dette, comme avant.
    expect(note.creances).toHaveLength(0);
    expect(note.dettes).toHaveLength(0);

    // Le même dossier, la facture restant impayée à la clôture.
    const s2 = service(
      { e1: [ligne('41100000', ClasseCompte.CLASSE_4, 5000, 2000)] },
      {
        lignesTiers: [
          ligneTiers('41100000', { debit: 5000 }, '2027-06-30'),
          ligneTiers('41100000', { credit: 2000 }),
        ],
      },
    );
    const note2 = await s2.note3CreancesDettes('t1', 'e1');
    const c = note2.creances[0];
    expect(c.montantCloture).toBe(3000);
    expect(c.montantNonEchu).toBe(5000);
    expect(c.montantEchu).toBe(0);
    expect(c.montantNonVentile).toBe(-2000);
    expect(c.montantNonEchu + c.montantEchu + c.montantNonVentile).toBe(c.montantCloture);
    expect(note2.echeancesTenues).toBe(false);
  });

  it('Note 5 · sert les trois rubriques officielles et déclare la nationalité non tenue', async () => {
    const s = service({
      e1: [
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 5000),
        ligne('10300000', ClasseCompte.CLASSE_1, 0, 800),
        ligne('10410000', ClasseCompte.CLASSE_1, 0, 1200),
      ],
    });
    const note = await s.note5Dotation('t1', 'e1');
    expect(note.rubriques.map((r) => r.montant)).toEqual([5000, 800, 1200]);
    expect(note.total).toBe(7000);
    expect(note.nationaliteTenue).toBe(false);
  });

  it('la fiche récapitulative range la Note 4 du côté du compte de résultat, les quatre autres du bilan', async () => {
    const fiche = service({ e1: [] }).ficheNotes();
    expect(fiche.filter((n) => n.partie === 'BILAN').map((n) => n.numero)).toEqual([1, 2, 3, 5]);
    expect(fiche.filter((n) => n.partie === 'COMPTE_DE_RESULTAT').map((n) => n.numero)).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// ÉLIGIBILITÉ (art. 6)
// ---------------------------------------------------------------------------

describe('Éligibilité au S.M.T · article 6', () => {
  it('mesure les cinq catégories de ressources sans convertir le seuil en monnaie locale', async () => {
    const s = service(
      {
        e1: [
          ligne('70100000', ClasseCompte.CLASSE_7, 0, 12_000_000), // cotisations
          ligne('70400000', ClasseCompte.CLASSE_7, 0, 3_000_000), // dons et legs
          ligne('71100000', ClasseCompte.CLASSE_7, 0, 8_000_000), // subventions
        ],
      },
      { devise: 'CDF' },
    );
    const e = await s.eligibilite('t1', 'e1');
    const par = (cle: string) => e.categories.find((c) => c.cle === cle)!.montant;
    expect(par('cotisationsRevenus')).toBe(12_000_000);
    expect(par('donsLegs')).toBe(3_000_000);
    expect(par('subventions')).toBe(8_000_000);
    expect(e.seuilParCategorieFcfa).toBe(30_000_000);
    expect(e.deviseDossier).toBe('CDF');
    expect(e.conversionAppliquee).toBe(false);
  });
});

/**
 * CUMUL SUR DEUX EXERCICES · seconde phrase de l'article 6. Elle était citée
 * dans le code mais jamais calculée : le contrôle ne lisait qu'un exercice, si
 * bien qu'une entité sous le seuil chaque année, mais au-dessus sur deux,
 * restait au Système minimal sans que rien ne le signale.
 */
describe('Cumul biennal de l’article 6', () => {
  // Une recette de cotisations : compte 701 crédité du montant.
  const cotisations = (montant: number) => [ligne('70100000', ClasseCompte.CLASSE_7, 0, montant)];

  it('additionne les ressources des deux exercices, catégorie par catégorie', async () => {
    const s = service(
      { e2026: cotisations(20_000_000), e2025: cotisations(15_000_000) },
      { exercicePrecedent: { id: 'e2025', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') } },
    );
    const r = await s.eligibilite('t1', 'e2026');
    // `categorie` et non `ligne` : `ligne` est déjà le constructeur de ligne
    // de balance de ce fichier, et le masquer casserait les tests voisins.
    const categorie = r.cumulBiennal!.find((c) => c.cle === 'cotisationsRevenus')!;
    expect(categorie.exerciceCourant).toBe(20_000_000);
    expect(categorie.exercicePrecedent).toBe(15_000_000);
    // Chaque exercice est sous les 30 millions, le cumul les dépasse.
    expect(categorie.cumule).toBe(35_000_000);
    expect(categorie.cumule).toBeGreaterThan(r.seuilParCategorieFcfa);
  });

  it('sans exercice antérieur, le DIT au lieu de conclure sur un cumul incomplet', async () => {
    const r = await service({ e2026: cotisations(20_000_000) }).eligibilite('t1', 'e2026');
    expect(r.cumulBiennal).toBeNull();
    expect(r.exercicePrecedent).toBeNull();
    expect(r.avertissementCumul).toContain('ne peut pas être mesuré');
  });

  it('ne convertit toujours pas le seuil · la règle vaut aussi pour le cumul', async () => {
    const r = await service(
      { e2026: cotisations(1), e2025: cotisations(1) },
      { exercicePrecedent: { id: 'e2025', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') } },
    ).eligibilite('t1', 'e2026');
    expect(r.conversionAppliquee).toBe(false);
    expect(r.avertissementCumul).toContain('cumulée sur deux exercices');
  });
});
