import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * GESTIONNAIRE DE FENÊTRES · le modèle MDI de Sage 100 Comptabilité i7.
 *
 * Sage n'affiche pas « une page à la fois » : il ouvre des FENÊTRES dans un
 * espace de travail. Chacune porte ses trois boutons (réduire, agrandir,
 * fermer), plusieurs restent ouvertes ensemble, et la barre du bas rappelle
 * celles qu'on a réduites (« Plan Co… », « Ajout d'… » sur les captures).
 * C'est ce qui permet de consulter le plan comptable SANS perdre la pièce
 * qu'on est en train de saisir · un comptable fait constamment les deux.
 *
 * Ce module ne tient QUE l'état : quelles fenêtres, dans quel ordre, dans
 * quel état, à quelle place. Il ignore délibérément quel composant s'affiche
 * dedans · c'est `lib/registre-fenetres.tsx` qui le sait, et lui seul importe
 * les pages. Sans cette séparation, ce module importerait les pages, qui
 * importent `useFenetres` : un cycle d'import, qu'un import placé en bas de
 * fichier ne romprait pas (les imports ESM sont hissés). D'où le `titre`
 * passé en argument d'`ouvrir` plutôt que résolu ici.
 *
 * IDENTITÉ D'UNE FENÊTRE · son chemin (`/comptes`, `/journal`). Rouvrir le
 * même chemin ne duplique donc rien : la fenêtre existante revient au premier
 * plan, comme chez Sage. Deux interrogations de comptes différents
 * (`/comptes/A/lettrage`, `/comptes/B/lettrage`) ont en revanche des chemins
 * distincts, donc deux fenêtres · exactement ce qu'on veut pour comparer.
 */

export type EtatFenetre = 'normale' | 'reduite' | 'agrandie';

