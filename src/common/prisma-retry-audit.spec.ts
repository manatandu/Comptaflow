import { Prisma } from '@prisma/client';
import { avecRetrySerialisable } from './prisma-retry.util';
import { transactionAuditee } from './audit/contexte-audit';

/**
 * UN MAILLON D'AUDIT NAÎT ET MEURT AVEC L'ACTE.
 *
 * Audit du serveur du 2026-09-27, F11 · hors de `journaliserDansTransaction`,
 * le maillon s'écrit par une connexion à part et survit à une transaction
 * annulée. `avecRetrySerialisable` porte la plupart des actes audités
 * (création d'écriture, lettrage…) : c'est elle qui doit déclarer sa
 * transaction.
 */
describe('transaction sérialisable et journal d’audit', () => {
  it('le corps de l’acte voit SA transaction comme celle du journal', async () => {
    const tx = { marque: 'tx-1' };
    const prisma = { $transaction: jest.fn(async (f: (t: unknown) => unknown) => f(tx)) };
    let vue: unknown;
    await avecRetrySerialisable(prisma as never, async () => {
      vue = transactionAuditee();
      return null;
    }, 'conflit');
    expect(vue).toBe(tx);
  });

  it('chaque reprise après conflit voit sa propre transaction, pas la précédente', async () => {
    const vues: unknown[] = [];
    let n = 0;
    const prisma = {
      $transaction: jest.fn(async (f: (t: unknown) => unknown) => {
        n += 1;
        const tx = { tentative: n };
        const r = await f(tx);
        if (n === 1) throw new Prisma.PrismaClientKnownRequestError('conflit', { code: 'P2034', clientVersion: 'x' });
        return r;
      }),
    };
    await avecRetrySerialisable(prisma as never, async () => {
      vues.push(transactionAuditee());
      return null;
    }, 'conflit');
    expect(vues).toEqual([{ tentative: 1 }, { tentative: 2 }]);
  });

  it('hors de la transaction, rien n’est déclaré', async () => {
    const prisma = { $transaction: jest.fn(async (f: (t: unknown) => unknown) => f({})) };
    await avecRetrySerialisable(prisma as never, async () => null, 'conflit');
    expect(transactionAuditee()).toBeUndefined();
  });
});
