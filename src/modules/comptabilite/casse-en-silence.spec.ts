import { BadRequestException } from '@nestjs/common';
import { NumerotationPiece } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { prochainNumeroPiece } from '../journaux/numerotation-piece';
import { PrismaService } from '../../common/prisma.service';
import { ImportService } from '../import/import.service';
import { TypeImport } from '../import/dto/import.dto';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

/**
 * CE QUI CASSERAIT EN SILENCE · quatre défauts qui laissent l'écriture
 * équilibrée, la balance bouclée et l'état imprimable.
 *
 * Aucun des quatre ne produit d'erreur, de total faux ni d'anomalie. C'est
 * exactement pour ça qu'ils demandent chacun un refus nommé plutôt qu'un
 * contrôle en aval : en aval, tout est cohérent avec la mauvaise racine.
 *
 *  1 · une écriture datée HORS de son exercice · `modifier` le refusait,
 *      `creer` l'acceptait ;
 *  2 · une écriture créée SANS numéro de pièce par les chemins qui
 *      n'appelaient pas la numérotation (les deux imports, le Groupe) ;
 *  3 · une écriture supprimée alors qu'un MODULE la tient · le lien facultatif
 *      se dénoue tout seul (`ON DELETE SET NULL`) ;
 *  4 · DEUX exercices couvrant la même période.
 */

type Faux = Record<string, unknown>;

const EXERCICE = {
  id: 'ex',
  dateDebut: new Date('2026-01-01'),
  dateFin: new Date('2026-12-31'),
  statut: 'OUVERT',
};

function serviceEcriture(detenteurs: Record<string, number> = {}, statut = 'BROUILLARD') {
  const compte = (id: string) => ({ id, numero: '60100000', intitule: 'Achats', typeCompte: 'DETAIL', tenantId: 't1' });
  const compteur = (modele: string) => jest.fn().mockResolvedValue(detenteurs[modele] ?? 0);
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map(compte))),
      findFirst: jest.fn().mockResolvedValue({ ...compte('c2'), estActif: true }),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([]) },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'e1', statut, exercice: EXERCICE, exerciceId: 'ex', tenantId: 't1', lignes: [], journalId: 'j1',
        journal: { id: 'j1', code: 'OD' }, date: new Date('2026-03-04'), libelle: 'Pièce', correction: null,
        corrigeEcritureId: null, estGenereeParCloture: false, immobilisationAcquisition: null,
        immobilisationSortie: null, dotationAmortissement: null,
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: {
      deleteMany: jest.fn().mockResolvedValue({}),
      // La ligne que la réimputation déplace · son écriture est « e1 », celle
      // que les comptages de détenteurs visent.
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'l1', ecritureId: 'e1', compteId: 'c1', compte: { numero: '60100000' }, debit: 100, credit: 0,
          lettre: null, rapprochementId: null, tauxTvaId: null, ventilations: [],
          ecriture: {
            id: 'e1', statut, exerciceId: 'ex', journalId: 'j1', date: new Date('2026-03-04'),
            estGenereeParCloture: false, exercice: EXERCICE, journal: { code: 'OD' },
            immobilisationAcquisition: null, immobilisationSortie: null, dotationAmortissement: null,
          },
        },
      ]),
    },
    immobilisation: { count: compteur('immobilisation') },
    dotationAmortissement: { count: compteur('dotationAmortissement') },
    depreciationImmobilisation: { count: compteur('depreciationImmobilisation') },
    reclassementImmobilisation: { count: compteur('reclassementImmobilisation') },
    reevaluation: { count: compteur('reevaluation') },
    regularisation: { count: compteur('regularisation') },
    echeanceAbonnement: { count: compteur('echeanceAbonnement') },
    liquidationTva: { count: compteur('liquidationTva') },
    donation: { count: compteur('donation') },
    affectationResultat: { count: compteur('affectationResultat') },
    executionEngagement: { count: compteur('executionEngagement') },
    mouvementStock: { count: compteur('mouvementStock') },
    consignation: { count: compteur('consignation') },
    bulletinPaie: { count: compteur('bulletinPaie') },
    ligneOrdreVirement: { count: compteur('ligneOrdreVirement') },
    amortissementDerogatoire: { count: compteur('amortissementDerogatoire') },
    $transaction: jest.fn().mockImplementation((f: (tx: unknown) => unknown) => f(prisma)),
  } as Faux;

  const journalService = {
    trouver: jest.fn().mockResolvedValue({ id: 'j1', code: 'OD', estActif: true, numerotation: 'MANUELLE' }),
    prochainNumeroPiece: jest.fn().mockResolvedValue(null),
  };
  const exerciceService = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
  const analytiqueService = { verifierVentilationObligatoire: jest.fn().mockResolvedValue(undefined) };

  return new EcritureService(
    prisma as unknown as PrismaService,
    journalService as never,
    exerciceService as never,
    analytiqueService as never,
  );
}

