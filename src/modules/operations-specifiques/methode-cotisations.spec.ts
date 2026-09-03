import {
  JeuEtatsFinanciersSycebnl,
  MethodeCotisations,
  Referentiel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { OperationSpecifiqueService } from './operation-specifique.service';
import { TenantService } from '../tenant/tenant.service';
import { ControlesService } from '../controles/controles.service';

/**
 * FAIT GÉNÉRATEUR DES COTISATIONS ET DU DROIT D'ENTRÉE.
 *
 * Cadre conceptuel SYCEBNL § 5.4.2.1 : « Le fait générateur de la
 * comptabilisation des cotisations et du droit d'entrée est l'appel de
 * cotisation ou de paiement du droit d'entrée. Toutefois, si l'entité ne peut
 * justifier d'un droit d'agir en recouvrement, les cotisations et le droit
 * d'entrée sont comptabilisés lors de leur encaissement effectif. »
 * « L'entité doit préciser dans les notes annexes, la méthode retenue. »
 *
 * Trois conséquences, une par service, et c'est ce que ce fichier vérifie :
 * le dossier ENREGISTRE le choix, les ÉCRITURES d'appel s'y plient, et le
 * contrôle rappelle la MENTION obligatoire quand rien n'a été tranché.
 */

// ---------------------------------------------------------------------------
// 1. Le dossier enregistre le choix
// ---------------------------------------------------------------------------
function tenantService(tenant: Record<string, unknown>) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockResolvedValue({ ...tenant }),
    },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  return { service: new TenantService(prisma), prisma: prisma as any };
}

const DOSSIER_ASSOCIATION = {
  id: 't1',
  nom: 'ASBL',
  referentiel: Referentiel.SYCEBNL,
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
  methodeCotisations: null,
};

describe('paramètre du dossier · méthode de comptabilisation des cotisations', () => {
  it('enregistre le choix du cabinet et le rend dans les paramètres', async () => {
    const { service, prisma } = tenantService(DOSSIER_ASSOCIATION);
    prisma.tenant.findUnique
      .mockResolvedValueOnce(DOSSIER_ASSOCIATION)
      .mockResolvedValue({ ...DOSSIER_ASSOCIATION, methodeCotisations: MethodeCotisations.ENCAISSEMENT });
    const p = await service.modifierMethodeCotisations('t1', MethodeCotisations.ENCAISSEMENT);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { methodeCotisations: MethodeCotisations.ENCAISSEMENT },
    });
    expect(p.methodeCotisations).toBe(MethodeCotisations.ENCAISSEMENT);
  });

  it('REFUSE un dossier SYSCOHADA · une entreprise n’a pas d’adhérents', async () => {
    const { service } = tenantService({ ...DOSSIER_ASSOCIATION, referentiel: Referentiel.SYSCOHADA });
    await expect(service.modifierMethodeCotisations('t1', MethodeCotisations.APPEL)).rejects.toThrow(/SYCEBNL/);
  });

  it('REFUSE un projet de développement · il est financé par un bailleur, pas par des cotisations', async () => {
    const { service } = tenantService({
      ...DOSSIER_ASSOCIATION,
      jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT,
    });
    await expect(service.modifierMethodeCotisations('t1', MethodeCotisations.APPEL)).rejects.toThrow(/bailleur/);
  });
});

// ---------------------------------------------------------------------------
// 2. Les écritures d'appel s'y plient
// ---------------------------------------------------------------------------
function operationService(methodeCotisations: MethodeCotisations | null) {
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
        methodeCotisations,
      }),
    },
    compte: {
      findMany: jest.fn().mockResolvedValue(
        ['411', '1851', '701', '103', '659', '4912'].map((numero) => ({
          id: `c-${numero}`,
          numero: `${numero}00000`.slice(0, 8),
          intitule: `Compte ${numero}`,
          typeCompte: 'DETAIL',
          estActif: true,
        })),
      ),
    },
  } as unknown as PrismaService;
  return new OperationSpecifiqueService(prisma, {} as unknown as EcritureService);
}

