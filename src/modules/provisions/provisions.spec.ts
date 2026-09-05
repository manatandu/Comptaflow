import { NatureProvision, Referentiel, StatutProvision } from '@prisma/client';
import { ProvisionsService } from './provisions.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * REGISTRE DES PROVISIONS · CE QUI CASSERAIT EN SILENCE.
 *
 * Les défauts que ce fichier fige ont tous la même signature : le bilan reste
 * équilibré, la balance boucle, et le lecteur des états n'apprend rien.
 *
 *  - une provision INTERDITE par le ch. 18 § 4.11 (grosses réparations,
 *    pertes opérationnelles futures) se comptabilise sans que rien ne
 *    bronche : elle a un compte, une contrepartie et un montant ;
 *  - un risque examiné dont une CONDITION manque et qu'on efface : le bilan
 *    est juste, l'annexe est muette, et c'est précisément ce que le texte
 *    interdit ;
 *  - un remboursement attendu porté EN DIMINUTION de la provision :
 *    l'écriture s'équilibre, et le passif comme l'actif sont sous-estimés du
 *    même montant ;
 *  - une nature choisie sans regarder le référentiel : au 192, le SYSCOHADA
 *    loge les garanties clients et le SYCEBNL les charges sur donations et
 *    legs. Le compte existe des deux côtés, aucun total ne bouge, et la Note
 *    annexe publie un intitulé qui n'a rien à voir avec le risque.
 */

type Etat = {
  referentiel?: Referentiel;
  lignes?: Record<string, unknown>[];
  balance?: { numero: string; solde: number }[];
};

function service(etat: Etat = {}) {
  const creees: Record<string, unknown>[] = [];
  const prisma = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ referentiel: etat.referentiel ?? Referentiel.SYSCOHADA }),
    },
    provisionRisqueCharge: {
      findFirst: jest.fn().mockResolvedValue(etat.lignes?.[0] ?? null),
      findMany: jest.fn().mockResolvedValue(etat.lignes ?? []),
      create: jest.fn().mockImplementation((a) => {
        creees.push(a.data);
        return Promise.resolve({ id: `p${creees.length}`, ...a.data });
      }),
      update: jest.fn().mockImplementation((a) => Promise.resolve({ id: a.where.id, ...a.data })),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const balance = jest.fn().mockResolvedValue({
    lignes: (etat.balance ?? []).map((l) => ({ ...l, compteId: l.numero, intitule: '', classe: 'CLASSE_1' })),
    totaux: {},
  });
  const ecritures = { balance } as unknown as EcritureService;
  return { svc: new ProvisionsService(prisma, ecritures), prisma, balance, creees };
}

const BASE = {
  objet: 'Procès prud’homal ouvert en mars',
  nature: NatureProvision.LITIGE,
  justificationObligation: 'Assignation signifiée le 12 mars, conclusions déposées.',
};

const QUATRE_OUI = {
  obligationExiste: true,
  resulteEvenementPasse: true,
  sortieProbable: true,
  estimationFiable: true,
};

