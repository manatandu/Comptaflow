import { BadRequestException } from '@nestjs/common';
import { NumerotationPiece } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { prochainNumeroPiece } from '../journaux/numerotation-piece';
import { PrismaService } from '../../common/prisma.service';

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

function serviceEcriture(detenteurs: Record<string, number> = {}) {
  const compte = (id: string) => ({ id, numero: '60100000', intitule: 'Achats', typeCompte: 'DETAIL', tenantId: 't1' });
  const compteur = (modele: string) => jest.fn().mockResolvedValue(detenteurs[modele] ?? 0);
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    compte: { findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(compte)) ) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([]) },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e1', statut: 'BROUILLARD', exercice: EXERCICE, tenantId: 't1', lignes: [], journalId: 'j1', date: new Date('2026-03-04') }),
      delete: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
    immobilisation: { count: compteur('immobilisation') },
    dotationAmortissement: { count: compteur('dotationAmortissement') },
    depreciationImmobilisation: { count: compteur('depreciationImmobilisation') },
    reevaluation: { count: compteur('reevaluation') },
    regularisation: { count: compteur('regularisation') },
    echeanceAbonnement: { count: compteur('echeanceAbonnement') },
    liquidationTva: { count: compteur('liquidationTva') },
    donation: { count: compteur('donation') },
    affectationResultat: { count: compteur('affectationResultat') },
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

  it('laisse partir une écriture que personne ne tient', async () => {
    await expect(serviceEcriture().supprimer('t1', 'e1')).resolves.toEqual({ supprime: true });
  });
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
