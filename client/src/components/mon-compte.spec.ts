import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MON COMPTE · audit de l'interface du 2026-09-27, constat F3.
 *
 * Les routes du compte courant sont ouvertes à TOUS les rôles, gestionnaire de
 * paie compris (auth.controller.ts, `@AccesRolesCantonnes({ gestionnairePaie:
 * true })`), mais leurs écrans ne vivaient que dans la fenêtre des
 * utilisateurs, réservée à l'administrateur. Un comptable ne pouvait donc ni
 * activer son second facteur, ni changer son mot de passe, ni fermer une
 * session oubliée. Ce spec gèle la porte (menu Fichier, sans garde de rôle,
 * menu réduit du gestionnaire de paie compris), ce qu'elle ouvre, et la forme
 * des corps envoyés · le serveur refuse toute clé de plus
 * (`forbidNonWhitelisted`), et une clé mal orthographiée ne se voit qu'au clic.
 */

const CLIENT = join(__dirname, '..');
const SERVEUR_AUTH = join(__dirname, '../../../src/modules/auth');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');

const shell = lire('components/chrome/AppShell.tsx');
const modale = lire('components/ModaleMonCompte.tsx');

/** Le bloc d'un menu complet, du titre au titre suivant. */
const menu = (titre: string, suivant: string) =>
  shell.slice(shell.indexOf(`titre: '${titre}',`), shell.indexOf(`titre: '${suivant}',`));

/** Le menu réduit servi au gestionnaire de paie. */
const menuGestionnairePaie = shell.slice(
  shell.indexOf("utilisateur?.role === 'GESTIONNAIRE_PAIE'\n"),
  shell.indexOf('filtrerParProfil(menusComplets'),
);

/** Le corps d'une fonction fléchée déclarée à deux espaces, jusqu'à sa fermeture. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`  const ${nom} = `);
  return source.slice(debut, source.indexOf('\n  };', debut));
}

/** Chaque appel `api.post` vers une route /auth/, avec les clés de son corps littéral. */
function appelsAuth(source: string): { route: string; cles: string[] | null }[] {
  const motif = /api\.post(?:<[^>]*>)?\(\s*'\/auth\/([^']+)'\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
  return [...source.matchAll(motif)].map((m) => ({
    route: m[1],
    cles:
      m[2] === undefined
        ? null
        : m[2]
            .split(',')
            .map((c) => c.trim().match(/^(\w+)/)?.[1])
            .filter((c): c is string => !!c),
  }));
}

/**
 * Le DTO que le CONTRÔLEUR déclare pour une route · lu dans la méthode décorée
 * de cette route, jamais recopié ici. `null` pour une route sans corps.
 */
