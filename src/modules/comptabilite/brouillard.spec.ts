import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';

/**
 * La frontière que le brouillard déplace, et elle seule : tant qu'une écriture
 * n'est pas validée elle se modifie et se supprime ; une fois validée, elle
 * est entrée au livre-journal et l'article 20 de l'AUDCIF ne laisse plus que
 * l'inscription en négatif.
 *
 * Ces tests figent aussi LES DEUX délais de séjour, et le fait qu'ils
 * diffèrent · le service servait sept jours aux deux référentiels, si bien
 * qu'une entreprise voyait « en retard de centralisation » des écritures qui
 * ne l'étaient pas, trois semaines avant de l'être :
 *
 *  · SYCEBNL, Partie 2 ch. 2 · centralisation au moins hebdomadaire, sept jours ;
 *  · AUDCIF, art. 19 · centralisation au moins mensuelle, trente jours.
 */

type Faux = Record<string, unknown>;

function service(prisma: Faux, exerciceService: Faux = {}) {
  return new EcritureService(
    prisma as unknown as PrismaService,
    {} as JournalService,
    exerciceService as unknown as ExerciceService,
    {} as AnalytiqueService,
  );
}

const exerciceOuvert = { statut: 'OUVERT', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

function ecriture(surcharge: Faux = {}) {
  return {
    id: 'e1',
    numeroPiece: 12,
    statut: 'BROUILLARD',
    date: new Date('2026-05-10'),
    journalId: 'j1',
    exercice: exerciceOuvert,
    journal: { code: 'ACH' },
    lignes: [
      { id: 'l1', debit: 1000, credit: 0, lettre: null, rapprochementId: null },
      { id: 'l2', debit: 0, credit: 1000, lettre: null, rapprochementId: null },
    ],
    ...surcharge,
  };
}

describe('brouillard · ce qui se modifie et ce qui ne se modifie plus', () => {
  it('refuse de modifier une écriture validée, et nomme l’article 20', async () => {
    const prisma = { ecriture: { findFirst: jest.fn().mockResolvedValue(ecriture({ statut: 'VALIDEE' })) } } as Faux;
    await expect(service(prisma).modifier('t1', 'e1', { libelle: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service(prisma).modifier('t1', 'e1', { libelle: 'x' })).rejects.toThrow(/article 20/i);
  });

  it('refuse de modifier une écriture dont une ligne est lettrée', async () => {
    const prisma = {
      ecriture: {
        findFirst: jest.fn().mockResolvedValue(
          ecriture({ lignes: [{ id: 'l1', lettre: 'A', rapprochementId: null }] }),
        ),
      },
    } as Faux;
    await expect(service(prisma).modifier('t1', 'e1', { libelle: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de modifier une écriture dont une ligne est pointée', async () => {
    const prisma = {
      ecriture: {
        findFirst: jest.fn().mockResolvedValue(
          ecriture({ lignes: [{ id: 'l1', lettre: null, rapprochementId: 'r1' }] }),
        ),
      },
    } as Faux;
    await expect(service(prisma).modifier('t1', 'e1', { libelle: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de supprimer une écriture validée', async () => {
    const prisma = { ecriture: { findFirst: jest.fn().mockResolvedValue(ecriture({ statut: 'VALIDEE' })) } } as Faux;
    await expect(service(prisma).supprimer('t1', 'e1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse une modification qui déséquilibrerait l’écriture', async () => {
    const prisma = {
      ecriture: { findFirst: jest.fn().mockResolvedValue(ecriture()) },
      compte: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', typeCompte: 'DETAIL' }]) },
    } as Faux;
    const exercices = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
    await expect(
      service(prisma, exercices).modifier('t1', 'e1', {
        lignes: [
          { compteId: 'c1', debit: 900 },
          { compteId: 'c1', credit: 1000 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('validation', () => {
  it('refuse de valider une écriture déséquilibrée', async () => {
    const prisma = {
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            numeroPiece: 3,
            statut: 'BROUILLARD',
            exercice: { statut: 'OUVERT' },
            journal: { code: 'ACH' },
            lignes: [
              { debit: 500, credit: 0 },
              { debit: 0, credit: 400 },
            ],
          },
        ]),
      },
    } as Faux;
    await expect(service(prisma).valider('t1', 'u1', ['e1'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de valider sur un exercice clôturé', async () => {
    const prisma = {
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            numeroPiece: 3,
            statut: 'BROUILLARD',
            exercice: { statut: 'CLOTURE' },
            journal: { code: 'ACH' },
            lignes: [
              { debit: 500, credit: 0 },
              { debit: 0, credit: 500 },
            ],
          },
        ]),
      },
    } as Faux;
    await expect(service(prisma).valider('t1', 'u1', ['e1'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('valide ce qui peut l’être et compte ce qui l’était déjà', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            statut: 'BROUILLARD',
            numeroPiece: 1,
            exercice: { statut: 'OUVERT' },
            journal: { code: 'ACH' },
            lignes: [
              { debit: 100, credit: 0 },
              { debit: 0, credit: 100 },
            ],
          },
          {
            id: 'e2',
            statut: 'VALIDEE',
            numeroPiece: 2,
            exercice: { statut: 'OUVERT' },
            journal: { code: 'ACH' },
            lignes: [],
          },
        ]),
        updateMany,
      },
      // Le double regard est LU sur le dossier · désactivé ici, ce test porte
      // sur la validation ordinaire. Son propre spec le couvre à part.
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          doubleRegardValidation: false,
          referentiel: 'SYCEBNL',
        }),
      },
    } as Faux;
    const resultat = await service(prisma).valider('t1', 'u1', ['e1', 'e2']);
    expect(resultat).toEqual({
      validees: 1,
      dejaValidees: 1,
      refuseesSecondRegard: 0,
      sousDerogation: 0,
      motifRefus: null,
    });
    // La borne de dossier est exigée dans le filtre, pas seulement supposée
    // depuis la sélection qui précède · c'est ce que vérifie la garde de
    // cloisonnement au moteur (src/common/cloisonnement).
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['e1'] }, tenantId: 't1' } }),
    );
  });
});

describe('état du brouillard · retard de centralisation', () => {
  function prismaAvec(createdAt: Date, referentiel = 'SYCEBNL') {
    return {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            date: new Date('2026-05-10'),
            createdAt,
            numeroPiece: 4,
            libelle: 'Achat fournitures',
            reference: 'F-12',
            journal: { code: 'ACH', intitule: 'Achats' },
            lignes: [
              { debit: 100, credit: 0, libelle: null, compte: { numero: '60410000', intitule: 'Achats' } },
              { debit: 0, credit: 100, libelle: null, compte: { numero: '40110000', intitule: 'Fournisseurs' } },
            ],
          },
        ]),
      },
    } as Faux;
  }

  it('signale une écriture en brouillard depuis plus de sept jours', async () => {
    const vieille = new Date(Date.now() - 9 * 86_400_000);
    const r = await service(prismaAvec(vieille)).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.delaiCentralisationJours).toBe(7);
    expect(r.lignes[0].ancienneteJours).toBe(9);
    expect(r.lignes[0].retardCentralisation).toBe(true);
    expect(r.totaux.enRetard).toBe(1);
  });

  it('ne signale rien en deçà de sept jours', async () => {
    const recente = new Date(Date.now() - 2 * 86_400_000);
    const r = await service(prismaAvec(recente)).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.lignes[0].retardCentralisation).toBe(false);
    expect(r.totaux.enRetard).toBe(0);
  });

  it('laisse un mois à un dossier SYSCOHADA, comme le veut l’article 19', async () => {
    const vieille = new Date(Date.now() - 9 * 86_400_000);
    const r = await service(prismaAvec(vieille, 'SYSCOHADA')).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.delaiCentralisationJours).toBe(30);
    // Neuf jours : en retard pour une association, parfaitement en règle pour
    // une entreprise. C'est exactement ce que le service confondait.
    expect(r.lignes[0].retardCentralisation).toBe(false);
    expect(r.totaux.enRetard).toBe(0);
  });

  it('signale tout de même une écriture qui dépasse le mois en SYSCOHADA', async () => {
    const tresVieille = new Date(Date.now() - 40 * 86_400_000);
    const r = await service(prismaAvec(tresVieille, 'SYSCOHADA')).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.lignes[0].retardCentralisation).toBe(true);
    expect(r.totaux.enRetard).toBe(1);
  });

  it('compte les écritures déséquilibrées du brouillard', async () => {
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            date: new Date('2026-05-10'),
            createdAt: new Date(),
            numeroPiece: 4,
            libelle: 'Bancale',
            reference: null,
            journal: { code: 'OD', intitule: 'Opérations diverses' },
            lignes: [{ debit: 100, credit: 0, libelle: null, compte: { numero: '6', intitule: 'x' } }],
          },
        ]),
      },
    } as Faux;
    const r = await service(prisma).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.lignes[0].equilibree).toBe(false);
    expect(r.totaux.desequilibrees).toBe(1);
  });
});
