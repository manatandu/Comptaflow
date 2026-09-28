import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { POLITIQUE_INTERFACE } from './modules/sur-site/interface-sur-site';

/**
 * LA CONFIGURATION DIT CE QUI EST · audit final F264 (le renvoi de la clé
 * publique relève de F199, les scripts de F263).
 *
 * Quatre fichiers que personne ne relit parce qu'ils « marchent » : le nom et
 * la description du paquet (« sycebnl-suite », « MVP SYCEBNL » sur un
 * logiciel qui sert les deux référentiels), la politique de sécurité du site
 * (une adresse Cloud Run qu'aucun appel n'atteint plus depuis le relais
 * /api), le modèle de variables d'environnement (deux variables de licence
 * qu'aucun code ne lit) et un renvoi vers une section de documentation qui
 * n'existe pas. Aucun ne casse rien en silence · chacun trompe celui qui le
 * lit pour savoir comment le logiciel est monté. Les tests gèlent la valeur
 * ou la structure, jamais l'absence d'un mot.
 */

const RACINE = join(__dirname, '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/** Le texte sans ses commentaires · un nom cité dans un commentaire n'est pas lu. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function fichiersTs(dossier: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersTs(chemin));
    else if (nom.endsWith('.ts') && !nom.endsWith('.spec.ts')) trouves.push(chemin);
  }
  return trouves;
}

describe('le paquet porte le nom du logiciel', () => {
  const paquet = JSON.parse(lire('package.json'));
  const verrou = JSON.parse(lire('package-lock.json'));

  it('il s’appelle OmegaX, et le verrou le dit aux deux endroits où npm l’écrit', () => {
    expect(paquet.name).toBe('omegax');
    expect(verrou.name).toBe(paquet.name);
    expect(verrou.packages[''].name).toBe(paquet.name);
  });

  it('sa description nomme les deux référentiels qu’il sert', () => {
    expect(paquet.description).toContain('SYCEBNL');
    expect(paquet.description).toContain('SYSCOHADA');
  });
});

describe('la politique de sécurité du site ne s’ouvre qu’à sa propre origine', () => {
  const csp = (JSON.parse(lire('client/firebase.json')).hosting.headers as { headers: { key: string; value: string }[] }[])
    .flatMap((r) => r.headers)
    .find((h) => h.key === 'Content-Security-Policy')!.value;

  it('connect-src vaut self et rien d’autre · l’API est servie sous /api depuis le 2026-09-26', () => {
    const connexion = csp
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d.startsWith('connect-src'));
    expect(connexion).toEqual(["connect-src 'self'"]);
  });

  it('elle est celle de l’interface servie sur site · une seule politique pour un seul client', () => {
    expect(csp).toBe(POLITIQUE_INTERFACE);
  });
});

describe('le modèle de variables d’environnement ne présente que ce que le code lit', () => {
  const lu = [...fichiersTs(join(RACINE, 'src')).map((f) => readFileSync(f, 'utf8')), lire('prisma/schema.prisma')]
    .map(sansCommentaires)
    .join('\n');
  const declarees = lire('.env.example')
    .split('\n')
    .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter((v): v is string => !!v);

  it('le modèle déclare encore des variables · sinon ce test ne vérifie rien', () => {
    expect(declarees).toEqual(expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET', 'SMTP_HOST']));
  });

  it('chaque variable déclarée est lue hors commentaire par le serveur ou le schéma', () => {
    const jamaisLues = declarees.filter((v) => !new RegExp(`\\b${v}\\b`).test(lu));
    expect(jamaisLues).toEqual([]);
  });

  it('une variable citée dans un commentaire ne compte pas comme lue', () => {
    // Le cas qui a laissé vivre le défaut · licence.service.ts cite encore la
    // variable du heartbeat dans sa documentation, sans jamais la lire.
    const lecture = sansCommentaires("/** VAR_A */\nconst x = 'https://a'; // VAR_B\nconst y = process.env.VAR_C;");
    expect(lecture).not.toMatch(/VAR_A|VAR_B/);
    expect(lecture).toContain('process.env.VAR_C');
    expect(lecture).toContain("'https://a'");
  });
});

describe('les renvois vers la fiche d’installation nomment une section qui existe', () => {
  it('la clé publique renvoie à un titre de docs/installation-sur-site.md', () => {
    const source = lire('src/modules/sur-site/cle-publique-editeur.ts').replace(/\n\s*\*\s?/g, ' ');
    const fiche = lire('docs/installation-sur-site.md');
    const renvois = [...source.matchAll(/docs\/installation-sur-site\.md, § (\d+) « ([^»]+?) »/g)];
    expect(renvois.length).toBeGreaterThan(0);
    for (const [, numero, titre] of renvois) {
      expect(fiche).toMatch(new RegExp(`^## ${numero}\\. ${titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
  });
});

describe('les scripts de scripts/ prennent leurs chemins en argument (audit final F263)', () => {
  // Les scripts de l'audit des citations lisaient et écrivaient dans le
  // répertoire temporaire de la session qui les avait écrits, et le
  // rapprochement lisait les compétences sous le chemin propre à un poste ·
  // hors de cette session, tous tombaient au premier `open`. On lit le CODE
  // (docstrings et commentaires retirés) · un littéral de chemin absolu vers
  // un répertoire de poste ne doit plus y figurer.
  const scripts = readdirSync(join(RACINE, 'scripts')).filter((n) => n.endsWith('.py'));

  it('le recensement trouve les scripts des citations · sinon ce test ne vérifie rien', () => {
    expect(scripts).toEqual(expect.arrayContaining(['index-citations-lot-b.py', 'rapprocher-citations.py']));
  });

  it('aucun ne porte un chemin absolu de poste dans son code', () => {
    const fautifs = scripts.filter((nom) => {
      const code = lire(`scripts/${nom}`)
        .replace(/"""[\s\S]*?"""/g, '')
        .replace(/#.*$/gm, '');
      return /['"]\/(?:tmp|root|home)\//.test(code);
    });
    expect(fautifs).toEqual([]);
  });
});

describe('bootstrap.ts · chaque commentaire de documentation précède sa déclaration', () => {
  const source = lire('src/bootstrap.ts');

  it('aucun commentaire de documentation n’en suit un autre sans déclaration entre les deux', () => {
    expect(source).not.toMatch(/\*\/\s*\/\*\*/);
  });

  it('configurerApplication porte le sien, retirerPrefixeApi aussi', () => {
    const avant = (declaration: string) => {
      const i = source.indexOf(declaration);
      // L'ouverture en tête de ligne · « /api/** » dans le texte ne compte pas.
      return source.slice(source.lastIndexOf('\n/**', i), i);
    };
    expect(avant('export function configurerApplication')).toContain('Configuration commune de l');
    expect(avant('export function retirerPrefixeApi')).toContain("L'API SOUS L'ADRESSE DU SITE");
  });
});
