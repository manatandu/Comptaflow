import { readFileSync } from 'fs';
import { join } from 'path';
import { CycleQuestionnaire, Referentiel, ReponseItem, StatutQuestionnaire } from '@prisma/client';
import { QuestionnaireService } from './questionnaire.service';
import { ITEMS_QUESTIONNAIRE, ITEM_PAR_CODE, type ItemQuestionnaire } from './catalogue-questionnaire';
import { PrismaService } from '../../common/prisma.service';

/**
 * QUESTIONNAIRE DE RÉVISION · CE QUI CASSERAIT EN SILENCE.
 *
 * Trois défauts, et aucun ne produit d'erreur :
 *
 *  · un item du CPCC réécrit « pour la clarté », qui cesse d'être opposable ;
 *  · une question de l'éditeur qui se met à passer pour une exigence du
 *    séminaire · le § 10 bis de CLAUDE.md, dans sa forme la plus discrète ;
 *  · la polarité de CPCC-CAI-4, qui rend vert le seul item du CPCC portant sur
 *    la correspondance des bilans.
 *
 * Ce fichier fige les trois.
 */

const EXERCICE = { id: 'ex1', tenantId: 't1' };

type Etat = {
  questionnaire?: Record<string, unknown> | null;
  reponses?: Record<string, unknown>[];
  parent?: Record<string, unknown> | null;
  referentiel?: Referentiel;
};

function service(etat: Etat = {}) {
  const creerReponse = jest.fn().mockImplementation((a) => Promise.resolve({ id: 'r1', ...a.create, ...a.update }));
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: etat.referentiel ?? Referentiel.SYCEBNL }) },
    questionnaireRevision: {
      findFirst: jest.fn().mockResolvedValue(etat.questionnaire ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((a) => Promise.resolve({ id: 'q1', ...a.data })),
      update: jest.fn().mockImplementation((a) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    reponseQuestionnaire: {
      findUnique: jest.fn().mockResolvedValue(etat.parent ?? null),
      findMany: jest.fn().mockResolvedValue(etat.reponses ?? []),
      upsert: creerReponse,
    },
  } as unknown as PrismaService;
  return { svc: new QuestionnaireService(prisma), creerReponse };
}

const questionnaire = (extra: Record<string, unknown> = {}) => ({
  id: 'q1',
  tenantId: 't1',
  exerciceId: 'ex1',
  cycles: [] as CycleQuestionnaire[],
  statut: StatutQuestionnaire.OUVERT,
  ...extra,
});

const item = (code: string): ItemQuestionnaire => {
  const i = ITEM_PAR_CODE.get(code);
  if (!i) throw new Error(`item ${code} absent du catalogue`);
  return i;
};

describe('les vingt-quatre items du CPCC, mot pour mot', () => {
  it('en compte exactement vingt-quatre, et pas un de plus', () => {
    // LE DÉCOMPTE EST EN DUR à dessein · c'est lui qui oblige à rouvrir ce
    // fichier le jour où quelqu'un ajouterait une question « du CPCC » qui
    // n'y est pas.
    expect(QuestionnaireService.itemsInterrogatifsCpcc()).toHaveLength(24);
  });

  it('les répartit comme les deux checklists du séminaire', () => {
    const parCycle = (c: CycleQuestionnaire) =>
      QuestionnaireService.itemsInterrogatifsCpcc().filter((i) => i.cycle === c).length;
    // § VI, inventaire physique.
    expect(parCycle(CycleQuestionnaire.IMMOBILISATIONS)).toBe(2);
    expect(parCycle(CycleQuestionnaire.STOCKS)).toBe(8);
    expect(parCycle(CycleQuestionnaire.CAISSES)).toBe(5);
    // § VII, inventaire documentaire.
    expect(parCycle(CycleQuestionnaire.BANQUES)).toBe(1);
    expect(parCycle(CycleQuestionnaire.DETTES_FOURNISSEURS)).toBe(3);
    // La rubrique des provisions ne porte AUCUNE question · six impératifs.
    expect(parCycle(CycleQuestionnaire.PROVISIONS)).toBe(0);
    expect(parCycle(CycleQuestionnaire.CREANCES)).toBe(5);
  });

  it('porte dix-sept impératifs, comptés à part des questions', () => {
    const travaux = ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'CPCC' && i.forme === 'TRAVAIL');
    expect(travaux).toHaveLength(17);
    expect(travaux.filter((i) => i.cycle === CycleQuestionnaire.PROVISIONS)).toHaveLength(6);
  });

  it('fige le libellé de six items sensibles, à la virgule près', () => {
    expect(item('CPCC-CAI-4').libelle).toBe(
      "Y a-t-il un chevauchement avec l'exercice en cours sur le solde d'ouverture ?",
    );
    expect(item('CPCC-CAI-3').libelle).toBe(
      'A-t-on tenu compte de la caisse siège, de la caisse agence, de la caisse de secours ?',
    );
    expect(item('CPCC-DET-3').libelle).toBe(
      "Si non, comment a-t-on procédé pour la sélection des fournisseurs à circulariser ?",
    );
    expect(item('CPCC-CRE-5').libelle).toBe(
      "Combien de réponses a-t-on reçues ? Si le pourcentage est insignifiant, a-t-on relancé pour insister sur l'importance attendue des réponses ?",
    );
    expect(item('CPCC-PRO-6').libelle).toBe("Faire le suivi des faiblesses relevées lors de l'audit précédent.");
    expect(item('CPCC-STO-6').libelle).toBe(
      "Quelles dispositions assurent le bon fonctionnement du cut-off (clôture des aires de réception et d'expédition, transferts internes...) ?",
    );
  });

  it('donne une source à chaque item du CPCC et un fondement à chaque item de VMG', () => {
    for (const i of ITEMS_QUESTIONNAIRE) {
      if (i.origine === 'CPCC') {
        expect({ code: i.code, source: Boolean(i.source), fondement: i.fondement }).toEqual({
          code: i.code,
          source: true,
          // Un item du CPCC n'a pas de « fondement » · il EST la source.
          fondement: undefined,
        });
      } else {
        expect({ code: i.code, fondement: Boolean(i.fondement), source: i.source }).toEqual({
          code: i.code,
          fondement: true,
          source: undefined,
        });
      }
    }
  });

  it('préfixe le code par l’origine · aucun item de VMG ne peut se lire comme du CPCC', () => {
    for (const i of ITEMS_QUESTIONNAIRE) {
      expect(i.code.startsWith(i.origine === 'CPCC' ? 'CPCC-' : 'VMG-')).toBe(true);
    }
  });
});

