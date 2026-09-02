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

export function horsCloisonnement<T>(raison: string, suite: () => T): T {
  return stockage.run({ raison }, suite);
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
