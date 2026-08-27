import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { RibbonGroupe } from './Ribbon';

interface RibbonContextValue {
  groupes: RibbonGroupe[];
  droite: ReactNode;
  definir: (groupes: RibbonGroupe[], droite?: ReactNode) => void;
}

const RibbonContext = createContext<RibbonContextValue | null>(null);

export function RibbonProvider({ children }: { children: ReactNode }) {
  const [groupes, setGroupes] = useState<RibbonGroupe[]>([]);
  const [droite, setDroite] = useState<ReactNode>(null);

  return (
    <RibbonContext.Provider
      value={{
        groupes,
        droite,
        definir: (g, d) => {
          setGroupes(g);
          setDroite(d ?? null);
        },
      }}
    >
      {children}
    </RibbonContext.Provider>
  );
}

export function useRibbonContext() {
  const ctx = useContext(RibbonContext);
  if (!ctx) throw new Error('useRibbonContext doit être utilisé dans un <RibbonProvider>');
  return ctx;
}

/**
 * À appeler dans chaque page pour déclarer les groupes de boutons du ruban
 * contextuel. Enregistré une seule fois au montage de la page (deps `[]`) :
 * `groupes`/`droite` sont recréés à chaque rendu par l'appelant, donc les
 * suivre en dépendance déclencherait un set-state -> re-rendu -> nouvel objet
 * -> set-state... en boucle infinie. Les gestionnaires de clic restent
 * fonctionnels malgré la capture au montage (closures sur `navigate`, stable
 * entre rendus) ; à revoir si un futur ruban a besoin de réagir à un état qui
 * change en cours de vie de la page.
 */
export function useRibbon(groupes: RibbonGroupe[], droite?: ReactNode) {
  const { definir } = useRibbonContext();
  useEffect(() => {
    definir(groupes, droite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
