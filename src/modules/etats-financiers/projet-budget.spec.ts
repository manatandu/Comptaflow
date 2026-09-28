import { StatutEcriture, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersProjetBudgetService } from './etats-financiers-projet-budget.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { EngagementService } from '../analytique/engagement.service';
import { LOT_ECRITURES, LOT_LECTURE } from '../../common/lecture-par-lots';

/**
 * TABLEAU D'EXÉCUTION BUDGÉTAIRE et TABLEAU DE RÉCONCILIATION DE TRÉSORERIE.
 *
 * Le point sensible du premier est la frontière décaissement/engagement : le
 * guide la pose sur le solde créditeur des comptes fournisseurs, le service
 * la pose écriture par écriture (trésorerie touchée, ou tiers lettré). Les
 * tests vérifient que les deux lectures donnent le même agrégé.
 */

function ligneBalance(numero: string, mouvement: { debit?: number; credit?: number }, report: { debit?: number; credit?: number } = {}) {
  const reportDebit = report.debit ?? 0;
  const reportCredit = report.credit ?? 0;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe: 'CLASSE_5' as const,
    typeCompte: 'DETAIL' as const,
    totalDebit: reportDebit + (mouvement.debit ?? 0),
    totalCredit: reportCredit + (mouvement.credit ?? 0),
    reportDebit,
    reportCredit,
    mouvementDebit: mouvement.debit ?? 0,
    mouvementCredit: mouvement.credit ?? 0,
    solde: reportDebit + (mouvement.debit ?? 0) - reportCredit - (mouvement.credit ?? 0),
  };
}

function ecriture(
  id: string,
  lignes: Array<{
    numero: string;
    debit?: number;
    credit?: number;
    lettre?: string | null;
    section?: string;
    /** Le plan de la ventilation · `p1`, celui du tableau, par défaut. */
    plan?: string;
    regleApresCloture?: boolean;
  }>,
  // La tête de l'écriture · validée, du dossier t1 et de l'exercice e1 par
  // défaut. La changer fait naître l'écriture que la lecture doit ÉCARTER.
  tete: { tenantId?: string; exerciceId?: string; statut?: StatutEcriture; estGenereeParCloture?: boolean } = {},
) {
  return {
    id,
    tenantId: tete.tenantId ?? 't1',
    exerciceId: tete.exerciceId ?? 'e1',
    date: new Date('2026-05-01'),
    statut: tete.statut ?? StatutEcriture.VALIDEE,
    estGenereeParCloture: tete.estGenereeParCloture ?? false,
    lignes: lignes.map((l, i) => ({
      id: `${id}-${i}`,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      lettre: l.lettre ?? null,
      regleApresCloture: l.regleApresCloture ?? false,
      compte: { numero: l.numero, intitule: `Compte ${l.numero}` },
      ventilations: l.section
        ? [{ planId: l.plan ?? 'p1', sectionId: l.section, debit: l.debit ?? 0, credit: l.credit ?? 0 }]
        : [],
    })),
  };
}

type EcritureDeTest = ReturnType<typeof ecriture>;
type LigneDeTest = EcritureDeTest['lignes'][number];
type Filtre = Record<string, unknown>;

/*
  LES DOUBLURES HONORENT CE QUE LA REQUÊTE DEMANDE (audit final F187). Le
  tableau lit l'exercice par tranches, ne demande que les écritures ventilées
  sur le plan (ou, pour la réconciliation, celles qui touchent la
  trésorerie), et ne sélectionne que les colonnes qu'il lit. Une doublure qui
  rendrait tout, dans l'ordre, sans projection, validerait une pagination qui
  saute ou double une tranche, et un `select` qui oublie une colonne. Un
  filtre que la doublure ne sait pas lire LÈVE · l'ignorer élargirait la
  réponse en silence.
*/
function egalites(objet: Record<string, unknown>, where: Filtre): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    if (valeur !== null && typeof valeur === 'object') throw new Error(`filtre non honoré par la doublure : ${cle}`);
    return objet[cle] === valeur;
  });
}

function compteParmi(numero: string, filtre: unknown): boolean {
  return (filtre as { OR: { numero: { startsWith: string } }[] }).OR.some((o) => numero.startsWith(o.numero.startsWith));
}

function ligneSatisfait(l: LigneDeTest, filtre: Filtre): boolean {
  return Object.entries(filtre).every(([cle, valeur]) => {
    if (cle === 'ventilations') {
      const some = (valeur as { some: Filtre }).some;
      return l.ventilations.some((v) => egalites(v, some));
    }
    if (cle === 'compte') return compteParmi(l.compte.numero, valeur);
    throw new Error(`filtre de ligne non honoré par la doublure : ${cle}`);
  });
}

