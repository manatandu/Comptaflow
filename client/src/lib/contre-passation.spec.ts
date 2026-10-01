import { exercicesDeContrePassation } from '../lib/contre-passation';

// La contre-passation des écarts va « à l'ouverture de l'exercice suivant » ·
// la liste servait tout exercice ouvert autre que le courant, antérieur compris.
describe('exercices de contre-passation', () => {
  const ex = (id: string, debut: string, statut = 'OUVERT') => ({ id, dateDebut: debut, statut });
  it('seuls les exercices ouverts qui commencent après la réévaluation', () => {
    const liste = [ex('2025', '2025-01-01'), ex('2026', '2026-01-01'), ex('2027', '2027-01-01'), ex('2028', '2028-01-01', 'CLOTURE')];
    expect(exercicesDeContrePassation(liste, '2026-12-31').map((e) => e.id)).toEqual(['2027']);
  });
  it('aucun exercice suivant ouvert · liste vide, que l’écran dit', () => {
    expect(exercicesDeContrePassation([ex('2026', '2026-01-01')], '2026-12-31')).toEqual([]);
  });
});