describe('Registre des provisions · la typologie n’est pas la même des deux côtés', () => {
  it('le 192 loge deux natures différentes selon le référentiel · SYSCOHADA garanties clients, SYCEBNL donations et legs', () => {
    const syscohada = ProvisionsService.naturesDuReferentiel(Referentiel.SYSCOHADA);
    const sycebnl = ProvisionsService.naturesDuReferentiel(Referentiel.SYCEBNL);

    const c192Syscohada = syscohada.filter((n) => n.compte === '192');
    const c192Sycebnl = sycebnl.filter((n) => n.compte === '192');

    expect(c192Syscohada).toHaveLength(1);
    expect(c192Sycebnl).toHaveLength(1);
    expect(c192Syscohada[0].nature).toBe(NatureProvision.GARANTIE_CLIENTS);
    expect(c192Sycebnl[0].nature).toBe(NatureProvision.CHARGES_DONATIONS_LEGS);
    expect(c192Syscohada[0].intitule).toContain('garanties données aux clients');
    expect(c192Sycebnl[0].intitule).toContain('donations et legs');
  });

  it('le SYCEBNL ne porte ni 193, ni 195, ni 197 · sa fiche du COMPTE 19 énumère 191, 192, 194, 196 et 198', () => {
    const comptes = new Set(ProvisionsService.naturesDuReferentiel(Referentiel.SYCEBNL).map((n) => n.compte));
    for (const absent of ['193', '195', '197', '1983', '1985']) expect(comptes.has(absent)).toBe(false);
    for (const present of ['191', '192', '194', '196', '1981', '1984', '1988']) {
      expect(comptes.has(present)).toBe(true);
    }
  });

  it('aucun compte du registre ne sort du 19x · les provisions à court terme (499, 599) ont leur propre chemin', () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      for (const n of ProvisionsService.naturesDuReferentiel(referentiel)) {
        expect(n.compte.startsWith('19')).toBe(true);
      }
    }
  });

  it('refuse une nature absente du plan du dossier · une garantie client dans une association', async () => {
    const { svc } = service({ referentiel: Referentiel.SYCEBNL });
    await expect(
      svc.creer('t1', 'ex1', { ...BASE, nature: NatureProvision.GARANTIE_CLIENTS }, 'a@b.cd'),
    ).rejects.toThrow(/n'existe pas dans le plan de comptes SYCEBNL/);
  });

  it('refuse aussi dans l’autre sens · des charges sur donations et legs dans une SARL', async () => {
    const { svc } = service({ referentiel: Referentiel.SYSCOHADA });
    await expect(
      svc.creer('t1', 'ex1', { ...BASE, nature: NatureProvision.CHARGES_DONATIONS_LEGS }, 'a@b.cd'),
    ).rejects.toThrow(/n'existe pas dans le plan de comptes SYSCOHADA/);
  });

  it('les natures communes le sont vraiment · le litige, la perte de change et le démantèlement passent des deux côtés', async () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const { svc } = service({ referentiel });
      for (const nature of [
        NatureProvision.LITIGE,
        NatureProvision.PERTES_DE_CHANGE,
        NatureProvision.DEMANTELEMENT_ET_REMISE_EN_ETAT,
      ]) {
        await expect(svc.creer('t1', 'ex1', { ...BASE, nature }, 'a@b.cd')).resolves.toBeDefined();
      }
    }
  });
});

describe('Registre des provisions · REFUS 1, la provision interdite', () => {
  it('refuse de comptabiliser une provision pour grosses réparations, même les quatre conditions cochées', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        {
          ...BASE,
          nature: NatureProvision.GROSSES_REPARATIONS,
          statut: StatutProvision.COMPTABILISEE,
          ...QUATRE_OUI,
        },
        'a@b.cd',
      ),
    ).rejects.toThrow(/grosses réparations sont INTERDITES/);
  });

  it('le refus dit la voie de rechange · composant distinct ou charge, jamais un cul-de-sac', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        { ...BASE, nature: NatureProvision.GROSSES_REPARATIONS, statut: StatutProvision.COMPTABILISEE },
        'a@b.cd',
      ),
    ).rejects.toThrow(/COMPOSANT DISTINCT/);
  });

  it('refuse les pertes opérationnelles futures et renvoie à la dépréciation', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        {
          ...BASE,
          nature: NatureProvision.PERTES_OPERATIONNELLES_FUTURES,
          statut: StatutProvision.COMPTABILISEE,
          ...QUATRE_OUI,
        },
        'a@b.cd',
      ),
    ).rejects.toThrow(/DÉPRÉCIATION/);
  });

  it('les deux natures interdites restent SAISISSABLES hors comptabilisation · c’est ce qui les empêche de finir au 1988', async () => {
    const { svc, creees } = service();
    await svc.creer(
      't1',
      'ex1',
      {
        ...BASE,
        nature: NatureProvision.GROSSES_REPARATIONS,
        statut: StatutProvision.ECARTEE,
        motifNonComptabilisation: 'Programme de révision quinquennal · traité en composant.',
      },
      'a@b.cd',
    );
    expect(creees[0].nature).toBe(NatureProvision.GROSSES_REPARATIONS);
    expect(creees[0].statut).toBe(StatutProvision.ECARTEE);
  });
});

