// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * DÉCISION D1 · la réévaluation des devises se fait à la date de CLÔTURE
 * (AUDCIF art. 54, Titre VIII ch. 22 § 2.2) · l'écran Devises propose la fin
 * de l'exercice et ne la laisse pas changer ; une réévaluation passée à une
 * autre date est signalée sur sa ligne. On gèle des PRÉSENCES.
 */
describe('écran Devises · la date de la réévaluation', () => {
  const source = readFileSync(join(__dirname, '../pages/DevisesPage.tsx'), 'utf8');

  it('la date suit la fin de l’exercice et le champ est en lecture seule', () => {
    expect(source).toContain('setDateReeval(exerciceCourant.dateFin.slice(0, 10));');
    expect(source).not.toContain('setDateReeval(e.target.value)');
    const champ = source.slice(source.indexOf('value={dateReeval}'), source.indexOf('/>', source.indexOf('value={dateReeval}')));
    expect(champ).toContain('readOnly');
  });

  it('une réévaluation hors clôture est signalée', () => {
    expect(source).toContain('r.horsCloture');
  });
});