describe('la polarité · vingt-trois fois « Non », une fois « Oui »', () => {
  it('ne connaît qu’un seul item du CPCC à polarité inversée', () => {
    const inverses = ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'CPCC' && i.polariteException === 'OUI');
    expect(inverses.map((i) => i.code)).toEqual(['CPCC-CAI-4']);
  });

  it('fait du « Oui » l’exception sur le chevauchement du solde d’ouverture', () => {
    expect(QuestionnaireService.estException(item('CPCC-CAI-4'), ReponseItem.OUI)).toBe(true);
    expect(QuestionnaireService.estException(item('CPCC-CAI-4'), ReponseItem.NON)).toBe(false);
  });

  it('fait du « Non » l’exception partout ailleurs', () => {
    expect(QuestionnaireService.estException(item('CPCC-CAI-1'), ReponseItem.NON)).toBe(true);
    expect(QuestionnaireService.estException(item('CPCC-CAI-1'), ReponseItem.OUI)).toBe(false);
    expect(QuestionnaireService.estException(item('CPCC-STO-1'), ReponseItem.NON)).toBe(true);
  });

  it('ne fait jamais de SANS_OBJET une exception · le cycle n’existe pas, ce n’est pas un manquement', () => {
    expect(QuestionnaireService.estException(item('CPCC-CAI-1'), ReponseItem.SANS_OBJET)).toBe(false);
    expect(QuestionnaireService.estException(item('CPCC-CAI-4'), ReponseItem.SANS_OBJET)).toBe(false);
  });

  it('n’ouvre aucune exception sur un item qui n’est pas une question fermée', () => {
    expect(QuestionnaireService.estException(item('CPCC-STO-6'), ReponseItem.NON)).toBe(false);
    expect(QuestionnaireService.estException(item('CPCC-PRO-6'), ReponseItem.NON)).toBe(false);
  });
});

