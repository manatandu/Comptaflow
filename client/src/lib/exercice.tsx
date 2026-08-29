import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
import type { Exercice } from './types';

interface ExerciceContextValue {
  exerciceCourant: Exercice | null;
  exercices: Exercice[];
  chargement: boolean;
  recharger: () => Promise<void>;
}

const ExerciceContext = createContext<ExerciceContextValue | null>(null);

/**
 * L'exercice « courant » est le premier OUVERT dans la liste (triée par date
 * de début décroissante côté API) · évite d'imposer un sélecteur d'exercice
 * dans chaque écran du MVP. Le multi-exercice UI viendra en Phase 2/3.
 */
export function ExerciceProvider({ children }: { children: ReactNode }) {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [chargement, setChargement] = useState(true);

  const recharger = async () => {
    setChargement(true);
    const liste = await api.get<Exercice[]>('/exercices');
    setExercices(liste);
    setChargement(false);
  };

  useEffect(() => {
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exerciceCourant = exercices.find((e) => e.statut === 'OUVERT') ?? exercices[0] ?? null;

  return (
    <ExerciceContext.Provider value={{ exerciceCourant, exercices, chargement, recharger }}>
      {children}
    </ExerciceContext.Provider>
  );
}

export function useExercice() {
  const ctx = useContext(ExerciceContext);
  if (!ctx) throw new Error('useExercice doit être utilisé dans un <ExerciceProvider>');
  return ctx;
}