function ecritureSatisfait(e: EcritureDeTest, where: Filtre = {}): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    // Le dossier et l'exercice se comparent par leur VALEUR, comme la garde de
    // cloisonnement · une doublure qui les tiendrait pour acquis laisserait
    // passer une lecture qui a perdu sa borne.
    if (cle === 'tenantId' || cle === 'exerciceId' || cle === 'statut' || cle === 'estGenereeParCloture') {
      return (e as Record<string, unknown>)[cle] === valeur;
    }
    if (cle === 'lignes') return e.lignes.some((l) => ligneSatisfait(l, (valeur as { some: Filtre }).some));
    throw new Error(`filtre d'écriture non honoré par la doublure : ${cle}`);
  });
}

/** Le `select` Prisma, relations comprises, avec le `where` d'une relation multiple. */
function projeter(objet: unknown, select: Filtre): Record<string, unknown> {
  const source = objet as Record<string, unknown>;
  const rendu: Record<string, unknown> = {};
  for (const [cle, spec] of Object.entries(select)) {
    if (spec === true) {
      rendu[cle] = source[cle];
      continue;
    }
    const { select: sous, where } = spec as { select?: Filtre; where?: Filtre };
    const valeur = source[cle];
    if (Array.isArray(valeur)) {
      rendu[cle] = valeur
        .filter((v) => !where || egalites(v as Record<string, unknown>, where))
        .map((v) => (sous ? projeter(v, sous) : v));
    } else {
      if (where) throw new Error(`where sur une relation simple : ${cle}`);
      rendu[cle] = sous ? projeter(valeur, sous) : valeur;
    }
  }
  return rendu;
}

interface ArgumentsLecture {
  where?: Filtre;
  select?: Filtre;
  orderBy?: { id?: 'asc' | 'desc' };
  cursor?: { id: string };
  skip?: number;
  take?: number;
}

/** Tri, curseur INCLUS puis `skip`, puis `take` · l'ordre où Prisma les applique. */
function paginer<T extends { id: string }>(elements: T[], args: ArgumentsLecture): T[] {
  let rendu = [...elements];
  if (args.orderBy?.id) {
    const sens = args.orderBy.id === 'asc' ? 1 : -1;
    rendu.sort((a, b) => (a.id < b.id ? -sens : a.id > b.id ? sens : 0));
  }
  if (args.cursor) {
    const i = rendu.findIndex((e) => e.id === args.cursor!.id);
    rendu = i < 0 ? [] : rendu.slice(i);
  }
  if (args.skip) rendu = rendu.slice(args.skip);
  if (args.take !== undefined) rendu = rendu.slice(0, args.take);
  return rendu;
}

function lireEcritures(ecritures: EcritureDeTest[], args: ArgumentsLecture) {
  const retenues = paginer(ecritures.filter((e) => ecritureSatisfait(e, args.where)), args);
  return retenues.map((e) => (args.select ? projeter(e, args.select) : e));
}

// Les lignes fournisseurs ouvertes à la clôture · non lettrées, ou soldées par
// un règlement postérieur (F10). La règle elle-même est gelée par
// ouverte-a-la-cloture.spec ; la doublure en honore la PRÉSENCE, et la liste
// d'identifiants qui borne la question à une tranche.
function lireLignesOuvertes(ecritures: EcritureDeTest[], where: Filtre) {
  const ids = where.id ? new Set((where.id as { in: string[] }).in) : null;
  return ecritures
    .flatMap((e) => e.lignes.map((l) => ({ e, l })))
    .filter(({ e, l }) =>
      Object.entries(where).every(([cle, valeur]) => {
        // Borne du dossier, de l'exercice et du statut, lue sur l'écriture de la ligne.
        if (cle === 'ecriture') return egalites(e as Record<string, unknown>, valeur as Filtre);
        if (cle === 'id') return ids!.has(l.id);
        if (cle === 'compte') return compteParmi(l.compte.numero, valeur);
        if (cle === 'OR') return l.lettre === null || l.regleApresCloture;
        throw new Error(`filtre de ligne fournisseur non honoré par la doublure : ${cle}`);
      }),
    )
    .map(({ l }) => ({ id: l.id }));
}

function service(options: Parameters<typeof monter>[0] = {}) {
  return monter(options).s;
}

