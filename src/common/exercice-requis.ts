import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * L'EXERCICE EXIGÉ, EN UN SEUL PORTEUR.
 *
 * Un `@Query` ou un `@Param` scalaire échappe au ValidationPipe global (il ne
 * valide que des classes), et un `exerciceId` absent arrive `undefined`
 * jusqu'à Prisma, qui IGNORE un champ `undefined` · le filtre d'exercice
 * disparaissait sans bruit, et un état, un export ou une lecture portait sur
 * TOUS les exercices du dossier en se présentant comme celui d'un seul. Un
 * état faux et non signalé, plus grave qu'une erreur (audit final F234).
 *
 * Le pipe vivait en HUIT copies · sept contrôleurs (états SYCEBNL et
 * SYSCOHADA, exports, documents obligatoires, notes annexes, registre des
 * donateurs, groupe) et le module de consolidation, qui le partageait avec
 * les états IFRS. Les sept disaient la même phrase, la huitième y ajoutait
 * son propre motif (« le périmètre, le cumul et les états se lisent par
 * exercice »). Une copie qui diverge d'un mot diverge un jour d'une règle ·
 * `exercice-requis.spec.ts` refuse désormais, route par route et sur les
 * métadonnées que Nest lit, tout `ParseUUIDPipe` posé sur un `exerciceId`
 * qui ne serait pas celui-ci.
 */
export const MESSAGE_EXERCICE_REQUIS =
  "Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide · chaque état et chaque lecture portent sur un seul exercice.";

export const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(MESSAGE_EXERCICE_REQUIS),
});

/**
 * La même exigence au service · un appel qui ne passe pas par la route (un
 * autre module, un traitement) ne doit pas davantage mêler les exercices. Le
 * format n'y est pas revérifié, la route l'a fait · seule l'absence l'est.
 */
export function exigerExercice(exerciceId: unknown): asserts exerciceId is string {
  if (typeof exerciceId !== 'string' || exerciceId.trim() === '') throw new BadRequestException(MESSAGE_EXERCICE_REQUIS);
}
