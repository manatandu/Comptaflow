# Déploiement · Firebase Hosting (client) + Cloud Run (API)

Architecture retenue : le client React/Vite est un site **statique**, il va sur
**Firebase Hosting**. L'API NestJS a besoin d'un serveur qui tourne en continu
et d'une base PostgreSQL · Firebase Hosting seul ne le permet pas · elle va
sur **Cloud Run** (conteneur, le `Dockerfile` à la racine du dépôt la prépare)
avec une base **Cloud SQL PostgreSQL**. Les deux services sont dans le même
projet Google Cloud que le projet Firebase (Firebase Hosting/Functions/Cloud
Run partagent le même projet GCP).

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
