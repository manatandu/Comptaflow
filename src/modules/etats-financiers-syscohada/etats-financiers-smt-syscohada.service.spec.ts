import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClasseCompte, FormeJuridiqueSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import {
  EtatsFinanciersSmtSyscohadaService,
  PLAFOND_MOUVEMENTS_NOTE_4_SMT_SYSCOHADA,
} from './etats-financiers-smt-syscohada.service';
import { LOT_ECRITURES } from '../../common/lecture-par-lots';
import { etatsDesGarantiesDus } from './etats-garanties-smt';
import { EcritureService, PLAFOND_LIGNES_GRAND_LIVRE } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';
import {
  POSTES_BILAN_ACTIF_SMT_SYSCOHADA,
  POSTES_BILAN_PASSIF_SMT_SYSCOHADA,
  SEUILS_SMT_ART13_FCFA,
} from './correspondance-smt-syscohada';

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

/** La classe d'un compte se lit sur son premier chiffre (plan SYSCOHADA). */
const CLASSE_PAR_CHIFFRE: Record<string, ClasseCompte> = {
  '1': ClasseCompte.CLASSE_1,
  '2': ClasseCompte.CLASSE_2,
  '3': ClasseCompte.CLASSE_3,
  '4': ClasseCompte.CLASSE_4,
  '5': ClasseCompte.CLASSE_5,
  '6': ClasseCompte.CLASSE_6,
  '7': ClasseCompte.CLASSE_7,
  '8': ClasseCompte.CLASSE_8,
};

/**
 * Une ligne d'écriture telle que `partsParEcheance` la lit · c'est la seule
 * source de la ventilation par échéance de la NOTE 3, la balance ne portant
 * aucune date. `echeance` absente = ligne non datée, cas de TOUS les dossiers
 * réels aujourd'hui.
 */
function ligneTiers(
  numero: string,
  montant: { debit?: number; credit?: number },
  options: { echeance?: string; lettre?: string; regleApresCloture?: boolean } = {},
) {
  return {
    compteId: `id-${numero}`,
    classe: CLASSE_PAR_CHIFFRE[numero[0]],
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    dateEcheance: options.echeance ? new Date(options.echeance) : null,
    lettre: options.lettre ?? null,
    regleApresCloture: options.regleApresCloture ?? false,
  };
}

/** Ce que la doublure lit d'une demande de sommes par compte. */
interface ArgsSommes {
  by: string[];
  where: {
    lettre?: null;
    OR?: unknown[];
    compteId?: { in: string[] };
    compte?: { classe: ClasseCompte };
    dateEcheance?: Record<string, Date>;
  };
  _sum: { debit?: boolean; credit?: boolean };
}

/**
 * DOUBLURE DE `ligneEcriture.groupBy` · elle filtre comme la base filtrerait,
 * borne d'échéance comprise, puis somme par compte. Elle refuse toute forme
 * qu'elle ne sait pas lire (un autre regroupement, un opérateur de date
 * qu'elle ne connaît pas) · une doublure qui ignorerait la borne rendrait la même somme à
 * l'échu et au non échu, et validerait un service qui ne les distingue plus.
 */
function sommesDesLignesTiers(lignesTiers: ReturnType<typeof ligneTiers>[]) {
  return jest.fn(({ by, where, _sum }: ArgsSommes) => {
    if (by.length !== 1 || by[0] !== 'compteId') throw new Error(`Regroupement inattendu : ${by.join(', ')}`);
    if (!_sum.debit || !_sum.credit) throw new Error('Les deux sommes, débit et crédit, sont attendues');
    // Les quatre comparaisons sont honorées comme la base les lirait · une
    // borne décalée d'un jour (`lt` pour `lte`) se voit alors à la VALEUR
    // rendue, et non parce que la doublure l'aurait refusée.
    const borne = where.dateEcheance;
    if (borne) {
      for (const op of Object.keys(borne)) {
        if (!['gt', 'gte', 'lt', 'lte'].includes(op)) throw new Error(`Borne d'échéance inattendue : ${op}`);
      }
    }
    const parCompte = new Map<string, { debit: number; credit: number }>();
    for (const l of lignesTiers) {
      if (where.lettre === null && l.lettre !== null) continue;
      // Ouverte à la clôture (audit final F10) · non lettrée, ou soldée par
      // un règlement postérieur.
      if (where.OR && l.lettre !== null && !l.regleApresCloture) continue;
      if (where.compteId && !where.compteId.in.includes(l.compteId)) continue;
      if (where.compte && l.classe !== where.compte.classe) continue;
      if (borne) {
        // Comme en SQL, une échéance nulle ne satisfait aucune comparaison.
        if (!l.dateEcheance) continue;
        if (borne.gt && !(l.dateEcheance > borne.gt)) continue;
        if (borne.gte && !(l.dateEcheance >= borne.gte)) continue;
        if (borne.lt && !(l.dateEcheance < borne.lt)) continue;
        if (borne.lte && !(l.dateEcheance <= borne.lte)) continue;
      }
      // La base somme des DÉCIMAUX · la doublure somme donc en centimes
      // entiers, pour rendre ce que Postgres rendrait et non une addition de
      // flottants (0,1 + 0,2 ne fait pas 0,3 en flottant).
      const cumul = parCompte.get(l.compteId) ?? { debit: 0, credit: 0 };
      cumul.debit += Math.round(l.debit * 100);
      cumul.credit += Math.round(l.credit * 100);
      parCompte.set(l.compteId, cumul);
    }
    return Promise.resolve(
      [...parCompte].map(([compteId, s]) => ({ compteId, _sum: { debit: s.debit / 100, credit: s.credit / 100 } })),
    );
  });
}

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
    // L'ordre de saisie départage deux écritures du même jour dans le
    // journal de la NOTE 4 · la date suffit aux jeux d'essai.
    createdAt: new Date(date),
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

/** Ce que la doublure lit d'une demande d'écritures (voir `ecriture.findMany`). */
interface ArgsEcritures {
  where: {
    estGenereeParCloture?: boolean;
    lignes?: { some?: { compte?: { OR?: Array<{ numero: { startsWith: string } }> } } };
  };
  cursor?: { id: string };
  skip?: number;
  take?: number;
}

