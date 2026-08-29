import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from './api';
import { memoriserDossier } from './dossiersRecents';
import type { JeuEtatsFinanciersSycebnl, Referentiel, RoleUtilisateur } from './types';

interface MeResponse {
  id: string;
  email: string;
  role: RoleUtilisateur;
  tenant: { id: string; nom: string; referentiel: Referentiel; jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl };
}

interface AuthContextValue {
  chargement: boolean;
  connecte: boolean;
  utilisateur: MeResponse | null;
  estAdmin: boolean;
  seConnecter: (accessToken: string) => Promise<void>;
  /** Relit /auth/me · à appeler après avoir changé un paramètre du dossier. */
  rafraichir: () => Promise<void>;
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
      // Le dossier vient d'être ouvert · il rejoint la liste des dossiers
      // récents de cet appareil, l'équivalent du menu Fichier > Favoris de
      // Sage (voir lib/dossiersRecents.ts). C'est le SEUL endroit où cette
      // liste est alimentée : `chargerUtilisateur` est appelée après une
      // connexion, après la création d'un dossier par l'assistant, et à la
      // reprise d'une session. Le faire ailleurs dupliquerait la règle · et
      // le faire depuis la réponse de /auth/login ne marcherait pas, cette
      // réponse ne portant que le jeton.
      memoriserDossier({
        nom: me.tenant.nom,
        email: me.email,
        referentiel: me.tenant.referentiel,
        jeuEtatsFinanciersSycebnl: me.tenant.jeuEtatsFinanciersSycebnl,
      });
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
    // Ne PAS repasser `chargement` à true ici : ZoneProtegee (App.tsx) affiche
    // un plein écran « Chargement… » à la place de ses enfants tant que
    // `chargement` est vrai, ce qui démonterait tout l'arbre (dont l'écran
    // ou le wizard actuellement affiché) le temps de récupérer /auth/me ·
    // et donc, par ex., ferait disparaître la confirmation du wizard
    // « Nouveau fichier » avant que l'utilisateur ne la voie. `chargement`
    // ne sert qu'à la toute première vérification de session au montage.
    await chargerUtilisateur();
  };

  const rafraichir = async () => {
    await chargerUtilisateur();
  };

  const seDeconnecter = () => {
    setToken(null);
    setUtilisateur(null);
  };

  return (
    <AuthContext.Provider
      value={{
        chargement,
        connecte: !!utilisateur,
        utilisateur,
        estAdmin: utilisateur?.role === 'ADMIN_CABINET',
        seConnecter,
        rafraichir,
        seDeconnecter,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  return ctx;
}
