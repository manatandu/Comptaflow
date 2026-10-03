import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  LISTES_DE_COMPTES,
  PARAMETRE_RETENUS,
  ROUTES_QUI_NE_SONT_PAS_DES_LISTES,
} from '../../../src/modules/comptes/listes-de-comptes';
import { RETENUS } from './comptes-proposes';
import { adresseContrepartiesAdmises } from './regle-par';

// Aucun import de « vitest » · convention du dépôt.

/**
 * COMPTES RETENUS À L'ÉCRAN · décision de Manasse du 2026-09-28 (CLAUDE.md,
 * « Comptes retenus »). Toute LISTE DE CHOIX de comptes ne propose que les
 * comptes retenus et ceux déjà utilisés ; c'est le serveur qui applique la
 * règle, sur `retenus=true`.
 *
 * CE SPEC NE TIENT AUCUNE LISTE D'ÉCRANS. Il relit CHAQUE appel `api.get` du
 * client, quelle que soit la forme de l'adresse (littéral, gabarit, variable),
 * et juge ceux qui servent des comptes · par la ROUTE, lue dans la table du
 * serveur (`src/modules/comptes/listes-de-comptes.ts`, source unique, que
 * `comptes-proposes.spec.ts` confronte aux contrôleurs), ou par le TYPE de la
 * réponse quand l'adresse ne se lit pas. Un écran nouveau qui lit des comptes
 * sans la règle tombe ici sans que personne n'ait à l'inscrire ; une route
 * nouvelle de comptes tombe côté serveur tant qu'elle n'est pas rangée.
 *
 * Les seules lectures du plan ENTIER sont dans `EXCEPTIONS`, liste FERMÉE,
 * chacune avec son motif · une exception qui ne correspond plus à aucun appel
 * fait tomber le spec, pour qu'on retire sa ligne.
 */

const RACINE = join(__dirname, '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

interface AppelGet {
  fichier: string;
  type: string;
  argument: string;
  /**
   * L'adresse LUE quand l'argument est un identifiant posé par une constante
   * du même fichier (`const adresse = '/comptes?…'`) · le littéral, sinon
   * l'argument lui-même. C'est elle qu'on juge, jamais le seul type · un type
   * au nom neutre (`Ligne[]`) n'échappe plus au jugement par la route.
   */
  adresse: string;
}

/**
 * La valeur littérale d'une constante locale, ou null. Un nom déclaré plus
 * d'une fois dans le fichier (deux portées) ne se résout pas · la première
 * déclaration masquerait celle que l'appel lit, et l'adresse retombe dans
 * la liste fermée des adresses non lues.
 */
function constanteLocale(src: string, nom: string): string | null {
  const declarations = src.match(new RegExp(`\\b(?:const|let|var)\\s+${nom}\\b`, 'g')) ?? [];
  if (declarations.length !== 1) return null;
  const m = new RegExp(`\\bconst\\s+${nom}\\s*(?::[^=]+)?=\\s*(['"\`])`).exec(src);
  if (!m) return null;
  const debut = m.index + m[0].length - 1;
  const fin = src.indexOf(m[1], debut + 1);
  return fin > debut ? src.slice(debut, fin + 1) : null;
}

/**
 * Chaque `api.get<T>(argument)` d'un source, découpé par équilibrage des
 * chevrons et des parenthèses · une structure, jamais une distance (§ 10).
 * La forme `api\n  .get<T>(…)` d'une chaîne d'appels est comprise.
 */
function appelsGet(fichier: string, src: string): AppelGet[] {
  const appels: AppelGet[] = [];
  const re = /\bapi\s*\.get\b\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let type = '';
    if (src[i] === '<') {
      let profondeur = 0;
      const debut = i;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '<') profondeur++;
        // « => » d'une signature de fonction n'est pas un chevron fermant.
        else if (c === '>' && src[i - 1] !== '=') profondeur--;
        if (profondeur === 0) break;
      }
      type = src.slice(debut + 1, i);
      i++;
    }
    while (/\s/.test(src[i])) i++;
    if (src[i] !== '(') continue;
    let profondeur = 0;
    const debut = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') profondeur++;
      else if (src[i] === ')') profondeur--;
      if (profondeur === 0) break;
    }
    // Le premier argument seul · une virgule de premier niveau le borne.
    const corps = src.slice(debut + 1, i);
    let p = 0;
    let fin = corps.length;
    for (let k = 0; k < corps.length; k++) {
      const c = corps[k];
      if ('([{'.includes(c)) p++;
      else if (')]}'.includes(c)) p--;
      else if (c === ',' && p === 0) {
        fin = k;
        break;
      }
    }
    const argument = corps.slice(0, fin).trim();
    const adresse = /^[A-Za-z_$][\w$]*$/.test(argument) ? (constanteLocale(src, argument) ?? argument) : argument;
    appels.push({ fichier, type: type.trim(), argument, adresse });
  }
  return appels;
}

