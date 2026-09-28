import type { Exercice } from './types';

/** Le résultat d'une lecture des exercices · une liste lue, ou le motif de son échec. */
export type LectureExercices = { liste: Exercice[]; erreur: null } | { liste: null; erreur: string };

/**
 * LIT LES EXERCICES DU DOSSIER, ET NE LÈVE JAMAIS (audit final F248).
 *
 * Le contexte d'exercice posait `chargement` à vrai, attendait la réponse,
 * puis le remettait à faux · sans `try` ni `finally`. Un refus du serveur
 * (réseau coupé, session perdue, 500) laissait donc `chargement` à vrai pour
 * toujours : la fenêtre Exercices affichait « Chargement… » sans fin, et les
 * écrans qui attendent la fin du chargement (facturation, devis) ne lisaient
 * jamais leur liste. L'échec se rend désormais en MOTIF, que le contexte
 * expose et que la barre d'état et la fenêtre Exercices affichent.
 *
 * La réponse préchargée au démarrage (prechargement.ts) est reprise quand
 * elle existe ; si elle a échoué, la liste est redemandée une fois, et c'est
 * l'échec de cette seconde lecture qui est rendu.
 */
export async function lireLesExercices(
  prechargee: Promise<Exercice[]> | null,
  lire: () => Promise<Exercice[]>,
): Promise<LectureExercices> {
  try {
    const liste = prechargee ? await prechargee.catch(() => lire()) : await lire();
    return { liste, erreur: null };
  } catch (e) {
    return { liste: null, erreur: e instanceof Error && e.message ? e.message : "Les exercices n'ont pas pu être lus." };
  }
}
