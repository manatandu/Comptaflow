import { readFileSync } from 'fs';
import { join } from 'path';
import { DUREE_CACHE_CONTROLE_CORS, optionsCors } from './bootstrap';

/**
 * LE CONTRÔLE PRÉALABLE CORS SE MET EN CACHE.
 *
 * Sans `maxAge`, Chrome garde la réponse à une requête OPTIONS cinq secondes :
 * presque chaque écriture coûtait deux allers-retours Kinshasa ↔ us-east1.
 */
describe('optionsCors · le cache du contrôle préalable', () => {
  it('porte une durée de cache de deux heures, le plafond de Chrome', () => {
    expect(DUREE_CACHE_CONTROLE_CORS).toBe(7200);
    expect(optionsCors(['https://oomega.web.app']).maxAge).toBe(7200);
    expect(optionsCors(undefined).maxAge).toBe(7200);
  });

  it('ne relâche RIEN sur les origines · une liste reste une liste, credentials compris', () => {
    const o = optionsCors(['https://oomega.web.app', 'https://oomega.firebaseapp.com']);
    expect(o.origin).toEqual(['https://oomega.web.app', 'https://oomega.firebaseapp.com']);
    expect(o.credentials).toBe(true);
  });

  it('sans liste (développement seulement), l’origine appelante est reflétée, jamais « * »', () => {
    expect(optionsCors(undefined).origin).toBe(true);
  });

  it('c’est bien cette fonction que le démarrage applique', () => {
    const source = readFileSync(join(__dirname, 'bootstrap.ts'), 'utf-8');
    expect(source).toContain('app.enableCors(optionsCors(origines))');
  });
});
