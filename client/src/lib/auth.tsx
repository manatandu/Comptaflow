import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setCsrf } from './api';
import { memoriserDossier } from './dossiersRecents';
import type { JeuEtatsFinanciersSycebnl, SystemeComptableSyscohada, Referentiel, RoleUtilisateur } from './types';

interface MeResponse {
  id: string;
  email: string;
  role: RoleUtilisateur;
  /**
   * Opérateur de la plateforme (l'exploitant du logiciel) · ouvre l'entrée
   * de menu « Cabinets clients ». Purement cosmétique côté client : le
   * serveur relit le drapeau en base à chaque requête /plateforme.
   */
  estOperateurPlateforme: boolean;
  /** Mot de passe transité par un tiers · l'écran de changement s'impose
   *  avant l'espace de travail (voir ZoneProtegee, App.tsx). */
  doitChangerMotDePasse: boolean;
  tenant: {
    id: string;
    nom: string;
    referentiel: Referentiel;
    /** `null` hors SYCEBNL · voir src/common/reponse-referentiel.ts côté serveur. */
    jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl | null;
    /** Pendant SYSCOHADA · null pour un dossier SYCEBNL. */
    systemeComptableSyscohada: SystemeComptableSyscohada | null;
    /** Monnaie de tenue · l'unité monétaire est l'une des trois mentions
     *  obligatoires de chaque page d'états financiers publiés (AUDCIF
     *  Titre IX ch. 1 § 2.4). */
    devise: string | null;
    /** N° impôt · exigé en en-tête de chaque page imprimée (CPCC, § 7.4). */
    numeroImpot: string | null;
    /** > 0 = dossier mère d'un groupe d'établissements · ouvre le menu
     *  « Balance agrégée du groupe ». */
    nombreCellules: number;
  };
}

interface AuthContextValue {
  chargement: boolean;
  connecte: boolean;
  utilisateur: MeResponse | null;
  estAdmin: boolean;
  /** Après /auth/login ou /auth/register · la session est déjà posée en
   *  cookie httpOnly par le serveur, on ne reçoit ici que le jeton CSRF. */
  seConnecter: (csrfToken: string) => Promise<void>;
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
        jeuEtatsFinanciersSycebnl: me.tenant.jeuEtatsFinanciersSycebnl ?? undefined,
      });
    } catch {
      setCsrf(null);
      setUtilisateur(null);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    chargerUtilisateur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seConnecter = async (csrfToken: string) => {
    setCsrf(csrfToken);
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
    // Le cookie httpOnly ne peut pas être effacé d'ici · c'est le serveur
    // qui le fait tomber. Sans attendre la réponse : l'interface se ferme
    // tout de suite, et un échec réseau laisse au pire un cookie qui
    // expirera de lui-même (8 h).
    api.post('/auth/logout').catch(() => undefined);
    setCsrf(null);
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
