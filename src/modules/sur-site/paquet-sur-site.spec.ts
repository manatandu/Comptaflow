/**
 * Le paquet Windows · ce qui ne se vérifie que chez un client, un jour de
 * mise à jour, et qui se gèle donc dans les sources du paquet.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const lire = (f: string) => readFileSync(join(__dirname, '../../..', f), 'utf8');

describe('paquet d’installation sur site', () => {
  const iss = lire('installation/windows/omegax.iss');
  const init = lire('installation/windows/initialiser.ps1');
  const flux = lire('.github/workflows/paquet-sur-site.yml');

  it('une mise à jour ne supprime que le programme, jamais les données', () => {
    const cibles = [...iss.matchAll(/^Type: filesandordirs; Name: "([^"]+)"/gm)].map((m) => m[1]);
    expect(cibles.length).toBeGreaterThan(0);
    for (const c of cibles) expect(c.startsWith('{app}\\')).toBe(true);
  });

  it('refuse de remplacer les binaires d’une base d’une autre version majeure, avant la copie', () => {
    const prepare = iss.slice(iss.indexOf('function PrepareToInstall'), iss.indexOf('procedure CurStepChanged'));
    expect(prepare).toContain('pgdata\\PG_VERSION');
    expect(prepare.indexOf('PG_VERSION')).toBeLessThan(prepare.indexOf('net.exe'));
    expect(flux).toContain('OMEGAX_PG_MAJEUR=$majeur');
    expect(flux).toContain('PG_MAJEUR_ATTENDU');
  });

  it('tire mot de passe et secret au générateur cryptographique', () => {
    expect(init).toMatch(/\$mdp = Aleatoire \d+/);
    expect(init).toMatch(/\$secret = Aleatoire \d+/);
    expect(init).toContain('RandomNumberGenerator');
  });

  it('laisse le compte Service réseau lire la base qu’il fait tourner', () => {
    expect(init).toMatch(/Restreindre \$PgData @\('\*S-1-5-20:/);
  });

  it('audit final F192 · les données entières sont fermées aux utilisateurs du poste, à chaque installation', () => {
    const corps = init.slice(init.indexOf('try {'));
    // Une ligne de code, pas un commentaire · ancrée en début de ligne.
    const ligne = /^ {2}Restreindre \$Donnees @\('\*S-1-5-20:\(X\)'\)\r?$/m.exec(corps);
    expect(ligne).not.toBeNull();
    const pose = ligne!.index;
    // Avant les deux branches (poste neuf et mise à jour) · une mise à jour
    // corrige un poste déjà installé.
    expect(pose).toBeLessThan(corps.indexOf("if (-not (Test-Path (Join-Path $PgData 'PG_VERSION')))"));
    // Système et administrateurs seulement, et PostgreSQL ne fait que traverser.
    expect(init).toContain("$droits = @('*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F') + $autres");
    expect(init).toContain("& icacls $chemin /inheritance:r /grant:r @droits");
    // Le service OmegaX tourne sous le compte système, qui garde l'accès · un
    // compte de service déclaré sans droit sur les données le couperait.
    expect(lire('installation/windows/omegax-service.xml')).not.toMatch(/<serviceaccount>/);
  });

  it('ne construit pas de paquet sans la clé publique de l’éditeur', () => {
    expect(flux).toContain("-notmatch 'BEGIN PUBLIC KEY'");
  });
});
