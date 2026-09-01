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
src/common/      gardes, décorateurs, Prisma, /health
prisma/          schema.prisma + 49 migrations SQL écrites à la main
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
  *Seule exception, à ne pas « corriger »* : la migration
  `20260829033943_retire_cadratins` porte le caractère comme DONNÉE, puisque
  c'est elle qui le remplace en base. Et de toute façon, une migration déjà
  appliquée ne se modifie jamais, Prisma en vérifie l'empreinte.
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

Pour pousser : `git push -u origin main`, avec quelques tentatives espacées en
cas d'échec réseau.

## 6. Deux référentiels, et leur cloisonnement

`Tenant.referentiel` vaut `SYCEBNL` ou `SYSCOHADA`. Ils ne partagent ni plan de
comptes, ni états financiers, ni vocabulaire.

- **SYCEBNL** · complet. Trois jeux d'états (`jeuEtatsFinanciersSycebnl`) :
  associations et ordres professionnels (45 notes), projets de développement
  (26 notes), Système minimal de trésorerie (5 notes).
- **SYSCOHADA** · niveau 1 seulement, dit « tenue ». Plan de comptes complet
  (1401 lignes semées), journaux, taxes, immobilisations, éditions comptables.
  Deux systèmes (`systemeComptableSyscohada`) : normal et SMT, AUDCIF art. 11
  et 13. **Ses états financiers ne sont pas construits** · leurs fenêtres
  affichent « en construction » et les routes sont refusées côté serveur.

Le cloisonnement se fait à DEUX endroits, toujours les deux :
`referentielsApplicables` côté client (registre des fenêtres, menus) et
`@ReferentielsAutorises(...)` + `ReferentielGuard` côté serveur. Masquer sans
refuser laisse la route ouverte à un appel direct.

Propres au SYCEBNL : registre des donateurs, bailleurs, exonérations
douanières, opérations spécifiques, documents obligatoires, états financiers,
notes annexes, module groupe.

## 7. Conventions du plan de comptes semé

Valables pour les deux référentiels (`compte-seed.ts`,
`compte-seed-syscohada.ts`) :

- un compte d'imputation (feuille du plan officiel) est **complété à droite
  par des zéros jusqu'à 8 chiffres** : `5211` devient `52110000` ;
- un compte à 2 ou 3 chiffres **qui a des subdivisions** est semé **NON
  complété**, en type `TOTAL`. Deux raisons, chacune suffisante : compléter
  provoquerait des collisions (`90` complété vaut `900` complété), et casserait
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
- Mot de passe transmis par un tiers (console, siège) : `doitChangerMotDePasse`
  force le changement à la première connexion.
- Toute requête est filtrée par `tenantId`. Une requête Prisma sans `tenantId`
  sur une table multi-locataire est un défaut de cloisonnement.

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
