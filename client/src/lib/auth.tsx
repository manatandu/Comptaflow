import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api, ApiError, setCsrf, synchroniserCsrf } from './api';
import { memoriserDossier } from './dossiersRecents';
import type { Exercice, JeuEtatsFinanciersSycebnl, SystemeComptableSyscohada, Referentiel, RoleUtilisateur } from './types';
import { oublierPrechargement, prechargerExercices } from './prechargement';
import { peutEcrirePourRole, peutValiderPourRole } from './roles-cantonnes';
import { surSessionPerdue } from './session-perdue';
import { fermerLaSession } from './deconnexion';

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
    /** AUSCGIE art. 17 · forme, capital, siège et RCCM à côté de la
     *  dénomination. null hors des sociétés commerciales. */
    mentionsSociete?: string | null;
    /** > 0 = dossier mère d'un groupe d'établissements · ouvre le menu
     *  « Balance agrégée du groupe ». */
    nombreCellules: number;
    /** Siège à plafond posé par la console · peut créer sa première cellule
     *  depuis la fenêtre du groupe (`GroupeService.creerCellule`). */
    peutCreerCellules?: boolean;
    /** ONG de droit étranger (loi n° 004/2001, art. 37) · null hors SYCEBNL. */
    ongEtrangere?: boolean | null;
    /** Faits déclarés · `null` = pas encore dit (`lib/profil-dossier.ts`). */
    assujettissementTva?: boolean | null;
    venteBiensServices?: boolean | null;
    /** Longueur maximale d'un numéro de compte ouvert par le cabinet (3 à 13). */
    longueurCompte?: number;
  };
  /**
   * « Rester connecté sur cet appareil » · vrai pour une session longue
   * (trente jours au plus), faux pour une session fermée avec le navigateur
   * (audit final F270). Lu par « Mon compte ».
   */
  sessionLongue?: boolean;
}

/** Ce que /auth/me rend · le jeton CSRF de la session en cours ne reste pas dans l'état React. */
type MeEtCsrf = MeResponse & { csrfToken?: string };

interface AuthContextValue {
  chargement: boolean;
  connecte: boolean;
  utilisateur: MeResponse | null;
  estAdmin: boolean;
  /**
   * Peut ENREGISTRER quelque chose dans le dossier · administrateur ou
   * comptable. Le serveur refuse l'écriture à LECTURE_SEULE sur toute route
   * POST, PUT, PATCH et DELETE (`ecritures-reservees.spec.ts`) ; l'écran ne
   * doit donc pas la proposer, sans quoi un auditeur ou un bailleur clique et
   * reçoit « Rôle insuffisant ». Une seule définition, lue par toutes les
   * fenêtres.
   */
  peutEcrire: boolean;
  /**
   * Valider, corriger, affecter le résultat, passer la paie au journal · le
   * comptable et l'administrateur seulement (roles-cantonnes.ts).
   */
  peutValider: boolean;
  /** Après /auth/login ou /auth/register · la session est déjà posée en
   *  cookie httpOnly par le serveur, on ne reçoit ici que le jeton CSRF. */
  seConnecter: (csrfToken: string) => Promise<void>;
  /** Relit /auth/me · à appeler après avoir changé un paramètre du dossier. */
  rafraichir: () => Promise<void>;
  /**
   * Ferme l'interface tout de suite, et résout quand le serveur a répondu
   * (succès ou échec) · lib/deconnexion.ts.
   */
  seDeconnecter: () => Promise<void>;
  /**
   * Pourquoi la session s'est fermée d'elle-même (expirée, close ailleurs,
   * compte désactivé) · l'écran de connexion l'affiche, pour que le retour à
   * la porte ne passe pas pour une panne (audit final F164). Nul après une
   * déconnexion voulue ou une connexion réussie.
   */
  motifDeconnexion: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<MeResponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [motifDeconnexion, setMotifDeconnexion] = useState<string | null>(null);
  // Lu par l'écouteur de session perdue, abonné une fois · l'état React vu
  // depuis sa fermeture serait celui du premier rendu.
  const ouverte = useRef(false);
  useEffect(() => {
    ouverte.current = utilisateur !== null;
  }, [utilisateur]);

  // UNE SESSION PERDUE EN COURS DE TRAVAIL FERME LA SESSION (audit final
  // F164) · vidée ici, l'espace de travail rend la main à la connexion
  // (ZoneProtegee), avec le motif. Sans session ouverte, le même refus n'est
  // pas une perte · la page vient de s'ouvrir, ou la connexion vérifie la
  // sienne et dira elle-même ce qui ne va pas.
  useEffect(
    () =>
      surSessionPerdue((motif) => {
        if (!ouverte.current) return;
        ouverte.current = false;
        oublierPrechargement();
        setCsrf(null);
        setUtilisateur(null);
        setMotifDeconnexion(motif);
      }),
    [],
  );

