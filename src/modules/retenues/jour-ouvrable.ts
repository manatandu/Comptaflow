/**
 * REPORT D'UNE ÉCHÉANCE FISCALE TOMBANT UN JOUR NON OUVRABLE.
 *
 * Loi n° 004/2003 portant réforme des procédures fiscales, Livre II, Titre VI,
 * chapitre unique, art. 110 bis, alinéa 2 (créé par la L.F. n° 21/029 du
 * 31 décembre 2021), VERBATIM :
 *
 *   « Si le dernier jour du délai prescrit par la législation fiscale pour
 *   l'exécution d'une obligation ou l'exercice d'un droit est un jour non
 *   ouvrable, la date de l'exécution d'une obligation ou l'exercice d'un droit
 *   est reportée au premier jour ouvrable qui suit. »
 *
 * POURQUOI CE FICHIER EXISTE · le registre des retenues calculait ses échéances
 * en dates calendaires brutes et en tirait un « en retard » catégorique, en
 * rouge, plus un avertissement de non-déductibilité au titre de l'art. 20. Le
 * 15 février 2026 est un DIMANCHE : le redevable est dans les délais toute la
 * journée du lundi 16, et OmegaX lui écrivait « 1 mois en retard » dès le 16.
 * C'est le § 10 bis de CLAUDE.md dans sa forme la plus coûteuse · un contrôle
 * qui FABRIQUE une anomalie, que le cabinet corrige, et dont personne ne saura
 * jamais qu'elle n'existait pas. Le cas n'est pas rare : en 2026, l'échéance du
 * 15 tombe un dimanche en février, mars et novembre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA DÉFINITION VIENT DU CODE DU TRAVAIL, ET C'EST UNE TRANSPOSITION DÉCLARÉE.
 *
 * La législation fiscale emploie « jour ouvrable » sans jamais le définir · ni
 * l'art. 110 bis, ni aucun article du Livre II lu à la passe F10. La seule
 * définition congolaise lue est celle du Code du travail, art. 7, 9° :
 *
 *   « Jour ouvrable : chaque jour de la semaine à l'exception du jour de repos
 *   hebdomadaire et des jours fériés légaux. »
 *
 * Elle est reprise ici FAUTE DE DÉFINITION FISCALE, et le dire importe : c'est
 * un emprunt à un autre corpus, pas une règle de droit fiscal. Un texte fiscal
 * qui définirait le terme autrement primerait celui-ci.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE SAMEDI EST OUVRABLE, ET C'EST LA DÉCISION QUI COMPTE LE PLUS ICI.
 *
 * Code du travail, art. 121, alinéa 2 : le repos hebdomadaire « a lieu le
 * dimanche ». UN SEUL jour de repos par semaine, et l'art. 7, 9° n'exclut que
 * celui-là et les jours fériés. La semaine congolaise compte donc SIX jours
 * ouvrables, ce que confirme la base de calcul de 26 jours par mois retenue
 * pour le décompte final.
 *
 * Traiter le samedi comme non ouvrable reporterait au lundi une échéance que la
 * loi ne reporte pas · le logiciel dirait au redevable qu'il a jusqu'au lundi
 * alors qu'il est en retard depuis le samedi. C'EST LA DIRECTION D'ERREUR LA
 * PLUS DANGEREUSE DES DEUX : ne pas signaler un retard qui court coûte une
 * pénalité, là où en signaler un qui n'existe pas coûte une vérification. Le
 * 25 juillet 2026, première échéance d'acompte, est un samedi · il n'est pas
 * reporté.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES JOURS FÉRIÉS NE SONT PAS CALCULÉS, ET LE DIRE FAIT PARTIE DE LA RÈGLE.
 *
 * Code du travail, art. 123 : « Le Président de la République fixe, par décret
 * [...] la liste des jours fériés légaux. » CE DÉCRET N'EST DANS AUCUNE SOURCE
 * LUE. Aucune liste de jours fériés congolais ne peut donc être écrite ici sans
 * l'inventer, et une liste inventée serait pire que l'absence : elle reporterait
 * des échéances au hasard et couvrirait de vrais retards.
 *
 * Le report ne porte donc QUE sur le dimanche, et la réserve est rendue avec
 * l'état (`RESERVE_JOUR_OUVRABLE`) plutôt que tue. Une échéance tombant un jour
 * férié est encore présentée comme échue alors que la loi la reporte · c'est
 * une limite ASSUMÉE, écrite, et refermable le jour où le décret entre au
 * corpus.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ET LE REPORT N'EST PAS INCONDITIONNEL · l'alinéa 3 joue en sens inverse.
 *
 * Art. 110 bis, alinéa 3 : « Par dérogation aux dispositions de l'alinéa
 * précédent, l'Administration des Impôts peut, en matière de déclaration et de
 * paiement des impôts, fixer l'échéance déclarative et de paiement au jour
 * ouvrable PRÉCÉDANT la date de l'échéance légale. » L'Administration peut donc
 * ANTICIPER. Cet acte n'est dans aucune comptabilité et OmegaX ne peut pas le
 * connaître : il est nommé dans la réserve, jamais calculé.
 */

