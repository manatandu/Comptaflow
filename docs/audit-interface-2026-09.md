# Audit d'interconnexion de l'interface · 2026-09-27

Audit en lecture seule du client (`client/src`) confronté au serveur (`src/`),
sur la branche `main`. Aucun fichier de code n'a été modifié. Il remplace le
rapport de la veille, perdu : chacun de ses constats a été revérifié dans le
code actuel (section 1), puis les six axes ont été repris de zéro.

**Méthode.** Les 572 routes des contrôleurs ont été relevées (méthode, chemin,
fichier:ligne), puis confrontées à chaque appel `api.get/post/put/patch/delete/telecharger/envoyerFichier`
du client, chemins dynamiques résolus à la main. Pour chaque appel qui porte
un corps littéral, les clés ont été comparées aux propriétés du DTO de la
route (le `ValidationPipe` global est en `forbidNonWhitelisted`,
`src/bootstrap.ts:96`). Le registre des fenêtres
(`client/src/lib/registre-fenetres.tsx`) a été confronté aux menus
(`client/src/components/chrome/AppShell.tsx`) et à l'accueil
(`client/src/pages/AccueilPage.tsx`). Ni jest, ni vitest, ni tsc n'ont été
lancés.

**Gravités.** B = bloquant (une chaîne de travail ne peut pas aboutir) ·
F = faux (l'écran fait ou dit autre chose que ce qu'il annonce) ·
I = incohérent (fonctionne, mais contredit une règle du dépôt ou une autre
partie du code) · C = cosmétique (code mort, libellé, commentaire).

**Bilan des constats ouverts : 4 B, 4 F, 12 I, 10 C.**

---

## 1. Revérification des constats de la veille

| Réf. d'hier | Constat | État au 2026-09-27 | Réf. ici |
|---|---|---|---|
| B1 | L'assistant envoie `devise`, refusé par `RegisterDto` ; étape « monnaie » | **Corrigé.** Le corps de `NouveauFichierWizard.tsx:280-295` ne porte plus `devise` ; les étapes (`:28-63`) ne comptent plus de « monnaie ». Toutes les clés existent dans `src/modules/auth/dto/register.dto.ts`. La console (`PlateformePage.tsx:260-274`) n'en envoie pas non plus. | · |
| B2 | Inventaire physique sans comptage ni arbitrage | **Ouvert** | B1 |
| B3 | Circularisation impossible à clore | **Ouvert** | B2 |
| B4 | Registre des provisions sans saisie | **Ouvert** | B3 |
| B5 | Mode de tenue des stocks sans écran | **Ouvert** | B4 |
| F1 | Export du journal ignore `inclureBrouillard` | **Ouvert** | F1 |
| F2 | Fin de contrat sans écran | **Ouvert** | F2 |
| I | Journal d'audit absent du menu Fichier | **Ouvert** | I1 |
| I | Exonérations mal rangées | **Ouvert** | I2 |
| I | Déclaration de TVA et registres SYCEBNL à ranger sous Traitement | **Partiellement corrigé** : le registre des donateurs est sous Traitement (`AppShell.tsx:316-318`) ; la déclaration de TVA et le registre des engagements restent sous État | I3 |
| I | Balance fonctionnelle mal rangée | **Ouvert** | I4 |
| I | Balance agrégée du groupe visible pour des dossiers sans cellules | **Corrigé, mais la correction va trop loin** : l'entrée est gardée sur `nombreCellules > 0` (`AppShell.tsx:475-477`), ce qui empêche un siège de créer sa première cellule | F4 |
| I | Cloche visible au gestionnaire de paie | **Ouvert** | I5 |
| I | Six écrans recomposent `peutEcrire` | **Ouvert**, les six mêmes | I6 |
| I | `PasserEcritureFacture` ne lit pas le droit | **Corrigé** côté lecture (`PasserEcritureFacture.tsx:14`, `peutValider` depuis `useAuth()`), mais le serveur ne refuse pas l'aide-comptable et le commentaire l'affirme à tort | I7 |
| I | États personnalisés et simulations sans `@ReserveAuComptable` | **Ouvert** | I7 |
| I | PlanComptesPage appelle `/fiscalite/catalogue` hors SYSCOHADA | **Ouvert** | I8 |
| I | Huit exports sans attente ni signalement d'échec | **Ouvert**, les huit | I9 |
| I | « Registre du personnel » héberge la passation de paie | **Ouvert** | I10 |
| I13 | Une quinzaine de routes d'écriture sans commande | **Ouvert**, et la liste s'allonge (vingt-cinq familles) | I11, F3 |
| C | Doublon `/plateforme` dans Fichier | **Ouvert** | C1 |
| C | Libellés de menu différents des titres du registre | **Ouvert** | C2 |
| C | Icônes mortes dans `icons.tsx` | **Ouvert** (douze) | C3 |
| C | `IconeOmegaX` mort | **Ouvert** | C4 |
| C | Préchargement du tableau de bord mort | **Ouvert** | C5 |
| C | Commentaires périmés | **Ouvert**, liste complétée | C6 |
| C | `PaieDuMois` reçoit `peutEcrire={peutValider}` | **Ouvert** | C7 |
| C | Deux conventions de « référentiel inconnu » | **Ouvert** | C8 |

---

## 2. Constats bloquants (B)

### B1 · Inventaire physique : la campagne ne peut ni être comptée, ni arbitrée, ni close

La fenêtre `/inventaire` (`client/src/pages/InventairePage.tsx`) n'offre que
cinq gestes : créer la campagne (`:92`), engendrer les fiches des
immobilisations (`:240`), rapprocher (`:247`), clore (`:257`), établir le PV
(`:266`). Les fiches (`:359-376`) et les écarts (`:320`) sont affichés en
lecture seule. Or le serveur exige, à chaque étape suivante, un geste que
l'écran ne propose pas :

