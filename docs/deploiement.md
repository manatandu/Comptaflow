# Déploiement · Firebase Hosting (client) + Cloud Run (API)

> **Réécrit le 2026-09-28 (audit final F198).** Jusqu'à cette date, les
> sections 1 à 6 de ce document décrivaient la mise en place d'ORIGINE, qui
> n'est plus celle qui tourne · une base Cloud SQL en `europe-west1`, un
> `gcloud run deploy` lancé à la main avec `--set-env-vars`, des migrations
> appliquées « une fois » après le premier déploiement, un client construit
> contre l'adresse Cloud Run, et une API laissée « ouverte à tout domaine »
> tant que `CORS_ORIGIN` manquait. Aucune de ces commandes ne doit plus être
> jouée : elles sont retirées, et la section 4 (« Ce qui a été abandonné »)
> dit ce que chacune ignorait. Le texte d'origine reste dans l'historique git du fichier.
>
> Les sources à jour sont le workflow `.github/workflows/deploy-cloud-run.yml`,
> `docs/connexions-et-plafonds.md` et le § 5 de `CLAUDE.md`. En cas de
> désaccord entre ce document et le workflow, **le workflow prime** · c'est lui
> qui s'exécute.

## 1. L'architecture qui tourne

| Étage | Où | Source |
|---|---|---|
| Client (React, Vite, site statique) | Firebase Hosting, site `oomega`, projet `omega-x-ec07a` | `client/.firebaserc:3-9`, `.github/workflows/firebase-hosting-merge.yml:36` |
| API (NestJS, conteneur) | Cloud Run, service `comptaflow-api`, région `us-east1`, même projet | `.github/workflows/deploy-cloud-run.yml:22-24` |
| Base | Neon, PostgreSQL 18, deux chaînes de connexion (directe et poolée) | `CLAUDE.md` § 2 et § 5, `.github/workflows/sauvegarde-base.yml:53-66` |

Deux fournisseurs, pas trois : Firebase Hosting et Cloud Run vivent dans le
même projet Google Cloud, Neon tient la base.

**L'API EST SERVIE SOUS L'ADRESSE DU SITE** (depuis le 2026-09-26). Firebase
Hosting relaie `oomega.web.app/api/**` vers le service Cloud Run
`comptaflow-api` en `us-east1` (`client/firebase.json:10-14`). Cette règle
précède la réécriture de l'application monopage `**` vers `index.html`
(`client/firebase.json:15-18`) : dans l'autre ordre, toute requête d'API
recevrait la page d'accueil. Le client est construit avec `VITE_API_URL=/api`
(`client/.env.production:18`, fichier versionné), lu par
`client/src/lib/api.ts:6` à travers `client/src/lib/adresse-api.ts:9-12`. Le
serveur retire le préfixe avant le routage (`retirerPrefixeApi`,
`src/bootstrap.ts:22-32`) · un appel direct à l'adresse Cloud Run, sans
préfixe, répond donc aux mêmes routes.

Deux conséquences sont posées ailleurs et ne se défont pas :

- le cookie de session est de PREMIÈRE partie, et il s'appelle `__session`
  parce que Firebase retire tout autre cookie des requêtes relayées
  (`CLAUDE.md` § 8, `src/modules/auth/session.constants.ts:19`) · ne pas le
  renommer ;
- l'adresse du client traverse DEUX relais, Firebase puis Cloud Run
  (`SAUTS_EN_LIGNE`, `src/common/sauts-de-confiance.ts:34`).

## 2. Comment on déploie · par les workflows, jamais à la main

Un push sur `main` déclenche deux chaînes indépendantes (`CLAUDE.md` § 5).

**Serveur · `.github/workflows/deploy-cloud-run.yml`**, sur tout push qui
touche `src/**`, `prisma/**`, le `Dockerfile`, `package.json`,
`package-lock.json` ou le workflow lui-même (l. 8-16). Il se lance aussi
depuis l'onglet Actions (`workflow_dispatch`, l. 7), et passe alors par les
mêmes étapes.

