import { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { IconLogo } from './icons';

export interface RibbonGroupe {
  titre: string;
  boutons: Array<{ label: string; Icon: (p: { width?: number; height?: number }) => JSX.Element; onClick?: () => void; disabled?: boolean }>;
}

const MENUS = ['Fichier', 'Édition', 'Affichage', 'Comptabilité', 'Trésorerie', 'Tiers', 'États', 'Outils', 'Fenêtre', '?'];

export function Ribbon({ groupes, droite }: { groupes: RibbonGroupe[]; droite?: ReactNode }) {
  const { utilisateur, seDeconnecter } = useAuth();

  return (
    <div className="border-b border-border-dark bg-chrome">
      <div
        className="h-[26px] flex items-center justify-between px-2 text-white text-[11.5px]"
        style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
      >
        <div className="flex items-center gap-2">
          <IconLogo width={14} height={14} />
          <span>Compta Flow — {utilisateur?.tenant.nom}</span>
        </div>
        <button onClick={seDeconnecter} className="text-white/85 hover:text-white text-[11px] px-2 py-0.5">
          Déconnexion
        </button>
      </div>

      <div className="h-6 flex items-center gap-4 px-3 border-b border-border">
        {MENUS.map((m) => (
          <span key={m} className="text-[11.5px]">
            {m}
          </span>
        ))}
      </div>

      <div className="flex items-stretch justify-between">
        <div className="flex items-stretch px-2 py-1">
          {groupes.map((g) => (
            <div key={g.titre} className="flex flex-col items-center px-2.5 border-r border-border">
              <div className="flex-1 flex items-center gap-2">
                {g.boutons.map((b) => (
                  <button
                    key={b.label}
                    onClick={b.onClick}
                    disabled={b.disabled}
                    className="flex flex-col items-center gap-0.5 px-1 py-0.5 w-[52px] disabled:opacity-40"
                  >
                    <b.Icon width={20} height={20} />
                    <span className="text-[9.5px] text-text-dim text-center leading-tight">{b.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-text-dim mt-0.5">{g.titre}</div>
            </div>
          ))}
        </div>
        {droite && <div className="flex items-center px-3">{droite}</div>}
      </div>
    </div>
  );
}
