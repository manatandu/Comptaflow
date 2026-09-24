/**
 * LE SALAIRE STIPULÉ EN DOLLARS · sa conversion en francs congolais.
 *
 * CE QUE DISENT LES TEXTES LUS, ET CE QU'ILS TAISENT.
 *  · Code du travail, art. 89 : « La rémunération doit être stipulée en
 *    monnaie ayant cours légal en République Démocratique du Congo. » Un
 *    contrat en dollars n'est donc pas conforme à la lettre, et le logiciel le
 *    rappelle à chaque calcul (AVERTISSEMENT_ARTICLE_89).
 *  · La loi n° 23/053 (IRPP) et les textes CNSS, INPP et ONEM ne libellent
 *    qu'en francs congolais, et aucun ne fixe le cours de conversion d'une
 *    rémunération en devises (recherche du 2026-09-24, plan item 11).
 *
 * LA RÈGLE RETENUE EST CELLE DU CABINET · décision de Manasse du 2026-09-24 :
 * « le taux est le taux actuel, donc il faudra toujours renseigner le taux
 * chaque jour ». D'où trois choix, et aucun autre :
 *  1. le cours est celui du JOUR du calcul, au calendrier de Kinshasa ;
 *  2. il se lit dans les cours saisis au dossier (Devises), pour la date
 *     EXACTE · jamais le dernier cours connu, qui ne serait pas « actuel » ;
 *  3. absent, le calcul est REFUSÉ et dit quel cours saisir · un salaire
 *     converti à un cours inventé serait faux sous l'apparence du juste.
 *
 * Seuls les ÉLÉMENTS DE RÉMUNÉRATION se convertissent. Les autres montants de
 * la simulation (autres retenues de l'art. 71, taux légal des allocations)
 * sont libellés « Fc » et le restent · le texte les donne en francs.
 */

export const AVERTISSEMENT_ARTICLE_89 =
  "Code du travail, art. 89 : « La rémunération doit être stipulée en monnaie ayant cours légal en République " +
  'Démocratique du Congo. » Ce salaire est stipulé en dollars américains · il est converti en francs congolais au ' +
  'cours du jour saisi au dossier, règle retenue par le cabinet faute de texte qui fixe ce cours pour la paie.';

/** Décalage de Kinshasa sur le temps universel (UTC+1, sans heure d'été). */
const DECALAGE_KINSHASA_MS = 60 * 60 * 1000;

/**
 * Le JOUR de Kinshasa d'un instant, à minuit UTC · c'est la forme sous
 * laquelle un cours est enregistré (`PoserCoursDto.date`, AAAA-MM-JJ lu en
 * UTC). Entre minuit et une heure du matin UTC, Kinshasa est déjà au
 * lendemain · prendre le jour UTC ferait chercher le cours de la veille.
 */
export function jourDeKinshasa(instant: Date): Date {
  const local = new Date(instant.getTime() + DECALAGE_KINSHASA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** JJ/MM/AAAA d'un jour à minuit UTC. */
export function jourLisible(jour: Date): string {
  const iso = jour.toISOString().slice(0, 10);
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/** Conversion au centime · montant en USD multiplié par le cours (FC pour 1 USD). */
export function usdEnFc(montantUsd: number, cours: number): number {
  return Math.round(montantUsd * cours * 100) / 100;
}

export function messageCoursManquant(jour: Date): string {
  return (
    `Aucun cours du dollar américain (USD) n'est renseigné pour aujourd'hui, ${jourLisible(jour)}. ` +
    'Le salaire stipulé en dollars se convertit au cours du jour, à saisir chaque jour dans Devises (cours de USD à ' +
    'cette date). Le cours d’un autre jour n’est jamais repris.'
  );
}