describe('Registre des provisions · REFUS 2, la condition qui manque', () => {
  it('refuse de comptabiliser tant qu’une des quatre conditions manque, et nomme celle qui manque', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        { ...BASE, statut: StatutProvision.COMPTABILISEE, ...QUATRE_OUI, estimationFiable: false },
        'a@b.cd',
      ),
    ).rejects.toThrow(/estimation fiable/);
  });

  it('le refus propose les deux issues du texte · passif éventuel, ou écartée si la probabilité est très faible', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'ex1', { ...BASE, statut: StatutProvision.COMPTABILISEE }, 'a@b.cd'),
    ).rejects.toThrow(/PASSIF_EVENTUEL[\s\S]*TRÈS FAIBLE/);
  });

  it('accepte la comptabilisation quand les quatre sont réunies', async () => {
    const { svc, creees } = service();
    await svc.creer('t1', 'ex1', { ...BASE, statut: StatutProvision.COMPTABILISEE, ...QUATRE_OUI }, 'a@b.cd');
    expect(creees[0].statut).toBe(StatutProvision.COMPTABILISEE);
  });

  it('refuse un passif éventuel sans motif écrit · un risque écarté sans motif est un risque effacé', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'ex1', { ...BASE, statut: StatutProvision.PASSIF_EVENTUEL }, 'a@b.cd'),
    ).rejects.toThrow(/effacé, pas arbitré/);
  });

  it('un motif fait d’espaces ne compte pas pour un motif', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        { ...BASE, statut: StatutProvision.ECARTEE, motifNonComptabilisation: '    ' },
        'a@b.cd',
      ),
    ).rejects.toThrow(/effacé, pas arbitré/);
  });

  it('conditionsManquantes nomme les quatre, une par une', () => {
    const aucune = ProvisionsService.conditionsManquantes({
      obligationExiste: false,
      resulteEvenementPasse: false,
      sortieProbable: false,
      estimationFiable: false,
    });
    expect(aucune).toHaveLength(4);
    expect(
      ProvisionsService.conditionsManquantes(QUATRE_OUI),
    ).toHaveLength(0);
  });
});

describe('Registre des provisions · REFUS 3, le remboursement attendu', () => {
  it('refuse un remboursement attendu qui n’est pas certain · § 3.1.4', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'ex1', { ...BASE, ...QUATRE_OUI, remboursementAttendu: 500000 }, 'a@b.cd'),
    ).rejects.toThrow(/CERTAIN que l'entité le recevra/);
  });

  it('refuse un remboursement saisi en négatif · ce serait la compensation que le texte interdit', async () => {
    const { svc } = service();
    await expect(
      svc.creer(
        't1',
        'ex1',
        { ...BASE, ...QUATRE_OUI, remboursementAttendu: -500000, remboursementCertain: true },
        'a@b.cd',
      ),
    ).rejects.toThrow(/NON COMPENSÉ/);
  });

  it('accepte un remboursement certain, et ne le retranche pas du montant de clôture', async () => {
    const { svc, creees } = service();
    await svc.creer(
      't1',
      'ex1',
      {
        ...BASE,
        ...QUATRE_OUI,
        statut: StatutProvision.COMPTABILISEE,
        dotationsExercice: 1000000,
        remboursementAttendu: 400000,
        remboursementCertain: true,
        remboursementTiers: 'Assureur',
      },
      'a@b.cd',
    );
    expect(creees[0].remboursementAttendu).toBe(400000);
    expect(ProvisionsService.montantCloture(creees[0] as never)).toBe(1000000);
  });
});

