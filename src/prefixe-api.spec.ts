import { retirerPrefixeApi } from './bootstrap';
import { extraireJetonDuCookie } from './modules/auth/jwt.strategy';

describe('l’API sous l’adresse du site', () => {
  it('retire le préfixe /api, et lui seul', () => {
    expect(retirerPrefixeApi('/api/auth/login')).toBe('/auth/login');
    expect(retirerPrefixeApi('/api/ecritures?page=2')).toBe('/ecritures?page=2');
    expect(retirerPrefixeApi('/api')).toBe('/');
    expect(retirerPrefixeApi('/auth/login')).toBe('/auth/login');
    expect(retirerPrefixeApi('/apiculture')).toBe('/apiculture');
    expect(retirerPrefixeApi('/health')).toBe('/health');
  });

  it('le cookie __session est lu, et l’ancien nom le temps de la transition', () => {
    expect(extraireJetonDuCookie({ cookies: { __session: 'neuf' } } as never)).toBe('neuf');
    expect(extraireJetonDuCookie({ cookies: { omegax_session: 'ancien' } } as never)).toBe('ancien');
    expect(extraireJetonDuCookie({ cookies: { __session: 'neuf', omegax_session: 'ancien' } } as never)).toBe('neuf');
  });
});
