# Compta Flow — Plan de construction complet

> Document de référence, évolutif. Rédigé après analyse minutieuse de 19 documents de
> formation/référence Sage 100 Comptabilité i7 (et modules associés : Immobilisations,
> Moyens de Paiement/Banque, Paie & RH, Édition Pilotée, Sage X3), consolidés avec la
> vision déjà arrêtée pour Compta Flow. Sert de feuille de route brique par brique —
> **on ne construit rien de ce document tant qu'il n'a pas été explicitement demandé**,
> conformément à la méthode adoptée depuis le début du projet.
>
> Sources : `docs/references/sage-i7/` (synthèse par thème) et le skill de référence
> `.claude/skills/sage-i7/` livré avec ce dépôt.

---

## 1. Où on en est

**Construit et vérifié (Phase 0-1 + première fondation) :**

- Backend NestJS + Prisma + PostgreSQL, multi-tenant (Tenant → Licence → Exercice →
  Compte → Ecriture/LigneEcriture → User).
- Auth JWT (payload minimal, re-résolution fraîche à chaque requête), RBAC à 3 rôles
  (`ADMIN_CABINET` / `COMPTABLE` / `LECTURE_SEULE`) via `@Roles()` + `RolesGuard`.
- Plan de comptes SYCEBNL **complet** (696 comptes, classes 1 à 8 + comptes 90/91 de la
  classe 9 — voir feuille de route §4.7) seedé à la création du dossier, création de
  comptes individuels via `PlanComptesPage`, comptes "Total"/regroupement par racine.
- Écritures en partie double, journal, grand livre, balance, bilan (simplifié).
- Gestion des utilisateurs et rôles (module `UtilisateursPage`, désactivation,
  changement de rôle, protection contre l'auto-désactivation).
- Frontend React dense façon "logiciel expert-comptable" (Accueil en tuiles, assistant
  Nouveau fichier comptable, ruban contextuel, arborescence de navigation).

**Ce que l'analyse Sage vient confirmer comme fondations manquantes** (avant même les
grosses briques métier de la vision long terme) — voir §3.

---

## 2. Vision et principes directeurs (rappel, inchangés)

1. Logiciel professionnel OHADA, dense et structuré façon Sage Compta i7 — pas un
   "SaaS IA générique". Design déjà validé, ne pas y revenir.
2. Deux modèles commerciaux : abonnement (coupure automatique à expiration) et achat
   ferme (SaaS perpétuel + on-premise, on-premise en dernier).
3. MVP = référentiel **SYCEBNL** d'abord ; **SYSCOHADA** (entreprises) en Phase 3.

   ⚠️ **Précision de scope, ajoutée le 2026-08-28** (la formulation d'origine
   ci-dessus — "associations/ONG/projets de développement" — laissait
   entendre à tort que les deux étaient couverts dès le départ ; ce n'est pas
   le cas et ça n'a jamais été vérifié explicitement avant cette date).
   SYCEBNL prévoit en réalité **trois jeux d'états financiers distincts**,
   pas un seul régime unique :
   1. **Associations et ordres professionnels**, Système normal ;
   2. **Projets de développement et assimilés**, Système normal ;
   3. **Système Minimal de Trésorerie** (SMT, petites entités < 30 M FCFA).

   Tout ce qui a été construit jusqu'ici (moteur de mapping bilan, compte de
   résultat — items 10 et 12) **ne couvre que le jeu n° 1** (associations et
   ordres professionnels). Ce n'est pas qu'une différence de libellés : le
   jeu "projets de développement" a des états structurellement différents
   (tableau emplois-ressources, tableau d'exécution budgétaire, tableau de
   réconciliation de trésorerie, bilan à codes REF propres, **compte
   d'exploitation** — dont le solde doit être exactement NUL, pas un
   résultat net comme pour une association) et ses propres codes REF/tableaux
   de correspondance. Le jeu SMT n'est pas non plus couvert. Voir item 15
   pour le chantier d'extension au jeu "projets de développement", engagé le
   même jour suite à l'analyse d'une vraie liasse DGI RDC déposée pour un
   projet de développement réel (Google Drive, dossier `Sycebnl`).
4. Vision fonctionnelle long terme, dans cet esprit (non séquencée avant ce document) :
   immobilisations + plan d'amortissement, gestion des stocks, gestion des tiers, moteur
   de mapping pour générer tout état financier depuis une balance, passage OHADA→IFRS.
5. **On construit petit à petit, brique par brique.** Ce document enrichit et ordonne
   cette vision — il ne la remplace pas, et ne dispense pas de valider chaque brique
   avant de l'attaquer.
6. **Chaque brique est ancrée aux référentiels OHADA/SYCEBNL et aux textes locaux
   congolais pertinents — jamais construite ni close sans ce contrôle.** Ne jamais
   citer une règle comptable, fiscale, sociale ou juridique de mémoire : toujours lire
   le skill correspondant (règle déjà appliquée pour le plan de comptes et la TVA,
   généralisée ici à toute brique future qui touche un domaine réglementé). Une brique
   dont la conformité n'est que partielle (ex. le bilan actuel — regroupement
   simplifié, pas le tableau de correspondance officiel) le dit explicitement dans le
   code ET à l'écran, jamais silencieusement. Table de correspondance domaine → skill,
   à consulter avant d'attaquer une brique et à élargir au fil des besoins :

   | Domaine de la brique | Skill(s) à consulter |
   |---|---|
   | Plan de comptes, structure comptable, états financiers SYCEBNL | `sycebnl` |
   | Plan de comptes SYSCOHADA (Phase 3) | `syscohada` |
   | Acte uniforme comptable général (au-delà de SYCEBNL) | `audcif-acte-uniforme` |
   | Autres actes uniformes OHADA (sociétés, sûretés, procédures collectives...) | `auscgie-acte-uniforme`, `aupcap-acte-uniforme`, `aus-acte-uniforme`, `aupsrve-acte-uniforme`, `aua-acte-uniforme`, `auctmr-acte-uniforme`, `audcg-acte-uniforme`, `auscoop-acte-uniforme`, `aum-acte-uniforme` (au cas par cas) |
   | TVA, impôts, taxes RDC | `fiscalite-rdc`, `fiscalite-rdc-socle`, `precis-droit-fiscal-congolais-kalonji` |
   | Paie, droit du travail (brique Paie, hors périmètre actuel) | `droit-travail-congolais` |
   | Cotisations sociales (CNSS) | `cnss-cotisations-sociales-rdc` |
   | Immobilisations (brique à venir) — amortissement fiscal vs comptable | `fiscalite-rdc` + `sycebnl` (comptes classe 2/28/29) |
   | Audit, commissariat aux comptes (seuils art. 19-22 SYCEBNL) | `guide-pratique-mission-audit-ohada`, `isa-isqm-normes`, `iaasb-assurance-services-connexes` |
   | Passage OHADA→IFRS (vision long terme) | `ifrs`, `gcec-ifrs-rdc` |
   | Normalisation comptable congolaise au-delà de SYCEBNL/OHADA | `kinzonzi-normalisation-comptable`, `organisation-comptable-cpcc` |
   | Enregistrement/statut légal d'une ASBL (hors comptabilité) | `note-circulaire-003-2013-enregistrement-asbl-eup` (fichier référence du skill `sycebnl`) |

   Cette table n'est pas exhaustive et ne remplace pas la lecture du skill au moment
   de la brique — elle sert à ne pas oublier de la consulter.

---

## 3. Ce que l'analyse Sage change concrètement à l'architecture cible

Organisé par domaine ; chaque point indique s'il s'agit d'un **manque confirmé**
(à corriger), d'un **enrichissement** (idée nouvelle à intégrer à une brique déjà
prévue), ou d'un **pattern transposable** (principe d'architecture, pas une
fonctionnalité copiée telle quelle).

### 3.1 Comptabilité générale — fondations à consolider avant les grosses briques

