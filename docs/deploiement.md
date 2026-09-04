# Déploiement · Firebase Hosting (client) + Cloud Run (API)

Architecture retenue : le client React/Vite est un site **statique**, il va sur
**Firebase Hosting**. L'API NestJS a besoin d'un serveur qui tourne en continu
et d'une base PostgreSQL · Firebase Hosting seul ne le permet pas · elle va
sur **Cloud Run** (conteneur, le `Dockerfile` à la racine du dépôt la prépare)
avec une base **Cloud SQL PostgreSQL**. Les deux services sont dans le même
projet Google Cloud que le projet Firebase (Firebase Hosting/Functions/Cloud
Run partagent le même projet GCP).

## Ce qui a été retenu, et ce qui a été écarté

Consigné le 2026-09-04, parce que le basculement de la base n'était documenté
nulle part · un choix sans source ne se revérifie jamais, et c'est le même
défaut que celui qu'on traque partout ailleurs dans ce dépôt.

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
que des fichiers ; il ne peut pas faire tourner NestJS. Les Functions le
pourraient, mais elles démarrent à froid à chaque appel et rouvrent leur pool
Prisma à chaque fois · c'est exactement ce que `docs/connexions-et-plafonds.md`
apprend à éviter. Cloud Run tient un conteneur, garde son pool, et se borne par
`--max-instances`.

**La base sur Neon, et pas sur Cloud SQL** · c'est le seul basculement par
rapport à l'architecture d'origine décrite plus haut. La raison est mesurable :
**Cloud SQL ne s'endort pas.** Une instance, même minuscule, se facture en
continu. Neon se met en veille après cinq minutes d'inactivité, et le relevé du
2026-09-04 le montre en clair · 4,58 heures de calcul consommées en trois jours,
soit une base qui dort 94 % du temps. Sur Cloud SQL, ces trois jours auraient
été facturés en entier.

**Et surtout : PAS Firestore.** C'est le point qui ferme le débat, et il n'est
pas une préférence mais une contrainte de nature. Firestore n'est pas
relationnel · ni jointure, ni intégrité référentielle, ni transaction
multi-tables au sens SQL. Or tout ce dépôt repose là-dessus : l'écriture
équilibrée en partie double, le cloisonnement par `tenantId` vérifié aux deux
bouts, le `RESTRICT` qui interdit de supprimer un compte mouvementé, le refus de
supprimer une écriture qu'un module tient, les cinquante-huit migrations Prisma.
Un logiciel comptable ne s'accommode pas d'une base sans transaction.

**Ce qu'il faudra surveiller**, et ce n'est ni Firebase ni le stockage : les
HEURES DE CALCUL de Neon. Voir `docs/capacite-mesuree.md`.

⚠️ Les étapes ci-dessous demandent une connexion interactive (navigateur,
compte Google) : je ne peux pas les exécuter à votre place depuis cette
session distante. Ce document est le guide pas-à-pas à suivre de votre côté ;
le code (Dockerfile, `firebase.json`, variable `CORS_ORIGIN`) est déjà prêt.

## 1. Créer le projet Firebase / Google Cloud

1. https://console.firebase.google.com/ → **Ajouter un projet**. Notez l'ID du
   projet (ex. `comptaflow-prod`) · il sert partout ensuite.
2. Installer le CLI en local (pas dans cette session) : `npm install -g firebase-tools`
3. `firebase login` · ouvre le navigateur, connectez-vous avec le compte
   Google qui doit administrer le projet.
4. Dans `client/.firebaserc`, remplacer `REMPLACER-PAR-VOTRE-ID-PROJET-FIREBASE`
   par l'ID réel du projet.

## 2. Rattacher un domaine Google Workspace (optionnel)

Si vous voulez servir l'application sur un domaine de votre Google Workspace
(ex. `comptaflow.votre-cabinet.cd`) plutôt que sur `*.web.app` :

