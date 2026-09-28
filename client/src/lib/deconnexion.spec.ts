import { readFileSync } from 'fs';
import { join } from 'path';
import { apresDeconnexion, deconnecterServeur, fermerLaSession } from './deconnexion';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * LA DÉCONNEXION ATTEND LE SERVEUR, ET LA CONNEXION ATTEND LA DÉCONNEXION
 * (2026-09-28). La réponse de `POST /auth/logout` efface le cookie de session ·
 * arrivée après une connexion lancée entre-temps, elle effaçait le cookie neuf.
 * Ce spec joue l'ORDRE des appels, pas leur forme.
 */

function differe() {
  let resoudre!: () => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<void>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

// Laisse passer les microtâches en attente.
const vider = () => new Promise((r) => setTimeout(r, 0));

describe('l’ordre déconnexion puis connexion', () => {
  it('une connexion lancée pendant la déconnexion ne part qu’à sa réponse', async () => {
    const ordre: string[] = [];
    const logout = differe();
    const fin = deconnecterServeur(() => {
      ordre.push('logout envoyé');
      return logout.promesse.then(() => {
        ordre.push('logout répondu');
      });
    });
    // L'écran d'ouverture, aussitôt après « Ouvrir un autre dossier ».
    const connexion = apresDeconnexion().then(() => {
      ordre.push('login envoyé');
    });
    await vider();
    expect(ordre).toEqual(['logout envoyé']);
    logout.resoudre();
    await connexion;
    await fin;
    expect(ordre).toEqual(['logout envoyé', 'logout répondu', 'login envoyé']);
  });

  it('une déconnexion qui échoue ne bloque pas la connexion suivante, et ne rejette pas', async () => {
    const logout = differe();
    const fin = deconnecterServeur(() => logout.promesse);
    let partie = false;
    const connexion = apresDeconnexion().then(() => {
      partie = true;
    });
    logout.rejeter(new TypeError('réseau'));
    await expect(fin).resolves.toBeUndefined();
    await connexion;
    expect(partie).toBe(true);
  });

  it('deux déconnexions en route · la connexion attend les deux réponses', async () => {
    const premiere = differe();
    const seconde = differe();
    deconnecterServeur(() => premiere.promesse);
    deconnecterServeur(() => seconde.promesse);
    let partie = false;
    const connexion = apresDeconnexion().then(() => {
      partie = true;
    });
    seconde.resoudre();
    await vider();
    expect(partie).toBe(false);
    premiere.resoudre();
    await connexion;
    expect(partie).toBe(true);
  });

  it('la déconnexion part AVANT la fermeture locale, qui n’attend pas la réponse', async () => {
    const ordre: string[] = [];
    const logout = differe();
    const fin = fermerLaSession(
      () => {
        ordre.push('logout envoyé');
        return logout.promesse;
      },
      () => ordre.push('session locale fermée'),
    );
    // Le jeton CSRF de la session est encore là quand la requête part.
    expect(ordre).toEqual(['logout envoyé', 'session locale fermée']);
    let resolue = false;
    void fin.then(() => {
      resolue = true;
    });
    await vider();
    expect(resolue).toBe(false);
    logout.resoudre();
    await fin;
    expect(resolue).toBe(true);
  });

  it('un échec de la déconnexion ferme quand même la session locale', async () => {
    let fermee = false;
    const fin = fermerLaSession(
      () => Promise.reject(new TypeError('réseau')),
      () => {
        fermee = true;
      },
    );
    await expect(fin).resolves.toBeUndefined();
    expect(fermee).toBe(true);
  });
});

describe('les portes qui posent une session passent par l’attente', () => {
  const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  // Découpe le corps d'une fonction fléchée `const nom = …` jusqu'à la
  // prochaine déclaration de même niveau · structure, pas distance.
  const corps = (source: string, debut: string, fin: string) => {
    const i = source.indexOf(debut);
    expect(i).toBeGreaterThan(-1);
    const j = source.indexOf(fin, i + debut.length);
    expect(j).toBeGreaterThan(i);
    return source.slice(i, j);
  };

  it('la connexion attend la déconnexion AVANT de poster', () => {
    const envoi = corps(lire('pages/AuthPage.tsx'), 'const onSubmit = async', 'const champClasse');
    const attente = envoi.indexOf('await apresDeconnexion();');
    const login = envoi.indexOf("'/auth/login'");
    expect(attente).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(attente);
  });

  it('la création d’un dossier par l’assistant attend aussi, avant /auth/register', () => {
    const terminer = corps(lire('components/NouveauFichierWizard.tsx'), 'const onTerminer = async', 'return (');
    const attente = terminer.indexOf('await apresDeconnexion();');
    const inscription = terminer.indexOf("api.post<AuthResponse>('/auth/register', corps)");
    expect(attente).toBeGreaterThan(-1);
    expect(inscription).toBeGreaterThan(attente);
  });

  it('seDeconnecter rend la promesse qui attend le serveur, et ferme localement quoi qu’il arrive', () => {
    const sortie = corps(lire('lib/auth.tsx'), 'const seDeconnecter', 'return (\n    <AuthContext.Provider');
    expect(sortie).toContain("return fermerLaSession(\n      () => api.post('/auth/logout'),");
    expect(sortie).toContain('setUtilisateur(null);');
    expect(sortie).toContain('setCsrf(null);');
  });
});
