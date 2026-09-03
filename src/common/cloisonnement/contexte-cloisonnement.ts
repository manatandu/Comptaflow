import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * LA SORTIE DE CLOISONNEMENT, ET ELLE SEULE.
 *
 * Certaines opérations franchissent légitimement la frontière des dossiers :
 * la connexion (on cherche un utilisateur par son courriel, avant de savoir de
 * quel dossier il relève), la console de la plateforme, le siège d'un groupe
 * qui agrège ses cellules, et les semis de démarrage.
 *
 * Elles doivent le dire. `horsCloisonnement('raison', () => ...)` est le SEUL
 * moyen d'échapper à la garde, il porte une raison écrite, et le spec
 * `cloisonnement.spec.ts` fige la liste des fichiers qui y recourent · une
 * sortie ajoutée ailleurs fait tomber le test.
 *
 * L'alternative aurait été un drapeau booléen posé sur le service. Un drapeau
 * s'oublie ouvert ; une portée `run` se referme toute seule.
 */
const stockage = new AsyncLocalStorage<{ raison: string }>();

/**
 * PIÈGE DE LA PROMESSE PARESSEUSE · une requête Prisma n'est PAS lancée quand
 * on l'écrit. Une écriture de masse sur un modèle rend une `PrismaPromise` qui ne
 * déclenche ses crochets d'extension qu'au premier `.then()`. Or ce `.then()`
 * est appelé par le `await` de l'appelant, DEHORS de la portée ouverte ici :
 * `stockage.run` avait déjà rendu la main. La garde de cloisonnement lisait
 * donc un magasin vide et refusait la requête, sortie déclarée ou non.
 *
 * Le 2026-09-02, cela a fait tomber le serveur au démarrage (promotion des
 * opérateurs) et aurait de toute façon rendu la connexion impossible. On
 * appelle donc `.then` NOUS-MÊMES, de façon synchrone, tant que la portée est
 * ouverte · on ne se repose pas sur la propagation du contexte à travers une
 * micro-tâche, on la rend inutile.
 */
function estThenable(valeur: unknown): valeur is PromiseLike<unknown> {
  return (
    typeof valeur === 'object' &&
    valeur !== null &&
    typeof (valeur as PromiseLike<unknown>).then === 'function'
  );
}

export function horsCloisonnement<T>(raison: string, suite: () => T): T {
  return stockage.run({ raison }, () => {
    const resultat = suite();
    if (!estThenable(resultat)) return resultat;
    return new Promise((resoudre, rejeter) =>
      (resultat as PromiseLike<unknown>).then(resoudre, rejeter),
    ) as unknown as T;
  });
}

export function raisonHorsCloisonnement(): string | undefined {
  return stockage.getStore()?.raison;
}

/** Levée quand une requête franchit la frontière d'un dossier sans le dire. */
export class CloisonnementViole extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloisonnementViole';
  }
}