1. Le job `verifier` (l. 35-139) n'a aucun secret. Il type, teste et construit
   le serveur et le client, et fait DÉMARRER le serveur pour de bon contre un
   Postgres jetable, interrogé sur `/health`, en relisant le journal de
   démarrage (l. 84-123). Ce Postgres jetable est une image `postgres:16`
   (l. 46), quand la base de production est en PostgreSQL 18.
2. Le job `migrer-et-deployer` ne part que si le premier est vert
   (`needs: verifier`, l. 141-142). Il applique `prisma migrate deploy` sur la
   chaîne DIRECTE `API_DATABASE_URL` AVANT le déploiement (l. 151-163).
3. Il déploie ensuite par `gcloud run deploy --source .`, avec une instance
   gardée chaude (`--min-instances 1`, `--cpu-boost`), les plafonds
   `--concurrency 80` et `--max-instances 4`, et les variables passées par
   `--env-vars-file` (l. 358-368). Le service reçoit la chaîne POOLÉE
   `API_DATABASE_URL_POOLED`, ou la directe tant que ce secret n'existe pas
   (repli voulu, l. 218) ; une chaîne poolée est
   complétée de `pgbouncer=true` et `connection_limit=10` sans jamais être
   affichée, et sans écraser un paramètre déjà présent (l. 266-290).
4. Il interroge enfin `/health` sur le service déployé (l. 426-436), qui
   répond 503 quand la base n'est pas jointe · un déploiement vert prouve que
   le service répond ET joint sa base.

**Client · `.github/workflows/firebase-hosting-merge.yml`**, sur tout push
sur `main` : typage, tests et construction du client, puis publication sur le
canal `live` (l. 21-37). Une pull request publie un aperçu
(`firebase-hosting-pull-request.yml`).

**Le piège du déploiement.** `--env-vars-file` REMPLACE TOUTES les variables
du service (`CLAUDE.md` § 5, commentaires du workflow l. 224-227 et 340-345).
Une variable posée à la main dans la console Cloud Run est effacée au push
suivant : toute variable passe par le workflow. Un `gcloud run deploy` lancé à
la main, comme l'ancienne section 4 le prescrivait, sauterait en plus le
portillon `verifier` et l'ordre « migrations puis code », et la forme
`--set-env-vars` qu'elle employait a déjà échoué sur une chaîne Postgres
(commentaire du workflow, l. 192-198).

**Après chaque push qui touche `src/**` ou `prisma/**`, relire le résultat du
déploiement** dans Actions (`CLAUDE.md` § 5) · pousser n'est pas déployer.
L'environnement de développement n'atteint pas Cloud Run : l'état du service
ne s'affirme jamais depuis un `curl` local. En continu,
`.github/workflows/surveillance.yml` sonde toutes les quinze minutes le service
en direct, le relais `/api/health` et le site (l. 16, 28-33, 45), et ouvre une
issue « Panne de production » après trois échecs.

Les connexions, les plafonds et la création du secret poolé ont leur propre
document : `docs/connexions-et-plafonds.md`. Les sauvegardes :
`docs/sauvegardes-et-restauration.md`. L'installation sur le poste d'un client
est un autre mode de déploiement : `docs/installation-sur-site.md`.

## 3. CORS · ce que fait réellement le serveur

La règle vit dans `src/bootstrap.ts` (et non dans `main.ts`, qui se borne à
l'appeler, `src/main.ts:21`).

- Les deux adresses du site, `https://oomega.web.app` et
  `https://oomega.firebaseapp.com`, sont admises D'OFFICE (l. 80), qu'il y ait
  ou non `CORS_ORIGIN`.
- `CORS_ORIGIN`, liste séparée par des virgules, s'y AJOUTE (l. 81 et 86-87).
  Le workflow la pose aux deux mêmes adresses
  (`.github/workflows/deploy-cloud-run.yml:221`).
- En production (`NODE_ENV=production`, posé par le `Dockerfile` l. 22),
  l'absence de `CORS_ORIGIN` ne veut JAMAIS dire « tout le monde » : le repli
  est la liste fermée des deux adresses (l. 82-89).
- Seul un serveur hors production ET sans `CORS_ORIGIN`, c'est-à-dire le
  développement local, reflète l'origine appelante (`origin: true`, l. 90 et
  120). L'installation sur site n'en est pas · elle tourne en
  `NODE_ENV=production` (`installation/windows/initialiser.ps1:74`).
