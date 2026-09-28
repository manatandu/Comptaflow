import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dureeEnMois, periodesDeLExercice } from './mois-de-l-exercice';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * LES MOIS D'UN EXERCICE NE DÉPENDENT PAS DU FUSEAU DU POSTE.
 *
 * Le fuseau d'un processus se fixe à son démarrage, et la suite du client
 * tourne sans les outils du serveur qui rejouent un calcul dans un processus
 * fils (le job du client n'installe que `client/`). La lecture en UTC se gèle
 * donc par ce que le module APPELLE · chaque borne se lit par `getUTCFullYear`
 * et `getUTCMonth`, jamais à l'heure du poste. Le jumeau du serveur
 * (`src/modules/analytique/mois-de-l-exercice.spec.ts`) rejoue, lui, le
 * calcul sous trois fuseaux.
 */

describe('les mois de l’exercice, lus en UTC', () => {
  it('un premier exercice long montre ses dix-huit mois, du premier au dernier', () => {
    const p = periodesDeLExercice('2026-07-01T00:00:00.000Z', '2027-12-31T00:00:00.000Z');
    expect(p).toHaveLength(18);
    expect(p[0]).toEqual({ annee: 2026, mois: 6, libelle: 'Juillet 2026' });
    expect(p[17]).toEqual({ annee: 2027, mois: 11, libelle: 'Décembre 2027' });
    expect(dureeEnMois('2026-07-01T00:00:00.000Z', '2027-12-31T00:00:00.000Z')).toBe(18);
  });

  it('chaque borne se lit en UTC · l’année et le mois des deux dates', () => {
    const module = readFileSync(join(__dirname, 'mois-de-l-exercice.ts'), 'utf8');
    const corps = module.slice(module.indexOf('export function periodesDeLExercice'), module.indexOf('export function dureeEnMois'));
    expect(corps).toContain('const dernier = fin.getUTCFullYear() * 12 + fin.getUTCMonth();');
    expect(corps).toContain('for (let rang = debut.getUTCFullYear() * 12 + debut.getUTCMonth(); rang <= dernier; rang++) {');
  });

  it('la saisie et l’en-tête d’impression appellent ce module', () => {
    const saisie = readFileSync(join(__dirname, '..', 'pages', 'SaisiePage.tsx'), 'utf8');
    expect(saisie).toContain("import { periodesDeLExercice } from '../lib/mois-de-l-exercice';");
    expect(saisie).not.toContain('function periodesDeLExercice');
    const entete = readFileSync(join(__dirname, '..', 'components', 'chrome', 'EnteteImpression.tsx'), 'utf8');
    expect(entete).toContain('dureeEnMois(exerciceCourant.dateDebut, exerciceCourant.dateFin)');
    expect(entete).toContain("const jourUtc = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });");
    // Les trois dates de l'exercice imprimées passent par la lecture en UTC.
    for (const date of ['{jourUtc(debut)}', '{jourUtc(clos)}', '{jourUtc(arrete)}']) expect(entete).toContain(date);
  });
});
