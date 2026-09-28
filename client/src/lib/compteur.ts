import { useEffect, useRef, useState } from 'react';

import { DUREE_COMPTEUR_MS, valeurIntermediaire } from './compteur-valeur';

export { DUREE_COMPTEUR_MS, valeurIntermediaire };

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
