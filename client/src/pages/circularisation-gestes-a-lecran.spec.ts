import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA CIRCULARISATION SE CLÔT DEPUIS L'ÉCRAN.
 *
 * Audit de l'interface de 2026-09, constat B2 · `CircularisationService.clore`
 * refuse tant qu'une demande est « envoyée » ou « relancée » et tant qu'une
 * non-réponse n'a pas sa procédure alternative (ISA 505 § 12). Les deux routes
 * qui en font sortir n'avaient aucun appel client : toute campagne envoyée
 * restait ouverte pour toujours, sans qu'aucun test unitaire du service ne
 * puisse le voir, puisqu'ils appellent le service sans écran.
 *
 * Le serveur valide avec `forbidNonWhitelisted` · une clé en trop est un 400.
 * On relit donc, pour chaque appel, le DTO que le contrôleur déclare en
 * `@Body()`, et on exige que chaque clé du corps littéral en soit une propriété.
 */

const page = readFileSync(join(__dirname, 'CircularisationPage.tsx'), 'utf8');
const racine = join(__dirname, '../../..');
const controleur = readFileSync(join(racine, 'src/modules/circularisation/circularisation.controller.ts'), 'utf8');
const dtos = readFileSync(join(racine, 'src/modules/circularisation/dto/circularisation.dto.ts'), 'utf8');
const schema = readFileSync(join(racine, 'prisma/schema.prisma'), 'utf8');

/** Le bloc qui s'ouvre à l'accolade `debut`, accolades comprises, par équilibrage. */
function bloc(source: string, debut: number): string {
  expect(source[debut]).toBe('{');
  let profondeur = 0;
  for (let k = debut; k < source.length; k++) {
    if (source[k] === '{') profondeur++;
    if (source[k] === '}') profondeur--;
    if (profondeur === 0) return source.slice(debut, k + 1);
  }
  throw new Error('accolade non refermée');
}

