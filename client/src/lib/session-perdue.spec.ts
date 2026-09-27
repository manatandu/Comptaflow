import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { motifDeSessionPerdue, signalerSessionPerdue, surSessionPerdue, SIGNAL_SESSION_PERDUE } from './session-perdue';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * AUDIT FINAL F164 · une session expirée en cours de travail affichait
 * « Unauthorized » partout, sans ramener à la connexion.
 */
describe('F164 · reconnaître une session perdue', () => {
  it('un 401 marqué par le serveur est une session perdue, avec son motif', () => {
    expect(motifDeSessionPerdue(401, { message: 'Session close · reconnectez-vous', session: SIGNAL_SESSION_PERDUE })).toBe(
      'Session close · reconnectez-vous',
    );
    expect(motifDeSessionPerdue(401, { session: SIGNAL_SESSION_PERDUE })).toMatch(/reconnectez-vous/);
  });

  it('un 401 sans le drapeau n’en est pas une · un mot de passe actuel faux ne déconnecte personne', () => {
    expect(motifDeSessionPerdue(401, { message: 'Le mot de passe actuel est incorrect' })).toBeNull();
    expect(motifDeSessionPerdue(403, { message: 'Rôle insuffisant', session: SIGNAL_SESSION_PERDUE })).toBeNull();
    expect(motifDeSessionPerdue(401, null)).toBeNull();
  });

  it('le signal atteint les écouteurs abonnés, et plus ceux qui se sont retirés', () => {
    const recus: string[] = [];
    const retirer = surSessionPerdue((m) => recus.push(m));
    signalerSessionPerdue('A');
    retirer();
    signalerSessionPerdue('B');
    expect(recus).toEqual(['A']);
  });
});

describe('F164 · câblage', () => {
  const api = lire('lib/api.ts');
  const auth = lire('lib/auth.tsx');

  it('les trois appels au serveur lisent leur refus par la même fonction, qui signale', () => {
    const corps = api.slice(api.indexOf('async function refus('), api.indexOf('async function request<'));
    expect(corps).toContain('motifDeSessionPerdue(res.status, body)');
    expect(corps).toContain('signalerSessionPerdue(motif)');
    expect(api.match(/if \(!res\.ok\) throw await refus\(res\);/g)).toHaveLength(3);
  });

  it('l’écouteur ne ferme que la session ouverte, et vide tout ce qu’elle tenait', () => {
    const debut = auth.indexOf('surSessionPerdue((motif) => {');
    expect(debut).toBeGreaterThan(-1);
    const corps = auth.slice(debut, auth.indexOf('}),', debut));
    expect(corps).toContain('if (!ouverte.current) return;');
    for (const geste of ['setCsrf(null)', 'setUtilisateur(null)', 'setMotifDeconnexion(motif)', 'oublierPrechargement()']) {
      expect(corps).toContain(geste);
    }
  });

  it('l’écran de connexion affiche le motif', () => {
    const page = lire('pages/AuthPage.tsx');
    expect(page).toContain('const { seConnecter, motifDeconnexion } = useAuth();');
    expect(page).toMatch(/motifDeconnexion && \(\s*<div role="status"[^>]*>\s*\{motifDeconnexion\}/);
  });
});