function dtoDeLaRoute(route: string): string | null {
  const controleur = readFileSync(join(SERVEUR_AUTH, 'auth.controller.ts'), 'utf8');
  const debut = controleur.indexOf(`@Post('${route}')`);
  expect([route, debut >= 0]).toEqual([route, true]);
  const suite = controleur.slice(debut + 1);
  const fin = suite.search(/@(Post|Get|Patch|Put|Delete)\(/);
  const methode = fin >= 0 ? suite.slice(0, fin) : suite;
  return methode.match(/@Body\(\) dto: (\w+)/)?.[1] ?? null;
}

/**
 * Les propriétés déclarées par une classe de DTO du module auth, celles de sa
 * classe parente comprises · `DesactiverDoubleAuthDto` hérite son `code`.
 */
function proprietesDto(classe: string): string[] {
  for (const fichier of readdirSync(join(SERVEUR_AUTH, 'dto'))) {
    const source = readFileSync(join(SERVEUR_AUTH, 'dto', fichier), 'utf8');
    const debut = source.indexOf(`export class ${classe} `);
    if (debut < 0) continue;
    const bloc = source.slice(debut, source.indexOf('\n}', debut));
    const propres = [...bloc.matchAll(/^\s+(\w+)[!?]?:/gm)].map((m) => m[1]);
    const parente = bloc.match(/^export class \w+ extends (\w+)/)?.[1];
    return parente ? [...proprietesDto(parente), ...propres] : propres;
  }
  throw new Error(`DTO introuvable : ${classe}`);
}

describe('Mon compte · les réglages de sécurité de chacun', () => {
  it('le menu Fichier porte « Mon compte… » SANS garde de rôle', () => {
    const fichier = menu('Fichier', 'Structure');
    const ligne = fichier.split('\n').find((l) => l.includes("label: 'Mon compte…'"));
    // Une entrée gardée s'écrit `...(estAdmin ? [{ label: …` · celle-ci est
    // une entrée nue du tableau, comme « Courriers sortants ».
    expect(ligne?.trim()).toBe("{ label: 'Mon compte…', separateurAvant: true, onClick: () => setMonCompteOuvert(true) },");
  });

  it('le menu réduit du gestionnaire de paie la porte aussi', () => {
    expect(menuGestionnairePaie).toContain("{ label: 'Mon compte…', separateurAvant: true, onClick: () => setMonCompteOuvert(true) },");
  });

  it('la coquille monte la modale, par un portail comme toute modale', () => {
    expect(shell).toContain('{monCompteOuvert && <ModaleMonCompte onFermer={() => setMonCompteOuvert(false)} />}');
    expect(modale).toContain('<PortailModale>');
  });

  it('la modale change le mot de passe par la règle partagée', () => {
    const changer = corps(modale, 'changerMotDePasse');
    expect(changer).toContain('refusNouveauMotDePasse(actuel, nouveau, confirmation)');
    expect(changer).toContain('await changerMonMotDePasse(actuel, nouveau)');
    expect(appelsAuth(lire('lib/mot-de-passe.ts')).map((a) => a.route)).toEqual(['changer-mot-de-passe']);
  });

  it('« Fermer toutes mes sessions » appelle la route PUIS referme l’interface et revient à la connexion', () => {
    const fermer = corps(modale, 'fermerToutesMesSessions');
    const appel = fermer.indexOf("await api.post('/auth/deconnecter-partout')");
    const sortie = fermer.indexOf('seDeconnecter();');
    const retour = fermer.indexOf("navigate('/connexion');");
    expect(appel).toBeGreaterThan(-1);
    expect(sortie).toBeGreaterThan(appel);
    expect(retour).toBeGreaterThan(sortie);
  });

  it('« Déconnecter mes autres appareils » envoie le mot de passe, PUIS reprend le jeton CSRF rendu, PUIS relit la session (audit final F270)', () => {
    // Le serveur ferme toutes les sessions et repose celle-ci · son jeton
    // CSRF change. Sans `setCsrf`, l'écriture suivante partait avec l'ancien.
    const deconnecter = corps(modale, 'deconnecterAutresAppareils');
    const appel = deconnecter.indexOf("await api.post<{ autresAppareilsDeconnectes: boolean; csrfToken: string }>('/auth/deconnecter-autres-appareils', {");
    const csrf = deconnecter.indexOf('setCsrf(csrfToken);');
    const relecture = deconnecter.indexOf('await rafraichir();');
    expect(appel).toBeGreaterThan(-1);
    expect(csrf).toBeGreaterThan(appel);
    expect(relecture).toBeGreaterThan(csrf);
    // Et ce n'est PAS la fermeture de toutes les sessions · l'interface reste
    // ouverte, et le dit.
    expect(deconnecter).toContain("setFait('Vos autres appareils sont déconnectés · cet appareil reste connecté.');");
    expect(modale).toContain('<form onSubmit={deconnecterAutresAppareils}');
  });

  it('la modale monte les deux modales existantes, double authentification et adresse', () => {
    expect(modale).toContain("return <ModaleDoubleAuth onFermer={() => setSousModale(null)} />;");
    expect(modale).toContain('return <ModaleMonAdresse adresseActuelle={utilisateur.email} onFermer={() => setSousModale(null)} />;');
    expect(modale).toContain("onClick={() => setSousModale('double-auth')}");
    expect(modale).toContain("onClick={() => setSousModale('adresse')}");
  });

  describe('chaque corps envoyé ne porte que des clés du DTO du serveur', () => {
    const fichiers = ['lib/mot-de-passe.ts', 'components/ModaleMonCompte.tsx', 'components/ModaleMonAdresse.tsx', 'components/ModaleDoubleAuth.tsx'];
    const appels = fichiers.flatMap((f) => appelsAuth(lire(f)).map((a) => ({ fichier: f, ...a })));

    it('le recensement trouve encore les appels · sans quoi le test suivant ne prouve rien', () => {
      const routes = appels.map((a) => a.route);
      expect(routes).toEqual(
        expect.arrayContaining([
          'changer-mot-de-passe',
          'deconnecter-partout',
          'deconnecter-autres-appareils',
          'changer-adresse',
          'double-authentification/activer',
          'double-authentification/desactiver',
        ]),
      );
    });

    it.each(appels.map((a) => [`${a.fichier} → /auth/${a.route}`, a] as const))('%s', (_nom, a) => {
      const dto = dtoDeLaRoute(a.route);
      if (dto === null) {
        // Route sans corps · rien ne doit partir, sinon le serveur refuse.
        expect([a.route, a.cles ?? []]).toEqual([a.route, []]);
        return;
      }
      const permises = proprietesDto(dto);
      expect(a.cles).not.toBeNull();
      for (const cle of a.cles ?? []) expect([dto, cle, permises.includes(cle)]).toEqual([dto, cle, true]);
    });
  });
});
