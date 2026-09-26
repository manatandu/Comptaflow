# Installation sur site (Windows)

Décidé par Manasse le 2026-09-26 : une licence en FICHIER SIGNÉ, vérifiée sans
internet, et un PC Windows du client comme serveur. Ce document est la fiche
de VMG pour préparer, poser et entretenir une installation.

## 1. Ce que reçoit le client

Un seul fichier, `OmegaX-installation-<date>-<commit>.exe`, produit par le
workflow **Paquet sur site (Windows)** (onglet Actions, « Run workflow »,
artefact à télécharger en fin de run). Il contient tout, rien ne se télécharge
chez le client :

| Élément | Où sur le poste |
|---|---|
| Programme (Node, serveur, interface, PostgreSQL, WinSW) | `C:\Program Files\OmegaX` |
| Base, configuration, licence, sauvegardes, journaux | `C:\ProgramData\OmegaX` |
| Service de la base | `OmegaX-PostgreSQL`, port 5433, adresse 127.0.0.1 seulement |
| Service du logiciel | `OmegaX`, port 8080, démarrage automatique |
| Raccourcis | Bureau et menu Démarrer, « OmegaX » |

Le raccourci ouvre OmegaX dans une fenêtre d'application Edge, sans barre
d'adresse · pour l'utilisateur, c'est un logiciel installé. Les autres postes
du bureau ouvrent `http://<nom-du-serveur>:8080` (règle de pare-feu posée sur
les réseaux privé et de domaine, jamais public).

## 2. Une seule fois chez VMG · la paire de clés

La licence est signée par la clé PRIVÉE de VMG, et le logiciel ne porte que la
clé PUBLIQUE. Sans elle, le workflow refuse de construire le paquet.

```bash
openssl genpkey -algorithm ed25519 -out omegax-licences-privee.pem
openssl pkey -in omegax-licences-privee.pem -pubout -out omegax-licences-publique.pem
```

1. Coller le contenu de `omegax-licences-publique.pem` dans
   `src/modules/sur-site/cle-publique-editeur.ts` (constante
   `CLE_PUBLIQUE_EDITEUR`), committer.
2. Ranger la clé PRIVÉE hors du dépôt, en deux exemplaires (coffre de mots de
   passe et support hors ligne). Perdue, plus aucune licence ne peut être
   émise pour les installations existantes ; volée, n'importe qui en émet.
3. Poser la clé privée en secret de dépôt `API_CLE_PRIVEE_LICENCE` (contenu
   entier du fichier `.pem`), jamais dans le code. Le déploiement suivant la
   donne au service, et la console Cabinets clients peut alors émettre.

La console vérifie chaque licence avec la clé publique du code AVANT de
l'enregistrer · une clé privée qui ne correspond pas est refusée, rien n'est
émis. Secours hors console · `node scripts/emettre-licence.cjs` (mode
d'emploi en tête du fichier), le numéro étant alors à reporter à la main.

## 3. Poser une installation

Prérequis du poste serveur · Windows 10 ou 11 64 bits (ou Windows Server),
4 Go de mémoire au moins, un compte administrateur, une adresse IP fixe ou
réservée sur le réseau du bureau, et un onduleur (une coupure pendant une
écriture est le premier risque d'un PC de bureau).

1. Lancer l'`.exe` en administrateur, suivre l'assistant. L'initialisation
   crée la base, un mot de passe et un secret de session tirés au hasard,
   installe les deux services et ouvre le port 8080.
2. En cas d'échec, un message donne le chemin du journal ·
   `C:\ProgramData\OmegaX\installation.log`. C'est ce fichier qu'il faut
   récupérer.
3. Ouvrir OmegaX. L'écran d'ouverture affiche l'**empreinte du poste**
   (64 caractères). La transmettre à VMG.
4. VMG émet la licence depuis la console (Cabinets clients, cadre « Licences
   sur site ») pour cette empreinte · titulaire, nombre de dossiers, fin de
   maintenance, expiration ou perpétuelle. Le fichier `licence-OMX-….omegax`
   se télécharge aussitôt, et reste retéléchargeable depuis la liste.
5. Déposer le fichier depuis l'écran d'ouverture. Il est vérifié sur place,
   puis rangé dans `C:\ProgramData\OmegaX\licence.omegax`.
6. Créer le premier dossier. Son administrateur crée ensuite les autres
   utilisateurs depuis la fenêtre Utilisateurs.

## 4. Ce que la licence contrôle

| Champ | Effet |
|---|---|
| Empreinte | La licence ne vaut que sur CE poste (hachage de son identifiant Windows). Copiée ailleurs avec les données, elle est refusée. |
| Fin de maintenance | Une version publiée après cette date refuse de tourner · le client garde à vie la version qu'il a. |
| Expiration | Vide pour une licence perpétuelle ; une date pour une location ou un essai. |
| Dossiers | Nombre de dossiers que l'installation peut ouvrir. |

L'horloge du poste est surveillée · reculée de plus d'un jour sous la date la
plus tardive déjà vue, la licence est suspendue jusqu'à remise à l'heure.
Changer de PC serveur demande une nouvelle licence pour la nouvelle empreinte.

## 5. Sauvegardes et restauration

Une copie de la base par jour, tentée chaque heure tant que le poste est
allumé, dans `C:\ProgramData\OmegaX\sauvegardes` (30 copies gardées). Une
copie part aussi avant chaque mise à jour, avant les migrations. Ces copies
sont SUR LE MÊME DISQUE · une panne de disque emporterait tout. D'où la
**copie hors du poste** : dans Restitution, l'administrateur désigne un
dossier sur un disque USB ou un partage réseau, et chaque sauvegarde y est
recopiée (même nombre de copies gardées). L'écran alerte tant qu'aucune
copie externe n'existe, qu'elle a échoué ou qu'elle est en retard.

Restaurer une copie (poste serveur, invite de commandes administrateur) :

```bat
net stop OmegaX
set PGPASSWORD=<mot de passe lu dans C:\ProgramData\OmegaX\omegax.env>
"C:\Program Files\OmegaX\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p 5433 -U omegax -d omegax --clean --if-exists --no-owner "C:\ProgramData\OmegaX\sauvegardes\omegax-AAAAMMJJ-HHMMSS.dump"
net start OmegaX
```

## 6. Mettre à jour

Lancer le nouvel `.exe` sur le poste serveur. Il arrête les services,
remplace le programme (jamais les données), puis le service copie la base
avant d'appliquer les migrations. La version majeure de PostgreSQL est gelée
(`PG_MAJEUR_ATTENDU` du workflow) · un paquet qui en changerait est refusé
avant toute copie, la conversion d'une base se faisant avec VMG.

Une mise à jour ne tourne que si sa date de publication est couverte par la
fin de maintenance de la licence.

## 7. Désinstaller

Panneau de configuration, « OmegaX ». Les services et la règle de pare-feu
sont retirés ; `C:\ProgramData\OmegaX` est CONSERVÉ (base, licence,
sauvegardes). Le supprimer à la main seulement après avoir sorti une copie.
