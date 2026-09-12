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

## 10. Tests

Jest côté serveur, Vitest côté client. Un test doit vérifier **ce qui casserait
en silence** : un plan de comptes incomplet, un état qui ne boucle plus, une
note annexe absente, un cloisonnement qui saute. Les tests d'export relisent le
classeur produit plutôt que d'affirmer qu'il est correct.

Quand un bug est corrigé, le test qui l'aurait attrapé est écrit dans le même
commit.

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
