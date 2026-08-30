import { useCallback, useEffect, useRef } from 'react';
import type { FenetreOuverte } from '../../lib/fenetres';
import { useFenetres } from '../../lib/fenetres';
import { rendreFenetre } from '../../lib/registre-fenetres';
import { LimiteErreur } from './LimiteErreur';
import { FenetreCouranteProvider } from '../../lib/actions-fenetre';

/**
 * CADRE DE FENÊTRE · la fenêtre MDI de Sage 100 i7 : une barre de titre
 * sombre quand la fenêtre est active, grise quand elle ne l'est pas, et à
 * droite les trois boutons `_ ▢ ✕` (réduire, agrandir/restaurer, fermer).
 *
 * Ce qui vient de Sage, et pourquoi :
 *  · double-clic sur la barre de titre = agrandir/restaurer. C'est le geste
 *    Windows, celui que la main fait sans y penser ;
 *  · la fenêtre se déplace par sa barre de titre, et seulement par elle ·
 *    la déplacer par son contenu rendrait toute sélection de texte pénible ;
 *  · poignée de redimensionnement en bas à droite ;
 *  · un clic n'importe où dans la fenêtre la ramène au premier plan.
 *
 * Le déplacement et le redimensionnement passent par la CAPTURE DE POINTEUR
 * plutôt que par des écouteurs sur `window` : le navigateur continue alors
 * de livrer les événements même si le curseur sort de la fenêtre ou passe
 * au-dessus d'un cadre voisin · sans quoi la fenêtre « décroche » dès qu'on
 * bouge vite, défaut classique des implémentations naïves.
 */

const HAUTEUR_TITRE = 26;
const MARGE_MIN_VISIBLE = 90; // px de barre de titre toujours attrapables
const LARGEUR_MIN = 380;
const HAUTEUR_MIN = 220;
/**
 * Marge conservée autour d'une fenêtre AGRANDIE.
 *
 * Une fenêtre agrandie collée aux bords se soudait visuellement à la barre
 * d'outils : sa barre de titre sombre, pleine largeur et sans bordure,
 * ressemblait à une seconde barre de l'application, pas au haut d'une
 * fenêtre. On ne voyait plus où le logiciel s'arrête et où la fenêtre
 * commence. La marge (avec le coin arrondi et l'ombre qu'elle rend visibles)
 * fait que la fenêtre s'ARRÊTE, nettement, sous la rangée d'icônes · c'est
 * ce que montre Sage, dont la fenêtre agrandie reste une fenêtre.
 */
const MARGE_AGRANDIE = 8;

