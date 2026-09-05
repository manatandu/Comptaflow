import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA MARQUE OMEGAX · un seul dessin, tous les formats.
 *
 * `scripts/engendrer-marque.py` produit la géométrie que l'interface dessine,
 * les fichiers remis à un imprimeur et les icônes de la PWA. Deux dessins
 * tenus séparément divergent toujours, et l'écart ne se voit qu'une fois la
 * marque imprimée.
 *
 * Ce que ces tests surveillent est ce qui CASSERAIT EN SILENCE : un logotype
 * qui redeviendrait du texte, un signe qui redeviendrait la lettre grecque
 * brute, une police redevenue tierce, une licence partie sans son fichier.
 * Rien de tout cela ne lève d'erreur ni ne fait tomber un rendu.
 */

/** La racine du CLIENT, pas celle du dépôt · `docs/` se lit donc en `../docs/`. */
const racine = join(__dirname, '..', '..', '..');
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8');
const geo = lire('src/components/chrome/marque-geometrie.ts');
const chemin = (cle: string) => new RegExp(`${cle} = '([^']+)'`).exec(geo)![1];
const boite = (cle: string) => chemin(cle).split(' ').map(Number);

/** Les sommets d'un `d` SVG · on n'aplatit pas les courbes, ils suffisent ici. */
function sommets(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const m of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const v = (m[2].match(/-?[\d.]+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < v.length; i += 2) pts.push({ x: v[i], y: v[i + 1] });
  }
  return pts;
}

describe('la géométrie engendrée est à jour', () => {
  it('relancer le script ne changerait rien', () => {
    const avant = lire('src/components/chrome/marque-geometrie.ts');
    execFileSync('python3', [join(racine, 'scripts', 'engendrer-marque.py'), '--geometrie-seule'], {
      cwd: racine,
    });
    expect(lire('src/components/chrome/marque-geometrie.ts')).toBe(avant);
  });
});

describe('le signe est bien le RECOUPÉ, pas la lettre grecque', () => {
  it('les pieds sortent de 75 unités de chaque côté', () => {
    // C'est le SEUL écart au dessin d'IBM Plex, et c'est lui qui fait passer
    // la lettre au rang de signe. Régénérer depuis le glyphe brut ne lèverait
    // aucune erreur : on obtiendrait un oméga typographique parfaitement
    // correct, et une marque qui n'appartient plus à personne.
    const [x] = boite('SIGNE_BOITE');
    expect(x).toBeCloseTo(52 - 75, 1); // le bord gauche de la lettre est à 52
    const [, , largeur] = boite('SIGNE_BOITE');
    expect(largeur).toBeCloseTo(669 + 75 - (52 - 75), 1);
  });

  /**
   * Les quatre abscisses de la LIGNE DE PIED, de gauche à droite : bord
   * extérieur du pied gauche, bord de la partition, bord de la partition,
   * bord extérieur du pied droit. Le repère SVG descend, la ligne de pied est
   * donc le y MAXIMAL du tracé.
   */
  function ligneDePied(): number[] {
    const pts = sommets(chemin('SIGNE'));
    const bas = Math.max(...pts.map((p) => p.y));
    return pts
      .filter((p) => Math.abs(p.y - bas) < 0.5)
      .map((p) => p.x)
      .sort((a, b) => a - b);
  }

  it('les deux pieds sont symétriques · une comptabilité est un équilibre', () => {
    // TOLÉRANCE DE 2 UNITÉS SUR 1000, ET ELLE EST VOULUE. L'oméga d'IBM Plex
    // porte lui-même une asymétrie d'une unité (pied gauche 258, pied droit
    // 257 · la panse est décalée d'une demi-unité de son côté). C'est un
    // arrondi du dessin d'origine, invisible à toute taille : à 512 px il vaut
    // un demi-pixel. La « corriger » sur les pieds seuls les alignerait sur un
    // axe que la panse ne partage pas, et redresser la panse voudrait dire
    // redessiner la lettre. Le test garde donc la tolérance du dessin réel ·
    // il attrape encore ce qu'il doit attraper, un pied allongé sans l'autre.
    const [g, pg, pd, d] = ligneDePied();
    expect(Math.abs((pg - g) - (d - pd))).toBeLessThanOrEqual(2);
    const axe = (g + d) / 2;
    expect(Math.abs((axe - pg) - (pd - axe))).toBeLessThanOrEqual(2);
  });

  it('la partition centrale existe, et vaut au moins 13 % de la hauteur', () => {
    // C'est elle qui fait lire les deux pieds comme les deux colonnes d'un
    // journal plutôt que comme deux pattes. À 16 px elle doit rester visible.
    const [, pg, pd] = ligneDePied();
    const [, , , hauteur] = boite('SIGNE_BOITE');
    expect((pd - pg) / hauteur).toBeGreaterThanOrEqual(0.13);
  });
});

