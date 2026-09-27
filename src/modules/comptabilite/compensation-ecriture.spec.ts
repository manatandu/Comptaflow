import { readFileSync } from 'fs';
import { join } from 'path';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * COMPENSATION · lignes puis tête, et l'échec remonte.
 *
 * Audit du serveur du 2026-09-27, F1 · la liquidation de TVA et la
 * facturation supprimaient la tête seule, contre des lignes en ON DELETE
 * RESTRICT, et la TVA avalait l'erreur. La doublure reproduit la contrainte :
 * la tête ne part pas tant que ses lignes existent.
 */

function monter(options: { echecLignes?: boolean } = {}) {
  const ordre: string[] = [];
  let lignesPresentes = true;
  const prisma: Record<string, unknown> = {
    ecriture: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e1' }),
      delete: jest.fn().mockImplementation(async () => {
        if (lignesPresentes) throw new Error('P2003 · lignes_ecriture RESTRICT');
        ordre.push('tete');
      }),
    },
    ligneEcriture: {
      deleteMany: jest.fn().mockImplementation(async () => {
        if (options.echecLignes) throw new Error('base indisponible');
        lignesPresentes = false;
        ordre.push('lignes');
      }),
    },
  };
  prisma.$transaction = jest.fn().mockImplementation((f: (tx: unknown) => unknown) => f(prisma));
  const service = new EcritureService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never);
  return { service, ordre };
}

describe('compensation d’une écriture', () => {
  it('retire les lignes PUIS la tête', async () => {
    const m = monter();
    await m.service.retirerCompensation('t1', 'e1');
    expect(m.ordre).toEqual(['lignes', 'tete']);
  });

  it('un échec remonte, il ne se tait jamais', async () => {
    const m = monter({ echecLignes: true });
    await expect(m.service.retirerCompensation('t1', 'e1')).rejects.toThrow('base indisponible');
  });

  it('la liquidation de TVA et la facturation compensent par elle, sans avaler', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    const tva = lire('tva/taux-tva.service.ts');
    const catchTva = tva.slice(tva.indexOf('} catch (e) {', tva.indexOf('this.prisma.liquidationTva.create')));
    expect(catchTva.slice(0, catchTva.indexOf('throw e;'))).toContain('this.ecritureService.retirerCompensation(tenantId, ecriture.id)');
    expect(catchTva.slice(0, catchTva.indexOf('throw e;'))).not.toContain('.catch(');
    const fac = lire('facturation/comptabilisation-facture.service.ts');
    const bloc = fac.slice(fac.indexOf('if (count === 0) {'), fac.indexOf('}', fac.indexOf('if (count === 0) {')));
    expect(bloc).toContain('this.ecritures.retirerCompensation(tenantId, e.id)');
  });
});