describe('opérations spécifiques · l’appel suppose un droit d’agir', () => {
  it('REFUSE l’appel de cotisation à un dossier qui constate à l’encaissement', async () => {
    const s = operationService(MethodeCotisations.ENCAISSEMENT);
    await expect(
      s.proposer('t1', { codeModele: 'B6-APPEL-COTISATION', parametres: { cotisation: 1000 } }),
    ).rejects.toThrow(/ENCAISSEMENT/);
    // Et le motif est dit : ce n'est pas une préférence de présentation, c'est
    // une créance qu'on ne pourrait pas poursuivre.
    await expect(
      s.proposer('t1', { codeModele: 'B6-APPEL-DROIT-ENTREE', parametres: { appelGlobal: 1000, tauxDepot: 0.15, tauxCotisation: 0.1 } }),
    ).rejects.toThrow(/411 Adhérents/);
  });

  it('ACCEPTE l’appel quand le dossier justifie d’un droit d’agir', async () => {
    const s = operationService(MethodeCotisations.APPEL);
    const e = await s.proposer('t1', { codeModele: 'B6-APPEL-COTISATION', parametres: { cotisation: 1000 } });
    expect(e.lignes).toHaveLength(2);
  });

  it('N’EXIGE PAS que le choix soit fait · le § 5.4.2.1 pose l’appel comme la règle', async () => {
    // Bloquer un dossier qui n'a pas encore tranché renverserait le texte :
    // l'encaissement y est l'EXCEPTION. C'est au contrôle de rappeler le
    // choix, pas à la saisie de l'imposer.
    const s = operationService(null);
    const e = await s.proposer('t1', { codeModele: 'B6-APPEL-COTISATION', parametres: { cotisation: 1000 } });
    expect(e.lignes).toHaveLength(2);
  });

  it('laisse passer les modèles qui ne débitent pas le 411', async () => {
    const s = operationService(MethodeCotisations.ENCAISSEMENT);
    // La dépréciation d'une cotisation douteuse ne constate aucune créance
    // nouvelle · rien dans le § 5.4.2.1 ne la conditionne.
    const e = await s.proposer('t1', {
      codeModele: 'B6-DEPRECIATION-COTISATION',
      parametres: { creanceDouteuse: 1000, tauxDepreciation: 0.5 },
    });
    expect(e.lignes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Le contrôle rappelle la mention obligatoire
// ---------------------------------------------------------------------------
let idLigne = 0;
const ligne = (numero: string, debit: number, credit = 0) => {
  idLigne += 1;
  return { id: `l${idLigne}`, debit, credit, lettre: null, compte: { numero, intitule: `Compte ${numero}` } };
};
const ecriture = (libelle: string, lignes: ReturnType<typeof ligne>[]) => ({
  id: `e-${libelle}`,
  date: new Date('2026-05-10'),
  libelle,
  reference: 'PJ-1',
  numeroPiece: 1,
  createdAt: new Date('2026-05-10'),
  statut: 'VALIDEE',
  journal: { code: 'OD' },
  lignes,
});

function controles(ecritures: ReturnType<typeof ecriture>[], methodeCotisations: MethodeCotisations | null) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        referentiel: Referentiel.SYCEBNL,
        jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
        methodeCotisations,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const APPEL_DE_COTISATION = ecriture('Appel de cotisation', [ligne('41110000', 1000), ligne('70110000', 0, 1000)]);

describe('contrôle · méthode de comptabilisation des cotisations non précisée', () => {
  const anomalie = async (svc: ControlesService) =>
    (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === 'METHODE_COTISATIONS_NON_PRECISEE');

  it('SIGNALE un dossier qui appelle des cotisations sans avoir tranché', async () => {
    const a = await anomalie(controles([APPEL_DE_COTISATION], null));
    expect(a?.gravite).toBe('AVERTISSEMENT');
    // La conséquence cite le paragraphe, pas une opinion.
    expect(a?.consequence).toContain('5.4.2.1');
    expect(a?.occurrences).toHaveLength(1);
  });

  it('SE TAIT dès que le choix est fait', async () => {
    expect(await anomalie(controles([APPEL_DE_COTISATION], MethodeCotisations.APPEL))).toBeUndefined();
    expect(await anomalie(controles([APPEL_DE_COTISATION], MethodeCotisations.ENCAISSEMENT))).toBeUndefined();
  });

  it('SE TAIT sur un dossier sans cotisation · rien à préciser, donc rien à crier', async () => {
    const sansCotisation = ecriture('Achat de fournitures', [ligne('60410000', 500), ligne('40110000', 0, 500)]);
    expect(await anomalie(controles([sansCotisation], null))).toBeUndefined();
  });
});