function service(
  lignesParExercice: Record<string, LigneTest[]>,
  options: {
    exercices?: Array<{ id: string; dateDebut: Date }>;
    ecritures?: ReturnType<typeof ecriture>[];
    immobilisations?: unknown[];
    tiersComptes?: Array<{ compteId: string; tiers: { nom: string } }>;
    lignesTiers?: ReturnType<typeof ligneTiers>[];
    devise?: string | null;
    campagne?: unknown;
    campagneExerciceId?: string;
    /** Forme juridique du dossier · les états des garanties en dépendent. */
    forme?: FormeJuridiqueSyscohada | null;
  } = {},
) {
  // LES EXERCICES DU DOSSIER · ceux qu'on déclare, sinon un par balance
  // servie. Un exercice que le dossier ne connaît pas est refusé (audit final
  // F222), et une doublure muette sur ce point testerait le refus au lieu de
  // l'état.
  const exercices =
    options.exercices ??
    Object.keys(lignesParExercice).map((id) => ({ id, dateDebut: new Date('2026-01-01T00:00:00Z') }));
  const ecritureService = {
    balance: jest.fn().mockImplementation((_t: string, exerciceId: string) => {
      const lignes = lignesParExercice[exerciceId] ?? [];
      return Promise.resolve({ lignes, totaux: { debit: 0, credit: 0 } });
    }),
  } as unknown as EcritureService;

  const exerciceService = {
    lister: jest
      .fn()
      .mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;

  const prisma = {
    // La doublure respecte `where.estGenereeParCloture` : sans quoi le test
    // « les écritures de clôture sont écartées » ne testerait que la doublure.
    // Elle respecte aussi, depuis l'audit final F258, le filtre « au moins une
    // ligne de trésorerie » et la PAGINATION (tri par identifiant, curseur
    // exclu par `skip`, `take`) · la correction repose sur l'un et l'autre,
    // et une doublure qui rendrait tout d'un coup validerait une lecture par
    // tranches qui compterait deux fois l'écriture du curseur.
    ecriture: {
      findMany: jest.fn().mockImplementation(({ where, cursor, skip, take }: ArgsEcritures) => {
        const prefixes = where.lignes?.some?.compte?.OR?.map((o) => o.numero.startsWith);
        const retenues = [...(options.ecritures ?? [])]
          .filter((e) =>
            where.estGenereeParCloture === undefined ? true : e.estGenereeParCloture === where.estGenereeParCloture,
          )
          .filter((e) => !prefixes || e.lignes.some((l) => prefixes.some((p) => l.compte.numero.startsWith(p))))
          .sort((a, b) => a.id.localeCompare(b.id));
        const debut = cursor ? retenues.findIndex((e) => e.id === cursor.id) + (skip ?? 0) : 0;
        return Promise.resolve(retenues.slice(debut, take === undefined ? undefined : debut + take));
      }),
    },
    // La doublure respecte TOUS les filtres du `where` de `partsParEcheance`
    // et la borne d'ÉCHÉANCE de chacune de ses deux sommes (audit final F258) ·
    // sans quoi le test du périmètre (postes SA3/SP4 et non « classe 4 »),
    // celui du lettrage et celui de l'échéance au jour de la clôture ne
    // testeraient que la doublure. Une borne qu'elle ne sait pas lire la fait
    // tomber, plutôt que de rendre une somme qui l'ignorerait.
    ligneEcriture: { groupBy: sommesDesLignesTiers(options.lignesTiers ?? []) },
    // Honore le dossier, la borne d'acquisition et l'exclusion des biens
    // sortis avant l'ouverture (passe R6, E15) · une doublure qui rendrait
    // tout validerait une note qui compterait un bien sorti depuis des années.
    immobilisation: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          ((options.immobilisations ?? []) as any[]).filter((i) => {
            if (where?.tenantId !== 't1') return false;
            if (where.dateAcquisition?.lte && i.dateAcquisition > where.dateAcquisition.lte) return false;
            if (where.OR) {
              return where.OR.some((o: any) =>
                o.dateSortie === null ? i.dateSortie === null : i.dateSortie !== null && i.dateSortie >= o.dateSortie.gte,
              );
            }
            return true;
          }),
        ),
      ),
    },
    // La campagne d'inventaire lue par la note 2 · la doublure honore le
    // dossier et l'exercice, et l'exigence d'un stock compté (audit final F85).
    campagneInventaire: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          options.campagne && where.tenantId === 't1' && where.exerciceId === (options.campagneExerciceId ?? 'e1') &&
            where.fiches?.some?.compte?.classe === 'CLASSE_3'
            ? options.campagne
            : null,
        ),
      ),
    },
    tiersCompte: { findMany: jest.fn().mockResolvedValue(options.tiersComptes ?? []) },
    tenant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({
          devise: 'devise' in options ? options.devise : 'CDF',
          systemeComptableSyscohada: 'MINIMAL_TRESORERIE',
          formeJuridiqueSyscohada: options.forme ?? null,
        }),
    },
    // Honore le dossier ET l'identifiant · un exercice inconnu ne rend rien,
    // et c'est sur ce rien que porte le refus de l'audit final F222.
    exercice: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(
          where.tenantId === 't1' && exercices.some((e) => e.id === where.id)
            ? { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }
            : null,
        ),
      ),
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

  it('NOTE 1 · ne totalise que les biens détenus, présente à part ceux sortis dans l’exercice (passe R6, E15)', async () => {
    const s = service(
      {
        e1: [
          ligne('24410000', ClasseCompte.CLASSE_2, 3_000_000, 0),
          ligne('27510000', ClasseCompte.CLASSE_2, 90_000, 0),
        ],
      },
      {
        immobilisations: [
          { designation: 'Camionnette', valeurOrigine: 3_000_000, compteImmobilisationId: 'id-24410000', dateAcquisition: new Date('2025-02-01'), dateSortie: null, prixCession: null },
          { designation: 'Ordinateur cédé', valeurOrigine: 800_000, compteImmobilisationId: 'id-24410000', dateAcquisition: new Date('2024-02-01'), dateSortie: new Date('2026-06-30'), prixCession: 200_000 },
          { designation: 'Chaise sortie en 2025', valeurOrigine: 50_000, compteImmobilisationId: 'id-24410000', dateAcquisition: new Date('2023-02-01'), dateSortie: new Date('2025-06-30'), prixCession: null },
        ],
      },
    );
    const note = await s.note1MaterielMobilierCautions('t1', 'e1');
    expect(note.lignes.filter((l) => l.origine === 'REGISTRE').map((l) => l.designation)).toEqual(['Camionnette']);
    expect(note.totalRegistre).toBe(3_000_000);
    expect(note.total).toBe(3_090_000);
    expect(note.sortiesDeLExercice.map((l) => [l.designation, l.prixCession])).toEqual([['Ordinateur cédé', 200_000]]);
    // Le registre recoupe la balance compte par compte · aucun écart ici.
    expect(note.ecartsImmobilisations).toEqual([]);
    expect(note.motifEcartsImmobilisations).toBeNull();
  });

  it('NOTE 1 · nomme le compte de classe 2 que les fiches ne reconstituent pas, et la fiche sans solde', async () => {
    const s = service(
      { e1: [ligne('24410000', ClasseCompte.CLASSE_2, 3_500_000, 0), ligne('28440000', ClasseCompte.CLASSE_2, 0, 600_000)] },
      {
        immobilisations: [
          { designation: 'Camionnette', valeurOrigine: 3_000_000, compteImmobilisationId: 'id-24410000', dateAcquisition: new Date('2026-02-01'), dateSortie: null, prixCession: null },
          { designation: 'Logiciel', valeurOrigine: 100_000, compteImmobilisationId: 'id-21300000', dateAcquisition: new Date('2026-02-01'), dateSortie: null, prixCession: null },
        ],
      },
    );
    const note = await s.note1MaterielMobilierCautions('t1', 'e1');
    // Le 28 n'est pas confronté · un amortissement n'a pas de fiche à lui.
    expect(note.ecartsImmobilisations).toEqual([
      { numero: '24410000', intitule: 'Compte 24410000', soldeBalance: 3_500_000, valeurFiches: 3_000_000, ecart: 500_000 },
    ]);
    expect(note.fichesSansSolde).toEqual([{ designation: 'Logiciel', montant: 100_000 }]);
    expect(note.motifEcartsImmobilisations).toContain('Immobilisations');
  });

  it('NOTE 2 · le stock final moins le stock initial EST la ligne SV1', async () => {
    const s = negoce();
    const [note, cr] = await Promise.all([s.note2Stocks('t1', 'e2026'), s.compteDeResultat('t1', 'e2026')]);
    expect(note.valeurStockFinal).toBe(120_000);
    expect(note.valeurStockInitial).toBe(0);
    expect(note.variationSv1).toBe(ligneCr(cr, 'SV1').montant);
    // Sans campagne d'inventaire : les quantités restent vides, jamais un « 1 ».
    expect(note.lignes[0].quantite).toBeNull();
    expect(note.quantitesTenues).toBe(false);
    expect(note.motifQuantites).toContain("Aucune campagne d'inventaire n'est enregistrée pour cet exercice");
    expect(note.motifQuantites).toContain('Titre X ch. 1 § 1');
  });

  it('NOTE 2 · sert quantité et prix unitaire depuis la campagne, sans toucher au total SV1 (audit final F85)', async () => {
    const s = service(
      { e2026: BALANCE_NEGOCE },
      {
        ecritures: ECRITURES_NEGOCE,
        campagneExerciceId: 'e2026',
        campagne: {
          libelle: 'Inventaire magasin',
          dateInventaire: new Date('2026-12-31T00:00:00Z'),
          fiches: [
            { designation: 'Ciment', uniteMesure: 'sac', quantiteComptee: 12, valeurInventaire: 120_000, compte: { numero: '31110000' } },
          ],
        },
      },
    );
    const [note, cr] = await Promise.all([s.note2Stocks('t1', 'e2026'), s.compteDeResultat('t1', 'e2026')]);
    expect(note.lignes).toEqual([
      { reference: '31110000', designation: 'Ciment (sac)', quantite: 12, prixUnitaire: 10_000, montant: 120_000 },
    ]);
    expect(note.quantitesTenues).toBe(true);
    expect(note.sourceQuantites).toContain('« Inventaire magasin »');
    expect(note.variationSv1).toBe(ligneCr(cr, 'SV1').montant);
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

  it("NOTE 3 · le dossier qui n'a saisi AUCUNE échéance rend ce qu'il rendait, et le dit", async () => {
    // Le cas de TOUS les dossiers réels : `dateEcheance` existe au schéma
    // depuis longtemps, aucun ne la renseigne. La note doit donc porter
    // exactement les mêmes montants qu'avant · ventiler d'office viderait
    // ou remplirait la note à tort chez tout le monde.
    const note = await negoce().note3CreancesDettes('t1', 'e2026');
    expect(note.totalCreances).toBe(200_000);
    expect(note.totalDettes).toBe(50_000);
    // Rien n'est daté : rien n'est affirmé échu, rien n'est affirmé non échu.
    expect(note.totalCreancesNonEchues).toBe(0);
    expect(note.totalCreancesEchues).toBe(0);
    expect(note.totalDettesNonEchues).toBe(0);
    expect(note.totalDettesEchues).toBe(0);
    // Tout le solde reste au bilan, NOMMÉ comme non ventilé.
    expect(note.totalCreancesNonVentilees).toBe(200_000);
    expect(note.totalDettesNonVentilees).toBe(50_000);
    expect(note.creances[0].montantNonVentile).toBe(200_000);
    expect(note.echeancesTenues).toBe(false);
    expect(note.motifEcheances).toContain('non échues');
  });

  it("NOTE 3 · ventile à la CLÔTURE, et les trois parts somment toujours au solde", async () => {
    const s = service(
      { e1: [ligne('41110000', ClasseCompte.CLASSE_4, 300_000, 0)] },
      {
        lignesTiers: [
          ligneTiers('41110000', { debit: 120_000 }, { echeance: '2027-01-31' }), // terme à venir
          ligneTiers('41110000', { debit: 100_000 }, { echeance: '2026-11-30' }), // terme passé
          ligneTiers('41110000', { debit: 80_000 }), // aucun terme saisi
        ],
      },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    const c = note.creances[0];
    // « État des créances et des dettes NON ÉCHUES AU 31 DÉCEMBRE » : la date
    // de référence est la clôture, pas le jour de la consultation.
    expect(c.montantNonEchu).toBe(120_000);
    expect(c.montantEchu).toBe(100_000);
    // La part non ventilée est un RESTE, jamais une mesure autonome.
    expect(c.montantNonVentile).toBe(80_000);
    expect(c.montantNonEchu + c.montantEchu + c.montantNonVentile).toBe(c.montantCloture);
    // Une seule ligne non datée suffit à retirer à la note le droit
    // d'affirmer que son total est celui du non échu.
    expect(note.echeancesTenues).toBe(false);
  });

  it("NOTE 3 · l'échéance tombant LE JOUR de la clôture est échue, le terme est atteint", async () => {
    const s = service(
      { e1: [ligne('41110000', ClasseCompte.CLASSE_4, 50_000, 0)] },
      { lignesTiers: [ligneTiers('41110000', { debit: 50_000 }, { echeance: '2026-12-31' })] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantEchu).toBe(50_000);
    expect(note.creances[0].montantNonEchu).toBe(0);
    // Tout est daté : la ventilation est complète et la note peut le dire.
    expect(note.echeancesTenues).toBe(true);
    expect(note.motifEcheances).toBeNull();
  });

  // AUDIT FINAL F10 · réglée et lettrée APRÈS la clôture, elle était
  // ouverte au 31 décembre.
  it('NOTE 3 · une ligne soldée après la clôture reste dans la ventilation', async () => {
    const s = service(
      { e1: [ligne('41110000', ClasseCompte.CLASSE_4, 700_000, 0)] },
      {
        lignesTiers: [
          ligneTiers('41110000', { debit: 200_000 }, { echeance: '2027-02-28' }),
          ligneTiers('41110000', { debit: 500_000 }, { echeance: '2027-05-31', lettre: 'A', regleApresCloture: true }),
        ],
      },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantNonEchu).toBe(700_000);
  });

  it('NOTE 3 · une ligne lettrée est soldée et sort de la ventilation', async () => {
    const s = service(
      { e1: [ligne('41110000', ClasseCompte.CLASSE_4, 200_000, 0)] },
      {
        lignesTiers: [
          ligneTiers('41110000', { debit: 200_000 }, { echeance: '2027-02-28' }),
          // Facture encaissée : plus aucune échéance à porter. La compter
          // gonflerait le non échu de 500 000 et rendrait le reste négatif.
          ligneTiers('41110000', { debit: 500_000 }, { echeance: '2027-05-31', lettre: 'A' }),
        ],
      },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances[0].montantNonEchu).toBe(200_000);
    expect(note.creances[0].montantNonVentile).toBe(0);
    expect(note.echeancesTenues).toBe(true);
  });

  it('NOTE 3 · une dette non échue se lit en POSITIF sous un total de dettes', async () => {
    const s = service(
      { e1: [ligne('40110000', ClasseCompte.CLASSE_4, 0, 150_000)] },
      { lignesTiers: [ligneTiers('40110000', { credit: 150_000 }, { echeance: '2027-03-31' })] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    // Même signe que le poste SP4 du bilan · sans lui, la maquette imprimerait
    // -150 000 de dettes non échues sous un total de dettes de +150 000.
    expect(note.dettes[0].montantCloture).toBe(150_000);
    expect(note.dettes[0].montantNonEchu).toBe(150_000);
    expect(note.dettes[0].montantNonVentile).toBe(0);
    expect(note.totalDettesNonEchues).toBe(150_000);
  });

  it('NOTE 3 · ventile les 50 et 51 que SA3 joint, que la classe 4 aurait manqués', async () => {
    // Anomalie n° 6 : SA3 « Clients et débiteurs divers » joint les titres de
    // placement et les valeurs à encaisser, qui ne sont ni caisse ni banque.
    // C'est ce qui distingue ce jumeau du SYCEBNL, dont le bilan lit la seule
    // classe 4 · une ventilation bornée à la classe 4 rendrait ici « non
    // ventilé » un effet à encaisser parfaitement daté.
    const s = service(
      { e1: [ligne('51210000', ClasseCompte.CLASSE_5, 400_000, 0)] },
      { lignesTiers: [ligneTiers('51210000', { debit: 400_000 }, { echeance: '2027-06-30' })] },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');
    expect(note.creances.map((c) => c.numero)).toEqual(['51210000']);
    expect(note.creances[0].montantNonEchu).toBe(400_000);
    expect(note.echeancesTenues).toBe(true);
  });

  // AUDIT FINAL F258 · les deux parts sont demandées à la base, par deux
  // sommes, au lieu des lignes ouvertes rapatriées une à une. La ventilation
  // doit rester celle de la lecture ligne à ligne, au centime, sur un jeu où
  // les centimes ne tombent pas juste en flottant (0,10 + 0,20), où une
  // échéance tombe le jour de la clôture, où une ligne n'est pas datée, et où
  // le lettrage retire une ligne et en laisse une autre.
  it('NOTE 3 · deux sommes demandées à la base, la ventilation de la lecture ligne à ligne au centime', async () => {
    const lignesTiers = [
      ligneTiers('41110000', { debit: 0.1 }, { echeance: '2027-01-15' }),
      ligneTiers('41110000', { debit: 0.2 }, { echeance: '2027-02-15' }),
      ligneTiers('41110000', { debit: 1_234.57 }, { echeance: '2026-12-31' }), // le jour de la clôture
      ligneTiers('41110000', { credit: 0.07 }, { echeance: '2026-10-01' }),
      ligneTiers('41110000', { debit: 999.99 }), // aucun terme saisi
      ligneTiers('41110000', { debit: 333.33 }, { echeance: '2027-03-01', lettre: 'B', regleApresCloture: true }),
      ligneTiers('41110000', { debit: 777.77 }, { echeance: '2027-04-01', lettre: 'C' }), // soldée avant la clôture
      ligneTiers('40110000', { credit: 100.1 }, { echeance: '2027-01-10' }),
      ligneTiers('40110000', { credit: 200.2 }, { echeance: '2026-11-11' }),
      ligneTiers('40110000', { debit: 50.05 }, { echeance: '2026-12-01' }),
      ligneTiers('51210000', { debit: 0.3 }, { echeance: '2027-06-30' }),
    ];
    const s = service(
      {
        e1: [
          ligne('41110000', ClasseCompte.CLASSE_4, 2_568.12, 0),
          ligne('40110000', ClasseCompte.CLASSE_4, 0, 250.25),
          ligne('51210000', ClasseCompte.CLASSE_5, 0.3, 0),
        ],
      },
      { lignesTiers },
    );
    const note = await s.note3CreancesDettes('t1', 'e1');

    // LA LECTURE D'AVANT, rejouée ici telle qu'elle était écrite · ligne par
    // ligne, en flottant, sur les lignes ouvertes à la clôture.
    const cloture = new Date('2026-12-31');
    const reference = new Map<string, { nonEchu: number; echu: number }>();
    for (const l of lignesTiers) {
      if (l.lettre !== null && !l.regleApresCloture) continue;
      const montant = l.debit - l.credit;
      if (montant === 0 || !l.dateEcheance) continue;
      const parts = reference.get(l.compteId) ?? { nonEchu: 0, echu: 0 };
      if (l.dateEcheance > cloture) parts.nonEchu += montant;
      else parts.echu += montant;
      reference.set(l.compteId, parts);
    }
    const auCentime = (x: number) => Math.round(x * 100);
    const lignesNote = [
      ...note.creances.map((c) => ({ ...c, signe: 1 })),
      ...note.dettes.map((d) => ({ ...d, signe: -1 })),
    ];
    expect(lignesNote.map((l) => l.numero).sort()).toEqual(['40110000', '41110000', '51210000']);
    for (const l of lignesNote) {
      const ref = reference.get(`id-${l.numero}`)!;
      expect(auCentime(l.montantNonEchu)).toBe(auCentime(l.signe * ref.nonEchu));
      expect(auCentime(l.montantEchu)).toBe(auCentime(l.signe * ref.echu));
    }

    // Et les montants attendus, écrits à la main pour ne pas dépendre de la
    // seule référence rejouée.
    const client = note.creances.find((c) => c.numero === '41110000')!;
    expect(client.montantNonEchu).toBeCloseTo(333.63, 2); // 0,10 + 0,20 + 333,33
    expect(client.montantEchu).toBeCloseTo(1_234.5, 2); // 1 234,57 - 0,07, clôture comprise
    expect(client.montantNonVentile).toBeCloseTo(999.99, 2);
    const fournisseur = note.dettes.find((d) => d.numero === '40110000')!;
    expect(fournisseur.montantNonEchu).toBeCloseTo(100.1, 2);
    expect(fournisseur.montantEchu).toBeCloseTo(150.15, 2); // 200,20 - 50,05
    expect(note.creances.find((c) => c.numero === '51210000')!.montantNonEchu).toBeCloseTo(0.3, 2);

    // LA FORME DE LA LECTURE · deux sommes par compte, bornées par
    // l'échéance de part et d'autre de la clôture, sur les seuls comptes des
    // postes SA3 et SP4 du livre-journal, et aucune ligne rapatriée.
    const prisma = (s as unknown as { prisma: { ligneEcriture: Record<string, jest.Mock> } }).prisma;
    expect(Object.keys(prisma.ligneEcriture)).toEqual(['groupBy']);
    const appels = prisma.ligneEcriture.groupBy.mock.calls.map(([args]) => args as ArgsSommes);
    expect(appels).toHaveLength(2);
    expect(appels.map((a) => a.where.dateEcheance)).toEqual([{ gt: cloture }, { lte: cloture }]);
    for (const a of appels) {
      expect(a.by).toEqual(['compteId']);
      expect(a._sum).toEqual({ debit: true, credit: true });
      expect([...(a.where.compteId?.in ?? [])].sort()).toEqual(['id-40110000', 'id-41110000', 'id-51210000']);
      expect((a.where as { ecriture?: unknown }).ecriture).toEqual({
        tenantId: 't1',
        exerciceId: 'e1',
        statut: 'VALIDEE',
      });
    }
  });

  it("NOTE 3 · la table ne renvoie à la note 3 que les deux postes SA3 et SP4", () => {
    // Prémisse de `REFS_NOTE_3_SMT_SYSCOHADA` dans le service : si un renvoi
    // bougeait dans la table sans bouger là-bas, la note imprimerait un
    // tableau qui ne justifie plus le poste du bilan qu'il accompagne.
    const refs = [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA]
      .filter((p) => p.note === '3')
      .map((p) => p.ref);
    expect(refs).toEqual(['SA3', 'SP4']);
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
    // Ni verdict par seuil (audit final F88) · francs congolais contre F CFA,
    // la comparaison n'a jamais d'objet sans cours. La forme d'un seuil est
    // gelée entière.
    for (const s of e.seuils) expect(Object.keys(s).sort()).toEqual(['categorie', 'clause', 'cle', 'montantFcfa']);
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

// ---------------------------------------------------------------------------
// AUDIT FINAL F215, F218, F222, F258
// ---------------------------------------------------------------------------

/** Les appels faits à la doublure `ecriture.findMany` · la forme même des demandes. */
function demandesEcritures(s: EtatsFinanciersSmtSyscohadaService) {
  const prisma = (s as unknown as { prisma: { ecriture: { findMany: jest.Mock } } }).prisma;
  return prisma.ecriture.findMany.mock.calls.map(([args]) => args as Record<string, unknown> & ArgsEcritures);
}

/** `n` ventes encaissées en caisse, 1 000 chacune · des écritures de trésorerie à la chaîne. */
function ventesComptant(n: number) {
  return Array.from({ length: n }, (_, i) =>
    ecriture(`v${String(i).padStart(6, '0')}`, '2026-03-01', `Vente ${i}`, [
      { numero: '57110000', debit: 1_000 },
      { numero: '70110000', credit: 1_000 },
    ]),
  );
}

describe('lecture des écritures bornée · audit final F258', () => {
  it('ne demande que des écritures de TRÉSORERIE, par tranches, sans le compte entier', async () => {
    const s = negoce();
    await s.compteDeResultat('t1', 'e2026');
    await s.journalTresorerie('t1', 'e2026');
    const demandes = demandesEcritures(s);
    expect(demandes.length).toBeGreaterThan(0);
    for (const d of demandes) {
      // Une tranche, jamais tout l'exercice d'un coup (§ 8 bis).
      expect(d.take).toBe(LOT_ECRITURES);
      // Au moins une ligne sur un compte de trésorerie : les écritures
      // d'engagement n'entrent que par la balance.
      expect(d.where.lignes?.some?.compte?.OR?.map((o) => o.numero.startsWith)).toEqual([
        '52', '53', '54', '55', '56', '57', '58',
      ]);
      // Une sélection de colonnes, pas le compte ni l'écriture entiers.
      expect(d).toHaveProperty('select');
      expect(d).not.toHaveProperty('include');
    }
  });

  it('lit un exercice de plus d’une tranche sans perdre ni recompter l’écriture du curseur', async () => {
    const n = LOT_ECRITURES * 2 + 1;
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, n * 1_000, 0), ligne('70110000', ClasseCompte.CLASSE_7, 0, n * 1_000)] },
      { ecritures: ventesComptant(n) },
    );
    const cr = await s.compteDeResultat('t1', 'e1');
    expect(cr.totalRecettes).toBe(n * 1_000);
    expect(cr.controle.concordant).toBe(true);
    expect(demandesEcritures(s)).toHaveLength(3);
    const j = await s.journalTresorerie('t1', 'e1');
    expect(j.journaux[0].operations).toHaveLength(n);
    expect(j.journaux[0].boucle).toBe(true);
  });

  it('retrouve l’écart de concordance par différence avec la balance, sans relire les écritures d’engagement', async () => {
    // L'apport (1 000 000, classe 1) et l'achat du matériel (400 000, classe 2)
    // passent par la banque : ils sont À EFFET et ne sont pas des écarts. La
    // dotation (80 000 au 284) n'y passe pas : elle est l'écart, et F la
    // reprend. Sans la soustraction de la part à effet, la classe 1 vaudrait
    // 1 000 000 et la classe 2 -320 000.
    const cr = await negoce().compteDeResultat('t1', 'e2026');
    expect(cr.controle.composantesEcart).toEqual({
      classe1: 0,
      classe2: 80_000,
      depreciationsTresorerie: 0,
      autresComptes: 0,
      dotations: 80_000,
      total: 0,
    });
    expect(cr.controle.residuel).toBe(0);
  });

  it('refuse la NOTE 4 au-delà de son plafond déclaré, en disant par où passer · jamais un journal tronqué', async () => {
    // Le plafond est celui du grand livre · une seule mesure pour deux livres.
    expect(PLAFOND_MOUVEMENTS_NOTE_4_SMT_SYSCOHADA).toBe(PLAFOND_LIGNES_GRAND_LIVRE);
    const n = PLAFOND_MOUVEMENTS_NOTE_4_SMT_SYSCOHADA + LOT_ECRITURES * 3;
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, n * 1_000, 0), ligne('70110000', ClasseCompte.CLASSE_7, 0, n * 1_000)] },
      { ecritures: ventesComptant(n) },
    );
    const refus = s.journalTresorerie('t1', 'e1');
    await expect(refus).rejects.toBeInstanceOf(BadRequestException);
    await expect(refus).rejects.toThrow('grand livre de chaque compte de trésorerie');
    // La lecture s'arrête au plafond franchi · la tranche qui le franchit est
    // la dernière demandée, les suivantes ne le sont jamais.
    expect(demandesEcritures(s)).toHaveLength(Math.ceil((PLAFOND_MOUVEMENTS_NOTE_4_SMT_SYSCOHADA + 1) / LOT_ECRITURES));
  });

  it('sert la NOTE 4 entière au plafond exactement', async () => {
    const n = PLAFOND_MOUVEMENTS_NOTE_4_SMT_SYSCOHADA;
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, n * 1_000, 0), ligne('70110000', ClasseCompte.CLASSE_7, 0, n * 1_000)] },
      { ecritures: ventesComptant(n) },
    );
    const j = await s.journalTresorerie('t1', 'e1');
    expect(j.journaux[0].operations).toHaveLength(n);
    expect(j.journaux[0].boucle).toBe(true);
  });

  it('remet le journal dans l’ordre du livre · date comptable, puis ordre de saisie', async () => {
    // Les identifiants (ordre de lecture) disent l'inverse des dates.
    const s = service(
      { e1: [ligne('57110000', ClasseCompte.CLASSE_5, 300, 0), ligne('70110000', ClasseCompte.CLASSE_7, 0, 300)] },
      {
        ecritures: [
          ecriture('a', '2026-05-01', 'Troisième', [{ numero: '57110000', debit: 100 }, { numero: '70110000', credit: 100 }]),
          ecriture('b', '2026-02-01', 'Premier', [{ numero: '57110000', debit: 100 }, { numero: '70110000', credit: 100 }]),
          ecriture('c', '2026-03-01', 'Deuxième', [{ numero: '57110000', debit: 100 }, { numero: '70110000', credit: 100 }]),
        ],
      },
    );
    const j = await s.journalTresorerie('t1', 'e1');
    expect(j.journaux[0].operations.map((o) => o.libelle)).toEqual(['Premier', 'Deuxième', 'Troisième']);
    expect(j.journaux[0].operations.map((o) => o.solde)).toEqual([100, 200, 300]);
  });
});

