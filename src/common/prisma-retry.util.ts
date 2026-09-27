import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { journaliserDansTransaction } from './audit/contexte-audit';

// Code Prisma d'un échec de sérialisation (conflit d'écriture concurrente).
const CODE_CONFLIT_TRANSACTION = 'P2034';
const TENTATIVES_MAX = 5;

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exécute `fn` dans une transaction Prisma en isolation Serializable, avec
 * reprise automatique en cas de conflit de sérialisation (jusqu'à
 * TENTATIVES_MAX, délai croissant + aléatoire pour éviter que des tentatives
 * reparties en même temps se re-percutent aussitôt).
 *
 * À utiliser chaque fois qu'une opération lit un état agrégé (max d'un
 * compteur, prochaine lettre disponible...) puis écrit en conséquence : sans
 * cette garantie, deux requêtes concurrentes peuvent lire le même état et
 * produire un doublon silencieux. Introduit après un bug réel de ce type
 * trouvé dans la numérotation des pièces de journal (voir
 * EcritureService.creer) · le lettrage a exactement le même risque avec le
 * calcul de la prochaine lettre, d'où ce partage.
 *
 * `messageConflit` est utilisé pour le message renvoyé à l'utilisateur si
 * toutes les tentatives échouent (jamais un 500 brut).
 */
export async function avecRetrySerialisable<T>(
  prisma: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, opts?: any) => Promise<R> },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  messageConflit: string,
): Promise<T> {
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    try {
      // LE JOURNAL D'AUDIT S'ÉCRIT DANS CETTE TRANSACTION (audit du serveur
      // du 2026-09-27, F11). Écrit par une connexion à part, un maillon
      // survivait à l'annulation de l'acte, et chaque reprise après un
      // conflit en ajoutait un de plus · la chaîne attestait des créations
      // d'écritures qui n'ont jamais existé. Déclarée ici, la transaction
      // porte le maillon : il naît et meurt avec l'acte.
      return await prisma.$transaction((tx) => journaliserDansTransaction(tx, () => fn(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      const estConflit = err instanceof Prisma.PrismaClientKnownRequestError && err.code === CODE_CONFLIT_TRANSACTION;
      if (!estConflit) throw err;
      if (tentative === TENTATIVES_MAX) throw new ConflictException(messageConflit);
      await attendre(20 * tentative + Math.random() * 30);
    }
  }
  // Inatteignable (la boucle retourne ou relance à chaque itération) ·
  // seulement là pour satisfaire le vérificateur de types.
  throw new Error('Échec inattendu de la transaction sérialisable');
}
