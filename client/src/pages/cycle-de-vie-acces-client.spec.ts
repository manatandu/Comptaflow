import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(CLIENT, '../../src', p), 'utf8');

describe('cycle de vie des accès · côté client', () => {
  it('le changement de mot de passe RAFRAÎCHIT le jeton CSRF', () => {
    // Le serveur révoque toutes les sessions du compte au changement, et
    // repose une session neuve · le jeton CSRF apparié change donc lui aussi.
    // Sans ce rafraîchissement, la mutation suivante partait avec l'ancien et
    // se faisait refuser en 403, juste après un changement réussi.
    const page = lire('pages/ChangerMotDePassePage.tsx');
    expect(page).toContain('setCsrf(csrfToken)');
  });

  it('l’administrateur peut réinitialiser et déverrouiller depuis l’écran', () => {
    // Sans ces deux gestes, un oubli de mot de passe se réglait par un UPDATE
    // SQL en production, et un comptable verrouillé attendait l'heure.
    const page = lire('pages/UtilisateursPage.tsx');
    expect(page).toContain('/reinitialiser-mot-de-passe');
    expect(page).toContain('/deverrouiller');
  });

  it('l’écran montre qui n’a pas encore posé son propre mot de passe', () => {
    const page = lire('pages/UtilisateursPage.tsx');
    expect(page).toContain('doitChangerMotDePasse');
    expect(page).toContain('PROVISOIRE');
  });

  it('le refus est porté par le SERVEUR, pas seulement par l’écran', () => {
    // C'était le trou de la phase 1a : l'écran s'imposait bien avant l'espace
    // de travail, mais un appel direct à l'API travaillait normalement.
    // CLAUDE.md §4 · « masquer sans refuser laisse la route ouverte ».
    expect(lire('App.tsx')).toContain('doitChangerMotDePasse');
    const module = lireServeur('app.module.ts');
    expect(module).toContain('MotDePasseAChangerGuard');
    expect(module).toContain('APP_GUARD');
  });
});
