import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from './api';
import type { Referentiel } from './types';

interface MeResponse {
  email: string;
  role: string;
  tenant: { id: string; nom: string; referentiel: Referentiel };
}

interface AuthContextValue {
  chargement: boolean;
  connecte: boolean;
  utilisateur: MeResponse | null;
  seConnecter: (accessToken: string) => Promise<void>;
  seDeconnecter: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<MeResponse | null>(null);
  const [chargement, setChargement] = useState(true);

  const chargerUtilisateur = async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setUtilisateur(me);
    } catch {
      setToken(null);
      setUtilisateur(null);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    chargerUtilisateur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seConnecter = async (accessToken: string) => {
    setToken(accessToken);
    setChargement(true);
    await chargerUtilisateur();
  };

  const seDeconnecter = () => {
    setToken(null);
    setUtilisateur(null);
  };

  return (
    <AuthContext.Provider value={{ chargement, connecte: !!utilisateur, utilisateur, seConnecter, seDeconnecter }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  return ctx;
}
