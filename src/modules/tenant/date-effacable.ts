import { BadRequestException } from '@nestjs/common';

/**
 * DATE EFFAÇABLE DES PARAMÈTRES DU DOSSIER · audit final F237.
 *
 * Même convention que les autres champs effaçables des paramètres
 * (`ModifierIdentiteDto`, `ModifierCoordonneesDto`) : absent = inchangé,
 * chaîne vide = effacement (`null` en base), sinon la date saisie.
 *
 * La date d'option pour la TVA et celle de l'autorisation aux débits ne
 * s'effaçaient pas. `@IsDateString` refusait la chaîne vide et le service
 * passait toute valeur reçue à `new Date` : une date saisie par erreur restait
 * au dossier, et rien ne permettait de revenir à « pas de date ».
 *
 * `null` vaut effacement lui aussi. `@IsOptional` le laisse passer la
 * validation, et `new Date(null)` rend le 1er janvier 1970 · une date
 * inventée, posée en silence, là où l'appelant demandait un champ vide.
 *
 * UNE DATE QUE `new Date` NE SAIT PAS LIRE EST REFUSÉE ICI, EN 400 (relecture
 * adverse d'audit final F237). `@IsDateString` admet des formes ISO 8601 que
 * `new Date` ne lit pas (« 2026-W05 », « 2026-032 », « 20260101 ») : la date
 * invalide partait à Prisma, qui la refusait en 500, sans rien dire à
 * l'utilisateur de ce qui clochait. Et un jour qui n'existe pas au calendrier
 * (« 2026-02-30 ») passait les deux contrôles, `new Date` le reportant en
 * silence au 2 mars · une date que personne n'a saisie, posée au dossier.
 */
export function dateSaisieOuEffacement(valeur: string | null | undefined): Date | null | undefined {
  if (valeur === undefined) return undefined;
  if (valeur === null) return null;
  if (valeur.trim() === '') return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime()) || !jourDuCalendrier(valeur)) {
    throw new BadRequestException('Date illisible ou absente du calendrier · saisir une date au format AAAA-MM-JJ.');
  }
  return date;
}

/** Le jour écrit en tête (AAAA-MM-JJ), s'il y en a un, existe au calendrier. */
function jourDuCalendrier(valeur: string): boolean {
  const tete = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  if (!tete) return true;
  const [annee, mois, jour] = [Number(tete[1]), Number(tete[2]), Number(tete[3])];
  // `setUTCFullYear` et non `Date.UTC`, qui lit une année de 0 à 99 comme
  // 1900 à 1999 : le jour se vérifie sur l'année écrite, pas sur une autre.
  const d = new Date(0);
  d.setUTCFullYear(annee, mois - 1, jour);
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}
