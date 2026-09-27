import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'ASSISTANT DE CRÉATION N'ENVOIE QUE CE QUE LE SERVEUR ACCEPTE.
 *
 * Audit du 2026-09-26, B1 · l'assistant envoyait `devise`, que `RegisterDto`
 * ne porte plus depuis que la monnaie de tenue est verrouillée sur le franc
 * (loi n° 23/053 art. 141, 1° ; AUDCIF art. 17, 1°). Le serveur valide avec
 * `forbidNonWhitelisted` : la création entière était refusée, et c'était la
 * seule porte vers le premier dossier d'une installation sur site. L'e2e
 * appelle l'API directement, sans ce champ, et ne pouvait pas le voir.
 */

const assistant = readFileSync(join(__dirname, 'NouveauFichierWizard.tsx'), 'utf8');
const dto = readFileSync(join(__dirname, '../../../src/modules/auth/dto/register.dto.ts'), 'utf8');
const bootstrap = readFileSync(join(__dirname, '../../../src/bootstrap.ts'), 'utf8');

// Le corps est un seul objet, envoyé à l'inscription comme à la création d'un
// dossier suivant sur site (audit final F44) · les deux portes prennent
// RegisterDto, et une seule liste de clés se vérifie ici.
function clesDuCorps(): string[] {
  const j = assistant.indexOf('const corps = {');
  expect(j).toBeGreaterThan(0);
  const debut = assistant.indexOf('{', j);
  let profondeur = 0;
  let fin = debut;
  for (let k = debut; k < assistant.length; k++) {
    if (assistant[k] === '{') profondeur++;
    if (assistant[k] === '}') profondeur--;
    if (profondeur === 0) {
      fin = k;
      break;
    }
  }
  const corps = assistant.slice(debut + 1, fin);
  return [...corps.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
}

describe("le corps de l'assistant de création", () => {
  it('le serveur refuse tout champ en trop', () => {
    expect(bootstrap).toContain('forbidNonWhitelisted: true');
  });

  it('chaque clé envoyée est une propriété de RegisterDto', () => {
    const proprietes = new Set([...dto.matchAll(/^\s{2}([a-zA-Z]+)[?!]:/gm)].map((m) => m[1]));
    const cles = clesDuCorps();
    expect(cles.length).toBeGreaterThan(5);
    expect(cles.filter((c) => !proprietes.has(c))).toEqual([]);
  });

  it('les deux portes reçoivent ce même corps', () => {
    expect(assistant).toContain("api.post<AuthResponse>('/auth/register', corps)");
    expect(assistant).toContain("api.post('/sur-site/dossiers', corps)");
  });

  it('la monnaie ne se choisit plus · le récapitulatif dit le franc', () => {
    expect(assistant).toContain('francs congolais (CDF)');
  });
});
