import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fenetreOuverteSelonAdmin } from '../../lib/reserve-admin';

/**
 * CE QUE LE SERVEUR REFUSE AU NON-ADMINISTRATEUR, L'ÉCRAN LE REFUSE AUSSI ·
 * audit de l'interface I1, repris par l'audit final F200.
 *
 * Le journal d'audit était masqué au menu (`estAdmin ?`) et réservé au
 * serveur (`@Roles(ADMIN_CABINET)` sur tout le contrôleur), mais l'aiguillage
 * d'AppShell l'ouvrait à qui tapait l'adresse, sur le seul refus du serveur.
 * Aucun test ne le voyait, faute de relier les trois endroits.
 *
 * Ce spec les relie par leur STRUCTURE, jamais par une distance :
 *   1. toute entrée de menu gardée par `...(estAdmin ?` mène à une fenêtre
 *      qui refuse elle-même le non-administrateur · soit le registre la
 *      marque `reserveAdmin` et l'aiguillage la renvoie à l'accueil, soit sa
 *      page lit `estAdmin` et dit le refus (import, restitution, autorisations
 *      d'accès, qui le font depuis leur création) ;
 *   2. toute fenêtre marquée `reserveAdmin` a son contrôleur, dont CHAQUE
 *      route exige l'ADMIN_CABINET · une marque posée sur une fenêtre que le
 *      serveur ouvre à d'autres fermerait une porte que le serveur tient
 *      ouverte ;
 *   3. l'aiguillage et le filtre du menu consultent la règle.
 */

const RACINE_CLIENT = join(__dirname, '../..');
const RACINE_DEPOT = join(__dirname, '../../../..');
const lireClient = (p: string) => readFileSync(join(RACINE_CLIENT, p), 'utf8');
const lireDepot = (p: string) => readFileSync(join(RACINE_DEPOT, p), 'utf8');

const shell = lireClient('components/chrome/AppShell.tsx');
const registre = lireClient('lib/registre-fenetres.tsx');

/** Le texte d'un appel, découpé par équilibrage des parenthèses depuis son ouverture. */
function appelEquilibre(source: string, debut: number): string {
  let profondeur = 0;
  for (let i = source.indexOf('(', debut); i < source.length; i++) {
    if (source[i] === '(') profondeur++;
    else if (source[i] === ')') profondeur--;
    if (profondeur === 0) return source.slice(debut, i + 1);
  }
  throw new Error(`parenthèse non refermée à partir de ${debut}`);
}

/** Les chemins que le menu ne montre qu'à l'administrateur, lus dans AppShell. */
function cheminsGardesParEstAdmin(): string[] {
  const chemins: string[] = [];
  let i = shell.indexOf('...(estAdmin');
  while (i !== -1) {
    const bloc = appelEquilibre(shell, i + 3);
    for (const m of bloc.matchAll(/chemin: '(\/[a-z-]+)'/g)) chemins.push(m[1]);
    i = shell.indexOf('...(estAdmin', i + 1);
  }
  return chemins;
}

