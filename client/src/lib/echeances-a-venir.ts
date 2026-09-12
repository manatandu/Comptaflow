import type { EcheancierFiscal } from './types';

/**
 * LES PROCHAINES ÉCHÉANCES FISCALES ET SOCIALES, AU TABLEAU DE BORD.
 *
 * L'échéancier existe depuis le chantier des retenues, complet et sourcé · il
 * ne vivait que dans la fenêtre Retenues, c'est-à-dire à l'endroit où l'on va
 * QUAND ON Y PENSE DÉJÀ. Une échéance qu'il faut aller chercher n'avertit
 * personne : le tableau de bord est le seul écran qu'un cabinet ouvre sans
 * avoir de raison particulière.
 *
 * TROIS RÈGLES, ET LA DEUXIÈME EST LA SEULE QUI COMPTE VRAIMENT.
 *
 * 1 · L'HORIZON EST EN JOURS, PAS EN NOMBRE DE LIGNES. Un « les cinq
 *     prochaines » masque en silence tout ce qui tombe après la cinquième, et
 *     rien à l'écran ne le dit. Un horizon se DÉCLARE, et ce qui le dépasse se
 *     compte · le panneau annonce alors « et N autres au-delà de X jours »,
 *     qui est une phrase vraie.
 *
 * 2 · UNE DÉCLARATION EN RETARD NE SE CONSTATE PAS, UN REVERSEMENT SI.
 *     C'est la distinction qui tient tout le panneau, et l'ignorer produirait
 *     un signalement faux (§ 10 bis de CLAUDE.md). Le logiciel ne sait pas si
 *     une déclaration a été DÉPOSÉE · aucune comptabilité ne porte ce fait, et
 *     le serveur ne rend d'ailleurs que la PROCHAINE occurrence, jamais une
 *     occurrence échue. Un reversement, lui, se lit dans les livres : une somme
 *     retenue au crédit d'un compte et non versée EST un fait comptable, et
 *     `moisEnRetard` le mesure. Le panneau ne met donc en rouge que ce second
 *     cas.
 *
 * 3 · AUCUN « VOUS ÊTES À JOUR ». Une liste vide veut dire « rien dans les
 *     trente jours », pas « tout est déposé et payé ». Écrire le second serait
 *     une affirmation que le logiciel n'a aucun moyen de vérifier, et c'est
 *     exactement celle qu'un cabinet croirait. Un test gèle l'absence de cette
 *     phrase dans l'écran.
 */

/**
 * Trente jours · un mois de visibilité sur un calendrier dont presque toutes
 * les échéances sont mensuelles. Aucun texte ne fixe cet horizon, c'est une
 * convention de lecture d'OmegaX et le panneau l'écrit.
 */
export const HORIZON_JOURS = 30;

export type EcheanceEcheancier = EcheancierFiscal['echeances'][number];

export interface EcheanceProche extends EcheanceEcheancier {
  /** Jours entiers d'ici l'échéance · négatif si elle est passée. */
  joursRestants: number;
  /**
   * VRAI seulement pour un reversement dont les livres montrent la somme
   * retenue et non versée. Jamais pour une déclaration · voir la règle 2.
   */
  retardConstate: boolean;
}

export interface EcheancesAVenir {
  proches: EcheanceProche[];
  /** Combien tombent APRÈS l'horizon · comptées, jamais tues. */
  auDela: number;
  horizonJours: number;
}

const MS_PAR_JOUR = 86_400_000;

/** Jours entiers entre deux dates, en ne gardant que la partie calendaire. */
export function joursEntre(de: Date, a: Date): number {
  const d = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const f = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.round((f - d) / MS_PAR_JOUR);
}

export function echeancesAVenir(
  echeancier: Pick<EcheancierFiscal, 'echeances' | 'dateReference'>,
  horizonJours: number = HORIZON_JOURS,
): EcheancesAVenir {
  // La référence est celle du SERVEUR, jamais l'horloge du poste · deux
  // navigateurs mal réglés afficheraient deux échéanciers différents pour le
  // même dossier, et c'est le serveur qui a calculé les dates.
  const reference = new Date(echeancier.dateReference);

  const avec = echeancier.echeances.map((e) => ({
    ...e,
    joursRestants: joursEntre(reference, new Date(e.date)),
    // `moisEnRetard` ne vaut que pour un reversement · le serveur le laisse à
    // zéro sur les déclarations, et le relire ici plutôt que de le supposer
    // évite qu'un genre nouveau hérite d'un retard qu'il ne porte pas.
    retardConstate: e.genre === 'REVERSEMENT' && e.moisEnRetard > 0,
  }));

  // Ce qui est EN RETARD CONSTATÉ remonte en tête, quelle que soit sa date ·
  // c'est le seul cas où une pénalité court déjà. Le reste suit par date.
  const proches = avec
    .filter((e) => e.retardConstate || e.joursRestants <= horizonJours)
    .sort((a, b) => {
      if (a.retardConstate !== b.retardConstate) return a.retardConstate ? -1 : 1;
      return a.joursRestants - b.joursRestants;
    });

  return {
    proches,
    auDela: avec.length - proches.length,
    horizonJours,
  };
}
