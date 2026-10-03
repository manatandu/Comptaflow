import { ForbiddenException } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE REPORT À-NOUVEAU NE SE RETOUCHE PAS DEPUIS LE JOURNAL.
 *
 * Audit du serveur du 2026-09-27, B3 · né au brouillard dans l'exercice
 * suivant, il passait toutes les gardes de `modifier` et de `supprimer`. Le
 * bilan d'ouverture pouvait disparaître d'un DELETE, sur une balance qui
 * boucle, et l'exercice clos ne se rouvre pas pour le refaire.
 */

const OUVERT = { statut: 'OUVERT', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };

function monter(ecriture: { exerciceId: string; estGenereeParCloture: boolean }, premierId: string) {
  const prisma = {
    ecriture: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'e1', tenantId: 't1', statut: 'BROUILLARD', lignes: [], journal: {}, exercice: OUVERT, ...ecriture,
      }),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: premierId }) },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
  } as Record<string, unknown>;
  // Toute autre table ne rend qu'un comptage nul · aucun module ne tient
  // l'écriture, seul le report est en cause.
  const avecComptages = new Proxy(prisma, {
    get: (cible, cle: string) => cible[cle] ?? { count: jest.fn().mockResolvedValue(0) },
  });
  prisma.$transaction = jest.fn().mockImplementation((f: (tx: unknown) => unknown) => f(prisma));
  const service = new EcritureService(avecComptages as unknown as PrismaService, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe('report à-nouveau et journal', () => {
  it('supprimer refuse le report d’un exercice qui n’est pas le premier, en le nommant', async () => {
    const { service, prisma } = monter({ exerciceId: 'ex2027', estGenereeParCloture: true }, 'ex2026');
    await expect(service.supprimer('t1', 'e1')).rejects.toThrow(ForbiddenException);
    await expect(service.supprimer('t1', 'e1')).rejects.toThrow(/report à-nouveau/);
    expect((prisma.ecriture as { deleteMany: jest.Mock }).deleteMany).not.toHaveBeenCalled();
  });

  it('modifier le refuse de même', async () => {
    const { service } = monter({ exerciceId: 'ex2027', estGenereeParCloture: true }, 'ex2026');
    await expect(service.modifier('t1', 'e1', { lignes: [] } as never)).rejects.toThrow(/report à-nouveau/);
  });

  it('le bilan d’ouverture du PREMIER exercice reste retouchable', async () => {
    // Il porte la reprise du dossier, saisie à la main, pas un report calculé.
    const { service } = monter({ exerciceId: 'ex2026', estGenereeParCloture: true }, 'ex2026');
    await expect(service.supprimer('t1', 'e1')).resolves.toEqual({ supprime: true });
  });
});
