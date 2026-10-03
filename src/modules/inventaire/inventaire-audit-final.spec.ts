import { ForbiddenException } from '@nestjs/common';
import { RoleMembreInventaire, StatutCampagneInventaire } from '@prisma/client';
import { InventaireService } from './inventaire.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F134 ET F135 · le recensement s'ouvre au premier comptage, et
 * une fiche se retire tant que rien n'est figé.
 */

const MEMBRES = [{ role: RoleMembreInventaire.INVENTORIANT }, { role: RoleMembreInventaire.TEMOIN }];
const SOUS_COMMISSIONS = [
  { id: 'sc1', tenantId: 't1', campagneId: 'camp1', membres: MEMBRES },
  { id: 'scAutreCampagne', tenantId: 't1', campagneId: 'camp9', membres: MEMBRES },
  { id: 'scVoisin', tenantId: 't2', campagneId: 'camp1', membres: MEMBRES },
];

function monter(statut: StatutCampagneInventaire) {
  const campagne = { id: 'camp1', tenantId: 't1', exerciceId: 'ex1', statut };
  const fiches = [{ id: 'f1', tenantId: 't1', campagneId: 'camp1', compteId: 'c1', valeurInventaire: null }];
  // Les doublures HONORENT leur filtre · dossier, identifiant et statut.
  const prisma = {
    campagneInventaire: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === campagne.id && where.tenantId === campagne.tenantId ? { ...campagne } : null,
      ),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; tenantId: string; statut: StatutCampagneInventaire }; data: { statut: StatutCampagneInventaire } }) => {
        if (where.id !== campagne.id || where.tenantId !== campagne.tenantId || where.statut !== campagne.statut) return { count: 0 };
        campagne.statut = data.statut;
        return { count: 1 };
      }),
    },
    ficheInventaire: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const f = fiches.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        return f ? { ...f, campagne: { ...campagne } } : null;
      }),
      update: jest.fn(async ({ data }: { data: object }) => ({ ...fiches[0], ...data })),
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 'f2', ...data })),
      deleteMany: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const i = fiches.findIndex((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (i < 0) return { count: 0 };
        fiches.splice(i, 1);
        return { count: 1 };
      }),
    },
    compte: { findFirst: jest.fn(async () => ({ id: 'c57', numero: '57100000', intitule: 'Caisse siège' })) },
    // Le solde du PV de caisse est LU au livre-journal (ligne A10) · exercice
    // clos au 31 décembre 2025, comptage à cette date, rien au brouillard.
    exercice: {
      findFirst: jest.fn(async () => ({ id: 'ex1', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') })),
      findMany: jest.fn(async () => []),
    },
    ligneEcriture: {
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { debit: 100, credit: 0 }, _count: { _all: 1 } })),
    },
    sousCommissionInventaire: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string; campagneId: string } }) =>
        SOUS_COMMISSIONS.find((sc) => sc.id === where.id && sc.tenantId === where.tenantId && sc.campagneId === where.campagneId) ?? null,
      ),
    },
    procesVerbalComptageCaisse: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 'pv1', ...data })),
    },
  };
  return { svc: new InventaireService(prisma as unknown as PrismaService, {} as EcritureService), campagne, fiches };
}

describe('F134 · le premier comptage ouvre le recensement', () => {
  it('une quantité ou une valeur saisie fait passer la campagne de la préparation au recensement', async () => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await m.svc.saisirComptage('t1', 'f1', { quantiteComptee: 12 } as never);
    expect(m.campagne.statut).toBe(StatutCampagneInventaire.RECENSEMENT);
  });

  it('une pièce ou un emplacement corrigés ne sont pas un comptage', async () => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await m.svc.saisirComptage('t1', 'f1', { referencePiece: 'BE-4', emplacement: 'Dépôt B' } as never);
    expect(m.campagne.statut).toBe(StatutCampagneInventaire.PREPARATION);
  });

  it('le PV d’une caisse s’établit dès la préparation, et ouvre le recensement', async () => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', {
      compteId: 'c57',
      sousCommissionId: 'sc1',
      dateComptage: '2025-12-31',
      especesComptees: 100,
    } as never);
    expect(m.campagne.statut).toBe(StatutCampagneInventaire.RECENSEMENT);
  });

  it('une campagne déjà en arbitrage ne revient pas au recensement', async () => {
    const m = monter(StatutCampagneInventaire.ARBITRAGE);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', {
      compteId: 'c57', sousCommissionId: 'sc1', dateComptage: '2025-12-31', especesComptees: 100,
    } as never);
    expect(m.campagne.statut).toBe(StatutCampagneInventaire.ARBITRAGE);
  });
});

describe('F135 · une fiche se retire tant que rien n’est figé', () => {
  it.each([StatutCampagneInventaire.PREPARATION, StatutCampagneInventaire.RECENSEMENT])('en %s, la fiche part', async (statut) => {
    const m = monter(statut);
    await expect(m.svc.supprimerFiche('t1', 'f1')).resolves.toEqual({ supprimee: true });
    expect(m.fiches).toEqual([]);
  });

  it.each([StatutCampagneInventaire.ARBITRAGE, StatutCampagneInventaire.CLOTUREE])('en %s, elle reste', async (statut) => {
    const m = monter(statut);
    await expect(m.svc.supprimerFiche('t1', 'f1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.fiches).toHaveLength(1);
  });

  it('la fiche d’un autre dossier n’existe pas', async () => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await expect(m.svc.supprimerFiche('t2', 'f1')).rejects.toThrow(/introuvable/);
    expect(m.fiches).toHaveLength(1);
  });
});

describe('F136 · la sous-commission d’une fiche est celle de sa campagne', () => {
  it.each(['scAutreCampagne', 'scVoisin'])('refuse %s à la création comme au comptage', async (sousCommissionId) => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await expect(
      m.svc.creerFiche('t1', 'camp1', { compteId: 'c57', designation: 'Caisse', sousCommissionId } as never),
    ).rejects.toThrow(/n'appartient pas à la campagne/);
    await expect(m.svc.saisirComptage('t1', 'f1', { sousCommissionId } as never)).rejects.toThrow(/n'appartient pas à la campagne/);
  });

  it('accepte celle de la campagne', async () => {
    const m = monter(StatutCampagneInventaire.PREPARATION);
    await expect(
      m.svc.creerFiche('t1', 'camp1', { compteId: 'c57', designation: 'Caisse', sousCommissionId: 'sc1' } as never),
    ).resolves.toMatchObject({ sousCommissionId: 'sc1' });
    await expect(m.svc.saisirComptage('t1', 'f1', { sousCommissionId: 'sc1' } as never)).resolves.toBeDefined();
  });
});
