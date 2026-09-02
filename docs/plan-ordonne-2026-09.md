# Plan ordonné · septembre 2026

Établi le 2026-09-02, au terme de trois balayages menés en parallèle et
recoupés : l'audit OHADA du chemin SYSCOHADA (200 constats, contradiction en
deux lentilles), l'inventaire de ce qui reste à construire (86 items, chacun
vérifié en ouvrant le code et non en croyant les documents), et la recherche
sur les normes de sécurité et les magasins d'applications (47 affirmations
tenues sur 97, les 50 autres réfutées à leur source).

Ce document ne remplace pas `plan-de-construction.md`, qui reste la référence
d'architecture, ni `plan-sycebnl-complet.md`, qui reste le détail du SYCEBNL.
Il dit dans quel ORDRE attaquer ce qu'ils décrivent, et pourquoi.

---

## Où on en est

Terminé et déployé au 2026-09-02 : le SYSCOHADA niveau 2 de bout en bout
(bilan, compte de résultat, TFT, 36 notes, Système minimal, neuf routes
d'export dont la liasse complète, trois écrans, écran « en construction »
supprimé), le chrome à 360 px, et les neuf constats BLOQUANTS de l'audit.

Restent ouverts, tous les trois documentés plus bas : les constats MAJEURS et
MINEURS de l'audit, l'arriéré de construction, et l'écart de sécurité.

## L'écart avec l'ordre décidé, dit franchement

`plan-de-construction.md` §8.2 enregistre une décision explicite du
propriétaire : tout `plan-sycebnl-complet.md` d'abord, puis les deux modules
du §8.3, « ensuite seulement » le SYSCOHADA. **L'ordre n'a pas été tenu.** Le
SYSCOHADA niveau 2 a été construit alors que restaient ouverts D1, D2, D7,
A8-1, B21, D3, la saisie des 216 rubriques de notes, et les deux modules du
§8.3.

Et le §8.2 justifiait cet ordre par l'avantage concurrentiel : « aucun
logiciel observé ne va jusqu'aux opérations spécifiques EBNL ni au moteur de
contrôles du référentiel ». C'est exactement ce qui n'est pas construit.
L'écart porte donc sur le différenciateur lui-même.

Le plan ci-dessous y revient en phase D, après ce qui fausse les comptes et ce
que la loi exige. Revenir au §8.2 immédiatement laisserait en production des
défauts qui s'aggravent à chaque clôture.

---

## Phase A · Ce qui fausse les comptes aujourd'hui

Priorité absolue, parce que c'est le seul groupe où NE RIEN FAIRE dégrade la
donnée. Modèle et effort : **Opus 5, `xhigh`** en boucle principale · chaque
correction touche un compte, donc la règle §1 de CLAUDE.md impose de relire la
source avant d'écrire, et la convention de routage (`plan-sycebnl-complet.md`)
interdit d'y descendre en modèle tant que le motif n'est pas établi.

**A1 · Terminer l'audit.** 77 constats sur 200 restent à juger par les deux
lentilles ; 34 MAJEURS et 36 MINEURS sont déjà retenus. Puis appliquer, chacun
avec le test qui l'aurait attrapé.

**A2 · Affectation du résultat.** `exercice.service.ts` dit lui-même que le
résultat reporté « continue à s'accumuler d'exercice en exercice » sur 131 et
139 : aucun module, aucune route, aucun compte 11/12/106 dans le service.
Après deux exercices, la ventilation des fonds propres du bilan est fausse.

**A3 · Les trois défauts silencieux du même voisinage.** Le rattrapage
d'amortissement ignoré par `calculerDotation()` (un bien repris après coup
reste sous-amorti sans un mot) · l'absence de verrou anti-double-liquidation
de TVA, dont le bouton est reposable sans marqueur de période ·
`prorataDefinitif()` écrit, testé, et appelé par personne.

**A4 · Inscription hors transaction.** `auth.service.ts` : un semis interrompu
laisse un dossier sans plan de comptes.

## Phase B · Ce que la loi et un auditeur exigent

Modèle et effort : **Opus 5, `high`** · motif établi, périmètre technique.

