import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, Min, NotContains } from 'class-validator';
import { CARACTERE_NUL, instantTransmissible, TAILLE_PAGE_JOURNAL_MAX } from './journal-audit.service';

/**
 * FILTRE DU JOURNAL D'AUDIT · UN CRITÈRE ILLISIBLE EST UN REFUS, JAMAIS UN
 * CRITÈRE IGNORÉ (audit final F239).
 *
 * Le contrôleur recevait chaque paramètre en chaîne et le convertissait à la
 * main · `Number('abc')` rendait NaN, `new Date('hier')` une date invalide, et
 * les deux traversaient jusqu'à Prisma, qui les refusait par une erreur 500.
 * Une page demandée « abc » passait ainsi pour une panne du serveur, et un
 * paramètre répété (`?entite=a&entite=b`, qu'Express rend en tableau) aussi.
 *
 * Le DTO passe par le ValidationPipe global (bootstrap.ts · `whitelist`,
 * `forbidNonWhitelisted`, `transform`), si bien qu'un paramètre inconnu est
 * refusé lui aussi : ignoré, il se lirait « aucun résultat » sur un filtre
 * que le serveur n'a jamais appliqué.
 *
 * UNE EXCEPTION, ET ELLE N'EST PAS DANS CE FICHIER (relecture de F239) · un
 * paramètre qui porte le nom d'une méthode d'`Object.prototype`
 * (`?hasOwnProperty=x`, `?constructor=x`, `?toString=x`) est écarté par
 * class-transformer AVANT la validation, si bien que ni `whitelist` ni
 * `forbidNonWhitelisted` ne le voient, et il est ignoré en silence. Constaté
 * avec le ValidationPipe de production et l'analyseur de requête d'Express 4
 * (`allowPrototypes: true`). Aucun DTO ne peut le refuser, la clé ayant déjà
 * disparu quand il est lu · le refus se pose à l'analyseur de requête, dans
 * le montage de l'application.
 */

/**
 * LES DEUX FORMES ADMISES, et pourquoi pas davantage.
 *
 *  · AAAA-MM-JJ · une date seule, lue à minuit UTC, comme `new Date` l'a
 *    toujours lue sur cette route ;
 *  · AAAA-MM-JJTHH:MM[:SS[.mmm]] SUIVIE DE SON FUSEAU (Z ou ±HH:MM).
 *
 * Et l'instant, une fois ramené en UTC, reste dans les années 0000 à 9999 ·
 * un fuseau peut faire franchir la borne à une date bien écrite, et Prisma ne
 * transmet pas au-delà (`instantTransmissible`).
 *
 * `new Date` seul ne suffit pas à reconnaître une date : il lit « 1 » comme le
 * 1er janvier 2001 et « 2026-02-30 » comme le 2 mars, deux bornes plausibles
 * et fausses qu'aucun refus ne signalerait. Et une heure SANS fuseau se lit à
 * l'heure locale du processus · UTC sur Cloud Run, Kinshasa sur un poste sur
 * site · si bien que la même requête ne rendrait pas les mêmes événements
 * selon l'installation. Elle est donc refusée plutôt que devinée.
 */
const FORME_DATE_FILTRE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2})))?$/;

/** La date que le texte désigne, ou null s'il n'en désigne aucune sans ambiguïté. */
export function lireDateDuFiltre(texte: string): Date | null {
  const m = FORME_DATE_FILTRE.exec(texte);
  if (!m) return null;
  const [, a, mo, j, h, mi, s, , zh, zm] = m;
  const annee = Number(a);
  const mois = Number(mo);
  const jour = Number(j);
  // Le jour doit exister dans son mois · `setUTCFullYear` et non `Date.UTC`,
  // qui ramène une année de 0 à 99 au XXe siècle.
  const civil = new Date(0);
  civil.setUTCFullYear(annee, mois - 1, jour);
  if (civil.getUTCFullYear() !== annee || civil.getUTCMonth() !== mois - 1 || civil.getUTCDate() !== jour) {
    return null;
  }
  if (h !== undefined && (Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59))) return null;
  if (zh !== undefined && (Number(zh) > 23 || Number(zm) > 59)) return null;
  const date = new Date(texte);
  return instantTransmissible(date) ? date : null;
}

/**
 * Une chaîne lisible devient une Date ; tout le reste (texte illisible, chaîne
 * vide, paramètre répété) reste tel quel et tombe sur `@IsDate`.
 */
const enDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? lireDateDuFiltre(value) ?? value : value;

/**
 * Seuls des chiffres font un entier · `Number` lirait « 0x10 » comme 16,
 * « 1e2 » comme 100 et « » comme 0. Le reste reste tel quel et tombe sur
 * `@IsInt`, qui le refuse.
 */
const enEntier = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

/**
 * La page la plus haute dont le décalage (page - 1) × taille reste un entier
 * EXACT · au-delà, Prisma refuse le `skip` et la requête tombait en 500.
 */
export const PAGE_JOURNAL_MAX = Math.floor(Number.MAX_SAFE_INTEGER / TAILLE_PAGE_JOURNAL_MAX);

const MESSAGE_DATE =
  'attendu AAAA-MM-JJ, ou une date et heure ISO 8601 avec son fuseau (Z ou ±HH:MM), des années 0000 à 9999.';

export class FiltreJournalAuditDto {
  @IsOptional()
  @IsString({ message: 'Objet illisible · une seule valeur est attendue.' })
  @NotContains(CARACTERE_NUL, { message: 'Objet illisible · le caractère nul n’est pas admis.' })
  entite?: string;

  @IsOptional()
  @IsString({ message: 'Identifiant d’objet illisible · une seule valeur est attendue.' })
  @NotContains(CARACTERE_NUL, { message: 'Identifiant d’objet illisible · le caractère nul n’est pas admis.' })
  entiteId?: string;

  @IsOptional()
  @IsString({ message: 'Auteur illisible · une seule adresse est attendue.' })
  @NotContains(CARACTERE_NUL, { message: 'Auteur illisible · le caractère nul n’est pas admis.' })
  acteurEmail?: string;

  @IsOptional()
  @Transform(enDate)
  @IsDate({ message: `Date de début illisible · ${MESSAGE_DATE}` })
  depuis?: Date;

  @IsOptional()
  @Transform(enDate)
  @IsDate({ message: `Date de fin illisible · ${MESSAGE_DATE}` })
  jusqua?: Date;

  @IsOptional()
  @Transform(enEntier)
  @IsInt({ message: 'Numéro de page illisible · un entier positif est attendu.' })
  @Min(1, { message: 'Numéro de page illisible · un entier positif est attendu.' })
  @Max(PAGE_JOURNAL_MAX, { message: 'Numéro de page hors limite.' })
  page?: number;

  @IsOptional()
  @Transform(enEntier)
  @IsInt({ message: `Taille de page illisible · un entier de 1 à ${TAILLE_PAGE_JOURNAL_MAX} est attendu.` })
  @Min(1, { message: `Taille de page illisible · un entier de 1 à ${TAILLE_PAGE_JOURNAL_MAX} est attendu.` })
  @Max(TAILLE_PAGE_JOURNAL_MAX, {
    message: `Taille de page illisible · un entier de 1 à ${TAILLE_PAGE_JOURNAL_MAX} est attendu.`,
  })
  taille?: number;
}