describe('Registre des provisions · le tableau de variation', () => {
  it('suit l’ordre du § 5.3 · ouverture + dotations - utilisations - reprises + actualisation', () => {
    expect(
      ProvisionsService.montantCloture({
        montantOuverture: 1000,
        dotationsExercice: 500,
        montantsUtilises: 200,
        reprisesNonUtilisees: 100,
        effetActualisation: 30,
      }),
    ).toBe(1230);
  });

  it('rapproche le registre du solde du compte, en valeur absolue · un 19 est créditeur', async () => {
    const { svc } = service({
      lignes: [
        {
          id: 'p1',
          objet: 'Litige',
          nature: NatureProvision.LITIGE,
          statut: StatutProvision.COMPTABILISEE,
          compte: { numero: '19100000', intitule: 'Provisions pour litiges' },
          montantOuverture: 0,
          dotationsExercice: 800000,
          montantsUtilises: 0,
          reprisesNonUtilisees: 0,
          effetActualisation: 0,
          remboursementAttendu: null,
          echeanceAttendue: null,
          obligationExiste: true,
          resulteEvenementPasse: true,
          sortieProbable: true,
          estimationFiable: true,
        },
      ],
      balance: [{ numero: '19100000', solde: -800000 }],
    });
    const t = await svc.tableauDeVariation('t1', 'ex1');
    expect(t.rapprochement).toEqual([{ numero: '19100000', montantRegistre: 800000, soldeComptable: 800000, ecart: 0 }]);
  });

  it('signale l’écart quand une dotation est passée sans être documentée', async () => {
    const { svc } = service({
      lignes: [
        {
          id: 'p1',
          objet: 'Litige',
          nature: NatureProvision.LITIGE,
          statut: StatutProvision.COMPTABILISEE,
          compte: { numero: '19100000', intitule: 'Provisions pour litiges' },
          montantOuverture: 0,
          dotationsExercice: 800000,
          montantsUtilises: 0,
          reprisesNonUtilisees: 0,
          effetActualisation: 0,
          remboursementAttendu: null,
          echeanceAttendue: null,
          obligationExiste: true,
          resulteEvenementPasse: true,
          sortieProbable: true,
          estimationFiable: true,
        },
      ],
      balance: [{ numero: '19100000', solde: -1200000 }],
    });
    const t = await svc.tableauDeVariation('t1', 'ex1');
    expect(t.rapprochement[0].ecart).toBe(-400000);
  });

  it('ne cherche AUCUN solde pour un passif éventuel · il n’est dans aucun compte, par définition', async () => {
    const { svc } = service({
      lignes: [
        {
          id: 'p1',
          objet: 'Redressement fiscal contesté',
          nature: NatureProvision.LITIGE,
          statut: StatutProvision.PASSIF_EVENTUEL,
          compte: { numero: '19100000', intitule: 'Provisions pour litiges' },
          montantOuverture: 0,
          dotationsExercice: 0,
          montantsUtilises: 0,
          reprisesNonUtilisees: 0,
          effetActualisation: 0,
          remboursementAttendu: null,
          echeanceAttendue: null,
          obligationExiste: true,
          resulteEvenementPasse: true,
          sortieProbable: false,
          estimationFiable: true,
        },
      ],
      balance: [],
    });
    const t = await svc.tableauDeVariation('t1', 'ex1');
    expect(t.rapprochement).toEqual([]);
    expect(t.passifsEventuels).toHaveLength(1);
    expect(t.passifsEventuels[0].conditionsManquantes).toHaveLength(1);
  });

  it('lit la balance BROUILLARD COMPRIS · une dotation non encore validée fait partie de l’arrêté en cours', async () => {
    const { svc, balance } = service({ lignes: [], balance: [] });
    await svc.tableauDeVariation('t1', 'ex1');
    expect(balance.mock.calls[0]).toEqual(['t1', 'ex1', true]);
  });
});