describe('exercice introuvable · un refus, jamais des états vides (audit final F222)', () => {
  it('refuse le bilan, le compte de résultat, les NOTES 1 à 4 et l’éligibilité d’un exercice inconnu du dossier', async () => {
    const s = negoce();
    await expect(s.bilan('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.compteDeResultat('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    // Le journal ne lisait aucun exercice · il rendait des journaux vides, lus
    // « aucun compte de trésorerie mouvementé ».
    await expect(s.journalTresorerie('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.note1MaterielMobilierCautions('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.eligibilite('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    // Les NOTES 2 et 3 le refusent aussi, chacune pour son compte · la
    // NOTE 3 ne lisait l'exercice que lorsqu'un compte de tiers était à
    // ventiler, et une balance vide n'en a aucun.
    await expect(s.note2Stocks('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.note3CreancesDettes('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('monnaie du jeu légal · audit final F215', () => {
  it('nomme la monnaie de tenue même quand la devise du dossier n’est pas renseignée', async () => {
    const s = service({ e1: [ligne('70110000', ClasseCompte.CLASSE_7, 0, 100)] }, { devise: null });
    const e = await s.eligibilite('t1', 'e1');
    // Loi n° 23/053 art. 141, 1° et AUDCIF art. 17, 1° · jamais nulle, jamais choisie.
    expect(e.deviseDossier).toBe('CDF');
  });
});

describe('le 130 est un orphelin VOULU du bilan S.M.T · audit final F218', () => {
  it('le signale comme compte non rattaché, sans l’additionner à aucun poste', async () => {
    // Résultat N-1 en instance d'affectation, resté au 31 décembre : il doit
    // être soldé. Le bilan ne boucle pas, et la cause est nommée.
    const s = service({
      e1: [ligne('13010000', ClasseCompte.CLASSE_1, 0, 50_000), ligne('57110000', ClasseCompte.CLASSE_5, 50_000, 0)],
    });
    const bilan = await s.bilan('t1', 'e1');
    expect(bilan.comptesNonRattaches.map((c) => c.numero)).toEqual(['13010000']);
    expect(poste(bilan, 'SA4').montant).toBe(50_000);
    expect(poste(bilan, 'SP2').montant).toBe(0);
    expect(bilan.equilibre).toBe(false);
  });
});

/**
 * PASSE R2, CONSTAT C1 · SV2 et SV3 ne corrigent que les créances et dettes
 * D'EXPLOITATION (Titre X ch. 1 § 1, ch. 2 § 2). Un tiers que le Titre VII
 * fait naître contre la classe 1 ou 2 (465 dividendes, 4812 fournisseur
 * d'investissement) reste au bilan mais ne fait plus bouger G.
 */
describe('Compte de résultat S.M.T SYSCOHADA · tiers hors exploitation (passe R2, C1)', () => {
  it('un dividende décidé puis payé ne touche pas G · G égale le résultat du bilan', async () => {
    // Report : caisse 500 000 contre report à nouveau. Dans l'exercice, une
    // vente comptant de 100 000, un dividende décidé de 200 000 (Dr 12 / Cr
    // 465, COMPTE 46) dont 150 000 payés en caisse. Résultat : 100 000.
    const s = service(
      {
        e1: [
          ligne('57110000', ClasseCompte.CLASSE_5, 600_000, 150_000, { debit: 500_000 }),
          ligne('12110000', ClasseCompte.CLASSE_1, 200_000, 500_000, { credit: 500_000 }),
          ligne('46500000', ClasseCompte.CLASSE_4, 150_000, 200_000),
          ligne('70110000', ClasseCompte.CLASSE_7, 0, 100_000),
        ],
      },
      {
        ecritures: [
          ecriture('v1', '2026-02-01', 'Vente comptant', [
            { numero: '57110000', debit: 100_000 },
            { numero: '70110000', credit: 100_000 },
          ]),
          ecriture('d1', '2026-05-01', 'Dividende décidé', [
            { numero: '12110000', debit: 200_000 },
            { numero: '46500000', credit: 200_000 },
          ]),
          ecriture('d2', '2026-06-01', 'Dividende payé', [
            { numero: '46500000', debit: 150_000 },
            { numero: '57110000', credit: 150_000 },
          ]),
        ],
      },
    );
    const [cr, bilan, note3] = await Promise.all([
      s.compteDeResultat('t1', 'e1'),
      s.bilan('t1', 'e1'),
      s.note3CreancesDettes('t1', 'e1'),
    ]);
    expect(cr.totalDepenses).toBe(0);
    expect(ligneCr(cr, 'SV3').montant).toBe(0);
    expect(cr.resultatExercice).toBe(100_000);
    expect(poste(bilan, 'SP2').montant).toBe(100_000);
    expect(cr.controle.concordant).toBe(true);
    expect(cr.controle.residuel).toBe(0);
    // Le 465 naît contre le 12 · il se range avec la classe 1, jamais en
    // « autres comptes », où il passerait pour un compte hors plan.
    expect(cr.controle.composantesEcart.classe1).toBe(0);
    expect(cr.controle.composantesEcart.autresComptes).toBe(0);
    // Le paiement est un flux de financement, exposé hors du résultat.
    expect(cr.fluxHorsResultat.find((r) => r.cle === 'financement')!.montant).toBe(-150_000);
    // Le 465 reste au bilan et à la NOTE 3, mais pas dans la variation.
    expect(poste(bilan, 'SP4').montant).toBe(50_000);
    expect(note3.dettes.map((d) => d.numero)).toEqual(['46500000']);
    expect(note3.variationSv3).toBe(ligneCr(cr, 'SV3').montant);
  });

  it('une immobilisation achetée à crédit puis payée ne pèse qu’une fois, par F', async () => {
    // Report : banque 500 000 contre capital. Matériel de 300 000 acheté à
    // crédit (Dr 24 / Cr 4812), 200 000 payés, dotation de 60 000.
    const s = service(
      {
        e1: [
          ligne('52110000', ClasseCompte.CLASSE_5, 500_000, 200_000, { debit: 500_000 }),
          ligne('10300000', ClasseCompte.CLASSE_1, 0, 500_000, { credit: 500_000 }),
          ligne('24410000', ClasseCompte.CLASSE_2, 300_000, 0),
          ligne('28440000', ClasseCompte.CLASSE_2, 0, 60_000),
          ligne('48120000', ClasseCompte.CLASSE_4, 200_000, 300_000),
          ligne('68130000', ClasseCompte.CLASSE_6, 60_000, 0),
        ],
      },
      {
        ecritures: [
          ecriture('i1', '2026-03-01', 'Achat matériel à crédit', [
            { numero: '24410000', debit: 300_000 },
            { numero: '48120000', credit: 300_000 },
          ]),
          ecriture('i2', '2026-04-01', 'Règlement du fournisseur', [
            { numero: '48120000', debit: 200_000 },
            { numero: '52110000', credit: 200_000 },
          ]),
          ecriture('i3', '2026-12-31', 'Dotation', [
            { numero: '68130000', debit: 60_000 },
            { numero: '28440000', credit: 60_000 },
          ]),
        ],
      },
    );
    const [cr, bilan] = await Promise.all([s.compteDeResultat('t1', 'e1'), s.bilan('t1', 'e1')]);
    expect(cr.totalDepenses).toBe(0);
    expect(ligneCr(cr, 'SV3').montant).toBe(0);
    expect(ligneCr(cr, 'SF').montant).toBe(60_000);
    expect(cr.resultatExercice).toBe(-60_000);
    expect(poste(bilan, 'SP2').montant).toBe(-60_000);
    expect(cr.fluxHorsResultat.find((r) => r.cle === 'investissement')!.montant).toBe(-200_000);
    expect(cr.controle.residuel).toBe(0);
  });
});

/**
 * PASSE R2, CONSTAT C4 · les deux journaux de suivi du Titre X ch. 3, servis
 * depuis les factures du livre-journal aux comptes 41 et 40.
 */
describe('Journaux de suivi S.M.T SYSCOHADA (passe R2, C4)', () => {
  type LigneSuivi = {
    id: string;
    tenantId: string;
    exerciceId: string;
    statut: string;
    compteId: string;
    numero: string;
    debit: number;
    credit: number;
    lettre: string | null;
    lettrageId: string | null;
    date: string;
    reference: string | null;
  };
  const L = (o: Partial<LigneSuivi> & Pick<LigneSuivi, 'id' | 'numero' | 'date'>): LigneSuivi => ({
    tenantId: 't1',
    exerciceId: 'e1',
    statut: 'VALIDEE',
    compteId: `id-${o.numero}`,
    debit: 0,
    credit: 0,
    lettre: null,
    lettrageId: null,
    reference: null,
    ...o,
  });
  const LIGNES: LigneSuivi[] = [
    L({ id: 'f1', numero: '41110000', debit: 500_000, date: '2026-02-01', reference: 'FV-001', lettre: 'A', lettrageId: 'g1' }),
    L({ id: 'r1', numero: '41110000', credit: 500_000, date: '2026-03-15', lettre: 'A', lettrageId: 'g1' }),
    L({ id: 'f2', numero: '41110000', debit: 200_000, date: '2026-04-01', reference: 'FV-002', lettrageId: 'g2' }),
    L({ id: 'r2', numero: '41110000', credit: 50_000, date: '2026-05-01', lettrageId: 'g2' }),
    L({ id: 'f3', numero: '40110000', credit: 150_000, date: '2026-06-01', reference: 'FA-77' }),
    L({ id: 'x1', numero: '41110000', debit: 999, date: '2026-06-01', statut: 'BROUILLARD' }),
    L({ id: 'x2', numero: '41110000', debit: 888, date: '2026-06-01', tenantId: 'autre' }),
  ];

  function serviceSuivi() {
    // La doublure honore le dossier, l'exercice, le statut, les deux branches
    // (41 au débit, 40 au crédit) et le filtre par groupe de lettrage.
    const findMany = jest.fn().mockImplementation(({ where }: any) => {
      const surEcriture = (l: LigneSuivi) =>
        l.tenantId === where.ecriture.tenantId &&
        (where.ecriture.exerciceId === undefined || l.exerciceId === where.ecriture.exerciceId) &&
        (where.ecriture.statut === undefined || l.statut === where.ecriture.statut);
      const vers = (l: LigneSuivi) => ({
        id: l.id,
        compteId: l.compteId,
        debit: l.debit,
        credit: l.credit,
        lettre: l.lettre,
        lettrageId: l.lettrageId,
        compte: { numero: l.numero, intitule: `Compte ${l.numero}` },
        ecriture: { date: new Date(l.date), reference: l.reference, numeroPiece: null },
      });
      if (where.lettrageId) {
        return Promise.resolve(LIGNES.filter((l) => surEcriture(l) && l.lettrageId && where.lettrageId.in.includes(l.lettrageId)).map(vers));
      }
      return Promise.resolve(
        LIGNES.filter(
          (l) =>
            surEcriture(l) &&
            where.OR.some(
              (o: any) =>
                l.numero.startsWith(o.compte.numero.startsWith) &&
                (o.debit ? l.debit > o.debit.gt : true) &&
                (o.credit ? l.credit > o.credit.gt : true),
            ),
        ).map(vers),
      );
    });
    const prisma = {
      exercice: { findFirst: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }) },
      ligneEcriture: { findMany },
      tiersCompte: { findMany: jest.fn().mockResolvedValue([{ compteId: 'id-41110000', tiers: { nom: 'Client Mbala' } }]) },
    } as unknown as PrismaService;
    return new EtatsFinanciersSmtSyscohadaService({} as EcritureService, {} as ExerciceService, prisma);
  }

  it('sert les factures aux colonnes du texte, la date de paiement du groupe soldé seulement', async () => {
    const j = await serviceSuivi().journauxDeSuivi('t1', 'e1');
    const creances = j.journaux.find((x) => x.cle === 'creancesImpayees')!;
    const dettes = j.journaux.find((x) => x.cle === 'dettesAPayer')!;
    expect(creances.colonnes).toEqual(['Date', 'N° facture', 'Nom du client', 'Montant', 'Date paiement']);
    expect(creances.lignes.map((l) => [l.numeroFacture, l.nom, l.montant, l.datePaiement?.toISOString().slice(0, 10) ?? null, l.paiementPartiel])).toEqual([
      ['FV-001', 'Client Mbala', 500_000, '2026-03-15', false],
      // Lettrage partiel · la facture n'est pas payée, la date reste vide.
      ['FV-002', 'Client Mbala', 200_000, null, true],
    ]);
    expect(dettes.lignes.map((l) => [l.numeroFacture, l.montant, l.datePaiement])).toEqual([['FA-77', 150_000, null]]);
    expect(j.limite).toContain('comptabilité de trésorerie pure');
  });
});

describe('passes O1a C7 et O6 B3 · les états des garanties que la forme exige au SMT', () => {
  it('une SARL au SMT doit joindre les deux états de l’AUSCGIE art. 139, que le Titre X ne porte pas', async () => {
    const r = await service({ e1: [] }, { forme: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE }).etatsDesGaranties('t1');
    expect(r).toEqual({
      article: 'AUSCGIE art. 139',
      etats: [
        'État des cautionnements, avals et garanties donnés par la société',
        'État des sûretés réelles consenties par la société',
      ],
    });
  });

  it('une coopérative, ceux de l’AUSCOOP art. 109, jamais l’article de l’AUSCGIE', async () => {
    const r = await service({ e1: [] }, { forme: FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE }).etatsDesGaranties('t1');
    expect(r?.article).toBe('AUSCOOP art. 109');
    expect(r?.etats[0]).toContain('garanties personnelles données par la société coopérative');
  });

  it('aucune autre forme n’est visée, ni une forme non déclarée', async () => {
    for (const forme of [
      FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
      FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      FormeJuridiqueSyscohada.ENTREPRENANT,
      FormeJuridiqueSyscohada.SUCCURSALE,
      null,
    ]) {
      expect(await service({ e1: [] }, { forme }).etatsDesGaranties('t1')).toBeNull();
    }
  });

  it('les cinq sociétés commerciales de l’art. 6 sont toutes visées', () => {
    for (const forme of [
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
      FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
      FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
    ]) {
      expect(etatsDesGarantiesDus(forme)?.article).toBe('AUSCGIE art. 139');
    }
  });
});
