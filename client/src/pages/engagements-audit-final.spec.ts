import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F139 · le sélecteur de rattachement dit sa tranche, et la
 * recherche va au serveur. Chaque test découpe le bloc qui porte la propriété.
 */
const page = readFileSync(join(__dirname, 'EngagementsPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F139 · la tranche se dit et la recherche va au serveur', () => {
  it('la lecture envoie la recherche courante, et garde le total quand la réponse est tronquée', () => {
    const lecture = bloc('const charger = useCallback(async () => {', '}, [exerciceId]);');
    expect(lecture).toContain('`&recherche=${encodeURIComponent(rechercheCourante.current.trim())}`');
    expect(lecture).toContain('setEcrituresTronquees(ecrs.tronque ? { total: ecrs.total } : null);');
  });

  it('la tranche est dite sous le sélecteur', () => {
    expect(bloc('{ecrituresTronquees && (', '</span>')).toContain('écritures affichées sur {ecrituresTronquees.total}');
  });
});
