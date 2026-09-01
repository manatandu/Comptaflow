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
      className="relative z-40 h-[26px] flex items-center gap-0.5 px-2 bg-chrome/80 backdrop-blur-md border-b border-border select-none"
    >
      {avant}
      {menus.map((m) => (
        <div key={m.titre} className="relative h-full flex items-center">
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
            <div className="anim-menu absolute left-0 top-full mt-0.5 z-30 min-w-[178px] max-h-[calc(100dvh-64px)] overflow-y-auto rounded-[8px] border border-border bg-surface shadow-flottante p-1">
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
