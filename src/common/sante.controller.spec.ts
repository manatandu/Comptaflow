import { ServiceUnavailableException } from '@nestjs/common';
import { SanteController } from './sante.controller';

/**
 * /health · vivant quand la base répond, 503 quand elle ne répond plus ·
 * un serveur qui répond mais ne joint plus la base est en panne et doit
 * le dire, sinon la surveillance externe croit que tout va bien.
 */
describe('SanteController', () => {
  it('base joignable : ok', async () => {
    const c = new SanteController({ $queryRaw: async () => [{ '?column?': 1 }] } as never);
    await expect(c.sante()).resolves.toEqual({ statut: 'ok' });
  });

  it('base injoignable : 503, jamais un faux « ok »', async () => {
    const c = new SanteController({
      $queryRaw: async () => {
        throw new Error('connexion perdue');
      },
    } as never);
    await expect(c.sante()).rejects.toThrow(ServiceUnavailableException);
  });
});
