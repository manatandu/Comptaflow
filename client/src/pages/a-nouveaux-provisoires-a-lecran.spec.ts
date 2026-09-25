import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Le nouvel exercice avec reports provisoires · on gèle la PRÉSENCE du câblage.
describe('À-nouveaux provisoires · à l’écran', () => {
  const src = readFileSync(join(__dirname, 'ExercicePage.tsx'), 'utf8');
  it("s'offre à l'administrateur sur un exercice ouvert, budgets compris", () => {
    expect(src).toMatch(/estAdmin && exercice && exercice\.statut === 'OUVERT' && \(\s*<div[^>]*>\s*<div[^>]*>\s*Nouvel exercice/);
    expect(src).toMatch(/`\/exercices\/\$\{exercice\.id\}\/a-nouveaux-provisoires`/);
    expect(src).toMatch(/\{ reporterBudgets: reporterBudgetsAussi \}/);
  });
});
