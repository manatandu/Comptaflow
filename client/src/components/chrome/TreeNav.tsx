import { NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { IconHome, IconDashboard, IconSaisie, IconComptes, IconJournal, IconEtats, IconUsers, IconBook } from './icons';

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

const groupesBase = [
  {
    titre: 'PILOTAGE',
    items: [
      { to: '/', label: 'Accueil', Icon: IconHome, exact: true },
      { to: '/tableau-de-bord', label: 'Tableau de bord', Icon: IconDashboard },
      { to: '/saisie', label: 'Saisir une opération', Icon: IconSaisie },
    ],
  },
  {
    titre: 'COMPTABILITÉ',
    items: [
      { to: '/comptes', label: 'Plan de comptes', Icon: IconComptes },
      { to: '/journaux', label: 'Codes journaux', Icon: IconBook },
      { to: '/journal', label: 'Journal & grand livre', Icon: IconJournal },
    ],
  },
  {
    titre: 'RESTITUTION',
    items: [{ to: '/etats-financiers', label: 'États financiers', Icon: IconEtats }],
  },
];

const groupeAdministration = {
  titre: 'ADMINISTRATION',
  items: [{ to: '/utilisateurs', label: 'Utilisateurs', Icon: IconUsers, exact: false }],
};

export function TreeNav() {
  const { utilisateur, estAdmin } = useAuth();
  const groupes = estAdmin ? [...groupesBase, groupeAdministration] : groupesBase;

  return (
    <aside className="w-[196px] flex-shrink-0 bg-chrome border-r border-border flex flex-col">
      <div className="px-2.5 py-2 border-b border-border bg-surface-alt">
        <div className="text-[11px] font-bold truncate">{utilisateur?.tenant.nom}</div>
        <div className="font-mono text-[10px] tracking-wide text-text-dim">
          {utilisateur?.tenant.referentiel} · {utilisateur && LIBELLE_ROLE[utilisateur.role]}
        </div>
      </div>

      <nav className="flex-1 overflow-auto py-1">
        {groupes.map((g) => (
          <div key={g.titre}>
            <div className="px-2.5 pt-2.5 pb-1">
              <span className="font-mono text-[10px] font-semibold tracking-wider text-text-dim">{g.titre}</span>
            </div>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 pl-4 pr-2.5 py-1.5 text-[12.5px] border-l-2 ${
                    isActive
                      ? 'bg-chrome-alt border-sel text-text font-semibold'
                      : 'border-transparent text-text-dim hover:bg-chrome-alt/60'
                  }`
                }
              >
                <item.Icon width={14} height={14} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-2.5 py-2 border-t border-border flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-positive" />
        <span className="text-[10px] text-text-dim">Abonnement actif</span>
      </div>
    </aside>
  );
}
