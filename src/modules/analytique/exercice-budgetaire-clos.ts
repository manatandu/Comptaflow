import { BadRequestException } from '@nestjs/common';
import { StatutExercice } from '@prisma/client';

/**
 * UN EXERCICE CLÔTURÉ NE CHANGE PLUS DE BUDGET NI D'ENGAGEMENTS (audit final
 * F143).
 *
 * Le tableau d'exécution budgétaire (notes 35 des associations et 24 des
 * projets) lit trois choses : les budgets de l'exercice, ses écritures, et ses
 * engagements hors comptabilité. Les écritures d'un exercice clôturé sont
 * figées (AUDCIF art. 22, 2°), et l'OD analytique l'était déjà
 * (`OdAnalytiqueService`). Les budgets et les engagements, eux, se
 * retouchaient · la note d'un exercice arrêté et déposé changeait alors sans
 * qu'aucune écriture n'ait bougé, et rien ne le disait.
 *
 * Une seule règle, appelée par la dotation, la retouche d'un mois, le report
 * des budgets, la suppression d'une section et chaque geste sur un
 * engagement · une garde recopiée dans chaque méthode aurait divergé au
 * premier correctif.
 */
export const MOTIF_EXERCICE_BUDGETAIRE_CLOS =
  "L'exercice est clôturé · son budget et ses engagements ne se modifient plus, comme son analytique : " +
  "le tableau d'exécution budgétaire d'un exercice arrêté ne doit pas changer après coup.";

export function refuserSiExerciceBudgetaireClos(statut: StatutExercice | string) {
  if (statut === StatutExercice.CLOTURE) throw new BadRequestException(MOTIF_EXERCICE_BUDGETAIRE_CLOS);
}
