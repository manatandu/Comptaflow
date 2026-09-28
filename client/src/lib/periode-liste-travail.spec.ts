/**
 * AUDIT FINAL F188 · la période par défaut des listes de travail, et ce que
 * l'écran en dit. La facturation, les devis et le registre des exonérations
 * recevaient tout le dossier ; le serveur lit désormais une période et dit sa
 * tranche, et l'écran doit dire laquelle il a demandée.
 */
import {
  horsPeriode,
  jourDuPoste,
  libellePeriode,
  libelleTranche,
  periodeParDefaut,
  requetePeriode,
} from './periode-liste-travail';

describe('La période par défaut', () => {
  it('prend l’EXERCICE COURANT du sélecteur quand il y en a un', () => {
    const p = periodeParDefaut({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' }, new Date(2026, 8, 28));
    expect(p).toEqual({ du: '2026-01-01', au: '2026-12-31', origine: 'EXERCICE' });
  });

  it('prend les DOUZE DERNIERS MOIS sans exercice, ouverts vers l’avant', () => {
    expect(periodeParDefaut(null, new Date(2026, 8, 28))).toEqual({ du: '2025-09-28', au: null, origine: 'DOUZE_MOIS' });
  });

  it('un 29 février recule au 28 · la date ne déborde pas sur le 1er mars', () => {
    expect(periodeParDefaut(null, new Date(2028, 1, 29)).du).toBe('2027-02-28');
  });

  it('le jour est celui du poste, au format que le serveur lit', () => {
    expect(jourDuPoste(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('La requête', () => {
  it('envoie les deux bornes, et rien pour une borne absente', () => {
    expect(requetePeriode({ du: '2026-01-01', au: '2026-12-31' })).toBe('?du=2026-01-01&au=2026-12-31');
    expect(requetePeriode({ du: '2025-09-28', au: null })).toBe('?du=2025-09-28');
    expect(requetePeriode({ du: null, au: null })).toBe('');
  });
});

describe('Ce que l’écran dit', () => {
  it('nomme la période et son origine', () => {
    expect(libellePeriode({ du: '2026-01-01', au: '2026-12-31' }, 'EXERCICE')).toBe('Du 01/01/2026 au 31/12/2026 · exercice courant');
    expect(libellePeriode({ du: '2025-09-28', au: null }, 'DOUZE_MOIS')).toBe('Depuis le 28/09/2025 · douze derniers mois');
    expect(libellePeriode({ du: null, au: null }, 'CHOISIE')).toBe('Toutes dates');
  });

  it('dit la tranche quand elle en est une, et se tait sur une liste entière', () => {
    expect(libelleTranche({ total: 1234, tronque: true }, 500)).toBe('500 affichés sur 1234 · resserrez la période.');
    expect(libelleTranche({ total: 12, tronque: false }, 12)).toBeNull();
  });

  it('reconnaît une pièce datée hors de la période affichée, bornes comprises', () => {
    const p = { du: '2026-01-01', au: '2026-12-31' };
    expect(horsPeriode('2026-01-01', p)).toBe(false);
    expect(horsPeriode('2026-12-31', p)).toBe(false);
    expect(horsPeriode('2025-12-31', p)).toBe(true);
    expect(horsPeriode('2027-01-01', { du: '2026-01-01', au: null })).toBe(false);
  });
});