/** Le chemin d'une adresse littérale, paramètres retirés, `${…}` lu comme un segment ; null pour une variable. */
function cheminDe(argument: string): string | null {
  const m = /^(['"`])([^'"`]*)/.exec(argument);
  if (!m) return null;
  return m[2].replace(/\$\{[^}]*\}/g, ':p').split('?')[0];
}

function correspond(chemin: string, motif: string): boolean {
  const re = new RegExp('^' + motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+') + '$');
  return re.test(chemin);
}

/**
 * Le TYPE qui trahit une liste de comptes quand l'adresse ne se lit pas ·
 * un tableau de `…Compte…`, une contrepartie admise, la réponse des fonds de
 * fin de projet ou des octrois, ou un tableau d'objets réduits à un
 * identifiant et un numéro (avec ou sans intitulé). Un objet qui porte un
 * numéro de pièce ou de licence n'en est pas un.
 */
const TYPE_LISTE_DE_COMPTES =
  /\w*Compte\w*\s*\[\]|Array<\s*\w*Compte|ContrepartieAdmise|ReponseFondsProjet|OctroisDuCompte|\{\s*id\s*:\s*string\s*;\s*numero\s*:\s*string\s*(;\s*intitule\s*:\s*string\s*)?;?\s*\}\s*\[\]|Array<\s*\{\s*id\s*:\s*string\s*;\s*numero\s*:\s*string/;

const demandeLaRegle = (argument: string) => argument.includes('${RETENUS}') || argument.includes(`${PARAMETRE_RETENUS}=true`);

/**
 * LES LECTURES DU PLAN ENTIER · liste FERMÉE. Aucune ne sert une liste de
 * choix · chacune résout un numéro tapé, lit un compte que le TEXTE prescrit
 * ou que le serveur impose, ou est la fenêtre du plan elle-même.
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  "pages/SaisiePage.tsx :: '/comptes?actifsSeuls=true&typeCompte=DETAIL'":
    'plan entier où se résout le numéro TAPÉ (jamais un refus) et où se lisent la contrepartie de trésorerie, la TVA routée et les modèles · la liste de frappe, elle, lit `retenus=true`',
  "pages/InventairePage.tsx :: '/comptes?typeCompte=DETAIL'":
    'plan entier où se résout le numéro TAPÉ d’une fiche, même règle que la saisie · la liste proposée lit `retenus=true`',
  "pages/BrouillardPage.tsx :: '/comptes?typeCompte=DETAIL'":
    'l’édition du brouillard n’offre aucune liste · elle résout un numéro tapé, qu’un plan restreint dirait introuvable à tort',
  "pages/BailleursPage.tsx :: '/comptes'":
    'les comptes DÉJÀ rattachés à un bailleur restent montrés pour être retirés (NOTE 9) · la liste proposée lit `retenus=true`',
  "components/LegsImmobilisations.tsx :: '/comptes?typeCompte=DETAIL'":
    'le 167 et le 4861 du legs sont PRESCRITS tous deux (SYCEBNL Partie 3 ch. 2 § 1.2.2, Guide Application 5), seuls admis par le serveur · le legs en est souvent le premier mouvement, la règle viderait les deux listes',
  "components/AcquisitionPrixAleatoire.tsx :: '/comptes?typeCompte=DETAIL'":
    'la dette de l’acquisition à prix aléatoire est PRESCRITE (1681, AUDCIF Titre VIII ch. 11 § 2.3.1 ; 4811, ch. 2 § 11), seule admise par le serveur · l’acquisition en est presque toujours le premier mouvement, la règle viderait la liste',
  "pages/ExercicePage.tsx :: '/comptes?classe=CLASSE_1&typeCompte=DETAIL'":
    'le 12 est la SEULE destination de l’imputation aux capitaux propres d’ouverture (refus du serveur), comme dans l’affectation du résultat au régime « texte » · au premier exercice, aucun 12 n’est retenu ni mouvementé',
  "pages/ImmobilisationsPage.tsx :: '/comptes?classe=CLASSE_2&typeCompte=DETAIL'":
    'le 29 de la division du bien est le seul admis par le serveur (`motifRefusCompteDepreciation`) et la première dépréciation en est le premier mouvement · même lecture que le 28 servi par `comptesDuBien`',
  "components/PrixGlobalImmobilisations.tsx :: '/immobilisations/comptes-du-bien'":
    'le 21500000 du fonds commercial est ouvert d’office par le serveur pour le reliquat · ce n’est pas un choix',
  'pages/PlanComptesPage.tsx :: `/comptes?usage=true${params}`':
    'la fenêtre Plan comptable elle-même, où le cabinet retient ses comptes · elle lit tout le plan avec son usage',
  'components/ChampReglePar.tsx :: a':
    'adresse construite par `adresseContrepartiesAdmises` (lib/regle-par.ts), qui pose `retenus=true` · vérifié plus bas sur la fonction elle-même',
};

const cle = (a: AppelGet) => `${a.fichier} :: ${a.argument}`;

describe('comptes retenus à l’écran · chaque lecture de comptes, quelle que soit son adresse', () => {
  const sources = fichiers(RACINE).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));
  const appels = sources.flatMap((f) => appelsGet(relative(RACINE, f), readFileSync(f, 'utf8')));

  const nonListes = Object.keys(ROUTES_QUI_NE_SONT_PAS_DES_LISTES);
  const listes = Object.entries(LISTES_DE_COMPTES);

  /** Les appels qui servent des comptes, et la route qui les sert si elle se lit. */
  const appelsDeComptes = appels
    .map((a) => {
      const chemin = cheminDe(a.adresse);
      if (chemin && nonListes.some((r) => correspond(chemin, r))) return null;
      const route = chemin ? listes.find(([r]) => correspond(chemin, r)) : undefined;
      if (route) return { ...a, chemin, regime: route[1].regime, route: route[0] };
      if (TYPE_LISTE_DE_COMPTES.test(a.type)) return { ...a, chemin, regime: null, route: null };
      return null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  it('le recensement trouve les appels, et des lectures de comptes', () => {
    expect(appels.length).toBeGreaterThan(300);
    expect(appelsDeComptes.length).toBeGreaterThan(30);
    // Les trois formes d'adresse sont vues · littéral, gabarit, variable.
    expect(appelsDeComptes.some((a) => a.argument.startsWith("'"))).toBe(true);
    expect(appelsDeComptes.some((a) => a.argument.startsWith('`'))).toBe(true);
    expect(appelsDeComptes.some((a) => a.chemin === null)).toBe(true);
  });

  it('le paramètre de l’écran est celui que le serveur lit', () => {
    expect(RETENUS).toBe(`${PARAMETRE_RETENUS}=true`);
  });

  it('toute lecture de comptes demande la règle, ou figure aux exceptions avec son motif', () => {
    const fautives = appelsDeComptes
      .filter((a) => a.regime !== 'texte')
      .filter((a) => !demandeLaRegle(a.adresse) && !(cle(a) in EXCEPTIONS))
      .map(cle);
    expect(fautives).toEqual([]);
  });

  it('une lecture de comptes typée sur une route que le serveur ne range pas fait tomber le spec', () => {
    // Une adresse lisible mais absente des deux tables du serveur · la route
    // doit y être rangée (liste de choix, ou motif écrit), pas ignorée ici.
    const inconnues = appelsDeComptes.filter((a) => a.chemin !== null && a.route === null).map(cle);
    expect(inconnues).toEqual([]);
  });

  /*
    UN APPEL NON TYPÉ ÉCHAPPERAIT AU JUGEMENT PAR LE TYPE · sur une route que
    le serveur ne range pas et dont l'adresse ne se lit pas, rien ne le
    trahirait. Tout `api.get` porte donc son type, sans exception · le
    serveur, lui, voit ses routes de comptes par leur STRUCTURE
    (`comptes-proposes.spec.ts`, lecture de `compte.findMany`), pas par leur nom.
  */
  it('tout api.get porte le type de sa réponse', () => {
    expect(appels.filter((a) => a.type === '').map(cle)).toEqual([]);
    expect(appelsGet('x.tsx', "await api.get('/fonds');")).toEqual([{ fichier: 'x.tsx', type: '', argument: "'/fonds'", adresse: "'/fonds'" }]);
  });

  it('la liste des exceptions est fermée · chacune vise un appel qui existe encore, avec un motif', () => {
    const vues = new Set(appelsDeComptes.map(cle));
    for (const [exception, motif] of Object.entries(EXCEPTIONS)) {
      expect({ exception, existe: vues.has(exception), motif: motif.length > 40 }).toEqual({ exception, existe: true, motif: true });
    }
  });

  it('chaque route du régime « retenus » est demandée avec la règle par au moins un écran', () => {
    for (const [route, regime] of listes) {
      if (regime.regime !== 'retenus') continue;
      const demandee =
        appelsDeComptes.some((a) => a.route === route && demandeLaRegle(a.adresse)) ||
        // Le « Réglé par » des immobilisations passe par une adresse construite.
        (route === '/immobilisations/contreparties-acquisition' &&
          (adresseContrepartiesAdmises({ compteImmobilisationId: 'x' }) ?? '').includes(RETENUS));
      expect({ route, demandee }).toEqual({ route, demandee: true });
    }
  });

  it('l’adresse construite du « Réglé par » demande la règle', () => {
    expect(adresseContrepartiesAdmises({ compteImmobilisationId: 'c1' })).toContain(RETENUS);
    expect(adresseContrepartiesAdmises({ familleId: 'f1', typeComposant: 'COMPOSANT' })).toContain(RETENUS);
  });

  it('le spec voit un appel à adresse en variable · il le jugerait sans exception', () => {
    const faux = appelsGet('x.tsx', 'const adresse = `/comptes?classe=CLASSE_5`;\nawait api\n  .get<Compte[]>(adresse);');
    expect(faux).toEqual([{ fichier: 'x.tsx', type: 'Compte[]', argument: 'adresse', adresse: '`/comptes?classe=CLASSE_5`' }]);
    expect(TYPE_LISTE_DE_COMPTES.test(faux[0].type)).toBe(true);
    expect(demandeLaRegle(faux[0].adresse)).toBe(false);
  });

  it('une adresse en variable se juge par la ROUTE qu’elle porte, quel que soit le nom du type', () => {
    // Relevé du relecteur · `Ligne[]` sur une adresse en variable passait.
    const [a] = appelsGet('x.tsx', "type Ligne = { id: string; numero: string; intitule: string; classe: string };\nconst adresse = '/comptes?classe=CLASSE_5';\napi.get<Ligne[]>(adresse);");
    expect(TYPE_LISTE_DE_COMPTES.test(a.type)).toBe(false);
    const chemin = cheminDe(a.adresse);
    expect(chemin).toBe('/comptes');
    expect(Object.keys(LISTES_DE_COMPTES).some((r) => correspond(chemin as string, r))).toBe(true);
    expect(demandeLaRegle(a.adresse)).toBe(false);
  });

  it('un nom déclaré deux fois ne se résout pas · l’adresse reste à juger', () => {
    const [, a] = appelsGet(
      'x.tsx',
      "function f() { const adresse = '/comptes?retenus=true'; api.get<L[]>(adresse); }\nfunction g() { const adresse = '/comptes?classe=CLASSE_5'; api.get<L[]>(adresse); }",
    );
    expect(a.adresse).toBe('adresse');
    expect(cheminDe(a.adresse)).toBeNull();
  });

  /*
    UNE ADRESSE QUI NE SE LIT PAS ÉCHAPPE À LA ROUTE · elle ne serait jugée
    que par son type. Toute adresse en variable doit donc se résoudre en
    constante du fichier, ou figurer ici, avec son motif · liste FERMÉE.
  */
  const ADRESSES_NON_LUES: Readonly<Record<string, string>> = {
    'components/ChampReglePar.tsx :: a':
      'construite par `adresseContrepartiesAdmises` (lib/regle-par.ts), qui pose `retenus=true` · vérifié sur la fonction elle-même',
    'components/OrdresVirement.tsx :: cheminListeOrdres(filtre)':
      'la liste des ordres de virement, construite par `cheminListeOrdres` selon le filtre d’état · aucun compte n’y est servi',
    'pages/InventairePage.tsx :: chemin':
      'les trois éditions de l’inventaire (fiches de comptage, procès-verbaux), construites par `cheminEdition` (lib/editions-inventaire.ts) · aucune liste de comptes',
    'pages/SaisiePage.tsx :: urlJournalDeSaisie({ exerciceId: exerciceCourant.id, journalId: journal.id, debut, fin })':
      'les écritures du journal et de la période ouverts dans la saisie, construites par `urlJournalDeSaisie` · aucune liste de comptes',
  };
  it('toute adresse en variable se résout, ou figure à la liste fermée avec son motif', () => {
    const nonLues = appels.filter((a) => cheminDe(a.adresse) === null).map(cle);
    expect(nonLues.sort()).toEqual(Object.keys(ADRESSES_NON_LUES).sort());
    for (const motif of Object.values(ADRESSES_NON_LUES)) expect(motif.length).toBeGreaterThan(40);
  });

  it('le plan comptable lit tout le plan, avec son usage', () => {
    const src = readFileSync(join(__dirname, '../pages/PlanComptesPage.tsx'), 'utf8');
    expect(src).toContain('`/comptes?usage=true${params}`');
    expect(src).toContain("api.post('/comptes/ne-retenir-que-les-utilises'");
  });
});