describe('Registre des provisions · le report à l’ouverture', () => {
  const ligne = (o: Record<string, unknown>) => ({
    objet: 'Litige',
    nature: NatureProvision.LITIGE,
    compteId: 'c1',
    statut: StatutProvision.COMPTABILISEE,
    obligationExiste: true,
    resulteEvenementPasse: true,
    sortieProbable: true,
    estimationFiable: true,
    justificationObligation: 'Assignation.',
    echeanceAttendue: null,
    incertitudes: null,
    montantOuverture: 0,
    dotationsExercice: 0,
    montantsUtilises: 0,
    reprisesNonUtilisees: 0,
    effetActualisation: 0,
    remboursementTiers: null,
    motifNonComptabilisation: null,
    ...o,
  });

  it('porte le montant de clôture en ouverture et remet les cinq mouvements à zéro', async () => {
    const { svc, creees, prisma } = service();
    (prisma.provisionRisqueCharge.findMany as jest.Mock)
      .mockResolvedValueOnce([ligne({ dotationsExercice: 900000, montantsUtilises: 100000 })])
      .mockResolvedValueOnce([]);
    const r = await svc.reporterALOuverture('t1', 'ex1', 'ex2', 'a@b.cd');
    expect(r.reportees).toBe(1);
    expect(creees[0].montantOuverture).toBe(800000);
    expect(creees[0].dotationsExercice).toBe(0);
    expect(creees[0].montantsUtilises).toBe(0);
  });

  it('ne reporte pas une provision SOLDÉE ni une ligne devenue nulle', async () => {
    const { svc, prisma } = service();
    (prisma.provisionRisqueCharge.findMany as jest.Mock)
      .mockResolvedValueOnce([
        ligne({ statut: StatutProvision.SOLDEE, dotationsExercice: 500000 }),
        ligne({ objet: 'Autre', dotationsExercice: 500000, reprisesNonUtilisees: 500000 }),
      ])
      .mockResolvedValueOnce([]);
    const r = await svc.reporterALOuverture('t1', 'ex1', 'ex2', 'a@b.cd');
    expect(r.reportees).toBe(0);
  });

  it('reporte un PASSIF ÉVENTUEL à zéro · le perdre au passage d’un exercice referait le défaut que le refus 2 empêche', async () => {
    const { svc, creees, prisma } = service();
    (prisma.provisionRisqueCharge.findMany as jest.Mock)
      .mockResolvedValueOnce([
        ligne({ statut: StatutProvision.PASSIF_EVENTUEL, motifNonComptabilisation: 'Sortie non probable.' }),
      ])
      .mockResolvedValueOnce([]);
    const r = await svc.reporterALOuverture('t1', 'ex1', 'ex2', 'a@b.cd');
    expect(r.reportees).toBe(1);
    expect(creees[0].statut).toBe(StatutProvision.PASSIF_EVENTUEL);
    expect(creees[0].montantOuverture).toBe(0);
  });

  it('ne reporte pas le remboursement attendu · sa certitude s’apprécie à CHAQUE clôture', async () => {
    const { svc, creees, prisma } = service();
    (prisma.provisionRisqueCharge.findMany as jest.Mock)
      .mockResolvedValueOnce([
        ligne({ dotationsExercice: 900000, remboursementAttendu: 400000, remboursementCertain: true }),
      ])
      .mockResolvedValueOnce([]);
    await svc.reporterALOuverture('t1', 'ex1', 'ex2', 'a@b.cd');
    expect(creees[0].remboursementAttendu).toBeNull();
    expect(creees[0].remboursementCertain).toBe(false);
  });

  it('ne reporte pas deux fois · un report rejoué ne duplique aucune ligne', async () => {
    const { svc, prisma } = service();
    (prisma.provisionRisqueCharge.findMany as jest.Mock)
      .mockResolvedValueOnce([ligne({ dotationsExercice: 900000 })])
      .mockResolvedValueOnce([{ objet: 'Litige', nature: NatureProvision.LITIGE }]);
    const r = await svc.reporterALOuverture('t1', 'ex1', 'ex2', 'a@b.cd');
    expect(r.reportees).toBe(0);
  });
});
