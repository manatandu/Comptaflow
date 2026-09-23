import { entetesRequete } from './entetes-requete';

/**
 * UNE LECTURE N'EST PLUS PRÉCÉDÉE D'UNE REQUÊTE OPTIONS.
 *
 * Le site et l'API sont deux origines. `Content-Type: application/json` et
 * `X-CSRF-Token` rendent une requête « non simple » : le navigateur envoie
 * d'abord un OPTIONS et attend sa réponse. Sur un GET, ces deux en-têtes ne
 * servaient à rien (pas de corps, et le serveur ne contrôle le CSRF que sur
 * les méthodes qui modifient), mais ils coûtaient un aller-retour
 * transatlantique à chaque ouverture de fenêtre.
 */
describe('entetesRequete', () => {
  it('un GET ne porte ni Content-Type ni jeton CSRF · requête simple, sans contrôle préalable', () => {
    const h = entetesRequete('GET', 'jeton', undefined) as Record<string, string>;
    expect(h['Content-Type']).toBeUndefined();
    expect(h['X-CSRF-Token']).toBeUndefined();
  });

  it('une méthode absente vaut GET, comme pour fetch', () => {
    const h = entetesRequete(undefined, 'jeton', undefined) as Record<string, string>;
    expect(Object.keys(h)).toEqual([]);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'post'])('%s garde le JSON ET le jeton CSRF', (m) => {
    const h = entetesRequete(m, 'jeton', undefined) as Record<string, string>;
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-CSRF-Token']).toBe('jeton');
  });

  it('une écriture sans jeton connu n’invente pas d’en-tête vide', () => {
    const h = entetesRequete('POST', null, undefined) as Record<string, string>;
    expect('X-CSRF-Token' in h).toBe(false);
  });

  it('les en-têtes fournis par l’appelant sont conservés, sur une lecture comme sur une écriture', () => {
    expect(entetesRequete('GET', 'j', { Accept: 'text/csv' })).toEqual({ Accept: 'text/csv' });
    expect((entetesRequete('POST', 'j', { Accept: 'text/csv' }) as Record<string, string>).Accept).toBe('text/csv');
  });
});
