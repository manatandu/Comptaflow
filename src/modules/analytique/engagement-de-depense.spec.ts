import { EngagementService } from './engagement.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * ENGAGEMENTS DE DÉPENSE · les deux termes NON COMPTABLES de la colonne
 * Engagement du tableau d'exécution budgétaire.
 *
 * SYCEBNL, Guide d'application, ch. 7, APPLICATION 22, règle de remplissage
 * (d) : « bons de commande de biens et services remis aux fournisseurs au
 * cours de l'exercice budgétaire, NON EXÉCUTÉS » et « contrats signés par les
 * parties prenantes au cours de l'exercice budgétaire, NON EXÉCUTÉS ».
 *
 * Ce que ces tests gardent, c'est le mot « non exécutés ». Un engagement porté
 * pour son montant entier alors que sa facture est arrivée compte la même
 * dépense deux fois, et ce défaut est INVISIBLE en aval : le tableau boucle
 * toujours, puisque Réalisation = (2) + (3) par construction, et seul le
 * crédit disponible est faux.
 */

const EXERCICE = {
  id: 'ex1',
  dateDebut: new Date('2026-01-01'),
  dateFin: new Date('2026-12-31'),
  statut: 'OUVERT',
};

const SECTION = {
  id: 's1',
  code: 'A1',
  intitule: 'Formation des animateurs',
  plan: { gererBudgets: true, code: 'PROJ' },
};

type Faux = Record<string, unknown>;

function service(options: {
  exercice?: unknown;
  section?: unknown;
  doublon?: unknown;
  engagement?: unknown;
  engagements?: unknown[];
  ecriture?: unknown;
} = {}) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue(options.exercice === undefined ? EXERCICE : options.exercice),
    },
    sectionAnalytique: {
      findFirst: jest.fn().mockResolvedValue(options.section === undefined ? SECTION : options.section),
    },
    engagementDepense: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        // Deux lectures passent par findFirst : la recherche de doublon (qui
        // porte une `reference`) et la relecture d'un engagement par son id.
        Promise.resolve('reference' in where ? (options.doublon ?? null) : (options.engagement ?? null)),
      ),
      findMany: jest.fn().mockResolvedValue(options.engagements ?? []),
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'e1', ...(data as object) })),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'e1', ...(data as object) })),
      delete: jest.fn().mockResolvedValue({}),
    },
    ecriture: { findFirst: jest.fn().mockResolvedValue(options.ecriture === undefined ? null : options.ecriture) },
    executionEngagement: {
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'x1', ...(data as object) })),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as Faux;
  return { service: new EngagementService(prisma as unknown as PrismaService), prisma };
}

const DTO = {
  exerciceId: 'ex1',
  sectionId: 's1',
  nature: 'BON_DE_COMMANDE' as const,
  reference: 'BC-2026-014',
  objet: 'Douze pupitres',
  beneficiaire: 'Ets Kabila Fournitures',
  date: '2026-03-04',
  montant: 4_800_000,
};

describe("le reste à exécuter, et non le montant engagé", () => {
  it('un engagement neuf pèse pour son montant entier', () => {
    expect(
      EngagementService.resteAExecuter({ statut: 'OUVERT', montant: 4_800_000, executions: [] }),
    ).toBe(4_800_000);
  });

  it("un engagement à moitié facturé ne pèse plus que pour le reste", () => {
    // C'est LE test de cette tâche. Sans la soustraction, les 2 400 000 déjà
    // facturés seraient comptés une fois au 40 (terme 1 de la règle (d)) et
    // une seconde fois ici (terme 2).
    expect(
      EngagementService.resteAExecuter({
        statut: 'OUVERT',
        montant: 4_800_000,
        executions: [{ montant: 2_400_000 }],
      }),
    ).toBe(2_400_000);
  });

  it('un engagement entièrement exécuté ne pèse plus rien', () => {
    expect(
      EngagementService.resteAExecuter({
        statut: 'OUVERT',
        montant: 4_800_000,
        executions: [{ montant: 3_000_000 }, { montant: 1_800_000 }],
      }),
    ).toBe(0);
  });

  it('un engagement CLOS ne pèse plus rien, même inexécuté', () => {
    // Commande annulée · elle cesse de peser sans qu'aucune écriture ne vienne
    // jamais l'exécuter.
    expect(
      EngagementService.resteAExecuter({ statut: 'CLOS', montant: 4_800_000, executions: [] }),
    ).toBe(0);
  });

  it("une sur-exécution ne rend jamais un engagement NÉGATIF", () => {
    // La facture dépasse le bon de commande. L'excédent est une dépense
    // réelle, déjà portée par la colonne Décaissement · le laisser passer en
    // engagement négatif le retrancherait une seconde fois.
    expect(
      EngagementService.resteAExecuter({
        statut: 'OUVERT',
        montant: 4_800_000,
        executions: [{ montant: 5_000_000 }],
      }),
    ).toBe(0);
  });
});