**B1 · Journal d'audit général.** FAIT le 2026-09-02. Sur quarante-deux
modèles Prisma, aucun ne disait qui avait modifié quoi ni quand · seul
`createdBy` disait qui avait créé. C'est la première chose qu'un réviseur
demande, et l'AUDCIF art. 22, 6° en fait une obligation : « l'organisation
garantisse toutes les possibilités de contrôle en permettant la reconstitution
du chemin de révision ».

Le journal est posé sur le CLIENT PRISMA par une extension, pas par des appels
dans les services · un journal qu'on peut oublier d'appeler serait oublié le
jour où l'on ajoute un service. L'acteur circule par un `AsyncLocalStorage`
alimenté par un intercepteur global (et non un middleware, qui court avant les
gardes et ne verrait jamais qui agit).

Chaque événement porte l'empreinte du précédent, chaîne par dossier · c'est la
réponse au 5° du même article, « toute transcription indélébile entraînant une
modification irréversible du support ». Une table Postgres n'est pas indélébile ;
ce qu'on garantit, c'est que la retouche SE VOIE. La vérification distingue
trois ruptures : ligne supprimée, ligne insérée, contenu retouché.

Deux limites énoncées plutôt que masquées : la chaîne détecte la falsification
d'un maillon, pas l'absence d'un maillon jamais écrit (si l'écriture du journal
échoue, l'opération métier passe quand même · une écriture comptable en double
vaut pire qu'un trou dans le journal) ; et les lignes engendrées en masse
(`LigneEcriture`, dotations, ventilations) sont hors périmètre, la tête portant
l'information.


**B2 · Cloisonnement multi-locataire garanti structurellement.** FAIT le
2026-09-02. Le balayage préalable a porté sur les 361 appels Prisma des 33
modèles qui portent un `tenantId` · AUCUNE fuite trouvée, le code est
discipliné de bout en bout, les 72 appels sans borne explicite portant tous
leur contrôle de propriété juste avant. Ce que B2 change n'est donc pas une
faille : c'est la NATURE de la garantie, qui passe de « quelqu'un y a pensé »
à « le moteur refuse ».

Extension Prisma à trois règles, choisies pour ne rien coûter sur les chemins
chauds. LECTURE d'une ligne · le résultat est vérifié APRÈS coup, la ligne
étant déjà en main, et une ligne d'un autre dossier est rendue INEXISTANTE
plutôt qu'en erreur (une erreur distincte apprendrait que l'identifiant existe
ailleurs). ÉCRITURE d'une ligne désignée par identifiant · relecture avant, la
seule règle qui coûte une requête, sur un chemin qui n'est pas chaud.
COLLECTION · le filtre doit porter la borne, sans quoi la requête est refusée.

La garde ne RÉÉCRIT jamais une requête, elle la refuse · réécrire masquerait
le défaut au lieu de le montrer, et le cloisonnement resterait aux deux bouts
(CLAUDE.md §6) sans que personne ne sache lequel tient.

Neuf collections bornées par un parent vérifié plutôt que par le dossier ont
reçu leur borne explicite · sans changement de résultat, le parent étant déjà
contrôlé. Quatre sorties légitimes déclarées par `horsCloisonnement('raison',
...)` : connexion et inscription (recherche par courriel, avant de savoir de
quel dossier relève le compte), promotion des opérateurs au démarrage, mot de
passe temporaire du dossier créé depuis la console, et de la cellule ouverte
par le siège. Le module groupe n'en a pas eu besoin : il portait déjà son
`tenantId` partout.

Deux tests, parce qu'un seul ne suffisait pas : la garde elle-même (règle par
règle), et un BALAYAGE DU CODE. Les tests du dépôt montent des clients Prisma
factices, qui ne passent pas par l'extension · une requête non bornée ne
serait donc découverte qu'en production, sur le dossier d'un client. Le
balayage la refuse à l'écriture. Il gèle aussi la liste des fichiers qui
sortent du cloisonnement : une sortie ajoutée ailleurs fait tomber le test,
elle doit se discuter et non se glisser.


**B3 · Une CI qui lance les tests avant de déployer.** FAIT le 2026-09-02. Le
déploiement serveur passe par un job « verifier » (typage, tests, build, des
deux côtés) dont il dépend par `needs`. L'ordre importait plus qu'il n'y
paraissait : le job appliquait `prisma migrate deploy` AVANT de déployer, donc
un push cassé migrait la production puis déployait le code cassé par-dessus ·
une migration appliquée ne se reprend pas d'un `git revert`. Le portillon ne
porte NI la chaîne de connexion NI la clé de compte de service, sans quoi il
serait une seconde porte d'entrée plutôt qu'un contrôle.

