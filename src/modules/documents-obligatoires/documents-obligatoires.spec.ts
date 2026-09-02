import { BadRequestException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { LivreInventaireService } from './livre-inventaire.service';
import { RapportActiviteService } from './rapport-activite.service';
import {
  ETATS_INVENTAIRE_ASSOCIATIONS,
  ETATS_INVENTAIRE_PROJETS,
  SECTIONS_RAPPORT_ACTIVITE,
  etatsExigesPar,
} from './correspondance-inventaire';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { DonationService } from '../registre-donateurs/donation.service';

const EXERCICE = { id: 'ex1', tenantId: 't1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

function prismaAvec(jeu: JeuEtatsFinanciersSycebnl, transcriptions: any[] = [], rapports: any[] = []) {
  const suivante = (table: any[]) => (data: any) => {
    const cree = { id: `x${table.length + 1}`, transcritLe: new Date(), createdAt: new Date(), ...data };
    table.push(cree);
    return Promise.resolve(cree);
  };
  const dernierPar = (table: any[]) => (args: any) =>
    Promise.resolve(
      args?.orderBy?.version === 'desc'
        ? [...table].sort((a, b) => b.version - a.version)[0] ?? null
        : table.find((x) => x.id === args?.where?.id) ?? null,
    );
  return {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ jeuEtatsFinanciersSycebnl: jeu }) },
    transcriptionInventaire: {
      findMany: jest.fn().mockResolvedValue(transcriptions),
      findFirst: jest.fn().mockImplementation(dernierPar(transcriptions)),
      create: jest.fn().mockImplementation(({ data }: any) => suivante(transcriptions)(data)),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const t = transcriptions.find((x) => x.id === where.id)!;
        Object.assign(t, data);
        return Promise.resolve(t);
      }),
    },
    rapportActivite: {
      findMany: jest.fn().mockResolvedValue(rapports),
      findFirst: jest.fn().mockImplementation(dernierPar(rapports)),
      create: jest.fn().mockImplementation(({ data }: any) => suivante(rapports)(data)),
    },
    _transcriptions: transcriptions,
    _rapports: rapports,
  } as unknown as PrismaService & { _transcriptions: any[]; _rapports: any[] };
}

const TFT_QUI_BOUCLE = {
  controle: { tresorerieOuverture: 1200, variation: 300, tresorerieClotureParBilan: 1500, coherent: true },
};

