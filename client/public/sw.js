/*
 * SERVICE WORKER D'OMEGAX · le strict minimum, et c'est délibéré.
 *
 * Il existe pour UNE raison : sans service worker enregistré, aucun navigateur
 * ne propose l'installation de l'application. C'est le prérequis de tous les
 * magasins, et il n'y en a pas d'autre ici.
 *
 * IL NE MET RIEN EN CACHE. Un logiciel de comptabilité qui servirait une
 * balance périmée depuis un cache est pire qu'un logiciel hors ligne : le
 * comptable ne peut pas voir que le chiffre est vieux, et il l'imprime. Aucune
 * réponse de l'API n'est donc interceptée · toute requête passe au réseau,
 * exactement comme sans service worker.
 *
 * LE COQUILLAGE DE L'APPLICATION lui-même n'est pas mis en cache non plus,
 * alors que ce serait techniquement sans danger. Le motif est la mise à jour :
 * un cache d'application mal invalidé fige une version dans le navigateur du
 * client, et la seule façon d'en sortir est de lui demander de vider ses
 * données de site. Tant qu'aucun besoin réel de mode hors ligne n'est exprimé,
 * ce risque ne se prend pas.
 *
 * `skipWaiting` et `clients.claim` sont là pour la même raison : une nouvelle
 * version prend la main immédiatement, sans attendre la fermeture de tous les
 * onglets.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  // Purge de tout cache qu'une version antérieure aurait pu laisser · le jour
  // où un cache est ajouté puis retiré, ce nettoyage est ce qui évite qu'il
  // survive indéfiniment dans le navigateur des clients déjà installés.
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim()),
  );
});
