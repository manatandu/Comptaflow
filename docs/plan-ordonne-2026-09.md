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

**B1 · Journal d'audit général.** Sur 39 modèles Prisma, aucun ne trace les
connexions, les changements de paramètres du dossier, les exports de données,
la création ou la suppression d'un utilisateur. La piste d'audit COMPTABLE
existe et est bonne (`createdBy`, `valideeBy`, correction par inscription en
négatif avec motif obligatoire, art. 20 AUDCIF) · c'est la piste TECHNIQUE qui
manque. Deux raisons de le placer ici plutôt qu'en confort :

- c'est la première chose qu'un commissaire aux comptes ou un auditeur de
  bailleur demande ;
- le Code du numérique congolais impose la notification sans délai des
  violations de données (art. 244 du corpus lu, à faire qualifier par un
  juriste, voir Décisions) · sans journal, cette notification est
  matériellement impossible à produire.

**B2 · Cloisonnement multi-locataire garanti structurellement.** Une extension
du client Prisma qui refuse toute requête sur un modèle porteur de `tenantId`
sans `tenantId` dans le `where`, plus un test d'intégration qui appelle une
dizaine de routes avec un jeton du locataire B sur des identifiants du
locataire A. La discipline actuelle est réelle et vérifiée, mais tenue à la
main dans plus de trente modules : c'est le seul risque dont la probabilité
AUGMENTE avec le temps, à chaque module ajouté.

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

**B5 · Cycle de vie des accès.** Révocation de session côté serveur,
application serveur de `doitChangerMotDePasse`, verrouillage par compte,
réinitialisation de mot de passe par l'ADMIN_CABINET. Aujourd'hui un oubli de
mot de passe se règle par un UPDATE SQL en production.

**B6 · Livre d'inventaire, rapport de gestion, contrôles par référentiel.**
L'AUDCIF art. 19 impose le livre d'inventaire à tout commerçant, et la fenêtre
est fermée au SYCEBNL. Le jalon du rapport de gestion (AUSCGIE art. 138) est
servi à l'utilisateur SYSCOHADA sans qu'aucun service ne le produise.
`controles.service.ts` ne lit jamais `tenant.referentiel` et sert à une
ENTREPRISE les seuils de désignation d'auditeur de l'art. 19 SYCEBNL, au lieu
des critères AUSCGIE que `planning-cloture.ts` cite pourtant déjà.

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
