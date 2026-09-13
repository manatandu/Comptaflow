# Plan des confrontations · texte par texte, article par article

**Verrouillé le 2026-09-13.** Ce document est la référence d'avancement de la
parenthèse ouverte par Manasse entre la fin de la gestion commerciale et la
reprise de la Phase I. On avance SUR SA BASE : chaque passe s'y déclare
terminée avant d'ouvrir la suivante, et l'ordre des passes ne se change pas en
cours de route sans le dire ici.

**Ce qui le rend nécessaire, en une phrase.** La question posée par Manasse le
2026-09-12 · « as-tu déjà confronté CHAQUE article des référentiels et des lois
fiscales contre le logiciel ? » · avait pour réponse honnête : les référentiels
comptables oui, la fiscalité jamais.

---

## 1. Ce qui A DÉJÀ été confronté article par article

`docs/releve-de-manques-referentiels.md`, 21 passes, refermé le 2026-09-05.
Méthode annoncée en tête : « relire le texte officiel dans les compétences,
article par article, et confronter chaque obligation au code ».

| Corpus | Couverture | Passes |
|---|---|---|
| Acte uniforme SYCEBNL | art. 1 à 28, les 28 | 1 |
| Cadre conceptuel SYCEBNL | intégral | 2, 3 |
| SYCEBNL, opérations spécifiques (Partie 3) | les 6 chapitres | 4 |
| AUDCIF, art. 1 à 113 | les 113 | 5, 6, 7 |
| AUDCIF, Titre VIII | les 41 chapitres | 8 à 21 |

Ces corpus NE SONT PAS rouverts par ce plan. Ce qui en subsiste est un carnet
de travaux tenu dans les passes elles-mêmes, plus cinq questions d'arbitrage
listées en fin de passes 17 à 21.

## 2. L'autre audit, et pourquoi il ne répond pas à la question

`docs/audit-citations-2026-09-06.md` a vérifié 7 961 lignes de citations, et
son verdict tient : sur les 89 références qui commandent un montant, une
échéance ou un seuil, aucun chiffre n'est faux.

**Mais il va dans le sens inverse.** Il part du CODE et remonte au TEXTE : il
répond à « les références qu'affiche le logiciel sont-elles justes », pas à
« quelles obligations du texte le logiciel ignore ». Un article qu'aucune ligne
de code ne cite lui est invisible par construction. Il déclare d'ailleurs
lui-même quatre corpus non indexés, dont « SYSCOHADA hors AUDCIF ».

Les deux exercices sont complémentaires et aucun ne remplace l'autre.

---

## 3. La preuve que ce plan était dû, trouvée en l'écrivant

**Le décret n° 23/10 du 3 mars 2023.** Il a été trouvé le 2026-09-13, en
inventoriant le corpus fiscal pour établir la liste des passes ci-dessous ·
avant même qu'une seule passe ne commence. Trois constats en sont sortis, tous
corrigés le jour même :

- le module de facturation affichait « aucune source lue ne décrit la procédure
  d'homologation ». **Faux.** L'art. 22 la nomme (attestation de conformité) et
  l'art. 3, 7° qualifie OmegaX de SFE ;
- les mentions obligatoires sont **douze** (art. 26), pas neuf (art. 100 de
  2011), et **dix** sont dues d'un document en tenant lieu. Le module en portait
  neuf, livrées la veille ;
- les art. 20 et 21 posent qu'un SFE doit être homologué pour être **vendu et
  utilisé** en RDC, ce qui dépasse la question de l'émission.

**LEÇON À RETENIR, ET ELLE EST NOUVELLE.** Une lacune DÉCLARÉE À TORT est aussi
fausse qu'une règle inventée. Le § 10 bis de CLAUDE.md visait le signalement qui
fabrique une anomalie ; celui-ci fabriquait une DISPENSE. Dire « aucun texte ne
prévoit » conclut le sujet et fait renoncer à une démarche due. Et rien dans les
tests ne peut l'attraper : une absence de source ne se vérifie que contre le
corpus entier. C'est exactement ce que ces passes font.

---

## 4. Méthode, identique pour chaque passe

Reprise de celle du relevé de manques, qui a fait ses preuves.

