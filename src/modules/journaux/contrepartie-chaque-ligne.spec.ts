import { BadRequestException } from '@nestjs/common';
import { JournalService } from './journal.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * « Générer une contrepartie à chaque ligne » (Sage i7) · option des journaux
 * de TRÉSORERIE. Cochée sur un journal d'achats, elle solderait chaque charge
 * contre une banque que le journal ne porte pas.
 */
function monter(type: string) {
  const update = jest.fn(async (a: unknown) => a);
  const prisma = {
    journal: {
      findFirst: jest.fn(async () => ({ id: 'j', code: 'X', type, compteTresorerieId: type === 'TRESORERIE' ? 'c' : null })),
      update,
    },
  } as unknown as PrismaService;
  return { service: new JournalService(prisma), update };
}

describe('contrepartie à chaque ligne', () => {
  it('se coche sur un journal de trésorerie', async () => {
    const { service, update } = monter('TRESORERIE');
    await service.modifier('t', 'j', { contrepartieChaqueLigne: true });
    expect(update).toHaveBeenCalledWith({ where: { id: 'j' }, data: { contrepartieChaqueLigne: true } });
  });

  it('est refusée sur un journal d’achats', async () => {
    const { service, update } = monter('ACHATS');
    await expect(service.modifier('t', 'j', { contrepartieChaqueLigne: true })).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});
