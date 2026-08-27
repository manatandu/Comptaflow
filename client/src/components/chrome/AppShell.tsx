import { Outlet } from 'react-router-dom';
import { TreeNav } from './TreeNav';
import { StatusBar } from './StatusBar';
import { Ribbon } from './Ribbon';
import { RibbonProvider, useRibbonContext } from './ribbon-context';

function ShellInterieur() {
  const { groupes, droite } = useRibbonContext();
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Ribbon groupes={groupes} droite={droite} />
      <div className="flex-1 flex min-h-0">
        <TreeNav />
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
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
