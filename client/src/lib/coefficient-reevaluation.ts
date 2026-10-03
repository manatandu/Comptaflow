/**
 * LE COEFFICIENT APPLIQUÉ À UN BIEN DÉJÀ RÉÉVALUÉ · le même calcul que le
 * serveur (`coefficientApplique`, `src/modules/immobilisations/reevaluation-bilan.ts`),
 * pour MONTRER la conversion ligne à ligne avant l'envoi. Le serveur seul
 * décide · cette fonction n'ouvre ni ne ferme rien.
 *
 * AUDCIF Titre VIII ch. 28 § 4.2.1.1 · le coefficient multiplie la valeur
 * nette INSCRITE, qui porte déjà les coefficients des réévaluations
 * antérieures. Un coefficient déclaré « depuis l'acquisition » se divise par
 * ceux-ci ; « depuis la dernière réévaluation », il s'applique tel quel. Le
 * texte ne dit pas ce que l'arrêté mesure (loi n° 23/053, art. 129) · la
 * catégorie le déclare, sans défaut.
 */
export type BaseCoefficient = 'ORIGINE' | 'DERNIERE_REEVALUATION';

export const produitCoefficients = (ks: number[] | undefined) => (ks ?? []).reduce((p, k) => p * k, 1);

/** Un bien déjà réévalué · le produit de ses coefficients s'écarte de 1. */
export const dejaReevalue = (ks: number[] | undefined) => Math.abs(produitCoefficients(ks) - 1) > 1e-9;

const coef = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 6 });

/**
 * Ce que l'écran écrit dans la colonne « Coefficient appliqué » · null
 * quand le coefficient de la catégorie n'est pas lisible.
 */
export function conversionAffichee(o: {
  coefficient: number;
  base: BaseCoefficient | '' | null | undefined;
  anterieurs: number[] | undefined;
}): { texte: string; manque: boolean } | null {
  if (!Number.isFinite(o.coefficient) || o.coefficient <= 0) return null;
  if (!dejaReevalue(o.anterieurs)) return { texte: coef(o.coefficient), manque: false };
  const p = produitCoefficients(o.anterieurs);
  if (o.base === 'DERNIERE_REEVALUATION') return { texte: coef(o.coefficient), manque: false };
  if (o.base === 'ORIGINE') return { texte: `${coef(o.coefficient)} ÷ ${coef(p)} = ${coef(o.coefficient / p)}`, manque: false };
  return { texte: 'Base du coefficient à déclarer', manque: true };
}