function monter(options: {
  balance?: ReturnType<typeof ligneBalance>[];
  ecritures?: ReturnType<typeof ecriture>[];
  sections?: { id: string; code: string; intitule: string; type: TypeCompteDetailTotal }[];
  budgets?: { sectionId: string; montant: number }[];
  plan?: { id: string; code: string; intitule: string } | null;
  nombreOd?: number;
  engagements?: {
    sectionId: string;
    statut: 'OUVERT' | 'CLOS';
    montant: number;
    executions: { montant: number }[];
  }[];
} = {}) {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({ lignes: options.balance ?? [], totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  const prisma = {
    planAnalytique: {
      findFirst: jest.fn().mockResolvedValue(
        options.plan === undefined ? { id: 'p1', code: 'PROJ', intitule: 'Projets' } : options.plan,
      ),
    },
    sectionAnalytique: { findMany: jest.fn().mockResolvedValue(options.sections ?? []) },
    // LE JEU RÉEL DE `doterBudget` (audit final F37) · une ligne ANNUELLE
    // (`mois` nul) ET une ligne par mois couvert, dont la somme refait
    // l'annuel. La doublure rendait l'annuelle seule, si bien que le tableau
    // additionnait sans filtre et paraissait juste ; elle honore `mois`.
    budgetSection: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { mois?: number | null } }) =>
        Promise.resolve(
          (options.budgets ?? [])
            .flatMap((b) => [
              { sectionId: b.sectionId, mois: null as number | null, montant: b.montant },
              ...Array.from({ length: 12 }, (_, i) => ({ sectionId: b.sectionId, mois: i + 1, montant: b.montant / 12 })),
            ])
            .filter((b) => !('mois' in where) || b.mois === where.mois),
        ),
      ),
    },
    ecriture: {
      findMany: jest
        .fn()
        .mockImplementation((args: ArgumentsLecture) => Promise.resolve(lireEcritures(options.ecritures ?? [], args))),
    },
    exercice: { findFirstOrThrow: jest.fn().mockResolvedValue({ dateFin: new Date('2026-12-31') }) },
    ligneEcriture: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: Filtre }) => Promise.resolve(lireLignesOuvertes(options.ecritures ?? [], where))),
    },
    // Le registre des engagements hors comptabilité · les deux termes NON
    // comptables de la colonne Engagement (guide, ch. 7, APPLICATION 22,
    // règle (d)).
    engagementDepense: { findMany: jest.fn().mockResolvedValue(options.engagements ?? []) },
    // Les OD analytiques du plan · comptées pour être DITES, jamais reprises.
    odAnalytique: { count: jest.fn().mockResolvedValue(options.nombreOd ?? 0) },
  };
  const client = prisma as unknown as PrismaService;
  return { s: new EtatsFinanciersProjetBudgetService(ecritureService, client, new EngagementService(client)), prisma };
}

// Le TYPE est porté, comme en base (`SectionAnalytique.type`, défaut DETAIL) ·
// le faux l'omettait, et une section sans type n'existe pas. C'est ce que
// distingue une FEUILLE d'une RUBRIQUE, et donc ce qui décide de ce qui entre
// dans le total général.
const SECTIONS = [
  { id: 's1', code: 'A1', intitule: 'Formation des animateurs', type: TypeCompteDetailTotal.DETAIL },
  { id: 's2', code: 'A2', intitule: 'Équipement', type: TypeCompteDetailTotal.DETAIL },
];

