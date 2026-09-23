# Temps de chargement · mesures du 2026-09-23

Demande de Manasse : réduire le temps de chargement de toutes les pages.

## Ce qui était déjà en place, et qu'on n'a pas touché

- **Chaque fenêtre est chargée à la demande** (`lazy()` dans
  `registre-fenetres.tsx`) : le fichier principal fait 99 Ko compressés, les
  fenêtres de 3 à 15 Ko.
- **Les fichiers du client sont mis en cache un an** (`immutable`, noms
  hachés), `index.html` jamais.
- **Les réponses de l'API sont compressées** (`compression`, `bootstrap.ts`).
- **Les états financiers sont agrégés par la base** (`capacite-mesuree.md`).

Rien de tout cela n'était le goulot.

## Le goulot · la distance, multipliée

Le site (Firebase) et l'API (Cloud Run, **us-east1**) sont deux origines, et
l'utilisateur est à Kinshasa. Chaque aller-retour coûte l'ordre de 250 à
300 ms. Deux choses le multipliaient.

**1. Presque chaque appel en coûtait DEUX.** Le client envoyait
`Content-Type: application/json` et `X-CSRF-Token` sur TOUTES les requêtes,
lectures comprises. Or une requête qui les porte n'est plus « simple » pour le
navigateur : il envoie d'abord une requête `OPTIONS` et attend sa réponse. Et
le serveur ne disait pas combien de temps garder cette réponse : Chrome la
garde alors **cinq secondes**. Sur un GET, les deux en-têtes ne servaient à
rien · pas de corps, et le serveur ne contrôle le jeton CSRF que sur les
méthodes qui modifient (`METHODES_MUTANTES`, `jwt.strategy.ts`).

**2. Le démarrage enchaînait trois vagues.** `/auth/me`, puis `/exercices`
(le contexte d'exercice n'était monté qu'après la session), puis les données
du tableau de bord.

## Ce qui a changé

| Changement | Fichier | Effet |
|---|---|---|
| Un GET ne porte plus ni `Content-Type` ni `X-CSRF-Token` | `client/src/lib/entetes-requete.ts` | plus de requête `OPTIONS` avant une lecture |
| `maxAge: 7200` dans la configuration CORS | `src/bootstrap.ts` | le contrôle d'une écriture est gardé deux heures, au lieu de cinq secondes |
| `/exercices` part en même temps que `/auth/me` | `client/src/lib/prechargement.ts` | une vague de moins au démarrage |
| Le code du tableau de bord est demandé dès le chargement | `client/src/main.tsx` | il arrive pendant les deux premiers appels |
| Les deux lectures de la fenêtre Devises partent ensemble | `DevisesPage.tsx` | une vague de moins |

**Ce qui n'a PAS été relâché.** La liste des origines autorisées est la même, et
une origine étrangère ne reçoit toujours aucune autorisation (vérifié sur le
vrai serveur). Les écritures portent toujours leur jeton CSRF. Le cache de
`maxAge` porte sur la réponse au contrôle préalable, pas sur des données.

## La mesure

Vrai serveur compilé, base PostgreSQL locale, client construit servi sur une
autre origine que l'API (comme en production), Chromium piloté par Playwright,
**300 ms d'aller-retour simulés**, comptable connecté ouvrant l'application.

| | Avant | Après |
|---|---|---|
| Appels à l'API | 10, dont **5 `OPTIONS`** | **5**, dont **0 `OPTIONS`** |
| Vagues successives | 3 | **2** |
| Dernière réponse de l'API | 990 ms | **691 ms** |

**Le gain réel est plus grand que ce tableau.** Le simulateur de Chrome retarde
les requêtes mais ne retarde pas les requêtes `OPTIONS` : dans la mesure « avant »,
elles partent au même instant que la requête qu'elles précèdent. Sur un vrai
réseau, la requête attend la réponse au contrôle, soit un aller-retour de plus
par vague. L'estimation, qui n'a pas été mesurée, est de l'ordre de six
allers-retours avant contre deux après, soit environ 1,8 s contre 0,6 s au
démarrage depuis Kinshasa.

**Chaque fenêtre ouverte ensuite** gagne un aller-retour par vague de lecture,
puisque ses GET ne sont plus précédés d'un contrôle.

## Ce qui reste, et qui ne se règle pas dans le code

- **La distance elle-même.** Un aller-retour vers us-east1 reste un
  aller-retour. Un hébergement en RDC ou plus proche (voir
  `hebergement-en-rdc.md`) le diviserait, et c'est aussi ce que demande
  l'art. 201 du Code du numérique.
- **La région de la base Neon n'est pas connue d'ici.** Si elle n'est pas
  voisine de us-east1, chaque requête SQL ajoute une traversée. À lire dans la
  console Neon.
- **La production n'a pas pu être mesurée depuis cet environnement** : le
  proxy bloque les sorties réseau. La mesure ci-dessus est locale.
