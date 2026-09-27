import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F154 · deux fenêtres prenaient d'office l'exercice le plus
 * récent de la liste · elles partent désormais de l'exercice du contexte
 * (`useExercice`), la liste ne servant que de repli, sans écraser un choix.
 */
for (const fichier of ['BalanceFonctionnellePage.tsx', 'ProvisionsPage.tsx']) {
  const page = readFileSync(join(__dirname, fichier), 'utf8');
  describe(`F154 · ${fichier} part de l'exercice du contexte`, () => {
    it('lit le contexte et s’y aligne', () => {
      expect(page).toContain('const { exerciceCourant } = useExercice();');
      expect(page).toContain('if (exerciceCourant) setExerciceId(exerciceCourant.id);');
    });
    it('le premier de la liste n’est qu’un repli, sans écraser le choix', () => {
      expect(page).toMatch(/setExerciceId\(\(choisi\) => choisi \|\| [lx]\[0\]\.id\)/);
    });
  });
}
