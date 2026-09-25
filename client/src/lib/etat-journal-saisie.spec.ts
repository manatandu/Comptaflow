import { ETATS_JOURNAL, bulleCase, moisCourt, sigleCase } from './etat-journal-saisie';

describe('Journaux de saisie · la case', () => {
  it('nomme l’état, le volume, le brouillard et la date de gel', () => {
    expect(
      bulleCase({ mois: '2026-03', etat: 'BROUILLARD', nombreEcritures: 4, enBrouillard: 1, aNouveauProvisoire: 0, figeJusquau: '2026-03-15' }),
    ).toBe("Brouillard · 4 écritures · 1 au brouillard · figé jusqu'au 15/03/2026");
    expect(bulleCase({ mois: '2026-01', etat: 'VIDE', nombreEcritures: 0, enBrouillard: 0, aNouveauProvisoire: 0, figeJusquau: null })).toBe(
      'Aucune écriture',
    );
  });

  it('les quatre états servis, « non imprimé » absent', () => {
    expect(Object.keys(ETATS_JOURNAL).sort()).toEqual(['BROUILLARD', 'CLOTURE', 'JOURNAL', 'VIDE']);
  });
});

describe('Journaux de saisie · sigles et entêtes', () => {
  it('un mois qui ne porte que l’à-nouveau provisoire dit « AN », pas vide', () => {
    expect(sigleCase({ mois: '2026-01', etat: 'VIDE', nombreEcritures: 1, enBrouillard: 0, aNouveauProvisoire: 1, figeJusquau: null })).toBe('AN');
    expect(bulleCase({ mois: '2026-01', etat: 'VIDE', nombreEcritures: 1, enBrouillard: 0, aNouveauProvisoire: 1, figeJusquau: null })).toBe(
      'À-nouveau provisoire seul · au brouillard jusqu’à la clôture',
    );
    expect(sigleCase({ mois: '2026-01', etat: 'JOURNAL', nombreEcritures: 3, enBrouillard: 0, aNouveauProvisoire: 1, figeJusquau: null })).toBe('J');
  });
  it('juin et juillet ne se confondent pas', () => {
    expect(moisCourt(5)).not.toBe(moisCourt(6));
  });
});