- Les identifiants voyagent (`credentials: true`) et la réponse au contrôle
  préalable se met en cache 7 200 secondes (l. 116-123).

Depuis le relais, le site appelle l'API à sa propre origine (`/api`) · la
règle CORS ne joue plus que pour un appel adressé directement à Cloud Run et
pour le développement local.

Le dépôt ne nomme aucun domaine personnalisé : les deux adresses ci-dessus
sont les seules que connaissent `src/bootstrap.ts:80`, le workflow (l. 221) et
la surveillance (`surveillance.yml:32-33`). Rattacher un domaine se fait dans
la console Firebase et ne relève pas de ce document ; tout réglage serveur qui
en découlerait passe par le workflow, jamais par la console Cloud Run.

## 4. Ce qui a été abandonné, et ce qui le remplace

| Ce que le document prescrivait | Ce qui est vrai aujourd'hui | Source |
|---|---|---|
| Créer un projet (`comptaflow-prod` en exemple) et remplir `client/.firebaserc` (ancienne section 1) | Projet `omega-x-ec07a`, fichier renseigné et versionné | `client/.firebaserc:3-4` |
| Rattacher un domaine Google Workspace, puis l'ajouter à `CORS_ORIGIN` (ancienne section 2) | Aucun domaine personnalisé dans le dépôt ; le site est servi sous les deux adresses Firebase | section 3 ci-dessus |
| Base Cloud SQL PostgreSQL 16, `db-f1-micro`, `europe-west1`, connecteur par socket Unix (ancienne section 3) | Neon, PostgreSQL 18, chaîne directe pour les migrations et `pg_dump`, chaîne poolée pour le service | `CLAUDE.md` § 5, `docs/connexions-et-plafonds.md` |
| `gcloud run deploy` à la main, `--set-env-vars`, `--add-cloudsql-instances`, région `europe-west1` (ancienne section 4) | Déploiement par le workflow, `--env-vars-file`, région `us-east1`, aucune connexion Cloud SQL | `deploy-cloud-run.yml:23` et 199-368 |
| `prisma migrate deploy` « une fois », après le premier déploiement | À chaque déploiement, AVANT le code, sur la chaîne directe, après le portillon `verifier` | `deploy-cloud-run.yml:141-163` |
| Construire le client avec l'adresse Cloud Run et `firebase deploy` à la main (ancienne section 5) | `VITE_API_URL=/api` versionné, relais Firebase, publication par le workflow | `client/.env.production:18`, `client/firebase.json:10-14`, `firebase-hosting-merge.yml` |
| CORS ouvert à tout domaine pendant la mise au point, à « boucler » ensuite ; « absent, tout est autorisé » (ancienne section 6) | Fermé en production même sans variable ; ouvert au seul développement local | `src/bootstrap.ts:80-90` |
| CORS réglé dans `main.ts` | Réglé dans `src/bootstrap.ts`, que `main.ts` appelle | `src/main.ts:21` |

## 5. Ce qui a été retenu, et ce qui a été écarté

Consigné le 2026-09-04, parce que le basculement de la base n'était documenté
nulle part · un choix sans source ne se revérifie jamais, et c'est le même
défaut que celui qu'on traque partout ailleurs dans ce dépôt. Les chiffres de
cette section sont ceux de cette date.

**Trois étages, DEUX fournisseurs.** Firebase Hosting et Cloud Run vivent dans
le MÊME projet Google Cloud · l'architecture n'est donc pas éparpillée entre
trois maisons, elle est répartie entre Google, qui sert le client et fait
tourner l'API, et Neon, qui tient la base.

