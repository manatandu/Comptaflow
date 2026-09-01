# Sauvegardes et restauration de la base OmegaX

## Ce qui existe

Chaque nuit à 02:00 UTC (03:00 à Kinshasa), le workflow GitHub Actions
« Sauvegarde de la base (éprouvée par restauration) »
(`.github/workflows/sauvegarde-base.yml`) :

1. exporte la base Neon avec `pg_dump` (format custom, chaîne DIRECTE sans
   `-pooler` · `pg_dump` tient une session longue, incompatible avec le
   pooling en mode transaction) ;
2. **restaure l'export dans un Postgres 17 jetable** monté pour l'occasion ;
3. vérifie la base restaurée : au moins 20 tables, au moins un dossier et
   un utilisateur, et la balance globale (somme des débits = somme des
   crédits sur `lignes_ecriture`) équilibrée au centime ;
4. archive le fichier `sauvegarde-omegax-AAAA-MM-JJ-HHMM.dump` en artefact
   GitHub (90 jours de rétention) et, si le bucket est configuré (voir plus
   bas), en copie durable sur Cloud Storage.

Une exécution ROUGE signifie qu'une des étapes a échoué : export
impossible, fichier qui ne se restaure pas, ou données incohérentes. C'est
le contraire d'une alarme à ignorer · une sauvegarde qui ne se restaure pas
n'existe pas.

Le workflow se lance aussi à la main : onglet Actions → « Sauvegarde de la
base (éprouvée par restauration) » → Run workflow. À faire avant toute
opération risquée (migration lourde, ménage de données).

Neon conserve par ailleurs son propre historique (restauration à un instant
donné, selon le plan souscrit) · les exports ci-dessus sont la ceinture ET
les bretelles : un fichier autonome, hors de Neon, restaurable n'importe où.

## Copie durable sur Cloud Storage (recommandée · une fois)

L'artefact GitHub expire après 90 jours. Pour la conservation longue :

1. Créer le bucket (une fois, depuis Cloud Shell ou un poste avec gcloud) :

       gcloud storage buckets create gs://omega-x-ec07a-sauvegardes \
         --project omega-x-ec07a --location europe-west1 \
         --uniform-bucket-level-access

2. Donner au compte de service du déploiement (celui de `GCP_SA_KEY`) le
   droit d'y écrire :

       gcloud storage buckets add-iam-policy-binding gs://omega-x-ec07a-sauvegardes \
         --member "serviceAccount:ADRESSE_DU_COMPTE_DE_SERVICE" \
         --role roles/storage.objectCreator

3. Sur GitHub : dépôt → Settings → Secrets and variables → Actions → onglet
   **Variables** → New repository variable :
   nom `BUCKET_SAUVEGARDES`, valeur `omega-x-ec07a-sauvegardes`.

4. Facultatif mais sage : une règle de cycle de vie sur le bucket (par
   exemple, suppression après 365 jours) pour borner le coût.

## Restaurer (procédure d'urgence)

Prérequis : un poste avec `postgresql-client` version 17 ou plus, le
fichier `.dump` (téléchargé depuis l'artefact GitHub ou le bucket), et la
chaîne de connexion DIRECTE de la base cible. **Ne jamais coller la chaîne
de connexion dans un fichier, un commit ou un chat.**

1. **Ne restaurez jamais par-dessus la base vivante.** Créez d'abord une
   base neuve (dans Neon : Databases → New database, par exemple
   `sycebnl_suite_restauration`) ou une branche Neon.

2. Restaurer :

       pg_restore "CHAINE_DIRECTE_VERS_LA_BASE_NEUVE" \
         --no-owner --no-privileges \
         sauvegarde-omegax-AAAA-MM-JJ-HHMM.dump

3. Vérifier, comme le fait le workflow :

       psql "CHAINE..." -c "SELECT count(*) FROM tenants"
       psql "CHAINE..." -c "SELECT abs(sum(debit) - sum(credit)) FROM lignes_ecriture"

   Le second résultat doit être 0 (ou < 0.01).

4. Basculer l'application : mettre à jour le secret GitHub
   `API_DATABASE_URL` (et l'équivalent local si besoin) vers la base
   restaurée, puis relancer le workflow « Déployer le serveur sur Cloud
   Run » (Actions → Re-run). La bascule est un simple changement de chaîne ·
   aucune modification de code.

5. Une fois la situation stabilisée, décider du sort de l'ancienne base
   (conservation pour analyse, puis suppression).

## Ce que ça garantit, et ce que ça ne garantit pas

- **RPO** (perte maximale de données) : jusqu'à 24 h avec les seuls exports
  quotidiens · l'historique Neon ramène ce risque à quelques minutes tant
  que l'incident n'est pas la perte du projet Neon lui-même. Les exports
  couvrent précisément ce dernier cas.
- **RTO** (durée de remise en service) : le temps d'un `pg_restore` et d'un
  redéploiement · de l'ordre de l'heure, pas de la journée.
- Les fichiers `.dump` contiennent TOUTES les données clients · l'accès aux
  artefacts (membres du dépôt) et au bucket doit rester aussi fermé que la
  base elle-même.
