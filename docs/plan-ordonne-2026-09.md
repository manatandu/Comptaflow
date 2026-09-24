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

## LES RESTES, VERROUILLÉS DU MOINS LOURD AU PLUS LOURD (2026-09-24)

Ce qui reste HORS des confrontations, chaque ligne vérifiée contre le dépôt le
jour même (deux lignes de la liste d'origine étaient périmées, voir
« Décisions qui n'appartiennent pas au logiciel »). Les 23 passes restantes
gardent leur propre ordre dans `docs/plan-confrontations.md` et avancent en
parallèle.

LE POIDS est l'effort jusqu'à « fait et vérifié », décision préalable
comprise. Une ligne qui attend un acte de Manasse ou d'un tiers ne démarre pas
sans lui, et c'est sa place dans l'ordre qui dit quand le demander. La
colonne « Qui » dit qui tient la première étape.

| Rang | Reste | Qui | Poids | Ce qui le débloque |
|---|---|---|---|---|
| 1 | ~~Verser aux compétences l'ordonnance n° 23-042 (jours fériés)~~ **FAIT** · vérifié le 2026-09-24, texte intégral au skill `droit-travail-congolais` (`references/ordonnance-23-042-jours-feries.md`, versé le 2026-09-20) | Manasse | · | · |
| 2 | Compléter le fichier de l'arrêté n° 013/2015, coupé à l'art. 7 · **ALLÉGÉ** le 2026-09-24 : la RÈGLE de l'art. 7 est au corpus, résumée dans `fiscalite-rdc/procedures-fiscales/references/16-mesures-execution-reclamations-recours.md` (« n'est susceptible d'aucune voie de recours »). Ne manque que le texte VERBATIM de la fin, utile pour une citation, plus bloquant pour coder | Manasse | minutes | La fin de l'article 7 et la suite, recopiées du texte officiel |
| 3 | ~~Poser la variable `BUCKET_SAUVEGARDES`~~ **FAIT le 2026-09-24** · bucket `omega-x-ec07a-sauvegardes` (europe-west1, accès uniforme), `github-deploy` en Créateur d'objets Storage, variable posée. Prouvé par le run n° 28 : les étapes « S'authentifier » et « Copier vers Cloud Storage » sont VERTES, et non plus ignorées | Manasse | · | · |
| 4 | ~~Mécénat au 4571 ou au 475~~ **FAIT le 2026-09-24** · Manasse a tranché pour le 475, le 4751 du texte étant lu comme sa subdivision. Le modèle portait en réalité le 4571, et le TFT cherchait la créance au 475 : une convention non soldée sortait du TFT. Aligné, et un test lie désormais le modèle au poste FC | Manasse, puis code | · | · |
| 5 | ~~Limitation de débit par conteneur~~ **TRANCHÉ le 2026-09-24 · assumé**, sans Redis. Le verrouillage par compte, en base, tient la force brute. Écrit dans `docs/connexions-et-plafonds.md` § 7, à revoir si `--max-instances` monte | Manasse | · | · |
| 6 | Sous-compte 388 « stocks provenant d'immobilisations mises hors service » | Code | ½ jour | Lecture des deux fiches du compte 38 et de la sortie d'immobilisation |
| 7 | Rubrique « stocks en cours de route » absente de la Note 8 | Code | ½ jour | Lecture de la Note 8 ; trancher si l'on signale le trou ou si l'on s'abstient |
| 8 | Mode « forfait 30 % » de l'IRPP, facultatif | Manasse, puis code | 1 jour | Décider de l'offrir malgré l'absence de base légale ; il serait déclaré comme tel à l'écran |
| 9 | Article 22 de l'AUDCIF · opération tombant dans une période close | Professionnel, puis code | 1 à 2 jours | Confirmation d'un praticien ; ensuite, enregistrement au premier jour ouvert avec date de valeur distincte |
| 10 | Formulaire de déclaration DGI | Manasse, puis code | 2 jours | Le modèle officiel de l'imprimé |
| 11 | Salaires en dollars | Source, puis code | 2 à 3 jours | Le texte qui fixe le cours de conversion pour l'IRPP |
| 12 | Module Groupe ouvert au SYSCOHADA | Manasse, puis code | 3 à 5 jours | L'arbitrage ; les moteurs existent |
| 13 | Droits d'accès plus fins que trois rôles | Code | 1 semaine | Définir les rôles voulus ; chaque route porte déjà `@Roles` |
| 14 | Consolidation SYSCOHADA (AUDCIF Titres XII et XIII) | Code | 2 semaines | La passe R4, prochaine du plan de confrontations |
| 15 | États IFRS en sus du jeu légal (AUDCIF art. 73-1) | Code | 2 à 3 semaines | Tables à côté du grand livre, jamais dedans (`docs/decision-multi-classification.md`) |
| 16 | Installation sur site | Manasse, puis code | 3 semaines et plus | Décider de la vendre ; émetteur du heartbeat, paquet, mises à jour |
| 17 | Hébergement en RDC (Code du numérique, art. 201) | Juriste, puis infrastructure | mois | Qualification par un juriste congolais, puis un hébergeur en RDC (`docs/hebergement-en-rdc.md`) |
| 18 | Homologation d'OmegaX comme SFE (décret n° 23/10, art. 20 à 23) | Manasse et DGI | mois | L'arrêté de l'art. 23, absent du corpus ; la démarche est auprès de la DGI. Conditionne la VENTE en RDC |

Les deux dernières lignes sont les plus lourdes ET les plus bloquantes, et elles sont
nommées ici · la 18 conditionne la vente du logiciel, et la 17 son hébergement
actuel. Leur place en queue dit leur DURÉE, pas leur urgence · la démarche de
la 18 peut être engagée auprès de la DGI dès aujourd'hui, en parallèle de tout
le reste.

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

CORRIGÉ LE 2026-09-23 · CE PARAGRAPHE DISAIT LE CONTRAIRE DU VRAI. Il portait
« RESTE À FAIRE, et c'est une ACTION DE MANASSE : générer la paire de clés et
poser `CLE_AGE_SAUVEGARDES` en variable de dépôt ». C'EST FAIT, et depuis le
2026-09-02 · le commentaire du workflow le datait lui-même (« Vécu le
2026-09-02, première pose de la clé ») et Manasse s'en souvenait. La preuve ne
se lit ni ici ni dans ce commentaire, mais dans les runs : l'étape « Exiger la
clé publique de chiffrement » sort en erreur si la variable est absente ou mal
formée, donc un run vert la suppose posée ET conforme (`age1` suivi de 58
caractères). Les VINGT-SIX runs de `sauvegarde-base.yml` sont verts, le
vingt-sixième le 2026-09-23 à 07:05:09, étape 7 comprise, suivie du chiffrement
éprouvé par déchiffrement et du contrôle qu'aucun fichier en clair ne subsiste.

D'OÙ LA RÈGLE, et c'est la SEPTIÈME « lacune déclarée à tort » · **UNE LIGNE DE
PLAN QUI DÉCRIT UNE ACTION D'UN TIERS NE SE RECOPIE PAS, ELLE SE VÉRIFIE CONTRE
CE QUE CETTE ACTION AURAIT CHANGÉ.** Ici, ce que la pose de la clé change est
observable d'une seule requête : le workflow passe du rouge au vert. Redemander
la clé sans regarder les runs, c'est exactement ce qui avait fait redemander
trois fois l'arrêté INPP sans regarder le corpus.

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

**Le mandat de l'auditeur (D3) est livré le 2026-09-12** · modèle
`MandatAuditeur`, règle `dureeMandat` (trois durées selon le texte et l'organe),
contrôles `AUDITEUR_OBLIGATOIRE_SANS_MANDAT`, `MANDAT_AUDITEUR_PROROGE` et
`MANDAT_AUDITEUR_SANS_PROROGATION`. Restent l'accord-cadre Ministère du Plan, la
checklist de constitution E2 et l'échéancier fiscal au tableau de bord.

**L'échéancier fiscal atteint le tableau de bord le 2026-09-12** · panneau
« Prochaines échéances », règle `echeancesAVenir` (horizon en jours, retard
constaté en tête, et la distinction déclaration / reversement). **L'accord-cadre Ministère du Plan est livré le 2026-09-12** · modèle
`AccordCadrePlan` portant les QUATRE conditions de l'art. 37, règle
`conditions-ong-etrangere.ts`, contrôles `ACCORD_CADRE_PLAN_ABSENT`,
`ACCORD_CADRE_PLAN_ECHU` et `MAIN_OEUVRE_LOCALE_SOUS_SEUIL`. Le manque que
`exemption-is-ebnl.ts` déclarait lui-même est refermé.

**La checklist de constitution E2 est livrée le 2026-09-12** ·
`catalogue-constitution.ts` porte les trois étapes et leurs pièces, chacune avec
son FONDEMENT (loi, pratique administrative, usage sans base légale en vigueur).
Aucune table nouvelle : le service confronte le parcours à ce que le dossier
détient déjà.

**G4 est close.** Les cinq items sont livrés et déployés : attestation
d'exemption d'IS, mandat de l'auditeur, accord-cadre Ministère du Plan,
échéancier fiscal au tableau de bord, checklist de constitution.

## Phase H · Confort et restitution

Modèle et effort : **Opus 5, `high`** · frontend et wiring, motif établi.

Sélecteur d'exercice global (aujourd'hui le premier OUVERT est imposé, quatre
écrans seulement s'en affranchissent) · comparatif au-delà de N-1, alors qu'un
bailleur finance sur trois ans · budget contre réel à la maille des rubriques
et non des seules sections analytiques · palmarès des comptes et analyse des
journaux · pré-lettrage · exclusion de relance par tiers · taux de TVA par
défaut dans la grille de saisie · longueur de compte réellement paramétrable ·
export XLSX en flux au-delà de 50 000 lignes.

**Phase H close le 2026-09-12.** Les neuf items sont livrés et déployés. Le
« comparatif au-delà de N-1 » l'était depuis `f5ff0a7` (`evolutionSoldes`, huit
exercices) · la relecture des deux textes l'a confirmé et a trouvé, au passage,
que les états financiers publiés ne peuvent PAS porter une troisième colonne :
« la présentation des états financiers est identique d'un exercice à l'autre »
et le chiffre porté est celui « de l'exercice précédent », au singulier
(SYCEBNL art. 16, 6° et 7° · AUDCIF art. 34). Le comparatif pluriannuel est donc
un état d'ANALYSE, jamais une colonne de la liasse.

La même lecture a ouvert un item qui n'était pas au plan et qui a été livré dans
la foulée : le second alinéa de ces deux articles, celui de la NON-COMPARABILITÉ
(contrôle `COMPARATIF_N1_NON_COMPARABLE`).

## Phase I · Au-delà

Gestion commerciale et ventes-clients (le §8.4 la désigne comme la porte
d'entrée SYSCOHADA) · stocks (les états SMT et compte de résultat déjà écrits
attendent des variations qu'aucune source ne produit) · paie · OHADA vers IFRS
· consolidation · RBAC fin.

Avertissement du §3.6 à ne pas perdre : le multi-classification se pose à la
CONCEPTION. `Compte`, `Journal` et `Immobilisation` sont tous
mono-classification, et la migration renchérit chaque mois.

**TRANCHÉ LE 2026-09-23 · L'AVERTISSEMENT NE TENAIT PAS.** Voir
`docs/decision-multi-classification.md`. En droit OHADA, IFRS (AUDCIF art.
73-1, « en sus ») et consolidation (ch. XII-3, « retraitements des comptes
individuels ») sont des jeux d'états AJOUTÉS au jeu légal, pas une seconde
classification dans le grand livre. Ils se construiront en tables posées à
côté, purement additives, dont le coût ne croît pas avec le temps. Les trois
modèles restent tels quels, et la gestion commerciale peut démarrer.

**I1 · La facture est livrée le 2026-09-12** · modèles `Facture` et
`LigneFacture`, migration `20260925000000_facturation`, module
`src/modules/facturation/` (les neuf groupes de mentions de l'art. 100 du
décret n° 011/42, l'état détaillé de l'art. 56 qui conditionne le droit à
déduction, et le refus d'appeler « normalisée » une pièce qu'aucune
homologation de l'art. 59 quater ne couvre), fenêtre Facturation sous
Traitement, 25 tests.

Trois constats de ce premier pas dans la Phase I, à ne pas perdre pour la
suite.

- **Le §8.4 se trompait de périmètre sur la facture.** Il annonce la gestion
  commerciale comme propre au SYSCOHADA · c'est vrai du devis et de la commande
  client, faux de la facture, dont l'obligation vient de la loi de procédures
  fiscales et vise des redevables d'impôts, pas des tenants d'un référentiel.
  Le module est donc COMMUN, et c'est le premier de ce bloc à l'être.
- **Le module de TVA calculait un droit dont il ne tenait aucune pièce.** La
  déduction est conditionnée par un état détaillé (art. 56), dont le défaut
  entraîne la réintégration d'office après cinq jours. Ce n'était pas un
  manque de confort, c'était la condition qui manquait.
- **L'homologation de l'art. 59 quater est une décision qui n'appartient pas
  au logiciel**, et elle rejoint la liste ci-dessous : un système de
  facturation propre doit être homologué avant toute utilisation, et aucune
  source lue ne décrit la procédure. Tant que Manasse ne l'a pas engagée,
  OmegaX ne produit pas de facture normalisée, et l'écran le dit.

**I2 · Le devis et la commande client sont livrés le 2026-09-13** · modèles
`Devis` et `LigneDevis`, migration `20260926000000_devis`, module
`src/modules/commercial/` (périmètre du Livre 8, qualification de l'offre de
l'art. 241, les deux dates du délai, l'art. 245 qui ne laisse à une réponse que
deux sens, et la révocabilité à deux conditions cumulatives), fenêtre Devis sous
Traitement, cloisonnée SYSCOHADA aux deux bouts, 32 tests et huit défauts
réinjectés. **La gestion commerciale est close.**

> **CORRIGÉ LE 2026-09-23 · ELLE NE L'ÉTAIT PAS TOUT À FAIT.** Il manquait la
> NOTE DE CRÉDIT, et elle n'est pas un confort : l'O.-L. n° 10/001, art. 52
> al. 2, SUBORDONNE la récupération de la TVA sur une vente annulée ou résiliée
> à « l'établissement et à l'envoi au client d'une facture nouvelle ou note de
> crédit annulant et remplaçant la facture initiale », et le décret n° 011/42,
> art. 127, veut la facture initiale « barrée et conservée dans le facturier ».
> Le module TVA imputait la récupération sur tout débit du 443, et la
> facturation ne savait émettre aucune note. **I3 la livre le 2026-09-23** ·
> nature `NOTE_DE_CREDIT` et lien `factureAnnuleeId` (unique, `RESTRICT`),
> migration `20261001000000_note_de_credit`, route
> `POST /facturation/:id/note-de-credit`, la facture annulée barrée à l'écran
> et insupprimable, les notes exclues de l'état détaillé (elles y auraient
> gonflé la déduction du montant qu'elles annulent), et dans la déclaration de
> TVA les avoirs sans note de crédit SIGNALÉS mais pas retirés, une note émise
> hors d'OmegaX restant une pièce valable. 21 tests, 13 défauts réinjectés,
> 13 attrapés (deux refaits : la première version ne compilait pas).
>
> **TROUVÉ EN CHEMIN, ET PASSÉ DEVANT · la lecture seule pouvait écrire.**
> `RolesGuard` laisse passer toute route sans `@Roles`. Dix contrôleurs
> (facturation, devis, provisions, inventaire, circularisation, faiblesses,
> questionnaires, mandat de l'auditeur, accords-cadres, exonérations)
> n'en posaient sur aucune route d'écriture : cinquante routes où un compte en
> LECTURE_SEULE, typiquement celui d'un auditeur ou d'un bailleur, pouvait
> créer et supprimer. Réservées désormais à ADMIN_CABINET et COMPTABLE, route
> par route pour que la consultation reste ouverte. Le spec
> `src/common/guards/ecritures-reservees.spec.ts` relit tous les contrôleurs et
> refuse toute route POST, PUT, PATCH ou DELETE sans rôle ni motif écrit ; il a
> été vu échouer sur les cinquante avant le correctif. ~~**Résidu** · côté
> client, seule la fenêtre Facturation masque désormais ses boutons
> d'écriture ; les neuf autres les montrent encore.~~ **FERMÉ LE 2026-09-23**,
> et il était plus large qu'annoncé : trente-neuf écrans, pas neuf. `peutEcrire`
> est dans le contexte de session et `ecriture-masquee.spec.ts` le gèle.

Le § 8.4 avait raison sur le devis, et se trompait sur la facture : le premier
est bien propre au SYSCOHADA (l'art. 234 exige une vente entre commerçants, et
une ASBL n'en est pas une), la seconde est commune (l'obligation vient de la loi
de procédures fiscales, qui vise des redevables d'impôts).

**P8 · le bulletin de paie émis est livré le 2026-09-23** · table
`BulletinPaie`, migration `20261002000000_bulletin_paie`, onglet Bulletins de la
fenêtre Personnel (émission depuis la simulation, liste du mois et totaux,
impression, annulation motivée, remise de l'art. 103). **P9 · la paie du mois
au journal est livrée le 2026-09-24** · une écriture pour tous les bulletins
émis du mois, en trois temps (brut, retenues, patronales), rejouée sur leurs
chiffres figés, liée à chaque bulletin et défaisable tant qu'elle est au
brouillard (`comptabilisation-paie.ts`).

Reste de la Phase I, À REPRENDRE APRÈS LES CONFRONTATIONS : OHADA vers IFRS ·
consolidation · RBAC fin.

> **CORRIGÉ LE 2026-09-24 · LES STOCKS ET LA PAIE NE RESTAIENT PLUS.** Cette ligne
> portait encore « stocks (les états attendent des variations qu'aucune source ne
> produit) » alors que le cycle était livré du 18 au 19 septembre (variation de
> stocks, valorisation, magasin et boni/mali, emballages), et la paie de P0 à P9.
> Elle a été recopiée telle quelle et proposée comme prochaine étape le jour
> même · une liste de manques ne se relit jamais contre elle-même, elle se
> vérifie contre le dépôt. Restent du cycle des stocks deux pistes NOTÉES et non
> codées (le sous-compte 388, la rubrique « stocks en cours de route » absente de
> la Note 8), à lire au texte avant toute ligne.

> **POINT D'ARRÊT DE LA PHASE I · 2026-09-13.** La Phase I est suspendue ici, à
> la demande de Manasse, le temps des confrontations. Le plan qui les ordonne
> est `docs/plan-confrontations.md`, VERROUILLÉ le 2026-09-13 · 31 passes en
> quatre blocs (fiscalité, actes uniformes OHADA non ouverts, solde des
> référentiels comptables, droit congolais hors fiscal). On avance sur sa base
> et dans son ordre.
>
> La Phase I reprend à son item suivant, les STOCKS, et à rien d'autre : ne pas
> recommencer la gestion commerciale, ni sauter directement à la paie.
> *(Historique · les stocks et la paie ont été faits depuis, à la demande de
> Manasse. Voir la correction du 2026-09-24 ci-dessus.)*

---

## Décisions qui n'appartiennent pas au logiciel

Aucun développement ne les débloque.

- **Licence PERPETUEL_ONPREMISE** · vendable dans la console alors que
  `LICENCE_CHECK_URL` n'est lue par aucun `ConfigService` et que
  `enregistrerHeartbeat()` n'a aucun appelant. Un dossier vendu ainsi serait
  coupé à la première requête. À ne pas proposer avant vérification.
  **FERMÉ côté console** (vérifié le 2026-09-24) · `PlateformeService`
  refuse désormais d'attribuer ce type, à la création comme au changement
  (`refuserAttributionSurSite`). Reste la décision de fond : livrer ou non une
  installation sur site qui émette le heartbeat.
- ~~**Variable `BUCKET_SAUVEGARDES`**~~ **FAIT le 2026-09-24**, run n° 28 vert jusqu'à la copie Cloud Storage · sans elle, la sauvegarde n'avait que 90
  jours de rétention et le job reste vert. Trois gestes dans le compte Google.
- ~~**Limitation de débit**~~ **TRANCHÉ le 2026-09-24, assumé** (voir `connexions-et-plafonds.md` § 7) · `ThrottlerModule.forRoot` sans `storage` : le
  compteur est par conteneur, donc deux instances Cloud Run doublent le
  plafond réel. Redis, ou plafond d'instances assumé.
- **Code du numérique congolais** · déclaration des traitements, autorisation
  de transfert hors RDC, notification des violations. **CORRIGÉ LE
  2026-09-23** · le corpus n'est plus un OCR : il a été réextrait du PDF natif
  le 05/09/2026 (la même réserve avait déjà été levée dans le plan de
  confrontations, pas ici). Reste à faire qualifier par un juriste congolais.
  Et la question est désormais CONCRÈTE : l'art. 201 veut les données
  personnelles « stockées et/ou hébergées en République Démocratique du
  Congo », et OmegaX est hébergé hors de RDC. Voir `docs/hebergement-en-rdc.md`.
- **Formulaire de déclaration DGI** · l'impôt est calculé, l'imprimé se
  remplit à la main faute d'en détenir le modèle.
- **Homologation d'OmegaX comme SFE** · décret n° 23/10 du 3 mars 2023,
  art. 20 à 23. CORRIGÉ le 2026-09-13 : la version précédente de cette ligne
  disait qu'aucune source ne décrivait la procédure, ce qui était faux.
  OmegaX est un « Système de Facturation d'Entreprise » (art. 3, 7°), un SFE
  développé en propre ne peut être utilisé qu'après une ATTESTATION DE
  CONFORMITÉ délivrée par l'Administration fiscale (art. 22), et les modalités
  de la procédure sont renvoyées à un arrêté du Ministre des Finances
  (art. 23) qui n'est dans aucune source lue. Le point à trancher en premier
  n'est d'ailleurs pas l'émission mais la VENTE : « seuls les SFE homologués
  sont proposés à la vente aux contribuables et utilisés en République
  Démocratique du Congo » (art. 20), et les assujettis « ne peuvent acquérir
  que des SFE homologués, répertoriés et publiés par l'Administration »
  (art. 21).
- **Forfait micro-entreprise** · la circulaire de change n'est pas connue, la
  branche renvoie `null`.
- ~~**Tenue en devise étrangère** · le logiciel laisse ouvrir un dossier en USD
  sans un mot sur l'art. 141 de la loi 23/053.~~ **TRANCHÉ par M1 et M2**
  (vérifié le 2026-09-24) · la monnaie de tenue est verrouillée sur le franc
  congolais, `Tenant.devise` n'est plus dans aucun DTO, et la monnaie
  fonctionnelle commande un second jeu sans valeur légale. Ligne périmée,
  laissée barrée pour que la leçon reste.
- **Module groupe en SYSCOHADA** · le refus est désormais posé aux deux portes
  (2026-09-02). Les moteurs nécessaires existent : ce n'est plus technique,
  c'est un arbitrage.
- ~~**Mécénat 4571 contre 475**~~ **TRANCHÉ le 2026-09-24 pour le 475** · les deux comptes sont semés, le catalogue
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
