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

Racine = serveur. `client/` = interface. Un seul dépôt.

```
src/modules/     30 modules métier (auth, comptes, ecritures, etats-financiers,
                 notes-annexes, exports, groupe, plateforme, licence…)
src/common/      gardes, décorateurs, Prisma, journal d'audit, /health
prisma/          schema.prisma + 59 migrations SQL écrites à la main
client/src/      pages/, components/chrome/, lib/
docs/            plan de construction, audits, guides pilote, notes de droit
.github/workflows/  déploiement et sauvegardes
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
npx vitest run
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
  ordinaire. Le dépôt en est nettoyé, ne pas en réintroduire.
  *Deux exceptions, à ne pas « corriger »* : la migration
  `20260829033943_retire_cadratins` porte le caractère comme DONNÉE, puisque
  c'est elle qui le remplace en base (et une migration appliquée ne se modifie
  jamais, Prisma en vérifie l'empreinte) ; et les fichiers ENGENDRÉS qui
  transcrivent le texte officiel VERBATIM · `regles-comptes-sycebnl.ts` en
  porte 97, tous dans des citations du type « 481 — Fournisseurs
  d'investissements ». Les remplacer falsifierait la citation, et c'est
  justement sa fidélité qui rend l'avertissement opposable devant un
  réviseur.
- **JAMAIS** de nom de modèle d'IA dans un commit, une PR, un commentaire ou
  quoi que ce soit de poussé.
- **JAMAIS** de « bientôt disponible » qui soit faux. Une fenêtre annoncée en
  construction doit être refusée côté serveur aussi (`ReferentielGuard`), pas
  seulement masquée côté client.

## 5. Git et déploiement

Le travail va sur **`main`** · c'est cette branche qui déclenche les
déploiements. Pas de branche de fonctionnalité sauf demande explicite. Pas de
pull request sauf demande explicite.

Un push sur `main` déclenche deux chaînes indépendantes :

| Workflow | Déclencheur | Effet |
|---|---|---|
| `deploy-cloud-run.yml` | `src/**`, `prisma/**`, `Dockerfile`, `package*.json` | `prisma migrate deploy` PUIS déploiement Cloud Run, PUIS contrôle `/health` |
| `firebase-hosting-merge.yml` | tout push sur main | Firebase Hosting, site `oomega` |
| `sauvegarde-base.yml` | nocturne | `pg_dump` + restauration de contrôle |

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

Pour pousser : `git push -u origin main`, avec quelques tentatives espacées en
cas d'échec réseau.

## 6. Deux référentiels, et leur cloisonnement

`Tenant.referentiel` vaut `SYCEBNL` ou `SYSCOHADA`. Ils ne partagent ni plan de
comptes, ni états financiers, ni vocabulaire.

- **SYCEBNL** · complet. Trois jeux d'états (`jeuEtatsFinanciersSycebnl`) :
  associations et ordres professionnels (45 notes), projets de développement
  (26 notes), Système minimal de trésorerie (5 notes).
- **SYSCOHADA** · complet lui aussi. Tenue : plan de comptes (1401 lignes
  semées), journaux, taxes, immobilisations, éditions comptables. États
  financiers : deux systèmes (`systemeComptableSyscohada`), AUDCIF art. 11 et
  13, l'art. 12 (Système allégé) étant abrogé depuis la révision de 2017.
  **Système normal** · bilan, compte de résultat et tableau des flux de
  trésorerie (AUDCIF Titre IX ch. 3 à 5, correspondance postes/comptes du
  ch. 7), plus les 36 notes annexes du ch. 6 (46 codes, la numérotation
  n'étant pas continue). **Système minimal de trésorerie** · bilan, compte de
  résultat et notes 1 à 3, plus le journal de trésorerie (NOTE 4) et le
  contrôle d'éligibilité de l'art. 13 (Titre X). Rien n'est plus « en
  construction » : les fenêtres États financiers et Notes annexes aiguillent
  sur le référentiel du dossier, puis sur son système, vers l'un des quatre
  écrans (`EtatsFinanciersPage`, `NotesAnnexesPage`, aiguillage en fin de
  fichier).

Le cloisonnement se fait à DEUX endroits, toujours les deux :
`referentielsApplicables` côté client (registre des fenêtres, menus) et
`@ReferentielsAutorises(...)` + `ReferentielGuard` côté serveur. Masquer sans
refuser laisse la route ouverte à un appel direct.

Les deux tables de notes SYCEBNL portent chacune leur balayage
(`correspondance-notes-associations.spec.ts`, 45 tableaux ·
`correspondance-notes-projets.spec.ts`, 26 tableaux) : couverture de la liste
officielle, existence de chaque compte cité, cohérence des totaux et des clés,
liste gelée des tableaux hors balance, et non-contamination d'un jeu par
l'autre. Les deux jeux partagent des TITRES de note sous des numéros
différents (« TRANSPORTS » est la 25 chez les associations et la 16 chez les
projets) : c'est normal, chaque chapitre numérote les siennes. Ce qui est
surveillé, c'est le partage d'OBJET, qui ferait qu'une correction faite pour
un jeu s'appliquerait en silence à l'autre.

**Différenciateur SYCEBNL** · le référentiel décrit chaque compte par une
fiche, et deux de ses rubriques sont mises au travail depuis le 2026-09-03
(`regles-comptes-sycebnl.ts`, engendré par `scripts/extraire-regles-comptes.cjs`,
78 fiches) : « Exclusions » avertit à la saisie de ce que le compte ne doit
pas enregistrer et du compte à utiliser, « Éléments de contrôle » alimente la
fenêtre Dossier de révision, compte mouvementé par compte mouvementé. Le
texte est CITÉ, jamais reformulé. L'avertissement n'empêche pas la saisie ·
le logiciel ne connaît pas la nature de l'opération, refuser bloquerait des
écritures justes. L'AUDCIF porte les mêmes rubriques pour le SYSCOHADA
(Titre VII) : même extraction à faire, surtout pas une transposition.

Propres au SYCEBNL : registre des donateurs, bailleurs, exonérations
douanières, opérations spécifiques, module groupe.

Les **documents obligatoires** sont COMMUNS depuis le 2026-09-02, chacun lu
dans son texte et jamais transposé : livre d'inventaire (SYCEBNL art. 14 selon
le jeu · AUDCIF art. 19 pour le SYSCOHADA) et rapport (SYCEBNL art. 16-3,
quatre sections · AUSCGIE art. 138, six · AUSCOOP art. 108, six autres dont
l'état de promotion des coopérateurs). Les écarts entre les trois sont
verrouillés par `documents-obligatoires-syscohada.spec.ts` : c'est la
transposition, pas l'absence, qui est le risque de cette fenêtre.

Propres au SYSCOHADA : résultat fiscal et impôt sur les bénéfices (une entité
à but non lucratif en est exemptée, loi n° 23/053 art. 5).

Communes aux deux, mais avec un écran par référentiel derrière l'aiguillage :
états financiers et notes annexes. Les deux jeux ne partagent que les aides
techniques (`etats-financiers.communs.ts`, `note-annexe.types.ts` côté
serveur, `components/NotesAnnexesRendu.tsx` côté client) · aucun poste, aucun
compte, aucun libellé.

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

Le plan SYSCOHADA est **généré** depuis le TSV de la compétence `syscohada`.
Ne pas le retoucher à la main : corriger la source et régénérer.

Les semis annexes (journaux, taux de TVA, familles d'immobilisations, plans
analytiques) référencent des numéros **propres à chaque référentiel** · la
caisse est 5710 en SYCEBNL et 5711 en SYSCOHADA, la TVA déductible 4451 contre
4452, le mobilier 2441 contre 2444. Vérifier chaque numéro dans le plan cible
avant de l'écrire ; un spec (`compte-seed-syscohada.spec.ts`) le contrôle.

## 8. Sécurité

- Session en **cookie httpOnly** `omegax_session` + jeton CSRF apparié rejoué
  en en-tête `X-CSRF-Token`. Le jeton de session n'est jamais exposé au
  JavaScript.
- **Auto-inscription fermée** · `POST /auth/register` refuse sauf si
  `INSCRIPTION_PUBLIQUE=true`. Un dossier naît depuis la console VMG ou par le
  siège d'un groupe. `AuthService.register` reste le pipeline commun de toutes
  les créations : ne pas en écrire un second.
- `estOperateurPlateforme` n'apparaît dans **aucun** DTO. Il s'accorde au
  démarrage depuis `OPERATEURS_PLATEFORME`, en accord seulement, jamais en
  retrait.
- Mot de passe transmis par un tiers (console, siège, admin du dossier) :
  `doitChangerMotDePasse` force le changement à la première connexion, et
  `MotDePasseAChangerGuard` (global) FERME le serveur jusque-là · trois routes
  de sortie seulement, marquées `@SortieMotDePasseProvisoire()`, liste figée
  par un test. Le client seul ne suffisait pas.
- **Révocation de session** · `User.sessionsInvalidesAvant`. Tout jeton émis
  avant cet instant est refusé par `JwtStrategy`. Posé au changement de mot de
  passe, à la réinitialisation, à la désactivation et au changement de rôle ·
  un jeton vit huit heures, sans cela un mot de passe volé restait utile
  jusqu'à son expiration. La comparaison tronque à la SECONDE (l'`iat` du JWT
  est en secondes) · sans quoi le titulaire est éjecté par son propre geste.
- **Verrouillage par compte** temporaire et croissant (`src/modules/auth/
  verrouillage.ts`), vérifié AVANT bcrypt. Jamais définitif : un verrou
  définitif se retourne en refus de service.
- Toute requête est filtrée par `tenantId`. Une requête Prisma sans `tenantId`
  sur une table multi-locataire est un défaut de cloisonnement. Ce n'est plus
  seulement une règle de discipline : `src/common/cloisonnement/` porte une
  extension Prisma qui REFUSE une collection non bornée, refuse d'écrire sur
  la ligne d'un autre dossier, et rend inexistante la ligne lue d'un autre
  dossier. Elle ne réécrit jamais une requête · réécrire masquerait le défaut.
  La seule échappatoire est `horsCloisonnement('raison', ...)`, dont la liste
  des utilisateurs est gelée par un test.
- **Journal d'audit** (`src/common/audit/`) · posé sur le client Prisma par
  une extension, pas par des appels dans les services : un contrôle qu'on peut
  oublier d'appeler n'est pas un contrôle. Il couvre les modèles de
  `MODELES_AUDITES` (accès, configuration, actes d'exercice) et jamais les
  lignes engendrées en masse. Chaque événement porte l'empreinte du précédent
  (chaîne par dossier) · c'est ce qui rend une retouche visible, AUDCIF
  art. 22, 5° et 6°. Deux règles à ne pas défaire : aucune route d'écriture
  sur `/journal-audit`, et aucun champ sensible recopié (`masquer()` remplace
  mot de passe, jeton et secret par un marqueur).

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

## 9. Style de code

Le code de ce dépôt est commenté **en français**, et les commentaires
expliquent POURQUOI, pas quoi. Un commentaire qui paraphrase la ligne suivante
est du bruit ; un commentaire qui dit quel incident la ligne empêche vaut de
l'or. Suivre la densité et le ton de l'existant.

Nommage en français (`creerCellule`, `balanceAgregee`, `lignesBalance`), sauf
les termes techniques consacrés.

Toute règle comptable codée cite sa source en commentaire : l'article, la
partie, le chapitre. Toute anomalie du texte officiel est signalée sur place,
jamais corrigée en silence.

## 10. Tests

Jest côté serveur, Vitest côté client. Un test doit vérifier **ce qui casserait
en silence** : un plan de comptes incomplet, un état qui ne boucle plus, une
note annexe absente, un cloisonnement qui saute. Les tests d'export relisent le
classeur produit plutôt que d'affirmer qu'il est correct.

Quand un bug est corrigé, le test qui l'aurait attrapé est écrit dans le même
commit.

## 11. Compétences et rôles

Les compétences (`skills`) ne sont déployées que par **Manasse**, à la main,
via Réglages → Compétences. Ne pas tenter de les installer, modifier ou
publier depuis une session.

Ce fichier-ci, en revanche, est un fichier du dépôt : il se modifie et se
committe comme le reste, et il doit être tenu à jour quand une règle change.
