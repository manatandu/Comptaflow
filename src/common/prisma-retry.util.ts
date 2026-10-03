import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { transactionJournalisee } from './audit/transaction-journalisee';

// Code Prisma d'un échec de sérialisation (conflit d'écriture concurrente).
const CODE_CONFLIT_TRANSACTION = 'P2034';
const TENTATIVES_MAX = 5;

/**
 * Un échec de sérialisation, où qu'il se loge · P2034 rendu par Prisma, ou
 * l'état SQL 40001 d'une requête brute (P2010), y compris enveloppé comme
 * cause (le maillon d'audit écrit par `$queryRaw` dans la transaction). Sans
 * cela, le conflit du maillon n'était pas rejoué et l'acte finissait en 500
 * (A5, quatrième relecture, mesuré à quatre dossiers simultanés).
 */
export function estConflitDeSerialisation(err: unknown): boolean {
  for (let e: unknown = err, n = 0; e && n < 5; e = (e as { cause?: unknown }).cause, n++) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === CODE_CONFLIT_TRANSACTION) return true;
      if (e.code === 'P2010' && (e.meta as { code?: string } | undefined)?.code === '40001') return true;
    }
  }
  return false;
}

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
/**
 * LE DÉLAI D'UNE TRANSACTION DONT LE TRAVAIL CROÎT AVEC LE VOLUME (audit final
 * F2). Le défaut de Prisma, cinq secondes, est celui d'un geste unitaire ; un
 * lettrage automatique de deux mille groupes ou la fusion d'un compte chargé
 * le dépassaient, et l'opération échouait entière. Le délai croît avec le
 * nombre d'opérations annoncé, plafonné sous la limite de requête de Cloud Run
 * (300 s) · au-delà, la réponse partirait de toute façon sans le résultat.
 * Convention d'OmegaX : dix secondes de base, et cinquante millisecondes par
 * opération, soit plusieurs allers-retours de marge chacune.
 */
export const DELAI_BASE_MS = 10_000;
export const DELAI_PAR_OPERATION_MS = 50;
export const DELAI_MAX_MS = 240_000;

export function delaiSelonVolume(operations: number): number {
  return Math.min(DELAI_MAX_MS, DELAI_BASE_MS + Math.max(0, operations) * DELAI_PAR_OPERATION_MS);
}

export async function avecRetrySerialisable<T>(
  prisma: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, opts?: any) => Promise<R> },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  messageConflit: string,
  options: { operations?: number } = {},
): Promise<T> {
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    try {
      // LE JOURNAL D'AUDIT S'ÉCRIT DANS CETTE TRANSACTION (audit du serveur
      // du 2026-09-27, F11). Écrit par une connexion à part, un maillon
      // survivait à l'annulation de l'acte, et chaque reprise après un
      // conflit en ajoutait un de plus · la chaîne attestait des créations
      // d'écritures qui n'ont jamais existé. Déclarée ici, la transaction
      // porte le maillon : il naît et meurt avec l'acte.
      return await transactionJournalisee(prisma, fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...(options.operations === undefined ? {} : { maxWait: 10_000, timeout: delaiSelonVolume(options.operations) }),
      });
    } catch (err) {
      const estConflit = estConflitDeSerialisation(err);
      if (!estConflit) throw err;
      if (tentative === TENTATIVES_MAX) throw new ConflictException(messageConflit);
      await attendre(20 * tentative + Math.random() * 30);
    }
  }
  // Inatteignable (la boucle retourne ou relance à chaque itération) ·
  // seulement là pour satisfaire le vérificateur de types.
  throw new Error('Échec inattendu de la transaction sérialisable');
}
