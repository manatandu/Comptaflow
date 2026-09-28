import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * « RESTER CONNECTÉ SUR CET APPAREIL » · côté écran (audit final F270). Le
 * serveur tient la règle (`src/modules/auth/session-longue.spec.ts`) ; ce
 * spec gèle ce que l'écran doit y apporter, et qui casserait sans bruit · une
 * case cochée d'office ouvrirait trente jours sur un poste partagé, une case
 * qui ne part pas au second appel du code perdrait le choix en silence, et un
 * jeton CSRF qui ne suit pas la session ferait refuser chaque écriture.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(CLIENT, '../../src', p), 'utf8');

const page = lire('pages/AuthPage.tsx');

/** Le corps de la fonction fléchée `nom`, déclarée à deux espaces, jusqu'à sa fermeture. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`  const ${nom} = `);
  expect([nom, debut >= 0]).toEqual([nom, true]);
  return source.slice(debut, source.indexOf('\n  };', debut));
}

describe('la case de l’écran de connexion', () => {
  it('existe, décochée par défaut, et porte le libellé décidé', () => {
    expect(page).toContain('const [resterConnecte, setResterConnecte] = useState(false);');
    expect(page).toContain('checked={resterConnecte}');
    expect(page).toContain('onChange={(e) => setResterConnecte(e.target.checked)}');
    expect(page).toContain('Rester connecté sur cet appareil');
  });

  it('part avec CHAQUE envoi de connexion, celui du code compris · une seule requête les porte', () => {
    const envoi = corps(page, 'onSubmit');
    const appels = [...envoi.matchAll(/api\.post(?:<[^>]*>)?\(\s*'\/auth\/login'\s*,\s*\{([\s\S]*?)\}\);/g)];
    expect(appels).toHaveLength(1);
    const cles = appels[0][1].split(',').map((c) => c.trim().match(/^(\w+)/)?.[1]).filter(Boolean);
    expect(cles).toEqual(['email', 'motDePasse', 'resterConnecte']);
  });

  it('la clé envoyée est celle que le DTO de connexion déclare · le serveur refuse toute clé de plus', () => {
    const dto = lireServeur('modules/auth/dto/login.dto.ts');
    const bloc = dto.slice(dto.indexOf('export class LoginDto '), dto.indexOf('\n}', dto.indexOf('export class LoginDto ')));
    expect(bloc).toMatch(/^\s+resterConnecte\?: boolean;$/m);
  });
});

describe('le jeton CSRF suit la session', () => {
  it('l’interface reprend celui de /auth/me à chaque ouverture, sans le garder dans l’état React', () => {
    const auth = lire('lib/auth.tsx');
    const charger = corps(auth, 'chargerUtilisateur');
    const lecture = charger.indexOf("const { csrfToken, ...me } = await api.get<MeEtCsrf>('/auth/me');");
    const synchro = charger.indexOf('synchroniserCsrf(csrfToken);');
    const etat = charger.indexOf('setUtilisateur(me);');
    expect(lecture).toBeGreaterThan(-1);
    expect(synchro).toBeGreaterThan(lecture);
    expect(etat).toBeGreaterThan(synchro);
  });

  it('synchroniserCsrf adopte le jeton du serveur s’il a changé, et un jeton absent n’efface rien', () => {
    // Lu dans la source · `lib/api.ts` lit `import.meta.env`, que le lanceur
    // du serveur (jest, qui passe aussi sur ce dossier) ne sait pas charger.
    const api = lire('lib/api.ts');
    const debut = api.indexOf('export function synchroniserCsrf(token: string | undefined): void {');
    expect(debut).toBeGreaterThan(-1);
    const fonction = api.slice(debut, api.indexOf('\n}', debut));
    expect(fonction).toContain('if (token && token !== getCsrf()) setCsrf(token);');
  });

  it('le serveur rend bien ce jeton sur /auth/me, lu dans la session de la requête', () => {
    const controleur = lireServeur('modules/auth/auth.controller.ts');
    const debut = controleur.indexOf("@Get('me')");
    const methode = controleur.slice(debut, controleur.indexOf('\n  }', debut));
    expect(methode).toContain('const session = sessionDeLaRequete(req);');
    expect(methode).toContain('csrfToken: session.csrf');
  });
});
