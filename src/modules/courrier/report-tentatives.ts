import { StatutMessage } from '@prisma/client';

/**
 * LA REPRISE SUR ÉCHEC · combien de fois, et à quel rythme.
 *
 * Les deux nombres sont posés ici, nommés, et non enfouis dans une requête.
 * Un plafond qu'on ne trouve pas se change au hasard six mois plus tard, et
 * personne ne saura dire ce qu'il valait quand un dossier de recouvrement a
 * été monté.
 *
 * ------------------------------------------------------------------------
 * POURQUOI UN REPORT CROISSANT, ET NON UN INTERVALLE FIXE
 * ------------------------------------------------------------------------
 * Deux pannes se présentent au transport sous la même forme (une exception) et
 * demandent l'inverse l'une de l'autre :
 *
 *  · la panne PASSAGÈRE · coupure réseau, serveur de messagerie redémarré,
 *    refus temporaire du destinataire le temps qu'il vérifie l'expéditeur.
 *    Elle se répare en minutes, et un réessai rapide suffit ;
 *  · la panne DURABLE · domaine du destinataire inexistant, boîte fermée,
 *    identifiants d'envoi révoqués. Aucun réessai ne la répare.
 *
 * Un intervalle fixe et court sert bien la première et martèle la seconde ·
 * un serveur qui reçoit la même tentative toutes les minutes finit par classer
 * l'expéditeur comme indésirable, et c'est alors TOUT le courrier du cabinet
 * qui cesse d'arriver, pas seulement ce message. Le report croissant sépare
 * les deux cas sans demander à personne de les diagnostiquer.
 *
 * ------------------------------------------------------------------------
 * POURQUOI CINQ TENTATIVES, ET NON L'INFINI
 * ------------------------------------------------------------------------
 * Les quatre reports cumulés couvrent 5 h 20 · au-delà, une panne qui dure
 * n'est plus passagère, c'est une adresse ou une configuration à corriger, et
 * une sixième tentative ne corrige ni l'une ni l'autre. Réessayer sans fin
 * enterrerait le message dans une file que personne ne relit ; s'arrêter le
 * fait REMONTER, avec sa dernière erreur, à quelqu'un qui peut agir.
 *
 * ABANDONNE est terminal et reste lisible (voir la migration
 * 20260914180000_file_des_courriels) · une relance qui n'est jamais partie est
 * une information comptable, pas un déchet technique. Un dossier de
 * recouvrement se défend avec ce qu'on a tenté.
 *
 * ------------------------------------------------------------------------
 * CE QUE CES DÉLAIS NE SONT PAS
 * ------------------------------------------------------------------------
 * Le produit n'a AUCUN ordonnanceur (voir CourrierService.reprendre). Ces
 * délais sont donc des PLANCHERS, pas un horaire : rien ne se déclenche à
 * 5 minutes, c'est la reprise appelée depuis l'écran qui constate que l'heure
 * est passée. Les tenir pour un calendrier ferait attendre un envoi qui, en
 * pratique, part quand un comptable clique.
 */

/** Cinq tentatives au total, la première comprise. */
export const PLAFOND_TENTATIVES = 5;

const MINUTE = 60_000;

/**
 * Attente exigée APRÈS la n-ième tentative, avant la suivante · un cran par
 * échec, du quart d'heure de la coupure réseau à la demi-journée de la panne
 * qu'un humain devra regarder.
 */
export const ATTENTES_MINUTES = [5, 15, 60, 240];

/**
 * Attente en millisecondes après `tentatives` échecs, ou `null` quand le
 * plafond est atteint · il n'y a alors plus de prochain essai à dater.
 */
export function attenteApresEchec(tentatives: number): number | null {
  if (tentatives < 1) return null;
  if (tentatives >= PLAFOND_TENTATIVES) return null;
  // Le dernier report vaut pour tous les crans suivants s'il en naissait ·
  // le tableau et le plafond ne se contredisent alors jamais.
  const minutes = ATTENTES_MINUTES[Math.min(tentatives, ATTENTES_MINUTES.length) - 1];
  return minutes * MINUTE;
}

/** La date du prochain essai, ou `null` quand il n'y en aura pas. */
export function prochainEssaiApresEchec(tentatives: number, maintenant: Date): Date | null {
  const attente = attenteApresEchec(tentatives);
  return attente === null ? null : new Date(maintenant.getTime() + attente);
}

/** ECHEC tant qu'il reste un essai, ABANDONNE quand le plafond est atteint. */
export function statutApresEchec(tentatives: number): StatutMessage {
  return tentatives >= PLAFOND_TENTATIVES ? StatutMessage.ABANDONNE : StatutMessage.ECHEC;
}
