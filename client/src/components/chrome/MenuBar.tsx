import { useEffect, useRef, useState } from 'react';

export interface MenuItemDef {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Trait horizontal AVANT cet item · regroupe les commandes par famille, comme chez Sage. */
  separateurAvant?: boolean;
}

export interface MenuDef {
  titre: string;
  items: MenuItemDef[];
}

/**
 * Barre de menus classique (Fichier / Structure / Traitement / État / ...),
 * calquée sur la barre de menus de Sage 100 Comptabilité i7 : chaque menu ne
 * contient QUE des commandes réelles · pas d'items « à venir » ni de menus
 * vides, un logiciel fini ne montre pas ses chantiers dans sa barre de menus.
 * Comportement Windows : un clic ouvre, le survol fait glisser d'un menu à
 * l'autre tant qu'un menu est ouvert, Échap ou clic dehors referme.
 */
export function MenuBar({
  menus,
  avant,
  apres,
}: {
  menus: MenuDef[];
  /** Commandes posées AVANT les menus (navigation). */
  avant?: React.ReactNode;
  /** Commandes posées à l'extrémité droite de la ligne (calculette). */
  apres?: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClicDehors = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(null);
    };
    const onEchap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(null);
    };
    document.addEventListener('mousedown', onClicDehors);
    document.addEventListener('keydown', onEchap);
    return () => {
      document.removeEventListener('mousedown', onClicDehors);
      document.removeEventListener('keydown', onEchap);
    };
  }, []);

  return (
    <div
      ref={ref}
      /*
        `relative z-40` n'est PAS décoratif · il corrige un menu qui s'ouvrait
        DERRIÈRE la fenêtre active. `backdrop-blur` crée un contexte
        d'empilement sur cette barre, et `will-change: transform` en crée un
        autre sur la fenêtre en dessous : deux contextes à z-index `auto`,
        donc à égalité, que seul l'ordre du DOM départageait · la fenêtre,
        écrite après, recouvrait le menu déroulé. Le `z-30` interne au menu
        n'y pouvait rien, un z-index ne compare que des frères du même
        contexte. La barre passe donc explicitement au-dessus (voir le
        `relative z-0` de <main> dans AppShell, qui borne l'autre côté).
      */
      /*
        `flex-wrap` + `min-h` plutôt que `h-[26px]` : à 360 px, les huit
        titres de menus mesurent 427 px. Sans retour à la ligne, la barre
        débordait et entraînait TOUTE l'application sur le côté · le dossier
        et les boutons de droite sortaient de l'écran. On ne peut pas s'en
        tirer par `overflow-x-auto` ici : un conteneur qui défile en X
        rogne aussi en Y, et les menus déroulés seraient coupés.
      */
      className="relative z-40 min-h-[26px] flex flex-wrap items-center gap-0.5 px-2 py-px sm:py-0 bg-chrome/80 backdrop-blur-md border-b border-border select-none"
    >
      {avant}
      {menus.map((m) => (
        // `static` sous `sm` : le menu déroulé se cale alors sur la BARRE
        // et non sur son titre. Ancré au titre, un menu de droite (« État »,
        // « Fenêtre ») partait 103 px hors de l'écran à 360 px.
        // `self-stretch` et NON `h-full` : `height:100%` se mesure sur la
        // BARRE entière, si bien qu'une fois celle-ci repliée sur deux rangs
        // chaque titre réclamait 49 px pour un rang qui en fait 24 · le
        // second rang débordait par le bas, jusque sur l'espace de travail.
        // `align-self: stretch` se mesure sur le RANG, ce qui est la mesure
        // voulue dans les deux cas.
        <div key={m.titre} className="static sm:relative self-stretch flex items-center">
          {/*
            Le menu ouvert prend la forme d'une pastille et non d'un pavé
            bleu pleine hauteur : la barre reste calme quand un menu est
            déployé, et l'œil suit le contenu du menu, pas son titre.
          */}
          <button
            type="button"
            onClick={() => setOuvert(ouvert === m.titre ? null : m.titre)}
            onMouseEnter={() => {
              if (ouvert && ouvert !== m.titre) setOuvert(m.titre);
            }}
            className={`rounded-[5px] px-2 py-[2px] text-[10.5px] font-medium ${
              ouvert === m.titre ? 'bg-sel-soft text-sel font-semibold' : 'hover:bg-chrome-alt'
            }`}
          >
            {m.titre}
          </button>
          {ouvert === m.titre && (
            <div className="anim-menu absolute left-2 right-2 sm:left-0 sm:right-auto top-full mt-0.5 z-30 sm:min-w-[178px] max-h-[calc(100dvh-64px)] overflow-y-auto rounded-[8px] border border-border bg-surface shadow-flottante p-1">
              {m.items.map((it, i) => (
                <div key={`${it.label}-${i}`}>
                  {it.separateurAvant && <div className="my-[3px] mx-1.5 border-t border-border" />}
                  <button
                    type="button"
                    disabled={it.disabled}
                    onClick={() => {
                      if (it.disabled) return;
                      it.onClick?.();
                      setOuvert(null);
                    }}
                    className="w-full text-left rounded-[5px] px-2.5 py-[3px] text-[10.5px] leading-[16px] hover:enabled:bg-sel-soft hover:enabled:text-sel disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {it.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {apres && <div className="ml-auto flex items-center gap-0.5">{apres}</div>}
    </div>
  );
}