export interface CadreFenetre {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface FenetreOuverte {
  /** Chemin sans la query · identité de la fenêtre. */
  cle: string;
  /**
   * Chemin COMPLET, query comprise (`/journal?onglet=balance`). C'est lui que
   * la fenêtre reçoit : il porte l'onglet demandé par le menu, sans quoi
   * « État → Balance des comptes » ouvrirait le journal sur l'onglet Journal.
   */
  adresse: string;
  titre: string;
  titreCourt: string;
  etat: EtatFenetre;
  /**
   * État à retrouver en sortant de « réduite ». Windows comme Sage
   * restaurent une fenêtre dans l'état où on l'a laissée : réduire une
   * fenêtre plein écran puis la rappeler doit la rendre plein écran, et non
   * la rétrécir en fenêtre flottante · sans cette mémoire, chaque aller-retour
   * par la barre du bas rapetissait la fenêtre, et il fallait la ragrandir à
   * la main. Défaut trouvé au test du parcours réduire → restaurer.
   */
  etatAvantReduction: Exclude<EtatFenetre, 'reduite'>;
  /** Ordre d'empilement · le plus grand est devant. */
  ordre: number;
  /** Position et taille à l'état « normale », en pixels dans l'espace de travail. */
  cadre: CadreFenetre;
}

/** Ce que l'appelant doit fournir pour qu'une fenêtre inconnue soit créée. */
export interface MetaFenetre {
  titre: string;
  titreCourt: string;
}

interface ContexteFenetres {
  fenetres: FenetreOuverte[];
  /** Fenêtre au premier plan, hors fenêtres réduites. `null` = l'accueil est à nu. */
  cleActive: string | null;
  ouvrir: (adresse: string, meta: MetaFenetre) => void;
  fermer: (cle: string) => void;
  fermerTout: () => void;
  activer: (cle: string) => void;
  reduire: (cle: string) => void;
  basculerAgrandissement: (cle: string) => void;
  deplacer: (cle: string, cadre: Partial<CadreFenetre>) => void;
}

const Contexte = createContext<ContexteFenetres | null>(null);

/**
 * Les fenêtres flottantes se décalent en cascade, comme chez Sage : sans ça,
 * une fenêtre ouverte derrière une autre de même taille serait invisible et
 * donnerait l'impression que la commande n'a rien fait.
 */
const CASCADE_PAS = 26;
const CASCADE_MAX = 6;

export function FenetresProvider({ children }: { children: React.ReactNode }) {
  const [fenetres, setFenetres] = useState<FenetreOuverte[]>([]);
  const compteurOrdre = useRef(1);
  const compteurCascade = useRef(0);

  const ouvrir = useCallback((adresse: string, meta: MetaFenetre) => {
    const cle = adresse.split('?')[0];
    setFenetres((actuelles) => {
      const ordre = ++compteurOrdre.current;
      const existante = actuelles.find((f) => f.cle === cle);
      if (existante) {
        // Rouvrir = ramener devant, jamais dupliquer. Une fenêtre réduite
        // qu'on rouvre depuis le menu doit REPARAÎTRE : la laisser réduite
        // donnerait l'impression que la commande n'a rien fait.
        return actuelles.map((f) =>
          f.cle === cle
            ? { ...f, adresse, ordre, etat: f.etat === 'reduite' ? f.etatAvantReduction : f.etat }
            : f,
        );
      }
      const rang = compteurCascade.current++ % CASCADE_MAX;
      return [
        ...actuelles,
        {
          cle,
          adresse,
          titre: meta.titre,
          titreCourt: meta.titreCourt,
          // Les fenêtres s'ouvrent AGRANDIES : leur contenu (grilles de
          // saisie, balances, états financiers) est dense et mérite tout
          // l'écran. Un clic sur « restaurer » donne la fenêtre flottante,
          // pour en comparer deux côte à côte. L'inverse (ouvrir en flottant)
          // obligerait à agrandir à chaque fois, neuf fois sur dix.
          etat: 'agrandie' as const,
          etatAvantReduction: 'agrandie' as const,
          ordre,
          cadre: {
            x: 24 + rang * CASCADE_PAS,
            y: 16 + rang * CASCADE_PAS,
            largeur: 940,
            hauteur: 560,
          },
        },
      ];
    });
  }, []);

  const fermer = useCallback((cle: string) => {
    setFenetres((a) => a.filter((f) => f.cle !== cle));
  }, []);

  const fermerTout = useCallback(() => setFenetres([]), []);

  const activer = useCallback((cle: string) => {
    const ordre = ++compteurOrdre.current;
    setFenetres((a) =>
      a.map((f) => (f.cle === cle ? { ...f, ordre, etat: f.etat === 'reduite' ? f.etatAvantReduction : f.etat } : f)),
    );
  }, []);

  const reduire = useCallback((cle: string) => {
    setFenetres((a) =>
      a.map((f) =>
        f.cle === cle
          ? { ...f, etat: 'reduite' as const, etatAvantReduction: f.etat === 'reduite' ? f.etatAvantReduction : f.etat }
          : f,
      ),
    );
  }, []);

  const basculerAgrandissement = useCallback((cle: string) => {
    const ordre = ++compteurOrdre.current;
    setFenetres((a) =>
      a.map((f) => {
        if (f.cle !== cle) return f;
        const etat = f.etat === 'agrandie' ? ('normale' as const) : ('agrandie' as const);
        return { ...f, ordre, etat, etatAvantReduction: etat };
      }),
    );
  }, []);

  const deplacer = useCallback((cle: string, cadre: Partial<CadreFenetre>) => {
    setFenetres((a) => a.map((f) => (f.cle === cle ? { ...f, cadre: { ...f.cadre, ...cadre } } : f)));
  }, []);

  const cleActive = useMemo(() => {
    const visibles = fenetres.filter((f) => f.etat !== 'reduite');
    if (visibles.length === 0) return null;
    return visibles.reduce((a, b) => (a.ordre > b.ordre ? a : b)).cle;
  }, [fenetres]);

  const valeur = useMemo(
    () => ({
      fenetres,
      cleActive,
      ouvrir,
      fermer,
      fermerTout,
      activer,
      reduire,
      basculerAgrandissement,
      deplacer,
    }),
    [fenetres, cleActive, ouvrir, fermer, fermerTout, activer, reduire, basculerAgrandissement, deplacer],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useFenetres() {
  const c = useContext(Contexte);
  if (!c) throw new Error('useFenetres doit être utilisé dans un FenetresProvider');
  return c;
}
