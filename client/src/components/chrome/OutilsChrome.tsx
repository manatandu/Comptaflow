import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFenetresActions, useFenetres } from '../../lib/fenetres';
import { api } from '../../lib/api';
import {
  EVENEMENT_FILE_COURRIER,
  RYTHME_CLOCHE_MS,
  compteCloche,
  libelleCompteCloche,
  titreCloche,
} from '../../lib/courrier-file';
import type { CompteursCourrier } from '../../lib/types';
import { Calculette } from '../Calculette';
import { IconCalculette, IconCloche } from './icons';

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

/**
 * LA CLOCHE · la porte de la file des courriels, et son compte.
 *
 * ELLE NE COMPTE QUE CE QUE LE SERVEUR SAIT DIRE · les messages en ÉCHEC et
 * ABANDONNÉS (voir `compteCloche`). Ni les échéances fiscales, ni les
 * anomalies de contrôle, ni les jalons en retard : aucune route ne les agrège
 * aujourd'hui, et une cloche qui affiche un chiffre faux est pire qu'une
 * cloche absente · on apprend en une semaine à l'ignorer, et le jour où elle
 * dit vrai plus personne ne la regarde.
 *
 * QUAND LE COMPTE N'A PAS PU ÊTRE LU, AUCUN NOMBRE N'EST AFFICHÉ. Un « 0 » de
 * repli affirmerait « rien en échec » alors que la réponse n'est jamais
 * arrivée (licence expirée, session refusée, réseau coupé) ; la cloche reste
 * alors une porte, et son infobulle dit pourquoi elle est muette.
 *
 * ELLE RESTE VISIBLE MÊME À ZÉRO · c'est le seul chemin d'un clic vers la
 * file, et aujourd'hui la file est entièrement en « Gardé, pas de messagerie »,
 * un état que la cloche ne compte justement pas. La faire disparaître à zéro
 * rendrait donc la fenêtre introuvable le jour où elle est le plus utile.
 */
export function ClocheChrome() {
  const navigate = useNavigate();
  const [compteurs, setCompteurs] = useState<CompteursCourrier | null>(null);

  useEffect(() => {
    let vivant = true;
    const lire = () => {
      // L'onglet caché n'interroge rien · un poste laissé ouvert la nuit ne
      // doit pas produire une requête par minute jusqu'au matin.
      if (document.visibilityState === 'hidden') return;
      api.get<CompteursCourrier>('/courrier/compteurs').then(
        (c) => vivant && setCompteurs(c),
        // Silence VOULU · une cloche qui ouvrirait un bandeau d'erreur en
        // travers du chrome interromprait une saisie pour un compte
        // décoratif. Le nombre disparaît, l'infobulle le dit.
        () => vivant && setCompteurs(null),
      );
    };
    lire();
    const rythme = window.setInterval(lire, RYTHME_CLOCHE_MS);
    document.addEventListener('visibilitychange', lire);
    window.addEventListener(EVENEMENT_FILE_COURRIER, lire);
    return () => {
      vivant = false;
      window.clearInterval(rythme);
      document.removeEventListener('visibilitychange', lire);
      window.removeEventListener(EVENEMENT_FILE_COURRIER, lire);
    };
  }, []);

  const compte = compteurs ? compteCloche(compteurs) : 0;
  const pastille = libelleCompteCloche(compte);

  return (
    <button
      type="button"
      title={titreCloche(compteurs)}
      aria-label={titreCloche(compteurs)}
      onClick={() => navigate('/courrier')}
      className="relative flex items-center justify-center w-[22px] h-[22px] rounded-[5px] text-text-dim transition-colors duration-150 hover:bg-chrome-alt hover:text-text"
    >
      <IconCloche width={13} height={13} />
      {pastille && (
        <span className="absolute -top-[1px] -right-[1px] min-w-[13px] h-[13px] px-[3px] rounded-full bg-danger text-white text-[8px] font-bold leading-[13px] text-center">
          {pastille}
        </span>
      )}
    </button>
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
