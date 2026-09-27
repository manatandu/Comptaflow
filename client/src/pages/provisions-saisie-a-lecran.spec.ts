import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE REGISTRE DES PROVISIONS SE SAISIT À L'ÉCRAN, ET N'ENVOIE QUE CE QUE LE
 * SERVEUR ACCEPTE.
 *
 * Audit du 2026-09-26, B3 · la fenêtre ne lisait que le tableau de variation.
 * Les cinq routes d'écriture de `provisions.controller.ts` n'avaient aucun
 * appel, si bien que le tableau restait vide pour tout dossier et que son
 * rapprochement avec le solde du compte ne rapprochait rien, pendant que le
 * commentaire d'en-tête affirmait que la saisie « se fait ligne par ligne »
 * ailleurs. Aucun spec de service ne pouvait le voir.
 *
 * Deux propriétés sont gelées. (1) CHAQUE ROUTE D'ÉCRITURE EST APPELÉE PAR LA
 * PAGE, et le contrôleur n'en porte pas d'autre : une sixième route ajoutée
 * sans écran fait tomber le décompte. (2) CHAQUE CORPS LITTÉRAL NE PORTE QUE
 * DES PROPRIÉTÉS DE SON DTO · le serveur valide avec `forbidNonWhitelisted`,
 * et une clé en trop fait refuser l'enregistrement entier, ce qu'aucune
 * compilation ne voit (le client n'importe pas les DTO du serveur).
 */

const page = readFileSync(join(__dirname, 'ProvisionsPage.tsx'), 'utf8');
const controleur = readFileSync(join(__dirname, '../../../src/modules/provisions/provisions.controller.ts'), 'utf8');
const dto = readFileSync(join(__dirname, '../../../src/modules/provisions/dto/provision.dto.ts'), 'utf8');
const bootstrap = readFileSync(join(__dirname, '../../../src/bootstrap.ts'), 'utf8');

/** Découpe un bloc `{ … }` par équilibrage des accolades, à partir de l'indice d'une accolade ouvrante. */
function blocEquilibre(source: string, debut: number): string {
  expect(source[debut]).toBe('{');
  let profondeur = 0;
  for (let k = debut; k < source.length; k++) {
    if (source[k] === '{') profondeur++;
    if (source[k] === '}') profondeur--;
    if (profondeur === 0) return source.slice(debut + 1, k);
  }
  throw new Error('bloc non refermé');
}

/**
 * Le corps littéral d'un appel, identifié par la méthode et le chemin tels
 * qu'écrits dans la page. Le chemin est un gabarit qui contient lui-même des
 * accolades (`${…}`) : on part donc de la FIN de l'argument chemin, jamais de
 * la première accolade rencontrée.
 */
function corpsDe(methode: 'post' | 'patch', chemin: string): string {
  const appel = new RegExp(`api\\.${methode}<[^>]*>\\(${chemin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,\\s*\\{`);
  const m = appel.exec(page);
  expect([`appel ${methode} ${chemin} introuvable`, m === null]).toEqual([`appel ${methode} ${chemin} introuvable`, false]);
  const ouvrante = (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length - 1;
  return blocEquilibre(page, ouvrante);
}

function clesDu(corps: string): string[] {
  return [...corps.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
}

/** Les propriétés d'une classe du DTO, lues dans le corps de la classe elle-même. */
function proprietesDe(classe: string): Set<string> {
  const debut = dto.indexOf(`export class ${classe} {`);
  expect([`classe ${classe} introuvable`, debut >= 0]).toEqual([`classe ${classe} introuvable`, true]);
  const corps = blocEquilibre(dto, dto.indexOf('{', debut));
  return new Set([...corps.matchAll(/(\w+)[?!]:/g)].map((m) => m[1]));
}

const APPELS = {
  creer: { methode: 'post' as const, chemin: '`/provisions/${exerciceId}`', dto: 'CreerProvisionDto' },
  modifier: { methode: 'patch' as const, chemin: '`/provisions/${edition.id}`', dto: 'ModifierProvisionDto' },
  statuer: { methode: 'patch' as const, chemin: '`/provisions/${statutCible.ligne.id}/statut`', dto: 'StatuerProvisionDto' },
  reporter: { methode: 'post' as const, chemin: "'/provisions/reporter/ouverture'", dto: 'ReporterProvisionsDto' },
};

describe('registre des provisions · la saisie est à l’écran', () => {
  it('le serveur refuse tout champ en trop', () => {
    expect(bootstrap).toContain('forbidNonWhitelisted: true');
  });

  it('le contrôleur porte exactement cinq routes d’écriture, et la page les appelle toutes', () => {
    // Le décompte est EN DUR · une route ajoutée sans écran le fait tomber.
    const routes = [...controleur.matchAll(/@(Post|Patch|Delete)\('([^']*)'\)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(routes.sort()).toEqual(['Delete :id', 'Patch :id', 'Patch :id/statut', 'Post :exerciceId', 'Post reporter/ouverture'].sort());

    for (const a of Object.values(APPELS)) corpsDe(a.methode, a.chemin);
    expect(page).toMatch(/api\.delete<[^>]*>\(`\/provisions\/\$\{p\.id\}`\)/);
  });

  it('la liste de l’exercice est lue, pas seulement le tableau de variation', () => {
    expect(page).toContain('`/provisions?exerciceId=${encodeURIComponent(exerciceId)}`');
  });

  for (const [nom, a] of Object.entries(APPELS)) {
    it(`${nom} · chaque clé envoyée est une propriété de ${a.dto}`, () => {
      const proprietes = proprietesDe(a.dto);
      const cles = clesDu(corpsDe(a.methode, a.chemin));
      expect(cles.length).toBeGreaterThan(0);
      expect(cles.filter((c) => !proprietes.has(c))).toEqual([]);
    });
  }

  it('la modification ne porte pas le statut · il a sa route, qui exige le motif', () => {
    expect(clesDu(corpsDe('patch', APPELS.modifier.chemin))).not.toContain('statut');
    expect(clesDu(corpsDe('patch', APPELS.statuer.chemin))).toEqual(['statut', 'motifNonComptabilisation']);
  });

  it('l’écran qui écrit lit `peutEcrire` depuis la session, sans le recomposer', () => {
    expect(page).toMatch(/const \{ peutEcrire \} = useAuth\(\);/);
  });

  it('les natures proposées sont celles que le serveur sert pour le référentiel du dossier', () => {
    // La liste déroulante itère sur `t.natures` (naturesDuReferentiel côté
    // serveur) · jamais sur une table de numéros écrite dans la page.
    const i = page.indexOf('naturesServies.map((n) =>');
    expect(i).toBeGreaterThan(0);
    expect(page).toContain('const naturesServies = t?.natures ?? [];');
  });
});
