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
| Base, configuration, licence, sauvegardes, journaux | `C:\ProgramData\OmegaX`, fermé aux utilisateurs du poste (système et administrateurs seulement) |
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
6. Créer le premier dossier depuis l'écran d'ouverture. C'est le **dossier
   d'installation** · l'écran d'ouverture ne propose la création qu'au poste
   sans dossier, et le serveur refuse ensuite l'inscription. Son
   administrateur crée les autres utilisateurs (fenêtre Utilisateurs) et, si
   la licence en couvre plusieurs, les dossiers suivants (fenêtre
   Restitution, « Créer un dossier sur cette installation »). Les
   sauvegardes lui sont réservées · une copie est la base de TOUS les
   dossiers du poste, et l'administrateur d'un autre dossier n'a aucun droit
   sur celles de ses voisins.

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
allumé, dans `C:\ProgramData\OmegaX\sauvegardes` (30 copies gardées,
`omegax-AAAAMMJJ-HHMMSS.dump`). Une copie part aussi avant chaque mise à jour,
avant les migrations (`omegax-AAAAMMJJ-HHMMSS-avant-mise-a-jour-<version>.dump`,
la version étant celle dont la base avait la forme, donc celle qu'il faudrait
réinstaller pour la relire). Les deux séries sont listées dans Restitution,
et chacune garde son propre nombre de copies · 5 pour les copies avant mise à
jour (`SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER` dans `omegax.env` pour en
changer), la copie d'une mise à jour dont la migration n'a jamais abouti
n'étant jamais retirée, ni sur le poste ni hors du poste.

Une copie s'écrit d'abord sous un nom provisoire (`….partiel`), qui n'est ni
listé ni recopié, et ne prend son nom qu'une fois complète · une coupure de
courant pendant la copie ne laisse rien qui passe pour une copie faite. Une
copie avant mise à jour n'est JAMAIS réécrite · si la migration échoue, le
service redémarre, reprend la copie faite avant le premier essai (celle de la
base saine) et retente la migration, sans recopier une base à moitié migrée.

Le dossier `C:\ProgramData\OmegaX` entier n'est lisible que par le système et
les administrateurs du poste · une copie est la base de TOUS les dossiers, en
clair, et le réglage de la copie externe porte la clé qui relit les copies
chiffrées. L'initialisation pose cette restriction à chaque installation et à
chaque mise à jour. Lire un journal ou une copie demande donc une session
administrateur du poste (l'Explorateur le propose à l'ouverture du dossier).
Un dossier de sauvegardes déplacé hors de
`C:\ProgramData\OmegaX` (variable `DOSSIER_SAUVEGARDES`) ne la reçoit pas ·
elle est alors à poser à la main.

Ces copies sont SUR LE MÊME DISQUE · une panne de disque emporterait tout. D'où la
**copie hors du poste** : dans Restitution, l'administrateur du dossier
d'installation désigne un dossier sur un disque USB ou un partage réseau et
choisit une **phrase de chiffrement** (douze caractères au moins), et chaque
sauvegarde y est recopiée CHIFFRÉE (`omegax-AAAAMMJJ-HHMMSS.dump.chiffre`,
même nombre de copies gardées, par série). La copie avant mise à jour, écrite
avant que le serveur ne démarre, part au démarrage suivant, comme toute copie
la plus récente que le dossier externe n'a pas encore reçue (disque
débranché lors de la copie du jour). La phrase n'est rangée nulle part en clair ·
c'est elle seule qui relira la copie si le disque du poste lâche, et perdue,
la copie externe est illisible. Les copies en clair qu'une version
antérieure avait déposées dans ce dossier en sont retirées. L'écran alerte
tant qu'aucune copie externe n'existe, qu'elle a échoué ou qu'elle est en
retard.

Remettre en clair une copie externe (sur le poste réinstallé) · la phrase est
demandée au clavier :

```bat
"C:\Program Files\OmegaX\node\node.exe" "C:\Program Files\OmegaX\serveur\dechiffrer-sauvegarde.cjs" E:\SauvegardesOmegaX\omegax-AAAAMMJJ-HHMMSS.dump.chiffre
```

Le fichier `.dump` obtenu se restaure comme une copie locale.

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
fin de maintenance de la licence, et c'est vérifié AVANT la copie et les
migrations · une version non couverte s'arrête sans avoir touché à la base.
Le service ne démarre pas, et le motif est dans son journal
(`C:\ProgramData\OmegaX\journaux`). Deux sorties, la base étant restée à la
forme de la version précédente :

1. renouveler la maintenance · VMG émet la licence, qui se dépose À LA MAIN
   dans `C:\ProgramData\OmegaX\licence.omegax` (l'écran d'ouverture n'est pas
   joignable tant que le service est arrêté). Le service la lit au démarrage
   suivant · `net start OmegaX` s'il n'a pas déjà redémarré de lui-même ;
2. réinstaller la version précédente, que la licence couvre.

Une exception, et le journal la nomme · l'arrêt qui survient sur la REPRISE
d'une migration qui avait échoué (un correctif publié après la fin de
maintenance, installé par-dessus une mise à jour cassée). La base n'est alors
PAS à la forme de la version précédente · l'essai l'a laissée dans l'état où
il s'est interrompu, et le message nomme la copie faite avant lui, seule image
saine. Réinstaller la version dont la migration avait échoué, ou une autre
version plus récente que la licence couvre, retente la migration sur la base
telle qu'elle est, cette copie restant celle de référence ; revenir à la
version précédente demande de restaurer la copie, avec VMG (voir plus bas).

Ce contrôle ne bloque jamais un poste sans licence lisible · un poste neuf doit
créer sa base et démarrer, puisque c'est l'écran d'ouverture qui montre
l'empreinte et reçoit la licence, et sans licence valide aucun dossier n'a pu
y être créé.

Si la migration échoue, le service redémarre et la retente, sans refaire la
copie · celle d'avant le premier essai reste la copie de référence (§ 5). Pour revenir en arrière · arrêter le service, restaurer la copie avant
mise à jour nommée dans le journal du service, et réinstaller la version que
son nom porte, avec VMG.

## 7. Désinstaller

Panneau de configuration, « OmegaX ». Les services et la règle de pare-feu
sont retirés ; `C:\ProgramData\OmegaX` est CONSERVÉ (base, licence,
sauvegardes). Le supprimer à la main seulement après avoir sorti une copie.
