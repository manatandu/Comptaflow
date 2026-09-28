import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { libelleExercice } from './libelle-exercice';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * UN EXERCICE, UN LIBELLÉ (audit final F250).
 *
 * La barre de titre écrivait l'année de début, le sélecteur de la barre de
 * statut « début-fin » · sur un premier exercice de dix-huit mois, le même
 * écran annonçait deux exercices. La règle vit une fois
 * (`lib/libelle-exercice.ts`), et ce spec gèle les APPELS des trois endroits
 * du chrome qui l'affichent, lus sur la source faute de monter React · un
 * endroit qui reprendrait sa propre écriture perdrait l'appel figé ici.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');

describe('le libellé d’un exercice', () => {
  it('un exercice de l’année civile se lit sur son année', () => {
    expect(libelleExercice({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' })).toBe('2026');
  });

  it('un exercice à cheval sur deux années se lit « début-fin » · AUDCIF art. 7, premier exercice long', () => {
    expect(libelleExercice({ dateDebut: '2026-07-01T00:00:00.000Z', dateFin: '2027-12-31T00:00:00.000Z' })).toBe('2026-2027');
  });

  it('l’année se lit en UTC · un exercice ouvert à minuit UTC le 1er janvier reste de son année', () => {
    // Le fuseau d'un processus se fixe à son démarrage (CLAUDE.md, audit
    // final F81) · l'heure locale d'un poste à cinq heures à l'ouest de
    // Greenwich est simulée sur la seule lecture de l'année locale, qu'une
    // écriture fautive emprunterait. Lue ainsi, l'ouverture du 1er janvier
    // 2026 à minuit UTC tombe en 2025.
    const origine = Date.prototype.getFullYear;
    Date.prototype.getFullYear = function (this: Date) {
      return origine.call(new Date(this.getTime() - 5 * 3_600_000));
    };
    try {
      expect(libelleExercice({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' })).toBe('2026');
    } finally {
      Date.prototype.getFullYear = origine;
    }
  });
});

describe('le chrome l’appelle aux trois endroits où il affiche l’exercice', () => {
  it('la barre de titre', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    expect(shell).toContain("import { libelleExercice } from '../../lib/libelle-exercice';");
    expect(shell).toContain('const exerciceAffiche = exerciceCourant ? libelleExercice(exerciceCourant) : null;');
    // Le bloc de la barre de titre, de son commentaire au bouton de déconnexion.
    const barre = shell.slice(shell.indexOf('Barre de titre ·'), shell.indexOf('Déconnexion\n'));
    expect(barre).toContain('Exercice {exerciceAffiche}');
  });

  it('le sélecteur de la barre de statut, libellé seul et chaque option de la liste', () => {
    const selecteur = lire('components/chrome/SelecteurExercice.tsx');
    expect(selecteur).toContain("import { libelleExercice } from '../../lib/libelle-exercice';");
    expect(selecteur).toContain('· Exercice {libelleExercice(exerciceCourant)}');
    const liste = selecteur.slice(selecteur.indexOf('{exercices.map((e) => ('), selecteur.indexOf('</select>'));
    expect(liste).toContain('{libelleExercice(e)}');
  });

  it('l’accueil, qui l’affiche sous la barre de titre', () => {
    const accueil = lire('pages/AccueilPage.tsx');
    expect(accueil).toContain('const exerciceAffiche = exerciceCourant ? libelleExercice(exerciceCourant) : null;');
    expect(accueil).toContain("<dd>{exerciceAffiche ?? 'Aucun'}</dd>");
  });
});

/**
 * AUCUN FICHIER NE COMPOSE L'EXERCICE À LA MAIN (audit final F250, complété).
 *
 * Le chrome réglé, dix écrans (états, notes, registre des donateurs, documents
 * obligatoires, régularisations, devises), un message, les noms par défaut
 * des liasses, le sélecteur du groupe, le plan fiscal dégressif et l'assistant
 * de création écrivaient encore l'année de DÉBUT (ou de clôture), à l'heure
 * du poste · « Exercice 2026 » sur un premier exercice du 1er juillet 2026 au
 * 31 décembre 2027, sous une barre de titre qui dit « 2026-2027 ».
 *
 * Ce qui est refusé est la FORME de la composition, lue sur la source · une
 * année tirée d'un champ `dateDebut…` ou `dateFin…` par `getFullYear`,
 * `getUTCFullYear`, ses quatre premiers caractères ou le premier segment d'un
 * `split('-')`, directement ou par la variable qui tient la date. Seul le
 * porteur l'écrit. Une date qui ne serait pas celle d'un exercice (une
 * convention, un contrat) et dont on voudrait l'année s'inscrit ci-dessous
 * avec sa raison, jamais en assouplissant le motif.
 */

// `CLIENT` est déjà `client/src` (lib/..), d'où les chemins lus plus haut.
const RACINE = CLIENT;
const PORTEUR = 'lib/libelle-exercice.ts';

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    // Les specs construisent des jeux d'essai et citent les formes fautives ·
    // ce ne sont pas des écrans.
    return /\.tsx?$/.test(nom) && !/\.spec\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

// Un champ de date d'exercice, nu ou au bout d'une chaîne d'accès
// (`exerciceCourant.dateDebut`, `ex?.dateFin`, `form.dateDebutExercice`).
const DATE = String.raw`\b(?:[\w$]+!?\??\.)*date(?:Debut|Fin)\w*`;
const FORMES_DIRECTES = [
  new RegExp(String.raw`new Date\(\s*${DATE}\s*\)\s*\.\s*get(?:UTC)?FullYear\(\s*\)`, 'g'),
  new RegExp(String.raw`${DATE}\s*\??\.\s*(?:slice|substring|substr)\(\s*0\s*,\s*4\s*\)`, 'g'),
  new RegExp(String.raw`${DATE}\s*\??\.\s*split\(\s*['"]-['"]\s*\)\s*\[\s*0\s*\]`, 'g'),
];
// La même lecture en deux temps · la date d'exercice tenue par une variable,
// dont l'année est lue ensuite. Le lien est le NOM de la variable, pas la
// place des deux instructions dans le fichier.
const LIAISON = new RegExp(String.raw`\b(?:const|let|var)\s+([\w$]+)\s*=\s*new Date\(\s*${DATE}\s*\)`, 'g');

/** Chaque composition à la main d'une année d'exercice dans une source. */
function compositions(source: string): string[] {
  const trouvees = FORMES_DIRECTES.flatMap((motif) => [...source.matchAll(motif)].map((m) => m[0]));
  for (const liaison of source.matchAll(LIAISON)) {
    const nom = liaison[1].replace(/\$/g, '\\$');
    const lecture = new RegExp(String.raw`(?<![\w$.])${nom}\s*\.\s*get(?:UTC)?FullYear\(\s*\)`);
    if (lecture.test(source)) trouvees.push(`${liaison[0]} puis ${liaison[1]}.getFullYear()`);
  }
  return trouvees;
}

/**
 * Les écritures admises, fichier par fichier, chacune avec sa raison. Une
 * ligne ne vaut que tant que le fichier compose encore · sinon elle s'efface.
 */
const ADMISES: Record<string, string> = {
  // `titreColonne` titre les colonnes d'un état comparatif (États
  // personnalisés, Simulateur budgétaire). Un exercice non civil y porte ses
  // DEUX DATES, pas « début-fin » · côte à côte, un premier exercice de neuf
  // mois ne doit pas se lire comme une année pleine (comparabilité, AUDCIF
  // art. 34 et SYCEBNL art. 16, 7°). Un exercice civil s'y lit sur son année,
  // comme ici.
  'lib/etats-personnalises.ts': 'colonne comparative · les dates exactes d’un exercice non civil',
  // `periodesDeLExercice` (sorti de la saisie et lu en UTC depuis) découpe
  // l'exercice en MOIS de saisie (« Janvier 2027 ») · l'année y nomme un mois,
  // pas l'exercice, et un premier exercice de dix-huit mois doit bien y
  // montrer ses deux années.
  'lib/mois-de-l-exercice.ts': 'mois de saisie · l’année nomme le mois, pas l’exercice',
};

/** Les appels qui ont remplacé l'écriture à la main, fichier par fichier. */
const APPELS: Record<string, string> = {
  'pages/EtatsFinanciersPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/EtatsFinanciersSyscohadaPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/EtatsSmtPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/EtatsSmtSyscohadaPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/NotesAnnexesPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/NotesAnnexesSyscohadaPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/RegistreDonateursPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/DocumentsObligatoiresPage.tsx': 'Exercice {libelleExercice(exerciceCourant)}',
  'pages/RegularisationPage.tsx': 'Exercice {libelleExercice(ex)}',
  'pages/DevisesPage.tsx': 'Exercice {libelleExercice(ex)}',
  'pages/ImmobilisationsPage.tsx': "passée pour l'exercice ${libelleExercice(exerciceCourant)}.",
  'pages/GroupePage.tsx': '{libelleExercice(e)}',
  'components/PlanFiscalDegressif.tsx': '{libelleExercice(l)}',
  'components/NouveauFichierWizard.tsx':
    "l'exercice {libelleExercice({ dateDebut: form.dateDebutExercice, dateFin: form.dateFinExercice })} sont",
};

describe('aucun fichier ne compose le libellé d’un exercice à la main', () => {
  const fichiers = new Map(sources(RACINE).map((c) => [c.slice(RACINE.length + 1), readFileSync(c, 'utf8')]));

  it('le recensement lit les fichiers visés, et le motif reconnaît chaque forme', () => {
    // Un garde-fou qui ne lit plus rien, ou dont le motif ne reconnaît plus
    // rien, passe sans rien vérifier.
    for (const f of [PORTEUR, ...Object.keys(APPELS), ...Object.keys(ADMISES)]) expect([f, fichiers.has(f)]).toEqual([f, true]);
    expect(compositions(fichiers.get(PORTEUR)!)).toHaveLength(2);
    expect(compositions('Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}')).toHaveLength(1);
    expect(compositions('`${new Date(l.dateFin).getUTCFullYear()}`')).toHaveLength(1);
    expect(compositions('{exerciceCourant?.dateDebut.slice(0, 4)}')).toHaveLength(1);
    expect(compositions("{form.dateDebutExercice.split('-')[0]}")).toHaveLength(1);
    expect(compositions('const d = new Date(ex.dateFin);\nconst libelle = `Exercice ${d.getFullYear()}`;')).toHaveLength(1);
    // Une date lue au jour, pour un champ de saisie, n'est pas une année.
    expect(compositions('min={exerciceCourant?.dateDebut.slice(0, 10)}')).toEqual([]);
  });

  it('chaque endroit corrigé appelle la fonction unique', () => {
    for (const [f, appel] of Object.entries(APPELS)) {
      const source = fichiers.get(f)!;
      expect([f, source.includes("import { libelleExercice } from '../lib/libelle-exercice';")]).toEqual([f, true]);
      expect([f, source.includes(appel)]).toEqual([f, true]);
    }
  });

  it('seul le porteur lit l’année sur une date d’exercice', () => {
    const fautifs = [...fichiers]
      .filter(([f]) => f !== PORTEUR && !(f in ADMISES))
      .flatMap(([f, source]) => compositions(source).map((c) => `${f} · ${c}`));
    expect(fautifs).toEqual([]);
  });

  it('une écriture admise compose encore, sinon sa ligne s’efface', () => {
    for (const f of Object.keys(ADMISES)) expect([f, compositions(fichiers.get(f)!).length > 0]).toEqual([f, true]);
  });
});