describe('le logotype est un TRACÉ, jamais un texte', () => {
  const declinaisons = [
    'logo-omegax.svg',
    'logo-omegax-blanc.svg',
    'logo-omegax-noir.svg',
    'logo-omegax-courant.svg',
    'logo-omegax-vertical.svg',
    'logo-omegax-mot.svg',
    'logo-omegax-mot-courant.svg',
    'logo-omegax-signe.svg',
    'logo-omegax-signe-blanc.svg',
    'logo-omegax-signe-courant.svg',
    'icone.svg',
  ];

  it.each(declinaisons)('%s ne contient ni texte ni nom de police', (nom) => {
    // Une marque composée en texte change de dessin d'un poste à l'autre,
    // selon les polices installées. Aucune des quatorze chartes dépouillées
    // ne l'admet, et rien ne le signalerait : le logo s'afficherait, dans une
    // autre police.
    const svg = lire(join('public', nom));
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('font-family');
  });

  it.each(declinaisons)('%s porte son nom accessible', (nom) => {
    expect(lire(join('public', nom))).toContain('aria-label="OmegaX"');
  });

  it('les quatre rendus autorisés portent chacun leur couleur, et pas une autre', () => {
    expect(lire('public/logo-omegax.svg')).toContain('fill="#142f6b"');
    expect(lire('public/logo-omegax-blanc.svg')).toContain('fill="#ffffff"');
    expect(lire('public/logo-omegax-noir.svg')).toContain('fill="#000000"');
    expect(lire('public/logo-omegax-courant.svg')).toContain('fill="currentColor"');
  });

  it('le composant sert des tracés, pas des images', () => {
    // Servi en `<img>`, le signe ne suivrait ni la couleur héritée, ni le
    // mode sombre, ni l'impression d'un état.
    const logo = lire('src/components/chrome/Logo.tsx');
    expect(logo).toContain('fill="currentColor"');
    // Pas de `src=` : c'est ce qui distingue un tracé en ligne d'une image
    // servie. Chercher « <img » attraperait la prose du commentaire d'en-tête.
    expect(logo).not.toContain('src=');
  });
});

describe('le bloc garde ses trois nombres', () => {
  it('le signe monte à 1,12 fois la hauteur de capitale', () => {
    // À 1,00 il se lit comme une septième lettre du mot ; à 1,25 il l'écrase.
    const [, , , hBloc] = boite('BLOC_BOITE');
    const CAP = 698;
    const DESCENDANTE = 212; // la queue du « g »
    expect(hBloc).toBeCloseTo(CAP * 1.12 + DESCENDANTE, 0);
  });

  it("le mot ne s'écrit jamais en capitales forcées", () => {
    // Les capitales effacent la capitale interne du X, seule particularité du
    // nom, et donnent au mot l'allure d'un acronyme.
    for (const fichier of ['src/pages/AuthPage.tsx', 'src/components/chrome/AppShell.tsx']) {
      expect(lire(fichier)).not.toContain('>OMEGAX<');
    }
  });
});

describe("la marque est employée là où l'identité se joue", () => {
  it("le bandeau de l'espace de travail porte le signe", () => {
    expect(lire('src/components/chrome/AppShell.tsx')).toContain('SymboleOmegaX');
  });

  it("l'écran d'ouverture porte le LOGOTYPE, pas le nom composé", () => {
    expect(lire('src/pages/AuthPage.tsx')).toContain('LogotypeOmegaX');
  });

  it('la boîte « À propos » porte le bloc complet', () => {
    expect(lire('src/components/chrome/AProposModale.tsx')).toContain('BlocMarqueOmegaX');
  });

  it("le nom COMPOSÉ l'est dans la police de la marque, jamais dans une autre", () => {
    // Sous 14 px le tracé s'empâte et cède la place au nom composé. Composé
    // dans la police du système, il changerait de dessin d'un poste à
    // l'autre · exactement ce que le tracé sert à éviter.
    expect(lire('src/components/chrome/AppShell.tsx')).toContain('font-marque');
    expect(lire('tailwind.config.js')).toContain("marque: ['\"IBM Plex Sans\"'");
  });
});

