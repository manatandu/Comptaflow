import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative } from 'path';

/**
 * LE TIRET CADRATIN, RELU SUR LE DÉPÔT ENTIER (CLAUDE.md § 4, audit final F202).
 *
 * La règle disait « le dépôt en est nettoyé » et rien ne le vérifiait. L'audit
 * final en a trouvé dans deux commentaires du serveur, un document de 13
 * occurrences, un script et une table engendrée, ces deux derniers sans que
 * le § 4 les déclare. Les gardes qui existaient ne relisaient qu'un état ou
 * un écran chacune, jamais le reste.
 *
 * Ce spec relit tout fichier texte du dépôt (code, documents, workflows,
 * migrations, scripts) et confronte ce qu'il trouve à une liste FERMÉE, avec
 * le nombre EXACT d'occurrences par fichier · un caractère de plus dans un
 * fichier admis tombe comme un caractère dans un fichier qui ne l'est pas, et
 * une exception qui ne porte plus le caractère tombe aussi, pour être retirée
 * ici et au § 4. Le caractère est écrit échappé dans ce fichier, sans quoi
 * il s'y réintroduirait.
 */
const CADRATIN = '\u2014';
const RACINE = join(__dirname, '..', '..');

/**
 * Chaque exception, son nombre exact, et le nom sous lequel le § 4 la déclare.
 * `nombreImprime` · le § 4 imprime aussi ce nombre (« `…` en porte N »),
 * et il se relit comme le fichier.
 */
const EXCEPTIONS: Record<
  string,
  { occurrences: number; nomAuParagraphe4: string; motif: string; nombreImprime?: true }
> = {
  'prisma/migrations/20260829033943_retire_cadratins/migration.sql': {
    occurrences: 39,
    nomAuParagraphe4: '20260829033943_retire_cadratins',
    motif: 'la migration qui remplace le caractère en base le porte comme donnée ; appliquée, elle ne se modifie plus',
  },
  'src/modules/controles/regles-comptes-sycebnl.ts': {
    // 173 caractères sur 97 lignes · le « 97 » que le § 4 écrivait jusqu'au
    // 2026-09-28 comptait les lignes, pas les caractères.
    occurrences: 173,
    nomAuParagraphe4: 'regles-comptes-sycebnl.ts',
    nombreImprime: true,
    motif: 'table engendrée, transcription verbatim du SYCEBNL',
  },
  'src/modules/controles/regles-comptes-syscohada.ts': {
    occurrences: 3,
    nomAuParagraphe4: 'regles-comptes-syscohada.ts',
    nombreImprime: true,
    motif: 'table engendrée, transcription verbatim de l’AUDCIF Titre VII',
  },
  'src/modules/controles/regles-comptes.spec.ts': {
    occurrences: 1,
    nomAuParagraphe4: 'regles-comptes.spec.ts',
    motif: 'le test qui gèle mot pour mot une citation du SYCEBNL',
  },
  'src/modules/questionnaire/catalogue-questionnaire.ts': {
    occurrences: 2,
    nomAuParagraphe4: 'catalogue-questionnaire.ts',
    motif: 'item CPCC-PRO-5, impératif du séminaire cité tel qu’il est écrit',
  },
  'src/modules/questionnaire/questionnaire.spec.ts': {
    occurrences: 1,
    nomAuParagraphe4: 'questionnaire.spec.ts',
    motif: 'le test qui gèle mot pour mot la citation de CPCC-PRO-5',
  },
  'scripts/extraire-schemas-guides.cjs': {
    occurrences: 2,
    nomAuParagraphe4: 'scripts/extraire-schemas-guides.cjs',
    motif: 'deux motifs qui reconnaissent le séparateur des titres des guides d’application',
  },
  'CLAUDE.md': {
    occurrences: 3,
    nomAuParagraphe4: 'ce fichier-ci',
    motif: 'la règle qui montre le caractère pour l’interdire, et les citations qui le reprennent',
  },
};

/**
 * CE QUI N'EST PAS UNE EXCEPTION ET RESTE À ÉCHAPPER · des specs des états
 * financiers SYCEBNL écrivent le caractère EN CLAIR dans leur propre garde
 * (`not.toContain(...)`), là où leurs voisines l'écrivent échappé. Hors du
 * périmètre de la passe qui a posé ce spec (audit final F202), ils sont
 * NOMMÉS ici plutôt que tolérés en silence · et chacun doit encore porter
 * exactement son nombre, si bien que le jour où l'un d'eux est échappé, ce
 * spec tombe pour qu'on retire sa ligne. Une liste de manques qui ne se relit pas
 * vieillit.
 */
const RESTENT_A_ECHAPPER: Record<string, number> = {
  'src/modules/etats-financiers/correspondance-smt.spec.ts': 3,
  'src/modules/etats-financiers/correspondance-tft.spec.ts': 3,
  'src/modules/etats-financiers/correspondance-projet-emplois-ressources.spec.ts': 4,
};

/**
 * Ce qui n'est pas du dépôt · les dossiers que `.gitignore` écarte (dépendances,
 * constructions, sorties de Playwright), `.git`, et les copies de travail que
 * `.claude/worktrees` peut héberger, qui reproduiraient chaque exception.
 */
