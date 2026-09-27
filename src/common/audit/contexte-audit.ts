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
  /**
   * Journaux où l'acteur peut saisir · null ou absent, aucune restriction
   * (common/perimetre/extension-perimetre-journaux.ts).
   */
  journauxAutorises?: readonly string[] | null;
}

const stockage = new AsyncLocalStorage<ActeurAudit>();

/**
 * LA TRANSACTION DANS LAQUELLE L'ACTE SE FAIT, quand il naît dans l'une ·
 * TOUTE transaction du serveur, qui passe par `transactionJournalisee`
 * (transaction-journalisee.ts, audit final F159), la seule qui appelle ceci.
 *
 * Le journal s'écrit d'ordinaire par une connexion À PART (le client non
 * étendu). Dans une transaction, c'est faux · un maillon écrit à part survit
 * à l'annulation, décrivant un acte qui n'a pas eu lieu, et chaque écriture
 * auditée prend une seconde connexion pendant que la transaction tient la
 * première. Pendant l'inscription, c'est faux une fois de plus : le dossier
 * n'existe pas encore pour la connexion à part, et la clé étrangère
 * (`evenements_audit_tenantId_fkey`) refusait chaque maillon de sa création.
 * Écrit DANS la transaction, il naît et meurt avec l'acte.
 */
export type ClientTransactionAudit = unknown;
const transactions = new AsyncLocalStorage<ClientTransactionAudit>();

export function journaliserDansTransaction<T>(tx: ClientTransactionAudit, suite: () => T): T {
  return transactions.run(tx, suite);
}

export function transactionAuditee(): ClientTransactionAudit | undefined {
  return transactions.getStore();
}

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