Défaut voisin trouvé au passage : le déploiement du client ne faisait que
`npm run build` · or `vite build` ne vérifie pas les types et ne lance aucun
test. Typage et tests ajoutés avant la construction. Dependabot posé sur les
trois écosystèmes (serveur, client, actions GitHub). Nuance de coût vérifiée :
CodeQL sur dépôt privé suppose GitHub Advanced Security, qui est payant ·
Dependabot ne l'est pas.

**B4 · Sauvegardes chiffrées.** FAIT le 2026-09-02 pour la partie sauvegarde.
L'export partait en artefact GitHub EN CLAIR pour 90 jours · quiconque avait
l'accès en lecture aux Actions du dépôt téléchargeait la comptabilité complète
de tous les cabinets. Le fichier est désormais chiffré par `age` avant de
quitter le job, en ASYMÉTRIQUE : la CI ne détient que la clé publique, jamais
de quoi déchiffrer. Le job chiffre pour deux destinataires (l'exploitant et
une clé éphémère créée sur place), déchiffre aussitôt avec l'éphémère et
compare l'empreinte SHA-256 à l'original · chiffrer sans jamais déchiffrer
serait la faute de la sauvegarde jamais restaurée, d'un cran plus haut. Sans
clé publique configurée le workflow ÉCHOUE, il ne retombe jamais sur du clair.

RESTE À FAIRE, et c'est une ACTION DE MANASSE, pas de code : générer la paire
de clés et poser `CLE_AGE_SAUVEGARDES` en variable de dépôt (procédure dans
`docs/sauvegardes-et-restauration.md`). Tant qu'elle n'est pas posée, la
sauvegarde nocturne est rouge · c'est voulu, mais cela veut dire qu'il n'y a
pas de sauvegarde nouvelle pendant ce temps.

Restent aussi, non traités : le passage des secrets Cloud Run par Secret
Manager, et le remplacement de la clé de compte de service JSON permanente
(`GCP_SA_KEY`) par une fédération d'identité.

**B5 · Cycle de vie des accès.** FAIT le 2026-09-02. Quatre manques, dont le
plus sérieux n'était pas celui que ce plan citait en premier.

`doitChangerMotDePasse` n'était appliqué QUE PAR L'ÉCRAN. Le client imposait
bien la page de changement avant l'espace de travail, mais le serveur ne
refusait rien : un appel direct à l'API travaillait normalement, et le tiers
qui avait remis le mot de passe n'avait qu'à ne pas ouvrir le navigateur.
C'est le « masquer sans refuser » que CLAUDE.md §4 interdit, et il vivait là
depuis la phase 1a. Une garde GLOBALE le ferme désormais, avec trois sorties
marquées (se voir, changer son mot de passe, fermer ses sessions) et un test
qui fige cette liste à trois.

RÉVOCATION DE SESSION · un jeton vit jusqu'à huit heures. Changer un mot de
passe volé, réinitialiser un compte ou rétrograder un rôle ne prenait donc
effet qu'à l'expiration, c'est-à-dire pas pendant la seule période où cela
comptait. Un instant `sessionsInvalidesAvant` suffit, sans table de sessions
ni purge : la comparaison se fait sur l'`iat` que le JWT porte déjà. Piège de
précision réglé au passage · `iat` est en secondes et la révocation en
millisecondes, si bien qu'une comparaison naïve éjectait le titulaire par son
propre changement de mot de passe.

VERROUILLAGE PAR COMPTE · le limiteur global est par adresse IP, il ne voit
pas une attaque distribuée contre un seul compte. Le verrou est TEMPORAIRE et
croissant (1, 5, 15, 30, 60 minutes), jamais définitif : l'adresse d'un
comptable figure sur ses courriels, et un verrou définitif se retournerait en
refus de service. Il se vérifie avant bcrypt, sans quoi le verrou lui-même
deviendrait le levier d'un épuisement du processeur.

RÉINITIALISATION PAR L'ADMINISTRATEUR · un oubli de mot de passe se réglait
jusqu'ici par un UPDATE SQL en production. La route pose un mot de passe
provisoire, ferme les sessions du compte et lève le verrou, et le geste est
inscrit au journal d'audit de B1 (mot de passe masqué).

