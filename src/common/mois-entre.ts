/**
 * MOIS DE CALENDRIER TRAVERSÉS de `debut` à `fin`, les deux mois compris ·
 * janvier à décembre en vaut douze, le 15 mars au 2 avril deux. Le jour
 * n'entre pas dans le compte · c'est la règle de la première annuité, « à
 * compter du premier jour du mois de mise en service » (loi n° 23/053,
 * art. 30 et 34), et le mois est l'unité de l'exercice lui-même (AUDCIF
 * art. 7, « une période de douze mois »).
 *
 * UN SEUL DÉCOMPTE (audit final F34). Il était écrit quatre fois · première
 * annuité, dernière annuité de sortie, plan fiscal dégressif, comparabilité
 * des exercices · et trois des quatre copies le bornaient à douze, ce que
 * l'exercice ne fait pas.
 *
 * Rend un nombre négatif ou nul quand `fin` précède le mois de `debut` · à
 * l'appelant de dire ce que vaut une période vide.
 */
export function moisEntre(debut: Date, fin: Date): number {
  return (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12 + (fin.getUTCMonth() - debut.getUTCMonth()) + 1;
}
