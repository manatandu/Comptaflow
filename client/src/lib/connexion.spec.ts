import { readFileSync } from 'fs';
import { join } from 'path';
import { corpsConnexion, issueConnexion } from './connexion';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * LA SESSION COURTE DE LA CONSOLE SE DIT (2026-09-28). Un opérateur de la
 * plateforme qui coche « Rester connecté » reçoit une session COURTE, et le
 * serveur le dit (`motifSessionCourte`, auth.service.ts). L'écran ne le
 * montrait pas · l'opérateur croyait sa session gardée trente jours.
 */

const MOTIF =
  "La console de l'éditeur n'admet pas « Rester connecté sur cet appareil » · la session se ferme avec le navigateur.";

describe('le corps de la connexion', () => {
  it('la case voyage au premier appel', () => {
    expect(corpsConnexion({ email: 'a@b.cd', motDePasse: 'x', resterConnecte: true, codeRequis: false, code: '' })).toEqual({
      email: 'a@b.cd',
      motDePasse: 'x',
      resterConnecte: true,
    });
  });

  it('et avec le code du second facteur, comme le mot de passe', () => {
    expect(
      corpsConnexion({ email: 'a@b.cd', motDePasse: 'x', resterConnecte: true, codeRequis: true, code: ' 123456 ' }),
    ).toEqual({ email: 'a@b.cd', motDePasse: 'x', resterConnecte: true, code: '123456' });
  });
});

describe('ce que la réponse demande à l’écran', () => {
  it('un code attendu', () => {
    expect(issueConnexion({ deuxiemeFacteurRequis: true })).toEqual({ etape: 'CODE_REQUIS' });
  });

  it('une session ouverte comme demandé · rien à dire', () => {
    expect(issueConnexion({ csrfToken: 'j', sessionLongue: true })).toEqual({ etape: 'OUVERTE', csrfToken: 'j', avis: null });
  });

  it('une session ouverte courte malgré la case · le motif du serveur, tel quel', () => {
    expect(issueConnexion({ csrfToken: 'j', sessionLongue: false, motifSessionCourte: MOTIF })).toEqual({
      etape: 'OUVERTE',
      csrfToken: 'j',
      avis: MOTIF,
    });
  });

  it('le serveur écrit bien ce champ-là · la prémisse relue sur sa source', () => {
    const service = readFileSync(join(__dirname, '..', '..', '..', 'src', 'modules', 'auth', 'auth.service.ts'), 'utf8');
    expect(service).toContain('{ motifSessionCourte: MOTIF_CONSOLE_SANS_SESSION_LONGUE }');
  });
});

describe('l’écran d’ouverture le dit en une ligne, avant d’entrer', () => {
  const page = readFileSync(join(__dirname, '..', 'pages', 'AuthPage.tsx'), 'utf8');

  it('la réponse passe par issueConnexion, et l’avis arrête l’entrée', () => {
    const envoi = page.slice(page.indexOf('const onSubmit = async'), page.indexOf('const champClasse'));
    expect(envoi).toContain('corpsConnexion({ email, motDePasse, resterConnecte, codeRequis, code })');
    expect(envoi).toContain('const issue = issueConnexion(res);');
    const avis = envoi.indexOf('if (issue.avis) {');
    const entree = envoi.lastIndexOf("navigate('/');");
    expect(avis).toBeGreaterThan(-1);
    expect(envoi.slice(avis, entree)).toContain('setAvisSession(issue.avis);');
    expect(envoi.slice(avis, entree)).toContain('return;');
  });

  it('l’avis s’affiche sur sa ligne, et le bouton devient « Continuer »', () => {
    expect(page).toContain('<div role="status" className="text-[11.5px] text-text bg-sel-soft border border-sel/30 rounded-[4px] px-3 py-2">\n              {avisSession}');
    expect(page).toContain("avisSession ? 'Continuer' : 'Ouvrir le dossier'");
  });
});
