import { BadRequestException } from '@nestjs/common';
import { MagasinService } from './magasin.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * UN MOUVEMENT DE MAGASIN NE SE LIE QU'À UNE ÉCRITURE DU MÊME DOSSIER.
 * Audit du serveur du 2026-09-27, F5.
 */

function monter(ecritureDuDossier: boolean) {
  const create = jest.fn().mockResolvedValue({ id: 'm1' });
  const findFirstEcriture = jest.fn().mockResolvedValue(ecritureDuDossier ? { id: 'e1' } : null);
  const prisma = {
    articleStock: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', actif: true, code: 'ART1' }) },
    ecriture: { findFirst: findFirstEcriture },
    mouvementStock: { aggregate: jest.fn().mockResolvedValue({ _max: { ordre: 3 } }), create },
  };
  const service = new MagasinService(prisma as unknown as PrismaService, {} as never);
  return { service, create, findFirstEcriture };
}

const DTO = { date: '2026-03-01', sens: 'ENTREE', quantite: 5, cout: 100, piece: 'BL-1', ecritureId: 'e1' };

describe('mouvement de magasin et écriture liée', () => {
  it('refuse une écriture absente du dossier, sans rien créer', async () => {
    const m = monter(false);
    await expect(m.service.enregistrerMouvement('t1', 'u', 'a1', DTO as never)).rejects.toThrow(BadRequestException);
    expect(m.create).not.toHaveBeenCalled();
    // La recherche porte la borne du dossier.
    expect(m.findFirstEcriture).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1', tenantId: 't1' } }));
  });

  it('accepte l’écriture du dossier', async () => {
    const m = monter(true);
    await m.service.enregistrerMouvement('t1', 'u', 'a1', DTO as never);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ecritureId: 'e1' }) }));
  });
});