1. **Lire à la source**, article par article, dans la compétence. Jamais de
   mémoire (CLAUDE.md § 1).
2. **Confronter au code** : pour chaque obligation, chercher où elle vit, ou
   constater qu'elle ne vit nulle part.
3. **Classer par ce qu'une erreur coûte**, dans cet ordre : ce qui produit un
   état ou une déclaration **FAUX** · ce qui la produit **INCOMPLÈTE** · les
   **obligations de calendrier**, qui ne touchent aucun état mais une date
   opposable · le **confort**.
4. **Corriger dans la même passe** ce qui est corrigeable, avec le test qui
   l'aurait attrapé (§ 10) et une réinjection du défaut pour prouver que le test
   tombe.
5. **Écrire ce qui n'est pas corrigé** avec sa raison, et **ce qui appartient à
   Manasse** avec la question exacte à trancher.
6. **Ne jamais combler une lacune du texte** en inventant une règle, et **ne
   jamais déclarer une lacune sans avoir cherché dans tout le corpus** · les
   deux erreurs se paient au même prix, dans deux directions opposées.

### Qui conduit une passe · arbitré par Manasse le 2026-09-13

Chaque passe est conduite par un **workflow d'agents**, avec modèle et effort
réglés par étape. Ce n'est PAS une délégation : c'est une division du travail,
et elle tient à trois règles qui ne se négocient pas.

| Étape | Qui | Modèle · effort | Pourquoi |
|---|---|---|---|
| **Lecture** du texte, article par article | un agent par chapitre, **qui n'a pas accès au code** | Opus · `high` | L'indépendance est le seul vrai apport. Un lecteur qui connaît le code lit le texte à travers lui et ne voit plus que ce que le logiciel fait déjà |
| **Confrontation** de chaque obligation au dépôt | un agent par chapitre | Opus · `high` | Cherche où l'obligation vit, ou constate qu'elle ne vit nulle part |
| **Réfutation** de chaque manque annoncé | un agent par constat, payé pour DÉMOLIR | Opus · `xhigh` | Un constat qu'on n'a pas essayé de réfuter n'est qu'une impression |
| **Correction**, schéma, migrations, tests, déploiement | **la session principale, jamais un agent** | Opus · `high` | C'est la seule discipline qui a réellement attrapé des défauts : réinjection, garde-fous du dépôt, déploiement relu pas à pas |

**TROIS RÈGLES, ET « SANS ERREURS » N'EN FAIT PAS PARTIE.** Des agents
n'apportent pas la justesse · ils lisent et hallucinent comme la session
principale, et leur rapport revient sous forme de TEXTE, ce qui est pire : le
croire propagerait une citation fausse avec plus d'assurance que de l'avoir lue
soi-même. Ce qu'ils apportent est la COUVERTURE, l'INDÉPENDANCE et le TEMPS.
D'où :

1. **Aucun agent n'écrit dans le dépôt.** Ils lisent et rapportent.
2. **Tout constat est ancré** · citation exacte, fichier source, ligne. Rien
   n'entre dans le code sans que la session principale ait relu la ligne
   elle-même. C'est la règle n° 1 de CLAUDE.md, et elle ne se délègue pas.
3. **Une étape adverse est obligatoire.** Ce qui survit à la réfutation entre
   au relevé ; le reste est écrit comme écarté, avec sa raison.

**Journal d'avancement :** `docs/releve-de-manques-fiscal.md` pour les passes F,
`docs/releve-de-manques-ohada.md` pour les passes O, `docs/releve-de-manques-referentiels.md`
(existant, à compléter) pour les passes R.

---

## 5. LES PASSES, DANS L'ORDRE · c'est cet ordre qui est verrouillé

L'ordre suit le coût d'une erreur pour un client du cabinet, pas la taille du
corpus. Le fiscal d'abord : c'est le seul domaine où une lacune se paie en
pénalités datées, chez le client, et c'est le plus jeune du logiciel.

### Bloc F · La fiscalité congolaise · JAMAIS CONFRONTÉE