| Étape serveur | Exigence | Route qui la satisfait | À l'écran |
|---|---|---|---|
| `rapprocher` | toute fiche valorisée (`inventaire.service.ts:441-448`) | `PATCH /inventaire/fiches/:ficheId` (`inventaire.controller.ts:99`) | absent |
| PV de campagne | un inventoriant ET un témoin (`inventaire.service.ts` vers `:639`) | `POST /inventaire/:id/sous-commissions` (`:66`), `POST /inventaire/sous-commissions/:id/membres` (`:76`) | absents |
| `clore` | aucun écart sans décision (`inventaire.service.ts:823-832`) | `PATCH /inventaire/ecarts/:ecartId` (`:115`) | absent |
| `clore` | un PV par caisse à solde non nul (`:833-841`) | `POST /inventaire/:id/pv-caisse` (`:145`) | absent |
| (aide) | · | `POST /inventaire/:id/fiches` (`:86`), `PATCH /inventaire/:id` (`:60`), `GET .../caisses-non-comptees` (`:155`), `GET ecarts/:id/proposition` (`:124`) | absents |

La chaîne est rompue dès qu'une fiche n'est pas valorisée, et en tout état de
cause à la clôture pour tout dossier qui a une caisse. Le PV est toujours
refusé.

**Correction.** Dans `InventairePage.tsx`, sous `peutEcrire` : (1) un bloc
« Sous-commissions » (création, ajout de membres avec leur qualité
inventoriant ou témoin) ; (2) sur chaque ligne de fiche (`:376`), la saisie
de la quantité et de la valeur comptées (`PATCH /inventaire/fiches/:id`) et
un bouton « Ajouter une fiche » (`POST /inventaire/:id/fiches`) ; (3) sur
chaque écart (`:320`), l'arbitrage avec motif (`PATCH /inventaire/ecarts/:id`),
précédé de la proposition de redressement (`GET .../proposition`) ; (4) un
bloc « Caisses » qui liste `GET /inventaire/:id/caisses-non-comptees` et
ouvre le PV de comptage (`POST /inventaire/:id/pv-caisse`, ventilation par
coupure). Afficher le motif serveur tel quel sur refus, sans le recopier.

### B2 · Circularisation : aucune campagne envoyée ne peut être close

`CircularisationPage.tsx` permet de créer la campagne (`:105`), d'y ajouter
des demandes (`:443`), de les marquer envoyées ou relancées (`:266`) et de
clore (`:273`). Mais `CircularisationService.clore`
(`circularisation.service.ts:359-379`) refuse tant qu'une demande est
« envoyée » ou « relancée », et tant qu'une non-réponse n'a pas de procédure
alternative (ISA 505 § 12, cité par le service). Les deux routes qui
permettent d'en sortir, `PATCH /circularisation/demandes/:demandeId`
(`circularisation.controller.ts:65`) et
`PATCH /circularisation/demandes/:demandeId/procedures-alternatives` (`:75`),
n'ont aucun appel client. Toute campagne envoyée reste ouverte pour toujours.
Accessoirement, `POST :id/clore` accepte `refusDirectionMotif`
(`dto/circularisation.dto.ts:112-118`) que l'écran ne permet pas de saisir
(il poste `{}`).

**Correction.** Dans la liste des demandes (`CircularisationPage.tsx:357-389`),
sous `peutEcrire` et hors campagne close : un geste « Classer la réponse »
(réponse reçue avec solde confirmé et écart, sans réponse, non distribuée)
vers `PATCH /circularisation/demandes/:id`, et pour chaque non-réponse
(`nonReponse`, `:358`) un champ « Procédures alternatives » vers
`PATCH .../procedures-alternatives`. Au bouton « Clore » (`:273`), un champ
facultatif « Refus de la direction » porté en `refusDirectionMotif`.

### B3 · Registre des provisions : rien ne peut y être inscrit

`ProvisionsPage.tsx` ne fait qu'un appel, `GET /provisions/variation/:exerciceId`
(`:75-76`). Les cinq routes d'écriture de `provisions.controller.ts`
(`POST :exerciceId` `:40`, `PATCH :id` `:50`, `PATCH :id/statut` `:60`,
`POST reporter/ouverture` `:70`, `DELETE :id` `:81`) et la liste
`GET /provisions` (`:29`) n'ont aucun appel. Le tableau de variation reste
donc vide pour tout dossier, et son rapprochement avec le solde du compte ne
rapproche rien. Le commentaire d'en-tête (`ProvisionsPage.tsx:21-24`, « La
saisie n'est pas ici : elle se fait ligne par ligne ») laisse croire qu'elle
existe ailleurs : elle n'existe nulle part.

**Correction.** Ajouter à `ProvisionsPage.tsx`, sous `peutEcrire` : la liste
(`GET /provisions?exerciceId=`), un formulaire de création (nature, objet,
montant, fondement), la modification et le changement de statut (EN_EXAMEN,
COMPTABILISEE, PASSIF_EVENTUEL, ECARTEE, SOLDEE, libellés déjà présents
`:28-34`), la suppression, et un bouton « Reporter à l'ouverture de
l'exercice suivant ». Afficher les trois refus serveur tels quels (le
commentaire d'en-tête l'annonce déjà). Réécrire le commentaire `:21-24`.

### B4 · Mode de tenue des stocks : aucun écran pour le déclarer

`PATCH /dossier/methode-inventaire-stocks` (`tenant.controller.ts:121-131`,
administrateur) n'a aucun appel. `ParametresDossierPage.tsx` ne connaît que
la méthode des cotisations (`:488`). Or tant que le mode est `null`, le
magasin refuse boni et mali (`magasin.service.ts:70-74` et `:315-322`) et
l'arbitrage d'inventaire le lit (`inventaire.service.ts:518`, `:578`) ; le
message serveur renvoie l'utilisateur « dans les paramètres du dossier », où
la commande n'existe pas.

**Correction.** Dans `ParametresDossierPage.tsx`, à côté du bloc de la
méthode des cotisations, un choix PERMANENT / INTERMITTENT réservé à
`estAdmin`, posté en `{ methodeInventaireStocks }`, avec la valeur courante
lue dans `GET /dossier` (déjà servie, `tenant.service.ts:154`).

---

## 3. Constats faux (F)