function services(
  jeu: JeuEtatsFinanciersSycebnl = JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
  prisma = prismaAvec(jeu),
  tft: any = TFT_QUI_BOUCLE,
  registreConforme = true,
) {
  const ef = {
    bilan: jest.fn().mockResolvedValue({ etat: 'bilan-associations' }),
    compteDeResultat: jest.fn().mockResolvedValue({ etat: 'compte-de-resultat' }),
    tableauFluxTresorerie: jest.fn().mockResolvedValue(tft),
  } as unknown as EtatsFinanciersService;
  const efp = {
    bilan: jest.fn().mockResolvedValue({ etat: 'bilan-projet' }),
    compteExploitation: jest.fn().mockResolvedValue({ etat: 'compte-exploitation' }),
  } as unknown as EtatsFinanciersProjetService;
  const donations = {
    rapportConformite: jest.fn().mockResolvedValue({
      numerotation: { continue: registreConforme },
      signature: { lignesNonSignees: registreConforme ? [] : [{ numero: 3 }] },
      completude: { lignesIncompletes: [] },
      rapprochement: { rapproche: true },
    }),
  } as unknown as DonationService;
  // Jeu S.M.T · le doublon suffit ici, aucun test de ce fichier ne transcrit
  // un livre d'inventaire de Système Minimal de Trésorerie (voir
  // `etats-financiers-smt.service.spec.ts` pour les états eux-mêmes).
  const efs = {
    bilan: jest.fn().mockResolvedValue({ etat: 'bilan-smt' }),
    compteDeResultat: jest.fn().mockResolvedValue({ etat: 'compte-de-resultat-smt' }),
  } as unknown as EtatsFinanciersSmtService;
  // Jeu projets · les trois tableaux du point 2 de l'article 14 sont
  // désormais produits (guide d'application, Applications 21 et 22).
  const efb = {
    executionBudgetaire: jest.fn().mockResolvedValue({ etat: 'execution-budgetaire' }),
    reconciliationTresorerie: jest.fn().mockResolvedValue({ etat: 'reconciliation-tresorerie' }),
  } as unknown as EtatsFinanciersProjetBudgetService;
  // Chemin SYSCOHADA · AUDCIF art. 19. Les trois états y sont produits par
  // d'autres services que ceux du SYCEBNL, aucun n'étant transposable.
  const esc = {
    bilan: jest.fn().mockResolvedValue({ etat: 'bilan-syscohada' }),
    compteDeResultat: jest.fn().mockResolvedValue({ etat: 'compte-resultat-syscohada' }),
    tableauFluxTresorerie: jest.fn().mockResolvedValue({ etat: 'tft-syscohada' }),
  } as never;
  const escSmt = {
    bilan: jest.fn().mockResolvedValue({ etat: 'bilan-smt-syscohada' }),
    compteDeResultat: jest.fn().mockResolvedValue({ etat: 'compte-resultat-smt-syscohada' }),
  } as never;
  return {
    inventaire: new LivreInventaireService(prisma, ef, efp, efs, efb, esc, escSmt),
    esc,
    escSmt,
    rapport: new RapportActiviteService(prisma, ef, donations),
    prisma,
    ef,
    efp,
    efs,
  };
}

// ---------------------------------------------------------------------------
// Article 14 · contenu du livre d'inventaire
// ---------------------------------------------------------------------------

describe('Article 14 · liste des états à transcrire', () => {
  it('reprend les trois états du point 1 pour les associations, dans l’ordre du texte', () => {
    expect(ETATS_INVENTAIRE_ASSOCIATIONS.map((e) => e.libelle)).toEqual([
      'Bilan',
      'Compte de résultat',
      'Tableau des flux de trésorerie',
    ]);
  });

  it('reprend les cinq états du point 2 pour les projets, dans l’ordre du texte', () => {
    expect(ETATS_INVENTAIRE_PROJETS.map((e) => e.libelle)).toEqual([
      'Tableau emplois-ressources',
      "Tableau d'exécution budgétaire",
      'Tableau de réconciliation de trésorerie',
      'Bilan',
      "Compte d'exploitation",
    ]);
  });

  it('motive chaque état déclaré indisponible', () => {
    for (const e of [...ETATS_INVENTAIRE_ASSOCIATIONS, ...ETATS_INVENTAIRE_PROJETS]) {
      if (!e.disponible) expect(e.motifIndisponibilite?.length).toBeGreaterThan(40);
      else expect(e.motifIndisponibilite).toBeUndefined();
    }
  });

  it('aiguille sur le bon point de l’article selon le jeu', () => {
    expect(etatsExigesPar(JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS)).toBe(ETATS_INVENTAIRE_ASSOCIATIONS);
    expect(etatsExigesPar(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT)).toBe(ETATS_INVENTAIRE_PROJETS);
  });
});

