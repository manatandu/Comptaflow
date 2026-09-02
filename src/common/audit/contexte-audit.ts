import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * QUI a fait l'acte. Le client Prisma ne le sait pas · il voit passer un
 * `update`, pas une requête HTTP. Le contexte est donc porté par un
 * AsyncLocalStorage, posé une fois par requête et lisible depuis n'importe
 * quelle profondeur d'appel, sans faire traverser un paramètre « acteur » à
 * trente services.
 *
 * L'alternative aurait été d'appeler un `journaliser(...)` à la main dans
 * chaque service. Un contrôle qu'on peut oublier d'appeler n'est pas un
 * contrôle · c'est précisément pour ça qu'il est posé sur le client Prisma.
 */
export interface ActeurAudit {
  /** Nul pour un acte non authentifié (rare · connexion, santé). */
  acteurId?: string;
  acteurEmail: string;
  /** Nul pour les actes de la plateforme, qui ne relèvent d'aucun dossier. */
  tenantId?: string;
  adresseIp?: string;
}

const stockage = new AsyncLocalStorage<ActeurAudit>();

export function dansContexteAudit<T>(acteur: ActeurAudit, suite: () => T): T {
  return stockage.run(acteur, suite);
}

export function acteurCourant(): ActeurAudit | undefined {
  return stockage.getStore();
}

/**
 * Actes accomplis hors requête HTTP · semis, tâches de démarrage, scripts.
 * Ils sont journalisés sous ce nom plutôt que d'être perdus : un plan de
 * comptes semé au démarrage est une modification du dossier comme une autre.
 */
export const ACTEUR_SYSTEME = 'systeme@omegax';
