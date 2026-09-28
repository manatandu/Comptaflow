import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireLesExercices } from './lecture-exercices';
import type { Exercice } from './types';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F248 · le contexte d'exercice n'avait ni `try` ni `finally` :
 * un refus du serveur laissait `chargement` à vrai pour toujours, et rien ne
 * disait que la lecture avait échoué.
 */
const EX = { id: 'e1', tenantId: 't1', statut: 'OUVERT', dateDebut: '2026-01-01', dateFin: '2026-12-31' } as unknown as Exercice;

describe('lireLesExercices · un échec rend son motif, jamais une liste vide', () => {
  it('rend la liste lue', async () => {
    expect(await lireLesExercices(null, async () => [EX])).toEqual({ liste: [EX], erreur: null });
  });

  it('un refus rend le motif, et la liste reste null · « aucun exercice » ne se dit que sur une liste lue', async () => {
    const lu = await lireLesExercices(null, async () => {
      throw new Error('Service indisponible');
    });
    expect(lu).toEqual({ liste: null, erreur: 'Service indisponible' });
  });

  it('un refus sans message garde un motif lisible', async () => {
    const lu = await lireLesExercices(null, () => Promise.reject('coupure'));
    expect(lu.liste).toBeNull();
    expect(lu.erreur).toBe("Les exercices n'ont pas pu être lus.");
  });

  it('la réponse préchargée est reprise, et redemandée une fois si elle a échoué', async () => {
    let appels = 0;
    const lire = async () => {
      appels += 1;
      return [EX];
    };
    expect(await lireLesExercices(Promise.resolve([EX]), lire)).toEqual({ liste: [EX], erreur: null });
    expect(appels).toBe(0);
    expect(await lireLesExercices(Promise.reject(new Error('401')), lire)).toEqual({ liste: [EX], erreur: null });
    expect(appels).toBe(1);
  });

  it('préchargement et relecture tous deux refusés · c’est la relecture qui parle', async () => {
    const lu = await lireLesExercices(Promise.reject(new Error('préchargement')), async () => {
      throw new Error('relecture');
    });
    expect(lu).toEqual({ liste: null, erreur: 'relecture' });
  });
});

describe('le contexte referme toujours son chargement, et l’erreur se lit à l’écran', () => {
  const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');

  it('recharger passe par lireLesExercices et referme le chargement dans un finally', () => {
    const source = lire('lib/exercice.tsx');
    const debut = source.indexOf('const recharger = async');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  };', debut));
    expect(corps).toContain('await lireLesExercices(');
    expect(corps).toContain('setErreur(lu.erreur);');
    // Une relecture manquée garde la liste déjà lue · une liste vide se
    // lirait « aucun exercice ».
    expect(corps).toContain('if (lu.liste) setExercices(lu.liste);');
    expect(corps).toMatch(/\} finally \{\s*setChargement\(false\);\s*\}/);
  });

  it('le contexte expose le motif', () => {
    expect(lire('lib/exercice.tsx')).toContain(
      'value={{ exerciceCourant, exercices, chargement, recharger, choisir, choixImplicite, erreur }}',
    );
  });

  it('la barre d’état l’affiche, même sans aucun exercice lu', () => {
    const source = lire('components/chrome/SelecteurExercice.tsx');
    expect(source).toContain('title={erreur}');
    expect(source).toContain("'· Exercices illisibles'");
    expect(source).toContain('if (!exerciceCourant) return alerteLecture;');
  });

  it('la fenêtre Exercices l’affiche à la place d’un « Chargement… » sans fin', () => {
    const source = lire('pages/ExercicePage.tsx');
    expect(source).toContain('erreur: erreurExercices,');
    // Une liste gardée après une relecture manquée n'est pas dite illisible ·
    // elle est dite non relue, comme dans la barre d'état.
    expect(source).toContain(
      "{exercices.length > 0 ? 'Exercices non relus' : 'Exercices illisibles'} · {erreurExercices}",
    );
  });
});
