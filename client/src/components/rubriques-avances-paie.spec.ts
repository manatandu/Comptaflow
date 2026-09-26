import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA RUBRIQUE ET L'AVANCE À L'ÉCRAN · le client n'envoie que ce qu'il sait.
 * La nature d'une rubrique et le type d'une avance sont relus au serveur ; ce
 * test gèle que le corps de la simulation porte l'identifiant (sans quoi le
 * serveur ne relirait rien) et que la retenue ne transporte que son montant.
 */
const page = readFileSync(join(__dirname, '..', 'pages', 'PersonnelPage.tsx'), 'utf8');

function corps(source: string, nom: string): string {
  const debut = source.indexOf(`const ${nom} = () => {`);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouverture, i + 1);
  }
  throw new Error('corps introuvable');
}

describe('rubriques et avances dans la simulation', () => {
  const simulation = corps(page, 'corpsSimulation');

  it("l'élément tiré d'une rubrique porte son identifiant", () => {
    expect(simulation).toContain('...(l.rubriqueId ? { rubriqueId: l.rubriqueId } : {})');
  });

  it("une retenue d'avance n'envoie que l'avance et le montant", () => {
    expect(simulation).toContain('.map(([avanceId, v]) => ({ avanceId, montantFc: nombre(v) as number }))');
  });

  it("l'onglet Rubriques et avances est branché", () => {
    expect(page).toContain("{onglet === 'rubriques' && <OngletRubriquesAvances");
  });
});
