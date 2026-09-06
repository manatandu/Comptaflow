import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api } from './api';
import type { Exercice } from './types';
import { resoudreExercice } from './exercice-choix';

interface ExerciceContextValue {
  exerciceCourant: Exercice | null;
  exercices: Exercice[];
  chargement: boolean;
  recharger: () => Promise<void>;
  /** Choix explicite de l'utilisateur · null revient au choix par défaut. */
  choisir: (exerciceId: string | null) => void;
  /**
   * VRAI quand le logiciel a dû trancher entre PLUSIEURS exercices ouverts
   * sans que l'utilisateur ait choisi. C'est le seul cas où l'exercice affiché
   * n'est décidé par personne, et l'interface doit le dire.
   */
  choixImplicite: boolean;
}

const ExerciceContext = createContext<ExerciceContextValue | null>(null);

/**
 * Clé de mémorisation, PAR DOSSIER · un opérateur de la plateforme passe d'un
 * cabinet à l'autre, et l'identifiant d'exercice d'un dossier n'a aucun sens
 * dans un autre. Une clé unique ferait pointer le sélecteur sur un exercice
 * qui n'existe pas, et le repli silencieux ramènerait le défaut par la fenêtre.
 */
const cleMemoire = (tenantId: string) => `omegax.exercice.${tenantId}`;

function lireMemoire(tenantId: string): string | null {
  // localStorage jette dans une fenêtre privée ou quand le navigateur bloque
  // le stockage · la préférence est un confort, jamais une condition d'usage.
  try {
    return window.localStorage.getItem(cleMemoire(tenantId));
  } catch {
    return null;
  }
}

function ecrireMemoire(tenantId: string, exerciceId: string | null): void {
  try {
    if (exerciceId === null) window.localStorage.removeItem(cleMemoire(tenantId));
    else window.localStorage.setItem(cleMemoire(tenantId), exerciceId);
  } catch {
    /* rien à faire · le choix vaut pour la session en cours */
  }
}

/**
 * L'EXERCICE COURANT NE SE DEVINE PLUS QUAND IL Y A UN DOUTE.
 *
 * Ce contexte prenait `exercices.find((e) => e.statut === 'OUVERT')` sur une
 * liste triée par date de début DÉCROISSANTE · c'est-à-dire le PLUS RÉCENT des
 * exercices ouverts, sans que rien ne le dise.
 *
 * LE DÉFAUT SE DÉCLENCHE DANS LA SITUATION LA PLUS ORDINAIRE QUI SOIT. Un
 * cabinet ouvre l'exercice 2027 le 1er janvier alors que 2026 n'est pas encore
 * clôturé · c'est la règle, pas l'exception, l'arrêté des comptes se faisant
 * dans les quatre mois qui suivent la clôture (AUDCIF art. 23). À cette
 * seconde, les trente-quatre écrans qui lisent ce contexte basculent sur 2027.
 * Le comptable qui saisit ses écritures de décembre ne les retrouve plus à la
 * balance, aucun total ne bouge, et rien à l'écran n'explique pourquoi.
 *
 * Trois règles, et la troisième est le vrai correctif :
 *
 *  · le CHOIX DE L'UTILISATEUR prime toujours, et il est mémorisé par dossier ;
 *  · à défaut de choix, un SEUL exercice ouvert est retenu sans discussion ·
 *    il n'y a rien à trancher ;
 *  · à défaut de choix et avec PLUSIEURS exercices ouverts, le plus récent est
 *    encore retenu, mais le contexte le DÉCLARE (`choixImplicite`) pour que
 *    l'interface le signale. Refuser d'afficher quoi que ce soit bloquerait le
 *    logiciel dans un cas parfaitement légitime ; choisir en silence est ce qui
 *    vient d'être corrigé. La seule issue honnête est de choisir ET de le dire.
 */
export function ExerciceProvider({ children }: { children: ReactNode }) {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [chargement, setChargement] = useState(true);
  const [choisiId, setChoisiId] = useState<string | null>(null);

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

  // Le dossier se lit sur les exercices eux-mêmes · le contexte d'exercice ne
  // dépend pas de celui d'authentification, et l'y accrocher créerait un ordre
  // de montage à respecter.
  const tenantId = exercices[0]?.tenantId ?? null;

  useEffect(() => {
    if (tenantId) setChoisiId(lireMemoire(tenantId));
  }, [tenantId]);

  const choisir = (exerciceId: string | null) => {
    setChoisiId(exerciceId);
    if (tenantId) ecrireMemoire(tenantId, exerciceId);
  };

  // La RÈGLE vit dans `exercice-choix.ts`, hors du composant · c'est ce qui la
  // rend testable sans monter React, et ce qui garantit que le test porte sur
  // ce que l'application exécute vraiment.
  const { exerciceCourant, choixImplicite } = useMemo(
    () => resoudreExercice(exercices, choisiId),
    [exercices, choisiId],
  );

  return (
    <ExerciceContext.Provider
      value={{ exerciceCourant, exercices, chargement, recharger, choisir, choixImplicite }}
    >
      {children}
    </ExerciceContext.Provider>
  );
}

export function useExercice() {
  const ctx = useContext(ExerciceContext);
  if (!ctx) throw new Error('useExercice doit être utilisé dans un <ExerciceProvider>');
  return ctx;
}
