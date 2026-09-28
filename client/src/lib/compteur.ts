import { useEffect, useRef, useState } from 'react';

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

function mouvementReduit(): boolean {
  try {
    return typeof window === 'undefined' || !window.matchMedia
      ? true
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * La valeur à afficher pour `cible`. Au premier chiffre lu (`cible` passe de
 * null à un nombre), le compteur part de zéro ; à un chiffre qui change, il
 * part du dernier affiché. `null` reste `null` · une absence ne s'anime pas.
 */
export function useCompteur(cible: number | null, dureeMs = DUREE_COMPTEUR_MS): number | null {
  // Un chiffre déjà connu au montage part de zéro comme les autres, sauf sous
  // mouvement réduit, où il s'affiche d'emblée.
  const [affiche, setAffiche] = useState<number | null>(() =>
    cible === null ? null : mouvementReduit() ? cible : 0,
  );
  const dernier = useRef<number | null>(null);

  useEffect(() => {
    if (cible === null) {
      dernier.current = null;
      setAffiche(null);
      return;
    }
    const depart = dernier.current ?? 0;
    dernier.current = cible;
    if (depart === cible || mouvementReduit() || typeof requestAnimationFrame !== 'function') {
      setAffiche(cible);
      return;
    }
    let image = 0;
    const debut = performance.now();
    const pas = (maintenant: number) => {
      const t = (maintenant - debut) / dureeMs;
      setAffiche(valeurIntermediaire(depart, cible, t));
      if (t < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    // Démonté ou relancé en cours de route · la cible est posée, jamais une
    // étape intermédiaire laissée à l'écran.
    return () => {
      cancelAnimationFrame(image);
      setAffiche(cible);
    };
  }, [cible, dureeMs]);

  return affiche;
}
