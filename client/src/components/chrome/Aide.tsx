import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LEXIQUE, type CleLexique, type EntreeLexique } from '../../lib/lexique';

/**
 * BULLE D'AIDE « ? ». Un petit rond posé à côté d'une notion comptable ;
 * au survol ou au clic, il déplie la définition SYCEBNL correspondante.
 *
 * Deux usages :
 *   <Aide sujet="fondsAffectes" />              · texte pris dans le lexique
 *   <Aide titre="…" texte="…" source="…" />     · texte propre à l'écran
 *
 * La bulle est rendue dans un portail sur <body> et positionnée en
 * coordonnées écran : sinon elle serait rognée par le premier parent en
 * `overflow: hidden` venu, et les fenêtres du logiciel en sont pleines
 * (listes défilantes, volets, panneaux de fiche).
 */
export function Aide(
  props: ({ sujet: CleLexique } | EntreeLexique) & { className?: string },
) {
  const entree: EntreeLexique = 'sujet' in props ? LEXIQUE[props.sujet] : props;
  const [ouvert, setOuvert] = useState(false);
  // Épinglée = ouverte au clic. Elle ne se referme alors plus au passage de
  // la souris, seulement au second clic, à Échap ou au clic à l'extérieur ·
  // c'est ce qui permet de lire tranquillement une définition longue.
  const [epinglee, setEpinglee] = useState(false);
  const ancre = useRef<HTMLButtonElement>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const annulerFermeture = useCallback(() => {
    if (minuterie.current) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }
  }, []);

  // Fermeture différée : la bulle est détachée de l'ancre de quelques pixels,
  // et sans ce délai le simple trajet de la souris du « ? » vers le texte la
  // ferait disparaître avant qu'on ait pu la lire.
  const fermerBientot = useCallback(() => {
    annulerFermeture();
    minuterie.current = setTimeout(() => {
      setEpinglee((e) => {
        if (!e) setOuvert(false);
        return e;
      });
    }, 220);
  }, [annulerFermeture]);

  useEffect(() => annulerFermeture, [annulerFermeture]);

  useLayoutEffect(() => {
    if (!ouvert || !ancre.current) return;
    const r = ancre.current.getBoundingClientRect();
    const largeur = 320;
    // On garde la bulle dans la fenêtre : à gauche de l'ancre si elle
    // déborderait à droite, au-dessus si elle déborderait en bas.
    const left = Math.min(Math.max(8, r.left - 8), window.innerWidth - largeur - 8);
    const hauteurEstimee = bulle.current?.offsetHeight ?? 150;
    const dessous = r.bottom + 8;
    const top = dessous + hauteurEstimee > window.innerHeight - 8 ? Math.max(8, r.top - hauteurEstimee - 8) : dessous;
    setPos({ top, left });
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOuvert(false);
      setEpinglee(false);
    };
    const surClic = (e: MouseEvent) => {
      if (!ancre.current?.contains(e.target as Node) && !bulle.current?.contains(e.target as Node)) {
        setOuvert(false);
        setEpinglee(false);
      }
    };
    // `true` : on ferme aussi sur un défilement dans un volet interne, dont
    // l'événement ne remonte pas jusqu'à window sans capture.
    const surDefilement = () => {
      setOuvert(false);
      setEpinglee(false);
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('mousedown', surClic);
    window.addEventListener('scroll', surDefilement, true);
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('mousedown', surClic);
      window.removeEventListener('scroll', surDefilement, true);
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={ancre}
        type="button"
        aria-label={`Aide : ${entree.titre}`}
        aria-expanded={ouvert}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          annulerFermeture();
          if (epinglee) {
            setEpinglee(false);
            setOuvert(false);
          } else {
            setEpinglee(true);
            setOuvert(true);
          }
        }}
        onMouseEnter={() => {
          annulerFermeture();
          setOuvert(true);
        }}
        onMouseLeave={fermerBientot}
        onFocus={() => setOuvert(true)}
        onBlur={fermerBientot}
        className={`inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border text-[10px] font-bold leading-none align-middle transition-colors flex-shrink-0 ${
          ouvert
            ? 'bg-sel text-white border-sel'
            : 'bg-transparent text-text-dim border-border-dark hover:bg-sel-soft hover:text-sel hover:border-sel'
        } ${props.className ?? ''}`}
      >
        ?
      </button>

      {ouvert &&
        pos &&
        createPortal(
          <div
            ref={bulle}
            role="tooltip"
            onMouseEnter={annulerFermeture}
            onMouseLeave={fermerBientot}
            style={{ top: pos.top, left: pos.left, width: 320 }}
            className="fixed z-[60] bg-surface border border-border shadow-flottante rounded-[10px] p-3.5 anim-menu"
          >
            <div className="text-[12.5px] font-bold text-text mb-1.5">{entree.titre}</div>
            <p className="text-[12px] leading-[1.55] text-text-dim">{entree.texte}</p>
            <div className="mt-2.5 pt-2 border-t border-border text-[10.5px] text-text-dim/80">{entree.source}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
