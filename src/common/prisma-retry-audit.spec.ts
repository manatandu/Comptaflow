import { Prisma } from '@prisma/client';
import { avecRetrySerialisable, estConflitDeSerialisation } from './prisma-retry.util';
import { transactionAuditee } from './audit/contexte-audit';
import { ErreurMaillonDansTransaction } from './audit/extension-audit';

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

  it('un conflit de sérialisation du MAILLON (40001 en requête brute, enveloppé) est rejoué, pas rendu en 500', async () => {
    let n = 0;
    const prisma = {
      $transaction: jest.fn(async (f: (t: unknown) => unknown) => {
        n += 1;
        if (n === 1) {
          const brut = new Prisma.PrismaClientKnownRequestError('could not serialize access', {
            code: 'P2010',
            clientVersion: 'x',
            meta: { code: '40001' },
          });
          // La VRAIE erreur de l'extension d'audit · sa cause doit rester lisible.
          throw new ErreurMaillonDansTransaction('Ecriture', 'create', brut);
        }
        return f({});
      }),
    };
    await expect(avecRetrySerialisable(prisma as never, async () => 'ok', 'conflit')).resolves.toBe('ok');
    expect(n).toBe(2);
  });

  it('une autre erreur brute n’est pas prise pour un conflit', () => {
    const autre = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2010', clientVersion: 'x', meta: { code: '23505' } });
    expect(estConflitDeSerialisation(Object.assign(new Error('e'), { cause: autre }))).toBe(false);
  });
});