### F1 · L'export du journal ignore la case « brouillard »

`JournalPage.tsx:100` ajoute `inclureBrouillard=false` à la requête quand la
case est décochée, et `:279-283` promet « Le journal exporté est exactement
celui affiché, filtres compris ». Le contrôleur `GET /exports/journal`
(`export.controller.ts:110-133`) ne lit pas ce paramètre, alors que le
service l'accepte (`export.service.ts:544-555`). Le classeur contient donc les
écritures de brouillard que l'écran masquait.

**Correction.** Dans `export.controller.ts:110-133`, ajouter
`@Query('inclureBrouillard') inclureBrouillard?: string` et passer
`inclureBrouillard: inclureBrouillard !== 'false'` dans les filtres (même
convention que `ecriture.controller.ts:184`). Test d'export qui relit le
classeur avec et sans le paramètre (CLAUDE.md § 10).

### F2 · La fin de contrat du personnel n'a pas de commande

`POST /personnel/contrats/:contratId/fin` (`personnel.controller.ts:78-86`,
DTO `TerminerContratDto`) n'a aucun appel. `PersonnelPage.tsx` crée des
contrats (`:859`) et calcule un décompte final (`:752`), mais ne peut pas
terminer un contrat : un salarié parti reste sous contrat en cours, ce qui
fausse l'effectif (`GET /personnel/effectif`) et la confrontation.

**Correction.** Dans l'onglet « registre » de `PersonnelPage.tsx`, sur chaque
contrat en cours et sous `peutEcrire`, un geste « Mettre fin au contrat »
(date, motif) vers `POST /personnel/contrats/:id/fin`, proposant ensuite
d'ouvrir le décompte final pré-rempli.

### F3 · Les réglages personnels de sécurité ne sont atteignables que par l'administrateur

Les routes du compte courant sont volontairement ouvertes à tous les rôles,
gestionnaire de paie compris (`auth.controller.ts:86-188`,
`@AccesRolesCantonnes({ gestionnairePaie: true })`). Mais :

- la double authentification (`ModaleDoubleAuth`) et le changement d'adresse
  (`ModaleMonAdresse`) ne sont montés que dans `UtilisateursPage.tsx:243-281`,
  page qui répond « réservée aux administrateurs » à tout autre rôle
  (`:69-77`) et dont l'entrée de menu est gardée `estAdmin`
  (`AppShell.tsx:151`) ;
- le changement VOLONTAIRE de mot de passe n'existe pour personne :
  `POST /auth/changer-mot-de-passe` n'est appelé que par
  `ChangerMotDePassePage`, affichée seulement quand `doitChangerMotDePasse`
  est vrai (`App.tsx:20`) ;
- « fermer toutes mes sessions » (`POST /auth/deconnecter-partout`,
  `auth.controller.ts:188`) n'a aucun appel.

Un comptable ne peut donc ni activer sa double authentification, ni changer
son mot de passe, ni fermer une session oubliée sur un autre poste.

**Correction.** Créer une commande « Mon compte… » dans le menu Fichier,
visible à TOUS les rôles (y compris dans le menu réduit du gestionnaire de
paie, `AppShell.tsx:577-587`), ouvrant une modale qui regroupe : changement
de mot de passe (réutiliser le formulaire de `ChangerMotDePassePage`),
`ModaleDoubleAuth`, `ModaleMonAdresse`, et un bouton « Fermer toutes mes
sessions » (`POST /auth/deconnecter-partout`, puis retour à `/connexion`).
Retirer ces deux boutons de `UtilisateursPage.tsx:243-250`, qui gère les
AUTRES comptes.

### F4 · Un siège sans cellule ne peut pas créer sa première cellule

L'entrée « Balance agrégée du groupe » n'apparaît que si
`nombreCellules > 0` (`AppShell.tsx:475-477`, champ servi par
`auth.service.ts:480`). Or la fenêtre `/groupe` est aussi celle qui crée les
cellules (`GroupePage.tsx:253`, `POST /groupe/cellules`), et le serveur
autorise la création dès que VMG a posé un plafond
(`groupe.service.ts:227`, `peutCreerCellule`). Un dossier mère au plafond
posé et à zéro cellule n'a donc aucune porte vers le seul écran qui lui
permettrait d'en avoir une. CLAUDE.md § 8 prévoit pourtant qu'un dossier
naisse « par le siège d'un groupe ».

**Correction.** Servir `plafondCellules` (ou un booléen `estMereDeGroupe =
plafondCellules !== null || _count.cellules > 0`) dans la réponse de session
(`auth.service.ts:477-480`, type `auth.tsx:40`), et garder l'entrée de menu
sur ce booléen. Mettre à jour le commentaire du registre
(`registre-fenetres.tsx:500-502`).

---

## 4. Constats incohérents (I)

### I1 · Le journal d'audit n'est pas au menu

`/journal-audit` est au registre (`registre-fenetres.tsx:196-200`) mais dans
aucun menu : seule une tuile d'accueil y mène (`AccueilPage.tsx:145`,
`admin: true`). `AppShell.tsx:39-41` pose pourtant que la barre de menus est
« la carte complète du logiciel. Toute fenêtre s'y trouve ». Par ailleurs
l'aiguillage d'ouverture (`AppShell.tsx:98-104`) ne filtre pas le rôle : un
non-administrateur qui tape l'adresse ouvre une fenêtre qui reçoit un 403
(`journal-audit.controller.ts:18`).

**Correction.** Ajouter au menu Fichier, sous `estAdmin`, après
« Autorisations d'accès », l'entrée « Journal d'audit » (`/journal-audit`).
Ajouter au registre une propriété `reserveAdmin: true` lue par l'aiguillage
(`AppShell.tsx:98-104`) pour renvoyer à l'accueil, comme pour les rôles
cantonnés.

### I2 · Les exonérations sont rangées parmi les éditions

« Exonérations douanières et fiscales » est sous État > Fiscalité
(`AppShell.tsx:532-534`). La fenêtre est un registre qu'on alimente
(`ExonerationsPage.tsx:75`, `:93`, `:98` : création et mise à jour de
dossiers), exactement comme le registre des donateurs, que le commentaire
`AppShell.tsx:371-374` range sous Traitement « puisqu'on l'y alimente ».

