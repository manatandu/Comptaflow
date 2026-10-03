# Ligne A5 bis · la contre-passation ne touche pas les disponibilités

Branche de sauvegarde · `travail/a5bis`. Part de `main` (8e15ce7).

## Défaut

`DevisesService.extourner` contre-passait à l'ouverture de l'exercice suivant
TOUTES les lignes de l'écriture des écarts, y compris celles des
disponibilités en devise (52, 53, 55, 57, 58) et de leur contrepartie
676 / 776.

## Lu (règle n° 1)

- AUDCIF art. 54 · créances et dettes, écarts au 478 / 479, latents.
- AUDCIF art. 57 · disponibilités, « les écarts constatés sont inscrits
  directement dans les produits et charges de l'exercice comme gains ou
  pertes de change ».
- Titre VIII ch. 22 § 2.2 · disponibilités exclues de la position globale,
  « les écarts de change étant comptabilisés immédiatement en résultat » ;
  section 4 · « inscrit directement dans les produits et charges financiers
  de l'exercice clos ».
- Fiche du compte 676 (AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3) · écarts
  négatifs sur disponibilités = « pertes de change supportées », 676 « ne
  doit pas être confondu avec le compte 478 ».
- Fiche des comptes 478 / 479 (AUDCIF et SYCEBNL) · « pertes et gains
  latents », « entre créances et dettes en devises ».
- Guide SYSCOHADA, Partie 2 ch. 22 · Application 84 (contre-passation au
  01/01/N+1 : 411 · 4781, 4791 · 411), Application 85 (4793 · 4812),
  Application 86 (disponibilités · 676
  / 5215, « sans écart de conversion », aucune contre-passation).

Décision · ne se contre-passent que l'écart de conversion (478, 479 et le
compte de tiers qu'il ajuste) ; rien des disponibilités.

## Fait

1. `extourner` ne contre-passe que l'écart de conversion · partage par la
   RACINE (`ecarts-disponibilites.ts`, `partagerLignesDEcarts` · 52, 53,
   55, 57, 58 et 676 / 776 restent), deux parts équilibrées sinon refus
   nommé ; réévaluation des seules disponibilités · refus nommé (rien à
   contre-passer).
2. La banque part en N+1 de sa valeur de clôture de N · l'écart de chaque
   disponibilité est gardé (`Reevaluation.ecartsDisponibilites`, migration
   `20270124000000`) et `calculer` l'ajoute à la valeur comptable par
   `ecartsReportesDesDisponibilites`, en remontant les reports d'OmegaX
   (SOLDE et DÉTAIL), jamais par libellé. Réévaluation antérieure sans
   écart gardé · relu sur son écriture (une seule devise sur le compte, ou
   cours gardé D5 et somme au centime), sinon réserve et passage refusé.
   À-nouveau provisoire antérieur à la validation de l'écart · réserve.
   Ancien régime (contre-passation qui a inversé la banque) · rien reporté,
   total juste (gain N+1 net de la contre-passation).
3. `reevaluerSousVerrou` refuse tant que la réévaluation de l'exercice
   précédent porte un 478 / 479 non contre-passé (Applications 84 et 85),
   issue nommée.
4. Contrôle 34 (A13 tient le 32 et le 33) `CONTRE_PASSATION_DE_DISPONIBILITE` (INFORMATION) · les
   anciennes contre-passations qui ont inversé une banque ou une caisse,
   issue selon l'exercice de la réévaluation (D6 si ouvert ; sinon au
   cabinet, sans repasser la ligne de la banque à la main).
5. Commentaire de `report-a-nouveau.ts` mis à jour.

Décision non tranchée par le texte, retenue · la valeur de la banque en
N+1 se lit par la chaîne des réévaluations, l'à-nouveau ne portant pas
l'écart sur la ligne de sa devise (écart passé sans devise, F55).

6. Rattachée à main 5d388c0 (A11, A13, A10) par un merge · doublures
   `reevaluation.findMany` posées aussi dans les specs d'A13 ; migration
   renumérotée `20270124000000` ; `prisma migrate diff` sur base jetable ·
   « No difference detected ». A13 reconnaît la contre-passation par
   liaison, elle ne porte simplement plus de ligne de banque.

## Premier tour de relecture (2026-10-03) · corrigé

