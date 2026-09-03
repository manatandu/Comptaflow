import { horsCloisonnement, raisonHorsCloisonnement } from './contexte-cloisonnement';

/**
 * L'INCIDENT DU 2026-09-02 · le serveur ne démarrait plus, et la connexion
 * aurait de toute façon été refusée.
 *
 * `horsCloisonnement('raison', () => prisma.user.updateMany(...))` paraissait
 * couvrir la requête. Il ne la couvrait pas : une `PrismaPromise` est
 * PARESSEUSE · elle ne lance rien tant que personne n'appelle son `.then()`.
 * Ce `.then()` venait du `await` de l'appelant, après que `run` eut rendu la
 * main · le magasin d'AsyncLocalStorage était alors vide, et la garde refusait
 * la requête en criant qu'aucune sortie n'avait été déclarée.
 *
 * Les tests d'alors ne pouvaient rien voir : leurs faux Prisma rendaient des
 * promesses natives, déjà lancées. C'est cette paresse-là qu'il faut simuler.
 */

/** Une promesse qui, comme celle de Prisma, ne fait son travail qu'au `.then`. */
function promesseParesseuse<T>(travail: () => T) {
  let lance = false;
  return {
    get aEteLance() {
      return lance;
    },
    then(resoudre: (v: T) => void, rejeter: (e: unknown) => void) {
      lance = true;
      try {
        resoudre(travail());
      } catch (erreur) {
        rejeter(erreur);
      }
    },
  };
}

describe('sortie de cloisonnement et promesse paresseuse', () => {
  it('la raison est encore lisible quand la promesse s’exécute enfin', async () => {
    let raisonVueAuLancement: string | undefined = 'jamais lancée';
    const paresseuse = promesseParesseuse(() => {
      raisonVueAuLancement = raisonHorsCloisonnement();
      return 'fait';
    });

    // Le `await` est DEHORS de la portée · c'est exactement la forme qu'ont
    // tous les appelants (`await horsCloisonnement(..., () => prisma...)`).
    const rendu = await horsCloisonnement('démarrage · promotion des opérateurs', () => paresseuse);

    expect(rendu).toBe('fait');
    expect(paresseuse.aEteLance).toBe(true);
    expect(raisonVueAuLancement).toBe('démarrage · promotion des opérateurs');
  });

  it('la portée se referme une fois la sortie consommée', async () => {
    await horsCloisonnement('console · dossier créé par l’opérateur', async () => undefined);
    expect(raisonHorsCloisonnement()).toBeUndefined();
  });

  it('un rejet de la promesse paresseuse remonte tel quel', async () => {
    const paresseuse = promesseParesseuse(() => {
      throw new Error('la base a dit non');
    });
    await expect(horsCloisonnement('connexion', () => paresseuse)).rejects.toThrow('la base a dit non');
  });

  it('une valeur qui n’est pas une promesse traverse sans être enveloppée', () => {
    expect(horsCloisonnement('semis', () => 42)).toBe(42);
  });
});
