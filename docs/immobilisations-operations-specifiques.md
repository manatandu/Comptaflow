# Immobilisations · opérations spécifiques des deux référentiels contre OmegaX

Relevé du 2026-10-01. Deux lectures complètes et indépendantes, comparées au
code et non à CLAUDE.md :

- **AUDCIF, Titre VIII**. Lus en entier : ch. 1 à 11. Lus pour les parties qui
  touchent aux immobilisations : ch. 12 à 14, 16 à 18, 22, 25, 28, et 33 à 41.
- **SYCEBNL**. Lus en entier : Partie 3 ch. 1 à 4 et 6, fiches 20 à 29. Lus pour
  les parties qui touchent aux immobilisations : cadre conceptuel, Guide
  d'application (App. 1, 3, 5 à 8, 11, 19).

Chaque règle, chaque compte cité vient du texte lu ; chaque état
(COUVERT, PARTIEL, ABSENT) a été vérifié dans `src/modules/`.

## Déjà fait depuis le relevé

| Sujet | Commit |
|---|---|
| **Échange** (classe 2 et art. 36 aux deux textes ; Guide SYSCOHADA Partie 1 ch. 5 § 4.5) · vente au prix de reprise (485 / 82), achat à prix de reprise + soulte (2 / 481), refus vers un immeuble de placement (ch. 10 § 2.1.2.2) | chantier (d) |
| **Lignes 15 à 18** · rente viagère (1681, extinction au 841) et écart sur redevances (831 ou 841), SYSCOHADA seul ; réserve de propriété sur la fiche et liste à la clôture, aux deux ; matériel récupéré au 388 (SYSCOHADA) ou au 378 (SYCEBNL, fiche du compte 37) | lot 15a |
| **Deux renvois faux** dans `contrepartie-acquisition.ts` · droits publics gratuits au **ch. 2** § 1.3.2 (et non ch. 1), construction reçue en fin de bail au **ch. 11** § 1.4 (et non ch. 9) · le premier était imprimé dans un refus | chantier (d) |

## À corriger en premier · des défauts, pas des manques