- M4 · citations · Application 84 (« 411 · 4781 »), 85 (« 4793 · 4812 »),
  86 ; anomalie « Selon l'article 58 » de la section 4 signalée (la règle
  est à l'art. 57).
- B1 · une réévaluation antérieure n'enferme plus le dossier · (a) devise
  nulle en devise ET en francs ignorée ; (b) à défaut du cours gardé, cours
  de la table à sa date, vérifié au centime ; (c) à défaut, VENTILATION
  DÉCLARÉE par devise avec sa source (`POST
  /devises/reevaluations/:id/ventilation-disponibilites`, update unitaire au
  journal d'audit, sous le verrou, ouverte même sur exercice clos, refusée
  si la ligne se relit, figée dès qu'une réévaluation postérieure l'a lue) ;
  (d) la réserve nomme la déclaration, l'annulation seulement si l'exercice
  est ouvert. Relecture du compte TEL QU'IL ÉTAIT (saisi avant elle, sauf
  l'à-nouveau du début ; lignes alors ouvertes).
- M5 · sommes par `groupBy` (compte, devise, sens), comme
  `lireComptesDuReport`.
- M3 · « relancez l'à-nouveau provisoire, ou clôturez l'exercice
  précédent » ; « validez » seulement si l'écriture des écarts est au
  brouillard.
