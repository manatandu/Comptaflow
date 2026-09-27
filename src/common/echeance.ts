/**
 * UNE ÉCHÉANCE SE LIT AU JOUR, ET AU JOUR DE KINSHASA (audit final F81).
 *
 * Convention unique du dépôt pour toute date d'obligation · un JOUR est une
 * date à minuit UTC (la forme sous laquelle la base rend une `@db.Date` et
 * sous laquelle `dateJalon` et les échéances des retenues sont construites),
 * et « aujourd'hui » est le jour civil de Kinshasa (UTC+1, sans heure d'été)
 * ramené à cette forme. Trois défauts qu'elle ferme :
 *
 *  · l'échéance comparée à l'INSTANT présent était « en retard » dès minuit
 *    UTC du jour limite, quand le redevable a la journée entière ;
 *  · les échéances des retenues se construisaient en heure LOCALE du poste ·
 *    sur un PC installé à Kinshasa, minuit local est 23 h UTC la veille, et
 *    la date affichée reculait d'un jour ;
 *  · le planning disait « UTC partout » et le registre des retenues ne
 *    l'était pas.
 *
 * Le pays a deux fuseaux (Kinshasa UTC+1, Lubumbashi UTC+2) · Kinshasa est la
 * convention déjà retenue pour le cours du jour de la paie
 * (`personnel/conversion-usd.ts`), et c'est la même ici.
 */

/** Décalage de Kinshasa sur le temps universel (UTC+1, sans heure d'été). */
const DECALAGE_KINSHASA_MS = 60 * 60 * 1000;

/**
 * Le JOUR de Kinshasa d'un instant, à minuit UTC. Entre minuit et une heure du
 * matin UTC, Kinshasa est déjà au lendemain.
 */
export function jourDeKinshasa(instant: Date): Date {
  const local = new Date(instant.getTime() + DECALAGE_KINSHASA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * Le même jour, écrit AAAA-MM-JJ · la forme d'une date enregistrée ou affichée
 * (licence, encaissement). UNE seule définition, que les modules appellent au
 * lieu de refaire le décalage à la main (audit final F113).
 */
export function jourDeKinshasaIso(instant: Date): string {
  return jourDeKinshasa(instant).toISOString().slice(0, 10);
}

/** Le jour UTC d'une date · pour une date déjà à minuit UTC, elle-même. */
export function jourUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Une échéance n'est DÉPASSÉE qu'au lendemain · le jour même, l'obligation
 * s'exécute encore dans le délai. `aujourdhui` est un jour (`jourDeKinshasa`).
 */
export function echeanceDepassee(echeance: Date, aujourdhui: Date): boolean {
  return jourUtc(echeance).getTime() < jourUtc(aujourdhui).getTime();
}
