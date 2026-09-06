# Volumétrie multi-dossiers · mesures du 6 septembre 2026

Tâche #108. Elle était en attente de trois lectures que seul Manasse peut
fournir. Ce document contient tout ce qui pouvait être MESURÉ sans elles, et il
a trouvé en route un défaut de capacité plus urgent que la question posée.

## Le banc

PostgreSQL 16 local, base neuve, toutes les migrations appliquées, dix dossiers
semés par le chemin réel du logiciel (les tables et colonnes du schéma, pas un
modèle simplifié). Les mesures mémoire sont prises avec
`--max-old-space-size=460`, soit **le tas d'un conteneur Cloud Run à 512 Mio**,
celui de la production, comme dans `capacite-mesuree.md`.

## Ce que coûte un dossier, avant toute écriture

| | |
|---|---|
| Plan de comptes SYCEBNL | 1 136 comptes |
| Plan de comptes SYSCOHADA | 1 441 comptes |
| Table `comptes`, 10 dossiers | 4,8 Mo (2,3 Mo de données, 2,4 Mo d'index) |
| **Coût fixe par dossier** | **496 Ko** |

À 500 dossiers, le plan semé pèse 250 Mo. **Ce n'était pas le sujet**, et la
question posée dans #108 sur « le coût du plan semé » peut être close : il est
négligeable devant le reste.

## Ce que coûte le journal d'audit

100 000 événements d'audit écrits avec un contenu réaliste (la tête d'une
écriture, avant et après) :

| | |
|---|---|
| Table `evenements_audit` | 153 Mo (112 Mo de données, 41 Mo d'index) |
| **Par événement, en base** | **1 601 octets** |
| dont JSON avant/après | 730 octets |
| dont index | 428 octets |
| **Par événement, en mémoire** | **3 864 octets** |

**Le journal pèse plus lourd que la comptabilité qu'il trace.** Une écriture
coûte environ 1 Ko (`capacite-mesuree.md`) ; les deux événements qu'elle
engendre, création puis validation, en coûtent 3,2.

Décomposition des index, par événement :

| Index | Coût | Utilisé en lecture |
|---|---|---|
| `(tenantId, entite, entiteId)` | 148 o | oui, filtre du journal |
| `empreinte` UNIQUE global | 123 o | **aucune lecture ne cherche par empreinte** |
| clé primaire `id` | 81 o | oui |
| `(tenantId, rang)` UNIQUE | 68 o | oui, la chaîne |
| `(tenantId, horodatage)` | 8 o | oui, filtre de dates |

## Le défaut trouvé en chemin, et il passe devant

`JournalAuditService.verifier()` chargeait **la chaîne entière en mémoire**.
C'est la fonction qui prouve l'intégrité du journal, celle qu'un auditeur
demande.

| Événements | Tas consommé | Résultat |
|---|---|---|
| 100 000 | 369 Mio sur 460 | 8,9 s, tient de justesse |
| 160 000 | · | **processus mort, OOM** |

Un dossier ordinaire produit environ **40 000 événements par exercice** (20 000
écritures, création et validation). **La vérification cessait donc de répondre
vers le quatrième exercice**, c'est-à-dire précisément quand un auditeur
commence à avoir de l'historique à contrôler.

Même famille que le grand livre complet et le journal à 45 jours, déjà
documentés : § 8 bis, aucune route ne rend une collection sans borne. La règle
n'avait pas été appliquée à une lecture INTERNE.

**Corrigé** · la chaîne se vérifie séquentiellement, elle n'a jamais eu besoin
de tout voir à la fois. Lecture par lots de 5 000, seul l'état de la boucle
traverse les lots.

| Après correction | |
|---|---|
| 160 000 événements | **54 Mio de tas**, 11,4 s |

Soit **sept fois moins de mémoire pour 60 % d'événements en plus**.

### Deux défauts de ma propre correction, trouvés avant de la garder

**La boucle pouvait ne jamais finir.** Sa sortie dépendait entièrement du fait
que la couche de données honore le curseur. Le faux Prisma des tests rendait le
même lot à chaque appel : les tests ne rendaient plus la main. Un service qui
boucle sans fin est pire qu'un service qui tombe · il ne journalise rien et
occupe une instance jusqu'au délai de garde. Une garde de progression du rang
ferme le cas.

**Le faux des tests ne testait plus le vrai.** Il ignorait `where` et `take`,
donc il validait un service qui n'existe pas. Il honore désormais le curseur.

Les deux tests de non-régression ont été éprouvés en réintroduisant les défauts.

## Projection à dix ans (AUDCIF art. 24)

Sur la base mesurée, pour un dossier de 20 000 écritures par exercice :

| | Comptabilité | Journal d'audit | Total |
|---|---|---|---|
| par dossier-exercice | 20 Mo | 64 Mo | 84 Mo |
| 1 dossier, 10 ans | 200 Mo | 640 Mo | 840 Mo |
| 50 dossiers, 10 ans | 10 Go | 32 Go | **42 Go** |
| 200 dossiers, 10 ans | 40 Go | 128 Go | **168 Go** |
| 500 dossiers, 10 ans | 100 Go | 320 Go | **420 Go** |

**Le journal d'audit représente les trois quarts du volume.** C'est lui, et lui
seul, qui décide du plan Neon à souscrire.

## La décision qui reste, et pourquoi elle n'est pas prise ici

Le journal est **chaîné par empreinte** : chaque événement porte celle du
précédent. Supprimer les événements 1 à N casse la vérification pour tout ce qui
suit · le maillon N+1 pointerait vers un prédécesseur absent, et la fonction
`verifier()` rendrait `RANG_MANQUANT` à jamais.

**Une purge simple est donc exclue.** Trois voies existent, et le choix
n'appartient pas au logiciel :

1. **Tout garder.** Le plus sûr, et désormais tenable en lecture puisque la
   vérification ne charge plus tout. Coût : le tableau ci-dessus.
2. **Archiver avec ancrage.** Les événements d'un exercice clos sortent vers un
   fichier signé, et un enregistrement d'ANCRAGE reste en base : période
   couverte, nombre d'événements, première et dernière empreinte. La chaîne
   reste vérifiable de bout en bout (ancre puis suite), l'archive permet de
   reconstituer le détail. Coût de développement réel ; gain de l'ordre de 70 %
   du volume.
3. **Réduire le contenu.** Le JSON avant/après pèse 730 octets sur 1 601. Ne
   garder que les champs MODIFIÉS plutôt que l'objet entier diviserait ce poste.
   Mais cela change ce que le journal PROUVE, et ce n'est pas une décision
   technique.

L'index unique global sur `empreinte` (123 octets par événement, soit 8 % du
total) n'est exploité par aucune lecture. Le retirer se décide séparément : il
garantit aujourd'hui, par construction, qu'aucune empreinte ne se répète, ce qui
est un filet même s'il n'est jamais interrogé.

## Ce qui manque pour trancher

Trois lectures, et elles ne sont pas dans le logiciel :

1. **le stockage consommé et le plan actuel** dans la console Neon ;
2. **le nombre de dossiers visés à douze mois**, cellules de groupe comprises ;
3. **la décision sur la rétention** · voie 1, 2 ou 3 ci-dessus.

Le tableau de projection permet de répondre à la deuxième sans attendre : c'est
le nombre de dossiers qui décide, et le seuil du plan Neon souscrit qui dit
lequel des trois est nécessaire.
