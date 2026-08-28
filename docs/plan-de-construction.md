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
3. MVP = référentiel **SYCEBNL** (associations/ONG/projets de développement) d'abord ;
   **SYSCOHADA** (entreprises) en Phase 3.
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
11. **Moteur de mapping / états financiers configurables** (s'appuie sur 6 et 10).
12. **Comptabilité analytique par projet/bailleur** (spécifique SYCEBNL).
13. Puis, au choix selon opportunité business : **Trésorerie avancée** (lots, LCR/
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