const DOSSIERS_IGNORES = new Set(['.git', 'node_modules', 'dist', 'dist-e2e', 'test-results', 'playwright-report', '__pycache__', 'coverage']);
const CHEMINS_IGNORES = new Set(['.claude/worktrees']);
/** Fichiers binaires ou locaux · une police ou une image peut contenir la suite d'octets par hasard. */
const EXTENSIONS_IGNOREES = new Set(['.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.xlsx', '.docx', '.zip', '.exe', '.tsbuildinfo', '.log']);
const FICHIERS_IGNORES = new Set(['.env', '.env.local']);

function fichiersDuDepot(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    const rel = relative(RACINE, chemin).split('\\').join('/');
    if (statSync(chemin).isDirectory()) {
      return DOSSIERS_IGNORES.has(nom) || CHEMINS_IGNORES.has(rel) ? [] : fichiersDuDepot(chemin);
    }
    return EXTENSIONS_IGNOREES.has(extname(nom).toLowerCase()) || FICHIERS_IGNORES.has(nom) ? [] : [rel];
  });
}

const occurrences = (texte: string) => texte.split(CADRATIN).length - 1;

/** Le § 4 de CLAUDE.md, de son titre au titre du § 5. */
function paragraphe4(): string {
  const reglement = readFileSync(join(RACINE, 'CLAUDE.md'), 'utf8');
  const debut = reglement.indexOf('## 4. Ce qui est interdit');
  const fin = reglement.indexOf('## 5. ', debut);
  if (debut < 0 || fin < 0) throw new Error('§ 4 introuvable dans CLAUDE.md');
  return reglement.slice(debut, fin);
}

describe('tiret cadratin · le dépôt entier contre la liste fermée du § 4', () => {
  const fichiers = fichiersDuDepot(RACINE);
  const trouves: Record<string, number> = {};
  for (const f of fichiers) {
    const texte = readFileSync(join(RACINE, f), 'utf8');
    // Un fichier qui porte un octet nul n'est pas du texte · une extension
    // binaire oubliée ne doit pas faire lire une image comme un commentaire.
    if (texte.includes('\u0000')) continue;
    const n = occurrences(texte);
    if (n > 0) trouves[f] = n;
  }

  it('le relevé lit encore le dépôt · un parcours vide ne vérifierait rien', () => {
    expect(fichiers.length).toBeGreaterThan(1000);
    expect(fichiers).toContain('CLAUDE.md');
    expect(fichiers).toContain('src/modules/import/lecture-fichier.ts');
    expect(fichiers).toContain('scripts/extraire-schemas-guides.cjs');
    expect(fichiers.some((f) => f.startsWith('docs/'))).toBe(true);
    expect(fichiers.some((f) => f.startsWith('.github/workflows/'))).toBe(true);
  });

  it('seules les exceptions déclarées portent le caractère, chacune son nombre exact', () => {
    const attendus: Record<string, number> = { ...RESTENT_A_ECHAPPER };
    for (const [f, e] of Object.entries(EXCEPTIONS)) attendus[f] = e.occurrences;
    expect(trouves).toEqual(attendus);
  });

  it('les deux commentaires relevés par l’audit sont écrits sans lui', () => {
    for (const f of ['src/modules/import/lecture-fichier.ts', 'src/common/cloisonnement/extension-cloisonnement.ts']) {
      expect({ f, n: occurrences(readFileSync(join(RACINE, f), 'utf8')) }).toEqual({ f, n: 0 });
    }
  });

  it('chaque exception est déclarée au § 4 de CLAUDE.md, sous le nom qu’elle y porte', () => {
    const texte = paragraphe4();
    for (const [f, e] of Object.entries(EXCEPTIONS)) {
      expect({ f, declare: texte.includes(e.nomAuParagraphe4) }).toEqual({ f, declare: true });
    }
    // Le § 4 nomme aussi le spec qui le tient, pour qu'on sache où ajouter
    // une exception le jour où il en faut une.
    expect(texte).toContain('cadratins.spec.ts');
  });

  it('le nombre que le § 4 imprime pour une table engendrée est celui du fichier', () => {
    // Le § 4 écrivait « 97 » pour la table SYCEBNL, qui en porte 173 · il
    // comptait les lignes (audit final F202). Un nombre imprimé dans le
    // règlement se relit comme le fichier qu'il décrit, sans quoi il vieillit.
    const texte = paragraphe4().replace(/\s+/g, ' ');
    for (const [f, e] of Object.entries(EXCEPTIONS)) {
      if (!e.nombreImprime) continue;
      const nom = e.nomAuParagraphe4.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imprime = texte.match(new RegExp(`${nom}\` en porte (\\d+)`))?.[1];
      expect({ f, imprime: Number(imprime) }).toEqual({ f, imprime: e.occurrences });
    }
  });

  it('une exception engendrée ne se corrige pas à la main · son en-tête le dit', () => {
    for (const f of ['src/modules/controles/regles-comptes-sycebnl.ts', 'src/modules/controles/regles-comptes-syscohada.ts']) {
      const texte = readFileSync(join(RACINE, f), 'utf8');
      expect({ f, engendre: texte.includes('FICHIER ENGENDRÉ'), verbatim: texte.includes('VERBATIM') }).toEqual({
        f,
        engendre: true,
        verbatim: true,
      });
    }
  });
});