**Le client sur Firebase Hosting.** C'est un site statique de 0,9 Mo, cinquante
fichiers. Firebase le sert bien, depuis un réseau mondial, pour un coût qui
restera négligeable : ce qui se facture là est le volume TRANSFÉRÉ, et un
comptable qui ouvre le logiciel chaque matin télécharge un mégaoctet mis en
cache. Le stockage, lui, ne bougera pas · la taille du client ne dépend pas du
nombre de dossiers ni du nombre d'écritures.

**L'API sur Cloud Run**, et pas sur Firebase Functions. Firebase Hosting ne sert
que des fichiers ; il ne peut pas faire tourner NestJS (depuis le 2026-09-26,
il RELAIE `/api/**` vers Cloud Run, il ne l'exécute pas). Les Functions le
pourraient, mais elles démarrent à froid à chaque appel et rouvrent leur pool
Prisma à chaque fois · c'est exactement ce que `docs/connexions-et-plafonds.md`
apprend à éviter. Cloud Run tient un conteneur, garde son pool, et se borne par
`--max-instances`.

**La base sur Neon, et pas sur Cloud SQL** · c'est le seul basculement de
fournisseur par rapport à l'architecture d'origine (section 4). La raison est
mesurable : **Cloud SQL ne s'endort pas.** Une instance, même minuscule, se
facture en continu. Neon se met en veille après cinq minutes d'inactivité, et
le relevé du 2026-09-04 le montre en clair · 4,58 heures de calcul consommées
en trois jours, soit une base qui dort 94 % du temps. Sur Cloud SQL, ces trois
jours auraient été facturés en entier.

*Réserve du 2026-09-28* · ce relevé précède la surveillance continue
(2026-09-26), qui interroge `/health` toutes les quinze minutes
(`surveillance.yml:16`), et `/health` joint la base (`SELECT 1`,
`src/common/sante.controller.ts:19`). Le taux de 94 % n'est donc plus à
reprendre tel quel : les heures de calcul sont à relever de nouveau dans la
console Neon avant d'en tirer une conclusion.

**Et surtout : PAS Firestore.** C'est le point qui ferme le débat, et il n'est
pas une préférence mais une contrainte de nature. Firestore n'est pas
relationnel · ni jointure, ni intégrité référentielle, ni transaction
multi-tables au sens SQL. Or tout ce dépôt repose là-dessus : l'écriture
équilibrée en partie double, le cloisonnement par `tenantId` vérifié aux deux
bouts, le `RESTRICT` qui interdit de supprimer un compte mouvementé, le refus de
supprimer une écriture qu'un module tient, les migrations Prisma écrites à la
main (`prisma/migrations/`). Un logiciel comptable ne s'accommode pas d'une
base sans transaction.

**Ce qu'il faudra surveiller**, et ce n'est ni Firebase ni le stockage : les
HEURES DE CALCUL de Neon. Voir `docs/capacite-mesuree.md`.

## 6. Ce qui porte le déploiement dans le code

- `Dockerfile` (racine) · construction en deux étapes sur `node:22-slim`,
  `NODE_ENV=production` à l'exécution (l. 22), lancement par
  `node dist/main.js` (l. 36). Le serveur écoute `process.env.PORT`
  (`src/main.ts:22`), que Cloud Run fournit.
- `client/firebase.json` et `client/.firebaserc` · cible `oomega`, relais
  `/api/**` vers Cloud Run, réécriture de l'application monopage, cache long
  sur les ressources versionnées et les polices, en-têtes de sécurité.
- `src/bootstrap.ts` · retrait du préfixe `/api`, en-têtes défensifs, nombre de
  relais de confiance (l. 57), CORS (section 3).
- `client/.env.production`, `client/src/lib/api.ts` et
  `client/src/lib/adresse-api.ts` · l'adresse de l'API du site publié (`/api`) ;
  le paquet sur site construit avec `meme-origine`
  (`.github/workflows/paquet-sur-site.yml:62`).
