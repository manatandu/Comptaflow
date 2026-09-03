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

  it('elle nomme la cause la plus courante · le cookie tiers bloqué', () => {
    // Interface sur Firebase Hosting, API sur Cloud Run : le cookie de
    // session est un cookie TIERS, que Chrome jette par défaut en navigation
    // privée. Le logiciel paraît alors cassé alors qu'il obéit au navigateur.
    expect(auth).toContain('cookies tiers');
    expect(auth).toContain('privée');
  });

  it('l’écran de connexion affiche bien ce que la connexion a levé', () => {
    const page = lire('pages/AuthPage.tsx');
    expect(page).toContain('await seConnecter(');
    expect(page).toContain('setErreur(');
  });
});
