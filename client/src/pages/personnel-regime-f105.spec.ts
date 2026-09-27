import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F105 · le régime de la retenue se déclare à l'écran, et il part
 * au serveur. La liste des régimes vit au serveur (`RegimeSalarial`) · chaque
 * valeur doit être proposée, et le corps de la simulation doit la porter,
 * sans quoi un forfait choisi ne ferait rien et le barème de l'art. 118
 * resterait retenu sur un personnel domestique.
 */
const page = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');
const serveur = readFileSync(
  join(__dirname, '..', '..', '..', 'src', 'modules', 'personnel', 'bareme-irpp.ts'),
  'utf8',
);

/** Le bloc qui commence à `debut` et se ferme sur `fin`. */
function bloc(texte: string, debut: string, fin: string): string {
  const i = texte.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return texte.slice(i, texte.indexOf(fin, i));
}

describe('F105 · le régime de la retenue se choisit et part au serveur', () => {
  it('chaque régime du serveur est proposé', () => {
    const union = bloc(serveur, 'export type RegimeSalarial', ';');
    const regimes = [...union.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(regimes.length).toBe(3);
    const choix = bloc(page, 'Régime de la retenue', '</select>');
    for (const r of regimes) expect(choix).toContain(`value="${r}"`);
    // Vide = non déclaré, jamais un régime présumé.
    expect(choix).toContain('<option value="">');
  });

  it('le corps de la simulation porte le régime choisi', () => {
    expect(bloc(page, 'retenuesArticle71Fc:', 'enfantsBeneficiairesAllocations')).toContain(
      "...(regimeSalarial === '' ? {} : { regimeSalarial })",
    );
  });

  it('le motif du régime est affiché quand il n’est pas déclaré ou pas calculable', () => {
    expect(bloc(page, 'simulation.regimeSalarial &&', '</')).toContain('simulation.regimeSalarial.motif');
  });
});

/**
 * AUDIT FINAL F106 · la bulle de la saisie disait qu'un logement fourni en
 * nature empêche de chiffrer la quotité. Depuis P6, il est défalqué (arrêté
 * de 2005, art. 10) · une garantie négative vieillit, et celle-ci faisait
 * renoncer à un calcul que le serveur rend.
 */
describe('F106 · la bulle de l’article 114 dit ce que le serveur fait', () => {
  it('le logement en nature est défalqué, pas une cause d’abstention', () => {
    const bulle = bloc(page, 'La classe place le seuil de l’article 114', '"');
    expect(bulle).toContain('art. 10');
    expect(bulle).toContain('quote-part ouvrière');
  });
});
