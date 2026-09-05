import { StatutMessage } from '@prisma/client';
import {
  ATTENTES_MINUTES,
  PLAFOND_TENTATIVES,
  attenteApresEchec,
  prochainEssaiApresEchec,
  statutApresEchec,
} from './report-tentatives';

const MINUTE = 60_000;
const REFERENCE = new Date('2026-09-14T08:00:00.000Z');

describe('reprise sur échec · plafond et report', () => {
  it('le report CROÎT à chaque échec, il ne se répète pas', () => {
    // Un intervalle fixe et court martèle le serveur destinataire quand la
    // panne est durable · l'expéditeur finit classé indésirable, et c'est TOUT
    // le courrier du cabinet qui cesse d'arriver.
    const reports = [1, 2, 3, 4].map((n) => attenteApresEchec(n));
    expect(reports).toEqual([5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 240 * MINUTE]);
    for (let i = 1; i < reports.length; i += 1) {
      expect(reports[i]!).toBeGreaterThan(reports[i - 1]!);
    }
  });

  it('les quatre reports cumulés couvrent bien les 5 h 20 annoncées', () => {
    // Le commentaire du module justifie le plafond PAR ce cumul · s'ils
    // divergent, c'est la justification qui devient fausse, et une
    // justification fausse se change au hasard six mois plus tard.
    const cumul = ATTENTES_MINUTES.reduce((t, m) => t + m, 0);
    expect(cumul).toBe(5 * 60 + 20);
    expect(ATTENTES_MINUTES).toHaveLength(PLAFOND_TENTATIVES - 1);
  });

  it('la quatrième tentative laisse un ECHEC daté, la cinquième ABANDONNE', () => {
    expect(statutApresEchec(4)).toBe(StatutMessage.ECHEC);
    expect(prochainEssaiApresEchec(4, REFERENCE)).toEqual(new Date('2026-09-14T12:00:00.000Z'));

    expect(statutApresEchec(PLAFOND_TENTATIVES)).toBe(StatutMessage.ABANDONNE);
    // Un abandon SANS date de prochain essai · daté, il reparaîtrait
    // indéfiniment dans la reprise.
    expect(prochainEssaiApresEchec(PLAFOND_TENTATIVES, REFERENCE)).toBeNull();
    expect(attenteApresEchec(PLAFOND_TENTATIVES)).toBeNull();
  });

  it('le premier échec reporte de cinq minutes, pas plus', () => {
    expect(prochainEssaiApresEchec(1, REFERENCE)).toEqual(new Date('2026-09-14T08:05:00.000Z'));
  });

  it('un compte de tentatives incohérent ne date rien plutôt que de dater n’importe quoi', () => {
    expect(attenteApresEchec(0)).toBeNull();
    expect(attenteApresEchec(-3)).toBeNull();
    // Au-delà du plafond, ABANDONNE reste ABANDONNE.
    expect(statutApresEchec(PLAFOND_TENTATIVES + 7)).toBe(StatutMessage.ABANDONNE);
  });
});
