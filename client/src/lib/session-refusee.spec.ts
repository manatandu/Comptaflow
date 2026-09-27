import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * L'INCIDENT DU 2026-09-02 · « ça me renvoie à la page qui vient avant le
 * loginpage ». Le serveur acceptait la connexion, posait le cookie, et
 * l'appel suivant à /auth/me échouait. Le client rattrapait l'erreur, vidait
 * la session et rendait la main, SANS UN MOT. Il a fallu lire le code pour
 * comprendre qu'il ne se passait rien d'anormal côté serveur.
 *
 * Un refus silencieux n'est pas une protection, c'est une panne muette.
 */
describe('une session refusée juste après la connexion se DIT', () => {
  const auth = lire('lib/auth.tsx');

  it('la lecture qui suit la connexion est exigeante', () => {
    expect(auth).toContain('chargerUtilisateur(true)');
  });

  it('elle relève l’erreur au lieu de se contenter de vider la session', () => {
    // `setUtilisateur(null)` seul renvoyait à la porte sans explication.
    expect(auth).toMatch(/if \(exigeante\)[\s\S]{0,80}throw new Error\(/);
  });

  it('elle nomme ce qui jette encore le cookie · un blocage des cookies du site (audit final F165)', () => {
    // Depuis le relais `/api` de Firebase Hosting (2026-09-26), le cookie de
    // session est de PREMIÈRE partie. Le message accusait les cookies tiers,
    // et un utilisateur qui les autorisait n'y trouvait rien.
    expect(auth).toContain("le navigateur n'a pas gardé le cookie de session. ");
    expect(auth).toContain('Vérifiez que les cookies ne sont pas bloqués pour ce site, puis réessayez.');
  });

  it('l’écran de connexion affiche bien ce que la connexion a levé', () => {
    const page = lire('pages/AuthPage.tsx');
    expect(page).toContain('await seConnecter(');
    expect(page).toContain('setErreur(');
  });
});
