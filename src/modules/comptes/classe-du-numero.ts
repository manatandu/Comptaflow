import { ClasseCompte } from '@prisma/client';

/**
 * LA CLASSE D'UN COMPTE EST LE PREMIER CHIFFRE DE SON NUMÉRO · les deux plans
 * se structurent en neuf classes à codification décimale (SYCEBNL Partie 2
 * ch. 1 ; AUDCIF Titre VII), et les deux plans semés la respectent sans
 * exception (vérifié par `classe-du-numero-f40.spec.ts`).
 *
 * UNE SEULE RÈGLE (audit final F40). La création d'un compte laissait la
 * classe libre, et l'écran partait de la classe 1 · un 6xxx créé sans toucher
 * la liste était rangé en classe 1. Le bilan, qui lit la classe, le sortait du
 * résultat quand le compte de résultat, qui lit le numéro, le comptait : les
 * deux états divergeaient, la balance bouclant.
 *
 * `null` pour un numéro qui ne commence pas par un chiffre de 1 à 9 · il n'a
 * pas de classe, et c'est à l'appelant de le refuser.
 */
export function classeDuNumero(numero: string): ClasseCompte | null {
  const chiffre = numero.trim()[0];
  if (!chiffre || !/[1-9]/.test(chiffre)) return null;
  return `CLASSE_${chiffre}` as ClasseCompte;
}