CHAÎNE DE RECOURS, trouvée en répondant à une question de l'exploitant sur les
courriels de confirmation : elle s'arrêtait trop tôt. Un comptable est
réinitialisé par SON administrateur, mais l'ADMINISTRATEUR qui oublie le sien
n'avait personne au-dessus · on retombait sur l'UPDATE SQL, remonté d'un cran.
La console de l'opérateur porte désormais ce dernier recours, borné aux seuls
comptes ADMIN_CABINET · sans cette borne elle deviendrait un passe-partout sur
tous les comptes de tous les cabinets.

PAS DE COURRIEL, et c'est un choix · aucun envoi dans OmegaX, aucune
dépendance à un fournisseur d'envoi, aucun lien « mot de passe oublié ». Un
tel lien déplacerait la sécurité du logiciel vers la boîte mail : qui tient la
boîte tiendrait la comptabilité. Le mot de passe provisoire se remet en main
propre, par le canal que l'administrateur juge sûr.


**B6 · Livre d'inventaire, rapport de gestion, contrôles par référentiel.**
FAIT le 2026-09-02, avec une rectification du plan lui-même.

RECTIFICATION · le troisième point (« `controles.service.ts` ne lit jamais
`tenant.referentiel` ») était PÉRIMÉ quand ce plan a été relu : le service lit
bien le référentiel et la forme juridique, et `regles-auditeur.ts` porte les
quatre règles lues à leur source (SYCEBNL art. 19, AUSCGIE art. 702, 376 et
853-13, 289-1). Le plan était en retard sur le code.

LIVRE D'INVENTAIRE · la fenêtre était fermée au SYSCOHADA. Non parce que
l'AUDCIF n'exige rien, mais parce qu'elle était montée sur les seuls articles
du SYCEBNL. L'AUDCIF art. 19 transcrit « le Bilan, le Compte de résultat et le
Tableau des flux de trésorerie de chaque exercice, ainsi que le résumé de
l'opération d'inventaire ».

Une LECTURE y est écrite pour pouvoir être discutée : l'article 19 nomme le
tableau des flux sans prévoir d'exception, mais le jeu du Système minimal de
trésorerie n'en comporte pas, reposant sur une comptabilité de trésorerie
(art. 13, Titre X). Un tableau des flux dressé là-dessus n'aurait rien à
expliquer. La lacune est celle du texte, qui n'a pas articulé son art. 19 avec
son art. 13 · elle est signalée, jamais comblée en silence.

RAPPORT DE GESTION · trois textes, jamais transposés l'un sur l'autre. SYCEBNL
art. 16-3 (rapport d'activité, quatre sections), AUSCGIE art. 138 (rapport de
gestion, six), AUSCOOP art. 108 (six autres). Les écarts sont réels et vont
dans les DEUX sens : l'AUSCOOP ne demande PAS les événements postérieurs à la
clôture que les deux autres exigent, et demande EN PLUS l'état de promotion
des coopérateurs, qui n'a aucun équivalent en société commerciale. Servir
l'article 138 à une coopérative lui inventerait une exigence et lui en
cacherait une autre.

Deux formes sans règle lue, déclarées telles : le GIE, à qui l'AUSCGIE ne
donne pas de rapport de gestion mais renvoie au contrat constitutif (« le
contrôle de la gestion et le contrôle des états financiers de synthèse sont
exercés dans les conditions prévues par le contrat ») ; le commerçant personne
physique et l'entreprenant, que l'article 138 ne nomme pas (il vise « le
gérant, le conseil d'administration ou l'administrateur général »). Le livre
d'inventaire, lui, leur reste dû : l'AUDCIF s'applique à raison de l'activité,
pas de la forme juridique.

Trouvé par le spec du lexique en cours de route : la fenêtre servait la
définition SYCEBNL du livre d'inventaire à un dossier SYSCOHADA. L'aiguillage
du lexique existait, l'entrée manquait.


## Phase C · Rendre le SYCEBNL aussi vérifié que le SYSCOHADA

Modèle et effort : **Opus 5, `xhigh`** pour les tables, `high` pour les specs.