describe('le chaînage · un item fermé ne se répond pas', () => {
  it('ouvre « Si oui, une attestation… » seulement après un comptage au 31 décembre', () => {
    expect(QuestionnaireService.estOuvert(item('CPCC-CAI-2'), new Map([['CPCC-CAI-1', ReponseItem.OUI]]))).toBe(true);
    expect(QuestionnaireService.estOuvert(item('CPCC-CAI-2'), new Map([['CPCC-CAI-1', ReponseItem.NON]]))).toBe(false);
    expect(QuestionnaireService.estOuvert(item('CPCC-CAI-2'), new Map())).toBe(false);
  });

  it('ouvre la seule chaîne « Non → suite » du corpus dans le bon sens', () => {
    expect(QuestionnaireService.estOuvert(item('CPCC-DET-3'), new Map([['CPCC-DET-2', ReponseItem.NON]]))).toBe(true);
    expect(QuestionnaireService.estOuvert(item('CPCC-DET-3'), new Map([['CPCC-DET-2', ReponseItem.OUI]]))).toBe(false);
  });

  it('laisse ouvert tout item sans parent', () => {
    expect(QuestionnaireService.estOuvert(item('CPCC-CAI-1'), new Map())).toBe(true);
  });

  it('refuse la réponse à un item dont le parent ne l’ouvre pas', async () => {
    const { svc } = service({
      questionnaire: questionnaire(),
      parent: { code: 'CPCC-CAI-1', reponse: ReponseItem.NON },
    });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-CAI-2', reponse: ReponseItem.OUI })).rejects.toThrow(
      /n'est ouvert que si CPCC-CAI-1/,
    );
  });

  it('accepte la réponse quand le parent l’ouvre', async () => {
    const { svc, creerReponse } = service({
      questionnaire: questionnaire(),
      parent: { code: 'CPCC-CAI-1', reponse: ReponseItem.OUI },
    });
    await svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-CAI-2', reponse: ReponseItem.NON });
    expect(creerReponse.mock.calls[0][0].create.estException).toBe(true);
  });
});

describe('une forme ne s’échange pas contre une autre', () => {
  it('refuse un « Oui » sur un item qui appelle une donnée', async () => {
    const { svc } = service({ questionnaire: questionnaire() });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-IMM-1', reponse: ReponseItem.OUI })).rejects.toThrow(
      /une date, un nombre/,
    );
  });

  it('refuse un « Oui » sur un impératif', async () => {
    const { svc } = service({ questionnaire: questionnaire() });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-PRO-6', reponse: ReponseItem.OUI })).rejects.toThrow(
      /renvoi au papier de travail/,
    );
  });

  it('exige une réponse fermée sur une question fermée', async () => {
    const { svc } = service({ questionnaire: questionnaire() });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-STO-1', valeur: 'oui bien sûr' })).rejects.toThrow(
      /question fermée/,
    );
  });

  it('exige le renvoi de travaux sur un impératif', async () => {
    const { svc } = service({ questionnaire: questionnaire() });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-PRO-1', commentaire: 'fait' })).rejects.toThrow(
      /renvoi au papier de travail/,
    );
  });

  it('exige la valeur écrite sur un texte libre', async () => {
    const { svc } = service({ questionnaire: questionnaire() });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'CPCC-STO-6', commentaire: 'vu' })).rejects.toThrow(
      /réponse écrite, pas une case/,
    );
  });
});

describe('le référentiel filtre l’item, pas le questionnaire', () => {
  it('écarte la classe 9 des contributions volontaires en SYSCOHADA', () => {
    const sycebnl = QuestionnaireService.itemsRetenus(
      [CycleQuestionnaire.ENGAGEMENTS_HORS_BILAN],
      Referentiel.SYCEBNL,
    );
    const syscohada = QuestionnaireService.itemsRetenus(
      [CycleQuestionnaire.ENGAGEMENTS_HORS_BILAN],
      Referentiel.SYSCOHADA,
    );
    expect(sycebnl.map((i) => i.code)).toContain('VMG-ENG-3');
    expect(syscohada.map((i) => i.code)).not.toContain('VMG-ENG-3');
  });

  it('refuse d’y répondre dans le mauvais référentiel', async () => {
    const { svc } = service({ questionnaire: questionnaire(), referentiel: Referentiel.SYSCOHADA });
    await expect(svc.repondre('t1', 'q1', 'u1', { code: 'VMG-ENG-3', reponse: ReponseItem.OUI })).rejects.toThrow(
      /contresens/,
    );
  });

  it('rend tous les cycles quand aucun n’est choisi', () => {
    expect(QuestionnaireService.itemsRetenus([], Referentiel.SYCEBNL)).toHaveLength(ITEMS_QUESTIONNAIRE.length);
  });
});

