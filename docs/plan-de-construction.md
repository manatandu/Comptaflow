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
- Plan de comptes SYCEBNL (référentiel associations/ONG/projets de développement) seedé
  à la création du dossier.
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
3. MVP = référentiel **SYCEBNL** (associations/ONG/projets de développement) d'abord ;
   **SYSCOHADA** (entreprises) en Phase 3.
4. Vision fonctionnelle long terme, dans cet esprit (non séquencée avant ce document) :
   immobilisations + plan d'amortissement, gestion des stocks, gestion des tiers, moteur
   de mapping pour générer tout état financier depuis une balance, passage OHADA→IFRS.
5. **On construit petit à petit, brique par brique.** Ce document enrichit et ordonne
   cette vision — il ne la remplace pas, et ne dispense pas de valider chaque brique
   avant de l'attaquer.

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
   delà). Le cas encore plus général (N lignes d'un côté pour M combinées de
   l'autre) n'est pas couvert. Réponse de l'API renommée `{ paires }` →
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
   condition d'échéance Net/Fin de mois — modèle mono-échéance pour le MVP, le
   fractionnement en plusieurs échéances est un enrichissement futur). Seuls les
   comptes de classe 4 peuvent être rattachés. Écran `/tiers` (création, filtre
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
   décaisser). **Hors scope** : le régime du prorata de déduction (art. 43-49
   O.-L., significatif pour une association ayant des activités à la fois
   exonérées et taxables) et la comptabilisation automatique de la
   liquidation (écriture sur le compte 444) — restent à construire.
   **Approfondissement** : `TauxTvaPage` elle-même (l'écran `/taux-tva`, pas
   seulement l'API) n'avait jamais été cliquée en Playwright — création d'un
   taux et bascule actif/inactif vérifiées directement dans l'UI. Aucun bug
   trouvé.
6. **Comptes "Total"/regroupement par racine** — brique technique courte, prépare le
   moteur de mapping.
7. **Rapprochement bancaire** (manuel d'abord).
8. **Immobilisations** (Famille → Immobilisation → plan d'amortissement → dotation
   périodique → sortie).
9. **Moteur de mapping / états financiers configurables** (s'appuie sur 6 et 8).
10. **Comptabilité analytique par projet/bailleur** (spécifique SYCEBNL).
11. Puis, au choix selon opportunité business : **Trésorerie avancée** (lots, LCR/
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