  /**
   * `exigeante` · la session VIENT d'être ouverte, /auth/me doit donc
   * répondre. S'il refuse, on ne peut pas se contenter de revenir à l'écran
   * d'accueil en silence : c'est ce qui s'est passé le 2026-09-02, où une
   * connexion pourtant acceptée par le serveur renvoyait à la porte sans un
   * mot, et où il a fallu lire le code pour comprendre.
   *
   * DEPUIS LE 2026-09-26, LE COOKIE EST DE PREMIÈRE PARTIE (audit final
   * F165) · l'API est servie sous l'adresse du site (`/api`, relais de
   * Firebase Hosting), et un navigateur qui bloque les cookies TIERS le garde.
   * Le message accusait pourtant les cookies tiers, et un utilisateur qui les
   * autorisait n'y trouvait rien. Ce qui jette encore le cookie aussitôt posé
   * est un blocage de TOUS les cookies du site · c'est ce que le message dit,
   * sans supposer davantage.
   */
  const chargerUtilisateur = async (exigeante = false) => {
    try {
      const { csrfToken, ...me } = await api.get<MeEtCsrf>('/auth/me');
      // Le jeton CSRF de CE cookie (audit final F270) · il suit la session au
      // lieu de lui survivre ou de mourir avant elle (lib/api.ts).
      synchroniserCsrf(csrfToken);
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
    } catch (erreur) {
      setCsrf(null);
      setUtilisateur(null);
      oublierPrechargement();
      if (exigeante) {
        throw new Error(
          erreur instanceof ApiError && erreur.status !== 401
            ? `Session refusée · ${erreur.message}`
            : "Session ouverte mais aussitôt perdue · le navigateur n'a pas gardé le cookie de session. " +
              'Vérifiez que les cookies ne sont pas bloqués pour ce site, puis réessayez.',
        );
      }
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    // Les exercices partent EN MÊME TEMPS que la vérification de session ·
    // un aller-retour transatlantique de moins à chaque ouverture.
    prechargerExercices(() => api.get<Exercice[]>('/exercices'));
    chargerUtilisateur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seConnecter = async (csrfToken: string) => {
    setMotifDeconnexion(null);
    setCsrf(csrfToken);
    // Ne PAS repasser `chargement` à true ici : ZoneProtegee (App.tsx) affiche
    // un plein écran « Chargement… » à la place de ses enfants tant que
    // `chargement` est vrai, ce qui démonterait tout l'arbre (dont l'écran
    // ou le wizard actuellement affiché) le temps de récupérer /auth/me ·
    // et donc, par ex., ferait disparaître la confirmation du wizard
    // « Nouveau fichier » avant que l'utilisateur ne la voie. `chargement`
    // ne sert qu'à la toute première vérification de session au montage.
    await chargerUtilisateur(true);
  };

  const rafraichir = async () => {
    await chargerUtilisateur();
  };

  const seDeconnecter = (): Promise<void> => {
    oublierPrechargement();
    // Le cookie httpOnly ne peut pas être effacé d'ici · c'est le serveur
    // qui le fait tomber. L'interface se ferme tout de suite, et la promesse
    // rendue ATTEND sa réponse (2026-09-28) · une connexion lancée avant
    // qu'elle n'arrive voyait son cookie neuf effacé par elle. Connexion et
    // création de dossier passent par `apresDeconnexion` (lib/deconnexion.ts).
    // Un échec réseau ferme quand même la session locale, et laisse au pire
    // un cookie qui expirera de lui-même (à la fermeture du navigateur, ou à
    // l'échéance d'une session « Rester connecté »).
    return fermerLaSession(
      () => api.post('/auth/logout'),
      () => {
        ouverte.current = false;
        setCsrf(null);
        setUtilisateur(null);
        setMotifDeconnexion(null);
      },
    );
  };

  return (
    <AuthContext.Provider
      value={{
        chargement,
        connecte: !!utilisateur,
        utilisateur,
        estAdmin: utilisateur?.role === 'ADMIN_CABINET',
        peutEcrire: peutEcrirePourRole(utilisateur?.role),
        peutValider: peutValiderPourRole(utilisateur?.role),
        seConnecter,
        rafraichir,
        seDeconnecter,
        motifDeconnexion,
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
