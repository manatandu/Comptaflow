# Sauvegardes et restauration de la base OmegaX

## Ce qui existe

Chaque nuit à 02:00 UTC (03:00 à Kinshasa), le workflow GitHub Actions
« Sauvegarde de la base (éprouvée par restauration) »
(`.github/workflows/sauvegarde-base.yml`) :

1. exporte la base Neon avec `pg_dump` (format custom, chaîne DIRECTE sans
   `-pooler` · `pg_dump` tient une session longue, incompatible avec le
   pooling en mode transaction) ;
2. **restaure l'export dans un Postgres 18 jetable** monté pour l'occasion ;
3. vérifie la base restaurée : au moins 20 tables, au moins un dossier et
   un utilisateur, et la balance globale (somme des débits = somme des
   crédits sur `lignes_ecriture`) équilibrée au centime ;
4. **chiffre** le fichier avec `age`, éprouve le chiffré (voir plus bas),
   efface l'original en clair, puis archive
   `sauvegarde-omegax-AAAA-MM-JJ-HHMM.dump.age` en artefact GitHub
   (90 jours de rétention) et, si le bucket est configuré (voir plus bas),
   en copie durable sur Cloud Storage.

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

## Le chiffrement (obligatoire · à faire UNE fois)

Jusqu'au 2 septembre 2026, l'export partait en artefact GitHub **en
clair**, conservé 90 jours. Toute personne ayant l'accès en lecture aux
Actions du dépôt pouvait donc télécharger la comptabilité complète de tous
les cabinets clients. C'est corrigé : le fichier est chiffré avant de
quitter le job.

Le chiffrement est **asymétrique**. La CI ne détient que la clé PUBLIQUE ·
elle peut chiffrer, jamais déchiffrer. Un dépôt compromis, un secret
GitHub qui fuit, un artefact téléchargé par erreur : rien de tout cela ne
donne accès aux données.

### Générer la paire de clés (sur VOTRE poste, pas dans la CI)

Installer `age` (https://github.com/FiloSottile/age · `brew install age`,
`sudo apt install age`, ou le binaire Windows), puis :

    age-keygen -o cle-sauvegardes-omegax.txt

La commande affiche la clé **publique** (`age1...`) et écrit le fichier
complet, qui contient la clé **privée**.

**Le fichier `cle-sauvegardes-omegax.txt` est la seule chose au monde qui
ouvre les sauvegardes.** Le perdre rend TOUTES les sauvegardes chiffrées
définitivement illisibles · aucun recours, c'est le principe. Le ranger
comme on range un acte notarié :

- une copie dans le gestionnaire de mots de passe du cabinet ;
- une copie hors ligne (clé USB au coffre, ou impression papier · le
  fichier fait quelques lignes de texte) ;
- jamais dans le dépôt, jamais dans un courriel, jamais dans un chat.

### Poser la clé publique sur GitHub

Dépôt → Settings → Secrets and variables → Actions → onglet **Variables**
→ New repository variable :

- nom : `CLE_AGE_SAUVEGARDES`
- valeur : la ligne `age1...` affichée par `age-keygen` (la PUBLIQUE)

C'est une variable et non un secret, à dessein : une clé publique n'a pas
à être cachée, et la voir en clair dans les journaux permet de vérifier
qu'on chiffre bien pour la bonne clé.

**Tant que cette variable n'est pas posée, le workflow de sauvegarde
échoue.** Il ne retombe jamais sur un archivage en clair · c'est
délibéré : un échec bruyant vaut mieux qu'une fuite muette.

### Ce que le workflow prouve à chaque nuit

Chiffrer sans jamais déchiffrer serait la même faute que sauvegarder sans
jamais restaurer, d'un cran plus haut. Le job génère donc une paire de
clés **éphémère**, chiffre pour DEUX destinataires (la vôtre et
l'éphémère), déchiffre aussitôt avec l'éphémère et compare l'empreinte
SHA-256 au fichier d'origine. Si l'aller-retour ne rend pas exactement
l'original, le job échoue et rien n'est archivé. La clé éphémère est
détruite (`shred`) avec le reste, elle n'affaiblit rien.

Deux gardes s'y ajoutent : l'en-tête `age-encryption.org` est vérifié sur
le fichier archivé, et le job refuse d'archiver s'il reste le moindre
`.dump` en clair dans son répertoire de travail.

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

Prérequis : un poste avec `postgresql-client` version 18 ou plus (la base
Neon est en PostgreSQL 18), `age`, le fichier `.dump.age` (téléchargé
depuis l'artefact GitHub ou le bucket), **votre fichier de clé privée**, et
la chaîne de connexion DIRECTE de la base cible. **Ne jamais coller la
chaîne de connexion dans un fichier, un commit ou un chat.**

0. **Déchiffrer** :

       age --decrypt --identity cle-sauvegardes-omegax.txt \
         --output sauvegarde-omegax-AAAA-MM-JJ-HHMM.dump \
         sauvegarde-omegax-AAAA-MM-JJ-HHMM.dump.age

   Une fois la restauration finie, effacer le `.dump` en clair
   (`shred -u` sous Linux, suppression sécurisée ailleurs) · il ne doit pas
   survivre sur un poste de travail.

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
- Les fichiers contiennent TOUTES les données clients. Ils sont désormais
  chiffrés au repos (artefact GitHub comme bucket), ce qui déplace le
  risque : ce n'est plus l'accès au dépôt qui donne les données, c'est la
  détention de la clé privée. L'accès aux artefacts et au bucket reste à
  tenir fermé, mais il ne suffit plus à lire quoi que ce soit.
- **La contrepartie, et elle est sérieuse** : la clé privée perdue, les
  sauvegardes chiffrées sont irrécupérables. C'est le prix du chiffrement
  asymétrique, et c'est pourquoi la conservation de la clé est décrite
  plus haut avec autant d'insistance. L'historique de Neon reste, lui,
  accessible sans clé · c'est le filet en cas de perte de la clé, à
  condition de ne pas avoir aussi perdu le projet Neon.
