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
 * L'EXERCICE FACULTATIF, ET CE QU'IL N'AUTORISE PAS.
 *
 * Quelques routes ont un sens SANS exercice · une liste de campagnes, de
 * questionnaires ou de registres, dont chaque ligne porte le sien, et le
 * journal, qui se filtre aussi par dates et dont l'export se titre alors
 * « Toutes périodes ». Absent, l'identifiant y reste absent, et c'est voulu.
 *
 * PRÉSENT ET ILLISIBLE, il y est refusé comme ailleurs (audit final F234,
 * suite) · une valeur comme « undefined », venue d'un écran qui interpole un
 * exercice pas encore choisi, filtrait sur un identifiant qui n'existe pas et
 * rendait une liste VIDE, lue comme « rien dans cet exercice ». Le message
 * n'est pas celui du porteur requis, qui dirait « requis » d'un paramètre qui
 * ne l'est pas. La liste fermée des routes qui le portent, chacune avec son
 * motif, est tenue par `exercice-requis.spec.ts`.
 */
export const MESSAGE_EXERCICE_ILLISIBLE =
  "Le paramètre exerciceId, quand il est donné, doit être un identifiant d'exercice valide · un identifiant illisible n'est jamais lu comme « tous les exercices » ni comme un exercice vide.";

export const EXERCICE_FACULTATIF = new ParseUUIDPipe({
  optional: true,
  exceptionFactory: () => new BadRequestException(MESSAGE_EXERCICE_ILLISIBLE),
});

/**
 * La même exigence au service · un appel qui ne passe pas par la route (un
 * autre module, un traitement) ne doit pas davantage mêler les exercices. Le
 * format n'y est pas revérifié, la route l'a fait · seule l'absence l'est.
 */
export function exigerExercice(exerciceId: unknown): asserts exerciceId is string {
  if (typeof exerciceId !== 'string' || exerciceId.trim() === '') throw new BadRequestException(MESSAGE_EXERCICE_REQUIS);
}
