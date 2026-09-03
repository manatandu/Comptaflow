import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import type { SpecificationNote } from './note-annexe.types';

/**
 * OUTILS PARTAGÉS PAR LES DEUX BALAYAGES DE NOTES SYCEBNL.
 *
 * Les jeux associations (45 tableaux) et projets de développement (26) sont
 * deux tables distinctes, lues dans deux chapitres distincts du texte, et
 * elles ne se transposent pas. Ce qui se partage, ce sont les CONTRÔLES · pas
 * les contenus. Les mettre ici évite qu'un garde-fou existe d'un côté et
 * s'oublie de l'autre, ce qui est exactement l'écart que la phase C corrige
 * entre le SYCEBNL et le SYSCOHADA.
 */

const NUMEROS_SEMES = PLAN_COMPTES_SYCEBNL.map((c) => c.numero);

/**
 * Un préfixe désigne-t-il au moins un compte réellement semé ?
 *
 * La comparaison va dans LES DEUX SENS, et ce n'est pas une facilité. La
 * convention du dépôt complète les comptes d'imputation à huit chiffres
 * (`5211` semé en `52110000`) : un préfixe court comme `52` est donc un début
 * de `52110000`, tandis qu'un préfixe long comme `52110000` a pour début le
 * compte TOTAL `52` s'il n'existe qu'à ce niveau. Ne tester qu'un sens
 * rejetterait des rattachements corrects (voir CLAUDE.md §7).
 */
export function compteSeme(prefixe: string): boolean {
  return NUMEROS_SEMES.some((n) => n.startsWith(prefixe) || prefixe.startsWith(n));
}

export function etiquette(n: SpecificationNote): string {
  return n.sousTableau ? `${n.code} / ${n.sousTableau}` : n.code;
}

/** Toutes les rubriques d'une table, avec l'étiquette de leur tableau. */
export function toutesLesRubriques(table: SpecificationNote[]) {
  return table.flatMap((n) => n.rubriques.map((r, index) => ({ note: n, rubrique: r, index })));
}

/**
 * Les codes de la liste officielle, dans l'ordre du texte, tirés du fichier
 * d'export plutôt que réécrits · voir le balayage croisé de chaque spec.
 */
export function codesDistincts(table: SpecificationNote[]): string[] {
  return [...new Set(table.map((n) => n.code))];
}