describe('Livre d’inventaire · transcription', () => {
  it('fige les trois états d’une association et n’en déclare aucun manquant', async () => {
    const { inventaire } = services();
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect(Object.keys(t.etats as object).sort()).toEqual(['bilan', 'compteDeResultat', 'tableauFluxTresorerie']);
    expect(t.documentsManquants).toEqual([]);
    expect(t.version).toBe(1);
  });

  /**
   * Le défaut que ce test ferme : `jeuEstProjet()` renvoyait une Promise
   * utilisée en condition ternaire toujours vraie, si bien qu'une
   * ASSOCIATION se voyait transcrire le bilan du jeu « projets ». Détecté par
   * le compilateur (TS2801), puis supprimé comme classe d'erreur en passant
   * le jeu en paramètre plutôt qu'en le rechargeant.
   */
  it('transcrit le bilan du BON jeu · associations', async () => {
    const { inventaire, ef, efp } = services();
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect((t.etats as any).bilan).toEqual({ etat: 'bilan-associations' });
    expect(ef.bilan).toHaveBeenCalled();
    expect(efp.bilan).not.toHaveBeenCalled();
  });

  it('transcrit le bilan du BON jeu · projets de développement', async () => {
    const { inventaire, ef, efp } = services(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    efp.tableauEmploisRessources = jest.fn().mockResolvedValue({ etat: 'emplois-ressources' });
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect((t.etats as any).bilan).toEqual({ etat: 'bilan-projet' });
    expect(efp.bilan).toHaveBeenCalled();
    expect(ef.bilan).not.toHaveBeenCalled();
  });

  /**
   * Le point de méthode du module reste le même · ne pas laisser croire à une
   * transcription complète. Ce qui a changé est le CONSTAT : les cinq états
   * du point 2 sont désormais produits, la correspondance des trois derniers
   * ayant été trouvée au guide d'application (chapitre 7, Applications 21 et
   * 22) et dans les contreparties de trésorerie. Le test vérifie donc que le
   * livre les transcrit tous, et qu'il ne déclare plus rien manquant.
   */
  it('transcrit LES CINQ états du point 2, aucun n’est plus déclaré manquant', async () => {
    const { inventaire, efp } = services(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    efp.tableauEmploisRessources = jest.fn().mockResolvedValue({ etat: 'emplois-ressources' });
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    // Assertion sur l'ORDRE DU TEXTE, pas sur un tri alphabétique : l'art. 14
    // point 2 énumère ces états dans cet ordre, et c'est cet ordre que le
    // livre doit restituer à qui le lit.
    expect(Object.keys(t.etats as object)).toEqual([
      'tableauEmploisRessources',
      'tableauExecutionBudgetaire',
      'tableauReconciliationTresorerie',
      'bilan',
      'compteExploitation',
    ]);
    expect(t.documentsManquants).toEqual([]);
  });

  it('fige le jeu sur la transcription, pas seulement les états', async () => {
    const { inventaire, efp } = services(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    efp.tableauEmploisRessources = jest.fn().mockResolvedValue({ etat: 'emplois-ressources' });
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect(t.jeu).toBe(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
  });

  /** Une re-transcription VERSIONNE, elle n'écrase pas : le livre est relié. */
  it('crée une version suivante sans effacer la précédente', async () => {
    const { inventaire, prisma } = services();
    await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    const deux = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect(deux.version).toBe(2);
    expect((prisma as any)._transcriptions).toHaveLength(2);
    expect(await inventaire.courante('t1', 'ex1')).toMatchObject({ version: 2 });
  });

  it('ne transcrit RIEN venu du client : le DTO ne porte aucun état', async () => {
    const { inventaire, ef } = services();
    // Une tentative d'injection est de toute façon rejetée par `whitelist`
    // du ValidationPipe ; ici on vérifie que la source reste le service.
    await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1', resumeOperationInventaire: '  ' } as any);
    expect(ef.bilan).toHaveBeenCalledWith('t1', 'ex1');
  });

  it('normalise un résumé vide en null plutôt qu’en chaîne blanche', async () => {
    const { inventaire } = services();
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1', resumeOperationInventaire: '   ' });
    expect(t.resumeOperationInventaire).toBeNull();
  });
});

describe('Livre d’inventaire · conformité (art. 14)', () => {
  it('un exercice jamais transcrit n’est pas déguisé en transcription vide', async () => {
    const { inventaire } = services();
    const c = await inventaire.conformite('t1', 'ex1');
    expect(c.transcrit).toBe(false);
    expect(c.complete).toBe(false);
    expect(c.etatsExiges.every((e) => !e.transcrit)).toBe(true);
  });

  it('n’est complet qu’avec les états ET le résumé exigés par l’article', async () => {
    const { inventaire } = services();
    const t = await inventaire.transcrire('t1', 'u1', { exerciceId: 'ex1' });
    expect((await inventaire.conformite('t1', 'ex1')).complete).toBe(false);

    await inventaire.renseignerResume('t1', t.id, {
      resumeOperationInventaire: 'Inventaire physique des immobilisations et des stocks au 31/12/2026.',
    });
    const c = await inventaire.conformite('t1', 'ex1');
    expect(c.resume.renseigne).toBe(true);
    expect(c.complete).toBe(true);
  });

  it('un livre de projet est complet dès lors que les cinq états et le résumé y sont', async () => {
    const { inventaire, efp } = services(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    efp.tableauEmploisRessources = jest.fn().mockResolvedValue({ etat: 'emplois-ressources' });
    const t = await inventaire.transcrire('t1', 'u1', {
      exerciceId: 'ex1',
      resumeOperationInventaire: 'Inventaire réalisé.',
    });
    expect(t.resumeOperationInventaire).toBeTruthy();
    const c = await inventaire.conformite('t1', 'ex1');
    expect(c.documentsManquants).toHaveLength(0);
    expect(c.complete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Article 16-3 · rapport d'activité
// ---------------------------------------------------------------------------

const RAPPORT_COMPLET = {
  exerciceId: 'ex1',
  etabliLe: '2027-03-15',
  situationExerciceEcoule: 'Activité soutenue, 12 projets menés.',
  perspectivesDeveloppement: 'Ouverture d’une antenne à Lubumbashi en 2027.',
  evolutionTresorerie: 'Trésorerie en hausse de 300 sur l’exercice.',
  evenementsPosterieurs: 'Signature d’une convention bailleur le 20/01/2027.',
  declarationDirigeants: 'Les dirigeants attestent de la tenue conforme du registre des donateurs.',
};

describe('Article 16-3 · sections du rapport d’activité', () => {
  it('en énumère QUATRE, ni plus ni moins, dans l’ordre du texte', () => {
    expect(SECTIONS_RAPPORT_ACTIVITE.map((s) => s.cle)).toEqual([
      'situationExerciceEcoule',
      'perspectivesDeveloppement',
      'evolutionTresorerie',
      'evenementsPosterieurs',
    ]);
  });

  it('cite le texte pour chaque section', () => {
    for (const s of SECTIONS_RAPPORT_ACTIVITE) expect(s.exigence).toMatch(/Art\. 16-3/);
  });
});

describe('Rapport d’activité · établissement', () => {
  /**
   * La date d'établissement n'est pas décorative : conjuguée à la clôture,
   * elle DÉFINIT la fenêtre des événements postérieurs que le point 4 exige.
   * Antérieure à la clôture, cette fenêtre serait vide par construction.
   */
  it('refuse une date d’établissement antérieure à la clôture', async () => {
    const { rapport } = services();
    await expect(
      rapport.etablir('t1', 'u1', { ...RAPPORT_COMPLET, etabliLe: '2026-11-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte une date d’établissement égale à la clôture', async () => {
    const { rapport } = services();
    const r = await rapport.etablir('t1', 'u1', { ...RAPPORT_COMPLET, etabliLe: '2026-12-31' });
    expect(r.version).toBe(1);
  });

  it('fige la trésorerie du TFT au moment de l’établissement', async () => {
    const { rapport } = services();
    const r = await rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    expect(r.tresorerie).toEqual({ ouverture: 1200, variation: 300, cloture: 1500, boucle: true });
  });

  /**
   * Un rapport qui exposerait une trésorerie non bouclée sans le dire serait
   * l'état « non fidèle » du deuxième tiret de l'article 24 : le défaut de
   * bouclage est figé avec les chiffres.
   */
  it('fige aussi le NON-bouclage du TFT', async () => {
    const { rapport } = services(
      JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
      undefined,
      { controle: { tresorerieOuverture: 100, variation: 50, tresorerieClotureParBilan: 900, coherent: false } },
    );
    const r = await rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    expect(r.tresorerie).toMatchObject({ boucle: false });
  });

  it('versionne au lieu d’écraser', async () => {
    const { rapport } = services();
    await rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    const deux = await rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    expect(deux.version).toBe(2);
    expect(await rapport.courant('t1', 'ex1')).toMatchObject({ version: 2 });
  });
});

describe('Rapport d’activité · conformité', () => {
  it('un exercice sans rapport est signalé comme tel (art. 24)', async () => {
    const { rapport } = services();
    const c = await rapport.conformite('t1', 'ex1');
    expect(c.etabli).toBe(false);
    expect(c.complet).toBe(false);
    expect(c.sections.every((s) => !s.renseignee)).toBe(true);
    expect(c.fenetreEvenementsPosterieurs).toBeNull();
  });

  it('signale précisément la section vide, sans juger le contenu des autres', async () => {
    const { rapport } = services();
    await rapport.etablir('t1', 'u1', { ...RAPPORT_COMPLET, perspectivesDeveloppement: undefined });
    const c = await rapport.conformite('t1', 'ex1');
    expect(c.sections.filter((s) => !s.renseignee).map((s) => s.cle)).toEqual(['perspectivesDeveloppement']);
    expect(c.complet).toBe(false);
  });

  it('nomme la fenêtre des événements postérieurs plutôt que de la sous-entendre', async () => {
    const { rapport } = services();
    await rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    const c = await rapport.conformite('t1', 'ex1');
    expect(c.fenetreEvenementsPosterieurs).toEqual({ du: EXERCICE.dateFin, au: new Date('2027-03-15') });
  });

  /**
   * Art. 18 : la déclaration des dirigeants n'est attendue QUE faute
   * d'auditeur. La réclamer à une entité qui en a un inventerait une
   * obligation ; la taire à celle qui n'en a pas laisserait passer un
   * manquement.
   */
  it('n’attend la déclaration des dirigeants qu’en l’absence d’auditeur', async () => {
    const { rapport } = services();
    await rapport.etablir('t1', 'u1', { ...RAPPORT_COMPLET, entiteAvecAuditeur: true, declarationDirigeants: undefined });
    const c = await rapport.conformite('t1', 'ex1');
    expect(c.declarationRegistreDonateurs.attendue).toBe(false);
    expect(c.complet).toBe(true);
  });

  it('bloque la complétude quand la déclaration manque et qu’il n’y a pas d’auditeur', async () => {
    const { rapport } = services();
    await rapport.etablir('t1', 'u1', { ...RAPPORT_COMPLET, declarationDirigeants: undefined });
    const c = await rapport.conformite('t1', 'ex1');
    expect(c.declarationRegistreDonateurs.attendue).toBe(true);
    expect(c.declarationRegistreDonateurs.renseignee).toBe(false);
    expect(c.complet).toBe(false);
  });

  /**
   * Attester d'une « tenue conforme » démentie par le rapport de l'art. 18
   * exposerait les dirigeants au DEUXIÈME tiret de l'art. 24 en plus du
   * troisième : le rapport confronte l'attestation à l'état réel du registre.
   */
  it('confronte la déclaration à l’état réel du registre des donateurs', async () => {
    const conforme = services();
    await conforme.rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    expect((await conforme.rapport.conformite('t1', 'ex1')).declarationRegistreDonateurs.registreConforme).toBe(true);

    const nonConforme = services(
      JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
      undefined,
      TFT_QUI_BOUCLE,
      false,
    );
    await nonConforme.rapport.etablir('t1', 'u1', RAPPORT_COMPLET);
    const c = await nonConforme.rapport.conformite('t1', 'ex1');
    expect(c.declarationRegistreDonateurs.renseignee).toBe(true);
    expect(c.declarationRegistreDonateurs.registreConforme).toBe(false);
  });
});
