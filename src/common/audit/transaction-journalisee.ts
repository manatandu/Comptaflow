import { Prisma } from '@prisma/client';
import { journaliserDansTransaction } from './contexte-audit';

/**
 * LA SEULE PORTE D'UNE TRANSACTION (audit final F159).
 *
 * Le journal d'audit s'écrit d'ordinaire par une connexion À PART. Dans une
 * transaction, c'est faux deux fois · le maillon d'un acte ANNULÉ survit à
 * l'annulation, et la chaîne atteste une écriture qui n'a jamais existé ; et
 * chaque écriture auditée prend une seconde connexion pendant que la
 * transaction tient la première, ce qui épuise un pool étroit. Déclarée par
 * `journaliserDansTransaction`, la transaction porte le maillon, qui naît et
 * meurt avec l'acte.
 *
 * Deux transactions l'oubliaient encore, et rien n'empêchait la trente-sixième
 * de l'oublier à son tour. Toute transaction du serveur passe donc par cette
 * fonction · `transaction-journalisee.spec.ts` relit les sources et refuse un
 * `$transaction(` écrit ailleurs. La forme TABLEAU de Prisma
 * (`$transaction([a, b])`) n'y a plus sa place · elle exécute un lot sans
 * contexte asynchrone, et son maillon repartait par la connexion à part.
 */
export type ClientTransactionnel = {
  $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, options?: OptionsTransaction) => Promise<R>;
};

export type OptionsTransaction = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

export function transactionJournalisee<T>(
  prisma: ClientTransactionnel,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: OptionsTransaction,
): Promise<T> {
  const acte = (tx: Prisma.TransactionClient) => journaliserDansTransaction(tx, () => fn(tx));
  return options === undefined ? prisma.$transaction(acte) : prisma.$transaction(acte, options);
}