**Correction.** Déplacer l'entrée dans Traitement, groupe SYCEBNL à créer
avec le registre des donateurs (voir I3), gardée `estSycebnl`.

### I3 · Déclaration de TVA et registre des engagements écrivent, mais sont sous État

- « Déclaration de TVA » (`AppShell.tsx:519`) passe l'écriture de
  liquidation (`DeclarationTvaPage.tsx:56`,
  `POST /taux-tva/declaration/comptabiliser`) et l'annule (`:86`).
- « Registre des engagements de dépense » (`AppShell.tsx:433-435`) crée,
  rattache, clôt et supprime des engagements (six appels d'écriture dans
  `EngagementsPage.tsx`).

**Correction.** Dans Traitement, créer un groupe « Fiscalité et
obligations » portant la déclaration de TVA, puis (SYCEBNL) le registre des
donateurs (`:316-318`, qui y rejoint ses pairs), le registre des engagements
et les exonérations (I2). Laisser sous État > Fiscalité les seules éditions
(retenues et échéancier, résultat fiscal). Mettre à jour
`chrome-etroit.spec.ts` qui fige le décompte des éditions.

### I4 · La balance en monnaie fonctionnelle est rangée dans la révision

L'entrée (`AppShell.tsx:468`) est une édition pure (aucun appel d'écriture
dans `BalanceFonctionnellePage.tsx`), classée sous « Contrôle et révision »
au milieu des registres du réviseur.

**Correction.** La déplacer dans État > Analyse des comptes (`:403-415`),
après « Balance auxiliaire ». Garder le commentaire `:464-467` (elle n'a pas
de valeur légale), qui justifie de ne pas la mettre sous « États
financiers », pas de la mettre en révision.

### I5 · La cloche interroge le courrier pour le gestionnaire de paie

`ClocheChrome` est rendue pour tous les rôles (`AppShell.tsx:648`) et
interroge `GET /courrier/compteurs` chaque minute (`OutilsChrome.tsx:113-137`).
Le gestionnaire de paie n'a pas accès à cette route (défaut fermé,
`src/common/guards/roles-cantonnes.ts:36-38` et `courrier.controller.ts:30`
sans ouverture) : il reçoit un 403 par minute, et un clic l'envoie vers
`/courrier`, refusé par `fenetreOuverteAuRole` puis renvoyé au personnel.

**Correction.** Dans `AppShell.tsx:646-651`, ne rendre `<ClocheChrome />`
que si `fenetreOuverteAuRole('/courrier', utilisateur?.role)`.

### I6 · Six écrans recomposent le droit d'écrire au lieu de le lire

`const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE'` dans
`RelancesPage.tsx:69`, `RegularisationPage.tsx:122`, `DevisesPage.tsx:55`,
`CourrierPage.tsx:89`, `AffectationPage.tsx:37`, `FacturationPage.tsx:123`.
Cette formule vaut `peutValider`, pas `peutEcrire` (`lib/auth.tsx:172-174`,
`lib/roles-cantonnes.ts`) : elle refuse à l'aide-comptable des gestes que le
serveur lui ouvre (`rolesSatisfaits`, `src/common/guards/roles-cantonnes.ts:55-66` :
un rôle cantonné est lu comme COMPTABLE partout où la route ne le ferme pas).
Seule l'affectation du résultat est réellement réservée
(`affectation.controller.ts:40`, `@ReserveAuComptable()`).

**Correction.** Remplacer la ligne par `const { peutEcrire } = useAuth();`
dans Relances, Régularisation, Devises, Courrier et Facturation ; par
`const { peutValider } = useAuth();` dans Affectation (renommer les usages).

### I7 · Droits divergents entre l'écran et le serveur

- États personnalisés (`EtatsPersonnalisesPage.tsx:20`) et simulateur
  (`SimulationsBudgetairesPage.tsx:33`) réservent l'édition à `peutValider`,
  mais leurs routes (`etats-personnalises.controller.ts:32-45`,
  `simulations.controller.ts:32-45`) ne portent que
  `@Roles(ADMIN_CABINET, COMPTABLE)`, ce qui laisse passer l'aide-comptable.
- `PasserEcritureFacture.tsx:12-14` lit désormais `peutValider`, mais son
  commentaire affirme que l'aide-comptable « serait refusé » : c'est faux,
  `POST /facturation/:id/comptabiliser` (`facturation.controller.ts:65-66`)
  n'a pas `@ReserveAuComptable()`.

**Correction.** Décision à prendre avant de coder, car les deux sens se
défendent : (a) si ces trois gestes sont réservés, poser
`@ReserveAuComptable()` sur les trois routes d'écriture des états
personnalisés, des simulations et sur `comptabiliser` (cohérent avec la
passation de paie, `personnel.controller.ts:204-206`) ; (b) sinon, passer
les deux écrans à `peutEcrire`. Dans les deux cas, corriger le commentaire
de `PasserEcritureFacture.tsx:12-13` et ajouter le cas à
`ecritures-reservees.spec.ts`.

### I8 · Le plan comptable appelle une route SYSCOHADA pour tout dossier

`PlanComptesPage.tsx:134-136` appelle `GET /fiscalite/catalogue`, route
cloisonnée au SYSCOHADA (`fiscalite.controller.ts:22`, `:45`). Un dossier
SYCEBNL reçoit un 403 avalé à chaque ouverture du plan. C'est le défaut que
`ModelesSaisie.tsx:137-145` et `ParametresDossierPage.tsx:205-211` ont déjà
corrigé chez eux.

**Correction.** Conditionner l'appel à
`utilisateur?.tenant.referentiel === 'SYSCOHADA'` et ne pas afficher le
sélecteur de retraitement fiscal ailleurs.

### I9 · Huit exports partent sans attente ni message d'échec

