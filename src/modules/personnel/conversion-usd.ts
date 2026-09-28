import { jourDeKinshasa } from '../../common/echeance';

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

/**
 * Le JOUR de Kinshasa d'un instant, à minuit UTC · c'est la forme sous
 * laquelle un cours est enregistré (`PoserCoursDto.date`, AAAA-MM-JJ lu en
 * UTC). La définition vit dans `common/echeance.ts`, qui la partage avec
 * toutes les échéances du dépôt (audit final F81).
 */
export { jourDeKinshasa } from '../../common/echeance';

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

/**
 * Le refus dit OÙ coter et QUI peut le faire (audit final F247) · il renvoyait
 * à « Devises » sans dire que le gestionnaire de paie, qui le lit le premier,
 * y cote désormais ce cours-là, ni que la devise USD s'ajoute d'abord par
 * l'administrateur quand le dossier ne l'a pas.
 */
export function messageCoursManquant(jour: Date): string {
  return (
    `Aucun cours du dollar américain (USD) n'est renseigné pour aujourd'hui, ${jourLisible(jour)}. ` +
    'Le salaire stipulé en dollars se convertit au cours du jour : cotez-le dans la fenêtre Devises (« Coter un ' +
    'cours », USD, date du jour), ouverte au gestionnaire de paie pour ce seul cours. Sans devise USD au dossier, ' +
    "l'administrateur l'ajoute d'abord. Le cours d’un autre jour n’est jamais repris."
  );
}

/** La seule devise que la paie convertit · `PersonnelService` lit le cours de ce code. */
export const DEVISE_DE_LA_PAIE = 'USD';

/**
 * LE GESTIONNAIRE DE PAIE COTE LE COURS QUE SA PAIE LIT, ET AUCUN AUTRE
 * (audit final F247). Sa paie stipulée en dollars exige le cours du jour, et
 * la fenêtre Devises lui était fermée · chaque jour de paie dépendait d'un
 * comptable. La cotation lui est ouverte (`DevisesController.poserCours`),
 * bornée à ce que `PersonnelService` lit, le cours de l'USD à la date EXACTE
 * du jour de Kinshasa :
 *  · une autre devise ne sert à aucune paie ;
 *  · un autre jour réécrirait un cours qui a pu servir ailleurs (la
 *    réévaluation de clôture, qui prend le dernier cours à la date d'arrêté,
 *    le second jeu en monnaie fonctionnelle, qui prend le cours en vigueur à
 *    la date de l'écriture), et un cours futur n'est pas le cours « actuel »
 *    que la règle du cabinet retient ;
 *  · la date se compare à l'INSTANT, pas au seul jour · la paie cherche le
 *    cours par égalité sur minuit UTC, et un cours posé à une autre heure du
 *    même jour ne serait jamais lu ;
 *  · un cours du jour DÉJÀ COTÉ ne se réécrit pas par lui (relecture adverse
 *    de F247) · `CoursDevise` n'est pas au journal d'audit
 *    (`NON_AUDITES_MOTIVES`), et réécrit par le gestionnaire, le cours que le
 *    comptable a posé changerait sans trace, alors qu'il sert aussi hors de
 *    la paie le jour même · la facture d'abonnement de l'éditeur, qui le lit
 *    à la date exacte, le second jeu en monnaie fonctionnelle et le cours
 *    proposé en saisie. Il vient combler le cours qui manque à sa paie,
 *    jamais trancher un cours qui existe · une faute de frappe se corrige par
 *    le comptable, et un bulletin émis fige le cours qu'il a lu
 *    (`calcul.conversion`).
 * Ce dernier refus n'est PAS dans cette règle, et c'est voulu (2026-09-28).
 * Il y était, sur les dates des cours que la liste du dossier renvoyait,
 * devant une cotation qui était un `upsert` · deux trous. La liste ne rend que
 * les douze cours les plus RÉCENTS, si bien qu'un cours du jour suivi de
 * douze cours postérieurs n'y figurait pas ; et un cours posé entre la lecture
 * et l'écriture était réécrit quand même. La voie du gestionnaire est
 * désormais une CRÉATION seule (`DevisesService.ajouterCours`), que la clé
 * unique (devise, date) refuse en 409 avec `messageCoursDejaCote` · la base
 * tranche, à l'instant de l'écriture, sur tous les cours.
 * La création d'une devise et la réévaluation restent fermées au
 * gestionnaire, par leurs routes.
 */
export function motifRefusCotationGestionnairePaie(codeDevise: string, dateCours: string, maintenant: Date): string | null {
  if (codeDevise.toUpperCase() !== DEVISE_DE_LA_PAIE) {
    return (
      'Le gestionnaire de paie ne cote que le dollar américain (USD), la seule devise que la paie convertit · ' +
      'les autres cours se cotent par le comptable.'
    );
  }
  const jour = jourDeKinshasa(maintenant);
  if (new Date(dateCours).getTime() !== jour.getTime()) {
    return (
      `Le gestionnaire de paie ne cote que le cours du jour, celui que la paie lit : le ${jourLisible(jour)}. ` +
      'Un autre jour se cote par le comptable.'
    );
  }
  return null;
}

/** Le refus du cours du jour déjà coté · rendu en 409 par la création seule du gestionnaire. */
export function messageCoursDejaCote(jour: Date): string {
  return `Le cours de l'USD du ${jourLisible(jour)} est déjà coté, et la paie le lit · une correction se demande au comptable.`;
}
