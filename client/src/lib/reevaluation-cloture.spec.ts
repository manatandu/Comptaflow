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

/**
 * DÉCISION D6 · « Annuler la réévaluation » sur la ligne, réservé à qui
 * valide (`peutValider`), motif obligatoire, route `POST
 * /devises/reevaluations/:id/annuler` ; une annulée le dit et n'offre plus la
 * contre-passation.
 */
describe('écran Devises · annuler une réévaluation', () => {
  const source = readFileSync(join(__dirname, '../pages/DevisesPage.tsx'), 'utf8');

  it('le bouton est réservé à peutValider et la route reçoit le motif', () => {
    expect(source).toMatch(/\{peutValider && !r\.annuleeLe && \(\s*<button/);
    expect(source).toContain('Annuler la réévaluation');
    const debut = source.indexOf('const annulerReevaluation = async');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain("api.post(`/devises/reevaluations/${r.id}/annuler`, { motif: motif.trim() })");
    expect(corps).toContain("Le motif de l'annulation est obligatoire.");
  });

  it('une annulée ne propose plus la contre-passation', () => {
    expect(source).toContain('{r.annuleeLe || !r.ecritureEcarts ? null : r.ecritureExtourne ? (');
  });
});
