import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'INVENTAIRE PHYSIQUE SE MÈNE JUSQU'AU BOUT DEPUIS L'ÉCRAN.
 *
 * Audit de l'interface de 2026-09, B1 · la fenêtre ne proposait que cinq
 * gestes, et chaque étape suivante du serveur en exigeait un qu'elle ne
 * proposait pas : valoriser une fiche avant de rapprocher, composer les
 * sous-commissions avant tout PV, arbitrer chaque écart et compter chaque
 * caisse avant de clore. La campagne restait bloquée sans que rien ne dise
 * pourquoi, puisque les routes existaient.
 *
 * Deux propriétés sont gelées. (1) Chaque route listée est APPELÉE par la
 * page, sous la méthode que le contrôleur déclare. (2) Chaque clé de chaque
 * corps envoyé est une propriété du DTO que le contrôleur lie à la route ·
 * le serveur valide avec `forbidNonWhitelisted`, une clé en trop est un 400
 * et le geste ne passe jamais. Le DTO est LU dans le contrôleur, pas recopié
 * ici · un changement de DTO ne peut pas laisser ce test d'accord avec
 * l'ancien.
 */

const page = readFileSync(join(__dirname, 'InventairePage.tsx'), 'utf8');
const controleur = readFileSync(
  join(__dirname, '../../../src/modules/inventaire/inventaire.controller.ts'),
  'utf8',
);
const dtos = readFileSync(join(__dirname, '../../../src/modules/inventaire/dto/inventaire.dto.ts'), 'utf8');
const bootstrap = readFileSync(join(__dirname, '../../../src/bootstrap.ts'), 'utf8');

type Methode = 'Get' | 'Post' | 'Patch';

/** Les routes du constat B1, telles que le contrôleur les écrit. */
const ROUTES: { methode: Methode; chemin: string }[] = [
  { methode: 'Post', chemin: ':id/sous-commissions' },
  { methode: 'Post', chemin: 'sous-commissions/:sousCommissionId/membres' },
  { methode: 'Post', chemin: ':id/fiches' },
  { methode: 'Patch', chemin: 'fiches/:ficheId' },
  { methode: 'Get', chemin: 'ecarts/:ecartId/proposition' },
  { methode: 'Patch', chemin: 'ecarts/:ecartId' },
  { methode: 'Get', chemin: ':id/caisses-non-comptees' },
  { methode: 'Post', chemin: ':id/pv-caisse' },
];

