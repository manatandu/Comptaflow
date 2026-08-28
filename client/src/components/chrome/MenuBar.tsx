import { useEffect, useRef, useState } from 'react';

export interface MenuItemDef {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Affiché en italique à droite de l'item désactivé (ex. "brique à venir"). */
  indication?: string;
}

export interface MenuDef {
  titre: string;
  items: MenuItemDef[];
}

/**
 * Barre de menus classique (Fichier/Édition/Affichage/...) — jusqu'ici de
 * simples libellés décoratifs, maintenant de vrais menus déroulants.
 * Un menu sans item réel (brique pas encore construite : Édition, Trésorerie,
 * Tiers, Fenêtre) affiche "Pas encore disponible" plutôt que de disparaître —
 * même logique que les tuiles verrouillées de l'écran Accueil : on montre ce
 * qui manque, on ne le cache pas.
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
    <div ref={ref} className="h-6 flex items-center gap-1 px-2.5 border-b border-border">
      {menus.map((m) => (
        <div key={m.titre} className="relative">
          <button
            type="button"
            onClick={() => setOuvert(ouvert === m.titre ? null : m.titre)}
            className={`text-[11.5px] px-1.5 py-0.5 ${ouvert === m.titre ? 'bg-sel text-white' : 'hover:bg-chrome-alt'}`}
          >
            {m.titre}
          </button>
          {ouvert === m.titre && (
            <div className="absolute left-0 top-full z-20 min-w-[210px] bg-surface border border-border-dark py-1">
              {m.items.length === 0 ? (
                <div className="px-3 py-1.5 text-[11.5px] text-text-dim italic">Pas encore disponible</div>
              ) : (
                m.items.map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    disabled={it.disabled}
                    onClick={() => {
                      if (it.disabled) return;
                      it.onClick?.();
                      setOuvert(null);
                    }}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-1.5 text-[11.5px] hover:enabled:bg-chrome-alt disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{it.label}</span>
                    {it.indication && <span className="text-[10px] text-text-dim italic">{it.indication}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