Le SYCEBNL est celui qui est en production chez les clients, et c'est lui qui
a le moins de garde-fous. Trois tables de correspondance n'ont AUCUN spec
dédié : `correspondance-tft.ts` (599 lignes), `correspondance-smt.ts` (480) et
`correspondance-projet-emplois-ressources.ts` (402), soit 1 481 lignes de
correspondance poste/comptes vérifiées par rien d'autre que les tests de
moteur, qui attrapent une table cassée mais pas un compte faux dans un poste.

### Rectification du 2026-09-02 · le constat « quatre orphelins » était faux

Une version antérieure de ce plan annonçait quatre comptes semés que le
SYCEBNL ne capterait nulle part, présentés comme un défaut de nos tables.
Confrontation faite aux tableaux de correspondance officiels (Partie 4, ch. 2
et 3) et aux fiches de comptes (Partie 2, ch. 3) : le constat était faux sur
le premier et mal attribué sur les trois autres.

| Compte | Ce que disait le plan | Ce que dit le texte |
|---|---|---|
| 46 | manque au bilan des associations | réservé aux PROJETS (fiche COMPTE 46), et rattaché au poste DF du bilan projets · notre table le porte. Son absence du jeu associations est correcte |
| 68 | manque au compte d'exploitation projets | exact, mais c'est le TABLEAU OFFICIEL qui ne le cite pas · déjà documenté en anomalie n° 4, non comblé à dessein |
| 706, 708 | manquent au poste RD | RD officiel = « 707, 72, 73 (+/-), 75, 77, 78 ». Six subdivisions du 70 sont sans poste, pas deux · documenté en anomalie n° 5 |
| 499, 599 | DI porte à la place le compte 20 | le texte officiel écrit bien « DI · 20 », très probablement une corruption de scan · anomalie déjà documentée et transcrite telle quelle |

Aucune de ces lacunes n'est comblée, et c'est la bonne décision : les
rattacher d'office inventerait un poste que le référentiel ne donne pas
(CLAUDE.md §1). Le mécanisme qui les rend visibles existe déjà ·
`comptesNonRattaches`, calculé à l'exécution et rendu à l'écran comme dans
l'export. Ce qui manquait était la GARDE : `lacunes-texte-officiel-sycebnl.spec.ts`
nomme chacune, vérifie qu'elle reste non rattachée et qu'elle est signalée sur
place, pour qu'un futur « nettoyage des orphelins » ne fasse pas disparaître
dans un poste voisin un montant que le référentiel ne sait pas classer.

S'y ajoute le recoupement note ↔ poste de bilan, jamais passé sur les 71 notes
SYCEBNL · c'est lui qui, côté SYSCOHADA, a trouvé le compte 478 présent dans
une note sans être dans le poste qu'elle documente.

## Phase D · Le différenciateur, retour au §8.2

Modèle et effort : **Opus 5, `xhigh`** pour le dépouillement du référentiel,
`high` pour la construction.

**D1 · Dossier de révision par compte.** Les 76 blocs « Éléments de contrôle »
de la Partie 2 ch. 3 du SYCEBNL, un par compte divisionnaire, à transcrire
puis à transformer en dossier de révision : à la clôture, pour chaque compte
mouvementé, la liste des pièces que le texte attend, cochables, avec pièce
jointe. Rien n'existe aujourd'hui.

**D2 · Avertissements d'imputation à la saisie.** Les 70 blocs « Exclusions »,
qui disent ce qu'un compte NE DOIT PAS enregistrer et donnent le compte
correct. `ecriture.service.ts` (1 473 lignes) ne connaît aucune notion
d'avertissement, seulement des refus.

**D3 · Ce qui complète le bloc.** Le dossier de révision par cycle (aucun
regroupement de comptes par cycle n'existe) · D7 non-compensation (principe
cité dans six commentaires, contrôle inexistant) · A8-1 (le filtre §1.4 est
appliqué aux notes mais pas aux états, donc la liasse éditée sort avec ses
postes à zéro).

C'est le chantier que le plan désigne lui-même comme le différenciateur
principal, et c'est du dépouillement mécanique : prévisible, sans surprise de
conception.

## Phase E · Rendre la liasse éditable

Modèle et effort : **Opus 5, `high`**.

216 rubriques portent `saisie: true` dans les tables de correspondance (96
associations, 26 projets, 94 SYSCOHADA) et **rien ne les stocke**. Les notes
1, 2, 3, 4, 5G, 5H, 29B, 33, 34 et 35 sortent avec leurs tableaux officiels
vides, remplissables seulement dans Excel après export.

