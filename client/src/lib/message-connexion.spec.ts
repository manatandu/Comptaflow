import { messageConnexion } from './message-connexion';

describe('le message d’une connexion qui échoue', () => {
  it('rend la cause, y compris celle d’une Error ordinaire', () => {
    expect(messageConnexion(new Error('Session ouverte mais aussitôt perdue · cookies tiers'))).toContain('cookies tiers');
    expect(messageConnexion(new TypeError('Load failed'))).toContain('ne répond pas');
    expect(messageConnexion('bizarre')).toBe('Une erreur est survenue');
  });
});
