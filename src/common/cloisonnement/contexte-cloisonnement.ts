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
type Portee = {
  /** Sortie TOTALE de la garde · connexion, console, semis. */
  raison?: string;
  /**
   * Sortie PARTIELLE · le siège d'un groupe lit et écrit dans ses cellules.
   * La garde continue de tourner, mais elle accepte, en plus du dossier de la
   * session, les dossiers NOMMÉS ici. Une cellule oubliée de la liste fait
   * lever · c'est la différence avec `horsCloisonnement`, qui accepterait
   * n'importe quel dossier, y compris celui d'un autre cabinet.
   */
  perimetre?: ReadonlySet<string>;
};

const stockage = new AsyncLocalStorage<Portee>();

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

function dansLaPortee<T>(portee: Portee, suite: () => T): T {
  return stockage.run(portee, () => {
    const resultat = suite();
    if (!estThenable(resultat)) return resultat;
    return new Promise((resoudre, rejeter) =>
      (resultat as PromiseLike<unknown>).then(resoudre, rejeter),
    ) as unknown as T;
  });
}

export function horsCloisonnement<T>(raison: string, suite: () => T): T {
  return dansLaPortee({ raison }, suite);
}

/**
 * LE PÉRIMÈTRE DU SIÈGE · la sortie mesurée.
 *
 * Le siège d'un groupe agrège, supervise et combine ses cellules : il lit et
 * écrit dans des dossiers qui ne sont pas celui de sa session. Jusqu'ici cela
 * passait sans rien dire, parce que la garde se contentait de constater la
 * PRÉSENCE d'un `tenantId` au filtre sans jamais en regarder la VALEUR. Un
 * filtre portant le dossier d'un autre cabinet passait donc exactement comme
 * celui d'une cellule.
 *
 * `perimetreDeGroupe` remplace ce silence par une liste écrite. La garde reste
 * en place et compare : le dossier de la session, plus ceux de la liste, et
 * rien d'autre. Une cellule absente de la liste lève au lieu de passer.
 *
 * La liste est TOUJOURS construite à partir du dossier de la session (ses
 * cellules, son dossier de combinaison) · jamais reçue d'un appelant, faute de
 * quoi elle rendrait au client le pouvoir de nommer ses propres voisins.
 */
export function perimetreDeGroupe<T>(dossiers: Iterable<string>, suite: () => T): T {
  const heritage = stockage.getStore()?.perimetre;
  const perimetre = new Set<string>(dossiers);
  // Un périmètre imbriqué n'ÉLARGIT jamais celui du dessus · il s'y ajoute,
  // et le dessus a déjà été vérifié. Une portée interne ne peut donc pas
  // servir à s'ouvrir un dossier que la portée externe refusait, puisque les
  // deux sont construites du même dossier de session.
  if (heritage) for (const d of heritage) perimetre.add(d);
  return dansLaPortee({ perimetre }, suite);
}

export function raisonHorsCloisonnement(): string | undefined {
  return stockage.getStore()?.raison;
}

/** Les dossiers que le siège a déclarés lisibles, en plus du sien. */
export function perimetreCourant(): ReadonlySet<string> | undefined {
  return stockage.getStore()?.perimetre;
}

/** Levée quand une requête franchit la frontière d'un dossier sans le dire. */
export class CloisonnementViole extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloisonnementViole';
  }
}
