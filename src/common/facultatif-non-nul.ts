import { IsDefined, ValidateIf } from 'class-validator';

/**
 * FACULTATIF NE VEUT PAS DIRE NULLABLE (correctif du 2026-09-28).
 *
 * `@IsOptional()` saute la validation sur `undefined` ET sur `null`. Sur un
 * champ dont la colonne n'admet pas `null` (un booléen, un entier, une
 * énumération, la raison sociale), le `null` passait donc la porte, puis le
 * service l'écrivait tel quel ou appelait `.trim()` dessus · Prisma refusait
 * l'écriture, ou une TypeError montait, et la réponse était un 500 sans
 * motif, sur une requête qui n'avait rien de légitime. Pire sur une date :
 * `new Date(null)` rend le 1er janvier 1970, et l'échéance d'une licence
 * posée ainsi coupait le cabinet et ses cellules sans rien dire.
 *
 * Ce décorateur remplace `@IsOptional()` sur ces champs · ABSENT reste
 * « inchangé », `null` est refusé en 400 avec le motif nommé, qui dit quel
 * geste l'appelant cherchait (« omettez le champ », « false », une valeur
 * explicite). Il ne se pose PAS sur un champ dont la colonne admet `null` et
 * dont `null` veut dire « effacer » · là, le service traduit `null` vers
 * l'effacement, comme les identifiants légaux et les dates effaçables.
 *
 * Deux conditions de class-validator doivent être vraies pour que les
 * validateurs du champ tournent · celle-ci ne saute que l'absence, et un
 * `@ValidateIf` voisin (la chaîne vide d'effacement d'une date) garde son
 * effet.
 */
export function FacultatifNonNul(motif: string): PropertyDecorator {
  return (cible: object, cle: string | symbol) => {
    ValidateIf((_objet: unknown, valeur: unknown) => valeur !== undefined)(cible, cle as string);
    IsDefined({ message: motif })(cible, cle as string);
  };
}