describe('les polices sont servies depuis notre origine, licence comprise', () => {
  const POLICES = [
    'ibm-plex-sans-latin-400-normal.woff2',
    'ibm-plex-sans-latin-500-normal.woff2',
    'ibm-plex-sans-latin-600-normal.woff2',
    'ibm-plex-sans-latin-ext-400-normal.woff2',
    'ibm-plex-sans-latin-ext-500-normal.woff2',
    'ibm-plex-sans-latin-ext-600-normal.woff2',
    'ibm-plex-mono-latin-400-normal.woff2',
    'ibm-plex-mono-latin-500-normal.woff2',
    'ibm-plex-mono-latin-ext-400-normal.woff2',
    'ibm-plex-mono-latin-ext-500-normal.woff2',
  ];

  it.each(POLICES)('%s est présente', (nom) => {
    expect(existsSync(join(racine, 'public', 'polices', nom))).toBe(true);
  });

  it.each(POLICES)('%s est déclarée dans la feuille de style', (nom) => {
    // Une police livrée mais jamais déclarée est du poids mort ; une police
    // déclarée mais absente retombe en silence sur la pile système, et le
    // texte reste lisible · personne ne le remarque.
    expect(lire('src/index.css')).toContain(`/polices/${nom}`);
  });

  it("la licence part avec les fichiers de fonte · c'est une obligation de l'OFL", () => {
    // L'OFL autorise la redistribution du FICHIER de fonte à condition que la
    // licence l'accompagne. Rien ne le vérifie au déploiement.
    const ofl = lire('public/polices/OFL.txt');
    expect(ofl).toContain('SIL OPEN FONT LICENSE');
    expect(lire('scripts/fontes/OFL.txt')).toContain('SIL OPEN FONT LICENSE');
  });

  it("aucune police n'est chargée depuis un tiers", () => {
    // L'en-tête `font-src 'self'` du site l'interdirait de toute façon, mais
    // sans erreur visible : la police tomberait, le texte s'afficherait dans
    // la pile de repli, et la charte serait fausse sans que rien ne le dise.
    const css = lire('src/index.css');
    expect(css).not.toMatch(/@import\s+url\(['"]?https?:/);
    expect(css).not.toContain('fonts.googleapis.com');
    expect(lire('index.html')).not.toContain('fonts.googleapis.com');
    expect(lire('firebase.json')).toContain("font-src 'self'");
  });

  it("le sous-ensemble latin-ext est chargé · le français a besoin du Ÿ", () => {
    // Le sous-ensemble « latin » d'IBM Plex ne porte pas le Ÿ (L'HAŸ, AŸ en
    // capitales). Sans latin-ext, il tomberait dans une police de repli au
    // milieu d'un mot, sans que rien ne le signale.
    expect(lire('src/index.css')).toContain('ibm-plex-sans-latin-ext-400-normal.woff2');
  });
});

describe('la charte existe et pose ses rubriques', () => {
  const charte = lire('../docs/charte-omegax.md');

  it('les rubriques canoniques y sont', () => {
    for (const rubrique of [
      'Zone de protection',
      'Taille minimale',
      'Couleurs',
      'Usages interdits',
      'Typographie',
      'Cosignature',
    ]) {
      expect(charte).toContain(rubrique);
    }
  });

  it('la taille minimale est donnée pour l’écran ET pour l’impression', () => {
    expect(charte).toContain('16 px');
    expect(charte).toContain('mm');
  });

  it('les rapports de contraste sont PUBLIÉS, pas promis', () => {
    // Une charte qui dit « contraste suffisant » sans le chiffrer n'est pas
    // opposable : personne ne peut vérifier une couleur qu'on lui propose.
    expect(charte).toContain('12,74');
    expect(charte).toContain(':1');
  });

  it('elle nomme la licence des polices et sa portée', () => {
    expect(charte).toContain('SIL Open Font License');
  });
});
