import { exerciceDeContrePassation, libelleContrePassation } from '../lib/contre-passation';

// La contre-passation des écarts va « à l'ouverture de l'exercice suivant » ·
// la liste servait tout exercice ouvert autre que le courant, antérieur
// compris, puis tout exercice ouvert postérieur. Seul celui qui suit
// IMMÉDIATEMENT est le bon (relecture adverse d'A5 bis, M1).
describe('exercice de contre-passation', () => {
  const ex = (id: string, debut: string, statut = 'OUVERT') => ({ id, dateDebut: debut, statut });

  it('celui qui suit immédiatement la réévaluation, et lui seul · jamais un plus lointain', () => {
    const liste = [ex('2028', '2028-01-01'), ex('2025', '2025-01-01'), ex('2026', '2026-01-01'), ex('2027', '2027-01-01')];
    expect(exerciceDeContrePassation(liste, '2026-12-31')?.id).toBe('2027');
  });

  it('l’exercice suivant clôturé est rendu tel quel · l’écran le dit, il n’en propose pas un autre', () => {
    const liste = [ex('2026', '2026-01-01'), ex('2027', '2027-01-01', 'CLOTURE'), ex('2028', '2028-01-01')];
    expect(exerciceDeContrePassation(liste, '2026-12-31')).toMatchObject({ id: '2027', statut: 'CLOTURE' });
  });

  it('aucun exercice suivant · `null`, que l’écran dit', () => {
    expect(exerciceDeContrePassation([ex('2026', '2026-01-01')], '2026-12-31')).toBeNull();
  });
});

describe('geste offert selon ce qui reste à contre-passer (M8)', () => {
  it('rien pour une réévaluation des seules disponibilités (AUDCIF art. 57) ou déjà contre-passée', () => {
    expect(libelleContrePassation(null)).toBeNull();
    expect(libelleContrePassation(undefined)).toBeNull();
  });

  it('les écarts de conversion seuls ; banque et caisse comprises par exception, dites au bouton', () => {
    expect(libelleContrePassation('ECARTS_DE_CONVERSION')).toMatch(/écarts de conversion/);
    expect(libelleContrePassation('INTEGRALE_ANCIEN_REGIME')).toMatch(/banque et caisse comprises/);
    expect(libelleContrePassation('INTEGRALE_SUR_DEMANDE')).toMatch(/intégrale/);
  });
});
