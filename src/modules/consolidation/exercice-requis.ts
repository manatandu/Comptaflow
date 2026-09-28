import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

const MESSAGE = "Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide · le périmètre, le cumul et les états se lisent par exercice.";

/**
 * L'EXERCICE EST EXIGÉ SUR LES LECTURES DU GROUPE ET DES ÉTATS IFRS (audit
 * final F234). Un `@Query` scalaire échappe au ValidationPipe global, et un
 * `exerciceId` absent arrive `undefined` jusqu'à Prisma, qui IGNORE un champ
 * `undefined` · le périmètre se lisait alors sur TOUS les exercices du
 * dossier, entités et participations de plusieurs années mêlées, sous
 * l'intitulé d'un seul. Même pipe que les exports et les états SYSCOHADA.
 */
export const EXERCICE_REQUIS = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException(MESSAGE) });

/**
 * La même exigence au service · un appel qui ne passe pas par la route (un
 * autre module, un traitement) ne doit pas davantage mêler les exercices. Le
 * format n'y est pas revérifié, la route l'a fait · seule l'absence l'est.
 */
export function exigerExercice(exerciceId: unknown): asserts exerciceId is string {
  if (typeof exerciceId !== 'string' || exerciceId.trim() === '') throw new BadRequestException(MESSAGE);
}
