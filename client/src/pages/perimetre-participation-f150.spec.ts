import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F150 · une participation se modifie sans être retirée, et les
 * deux retraits (entité, participation) se confirment · ils emportent
 * l'acquisition et les écarts d'évaluation sans rien dire.
 */
const page = readFileSync(join(__dirname, 'PerimetreConsolidationPage.tsx'), 'utf8');
const bloc = (debut: string, fin: string) => {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
};

describe('F150 · modifier une participation, confirmer les retraits', () => {
  it('le geste Modifier envoie les deux pourcentages à la route de modification', () => {
    const b = bloc('Audit final F150 · modifier sans retirer', 'Modifier\n');
    expect(b).toContain('api.patch(`/consolidation/liens/${l.id}`');
    expect(b).toContain('pctDroitsVote');
    expect(b).toContain('pctCapital');
  });

  it('retirer une participation se confirme avant l’appel', () => {
    const b = bloc('Retirer la participation de', "api.delete(`/consolidation/liens/${l.id}`)");
    expect(b).toContain('Son acquisition déclarée et ses écarts d');
    expect(b).toContain('return;');
  });

  it('retirer une entité se confirme avant l’appel', () => {
    const b = bloc('du périmètre ? Ses participations', "api.delete(`/consolidation/entites/${e.id}`)");
    expect(b).toContain('return;');
  });
});
