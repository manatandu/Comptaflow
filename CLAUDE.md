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

`Tenant.referentiel` vaut `SYCEBNL` ou `SYSCOHADA` · ils ne partagent ni plan de
comptes, ni états, ni vocabulaire. Le cloisonnement se fait toujours à DEUX
endroits : `referentielsApplicables` côté client ET `@ReferentielsAutorises` +
`ReferentielGuard` côté serveur. Un même numéro de compte ou d'article peut avoir
deux sens selon le référentiel : ne jamais servir une table pour l'autre.

**Le détail de chaque module (stocks, paie, fiscalité, consolidation, IFRS,
immobilisations, facturation, tiers, relances, sur site, abonnements…) est dans
`docs/reglement/regles-6-referentiels-et-modules.md`. LIRE la section du module
concerné AVANT de le modifier** (`grep -n "^\*\*" ` pour retrouver un titre).

Le caractère « — » de CPCC-PRO-5 est celui du texte source et se conserve, pour la
même raison que les citations de `regles-comptes-sycebnl.ts` : le remplacer
falsifierait une citation. Ne pas le « corriger » · un test le surveille.

**Après toute migration ajoutée à la main**, passer `npx prisma migrate diff
--from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma
--shadow-database-url "$DATABASE_URL" --exit-code` sur une base JETABLE (jamais celle
de production) · la règle voulue se déclare dans le schéma, on n'aligne jamais la SQL
sur un défaut.

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

Détail : `docs/reglement/regles-8-securite.md`. À retenir toujours : session en cookie
httpOnly + jeton CSRF ; `requete.ip` seul pour l'adresse client ; toute requête
bornée par `tenantId` (extension de cloisonnement) ; toute transaction par
`transactionJournalisee` ; journal d'audit posé sur le client Prisma ; cinq rôles
dont deux cantonnés ; le dossier de l'éditeur ne se coupe jamais.

## 8 bis. Volumes et plafonds de fenêtre

Détail : `docs/reglement/regles-8bis-volumes.md`. Aucune route ne rend une collection
sans borne ; un livre obligatoire se refuse au-delà du plafond, il ne se tronque pas ;
ce qui parcourt un exercice se lit par tranches (`lecture-par-lots.ts`).

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


## 9 bis et 9 ter. La marque et l'interface

Détail : `docs/reglement/regles-9bis-marque-et-9ter-interface.md` (charte, modèle Sage,
titres formels, aucun paragraphe explicatif à l'écran, `lib/montants.ts`, modales par
`PortailModale`).

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


## 10 bis et 10 ter. Ce qui casse en silence, le regard du réviseur

Détail : `docs/reglement/regles-10bis-casse-en-silence-et-10ter-reviseur.md`. Un défaut
qui laisse l'écriture équilibrée se refuse à la racine par un message nommé ; un
contrôle ne doit jamais FABRIQUER une anomalie (borner au périmètre du texte et à son
entrée en vigueur).

## 11. Compétences et rôles

Les compétences (`skills`) ne sont déployées que par **Manasse**, à la main,
via Réglages → Compétences. Ne pas tenter de les installer, modifier ou
publier depuis une session.

Ce fichier-ci, en revanche, est un fichier du dépôt : il se modifie et se
committe comme le reste, et il doit être tenu à jour quand une règle change.
