import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LIEUX DES BIENS · Sage Immobilisations les tient en référentiel séparé.
 * Définition d'OmegaX : code et intitulé, portés sur la fiche, sans effet
 * comptable. Deux refus : un lieu qui porte des biens ne se supprime pas, et un
 * lieu d'un autre dossier n'existe pas.
 */
function harnais(o: { lieu?: Record<string, unknown> | null; conflit?: boolean } = {}) {
  const prisma = {
    lieuBien: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(o.lieu === undefined ? { id: 'L1', code: 'SIEGE', _count: { immobilisations: 0 } } : o.lieu),
      create: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        if (o.conflit) throw { code: 'P2002' };
        return data;
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'i1' }),
      update: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => data),
    },
  };
  const svc = new ImmobilisationService(prisma as unknown as PrismaService, {} as EcritureService);
  return { svc, prisma };
}

describe('les lieux des biens', () => {
  it('crée un lieu, code en capitales et sans espaces', async () => {
    const { svc, prisma } = harnais();
    await svc.creerLieu('t1', { code: ' siege ', intitule: ' Siège Kinshasa ' });
    expect(prisma.lieuBien.create).toHaveBeenCalledWith({ data: { tenantId: 't1', code: 'SIEGE', intitule: 'Siège Kinshasa' } });
  });

  it('refuse un code déjà pris, avec un message et non une erreur de base', async () => {
    const { svc } = harnais({ conflit: true });
    await expect(svc.creerLieu('t1', { code: 'SIEGE', intitule: 'x' })).rejects.toThrow(/existe déjà/);
  });

  it('refuse de supprimer un lieu qui porte des biens, et dit combien', async () => {
    const { svc, prisma } = harnais({ lieu: { id: 'L1', code: 'DEPOT', _count: { immobilisations: 3 } } });
    await expect(svc.supprimerLieu('t1', 'L1')).rejects.toThrow(/DEPOT porte 3 bien/);
    expect(prisma.lieuBien.delete).not.toHaveBeenCalled();
  });

  it('supprime un lieu vide', async () => {
    const { svc, prisma } = harnais();
    await svc.supprimerLieu('t1', 'L1');
    expect(prisma.lieuBien.delete).toHaveBeenCalledWith({ where: { id: 'L1' } });
  });

  it('déplace un bien, ou le retire de tout lieu', async () => {
    const { svc, prisma } = harnais();
    await svc.affecterLieu('t1', 'i1', 'L1');
    expect(prisma.immobilisation.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { lieuId: 'L1' } }));
    await svc.affecterLieu('t1', 'i1', null);
    expect(prisma.immobilisation.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { lieuId: null } }));
  });

  it('un lieu d’un autre dossier n’existe pas · le lieu est cherché dans CE dossier', async () => {
    const { svc, prisma } = harnais({ lieu: null });
    await expect(svc.affecterLieu('t1', 'i1', 'L-autre')).rejects.toThrow(/Lieu introuvable pour ce dossier/);
    expect(prisma.lieuBien.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'L-autre', tenantId: 't1' } }));
    expect(prisma.immobilisation.update).not.toHaveBeenCalled();
  });
});
