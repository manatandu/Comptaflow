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
export function MenuBar({ menus }: { menus: MenuDef[] }) {
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
      className="h-[32px] flex items-center gap-0.5 px-2 bg-chrome/80 backdrop-blur-md border-b border-border select-none"
    >
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
            className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium ${
              ouvert === m.titre ? 'bg-sel-soft text-sel font-semibold' : 'hover:bg-chrome-alt'
            }`}
          >
            {m.titre}
          </button>
          {ouvert === m.titre && (
            <div className="anim-menu absolute left-0 top-full mt-1 z-30 min-w-[250px] rounded-[12px] bg-surface shadow-flottante p-1.5">
              {m.items.map((it, i) => (
                <div key={`${it.label}-${i}`}>
                  {it.separateurAvant && <div className="my-1.5 mx-2 border-t border-border" />}
                  <button
                    type="button"
                    disabled={it.disabled}
                    onClick={() => {
                      if (it.disabled) return;
                      it.onClick?.();
                      setOuvert(null);
                    }}
                    className="w-full text-left rounded-[8px] px-3 py-[6px] text-[12px] hover:enabled:bg-sel-soft hover:enabled:text-sel hover:enabled:font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {it.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
