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
