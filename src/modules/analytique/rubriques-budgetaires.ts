import { TypeCompteDetailTotal } from '@prisma/client';

/**
 * LES RUBRIQUES D'UNE NOMENCLATURE BUDGÉTAIRE, ET LA RÈGLE QUI LES AGRÈGE.
 *
 * `SectionAnalytique.type` porte depuis toujours la promesse écrite dans le
 * schéma : « TOTAL ne sert qu'à regrouper ses sections de même racine DANS LES
 * ÉTATS ». Une section TOTAL ne reçoit ni budget (`doterBudget` la refuse) ni
 * ventilation (`ventiler` la refuse) · elle n'existe QUE pour être totalisée,
 * et c'est aux états de le faire.
 *
 * TROIS ÉTATS LISAIENT CET OBJET, ET AUCUN DEUX NE LE LISAIENT PAREIL.
 *
 *  · la BALANCE ANALYTIQUE totalisait bien les rubriques, par préfixe de code ;
 *  · l'ÉTAT BUDGÉTAIRE (prévu / réalisé / écart) les ÉCARTAIT de sa requête
 *    (`type: DETAIL`) · un cabinet dont la convention se lit « 1 Personnel,
 *    dont 11 Salaires et 12 Charges sociales » n'obtenait qu'une liste plate de
 *    feuilles, et le bailleur qui lit son budget par rubrique devait
 *    additionner à la main ;
 *  · le TABLEAU D'EXÉCUTION BUDGÉTAIRE, lui, les gardait à ZÉRO · une ligne
 *    « 1 Personnel · budget 0, réalisé 0 » qui ne se distingue pas d'une
 *    rubrique inutilisée, et qui entrait en plus dans le total général.
 *
 * Ce dernier point n'était juste que PAR ACCIDENT : le total ne se trompait pas
 * parce que les sections TOTAL valent toujours zéro. Le jour où l'une d'elles
 * recevrait un montant par un autre chemin, le total général doublerait ce
 * montant sans qu'aucun contrôle ne puisse le voir. D'où la règle ci-dessous,
 * écrite UNE fois pour les trois états.
 *
 * ## La règle
 *
 * Une rubrique agrège les sections DÉTAIL dont le CODE COMMENCE PAR LE SIEN ·
 * même convention que les comptes Total du plan comptable (§ 7 de CLAUDE.md,
 * agrégation par `numero.startsWith()`), et c'est déjà celle de la balance
 * analytique.
 *
 * DEUX CONSÉQUENCES À NE PAS « CORRIGER ».
 *
 * Les rubriques s'EMBOÎTENT : la section 111 est comptée dans la rubrique 11 ET
 * dans la rubrique 1, ce qui est le propre d'un sous-total. C'est exactement
 * pour cela que LE TOTAL GÉNÉRAL NE SOMME QUE LES SECTIONS DÉTAIL · sommer les
 * lignes affichées compterait chaque dépense autant de fois qu'elle a de
 * rubriques au-dessus d'elle.
 *
 * Et le préfixe est un préfixe de CHAÎNE, pas un niveau : une rubrique « 1 »
 * absorbe la section « 10 » comme la section « 11 ». C'est voulu et c'est la
 * même arithmétique que le plan comptable ; un dossier qui ne veut pas ce
 * regroupement code ses rubriques sur une longueur fixe.
 */

export interface SectionPourRubrique {
  id: string;
  code: string;
  type: TypeCompteDetailTotal;
}

/** Vrai si `section` est une feuille de la rubrique `rubrique`. */
export function appartientALaRubrique(section: SectionPourRubrique, rubrique: SectionPourRubrique): boolean {
  return section.type === TypeCompteDetailTotal.DETAIL && section.code.startsWith(rubrique.code);
}

/**
 * Les identifiants des sections DÉTAIL que la rubrique totalise. Rendue vide
 * pour une section Détail · elle ne totalise qu'elle-même, et c'est à
 * l'appelant de le lire ainsi.
 */
export function feuillesDeLaRubrique(
  rubrique: SectionPourRubrique,
  sections: SectionPourRubrique[],
): string[] {
  if (rubrique.type !== TypeCompteDetailTotal.TOTAL) return [];
  return sections.filter((s) => appartientALaRubrique(s, rubrique)).map((s) => s.id);
}

/**
 * Agrège une mesure par section en une valeur de ligne, rubriques comprises.
 *
 * `mesure` rend la valeur d'une section DÉTAIL. Sur une rubrique, la somme de
 * ses feuilles ; sur une section Détail, sa propre mesure.
 */
export function valeurDeLaLigne(
  section: SectionPourRubrique,
  sections: SectionPourRubrique[],
  mesure: (sectionId: string) => number,
): number {
  if (section.type !== TypeCompteDetailTotal.TOTAL) return mesure(section.id);
  return feuillesDeLaRubrique(section, sections).reduce((t, id) => t + mesure(id), 0);
}

/**
 * LE TOTAL GÉNÉRAL, et il ne se prend JAMAIS sur les lignes affichées.
 *
 * Sommer la colonne d'un tableau qui porte des sous-totaux emboîtés compte
 * chaque dépense autant de fois qu'elle a de rubriques au-dessus d'elle : sur
 * une nomenclature à deux niveaux, le total général vaut exactement le double
 * du vrai. Rien ne le signale · toutes les lignes sont justes, et le total est
 * plausible.
 */
export function totalDesFeuilles(
  sections: SectionPourRubrique[],
  mesure: (sectionId: string) => number,
): number {
  return sections
    .filter((s) => s.type === TypeCompteDetailTotal.DETAIL)
    .reduce((t, s) => t + mesure(s.id), 0);
}