Compétences `fiscalite-rdc` (132 fichiers, 36 951 lignes) et
`fiscalite-rdc-socle` (10 fichiers). Le sous-dossier `code-general-2026` est la
compilation DGI au 19 juillet 2026, en 26 fichiers · c'est LUI qui fait foi, les
autres sous-dossiers en étant des vues thématiques.

| Passe | Objet | Source |
|---|---|---|
| **F1** | **TVA · la facture normalisée et les dispositifs électroniques** | décret n° 23/10 du 3 mars 2023 (29 art.), art. 14 du code général |
| **F2** | **TVA · l'ordonnance-loi n° 10/001**, champ, territorialité, fait générateur, exigibilité, base, taux, déductions, obligations, liquidation, remboursement | art. 10 du code général, 10 chapitres |
| **F3** | **TVA · le décret n° 011/42** d'exécution, les 12 chapitres | art. 11 à 13 du code général |
| **F4** | **Impôt sur les sociétés · loi n° 23/053, Titre 2** | art. 04 du code général |
| **F5** | **IRPP · loi n° 23/053, Titre 3** et les retenues (AM 2025 salaires, AM 008/2025 capitaux mobiliers) | art. 05 du code général + socle |
| **F6** | **Loi n° 23/053, Titres 1, 4 à 7** · dispositions générales, communes, abrogatoires, et l'art. 141 sur la tenue en français et en franc congolais | art. 03 et 06 |
| **F7** | **Procédures fiscales, Titre 1** · obligations déclaratives (dont l'art. 23 sur la facturation, déjà partiellement ouvert) | art. 17 et 22 |
| **F8** | **Procédures fiscales, Titres 2 et 3** · contrôle et recouvrement | art. 18, 19, 23, 24 |
| **F9** | **Procédures fiscales, Titre 4** · sanctions fiscales et pénales, et le barème complet | art. 20 |
| **F10** | **Procédures fiscales, Titres 5 à 7** · réclamations, délais, transitoires | art. 21, 25 |
| **F11** | **Impôts réels et cédulaires** · O.-L. 69/006 (foncier, véhicules, concessions), O.-L. 88/029, et ce qui survit de l'O.-L. 69/009 | art. 01, 02, 07, 08 |
| **F12** | **Le socle 2026** · les sept arrêtés ministériels de 2025 et `parametres-2026.md`, confrontés aux constantes du code | `fiscalite-rdc-socle` |
| **F13** | **Loi de finances n° 25/060** et l'IPM (O.-L. 71/087) | `lois-de-finances-annuelles`, art. 09 |
| **F14** | **Accises, taxe de promotion de l'industrie, parafiscalité sociale, recettes non fiscales** | 4 compétences ou sous-dossiers |

### Bloc O · Les actes uniformes OHADA non ouverts

| Passe | Objet | Volume |
|---|---|---|
| **O1** | **AUSCGIE** · art. 1 à 920. Le relevé le déclare lui-même non ouvert, et une contradiction de fenêtre y attend son arbitrage (jalon 16 contre documents obligatoires, art. 138) | 10 441 lignes |
| **O2** | **AUDCG** · art. 1 à 307. Le Livre 8 vient d'être lu pour le devis ; restent le statut de commerçant, le RCCM, les Fichiers, l'informatisation, le bail, le fonds de commerce, les intermédiaires | 963 lignes |
| **O3** | **AUS** (sûretés) · la réserve de propriété de l'art. 276 AUDCG y renvoie nommément, et le logiciel n'en tient rien | 1 669 lignes |
| **O4** | **AUPSRVE** (recouvrement et voies d'exécution) · le module de relances s'arrête à la lettre, le texte commence là | 3 445 lignes |
| **O5** | **AUPCAP** (procédures collectives) · ce qu'un dossier en cessation de paiements impose à sa comptabilité | 3 418 lignes |
| **O6** | **AUSCOOP** · le rapport de gestion à six sections de l'art. 108 est déjà servi, le reste ne l'est pas | 3 095 lignes |
| **O7** | **AUA, AUM, AUCTMR** · les trois petits, ensemble | 1 018 lignes |

### Bloc R · Le solde des référentiels comptables

Ce que les 21 passes n'avaient pas ouvert, et qui n'a servi qu'à CONSTRUIRE.

| Passe | Objet |
|---|---|
| **R1** | **AUDCIF Titre VII** · contenu et fonctionnement des comptes, classes 1 à 9, confrontés au plan semé et aux fiches `regles-comptes-syscohada.ts` |
| **R2** | **AUDCIF Titres IX et X** · états financiers du Système normal et du SMT, confrontés aux tables de correspondance |
| **R3** | **AUDCIF Titre XI** · nomenclatures NAEMA et NOPEMA, qui ne sont nulle part dans le logiciel |
| **R4** | **AUDCIF Titres XII et XIII** · comptes consolidés et combinés (D4C), face au module Groupe |
| **R5** | **SYCEBNL Partie 2** · cadre comptable et plan des comptes, face au semis |
| **R6** | **SYCEBNL Partie 4** · les trois jeux d'états et leurs 71 notes, face aux tables |

### Bloc D · Le droit congolais hors fiscal, déjà partiellement exploité

| Passe | Objet |
|---|---|
| **D1** | **Loi n° 004/2001** · art. 1 à 76. Le logiciel en porte déjà beaucoup (constitution, accord-cadre, exemption), jamais article par article |
| **D2** | **Droit du travail congolais et CNSS** · aucune paie dans le logiciel, mais les retenues et l'ONEM y sont · vérifier ce qui est affirmé |
| **D3** | **ONEC** · ce que l'Ordre impose à un cabinet qui tient des comptes, et ce que le logiciel prétend à sa place |
| **D4** | **Code du numérique** · relevé comme « OCR non collationné, à faire qualifier par un juriste ». La passe établit ce qui est lisible, et ce qui ne l'est pas |

---

## 6. Ce que ce plan NE fait pas

- **Il ne rouvre pas les 21 passes du relevé de manques.** Elles sont faites.
- **Il ne promet aucune « conformité ».** Une confrontation dit ce qui a été
  lu, contre quoi, et avec quel verdict. C'est un relevé, pas un certificat ·
  même réserve que l'audit des citations.
- **Il ne remplace pas un juriste** sur les points que les sources ne
  permettent pas de trancher, et ils sont nommés passe par passe.
- **Il n'ouvre aucun chantier de construction.** Une passe corrige ce qui est
  corrigeable dans son périmètre ; un manque qui demande un module entier
  devient un item du plan ordonné, pas un débordement de la passe.

## 7. La reprise de la Phase I

Quand les blocs F, O, R et D sont clos, **on reprend la Phase I exactement à son
point d'arrêt**, noté dans `docs/plan-ordonne-2026-09.md` :

> Gestion commerciale close le 2026-09-13 (facture I1, devis et commande I2).
> **La Phase I reprend aux STOCKS**, et à rien d'autre : ne pas recommencer la
> gestion commerciale, ne pas sauter à la paie. Suivent ensuite paie, OHADA vers
> IFRS, consolidation, RBAC fin.

Et l'avertissement du § 3.6 du plan de construction reste entier · le
multi-classification se décide à la CONCEPTION, `Compte`, `Journal` et
`Immobilisation` étant tous mono-classification.

---

## 8. Avancement

| Bloc | Passes | Faites | Reste |
|---|---|---|---|
| F · Fiscalité | 14 | 0 | 14 |
| O · OHADA | 7 | 0 | 7 |
| R · Référentiels, solde | 6 | 0 | 6 |
| D · Droit congolais | 4 | 0 | 4 |
| **Total** | **31** | **0** | **31** |

*Tenir ce tableau à jour à la fin de chaque passe. Une passe n'est « faite »
que lorsque son verdict est écrit dans son journal et que les corrections
qu'elle emporte sont poussées et déployées.*

## 9. Ce qui attend Manasse, ouvert par ce plan

1. **L'homologation d'OmegaX comme SFE** (décret n° 23/10, art. 20 à 23). La
   procédure existe et porte un nom ; l'arrêté qui en fixe les modalités n'est
   dans aucune source lue. C'est une démarche auprès de la DGI, pas une lecture.
   Les art. 20 et 21 la lient à la VENTE du logiciel en RDC, pas seulement à
   l'émission d'une facture · c'est le point à trancher en premier.
