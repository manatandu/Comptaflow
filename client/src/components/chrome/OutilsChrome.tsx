import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFenetresActions, useFenetres } from '../../lib/fenetres';
import { Calculette } from '../Calculette';
import { IconCalculette } from './icons';

/**
 * OUTILS DU CHROME · ce qui reste de l'ancienne barre d'outils, ramené sur
 * la LIGNE DES MENUS.
 *
 * La barre portait dix « verbes » (Ajouter, Consulter, Voir/Modifier,
 * Supprimer, Rechercher, Atteindre, Inverseur, Trier…) qui agissaient sur la
 * fenêtre active. À l'usage, ils ne servaient pas : chaque fenêtre porte déjà
 * son bouton « Nouveau… », son champ de recherche et ses commandes, là où le
 * geste se fait. La barre doublait ces commandes en les éloignant, et coûtait
 * une rangée entière de hauteur, la plus rare des ressources sur un écran
 * d'ordinateur portable. Elle est supprimée, le registre d'actions qui
 * l'alimentait avec (lib/actions-fenetre.tsx).
 *
 * Ne restent que les commandes qui ne peuvent PAS vivre dans une fenêtre,
 * parce qu'elles portent sur l'application elle-même : reculer, avancer,
 * revenir à l'accueil, et la calculette · elles rejoignent la ligne des
 * menus, à droite de celle-ci.
 */

function BoutonChrome({
  titre,
  infobulle,
  onClick,
  children,
}: {
  titre: string;
  infobulle?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={infobulle ?? titre}
      aria-label={titre}
      onClick={onClick}
      className="flex items-center justify-center w-[22px] h-[22px] rounded-[5px] text-text-dim transition-colors duration-150 hover:bg-chrome-alt hover:text-text"
    >
      {children}
    </button>
  );
}

export function NavigationChrome() {
  const navigate = useNavigate();
  const { fermerTout } = useFenetresActions();
  const { fenetres } = useFenetres();
  return (
    <div className="flex items-center gap-0.5 pr-1.5 mr-1 border-r border-border">
      <BoutonChrome titre="Précédent" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </BoutonChrome>
      <BoutonChrome titre="Suivant" onClick={() => navigate(1)}>
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </BoutonChrome>
      <BoutonChrome
        titre="Accueil"
        infobulle={fenetres.length > 0 ? 'Accueil · referme les fenêtres ouvertes' : 'Accueil'}
        onClick={fermerTout}
      >
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.2 9.2L10 3.6l6.8 5.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 8.6V16h10V8.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </BoutonChrome>
    </div>
  );
}

export function CalculetteChrome() {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <BoutonChrome titre="Calculette" onClick={() => setOuverte(true)}>
        <IconCalculette width={13} height={13} />
      </BoutonChrome>
      {ouverte && <Calculette onFermer={() => setOuverte(false)} />}
    </>
  );
}