describe('ce qui empêche de clore', () => {
  const items = QuestionnaireService.itemsRetenus([CycleQuestionnaire.CAISSES], Referentiel.SYCEBNL);
  const rep = (code: string, o: Record<string, unknown> = {}) => ({
    code,
    reponse: null as ReponseItem | null,
    valeur: null as string | null,
    renvoiTravaux: null as string | null,
    estException: false,
    commentaire: null as string | null,
    ...o,
  });

  it('refuse un item ouvert laissé sans réponse', () => {
    const motifs = QuestionnaireService.motifsRefusCloture(items, []);
    expect(motifs).toHaveLength(1);
    expect(motifs[0]).toContain('sans réponse');
  });

  it('ne réclame rien sur un item que son parent laisse fermé', () => {
    // CPCC-CAI-1 répondu NON ferme CPCC-CAI-2 · les trois autres restent dus.
    const motifs = QuestionnaireService.motifsRefusCloture(items, [rep('CPCC-CAI-1', { reponse: ReponseItem.NON, estException: true, commentaire: 'aucun comptage tenu.' })]);
    expect(motifs[0]).not.toContain('CPCC-CAI-2');
    expect(motifs[0]).toContain('CPCC-CAI-3');
  });

  it('refuse une exception sans commentaire', () => {
    const complet = items.map((i) =>
      rep(i.code, {
        reponse: i.code === 'CPCC-CAI-2' ? null : ReponseItem.OUI,
        estException: i.code === 'CPCC-CAI-4',
      }),
    );
    const motifs = QuestionnaireService.motifsRefusCloture(items, complet);
    expect(motifs.some((m) => m.includes('sans commentaire') && m.includes('CPCC-CAI-4'))).toBe(true);
  });

  it('laisse clore un questionnaire complet dont les exceptions sont commentées', () => {
    const complet = items.map((i) =>
      rep(i.code, {
        reponse: ReponseItem.OUI,
        estException: i.code === 'CPCC-CAI-4',
        commentaire: i.code === 'CPCC-CAI-4' ? "Reprise du solde d'ouverture corrigée le 12/01." : null,
      }),
    );
    expect(QuestionnaireService.motifsRefusCloture(items, complet)).toEqual([]);
  });
});

describe('les cycles ajoutés par le cabinet', () => {
  it('en porte vingt-cinq, tous marqués VMG', () => {
    const vmg = ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'VMG');
    expect(vmg).toHaveLength(25);
    expect(vmg.every((i) => i.origine === 'VMG')).toBe(true);
  });

  it('n’ajoute aucun item sur les sept rubriques que le CPCC couvre', () => {
    const rubriquesCpcc: CycleQuestionnaire[] = [
      CycleQuestionnaire.IMMOBILISATIONS,
      CycleQuestionnaire.STOCKS,
      CycleQuestionnaire.CAISSES,
      CycleQuestionnaire.BANQUES,
      CycleQuestionnaire.DETTES_FOURNISSEURS,
      CycleQuestionnaire.PROVISIONS,
      CycleQuestionnaire.CREANCES,
    ];
    const intrus = ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'VMG' && rubriquesCpcc.includes(i.cycle));
    // Le séminaire est repris tel quel · le compléter DANS ses rubriques
    // rendrait indiscernable ce qu'il demande de ce que le cabinet ajoute.
    expect(intrus).toEqual([]);
  });

  it('reprend la logique du CPCC · chaînage et polarité inversée', () => {
    const vmg = ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'VMG');
    expect(vmg.filter((i) => i.ouvertPar).length).toBeGreaterThan(0);
    expect(vmg.filter((i) => i.polariteException === 'OUI').length).toBeGreaterThan(0);
  });
});

describe('ce que la source ne doit jamais porter', () => {
  const source = readFileSync(join(__dirname, 'catalogue-questionnaire.ts'), 'utf8');
  const svcSource = readFileSync(join(__dirname, 'questionnaire.service.ts'), 'utf8');

  it('ne chiffre nulle part le « pourcentage insignifiant » de CPCC-CRE-5', () => {
    // La source ne le chiffre pas · en poser un ferait passer pour une
    // exigence du séminaire un nombre qu'il n'a jamais écrit.
    // Aucune CONSTANTE de seuil, aucun pourcentage en dur · la prose peut
    // dire « aucun seuil », un identifiant ne le peut pas.
    for (const texte of [source, svcSource]) {
      expect(texte).not.toMatch(/(seuil|taux|pourcentage)[A-Za-z_]*\s*[:=]\s*\d/i);
      expect(texte).not.toMatch(/\d+\s*%/);
    }
  });

  it('conserve le tiret du texte source dans la citation de CPCC-PRO-5', () => {
    // Le remplacer falsifierait la citation · même raison que les 97 de
    // regles-comptes-sycebnl.ts. Ne pas « corriger ».
    expect(item('CPCC-PRO-5').libelle).toContain('litiges — revue des procès-verbaux de conseil');
  });
});