/** Le bloc de la méthode du contrôleur qui porte ce décorateur, jusqu'au suivant. */
function methodeDuControleur(methode: Methode, chemin: string): string {
  const decorateur = `@${methode}('${chemin}')`;
  const i = controleur.indexOf(decorateur);
  expect(i, `${decorateur} absent du contrôleur`).toBeGreaterThan(0);
  const suite = controleur.slice(i + decorateur.length);
  const prochain = suite.search(/\n\s*@(Get|Post|Patch|Put|Delete|Roles)\(/);
  return prochain === -1 ? suite : suite.slice(0, prochain);
}

function dtoDeLaRoute(methode: Methode, chemin: string): string | null {
  const m = methodeDuControleur(methode, chemin).match(/@Body\(\)\s+\w+\s*:\s*(\w+)/);
  return m ? m[1] : null;
}

/** Propriétés d'une classe du fichier de DTO, découpée par équilibrage d'accolades. */
function proprietesDuDto(nom: string): Set<string> {
  const debutClasse = dtos.indexOf(`export class ${nom} {`);
  expect(debutClasse, `classe ${nom} introuvable`).toBeGreaterThanOrEqual(0);
  const debut = dtos.indexOf('{', debutClasse);
  const corps = dtos.slice(debut + 1, finDuBloc(dtos, debut));
  return new Set([...corps.matchAll(/^\s{2}([a-zA-Z]+)[?!]:/gm)].map((m) => m[1]));
}

/**
 * Indice de l'accolade (ou du crochet, de la parenthèse) qui ferme celle
 * ouverte en `debut`. Les commentaires sont sautés · l'apostrophe d'un « d'un »
 * y serait sinon lue comme l'ouverture d'une chaîne.
 */
function finDuBloc(texte: string, debut: number): number {
  let profondeur = 0;
  let chaine: string | null = null;
  for (let k = debut; k < texte.length; k++) {
    const c = texte[k];
    if (!chaine && c === '/' && texte[k + 1] === '*') {
      k = texte.indexOf('*/', k + 2) + 1;
      continue;
    }
    if (!chaine && c === '/' && texte[k + 1] === '/') {
      k = texte.indexOf('\n', k);
      continue;
    }
    if (chaine) {
      if (c === '\\') k++;
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    else if (c === '{' || c === '(' || c === '[') profondeur++;
    else if (c === '}' || c === ')' || c === ']') {
      profondeur--;
      if (profondeur === 0) return k;
    }
  }
  throw new Error('bloc non refermé');
}

/** Les segments de premier niveau d'un littéral d'objet, séparés par ses virgules. */
function segmentsDePremierNiveau(litteral: string): string[] {
  const segments: string[] = [];
  let profondeur = 0;
  let chaine: string | null = null;
  let courant = '';
  for (let k = 0; k < litteral.length; k++) {
    const c = litteral[k];
    if (chaine) {
      courant += c;
      if (c === '\\') courant += litteral[++k];
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    if ('{(['.includes(c)) profondeur++;
    if ('})]'.includes(c)) profondeur--;
    if (c === ',' && profondeur === 0) {
      segments.push(courant);
      courant = '';
    } else courant += c;
  }
  if (courant.trim()) segments.push(courant);
  return segments.map((x) => x.trim()).filter(Boolean);
}

/** Clé d'un segment · `cle: valeur` ou raccourci `cle`. Une décomposition `...x` rend `...`. */
function cleDuSegment(segment: string): string {
  if (segment.startsWith('...')) return '...';
  const m = segment.match(/^([A-Za-z_$][\w$]*)\s*(:|$)/);
  return m ? m[1] : `?${segment}`;
}

/** Le chemin du contrôleur tel que la page l'écrit, `:param` devenant `${...}`. */
function motifDuChemin(chemin: string): RegExp {
  const echappe = `/inventaire/${chemin}`
    .split('/')
    .map((p) => (p.startsWith(':') ? '\\$\\{[^}]+\\}' : p.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')))
    .join('/');
  return new RegExp(`api\\s*\\.\\s*(get|post|patch)\\s*(?:<[^>]*>)?\\(\\s*\`${echappe}\``, 'g');
}

/** Chaque appel de la page vers ce chemin · méthode et littéral du corps (s'il y en a un). */
function appelsDeLaPage(chemin: string): { methode: string; corps: string | null }[] {
  return [...page.matchAll(motifDuChemin(chemin))].map((m) => {
    const apres = (m.index ?? 0) + m[0].length;
    const reste = page.slice(apres);
    const virgule = reste.match(/^\s*,\s*\{/);
    if (!virgule) return { methode: m[1], corps: null };
    const debut = apres + virgule[0].length - 1;
    return { methode: m[1], corps: page.slice(debut + 1, finDuBloc(page, debut)) };
  });
}

describe('inventaire physique · chaque geste du serveur a son geste à l’écran', () => {
  it('le serveur refuse tout champ en trop', () => {
    expect(bootstrap).toContain('forbidNonWhitelisted: true');
  });

  it.each(ROUTES)('$methode /inventaire/$chemin est appelée par la page', ({ methode, chemin }) => {
    methodeDuControleur(methode, chemin);
    const appels = appelsDeLaPage(chemin);
    expect(appels.length, `aucun appel à /inventaire/${chemin}`).toBeGreaterThan(0);
    for (const a of appels) expect(a.methode).toBe(methode.toLowerCase());
  });

  it.each(ROUTES.filter((r) => r.methode !== 'Get'))(
    'le corps de $methode /inventaire/$chemin ne porte que des propriétés de son DTO',
    ({ methode, chemin }) => {
      const dto = dtoDeLaRoute(methode, chemin);
      expect(dto, `aucun @Body sur ${chemin}`).not.toBeNull();
      const proprietes = proprietesDuDto(dto as string);
      const appels = appelsDeLaPage(chemin);
      // Sans appel, la boucle ne vérifierait rien et passerait.
      expect(appels.length).toBeGreaterThan(0);
      for (const { corps } of appels) {
        expect(corps, `appel à /inventaire/${chemin} sans corps littéral`).not.toBeNull();
        const cles = segmentsDePremierNiveau(corps as string).map(cleDuSegment);
        expect(cles.length).toBeGreaterThan(0);
        expect(cles.filter((c) => !proprietes.has(c))).toEqual([]);
      }
    },
  );

  it('chaque coupure envoyée avec le PV de caisse ne porte que des propriétés de CoupureDto', () => {
    const proprietes = proprietesDuDto('CoupureDto');
    const [appel] = appelsDeLaPage(':id/pv-caisse');
    const segment = segmentsDePremierNiveau(appel.corps as string).find((x) => x.startsWith('coupures'));
    expect(segment, 'le PV de caisse doit pouvoir porter sa ventilation par coupure').toBeDefined();
    const litteraux = [...(segment as string).matchAll(/\(\{/g)].map((m) => {
      const debut = (m.index ?? 0) + 1;
      return (segment as string).slice(debut + 1, finDuBloc(segment as string, debut));
    });
    expect(litteraux.length).toBeGreaterThan(0);
    for (const l of litteraux) {
      const cles = segmentsDePremierNiveau(l).map(cleDuSegment);
      expect(cles.filter((c) => !proprietes.has(c))).toEqual([]);
    }
  });

  it('les gestes d’écriture sont lus sous `peutEcrire`', () => {
    expect(page).toMatch(/const \{ peutEcrire \} = useAuth\(\)/);
  });
});
