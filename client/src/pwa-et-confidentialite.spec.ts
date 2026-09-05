import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES TROIS PRÉREQUIS COMMUNS À TOUS LES MAGASINS D'APPLICATIONS.
 *
 * POURQUOI CES TESTS EXISTENT, ET POURQUOI ILS LISENT DES FICHIERS. Firebase
 * Hosting réécrit `**` vers `index.html` : une ressource ABSENTE du dépôt n'est
 * pas servie en 404, elle est servie en 200 avec du HTML. Un manifeste oublié
 * ne casse donc rien de visible · le navigateur reçoit une page, échoue à
 * l'analyser en JSON, et cesse simplement de proposer l'installation, sans un
 * mot. Aucun test de rendu n'attraperait cela : seule la PRÉSENCE des fichiers
 * le peut.
 */

const racine = join(__dirname, '..');
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8');

describe('la PWA est réellement installable', () => {
  it('les quatre ressources existent dans public/', () => {
    for (const f of ['manifest.webmanifest', 'sw.js', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png']) {
      expect(existsSync(join(racine, 'public', f))).toBe(true);
    }
  });

  it('index.html lie le manifeste, sans quoi rien ne se propose', () => {
    const html = lire('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('/manifest.webmanifest');
    expect(html).toContain('name="theme-color"');
  });

  it('le manifeste porte les champs sans lesquels aucun navigateur ne propose l’installation', () => {
    const m = JSON.parse(lire('public/manifest.webmanifest'));
    // La couleur de thème est celle de l'encre de la marque · une couleur de
    // thème qui diverge du carré du logo fait clignoter la barre du système
    // au lancement.
    expect(m.theme_color).toBe('#142f6b');
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe('standalone');
    const tailles = m.icons.map((i: { sizes: string }) => i.sizes);
    // 192 et 512 sont le minimum exigé par Chrome pour l'invite d'installation.
    expect(tailles).toContain('192x192');
    expect(tailles).toContain('512x512');
    // Une icône MASKABLE, sans quoi Android rogne le logo dans son masque.
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('le service worker est enregistré au chargement', () => {
    const main = lire('src/main.tsx');
    expect(main).toContain("navigator.serviceWorker.register('/sw.js')");
    // L'échec est avalé · un service worker qui ne s'enregistre pas ne doit pas
    // empêcher un comptable de travailler.
    expect(main).toMatch(/\.catch\(\(\) => undefined\)/);
  });

  it('le service worker NE MET RIEN en cache', () => {
    // Un logiciel de comptabilité qui servirait une balance périmée depuis un
    // cache est pire qu'un logiciel hors ligne : le comptable ne peut pas voir
    // que le chiffre est vieux, et il l'imprime.
    const sw = lire('public/sw.js');
    expect(sw).not.toContain("addEventListener('fetch'");
    expect(sw).toContain('caches.delete');
  });
});

describe('les deux pièges de firebase.json', () => {
  const firebase = JSON.parse(lire('firebase.json')).hosting;

  it("n'ignore plus tous les fichiers commençant par un point", () => {
    // `**/.*` empêchait de déployer un futur `.well-known`, que réclament
    // l'App Store (apple-app-site-association) comme Google Play
    // (assetlinks.json) · et la réécriture `**` aurait rendu du HTML en 200 à
    // leur place, donc sans erreur visible.
    expect(firebase.ignore).not.toContain('**/.*');
  });

  it("ne met plus le service worker en cache pour un an", () => {
    // La règle `immutable` portait sur TOUS les fichiers .js. Un service worker
    // figé un an dans le navigateur du client ne se remplace plus, et la seule
    // sortie est de lui faire vider ses données de site.
    const immuable = firebase.headers.find((r: { headers: { value: string }[] }) =>
      r.headers.some((h) => h.value.includes('immutable')),
    );
    // Seuls les fichiers HACHÉS par Vite sont réellement immuables.
    expect(immuable.source).toBe('/assets/**');
    const sw = firebase.headers.find((r: { source: string }) => r.source === '/sw.js');
    expect(sw.headers[0].value).toBe('no-cache');
  });

  it('la politique de sécurité autorise explicitement le manifeste et le worker', () => {
    const csp = firebase.headers
      .flatMap((r: { headers: { key: string; value: string }[] }) => r.headers)
      .find((h: { key: string }) => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("worker-src 'self'");
  });
});

describe('la politique de confidentialité est PUBLIÉE', () => {
  it('sa route est hors de la zone protégée', () => {
    // Une politique derrière un mot de passe n'est pas une politique publiée,
    // et aucun magasin ne l'accepte.
    const app = lire('src/App.tsx');
    const i = app.indexOf('path="/confidentialite"');
    expect(i).toBeGreaterThan(0);
    // Elle apparaît AVANT l'ouverture de la zone protégée.
    expect(i).toBeLessThan(app.indexOf('<ZoneProtegee>'));
  });

  it("l'écran d'ouverture y renvoie · c'est la seule page qu'un visiteur voit", () => {
    expect(lire('src/pages/AuthPage.tsx')).toContain('#/confidentialite');
  });

  it('elle nomme les trois hébergeurs et la région du service', () => {
    const page = lire('src/pages/ConfidentialitePage.tsx');
    expect(page).toContain('Neon');
    expect(page).toContain('Google Cloud Run');
    expect(page).toContain('us-east1');
    expect(page).toContain('Firebase Hosting');
  });

  it('elle dit que les données sont hébergées hors de RDC', () => {
    // Le cabinet vend à des ONG qui rendent des comptes à des bailleurs · le
    // taire serait le rendre découvrable au pire moment.
    expect(lire('src/pages/ConfidentialitePage.tsx')).toContain(
      'hébergées hors de la République démocratique du Congo',
    );
  });

  it("elle ne prétend pas avoir un contact que VMG Consulting n'a pas arrêté", () => {
    // Une adresse inventée dirigerait les demandes d'exercice des droits vers
    // le vide, et rendrait le document faux plutôt qu'incomplet.
    const page = lire('src/pages/ConfidentialitePage.tsx');
    expect(page).toMatch(/doivent être arrêtées par VMG Consulting/);
  });

  it('elle énonce la durée réelle de conservation des sauvegardes', () => {
    // Quatre-vingt-dix jours · c'est `retention-days: 90` du workflow de
    // sauvegarde, pas un chiffre choisi pour faire bien.
    expect(lire('src/pages/ConfidentialitePage.tsx')).toContain('quatre-vingt-dix');
  });
});