/** Le bloc du registre dont le motif reconnaît exactement ce chemin. */
function blocDuRegistre(chemin: string): string {
  const motif = `motif: /^\\/${chemin.slice(1)}$/,`;
  const bloc = registre.split(/\n  \{/).find((b) => b.includes(motif));
  if (!bloc) throw new Error(`aucune fenêtre du registre pour ${chemin}`);
  return bloc;
}

/** La source de la page qu'une entrée du registre rend. */
function pageDuBloc(bloc: string): string {
  const composant = bloc.match(/rendre: [^\n]*<(\w+)/)![1];
  const imp = registre.match(new RegExp(`const ${composant} = lazy\\(\\(\\) => import\\('\\.\\./([^']+)'\\)`));
  if (!imp) throw new Error(`import de ${composant} introuvable au registre`);
  return lireClient(`${imp[1]}.tsx`);
}

/** Les chemins que le registre marque `reserveAdmin`. */
function cheminsReserves(): string[] {
  return registre
    .split(/\n  \{/)
    .filter((b) => /\n\s+reserveAdmin: true,/.test(b))
    .map((b) => '/' + b.match(/motif: \/\^\\\/([a-z-]+)\$\//)![1]);
}

/**
 * Le contrôleur de chaque fenêtre réservée · une fenêtre marquée sans y
 * figurer fait tomber le test, pour qu'on aille lire ce que le serveur fait.
 */
const CONTROLEURS: Record<string, string> = {
  '/journal-audit': 'src/common/audit/journal-audit.controller.ts',
};

const ADMIN = '@Roles(RoleUtilisateur.ADMIN_CABINET)';

/** Vrai si CHAQUE route du contrôleur exige l'administrateur, et lui seul. */
function toutesLesRoutesExigentAdmin(source: string): { ok: boolean; routes: number } {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const classe = sansCommentaires.match(/((?:@\w+\([^)]*\)\s*)+)export class/);
  const surLaClasse = !!classe && classe[1].includes(ADMIN);
  let routes = 0;
  let ok = true;
  // Un groupe de décorateurs suivi d'une méthode · les décorateurs de
  // paramètres (`@Query('x') x`) ne sont jamais suivis d'un appel.
  for (const m of sansCommentaires.matchAll(/((?:\s*@\w+\([^)]*\))+)\s*(?:async\s+)?\w+\(/g)) {
    const groupe = m[1];
    if (!/@(Get|Post|Put|Patch|Delete)\(/.test(groupe)) continue;
    routes++;
    // `getAllAndOverride` · le @Roles de la méthode remplace celui de la classe.
    const propre = groupe.match(/@Roles\([^)]*\)/);
    if (propre ? propre[0] !== ADMIN : !surLaClasse) ok = false;
  }
  return { ok, routes };
}

describe('fenêtres réservées à l’administrateur · le menu, l’ouverture et le serveur disent la même chose', () => {
  it('la règle ne ferme que la fenêtre marquée, et seulement au non-administrateur', () => {
    expect(fenetreOuverteSelonAdmin({ reserveAdmin: true }, false)).toBe(false);
    expect(fenetreOuverteSelonAdmin({ reserveAdmin: true }, true)).toBe(true);
    expect(fenetreOuverteSelonAdmin({}, false)).toBe(true);
    expect(fenetreOuverteSelonAdmin({}, true)).toBe(true);
  });

  it('le recensement trouve encore les entrées gardées · un garde-fou qui ne trouve rien ne vérifie rien', () => {
    const gardes = cheminsGardesParEstAdmin();
    expect(gardes).toEqual(expect.arrayContaining(['/utilisateurs', '/journal-audit', '/import', '/restitution']));
    expect(cheminsReserves()).toContain('/journal-audit');
  });

  it('chaque entrée gardée mène à une fenêtre qui refuse elle-même le non-administrateur', () => {
    const sansRefus: string[] = [];
    for (const chemin of cheminsGardesParEstAdmin()) {
      const bloc = blocDuRegistre(chemin);
      if (/\n\s+reserveAdmin: true,/.test(bloc)) continue;
      // La page le dit elle-même · elle lit `estAdmin` dans le contexte de session.
      if (!/const \{[^}]*\bestAdmin\b[^}]*\} = useAuth\(\)/.test(pageDuBloc(bloc))) sansRefus.push(chemin);
    }
    expect(sansRefus).toEqual([]);
  });

  it('chaque fenêtre réservée a un contrôleur dont TOUTES les routes exigent l’administrateur', () => {
    for (const chemin of cheminsReserves()) {
      const fichier = CONTROLEURS[chemin];
      expect([chemin, fichier]).toEqual([chemin, expect.any(String)]);
      const verdict = toutesLesRoutesExigentAdmin(lireDepot(fichier));
      expect([chemin, verdict.routes > 0, verdict.ok]).toEqual([chemin, true, true]);
    }
  });

  it('le contrôle du contrôleur voit une route rouverte · sans quoi il ne prouverait rien', () => {
    const source = lireDepot(CONTROLEURS['/journal-audit']);
    const rouverte = source.replace(
      "@Get('objets')",
      "@Get('objets')\n  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)",
    );
    expect(rouverte).not.toBe(source);
    expect(toutesLesRoutesExigentAdmin(rouverte).ok).toBe(false);
    expect(toutesLesRoutesExigentAdmin(source.replace(`${ADMIN}\n@Controller`, '@Controller')).ok).toBe(false);
  });

  it('l’aiguillage consulte la règle AVANT d’ouvrir, et relit le rôle quand il change', () => {
    const effet = shell.slice(shell.indexOf("if (location.pathname === '/') return;"));
    const garde = effet.indexOf('fenetreOuverteSelonAdmin(def, estAdmin)');
    const ouverture = effet.indexOf('ouvrir(location.pathname');
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(ouverture);
    const dependances = effet.slice(ouverture, effet.indexOf(']);', ouverture));
    expect(dependances).toMatch(/\bestAdmin\b/);
  });

  it('le filtre du menu consulte la même règle', () => {
    const appel = appelEquilibre(shell, shell.indexOf('filtrerParProfil(menusComplets'));
    expect(appel).toContain('fenetreOuverteSelonAdmin(def, estAdmin)');
  });

  it('une tuile d’accueil vers une fenêtre réservée porte la réserve à l’administrateur', () => {
    const accueil = lireClient('pages/AccueilPage.tsx');
    for (const chemin of cheminsReserves()) {
      for (const ligne of accueil.split('\n').filter((l) => l.includes(`chemin: '${chemin}'`))) {
        expect([chemin, ligne.includes('admin: true')]).toEqual([chemin, true]);
      }
    }
  });
});