describe("Tableau d'exécution budgétaire", () => {
  it('classe en DÉCAISSEMENT une dépense payée comptant, en ENGAGEMENT une dépense passée en compte fournisseur', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }, { sectionId: 's2', montant: 500_000 }],
      ecritures: [
        ecriture('paye', [
          { numero: '60100000', debit: 300_000, section: 's1' },
          { numero: '52110000', credit: 300_000 },
        ]),
        ecriture('engage', [
          { numero: '24110000', debit: 200_000, section: 's2' },
          { numero: '48100000', credit: 200_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    const a1 = t.lignes.find((l) => l.code === 'A1')!;
    const a2 = t.lignes.find((l) => l.code === 'A2')!;
    expect(a1.decaissement).toBe(300_000);
    expect(a1.engagement).toBe(0);
    expect(a2.decaissement).toBe(0);
    expect(a2.engagement).toBe(200_000);
    expect(a2.realisation).toBe(200_000);
    expect(a2.creditDisponible).toBe(300_000);
  });

  it('une dépense engagée BASCULE en décaissement une fois la ligne fournisseur lettrée', async () => {
    // C'est ce qui donne son utilité au lettrage sur ce jeu d'états : il ne
    // sert pas qu'à justifier un solde.
    const commun = { sections: SECTIONS, budgets: [{ sectionId: 's1', montant: 1_000_000 }] };
    const avant = service({
      ...commun,
      ecritures: [
        ecriture('f', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000 },
        ]),
      ],
    });
    expect((await avant.executionBudgetaire('t1', 'e1')).lignes[0].engagement).toBe(400_000);

    const apres = service({
      ...commun,
      ecritures: [
        ecriture('f', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000, lettre: 'A' },
        ]),
      ],
    });
    const l = (await apres.executionBudgetaire('t1', 'e1')).lignes[0];
    expect(l.engagement).toBe(0);
    expect(l.decaissement).toBe(400_000);
  });

  /**
   * AUDIT FINAL F11 · sans trésorerie ni ligne 40 ou 481, une écriture restait
   * « engagée » pour toujours · la paie, les dotations, les OD. Le guide
   * (Application 22) fait de l'engagement le seul solde créditeur des 40 et
   * 481, et du reste des débits des classes 2, 6 et 8 un décaissement.
   */
  it('la paie et la dotation sont des décaissements, jamais des engagements', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }],
      ecritures: [
        ecriture('paie', [
          { numero: '66110000', debit: 250_000, section: 's1' },
          { numero: '42200000', credit: 250_000 },
        ]),
        ecriture('dotation', [
          { numero: '68130000', debit: 50_000, section: 's1' },
          { numero: '28130000', credit: 50_000 },
        ]),
      ],
    });
    const a1 = (await s.executionBudgetaire('t1', 'e1')).lignes.find((l) => l.code === 'A1')!;
    expect({ decaissement: a1.decaissement, engagement: a1.engagement }).toEqual({ decaissement: 300_000, engagement: 0 });
  });

  it('une facture réglée APRÈS la clôture reste engagée dans le tableau de l’exercice', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }],
      ecritures: [
        ecriture('f', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000, lettre: 'A', regleApresCloture: true },
        ]),
      ],
    });
    expect((await s.executionBudgetaire('t1', 'e1')).lignes[0].engagement).toBe(400_000);
  });

  it('le pourcentage d’exécution est `null` sur un budget nul, jamais un infini', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [],
      ecritures: [
        ecriture('x', [
          { numero: '60100000', debit: 100_000, section: 's1' },
          { numero: '52110000', credit: 100_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.lignes[0].executionPourcent).toBeNull();
    expect(t.lignes[0].creditDisponible).toBe(-100_000);
  });

  it("porte les DEUX termes non comptables de la colonne Engagement, pour leur reste à exécuter", async () => {
    // Guide d'application, ch. 7, APPLICATION 22, règle (d) : la colonne
    // Engagement réunit le solde créditeur des comptes 40 et 481, les bons de
    // commande remis NON EXÉCUTÉS, et les contrats signés NON EXÉCUTÉS.
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 5_000_000 }],
      ecritures: [
        ecriture('engage', [
          { numero: '60100000', debit: 400_000, section: 's1' },
          { numero: '40100000', credit: 400_000 },
        ]),
      ],
      engagements: [
        // Bon de commande à moitié facturé · seuls 600 000 pèsent encore.
        { sectionId: 's1', statut: 'OUVERT', montant: 1_000_000, executions: [{ montant: 400_000 }] },
        // Contrat signé, rien d'exécuté.
        { sectionId: 's1', statut: 'OUVERT', montant: 250_000, executions: [] },
      ],
    });
    const a1 = (await s.executionBudgetaire('t1', 'e1')).lignes.find((l) => l.code === 'A1')!;
    expect(a1.engagementComptable).toBe(400_000);
    expect(a1.engagementHorsComptabilite).toBe(850_000);
    expect(a1.engagement).toBe(1_250_000);
    expect(a1.realisation).toBe(1_250_000);
    expect(a1.creditDisponible).toBe(3_750_000);
  });

  it("ne compte PAS deux fois un bon de commande dont la facture est arrivée", async () => {
    // C'est le défaut que ce branchement existe pour fermer, et il casserait
    // en silence : le tableau boucle toujours, seul le crédit disponible
    // serait faux, en moins.
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 5_000_000 }],
      ecritures: [
        ecriture('facture', [
          { numero: '60100000', debit: 1_000_000, section: 's1' },
          { numero: '40100000', credit: 1_000_000 },
        ]),
      ],
      engagements: [
        { sectionId: 's1', statut: 'OUVERT', montant: 1_000_000, executions: [{ montant: 1_000_000 }] },
      ],
    });
    const a1 = (await s.executionBudgetaire('t1', 'e1')).lignes.find((l) => l.code === 'A1')!;
    expect(a1.engagementHorsComptabilite).toBe(0);
    expect(a1.engagement).toBe(1_000_000);
    expect(a1.creditDisponible).toBe(4_000_000);
  });

  it('le total additionne les deux moitiés séparément', async () => {
    const s = service({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }, { sectionId: 's2', montant: 1_000_000 }],
      ecritures: [
        ecriture('engage', [
          { numero: '60100000', debit: 100_000, section: 's1' },
          { numero: '40100000', credit: 100_000 },
        ]),
      ],
      engagements: [
        { sectionId: 's1', statut: 'OUVERT', montant: 200_000, executions: [] },
        { sectionId: 's2', statut: 'OUVERT', montant: 300_000, executions: [] },
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.total.engagementComptable).toBe(100_000);
    expect(t.total.engagementHorsComptabilite).toBe(500_000);
    expect(t.total.engagement).toBe(600_000);
  });

  /*
    LA NOMENCLATURE BUDGÉTAIRE A DES RUBRIQUES, et le guide veut le tableau
    « suivant la nomenclature budgétaire du projet ». Une section Total ne
    reçoit ni budget ni ventilation · elle n'existe que pour être totalisée, et
    le tableau la rendait en ligne vide.
  */
  it('une RUBRIQUE totalise ses feuilles au lieu de rester à zéro', async () => {
    const s = service({
      sections: [
        { id: 'r', code: 'A', intitule: 'Activités', type: TypeCompteDetailTotal.TOTAL },
        { id: 's1', code: 'A1', intitule: 'Formation', type: TypeCompteDetailTotal.DETAIL },
        { id: 's2', code: 'A2', intitule: 'Équipement', type: TypeCompteDetailTotal.DETAIL },
      ],
      budgets: [
        { sectionId: 's1', montant: 1_000_000 },
        { sectionId: 's2', montant: 500_000 },
      ],
      ecritures: [
        ecriture('paye', [
          { numero: '60100000', debit: 300_000, section: 's1' },
          { numero: '52110000', credit: 300_000 },
        ]),
        ecriture('engage', [
          { numero: '24110000', debit: 200_000, section: 's2' },
          { numero: '48100000', credit: 200_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    const rubrique = t.lignes.find((l) => l.code === 'A')!;
    expect(rubrique.estRubrique).toBe(true);
    expect(rubrique.budget).toBe(1_500_000);
    expect(rubrique.decaissement).toBe(300_000);
    expect(rubrique.engagement).toBe(200_000);
    expect(rubrique.realisation).toBe(500_000);
    expect(rubrique.creditDisponible).toBe(1_000_000);
  });

  it('LE TOTAL NE COMPTE PAS DEUX FOIS CE QU’UNE RUBRIQUE TOTALISE', async () => {
    // Le total sommait les lignes affichées. Ce n'était juste que par accident,
    // les sections Total valant toujours zéro. Maintenant qu'elles portent leur
    // sous-total, sommer la colonne rendrait le DOUBLE du vrai, sur un tableau
    // dont chaque ligne est juste et dont le crédit disponible ferait croire à
    // une enveloppe deux fois plus large.
    const s = service({
      sections: [
        { id: 'r', code: 'A', intitule: 'Activités', type: TypeCompteDetailTotal.TOTAL },
        { id: 's1', code: 'A1', intitule: 'Formation', type: TypeCompteDetailTotal.DETAIL },
      ],
      budgets: [{ sectionId: 's1', montant: 1_000_000 }],
      ecritures: [
        ecriture('paye', [
          { numero: '60100000', debit: 300_000, section: 's1' },
          { numero: '52110000', credit: 300_000 },
        ]),
      ],
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.total.budget).toBe(1_000_000);
    expect(t.total.decaissement).toBe(300_000);
    expect(t.total.realisation).toBe(300_000);
    expect(t.total.creditDisponible).toBe(700_000);
  });

  it("dit d'où viennent les trois termes de la colonne, et que le registre non tenu ne pèse pas", async () => {
    // La mention n'a pas disparu, elle a changé de sens · un engagement non
    // saisi reste invisible, et le taire ferait croire à une exhaustivité que
    // seul le comptable peut donner.
    const t = await service({ sections: SECTIONS }).executionBudgetaire('t1', 'e1');
    expect(t.engagementsHorsComptabilite).toContain('bons de commande');
    expect(t.engagementsHorsComptabilite).toContain('RESTE À EXÉCUTER');
    expect(t.engagementsHorsComptabilite).toMatch(/n'y est pas saisi ne pèse pas/i);
  });

  it('refuse d’établir le tableau sans nomenclature budgétaire, au lieu d’en inventer une', async () => {
    await expect(service({ plan: null }).executionBudgetaire('t1', 'e1')).rejects.toThrow(/nomenclature budgétaire/);
  });
});

describe('Tableau de réconciliation de trésorerie', () => {
  it('ventile les encaissements par nature de contrepartie et boucle avec la balance', async () => {
    const s = service({
      balance: [ligneBalance('52110000', { debit: 1_030_000, credit: 300_000 }, { debit: 200_000 })],
      ecritures: [
        ecriture('b', [
          { numero: '52110000', debit: 1_000_000 },
          { numero: '46200000', credit: 1_000_000 },
        ]),
        ecriture('i', [
          { numero: '52110000', debit: 30_000 },
          { numero: '77100000', credit: 30_000 },
        ]),
        ecriture('d', [
          { numero: '60100000', debit: 300_000 },
          { numero: '52110000', credit: 300_000 },
        ]),
      ],
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    const rep = (r: string) => t.lignes.find((l) => l.rep === r)!.montant;
    expect(rep('A')).toBe(200_000);
    expect(rep('B')).toBe(1_000_000);
    expect(rep('C')).toBe(30_000);
    expect(rep('D')).toBe(0);
    expect(rep('E')).toBe(0);
    expect(rep('F')).toBe(300_000);
    expect(rep('G')).toBe(930_000);
    expect(t.controle.boucle).toBe(true);
  });

  it('un virement interne n’est ni une recette ni une dépense, et E reste nul', async () => {
    const s = service({
      balance: [
        ligneBalance('52110000', { debit: 400_000 }),
        ligneBalance('57100000', { credit: 400_000 }, { debit: 400_000 }),
      ],
      ecritures: [
        ecriture('v', [
          { numero: '52110000', debit: 400_000 },
          { numero: '57100000', credit: 400_000 },
        ]),
      ],
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    expect(t.lignes.find((l) => l.rep === 'F')!.montant).toBe(0);
    expect(t.lignes.find((l) => l.rep === 'E')!.montant).toBe(0);
    expect(t.controle.boucle).toBe(true);
  });

  it('reprend les paiements en instance tels que saisis, et le déclare', async () => {
    // Trésorerie d'OUVERTURE de 500 000 et aucun mouvement : G = A = 500 000.
    const s = service({ balance: [ligneBalance('52110000', {}, { debit: 500_000 })] });
    const t = await s.reconciliationTresorerie('t1', 'e1', 120_000);
    expect(t.lignes.find((l) => l.rep === 'H')!.montant).toBe(120_000);
    expect(t.lignes.find((l) => l.rep === 'I')!.montant).toBe(380_000);
    expect(t.avertissements.some((a) => a.includes('extra-comptables'))).toBe(true);
  });

  // AUDIT FINAL F13 · absent n'est pas zéro · H le dit, I n'est pas calculé.
  it('non renseignés, les paiements en instance rendent H et I nuls, jamais zéro', async () => {
    const s = service({ balance: [ligneBalance('52110000', {}, { debit: 500_000 })] });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    expect([t.lignes.find((l) => l.rep === 'H')!.montant, t.lignes.find((l) => l.rep === 'I')!.montant]).toEqual([null, null]);
  });
});

describe("Tableau d'exécution budgétaire · les OD analytiques", () => {
  it("ne les reprend pas, et le DIT dès qu'il en existe sur le plan", async () => {
    const sections = [{ id: 's1', code: '1', intitule: 'Achats', type: TypeCompteDetailTotal.DETAIL }];
    const sans = await service({ sections }).executionBudgetaire('t1', 'e1');
    expect(sans.odAnalytiquesNonReprises).toBeNull();
    const avec = await service({ sections, nombreOd: 2 }).executionBudgetaire('t1', 'e1');
    expect(avec.odAnalytiquesNonReprises).toMatch(/2 OD analytique\(s\) de ce plan ne sont pas reprises/);
  });
});

/*
  AUDIT FINAL F187 · le tableau chargeait toutes les écritures validées de
  l'exercice d'un coup, avec leurs lignes, la fiche de leur compte et leurs
  ventilations, à chaque ouverture des notes 35 et 24. C'est un DOCUMENT, il
  ne se tronque pas · il se lit donc en entier, par tranches, et doit rendre
  le même tableau qu'un parcours d'un seul tenant.
*/
describe("Tableau d'exécution budgétaire · l'exercice lu par tranches (audit final F187)", () => {
  // Deux tranches pleines et une d'une seule écriture · la dernière tranche
  // incomplète est celle qui arrête la lecture.
  const N = 2 * LOT_ECRITURES + 1;

  /**
   * Un tiers payé comptant sur A1, un tiers passé au fournisseur et encore dû
   * sur A2, un tiers passé au fournisseur et lettré sur A2 · rendu dans le
   * désordre, la base ne promettant aucun ordre sans `orderBy`.
   */
  function grandDossier(): EcritureDeTest[] {
    const ecritures: EcritureDeTest[] = [];
    for (let i = 0; i < N; i++) {
      const id = `e${String(i).padStart(5, '0')}`;
      if (i % 3 === 0) {
        ecritures.push(ecriture(id, [{ numero: '60100000', debit: 1_000, section: 's1' }, { numero: '52110000', credit: 1_000 }]));
      } else if (i % 3 === 1) {
        ecritures.push(ecriture(id, [{ numero: '60100000', debit: 2_000, section: 's2' }, { numero: '40100000', credit: 2_000 }]));
      } else {
        ecritures.push(
          ecriture(id, [{ numero: '60100000', debit: 500, section: 's2' }, { numero: '40100000', credit: 500, lettre: 'A' }]),
        );
      }
    }
    return ecritures.reverse();
  }

  it('rend, sur trois tranches, le tableau exact de l’exercice entier', async () => {
    // 334 payées (i ≡ 0), 334 dues (i ≡ 1), 333 lettrées (i ≡ 2), sur 1 001.
    const { s, prisma } = monter({
      sections: SECTIONS,
      budgets: [{ sectionId: 's1', montant: 1_000_000 }, { sectionId: 's2', montant: 1_000_000 }],
      ecritures: grandDossier(),
    });
    const t = await s.executionBudgetaire('t1', 'e1');
    const a1 = t.lignes.find((l) => l.code === 'A1')!;
    const a2 = t.lignes.find((l) => l.code === 'A2')!;
    expect({ decaissement: a1.decaissement, engagement: a1.engagement }).toEqual({ decaissement: 334_000, engagement: 0 });
    expect({ decaissement: a2.decaissement, engagement: a2.engagementComptable }).toEqual({
      decaissement: 166_500,
      engagement: 668_000,
    });
    expect(t.total.realisation).toBe(1_168_500);

    // Trois lectures, chacune bornée à une tranche · jamais l'exercice d'un coup.
    const lectures = prisma.ecriture.findMany.mock.calls.map(([args]) => args as ArgumentsLecture);
    expect(lectures).toHaveLength(3);
    expect(lectures.map((a) => a.take)).toEqual([LOT_ECRITURES, LOT_ECRITURES, LOT_ECRITURES]);
  });

  it('ne cherche les fournisseurs encore dus QUE parmi les candidates de chaque tranche', async () => {
    // Un achat réglé dans la même pièce · la ligne fournisseur y est, mais
    // l'écriture touche la trésorerie et se trouve décaissée d'office.
    const comptant = ecriture('comptant', [
      { numero: '60100000', debit: 300, section: 's1' },
      { numero: '40100000', credit: 300 },
      { numero: '40100000', debit: 300 },
      { numero: '52110000', credit: 300 },
    ]);
    const { s, prisma } = monter({ sections: SECTIONS, ecritures: [...grandDossier(), comptant] });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.lignes.find((l) => l.code === 'A1')!.decaissement).toBe(334_300);
    const questions = prisma.ligneEcriture.findMany.mock.calls.map(([args]) => (args as { where: Filtre }).where);
    expect(questions.length).toBeGreaterThan(0);
    const demandees = new Set<string>();
    for (const where of questions) {
      // Une question sans liste d'identifiants porterait sur tout l'exercice.
      const ids = (where.id as { in: string[] } | undefined)?.in;
      expect(ids).toBeDefined();
      expect(ids!.length).toBeLessThanOrEqual(LOT_ECRITURES);
      for (const id of ids!) demandees.add(id);
    }
    // Les 40 et 481 des écritures sans trésorerie, et elles seules.
    expect(demandees.size).toBe(667);
    expect(demandees.has('comptant-1')).toBe(false);
    expect(demandees.has('comptant-2')).toBe(false);
  });

  it('ne lit que les écritures ventilées sur CE plan, sans rien changer au tableau', async () => {
    // Un grand livre porte surtout des écritures que le plan ne ventile pas ·
    // les lire toutes rendrait le même tableau, au prix de tout l'exercice.
    const ecritures = [
      ...Array.from({ length: LOT_ECRITURES }, (_, i) =>
        ecriture(`v${String(i).padStart(4, '0')}`, [{ numero: '70100000', credit: 10 }, { numero: '52110000', debit: 10 }]),
      ),
      ecriture('autrePlan', [{ numero: '60100000', debit: 900, section: 's1', plan: 'p2' }, { numero: '52110000', credit: 900 }]),
      ecriture('ventilee', [{ numero: '60100000', debit: 300, section: 's1' }, { numero: '52110000', credit: 300 }]),
    ];
    const { s, prisma } = monter({ sections: SECTIONS, ecritures });
    const t = await s.executionBudgetaire('t1', 'e1');
    expect(t.lignes.find((l) => l.code === 'A1')!.decaissement).toBe(300);
    // Une seule écriture ventilée sur p1 · une seule tranche, incomplète.
    expect(prisma.ecriture.findMany).toHaveBeenCalledTimes(1);
  });

  it('pose la question des lignes ouvertes par paquets, sans en oublier aucune', async () => {
    // Une écriture importée peut porter des milliers de lignes fournisseurs.
    // Seule la DERNIÈRE est encore due · si un paquet était sauté ou relu, la
    // dépense passerait en décaissement.
    const nombre = LOT_LECTURE + 1;
    const f = ecriture('import', [
      { numero: '60100000', debit: nombre * 100, section: 's1' },
      ...Array.from({ length: nombre }, (_, i) => ({
        numero: '40100000',
        credit: 100,
        lettre: i === nombre - 1 ? null : 'A',
      })),
    ]);
    const { s, prisma } = monter({ sections: SECTIONS, ecritures: [f] });
    const a1 = (await s.executionBudgetaire('t1', 'e1')).lignes.find((l) => l.code === 'A1')!;
    expect({ decaissement: a1.decaissement, engagement: a1.engagement }).toEqual({ decaissement: 0, engagement: nombre * 100 });
    const tailles = prisma.ligneEcriture.findMany.mock.calls.map(([args]) => ((args as { where: Filtre }).where.id as { in: string[] }).in.length);
    expect(tailles).toEqual([LOT_LECTURE, 1]);
  });

  it("n'emporte ni le brouillard, ni la clôture, ni un autre exercice, ni un autre dossier", async () => {
    // Quatre dépenses ventilées sur le plan que la lecture doit ÉCARTER, chacune
    // d'un ordre de grandeur différent · une borne perdue en route la ferait
    // entrer au tableau sur une écriture équilibrée, et le montant faux dirait
    // laquelle.
    const depense = (id: string, montant: number, tete: Parameters<typeof ecriture>[2] = {}) =>
      ecriture(id, [{ numero: '60100000', debit: montant, section: 's1' }, { numero: '52110000', credit: montant }], tete);
    const { s } = monter({
      sections: SECTIONS,
      ecritures: [
        depense('validee', 300),
        depense('brouillard', 1_000, { statut: StatutEcriture.BROUILLARD }),
        depense('cloture', 20_000, { estGenereeParCloture: true }),
        depense('autreExercice', 400_000, { exerciceId: 'e0' }),
        depense('autreDossier', 5_000_000, { tenantId: 't2' }),
      ],
    });
    const a1 = (await s.executionBudgetaire('t1', 'e1')).lignes.find((l) => l.code === 'A1')!;
    expect({ decaissement: a1.decaissement, engagement: a1.engagement }).toEqual({ decaissement: 300, engagement: 0 });
  });
});

describe('Tableau de réconciliation de trésorerie · l’exercice lu par tranches (audit final F187)', () => {
  it('rend, sur trois tranches, les dépenses de l’exercice entier, et boucle', async () => {
    const N = 2 * LOT_ECRITURES + 1;
    const ecritures = [
      ...Array.from({ length: N }, (_, i) =>
        ecriture(`d${String(i).padStart(5, '0')}`, [{ numero: '60100000', debit: 1_000 }, { numero: '52110000', credit: 1_000 }]),
      ).reverse(),
      // Sans trésorerie · n'entrent pas dans le tableau, et ne sont pas lues.
      // Lues, elles feraient une quatrième tranche.
      ...Array.from({ length: LOT_ECRITURES }, (_, i) =>
        ecriture(`o${String(i).padStart(5, '0')}`, [{ numero: '68130000', debit: 50 }, { numero: '28130000', credit: 50 }]),
      ),
    ];
    const { s, prisma } = monter({
      balance: [ligneBalance('52110000', { credit: N * 1_000 }, { debit: 2_000_000 })],
      ecritures,
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    const rep = (r: string) => t.lignes.find((l) => l.rep === r)!.montant;
    expect(rep('F')).toBe(N * 1_000);
    expect(rep('G')).toBe(2_000_000 - N * 1_000);
    expect(t.controle.boucle).toBe(true);
    const lectures = prisma.ecriture.findMany.mock.calls.map(([args]) => args as ArgumentsLecture);
    expect(lectures.map((a) => a.take)).toEqual([LOT_ECRITURES, LOT_ECRITURES, LOT_ECRITURES]);
  });

  it("n'emporte ni le brouillard, ni la clôture, ni un autre exercice, ni un autre dossier", async () => {
    // Même garde que le tableau d'exécution · chaque écriture écartée pèse un
    // ordre de grandeur différent, et F la trahirait si elle entrait.
    const paiement = (id: string, montant: number, tete: Parameters<typeof ecriture>[2] = {}) =>
      ecriture(id, [{ numero: '60100000', debit: montant }, { numero: '52110000', credit: montant }], tete);
    const { s } = monter({
      balance: [ligneBalance('52110000', { credit: 300 }, { debit: 2_000_000 })],
      ecritures: [
        paiement('validee', 300),
        paiement('brouillard', 1_000, { statut: StatutEcriture.BROUILLARD }),
        paiement('cloture', 20_000, { estGenereeParCloture: true }),
        paiement('autreExercice', 400_000, { exerciceId: 'e0' }),
        paiement('autreDossier', 5_000_000, { tenantId: 't2' }),
      ],
    });
    const t = await s.reconciliationTresorerie('t1', 'e1');
    expect(t.lignes.find((l) => l.rep === 'F')!.montant).toBe(300);
    expect(t.controle.boucle).toBe(true);
  });
});