`void api.telecharger(...)` ou appel direct dans un `onClick`, sans `await`
ni `catch` : `BalanceAgeePage.tsx:126`, `TableauxImmobilisationsPage.tsx:128`
et `:133`, `EvolutionSoldesPage.tsx:68`, `JustificatifSoldePage.tsx:109`,
`BalanceAuxiliairePage.tsx:92`, `GroupePage.tsx:261` et `:390`. Sur licence
expirée, 400 ou 500, rien ne se télécharge et rien ne s'affiche.
`JournalPage.tsx:262-276` documente et corrige exactement ce défaut.

**Correction.** Extraire `lancerExport` de `JournalPage.tsx:266-276` dans un
crochet partagé (`lib/export.ts`, `useExport()` rendant `{ lancer, enCours,
erreur }`) et l'utiliser aux huit endroits, bouton désactivé pendant
l'envoi, erreur affichée dans le bandeau de la fenêtre.

### I10 · La passation de paie est hébergée sous Structure

« Registre du personnel » est sous Structure (`AppShell.tsx:239-244`), avec
un commentaire qui affirme « Le registre ne passe AUCUNE écriture ». Or
l'onglet Bulletins (`PersonnelPage.tsx:2639-2640`) monte `PaieDuMois`
(`BulletinsPaie.tsx:227`), qui passe et annule l'écriture de paie
(`PaieDuMois.tsx:99`, `:121`). Le registre ne lit pas son adresse
(`registre-fenetres.tsx:356-360`, `rendre: () => <PersonnelPage />`) ; une
commande ne peut donc pas l'ouvrir sur un onglet. Même schéma, moins aigu,
pour « Immobilisations » sous Structure, dont la fenêtre passe dotations et
sorties (`ImmobilisationsPage.tsx`, onze appels d'écriture).

**Correction.** (1) `registre-fenetres.tsx:359` : `rendre: ({ adresse }) =>
<PersonnelPage adresse={adresse} />` ; (2) `PersonnelPage` lit `?onglet=`
comme `JournalPage.tsx:104-108` (`ongletDe`) ; (3) ajouter sous Traitement
une entrée « Paie du mois » vers `/personnel?onglet=bulletins`, gardée
`peutValider` et hors aide-comptable ; (4) corriger le commentaire
`AppShell.tsx:239-241`. Pour les immobilisations, même mécanique facultative
(« Dotations et sorties » sous Traitement > Clôture).

### I11 · Routes d'écriture sans aucune commande à l'écran

Relevé exhaustif des routes POST, PUT, PATCH et DELETE sans appel client,
hors celles déjà traitées en B1 à B4, F2 et F3.

**Fonction attendue sans commande** (un besoin courant reste sans geste) :

| Route | Fichier:ligne | Correction proposée |
|---|---|---|
| `PATCH /ecritures/:id` (modifier une pièce en brouillard) | `ecriture.controller.ts:110` | Bouton « Modifier » dans `BrouillardPage.tsx` rouvrant la pièce dans la grille de saisie ; aujourd'hui seule la suppression existe (`:154`) |
| `PATCH /accord-cadre/:id/main-oeuvre` | `accord-cadre.controller.ts:42` | Bloc « Main-d'œuvre locale » dans `AccordCadrePage.tsx` |
| `PATCH /accord-cadre/:id/denonciation` | `accord-cadre.controller.ts:52` | Geste « Dénoncer l'accord » (date, motif) |
| `PATCH /mandat-auditeur/:id/prorogation` | `mandat-auditeur.controller.ts:46` | Geste « Proroger / refuser la prorogation » dans `MandatAuditeurPage.tsx` |
| `PATCH /mandat-auditeur/:id/fin` | `mandat-auditeur.controller.ts:56` | Geste « Mettre fin au mandat » |
| `PATCH /faiblesses/faiblesses/:id/reponse-direction` | `faiblesses.controller.ts:84` | Champ « Réponse de la direction » dans `FaiblessesPage.tsx`, à côté du suivi (`:171`) |
| `PATCH /commercial/devis/:id/revocation` | `commercial.controller.ts:54` | Geste « Révoquer l'offre » dans `DevisPage.tsx`, tant que le devis n'est pas accepté |
| `DELETE /facturation/:id` | `facturation.controller.ts:76` | « Supprimer » sur une facture non comptabilisée (`FacturationPage.tsx`) |
| `DELETE /exonerations/:id` | `exonerations.controller.ts:54` | « Supprimer » dans `ExonerationsPage.tsx` |
| `PATCH` et `DELETE /regularisations/abonnements/:id` | `regularisation.controller.ts:67`, `:77` | Modifier et supprimer un abonnement dans `RegularisationPage.tsx` (la suppression gardée `estAdmin`) |
| `PATCH /conventions-financement/:id` | `convention-financement.controller.ts:64` | « Modifier la convention » dans `ConventionsFinancementPage.tsx` |
| `DELETE .../tranches/:trancheId`, `DELETE .../rapports/:rapportId` | `convention-financement.controller.ts:105`, `:136` | « Supprimer » sur tranche non encaissée et rapport non transmis |
| `PATCH /registre-donateurs/:id` | `donation.controller.ts:66` | « Modifier » sur une ligne non signée (`RegistreDonateursPage.tsx`) |
| `POST` et `PATCH /relances/niveaux` | `relances.controller.ts:21`, `:27` | Paramétrage des niveaux (administrateur) dans `RelancesPage.tsx`, qui les lit déjà (`:85`) ; les niveaux sont semés (`relances.service.ts:140`), d'où I et non B |
| `POST`, `PATCH`, `DELETE /analytique/plans`, `DELETE /analytique/sections/:id` | `analytique.controller.ts:79`, `:85`, `:95`, `:128` | Créer, renommer, supprimer un plan et une section dans `PlansAnalytiquesPage.tsx` (seules les sections se créent, `:131`) |
| `POST` et `DELETE /analytique/lignes/:ligneId/ventilations` | `analytique.controller.ts:172`, `:182` | Reventiler une ligne déjà passée, depuis l'interrogation du compte |
| `PATCH /fiscalite/retraitements/:id` | `fiscalite.controller.ts:75` | « Modifier » dans `FiscalitePage.tsx` (seuls ajout et suppression, `:149`, `:211`) |
| `PATCH /devises/:id` | `devises.controller.ts:27` | Modifier l'intitulé ou désactiver une devise (administrateur) |
| `PATCH /ribs-banque/:id` | `banques.controller.ts:50` | « Modifier » sur un RIB de banque (`BanquesPage.tsx:235` ne propose que la suppression) |
| `PATCH /immobilisations/familles/:id` | `immobilisation.controller.ts:66` | Modifier une famille dans `ImmobilisationsPage.tsx` |
| `PATCH /modeles-reglement/:id` | `tiers.controller.ts:136` | Modifier un modèle de règlement dans `TiersPage.tsx` |
| `POST /plateforme/cabinets/:tenantId/dossier-editeur` | `plateforme.controller.ts:144` | Geste ponctuel dans la console VMG (`PlateformePage.tsx`), confirmation forte |

**Doublons voulus** (une autre commande couvre le besoin) :

| Route | Fichier:ligne | Couverte par |
|---|---|---|
| `POST /exercices` | `exercice.controller.ts:28` | `POST :id/a-nouveaux-provisoires` et `POST :id/cloturer`, qui ouvrent l'exercice suivant (`exercice.service.ts:829`, `:938`). Seul un exercice NON contigu ne peut pas naître ; à trancher. |
| `POST /exercices/:id/reporter-budgets` | `exercice.controller.ts:52` | option `reporterBudgets` des à-nouveaux provisoires (`ExercicePage.tsx:245`) |
| `POST /operations-specifiques/application` | `operation-specifique.controller.ts:45` | la proposition (`ModelesSaisie.tsx:194`) est insérée dans la grille de saisie, puis enregistrée par `POST /ecritures` |

Aucune route n'est vraiment morte : chacune a un service et une règle. Les
supprimer n'est pas proposé.

### I12 · Lectures serveur sans écran, dont le relevé de compte

La fenêtre s'intitule « Rappel et relevé » (`registre-fenetres.tsx:564`),
mais `GET /relances/releve/:compteId` (`relances.controller.ts:49`) n'est
jamais appelé : le relevé de ce qui est dû par un tiers n'est pas éditable.
Autres lectures sans appel, qui correspondent chacune à un affichage
annoncé ailleurs : `GET /faiblesses/indicateurs` (`faiblesses.controller.ts:38`),
`GET /mandat-auditeur/obligation` (`mandat-auditeur.controller.ts:28`),
`GET /conventions-financement/creances-a-recevoir` (`convention-financement.controller.ts:52`),
`GET /emballages/consignations/:id/ouverture` (`emballages.controller.ts:35`),
`GET /taux-tva/liquidations` (`taux-tva.controller.ts:50`),
`GET /questionnaire-revision/catalogue` (`questionnaire.controller.ts:28`),
`GET /modeles-reglement/:id/echeances` (`tiers.controller.ts:146`),
`GET /ecritures/grand-livre/:compteId` (`ecriture.controller.ts:303`),
`GET /analytique/lignes/:ligneId/ventilations` (`analytique.controller.ts:167`).
Celles de l'inventaire et des provisions relèvent de B1 et B3.

**Correction.** Priorité au relevé : dans `RelancesPage.tsx`, un bouton
« Relevé » par tiers ouvrant l'état imprimable
(`GET /relances/releve/:compteId?exerciceId=`). Pour les autres, soit un
affichage dans la fenêtre concernée (indicateurs en tête de
`FaiblessesPage`, obligation d'audit en tête de `MandatAuditeurPage`,
registre des liquidations dans `DeclarationTvaPage`), soit une note dans le
contrôleur disant quel consommateur interne la justifie.

---

## 5. Constats cosmétiques (C)

### C1 · Deux entrées du menu Fichier ouvrent la même console

« Nouveau fichier comptable… » (`AppShell.tsx:135-137`) et « Administration
VMG Consulting » (`:192-194`) naviguent toutes deux vers `/plateforme`.
`PlateformePage.tsx` ne lit aucune adresse ; la création s'y ouvre par le
bouton « Nouveau cabinet client » (`:298`, état `nouveauOuvert`, `:117`).

**Correction.** Faire pointer la première sur
`/plateforme?action=nouveau-cabinet` ; passer `adresse` à la page dans le
registre (`registre-fenetres.tsx:497`) ; dans `PlateformePage`, initialiser
`nouveauOuvert` à `true` quand `action=nouveau-cabinet`.

### C2 · Libellés de menu et d'accueil différents du titre de la fenêtre

| Commande | Titre de la fenêtre (registre) |
|---|---|
| « Magasin et fiches de stock » (`AppShell.tsx:302`) | « Magasin · fiches de stock » (`:367`) |
| « Provisions pour risques et charges » (`:454`) | « Registre des provisions pour risques et charges » (`:396`) |
| « Balance agrégée du groupe » (`:476`) | « Groupe · balance agrégée » (`:504`) |
| « Restituer le dossier complet… » (`:161`) | « Restitution du dossier » (`:472`) |
| « Administration VMG Consulting » (`:193`) | « VMG Consulting · administration de la plateforme » (`:495`) |
| « Autorisations d'accès (utilisateurs) » (`:151`) | « Autorisations d'accès » (`:486`) |
| Accueil « Tableaux des immobilisations » (`AccueilPage.tsx:129`) | « Immobilisations et amortissements » (`:295`) |
| Accueil « Régularisations » (`:130`) | « Régularisations et abonnements » (`:540`) |
| Accueil « Retenues et fiscal » (`:158`) | « Retenues et échéancier fiscal » (`:322`) |
| Accueil « États analytiques » (`:157`) | « États analytiques et budgétaires » (`:574`) |
| Accueil « Grand livre » (`:107`) | menu « Grand livre des comptes » (`AppShell.tsx:388`) |

**Correction.** Aligner chaque libellé sur `titre` du registre (points de
suspension conservés pour les commandes qui ouvrent un assistant). Mieux :
dériver le libellé de `definitionPour(chemin).titre` pour qu'il ne puisse
plus diverger.

### C3 · Douze icônes mortes

Jamais importées, ni par le code ni par les tests, dans
`client/src/components/chrome/icons.tsx` : `IconSaisie` (`:21`), `IconHome`
(`:54`), `IconNews` (`:66`), `IconLifeBuoy` (`:69`), `IconAjouter` (`:106`),
`IconConsulter` (`:110`), `IconModifier` (`:114`), `IconSupprimer` (`:118`),
`IconRechercher` (`:122`), `IconAtteindre` (`:126`), `IconInverseur`
(`:130`), `IconTrier` (`:138`). Restes de l'ancienne barre d'outils à dix
verbes (voir `AppShell.tsx:636-638`).

**Correction.** Les supprimer.

### C4 · `IconeOmegaX` morte

`client/src/components/chrome/Logo.tsx:82`, aucun usage.

**Correction.** La supprimer (et ses dépendances locales si elles n'ont plus
d'autre usage).

### C5 · Préchargement du tableau de bord sans objet

`client/src/main.tsx:33-41` précharge `DashboardPage` au motif qu'elle est
« la première fenêtre ouverte ». Ce n'est plus vrai : l'accueil est le fond
permanent (`AppShell.tsx:31-35`) et le tableau de bord ne s'ouvre qu'à la
demande (`AppShell.tsx:345`, `AccueilPage.tsx:140`). Le module est téléchargé
à chaque ouverture pour rien. De plus, ce bloc s'est intercalé entre le
commentaire du service worker (`:23-32`) et son code (`:43-47`).

**Correction.** Supprimer `main.tsx:33-41` ; le commentaire du service
worker retrouve son code.

### C6 · Commentaires périmés ou faux

| Emplacement | Ce qu'il dit | Ce qui est vrai |
|---|---|---|
| `registre-fenetres.tsx:9` | « les 37 pages » | environ quatre-vingts pages sont chargées à la demande |
| `registre-fenetres.tsx:579-584` | commentaire de la colonne Engagement, posé sur `/conventions-financement` | il décrit `/engagements` (`:594-600`), qui n'a pas de commentaire ; celui de la convention suit (`:588-590`) |
| `AppShell.tsx:168-172` | le spec « gèle les vingt-deux éditions », une « vingt-troisième entrée » | `chrome-etroit.spec.ts:185` parle de vingt-six éditions, vingt-neuf libellés |
| `AppShell.tsx:239-241` | « Le registre ne passe AUCUNE écriture » | voir I10 |
| `ProvisionsPage.tsx:21-24` | « La saisie n'est pas ici » | voir B3 |
| `PasserEcritureFacture.tsx:12-13` | l'aide-comptable « serait refusé » | voir I7 |

**Correction.** Réécrire chacun selon la colonne de droite (les trois
derniers avec leur constat).

### C7 · `PaieDuMois` reçoit `peutEcrire={peutValider}`

`BulletinsPaie.tsx:227` passe `peutValider` dans une propriété nommée
`peutEcrire` (`PaieDuMois.tsx:50-57`). Le comportement est juste (la
passation est `@ReserveAuComptable`, `personnel.controller.ts:204-206`), le
nom trompe le prochain lecteur.

**Correction.** Renommer la propriété de `PaieDuMois` en `peutPasser` (ou
`peutValider`) et ses usages (`:80`, `:92`, `:155`, `:238`), ou faire lire
`peutValider` par `PaieDuMois` lui-même depuis `useAuth()`.

*Note de fin d'audit* · pendant la rédaction, une modification NON
committée de `BulletinsPaie.tsx` et `PaieDuMois.tsx`, étrangère à cet audit,
est apparue dans l'arbre de travail : elle retire la propriété et fait lire
le droit par `PaieDuMois`. Le constat est décrit sur l'état committé de
`main` ; il sera clos si cette modification est committée.

### C8 · Deux conventions pour un référentiel inconnu

Le registre (`referentiel-fenetre.ts:15-23`) masque toute fenêtre propre à un
référentiel tant que celui-ci n'est pas connu. Le menu fait l'inverse :
`estSycebnl` vaut `false` pour un référentiel absent (`AppShell.tsx:59`), et
les entrées écrites `estSycebnl ? [] : [...]` montrent alors les fenêtres
SYSCOHADA (devis `:278`, consolidation et IFRS `:511-512`, résultat fiscal
`:527-529`). L'aiguillage les refuse ensuite, d'où des commandes qui ne
mènent nulle part pendant le chargement.

**Correction.** Filtrer les entrées de menu par
`fenetreDisponible(definitionPour(chemin), referentiel)` au lieu de répéter
la règle à la main, ou à défaut écrire les conditions
`referentiel === 'SYSCOHADA'` explicitement.

### C9 · La restitution recompose `estAdmin`

`RestitutionPage.tsx:24` : `const peutExtraire = utilisateur?.role === 'ADMIN_CABINET'`.

**Correction.** `const { estAdmin: peutExtraire } = useAuth();`.

### C10 · Trois corps de requête non validés côté serveur

Relevé en contrôlant les corps : trois routes typent leur corps par un type
littéral, que le `ValidationPipe` ne sait pas valider (ni liste blanche, ni
type) : `exercice.controller.ts:43` (`reporterBudgets`),
`regularisation.controller.ts:49` (`exerciceCibleId`),
`devises.controller.ts:70` (`exerciceSuivantId`). Les écrans envoient les
bonnes clés, rien ne casse aujourd'hui.

**Correction.** Remplacer chaque type littéral par une classe DTO décorée
(`@IsOptional() @IsBoolean()`, `@IsUUID()`), comme partout ailleurs.

---

## 6. Axes sans constat

- **Atteignabilité.** Hormis `/journal-audit` (I1), toutes les fenêtres du
  registre sont atteintes par un menu ; `/comptes/:id/lettrage` et
  `/rapprochement/:id` le sont depuis leur fenêtre parente. Aucune page ni
  composant orphelin (tous importés par le registre, une page ou un
  composant).
- **Méthodes et chemins.** Tous les appels client visent une route
  existante avec la bonne méthode (chemins dynamiques de
  `BulletinsPaie.tsx:118`, `RapprochementDetailPage.tsx:119`, des exports
  d'états et de `EtatsSmtSyscohadaPage.tsx:134` vérifiés à la main).
- **Clés de corps.** Aucun corps littéral ne porte de clé absente de son DTO
  (contrôle automatique sur tous les appels à corps littéral, puis contrôle
  manuel des corps passés par variable ou par décomposition, notamment
  `AbonnementsConsole.tsx:96` et `VoletRibsTiers.tsx:82`).
- **Cloisonnement.** Chaque `referentielsApplicables` du registre a son
  `@ReferentielsAutorises` serveur correspondant (consolidation, IFRS, devis,
  fiscalité en SYSCOHADA ; accord-cadre, constitution, exonérations,
  donateurs, bailleurs, conventions, engagements en SYCEBNL ; groupe
  commun avec canevas SYCEBNL). Seul écart : I8.

---

## 7. Récapitulatif des corrections par fichier

| Fichier | Constats | Nature de la correction |
|---|---|---|
| `client/src/pages/InventairePage.tsx` | B1 | Sous-commissions et membres, comptage des fiches, ajout de fiche, arbitrage des écarts, PV de caisse |
| `client/src/pages/CircularisationPage.tsx` | B2 | Classement des réponses, procédures alternatives, motif de refus à la clôture |
| `client/src/pages/ProvisionsPage.tsx` | B3, C6 | Liste, création, modification, statut, suppression, report ; commentaire d'en-tête |
| `client/src/pages/ParametresDossierPage.tsx` | B4 | Choix du mode de tenue des stocks (administrateur) |
| `src/modules/exports/export.controller.ts` | F1 | Lire et transmettre `inclureBrouillard` ; test d'export |
| `client/src/pages/PersonnelPage.tsx` | F2, I10 | Fin de contrat ; lecture de `?onglet=` |
| `client/src/components/chrome/AppShell.tsx` | F3, F4, I1, I2, I3, I4, I5, I10, C1, C2, C6, C8 | « Mon compte… » pour tous ; garde du groupe ; journal d'audit ; déplacements vers Traitement ; balance fonctionnelle ; cloche ; « Paie du mois » ; lien de création ; libellés ; commentaires ; filtre par référentiel |
| `client/src/pages/UtilisateursPage.tsx` | F3 | Retirer les réglages personnels, déplacés dans « Mon compte » |
| `src/modules/auth/auth.service.ts`, `client/src/lib/auth.tsx` | F4 | Servir `estMereDeGroupe` (ou `plafondCellules`) |
| `client/src/lib/registre-fenetres.tsx` | F4, I1, I10, C1, C6 | Commentaire du groupe ; `reserveAdmin` ; `adresse` pour personnel et plateforme ; commentaires |
| `client/src/pages/RelancesPage.tsx` | I6, I11, I12 | `peutEcrire` depuis `useAuth()` ; niveaux ; relevé |
| `client/src/pages/RegularisationPage.tsx` | I6, I11 | `peutEcrire` ; modifier et supprimer un abonnement |
| `client/src/pages/DevisesPage.tsx` | I6, I11 | `peutEcrire` ; modifier une devise |
| `client/src/pages/CourrierPage.tsx` | I6 | `peutEcrire` depuis `useAuth()` |
| `client/src/pages/FacturationPage.tsx` | I6, I11 | `peutEcrire` ; supprimer une facture non comptabilisée |
| `client/src/pages/AffectationPage.tsx` | I6 | `peutValider` depuis `useAuth()` |
| `src/modules/etats-personnalises/etats-personnalises.controller.ts`, `src/modules/simulations/simulations.controller.ts`, `src/modules/facturation/facturation.controller.ts` | I7 | `@ReserveAuComptable()` (ou écrans en `peutEcrire`, à décider) |
| `client/src/components/PasserEcritureFacture.tsx` | I7, C6 | Commentaire |
| `client/src/pages/PlanComptesPage.tsx` | I8 | Catalogue fiscal en SYSCOHADA seulement |
| `client/src/lib/export.ts` (nouveau) et `BalanceAgeePage`, `TableauxImmobilisationsPage`, `EvolutionSoldesPage`, `JustificatifSoldePage`, `BalanceAuxiliairePage`, `GroupePage` | I9 | Crochet d'export partagé avec attente et message d'erreur |
| `client/src/pages/BulletinsPaie.tsx`, `client/src/pages/PaieDuMois.tsx` | C7 | Renommer la propriété |
| `client/src/pages/BrouillardPage.tsx` | I11 | Modifier une pièce en brouillard |
| `AccordCadrePage`, `MandatAuditeurPage`, `FaiblessesPage`, `DevisPage`, `ExonerationsPage`, `ConventionsFinancementPage`, `RegistreDonateursPage`, `PlansAnalytiquesPage`, `FiscalitePage`, `BanquesPage`, `ImmobilisationsPage`, `TiersPage`, `PlateformePage` | I11, I12, C1 | Commandes manquantes listées en I11 ; affichages de I12 ; `?action=nouveau-cabinet` |
| `client/src/components/chrome/OutilsChrome.tsx` | I5 | (aucune, la garde se pose dans AppShell) |
| `client/src/pages/AccueilPage.tsx` | C2 | Libellés des tuiles |
| `client/src/components/chrome/icons.tsx` | C3 | Supprimer douze icônes |
| `client/src/components/chrome/Logo.tsx` | C4 | Supprimer `IconeOmegaX` |
| `client/src/main.tsx` | C5 | Supprimer le préchargement |
| `client/src/pages/RestitutionPage.tsx` | C9 | `estAdmin` depuis `useAuth()` |
| `src/modules/exercice/exercice.controller.ts`, `src/modules/regularisation/regularisation.controller.ts`, `src/modules/devises/devises.controller.ts` | C10 | DTO décorés |
| `client/src/components/chrome/chrome-etroit.spec.ts` | I3, I4 | Mettre à jour le décompte des éditions après les déplacements |
