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

/**
 * AUDIT FINAL F109 · la bulle de la saisie demandait d'y porter la quote-part
 * ouvrière de la CNSS, que la simulation calcule et déduit déjà · suivie, elle
 * la faisait déduire deux fois de l'assiette fiscale.
 */
describe('F109 · le champ de l’article 71 ne reçoit que les autres versements', () => {
  it('la bulle dit que la CNSS est déduite d’office', () => {
    const bulle = bloc(page, 'La quote-part ouvrière de la CNSS est calculée', '"');
    expect(bulle).toContain('déduite d’office');
    expect(bulle).toContain('AUTRES versements');
  });

  it('le libellé du champ le dit aussi', () => {
    expect(page).toContain('Autres retenues art. 71 (FC)');
  });
});

/**
 * AUDIT FINAL F111 · la retenue est arrondie selon l'art. 150 au serveur, et
 * l'écart se montre sur sa propre ligne · sans elle, la somme des lignes du
 * tableau ne rendrait plus la retenue affichée.
 */
describe('F111 · le tableau mensuel montre l’arrondi de l’art. 150', () => {
  const tableau = readFileSync(join(__dirname, 'BaremeMensuelIrpp.tsx'), 'utf8');
  it('une ligne porte l’écart, lu au serveur, avant la retenue', () => {
    const ligne = bloc(tableau, 'mensuel.arrondiArticle150Fc !== undefined', 'Retenue du mois');
    expect(ligne).toContain('Arrondi à la centaine (art. 150)');
    expect(ligne).toContain('fc(Math.abs(mensuel.arrondiArticle150Fc))');
  });
});

/**
 * AUDIT FINAL F112 · le plancher de la CNSS se mesure au SMIG des jours payés
 * d'un mois incomplet · le champ part au serveur, et la réserve revient.
 */
describe('F112 · les jours payés partent au serveur, la réserve du plancher s’affiche', () => {
  it('le corps de la simulation porte les jours payés', () => {
    expect(bloc(page, 'effectif: nombre(effectifInpp),', '\n      //')).toContain('joursPayes: nombre(joursPayes)');
  });

  it('les réserves des cotisations sont affichées', () => {
    expect(bloc(page, '(simulation.cotisations.reserves ?? []).length > 0', '</ul>')).toContain(
      '(simulation.cotisations.reserves ?? []).map',
    );
  });
});
