import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bornesDuMois } from './mois-de-l-exercice';

/**
 * LES BORNES D'UN MOIS DE L'EXERCICE NE DÉPENDENT PAS DU FUSEAU DU SERVEUR.
 *
 * Le fuseau d'un processus se fixe à son démarrage · le même calcul est donc
 * rejoué dans un processus fils par fuseau, dont un à l'ouest de Greenwich,
 * le seul où l'ancienne lecture locale se trompait.
 */
const SCRIPT = `
  const { bornesDuMois } = require('./src/modules/analytique/mois-de-l-exercice');
  const civil = bornesDuMois(new Date(Date.UTC(2026, 0, 1)), 1);
  const decale = bornesDuMois(new Date(Date.UTC(2026, 6, 1)), 3);
  console.log(JSON.stringify({
    janvierDebut: civil.debut.toISOString(),
    janvierFin: civil.fin.toISOString(),
    marsDebut: decale.debut.toISOString(),
    marsFin: decale.fin.toISOString(),
  }));
`;

describe('bornesDuMois · le mois choisi, en UTC', () => {
  it('le mois qui précède l’ouverture tombe l’année suivante, fin au dernier jour 23 h 59 min 59 s', () => {
    const { debut, fin } = bornesDuMois(new Date(Date.UTC(2026, 6, 1)), 2);
    expect(debut.toISOString()).toBe('2027-02-01T00:00:00.000Z');
    expect(fin.toISOString()).toBe('2027-02-28T23:59:59.000Z');
  });

  for (const tz of ['Africa/Kinshasa', 'America/Bogota', 'Asia/Tokyo']) {
    it(`${tz} · une écriture datée du 1er janvier à minuit UTC est dans janvier`, () => {
      const sortie = execFileSync(
        join(__dirname, '../../../node_modules/.bin/ts-node'),
        ['-T', '-O', '{"module":"commonjs"}', '-e', SCRIPT],
        { cwd: join(__dirname, '../../..'), env: { ...process.env, TZ: tz }, encoding: 'utf8' },
      );
      expect(JSON.parse(sortie)).toEqual({
        janvierDebut: '2026-01-01T00:00:00.000Z',
        janvierFin: '2026-01-31T23:59:59.000Z',
        marsDebut: '2027-03-01T00:00:00.000Z',
        marsFin: '2027-03-31T23:59:59.000Z',
      });
    }, 60_000);
  }

  it('l’état budgétaire appelle cette règle et ne recompose plus le mois à l’heure locale', () => {
    const service = readFileSync(join(__dirname, 'etats-analytiques.service.ts'), 'utf8');
    expect(service).toContain('({ debut, fin } = bornesDuMois(exercice.dateDebut, params.mois));');
  });
});