/** Le corps littéral passé à l'appel reconnu par `appel` (le `{` qui suit le chemin). */
function corpsDeLAppel(appel: RegExp): string {
  const m = appel.exec(page);
  expect(m).not.toBeNull();
  const debut = (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length - 1;
  return bloc(page, debut);
}

/** Les clés de premier niveau d'un objet littéral, une par ligne comme l'écrit Prettier. */
function cles(corps: string): string[] {
  return [...corps.slice(1, -1).matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
}

/** Le DTO que le contrôleur déclare en `@Body()` sous le décorateur de route donné. */
function dtoDeLaRoute(decorateur: string): string {
  const i = controleur.indexOf(decorateur);
  expect(i).toBeGreaterThan(0);
  // Le handler commence au décorateur et s'arrête à sa première accolade de
  // corps · c'est dans sa signature que se lit `@Body() dto: X`.
  const signature = controleur.slice(i, controleur.indexOf(') {', i));
  const m = /@Body\(\)\s*dto:\s*(\w+)/.exec(signature);
  expect(m).not.toBeNull();
  return (m as RegExpExecArray)[1];
}

function proprietesDuDto(nom: string): Set<string> {
  const i = dtos.indexOf(`export class ${nom} {`);
  expect(i).toBeGreaterThanOrEqual(0);
  const corps = bloc(dtos, dtos.indexOf('{', i));
  return new Set([...corps.matchAll(/^\s{2}([a-zA-Z]+)[?!]:/gm)].map((m) => m[1]));
}

function valeursEnum(nom: string): Set<string> {
  const i = schema.indexOf(`enum ${nom} {`);
  expect(i).toBeGreaterThan(0);
  const corps = bloc(schema, schema.indexOf('{', i));
  return new Set([...corps.matchAll(/^\s*([A-Z_]+)\s*$/gm)].map((m) => m[1]));
}

const APPELS = [
  {
    nom: 'classer la réponse',
    appel: /api\.patch\(`\/circularisation\/demandes\/\$\{[^}]+\}`,\s*\{/,
    route: "@Patch('demandes/:demandeId')",
    dto: 'DepouillerDto',
  },
  {
    nom: 'procédures alternatives',
    appel: /api\.patch\(`\/circularisation\/demandes\/\$\{[^}]+\}\/procedures-alternatives`,\s*\{/,
    route: "@Patch('demandes/:demandeId/procedures-alternatives')",
    dto: 'ProceduresAlternativesDto',
  },
  {
    nom: 'clore',
    appel: /api\.post\(`\/circularisation\/\$\{[^}]+\}\/clore`,\s*\{/,
    route: "@Post(':id/clore')",
    dto: 'ClorerCampagneDto',
  },
];

describe('circularisation · les gestes qui mènent à la clôture sont à l’écran', () => {
  it('le serveur refuse tout champ en trop', () => {
    const bootstrap = readFileSync(join(racine, 'src/bootstrap.ts'), 'utf8');
    expect(bootstrap).toContain('forbidNonWhitelisted: true');
  });

  for (const a of APPELS) {
    it(`${a.nom} · la page appelle la route, et le contrôleur l'attend avec ${a.dto}`, () => {
      expect(dtoDeLaRoute(a.route)).toBe(a.dto);
      expect(cles(corpsDeLAppel(a.appel)).length).toBeGreaterThan(0);
    });

    it(`${a.nom} · chaque clé du corps est une propriété de ${a.dto}`, () => {
      const proprietes = proprietesDuDto(dtoDeLaRoute(a.route));
      const envoyees = cles(corpsDeLAppel(a.appel));
      expect(envoyees.filter((c) => !proprietes.has(c))).toEqual([]);
    });
  }

  it('le classement envoie le statut et le solde confirmé, et qualifie l’écart', () => {
    const envoyees = cles(corpsDeLAppel(APPELS[0].appel));
    for (const c of ['statut', 'soldeConfirme', 'natureEcart', 'investigation', 'reponseIndirecte']) {
      expect(envoyees).toContain(c);
    }
  });

  it('les procédures alternatives partent sous leur clé', () => {
    expect(cles(corpsDeLAppel(APPELS[1].appel))).toContain('proceduresAlternatives');
  });

  it('la clôture porte le refus de la direction (ISA 505 § 8)', () => {
    expect(cles(corpsDeLAppel(APPELS[2].appel))).toContain('refusDirectionMotif');
  });

  it('les issues proposées sont des valeurs de StatutDemandeConfirmation, hors envoi et relance', () => {
    const valeurs = valeursEnum('StatutDemandeConfirmation');
    const i = page.indexOf('const ISSUES_CLASSEMENT');
    expect(i).toBeGreaterThan(0);
    const tableau = page.slice(page.indexOf('= [', i), page.indexOf('];', i));
    const proposees = [...tableau.matchAll(/statut:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(proposees.sort()).toEqual(['NON_DISTRIBUEE', 'REPONSE_RECUE', 'SANS_REPONSE']);
    for (const p of proposees) expect(valeurs.has(p)).toBe(true);
  });

  it('les natures d’écart proposées sont exactement celles de NatureEcartConfirmation', () => {
    const valeurs = valeursEnum('NatureEcartConfirmation');
    const i = page.indexOf('const LIBELLE_NATURE');
    const corps = bloc(page, page.indexOf('{', page.indexOf('=', i)));
    const proposees = [...corps.matchAll(/^\s*([A-Z_]+)\s*:/gm)].map((m) => m[1]);
    expect(new Set(proposees)).toEqual(valeurs);
  });
});

/**
 * AUDIT FINAL F70 ET F71 · ce que l'écran propose suit ce que le serveur admet.
 *
 * F71 · une demande ne s'ajoute qu'en préparation, et celle qui n'est pas
 * partie se retire · sans le bouton, le refus de clôture renvoyait à un geste
 * impossible. F70 · le taux de couverture se lit sur le total du cycle, et le
 * libellé qui l'accompagne doit nommer ce dénominateur-là.
 */
describe('circularisation · retenir, retirer, couvrir (F70, F71)', () => {
  /**
   * La dernière condition JSX ouverte avant l'appel reconnu par `appel` ·
   * c'est elle qui décide si le bouton qui le porte s'affiche. Ancrée sur
   * l'appel, pas sur une distance.
   */
  function conditionDuBouton(appel: RegExp, forme: RegExp): string {
    const m = appel.exec(page);
    expect(m).not.toBeNull();
    const conditions = [...page.slice(0, (m as RegExpExecArray).index).matchAll(forme)].map((x) => x[1]);
    expect(conditions.length).toBeGreaterThan(0);
    return conditions[conditions.length - 1];
  }

  it('le contrôleur expose la route qui retire une demande, au comptable', () => {
    const i = controleur.indexOf("@Delete('demandes/:demandeId')");
    expect(i).toBeGreaterThan(0);
    // Les décorateurs de la route sont entre la fin du handler précédent et elle.
    const decorateurs = controleur.slice(controleur.lastIndexOf('}', i), i);
    expect(decorateurs).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)');
    expect(controleur.slice(i, controleur.indexOf(') {', i))).toContain('retirerDemande');
  });

  it('« Retirer » appelle cette route, et seulement sur une lettre qui n’est pas partie', () => {
    const appel = /api\.delete\(`\/circularisation\/demandes\/\$\{d\.id\}`\)/;
    expect(conditionDuBouton(appel, /\{([^{}]+?) && \(/g)).toBe("d.statut === 'A_ENVOYER'");
  });

  it('« Retenir » ne se propose qu’à une campagne en préparation', () => {
    const appel = /api\.post\(`\/circularisation\/\$\{detail\.id\}\/demandes`/;
    expect(conditionDuBouton(appel, /\) : ([^?:(){}]+?) \? \(/g)).toBe("peutEcrire && detail.statut === 'PREPARATION'");
  });

  it('le taux de couverture est dit sur le total du cycle, jamais sur le solde envoyé', () => {
    const i = page.indexOf('Taux de couverture');
    expect(i).toBeGreaterThan(0);
    const ligne = page.slice(i, page.indexOf('<Aide', i));
    expect(ligne).toContain('s.totalCycle');
    expect(ligne).not.toContain('s.soldeEnvoye');
  });
});

/**
 * AUDIT FINAL F210 · la campagne passe désormais par « dépouillée », et le
 * bouton d'envoi s'offrait à tout état autre que « close ». Le serveur
 * n'envoie qu'en préparation et ne relance qu'une campagne envoyée · offert à
 * une campagne relancée ou dépouillée, le bouton menait à un refus.
 */
describe('circularisation · l’envoi ne se propose que là où le serveur l’admet (F210)', () => {
  const service = readFileSync(join(racine, 'src/modules/circularisation/circularisation.service.ts'), 'utf8');

  it('le bouton d’envoi suit les états que `envoyer` admet, ni plus ni moins', () => {
    const debut = service.indexOf('async envoyer(');
    expect(debut).toBeGreaterThan(0);
    const corps = bloc(service, service.indexOf('{', service.indexOf(') {', debut) + 1));
    const admis = corps.slice(corps.indexOf('this.campagne('), corps.indexOf(']);'));
    const serveur = [...admis.matchAll(/StatutCampagneCircularisation\.([A-Z_]+)/g)].map((m) => m[1]).sort();
    expect(serveur).toEqual(['ENVOYEE', 'PREPARATION']);

    const appel = /api\.post\(`\/circularisation\/\$\{detail\.id\}\/envoyer`/.exec(page);
    expect(appel).not.toBeNull();
    const conditions = [...page.slice(0, (appel as RegExpExecArray).index).matchAll(/\{([^{}]+?) && \(/g)].map(
      (x) => x[1],
    );
    const ecran = [...conditions[conditions.length - 1].matchAll(/detail\.statut === '([A-Z_]+)'/g)]
      .map((m) => m[1])
      .sort();
    expect(ecran).toEqual(serveur);
  });
});
