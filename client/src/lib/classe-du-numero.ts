import type { ClasseCompte } from './types';

/**
 * La classe d'un compte est le premier chiffre de son numéro · le serveur la
 * déduit de même (`src/modules/comptes/classe-du-numero.ts`, audit final F40).
 * L'écran l'affiche calculée au lieu d'une liste partant de la classe 1, qui
 * rangeait en classe 1 tout compte créé sans y toucher.
 */
export function classeDuNumero(numero: string): ClasseCompte | null {
  const chiffre = numero.trim()[0];
  if (!chiffre || !/[1-9]/.test(chiffre)) return null;
  return `CLASSE_${chiffre}` as ClasseCompte;
}
