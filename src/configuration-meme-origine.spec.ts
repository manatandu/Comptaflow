import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { COOKIE_SESSION, estHttpLocal, optionsCookieSession, OPTIONS_COOKIE_SESSION } from './modules/auth/session.constants';

/**
 * L'API SOUS L'ADRESSE DU SITE, FIGÉE · la panne du 2026-09-26 (session jetée
 * aussitôt ouverte par tous les navigateurs de l'iPhone) venait d'un cookie
 * d'un autre site que la page. Le montage qui l'évite tient à QUATRE fichiers
 * qui ne se voient pas l'un l'autre · un seul qui dérive, et la panne revient
 * sans qu'aucun autre test ne rougisse.
 */
const RACINE = join(__dirname, '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

describe('l’API servie sous l’adresse du site', () => {
  it('Firebase relaie /api/** vers le service Cloud Run, AVANT la règle de l’application', () => {
    const regles = JSON.parse(lire('client/firebase.json')).hosting.rewrites as { source: string; run?: { serviceId: string; region: string } }[];
    const relais = regles.findIndex((r) => r.source === '/api/**');
    expect(relais).toBeGreaterThanOrEqual(0);
    expect(relais).toBeLessThan(regles.findIndex((r) => r.source === '**'));
    // Le service nommé est bien celui que le déploiement publie.
    const deploiement = lire('.github/workflows/deploy-cloud-run.yml');
    expect(deploiement).toMatch(new RegExp(`SERVICE: ${regles[relais].run!.serviceId}\\s`));
    expect(deploiement).toMatch(new RegExp(`REGION: ${regles[relais].run!.region}\\s`));
  });

  it('le site publié appelle /api, jamais l’adresse de Cloud Run', () => {
    const env = lire('client/.env.production');
    expect(env).toMatch(/^VITE_API_URL=\/api$/m);
  });

  it('le cookie porte le seul nom que Firebase laisse passer', () => {
    expect(COOKIE_SESSION).toBe('__session');
  });

  it('les tests navigateur passent par le même relais, et sous WebKit', () => {
    const w = lire('.github/workflows/tests-navigateur.yml');
    expect(w).toMatch(/VITE_API_URL: \/api\s/);
    expect(w).toMatch(/OMEGAX_API: http:\/\/localhost:4173\/api\s/);
    expect(w).toMatch(/PW_WEBKIT: '1'/);
    expect(w).toMatch(/playwright install --with-deps chromium webkit/);
    expect(lire('client/vite.config.ts')).toMatch(/'\/api': \{ target: process\.env\.OMEGAX_API_RELAIS/);
    // Un vite.config.js engendré par `tsc -b` à côté du .ts était LU À SA
    // PLACE par Vite · le relais écrit dans le .ts n'existait pas, et le test
    // local du relais rendait la page d'accueil au lieu de l'API.
    expect(existsSync(join(RACINE, 'client/vite.config.js'))).toBe(false);
    expect(JSON.parse(lire('client/tsconfig.node.json')).compilerOptions.outDir).toMatch(/node_modules/);
  });

  it('la surveillance interroge le chemin des clients, par le relais', () => {
    expect(lire('.github/workflows/surveillance.yml')).toMatch(/"\$URL_SANTE_RELAIS"/);
    expect(lire('.github/workflows/surveillance.yml')).toContain('https://oomega.web.app/api/health');
  });
});

describe('le cookie en http sur la machine même', () => {
  it('seul le http local perd Secure · la production le garde', () => {
    expect(estHttpLocal({ secure: false, hostname: 'localhost' })).toBe(true);
    expect(estHttpLocal({ secure: false, hostname: '127.0.0.1' })).toBe(true);
    expect(estHttpLocal({ secure: true, hostname: 'localhost' })).toBe(false);
    expect(estHttpLocal({ secure: false, hostname: 'oomega.web.app' })).toBe(false);
    expect(estHttpLocal(undefined)).toBe(false);
    expect(optionsCookieSession(false, false)).toBe(OPTIONS_COOKIE_SESSION);
    expect(optionsCookieSession(false, true)).toMatchObject({ secure: false, sameSite: 'lax', httpOnly: true });
  });
});
