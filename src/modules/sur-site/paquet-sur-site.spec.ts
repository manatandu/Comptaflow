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

  it('ne construit pas de paquet sans la clé publique de l’éditeur', () => {
    expect(flux).toContain("-notmatch 'BEGIN PUBLIC KEY'");
  });
});
