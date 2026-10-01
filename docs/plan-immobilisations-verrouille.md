# Plan verrouillé · module des immobilisations

Arrêté le 2026-10-01 avec Manasse. Il découle du relevé
`docs/immobilisations-operations-specifiques.md` (AUDCIF Titre VIII, SYCEBNL
Partie 3 et guides) et de la table `docs/bareme-013-2025-comptes.md`.

## Ce qui verrouille

1. **L'ordre est fixe.** Un lot ne commence que lorsque le précédent est
   poussé ET vérifié en production (déploiement Cloud Run vert, Hosting vert,
   tests navigateur verts). Pousser n'est pas déployer (CLAUDE.md § 5).
2. **Le périmètre de chaque lot est celui écrit ici.** Ce qu'on découvre en
   route s'inscrit au journal en bas de page et va dans un lot ultérieur ;
   rien n'élargit un lot en cours.
3. **Les décisions ci-dessous sont closes.** On ne les rouvre que sur une
   nouvelle décision de Manasse, écrite au journal avec sa date.
4. **Un lot n'est fini que si chaque case de sa définition de fini est
   cochée.** Une case non tenue se dit, elle ne se coche pas.
5. **Aucun compte, article ou taux de mémoire.** Les sources listées pour un
   lot sont relues au moment de coder ; un renvoi s'écrit après lecture (le
   relevé a trouvé deux renvois faux écrits sans relecture, corrigés au
   chantier d).

## Décisions closes

