/*
 * Le CALCUL du compteur, sans React · ce fichier se charge aussi sous le jest
 * de la racine, qui tourne dans le déploiement AVANT l'installation du client
 * (où React n'existe pas encore). Le hook vit dans `compteur.ts`.
 */
/**
 * LE COMPTEUR DES INDICATEURS · un chiffre qui monte à son arrivée, et qui ne
 * ment jamais à la fin.
 *
 * Il sert la question « qu'est-ce qui vient d'arriver ? » quand les
 * indicateurs du tableau de bord sont lus. Trois règles, parce qu'un chiffre
 * animé dans un logiciel comptable est un chiffre FAUX pendant l'animation :
 *
 *  · la DERNIÈRE étape rend la cible exacte, pas un produit de flottants ·
 *    `depart + (cible - depart) × 1` peut rendre 1 234,5600000000002, et
 *    c'est ce nombre qui resterait affiché ;
 *  · le compteur rend un NOMBRE, jamais un texte · l'écran l'écrit par
 *    `montant()` (lib/montants.ts), la seule main qui pose les centimes ;
 *  · sous `prefers-reduced-motion`, ou sans `requestAnimationFrame`, la cible
 *    est rendue tout de suite · aucune étape intermédiaire n'est montrée.
 *
 * 280 ms · la borne haute des entrées de l'interface (index.css). Au-delà,
 * le lecteur attend le chiffre au lieu de le lire.
 */
export const DUREE_COMPTEUR_MS = 280;

/** Décélération de la courbe `--t-sortie` · rapide au départ, posée à l'arrivée. */
function sortie(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * La valeur à la progression `t` (0 à 1). Hors de l'intervalle, ou à 1, la
 * valeur est une des deux bornes EXACTES, jamais un calcul.
 */
export function valeurIntermediaire(depart: number, cible: number, t: number): number {
  if (!(t > 0)) return depart;
  if (t >= 1) return cible;
  return depart + (cible - depart) * sortie(t);
}