const ECRITURE = {
  exerciceId: 'ex',
  journalId: 'j1',
  date: '2026-03-04',
  libelle: 'Achat de fournitures',
  lignes: [
    { compteId: 'c1', debit: 100_000, credit: 0 },
    { compteId: 'c2', debit: 0, credit: 100_000 },
  ],
};

describe('1 · la date de l’écriture tombe dans son exercice', () => {
  it('refuse une date antérieure à l’ouverture · la faute de janvier', async () => {
    // On tape l'année qui vient de finir. L'écriture s'équilibre, elle est
    // rattachée à l'exercice 2026 par son `exerciceId`, donc tous les états
    // la comptent en 2026 · seule la lecture du journal montrerait la date
    // étrangère.
    await expect(
      serviceEcriture().creer('t1', 'u1', { ...ECRITURE, date: '2025-12-31' } as never),
    ).rejects.toThrow(/sort de l'exercice/i);
  });

  it('refuse une date postérieure à la clôture', async () => {
    await expect(
      serviceEcriture().creer('t1', 'u1', { ...ECRITURE, date: '2027-01-02' } as never),
    ).rejects.toThrow(/sort de l'exercice/i);
  });

  it('accepte une date dans l’exercice', async () => {
    const svc = serviceEcriture();
    // Le refus tombe avant la transaction · si la date passe, on va plus loin
    // que le contrôle de date, ce qui suffit à prouver qu'il ne bloque pas.
    await expect(svc.creer('t1', 'u1', ECRITURE as never)).rejects.not.toThrow(/sort de l'exercice/i);
  });
});

describe('2 · toute écriture reçoit le numéro que son journal impose', () => {
  const tx = (max: number | null) => ({
    ecriture: { aggregate: jest.fn().mockResolvedValue({ _max: { numeroPiece: max } }) },
  }) as unknown as PrismaService;

  it('MANUELLE ne numérote pas', async () => {
    const n = await prochainNumeroPiece(tx(7), 't1', { id: 'j1', numerotation: NumerotationPiece.MANUELLE }, 'ex', new Date());
    expect(n).toBeNull();
  });

  it('CONTINUE_JOURNAL prend la suite', async () => {
    const n = await prochainNumeroPiece(
      tx(12), 't1', { id: 'j1', numerotation: NumerotationPiece.CONTINUE_JOURNAL }, 'ex', new Date('2026-03-04'),
    );
    expect(n).toBe(13);
  });

  it('un journal vierge commence à 1, pas à 0 ni à null', async () => {
    const n = await prochainNumeroPiece(
      tx(null), 't1', { id: 'j1', numerotation: NumerotationPiece.CONTINUE_FICHIER }, 'ex', new Date('2026-03-04'),
    );
    expect(n).toBe(1);
  });

  it('les quatre chemins qui l’ignoraient l’appellent désormais', () => {
    // Gelé par lecture de la source : l'import (reprise de balance et import
    // d'écritures) et le Groupe (canevas de trésorerie et combinaison)
    // créaient leurs écritures sans `numeroPiece`, quel que soit le mode du
    // journal. Un journal à numérotation continue portait donc des pièces
    // sans numéro, entremêlées par date avec les pièces numérotées de la
    // saisie · rien ne le signale, et c'est l'import qui reprend l'existant
    // d'un dossier.
    const fs = require('fs') as typeof import('fs');
    for (const f of ['src/modules/import/import.service.ts', 'src/modules/groupe/groupe.service.ts']) {
      const source = fs.readFileSync(f, 'utf-8');
      const creations = (source.match(/ecriture\.create\(/g) ?? []).length;
      const numeros = (source.match(/numeroPiece,/g) ?? []).length;
      expect(numeros).toBe(creations);
    }
  });
});

describe('3 · une écriture qu’un module tient ne se supprime pas', () => {
  it('refuse, et nomme le module', async () => {
    // Le lien est FACULTATIF · PostgreSQL ne refuse rien, Prisma y pose
    // `ON DELETE SET NULL`. L'affectation resterait enregistrée sans son
    // écriture, le report à nouveau n'aurait jamais bougé, et le bilan
    // d'ouverture cesserait de correspondre à la clôture précédente sans
    // qu'aucun total ne bouge · les deux lignes partent ensemble.
    await expect(
      serviceEcriture({ affectationResultat: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/affectation du résultat/i);
  });

  it('nomme les DEUX modules quand deux la tiennent', async () => {
    await expect(
      serviceEcriture({ donation: 1, liquidationTva: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/liquidation de TVA et une donation/i);
  });

  it("refuse aussi quand l'écriture exécute un engagement de dépense", async () => {
    // Ici le lien est OBLIGATOIRE et posé en RESTRICT : la base refuserait de
    // toute façon, mais par une erreur brute. Le refus nommé existe pour
    // l'autre moitié du problème · si le rattachement partait, le RESTE À
    // EXÉCUTER de l'engagement remonterait tout seul et la colonne Engagement
    // du tableau d'exécution budgétaire grossirait sans que personne ne l'ait
    // décidé.
    await expect(
      serviceEcriture({ executionEngagement: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/engagement de dépense/i);
  });

  it("refuse aussi quand l'écriture porte un mouvement de magasin", async () => {
    // Le lien est FACULTATIF : sans ce refus, Prisma le dénouerait en silence.
    // La fiche de stock afficherait alors « écriture non passée » sur un
    // mouvement qui en avait une, la fiche et le compte divergeraient, et
    // l'écart remonterait à la clôture sous la forme d'un MALI D'INVENTAIRE
    // qui n'existe pas · mis à la charge de l'entité, sur une balance qui
    // boucle.
    await expect(
      serviceEcriture({ mouvementStock: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/mouvement de magasin/i);
  });

  it("refuse aussi quand l'écriture ouvre ou dénoue une consignation", async () => {
    await expect(
      serviceEcriture({ consignation: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/consignation d'emballages/i);
  });

  it("refuse aussi quand l'écriture passe la paie du mois", async () => {
    // P9 · supprimée seule, elle laisserait les bulletins se dire passés
    // sans écriture · la passation se défait depuis la fenêtre Personnel.
    await expect(
      serviceEcriture({ bulletinPaie: 3 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/paie du mois/i);
  });

  it("refuse aussi quand l'écriture est exécutée par un ordre de virement", async () => {
    // Supprimée seule, la pièce rouvrirait la dette au 40 pendant que la
    // banque exécute l'ordre · c'est l'annulation de l'ordre qui la libère.
    await expect(
      serviceEcriture({ ligneOrdreVirement: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/ordre de virement/i);
  });

  it("refuse aussi quand l'écriture passe un amortissement dérogatoire", async () => {
    await expect(
      serviceEcriture({ amortissementDerogatoire: 1 }).supprimer('t1', 'e1'),
    ).rejects.toThrow(/dérogatoire/i);
  });

  it('laisse partir une écriture que personne ne tient', async () => {
    await expect(serviceEcriture().supprimer('t1', 'e1')).resolves.toEqual({ supprime: true });
  });
});

/**
 * AUDIT DU SERVEUR DU 2026-09-27, F2 · la suppression était le SEUL geste
 * gardé. `modifier` remplaçait les lignes d'une liquidation ou d'une
 * affectation, `reimputer` ne connaissait que l'immobilisation, et la
 * correction par inscription en négatif annulait au journal l'écriture d'un
 * module dont le marqueur affirmait encore l'opération. Chaque détenteur de
 * la liste est confronté aux QUATRE gestes, et chacun refuse comme la
 * suppression · une liste de détenteurs lue par un seul geste est une liste
 * que les trois autres contournent.
 */
describe('3 bis · une écriture qu’un module tient ne se retouche pas non plus', () => {
  const DETENTEURS = [
    'immobilisation', 'dotationAmortissement', 'depreciationImmobilisation', 'reclassementImmobilisation', 'reevaluation', 'regularisation',
    'echeanceAbonnement', 'liquidationTva', 'donation', 'affectationResultat', 'executionEngagement',
    'mouvementStock', 'bulletinPaie', 'amortissementDerogatoire', 'ligneOrdreVirement', 'consignation',
  ];
  const gestes: Array<[string, string, (s: EcritureService) => Promise<unknown>]> = [
    ['supprimer', 'BROUILLARD', (s) => s.supprimer('t1', 'e1')],
    ['modifier', 'BROUILLARD', (s) => s.modifier('t1', 'e1', { libelle: 'autre' })],
    ['réimputer au brouillard', 'BROUILLARD', (s) =>
      s.reimputer('t1', 'u1', { ligneIds: ['l1'], compteCibleId: 'c2', motif: 'x' })],
    ['réimputer une ligne validée', 'VALIDEE', (s) =>
      s.reimputer('t1', 'u1', { ligneIds: ['l1'], compteCibleId: 'c2', date: '2026-06-30', motif: 'x' })],
    ['corriger en négatif', 'VALIDEE', (s) =>
      s.corrigerParInscriptionEnNegatif('t1', 'u1', 'e1', { motifCorrection: 'x', date: '2026-06-30' } as never)],
  ];

  for (const [geste, statut, faire] of gestes) {
    it.each(DETENTEURS)(`${geste} · refuse quand %s tient l'écriture`, async (modele) => {
      await expect(faire(serviceEcriture({ [modele]: 1 }, statut))).rejects.toThrow(/contrepartie comptable de/);
    });
  }
});

describe('4 · une période n’est couverte que par un seul exercice', () => {
  const service = (existant: { dateDebut: Date; dateFin: Date } | null) =>
    new ExerciceService(
      {
        exercice: {
          count: async () => (existant ? 1 : 0),
          findFirst: async () => existant,
          create: async (a: unknown) => a,
        },
      } as never,
      {} as never,
    );

  it('refuse un second exercice sur la même année civile', async () => {
    // L'art. 7 impose la DURÉE, pas l'unicité, et rien ne l'imposait
    // ailleurs. Les écritures se répartiraient entre les deux, chaque bilan
    // bouclerait sur SON exercice, et il faudrait additionner deux liasses
    // pour voir que l'année a été coupée en deux.
    await expect(
      service({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }).creer('t1', {
        dateDebut: '2026-01-01',
        dateFin: '2026-12-31',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte l’exercice suivant, qui ne chevauche rien', async () => {
    await expect(
      service(null).creer('t1', { dateDebut: '2027-01-01', dateFin: '2027-12-31' } as never),
    ).resolves.toBeDefined();
  });
});

/**
 * 5 · LES CHEMINS QUI ÉCRIVENT PASSENT PAR LES CONTRÔLES DE LA SAISIE · audit
 * du serveur du 2026-09-27, F3. La reprise de balance, l'import d'écritures et
 * le canevas du groupe recopiaient EN PARTIE les contrôles de `creer` : ni
 * journal en sommeil, ni période close, et la reprise prenait sa date telle
 * quelle. Chacun appelle désormais `EcritureService.controlesDEntree`, la
 * liste unique ; le canevas a son test dans groupe.spec.ts.
 */
describe('5 · les imports passent par les contrôles d’entrée de la saisie', () => {
  const COMPTES_IMPORT = [
    { id: 'c52', numero: '52110000', typeCompte: 'DETAIL' },
    { id: 'c10', numero: '10110000', typeCompte: 'DETAIL' },
  ];

  function serviceImport(refus?: Error) {
    const creerEcriture = jest.fn().mockResolvedValue({ id: 'e-imp' });
    const tx = {
      compte: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue(COMPTES_IMPORT.map((c) => ({ id: c.id, numero: c.numero }))),
      },
      ecriture: { create: creerEcriture, findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't', longueurCompte: 8, referentiel: 'SYCEBNL' }) },
      exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
      journal: {
        findMany: jest.fn().mockResolvedValue([{ id: 'j-od', code: 'OD', type: 'GENERAL', numerotation: 'MANUELLE' }]),
      },
      compte: { findMany: jest.fn().mockResolvedValue(COMPTES_IMPORT) },
      $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
    };
    const controlesDEntree = jest.fn().mockImplementation(async () => {
      if (refus) throw refus;
      return {};
    });
    const svc = new ImportService(prisma as never, { controlesDEntree } as never);
    return { svc, creerEcriture, controlesDEntree, tx };
  }

  const csv = (entete: string, lignes: string[]) =>
    Buffer.from([entete, ...lignes].join('\n'), 'utf8').toString('base64');

  const BALANCE = csv('numero;intitule;debit;credit', ['52110000;Banque;500;0', '10110000;Dotation;0;500']);
  const MAPPING_BALANCE = { numero: 'numero', intitule: 'intitule', debit: 'debit', credit: 'credit' };

  it('une reprise de balance datée HORS de l’exercice est refusée, avant toute écriture', async () => {
    // La faute de janvier, que le § 10 bis a fermée dans `creer` · la reprise
    // prenait `dateOperation` telle quelle.
    const { svc, creerEcriture, controlesDEntree } = serviceImport();
    await expect(
      svc.executer('t', 'u', {
        type: TypeImport.BALANCE,
        nomFichier: 'b.csv',
        contenuBase64: BALANCE,
        mapping: MAPPING_BALANCE,
        dateOperation: '2025-12-31',
      } as never),
    ).rejects.toThrow(/sort de l'exercice/);
    expect(creerEcriture).not.toHaveBeenCalled();
    expect(controlesDEntree).not.toHaveBeenCalled();
  });

  it('une reprise de balance joue les contrôles de la saisie DANS la transaction, et un refus n’écrit rien', async () => {
    const refus = new BadRequestException('Le journal OD est en sommeil');
    const { svc, creerEcriture, controlesDEntree, tx } = serviceImport(refus);
    await expect(
      svc.executer('t', 'u', {
        type: TypeImport.BALANCE,
        nomFichier: 'b.csv',
        contenuBase64: BALANCE,
        mapping: MAPPING_BALANCE,
        dateOperation: '2026-01-01',
      } as never),
    ).rejects.toThrow(/en sommeil/);
    expect(creerEcriture).not.toHaveBeenCalled();
    // Lu avec le client de la transaction · les comptes créés par la reprise
    // n'existent que là.
    const [dossier, piece, client] = controlesDEntree.mock.calls[0];
    expect([dossier, piece.journalId, piece.lignes.length, client === tx]).toEqual(['t', 'j-od', 2, true]);
  });

  it('une pièce importée que la saisie refuserait est une anomalie nommée, et n’est pas créée', async () => {
    const refus = new BadRequestException('Période close jusqu’au 31/03/2026');
    const { svc, creerEcriture, controlesDEntree } = serviceImport(refus);
    const rapport = await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'e.csv',
      contenuBase64: csv('date;piece;numero;libelle;debit;credit', [
        '2026-03-04;P1;52110000;Apport;500;0',
        '2026-03-04;P1;10110000;Apport;0;500',
      ]),
      mapping: { date: 'date', piece: 'piece', numero: 'numero', libelle: 'libelle', debit: 'debit', credit: 'credit' },
    } as never);
    expect(controlesDEntree).toHaveBeenCalledTimes(1);
    expect(creerEcriture).not.toHaveBeenCalled();
    expect(rapport.anomalies.map((a: { message: string }) => a.message)).toEqual([
      "Période close jusqu’au 31/03/2026 · la pièce n'a pas été créée.",
    ]);
  });

  it('la ventilation obligatoire n’est levée que pour les chemins sans colonne de section, et nommément', async () => {
    // Un import ne porte aucune section · exiger la ventilation le rendrait
    // impossible au dossier qui l'a posée. Tous les autres contrôles restent.
    const analytique = { verifierVentilationObligatoire: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
      compte: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', numero: '60100000', typeCompte: 'DETAIL' },
          { id: 'c2', numero: '52110000', typeCompte: 'DETAIL' },
        ]),
      },
      sectionAnalytique: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new EcritureService(
      prisma as never,
      { trouver: jest.fn().mockResolvedValue({ id: 'j1', code: 'OD', estActif: true }) } as never,
      { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) } as never,
      analytique as never,
    );
    const piece = { exerciceId: 'ex', journalId: 'j1', date: '2026-03-04', lignes: ECRITURE.lignes };
    await svc.controlesDEntree('t1', { ...piece, exigerVentilationObligatoire: false });
    expect(analytique.verifierVentilationObligatoire).not.toHaveBeenCalled();
    await svc.controlesDEntree('t1', piece);
    expect(analytique.verifierVentilationObligatoire).toHaveBeenCalledTimes(1);
  });

  it('la reprise de balance la lève', async () => {
    const { svc, controlesDEntree } = serviceImport();
    await svc.executer('t', 'u', {
      type: TypeImport.BALANCE,
      nomFichier: 'b.csv',
      contenuBase64: BALANCE,
      mapping: MAPPING_BALANCE,
      dateOperation: '2026-01-01',
    } as never);
    expect(controlesDEntree.mock.calls[0][1].exigerVentilationObligatoire).toBe(false);
  });

  it('chaque fichier qui crée une écriture hors de la saisie appelle les contrôles d’entrée, ou dit pourquoi', () => {
    // Lecture de la source, parce qu'aucun jeu d'essai ne montre l'ABSENCE
    // d'un appel dans un chemin qu'on n'a pas pensé à tester. La liste des
    // fichiers est GELÉE · un nouveau chemin d'écriture fait tomber le test
    // tant que quelqu'un n'a pas décidé s'il passe par les contrôles.
    const racine = join(__dirname, '..', '..');
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const p = join(dossier, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) {
          if (/ecriture\.create\(/.test(readFileSync(p, 'utf-8'))) fichiers.push(relative(racine, p));
        }
      }
    };
    parcourir(racine);
    // EXEMPTÉS, ET POURQUOI · la saisie elle-même, et la clôture
    // (exercice.service.ts), qui pose le report à-nouveau calculé sur des
    // soldes déjà validés · ExerciceService ne peut d'ailleurs pas dépendre
    // d'EcritureService, qui dépend de lui.
    const EXEMPTES = new Set([
      join('modules', 'comptabilite', 'ecriture.service.ts'),
      join('modules', 'exercice', 'exercice.service.ts'),
    ]);
    expect(fichiers.sort()).toEqual(
      [
        join('modules', 'comptabilite', 'ecriture.service.ts'),
        join('modules', 'exercice', 'exercice.service.ts'),
        join('modules', 'groupe', 'groupe.service.ts'),
        join('modules', 'import', 'import.service.ts'),
      ].sort(),
    );
    for (const f of fichiers.filter((x) => !EXEMPTES.has(x))) {
      const source = readFileSync(join(racine, f), 'utf-8');
      expect([f, /\.controlesDEntree\(/.test(source)]).toEqual([f, true]);
    }
  });
});
