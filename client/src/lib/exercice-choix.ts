import type { Exercice } from './types';

/**
 * Quel exercice les écrans doivent-ils servir · fonction PURE du couple
 * (liste, choix mémorisé), sortie du composant pour être testable.
 *
 * Trois règles, et la troisième est le correctif du 6 septembre 2026 :
 *
 *  · le CHOIX DE L'UTILISATEUR prime toujours ;
 *  · un SEUL exercice ouvert est retenu sans discussion, il n'y a rien à
 *    trancher ;
 *  · PLUSIEURS exercices ouverts sans choix · le plus récent est encore
 *    retenu, mais le fait est DÉCLARÉ. Refuser d'afficher bloquerait le
 *    logiciel dans un cas parfaitement légitime (le 1er janvier, l'exercice
 *    suivant s'ouvre avant que le précédent soit clôturé, AUDCIF art. 23) ;
 *    choisir en silence est ce qui a été corrigé. La seule issue honnête est
 *    de choisir ET de le dire.
 */
export function resoudreExercice(
  exercices: Exercice[],
  choisiId: string | null,
): { exerciceCourant: Exercice | null; choixImplicite: boolean } {
  // Un identifiant mémorisé qui ne correspond à rien (exercice supprimé,
  // dossier restauré, mémoire d'un autre dossier) ne doit pas figer le
  // logiciel sur du vide.
  const choisi = choisiId ? (exercices.find((e) => e.id === choisiId) ?? null) : null;
  if (choisi) return { exerciceCourant: choisi, choixImplicite: false };

  const ouverts = exercices.filter((e) => e.statut === 'OUVERT');
  if (ouverts.length === 1) return { exerciceCourant: ouverts[0], choixImplicite: false };
  if (ouverts.length > 1) return { exerciceCourant: ouverts[0], choixImplicite: true };

  // Aucun exercice ouvert · le plus récent sert de fenêtre de consultation, et
  // ce n'est pas un choix implicite : il n'y avait pas d'alternative.
  return { exerciceCourant: exercices[0] ?? null, choixImplicite: false };
}