| # | Question | Décision | Fondement retenu | Date |
|---|---|---|---|---|
| D-1 | Biens d'un projet de développement (SYCEBNL) · amortis ? | **Non.** Aucune dotation pour un dossier « projets de développement » ; le contrôle « immobilisation sans dotation » ne les signale plus ; sortie de fin de projet par le 162 à 164 | **Acte uniforme SYCEBNL, art. 7 et 9** (« les charges sans amortissement, ni dépréciation »), suivi par le Guide App. 8 et la Partie 4 ch. 3 (aucun amortissement aux états des projets) ; sortie par P3 ch. 3 § 2.5. La phrase contraire du cadre conceptuel § 5.4.2.3, texte général, cède devant les articles qui visent le cas ; l'écart est écrit dans le code | 2026-10-01 |
| D-2 | Usufruit temporaire (2011) · dépréciation ? | **Permise**, reprise au 7951 ; la simplification du guide est citée dans l'aide, rien n'est bloqué | P3 ch. 2 § 2.3.2 ; Guide App. 7 en aide | 2026-10-01 |
| D-3 | Mise au rebut d'un bien non entièrement amorti | **Valeur nette au 81** (comportement actuel) ; l'écart avec l'introduction de la classe 2 du SYCEBNL est écrit dans le code | Fiches 21, 23, 24 des deux textes | 2026-10-01 |
| D-4 | Table du barème contre les comptes | **Proposer dans les deux sens** · la nature propose son compte, le compte ne propose que ses natures, « toutes les catégories » à un clic, jamais de refus. Une nature à plusieurs comptes propose la liste, le premier en tête | Aucun texte ne relie nature et compte | 2026-10-01 |
| D-5 | Contreparties d'un bien reçu gratuitement (SYSCOHADA) | 14 (subvention en nature) et 841 (construction reçue en fin de bail, 231 hors 2316) ; 845 non ouvert | Fiche du compte 14 ; AUDCIF ch. 11 § 1.4 | 2026-10-01 |
| D-6 | Reprise d'une subvention au 799 | **Proposée, jamais postée d'office** | Fiche du compte 14 | 2026-10-01 |
| D-7 | Crédit-bail | Dette au taux saisi ou à la valeur du contrat ; loyers saisis par le cabinet au 623, le module ne fait que la clôture | AUDCIF ch. 8 | 2026-10-01 |
| D-8 | Amortissement exceptionnel · première annuité (loi n° 23/053, art. 38, 1°) | **60 % plein, sans prorata** · le renvoi « article 31 » de l'art. 38, 1° (contradictoire avec l'art. 37) se lit « article 34 », comme l'O.-L. n° 69/009, art. 43 ter L, écartait l'art. 43 ter H (prorata) ; l'anomalie est écrite dans le code et l'aide | Art. 36 à 38 ; texte d'origine abrogé, art. 43 ter J à L | 2026-10-01 |
| D-9 | Amortissement exceptionnel · bénéficiaires | **Toute entreprise du SYSCOHADA** (« les entreprises industrielles », art. 36), et non les seules sociétés du dégressif (art. 31) ; biens de l'art. 31, bornes de l'art. 32 | Art. 36 et 37 | 2026-10-01 |
| D-10 | Amortissement exceptionnel · condition de l'art. 36 | **Déclarée, prorata calculé** · activité industrielle (produits ouvrés ou semi-ouvrés) attestée, chiffre d'affaires HT à l'export et total HT de l'année de mise en service saisis avec leur source, refus sous 20 % | Art. 36 | 2026-10-01 |
| D-11 | Dépréciation d'un bien subventionné (AUDCIF Titre VIII ch. 17 § 4.6) | **Méthode déclarée une fois par dossier, sans défaut** (`Tenant.methodeDepreciationBienSubventionne`) · en deuxième méthode, la reprise du 14 à hauteur de la dépréciation est proposée ; non déclarée, rien n'est ajouté et la proposition le dit | § 4.6 | 2026-10-01 |
| D-12 | Rythme de la reprise après un événement | **Prospectif** · solde non repris × dotation globale de l'exercice ÷ valeur restant à amortir à l'ouverture ; identique au § 3.2 sans événement, sans rattrapage après remboursement, non-versement, dépréciation, rattachement tardif ou dérogatoire · lecture de l'éditeur, le § 4.3 ne donnant pas de formule | § 3.2, § 4.3 | 2026-10-01 |
| D-13 | Composants (§ 4.4) | **Ventilation proposée au prorata des valeurs d'entrée, modifiable** ; tout laisser sur la structure exige un motif écrit | § 4.4 | 2026-10-01 |
| D-14 | Contrepartie du remboursement (§ 4.3.1) | **Un compte de tiers (classe 4) choisi** · 4739 « subventions à reverser » proposé au SYCEBNL ; au SYSCOHADA, où le 4739 est le « fonds global d'allocation » (refusé), 449, 458 ou 4712 selon le concédant | § 4.3.1 ; SYCEBNL Partie 2 ch. 3, compte 47 | 2026-10-01 |
| D-15 | Reprise du 167 d'un legs grevé de dettes | **Quote-part 167 ÷ valeur d'entrée** · la dotation (et la dépréciation) multipliée par le rapport du fonds du bien à sa valeur ; sans dettes, la dotation entière. Écart assumé avec l'Application 5, qui reprend la dotation entière et épuiserait le 167 avant le terme du plan · écrit dans le code | Partie 3 ch. 2 § 1.2.2 (« quote-part ») ; Application 5 | 2026-10-01 |
| D-16 | Écriture d'un legs à plusieurs biens | **Une pièce par bien** · une saisie de l'acte crée une fiche et une écriture par bien, D 2 / C 4861 (sa part des dettes) / C 167 (le reste), dettes réparties au prorata des valeurs, le dernier bien au centime ; totaux du 4861 et du 167 ceux de l'acte | Partie 3 ch. 2 § 1.2.2 ; Application 5 | 2026-10-01 |
| D-17 | Écriture d'un prix global à plusieurs biens | **Une pièce par bien** · comme D-16, chaque fiche garde son écriture d'acquisition, la contrepartie reçoit une ligne par bien, total égal au prix de l'acte ; aucun changement de schéma | AUDCIF art. 38 ; Titre VIII ch. 11 § 1.7.1 | 2026-10-01 |
| D-18 | Stocks repris avec un fonds de commerce | **Ligne de classe 3 déclarée** · compte et valeur déclarés, une ligne D 3x sans fiche dans la pièce du fonds commercial (ou du dernier bien), le reliquat au 21500000, total égal au prix | Titre VIII ch. 2 § 7.2.1 | 2026-10-01 |
| D-19 | Partie remplacée d'une structure jamais décomposée | **Valeur d'origine estimée** · déclarée avec la voie du § 3.1.2 et sa source, détachée de la structure avec ses amortissements au prorata, devenue composant puis renouvelée (§ 4.1), sortie au 812 ou au 654 | Titre VIII ch. 4 § 3.1.2 et § 4.2 ; art. 38-2 | 2026-10-01 |
| D-20 | Modèles du catalogue qui touchent un bien | **Entrées, dotations, reprises** · B15-REPRISE, B16-RECEPTION-LEGS, B16-REPRISE-FONDS, B17-COMPTABILISATION, B17-DEPRECIATION, B17-SOLDE-FONDS, B18-RECEPTION, B18-AMORTISSEMENT, B18-REPRISE renvoient à la fenêtre Immobilisations, refusés par le serveur ; une reprise passée au catalogue serait reproposée par le module | Partie 3 ch. 2 ; Guide App. 3, 5, 6, 7 | 2026-10-01 |
| D-21 | Amortissements déjà passés hors fiche | **Avertissement** `AMORTISSEMENT_IMMO_HORS_MODULE`, jumeau de la dépréciation · crédits du 28 de l'exercice hors écritures que le module retient et hors clôture, compte par compte, rien corrigé d'office | Fiche du compte 28 des deux textes | 2026-10-01 |
| D-22 | Incorporels admis à la durée non limitée | **Tout incorporel, sauf ceux que le texte fait amortir** · le § 4.2.2 vise « la marque ou tout autre actif incorporel » ; justification écrite exigée, sauf au fonds commercial présumé non limité ; refusés · 211, 2121, 2122, 2131, 216, 2182, en cours (219), site internet (2132) hors nom de domaine | Titre VIII ch. 2 § 1.3.3, § 3.2.2 c, § 4.2.2, § 7.2.2.1 | 2026-10-01 |
| D-23 | Référentiel | **SYSCOHADA seul** · la règle vient du Titre VIII de l'AUDCIF, le SYCEBNL n'en écrit aucune et n'ouvre ni 215 ni 216 ; au SYCEBNL l'incorporel s'amortit, refus nommé | Titre VIII ch. 2 | 2026-10-01 |
| D-24 | Révision du plan d'amortissement | **Prospective par défaut, 798 en option** · changement d'estimation, le reliquat à l'ouverture de l'exercice de la décision se répartit sur la durée résiduelle, sans écriture ; la révision rétroactive, déclarée et motivée, rejoue le plan linéaire passé par le module et reprend au 798 la seule réduction du cumul ; décidée avant la dotation de l'exercice, motif exigé, chaque révision gardée | Cadre conceptuel § 3.3.1.2 b (SYCEBNL, AUDCIF Titre V) ; fiches des comptes 28 (deux textes) et 79 (AUDCIF, « cas exceptionnel d'une révision rétroactive ») | 2026-10-01 |
| D-25 | Dégressif comptable · taux | **Le dégressif de la loi n° 23/053, et lui seul** · taux linéaire × 1,5, 2 ou 2,5 (art. 33), prorata du mois de mise en service (art. 34), bascule au linéaire (art. 35), durée de quatre à vingt ans et incorporels exclus (art. 32) ; aucun taux déclaré par le cabinet (le premier choix d'un taux déclaré a été remplacé le même jour par Manasse) | Fiche du compte 28 du SYCEBNL (« mode dégressif à taux décroissant », sans taux) ; loi n° 23/053 art. 32 à 35 | 2026-10-01 |
| D-26 | Dégressif comptable · référentiel | **SYCEBNL seul** · au SYSCOHADA le dégressif reste l'option fiscale, tenue à part avec son dérogatoire (85 / 151), refus nommé | Fiche du compte 68 (AUDCIF) ; loi n° 23/053 art. 31 | 2026-10-01 |

## Définition de fini, commune à tous les lots

- [ ] Sources du lot relues ; chaque règle codée cite article, chapitre ou
      paragraphe en commentaire ; anomalie du texte signalée sur place.
- [ ] Les deux référentiels traités, ou l'exclusion de l'un écrite avec son
      motif (« un numéro, deux sens » vérifié dans les deux semis).
- [ ] Tests serveur de la règle ET du câblage ; chaque garde vérifiée par
      mutation (le test tombe quand on retire la garde).
- [ ] Table nouvelle · migration écrite à la main, dérive nulle
      (`prisma migrate diff`), cloisonnée, journalisée, restituée, écritures
      retenues déclarées (`detenteurs-ecriture.ts`).
- [ ] Route nouvelle · `@Roles`, geste à l'écran, fonction métier rangée.
- [ ] Écran · titres formels, explication dans la bulle d'aide, montants par
      `lib/montants.ts`, droit lu (`peutEcrire`).
- [ ] Test navigateur sur base réelle pour toute écriture nouvelle, passé en
      local avant de pousser.
- [ ] Suites complètes vertes des deux côtés, constructions vertes, aucun
      tiret cadratin.
- [ ] Poussé sur `main`, déploiement et tests navigateur vérifiés verts.

## Lots, dans l'ordre

### Lot 1 · Défauts (avant tout ajout)

| Réf. | Défaut | Sources à relire |
|---|---|---|
| 1.1 | Pas d'écart de change sur les comptes 21 à 26 à la clôture ; le 27 reste réévalué ; vérifier les classes 3, 6, 7 au même paragraphe | AUDCIF Titre VIII ch. 22 § 1.1 à 1.4 |
| 1.2 | Reprise de dépréciation d'un 2011 au 7951 (et non 7952) ; rétrocession d'un usufruit sans passer par le 818 | SYCEBNL P3 ch. 2 § 2.3.2, App. 7 (D-2) |
| 1.3 | Refus de la pièce de sécurité · citer le texte du référentiel du dossier | AUDCIF ch. 14 § 1.2.3 ; SYCEBNL classe 2 |
| 1.4 | Dossier « projets de développement » · aucune dotation, contrôle « immobilisation sans dotation » muet sur eux | Acte uniforme SYCEBNL art. 7 et 9 ; Guide App. 8 (D-1) |

Preuve · un test par défaut qui tombe sur l'ancien comportement.

### Lot 2 · Amortissement exceptionnel (chantier e)

Périmètre · à fixer APRÈS lecture des sources, et proposé à Manasse avant le
code (ce que la loi appelle exceptionnel, à qui, sur quels biens, comptable
ou fiscal, et par quels comptes).
Sources · loi n° 23/053, articles sur les amortissements (à partir de
l'art. 28) ; arrêté n° 013/2025 ; AUDCIF fiche du compte 68 et 85.

### Lot 3 · Fin de projet de développement (SYCEBNL)

Sortie d'un bien de projet par le 162 à 164 · cession (D 162-164 / C 2, puis
485 ou 5 / 82), remise gratuite, restitution au bailleur, vol, destruction
(D 162-164 / C 2). Choix du compte de fonds. Sources · P3 ch. 3 § 2.5.1 à
2.5.3, Guide App. 8.

### Lot 4 · Reprises des fonds sur le moteur du 14 (SYCEBNL)

Proposées depuis la fiche, comme la reprise du 14 · 167 vers 7923 (dotation
ET dépréciation), 171 vers 7961, 172 vers 7962 à la sortie. Usufruit
linéaire imposé sur la durée de la donation. Sources · P3 ch. 2 § 1.2.2,
§ 2.2.3, § 2.3.2, App. 5 à 7.

### Lot 5 · Subvention reçue en numéraire, rattachée au bien (deux référentiels)

Rattacher une subvention (14) à un ou plusieurs biens avec son montant ;
reprise sur la dotation globale (dérogatoire compris), composants,
remboursement (réduction du 14), dépréciation d'un bien subventionné,
subvention non versée (6515). Sources · AUDCIF ch. 17 § 3.2, § 4.3.1, § 4.4,
§ 4.6, § 4.7 ; SYCEBNL P3 ch. 1 § 2.5, App. 3.

### Lot 6 · Barème et comptes, proposition dans les deux sens (D-4)

La table devient un module engendré relu dans les deux semis par un test ;
l'écran propose dans les deux sens. Sources · arrêté n° 013/2025, art. 2 ;
`docs/bareme-013-2025-comptes.md`.

### Lot 7 · Legs avec dettes reprises (SYCEBNL)

Une fiche à deux contreparties · D 2 / C 4861 + C 167. Sources · P3 ch. 2
§ 1.2.2, App. 5.

### Lot 8 · Ventilation d'un prix global

Terrain et bâtiment, fonds de commerce, composant non identifié à l'origine
(sortie partielle de la structure). Sources · AUDCIF ch. 11 § 1.7.1 et
art. 38, ch. 2 § 7.2.1, ch. 4 § 3.1.2 et § 4.2.

### Lot 9 · Voies parallèles du catalogue

Les écritures B17-DEPRECIATION et B18-AMORTISSEMENT renvoient au module ;
plus aucune dotation ni dépréciation de bien hors fiche. Source · SYCEBNL
P3 ch. 2.

### Lot 10 · Incorporels à durée non limitée

Bien « non amorti », bascule prospective quand la durée devient limitée, dix
ans au SMT. Sources · AUDCIF ch. 2 § 1.3.3, 3.2.2 c, 4.2.2, 7.2.2.1.

### Lot 11 · Révision du plan d'amortissement

Durée révisée de façon prospective, reprise au 798 ; dégressif comptable au
SYCEBNL. Sources · SYCEBNL fiche 28, cadre § 3.3.1.2 ; AUDCIF fiche 28.

### Lot 12 · Plafond de reprise d'une dépréciation

Valeur sans dépréciation, plan d'origine rejoué. Source · AUDCIF ch. 12
§ 2.4.2.

### Lot 13 · Coûts d'emprunt incorporés

Actif qualifié, coûts nets, mention aux notes. Source · AUDCIF ch. 7.

### Lot 14 · Réévaluation légale ou libre

Ensemble des immobilisations corporelles et financières, méthode
indiciaire, 1061 ou 154, libre au 1062, amortissements recalculés, perte
imputée d'abord au 1062 ; reprise de la provision spéciale au 861. Sources ·
AUDCIF ch. 28, ch. 12 § 2.5, ch. 16 § 2.6 ; SYCEBNL P3 ch. 1 § 2.1.1.3 ;
loi n° 23/053 art. 136 et 138.

### Lot 15 · Petits manques de faible valeur

Rente viagère (1681), réserve de propriété sur la fiche, matériel récupéré
(388), écart sur redevances (831 ou 841), six critères de la R&D, 841 au
SYCEBNL pour la construction reçue, démantèlement complet et 1984 au
SYCEBNL, compléments du crédit-bail (loyers indexés, garantie de valeur
résiduelle). Sources · voir le relevé, lignes 13 à 20.

### Hors plan

Bailleur, sous-location, cession-bail, concessions et PPP, première
application du SYSCOHADA révisé, groupe d'actifs, cession partielle de
titres · trop rares pour un cabinet en RDC ; repris seulement sur demande.

## Journal

| Date | Lot | Événement |
|---|---|---|
| 2026-10-01 | · | Plan arrêté ; décisions D-1 à D-7 ; chantiers a, b1 à b3, c et d déjà livrés |
| 2026-10-01 | D-1 | Fondement porté à l'Acte lui-même (art. 7 et 9), à la question de Manasse · décision inchangée |
| 2026-10-01 | 1 | Livré · 1.1 réévaluation des devises limitée aux créances, dettes et disponibilités (`devises/perimetre-reevaluation.ts`, 16 et 17 du SYCEBNL hors champ, positions écartées montrées avec leur motif) ; 1.2 usufruit temporaire (2011) en nature propre, rétrocédé sans 81, cession refusée, dépréciation au 6951 et reprise au 7951 ; 1.3 refus de la pièce de sécurité cité au texte du dossier ; 1.4 projet de développement sans dotation ni complément de sortie, contrôles 12 et 13 muets |
| 2026-10-01 | 1 | Relevé en route · le § 2.3.2 n'équilibre la rétrocession que si l'usufruit est entièrement amorti ; avec une dépréciation qui subsiste, aucun compte n'est donné pour la valeur nette · refus nommé (reprendre d'abord la dépréciation). Le 50 (titres de placement) reste réévalué comme avant, à trancher au regard du § 1.3 dans un lot ultérieur |
| 2026-10-01 | 1 | Vérifié en production · Cloud Run 457, Hosting 580, tests navigateur 225, tous verts sur fd22695 |
| 2026-10-01 | 2 | Périmètre fixé (D-8 à D-10). Livré · amortissement exceptionnel en variante de l'option dégressive (`amortissement-degressif.ts`, `degressif.service.ts`), 60 % plein la première période, dégressif et bascule ensuite, déclaration de l'art. 36 gardée sur le bien (migration `20270105000000_amortissement_exceptionnel`), dérogatoire 851 / 151 inchangé ; test navigateur sur base réelle |
| 2026-10-01 | 3 | Livré · fin de projet de développement dans la sortie existante · le fonds affecté choisi (162, 163 ou 164) reprend le bien, D fonds / C 2, sans 28 ni 81 ; la cession garde son prix au 485 ou en trésorerie contre le 82 ; refus sans fonds, avec un autre compte, hors projet, ou sur un bien amorti ou déprécié (art. 7 et 9) ; test navigateur sur base réelle. Relevé en route · l'échange d'un bien de projet passe par la même sortie et exige donc le fonds, que l'écran d'échange ne demande pas encore (à traiter au lot 15) |
| 2026-10-01 | 2 | Vérifié en production · Cloud Run 458, Hosting 581, tests navigateur 226, tous verts sur 9bd2624 |
| 2026-10-01 | 4 | Livré · reprises des fonds sur le moteur du 14 (`reprise-subvention.ts`, table `FONDS_REPRIS` par référentiel) · 167 au 7923 sur la dotation aux amortissements et aux dépréciations (App. 5, dotation entière, sans prorata du fonds ; 1679 écarté), 171 au 7961 dans la quotité de l'amortissement, 172 pour solde au 7962 à la cession ; usufruit (2011) en linéaire imposé ; au SYSCOHADA, le 172 reste une dette ; test navigateur du 167 sur base réelle. Relevé en route · le texte ne règle pas le 167 à la sortie d'un bien à conserver (rien proposé, dit) ; la quote-part du 167 d'un legs grevé de dettes (4861) se tranchera au lot 7 |
| 2026-10-01 | 3 | Vérifié en production · Cloud Run 459, Hosting 582, tests navigateur 227, tous verts sur 87038c6 (qui porte c87dfbe) |
| 2026-10-01 | 4 | Poussé avec la vérification du lot 3 (ddd756c) |
| 2026-10-01 | 5 | Périmètre fixé (D-11 à D-14). Livré · subvention en numéraire RATTACHÉE au bien (`SubventionImmobilisation`, migration `20270106000000_subvention_numeraire_rattachee`), montant déclaré avec l'acte d'octroi, refusé au-delà des crédits du 14 hors clôture, de la valeur d'entrée, sur un bien entré par un fonds ou dans un projet de développement ; ventilation entre composants proposée (§ 4.4) ; reprise au 799 au rythme prospectif sur la dotation globale (dérogatoire passé d'abord) ; remboursement D 14 / C tiers (§ 4.3.1) et subvention non versée D 6515 / C créance et D 14 / C 799 (§ 4.7), écritures retenues ; méthode du § 4.6 déclarée par dossier. Test navigateur sur base réelle (Application 3). Relevé en route · le § 4.6 ne dit rien de la reprise d'une dépréciation (7914) sur un bien dont le 14 a été repris en deuxième méthode · rien n'est proposé alors ; le § 4.2.1 (provision pour condition résolutoire) et le § 4.2.2 (4497, condition suspensive) restent hors de ce lot |
| 2026-10-01 | 6 | Livré · la table du barème contre les comptes devient un module ENGENDRÉ (`scripts/extraire-bareme-comptes.cjs` depuis `docs/bareme-013-2025-comptes.md`, `bareme-comptes-013-2025.ts`), une colonne par référentiel ; un test relit chaque numéro proposé dans son semis (détail, 21 à 24), exige les 131 natures et que le fichier committé soit celui que la source engendre. Dans les deux sens (D-4) · la nature propose son ou ses comptes du plan du dossier, le premier en tête (« Compte proposé », un clic) ; le compte ne propose que ses natures, sous-comptes du cabinet compris, repli sur les sections, « toutes les catégories » à un clic ; jamais un refus. Test navigateur aux deux référentiels |
| 2026-10-01 | 7 | Périmètre fixé (D-15, D-16). Livré · « Recevoir un legs » (`POST /immobilisations/legs`, `legs-immobilisations.ts`), SYCEBNL seul, fonds 167 hors 1679, dettes au 4861 sous la valeur des biens ; une fiche et une pièce par bien, dettes au prorata ; tout ou rien (fiches et écritures retirées si un bien échoue) ; reprise du 167 au 7923 à la quote-part 167 ÷ valeur. Test navigateur sur base réelle (le 1679 refusé, 4861 et 167 aux totaux de l'acte, reprise à 392/400 de la dotation). Relevé en route · le règlement des dettes du donateur (D 4861 / C 5) reste une écriture ordinaire ; la provision 1679 / 192 relève du registre des provisions |
| 2026-10-01 | 4 | Vérifié en production · Cloud Run 460, Hosting 583, tests navigateur 228, tous verts sur ddd756c |
| 2026-10-01 | 5 | Vérifié en production · Cloud Run 461, Hosting 584, tests navigateur 229, tous verts sur cc96b99 |
| 2026-10-01 | 6 | Poussé seul (35a0edf), le lot 7 attendant sa vérification |
| 2026-10-01 | 8 | Périmètre fixé (D-17 à D-19). Livré · « Acquisition à prix global » (`POST /immobilisations/prix-global`, `ventilation-prix-global.ts`) · ensemble terrain et bâtiment selon l'acte, sinon par comparaison avec des terrains nus (bâtiment par différence), à défaut au coût de reconstruction (terrain par différence, motif exigé), jamais au prorata ni au forfait ; autres biens au prorata des valeurs attribuables ou par un prix de marché ou un forfait, un seul par différence ; fonds de commerce (SYSCOHADA seul) · éléments à leur nature, stocks en ligne de classe 3, reliquat au 21500000 ; modalité gardée sur chaque fiche (`modaliteVentilation`) ; une pièce par bien, tout ou rien. « Remplacement imprévu » (`POST /immobilisations/:id/remplacement-imprevu`, `partie-remplacee.ts`) · partie détachée à sa valeur estimée, amortissements au prorata (`amortissementsDetaches`, retranché de tout cumul par `amortissementsHorsDotations`), renouvelée par le § 4.1 ; refusé sur un composant, aux unités d'œuvre, déprécié, au dégressif ou dérogatoire, financé par un fonds ou une subvention, ou si la dotation de l'exercice est passée. Migration `20270107000000_ventilation_prix_global`. Test navigateur sur base réelle |
| 2026-10-01 | 8 | Relevé en route · (1) le fonds commercial « n'est pas amortissable » en principe (ch. 2 § 7.2.2.1) · il ne s'inscrit ici qu'avec une durée limitée déclarée, le cas non limité attend le lot 10 ; (2) une seule contrepartie pour tout le prix · un fonds qui mêle incorporels (4811) et corporels (4812) se règle par la trésorerie, sinon refus nommé ; (3) la modalité est gardée sur la fiche mais aucune note ne l'imprime encore d'office ; (4) le texte écrit « 2151 Fonds commercial », le plan semé n'ouvre que le 21500000 ; (5) pour les exercices antérieurs au détachement, le tableau répartit les amortissements entre structure et partie autrement qu'ils l'étaient, le total restant juste |
| 2026-10-01 | 9 | Périmètre fixé (D-20, D-21). Livré · les neuf modèles du catalogue qui font entrer, dotent, déprécient un bien ou reprennent son fonds portent un renvoi au module (`renvoiModule`), refusés à la proposition comme à l'application, et l'écran dit où le geste se fait ; un test interdit à tout autre modèle une ligne de classe 2, 68, 69, 799, 7923 ou 796. Le module impose à la division 20 du SYCEBNL ses comptes de dépréciation · 2902, 6952, 7952 au bien destiné à la vente (§ 2.2.2, § 2.2.3), 2901, 6951, 7951 à l'usufruit (§ 2.3.2) (`motifRefusDepreciationDivision20`). Contrôle `AMORTISSEMENT_IMMO_HORS_MODULE`. Les chiffres des Applications 3, 5, 6 et 7 restent éprouvés au module. Test navigateur sur base réelle |
| 2026-10-01 | 10 | Périmètre fixé (D-22, D-23). Livré · incorporel à durée non limitée, non amorti (`incorporel-duree-non-limitee.ts`, `Immobilisation.dureeNonLimitee` et sa justification) ; fonds commercial sans durée présumé non limité (§ 7.2.2.1), y compris à l'acquisition à prix global du lot 8 ; dotation refusée, tableau sans annuité, contrôles muets, reprise de subvention non amortissable. Bascule prospective (`POST /immobilisations/:id/duree-limitee`) · motif et résultat du test de dépréciation exigés, décision dans un exercice ouvert, le plan part de la décision (`dateDebutAmortissement`) sur la durée résiduelle, prorata du mois, dépréciation retranchée (exemple du § 4.2.2 · 12 000 000 sur quatre ans au 1er septembre, 1 000 000 la première année). Dix ans au seul fonds commercial · durée non estimable, ou simplification du SMT (`fondementDureeDixAns`). Migration `20270108000000_incorporels_duree_non_limitee`. Test navigateur sur base réelle |
| 2026-10-01 | 10 | Relevé en route · la durée résiduelle se compte en années entières (le moteur n'a pas de mois) ; l'exemple du texte tombe juste (1er septembre N au 30 août N+4) |
| 2026-10-01 | 11 | Périmètre fixé (D-24 à D-26). Livré · « Réviser le plan » (`POST /immobilisations/:id/revision-plan`, `revision-plan-amortissement.ts`, table `RevisionPlanAmortissement`) · prospective, le plan part de l'ouverture de l'exercice de la décision sur la durée résiduelle (`dateEffetRevisionPlan`, `dureeResiduelleRevisee`, lus par `planDuBien` aux trois appels du calcul) ; rétroactive, plan linéaire rejoué sur les dotations du module, D 28 / C 798 pour la seule réduction (`reprisesAmortissement`, retranché par `amortissementsHorsDotations`), écriture retenue ; refus · bien sorti, non amortissable, non limité, aux unités d'œuvre, sous option dégressive fiscale, plan qui n'a pas couru, exercice clos, dotation de l'exercice passée, sans motif. Mode `DEGRESSIF` au SYCEBNL, au taux de la loi n° 23/053 (le moteur rend exactement `planFiscalDegressif`), refusé au SYSCOHADA, hors de quatre à vingt ans, aux incorporels et à l'usufruit, à la famille comme au bien ; une révision qui sortirait le plan de ces bornes est refusée. Migration `20270109000000_revision_plan_amortissement`. Test navigateur sur base réelle |
| 2026-10-01 | 11 | Relevé en route · (1) la révision rétroactive ne rejoue que le linéaire passé par le module · bien repris, partie détachée, dépréciation ou autre mode, voie prospective seule ; (2) la durée totale affichée après une révision prospective compte les années entières courues (le moteur n'a pas de mois) ; (3) le taux du dégressif se relit sur la durée totale révisée ; (4) aucune note annexe n'imprime encore d'office les révisions, gardées et servies par `GET /immobilisations/:id/revisions-plan` |
| 2026-10-01 | 6 | Vérifié en production · Cloud Run 462, Hosting 585, tests navigateur 230, tous verts sur 35a0edf |
| 2026-10-01 | 7 | Vérifié en production · Cloud Run 463, Hosting 586, tests navigateur 231, tous verts |
| 2026-10-01 | 8 | Vérifié en production · Cloud Run 464, Hosting 588, tests navigateur 233 sur 8097109 ; le run 232 était rouge sur la limite de débit des tests (connexions de trois tests sous une même adresse), corrigée par une adresse par dossier dans `e2e/tests/outils.ts` |
| 2026-10-01 | 9 | Vérifié en production · Cloud Run 465, Hosting 589, tests navigateur 234, tous verts sur 2799a1d |
| 2026-10-01 | 10 | Vérifié en production · Cloud Run 466, Hosting 590, tests navigateur 235, tous verts sur 5f998d7 |
| 2026-10-01 | 11 | Vérifié en production · Cloud Run 467, Hosting 591, tests navigateur 236, tous verts sur 80ebd58 (qui porte 874598f) |
| 2026-10-01 | 12 | Livré · plafond de reprise d'une dépréciation (AUDCIF Titre VIII ch. 12 § 2.4.2, aux deux référentiels par l'art. 46 et la fiche du compte 29 du SYCEBNL) · la reprise ne dépasse ni le cumul inscrit ni l'écart entre la valeur sans dépréciation et la valeur nette en fin d'exercice (`plafond-reprise-depreciation.ts`) ; la valeur sans dépréciation rejoue le même moteur exercice par exercice, dépréciation nulle, même plan (`planDuBien`), même amortissement antérieur, même prorata (`plafondRepriseDe`) ; la dotation de l'exercice entre, passée ou due (« après amortissement et reprise ») ; bien sans dotation · plafond = cumul. Exemple du texte éprouvé (30 000 000, dix ans, 4 000 000 de perte · 15 000 000, 18 000 000, reprise au plus 3 000 000). Route `GET /immobilisations/:id/plafond-reprise-depreciation`, plafond montré à la saisie d'une reprise. Aucune table. Test navigateur sur base réelle |
| 2026-10-01 | 12 | Relevé en route · (1) le § 2.4.3 a) interdit toute reprise de la dépréciation d'un écart d'acquisition affecté à un groupe d'actifs · le module ne tient pas de groupe d'actifs (hors plan), rien codé ; (2) la fiche du compte 29 du SYCEBNL renvoie à « titre VIII, chapitre 13 », chapitre du portefeuille-titres · renvoi signalé dans le code, non corrigé ; (3) aux unités d'œuvre, le plafond d'un exercice sans relevé exige le relevé, comme la dotation |
| 2026-10-01 | 12 | Vérifié en production · Cloud Run 468, Hosting 593, tests navigateur 238, tous verts sur 96adf1d |
