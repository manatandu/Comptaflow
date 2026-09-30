import type { EcartSaisieNote, SpecificationNote } from './note-annexe.types';

/**
 * TOTAUX ET FORMULES D'UN TABLEAU EN SAISIE · ce que le modèle écrit, et que
 * le dossier tape à la main (passe R6, constat B12).
 *
 * Le TOTAL des engagements financiers de la note 1, les sous-totaux et le
 * total général de la note 5G, et ses colonnes « C = A - B » et « E = D - C »
 * sont des cellules EN SAISIE : aucune balance ne les porte (voir la note 5G
 * pour la raison). Recopiées telles quelles, elles pouvaient contredire les
 * lignes qu'elles résument sans que rien ne le dise, à l'écran comme dans la
 * liasse.
 *
 * Le logiciel ne calcule rien à la place du dossier et ne devine aucun
 * montant de détail · il CONFRONTE. Chaque cellule de total ou de formule est
 * rapprochée de ce que les cellules saisies donnent par la règle que le
 * modèle écrit, et l'écart est rendu sur la ligne. Deux règles de lecture :
 *
 * - une SOMME compte une cellule vide pour zéro · une ligne de la note 5G
 *   laissée vide est un bien qui n'a pas été cédé, et exiger toutes les
 *   lignes renseignées ferait taire le contrôle sur tout dossier réel ;
 * - une FORMULE de ligne n'est confrontée que si TOUTES ses cellules sont des
 *   nombres · « A - B » avec B vide ne dit rien de C.
 *
 * Un texte qui n'est pas un nombre (« néant », « 1.234.567 ») suspend le
 * contrôle de sa colonne plutôt que d'être lu d'une manière ou d'une autre.
 */

/** Lecture d'une cellule saisie · `null` si vide, `NaN` si ce n'est pas un nombre. */
export function nombreSaisi(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN;
  const t = v.replace(/[\s  ]/g, '');
  if (t === '') return null;
  // Une virgule OU un point décimal, jamais les deux · un séparateur de
  // milliers écrit au point ne se distingue pas d'un décimal, et n'est pas lu.
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return Number.NaN;
  return Number(t.replace(',', '.'));
}

const ecartSignificatif = (a: number, b: number) => Math.abs(a - b) > 0.005;

/**
 * Écarts d'un tableau, rubrique par rubrique (même ordre que
 * `spec.rubriques`) · `cellules[i]` est la saisie de la rubrique i, une case
 * par colonne, `undefined` pour une rubrique qui n'est pas en saisie.
 */
export function ecartsDesSaisies(
  spec: SpecificationNote,
  cellules: ((string | number | null)[] | undefined)[],
): (EcartSaisieNote[] | undefined)[] {
  const lu = (i: number, ci: number) => nombreSaisi(cellules[i]?.[ci]);
  return spec.rubriques.map((rubrique, i) => {
    if (!rubrique.saisie || !cellules[i]) return undefined;
    const ecarts = new Map<number, EcartSaisieNote>();

    // 1 · le total, colonne par colonne.
    if (rubrique.sommeDesSaisies) {
      spec.colonnes.forEach((_, ci) => {
        const operandes = rubrique.sommeDesSaisies!.map((j) => lu(j, ci));
        if (operandes.some((x) => Number.isNaN(x))) return;
        if (operandes.every((x) => x === null)) return;
        const attendu = operandes.reduce<number>((s, x) => s + (x ?? 0), 0);
        const saisi = lu(i, ci);
        if (saisi !== null && Number.isNaN(saisi)) return;
        if (saisi === null || ecartSignificatif(saisi, attendu)) ecarts.set(ci, { colonne: ci, saisi, attendu });
      });
    }

    // 2 · la formule de colonne, sur la ligne même.
    spec.colonnes.forEach((c, ci) => {
      if (!c.formuleSaisie || ecarts.has(ci)) return;
      const plus = c.formuleSaisie.plus.map((k) => lu(i, k));
      const moins = c.formuleSaisie.moins.map((k) => lu(i, k));
      const operandes = [...plus, ...moins];
      if (operandes.some((x) => x === null || Number.isNaN(x))) return;
      const attendu =
        plus.reduce<number>((s, x) => s + (x as number), 0) - moins.reduce<number>((s, x) => s + (x as number), 0);
      const saisi = lu(i, ci);
      if (saisi !== null && Number.isNaN(saisi)) return;
      if (saisi === null || ecartSignificatif(saisi, attendu)) ecarts.set(ci, { colonne: ci, saisi, attendu });
    });

    return ecarts.size > 0 ? [...ecarts.values()].sort((a, b) => a.colonne - b.colonne) : undefined;
  });
}