describe('le reste par section, tel que le tableau le consomme', () => {
  it('additionne les engagements d’une même section et ignore les soldés', async () => {
    const { service: s } = service({
      engagements: [
        { sectionId: 's1', statut: 'OUVERT', montant: 1_000_000, executions: [] },
        { sectionId: 's1', statut: 'OUVERT', montant: 800_000, executions: [{ montant: 300_000 }] },
        { sectionId: 's2', statut: 'OUVERT', montant: 400_000, executions: [] },
        { sectionId: 's2', statut: 'CLOS', montant: 900_000, executions: [] },
        { sectionId: 's3', statut: 'OUVERT', montant: 250_000, executions: [{ montant: 250_000 }] },
      ],
    });
    const parSection = await s.resteParSection('t1', 'ex1');
    expect(parSection.get('s1')).toBe(1_500_000);
    expect(parSection.get('s2')).toBe(400_000);
    // Entièrement exécuté · la section n'apparaît pas plutôt que de porter un
    // zéro, ce qui revient au même pour l'appelant (`?? 0`).
    expect(parSection.get('s3')).toBeUndefined();
  });

  it('borne la lecture au dossier ET à l’exercice', async () => {
    const { service: s, prisma } = service({ engagements: [] });
    await s.resteParSection('t1', 'ex1');
    const findMany = (prisma.engagementDepense as { findMany: jest.Mock }).findMany;
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', exerciceId: 'ex1' });
  });
});

describe('ce que la création refuse', () => {
  it("refuse une date hors de l'exercice budgétaire", async () => {
    // « au cours de l'exercice budgétaire » est dans le texte de la règle (d),
    // ce n'est pas une commodité d'implémentation.
    const { service: s } = service();
    await expect(s.creer('t1', 'u1', { ...DTO, date: '2025-12-20' })).rejects.toThrow(
      /hors de l'exercice/i,
    );
  });

  it("refuse une section d'un plan qui ne gère pas les budgets", async () => {
    const { service: s } = service({
      section: { ...SECTION, plan: { gererBudgets: false, code: 'BAIL' } },
    });
    await expect(s.creer('t1', 'u1', DTO)).rejects.toThrow(/ne gère pas les budgets/i);
  });

  it('refuse un montant nul ou négatif', async () => {
    const { service: s } = service();
    await expect(s.creer('t1', 'u1', { ...DTO, montant: 0 })).rejects.toThrow(/strictement positif/i);
  });

  it('refuse une seconde saisie de la même référence sur le même exercice', async () => {
    // Une double saisie doublerait le poids de la commande sur le budget ·
    // exactement le défaut que ce module existe pour fermer.
    const { service: s } = service({ doublon: { id: 'deja' } });
    await expect(s.creer('t1', 'u1', DTO)).rejects.toThrow(/porte déjà la référence/i);
  });

  it('accepte un engagement ordinaire et le rattache à son dossier', async () => {
    const { service: s, prisma } = service();
    await s.creer('t1', 'u1', DTO);
    const create = (prisma.engagementDepense as { create: jest.Mock }).create;
    expect(create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      exerciceId: 'ex1',
      sectionId: 's1',
      nature: 'BON_DE_COMMANDE',
      reference: 'BC-2026-014',
      montant: 4_800_000,
      createdBy: 'u1',
    });
  });
});

