import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EcritureService, PLAFOND_ECRITURES_PAR_FENETRE } from './ecriture.service';
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
    { trouver: jest.fn().mockResolvedValue({ id: 'j1', code: 'ACH', estActif: true }) } as unknown as JournalService,
    exerciceService as unknown as ExerciceService,
    { verifierVentilationObligatoire: jest.fn().mockResolvedValue(undefined) } as unknown as AnalytiqueService,
  );
}

// Les modèles qui peuvent tenir une écriture · voir
// `EcritureService.detenteursDe`. `modifier` les lit désormais (audit du
// 2026-09-27, F2), et une doublure muette validerait un service qui ne les
// lit pas.
const MODELES_DETENTEURS = [
  'immobilisation', 'dotationAmortissement', 'depreciationImmobilisation', 'reclassementImmobilisation', 'reevaluation', 'regularisation',
  'echeanceAbonnement', 'liquidationTva', 'donation', 'affectationResultat', 'executionEngagement',
  'mouvementStock', 'bulletinPaie', 'amortissementDerogatoire', 'ligneOrdreVirement', 'consignation',
  'ecartInventaire', 'clotureLocationAcquisition', 'repriseSubventionImmobilisation', 'reductionSubventionImmobilisation', 'revisionPlanAmortissement', 'coutEmpruntIncorpore',
];
function detenteurs(tenus: Record<string, number> = {}): Faux {
  return {
    ...Object.fromEntries(MODELES_DETENTEURS.map((m) => [m, { count: jest.fn().mockResolvedValue(tenus[m] ?? 0) }])),
    // La facture laisse partir son écriture mais ne la laisse pas se
    // retoucher (audit final F65) · la doublure honore dossier et écriture.
    facture: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { tenantId: string; ecritureId: string } }) =>
        Promise.resolve(tenus.facture && where.tenantId === 't1' && where.ecritureId === 'e1' ? { numeroSerie: 'FV-0007' } : null),
      ),
    },
  };
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
      exercice: { findFirst: jest.fn().mockResolvedValue(exerciceOuvert) },
      compte: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', typeCompte: 'DETAIL' }]) },
      ...detenteurs(),
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

/**
 * AUDIT DU SERVEUR DU 2026-09-27 · F2 et F4. `modifier` recréait ses lignes sans
 * la devise ni la ventilation, ne contrôlait pas le taux de TVA du dossier, et
 * remplaçait les lignes d'une écriture qu'un module tient.
 */
