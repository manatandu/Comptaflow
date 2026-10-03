# OmegaX

Logiciel de comptabilité SYCEBNL / SYSCOHADA pour les ASBL, ONG et entreprises
de RDC. Propriété du cabinet **VMG Consulting**, qui l'exploite et le vend.

Ce fichier est le règlement intérieur du dépôt. Il est chargé à chaque session.
Les règles marquées **JAMAIS** ont chacune coûté un incident réel : ne pas les
contourner, ne pas les « optimiser ».

---

## 1. La règle qui prime sur toutes les autres

**JAMAIS de compte, de règle comptable, d'article ou de taux écrit de mémoire.**

Chaque numéro de compte, chaque rubrique d'état, chaque seuil, chaque article
cité dans le code ou dans une réponse doit avoir été LU dans une source, à
l'instant, avant d'être écrit. Les sources sont les compétences installées :

| Sujet | Compétence à lire |
|---|---|
| Plan de comptes, écritures, états SYCEBNL | `sycebnl` |
| Plan de comptes, écritures, états SYSCOHADA | `syscohada` |
| Règles d'évaluation, systèmes, seuils OHADA | `audcif-acte-uniforme` |
| Loi sur les ASBL et ONG en RDC | `droit-asbl-ong-rdc` |
| Fiscalité congolaise (taux, échéances) | `fiscalite-rdc`, `fiscalite-rdc-socle` |
| Organisation comptable, doctrine CPCC | `organisation-comptable-cpcc` |
| Patterns d'architecture logicielle (Sage) | `sage-i7` (dans `.claude/skills/`) |

Un plan de comptes faux ne lève aucune erreur, ne casse aucun test, et ne se
découvre qu'au dépôt des états. C'est la seule catégorie de bug que ce projet
ne peut pas se permettre.

Corollaire : quand une source dit le contraire de ce qui est demandé, **le
dire avant de coder**, pas après. Exemple vécu : le renvoi (1) de la fiche
récapitulative SYCEBNL interdit de joindre les notes non documentées, alors
qu'on demandait de les joindre toutes. On l'a signalé, la décision a été prise
en connaissance de cause, et l'écart est écrit dans le code
(`ExportService.construireClasseurNotes`) pour qu'il ne passe pas pour un
oubli.

**Une question de fond se tranche PAR LA LOI, toujours** (décision de Manasse
du 2026-10-03 · « Pour les prochaines questions qui demandent ma décision,
réfère-toi toujours à la loi. Toujours. »). Avant de soumettre une question à
Manasse, la session lit le texte qui la régit (compétences du tableau
ci-dessus), tranche, et écrit la décision avec son article. Ne remontent à
Manasse que ce que le corpus ne tranche pas (texte absent, muet, ou deux
textes contraires sans hiérarchie), et la question dit alors ce qui a été lu.
Un choix commercial ou d'organisation du cabinet, que nul texte ne régit,
reste à lui.

---

## 2. Pile technique

**Serveur** · NestJS 10, Prisma 5, PostgreSQL (Neon, PG 18), Jest, ExcelJS,
passport-jwt, bcryptjs. Node 22.
**Client** · React 18, Vite, TypeScript, Tailwind, react-router-dom 6 en
**HashRouter** (les URL sont de la forme `oomega.web.app/#/comptes`).

Racine = serveur. `client/` = interface. Un seul dépôt. L'arborescence
ci-dessous est relue contre le disque par `reglement-interieur.spec.ts` (audit
final F269) · un dossier de premier niveau qu'elle ne nomme pas, ou un module
qu'elle nomme et qui n'existe pas, fait tomber le test.

```
src/modules/     modules métier (auth, comptes, comptabilite, etats-financiers,
                 notes-annexes, exports, groupe, plateforme, licence, sur-site…)
                 · les écritures, la balance et le grand livre vivent dans
                 comptabilite/
src/common/      gardes, décorateurs, Prisma, journal d'audit, /health
prisma/          schema.prisma + migrations SQL écrites à la main
client/src/      pages/, components/chrome/, lib/
e2e/             tests navigateur (Playwright), paquet npm à part (§ 10)
installation/    installation sur site · lanceur du service, déchiffrement des
                 copies externes, programme d'installation Windows (windows/)
scripts/         extracteurs des compétences (règles par compte, schémas des
                 guides), émission de licence de secours, relevé des citations,
                 pose des clés des rubriques de notes en saisie
docs/            plan de construction, audits, guides pilote, notes de droit
                 · historique/ range les documents révolus, sous bandeau (F267)
.github/workflows/  déploiement, tests, sauvegarde, surveillance, paquet (§ 5)
.claude/skills/  la compétence sage-i7, versionnée avec le dépôt (§ 1)
```

## 3. Commandes

```bash
# Serveur (depuis la racine)
npx tsc --noEmit          # typage · à passer AVANT tout commit
npx jest                  # tous les tests passent, sans exception
npm run build             # nest build
npx prisma generate       # après toute modification du schéma

# Client (depuis client/)
npx tsc --noEmit
npm test                  # vitest run · vite et vitest en devDependencies à version exacte, portées par le lockfile (audit final F196)
npm run build
npm run dev               # port 5173
```

**Avant chaque commit, tout ce bloc passe**, des deux côtés. Pas « je pense
que ça compile ».

---

## 4. Ce qui est interdit

- **JAMAIS** écrire, afficher, journaliser ou committer la chaîne de connexion
  Neon (`DATABASE_URL`). La masquer même dans une sortie de commande. Les valeurs
  factices de `.env.example` et les gabarits `<mot-de-passe>` de la
  documentation sont voulus : ce sont des modèles, pas des fuites.
- **JAMAIS** désactiver `commit.gpgsign` ni utiliser `--no-gpg-sign`. Tous les
  commits du dépôt sont signés.
- **JAMAIS** de tiret cadratin (—) nulle part : code, commentaires, interface,
  documentation, messages de commit. Utiliser « · » ou une ponctuation
  ordinaire. Le dépôt en est nettoyé, ne pas en réintroduire. Une garde qui
  REFUSE le caractère l'écrit échappé (`\u2014`), jamais en clair.
  `cadratins.spec.ts` relit le dépôt entier et tient la liste FERMÉE des
  exceptions ci-dessous, chacune avec son nombre exact d'occurrences (audit
  final F202) · un caractère de plus dans un fichier admis le fait tomber
  comme un caractère dans un fichier qui ne l'est pas, et le nombre que ce
  paragraphe imprime pour les deux tables engendrées est relu lui aussi. Les
  specs qui écrivent encore le caractère en clair dans leur propre garde ne
  sont PAS des exceptions · le spec les nomme à part (`RESTENT_A_ECHAPPER`),
  chacun avec son nombre, et tombe le jour où l'un d'eux est échappé, pour
  qu'on retire sa ligne.
  *Les exceptions, à ne pas « corriger »* : la migration
  `20260829033943_retire_cadratins` porte le caractère comme DONNÉE, puisque
  c'est elle qui le remplace en base (et une migration appliquée ne se modifie
  jamais, Prisma en vérifie l'empreinte) ; les fichiers ENGENDRÉS qui
  transcrivent le texte officiel VERBATIM · `regles-comptes-sycebnl.ts` en
  porte 174 sur 98 lignes (le « 97 » écrit ici jusqu'au 2026-09-28 comptait
  les lignes), tous dans des citations du type « 481 — Fournisseurs
  d'investissements », et `regles-comptes-syscohada.ts` en porte 3, lus au
  Titre VII de l'AUDCIF tel que la compétence le transcrit (deux dans les
  exclusions des comptes 49 et 59, qui citent l'intitulé l'un de l'autre, le
  troisième dans une note de la transcription à la fiche du 759, que
  l'extracteur recopie avec le reste). Les remplacer falsifierait la
  citation, et c'est justement sa fidélité qui rend l'avertissement opposable
  devant un réviseur ; retouchés à la main, ils reviendraient d'ailleurs à la
  régénération suivante. Même raison, même statut, pour l'item CPCC-PRO-5 de
  `catalogue-questionnaire.ts`, qui cite un impératif du séminaire tel qu'il
  est écrit, et pour les deux tests qui gèlent ces citations mot pour mot
  (`regles-comptes.spec.ts`, `questionnaire.spec.ts`). Le script
  `scripts/extraire-schemas-guides.cjs` porte le caractère comme DONNÉE DE
  RECONNAISSANCE · ses deux motifs de titre l'écrivent en clair, dans une
  classe qui admet aussi le trait d'union, pour lire le séparateur qui suit
  « APPLICATION n » dans les guides d'application des compétences, qui
  l'écrivent avec ce caractère. Enfin ce fichier-ci, qui montre le caractère
  pour l'interdire et le cite là où il est cité.
- **JAMAIS** de nom de modèle d'IA dans un commit, une PR, un commentaire ou
  quoi que ce soit de poussé.
- **JAMAIS** de « bientôt disponible » qui soit faux. Une fenêtre annoncée en
  construction doit être refusée côté serveur aussi (`ReferentielGuard`), pas
  seulement masquée côté client.

## 5. Git et déploiement

Le travail va sur **`main`** · c'est cette branche qui déclenche les
déploiements. Pas de branche de fonctionnalité sauf demande explicite. Pas de
pull request sauf demande explicite.

**RIEN NE SE PERD À UNE COUPURE** (décision de Manasse du 2026-10-03). Une
limite d'utilisation ou un conteneur reclamé coupait des agents au milieu, et
la ligne repartait de zéro. Trois règles. (1) L'agent qui construit committe
à CHAQUE étape finie (une correction, un test au vert), jamais un seul paquet
à la fin. (2) Il pousse aussitôt sur une branche de SAUVEGARDE
`travail/<ligne>` (par exemple `travail/a7`), seule exception à la règle
ci-dessus · aucun workflow ne la déploie (les `on: push` sont bornés à
`main`), elle ne porte aucune demande de tirage et se supprime une fois la
ligne intégrée sur `main`. (3) Il tient à la racine de sa copie une fiche
`AVANCEMENT-<ligne>.md` · fait, reste, décisions prises avec leur article,
commandes de vérification · committée avec le travail et retirée à
l'intégration. L'agent qui reprend après une coupure part de la branche et de
la fiche, jamais de zéro.

Les workflows de `.github/workflows/` sont indépendants : aucun n'attend
qu'un autre ait réussi. Un push sur `main` en déclenche plusieurs à la fois,
le déploiement du serveur seulement s'il touche ses chemins ; les autres
tournent sur demande de tirage, sur horaire ou à la main. La table est
relue contre le dossier et contre le `on:` de chaque fichier par
`reglement-interieur.spec.ts` (audit final F266) · un workflow ajouté, retiré
ou redéclenché sans que la ligne suive fait tomber le test.

| Workflow | Déclencheur | Effet |
|---|---|---|
| `deploy-cloud-run.yml` | push sur `main` touchant `src/**`, `prisma/**`, `Dockerfile`, `package*.json` ou le workflow lui-même ; demande de tirage (job `verifier` seul) ; à la main | portillon `verifier` sous Node 22 (typage, tests et construction des deux côtés, démarrage réel contre une base jetable en PostgreSQL 18 comme Neon ET en PostgreSQL 17 comme le sur site), PUIS `prisma migrate deploy`, PUIS déploiement Cloud Run, PUIS contrôle `/health` |
| `firebase-hosting-merge.yml` | push sur `main`, quel que soit le fichier | typage et tests du client, construction, Firebase Hosting, site `oomega` |
| `firebase-hosting-pull-request.yml` | demande de tirage ouverte depuis le dépôt même, sauf par Dependabot, qui n'en reçoit pas les secrets | construction du client et canal de prévisualisation Firebase |
| `tests-navigateur.yml` | push sur `main`, demande de tirage, à la main | client construit et servi en relayant `/api` vers le serveur réel et un Postgres jetable, Playwright sous Chromium et WebKit (`e2e/`, § 10) |
| `sauvegarde-base.yml` | horaire, chaque nuit à 02:00 UTC ; à la main | `pg_dump` chiffré + restauration de contrôle, qui doit rendre la source table par table et ligne par ligne, décomptée dans l'instantané même de l'export (audit final F262) |
| `surveillance.yml` | horaire, toutes les quinze minutes ; à la main | interroge le service, le relais `/api` du site et le site ; après trois échecs, ouvre l'issue « Panne de production », refermée au retour |
| `paquet-sur-site.yml` | à la main seulement | paquet d'installation Windows (`OmegaX-installation-<date>-<commit>.exe`) |

**DEUX chaînes de connexion, et elles ne s'échangent pas.**
`API_DATABASE_URL` est l'endpoint DIRECT · migrations (`prisma migrate
deploy`) et `pg_dump`, qui tiennent une session longue, des verrous et du DDL.
`API_DATABASE_URL_POOLED` est l'endpoint POOLÉ (hôte suffixé `-pooler`,
PgBouncer en mode transaction) · c'est LUI que le service reçoit, parce que
chaque instance Cloud Run ouvre son propre pool Prisma et que sans
multiplexage la base tombe pour tous les cabinets à la fois. Tant que le
second secret n'existe pas, le premier sert : repli VOULU, un workflow qui
exigerait un secret absent couperait le service. Le déploiement complète
lui-même la chaîne poolée (`pgbouncer=true`, `connection_limit`) sans jamais
l'afficher, et n'écrase jamais un paramètre déjà présent. Le serveur écrit au
démarrage son RÉGIME de connexion, jamais sa chaîne
(`src/common/pooling-base.ts`) · c'est cette ligne qui prouve que la bascule a
pris, et qui le dira si un déploiement la perd. Plafonds posés dans le
workflow, jamais dans la console : `--max-instances 4`, `--concurrency 80`. La
MÉMOIRE n'est pas touchée · les plafonds de fenêtre sont mesurés sur un tas de
460 Mio (§ 8 bis), la relever sans refaire le banc ferait mentir
`docs/capacite-mesuree.md`. Marche à suivre complète :
`docs/connexions-et-plafonds.md`.

**Piège du déploiement** · Cloud Run reçoit ses variables par
`--env-vars-file`, qui **remplace TOUTES** les variables du service. Une
variable posée à la main dans la console Google est effacée au push suivant.
Toute variable d'environnement doit donc passer par le workflow.

Le contrôle `/health` en fin de workflow vérifie que le service répond ET
qu'il joint sa base · un déploiement vert prouve les deux. L'environnement de
développement n'atteint pas Cloud Run (politique réseau) : ne jamais affirmer
l'état du service depuis un `curl` local, se fier au workflow.

**APRÈS CHAQUE PUSH qui touche `src/**` ou `prisma/**`, RELIRE LE RÉSULTAT DU
DÉPLOIEMENT.** Pousser n'est pas déployer. Le 2026-09-02, six poussées de
suite ont été annoncées comme faites alors que le conteneur refusait de
démarrer à chaque fois : Cloud Run garde l'ancienne révision quand la
nouvelle ne répond pas, si bien que le logiciel a tourné une soirée entière
avec un client à jour sur un serveur d'avant. La panne était rouge dans
Actions depuis le début · personne ne l'avait ouverte. Un « poussé » sans
déploiement vérifié est un « poussé » qui ne veut rien dire.

Le job `verifier` fait en plus **démarrer le serveur pour de bon**, contre un
Postgres jetable monté en service, et interroge `/health`. Compiler et tester
ne prouve pas qu'un serveur démarre : les tests tournent sur des Prisma
factices, qui rendent des promesses déjà lancées et ne désérialisent aucune
colonne. Les deux pannes du 2026-09-02 (sortie de cloisonnement muette,
verrou d'audit illisible) sont passées au vert dans 1696 tests et sont tombées
à la première seconde de vie réelle. Ce contrôle relit aussi le journal de
démarrage : un maillon d'audit non écrit ne fait tomber aucune requête, il ne
se voit que là.

**LE PORTILLON ÉPROUVE LES VERSIONS DE SES CIBLES, ET IL JUGE LES DEMANDES DE
TIRAGE (2026-09-28, audit final F194, F195).** Node 22 comme le `Dockerfile`,
et DEUX JAMBES de base jetable · PostgreSQL 18, celle de Neon, où tourne la
suite complète, et PostgreSQL 17, celle que gèle l'installation sur site
(`PG_MAJEUR_ATTENDU` de `paquet-sur-site.yml`), qui migre et démarre. Chaque
jambe relit la version réellement servie avant de démarrer. La jambe 17
démarre le serveur EN LIGNE · elle éprouve la version de la base, pas le mode
`SUR_SITE`, qu'aucun workflow ne démarre. Le portillon tourne aussi sur toute
demande de tirage, sans filtre de chemins et sans secret (Dependabot s'y
disait jugé alors qu'il ne tournait que sur push) ; le déploiement, lui, ne
suit qu'un push ou un lancement manuel sur `main`, par une condition à liste
fermée, et jamais `pull_request_target`. `chaine-de-livraison.spec.ts` lit
les versions dans les fichiers qui les imposent et tient le reste.

Pour pousser : `git push -u origin main`, avec quelques tentatives espacées en
cas d'échec réseau.

## 6. Deux référentiels, et leur cloisonnement

`Tenant.referentiel` vaut `SYCEBNL` ou `SYSCOHADA` · ni plan, ni états, ni
vocabulaire partagés.

- **SYCEBNL** · trois jeux (`jeuEtatsFinanciersSycebnl`) : associations et ordres
  professionnels (45 notes), projets de développement (26), SMT (5).
- **SYSCOHADA** · plan semé en entier (décompte tenu par
  `compte-seed-syscohada.spec.ts` seul), journaux, taxes, immobilisations, éditions.
  Deux systèmes (`systemeComptableSyscohada`), AUDCIF art. 11 et 13, l'art. 12
  (Système allégé) abrogé depuis 2017. **Normal** · bilan, résultat, TFT (Titre IX
  ch. 3 à 5, correspondance du ch. 7), 36 notes du ch. 6 (46 codes). **SMT** ·
  bilan, résultat, notes 1 à 3, journal de trésorerie (NOTE 4), éligibilité de
  l'art. 13 (Titre X). États financiers et Notes annexes aiguillent vers quatre
  écrans (`EtatsFinanciersPage`, `NotesAnnexesPage`, aiguillage en fin de fichier).

Cloisonnement TOUJOURS aux deux endroits : `referentielsApplicables` (client) et
`@ReferentielsAutorises(...)` + `ReferentielGuard` (serveur) · masquer sans refuser
laisse la route ouverte. Balayages SYCEBNL
(`correspondance-notes-associations.spec.ts`, 45 tableaux ·
`correspondance-notes-projets.spec.ts`, 26) : liste officielle, comptes cités,
totaux et clés, tableaux hors balance gelés, non-contamination. Un TITRE partagé
sous deux numéros est normal (« TRANSPORTS » 25 contre 16) ; un OBJET partagé ferait
qu'une correction d'un jeu s'applique en silence à l'autre.

**Fiches par compte** · `regles-comptes-sycebnl.ts` (79 fiches, Partie 2 ch. 3) et
`regles-comptes-syscohada.ts` (115, AUDCIF Titre VII), engendrés par
`scripts/extraire-regles-comptes.cjs` : « Exclusions » avertit à la saisie sans la
bloquer, « Éléments de contrôle » nourrit le Dossier de révision. Texte CITÉ, jamais
reformulé. SYCEBNL « (utiliser 104) », AUDCIF « → 481 » · deux lecteurs, jamais une
table servie à l'autre référentiel. Propres au SYCEBNL : donateurs, bailleurs,
exonérations douanières, opérations spécifiques, canevas de trésorerie du groupe.
Propres au SYSCOHADA : résultat fiscal et IS (EBNL exemptée, loi n° 23/053 art. 5).

**Module groupe, COMMUN.** Association et cellules (SYCEBNL, liaison par le 58),
société et établissements (SYSCOHADA, 184 à 187) · UNE entité en plusieurs dossiers,
pas une consolidation. Fiche du COMPTE 18 (AUDCIF, Titre VII) : « les comptes de
liaison sont égaux et de sens contraire dans les deux comptabilités ». Somme nulle :
les 184 à 187 sortent de l'agrégat, rendus ligne à ligne ; sinon la liasse est
refusée. Les 181 à 183 et 188 visent d'AUTRES personnes ; en SYCEBNL le 185 = dépôts
reçus, contrôle SYSCOHADA seul. Cellule et combinaison prennent référentiel, système
(SYSCOHADA) ou jeu (SYCEBNL, le SMT seul remplacé par les associations, audit final
F153) du siège, imposés à `creerCellule` et `modifierGroupe`, vérifiés AVANT
`register` par la console (`verifierMere`, F47 · refusée après, la mère gardait un
dossier inaccessible). Système figé sur une cellule et sur un siège qui en a
(`modifierSystemeSyscohada`, F172). Canevas de trésorerie : SYCEBNL seul (filtre de
route).

**Documents obligatoires, COMMUNS**, chacun dans son texte : livre d'inventaire
(SYCEBNL art. 14 · AUDCIF art. 19), rapport (SYCEBNL art. 16-3, quatre sections ·
AUSCGIE art. 138, six · AUSCOOP art. 108, six autres dont l'état de promotion des
coopérateurs), écarts verrouillés par `documents-obligatoires-syscohada.spec.ts`.
F94, F95 : `fondementInventaire` porte article, périmètre et sanction (AUDCIF
art. 19 et 111 contre SYCEBNL art. 14 et 24) ; trésorerie du rapport tirée du TFT du
dossier ou d'aucun (`tableauTresorerieDuDossier` · ni projets ni SMT) ; une
trésorerie figée sans `tableau` ne se relit que chez les associations.

**Personnel extérieur.** À la clôture, 637 viré POUR SOLDE au débit du 667 (SYCEBNL
Partie 2 ch. 3, fiches 63 et 66 · AUDCIF Titre VIII ch. 27 § 2). Oublié, le résultat
net ne bouge pas, mais la ventilation et, au SYSCOHADA, la cascade des soldes de
l'art. 31 sont fausses. `PERSONNEL_EXTERIEUR_NON_VIRE` signale sans virer.

**Passe R6 · les trois jeux SYCEBNL relus au Journal officiel.** QUATRE RÈGLES. (1)
Date d'arrêté de la NOTE 3 tirée de l'exercice (`Exercice.dateArreteComptes`,
`injecterDateArrete`), verrouillée. (2) Renvoi imprimé dans la colonne note
(`ColonneNote.porteLeRenvoi`) ; intitulés et titres TRANSCRITS par jeu
(`intitules-notes-sycebnl.ts`). (3) Un compte n'est lu que par une ligne d'une même
note (`rubriqueQuiLitDeja`, refus au rattachement). (4) Un rattachement qu'aucune
rubrique rattachable ne lit est nommé (`rattachementsSansRubrique`, bouton de
retrait), sans quoi le compte sortait de la note sans un mot. Fragiles : les renvois
d'un caractère des modèles scannés (VA, VB, VC du SMT, à lire sur le PDF).

**Un montant en francs ne se compare pas à un seuil en FCFA** (recensement du
2026-09-30). Seuils AUSCGIE (art. 376, 906) et SYCEBNL (art. 19) en FCFA, aucune
parité au corpus · critère `nonCompares`, obligation `obligationIndeterminee`,
jamais « non franchi ». Une mission prorogée se dit quand même.

**Rubriques de notes en saisie.** 322 rubriques portent `saisie: true` (engagements,
effectifs, informations sociales et environnementales, événements postérieurs,
méthodes), OBLIGATOIRES (SYCEBNL art. 15, AUDCIF art. 33) · stockées par exercice
(`SaisieNote`, `saisies_notes`), au JOURNAL D'AUDIT (F87), retouchées par
identifiant, jamais par `deleteMany` ou `upsert` sur la clé composée. Un
rattachement n'est pas daté (tous les exercices, clos compris). Ancre = (code de
note, CLÉ de rubrique) et RANG de colonne (`rubriques-en-saisie.spec.ts`). Saisie et
rattachement s'excluent. Règle lue à la CELLULE (passe O3) : la colonne LIBRE
`saisieSurLigneChiffree` d'une rubrique chiffrée à clé est en saisie, totaux exclus
(`cellules-libres-en-saisie.ts` · sûretés réelles de la NOTE 1, nature du contrat,
régime fiscal, échéances) ; une colonne LIBRE laissée vide est dans une liste FERMÉE
avec motif. Les lignes en saisie se présentent même note non applicable (§ 1.4).

**Note 33.** Vingt-quatre indicateurs (`indicateurs-note-33.ts`), verrouillés.
« + Fonds propres et assimilés » vaut **CZ**, pas CK (sinon CONTRÔLE tombe chez toute
association à fonds affectés) ; écarts de conversion (renvoi c) HORS agrégats. Ratio
d'utilisation des dons en SAISIE ; variations de ratio en POINTS, « variation en % »
vide (renvoi b).

**Exécution budgétaire.** Notes 35 (associations) et 24 (projets) injectées par
`NoteAnnexeService` (`injecterExecutionBudgetaire`) depuis
`EtatsFinanciersProjetBudgetService.executionBudgetaire()` quand un plan à budgets
existe, sinon en saisie. Seule `AucunPlanABudgetsException` est rattrapée, ici et
dans la liasse (F83). SYSCOHADA : aucun état budgétaire.

**Cotisations · appel ou encaissement.** Cadre conceptuel § 5.4.2.1 : l'APPEL,
« toutefois, si l'entité ne peut justifier d'un droit d'agir en recouvrement, les
cotisations et le droit d'entrée sont comptabilisés lors de leur encaissement
effectif », méthode en annexe. `Tenant.methodeCotisations` SANS défaut (un APPEL
présumé inscrirait des créances non poursuivables) ; modèles `exigeDroitDAgir`
refusés à l'encaissement ; `METHODE_COTISATIONS_NON_PRECISEE` seulement si le 701 ou
le 103 a bougé. Rien tranché n'est pas bloqué.

**Trois indices de minoration (séminaire CPCC, arrêté 2024).**
`TRANSPORT_TIERS_SANS_TRANSFERT` (613 sans 781),
`EXTOURNE_REGULARISATION_INCOHERENTE` (extourne du 476 ou 477 différente du solde
repris), `AVANCE_CLIENT_REPORTEE` (419 créditeur à la clôture précédente,
information seule). 613 et 419 : SYSCOHADA seul (loi n° 23/053, art. 5) ; l'extourne
vaut aux deux. **AUCUN TAUX DE CE SÉMINAIRE N'EST REPRIS** (IBP et IPR abrogés au
1er janvier 2026). Loi n° 23/053 art. 51 et 52 (compilation DGI au 19/07/2026, loi
de finances n° 25/060 sans effet) : ni **plafond d'imputation de 60 %** ni
**imputation de l'impôt minimum** (art. 42 de l'ordonnance-loi n° 69/009, IBP) ; les
**amortissements réputés différés** sont « des déficits ordinaires », trois
exercices (fini l'art. 42 bis, 5°) · aucun stock d'ARD. Figé dans
`fiscalite.spec.ts`.

**Inventaire physique.** AUDCIF art. 42 (« procéder au RECENSEMENT et à l'ÉVALUATION
de ses biens, créances et dettes »), non écarté par l'art. 3 du SYCEBNL (de 34 à 49)
· ouvert aux deux, sans `@ReferentielsAutorises`. Pénal : AUDCIF art. 111 contre
SYCEBNL art. 24 premier tiret (l'art. 3 écarte les art. 73 à 113 ; comme art. 19
quatrième tiret contre art. 14), par `sanctionApplicable()`. TROIS REFUS : jamais
d'excédent (AUDCIF art. 43, « cette dernière est MAINTENUE dans les comptes ») ;
aucun rapprochement avec une fiche non valorisée (« pas encore compté » deviendrait
un manquant) ; solde FIGÉ au rapprochement (sinon le redressement referme l'écart
tout seul). NOTE 2 du SMT (F85) : quantité et prix unitaire quand les fiches
reconstituent le compte au centime (`stocks-depuis-inventaire.ts`), sinon sans
quantité, raison dite ; total = bilan. Écart PAR COMPTE (CPCC, « le solde de CHAQUE
COMPTE sur la balance provisoire ») : `FicheInventaire` le comptage,
`EcartInventaire` la comparaison et la décision. Recensement ouvert au premier
comptage (F134 à F136), PV signé AVANT le rapprochement ; une fiche se RETIRE tant
que rien n'est figé ; sous-commission de SA campagne. Redressement d'un manquant
PROPOSÉ, contrepartie VIDE, jamais posté.

**Circularisation (ISA 505).** Échantillon tiré de la balance (`racinesDuCycle` ·
52/53, 40, 41, 42/43/44/47). DEUX TAUX : RÉPONSE et COUVERTURE (80 % de réponses
peuvent couvrir 3 % des soldes). Total lu à la DATE D'ARRÊTÉ (F70 à F72),
livre-journal seul, une lecture (`soldesDuCycle`) pour échantillon, lettre et taux.
Demande ajoutée en PRÉPARATION seule, une par compte (index unique), retirée si non
partie ; clôture refusée sur une lettre jamais envoyée. Campagne dépouillée quand
chaque lettre partie est classée (F210), sans jamais rouvrir une close ; trois
issues (réponse reçue, sans réponse, non distribuée) ; « envoyée » et « relancée »
par l'envoi seul ; état affiché en liste et en en-tête. TROIS REFUS : une
NON-RÉPONSE n'est pas une confirmation (§ 12, « in the case of EACH non-response,
the auditor shall perform alternative audit procedures ») ; un ÉCART se QUALIFIE
(§ 14 · délai, mesure, erreur matérielle, anomalie potentielle) ; la demande
NÉGATIVE exige les QUATRE conditions du § 15. § 7 c) : réponse non directe marquée,
pas rejetée. Le cabinet qui TIENT les comptes n'en est pas l'auditeur · aucune
opinion.

**Registre des provisions pour risques et charges.** AUDCIF Titre VIII ch. 18, où
renvoie la fiche du COMPTE 19 du SYCEBNL · ouvert aux deux. Un numéro, deux sens :
au 192, « garanties données aux clients » (SYSCOHADA) contre « charges sur donations
et legs » (SYCEBNL), qui n'a ni 193, ni 195, ni 197 · `naturesDuReferentiel()`.
QUATRE conditions (le CPCC sépare ce que le § 2.1 fusionne). TROIS REFUS. Provision
INTERDITE (§ 4.11 · pertes opérationnelles futures, grosses réparations) proposée
pour être REFUSÉE avec la voie de rechange, sans quoi elle finirait au 1988.
Condition manquante : PASSIF ÉVENTUEL, motif écrit, jamais disparition (l'annexe
serait muette). Remboursement jamais COMPENSÉ (§ 3.1.4, « que s'il est certain que
l'entité le recevra », « actif DISTINCT, NON COMPENSÉ avec la provision »). Tableau
du § 5.3, utilisations et reprises SÉPARÉES ; rapprochement en VALEUR ABSOLUE, aucun
solde pour un passif éventuel. Ni écriture, ni montant (§ 3.1.1), ni actualisation
(§ 3.1.2, colonne saisie).

**Registre des faiblesses du contrôle interne (ISA 265).** Le CPCC dit seulement
« faire le suivi des faiblesses relevées lors de l'audit précédent ».
RÉVISION_INTERNE : le cabinet décrit, qualifie, recommande. RECOMMANDATION_EXTERNE :
PORTE-DOCUMENTS, qualification recopiée, `qualifier()` et `escalader()` refusés
(`refuserSiLettreRecue`, F73), clôture sans exigence de qualification ni d'écrit. Un
REPORT reste dans son origine, vers un exercice postérieur (`motifRefusReport`,
F74). DOUBLE RÉGIME (`regimeDeReport()`) : SIGNIFICATIVE non remédiée, § A17,
« REPEAT the communication » (répéter ou référencer) ; AUTRE, § A24, « NEED NOT
REPEAT ». Rien ne se qualifie seul (§ 6 b) et § 8) : auteur ET justification
écrite ; indicateurs du § A7 sans conséquence ; escalade du § A24 = acte daté et
motivé, jamais un effet du calendrier. Clôture refusée en révision interne pour une
faiblesse NON QUALIFIÉE (§ 8) ou une SIGNIFICATIVE jamais écrite (§ 9, « IN
WRITING »). Destinataire : gouvernance (§ 9) ou direction (§ 10 b)) ; une escalade
remet l'écrit à faire. AUCUN champ de montant (§ A28). L'auteur du constat ne signe
pas la réponse de la direction ; « remédiée » dit si le cabinet a VÉRIFIÉ (§ A28),
le silence n'est pas une réponse. Trois mentions du § 11 b) à l'écran.

**M2 · la balance en monnaie fonctionnelle, ligne à ligne au cours historique.**
Tenue en francs (loi n° 23/053 art. 141, 1° ; AUDCIF art. 17, 1°). Le second jeu
n'est régi par AUCUN texte (l'AUDCIF ne convertit que VERS l'unité légale, art. 36
et suivants, Titre VIII ch. 22) · décision de l'éditeur, mention EN TÊTE de chaque
page. Conversion LIGNE À LIGNE au cours de la DATE DE L'ÉCRITURE, une écriture à un
SEUL cours, jamais la balance au cours de clôture. Une ligne déjà dans la monnaie
fonctionnelle garde son montant (10 000 USD, pas 9 999,97) ; la conversion DIVISE
par le cours. L'écart de conversion a sa ligne, jamais un compte de bouclage.
À-nouveau et clôture NON convertis (F42) : ouverture = clôture du MÊME jeu N-1
(`jeuFonctionnel`, récursif), résultat au compte 13 ; sans exercice précédent,
l'à-nouveau au cours de sa date, et l'état le dit. Refus : un cours POSTÉRIEUR
(cours en vigueur, `coursApplicable`, F155) ; une écriture ANTÉRIEURE à tout cours
(état arrêté, dates listées) ; aucune monnaie fonctionnelle, ou égale à celle de
tenue.

**Une ligne en devise se SAISIT (F49).** Francs plus devise, montant et cours
(`comptabilite/ligne-en-devise.ts`, par `controlesDEntree` · saisie, modification,
import). Refus : monnaie de tenue prise pour devise ; devise d'un autre dossier ;
montant qui n'est pas la contrevaleur au centime (plus l'arrondi d'un cours à six
décimales). Sans cours, il se DÉDUIT (AUDCIF art. 52) ; l'écran PROPOSE le dernier
coté à la date de la pièce. **La devise suit le report (F54, F55)** : DÉTAIL ligne à
ligne, SOLDE une ligne par devise au cours moyen. Une seule réévaluation par
exercice (index unique), écarts passés sans devise.

**La provision pour pertes de change S'AJUSTE (A5, 2026-10-02).** D1 (2026-10-03) · la réévaluation se
fait à la date de CLÔTURE et à elle seule (art. 54, ch. 22 § 2.2) · `reevaluer` refuse
toute autre date (400), l'écran ne la laisse pas changer, une réévaluation passée
ailleurs est signalée (`horsCloture`), jamais retouchée. D6 · une réévaluation S'ANNULE (`POST
/devises/reevaluations/:id/annuler`, motif, journal d'audit, verrou du dossier) · au
brouillard ses écritures sont supprimées, validées elles sont inscrites en NÉGATIF
(`lignesEnNegatif`, validées, art. 22, 4° pour une période close), l'enregistrement est
MARQUÉ annulé, jamais supprimé, et l'index unique ne compte que les non annulées (NULLS
NOT DISTINCT) ; refus · exercice clos, contre-passation dans un exercice clos,
postérieure non annulée, version d'ouverture postérieure, ligne LETTRÉE ou POINTÉE (même
refus que la correction, `motifLignesTenues`, avant la transaction) ; marquée par un
`update` unitaire (journal d'audit) ; ses écritures et leurs négatifs ne sont pas
« hors réévaluation » ; toutes les lectures de « la
réévaluation de l'exercice » l'écartent. Titre VIII
ch. 22 § 2.3 (« ajustée pour tenir compte des opérations dénouées ») et fiche
du compte 19 des deux plans · seul l'ÉCART avec la provision en place se
passe, dotation de la hausse ou reprise de la baisse au compte de SA famille
(4991 · 6591 / 7591, 4997 · 6791 / 7791, 194 · 6971 / 7971 ; SYCEBNL, 194
seul). La provision en place se lit sur les écritures des réévaluations
ANTÉRIEURES, jamais sur le solde (le 4991 porte d'autres risques, et N+1
s'ouvre avant la clôture de N) ; une ligne manuelle de l'exercice sur ces
comptes est SIGNALÉE, rien retranché. Une réévaluation sans position passe
pour reprendre la provision d'une position dénouée. L'extourne ne touche que
478 et 479. DEUX DÉCISIONS DE MANASSE (2026-10-02). (1) Le 4997, doté au 6791
par le ch. 22 § 2.3, se REPREND au 7791 (fiche du compte 77, « provisions pour
risques à court terme à caractère financier ») · les fiches 49 et 679 ne le
relient à aucun des deux, ANOMALIE DU TEXTE écrite à `PROVISION_SYSCOHADA`.
(2) DOSSIER REPRIS · la provision à ajuster est celle qui EXISTE à l'ouverture
(fiche du compte 19, « réajusté » ; fiche 77, « existant au début de
l'exercice »). Le cabinet la DÉCLARE en VERSIONS DATÉES
(`ProvisionChangeOuverture`, au journal d'audit), montant et SOURCE exigés ;
l'écran PROPOSE le solde d'ouverture, jamais imposé. En place = version en
vigueur (début au plus tard la date) + réévaluations datées depuis son début.
RÉSERVE « NON DÉCLARÉE » · sans version, dès que l'à-nouveau diffère de la
part qu'expliquent les écritures de provision OmegaX antérieures à
l'ouverture (jamais « une réévaluation existe »), et une version au-delà de
l'à-nouveau créditeur est signalée. QUATRE DÉCISIONS (2026-10-02, « réfère-toi
à la loi »). (Q1) La réserve REFUSE le passage, pas le calcul (fiche du compte
19, on ne réajuste pas sans l'antérieure ; § 10 bis) · écarts 478 / 479
compris, une seule réévaluation par exercice (F54) portant les deux. (Q2) Une
version utilisée est GELÉE (art. 22, 2° ; art. 20) · la correction est une
version NOUVELLE, plus tardive, avec motif. Une version s'insère à toute date,
AVANT une autre comprise, tant qu'aucune réévaluation n'est passée dans sa
période (de sa date à la version suivante) · refuser toute insertion
antérieure enfermait N quand N+1, ouvert avant sa clôture, était déjà déclaré
et réévalué (IMPASSE, seconde relecture). L'art. 22, 3° vise les écritures,
il n'est pas invoqué. Réserve, dépassement et provision incomplète sont servis
par le serveur (`etatsOuverture`), jamais recalculés à l'écran. OUVERTURE
(quatrième et cinquième relectures) · tout à-nouveau qui n'est PAS
l'à-nouveau provisoire d'OmegaX (bilan d'ouverture importé, report de
clôture, validé ou au brouillard) est un solde comptable FIABLE et PRIME sur
la clôture précédente, quel que soit le précédent (un N-1 gardé pour les
comparatifs ne l'efface pas) ; sans lui, la provision EN PLACE À LA CLÔTURE
PRÉCÉDENTE telle que le module la calcule (version + écritures de provision
OmegaX, tous statuts), récursivement (`ouverturesDe`, `cloturesDe`) ·
l'à-nouveau provisoire, lu sur le seul livre-journal, ignore la dotation au
brouillard. La clôture précédente se lit DEUX fois, sans se confondre · le
SOLDE reconstitué (ouverture récursive et toutes les écritures de l'exercice,
tous statuts, du module ou non), qui OUVRE la réserve et BORNE une
déclaration, et la provision du MODULE (version + écritures OmegaX) · comparée
au seul solde, une provision pour litige du même compte passait pour du
change (septième relecture). Toute
ouverture sans version se confronte à la part expliquée par OmegaX, celle
d'un à-nouveau non provisoire aussi au solde reconstitué précédent (écart
nommé, un seul message quand il n'ajoute rien) · un à-nouveau entré dans N
APRÈS sa réévaluation se voit donc en N+1 (S8), et la part de change déclarée
la lève ; les messages disent les deux issues (déclarer, ou clôturer
l'exercice précédent). La réserve ou la version incohérente d'un antérieur se
disent avant « aucune position », et l'ordre dit de les régler.
UNE VERSION SE LIT ENTRE
DEUX BORNES, une seule règle pour le solde fiable, le solde reconstitué et
la provision du module (huitième relecture, `bornesDeVersion`) · PLAFOND, le
solde ; PLANCHER, le plus petit de la provision du module à la clôture
précédente (à défaut, la part expliquée) et du solde. L'aiguillage qui
jugeait chaque chemin à part est RETIRÉ · un franc passé à la main au 4991,
ou N clôturé, suffisait à faire passer une version déclarée avant la
réévaluation de N, et la perte déjà provisionnée était dotée une seconde
fois (X1 à X4). Sous le plancher, refus nommé (montants, conséquence, issues),
sauf CONTESTATION EXPRESSE de la provision du module
(`provisionModuleContestee`, case « La provision passée par OmegaX ne
correspond pas à la provision de change réelle », erreur ou reprise ou
dotation hors module, avec son propre `motifContestation`, au journal
d'audit) · le motif de CORRECTION ne l'ouvre jamais, sans quoi toute
correction d'une version utilisée, qui l'exige déjà, refaisait X1 et X3. LA
CONTESTATION EST RATTACHÉE À UN MONTANT (neuvième relecture) · le SERVEUR
fige à la déclaration la provision du module contestée
(`provisionModuleContesteeMontant`, jamais reçue du client), et le plancher
ne s'écarte que tant que la provision du module à la clôture précédente lui
reste égale · une réévaluation passée ensuite la change, refus nommé « a
changé depuis la contestation » (Y9, Y9b) ; l'écran montre la
provision du module et les bornes à côté de la version.
Le message dit quoi déclarer, jamais de retirer ; une ligne
manuelle sur ces comptes dans un antérieur ouvert est signalée ; rien ne se
préremplit hors d'un solde fiable sans réserve. ON RÉÉVALUE
DANS L'ORDRE (troisième relecture) · `reevaluer` refuse un exercice tant qu'un
antérieur ENCORE OUVERT n'est ni réévalué ni sans objet (aucune position,
aucune provision à doter ou reprendre, aucune réserve) ; un antérieur clôturé
ne bloque pas (fiche du compte 19, « réajusté à la clôture de chaque
exercice » ; même règle que la clôture). N+1 avant N dotait deux fois la même
perte. Une version hors de ses bornes refuse aussi le passage. Une
version est UTILISÉE dès qu'une réévaluation EXISTE dans sa période, sans
comparer deux horloges ; le motif n'est exigé que pour une CORRECTION (une
version qui succède à une version utilisée). Réévaluer, déclarer et retirer
passent sous un VERROU QUI NE RETIENT AUCUNE CONNEXION (`sousVerrouDuDossier`,
`VerrouProvisionChange`) · une ligne par dossier, insérée sur la clé unique
et retirée en `finally`, un second geste reçoit aussitôt un 409 ; l'échéance
ne sert qu'à reprendre la ligne d'un processus tombé. Un verrou consultatif
tenu dans une transaction ouverte figeait le pool de TOUS les cabinets. Le
409 dit le geste en cours, depuis quand, et l'échéance ; un retrait de verrou
manqué est consigné et ne masque jamais l'issue du geste.
(Q3) Sa date est le DÉBUT d'un exercice du dossier, sinon refus nommé. (Q4)
Solde d'ouverture · à-nouveau validé, sinon au brouillard (bilan d'ouverture
importé), sinon report reconstitué de N par `lireComptesDuReport`, brouillard
compris · dit « provisoire, non validé », la réserve joue sur lui.

**Écart de change RÉALISÉ (ligne A6, 2026-10-02).** AUDCIF art. 55, Titre VIII ch. 22
§ 2.3 (`reglements/ecart-change-realise.ts`). Une facture en devise se RÈGLE DANS SA
DEVISE, au cours du jour OU au débit réel en francs (le cours s'en déduit, règle de
`ligne-en-devise.ts`), jamais deviné ; plus que le dû EN DEVISE refusé. Le tiers est
soldé au COÛT HISTORIQUE avec le montant en devise, la trésorerie au payé, l'écart sur
SA ligne (« Perte de change réalisée », « Gain de change réalisé ») · commercial (40,
41) au 656 ou 756, financier (emprunts, location acquisition, 27, 481) au 676 ou 776.
UN NUMÉRO, DEUX PLANS · emprunts au 16 et 17 du SYSCOHADA, au 18 (dont 187) du SYCEBNL,
dont le 16 et le 17 sont des FONDS ; le SYCEBNL n'ouvre ni 656 ni 756 · D2 (Manasse,
« réfère-toi à la loi ») · le RÉSIDU de ses fiches 65 et 75, 658 Charges diverses et
7588 Autres produits divers, sous-comptes compris ; 651, 652, 654, 657, 659, 751, 752,
754, 7582, 7583, 759 refusés.
Comptes admis par `racinesAdmises`, recopiée à l'écran (`lib/ecart-change.ts`) et
tenue en MIROIR · le spec client rejoue les cas `CAS_ADMIS` du spec serveur ; nature non
lue, les seuls comptes de change, jamais une classe ; compte prescrit de détail et
actif, sinon ses sous-comptes offerts. LA TRÉSORERIE EN DEVISE SE DÉCLARE
(`deviseTresorerieId`) · lot à plusieurs devises, devise autre que les factures ou RIB
du journal dans une autre devise refusés (art. 57). Partiel au prorata de la devise ;
le groupe GARDE le réalisé du règlement, et soldé il porte le TOTAL
(`LettrageService.ecartCumule`). Groupe soldé en devise et non en francs · écart
PROPOSÉ au lettrage, passé au seul clic (`POST /reglements/ecart-change`, calcul rejoué),
au plus tôt à la date du dénouement, dans son exercice, hors trésorerie, groupe SOLDÉ
ou pièce retirée (409). AVEC A5 · une position ou un groupe partiel SOLDÉ DANS SA
DEVISE ne se réévalue plus (`motifPositionDenouee`, `groupesDenoues`), quel que soit le
reste du compte, lu sur ses lignes de l'EXERCICE ; D3 · c'est la CLÔTURE qui refuse
tant qu'un lettrage dénoué dans l'exercice porte un réalisé non passé (art. 55,
`ecartsRealisesNonConstates`, lu par tranches sans borne, groupes, comptes, montants
et les trois issues nommés, jamais un second passage ni un délettrage, qui ferait
glisser le réalisé au 479) ; et l'écart
est refusé (409) si la
réévaluation de l'exercice a lu le groupe (`issueReevaluationDejaPassee` · son total sur
le compte, ses lignes étant SANS devise, confronté au compte reconstitué TEL QU'IL ÉTAIT,
toutes devises, avec et sans le groupe · écritures datées et SAISIES avant elle, sauf
l'à-nouveau du début d'exercice, qui se recrée ; lignes lettrées après elle ouvertes ;
un groupe CRÉÉ après elle n'existait pas) ; sans concordance, avertissement et l'écart
passe, jamais « déjà porté ». D5 · la réévaluation GARDE son cours par devise
(`coursUtilises`, `poserCours` ne gardant aucune trace et l'écriture des écarts aucune
devise) ; la reconstitution le reprend, et un cours de sa date corrigé depuis, dans la
devise du groupe, REFUSE (409, issue · annuler, réévaluer, passer l'écart) ; une
réévaluation antérieure sans cours gardé reste à l'avertissement. La concordance avec le groupe ne refuse que si la devise
du GROUPE a une position ET un écart reconstitués non nuls, sinon rien ne s'oppose.
Aucune dispense par la date · une réévaluation datée avant le dénouement qui a lu la
facture refuse aussi. Le RÈGLEMENT en devise d'une facture qu'elle a lue est refusé (409,
`motifReglementDejaReevalue`), même filtre par devise. Le règlement en N+1 et l'écart
passé AVERTISSENT, sans refuser (`avertissementExtourneManquante`), quand une ligne
choisie ou du groupe vient d'une écriture d'À-NOUVEAU, que la réévaluation de
l'exercice qui PRÉCÈDE IMMÉDIATEMENT n'a pas été contre-passée, et qu'elle a réellement
porté cette devise sur le compte. Le refus nomme l'issue · annuler la réévaluation (D6), passer l'écart, réévaluer. D4 · un
ancien règlement partiel qui a soldé le tiers AU PAYÉ, sans ligne d'écart, est signalé
en INFORMATION (`REGLEMENT_DEVISE_SANS_ECART`, exercice ouvert, reconnaissable dans un
lettrage partiel seulement, le règlement reconnu à SA PIÈCE · 5x ou journal de
trésorerie ; acompte antérieur ou avoir · groupe écarté et compté), jamais retraité · art. 20, al. 2 et 3. Des
francs sans montant en devise sont refusés ; un lot de virements ne rappelle pas une
facture en devise. Anomalie signalée · l'art. 53 dit « charges
financières » là où § 2.3 et la fiche 656 disent exploitation.

**Créances douteuses ou litigieuses (ligne A7, relevé CPCC C3, 2026-10-03).**
Fiches des comptes 41, 49, 65 et 759 des deux plans, Guide SYSCOHADA Partie 1 ch. 6
§ 3.3 et § 3.4, Application 19 (E4 · jamais le Titre VIII ch. 15, qui porte sur
l'abandon, l'affacturage et la titrisation) (`creances-douteuses/`) · la
créance qui devient litigieuse (le client conteste) ou douteuse (il se dérobe) se
RECLASSE au 416 (D 416 / C compte du client), une ligne par créance
(`CreanceDouteuse`), MOTIF et PIÈCES exigés (fiche du 49, « élément individualisé »,
« justifier les motifs »). AUCUN POURCENTAGE PAR ÂGE · à chaque clôture le cabinet
DÉCLARE la dépréciation nécessaire, motivée, et seul l'ÉCART avec celle en place
se passe au dernier jour de l'exercice (D 6594 / C 491, ou D 491 / C 7594 ;
maintenue, la revue est gardée sans écriture). En place = revues antérieures du
MODULE, jamais le solde du 491 ; revue dans l'ordre (N+1 refusée tant que N ouvert
n'est pas revu), bornée par ce qui reste au 416 ; dotation refusée au SMT
(`motifRefusDepreciationSmt`), reprise ouverte. Perte D 651 / C 416 (fiche du 65),
recouvrement D trésorerie du journal / C 416 ; un mouvement daté avant une revue
déjà passée est refusé. UN NUMÉRO, DEUX SENS · 4161 et 4162 disent la NATURE au
SYSCOHADA (litigieuses, douteuses ; croisé, refusé), le DÉBITEUR au SYCEBNL
(E3 · fiche SYCEBNL du 41, « 4161 Adhérents cotisations litigieuses ou douteuses,
4162 Créances litigieuses ou douteuses » · 4161 pour 411, 4131, 4133, 4162 pour 412,
4132, 4138, DÉDUIT et croisé refusé ; un 413 non subdivisé reste au choix) ;
491 (4911, 4912) commun ; 6512 « Adhérents » au SYCEBNL seul. Créance en devise non
lettrée refusée (art. 54, 55), non servie. Trois tables d'acte au journal d'audit,
écritures RETENUES (`detenteurs-ecriture.ts`). RELECTURE ADVERSE (2026-10-03) ·
(B1) la CLÔTURE refuse une dépréciation en place supérieure au reste au 416 sans
revue de l'exercice (`depreciationsOrphelines`, même modèle que D3 d'A6), créances,
montants et issue nommés ; « À faire » seulement si la revue change quelque chose.
(B2) une revue s'ANNULE (art. 20, al. 2, comme D6 d'A6) · brouillard supprimé,
validée inscrite en négatif, `motifLignesTenues`, enregistrement marqué par un
`update` unitaire avec motif (3 à 500), index unique sur les non annulées (NULLS
NOT DISTINCT) ; le mouvement daté avant une revue nomme l'issue (annuler, passer,
refaire). (M2) sans à-nouveau, soldes lus sur le report RECONSTITUÉ de l'exercice
précédent, dit provisoire. (M3) créance reprise DÉCLARÉE au début d'un exercice,
sans écriture, source exigée, bornée par l'à-nouveau du 416 et du 491. (M4) au
catalogue, `B6-COTISATION-DOUTEUSE` et `B6-DEPRECIATION-COTISATION` renvoient au
module (`renvoiModule`, motif propre). (M6) gestes sous un verrou par dossier
sans connexion retenue (`VerrouCreancesDouteuses`, 409 qui dit le geste). (M9) revue
et annulation `@ReserveAuComptable()`, boutons sous `peutValider`. Une créance
revue, même annulée, ne se retire plus. (E1, décision de Manasse du 2026-10-03)
LA BASE EST LE TTC INSCRIT AU 416 · la fiche du 49 compare à la « valeur
comptable », que la fiche du 41 inscrit taxe comprise (crédit de la classe 7 hors
taxes ET du 443) ; la seule mention « hors TVA » du corpus (Titre VIII ch. 15
§ 1.3.1) vise l'ABANDON de créance. SECONDE RELECTURE (2026-10-03). (K4) UN
MOUVEMENT S'ANNULE comme une revue · brouillard supprimé, validé inscrit en négatif,
marqué par un `update` unitaire, motif ; refus · revue qui l'a compté non annulée,
exercice clos ; annulé, il sort du reste, des revues, de la clôture et des
détenteurs. (M-a) la déclaration d'ouverture se borne par l'à-nouveau MOINS ce que
le module porte déjà sur ce 416 (reste à la veille des créances reclassées avant,
déclarées comprises) et sur ce 491. (M-b) le rapprochement lit le seul 491 des
créances du module. (M-c) mouvement de l'exercice sans revue · information. (M-d)
perte et annulation `@ReserveAuComptable()`. A7 SCINDÉE (décision de Manasse du
2026-10-03, après la cinquième relecture) · A7 NE TOUCHE PLUS AU MOTEUR DE TVA
(`src/modules/tva/` identique à `main`, `EcritureService.valider` aussi). LA PERTE
PASSE AU TTC ENTIER, D 651 / C 416, TOUJOURS · aucune ligne 443, aucune
« récupération » ; la bulle `Aide` dit que la TVA d'une créance réellement et
définitivement irrécouvrable se récupère par imputation (O.-L. n° 10/001, art. 52 ;
décret n° 011/42, art. 126 et 127, duplicata surchargé) et que le cabinet la déclare
lui-même pour l'instant. Aucune vente d'origine n'est gardée (elles ne servaient
qu'à la TVA ; le 4161 / 4162 se lit sur le compte du client). LE RECLASSEMENT NE
LETTRE PAS LE 411 et n'exige aucun lettrage · lettré avec la facture, le moteur de
la TVA le lirait comme un ENCAISSEMENT (décret n° 011/42, art. 57), et la TVA d'une
prestation deviendrait exigible au reclassement (art. 25, 2°) · dit en commentaire
et dans la bulle (« ne lettrez pas la facture avec le reclassement »). La TVA des
créances irrécouvrables et l'exigibilité à l'encaissement vont à la ligne A7 bis du
suivi, avec le travail retiré et les constats ouverts. SIXIÈME RELECTURE (2026-10-03).
(B-α) UN GESTE ANTIDATÉ EST BORNÉ PAR CE QUI EST POSTÉRIEUR · un mouvement par le plus
petit du reste à sa date et du reste après TOUS les mouvements non annulés
(`resteFinalDeLaCreance` · 1 000 000, recouvrement de 800 000 au 30 juin, perte de
1 000 000 au 31 mars refusée, 200 000 admis) ; un reclassement par le plus petit du
solde du client à la date et de son solde au plus tard enregistré, brouillard compris
(chaîne de l'exercice toutes dates, et chaîne du dernier exercice du dossier). Un
dossier déjà au reste NÉGATIF n'est pas enfermé · la clôture (B1, revue ou non, dès N)
et la revue le nomment avec son issue (`motifResteNegatif` · annuler le mouvement en
trop dans un exercice ouvert ; tous dans un exercice clos, le message dit qu'aucun
geste d'OmegaX ne lève encore ce refus, la porte de régularisation restant au
suivi). (m1) la borne d'ouverture ne compte que les
créances DÉCLARÉES et celles RECLASSÉES AVANT l'ouverture. (m2) un reclassement
S'ANNULE comme une revue (brouillard supprimé, validé en négatif, `update` unitaire,
motif), refusé tant qu'une revue ou un mouvement non annulé porte sur lui ; annulé, il
ne retient plus son écriture et sort de la liste, des bornes et de la clôture. (m3)
liste des plus récentes d'abord, `tronque` et `total` le disent. (m4) le 416 du
rapprochement est celui des créances du module, comme le 491. (m5) le 491 se choisit
sous la racine de sa nature (`motifRefus491`). RELECTURES « ÉCHECS SILENCIEUX » ET
« ÉCRAN » (2026-10-03). (M1) une annulation RELIT le statut de l'écriture DANS sa
transaction et ne supprime que ce qui est ENCORE au brouillard (`deleteMany` filtré
sur le statut, une ligne et une seule, sinon 409) · validée entre-temps, elle se
relance et s'inscrit en négatif. (M2) les dépréciations orphelines se relisent DANS
la transaction de clôture ; D3 d'A6 reste lu avant, le relire dedans touchant la
lecture du report (F185). (M3) un retrait d'écriture manqué après l'échec d'un geste
est consigné avec l'identifiant de l'écriture, et l'erreur d'origine remonte. (M4) la
liste des comptes clients tronquée le dit et se restreint au début du numéro tapé
(`numero`, chiffres seuls, sinon 400). (M5) annulations listées les plus récentes
d'abord, total et `tronque`. (M6) un rapprochement non calculé sur liste tronquée se
dit, jamais lu comme un écart nul. (M7) le reclassement se borne au plus petit solde
du client sur TOUS les exercices qui finissent au plus tôt avec le sien. À l'écran ·
boutons alignés sur le serveur (reclasser, déclarer, recouvrer, retirer à
`peutEcrire` ; revue, perte, annulations à `peutValider`), modales en dialogue
(Échap par `ecouterEchap`, focus au premier champ, fermeture tenue pendant l'envoi),
réponses périmées jetées par jeton, comptes de l'annonce de la revue SERVIS
(`propositionRevue.comptes`, le 491 de la créance), date bornée à l'exercice, montant
prérempli au centime (`montantPourChamp`).

**Procès-verbal de comptage par caisse.** Le PV de campagne (CPCC, étape 2) ne porte
pas les espèces ; le § VI vise « la caisse SIÈGE, [...] la caisse AGENCE, [...] la
caisse DE SECOURS » · un PV par caisse. QUATRE REFUS : un 57 seul (un 52 se
circularise) ; signé par ceux qui ont compté ET assisté, de SA sous-commission ;
ventilation par coupure égale au total ; attestation avec signataire. Clôture
refusée tant qu'une caisse 57 à solde non nul n'a pas son PV (SOLDE NUL non réclamé,
choix écrit) ; l'écart non arbitré reste le PREMIER motif. Contenu de l'attestation
non défini · seuls existence, date, signataire. Ajouts de l'éditeur : l'HEURE, et la
VENTILATION PAR COUPURE facultative (fiche du compte 57, « le solde du compte caisse
doit toujours correspondre exactement à la somme disponible réellement »). Solde
FIGÉ sur le PV.

**Composant « révisions majeures ».** AUDCIF art. 38-2, Titre VIII ch. 5 § 1 :
amorti « JUSQU'À LA PROCHAINE RÉVISION », puis chaque révision réalisée « amorti[e]
sur la DURÉE SÉPARANT DEUX RÉVISIONS », la précédente « sortie de l'actif ».
Exemple : 190 000 000 sur six ans, révision de 10 000 000 tous les deux ans ·
structure 180 000 000 en six ans, révision 10 000 000 en DEUX. Refus d'une durée de
révision égale ou supérieure à la structure. Reconstitution, SEULE estimation
rétrospective : « PEUT ÊTRE ESTIMÉE par référence au "COÛT DE RÉVISION ACTUEL
AMORTI", COMME SI cette révision avait été réalisée à la date d'acquisition » (coût
d'AUJOURD'HUI saisi, amorti sur l'intervalle). Passé un intervalle, la DATE DE LA
DERNIÈRE RÉVISION RÉELLEMENT RÉALISÉE est réclamée, aucun modulo. Rien n'est posté
(ventilation de la valeur brute au cabinet) ; refus sur un bien qui porte DÉJÀ ce
composant. Rappel : aucune provision pour grosses réparations (ch. 5 § 1, ch. 18
§ 4.11.2).

**Amortissement aux unités d'œuvre.** AUDCIF art. 45, non exclu par l'art. 3 du
SYCEBNL (5, 8, 10 à 13, 17 al. 7 et 8, 18, 19 4e tiret, 21, 25 à 34, 49, 69, 70, 71
et 73 à 113) · aux deux. « AD = base amortissable × (nombre d'unités d'œuvre
consommées) / (total d'unités d'œuvre prévues) », le total « déterminé en fonction
de la durée d'utilité ». AUCUN PRORATA TEMPORIS (9 000 km, pas 9 000 × 3/12).
Dotation REFUSÉE sans relevé, chaque relevé avec sa SOURCE (compteur, carnet de
bord, fiche de production) ; le tableau affiche zéro à défaut ; la durée ne sert
qu'à établir le total prévu. Après dépréciation, ré-étalement en UNITÉS restantes
(Titre VIII ch. 12 § 2.4.1), le reliquat seule borne. Écart assumé avec l'arrêté
n° 013/2025 (art. 2 ; « justifiés au contrôle », art. 4). Interdits (art. 45) : le
mode par les REVENUS et l'amortissement FINANCIER · `schema.prisma` figé à LINEAIRE,
UNITES_DOEUVRE et DEGRESSIF (lot 11).

**Stocks et production immobilisée (CPCC § 8.2).** Les minorations « par absence
d'une écriture de contrepartie » ne se détectent PAS par l'absence (« solde du 72
égal à zéro » s'allumerait partout) · abstention figée. Codé, la PRÉSENCE SANS
CONTREPARTIE : `STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION` (aucun 603),
`PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION` (72 crédité, aucun 21, 23 ou 24),
`DEPRECIATION_STOCK_SANS_STOCK` (actif négatif),
`DEPRECIATION_STOCK_HORS_NOMENCLATURE`. Un numéro, deux sens : en cours de route au
38 (SYSCOHADA) et au 37 (SYCEBNL), le 38 SYCEBNL étant « DONS EN NATURE H.A.O. » et
le 37 SYSCOHADA « produits intermédiaires et résiduels » ; au 39, AUDCIF 391 à 398,
SYCEBNL 391, 392, 393, 396, 397 (ni 394, ni 395, ni 398). 39X déprécie 3X aux deux
(397 → 37), mais le 397 déprécie les produits intermédiaires d'un côté, les stocks
en cours de route de l'autre · intitulé jamais en dur. La Note 8 des associations
SYCEBNL n'a pas de rubrique « stocks en cours de route » · aucun contrôle avant
d'avoir tranché.

**Variation de stocks.** Postes RB, RD et RF (6031, 6032, 6033) et la ligne du 73
n'étaient produits par RIEN. Sur quatorze numéros du cycle, DOUZE divergent (31
« Marchandises » contre « Biens liés à l'activité », 34 « Produits en cours » contre
« Dons en nature », 37 et 38 échangés, 6031 et 6032 suivent ; une table unique
publierait la variation d'un stock que la société n'a pas) · **aucun numéro de stock
ou de variation hors de `stocks/nomenclature-stocks.ts`, et aucun sans son
référentiel.** Compte de variation IMPUTABLE : 734 et 735 sont des EN-TÊTES (7341,
7342, 7351, 7352) · forme SEMÉE à huit chiffres exigée (§ 7). Anomalies du plan non
comblées : 343, 344, 345 et 373 sans variation au 73 (ni 7341 ni 7371) · écriture à
la main. Forme BRUTE (« POUR SOLDE »). Refus : « pas encore compté » n'est pas
zéro ; stock NÉGATIF ; montant SANS SOURCE. Solde CRÉDITEUR signalé. Un refus
n'emporte pas les autres comptes. Le module PROPOSE, ne poste rien.

**Biens fongibles · trois méthodes sur cinq.** Le glossaire (AUDCIF Titre VI,
« VALORISATION DES BIENS FONGIBLES ») tranche sur le chapitre des comptes, qui
n'écrit que C.M.P. et P.E.P.S. · CINQ méthodes (coût moyen pondéré ANNUEL,
C.M.P.A.C.E., coût moyen de PÉRIODE DE STOCKAGE, P.E.P.S., D.E.P.S.), dont « le
SYSTÈME COMPTABLE OHADA EN ACCEPTE TROIS » (P.E.P.S., C.M.P.A.C.E., C.M.P. de
période de stockage), celle retenue MENTIONNÉE aux Notes annexes. **LE COÛT MOYEN
PONDÉRÉ ANNUEL EST EXCLU** (le plus répandu, et sa balance boucle), le D.E.P.S.
(L.I.F.O.) aussi, le N.I.F.O. « INACCEPTABLE » ; un test gèle la liste à trois. Les
deux premières reposent sur l'inventaire PERMANENT (CHAQUE SORTIE), la période de
stockage sur l'INTERMITTENT (STOCK FINAL). Axiome · égalité « des sorties et des
entrées EN VALEURS, dès lors que toutes les unités entrées sont sorties » · UNE
SORTIE NE PORTE JAMAIS SON COÛT, elle le calcule, et LA DERNIÈRE SORTIE PREND LA
VALEUR RESTANTE, jamais quantité × coût moyen (sinon « stock de -0,00 » ; jeu d'essai · 29 pour 7 unités, le flottant rendant
29.000000000000004). La période
de stockage N'EST PAS CALCULÉE, et c'est dit · elle suppose « la DATE D'ENTRÉE
MOYENNE du stock existant en fin d'exercice », non tenue.

**Mode de tenue des stocks · SANS valeur par défaut.**
`Tenant.methodeInventaireStocks` porte le choix des deux textes (« SOIT d'un
inventaire PERMANENT, SOIT d'un inventaire INTERMITTENT ») · présumé INTERMITTENT,
un dossier en permanent passerait deux fois sa variation ; présumé PERMANENT,
l'intermittent perdrait la proposition. Trois états · non déclaré (réserve qui cite
les deux textes), PERMANENT (RIEN à passer, renvoi à l'inventaire physique),
INTERMITTENT (proposition chiffrée). L'enregistrement REJOUE le calcul et ne poste
que sa proposition. Stock final tiré d'une CAMPAGNE D'INVENTAIRE (nommée, datée) ;
fiches d'un compte additionnées, une SEULE non valorisée le rend « pas encore
compté ». LES COMPTES VIENNENT DU PLAN, PAS DE LA BALANCE (un stock ouvert cette
année n'y a aucun mouvement). La fenêtre vit sous « Traitement », car elle PASSE UNE
ÉCRITURE (refusée sous « État > Contrôle et révision » par `chrome-etroit.spec.ts`).

**Notes de cours sur les stocks · un témoin, jamais une source**
(`docs/stocks-notes-de-cours.md`). Il **ne lève aucun refus**, pas même sur la
période de stockage. Le sous-compte **388 « Stocks provenant d'immobilisations
mises hors service ou au rebut »** est lu depuis le lot 15a · débité « par le
crédit du compte d'immobilisation concerné » (fiche du compte 38), jamais par le
603 comme l'écrit le livre ; 378 au SYCEBNL. Non codés faute de lecture · les
fiches des comptes 33, 40, 41, 60, 62 et 70 des deux textes, à lire avant toute
ligne sur les emballages.

**Le magasin et le BONI / MALI D'INVENTAIRE · un écart de QUANTITÉ, qui SE
COMPTABILISE.** `ArticleStock` et `MouvementStock` portent l'inventaire PERMANENT,
vérifié en DEUX dimensions. AUDCIF Titre VII, compte 603 · « les DIFFÉRENCES
CONSTATÉES ENTRE L'INVENTAIRE COMPTABLE PERMANENT ET L'INVENTAIRE PHYSIQUE », DÉBITÉ
des différences en MOINS par le crédit des stocks, CRÉDITÉ des différences en PLUS ;
SYCEBNL, fiches des comptes 31 à 36, BONI « par le crédit du compte 6031 », MALI
« par le débit du compte 6031 ». **L'ART. 43 NE S'OPPOSE PAS AU BONI** (deux VALEURS
du même bien, là où le boni ajoute des UNITÉS au coût d'entrée). QU'EN INVENTAIRE
PERMANENT ; « pas encore compté » n'est pas zéro (sinon un mali de tout le stock) ;
une fiche non valorisable ne se chiffre pas. Le MALI est une SORTIE valorisée par la
méthode (P.E.P.S. les couches anciennes, C.M.P.A.C.E. le coût moyen en vigueur). Le
BONI est une ENTRÉE · en C.M.P.A.C.E. l'unique valeur unitaire du magasin ; en
P.E.P.S. **AUCUNE SOURCE NE DIT À QUELLE COUCHE le rattacher**, le coût est RÉCLAMÉ
avec sa source, jamais « la couche la plus récente ». Jeu d'essai à DEUX couches de
coûts différents. « Aucune contrepartie imposée » à un manquant et refus de TOUT
excédent (art. 43) sont FAUX d'un compte de classe 3 en permanent (le manquant en
charge diverse fausse la « Variation des stocks »). `noteContrepartieManquant()` et
`motifRefusExcedent()` prennent le MODE DE TENUE et nomment les DEUX voies ·
variation pour une QUANTITÉ, dépréciation (39) pour une VALEUR à quantité égale ; la
sous-commission qualifie et décide.

**Dérive de migration · la règle voulue se DÉCLARE au schéma.** `ON DELETE RESTRICT`
sur `immobilisationPrincipaleId` et `composantRemplaceId` est écrit au schéma, sans
quoi Prisma pose `SET NULL` sur une relation FACULTATIVE (composant au bilan sans
son immeuble, trace de `renouveler` effacée) ; on n'aligne jamais la SQL sur un
défaut non voulu. `lecture-bornee.spec.ts` fait choisir la borne d'une table
nouvelle ; aucun décompte en commentaire.

LE MAGASIN NE DESCEND JAMAIS SOUS ZÉRO, ET UN MOUVEMENT FAUX S'ANNULE (2026-09-27,
audit final F133). La saisie est refusée dès qu'elle rend une sortie impossible, la
sienne ou une sortie déjà enregistrée après une sortie antidatée
(`sortiesAuDelaDuStock`, rejeu en QUANTITÉS sur la chronologie de la valorisation) ;
une fiche déjà fausse ne bloque pas ce qui la corrige. Un mouvement ne se modifie ni
ne se supprime · il s'ANNULE avec son motif, jamais dans un exercice clôturé ni s'il
servait une sortie ; annulé, il reste sur la fiche, sort de la valorisation, de la
confrontation et des détenteurs de son écriture, que la fiche nomme tant qu'elle est
au journal. UN MOUVEMENT RETIENT SON ÉCRITURE (`verifierAucunModuleNeLaTient`) ·
dénoué, il ferait un MALI D'INVENTAIRE QUI N'EXISTE PAS.

**EMBALLAGES et CONSIGNATION · les plans coïncident, sauf au bout produit.** « La
seule particularité concerne la CONSIGNATION », en miroir aux fiches des comptes 40
et 41 · créance (4094) chez le client, dette (4194) chez le fournisseur ; matériel
d'emballage (243, immobilisation), emballages commerciaux (335, stock) ; trois
dénouements (retour, conservation, déconsignation sous le prix de consignation).
Même numéro et intitulé aux deux semis · 3351 à 3358, 6081 à 6089, 6082, 6224, 6225,
4094, 4194, 243, 822, 812, 24300000, 28430000, 29430000. **LE RÔLE QUI DÉNOUE
DIVERGE** (« un numéro, deux sens ») · l'AUDCIF écrit « le crédit du compte 7074
(bonis sur cession d'emballages) » et sème `70710000` et `70740000`, son 707 étant
un EN-TÊTE en TOTAL ; le SYCEBNL écrit « le crédit du compte 707 PRODUITS
ACCESSOIRES » et n'ouvre qu'un `70700000`. Croisés, ils sont refusés à la saisie
APRÈS chiffrage (défaut du 734 et du 735) ; un test exige que ce soit le seul rôle
divergent. **Aucun numéro d'emballage hors d'une table nommée, aucun sans son
référentiel.** Les fiches écrivent « le compte 24 » et « le compte 82 », TOTAUX aux
deux plans · le module propose 243 et 822, réserve sur la ligne. LE REFUS CENTRAL
VIENT DE CE QUE LA FICHE NE DIT PAS. Le MATÉRIEL conservé va au compte 82,
« produits des cessions d'immobilisations » · c'est une CESSION (VCN au 81, bien
décomptabilisé), et « 4194 à 822 » seul le garderait AU BILAN, actif et résultat
surévalués. REFUSÉ, renvoi aux immobilisations. AUCUNE LIGNE DE TVA · aucune fiche
n'en porte et le corpus lu ne tranche pas le régime d'une consignation. Le `6588`
« Emballages à rendre perdus » du livre n'est repris nulle part (« Autres charges
diverses » au SYSCOHADA, un 658 sans subdivision au SYCEBNL) · un test gèle
l'absence du numéro ET la PRÉSENCE de la raison. UNE TABLE `Consignation` · 4094 et
4194 sont des comptes d'ATTENTE, un 4194 non qualifié à la clôture fausse le bilan ;
l'écran rend le total en attente, et **les deux sens ne s'additionnent JAMAIS**.

**Paie P0** (`docs/paie-p0-inventaire.md`). L'INPP a quatre tranches d'effectif ; la
CNSS n'a pas de plafond d'assiette mais un PLANCHER au SMIG (décret n° 18/041,
art. 8). **Retraite obligatoire** (10 % de la masse salariale, « un numéro, deux
sens ») · **4313** au SYSCOHADA (sous 431 Sécurité sociale), **4321** au SYCEBNL,
dont le 431 n'ouvre AUCUN 4313 ; jamais 432 (« Caisses de retraite » avec 4321 au
SYCEBNL, retraite **COMPLÉMENTAIRE** au SYSCOHADA). **DEUX ASSIETTES** · l'arrêté
n° 146/2018, art. 17, exclut de l'assiette sociale, pas de la fiscale, logement et
indemnité, transport, allocations familiales légales, soins de santé, frais de
voyage. Barème IRPP · marginal 40 %, impôt plafonné à 30 % du revenu imposable
(art. 118), assiette au millier inférieur, impôt arrondi selon l'art. 150.

**Séminaire CPCC sur le décompte final · la méthode, pas les chiffres.** Non repris
· l'IPR à 10 % (abrogé au 1er janvier 2026), l'ONEM à 0,2 % (0,5 % depuis le
25/09/2025, arrêté n° 028/2025, codé avec sa date d'effet dans
`correspondance-retenues.ts`), la retenue « Syndicat 2 % » (l'art. 112 FERME la
liste sans la nommer) et **« C/ 4331 INPP · C/ 4332 ONEM », faux aux DEUX plans**
(4331 « Mutuelle », 4332 « Assurances retraite »). « En cas de désaccord entre ce
fichier et un article du Code, l'article prime. » **`43340000` et `43350000` sont
ouverts aux deux semis** · l'INPP naît des art. 8 à 17 du Code du travail, l'ONEM de
ses art. 202 et suivants, sans distinguer une ASBL d'une SARL. Manques nommés en P0,
aucun comblé de mémoire · **SMIG**, **arrêté de l'art. 139** (valeur forfaitaire du
logement que l'art. 114 déduit), **arrêté INPP n° 002/CAB/MET/2025**, **convention
collective** (art. 114, préavis par catégorie).

**P1 · LE REGISTRE DU PERSONNEL** (`docs/paie-p1-registre-du-personnel.md`).
`Salarie`, `EnfantACharge`, `ContratTravail`, aucun montant. **L'article 212 du Code
du travail EST le schéma** · quinze énonciations, quinze colonnes numérotées comme
le texte, tenues par un test. Requalifications (art. 40 à 45) RENDUES avec leur
formule (« de plein droit », « est réputé »), jamais appliquées en base. **Une liste
d'exclusion se nomme par sa FIN, jamais par sa forme** · l'archive de restitution
lisait celle du journal d'audit (`motDePasse`, `estOperateurPlateforme`), et y
verser date de naissance et rémunération l'aurait VIDÉE en la disant complète. Le
plafond de l'art. 41 se compte DATE À DATE, jamais en 730 jours (5 janvier 2027 au 5
janvier 2029 · 731 jours, deux ans). « Un numéro, deux sens » · art. 37 du Code du
travail (nullité de la clause moins favorable) contre art. 37, point 4 de la loi
n° 004/2001 (60 % de main-d'œuvre locale). **L'EFFECTIF EST PROPOSÉ, JAMAIS
SUBSTITUÉ** (`Tenant.effectifPermanent`, notes 27B et 29B, part locale de
l'accord-cadre) ; part nationale NULLE si une nationalité manque.

**Un même texte, DEUX DATES** (`docs/paie-textes-recus-2026-09-19.md`). L'arrêté
INPP n° 002/CAB/MET/2025, art. 3, entre en vigueur « à la date de sa signature », le
24 septembre 2025 (`BAREMES_INPP`, audit final F110) · le 1er janvier 2026 est sa
PUBLICATION. **UNE CORRECTION FONDÉE SUR UNE CORROBORATION EST UNE RÈGLE INVENTÉE**
· le web fait naître un doute, il ne tranche pas ; on LIT le texte, sinon on
consigne le doute et **on ne touche à rien**, et **aucun test sur une
corroboration**.

**DÉCRET n° 25/22 · le SMIG.** Art. 2, 21 500 FC ; art. 3, paiement échelonné
(14 500 à partir de la paie de mai 2025, 21 500 à partir de janvier 2026), fixé
depuis le 30 mai 2025. Art. 7, multiplicateurs (6, 26, 312), **aucun taux horaire**.
Allocation familiale 1/27e du SMIG PAR ENFANT (art. 5), **contre-valeur du logement
1/5e de L'ALLOCATION, jamais du SMIG** (art. 6). Rien n'est arrondi (colonne 19 de
l'ANNEXE) ; l'annexe 1 porte 537,04 FC, soit **14 500/27** · la grille s'assied sur
le montant PAYÉ. **Une déduction tirée d'un texte PARTIEL est une règle inventée,
même quand chaque phrase citée est exacte** ; le plancher CNSS relève d'un autre
texte, la fiche en donne les deux lectures sans trancher. **GRILLE DE TENSION
SALARIALE** (art. 4) · sept catégories, dix-sept classes, du manœuvre ordinaire
(indice 100) au cadre de collaboration 4e échelon (indice 1 000), `taux = tension ×
SMIG / 100`, trente-quatre taux RECOPIÉS puis confrontés à la formule, colonnes 19
et 20 à `SMIG/27` et à son cinquième. **Une grille arithmétiquement CLOSE est une
grille correctement lue** (seul 116 × 145 donne 16 820 FC). **21 500 FC est le SMIG
DU MANŒUVRE ORDINAIRE, et de lui seul** (`bareme-smig.ts`).

**DÉCRET n° 25/21** · ajustement si l'IPC monte de 50 % ou plus (art. 5), annuel **à
partir de janvier** (art. 11), budget-type pour cinq enfants (art. 7 à 9). Art. 15 ·
**la contre-valeur du logement est une DÉFALCATION, pas une indemnité**, sur
l'INDEMNITÉ, pour cause de MUTATION ; l'arrêté de 2005, art. 10, en ouvre une autre
de même grandeur sur la RÉMUNÉRATION, logement fourni en nature, sans mutation (voir
P6). TROIS DATES · décret du 30 mai 2025, annexes du 17 septembre, publication au
J.O. du 28 octobre 2025. Le manque de l'art. 139 est RÉEL
(`docs/paie-recherche-textes-2026-09-19.md`) · la **contre-valeur du logement** du
décret n° 25/22 n'est pas la **valeur maximale de remboursement** de l'art. 139 a),
arrêté du Ministre du Travail pris après avis du Conseil National du Travail (P5).

**P1b · LE CONTRAT FACE AU MINIMUM DE SA CLASSE.** `classeProfessionnelle` (1 à 17)
vient du DÉCRET, à côté de `categorieProfessionnelle` (libre, convention hors
corpus) · les fondre servirait un barème légal sous un nom conventionnel. Le
contrôle n'est pas un avis · SMIG « SOUS PEINE DE SANCTION » (décret n° 25/21,
art. 3), NULLITÉ DE PLEIN DROIT de la clause moins favorable (art. 37 du Code du
travail). `conforme` vaut `null`, jamais `true`, sans la classe, sans la PÉRIODICITÉ
(taux JOURNALIER ; supposé mensuel, vingt-six fois trop bas), sans mois au barème,
et (audit final F226) SANS LA MONNAIE (`ContratTravail.deviseRemuneration`, nulle
par défaut, `DEVISE_NON_RENSEIGNEE`) ou HORS FRANC (`REMUNERATION_HORS_FRANC`), le
minimum du décret n° 25/22 étant en francs. La monnaie absente se COMPLÈTE une fois
et ne se change plus ; elle et la fin du contrat s'écrivent par une opération
UNITAIRE (un `updateMany` ne laisse au journal d'audit que filtre et compte). UN
MONTANT CONVENU EXIGE SA MONNAIE (2026-09-28, décision de Manasse) ·
`remunerationBase` sans `deviseRemuneration` est refusé en 400 nommé
(`MOTIF_MONNAIE_EXIGEE`, DTO et service), champ vide sans présélection ; les
contrats anciens ne reçoivent AUCUNE monnaie (l'art. 89 pose une obligation, pas un
fait), comptés sur tout le registre (`contratsACompleter`, `CONTRAT_A_COMPLETER`)
avec une ligne de l'écran Personnel. Contrat TERMINÉ jugé sur son dernier mois, EN
COURS au mois courant ; un contrat conforme cesse de l'être sans bouger (14 500 ×
26 = 377 000 en 2025, 21 500 × 26 = 559 000 en janvier 2026). **Au journal d'audit,
les deux colonnes sont ADMISES** · rétrograder une classe ABAISSE LE MINIMUM
OPPOSABLE.

**P2a · LES DEUX ASSIETTES** (`docs/paie-p2a-assiettes-et-bareme.md`). Barème et
plafond (loi n° 23/053, art. 118), déduction de la quote-part ouvrière CNSS
(art. 71) et cotisation syndicale (Code du travail, art. 112) étaient au corpus ·
**un manque se vérifie contre le corpus ENTIER.** Le plafond de 30 % (« En aucun
cas ») MORD sur le marginal de 40 % dès **77 932 800 FC** de revenu net global
annuel, seuil RECALCULÉ par le test. **DEUX LISTES, DEUX FORMES** · le Code du
travail, art. 7, point 8, sort CINQ natures de la rémunération **sans condition**
(soins de santé, logement ou son indemnité, allocations familiales légales,
transport, frais de voyage) ; la loi fiscale les fait ENTRER (art. 68) puis les
immunise **sous condition** (art. 69). La liste sociale servie au fiscal SOUS-IMPOSE
(un logement à 40 % sort de l'assiette sociale, PAS de la fiscale) ; les frais de
voyage ne sont dans AUCUN point de l'art. 69, liste fermée. **PLAFOND OU CONDITION**
· « DANS LA LIMITE DE 5 % » (art. 116, 1) et « DANS LA MESURE OÙ elles ne dépassent
pas les taux légaux » (art. 69, 1) sont des PLAFONDS (l'excédent seul repris) ;
« POUR AUTANT QUE l'indemnité de logement ne dépasse 30 % de la rémunération »
(art. 69, 8, a) est une CONDITION (tout ou rien), appliquée, l'autre lecture NOMMÉE
avec son montant ; base des 30 % au sens de l'art. 7, point 8, réserve écrite.
**ABSTENTIONS** · transport (art. 69, 8, b) et frais médicaux (art. 69, 8, c)
ATTESTÉS par le cabinet, jamais immunisés d'office ; « taux légal » des allocations
de l'art. 69, 1 (arrêté n° 137/2018 art. 3 contre colonne 19 du décret n° 25/22,
voir P5). **L'abstention fiscale n'emporte JAMAIS l'assiette sociale.**

**LA MENSUALISATION EST UNE CONVENTION DÉCLARÉE** (retenue MENSUELLE de l'art. 119,
barème ANNUEL de l'art. 118) · **on annualise le mois, on ne divise pas les
tranches**, l'ARRONDI AU MILLIER sur le revenu ANNUALISÉ (1 000 100 FC par mois font
12 001 000 FC, non 12 000 000) ; **c'est un ACOMPTE** (art. 116, art. 121). **LE
PLAFOND JOUE AVANT LA QUOTITÉ** (art. 123, « l'impôt établi par application de
l'article 118 ») ; pour l'impôt PLAFONNÉ, le plus petit des deux montants nommés, en
réserve. **PERSONNES À CHARGE PROPOSÉES, JAMAIS SUBSTITUÉES** (art. 124 ; art. 125,
situation AU 1er JANVIER) ; à défaut, ZÉRO. **NON APPLIQUÉ ET NOMMÉ** · le minimum
de l'art. 122 (1 % du chiffre d'affaires), qui ne vise PAS les salaires de
l'art. 68 ; le plancher de 2 000 FC du livre de cours, dans AUCUN article ; la
retenue LIBÉRATOIRE de l'art. 121, alinéa 2 (arrêté n° 019/2025, lu depuis la passe
F5, cours de conversion manquant). L'écran Personnel ne dit plus que le moteur
« attend des textes » · lacune déclarée à tort (§ 10 bis, comme F1, F2b, F3a).

**P2b · LES COTISATIONS, ET LE NET.** Décret n° 18/041, art. 2 à 4 · prestations aux
familles 6,5 % (employeur), pensions 10 % (5 % employeur + 5 % travailleur), risques
professionnels 1,5 % (employeur) · **DIX-HUIT POUR CENT**, 13 % patronal, 5 %
ouvrier. L'art. 5 permet de DOUBLER les risques professionnels sur DÉCISION DE LA
CAISSE, déclarée, jamais présumée. **ORDRE** · assiette SOCIALE, cotisations, puis
la quote-part ouvrière ENTRE dans les retenues de l'article 71 et ferme l'assiette
fiscale (l'inverse surestime l'impôt de 5 % de l'assiette sociale) ; le champ saisi
ne porte que les AUTRES versements de l'article 71. **SEULE LA QUOTE-PART OUVRIÈRE
SE DÉDUIT** (ce qui est RETENU). **LE NET À PAYER PART DU TOTAL VERSÉ, JAMAIS DE
L'ASSIETTE** · les cinq exclusions sont payées. **ASSIETTE** · seule la CNSS est
routée par la loi (art. 13 de la loi n° 16/009 vers l'art. 7, litera h) ; l'INPP
(« les rémunérations versées ») et l'ONEM (« la rémunération mensuelle payée »)
prennent la même par LECTURE (« rémunération » DÉFINI par le Code), réserve sur
leurs lignes, PAS sur la CNSS. **LE TAUX INPP NE SE DEVINE PAS** · NATURE de
l'employeur (public 4 %, privé 3,5 / 3 / 2 % depuis le 24 septembre 2025 ; 3 % et 3
/ 2 / 1 % avant), puis tranche d'effectif POUR LE PRIVÉ SEULEMENT (sinon 3,5 % à un
établissement public de dix agents) ; sans nature, abstention, qui n'emporte ni
CNSS, ni ONEM, ni net. **NON CALCULÉ ET DIT** · retenues de l'article 112 (avances,
indemnités de l'article 52, cautionnement, prêt, saisie-arrêt) ; QUOTITÉ SAISISSABLE
de l'article 114 (« cinq fois le salaire minimum interprofessionnel de SA
CATÉGORIE », moins le logement de l'article 139, dont l'arrêté n'existe pas). La
réserve CNSS ne cite que l'article 23, lu, jamais « l'arrêté départemental n° 0021
du 10 avril 1978 », non lu.

**LE BARÈME SE LIT AU MOIS, IL SE CALCULE SUR L'ANNÉE (2026-09-24).**
`detailMensuel` relit le verdict annuel aux tranches divisées par douze (162 000,
1 800 000, 3 600 000 FC), par un seul composant (`BaremeMensuelIrpp`) · pas un
second calcul (arrondi au millier de l'art. 118 annuel, somme des tranches égale à
la retenue au centime) ; un bulletin émis avant se relit sans le détail. **RETENUE
ARRONDIE SELON L'ART. 150 (2026-09-27, audit final F111)** · sur la retenue du mois
(l'art. 119 l'appelle IRPP), jamais sur l'impôt annuel, sur sa propre ligne, après
la somme des tranches ; un seul porteur, `fiscalite/arrondi-article-150.ts`.
**PLANCHER CNSS (2026-09-27, audit final F112)** · Décret n° 18/041, art. 8, loi
n° 16/009, art. 13, « en aucun cas » sous le SMIG, taux JOURNALIER du manœuvre
ordinaire (décret n° 25/22, art. 2), 26 par mois (art. 7) · base relevée au SMIG des
jours payés (`plancherCnss`, `joursPayes`). Abstention sous le plancher sans jours
déclarés, de mai à décembre 2025 (SMIG payé contre fixé), et hors corpus. Ni INPP ni
ONEM n'ont de plancher. LE RÉGIME DE LA RETENUE SE DÉCLARE, ET UN IMPÔT NON CHIFFRÉ
N'EST PAS ZÉRO (2026-09-27, audit final F104 à F106). `regimeSalarial` porte le
régime de l'art. 121 · forfait libératoire (personnel domestique, micro-entreprise),
retenue abstenue ; non déclaré, barème de l'art. 118 EN LE DISANT
(`RESERVE_REGIME_NON_DECLARE`). La quotité de l'art. 114 reçoit `null`, jamais zéro,
pour l'impôt ou la quote-part non chiffrés · sinon la saisie mord sur la part
protégée.

**P3 · LA PASSATION COMPTABLE** (`docs/paie-p3-passation-comptable.md`). AUCUN
NUMÉRO DE COMPTE DE PAIE HORS DE `passation-paie.ts`, ET AUCUN SANS SON RÉFÉRENTIEL.

**DIX-SEPT RÔLES, UN SEUL DIVERGE** (dix-huit avec le 78100000 des avantages en
nature, voir P9) · la retraite OBLIGATOIRE est au **43130000** en SYSCOHADA (sous
431), au **43210000** en SYCEBNL (sous 432). Le reste coïncide · 6611, 6612, 6613,
6615, 6617, 6618, 6631, 6634, 6638, 6641, 4311, 4312, 4334, 4335, 4472, 4220. **La
correction évidente est un piège** · le 432 SYSCOHADA est la retraite COMPLÉMENTAIRE
(43200000), le SYCEBNL ouvre 4321 obligatoire, 4322 complémentaire, 4328 autres ;
corriger 4313 en 432 rangerait l'obligatoire sous une nature FACULTATIVE. Un test
interdit 43200000 et 43220000, exige les divergents NON ouverts dans l'autre plan,
relit les DEUX semis (F2b). **Classe 66, absences non codées** · 666 QU'AU
SYSCOHADA, 66500000 et 66900000 QU'AU SYCEBNL ; 66330000, 66720000, 66820000 aux
deux (2026-09-30). **Faux au séminaire CPCC** · « C/ 4331 INPP · C/ 4332 ONEM »
(4331 Mutuelle, 4332 Assurances retraite) ; INPP au 4334, ONEM au 4335, gelé.
**SORTIR DE L'ASSIETTE N'EST PAS SORTIR DE LA COMPTABILITÉ** · logement et transport
(art. 7, point 8) sont PAYÉS · charge au 66310000 et au 66340000. **QUATRE NATURES
NON IMPUTÉES** · participation aux bénéfices (aucun 426 au SYCEBNL) ; allocations
familiales légales (minima dus par l'EMPLOYEUR, colonne 19 du décret n° 25/22 ; la
dévolution de l'arrêté n° 143/2018 n'est ni charge ni créance de l'employeur, aucune
fiche du compte 66 ne nomme leur compte, 2026-09-30) ; soins de santé (trois comptes
possibles) ; frais de voyage (l'art. 68, 1 renvoie à une qualification). Un test
exige que les deux tables couvrent EXACTEMENT les quinze natures.

**REFUS, BALANCE BOUCLÉE** · **COTISATION_EN_ABSTENTION** (sans nature d'employeur,
charge minorée de l'INPP) ; SOLDE DU 422 = NET (brut moins retenues), sinon REFUS,
aucune ligne de bouclage. **TROIS TEMPS, PAS UNE ÉCRITURE COMBINÉE** (2026-09-24,
Guide SYSCOHADA Partie 1 ch. 3 section 4, Application 10) · BRUT (D/66 par nature,
C/422 brut entier, § 4.1), RETENUES (D/422, C/43 part ouvrière, C/447 impôt, § 4.3
et fiche du compte 42), PATRONALES (D/6641, C/43, § 4.2). L'impôt retenu n'est PAS
une charge (aucune classe 6) ; part ouvrière et patronale, deux lignes.
`simulerPaie` · un spec gèle la PROPRIÉTÉ (aucune écriture).

**P4 · DÉCOMPTE FINAL.** Séminaire CPCC · « en cas de désaccord entre ce fichier et
un article du Code, L'ARTICLE PRIME ». **Congé** (art. 141, « au moins ») · UN jour
ouvrable par mois entier au-delà de dix-huit ans, UN ET DEMI en deçà, plus UN par
tranche de cinq années ; le séminaire (1,5, 2, 2) gonfle l'indemnité de moitié.
**Préavis** (art. 64) · QUATORZE jours ouvrables plus SEPT par année entière, sans
catégorie, le reste à un ARRÊTÉ absent (« 1 mois + 9 jours », « 3 mois + 16 jours »)
· OmegaX calcule le PLANCHER et le DIT, comme pour le congé. **LE SAMEDI EST
OUVRABLE ICI** · un préavis s'exécute entre employeur et travailleur, le Code
définit le mot (art. 7, point 9 ; repos le dimanche, art. 121 al. 2), à la
différence du guichet fiscal (décret n° 24/09) · `jour-ouvrable.ts` NE DOIT PAS être
réemployé ; l'art. 7 du décret n° 25/22 (VINGT-SIX par mois, 312 par an, RÉUTILISÉ)
le confirme. **Aucun préavis** · faute lourde (art. 72, « résilié immédiatement sans
préavis », notification écrite sous quinze jours ouvrables), force majeure, terme
d'un CDD. Démission · LA MOITIÉ (art. 64 al. 2) ; délégué syndical · LE DOUBLE
(art. 258), plancher de TROIS MOIS non converti. **UN SOLDE PARTIEL SE LIT COMME UN
SOLDE** · arriérés, moyenne des douze mois, gratification, montants sans taux
journalier valent `null`, et le TOTAL aussi ; le zéro sur faute lourde est une
RÉPONSE, avec son article. L'art. 142 convertit les avantages en nature « EXCEPTION
FAITE SEULEMENT POUR LE LOGEMENT », et l'indemnité de logement, hors rémunération
(art. 7, point 8), n'entre pas dans l'allocation de congé (2026-09-30). Commissions
et primes · MOYENNE DES DOUZE MOIS (art. 66 et 142). Non repris · l'IPR à 10 %
(ABROGÉ au 1er janvier 2026) et la « retenue syndicat 2 % » (l'art. 112 ne la nomme
pas) ; l'art. 118 vaut.

**ADDENDUM P0 · livre de cours, ch. 66** (pages 173 à 199), pas une source,
fiscalité abrogée (IBP, impôt minimum forfaitaire, acomptes de 40 % avant le 1er
août et le 1er décembre, IPR, IERE, comptes 44721 et 44722), rien repris. Retenu ·
l'ORDRE DE CALCUL (« l'IPR est calculée sur la rémunération imposable NETTE du
montant retenu pour CNSS (QPO) » · brut, assiette sociale, CNSS, assiette fiscale
nette, barème, plafond ; l'inverse surestime l'impôt de 5 %) ; les AVANTAGES EN
NATURE vont « dans les différents comptes de charges CONCERNÉS », puis en 6617 et
6627 par le crédit du 78 (comme le 637 vers le 667) ; les rémunérations dues à la
clôture par le 422 ou le 428. Barème mensuel = annuel / 12 (162 000, 1 800 000,
3 600 000 ; art. 118 · 1 944 000, 21 600 000, 43 200 000), ACOMPTE sur le revenu net
GLOBAL. Plancher « l'IPR ne peut être inférieur à 2.000 FC » · hors fichier fiscal
(plafond de 30 %), à confronter avant tout codage. Faux · saisies-arrêts (« 1/5
[...] et 2/3 ») contre l'art. 114 (un cinquième jusqu'à CINQ FOIS le minimum de la
catégorie, UN TIERS au-delà, DEUX CINQUIÈMES pour l'alimentaire) ; INPP 3 / 3 / 2 /
1 % contre 4 / 3,5 / 3 / 2 % depuis l'arrêté de 2025 ; ONEM à 0,2 %. Son journal ne
démontre pas les exclusions (transport au brut en 6638, exclu par l'arrêté
n° 146/2018).

**P5 · UN MOT, TROIS OBJETS** (`docs/paie-p5-quotite-et-livre-de-paie.md`) ·
(1) l'**indemnité de logement** (art. 138 et 7 litera h), hors rémunération, jamais
déduite de la base de l'ART. 114 ; (2) la **valeur maximale de remboursement du
logement fourni en nature** (art. 139 a), arrêté du Ministre après avis du Conseil
National du Travail), la SEULE que l'art. 114 al. 4 fait déduire ; (3) la
**contre-valeur du logement** (décret n° 25/22 art. 6, colonne 20), sur l'indemnité
POUR MUTATION (décret n° 25/21 art. 15). Confondues, la saisie mord sur la part
protégée · **une correction engage autant qu'une règle**. **Quotité** · le minimum
**INTERPROFESSIONNEL** de la catégorie est celui du décret n° 25/22 ; le module
demande la **CLASSE** (1 à 17), le premier échelon pour tous augmentant la part
saisissable. **Une règle de protection ne se tranche pas contre celui qu'elle
protège.** Cumul de l'alinéa 3 non plafonné (réserve). **ALLOCATIONS FAMILIALES ·
DEUX DÉBITEURS.** Les 8 100 FC de l'arrêté n° 137/2018 art. 3 sont « **servis
directement par la Caisse** » (art. 4 ; arrêté n° 143/2018 art. 1er ; en dévolution
la Caisse « MET À LA DISPOSITION DE L'EMPLOYEUR », art. 143/2018 art. 3 ·
l'employeur est un guichet) ; la colonne 19 du décret n° 25/22 est ce que
l'EMPLOYEUR doit, et l'art. 69, 1 immunise le « **RÉELLEMENT ACCORDÉ AUX
EMPLOYÉS** ». **Le plafond d'une immunité se lit sur le débiteur de la somme qu'il
borne** · le taux se CALCULE. Enfants BÉNÉFICIAIRES ≠ personnes à charge (droit
interrompu enfant par enfant, suspensions aux art. 5, 6 et 8 de l'arrêté
n° 137/2018, au corpus quoi qu'en disait `bareme-smig.ts`) · **un manque se vérifie
contre le corpus entier.** **ART. 103 al. 2** · sans décompte écrit remis AU MOMENT
DU PAIEMENT, « ses allégations [...] **SONT REJETÉES** » ; art. 104 · « pour solde
de tout compte » ne vaut pas renonciation. **UNE GARANTIE NÉGATIVE VIEILLIT** ·
ajouter une capacité oblige à relire les phrases qui la disent absente.

**P6 · LES DEUX ARRÊTÉS** (`docs/paie-p6-les-deux-arretes-recus.md`,
`droit-travail-congolais`) · arrêté n° 12/CAB.MIN/ETPS/042 du 8 août 2008 (livre de
paie, ART. 215) et n° 12/CAB.MIN/TPS/110/2005 du 26 octobre 2005 (logement,
art. 139). Art. 10 de 2005 · « il peut défalquer de la rémunération du travailleur
**1/5 DU TAUX JOURNALIER DES ALLOCATIONS FAMILIALES quelle que soit la catégorie
professionnelle** » = la colonne 20 (537,04 / 5 = 107,41 ; 796,30 / 5 = 159,26) ·
**deux textes, une règle · seule l'arithmétique tranche.** C'est cette défalcation
(sur la RÉMUNÉRATION, logement EN NATURE, sans mutation) que l'art. 114 al. 4 fait
déduire · la quotité est chiffrable. « Il PEUT défalquer » · l'employeur qui l'a
déjà fait le DÉCLARE, sinon double déduction. **LE LIVRE DE PAIE.** (1) « le livre
de paie **OU FICHIER INFORMATISÉ** » (art. 1er), forme admise d'office ; seul « tout
autre document » exige l'**AUTORISATION DE L'INSPECTEUR DU TRAVAIL** (art. 215
al. 2), un ACTE · « non renseignée » n'est jamais « obtenue ». (2) **TRENTE-TROIS**
mentions ; les trente de l'art. 25 de l'arrêté n° 146/2018 (« notamment ») sont
celles de la sécurité sociale. (3) Sommes · 20 (brut = 7+10+11+12+13+16+19, sans
allocations familiales, ce qui corrobore l'art. 7 litera h), 26 (= 21+22+23+24+25),
28 (jours = 6+14+17). (4) Seuil **DIX** dans l'arrêté, **VINGT-CINQ** à l'art. 215
al. 3 · UN ARRÊTÉ NE DÉROGE PAS À LA LOI, vingt-cinq gardé, réserve portée.
(5) L'art. 2 destine les deux doubles de l'art. 214 (travailleur, INSS) et exige un
décompte écrit **lors de la résiliation du contrat**. La mention 11 nomme le samedi.
**COUVERTURE NE VAUT PAS CONFORMITÉ** · la conformité AU MODÈLE ANNEXÉ, mise en
forme non vérifiable, n'est jamais certifiée ; **un refus qui survit à son motif
change de motif.** Art. 328 a) · amende « AUTANT DE FOIS QU'IL Y A DE TRAVAILLEURS
NON INSCRITS OU DE RENSEIGNEMENTS OMIS », plafond cinquante fois le taux.
**Lacunes** · l'art. 1er b) de 2005 (ration de vivres) n'est exécuté par aucun
article · l'art. 139 b) reste sans mesure, manque du droit congolais, signalé.
L'annexe de 2008 est une RECONSTITUTION (encodage décalé de +29) · NE JAMAIS EN
CITER UN LIBELLÉ COMME UNE LECTURE DIRECTE. Renvois non corrigés · « art. 323 (9) »
inexistant (2008, art. 5) ; « art. 321 (c) » d'avant 2016 (2005, art. 12) ;
« l'art. 4 alinéa 1° » pour l'art. 5, 1° (2005, art. 2, 9°). **L'arrêté INPP n'était
pas un manque** · les deux sont au corpus, gelés par deux tests (numéro manuscrit
des Finances de 2025 illisible). **AVANT DE REDEMANDER UN TEXTE, L'Y CHERCHER · une
liste de manques se relit contre le corpus, jamais contre elle-même.**

**P7 · COTISATION SYNDICALE** (`docs/paie-p7-cotisation-syndicale-et-logement.md`).
L'art. 279 · toute convention « comporte OBLIGATOIREMENT […] les modalités de
perception et de versement PAR LES TRAVAILLEURS des cotisations syndicales » · le
sujet est le TRAVAILLEUR (choix de 2002). L'art. 274 interdit de déroger à l'ordre
public, dont relève l'art. 112 (nullité, al. 1er ; sanction pénale, art. 321,
multipliée par l'art. 328 b) « AUTANT DE FOIS QU'IL Y A DES TRAVAILLEURS
CONCERNÉS ») ; l'art. 279 n'est dans aucune liste pénale · la « retenue syndicat 2
% » tombe. **La voie est une CESSION** (lecture d'éditeur · l'art. 114 régit « la
CESSION », qui consomme la quotité), **en la forme de l'AUPSRVE** (passe O4) · « que
par déclaration du cédant en personne, au greffe de la juridiction de son domicile »
(art. 205), paiement « sur production d'une copie de la déclaration de cession »
(art. 207), fin aux cas de l'art. 212 ; un écrit remis à l'employeur relève de
l'art. 112 (`RESERVE_CESSION_SYNDICALE`). Les litterae a) (taxe professionnelle) et
b) (INSS, CNSS en 2018) se lisent par équivalence · **pour un texte qui remplace,
jamais pour une retenue non prévue** (gelé). **Doctrine sur le logement** (francs du
Congo belge de 1950 à 1956, rien codé, gelé par un test) · jurisprudence (R. Lukoo
Musubao, 2006, p. 141 · verser l'indemnité acquitte l'obligation de loger) · les
branches de l'art. 138 sont ALTERNATIVES, leur cumul signalé sans refus ;
l'ORDONNANCE n° 08/040 du 30 avril 2008 (même mécanique que les décrets n° 18/017 et
n° 25/22) corrobore P6 ; l'art. 117 du Code de 1967 porte les deux conditions de
l'art. 4 de 2005. **Une doctrine n'est pas une source** · signalée, datée,
attribuée, jamais calculée. **UN TEXTE ABROGÉ N'EST UN MANQUE QUE SI LE LOGICIEL
PEUT RENCONTRER UN EXERCICE QU'IL RÉGISSAIT** · conservation de DIX ANS (art. 24 de
l'AUDCIF) ; le module ne descend pas sous INPP 14/02/2006, ONEM 17/08/2018, SMIG mai
2025, IRPP 2026 · ni l'arrêté INPP de 2003 (antérieur au 14 février 2006) ni
l'ordonnance n° 08/040 ne sont des manques. **Clé des sauvegardes** (`age`,
`CLE_AGE_SAUVEGARDES`) posée depuis le 2026-09-02
(`docs/sauvegardes-et-restauration.md`), malgré `docs/plan-ordonne-2026-09.md` · un
run vert de `sauvegarde-base.yml` l'atteste posée ET conforme. **Une ligne de plan
décrivant l'action d'un tiers se vérifie contre ce que l'action aurait changé.**

**MULTI-CLASSIFICATION · TRANCHÉ LE 2026-09-23**
(`docs/decision-multi-classification.md`) · `Compte`, `Journal`, `Immobilisation`
restent mono-classification ; IFRS est « EN SUS » (art. 73-1), la consolidation un
« retraitement des comptes individuels » (ch. XII-3). **RIEN N'ÉCRIT DANS `Ecriture`
NI `LigneEcriture` QUI NE SOIT DU RÉFÉRENTIEL LÉGAL** · une colonne de norme
imposerait de filtrer 97 lectures dans 30 fichiers, et un oubli mêlerait des
retraitements au bilan déposé ; tables à côté, qui lisent sans écrire. **I3.**
(1) **La récupération de l'ART. 52 exige la note de crédit** « annulant et
remplaçant la facture initiale » (O.-L. n° 10/001, art. 52 al. 2 ; décret n° 011/42,
art. 127, facture « barrée et conservée »), vérifiée pour les notes émises ;
montants POSITIFS, la nature porte le sens ; avoirs sans note SIGNALÉS, pas retirés.
(2) **`RolesGuard` laisse passer toute route sans `@Roles`** · **TOUTE ROUTE POST,
PUT, PATCH OU DELETE PORTE `@Roles`, OU FIGURE AVEC SON MOTIF DANS
`ecritures-reservees.spec.ts`**, route par route, jamais sur la classe. (3) **Un
total de tests qui baisse = une suite qui n'a pas tourné.** **TEMPS DE CHARGEMENT**
(`docs/temps-de-chargement.md`, allers-retours avec us-east1). (1) **Une lecture ne
porte ni `Content-Type` ni `X-CSRF-Token`** (sinon un `OPTIONS` ; le CSRF ne se
contrôle que sur ce qui modifie) · `entetes-requete.ts`, gelé. (2) **Deux appels
indépendants partent ensemble** (chaque `await` enchaîné coûte un aller-retour).
(3) **Le cache se vide par ce qui le change** (F249) · `/comptes` et `/journaux`
gardés trente secondes, vidés par leur famille et par `cache-referentiels.ts`
(tiers, import, natures, fusion de comptes) ; une route qui ouvre un compte hors de
`/comptes` s'y inscrit. (4) **Un seul rechargement par fenêtre de cinq minutes après
un déploiement** (F246, convention d'OmegaX) · marqueur daté, jamais effacé au
chargement (sinon rechargement sans fin).

**P8 · BULLETIN ÉMIS.** (1) Décompte écrit de l'art. 103, « un des doubles du livre
de paie » (arrêté de 2008, art. 2 ; `BulletinPaie`, `personnel/bulletin-paie.ts`) ·
il FIGE une simulation que le SERVEUR rejoue (jamais un montant du client ; même
corps pour simuler et émettre). Numérotation CONTINUE par dossier (art. 214),
annulés compris ; **INDÉLÉBILE** (art. 4), une erreur s'ANNULE avec motif ; remise
déclarée une fois, jamais future. Refus · montant non calculé (impôt, cotisation,
net), aucun contrat en cours (pas de repli), second bulletin actif le même mois
(LIMITE DU MOTEUR, l'art. 119 annualisant le mois · le Code dit « à chaque paie »).
(2) **`peutEcrire`** (`lib/auth.tsx`, admin ou comptable) ·
`ecriture-masquee.spec.ts` exige que tout écran qui écrit le LISE, ou `estAdmin`
s'il est réservé à l'administrateur, ou soit une exemption motivée.

**P9 · PAIE DU MOIS AU JOURNAL** (`comptabilisation-paie.ts`, trois temps, compte
par compte). (1) Rejouée sur les CHIFFRES FIGÉS, jamais sur les lignes stockées.
(2) UN BULLETIN REFUSÉ ARRÊTE LE MOIS (sinon masse salariale amputée sur une
écriture équilibrée). (3) AU CENTIME · total de bloc = somme des lignes arrondies,
écart du 422 avec les nets montré, jamais logé (jeu d'essai à DEUX bulletins).
(4) `BulletinPaie.ecritureId` (`onDelete: Restrict`) · liaison sur les seuls
bulletins libres, sinon écriture retirée ; dans `verifierAucunModuleNeLaTient`. Se
DÉFAIT au brouillard seulement (AUDCIF art. 22, 2°), par
`EcritureService.supprimer`, la paie détenteur (F107). Passé au brouillard, un
bulletin ne s'annule pas seul ; validé, il s'annule, signalé au mois. **F19, F22** ·
un bulletin en dollars se passe sur ses francs figés, relus par RANG ; l'avantage en
nature reste dans les assiettes, sort du net et du 422, quatrième temps D 6617 / C
781 (fiche du compte 66, Guide § 4.5). **Passe F5** · logement, transport et soins
FOURNIS EN NATURE (`ElementPaie.enNature`, refusé ailleurs) gardent nature et
assiettes (art. 69, 8°), même 6617 / 781 ; 30 % et taux légal des allocations sur le
TOTAL du salarié. Au fiscal, mention de l'art. 73, al. 2, 5° sauf
`CODES_HORS_ARTICLE_73_5` (liste fermée) ; le 462 débiteur d'une société SYSCOHADA
s'informe (`COMPTE_COURANT_ASSOCIE_DEBITEUR`), rien n'est chiffré. **Salaire en
dollars · décision de Manasse (2026-09-24).** Aucun texte ne fixe le cours ;
l'art. 89 (« stipulée en monnaie ayant cours légal ») est rappelé à chaque calcul.
« Le taux est le taux actuel, il faudra toujours renseigner le taux chaque jour » ·
`personnel/conversion-usd.ts` prend le cours de Devises du JOUR DU CALCUL à Kinshasa
(UTC+1), date EXACTE, jamais le dernier connu ; absent, REFUS nommé. Seuls les
ÉLÉMENTS se convertissent, avant tout calcul ; le bulletin fige le cours
(`calcul.conversion`) et la stipulation en dollars.

**Consolidation SYSCOHADA, tranche 1 · périmètre (2026-09-24).** AUDCIF art. 74 à
98, D4C ch. XII ; SYSCOHADA SEUL (l'art. 3 du SYCEBNL écarte les art. 73 à 113).
Moteur PUR (`consolidation/perimetre-consolidation.ts`) joué AVANT toute écriture
(participation croisée, total au-delà de 100 %). (1) VOTE pour le contrôle, CAPITAL
pour l'intérêt (ch. XII-5 § 3). (2) Contrôle indirect par une entité contrôlée
EXCLUSIVEMENT, intérêt par des RETENUES ; seules perte de contrôle et restrictions
sévères rompent la chaîne. (3) Contrôle de fait par les DEUX faits de l'art. 78,
conjoint par un accord, exclusion par la liste FERMÉE de l'art. 96, justifiée.
(4) L'équivalent en francs du seuil de 500 000 000 FCFA (art. 95) se déclare avec sa
source, sinon pas de dispense. L'art. 97 compte de date à date, fin de mois comprise
(30 septembre → 31 décembre). Consolidante = DOSSIER, périmètre PAR EXERCICE.
**F234** · `EXERCICE_REQUIS` (400 nommé, `common/exercice-requis.ts`),
`exigerExercice` (Prisma ignore un `id: undefined`) ; toute route lisant
`exerciceId` porte ce pipe ou `EXERCICE_FACULTATIF` (six listes, fermée par
`exercice-requis.spec.ts`). **F232** · une déclaration ne vise que les entités de
son exercice (`exerciceDuDossier`, `entiteDeLExercice`). **F235** · un nom par
exercice aux deux portes, 400 nommé. **Tranche 2 · cumul et éliminations.** AUDCIF
art. 80 à 86, D4C ch. XII-5 et XII-6 (`consolidation/cumul-consolidation.ts`).
(1) Directe généralisée au pourcentage d'INTÉRÊT, quote-part d'entrée sur la
DÉTENTRICE, égale aux paliers du § 7. (2) Réciproques éliminés sur l'AGRÉGAT, APRÈS
le partage. (3) Écart d'acquisition TOUJOURS sur un plan (art. 82) · « non limitée »
non servie, « non déterminable » = dix ans, prorata au mois. (4) Postes en CLÉS
(ECART_ACQUISITION, TITRES_MIS_EN_EQUIVALENCE…), aucun numéro inventé. (5) Coût des
titres, capitaux d'entrée, dividendes, dépréciation, réciproques se DÉCLARENT.
Refusés · entrée en cours d'exercice, IP à deux détentrices, retenue détenue par une
exclue, écart négatif d'une ME. **Résultats internes (art. 86, 4°)** ·
OBLIGATOIRES ; TOTAUX entre intégrations globales, au pourcentage de l'intégrée
proportionnellement, au PLUS FAIBLE entre deux proportionnelles (§ 5 ; le produit
est la règle de la ME, § 6, servi à tort jusqu'à la passe R4) ; perte en marge
négative ; lecture de l'art. 85 · résultat de la VENDEUSE retraité AVANT le
partage ; marge DÉCLARÉE à l'ouverture et à la clôture, nette de sa part amortie,
refusée avec une ME et au-delà du solde de l'acheteuse, facultative si négligeable
(art. 86, dernier alinéa).

**Passe R4** (`docs/releve-de-manques-referentiels.md`). (1) Contrôle de fait =
DÉSIGNATION de la majorité des organes pendant deux exercices (40 % = présomption,
art. 78) ; consolider se lit sur le CONTRÔLE, trois causes seulement exemptent
(art. 96, al. 2). (2) « PUBLIABLE » se dit du JEU (ch. XII-8 § 1) · flux, variation,
notes du D4C, variations du ch. XII-7 manquants sont des motifs
(`bilanEtResultatPubliables` pour le partiel). (3) `retraitementsNonJoues` nomme
dépréciation des titres chez la détentrice, cession interne d'immobilisation,
dividende interne NON DÉCLARÉ (`dividendesExercice` nullable). (4) REPORT VARIABLE ·
taux de N-1 apparié par dénomination, sinon avertissement ; l'écart négatif ne prend
jamais les dix ans. (5) Le module groupe ne cite ni l'ART. 107 ni le D4C à une
association (`groupe/fondement-elimination.ts`) · fiche du compte 18 au SYSCOHADA,
postulat de l'entité au SYCEBNL. **Tranche 3a · bilan, résultat, note du
périmètre.** D4C ch. XII-8 § 2, § 3, § 6 (`consolidation/etats-consolides.ts`,
`note-perimetre.ts`). (1) Résolution INDIVIDUELLE du ch. 7
(`resoudreBilanSurLignes`, `resoudreCompteResultatSurLignes`), jamais de seconde
table. (2) Compte 10 de la consolidante · capital 101 à 104 et 109, primes 105 aux
réserves, 106 en « Autres capitaux propres » ; une filiale partage TOUT. (3) Non
calculé = `null` (« dont » des corporelles, résultat par action) ; le À RETRAITER
(ch. XII-3 § 2 · écarts de conversion NON DÉCLARÉS, comptes sans poste, résultat au
13) est compté, l'état NON PUBLIABLE. (4) Comparatif = seconde consolidation PAR
CLÉ, sinon colonne VIDE avec motif, jamais la mère seule ; note · N et N-1 par
DÉNOMINATION, « NC » pour une exclue. Totaux des quatre corrigés du cours CPCC
(Bamba Makola) retrouvés · 3 255 000, 3 105 000, 4 820 000, 860 000. **Tranche 3b · flux et capitaux propres.** D4C
ch. XII-8 § 4 et § 5 (`consolidation/flux-capitaux-consolides.ts`). (1) Flux sur
MOUVEMENTS · balance à QUATRE colonnes (`null`) = tableau REFUSÉ ; canevas à six
colonnes lues à l'EN-TÊTE, refus si report + mouvements ≠ solde.
(2) `resoudreFluxSurLignes` (ch. 5). (3) Actionnaires · consolidante sur SES comptes
(`lignesConsolidante`), minoritaires par la variation de leurs intérêts, corrigée du
compte 465. (4) REFUSENT · périmètre bougé depuis N-1, capital de filiale ou titres
consolidés mouvementés, solde au 13 (lu zéro, le prix d'acquisition irait aux flux
ordinaires). (5) Consolidante au LIVRE-JOURNAL SEUL (`balance(…, false)`). Variation
· bloc N seul ; sans consolidation N-1, ni flux ni variation.

**Consolidation, tranche 4a · écarts d'évaluation et impôts différés
(2026-09-24).** AUDCIF art. 82 et 92, D4C ch. XII-3 § 3 et XII-6. Règles · (1)
l'écart d'évaluation passe « EN PRIORITÉ » (art. 82) · capitaux propres d'entrée
réestimés de chaque écart NET d'impôt différé, l'écart d'acquisition n'est que le
reste ; porté par la DÉTENUE avant partage (§ 3) ; refusé en mise en équivalence ;
affecté à un élément identifiable (2, 3, 16 à 19), jamais aux capitaux propres ;
sort DÉCLARÉ (amortissable avec son 28, non amortissable, réalisé à une date),
même règle au moteur et à la porte (`motifRefusEcartEvaluation`). (2) Aucun taux
dans le moteur · déclaré par entité avec sa source, « en vigueur à la clôture »,
la consolidante dans les faits de l'exercice. (3) Trois sources d'impôt différé ·
écarts d'évaluation (« tous », ch. XII-6 § 1), marges internes (art. 92, 2°, taux
de la VENDEUSE), décalages et déficits INDIVIDUELS déclarés en montants d'impôt ;
JAMAIS sur l'écart d'acquisition. (4) NULL N'EST PAS ZÉRO · une entité intégrée
sans réponse (un champ suffit) rend les impôts différés INCOMPLETS et l'état non
publiable ; un IDA sans motif de PROBABILITÉ est refusé. (5) Ni compensation actif
et passif, ni actualisation (« actualisation interdite ») ; au tableau des flux,
l'écart d'un STOCK sorti diminue la CAFG, sinon la baisse se lit en encaissement.

**Tranche 4b · éliminations fiscales et écarts de conversion individuels
(2026-09-24).** AUDCIF art. 86, 3°, et 92, D4C ch. XII-3 § 2, Titre VII compte 15,
Titre VIII ch. 22 § 2.3. (1) Le 15 est contre-passé SANS DÉCLARATION · « créé ou
augmenté EXCLUSIVEMENT par Dotations HAO » (851), « réduit ou annulé EXCLUSIVEMENT
par Reprises HAO » (861) ; l'exercice se lit sur 851 et 861 (au résultat), le reste
aux réserves ; impôt différé PASSIF sur son solde (« réserves non libérées
d'impôt »), et sans taux il est dit incomplet. (2) 478 et 479 sur DÉCLARATION des
soldes N-1 (actif ET passif, zéro compris), sinon « à retraiter » et non
publiable ; annulés en entier ; au résultat financier, sur sa ligne, la VARIATION
de la position latente nette ; aux réserves, la position N-1 moins la provision
d'ouverture. (3) La provision pour pertes de change SE DÉCLARE (194, 4991 ou 4997),
dotation et reprise dans SA famille (6971/7971, 6591/7591, 6791/7791,
`FAMILLES_PROVISION_CHANGE`), refusée si aucun compte ne la porte ; leurs
mouvements sortent, ceux de la provision restent. (4) Aucun impôt différé calculé
sur les écarts latents · déclaré avec ceux de l'entité. (5) Les subventions (14)
restent sur leur ligne, avec avertissement · ch. XII-3 § 2 et ch. XII-8 § 2 ne
s'articulent pas.

**Tranche 4c · conversion des entités étrangères (2026-09-24).** AUDCIF art. 87,
D4C ch. XII-4. (1) Chaque entité DÉCLARE la monnaie de sa balance, sa monnaie
FONCTIONNELLE (facteurs, § 1) · `null` n'est pas la monnaie de présentation (celle
de tenue de la consolidante, « unité monétaire ayant cours légal », art. 87) ;
sans réponse, non publiable et flux refusé. (2) Seul le cours de clôture (§ 3) ·
temporelle (§ 2) avant l'import, hyperinflation (§ 4) refusée ; actifs et passifs
au cours de clôture, 6 à 8 et le 13 au cours déclaré (moyen ou de clôture), 10 à
12 au cours HISTORIQUE déclaré en montant ; aucun cours dans le moteur. (3)
L'écart se partage au pourcentage d'INTÉRÊT et reste sur sa ligne (« Écarts de
conversion », colonne propre), jamais dans les réserves ; il suit la quote-part en
mise en équivalence. (4) L'écart d'acquisition d'une entité convertie se convertit
au cours de clôture (§ 3) via le cours d'entrée déclaré ; les réserves passées
restent à la valeur d'entrée (lecture dite). (5) Ce qui ne se sépare pas REFUSE ·
écart d'évaluation sur entité convertie ; tableau des flux (G non isolée ; sans
entité convertie, G vaut zéro et le dit). Montants déclarés ailleurs (entrée,
marges, impôts différés, 478 et 479, réciproques) en monnaie de présentation.

**IFRS, tranche 1 · situation et résultat (2026-09-25).** AUDCIF art. 73-1,
IFRS 18 seul (`src/modules/ifrs/`), décision de Manasse · obligatoire aux exercices
ouverts dès le 1er janvier 2027 (§ C1), anticipé et dit. (1) Le grand livre n'est
jamais touché (`docs/decision-multi-classification.md`) · balance légale
(`chargerLignes`, livre-journal seul), RÈGLES DE CORRESPONDANCE déclarées (le plus
long préfixe l'emporte) et RETRAITEMENTS équilibrés ; un spec gèle les fichiers
qui nomment ces tables (service IFRS, cloisonnement, aucun état légal). (2) OmegaX
n'écrit aucune règle · l'activité principale (§ 49 à 66) se DÉCLARE (absente ou
« financer des clients » · non publiable). (3) Gestion au résultat, bilan à la
situation (`motifRefusRegle`, porte et calcul) ; tout reclassement passe par un
retraitement qui porte norme et paragraphe. (4) Chaque rubrique a son paragraphe
(§ 75, § 80, § 103, § 104), charges PAR NATURE (§ 78 a), postes supplémentaires
dits (§ 24, § B78), sous-totaux du § 69. (5) Un compte sans rubrique reste sur sa
ligne, non publiable ; trois colonnes (reclassé, retraitements, IFRS) et
rapprochement du résultat et des capitaux propres. Non publiable tant que manque
l'un des états des tranches suivantes (résultat global, flux, capitaux propres,
notes, IFRS 1).

**Tranche 2 · résultat global et capitaux propres (2026-09-25).** IFRS 18 § 12 b,
§ 86 à 95, § 107 à 112. (1) L'OCI n'a aucun compte · il entre par retraitement
avec sa norme (§ B86-B87), jamais par correspondance (un solde contre un flux) ;
deux catégories (§ 88), deux postes (§ 89), nets d'impôt (§ 94 a), mention du
§ 93. (2) `SF_OCI_EXERCICE` et `SF_AUTRES_COMPOSANTES_CP` (§ 111), sans quoi une
réévaluation grossit l'actif sans contrepartie. (3) Ouverture = clôture IFRS N-1
avec SES retraitements ; effets IAS 8 jamais comptés deux fois. (4) Apports,
distributions, transferts, effets IAS 8 se DÉCLARENT
(`MouvementCapitauxPropresIfrs`, justifiés) ; le reste en « écart non expliqué »,
non publiable, comme des transferts non soldés. (5) Deux blocs · comparatif
(§ 10 f) depuis la clôture N-2, sinon non rendu ; pas d'attribution aux
minoritaires en individuel (§ 87, § 107 a).

**Tranche 4 · première application IFRS 1 (2026-09-25).** § 3 à 26, annexe A
(`ifrs/premiere-application-ifrs.ts`). (1) Déclarée · premier exercice OU états
déjà conformes (§ 4 et 5), jamais les deux ; sinon non publiable. (2) Transition =
ouverture du comparatif (annexe A, § 21) ; état d'ouverture (§ 6) = son report
à-nouveau des classes 1 à 5 projeté. (3) Ajustement de transition aux seuls
capitaux propres (§ 11), sous `aLaTransition`, jamais dans les retraitements du
comparatif ; ce qu'il laisse au bilan se REDÉCLARE. (4) Rapprochements du § 24
depuis le chiffre publié (`resoudreBilanSurLignes`) · reclassement (subvention au
14), un retraitement par ligne, méthodes avant erreurs (§ 26), reste en écart non
publiable ; § 24 b depuis le résultat net, OCI des retraitements compté. (5) Le
premier exercice part de l'état d'ouverture, jamais de la clôture N-2. Réserve ·
l'IFRS 1 du corpus précède l'annexe D d'IFRS 18 ; § 25 lu au tableau des flux.

**Tranche 3 · flux (IAS 7 modifiée par IFRS 18) (2026-09-25).**
`ifrs/flux-tresorerie-ifrs.ts`, règlement (UE) 2026/338 du 13 février 2026 (§ 64),
`docs/sources/ias7-modifie-par-ifrs18-reglement-ue-2026-338.md`. (1) Part du
tableau du ch. 5 (`resoudreFluxDetailleSurLignes`) puis reclasse ; un retraitement
ne déplace aucune trésorerie (retiré, § 20 b), et s'il la touche, non publiable.
(2) Indirecte depuis le résultat d'exploitation (§ 18 b, § 20) · la CAFG (FA),
additive, se répartit par catégorie, somme CONTRÔLÉE ; intérêts versés au
financement, intérêts et dividendes reçus à l'investissement (§ 34A), dividendes
versés au financement (§ 33A), impôts à l'exploitation (§ 35), compte sans règle à
l'exploitation. (3) Trésorerie d'IAS 7 · rubrique « Trésorerie » plus découverts
DÉCLARÉS (§ 8) ; trésorerie légale hors périmètre en investissement (§ 7) ou
financement ; rangé en trésorerie sans l'être légalement · non publiable ;
rapprochement § 45. (4) Devises et effet de change (§ 28) DÉCLARÉS
(`EffetChangeTresorerieIfrs`), sinon non publiable. (5) Exige N-1 et le
comparatif N-2 ; intérêts et dividendes au montant COMPTABILISÉ, et c'est dit.

**Tranche 5 · notes (IFRS 18 § 113 à 132, IAS 8) (2026-09-25).**
`ifrs/notes-ifrs.ts`, `docs/sources/ifrs18-notes-et-ias8-reglement-ue-2026-338.md`.
(1) Le § 113 b n'est pas servi (IFRS 7, 16, IAS 12, IAS 7 § 44A…) · non publiable
sous ce motif. (2) La conformité du § 6B (« que s'ils sont conformes à toutes les
dispositions ») n'est jamais imprimée sur un jeu non publiable · SUSPENDUE, posée
EN DERNIER. (3) Mère, continuité, méthodes, jugements, estimations, mesures de la
performance, capital, actions, dividendes proposés se DÉCLARENT (`NotesIfrs`,
`normaliserDeclarationsNotes`) ; `null` n'est pas « non » ; le capital (§ 127 b)
n'est pas remplacé par le total des capitaux propres, montré à côté. (4) Se
calculent · composition des postes, renvois du § 114, OCI (§ 109, impôt du § 93
PAR POSTE), mesures de la performance avec comparatif retrouvé par l'INTITULÉ en
N-1 (§ 124 c, § 125). (5) « Reprendre N-1 » copie sans enregistrer. IAS 8 § 6E à
6J nommé non servi.

**IFRS consolidés, C1 · situation et résultat global (2026-09-25).**
`ifrs/etats-ifrs-consolides.ts` · IFRS 18 § 76, § 87, § 104 ; IFRS 10 § 19, § 22,
§ B86 à B96 ; IFRS 3 § 19, § 32, § 34, § B63 a ; IAS 36 § 90 ; IAS 21 § 39 c,
§ 41. (1) Balance du D4C (`CumulService.cumul`) jamais recalculée, même moteur
(`construireEtatsIfrs`, `OptionsConsolidation`) ; consolidation incomplète, non
publiable. (2) Comptes selon les règles du dossier (§ 19) ; postes rangés par
OmegaX (`POSTES_RANGES`) ou DÉCLARÉS (`RegleConsolidationIfrs`,
`motifRefusRegleConsolidation`). (3) Retraitements individuels et consolidés
jamais l'un pour l'autre (`RetraitementIfrs.consolide`). (4) Part des
minoritaires DÉCLARÉE effet par effet, zéro compris, du signe de l'effet sans le
dépasser (§ B94, `motifRefusPartsMinoritaires`), refusée en individuel. (5) Écart
d'acquisition amorti (art. 82 contre § B63 a et IAS 36 § 90) et écart négatif
étalé (§ 34) non publiables sans retraitement de leur rubrique ; écarts de
conversion reclassés en OCI (tranche IAS 21).

**C2 · flux (2026-09-26).** `IfrsService.fluxConsolideDe`, IAS 7 § 28, § 33A,
§ 34A b, § 34B, § 37 à 42A (skill `ifrs`). (1) Part de
`construireTableauFluxConsolide` et garde ses refus (périmètre ou pourcentage
changé, entité convertie, balance sans mouvements), d'où la dispense des § 39 à 42
et § 42A, dite. (2) Moteur individuel sur `lignesAvecMouvements` · actionnaires lus
sur la MÈRE (FK, FM, FN), totaux (ZB, ZC, ZF, ZG) du D4C. (3) CAFG du D4C, somme
contrôlée. (4) Dividendes des mises en équivalence à l'investissement (§ 38), des
minoritaires au financement ; activité du § 34B avec eux · non publiable. (5)
Découverts selon le dossier ; devises du groupe à part
(`ParametresIfrs.tresorerieGroupeEnDevises`), effet consolidé clé `consolide` ;
déclaration partielle sans remise à null ; comparatif · consolidation N-2.

**C3 · variation des capitaux propres (2026-09-26).**
`construireVariationCapitauxPropresConsolidee`, IFRS 18 § 107 a et c iii. (1) Même
moteur (`bloc`), plus minoritaires et total des propriétaires de la mère. (2)
Attributions LUES (RN_PROPRIETAIRES, RN_PARTICIPATIONS…, RG_…). (3) Mouvements du
groupe à part (`consolide`) · dividende aux minoritaires = distribution,
`VARIATION_PARTS_INTERETS` sur sa ligne, tous deux refusés en individuel
(`motifRefusMouvementCp(m, consolide)`). (4) Comparatif depuis la clôture N-2
consolidée, sinon non rendu.

**C4 · notes et IFRS 12 (2026-09-26).** `notes-ifrs12.ts`, IFRS 12 § 7 à 13, § 18,
§ 21, § 22, B10 à B12 ; IFRS 11 § 14 à 16, § 20, § 24. (1) Notes de base
(`construireNotesIfrs`) avec les déclarations du GROUPE (`NotesIfrs.consolide`),
EN DERNIER. (2) Du périmètre · composition, pourcentages, minoritaires (100 moins
l'intérêt, 100 moins le contrôle), clôtures décalées. (3) Minoritaires par filiale
(§ 12 e et f) DÉCLARÉS, leur somme rend les totaux, l'incomplet est nommé. (4)
TOUTES les filiales à minoritaires et TOUS les partenariats (§ 4 non tranché). (5)
Coentreprise en intégration proportionnelle à retraiter, type déclaré (§ 7 c) ;
B10 b, B12 b non servis ; entités structurées (oui, non, pas encore dit)
bloquantes sur « oui » ou sans réponse.

**C5 · IFRS 1 du groupe (2026-09-26).** `IfrsService.premiereApplicationConsolidee`,
§ C1, § C4, § D16, § D17. (1) Déclaration à part (`premierExerciceIfrsConsolideId`,
`dejaAdoptantConsolide`). (2) Ouverture = consolidation de clôture précédant le
comparatif, avec ajustements `consolide` et `aLaTransition`. (3) § 24 depuis
`capitauxPropresD4c`, minoritaires compris, par `construirePremiereApplication`.
(4) `exemptionRegroupementsC1` déclarée, sinon non publiable · prise, écart
d'acquisition à sa valeur AUDCIF (§ C4 h ii), test IAS 36 (§ C4 g ii) en
ajustement. `ia1.premiereApplication` · note du § 23 à 26 au premier exercice
IFRS du groupe (audit final F233).

**Tranche IAS 21 · écarts de conversion (2026-09-26).**
`variationConversionExercice`, `OptionsConsolidation. conversionExercice`, IAS 21
§ 48, IFRS 18 § 88 à 90. (1) Reclassification, pas retraitement ·
`SF_AUTRES_COMPOSANTES_CP` vers l'OCI, retour par `SF_OCI_EXERCICE`. (2)
Différence de deux cumuls N et N-1, jamais un solde · `ecartsConversionMinoritaires`,
`ecartsConversionMe` (`OCI_R_QUOTE_PART_MEE`, § 89 a), reste sur `OCI_R_AUTRES`.
(3) Part des minoritaires = attribution (§ 41) · `nci.ociLegal` dans
`RG_PARTICIPATIONS…`. (4) Rien n'est reclassé, et c'est dit · sans N-1, entité
convertie qui SORT (§ 48), ou qui change de méthode ou de pourcentage (§ B96) ;
une ENTRÉE ne gêne pas ; `changementsDuPerimetre` relu seulement s'il y a des
écarts.

**Flux SYSCOHADA · le compte trop agrégé (2026-09-25).** Le ch. 5 lit des
subdivisions (4812, 812, 822) · un 48100000 (481, 81, 82) est TROP AGRÉGÉ, non
« non ventilé ». `comptesTropAgreges` (`subdivisionsLuesParLeTft`, zéros retirés)
le nomme à l'écran et au classeur ; OmegaX ne ventile pas (4811 contre 4812).

**Nomenclatures (2026-09-28, passe R3).** Le Titre XI ne se code pas. Code
d'activité de la NOTE 36 (six chiffres, 44 groupes), sans table de passage
(`Tenant.codeActivitePrincipale`, SYSCOHADA seul, hors liste avec avertissement,
case ZI de la Fiche 1, gabarit ETAFI) · jamais une lettre sans sa fiche (R1, R2) ;
R2 non produite (passe R2).

**Compte de résultat · RQP, TQP, XE (2026-09-27, audit final F89).** Postes du
ch. 33 imprimés non nuls seulement, sans code REF ; une référence de formule est
un MOT ENTIER (`etat-etafi.ts`). Comptes à solder nommés à la clôture seulement
(`comptesASolderALaCloture`, F92) ; situation au dernier jour admise (F90).

**Questionnaire de révision · vingt-quatre items du CPCC.** § VI et § VII, sept
rubriques, vingt-quatre questions, dix-sept impératifs, aucune découpe « par
cycle » à lui prêter. Chaque code dit son origine · « CPCC-… » mot pour mot avec
renvoi, « VMG-… » question de l'éditeur avec fondement ; décompte EN DUR, six
libellés figés, aucun VMG dans les sept rubriques. Propriétés · CHAÎNAGE (« Si
oui, une attestation a-t-elle été établie ? » ; « Si non, comment a-t-on procédé
pour la sélection des fournisseurs à circulariser ? », seule chaîne « Non →
suite ») ; POLARITÉ (seul « Y a-t-il un chevauchement avec l'exercice en cours sur
le solde d'ouverture ? » a le « Oui » pour anomalie) ; COMPOSITES (caisses siège,
agence, de secours listées à part). Refus · une DATE, un TEXTE ou un RENVOI ne se
répond pas par « Oui » ; pas de réponse orpheline ; exception sans commentaire ou
item sans réponse ne clôt pas (CPCC-PRO-6). AUCUN SEUIL (CPCC-CRE-5,
« INSIGNIFIANT ») ni pourcentage en dur. Taux sur les seules questions. Filtre de
référentiel à l'ITEM · contributions volontaires en nature (SYCEBNL) ; au
SYSCOHADA, 90 et 91 hors bilan, 92 à 99 analytique (Titre VII ch. 1), un numéro,
deux sens. Le caractère « — » de CPCC-PRO-5 est celui du texte source, comme les 97 de
`regles-comptes-sycebnl.ts` · ne pas corriger.

**Acomptes provisionnels · contre le 4492.** `acomptesVerses` se rapproche du
4492, débité des versements (Titre VII, compte 44) · `suiviAcomptes`, en rouge ;
l'art. 98 bis LPF punit d'« une amende égale à 50 % du montant de l'acompte non
versé ». Préfixe `4492`, pas `449` (4491, 4493 à 4497 · une subvention ATTENDUE
lue en acompte VERSÉ). Un excédent n'est ni remboursement ni « crédit d'impôt » ·
art. 57 ter LPF, il « PEUT, À SA DEMANDE, servir au paiement d'autres impôts et
droits dus ». Aucune amende calculée, jamais « non versé » (acte de
l'Administration).

**Charges à payer et produits à recevoir.** `TypeRegularisation` couvre aussi ce
qui n'est pas comptabilisé et appartient ENTIÈREMENT à l'exercice. Rien ne se
proratise (la charge tomberait à zéro ; deux exercices, DEUX opérations). Le sens
s'inverse · `debiteLeCompteDeGestion()` tranche les cinq types, un sixième fait
tomber un test. Contre-passation à l'OUVERTURE (fiches 40 et 41 · « À l'ouverture
de l'exercice, ces écritures sont contre-passées […] ou soldées par le compte
fournisseur à la réception de la facture »), 476 et 477 compris dans les deux
référentiels, seule la subvention pluriannuelle se reprenant à la fin (SYCEBNL,
Partie 3 ch. 6, section 1 ; corrigé le 2026-09-28 · Application 10 et Partie 3
ch. 4, section 1, `dateReprise`). Rattachement selon le tiers · 408, 418,
4286/4287, 4386/4387, 4486/4487 ; refusés · produit à recevoir sur fournisseur
(409), charge à payer sur client (419). Le 4181, un numéro, deux sens · factures à
établir au SYSCOHADA, appels de fonds au SYCEBNL (factures au 4182). Reprise =
inverse exact, lue sur `debiteLeCompteDeGestion` (audit final F66) ; l'écran sert
les cinq types, la nature du tiers et une simulation sans prorata (F67).

**Balance âgée · un périmètre, un sens.** 42, 43, 44 et 47 s'ajoutent aux 40 et
41, chacun avec sa phrase au-dessus du tableau (un solde de 42, 43, 44 au 31
décembre est normal). 443, 444, 445 et 446 ÉCARTÉS du 44 (liquidation sans
échéance). Le 47 garde tout le sens de l'antériorité (469150). `TOUS` reste 40 et
41 (6,7 s sur un million de lignes, `docs/capacite-mesuree.md`).

**Réévaluation.** L'Ordonnance-loi n° 89/017 du 18 février 1989 (art. 16 et 20,
« avant le 30 avril », 100 000 CDF par jour) est abrogée (loi n° 23/053, art. 152
point 3, effet au 1er janvier 2026, art. 153) · en vigueur « AU PLUS TARD le 30
avril » (art. 136) et « 300.000,00 Francs congolais PAR JOUR » (art. 138).
`DECLARATION_REEVALUATION_A_DEPOSER` · INFORMATION, ne CONSTATE jamais le
manquement (le dépôt est un fait externe), bornée aux exercices clos dès le 1er
janvier 2026, réserve sur les exemptés écrite (l'art. 136 vise « toutes les
entreprises » sans définir le mot ; l'ordonnance-loi abrogée visait les exonérés).
Le contrôle S'ARRÊTE AU 106, un numéro, deux sens · 1061 LÉGALE au SYSCOHADA,
« SANS DROIT DE REPRISE » au SYCEBNL ; 1062 LIBRE contre « AVEC DROIT DE REPRISE » ;
le prélèvement libératoire de l'art. 129 diffère selon légale ou libre.

**Textes abrogés (balayage du 2026-09-06).** L'art. 152 de la loi n° 23/053
abroge l'O.-L. n° 69/007, les TITRES III ET IV de l'O.-L. n° 69/009, l'O.-L.
n° 89/017 et l'O.-L. n° 13/006 ; dans `src/`, `client/src/`, `prisma/` et ce
fichier, aucun n'est présenté vivant, les art. 42 et 42 bis du 69/009 cités
(`parametres-fiscaux.ts`) nommant le régime mort. Revenus locatifs · jamais le
« décret-loi n° 109/2000 » (modificatif) ; le 20 % est à l'art. 11 de la loi
n° 83/004 du 23 février 1983, le 22 % à l'art. 11 de l'O.-L. n° 69/009 · un
numéro, deux sens, sur un ARTICLE (comme le 192, le 4181, le 1061/1062, le 38/37,
le 397 sur des comptes). L'abrogation du 69/009 est PARTIELLE · son TITRE II
(revenus locatifs, hors IRPP) SURVIT, deux tests de `retenues.spec.ts` gardent la
retenue. À signaler à Manasse · `ol-69-009-1969-impots-cedulaires-texte-origine.md`
dit « Statut : ABROGÉ » pour toute l'ordonnance, quand l'art. 152 point 2 ne vise
que « les dispositions des titres III et IV ».

**Excédent d'inventaire · l'art. 43 ne régit pas la caisse.** L'art. 43 oppose
« valeur d'inventaire » et « valeur d'entrée » DU MÊME BIEN (VALEUR) ; un excédent
de caisse est une QUANTITÉ, et la fiche du compte 57 des DEUX plans dit « le solde
du compte caisse doit toujours correspondre exactement à la somme disponible
réellement ». Aucune source ne dit quoi créditer, aucun plan n'a de compte « écart
de caisse ». `motifRefusExcedent()` nomme la tension sur un 57 et cite l'art. 43
partout ailleurs · un article cité sur le mauvais cas est plausible et faux.

**Correspondance bilan de clôture / bilan d'ouverture · DEUX exceptions.** AUDCIF
art. 34 et Titre V · SYCEBNL art. 16, 4) et cadre conceptuel § 3.3.1.2.4 ·
changement de méthode et charges ou produits antérieurs omis transitent par le
résultat du nouvel exercice. Seuls le CHANGEMENT DE MÉTHODE à impact fort
significatif et la CORRECTION D'ERREUR SIGNIFICATIVE vont aux capitaux propres,
par `EcritureService.imputerAuxCapitauxPropresDOuverture` (fenêtre Exercices,
ADMIN_CABINET seul), motif et JUSTIFICATION obligatoires (Notes annexes). Trois
refus · destination un 12 (seul report à nouveau des deux plans) ; contrepartie de
BILAN (une gestion repasserait par le résultat) ; date d'OUVERTURE. Le MONTANT
n'est jamais calculé (« de façon rétrospective, comme si la méthode avait toujours
été appliquée »). Une écriture ORDINAIRE sur le 12 boucle et rompt la
correspondance sans qu'aucun total ne bouge · `IMPUTATION_REPORT_A_NOUVEAU_NON_DECLAREE`
liste ce qui a touché le 12 hors clôture et hors exception, avec l'article du
dossier.

**Clôture annuelle · un drapeau, deux sens (2026-09-27, audit final F4, F5, F6).**
`estGenereeParCloture` marquait le solde des classes 6 à 8 ET le report
à-nouveau · `Ecriture.estSoldeDesComptesDeGestion` porte le premier. (1) La
balance a TROIS COLONNES · report, mouvement, clôture (`clotureDebit`,
`clotureCredit`), solde = les trois ; qui écrit « ouverture + mouvements =
clôture » ajoute la clôture aux mouvements. (2) Les deux écritures de clôture
entrent VALIDÉES (AUDCIF art. 22, 2°). (3) L'affectation lit le résultat en
colonne de CLÔTURE sur les 131 à 139 (`resultat-de-l-exercice.ts`), jamais en
mouvement. (4) Clôture DANS L'ORDRE · refus si un antérieur est ouvert ou un
postérieur clos. Tableau de bord hors clôture (F93) ; `e2e/tests/cloture.e2e.ts`
le prouve sur base réelle (F4 passait sous une doublure). RÉGRESSION DE (2)
(2026-09-28) · sur les TOTAUX, le compte de résultat d'un exercice clos valait
zéro, colonne N-1 du suivant comprise. Les états lisent AVANT le solde
(`avantSoldeDesComptesDeGestion`, `balance-trois-colonnes.ts`, par
`chargerLignes`), et `cloture.e2e.ts` compare au montant passé. Tout lecteur des
classes 6 à 8 passe par elle ou par la colonne mouvement, jamais par le total, et
une requête sur les lignes pose `estSoldeDesComptesDeGestion: false` (évolution
des soldes, résultat fiscal et ses retraitements, révision, contrôles du 637, du
613 et des stocks, cumuls analytiques, prorata de TVA, consolidante). Le test des
écritures de journal ne compte pas les écritures de clôture.

**Manuel des procédures et de l'organisation comptables.** AUDCIF art. 16 al. 1
(« toute entité établit un manuel décrivant les procédures et l'organisation
comptables », mis à jour, conservé autant que les états qu'il régit) ; l'art. 17,
3° y renvoie pour l'ORDRE DE CLASSEMENT des pièces. DEUX ARTICLES 16 · l'art. 16
du SYCEBNL porte la présentation des états (son 2) exige « la mise en place de
procédures nécessaires à une organisation comptable permettant un contrôle interne
fiable et le contrôle externe ») ; l'art. 16 AUDCIF, non exclu par l'art. 3 du
SYCEBNL, vaut aux deux · `sourceManuel()` écrit le chemin du dossier, un test
l'interdit dans les deux sens. `ManuelProcedures` est PAR TENANT, jamais par
exercice, une VERSION par mise à jour, jamais un écrasement. Forme et contenu non
fixés (CPCC § 0.1.4) · JSON libre, `SQUELETTE_MANUEL` propose les sept rubriques
« POUVANT y figurer », VIDES. `MANUEL_PROCEDURES_ABSENT` (avertissement),
`MANUEL_SANS_ORDRE_DE_CLASSEMENT` (information · art. 17, 3° sans objet).

**Date d'arrêté des comptes · la quatrième mention.** AUDCIF Titre IX ch. 1 § 2.4 ·
QUATRE mentions « dans chacune des pages des états financiers publiés » (nom, date
d'arrêté, période, unité monétaire), distinctes de « Exercice clos le » ; Titre
VIII ch. 31 § 1.3 · l'arrêté suit la clôture, dans la limite de quatre mois.
`Exercice.dateArreteComptes` (fenêtre Exercices, `EnteteImpression`, ligne 6 du
cartouche ETAFI) · NULLABLE sans défaut, et absente, en-tête et cartouche LE
DISENT. `DATE_ARRETE_NON_RENSEIGNEE` cite le chemin du dossier · SYSCOHADA, Titre
IX ch. 1 § 2.4 et art. 23 ; SYCEBNL, art. 23 SEUL (son art. 3 exclut 5, 8, 10-13,
17 al. 7-8, 18, 19 4e tiret, 21, 25-34, 49, 69, 70, 71, 73-113). « Dans chacune
des pages » n'est pas repris par le § 1.4 de la Partie 4 du SYCEBNL · LACUNE DU
TEXTE, non comblée ; les quatre mentions sont servies aux deux sans être dites
obligatoires des deux. Le délai de quatre mois n'est PAS un refus ; seul un arrêté
antérieur à la clôture est refusé, et null efface (§ 1.6, nouvel arrêté).

**IMMOBILISATIONS · PLAN VERROUILLÉ (2026-10-01, arrêté avec Manasse).**
`docs/plan-immobilisations-verrouille.md` fixe l'ordre des lots (défauts
d'abord), leur périmètre, la définition de fini commune et les décisions
closes D-1 à D-7 · projets de développement SANS dotation (Acte uniforme
SYCEBNL art. 7 et 9, « sans amortissement, ni dépréciation » ; Guide App. 8), usufruit dépréciable avec reprise au 7951, rebut à la valeur nette
au 81, barème proposé dans les deux sens et jamais refusé. Un lot ne
commence qu'une fois le précédent vérifié en production ; ce qu'on découvre
en route va au journal du plan, jamais dans le lot en cours. FIN DE PROJET (lot 3,
SYCEBNL Partie 3 ch. 3 § 2.5) · cession, remise gratuite, restitution, vol,
destruction ou rebut · D 162, 163 ou 164 (choisi) / C 2, jamais de 28 ni de
81 ; seule la cession ajoute son prix au 82 ; `motifRefusSortieProjet`. REPRISES
DES FONDS (lot 4) · `FONDS_REPRIS`, par référentiel · 14 au 799 aux deux ; au
SYCEBNL seul 167 au 7923 (quote-part de la dotation ET de la dépréciation,
1679 écarté), 171 au 7961 (quotité de l'amortissement, linéaire imposé au 2011),
172 pour solde au 7962 à la cession ; le 172 SYSCOHADA est une dette. SUBVENTION EN NUMÉRAIRE (lot 5, D-11 à
D-14) · le 14 de la notification n'est lié à aucun bien, le cabinet le
RATTACHE (`SubventionImmobilisation`, montant et acte), jamais au-delà des
crédits du 14 hors clôture ni de la valeur d'entrée ; reprise PROSPECTIVE
(solde non repris × dotation globale ÷ reste à amortir, égale au § 3.2 sans
événement) ; remboursement D 14 / C tiers, non versée D 6515 / C créance et
D 14 / C 799 (ch. 17 § 4.3.1, § 4.7) ; méthode du § 4.6 déclarée par dossier,
sans défaut ; au SYSCOHADA, le 4739 est le fonds global d'allocation. BARÈME ET COMPTES (lot 6, D-4) ·
`bareme-comptes-013-2025.ts` ENGENDRÉ depuis `docs/bareme-013-2025-comptes.md`,
une colonne par référentiel (2444 « mobilier de bureau » contre « sportifs »),
relu dans les deux semis ; la nature propose son compte, le compte ses
natures, jamais un refus. LEGS GREVÉ DE DETTES (lot 7, D-15, D-16) ·
SYCEBNL seul, une fiche et une pièce par bien (D 2 / C 4861 / C 167), dettes
au prorata, tout ou rien ; le 167 se reprend à la quote-part 167 ÷ valeur, et
non à la dotation entière de l'Application 5 (écart écrit dans le code). PRIX GLOBAL (lot 8,
D-17 à D-19) · une pièce par bien ; terrain et bâtiment selon l'acte, sinon
comparaison (bâtiment par différence), à défaut reconstruction (terrain par
différence, motif), jamais prorata ni forfait (ch. 11 § 1.7.1) ; ailleurs
art. 38 ; fonds de commerce au SYSCOHADA seul, stocks en ligne de classe 3,
reliquat au 21500000 ; modalité sur la fiche. PARTIE NON IDENTIFIÉE (ch. 4
§ 4.2) · détachée à sa valeur estimée (§ 3.1.2, source), amortissements au
prorata, renouvelée par le § 4.1 ; TOUT CUMUL passe par
`amortissementsHorsDotations` (sinon la structure garde la part sortie). VOIES
PARALLÈLES (lot 9, D-20, D-21) · tout modèle du catalogue qui touche un bien
porte `renvoiModule` et se refuse au serveur ; division 20 du SYCEBNL · 2902,
6952, 7952 au bien à vendre, 2901, 6951, 7951 à l'usufruit ;
`AMORTISSEMENT_IMMO_HORS_MODULE` relit les crédits du 28 hors fiche. DURÉE
NON LIMITÉE (lot 10, D-22, D-23) · SYSCOHADA seul, tout incorporel sauf ceux
que le texte fait amortir, justification exigée hors fonds commercial (présumé
non limité) ; non amorti ; bascule PROSPECTIVE à la décision
(`dateDebutAmortissement`, lu par `debutAmortissement` aux trois appels du
calcul), test de dépréciation d'abord ; dix ans au fonds commercial seul. RÉVISION DU PLAN (lot 11, D-24) · prospective par défaut, sans écriture,
le reliquat à l'ouverture de l'exercice de la décision sur la durée
résiduelle (`planDuBien`, seul lecteur) ; rétroactive en option, plan
linéaire rejoué, D 28 / C 798 pour la seule réduction du cumul
(`reprisesAmortissement`), motif exigé, avant la dotation de l'exercice.
DÉGRESSIF COMPTABLE (D-25, D-26) · SYCEBNL seul, AU TAUX DE LA LOI
n° 23/053 (art. 32 à 35, aucun taux déclaré) ; au SYSCOHADA le dégressif
reste l'option fiscale et son dérogatoire. COÛTS D'EMPRUNT (lot 13, D-27, D-28,
AUDCIF Titre VIII ch. 7) · actif qualifié (21 à 24, douze mois de
préparation ou justification), une pièce D bien / C 72 au SYSCOHADA, C 787
au SYCEBNL (fiches du compte 67), qui n'admet que l'emprunt exclusivement
affecté ; plafond des 671 et 672 de l'exercice ; jamais sur un bien doté ni
après la mise en service. EN COURS (2026-10-01, Manasse) · case « Pas encore
mis en service » DÉCOCHÉE par défaut ; cochée, compte définitif ET 2x9 de la
division (`immobilisation-en-cours.ts` · 219 à 249 aux deux ; au SYCEBNL,
219 et 229 par décision de Manasse, ses fiches 21 et 22 taisant le virement),
présélection au seul 249 du SYCEBNL (« mêmes subdivisions que 241-248 ») ou
candidat unique ; la mise en service passe D définitif / C en cours, retenue ;
tout lecteur du compte du bien passe par `compteInscritALaDate` (écritures du
module, deux tableaux, NOTE 1 des deux SMT, fiches d'inventaire), y compris le
reclassement antidaté ; mise en service refusée avant la fin d'une
incorporation de coûts d'emprunt (ch. 7 § 2.2.3, jumeau de l'autre sens).
Non comblé · virement de la dépréciation 29x9 à l'achèvement (aucun texte).
LA MISE EN SERVICE EST UN VIREMENT DE POSTE À POSTE (D6, 2026-10-01) · reconnue
par la LIAISON (`ecritureMiseEnServiceId`, `virements-mise-en-service.ts`),
jamais par le compte ni le libellé, elle sort des acquisitions et des cessions
des notes 3A et 3B (SYSCOHADA), 5B et 3A (SYCEBNL) vers leurs colonnes
« Virements de poste à poste », D inchangé ; 5C et 3B des locations n'en ont
pas, elle y reste en B ; au TFT SYCEBNL, FI retranche le crédit lié du 219 et
du 229 (le 239 et le 249 l'étaient déjà). La nature du barème POSE son compte
unique (`compteSelonNature`). RÉÉVALUATION (lot 14, D-29 à D-44 proposées) · une
opération à la clôture sur L'ENSEMBLE des 22 à 24, 26 et 27 (rien écarté en
silence), coefficient déclaré plafonné par la valeur actuelle (k'), écart au
106 du sens de CHAQUE plan ou au 154 (amortissables, neutralité déclarée)
repris au 861, plan reparti de la valeur réévaluée ; son écriture, reconnue par
sa LIAISON, est écartée des contrôles « hors module » (`reevaluationBilan:
null`), des acquisitions des tableaux des flux (FI et FJ, FG et FH,
`mouvementsDeReevaluation`) et des notes 3A, 5A, 5B (colonne `REEVALUATION`) ;
bien en cours réévalué à son compte inscrit, éléments monétaires du 27 gardés.
PETITS MANQUES (lot 15a) · RENTE VIAGÈRE et
REDEVANCES, SYSCOHADA seul (`acquisition-prix-aleatoire.ts`, route
cloisonnée) · valeur déclarée avec son fondement et sa source, dette au 1681
(bouquet en trésorerie) ou au 4811 ; le solde (décès, fin des redevances) se
calcule sur la dette CAPITALISÉE de la fiche et les versements DÉCLARÉS, jamais
sur le solde d'un compte que d'autres dettes partagent, qui la BORNE seulement
(refus au-delà de son solde créditeur, à-nouveaux exclus) · D 1681 / C 841, ou
831 / 841 pour l'écart, une fois, écriture retenue. Au SYCEBNL, un numéro, deux
sens · son 168 est un FONDS (« Autres fonds affectés »), aucun 1681, refus
nommé. RÉSERVE DE PROPRIÉTÉ · information de fiche, aux deux, déduite d'une
dette au 4816 et jamais contredite par elle ; ni sur un bien sorti, ni de
façon à changer la liste d'un exercice clos. MATÉRIEL RÉCUPÉRÉ · 388 au
SYSCOHADA, 378 au SYCEBNL (`STOCK_PROVENANT_D_IMMOBILISATIONS`, nomenclature
des stocks), « par le crédit du compte d'immobilisation », jamais au-delà de la
valeur nette (aucun compte pour l'excédent).

**Approche par composants.** Un composant est une immobilisation à part entière
rattachée à son principal (`Immobilisation.immobilisationPrincipaleId`), avec son
PROPRE plan (AUDCIF ch. 4 § 1). L'opération unique `renouveler` sort la VCN de
l'ancien au 812 (654 en cession courante) et porte le remplaçant au même
principal (§ 4.1) · sans le lien, deux ascenseurs au bilan, balance bouclée. NE
PAS HARMONISER · le SYCEBNL ferme sa liste (« la décomposition N'EST AUTORISÉE
QUE POUR ») ; l'AUDCIF donne la même « par exemple » et exclut nommément
matériels informatiques, véhicules de tourisme, matériels et mobiliers ; chaque
refus cite SON texte. Seul refus mécanique · le 2442, isolé par les deux plans
(tourisme et matériel industriel partagent le 245 et le 241). Durées d'utilité
distinctes, caractère significatif, statistiques sont demandés PAR ÉCRIT. Pièce
de SÉCURITÉ amortie dès l'acquisition du principal (contrôlé) ; de RECHANGE à son
intégration (non contrôlé, et dit). Pas de valeur résiduelle, sauf pour le
DERNIER renouvellement avant la fin d'utilisation de la structure (§ 3.3, § 4.3).

**Dépréciation des immobilisations (depuis le 2026-09-03).** SYCEBNL, fiche du
COMPTE 29 · AUDCIF art. 46 et Titre VIII ch. 12 (l'art. 46 n'est pas exclu par
l'art. 3 du SYCEBNL). Ferme ce que `DEPRECIATION_IMMO_HORS_MODULE` signalait ·
(1) LE PLAN SE RÉ-ÉTALE sur la durée RESTANT À COURIR après une perte de valeur
(ch. 12 § 2.4.1, chiffré au § 2.3.2 : 1 200 000 et non 2 000 000), et seulement
alors ; (2) LA SORTIE SOLDE LE 29 PAR SA REPRISE, et le 81 reçoit la valeur
d'entrée diminuée des seuls AMORTISSEMENTS · la fiche du 81 exclut les
dépréciations (« → 29 ») et, bien non amortissable, porte la valeur d'entrée
« sans déduction des éventuelles dépréciations » (corrigé le 2026-09-30). Ni le
montant ni l'indice ne sont décidés · § 2.1, « s'il n'existe pas d'indice de
perte de valeur, aucun test n'est requis » ; l'indice est saisi
(`DepreciationImmobilisation.indice`). Seul contrôle de compte · le préfixe
**29**, hors 39 stocks, 49 tiers, 59 trésorerie. Le contrôle 15 retranche ce que
le module a posté. PLAFOND DE REPRISE (lot 12, § 2.4.2) · le plus bas du
cumul inscrit et de l'écart avec la valeur SANS DÉPRÉCIATION, le MÊME moteur
rejoué exercice par exercice dépréciation nulle
(`plafond-reprise-depreciation.ts`, `plafondRepriseDe`), comparé en fin
d'exercice dotation comprise, passée ou due ; jamais une soustraction (après
une perte l'annuité baisse) ; sans dotation, le plafond est le cumul.

**Acomptes provisionnels.** Art. 57 bis LPF, TEL QUE MODIFIÉ par la loi de
finances n° 25/060 du 29 décembre 2025 · au plus tard les 25 juillet, 25
septembre et 25 novembre ; ne pas « rétablir » la rédaction de 2023 (« avant le
1er août, avant le 1er octobre, avant le 1er décembre »). Base · « l'impôt
déclaré au titre de l'exercice précédent, AUGMENTÉ des suppléments éventuels
établis par l'Administration des Impôts […] que ces sommes fassent ou non
l'objet de contestation ». Le supplément, qu'aucun solde ne porte, se saisit
(`DossierFiscalExercice.supplementsAdministration`) et n'entre QUE dans la base
des acomptes du prochain exercice · imputé sur l'impôt de l'exercice, il se
paierait deux fois ; omis, les acomptes sont sous-évalués.

**Retraitements fiscaux · le logiciel se souvient, il ne qualifie pas.**
`catalogue-retraitements.ts` refuse de qualifier une charge par son numéro (le
6582 « Dons » est déductible ou non, art. 44) · règle NON DÉFAITE.
`Compte.codeRetraitementFiscal` garde la décision du CABINET sur son sous-compte,
REPROPOSÉE chaque exercice avec montant et article, jamais inscrite d'office. Un
compte plafonné ne propose que l'EXCÉDENT.

États financiers et notes annexes · un écran par référentiel derrière
l'aiguillage ; seules les aides techniques sont partagées
(`etats-financiers.communs.ts`, `note-annexe.types.ts`,
`components/NotesAnnexesRendu.tsx`), aucun poste, compte ni libellé.

**Longueur de compte paramétrable.** `Tenant.longueurCompte` (« modifiable après
coup (`TenantService.modifierParametres`) mais jamais en dessous de la longueur
du plus long numéro de compte déjà créé ») était figé à 8 faute de route. C'est la
longueur MAXIMALE des numéros que le cabinet ouvre (10 ou 12 possibles) ; le plan
NORMALISÉ semé garde ses huit chiffres, littéraux contre lesquels sont écrits les
tables de correspondance (bilan, résultat, flux, notes, SMT) et le routage de la
TVA. Élargir ne renumérote RIEN (dit à l'écran, gelé mot pour mot). PLANCHER · le
plus long numéro déjà ouvert, le refus le nommant ; lu sur la LONGUEUR, jamais
sur un `orderBy` SQL (« 9 » passe après « 41100000 », plancher 1). Plage 3 à 13
(skill `sage-i7`, DTO de création). UN SEUL CALCUL, `plancherLongueurCompte`,
pour la lecture et l'écriture. Doublures Prisma complétées, jamais contournées.
L'échéancier ONEM rend la PROCHAINE occurrence (déclaration le 10 du mois
suivant, versement le 15) · son test porte une date de référence fixe.

**Modales hors de l'écran par le haut.** (1) BLOC CONTENEUR · `position: fixed`
se résout sur un ancêtre portant `filter`, `backdrop-filter`, `transform`,
`perspective` ou `contain: paint` ; sous la barre `backdrop-blur-md`, `inset-0`
valait 26 px et `items-center` centrait la calculette de 302 px dessus (viewport
1280 × 800, **sommet à -105 px** contre 249 px) · le commentaire de `MenuBar` ne
nommait que le contexte d'empilement. (2) HAUTEUR NON BORNÉE · 1 200 px sur 800
centrés commencent à **-200 px** ; bornés à `calc(100dvh-2rem)` avec défilement
interne, à 16 px. `components/PortailModale.tsx` porte la modale dans le
`<body>` ; retirer le flou est REFUSÉ (le prochain `transform` rouvrirait le
trou). `modales-dans-l-ecran.spec.ts` recense les voiles `fixed inset-0`, exige
une borne de hauteur, refuse un voile non porté sous une barre floutée, et
vérifie que le recensement trouve encore quelque chose.

**Taux de TVA par défaut dans la grille.** La règle vit dans `lib/tva-saisie.ts`,
appelée par la grille et la modale « Achat / Vente avec TVA » ; un test refuse
qu'un écran refasse le routage (leçon de `calculerPropositions`). Le compte de
taxe est ROUTÉ selon la contrepartie (transport 4453, service extérieur 4454,
prestation vendue 4432 · le 16 % ne se calcule plus de tête), JAMAIS deviné · un
taux sans compte le dit et s'arrête. LA FAMILLE SE LIT SUR LA NATURE DE LA
CONTREPARTIE, PAS SUR LE SENS · un avoir fournisseur crédite une charge, et le
sens aurait posé la contre-taxe en 443 « TVA facturée sur ventes » (charge →
445 récupérable, produit → 443 facturée ; le sens dit poser ou reprendre). La
ligne au TAUX ZÉRO doit exister (art. 43 de l'O.-L. n° 10/001 · les exportations
entrent au numérateur du prorata) ; taux nul et taxe nulle faute de base ne se
confondent pas. LE TAUX EST PORTÉ PAR LA LIGNE DE TVA, JAMAIS PAR LA LIGNE HT ·
`TauxTvaService.declaration` lit un `tauxTvaId` ET un compte 443 ou 445. La
proposition se retrouve par son indice ET son compte. **RÉVISÉ LE 2026-09-25 ·
TROIS RÉGIMES** (Sage i7 · « le calcul de la taxe ne peut se faire que dans un
journal de type achat ou vente »), `modeCalculTva` · AUCUN hors journal d'achats
ou de ventes ; AUTO pour un dossier DÉCLARÉ assujetti (`Tenant.assujettiTva`,
faux par défaut), ligne ajoutée d'office, ANNONCÉE avec son montant,
supprimable ; PROPOSE sinon (clic attendu · une taxe d'office passerait
inaperçue chez une association exonérée). `netAPayer` pré-remplit, au choix d'un
tiers en journal d'achats ou de ventes, le montant qui solde la pièce, 408, 409,
418 et 419 exclus.

**Exclusion de relance par tiers (« Hors rappel/relevé »).** ELLE PORTE SUR LE
COURRIER, JAMAIS SUR LA CRÉANCE · le tiers reste à la balance âgée, à la note
des créances, au contrôle d'ancienneté, au report à-nouveau Détail et au
lettrage ; la position reste montrée, dite exclue, case désactivée, niveau nul
(sinon créances minorées et exclusion impossible à lever). MOTIF EXIGÉ, DATE
POSÉE PAR LE SERVEUR (non antidatable) ; la levée EFFACE motif et date. LE REFUS
VIT DANS LE SERVICE (§ 6) et SAUTE le tiers sans lever ; le compte rendu le dit,
même quand la sélection ne portait que des exclus.

**Relances · chaque état ses niveaux, ses dates et ses relances (2026-09-27,
audit final F166 à F169).** `{date}` est le jour du COURRIER, `{echeance}`
l'échéance la plus ancienne des lignes réclamées. Un état ne suggère que SES
niveaux ; un compte sans rien à réclamer revient en `sansObjet`. Le retard
préventif part de -Infinity (sinon toute échéance future atteignait -7 jours).
Ne comptent que les relances postérieures à la plus ancienne PIÈCE ouverte (pas
à son échéance), lues sur les seuls comptes retenus.

**L'émission des relances n'envoie rien (2026-09-28, audit final F241).**
Sélection bornée à 500 comptes sans doublon (DTO et service). Relances et
lettres dans UNE transaction, sous `pg_advisory_xact_lock` par dossier, par
insertions groupées (`CourrierService.ecrireEnFileSansTenter`, contrôles
partagés avec `mettreEnFile`), EN_ATTENTE ou SANS_TRANSPORT ; remise par la
reprise bornée (`POST /courrier/reprendre`), enchaînée par Rappel et relevé. Une
lettre de même compte, niveau et jour de Kinshasa, en file ou partie, n'est pas
réécrite (`dejaEmises`) ; une relance du jour sans lettre ou à lettre abandonnée
ne bloque rien. Jour tranché par `jourDeKinshasa`. `mettreEnFile` reste la voie
des messages isolés.

**Une ligne lettrée l'est aussi dans un groupe PARTIEL (2026-09-27, audit
final F50).** `lettre` n'est servie qu'au groupe soldé ; toute garde passe par
`estTenueParUnLettrage` (`lettrage/ligne-lettree.ts`), qui lit aussi
`lettrageId`, son type exigeant les deux champs · sinon une facture payée à
moitié se modifiait, supprimait, corrigeait ou réimputait.

**Pré-lettrage · « l'une propose, l'autre confirme ».** « Un rapprochement par
montant est une PRÉSOMPTION DU LOGICIEL » (`OrigineLettrage`) · même division du
travail que le double regard (§ 10 ter). `calculerPropositions` porte les quatre
passes (référence de pièce, paires exactes, N-pour-1, N-pour-M) ;
`lettrageAutomatique` pose, `preLettrage` propose, un test compare les deux. LA
PROPOSITION N'EST PAS STOCKÉE (elle réserverait ses lignes par `lettrageId` et
périmerait). La confirmation rejoue `verifierLignes` et REFUSE tout groupe dont
le solde n'est pas nul. L'ORIGINE PROPOSÉE EST CONSERVÉE (`AUTOMATIQUE_MONTANT`
reste tel une fois confirmé) ; `MANUEL` est refusé à cette porte. Cases
DÉCOCHÉES ; l'état compte ce qu'il n'a PAS rapproché.

**Palmarès des comptes et analyse des journaux.** Sage n'en donne que le NOM ·
définition d'OmegaX, dite à l'écran ; ni états financiers ni documents déposés.
Le PALMARÈS classe sur le MOUVEMENT, jamais sur le solde ; report à-nouveau
EXCLU ; PART CUMULÉE sur le périmètre entier, pas sur la tranche (le dernier rang
atteindrait 100 %) ; CLASSE toujours affichée. L'ANALYSE DES JOURNAUX ne rend
AUCUN contrôle d'équilibre (vrai par construction, absence figée). Elle rend le
brouillard par journal (AUDCIF art. 22, 2°, « au terme de chaque période qui ne
peut excéder un mois »), ce que la clôture a posé, et les TROUS DE LA SÉQUENCE
DES NUMÉROS DE PIÈCE, par mode (`journaux/sequence-pieces.ts`, § 10 bis) ·
**CONTINUE_JOURNAL** par journal sur l'exercice ; **CONTINUE_FICHIER** sur le
DOSSIER (achats 1, 3, 7 et ventes 2, 4, 5 sont parfaits ensemble), la synthèse ne
mêlant que ces journaux ; **MENSUELLE** par journal + mois (l'union annuelle
{1, 2, 3} MASQUE le 2 manquant de février) ; **MANUELLE** · rien. La séquence
ne commence pas forcément à 1 (dossier repris en cours d'année).

**Rubriques budgétaires.** Une section TOTAL (`SectionAnalytique.type`, « ne sert
qu'à regrouper ses sections de même racine DANS LES ÉTATS ») ne reçoit ni budget
(`doterBudget`) ni ventilation (`ventiler`). `analytique/rubriques-budgetaires.ts`
sert la balance analytique, l'état budgétaire (qui l'écartait par
`type: DETAIL`) et le tableau officiel d'exécution (qui la gardait à zéro ; le
guide veut « suivant la NOMENCLATURE BUDGÉTAIRE DU PROJET ») · une rubrique
agrège les sections DÉTAIL dont le CODE COMMENCE PAR LE SIEN (§ 7). À NE PAS
« CORRIGER » · les rubriques s'EMBOÎTENT (111 dans 11 ET dans 1) ; préfixe de
CHAÎNE (« 1 » absorbe « 10 » ; codes de longueur fixe pour l'éviter). LE TOTAL
GÉNÉRAL NE SOMME QUE LES FEUILLES (sinon le DOUBLE sur deux niveaux). « Hors
budget » ne vise que la FEUILLE mouvementée non dotée, jamais la rubrique. Export
· total nommé feuille par feuille dès qu'une rubrique existe, `SUM(C9:C22)` sur
la grille VIERGE (une ligne insérée y reste comptée).

**Tableau emplois ressources · trois colonnes.** « REF | DESIGNATION | SOLDE
CUMULE DEBUT EXERCICE N | EXERCICE N | SOLDE CUMULE FIN EXERCICE N » (SYCEBNL,
Partie 4 ch. 3, Section 1) · un projet se finance sur une CONVENTION (le
bailleur demande « où en est-on sur les 800 000 promis »). Un seul constructeur,
`construireColonne`, sur trois jeux de lignes. `EcritureService.balanceCumulee` ·
écritures de CLÔTURE exclues (sinon triple des fonds sur trois exercices, comme
la Note 9), SAUF celles du PREMIER EXERCICE, bilan d'ouverture d'un projet repris
(comme `justificatifSolde`). Appariement PAR CLÉ, jamais par rang (la ligne
« comptes non rattachés à un bailleur » est variable). FU à FZ et leurs totaux
sont des SOLDES À UNE DATE (« Fonds Bailleur en FIN exercice N ») ·
`REFS_DE_SOLDE`, valeur au lieu de la formule `C+D`. Contrôle officiel VII
(« TOTAL V = TOTAL VI ») sur CHAQUE colonne (cumulée · IV fonds à l'ORIGINE, VI
en fin de fenêtre), affiché seulement s'il ÉCHOUE.

**Sélecteur d'exercice.** `ExerciceProvider` prenait `exercices.find((e) =>
e.statut === 'OUVERT')` (le plus récent, en silence), alors qu'ouvrir N+1 avant
de clôturer N est la règle (arrêté dans les quatre mois, AUDCIF art. 23) et que
la balance bouclait sur le mauvais exercice. Le CHOIX DE L'UTILISATEUR prime,
mémorisé PAR DOSSIER (`omegax.exercice.<tenantId>`) ; un SEUL ouvert est retenu ;
PLUSIEURS sans choix · le plus récent, DÉCLARÉ (`choixImplicite`) et signalé en
barre de statut ; AUCUN ouvert · le plus récent, sans avertissement. Règle hors du
composant (`client/src/lib/exercice-choix.ts`, `resoudreExercice`) ; mémorisation
sous `try/catch` (`localStorage` jette en fenêtre privée).

**Journal et grand livre exportés en flux.** `journalExcel` passait par
`EcritureService.lister()`, plafonné à `PLAFOND_ECRITURES_PAR_FENETRE` (2 000) ·
journal amputé, et la ligne totaux portait une `SUM` sur les lignes écrites ET
l'agrégat SQL entier, deux totaux. Livre obligatoire (AUDCIF art. 22, 6°) · un
livre amputé en silence est FAUX (§ 8 bis). Le grand livre refusait à 20 000
(`PLAFOND_LIGNES_GRAND_LIVRE`) et non à 50 000. Les deux lisent PAR LOTS
(`LOT_EXPORT = 500`, curseur par identifiant, `skip: 1`), sans borne de fenêtre.
`perimetreJournal` (dans `ecriture.service.ts`) sert fenêtre et export (comme
`calculerPropositions`, `construireLigneTva`). `classeur-en-flux.ts` · coiffe
écrite AVANT la première donnée (rien ne se relit) ; formats portés par la
COLONNE (`appliquerFormats` après coup est sans effet) ; `useSharedStrings` FAUX
(1 195 Mo contre 450 Mo pour un demi-million de lignes). Panne après le premier
octet · `envoyerXlsxEnFlux` DÉTRUIT la connexion, Excel refusant le ZIP tronqué.
Grand livre complet avec feuille « Sommaire » (écrite après la dernière ligne,
depuis l'agrégat) et colonne Statut, brouillard compris et dit (2026-09-27, audit
final F99) ; ses deux routes exigent l'exercice (`EXERCICE_REQUIS`, F100).
`MAX_LIGNES_EXPORT` de 50 000 à 200 000, mesuré (`docs/capacite-mesuree.md`,
banc du 2026-09-12, moitié du tas libre), toujours un REFUS. Les tests exigent la
VALEUR de `numFmt` (jamais `toBeTruthy()` · ExcelJS met d'office un format
AMÉRICAIN sur une `Date`, « 4/3 » pour un 3 avril) et celle du curseur.

**Comparabilité de la colonne N-1.** « Lorsque l'un des postes chiffrés d'un état
financier N'EST PAS COMPARABLE à celui de l'exercice précédent, c'est CE DERNIER
QUI DOIT ÊTRE ADAPTÉ. L'absence de comparabilité ou l'adaptation des chiffres EST
SIGNALÉE DANS LES NOTES ANNEXES. » Le cas suit l'AUDCIF art. 7 (premier exercice
de moins ou de plus de douze mois). UNITÉ LE MOIS, JAMAIS LE JOUR (« une période
de DOUZE MOIS, appelée exercice » · 366 contre 365 ne compte pas) ; mois
TRAVERSÉS, une borne hors premier ou dernier jour comptant par son mois. Côté
SYSCOHADA, AUDCIF art. 34, dernier alinéa ; côté SYCEBNL, son art. 16, 7°, l'art.
34 étant exclu par son art. 3 (« 25 À 34 »). LE LOGICIEL N'ADAPTE RIEN ·
adaptation de l'ENTITÉ, mention aux Notes annexes ; un test refuse tout prorata
dans `comparabilite-exercices.ts`. Contrôle `COMPARATIF_N1_NON_COMPARABLE`
(propriété du COUPLE d'exercices, pas des treize états), gravité AVERTISSEMENT.
Méthode, plan et périmètre ne se lisent pas ; `CodeNonComparabilite` est une
union fermée.

**Mandat du contrôleur des comptes.** Le contrôle 6 (« Vérifiez que le mandat est
en cours », `regles-auditeur.ts`) avait enfin sa table. Trois durées · SYCEBNL
art. 21, « L'auditeur est nommé pour TROIS (3) exercices RENOUVELABLES UNE
FOIS » ; AUSCGIE art. 704, SA · DEUX exercices si désigné dans les statuts ou par
l'assemblée constitutive, SIX par l'assemblée générale ordinaire (selon
l'ORGANE) ; AUSCGIE art. 379, SARL · TROIS, sans limite de renouvellement. Un
nombre, deux sens · la limite et la réduction « si l'entité a une existence
inférieure à trois exercices » sont PROPRES au SYCEBNL. Art. 22 · « si
l'assemblée […] ne procède pas au renouvellement du mandat de l'auditeur ou à son
remplacement à l'expiration de son mandat, la mission de l'auditeur est
PROROGÉE, sauf refus exprès de sa part » · `MANDAT_AUDITEUR_PROROGE` en
INFORMATION, `MANDAT_AUDITEUR_SANS_PROROGATION` en AVERTISSEMENT sur le SEUL
refus exprès. DEUX TEXTES PROROGENT, POUR UN SEUL EXERCICE (2026-09-27, audit
final F69) · SYCEBNL art. 22 (EBNL), AUSCGIE art. 709 (SA), `regleDeProrogation` ;
aucun pour les autres formes, SARL comprise. Mission jusqu'à « la plus
prochaine » assemblée seulement (`estDansLaProrogation`). L'art. 20 · expert
« inscrit au tableau de l'ordre […] ou de l'organe qui en tient lieu » (l'ONEC)
· référence conservée, non vérifiée, et c'est dit. SAS (art. 853-13), SNC (art.
289-1), commandite simple, GIE, coopérative, entreprenant · aucune durée lue,
`dureeMandat` rend `null`, durée saisie, aucun refus. Fenêtre sous « Structure »
(acte de l'ENTITÉ), non sous « État > Contrôle et révision », refusée par
`chrome-etroit.spec.ts` (seize lignes à 360 px). Le contrôle 28 lit une table
réelle · doublures complétées.

**Échéances fiscales au tableau de bord.** UNE DÉCLARATION N'EST JAMAIS EN RETARD
CONSTATÉ, UN REVERSEMENT L'EST · le dépôt n'est dans aucun livre (le serveur ne
rend que la PROCHAINE occurrence), la retenue non versée l'est (`moisEnRetard`,
§ 10 bis). Horizon en JOURS, le dépassement COMPTÉ (« et 2 autres au-delà de 30
jours ») ; trente jours, convention d'OmegaX écrite au titre. Un retard constaté
remonte en tête, même hors horizon. JAMAIS « À JOUR » · réserve écrite sous la
liste vide, et un test interdit dans `DashboardPage.tsx` « à jour », « en
règle », « aucun retard » et « conforme ». Date de référence du SERVEUR, jamais
du poste. Règle dans `client/src/lib/echeances-a-venir.ts`.

**Accord-cadre avec le Ministère du Plan.** Manque que `exemption-is-ebnl.ts`
déclarait depuis G4a, refermé. Loi n° 004/2001, art. 37 · QUATRE conditions
CUMULATIVES de l'organisation étrangère, portées ensemble · représentation en RDC,
accord-cadre avec le Plan, attestations de bonne conduite des expatriés légalisées
par l'Ambassade ou le Consulat, « la main d'œuvre locale à concurrence de 60 % au
minimum ». PÉRIMÈTRE (§ 10 bis) · la sous-section II ne vise QUE l'organisation
ÉTRANGÈRE, l'art. 35 réservant le mot ONG à « l'association sans but lucratif […]
dont l'objet concourt au développement social, culturel et économique des
communautés locales » ; ni ONG congolaise (art. 36), ni association
confessionnelle, ni établissement d'utilité publique · la fenêtre dit « ce dossier
n'est pas concerné », jamais un formulaire vide. TROIS PIÈCES DISTINCTES ·
l'ACCORD-CADRE conditionne l'EXISTENCE (art. 37), l'ARRÊTÉ INTERMINISTÉRIEL Plan
et Finances ouvre les EXONÉRATIONS (art. 39, module `exonerations`), le CERTIFICAT
D'ENREGISTREMENT est autre chose ; un test gèle les trois mentions dans
`exemption-is-ebnl.ts`. DURÉE SAISIE · la loi n'en fixe aucune ; « dix ans
renouvelable par tacite reconduction, à moins d'être dénoncé par l'une des parties
6 mois avant la fin de chaque période » vient de l'article IX du MODÈLE du guide
Kahasha (annexe VIII) · `MODELE_KAHASHA` le propose avec sa source, jamais en dur.
UNE PÉRIODE ÉCOULÉE N'EST PAS UNE FIN · seule la DÉNONCIATION arrête l'accord
(comme le refus exprès la prorogation du mandat, SYCEBNL art. 22) ; est rendu le
DERNIER JOUR POUR DÉNONCER (fin moins préavis), aucune date sans préavis stipulé.
MAIN-D'ŒUVRE LOCALE DÉCLARÉE, JAMAIS SUBSTITUÉE · proposée par le registre
(`effectif-registre.ts`), nulle dès qu'une nationalité manque, confirmée par le
cabinet avec sa SOURCE, jamais déduite d'un compte 66 ; « OmegaX n'a pas de module
de paie » retiré (audit final F146). Le contrôle ne vise qu'une part DÉCLARÉE sous
le seuil.

**Checklist de constitution.** Les trois dossiers de la note circulaire
n° 003/2013 (section B) exigent « le certificat d'enregistrement EN COURS DE
VALIDITÉ » ; la section A (l'obtenir) est servie. TROIS FONDEMENTS · LOI (loi
n° 004/2001 ; les cinq pièces de la personnalité juridique, art. 4) ;
PRATIQUE_ADMINISTRATIVE (la note « ne crée pas de droit nouveau ») ;
USAGE_SANS_BASE_LEGALE (acte de reconnaissance de l'autorité
politico-administrative, point 4 · guide Kahasha § 6, « ne découle d'AUCUN TEXTE
LÉGAL », issu du Décret-loi n° 195 du 29 janvier 1999, article 37, « ABROGÉ par la
loi n° 004/2001 ») · CONSERVÉ, puisqu'un dossier sans lui est recalé, ET son
origine dite. AUCUN FRAIS DGRAD · 50 et 100 USD barrés à la main sur le scan ; un
test interdit tout barème. L'AVIS DE TUTELLE N'EST PAS INVENTÉ (« la loi ne
détermine NI la forme […] NI la procédure […] NI les frais »). AUCUNE TABLE
NOUVELLE · les produits des étapes sont `actePersonnaliteJuridique`,
`numeroEnregistrementSecteur`, `certificatEnregistrementPlan` ; une CONFRONTATION
appariée PAR CLÉ (`detenu[e.cle]`, jamais `Object.values(detenu)[i]`), gelée dans
la SOURCE comme l'absence de prorata de `comparabilite-exercices.ts`. Les
conditions de l'art. 37 vivent dans `accord-cadre`, jamais recopiées.

**Facturation.** Une vente n'avait que `Ecriture.reference`. Loi de procédures
fiscales art. 23 (modifié par la loi n° 23/052) · une facture « POUR CHAQUE
TRANSACTION EFFECTUÉE ». OmegaX n'est pas HOMOLOGUÉ (O.-L. n° 10/001, art. 58
facture NORMALISÉE, art. 59 quater) · il tient la facture comme PIÈCE
JUSTIFICATIVE (AUDCIF art. 17, dix ans) et source de l'état détaillé, et le dit en
tête. LES DOUZE POINTS DE L'ART. 26 du décret n° 23/10 (a à l), DIX dus par un
document en tenant lieu, en DUR et dans l'ordre ; avant le 3 mars 2023, les NEUF
tirets de l'art. 100 du décret n° 011/42 de 2011 (`texteApplicable`). SIX groupes
se lisent sur les LIGNES (désignation et quantité, prix, TVA, et trois totaux) ·
sans lignes, six manquent. Colonne « Mentions obligatoires » (audit final F229).
L'AMENDE TOTALE NE SE CALCULE PAS · art. 97 bis, « 750.000 FC (personnes
morales) ; 250.000 FC (personnes physiques), PAR OMISSION », unité non définie ·
montant UNITAIRE et réserve seulement, multiplication interdite par un test. ÉTAT
DÉTAILLÉ · art. 56, son défaut « entraîne la RÉINTÉGRATION D'OFFICE des déductions
opérées, après mise en demeure non suivie de régularisation dans les cinq
jours » ; art. 134 ligne à ligne. Il ne lit que les ACHATS ; le FOURNISSEUR est
l'ÉMETTEUR ; une ligne incomplète est SIGNALÉE, jamais écartée ; le VOLET
IMPORTATIONS (déclaration de mise à la consommation, valeur en douane) est une
lacune DÉCLARÉE sur l'état. AUCUN CLOISONNEMENT · l'art. 23 vise les redevables de
l'IS, de la TVA et de l'IRPP, pas un référentiel · une ASBL assujettie y est tenue
(le § 8.4 du plan ne visait que DEVIS et COMMANDE). IDENTITÉS RECOPIÉES à la date
de la pièce, comme la mention de l'art. 60 du décret. MONTANT HT DE LA PIÈCE,
jamais recalculé. `imposable` est un BOOLÉEN, jamais déduit d'un taux nul (exonéré
et taux zéro, art. 24, se distinguent, art. 100). FACTURE BARRÉE (audit final
F117, F119) · par une note du mois, hors totaux ; plus tard, elle reste, reprise
au mois de la note (art. 127, lecture d'OmegaX). Ni une pièce passée au journal ni
une note de crédit ne se suppriment. AUCUNE COMPTABILITÉ PARALLÈLE (§ 7 du plan de
construction) · la facture POINTE vers l'écriture de `EcritureService`.
`FacturationModule` importe `LicenceModule`, sans quoi `LicenceGuard` ne se résout
pas · `graphe-applicatif.spec.ts` (panne du 2026-09-02).

**Décret n° 23/10 du 3 mars 2023 (correction du 2026-09-13).** Une LACUNE DÉCLARÉE
À TORT fabrique une DISPENSE, aussi fausse qu'une règle inventée. (1) OMEGAX EST
UN SFE (art. 3, 7°, « doit être homologué et relié soit à un MCF physique, soit à
un MCF dématérialisé ») ; art. 22, SFE propre utilisé seulement après
« ATTESTATION DE CONFORMITÉ délivrée par l'Administration fiscale » ; l'ARRÊTÉ de
l'art. 23 est hors corpus (démarche à la DGI) ; art. 20 et 21, « seuls les SFE
homologués sont proposés à la vente » · arbitrage de Manasse. (2) DOUZE MENTIONS,
DIX DUES · l'art. 28 abroge « toutes les dispositions antérieures contraires » ;
j) « le montant de tous autres impôts et taxes, LE CAS ÉCHÉANT » est nouveau ; k)
et l) (DEF, code d'authentification et QR) sont retirés du « document tenant
lieu » · nommés, jamais comptés manquants. « LE CAS ÉCHÉANT » = « s'il y en a » ·
`Facture.autresImpotsEtTaxes` NULLABLE, null = omission, jamais zéro par défaut.
(3) Art. 27 · « LES ORGANISATIONS NON GOUVERNEMENTALES […] sont tenus de
n'accepter que les factures normalisées » ; art. 25, déduction sur facture
normalisée ou document en tenant lieu · l'ASBL est concernée en RECEVANT.

**Passe F1 (2026-09-13).** `docs/releve-de-manques-fiscal.md`. L'ADRESSE EXACTE
(art. 26 a) et b), et les deux premiers tirets de l'art. 100, passe F3b) · sans
elle `verifierMentions` rendait `conforme: true` ; recopiée à la date de la pièce,
aucune dérogation pour un client non immatriculé. BORNAGE · art. 29, en vigueur à
la signature, le 3 mars 2023, sans vacatio legis · une facture de 2022 ne se voit
rien reprocher en son nom (`controles.service.ts`, « LE BORNAGE N'EST PAS UNE
PRÉCAUTION, C'EST LE CONTRÔLE LUI-MÊME ») ; l'art. 28 n'abroge que le
« CONTRAIRE », `texteApplicable(dateFacture)` choisit la liste À LA DATE DE LA
PIÈCE, l'écran la nomme. ART. 25 NON EXCLUSIF · « DE FAÇON GÉNÉRALE » la facture,
plus la mise à la consommation (2°) et la facture à soi-même (3°) ; une TVA
d'importation au 445 est déductible, l'état nomme l'art. 25, 2°. L'ARRÊTÉ DE
L'ART. 25 (définition du « document en tenant lieu », d'où la dispense de k) et
l)) est hors corpus · HYPOTHÈSE déclarée. Anomalie non tranchée · la phrase est
dans le point 3 et définit un terme du point 1 ; rien sans le Journal officiel.
MÉTHODE · l'indépendance du lecteur paie, l'étape adverse est le cœur (sans elle
83 % de bruit), un réfutateur peut RENFORCER un constat.

**Devis et commande client.** Un devis précis, avec volonté d'être lié, est une
OFFRE (AUDCG art. 241), l'acceptation FORME le contrat (art. 244). PÉRIMÈTRE ·
MARCHANDISES entre COMMERÇANTS (art. 234), hors usage personnel (art. 235 a), hors
contrats où « LA PART PRÉPONDÉRANTE » est main-d'œuvre ou services (art. 235 b),
hors les six régimes de l'art. 236 ; nature SAISIE, jamais déduite. LE SILENCE NE
VAUT RIEN · art. 243, « LE SILENCE OU L'INACTION NE PEUT À LUI SEUL VALOIR
ACCEPTATION » ; délai écoulé sans réponse = CADUC, ni accepté ni refusé ;
`natureReponse` ne s'écrit que sur une réponse REÇUE, gelé dans la source. DEUX
DATES (« un nombre, deux sens ») · effet quand l'offre PARVIENT (art. 242), délai
couru dès qu'elle est EXPRIMÉE, date portée présumée d'expédition (art. 246).
AUCUN DÉLAI PAR DÉFAUT · « délai raisonnable » (art. 243), constante de délai
interdite par un test. FERMETÉ · art. 242, « EN FIXANT UN DÉLAI DÉTERMINÉ POUR
L'ACCEPTATION, QU'ELLE EST IRRÉVOCABLE », deux conditions cumulatives ;
« raisonnablement fondé à croire » ÉCRIT, jamais calculé. ART. 245 · « n'altérant
pas substantiellement » = ACCEPTATION avec les modifications ; « des additions,
des limitations ou d'autres modifications » = REJET et CONTRE-PROPOSITION. AUCUNE
TABLE « CommandeClient » · commande = réponse, contre-proposition = devis inverse
chaîné (`contrePropositionDeId`), refusée sur un devis non rejeté
substantiellement, émetteur INVERSÉ ; écrit exigé sur toute réponse modificative.
CLOISONNÉ AU SYSCOHADA · l'association « ne se livre pas à des opérations
industrielles ou commerciales, si ce n'est à titre accessoire » (loi n° 004/2001,
art. 1er). MENTIONS · HORS TAXES (art. 263) ; défaut apparent dénoncé DANS LE MOIS
sous peine de DÉCHÉANCE (art. 258), défaut caché prescrit par UN AN (art. 259).
ACCEPTATION TARDIVE (audit final F118) · l'offre reste CADUQUE (« acceptée dans le
délai stipulé »), fait gardé, ni contrat ni refus ; sans délai stipulé, rien
tranché. CONTRE-PROPOSITION SAISIE depuis le devis rejeté (audit final F124).
DEVIS NON OBLIGATOIRE · Art. 240, « peut être écrit ou verbal […] prouvé par tous
moyens ».

**Relevé bancaire et rapprochement proposé (2026-09-25).** Relevé CSV ou XLSX dans
un rapprochement EN COURS (`LigneReleveBancaire`,
`rapprochement/releve-bancaire.ts`, `docs/comparaison-sage-i7-omegax.md`) ; ni
tolérance ni écriture d'ajustement. SIX RÈGLES. (1) SENS DE LA BANQUE · un crédit
du relevé est un DÉBIT du 52 (`montantVuDuCompte`). (2) AUCUNE TOLÉRANCE, l'écart
se COMPTABILISE. (3) AUCUNE DEVINETTE · plusieurs candidates ou une écriture
convoitée deux fois, rien proposé ; la passe par référence subit la fenêtre de
dates (audit final F62, « LOYER » n'est pas un identifiant) ; la référence
départage par ses chiffres à trois chiffres au moins (« CHQ 0042 » = « 0042 »).
(4) PROPOSER N'EST PAS POINTER · non stocké, cases décochées, confirmation REJOUÉE
(ligne libre, compte, somme au centime) ; confirmé = pointé ; dépointer dénoue.
(5) RIEN D'OFFICE · ligne sans écriture « à comptabiliser », ligne postérieure au
relevé refusée, relevé qui ne boucle pas (départ + opérations ≠ solde imprimé)
signalé ; fenêtre de dates réglable, convention d'OmegaX. (6) L'À-NOUVEAU NE SE
POINTE PAS (audit final F205, décision de Manasse du 2026-09-28), premier exercice
compris · le PREMIER rapprochement porte un SOLDE DE DÉPART DÉCLARÉ lu sur le
relevé (`soldeDepartDeclare`, `dateDepart`), `null` et jamais zéro s'il manque ;
lignes antérieures fondues dedans ; en-cours DÉCLARÉS
(`EncoursOuvertureRapprochement`), pointés, sans écriture. `ecartDOuverture`
(solde à la veille = départ + en-cours) non nul REFUSE la clôture du premier
rapprochement. Une règle (`estEcarteeDuPointage`, `filtreEcarteDuPointage`,
`motifRefusPointage`) · filtre en base à la lecture et aux propositions, refus
nommé au pointage et à la confirmation ; le nombre écarté est dit, jamais la
somme. Déjà pointé · `RAPPROCHEMENT_A_NOUVEAU_POINTE`, jamais rouvert d'office
(`aNouveauEnTrop` épargne le premier d'avant la règle). RÉOUVERTURE ·
administrateur (`POST /rapprochements/:id/rouvrir`), motif, journal d'audit, SEUL
le dernier clos du compte, ni avec un en cours ni à travers une période figée
(`motifLigneFigee`) ; il se reclôt, ne s'annule pas.

**Règlement des tiers (2026-09-25).** `reglements/` · UNE pièce par tiers,
lettrage MANUEL aussitôt. (1) TIERS ET TRÉSORERIE SEULS (guide SYSCOHADA Partie 1
ch. 4 § 1, fiches des comptes 40 et 41). (2) 408, 409, 418, 419 ne se règlent pas.
(3) Moins que le dû = partiel ; plus = REFUSÉ. (4) TOUT SE VÉRIFIE AVANT LA
PREMIÈRE PIÈCE. L'ordre de virement ne bloque pas la validation.

**Nouvelle immobilisation (2026-09-28, relevé par Manasse).** (1) CONTREPARTIE EN
LISTE FERMÉE (`immobilisations/contrepartie-acquisition.ts`, fiches 21 à 24) ·
capital ou dotation, 46 ou 45, 16 (SYCEBNL), 4811 incorporel ou 4812 corporel,
trésorerie, 72 (SYSCOHADA) ; refus au serveur, liste servie par famille. (2)
`dateMiseEnService` nullable · vide, ni dotation ni dérogatoire ni plan fiscal
(« en état de fonctionner ») ; posée une fois, jamais avant l'acquisition. (3)
DURÉE PROPOSÉE AU BARÈME DE L'ARRÊTÉ n° 013/2025
(`scripts/extraire-bareme-amortissement.cjs`, 131 lignes, jamais retouché) ; écart
averti (art. 4), jamais refusé (durée d'utilité, AUDCIF art. 45).

**Comptes retenus (2026-09-28, décision de Manasse).** `Compte.estRetenu` · TOUTE
liste de choix de comptes demande `retenus=true`, à `/comptes` comme aux routes
des immobilisations (comptes du bien, contreparties d'acquisition, fonds de fin
de projet), et le serveur rend les retenus ET tout compte UTILISÉ par une seule
règle (`comptes/comptes-proposes.ts` sur `identifiantsUtilises`, « tout lien
retient »). Semé non retenu, créé retenu, existants gardés. Jamais un refus ·
états, imports et écritures automatiques lisent tout le plan (§ 7), un numéro
TAPÉ se résout dans tout le plan (saisie, inventaire). Une liste vide dit
« retenez-le dans Plan comptable » ou « ouvrez-le », un choix unique se
présélectionne. NON FILTRÉE · la liste où le texte, et le serveur par un refus
nommé, n'admet qu'UNE racine que l'opération mouvemente souvent la PREMIÈRE
(contrepartie de l'octroi d'une subvention, destinations de l'affectation, 12
de l'imputation d'ouverture, 167 ET 4861 du legs, 29 de la division du bien) ;
FILTRÉE · le choix entre racines de natures distinctes (691, 697 ou 853 ; 162,
163 ou 164). Les routes sont rangées dans UNE table
(`comptes/listes-de-comptes.ts`, sans import), relue contre les contrôleurs
par leur STRUCTURE (service qui lit `compte.findMany`, jamais par le nom) et
contre chaque `api.get` du client, typé sans exception, quelle que soit la
forme de l'adresse (`comptes-retenus-ecrans.spec.ts`, exceptions fermées et
motivées).

**Suppression des structures (2026-09-25).** DELETE, administrateur seul ; manuel
i7, pas de suppression d'un compte « mouvementé […] ou encore utilisé dans une
autre commande du menu Fichier ou Structure ». (1) JAMAIS LA BASE (SET NULL dénoue
en silence) · `common/suppression/references.ts` compte avant. (2) RELATIONS LUES
DANS LE SCHÉMA (DMMF), nombre écrit nulle part (audit final F145), borne du
dossier à chaque comptage. (3) Un TOTAL avec sous-comptes ne se supprime pas ; un
tiers dont un compte rattaché est mouvementé est mouvementé. Le refus nomme chaque
usage, renvoie à la mise en sommeil.

**Contrepartie à chaque ligne et opérations exonérées (point 5).**
`Journal.contrepartieChaqueLigne` · ligne inverse sur le compte de trésorerie du
journal, même libellé, jamais sur la ligne de trésorerie elle-même
(`lib/contrepartie-tresorerie.ts`), défaut FAUX, REFUSÉE hors trésorerie.
« Opération exonérée · retirer la TVA » retire la dernière ligne de ce compte de
taxe et de ce taux, elle seule ; un compte qui ne sert qu'à des opérations
exonérées ne porte pas de taux par défaut. Annonce AU-DESSUS de la saisie.

**Modèles de saisie à fonctions (point 6).** SAISIR, RÉPÉTER, CALCULER (taux de la
ligne, qui devient ligne de taxe), ÉQUILIBRER ; rattachés à un journal, un TYPE ou
tous, appelés par F4. (1) `fonctions-modele.ts` refuse ce que `derouler-modele.ts`
ne déroulerait pas (un Équilibrer, ni Répéter ni Calculer en tête, taux sur
Calculer seul, montant fixe sur Saisir seul). (2) ÉQUILIBRER EN DERNIER, solde du
mauvais sens = zéro avec motif. (3) Taux introuvable = zéro, dit. (4) Incrémenter
et Fonction non repris.

**Saisie par pièce, OD analytiques, lot (point 7).** (1) MODE de la fenêtre de
saisie, jamais une seconde fenêtre (`lib/saisie-par-piece.ts`, date refusée hors
exercice avant l'envoi), [Précédent] et [Suivant]. (2) L'OD ANALYTIQUE S'ÉQUILIBRE
(`analytique/od-analytique.ts`), même compte général d'une classe que le plan
ventile, sections Détail. (3) UNE LECTURE (`cumulsPlan`, journal « OD ANA ») ; le
tableau d'exécution budgétaire SYCEBNL ne les reprend pas (payé ou engagé se lit
sur l'écriture) et le DIT ; le contrôle des cumuls ne les lit pas. (4) PAS DE
TABLE DE LOTS · import au brouillard, la validation jouant la mise à jour.

**Recherche d'écritures (point 8).** `recherche-ecritures.ts`, par
`perimetreJournal` (fenêtre ET export). (1) Compte et montant sur la MÊME ligne
(`lignes.some` · sinon le 401 à 5 000 et une ligne à 116 000). (2) Montant seul
EXACT ; borne haute = fourchette ; compte par RACINE. (3) Critère illisible
REFUSÉ ; l'export refuse avant le flux (jamais un 400 après).

**Réimputation (point 9).** `reimputation.ts`. (1) AU BROUILLARD, le compte change
(AUDCIF art. 22, 2°). (2) VALIDÉE, jamais touchée · NÉGATIF sur l'erroné puis
exact sur le bon (art. 20, « exclusivement par inscription en négatif »), une
écriture par pièce, motif, ventilations suivies. (3) Lettrée, pointée, à taux de
TVA, tenue par une immobilisation, de clôture ou d'exercice clôturé (art. 20 al.
3) · le lot entier s'arrête. (4) Depuis la recherche filtrée sur un compte,
réservée au comptable.

**Fusion des structures (point 10).** (1) TIERS · aucune écriture touchée,
références reportées lues dans le schéma (`reporterReferences`), doublon supprimé,
ne comble que les vides ; client et fournisseur ne fusionnent pas. (2) COMPTES ·
réimputation des exercices ouverts, chacun SIMULÉ avant écriture ; même classe,
détail. (3) L'ABSORBÉ S'ENDORT (art. 20 al. 3) ; ses usages en structure sont
RENDUS, jamais reportés. (4) JOURNAUX NON FUSIONNÉS (art. 22, 2° et 3°) ; un
journal vide se supprime (point 3).

**À-nouveaux provisoires (point 11).** (1) UN CALCUL
(`exercice/report-a-nouveau.ts`, `cloture-annuelle.spec.ts`), UNE LECTURE
(`lireComptesDuReport`, audit final F185 · sommes en base, devises par devise et
sens ; DÉTAIL non lettré par tranches ; `report-a-nouveau-agrege.spec.ts`). (2)
Sur le livre-journal, résultat au 13, brouillard DIT. (3) Jamais validé
(`Ecriture.estANouveauProvisoire`) · `valider` refuse, `validerJusqua` écarte. (4)
Relancer ou clôturer reprend son NUMÉRO DE PIÈCE ; une ligne lettrée ou pointée
REFUSE le remplacement (« uniquement sur des écritures non lettrées », Sage). (5)
Budgets · jamais écrasés, aucune section dont la convention finit avant.

**Clôture qui fige lettrage et analytique (point 12).** `exercice/gel-cloture.ts`
· figé si exercice clôturé, si clôture TOTALE du journal datée au plus tard de sa
date limite (2026 ne fige pas 2027), ou clôture de PÉRIODE ; la PARTIELLE ne fige
rien. Tous les chemins (lettrer, compléter, délettrer, confirmer, ventiler,
effacer) ; automatique et pré-lettrage n'apparient pas une ligne figée ; règlement
vérifié AVANT la première pièce ; OD par la seule période. LA TOTALE EST BORNÉE À
UNE DATE (fin d'exercice à défaut), franchie par l'art. 22, 4°.

**Compte individuel de tiers (point 13).** Décision de Manasse.
`tiers/collectifs-tiers.ts` · fournisseur 40110000 ; client 41200000
« Clients-usagers » (SYCEBNL) ou 41110000 « Clients » (SYSCOHADA) ; adhérent
41100000 (SYCEBNL seul) ; un spec relit les deux semis. Salarié et autre sans
collectif (422 global ; « autre » peut être débiteur ou créditeur). Compte né avec
le tiers, même transaction, premier numéro libre sous la racine, longueur du
dossier, réglages du collectif, rattaché comme principal ; `Compte.collectifId`
RESTRICT (un collectif qui porte des individuels ne se supprime pas). La balance
générale les fond sur le collectif par ce lien, jamais par le numéro ; le détail
reste à la balance auxiliaire.

**Natures de compte (point 14).** Sept, pas une de plus · Stock, Clients,
Fournisseurs, Banque, Caisse, Charges, Produits (`comptes/natures-compte.ts`,
`NatureCompte`, une ligne par dossier et nature, posées à la première lecture,
défauts repris des deux semis, relus par un spec). DÉFAUTS (report, lettrage),
jamais contrainte, DTO maître ; hors nature `estLettrableParDefaut` ; affichée,
jamais stockée sur le compte ; aucun chevauchement ; jamais lue par les états
financiers ; incohérence du report listée dans Paramètres du dossier, alignée à la
demande, jamais d'office.

**Profil de fonctions (point 15).** Skill `sage-i7`. Restreint, n'élargit jamais
(`JwtAuthGuard`, après le rôle · « Validation » cochée ne fait pas valider un
aide-comptable) ; porte sur POST, PUT, PATCH, DELETE, jamais sur les lectures ;
jamais l'administrateur ; table par contrôleur, valider à part de saisir
(`common/fonctions/fonctions-metier.ts`), gelée par `fonctions-metier.spec.ts`.
Poser un profil ferme les sessions, colonnes ADMISES au journal d'audit.

**Changer sa propre adresse de connexion (2026-09-25).** Demandé par Manasse
(admin@vmgconsulting.cd devient .net). `POST /auth/changer-adresse`, Fichier > Mon compte… (tous rôles depuis le 2026-09-27,
audit de l'interface F3). Mot de passe actuel exigé ; unicité par la contrainte de
la base, sans lecture hors cloisonnement ; adresse prise refusée sans dire à qui ;
sessions fermées, une neuve reposée ; PAS une sortie de mot de passe provisoire.
Rôle, dossier et drapeau d'opérateur suivent. `OPERATEURS_PLATEFORME` n'accorde
qu'en ACCORD (défaut du workflow à .net) ; `API_OPERATEURS_PLATEFORME`, s'il
existe, prime et se met à jour à la main.

**Capital, courriel et site (2026-09-25, comparaison Sage, point 16).** AUSCGIE art.
17 · sur tout document aux tiers, dénomination « précédée ou suivie immédiatement »
de la forme, du MONTANT DU CAPITAL SOCIAL, du siège et du RCCM (sanction, art.
891-1, 2°) ; art. 269-2, « à capital variable ». (1) Périmètre · les cinq sociétés
de l'art. 6 (`tenant/mentions-societe.ts`) ; GIE, coopérative, succursale, entité
publique · capital saisissable, non exigé. (2) EBNL et personne physique n'ont PAS
de capital, refusé par la ROUTE (`motifRefusCapital`), il prêterait à une ASBL une
forme de société ; retrait permis. (3) Mention absente DITE, jamais remplacée
(en-tête par /auth/me) ; montant des statuts, sans défaut.

**Journaux de saisie et historique des rappels (2026-09-25, point 17).** (1) État
d'une case unique (`journaux/etat-journaux-saisie.ts`), gel lu par `gel-cloture.ts`
au DERNIER jour du mois, sinon « figé jusqu'au » ; « Non imprimé » non servi. (2)
L'à-nouveau provisoire ne fait ni brouillard ni « tout validé » · case VIDE, « AN ».
(3) Comptage par jour (`groupBy`). (4) Historique des rappels en tranche qui se dit
· total et somme sur tout le périmètre, `tronque` au-delà de 500, montant figé à
l'émission. Frais d'impayé et pénalités de Sage non servis.

**Éditions des structures (2026-09-25, point 18).** `lib/editions-structures.ts`.
(1) Liste À PLAT, jamais l'écran imprimé (`avec-edition` · une arborescence ou un
filtre sortait tronqué sans le dire). (2) Périmètre dit (« Liste complète » ou
sélection, nombre de lignes), rubrique vide « non renseigné ». (3) Seule la fenêtre
active s'imprime (`fenetre-inactive`).

**Banques et libellés (2026-09-25, point 19).** (1) Un RIB pour au plus un journal
de banque, et inversement (`RibBanque.journalId` unique) ; journal portant une
caisse (57) refusé (`banques/banques.ts`) ; journal rattaché non supprimable. (2)
Seul contrôle · l'IBAN (ISO 13616, modulo 97), formats nationaux conservés sans
vérification ; banque et RIB au journal d'audit (un RIB modifié en silence détourne
un paiement). (3) Un libellé (datalist) n'impute RIEN. Collaborateurs et plan
reporting non servis.

**États personnalisés (2026-09-25, point 20).** Définition d'OmegaX, dite dans
l'aide (`etats-personnalises/moteur-etat-personnalise.ts`, historique « sur 5 ans
»). (1) Le moins EXCLUT · « 70 -709 » = 70 sauf 709, racine la plus longue (en
soustraction, les rabais gonflaient le chiffre d'affaires). (2) SOLDE pour le bilan,
MOUVEMENT clôture exclue pour la gestion (sinon zéro sur exercice clos). (3) Un
total ne cite que des lignes PRÉCÉDENTES, porte et calcul, définition revérifiée.
(4) Seule la définition est stockée · `EcritureService.balance`, cinq exercices au
plus, zéro négatif ramené à zéro. Ni état financier ni document déposé.

**Documents attachés aux tiers (2026-09-25, point 21).** `tiers/documents-tiers.ts`,
pièce EN BASE (`DocumentTiers.contenu`, décision de Manasse ; Sage · « un
commentaire de 69 caractères »). (1) Type lu dans les OCTETS, liste fermée (PDF,
PNG, JPEG, docx, xlsx, doc, xls), signature contre extension. (2) Téléchargement
seul (`attachment`, `nosniff`) ; seule `telecharger` charge `contenu` (50 Mo pour
dix scans sinon). (3) 5 Mo sur multer en mémoire, 413 en français, aucun quota. (4)
Binaire hors de tout CSV · restitution à côté (`fichierDuDocument`), exclu du
journal d'audit ; pas deux fois au même tiers (SHA-256, P2002). Plan des tiers
ouvert en consultation (2026-09-26, décision de Manasse) · la STRUCTURE (créer,
modifier, fusionner, supprimer, mettre en sommeil, rattacher un compte, modèles de
règlement) reste à l'administrateur (`estAdmin`, `@Roles ADMIN_CABINET`), un spec
relisant chaque action dans son bloc `estAdmin &&` par équilibrage ; documents par
`peutEcrire`. Fusion · le doublon de même empreinte est retiré avant le report.
Pièce ILLISIBLE consignée dans `controles.txt` (son flux, qu'`archiver` n'écoute
pas, arrêtait le serveur) ; pré-image sans binaire (`selectPreImage`) ; nom tronqué
par points de code (`encodeURIComponent`).

**RIB des tiers et ordre de virement (2026-09-26, priorité 1).** Règles d'OmegaX
(`tiers/ribs-tiers.ts`) ; SEPA, ETEBAC non servis. (1) RIB = STRUCTURE ·
administrateur seul (`estAdmin` et serveur), au journal d'audit (fraude la plus
courante) ; IBAN seul contrôlé, sans IBAN ni numéro refusé ; un PRINCIPAL par tiers,
le premier d'office, la fusion garde celui de la fiche conservée. (2) L'ordre naît
AVEC ses pièces (Règlement des tiers, fournisseurs) ; tout vérifié AVANT la première
pièce (`OrdresVirementService.preparer` · RIB et devise du journal, RIB principal de
chaque tiers), manques en un refus. (3) Donneur en MONNAIE DE TENUE · RIB en USD
refusé (loi n° 23/053 art. 141, 1°), sans devise = franc. (4) Tout RECOPIÉ à la date
de l'ordre ; numérotation continue, jamais réutilisée ; impression ENREGISTRÉE au
serveur avant la boîte (« imprimé », date, auteur ; puis duplicata). (5) Annulation
avec MOTIF, pièces libérées non défaites ; pièce tenue non supprimable
(`verifierAucunModuleNeLaTient`), tiers payé non plus, ses RIB partant avec lui.
L'état ne bloque pas la validation. Liste en tranche (audit final F207) · total et
nombre à imprimer sur tout le dossier, même filtre par état, état inconnu refusé.

**Rubriques de paie, avances et prêts (2026-09-26, priorité 2).**
`personnel/rubriques-paie.ts`, `personnel/avances-salaire.ts`. (1) La rubrique
NOMME, la NATURE (art. 7, point 8 du Code du travail) décide assiettes et compte ;
les cinq exclusions et la participation aux bénéfices sont REFUSÉES à une rubrique
(une prime « transport » sortirait de l'assiette) ; fondement obligatoire ; code et
nature figés, on désactive. (2) Nature RELUE au serveur (`resoudreSaisie`) · celle
envoyée avec un `rubriqueId` est remplacée, le bulletin fige la saisie relue (P9).
(3) Avance et acompte au 4211 et 4212, prêt au 272 (fiche du compte 42, qui EXCLUT
les prêts, mêmes numéros aux deux semis) ; la retenue (art. 112, c et f) vire le 422
(Guide SYSCOHADA, Partie 1 ch. 3, § 4.3, Application 10) ; type et catégorie du
registre ; le versement est une écriture de trésorerie du cabinet. (4) Solde CALCULÉ
· montant moins retenues des bulletins NON ANNULÉS, relu à l'émission ; retenue
au-delà et net négatif refusés (le 422 mentirait) ; avance retenue non supprimable.
(5) Aucun plafond de l'art. 114 (l'art. 112 n'y renvoie que pour son litera d) ;
quotité montrée. Listes en tranches (audit final F259) · salariés 1 000,
confrontation de 500 fiches par lots de 200 (totaux sur tout le registre),
rubriques, modèles, avances 500, avec total et `tronque`.

**Dégressif fiscal et dérogatoire, SYSCOHADA (2026-09-26, priorité 3).**
`immobilisations/amortissement-degressif.ts`. (1) PAS un mode comptable · AUDCIF,
fiche du compte 68 (accéléré imposé, loi n° 23/053, art. 28, 3°) · normal au 68, «
le complément d'amortissement fiscal autorisé figure au débit du compte 85, par le
crédit du compte 151 » ; `ModeAmortissement` figé ; reprise au 861 (Titre VIII ch.
18 § 4.5.1.3). (2) Art. 31 à 35 · SOCIÉTÉS, bien NEUF d'une des dix catégories de
l'art. 31 (déclarée), jamais incorporel, quatre à vingt ans entiers, taux de
l'arrêté n° 013/2025 DÉCLARÉ (distinct de la durée comptable), coefficients 1,5 / 2
/ 2,5, prorata du mois de mise en service, bascule de l'art. 35 ; quatre ans = 1,5
malgré « de trois à quatre ans » (art. 33, a), lecture du socle fiscal). (3) Option
AVANT la première dotation, jamais sur un bien repris amorti. (4) Dérogatoire
exigeant sa dotation et les antérieures (une annuité sautée serait perdue) ; reprise
plafonnée au cumul du 151, l'excédent est une charge à réintégrer (art. 28),
MONTRÉE, jamais postée. (5) Sortie refusée avec un dérogatoire · « Reprendre le
solde » au 861, écriture retenue (`verifierAucunModuleNeLaTient`). Double envoi
(audit final F132) · l'index unique retire l'écriture, 409. Régime réservé au bien
MIS EN SERVICE depuis le 1er janvier 2026 (passe F12 · loi n° 23/053, art. 153 ;
arrêté n° 013/2025, art. 6), jamais lu sur l'ouverture de l'exercice (premier
exercice long ouvert en 2025, période imposable 2026) ; sinon refus nommé, plan ni
prolongé ni recommencé, reprise ouverte ; `common/entree-en-vigueur-loi-23-053.ts`.
Durée du barème proposée, plus courte signalée (art. 4). AMORTISSEMENT EXCEPTIONNEL (2026-10-01, lot 2, décisions D-8 à D-10) · variante
de la même option (art. 36 à 38), ouverte à TOUTE entreprise industrielle du
SYSCOHADA (« les entreprises industrielles », art. 36), biens et bornes des
art. 31 et 32 ; 60 % PLEIN la première période · le renvoi « article 31 » de
l'art. 38, 1° se lit « article 34 » (l'O.-L. n° 69/009, art. 43 ter L,
écartait le prorata), anomalie écrite ; prorata d'export DÉCLARÉ (chiffres de
l'année de mise en service et leur source, gardés sur le bien), refus sous
20 %.

**Barèmes de paie datés (2026-09-26, priorité 4).** `personnel/baremes-dossier.ts`,
`VersionBaremePaie`. (1) Se saisissent CNSS, INPP, ONEM et SMIG du manœuvre (décret
n° 25/21, art. 11, « à partir du mois de janvier de chaque année », par arrêté, art.
10) ; tranches IRPP (loi n° 23/053, art. 118) et TENSION réservées à OmegaX. (2)
Grille tirée du SEUL taux du manœuvre (`annexeDuCabinet` · décret n° 25/21, art. 6 ;
colonnes 19 et 20 par les art. 5 et 6 du décret n° 25/22, prouvé au centime) ; elle
sert `verdictRemunerationMinimale`, la quotité et les allocations ; un mensuel pris
pour journalier est refusé. (3) Effet un mois APRÈS la dernière version du barème,
livrée ou du cabinet (le moteur lit par MOIS) ; versions livrées figées. (4) Texte
OBLIGATOIRE, voyageant avec le calcul (`RESERVE_BAREME_CABINET`,
`RESERVE_GRILLE_CABINET`). (5) Taux nul refusé. (6) Ajout permis malgré un bulletin
émis (période RENDUE) ; retrait refusé si un bulletin émis porte un mois couvert.
CNSS DATÉE · décret n° 18/041, en vigueur le 24 novembre 2018 (art. 11), art. 10
différant au 1er janvier 2019 les taux des art. 2 et 3 (d'ici là pensions 3,5 % +
3,5 %, risques 1,5 %, familles 4 % au seul ex-Katanga) ; `BAREMES_CNSS` à deux
versions ; familles de novembre et décembre 2018 et toute CNSS antérieure en
ABSTENTION.

**Journaux autorisés par utilisateur (2026-09-26, priorité 5).**
`common/perimetre/extension-perimetre-journaux.ts` (compétence `sage-i7`). (1) La
SAISIE est restreinte, jamais la lecture (403 ; balance partielle fausse, AUDCIF
art. 22, 6° ; confidentialité par le rôle cantonné) ; lettrage et pointage ouverts.
(2) Sur le client Prisma, entre cloisonnement et audit (huit fichiers écrivent des
écritures) ; une modification relit le journal des écritures visées, et des LIGNES
(audit final F156, réimputation au brouillard). (3) Administrateur jamais restreint
(`journauxAutorises` à null). (4) Liste VIDE = aucune saisie, dit ; journal d'un
autre dossier refusé. (5) Ferme les sessions ; colonnes ADMISES à l'audit.

**Simulateur budgétaire (2026-09-26, priorité 6).** Définition d'OmegaX
(`simulations/simulateur-budgetaire.ts`) ; cube non repris. (1) Maille · compte à
deux chiffres des classes 6 et 7, intitulé lu dans le plan du dossier ; résultat des
ACTIVITÉS ORDINAIRES, H.A.O. et impôt exclus. (2) Réalisé en MOUVEMENT, clôture
exclue. (3) Produits suivant la croissance, charges au réalisé tant qu'aucun taux
n'est DÉCLARÉ ; taux illisible refusé. (4) Prévu au prorata des JOURS, à la DATE
D'ARRÊTÉ même sur exercice clos (audit final F148), 1 à sa date de fin ; autre durée
signalée, jamais corrigée. (5) Seuls les seuils de la simulation colorent, l'écart
DÉFAVORABLE seul. Hypothèses seules enregistrées ; définies par `peutValider`, lues
par tous.

**L'immatriculation imprimée (2026-09-28, passe O2).**
`tenant/mentions-immatriculation.ts`, `mentionsEmetteur` (pièces, en-têtes,
relances). (1) AUDCG art. 59 · toute personne immatriculée, numéro ou manque dit ;
coopérative hors RCCM, entité publique sans reproche. (2) Livres de commerce (art.
14) · coiffe et pied (`IdentiteEtat.immatriculation`). (3) Entreprenant non
immatriculé (art. 64) · `numeroDeclarationActivite` et « Entreprenant dispensé
d'immatriculation » (art. 62) ; RCCM refusé à lui, déclaration aux autres. (4)
Locataire-gérant (art. 140) déclaré (`locataireGerantFonds`, null = pas dit), jamais
pour l'entreprenant (art. 138) · qualité imprimée en tête, avec le RCCM.

**Pièces imprimées · facture de vente et devis (2026-09-26).** AUSCGIE art. 17. (1)
Mentions RECOPIÉES à la date de la pièce (`mentionsSocieteEmetteur`) ; une pièce
antérieure le DIT, jamais n'emprunte celles du jour ; note de crédit · celles de la
facture annulée. (2) Seule une pièce ÉMISE s'imprime. (3) « système de facturation
non homologué (décret n° 23/10, art. 22) · ce n'est pas une facture normalisée » est
IMPRIMÉ ; manque de l'art. 17 à l'écran seul ; devis · hors taxes (AUDCG art. 263),
fermeté si déclarée avec délai (art. 242), délais des art. 258 et 259.

**Lots de virements récurrents (2026-09-26).** `reglements/lots-virement.ts`,
`client/src/lib/lots-virement.ts`. (1) Un lot ne PAIE rien, il PRÉSÉLECTIONNE ; le
règlement garde ses règles. (2) Plus anciennes d'abord jusqu'au montant habituel,
dernière en partiel, jamais au-delà du dû, dit. (3) Sans facture ouverte, rien
(avance au 409). (4) Comptes 40 de détail hors 408 et 409 (`estEcheanceAReglerSur`),
une fois, RESTRICT ; journal de trésorerie.

**Menus et refus par profil (2026-09-26, décision de Manasse).**
`docs/audit-modules-par-profil.md`, cinq profils. (1) MASQUER N'EST PAS REFUSER ·
`client/src/lib/profil-dossier.ts` (`chemin`, `filtrerParProfil`), route ouverte,
rien supprimé ; `sousFonctionServie` masque lots et ordres de virement, composants,
reconstitution d'une révision majeure, réévaluation des devises, l'existant restant
accessible ; Devises reste au SMT (audit final F178, cours de la paie en dollars).
(2) Le SMT garde tiers, facturation, lettrage, variation de stocks (notes 2 et 3) et
registre des donateurs (SYCEBNL art. 17). (3) Refus serveur
(`src/common/systeme-minimal.ts`) · dépréciation d'immobilisation aux deux SMT ; au
SMT SYSCOHADA seul unités d'œuvre, dégressif, nouveau dérogatoire (Titre X, «
linéaire ») ; rien à transposer au SYCEBNL ; reprise et solde ouverts. (4) 69 et 85
lus en F au SMT SYSCOHADA (G égal au résultat du bilan) ; 15, 19 ou 29 manuels ·
`SMT_COMPTE_SANS_POSTE`. (5) Un fait ne masque que DÉCLARÉ · `CHEMINS_SELON_UN_FAIT`
(accord-cadre hors ONG de droit étranger) ; trois réponses
(`tenant/faits-declares.ts`) · `assujettissementTvaRepondu` (le faux par défaut
n'est pas « non »), `venteBiensServices` ; « non » à la TVA masque la déclaration,
aux ventes les devis, la facturation ne tombe que sur les DEUX (O.-L. n° 10/001,
art. 56) ; « pas encore dit » remet `assujettiTva` à faux ; la paie ne se masque
pas.

**Lieux des biens (2026-09-26).** `LieuBien`, `Immobilisation.lieuId` · aucun effet
comptable ; lieu porteur non supprimable (RESTRICT, nombre dit) ; lieu d'un autre
dossier inexistant. Nature d'acquisition de Sage non reprise.

**Bulletins modèles (2026-09-26).** `personnel/modeles-bulletin.ts`,
`ModeleBulletin`. (1) Pré-remplit, ne décide rien. (2) Rubrique désactivée ou d'un
autre dossier refusée, signalée à l'application. (3) Hors modèle · art. 69, 8, art.
68, 1, retenues d'avance, personnes à charge. (4) `deviseStipulation`, jamais
`devise`, monnaie de tenue (`monnaie-de-tenue.spec.ts`).

**Compte en sommeil (2026-09-25).** POST et PATCH `/ecritures` refusent sans
`confirmerComptesEnSommeil`, au CONTRÔLEUR, jamais dans `creer` (clôture et
modules).

**Installation sur site (2026-09-26, décision de Manasse).** Licence en FICHIER
SIGNÉ, PC Windows serveur (`src/modules/sur-site/`, `installation/`,
`paquet-sur-site.yml`, `docs/installation-sur-site.md`,
`MODE_INSTALLATION=SUR_SITE`). (1) Ed25519, clé PRIVÉE de VMG ; code à clé PUBLIQUE,
jamais lue dans l'environnement (`cle-publique-editeur.ts`) ; ordre FIXE
(`serialiser`). (2) MachineGuid haché, jamais une adresse MAC ; `finMaintenance`
borne les VERSIONS (`version-sur-site.json`, jamais l'horloge), `expiration` l'USAGE
(null = perpétuelle) ; horloge reculée de plus d'un jour sous la date la plus
tardive vue = suspension. (3) Le fichier remplace la licence par dossier
(`LicenceService.evaluerLicence`), plafond hors combinaison (audit final F170),
émission ANTÉRIEURE refusée ; en ligne PERPETUEL_ONPREMISE refusé (F171) ; état et
dépôt PUBLICS. (4) Sauvegardes hors `LicenceGuard` · quotidienne tentée chaque
heure, mot de passe de `pg_dump` en variable d'environnement, copie AVANT chaque
migration (`demarrer.cjs`, version par le COMMIT). (5) PostgreSQL majeur GELÉ, refus
avant toute copie (`initialiser.ps1`). Cookie sans `secure` ; secrets au générateur
cryptographique ; Service réseau sur la base. Dossier d'installation (audit final
F44, `dossierDInstallation`) · son administrateur seul sauvegarde et crée
(`AdministrateurInstallationGuard`, `POST /sur-site/dossiers`, sans session) ;
`INSCRIPTION_PUBLIQUE` non lue, inscription au seul poste vide. Copie externe
CHIFFRÉE (AES-256-GCM, clé scrypt d'une phrase, `chiffrement-sauvegarde.ts`), jamais
un secret QUE local ; clé dérivée dans `sauvegarde-externe.json` (F192), la PHRASE
jamais ; sans phrase rien ne part ; `dechiffrer-sauvegarde.cjs` par le module du
serveur.

**Sur site, la mise à jour (2026-09-28, audit final F191 à F193, F265).** (1) Copie
jamais ÉCRASÉE (WinSW relance) · `.partiel`, nom horodaté, puis
`derniere-version.json` (`enCours`) ; migration non aboutie = copie REPRISE
(`planMiseAJour`, `copies-avant-mise-a-jour.ts`) ; repère illisible = copier. (2)
`initialiser.ps1` ferme `C:\ProgramData\OmegaX` (système et administrateurs, Service
réseau en traversée) ; un `DOSSIER_SAUVEGARDES` déplacé n'est pas restreint, dit.
(3) Licence vérifiée AVANT copie et migrations, par le service COMPILÉ
(`motifRefusMigration`, `versionCouverte`) ; seule une licence authentique de CE
poste hors couverture bloque ; sans licence lisible, démarrage ; refus avec l'état
(`etatDeLaBaseAuRefus`, « à moitié migrée »). (4) Série
`omegax-AAAAMMJJ-HHMMSS-avant-mise-a-jour-<version de la base>.dump`, tournée à part
(cinq, `SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER`), recopiée hors du poste, gardée
avant une migration non aboutie ; règles chargées par `moduleCompile`, sinon arrêt.
Specs de `src/modules/sur-site/` ; `icacls` et WinSW à constater au premier paquet.

**Abonnements des cabinets (2026-09-26, grille décidée par Manasse).** Essentiel,
Standard, Cabinet, option Groupe, paie en option de l'Essentiel, mensuel ou annuel,
trente jours d'essai (`src/modules/plateforme/abonnements/`). (1) Factures dans le
dossier de VMG (PROPRIETAIRE) par `FacturationService.enregistrer` ; TVA selon
`Tenant.assujettiTva`, taux du dossier, jamais en dur ; session dans ce dossier. (2)
Prix en dollars SAISIS · sans prix, période REFUSÉE ; facture en francs au cours du
JOUR saisi, refusée sans lui. (3) L'essai couvre tout mois commencé avant sa fin,
mois entamé au début non facturé, aucun prorata ; annuel tous les douze mois. (4)
Une période UNE fois (second clic retiré) ; facture non supprimable (note de
crédit). Tables HORS DOSSIER (`MODELES_HORS_DOSSIER`, `cabinetId` et non `tenantId`)
; `PlateformeService.dossierEditeurId` hors cloisonnement (audit final F173) ;
tranches (F260, `PLAFOND_LISTE_CONSOLE`, `tronque`, `pageApres`).

**La licence suit l'abonnement (2026-09-26).** Abonnement = licence ABONNEMENT,
prolongée par l'ENCAISSEMENT déclaré (ni futur ni antérieur à la facture,
`PlateformeService.echeanceAbonnement`). (1) QUINZE jours (`DELAI_PAIEMENT_JOURS`)
après l'essai (ou le début), puis la période payée. (2) Échéance jamais RECULÉE ;
paiement sur facture impayée seule. (3) Licence AVANT l'écriture · perpétuelle ou de
l'éditeur, refus. (4) Cellules alignées sur la mère (audit final F46,
`licenceDeCellule`) ; l'éditeur hors groupe ; `modifierLicence` hors cloisonnement.

**Factures et licences par courriel (2026-09-26).**
`abonnements/courriels-editeur.ts`, `CourrielsEditeurService`. (1) File
(`CourrierService.mettreEnFile`) · SANS_TRANSPORT, « en file », jamais « envoyé ».
(2) Facture en TEXTE (numéro, émetteur, art. 17, lignes, totaux, cours, « non
homologué »), jamais une seconde maquette ; adresse saisie, sinon du tiers, sinon
rien. (3) Licence en pièce jointe texte (`Message.pieceJointeTexte`). (4) Un échec
d'envoi ne défait jamais la facture.

**Dossiers de démonstration (2026-09-26).** Une association (SYCEBNL), une SARL
(SYSCOHADA), UNE par référentiel. (1) Comptes du scénario
(`plateforme/scenario-demonstration.ts`) = modèles de saisie, sens compris ; tiers
par compte INDIVIDUEL, trésorerie par BQ. (2) Chemins ordinaires
(`GarnissageDemonstrationService` · `TiersService.creer`, `EcritureService.creer`,
`valider`), sortie de cloisonnement déclarée. (3) Écritures VALIDÉES, factures
OUVERTES à dessein, fictif dit. (4) Vitrine interrompue complétée par « Ouvrir »
sans recréer (audit final F174).

**Écriture depuis une facture (2026-09-26).** `facturation/ecriture-facture.ts`,
`ComptabilisationFactureService`. (1) Fiches des comptes 40 et 41 · vente, client au
débit du TTC, produit et 443 au crédit ; achat, charge (ou immobilisation) et 445 au
débit, fournisseur au crédit ; note de crédit inverse ; le tiers reçoit la somme
EXACTE des autres lignes. (2) Rien de deviné · journal et compte CHOISIS (classe 7
vente, 6 ou 2 achat, vérifiée), TVA au TAUX de la ligne, tiers à son compte
principal ; manque ou autres impôts et taxes, rien passé. (3)
`EcritureService.creer` au brouillard, liaison sur facture libre (second clic
retiré).

**TVA · le livre-journal seul (2026-09-27, audit final F25).** Déclaration, prorata,
liquidation sur écritures VALIDÉES (AUDCIF art. 22, 2°) ; TVA au brouillard NOMMÉE
(`tvaAuBrouillard`), liquidation de la période REFUSÉE (une ligne validée ensuite
échapperait à toute déclaration).

**Retenues · l'ouverture (2026-09-27, audit final F26).** `soldesDOuverture` ·
report à-nouveau VALIDÉ, ou reconstitué depuis le dernier report validé ; ligne
antérieure imputée la première, à l'échéance du dernier mois avant l'exercice ; le
report n'est pas une retenue de janvier.

**Sortie d'immobilisation (2026-09-27, audit final F27 et F28).** Dotation arrêtée à
la sortie (fiche du COMPTE 81), en mois, mois de sortie compris (« 180 × 9/12 ») ;
SMT SYSCOHADA sans prorata. Refus AVANT le verrou du statut, sinon `defaireSortie`.
Principal avec composants en service refusé (F127). Produit de cession RETENU (F130,
`ecritureProduitCessionId`, RESTRICT, `COLONNES_QUI_RETIENNENT`).

**La famille donne ses défauts (audit final F128, F129).** Mode absent = celui de la
famille, avec ses préalables ; famille EN SOMMEIL fermée. Tableaux retranchant les
29 (F131, colonne « Dépréciations »).

**Bien repris (2026-09-27, audit final F32).** Acquis avant l'ouverture · fiche SANS
écriture d'acquisition (`ecritureAcquisitionId` nullable, `onDelete: Restrict`
déclaré), qui doublerait le brut ; `repris` réservé à ce cas, qui sans lui est
refusé ; amortissement antérieur sur bien repris seul.

**Premier exercice long (2026-09-27, audit final F34).** AUDCIF art. 7 · aucun
plafond à douze mois ; `src/common/mois-entre.ts` ; SMT SYSCOHADA, une annuité par
exercice (« sans prorata temporis ») ; dégressif par année civile (loi n° 23/053,
art. 12).

**Boni et mali (2026-09-27, audit final F35, F36).** Confrontation à la DATE DU
COMPTAGE ; différence inscrite au magasin à cette date, liée à l'écriture (mali en
sortie, boni en entrée au coût porté) ; inscription refusée = écriture retirée.

**Budgets (2026-09-27, audit final F37 à F39).** `doterBudget` · ligne ANNUELLE
(`mois` nul), seule lue par l'exécution, ET mensuelles ; retouche par `findFirst`
dans la transaction, jamais la clé composée à `mois` nul ; NULLS NOT DISTINCT ;
au-delà de douze mois, annuelle seule.

**Liasse du groupe (2026-09-27, audit final F41).** À-nouveau, mouvements, solde de
gestion (`colonnesDeCombinaison`), chaque élimination dans sa colonne ; ouverture
réciproque non compensée prise sur les mouvements, avec avertissement. Naissance de
dossier ENTIÈRE au nom du dossier qui naît (F271).

**Classe d'un compte (2026-09-27, audit final F40).** `classeDuNumero`, serveur et
écran ; classe contradictoire refusée ; comptes existants migrés.

### Migrations écrites à la main

Une migration écrite à la main peut DIVERGER du schéma sans que rien ne le
dise : Prisma applique la SQL telle quelle et ne la compare pas au modèle.
Après toute migration ajoutée, passer

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" --exit-code
```

sur une base jetable. Le 2026-09-03, ce contrôle a trouvé une dérive réelle :
Prisma pose `ON DELETE SET NULL` par défaut sur une relation FACULTATIVE, là
où la migration disait `RESTRICT`. La règle voulue était bien `RESTRICT` · le
schéma la déclare désormais explicitement, plutôt que d'aligner la SQL sur un
défaut qu'on ne voulait pas.

**Document dû des deux côtés, sorti des deux.** `@ReferentielsAutorises` sur un
document qu'UN SEUL texte impose. Ouverts · livre d'inventaire (SYCEBNL art. 14 ·
AUDCIF art. 19), rapport (SYCEBNL art. 16-3 · AUSCGIE art. 138 · AUSCOOP art. 108).
Fermés · registre des donateurs, jeu « projets de développement », éligibilité au
Système minimal (RESSOURCES, art. 5 et 6 ; CHIFFRE D'AFFAIRES, art. 13). Le service
doit AIGUILLER (`parite-documents-obligatoires.spec.ts`).

**PASSE F2a · TVA, ordonnance-loi n° 10/001, chapitres I à IV (2026-09-13).**
Journal · `docs/releve-de-manques-fiscal.md`.

**LA NATURE SE LIT À LA CONTREPARTIE, JAMAIS AU COMPTE DE TVA (art. 6 et 8).**
`client/src/lib/tva-syscohada.ts` · 70720000, 70730000, 70760000 (racine **707**,
ex-44310000) sont des services de l'art. 8 (« les opérations d'entremise », « les
locations de biens meubles », « les opérations portant sur des biens meubles
incorporels »), exigibles à l'encaissement (art. 25, 2°) ; de même 60510000,
60520000, 60570000 (racine **60**, ex-44520000). Contrepartie · classe 7 en vente, 6
et 2 en achat, plus longue racine, TVA en repli. 60580000, 70710000, 70780000 et
contreparties discordantes · INDETERMINEE, montant annoncé.

**L'ART. 26, AL. 3 VISE LA COLLECTE.** « […] au moment de l'encaissement du prix ou
de l'acompte si celui-ci intervient avant les débits » · avances en 419, sans taxe ·
DÉCLARATION CHIFFRÉE, hypothèse « DANS LE CAS USUEL » supprimée du schéma.

**UN TEST NE DOIT PAS INTERDIRE DE DÉCLARER UNE LACUNE.** Art. 25 et 26 · points 1
et 2 seuls servis (non · importation et zone franche, escompte d'effet, crédit-bail,
préfinancement des cultures pérennes, mutation d'immeuble) ;
`hors-scope-tva.spec.ts` · RÉSERVE EXACTE, jamais un numéro banni (§10 bis).
**Doublure** · `findMany` rend ce qu'on lui donne ; tester le `where` (comme
`findFirst`, passe I2).

**QUATRE LACUNES NOMMÉES** · art. 22, 3° (« utilisé ou exploité au pays ») ; art.
23, al. 2 (représentant agréé, taxe ET pénalités) ; art. 27 point 10, 31, 32, 33 et
34, réserve non tranchée (« prix d'achat », « prix de revient », non-assujettis) ;
art. 6, cessions d'actifs, avant art. 50 et 51 ; art. 24, 6° et 7°, promoteurs
immobiliers.

**LA LIQUIDATION SOLDE LE COMPTE DE CHAQUE LIGNE, JAMAIS CELUI DU TAUX (2026-09-27,
audit final F121, F122).** La taxe va sur la subdivision que la contrepartie appelle
(4432, 4453, 4454) ; solder le seul compte du taux laissait le 4431 débiteur et le
4432 créditeur. La déclaration cumule par compte (`parCompte`), la déduction se
répartit au centime (`repartirAuCentime`), un écart plus grand qu'un arrondi lève.
Le POURCENTAGE d'un taux porté par des lignes ne change plus · le prorata
reconstitue la base au taux de la ligne.

**PASSE F2b · ordonnance-loi n° 10/001, chapitres V à X (2026-09-13)** ; F2 close.
Journal de toutes les passes : `docs/releve-de-manques-fiscal.md`. **L'ART. 41 VAUT
AU SYCEBNL** (l'art. 41 était fermé à tort) · « Le plan SYCEBNL n'a ni 6383 ni 6384
ni 6181 : ses charges externes sont agrégées en 61800000 et 63800000 » était faux
(`compte-seed.ts` l. 824, 887, 888, 822) · une ASBL assujettie déduisait 100 % de la
TVA sur réceptions, missions et voyages. `partExclueArt41` ne lit plus le
référentiel : le NUMÉRO SEMÉ décide, une racine sans compte ne déclenche rien
(62760000 « Cadeaux à la clientèle », SYSCOHADA seul), un compte n'est retenu que si
son INTITULÉ SEMÉ reprend les mots de l'article. CE QU'ON AFFIRME DU PLAN SE VÉRIFIE
CONTRE LE PLAN · `exclusions-art41-semees.spec.ts` relit les deux semis et exige
chaque racine ouverte sous l'intitulé qui la justifie. **UNE INTERDICTION DE MOT EST
TOUJOURS TROP LARGE** · `hors-scope-tva.spec.ts` bannissait « art. 63 » et bloquait
un manque fondé (crédit dont le remboursement a été demandé, art. 66) ; il lit la
TÊTE de chaque puce, qui ne prend pas pour SUJET un article couvert. On exige la
réserve exacte, on ne bannit jamais un numéro. **PRODUITS PÉTROLIERS COMPTÉS, JAMAIS
AMPUTÉS** · le 60420000 « Matières combustibles » tombe sous les 3°, 3° bis
(exceptions qui se recouvrent, règlement de renvoi hors corpus) et 3° ter (50 % «
pour les cas autres ») : DÉDUIT, compté à part, annoncé avec ses trois points.
**ONZE LACUNES NOMMÉES AVEC LEUR RÈGLE** · art. 53 al. 2 et son amende (art. 74 ter)
; art. 66 ; perte du droit à déduction après taxation d'office (art. 69 ter) et
après manquement au paiement scriptural au seuil de 1 000 000 FC (art. 59 bis et 74
bis) ; taxe due du seul fait de sa mention et trois amendes du triple (art. 59, 70,
71 et 74 al. 2), qui supposent de rapprocher FACTURE et ÉCRITURE ; art. 40 al. 2 ;
art. 42 point 1 (dépenses accessoires, trois contre-exceptions) ; points 3 et 4 de
l'art. 42 ; art. 43 al. 3 (ventes aux missions diplomatiques au numérateur · sans
compte, le prorata BAISSE) ; art. 45 al. 1 (nouvel assujetti) ; art. 36 point 4
(l'écriture d'immobilisation, à DEUX lignes, n'a pas de place pour la taxe).

**PASSE F3a · décret n° 011/42, chapitres I à III (2026-09-16).** Les confronteurs
reçoivent journal et hors-scope, et ne resignalent pas un manque nommé. **QUAND UNE
LECTURE SE DÉPLACE, RELIRE LES GARDES QUI LA PRÉCÈDENT** · `natureOperation`
écartait le SYCEBNL car il « ne subdivise ni 443 ni 445 », motif périmé depuis que
F2a lit la nature à la CONTREPARTIE (classes 6 identiques) · la TVA d'électricité se
déduisait à la facture au lieu du paiement du fournisseur. **UNE CORRECTION PEUT
CRÉER LE DÉFAUT QU'ELLE CORRIGE** · un numéro, deux sens : le 70510000 est « Dans la
Région » sous 705 « Travaux facturés » (SERVICE) au SYSCOHADA, « Ventes de
marchandises » au SYCEBNL. La table des PRODUITS reste au SYSCOHADA (sinon
déclaration MINORÉE) ; le 601 (« Achats de biens ET SERVICES liés à l'activité » au
SYCEBNL) ne tranche pas. **LA LOCATION-VENTE EST UNE LIVRAISON DE BIENS** (décret,
art. 10 ; hors décomptes successifs, art. 51 ; datée au transfert du pouvoir de
disposer, art. 52) · pour le 62340000, `6234` prime `62`, sans quoi la déduction
différée risquait la déchéance de l'art. 37 al. 2 ; une location simple reste un
service.

**LA MENTION DE L'ARTICLE 60 SE CONTRÔLE** (« Autorisation d'acquitter la TVA
d'après les débits », due par le prestataire de services ou l'entrepreneur de
travaux publics ou immobiliers) · `verifierMentions` rendait `conforme: true` sans
elle. Elle ne pèse que sur celui qui DÉLIVRE et est AUTORISÉ ; aucune amende
chiffrée, sans dispense (l'art. 97 bis vise TOUTE mention, passe F9). SUR UN ACHAT
ELLE SE LIT (audit final F228) · `Facture.mentionTvaDebits`, confrontée à la fiche
du fournisseur (`mentionDebitsLueSurLaFacture`), jamais pour DATER la déduction.
**L'AUTORISATION AUX DÉBITS A UNE PÉRIODE, ET L'ART. 62 AVANCE CE QU'ELLE RETARDE
(2026-09-28, décision de Manasse, pratique d'Odoo et de Business Central).** La
fiche du fournisseur date toujours la déduction. `Tiers.dateEffetAutorisationDebits`
et `dateRevocationAutorisationDebits`, nullables sans défaut · la décision ou le
silence de dix jours la fait naître (décret n° 011/42, art. 59), la demande écrite y
met fin (O.-L. n° 10/001, art. 26 al. 2 ; décret art. 63), la révocation vaut à sa
date, comprise (`situationAutorisationDebits`). QUATRE RÈGLES À NE PAS DÉFAIRE. (1)
Hors période, droit commun, fournisseur nommé ; autorisé SANS date d'effet,
l'anticipation est gardée et dite non datée (retirer d'office changerait le passé) ;
même règle pour la collecte, bornée par `Tenant.dateAutorisationDebitsTva`. (2) Deux
signaux, aucune date · mention sous une fiche non autorisée ou hors période, fiche
autorisée dont la facture omet la mention (art. 60). (3) Art. 62 · un règlement
LETTRÉ antérieur au débit rend exigible SA part, le reste au débit
(`tranchesAuxDebits`) ; un groupe portant d'autres factures reste au débit. (4) La
requête lit aussi la facture postérieure dont un règlement lettré tombe dans la
période.

**UNE ASSOCIATION PEUT ÊTRE ASSUJETTIE** · « une association ne l'est pas de plein
droit » n'a aucune source : l'art. 42 du décret vise « les personnes physiques ET
MORALES » au seuil. Le propre de l'ASBL tient aux EXONÉRATIONS (art. 15, 2° et 17,
8°) ; une activité accessoire taxable compte. L'écran sert le chiffre d'affaires
HORS TVA de l'art. 42, mesuré par l'art. 43. **UNE LACUNE AU DÉCLENCHEUR FAUX INVITE
À PAYER L'INDU** (forme du § 10 bis) · la dette du client naît de l'absence de
DÉSIGNATION d'un représentant, pas d'AGRÉMENT (le silence de l'Administration vaut
agrément). Réserves du décret · contrats d'ABONNEMENT à décomptes proportionnels,
exigibles à l'expiration de la période (art. 55) ; EFFETS DE COMMERCE, « à la date
de l'échéance de la traite, même si elle a été remise à l'escompte » (art. 57,
alinéa 2).

**PASSE F3b · décret n° 011/42, chapitres IV à XII (2026-09-17)** ; F3 close.
**QUAND UNE CORRECTION DÉRIVE UNE BRANCHE, LIRE LE TEXTE DE LA BRANCHE DÉRIVÉE**,
jamais le déduire d'un écart de dates. F1 avait retiré à la branche antérieure
l'adresse exacte (« Ni l'adresse exacte ni le montant des autres impôts et taxes ne
lui sont réclamés ») ; le décret n° 011/42, art. 100, l'exige à ses DEUX premiers
tirets (vendeur ou prestataire, client), et l'art. 104 EXCLUT DU DROIT À DÉDUCTION
la pièce non conforme · la sanction atteint la taxe (une facture de 2022 sans
adresse sortait `conforme: true`). Seule différence : neuf groupes à l'art. 100, dix
à l'art. 26 (le montant des autres impôts et taxes). Un test écrit dans la foulée
d'une correction gèle ses erreurs · sa prémisse sur le TEXTE se vérifie aussi.
**SEUIL DE L'OBJET PUBLICITAIRE** (art. 107) · « le bien dont la valeur unitaire est
INFÉRIEURE À 10.000,00 FRANCS CONGOLAIS », réajustable par le Ministre des Finances.
`LigneFacture` porte `quantite` et `prixUnitaire` (item I1), mais la déclaration lit
des ÉCRITURES à montant global · le montant reste déduit, la mention porte le seuil
et dit OÙ la condition se vérifie. **UNE PASSE SE DÉCOUPE POUR TENIR DANS UNE VIE DE
CONTENEUR**, sur la DURÉE autant que sur les lignes · `resumeFromRunId` ne rejoue
pas le cache.

**PASSE F4a · IS, loi n° 23/053 du 30 novembre 2023, Titre 2, champ et produits
(2026-09-17).** **L'ART. 5 DISCRIMINE PAR QUALITÉ DE LA PERSONNE** ·
`avertissementRegimeImpot` disait à tout SYSCOHADA « La société est redevable de
l'impôt sur les sociétés (art. 3) » (30 avril, trois acomptes), or un ÉTABLISSEMENT
PUBLIC (art. 5, 1°) et une COOPÉRATIVE AGRICOLE DE FORME CIVILE (art. 5, 2°) y sont
tenus ; `retenues.service.ts` charge `formeJuridiqueSyscohada`. L'écran POSE la
question · l'art. 5, 1° vise les établissements publics « en vertu de leurs statuts
» et les organismes « dont les ressources proviennent uniquement de subventions
budgétaires » (art. 3 · exploitation lucrative) ; l'art. 5, 2° pose DEUX conditions
cumulatives dont la FORME CIVILE, que le dossier ne dit pas. **EXEMPTION ET
EXONÉRATION DIFFÈRENT** · art. 2, 10°, dispense « de DÉCLARATION ET DE PAIEMENT » ;
11°, dispense « totale ou partielle de PAIEMENT ». « Ne dispense pas non plus de
DÉCLARER » vaut des impôts retenus pour autrui, pas de l'IS de l'ASBL. **RISTOURNES
(art. 11, 3°)** · deux catégories seulement, celles versées « aux associés, en tant
que ristournes et avantages provenant d'achats ou de ventes effectués par les
NON-ASSOCIÉS » et « aux non-associés » ; la ristourne ordinaire n'est pas
réintégrée. **BORNE DU 1er JANVIER 2026** · `deficitsAnterieursCalcules` et
`chiffresAffairesAnterieurs` recalculent jusqu'à trois exercices sous la loi n°
23/053 · ON AVERTIT, ON NE BLOQUE PAS (texte antérieur hors corpus), et le chiffre
se dit SIMULATION. TERRITORIALITÉ (art. 7, « uniquement » les bénéfices réalisés en
RDC) · dite, dans ses deux sens (F4b). **LE CÂBLAGE SE TESTE AVEC LA RÈGLE** · le
spec du point d'appel s'écrit en même temps.

**PASSE F4b · loi n° 23/053, Titre 2, charges, taux, liquidation (2026-09-17)** ; F4
close, 4 sur 31. **ART. 57, L'ÉGALITÉ** · `minimum > theorique` est STRICTE, et
l'égalité affirmait « Impôt sur le bénéfice net imposable au taux de 30 %, SUPÉRIEUR
à l'impôt minimum » · cas de toute société DÉFICITAIRE à chiffre d'affaires nul (lu
sur les seuls 701 à 707 · holding en 77, démarrage, produit en 84). Trois cas, le
déficitaire nommé (« lorsque les résultats sont déficitaires »), réserve sur le
chiffre d'affaires DÉCLARÉ. Anomalie non tranchée · « chiffre d'affaires déclaré »
(art. 57) contre « hors taxes » (art. 36, 43, 49). **REPORT DÉFICITAIRE EN
EXERCICES** · art. 51, alinéa 1er, « jusqu'au TROISIÈME EXERCICE QUI SUIT », borne
de DATE qui DOUBLE le `take: 3` de `deficitsAnterieursCalcules` (le `take` protège
des longues histoires, la date dit le droit) · `validerArticle7` ne vérifie que la
fin au 31 décembre et l'unicité, et un dossier tenant 2020, 2021 puis 2026 imputait
le déficit de 2020, éteint au 31 décembre 2023. **LA TERRITORIALITÉ A DEUX SENS** ·
« TROP LARGE · à retrancher » vaut d'une exploitation étrangère BÉNÉFICIAIRE ;
DÉFICITAIRE, ses pertes « ne sont pas déductibles » (art. 51, alinéa 3) · base TROP
ÉTROITE, à RÉINTÉGRER. La confrontation vise aussi le code de la veille. **LA
DOUBLURE DOIT HONORER LA REQUÊTE** · celle de `exercice.findMany` n'honorait que
`lt`, pas `gte` (de même `findFirst` en I2, `ecriture.findMany` en F2a) · ce qui
dépend de ce qu'une requête RAMÈNE se teste sur la requête. **TROIS ANOMALIES
BORNENT L'AMORTISSEMENT**, non comblées · art. 32, 1. exclut du dégressif les durées
« inférieures à quatre (4) ans » quand l'art. 33, 1., a) prévoit un coefficient « de
trois (3) à quatre (4) ans » ; aucune tranche entre quatre et cinq ans ; l'art. 28
renvoie à un arrêté absent · le barème de l'arrêté n° 013/2025 reste À CONFRONTER à
ce renvoi.

**LE NUMÉRO 23/10 PORTE DEUX TEXTES DE 2023** · un numéro, deux sens : **Décret n°
23/10 du 3 MARS 2023** (facture normalisée, passe F1) et **Ordonnance-loi n° 23/10
du 13 MARS 2023** (Code du numérique, passe D4 · une fenêtre de confidentialité
aujourd'hui). `src/` ne porte que « décret n° 23/10 du 3 mars 2023 ». Le Code du
numérique se cite « ordonnance-loi n° 23/10 du 13 mars 2023 » EN ENTIER, jamais par
son numéro seul, distinction gelée DANS LES DEUX SENS (modèle des deux articles 11
de `retenues.spec.ts`). La réserve « OCR non collationné » est périmée (réextrait du
PDF natif le 05/09/2026) ; la qualification par un juriste reste due.

**PASSE F10 · loi n° 004/2003, Livre II, Titres V à VII (2026-09-18)**, passes
ordonnées du moins au plus volumineux. **L'ART. 110 BIS, alinéa 2 (art. 110 bis
LPF), REPORTE L'ÉCHÉANCE** tombant un jour NON OUVRABLE « au premier jour ouvrable
qui suit ». `enRetard` tirait d'une date brute un retard rouge (registre, tableau de
bord, non-déductibilité de l'art. 20) · le 15 février 2026, dimanche, faisait « 1
mois en retard » le 16. Règle unique, `retenues/jour-ouvrable.ts`, appelée par les
quatre calculs d'échéance. L'alinéa 3 laisse l'Administration fixer l'échéance « au
jour ouvrable PRÉCÉDANT » · en réserve, jamais calculé. **LA CONSIGNATION DU DIXIÈME
N'EST PAS UN ACOMPTE (art. 110, alinéa 2)** · le sursis sur réclamation d'un
supplément oblige à « VERSER un montant égal au DIXIÈME du supplément d'impôt
contesté », reçu au 4492 (`startsWith('4492')`), dont le sort suit la réclamation.
L'écart du 4492 ne renvoie plus sans condition à l'art. 98 bis · message scindé par
le SENS de l'écart, consignation nommée avec sa limite (pas de sursis sur taxation
d'office, alinéa 3), ventilation au cabinet. Le test de l'ONEM fige l'ORDRE des deux
échéances, plus l'écart de cinq jours. **FICHIER TRONQUÉ**, à signaler à Manasse ·
`25-mesures-execution-reclamations-recours-am013-2015.md` s'arrête ligne 71 dans
l'article 7 (« La décision de clôture d'instruction du recours gracieux n'est pas
susceptible ») · rien ne se code sur les recours après rejet gracieux avant
complément.

**UNE ÉCHÉANCE SE LIT AU JOUR DE KINSHASA (2026-09-27, audit final F81).**
`common/echeance.ts` · un jour est une date à minuit UTC, jamais locale (minuit à
Kinshasa = 23 h UTC la veille) ; « aujourd'hui » est `jourDeKinshasa` ; dépassée au
LENDEMAIN seulement (`echeanceDepassee`). Le registre des retenues,
`jour-ouvrable.ts` et le planning de clôture la suivent, le planning ne reportant
que ses échéances FISCALES (`echeanceFiscale`). Un test qui fait varier le fuseau
lance un processus fils.

**LE JOUR OUVRABLE FISCAL · TROIS EXCLUSIONS, CHACUNE SA SOURCE ET SA BORNE
(2026-09-18).** La loi fiscale ne définit pas le mot · la question est DEVANT QUI
l'obligation s'exécute, et l'emprunt se justifie. (1) DIMANCHE, de tout temps · Code
du travail, art. 7, 9° (repos hebdomadaire et jours fériés légaux exclus) et art.
121, alinéa 2 (« Il a lieu le dimanche »). (2) SAMEDI, depuis le 17 février 2024 ·
l'échéance s'exécute au guichet, et le DÉCRET N° 24/09 DU 17 FÉVRIER 2024, art. 1er,
fixe l'horaire des services publics « DU LUNDI AU VENDREDI » (en vigueur à la
signature, art. 51) ; le Code du travail (base de 26 jours) régit employeur et
travailleur, pas l'Administration. Le 25 juillet 2026, première échéance d'acompte
d'IS, est un samedi. Réserves · le décret fixe un HORAIRE, pas le « jour ouvrable »
fiscal ; son art. 2, al. 3 admet des horaires ministériels spécifiques. (3) DIX
JOURS FÉRIÉS, depuis le 30 mars 2023 · ORDONNANCE N° 23-042 DU 30 MARS 2023 (J.O.
RDC, 15 mai 2023), prise sur l'art. 123 du Code du travail, abrogeant l'ordonnance
14-010 du 14 mai 2014 (hors corpus) ; art. 1er, dates FIXES · 1er, 4, 16 et 17
janvier, 6 avril, 1er et 17 mai, 30 juin, 1er août, 25 décembre ; AUCUNE FÊTE
MOBILE, liste limitative ; art. 4, effet « à la date de sa signature ». SON ART. 2
N'EST PAS CALCULÉ · un férié tombant un DIMANCHE fait prendre le congé « LE JOUR
PRÉCÉDENT » (le congé RECULE quand l'échéance AVANCE) · le samedi précédent reste
ouvrable, réserve écrite (en 2027, le 17 janvier est un dimanche et le 16 déjà férié
· l'ordonnance se tait).

**ON GÈLE UNE PRÉSENCE, JAMAIS UNE ABSENCE DE MOT DANS UN FICHIER** · les
bannissements (`art. 98 bis` en `not.toContain`,
`not.toMatch(/paques|ascension|.../i)`, `/paques/i`, `vise les mentions du décret n°
23/10`, `/!== 'ENTREPRISE_INDIVIDUELLE'/`) tombent sur le commentaire qui explique
la correction. Le test des fériés gèle la PROPRIÉTÉ (entiers littéraux, aucune
arithmétique de date) ; on gèle un appel, une valeur servie.

**PASSE F9 · barème des sanctions, loi n° 004/2003, Livre II, Titre IV
(2026-09-18).** Sur un texte déjà codé, VÉRIFIER CE QUE LE DÉPÔT AFFIRME. **L'ART.
97 BIS VISE « TOUTE omission d'une mention obligatoire constatée dans une facture ou
un document en tenant lieu »**, pas les seules du décret n° 23/10 · créé par l'O.-L.
n° 13/005 du 23 février 2013, avant le décret n° 23/10 du 3 mars 2023, il visait
celles du décret n° 011/42 de 2011, art. 60 compris. Rien n'est chiffré, sans
dispense. **L'ENTREPRENANT · 250 000 FC, PAS 750 000** · `estPersonneMorale` rendait
`!== 'ENTREPRISE_INDIVIDUELLE'`, oubliant « l'entreprenant ou le commerçant en nom
propre » ; il consomme `FORMES_PERSONNES_PHYSIQUES`, exportée du module des
retenues. La SUCCURSALE reste non tranchée, faute de source, et c'est dit. **L'ART.
96 BIS N'EST PAS DATÉ DE SON REMPLACEMENT** · « inséré par la L.F. n° 24/011 du 20
décembre 2024, art. 46, remplacé par la L.F. n° 25/060 » (du 29 décembre 2025) ; la
rédaction de 2024, hors corpus, est en réserve, jamais transportée en arrière.

**Passe F6 (loi n° 23/053, Titres I et IV à VII).** UNE RESTRICTION ÉCRITE ET NON
CODÉE se lit comme faite · « ELLE NE VISE QUE LES SOCIÉTÉS » puis un filtre par
référentiel laissait l'entreprise individuelle et l'entreprenant ; vérifier qu'une
ligne exécute la condition du commentaire. UNE CORRECTION N'EST FINIE QU'AVEC SON
JUMEAU, cherché par la RÈGLE · le registre des retenues annonçait l'IS à une
personne physique quand le planning (`formesSyscohadaExclues`), le module fiscal
(IRPP) et `FORMES_PERSONNES_PHYSIQUES` (« Elles ne sont pas redevables de l'impôt
sur les sociétés ») le savaient. LA RELECTURE DE LA SOURCE (règle n°1) EST UNE
SOURCE DE CONSTATS · l'AUDCIF art. 65 ne pose que la non-distribution (la
compensation des pertes vient de la loi fiscale) ; l'art. 141 vise « les redevables
visés aux articles 139 ET 140 », EBNL comprises. UNE MIGRATION APPLIQUÉE NE SE
RETOUCHE PAS · la date fausse « 5 décembre 2023 » est corrigée dans le module, pas
dans le commentaire de la migration (empreinte, HISTOIRE), et le module le dit ;
même traitement que la migration des cadratins.

**AUDCIF art. 22, 4° · l'opération d'une période close (2026-09-24, décision de
Manasse).** Elle « est enregistrée au premier jour de la période non encore
clôturée, sa date de valeur étant mentionnée distinctement » · `Ecriture.dateValeur`
porte la date réelle, `date` le premier jour ouvert
(`exercice/report-periode-close.ts`). TROIS BORNES · le report se DEMANDE
(`reporterAuPremierJourOuvert`), jamais d'office ; jamais au-delà de l'exercice (la
charge en changerait) ; jamais sur un journal clôturé TOTALEMENT ; et
`onClick={enregistrerPiece}` passerait le clic comme demande de report.

**PASSE F13 · loi de finances n° 25/060 et IPM (2026-09-24).** Le procès-verbal
d'assemblée de l'art. 13 bis LPF ne vise que « les sociétés et les autres personnes
morales soumises à l'impôt sur les sociétés » (ni ASBL exemptée, ni personne
physique). L'amende de l'art. 74 al. 2 TVA (facture servie deux fois) renvoie à
l'alinéa 1er, égale aux droits indûment déduits, pas au triple. UNE LOI DE FINANCES
SE CONFRONTE DANS LA COMPILATION DU TEXTE QU'ELLE MODIFIE, jamais dans sa fiche
(art. 13 bis, art. 96 bis, création de l'art. 22 ter), et ne date pas l'article
qu'elle modifie. L'IPM (O.-L. n° 71-087), perçu par les chefferies et communes, ne
confie aucune retenue à l'employeur.

**Modèles de saisie · un achat ne se règle pas par la trésorerie dans la même
écriture (2026-09-18, décision de Manasse).** Nature contre trésorerie laissait le
401 vide (ni balance âgée, ni échéancier, ni lettrage) ; idem vente, salaire (pas de
compte 422) et modèles avec TVA. Guide, Partie 1 ch. 2 § 1.1 : « contrepartie
systématique = 401 pour les achats de biens/services (hors immobilisations) ; 481 ou
404 pour les immobilisations. » SYCEBNL, compte 40 · crédité des FACTURES par le
débit de la classe 6 et du 445, débité des RÈGLEMENTS par la trésorerie · deux
écritures, deux journaux. Vente · Application 2, 4111 au débit ; paie · ch. 3 § 4.1,
« Montant brut au crédit 422 Personnel, rémunérations dues, par débit 661-663 ».
SEULS touchent la trésorerie le don manuel en numéraire, sans débiteur (SYCEBNL
Partie 3 ch. 4 § 3 ; promis, il passe par le 475), et les règlements · liste FERMÉE
dans le spec, tout ajout s'y justifie (CHARGE_SANS_TIERS le signalait déjà). **LES
MODÈLES DU DOSSIER ONT UNE GARDE DE TIERS** (`verifierLignes` n'en avait aucune) ·
AVERTISSEMENT, PAS REFUS (§ 6), qui NOMME les deux cas légitimes (frais bancaires
justifiés par le relevé, don manuel) et parle là où le modèle naît, quand
CHARGE_SANS_TIERS relit en aval. L'exception du don est BORNÉE AU SYCEBNL · un
numéro, deux sens : le 704 (« enregistrés dans le compte 704 Revenus liés à la
générosité » · dons, legs, denier du culte, zakat, dîme, mécénat, parrainage) n'y
déclenche rien, mais le 7041 est « Ventes de produits résiduels » au SYSCOHADA ; un
test relit les deux semis (F2b). Le diagnostic se relit sur l'ENREGISTRÉ, jamais sur
le DTO, aux trois portes `lister`, `creer`, `modifier` (un intitulé seul n'envoie
aucune ligne), par le chemin de `lister` ; câblage testé avec la règle (F4a).

**Ordre des lignes proposées · débits puis crédits**, comme le Guide (tableau à cinq
colonnes). Ordre interne lu au texte · Application 1, débit 2443, 601, 605 PUIS
4451, 4452 ; crédit 4812, 4011 · Application 2, débit 4111 ; crédit 7011, 7021, 7071
PUIS 4431. La TVA suit les comptes de nature ; l'escompte (compte 40 débité « des
escomptes de règlement obtenus ; par le crédit du compte 773 ») suit le tiers qu'il
solde. `client/src/lib/ordre-ecriture.ts` · sens, rang (nature, taxe, escompte),
numéro croissant, tri STABLE. La racine « 44 » entière n'est PAS accessoire (441
impôt sur le résultat, 447 impôts retenus à la source) ; une ligne à deux zéros
reste au débit. NON TRIÉS · `/operations-specifiques` (transcrit du Guide DANS SON
ORDRE) et les modèles du dossier (champ `ordre`).

**Modale coupée en haut, troisième et quatrième causes.** `dvh` seul disparaît en
silence · `max-h-[calc(100dvh-2rem)]` est jeté hors Chrome 108 et Safari 15.4 ;
`.modale-bornee` pose `vh` PUIS `dvh` dans une même règle CSS (deux classes ne le
peuvent, l'ordre de la feuille engendrée ne suivant pas celui des classes). Une
fenêtre positionnée à z-index fait CONTEXTE D'EMPILEMENT (2026-09-26, console) ·
TOUTE modale passe par `PortailModale`, gelé voile par voile par
`modales-dans-l-ecran.spec.ts`. Calculette · `.voile-centre-sur` remplace
`items-center` (marges automatiques, jamais négatives) ; mise au point avec
`preventScroll: true`, sans quoi le clavier d'un téléphone décale une modale
`fixed`.

**Échap se donne à la couche la plus haute, et la fermeture se garde (2026-09-27,
audit final F177).** `lib/echap.ts` · une couche (menu, bulle, calculette, modale)
écoute en CAPTURE par `ecouterEchap` et consomme la touche quand elle agit ; la
fenêtre ne se ferme que sur une touche libre (`echapPourLaFenetre`), jamais sous une
modale, marquée par `PortailModale` (`data-modale`). Toute fermeture (croix, Échap,
« tout fermer ») consulte `useGardeFermeture` · un écran qui tient un travail non
enregistré en déclare le motif, et la fermeture le demande.

## 7. Conventions du plan de comptes semé

Valables pour les deux référentiels (`compte-seed.ts`,
`compte-seed-syscohada.ts`) :

- un compte d'imputation (feuille du plan officiel) est **complété à droite
  par des zéros jusqu'à 8 chiffres** : `5211` devient `52110000` ;
- un compte à 2 ou 3 chiffres **qui a des subdivisions** est semé **NON
  complété**, en type `TOTAL`. Deux raisons, chacune suffisante : compléter
  provoquerait des collisions · en SYCEBNL `90` complété vaut `900` complété,
  en SYSCOHADA (qui n'a pas de compte 900) c'est `49` contre `490` et `59`
  contre `590`. Et cela casserait
  l'agrégation par `numero.startsWith()` de `EcritureService.balance()` ;
- un compte à 3 chiffres **sans** subdivision EST le compte d'imputation, donc
  complété.

**Le plan est repris tel qu'il est, à 2, 3, 4 et 5 chiffres.** Depuis le
2026-09-05, le semis SYCEBNL descend au quatrième chiffre partout où le plan
officiel le fait · il avait été bâti sur le chapitre 3 (fonctionnement des
comptes), qui abrège, et s'arrêtait au divisionnaire pour presque toute la
classe 6 et une partie de la classe 7. 207 sous-comptes ont été ajoutés, leurs
51 parents passés en `TOTAL`. Ne pas « simplifier » un niveau au motif qu'il
paraît fin : c'est ce raccourci qui faisait sortir à zéro huit rubriques des
notes 28, 29A, 19 et 20A, et qui empêchait le catalogue d'opérations d'imputer
là où le Guide l'écrit.

Les comptes **92 à 99** (comptabilité analytique de gestion) sont semés comme
en-têtes de division SANS compte d'imputation en dessous : le plan les énumère
et ne les développe jamais, « libre usage ». Ils ne servent qu'en comptabilité
analytique, nulle part ailleurs. `compte-seed.spec.ts` les exempte NOMMÉMENT
du contrôle « un en-tête regroupe au moins un compte Détail » · toute autre
division vide reste un bug.

Le plan SYSCOHADA est **généré** depuis le TSV de la compétence `syscohada`.
Ne pas le retoucher à la main : corriger la source et régénérer.

Les semis annexes (journaux, taux de TVA, familles d'immobilisations, plans
analytiques) référencent des numéros **propres à chaque référentiel** · la
caisse est 5710 en SYCEBNL et 5711 en SYSCOHADA, la TVA déductible 4451 contre
4452, le mobilier 2441 contre 2444. Vérifier chaque numéro dans le plan cible
avant de l'écrire ; un spec (`compte-seed-syscohada.spec.ts`) le contrôle.

## 8. Sécurité

- Session en **cookie httpOnly** `__session` + jeton CSRF apparié rejoué
  en en-tête `X-CSRF-Token`. Le jeton de session n'est jamais exposé au
  JavaScript. **L'API EST SERVIE SOUS L'ADRESSE DU SITE** (2026-09-26) ·
  Firebase Hosting relaie `oomega.web.app/api/**` vers Cloud Run
  (`client/firebase.json`), le serveur retire le préfixe
  (`retirerPrefixeApi`). Sans cela le cookie était TIERS, et tous les
  navigateurs de l'iPhone le jettent · la connexion « réussissait » et la
  session était perdue aussitôt. Le nom `__session` est imposé par Firebase,
  qui retire tout autre cookie des requêtes relayées · ne pas le renommer.
  **UNE SESSION PERDUE SE RECONNAÎT** (audit final F164) · `JwtAuthGuard`
  rend un 401 en français marqué `session: 'perdue'`, que l'interface lit
  (`lib/session-perdue.ts`) pour fermer la session et ramener à la connexion
  avec le motif. Un 401 sans ce drapeau (mot de passe actuel faux) ne
  déconnecte personne.
- **L'ADRESSE DU CLIENT EST `requete.ip`, ET RIEN D'AUTRE** (audit final
  F160). La tête de `X-Forwarded-For` s'écrit par le client. Le nombre de
  relais de confiance vient de `common/sauts-de-confiance.ts` · DEUX en ligne
  (Firebase Hosting, puis Cloud Run), AUCUN sur site, `SAUTS_PROXY_CONFIANCE`
  prime. Avec un seul, le journal d'audit et la limitation de débit voyaient
  l'adresse du relais Firebase pour tout le monde. Un appel direct à
  `*.run.app` reste possible, et se ferme dans l'infrastructure.
- **Auto-inscription fermée** · `POST /auth/register` refuse sauf si
  `INSCRIPTION_PUBLIQUE=true`. Un dossier naît depuis la console VMG ou par le
  siège d'un groupe. `AuthService.register` reste le pipeline commun de toutes
  les créations : ne pas en écrire un second.
- `estOperateurPlateforme` n'apparaît dans **aucun** DTO. Il s'accorde au
  démarrage depuis `OPERATEURS_PLATEFORME`, en accord seulement, jamais en
  retrait.
  **Par égalité EXACTE** sur l'adresse normalisée (2026-09-27, audit final
  F43) · la recherche insensible à la casse promouvait tout compte
  « ADMIN@… » de n'importe quel dossier. Toute adresse de COMPTE est
  normalisée à la porte (`@CourrielNormalise`) et dans les services
  (`normaliserCourriel`), et la base refuse le reste (contrainte
  `users_email_normalise`).
- Mot de passe transmis par un tiers (console, siège, admin du dossier) :
  `doitChangerMotDePasse` force le changement à la première connexion, et
  `MotDePasseAChangerGuard` FERME le serveur jusque-là · trois routes de
  sortie seulement, marquées `@SortieMotDePasseProvisoire()`, liste figée par
  `cycle-de-vie-acces.spec.ts`, lue sur la MÉTADONNÉE que la garde lit, route
  par route et jamais sur une distance dans la source ; aucun autre fichier du
  serveur ne nomme le décorateur ni sa clé. Le client seul ne suffisait pas.
  **LA GARDE EST APPELÉE PAR `JwtAuthGuard`, JAMAIS EN GARDE GLOBALE.** Nest exécute les gardes globales
  AVANT celles du contrôleur, donc avant que `JwtAuthGuard` ne pose
  `request.user` · posée en `APP_GUARD` de la phase 1a au 2026-09-24, elle
  lisait un utilisateur absent et ne refusait RIEN en production, sous des
  tests verts qui l'appelaient à la main avec un utilisateur déjà posé. Vu en
  montant un serveur Nest réel. **Tout contrôle qui a besoin de l'utilisateur
  vit dans `JwtAuthGuard`** (ou une garde de contrôleur après lui), et
  `roles-cantonnes.spec.ts` fige à la fois le fait (une garde globale laisse
  passer) et la règle (aucune `APP_GUARD` hors `ThrottlerGuard`).
- **Cinq rôles** (`common/guards/roles-cantonnes.ts`, décision du
  2026-09-24). Les trois d'origine, plus deux CANTONNÉS, et leurs défauts sont
  INVERSES. L'AIDE-COMPTABLE hérite du comptable et de la lecture seule
  partout où une route ne le refuse pas (`@ReserveAuComptable()` · valider,
  corriger, affecter, liasse du groupe, passer la paie au journal) et le
  personnel lui est fermé. Le GESTIONNAIRE DE PAIE n'a RIEN tant qu'une route
  ne l'ouvre pas (`@AccesRolesCantonnes({ gestionnairePaie: true })` · le
  personnel, se voir, tenir son propre compte (mot de passe, adresse, double
  authentification, sessions), lister les exercices, et depuis F247 lire les
  devises et coter le cours de l'USD du jour de Kinshasa
  (`motifRefusCotationGestionnairePaie`), en CRÉATION seule, un cours déjà
  coté refusé en 409 et jamais réécrit (`ajouterCours`) · une liste FERMÉE, que
  `roles-cantonnes.spec.ts` gèle route par route et fichier par fichier) · un
  défaut ouvert lui aurait donné tout le grand livre, la plupart des lectures
  ne portant aucun `@Roles`. Aucun `@Roles` existant ne nomme ces rôles : ils
  se lisent comme le COMPTABLE ou la LECTURE SEULE qu'ils remplacent, là où la
  route le leur permet. Côté écran, `peutValider` (admin, comptable) est
  distinct de `peutEcrire` (qui inclut les deux rôles cantonnés).
- **Révocation de session** · `User.sessionsInvalidesAvant`. Tout jeton
  AUTHENTIFIÉ avant cet instant est refusé par `JwtStrategy`. Posé au
  changement de mot de passe et d'adresse, à la réinitialisation, à la
  désactivation, au changement de rôle, de profil de fonctions ou de journaux
  autorisés, à l'activation et au retrait de la double authentification, par
  « Fermer toutes mes sessions » et par « Déconnecter mes autres appareils » ·
  sans cela un mot de passe volé restait utile jusqu'à l'échéance du jeton. La
  comparaison porte sur la dernière authentification explicite (claim
  `authentification` · la connexion, ou la réémission qui suit un acte
  présentant le mot de passe ou le code), que la prolongation d'une session
  longue RECOPIE · sans quoi un jeton prolongé dans la seconde d'une
  révocation lui échappait (audit final F270). Un jeton plus ancien retombe
  sur son `iat`. Elle tronque à la SECONDE · sans quoi le titulaire est
  éjecté par son propre geste.
- **« Rester connecté sur cet appareil »** (`src/modules/auth/session-longue.ts`,
  audit final F270, décision de Manasse). La case est DÉCOCHÉE par défaut.
  Décochée · cookie DE SESSION, sans `maxAge` ni `expires`, fermé avec le
  navigateur, et jeton de huit heures (`JWT_EXPIRES_IN`) ; une réémission
  garde son échéance. Cochée · trente jours au plus depuis la connexion
  d'ORIGINE (claim `origine`, que toute réémission recopie) et sept jours sans
  usage · `JwtStrategy` prolonge à l'usage, au plus une fois par jour, jeton
  CSRF recopié, et `JwtAuthGuard` ne pose le cookie prolongé qu'une fois la
  requête admise. UNE seule écriture de la charge (`emettreSession`), UNE
  seule pose du cookie (`poserCookieSession`). JAMAIS POUR LA CONSOLE · la
  session d'un opérateur s'ouvre courte, et `JwtStrategy` refuse un jeton long
  à un compte promu opérateur après coup. `/auth/me` rend le jeton CSRF de la
  session en cours, le stockage local de l'écran pouvant disparaître avant le
  cookie. « Déconnecter mes autres appareils » (`POST
  /auth/deconnecter-autres-appareils`) exige le mot de passe actuel, ferme
  toutes les sessions et repose aussitôt celle de l'appareil, qui garde son
  régime · ce n'est PAS une sortie de mot de passe provisoire. Les routes qui
  éprouvent un secret portent `@Throttle` (vingt par minute) et
  `JwtAuthGuard`, gelés route par route par `session-longue.spec.ts`. Une
  session demandée longue et ouverte courte le dit à l'écran
  (`motifSessionCourte`, `lib/connexion.ts`), et la déconnexion attend
  `POST /auth/logout` avant qu'une connexion reparte (`lib/deconnexion.ts`).
- **Double authentification** (`src/modules/auth/double-authentification.ts`,
  2026-09-26) · TOTP, RFC 6238, écrit ici et figé par les vecteurs des RFC,
  vérifiable hors ligne donc aussi sur site. OUVERTE À TOUS, EXIGÉE POUR LA
  CONSOLE (`OperateurPlateformeGuard`, relu par `JwtStrategy`) · l'exiger de
  chaque administrateur fermerait des cabinets entiers le jour du déploiement.
  Quatre règles. (1) Le mot de passe seul ne rend AUCUNE session, seulement
  `deuxiemeFacteurRequis` · le mot de passe est redemandé avec le code, aucun
  état intermédiaire n'est gardé. (2) Un code faux compte comme un mot de
  passe faux (verrou), et un code ne resert pas (`dernierPasDoubleAuth`, un
  pas de trente secondes de part et d'autre). (3) Huit codes de secours,
  montrés UNE fois, gardés en empreinte, chacun à usage unique · activer ferme
  les autres sessions, retirer exige mot de passe ET code. (4) Une
  RÉINITIALISATION de mot de passe (administrateur du dossier, opérateur) lève
  aussi le second facteur (`SANS_DOUBLE_AUTH`) · celui qui réinitialise tient
  déjà l'entrée, et un téléphone perdu avec ses codes fermerait le compte pour
  de bon. Secret, pas et empreintes n'entrent ni au journal d'audit ni à la
  restitution ; la date d'activation, si.
- **Le dernier administrateur actif ne se retire pas** (audit final F157) ·
  rétrogradé ou désactivé, il laissait un dossier que personne ne gère, et
  la console, qui ne réinitialise que les administrateurs, ne le rattrapait
  pas. Décompte et écriture se font sous un verrou par dossier, dans la
  transaction.
- **Verrouillage par compte** temporaire (`src/modules/auth/verrouillage.ts`),
  vérifié APRÈS bcrypt depuis le 2026-09-28 (audit final F238) · un verrou
  qui répondait sans hachage se reconnaissait à sa rapidité. Une adresse
  INCONNUE compare le mot de passe à une empreinte factice du même coût
  (`EMPREINTE_FACTICE`), et adresse inconnue, mot de passe faux et compte
  verrouillé rendent le MÊME message (`MOTIF_IDENTIFIANTS_INVALIDES`). Le bon
  mot de passe pendant le verrou est refusé comme un faux, et un essai pendant
  le verrou ne le prolonge pas. Jamais définitif : un verrou définitif se
  retourne en refus de service.
  **LE COMPTEUR S'OUBLIE DOUZE HEURES APRÈS LE DERNIER ÉCHEC, JAMAIS À
  L'ÉCHÉANCE DU VERROU** (2026-09-28, décision de Manasse). Il repartait de
  zéro dès qu'un verrou expirait · l'attaquant qui attendait chaque échéance
  restait au palier d'une minute, environ sept mille essais par jour et par
  compte, et les paliers (1, 5, 15, 30, 60 minutes) ne jouaient jamais. Il
  tombe dans trois cas seulement · une connexion réussie (NIST SP 800-63B-4,
  Rate Limiting, « SHOULD disregard any previous failed attempts »), un mot de
  passe changé ou réinitialisé ou un déverrouillage par l'administrateur, et le
  délai d'oubli compté depuis le dernier échec (`User.dernierEchecLe`,
  `DELAI_OUBLI_ECHECS_HEURES`), valeur par défaut du « Failure Reset Time » de
  Keycloak, qui exige qu'il dépasse le verrou le plus long, sinon le plafond
  n'est jamais atteint (`verrouillage.spec.ts` le tient et rejoue l'attaquant
  patient). Une seule remise à zéro (`DECOMPTE_REMIS_A_ZERO`), un seul
  décompte (`decompteApresEchec`).
- **ACTIVER LE SECOND FACTEUR EXIGE LE MOT DE PASSE, ET LE TITULAIRE EST AVERTI
  HORS DE LA SESSION** (2026-09-28, décision de Manasse). OWASP ASVS 5.0,
  exigence 7.5.1 (« full re-authentication » avant de modifier la
  configuration du second facteur), NIST SP 800-63B-4 (un authentificateur ne
  se lie qu'après authentification). Une session « Rester connecté » peut
  dater de trente jours · volée, elle installerait SA propre application et
  fermerait la porte au titulaire. L'activation et la régénération des codes
  de secours (le « sudo mode » de GitHub) prennent `motDePasseActuel`, vérifié
  par bcrypt AVANT le code, même refus que le retrait, sans compter au verrou.
  Activer, retirer ou renouveler les codes met en file un courriel au
  titulaire, sans aucun secret (`avis-double-authentification.ts`) · un échec
  de mise en file ne défait jamais l'acte. `AuthModule` importe
  `CourrierModule`, un test le fige.
- Toute requête est filtrée par `tenantId`. Une requête Prisma sans `tenantId`
  sur une table multi-locataire est un défaut de cloisonnement. Ce n'est plus
  seulement une règle de discipline : `src/common/cloisonnement/` porte une
  extension Prisma qui REFUSE une collection non bornée, refuse d'écrire sur
  la ligne d'un autre dossier, et rend inexistante la ligne lue d'un autre
  dossier. Elle ne réécrit jamais une requête · réécrire masquerait le défaut.
  La borne se vérifie par sa VALEUR, pas par sa présence · jusqu'au 2026-09-17,
  `filtreBorne` rendait `true` dès qu'un `tenantId` figurait au filtre, quel
  qu'en soit le dossier. Ce n'était pas seulement une collection servie de
  travers : les règles A et B se court-circuitent sur cette fonction, si bien
  qu'un `tenantId` étranger DÉSACTIVAIT la garde au lieu de la déclencher.
  `{ tenantId: { not: null } }` et `{ OR: [{ tenantId: d }, {}] }` passaient
  pour des bornes. LA LIGNE OBTENUE SE VÉRIFIE COMME LA LIGNE VISÉE
  (2026-09-28, audit final F240) · une mise à jour dont les données
  porteraient la ligne dans un autre dossier est refusée, et une forme qui
  touche au dossier sans le nommer lisiblement l'est aussi. Toute table
  cloisonnée porte un index qui commence par `tenantId` (F261,
  `index-du-dossier.spec.ts`) · sans lui, chaque lecture bornée balaie la
  table de tous les cabinets.
  Deux échappatoires, et deux seulement :
  `horsCloisonnement('raison', ...)`, qui sort TOTALEMENT de la garde et dont
  la liste des utilisateurs est gelée par un test ; et
  `perimetreDeGroupe([...], ...)`, qui ne sort de rien · la garde continue de
  tourner et accepte, en plus du dossier de la session, les dossiers NOMMÉS.
  C'est par elle que le siège d'un groupe lit ses cellules. La liste est
  toujours construite à partir du seul dossier de la session, jamais reçue
  d'un appelant · sans quoi le client nommerait ses propres voisins.
- **Monnaie de tenue** (`src/common/monnaie-de-tenue.ts`) · elle ne se
  choisit pas. Loi n° 23/053 art. 141, 1° (« Cette comptabilité est exprimée
  en Franc congolais ») et AUDCIF art. 17, 1° (« l'unité monétaire ayant cours
  légal dans l'État partie »), sans option ni dérogation. `Tenant.devise` ne
  convertissait rien · elle ÉTIQUETAIT le cartouche (« montants en X »), si
  bien qu'un dossier basculé en USD imprimait une unité fausse sur sa liasse
  entière. Le champ n'est plus dans aucun DTO et n'est écrit par aucun
  service · un test le vérifie. `Tenant.deviseFonctionnelle` nomme la monnaie
  où l'entité vit réellement et commande un SECOND jeu de documents, à côté du
  jeu légal et sans valeur légale · aucun texte lu ne le régit, c'est une
  décision d'OmegaX et le document doit le dire.
- **Restitution du dossier** (`src/modules/exports/restitution/`) · une
  archive ZIP d'un CSV par table, sur son PROPRE contrôleur, sans
  `LicenceGuard` : derrière lui elle serait indisponible dans le seul cas où
  elle sert. L'extracteur ne construit jamais son `where` · les modèles
  portés par leur parent échappent à la garde de cloisonnement, et un filtre
  écrit à la main les rendrait pour tous les cabinets. Il le demande à
  `borneDuModele`, et le spec vérifie chaque borne avec `filtreBorne`. Le
  manifeste écrit les cinq réserves plutôt que de les taire (voir
  docs/restitution-du-dossier.md) · une archive qui se présente pour plus
  qu'elle ne vaut est plus dangereuse que pas d'archive. UNE TABLE ILLISIBLE
  ARRÊTE L'ARCHIVE (2026-09-27, audit final F96) · l'échec est consigné et la
  sortie DÉTRUITE, jamais une restitution amputée qui se dirait complète ; une
  PIÈCE illisible, elle, est nommée dans `controles.txt`. Les documents des
  tiers sont archivés dans `documents-tiers/` et le manifeste le dit (F97).
- **Journal d'audit** (`src/common/audit/`) · posé sur le client Prisma par
  une extension, pas par des appels dans les services : un contrôle qu'on peut
  oublier d'appeler n'est pas un contrôle. Il couvre les modèles de
  `MODELES_AUDITES` (accès, configuration, actes d'exercice) et jamais les
  lignes engendrées en masse. Chaque événement porte l'empreinte du précédent
  (chaîne par dossier) · c'est ce qui rend une retouche visible, AUDCIF
  art. 22, 5° et 6°. Deux règles à ne pas défaire : aucune route d'écriture
  sur `/journal-audit`, et aucun champ sensible recopié. Le filtre de l'écran
  est SERVI (`GET /journal-audit/objets`, `libelles-objets-audites.ts`), un
  libellé par modèle de `MODELES_AUDITES` et un test qui l'y tient exact
  (audit final F182) · la table recopiée à l'écran en couvrait vingt-six. Le masquage a DEUX
  moitiés · une heuristique sur le NOM (`FRAGMENTS_SENSIBLES`), qui n'attrape
  que ce qui s'annonce, et une liste FERMÉE par colonne
  (`COLONNES_EXCLUES_PAR_MODELE`) pour ce qui ne s'annonce pas. La seconde est
  née de `User.estOperateurPlateforme`, dont le schéma dit « jamais renvoyé
  par /utilisateurs » et que le journal rendait pourtant en clair à tout
  utilisateur du dossier. Un test tient la liste fermée · une colonne ajoutée
  à `User` le fait tomber tant qu'elle n'est pas classée. (`masquer()` remplace
  mot de passe, jeton et secret par un marqueur). **LA CRÉATION D'UN DOSSIER
  SE JOURNALISE DANS SA TRANSACTION** (2026-09-26, `journaliserDansTransaction`)
  · écrit par la connexion à part, chaque maillon désignait un dossier que
  cette connexion ne voyait pas encore, et la clé étrangère le refusait : aucune
  création de dossier n'était journalisée. Le dossier est sa propre chaîne (sa
  création en est le rang 1), et `register` sème AU NOM du dossier qui naît ·
  depuis la console, la garde de cloisonnement tenait sinon le semis pour une
  écriture chez un voisin, et la création d'un cabinet échouait (reproduit sur
  une base réelle avant correction). **TOUTE TRANSACTION PASSE PAR
  `transactionJournalisee`** (`common/audit/transaction-journalisee.ts`, audit
  final F159) · écrit par la connexion à part, le maillon d'un acte annulé
  survivait, et chaque écriture auditée prenait une seconde connexion pendant
  que la transaction tenait la première. Un test de source refuse un
  `$transaction(` écrit ailleurs, forme TABLEAU comprise (elle n'a pas de
  contexte asynchrone).

- **Le dossier de l'éditeur ne se coupe jamais** · `TypeLicence.PROPRIETAIRE`.
  C'est un verrou de sûreté avant d'être une formule commerciale : VMG
  Consulting possède le logiciel, ne paie rien, et c'est depuis SON dossier que
  les licences des autres se rouvrent. Un dossier d'éditeur coupé, par une
  échéance ou par une suspension posée par mégarde, verrouille l'opérateur hors
  de la console qui sert à déverrouiller · panne sans issue, silencieuse
  jusqu'à la première connexion refusée, et dont le motif (« Abonnement
  expiré ») serait techniquement exact.
  Trois règles à ne pas défaire. Le court-circuit de `LicenceService` passe
  AVANT le test de suspension, sans quoi il serait exact et inutile dans le seul
  cas qui compte. `PlateformeService.modifierLicence` refuse de toucher à cette
  licence, et refuse aussi d'attribuer ce type · le retrait du type est le seul
  geste que le court-circuit ne peut pas absorber, puisqu'il le retire. Et le
  type se pose par un geste NOMMÉ (`designerDossierEditeur`), une fois, tous
  cabinets confondus · pas par un choix dans une liste déroulante à côté
  d'« Abonnement ». Aucune porte de création ne le donne · `register`, pipeline
  commun de la console, du siège et de l'inscription, le refuse avant toute
  écriture (audit final F161).

## 8 bis. Volumes et plafonds de fenêtre

La capacité du logiciel est **mesurée**, pas estimée · voir
`docs/capacite-mesuree.md` (banc du 2026-09-03, un million de lignes, tas de
460 Mio comme en production).

Ce qu'il faut en retenir : les états financiers sont agrégés par la base et ne
craignent pas le volume (une demi-seconde sur un million de lignes) ; les
écrans qui rapatrient des lignes une à une, eux, tuaient le serveur.

**Aucune route ne rend une collection sans borne.** Deux traitements, et la
différence est comptable, pas technique :

- un écran de TRAVAIL (le journal) peut ne montrer qu'une tranche, à condition
  de le DIRE (`tronque`, `total`) et de garder des totaux pris sur le
  périmètre entier ;
- un LIVRE OBLIGATOIRE (le grand livre) ne se tronque pas. Au-delà du plafond
  il se refuse, avec le chemin de rechange. Un livre amputé en silence est un
  document faux (AUDCIF art. 22, 6°).

**CE QUI PARCOURT TOUT UN EXERCICE LE LIT PAR TRANCHES** (2026-09-27, audit
final F185) · `common/lecture-par-lots.ts`, une seule écriture de la
pagination (`pageApres`, par identifiant, `skip: 1` sans quoi la ligne du
curseur est lue deux fois). Une somme se demande à la base (`aggregate`,
`groupBy`), jamais à une boucle sur des lignes rapatriées. Une liste
d'anomalies bornée dit son total (`Collecte`, `nombreSiTronque`), et un test
de structure exige le total de toute collecte servie.

## 9. Style de code

Le code de ce dépôt est commenté **en français**, et les commentaires
expliquent POURQUOI, pas quoi. Un commentaire qui paraphrase la ligne suivante
est du bruit ; un commentaire qui dit quel incident la ligne empêche vaut de
l'or. Suivre la densité et le ton de l'existant.

Nommage en français (`creerCellule`, `balanceAgregee`, `lignesBalance`), sauf
les termes techniques consacrés.

**FACULTATIF NE VEUT PAS DIRE NULLABLE** (2026-09-28). `@IsOptional()` laisse
passer `null` comme l'absence · sur une colonne qui n'admet pas `null`, le champ
porte `@FacultatifNonNul(motif)` (`common/facultatif-non-nul.ts`), qui refuse
`null` en 400 nommé ; sur une colonne nullable, le service lit `null` comme un
effacement. Un `null` passé à `new Date` rend le 1er janvier 1970.

Toute règle comptable codée cite sa source en commentaire : l'article, la
partie, le chapitre. Toute anomalie du texte officiel est signalée sur place,
jamais corrigée en silence.

## 9 bis. La marque

La charte graphique est `docs/charte-omegax.md`, et elle est OPPOSABLE : la
plupart de ses règles sont tenues par `client/src/components/chrome/marque.spec.ts`.

Trois choses à ne pas défaire :

- **le signe et le logotype sont des TRACÉS**, engendrés par
  `client/scripts/engendrer-marque.py` depuis les contours d'IBM Plex Sans
  SemiBold. Ni l'un ni l'autre ne se compose en texte : une police absente du
  poste du lecteur ferait rendre la marque dans une autre, sans qu'aucune
  erreur ne le dise. Le fichier `marque-geometrie.ts` est ENGENDRÉ · corriger
  le script, jamais le fichier ;
- **les polices sont servies depuis notre origine** (`client/public/polices/`),
  avec leur licence (`OFL.txt`). L'en-tête `font-src 'self'` interdit toute
  police tierce, et l'OFL exige que la licence accompagne le fichier de fonte
  redistribué ;
- **un rapport de contraste se MESURE**, il ne s'estime pas. La table du § 7.4
  de la charte a trouvé un `--text-dim` à 3,98:1 sur le fond de l'application,
  sous le plancher AA, que personne n'avait vu en deux ans.

## 9 ter. L'interface · le modèle est Sage, pas une invention

Décidé par Manasse le 2026-09-25 : « réfère-toi aux logiciels qui existent
vraiment ». Deux références, et la seconde prime pour le RENDU. La
DISPOSITION vient des manuels de Sage 100 i7 (Drive, captures de la saisie
des journaux) ; le RENDU vient de Sage Active et de Sage 100 Expérience, les
versions web actuelles de Sage, que Manasse a retenues (« c'est exactement ce
rendu de Sage moderne que je veux »). Les couleurs sont celles de la charte
OmegaX, JAMAIS le vert de Sage.

- **Police de 12 px** (Segoe UI 9 pt, celle de Windows et de Sage), posée sur
  `body` ; les tailles explicites des écrans restent entre 10,5 et 13 px.
- **Bandeau à l'encre de la marque.** La barre de titre, la barre verticale de
  l'accueil et la barre de titre de la fenêtre ACTIVE sont `--bandeau`
  (`--a-900`), texte et symbole en blanc (logo blanc prévu par la charte sur
  fond sombre). La barre de menus est blanche, survol bleu clair.
- **Grille blanche, en-tête plein.** Les tableaux sont blancs sur la fenêtre
  (`--fenetre`, gris bleuté très clair), l'en-tête est plein en `--a-700`
  texte blanc, les lignes séparées par un filet, sans quadrillage vertical ni
  zébrure, total sur `--a-50` (`index.css`, bloc TABLEAUX). Le bouton
  principal (`bg-sel`) est une pilule, comme le « + Créer » de Sage Active.
- **Aucun titre de page.** La barre de titre de la fenêtre porte le titre ; un
  fil d'Ariane ou un `<h1>` qui le répète est retiré. Les titres de CADRE
  (bloc, onglet, tableau) restent.
- **Aucun historique législatif à l'écran** (décision du 2026-09-26). Ce qui
  a été abrogé, remplacé ou renommé (IBP, IPR, Système allégé, INSS…) ne
  s'affiche pas · l'utilisateur lit la règle en vigueur et, pour un exercice
  antérieur, sa borne de date. L'histoire vit dans le code et les commentaires.
- **Aucun paragraphe explicatif à l'écran.** Sage n'en a pas. L'explication,
  la citation du texte et le « pourquoi » vont dans la bulle `Aide` (« ? »).
  Restent à l'écran : erreurs, refus, résultats, avertissements portant sur
  une DONNÉE du dossier, et les mentions qu'un test gèle, raccourcies à une
  ligne. Numéros et codes en police d'interface, pas en chasse fixe.
- **Un échec de lecture se dit, et null n'est pas vide** (audit final F179,
  F181, F183, F184, F207, F248, F254, F255). Une liste part de `null`, un
  refus s'affiche avec son motif, et « aucun » ne se dit que sur une liste
  LUE · « Aucune caisse sans procès-verbal » ou « Aucun mandat » sur un échec
  sont la réponse favorable à la question que l'écran pose. UNE LISTE QUI
  DÉPEND D'UN CHOIX DIT POURQUOI ELLE EST VIDE ET CE QU'IL FAUT FAIRE D'ABORD,
  et un choix unique se présélectionne (2026-10-01, relevé par Manasse sur
  « Rattacher une subvention », dont le 14 ne proposait ni l'octroi ni le
  bien). Le contexte
  d'exercice aussi · `lireLesExercices` ne lève jamais, le chargement se
  referme, et l'erreur s'affiche à la barre d'état et dans la fenêtre
  Exercices.
- **Un montant s'écrit par `lib/montants.ts`** (audit final F256) · deux
  décimales fixes, arrondi au centime, une absence rendue « · » et jamais lue
  comme zéro. Une quantité et un cours ne sont pas des montants et gardent
  leur précision. `montants.spec.ts` refuse toute copie du formatage.
- **« À propos » dit ce qui est installé** (F180) · version, révision et date
  de construction posées par `vite.config.ts`, et la date du paquet sur site ;
  ce qui manque se dit, rien n'est inventé.
- **L'accueil est la fenêtre principale de Sage i7**, lue dans ses manuels
  (« Ergonomie et fonctions communes i7 ») · une BARRE VERTICALE à gauche,
  groupes thématiques dont un seul est ouvert (« cliquez sur son intitulé »),
  et l'INTUISAGE à trois onglets, Accueil, Favoris, Indicateurs. Les favoris
  sont une préférence du poste (navigateur), jamais une donnée du dossier.
- **Titres formels, jamais une référence juridique** (décision du
  2026-09-28, « façon logiciel professionnel »). Aucun titre de cadre,
  onglet, en-tête de colonne, légende, groupe d'options, libellé de bouton
  ou de champ ne s'écrit « Article 212 » ni « (§ 116 c) » · il nomme ce que
  la section contient (« Contrôle des contrats »). La référence ne disparaît
  pas : infobulle `title` ou bulle `Aide`. Deux specs relisent les titres
  (`titres-formels.spec.ts`, `titres-formels-pages-m-z.spec.ts`).
- **Le mouvement sert la compréhension**, 120 à 280 ms, transform et
  opacité seules, et TOUT se coupe sous `prefers-reduced-motion` par une
  règle universelle (`mouvement-reduit.spec.ts`). Un compteur de montant
  finit sur la valeur exacte de `lib/montants.ts` (`lib/compteur.ts`). Les
  couleurs de la charte passent par des canaux RGB (`--x-rgb`), sans quoi
  `border-danger/30` ne produisait aucun CSS (`canaux-couleurs.spec.ts`).
- **Ce que l'écran montre dépend du dossier et du rôle, jamais les droits.**
  Modules activables par dossier (`tenant/modules-optionnels.ts`, paie,
  révision, gestion commerciale, consolidation, IFRS · un dossier neuf part
  sans eux, les existants et la vitrine les ont tous) ; accueil par métier
  (`lib/accueil-par-metier.ts`) ; démarrage guidé d'un dossier sans
  écriture (`lib/demarrage-guide.ts`, état lu par `GET /dossier/demarrage`).
  Masquer n'est pas refuser · le serveur tient seul les droits.

## 10. Tests

Jest côté serveur, Vitest côté client. Un test doit vérifier **ce qui casserait
en silence** : un plan de comptes incomplet, un état qui ne boucle plus, une
note annexe absente, un cloisonnement qui saute. Les tests d'export relisent le
classeur produit plutôt que d'affirmer qu'il est correct.

Quand un bug est corrigé, le test qui l'aurait attrapé est écrit dans le même
commit.

**TESTS NAVIGATEUR (`e2e/`, 2026-09-26).** Les suites unitaires tournent sur
des Prisma factices et ne montent aucun écran. `tests-navigateur.yml` construit
le client, le sert en relayant `/api` vers le serveur réel et une base
jetable, et Playwright ouvre, sous Chromium et WebKit, CHAQUE commande de
menu dans les deux référentiels (les chemins sont LUS dans `AppShell.tsx`,
jamais recopiés), puis passe une écriture jusqu'à la balance et aux états
financiers. Tombent · une fenêtre en limite d'erreur, une exception
JavaScript, une réponse 5xx ; un 4xx est un refus, pas une panne. Chaque
dossier naît par l'inscription, ouverte dans ce job seulement. Deux
réinjections l'ont vu tomber, une fenêtre qui plante et une route à 500, et la
première a exigé d'attendre la fenêtre RENDUE avant de lire l'écran, sans quoi
la panne était imputée à la fenêtre suivante.

**EN LOCAL, LE MONTAGE DU JOB, À LA MAIN** (réécrit le 2026-09-28 d'après
`tests-navigateur.yml`, audit final F197). L'interface appelle `/api` sur SA
propre adresse, et `vite preview` relaie vers le serveur comme Firebase
Hosting relaie vers Cloud Run (`client/vite.config.ts`) · le cookie de
session est alors celui de la page, comme en production. La marche écrite
jusque-là construisait le client contre le serveur en direct et ne posait pas
le relais : `e2e/tests/outils.ts` appelant `http://localhost:4173/api`, chaque
appel des tests tombait. `reglement-interieur.spec.ts` relit ce paragraphe
contre le workflow.

1. Serveur, à la racine, contre une base PostgreSQL JETABLE, jamais celle de
   production · `npm ci` et `npm run build`, puis `npx prisma migrate deploy`
   et `node dist/main.js` avec `DATABASE_URL` sur cette base, un
   `JWT_SECRET` de valeur jetable, `PORT=8080`,
   `INSCRIPTION_PUBLIQUE=true` et `CORS_ORIGIN=http://localhost:4173` (le job
   pose aussi `JWT_EXPIRES_IN=8h`, la valeur par défaut du serveur, et
   `NODE_ENV=production` pour cette migration et ce démarrage seulement).
2. Client, dans `client/` · `npm ci`, puis construit avec
   `VITE_API_URL=/api` par `npx vite build --outDir dist-e2e`, puis servi avec
   `OMEGAX_API_RELAIS=http://localhost:8080` par
   `npx vite preview --outDir dist-e2e --port 4173 --strictPort`. Sans
   `OMEGAX_API_RELAIS`, `vite preview` ne relaie rien, et `/api` n'atteint
   jamais le serveur.
3. Tests, dans `e2e/` · `npm ci`, `npx tsc --noEmit -p .`, puis
   `npx playwright test`. `OMEGAX_APP` et `OMEGAX_API` valent par défaut
   `http://localhost:4173` et `http://localhost:4173/api`
   (`playwright.config.ts`, `outils.ts`) ; `PW_CHROMIUM` désigne un Chromium
   déjà installé (à défaut, `npx playwright install chromium`, avec
   `--with-deps` sur un Linux neuf, comme le job), et `PW_WEBKIT=1` ajoute
   WebKit, le moteur de l'iPhone, une fois installé par
   `npx playwright install webkit`.

**UN TEST DE SOURCE S'ANCRE SUR UNE STRUCTURE, JAMAIS SUR UNE DISTANCE.** Le
2026-09-18, un test du journal gelait « appliquer AJOUTE à la pièce » par
`/appliquerModele[\s\S]{0,400}setLignes\(\(prev\) => \[/`. Il est tombé le jour
où un COMMENTAIRE a été ajouté au-dessus de l'appel · la règle qu'il garde
n'avait pas bougé d'une ligne. Un seuil de caractères mesure la longueur du
code, pas ce qu'il fait, et il punit exactement ce que le § 9 demande. Le test
découpe désormais le CORPS de la fonction et y cherche la propriété. Même
famille que « on gèle une PRÉSENCE, jamais une absence de mot » : ce qui se
gèle est ce que le code FAIT, jamais la forme qu'il a.

## 10 bis. Ce qui casse en silence

Un défaut qui laisse l'écriture ÉQUILIBRÉE et la balance BOUCLÉE ne se voit
nulle part en aval, parce que tout en aval est cohérent avec la mauvaise
racine. Il se refuse donc à la racine, par un message nommé · un contrôle en
aval arriverait toujours trop tard. Quatre refus posés le 2026-09-03, gelés
par `casse-en-silence.spec.ts` :

- **La date de l'écriture tombe dans son exercice.** `modifier` l'exigeait,
  `creer` non · une écriture datée de l'année précédente mais rattachée à
  l'exercice courant entrait au bilan et au compte de résultat de cet
  exercice, puisque tous les états filtrent sur `exerciceId`. C'est la faute
  de janvier. Postulat de spécialisation des exercices · SYCEBNL cadre
  conceptuel § 3.3.1.2.3, AUDCIF Titre I.
- **Toute écriture porte le numéro que son journal impose.** Quatre chemins
  de création n'appelaient pas la numérotation · les deux imports et les deux
  écritures du module Groupe. Le calcul vit maintenant dans
  `journaux/numerotation-piece.ts`, appelable sans injecter le service, et le
  spec découpe chaque `ecriture.create(` de tout `src/` et exige `numeroPiece`
  dans SON argument (audit du serveur C10).
- **Une écriture qu'un module tient ne se supprime pas depuis le journal.**
  Des tables la référencent (liste dans `detenteurs-ecriture.ts`), et sur un
  lien FACULTATIF Prisma pose
  `ON DELETE SET NULL` · le lien se dénoue sans erreur. La pire est
  l'affectation du résultat : elle resterait enregistrée sans son écriture, le
  report à nouveau n'aurait jamais bougé, et le contrôle 22 ne peut rien y
  voir puisque le défaut est une ABSENCE de mouvement.
- **Une période n'est couverte que par un seul exercice.** L'art. 7 impose la
  durée, pas l'unicité · deux exercices sur la même année passaient, chacun
  bouclant sa liasse de son côté.

La liste des modules qui retiennent une écriture est écrite à la main, jamais
déduite du schéma : une relation nouvelle doit obliger quelqu'un à décider si
son module retient l'écriture ou la laisse partir.

**Un cinquième défaut, d'une autre nature · le contrôle qui FABRIQUE une
anomalie.** Les quatre ci-dessus sont des données fausses. Celui-là est un
signalement faux, et il est pire à sa manière : le cabinet le corrige, et
personne ne saura jamais qu'il n'existait pas. Deux bornes à poser sur tout
contrôle nouveau, et le contrôle 25 (attestation d'exemption d'IS) les porte
toutes les deux :

- **le périmètre du texte.** L'arrêté n° 007/2025 ne vise que les
  établissements d'utilité publique et les ONG (art. 1er) · le réclamer à une
  association serait une exigence inventée ;
- **l'entrée en vigueur.** Les contrôles sont PAR EXERCICE. Un contrôle non
  borné reproche à un exercice 2024 une obligation entrée en vigueur au
  1er janvier 2026, au nom d'un texte qui n'était pas en vigueur. Le message
  est plausible, sourcé, et faux.

## 10 ter. Le regard du réviseur

Un auditeur demande le journal, et il le demande AVEC SA PISTE. OmegaX
capturait `createdBy`, `createdAt`, `valideeBy` et `valideeAt` depuis toujours
et n'en restituait aucun · ni à l'écran, ni dans le classeur remis. C'était un
manque de RESTITUTION, pas de collecte, et l'AUDCIF art. 22, 1° demande les
deux moitiés de la phrase : les données « comprennent, lors de leur entrée,
l'indication de l'ORIGINE, du contenu et de l'imputation, et puissent être
RESTITUÉES sur papier ou sous une forme directement intelligible ». L'article
22 n'est pas dans la liste d'exclusion de l'art. 3 du SYCEBNL : il vaut des
deux côtés.

La DATE DE SAISIE n'est pas la date comptable. L'écart entre les deux est ce
que l'art. 22, 4° appelle la date de valeur, « mentionnée distinctement », et
c'est l'axe du test de l'ISA 240. Le journal exporté porte donc désormais
Statut, Saisie le, Saisie par, Validée le, Validée par · l'auteur résolu en
COURRIEL, un auditeur ne lisant pas un uuid, et un utilisateur retiré du
dossier nommé comme tel plutôt que laissé en case vide.

**Le test des écritures de journal** (`controles/test-ecritures-journal.ts`)
rend la sélection de l'ISA 240 § 33 a), que l'auditeur conduit
« indépendamment de son évaluation des risques de contournement des contrôles
par la direction ». Les six critères sont ceux que la norme énumère elle-même
au § A44, cités et non paraphrasés. Deux règles tiennent ce module :

- **il sélectionne, il ne conclut pas.** Une écriture retenue n'est ni
  douteuse ni frauduleuse · le test reste celui de l'auditeur. Un logiciel qui
  écrirait « anomalie » sur un montant rond ferait dire à la norme le contraire
  de ce qu'elle dit ;
- **les seuils sont déclarés, jamais enfouis dans une requête.** La norme n'en
  fixe aucun : ce sont des conventions de lecture d'OmegaX, et le classeur les
  annonce comme telles, avec le dénombrement par critère.

**Double regard à la validation · une OPTION, et la lecture qui l'explique.**
`Tenant.doubleRegardValidation` (défaut FAUX) fait qu'une écriture n'est
validable que par un autre utilisateur que celui qui l'a saisie. C'est la
validation qui fait entrer la pièce au livre-journal, et l'AUDCIF art. 22, 2°
rend le franchissement irréversible (« l'irréversibilité des traitements
interdise toute suppression, addition ou modification ultérieure »). Aucun
chemin de dévalidation n'existe dans ce dépôt.

LE DÉFAUT FAUX N'EST PAS UNE PRUDENCE, c'est une lecture. Le MÊME art. 22, 2°
impose la validation et NE NOMME PERSONNE ; l'art. 69 la délègue expressément
(« L'entité détermine, sous sa responsabilité, les procédures nécessaires ») ;
et le CPCC décrit la division du travail comme une possibilité d'organisation
(§ 2.6.1, « le chef comptable PEUT se limiter à vérifier la conformité de
l'imputation ») tout en admettant la très petite entité « où la comptabilité
est tenue par une seule personne ». Aucun texte lu n'exige que le validateur
diffère de l'auteur : l'imposer d'office rendrait le logiciel inutilisable au
cabinet à un seul comptable, au nom d'une règle que personne n'a écrite.

L'OPTION ATTEINT LES DEUX RÉFÉRENTIELS PAR DEUX CHEMINS, et les messages ne se
servent jamais l'un pour l'autre : AUDCIF art. 69 côté SYSCOHADA, SYCEBNL
art. 16, 2) côté EBNL, puisque son art. 3 exclut justement l'art. 69. Ne jamais
invoquer l'art. 19 ni le mot « mensuelle » dans ces messages · c'est l'article
de la centralisation des journaux auxiliaires, il est conditionnel (« dans ce
cas »), et le délai du SYCEBNL est HEBDOMADAIRE.

LE REFUS ÉCARTE, IL NE JETTE PAS. L'art. 22, 2° veut la validation faite « au
terme de chaque période qui ne peut excéder un mois », donc par lots : jeter
sur le lot entier ferait qu'une seule pièce empêcherait de valider la période.
L'écriture n'entre pas au livre-journal, ce QUI EST le refus ; ce qui change
est sa forme.

DEUX EXCLUSIONS ÉCRITES, jamais omises. Les écritures `estGenereeParCloture`
(personne ne « saisit » un report à nouveau calculé à partir de soldes déjà
validés, et le laisser au brouillard ferait cesser la correspondance bilan de
clôture / bilan d'ouverture sans qu'aucun total ne bouge) et l'écriture de
combinaison du module Groupe (dossier technique, régénéré à chaque appel,
personne n'y saisit).

ET UN POINT AVEUGLE, à ne pas confondre avec une exclusion : le siège fait
naître des écritures dans le dossier d'une CELLULE avec le `createdBy` d'un
utilisateur du siège. Le double regard y est satisfait PAR CONSTRUCTION, et
personne dans la cellule n'a relu. Le logiciel ne contrôle que l'IDENTITÉ,
jamais l'INDÉPENDANCE.

Le contrôle `VALIDATION_PAR_SON_AUTEUR` (gravité INFORMATION, jamais
AVERTISSEMENT · aucun texte n'est enfreint) signale l'historique et les
dossiers qui n'ont pas activé l'option. Rien n'est dévalidé rétroactivement.

## 11. Compétences et rôles

Les compétences (`skills`) ne sont déployées que par **Manasse**, à la main,
via Réglages → Compétences. Ne pas tenter de les installer, modifier ou
publier depuis une session.

Ce fichier-ci, en revanche, est un fichier du dépôt : il se modifie et se
committe comme le reste, et il doit être tenu à jour quand une règle change.

**Agents et compétences du dépôt, déclenchés SANS ÊTRE DEMANDÉS**
(`.claude/agents/`, `.claude/skills/`, décision de Manasse du 2026-10-03 ·
« je ne te dirais jamais spécifiquement d'activer telle ou telle
compétence »). C'est à la session de les employer quand le cas se présente,
jamais à Manasse de les nommer.

- `silent-failure-hunter` · À CHAQUE ligne livrée, après la relecture
  comptable et avant l'intégration · erreurs avalées, replis silencieux,
  `catch` vides, `null` lu comme zéro (§ 10 bis).
- `typescript-reviewer` · quand le lot touche le serveur (NestJS, Prisma,
  migrations).
- `react-reviewer` · quand le lot ajoute ou modifie un écran de `client/`.
- `e2e-testing` · pour écrire ou réparer un test de `e2e/`.

Leurs constats se classent comme ceux du relecteur comptable (BLOQUANT
seulement pour un montant faussé en silence, un geste juste refusé sans
issue, un dossier enfermé) et ne priment jamais sur ce fichier · là où ils
le contredisent (couverture chiffrée, branches, quarantaine d'un test), ce
fichier l'emporte. Les crochets de `.claude/ecc-hooks/` restent éteints tant
que Manasse ne les active pas (`settings-hooks.EXEMPLE.json`).

**Le modèle et l'effort suivent le travail** (décision de Manasse du
2026-10-03). Un agent qui construit une ligne, relit le droit ou chasse les
échecs silencieux prend le modèle de la session ; une tâche mécanique
(recherche dans le dépôt, relevé d'un journal de déploiement, lecture d'un
fichier, lancement d'une suite) prend le modèle le plus léger disponible ; un
modèle dont la limite d'utilisation est atteinte n'est pas demandé. Aucun agent
de `.claude/agents/` ne fige son modèle dans son en-tête. Au plus trois agents
à la fois.

**Deux lignes à la fois, deux tours de relecture** (décision de Manasse du
2026-10-03, pour aller plus vite sans perdre la rigueur). Deux lignes de la
liste avancent ensemble quand elles sont de FAMILLES différentes (fichiers
disjoints, dépendances de la liste respectées), chacune dans sa copie et sur
sa branche de sauvegarde ; leurs intégrations sur `main` se font l'une après
l'autre, chacune avec le bloc du § 3 et les tests navigateur. La relecture
s'arrête au DEUXIÈME tour · au-delà, seul un BLOQUANT (montant faussé en
silence, geste juste refusé sans issue, dossier enfermé) fait reprendre la
ligne, le reste va aux « Relevés en attente » de la liste.
