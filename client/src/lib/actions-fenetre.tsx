import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * ACTIONS DE LA FENÊTRE ACTIVE · ce qui donne un sens à la barre d'outils.
 *
 * La barre d'outils de Sage 100 i7 ne lance PAS des écrans : elle agit sur
 * l'enregistrement courant de la fenêtre active (Ajouter, Consulter,
 * Voir/Modifier, Supprimer, Rechercher, Atteindre, Inverseur, Trier), et
 * grise ce qui ne s'applique pas à la fenêtre du moment · d'où les boutons
 * pâles sur les captures. Les ÉCRANS, eux, se lancent depuis les menus et
 * depuis la page d'accueil.
 *
 * La barre d'outils d'OmegaX faisait l'inverse : elle listait sept écrans,
 * exactement ceux que l'accueil propose déjà en tuiles. Deux surfaces pour
 * la même chose · la tautologie relevée à l'usage. Elle porte désormais les
 * actions, comme chez Sage.
 *
 * MÉCANIQUE · chaque fenêtre déclare, depuis sa page, les actions qu'elle
 * sait faire (`useActionsFenetre`). La barre lit celles de la fenêtre ACTIVE
 * et grise le reste. Une action non déclarée n'est donc jamais un bouton mort
 * qui ne répond pas : elle est visiblement indisponible.
 *
 * Pourquoi les gestionnaires vivent dans une `ref` et non dans l'état : ils
 * sont recréés à chaque rendu de la page (fonctions fléchées fermant sur
 * l'état courant). Les mettre dans l'état déclencherait un rendu à chaque
 * rendu · une boucle. Seule la SIGNATURE (la liste des actions disponibles)
 * passe par l'état, parce que c'est elle, et elle seule, qui doit rafraîchir
 * l'affichage grisé/actif de la barre.
 */

export type NomAction =
  | 'ajouter'
  | 'consulter'
  | 'modifier'
  | 'supprimer'
  | 'rechercher'
  | 'atteindre'
  | 'inverseur'
  | 'trier';

export interface Action {
  /** Infobulle · précise ce que le verbe générique fait DANS cette fenêtre. */
  titre?: string;
  executer: () => void;
}

export type ActionsFenetre = Partial<Record<NomAction, Action | undefined>>;

interface ContexteActions {
  /** Signature des actions disponibles, par clé de fenêtre. Réactive. */
  signatures: Record<string, string>;
  enregistrer: (cle: string, actions: ActionsFenetre) => void;
  oublier: (cle: string) => void;
  /** Lit le gestionnaire courant · à l'instant du clic, jamais avant. */
  lire: (cle: string, nom: NomAction) => Action | undefined;
}

const Contexte = createContext<ContexteActions | null>(null);

/** Identité de la fenêtre dans laquelle une page est montée. */
const ContexteFenetreCourante = createContext<string | null>(null);

export function FenetreCouranteProvider({ cle, children }: { cle: string; children: React.ReactNode }) {
  return <ContexteFenetreCourante.Provider value={cle}>{children}</ContexteFenetreCourante.Provider>;
}

export function ActionsFenetreProvider({ children }: { children: React.ReactNode }) {
  const registre = useRef<Map<string, ActionsFenetre>>(new Map());
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  const enregistrer = useCallback((cle: string, actions: ActionsFenetre) => {
    registre.current.set(cle, actions);
    const signature = (Object.keys(actions) as NomAction[])
      .filter((n) => actions[n])
      .sort()
      .join('|');
    setSignatures((s) => (s[cle] === signature ? s : { ...s, [cle]: signature }));
  }, []);

  const oublier = useCallback((cle: string) => {
    registre.current.delete(cle);
    setSignatures((s) => {
      if (!(cle in s)) return s;
      const suite = { ...s };
      delete suite[cle];
      return suite;
    });
  }, []);

  const lire = useCallback((cle: string, nom: NomAction) => registre.current.get(cle)?.[nom], []);

  const valeur = useMemo(
    () => ({ signatures, enregistrer, oublier, lire }),
    [signatures, enregistrer, oublier, lire],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useRegistreActions() {
  const c = useContext(Contexte);
  if (!c) throw new Error('useRegistreActions doit être utilisé dans un ActionsFenetreProvider');
  return c;
}

/**
 * À appeler depuis une page pour déclarer ce que sa fenêtre sait faire.
 * Sans effet si la page n'est pas montée dans une fenêtre (l'accueil, par
 * exemple, qui est le fond de l'espace de travail).
 */
export function useActionsFenetre(actions: ActionsFenetre) {
  const cle = useContext(ContexteFenetreCourante);
  const registre = useContext(Contexte);

  // À chaque rendu : les gestionnaires viennent d'être recréés, la `ref` doit
  // porter les derniers. `enregistrer` ne réveille l'état que si la liste des
  // actions disponibles a changé · pas de boucle.
  useEffect(() => {
    if (!cle || !registre) return;
    registre.enregistrer(cle, actions);
  });

  useEffect(() => {
    if (!cle || !registre) return;
    return () => registre.oublier(cle);
    // Volontairement borné à la clé : oublier à chaque rendu, puis
    // réenregistrer, ferait clignoter la barre d'outils.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
}
