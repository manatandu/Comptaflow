import { BadRequestException } from '@nestjs/common';

/**
 * LA PÉRIODE D'UNE LISTE DE TRAVAIL · audit final F188.
 *
 * La facturation, les devis et le registre des exonérations rendaient TOUT le
 * dossier à chaque ouverture de fenêtre, lignes comprises. Ils se lisent
 * désormais sur une période (`du`, `au`, jours au format AAAA-MM-JJ, bornes
 * comprises) et sous un plafond qui se DIT (§ 8 bis).
 *
 * UNE DATE ILLISIBLE EST REFUSÉE, JAMAIS IGNORÉE. Ignorée, elle élargirait la
 * lecture en silence, et une liste vide se lirait « rien sur la période »
 * alors que la période n'a jamais été appliquée. Le calendrier est vérifié
 * aussi · `new Date('2026-02-30')` rend le 2 mars sans rien dire, et la borne
 * glisserait de deux jours.
 *
 * Une chaîne VIDE vaut absence de borne, et c'est une lecture voulue · un
 * champ de date effacé à l'écran dit « depuis toujours » ou « sans fin », pas
 * une date fausse.
 *
 * La borne haute est EXCLUE au lendemain de `au` · un jour se compte entier,
 * quelle que soit l'heure portée par la colonne, et `lt` évite de fabriquer
 * une milliseconde de fin de journée.
 */
export interface PeriodeDeListe {
  /** Les jours tels qu'ils ont été demandés, rendus à l'écran pour qu'il les dise. */
  du: string | null;
  au: string | null;
  /** Le filtre Prisma du champ daté, `undefined` quand aucune borne n'est posée. */
  bornes: { gte?: Date; lt?: Date } | undefined;
}

const FORMAT_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

function lireJour(valeur: string, nom: 'du' | 'au'): Date {
  const m = FORMAT_JOUR.exec(valeur);
  const jour = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  // L'ALLER-RETOUR TRANCHE LE CALENDRIER · un 30 février revient en 2 mars, et
  // une année à deux chiffres revient en 19xx. Ce qui ne revient pas à
  // l'identique n'était pas un jour.
  if (!jour || jour.toISOString().slice(0, 10) !== valeur) {
    throw new BadRequestException(`Date « ${nom} » illisible : « ${valeur} » (AAAA-MM-JJ attendu).`);
  }
  return jour;
}

export function lirePeriodeDeListe(filtre: { du?: string | null; au?: string | null } = {}): PeriodeDeListe {
  const du = filtre.du ? lireJour(filtre.du, 'du') : null;
  const au = filtre.au ? lireJour(filtre.au, 'au') : null;
  if (du && au && du.getTime() > au.getTime()) {
    throw new BadRequestException('La date de début de la période dépasse sa date de fin.');
  }
  const lendemainDeAu = au ? new Date(au.getTime() + 24 * 60 * 60 * 1000) : null;
  return {
    du: du ? filtre.du! : null,
    au: au ? filtre.au! : null,
    bornes: du || lendemainDeAu ? { ...(du ? { gte: du } : {}), ...(lendemainDeAu ? { lt: lendemainDeAu } : {}) } : undefined,
  };
}
