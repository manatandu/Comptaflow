/**
 * LA DÉCONNEXION ATTEND LE SERVEUR, ET TOUTE OUVERTURE DE SESSION ATTEND LA
 * DÉCONNEXION (2026-09-28).
 *
 * `POST /auth/logout` répond en effaçant le cookie de session. Lancé sans être
 * attendu, il pouvait revenir APRÈS une connexion partie entre-temps (« Ouvrir
 * un autre dossier », puis le mot de passe du suivant) · sa réponse effaçait
 * alors le cookie que la connexion venait de poser, et la session neuve
 * mourait au premier appel sous un « session perdue » qui accusait le
 * navigateur. Un cookie se pose dans l'ordre où les RÉPONSES arrivent, pas
 * dans celui où les requêtes partent.
 *
 * D'où deux règles. Toute porte qui POSE une session (connexion, création
 * d'un dossier par l'assistant) passe par `apresDeconnexion`, qui rend la main
 * quand la dernière déconnexion lancée a reçu sa réponse. Et une déconnexion
 * qui échoue (réseau, serveur) RÉSOUT quand même · un échec ne bloque jamais
 * la connexion suivante, et la session locale est déjà fermée
 * (`fermerLaSession`).
 */

// Chaîne des déconnexions lancées · ne rejette jamais.
let derniere: Promise<void> = Promise.resolve();

/**
 * Lance `POST /auth/logout` TOUT DE SUITE (les en-têtes de la requête sont
 * lus à l'appel) et rend une promesse qui résout quand sa réponse est reçue,
 * et celles des déconnexions lancées avant elle, succès ou échec.
 */
export function deconnecterServeur(poster: () => Promise<unknown>): Promise<void> {
  let envoi: Promise<unknown>;
  try {
    envoi = poster();
  } catch (e) {
    envoi = Promise.reject(e);
  }
  const reponse = envoi.then(
    () => undefined,
    () => undefined,
  );
  const courante = Promise.all([derniere, reponse]).then(() => undefined);
  derniere = courante;
  return courante;
}

/** Résout quand toutes les déconnexions lancées ont reçu leur réponse. Ne rejette jamais. */
export function apresDeconnexion(): Promise<void> {
  return derniere;
}

/**
 * LA SESSION LOCALE SE FERME TOUT DE SUITE, LA PROMESSE ATTEND LE SERVEUR.
 * Fermer l'espace de travail seulement à la réponse laisserait, sur un réseau
 * qui pend, les chiffres du dossier à l'écran d'un poste partagé après qu'on
 * a cliqué « Fermer le dossier ». La requête part AVANT la fermeture locale ·
 * elle garde ainsi le jeton CSRF de la session qu'elle ferme.
 */
export function fermerLaSession(poster: () => Promise<unknown>, fermerLocalement: () => void): Promise<void> {
  const attente = deconnecterServeur(poster);
  fermerLocalement();
  return attente;
}