/** Dimanche, au sens de `Date.prototype.getDay()`. */
const DIMANCHE = 0;

/**
 * Un jour est-il ouvrable au sens de l'art. 7, 9° du Code du travail, dans la
 * mesure de ce qui est calculable ?
 *
 * Rend `false` pour le seul dimanche. Un jour férié légal rend `true` faute de
 * liste · voir l'en-tête, la limite est assumée et déclarée.
 */
export function estJourOuvrable(date: Date): boolean {
  return date.getDay() !== DIMANCHE;
}

/**
 * Reporte une échéance au premier jour ouvrable qui suit, art. 110 bis, al. 2.
 *
 * La date d'entrée n'est JAMAIS modifiée en place · les appelants gardent des
 * échéances calculées ailleurs, et muter l'objet reçu ferait dériver un tableau
 * entier à la première lecture.
 */
export function reporterAuJourOuvrable(echeance: Date): Date {
  const reportee = new Date(echeance.getTime());
  while (!estJourOuvrable(reportee)) {
    reportee.setDate(reportee.getDate() + 1);
  }
  return reportee;
}

/**
 * L'échéance a-t-elle été déplacée par le report ? Sert à l'affichage · une
 * date reportée doit pouvoir dire POURQUOI elle ne tombe pas le 15.
 */
export function echeanceReportee(echeanceLegale: Date): boolean {
  return !estJourOuvrable(echeanceLegale);
}

/**
 * Réserve rendue avec tout état qui oppose une échéance au redevable.
 *
 * Elle porte les deux moitiés que le logiciel ne calcule pas · les jours fériés
 * faute de décret, et la faculté d'anticipation de l'Administration. Sans elle,
 * une échéance affichée passerait pour certaine dans les deux sens.
 */
export const RESERVE_JOUR_OUVRABLE =
  "REPORT DES ÉCHÉANCES · art. 110 bis, alinéa 2 de la loi de procédures fiscales : une échéance tombant un jour " +
  'non ouvrable est reportée au premier jour ouvrable qui suit. Les échéances de cet état appliquent ce report ' +
  'pour le DIMANCHE, jour de repos hebdomadaire (Code du travail, art. 121, alinéa 2, qui le fixe au dimanche, et ' +
  'art. 7, 9°, qui définit le jour ouvrable comme tout jour hors repos hebdomadaire et jours fériés légaux · la ' +
  "législation fiscale n'en donne aucune définition, celle-ci lui est empruntée). LE SAMEDI EST OUVRABLE et n'est " +
  'donc pas reporté. DEUX CHOSES NE SONT PAS CALCULÉES ICI : les JOURS FÉRIÉS LÉGAUX, dont la liste est fixée par ' +
  "décret du Président de la République (Code du travail, art. 123) et qu'aucune source du logiciel ne porte · une " +
  "échéance tombant un jour férié est encore présentée comme échue ; et la faculté qu'a l'Administration, par " +
  "l'alinéa 3 du même article, de fixer l'échéance déclarative et de paiement au jour ouvrable PRÉCÉDANT " +
  "l'échéance légale, acte qu'aucune comptabilité ne porte.";
