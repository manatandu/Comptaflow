import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'ORDRE DE VIREMENT À L'ÉCRAN · trois propriétés que rien d'autre ne
 * vérifie. On gèle ce que le code FAIT (l'ordre des appels dans le corps d'une
 * fonction, la classe posée sur le conteneur), jamais une distance en
 * caractères ni l'absence d'un mot.
 */
const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/** Le corps d'une fonction fléchée `const nom = async (...) => { ... };`, par équilibrage des accolades. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`const ${nom} = async`);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouverture, i + 1);
  }
  throw new Error(`corps de ${nom} introuvable`);
}

describe("l'ordre de virement à l'écran", () => {
  const ordres = lire('components/OrdresVirement.tsx');
  const reglements = lire('pages/ReglementsPage.tsx');

  it("l'impression est ENREGISTRÉE au serveur avant d'ouvrir la boîte d'impression", () => {
    const imprimer = corps(ordres, 'imprimer');
    const appel = imprimer.indexOf('/impression');
    const boite = imprimer.indexOf('window.print');
    expect(appel).toBeGreaterThan(-1);
    expect(boite).toBeGreaterThan(appel);
  });

  it("l'ordre n'est demandé que pour des fournisseurs", () => {
    const enregistrer = corps(reglements, 'enregistrer');
    expect(enregistrer).toContain("avecOrdre && ordresServis && sens === 'FOURNISSEUR'");
    expect(enregistrer).toContain('ordreVirement: true');
  });

  it("seul le document remis à la banque s'imprime quand un ordre est ouvert", () => {
    expect(reglements).toContain("${ordreOuvert ? 'avec-edition' : ''}");
    expect(ordres).toContain('className="impression-seul ordre-virement');
  });

  it('un ordre annulé ne produit aucun document imprimable', () => {
    expect(ordres).toContain("{ordre && ordre.statut !== 'ANNULE' && (\n        <div className=\"impression-seul");
  });
});
