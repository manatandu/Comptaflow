import { dateQuittee } from './date-quittee';

/**
 * AUDIT FINAL F237 · les dates du régime de TVA s'effacent en vidant la case.
 * Le serveur lit la chaîne vide comme un effacement ; encore faut-il que
 * l'écran l'envoie, et qu'il ne l'envoie pas sur une saisie à moitié tapée.
 */
describe('date quittée · ce que la case envoie', () => {
  it('la case vidée envoie la chaîne vide, qui efface la date enregistrée', () => {
    expect(dateQuittee('', false, '2025-07-01T00:00:00.000Z')).toEqual({ etat: 'A_ENVOYER', valeur: '' });
  });

  it('une nouvelle date part au format de la case', () => {
    expect(dateQuittee('2026-02-16', false, null)).toEqual({ etat: 'A_ENVOYER', valeur: '2026-02-16' });
    expect(dateQuittee('2026-02-16', false, '2025-07-01T00:00:00.000Z')).toEqual({
      etat: 'A_ENVOYER',
      valeur: '2026-02-16',
    });
  });

  it('une saisie incomplète ne part pas · lue comme vide, elle effacerait la date', () => {
    expect(dateQuittee('', true, '2025-07-01T00:00:00.000Z')).toEqual({ etat: 'INCOMPLETE' });
  });

  it('une date inchangée ne part pas · le serveur la rend en ISO complet', () => {
    expect(dateQuittee('2025-07-01', false, '2025-07-01T00:00:00.000Z')).toEqual({ etat: 'INCHANGEE' });
    expect(dateQuittee('', false, null)).toEqual({ etat: 'INCHANGEE' });
  });
});