- `extourner` n'écrit plus `ecartsDisponibilites` · nul = ancien régime.
- M1 · `extourner` n'accepte que l'exercice qui suit IMMÉDIATEMENT ; le
  portillon vérifie que la contre-passation est dans l'exercice réévalué ;
  issue d'une contre-passation mal placée · `POST
  /devises/reevaluations/:id/contre-passation/annuler` (motif, réservée au
  comptable, brouillard supprimé filtré sur le statut, validée en négatif,
  update unitaire, trace `annulationsContrePassation`) ; le report ne tient
  une inversion pour faite que dans l'exercice qui suit.
- B3 · `reporterAuPremierJourOuvert: true` (art. 22, 4°), dit au portillon.
- B2 · exercice suivant réévalué sous l'ancien régime · contre-passation
  INTÉGRALE imposée, dite au libellé et dans la réponse
  (`contrePassationIntegrale`) · banque N+1 1 505 000 et non 1 605 000,
  gain N+1 41 000 et non 141 000 (test chiffré).
- M2 · écriture qui ne se partage pas · contre-passation intégrale à
  demander (`integrale`), refusée ailleurs.
- M6 · `extourner` sous le verrou, lien par update unitaire.
- M7 · contrôle 34 · phrase de l'exercice clos seulement s'il l'est ;
  préalables de D6 nommés ; intégrale par exception dite.
- M8 · Devises · « Rien à contre-passer » pour les seules disponibilités,
  bouton vers l'exercice qui suit immédiatement (servi par le serveur,
  `contrePassationAPasser`, `exerciceDeContrePassation`), bulle (art. 57),
  « Annuler la contre-passation », « Ventiler l'écart des disponibilités ».

Migration `20270124000000` complétée (six colonnes, non encore sur main) ;
`prisma migrate diff` · « No difference detected » ; formes de requête
éprouvées sur base jetable (filtre JSON DbNull, update à filtre étendu,
groupBy à référence de champ).

Rattachée à main f4ab9bb. Bloc du § 3 passé après le second tour · serveur 10005
tests (`npx jest --maxWorkers=2`), client 1698, typages et constructions.

## Second tour de relecture (2026-10-03) · corrigé

- B-I · l'inversion de la banque par une contre-passation se lit dans TOUT
  exercice traversé depuis la cible (`parcourus`), pas dans le seul
  exercice qui suit · contre-passation de N posée en N+2, ou N+1 clôturé
  sans réévaluation · banque de N+2 à 1 600 000 et non 1 500 000 (deux
  variantes chiffrées). Contrôle 34 · plus de « le résultat net en sort
  juste » · le résultat cumulé, une fois la réévaluation passée.
- B-II · `cibleDeContrePassation` · l'exercice qui suit immédiatement s'il
  est ouvert, sinon le premier ouvert après des clôturés (la
  contre-passation du 478, du 479 et des tiers ne touche que le bilan) ;
  `extourner`, la liste, `lib/contre-passation.ts` et Devises s'y alignent.
  Le portillon lit la DERNIÈRE réévaluation non annulée antérieure, à
  travers les exercices sans réévaluation, nomme la cible, et tient une
  contre-passation pour à sa place au plus tard dans l'exercice réévalué
  sans exercice ouvert entre la réévaluation et elle · 411 à 2 600 000 (et
  non 3 100 000), 479 à −600 000 (et non −1 100 000). B2 se lit sur
  l'exercice qui reçoit la contre-passation.
- m1 · la ventilation ne porte que les devises lues sur le compte, toutes
  déclarées ; chaque montant borné par ce que le calcul permet (valeur du
  signe du montant en devise, cours positif ; devise soldée · l'opposé de
  ses francs), rien au-delà (cours d'alors non gardé, aucun texte), dit ;
  l'écran montre le cours implicite.
- m2 · l'issue du contrôle 34 se règle sur l'exercice qui PORTE la
  contre-passation (ouvert · « Annuler la contre-passation » puis la
  repasser ; clôturé · la phrase d'avant).
- m3 · le contrôle 32 écarte la contre-passation annulée et son négatif,
  nommés par `annulationsContrePassation`.

## Troisième tour (2026-10-03) · corrigé

Relu · compétence `syscohada`, Partie 2 ch. 22 · « Écarts de conversion à
la clôture (478 actif / 479 passif), contrepassés à la réouverture » ;
Application 84 (« Contrepassation de l'écart au 01/01/N+1 : 411 · 4781 »,
« 4791 · 411 »), Application 85 (« 4793 · 4812 »), Application 86 (aucune
contre-passation des disponibilités). Cité tel quel dans le module.

- BLOQUANT · le portillon juge TOUTES les réévaluations non annulées
  antérieures (cinquante au plus, tri stable, dépassement dit avec la
  réévaluation passée) par la même règle · écart de conversion non
  contre-passé, ou contre-passation hors de sa place. Le refus nomme
  l'exercice, la date et les montants à contre-passer, et les deux issues.
  Scénario s11 chiffré · N+2 refusé en nommant N ; N contre-passée dans
  N+2 · 411 à 2 600 000, 479 à −600 000.
- PORTE · une contre-passation faite à la main se DÉCLARE (`POST`, `DELETE`
  `/devises/reevaluations/:id/contre-passation-manuelle`, réservées au
  comptable ; candidates proposées par `GET .../candidates`, bornées). Le
  serveur vérifie · inversion exacte au centime de chaque compte de l'écart
  de conversion (autres comptes admis) ; place (exercice après la
  réévaluation, aucun ouvert entre les deux) ; ni liée à une réévaluation,
  ni déjà déclarée, ni neutralisée, ni engendrée par la clôture ; même
  dossier. Au journal d'audit (motif, date, auteur), écriture RETENUE
  (`detenteurs-ecriture.ts`, RESTRICT). Couverte, la réévaluation est
  contre-passée pour le portillon, le contrôle 34 (banque inversée par
  l'OD déclarée, compte par compte) et `calculer` (banque revenue au coût
  historique, compte par compte). Retrait tant qu'aucune réévaluation d'un
  exercice commençant au plus tôt avec celui de l'écriture ne s'y appuie.
  `extourner` et l'annulation D6 refusent une réévaluation déclarée, issue
  nommée. Écran · « Déclarer une contre-passation manuelle » et « Retirer la
  déclaration » sous `peutValider`. Migration `20270124000000` complétée.
- Mineur 1 · une réévaluation sans écart de conversion n'est plus jugée sur
  sa place ; contrôle 34 · « rien à repasser » au lieu de « repassez-la ».
- Mineur 2 · un champ vide de la ventilation est refusé avant l'envoi
  (`lib/ventilation-disponibilites.ts`), « tapez 0 ».
- Mineur 3 · traces des contre-passations annulées lues dans un ordre
  stable ; le contrôle 32 dit la lecture bornée.

Bloc du § 3 passé après le troisième tour (main f4ab9bb contenu) · serveur
715 suites, 10048 tests (`npx jest --maxWorkers=2`, deux suites tuées par
manque de mémoire repassées seules), typage et construction ; client 209
fichiers, 1708 tests, typage et construction. `prisma migrate diff` · « No
difference detected » ; formes de requête nouvelles éprouvées sur base
jetable migrée (filtre de relation sur l'exercice, `OR` sur les deux
contre-passations, `is: null` sur les liens, update à filtre étendu).

## Quatrième tour (2026-10-03) · corrigé

Relu · AUDCIF art. 34 (« le bilan d'ouverture d'un exercice doit
correspondre au bilan de clôture de l'exercice précédent ») ; SYCEBNL
art. 16, 4), même phrase, son art. 3 écartant l'art. 34 ; AUDCIF art. 20,
al. 2 et 3 ; Guide, Partie 2 ch. 22, Application 84 (« 411 · 4781 »,
« 4791 · 411 »).

- BLOQUANT 1 (sh1) · l'inversion se porte du côté OPPOSÉ, en montants
  positifs, rien du côté de l'écart (`motifRefusInversion`) ; une
  inscription en négatif (`corrigeEcritureId`) est refusée à la
  déclaration, et ni elle ni l'écriture qu'elle corrige ne sont proposées
  (correction, négatif D6, contre-passation annulée). Déclaration refusée
  si une autre écriture hors module touche l'écart (doublon compris).
  Base réelle · 411 à 2 400 000, 479 à −400 000. Variante D6 au spec.
- BLOQUANT 2 · `manuellesSurLEcart` lit, dans la fenêtre de la
  contre-passation, les lignes hors module (ni à-nouveau, ni liées à une
  réévaluation, ni paire neutralisée) sur le 478 / 479 de l'écart et
  l'ouverture du premier exercice ; `motifManuellesSurLEcart` en tire une
  seule règle, servie à `extourner`, au portillon et à l'écran
  (`motifHorsModule`) · OD exacte, « déclarez-la » (sm · 2 400 000,
  −400 000) ; autres lignes, nommées, « corrigez-les », une OD groupée ne
  se déclare pas, une contre-passation par réévaluation (sk · 2 600 000,
  −600 000) ; ouverture qui ne porte pas l'écart, « rétablissez-le par une
  OD, puis contre-passez » (m1 · 3 200 000, −100 000), l'OD de
  rétablissement exacte admise seulement si l'ouverture ne porte pas
  l'écart (sinon elle le doublerait). Le 409 d'`extourner` sur une
  déclarée dit de CORRIGER l'écriture. Retrait refusé si l'écriture
  déclarée est dans un exercice clôturé (sr · 2 600 000, −600 000).
- m2 · « Annuler la contre-passation » sur une déclarée nomme la
  déclaration et « Retirer la déclaration ». m3 · le retrait exige un
  motif, gardé avec la déclaration retirée (`retraitsContrePassationDeclaree`,
  migration complétée). m4 · lecture périmée jetée par jeton au succès et
  à l'échec, Échap ferme la modale. m5 · contrôle 34, une OD groupée
  corrigée · repasser les autres gestes.

Rejoué sur ma grappe (55439, port 8192) · sh1, sm, sk, sr, s11, sf (net
puis rétablissement, net puis contre-passation refusée, brut), sf3 · toutes
les vérifications passent ; serveur arrêté, base supprimée.

Bloc du § 3 passé après le quatrième tour · serveur 715 suites, 10067
tests (`npx jest --maxWorkers=2`), typage et construction ; client 209
fichiers, 1709 tests, typage et construction. `prisma migrate diff` · « No
difference detected ».

## Cinquième tour (2026-10-03) · une seule règle, fondée sur l'état réel

Relu · AUDCIF art. 34 et SYCEBNL art. 16, 4) (correspondance du bilan
d'ouverture et de clôture) ; AUDCIF art. 20, al. 2 (inscription en
négatif) ; Guide, Partie 2 ch. 22, « Écarts de conversion à la clôture
(478 actif / 479 passif), contrepassés à la réouverture », Applications 84
(« 411 · 4781 », « 4791 · 411 ») et 85 (« 4793 · 4812 »).

Décision du coordinateur · la reconnaissance d'écritures (`manuellesSurLEcart`,
`porteLEcart` sur le seul 47, branches « exactes » et « rétablissement »)
est RETIRÉE. Une règle (`etatDeLEcart`, jugée par `jugerLEtat`,
`contre-passation-manuelle.ts`) sert `extourner`, le portillon, la
déclaration et l'écran (`motifHorsModule`) ; le contrôle 34 nomme une issue
que « Contre-passer » rejuge sur elle.

- LE LU · le 478 et le 479 de l'écart à leur SOLDE dans la cible, à
  l'instant du geste · ouverture fiable de la cible (à-nouveau de clôture
  ou bilan importé) et ses écritures, sinon la clôture reconstituée de
  l'exercice précédent, brouillard compris, en remontant jusqu'à une
  ouverture fiable (même lecture que `ouverturesDe`), jamais l'à-nouveau
  provisoire. Le TIERS par sa seule part qui ne soit pas une opération
  (`ecartTiers`) · l'écart entre son ouverture fiable et la clôture
  précédente (art. 34), plus les mouvements des écritures hors module qui
  touchent le 478 ou le 479 de l'écart depuis la réévaluation.
- L'ATTENDU · les écarts du module en place (non annulés, ni contre-passés
  ni déclarés au plus tard dans la cible), plus les écarts passés HORS du
  module avant la cible, dans le sens de l'écart, qui ne l'inversent pas
  (un autre écart, légitime, sur le même 4791 · X1).
- LE JUGEMENT · l'état comparé compte par compte à l'attendu moins un
  sous-ensemble d'écarts déjà contre-passés (recherche exhaustive, douze
  écarts au plus) · EN_PLACE (le module passe), CONTRE_PASSEE (le module
  refuse, la déclaration de l'écriture exacte est admise), AMBIGU (deux
  écarts de mêmes comptes et montants · l'écriture exacte se déclare pour
  l'un ou l'autre), ANOMALIE.
- L'ISSUE PROUVÉE · essayés dans l'ordre, rejugés · aucun geste ;
  rétablir l'écart quand l'ouverture l'omet exactement, sur tous ses
  comptes ; corriger les écritures qui portent le 478 ou le 479 contre un
  compte étranger, puis toutes celles qui n'inversent pas, puis toutes
  sauf une exacte, puis toutes, avec et sans rétablissement. Le message
  chiffre l'attendu et le solde du 47, la part du tiers, et ne dit que
  l'issue qui mène à EN_PLACE (« contre-passez ») ou à CONTRE_PASSEE avec
  une écriture exacte (« déclarez la pièce n° … ») ; à défaut,
  « rapprochez » (art. 34 nommé si l'ouverture ne correspond pas).
- LA DÉCLARATION · admise seulement si l'état, l'écriture comprise, se lit
  CONTRE_PASSEE (ou AMBIGU) et qu'elle inverse exactement, tiers compris,
  en montants positifs ; elle peut être DANS l'exercice réévalué, au plus
  tôt à la date de la réévaluation (X3), et le portillon la tient alors
  pour à sa place. Négatifs, écritures corrigées, retrait · inchangés.

ÉCART ASSUMÉ, RAISONNÉ · le coordinateur demandait le SOLDE du tiers. Il
mêle l'écart aux factures et règlements de l'exercice, que rien ne
sépare · comparé à l'attendu, il ferait refuser tout dossier qui facture
en N+1. Le tiers est donc lu par sa part d'écart (ouverture contre
clôture, écritures qui touchent le 47 de l'écart) · ce qui l'a attrapé
dans X4 (rétablissement contre la banque ou un autre client) et X2
(ouverture nette).

Chiffré sur base réelle (ma grappe 55439, serveur 8192, base a5bis_t5),
fin N+1 puis N+2 :

- X1 (autre écart EUR sur le même 4791) · CP EUR puis module ; CP EUR et
  CP USD déclarée ; OD groupée refusée, corrigée, puis module ; module
  d'abord (X1 bis inverse) ; CP EUR corrigée puis module (X1 bis cachée) ·
  411 3 400 000, 479 −400 000 ; N+2 · 3 600 000, −600 000. X1c (EUR au
  4781) · 3 400 000, −400 000, 478 0.
- X2 seule · refus « rétablissez, puis déclarez la pièce » ; suivi ·
  3 200 000, −100 000. X2 rétablie · déclarée · 3 200 000, −100 000.
- X3 (CP passée dans N, N ouvert ou clos) · module refusé « déclarez-la » ;
  déclarée · 2 400 000, −400 000 ; N+2 · 2 600 000, −600 000.
- X4 (banque, autre client) · refus « corrigez la pièce, rétablissez,
  puis contre-passez » ; suivi · 41110000 3 200 000, 479 −100 000,
  banque 0.
- X5 · limite CHIFFRÉE · import qui omet l'écart USD et porte un écart
  EUR que N ne connaît pas · le module REFUSE (« rapprochez », ouverture
  4791 −100 000 et 411 +3 100 000 contre la clôture de N) ; après la CP
  EUR à la main, 411 5 000 000 et 479 0 (le 4 500 000 du tour précédent
  ne se produit plus) ; N complété (vente et écart EUR en N), l'issue
  devient « rétablissez, puis contre-passez », suivie · 5 000 000, 0.
  N clos, reprise USD à la main dans N · « déclarez » ; déclarée ·
  5 400 000, −400 000 ; N+2 · 5 600 000, −600 000.
- X6 (D6, CP annulée) · rien de proposé, négatifs refusés, module ·
  2 400 000, −400 000. X7 · 16 sur 16. X8 (deux OD séparées, dans les
  deux ordres) · déclarées tour à tour · 2 600 000, −600 000.
- Tours précédents · sh1, sm, sk (refus « corrigez la pièce n° 21 »,
  sk-t5 · 9 sur 9, 2 600 000, −600 000 ; les expressions de sk.mjs
  attendaient le libellé du quatrième tour), sr, s11, sf (net puis
  rétablissement · 3 200 000, −100 000 ; net puis contre-passation ·
  refusée, issue « rétablissez » ; brut), sf3 · justes.
- Bords · doublon exact (refus « corrigez la pièce n° 3, puis déclarez
  la pièce n° 2 », suivi · 2 400 000, −400 000) ; CP partielle de
  300 000 dans N (« inversez-la à l'ouverture, puis contre-passez »,
  suivi · 2 400 000, −400 000) ; écart EUR de N+1 passé AVANT la
  contre-passation de N (refus, issue suivie · 3 500 000, −500 000) ;
  SYCEBNL (41200000, 47911000) · déclarée, 2 400 000, −400 000.

En tout, 33 scénarios et 174 vérifications passées (script `tout.sh` du
répertoire de travail), plus le refus attendu de sf « net puis
contre-passation » ; serveur arrêté, base supprimée.

Bloc du § 3 passé après le cinquième tour · serveur 715 suites, 10080
tests (`npx jest --maxWorkers=2`), typage et construction ; client 209
fichiers, 1709 tests, typage et construction. Aucun changement de schéma
ni de migration à ce tour.

## Vérification finale (2026-10-03) · corrigé

Relu · AUDCIF art. 34 et SYCEBNL art. 16, 4) (correspondance des bilans) ;
AUDCIF art. 69 et SYCEBNL art. 16, 2) (« l'entité détermine, sous sa
responsabilité, les procédures nécessaires ») ; AUDCIF art. 57 (écart des
disponibilités réalisé) ; art. 20, al. 2 (inscription en négatif) ; Guide,
Partie 2 ch. 22, Applications 84 et 85 (contre-passation à la réouverture).

1. BLOQUANT · UNE FENÊTRE, UNE OUVERTURE. `lu47` se lisait par la chaîne de
   la cible jusqu'à sa dernière ouverture fiable ; `ecartTiers` par l'écart
   de cette SEULE ouverture. N+1 clôturé repris sans l'écart puis N+2 ouvert
   par l'à-nouveau de N+1 · 47 sans écart, tiers avec, refus « aucune
   correction ne se déduit ». Une lecture (`lireLaFenetreDeLEcart`) · base
   = clôture reconstituée de N avant la date de la réévaluation, puis les
   mouvements de la fenêtre (`dansLaFenetre`, borne partagée avec la liste
   hors module), chaque ouverture fiable de la fenêtre confrontée au solde
   qui la précède et ces écarts SOMMÉS, pour le 47 comme pour le tiers. Le
   solde du 47 est inchangé (même nombre que la chaîne). Spec · omission
   dans N+1 clôturé · « rétablissez … par une OD à l'ouverture de la
   cible, puis contre-passez », échouait avant. Doublures des specs de
   contre-passation et de report honorant la fenêtre ; doublure du contrôle
   d'ancienneté (A7 ter) complétée (`reevaluation.findMany`).
2. ATTESTATION · `POST` / `DELETE /devises/reevaluations/:id/attestation-etat`
   (`@Roles` comptable et administrateur, `@ReserveAuComptable()`, verrou du
   dossier, `update` unitaire filtré au journal d'audit), motif de 10 à 500
   caractères, auteur et date posés par le serveur ; retrait motivé, trace
   dans `retraitsAttestation`, refusé si une contre-passation, une
   déclaration ou une réévaluation postérieure a été passée depuis
   l'attestation. Attestée · les refus de la règle d'état deviennent des
   avertissements (contre-passation, portillon, déclaration, candidates),
   SAUF · la banque seule (art. 57, B-I), la seconde contre-passation par le
   module (état CONTRE_PASSEE ou AMBIGU, ouverture qui omet l'écart
   comprise), la déclaration d'une inscription en négatif. Écran · bouton
   « Attester l'état de l'écart » / « Retirer l'attestation » sous
   `peutValider`, modale par `PortailModale`, Échap par `ecouterEchap`,
   avertissement affiché (`lib/attestation-etat.ts`).
3. L1 · une réévaluation du module passée dans la cible avec l'écart en
   place (son écart sur le 478 / 479) · le jugement est rejoué sans elle ;
   s'il rend la contre-passation juste, le message dit dans l'ordre ·
   (1) annuler la réévaluation postérieure (D6), (2) contre-passer,
   (3) réévaluer de nouveau. Lecture d'éditeur · L1 n'était pas écrit ici,
   interprété comme ce cas.
4. m5 · Échap ferme « Ventiler » (sauf pendant l'envoi) et « Annuler ».

Bloc du § 3 · `prisma generate`, typage, serveur 719 suites, 10168 tests
(`npx jest --maxWorkers=3`, specs du client compris), construction ; client
210 fichiers, 1719 tests, typage et construction. `prisma migrate diff` sur
base jetable · « No difference detected ».

POUSSÉE · le premier commit de cette vérification (4bb7bed) est sur
`travail/a5bis` ; les suivants n'ont pas pu être poussés (refus de
l'environnement), ils sont dans la copie locale.

## Reste

- Relectures (silent-failure-hunter, typescript-reviewer, react-reviewer)
  à l'intégration.
- Scénario sur vraie base à travers une clôture pour l'attestation et L1
  (§ 10) · non rejoué à cette vérification.
- Pousser 6c21d6b et la suite sur `travail/a5bis`.
- `reglements/reevaluation-et-ecart-realise.ts` (avertissement
  d'extourne manquante, A6) ne lit que `ecritureExtourneId` · une
  contre-passation déclarée n'y compte pas encore pour faite. Laissé à
  A6 bis, qui touche ce fichier et `calculer`.
- Contrôle 32 · une OD manuelle déclarée qui inverse aussi la banque compte
  comme une opération de banque (dernière ligne d'un compte fermé) · non
  traité (l'OD peut grouper de vraies opérations de banque).
- Un bilan d'ouverture SAISI qui aurait déjà retiré l'écart de N · traité
  au quatrième tour (m1, rétablissement puis contre-passation). Hors ligne,
  au suivi du coordinateur · la double reprise de l'à-nouveau importé, la
  balance importée sans devise.
- Limites de la règle d'état (cinquième tour), écrites · (1) un écart
  hors module de l'exercice cible, passé AVANT de contre-passer N, se lit
  comme un mouvement à corriger · refus, l'issue dit de le corriger et de
  le repasser après la contre-passation (chiffré · 3 500 000, −500 000) ;
  (2) un écart hors module de N daté AVANT la date de la réévaluation, ou
  d'un exercice antérieur non contre-passé, n'est pas tenu pour en place ·
  refus « rapprochez » ; (3) une ouverture qui ne correspond pas à la
  clôture précédente autrement qu'en omettant l'écart (X5, import d'une
  créance que N ne connaît pas) · refus « rapprochez », jamais un montant
  faux ; (4) au-delà de deux cents écritures hors module sur l'écart, ou
  de douze écarts en place sur ces comptes, la lecture se dit bornée et
  aucune issue n'est déduite.
- A10 (`uniteDeLaCaisse`) écarte les écritures d'écarts de réévaluation,
  pas la part reportée en francs par l'à-nouveau · une caisse en devise
  réévaluée en N se lit « mêlée » en N+1 (déjà le cas avant A5 bis, la
  contre-passation étant elle aussi en francs). Non traité ici.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/devises src/modules/controles/contre-passation-de-disponibilite.spec.ts src/modules/controles/banque-et-cloture-informatique.spec.ts
cd client && npx vitest run src/lib/contre-passation.spec.ts src/lib/reevaluation-cloture.spec.ts src/lib/ventilation-disponibilites.spec.ts
```