describe('modifier · les mêmes contrôles et les mêmes champs que creer', () => {
  function monde(tenus: Record<string, number> = {}) {
    const update = jest.fn().mockResolvedValue({ id: 'e1' });
    const deleteMany = jest.fn().mockResolvedValue({});
    const tx = { ligneEcriture: { deleteMany }, ecriture: { update } };
    const tauxTva = { findMany: jest.fn().mockImplementation(({ where }: { where: { tenantId: string } }) =>
      Promise.resolve(where.tenantId === 't1' ? [] : [{ id: 'tva-voisin' }])) };
    const prisma = {
      ecriture: { findFirst: jest.fn().mockResolvedValue(ecriture()) },
      exercice: { findFirst: jest.fn().mockResolvedValue(exerciceOuvert) },
      compte: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', typeCompte: 'DETAIL' },
          { id: 'c2', typeCompte: 'DETAIL' },
        ]),
      },
      tauxTva,
      // La devise d'une ligne est vérifiée comme à la création (audit final
      // F49) · la doublure honore le dossier demandé.
      devise: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { tenantId: string } }) =>
          Promise.resolve(where.tenantId === 't1' ? [{ id: 'usd', code: 'USD' }] : []),
        ),
      },
      sectionAnalytique: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', planId: 'p1', code: 'PRJ', type: 'DETAIL', estActive: true, plan: { code: 'PROJETS' } },
        ]),
      },
      ...detenteurs(tenus),
      $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
    } as Faux;
    const exercices = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
    return { svc: service(prisma, exercices), update, deleteMany, tauxTva };
  }

  const LIGNES = [
    {
      compteId: 'c1',
      debit: 655_000,
      deviseId: 'usd',
      montantDevise: 250,
      coursApplique: 2620,
      ventilations: [{ sectionId: 's1', debit: 655_000 }],
    },
    { compteId: 'c2', credit: 655_000 },
  ];

  it('recrée les lignes AVEC la devise, le cours et la ventilation', async () => {
    const { svc, update, deleteMany } = monde();
    await svc.modifier('t1', 'e1', { lignes: LIGNES });
    expect(deleteMany).toHaveBeenCalledWith({ where: { ecritureId: 'e1' } });
    const cree = update.mock.calls[0][0].data.lignes.create;
    expect(['ligne en devise', cree[0]]).toEqual([
      'ligne en devise',
      expect.objectContaining({
        deviseId: 'usd',
        montantDevise: 250,
        coursApplique: 2620,
        ventilations: { create: [{ sectionId: 's1', planId: 'p1', debit: 655_000, credit: 0 }] },
      }),
    ]);
  });

  it("refuse un taux de TVA d'un autre dossier, comme creer", async () => {
    const { svc, update, tauxTva } = monde();
    await expect(
      svc.modifier('t1', 'e1', {
        lignes: [
          { compteId: 'c1', debit: 100, tauxTvaId: 'tva-voisin' },
          { compteId: 'c2', credit: 100 },
        ],
      }),
    ).rejects.toThrow(/taux de TVA sont introuvables/);
    expect(tauxTva.findMany).toHaveBeenCalledWith({ where: { id: { in: ['tva-voisin'] }, tenantId: 't1' } });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuse de modifier l'écriture d'une facture, et dit le chemin (audit final F65)", async () => {
    const { svc, update, deleteMany } = monde({ facture: 1 });
    await expect(svc.modifier('t1', 'e1', { lignes: LIGNES })).rejects.toThrow(
      /enregistre la facture FV-0007 · elle ne se modifie pas d'ici.*Supprimez-la au brouillard/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("une écriture sans facture se modifie", async () => {
    const { svc, update } = monde();
    await svc.modifier('t1', 'e1', { libelle: 'autre' });
    expect(update).toHaveBeenCalled();
  });

  it("refuse de modifier l'écriture qu'un module tient, et nomme le module", async () => {
    const { svc, update, deleteMany } = monde({ liquidationTva: 1 });
    await expect(svc.modifier('t1', 'e1', { libelle: 'x' })).rejects.toThrow(
      /liquidation de TVA · elle ne se modifie pas/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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
  function prismaAvec(createdAt: Date, referentiel = 'SYCEBNL', statutExercice = 'OUVERT') {
    return {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
      // La doublure honore le dossier et l'exercice demandés.
      exercice: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(where.id === 'ex1' && where.tenantId === 't1' ? { statut: statutExercice } : null),
        ),
      },
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

  it('ne réclame pas le brouillard que personne ne peut valider (audit final F77)', async () => {
    // L'écriture de clôture d'un exercice clos et le report à-nouveau
    // provisoire restent au brouillard par construction · les dire « en
    // retard » réclamerait une validation que `valider` refuse.
    const vieille = new Date(Date.now() - 90 * 86_400_000);
    const clos = prismaAvec(vieille, 'SYCEBNL', 'CLOTURE');
    const ecr = (clos as { ecriture: { findMany: jest.Mock } }).ecriture.findMany;
    const [modele] = await ecr();
    ecr.mockResolvedValue([{ ...modele, estGenereeParCloture: true, estANouveauProvisoire: false }]);
    const r = await service(clos).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.lignes[0]).toMatchObject({ invalidable: true, retardCentralisation: false });
    expect(r.totaux.enRetard).toBe(0);

    const ouvert = prismaAvec(vieille);
    const ecr2 = (ouvert as { ecriture: { findMany: jest.Mock } }).ecriture.findMany;
    ecr2.mockResolvedValue([{ ...modele, estGenereeParCloture: true, estANouveauProvisoire: true }]);
    const r2 = await service(ouvert).brouillard('t1', { exerciceId: 'ex1' });
    expect(r2.lignes[0]).toMatchObject({ invalidable: true, retardCentralisation: false });

    // La clôture d'un exercice encore OUVERT se valide · elle reste réclamée.
    const ecr3 = (ouvert as { ecriture: { findMany: jest.Mock } }).ecriture.findMany;
    ecr3.mockResolvedValue([{ ...modele, estGenereeParCloture: true, estANouveauProvisoire: false }]);
    const r3 = await service(ouvert).brouillard('t1', { exerciceId: 'ex1' });
    expect(r3.lignes[0]).toMatchObject({ invalidable: false, retardCentralisation: true });
  });

  it('rend tout ce que la modification doit renvoyer · devise, cours et ventilation', async () => {
    // Le PATCH remplace les lignes en bloc : un champ que la lecture ne rend
    // pas, l'écran ne peut pas le renvoyer, et la correction d'un libellé
    // l'effacerait.
    const prisma = prismaAvec(new Date());
    ((prisma as { ecriture: { findMany: jest.Mock } }).ecriture.findMany).mockResolvedValue([
      {
        id: 'e1',
        date: new Date('2026-05-10'),
        createdAt: new Date(),
        numeroPiece: 4,
        libelle: 'Achat',
        reference: null,
        journal: { code: 'ACH', intitule: 'Achats' },
        lignes: [
          {
            compteId: 'c1',
            debit: 1000,
            credit: 0,
            libelle: null,
            deviseId: 'usd',
            montantDevise: 400,
            coursApplique: 2.5,
            ventilations: [{ sectionId: 's1', debit: 1000, credit: 0 }],
            compte: { numero: '60410000', intitule: 'Achats' },
          },
        ],
      },
    ]);
    const r = await service(prisma).brouillard('t1', { exerciceId: 'ex1' });
    const l = r.lignes[0].lignes[0];
    expect([l.compteId, l.deviseId, l.montantDevise, l.coursApplique]).toEqual(['c1', 'usd', 400, 2.5]);
    expect(l.ventilations).toEqual([{ sectionId: 's1', debit: 1000, credit: 0 }]);
    // Deux lectures (audit final F185) · les totaux par lots, puis la tranche
    // affichée, qui seule porte les lignes détaillées.
    const appels = ((prisma as { ecriture: { findMany: jest.Mock } }).ecriture.findMany).mock.calls.map((c) => c[0]);
    const requete = appels.find((a) => a.include);
    expect(requete.include.lignes.include.ventilations).toBeTruthy();
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
      exercice: { findFirst: jest.fn().mockResolvedValue({ statut: 'OUVERT' }) },
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

describe('état du brouillard · une tranche qui se dit, des totaux entiers (audit final F185)', () => {
  it('au-delà du plafond, la liste s’arrête, les totaux portent tout le brouillard, et tronque le dit', async () => {
    const n = PLAFOND_ECRITURES_PAR_FENETRE + 3;
    const ecritures = Array.from({ length: n }, (_, i) => ({
      id: `e-${String(i).padStart(6, '0')}`,
      date: new Date('2026-05-10'),
      createdAt: new Date(),
      numeroPiece: i + 1,
      libelle: 'Achat',
      reference: 'F',
      estGenereeParCloture: false,
      estANouveauProvisoire: false,
      journal: { code: 'ACH', intitule: 'Achats' },
      lignes: [
        { debit: 10, credit: 0, libelle: null, compte: { numero: '60410000', intitule: 'Achats' } },
        // La dernière écriture est déséquilibrée · elle est HORS de la tranche.
        { debit: 0, credit: i === n - 1 ? 7 : 10, libelle: null, compte: { numero: '40110000', intitule: 'F' } },
      ],
    }));
    // Une doublure qui se comporte comme Prisma · ordre, take, curseur, skip.
    const findMany = jest.fn(async (args: { take?: number; cursor?: { id: string }; skip?: number }) => {
      let debut = 0;
      if (args.cursor) debut = ecritures.findIndex((e) => e.id === args.cursor!.id) + (args.skip ?? 0);
      return ecritures.slice(debut, args.take === undefined ? undefined : debut + args.take);
    });
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ statut: 'OUVERT' }) },
      ecriture: { findMany },
    };
    const r = await service(prisma).brouillard('t1', { exerciceId: 'ex1' });
    expect(r.lignes).toHaveLength(PLAFOND_ECRITURES_PAR_FENETRE);
    expect(r.tronque).toBe(true);
    expect(r.totaux.nombre).toBe(n);
    expect(r.totaux.debit).toBe(10 * n);
    expect(r.totaux.desequilibrees).toBe(1);
  });
});
