/**
 * COMPTABILITÉ DE GESTION · aides de l'écran (ligne A20). Les règles vivent au
 * serveur (`src/modules/analytique/gestion/`) · l'écran ne calcule ni coût ni
 * seuil, il lit ce que le serveur rend, et ne garde ici que la lecture des
 * saisies et la forme des envois.
 */

export type Comportement = 'CHARGE_FIXE' | 'CHARGE_VARIABLE' | 'CHARGE_SEMI_VARIABLE' | 'PRODUIT_ACTIVITE' | 'HORS_CALCUL';

export const LIBELLES_COMPORTEMENT: Record<Comportement, string> = {
  CHARGE_FIXE: 'Charge fixe',
  CHARGE_VARIABLE: 'Charge variable',
  CHARGE_SEMI_VARIABLE: 'Charge semi-variable',
  PRODUIT_ACTIVITE: "Produit d'activité",
  HORS_CALCUL: 'Hors calcul',
};

/** Les comportements qu'un compte peut recevoir, selon sa classe · le serveur refuse les autres. */
export function comportementsAdmis(classe: string): Comportement[] {
  if (classe === '6') return ['CHARGE_FIXE', 'CHARGE_VARIABLE', 'CHARGE_SEMI_VARIABLE', 'HORS_CALCUL'];
  if (classe === '7') return ['PRODUIT_ACTIVITE', 'HORS_CALCUL'];
  return [];
}

/**
 * Un nombre saisi (virgule ou point, espaces de milliers) · null s'il est
 * illisible ou vide, jamais zéro · une valeur absente n'est pas une valeur
 * nulle (§ 9 ter).
 */
export function lireNombre(texte: string): number | null {
  const t = texte.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** La somme des valeurs d'une clé, au centième · pour dire « 100 % » ou l'écart. */
export function totalCle(valeurs: readonly (number | null)[]): number {
  return Math.round(valeurs.reduce<number>((t, v) => t + (v ?? 0), 0) * 100) / 100;
}

/**
 * Les soldes que l'écran a montrés, compte par compte · renvoyés avec la
 * demande de répartition, le serveur les confronte au calcul qu'il rejoue et
 * refuse (409) s'ils ont changé.
 */
export function soldesMontres(ods: readonly { compteId: string; solde: number }[]): Record<string, number> {
  return Object.fromEntries(ods.map((o) => [o.compteId, o.solde]));
}
