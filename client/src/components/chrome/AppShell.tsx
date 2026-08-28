import { Outlet } from 'react-router-dom';
import { StatusBar } from './StatusBar';
import { Ribbon } from './Ribbon';
import { RibbonProvider, useRibbonContext } from './ribbon-context';

// Plus de navigation latérale : toutes les rubriques qu'elle portait
// (Accueil, Tableau de bord, Saisir une opération, Plan de comptes, Codes
// journaux, Journal & grand livre, États financiers, Utilisateurs) sont
// réparties dans les menus déroulants du ruban (voir Ribbon.tsx) — le
// centre occupe donc toute la largeur, sans rien à gauche ni à droite.
function ShellInterieur() {
  const { groupes, droite } = useRibbonContext();
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Ribbon groupes={groupes} droite={droite} />
      <main className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
}

export function AppShell() {
  return (
    <RibbonProvider>
      <ShellInterieur />
    </RibbonProvider>
  );
}
