import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA MARQUE OMEGAX · un seul dessin, tous les formats.
 *
 * `scripts/engendrer-marque.py` produit à la fois la géométrie que l'interface
 * dessine et les icônes de la PWA. Deux dessins tenus séparément divergent
 * toujours, et l'écart ne se voit qu'une fois la marque imprimée · d'où le
 * premier test, qui relance le script et compare.
 */

const racine = join(__dirname, '..', '..', '..');
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8');

describe('la géométrie engendrée est à jour', () => {
  it('relancer le script ne changerait rien', () => {
    // Le fichier est ENGENDRÉ · le modifier à la main ferait diverger le
    // symbole de l'interface de celui des icônes.
    const avant = lire('src/components/chrome/marque-geometrie.ts');
    // `--geometrie-seule` · le rendu des PNG suréchantillonne 512 x 512 x 9
    // points, ce qui dépasse le délai d'un test alors que la géométrie
    // s'écrit instantanément.
    execFileSync('python3', [join(racine, 'scripts', 'engendrer-marque.py'), '--geometrie-seule'], {
      cwd: racine,
    });
    expect(lire('src/components/chrome/marque-geometrie.ts')).toBe(avant);
  });
});

describe('le dessin tient ses contraintes', () => {
  const geo = lire('src/components/chrome/marque-geometrie.ts');
  const nombre = (cle: string) => Number(new RegExp(`${cle}: ([0-9.]+)`).exec(geo)![1]);

  it("l'épaisseur du trait tient à 16 px", () => {
    // 13 % du côté au minimum · en dessous de 10 %, l'oméga se bouche à la
    // taille d'un onglet de navigateur et devient une tache.
    expect(nombre('archeTrait') / 64).toBeGreaterThanOrEqual(0.12);
  });

  it('le vide central existe, et il est mesurable', () => {
    // C'est lui qui fait lire les deux pieds comme les deux colonnes d'un
    // journal plutôt que comme deux pattes. Sans lui, le dessin perd son sens.
    const pieds = [...geo.matchAll(/x: ([0-9.]+), y: [0-9.]+, largeur: ([0-9.]+)/g)].map((m) => ({
      x: Number(m[1]),
      largeur: Number(m[2]),
    }));
    expect(pieds).toHaveLength(2);
    const [gauche, droit] = pieds.sort((a, b) => a.x - b.x);
    const vide = droit.x - (gauche.x + gauche.largeur);
    expect(vide).toBeGreaterThan(6);
  });

  it('les deux pieds sont symétriques · une comptabilité est un équilibre', () => {
    const pieds = [...geo.matchAll(/x: ([0-9.]+), y: [0-9.]+, largeur: ([0-9.]+)/g)].map((m) => ({
      x: Number(m[1]),
      largeur: Number(m[2]),
    }));
    const [gauche, droit] = pieds.sort((a, b) => a.x - b.x);
    expect(gauche.largeur).toBeCloseTo(droit.largeur, 2);
    // Miroir autour de l'axe du repère.
    expect(32 - (gauche.x + gauche.largeur)).toBeCloseTo(droit.x - 32, 2);
  });
});

describe("la marque est employée là où l'identité se joue", () => {
  it("le placeholder générique n'existe plus", () => {
    // `IconLogo` était une ligne brisée, la même que celle d'un millier
    // d'applications · elle ne portait aucune identité.
    expect(lire('src/components/chrome/icons.tsx')).not.toContain('IconLogo');
  });

  it("le bandeau de l'espace de travail porte le symbole", () => {
    expect(lire('src/components/chrome/AppShell.tsx')).toContain('SymboleOmegaX');
  });

  it("l'écran d'ouverture le porte aussi, et écrit le nom sans capitales forcées", () => {
    // Les capitales effacent la capitale interne du X, seule particularité du
    // nom, et donnent au mot l'allure d'un acronyme.
    const auth = lire('src/pages/AuthPage.tsx');
    expect(auth).toContain('SymboleOmegaX');
    expect(auth).not.toContain('>OMEGAX<');
  });

  it('le symbole hérite de la couleur du texte, plutôt que d’être servi en image', () => {
    // Servi en `<img>`, il ne suivrait ni le mode sombre ni l'impression.
    expect(lire('src/components/chrome/Logo.tsx')).toContain('stroke="currentColor"');
  });
});

describe('la charte existe et pose les rubriques attendues', () => {
  const charte = lire('../docs/marque-omegax.md');

  it('zone de protection, taille minimale, couleurs, usages interdits', () => {
    for (const rubrique of [
      'Zone de protection',
      'Taille minimale',
      'Couleurs',
      'Usages interdits',
    ]) {
      expect(charte).toContain(rubrique);
    }
  });

  it('la taille minimale est donnée pour l’écran ET pour l’impression', () => {
    expect(charte).toContain('16 px');
    expect(charte).toContain('6 mm');
  });
});