describe("ce que le rattachement d'une exécution refuse", () => {
  const ENGAGEMENT = { id: 'e1', exerciceId: 'ex1', statut: 'OUVERT', montant: 4_800_000, executions: [] };
  const ECRITURE = { id: 'ec1', exerciceId: 'ex1', statut: 'VALIDEE', numeroPiece: 12 };

  it("refuse une écriture d'un autre exercice", async () => {
    const { service: s } = service({
      engagement: ENGAGEMENT,
      ecriture: { ...ECRITURE, exerciceId: 'ex2' },
    });
    await expect(s.rattacherExecution('t1', 'u1', 'e1', { ecritureId: 'ec1', montant: 100 })).rejects.toThrow(
      /autre exercice/i,
    );
  });

  it('refuse de rattacher deux fois la même écriture', async () => {
    const { service: s } = service({
      engagement: { ...ENGAGEMENT, executions: [{ montant: 100, ecritureId: 'ec1' }] },
      ecriture: ECRITURE,
    });
    await expect(s.rattacherExecution('t1', 'u1', 'e1', { ecritureId: 'ec1', montant: 100 })).rejects.toThrow(
      /déjà rattachée/i,
    );
  });

  it("refuse une exécution cumulée qui dépasserait le montant engagé", async () => {
    // Refusé et non rogné · rogner en silence ferait croire au comptable que
    // sa facture est intégralement rattachée.
    const { service: s } = service({
      engagement: { ...ENGAGEMENT, executions: [{ montant: 4_000_000, ecritureId: 'ec0' }] },
      ecriture: ECRITURE,
    });
    await expect(
      s.rattacherExecution('t1', 'u1', 'e1', { ecritureId: 'ec1', montant: 1_000_000 }),
    ).rejects.toThrow(/dépasserait le montant engagé/i);
  });

  it('refuse une exécution sur un engagement clos', async () => {
    const { service: s } = service({ engagement: { ...ENGAGEMENT, statut: 'CLOS' }, ecriture: ECRITURE });
    await expect(s.rattacherExecution('t1', 'u1', 'e1', { ecritureId: 'ec1', montant: 100 })).rejects.toThrow(
      /clos/i,
    );
  });

  it('accepte une exécution partielle', async () => {
    const { service: s, prisma } = service({
      engagement: { ...ENGAGEMENT, executions: [{ montant: 1_000_000, ecritureId: 'ec0' }] },
      ecriture: ECRITURE,
    });
    await s.rattacherExecution('t1', 'u1', 'e1', { ecritureId: 'ec1', montant: 2_000_000 });
    const create = (prisma.executionEngagement as { create: jest.Mock }).create;
    expect(create.mock.calls[0][0].data).toMatchObject({
      engagementId: 'e1',
      ecritureId: 'ec1',
      montant: 2_000_000,
      createdBy: 'u1',
    });
  });
});

describe('la clôture manuelle', () => {
  it('exige un motif', async () => {
    // Clore libère du crédit disponible sur le projet : le bailleur doit
    // pouvoir savoir pourquoi.
    const { service: s } = service({ engagement: { id: 'e1', statut: 'OUVERT' } });
    await expect(s.clore('t1', 'e1', { motif: '   ' })).rejects.toThrow(/motif de clôture est obligatoire/i);
  });

  it('enregistre le motif avec le statut', async () => {
    const { service: s, prisma } = service({ engagement: { id: 'e1', statut: 'OUVERT' } });
    await s.clore('t1', 'e1', { motif: 'Commande annulée par le fournisseur' });
    const update = (prisma.engagementDepense as { update: jest.Mock }).update;
    expect(update.mock.calls[0][0].data).toEqual({
      statut: 'CLOS',
      motifCloture: 'Commande annulée par le fournisseur',
    });
  });
});

describe("la suppression d'un engagement", () => {
  it("refuse d'effacer un engagement qui porte des exécutions", async () => {
    const { service: s } = service({ engagement: { id: 'e1', _count: { executions: 2 } } });
    await expect(s.supprimer('t1', 'e1')).rejects.toThrow(/ne s'efface pas/i);
  });

  it('laisse partir un engagement saisi par erreur', async () => {
    const { service: s } = service({ engagement: { id: 'e1', _count: { executions: 0 } } });
    await expect(s.supprimer('t1', 'e1')).resolves.toEqual({ supprime: true });
  });
});