Trois sous-cas sont de simples branchements dont le motif d'ajournement est
périmé : la note 33 attend un TFT qui existe, la note 2 du jeu projets attend
trois tableaux qui existent, la note 35 attend une brique budgétaire livrée.

S'y ajoute le choix de politique B6/B20 (appel ou encaissement des
cotisations), aujourd'hui une simple chaîne descriptive sans setter ni champ
sur `Tenant`, alors qu'il commande les écritures ET une mention obligatoire en
notes.

## Phase F · Les deux modules du §8.3, et le fiscal

Modèle et effort : **Opus 5, `xhigh`** pour la conception du modèle de
données, `high` pour la construction.

**F1 · Achats et engagements de dépense.** Aucun modèle, aucun module. Le
consommateur déclare lui-même le trou :
`etats-financiers-projet-budget.service.ts` porte un champ
`engagementsHorsComptabilite` en dur, et la colonne Engagement du tableau
officiel est structurellement incomplète · seul état livré qui s'auto-déclare
partiel.

**F2 · Dossier de subvention.** `Bailleur` n'a que six champs : ni montant
accordé, ni tranches, ni conditions, ni rapports dus. `planning-cloture.ts`
demande pourtant de vérifier la validité de l'accord-cadre, sur une donnée que
rien ne détient.

**F3 · Automatisation des réintégrations fiscales.** Traitement fiscal par
compte, pour que le tableau de passage se remplisse seul au lieu d'être saisi
ligne à ligne.

## Phase G · Crédibilité commerciale

Modèle et effort : **Opus 5, `high`**, sauf la rédaction juridique qui ne
relève pas du logiciel.

**G1 · Les trois prérequis communs à tous les magasins**, à faire parce que
chacun a de la valeur SANS aucun magasin : une PWA installable (manifeste,
icônes, service worker) · une politique de confidentialité publiée, nommant
Neon, Google Cloud Run us-east1 et Firebase Hosting · un tenant de
démonstration permanent, avec des écritures fictives et un mot de passe stable.

Piège vérifié à traiter avec la PWA : `client/firebase.json` ignore `**/.*`,
donc un futur `.well-known` ne serait jamais déployé, et la réécriture `**`
vers `index.html` renverrait du HTML avec un code 200.

**G2 · Export de restitution complète du dossier**, en plus des classeurs par
état. C'est la clause que tout acheteur institutionnel lit avant le prix.

**G3 · Double regard paramétrable par dossier** · aujourd'hui `valider` ne
compare jamais le validateur à l'auteur.

**G4 · Conformité EBNL** · `attestationExemptionIs` est une chaîne nue sans
date ni échéance, alors que c'est la pièce fiscale la plus structurante d'une
ASBL depuis l'arrêté 007/2025, et que le module exonérations tient un vrai
compte à rebours juste à côté. S'y ajoutent le mandat de l'auditeur (D3),
l'accord-cadre Ministère du Plan, la checklist de constitution E2, et
l'échéancier fiscal qui n'atteint jamais le tableau de bord.

## Phase H · Confort et restitution

Modèle et effort : **Opus 5, `high`** · frontend et wiring, motif établi.

Sélecteur d'exercice global (aujourd'hui le premier OUVERT est imposé, quatre
écrans seulement s'en affranchissent) · comparatif au-delà de N-1, alors qu'un
bailleur finance sur trois ans · budget contre réel à la maille des rubriques
et non des seules sections analytiques · palmarès des comptes et analyse des
journaux · pré-lettrage · exclusion de relance par tiers · taux de TVA par
défaut dans la grille de saisie · longueur de compte réellement paramétrable ·
export XLSX en flux au-delà de 50 000 lignes.

## Phase I · Au-delà