| Sujet | Constat Sage | Décision pour Compta Flow |
|---|---|---|
| **Journal** | Entité de 1er ordre : code, type (Achats/Ventes/Trésorerie/Général/Situation), compte de trésorerie associé, mode de numérotation des pièces (Manuelle/Continue par journal/Continue pour le fichier/Mensuelle), comportement de contrepartie | **Manque confirmé.** `journalCode` doit devenir une vraie table `Journal`, pas une string libre. Prioritaire : sans ça, ni la trésorerie ni un futur module Banque ne peuvent s'appuyer dessus proprement. |
| **Clôture d'exercice** | 3 granularités (Partielle/Totale/Période) + génération réelle des reports à-nouveau selon 3 modes par compte (Aucun/Solde/Détail, ce dernier nécessitant un lettrage préalable complet) | **Manque confirmé.** `ExerciceService.cloturer()` ne fait aujourd'hui qu'un changement de statut. Le report à-nouveau réel (calcul + écritures RAN) est un prérequis avant de pouvoir dire que le cycle de vie d'un exercice est "complet". |
| **Comptes total/regroupement** | Compte "Total" agrégeant les comptes "Détail" de même racine | **Enrichissement** du futur moteur de mapping (§3.5) — un état financier généré depuis une balance a besoin de cette notion de regroupement par racine, pas seulement d'un mapping ligne à ligne. |
| **Lettrage** | Algorithme réel de rapprochement débit/crédit (manuel, automatique par montant, pré-lettrage, dé-lettrage), avec lettre associée à chaque écriture | **Manque confirmé, brique à part entière.** Condition préalable à un report à-nouveau "Détail" correct et à toute future gestion des tiers sérieuse. |
| **Rapprochement bancaire** | Pointage manuel + automatique (tolérance de montant, écriture d'ajustement en cas de déséquilibre), extraits importés | **Manque confirmé**, à rattacher à une future brique Trésorerie. |
| **TVA / taxes** | Entité "Taux de taxe" à part entière : 7 types possibles (Débit/Encaissement/TP-HT/TP-TTC/TP-Poids/CEE/Surtaxe), compte + comptes HT rattachés, registre de suivi par taux | **Manque confirmé.** Zéro équivalent actuellement. Nécessaire dès qu'on veut automatiser la TVA plutôt que la saisir en dur ligne à ligne. |
| **Écritures de régularisation** (charges/produits constatés d'avance, avec extourne N→N+1) et **écritures d'abonnement** (récurrentes, façon loyer) | Automatisations avancées, absentes chez nous | **Enrichissement différé**, mais à concevoir avec la même logique de "modèle de saisie" déjà en place côté frontend (`SaisiePage`). |
| **Comptabilité analytique** | Multi-plans (jusqu'à 10-11), sections Détail/Total, niveaux d'analyse, budget par axe | **Enrichissement pour SYCEBNL** : l'équivalent naturel pour une association/ONG est un suivi analytique **par projet/bailleur** — pertinent, mais explicitement hors scope tant que la comptabilité générale n'est pas consolidée. |

### 3.2 Tiers (brique déjà identifiée dans la roadmap, désormais spécifiée)

- 4 types : Client / Fournisseur / Salarié / Autre.
- Un tiers a un ou plusieurs comptes généraux rattachés, dont un marqué **Principal**
  (modèle "sous-compte auxiliaire remonté sur un compte collectif" — à reprendre tel quel).
- **Modèle de règlement** (conditions de paiement) réutilisable : type
  (pourcentage/équilibre/montant) + délai + condition de calcul d'échéance.
- Lettrage automatique configurable par tiers, exclusions (hors rappel/relevé, non
  soumis à pénalités).
- Cette brique dépend directement du lettrage (§3.1) — **séquencement : Journal →
  Lettrage → Tiers**, pas l'inverse.

### 3.3 Immobilisations (déjà sur la roadmap long terme, désormais spécifiée en détail)

Modèle de données minimal, validé par deux documents indépendants :

- `FamilleImmobilisation` (gabarit) : identification, méthode/durée d'amortissement par
  défaut, comptes de dotation économique + fiscale.
- `Immobilisation` (instance) : rattachement famille, nature d'acquisition
  (Acquisition/Production/Échange/Reprise), nature de bien (5 catégories : incorporelles
  amort./non-amort., corporelles amort./non-amort., financières), lieu du bien,
  valeur résiduelle déduite de la base amortissable.
- **Gestion des composants** (enrichissement important) : un bien "Composé" peut être
  décomposé en plusieurs "Composants" ayant chacun leur propre plan d'amortissement —
  modèle standard pour bâtiments/flottes/équipements complexes, pertinent pour des ONG
  gérant des infrastructures.
- **Amortissement dérogatoire** (fiscal vs comptable, écart porté en provisions
  réglementées) : probablement hors scope SYCEBNL immédiat (associations à but non
  lucratif), plus pertinent pour le futur volet **SYSCOHADA entreprises (Phase 3)**.
- **Plan d'amortissement natif distinct des plans National/IFRS**, utilisé comme
  plafond de contrôle — confirme qu'une gestion IFRS sérieuse (§3.6) se conçoit en
  multi-plans dès la conception du module Immobilisations, pas en rustine après coup.
- Écritures de dotation générées périodiquement, gestion de sortie (Cession / Mise
  hors service / Renouvellement de composant), chacune avec sa propre logique de
  dotation exceptionnelle.

### 3.4 Trésorerie (nouvelle brique identifiée, pas dans la vision initiale)

Confirmée par le module "Moyens de Paiement" Sage :

- Instruments distincts (LCR, virement, prélèvement) avec un cycle saisie → pointage →
  transmission → bordereau — le règlement n'est finalisé qu'après édition du bordereau
  (point de contrôle à reprendre : un règlement "en attente d'impression" est un état
  légitime, pas un détail cosmétique).
- **Lots préétablis** de paiements récurrents (réutilisable aussi pour une future Paie).
- **Liaison comptable étroite** : le module paiement doit lire les échéances côté
  comptabilité, générer les écritures de règlement, ET déclencher le lettrage
  automatique — modèle d'intégration inter-module à concevoir proprement (pas un
  module isolé qui exporte un fichier).
- Les canaux bancaires français (ETEBAC/LIBERTE/EBICS) ne sont **pas transposables**
  tels quels en zone OHADA — à retenir seulement comme *pattern* (import/export de
  relevés bancaires normalisés), le besoin réel dépendra des banques locales ciblées.

### 3.5 Moteur de mapping / états financiers (déjà sur la roadmap long terme)

Deux mécanismes Sage à intégrer dans la conception :

- Les comptes "Total" par racine (§3.1) : le moteur doit savoir agréger par préfixe de
  numéro de compte, pas seulement mapper compte par compte.
- Les "comptes reporting" (classification alternative pour consolidation groupe) :
  hors scope MVP, mais montre que le moteur devrait, à terme, permettre plusieurs
  classifications simultanées d'un même compte (ex. classification SYCEBNL native +
  classification IFRS) — c'est le pont direct vers l'item "passage OHADA→IFRS" déjà
  dans la vision.

### 3.6 OHADA → IFRS (déjà sur la roadmap long terme)

Confirmé par deux modules Sage indépendants (Immobilisations et Comptabilité générale) :
la bonne pratique n'est **pas** une conversion a posteriori, mais une architecture
native multi-plans : chaque compte/journal/immobilisation peut porter, dès sa création,
une classification nationale ET une classification IFRS, avec des écritures et
ventilations générées séparément pour chaque norme. À concevoir ainsi dès que ce
chantier sera engagé, pas en couche de traduction ajoutée après coup.

### 3.7 RBAC (brique déjà construite — enrichissement de réserve, pas pour maintenant)

Le modèle Sage X3 (hors périmètre i7, mais pertinent ici) est nettement plus fin que
nos 3 rôles globaux : Fiche utilisateur → Profils fonctions → Habilitation
fonctionnelle + Codes d'accès (contrôle fin par écran/champ) → Rôles de filtrage des
données (pas seulement des actions). **À garder en réserve** si un client a un jour
besoin de restreindre l'accès à certains comptes/dossiers plutôt qu'à des actions
globales — pas une priorité actuelle.

### 3.8 Paie (hors périmètre SYCEBNL actuel — analysé pour la vision, pas pour construire)

Si une brique Paie est engagée un jour, deux enseignements structurants :

- **Moteur de constantes** (règles/formules à 4 modes : Prédéfini/Test/Tranche-barème/
  Calcul libre référençant d'autres constantes) — c'est le même besoin que le futur
  moteur de mapping/taxes : un moteur de règles générique serait mutualisable entre
  TVA, immobilisations fiscales et paie plutôt que réinventé trois fois.
- **Fiscalité paramétrée par pays, jamais en dur** : chaque État OHADA a son propre code
  du travail et sa propre fiscalité sur salaires (barèmes IGR/CN observés ici pour la
  Côte d'Ivoire) — une brique Paie multi-pays OHADA devra traiter chaque barème comme
  une donnée configurable dès la conception, pas comme du code spécifique par pays.
- La **passation comptable** (export du "journal de paie") devrait, chez nous,
  s'intégrer directement au moteur d'écritures existant (`Ecriture`/`LigneEcriture`),
  pas passer par un fichier plat à réimporter manuellement comme le fait Sage.

### 3.9 Reporting / BI avancé (aval de la roadmap, noté pour mémoire)

Le module "Édition Pilotée" de Sage confirme un pattern à trois modes d'accès aux
rapports (par objectif métier / accès direct / favoris personnalisés), un historique
pluriannuel des indicateurs, et un simulateur de scénarios (croissance/charges) avec
jauge visuelle. Intéressant pour une future version avancée de notre tableau de bord,
mais très en aval — Postgres + requêtes vivantes suffira largement tant que le volume
ne l'impose pas (Sage s'appuie sur un cube de données séparé, rafraîchi
périodiquement ; pas nécessaire à notre échelle actuelle).

---

## 4. Feuille de route brique par brique (proposée, à valider une brique à la fois)

Ordre de dépendances techniques réelles, pas un simple ordre de préférence :

1. ✅ **Journal comme entité de 1er ordre** (code, type, numérotation, compte de
   trésorerie) — livré : modèle `Journal` (5 types, 4 modes de numérotation),
   `JournalService.prochainNumeroPiece()` (testé sur les 4 modes), seed automatique de
   5 journaux à l'inscription (ACH/VEN/BQ/CA/OD), écran "Codes journaux"
   (`/journaux`), `Ecriture.journalId` (remplace l'ancien `journalCode` en texte
   libre), `SaisiePage` résout désormais le journal via le compte de trésorerie
   plutôt qu'un préfixe de numéro de compte codé en dur. Vérifié de bout en bout
   (curl + Playwright) : seed, rejet d'un journal Trésorerie sans compte, mise en
   sommeil bloquant la saisie, numérotation mensuelle qui incrémente puis se
   réinitialise au mois suivant. **Audit de suivi** : condition de course corrigée
   dans le calcul du numéro de pièce (lecture-puis-écriture non atomique — deux
   écritures simultanées sur le même journal pouvaient recevoir le même numéro),
   via une transaction Serializable + reprise automatique ; validé par un test de
   concurrence réel (8 puis 12 écritures simultanées, tous numéros distincts).
2. ✅ **Lettrage** (manuel puis automatique) — livré : `LigneEcriture.lettre`,
   lettrage manuel (rejet si déjà lettré ou solde de sélection non nul), délettrage,
   lettrage automatique (paires exactes 1-pour-1), écran `/comptes/:id/lettrage`
   accessible depuis le Plan de comptes et le menu Traitement. Même protection
   contre les conditions de course que le numéro de pièce de journal, factorisée
   dans `common/prisma-retry.util.ts`. Vérifié de bout en bout (curl + Playwright).
   Prérequis désormais posé pour le report à-nouveau "Détail" et la future brique
   Tiers. **Second audit** (Journal + Lettrage relus intégralement une seconde
   fois) : un trou de validation trouvé et corrigé — `JournalService.modifier()`
   acceptait `compteTresorerieId: null` sur un journal Trésorerie sans aucun
   contrôle (contrairement à `creer()`, qui l'interdit à la création), un appel
   direct à l'API pouvait donc casser silencieusement le lien compte↔journal ;
   vérifié via un appel PATCH réel (400 désormais, message explicite). Rien
   d'autre trouvé qui corrompe des données ou casse une invariante.
   **Approfondissement — lettrage automatique N-pour-1** : le cas noté comme
   enrichissement futur (plusieurs lignes d'un côté soldant une seule de l'autre —
   ex. trois factures réglées par un seul virement, ou un acompte réparti sur
   plusieurs factures) est désormais couvert, en plus des paires 1-pour-1. Algo en
   3 passes : paires exactes d'abord (réduit vite le nombre de lignes), puis
   recherche par sous-ensemble (backtracking sur les montants en centimes, trié
   décroissant pour couper tôt) côté débits pour chaque crédit restant, puis côté
   crédits pour chaque débit restant ; plafonné à 25 lignes du côté fouillé pour
   rester borné en temps de calcul (le 1-pour-1 reste, lui, toujours effectué au-
   delà). **4ᵉ passe ajoutée depuis** : le cas général N-pour-M (un sous-
   ensemble de débits ET un sous-ensemble de crédits, tous deux non triviaux —
   ex. deux factures réglées par deux virements, sans qu'aucune paire ni
   aucun total 1-pour-N ne coïncide individuellement) — énumération de toutes
   les combinaisons possibles des deux côtés (2^n), donc plafonnée bien plus
   bas (16 lignes) que le N-pour-1 ; retient le plus petit match trouvé pour
   éviter d'engloutir tout le pool restant en un seul groupe. Vérifié via
   curl : 2 débits (100+150) ↔ 2 crédits (90+160), aucun montant ne matchant
   isolément, deux lignes décoy correctement laissées de côté. Réponse de l'API renommée `{ paires }` →
   `{ groupes }` (reflète mieux un groupe qui peut compter plus de 2 lignes),
   frontend mis à jour en conséquence. Vérifié via curl (3 débits 120+230+151
   soldant 1 crédit 501 ; 1 débit 402 soldé par 3 crédits 91+161+150 ; deux lignes
   décoy isolées correctement laissées non lettrées) et Playwright (bouton
   "Lettrage auto" de `LettragePage`, un 3ᵉ groupe créé et lettré en direct dans
   l'UI sans toucher aux groupes précédents).
3. ✅ **Cycle de vie complet de l'exercice** — livré : clôture à 3 granularités
   (`Cloture` : Partielle réversible par journal, Totale définitive par journal, Période
   définitive tous journaux confondus), `ExerciceService.verifierEcritureAutorisee`
   appelée par `EcritureService.creer()` avant toute saisie. Clôture ANNUELLE réécrite :
   solde les comptes en mode `AUCUN` (charges/produits) sur le compte 130000 "Résultat
   de l'exercice", puis génère le report à-nouveau réel dans l'exercice suivant (créé
   automatiquement s'il n'existe pas) selon le mode de chaque compte (`SOLDE` = un
   solde net, `DETAIL` = chaque mouvement non lettré individuellement). Les deux
   écritures générées s'équilibrent par construction (identité partie double) ; un
   déséquilibre lèverait une erreur interne plutôt que de poster une écriture fausse.
   Vérifié de bout en bout via curl : verrouillage Partielle (bloque puis autorise après
   annulation), Totale (bloque définitivement, rejette une 2ᵉ clôture, rejette
   l'annulation), Période (bloque tous journaux jusqu'à une date), et clôture annuelle
   complète (don 500 + achat 200 → résultat 300 crédité sur 130000, reporté avec la
   Banque dans l'exercice suivant auto-créé, balance équilibrée 300/300).
   Frontend livré : `ExercicePage` (sélecteur d'exercice, clôture annuelle avec
   confirmation, les 3 formulaires de clôture, liste des clôtures + annulation),
   accessible depuis le menu Traitement > "Clôture d'exercice".
   **Approfondissement** : le mode de report à-nouveau `DETAIL` (chaque mouvement
   NON lettré reporté individuellement) n'avait encore jamais été exercé — le
   test de clôture ci-dessus ne mouvementait que des comptes en mode `SOLDE`.
   Vérifié via curl sur un compte 411001 en mode `DETAIL` : une paire lettrée
   (vente 500 + encaissement 500, lettre A) correctement **exclue** du report,
   deux mouvements non lettrés (vente 300, avoir 100) chacun repris
   **individuellement** avec leur libellé d'origine (`RAN détail 411001 —
   Vente facture B` / `— Avoir facture B`), écriture de RAN globale équilibrée
   (800/800 : résultat 700 + Banque 500 + Client détail 300/100). Aucun bug
   trouvé — un chemin de code jusque-là jamais exécuté est désormais couvert.
   `ExercicePage` elle-même vérifiée en Playwright (elle ne l'avait été qu'au
   build jusqu'ici) : clôture Partielle réelle via l'UI (sélection du journal,
   date, soumission, apparition dans la liste), puis clôture annuelle (bouton
   avec `confirm()` du navigateur, capturé et accepté), sélecteur d'exercice
   passé à "Clôturé", bouton devenu "EXERCICE DÉJÀ CLÔTURÉ".

   **Audit rétroactif "§2.6" (chaque brique ancrée aux référentiels)** : un
   vrai défaut trouvé et corrigé. La clôture postait le résultat sur un
   compte **"130000" fictif**, absent du plan de comptes officiel — le skill
   `sycebnl` (COMPTE 13, `partie2-ch3-classe1-comptes10-19.md`) ne connaît que
   131 (Excédent, solde créditeur) et 139 (Déficit, solde débiteur), déjà
   seedés dans le plan de comptes (brique 7) mais jamais utilisés par la
   clôture jusqu'ici. Corrigé : le compte réel (131 ou 139) est choisi selon
   le signe de `deltaResultat`, ligne de clôture nette (un seul sens
   débit/crédit, pas les deux à la fois sur la même ligne comme avant).
   Vérifié de bout en bout sur deux tenants réels : un exercice excédentaire
   (produit 1000, aucune charge) clôture bien sur 13100000, report à-nouveau
   suivant correct (13100000 crédité 1000 + Caisse débitée 1000, équilibré) ;
   un exercice déficitaire (charge 500, aucun produit) clôture bien sur
   13900000. Limite connue et **non corrigée à ce stade**, signalée
   explicitement plutôt que cachée (même règle) : le texte officiel prévoit
   que le compte 13 soit soldé par virement vers 12/11/10 sur décision des
   organes compétents (affectation du résultat) — faute de cette brique (pas
   construite), 131/139 continuent aujourd'hui de s'accumuler d'exercice en
   exercice via le report à-nouveau au lieu d'être remis à zéro. À traiter
   par une future brique "Affectation du résultat".

   **Reste de l'audit rétroactif** (autres briques déjà livrées, relues
   contre les référentiels avant de passer à la suite) : la TVA (brique 5)
   était déjà correctement ancrée (articles de l'O.-L. n° 10/001 cités dans
   le code depuis sa construction, avant même que la règle §2.6 soit
   écrite) — rien à corriger. Le plan de comptes (brique 7) et les comptes
   Total (brique 6, fondés sur le principe de codification décimale du
   skill) sont conformes par construction. Seule réserve mineure, non
   corrigée (purement cosmétique, sans impact comptable) : `TypeTiers`
   utilise un vocabulaire générique (CLIENT/FOURNISSEUR/SALARIE/AUTRE,
   hérité du pattern Sage) plutôt que la terminologie SYCEBNL propre
   ("Adhérents, Clients-usagers" — compte 41) ; les numéros de compte
   sous-jacents restent corrects, seul le libellé du type dans l'enum
   diffère.
   **Second passage** : les formulaires Totale et Période, et le bouton
   "Annuler" une clôture réversible, n'avaient encore jamais été cliqués en
   Playwright (seulement Partielle et la clôture annuelle). Vérifiés à leur
   tour : clôture Totale sur un journal puis Période tous journaux confondus
   (apparaissent bien toutes les deux dans la liste, sans bouton "Annuler" —
   cohérent, elles sont définitives), puis clôture Partielle + "Annuler" avec
   confirmation du navigateur → passage à "ANNULÉE", bouton disparu. Aucun bug
   trouvé (une apparente incohérence d'affichage lors du test s'est révélée
   être un artefact de timing du script de test, pas de l'application — un
   rechargement de page confirme que les 3 clôtures restent toutes visibles).
   Brique complète.
4. ✅ **Tiers** — livré : 4 types (Client/Fournisseur/Salarié/Autre), comptes
   généraux rattachés (`TiersCompte`, un compte n'appartient qu'à un seul tiers —
   contrainte `@unique` sur `compteId`, un seul marqué Principal à la fois, imposé
   en service), `ModeleReglement` réutilisable entre tiers (délai en jours +
   condition d'échéance Net/Fin de mois, mono-échéance par défaut — voir plus
   bas pour le fractionnement). Seuls les comptes de classe 4 peuvent être
   rattachés. Écran `/tiers` (création, filtre
   type/recherche, rattachement/détachement de comptes, bascule Principal, gestion
   des modèles de règlement), accessible depuis Structure et le menu Tiers.
   Vérifié de bout en bout via curl : rejet d'un rattachement sur un compte hors
   classe 4, rejet d'un compte déjà rattaché à un autre tiers, un seul Principal
   après bascule, rejet des codes tiers/modèles dupliqués, détachement.
   **Approfondissement** : `TiersPage` n'avait jamais été vérifiée en Playwright
   (seulement curl) — corrigé. À cette occasion, ajout d'un raccourci solde +
   lettrage manquant : chaque compte rattaché affiche désormais son solde de
   l'exercice courant (`GET /ecritures/balance`) et un bouton "Lettrage" qui
   ouvre directement `/comptes/:id/lettrage`, sans repasser par le Plan de
   comptes. Un vrai bug trouvé au passage et corrigé : la réponse de
   `/ecritures/balance` est `{ lignes, totaux }`, pas un tableau brut — le
   premier code écrit pour `TiersPage` la traitait comme un tableau (repris
   par erreur d'un autre pattern), échec silencieux (promesse rejetée sans
   `.catch()`, solde resté à "—" sans qu'aucune erreur ne s'affiche). Vérifié
   via Playwright : tiers créé, compte avec un solde réel de 250 rattaché,
   solde 250 bien affiché dans le tableau, clic sur "Lettrage" navigue
   correctement vers l'écran de lettrage du compte.
   **Second passage** : les boutons "Rattacher", "Définir principal" et
   "Détacher" n'avaient eux non plus jamais été cliqués en Playwright
   (seulement curl). Un second vrai bug trouvé et corrigé :
   `TiersService.trouver()` n'imposait aucun `orderBy` explicite sur
   `comptesRattaches` — Postgres ne garantit aucun ordre stable sans lui, et
   l'ordre affiché changeait visiblement après un simple `UPDATE` (bascule du
   compte Principal), ce qui rendait le bouton "Détacher" de la mauvaise
   ligne trompeur pour l'utilisateur (rien ne bougeait à l'écran entre le
   clic et le résultat, mais la ligne visée n'était plus la même). Corrigé
   par `orderBy: { createdAt: 'asc' }`. Vérifié via Playwright, deux comptes
   rattachés, bascule Principal puis détachement : ordre désormais stable
   d'un rafraîchissement à l'autre, la bonne ligne est toujours détachée.
   **Troisième approfondissement — fractionnement en plusieurs échéances** :
   le mono-échéance noté comme limite MVP est désormais un cas particulier,
   pas une limite. `EcheanceReglement` (table à part, rattachée à un
   `ModeleReglement`) porte le pattern Sage : type Pourcentage/Montant/
   Équilibre + délai + condition, par échéance. Rétrocompatible par
   construction : un modèle sans aucune ligne `EcheanceReglement` reste
   mono-échéance (100 % à `delaiJours`/`echeance` du modèle lui-même, exactement
   le comportement d'avant). Contrôles : un seul Équilibre par modèle, somme
   des Pourcentages ≤ 100 %, ordre unique par modèle. `TiersService.
   calculerEcheances()` simule l'échéancier d'une facture (pure lecture,
   aucune facture réelle n'existe encore dans le modèle de données) ; la
   dernière échéance absorbe toujours le reste exact (même si elle n'est pas
   explicitement Équilibre), pour ne jamais laisser un centime d'arrondi non
   réparti. Écran : panneau dépliable par modèle dans `/tiers` (liste des
   échéances + formulaire d'ajout/suppression + simulateur avec date de
   facture et montant). Vérifié de bout en bout via curl (30 %/30 %/Équilibre
   sur 1000 → 300/300/400 avec les bonnes dates NET et FIN_DE_MOIS, calculées
   et recoupées indépendamment en Python ; rejets ordre dupliqué, second
   Équilibre, dépassement de 100 %) et Playwright (ajout de deux échéances et
   simulation via l'UI réelle — un premier essai de script avait mal ciblé un
   champ homonyme d'un autre formulaire de la page, corrigé côté script, pas
   côté application : aucun bug trouvé une fois le test correctement scopé).
5. ✅ **TVA / taux de taxes** — livré, entité paramétrable **et appliquée à la
   saisie**. `TauxTva` (code, intitule, taux %, compte de TVA collectée 443 et
   compte de TVA déductible 445 rattachés, actif/inactif). Fondé sur
   l'Ordonnance-Loi n° 10/001 du 20/08/2010 telle que modifiée par la Loi de
   Finances 2026 (art. 35, modifié par l'art. 46 de la LF n° 25/060 du
   29/12/2025) — skill `fiscalite-rdc/tva` : taux normal **16 %**, réduits
   **1 %** (produits de première nécessité, matières premières industrielles,
   intrants agricoles/ciment/infrastructures publiques) et **5 %** (réservé
   aux seuls billets d'avion sur le trafic aérien national — ne pas confondre
   avec l'ancien taux réduit unique de 8 %, abrogé), taux zéro **0 %**
   (exportations). Seed automatique des 4 taux légaux à l'inscription, avec
   les comptes 443100/444100/445100 ajoutés au plan SYCEBNL (skill `sycebnl` +
   `audcif-acte-uniforme`, mécanique de collecte/déduction vérifiée sur les
   comptes 40/41/443/445 des deux skills). **Exonération ASBL** (art. 15.2 et
   17.8 : ventes, importations et prestations conformes à l'objet social, sous
   réserve de non-distorsion de concurrence pour les prestations) volontairement
   **non modélisée comme un taux à 0 %** — une opération exonérée ne porte
   aucune ligne de TVA, ce n'est pas un taux ; le tenant qui veut tracer ces
   opérations peut créer un taux "EXO" à 0 % sans compte rattaché, à titre
   documentaire. Écran `/taux-tva` (Structure > Taux de taxes), CRUD admin.
   **Application à la saisie** : `LigneEcriture.tauxTvaId` (rattachement de la
   ligne de TVA à son taux) ; `SaisiePage` reçoit deux nouvelles opérations
   guidées « Vente avec TVA » / « Achat avec TVA » (choix du compte de
   produit/charge, du taux, montant saisi en HT, calcul HT→TVA→TTC affiché en
   direct, écriture à 3 lignes générée, ligne de TVA omise si le montant est
   nul). **Registre/déclaration TVA** (`TauxTvaService.declaration`, écran
   `/declaration-tva`, États > Déclaration TVA) : pour une période, somme par
   taux la TVA collectée (443) et déductible (445), TVA nette à décaisser ou
   crédit à reporter — lecture seule, ne comptabilise pas la liquidation sur
   le compte 444. Vérifié de bout en bout (curl + Playwright, UI réelle) :
   seed des 4 taux + comptes à l'inscription, rejet code dupliqué, rejet
   compte rattaché inexistant, rejet d'un `tauxTvaId` d'un autre tenant sur
   une écriture, bascule actif/inactif filtrée, vente 1000 HT + achat 500 HT
   à 16 % → déclaration exacte (collectée 160, déductible 80, net 80 à
   décaisser).
   **Approfondissement** : `TauxTvaPage` elle-même (l'écran `/taux-tva`, pas
   seulement l'API) n'avait jamais été cliquée en Playwright — création d'un
   taux et bascule actif/inactif vérifiées directement dans l'UI. Aucun bug
   trouvé.
   **Second approfondissement — prorata et liquidation** : les deux points
   notés hors scope sont désormais livrés. `TauxTvaService.calculerProrata`
   applique l'art. 43 O.-L. : rapport entre les recettes des opérations
   taxables (toute écriture portant au moins une ligne de TVA, taux zéro
   export inclus — classe 7 des écritures concernées) et les recettes totales
   (toute la classe 7 sur la période), **arrondi à l'unité supérieure**
   (règle explicite du texte, pas un arrondi standard) ; appliqué globalement
   à la TVA déductible brute (biens, services et immobilisations, régime par
   défaut en l'absence de l'option secteurs distincts de l'art. 49, non
   implémentée) pour obtenir la déductible admise. `comptabiliserLiquidation`
   pose l'écriture de liquidation — solde, par compte réellement utilisé (443
   collecte / 445 déductible admise), sur le compte 444100 (crédit = TVA due,
   débit = crédit de TVA à reporter) — via `EcritureService.creer()` normal,
   donc avec les mêmes contrôles que toute saisie (équilibre, exercice
   ouvert, clôtures). Écran `/declaration-tva` enrichi : bloc prorata
   (numérateur/dénominateur/pourcentage), déductible admise, bouton
   "Comptabiliser la liquidation" avec confirmation. Vérifié de bout en bout
   via curl et Playwright : vente taxable 1000 HT (TVA 160) + don non taxable
   500 (classe 7 hors TVA) + achat taxable 500 HT (TVA 80) → prorata exact
   67 % (ceil(1000/1500×100)), déductible admise 53,6, net 106,4 à décaisser
   ; écriture de liquidation équilibrée (débit 443 160 = crédit 445 53,6 +
   crédit 444 106,4) ; rejet sur une période sans mouvement ; la déclaration
   reste une lecture pure, non affectée par une liquidation déjà postée.
   **Hors scope, documenté explicitement** : régularisation pluriannuelle du
   prorata sur les immobilisations (art. 46, variation > 10 % sur 4/19 ans),
   option secteurs distincts (art. 49), verrou anti-double-liquidation d'une
   période déjà comptabilisée.
6. ✅ **Comptes "Total"/regroupement par racine** — livré. `Compte.typeCompte`
   (`DETAIL` par défaut / `TOTAL`), agrégation par préfixe **littéral** de
   chaîne de caractères (pas de troncature des zéros de fin — une racine
   "411" agrège "411001"/"411002", mais "411000" ne les agrège **pas**, piège
   relevé en testant : le numéro complet du Total n'est alors plus un préfixe
   du Détail ; documenté dans le schéma et l'écran). Comptes Total jamais
   mouvementables directement (`EcritureService.creer` les rejette
   explicitement, avec le numéro du compte fautif dans le message) ; bascule
   DETAIL→TOTAL refusée par `CompteService.modifier` si le compte a déjà des
   écritures. `EcritureService.balance` calcule le solde d'un compte Total en
   sommant tous les comptes DÉTAIL (jamais les Total imbriqués eux-mêmes, pour
   ne pas compter deux fois en cas de hiérarchie à plusieurs niveaux) dont le
   numéro commence par le sien ; exclu du total général de la balance pour ne
   pas doubler les montants déjà comptés côté Détail. Bonus au passage :
   `EcritureService.creer` renvoie désormais une 400 propre si un `compteId`
   est introuvable/hors tenant, au lieu d'une erreur Prisma brute.
   **Frontend** : `PlanComptesPage` n'avait jusqu'ici **aucun formulaire de
   création de compte** (bouton "Nouveau" du ruban mort, sans `onClick`) —
   corrigé à cette occasion, condition nécessaire pour que la brique soit
   utilisable dans l'UI. Formulaire (numéro, intitulé, classe, Détail/Total),
   badge de type dans la liste, ligne Total mise en évidence (gras,
   surlignée), bouton "Lettrer" masqué sur les comptes Total (rien à
   lettrer). Les sélecteurs de compte des écrans de saisie (SaisiePage,
   TiersPage, TauxTvaPage, JournauxPage) filtrent désormais `typeCompte=
   DETAIL` pour ne jamais proposer un compte Total dans un contexte où la
   saisie serait de toute façon rejetée par le backend. Vérifié de bout en
   bout via curl (rejet de saisie directe sur un Total, agrégation exacte
   300+150=450 sur deux comptes Détail, totaux généraux non doublés) et
   Playwright (création du Total "411" via le vrai formulaire, badge et mise
   en forme corrects dans la liste).
   **Approfondissement** : un vrai bug trouvé et corrigé — `EtatsFinanciers
   Service.bilan()` lisait `balance().lignes`, qui inclut les comptes Total
   depuis leur ajout (`balance()` ne les exclut que de ses propres totaux
   généraux, pas de la liste des lignes elle-même). Le bilan comptait donc un
   Total ET ses comptes Détail, doublant le montant côté actif/passif
   concerné. Constaté concrètement : un Total "411" agrégeant un Détail
   "411001" à 300 produisait un actif à 600 pour un passif à 300,
   `equilibre: false` — un déséquilibre affiché à l'utilisateur qui n'existe
   pas dans les faits. Corrigé en excluant les comptes Total de la boucle de
   `bilan()`, même principe que `balance()` pour ses totaux. Revérifié après
   correction (actif = passif = 300, équilibré) et sur une hiérarchie Total à
   2 niveaux imbriqués ("411" > "4110" > "411001"/"411002" à 300+150) : les
   deux Total affichent chacun 450 sans se compter l'un l'autre (un Total
   n'agrège jamais un autre Total, seulement les comptes Détail — déjà prévu
   dans `balance()`), bilan toujours équilibré à 450/450. Garde-fou de
   `CompteService.modifier()` (rejet de la bascule DETAIL→TOTAL sur un compte
   déjà mouvementé) également revérifié à cette occasion — fonctionnait déjà.
7. ✅ **Import complet du plan de comptes SYCEBNL** — livré. Le seed automatique à
   l'inscription (`compte-seed.ts`) était volontairement minimal (~15 comptes,
   classes 1/4/5/6/7 seulement) depuis le début du projet ; remplacé par une
   transcription complète des comptes d'imputation de base (4-5 chiffres) du
   texte officiel (Journal officiel OHADA, Partie 2 ch. 2, p. 76-105 — skill
   `sycebnl`), classes 1 à 8 intégralement, plus les comptes 90/91 de la
   classe 9 (contributions volontaires en nature). Les comptes 92 à 99
   (comptabilité analytique de gestion) ne sont volontairement **pas** repris :
   le texte officiel indique explicitement ne pas en détailler la subdivision
   ("libre usage") — les inventer aurait été fabriquer une donnée comptable,
   contraire à la règle du skill. **696 comptes** au total (Classe 1 : 64,
   Classe 2 : 223, Classe 3 : 38, Classe 4 : 158, Classe 5 : 53, Classe 6 : 67,
   Classe 7 : 49, Classe 8 : 37, Classe 9 : 7). Convention de numérotation :
   chaque code officiel est complété à droite par des zéros jusqu'à 6 chiffres
   (`"1011"` → `"101100"`), laissant la place à des sous-comptes analytiques
   créés manuellement (ex. `"411001"`, `"411002"` pour des adhérents
   individuels) via le formulaire de `PlanComptesPage` livré à la brique 6.
   Règle de transcription stricte pour ne rien inventer : quand un compte a des
   sous-comptes explicitement listés, seuls ces sous-comptes sont repris (le
   parent n'est pas dupliqué) ; sinon le compte lui-même est repris tel quel.
   Report à-nouveau attribué par division : `SOLDE` pour les comptes de bilan
   (classes 1/2/3/5, + classe 4 hors tiers) ; `DETAIL` pour les comptes de
   tiers nécessitant un suivi fin par lettrage (classe 4, divisions 40/41/45/
   46/47) ; `AUCUN` pour les comptes de gestion soldés à la clôture (classes
   6/7/8) ; `SOLDE` pour la classe 9 (mémoire hors bilan/résultat). Anomalies
   du texte source repérées et non corrigées silencieusement (flag en
   commentaire dans `compte-seed.ts`, cf. la règle du skill `sycebnl`) : le
   3e code de "452 Fondations et assimilées" ("4555" imprimé, numériquement
   incohérent avec la racine 452 — retenu comme "4525") et l'anomalie déjà
   connue 8311/8315 de la classe 8. **Piège réel trouvé et corrigé en cours de
   route** : les comptes de TVA (443/444/445) et le compte de résultat 130
   sont référencés en dur ailleurs dans le code (`taux-tva-seed.ts`,
   `TauxTvaService.comptabiliserLiquidation`, `ExerciceService.
   assurerCompteResultat`) sous des numéros précis (`443100`/`444100`/
   `445100`) — la première transcription littérale du texte officiel (comptes
   443/444/445 sans subdivision documentée) les avait numérotés `443000`/
   `444000`/`445000`, ce qui aurait cassé silencieusement le rattachement TVA
   à l'inscription (compte introuvable). Corrigé pour préserver la convention
   `...100` déjà utilisée par ces modules, avec commentaire d'avertissement
   dans le seed pour éviter la régression inverse. Vérifié de bout en bout sur
   un tenant réel : inscription (696 comptes créés), rattachement des 4 taux
   de TVA par défaut à leurs comptes 443100/445100 (depuis renumérotés
   44310000/44510000, voir note ci-dessous), écriture réelle (cotisation 500
   en caisse 571000/701000), bilan équilibré, et Playwright (affichage
   complet de la liste par classe, recherche "704" isolant correctement les
   8 sous-comptes de générosité 704100-704800).

   **Suite immédiate, EN COURS (non committée séparément — voir note plus
   bas)** : demande explicite de l'utilisateur de porter la longueur des
   numéros de compte à 8 chiffres au lieu de 6 ("un compte peut avoir
   plusieurs sous-comptes ou même plusieurs catégories qui ont plusieurs
   sous-comptes"), **personnalisable par dossier comme chez Sage** (skill
   `sage-i7` : "longueur de compte paramétrable par dossier, 3 à 13
   caractères"). Fait à ce stade : `Tenant.longueurCompte` (Int, défaut 8,
   migration appliquée), tout le seed SYCEBNL repadé de 6 à 8 chiffres
   (696 comptes, ex. "443100" → "44310000"), tous les numéros codés en dur
   ailleurs dans le code mis à jour en conséquence (TVA, journaux par
   défaut, saisie guidée, compte de résultat de clôture), validation
   dynamique par tenant dans `CompteService.creer()` (rejette un numéro plus
   long que `longueurCompte`, message nommant la limite). **Pas encore
   fait** (volontairement laissé de côté à la demande de l'utilisateur, "on
   en parlera" — repris tel quel, non retouché) : aucun écran ni endpoint
   pour changer `longueurCompte` après l'inscription (donc rien de
   réellement "personnalisable" à ce stade, seule la valeur par défaut a
   changé), `RegisterDto`/`TenantService.creerTenant` ne l'exposent pas à
   l'inscription, `/auth/me` ne le renvoie pas au frontend, et
   `PlanComptesPage` garde un pattern HTML statique `\d{3,8}` au lieu de
   lire la valeur réelle du dossier. À reprendre explicitement avant de
   pouvoir cocher cette brique.
9. ✅ **Rapprochement bancaire** (manuel d'abord) — livré. Distinct du
   lettrage (qui rapproche des écritures entre elles) : ici, pointage
   écriture par écriture d'un compte de trésorerie (classe 5) face à un
   relevé bancaire externe. Modèle `RapprochementBancaire` (compte, date et
   solde du relevé, statut EN_COURS/CLOTURE) + `LigneEcriture.
   rapprochementId` (pointage individuel, un clic par ligne — pas de
   sélection groupée façon lettrage, plus proche du geste réel de pointage
   papier). Un seul rapprochement EN_COURS par compte à la fois (409 sinon,
   avec l'id de celui déjà ouvert) ; le solde de clôture du précédent
   rapprochement sert de solde de départ au suivant (0 pour le tout
   premier) ; écart = solde pointé − solde du relevé, recalculé à chaque
   pointage/dépointage ; clôture bloquée tant que l'écart n'est pas nul
   (même discipline que le lettrage, qui exige un solde de sélection nul).
   Rapprochement EN_COURS annulable (dépointe ses lignes puis se supprime)
   pour corriger une ouverture par erreur. Écran `/rapprochement` (ouverture
   + historique) et `/rapprochement/:id` (pointage), menu Traitement ET
   Trésorerie. Vérifié de bout en bout via curl (450 comptabilisés sur deux
   écritures, écart -300 avant tout pointage, pointage partiel → écart
   -150, clôture refusée en déséquilibre avec message explicite, double
   ouverture refusée en 409, annulation puis réouverture possible) et
   Playwright (écran de pointage réel, clôture par clic).
   **Bug réel trouvé et corrigé en testant à l'écran** (pas en curl) : juste
   après une clôture, l'écran réaffichait un solde de départ et un écart
   faux. Cause : `soldeDepart()` cherchait "le dernier rapprochement
   CLOTURE" trié par date de clôture décroissante — un rapprochement tout
   juste clôturé se retrouvait être son propre "dernier clôturé" (il est
   forcément en tête du tri). Une première correction (exclure son propre
   id) a réintroduit un second bug symétrique, trouvé en revérifiant le
   rapprochement précédent : il se voyait alors attribuer le solde de
   départ du rapprochement suivant (chronologiquement après lui), toujours
   à cause du même tri par date décroissante sans borne. Corrigé
   définitivement en filtrant sur `clotureAt < date de clôture du
   rapprochement affiché` (ou "maintenant" s'il est encore EN_COURS) plutôt
   que sur une simple exclusion d'id — revérifié sur les trois
   rapprochements de la séquence de test (0→300, 300→450, écarts nuls sur
   les deux clôturés).

   **Approfondissement** (relecture du service + tests délibérés de cas
   limites, avant de passer à la brique suivante) : trois trous trouvés et
   corrigés.
   - Un compte Total (regroupement par racine, §3.1) pouvait ouvrir un
     rapprochement sans aucune erreur — alors qu'il ne reçoit jamais de
     mouvement direct (`EcritureService.creer` le lui interdit déjà), donc
     structurellement aucune ligne à jamais pointer, et un tel rapprochement
     se clôture trivialement à 0/0 : un faux "rapproché" silencieux. Vérifié
     concrètement (création d'un compte Total classe 5, ouverture acceptée
     en 201). Corrigé par le même garde-fou que `EcritureService.creer`
     (`RapprochementService.trouverCompteTresorerie` rejette désormais un
     compte Total en 400).
   - Condition de course réelle sur l'ouverture : `ouvrir()` lisait "aucun
     rapprochement EN_COURS sur ce compte" puis créait — sans la protection
     `avecRetrySerialisable` déjà utilisée pour le numéro de pièce des
     journaux et la prochaine lettre de lettrage (même risque exact :
     lecture-puis-écriture non atomique). Vérifié par un test de
     concurrence réel : 12 ouvertures simultanées sur le même compte AVANT
     correctif auraient pu créer plusieurs rapprochements EN_COURS ; APRÈS
     correctif, exactement 1 succès (201) et 11 rejets propres (409), une
     seule ligne EN_COURS confirmée en base.
   - `annuler()` (DELETE) pouvait renvoyer une erreur Prisma brute (500) en
     cas d'annulation concurrente du même rapprochement (la seconde
     suppression tombe sur un enregistrement déjà supprimé) — capturé
     (P2025) pour renvoyer un 404 propre à la place, jamais un 500 nu (même
     discipline que le reste de l'API). Vérifié par 5 annulations
     simultanées du même rapprochement : 1 succès, 4 échecs propres (404),
     aucune erreur brute.
10. ✅ **Immobilisations** — livré. Ancré au skill `sycebnl` (COMPTE 20 à 29,
    Partie 2 ch.3 §2 — mécanique complète d'acquisition/amortissement/
    dépréciation/cession) et au skill `fiscalite-rdc/socle` (arrêté
    ministériel n° 013/CAB/MIN/FINANCES/2025 du 19/02/2025 — taux
    d'amortissement linéaire officiels, corroborés par deux exemplaires
    indépendants ; arrêté n° 014/2025 — seuil de 500 USD pour le petit
    matériel/outillage passé directement en charge).

    Modèle : `FamilleImmobilisation` (gabarit — comptes classe 2/28/68 +
    durée par défaut, 6 familles seedées à l'inscription : Logiciels 5 ans,
    Bâtiments 20 ans, Informatique 5 ans, Mobilier 10 ans, Véhicules 3 ans,
    Agencements 10 ans — durées citées individuellement dans
    `famille-immobilisation-seed.ts`, personnalisable/extensible via
    l'écran) ; `Immobilisation` (instance, dates d'acquisition ET de mise en
    service **distinctes** — l'amortissement démarre à la mise en service,
    pas à l'achat, confirmé par les deux skills indépendamment) ;
    `DotationAmortissement` (une ligne par exercice, `@@unique` empêchant
    toute double dotation).

    Mécanique comptable, chaque étape postée via `EcritureService.creer`
    (jamais de logique de partie double dupliquée) :
    - **Acquisition** : débit compte 2X, crédit du compte de contrepartie
      choisi (trésorerie, fournisseur, dotation/fonds affectés — le texte
      SYCEBNL cite indifféremment 10/16/45/40/48 ou trésorerie).
    - **Dotation** (linéaire uniquement — dégressif hors scope MVP, plus
      pertinent pour SYSCOHADA Phase 3) : prorata temporis dès le premier
      jour du mois de mise en service (arrêté RDC art. 30), annuité pleine
      les exercices suivants, plafonnée au reliquat pour ne jamais dépasser
      la base amortissable (valeur d'origine - valeur résiduelle) — un bien
      totalement amorti reste au bilan sans générer de nouvelle dotation
      (skill sycebnl, COMPTE 20-29).
    - **Sortie** (cession/mise hors service) : dotation complémentaire
      automatique si l'exercice de sortie n'a pas encore été doté, puis
      solde des comptes 2/28 avec la V.N.C. sur le compte 81 ; produit de
      cession comptabilisé dans une écriture **séparée** sur le compte 82
      (le skill sycebnl ne mélange jamais VCN et produit de cession dans la
      même ligne).

    Hors scope MVP, explicitement documenté dans le schéma et non caché
    (règle §2.6) : gestion des composants (le texte SYCEBNL ne l'autorise
    de toute façon que pour des catégories limitées de biens), amortissement
    dégressif/dérogatoire, dépréciation (compte 29, distincte de
    l'amortissement), plans multiples National/IFRS. Limite assumée sur le
    calcul du prorata : si la première dotation d'un bien est passée pour un
    exercice postérieur à celui de sa mise en service (dotation en retard,
    jamais rattrapée), le calcul ne recompte pas les mois de l'exercice
    manqué — signalé en commentaire dans le service, pas caché.

    Vérifié de bout en bout sur un tenant réel : les 6 familles seedées avec
    leurs bons comptes/durées ; acquisition (ordinateur 1200, mise en
    service 15/07/2026) ; dotation exercice 1 = 120 (prorata 6/12 exact) ;
    dotation exercice 2 = 240 (annuité pleine exacte) ; double dotation
    refusée (409) ; mise hors service avec cumul 360 → VCN 840 comptabilisée
    correctement ; cession d'un véhicule (9000, durée 3 ans) sans dotation
    préalable → dotation complémentaire automatique de 1500 (prorata 6/12)
    puis écriture de sortie (crédit 9000, débit amort. 1500, débit VCN 7500)
    et écriture de produit de cession séparée (6000) ; cession sans prix
    refusée (400). **Bug réel trouvé et corrigé en testant à l'écran** (pas
    en curl, où tout s'affiche comme du texte de toute façon) : les champs
    Decimal de Prisma sérialisent en chaînes sur le JSON — le cumul amorti
    s'affichait "0120240" (concaténation `"120"+"240"` au lieu d'une
    addition) et la V.N.C. "-119 040" au lieu de 840. Corrigé en convertissant
    explicitement ces champs en `Number` côté service avant de répondre
    (même discipline déjà appliquée par `LettrageService.lister()`),
    revérifié après correctif (360/840 corrects, séparateurs de milliers
    corrects). Écran `/immobilisations` (création famille/immobilisation,
    liste avec cumul amorti/V.N.C. calculés, actions Doter/Sortir en ligne),
    menu Structure > Immobilisations.

    **Approfondissement** (règle §2.6, avant de passer à la brique
    suivante) : un vrai défaut **grave** trouvé et corrigé — la même
    condition de course déjà rencontrée deux fois dans ce projet (numéro de
    pièce des journaux, ouverture de rapprochement bancaire), mais avec des
    conséquences bien plus sérieuses ici. `passerDotation()` lisait "aucune
    dotation existante" puis postait l'écriture PUIS créait la ligne
    `DotationAmortissement` : deux requêtes simultanées passaient toutes
    deux le contrôle, postaient chacune leur écriture réelle au grand livre
    (équilibrée, donc invisible à un contrôle de balance), et seule la
    première `DotationAmortissement.create()` réussissait — la seconde
    échouait sur la contrainte d'unicité avec une **500 brute**, écriture
    déjà postée comprise. Vérifié concrètement : 12 requêtes de dotation
    simultanées → **12 écritures réelles postées, une seule trackée**, 11
    écritures fantômes gonflant silencieusement le compte d'amortissement
    cumulé. `EcritureService.creer` gère sa propre transaction et commet
    réellement l'écriture indépendamment de l'appelant — l'envelopper dans
    une transaction sérialisable externe n'aurait rien changé (le retry ne
    rejoue pas un effet de bord déjà commis ailleurs). Corrigé par
    compensation : poster, puis en cas de conflit avéré sur
    `DotationAmortissement`, supprimer l'écriture que CETTE requête vient de
    créer et renvoyer un 409 propre. Revérifié : 12 requêtes simultanées →
    exactement 1 succès, 11 rejets 409 propres, 0 écriture orpheline (grand
    livre contrôlé directement). Même risque identifié et corrigé par
    prévention plutôt que compensation dans `sortir()` (verrou par
    UPDATE conditionnel sur le statut AVANT toute écriture — la perdante
    d'une double-sortie n'a rien posté du tout) : revérifié avec 8 sorties
    simultanées sur le même bien → 1 succès, 7 rejets 409, exactement 3
    écritures au total (acquisition + dotation + sortie, aucune dupliquée).
    Deux garde-fous de validation ajoutés au passage (trouvés en relisant,
    pas testés spontanément) : date de sortie bornée à
    `[dateMiseEnService, dateFin de l'exercice choisi]` ; comptes d'une
    famille vérifiés par classe ET préfixe numérique (`ClasseCompte.
    CLASSE_2` seul ne distingue pas un compte d'immobilisation 20-27 d'un
    compte d'amortissement 28-29, qui partagent la même classe).
11. ✅ **Export Excel — Journal, Grand livre, Balance, Bilan** — livré. Demande
    explicite (séance du 2026-08-28) : produire des documents comptables
    exploitables pour l'audit, un PDF étant difficile à recouper ligne à
    ligne — inspirée d'un dossier d'audit réel (CARRIGRES, SYSCOHADA)
    analysé en profondeur sur demande de l'utilisateur, mais **sans copier
    ni ses données ni son plan de comptes** : seul le principe « produire du
    Excel auditable plutôt que du PDF » a été retenu, tout le reste reste
    strictement SYCEBNL/OHADA.

    Module `exports` (`ExportService` + `ExportController`, `exceljs`),
    4 endpoints (`GET /exports/journal`, `/exports/grand-livre/:compteId`,
    `/exports/balance`, `/exports/etats-financiers/bilan`), chacun réutilise
    le service métier existant (`EcritureService`, `EtatsFinanciersService`)
    plutôt que de dupliquer une requête — pas de logique comptable propre à
    l'export.

    **Colonne « compte contrepartie » du Grand livre** (demande explicite,
    pour retracer une écriture sans connaître son journal) : discussion
    approfondie avec l'utilisateur avant implémentation, plusieurs
    itérations rejetées à raison (liste brute de tous les autres comptes →
    doublon possible si le même compte apparaît sur 2 lignes ; correction
    « moins soi-même » → toujours faux dans le cas réel N débits/M crédits
    simultanés). Règle finalement retenue : **comptes DISTINCTS de sens
    opposé (débit/crédit) dans la même écriture** — exacte et non ambiguë
    dans l'écrasante majorité des cas réels (2 lignes, N débits/1 crédit, 1
    débit/M crédits), la même règle qui exclut par construction le doublon
    de soi-même (une ligne au débit ne peut jamais apparaître parmi les
    comptes crédités). Dans le cas rare d'une écriture à débits ET crédits
    multiples simultanés (N×M pur), la cellule affiche la liste des comptes
    candidats séparés par « + » plutôt qu'un choix arbitraire faussement
    précis — signalé en commentaire de cellule Excel et en `title` HTML côté
    écran. Calculée dans `EcritureService.grandLivre()` (partagée par
    l'écran et l'export, pas de logique dupliquée) et exposée dans l'onglet
    GRAND LIVRE de l'écran « Journal & grand livre » (jusque-là annoncé dans
    le titre de la page mais jamais construit — écart comblé au passage).

    Alternative envisagée et explicitement écartée pour l'instant : un
    modèle à la Banana Accounting, où chaque écriture est décomposée en
    mouvements élémentaires 1-pour-1 (chaque compte a une seule contrepartie
    déclarée à la saisie, jamais reconstruite après coup). Rejetée pour
    cette brique parce qu'elle exigerait un nouveau niveau de modèle
    (`Mouvement`, entre `Ecriture` et `LigneEcriture`), une refonte de la
    saisie dans tous les modules qui postent des écritures, et serait
    impossible à appliquer rétroactivement aux écritures déjà en base (leur
    répartition N×M n'a jamais été déclarée). Notée comme piste d'évolution
    future si le besoin de précision N×M devient réellement gênant en
    pratique — pas construite maintenant.

    Bilan Excel : reprend explicitement le regroupement SIMPLIFIÉ
    classe→poste du module `etats-financiers` (MVP, voir son propre
    avertissement) — PAS le tableau de correspondance officiel SYCEBNL
    (Partie 4, ch. 2). L'avertissement est écrit en toutes lettres dans une
    cellule du classeur (règle §2.6 : jamais caché). Le remplacement par le
    vrai moteur `liasse/` du skill `sycebnl` (gabarit + tableau de
    correspondance vérifié contre le Journal officiel) est le sujet de
    l'item suivant, pas de celui-ci — cet export Bilan n'est qu'un
    conteneur Excel autour du calcul MVP existant, pas un nouveau moteur de
    montage.

    Vérifié de bout en bout sur un tenant réel : 4 endpoints testés en curl
    (200, fichiers `.xlsx` valides, contenu relu et vérifié colonne par
    colonne) puis en Playwright (connexion, téléchargement réel déclenché
    depuis chaque bouton « Exporter Excel » des 4 écrans, fichier
    téléchargé recontrôlé et identique à l'aperçu affiché à l'écran) — cas
    2 lignes (contrepartie unique), N débits/1 crédit (contrepartie unique
    par ligne du côté multiple), et N débits/M crédits simultanés
    (liste `47110000 + 47120000`, pas de faux choix) tous les trois
    couverts par des écritures de test réelles.

    **Approfondissement** (règle §2.6). Sept manques relevés en relisant la
    brique livrée, tous traités — et deux bugs réels découverts en chemin.

    *Bug grave n° 1 — le bilan ignorait la classe 8.* `bilan()` ne faisait
    entrer dans le résultat que les classes 6 et 7 ; la classe 8 (H.A.O.)
    tombait dans un `default: break` muet. Or le module Immobilisations
    poste en 81 (V.C.N.) et 82 (produit de cession) à **chaque cession** :
    une seule écriture H.A.O. déséquilibrait donc le bilan de son montant
    exact. Constaté sur un tenant réel (écriture H.A.O. de 40 → actif 250 /
    passif 210). Corrigé, revérifié (250/250), et le `default` muet a été
    remplacé par un `case CLASSE_9` explicite — c'est précisément le
    fourre-tout qui avait masqué le cas.

    *Bug n° 2 — le plan de comptes seedé ne permettait pas un compte de
    résultat conforme.* Le seed a sa propre règle écrite (« quand un compte a
    des sous-comptes explicitement listés au texte officiel, seuls ces
    sous-comptes sont repris ») ; elle avait été appliquée à 704 et 708 mais
    **pas** à 603 ni 705, laissés comme comptes génériques mouvementables.
    Conséquence concrète : l'état officiel sépare 7051 (poste RD, ventes de
    marchandises) de 7052/7053 (poste RE, services et produits finis), et
    6031 (TB) de 6032-6035 (TE) — une vente passée sur un compte 705 unique
    n'entrait alors dans aucun total (écart de 500 mesuré entre le résultat
    du bilan et le XE du compte de résultat). Seed corrigé (7051-7055,
    6031-6035), revérifié sur un tenant neuf : plus aucun écart.

    Les sept points traités :
    1. **Grand livre complet** (`GET /exports/grand-livre`) — tous les
       comptes mouvementés dans un seul classeur, au lieu d'un
       téléchargement par compte. Une seule requête puis regroupement en
       mémoire (`grandLivreComplet()`), pas de N+1. Deux feuilles : tableau
       **plat** (numéro et intitulé du compte répétés sur chaque ligne, donc
       filtrable et pivotable, solde progressif réinitialisé par compte) et
       feuille « Sommaire » portant les sous-totaux — plutôt que des lignes
       de rupture au milieu des données, qui fausseraient tout filtre.
    2. **Filtres du journal exposés à l'écran** : journal, période, libellé.
       L'API les acceptait déjà mais aucun écran ne les offrait, et le bouton
       « Filtrer » du ruban était décoratif. L'export reprend exactement les
       filtres affichés. État des champs et filtres appliqués séparés, pour
       ne pas requêter à chaque frappe.
    3. **Compte de résultat** — le module n'avait que le bilan. Contrairement
       à celui-ci, il est **réellement adossé au tableau de correspondance
       officiel** (Journal officiel OHADA, Partie 4 ch. 2 section 6),
       transcrit dans `correspondance-compte-resultat.ts` : codes REF, postes
       RA-RH / TA-TL / TM-TN et formules XA à XE. Rattachement par préfixe,
       le plus long l'emportant. Charges présentées en positif, de sorte que
       les formules officielles s'appliquent littéralement. Anomalies du
       texte officiel signalées et **non comblées** : XA inclut RH (le
       libellé dit « Somme RA à RG », ce qui romprait l'égalité
       résultat/bilan dès qu'il y a des reprises — même correction que le
       moteur `liasse/` du skill, anomalie n° 4) ; 7054/7055 ne figurent dans
       aucun poste et ressortent donc en « non rattachés » plutôt que d'être
       rangés d'office dans RE, ce qui serait une interprétation.
       Un **contrôle croisé** compare XE au solde de tous les comptes de
       gestion (la base du bilan) : tout écart vaut exactement la somme des
       comptes non rattachés, et s'affiche en rouge à l'écran comme en
       feuille « Contrôles et anomalies » de l'export. Un état qui ne boucle
       pas doit se voir.
    4. **Vraies dates Excel** au lieu de texte « 01/02/2026 » : sans ça, ni
       tri chronologique ni filtre par période ne fonctionnent dans le
       tableur — l'inverse du but recherché.
    5. **En-tête figée et auto-filtre** sur chaque tableau. La plage du
       filtre s'arrête à la dernière ligne de données : y inclure la ligne de
       totaux la ferait remonter dans n'importe quel filtre.
    6. **Noms de fichiers datés**, décidés côté serveur (seul à connaître
       l'exercice et le compte) et transmis via `Content-Disposition` —
       `journal-2026.xlsx`, `grand-livre-52110000-2026.xlsx`,
       `compte-de-resultat-2026.xlsx`… Deux exercices exportés d'affilée ne
       s'écrasent plus.
    7. **Premiers tests automatisés du projet** (49, Jest — il n'en existait
       aucun jusqu'ici) : rattachement compte→poste et lacunes assumées du
       texte officiel ; bilan, compte de résultat et leur contrôle croisé,
       dont une **régression explicite sur le bug classe 8** ; règle de
       contrepartie sur ses quatre cas (2 lignes, N/1, 1/M, N×M) plus le
       piège des `Decimal` Prisma sérialisés en chaînes. Vérifiés par
       mutation : réintroduire le bug classe 8 fait échouer exactement 2
       tests, retirer le filtre de sens exactement 3 — aucun faux positif.

    Revérifié de bout en bout après coup : scénario complet sur un tenant
    neuf (cotisations, ventes de marchandises et de services, achats,
    salaires, loyer, cession H.A.O.) → chaque compte au bon poste officiel,
    XA 5 000 / XB 2 800 / XC 2 200 / XD 150 / XE 2 350, XE identique au
    résultat logé au bilan, bilan équilibré, contrôle à zéro ; 6 exports
    téléchargés depuis l'interface avec leurs noms datés ; filtres du journal
    (période, libellé, réinitialisation) vérifiés à l'écran.

    **Audit intégral de la brique** (demandé après livraison ; deux revues
    adversariales en parallèle — sécurité multi-tenant d'une part,
    correction/cas limites de l'autre — plus des mesures sur 50 000 lignes
    réelles). Ce qui a été confirmé SÛR : aucune fuite inter-tenant sur les
    six requêtes du périmètre (chacune filtre par `tenantId`, y compris via
    les relations imbriquées, et un `compteId` étranger est rejeté) ; pas
    d'injection d'en-tête `Content-Disposition` (le numéro de compte est
    contraint par `/^\d{3,13}$/` et n'a qu'une seule voie d'écriture) ; pas
    d'injection de formule Excel (ExcelJS type les chaînes en texte, le
    risque classique du CSV ne s'applique pas) ; le regroupement du grand
    livre complet ne dépend pas de la contiguïté des lignes (Map par
    `compteId`) ; le cas « exercice sans écriture » est correctement traité
    sur les cinq feuilles. **Onze défauts réels ont en revanche été trouvés
    et corrigés**, dont trois graves :

    - **Amplification quadratique en mémoire (grave).** Charger les
      contreparties via `ecriture: { lignes: … }` imbriqué dupliquait
      l'écriture entière autant de fois qu'elle a de lignes : pour une
      écriture de ventilation de paie à 100 lignes, l'audit mesurait ~1,8 Go
      de tas pour la seule requête. Mesuré ici : 2,4 Go de RSS sur 50 000
      lignes. Or la contrepartie ne dépend que du SENS de la ligne et de son
      écriture — il n'y a donc que deux réponses possibles par écriture, pas
      une par ligne. Remplacé par deux requêtes plates
      (`chargerContreparties`), profil mémoire linéaire.
    - **Aucune borne de volume (grave).** Le classeur est intégralement
      construit en mémoire puis sérialisé d'un bloc : un utilisateur, même
      LECTURE_SEULE, pouvait enchaîner les exports d'un gros dossier et faire
      tomber le processus pour TOUS les tenants (application mono-processus).
      Ajout d'un plafond (`EXPORT_MAX_LIGNES`, 50 000 par défaut) refusant en
      413 avec un message actionnable. Vérifié : 50 002 lignes refusées,
      export filtré sur janvier accepté en 0,9 s.
    - **`exerciceId` jamais validé (grave, car silencieux).** Un `@Query`
      scalaire échappe au `ValidationPipe` global ; absent, il devenait
      `undefined`, que Prisma IGNORE — le filtre d'exercice disparaissait et
      l'état agrégeait TOUS les exercices du dossier en se présentant comme
      celui d'un seul. Pour un module destiné à produire des pièces d'audit,
      un état faux non signalé est pire qu'une erreur. `ParseUUIDPipe` posé
      sur les routes concernées (exports ET états financiers).
    - **Index manquants** sur `lignes_ecriture.ecritureId` et
      `ecritures(tenantId, exerciceId, date)` : PostgreSQL n'indexe pas les
      clés étrangères et Prisma n'en générait pas — chaque export balayait
      les tables en séquentiel. Migration `20260828124454`.
    - **Course d'affichage (frontend).** Aucun effet n'invalidait sa requête
      précédente : sélectionner un compte lourd puis un compte léger
      affichait les lignes ET LE SOLDE du premier sous le nom du second.
      Faute lourde sur un logiciel comptable, et rien ne la signalait.
      Drapeau `annule` sur les six effets des deux pages ; vérifié en
      Playwright par un double changement de compte immédiat.
    - **Échecs muets.** `api.telecharger` rejette (licence expirée, 413,
      500) mais aucun appelant ne le gérait : aucun fichier, aucun message.
      Ajout d'un bandeau d'erreur et d'un état « export en cours ».
    - **Auto-filtre sur le bilan.** Le bilan n'est pas un tableau plat mais
      deux listes juxtaposées : filtrer sur un montant d'actif y masquait des
      postes de passif sans rapport, totaux inchangés — un bilan faussé en un
      clic. Auto-filtre retiré (en-tête figée conservée), et les deux
      en-têtes « N° compte » homonymes différenciés.
    - **Tri non déterministe.** `orderBy` sur la seule date laissait l'ordre
      des lignes de même date au plan d'exécution PostgreSQL : deux exports
      du même exercice pouvaient différer sur la colonne « solde
      progressif ». Départage explicite par `numeroPiece` puis `id`.
    - **Ligne 0/0 fantôme.** À la clôture, un résultat exactement nul
      poussait une ligne `debit: 0, credit: 0` sur le compte de résultat :
      elle apparaissait au grand livre mais pas à la balance (qui filtre les
      comptes sans mouvement), et sa contrepartie était calculée comme si
      elle était au crédit. Corrigé à la source, et le grand livre complet
      aligné sur le filtre de la balance.
    - **Comparaison flottante exacte** (`resultatNet !== 0`) alors que le
      reste du fichier utilise une tolérance : sur un exercice clôturé, un
      résidu de 1e-13 ajoutait une ligne parasite « Excédent (déficit) —
      0,00 » en doublon du compte 131 réel, donc une clé React dupliquée.
      Seuil à 0,005.
    - **Détails corrigés au passage** : ligne de totaux absente de l'export
      d'un compte alors que l'écran affiche « SOLDE FINAL » ; `&` non
      échappé dans l'en-tête d'impression Excel (un intitulé « Achats &
      fournitures » y injectait le nom du fichier) ; colonne « PIÈCE » de
      l'écran affichant la référence externe quand l'export a deux colonnes
      distinctes ; boutons du ruban cliquables mais sans effet, désormais
      `disabled` ; `RolesGuard` absent des deux contrôleurs — sans escalade
      réelle aujourd'hui (aucune route ne porte `@Roles`), mais tout `@Roles`
      ajouté plus tard y aurait été silencieusement ignoré.

    Tests portés de 49 à 56 (couverture ajoutée sur `grandLivreComplet`, qui
    n'en avait aucune). Revérifié après corrections : états inchangés et
    toujours cohérents (XE = résultat du bilan), 50 002 lignes refusées en
    413, export filtré accepté, course d'affichage éteinte à l'écran.

    **Corrigé séparément (2026-08-28, même séance)** : `jwt.strategy.ts`
    repliait `JWT_SECRET` sur la valeur littérale `'change-me'` si la variable
    d'environnement était absente — signalé lors de l'audit ci-dessus, hors de
    son périmètre initial, puis traité dans la foulée. Le côté signature
    (`auth.module.ts`) ne repliait déjà pas ; seule la vérification le
    faisait, ce qui aurait permis à quiconque connaissant cette chaîne
    publique (`.env.example`) de forger un jeton valide pour N'IMPORTE QUEL
    tenant si `JWT_SECRET` restait non défini en production — annulant toutes
    les garanties d'étanchéité multi-tenant vérifiées plus haut.

    Corrigé par une validation au DÉMARRAGE (`ConfigModule.forRoot({ validate:
    validateEnv })`, `src/config/validate-env.ts`) plutôt qu'un repli : `JWT_SECRET`
    absent ou vide fait échouer le démarrage avant même que la première route
    soit montée (aucune tentative de connexion à Postgres) ; une valeur de
    développement connue ou trop courte (< 32 caractères) émet un avertissement
    sans bloquer, pour ne pas casser le développement local. Le repli
    `?? 'change-me'` de `jwt.strategy.ts` a été retiré (`config.getOrThrow`) —
    défense en profondeur : la garantie tient même si la validation de
    démarrage était un jour retirée par erreur.

    Vérifié : démarrage sans `.env` → échec immédiat, message explicite, zéro
    route montée ; démarrage avec le `.env` de développement → démarre avec
    l'avertissement affiché ; connexion et route protégée fonctionnelles avec un
    jeton légitime ; **jeton forgé avec l'ancienne valeur de repli `'change-me'`
    → rejeté (401)**, alors qu'il aurait été accepté avant ce correctif si
    `JWT_SECRET` avait été absent en production.
12. ✅ **Moteur de mapping bilan** — livré. Remplace le regroupement simplifié
    classe→poste qui servait de bilan MVP par le vrai tableau de correspondance
    officiel SYCEBNL (`correspondance-bilan.ts`, transcrit du Journal officiel
    OHADA, Partie 4 ch. 2 section 6) — sur le même principe que le compte de
    résultat livré dans la brique précédente.

    Plus complexe que le compte de résultat : bilan hiérarchique (des postes de
    détail comme AB/CA se somment en sous-totaux comme AD/CK, eux-mêmes sommés
    en totaux comme AZ/CZ, jusqu'au TOTAL GÉNÉRAL BZ/DZ — 4 niveaux imbriqués côté
    passif), comptes d'amortissement soustractifs (28x/29x), et des comptes de
    tiers polyvalents (42-47, 52-53) qui changent de poste selon le SENS de leur
    solde, pas leur seul numéro.

    Anomalies du texte officiel reprises (mêmes corrections, mêmes justifications
    que le moteur `liasse/` du skill `sycebnl`, dupliquées dans le code de
    l'application pour ne pas dépendre d'un fichier hors dépôt) : compte 41
    retiré de BE (déjà capté par BD) ; qualificatif « solde débiteurs »/« solde
    créditeurs » sur BE/DI pour les tiers polyvalents 42-47 (sinon double
    compte) ; CJ numéroté 15 et non 16 (fiche détaillée vs fiche sommaire de la
    classe 1, le tableau de correspondance fait foi) ; DW précisé en 564/565
    (561, opérations avec le siège, exclu d'un poste de trésorerie) + comptes
    52/53 mais seulement pour ceux dont le solde est créditeur (une banque à
    découvert). **Une sixième ambiguïté, propre à cette transcription et non
    résolue par le moteur `liasse/` non plus** : les comptes 2919 et 2939
    apparaissent chacun sous DEUX postes différents dans le texte officiel (AE
    et AF pour 2919 ; AJ et AK pour 2939), sans clé de répartition donnée —
    pris en entier sous un seul poste (celui dont l'intitulé colle le mieux),
    signalé en commentaire plutôt que dupliqué (ce qui aurait gonflé l'actif) ou
    coupé en deux (ce qui aurait inventé une clé que le texte ne donne pas).

    Résultat net (poste CH) : n'est PAS un poste de détail comme les autres — le
    compte 13 officiel (COMPTE 13, skill sycebnl) ne se mouvemente qu'À LA
    CLÔTURE, en soldant les classes 6/7/8. Avant clôture le résultat vit dans
    ces classes, après il vit dans le compte 13. Les deux sources sont donc
    utilisées en OU exclusif (classes 6/7/8 si mouvementées, sinon compte 13),
    jamais additionnées — et un `controle.doubleComptageProbable` signale le cas
    où les deux le sont à la fois (balance transmise à un moment ambigu de la
    clôture) sans trancher à la place de l'utilisateur.

    Comme au compte de résultat : `comptesNonRattaches` (comptes de bilan
    classes 1-5 qu'aucun poste officiel ne capte, jamais absorbés en silence) et
    un contrôle d'équilibre BZ=DZ affiché en rouge en cas d'écart, à l'écran
    comme dans la feuille « Contrôles et anomalies » de l'export Excel (qui
    gagne aussi une feuille « Détail par poste » pour le drill-down).

    **Bug de signe réel trouvé et corrigé avant la première exécution d'un
    test** (pas en production) : le calcul du montant net d'un poste actif
    faisait `-l.solde` sur les lignes d'amortissement au lieu de `l.solde` —
    un compte d'amortissement bien formé porte déjà un solde négatif
    (débit−crédit, créditeur), qui soustrait naturellement du brut par simple
    addition ; le signer en positif l'ADDITIONNAIT au lieu de l'en déduire
    (5000 brut + 1500 amortissement serait ressorti à 6500 au lieu de 3500).
    Repéré en dérivant à la main le premier cas de test avant de l'exécuter,
    corrigé, verrouillé par un test de régression dédié.

    17 tests dédiés (9 comportementaux dans `etats-financiers.service.spec.ts`
    — équilibre simple, régression classe 8, régression signe amortissement,
    séparation BE/DI par le sens, retrait du compte 41 de BE, CH avant/après
    clôture, double comptage signalé, compte non rattaché qui fait fuir
    l'équilibre — et 8 structurels dans `correspondance-bilan.spec.ts` — aucune
    ref en double, ordre d'affichage complet, totaux résolubles en une passe,
    qualificatifs BE/DI opposés, CJ=15, DW=564/565, ambiguïté 2919/2939
    résolue à un seul poste). 71 tests au total sur le projet (56 → 71).

    Revérifié de bout en bout sur les tenants réels de la brique précédente :
    bilan du "Tenant Cascade" (2 350/2 350, équilibré, résultat net CH=2 350
    identique au XE du compte de résultat déjà vérifié) affiché à l'écran
    (capture Playwright) et exporté en Excel (3 feuilles, totaux en gras,
    contrôles corrects) ; comptes de tiers 47110000/47120000 du "Tenant Export"
    correctement classés dans DI (tous deux réellement créditeurs sur ce
    tenant, 0 dans BE) — comportement vérifié sur des données réelles, pas
    seulement en test unitaire.

    **Correctif de fidélité à la maquette** (même jour, question directe de
    l'utilisateur sur une capture d'écran) : deux écarts réels par rapport au
    texte officiel, non comblés lors de la livraison initiale.

    1. **Colonnes Brut / Amortissements et dépréciations / Net manquantes côté
       actif.** Le texte officiel est explicite : « Colonnes : REF | ACTIF |
       Note | Brut (N) | Amort. et déprec. (N) | Net (N) | Net (N-1) ». Le
       moteur calculait déjà brut et amortissement séparément en interne mais
       les fusionnait avant de les exposer — un seul montant net par poste, à
       l'écran comme en Excel. Corrigé : `PosteCalcule` porte désormais `brut`
       et `amortissement` (magnitude positive) en plus de `montant` (net),
       affichés en 3 colonnes côté actif (le passif reste à une seule colonne
       Net, conforme au texte — il n'a pas de notion d'amortissement).
    2. **Comparatif N-1 absent — sur le bilan ET le compte de résultat.** Les
       deux maquettes officielles portent une colonne N-1 (« Net (N-1) » côté
       bilan, « Net exercice au 31/12/N-1 » côté compte de résultat), jamais
       implémentée. Corrigé par `trouverExerciceN1()` : l'exercice du même
       tenant dont la date de début est la plus récente parmi celles
       antérieures à l'exercice demandé — `undefined` (jamais un faux 0)
       quand il n'y en a aucun (premier exercice du dossier), signalé à
       l'écran (« Aucun exercice antérieur… ») plutôt que silencieux. Chaque
       poste des deux états porte désormais `montantN1` (et `brutN1`/
       `amortissementN1` côté actif), résolu en rejouant exactement le même
       moteur de correspondance sur la balance N-1 — aucune logique dupliquée
       (`resoudreTousLesPostesBilan`/`resoudreTousLesPostesCR`, factorisées et
       appelées deux fois, une par exercice).

    9 nouveaux tests (16 → 25 dans ce fichier ; 71 → 80 sur le projet) : brut/amort
    exposés séparément, remontée dans les totaux hiérarchiques (AH, AZ), poste
    sans compte d'amortissement à 0 et non `undefined`, poste passif sans
    brut/amort, comparatif N-1 peuplé, absent sans exercice antérieur, le PLUS
    RÉCENT exercice antérieur choisi quand il y en a plusieurs, et le
    comparatif N-1 du compte de résultat. Un bug de propreté mineur repéré par
    un test (`-0` au lieu de `0` sur un poste sans amortissement, `Object.is`
    les distingue) corrigé avant livraison.

    Revérifié de bout en bout avec un vrai exercice antérieur créé sur le
    "Tenant Cascade" (2025, deux écritures : cotisations 600, achat 250 →
    résultat N-1 net 350) : bilan N-1 exact (BW=350, BZ=DZ=350, CH=350),
    compte de résultat N-1 exact (RA=600, totalProduitsN1=600,
    totalChargesN1=250, resultatNetN1=350) — les 4 colonnes officielles
    affichées à l'écran (capture Playwright) et dans le classeur Excel
    (10 colonnes bilan, 4 colonnes compte de résultat).
13. ✅ **Jeu d'états financiers "Projets de développement et assimilés"** —
    engagé et livré le 2026-08-28 (voir la précision de scope au §1, point 3).

    Adossé au texte officiel (skill `sycebnl`,
    `references/partie4-ch3-etats-projets-developpement.md`, Partie 4 ch. 3),
    en miroir du jeu associations (item 12) mais séparé de bout en bout :
    `correspondance-projet-bilan.ts`, `correspondance-projet-compte-exploitation.ts`,
    `EtatsFinanciersProjetService`, routes `GET /etats-financiers/projet/bilan`
    et `GET /etats-financiers/projet/compte-exploitation`, exports Excel
    (`bilanProjetExcel`/`compteExploitationProjetExcel`), et un onglet dédié
    dans `EtatsFinanciersPage.tsx` — jamais un mélange des deux jeux dans un
    même fichier ou un même écran.

    **Nouveau champ `Tenant.jeuEtatsFinanciersSycebnl`** (migration
    `20260828143944_jeu_etats_financiers_sycebnl`) : un même
    `Referentiel = SYCEBNL` peut relever du jeu associations OU du jeu
    projets de développement — le front lit ce champ (exposé par
    `/auth/me`) pour savoir quels onglets et quelles routes afficher.
    Défaut : `ASSOCIATIONS_ORDRES_PROFESSIONNELS` (aucun dossier existant
    n'est basculé par la migration).

    **Construit** : Bilan (REF AA-DZ) et Compte d'exploitation (REF RA-RE,
    TA-TL), tous deux avec le détail Brut/Amortissement/Net côté actif et le
    comparatif N-1, sur le même modèle que le jeu associations
    (`etats-financiers.communs.ts` factorise `correspond`/`chargerLignes`/
    `trouverExerciceN1`, partagés par les deux services).

    **Hors périmètre, documenté et non simulé** (`EtatsFinanciersProjetService`,
    en-tête de fichier) : Tableau d'exécution budgétaire (aucun modèle de
    données "ligne budgétaire"/"engagement" dans Compta Flow — inventer des
    montants Budget/Réalisation romprait la règle §2.6), Tableau
    emplois-ressources et Tableau de réconciliation de trésorerie (le texte
    officiel ne fournit AUCUN tableau de correspondance poste→comptes pour
    ces deux-là, contrairement au Bilan et au Compte d'exploitation — les
    construire quand même inventerait un rattachement que le texte ne donne
    pas).

    **4 anomalies du texte officiel signalées et corrigées/documentées,
    jamais en silence** (voir les fichiers `correspondance-projet-*.ts`) :
    1. RC (Subventions d'exploitation, compte 71) absente du modèle vierge
       (Section 5) mais présente dans le tableau de correspondance —
       retenue, le tableau de correspondance fait autorité.
    2. XA : le modèle vierge dit "Somme RA à RE", le tableau de
       correspondance dit "Somme RA à RD" (excluant RE, Reprises de
       provisions) — RE inclus, même raisonnement que RH côté associations
       (item 12) : l'exclure romprait le bouclage attendu avec le bilan.
    3. Codes REF **"TJ" et "TK" dupliqués** dans le compte d'exploitation
       (déjà repéré par le skill `sycebnl` lui-même) : "TJ" sert à la fois à
       Charges de personnel (compte 66) et Dotations aux provisions (compte
       69) ; "TK" à Frais financiers (compte 67) et Produits H.A.O. (comptes
       82/84/86/88, signe +). Reproduit tel quel — deux postes distincts par
       clé interne unique (`cle`), même `ref` affiché sur les deux lignes,
       exactement comme le texte officiel et comme rendu à l'écran/à l'export.
    4. Compte 68 (Dotations aux amortissements) absent de tout poste du
       tableau officiel (contrairement au jeu associations, où TL regroupe
       68 ET 69) — non comblé, un solde sur 68 ressort en "comptes non
       rattachés", visible plutôt que silencieusement absorbé.

    CC (Solde des opérations de l'exercice, bilan) vient UNIQUEMENT du
    compte 13 — contrairement à CH côté associations, pas d'arbitrage entre
    classes 6/7/8 et compte 13 : ce jeu ne loge pas un résultat net
    associatif, XC (compte d'exploitation) est attendu à zéro en régime de
    croisière et exposé tel quel (jamais forcé à 0) quand il ne l'est pas.

    25 nouveaux tests (`correspondance-projet-bilan.spec.ts`,
    `correspondance-projet-compte-exploitation.spec.ts`,
    `etats-financiers-projet.service.spec.ts` — intégrité du référentiel,
    Brut/Amort/Net, DW/découverts bancaires, CC via le seul compte 13,
    doublon TJ/TK réparti sans confusion, XA/XB/XC, comparatif N-1) ; 80 →
    104 sur le projet backend, tous passants. Vérifié de bout en bout avec
    curl (routes JSON + export Excel, fichiers `.xlsx` valides) et
    Playwright (bascule du `Tenant Cascade` en `PROJETS_DEVELOPPEMENT` le
    temps du test, capture d'écran des deux onglets, export Excel réussi,
    tenant remis à `ASSOCIATIONS_ORDRES_PROFESSIONNELS` ensuite — pas de
    données de test laissées dans un état différent de celui trouvé) ; le
    jeu associations (item 12) re-vérifié sans régression après coup.
14. **Comptabilité analytique par projet/bailleur** (spécifique SYCEBNL).
15. Puis, au choix selon opportunité business : **Trésorerie avancée** (lots, LCR/
    virements), **Stocks**, **SYSCOHADA (Phase 3)**, **OHADA→IFRS**, **Paie**, RBAC fin.

Cette liste n'engage rien : chaque brique reste soumise à validation explicite avant
d'être attaquée, comme convenu depuis le début. Elle sert à savoir, quand une brique
sera choisie, ce qu'elle implique et dans quel ordre elle doit venir.

---

## 5. Sources

Le détail par document (statut de lecture, citations, notes brutes) est archivé dans
`.claude/skills/sage-i7/references/`. Un document (`342285752-Formation-SAGE-
Comptabilite.pdf`, 62 Mo) n'a pas pu être extrait (limite technique) — son contenu est
très probablement redondant avec les autres sources SAARI/Comptabilité 100 déjà
analysées en intégralité ; à ne redemander que si un doute précis apparaît sur un point
non couvert par ce document.