| # | Défaut | Texte | Effort |
|---|---|---|---|
| D1 | **Écarts de change sur les immobilisations.** `DevisesService.calculer` réévalue au cours de clôture toute ligne en devise non lettrée, quel que soit le compte · un 24x, 25x ou 26x saisi en USD reçoit un écart de conversion, écriture équilibrée | AUDCIF Titre VIII ch. 22 § 1.1 (gain ou perte « seulement au moment où les immobilisations sortent de l'actif »), § 1.2 (avances sur immobilisations, « aucun écart de conversion »), § 1.3 (titres au cours du jour) | Petit · exclure 21 à 26 de la réévaluation, le 27 restant réévalué ; vérifier les classes 3, 6, 7 |
| D2 | **Reprise de dépréciation d'un usufruit au mauvais compte.** À la sortie, toute la division 20 SYCEBNL reprend au 79520000 · un 2901 (usufruit) doit aller au 7951 | SYCEBNL P3 ch. 2 § 2.3.2 (D 2901 / C 7951) | Petit |
| D3 | **Refus de la pièce de sécurité qui cite le SYCEBNL dans un dossier SYSCOHADA** (`verifierComposant`) | AUDCIF Titre VIII ch. 14 § 1.2.3 porte la même règle | Petit |
| D4 | **Contrôle qui fabrique une anomalie** (`IMMO_SANS_DOTATION`, contrôle 13) sur un projet de développement, si l'on suit le guide · voir A2 | Guide SYCEBNL App. 8 | Petit, une fois A2 tranché |

## À trancher avant tout code

| # | Question | Ce que disent les textes |
|---|---|---|
| A1 | Le **2011 (usufruit temporaire)** · dépréciation obligatoire ou déconseillée ? | P3 ch. 2 § 2.3.2 « l'entité **doit** constater une dépréciation » contre Guide App. 7 « par simplification, le SYCEBNL recommande de **ne pas** constater de dépréciation » (information en Note 5D) |
| A2 | **Amortit-on les biens d'un projet de développement ?** | Guide App. 8 « **aucune dotation aux amortissements** n'est constatée » contre cadre conceptuel § 5.4.2.3 (fonds d'investissement repris « dans la même quotité que les dotations aux amortissements »). Le ch. 3 § 1.2 est tronqué (« En fin d'exercice : » sans suite) et aucun compte de reprise n'est donné pour le 162 |
| A3 | **Mise au rebut** · amortir intégralement d'abord, ou sortir la valeur nette au 81 ? | SYCEBNL, introduction de la classe 2 (« à amortir intégralement ») contre fiches 21, 23 et 24 (« mise au rebut… par le débit du 81 ») |

## Manques, classés par valeur pour un cabinet en RDC puis par effort

### Valeur haute

| # | Sujet | AUDCIF | SYCEBNL | État | Effort |
|---|---|---|---|---|---|
| 1 | **Sortie de fin de projet** par le 162 à 164 · cession (D 162-164 / C 2, puis 485 ou 5 / 82), remise gratuite, restitution, vol, destruction (D 162-164 / C 2) | | SYCEBNL P3 ch. 3 § 2.5.1 à 2.5.3 | ABSENT · `sortir` débite toujours 28 et 81 | Moyen, après A2 |
| 2 | **Subvention d'investissement reçue en numéraire, rattachée au bien** · reprise sur la dotation globale (dérogatoire compris), composants, remboursement (réduire le 14), dépréciation d'un bien subventionné, subvention non versée (6515) | AUDCIF ch. 17 § 3.2, § 4.3.1, § 4.4, § 4.6, § 4.7 | SYCEBNL P3 ch. 1 § 2.5, App. 3 | PARTIEL · seule la subvention **en nature** est suivie | Moyen |
| 3 | **Reprises de fonds proposées depuis la fiche**, sur le moteur du 14 · 167 vers 7923 (dons et legs à conserver, y compris la dépréciation), 171 vers 7961 (usufruit), 172 vers 7962 (solde à la sortie d'un bien destiné à la vente) | | SYCEBNL P3 ch. 2 § 1.2.2, § 2.2.3, § 2.3.2, App. 5 à 7 | PARTIEL · à la main par le catalogue (B16, B17, B18) | Petit à moyen |
| 4 | **Ventilation d'un prix global** · terrain et bâtiment, fonds de commerce, composant non identifié à l'origine | AUDCIF ch. 11 § 1.7.1 (art. 38), ch. 2 § 7.2.1, ch. 4 § 3.1.2 et § 4.2 | | ABSENT | Moyen |
| 5 | **Réévaluation légale ou libre** · sur l'ensemble des immobilisations corporelles et financières, méthode indiciaire plafonnée, 1061 ou 154, libre au 1062, amortissements recalculés, perte de valeur imputée d'abord au 1062 | AUDCIF ch. 28, ch. 12 § 2.5, ch. 16 § 2.6 | SYCEBNL P3 ch. 1 § 2.1.1.3 (106) | ABSENT · seul le contrôle `DECLARATION_REEVALUATION_A_DEPOSER` existe | Gros |
| 6 | **Legs avec dettes reprises** · D 2 / C 4861 + C 167 sur une même fiche | | SYCEBNL P3 ch. 2 § 1.2.2, App. 5 | PARTIEL · une seule contrepartie par fiche | Moyen |

### Valeur moyenne

| # | Sujet | Réf. | État | Effort |
|---|---|---|---|---|
| 7 | **Incorporels à durée non limitée** (marque, fonds commercial, droit indéterminé) non amortis, bascule prospective quand la durée devient limitée, dix ans au SMT | AUDCIF ch. 2 § 1.3.3, 3.2.2 c, 4.2.2, 7.2.2.1 | ABSENT · la durée est toujours exigée | Moyen |
| 8 | **Coûts d'emprunt incorporés** à un actif qualifié, nets des produits de placement, mention aux notes | AUDCIF ch. 7 | ABSENT | Moyen |
| 9 | **Révision prospective de la durée**, reprise au 798 ; dégressif comptable au SYCEBNL | SYCEBNL fiche 28, cadre § 3.3.1.2 | PARTIEL | Moyen |
| 10 | **Plafond de reprise d'une dépréciation** (valeur sans dépréciation) | AUDCIF ch. 12 § 2.4.2 | PARTIEL · plafond au cumul inscrit, limite écrite | Moyen |
| 11 | **Voies parallèles du catalogue** (B17-DEPRECIATION, B18-AMORTISSEMENT) qui passent l'écriture sans la fiche · double dotation ou dépréciation ignorée à la sortie | SYCEBNL P3 ch. 2 | Contournement | Petit |
| 12 | **Usufruit** · linéaire imposé sur la durée de la donation, rétrocession sans 818 | SYCEBNL P3 ch. 2 § 2.3.2 | PARTIEL | Petit |

### Valeur basse

| # | Sujet | Réf. | Effort |
|---|---|---|---|
| 13 | Démantèlement complet (actualisation, désactualisation 6971 / 1984, révision, reprise 7911 / 7971) ; 1984 ouvert au SYCEBNL | AUDCIF ch. 6 ; SYCEBNL classe 2 | Moyen |
| 14 | Six critères de la R&D, justification écrite | AUDCIF ch. 1 § 2.1 | Petit |
| 15 | Rente viagère · 1681 parmi les contreparties | AUDCIF ch. 11 § 2.3 | Petit |
| 16 | Case « réserve de propriété » sur la fiche | AUDCIF ch. 9 § 3 | Petit |
| 17 | Matériel récupéré d'un bien mis au rebut (388) | AUDCIF ch. 14 § 2.8 | Petit |
| 18 | Écart sur un incorporel acquis contre redevances (831 ou 841) | AUDCIF ch. 2 § 11 | Petit |
| 19 | Bailleur d'une construction reçue en fin de bail au SYCEBNL (841) | SYCEBNL fiche 23 | Petit |
| 20 | Location-acquisition · loyers indexés, garantie de valeur résiduelle, démantèlement dans le coût | AUDCIF ch. 8 § 2.1.2 et 2.1.5 | Moyen |
| 21 | Groupe d'actifs, cession partielle de titres, transfert vers les stocks | AUDCIF ch. 12 § 2.4.3, ch. 13 § 4, ch. 10 § 2.4 | Moyen |
| 22 | Bailleur, sous-location, cession-bail, concessions et PPP, première application | AUDCIF ch. 8 § 3 à 5, ch. 25, ch. 41 | Moyen à gros |

## Déjà couvert, vérifié dans le code

Composants et révisions majeures (AUDCIF ch. 4 et 5), dépréciation et
ré-étalement (ch. 12), dérogatoire (ch. 16 et 18), location-acquisition
(ch. 8), immeuble de placement (reclassement, ch. 10), construction sur sol
d'autrui (ch. 11), titres et cession financière (ch. 13), acquisition gratuite
et reprise du 14 (ch. 17 § 3.2 en nature, § 4.5), apport partiel d'actif
(ch. 38), unités d'œuvre (ch. 3) · au SYCEBNL, biens destinés à la vente
(172, non amortis, cession 818 / 828, reprise 7952), usufruit à l'entrée
(171), acquisition sur fonds du bailleur (481, 25), apport en nature (45,
101, 102, 104), première application (bien repris).

## Anomalies des textes relevées (non marquées dans les sources)

- AUDCIF · 6812 au ch. 1, 6811 au ch. 2 § 8.3 pour la même dotation ; 206 au
  ch. 2 § 5.1, 216 au § 7.2.1 ; ch. 8 § 5.2, schéma « Oui » et « Non »
  inversé ; ch. 12, 6913 pour un corporel dans l'exemple (le plan semé :
  6913 incorporelles, 6914 corporelles) ; ch. 28 § 4.2.2, calcul sur 1 500
  au lieu de 1 400.
- SYCEBNL · « coût d'acquisition » pour un legs (P3 ch. 2 § 1.2.2) et un
  apport (ch. 1), contre « valeur actuelle » et « valeur de l'acte d'apport »
  en classe 2 ; **845 cité à la fiche 23, absent du plan SYCEBNL** (841 au
  plan) ; « SYCOHADA » (démantèlement) ; « dotation » pour « donation »
  (ch. 2 § 2.3.2) ; renvoi « chapitre 2 section 2 » inexact (ch. 4) ; App. 5
  « 28444 » (déjà marqué).