1. Console Firebase → **Hosting** → **Ajouter un domaine personnalisé**.
2. Firebase donne des enregistrements DNS (TXT pour la vérification de
   propriété, puis A/AAAA ou CNAME) à ajouter chez le fournisseur DNS de votre
   domaine Workspace (Google Admin Console → **Domaines** si le DNS est géré
   par Google, ou chez votre registrar sinon).
3. La vérification et la propagation DNS prennent de quelques minutes à
   48h. Firebase provisionne le certificat TLS automatiquement une fois le
   domaine vérifié.
4. Une fois le domaine actif, ajoutez-le à `CORS_ORIGIN` côté API (étape 4).

## 3. Base de données · Cloud SQL PostgreSQL

```bash
gcloud sql instances create comptaflow-db \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region=europe-west1
gcloud sql databases create sycebnl_suite --instance=comptaflow-db
gcloud sql users create comptaflow --instance=comptaflow-db --password=<mot-de-passe-fort>
```

Notez la chaîne de connexion (`DATABASE_URL`) · pour Cloud Run avec Cloud SQL,
la forme habituelle est via l'Unix socket du connecteur Cloud SQL :
```
postgresql://comptaflow:<mot-de-passe>@localhost/sycebnl_suite?host=/cloudsql/<PROJET>:<REGION>:comptaflow-db
```

## 4. Déployer l'API sur Cloud Run

Depuis la racine du dépôt (où se trouve le `Dockerfile`) :

```bash
gcloud run deploy comptaflow-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --add-cloudsql-instances=<PROJET>:<REGION>:comptaflow-db \
  --set-env-vars="DATABASE_URL=<chaîne ci-dessus>,JWT_SECRET=<secret fort>,JWT_EXPIRES_IN=8h,CORS_ORIGIN=https://<PROJET>.web.app,https://<PROJET>.firebaseapp.com"
```

Après le premier déploiement, appliquer les migrations Prisma une fois
(depuis une machine qui peut atteindre la base, ou via `gcloud run jobs` /
Cloud SQL Auth Proxy) :

```bash
npx prisma migrate deploy
```

Notez l'URL du service Cloud Run affichée en sortie (ex.
`https://comptaflow-api-xxxxx-ew.a.run.app`) · c'est `VITE_API_URL` de l'étape
suivante.

## 5. Construire et déployer le client sur Firebase Hosting

```bash
cd client
echo "VITE_API_URL=https://comptaflow-api-xxxxx-ew.a.run.app" > .env.production
npm run build
firebase deploy --only hosting
```

Le rewrite SPA (`client/firebase.json`) redirige toute route inconnue vers
`index.html` · nécessaire pour `HashRouter`/`BrowserRouter` côté client
(cette app utilise `HashRouter`, donc les routes `#/...` fonctionnent même
sans ce rewrite ; il reste utile pour un futur passage à un routeur
sans hash).

## 6. Boucler CORS

Une fois l'URL Hosting connue (et le domaine Workspace, s'il est rattaché),
mettre à jour `CORS_ORIGIN` sur Cloud Run pour n'autoriser QUE ces domaines
(étape 4, `--update-env-vars`) plutôt que de laisser l'API ouverte à tout
domaine pendant la mise au point.

## Ce qui est déjà prêt côté code

- `Dockerfile` (racine) · build multi-étage de l'API, écoute sur
  `process.env.PORT` (déjà lu par `main.ts`, compatible Cloud Run tel quel).
- `client/firebase.json` + `client/.firebaserc` · Hosting, réécriture SPA,
  cache long sur les assets versionnés.
- `main.ts` · `CORS_ORIGIN` (liste séparée par virgules) restreint les
  origines autorisées en production ; absent, tout est autorisé (dev).
- `client/src/lib/api.ts` lit déjà `VITE_API_URL` · aucun changement de code
  requis côté client au-delà du `.env.production`.
