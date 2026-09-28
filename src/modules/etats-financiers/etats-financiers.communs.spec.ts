import { NotFoundException } from '@nestjs/common';
import { ExerciceService } from '../exercice/exercice.service';
import { trouverExerciceN1 } from './etats-financiers.communs';

/**
 * `trouverExerciceN1` · la lecture commune du comparatif, et le REFUS d'un
 * exercice que le dossier ne porte pas (audit final F222). La balance ne
 * vérifie pas l'exercice qu'on lui passe : sans ce refus, un identifiant
 * inconnu, ou celui d'un autre dossier, rendait des états tout à zéro, dits
 * équilibrés.
 */
function exerciceService(exercices: Array<{ id: string; dateDebut: Date }>, tenant = 't1') {
  // Comme `ExerciceService.lister` · borné au dossier, trié par date de
  // début décroissante.
  return {
    lister: jest.fn().mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === tenant ? [...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime()) : [],
      ),
    ),
  } as unknown as ExerciceService;
}

const E2025 = { id: 'e2025', dateDebut: new Date('2025-01-01') };
const E2026 = { id: 'e2026', dateDebut: new Date('2026-01-01') };

describe('trouverExerciceN1', () => {
  it('rend l’exercice antérieur le plus récent', async () => {
    await expect(trouverExerciceN1(exerciceService([E2025, E2026]), 't1', 'e2026')).resolves.toBe('e2025');
  });

  it('rend null pour le premier exercice du dossier · le comparatif reste absent', async () => {
    await expect(trouverExerciceN1(exerciceService([E2025, E2026]), 't1', 'e2025')).resolves.toBeNull();
  });

  it('refuse un exercice inconnu du dossier par un 404 nommé', async () => {
    const promesse = trouverExerciceN1(exerciceService([E2025, E2026]), 't1', 'inconnu');
    await expect(promesse).rejects.toBeInstanceOf(NotFoundException);
    await expect(trouverExerciceN1(exerciceService([E2026]), 't1', 'inconnu')).rejects.toThrow(
      'Exercice introuvable dans ce dossier',
    );
  });

  it('refuse l’exercice d’un AUTRE dossier, même s’il existe ailleurs', async () => {
    await expect(trouverExerciceN1(exerciceService([E2025, E2026], 't1'), 't2', 'e2026')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