Gestion commerciale et ventes-clients (le §8.4 la désigne comme la porte
d'entrée SYSCOHADA) · stocks (les états SMT et compte de résultat déjà écrits
attendent des variations qu'aucune source ne produit) · paie · OHADA vers IFRS
· consolidation · RBAC fin.

Avertissement du §3.6 à ne pas perdre : le multi-classification se pose à la
CONCEPTION. `Compte`, `Journal` et `Immobilisation` sont tous
mono-classification, et la migration renchérit chaque mois.

---

## Décisions qui n'appartiennent pas au logiciel

Aucun développement ne les débloque.

- **Licence PERPETUEL_ONPREMISE** · vendable dans la console alors que
  `LICENCE_CHECK_URL` n'est lue par aucun `ConfigService` et que
  `enregistrerHeartbeat()` n'a aucun appelant. Un dossier vendu ainsi serait
  coupé à la première requête. À ne pas proposer avant vérification.
- **Variable `BUCKET_SAUVEGARDES`** · sans elle, la sauvegarde n'a que 90
  jours de rétention et le job reste vert. Trois gestes dans le compte Google.
- **Limitation de débit** · `ThrottlerModule.forRoot` sans `storage` : le
  compteur est par conteneur, donc deux instances Cloud Run doublent le
  plafond réel. Redis, ou plafond d'instances assumé.
- **Code du numérique congolais** · déclaration des traitements, autorisation
  de transfert hors RDC, notification des violations. Le corpus lu est un OCR
  non collationné, le numéro apparaît sous deux formes selon les sources : à
  faire qualifier par un juriste congolais avant tout usage.
- **Formulaire de déclaration DGI** · l'impôt est calculé, l'imprimé se
  remplit à la main faute d'en détenir le modèle.
- **Forfait micro-entreprise** · la circulaire de change n'est pas connue, la
  branche renvoie `null`.
- **Tenue en devise étrangère** · le logiciel laisse ouvrir un dossier en USD
  sans un mot sur l'art. 141 de la loi 23/053. À trancher avec un praticien.
- **Module groupe en SYSCOHADA** · le refus est désormais posé aux deux portes
  (2026-09-02). Les moteurs nécessaires existent : ce n'est plus technique,
  c'est un arbitrage.
- **Mécénat 4571 contre 475** · les deux comptes sont semés, le catalogue
  n'utilise que le 475. Arbitrage de doctrine, ouvert depuis l'audit d'août.
- **Article 22 de l'AUDCIF** · le texte prévoit qu'une opération tombant dans
  une période close soit enregistrée au premier jour de la période ouverte
  avec mention distincte de sa date de valeur, alors qu'`exercice.service.ts`
  la rejette purement et simplement. À la lecture faite, c'est un écart de
  conception, pas un renforcement · à confirmer avec un professionnel.

## Ce qu'il ne faut PAS faire

Établi à partir des sources officielles lues le 2026-09-02.

- **Une coque WebView soumise à l'App Store.** La règle 4.2 des App Store
  Review Guidelines exige qu'une application dépasse un site web réemballé.
  Rejet quasi certain, non contournable par un ajustement. Et les canaux
  privés (Custom Apps, Unlisted App Distribution) passent QUAND MÊME par App
  Review : ils règlent la confidentialité de la distribution, pas la 4.2.
- **L'Apple Developer Enterprise Program**, qui exige cent salariés et
  interdit expressément la distribution à des clients.
- **Une certification ISO 27001 ou SOC 2 spontanée.** Ce sont des
  certifications d'ORGANISATION, délivrées par un tiers accrédité sur des
  politiques et des preuves, pas sur du code. Chantiers de douze à
  vingt-quatre mois avec budget récurrent. À n'engager que si un client
  l'écrit dans un cahier des charges.
- **Un certificat de signature de code**, inutile sur la voie MSIX : le
  Microsoft Store resigne lui-même le paquet.
- **Un compte Microsoft « Individual » pour essayer** · le passage vers
  Company est impossible ensuite.
- **Promettre une « conformité au Top 10 OWASP »** · l'expression n'a pas de
  sens, c'est un document de sensibilisation, et l'édition 2021 est marquée
  SUPERSEDED depuis la sortie de l'édition 2025.

## Points restés sans réponse vérifiable

À rouvrir depuis un poste sans mandataire réseau : les règles de Google Play
(suppression de compte, formulaire Sécurité des données, fonctionnalités
financières) n'ont pu être lues par personne · l'éligibilité de la RDC au
compte développeur Windows n'est pas établie · l'obtention d'un D-U-N-S pour
une entité congolaise n'a pas pu être vérifiée · l'état d'installation de
l'autorité congolaise de protection des données ne repose que sur des extraits
de moteur de recherche · le chiffrement au repos chez Neon n'est documenté
nulle part dans le dépôt · la position de l'ONEC sur les outils informatiques
est inconnue, son site étant bloqué.
