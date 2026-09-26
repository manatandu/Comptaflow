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
prisma/          schema.prisma + 60 migrations SQL écrites à la main
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
  réviseur. Même raison, même statut, pour l'item CPCC-PRO-5 de
  `catalogue-questionnaire.ts`, qui cite un impératif du séminaire tel qu'il
  est écrit.
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

**Fiches par compte, les deux référentiels** · chaque texte décrit ses
comptes par une fiche, et deux de ses rubriques sont mises au travail depuis
le 2026-09-03 (`regles-comptes-sycebnl.ts`, 78 fiches, Partie 2 ch. 3 ·
`regles-comptes-syscohada.ts`, 115 fiches, AUDCIF Titre VII · les deux
engendrés par `scripts/extraire-regles-comptes.cjs`) : « Exclusions » avertit
à la saisie de ce que le compte ne doit pas enregistrer et du compte à
utiliser, « Éléments de contrôle » alimente la fenêtre Dossier de révision,
compte mouvementé par compte mouvementé.

Le texte est CITÉ, jamais reformulé. L'avertissement n'empêche pas la saisie ·
le logiciel ne connaît pas la nature de l'opération, refuser bloquerait des
écritures justes. Et LES DEUX TEXTES N'ÉCRIVENT PAS LA RÈGLE PAREIL : le
SYCEBNL dit « (utiliser 104) », l'AUDCIF « → 481 ». Deux lecteurs distincts
dans l'extracteur, et jamais une table servie pour l'autre référentiel.

Propres au SYCEBNL : registre des donateurs, bailleurs, exonérations
douanières, opérations spécifiques, canevas de trésorerie du groupe.

Le **module groupe** est COMMUN depuis le 2026-09-24. Une association et ses
cellules (SYCEBNL, liaison par le 58), une société et ses établissements ou
succursales (SYSCOHADA, liaison par les 184 à 187). Dans les deux cas c'est UNE
entité en plusieurs dossiers, pas une consolidation. La fiche du COMPTE 18
(AUDCIF, Titre VII) fonde la variante SYSCOHADA : « les comptes de liaison sont
égaux et de sens contraire dans les deux comptabilités ». Leur somme sur le
groupe doit être nulle ; nulle, les 184 à 187 sortent de l'agrégat, rendus
ligne à ligne ; sinon rien ne sort et la liasse est refusée. Les 181 à 183 et
188 visent d'AUTRES personnes (entités liées) et ne sont pas des liaisons. Le
même numéro ne veut rien dire en SYCEBNL (185 = dépôts reçus) : le contrôle
n'existe que sous le SYSCOHADA. Cellule et combinaison prennent le référentiel
(et, en SYSCOHADA, le système comptable) du siège, imposé aux deux portes
(`creerCellule`, `modifierGroupe`). Le canevas de trésorerie, bâti sur les
comptes du plan SYCEBNL, reste au seul SYCEBNL (filtre de route).

Les **documents obligatoires** sont COMMUNS depuis le 2026-09-02, chacun lu
dans son texte et jamais transposé : livre d'inventaire (SYCEBNL art. 14 selon
le jeu · AUDCIF art. 19 pour le SYSCOHADA) et rapport (SYCEBNL art. 16-3,
quatre sections · AUSCGIE art. 138, six · AUSCOOP art. 108, six autres dont
l'état de promotion des coopérateurs). Les écarts entre les trois sont
verrouillés par `documents-obligatoires-syscohada.spec.ts` : c'est la
transposition, pas l'absence, qui est le risque de cette fenêtre.

Propres au SYSCOHADA : résultat fiscal et impôt sur les bénéfices (une entité
à but non lucratif en est exemptée, loi n° 23/053 art. 5).

**Personnel extérieur · le virement que les deux textes écrivent chacun.** À la
clôture, le compte 637 est viré POUR SOLDE au débit du 667 (SYCEBNL, Partie 2
ch. 3, fiches des comptes 63 et 66 · AUDCIF, Titre VIII ch. 27 § 2). C'est la
quatrième application de la prééminence de la réalité sur l'apparence : la
facture d'un intérimaire est juridiquement un service, économiquement du
travail. Oublié, le virement ne déséquilibre RIEN · les deux comptes sont en
classe 6 et le résultat net est identique. Seule la ventilation du compte de
résultat est fausse, et au SYSCOHADA la cascade des soldes intermédiaires de
l'art. 31, la valeur ajoutée se calculant entre les deux. D'où le contrôle
`PERSONNEL_EXTERIEUR_NON_VIRE`, qui signale sans virer d'office : le montant,
la date et le journal appartiennent au comptable.

**Rubriques de notes en saisie · ce que le logiciel ne peut pas calculer.**
322 rubriques des trois jeux portent `saisie: true` : engagements donnés et
reçus, effectifs, informations sociales et environnementales, événements
postérieurs à la clôture, règles et méthodes comptables. Elles sont
OBLIGATOIRES (SYCEBNL art. 15, AUDCIF art. 33) et aucune balance ne les porte.
Depuis le 2026-09-03 elles sont stockées (`SaisieNote`, table
`saisies_notes`), par exercice, et l'écran des notes les rend modifiables.

Trois règles à ne pas défaire. L'ancre est le couple (code de note, CLÉ de
rubrique) et le RANG de la colonne, jamais un libellé ni un index de ligne ·
`rubriques-en-saisie.spec.ts` gèle les deux (unicité des clés dans un code,
sous-tableaux compris, et nombre de colonnes par tableau). Une rubrique en
saisie n'est JAMAIS rattachable, et une rubrique rattachable n'est jamais en
saisie · deux sources pour une même cellule, ce serait un montant dont rien ne
dit d'où il vient. Et les lignes en saisie sont présentées même quand la note
n'est pas applicable : le filtre du § 1.4 les retirait, ce qui faisait de
toute note vide un cul-de-sac impossible à remplir.

**Note 33 · la fiche de synthèse ne se ressaisit pas.** Les vingt-quatre
indicateurs calculables sont produits par `indicateurs-note-33.ts` depuis le
bilan, le compte de résultat et le TFT · cellules verrouillées. Deux lectures
que le texte laisse ouvertes y sont tranchées et expliquées : « + Fonds
propres et assimilés » vaut **CZ** et non CK, parce que l'arithmétique que la
note pose elle-même (fonds propres + dettes financières = ressources stables)
l'exige et que la ligne CONTRÔLE tomberait sinon en faux chez toute
association portant des fonds affectés ; et les écarts de conversion (renvoi
c) restent HORS des agrégats, faute que le bilan dise à quelles créances ils
se rapportent · l'écart qu'ils créent se lit alors sur la ligne CONTRÔLE, ce
pour quoi elle existe. Le ratio d'utilisation des dons reste en SAISIE : le
texte ne le rattache à aucun compte. Et les variations de ratio sont en
POINTS, la colonne « variation en % » restant vide pour eux · renvoi (b).

**Exécution budgétaire · un seul tableau, sous deux numéros.** Les notes 35
(associations) et 24 (projets) portent le même TABLEAU D'EXÉCUTION
BUDGÉTAIRE, et il n'est plus saisi : `NoteAnnexeService`
(`injecterExecutionBudgetaire`) remplace leurs lignes par celles de
`EtatsFinanciersProjetBudgetService.executionBudgetaire()`, cellules
verrouillées, quand le dossier a un plan analytique à budgets. Sans plan à
budgets, le service lève et la note reste en saisie · repli VOULU, une entité
qui ne suit aucun budget n'a rien à exécuter. Le SYSCOHADA n'a pas cette note :
l'AUDCIF ne demande aucun état budgétaire.

**Cotisations · l'appel ou l'encaissement, et c'est le dossier qui répond.**
Cadre conceptuel § 5.4.2.1 : le fait générateur est l'APPEL, « toutefois, si
l'entité ne peut justifier d'un droit d'agir en recouvrement, les cotisations
et le droit d'entrée sont comptabilisés lors de leur encaissement effectif »,
et « l'entité doit préciser dans les notes annexes, la méthode retenue ». Ce
n'est pas une préférence de présentation : c'est l'existence, dans les
STATUTS, d'une voie de recouvrement. `Tenant.methodeCotisations` enregistre ce
que le cabinet a constaté, sans valeur par défaut · un APPEL présumé ferait
inscrire à l'actif des créances que l'entité ne peut pas poursuivre. Le choix
commande ensuite les écritures (les modèles `exigeDroitDAgir` sont refusés à
un dossier à l'encaissement) et le contrôle
`METHODE_COTISATIONS_NON_PRECISEE` rappelle la mention obligatoire, mais
seulement à un dossier qui a mouvementé le 701 ou le 103. Un dossier qui n'a
rien tranché n'est PAS bloqué à la saisie : le texte fait de l'appel la règle.

**Trois indices de minoration relevés par la DGI.** Le séminaire CPCC sur
l'arrêté des comptes 2024 énumère des écritures dont l'ABSENCE est lue par
l'administration comme une intention de minorer la base imposable. Trois sont
mécaniquement détectables et posés depuis le 2026-09-03 :
`TRANSPORT_TIERS_SANS_TRANSFERT` (613 débité sans aucun 781 mouvementé),
`EXTOURNE_REGULARISATION_INCOHERENTE` (extourne du 476 ou du 477 d'un montant
différent du solde repris · le cas le plus fin, car le solde de clôture
redevient normal et ne trahit rien) et `AVANCE_CLIENT_REPORTEE` (419 créditeur
à la clôture précédente). Les deux premiers avertissent, le troisième informe ·
il porte une position de contrôle, pas une règle de l'AUDCIF. Le 613 et le 419
ne s'adressent qu'au SYSCOHADA, une EBNL étant exemptée d'IS (loi n° 23/053,
art. 5) ; l'extourne vaut pour les deux, ce n'est pas un risque d'assiette mais
une régularisation fausse.

**AUCUN TAUX DE CE SÉMINAIRE N'EST REPRIS** · il raisonne en IBP et en IPR,
abrogés au 1er janvier 2026 et remplacés par l'IS et l'IRPP. Seuls les
mécanismes d'écriture sont retenus, et aucun ne dépend d'un taux. Un test le
vérifie sur les messages produits.

**ET DEUX RÈGLES DE FOND DU MÊME SÉMINAIRE NE VALENT PLUS**, vérifié le
2026-09-05 dans la loi n° 23/053 art. 51 et 52 (compilation DGI au 19/07/2026)
que la loi de finances n° 25/060 ne modifie pas. Le **plafond d'imputation de
60 %** du bénéfice fiscal et l'**imputation de l'impôt minimum** payé en année
déficitaire n'existent dans AUCUN article du régime actuel · ils viennent de
l'art. 42 de l'ordonnance-loi n° 69/009 sous l'IBP. Les **amortissements
réputés différés**, eux, survivent mais ont perdu leur report illimité :
l'art. 51 les tient pour « des déficits ordinaires », donc soumis aux trois
exercices comme le reste, là où l'art. 42 bis, 5° les reportait « sans
limitation de durée ». Il n'y a donc RIEN de séparé à calculer pour eux, et un
stock d'ARD à durée propre rétablirait une règle abrogée. Deux tests de
`fiscalite.spec.ts` le figent, chacun avec son article.

**Inventaire physique · l'obligation que le logiciel ne portait pas.** AUDCIF
art. 42 : « À la clôture de chaque exercice, l'entité doit procéder au
RECENSEMENT et à l'ÉVALUATION de ses biens, créances et dettes à leur valeur
effective du moment ». L'art. 3 du SYCEBNL ne l'écarte PAS (sa liste saute de
34 à 49) · le module est donc ouvert aux deux référentiels, sans
`@ReferentielsAutorises`.

L'EXPOSITION PÉNALE, elle, ne passe pas par le même article, et les deux ne se
servent jamais l'un pour l'autre : AUDCIF art. 111 côté SYSCOHADA, et SYCEBNL
art. 24 premier tiret côté EBNL, puisque l'art. 3 écarte justement les art. 73
à 113. Même discipline que pour le livre d'inventaire (art. 19 quatrième
tiret, écarté, contre art. 14 SYCEBNL). `sanctionApplicable()` résout le
chemin, et un test vérifie qu'aucun des deux ne cite l'article de l'autre.

TROIS REFUS, chacun contre un défaut qui s'équilibre et ne se voit nulle part
en aval. Le module NE COMPTABILISE JAMAIS UN EXCÉDENT · AUDCIF art. 43, « si
la valeur d'inventaire est SUPÉRIEURE à la valeur d'entrée, cette dernière est
MAINTENUE dans les comptes » ; une écriture d'excédent boucle la balance et
gonfle le résultat d'une plus-value latente que le texte interdit d'inscrire.
Il REFUSE DE RAPPROCHER tant qu'une fiche n'est pas valorisée · lue comme
zéro, elle transformerait « pas encore compté » en manquant, à la charge de
l'entité. Et il FIGE LE SOLDE au rapprochement plutôt que de le relire ·
sinon la première écriture de redressement referme l'écart toute seule et
l'arbitrage porte sur un chiffre que personne n'a vu.

L'ÉCART EST PAR COMPTE, PAS PAR FICHE. Le CPCC compare « le solde de CHAQUE
COMPTE sur la balance provisoire » : un magasin compté sur quarante fiches se
rapproche d'un seul solde. D'où deux tables et non une · `FicheInventaire`
porte le comptage, `EcartInventaire` porte la comparaison et la décision.

Le module PROPOSE l'écriture de redressement d'un manquant, contrepartie
LAISSÉE VIDE : aucun texte ne dit quel compte de charge reçoit un manquant
d'inventaire, cela dépend de sa nature, et c'est ce que la sous-commission a
tranché. Il ne poste jamais d'office.

**Circularisation · l'autre moitié de l'inventaire, celle qui se demande à des
tiers.** ISA 505, « External Confirmations ». Le comptage de magasin établit ce
que l'entité détient ; la confirmation externe établit ce que des tiers lui
doivent ou lui réclament · banques, fournisseurs, clients et adhérents, autres
tiers. Le module tire l'échantillon de la balance elle-même
(`racinesDuCycle` · 52/53, 40, 41, 42/43/44/47), de sorte qu'un solde ne peut
pas être « oublié » du périmètre sans que le taux de couverture le dise.

DEUX TAUX, JAMAIS UN SEUL. Le taux de RÉPONSE compte les lettres revenues ; le
taux de COUVERTURE pèse les soldes confirmés sur le total du cycle. Vingt
petites réponses sur vingt-cinq lettres font 80 % de réponses et peuvent ne
couvrir que 3 % des soldes. Afficher le premier sans le second laisse croire
qu'un cycle est circularisé quand il ne l'est pas.

TROIS REFUS, chacun contre un défaut qui laisse le dossier parfaitement
présentable. UNE NON-RÉPONSE N'EST PAS UNE CONFIRMATION · ISA 505 § 12, « in
the case of EACH non-response, the auditor shall perform alternative audit
procedures ». La clôture est refusée tant qu'une demande sans réponse n'a pas
sa procédure alternative écrite : un dossier où quarante lettres sont parties,
six sont revenues, et où les trente-quatre autres sont comptées comme « pas de
désaccord » n'a rien confirmé du tout, et rien à l'écran ne le dirait. UN
ÉCART SE QUALIFIE, IL NE SE SOLDE PAS · § 14, l'auditeur « shall investigate
exceptions to determine whether or not they are indicative of misstatements » ;
d'où une nature obligatoire (délai, mesure, erreur matérielle, anomalie
potentielle) plutôt qu'un simple montant à zéro. LA DEMANDE NÉGATIVE EST
ENFERMÉE · § 15 pose QUATRE conditions cumulatives, et le module les exige
toutes les quatre déclarées avant d'accepter la forme négative, parce que
c'est la forme qui produit le moins d'éléments probants et la plus facile à
choisir par confort.

Enfin le § 7 c) : une réponse qui n'arrive pas directement du tiers · relayée
par l'entité auditée, réexpédiée depuis une adresse fournie par elle · est
marquée, pas rejetée. C'est un fait sur la fiabilité de l'élément probant, et
il doit rester lisible au dossier.

Rappel de cadre, pour que le module ne soit jamais lu de travers : un cabinet
qui TIENT les comptes n'est pas l'auditeur de ces comptes. Ces campagnes sont
des travaux de révision et de contrôle interne préparatoires · elles ne
constituent pas une mission d'audit légal, et le module ne produit aucune
opinion.

**Registre des provisions pour risques et charges · le même texte, deux
nomenclatures.** L'AUDCIF traite la matière au Titre VIII ch. 18, et la fiche
du COMPTE 19 du SYCEBNL y renvoie mot pour mot : « Les provisions, passifs et
actifs éventuels sont traités au titre VIII […] chapitre 18 […] du
SYSCOHADA ». Le module est donc ouvert aux deux, et ce n'est pas une
tolérance · c'est le SYCEBNL lui-même qui envoie chercher la doctrine à côté.

CE QU'ILS NE PARTAGENT PAS EST LA NOMENCLATURE, et c'est le piège central,
parce qu'il est muet : les deux plans emploient les MÊMES numéros pour des
natures différentes. Au 192, le SYSCOHADA loge les « garanties données aux
clients », le SYCEBNL les « charges sur donations et legs ». Le SYCEBNL ne
porte ni 193 (pertes sur marchés), ni 195 (impôts), ni 197 (restructurations).
Une nature choisie sans regarder le référentiel ferait porter à une
association, au 192, une provision de garantie client : le compte existe, la
balance boucle, et la Note annexe publie un intitulé qui n'a rien à voir avec
le risque. `naturesDuReferentiel()` tranche, quatre tests le figent.

LES QUATRE CONDITIONS, ET POURQUOI QUATRE. Le CPCC les compte quatre, l'AUDCIF
trois : le texte fusionne « obligation actuelle » et « résultant d'un événement
passé » dans une seule phrase (§ 2.1), là où le séminaire les sépare pour les
faire vérifier une par une. C'est le MÊME test, rien n'est ajouté au texte, et
quatre cases se cochent mieux que trois.

TROIS REFUS. UNE PROVISION INTERDITE NE SE COMPTABILISE PAS · le § 4.11 en
nomme deux, les pertes opérationnelles futures et les grosses réparations, et
le registre les propose pour les REFUSER avec leur article et la voie de
rechange (composant distinct ou charge). Les faire disparaître de la liste ne
les empêcherait pas : elles finiraient au 1988 sous « divers », et plus
personne ne saurait ce qu'il y a dedans. UNE CONDITION QUI MANQUE NE FAIT PAS
DISPARAÎTRE LA LIGNE · elle la bascule en passif éventuel, avec son motif
écrit. Le défaut visé n'est pas une provision de trop mais une provision de
moins : un risque examiné, écarté, et mentionné nulle part · le bilan est
juste, l'annexe est muette, et c'est ce que le texte interdit. LE
REMBOURSEMENT ATTENDU NE SE COMPENSE JAMAIS · § 3.1.4, il n'est comptabilisé
« que s'il est certain que l'entité le recevra » et se présente « au bilan
comme un actif DISTINCT, NON COMPENSÉ avec la provision […] car l'entité reste
responsable de l'extinction de l'obligation en cas de défaillance du tiers ».
Une provision nette du remboursement s'équilibre et sous-estime le passif ET
l'actif du même montant.

LE TABLEAU DE VARIATION est celui du § 5.3, dans son ordre, et c'est celui que
le CPCC demande à l'auditeur d'obtenir. Utilisations et reprises y restent
SÉPARÉES : une provision utilisée était justifiée, une provision reprise ne
l'était pas, et les additionner rendrait le même total en effaçant la seule
information que la ligne portait sur la qualité de l'estimation. Le
rapprochement avec le solde du compte se fait en VALEUR ABSOLUE, un 19 étant
créditeur, et ne cherche aucun solde pour un passif éventuel · il n'est dans
aucun compte, par définition.

CE QUE LE MODULE NE FAIT PAS. Il ne passe aucune écriture. Il n'évalue aucun
montant · le § 3.1.1 demande « la meilleure estimation de la dépense
nécessaire au règlement de l'obligation », jugement qu'aucun logiciel ne rend.
Et il n'ACTUALISE pas : le § 3.1.2 veut un taux reflétant « l'appréciation
actuelle par le marché et le risque spécifique à ce passif externe », donnée
qui n'est dans aucune table. La colonne d'actualisation existe, elle se
saisit.

**Registre des faiblesses du contrôle interne · deux registres, et deux
régimes de report opposés.** Le CPCC pose la phrase parmi les travaux de
l'inventaire documentaire, et s'arrête là : « faire le suivi des faiblesses
relevées lors de l'audit précédent ». Il ne dit ni ce que ce suivi contient,
ni ce qu'il refuse. La matière est dans l'ISA 265.

LE REGISTRE EST OUVERT DEUX FOIS, parce que le cabinet occupe deux places qui
n'ont pas les mêmes droits. En RÉVISION_INTERNE, il constate sur son propre
travail de tenue, au titre de l'étape « révision (self audit) » du CPCC : il
décrit, il qualifie, il recommande. En RECOMMANDATION_EXTERNE, une lettre est
arrivée d'un réviseur, d'un commissaire aux comptes ou d'un bailleur, et
OmegaX est le PORTE-DOCUMENTS de la direction : il range, il suit les
échéances, il ne requalifie rien. La qualification portée dans la lettre est
recopiée telle quelle · `qualifier()` est refusé dans ce mode, et la clôture
n'y réclame ni qualification ni écrit, qui sont le travail d'un autre.

LE DOUBLE RÉGIME DE REPORT est le cœur du module, et il tient à deux
paragraphes qui disent le contraire l'un de l'autre · ils ont raison tous les
deux. Sur une faiblesse SIGNIFICATIVE non remédiée, § A17 : « the fact that
the auditor communicated a significant deficiency […] in a previous audit does
NOT eliminate the need for the auditor to REPEAT the communication if remedial
action has not yet been taken », et le paragraphe laisse le choix entre
répéter la description et référencer la communication antérieure · pas celui
de ne rien dire. Sur une AUTRE faiblesse, § A24 dit l'inverse : « the auditor
NEED NOT REPEAT the communication in the current period ». Un module qui
traiterait les deux pareil se tromperait dans les deux sens · silence coupable
d'un côté, bruit inutile de l'autre. `regimeDeReport()` tranche, et sept
mutations compilantes le figent.

RIEN NE SE QUALIFIE TOUT SEUL. § 6 b) fait de la faiblesse significative un
jugement · « in the auditor's PROFESSIONAL JUDGMENT » · et § 8 fait de la
détermination une obligation. Le module exige donc les deux moitiés, un auteur
et une justification écrite, et il n'existe aucun chemin qui qualifie à partir
d'un montant, d'un délai ou d'une case cochée. Les indicateurs du § A7, donnés
« for example », sont proposés au jugement et n'en tirent aucune conséquence.
L'escalade du § A24 · « the failure of management to remedy other deficiencies
[…] MAY BECOME a significant deficiency […] depends on the auditor's
JUDGMENT » · est du même ordre : un acte posé, daté et motivé, jamais un effet
automatique du calendrier sur une échéance dépassée.

DEUX REFUS DE CLÔTURE, en révision interne seulement. Une faiblesse laissée
NON QUALIFIÉE, parce que § 8 est un « shall ». Et une SIGNIFICATIVE jamais
sortie par écrit, parce que § 9 l'est aussi : « the auditor shall communicate
IN WRITING significant deficiencies […] on a timely basis ». C'est le défaut
qui laisse le registre parfaitement présentable · dix faiblesses graves
décrites, recommandées, suivies, reconduites d'exercice en exercice, et
personne n'a jamais rien écrit à la gouvernance. Le destinataire n'est pas le
même selon la qualification (§ 9 les organes de gouvernance, § 10 b) la
direction), et une escalade remet donc l'écrit à faire.

AUCUN CHIFFRAGE N'EST DEMANDÉ, et c'est délibéré : § A28, « the auditor NEED
NOT QUANTIFY those effects ». Il n'existe dans ce module aucun champ de
montant sur une faiblesse · en réclamer un fabriquerait une précision dont la
norme dispense, et ferait passer pour mineure toute faiblesse qu'on ne sait
pas chiffrer. Deux tests figent cette absence dans la source.

DEUX SÉPARATIONS ENCORE. L'auteur du constat ne signe pas la réponse de la
direction · § A28 range celle-ci du côté de « MANAGEMENT ». Et « remédiée » ne
se coche pas sans dire si le cabinet a VÉRIFIÉ la mise en œuvre ou s'il s'en
tient à la déclaration de la direction · le même § A28 prévoit « a statement
as to whether or not the auditor has undertaken any steps to verify ». « Non
vérifiée par le cabinet » est une réponse recevable ; le silence n'en est pas
une, parce qu'il se lit comme une vérification.

Même cadre que la circularisation, et il vaut d'être répété : un cabinet qui
tient les livres n'est pas l'auditeur de ces livres. L'ISA 265 est reprise
comme référence de MÉTHODE, aucune opinion ne sort de ce registre, et les
trois mentions de contexte du § 11 b) le disent à l'écran.


**M2 · la balance en monnaie fonctionnelle, ligne à ligne au cours
historique.** M1 a posé la règle et elle ne bouge pas : la monnaie de TENUE ne
se choisit pas. Loi n° 23/053 art. 141, 1° · la comptabilité « est exprimée en
Franc congolais » ; AUDCIF art. 17, 1° · elle se tient « dans l'unité monétaire
ayant cours légal dans l'État partie ». Les livres et les états déposés restent
en francs.

ET POURTANT beaucoup d'ASBL et de sociétés congolaises encaissent, dépensent et
rendent compte à leur bailleur en dollars. Ce second jeu existe pour elles.
AUCUN TEXTE LU NE LE RÉGIT · l'AUDCIF ne connaît la devise que pour convertir
une opération VERS l'unité légale (art. 36 et suivants, Titre VIII ch. 22),
jamais pour en sortir. Le produire est une décision de l'éditeur, et chaque
page porte la mention qui le dit · en tête et non en note de bas de page, parce
qu'un document qui ressemble à une balance et qui n'est pas la balance légale
doit dire lequel des deux il est avant qu'on en lise les chiffres.

LA MÉTHODE, ET POURQUOI CELLE-LÀ. Convertir la BALANCE au cours de clôture
serait plus simple, et faux : le coût historique d'un bâtiment acheté il y a six
ans se retrouverait exprimé au cours d'aujourd'hui, et la balance cesserait
d'équilibrer sans une ligne de bouclage inventée. La conversion se fait donc
LIGNE À LIGNE, au cours de la DATE DE L'ÉCRITURE · le cours historique de
l'opération elle-même. Et TOUTES LES LIGNES D'UNE MÊME ÉCRITURE PRENNENT LE
MÊME COURS : c'est ce qui garde chaque écriture équilibrée après conversion, et
la balance entière avec elle. Deux cours dans une même écriture la
déséquilibreraient par pure arithmétique.

UNE LIGNE DÉJÀ LIBELLÉE DANS LA MONNAIE FONCTIONNELLE N'EST PAS CONVERTIE ·
elle porte son montant d'origine. Un virement de 10 000 USD doit apparaître
pour 10 000 USD, pas pour sa contrevaleur en francs redivisée par un cours, qui
rendrait 9 999,97 sans qu'aucun centime n'ait bougé. Le cours dit combien vaut
UNE unité de la devise en monnaie de tenue, la conversion DIVISE donc par lui.

D'OÙ L'ÉCART DE CONVERSION, ET IL EST MONTRÉ. Une écriture qui mêle une ligne
prise à son montant d'origine et une ligne convertie ne s'équilibre plus dans
la monnaie fonctionnelle. Ce n'est pas un défaut de calcul, c'est un fait · les
deux côtés de l'opération n'ont pas la même origine. L'écart est porté sur sa
propre ligne, nommé, et jamais logé dans un compte de bouclage, qui ferait
équilibrer l'état et disparaître l'information.

DEUX REFUS DE MÉTHODE. Jamais un cours POSTÉRIEUR à la date de l'opération · ce
serait convertir avec une information que personne n'avait alors, et le second
jeu cesserait d'être historique pour devenir rétrospectif. Et une date SANS
COURS arrête l'état, avec la liste des dates manquantes · prendre le cours le
plus proche ou celui de la clôture produirait une balance plausible et fausse,
que personne ne vérifie. Deux refus de contexte s'y ajoutent : aucune monnaie
fonctionnelle nommée, et une monnaie fonctionnelle égale à la monnaie de tenue,
où le second jeu n'aurait rien à convertir.


**Procès-verbal de comptage par caisse · un PV par caisse, et la caisse qu'on
oublie.** Le PV de la CAMPAGNE porte l'inventaire physique dans son ensemble
(CPCC, étape 2 · « signatures de ceux qui ont inventorié ET assisté à cet
inventaire »). Il ne peut pas porter le comptage des espèces : le § VI demande
« A-t-on tenu compte de la caisse SIÈGE, de la caisse AGENCE, de la caisse DE
SECOURS ? », trois caisses comptées à trois endroits, chacune par sa
sous-commission et chacune à son heure. Un seul PV pour les trois ne dit plus
laquelle a été comptée ni par qui.

QUATRE REFUS. La caisse est un 57 et rien d'autre · un comptage d'espèces sur
un 52 compterait une banque, qui ne se compte pas, elle se circularise. Le PV
se signe par ceux qui ont compté ET par ceux qui ont assisté, et ce sont les
membres de SA sous-commission, pas ceux de la campagne · vérifier à nouveau
n'est pas une redite, c'est le même refus posé sur l'opération qu'il concerne.
La ventilation par coupure doit égaler le total qu'elle détaille, faute de quoi
c'est le détail que le lecteur croira. Et l'attestation ne s'établit pas sans
signataire · le CPCC demande si « une attestation a-t-elle été établie », et
une attestation sans signataire n'atteste de rien.

LA COUVERTURE REND MÉCANIQUE UNE QUESTION COMPOSITE. Sur une checklist,
« a-t-on tenu compte de la caisse siège, de la caisse agence, de la caisse de
secours ? » se répond par un « oui » global qui ne dit rien de la caisse
oubliée. Ici la liste des comptes 57 du dossier est confrontée aux PV établis,
un par un, et la clôture de la campagne est refusée tant qu'une caisse à solde
non nul n'a pas le sien · une caisse non comptée à la clôture ne se recompte
plus jamais. Les caisses à SOLDE NUL ne sont pas réclamées : une caisse fermée
n'a rien à compter, et l'exiger ferait du bruit sur chaque dossier qui a soldé
une caisse d'agence. C'est un choix, il est écrit plutôt que caché. L'écart non
arbitré reste le PREMIER motif de refus · c'est le plus ancien et le plus
grave.

CE QUE LE MODULE NE DIRA PAS. Aucune source lue ne définit le CONTENU de
l'attestation. Le module en enregistre l'existence, sa date et son signataire,
et laisse le document au cabinet · inventer ses mentions produirait un modèle
qui aurait l'air officiel sans l'être, et un test vérifie qu'aucun champ de
contenu n'apparaît un jour à côté des deux qui existent.

DEUX AJOUTS DE L'ÉDITEUR, nommés comme tels dans le code. L'HEURE du comptage ·
aucun texte ne la réclame, elle est portée parce qu'une caisse bouge dans la
journée et qu'un comptage sans heure ne se rattache à aucun solde précis. Et la
VENTILATION PAR COUPURE · elle n'est exigée nulle part non plus, elle existe
parce que la fiche du compte 57 dit, dans les deux plans, que « le solde du
compte caisse doit toujours correspondre exactement à la somme disponible
réellement », et qu'un nombre écrit à la main ne montre pas comment on y est
arrivé. Elle reste facultative.

Le solde comptable est FIGÉ sur le PV, comme sur la fiche d'inventaire et pour
la même raison : le comptage se compare à la balance telle qu'elle était au
moment du comptage, et un règlement passé le lendemain déplacerait la cible et
refermerait l'écart tout seul.


**Composant « révisions majeures » · l'unique estimation rétrospective que le
référentiel autorise, et la fiction qu'il n'autorise pas.** L'AUDCIF art. 38-2
pose le mécanisme et le Titre VIII ch. 5 § 1 le détaille en deux temps : « dès
la date de comptabilisation initiale de l'actif, un composant "Révisions
majeures" est comptabilisé séparément des composants physiques et de la
structure et est amorti sur la durée restant à courir JUSQU'À LA PROCHAINE
RÉVISION » ; puis, « lorsque la révision est réalisée, le coût correspondant
est inscrit en tant qu'actif distinct […] et il est amorti sur la DURÉE
SÉPARANT DEUX RÉVISIONS », la valeur nette résiduelle de la précédente étant
« sortie de l'actif ». L'exemple officiel chiffre le premier temps : un
matériel de 190 000 000 sur six ans, révisé tous les deux ans pour 10 000 000,
porte une structure amortie sur 180 000 000 en six ans et une révision amortie
sur 10 000 000 en DEUX ans.

D'OÙ UN REFUS MÉCANIQUE : une révision majeure dont la durée égale ou dépasse
celle de la structure n'en est pas une · c'est un morceau de la structure, et
l'entité a décomposé pour rien. Le message porte l'exemple officiel plutôt
qu'une règle abstraite.

LA RECONSTITUTION EST LE CŒUR DU CHANTIER, et c'est le SEUL endroit du
référentiel qui ouvre une estimation rétrospective : « Lorsque le composant
"Révisions majeures" n'a pas été comptabilisé séparément ou spécifiquement
identifié lors de la comptabilisation initiale […], sa valeur nette comptable
PEUT ÊTRE ESTIMÉE par référence au "COÛT DE RÉVISION ACTUEL AMORTI", COMME SI
cette révision avait été réalisée à la date d'acquisition de l'immobilisation
ou d'achèvement de sa production. » Trois mots portent tout le calcul. Le coût
est celui d'AUJOURD'HUI et non celui d'il y a six ans, et c'est une donnée du
dossier qu'aucune comptabilité ne porte. AMORTI se lit sur l'intervalle qui
sépare deux révisions, la seule durée que le § 1 donne à ce composant. Et
« comme si réalisée à la date d'acquisition » fixe le point de départ de cet
amortissement fictif.

LA LIMITE DE LA FICTION EST DANS LA PHRASE ELLE-MÊME : elle se place AVANT
toute révision, sinon la précédente aurait dû être décomptabilisée et son coût
réel serait connu. Passé un intervalle complet, l'amortissement fictif dépasse
le coût et la valeur nette deviendrait négative. Le module ne prolonge alors
pas la fiction · il réclame la DATE DE LA DERNIÈRE RÉVISION RÉELLEMENT
RÉALISÉE, à partir de laquelle le calcul redevient celui du texte. Fabriquer un
modulo sur les intervalles écoulés aurait rendu un chiffre plausible pour une
révision dont personne ne sait si elle a eu lieu · c'est la forme la plus
discrète du § 10 bis.

ET LE MODULE NE POSTE RIEN. L'estimation est rendue avec ses termes, son
fondement et la suite à donner ; la ventilation de la valeur brute entre la
structure et le composant reconstitué est une décision du cabinet, et le texte
n'écrit qu'une possibilité (« peut être estimée »). L'estimation est refusée
sur un bien qui porte DÉJÀ un composant « révisions majeures » : là, la valeur
nette se lit, elle ne s'estime pas.

Ce qui rend l'opération nécessaire est rappelé à chaque estimation, parce que
c'est de là que vient la demande : « Aucune provision pour dépenses de grosses
réparations ou gros entretien à engager dans le cadre d'un programme
pluriannuel de révision ne peut être comptabilisée. Tel est le cas également
des provisions pour grosses réparations » (ch. 5 § 1, et ch. 18 § 4.11.2 que le
registre des provisions oppose déjà). La voie est le composant, ou la charge de
l'exercice · jamais la provision.


**Amortissement aux unités d'œuvre · le mode que l'AUDCIF nomme et qu'aucun
livre ne peut nourrir.** L'art. 45 le pose parmi les modes admis : « le mode
des unités de production / unités d'œuvre (nombre de pièces, heures de
fonctionnement, kilomètres, heures de travail…) : charge basée sur
l'utilisation ou la production prévue ». Il n'est PAS exclu par le SYCEBNL ·
son art. 3 écarte les articles 5, 8, 10 à 13, 17 al. 7 et 8, 18, 19 4e tiret,
21, 25 à 34, 49, 69, 70, 71 et 73 à 113, et l'art. 45 n'y figure pas. Le mode
vaut donc des deux côtés. Le glossaire donne la formule et rien de plus :
« AD = base amortissable × (nombre d'unités d'œuvre consommées) / (total
d'unités d'œuvre prévues) », le total prévu étant « déterminé en fonction de la
durée d'utilité de l'immobilisation ».

DEUX PIÈGES, ET LE PREMIER EST SILENCIEUX. AUCUN PRORATA TEMPORIS NE S'AJOUTE
AU RAPPORT · le rapport porte DÉJÀ la période, puisque les unités consommées
sont celles de l'exercice et non celles d'une année pleine. Proratiser
par-dessus amputerait la première annuité une seconde fois : un camion mis en
service en octobre qui a roulé 9 000 km a bien roulé 9 000 km, pas 9 000 × 3/12.
Un test fige la différence en calculant le même bien dans les deux modes. Et la
durée en années ne divise plus rien · elle n'a servi qu'à ÉTABLIR le total
prévu.

LE SECOND PIÈGE EST DE PRINCIPE : LES UNITÉS NE SONT DANS AUCUN LIVRE. Une
durée se déduit d'une date ; des kilomètres ne se déduisent de rien. Aucun
journal, aucune balance, aucun compte ne porte le compteur d'une machine. Le
module REFUSE donc de doter tant que le relevé n'a pas été saisi · supposer
zéro ferait passer un exercice sans relevé pour un exercice sans usage, et
supposer une année pleine inventerait un relevé. Chaque relevé porte sa SOURCE
(compteur, carnet de bord, fiche de production), exigée parce que c'est elle
que le réviseur demandera, pas le nombre. Le tableau des amortissements, lui,
ne réclame rien : il lit ce qui a été saisi et affiche zéro à défaut, l'état
disant la vérité de l'état.

APRÈS UNE DÉPRÉCIATION, LE PLAN SE RÉ-ÉTALE EN UNITÉS, exactement comme le
linéaire se ré-étale en années (Titre VIII ch. 12 § 2.4.1) : la valeur
comptable révisée se répartit sur ce qui RESTE à courir, et ce qui reste à
courir se compte ici en unités, pas en années. Le reliquat reste la seule
borne · un bien totalement amorti ne dote plus, quel que soit le nombre de
kilomètres qu'il fasse encore.

L'ÉCART AVEC LE BARÈME FISCAL EST STRUCTUREL et il est assumé. L'arrêté
n° 013/2025 ne connaît que des DURÉES et des TAUX (art. 2) ; un bien amorti aux
unités d'œuvre s'écarte nécessairement du taux linéaire de sa famille. L'art. 4
du même arrêté admet des taux dérogatoires « justifiés au contrôle », la charge
de la preuve reposant sur l'entité · c'est pour cela que chaque relevé porte sa
source, et non par formalisme.

ET DEUX MODES NE DOIVENT JAMAIS ENTRER DANS L'ÉNUMÉRATION. L'art. 45 les
interdit nommément : « un mode d'amortissement basé sur les REVENUS générés par
l'utilisation de l'actif est interdit pour les immobilisations corporelles. De
même, l'amortissement FINANCIER · amortir une immobilisation au même rythme que
le coût de son financement · n'est pas autorisé. » Un test relit
`schema.prisma` et fige la liste à LINEAIRE et UNITES_DOEUVRE.


**Stocks et production immobilisée · les deux griefs du CPCC, dans la seule
forme qui ait une signature.** Le § 8.2 du séminaire nomme deux minorations
« par absence d'une écriture de contrepartie » : la facture d'achat enregistrée
sans constatation du stock en cours de route, et la production immobilisée
jamais activée au compte 72. Les deux sont réelles.

ET AUCUNE DES DEUX N'EST DÉTECTABLE SOUS CETTE FORME · elles se définissent par
ce qui MANQUE. « Solde du 72 égal à zéro » se vérifie chez toute entité qui
achète au lieu de produire, c'est-à-dire chez la quasi-totalité des dossiers.
Un contrôle qui s'allume partout n'apprend rien à personne : il apprend
seulement à être ignoré, et il emporte les vrais signalements avec lui. Un test
fige cette abstention plutôt que de la laisser à la mémoire de qui relira.

CE QUI EST CODÉ EST L'AUTRE MOITIÉ · non pas l'absence du compte, mais sa
PRÉSENCE SANS SA CONTREPARTIE. Quatre contrôles, et à chaque fois le dossier a
écrit quelque chose qui ne boucle pas. STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION ·
le compte a bougé, aucun 603 ne l'a suivi, alors que les deux plans lui donnent
la même contrepartie dans les deux systèmes d'inventaire (« débité par le
crédit des sous-comptes 603 concernés »).
PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION · le 72 est crédité, aucun 21, 23 ou
24 n'a été débité, alors que les deux plans écrivent la même phrase (« crédité
[…] PAR LE DÉBIT du compte 21, du compte 23 ou 24 »).
DEPRECIATION_STOCK_SANS_STOCK · une dépréciation créditrice dont le poste
adossé est à zéro n'est pas une déduction, c'est un actif négatif, et le total
du bilan est minoré sans qu'aucune ligne ne le dise.
DEPRECIATION_STOCK_HORS_NOMENCLATURE · une subdivision du 39 que le plan
n'ouvre pas.

LE PÉRIMÈTRE N'EST PAS LE MÊME DES DEUX CÔTÉS, et c'est la cinquième fois que
ce piège se présente après le 192, le 4181, le 1061/1062 et le 38/37 : UN
NUMÉRO, DEUX SENS. Le stock en cours de route est au 38 en SYSCOHADA et au 37
en SYCEBNL, et le numéro libéré porte autre chose dans chaque plan · le 37 du
SYSCOHADA est « produits intermédiaires et résiduels », le 38 du SYCEBNL est
« DONS EN NATURE H.A.O. ». Signaler « le 38 » sans regarder le référentiel
accuserait une association d'avoir mal comptabilisé ses dons. Côté
dépréciations, l'AUDCIF ouvre huit subdivisions au 39 (391 à 398) et le SYCEBNL
cinq (391, 392, 393, 396, 397) · il n'a ni 394 « produits en cours », ni 395
« services en cours », ni 398, son 396 couvrant à lui seul « produits finis,
produits intermédiaires et résiduels ».

UNE SEULE RÈGLE TRAVERSE LA DIFFÉRENCE INTACTE · 39X déprécie 3X, dans les deux
plans. Elle la traverse SANS ÊTRE ÉPARGNÉE par le piège : le 397 déprécie les
produits intermédiaires au SYSCOHADA et les stocks en cours de route au
SYCEBNL. Le rapprochement 397 → 37 reste juste des deux côtés ; c'est
l'INTITULÉ qui change, et lui n'est jamais écrit en dur.

Un rappel du corpus, à connaître avant d'aller plus loin sur ce cycle : les
deux plans imposent d'inscrire en Notes annexes « le détail par catégorie des
stocks figurant au bilan » dans ce compte, mais la Note 8 des associations
SYCEBNL ne porte pas la rubrique « stocks en cours de route ». L'obligation est
écrite, le support ne l'est pas · ne pas construire de contrôle là-dessus sans
avoir tranché ce point.

**Variation de stocks · le trou qui faussait un compte de résultat, et les DOUZE
numéros qui le gardaient.** Le compte de résultat des deux référentiels porte
des lignes de variation de stocks · au SYSCOHADA les postes RB, RD et RF, lus
sur les 6031, 6032 et 6033, plus la ligne du 73 en produits. Ces comptes étaient
semés, mouvementables à la main, et RIEN ne les produisait. Un dossier qui tient
des stocks sortait donc une liasse dont les lignes de variation valaient zéro :
le résultat était faux du montant de la variation, la balance bouclait, et seul
le dépôt le révélait. C'était le dernier trou de cette nature dans le produit.

LE CYCLE DES STOCKS EST LA PLUS GRANDE OCCURRENCE DU PREMIER PIÈGE DU DÉPÔT, et
elle dépasse de loin les précédentes : le 192, le 4181, le 1061, le 38/37, le
397, le 70510000, le 601, les deux articles 11, les trois « trois exercices »,
le 7041, les deux textes n° 23/10 n'en portaient qu'UNE à la fois. Ici, sur les
quatorze numéros du cycle, **DOUZE** changent de sens entre les deux plans ou
n'existent que d'un côté. Le 31 est « Marchandises » au SYSCOHADA et « Biens
liés à l'activité » au SYCEBNL. Le 34 est « Produits en cours » d'un côté et
« Dons en nature » de l'autre. Le 37 et le 38 sont échangés. Et les comptes de
VARIATION suivent : le 6031 est la variation des marchandises au SYSCOHADA, celle
des biens liés à l'activité au SYCEBNL · le 6032 est les matières premières d'un
côté, les marchandises de l'autre. Une seule table servie pour les deux
publierait, au poste des marchandises d'une société, la variation d'un stock
qu'elle n'a pas. D'où la règle : **aucun numéro de compte de stock ou de
variation n'est écrit ailleurs que dans `stocks/nomenclature-stocks.ts`, et
aucun n'y est écrit sans son référentiel.**

UN COMPTE DE VARIATION DOIT ÊTRE IMPUTABLE, ET LE VÉRIFIER A TROUVÉ L'ERREUR. La
première table renvoyait le 34 vers le 734 et le 35 vers le 735. Les deux numéros
existent, les deux portent le bon intitulé, et les deux sont des EN-TÊTES DE
DIVISION · le Titre VII n'ouvre sous eux que 7341, 7342, 7351 et 7352. Un compte
TOTAL ne reçoit jamais d'écriture (§ 7) : la proposition aurait été refusée à la
saisie, APRÈS que le comptable a tout chiffré. Vérifier que le numéro « existe au
plan » ne suffisait pas, il existe. Ce qui distingue un compte d'imputation d'un
en-tête est sa forme SEMÉE, complétée à huit chiffres · c'est cette forme que le
test exige, et rien d'autre.

QUATRE ANOMALIES DU PLAN OFFICIEL, SIGNALÉES ET NON COMBLÉES. Le compte 34 ouvre
343, 344 et 345, le compte 37 ouvre 373, et le compte 73 n'ouvre AUCUN compte de
variation imputable pour ces quatre subdivisions. Les rattacher au 7341 ou au
7371 leur prêterait une nature qu'elles n'ont pas. Elles sont donc nommées hors
de la variation automatique, avec leur motif, et l'écriture se passe à la main.

LA FORME EST BRUTE, PAS NETTE. Les deux textes admettent les deux (« du montant
du stock final OU du montant de l'augmentation de l'exercice »), et le mot
« POUR SOLDE » tranche : le compte de stock doit être VIDÉ de son stock initial,
que la forme nette laisserait en place. Le journal garde aussi la trace des deux
mouvements, qu'un stock entièrement renouvelé ferait disparaître sous une
variation nette de zéro.

TROIS REFUS ET UN AVERTISSEMENT. « Pas encore compté » n'est PAS zéro · lu comme
zéro, le stock entier partirait en charge sur une écriture équilibrée, même refus
que le rapprochement d'inventaire sur une fiche non valorisée. Un stock final
NÉGATIF est refusé, un stock étant un actif qui se compte en quantités détenues.
Un montant SANS SA SOURCE est refusé, parce que c'est le document d'inventaire
extra-comptable que le réviseur demandera, pas le chiffre · même parti que la
source d'un relevé d'unités d'œuvre. Et un solde CRÉDITEUR sur un compte de stock
est signalé sans être refusé : aucun texte lu ne le traite, la variation reste
calculable, et le taire figerait une imputation fautive dans les états. Un refus
n'emporte jamais les autres comptes · un dossier à dix stocks dont un seul n'est
pas compté doit voir les neuf autres.

ET LE MODULE NE POSTE RIEN. Il PROPOSE, le comptable passe · le stock final vient
d'un inventaire EXTRA-COMPTABLE qu'aucun livre ne porte, et le déduire serait
l'inventer.

**Valorisation des biens fongibles · trois méthodes sur cinq, et celle que les
logiciels implémentent par défaut n'en fait pas partie.** Le chapitre des
comptes abrège : « les biens interchangeables […] sont évalués soit selon la
technique du COÛT MOYEN PONDÉRÉ (C.M.P.), soit selon la méthode du PREMIER
ENTRÉ PREMIER SORTI (P.E.P.S.) ». Pris au mot, cela autoriserait n'importe
quelle moyenne. Le glossaire (AUDCIF Titre VI, « VALORISATION DES BIENS
FONGIBLES ») en décide autrement et c'est lui qui tranche · il énumère CINQ
méthodes (coût moyen pondéré ANNUEL, C.M.P.A.C.E., coût moyen de PÉRIODE DE
STOCKAGE, P.E.P.S., D.E.P.S.) puis : « Parmi ces cinq méthodes, le SYSTÈME
COMPTABLE OHADA EN ACCEPTE TROIS ; celle qui est retenue doit être MENTIONNÉE
DANS LES NOTES ANNEXES : P.E.P.S. ; C.M.P.A.C.E. ; C.M.P. de période de
stockage. »

**LE COÛT MOYEN PONDÉRÉ ANNUEL EST EXCLU**, et c'est la forme la plus répandue
dans les logiciels de la place. Le coder aurait rendu un stock final plausible,
une balance qui boucle, et une méthode que le référentiel n'accepte pas · sans
qu'aucun test ne puisse le dire, l'arithmétique en étant juste. Le D.E.P.S.
(L.I.F.O.) est exclu de la même liste, et le N.I.F.O. ou coût de remplacement
est déclaré « INACCEPTABLE en comptabilité générale, car [il] n'assure pas le
raccordement entre les valeurs des sorties et celles des entrées ». Un test gèle
la liste à trois valeurs.

LE MÊME PARAGRAPHE APPARIE LES MÉTHODES AU MODE DE TENUE, et ce n'est pas
théorique : « cette dernière méthode est compatible avec la pratique de
l'inventaire INTERMITTENT, alors que les deux autres reposent sur celle de
l'inventaire PERMANENT ». Le P.E.P.S. et le C.M.P.A.C.E. valorisent CHAQUE
SORTIE, ce qu'un inventaire intermittent ne connaît pas ; le coût moyen de
période de stockage valorise le STOCK FINAL, ce qui ne dit rien des sorties.

L'AXIOME QUI FONDE LES TROIS, et qui est devenu un test : « l'axiomatique
comptable impose une égalité systématique, dans tout compte, des sorties et des
entrées EN VALEURS, dès lors que toutes les unités entrées sont sorties ». D'où
le refus central du moteur · UNE SORTIE NE PORTE JAMAIS SON COÛT, elle le
calcule. Un coût imposé à la main rompt le raccordement, et le stock cesse
d'être la différence de ce qui est entré et de ce qui est sorti.

ET LA DERNIÈRE SORTIE PREND LA VALEUR RESTANTE, pas un dernier produit quantité
× coût moyen · sinon un résidu d'arrondi reste au magasin, c'est-à-dire une
valeur non nulle sur une quantité nulle, qui se lit « stock de -0,00 » sur un
état. LE TEST QUI LE GÈLE A DÛ ÊTRE CHERCHÉ : le flottant ramène 3 × (100/3) à
exactement 100, si bien qu'un cas « qui ne tombe pas juste » choisi d'intuition
ne prouvait rien · la réinjection l'a dit, deux fois. 29 pour 7 unités, lui,
rend 29.000000000000004. *Un test qui n'a pas été VU ÉCHOUER ne protège rien, et
un jeu d'essai se cherche quand il doit porter une propriété numérique.*

CE QUE LE MODULE NE CALCULE PAS, ET LE DIT · le coût moyen de PÉRIODE DE
STOCKAGE. Sa définition suppose une donnée qu'OmegaX ne tient pas (« on calcule
la DATE D'ENTRÉE MOYENNE du stock existant en fin d'exercice »), et elle
concerne un dossier qui, tenant un inventaire intermittent, ne saisit aucune
entrée. Inventer une pondération rendrait un chiffre plausible et hors du texte.

**Mode de tenue des stocks · le champ SANS valeur par défaut, et les deux états
qui ne sont pas des erreurs.** `Tenant.methodeInventaireStocks` enregistre ce
que l'entité a choisi, et les deux textes lui laissent le choix dans les mêmes
mots · « la comptabilisation des stocks repose sur la tenue SOIT d'un inventaire
PERMANENT, SOIT d'un inventaire INTERMITTENT ». Aucun défaut n'est posé, et
c'est la décision centrale du chantier : présumer l'INTERMITTENT ferait proposer
une écriture de variation à un dossier qui tient le permanent, où chaque entrée
et chaque sortie sont DÉJÀ passées par le compte de variation · la variation
serait comptée deux fois, sur une écriture équilibrée. Présumer le PERMANENT
priverait de la proposition le dossier qui en a le plus besoin.

D'où trois états rendus par la fenêtre, et deux ne sont pas des erreurs. Méthode
non déclarée · la réserve dit quoi faire et cite les deux textes. Inventaire
PERMANENT · la réserve dit qu'il n'y a RIEN à passer ici et renvoie au
rapprochement de l'inventaire physique. Inventaire INTERMITTENT · la proposition
chiffrée. Une liste vide, dans les deux premiers cas, se lirait comme « rien à
faire ».

L'ENREGISTREMENT NE FAIT PAS CONFIANCE AU CLIENT · il REJOUE le calcul à partir
du dossier et ne poste que ce que sa propre proposition contient, même
discipline que la confirmation d'un pré-lettrage. Le stock final vient d'une
CAMPAGNE D'INVENTAIRE quand elle existe, et la source nomme la campagne et sa
date. Plusieurs fiches sur un même compte s'additionnent ; une SEULE fiche non
valorisée rend le compte entier « pas encore compté », parce que la lire comme
zéro minorerait le stock final de ce qu'on n'a pas su chiffrer.

LES COMPTES VIENNENT DU PLAN, PAS DE LA BALANCE. Un stock ouvert cette année n'a
aucun mouvement avant l'écriture de variation : la balance ne rend que les
comptes mouvementés et l'écarterait, alors que c'est précisément celui dont il
faut constater le stock final.

ET LA FENÊTRE A CHANGÉ DE MENU PARCE QU'UN TEST L'A REFUSÉE, pour la DEUXIÈME
fois. Posée d'abord sous « État > Contrôle et révision », à côté de l'inventaire
physique dont elle découle, elle faisait tomber le plafond de
`chrome-etroit.spec.ts`. Le refus avait raison sur le FOND : les registres de ce
groupe sont ce que le CABINET produit en révisant, alors que la variation de
stocks PASSE UNE ÉCRITURE au livre-journal, exactement comme la régularisation
et l'affectation du résultat, qui vivent toutes deux sous « Traitement ». Un
plafond qui fait relire la place d'une fenêtre au lieu de se faire relever d'un
cran est un plafond qui a servi.


**Notes de cours sur les stocks · un témoin, jamais une source, et le bout du
cycle qui diverge quand même.** Un livre de comptabilité générale (chapitre 10,
section 10.1, lu le 2026-09-19) a été dépouillé et confronté au dépôt · journal
complet dans `docs/stocks-notes-de-cours.md`. Il CONFIRME les trois méthodes de
valorisation, leur appariement au mode de tenue, la forme de la fiche par
couches et les écritures de variation dans les deux inventaires. **Il ne lève
aucun refus**, et notamment pas celui du coût moyen de période de stockage : il
en propose une route calculable (rotation, puis durée moyenne d'écoulement, puis
coût moyen des entrées des derniers jours) qui n'est PAS la définition du
glossaire, laquelle demande « la DATE D'ENTRÉE MOYENNE du stock existant en fin
d'exercice ». Une note de cours commente le texte, elle ne le promulgue pas ·
c'est la règle n°1 appliquée à un document qui a l'air d'une source.

CE QU'IL APPORTE EST LE CYCLE DES EMBALLAGES, que le dépôt ne portait pas :
matériel d'emballage (243, immobilisation) contre emballages commerciaux (335,
stock) · perdus, récupérables non identifiables, à usage mixte · et la
CONSIGNATION, seule particularité du cycle, tenue en miroir par une créance
(4094) chez le client et une dette (4194) chez le fournisseur, avec trois
dénouements qui ne se comptabilisent pas pareil (retour, conservation, et
déconsignation sous le prix de consignation).

ET LA CONFRONTATION AU PLAN SEMÉ A RENVERSÉ L'ATTENTE. Le cycle des stocks est
la plus grande occurrence du premier piège du dépôt (douze numéros sur
quatorze) ; les emballages sont **le premier cycle où l'essentiel de la
nomenclature COÏNCIDE** · les 3351 à 3358, les 6081 à 6089, le 6224, le 6225, le
4094, le 4194, le 24300000, le 28430000 et le 29430000 portent le même numéro et
le même intitulé dans les deux semis. **LA DIVERGENCE EST AU BOUT PRODUIT, ET
C'EST LÀ QUE LE CYCLE SE DÉNOUE** : le SYSCOHADA ouvre `70710000` « Ports,
emballages perdus et autres frais facturés » et `70740000` « Bonis sur reprises
et cessions d'emballages », quand le SYCEBNL ne subdivise pas son 707 du tout et
n'ouvre qu'un `70700000` « Produits accessoires ». Servir l'écriture de
déconsignation sans regarder le référentiel enverrait une association sur un
compte qui n'existe pas dans son plan, et l'écriture serait refusée à la saisie
APRÈS que tout a été chiffré · exactement le défaut du 734 et du 735. Pire
encore pour le `6588` « Emballages à rendre perdus » que le livre donne : le
numéro EXISTE au SYSCOHADA sous un TOUT AUTRE intitulé, « Autres charges
diverses », et n'existe pas au SYCEBNL. Dix-huitième occurrence de « un numéro,
deux sens ». **Aucun numéro d'emballage ne s'écrira donc ailleurs que dans une
table nommée, et aucun sans son référentiel**, comme pour la variation de
stocks.

TROIS PISTES NOTÉES ET NON CODÉES, parce qu'aucune n'a encore été lue au texte
officiel : le sous-compte **388 « Stocks provenant d'immobilisations mises hors
service ou au rebut »**, qui relie le cycle des stocks à la sortie
d'immobilisation et que le dépôt ne traite nulle part ; les fiches des comptes
33, 40, 41, 60, 62 et 70 des deux textes, à lire avant toute ligne sur les
emballages ; et la route du coût moyen de période de stockage ci-dessus. Le
livre porte en outre huit coquilles relevées (un trimestre habillé en mois, une
unité qui change en cours d'énoncé, une écriture qui ne s'équilibre pas de
1 000 000), toutes signalées dans le journal et aucune reprise.


**Le magasin et le BONI / MALI D'INVENTAIRE · un écart de QUANTITÉ, qui SE
COMPTABILISE, et dont les deux textes désignent la contrepartie.**
`ArticleStock` et `MouvementStock` portent l'inventaire PERMANENT que le module
ne servait pas, fiche par article, avec les trois blocs de la fiche (entrées,
sorties, stock) et la vérification en DEUX dimensions.

LES DEUX TEXTES NOMMENT L'OPÉRATION, ET C'EST LA DÉCOUVERTE DU CHANTIER. AUDCIF
Titre VII, compte 603 · le compte enregistre « les DIFFÉRENCES CONSTATÉES ENTRE
L'INVENTAIRE COMPTABLE PERMANENT ET L'INVENTAIRE PHYSIQUE », puis « à la
clôture, DÉBITÉ des différences en MOINS […] par le crédit des stocks
concernés » et « CRÉDITÉ des différences en PLUS […] par le débit des comptes de
stocks ». Le SYCEBNL emploie les mots eux-mêmes, fiches des comptes 31 à 36 ·
« en cas d'existence d'un BONI D'INVENTAIRE […] par le crédit du compte 6031 »,
« en cas d'existence d'un MALI D'INVENTAIRE […] par le débit du compte 6031 ».

**L'ART. 43 NE S'OPPOSE PAS AU BONI**, et c'est la distinction centrale.
L'article oppose deux VALEURS du MÊME bien et interdit d'inscrire une plus-value
latente ; un boni d'inventaire est autre chose, des UNITÉS existent que les
livres n'avaient pas, et les porter à leur coût d'entrée ne fabrique aucune
plus-value. C'est la même distinction VALEUR / QUANTITÉ que le dépôt avait déjà
tranchée sur la caisse le 06/09, à cette différence près qu'ici les textes
DISENT quoi faire, là où aucune source ne le dit pour un écart de caisse.

TROIS BORNES. Le boni et le mali n'existent QU'EN INVENTAIRE PERMANENT · les
deux textes le bornent dans la phrase qui le pose, et en intermittent il n'y a
aucun inventaire comptable à confronter : le comptage EST le stock final et il
entre par l'écriture de variation. « Pas encore compté » n'est pas zéro · lu
comme zéro il produirait un mali égal à tout le stock de l'article, à la charge
de l'entité. Et une fiche qui ne se valorise pas ne se chiffre pas.

LE MALI ET LE BONI NE SE VALORISENT PAS PAREIL, ET CE N'EST PAS UNE COQUETTERIE.
Un MALI est une SORTIE : la méthode le valorise, et le moteur rejoue la fiche
avec une sortie de plus · en P.E.P.S. elle consomme les couches les plus
anciennes, en C.M.P.A.C.E. elle prend le coût moyen en vigueur. Un BONI est une
ENTRÉE, et là les deux méthodes divergent · en C.M.P.A.C.E. le magasin ne
détient qu'UNE seule valeur unitaire à cette date, et la retenir n'est pas un
choix de l'éditeur mais l'arithmétique de la méthode ; en P.E.P.S. il détient
plusieurs couches et **AUCUNE SOURCE LUE NE DIT À LAQUELLE RATTACHER des unités
dont les livres ignoraient l'existence** · le P.E.P.S. règle l'ordre des
SORTIES, pas l'entrée d'un boni. Le coût est donc RÉCLAMÉ avec sa source, comme
le stock final d'une variation ou le relevé d'unités d'œuvre. Retenir « la
couche la plus récente » aurait été plausible et inventé.

LE JEU D'ESSAI A DÛ ÊTRE CHERCHÉ, POUR LA DEUXIÈME FOIS SUR CE MODULE. Le
premier sortait 150 unités sur 300 : le P.E.P.S. vidait alors entièrement la
couche la plus ancienne, le magasin n'en gardait qu'une, et le coût P.E.P.S. du
mali coïncidait avec le coût moyen. Le défaut « valoriser le mali à la moyenne
du magasin » passait donc inaperçu, et seule la réinjection l'a dit. Il faut que
le magasin garde DEUX couches à des coûts différents · sept défauts réinjectés,
sept détectés.

**ET L'AUDIT DE COHÉRENCE A TROUVÉ UNE LACUNE DÉCLARÉE À TORT DANS LE MODULE
D'INVENTAIRE PHYSIQUE.** Il écrivait sur TOUT compte que « le référentiel
n'impose aucune contrepartie » à un manquant, et refusait TOUT excédent au nom
de l'art. 43. Les deux phrases sont vraies d'une caisse, d'une immobilisation,
d'un tiers. Elles sont FAUSSES d'un compte de classe 3 tenu en inventaire
permanent. Le coût est celui du § 10 bis dans sa forme la plus discrète · un
cabinet qui suivait la note imputait le manquant en charge diverse, l'écriture
s'équilibrait, la balance bouclait, et la ligne « Variation des stocks » du
compte de résultat restait fausse du montant de l'écart, sous une nature de
charge qui n'est pas la bonne. `noteContrepartieManquant()` et
`motifRefusExcedent()` prennent désormais le MODE DE TENUE, et nomment les DEUX
voies que le texte ouvre sur un stock · la variation pour une différence de
QUANTITÉ, la dépréciation (39) pour une baisse de VALEUR à quantité égale. Le
module ne tranche pas entre elles · la qualification appartient à la
sous-commission, et c'est elle qui décide de l'écriture.

**LA VÉRIFICATION DE DÉRIVE DES MIGRATIONS A TOURNÉ POUR LA PREMIÈRE FOIS**, et
elle a trouvé quelque chose. Le contrôle que le § « Migrations écrites à la
main » réclame depuis le 03/09 n'avait jamais pu être exécuté faute de base
jetable ; un PostgreSQL local en tient désormais lieu. Il a rendu une dérive
RÉELLE, et de la famille exacte que ce § décrit : la migration du 14/09 posait
`ON DELETE RESTRICT` sur `immobilisationPrincipaleId` et `composantRemplaceId`,
le schéma le taisait, et Prisma pose `SET NULL` par défaut sur une relation
FACULTATIVE. Supprimer un principal aurait dénoué le lien SANS ERREUR ·
l'ascenseur serait resté au bilan, amorti sur son plan propre, sans l'immeuble
auquel il se rapporte ; et sur `composantRemplaceId`, la trace du renouvellement
aurait disparu, laissant les deux composants au bilan sans que rien ne dise que
le second a remplacé le premier, c'est-à-dire exactement le défaut que
l'opération `renouveler` existe pour empêcher. Même correction qu'au 03/09 · la
règle voulue est DÉCLARÉE dans le schéma, on n'aligne jamais la SQL sur un
défaut qu'on ne voulait pas. Le dépôt ne porte plus aucune dérive.

**ET DEUX GARDE-FOUS ONT SERVI SANS QU'ON LES SOLLICITE.** Le décompte en dur de
`lecture-bornee.spec.ts` est tombé sur les deux tables nouvelles, ce pour quoi
il existe · il a obligé à décider par quelle borne elles se lisent avant
qu'elles n'entrent dans l'archive de restitution. Et les commentaires du même
fichier annonçaient « 55 tables » quand il y en avait 76 : un décompte périmé
dans un commentaire se lit comme une garantie, il est retiré, et le seul chiffre
en dur reste celui du test, dont la fonction est de TOMBER.

UN MOUVEMENT DE MAGASIN RETIENT SON ÉCRITURE · ajouté à la liste de
`verifierAucunModuleNeLaTient`. Sur une relation facultative, Prisma dénoue en
silence : la fiche afficherait alors « sans écriture » sur un mouvement qui en
avait une, la fiche et le compte divergeraient, et l'écart remonterait à la
clôture sous la forme d'un MALI D'INVENTAIRE QUI N'EXISTE PAS, mis à la charge
de l'entité sur une balance qui boucle.


**Les EMBALLAGES et leur CONSIGNATION · le premier cycle où les deux plans
coïncident, sauf au bout qui le dénoue.** « Les comptes relatifs aux emballages
fonctionnent de la même manière que ceux relatifs aux marchandises et matières.
La seule particularité concerne la CONSIGNATION. » Les deux textes la décrivent
en miroir, aux fiches de leurs comptes 40 et 41.

DIX-HUITIÈME OCCURRENCE DE « UN NUMÉRO, DEUX SENS », ET ELLE EST AU BOUT
PRODUIT. Sur les huit rôles du cycle, SEPT portent le même numéro et le même
intitulé dans les deux plans · 4094, 4194, 6082, 6224, 243, 822, 812, plus les
3351 à 3358 et les 6081 à 6089. C'est le premier cycle du dépôt où la
nomenclature se recouvre à ce point, et l'attente était l'inverse. **LE HUITIÈME
DIVERGE, ET C'EST CELUI PAR LEQUEL LE CYCLE SE DÉNOUE** : les deux fiches du
compte 41 écrivent la même règle avec une PROFONDEUR différente. L'AUDCIF dit
« le crédit du compte 7074 (bonis sur cession d'emballages) » ; le SYCEBNL dit
« le crédit du compte 707 PRODUITS ACCESSOIRES », et il n'ouvre aucune
subdivision sous son 707, quand celui de l'AUDCIF est un EN-TÊTE DE DIVISION
semé en TOTAL. Servir 7074 à une association l'enverrait sur un compte que son
plan n'ouvre pas ; servir 707 à une société l'enverrait sur un en-tête, refusé à
la saisie APRÈS que tout a été chiffré · le défaut du 734 et du 735, à
l'identique. Un test relit la table et exige que le seul rôle divergent soit
celui-là.

DEUX NUMÉROS QUE LES FICHES ÉCRIVENT EN TÊTE DE DIVISION, ET QUE LE MODULE
DESCEND D'UN CRAN EN LE DISANT. Les deux fiches écrivent « le compte 24 » et
« le compte 82 » ; les deux sont des TOTAUX dans les deux plans. Le module
propose le 243 et le 822, qui sont les subdivisions que l'objet consigné
appelle, et porte la réserve sur la ligne plutôt que de laisser croire que c'est
le mot du texte.

**LE REFUS CENTRAL VIENT DE CE QUE LA FICHE NE DIT PAS.** Côté fournisseur, la
conservation d'un MATÉRIEL est routée vers le compte 82, « produits des cessions
d'immobilisations ». C'est une CESSION, et une cession ne se résume pas à son
produit : la valeur comptable nette sort au 81 et l'immobilisation est
décomptabilisée. La fiche du compte 41 décrit le sort du 4194, PAS celui du
bien. Poster ici « 4194 à 822 » seul laisserait le matériel AU BILAN pendant que
son prix de cession est enregistré · l'écriture s'équilibre, la balance boucle,
et l'actif comme le résultat sont surévalués de la valeur nette du bien. Le
module REFUSE et renvoie au module des immobilisations, qui tient le plan
d'amortissement et la dépréciation. C'est le même défaut que celui que la sortie
d'immobilisation existe déjà pour empêcher.

AUCUNE LIGNE DE TVA, ET L'ABSTENTION EST MOTIVÉE. Les deux fiches décrivent
l'écriture ligne à ligne et ne mentionnent AUCUNE taxe, ni à la consignation ni
à son dénouement ; le régime de TVA d'une consignation n'est tranché nulle part
dans le corpus lu. Le livre de cours, lui, en portait · c'est précisément
pourquoi il n'est pas une source. En poser une d'office ferait collecter ou
déduire une taxe que personne n'a décidée, et la déclaration partirait avec.

ET LE « 6588 Emballages à rendre perdus » DU LIVRE N'EST REPRIS NULLE PART. Le
6588 du SYSCOHADA est « Autres charges diverses » et le SYCEBNL n'a qu'un 658
sans subdivision. Un emballage perdu y serait comptabilisé sans qu'aucune
balance ne cesse de boucler, et la Note annexe publierait « Autres charges
diverses ». Un test gèle l'absence du numéro ET la PRÉSENCE de la raison ·
on gèle une présence, jamais une absence de mot.

POURQUOI UNE TABLE `Consignation` ET PAS DE SIMPLES MODÈLES D'ÉCRITURE. Le 4094
et le 4194 sont des comptes d'ATTENTE : tant que la consignation n'est pas
dénouée, on ne sait pas si elle s'éteindra par un retour, par une vente ou par
un écart. Un 4194 laissé en l'état à la clôture est une dette envers un client
qui, peut-être, ne rendra jamais l'emballage · le bilan est faux du montant des
consignations non qualifiées, et la balance boucle quand même. L'écran rend donc
le total en attente, et **les deux sens ne s'additionnent JAMAIS** : une dette
de consignation et une créance de consignation sont de sens opposés au bilan,
leur somme ne veut rien dire.


**Paie P0 · la lecture avant le code, et le dix-neuvième « un numéro, deux
sens ».** Passe de lecture du 2026-09-19, rien de codé. Journal complet dans
`docs/paie-p0-inventaire.md`.

ELLE A COMMENCÉ PAR CORRIGER LE PLAN QUI L'ANNONÇAIT. Trois affirmations
étaient fausses : l'INPP n'est pas absent (le dépôt le porte avec ses quatre
tranches d'effectif), il n'existe aucun plafond d'assiette CNSS mais un
PLANCHER au SMIG (décret n° 18/041, art. 8), et la moitié déclarative de la
paie est déjà construite dans le registre des retenues.

**LE DIX-NEUVIÈME PIÈGE PORTE LA LIGNE LA PLUS LOURDE DU BULLETIN.** La
cotisation de retraite obligatoire, 10 % de la masse salariale, est au **4313**
au SYSCOHADA (sous 431 Sécurité sociale) et au **4321** au SYCEBNL, dont le 431
n'ouvre AUCUN 4313. Et la correction évidente est elle-même un piège : au
SYCEBNL le 432 est « Caisses de retraite » avec 4321 obligatoire, quand au
SYSCOHADA le 432 est la retraite **COMPLÉMENTAIRE**. Corriger 4313 en 432
rangerait donc la cotisation obligatoire sous une nature facultative dans un
plan sur deux. **Aucun numéro de compte de paie ne s'écrira ailleurs que dans
une table nommée, et aucun sans son référentiel** · troisième fois que la règle
se pose, après les stocks et les emballages.

**DEUX ASSIETTES, JAMAIS UNE.** L'arrêté n° 146/2018, art. 17, exclut de
l'assiette sociale le logement et son indemnité, le transport, les allocations
familiales légales, les soins de santé et les frais de voyage · l'assiette
fiscale, elle, les porte. Un bulletin qui n'en tiendrait qu'une serait faux
sans que rien ne le dise.

**LE BARÈME IRPP PORTE UNE TENSION QUE LE TEXTE NE TRANCHE PAS** · taux
marginal de 40 % et plafond de l'impôt total à 30 % du revenu imposable
(art. 118). Le plafond finit toujours par mordre. Le coder sans le plafond
donne un impôt faux sur les hauts salaires, sur un bulletin d'apparence juste.
Double arrondi : assiette au millier inférieur, puis impôt selon l'art. 150.

**LE MEILLEUR DOCUMENT DE MÉTHODE DU CORPUS EST LE PLUS DATÉ.** Le séminaire
CPCC sur le décompte final donne la seule méthode complète (préavis, congé,
gratification, prorata sur 312), et quatre de ses éléments sont périmés ou
faux : l'IPR à 10 % (abrogé au 1er janvier 2026), l'ONEM à 0,2 % (0,5 % depuis
le 25/09/2025), une retenue « Syndicat 2 % » qu'aucun article ne fonde (l'art.
112 FERME la liste des retenues autorisées et ne la nomme pas), et surtout
**« C/ 4331 INPP · C/ 4332 ONEM », faux dans les DEUX plans** où le 4331 est
« Mutuelle » et le 4332 « Assurances retraite ». Un cabinet qui suivrait ce
schéma porterait l'INPP à la mutuelle sur une balance qui boucle. Le fichier
porte lui-même l'avertissement qui sauve : « en cas de désaccord entre ce
fichier et un article du Code, l'article prime ». Il vaut pour la MÉTHODE.

**ET UNE LACUNE DÉCLARÉE À TORT DANS LE SEMIS, CORRIGÉE.** Le commentaire des
comptes 4334 et 4335 du semis SYCEBNL écrivait que « aucun texte ne figure au
corpus pour le taux ONEM couramment pratiqué de 0,2 % · le taux n'est PAS
inscrit dans le logiciel ». C'était vrai à l'écriture ; l'arrêté n° 028/2025 a
depuis été versé au corpus et `correspondance-retenues.ts` le code à 0,5 % avec
sa date d'effet. **Une asymétrie reste ouverte et se tranchera en P1** : ces
deux comptes n'existent QUE dans le semis SYCEBNL, alors que le registre des
retenues les cherche pour les deux référentiels · une société commerciale n'a
aujourd'hui aucun compte où porter son INPP et son ONEM.

QUATRE MANQUES NOMMÉS, AUCUN COMBLÉ DE MÉMOIRE · le **SMIG**, cité par au
moins cinq articles et jamais chiffré, sans lequel ni le plancher d'assiette ni
la quotité saisissable de l'art. 114 ne se calculent ; l'**arrêté de l'art.
139** sur la valeur forfaitaire du logement, que l'art. 114 déduit ;
l'**arrêté INPP n° 002/CAB/MET/2025**, cité par le dépôt et absent des
compétences, donc invérifiable ; et la **convention collective** du dossier,
que l'art. 114 comme le barème de préavis appellent par catégorie.

**P1 EST LIVRÉ · LE REGISTRE DU PERSONNEL** (`docs/paie-p1-registre-du-personnel.md`).
Trois tables (`Salarie`, `EnfantACharge`, `ContratTravail`), une fenêtre, une
confrontation · **aucun bulletin, aucune assiette, aucun montant de paie**. Ce
qui le rend possible malgré les textes manquants : il ne dépend que du **Code
du travail**, qui est au corpus, et **l'article 212 EST le schéma** · ses
quinze énonciations sont la liste des colonnes, numérotées comme le texte les
numérote, et un test les tient à quinze. Les requalifications des art. 40 à 45
sont RENDUES, jamais appliquées en base · le logiciel dit que le texte l'a
déjà fait, avec sa formule (« de plein droit », « est réputé »), parce que
c'est la formule qui distingue un conseil d'un effet légal.

**TROIS CHOSES QUE P1 A TROUVÉES SANS LES CHERCHER.**

1. **LA LISTE D'EXCLUSION SERVAIT DEUX FINS OPPOSÉES.** L'archive de
   restitution du dossier lisait la liste d'exclusion du JOURNAL D'AUDIT. Tant
   qu'elle ne contenait que `motDePasse` et `estOperateurPlateforme`, les deux
   usages coïncidaient et personne ne voyait qu'ils étaient confondus. Y verser
   la date de naissance et la rémunération aurait, du même geste, VIDÉ
   L'ARCHIVE de ce qu'elle existe pour rendre · et elle se serait dite
   complète. **Le socle qui ne peut pas mentir aurait menti.** Deux listes
   désormais, et un test vu tomber contre la version confondue. **DOCTRINE ·
   une liste d'exclusion se nomme par sa FIN, jamais par sa forme. Deux listes
   identiques qui protègent deux choses différentes sont deux listes, pas une.**
2. **LE JEU D'ESSAI N'A RIEN PROUVÉ LA PREMIÈRE FOIS.** Sept défauts
   réinjectés, six attrapés. Le septième (plafond de l'art. 41 compté en 730
   jours au lieu de date à date) est passé parce que mon CDD n'enjambait aucun
   29 février : les deux lectures rendaient le même verdict. Refait du
   5 janvier 2027 au 5 janvier 2029, il dure 731 jours et pourtant exactement
   deux ans, et le défaut est tombé. **Même leçon que le mali de stock, et il a
   fallu la réapprendre.**
3. **VINGT-ET-UNIÈME OCCURRENCE** de « un même numéro, deux sens » · l'art. 37
   du Code du travail (nullité de la clause moins favorable) et l'art. 37,
   point 4 de la loi n° 004/2001 (60 % de main-d'œuvre locale). **Première fois
   que les deux sens se touchent dans une seule fonctionnalité.**

**L'EFFECTIF EST PROPOSÉ, JAMAIS SUBSTITUÉ.** Trois endroits l'attendaient et
le saisissaient (`Tenant.effectifPermanent`, les notes 27B et 29B, la part de
main-d'œuvre locale de l'accord-cadre). Le registre les rend calculables · il
ne les calcule pas à leur place. Et la part de main-d'œuvre nationale est
rendue NULLE dès qu'une seule nationalité manque : **une source saisie et
assumée vaut mieux qu'un calcul qui ne sait pas ce qu'il ignore.**

**L'ASYMÉTRIE DE SEMIS EST TRANCHÉE** · `43340000` et `43350000` sont désormais
ouverts dans le semis SYSCOHADA aussi. La raison est dans les textes : l'INPP
naît des art. 8 à 17 du Code du travail, l'ONEM de ses art. 202 et suivants, et
ni l'un ni l'autre ne distingue une ASBL d'une SARL.

**LES TEXTES ONT ÉTÉ REÇUS LE JOUR MÊME, ET ILS M'ONT DONNÉ TORT**
(`docs/paie-textes-recus-2026-09-19.md`).

**LA FAUTE, D'ABORD.** La passe de recherche a corrigé la fiche INPP pour
dater son entrée en vigueur du 1er janvier 2026, sur la foi de quatre sources
web concordantes, et a déclaré la référence « n° 002/CAB/MET/2025 »
introuvable. **L'article 3 de l'arrêté dit « qui entre en vigueur à la date de
sa signature », le cachet porte le 24 septembre 2025, et le titre porte le
numéro.** Le dépôt avait raison ; ma correction l'a rendu faux. Ce que les
sources décrivaient est la PUBLICATION au Journal officiel · publier n'est pas
entrer en vigueur quand le texte fixe lui-même sa date d'effet. Pire : **deux
tests figeaient le faux**, dont l'un INTERDISAIT la phrase vraie.

**DOCTRINE, ET ELLE MANQUAIT · UNE CORRECTION FONDÉE SUR UNE CORROBORATION EST
ELLE-MÊME UNE RÈGLE INVENTÉE.** Le web fait naître un doute et identifie un
texte ; il ne tranche pas contre le dépôt. Devant une divergence, on LIT le
texte · à défaut on consigne le doute et **on ne touche à rien**.
**COROLLAIRE · on n'écrit pas de test sur une corroboration**, parce qu'un test
fige, et qu'on arme alors la fausseté. **VINGTIÈME OCCURRENCE** d'une famille
voisine : ici **un même texte, DEUX DATES** · signature et publication.

**LE DÉCRET n° 25/22 EST LU, DOUZE ARTICLES, et il porte une distinction que
presque personne ne fait. L'ARTICLE 2 FIXE LE SMIG À 21 500 FC ; L'ARTICLE 3
ÉCHELONNE SON PAIEMENT** (14 500 à partir de la paie de mai 2025, 21 500 à
partir de celle de janvier 2026). Le SMIG est donc de 21 500 FC **depuis le
30 mai 2025** · tout ce qui se calcule SUR lui (plancher d'assiette CNSS,
quotité saisissable de l'art. 114, allocations familiales) s'y assied dès mai
2025, et le calculer sur le payable du mois **minore une assiette pendant huit
mois**. L'article 7 donne les multiplicateurs (6, 26, 312) pour les TROIS
grandeurs, et **aucun taux horaire** : OmegaX ne divise pas vers l'heure, la
durée légale du travail étant dans un autre texte. L'allocation familiale est
1/27e du SMIG PAR ENFANT (art. 5) et **la contre-valeur du logement est 1/5e de
L'ALLOCATION, jamais du SMIG** (art. 6) · la confondre donne un montant
vingt-sept fois trop élevé. Rien n'est arrondi, le décret ne prescrivant aucun
arrondi et la colonne 19 de son ANNEXE étant la vraie source.

**L'ANNEXE EST ARRIVÉE LE JOUR MÊME, AVEC LE DÉCRET n° 25/21** (J.O., première
partie, numéro spécial du 28 octobre 2025). Les deux manques déclarés
bloquants sont fermés.

**LA GRILLE DE TENSION SALARIALE** · sept catégories, dix-sept classes, du
manœuvre ordinaire (indice 100) au cadre de collaboration 4e échelon (indice
1 000). Deux annexes, et `taux = tension × SMIG / 100`. **LA TRANSCRIPTION EST
PROUVÉE PAR LE TEXTE LUI-MÊME** : les trente-quatre taux sont RECOPIÉS, puis
confrontés à la formule par un test, et les colonnes 19 et 20 à `SMIG/27` et à
son cinquième. Les trente-quatre bouclent, les quatre dérivés tombent au
centime. **DOCTRINE · une grille arithmétiquement CLOSE est une grille
correctement lue** · et c'est ce contrôle, non ma lecture, qui a tranché une
divergence entre le scan (« 110 ») et la couche texte (« 116 »), seul 116 × 145
donnant les 16 820 FC de la colonne.

**ET L'ANNEXE M'A CORRIGÉ UNE SECONDE FOIS DANS LA MÊME JOURNÉE.** J'avais
écrit, sur la seule lecture des articles 2 et 3, que « tout ce qui se calcule
sur le SMIG s'assied sur 21 500 dès mai 2025 ». L'annexe 1 porte une allocation
familiale de 537,04 FC, soit **14 500/27** : toute la grille s'assied sur le
montant PAYÉ. Chaque phrase que je citais était exacte ; la conséquence que
j'en tirais ne l'était pas. **DOCTRINE · une déduction tirée d'un texte PARTIEL
est une règle inventée, même quand chaque phrase citée est exacte.** Et j'ai
gardé la mesure là où l'annexe ne dit rien : le plancher d'assiette CNSS relève
d'un autre texte, et la fiche présente désormais les deux lectures sans en
trancher aucune · sur-corriger une seconde fois aurait été la vraie faute.

**LE DÉCRET n° 25/21** apporte le déclencheur d'ajustement (hausse de l'IPC
égale ou supérieure à 50 %, art. 5), l'ajustement annuel **à partir de janvier**
(art. 11), le budget-type familial pour cinq enfants (art. 7 à 9), et surtout
l'art. 15 : **la contre-valeur du logement est une DÉFALCATION, pas une
indemnité**, ouverte seulement « pour cause de MUTATION » avec logement en
nature · hors ce cas ce serait une retenue sans titre, et l'art. 112 du Code du
travail ferme la liste. **TROIS DATES POUR UN SEUL TEXTE** · décret du 30 mai
2025, annexes du 17 septembre, publication du 28 octobre : la grille n'existait
pas quand le décret la visait. Huit contresens réinjectés, huit attrapés.

**CE QUI RESTAIT BLOQUÉ TENAIT À UN SEUL DOCUMENT · L'ANNEXE.** Elle porte la
grille de TENSION SALARIALE de l'art. 4, « du travailleur manœuvre ordinaire au
cadre de collaboration ». **21 500 FC est le SMIG DU MANŒUVRE ORDINAIRE, et de
lui seul** : en faire le minimum de toutes les catégories serait le plus gros
contresens possible sur ce texte. Six contresens réinjectés dans
`bareme-smig.ts`, six attrapés.

**P1b · LE CONTRAT EST DÉSORMAIS CONFRONTÉ AU MINIMUM DE SA CLASSE.** La grille
de tension arrivée le matin même rouvrait une justification de P1 : la
`categorieProfessionnelle` était en chaîne libre « tant que la convention
collective n'est pas au corpus ». La convention l'est toujours, mais le DÉCRET
ne l'est plus · d'où une SECONDE colonne, `classeProfessionnelle` (1 à 17), qui
vient du décret et non de la convention. **Les fondre ferait servir un barème
légal sous un nom conventionnel.**

Le contrôle n'est pas un avis : le SMIG est « la somme minimale […] en deçà de
laquelle aucun travailleur ne peut être rémunéré SOUS PEINE DE SANCTION »
(décret n° 25/21, art. 3), et l'art. 37 du Code du travail frappe de NULLITÉ DE
PLEIN DROIT toute clause moins favorable.

**TROIS ABSTENTIONS PLUTÔT QU'UNE SUPPOSITION**, et `conforme` vaut `null`,
jamais `true` : sans la classe, sans la PÉRIODICITÉ (colonne neuve · le décret
fixe un taux JOURNALIER, la supposer mensuelle ferait paraître un salaire
journalier vingt-six fois trop bas), et sans un mois de référence dans le
barème. **Le mois se choisit** : un contrat TERMINÉ se juge sur son dernier
mois, sinon on reprocherait à l'employeur une revalorisation postérieure au
départ du salarié ; un contrat EN COURS se juge au mois courant.

**ET LE CONTRÔLE REND VISIBLE UN PIÈGE QUE RIEN NE SIGNALAIT** · 500 000 FC par
mois était conforme jusqu'en décembre 2025 (14 500 × 26 = 377 000) et ne l'est
plus en janvier 2026 (21 500 × 26 = 559 000). **Un contrat conforme à sa
signature cesse de l'être sans que rien n'y ait bougé**, et l'art. 11 du décret
n° 25/21 programme un ajustement chaque janvier.

**AU JOURNAL D'AUDIT, LES DEUX COLONNES SONT ADMISES, PAS MASQUÉES.**
Rétrograder quelqu'un d'une classe après coup ABAISSE LE MINIMUM QUI LUI EST
OPPOSABLE · c'est exactement la retouche qu'un journal existe pour rendre
visible, et la masquer protégerait la manipulation, pas la personne. Six
contresens réinjectés, six attrapés.

**ILS NE SONT PLUS QUATRE** (passe de recherche du 19/09/2026,
`docs/paie-recherche-textes-2026-09-19.md`). ~~L'**arrêté de l'art. 139
n'existe pas**~~ **CETTE CONCLUSION-LÀ EST FAUSSE, ET P5 LA RETIRE** · elle
prenait la **contre-valeur du logement** du décret n° 25/22 pour la **valeur
maximale de remboursement** de l'art. 139 a). Un décret du Premier ministre
n'est pas un arrêté du Ministre du Travail pris après avis du Conseil National
du Travail, et le second objet n'est pas le premier. Le manque de l'art. 139
est RÉEL, il est rétabli, et c'est sa radiation qui était l'erreur. Le décret
n° 25/22 reste à verser AVEC SON ANNEXE de tension salariale pour le reste. Et le manque
INPP cachait un DÉFAUT : le dépôt datait le nouveau barème du 24 septembre
2025, qui est la date de SIGNATURE · l'entrée en vigueur est au 1er janvier
2026, un exercice 2025 relevant du barème de 2006 (3 %, 2 %, 1 %, arrêté
n° 12/MTPS/123 et n° 007/CAB/MIN/FINANCES/2006). Corrigé, avec deux tests vus
tomber. **VINGTIÈME OCCURRENCE D'UNE FAMILLE VOISINE** de « un même numéro,
deux sens » : ici un même texte, DEUX DATES · celle qu'il porte et celle où il
mord. Le même fichier portait déjà la doctrine inverse trois fiches plus haut,
pour le prélèvement expatrié (art. 152 et 153). Une règle exacte, datée de la
mauvaise date, est une règle fausse sur tout un exercice.


**P2a · LES DEUX ASSIETTES, ET LA DÉCOUVERTE QU'ELLES SE RESSEMBLENT**
(`docs/paie-p2a-assiettes-et-bareme.md`).

**P2 N'ÉTAIT PAS BLOQUÉ, ET LE JOURNAL DE P0 SE TROMPAIT DE MANQUE.** Les
trois points qu'il tenait pour bloquants sont tranchés par des textes DÉJÀ au
corpus · le barème et son plafond (loi n° 23/053, art. 118), la déductibilité
de la quote-part ouvrière CNSS (art. 71), la cotisation syndicale (Code du
travail, art. 112, qui ferme la liste des retenues et ne la nomme pas). **Un
manque se vérifie contre le corpus ENTIER, pas contre le module qu'on écrit** ·
P0 lisait le corpus par le bout de la paie, le barème vivait au bout de la
fiscalité.

**LA TENSION DU BARÈME N'EN EST PAS UNE, ET ELLE SE CALCULE.** L'article 118
pose un taux marginal de 40 % ET un plafond (« En aucun cas, l'impôt total ne
peut excéder 30 % du revenu imposable ») · le second borne le premier, et il
MORD à partir de **77 932 800 FC** de revenu net global annuel. Le seuil n'est
pas une constante du texte, c'est le croisement de deux de ses alinéas, et le
test le RECALCULE depuis les tranches au lieu de le croire.

**LA DÉCOUVERTE · DEUX LISTES D'EXCLUSION QUI SE RESSEMBLENT MOT POUR MOT ET
N'ONT PAS LA MÊME FORME.** Le Code du travail, art. 7, point 8, sort CINQ
natures de la rémunération **sans aucune condition** (soins de santé, logement
ou son indemnité, allocations familiales légales, transport, frais de voyage).
La loi fiscale nomme les mêmes choses, les fait d'abord ENTRER dans
l'imposable (art. 68, « tous les avantages en argent et en nature ») puis les
immunise **sous condition** (art. 69). Servir la liste sociale à l'assiette
fiscale SOUS-IMPOSE sans qu'aucun total du bulletin ne bouge · une indemnité de
logement de 40 % du salaire sort de l'assiette sociale de plein droit et NE
SORT PAS de l'assiette fiscale. Même doctrine qu'à P1 · **une liste d'exclusion
se nomme par sa FIN, jamais par sa forme.** Et la divergence joue AUSSI en sens
inverse · les frais de voyage sortent de la rémunération et ne figurent dans
AUCUN point de l'art. 69, dont la liste est fermée.

**TROIS FORMULATIONS DE LA MÊME LOI, ET C'EST ELLE QUI LES DISTINGUE.** « DANS
LA LIMITE DE 5 % » (art. 116, 1) et « DANS LA MESURE OÙ elles ne dépassent pas
les taux légaux » (art. 69, 1) sont des PLAFONDS · seul l'excédent est repris.
« POUR AUTANT QUE l'indemnité de logement ne dépasse 30 % de la rémunération »
(art. 69, 8, a) est une CONDITION · remplie, l'immunité joue tout entière ; non
remplie, elle ne joue pas du tout. **La lecture n'est pas une opinion** : le
même législateur écrit « dans la limite de » quand il veut un plafond, à trois
articles de là. OmegaX applique la condition et NOMME l'autre lecture avec le
montant qu'elle changerait. La BASE des 30 % est prise au sens de l'art. 7,
point 8, qui exclut justement le logement · la réserve est écrite.

**TROIS ABSTENTIONS, ET AUCUNE NE SE SUPPOSE.** La réalité du transport
(art. 69, 8, b) et les documents probants des frais médicaux (art. 69, 8, c)
ne sont dans AUCUN livre comptable · le cabinet ATTESTE, sans quoi la
simulation s'abstient, jamais n'immunise d'office. Et le « taux légal » des
allocations familiales de l'art. 69, 1 reste NON TRANCHÉ · l'arrêté n° 137/2018
art. 3 et la colonne 19 de l'annexe du décret n° 25/22 portent deux montants,
et aucune source lue ne dit lequel vaut. **L'abstention fiscale n'emporte
JAMAIS l'assiette sociale**, qui ne dépend d'aucune de ces conditions.

**LA MENSUALISATION EST UNE CONVENTION DE L'ÉDITEUR, ET ELLE EST DÉCLARÉE.**
L'art. 119 impose une retenue MENSUELLE et renvoie au barème ANNUEL de
l'art. 118 · aucun article ne dit comment passer de l'un à l'autre. **On
annualise le mois, on ne divise pas les tranches** · les deux sont
arithmétiquement équivalents, mais annualiser applique le barème tel qu'il est
écrit sans jamais écrire de tranche mensuelle que le texte ne porte pas. Et
l'ARRONDI AU MILLIER se prend sur le revenu ANNUALISÉ, seul « revenu net
global » que l'article nomme · 1 000 100 FC par mois font 12 001 000 FC, contre
12 000 000 par l'autre chemin. **Ce qui sort est un ACOMPTE** · l'art. 116
assied l'impôt sur le revenu net global annuel et l'art. 121 y impute les
retenues, si bien que la somme des douze retenues n'est pas ce que le salarié
doit.

**LE PLAFOND JOUE AVANT LA QUOTITÉ, ET LE TEXTE LE DIT.** L'art. 123 réduit
« l'impôt établi par application de l'article 118 », alinéa 2 compris. L'ordre
inverse rendrait un impôt PLUS ÉLEVÉ dès que le plafond mord, au détriment du
seul contribuable qui a des personnes à charge ET un haut revenu. Le SEUL
endroit où le texte se tait est la répartition de l'impôt PLAFONNÉ entre la
part basse et la part haute · OmegaX ne fabrique aucune clé, il retient le plus
petit des deux montants que le texte nomme, et le dit en réserve.

**LE NOMBRE DE PERSONNES À CHARGE EST PROPOSÉ, JAMAIS SUBSTITUÉ** · même parti
que la part de main-d'œuvre nationale de P1. L'art. 124 ne compte les enfants
et ascendants que s'ils n'ont pas de ressources propres supérieures à la
première tranche, et l'art. 125 fige la situation AU 1er JANVIER, non au jour
de la paie. À défaut, ZÉRO est retenu · le sens défavorable au contribuable,
donc celui qu'on ne suppose pas en sa faveur.

**TROIS RÈGLES QUE LE MODULE N'APPLIQUE PAS, ET QUI SONT NOMMÉES.** Le minimum
de perception de l'art. 122 (1 % du chiffre d'affaires) ne vise PAS les revenus
salariaux de l'art. 68 · l'appliquer à un bulletin inventerait un impôt. Le
plancher de 2 000 FC du livre de cours n'est dans AUCUN article. Et la retenue
LIBÉRATOIRE de l'art. 121, alinéa 2 (personnel domestique, salariés de
micro-entreprises, arrêté n° 019/2025 non lu) est un autre régime, nommé plutôt
qu'ignoré.

**ET UNE LACUNE DÉCLARÉE À TORT DANS NOTRE PROPRE ÉCRAN, LA QUATRIÈME.**
L'en-tête de la fenêtre Personnel écrivait depuis P1 que « le moteur de
rémunération attend des textes qui ne sont pas encore au corpus du logiciel ».
Vrai à l'écriture, faux le lendemain. Après l'homologation de la facture (F1),
les exclusions de l'art. 41 (F2b) et la lecture de la contrepartie (F3a),
c'est **la première dans un texte affiché à l'utilisateur** · une phrase de ce
genre conclut le sujet et fait renoncer à une démarche possible.

Neuf contresens réinjectés dans les assiettes, neuf attrapés · huit dans le
barème, huit attrapés · six au point d'appel, six attrapés, **dont deux passés
au premier essai** (un motif de réinjection qui visait la mauvaise occurrence
du fichier, et un trou de test réel sur le taux légal, couvert depuis).

**P2b · LES COTISATIONS DES DEUX CÔTÉS, ET LE NET QUI NE PART PAS DE
L'ASSIETTE.**

**DIX-HUIT POUR CENT, PAS DIX-NEUF**, et le total ne figure dans AUCUN
article · il se calcule. Décret n° 18/041, art. 2 à 4 : prestations aux
familles 6,5 % (employeur), pensions 10 % (5 % employeur + 5 % travailleur),
risques professionnels 1,5 % (employeur). Soit 13 % patronal et 5 % ouvrier.
Un test refait l'addition, parce qu'elle a été ratée une fois en conversation.
L'art. 5 permet de DOUBLER le taux des risques professionnels, mais c'est une
DÉCISION DE LA CAISSE · elle se déclare, et la présumer ferait cotiser 1,5
point de trop sur tout le parc.

**L'ORDRE DE CALCUL EST DANS LES TEXTES, ET L'INVERSER SURESTIME L'IMPÔT.**
L'assiette SOCIALE ne dépend d'aucune cotisation · on la prend d'abord. Les
cotisations s'y assoient. La quote-part ouvrière qui en sort ENTRE ALORS dans
les retenues de l'article 71, et c'est seulement là que l'assiette fiscale
nette se ferme. Calculer l'impôt avant les cotisations le surestime de 5 % de
l'assiette sociale. Le champ saisi ne porte plus que les AUTRES versements de
l'article 71 · faire saisir la quote-part CNSS la compterait deux fois.

**SEULE LA QUOTE-PART OUVRIÈRE SE DÉDUIT.** L'article 71 ne laisse déduire que
ce qui est RETENU sur le revenu du travailleur. Servir le total des cotisations
y ferait déduire les patronales, qui ne sont retenues sur rien.

**LE NET À PAYER PART DU TOTAL VERSÉ, JAMAIS DE L'ASSIETTE**, et c'est le piège
central du chantier. Les cinq exclusions de l'article 7, point 8 ne sont pas
des sommes qu'on ne paie pas · ce sont des sommes qui ne sont pas de la
rémunération. Le travailleur reçoit bien son indemnité de logement. Partir de
l'assiette amputerait son net de tout ce qu'elles représentent, sur un bulletin
dont CHAQUE COTISATION serait exacte.

**TROIS ASSIETTES POSSIBLES, ET LE TEXTE N'EN NOMME EXPRESSÉMENT QU'UNE.** La
CNSS est la seule dont l'assiette soit ROUTÉE par la loi (art. 13 de la loi
n° 16/009 vers l'art. 7, litera h). L'INPP dit « les rémunérations versées »,
l'ONEM « la rémunération mensuelle payée » · NI L'UN NI L'AUTRE NE RENVOIE À
L'ARTICLE 7. OmegaX retient la même assiette pour les trois, parce que les deux
arrêtés sont pris par le Ministre ayant le Travail dans ses attributions et que
« rémunération » est un mot DÉFINI par le Code dont ils relèvent. C'est une
LECTURE, elle est portée sur chaque ligne, et elle n'est pas neutre · lue comme
le brut versé, l'assiette INPP d'un dossier qui loge son personnel serait
sensiblement plus large. Un test vérifie que la réserve est sur l'INPP et
l'ONEM et PAS sur la CNSS.

**LE TAUX INPP NE SE DEVINE PAS** · la NATURE de l'employeur d'abord (public
4 %, privé 3,5 / 3 / 2 % depuis le 24 septembre 2025 ; 3 % et 3 / 2 / 1 %
avant), puis la tranche d'effectif POUR LE PRIVÉ SEULEMENT. Faire dépendre le
taux public de l'effectif ferait payer 3,5 % à un établissement public de dix
agents. Sans nature déclarée, abstention · et l'abstention INPP n'emporte ni la
CNSS ni l'ONEM ni le net.

**CE QUE P2b NE CALCULE PAS, ET LE DIT** · les retenues de l'article 112
(avances, indemnités de l'article 52, cautionnement, prêt, saisie-arrêt)
supposent chacune un acte du dossier ; et la QUOTITÉ SAISISSABLE de l'article
114 se mesure « sur la partie n'excédant pas cinq fois le salaire minimum
interprofessionnel de SA CATÉGORIE », qui vient de la convention collective
absente du corpus, après déduction de « l'évaluation forfaitaire du logement,
tel que défini à l'article 139 », dont l'arrêté n'existe pas.

**ET DEUX CORRECTIONS DE MÉTHODE SUR MOI-MÊME.** Les 19 % annoncés en
conversation étaient une addition ratée, jamais entrée au dépôt · ce qui est
TESTÉ a tenu, ce qui était dit en prose n'a pas tenu, et c'est la seule
frontière qui ait lâché. Et la réserve CNSS poussée le matin gelait une
CORROBORATION · elle affirmait que la distinction des deux colonnes du Mod. DC
« remonte à l'arrêté départemental n° 0021 du 10 avril 1978 », texte NON LU,
connu d'un extrait de résultat de recherche. Retirée · la preuve tirée de
l'article 23, elle, est lue. Sept contresens réinjectés dans les cotisations,
sept attrapés.

**LE BARÈME SE LIT AU MOIS, IL SE CALCULE SUR L'ANNÉE (2026-09-24).** Manasse
l'a demandé : un salaire se paie au mois. `detailMensuel` relit le verdict
annuel avec les tranches divisées par douze (162 000, 1 800 000, 3 600 000 FC,
les bornes que donne aussi le cours de Mbuyamba pour l'IPR), et l'écran comme
le bulletin émis affichent ce détail par un seul composant
(`BaremeMensuelIrpp`). Ce n'est PAS un second calcul : l'arrondi au millier de
l'art. 118 reste pris sur l'année, et la somme des tranches, plafond et
quotité compris, rend la retenue au centime · un test le vérifie sur cinq
salaires. Un bulletin émis avant ce jour se relit sans le détail, puisqu'un
bulletin ne se modifie pas.

**P3 · LA PASSATION COMPTABLE, ET LE DIX-NEUVIÈME PIÈGE ENFIN CONFRONTÉ AU
SEMIS** (`docs/paie-p3-passation-comptable.md`).

**AUCUN NUMÉRO DE COMPTE DE PAIE N'EST ÉCRIT AILLEURS QUE DANS
`passation-paie.ts`, ET AUCUN SANS SON RÉFÉRENTIEL** · quatrième fois que la
règle se pose, après les stocks, les emballages et la variation de stocks.

**DIX-SEPT RÔLES, UN SEUL DIVERGE**, et c'est celui qui porte la ligne la plus
lourde du bulletin. La cotisation de retraite OBLIGATOIRE est au **43130000**
en SYSCOHADA (sous 431 Sécurité sociale) et au **43210000** en SYCEBNL (sous
432). Tout le reste coïncide, numéro ET intitulé · 6611, 6612, 6613, 6615,
6617, 6618, 6631, 6634, 6638, 6641, 4311, 4312, 4334, 4335, 4472, 4220.

**ET LA CORRECTION ÉVIDENTE EST ELLE-MÊME UN PIÈGE.** Le 432 du SYSCOHADA est
« Caisses de retraite COMPLÉMENTAIRE », semé en un compte unique 43200000 ;
celui du SYCEBNL est « Caisses de retraite » tout court, tête de division
ouvrant 4321 obligatoire, 4322 complémentaire, 4328 autres. Corriger 4313 en
432 rangerait la cotisation OBLIGATOIRE sous une nature FACULTATIVE dans un
plan sur deux. Un test interdit nommément le 43200000 et le 43220000 dans toute
la table, et vérifie que les numéros divergents ne sont PAS ouverts dans
l'autre plan.

**LA PRÉMISSE EST RELUE À CHAQUE EXÉCUTION** · un test lit les DEUX fichiers de
semis et exige que chacun des dix-sept numéros y soit réellement ouvert,
trente-quatre assertions. Règle sortie de F2b, et deux specs l'avaient déjà
payée.

**CINQ ABSENCES ASYMÉTRIQUES EN CLASSE 66**, relevées et non codées ·
66330000 (indemnités d'expatriation), 666 (exploitant individuel), 66720000
(personnel détaché) et 66820000 (comités d'hygiène) n'existent QU'AU SYSCOHADA ;
66500000 (habillement) et 66900000 (dégrèvements de charges sociales) QU'AU
SYCEBNL. Ce sont des ABSENCES, pas des sens différents · moins traître que « un
numéro, deux sens », aussi coûteux à la saisie.

**LE SÉMINAIRE CPCC SE TROMPE ICI, DANS LES DEUX PLANS** · il écrit « C/ 4331
INPP · C/ 4332 ONEM » quand le 4331 est « Mutuelle » et le 4332 « Assurances
retraite » des deux côtés. L'INPP est au 4334, l'ONEM au 4335. Un test
l'interdit.

**SORTIR DE L'ASSIETTE N'EST PAS SORTIR DE LA COMPTABILITÉ**, et c'est le piège
symétrique de P2a. Le logement et le transport sortent de la rémunération de
l'art. 7, point 8, donc de l'assiette des cotisations · ils sont pourtant PAYÉS,
donc ils sont en CHARGE au 66310000 et au 66340000. Même erreur que le net à
payer de P2b, prise par l'autre bout.

**QUATRE NATURES NE SONT PAS IMPUTÉES**, et deviner produirait une écriture
équilibrée sur une nature fausse. La PARTICIPATION AUX BÉNÉFICES · le SYCEBNL
n'ouvre pas de 426 DU TOUT, et l'absence est elle-même la réponse. Les
ALLOCATIONS FAMILIALES LÉGALES · servies par la CNSS, l'arrêté n° 143/2018
organisant leur paiement en dévolution, ce que l'employeur avance est une
CRÉANCE et non une charge. Les SOINS DE SANTÉ · trois comptes pourraient les
recevoir et aucune source ne dit lequel. Les FRAIS DE VOYAGE · transport,
avantage de fonction ou remboursement effectif sont trois natures, et l'art. 68,
1 renvoie à une qualification. Un test vérifie que les deux tables se complètent
EXACTEMENT sur les quinze natures, sans trou ni recouvrement.

**QUATRE REFUS, CHACUN CONTRE UN DÉFAUT QUI LAISSE LA BALANCE BOUCLÉE.** Le
plus fin est **COTISATION_EN_ABSTENTION** · sans nature d'employeur déclarée,
l'écriture serait ÉQUILIBRÉE avec une charge de personnel minorée de l'INPP
manquant, et rien en aval ne le verrait. Et le SOLDE DU 422 DOIT ÉGALER LE NET
DU BULLETIN (brut moins retenues) · le contrôle est fait QUAND MÊME, et son
échec est un REFUS. Aucune ligne de bouclage n'est posée · un écart est un
défaut du moteur, jamais un arrondi à rattraper.

**CORRIGÉ LE 2026-09-24 · TROIS TEMPS, PAS UNE ÉCRITURE COMBINÉE.** La première
version créditait le 422 du seul NET et mêlait dans un même bloc le brut,
l'impôt et les patronales. Le total était juste ; la présentation n'était pas
celle du Guide d'application SYSCOHADA (Partie 1 ch. 3 section 4 et
Application 10), et Manasse l'a relevé. Trois blocs désormais, lus au texte ·
**BRUT** (D/66 par nature, C/422 pour le brut entier, § 4.1) · **RETENUES**
(D/422, C/43 pour la part ouvrière, C/447 pour l'impôt, § 4.3 et la fiche du
compte 42 des deux plans) · **PATRONALES** (D/6641, C/43, § 4.2). **L'IMPÔT
RETENU N'EST PAS UNE CHARGE DE L'EMPLOYEUR** · un test vérifie qu'aucune ligne
de classe 6 ne le porte, et la part ouvrière et la part patronale d'une même
caisse restent deux lignes, parce que les fusionner effacerait laquelle des deux
est une charge. Cinq défauts réinjectés, cinq attrapés.

**ET UN TEST GELAIT UNE APPROXIMATION.** Le spec de P2a exigeait UN SEUL appel
Prisma dans `simulerPaie`, comme proxy de « aucune écriture ». Il est tombé
quand P3 a ajouté la lecture du référentiel, parfaitement légitime. Il gèle
désormais la PROPRIÉTÉ · aucune opération d'écriture, quelles que soient les
lectures. Même famille que « un test de source s'ancre sur une structure, jamais
sur une distance ». Huit contresens réinjectés dans la passation, huit attrapés.

**P4 · LE DÉCOMPTE FINAL, ET LE MEILLEUR DOCUMENT DE MÉTHODE DU CORPUS SE
TROMPE TROIS FOIS.**

Le séminaire CPCC donne la seule méthode complète du dépôt, et il porte
lui-même la règle qui sauve · « en cas de désaccord entre ce fichier et un
article du Code, L'ARTICLE PRIME ». La confrontation a été faite.

**TROIS ERREURS SUR LE CONGÉ, TOUJOURS DANS LE MÊME SENS · IL GONFLE.**
L'article 141 dit « au moins UN jour ouvrable par mois entier pour le
travailleur âgé de PLUS de dix-huit ans », « au moins UN jour ouvrable ET DEMI »
pour celui de MOINS de dix-huit ans, et « augmente d'UN jour ouvrable par
tranche de cinq années ». Le séminaire porte 1,5 pour le majeur (soit ses
18 jours l'an), 2 pour le mineur, 2 par tranche. **IL A DÉCALÉ D'UN CRAN** · la
règle des mineurs est servie aux majeurs, et celle des mineurs est inventée.
Une indemnité compensatrice calculée ainsi est de CINQUANTE POUR CENT trop
élevée. Et le texte donne au MINEUR le taux le plus ÉLEVÉ, ce qu'on n'attend
pas.

**ET SON BARÈME DE PRÉAVIS PAR CATÉGORIE N'EST PAS DANS LE CODE.** L'article 64
pose QUATORZE jours ouvrables plus SEPT par année entière, sans aucune
catégorie, et renvoie le reste à un ARRÊTÉ du Ministre absent du corpus · c'est
de là que viennent le « 1 mois + 9 jours » de la maîtrise et le « 3 mois +
16 jours » des cadres. OmegaX calcule le PLANCHER et le DIT · l'appliquer à un
cadre SOUS-ESTIMERAIT son préavis, et c'est le travailleur qui paierait. Même
réserve sur le congé, l'article 141 disant « AU MOINS ».

**« JOUR OUVRABLE » · LA MÊME QUESTION QU'AU 18/09, ET LA RÉPONSE EST INVERSE.**
Le dépôt a appris que « la question n'est pas QUELLE SOURCE définit le mot mais
DEVANT QUI l'obligation s'exécute ». Une échéance fiscale s'exécute à un
GUICHET, d'où le décret n° 24/09 et le samedi NON ouvrable. **UN PRÉAVIS
S'EXÉCUTE ENTRE L'EMPLOYEUR ET LE TRAVAILLEUR**, et le Code définit le mot
lui-même (art. 7, point 9 · le repos hebdomadaire ayant lieu le dimanche,
art. 121 al. 2) · **LE SAMEDI EST OUVRABLE ICI**, et `jour-ouvrable.ts` NE DOIT
PAS être réemployé. **L'ARITHMÉTIQUE LE CONFIRME PAR UN AUTRE CHEMIN** ·
l'article 7 du décret n° 25/22 convertit le journalier en mensuel par
VINGT-SIX, soit six jours par semaine. Vingt-six et « samedi ouvrable » disent
la même chose.

**LE SEUL CHIFFRE DU SÉMINAIRE QUE LA CONFRONTATION CONFIRME EST LE 312** · ce
n'est pas une convention, c'est le multiplicateur ANNÉE de l'article 7 du
décret n° 25/22, déjà lu et déjà codé. Le module le RÉUTILISE au lieu de le
réécrire.

**TROIS CAS OÙ AUCUN PRÉAVIS N'EST DÛ, chacun lu au texte** · la faute lourde
(art. 72, « résilié immédiatement sans préavis », enfermée dans une
notification écrite sous quinze jours ouvrables), la force majeure, et le terme
d'un CDD qui s'éteint de plein droit. La démission vaut LA MOITIÉ et jamais
plus (art. 64 al. 2). Le délégué syndical vaut LE DOUBLE (art. 258), mais son
plancher de TROIS MOIS n'est PAS converti · le texte l'exprime en mois et le
préavis en jours ouvrables, et aucune source ne convertit les uns dans les
autres.

**UN SOLDE PARTIEL SE LIT COMME UN SOLDE**, et c'est le refus central. Quatre
rubriques valent `null` plutôt que zéro (arriérés, moyenne des douze mois,
gratification, et les montants sans taux journalier) · un zéro se lit « rien
n'est dû », un `null` « personne n'a répondu ». Le TOTAL devient alors `null`
lui aussi, parce que le travailleur signe pour ce qui est écrit. Le zéro du
préavis sur faute lourde, LUI, est une RÉPONSE, et il porte son article.

**DEUX AUTRES ÉCARTS RELEVÉS.** L'article 142 fait payer en espèces les
avantages en nature « EXCEPTION FAITE SEULEMENT POUR LE LOGEMENT », quand le
séminaire porte une « indemnité congé / logement » · le logement EN NATURE
n'entre pas dans la conversion, une indemnité de logement en ESPÈCES est de la
rémunération et y entre. Et les commissions, primes et participations se
prennent sur la MOYENNE DES DOUZE MOIS (art. 66 et 142), jamais sur le dernier.

**ET LES RETENUES DU SÉMINAIRE NE SONT PAS REPRISES** · l'IPR à 10 % est
ABROGÉ au 1er janvier 2026, et la « retenue syndicat 2 % » n'est fondée par
AUCUN article, l'article 112 énumérant les retenues autorisées sans la nommer.
Les assiettes et le barème de l'article 118 valent pour le décompte comme pour
un mois ordinaire. Neuf contresens réinjectés, neuf attrapés.

**ADDENDUM P0 · le chapitre 66 du livre de cours, et ce qu'il apporte
vraiment.** Un second extrait du même livre (pages 173 à 199) a été fourni en
cours de passe. Il porte LE chapitre de la paie. Même statut que le premier ·
une note de cours, pas une source · et le même piège en plus large : **toute sa
partie fiscale est bâtie sur le régime abrogé** (IBP, impôt minimum
forfaitaire, acomptes de 40 % avant le 1er août et le 1er décembre, IPR, IERE,
comptes 44721 et 44722). Rien n'en est repris.

TROIS MÉCANISMES QU'AUCUNE AUTRE SOURCE NE DONNAIT, et qui décident du moteur.
**L'ORDRE DE CALCUL** · « l'IPR est calculée sur la rémunération imposable
NETTE du montant retenu pour CNSS (QPO) » : brut, puis assiette sociale, puis
CNSS, puis assiette fiscale NETTE DE LA CNSS, puis barème, puis plafond. Le
calculer dans l'autre sens surestime l'impôt de 5 % de l'assiette. **LES
AVANTAGES EN NATURE NE VONT PAS DIRECTEMENT EN CHARGES DE PERSONNEL** · ils
s'enregistrent « dans les différents comptes de charges CONCERNÉS » puis sont
TRANSFÉRÉS en 6617 et 6627 par le crédit du 78 « Transfert de charges ». Les
porter d'emblée au 6617 donne le même résultat net et fausse la ventilation par
nature du compte de résultat, exactement comme le virement du 637 au 667 que le
dépôt surveille déjà. Et **les rémunérations dues à la clôture** entrent par le
422 ou par le 428.

**LE BARÈME MENSUEL EST LE BARÈME ANNUEL DIVISÉ PAR DOUZE, ET LES TRANCHES
N'ONT PAS CHANGÉ ENTRE L'IPR ET L'IRPP.** Le livre donne 162 000, 1 800 000 et
3 600 000 en mensuel ; l'art. 118 donne 1 944 000, 21 600 000 et 43 200 000 en
annuel. Les trois rapports valent douze exactement, et la colonne d'impôt
cumulé du livre est juste au franc près. Le passage à l'IRPP au 1er janvier
2026 a donc changé le NOM et la BASE LÉGALE, pas les tranches · le barème
mensualisé est exploitable, avec la réserve qu'un barème mensuel est un ACOMPTE
sur un impôt que l'art. 118 assied sur le revenu net GLOBAL, et que le module
devra dire lequel des deux il calcule.

**UN PLANCHER D'IMPÔT QU'AUCUNE AUTRE SOURCE NE PORTE** · « l'IPR ne peut être
inférieur à 2.000 FC ». Le fichier des paramètres fiscaux donne le barème et le
plafond de 30 %, jamais ce plancher. Piste réelle, à confronter avant tout
codage : un plancher hérité de l'IPR n'a pas été retrouvé dans le régime
actuel.

**ET TROIS CONTRADICTIONS DU LIVRE CONTRE LES TEXTES, DONT UNE QUI EXPOSE
L'EMPLOYEUR.** Les saisies-arrêts y sont fausses deux fois · le livre écrit
« 1/5 pour des raisons financières et 2/3 pour obligation alimentaire » quand
l'art. 114 du Code du travail dit un cinquième sur la partie n'excédant pas
CINQ FOIS le salaire minimum de la catégorie, UN TIERS sur le surplus, et DEUX
CINQUIÈMES pour une obligation alimentaire. Une retenue calculée sur le livre
DÉPASSERAIT la quotité légale. S'y ajoutent l'INPP à l'ancien barème (3 / 3 /
2 / 1 % contre 4 / 3,5 / 3 / 2 % depuis l'arrêté de 2025) et l'ONEM à 0,2 % ·
troisième document du corpus à porter l'ancien taux.

LE JOURNAL D'UNE PAIE GLOBALE qu'il donne vaut comme modèle, et c'est le seul
du corpus. Mais **il ne démontre PAS les exclusions d'assiette** : ses
cotisations y sont des DONNÉES, non calculées, et l'indemnité de transport y
est portée au brut en 6638 alors que l'arrêté n° 146/2018 l'exclut de
l'assiette sociale. Recopier l'exemple en croyant y lire un calcul est le piège
de plus.


**P5 · LES TROIS RESTES, ET UN MÊME MOT QUI PORTAIT TROIS OBJETS.**

`docs/paie-p5-quotite-et-livre-de-paie.md`. Trois sujets, dont deux déclarés
bloqués et qui ne l'étaient pas.

**VINGT-TROISIÈME OCCURRENCE DE LA FAMILLE « UN MÊME MOT, DEUX SENS », ET LA
PREMIÈRE À TROIS.** Le mot « logement » porte, dans ce corpus : (1)
l'**indemnité de logement** des art. 138 et 7 litera h, HORS rémunération sans
condition, qui ne se déduit donc jamais de la base de l'art. 114 puisqu'elle
n'y est pas entrée ; (2) la **valeur maximale de remboursement du logement
fourni en nature** de l'art. 139 a), fixée par un ARRÊTÉ du Ministre du Travail
après avis du Conseil National du Travail, et c'est celle-là, et elle seule,
que l'alinéa 4 de l'art. 114 fait déduire · **arrêté introuvable** ; (3) la
**contre-valeur du logement** du décret n° 25/22 art. 6, colonne 20, défalcable
de l'indemnité et POUR CAUSE DE MUTATION seulement (décret n° 25/21 art. 15).

**ET C'EST LE DÉPÔT LUI-MÊME QUI AVAIT CONFONDU** (2) et (3), le 19/09, dans
une phrase de correction. Sans ce rattrapage, la quotité saisissable aurait
déduit la colonne 20 · base trop haute, part saisissable trop grande, **saisie
qui mord sur la part que l'art. 114 protège**. D'OÙ LA DOCTRINE : **une
correction engage autant qu'une règle, et un manque déclaré SANS OBJET se
vérifie avec la même discipline qu'un manque déclaré tout court.**

**LA QUOTITÉ DE L'ART. 114 N'ÉTAIT PAS BLOQUÉE PAR LA CONVENTION
COLLECTIVE.** L'article vise le salaire minimum **INTERPROFESSIONNEL** de la
catégorie, qui est celui du décret n° 25/22 · une convention ne peut être que
plus favorable, et ce qu'elle ajoute n'est pas ce seuil. Le module demande la
**CLASSE** (1 à 17) et non la catégorie, parce qu'une catégorie couvre
plusieurs échelons à des taux différents ; prendre le premier échelon pour tous
abaisserait le seuil et AUGMENTERAIT la part saisissable. **Une règle de
protection ne se tranche pas contre celui qu'elle protège.** Le cumul de
l'alinéa 3 n'est PAS plafonné, parce que le texte ne le plafonne pas · une
réserve le dit, le code ne le fait pas.

**LE TAUX LÉGAL DES ALLOCATIONS FAMILIALES · LA QUESTION ÉTAIT MAL POSÉE.**
P2a demandait « lequel des deux montants ». Il n'y a pas deux lectures d'une
même règle : il y a **DEUX OBLIGATIONS, DEUX DÉBITEURS**, qui partagent un nom.
Les 8 100 FC de l'arrêté n° 137/2018 art. 3 sont « **servis directement par la
Caisse** » (art. 4, et arrêté n° 143/2018 art. 1er) · même en dévolution, « la
Caisse MET À LA DISPOSITION DE L'EMPLOYEUR le montant total des sommes à
payer » (art. 143/2018 art. 3), donc l'employeur est un GUICHET. La colonne 19
du décret n° 25/22, elle, est ce que l'EMPLOYEUR doit. Et l'art. 69, 1 immunise
ce qui est « **RÉELLEMENT ACCORDÉ AUX EMPLOYÉS** ». **LE PLAFOND D'UNE IMMUNITÉ
SE LIT SUR LE DÉBITEUR DE LA SOMME QU'IL BORNE.** Le taux se calcule donc
désormais au lieu de se saisir. Le nombre d'enfants BÉNÉFICIAIRES n'est pas le
nombre de personnes à charge · l'art. 8 de l'arrêté n° 137/2018 interrompt le
droit enfant par enfant.

**CINQUIÈME LACUNE DÉCLARÉE À TORT.** `bareme-smig.ts` écrivait « CET ARRÊTÉ
N'EST PAS AU CORPUS » de l'arrêté n° 137/2018. Il y est, douze articles, et les
conditions de suspension qu'on disait manquantes sont à ses art. 5, 6 et 8.
Même cause que les quatre précédentes · **le manque vérifié contre le module
qu'on écrit, pas contre le corpus entier**.

**LE LIVRE DE PAIE · L'ART. 215 AL. 2 VISE EXACTEMENT OMEGAX, ET POSE DEUX
CONDITIONS, PAS UNE.** La gestion automatisée permet de remplacer le livre par
tout autre document, mais il faut une **AUTORISATION DE L'INSPECTEUR DU
TRAVAIL**, qui est un ACTE à obtenir et conserver, jamais une faculté que
l'informatisation accorde d'elle-même · et des mentions conformes à l'arrêté du
modèle. « Non renseignée » n'est jamais lue comme « obtenue ». L'arrêté du
modèle est **IDENTIFIÉ** (n° 12/CAB.MIN/ETPS/042 du 8 août 2008) et **TOUJOURS
NON LU** · la sortie réseau refuse les quatre dépôts qui le portent. Aucune de
ses mentions n'est codée, et **le module ne certifie JAMAIS une conformité au
modèle, même toutes cases cochées**. Ce qu'il rend est la couverture des
**trente mentions de l'art. 25 de l'arrêté n° 146/2018**, qui sont lues :
**COUVERTURE NE VAUT PAS CONFORMITÉ**, et le mot « notamment » de l'art. 25
rappelle que la liste n'est même pas fermée.

**L'ART. 103 AL. 2 EST LA DISPOSITION LA PLUS LOURDE DU TITRE V POUR UN
CABINET**, et elle n'était nulle part : sans décompte écrit remis AU MOMENT DU
PAIEMENT, « ses allégations concernant le décompte des paiements effectués
**SONT REJETÉES** ». Un paiement réel mais non décompté se plaide comme un
non-paiement. Et l'art. 104 ferme la porte inverse · « pour solde de tout
compte » ne vaut pas renonciation.

**UNE GARANTIE NÉGATIVE VIEILLIT.** L'avertissement de la simulation disait
encore, aux deux bouts, « il ne liquide aucune cotisation patronale, ne propose
aucune écriture ». Vrai en P2a, faux depuis P2b et P3, et lu par l'utilisateur
à chaque simulation. **CHAQUE PASSE QUI AJOUTE UNE CAPACITÉ DOIT RELIRE LES
PHRASES QUI DISENT QUE LE LOGICIEL NE L'A PAS.** Un test le gèle maintenant,
serveur et écran.

Onze contresens réinjectés, onze attrapés · plus un douzième refait parce que
la première version ne compilait pas, et **une suite à « 0 total » n'est pas
une suite qui tombe**.

**P6 · LES DEUX ARRÊTÉS REÇUS, ET CE DÉPÔT PRIS EN DÉFAUT QUINZE FOIS.**

`docs/paie-p6-les-deux-arretes-recus.md`. Manasse a versé, le soir même, les
deux arrêtés que P5 déclarait manquants · n° 12/CAB.MIN/ETPS/042 du 8 août 2008
(modèle du livre de paie, art. 215) et n° 12/CAB.MIN/TPS/110/2005 du 26 octobre
2005 (logement, art. 139). Tous deux sont au skill `droit-travail-congolais`,
texte intégral. **Aucun des deux n'y était**, ce qui a été vérifié avant de les
écrire.

**CE DÉPÔT S'EST TROMPÉ DEUX FOIS DANS LA MÊME JOURNÉE, EN SENS INVERSE, ET LA
VÉRITÉ ÉTAIT ENTRE LES DEUX.** Le matin : « l'arrêté de l'art. 139 n'existe
pas, c'est dans le décret SMIG » · FAUX sur la forme, JUSTE sur le chiffre.
L'après-midi, P5 : « trois objets distincts, donc la quotité n'est pas
chiffrable » · JUSTE sur la forme, FAUX sur le chiffre. L'article 10 de
l'arrêté de 2005 tranche : « il peut défalquer de la rémunération du
travailleur **1/5 DU TAUX JOURNALIER DES ALLOCATIONS FAMILIALES quelle que soit
la catégorie professionnelle** ». C'est EXACTEMENT la colonne 20 du décret
n° 25/22 · 537,04 / 5 = 107,41 et 796,30 / 5 = 159,26, les deux annexes
bouclent au centime. **D'OÙ LA DOCTRINE · DEUX TEXTES QUI SE SUIVENT DE VINGT
ANS PEUVENT ÊTRE DEUX TEXTES ET UNE SEULE RÈGLE.** Refuser de les confondre est
juste ; en conclure qu'ils disent des choses différentes ne l'est pas. SEULE
L'ARITHMÉTIQUE TRANCHE, et un test la refait sur les deux annexes.

Ce qui reste de la distinction de P5, correctement découpé · l'INDEMNITÉ de
logement (art. 138 et 7 litera h), hors rémunération, qui ne se déduit pas
puisqu'elle n'est jamais entrée ; la défalcation de l'ARRÊTÉ DE 2005 art. 10,
sur la RÉMUNÉRATION, dès que le logement est EN NATURE, sans condition de
mutation ; et celle du DÉCRET n° 25/21 art. 15, MÊME GRANDEUR mais sur
l'INDEMNITÉ et POUR CAUSE DE MUTATION. C'est la deuxième que l'art. 114 al. 4
fait déduire · **la quotité saisissable est chiffrable, l'abstention de P5 est
levée**. Une précaution demeure · l'art. 10 dit « il PEUT défalquer », et si
l'employeur l'a déjà fait, redéduire compterait deux fois contre le travailleur.
Cela se DÉCLARE.

**LE LIVRE DE PAIE · CINQ DÉFAUTS DANS CE QUE P5 AVAIT CODÉ DU SEUL CODE.**
(1) L'art. 1er vise « le livre de paie **OU FICHIER INFORMATISÉ** » · le
fichier informatisé est une FORME DU LIVRE, admise d'office, et seul « tout
autre document » tombe sous l'autorisation de l'art. 215 al. 2. P5 refusait à
un cabinet informatisé une faculté que le texte lui donne. (2) Les mentions
sont **TRENTE-TROIS**, pas trente · P5 prenait la liste de l'arrêté n° 146/2018,
qui est celle de la sécurité sociale, pour le modèle du livre. (3) **TROIS
MENTIONS SONT DES FORMULES DE SOMME** · la 20 (brut = 7+10+11+12+13+16+19), la
26 (déductions = 21+22+23+24+25), la 28 (jours = 6+14+17). LA PREMIÈRE VAUT
DÉMONSTRATION · les allocations familiales n'y sont pas, et le modèle officiel
corrobore donc par sa seule arithmétique l'exclusion de l'art. 7 litera h.
(4) Le seuil du livre « inspiré du modèle » est de **DIX** dans l'arrêté et de
**VINGT-CINQ** à l'art. 215 al. 3 · contradiction réelle, UN ARRÊTÉ NE DÉROGE
PAS À LA LOI, OmegaX garde vingt-cinq et porte la contradiction en réserve.
(5) L'art. 2 donne la destination des deux doubles de l'art. 214 (un au
travailleur, un à l'INSS) ET impose un décompte écrit des paiements **lors de
la résiliation du contrat**, en plus du bulletin de chaque paie.

**LA MENTION 11 NOMME LE SAMEDI**, que l'arrêté n° 146/2018 ne nomme pas ·
TROISIÈME corroboration indépendante de la doctrine P4, après le multiplicateur
26 de l'art. 7 du décret et la définition du Code.

**CE QUE LE MODULE CONTINUE DE REFUSER, ET POURQUOI CE N'EST PLUS LA MÊME
RAISON.** L'art. 1er exige DEUX choses · les trente-trois énonciations ET la
conformité AU MODÈLE ANNEXÉ, qui est une MISE EN FORME. OmegaX vérifie les
énonciations sur déclaration, il ne sait pas vérifier qu'un document a la forme
du tableau annexé. La conformité n'est donc toujours pas certifiée, mais plus
parce que le modèle serait inconnu. **UN REFUS QUI SURVIT À SON MOTIF DOIT
CHANGER DE MOTIF, PAS DISPARAÎTRE NI RESTER MUET.**

**LA SANCTION A UN MULTIPLICATEUR** · art. 328 a), pour les infractions à
l'art. 215, « l'amende est appliquée AUTANT DE FOIS QU'IL Y A DE TRAVAILLEURS
NON INSCRITS OU DE RENSEIGNEMENTS OMIS », plafonnée à cinquante fois le taux.
Une mention manquante se multiplie par l'effectif.

**UNE LACUNE DANS L'ARRÊTÉ DE 2005 LUI-MÊME** · son art. 1er b) annonce la
ration journalière de vivres, ses régions, ses catégories et sa valeur maximum
de remboursement · AUCUN DE SES DOUZE ARTICLES SUIVANTS NE LE FAIT. L'art. 139
b) du Code reste sans mesure d'exécution. Ce n'est pas un manque du corpus
d'OmegaX, c'est un manque du droit congolais, et il se signale au lieu de se
chercher.

**L'ANNEXE DE 2008 EST UNE RECONSTITUTION, ET LE FICHIER LE DIT EN TÊTE.** Sa
police porte un encodage décalé (+29 sur l'ASCII imprimable) · « 1XPpURG RUGUH »
pour « Numéro d'ordre ». La restitution est mécanique, sauf les accents que
l'encodage perd, rétablis d'après les libellés identiques de l'art. 1er, lu
directement. NE JAMAIS CITER UN LIBELLÉ DE L'ANNEXE COMME UNE LECTURE DIRECTE.

Trois anomalies de renvoi signalées et non corrigées · « art. 323 (9) » qui
n'existe pas (2008, art. 5) ; « art. 321 (c) » qui vise la numérotation
d'avant 2016 (2005, art. 12) ; et un renvoi à « l'art. 4 alinéa 1° » pour une
exception qui est à l'art. 5, 1° (2005, art. 2, 9°).

**LE DOCUMENT P5 N'A PAS ÉTÉ RÉÉCRIT** · il porte un bandeau qui dit ce qui y
est faux et renvoie à P6. **Effacer une erreur en efface aussi la leçon.**

Dix contresens réinjectés, dix attrapés, chacun avec un compte d'échec réel.

**SIXIÈME LACUNE DÉCLARÉE À TORT, ET LA PIRE DES SIX · L'ARRÊTÉ INPP.** Le
journal redemandait « l'arrêté interministériel INPP du 24 septembre 2025 au
numéro exact » en P0, en P5 et encore en P6. **LES DEUX ARRÊTÉS INPP SONT AU
CORPUS, EN TEXTE INTÉGRAL, VISAS ET TROIS ARTICLES COMPRIS**, et le code du
dépôt porte leurs références complètes depuis le jour de leur versement, avec
deux tests qui les gèlent. Le seul fragment inconnu est le numéro du ministère
des Finances pour 2025, MANUSCRIT ET ILLISIBLE sur l'original · le fichier du
corpus le dit lui-même en note, et ce n'est pas un texte à verser mais une
vérification au Journal officiel qui n'a d'objet qu'en contentieux.

**LA CAUSE EST NOUVELLE.** Les cinq premières venaient d'un manque vérifié
contre le module qu'on écrivait plutôt que contre le corpus entier. Celle-ci ne
vient d'AUCUNE vérification : le journal recopiait sa propre liste de demandes,
passe après passe, sans jamais la confronter à quoi que ce soit. **UNE LISTE DE
MANQUES EST UN DOCUMENT COMME UN AUTRE · elle vieillit, et elle se relit contre
le corpus, jamais contre elle-même.** D'où la règle, qui vaut pour toute passe :
**AVANT DE REDEMANDER UN TEXTE, L'Y CHERCHER.** Et c'est Manasse qui l'a relevé,
en une phrase, après trois passes.

**P7 · LA COTISATION SYNDICALE, ET LA DERNIÈRE DEMANDE DE LA SÉRIE PAIE QUI
N'EN ÉTAIT PAS UNE.**

`docs/paie-p7-cotisation-syndicale-et-logement.md`. La question était mal posée
depuis P0 · « l'article 112 ferme la liste sans nommer la cotisation syndicale,
donc on ne sait pas ». **C'ÉTAIT LIRE UN SEUL ARTICLE**, et la réponse était au
Titre XII depuis toujours.

**ARTICLE 279 · toute convention collective « comporte OBLIGATOIREMENT […] les
modalités de perception et de versement PAR LES TRAVAILLEURS des cotisations
syndicales ».** LE SUJET DU VERBE EST LE TRAVAILLEUR. Cinq sources
indépendantes donnent la même phrase, et l'une rapporte qu'un état ANTÉRIEUR du
droit congolais mettait la perception à la charge DES EMPLOYEURS · le
changement de sujet est un choix du législateur de 2002.

**ET UNE CONVENTION COLLECTIVE NE PEUT PAS RÉTABLIR LA RETENUE.** L'article 274
lui interdit de déroger à l'ordre public, et l'article 112 en est, POUR DEUX
RAISONS PLUTÔT QU'UNE · nullité de plein droit à son alinéa 1er, ET sanction
pénale (art. 321) dont l'article 328 b) multiplie l'amende « AUTANT DE FOIS
QU'IL Y A DES TRAVAILLEURS CONCERNÉS ». **L'ARTICLE 279, LUI, N'EST DANS AUCUNE
DES DEUX LISTES PÉNALES**, et c'est l'asymétrie qui tranche. Le « retenue
syndicat 2 % » du séminaire CPCC est donc écarté pour une raison, non plus par
prudence.

**LA VOIE QUI RESTE EST UNE CESSION, PAS UNE RETENUE, ET C'EST UNE LECTURE
D'ÉDITEUR DÉCLARÉE.** L'article 114 régit « la CESSION » autant que la saisie ;
une cession est un acte DU TRAVAILLEUR, et l'employeur qui paie le cessionnaire
EXÉCUTE au lieu de retenir. Deux conséquences dites avant de la proposer · elle
CONSOMME LA QUOTITÉ CESSIBLE et concurrence donc les créanciers, et elle
suppose un ÉCRIT RÉVOCABLE du travailleur, jamais une clause qui vaut pour tous.

**DEUX LITTERAE DE L'ARTICLE 112 SONT DATÉS, ET LA SOUPLESSE A UNE LIMITE.** Le
a) nomme la « taxe professionnelle », abrogée, et le b) l'« Institut National de
Sécurité Sociale », devenu la CNSS en 2018 · on les lit par équivalence sans
que personne n'y voie une illégalité. **MAIS L'ÉQUIVALENCE VAUT POUR UN TEXTE
QUI REMPLACE CELUI QUE LA LISTE NOMME, JAMAIS POUR UNE RETENUE QUE LA LISTE N'A
JAMAIS PRÉVUE.** Un test interdit d'en ajouter une à un autre litera.

**UN ARTICLE DE DOCTRINE SUR LE DROIT AU LOGEMENT, ET CE QU'IL APPORTE
VRAIMENT.** Trente-sept pages de politique publique, dont les chiffres sur le
logement patronal sont des FRANCS DU CONGO BELGE de 1950 à 1956. Rien n'en est
codé, et un test vérifie qu'aucun de ces montants n'entre. Il apporte pourtant
trois choses, et aucune n'est un chiffre · (1) une JURISPRUDENCE recensée par
R. Lukoo Musubao (2006, p. 141) selon laquelle « l'employeur s'acquitte de
l'obligation de fournir un logement lorsqu'il verse une indemnité de
logement » · les deux branches de l'art. 138 sont donc ALTERNATIVES, et OmegaX
signale désormais leur cumul sans le refuser ; (2) l'ORDONNANCE n° 08/040 du
30 avril 2008, au même intitulé et à la même mécanique de colonnes que les
décrets n° 18/017 et n° 25/22 · **P6 est donc corroboré par un troisième
chemin, historique**, et le système est stable sur dix-sept ans ; (3) l'article
117 du Code de 1967, qui porte les DEUX MÊMES conditions cumulatives que
l'art. 4 de l'arrêté de 2005.

**UNE DOCTRINE N'EST PAS UNE SOURCE**, et la règle ne bouge pas · ce qu'elle
apporte se signale, se date et s'attribue, il ne se calcule jamais.

Cinq contresens réinjectés, cinq attrapés · **mais le cinquième est passé au
premier essai**, et c'était un vrai trou : le câblage du service n'était couvert
par aucun test. Trois tests ajoutés, réinjection refaite. **UNE RÉINJECTION QUI
PASSE EST PLUS UTILE QU'UNE RÉINJECTION QUI ÉCHOUE.**

**PLUS RIEN N'EST DEMANDÉ À MANASSE SUR LA PAIE.** Les quatre demandes de P0
sont closes · le SMIG et son annexe, le modèle du livre de paie, l'arrêté de
l'art. 139, la cotisation syndicale. L'arrêté INPP n'en était pas une.

**ET LA RÈGLE DE P6 ÉTAIT INCOMPLÈTE · LA SECONDE MOITIÉ.** P7 a d'abord
reconduit deux textes « identifiés et non lus » (l'arrêté INPP de 2003 et
l'ordonnance n° 08/040 de 2008) DANS LE MESSAGE MÊME qui reconnaissait avoir
recopié une liste périmée. Manasse a posé la seule question qui les élimine ·
**qu'est-ce que tu en ferais ?** Rien. L'arrêté de 2003 régit l'antérieur au
14 février 2006, soit vingt ans en arrière, quand **l'article 24 de l'AUDCIF
fixe la conservation à DIX ANS** · et le module de paie n'a aucune règle aussi
basse (INPP 14/02/2006, ONEM 17/08/2018, SMIG mai 2025, IRPP 2026). Versé, il
n'aurait nulle part où aller. **D'OÙ LA SECONDE RÈGLE · UN TEXTE ABROGÉ N'EST
UN MANQUE QUE SI LE LOGICIEL PEUT ENCORE RENCONTRER UN EXERCICE QU'IL
RÉGISSAIT**, et le test est objectif : sa période tombe-t-elle dans les dix ans
de l'art. 24, et le module descend-il seulement jusque-là ? « Avant de
redemander un texte, l'y chercher » ne suffisait pas · il faut aussi SAVOIR CE
QU'ON EN FERAIT.

**LA SEPTIÈME « LACUNE DÉCLARÉE À TORT » · LA CLÉ DE CHIFFREMENT DES
SAUVEGARDES.** Le même jour, après l'arrêté INPP, j'ai redemandé à Manasse de
générer la paire de clés `age` et de poser `CLE_AGE_SAUVEGARDES` en variable de
dépôt, en recopiant le paragraphe « RESTE À FAIRE » de
`docs/plan-ordonne-2026-09.md`. Manasse a répondu · **« Je m'en souviens d'avoir
déjà fait cet exercice. Pourquoi on le refait ? »** Il avait raison. La clé est
posée depuis le 2026-09-02 · le workflow lui-même le datait (« Vécu le
2026-09-02, première pose de la clé », à propos du retour chariot de Windows) et
`docs/sauvegardes-et-restauration.md` montrait une clé publique horodatée du
même jour.

**LA PREUVE NE SE LISAIT DANS AUCUN DOCUMENT · ELLE SE LISAIT DANS LES RUNS.**
L'étape « Exiger la clé publique de chiffrement » sort en erreur si la variable
est absente ou mal formée · **un run vert de `sauvegarde-base.yml` est donc une
attestation que la variable est posée ET conforme**. Vingt-six runs, tous verts,
le dernier le 2026-09-23 à 07:05:09, étape 7 comprise.

**D'OÙ LA RÈGLE · UNE LIGNE DE PLAN QUI DÉCRIT UNE ACTION D'UN TIERS NE SE
RECOPIE PAS, ELLE SE VÉRIFIE CONTRE CE QUE CETTE ACTION AURAIT CHANGÉ.** C'est
l'exact pendant de « avant de redemander un texte, l'y chercher » · là le corpus
répondait, ici c'est la CI. Dans les deux cas le tort venait de la même source ·
j'ai relu ma propre liste au lieu de la confronter au monde. **Une liste de
manques ne se relit jamais contre elle-même.**

**MULTI-CLASSIFICATION · TRANCHÉ LE 2026-09-23, ON NE TOUCHE PAS À LA
STRUCTURE.** `Compte`, `Journal` et `Immobilisation` restent
mono-classification (`docs/decision-multi-classification.md`). L'avertissement
du plan (« la migration renchérit chaque mois ») venait de Sage et n'avait
jamais été confronté au texte. Or l'AUDCIF fait d'IFRS un jeu d'états déposé
« EN SUS » (art. 73-1) et de la consolidation un « retraitement des comptes
individuels » (ch. XII-3) · deux COUCHES au-dessus du grand livre légal.
**RÈGLE : RIEN N'ÉCRIT DANS `Ecriture` NI DANS `LigneEcriture` QUI NE SOIT PAS
DU RÉFÉRENTIEL LÉGAL DU DOSSIER.** Une colonne de norme sur les écritures
obligerait à filtrer 97 lectures dans 30 fichiers, et une seule oubliée
mélangerait des retraitements dans le bilan déposé, sans que la balance cesse
de boucler. Retraitements et correspondances IFRS iront dans des tables
posées à côté, qui lisent le grand livre sans y écrire.

**I3 · LA NOTE DE CRÉDIT, ET LA LECTURE SEULE QUI POUVAIT ÉCRIRE
(2026-09-23).** Deux choses, et la seconde est la plus grave.

(1) **LA RÉCUPÉRATION DE L'ART. 52 EST SUBORDONNÉE À UNE PIÈCE**, la note de
crédit « annulant et remplaçant la facture initiale » (O.-L. n° 10/001, art. 52
al. 2 ; décret n° 011/42, art. 127, qui veut la facture initiale « barrée et
conservée »). Le module TVA écrivait « OmegaX ne peut pas le vérifier » ; il le
peut désormais pour les notes qu'il émet, et la phrase a changé dans le même
geste. **UNE NOTE DE CRÉDIT PORTE DES MONTANTS POSITIFS, C'EST SA NATURE QUI
PORTE LE SENS** · un montant négatif passerait par tous les totaux et toutes
les mentions du module sans qu'aucun ne soit écrit pour lui. **LES AVOIRS SANS
NOTE SONT SIGNALÉS, PAS RETIRÉS** · la facturation d'OmegaX est facultative, et
une note émise ailleurs est une pièce valable que le logiciel ne voit pas.

(2) **`RolesGuard` LAISSE PASSER TOUTE ROUTE SANS `@Roles`**, c'est son
comportement voulu pour la consultation. Dix contrôleurs l'importaient sans
jamais le poser : cinquante routes d'écriture ouvertes à LECTURE_SEULE. **RÈGLE :
TOUTE ROUTE POST, PUT, PATCH OU DELETE PORTE `@Roles`, OU FIGURE AVEC SON MOTIF
DANS `ecritures-reservees.spec.ts`.** Le rôle se pose ROUTE PAR ROUTE et jamais
sur la classe, qui fermerait aussi la lecture. Aucun spec de service ne pouvait
le voir, puisqu'ils appellent le service sans passer par le contrôleur.

(3) **DEUX RÉINJECTIONS NE COMPILAIENT PAS**, et elles se lisaient au total
des tests (148 et 103 au lieu de 228), pas au mot « failed ». **UN TOTAL QUI
BAISSE EST UNE SUITE QUI N'A PAS TOURNÉ, PAS UN DÉFAUT ATTRAPÉ.** Refaites
avec des mutations qui compilent, attrapées toutes deux.

**TEMPS DE CHARGEMENT · LA DISTANCE, MULTIPLIÉE (2026-09-23).** Le goulot
n'était ni la taille des fichiers ni le serveur, tous deux déjà traités : c'était
le NOMBRE d'allers-retours entre Kinshasa et us-east1 (`docs/temps-de-chargement.md`).
Deux règles en sortent. **(1) UNE LECTURE NE PORTE NI `Content-Type` NI
`X-CSRF-Token`** · ces en-têtes rendent la requête « non simple » et la font
précéder d'un `OPTIONS`, alors que le serveur ne contrôle le CSRF que sur les
méthodes qui modifient. C'est `entetes-requete.ts` qui décide, et un spec le
gèle. **(2) DEUX APPELS INDÉPENDANTS PARTENT ENSEMBLE** · chaque `await` enchaîné
coûte un aller-retour transatlantique. Mesuré : 10 appels dont 5 `OPTIONS` en
3 vagues, contre 5 appels en 2 vagues. **Le simulateur de latence de Chrome ne
retarde pas les `OPTIONS`** : une mesure faite avec lui sous-estime ce qu'ils
coûtent.

**P8 · LE BULLETIN DE PAIE ÉMIS, ET LA LECTURE SEULE QUI NE VOIT PLUS DE
BOUTON QUI ÉCRIT (2026-09-23).** Deux chantiers livrés ensemble.

(1) **LE BULLETIN EST LE DÉCOMPTE ÉCRIT DE L'ART. 103**, que l'arrêté
n° 12/CAB.MIN/ETPS/042 du 8 août 2008, art. 2, définit comme « un des doubles
du livre de paie » (`BulletinPaie`, `personnel/bulletin-paie.ts`). Il FIGE une
simulation que le SERVEUR rejoue · le client n'envoie que ce qui a été saisi,
jamais un montant, et l'écran utilise le MÊME corps pour simuler et émettre.
NUMÉROTATION CONTINUE par dossier (art. 214), jamais réutilisée, annulés
compris. **INDÉLÉBILE** (art. 4 de l'arrêté) : aucune route de modification ni
de suppression, une erreur s'ANNULE avec un motif et la ligne reste. La REMISE
se déclare une fois, jamais dans le futur. TROIS REFUS · un montant non
calculé (impôt, cotisation, net · un chiffre provisoire sur un décompte remis
devient opposable), aucun contrat en cours sur le mois (pas de contrat de
repli, trouvé par réinjection), et un second bulletin actif le même mois. Ce
dernier N'EST PAS une règle du Code, qui dit « à chaque paie » : c'est une
LIMITE DU MOTEUR, déclarée, la retenue de l'art. 119 annualisant le mois. Le
bulletin ne passe aucune écriture et n'est pas certifié conforme au modèle
annexé. **UNE GARANTIE NÉGATIVE VIEILLIT** · l'en-tête du registre disait
« il n'enregistre aucun bulletin de paie », retiré dans le même geste et gelé.

(2) **`peutEcrire` VIT DANS LE CONTEXTE DE SESSION** (`lib/auth.tsx`, admin ou
comptable). Près de quarante fenêtres proposaient leurs boutons d'écriture à
LECTURE_SEULE, que le serveur refusait. `ecriture-masquee.spec.ts` exige de
tout écran qui écrit qu'il LISE `peutEcrire`, ou `estAdmin` s'il figure dans
la liste des écrans dont toutes les écritures sont réservées à
l'administrateur, ou qu'il figure parmi les exemptions motivées. Il a été vu
tomber sur trente-neuf écrans avant le correctif. `estAdmin` seul ne prouve
rien ailleurs · un écran qui masque sa seule action d'administration peut
montrer tout le reste.

**P9 · LA PAIE DU MOIS AU JOURNAL, EN UNE ÉCRITURE (2026-09-24).**
`comptabilisation-paie.ts` additionne, compte par compte, la passation de
chaque bulletin émis du mois, dans les trois temps du Guide (brut, retenues,
patronales). Quatre règles à ne pas défaire. (1) LA PASSATION EST REJOUÉE SUR
LES CHIFFRES FIGÉS DU BULLETIN, jamais relue dans ses lignes stockées · les
montants sont ceux que le travailleur a signés, la règle d'imputation est
celle du jour, et un bulletin émis avant la correction du 24 porterait sinon
l'écriture combinée. (2) UN SEUL BULLETIN REFUSÉ ARRÊTE LE MOIS ENTIER ·
passer les autres ferait entrer une masse salariale amputée d'un salaire sur
une écriture équilibrée. (3) AU CENTIME PAR CONSTRUCTION · chaque ligne de
détail est arrondie, la ligne de total de chaque bloc est leur somme, et
l'écart du 422 avec la somme des nets est montré, jamais logé dans un compte ;
le jeu d'essai prend DEUX bulletins et non trois, trois tiers retombant sur un
entier (vu à la réinjection). (4) `BulletinPaie.ecritureId` LIE chaque bulletin
à son écriture, `onDelete: Restrict` déclaré au schéma · un salaire ne se passe
pas deux fois, la liaison se pose sur les seuls bulletins encore libres et
l'écriture est retirée si un autre clic les a pris entre-temps. L'écriture est
ajoutée à `verifierAucunModuleNeLaTient` ; la passation se DÉFAIT depuis
l'onglet Bulletins tant qu'elle est au brouillard, jamais une fois validée
(AUDCIF art. 22, 2°). Un bulletin passé au brouillard ne s'annule pas seul ;
passé et validé, il s'annule et la proposition du mois le signale comme salaire
encore au journal. Six défauts réinjectés dans la règle, six attrapés.

**Salaire stipulé en dollars · la règle est celle du cabinet, pas d'un texte
(2026-09-24).** Aucun texte du corpus ne fixe le cours de conversion d'une
rémunération en devises pour l'IRPP, la CNSS, l'INPP ou l'ONEM, et le Code du
travail, art. 89, veut la rémunération « stipulée en monnaie ayant cours légal ».
Manasse a tranché : « le taux est le taux actuel, il faudra toujours renseigner
le taux chaque jour ». `personnel/conversion-usd.ts` l'applique et rien d'autre ·
le cours est celui saisi dans Devises pour le JOUR DU CALCUL, au calendrier de
Kinshasa (UTC+1, le jour UTC ferait chercher la veille entre 23 h et minuit), à
la date EXACTE. Jamais le dernier cours connu, qui ne serait pas « actuel » ;
absent, le calcul est REFUSÉ et dit quel cours saisir. Seuls les ÉLÉMENTS se
convertissent, avant tout calcul · assiettes, cotisations, IRPP et passation ne
connaissent que le franc. Le bulletin émis fige le cours (`calcul.conversion`)
et garde la stipulation en dollars dans son entrée. L'art. 89 est rappelé à
chaque calcul.

**Consolidation SYSCOHADA, tranche 1 · le périmètre (2026-09-24).** AUDCIF
Titre II, art. 74 à 98, et D4C ch. XII. SYSCOHADA SEUL · l'art. 3 du SYCEBNL
écarte les art. 73 à 113, et une association avec ses cellules relève du
module groupe, qui n'est pas une consolidation. Le moteur est PUR
(`consolidation/perimetre-consolidation.ts`) et le service le joue AVANT
toute écriture · une participation croisée ou un total au-delà de 100 %
serait sinon accepté en base et ferait tomber la lecture du périmètre entier.
QUATRE RÈGLES À NE PAS DÉFAIRE. (1) Deux pourcentages par participation ·
les DROITS DE VOTE font le contrôle, le CAPITAL fait l'intérêt (ch. XII-5
§ 3). (2) Le contrôle indirect ne passe que par une entité contrôlée
EXCLUSIVEMENT, et l'intérêt ne remonte que par des entités RETENUES · une
entité exclue pour importance négligeable reste contrôlée, seules la perte de
contrôle et les restrictions sévères rompent la chaîne. (3) Rien ne se
présume hors des pourcentages · le contrôle de fait exige les DEUX faits de
l'art. 78, le conjoint un accord, et les exclusions un motif de la liste
FERMÉE de l'art. 96 avec sa justification. (4) L'équivalent en francs du
seuil de 500 000 000 FCFA (art. 95) n'est dans aucune source lue · il se
déclare avec sa source, sans quoi la dispense n'est pas examinée. Les trois
mois de l'art. 97 se comptent de date à date, fin de mois comprise · le
30 septembre mène au 31 décembre. La consolidante est le DOSSIER, jamais une
ligne de table, et le périmètre vit PAR EXERCICE.

**Consolidation SYSCOHADA, tranche 2 · cumul et éliminations (2026-09-24).**
AUDCIF art. 80 à 86, D4C ch. XII-5 et XII-6. Moteur pur
(`consolidation/cumul-consolidation.ts`), balances des filiales importées au
canevas de la balance agrégée, celle de la consolidante lue au grand livre.
CINQ RÈGLES À NE PAS DÉFAIRE. (1) CONSOLIDATION DIRECTE GÉNÉRALISÉE · chaque
entité partage ses capitaux propres au pourcentage d'INTÉRÊT, et la quote-part
d'entrée éliminée avec les titres pèse sur la DÉTENTRICE, qui la partage à son
tour. C'est arithmétiquement la méthode par paliers du § 7, et un test le
prouve sur une chaîne chiffrée à la main · le texte ne décrit la directe que
« sans liens indirects ». (2) Les comptes réciproques s'éliminent sur
l'AGRÉGAT, APRÈS le partage · une vente interne retirée avant ferait glisser du
résultat entre groupe et minoritaires dès que vendeur et acheteur n'ont pas le
même intérêt. (3) L'écart d'acquisition suit TOUJOURS un plan (art. 82) · la
durée « non limitée » du D4C contredit la loi et n'est pas servie ; « non
déterminable » vaut dix ans. Prorata au mois, convention du module des
immobilisations, dite comme telle. (4) Aucun numéro n'est inventé pour les
postes de consolidation · ce sont des CLÉS (ECART_ACQUISITION, TITRES_MIS_EN_
EQUIVALENCE…), le D4C n'imposant aucun plan. (5) Rien ne se déduit · coût des
titres, capitaux propres à l'entrée, dividendes, dépréciation et comptes
réciproques se DÉCLARENT, et une participation retenue sans coût arrête le
calcul en la nommant. REFUSÉS ET DITS · l'entrée en cours d'exercice, l'IP à
deux détentrices, l'entité retenue détenue par une exclue, l'écart négatif
d'une ME. HORS TRANCHE ET DIT À L'ÉCRAN · les écarts d'évaluation (tranche
4), et le dossier OmegaX relié par la console.

**Résultats internes (art. 86, 4°) · tranchés par la loi le 2026-09-24.**
Manasse a demandé de s'en remettre au texte. L'art. 86, 4° rend
l'élimination OBLIGATOIRE ; le D4C (ch. XII-5) la veut TOTALE entre entités
intégrées globalement, au PRODUIT des pourcentages d'intégration avec une
entité intégrée proportionnellement. QUI LA SUPPORTE n'est écrit nulle part ·
OmegaX lit l'art. 85 (le résultat consolidé est fait des « éléments
constitutifs » du résultat de chaque entité, après retraitement) et retraite
le résultat de la VENDEUSE AVANT le partage, qui se répartit alors à son
pourcentage d'intérêt. C'est une LECTURE, dite à l'écran et dans les réserves
du cumul. La marge se DÉCLARE à l'ouverture (réserves) et à la clôture
(actif), nette de sa part amortie · aucune balance ne dit quelle part d'un
stock vient du groupe. Refusée avec une entité mise en équivalence (le § 6
la fait porter sur les titres, hors tranche) et au-delà du solde du compte
d'actif de l'acheteuse. Une marge négligeable peut ne pas être déclarée
(art. 86, dernier alinéa). La durée « non limitée » de l'écart d'acquisition
reste NON SERVIE · l'art. 82 impose « un plan d'amortissement », sans
exception.

**Consolidation SYSCOHADA, tranche 3a · bilan, compte de résultat et note du
périmètre (2026-09-24).** D4C ch. XII-8 § 2, § 3 et § 6. Moteur pur
(`consolidation/etats-consolides.ts`, `note-perimetre.ts`). QUATRE RÈGLES À NE
PAS DÉFAIRE. (1) LA CORRESPONDANCE POSTES/COMPTES N'EST PAS RÉÉCRITE · le D4C
ne donne aucune table de comptes, il regroupe des postes. La balance
consolidée passe par la résolution INDIVIDUELLE du ch. 7
(`resoudreBilanSurLignes`, `resoudreCompteResultatSurLignes`), puis les postes
sont regroupés au modèle consolidé · une seconde table aurait divergé de la
première au premier correctif. (2) LE COMPTE 10 DE LA CONSOLIDANTE SE LIT COMME
DANS SES COMPTES · capital 101 à 104 et 109, primes 105 avec les réserves
consolidées, réévaluation 106 en « Autres capitaux propres » (lecture déclarée).
Une filiale, elle, partage TOUS ses capitaux propres, primes comprises. (3) CE
QUI N'EST PAS CALCULÉ VAUT `null`, JAMAIS ZÉRO · « dont » des
corporelles, résultat par action. Ce qui
est À RETRAITER (ch. XII-3 § 2 · écarts de conversion individuels NON
DÉCLARÉS, comptes sans poste, résultat reçu au 13 ; les provisions
réglementées sont contre-passées depuis la tranche 4b) est montré ET compté
pour que le bilan boucle, et l'état se dit NON PUBLIABLE avec ses motifs. (4) LE COMPARATIF EST UNE SECONDE
CONSOLIDATION, apparié PAR CLÉ · un exercice précédent sans périmètre, ou que
le moteur refuse, laisse la colonne VIDE avec son motif, jamais la mère seule.
La note du périmètre apparie N et N-1 par la DÉNOMINATION (le périmètre est
recréé chaque exercice), code « NC » pour une entité exclue, et nomme entrées
et sorties. Deux lignes du modèle individuel que le modèle consolidé ne porte
pas (quote-part de résultat partagé, participation des travailleurs) sont
montrées à part plutôt que fondues. Totaux des quatre corrigés du cours CPCC
(Bamba Makola) retrouvés · 3 255 000, 3 105 000, 4 820 000, 860 000.

**Consolidation SYSCOHADA, tranche 3b · tableau des flux et variation des
capitaux propres (2026-09-24).** D4C ch. XII-8 § 4 et § 5
(`consolidation/flux-capitaux-consolides.ts`). CINQ RÈGLES À NE PAS DÉFAIRE.
(1) LES FLUX SE LISENT SUR DES MOUVEMENTS · le D4C les veut « bruts en
principe », et une différence de soldes ne rend que la somme d'un emprunt et
de son remboursement. Les mouvements sont cumulés à la fraction comme les
soldes ; une balance de filiale importée à QUATRE colonnes n'en porte pas
(`null`, jamais zéro) et le tableau est REFUSÉ en la nommant. Le canevas
accepte six colonnes, reconnues à leur EN-TÊTE, et refuse la ligne dont
report + mouvements ne donnent pas le solde. (2) LA TABLE DU CH. 5 N'EST PAS
RÉÉCRITE · `resoudreFluxSurLignes` sur la balance consolidée, comme le bilan
passe par la résolution individuelle. (3) LES FLUX AVEC LES ACTIONNAIRES ne se
lisent pas sur les capitaux propres consolidés, qui ne sont plus des comptes ·
capital, prélèvements et dividendes de la CONSOLIDANTE par la même table sur
SES comptes (`lignesConsolidante`), dividendes des MINORITAIRES par la
variation de leurs intérêts, résultat déduit, corrigée du 465 des filiales.
(4) CE QUE CETTE VERSION NE SAIT PAS CHIFFRER REFUSE LE TABLEAU, jamais ne
vaut zéro · un périmètre qui a bougé depuis N-1 (entrée, sortie, méthode,
pourcentage d'intérêt, apparié par la dénomination), un capital de filiale
mouvementé, des titres consolidés mouvementés, un solde au 13. Lire
l'incidence de périmètre comme zéro verserait le prix d'acquisition dans les
flux ordinaires sur un tableau qui boucle. (5) LA CONSOLIDANTE EST LUE AU
LIVRE-JOURNAL SEUL (`balance(…, false)`), comme ses états individuels · le
cumul lisait jusque-là le brouillard, et le tableau des flux, qui relit ses
comptes propres, ne bouclerait plus avec lui. La variation des capitaux
propres ne porte que le bloc N · le bloc N-1 du modèle part de la clôture N-2,
qu'OmegaX ne consolide pas. Sans consolidation N-1, ni l'un ni l'autre ne
s'établit, et le motif est celui de la colonne comparative.

**Consolidation SYSCOHADA, tranche 4a · écarts d'évaluation et impôts
différés (2026-09-24).** AUDCIF art. 82 et 92, D4C ch. XII-3 § 3 et XII-6.
La tranche 4 est découpée · 4a ici, 4b les éliminations de nature fiscale
(provisions réglementées, 478/479 individuels), 4c la conversion des entités
étrangères. CINQ RÈGLES À NE PAS DÉFAIRE. (1) L'ÉCART D'ÉVALUATION PASSE « EN
PRIORITÉ » (art. 82) · les capitaux propres d'entrée sont RÉESTIMÉS de chaque
écart NET de son impôt différé, et l'écart d'acquisition n'est que le reste.
Il est porté par la DÉTENUE avant son partage, parce qu'il appartient aux
majoritaires ET aux minoritaires (§ 3) ; refusé sur une mise en équivalence,
dont les comptes ne sont pas repris ; affecté à un élément IDENTIFIABLE (2, 3,
16 à 19), jamais aux capitaux propres. Son sort se DÉCLARE (amortissable avec
son 28, non amortissable, réalisé à une date), et le moteur comme la
déclaration appellent la MÊME règle (`motifRefusEcartEvaluation`). (2) AUCUN
TAUX N'EST ÉCRIT DANS LE MOTEUR · il se déclare par entité, avec sa source,
« en vigueur à la clôture » · une filiale étrangère n'a pas le taux de la
mère. La consolidante le déclare dans les faits de l'exercice, n'étant pas une
ligne d'entité. (3) TROIS SOURCES D'IMPÔT DIFFÉRÉ, chacune lue au texte · les
écarts d'évaluation (« tous », ch. XII-6 § 1), les marges internes éliminées
(art. 92, 2°, au taux de la VENDEUSE, qui a payé l'impôt), et les décalages et
déficits des comptes INDIVIDUELS, DÉCLARÉS en montants d'impôt parce que leur
base fiscale est dans la liasse et pas dans la balance. JAMAIS sur l'écart
d'acquisition. (4) NULL N'EST PAS ZÉRO · une entité intégrée qui n'a pas
répondu (même un seul champ) rend les impôts différés INCOMPLETS, dit sur la
ligne et en motif de non-publication · zéro est une réponse, l'absence n'en
est pas une. Un IDA déclaré sans le motif qui le rend PROBABLE est refusé. (5)
ACTIF ET PASSIF NE SE COMPENSENT PAS, le D4C n'en disant rien, et rien ne
s'actualise (« actualisation interdite »). Au tableau des flux, l'écart
d'évaluation d'un STOCK sorti diminue la CAFG comme l'élimination des marges
internes · la baisse du stock serait sinon lue comme un encaissement.

**Consolidation SYSCOHADA, tranche 4b · éliminations de nature fiscale et
écarts de conversion individuels (2026-09-24).** AUDCIF art. 86, 3°, et 92,
D4C ch. XII-3 § 2, Titre VII compte 15, Titre VIII ch. 22 § 2.3. CINQ RÈGLES
À NE PAS DÉFAIRE. (1) LES PROVISIONS RÉGLEMENTÉES SONT CONTRE-PASSÉES SANS
DÉCLARATION · le 15 n'est « créé ou augmenté EXCLUSIVEMENT par Dotations HAO »
(851) et « réduit ou annulé EXCLUSIVEMENT par Reprises HAO » (861) ;
l'incidence de l'exercice se LIT donc sur le 851 et le 861 et va au résultat,
le reste aux réserves. Impôt différé PASSIF sur le solde du 15 (« réserves non
libérées d'impôt »), sa part de l'exercice au résultat ; sans taux, la
contre-passation se fait quand même et l'impôt différé est dit incomplet.
(2) LES 478 ET 479 SE RETRAITENT SUR DÉCLARATION de leurs soldes N-1 (actif ET
passif, zéro compris) · sans elle ils restent « à retraiter » et l'état n'est
pas publiable. Tout le 478 et tout le 479 sont annulés ; au résultat, la
VARIATION de la position latente nette (N moins N-1, celle-ci déjà au résultat
consolidé N-1), sur une ligne propre du résultat financier ; aux réserves, la
position N-1 moins la provision d'ouverture. (3) LA PROVISION POUR PERTES DE
CHANGE SE DÉCLARE, jamais devinée dans la balance · au 194, au 4991 ou au 4997,
avec sa dotation et sa reprise de l'exercice, chacune dans SA famille
(6971/7971, 6591/7591, 6791/7791, `FAMILLES_PROVISION_CHANGE`). Une dotation
qu'aucun compte de la balance ne porte est refusée. Les MOUVEMENTS de la
dotation et de la reprise sortent avec elles ; ceux de la provision, compte de
bilan, restent, le tableau des flux la lisant par sa variation. (4) AUCUN
IMPÔT DIFFÉRÉ N'EST CALCULÉ SUR LES ÉCARTS LATENTS · il dépend de leur
traitement fiscal, qu'OmegaX ne tranche pas, et se déclare avec ceux de
l'entité. (5) LES SUBVENTIONS D'INVESTISSEMENT (14) RESTENT SUR LEUR LIGNE,
avec un avertissement · le ch. XII-3 § 2 les range parmi les éliminations
fiscales, le modèle du ch. XII-8 § 2 les garde hors capitaux propres, et les
deux textes ne s'articulent pas.

**Consolidation SYSCOHADA, tranche 4c · conversion des entités étrangères
(2026-09-24).** AUDCIF art. 87, D4C ch. XII-4. CINQ RÈGLES À NE PAS DÉFAIRE.
(1) CHAQUE ENTITÉ DÉCLARE LA MONNAIE DE SA BALANCE, qui doit être sa monnaie
FONCTIONNELLE · `null` n'est pas la monnaie de présentation, et tant qu'une
entité n'a pas répondu l'état n'est pas publiable et le tableau des flux est
refusé. La monnaie de présentation est celle de tenue du dossier consolidant
(« unité monétaire ayant cours légal », art. 87). Une monnaie étrangère se
déclare avec les facteurs qui en font la monnaie fonctionnelle (§ 1). (2)
SEULE LA MÉTHODE DU COURS DE CLÔTURE EST JOUÉE (§ 3) · la méthode temporelle
(§ 2) se fait avant l'import, et une monnaie hyperinflationniste (§ 4) est
refusée. Actifs et passifs au cours de clôture, charges et produits (6 à 8 et
le 13) au cours déclaré pour eux (moyen ou de clôture, le texte admet les
deux), capitaux propres (10 à 12) au cours HISTORIQUE, DÉCLARÉ EN MONTANT
parce qu'aucune balance ne le porte. L'écart est le solde qui rééquilibre la
balance convertie. AUCUN COURS N'EST ÉCRIT dans le moteur. (3) L'ÉCART SE
PARTAGE AU POURCENTAGE D'INTÉRÊT et reste SUR SA LIGNE (« Écarts de
conversion », part du groupe ; celle des minoritaires dans leurs intérêts),
jamais fondu dans les réserves · colonne propre dans la variation des
capitaux propres. En mise en équivalence, la quote-part le suit et il reste
un écart de conversion. (4) L'ÉCART D'ACQUISITION D'UNE ENTITÉ CONVERTIE SE
CONVERTIT AU COURS DE CLÔTURE (§ 3) · ramené à la monnaie de l'entité par le
cours d'entrée déclaré, puis reconverti, la dotation au cours des charges et
produits. Ce que les réserves ont reçu des exercices passés reste à la
valeur d'entrée, faute des cours de chaque exercice (lecture dite dans le
code). (5) CE QUE CETTE VERSION NE SÉPARE PAS REFUSE, jamais ne vaut zéro ·
un écart d'évaluation sur une entité convertie est refusé, et une entité
convertie refuse le tableau des flux, l'incidence des cours (G) n'étant pas
isolée. Sans entité convertie, G vaut zéro et le dit. Les montants déclarés
ailleurs (coût et capitaux propres d'entrée, marges, impôts différés, 478 et
479, réciproques) le sont en monnaie de présentation.

**États IFRS en sus du jeu légal, tranche 1 · état de la situation
financière et compte de résultat (2026-09-25).** AUDCIF art. 73-1, IFRS 18
(`src/modules/ifrs/`). Décidé par Manasse · lancé sans attendre un client coté,
IFRS 18 SEUL (obligatoire aux exercices ouverts dès le 1er janvier 2027, § C1,
appliqué par anticipation avant, et dit), comptes individuels d'abord. CINQ
RÈGLES À NE PAS DÉFAIRE. (1) LE GRAND LIVRE N'EST JAMAIS TOUCHÉ
(`docs/decision-multi-classification.md`) · le jeu IFRS est la balance LÉGALE
(`chargerLignes`, livre-journal seul) projetée par des RÈGLES DE
CORRESPONDANCE déclarées (préfixe → rubrique, le plus long préfixe l'emporte),
plus des RETRAITEMENTS déclarés, écritures équilibrées dans leurs tables. Un
spec gèle l'ensemble exact des fichiers qui nomment ces tables · le service
IFRS et la liste du cloisonnement, aucun état légal. (2) OMEGAX N'ÉCRIT AUCUNE
RÈGLE · classer en catégories opérationnelle, investissement et financement
dépend de l'activité principale (§ 49 à 66), que seul le cabinet connaît, et
qui se DÉCLARE (non déclarée, ou « financer des clients », non servie ici · non
publiable). (3) UN COMPTE DE GESTION VA AU RÉSULTAT, UN COMPTE DE BILAN À LA
SITUATION · la même règle (`motifRefusRegle`) à la porte et au calcul ; un
reclassement de l'un vers l'autre passe par un retraitement, jamais par une
correspondance qui le cacherait. Chaque retraitement porte la norme et le
paragraphe qui le fondent, et s'équilibre. (4) CHAQUE RUBRIQUE PORTE SON
PARAGRAPHE (§ 75, § 80, § 103, § 104) · charges PAR NATURE (§ 78 a), la
présentation par fonction demandant une affectation qu'aucune balance ne
porte ; deux postes supplémentaires (autres produits, autres charges
opérationnels) dits comme tels (§ 24, § B78). Sous-totaux du § 69. (5) CE QUI
MANQUE EST MONTRÉ ET COMPTÉ · un compte sans rubrique reste sur une ligne
« sans rubrique » pour que l'état boucle, et le rend non publiable ; trois
colonnes par poste (SYSCOHADA reclassé, retraitements, IFRS) et un
rapprochement du résultat et des capitaux propres. Le jeu reste NON PUBLIABLE
tant que manquent l'état du résultat global, le tableau des flux (IAS 7),
les variations des capitaux propres, les notes et la première application
(IFRS 1) · tranches suivantes.

**États IFRS, tranche 2 · résultat global et variations des capitaux propres
(2026-09-25).** IFRS 18 § 12 b, § 86 à 95 et § 107 à 112. CINQ RÈGLES À NE PAS
DÉFAIRE. (1) LES AUTRES ÉLÉMENTS DU RÉSULTAT GLOBAL N'ONT AUCUN COMPTE AU
SYSCOHADA · ils n'entrent que par RETRAITEMENT déclaré, avec la norme qui les
fait sortir du résultat net (§ B86-B87) ; une règle de correspondance vers eux
est refusée, une correspondance projette un solde et l'OCI est un flux. Deux
catégories (§ 88, recyclables d'abord), deux postes chacune (§ 89), nets
d'impôt (§ 94 a) avec la mention du § 93. (2) L'OCI DE L'EXERCICE a sa ligne de
capitaux propres (`SF_OCI_EXERCICE`) et son cumul sa composante
(`SF_AUTRES_COMPOSANTES_CP`, § 111) · sans elle, une réévaluation grossirait
l'actif sans contrepartie. (3) L'OUVERTURE DE LA VARIATION EST LA CLÔTURE IFRS
N-1, calculée avec SES retraitements · les effets IAS 8 déclarés remontent au
solde publié (retraitée moins effets), ils ne s'ajoutent jamais une seconde
fois. (4) RIEN NE SE DÉDUIT DE LA DIFFÉRENCE · apports, distributions,
transferts et effets IAS 8 se DÉCLARENT (`MouvementCapitauxPropresIfrs`, avec
justification) ; ce que rien n'explique reste sur « écart non expliqué » et rend
le jeu non publiable. Des transferts qui ne se soldent pas aussi. (5) DEUX
BLOCS, N ET N-1 · le comparatif du § 10 f) part de la clôture N-2, et sans elle
le bloc n'est pas rendu, avec son motif. Pas d'attribution aux participations
ne donnant pas le contrôle (§ 87, § 107 a) · des comptes individuels n'en ont
pas. Restent : notes, puis la version consolidée · IAS 7 est la tranche 3,
IFRS 1 la tranche 4.

**États IFRS, tranche 4 · première application (IFRS 1) (2026-09-25).**
IFRS 1 § 3 à 26 et annexe A (`ifrs/premiere-application-ifrs.ts`). CINQ RÈGLES
À NE PAS DÉFAIRE. (1) LA PREMIÈRE APPLICATION SE DÉCLARE · le premier exercice
IFRS, ou le fait que l'entité présente déjà des états conformes (§ 4 et 5),
jamais les deux ; non déclarée, le jeu n'est pas publiable. (2) LA DATE DE
TRANSITION est l'ouverture de l'exercice comparatif (annexe A, un seul
comparatif au § 21), et l'état d'ouverture (§ 6) est son report à-nouveau des
classes 1 à 5 projeté par les mêmes règles · les classes 6 à 8 d'un exercice
clos portent la contrepassation de clôture, pas une ouverture. (3) UN
AJUSTEMENT DE TRANSITION VA AUX CAPITAUX PROPRES ET À ELLES SEULES (§ 11) · il
vit sur l'exercice comparatif sous `aLaTransition` et n'entre JAMAIS dans ses
retraitements, qui le compteraient deux fois dans la clôture du comparatif ;
ce qu'il laisse au bilan se REDÉCLARE en retraitement de cet exercice, le
module ne reportant rien d'un exercice à l'autre. (4) LES RAPPROCHEMENTS DU
§ 24 PARTENT DU CHIFFRE PUBLIÉ · le total CP du bilan légal, lu par
`resoudreBilanSurLignes` et jamais par une seconde table ; ce que les règles
déplacent hors des capitaux propres (une subvention au 14) est une ligne de
RECLASSEMENT, puis une ligne par retraitement, les méthodes avant les erreurs
(§ 26), et le reste un écart qui rend le jeu non publiable. Le § 24 b part du
résultat net, le SYSCOHADA ne publiant pas de résultat global, et compte
l'OCI des retraitements. (5) SUR LE PREMIER EXERCICE, LE BLOC COMPARATIF DES
CAPITAUX PROPRES PART DE L'ÉTAT D'OUVERTURE, jamais de la clôture N-2, qui n'a
jamais été IFRS. RÉSERVE · le texte d'IFRS 1 du corpus précède l'annexe D
d'IFRS 18, qui le modifie. Le § 25 se lit au rapprochement par activité du
tableau des flux (tranche 3).

**États IFRS, tranche 3 · le tableau des flux (IAS 7 modifiée par IFRS 18)
(2026-09-25).** `ifrs/flux-tresorerie-ifrs.ts`. LA SOURCE A ÉTÉ TROUVÉE, PAS
DEMANDÉE · le corpus porte IAS 7 d'avant IFRS 18, et le règlement (UE)
2026/338 du 13 février 2026 publie au JOUE, en français officiel, les
paragraphes qu'IFRS 18 y modifie (§ 64 · « L'entité qui applique IFRS 18 doit
appliquer ces modifications »). Extrait conservé dans
`docs/sources/ias7-modifie-par-ifrs18-reglement-ue-2026-338.md`. CINQ RÈGLES À
NE PAS DÉFAIRE. (1) LE TABLEAU PART DES FLUX RÉELS DU GRAND LIVRE · le tableau
SYSCOHADA du ch. 5 (`resoudreFluxDetailleSurLignes`), jamais une table
réécrite, puis reclassé. Un retraitement IFRS n'est dans aucun journal et ne
déplace AUCUNE trésorerie · son effet au résultat d'exploitation est retiré sur
sa ligne (§ 20 b), et un retraitement qui touche la trésorerie rend le tableau
non publiable. (2) MÉTHODE INDIRECTE À PARTIR DU RÉSULTAT D'EXPLOITATION (§ 18
b, § 20), plus du résultat net. La CAFG légale (FA) est ADDITIVE compte par
compte · elle se répartit par la catégorie où les règles rangent chaque compte
de gestion, et la somme est CONTRÔLÉE, jamais présumée. Chaque catégorie porte
sa trésorerie dans son activité · intérêts versés au financement, intérêts et
dividendes reçus à l'investissement (§ 34A), à condition que les règles
suivent IFRS 18 ; dividendes versés au financement (§ 33A) ; impôts à
l'exploitation (§ 35). Un compte de gestion sans règle reste à l'exploitation,
comme au compte de résultat. (3) LA TRÉSORERIE EST CELLE D'IAS 7 · les comptes
rangés en « Trésorerie », plus les découverts si l'entité DÉCLARE qu'ils font
partie intégrante de sa gestion (§ 8). Un compte de la trésorerie légale hors
de ce périmètre porte sa variation en investissement (placement, § 7) ou en
financement (crédit de trésorerie) ; un compte rangé en trésorerie sans être de
la trésorerie légale rend le tableau non publiable, son flux étant déjà ailleurs
à une place inconnue. Rapprochement § 45 avec la situation, découverts inclus
nommés. (4) RIEN NE SE DÉDUIT · la présence de devises et l'effet de change sur
la trésorerie (§ 28) se DÉCLARENT (`EffetChangeTresorerieIfrs`, par exercice,
avec la catégorie où l'écart est comptabilisé, qu'il quitte pour sa propre
ligne) ; non déclarés, le tableau n'est pas publiable. (5) COMME LE TABLEAU
SYSCOHADA, IL EXIGE L'EXERCICE PRÉCÉDENT, et le comparatif N-2 · jamais un
report à-nouveau pris pour une variation de poste. Les intérêts et dividendes
sont lus pour leur montant COMPTABILISÉ · l'écart avec l'encaissé reste dans les
variations du tableau de départ, et c'est dit. Dix-sept mutations, toutes
tuées, dont six après ajout des tests manquants (découverts côté service,
compte sans règle, dividendes, effet de change au rapprochement).

**États IFRS, tranche 5 · les notes (IFRS 18 § 113 à 132, IAS 8)
(2026-09-25).** `ifrs/notes-ifrs.ts`. Source · le règlement (UE) 2026/338, texte
français officiel, extrait conservé dans
`docs/sources/ifrs18-notes-et-ias8-reglement-ue-2026-338.md`. CINQ RÈGLES À NE
PAS DÉFAIRE. (1) LE § 113 B N'EST PAS SERVI, ET C'EST DIT · les informations
que chaque AUTRE norme exige (IFRS 7, 16, IAS 12, IAS 7 § 44A…) dépendent des
normes qui s'appliquent au dossier. Le jeu reste NON PUBLIABLE sous ce motif
précis, jamais sous un « jeu incomplet » sans objet. (2) LA DÉCLARATION DE
CONFORMITÉ DU § 6B N'EST JAMAIS IMPRIMÉE SUR UN JEU NON PUBLIABLE · « que s'ils
sont conformes à toutes les dispositions ». Déclarée, elle est rendue SUSPENDUE
avec ses motifs, et elle se pose EN DERNIER parce qu'elle dépend de tout ce que
les autres notes ont trouvé. (3) RIEN NE SE DÉDUIT DE CE QU'AUCUN LIVRE NE
PORTE · société mère, continuité, méthodes, jugements, estimations, mesures de
la performance, gestion du capital, actions, dividendes proposés se DÉCLARENT
(`NotesIfrs`, JSON par exercice, lu par `normaliserDeclarationsNotes` à la
porte comme au calcul). `null` n'est pas « non » · zéro dividende est une
réponse, l'absence n'en est pas une. Les données quantitatives du capital
(§ 127 b) ne sont pas remplacées par le total des capitaux propres · il est
montré À CÔTÉ, pour rapprochement. La forme juridique ne se prend pas dans
l'énumération du dossier. (4) CE QUI SE CALCULE · la composition des postes
(comptes, retraitements, montant, N et N-1, dans le sens de l'état), les
renvois du § 114 (poste → notes), l'analyse des autres éléments du résultat
global avec leur origine (§ 109, l'impôt du § 93 se déclarant PAR POSTE
présenté), et la valeur des mesures de la performance · sous-total de référence
du jeu plus éléments déclarés, le comparatif retrouvé par l'INTITULÉ dans les
déclarations N-1, jamais recopié de N (§ 124 c, § 125). (5) « REPRENDRE N-1 »
COPIE DANS LE FORMULAIRE ET N'ENREGISTRE RIEN · une méthode ou un jugement de
l'an dernier peut ne plus valoir. IAS 8 § 6E à 6J (écart à une disposition) est
nommé non servi dans la note de base.

**États IFRS consolidés, tranche C1 · situation, résultat et résultat global
(2026-09-25).** `ifrs/etats-ifrs-consolides.ts`. Sources lues · IFRS 18 § 76,
§ 87, § 104, § 107 a ; IFRS 10 § 19, § 22, § B86 à B96 ; IFRS 3 § 19, § 32,
§ 34, § B63 a ; IAS 36 § 90 ; IAS 21 § 39 c et § 41. CINQ RÈGLES À NE PAS
DÉFAIRE. (1) LA BALANCE CONSOLIDÉE N'EST PAS RECALCULÉE · c'est celle du D4C
(`CumulService.cumul`), projetée par le MÊME moteur que les comptes individuels
(`construireEtatsIfrs` avec `OptionsConsolidation`), et ce qui rend la
consolidation incomplète (conversion, impôts différés) rend le jeu IFRS non
publiable. Un second moteur divergerait du premier au premier correctif. (2)
LES COMPTES se rangent par les règles du dossier (uniformité, IFRS 10 § 19) ;
LES POSTES de consolidation par une table à deux étages · rangés par OmegaX
quand IFRS 18 nomme la ligne (`POSTES_RANGES`, avec leur paragraphe), DÉCLARÉS
sinon (`RegleConsolidationIfrs`), la même règle à la porte et au calcul
(`motifRefusRegleConsolidation`). (3) RETRAITEMENTS INDIVIDUELS ET CONSOLIDÉS
NE SE LISENT JAMAIS L'UN POUR L'AUTRE · `RetraitementIfrs.consolide`, filtré
dans les deux sens · l'annulation d'un amortissement d'écart d'acquisition n'a
aucun sens sur la balance de la mère seule, et un retraitement individuel
appliqué au consolidé compterait deux fois ce que le cumul contient déjà. (4)
LA PART DES MINORITAIRES D'UN RETRAITEMENT SE DÉCLARE, effet par effet (résultat,
OCI, capitaux propres), zéro compris, du signe de l'effet et sans le dépasser
(IFRS 10 § B94, `motifRefusPartsMinoritaires`) · aucun livre ne dit à quelle
entité un retraitement se rapporte. Refusée sur un retraitement individuel. La
part légale vient du partage du D4C, jamais d'un pourcentage. (5) TROIS ÉCARTS
D4C / IFRS NOMMÉS, JAMAIS CORRIGÉS EN SILENCE · l'écart d'acquisition amorti
(AUDCIF art. 82 contre IFRS 3 § B63 a et IAS 36 § 90) et l'écart négatif étalé
(IFRS 3 § 34) rendent le jeu non publiable tant qu'aucun retraitement ne touche
leur rubrique ; les écarts de conversion portés en capitaux propres (IAS 21
§ 39 c et § 41, OCI avec la part des minoritaires) ne sont pas servis. NON
SERVIS ET DITS sur le jeu (`MOTIFS_CONSOLIDES_NON_SERVIS`) · tableau des flux,
variation des capitaux propres avec sa colonne des minoritaires (§ 107 a),
notes dont IFRS 12 (§ 113 b), première application consolidée (un ajustement de
transition consolidé est refusé à la porte).

**Tableau des flux SYSCOHADA · le compte trop agrégé, que « non ventilé »
ne voyait pas (2026-09-25).** Trouvé en passant au moteur la balance d'un
expert tenue en comptes génériques (481, 81, 82). La table du ch. 5 lit des
SUBDIVISIONS · 4812 pour les fournisseurs d'investissement, 812 et 822 pour
les cessions. Un 48100000 n'est pas « non ventilé », sa racine 48 est connue
du bilan : il est TROP AGRÉGÉ, le tableau ne le lit pas, et l'écart de
bouclage restait sans cause nommée. `comptesTropAgreges` liste tout compte
mouvementé ou soldé dont le tableau lit une subdivision plus fine
(`subdivisionsLuesParLeTft`, zéros de complément retirés avant la
comparaison), à l'écran et dans le contrôle du classeur. Le logiciel NOMME,
il ne ventile pas · répartir un 481 entre 4811 et 4812 est une question de
nature d'opération que seul le cabinet connaît.

**Questionnaire de révision par cycle · vingt-quatre items du CPCC, et le
reste assumé.** Le séminaire porte DEUX checklists, § VI « vérification de
l'inventaire physique » (immobilisations, stocks, caisses) et § VII
« vérification de l'inventaire documentaire » (banques, dettes, provisions,
créances). Sept rubriques, VINGT-QUATRE items interrogatifs, dix-sept
impératifs. Rien d'autre : il n'a de questions ni sur les ventes, ni sur les
achats hors circularisation, ni sur la paie, ni sur les capitaux propres, ni
sur l'État, ni sur les régularisations. Une découpe « par cycle » qui lui
serait attribuée serait une invention · le relevé de manques en portait une, et
elle venait de la lecture de l'auteur du skill, pas du CPCC.

D'OÙ LA RÈGLE DU CATALOGUE, la seule qui compte : CHAQUE ITEM PORTE SON
ORIGINE, et son code la préfixe. « CPCC-… » veut dire que le libellé est celui
du séminaire à la virgule près, avec le renvoi au paragraphe ; « VMG-… » que la
question est de l'éditeur, avec un fondement nommé (un article de l'AUDCIF, ou
l'item du CPCC dont elle est la transposition). Six libellés sensibles sont
figés mot pour mot par un test, et le décompte de vingt-quatre est EN DUR pour
qu'on rouvre le fichier le jour où quelqu'un ajouterait une question « du
CPCC » qui n'y est pas. Les vingt-cinq items de VMG portent tous sur des cycles
que le séminaire ne couvre pas · un test interdit d'en glisser un dans ses sept
rubriques, où il deviendrait indiscernable.

TROIS PROPRIÉTÉS QUE LA SOURCE PORTE ELLE-MÊME, et qu'un moteur qui les
ignorerait trahirait sans rien casser. LE CHAÎNAGE · « Si oui, une attestation
a-t-elle été établie ? » ne se pose qu'après un comptage tenu, et « Si non,
comment a-t-on procédé pour la sélection des fournisseurs à circulariser ? »
est la seule chaîne « Non → suite » explicitement écrite du corpus, que l'item
des créances retourne. LA POLARITÉ · vingt-trois items font du « Non »
l'exception, UN SEUL fait du « Oui » l'anomalie : « Y a-t-il un chevauchement
avec l'exercice en cours sur le solde d'ouverture ? ». Un moteur qui compterait
les « Non » rendrait vert le seul item du CPCC qui porte sur la correspondance
des bilans, et rouge nulle part ailleurs. LES ITEMS COMPOSITES · « A-t-on tenu
compte de la caisse siège, de la caisse agence, de la caisse de secours ? » est
UNE question et TROIS objets ; le libellé reste entier, les objets sont listés
à côté, pour qu'un « Oui » global ne masque pas la caisse oubliée.

QUATRE REFUS. Une forme ne s'échange pas contre une autre · « À quels moments
les biens ont-ils été valorisés ? » appelle une DATE, « Quelles dispositions
assurent le cut-off ? » un TEXTE, « Vérifier les titres de propriété » un
RENVOI de travaux, et un « Oui » à l'une des trois est un acquiescement qui ne
répond pas à la question posée. Un item que son parent n'ouvre pas ne se répond
pas · la réponse serait orpheline et compterait dans le taux. Une exception
sans commentaire ne clôt pas le questionnaire · une case rouge sans phrase ne
dit rien à celui qui reprendra le dossier, et c'est lui que CPCC-PRO-6 envoie
« faire le suivi des faiblesses relevées lors de l'audit précédent ». Et un
item ouvert sans réponse ne clôt pas non plus · un questionnaire à trous ne se
distingue pas d'un questionnaire favorable.

AUCUN SEUIL N'EST POSÉ, et c'est délibéré. CPCC-CRE-5 demande « Combien de
réponses a-t-on reçues ? Si le pourcentage est INSIGNIFIANT, a-t-on relancé ? »
sans jamais chiffrer « insignifiant ». En inventer un ferait passer pour une
exigence du séminaire un nombre qu'il n'a pas écrit · un test interdit toute
constante de seuil et tout pourcentage en dur dans les deux fichiers.

Le taux de réponse ne compte QUE les questions. Les dix-sept impératifs du
CPCC sont comptés à part : les mélanger ferait monter un pourcentage que
personne ne pourrait plus lire. Le filtre par référentiel est au niveau de
l'ITEM et non de la fenêtre · un seul en porte un, les contributions
volontaires en nature, dont les comptes 900 à 914 n'existent qu'au SYCEBNL, la
classe 9 du SYSCOHADA étant celle de la comptabilité analytique.

Le caractère « — » de CPCC-PRO-5 est celui du texte source et se conserve, pour
la même raison que les 97 de `regles-comptes-sycebnl.ts` : le remplacer
falsifierait une citation, et c'est sa fidélité qui la rend opposable. Ne pas
le « corriger » · un test le surveille.


**Acomptes provisionnels · la saisie contre le compte 4492, et le solde négatif
qui n'est pas un remboursement.** `acomptesVerses` était une SAISIE que rien ne
confrontait à la comptabilité. Le compte 4492 « État, avances et acomptes
versés sur impôts », lui, est débité des sommes effectivement versées à l'État
par le crédit de la trésorerie (AUDCIF Titre VII, compte 44). Les deux peuvent
différer de plusieurs millions sans qu'aucune balance ne cesse de boucler : le
solde à payer est faux de l'écart, la déclaration part avec, et l'art. 98 bis
LPF punit « le défaut ou l'insuffisance de paiement de l'acompte provisionnel »
d'« une amende égale à 50 % du montant de l'acompte non versé ». Le
rapprochement est désormais rendu par `suiviAcomptes` et affiché en rouge sous
le solde.

LE PRÉFIXE EST `4492`, PAS `449`. Le compte 449 loge sept choses différentes,
toutes débitrices : obligations cautionnées (4491), acomptes sur impôts (4492),
fonds de dotation et subventions à recevoir (4493 à 4497). Prendre `449` ferait
passer une subvention ATTENDUE pour un acompte VERSÉ. Cette mutation-là a
SURVÉCU à la première série de tests, et c'est elle qui a fait écrire les deux
tests du bloc « le 4492 et lui seul ».

UN EXCÉDENT D'ACOMPTES N'EST PAS UN REMBOURSEMENT, et l'écran disait « crédit
d'impôt », ce qui est un autre objet · un crédit d'impôt est une créance sur le
Trésor qui s'impute de plein droit. L'art. 57 ter LPF dit : « Si les acomptes
provisionnels versés par le contribuable sont supérieurs à l'impôt dû pour la
même année, les crédits constatés à son compte courant fiscal PEUVENT, À SA
DEMANDE, servir au paiement d'autres impôts et droits dus. » Un crédit au
compte courant fiscal, dont l'emploi suppose une demande, et qui s'impute sur
d'AUTRES impôts au lieu de revenir en trésorerie. La nuance décide si le
cabinet inscrit ou non un encaissement à son budget.

LE MODULE NE CALCULE AUCUNE AMENDE et ne dit jamais qu'un acompte est « non
versé » : établir l'insuffisance suppose de connaître la base légale (l'impôt
déclaré de l'exercice précédent, ou l'impôt reconstitué d'office), et c'est un
acte de l'Administration. Il rapproche deux chiffres du dossier et nomme
l'exposition. Un test le vérifie sur le texte produit.

**Charges à payer et produits à recevoir · l'autre moitié du rattachement, et
elle ne marche pas comme la première.** `TypeRegularisation` ne portait que ce
qui est DÉJÀ comptabilisé et déborde sur l'exercice suivant (476/477, découpé au
prorata des jours). Il lui manquait le symétrique : ce qui n'est PAS
comptabilisé et appartient ENTIÈREMENT à l'exercice · le service est fait, seule
la facture manque.

TROIS DIFFÉRENCES DE MÉCANISME, et chacune est un défaut si on l'ignore.

RIEN NE SE PRORATISE. Proratiser une charge à payer la réduirait à la fraction
qui déborde la clôture, c'est-à-dire le plus souvent ZÉRO, puisque sa période se
termine AVANT. La charge disparaîtrait du résultat de l'exercice qui la
supporte, l'écriture s'équilibrerait, la balance boucherait. Le refus le dit et
propose la vraie réponse : si une part concerne un autre exercice, ce sont DEUX
opérations.

LE SENS S'INVERSE. Sur une charge constatée d'avance on CRÉDITE le 6x pour l'en
retirer ; sur une charge à payer on le DÉBITE pour l'inscrire. Servir l'un pour
l'autre améliore le résultat au lieu de le grever · deux fois le montant
d'erreur, sur une écriture parfaitement équilibrée.
`debiteLeCompteDeGestion()` tranche pour les cinq types, et un test tombe si un
sixième est ajouté sans que son sens soit décidé.

LA CONTRE-PASSATION EST À L'OUVERTURE, DES DEUX CÔTÉS, sans que le référentiel
ait son mot à dire · les deux textes emploient la même phrase dans la fiche de
leurs comptes 40 et 41 : « À l'ouverture de l'exercice, ces écritures sont
contre-passées […] ou soldées par le compte fournisseur à la réception de la
facture ». C'est une extourne d'estimation, pas une reprise de quote-part : la
règle du 476/477, où le SYCEBNL reprend à la clôture, ne s'y applique pas.

LE COMPTE DE RATTACHEMENT N'EST PAS LIBRE, et il dépend de la NATURE DU TIERS ·
408 fournisseurs, 418 clients et adhérents, 4286/4287 personnel, 4386/4387
organismes sociaux, 4486/4487 État. Aucun compte fourre-tout. Deux couples sont
refusés parce qu'aucun plan ne les prévoit : un produit à recevoir sur un
fournisseur (c'est une créance sur fournisseur, 409) et une charge à payer sur
un client (c'est une dette envers un client, 419).

ET LE 4181 NE VEUT PAS DIRE LA MÊME CHOSE DES DEUX CÔTÉS · même signature que
le 192 du registre des provisions, au même endroit du plan. Le SYSCOHADA écrit
« 4181 Clients, factures à établir ». Le SYCEBNL réserve le 4181 aux
« Adhérents, APPELS DE FONDS à établir » et met les factures à établir au 4182.
Une facture à établir rangée au 4181 dans une association devient une créance de
cotisations sur des adhérents qui ne doivent rien : le compte existe, la balance
boucle, et la Note annexe le publie.

**Balance âgée · l'antériorité ne veut pas dire la même chose partout.** Le
tableau était borné au crédit commercial (40 et 41), où une ligne ancienne est
un délai de règlement dépassé : le crédit est accordé pour un temps, et l'état
mesure ce temps. Quatre périmètres s'y ajoutent · personnel (42), organismes
sociaux (43), État (44) et débiteurs et créditeurs divers (47).

L'ÉLARGIR SANS RIEN DIRE AURAIT ÉTÉ LE DÉFAUT. Sur un 42, un 43 ou un 44 il
n'y a AUCUN crédit commercial : la dette naît à une date et se règle à une
échéance légale, et un solde au 31 décembre y est la situation NORMALE · la
paie de décembre versée en janvier, les cotisations du quatrième trimestre
déclarées après la clôture. Le même tableau se lirait comme un retard de
règlement là où il n'y a qu'un calendrier. D'où une phrase par périmètre,
rendue avec l'état et affichée au-dessus du tableau · c'est elle qui décide si
le cabinet appelle son client ou classe la ligne.

LES COMPTES DE TVA SONT ÉCARTÉS DU 44, et c'est le refus de ce chantier. Les
443, 444, 445 et 446 ne portent ni créance ni dette d'échéance : ce sont les
termes d'une LIQUIDATION périodique, remise à zéro par la déclaration du mois.
Les vieillir afficherait une antériorité sur des lignes qui n'ont pas
d'échéance, et chaque dossier verrait un « retard » massif sur le compte le
plus mouvementé de sa classe 4. Le suivi de la TVA a son module.

LE 47 EST LE SEUL DES QUATRE OÙ L'ANTÉRIORITÉ GARDE TOUT SON SENS. Il porte
« les dettes et créances AUTRES que celles liées à l'activité » (AUDCIF
Titre VII, compte 47) : rien ne les fait sortir toutes seules, une ligne
ouverte depuis plusieurs exercices y est le cas ordinaire, et la question du
réviseur est de savoir si elle correspond encore à quelque chose. C'est
exactement ce que le justificatif de solde avait exposé sur le 469150 du
dossier ouvert au Drive.

`TOUS` RESTE 40 ET 41, inchangé · c'est le sens usuel de l'expression, et
c'est le périmètre dont la performance est mesurée (6,7 s sur un million de
lignes, `docs/capacite-mesuree.md`). Les autres se demandent nommément :
élargir le défaut aurait alourdi l'écran le plus consulté sans que personne ne
l'ait demandé.

**Réévaluation · le chiffre du relevé de manques était faux, et c'est la
vérification qui l'a dit.** Le relevé annonçait « une déclaration spéciale
avant le 30 avril » et « une astreinte de 100 000 CDF par jour ». Les deux
viennent de l'Ordonnance-loi n° 89/017 du 18 février 1989, art. 16 et 20 ·
ABROGÉE par la loi n° 23/053, art. 152 point 3, avec effet au 1er janvier 2026
(art. 153). Le texte en vigueur dit « AU PLUS TARD le 30 avril » (art. 136) et
« 300.000,00 Francs congolais PAR JOUR » (art. 138). Les coder tels quels
aurait produit le § 10 bis dans sa forme la plus coûteuse : un signalement
plausible, sourcé, faux, et une sanction sous-évaluée d'un facteur trois.

`DECLARATION_REEVALUATION_A_DEPOSER` est de gravité INFORMATION et ne CONSTATE
jamais le manquement · le dépôt est un fait externe qu'aucune comptabilité ne
porte. Il est borné aux exercices clos à compter du 1er janvier 2026, et il
porte la réserve sur les entités exemptées au lieu de la taire : l'art. 136
vise « toutes les entreprises » sans définir le mot, et l'ordonnance-loi
abrogée visait expressément les exonérés, ce que la loi nouvelle ne reprend
pas.

LE CONTRÔLE S'ARRÊTE AU 106 et ne descend pas à ses subdivisions, pour la
TROISIÈME fois la même raison qu'au 192 du registre des provisions et au 4181
des produits à recevoir · un numéro identique, deux sens. Le 1061 est la
réévaluation LÉGALE au SYSCOHADA et « sur des biens SANS DROIT DE REPRISE » au
SYCEBNL ; le 1062 est LIBRE d'un côté, « AVEC DROIT DE REPRISE » de l'autre.
La conséquence est fiscale, le prélèvement libératoire de l'art. 129 différant
selon légale ou libre.

**Textes abrogés · le balayage du 2026-09-06, et le seul défaut qu'il a trouvé.**
Les trente-deux textes cités dans `src/`, `client/src/`, `prisma/` et ce fichier
ont été confrontés aux clauses d'abrogation. L'art. 152 de la loi n° 23/053 en
abroge quatre : l'O.-L. n° 69/007, les TITRES III ET IV de l'O.-L. n° 69/009,
l'O.-L. n° 89/017 et l'O.-L. n° 13/006. Le 89/017 et le 69/007 ne sont cités
qu'en tant qu'abrogés, le 13/006 pas du tout, et les deux citations de l'art. 42
et 42 bis du 69/009 (`parametres-fiscaux.ts`) nomment expressément le régime
mort. Aucun texte abrogé n'est présenté comme vivant.

CE QUI L'ÉTAIT, C'EST UNE CITATION · la retenue sur les revenus locatifs
rattachait son taux de 20 % au « décret-loi n° 109/2000 », qui est un texte
MODIFICATIF et ne porte aucun des deux articles 11 en jeu : le 20 % appartient à
l'art. 11 de la loi n° 83/004 du 23 février 1983, le 22 % à l'art. 11 de l'O.-L.
n° 69/009. Sixième occurrence du piège « un numéro, deux sens » après le 192, le
4181, le 1061/1062, le 38/37 et le 397 · cette fois sur un numéro d'ARTICLE.

ET L'ABROGATION DU 69/009 EST PARTIELLE, ce que la ligne dit désormais. Son
TITRE II porte l'impôt sur les revenus locatifs et SURVIT · la loi n° 23/053
exclut d'ailleurs ces revenus des catégories de l'IRPP. Un relecteur qui sait
le 69/009 « abrogé » supprimerait une retenue en vigueur ; deux tests de
`retenues.spec.ts` l'en empêchent. À signaler à Manasse côté compétences : le
fichier `ol-69-009-1969-impots-cedulaires-texte-origine.md` annonce en tête
« Statut : ABROGÉ » pour l'ordonnance entière, là où l'art. 152 point 2 ne vise
que « les dispositions des titres III et IV ».

**Excédent d'inventaire · l'art. 43 ne régit pas la caisse.** Le refus de
comptabiliser un excédent tient, mais sa citation était fausse sur un compte
57, et corrigée le 2026-09-06. L'art. 43 oppose la « valeur d'inventaire » à
la « valeur d'entrée » DU MÊME BIEN et débouche sur un amortissement ou une
dépréciation : il traite d'une variation de VALEUR. Un excédent de caisse est
une variation de QUANTITÉ, et la fiche du compte 57 dit l'inverse dans les
DEUX plans, mot pour mot · « le solde du compte caisse doit toujours
correspondre exactement à la somme disponible réellement ». Aucune source lue
ne dit pour autant ce qu'il faut créditer · ni produit, ni dette, ni compte
d'attente, et aucun plan ne porte de compte « écart de caisse ».
`motifRefusExcedent()` nomme donc la tension sur un 57 et cite l'art. 43
partout ailleurs. Citer un article sur le mauvais cas est la forme la plus
discrète du § 10 bis : le message est plausible, sourcé, et personne ne le
vérifie.

**Correspondance bilan de clôture / bilan d'ouverture · la convention et ses
DEUX seules exceptions.** « Le bilan d'ouverture d'un exercice doit
correspondre au bilan de clôture de l'exercice précédent » (AUDCIF art. 34 et
Titre V · SYCEBNL art. 16, 4) et cadre conceptuel § 3.3.1.2.4). Conséquence
écrite dans les deux textes : on ne peut PAS imputer directement sur les
capitaux propres les incidences d'un changement de méthode ni les charges et
produits d'exercices antérieurs omis · ils transitent par le compte de résultat
du nouvel exercice.

DEUX EXCEPTIONS, ET DEUX SEULEMENT, chacune nommée par les deux textes : le
CHANGEMENT DE MÉTHODE à impact fort significatif, et la CORRECTION D'ERREUR
SIGNIFICATIVE d'un exercice antérieur. Elles ont un chemin déclaré depuis le
2026-09-03 (`EcritureService.imputerAuxCapitauxPropresDOuverture`, fenêtre
Exercices, ADMIN_CABINET seulement), qui porte le motif et la JUSTIFICATION ·
obligatoire, parce que les deux textes exigent l'information en Notes annexes.

Le refus de modifier une écriture de clôture existait déjà et citait la
convention. Ce qui manquait est l'inverse : rien n'empêchait de mouvementer le
compte 12 par une écriture ORDINAIRE. Elle s'équilibre, la balance boucle, le
bilan d'ouverture cesse de correspondre sans qu'aucun total ne bouge, et elle
est indiscernable d'une erreur d'imputation. D'où le contrôle
`IMPUTATION_REPORT_A_NOUVEAU_NON_DECLAREE`, qui liste ce qui a touché le 12
hors clôture et hors exception déclarée, en citant l'article du dossier.

Trois refus, chacun sourcé : la destination doit être un 12 (seul compte de
report à nouveau des deux plans) ; la contrepartie doit être un poste de BILAN,
une contrepartie de gestion ferait transiter l'impact par le résultat et
redeviendrait le traitement ordinaire ; et l'écriture est datée de l'OUVERTURE
de l'exercice, les deux textes parlant des capitaux propres d'ouverture. Le
MONTANT n'est jamais calculé · l'impact d'un changement de méthode se détermine
« de façon rétrospective, comme si la méthode avait toujours été appliquée »,
reconstitution qu'aucun logiciel ne fait à la place du comptable.

**Manuel des procédures et de l'organisation comptables · le quatrième document
obligatoire, qui n'avait aucune place.** AUDCIF art. 16 al. 1 : « toute entité
établit un manuel décrivant les procédures et l'organisation comptables », mis
à jour périodiquement, conservé aussi longtemps qu'est exigée la présentation
des états financiers auxquels il se rapporte. Et l'art. 17, 3° y renvoie pour
l'ORDRE DE CLASSEMENT des pièces : sans manuel, cet ordre n'est écrit nulle
part.

DEUX ARTICLES 16, à ne jamais confondre · celui de l'AUDCIF porte le manuel ;
celui du SYCEBNL porte les règles de présentation des états financiers, et son
2) exige de son côté « la mise en place de procédures nécessaires à une
organisation comptable permettant un contrôle interne fiable et le contrôle
externe ». L'art. 16 de l'AUDCIF n'étant pas exclu par l'art. 3 du SYCEBNL,
l'obligation vaut des deux côtés · `sourceManuel()` écrit à chaque dossier LE
CHEMIN par lequel elle lui parvient, et un test l'interdit dans les deux sens.

`ManuelProcedures` est PAR TENANT, jamais par exercice, contrairement au livre
d'inventaire et au rapport : il vit avec l'entité. Une VERSION par mise à jour,
jamais un écrasement · sinon le manuel en vigueur au moment d'un exercice
encore opposable disparaîtrait, et personne ne pourrait plus dire selon quelles
procédures cet exercice a été tenu.

NI LA FORME NI LE CONTENU ne sont fixés (CPCC § 0.1.4, expressément). Les
sections sont donc du JSON libre, et `SQUELETTE_MANUEL` ne propose que les sept
rubriques que le CPCC énumère comme « informations POUVANT y figurer », toutes
VIDES · un gabarit prérempli ferait passer une proposition pour une exigence.
Deux contrôles : `MANUEL_PROCEDURES_ABSENT` (avertissement) et
`MANUEL_SANS_ORDRE_DE_CLASSEMENT` (information · le manuel existe, c'est
l'art. 17, 3° qui reste sans objet).

**Date d'arrêté des comptes · la quatrième mention, et le chemin par lequel
chaque texte l'impose.** L'AUDCIF (Titre IX ch. 1 § 2.4) exige QUATRE mentions
« dans chacune des pages des états financiers publiés » : nom de l'entité,
date d'arrêté, période couverte, unité monétaire. Le logiciel en servait trois.
Ce n'est PAS « Exercice clos le » · le § 2.4 les énumère séparément, et le
Titre VIII ch. 31 § 1.3 pose l'arrêté comme postérieur de plusieurs semaines à
la clôture, dans la limite de quatre mois.

`Exercice.dateArreteComptes`, saisie dans la fenêtre Exercices, imprimée par
`EnteteImpression` et portée ligne 6 du cartouche ETAFI. NULLABLE et sans
défaut : la déduire de la clôture, ou la poser d'office à quatre mois, ferait
imprimer sur un document opposable une date que personne n'a décidée. Tant
qu'elle manque, l'en-tête et le cartouche LE DISENT · une ligne muette se lit
comme une page complète.

LE CHEMIN N'EST PAS LE MÊME DES DEUX CÔTÉS, et le contrôle
`DATE_ARRETE_NON_RENSEIGNEE` cite celui du dossier. Côté SYSCOHADA, le Titre IX
ch. 1 § 2.4 et l'art. 23. Côté SYCEBNL, l'art. 23 SEUL, par le renvoi de son
art. 3 (qui exclut 5, 8, 10-13, 17 al. 7-8, 18, 19 4e tiret, 21, 25-34, 49, 69,
70, 71, 73-113 · pas le 23). La règle « dans chacune des pages » n'est pas
reprise par le § 1.4 de la Partie 4 du SYCEBNL, qui reprend pourtant le reste
du même paragraphe : LACUNE DU TEXTE, signalée et non comblée. Les quatre
mentions sont servies aux deux, les dire obligatoires des deux serait faux.

Le délai de quatre mois n'est PAS un refus de saisie · un dossier réel arrête
parfois en retard, et bloquer effacerait le retard au lieu de le montrer. Seul
un arrêté antérieur à la clôture est refusé. Et null efface : le § 1.6 prévoit
expressément un nouvel arrêté si une information remet les comptes en cause.

**Approche par composants · le rattachement, et les deux listes qui ne se
ferment pas pareil.** Un composant est une immobilisation à part entière,
rattachée à son principal (`Immobilisation.immobilisationPrincipaleId`), avec
son PROPRE plan : c'est l'objet du ch. 4 § 1 de l'AUDCIF. Le module savait déjà
tenir un ascenseur sur dix ans dans un immeuble sur quarante ; ce qui manquait
est le LIEN, et sans lui le renouvellement créait un second bien sans sortir le
premier · deux ascenseurs au bilan pour une cage, l'écriture équilibrée et la
balance qui boucle. D'où l'opération unique `renouveler` : la VCN de l'ancien
sort au 812 (ou 654 en cession courante) et le remplaçant est porté au même
principal, § 4.1.

CE QUI DIFFÈRE ENTRE LES DEUX TEXTES, ET QU'IL NE FAUT PAS HARMONISER · le
SYCEBNL écrit « la décomposition N'EST AUTORISÉE QUE POUR » et ferme sa liste ;
l'AUDCIF donne la même énumération « par exemple » puis exclut nommément les
matériels informatiques, les véhicules de tourisme et les matériels et
mobiliers. Les messages de refus citent chacun SON texte, un test le vérifie
dans les deux sens.

CE QUE LE LOGICIEL NE DEVINE PAS. « Véhicule de tourisme » et « matériel
industriel » ne se lisent pas dans un numéro de compte, les deux plans les
logeant au même 245 et au même 241. Le seul refus mécanique porte donc sur le
2442, que les deux plans isolent. Le reste des conditions (durées d'utilité
distinctes, caractère significatif, statistiques disponibles) est demandé PAR
ÉCRIT et conservé · même parti que l'indice de perte de valeur.

Deux règles de dates opposées sur des objets voisins, et une seule est
vérifiable : la pièce de SÉCURITÉ s'amortit dès l'acquisition du principal
(contrôlé), la pièce de RECHANGE seulement à son intégration, date que nul
autre que le comptable ne connaît (non contrôlé, et dit comme tel). Enfin un
composant ne porte pas de valeur résiduelle, sauf s'il est le DERNIER
renouvellement avant la fin d'utilisation de la structure (§ 3.3 et § 4.3).

**Dépréciation des immobilisations · portée par le module depuis le
2026-09-03.** Les comptes 29 étaient semés et mouvementables, mais le module
tenait le bien au coût historique. Deux divergences muettes en sortaient, que
le contrôle `DEPRECIATION_IMMO_HORS_MODULE` ne pouvait que signaler. Elles sont
fermées, chacune dans son texte (SYCEBNL, fiche du COMPTE 29 · AUDCIF art. 46
et Titre VIII ch. 12, dont l'art. 46 n'est pas exclu par l'art. 3 du SYCEBNL) :

- **le plan se ré-étale** après une perte de valeur, sur la durée RESTANT À
  COURIR (ch. 12 § 2.4.1, chiffré au § 2.3.2 : 1 200 000 et non 2 000 000).
  Sans dépréciation, l'annuité ne bouge pas · ré-étaler partout modifierait le
  plan de tout le parc, ce qu'aucun texte ne demande ;
- **la sortie solde le 29** et le retranche de la valeur comptable nette. Un 29
  laissé au bilan est une correction d'actif sans actif, et la VCN portée au 81
  était surévaluée d'autant · une moins-value se présentait en plus-value sans
  qu'aucune écriture ne se déséquilibre.

Le logiciel ne décide NI le montant NI l'indice. Le § 2.1 est explicite :
« s'il n'existe pas d'indice de perte de valeur, aucun test n'est requis ».
L'indice est donc saisi et conservé (`DepreciationImmobilisation.indice`) ·
c'est lui qui rend la dépréciation opposable à un réviseur. Le seul contrôle de
compte posé est le préfixe **29**, que les deux textes écrivent, avec ses
exclusions (39 stocks, 49 tiers, 59 trésorerie). Et le contrôle 15 retranche
désormais ce que le module a lui-même posté : un avertissement qui crie sur le
dossier exemplaire est un avertissement qu'on apprend à ignorer.

Une limite est ASSUMÉE et écrite dans le code : le plafond de reprise appliqué
est le cumul encore inscrit, pas le plafond plus fin du § 2.4.2 (la valeur
comptable après reprise ne doit pas dépasser celle qui aurait existé sans
dépréciation), dont le calcul supposerait de rejouer le plan d'origine exercice
par exercice.

**Acomptes provisionnels · les dates ET la base viennent de la loi de
finances.** L'article 57 bis de la loi de procédures fiscales, TEL QUE MODIFIÉ
par la loi de finances n° 25/060 du 29 décembre 2025, fixe les trois versements
au plus tard les 25 juillet, 25 septembre et 25 novembre. La rédaction de 2023
(« avant le 1er août, avant le 1er octobre, avant le 1er décembre ») est
périmée, et c'est elle qu'un praticien cite de mémoire : ne pas la
« rétablir ». Le même article assoit les acomptes sur « l'impôt déclaré au
titre de l'exercice précédent, AUGMENTÉ des suppléments éventuels établis par
l'Administration des Impôts […] que ces sommes fassent ou non l'objet de
contestation ». Un supplément naît d'un avis de redressement, jamais d'une
écriture : aucun solde ne le porte, d'où
`DossierFiscalExercice.supplementsAdministration`, saisi. Il entre dans la base
des acomptes du prochain exercice et SEULEMENT là · l'imputer sur l'impôt de
l'exercice ferait payer deux fois le même redressement. Sans lui, les trois
acomptes proposés à un dossier redressé sont sous-évalués, et une insuffisance
de versement se paie même contestation pendante.

**Retraitements fiscaux · le logiciel se souvient, il ne qualifie pas.** Le
catalogue (`catalogue-retraitements.ts`) refuse de déduire la qualification
fiscale d'une charge de son numéro de compte, et il a raison : le 6582
« Dons » reçoit des versements déductibles dans la limite de l'art. 44 et
d'autres qui ne le sont pas. Cette règle N'EST PAS DÉFAITE. Ce qui a été
ajouté le 2026-09-03 est autre chose : `Compte.codeRetraitementFiscal`
enregistre ce que le CABINET a décidé une fois sur son propre sous-compte, et
le résultat fiscal le lui REPROPOSE chaque exercice avec le montant et
l'article. Les propositions ne sont jamais inscrites d'office · une
réintégration créée seule serait exactement le logiciel qui tranche. Un
compte plafonné ne propose que l'EXCÉDENT : réintégrer la charge entière
ferait payer l'impôt sur une somme que la loi admet en déduction.

Communes aux deux, mais avec un écran par référentiel derrière l'aiguillage :
états financiers et notes annexes. Les deux jeux ne partagent que les aides
techniques (`etats-financiers.communs.ts`, `note-annexe.types.ts` côté
serveur, `components/NotesAnnexesRendu.tsx` côté client) · aucun poste, aucun
compte, aucun libellé.

**Longueur de compte réellement paramétrable · un champ que le schéma
promettait modifiable et qu'aucune route ne posait.** `Tenant.longueurCompte`
existe depuis l'origine, et son commentaire écrit qu'il est « modifiable après
coup (`TenantService.modifierParametres`) mais jamais en dessous de la longueur
du plus long numéro de compte déjà créé ». Cette méthode n'existait pas : ni
route, ni DTO, ni écran, et la longueur figurait au contraire dans le bloc
« ce qui ne se change pas ». Le champ ne servait donc que de PLAFOND, figé à 8
pour tous les dossiers, sans qu'aucun cabinet puisse le porter à 10 ou 12.

CE QU'IL COMMANDE, ET CE QU'IL NE COMMANDE PAS · la distinction décide de tout
le reste, et l'écran la dit en toutes lettres. C'est la longueur MAXIMALE des
numéros que le cabinet ouvre lui-même. Le plan NORMALISÉ semé à la création
garde, lui, ses huit chiffres : ses numéros sont des littéraux, et les tables de
correspondance des deux référentiels (bilan, compte de résultat, flux, notes,
SMT) comme le routage des comptes de TVA sont écrits contre cette forme.
Élargir la borne ouvre des sous-comptes plus fins sous une racine semée (un
adhérent, un bailleur, un projet) · cela ne renumérote rien, et laisser croire
le contraire serait la promesse la plus coûteuse de cet écran. Un test l'exige
mot pour mot.

LE PLANCHER EST LE PLUS LONG NUMÉRO DÉJÀ OUVERT. Descendre en dessous rendrait
des comptes invalides RÉTROACTIVEMENT · des comptes mouvementés, lettrés, repris
dans des états déposés. Le refus nomme le numéro fautif plutôt qu'une borne
abstraite : c'est celui-là qu'il faudrait supprimer. Et le plancher se lit sur
la LONGUEUR, jamais sur un `orderBy` SQL · le tri y est lexicographique, « 9 »
passe après « 41100000 » alors qu'il est plus court, et un plancher déduit d'un
tri vaudrait 1. La plage 3 à 13 est celle des logiciels de la place (skill
`sage-i7`), déjà celle du DTO de création de compte.

UN SEUL CALCUL, DEUX CONSOMMATEURS · `plancherLongueurCompte` sert la lecture
des paramètres ET l'écriture, si bien que l'écran désactive les longueurs
impossibles avec le chiffre exact par lequel la route les refuse. Deux calculs
auraient divergé, et l'utilisateur aurait découvert le refus après le clic.

DEUX CORRECTIONS DE MÉTHODE AU PASSAGE. Servir le plancher avec les paramètres
a fait échouer six doublures Prisma qui ne répondaient pas à la lecture des
comptes · elles ont été complétées plutôt que contournées, une doublure muette
sur une lecture réelle validant un service qui n'existe pas. Et un test de
l'échéancier ONEM échouait TOUT SEUL, sans qu'une ligne de code ait bougé : il
lisait l'horloge, et tombait du 11 au 15 de chaque mois, quand la prochaine
déclaration (le 10 du mois suivant) passe après le versement encore à venir du
mois courant (le 15). Le calcul est juste · chaque obligation rend sa PROCHAINE
occurrence. Le test, lui, figeait une relation qui ne vaut que dans un même
mois : il porte désormais une date de référence fixe.

**Modales qui sortaient de l'écran par le haut · deux causes, mesurées avant
d'être corrigées.** Signalé par Manasse sur la calculette de la barre de menus,
et vrai ailleurs. Le débordement vers le HAUT est le seul qui soit
irrécupérable : aucune barre de défilement ne remonte au-dessus du bord
supérieur, et c'est le titre, les onglets et la croix de fermeture qui y passent
en premier.

1. **LE BLOC CONTENEUR.** `position: fixed` ne se résout PAS toujours sur la
   fenêtre du navigateur : un ancêtre portant `filter`, `backdrop-filter`,
   `transform`, `perspective` ou `contain: paint` en devient le bloc conteneur.
   La barre de menus porte `backdrop-blur-md` (le verre dépoli de la maquette
   Windows 11), et la calculette est rendue DEPUIS son icône · `inset-0` se
   résolvait donc sur une barre de 26 px, et `items-center` centrait une
   calculette de 302 px sur ces 26 px. Mesuré au navigateur, viewport
   1280 × 800 : **sommet à -105 px**, contre 249 px pour le même balisage sous
   une barre non floutée. Le dossier connaissait déjà l'AUTRE moitié de la
   règle · le commentaire de `MenuBar` note que « backdrop-blur crée un
   contexte d'empilement sur cette barre ». C'est le même mot-clef qui crée le
   bloc conteneur, et c'est cette moitié-là qui manquait.
2. **LA HAUTEUR NON BORNÉE.** Une modale plus haute que l'écran, centrée par
   `items-center`, déborde des DEUX côtés à parts égales. Mesuré : 1 200 px sur
   un écran de 800 px commence à **-200 px** ; bornée à `calc(100dvh-2rem)` avec
   défilement interne, elle commence à 16 px. Sept modales n'avaient aucune
   borne, dans trois écrans (groupe, plateforme, utilisateurs).

`components/PortailModale.tsx` porte la modale dans le `<body>`. CE QUI A ÉTÉ
REFUSÉ · retirer le flou des barres corrigerait le symptôme en défaisant un
parti pris de maquette, et ne protégerait de rien : le prochain `transform`
posé sur un ancêtre rouvrirait le même trou, en silence. Le portail rend la
modale indépendante de l'endroit d'où elle est appelée, ce qui est de toute
façon ce qu'une modale veut dire.

`modales-dans-l-ecran.spec.ts` gèle les deux règles pour TOUTES les modales du
dossier, celles qui n'existent pas encore comprises : il recense les voiles
`fixed inset-0`, exige de chacun une borne de hauteur, et refuse qu'une barre
floutée du chrome héberge un voile qui ne serait pas porté. Un premier test
vérifie que le recensement trouve encore quelque chose · un garde-fou qui ne
trouve plus rien passe sans rien vérifier.

**Taux de TVA par défaut dans la grille de saisie · une règle qui ne servait
qu'une porte sur deux.** Le code taxe existe sur la fiche compte depuis le
chantier de 2026-08, mais seule la modale « Achat / Vente avec TVA » le lisait.
La grille, c'est-à-dire la voie NORMALE de l'écran central, ne proposait rien :
le comptable qui saisit sa facture ligne à ligne devait connaître de tête le
compte 4454 et calculer ses 16 %.

LA RÈGLE VIT MAINTENANT DANS `lib/tva-saisie.ts`, ET LES DEUX ÉCRANS
L'APPELLENT. La réécrire dans la grille aurait produit deux TVA plausibles et
différentes sur la même facture · c'est ce que le lettrage a déjà appris avec
`calculerPropositions`. Un test lit les deux fichiers et refuse qu'un écran
refasse le routage dans son coin.

TROIS DÉCISIONS QUE CE DÉPLACEMENT A RENDUES VISIBLES, dont une FAUSSE :

- le compte de taxe est ROUTÉ selon la nature de la contrepartie (un transport
  déduit en 4453, un service extérieur en 4454, une prestation vendue collecte
  en 4432), et il n'est JAMAIS deviné · un taux sans compte rattaché le dit et
  s'arrête ;
- **la famille se lit sur la NATURE de la contrepartie, pas sur le sens de la
  ligne**, et c'est la correction du chantier. Dans la modale les deux
  coïncident, ses modèles n'ouvrant que des charges ou que des produits. Dans
  la grille, non : un AVOIR FOURNISSEUR crédite un compte de charge, et déduire
  la famille du sens aurait posé la contre-taxe en 443 « TVA facturée sur
  ventes ». Le montant aurait été juste, le compte faux, et la déclaration
  aurait ventilé un reversement de déduction en collecte. Ce n'est pas une
  règle inventée, c'est ce que 443 et 445 signifient : une charge porte une
  taxe récupérable, un produit une taxe facturée, et le sens dit seulement si
  l'on pose ou si l'on reprend ;
- la ligne au TAUX ZÉRO doit exister · art. 43 de l'O.-L. n° 10/001, les
  exportations entrent au numérateur du prorata, et le serveur les reconnaît par
  cette ligne. Un taux nul qualifie l'opération ; une taxe nulle faute de base
  ne qualifie rien. Les deux zéros ne se confondent pas.

LE TAUX EST PORTÉ PAR LA LIGNE DE TVA, JAMAIS PAR LA LIGNE HT · c'est le sens
que le schéma lui donne et celui que `TauxTvaService.declaration` lit (un
`tauxTvaId` ET un compte 443 ou 445). Le marquer sur la ligne de charge aurait
été le huitième « un champ, deux sens » du dossier : inerte aujourd'hui puisque
le filtre de compte l'écarte, faux le jour où quelqu'un relâche ce filtre.

ET LA GRILLE PROPOSE, ELLE N'IMPUTE PAS. La bande attend un clic, le taux y
reste modifiable, elle s'abandonne d'un mot. Une ligne de taxe qui s'ajouterait
d'office passerait inaperçue jusqu'à la déclaration, notamment sur une
association exonérée. La proposition est retrouvée par son indice ET son
compte : une suppression l'invalide au lieu de la reporter sur la ligne
voisine.

**RÉVISÉ LE 2026-09-25 · TROIS RÉGIMES, ET LA SOURCE TRANCHE.** Le manuel Sage
i7 dit du taux de taxe qu'il sert « à calculer les montants de TVA
automatiquement », et que « le calcul de la taxe ne peut se faire que dans un
journal de type achat ou vente ». `modeCalculTva` (lib/tva-saisie.ts) en tire
trois régimes. AUCUN hors journal d'achats ou de ventes · la grille proposait
jusque-là une taxe jusque dans la banque. AUTO dans un journal d'achats ou de
ventes d'un dossier DÉCLARÉ assujetti (`Tenant.assujettiTva`) · la ligne
s'ajoute d'office, ANNONCÉE à l'écran avec son montant, et se supprime comme
une autre. PROPOSE sinon · l'argument de l'association exonérée tient toujours,
et c'est l'assujettissement déclaré, faux par défaut, qui le règle au lieu d'un
clic imposé à tous. Le NET À PAYER suit (`netAPayer`) · au choix d'un compte de
tiers d'un journal d'achats ou de ventes, le montant qui équilibre la pièce est
pré-rempli dans le sens qui solde, 408, 409, 418 et 419 exclus.

**Exclusion de relance par tiers · ce que l'exclusion NE DOIT PAS faire.** Sage
l'appelle « Hors rappel/relevé » et en fait une case sur la fiche du tiers. La
case est la partie facile ; le piège est ce qu'on lui fait faire de trop.

L'EXCLUSION PORTE SUR LE COURRIER, JAMAIS SUR LA CRÉANCE. Retirer la position de
la liste paraîtrait plus propre et serait faux deux fois. D'abord parce que la
créance ne disparaît pas quand on renonce à écrire : le tiers reste dû à la
balance âgée, à la note annexe des créances, au contrôle d'ancienneté, au report
à-nouveau Détail et au lettrage · un logiciel qui ferait disparaître la ligne
MINORERAIT les créances, en silence, parce qu'un tiers a été coché. Ensuite
parce qu'une liste qui ne montre plus l'exclu ne permet plus de LEVER
l'exclusion, qui se pérennise alors toute seule. La position est donc rendue,
montrée, dite exclue, sa case décochable désactivée et son niveau suggéré nul :
rien ne part, rien ne disparaît. Un test le fige des deux côtés, serveur et
écran, parce que « filtrer la liste » est exactement le raccourci qu'une
relecture pressée trouverait élégant.

LE MOTIF EST EXIGÉ, LA DATE VIENT DU SERVEUR. Une case seule ne se relit pas :
six mois plus tard, personne ne sait si ce tiers est en litige chez un avocat,
sous échéancier négocié, disparu, ou coché par erreur, et le doute finit par se
résoudre en remettant tout le monde dans le circuit. La date est posée par le
serveur · venue de l'écran, elle pourrait être antidatée pour masquer un retard
de relance. Remettre dans le circuit EFFACE motif et date, sans quoi un tiers de
nouveau relançable porterait les traces d'une exclusion levée, que le prochain
lecteur prendrait pour elle.

LE REFUS VIT DANS LE SERVICE, PAS SEULEMENT À L'ÉCRAN (§ 6) · et il SAUTE le
tiers au lieu de lever, sur le modèle de la lettre sans adresse : un lot de vingt
rappels décidés ne doit pas mourir sur le seul tiers exclu. Le compte rendu
d'émission le dit, y compris quand la sélection ne portait que des exclus · un
« Aucun courrier préparé. » tout seul se lirait comme « il n'y avait rien à
réclamer ».

**Pré-lettrage · « l'une propose, l'autre confirme ».** Le lettrage automatique
écrivait directement, et le schéma disait pourtant lui-même ce que valent ses
trouvailles : « un rapprochement par montant est une PRÉSOMPTION DU LOGICIEL »
(commentaire d'`OrigineLettrage`). Deux montants égaux ne prouvent pas qu'une
facture a été réglée par ce virement-là · ils prouvent qu'ils sont égaux. Sur un
compte fournisseur où trois factures portent le même loyer mensuel, la
présomption se trompe deux fois sur trois et le lettrage part quand même. Le
pré-lettrage rend la présomption à qui peut la trancher · c'est la même division
du travail que le double regard à la validation (§ 10 ter), et pour la même
raison : le logiciel voit une coïncidence, le comptable connaît l'opération.

UN SEUL CALCUL, DEUX APPELANTS. `calculerPropositions` porte les quatre passes
(référence de pièce, paires exactes, N-pour-1, N-pour-M) ; `lettrageAutomatique`
pose, `preLettrage` propose. Un second calcul écrit à part pour l'écran de
proposition aurait divergé du premier au premier correctif, et l'écart n'aurait
sauté aux yeux de personne · les deux listes sont plausibles séparément. Un test
compare les deux sorties, et c'est le seul endroit où la divergence se verrait.

LA PROPOSITION N'EST PAS STOCKÉE, ET C'EST UN CHOIX. Rangée en base, elle
réserverait ses lignes (`lettrageId` servi les sort du réappariement) sans être
un lettrage, et surtout elle PÉRIMERAIT : la première écriture passée sur le
compte change la scène, et confirmer une proposition d'hier lettrerait des
lignes contre une image qui n'existe plus. Recalculée à chaque appel, elle ne
peut pas être périmée. La confirmation ne fait d'ailleurs jamais confiance à ce
que le client renvoie · elle rejoue `verifierLignes` et REFUSE tout groupe dont
le solde n'est pas nul, puisque les quatre passes n'apparient que des sommes
exactement égales : un groupe confirmé qui ne solde pas ne vient pas d'une
proposition, et l'accepter poserait un lettrage PARTIEL sous une origine
automatique, c'est-à-dire une présomption du logiciel sur une opération que le
logiciel n'a jamais proposée.

L'ORIGINE PROPOSÉE EST CONSERVÉE À LA CONFIRMATION. Elle dit COMMENT le
rapprochement a été trouvé, pas qui l'a béni : un groupe issu d'une coïncidence
de montants reste `AUTOMATIQUE_MONTANT` même confirmé à la main, sinon la piste
d'audit affirmerait qu'un humain a apparié ces lignes une par une. `MANUEL` est
refusé à cette porte · un groupe composé à la main passe par le lettrage manuel,
qui porte son origine propre.

Deux détails d'écran qui sont des règles. Les cases arrivent DÉCOCHÉES · un
panneau pré-coché transformerait la confirmation en acquiescement, alors que
c'est l'examen qui est demandé. Et l'état compte ce qu'il n'a PAS su rapprocher
· un pré-lettrage qui ne montrerait que ses trouvailles laisserait croire que le
reste est rapproché.

**Palmarès des comptes et analyse des journaux · deux états dont la compétence
Sage ne donne que le NOM.** Le catalogue les énumère et s'arrête là · ni
colonnes, ni tri, ni périmètre. Leur définition est donc celle d'OmegaX, et
l'écran le dit en toutes lettres : leur prêter une maquette Sage que la source
ne porte pas serait la même faute que la « découpe par cycle » jadis attribuée
au CPCC. Aucun texte comptable ne les régit non plus · ce ne sont pas des états
financiers, ils ne se déposent nulle part.

LE PALMARÈS CLASSE SUR LE MOUVEMENT, JAMAIS SUR LE SOLDE. Un compte de
trésorerie qui a encaissé et décaissé quatre cents fois finit souvent près de
zéro : classé au solde, il disparaît du palmarès, alors que c'est exactement le
compte qu'un réviseur veut voir. Le report à-nouveau est EXCLU · il n'est pas
une activité de l'exercice, et l'inclure ferait remonter en tête les comptes de
bilan les plus lourds année après année, indépendamment de ce qui s'y est passé.
La PART CUMULÉE se prend sur le périmètre entier et non sur la tranche
affichée : sinon le dernier rang montré atteindrait 100 % et laisserait croire
que le palmarès couvre tout le dossier. Et la CLASSE est toujours affichée ·
ranger en silence un stock et un flux dans le même classement serait une
comparaison que rien ne fonde.

L'ANALYSE DES JOURNAUX NE REND AUCUN CONTRÔLE D'ÉQUILIBRE, et l'absence est
figée par un test. Chaque écriture est équilibrée et appartient à un seul
journal : débit = crédit y est vrai PAR CONSTRUCTION, et une colonne toujours
verte apprend surtout à ne plus lire les colonnes. Ce qu'elle rend est ce qu'un
réviseur cherche vraiment · le brouillard restant journal par journal (AUDCIF
art. 22, 2°, validation « au terme de chaque période qui ne peut excéder un
mois »), ce que la clôture a posé séparé de la saisie, et les TROUS DE LA
SÉQUENCE DES NUMÉROS DE PIÈCE.

CE DERNIER CONTRÔLE EST CELUI QUI POUVAIT FABRIQUER DES ANOMALIES (§ 10 bis),
et sa règle vit à part (`journaux/sequence-pieces.ts`). Chercher les trous
« par journal, sur l'exercice » n'est juste que pour UN des quatre modes de
numérotation :

- **CONTINUE_JOURNAL** · le contrôle vaut tel quel ;
- **CONTINUE_FICHIER** · la séquence court sur TOUS les journaux. Le journal des
  achats porte 1, 3, 7 et celui des ventes 2, 4, 5 : lus séparément les deux
  paraissent troués de partout, alors que la séquence du dossier est parfaite.
  Le périmètre est donc le DOSSIER, et la ligne de synthèse ne mêle que les
  journaux réellement en continu sur le fichier ;
- **MENSUELLE** · l'erreur n'y va PAS dans le sens qu'on croit. Lue sur
  l'exercice, la séquence ne fabrique aucun faux trou · elle en MASQUE de vrais,
  ce qui est pire parce que rien ne le signale. Janvier porte 1 et 2, février
  porte 1 et 3 : il manque le 2 de février, et l'union annuelle {1, 2, 3} est
  parfaitement continue. Le périmètre est le couple journal + mois ;
- **MANUELLE** · aucune séquence n'est imposée, et le logiciel ne se prononce
  pas. Inventer un contrôle reprocherait au cabinet une discipline qu'il n'a pas
  choisie.

Enfin la séquence ne commence JAMAIS forcément à 1 · un dossier repris en cours
d'année reprend la numérotation du logiciel précédent, et exiger 1 signalerait à
chaque reprise un manque de tout ce qui précède l'entrée dans OmegaX.

**Rubriques budgétaires · trois états lisaient le même objet, et aucun deux ne
le lisaient pareil.** `SectionAnalytique.type` porte depuis toujours la promesse
écrite dans le schéma : TOTAL « ne sert qu'à regrouper ses sections de même
racine DANS LES ÉTATS ». Une section TOTAL ne reçoit ni budget (`doterBudget`
la refuse) ni ventilation (`ventiler` la refuse) · elle n'existe QUE pour être
totalisée, et c'est aux états de le faire.

La BALANCE ANALYTIQUE le faisait. L'ÉTAT BUDGÉTAIRE (prévu / réalisé / écart)
ÉCARTAIT les rubriques de sa requête (`type: DETAIL`) · un cabinet dont la
convention se lit « 1 Personnel, dont 11 Salaires et 12 Charges sociales »
n'obtenait qu'une liste plate de feuilles, et le bailleur qui lit son budget par
rubrique additionnait à la main. Le TABLEAU OFFICIEL D'EXÉCUTION BUDGÉTAIRE, lui,
les gardait à ZÉRO · une ligne « 1 Personnel · budget 0, réalisé 0 » qui ne se
distingue pas d'une rubrique inutilisée, alors que le guide veut le tableau
« suivant la NOMENCLATURE BUDGÉTAIRE DU PROJET », et qu'une nomenclature de
bailleur a des rubriques.

LA RÈGLE VIT UNE FOIS (`analytique/rubriques-budgetaires.ts`) et les trois états
l'appellent · c'est ce qui les empêche de diverger à nouveau. Une rubrique
agrège les sections DÉTAIL dont le CODE COMMENCE PAR LE SIEN, même convention
que les comptes Total du plan comptable (§ 7).

DEUX CONSÉQUENCES À NE PAS « CORRIGER ». Les rubriques s'EMBOÎTENT · la section
111 est comptée dans la rubrique 11 ET dans la rubrique 1, ce qui est le propre
d'un sous-total. Et le préfixe est un préfixe de CHAÎNE, pas un niveau : une
rubrique « 1 » absorbe la section « 10 » comme la « 11 » ; un dossier qui ne veut
pas ce regroupement code ses rubriques sur une longueur fixe.

D'OÙ LE TOTAL GÉNÉRAL, QUI NE SOMME QUE LES FEUILLES. Sommer les lignes
affichées compterait chaque dépense autant de fois qu'elle a de rubriques
au-dessus d'elle · exactement le DOUBLE du vrai sur une nomenclature à deux
niveaux, sur un tableau dont chaque ligne est juste et dont le crédit disponible
laisserait croire à une enveloppe deux fois plus large. Le tableau officiel
sommait bien les lignes affichées ; ce n'était juste que PAR ACCIDENT, les
sections Total valant toujours zéro faute de pouvoir être dotées.

UNE RUBRIQUE N'EST JAMAIS « HORS BUDGET ». Le signalement vise une section
mouvementée que personne n'a dotée, et il appartient à la FEUILLE · le porter
sur le sous-total le ferait crier dès qu'une seule de ses feuilles est
concernée, en masquant laquelle.

ET DANS L'EXPORT, LA PLAGE RESTE UNE PLAGE QUAND IL N'Y A AUCUNE RUBRIQUE. Le
total du classeur additionne les feuilles NOMMÉMENT dès qu'une rubrique existe,
mais la grille VIERGE, que le cabinet remplit à la main, garde `SUM(C9:C22)` ·
une somme énumérée cellule par cellule y ignorerait toute ligne insérée au
milieu, et le total se désaccorderait en silence, ce que ce classeur existe
justement pour éviter.

**Tableau emplois ressources · trois colonnes, et le texte en demandait trois.**
La maquette officielle porte « REF | DESIGNATION | SOLDE CUMULE DEBUT EXERCICE
N | EXERCICE N | SOLDE CUMULE FIN EXERCICE N » (SYCEBNL, Partie 4 ch. 3,
Section 1). OmegaX n'en publiait qu'une à l'écran, et l'export Excel laissait
la colonne C VIDE avec une note renvoyant le cabinet à son suivi de projet hors
logiciel · un classeur complet en apparence, dont un tiers des colonnes était à
remplir à la main.

CE N'EST PAS UNE COLONNE D'AGRÉMENT. Un projet de développement se finance sur
une CONVENTION, pas sur un exercice, et trois ans est le cas ordinaire. La
colonne de l'exercice répond à « qu'a-t-on dépensé cette année » ; le bailleur,
lui, demande « où en est-on sur les 800 000 promis », et cette réponse n'était
nulle part dans l'état qui porte son nom.

LES TROIS COLONNES SORTENT DU MÊME CONSTRUCTEUR (`construireColonne`), appelé
sur trois jeux de lignes de balance. Un second calcul écrit à part pour les
cumuls aurait divergé du premier au premier correctif, et l'écart n'aurait sauté
aux yeux de personne · les trois colonnes sont plausibles séparément.

`EcritureService.balanceCumulee` porte les DEUX RÈGLES DE LECTURE, et chacune
fabrique un chiffre plausible et faux quand on l'oublie. Les écritures de
CLÔTURE sont exclues · le report à-nouveau rejoue chaque année le solde de
l'année d'avant, et un cumul sur trois exercices rendrait le triple des fonds
reçus sans qu'aucun état ne se déséquilibre (la Note 9 porte déjà cette règle,
et pour la même raison). SAUF CELLES DU PREMIER EXERCICE, qui portent le BILAN
D'OUVERTURE du dossier · un cabinet qui reprend un projet en cours saisit son
solde de départ par cette écriture-là, et l'exclure amputerait le cumul
exactement de ce que le bailleur avait déjà versé. Même règle, même
justification que `justificatifSolde`.

L'APPARIEMENT DES TROIS COLONNES SE FAIT PAR CLÉ, JAMAIS PAR RANG. Le bloc des
lignes de bailleurs est de LONGUEUR VARIABLE d'une colonne à l'autre · la ligne
« comptes non rattachés à un bailleur » n'existe que si de tels comptes ont
bougé sur la période. Un appariement positionnel décalerait toute la suite du
tableau d'une ligne, et un poste recevrait un montant juste sur la mauvaise
ligne, dans un tableau dont tous les totaux restent exacts.

ET « FIN = DÉBUT + EXERCICE » N'EST VRAI QUE D'UN FLUX. FU à FZ et leurs totaux
sont des SOLDES DE TRÉSORERIE À UNE DATE, ce que leurs libellés disent
eux-mêmes (« Fonds Bailleur en FIN exercice N ») : additionner le solde de fin
de N-1 et celui de fin de N donnerait le double de l'encaisse, sur une ligne qui
a l'air d'un total comme les autres. `REFS_DE_SOLDE` les nomme, et l'export y
porte la valeur au lieu de la formule `C+D`.

LE CONTRÔLE OFFICIEL VII (« TOTAL V = TOTAL VI ») EST VÉRIFIÉ SUR CHAQUE
COLONNE, et c'est lui qui rend les cumuls vérifiables : sur une colonne
cumulée, IV devient les fonds disponibles à l'ORIGINE et VI les fonds à la fin
de la fenêtre. À l'écran il n'est affiché que s'il ÉCHOUE · trois bandeaux verts
empilés s'apprennent à ne plus être lus.

**Sélecteur d'exercice · l'exercice courant ne se devine plus quand il y a un
doute.** `ExerciceProvider` prenait `exercices.find((e) => e.statut ===
'OUVERT')` sur une liste triée par date de début DÉCROISSANTE · c'est-à-dire le
PLUS RÉCENT des exercices ouverts, sans que rien ne le dise et sans qu'aucun
écran ne permette d'en changer.

LE DÉFAUT SE DÉCLENCHE DANS LA SITUATION LA PLUS ORDINAIRE QUI SOIT. Un cabinet
ouvre l'exercice suivant le 1er janvier alors que le précédent n'est pas encore
clôturé · c'est la règle et non l'exception, l'arrêté des comptes se faisant
dans les quatre mois (AUDCIF art. 23). À cette seconde, les trente-quatre écrans
qui lisent le contexte basculent sur le nouvel exercice. Le comptable qui saisit
décembre ne retrouve plus ses écritures à la balance, RIEN ne se déséquilibre ·
la balance boucle, sur le mauvais exercice · et aucun total ne bouge.

TROIS RÈGLES, et la troisième est le vrai correctif. Le CHOIX DE L'UTILISATEUR
prime toujours, et il est mémorisé PAR DOSSIER (`omegax.exercice.<tenantId>`) ·
un opérateur de la plateforme passe d'un cabinet à l'autre, et l'identifiant
d'exercice d'un dossier n'a aucun sens dans un autre. Un SEUL exercice ouvert
est retenu sans discussion · il n'y a rien à trancher. PLUSIEURS exercices
ouverts et aucun choix : le plus récent est encore retenu, mais le contexte le
DÉCLARE (`choixImplicite`) et la barre de statut le signale. Refuser d'afficher
quoi que ce soit bloquerait le logiciel dans un cas parfaitement légitime ;
choisir en silence est ce qui vient d'être corrigé. La seule issue honnête est
de choisir ET de le dire.

AUCUN EXERCICE OUVERT N'EST PAS UN CHOIX IMPLICITE · le plus récent sert de
fenêtre, sans avertissement. Avertir là ferait crier le bandeau sur tout dossier
dont les exercices sont clôturés, c'est-à-dire sur les dossiers les plus sains,
et on apprendrait à l'ignorer avant le jour où il compte.

LA RÈGLE VIT HORS DU COMPOSANT (`client/src/lib/exercice-choix.ts`,
`resoudreExercice`) · c'est ce qui la rend vérifiable sans monter React, et le
provider ne doit appeler qu'elle. La mémorisation passe par des `try/catch` :
`localStorage` jette en fenêtre privée, et la préférence est un confort, jamais
une condition d'usage.

**Journal et grand livre exportés en flux · l'export était AMPUTÉ, et il
annonçait DEUX totaux.** Le chantier visait la mémoire ; le défaut trouvé est
plus grave. `journalExcel` appelait `EcritureService.lister()`, qui n'a jamais
rendu plus de `PLAFOND_ECRITURES_PAR_FENETRE`, soit 2 000 écritures. Ce plafond
est celui d'une FENÊTRE, posé pour qu'un écran ne tue pas le serveur ; un
fichier n'est pas une fenêtre. Le journal d'un dossier de trois mille écritures
sortait amputé du tiers, sans un mot.

ET LA LIGNE TOTAUX AGGRAVAIT L'AMPUTATION AU LIEU DE LA RÉVÉLER. Elle porte une
formule `SUM` sur les lignes écrites ET, en valeur jointe, l'agrégat SQL de la
période ENTIÈRE. Le même classeur annonçait donc deux totaux : Excel recalcule
et montre le tronqué, tout ce qui lit sans moteur de calcul (un import, un
convertisseur, un aperçu) lit le complet. Le livre-journal est un livre
obligatoire (AUDCIF art. 22, 6°), et le § 8 bis écrit déjà pour le grand livre
qu'« un livre amputé en silence est un document FAUX ». Le journal n'avait pas
eu droit à la même phrase.

LE GRAND LIVRE COMPLET, LUI, NE REFUSAIT PAS À 50 000 MAIS À 20 000, par
`PLAFOND_LIGNES_GRAND_LIVRE` · un plafond justifié dans le code par « ce qu'une
fenêtre peut afficher ». Une contrainte d'écran appliquée à un fichier. Les deux
exports lisent maintenant PAR LOTS (`LOT_EXPORT = 500`, curseur par identifiant
avec `skip: 1`) et n'empruntent plus aucune borne de fenêtre.

LE PÉRIMÈTRE DU JOURNAL VIT UNE FOIS (`perimetreJournal`, dans
`ecriture.service.ts`) et la fenêtre comme l'export l'appellent. Deux filtres
écrits séparément auraient rendu deux journaux plausibles et différents pour les
mêmes critères · c'est la leçon de `calculerPropositions` et de
`construireLigneTva`, la troisième fois qu'elle se présente.

`classeur-en-flux.ts` porte la coiffe, l'en-tête et les options, et les trois
règles du flux qu'on ne peut pas apprendre en lisant le code d'un classeur en
mémoire. RIEN NE SE RELIT · une feuille partie sur le réseau ne se rouvre pas
pour insérer trois lignes en tête, d'où la coiffe écrite AVANT la première
donnée. LES FORMATS SONT PORTÉS PAR LA COLONNE · en flux une ligne est scellée
dès qu'elle est écrite, et `appliquerFormats` appelé après coup, comme sur les
classeurs en mémoire, n'a AUCUN effet sur les lignes déjà parties : les dates
sortiraient en numéros de série. Et `useSharedStrings` RESTE FAUX · mesuré à
1 195 Mo contre 450 Mo pour un demi-million de lignes, il défait exactement le
bénéfice du flux, la table des chaînes vivant en mémoire jusqu'à la fin.

UNE RÉPONSE COMMENCÉE NE PEUT PLUS ÊTRE RETIRÉE, et c'est le prix du flux.
L'en-tête HTTP part avec les premiers octets : une panne survenue ensuite ne
peut plus se changer en 500. `envoyerXlsxEnFlux` DÉTRUIT alors la connexion
plutôt que de la fermer proprement · Excel refuse le ZIP tronqué au lieu de
l'ouvrir sur un livre incomplet. Le seul autre choix était de livrer un fichier
qui s'ouvre et qui ment.

`MAX_LIGNES_EXPORT` passe de 50 000 à 200 000, mesuré (`docs/capacite-mesuree.md`,
banc du 2026-09-12) · c'est la dernière valeur qui laisse la moitié du tas libre.
Elle reste un REFUS, jamais une troncature.

DEUX TESTS DE CE CHANTIER NE PROUVAIENT RIEN, et seule la réinjection du défaut
l'a dit. Celui des formats vérifiait `numFmt` par `toBeTruthy()` : retirer le
format de la colonne Date le laissait passer, ExcelJS donnant d'office un format
intégré à toute cellule dont la valeur est une `Date` · format AMÉRICAIN, où un
3 avril sort « 4/3 » et se lit comme un 4 mars. Celui du curseur vérifiait qu'un
curseur était PRÉSENT, pas lequel : un curseur posé sur n'importe quelle ligne du
lot passait, alors qu'en arrière il rejoue des pièces et en avant il en saute.
Les deux exigent désormais la VALEUR. Un test qui n'a pas été VU ÉCHOUER ne
protège rien, et « toBeTruthy » est la forme la plus courante de cette illusion.

**Comparabilité de la colonne N-1 · le second alinéa que le logiciel ne
lisait pas.** Les deux textes imposent la colonne comparative ET, dans la même
phrase, ce qu'il faut faire quand elle ne vaut rien : « Lorsque l'un des postes
chiffrés d'un état financier N'EST PAS COMPARABLE à celui de l'exercice
précédent, c'est CE DERNIER QUI DOIT ÊTRE ADAPTÉ. L'absence de comparabilité ou
l'adaptation des chiffres EST SIGNALÉE DANS LES NOTES ANNEXES. » OmegaX servait
le premier alinéa à TREIZE endroits et ignorait le second.

LE DÉFAUT EST DU § 10 BIS DANS SA FORME LA PLUS DISCRÈTE · la colonne part
d'office, remplie, avec des totaux justes et un bilan qui boucle. Le lecteur en
tire une variation qui ne veut rien dire, et aucune ligne de l'état ne l'en
avertit.

ET IL N'EST PAS THÉORIQUE. L'AUDCIF art. 7 autorise nommément un premier
exercice de moins de douze mois quand l'entité commence au premier semestre, et
de plus de douze mois quand elle commence au second. C'est donc la DEUXIÈME
liasse de tout dossier ouvert en cours d'année qui porte la colonne fautive.

L'UNITÉ EST LE MOIS, JAMAIS LE JOUR. Le même art. 7 dit « une période de DOUZE
MOIS, appelée exercice ». Compter en jours ferait de chaque année bissextile une
non-comparabilité (366 contre 365) : le signalement crierait une année sur
quatre sur tous les dossiers du parc, et on apprendrait à l'ignorer avant le
jour où il compte. Une limite est assumée et écrite : le compte porte sur les
mois TRAVERSÉS, et un exercice qui ne commence pas un premier ni ne finit un
dernier jour de mois est compté par le mois où tombe sa borne · le cas est
irrégulier au regard de l'art. 7 lui-même, et aucune source lue ne dit comment
l'arrondir.

DEUX CHEMINS D'ARTICLE, et ils ne se servent jamais l'un pour l'autre. Côté
SYSCOHADA, AUDCIF art. 34, dernier alinéa. Côté SYCEBNL, cet art. 34 est
justement dans la liste d'exclusion de son art. 3 (« 25 À 34 ») · la règle lui
vient de son PROPRE art. 16, 7°, qui l'écrit mot pour mot. Citer l'AUDCIF à une
association serait invoquer un article que son référentiel écarte.

LE LOGICIEL N'ADAPTE RIEN, ET C'EST LE REFUS DE CE CHANTIER. Le texte confie
l'adaptation à l'ENTITÉ et la mention aux Notes annexes. Proratiser un compte de
résultat sur le rapport des durées fabriquerait des montants que personne n'a
décidés ; proratiser un bilan n'aurait même pas de sens, un bilan étant un
STOCK à une date et non un flux. Une adaptation automatique rendrait une colonne
plausible, comparable et inventée · le pire des trois états possibles. Un test
relit `comparabilite-exercices.ts` et refuse qu'un prorata y apparaisse un jour.

LA RÈGLE VIT UNE FOIS et le contrôle `COMPARATIF_N1_NON_COMPARABLE` l'appelle.
Elle n'est PAS portée dans les treize états : la comparabilité est une propriété
du COUPLE d'exercices, pas de chaque tableau, et la recopier treize fois aurait
divergé au premier correctif. La gravité est AVERTISSEMENT · la mention est un
« doit » des deux textes, mais elle s'écrit aux Notes annexes et ne bloque aucun
travail en cours.

CE QUE LE CONTRÔLE NE SAIT PAS LIRE, et qu'il ne prétend pas lire : un
changement de méthode, une refonte du plan de comptes, un changement de
périmètre. Aucun de ces trois ne se déduit d'une date. Seule la DURÉE est
mécanique, et `CodeNonComparabilite` est une union fermée pour qu'un quatrième
motif oblige quelqu'un à décider comment il se constate.

**Mandat du contrôleur des comptes · le contrôle réclamait une vérification que
le logiciel rendait impossible.** `regles-auditeur.ts` sait depuis longtemps QUI
doit désigner un contrôleur, et le contrôle 6 disait au cabinet, en toutes
lettres, « Vérifiez que le mandat est en cours ». Aucune table ne le détenait.
Même forme que `Tenant.longueurCompte`, qui promettait une méthode inexistante :
une exigence qu'on ne peut pas satisfaire est une exigence qui apprend à être
ignorée.

TROIS DURÉES, ET ELLES NE SE SERVENT JAMAIS L'UNE POUR L'AUTRE. SYCEBNL art. 21
· « L'auditeur est nommé pour TROIS (3) exercices RENOUVELABLES UNE FOIS ».
AUSCGIE art. 704, société anonyme · DEUX exercices quand le commissaire est
désigné dans les statuts ou par l'assemblée constitutive, SIX quand il l'est par
l'assemblée générale ordinaire · la durée dépend donc de l'ORGANE, pas seulement
de la forme, et la déduire de la forme seule donnerait un mandat trois fois trop
long ou trois fois trop court. AUSCGIE art. 379, SARL · TROIS exercices.

LE PIÈGE EST LE « TROIS », neuvième occurrence de « un nombre, deux sens » après
le 192, le 4181, le 1061/1062, le 38/37, le 397, l'article 11 et le taux de TVA
de la grille. Le trois du SYCEBNL est renouvelable UNE FOIS et pas davantage ;
celui de l'art. 379 n'est assorti d'AUCUNE limite de renouvellement. Appliquer
la limite du SYCEBNL à une SARL inventerait une interdiction (§ 10 bis) ; ne pas
l'appliquer à une association laisserait passer un troisième mandat que le texte
refuse. Même partage pour la réduction « si l'entité a une existence inférieure
à trois exercices » · elle est PROPRE au SYCEBNL, et la transposer raccourcirait
un mandat que l'AUSCGIE ne raccourcit pas.

LE VRAI PIÈGE DU CHANTIER EST L'ARTICLE 22, ET IL VA DANS LE SENS INVERSE DE
L'INTUITION. Un mandat dont le dernier exercice est passé n'est PAS un trou :
« si l'assemblée […] ne procède pas au renouvellement du mandat de l'auditeur ou
à son remplacement à l'expiration de son mandat, la mission de l'auditeur est
PROROGÉE, sauf refus exprès de sa part », jusqu'à la prochaine assemblée statuant
sur les comptes. Crier « mandat expiré » serait un signalement faux : l'entité a
un contrôleur, et le cabinet corrigerait un manquement inexistant. D'où
`MANDAT_AUDITEUR_PROROGE` en gravité INFORMATION, et
`MANDAT_AUDITEUR_SANS_PROROGATION` en AVERTISSEMENT sur le SEUL fait que
l'article oppose à la prorogation · le refus exprès du contrôleur.

L'INSCRIPTION AU TABLEAU DE L'ORDRE EST EXIGÉE ET JAMAIS VÉRIFIÉE. L'art. 20
veut un expert-comptable « inscrit au tableau de l'ordre […] ou de l'organe qui
en tient lieu » (l'ONEC en RDC) ; OmegaX ne consulte aucun tableau. Il conserve
la référence parce que c'est elle qu'un réviseur demandera, et le message le DIT
plutôt que de laisser croire à une vérification · même parti que la source d'un
relevé d'unités d'œuvre.

CE QUE LE MODULE NE SAIT PAS EST DÉCLARÉ ABSENT. La SAS (art. 853-13), la SNC
(art. 289-1), la commandite simple, le GIE, la coopérative et l'entreprenant
n'ont dans les textes lus AUCUNE durée de mandat chiffrée · `dureeMandat` rend
alors `null`, la durée se saisit, et aucun refus n'est opposé. Une règle absente
n'est jamais remplacée par la plus proche.

ET LA FENÊTRE A CHANGÉ DE MENU PARCE QU'UN TEST L'A REFUSÉE. Placée sous
« État > Contrôle et révision », elle faisait tomber le plafond de
`chrome-etroit.spec.ts` (seize lignes à 360 px), dont le commentaire interdit
justement de relever le chiffre d'un cran. Le refus avait raison sur le FOND :
les registres de ce groupe sont ce que le CABINET produit en révisant, alors que
le mandat est ce que l'ENTITÉ a fait devant son assemblée, au même titre que sa
forme juridique. La fenêtre vit sous « Structure », à côté des paramètres du
dossier. Un plafond qui fait relire la place d'une fenêtre au lieu de se faire
relever est un plafond qui a servi.

Dix-huit doublures Prisma ont été complétées, jamais contournées · le contrôle 28
lit une table réelle, et une doublure muette dessus validerait un service qui
n'existe pas.

**Échéances fiscales au tableau de bord · l'échéancier n'avertissait que ceux
qui y pensaient déjà.** Il existe depuis le chantier des retenues, complet et
sourcé, et il ne vivait que dans la fenêtre Retenues · c'est-à-dire à l'endroit
où l'on va QUAND ON Y PENSE. Le tableau de bord est le seul écran qu'un cabinet
ouvre sans avoir de raison particulière, et c'est là qu'une échéance avertit
quelqu'un.

LA RÈGLE QUI TIENT TOUT LE PANNEAU · UNE DÉCLARATION N'EST JAMAIS EN RETARD
CONSTATÉ, UN REVERSEMENT L'EST. Aucune comptabilité ne porte le DÉPÔT d'une
déclaration : le serveur ne rend d'ailleurs que sa PROCHAINE occurrence, jamais
une occurrence échue. Un reversement, lui, se lit dans les livres · une somme
retenue au crédit d'un compte et non versée EST un fait comptable, et
`moisEnRetard` le mesure. Traiter les deux pareil mettrait en rouge une
obligation peut-être déposée depuis des semaines, et le cabinet corrigerait un
manquement qui n'existe pas (§ 10 bis).

L'HORIZON EST EN JOURS, PAS EN NOMBRE DE LIGNES. « Les cinq prochaines » masque
en silence tout ce qui tombe après la cinquième, et rien à l'écran ne le dit. Un
horizon se DÉCLARE et ce qui le dépasse se COMPTE · « et 2 autres au-delà de
30 jours » est une phrase vraie. Les trente jours sont une convention de lecture
d'OmegaX, aucun texte ne les fixe, et le panneau les écrit dans son titre.

UN RETARD CONSTATÉ REMONTE EN TÊTE, quelle que soit sa date · c'est le seul cas
où une pénalité court DÉJÀ, et le trier par date le ferait disparaître sous des
échéances qui, elles, ne coûtent encore rien. Il est retenu même hors de
l'horizon.

ET LE PANNEAU NE DIT JAMAIS « À JOUR ». Une liste vide veut dire « rien dans les
trente jours », pas « tout est déposé et payé » · le logiciel n'a aucun moyen de
vérifier le second, et c'est exactement celui qu'un cabinet croirait. La réserve
est ÉCRITE sous la liste vide plutôt que simplement omise, et un test relit
`DashboardPage.tsx` pour y interdire « à jour », « en règle », « aucun retard »
et « conforme ».

La date de référence vient du SERVEUR, jamais de l'horloge du poste · c'est lui
qui a calculé les dates, et deux navigateurs mal réglés afficheraient sinon deux
calendriers pour le même dossier. La règle vit hors du composant
(`client/src/lib/echeances-a-venir.ts`), ce qui la rend vérifiable sans monter
React · même parti que `resoudreExercice`.

**Accord-cadre avec le Ministère du Plan · le manque que le logiciel déclarait
lui-même.** `exemption-is-ebnl.ts` écrivait depuis G4a, en toutes lettres, que
« OmegaX NE TIENT PAS l'accord-cadre : le dossier ne porte qu'un certificat
d'enregistrement du Ministère du Plan, qui est une autre pièce ». Manque
DÉCLARÉ, refermé.

LES QUATRE CONDITIONS SONT PORTÉES ENSEMBLE, pas seulement l'accord. La loi
n° 004/2001, art. 37, en pose quatre CUMULATIVES à l'organisation étrangère :
une représentation en RDC, l'accord-cadre avec le Ministère du Plan, les
attestations de bonne conduite du personnel expatrié légalisées par
l'Ambassade ou le Consulat, et « la main d'œuvre locale à concurrence de 60 %
au minimum ». N'en tenir qu'une aurait recréé le même manque partiel.

LE PÉRIMÈTRE EST LE PREMIER REFUS, et c'est le § 10 bis. La sous-section II ne
vise QUE l'organisation ÉTRANGÈRE, et l'art. 35 réserve le mot ONG à
« l'association sans but lucratif […] dont l'objet concourt au développement
social, culturel et économique des communautés locales ». Réclamer un
accord-cadre à une ONG de droit CONGOLAIS (qui relève de l'art. 36), à une
association confessionnelle ou à un établissement d'utilité publique serait une
exigence inventée, sourcée, plausible et fausse. La fenêtre dit « ce dossier
n'est pas concerné » plutôt que d'afficher un formulaire vide qui ressemblerait
à un manquement.

TROIS PIÈCES QUI NE SE CONFONDENT PAS, et c'est la confusion que ce module
existe pour empêcher. L'ACCORD-CADRE conditionne l'EXISTENCE de l'ONG étrangère
en RDC (art. 37). L'ARRÊTÉ INTERMINISTÉRIEL des Ministres du Plan et des
Finances ouvre les EXONÉRATIONS (art. 39, module `exonerations`). Le CERTIFICAT
D'ENREGISTREMENT du Ministère du Plan est encore autre chose. Croire qu'un
accord signé exonère ferait dédouaner sur une pièce qui ne le permet pas · un
test gèle les trois mentions dans `exemption-is-ebnl.ts`.

LA DURÉE EST SAISIE, ET L'ORIGINE DES DIX ANS EST DITE. La loi n'en fixe
AUCUNE. Les « dix ans renouvelable par tacite reconduction, à moins d'être
dénoncé par l'une des parties 6 mois avant la fin de chaque période » viennent
de l'article IX du MODÈLE d'accord-cadre annexé au guide pratique du cabinet
Kahasha (annexe VIII) · un modèle, pas le texte légal. Les coder en dur ferait
lire sur dix ans un accord conclu pour trois, et ferait passer une clause de
modèle pour une règle de droit. `MODELE_KAHASHA` les propose TOUJOURS avec leur
source.

UNE PÉRIODE ÉCOULÉE N'EST PAS UNE FIN · même forme que la prorogation de plein
droit du mandat de l'auditeur (SYCEBNL art. 22), rencontrée au chantier
précédent, et même refus. Sous tacite reconduction l'accord repart pour une
période identique tant qu'aucune partie ne l'a dénoncé, et annoncer « accord
expiré » serait un signalement faux. Seule la DÉNONCIATION l'arrête, comme seul
le refus exprès arrête la prorogation du mandat. Ce qui est rendu, à la place,
est le DERNIER JOUR POUR DÉNONCER (fin moins le préavis) · la seule date encore
utilisable, et celle que l'accord ne calcule pas lui-même. Sans préavis
stipulé, aucune date n'est inventée.

LA PART DE MAIN-D'ŒUVRE LOCALE EST SAISIE, JAMAIS CALCULÉE. OmegaX n'a pas de
module de paie : aucun effectif, aucune nationalité, aucun contrat, et un
pourcentage déduit d'un compte 66 serait une invention. La SOURCE est exigée
avec le nombre, comme pour les relevés d'unités d'œuvre · c'est elle qu'un
contrôleur demandera. Et le contrôle ne s'allume que sur une part DÉCLARÉE sous
le seuil : une part absente n'est pas une part insuffisante, et la traiter comme
telle accuserait tout dossier qui n'a rien saisi.

**Checklist de constitution · le logiciel tenait l'aval de la chaîne sans son
amont.** Le module `exonerations` porte les trois dossiers de facilités de la
note circulaire n° 003/2013 (section B), et chacun exige « le certificat
d'enregistrement EN COURS DE VALIDITÉ délivré par le Ministère ayant le Plan
dans ses attributions ». La section A de la même note, celle qui dit COMMENT on
obtient ce certificat, n'était nulle part · le logiciel réclamait une pièce dont
il ne savait rien dire.

TROIS FONDEMENTS, ET ILS NE SE VALENT PAS. C'est la décision centrale, et une
checklist qui présenterait les dix pièces comme également « légales » serait
fausse. LOI · la pièce est exigée par la loi n° 004/2001, article à l'appui (les
cinq pièces de la personnalité juridique viennent de l'art. 4, pas d'une
pratique). PRATIQUE_ADMINISTRATIVE · elle est exigée par la note circulaire, qui
écrit d'elle-même qu'elle « ne crée pas de droit nouveau » ; la refuser bloque le
dossier sans que ce soit une obligation légale. USAGE_SANS_BASE_LEGALE ·
l'acte de reconnaissance de l'autorité politico-administrative, point 4 de la
liste officielle, dont le guide Kahasha (§ 6) écrit que « cette exigence ne
découle d'AUCUN TEXTE LÉGAL. Elle procède de la pratique d'un ancien texte de
loi, savoir le Décret-loi n° 195 du 29 janvier 1999 en son article 37, ABROGÉ
par la loi n° 004/2001 », et que « cette procédure informelle […] peut se
révéler dangereuse pour l'ONG et ne lui fournit aucune garantie ». Elle est
CONSERVÉE dans la liste, puisqu'un dossier sans elle est recalé, ET son origine
est dite · taire l'un ou l'autre tromperait dans un sens ou dans l'autre.

AUCUN MONTANT DE FRAIS DGRAD N'EST DONNÉ. Le texte imprimé porte 50 et 100 USD,
tous deux BARRÉS À LA MAIN sur le scan et remplacés par une annotation
manuscrite dont la lecture reste incertaine. Une annotation en marge n'a pas la
valeur probante du texte imprimé · un test interdit tout chiffre de barème dans
le catalogue, et la réserve renvoie à la DGRAD.

ET LE DOSSIER DE L'AVIS DE TUTELLE N'EST PAS INVENTÉ. Le guide est explicite :
« la loi ne détermine NI la forme de la requête […] NI la procédure […] NI les
frais à payer. Chaque Ministère les fixe librement. » Lister des pièces là
ferait passer une supposition pour une exigence · l'étape porte la seule chose
que le texte écrive, et dit le reste.

AUCUNE TABLE NOUVELLE, ET C'EST LE CHOIX DU CHANTIER. Une checklist cochable
aurait dupliqué `actePersonnaliteJuridique`, `numeroEnregistrementSecteur` et
`certificatEnregistrementPlan`, qui sont exactement les PRODUITS des trois
étapes. Deux endroits pour le même fait auraient divergé au premier correctif.
Ce qui est rendu est une CONFRONTATION : le parcours tel que les textes
l'écrivent, et en face ce que le dossier détient. L'appariement se fait PAR
CLÉ d'étape, jamais par rang · un rang se décale le jour où une étape s'insère,
et un produit se retrouverait en face de la mauvaise démarche sans qu'aucun
total ne bouge.

UN DÉFAUT RÉINJECTÉ N'A PAS ÉTÉ VU, et c'est ce qui a fait écrire le garde-fou
ci-dessus. Remplacer `detenu[e.cle]` par `Object.values(detenu)[i]` laissait
passer les dix tests : avec l'ordre actuel du catalogue, rang et clé coïncident.
Le défaut est invisible aujourd'hui et faux demain. Aucun jeu d'essai ne peut le
montrer sans inventer une étape qui n'existe pas · la propriété se gèle donc
dans la SOURCE, comme l'absence de prorata dans `comparabilite-exercices.ts`.

Enfin les quatre conditions de l'art. 37 ne sont PAS recopiées ici · elles
vivent dans le module `accord-cadre`, et l'étape correspondante y renvoie. Deux
listes divergentes de la même règle, le dossier a déjà payé pour savoir ce que
ça coûte.

**Facturation · la pièce que la loi exige pour chaque transaction, et qui
n'existait pas.** Une vente n'était qu'une écriture, et sa seule trace de
facture était `Ecriture.reference`, chaîne libre. La loi de procédures fiscales
art. 23 (modifié par la loi n° 23/052) veut au contraire, « POUR CHAQUE
TRANSACTION EFFECTUÉE », une facture « dont les mentions sont déterminées par
voie réglementaire ».

LA PREMIÈRE CHOSE QUE LA FENÊTRE DIT EST CE QU'ELLE N'EST PAS. L'art. 58 de
l'O.-L. n° 10/001 veut une facture NORMALISÉE « produite par les dispositifs
électroniques fiscaux », et l'art. 59 quater exige qu'un « système de
facturation propre » soit HOMOLOGUÉ avant toute utilisation. OmegaX ne l'est
pas, et aucune source lue ne décrit la procédure, renvoyée aux spécifications
de l'Administration. Imprimer une pièce d'allure officielle sans le dire ferait
croire à un cabinet qu'il est en règle · c'est le § 10 bis dans son sens le
plus coûteux. Le module tient donc la facture comme PIÈCE JUSTIFICATIVE
(AUDCIF art. 17, dix ans) et comme source de l'état détaillé, ce qui ne demande
aucune homologation, et il le porte en tête de l'écran.

LES NEUF GROUPES DE L'ART. 100 du décret n° 011/42 sont transcrits dans l'ordre
du texte, et leur nombre est EN DUR. TROIS d'entre eux ne se lisent que sur des
LIGNES (désignation et quantité ; prix unitaire et global ; taux et montant de
TVA), et trois autres en dépendent : une pièce sans lignes manque SIX groupes
sur neuf. C'était exactement l'état de chaque vente d'OmegaX, et rien ne le
disait.

LE TOTAL DE L'AMENDE NE SE CALCULE PAS. L'art. 97 bis punit « 750.000 FC
(personnes morales) ; 250.000 FC (personnes physiques), PAR OMISSION » sans
définir l'unité de l'omission · le groupe de l'art. 100, ou chacun de ses
éléments. Multiplier neuf par 750.000 afficherait un barème que personne n'a
écrit. Le module rend le montant UNITAIRE avec sa source, la réserve TOUJOURS,
et un test relit la source pour y interdire la multiplication.

L'ÉTAT DÉTAILLÉ EST LE VRAI ENJEU. L'art. 56 en fait la CONDITION du droit à
déduction : « le défaut de production entraîne la RÉINTÉGRATION D'OFFICE des
déductions opérées, après mise en demeure non suivie de régularisation dans les
cinq jours ». Le module de TVA calculait donc, depuis toujours, un montant
déductible exact dont il ne détenait aucune des pièces justificatives, et il
n'en disait pas un mot. Le contenu de l'art. 134 se lit ligne à ligne (« nature
et désignation », « quantité », « prix HT ») · rien de tout cela n'existait
nulle part.

QUATRE DÉCISIONS DE LECTURE, chacune fausse si on l'oublie. L'état ne lit que
les factures d'ACHAT · y mêler les ventes ferait lire à l'Administration une
déduction jamais demandée. Sur un achat, le FOURNISSEUR est l'ÉMETTEUR et non
la contrepartie, qui est le dossier lui-même · l'inverser ferait nommer le
dossier comme son propre fournisseur, sur un état qui boucle parfaitement. Une
ligne incomplète est SIGNALÉE et jamais écartée · l'écarter produirait un état
d'apparence complète, ce que l'Administration refuse précisément. Et le VOLET
IMPORTATIONS n'est PAS couvert : il demande le numéro, la date et le montant de
la déclaration de mise à la consommation et la valeur en douane, qu'OmegaX ne
tient nulle part · lacune DÉCLARÉE sur l'état lui-même, jamais comblée par une
valeur déduite d'un compte d'achat.

AUCUN CLOISONNEMENT PAR RÉFÉRENTIEL, et ce n'est pas un oubli de la § 6.
L'art. 23 vise « les redevables de l'Impôt sur les Sociétés et de la Taxe sur
la Valeur Ajoutée ainsi que, le cas échéant, ceux de l'Impôt sur le Revenu des
Personnes Physiques », pas les tenants d'un référentiel comptable. Une ASBL
assujettie à la TVA sur une activité accessoire y est tenue comme une SARL, et
lui fermer la fenêtre lui retirerait l'état détaillé dont sa déduction dépend.
C'est donc le premier morceau de gestion commerciale à être COMMUN, alors que
le § 8.4 du plan annonçait la gestion commerciale comme propre au SYSCOHADA ·
le § 8.4 parlait du DEVIS et de la COMMANDE, qui le sont ; la facture est une
obligation fiscale des deux.

LES IDENTITÉS SONT RECOPIÉES SUR LA FACTURE, jamais relues sur la fiche du
tiers. Une facture est un document daté : le nom et le numéro impôt qui y
figurent sont ceux du jour où elle a été établie. Les relire ferait changer
rétroactivement une pièce justificative dès qu'un fournisseur déménage ou
obtient son numéro impôt, et l'état détaillé déclaré l'an dernier ne se
reconstituerait plus à l'identique. Même raison pour la mention « autorisation
d'acquitter la TVA d'après les débits » (décret art. 60), qui se lit sur la
facture et non sur le tiers.

LE MONTANT HT EST CELUI QUI FIGURE SUR LA PIÈCE, pas quantité × prix unitaire
recalculé · une remise de ligne, un arrondi du fournisseur ou une facture reçue
en devise recalculée au cours du jour font diverger les deux, et c'est le
document qui fait foi. Et `imposable` est un BOOLÉEN, jamais déduit d'un taux
nul : une opération exonérée et une opération au taux zéro (art. 24,
exportations) sont deux choses différentes, et l'art. 100 exige justement de
les distinguer.

AUCUNE COMPTABILITÉ PARALLÈLE · règle de revue de la § 7 du plan de
construction. La facture ne porte aucun montant au grand livre : elle POINTE
vers l'écriture passée par `EcritureService`, un pour un, et c'est l'écriture
qui fait foi.

ET LE TEST QUI COMPTE N'EST PAS DANS CE MODULE. `graphe-applicatif.spec.ts` a
refusé le premier jet parce que `FacturationModule` n'importait pas
`LicenceModule` : le `LicenceGuard` de son contrôleur ne se résolvait pas.
Compilation propre, 3 397 tests verts, et un serveur qui n'aurait pas démarré ·
exactement la panne du 2026-09-02 que ce test existe pour attraper.

**CORRECTION DU 2026-09-13 · la facture normalisée, et une lacune déclarée à
tort.** Le module de facturation a porté pendant un jour une phrase fausse, et
c'est l'ÉCRAN qui l'affichait : « aucune source lue ne décrit la procédure
d'homologation, renvoyée aux spécifications de l'Administration ». Le texte
existe, il est daté, et il a été trouvé en inventoriant le corpus fiscal pour
bâtir le plan de confrontations · pas par un chantier, pas par un test.

**DÉCRET N° 23/10 DU 3 MARS 2023** portant réglementation de la facture
normalisée et fixation des modalités de mise en œuvre des dispositifs
électroniques fiscaux. Trois conséquences, toutes dans le code désormais.

UNE LACUNE DÉCLARÉE À TORT EST AUSSI FAUSSE QU'UNE RÈGLE INVENTÉE, et c'est la
leçon à retenir. Le § 10 bis visait jusqu'ici le signalement qui fabrique une
anomalie ; celui-ci fabrique une DISPENSE. Dire « aucun texte ne prévoit la
procédure » conclut le sujet et fait renoncer à une démarche qui est due. Le
coût est le même, la direction est inverse, et rien dans les tests ne pouvait
l'attraper : une absence de source ne se vérifie que contre le corpus entier.

**1 · OMEGAX EST UN SFE, et la procédure porte un nom.** Art. 3, 7° : « Système
de Facturation d'Entreprise (SFE) : logiciel de facturation ou solution
informatique permettant à une entreprise de gérer tout ou partie de son
processus de facturation. Pour pouvoir émettre une facture normalisée, le
système de facturation d'entreprise doit être homologué et relié soit à un MCF
physique, soit à un MCF dématérialisé. » Art. 22 : un SFE développé en propre
« ne peut être utilisé qu'après obtention d'une ATTESTATION DE CONFORMITÉ
délivrée par l'Administration fiscale ». Ce qui reste hors corpus est l'ARRÊTÉ
de l'art. 23, qui en fixe les modalités · la suite n'est donc pas une lecture
de plus, c'est une démarche auprès de la DGI. Et les art. 20 et 21 dépassent la
seule émission : « seuls les SFE homologués sont proposés à la vente aux
contribuables et utilisés en République Démocratique du Congo ». C'est un
arbitrage qui appartient à Manasse, porté au plan.

**2 · LES MENTIONS SONT DOUZE, PAS NEUF, et dix sont dues.** L'art. 100 du
décret n° 011/42 de 2011, sur lequel le module avait été bâti, en portait neuf.
L'art. 26 du décret de 2023 en porte douze et l'art. 28 abroge « toutes les
dispositions antérieures contraires ». Le dixième est nouveau · « j) le montant
de tous autres impôts et taxes, LE CAS ÉCHÉANT ». Les deux derniers (numéro du
dispositif électronique, code d'authentification et code QR) ne s'obtiennent
que d'un DEF, et le dernier alinéa du même article les retire expressément du
« document tenant lieu de facture normalisée », qui est ce que produit OmegaX.
Le module sert donc DIX groupes, et NOMME les deux hors de portée sur chaque
pièce plutôt que de les taire ou de les compter manquants.

« LE CAS ÉCHÉANT » NE VEUT PAS DIRE « FACULTATIF », il veut dire « s'il y en
a ». Aucun logiciel ne sait s'il y a d'autres impôts sur une opération donnée :
`Facture.autresImpotsEtTaxes` est donc NULLABLE, null valant « pas de réponse »
et comptant comme une omission. Un défaut à zéro aurait répondu à la place du
comptable sur chaque facture, et servi la mention sans que personne ne
l'examine.

**3 · L'ONG EST NOMMÉE DU CÔTÉ DE CELUI QUI REÇOIT.** Art. 27 : « les
entreprises privées, LES ORGANISATIONS NON GOUVERNEMENTALES, les acteurs
d'exécution de la dépense publique […] sont tenus de n'accepter que les
factures normalisées ». Et art. 25 : la TVA n'est déductible que si elle figure
sur une facture normalisée ou un document en tenant lieu dûment délivré par un
assujetti. C'est la confirmation la plus nette que ce module ne devait pas être
cloisonné · une ASBL est concernée quand elle REÇOIT, pas seulement quand elle
émet, et c'est exactement ce que l'état détaillé de l'art. 134 recense.

Quatre défauts réinjectés sur cette correction, quatre détectés · dont le
défaut d'hier lui-même, le retour aux neuf mentions.

**PASSE F1 · ce que la confrontation du décret n° 23/10 a trouvé (2026-09-13).**
Première passe du plan de confrontations, menée en workflow d'agents. 57
obligations extraites du texte, 30 constats, **25 réfutés par l'étape adverse**,
5 retenus et corrigés. Journal complet : `docs/releve-de-manques-fiscal.md`.

**L'ADRESSE EXACTE · art. 26 a) et b), et c'est le plus grave.** Le texte écrit
« les nom, post-nom et prénom ou raison sociale, L'ADRESSE EXACTE, le numéro
impôt du vendeur ou prestataire », et de même du client. Le module avait été
bâti sur l'art. 100 de 2011, qui n'écrit que « identité et n° impôt ». Ce
n'était pas un champ de moins : `verifierMentions` rendait `conforme: true` sur
une pièce qui omet une mention obligatoire, et l'écran l'affichait ainsi, sans
amende, quand l'art. 97 bis en punit chaque omission de 750 000 FC. **Le
logiciel rassurait à tort sur exactement ce qu'il a été construit pour
surveiller.** L'adresse est recopiée à la date de la pièce, comme le nom, et
aucune dérogation n'est fabriquée pour un client non immatriculé · le texte n'en
prévoit pas, et en inventer une dispenserait de la mention sur toute vente à un
particulier.

**LE BORNAGE À L'ENTRÉE EN VIGUEUR · art. 29.** « Le présent Décret […] entre en
vigueur à la date de sa signature », le 3 mars 2023, sans vacatio legis. Le
module l'appliquait à toute date : une facture de 2022 reprise dans un dossier
se voyait reprocher l'adresse exacte au nom d'un décret qui n'existait pas
encore, avec une amende chiffrée sur ce reproche. **Le dépôt connaissait sa
propre doctrine et ne l'avait pas appliquée ici** · `controles.service.ts` écrit
« LE BORNAGE N'EST PAS UNE PRÉCAUTION, C'EST LE CONTRÔLE LUI-MÊME ». Le module
de facturation était le seul endroit où un texte fiscal daté s'appliquait sans
sa borne.

CE QUI S'APPLIQUAIT AVANT N'EST PAS « RIEN » · l'art. 28 n'abroge que les
dispositions « CONTRAIRES », et les neuf groupes de l'art. 100 ne le sont pas,
ils sont le noyau des douze. `texteApplicable(dateFacture)` choisit donc la
liste en vigueur À LA DATE DE LA PIÈCE, et l'écran dit laquelle il applique.

**L'ART. 25 RENDU EXCLUSIF.** Le module écrivait « la TVA n'est déductible QUE
SI elle figure sur une facture normalisée ou un document en tenant lieu ». Le
texte dit « DE FAÇON GÉNÉRALE » pour ce cas et en nomme deux autres : la
déclaration de mise à la consommation en cas d'importation (2°), la facture à
soi-même (3°). Un cabinet pouvait en conclure qu'une TVA d'importation portée au
445 n'ouvrait pas droit à déduction · le logiciel l'aurait dissuadé d'une
déduction que le texte lui accorde. Les trois supports sont rendus, avec ceux
qu'OmegaX ne tient pas, et l'état détaillé nomme désormais l'art. 25, 2° et pas
seulement l'imprimé de l'art. 134.

**L'ARRÊTÉ DE L'ART. 25 · la même faute, commise une seconde fois le même
jour.** Le module se range dans la catégorie « document en tenant lieu » et en
tire une DISPENSE des points k) et l). Or c'est un arrêté qui définit cette
catégorie (art. 25, dernière phrase), et il n'est dans aucune source lue,
exactement comme celui de l'art. 23 corrigé le matin même. La qualification est
écrite comme une HYPOTHÈSE. **Anomalie du texte source signalée et non
tranchée** · dans la compilation lue, cette phrase est typographiquement à
l'intérieur du point 3 alors qu'elle définit un terme du point 1 ; ne pas la
« corriger » sans le Journal officiel.

**CE QUE LA PASSE APPREND SUR LA MÉTHODE, et qui vaut pour les trente
suivantes.** Les cinq constats portent sur des articles que la session
principale avait LUS la veille en construisant le module : trois lui avaient
échappé parce qu'elle lisait le texte à travers le code qu'elle écrivait.
**C'est l'indépendance du lecteur qui paie, pas le nombre d'agents.** Et
l'étape adverse est le cœur du dispositif, pas un supplément : vingt-cinq
constats sur trente ne survivent pas, et un relevé sans elle serait à 83 % du
bruit · du bruit qu'on corrigerait. Un réfutateur peut d'ailleurs RENFORCER un
constat au lieu de le tuer, et c'est un comportement à conserver.

**Devis et commande client · l'OFFRE et son ACCEPTATION, où l'intuition
commerciale se trompe quatre fois.** Un devis n'est pas un brouillon de
facture : s'il est suffisamment précis et indique la volonté d'être lié, c'est
une OFFRE au sens de l'AUDCG art. 241, et son acceptation FORME le contrat
(art. 244). Les logiciels de la place lui donnent un statut libre ; le texte,
lui, attache à chaque état des conséquences que personne ne choisit.

LE PÉRIMÈTRE EST LE PREMIER REFUS, et il est plus étroit qu'on ne croit. Le
Livre 8 régit la vente de MARCHANDISES entre COMMERÇANTS (art. 234). Il ne
régit PAS les marchandises achetées pour un usage personnel, familial ou
domestique (art. 235 a), ni « les contrats de fourniture de marchandises dans
lesquels LA PART PRÉPONDÉRANTE de l'obligation […] consiste dans une fourniture
de main-d'œuvre ou d'autres services » (art. 235 b), ni les six régimes
particuliers de l'art. 236 (enchères, saisie, valeurs mobilières, créances et
instruments financiers, navires et aéronefs, électricité). Une société de
conseil, de gardiennage ou de nettoyage vend des SERVICES : lui estampiller
« art. 241 » appliquerait une règle hors de son domaine, avec des délais et des
qualifications qui ne la concernent pas. La nature est SAISIE et jamais déduite,
la prépondérance d'un contrat mixte étant une qualification du cabinet.

LE REFUS CENTRAL EST QUE LE SILENCE NE VAUT RIEN. Art. 243, dernière phrase :
« LE SILENCE OU L'INACTION NE PEUT À LUI SEUL VALOIR ACCEPTATION. » Un devis
dont le délai s'est écoulé sans réponse n'est donc NI accepté NI refusé · il est
CADUC. Le basculer en « refusé », ce que font les logiciels de la place,
attribue au client un rejet qu'il n'a jamais exprimé et fausse la relance comme
la statistique commerciale ; le basculer en « accepté » inventerait un contrat.
Aucun chemin du service n'écrit `natureReponse` ailleurs que sur l'appel qui
enregistre une réponse REÇUE, et un test gèle cette unicité dans la source ·
aucun jeu d'essai ne peut montrer l'absence d'un second chemin.

C'est la troisième fois que la forme se présente, et la troisième fois qu'elle
prend un sens DIFFÉRENT · un terme échu n'est jamais un dénouement, mais pas
pour la même raison. Le mandat de l'auditeur se PROROGE de plein droit (SYCEBNL
art. 22), l'accord-cadre se RECONDUIT tacitement, et l'offre, elle, devient
simplement inacceptable sans que personne n'ait rien décidé.

DEUX DATES, ET UNE SEULE FAIT COURIR LE DÉLAI · dixième occurrence de « un
nombre, deux sens ». L'offre PREND EFFET quand elle PARVIENT au destinataire
(art. 242), mais le délai d'acceptation « commence à courir au moment où l'offre
est EXPRIMÉE », la date portée sur l'offre étant présumée celle de son expédition
(art. 246). Compter depuis la réception rallongerait l'offre de tout le temps
d'acheminement, et le logiciel tiendrait pour ouverte une offre déjà close.

AUCUN DÉLAI PAR DÉFAUT. À défaut de stipulation, l'art. 243 renvoie à un « délai
raisonnable, compte tenu des circonstances, notamment de la rapidité des moyens
de communication utilisés », que le texte ne chiffre pas. Poser trente jours
« par convention » rendrait caduque une offre que le texte tient encore pour
ouverte · un test interdit toute constante de délai dans le fichier.

UN DÉLAI SEUL NE REND PAS L'OFFRE FERME. Art. 242 : l'offre ne peut être révoquée
« si elle indique, EN FIXANT UN DÉLAI DÉTERMINÉ POUR L'ACCEPTATION, QU'ELLE EST
IRRÉVOCABLE ». Deux conditions cumulatives. « Valable jusqu'au 30 » n'engage à
rien ; « valable jusqu'au 30, offre ferme » engage. Déduire l'irrévocabilité de
la seule présence d'une date ferait croire au cabinet qu'il est tenu, et
l'empêcherait de révoquer une offre devenue ruineuse. La seconde branche du même
article (le destinataire « raisonnablement fondé à croire » et qui a agi en
conséquence) est ÉCRITE et jamais calculée.

L'ART. 245 NE LAISSE À UNE RÉPONSE QUE DEUX SENS, et c'est ce qui a décidé du
modèle. Une réponse porteuse d'éléments « n'altérant pas substantiellement les
termes de l'offre » vaut ACCEPTATION, et les termes du contrat sont ceux de
l'offre AVEC les modifications de l'acceptation. Une réponse qui contient « des
additions, des limitations ou d'autres modifications » VAUT REJET et constitue
une CONTRE-PROPOSITION. Un bon de commande qui s'écarte du devis n'est donc pas
une acceptation, et l'enregistrer comme telle inscrirait un contrat qui n'existe
pas.

D'OÙ L'ABSENCE DE TABLE « CommandeClient ». Une commande est une RÉPONSE, pas un
document de plus ; une contre-proposition est une OFFRE NOUVELLE, c'est-à-dire un
devis de sens inverse, chaîné au précédent par `contrePropositionDeId`. Une
négociation à trois allers-retours est une chaîne de trois devis, chacun gardant
son état propre. Une table parallèle aurait dupliqué le même fait sous deux
formes, et les deux auraient divergé au premier correctif. Le service refuse de
rattacher une contre-proposition à un devis qui n'a pas été rejeté
substantiellement, et INVERSE l'émetteur · l'offre nouvelle vient de celui qui a
rejeté.

LA SUBSTANTIALITÉ SE QUALIFIE, ELLE NE SE CALCULE PAS. C'est elle qui décide
entre un contrat formé et un contrat à reprendre à zéro, et le service exige donc
un écrit sur toute réponse modificative · personne ne saura six mois plus tard sur
quoi elle reposait.

CLOISONNÉ AU SYSCOHADA, et cette fois le § 8.4 du plan avait raison, contrairement
à la facture. La raison n'est PAS qu'une ASBL ne vendrait rien · elle peut proposer
un prix. C'est que l'art. 234 exige une vente entre COMMERÇANTS et qu'une
association n'en est pas une : la loi n° 004/2001, art. 1er, dit qu'elle « ne se
livre pas à des opérations industrielles ou commerciales, si ce n'est à titre
accessoire ». Lui servir la fenêtre lui appliquerait des règles qui ne la
régissent pas.

DEUX MENTIONS PORTÉES SUR LE DOCUMENT, parce que le client les découvre d'ordinaire
trop tard. Le total est HORS TAXES · art. 263, « le prix exprimé dans le contrat
est présumé convenu hors taxes ». Et les deux délais de dénonciation : un défaut
apparent le jour de la prise de livraison se dénonce DANS LE MOIS sous peine de
DÉCHÉANCE (art. 258), un défaut caché se prescrit par UN AN du jour où il a été
constaté ou aurait dû l'être (art. 259).

ENFIN LE DEVIS N'EST PAS OBLIGATOIRE, à la différence de la facture. Art. 240 ·
« le contrat de vente commerciale peut être écrit ou verbal ; il n'est soumis à
aucune condition de forme. Il est prouvé par tous moyens. » La fenêtre le dit,
pour ne jamais laisser croire qu'une vente sans devis serait irrégulière.

**Relevé bancaire importé et rapprochement proposé (2026-09-25).** Premier
manque « usage quotidien » de la comparaison avec Sage i7
(`docs/comparaison-sage-i7-omegax.md`). Le relevé de la banque (CSV ou XLSX)
s'importe dans un rapprochement EN COURS (`LigneReleveBancaire`), et OmegaX
PROPOSE les correspondances (`rapprochement/releve-bancaire.ts`). Sage fait la
même chose avec une tolérance de montant et une écriture d'ajustement ; OmegaX
reprend l'import et refuse les deux autres, pour les raisons du pré-lettrage.

CINQ RÈGLES À NE PAS DÉFAIRE. (1) LE SENS · débit et crédit du relevé sont ceux
de la BANQUE et restent tels qu'imprimés ; un crédit du relevé est un DÉBIT du
52 (`montantVuDuCompte`). Comparer débit à débit proposerait chaque
encaissement face à un décaissement du même montant. (2) AUCUNE TOLÉRANCE ·
deux montants voisins ne sont pas la même opération, et l'écart se
COMPTABILISE, il ne se rapproche pas (le refus du serveur le dit en ces mots).
(3) AUCUNE DEVINETTE · plusieurs écritures candidates, ou une écriture
convoitée par deux lignes du relevé, et RIEN n'est proposé ; « le plus proche »
se tromperait sans le dire. La référence départage, y compris par ses chiffres
à trois chiffres au moins (« CHQ 0042 » = « 0042 »). La fenêtre de dates est
une convention d'OmegaX, réglable à l'écran. (4) PROPOSER N'EST PAS POINTER ·
la proposition n'est pas stockée, les cases arrivent décochées, et la
confirmation REJOUE tout au serveur (même ligne libre, même compte, somme au
centime) avant de pointer ; une correspondance confirmée EST un pointage,
c'est lui que l'écart et la clôture lisent. Dépointer dénoue aussi la
correspondance. (5) RIEN N'EST PASSÉ D'OFFICE · une ligne du relevé sans
écriture (frais, agios, virement non saisi) est « à comptabiliser ». Une ligne
datée après la date du relevé est refusée à l'import, et un relevé qui ne
boucle pas (solde de départ + opérations ≠ solde imprimé) est signalé avant de
rapprocher.

**Règlement des tiers à partir des échéances (2026-09-25).** Deuxième manque
« usage quotidien » de la comparaison Sage i7. Fenêtre Traitement > Règlement
des tiers (`reglements/`). Le comptable coche les échéances dues, OmegaX passe
UNE pièce de trésorerie par tiers (plusieurs factures d'un tiers en un seul
règlement, comme Sage) et LETTRE aussitôt factures et règlement.

QUATRE RÈGLES À NE PAS DÉFAIRE. (1) LE RÈGLEMENT NE TOUCHE QUE LE TIERS ET LA
TRÉSORERIE · guide SYSCOHADA Partie 1 ch. 4 § 1 (flux juridique puis flux
financier) et fiches des comptes 40 et 41 des deux plans : 40 débité par la
trésorerie, 41 crédité par la trésorerie. (2) 408, 409, 418 ET 419 NE SE
RÈGLENT PAS · estimations de clôture ou avances, même sens dans les deux semis.
(3) MOINS QUE LE DÛ, C'EST UN PARTIEL ET UN LETTRAGE PARTIEL · PLUS, C'EST
REFUSÉ, l'excédent étant une avance ou un trop-perçu, une autre opération. (4)
TOUT SE VÉRIFIE AVANT LA PREMIÈRE PIÈCE · un lot ne s'arrête pas au sixième
règlement en laissant cinq pièces passées. Le lettrage porte l'origine MANUEL ·
ce n'est pas une présomption, le comptable a choisi les factures payées. Non
servi et dit · l'impression de l'ordre de paiement (chez Sage, le règlement
n'est effectif qu'après elle) ; ici la pièce naît au brouillard et la
validation joue ce rôle.

**Suppression des structures · tout lien retient (2026-09-25).** Troisième
manque de la comparaison Sage i7. Comptes, journaux, tiers et taux de taxes se
suppriment (route DELETE, administrateur seul), et la règle est celle du manuel
Sage i7 : « Il n'est pas possible de supprimer un compte mouvementé sur
l'exercice en cours ou sur un autre exercice ou encore utilisé dans une autre
commande du menu Fichier ou Structure (par exemple, un compte utilisé dans les
Taux de taxes) ».

TROIS RÈGLES À NE PAS DÉFAIRE. (1) ON NE S'EN REMET JAMAIS À LA BASE · sur une
relation FACULTATIVE, Prisma pose SET NULL et la suppression DÉNOUE le lien en
silence ; supprimer un taux sortirait ses lignes de la déclaration de TVA sans
erreur. `common/suppression/references.ts` compte donc toutes les références
avant de supprimer. (2) LA LISTE DES RELATIONS SE LIT DANS LE SCHÉMA (DMMF),
jamais à la main · trente et une relations pointent vers un compte, et une
table ajoutée demain sera comptée sans que personne y pense. C'est l'inverse
voulu de la liste écrite à la main des modules qui retiennent une écriture
(§ 10 bis) : ici tout lien retient, sans décision à prendre. Chaque comptage
sur une table cloisonnée porte la borne du dossier. (3) DEUX CAS PROPRES · un
compte TOTAL ne se supprime pas tant qu'il regroupe des sous-comptes, et les
rattachements d'un tiers partent avec lui mais un tiers dont un compte rattaché
est mouvementé est un tiers mouvementé. Le refus nomme chaque usage et renvoie
à la mise en sommeil.

**Contrepartie à chaque ligne et opérations exonérées (2026-09-25).** Point 5
de la comparaison Sage i7. `Journal.contrepartieChaqueLigne` porte l'option
« Générer une contrepartie à chaque ligne » des journaux de trésorerie (manuel
i7, codes journaux et journal Caisse) · chaque ligne saisie reçoit aussitôt sa
ligne sur le compte de trésorerie du journal, même libellé, sens inverse
(`lib/contrepartie-tresorerie.ts`), jamais sur la ligne de trésorerie
elle-même. Défaut FAUX, et REFUSÉE par le service hors trésorerie · cochée sur
un journal d'achats, elle solderait chaque charge contre une banque que le
journal ne porte pas.

UN ASSUJETTI A AUSSI DES OPÉRATIONS EXONÉRÉES (relevé par Manasse le jour
même). Le taux par défaut d'un compte ne dit pas la nature de CETTE opération ·
l'annonce de la TVA posée d'office porte un bouton « Opération exonérée ·
retirer la TVA » qui retire la dernière ligne de ce compte de taxe et de ce
taux, et elle seule. Un compte qui ne sert qu'à des opérations exonérées ne
doit simplement pas porter de taux par défaut. L'annonce est rendue AU-DESSUS
de la zone de saisie · la liste des comptes s'ouvre en dessous après chaque
ligne et la couvrait, trouvé par le test navigateur.

**Modèles de saisie à fonctions (2026-09-25).** Point 6 de la comparaison Sage
i7. Chaque ligne d'un modèle porte une fonction, lue au manuel i7 (modèles de
saisie) · SAISIR (« la valeur correspondante doit être saisie manuellement »,
ou montant fixe), RÉPÉTER (« la même valeur que celle mentionnée sur la ligne
précédente »), CALCULER (« ex : calcul de TVA automatiquement », au taux porté
par la ligne, qui devient la ligne de taxe) et ÉQUILIBRER (« par équilibrage
avec les autres montants saisis en débit et crédit »). Un modèle se rattache à
un journal, à un TYPE de journal (« les modèles de saisie de type ACHATS ») ou
à tous ; la saisie l'appelle par F4. QUATRE RÈGLES À NE PAS DÉFAIRE. (1) LA
MÊME RÈGLE À LA PORTE ET AU DÉROULÉ · `fonctions-modele.ts` refuse au serveur
ce que `derouler-modele.ts` ne saurait pas dérouler (un seul Équilibrer,
ni Répéter ni Calculer en première ligne, taux exigé sur Calculer et sur lui
seul, montant fixe sur Saisir seul). (2) ÉQUILIBRER SE CALCULE EN DERNIER, et
un solde du mauvais sens vaut zéro avec un motif affiché · l'inverser ferait
changer le compte de sens en silence. (3) UN TAUX INTROUVABLE LAISSE LA LIGNE À
ZÉRO ET LE DIT, jamais un taux deviné. (4) INCRÉMENTER ET FONCTION NE SONT PAS
REPRIS · le premier sert aux numéros de pièce, qu'OmegaX tient par la
numérotation du journal ; le second, une fonction pré-paramétrée, n'est
décrit nulle part dans le manuel, et l'inventer serait écrire une règle Sage
de mémoire.

**Saisie par pièce, OD analytiques, et le lot qui n'a pas de table (2026-09-25).**
Point 7 de la comparaison Sage i7, lu au manuel i7 (« Saisie par pièce »,
« Saisie par lot », « Saisie des OD analytiques »). QUATRE RÈGLES À NE PAS
DÉFAIRE. (1) LA SAISIE PAR PIÈCE EST UN MODE DE LA FENÊTRE DE SAISIE, pas une
seconde fenêtre · même grille, mêmes contrôles, même enregistrement ; seules
changent la fenêtre lue (l'exercice entier) et la date, saisie en entier et
refusée hors exercice avant l'envoi (`lib/saisie-par-piece.ts`). Les pièces
existantes défilent une à une, [Précédent] et [Suivant] comme chez Sage. Une
seconde fenêtre aurait recopié la TVA d'office, la contrepartie et les
modèles, et divergé au premier correctif. (2) L'OD ANALYTIQUE S'ÉQUILIBRE,
écart voulu avec Sage qui admet une OD non soldée · elle ferait diverger
l'analytique du grand livre sans que rien ne dise pourquoi, et c'est ce
réalisé qu'un bailleur rapproche des comptes (`analytique/od-analytique.ts`).
Même plan, même compte général (d'une classe que le plan ventile), sections
Détail seulement. (3) LES OD ENTRENT DANS LES TROIS ÉTATS DE SAGE PAR UNE SEULE
LECTURE (`cumulsPlan` · balance, grand livre sous le journal « OD ANA », état
budgétaire), et NE SONT PAS REPRISES par le tableau d'exécution budgétaire du
SYCEBNL · établi sur la comptabilité, il lit sur l'écriture si la dépense est
payée ou engagée, ce qu'une OD ne dit pas. Il les compte et le DIT. Le contrôle
des cumuls ne les lit pas non plus : une OD équilibrée n'y change rien par
construction. (4) LA SAISIE PAR LOT N'A PAS DE TABLE · chez Sage elle sert la
saisie décentralisée sur un poste isolé, puis « Mettre à jour la
comptabilité ». Dans une application web tous les postes écrivent dans la même
base, et le fichier préparé ailleurs passe par l'import d'écritures, qui met
TOUT au brouillard · la validation joue la mise à jour. Une table de lots
doublerait le brouillard.

**Recherche d'écritures multicritère (2026-09-25).** Point 8 de la
comparaison Sage i7 (« Traitement / Recherche d'écritures »). Elle vit dans le
panneau de filtres du journal, et la règle dans `recherche-ecritures.ts`, que
`perimetreJournal` appelle · la fenêtre ET l'export lisent donc le même
périmètre. TROIS RÈGLES À NE PAS DÉFAIRE. (1) LE COMPTE ET LE MONTANT SE
CHERCHENT SUR LA MÊME LIGNE, un seul `lignes.some` · deux conditions séparées
rendraient la pièce où le 401 porte 5 000 et une autre ligne 116 000, et
retrouver un règlement se noierait dans le bruit. (2) UN MONTANT SEUL EST
EXACT, au débit ou au crédit ; une borne haute en fait une fourchette. Le
compte se lit par sa RACINE, comme un compte Total. (3) UN CRITÈRE ILLISIBLE
EST REFUSÉ, jamais ignoré · ignoré, il élargirait la recherche en silence et
« aucun résultat » se lirait « tout est vu ». L'export refuse AVANT d'ouvrir
le flux, une réponse commencée ne pouvant plus devenir un 400.

**Réimputation d'écritures (2026-09-25).** Point 9 de la comparaison Sage i7.
Les manuels lus NOMMENT la commande sans la décrire · ce qu'elle fait est dit
par les deux articles qui régissent toute retouche (`reimputation.ts`), et
c'est écrit. QUATRE RÈGLES À NE PAS DÉFAIRE. (1) AU BROUILLARD, LE COMPTE
CHANGE · la ligne n'est pas entrée au livre-journal, c'est encore la saisie
(AUDCIF art. 22, 2°, « toute donnée entrée fait l'objet d'une validation »).
(2) VALIDÉE, LA LIGNE NE BOUGE JAMAIS · la réimputation passe, dans le journal
de la pièce, l'inscription en NÉGATIF sur le compte erroné puis
l'enregistrement exact sur le bon, même sens, même montant (art. 20, «
exclusivement par inscription en négatif », jamais une contre-passation qui
gonflerait les deux cumuls). Une écriture par pièce d'origine, motif
obligatoire. Les ventilations analytiques suivent, en négatif puis à
l'identique · le projet d'une charge ne change pas avec son compte. (3) TOUT
SE VÉRIFIE AVANT LA PREMIÈRE ÉCRITURE, et une seule ligne refusée arrête le
lot : lettrée, pointée, portant un taux de TVA (la déclaration changerait),
tenue par une immobilisation, venue de la clôture, ou d'un exercice clôturé
(l'erreur antérieure passe par le report à nouveau, art. 20 al. 3). (4) ELLE
PART DE LA RECHERCHE D'ÉCRITURES filtrée sur un compte, la seule qui dise de
quel compte on déplace, et elle est réservée au comptable comme la correction.

**Fusion des structures (2026-09-25).** Point 10 de la comparaison Sage i7 ;
le manuel i7 NOMME l'activité (« Fusion des structures ») sans que ses pages
soient au corpus lu, donc la règle vient des textes qui régissent une retouche.
QUATRE RÈGLES À NE PAS DÉFAIRE. (1) FUSIONNER DEUX TIERS NE TOUCHE AUCUNE
ÉCRITURE · elles sont passées sur des comptes. Tout ce qui pointe vers le
doublon est reporté sur la fiche conservée, relation par relation LUE DANS LE
SCHÉMA (`reporterReferences`), puis le doublon est supprimé ; la fiche gardée
conserve ses coordonnées, le doublon ne comble que ses vides ; deux types
différents (client, fournisseur) ne se fusionnent pas. (2) FUSIONNER DEUX
COMPTES EST UNE RÉIMPUTATION DE TOUTES SES LIGNES DES EXERCICES OUVERTS
(point 9 · négatif puis exact sur une ligne validée), chaque exercice SIMULÉ
avant le premier écrit ; même classe, deux comptes de détail. (3) LE COMPTE
ABSORBÉ S'ENDORT, IL NE DISPARAÎT PAS · ses lignes des exercices clôturés
restent sur lui (art. 20 al. 3 renvoie l'erreur antérieure au report à
nouveau), et ce que les structures disent encore de lui (taux de taxes,
journaux, modèles, fiches) est RENDU, jamais reporté d'office · qu'un taux de
TVA change de compte est une décision. (4) LES JOURNAUX NE SE FUSIONNENT PAS ·
une pièce validée ne change ni de journal ni de numéro (art. 22, 2° et 3°,
irréversibilité et chronologie) ; un journal vide se supprime (point 3).

**Nouvel exercice avec à-nouveaux provisoires (2026-09-25).** Point 11 de la
comparaison, lu au manuel i7 (Traitement / Fin d'exercice / Nouvel exercice :
« à tout moment, il sera possible de lancer, voir de relancer les reports à
nouveaux »). CINQ RÈGLES À NE PAS DÉFAIRE. (1) UN SEUL CALCUL POUR LA CLÔTURE
ET LE PROVISOIRE (`exercice/report-a-nouveau.ts`) · le bilan d'ouverture
provisoire doit ressembler au définitif, et la clôture n'avait AUCUN test
unitaire avant ce chantier (`cloture-annuelle.spec.ts` le fige désormais).
(2) LE PROVISOIRE EST CALCULÉ SUR LE LIVRE-JOURNAL, résultat compris sur le
13, et le brouillard restant est DIT, jamais lu. (3) IL RESTE AU BROUILLARD ET
NE SE VALIDE JAMAIS (`Ecriture.estANouveauProvisoire`) · validé, il ne
pourrait plus être remplacé (AUDCIF art. 22, 2°) ; `valider` le refuse,
`validerJusqua` l'écarte. (4) RELANCER ou CLÔTURER le remplace et lui reprend
son NUMÉRO DE PIÈCE, sans quoi chaque relance creuserait un trou dans la
séquence du journal ; une ligne lettrée ou pointée entre-temps REFUSE le
remplacement (« uniquement sur des écritures non lettrées », Sage). (5) LE
REPORT DES BUDGETS n'écrase jamais un budget déjà saisi et ne dote pas une
section dont la convention finit avant le nouvel exercice.

**Clôture qui fige le lettrage et l'analytique (2026-09-25).** Point 12 de la
comparaison, lu au manuel i7 (Clôture des journaux) · « Partielle : [...] Le
lettrage et la ventilation analytique par exemple pourront tout de même être
effectués. Totale : Les journaux ne seront plus modifiables. Période : Les
journaux jusqu'à la période sélectionnée ne seront plus modifiables. » La
clôture ne bloquait que la SAISIE ; on pouvait délettrer, relettrer et
reventiler une période arrêtée sans qu'aucun total ne bouge. QUATRE RÈGLES À NE
PAS DÉFAIRE. (1) UNE SEULE RÈGLE, `exercice/gel-cloture.ts` · une ligne est
figée si son exercice est clôturé, si une clôture TOTALE porte sur son journal
et qu'elle est datée au plus tard de sa date limite (une totale de 2026 ne fige
pas 2027), ou si une clôture de PÉRIODE couvre sa date ; la PARTIELLE ne fige
rien, c'est tout son objet. (2) ELLE GARDE TOUS LES CHEMINS · lettrage manuel,
compléter (lignes anciennes du groupe comprises, puisque la lettre se pose sur
toutes), délettrer, confirmation d'un pré-lettrage (rejouée, une clôture a pu
survenir entre-temps), ventiler et effacer une ventilation. (3) LE LETTRAGE
AUTOMATIQUE ET LE PRÉ-LETTRAGE N'APPARIENT PAS une ligne figée · ils la
poseraient, ou proposeraient ce que la confirmation refuserait. (4) LE
RÈGLEMENT DES TIERS VÉRIFIE LE GEL AVANT LA PREMIÈRE PIÈCE · le lettrage suit
la pièce, et le refus arriverait trop tard. Une OD analytique n'a pas de
journal · seule la clôture de période l'atteint. ET LA CLÔTURE TOTALE ELLE-MÊME
EST BORNÉE À UNE DATE · le manuel l'illustre par « Clôturer le journal ventes
pour le mois de janvier » et « on ne peut ni ajouter les écritures ni supprimer
le journal des ventes pour le mois de Janvier ». OmegaX la posait sur tout
l'exercice et refusait ensuite la saisie dans ce journal SANS REGARDER LA DATE,
exercices suivants compris. Elle prend désormais une date (fin d'exercice à
défaut), la saisie et le report de l'art. 22, 4° la franchissent comme les
autres clôtures.

**Compte collectif et compte individuel de tiers (2026-09-25).** Point 13 de
la comparaison. Sage saisit sur le collectif et porte le tiers sur la ligne ;
Manasse a retenu l'autre modèle, que rien dans les textes n'interdit · UN
COMPTE INDIVIDUEL PAR TIERS, parce que le lettrage, les relances, la balance
âgée et les règlements lisent tous un compte. QUATRE RÈGLES À NE PAS DÉFAIRE.
(1) LA TABLE DES COLLECTIFS VIT DANS `tiers/collectifs-tiers.ts`, PAR
RÉFÉRENTIEL · fournisseur 40110000 des deux côtés, client 41200000
« Clients-usagers » au SYCEBNL et 41110000 « Clients » au SYSCOHADA, adhérent
41100000 au SYCEBNL seul ; un spec relit les deux semis. (2) SALARIÉ ET AUTRE
N'ONT PAS DE COLLECTIF PROPOSÉ · la paie passe au 422 global, et un tiers
« autre » peut être débiteur ou créditeur, le deviner rangerait une dette en
créance. (3) LE COMPTE NAÎT AVEC LE TIERS, dans la même transaction, au premier
numéro libre sous la racine du collectif et à la longueur du dossier, avec les
réglages du collectif, rattaché comme principal, et `Compte.collectifId` le
lie (RESTRICT · un collectif qui porte des individuels ne se supprime pas).
(4) LA BALANCE GÉNÉRALE PEUT LES FONDRE SUR LEUR COLLECTIF, par ce lien et
jamais par le numéro ; les totaux ne bougent pas, le détail reste à la balance
auxiliaire.

**Natures de compte paramétrables (2026-09-25).** Point 14 de la comparaison,
lu au manuel i7 (« Cette option permet de définir, pour chaque nature de
compte, une fourchette de numéros de comptes. Ainsi, en création de compte, le
programme affecte automatiquement la nature du compte en fonction de son
numéro »). QUATRE RÈGLES À NE PAS DÉFAIRE. (1) LES SEPT NATURES DU MANUEL,
PAS UNE DE PLUS · Stock, Clients, Fournisseurs, Banque, Caisse, Charges,
Produits (`comptes/natures-compte.ts`), une ligne par dossier et par nature
(`NatureCompte`), posées à la première lecture ; leurs défauts reprennent le
mode que les deux semis portent déjà, et un spec le relit (zéro écart). (2)
LA NATURE DONNE DES DÉFAUTS, JAMAIS UNE CONTRAINTE · mode de report et lettrage
d'un compte créé ensuite, le DTO restant maître ; hors de toute nature, la
règle d'avant (`estLettrableParDefaut`). Elle S'AFFICHE, ne se stocke pas sur
le compte. (3) AUCUN CHEVAUCHEMENT ENTRE NATURES · un compte rattaché à deux
natures recevrait l'un ou l'autre défaut selon l'ordre de lecture. (4) LES
ÉTATS FINANCIERS NE LA LISENT PAS · ils lisent les numéros du plan officiel,
et déplacer une fourchette ne doit jamais déplacer un poste. L'incohérence du
report que Sage signale à la clôture est listée dans Paramètres du dossier et
s'aligne à la demande, jamais d'office.

**Profil de fonctions par utilisateur (2026-09-25).** Point 15 de la
comparaison. Les manuels i7 du corpus ne décrivent qu'un mot de passe de
fichier · le découpage vient du support Sage X3 (« Profils fonctions »),
résumé au skill `sage-i7`. QUATRE RÈGLES À NE PAS DÉFAIRE. (1) LE PROFIL
RESTREINT, IL N'ÉLARGIT JAMAIS · il se lit dans `JwtAuthGuard`, APRÈS le rôle ;
cocher « Validation » à un aide-comptable ne le fait pas valider. (2) IL PORTE
SUR CE QUI ÉCRIT (POST, PUT, PATCH, DELETE) · fermer les lectures casserait
les écrans, et la confidentialité d'une donnée relève du rôle cantonné. (3)
L'ADMINISTRATEUR N'EST JAMAIS RESTREINT, ni à la définition ni au contrôle ·
c'est lui qui lève la restriction. (4) LA TABLE EST PAR CONTRÔLEUR
(`common/fonctions/fonctions-metier.ts`), valider rangé à part de saisir, et
`fonctions-metier.spec.ts` relit les sources · un contrôleur qui écrit sans
être rangé fait tomber le test. Poser un profil ferme les sessions, comme un
changement de rôle, et les deux colonnes sont ADMISES au journal d'audit.

**Changer sa propre adresse de connexion (2026-09-25).** Demandé par Manasse
(admin@vmgconsulting.cd devient .net) · aucun écran ne le permettait, et le
seul chemin restait une modification à la main dans la base de production.
`POST /auth/changer-adresse`, fenêtre Utilisateurs, ligne « (vous »). Le mot de
passe actuel est exigé ; l'unicité est tenue par la contrainte de la base, sans
lecture hors cloisonnement, et une adresse prise est refusée sans dire à qui
elle appartient ; les sessions sont fermées puis une neuve reposée. Ce n'est
PAS une sortie de mot de passe provisoire. Le rôle, le dossier et le drapeau
d'opérateur sont sur le compte : ils suivent. `OPERATEURS_PLATEFORME` n'accorde
qu'en ACCORD · la valeur par défaut du workflow passe à .net, et si le secret
`API_OPERATEURS_PLATEFORME` existe, il prime et se met à jour à la main.

**Capital, courriel et site de l'entité (2026-09-25).** Point 16 de la
comparaison. Le manuel i7 les porte dans son exemple d'identification sans en
dire plus ; la règle qui donne son poids au capital est l'AUSCGIE art. 17
(dénomination « précédée ou suivie immédiatement » de la forme, du MONTANT DU
CAPITAL SOCIAL, du siège et du RCCM, sur tout document destiné aux tiers ;
sanction pénale, art. 891-1, 2°), plus l'art. 269-2 (« à capital variable »
ajouté à la forme). TROIS RÈGLES À NE PAS DÉFAIRE. (1) LE PÉRIMÈTRE EST LES
CINQ SOCIÉTÉS COMMERCIALES DE L'ART. 6 · la ligne (`tenant/mentions-societe.ts`)
n'est ni composée ni réclamée ailleurs ; GIE, coopérative, succursale et entité
publique relèvent de textes non lus, le capital leur reste saisissable sans
être exigé. (2) UNE EBNL ET UNE PERSONNE PHYSIQUE N'ONT PAS DE CAPITAL, et la
ROUTE le refuse (`motifRefusCapital`), pas seulement l'écran · imprimé sous la
dénomination d'une ASBL, il lui prêterait une forme de société. Le retrait
reste toujours permis. (3) UNE MENTION ABSENTE EST DITE, JAMAIS REMPLACÉE ·
la ligne s'imprime avec ce qui est connu (en-tête d'impression, par
/auth/me) et l'écran nomme ce qui manque. Le montant est celui des statuts,
sans défaut. Non servi et dit · le devis et la facture n'impriment pas encore
d'en-tête du dossier.

**Journaux de saisie et historique des rappels (2026-09-25).** Point 17 de la
comparaison, lu au manuel i7 (« Journaux de saisie : permet de visualiser, de
modifier et d'enregistrer les mouvements sur les journaux », choisir « le code
journal et le mois ») et au support Sage 100 (état du journal : Brouillard,
Non imprimé, Journal, Non clôturé, Clôturé). QUATRE RÈGLES À NE PAS DÉFAIRE.
(1) L'ÉTAT D'UNE CASE VIT UNE FOIS (`journaux/etat-journaux-saisie.ts`) et le
gel se lit par `gel-cloture.ts` sur le DERNIER jour du mois · une clôture
arrêtée au milieu du mois ne clôt pas le mois, elle rend « figé jusqu'au ».
« Non imprimé » n'est pas servi, rien ne trace l'impression. (2) L'À-NOUVEAU
PROVISOIRE NE MET PAS UN MOIS EN BROUILLARD, et seul il ne fait pas un mois
« tout validé » · il reste VIDE et s'annonce « AN ». (3) LE COMPTAGE EST UN
REGROUPEMENT PAR JOUR (`groupBy`), jamais les écritures une à une. (4)
L'HISTORIQUE DES RAPPELS EST UNE TRANCHE QUI SE DIT · période et compte,
total et somme sur le périmètre entier, `tronque` au-delà de 500 ; montant
figé à l'émission. Il vit en onglet de Rappel et relevé, le menu Traitement
étant tenu sous son plafond. Frais d'impayé et pénalités de Sage non servis.

**Éditions des structures (2026-09-25).** Point 18 de la comparaison. Le
manuel i7 NOMME « Imprimer la liste des comptes », « des journaux », « des
tiers » et « Imprimer les paramètres de la société », sans maquette · les
colonnes sont celles d'OmegaX (`lib/editions-structures.ts`). TROIS RÈGLES À NE
PAS DÉFAIRE. (1) UNE ÉDITION EST UNE LISTE À PLAT, JAMAIS L'ÉCRAN IMPRIMÉ · la
fenêtre porte `avec-edition` et n'imprime que l'en-tête et l'édition ; un plan
en arborescence ou une liste filtrée sortait tronqué sans le dire. (2) LE
PÉRIMÈTRE SE DIT · « Liste complète » ou la sélection exacte, avec le nombre de
lignes ; une rubrique vide des paramètres s'imprime « non renseigné ». (3) SEULE
LA FENÊTRE ACTIVE S'IMPRIME (`fenetre-inactive`) · jusque-là, « Imprimer »
sortait aussi toutes les fenêtres ouvertes derrière, états compris.

**Banques et libellés (2026-09-25).** Point 19 de la comparaison, lu au
support Sage 100 (Structure / Banque : « il est indispensable de créer un
compte bancaire pour un journal de banque » ; fiche à RIB) et au manuel i7
(Structure / Libellé, libellés « pré-enregistrés » appelés en saisie).
TROIS RÈGLES À NE PAS DÉFAIRE. (1) UN RIB SE RATTACHE AU PLUS À UN JOURNAL DE
BANQUE, et un journal n'a qu'un RIB (`RibBanque.journalId` unique) · un
journal de trésorerie qui porte une caisse (57, les deux plans) est refusé
(`banques/banques.ts`). Le journal rattaché ne se supprime plus, l'usage est
compté par la règle des références. (2) UN SEUL CONTRÔLE DE FORMAT, L'IBAN
(ISO 13616, modulo 97) · les formats nationaux du RIB ne sont décrits nulle
part, ils se conservent sans se vérifier. Banque et RIB sont au journal
d'audit · un RIB modifié en silence détourne un paiement. (3) UN LIBELLÉ
N'IMPUTE RIEN · il est proposé dans les deux champs de libellé de la saisie
(datalist) et n'écrit que le texte. COLLABORATEURS ET PLAN REPORTING NE SONT
PAS SERVIS, faute de source dans le corpus.

**États personnalisés (2026-09-25).** Point 20 de la comparaison. Sage NOMME
les « états libres personnalisables » sans les décrire ; l'Édition pilotée
décrit un historique « sur 5 ans des indicateurs clés ». La définition est donc
celle d'OmegaX, et l'aide le dit. QUATRE RÈGLES À NE PAS DÉFAIRE
(`etats-personnalises/moteur-etat-personnalise.ts`). (1) LE MOINS EST UNE
EXCLUSION · « 70 -709 » se lit « 70 sauf 709 », la racine la plus longue
décide ; lu comme une soustraction, il ajoutait les rabais au chiffre
d'affaires sur une ligne au montant plausible, et c'est le premier jeu d'essai
qui l'a montré. (2) DEUX MESURES · SOLDE pour un compte de bilan, MOUVEMENT
(écritures de clôture exclues) pour une charge ou un produit, dont la clôture
remet le solde à zéro · un chiffre d'affaires lu au SOLDE vaudrait zéro sur
tout exercice clos. (3) UN TOTAL NE CITE QUE DES LIGNES PRÉCÉDENTES, la même
règle à la porte et au calcul, et une définition enregistrée est revérifiée
avant chaque calcul. (4) RIEN N'EST STOCKÉ QUE LA DÉFINITION · chaque colonne
se recalcule sur `EcritureService.balance`, la balance générale, jusqu'à cinq
exercices ; zéro négatif ramené à zéro. Ni état financier ni document déposé.

**Documents attachés aux tiers (2026-09-25).** Point 21 de la comparaison.
Sage i7 ne dit que « le rattachement d'un fichier lié » et « un commentaire de
69 caractères » ; tout le reste est d'OmegaX (`tiers/documents-tiers.ts`). La
pièce est rangée EN BASE (`DocumentTiers.contenu`), décision de Manasse · une
application web n'a pas de disque partagé, et en base elle suit la sauvegarde
et l'archive. QUATRE RÈGLES À NE PAS DÉFAIRE. (1) LE TYPE SE LIT DANS LES
OCTETS · liste fermée (PDF, PNG, JPEG, docx, xlsx, doc, xls), signature
confrontée à l'extension ; une page HTML renommée « contrat.pdf » est refusée.
(2) LA PIÈCE NE SORT QU'EN TÉLÉCHARGEMENT (`attachment`, `nosniff`), et la
SEULE lecture qui charge `contenu` est `telecharger` · une liste de dix scans
ferait sinon transiter 50 Mo. (3) 5 MO À LA RÉCEPTION · la limite est posée
sur multer, en mémoire, pour qu'un envoi énorme ne soit jamais tenu entier ;
le 413 est redit en français. Aucun quota par dossier. (4) LA COLONNE BINAIRE
N'ENTRE DANS AUCUN CSV · l'archive de restitution écrit chaque pièce à côté
(`fichierDuDocument`), et le journal d'audit l'exclut par colonne. Une même
pièce n'est pas attachée deux fois au même tiers (empreinte SHA-256, P2002).
LA FENÊTRE PLAN DES TIERS EST OUVERTE EN CONSULTATION depuis le 2026-09-26
(décision de Manasse) · le volet Documents vivait dans une fenêtre réservée à
l'administrateur, si bien que le comptable avait le droit au serveur et pas le
moyen à l'écran. La STRUCTURE (créer, modifier, fusionner, supprimer, mettre
en sommeil, rattacher un compte, modèles de règlement) reste à
l'administrateur, à l'écran (`estAdmin`) comme au serveur (`@Roles
ADMIN_CABINET`) ; les documents suivent `peutEcrire`. Un spec relit chaque
action de structure dans son bloc `estAdmin &&`, par équilibrage et non par
distance.
AUDIT DU MÊME JOUR, QUATRE CORRECTIONS. La FUSION de deux tiers qui portent
la même pièce tombait en 500 sur cette unicité · l'exemplaire du doublon est
désormais retiré avant le report (même empreinte, même contenu). Une pièce
ILLISIBLE à la restitution ne lève plus · l'erreur d'une entrée est émise par
son propre flux, qu'`archiver` n'écoute pas, et elle arrêtait le serveur ; elle
est consignée dans `controles.txt`. La pré-image d'audit ne relit plus la
colonne binaire (`selectPreImage`). Et le nom se tronque par points de code,
un emoji coupé rendant `encodeURIComponent` fatal au téléchargement.

**Compte en sommeil · la saisie se confirme (2026-09-25).** Règle de Sage
(« confirmation requise en saisie »). POST et PATCH `/ecritures` refusent en
nommant le compte tant que `confirmerComptesEnSommeil` n'est pas envoyé ; la
vérification vit au CONTRÔLEUR, jamais dans `creer`, que la clôture et les
modules appellent pour des écritures que personne ne saisit.

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

**Un document dû des deux côtés doit SORTIR des deux côtés.** Le cloisonnement
d'une route d'export (`@ReferentielsAutorises`) ne se pose que sur un document
qu'UN SEUL texte impose. Le livre d'inventaire (SYCEBNL art. 14 · AUDCIF
art. 19) et le rapport (SYCEBNL art. 16-3 · AUSCGIE art. 138 · AUSCOOP
art. 108) sont dus par tous : leurs routes sont ouvertes aux deux. Restent
fermées les routes propres à un seul texte · le registre des donateurs, les
états du jeu « projets de développement », et l'éligibilité au Système minimal
(les deux textes n'y mesurent pas la même chose · le SYCEBNL compare les
RESSOURCES, art. 5 et 6, l'AUDCIF le CHIFFRE D'AFFAIRES, art. 13).

Ouvrir une porte ne suffit pas : le service derrière doit aiguiller. Le
2026-09-03, l'export du rapport lisait la constante SYCEBNL sans aucun
aiguillage · la porte fermée ne protégeait pas d'un oubli, elle en MASQUAIT un.
Ouvrir sans corriger aurait servi à une société commerciale un rapport à quatre
sections portant les exigences d'un article qui ne la régit pas. Gelé par
`parite-documents-obligatoires.spec.ts`, qui relit le classeur produit et lit
la métadonnée des routes.

**PASSE F2a · la TVA confrontée article par article, chapitres I à IV de
l'ordonnance-loi n° 10/001 (2026-09-13).** Deuxième passe du plan, dont
l'EXÉCUTION a été scindée en deux runs · 1 754 lignes de source contre 306 pour
F1, et à ce volume plus de cent réfutateurs à `xhigh`. F2a couvre l'objet, le
champ d'application, le fait générateur, l'exigibilité, la base et les taux ;
F2b couvrira les déductions, les obligations, la liquidation, les procédures et
les pénalités. 159 agents, 19,0 M de jetons, 149 constats réfutés un à un, 93
écartés, 56 retenus. Journal : `docs/releve-de-manques-fiscal.md`.

**LA NATURE FISCALE SE LIT À LA CONTREPARTIE, JAMAIS AU COMPTE DE TVA (art. 6
et 8).** Le routage 443/445 de `client/src/lib/tva-syscohada.ts` suit la
NOMENCLATURE COMPTABLE ; les articles 6 et 8 qualifient l'OPÉRATION. Le module
tenait le premier pour la seconde, et deux racines en payaient le prix. Toute la
racine **707** partait au 44310000, classé BIENS · or le plan y sème le 70720000
« Commissions et courtages », le 70730000 « Locations » et le 70760000
« Redevances », que l'article 8 range parmi les prestations de services
(« les opérations d'entremise », « les locations de biens meubles », « les
opérations portant sur des biens meubles incorporels ») et que l'article 25, 2°
rend exigibles à l'encaissement : une commission facturée en mars et encaissée
en juin était déclarée en MARS. Symétriquement, toute la racine **60** partait
au 44520000, classé BIENS · or le 60510000 est « Eau », le 60520000
« Électricité » et le 60570000 « Achats d'études et prestations de services »,
que l'article 8 nomme en toutes lettres : la déduction naissait à la facture au
lieu de naître à l'exigibilité chez le fournisseur, déduction anticipée et
réintégrable. La nature se lit désormais à la CONTREPARTIE (classe 7 sur une
vente, classes 6 et 2 sur un achat), la plus longue racine l'emportant, le
compte de TVA ne servant plus que de repli. **Ce qui porte deux sens n'est pas
tranché** · le 60580000 « travaux, matériels et équipements », le 70710000
« ports, emballages perdus », le 70780000, et toute écriture dont les
contreparties ne disent pas la même chose rendent INDETERMINEE, avec le montant
annoncé sur la déclaration.

**L'ARTICLE 26, ALINÉA 3, ÉTAIT SERVI DU SEUL CÔTÉ OÙ IL N'ÉTAIT PAS DÛ.**
« Elle ne dispense pas le redevable de s'acquitter de la taxe […] au moment de
l'encaissement du prix ou de l'acompte si celui-ci intervient avant les
débits » vise ce que le redevable ACQUITTE, donc sa taxe COLLECTÉE. Le module le
servait sur la déduction et l'enjambait sur la collecte, sous une hypothèse
inscrite au schéma dont la réserve était l'aveu : « la date de facture étant la
plus précoce des deux DANS LE CAS USUEL ». L'avance sur marché et l'acompte à la
commande sont précisément le cas réservé. OmegaX **ne peut pas** les voir : ils
s'enregistrent en avance reçue (419), sans ligne de taxe et sans rattachement à
la facture qui suivra. La correction est donc une DÉCLARATION CHIFFRÉE sur la
déclaration, pas un calcul, et l'hypothèse fausse du schéma est supprimée.

**UN TEST PEUT INTERDIRE DE DÉCLARER UNE LACUNE · c'est la découverte de méthode
de cette passe.** Le module annonçait « l'exigibilité par NATURE d'opération
(art. 25 et 26) » sans réserve de point, alors que seuls les points 1 et 2 sont
servis (ne le sont pas : importation et zone franche, escompte d'effet,
crédit-bail, préfinancement des cultures pérennes, mutation d'immeuble). Et
`hors-scope-tva.spec.ts` BANNISSAIT la chaîne « art. 25 » de la liste des
manques, pour prouver que l'article était traité : écrire la lacune au bon
endroit faisait tomber le test. C'est le §10 bis pris à revers · une lacune
déclarée à tort est aussi fausse qu'une règle inventée, et une lacune qu'un test
interdit de déclarer l'est deux fois. **Règle qui en sort : un test qui bannit
un numéro d'article d'une liste de manques est suspect ; on exige la RÉSERVE
EXACTE, jamais on n'interdit le mot.**

**UNE DOUBLURE QUI NE FILTRE PAS VALIDE UN CODE QUI NE CHARGE PAS.** La
réinjection consistant à retirer la classe 7 du `where` de production n'a
d'abord rien cassé : la doublure de `findMany` rend ce qu'on lui donne. En
production, la contrepartie n'aurait pas été chargée et le défaut serait revenu
intact. Quand un correctif dépend de ce que la requête RAMÈNE, il faut un test
sur la requête elle-même, pas seulement sur son résultat simulé. Même famille
que la doublure de `findFirst` de la passe I2.

**QUATRE LACUNES NOMMÉES, AUCUNE COMBLÉE DE MÉMOIRE** · la territorialité
(art. 22, 3° · un service « utilisé ou exploité au pays » est dans le champ) et
le client rendu redevable à défaut de représentant agréé (art. 23, al. 2, taxe
ET pénalités) ; les bases particulières des art. 27 point 10, 31, 32, 33 et 34,
avec la RÉSERVE DE LECTURE que le texte lui-même porte et qu'il ne nous
appartient pas de trancher (« prix d'achat » à l'art. 27, 10 sans condition de
fournisseur, « prix de revient » à l'art. 31 et seulement auprès de
non-assujettis) ; la TVA COLLECTÉE sur les cessions d'éléments d'actifs
(art. 6), question antérieure aux régularisations des art. 50 et 51 déjà
déclarées ; le fait générateur des promoteurs immobiliers (art. 24, 6° et 7°).

**PASSE F2b · la seconde moitié de l'ordonnance-loi n° 10/001, chapitres V à X
(2026-09-13).** Déductions, obligations des redevables, liquidation,
recouvrement, remboursement, procédures et pénalités. 137 agents, 16,1 M de
jetons, 125 constats réfutés un à un, 46 écartés, 79 retenus dont 17 de gravité
FAUX. **La passe F2 est close.** Journal : `docs/releve-de-manques-fiscal.md`.

**L'ARTICLE 41 ÉTAIT FERMÉ AU SYCEBNL SUR UNE AFFIRMATION FAUSSE.** Le module
portait, et un spec gelait, la phrase « SYSCOHADA SEUL. Le plan SYCEBNL n'a ni
6383 ni 6384 ni 6181 : ses charges externes sont agrégées en 61800000 et
63800000 ». Les trois comptes y sont, sous les mêmes intitulés qu'au SYSCOHADA
(`compte-seed.ts` l. 824, 887, 888, plus l. 822 pour les transports du
personnel), et les deux renvois de ligne donnés à l'appui ne portaient rien de
tel. **Un dossier SYCEBNL assujetti · une ASBL ou une ONG taxée sur une
activité accessoire, c'est-à-dire le public même du logiciel · déduisait 100 %
de la TVA sur ses réceptions, ses missions et ses voyages, et la déclaration lui
donnait une RAISON FAUSSE de ne pas regarder.** `partExclueArt41` ne lit plus le
référentiel : c'est le NUMÉRO SEMÉ qui décide, et une racine qui ne rencontre
aucun compte ne déclenche rien (cas du 62760000 « Cadeaux à la clientèle »,
semé au seul SYSCOHADA). La discipline ne change pas · on ne retient un compte
que si l'INTITULÉ SEMÉ reprend les mots de l'article, et les cinq numéros ont
été relus DANS LES DEUX SEMIS avant d'ouvrir la table.

**CE QU'ON AFFIRME DU PLAN SE VÉRIFIE CONTRE LE PLAN · règle qui sort de cette
passe.** Deux specs, en deux passes, gardaient une phrase fausse : l'un un
hors-scope surestimé, l'autre « un dossier SYCEBNL n'exclut rien ». Dans les
deux cas le test couvrait bien le code, et dans les deux cas sa PRÉMISSE sur le
dépôt n'était vérifiée par personne. `exclusions-art41-semees.spec.ts` relit
désormais les deux fichiers de semis et exige que chaque racine reconnue y soit
réellement ouverte sous l'intitulé qui la justifie.

**UNE INTERDICTION DE MOT EST TOUJOURS TROP LARGE · troisième occurrence.**
`hors-scope-tva.spec.ts` bannissait « art. 63 » de la liste des manques ; cette
interdiction a bloqué une déclaration fondée, puisque dire que le crédit dont le
remboursement a été demandé ne peut donner lieu à imputation (art. 66) suppose
de nommer l'imputation de l'art. 63 que le module opère. Le test lit maintenant
LA TÊTE DE CHAQUE PUCE et exige qu'aucune ne prenne pour SUJET un article
couvert ; citer un article servi dans la description d'un manque voisin reste
permis. **On exige la réserve exacte, on ne bannit jamais un numéro.**

**LES PRODUITS PÉTROLIERS SONT COMPTÉS ET NOMMÉS, JAMAIS AMPUTÉS.** Le 60420000
« Matières combustibles » est semé aux deux plans, et l'article le frappe sur
trois points qui ne disent pas la même chose (3° et 3° bis excluent avec des
exceptions qui se recouvrent, 3° ter limite à 50 % « pour les cas autres »).
Le règlement auquel le 3° bis renvoie est absent du corpus. Le montant reste
DÉDUIT, compté à part et annoncé avec ses trois points · appliquer 50 % au jugé
serait inventer une règle.

**ONZE LACUNES NOMMÉES, AVEC LEUR RÈGLE ÉCRITE ET NON SEULEMENT LEUR NUMÉRO** ·
la retenue à la source de l'art. 53 al. 2 et son amende (art. 74 ter) ; le
crédit dont le remboursement a été demandé (art. 66) ; la perte du droit à
déduction après taxation d'office (art. 69 ter) et après manquement au paiement
scriptural au seuil de 1 000 000 FC (art. 59 bis et 74 bis) ; la taxe due du
seul fait de sa mention et les trois amendes du triple (art. 59, 70, 71 et 74
al. 2), qui supposent toutes de rapprocher DEUX GISEMENTS que le dépôt tient en
parallèle, la FACTURE et l'ÉCRITURE ; l'art. 40 al. 2 ; l'art. 42 point 1 pour
ses dépenses accessoires, avec ses trois contre-exceptions écrites ; les points
3 et 4 de l'art. 42 ; l'art. 43 al. 3 (les ventes aux missions diplomatiques
vont au numérateur, et faute de compte elles font BAISSER le prorata, toujours
au détriment du dossier) ; l'art. 45 al. 1 pour le nouvel assujetti ; et
l'art. 36 point 4, dont la fiche d'immobilisation engendre une écriture à DEUX
lignes sans place pour la taxe.

**PASSE F3a · le décret n° 011/42 d'application de la TVA, chapitres I à III
(2026-09-16).** 134 agents, 124 constats réfutés un à un, **106 écartés**, 18
retenus dont 7 de gravité FAUX. **85 % de réfutation, le plus haut taux des
quatre passes**, et l'effet d'une consigne nouvelle : les confronteurs
reçoivent le journal des passes précédentes et le hors-scope du module, avec
interdiction de resignaler un manque déjà nommé. Ce qui survit est du neuf.
Journal : `docs/releve-de-manques-fiscal.md`.

**LE RÉFÉRENTIEL FERMAIT LA LECTURE DE LA CONTREPARTIE, SUR UN MOTIF PÉRIMÉ.**
`natureOperation` écartait tout dossier non SYSCOHADA au motif que « le plan
SYCEBNL ne subdivise ni 443 ni 445 ». Le motif était vrai et la conclusion a
cessé de l'être le jour où F2a a déplacé la lecture de la nature du compte de
TVA vers la CONTREPARTIE : les classes 6 des deux plans portent les mêmes
numéros sous les mêmes intitulés. Un dossier SYCEBNL déduisait sa TVA
d'électricité dès la facture au lieu du paiement du fournisseur, et la
déclaration lui en donnait pour raison que « aucune nature n'y est lisible ».
**Troisième fois que le dépôt écarte une règle sur une affirmation périmée ou
fausse**, après l'homologation de la facture (F1) et les exclusions de
l'art. 41 (F2b). Règle qui en sort · QUAND UNE LECTURE SE DÉPLACE, RELIRE LES
GARDES QUI LA PRÉCÈDENT · une garde posée pour l'ancienne lecture devient un
refus sans motif.

**UNE CORRECTION PEUT CRÉER LE DÉFAUT QU'ELLE CORRIGE · la classe 7.** Le
constat demandait d'ouvrir la lecture au SYCEBNL ; il avait raison pour les
CHARGES et tort pour les PRODUITS. Le **70510000 est « Dans la Région »** au
SYSCOHADA, sous 705 « Travaux facturés », donc un SERVICE ; il est **« Ventes
de marchandises »** au SYCEBNL. Ouvrir la table des produits aux deux plans
aurait daté une vente de marchandises à l'encaissement et MINORÉ la
déclaration. Treizième occurrence du premier piège, et la seule qui aurait été
fabriquée par un correctif. La table des produits reste propre au SYSCOHADA, et
la raison écrite est désormais la vraie. Même prudence sur le **601**, « Achats
de marchandises » au SYSCOHADA et « Achats de biens ET SERVICES liés à
l'activité » au SYCEBNL : sur ce plan-là, le compte ne tranche pas.

**LA LOCATION-VENTE EST UNE LIVRAISON DE BIENS (art. 10 du décret).** Le décret
la nomme trois fois · l'art. 10 la range parmi les livraisons de biens meubles
corporels, l'art. 51 l'exclut de la règle des décomptes et paiements
successifs, l'art. 52 la date au transfert du pouvoir de disposer. Le 62340000
est semé aux deux plans et la table classait toute la racine 62 en SERVICES :
la taxe d'amont était datée de l'encaissement, la déduction différée jusqu'à
risquer la déchéance de l'art. 37 al. 2. `6234` prime `62`, et une location
simple de matériel reste un service.

**LA MENTION DE L'ARTICLE 60 N'ÉTAIT PAS CONTRÔLÉE.** « La mention
"Autorisation d'acquitter la TVA d'après les débits" doit figurer sur toutes
les factures délivrées par le prestataire de services ou l'entrepreneur de
travaux publics ou de travaux immobiliers. » Le champ existait sur la pièce et
`verifierMentions` ne le lisait pas : `conforme: true` sur une vente qui
l'omet. **Répétition exacte du défaut corrigé par F1 sur l'adresse exacte.**
Deux limites tenues · la mention ne pèse que sur celui qui DÉLIVRE et qui est
AUTORISÉ, et l'amende de l'art. 97 bis ne lui est PAS étendue, ce barème visant
les mentions du décret n° 23/10 quand le décret n° 011/42 n'énonce aucune
sanction.

**« UNE ASSOCIATION NE L'EST PAS DE PLEIN DROIT » ÉTAIT FAUX, ET AFFICHÉ.**
L'écran des paramètres servait cette phrase à tout dossier SYCEBNL ; aucune
source lue ne la porte. L'art. 42 du décret soumet « les personnes physiques ET
MORALES » dont le chiffre d'affaires atteint le seuil, et le dépôt écrit
lui-même ailleurs qu'une ASBL dotée de la personnalité juridique est une
personne morale. Ce qui est propre à une association tient aux EXONÉRATIONS,
non au seuil (art. 15, 2° et 17, 8°) : ces opérations ne produisent pas de
chiffre d'affaires taxable, une activité accessoire taxable si. La phrase est
remplacée par la règle, avec le chiffre d'affaires HORS TVA de l'art. 42 et sa
mesure par l'art. 43.

**UNE LACUNE DÉCLARÉE AVEC UN DÉCLENCHEUR FAUX INVITE À PAYER CE QUI N'EST PAS
DÛ.** Le hors-scope faisait dépendre la dette du client de l'absence de
représentant AGRÉÉ ; les deux textes la font dépendre de l'absence de
DÉSIGNATION, et le silence de l'Administration vaut agrément. C'est une
troisième forme de la doctrine du §10 bis, après la lacune déclarée à tort et
la lacune qu'un test interdit de déclarer. S'y ajoutent deux réserves du décret
que la loi ne porte pas et que l'écran affirmait sans elles · les CONTRATS
D'ABONNEMENT à décomptes proportionnels à la consommation, exigibles à
l'expiration de la période (art. 55), et les EFFETS DE COMMERCE, encaissés « à
la date de l'échéance de la traite, même si elle a été remise à l'escompte »
(art. 57, alinéa 2).

**PASSE F3b · le décret n° 011/42, chapitres IV à XII (2026-09-17).** 183
agents, 171 constats réfutés un à un, 134 écartés, 37 retenus dont 8 de gravité
FAUX. **La passe F3 est close.** Journal : `docs/releve-de-manques-fiscal.md`.

**UNE CORRECTION PEUT RÉINTRODUIRE AILLEURS LE DÉFAUT QU'ELLE CORRIGE · c'est
la quatrième forme de la doctrine du §10 bis, et la plus insidieuse.** La passe
F1 avait ajouté l'adresse exacte aux mentions du décret n° 23/10 (art. 26) et,
pour borner le texte à son entrée en vigueur, **DÉRIVÉ** la branche antérieure
en la retirant, avec cette phrase à l'écran : « Ni l'adresse exacte ni le
montant des autres impôts et taxes ne lui sont réclamés. » Le décret n° 011/42,
art. 100, dit le contraire à ses DEUX premiers tirets · « les noms, post-nom,
prénom ou raison sociale, L'ADRESSE EXACTE, le numéro impôt du vendeur ou
prestataire » et « les noms, post-nom et prénom ou raison sociale, L'ADRESSE
EXACTE du client et son numéro impôt ». `verifierMentions` rendait donc
`conforme: true` sur une facture de 2022 qui omet deux mentions obligatoires, et
l'art. 104 du même décret EXCLUT DU DROIT À DÉDUCTION les biens et services dont
la pièce ne remplit pas les conditions de l'art. 100 · la sanction n'est pas
seulement l'amende, elle atteint la taxe. **Règle qui en sort : QUAND UNE
CORRECTION DÉRIVE UNE BRANCHE D'UNE AUTRE, LIRE LE TEXTE DE LA BRANCHE DÉRIVÉE,
jamais déduire son contenu de la différence entre deux dates.** Ce qui distingue
réellement les deux textes, et c'est tout : neuf groupes à l'art. 100, dix à
l'art. 26, le dixième étant le montant des autres impôts et taxes.

**UN TEST ÉCRIT DANS LA FOULÉE D'UNE CORRECTION GÈLE SES ERREURS.** Le spec de
F1 portait « l'art. 100 ne réclame NI l'adresse NI les autres impôts ». Il
couvrait bien le code ; sa prémisse sur le TEXTE n'avait été vérifiée par
personne. Troisième occurrence, après le hors-scope surestimé (F2a) et
l'affirmation sur le plan de comptes (F2b).

**LE SEUIL DE L'OBJET PUBLICITAIRE EXISTAIT, CHIFFRÉ, ET LE MODULE LE DÉCLARAIT
INTROUVABLE.** Il écrivait que « la valeur UNITAIRE n'est nulle part dans le
modèle » · inexact depuis l'item I1, `LigneFacture` portant `quantite` et
`prixUnitaire`. Et le décret chiffre ce que la loi laissait indéterminé,
art. 107 : est de faible valeur « le bien dont la valeur unitaire est INFÉRIEURE
À 10.000,00 FRANCS CONGOLAIS », le Ministre des Finances étant habilité à
réajuster ce montant. Ce qui reste vrai est désormais dit à la bonne place ·
cette déclaration ne lit pas les factures, elle lit les ÉCRITURES, et une ligne
d'écriture ne porte qu'un montant global. Le montant reste déduit, la mention
porte le seuil avec son article, et elle dit OÙ la condition se vérifie au lieu
de nier la donnée.

**LA REPRISE D'UN WORKFLOW N'EST PAS UN FILET.** Le conteneur a redémarré après
près de sept heures de run ; `resumeFromRunId` n'a pas rejoué le cache et tout a
été refait, 20,1 M de jetons. Une passe se découpe donc pour tenir dans une vie
de conteneur, et le découpage se règle sur la DURÉE autant que sur le nombre de
lignes du texte.

**PASSE F4a · l'impôt sur les sociétés, loi n° 23/053 du 30 novembre 2023,
Titre 2, champ d'application et produits imposables (2026-09-17).** Premier
texte de la série qui ne soit pas la TVA. 85 agents, 3 h 55, 77 constats
réfutés un à un, 30 écartés, 47 retenus dont 15 de gravité FAUX. **39 % de
réfutation, le plus bas taux de la série** · c'est le prix d'un texte vierge,
là où les passes TVA bénéficiaient de cinq journaux accumulés. Journal :
`docs/releve-de-manques-fiscal.md`.

**L'ARTICLE 5 NE DISCRIMINE PAS PAR RÉFÉRENTIEL, MAIS PAR QUALITÉ DE LA
PERSONNE.** `avertissementRegimeImpot` ne lisait que le référentiel et
affirmait à tout dossier SYSCOHADA « La société est redevable de l'impôt sur les
sociétés (art. 3) », avec l'échéance du 30 avril et ses trois acomptes. Or un
ÉTABLISSEMENT PUBLIC (art. 5, 1°) et une COOPÉRATIVE AGRICOLE DE FORME CIVILE
(art. 5, 2°) sont tenus en SYSCOHADA : l'écran leur affirmait en tête de leur
registre fiscal exactement ce que l'article leur épargne. **Cinquième piège du
dépôt dans sa forme exacte** · le commentaire de la fonction ÉNUMÉRAIT pourtant
les exemptés, et `retenues.service.ts` chargeait déjà `formeJuridiqueSyscohada`
dans la même requête. La fonction ne tranche pas pour autant : l'art. 5, 1°
réserve l'exemption aux établissements publics « en vertu de leurs statuts » et
aux organismes « dont les ressources proviennent uniquement de subventions
budgétaires », quand l'art. 3 impose l'exploitation lucrative ; l'art. 5, 2° pose
DEUX conditions cumulatives dont la FORME CIVILE, et le champ du dossier porte
la coopérative au sens de l'Acte uniforme, pas la forme civile au sens fiscal.
L'écran pose la question au lieu d'y répondre.

**EXEMPTION ET EXONÉRATION NE SONT PAS LE MÊME RÉGIME**, et le Titre Ier le
définit · art. 2, 10° « Exemption : la dispense d'une obligation fiscale de
DÉCLARATION ET DE PAIEMENT » ; 11° « Exonération : la dispense totale ou
partielle de PAIEMENT ». Le texte servi à une ASBL disait qu'elle « ne dispense
pas non plus de DÉCLARER » · vrai des impôts retenus pour autrui, faux de
l'impôt sur les sociétés lui-même.

**UNE PHRASE PLUS LARGE QUE SON ARTICLE COÛTE DE L'IMPÔT EN TROP.** L'écran
affirmait « Les ristournes font partie du bénéfice imposable (art. 11) ».
L'art. 11, 3° n'en réintègre que DEUX catégories · celles versées « aux
associés, en tant que ristournes et avantages provenant d'achats ou de ventes
effectués par les NON-ASSOCIÉS » et celles versées « aux non-associés ». La
ristourne servie à un associé sur ses propres opérations, qui est la ristourne
ordinaire, n'y figure pas : un comptable réintégrait le compte en bloc.

**LE MODULE FISCAL EST ENFIN BORNÉ AU 1er JANVIER 2026.** La loi n° 23/053 est
entrée en vigueur à cette date, et tout ce que le service applique en vient. Or
`deficitsAnterieursCalcules` et `chiffresAffairesAnterieurs` REMONTENT jusqu'à
trois exercices et y recalculent un résultat fiscal avec ces mêmes règles, qui
sert ensuite d'assiette au report imputé en 2026. Deuxième piège du dépôt dans
sa forme la plus large, et sa doctrine était écrite ici sans avoir franchi la
porte du module fiscal. **ON AVERTIT, ON NE BLOQUE PAS** · le texte antérieur
n'est pas dans le corpus lu, et refuser le calcul priverait le cabinet d'un
chiffre sans rien lui offrir ; ce qu'il faut, c'est cesser de présenter comme un
résultat fiscal de 2024 ce qui est une SIMULATION sous la loi de 2026. S'y
ajoute la TERRITORIALITÉ de l'art. 7, qui ne retient « uniquement » que les
bénéfices réalisés en RDC quand le résultat fiscal part du résultat comptable
entier · la base affichée est trop large, et la déclaration le dit.

**LE TROU DU CÂBLAGE REVIENT À CHAQUE PASSE · règle qui en sort.** Trois passes
sur quatre, la première réinjection a porté sur un POINT D'APPEL et non sur la
règle : la fonction pure était juste et le service ne l'appelait pas ainsi.
Écrire le spec du CÂBLAGE en même temps que celui de la règle, et non après
l'avoir constaté.

**PASSE F4b · l'impôt sur les sociétés, loi n° 23/053, Titre 2, charges,
taux et liquidation (2026-09-17).** 119 agents, 127 obligations extraites, 107
constats réfutés un à un, 44 écartés, 63 retenus dont 13 de gravité FAUX.
**41 % de réfutation**, dans la ligne de F4a · le taux d'un texte vierge se
stabilise autour de 40 %. **La passe F4 est close, 4 sur 31.** Journal :
`docs/releve-de-manques-fiscal.md`.

**L'ARTICLE 57 AFFIRMAIT LE CONTRAIRE DU VRAI SUR LE CAS D'ÉGALITÉ.** La
comparaison `minimum > theorique` est STRICTE : l'égalité tombait dans la
branche qui affirme « Impôt sur le bénéfice net imposable au taux de 30 %,
SUPÉRIEUR à l'impôt minimum ». Le cas n'a rien d'exotique · il est atteint par
toute société DÉFICITAIRE dont le chiffre d'affaires est nul, le chiffre
d'affaires retenu ne lisant que les comptes 701 à 707 (une holding dont les
produits sont en 77, une société en démarrage, une société dont tout le produit
est en 84). L'écran affichait « 30 % : 0 », « minimum : 0 », « IMPÔT DÛ : 0 »
et l'affirmation que le premier est supérieur au second · trois chiffres justes
et une phrase fausse. Trois cas désormais, le déficitaire nommé pour lui-même
parce que c'est le premier déclencheur de l'article (« lorsque les résultats
sont déficitaires »), et la réserve sur le chiffre d'affaires DÉCLARÉ écrite
plutôt que tue. **Anomalie du texte source signalée et non tranchée** ·
l'art. 57 dit « chiffre d'affaires déclaré » quand le même Titre 2 écrit
ailleurs « chiffre d'affaires hors taxes » (art. 36, 43, 49).

**LE REPORT DÉFICITAIRE SE COMPTAIT EN LIGNES DU DOSSIER, PAS EN EXERCICES.**
L'art. 51, alinéa 1er reporte le déficit « jusqu'au TROISIÈME EXERCICE QUI
SUIT » · c'est une borne de DATE, et `deficitsAnterieursCalcules` ne posait
qu'un `take: 3`, qui compte des ENREGISTREMENTS. Rien n'oblige les exercices
d'un dossier à être jointifs, `validerArticle7` ne vérifiant que la fin au
31 décembre et l'unicité de la période, et un dossier repris d'un confrère est
précisément celui où l'on ne saisit que ce dont on dispose : un dossier qui
tient 2020, 2021 puis 2026 se voyait imputer en 2026 le déficit de 2020, éteint
au 31 décembre 2023. La borne de date DOUBLE le `take` et ne le remplace pas ·
le `take` protège des dossiers à très longue histoire, la date dit le droit.

**LA TERRITORIALITÉ N'A PAS UN SENS DE CORRECTION, ELLE EN A DEUX · et c'est la
correction de F4a qu'il a fallu corriger le lendemain.** L'avertissement posé la
veille ne lisait que l'art. 7 et écrivait sans condition « la base affichée est
TROP LARGE · à retrancher ». Vrai d'une exploitation étrangère BÉNÉFICIAIRE,
FAUX d'une exploitation étrangère DÉFICITAIRE : l'art. 51, alinéa 3 dispose que
« les pertes subies dans les entreprises exploitées hors de la République
Démocratique du Congo ne sont pas déductibles du bénéfice imposable des
entreprises exploitées en République Démocratique du Congo », et cette perte est
déjà dans le résultat comptable · la base est alors TROP ÉTROITE et il faut la
RÉINTÉGRER. **Un comptable qui suivait à la lettre le seul avertissement
disponible CREUSAIT l'écart au lieu de le combler.** Règle qui en sort · LA
CONFRONTATION VISE AUSSI LE CODE DE LA VEILLE, qui est celui que personne n'a
encore relu.

**LE PIÈGE DE LA DOUBLURE, POUR LA TROISIÈME FOIS.** La réinjection de la borne
`gte` n'a d'abord rien cassé : la doublure de `exercice.findMany` n'honorait que
le `lt`. Même famille que la doublure de `findFirst` de la passe I2 et que celle
de `ecriture.findMany` de F2a. Toute correction qui dépend de ce qu'une requête
RAMÈNE se teste sur la requête elle-même, jamais sur son seul résultat simulé.

**TROIS ANOMALIES DU TEXTE QUI BORNENT D'AVANCE TOUT CALCUL D'AMORTISSEMENT**,
relevées par les lecteurs et NON comblées : l'art. 32, 1. exclut du dégressif
les durées « inférieures à quatre (4) ans » quand l'art. 33, 1., a) prévoit un
coefficient « de trois (3) à quatre (4) ans » ; aucune tranche de l'art. 33 ne
couvre une durée strictement comprise entre quatre et cinq ans ; et aucun taux
de droit commun n'est chiffrable à partir de la loi seule, l'art. 28 renvoyant à
un arrêté absent du corpus. Le dépôt sert le barème de l'arrêté n° 013/2025 ·
ce renvoi reste À CONFRONTER, il ne se présume pas.

**LE NUMÉRO 23/10 PORTE DEUX TEXTES DE 2023, ET LE DÉPÔT N'EN CONNAÎT QU'UN
(2026-09-18).** Trouvé en mesurant le volume des passes restantes, pas par une
passe · même effet que le décret n° 23/10 lui-même, trouvé en inventoriant le
corpus avant que la première confrontation ne commence.

- **Décret n° 23/10 du 3 MARS 2023** · réglementation de la facture normalisée
  et des dispositifs électroniques fiscaux. C'est le texte de la passe F1, et
  c'est de lui que vit le module de facturation.
- **Ordonnance-loi n° 23/10 du 13 MARS 2023** · Code du numérique. C'est le
  texte de la passe D4, et le dépôt n'en porte encore rien d'autre qu'une
  fenêtre de confidentialité.

Même numéro, même année, dix jours d'écart, deux instruments de nature
différente. **QUATORZIÈME OCCURRENCE DU PREMIER PIÈGE, ET LA PREMIÈRE SUR UN
NUMÉRO DE TEXTE** · les treize précédentes portaient sur un numéro de compte
(192, 4181, 1061/1062, 38/37, 397, 70510000, 601), sur un numéro d'article (les
deux articles 11 des revenus locatifs) ou sur une durée (les trois « trois
exercices » du mandat de contrôleur).

LE DÉPÔT EST PROPRE AUJOURD'HUI, et c'est le seul moment où la règle se pose
sans rien coûter : les vingt-cinq occurrences de « 23/10 » dans `src/` portent
toutes « décret n° 23/10 du 3 mars 2023 ». Le risque naît le jour où D4 ouvre,
et il est de la forme la plus discrète du § 10 bis · une citation plausible,
sourcée, et qui renvoie au mauvais texte. **Toute citation du Code du numérique
porte donc « ordonnance-loi n° 23/10 du 13 mars 2023 » EN ENTIER, jamais son
numéro seul, et un test gèle la distinction DANS LES DEUX SENS**, sur le modèle
des deux articles 11 de `retenues.spec.ts`. Décidé ici pour ne pas avoir à le
découvrir là-bas.

**ET UNE RÉSERVE DU PLAN ÉTAIT PÉRIMÉE**, trouvée du même geste : le plan de
confrontations décrivait le Code du numérique comme « OCR non collationné ». La
compétence a été réextraite du PDF natif le 05/09/2026, sans erreur de
reconnaissance de caractères. La qualification par un juriste reste due, elle ·
c'est l'autre moitié de la réserve, et elle tient. Une lacune déclarée à tort
fait renoncer à une démarche due, et celle-ci était dans le document qui
organise les démarches.

**PASSE F10 · les procédures fiscales, loi n° 004/2003, Livre II, Titres V à
VII (2026-09-18).** Première passe du nouvel ordre, verrouillé du moins au plus
volumineux. 69 agents, 2 h 42, 75 obligations, 63 constats réfutés un à un, 50
écartés, 13 retenus dont 2 de gravité FAUX. **79 % de réfutation** · un texte
adressé à l'Administration rend la plupart de ses articles à qui de droit, et
c'est sain. Journal : `docs/releve-de-manques-fiscal.md`.

**LE LOGICIEL ACCUSAIT LE REDEVABLE D'UN RETARD QUI N'EXISTE PAS · art. 110 bis,
alinéa 2.** « Si le dernier jour du délai prescrit par la législation fiscale
pour l'exécution d'une obligation ou l'exercice d'un droit est un jour NON
OUVRABLE, la date [...] est REPORTÉE au premier jour ouvrable qui suit. » Les
échéances du registre des retenues étaient des dates calendaires brutes, et
`enRetard` en tirait un « en retard » catégorique, en rouge au registre comme au
tableau de bord, avec l'avertissement de non-déductibilité de l'art. 20.
**Le 15 février 2026 est un DIMANCHE** : le redevable est dans les délais toute
la journée du lundi 16, et OmegaX lui écrivait « 1 mois en retard » dès le 16.
En 2026, l'échéance du 15 tombe un dimanche en février, en mars et en novembre.
C'est le § 10 bis dans sa forme la plus coûteuse · le cabinet corrige, et
personne ne saura jamais que l'anomalie n'existait pas.

**TROIS QUESTIONS TRANCHÉES DANS LES SOURCES**, et la règle vit une fois
(`retenues/jour-ouvrable.ts`), appelée par les quatre calculs d'échéance du
service. La loi fiscale n'y définit nulle part « jour ouvrable » : la définition
est EMPRUNTÉE au Code du travail, art. 7, 9° (« chaque jour de la semaine à
l'exception du jour de repos hebdomadaire et des jours fériés légaux »), et
l'emprunt est écrit dans le code plutôt que tu.

- **Le dimanche est le repos hebdomadaire** · Code du travail, art. 121,
  alinéa 2, « Il a lieu le dimanche ». Vaut de tout temps.
- **LE SAMEDI EST OUVRABLE** · un seul jour de repos, donc six jours ouvrables,
  ce que confirme la base de 26 jours par mois du décompte final.
- **LES JOURS FÉRIÉS NE SONT PAS CALCULÉS** · leur liste est fixée par décret du
  Président de la République (Code du travail, art. 123), et ce décret n'est dans
  AUCUNE source lue.

**CES DEUX DERNIERS POINTS ONT TENU UNE JOURNÉE, ET LES DEUX ÉTAIENT FAUX.**
Voir ci-dessous · Manasse a fourni l'ordonnance des jours fériés le lendemain,
et signalé que l'administration ne travaille pas le samedi. Les deux corrections
sont au paragraphe suivant, et ce paragraphe-ci est laissé tel quel parce que le
raisonnement qu'il porte reste instructif : il était juste et il partait de la
mauvaise source.

ET LE REPORT N'EST PAS INCONDITIONNEL · l'alinéa 3 laisse l'Administration
« fixer l'échéance déclarative et de paiement au jour ouvrable PRÉCÉDANT la date
de l'échéance légale ». Acte qu'aucune comptabilité ne porte : nommé dans la
réserve, jamais calculé.

**LA CONSIGNATION DU DIXIÈME N'EST PAS UN ACOMPTE · art. 110, alinéa 2.** Le
rapprochement du 4492 renvoyait INCONDITIONNELLEMENT à l'amende de l'art. 98 bis
pour insuffisance d'acompte, y compris quand le compte porte PLUS que ce qui est
déclaré · le sens où rien ne manque. Or « lorsque la réclamation porte sur un
supplément d'impôt, le contribuable peut, à sa demande, bénéficier d'un sursis de
recouvrement [...]. Dans ce cas, IL EST TENU DE VERSER un montant égal au DIXIÈME
du supplément d'impôt contesté » · compétence liée, et le seul compte semé dont
l'intitulé le reçoive est le 4492, que le filtre `startsWith('4492')` ramasse
quelle que soit la subdivision. Ce n'est pas une avance sur l'impôt de
l'exercice : son sort suit l'issue de la réclamation. Le message est scindé par
le SENS de l'écart, nomme la consignation avec sa limite (pas de sursis sur une
taxation d'office, alinéa 3), et laisse la ventilation au cabinet.

**J'AI COMMIS DANS UN TEST LE PIÈGE QUE LE DÉPÔT A DÉJÀ CATALOGUÉ TROIS FOIS.**
La première version du spec posait `not.toContain('art. 98 bis')` et est tombée
sur un message JUSTE · celui qui nomme l'article POUR DIRE qu'il ne s'applique
pas, ce qu'un cabinet a précisément besoin de lire. **Quatrième occurrence de
« une interdiction de mot est toujours trop large »**, et la première commise en
écrivant le test d'une correction plutôt qu'en relisant un ancien. On exige la
RÉSERVE EXACTE, on ne bannit jamais un numéro.

**TROIS TESTS EXISTANTS SONT TOMBÉS, ET C'ÉTAIT LA RÈGLE QUI MARCHAIT** · ils
figeaient des dates brutes (25 juillet 2027, 10 janvier 2027, 15 mars 2026, tous
des dimanches). Chacun corrigé AVEC SON MOTIF, et celui de l'ONEM a changé
d'objet : il fige désormais l'ORDRE des deux échéances, que le report ne peut pas
intervertir, et non plus l'écart de cinq jours.

**ET UN FICHIER DE COMPÉTENCE EST TRONQUÉ**, à signaler à Manasse ·
`25-mesures-execution-reclamations-recours-am013-2015.md` s'arrête ligne 71 en
plein milieu de l'article 7 de l'arrêté (« La décision de clôture d'instruction
du recours gracieux n'est pas susceptible »). La suite dit quelles voies de
recours restent ouvertes après un rejet gracieux, et le recours gracieux suppose
justement de RENONCER aux autres. Rien ne se code là-dessus tant que le fichier
n'est pas complété.

**LE JOUR OUVRABLE, CORRIGÉ DEUX FOIS EN VINGT-QUATRE HEURES (2026-09-18).**
La passe F10 avait posé le report de l'art. 110 bis, al. 2 avec deux limites
déclarées. Manasse a fermé les deux le lendemain, et la seconde n'était pas une
limite mais une ERREUR.

**1 · LES JOURS FÉRIÉS SONT DÉSORMAIS CALCULÉS.** Le texte existe :
**ORDONNANCE N° 23-042 DU 30 MARS 2023** fixant la liste des jours fériés légaux
(J.O. RDC, 15 mai 2023), prise sur l'art. 123 du Code du travail et abrogeant
l'ordonnance 14-010 du 14 mai 2014. Son art. 1er ferme la liste à **DIX dates,
toutes FIXES** · 1er, 4, 16 et 17 janvier, 6 avril, 1er et 17 mai, 30 juin,
1er août, 25 décembre. **AUCUNE FÊTE MOBILE** n'y figure, ni Pâques ni aucune
fête musulmane : ne pas en ajouter « par évidence », la liste est limitative.
Borne : art. 4, l'ordonnance « sort ses effets à la date de sa signature », donc
le 30 mars 2023 · avant, l'ordonnance 14-010 s'appliquait et n'est pas au
corpus.

**SON ARTICLE 2 JOUE À REBOURS DE L'ART. 110 BIS, ET N'EST PAS CALCULÉ.** « Dans
le cas où l'un des jours fériés légaux [...] coïncide avec un DIMANCHE, le congé
relatif à ce jour est pris LE JOUR PRÉCÉDENT. » Le congé RECULE quand l'échéance
fiscale AVANCE, et rien n'articule les deux textes. Le samedi précédent n'est
donc pas rendu non ouvrable de ce chef, et la réserve le dit. Le cas est cocasse
en 2027 : le 17 janvier (Lumumba) tombe un dimanche, et le « jour précédent » est
le 16, **qui est déjà férié** (Laurent Désiré Kabila) · l'ordonnance ne dit pas
ce qu'il advient alors.

**2 · « LE SAMEDI EST OUVRABLE » ÉTAIT FAUX, ET C'EST UNE ERREUR DE
TRANSPOSITION.** Je l'avais écrit en capitales comme « la décision qui compte le
plus ici ». Le raisonnement était juste et la SOURCE était la mauvaise : le Code
du travail régit les rapports entre EMPLOYEURS ET TRAVAILLEURS, alors que
l'obligation que l'art. 110 bis fait tomber à une date s'exécute DEVANT
L'ADMINISTRATION, à un guichet. Et ce guichet a ses propres jours :

> **DÉCRET N° 24/09 DU 17 FÉVRIER 2024**, art. 1er : « L'horaire de travail dans
> les services publics est fixé comme suit : **DU LUNDI AU VENDREDI**, de
> 8 heures à 17 heures, avec une pause de 12 heures 30 à 13 heures. »

Le samedi est donc NON OUVRABLE pour une échéance fiscale, à compter du
17 février 2024 (art. 51, en vigueur à la signature). **Ce que l'erreur coûtait :
le 25 juillet 2026, PREMIÈRE ÉCHÉANCE D'ACOMPTE sur l'impôt des sociétés, est un
samedi**, et le logiciel l'opposait telle quelle. Deux réserves écrites · le
décret fixe un HORAIRE DE TRAVAIL et ne définit pas le « jour ouvrable » de la
loi fiscale (c'est encore une transposition, mieux fondée mais une
transposition), et son art. 2, al. 3 permet à un ministre de fixer des horaires
spécifiques pour les services spéciaux de son autorité.

**LA RÈGLE PORTE MAINTENANT TROIS EXCLUSIONS, CHACUNE SA SOURCE ET SA BORNE** ·
dimanche (de tout temps), samedi (depuis le 17 février 2024), dix jours fériés
(depuis le 30 mars 2023). Les bornes ne sont pas une coquetterie : le registre
calcule des échéances d'exercices anciens, et leur appliquer un texte postérieur
est le deuxième piège du dépôt.

**CE QUE CES VINGT-QUATRE HEURES APPRENNENT, ET C'EST LA VRAIE LEÇON.** Quand la
loi fiscale emprunte un mot qu'elle ne définit pas, **la question n'est pas
« quelle source le définit » mais « devant qui l'obligation s'exécute ».** J'ai
pris la première source qui définissait le terme au lieu de chercher celle qui
régit le lieu où l'acte se fait. Déclarer l'emprunt, comme je l'avais fait, ne
suffit pas · il faut déclarer POURQUOI CET EMPRUNT-LÀ.

**ET J'AI BANNI UN MOT DANS UN TEST, POUR LA DEUXIÈME FOIS EN DEUX JOURS.**
`not.toMatch(/paques|ascension|.../i)` sur la source est tombé sur le
COMMENTAIRE qui dit précisément que la liste ne porte aucune fête mobile. Le
test gèle désormais la PROPRIÉTÉ (des entiers littéraux, aucune arithmétique de
date) et non le vocabulaire. Après « art. 98 bis » la veille, c'est la cinquième
occurrence au dossier · **on exige la réserve exacte, on ne bannit jamais un
mot.**

**PASSE F9 · le barème des sanctions, loi n° 004/2003, Livre II, Titre IV
(2026-09-18).** 67 agents, 2 h 46, 65 obligations, 59 constats réfutés un à un,
22 écartés, 37 retenus dont 5 de gravité FAUX. **37 % de réfutation**, le plus
bas de la série. Journal : `docs/releve-de-manques-fiscal.md`.

**LA CONSIGNE QUI A PAYÉ · VÉRIFIER CE QUE LE DÉPÔT AFFIRME, PAS CHERCHER CE QUI
MANQUE.** Sur un texte déjà partiellement codé, les cinq FAUX portent tous sur
des chiffres ou des dates DÉJÀ à l'écran. Aucun n'aurait été trouvé par une
consigne qui aurait seulement demandé « où cette obligation vit-elle ».

**L'ARTICLE 97 BIS NE VISE PAS LE DÉCRET QUE LE DÉPÔT LUI PRÊTAIT.** Le module
de facturation affirmait, à l'écran et sous un test qui le gelait, que « l'amende
de l'article 97 bis vise les mentions du décret n° 23/10 · elle n'est pas étendue
ici », pour en conclure qu'une omission de la mention de l'art. 60 du décret
n° 011/42 n'est pas sanctionnée. Le texte dit « **TOUTE omission d'une mention
obligatoire** constatée dans une facture ou un document en tenant lieu », sans
désigner aucun texte. **ET LA DATE LE DÉMONTRE SEULE** · l'article est créé par
l'O.-L. n° 13/005 du 23 février 2013, dix ans avant le décret n° 23/10 du 3 mars
2023 ; à sa création, les seules mentions obligatoires en vigueur étaient celles
du décret n° 011/42 de 2011. Le fichier se contredisait d'ailleurs trente lignes
plus loin. Lacune déclarée à tort, dans le sens qui rassure. Le module ne chiffre
toujours rien · il cesse de présenter son silence comme une dispense.

**L'ENTREPRENANT PAYAIT TROIS FOIS TROP, ET LE CODE CONTREDISAIT SON PROPRE
COMMENTAIRE.** `estPersonneMorale` rendait `!== 'ENTREPRISE_INDIVIDUELLE'` quand
le commentaire juste au-dessus nomme DEUX formes de personne physique,
« l'entreprenant ou le commerçant en nom propre ». Un dossier d'entreprenant se
voyait annoncer 750 000 FC par omission là où l'art. 97 bis en prévoit 250 000.
La liste existait déjà à deux fichiers de là · `FORMES_PERSONNES_PHYSIQUES` du
module des retenues, désormais exportée et consommée. **La SUCCURSALE reste non
tranchée**, faute de source, et c'est dit comme tel.

**L'ARTICLE 96 BIS ÉTAIT DATÉ DE SON REMPLACEMENT.** Le registre écrivait « créé
par la loi de finances n° 25/060 du 29 décembre 2025 » ; la source porte
« inséré par la L.F. n° 24/011 du 20 décembre 2024, art. 46, remplacé par la
L.F. n° 25/060 ». Deuxième piège pris à l'envers · un cabinet sur un exercice
2025 lisait que la règle n'existait pas encore. La rédaction de 2024 n'étant pas
au corpus, la réserve le dit plutôt que de transporter la règle actuelle en
arrière.

**UN BANNISSEMENT DE CHAÎNE NE SE POSE JAMAIS SUR LA SOURCE D'UN FICHIER.**
Quatre fois en trois jours, toujours dans le test écrit à côté d'une
correction : `art. 98 bis`, `/paques/i`, `vise les mentions du décret n° 23/10`,
`/!== 'ENTREPRISE_INDIVIDUELLE'/`. À chaque fois le test tombe sur le
COMMENTAIRE écrit pour expliquer que la chose bannie était fausse · **c'est
quand une correction est bien commentée que ce genre de test casse.** Les deux
premières occurrences avaient produit la bonne règle (« on exige la réserve
exacte, on ne bannit jamais un numéro ») ; il manquait de dire OÙ la poser.
**On gèle une PRÉSENCE** · un appel, une valeur servie · **jamais une absence de
mot dans un fichier.**

**ET DEUX RÉINJECTIONS SUR TROIS N'ONT D'ABORD RIEN CASSÉ** · l'entrepreneur et
la date de l'art. 96 bis. Les deux tests manquants ont été écrits avant de
rejouer les réinjections.

**La passe F6 (loi n° 23/053, Titres I et IV à VII) · une restriction écrite et
non codée.** Trois des huit écarts retenus avaient le même mécanisme, et c'est
le plus instructif de la série. Le commentaire du code énonçait la restriction
en toutes lettres, parfois en capitales, et le filtre écrit juste en dessous
était plus large qu'elle. « ELLE NE VISE QUE LES SOCIÉTÉS », puis un filtre par
référentiel · or SYSCOHADA porte aussi l'entreprise individuelle et
l'entreprenant, qui ne sont pas des sociétés. **Une restriction écrite et non
portée par le code est plus dangereuse qu'une restriction oubliée, parce qu'à la
relecture elle se lit comme faite.** Quand un commentaire pose une condition,
vérifier qu'une ligne l'exécute, et pas seulement qu'elle est dite.

**La même passe · le piège de la doublure, quinzième occurrence.** Le registre
des retenues annonçait l'impôt sur les sociétés à une personne physique, alors
que le planning de clôture scindait déjà ses jalons avec
`formesSyscohadaExclues`, que le module fiscal routait déjà vers l'IRPP, et que
le même fichier déclarait trente lignes plus bas `FORMES_PERSONNES_PHYSIQUES`
sous un commentaire disant « Elles ne sont pas redevables de l'impôt sur les
sociétés ». Quatre écrans, trois justes, un faux. *Une correction n'est finie
que quand on a cherché son jumeau*, et le jumeau se cherche par la RÈGLE, pas
par le fichier.

**La même passe · deux constats sur huit viennent de la relecture, pas du run.**
216 agents et trois réfutateurs par constat n'ont vu ni que l'AUDCIF art. 65 ne
dit pas ce que le dépôt lui faisait dire (il ne pose que la non-distribution, la
compensation des pertes venant de la loi fiscale), ni que l'art. 141 vise « les
redevables visés aux articles 139 ET 140 », donc aussi les entités à but non
lucratif. La règle n°1 (la session principale relit la source elle-même avant
qu'une ligne entre dans le code) n'est pas une formalité de contrôle · c'est une
source de constats à part entière, et il faut la traiter comme telle.

**La même passe · une migration appliquée ne se retouche pas.** La date fausse
« 5 décembre 2023 » vivait à deux endroits : un module et le commentaire d'une
migration déjà appliquée. Seul le module est corrigé. Une migration porte une
empreinte, et la réécrire ferait diverger la base · elle est de l'HISTOIRE, pas
une source. Le module le dit en clair, pour que personne ne « finisse » la
correction. Même traitement que la migration des cadratins.

**AUDCIF art. 22, 4° · l'opération d'une période close (2026-09-24).** « Lorsque
cette date correspond à une période déjà clôturée, l'opération est enregistrée au
premier jour de la période non encore clôturée, sa date de valeur étant
mentionnée distinctement. » OmegaX refusait sec, et deux de ses trois clôtures
sont définitives · une facture de mars reçue en mai n'avait aucun chemin.
Manasse a tranché pour le texte. `Ecriture.dateValeur` porte la date réelle,
`date` le premier jour ouvert (`exercice/report-periode-close.ts`). TROIS BORNES
· le report se DEMANDE (`reporterAuPremierJourOuvert`), jamais d'office ; jamais
au-delà de l'exercice, la charge changerait d'exercice ; jamais sur un journal
clôturé TOTALEMENT. Et un piège trouvé par le typage · `onClick={enregistrerPiece}`
aurait passé l'événement du clic comme demande de report, sur chaque pièce.

**PASSE F13 · la loi de finances n° 25/060 et l'IPM (2026-09-24).** Deux FAUX
corrigés. Le procès-verbal d'assemblée de l'art. 13 bis LPF était servi à tout
dossier, alors que le texte ne vise que « les sociétés et les autres personnes
morales soumises à l'impôt sur les sociétés » · ni l'ASBL exemptée, ni la
personne physique sans assemblée. Et l'amende de l'art. 74 al. 2 TVA (facture
servie deux fois) était donnée pour le triple, quand l'alinéa renvoie à celle de
l'alinéa 1er, égale aux droits indûment déduits. **RÈGLE · UNE LOI DE FINANCES
SE CONFRONTE DANS LA COMPILATION DU TEXTE QU'ELLE MODIFIE, jamais dans sa seule
fiche**, qui résume en tableau · le destinataire de l'art. 13 bis, les
pénalités de l'art. 96 bis et la date de création de l'art. 22 ter n'étaient
que dans la compilation. Et pour la troisième fois après l'art. 96 bis, un
article touché par une loi de finances était daté d'elle alors qu'elle ne
faisait que le modifier. L'IPM (O.-L. n° 71-087) ne rend aucun constat · perçu
par les chefferies et les communes, il ne confie aucune retenue à l'employeur.
Journal : `docs/releve-de-manques-fiscal.md`.

**Modèles de saisie · un achat ne se règle pas par la trésorerie dans la même
écriture.** Signalé par Manasse le 2026-09-18, et c'est une faute de fond, pas
de présentation. Les quatre modèles de chaque référentiel tenaient en DEUX
lignes, un compte de nature contre un compte de trésorerie choisi à l'écran :
un achat débitait la charge et créditait directement la banque. La dette envers
le fournisseur n'existait jamais, le compte 401 restait vide, et aucune balance
âgée, aucun échéancier, aucun lettrage ne pouvait dire à qui l'entité devait
quoi. Le même défaut frappait la vente (pas de créance client), le salaire (pas
de 422) et les deux modèles avec TVA.

LE GUIDE NE LAISSE AUCUNE LATITUDE · Partie 1 ch. 2 § 1.1 : « Recommandation
SYSCOHADA (flux de trésorerie) : contrepartie systématique = 401 pour les
achats de biens/services (hors immobilisations) ; 481 ou 404 pour les
immobilisations. » Le SYCEBNL écrit la même chose au fonctionnement de son
compte 40, en deux temps explicitement séparés · le compte est crédité des
FACTURES par le débit de la classe 6 et du 445, puis débité des RÈGLEMENTS par
le crédit de la trésorerie. Deux écritures, deux journaux. Même règle à la
vente (Application 2 : 4111 au débit) et à la paie (ch. 3 § 4.1 : « Montant
brut au crédit 422 Personnel, rémunérations dues, par débit 661-663 »).

LES SEULES ÉCRITURES QUI TOUCHENT LA TRÉSORERIE SONT CELLES QUI N'ONT PAS DE
TIERS · le don manuel en numéraire, qui n'a pas de débiteur (SYCEBNL Partie 3
ch. 4 § 3 · une générosité PROMISE passe, elle, par le 475), et les règlements,
qui sont la seconde moitié d'une opération déjà comptabilisée. La liste est
FERMÉE et nommée dans le spec : ajouter un modèle qui touche la trésorerie
oblige à venir dire ici pourquoi.

ET LE DÉPÔT DÉNONÇAIT DÉJÀ CE QU'IL FABRIQUAIT · le contrôle
CHARGE_SANS_TIERS signale exactement l'écriture que ces modèles proposaient.
Seizième occurrence du piège de la doublure, dans sa forme la plus gênante :
la règle était codée, et l'écran qui propose l'écriture ne la connaissait pas.

**LES MODÈLES QUE LE CABINET FABRIQUE LUI-MÊME N'AVAIENT AUCUNE GARDE DE
TIERS**, et c'est la seconde moitié du même signalement. Les modèles ÉCRITS
DANS LE CODE ont été refaits ci-dessus ; ceux du DOSSIER passaient par
`verifierLignes`, qui contrôle que les comptes existent, qu'ils sont
imputables et qu'il y a un débit et un crédit. Rien sur le tiers. Un modèle
« Achat » soldé sur la banque s'enregistrait, et engendrait ensuite autant
d'écritures fautives qu'on l'appliquait · un modèle est justement ce qui
répète une écriture.

UN AVERTISSEMENT, PAS UN REFUS · c'est la doctrine que le dépôt applique déjà
aux fiches par compte (§ 6) : « l'avertissement n'empêche pas la saisie · le
logiciel ne connaît pas la nature de l'opération, refuser bloquerait des
écritures justes ». Des frais bancaires que le relevé justifie seul, un don
manuel reçu en numéraire, une opération diverse : un refus sec les bloquerait,
et le cabinet finirait par contourner l'outil. Le message NOMME les deux cas
légitimes plutôt que de laisser le lecteur s'en convaincre tout seul, faute de
quoi il s'apprend à être ignoré. CE QUI CHANGE PAR RAPPORT À
CHARGE_SANS_TIERS, C'EST LE MOMENT : le contrôle en aval relit des écritures
déjà passées, celui-ci parle là où le modèle naît, une fois pour toutes celles
qu'il engendrera.

L'EXCEPTION DU DON MANUEL EST BORNÉE AU SYCEBNL, ET C'EST LA PREMIÈRE FOIS
QU'UNE EXCEPTION AURAIT FABRIQUÉ LE PREMIER PIÈGE DU DÉPÔT. Le 704 ne
déclenche rien au SYCEBNL · les dons, legs, denier du culte, zakat, dîme,
mécénat et parrainage y sont « enregistrés dans le compte 704 Revenus liés à
la générosité » (Partie 3 ch. 4 § 3), et un don manuel n'a pas de débiteur, le
fait générateur étant la remise elle-même (une générosité PROMISE passe, elle,
par le 475 et a donc un tiers). Le MÊME 7041 est « Ventes de produits
résiduels » au plan SYSCOHADA : exempter le 704 sans regarder le référentiel
dispenserait une société de tiers sur ses ventes de déchets, écriture
parfaitement équilibrée. DIX-SEPTIÈME occurrence de « un numéro, deux sens »,
et un test relit LES DEUX SEMIS pour que la prémisse ne repose sur personne
(règle sortie de F2b).

LE DIAGNOSTIC SE RELIT SUR CE QUI EST ENREGISTRÉ, jamais sur le DTO, et les
trois portes le servent · `lister`, `creer` et `modifier`. Une modification
d'intitulé seul n'envoie aucune ligne : diagnostiquer le DTO rendrait alors
« aucun avertissement » sur un modèle qui en mérite un. Et la relecture suit
exactement le chemin de `lister`, si bien que la création et la liste ne
peuvent pas dire deux choses différentes du même modèle. Le CÂBLAGE a son
propre spec, écrit en même temps que la règle et non après l'avoir constaté ·
trois passes de confrontation sur quatre ont vu la première réinjection porter
sur un point d'appel et non sur la règle (passe F4a).

**Ordre des lignes d'une écriture proposée · les débits, puis les crédits.**
Même signalement, même jour. Les lignes sortaient dans l'ordre où le code les
tapait : pour un achat, la trésorerie au CRÉDIT arrivait en première ligne,
suivie de la charge au débit, puis de la TVA. Aucun manuel ne présente une
écriture ainsi, et le Guide d'application moins que tout autre · il présente
CHAQUE écriture en tableau à cinq colonnes, débits remplis avant crédits.

L'ORDRE INTERNE À CHAQUE COLONNE VIENT DE DEUX ÉCRITURES DU TEXTE, pas d'une
préférence. Application 1 · au débit 2443, puis les 601 et 605, PUIS 4451 et
4452 ; au crédit 4812 et 4011. Application 2 · au débit 4111 ; au crédit 7011,
7021, 7071, PUIS 4431. **La TVA vient après les comptes de nature, jamais
avant**, alors qu'un tri numérique nu la placerait en tête. L'escompte, lui,
est l'accessoire du règlement (compte 40 débité « des escomptes de règlement
obtenus ; par le crédit du compte 773 ») et se lit après le tiers qu'il solde.

`client/src/lib/ordre-ecriture.ts` porte la règle une fois · sens, puis rang
(nature, taxe, escompte), puis numéro croissant, tri STABLE. Deux abstentions
volontaires. La racine « 44 » entière n'est PAS traitée comme un accessoire ·
elle emporterait le 441 impôt sur le résultat et le 447 impôts retenus à la
source, qui ne sont les accessoires d'aucune facture. Et une ligne à deux zéros
reste au débit · un modèle vierge, que le comptable chiffre ensuite, ne doit
pas s'inverser à moitié.

CE QUI N'EST PAS TRIÉ, ET POURQUOI · les écritures-types SYCEBNL servies par
`/operations-specifiques` sont transcrites du Guide d'application DANS SON
ORDRE, et un tri générique les dégraderait ; les modèles de saisie propres au
dossier portent un champ `ordre` qui est le choix du cabinet. On ordonne ce
qu'OmegaX propose de son propre chef, rien d'autre.

**Modale coupée en haut, troisième cause · `dvh` seul disparaît en silence.**
Les deux premières causes sont plus haut (bloc conteneur, hauteur non bornée).
La troisième est que la borne s'écrivait `max-h-[calc(100dvh-2rem)]`, en une
SEULE déclaration : l'unité `dvh` n'existe qu'à partir de Chrome 108 et de
Safari 15.4, et ailleurs la déclaration entière est invalide, jetée sans bruit.
La modale se retrouve alors sans aucune borne, c'est-à-dire exactement dans la
deuxième cause, revenue par la porte de derrière. `.modale-bornee` pose `vh`
PUIS `dvh` dans la même règle CSS · deux classes utilitaires séparées ne
peuvent pas l'exprimer, l'ordre de la feuille engendrée ne suivant pas l'ordre
des classes écrites.

Deux gardes de plus sur la calculette. `.voile-centre-sur` remplace
`items-center` par un voile défilant et un centrage par marges automatiques ·
une marge automatique ne devient jamais négative, donc un contenu trop haut se
pose en haut au lieu de sortir par le haut. Et la mise au point du champ passe
`preventScroll: true` · sans lui, le clavier d'un téléphone s'ouvre, le
navigateur fait défiler la page pour amener le champ dans la fenêtre visible,
et une modale `fixed` s'en trouve décalée.

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
  `MotDePasseAChangerGuard` FERME le serveur jusque-là · trois routes de
  sortie seulement, marquées `@SortieMotDePasseProvisoire()`, liste figée par
  un test. Le client seul ne suffisait pas. **LA GARDE EST APPELÉE PAR
  `JwtAuthGuard`, JAMAIS EN GARDE GLOBALE.** Nest exécute les gardes globales
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
  personnel, se voir, changer son mot de passe, lister les exercices) · un
  défaut ouvert lui aurait donné tout le grand livre, la plupart des lectures
  ne portant aucun `@Roles`. Aucun `@Roles` existant ne nomme ces rôles : ils
  se lisent comme le COMPTABLE ou la LECTURE SEULE qu'ils remplacent, là où la
  route le leur permet. Côté écran, `peutValider` (admin, comptable) est
  distinct de `peutEcrire` (qui inclut les deux rôles cantonnés).
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
  La borne se vérifie par sa VALEUR, pas par sa présence · jusqu'au 2026-09-17,
  `filtreBorne` rendait `true` dès qu'un `tenantId` figurait au filtre, quel
  qu'en soit le dossier. Ce n'était pas seulement une collection servie de
  travers : les règles A et B se court-circuitent sur cette fonction, si bien
  qu'un `tenantId` étranger DÉSACTIVAIT la garde au lieu de la déclencher.
  `{ tenantId: { not: null } }` et `{ OR: [{ tenantId: d }, {}] }` passaient
  pour des bornes.
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
  elle sert. L'extracteur ne construit jamais son `where` · les quinze modèles
  portés par leur parent échappent à la garde de cloisonnement, et un filtre
  écrit à la main les rendrait pour tous les cabinets. Il le demande à
  `borneDuModele`, et le spec vérifie chaque borne avec `filtreBorne`. Le
  manifeste écrit les cinq réserves plutôt que de les taire (voir
  docs/restitution-du-dossier.md) · une archive qui se présente pour plus
  qu'elle ne vaut est plus dangereuse que pas d'archive.
- **Journal d'audit** (`src/common/audit/`) · posé sur le client Prisma par
  une extension, pas par des appels dans les services : un contrôle qu'on peut
  oublier d'appeler n'est pas un contrôle. Il couvre les modèles de
  `MODELES_AUDITES` (accès, configuration, actes d'exercice) et jamais les
  lignes engendrées en masse. Chaque événement porte l'empreinte du précédent
  (chaîne par dossier) · c'est ce qui rend une retouche visible, AUDCIF
  art. 22, 5° et 6°. Deux règles à ne pas défaire : aucune route d'écriture
  sur `/journal-audit`, et aucun champ sensible recopié. Le masquage a DEUX
  moitiés · une heuristique sur le NOM (`FRAGMENTS_SENSIBLES`), qui n'attrape
  que ce qui s'annonce, et une liste FERMÉE par colonne
  (`COLONNES_EXCLUES_PAR_MODELE`) pour ce qui ne s'annonce pas. La seconde est
  née de `User.estOperateurPlateforme`, dont le schéma dit « jamais renvoyé
  par /utilisateurs » et que le journal rendait pourtant en clair à tout
  utilisateur du dossier. Un test tient la liste fermée · une colonne ajoutée
  à `User` le fait tomber tant qu'elle n'est pas classée. (`masquer()` remplace
  mot de passe, jeton et secret par un marqueur).

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
  d'« Abonnement ».

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
- **Aucun paragraphe explicatif à l'écran.** Sage n'en a pas. L'explication,
  la citation du texte et le « pourquoi » vont dans la bulle `Aide` (« ? »).
  Restent à l'écran : erreurs, refus, résultats, avertissements portant sur
  une DONNÉE du dossier, et les mentions qu'un test gèle, raccourcies à une
  ligne. Numéros et codes en police d'interface, pas en chasse fixe.
- **L'accueil est la fenêtre principale de Sage i7**, lue dans ses manuels
  (« Ergonomie et fonctions communes i7 ») · une BARRE VERTICALE à gauche,
  groupes thématiques dont un seul est ouvert (« cliquez sur son intitulé »),
  et l'INTUISAGE à trois onglets, Accueil, Favoris, Indicateurs. Les favoris
  sont une préférence du poste (navigateur), jamais une donnée du dossier.

## 10. Tests

Jest côté serveur, Vitest côté client. Un test doit vérifier **ce qui casserait
en silence** : un plan de comptes incomplet, un état qui ne boucle plus, une
note annexe absente, un cloisonnement qui saute. Les tests d'export relisent le
classeur produit plutôt que d'affirmer qu'il est correct.

Quand un bug est corrigé, le test qui l'aurait attrapé est écrit dans le même
commit.

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
  spec compte les `ecriture.create(` contre les `numeroPiece,` de chaque
  fichier.
- **Une écriture qu'un module tient ne se supprime pas depuis le journal.**
  Dix tables la référencent, et sur un lien FACULTATIF Prisma pose
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
