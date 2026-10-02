import { useEffect } from 'react';
import { compteUnique } from './comptes-proposes';

/**
 * UN CHOIX UNIQUE SE PRÉSÉLECTIONNE, modifiable. Rien n'est touché tant que
 * la liste n'est pas lue, ni quand un compte est déjà choisi et encore
 * proposé ; un compte choisi qui n'est plus proposé (la liste a changé sous
 * lui) se retire, au profit du seul compte restant s'il n'y en a qu'un.
 */
export function usePreselectionUnique(
  liste: readonly { id: string }[] | null | undefined,
  valeur: string,
  poser: (id: string) => void,
) {
  const cle = liste ? liste.map((c) => c.id).join('|') : null;
  useEffect(() => {
    if (!liste) return;
    if (valeur && liste.some((c) => c.id === valeur)) return;
    const unique = compteUnique(liste);
    if (unique !== valeur) poser(unique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, valeur]);
}