export function Fenetre({ fenetre, active }: { fenetre: FenetreOuverte; active: boolean }) {
  const { activer, fermer, reduire, basculerAgrandissement, deplacer } = useFenetres();
  const refCadre = useRef<HTMLDivElement>(null);

  const agrandie = fenetre.etat === 'agrandie';

  /**
   * Un geste = un point de départ figé (position du pointeur ET du cadre au
   * moment du `pointerdown`), puis des deltas. Lire la position courante du
   * cadre à chaque `pointermove` ferait dériver la fenêtre, chaque image
   * cumulant l'erreur de la précédente.
   */
  const demarrerGeste = useCallback(
    (e: React.PointerEvent, mode: 'deplacer' | 'redimensionner') => {
      if (agrandie && mode === 'deplacer') return; // une fenêtre plein écran ne se déplace pas
      e.preventDefault();
      const cible = e.currentTarget as HTMLElement;
      cible.setPointerCapture(e.pointerId);
      const departX = e.clientX;
      const departY = e.clientY;
      const depart = { ...fenetre.cadre };
      const espace = refCadre.current?.parentElement;
      const largeurEspace = espace?.clientWidth ?? window.innerWidth;
      const hauteurEspace = espace?.clientHeight ?? window.innerHeight;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - departX;
        const dy = ev.clientY - departY;
        if (mode === 'deplacer') {
          deplacer(fenetre.cle, {
            // On borne la position pour qu'il reste TOUJOURS de quoi
            // rattraper la fenêtre : poussée hors de l'espace de travail,
            // elle deviendrait inatteignable à la souris.
            x: Math.min(Math.max(depart.x + dx, MARGE_MIN_VISIBLE - depart.largeur), largeurEspace - MARGE_MIN_VISIBLE),
            y: Math.min(Math.max(depart.y + dy, 0), hauteurEspace - HAUTEUR_TITRE),
          });
        } else {
          deplacer(fenetre.cle, {
            largeur: Math.max(LARGEUR_MIN, depart.largeur + dx),
            hauteur: Math.max(HAUTEUR_MIN, depart.hauteur + dy),
          });
        }
      };
      const onUp = (ev: PointerEvent) => {
        cible.releasePointerCapture(ev.pointerId);
        cible.removeEventListener('pointermove', onMove);
        cible.removeEventListener('pointerup', onUp);
      };
      cible.addEventListener('pointermove', onMove);
      cible.addEventListener('pointerup', onUp);
    },
    [agrandie, deplacer, fenetre.cadre, fenetre.cle],
  );

  // Échap ferme la fenêtre ACTIVE · réflexe Windows, et seule façon de
  // refermer au clavier une fenêtre ouverte par mégarde.
  useEffect(() => {
    if (!active) return;
    const onTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      // Jamais pendant une saisie : Échap y sert à annuler le champ.
      const dansUnChamp =
        cible instanceof HTMLElement &&
        (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT' || cible.isContentEditable);
      if (e.key === 'Escape' && !dansUnChamp) fermer(fenetre.cle);
    };
    document.addEventListener('keydown', onTouche);
    return () => document.removeEventListener('keydown', onTouche);
  }, [active, fermer, fenetre.cle]);

  if (fenetre.etat === 'reduite') return null;

  const style: React.CSSProperties = agrandie
    ? { inset: MARGE_AGRANDIE, zIndex: fenetre.ordre }
    : {
        left: fenetre.cadre.x,
        top: fenetre.cadre.y,
        width: fenetre.cadre.largeur,
        height: fenetre.cadre.hauteur,
        zIndex: fenetre.ordre,
      };

  return (
    <div
      ref={refCadre}
      onPointerDown={() => !active && activer(fenetre.cle)}
      style={style}
      className={`anim-fenetre absolute flex flex-col overflow-hidden rounded-[12px] border bg-surface ${
        active ? 'border-border-dark shadow-dominante' : 'border-border shadow-posee'
      }`}
    >
      {/* --- Barre de titre ------------------------------------------------ */}
      <div
        onPointerDown={(e) => demarrerGeste(e, 'deplacer')}
        onDoubleClick={() => basculerAgrandissement(fenetre.cle)}
        style={{
          height: HAUTEUR_TITRE,
          // La fenêtre active porte le même bandeau sombre que la barre de
          // titre de l'application : d'un coup d'œil, on voit laquelle des
          // fenêtres ouvertes reçoit le clavier. Sage distingue les siennes
          // exactement ainsi.
          ...(active
            ? { background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }
            : {}),
        }}
        className={`shrink-0 flex items-center justify-between gap-2 pl-3 pr-1 select-none ${
          agrandie ? '' : 'cursor-move'
        } ${active ? 'text-white' : 'bg-chrome-alt text-text-dim border-b border-border'}`}
      >
        <span className="truncate text-[12px] font-semibold tracking-[0.01em]">{fenetre.titre}</span>
        <span className="flex items-center gap-0.5 shrink-0">
          <BoutonTitre
            actif={active}
            titre="Réduire"
            onClick={() => reduire(fenetre.cle)}
            dessin={<rect x="3.5" y="8" width="9" height="1.4" rx="0.7" />}
          />
          <BoutonTitre
            actif={active}
            titre={agrandie ? 'Restaurer' : 'Agrandir'}
            onClick={() => basculerAgrandissement(fenetre.cle)}
            dessin={
              agrandie ? (
                <>
                  <rect x="3" y="5.4" width="7.2" height="7.2" rx="1.2" fill="none" strokeWidth="1.3" stroke="currentColor" />
                  <path d="M5.6 5.4V4.2A1.2 1.2 0 0 1 6.8 3h5.4A1.2 1.2 0 0 1 13.4 4.2v5.4a1.2 1.2 0 0 1-1.2 1.2H11" fill="none" strokeWidth="1.3" stroke="currentColor" />
                </>
              ) : (
                <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.3" fill="none" strokeWidth="1.3" stroke="currentColor" />
              )
            }
          />
          <BoutonTitre
            actif={active}
            titre="Fermer"
            danger
            onClick={() => fermer(fenetre.cle)}
            dessin={
              <path d="M4 4l8 8M12 4l-8 8" fill="none" strokeWidth="1.4" stroke="currentColor" strokeLinecap="round" />
            }
          />
        </span>
      </div>

      {/* --- Contenu -------------------------------------------------------- */}
      <div className="flex-1 min-h-0 overflow-auto bg-bg">
        <LimiteErreur titreFenetre={fenetre.titre}>
          {/* La page apprend ici dans QUELLE fenêtre elle est montée · c'est
              ce qui lui permet de déclarer ses actions à la barre d'outils
              sans jamais avoir à connaître le gestionnaire de fenêtres. */}
          {/* La clé porte le compteur d'Actualiser : l'incrémenter remonte le
              contenu, qui recharge ses données · le F5 de Sage. */}
          <FenetreCouranteProvider key={fenetre.version} cle={fenetre.cle}>
            {rendreFenetre(fenetre.adresse)}
          </FenetreCouranteProvider>
        </LimiteErreur>
      </div>

      {/* --- Poignée de redimensionnement ----------------------------------- */}
      {!agrandie && (
        <div
          onPointerDown={(e) => demarrerGeste(e, 'redimensionner')}
          title="Redimensionner"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        >
          <svg viewBox="0 0 16 16" className="w-full h-full text-border-dark">
            <path d="M15 7L7 15M15 11l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}

function BoutonTitre({
  titre,
  onClick,
  dessin,
  actif,
  danger = false,
}: {
  titre: string;
  onClick: () => void;
  dessin: React.ReactNode;
  actif: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      // `stopPropagation` sur le pointeur : sans lui, appuyer sur « Fermer »
      // amorcerait aussi le déplacement de la fenêtre par sa barre de titre.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`flex items-center justify-center w-[26px] h-[22px] rounded-[6px] transition-colors duration-150 ${
        danger
          ? 'hover:bg-danger hover:text-white'
          : actif
            ? 'hover:bg-white/15'
            : 'hover:bg-chrome'
      } ${actif ? 'text-white/80' : 'text-text-dim'}`}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
        {dessin}
      </svg>
    </button>
  );
}
