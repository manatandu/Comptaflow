import { adresseApi } from './adresse-api';

describe('adresse de l’API', () => {
  it('sur site, la même origine · des chemins relatifs', () => {
    expect(adresseApi('meme-origine')).toBe('');
  });
  it('en ligne, l’adresse construite ; sans rien, le développement local', () => {
    expect(adresseApi('https://api.exemple')).toBe('https://api.exemple');
    expect(adresseApi(undefined)).toBe('http://localhost:3000');
  });
});
