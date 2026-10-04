/**
 * COMPORTEMENT D'UN COMPTE DE GESTION FACE À L'ACTIVITÉ · règles pures.
 *
 * Ligne A20 (relevé CPCC C17). Le glossaire de l'AUDCIF (Titre VI, « CHARGES
 * FIXES ET VARIABLES ») définit trois comportements · « Les charges fixes sont
 * des charges qui ne varient pas en fonction du niveau d'activité » ; « Les
 * charges variables sont des charges, appelées aussi "coûts proportionnels",
 * qui sont directement liés au niveau d'activité » ; les charges
 * semi-variables comportent « une partie fixe liée à la structure de l'entité
 * et une partie variable dépendant de son niveau d'activité ».
 *
 * LE COMPORTEMENT SE DÉCLARE, IL NE SE DEVINE PAS · aucun numéro ne le porte.
 * Un loyer est fixe chez l'un et variable chez le loueur de matériel ; une
 * main-d'œuvre payée à la pièce est variable, au mois elle est fixe. Ranger le
 * 66 parmi les fixes d'office fausserait le seuil sans que rien ne le dise.
 * Un compte mouvementé sans déclaration rend le calcul INCOMPLET (`null`),
 * jamais « zéro de charges variables ».
 *
 * PRODUITS · un compte de classe 7 est un « produit d'activité » (la base du
 * seuil) ou « hors calcul » (une reprise, un transfert de charges, un produit
 * financier que le cabinet ne veut pas voir couvrir ses charges fixes) · là
 * encore, c'est lui qui le dit.
 */

export type Comportement =
  | 'CHARGE_FIXE'
  | 'CHARGE_VARIABLE'
  | 'CHARGE_SEMI_VARIABLE'
  | 'PRODUIT_ACTIVITE'
  | 'HORS_CALCUL';

export const COMPORTEMENTS_DES_CHARGES: readonly Comportement[] = [
  'CHARGE_FIXE',
  'CHARGE_VARIABLE',
  'CHARGE_SEMI_VARIABLE',
  'HORS_CALCUL',
];
export const COMPORTEMENTS_DES_PRODUITS: readonly Comportement[] = ['PRODUIT_ACTIVITE', 'HORS_CALCUL'];

/** Classe du compte en chiffre (« 6 », « 7 »), telle que `ClasseCompte` la porte après « CLASSE_ ». */
export function motifRefusComportement(params: {
  numero: string;
  classe: string;
  comportement: Comportement | null;
  partVariablePct: number | null;
}): string | null {
  const { numero, classe, comportement, partVariablePct } = params;
  if (classe !== '6' && classe !== '7') {
    return `Le compte ${numero} n'est ni une charge ni un produit des activités ordinaires (classes 6 et 7) · il n'a pas de comportement face à l'activité.`;
  }
  if (comportement === null) {
    if (partVariablePct !== null) return `Compte ${numero} · une part variable ne se déclare qu'avec une charge semi-variable.`;
    return null;
  }
  const admis = classe === '6' ? COMPORTEMENTS_DES_CHARGES : COMPORTEMENTS_DES_PRODUITS;
  if (!admis.includes(comportement)) {
    return classe === '6'
      ? `Le compte ${numero} est une charge · fixe, variable, semi-variable ou hors calcul.`
      : `Le compte ${numero} est un produit · produit d'activité ou hors calcul.`;
  }
  if (comportement === 'CHARGE_SEMI_VARIABLE') {
    if (partVariablePct === null || !Number.isFinite(partVariablePct) || partVariablePct <= 0 || partVariablePct >= 100) {
      return `Compte ${numero} · la part variable d'une charge semi-variable est un pourcentage strictement entre 0 et 100 (à 0 ou 100, déclarez-la fixe ou variable).`;
    }
  } else if (partVariablePct !== null) {
    return `Compte ${numero} · une part variable ne se déclare qu'avec une charge semi-variable.`;
  }
  return null;
}

/**
 * Partage d'une charge entre fixe et variable, au centime · la part variable
 * d'une semi-variable est arrondie, la fixe en est le reste, pour que les deux
 * reconstituent le montant exactement.
 */
export function partageFixeVariable(
  montant: number,
  comportement: 'CHARGE_FIXE' | 'CHARGE_VARIABLE' | 'CHARGE_SEMI_VARIABLE',
  partVariablePct: number | null,
): { fixe: number; variable: number } {
  const c = Math.round(montant * 100);
  if (comportement === 'CHARGE_FIXE') return { fixe: c / 100, variable: 0 };
  if (comportement === 'CHARGE_VARIABLE') return { fixe: 0, variable: c / 100 };
  const v = Math.round((c * (partVariablePct ?? 0)) / 100);
  return { fixe: (c - v) / 100, variable: v / 100 };
}
