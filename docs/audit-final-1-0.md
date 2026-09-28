# Audit final · liste fermée de la 1.0

**Décompte :** 270 lignes (dont F271, trouvée en corrigeant F41), obtenues à partir de 298 constats confirmés, dont 29 doublons fusionnés.

| Gravité | Lignes | Numéros |
|---|---|---|
| BLOQUANT | 49 | F1 à F48, F271 |
| AVANT_1_0 | 157 | F49 à F204, F270 |
| APRES_1_0 | 65 | F205 à F269 |

Chaque ligne donne ses références d'origine entre crochets. Quand une ligne fusionne plusieurs constats, elle prend la gravité la plus haute.

**Racines communes à plusieurs lignes :**
- **Le drapeau `estGenereeParCloture` a deux sens.** Il marque à la fois l'écriture qui solde les classes 6 à 8 et le report à-nouveau. Lignes concernées : F4, F5, F53, F78, F206.
- **Les lectures sans borne.** Lignes concernées : F185 à F190.
- **Les garanties négatives périmées.** Lignes concernées : F106, F109, F146, F165, F171.

---

## BLOQUANT

### Comptabilité générale, clôture et régularisations

**F1 · La correction par inscription en négatif ne reprend ni la ventilation analytique ni la devise** [saisie-02]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:1779, :1569 · src/modules/analytique/etats-analytiques.service.ts:88
- **Condition :** 1
- **Constat :** `corrigerParInscriptionEnNegatif` recrée les lignes en négatif sans `ventilations` ni devise. Le grand livre revient donc à zéro, mais le réalisé par section, l'état budgétaire et la balance analytique comptent encore la dépense annulée. La réimputation, elle, recopie les ventilations en négatif : le même geste a deux réponses.
- **Correction :** charger les ventilations et la devise de l'origine, les recopier en négatif, et ajouter un test où le cumul de la section revient à zéro.
- **Fait le 2026-09-27 :** la correction par inscription en négatif recopie la ventilation analytique en négatif et la devise (montant sans signe, le sens venant de la ligne) · la réimputation recopie aussi la devise (`ecriture.service.ts`). Les deux lecteurs qui déduisaient le sens du seul débit le lisent désormais sur débit moins crédit (`devises.service.ts`) ou gardent son côté à la ligne inscrite en négatif (`balance-fonctionnelle.service.ts`). Tests : `correction-negatif-service.spec.ts`, `reimputation-service.spec.ts`, `reevaluation.spec.ts`, `balance-fonctionnelle.spec.ts`.

**F2 · Import, reprise de balance, lettrage automatique et fusion de comptes : transaction interactive limitée à 5 s** [saisie-04]
- **Emplacements :** src/modules/import/import.service.ts:774, :564 · src/modules/lettrage/lettrage.service.ts:948 · src/modules/comptabilite/ecriture.service.ts:1543
- **Condition :** 4
- **Constat :** `importerEcritures` crée toutes les pièces dans une seule `$transaction` sans option, avec au moins deux allers-retours par pièce. Le dépôt a mesuré lui-même que 80 allers-retours vers Neon dépassent les 5 s par défaut (auth.service.ts:90-95). Un import de quelques dizaines de pièces échoue donc entièrement.
- **Correction :** donner à ces transactions un délai mesuré, ou découper l'import en lots avec un rapport par lot. Mesurer sur plusieurs milliers de pièces.
- **Fait le 2026-09-27 :** l'import d'écritures passe en insertions groupées (numéroteur par série `numeroteurDeLot`, têtes et lignes en tranches, délai de 120 s) et ses contrôles d'entrée partagent une mémoire de lot (`MemoireControles`, règle de période close extraite en `refuserSiPeriodeClose`) ; la reprise de balance insère ses lignes en une fois ; le lettrage automatique et la confirmation d'un pré-lettrage lisent la lettre suivante une fois (`lettresDuLot`) ; la réimputation et la fusion mettent le brouillard à jour en une requête ; les trois dernières reçoivent un délai à la mesure du volume (`delaiSelonVolume`). Mesuré sur PostgreSQL local : 12 000 pièces et 24 000 lignes importées en 2,4 s pour environ 260 requêtes (24 000 requêtes avant, pour 6 000 pièces) ; lettrage automatique de 4 000 groupes en 19 s, six requêtes par groupe, linéaire. Tests : `import-ecritures-groupe.spec.ts`, `controles-entree-memoire.spec.ts`, `lettrage.service.spec.ts`, `reimputation-service.spec.ts`.

**F3 · La numérotation CONTINUE_FICHIER est calculée sur tous les journaux mais contrôlée sur les seuls journaux en continu** [saisie-05, transv-03]
- **Emplacements :** src/modules/journaux/numerotation-piece.ts:54 · src/modules/journaux/analyse-journaux.service.ts:282 · src/modules/journaux/journal-seed.ts:29-45
- **Condition :** 1
- **Constat :** `prochainNumeroPiece` prend le maximum de toutes les écritures de l'exercice. L'analyse des journaux, elle, ne relit la séquence que sur les journaux en CONTINUE_FICHIER, et le semis ne met que OD dans ce mode. Sur tout dossier semé, chaque OD saute au-dessus des achats et des ventes, et l'état annonce des trous qui n'existent pas (§ 10 bis).
- **Correction :** filtrer l'agrégat sur `journal.numerotation = CONTINUE_FICHIER`, dans une fonction partagée avec l'analyse, et ajouter un test sur le semis réel.
- **Fait le 2026-09-27 :** le maximum de la séquence du fichier ne compte que les journaux en `CONTINUE_FICHIER`, la même définition que l'analyse des journaux (`journauxDeLaSequenceDuFichier`, `numerotation-piece.ts`). Test sur le semis réel : `casse-en-silence.spec.ts`.

**F4 · L'affectation du résultat ne voit jamais le résultat posé par la clôture** [rev-01, transv-01]
- **Emplacements :** src/modules/affectation/affectation.service.ts:380, :392, :152 · src/modules/exercice/exercice.service.ts:788-800 · src/modules/comptabilite/ecriture.service.ts:2881-2894
- **Condition :** 1 et 4
- **Constat :** l'écriture de clôture est créée au brouillard et marquée `estGenereeParCloture`. Or `soldesDuBilan` lit le 131/139 en mouvement sur une balance qui ne retient que les écritures validées, et `balance()` range ce drapeau en report. Le résultat lu vaut 0 : l'affectation est refusée (« aucun résultat à affecter ») sur tout exercice clos par OmegaX, et l'exercice suivant propose même d'imputer une perte fictive. Le spec masque le défaut avec une doublure.
- **Correction :** lire le résultat par la règle unique (`resultat-de-l-exercice.ts`) sur une balance qui inclut l'écriture de clôture, ou distinguer les deux sens du drapeau. Ajouter un test d'intégration « clôturer puis affecter » sans doublure de `balance`.
- **Fait le 2026-09-27 :** nouvelle colonne `Ecriture.estSoldeDesComptesDeGestion` (migration `20261121000000_solde_des_comptes_de_gestion`, qui rattrape les écritures déjà passées) ; les deux écritures de la clôture entrent VALIDÉES (`exercice.service.ts`, `validationParLaCloture`) ; l'affectation lit le résultat dans la colonne de clôture de la balance, sur les 131 à 139 (`affectation.service.ts`, `soldesDuBilan`). Test sans doublure : `e2e/tests/cloture.e2e.ts`, vu tomber (montant 0) défaut réinjecté.
- **Complété le 2026-09-28 :** l'écriture qui solde les classes 6 à 8 entrant VALIDÉE, les états lisaient sur tout exercice clos des comptes de gestion soldés · compte de résultat à zéro, colonne N-1 du suivant comprise. `chargerLignes` et la feuille BALANCE des liasses (`lignesBalanceLiasse`) lisent la balance avant ce solde (`avantSoldeDesComptesDeGestion`, `balance-trois-colonnes.ts`). Tests : `balance-trois-colonnes.spec.ts`, `liasse-syscohada.spec.ts`, et `cloture.e2e.ts` sur la base réelle, vu tomber à zéro défaut réinjecté.
- **Complété le 2026-09-28, lecteurs du livre-journal :** dix lecteurs lisaient encore les classes 6 à 8 au total, et sortaient à zéro ou se taisaient sur tout exercice clos. Ils lisent désormais avant le solde de clôture (`avantSoldeDesComptesDeGestion`, `chargerLignes`) ou posent `estSoldeDesComptesDeGestion: false` · l'évolution des soldes (`ecriture.service.ts`), le résultat fiscal, qui retombait sur un 13 portant aussi le bénéfice de N-1 non affecté, et ses propositions de retraitement (`fiscalite.service.ts`), le dossier de révision, les contrôles du 637, du 613 et des stocks (`controles.service.ts`), le contrôle des cumuls analytiques, qui listait le solde « à ventiler », le prorata de TVA, qui comptait le crédit de clôture du 709 comme recette, et la balance de la consolidante (`cumul.service.ts`). Le test des écritures de journal ne compte plus les écritures que la clôture engendre parmi les usages d'un compte. Chaque lecteur a son test sur un exercice clos, vu tomber sans le correctif : `evolution-soldes.spec.ts`, `fiscalite.spec.ts`, `propositions-retraitements.spec.ts`, `dossier-revision.spec.ts`, `personnel-exterieur-non-vire.spec.ts`, `indices-minoration-dgi.spec.ts`, `stocks-production-immobilisee.spec.ts`, `controle-cumuls-f186.spec.ts`, `prorata-solde-cloture-f4.spec.ts`, `cumul.service.spec.ts`, `test-ecritures-journal.spec.ts`.

**F5 · Sur un exercice clos, la balance présente l'écriture de clôture comme solde d'ouverture** [pages-01, transv-02]
- **Emplacements :** client/src/pages/JournalPage.tsx:874, :820 · src/modules/comptabilite/ecriture.service.ts:2888 · src/modules/exercice/exercice.service.ts:792 · src/modules/exports/export.service.ts:895, :939
- **Condition :** 1
- **Constat :** `balance()` range en report toute écriture marquée `estGenereeParCloture` de l'exercice, y compris l'écriture qui solde les classes 6 à 8 et qui est datée de la fin de l'exercice clos. L'écran (« Solde d'ouverture ») et le classeur (« Solde avant période ») affichent donc une ouverture fictive sur toute la classe 6 à 8 et sur le 13. Le commentaire de la page dit le contraire.
- **Correction :** distinguer l'à-nouveau de l'écriture de clôture de l'exercice (par la date ou par un marqueur) et ne ranger que le premier en ouverture. Ajouter un spec sur un exercice clôturé.
- **Fait le 2026-09-27 :** `balance()` rend trois colonnes, report, mouvement et clôture (`clotureDebit`, `clotureCredit`) ; l'écran (`client/src/lib/mouvements-du-journal.ts`), le classeur de la balance et la feuille BALANCE de la liasse (`export.service.ts`) lisent la clôture avec les mouvements. Tests : `balance.spec.ts`, `formules-excel.spec.ts`, `liasse-syscohada.spec.ts`, `mouvements-du-journal.spec.ts`, `cloture.e2e.ts`.

**F6 · La clôture annuelle n'exige pas que l'exercice précédent soit clos** [rev-04]
- **Emplacements :** src/modules/exercice/exercice.service.ts:687-712, :805-829
- **Condition :** 1
- **Constat :** on peut clôturer 2026 avant 2025. Le report vers 2027 est alors calculé sans les soldes de 2025, puis la clôture de 2025 écrit son report dans 2026 déjà clos par `tx.ecriture.create`, sans contrôle. Enfin, le message « validez-les ou supprimez-les » vise un report provisoire que ni `valider` ni `supprimer` n'acceptent.
- **Correction :** refuser la clôture tant qu'un exercice antérieur est ouvert, refuser tout exercice suivant déjà clos, et adapter le message.
- **Fait le 2026-09-27 :** `cloturer` refuse tant qu'un exercice antérieur est ouvert, et quand un exercice postérieur est déjà clos (`exercice.service.ts`). Le report provisoire resté dans l'exercice ne peut plus se présenter · la clôture de l'exercice précédent, désormais obligatoire d'abord, le remplace. Tests : `cloture-annuelle.spec.ts`, `cloture.e2e.ts`.

**F7 · Une clôture de période définitive peut être posée sans borne de date ni confirmation** [rev-05]
- **Emplacements :** src/modules/exercice/exercice.service.ts:522-535 · client/src/pages/ExercicePage.tsx:205-220, :660-670
- **Condition :** 3
- **Constat :** `clorePeriode` accepte n'importe quelle `dateLimite` et crée une clôture non annulable, alors que `cloreTotale` borne la date à l'exercice. Une faute de frappe sur l'année fige définitivement la saisie, le lettrage et la ventilation de tout le dossier, sans retour possible.
- **Correction :** appliquer la même borne que la clôture totale et demander une confirmation qui nomme la date et le caractère définitif.
- **Fait le 2026-09-27 :** la clôture de période est bornée à l'exercice au serveur (`exercice.service.ts`, `clorePeriode`), et l'écran demande une confirmation qui nomme la date et le caractère définitif (`client/src/lib/cloture-periode.ts`), la date limitée à l'exercice. Tests : `cloture-annuelle.spec.ts`, `cloture-periode.spec.ts`.

**F8 · Les échéances d'abonnement sautent février (« ajouter N mois » réécrit quatre fois)** [transv-08]
- **Emplacements :** src/modules/regularisation/regularisation.service.ts:629, :647 · src/modules/consolidation/perimetre-consolidation.ts:325 · src/modules/exonerations/exonerations.service.ts:138 · src/modules/accord-cadre/conditions-ong-etrangere.ts:146
- **Condition :** 1
- **Constat :** `prochaineDate` fait `setUTCMonth(+n)` sur l'échéance précédente sans borne de fin de mois. Un contrat mensuel qui commence le 31/01 passe au 03/03 : février n'a pas d'échéance et une charge manque sur l'année, sur des écritures équilibrées. La consolidation possède pourtant la bonne fonction.
- **Correction :** une fonction commune `ajouterMois` bornée au dernier jour du mois, calculée à partir de la date de début et du rang. Ajouter un spec 31/01 → 28/02.
- **Fait le 2026-09-27 :** `src/common/ajouter-mois.ts`, borné au dernier jour du mois, option fin de mois pour la consolidation. Les échéances d'abonnement se calculent depuis le début et le rang ; exonérations, accord-cadre (fin de période et dernier jour pour dénoncer), consolidation, seuil des comptes sans mouvement et bornes d'échéance des notes l'emploient. Tests : `ajouter-mois.spec.ts`, `regularisation.spec.ts`, `exonerations.spec.ts`, `accord-cadre.spec.ts`.

### États financiers, notes et documents obligatoires

**F9 · Note 30 : les colonnes de dotations et de reprises lisent le brouillard** [notes-01]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:714-722, :975-978 · correspondance-notes-associations.ts:1350-1359
- **Condition :** 1
- **Constat :** `chargerVentilationParNature` n'a pas de filtre de statut, alors que l'ouverture et la clôture de la même note viennent du livre-journal. Une dotation restée au brouillard entre dans la colonne B et pas dans la colonne D : l'égalité D = A + B − C ne tient plus.
- **Correction :** ajouter `statut: VALIDEE` et un test qui montre qu'une dotation au brouillard ne change aucune colonne.
- **Fait le 2026-09-27 :** la ventilation par nature de la note 30 ne lit que le livre-journal (`statut: VALIDEE`). Test : `note-annexe.service.spec.ts`, la doublure honorant désormais le statut.

**F10 · Échéances des notes : une créance de clôture lettrée après la clôture disparaît** [notes-02]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:792-811 · src/modules/etats-financiers/etats-financiers-smt.service.ts:695-717
- **Condition :** 1
- **Constat :** les notes 6, 9, 10, 18A et 19 à 21 écartent toute ligne lettrée, sans regarder la date du lettrage, alors que le lettrage entre exercices est permis. Une facture ouverte au 31/12 et réglée en mars sort des colonnes d'échéance sans entrer dans le montant non ventilé.
- **Correction :** tenir pour ouverte à la clôture toute ligne dont le groupe de lettrage contient une ligne postérieure à la fin de l'exercice, et calculer le non ventilé comme le reste du solde.
- **Fait le 2026-09-27 :** règle commune `lettrage/ouverte-a-la-cloture.ts` (sans lettre, ou soldée par une écriture datée après la clôture) aux notes par échéance et aux deux SMT ; le non ventilé est le reste du solde. Tests : `ouverte-a-la-cloture.spec.ts`, `note-annexe.service.spec.ts`, les deux specs SMT.

**F11 · Exécution budgétaire : la paie, les dotations et les OD restent « engagées » pour toujours** [etats-01]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet-budget.service.ts:160-176, :75-91 · client/src/pages/EtatsFinanciersPage.tsx:1030-1034
- **Condition :** 1
- **Constat :** sans trésorerie ni ligne 40 ou 481 dans l'écriture, `decaissee` vaut faux. Une paie 661/422, réglée ensuite par une écriture 422/52 non ventilée, reste donc en Engagement sur la note 24/35 remise au bailleur. C'est le contraire du commentaire et du libellé de l'écran.
- **Correction :** n'aller en Engagement que sur une ligne 40 ou 481 non lettrée, et suivre aussi le lettrage des 42 et 43. Ajouter le test d'une paie réglée.
- **Fait le 2026-09-27 :** l'engagement est le seul solde créditeur des 40 (sauf 409) et 481 à la clôture, lu par la règle de F10 ; tout le reste des débits est décaissement (`etats-financiers-projet-budget.service.ts`). ÉCART À LA CORRECTION PROPOSÉE, par la source : le Guide d'application (Application 22, (c) et (d)) ne fait entrer ni le 42 ni le 43 dans l'engagement, la paie est donc un décaissement par le débit du 66. Tests : `projet-budget.spec.ts`.

**F12 · Note 9 (fonds du bailleur) : le bilan d'ouverture d'un projet repris est exclu** [etats-02]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet.service.ts:389-397 · src/modules/comptabilite/ecriture.service.ts:2990-3033
- **Condition :** 1
- **Constat :** `noteBailleur` écarte toutes les écritures de clôture, y compris celles du premier exercice, que `balanceCumulee` garde pour cette raison précise. Le décaissé et le solde restant de la Note 9 divergent du tableau emplois ressources de la même liasse.
- **Correction :** appliquer la règle de `balanceCumulee`, ou lire la note depuis cette fonction.
- **Fait le 2026-09-27 :** la note 9 lit le cumul du projet par `balanceCumulee` (bilan d'ouverture du premier exercice compris, borné à l'exercice demandé), comme le tableau emplois-ressources. Tests : `etats-financiers-projet.service.spec.ts`.

**F13 · Paiements en instance (repère H) : la saisie de l'écran est perdue à l'export** [etats-04, exp-01]
- **Emplacements :** client/src/pages/EtatsFinanciersPage.tsx:102-164, :171-178, :187-211 · src/modules/exports/export.controller.ts:268-294 · src/modules/exports/export.service.ts:6315
- **Condition :** 1 et 3
- **Constat :** « Liasse complète » et l'export de réconciliation n'envoient pas `paiementsEnInstance`, que le serveur remplace alors par 0. Le fichier déposé ou envoyé au bailleur porte H = 0 et un I différent de l'écran. De plus, l'état de réconciliation n'est pas remis à zéro quand on change d'exercice.
- **Correction :** transmettre la valeur aux deux exports, distinguer « non renseigné » de 0, et réinitialiser l'état au changement d'exercice.
- **Fait le 2026-09-27 :** `lirePaiementsEnInstance` (absent ou vide vaut non renseigné, illisible refusé) aux trois portes ; H `null` rend I `null` au service, et le classeur écrit « non renseigné » sans formule pour I (`export.service.ts`). L'écran envoie sa saisie à l'état, à l'export du tableau et à la liasse complète (`client/src/lib/paiements-en-instance.ts`), et la remet à vide au changement d'exercice. Tests : `paiements-en-instance.spec.ts`, `paiements-en-instance-cablage.spec.ts`, `projet-budget.spec.ts`, `liasse-etafi.spec.ts`, et côté client `paiements-en-instance.spec.ts`.

**F14 · TFT SYSCOHADA : la colonne N-1 est remplie de faux zéros quand N-2 n'existe pas** [efsy-01]
- **Emplacements :** src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts:1240, :1305, :1316, :1351 · client/src/pages/EtatsFinanciersSyscohadaPage.tsx:713
- **Condition :** 1
- **Constat :** sans N-2, les postes qui exigent un exercice antérieur (ZA, FB à FG) sont posés à 0 et servis comme montant N-1. Leurs motifs de non-calcul sont jetés, alors que la table dit « jamais un faux zéro ». Tout dossier dans sa deuxième année est touché, export compris, et le spec l.577 fige l'erreur.
- **Correction :** rendre `undefined` pour ces postes et les totaux qui en dépendent, rendre et afficher les postes non calculables de N-1, et corriger le spec.
- **Fait le 2026-09-27 :** les postes non calculables et les totaux qui en dépendent (`nonCalcules`) rendent `montantN1` indéfini, leurs motifs sortent en `postesNonCalculablesN1` et s'affichent sous le tableau ; le classeur laisse la cellule N-1 vide, sans formule de total, et porte les motifs à la feuille ANOMALIES. Spec l.577 corrigé. Tests : `etats-financiers-syscohada.service.spec.ts`, `liasse-syscohada.spec.ts`.

**F15 · Éligibilité au SMT SYCEBNL : le 702 est compté dans deux catégories** [transv-04]
- **Emplacements :** src/modules/etats-financiers/correspondance-smt.ts:470, :476 · etats-financiers-smt.service.ts:915, :961
- **Condition :** 1
- **Constat :** la catégorie 2 lit `70` en n'excluant que le 704, et la catégorie 4 lit `702`. Le 702 gonfle la catégorie comparée au seuil et est compté deux fois dans le total des ressources et dans le cumul biennal.
- **Correction :** exclure `702` de la catégorie 2 et ajouter un spec qui vérifie que chaque compte appartient à une catégorie au plus.
- **Fait le 2026-09-27 :** la catégorie 2 exclut `702` et `704` (`correspondance-smt.ts`). Test sur le semis réel : chaque compte appartient à une catégorie au plus (`correspondance-smt.spec.ts`).

**F16 · Rapport de gestion SYSCOHADA : l'onglet plante, les sections ne s'enregistrent pas, l'export lit les mauvais champs** [docob-01]
- **Emplacements :** client/src/pages/DocumentsObligatoiresPage.tsx:192-201, :449-456, :464 · src/modules/documents-obligatoires/rapport-activite.service.ts:193-197 · src/modules/exports/export.service.ts:3135
- **Condition :** 4
- **Constat :** l'onglet lit `confRap.declarationRegistreDonateurs.exigence`, champ absent en SYSCOHADA, ce qui lève une TypeError. L'écran associe les six sections AUSCGIE aux quatre champs SYCEBNL par leur rang, n'envoie jamais `sections`, et l'export lit le premier niveau. Une société ne peut donc pas établir son rapport de gestion (AUSCGIE art. 138).
- **Correction :** formulaire indexé par `s.cle` qui envoie `sections`, déclaration de l'art. 18 réservée au SYCEBNL, export sur `rapport.sections`, correction du spec et test qui monte l'onglet en SYSCOHADA.
- **Fait le 2026-09-27 :** l'écran tient ses textes sous la clé de chaque section et envoie `sections` en SYSCOHADA, ses colonnes en SYCEBNL (`client/src/lib/rapport-sections.ts`) ; la déclaration des dirigeants ne s'affiche que là où le serveur la rend, et l'onglet s'intitule « RAPPORT DE GESTION » ; l'export lit `rapport.sections` en SYSCOHADA. Tests : `parite-documents-obligatoires.spec.ts`, côté client `rapport-sections.spec.ts`, et `e2e/tests/documents-obligatoires.e2e.ts`, qui monte l'onglet d'une SARL, établit le rapport par l'écran et le relit · vu tomber sur les deux défauts réinjectés (garde retirée, sections rangées dans les colonnes).

### Contrôles et mandat

**F17 · Contrôleur des comptes déclaré obligatoire pour une société qui ne franchit qu'un seul seuil** [rev-07]
- **Emplacements :** src/modules/controles/controles.service.ts:2920
- **Condition :** 1
- **Constat :** `AUDITEUR_OBLIGATOIRE_SANS_MANDAT` teste `franchis.length > 0`, alors que la même classe calcule `obligationDeclenchee` avec deux critères pour les formes cumulatives. Une SARL qui ne franchit qu'un critère lit que la désignation est obligatoire, ce que le commentaire dit vouloir éviter.
- **Correction :** remplacer la condition par `obligationDeclenchee || obligationSansSeuil`.
- **Fait le 2026-09-27 :** le contrôle 28 lit `obligationDeclenchee || obligationSansSeuil` (`controles.service.ts`). Test : `mandat-auditeur.spec.ts`, une SARL à un seuil n'est pas signalée, à deux seuils elle l'est.

**F18 · La durée du mandat SYCEBNL est ramenée au nombre d'exercices ouverts dans OmegaX, pas à l'existence de l'entité** [mandat-01]
- **Emplacements :** src/modules/mandat-auditeur/mandat-auditeur.service.ts:38-40, :131-141 · duree-mandat.ts:117-125
- **Condition :** 1
- **Constat :** l'existence de l'entité est mesurée par `exercice.count` dans le logiciel. Une association ancienne qui entre avec un seul exercice ne peut enregistrer qu'un mandat d'un an : le mandat réel de trois ans est refusé, et le contrôle 28 le déclarera échu à tort.
- **Correction :** mesurer l'existence depuis `dateActePersonnalite` ou une date déclarée. À défaut, ne rien ramener et ne rien refuser.
- **Fait le 2026-09-27 :** OmegaX ne mesure plus l'existence de l'entité · l'art. 21 ne dit pas s'il vise l'existence écoulée ou prévue, et ni les exercices ouverts ni `dateActePersonnalite` ne tranchent. La durée ramenée se SAISIT : au SYCEBNL toute durée de un à trois exercices est admise, au-delà refusée ; ailleurs la durée du texte reste exigée (`motifRefusDuree`, `duree-mandat.ts`). L'écran ouvre la saisie et cite l'article. Test : `mandat-auditeur.spec.ts`.

### Paie

**F19 · Un bulletin stipulé en dollars ne se passe jamais au journal et bloque tout le mois** [paie-01]
- **Emplacements :** src/modules/personnel/personnel.service.ts:1102 · comptabilisation-paie.ts:116 · passation-paie.ts:352, :365 · client/src/pages/PersonnelPage.tsx:626
- **Condition :** 4
- **Constat :** `entree` est figée avant la conversion : ses éléments n'ont pas de `montantFc`, et la passation calcule `Math.max(0, undefined)`, soit NaN, ce qui donne ECRITURE_DESEQUILIBREE. Or un seul bulletin refusé arrête toute la paie du mois.
- **Correction :** reconstituer les éléments en francs depuis `calcul.conversion.elements` (ou figer les éléments convertis) et ajouter un test P9 sur un bulletin en dollars.
- **Fait le 2026-09-27 :** la passation du mois relit les francs de `calcul.conversion.elements`, par RANG, quand l'élément n'en porte pas ; un élément sans francs ni conversion rend le bulletin illisible (`comptabilisation-paie.ts`, `elementsEnFrancs`). Test : `comptabilisation-paie.spec.ts`, un bulletin en dollars passe avec les mêmes totaux qu'en francs.

**F20 · Ouvrir un bulletin en dollars fait planter l'onglet Bulletins** [paie-02]
- **Emplacements :** client/src/pages/BulletinsPaie.tsx:82, :268
- **Condition :** 4
- **Constat :** l'écran appelle `fc(e.montantFc)` sur des éléments qui ne portent que `montantUsd` : `toLocaleString` sur `undefined` lève une erreur. Le décompte de l'art. 103 devient illisible et impossible à imprimer.
- **Correction :** afficher les éléments convertis (USD, cours, FC) et ne jamais formater une valeur non numérique.
- **Fait le 2026-09-27 :** le bulletin affiche chaque élément en FC avec son montant en USD et le cours du jour, et ne formate jamais une valeur absente (`client/src/lib/bulletin-affiche.ts`). Test : `bulletin-affiche.spec.ts`.

**F21 · Le bulletin imprimé omet les retenues d'avance et de prêt que son net déduit** [paie-03]
- **Emplacements :** client/src/pages/BulletinsPaie.tsx:263-293 · src/modules/personnel/personnel.service.ts:760-765
- **Condition :** 1
- **Constat :** le net déduit `retenuesAvancesFc`, mais le tableau imprimé n'a aucune ligne pour ces retenues. Le décompte remis au travailleur ne se solde pas sur son net.
- **Correction :** une ligne par retenue (libellé, littera, montant) avant le net, et un test d'écran qui vérifie le solde.
- **Fait le 2026-09-27 :** une ligne par retenue d'avance ou de prêt, avec son littera de l'art. 112, avant le net ; l'écran calcule l'écart du décompte et le signale s'il n'est pas nul (`ecartDuDecompte`). Test : `bulletin-affiche.spec.ts`.

**F22 · Un avantage en nature est payé en espèces : net à payer et 422 gonflés** [paie-04]
- **Emplacements :** src/modules/personnel/personnel.service.ts:758 · passation-paie.ts:222, :547
- **Condition :** 1
- **Constat :** `totalVerseFc` additionne tous les éléments, avantage en nature compris, et le net part de ce total. La passation porte l'avantage au 6617 contre le 422. Le salarié devient donc créancier en espèces d'un avantage qu'il a reçu en nature.
- **Correction :** sortir les avantages en nature du total payé (en les gardant dans les assiettes), ne pas les créditer au 422, proposer la contrepartie du Guide (D 6617 / C 781) ou refuser la nature, et corriger la réserve.
- **Fait le 2026-09-27 :** l'avantage en nature reste dans les assiettes et sort du total versé (`estVerseEnEspeces`) ; la passation le porte en quatrième temps, D 66170000 / C 78100000, hors du 422, comme l'écrivent la fiche du compte 66 des deux textes et le Guide (Partie 1 ch. 3 § 4.5). 78100000 est ouvert aux deux semis, relu par le spec de la nomenclature ; la réserve dit le transfert et sa condition (la charge déjà passée par nature). Tests : `passation-paie.spec.ts`, `simulation-paie.spec.ts`, `comptabilisation-paie.spec.ts`, `bulletin-affiche.spec.ts`.

### Fiscalité et facturation

**F23 · « Passer l'écriture » refuse toute facture saisie à l'écran** [fact-01]
- **Emplacements :** client/src/pages/FacturationPage.tsx:166-185 · src/modules/facturation/comptabilisation-facture.service.ts:67 · ecriture-facture.ts:56, :81
- **Condition :** 4
- **Constat :** le formulaire n'envoie ni `tiersId` ni `tauxTvaId`, alors que la passation exige le compte du tiers et le taux. Aucune route ne permet de compléter la facture ensuite : le bouton ne peut jamais aboutir.
- **Correction :** choisir le tiers et le taux dans le formulaire, ou accepter le compte du tiers dans `ComptabiliserFactureDto`. Ajouter un test navigateur.
- **Fait le 2026-09-27 :** le formulaire choisit le tiers au plan (clients et adhérents sur une vente, fournisseurs sur un achat) et le taux de taxe de la ligne, qui propose son pourcentage, et envoie les deux. Test navigateur : `e2e/tests/facturation.e2e.ts`, une vente saisie à l'écran se passe au brouillard en trois lignes · vu tomber sans l'envoi du tiers. Câblage gelé côté client (`mentions-piece.spec.ts`).

**F24 · La mention « TVA d'après les débits » (art. 60) est exigée mais impossible à poser** [fact-02]
- **Emplacements :** client/src/pages/FacturationPage.tsx:166, :572 · src/modules/facturation/mentions-facture.ts:659-667
- **Condition :** 4
- **Constat :** toute vente d'un dossier au régime des débits est déclarée non conforme tant que `mentionTvaDebits` est faux, et le formulaire n'a pas de case pour ce champ. L'écran affiche « Manque : » suivi d'une liste vide, et la pièce n'imprime jamais la mention.
- **Correction :** une case, proposée cochée pour une vente d'un dossier aux débits, et l'affichage de `mentionDebitsManquante` avec l'art. 60.
- **Fait le 2026-09-27 :** case « Autorisation d'acquitter la TVA d'après les débits » sur une vente, proposée cochée au régime des débits (`mentionDebitsProposee`, régime rendu par `/facturation`) ; le manque se nomme avec l'art. 60 (`manquesDeLaPiece`), et l'amende par omission ne s'affiche que pour les groupes de l'art. 26, la sanction de l'art. 60 restant non chiffrée avec sa réserve. Tests : `mentions-piece.spec.ts`.

**F25 · Déclaration de TVA, prorata et liquidation lisent le brouillard** [tva-01]
- **Emplacements :** src/modules/tva/taux-tva.service.ts:798, :1697, :2374 · src/modules/fiscalite/fiscalite.service.ts:371
- **Condition :** 1
- **Constat :** aucun filtre de statut dans ce module : le brouillard entre dans la collecte, la déduction, le prorata et l'écriture posée au 444. Le résultat fiscal, lui, lit le livre-journal seul pour un acte devant l'Administration, et le registre des retenues filtre sur VALIDEE : même question, deux réponses.
- **Correction :** filtrer `statut = VALIDEE` et signaler dans la déclaration la TVA restée au brouillard.
- **Fait le 2026-09-27 :** la déclaration, le prorata et le prorata définitif ne lisent plus que le livre-journal (`taux-tva.service.ts`) ; la TVA des écritures au brouillard de la période est comptée et nommée (`tvaAuBrouillard`, alerte à l'écran), et la liquidation d'une telle période est refusée · une ligne validée après coup garderait son exigibilité dans une période close et ne serait plus jamais déclarée. Tests : `tva-brouillard-f25.spec.ts` (huit mutations tuées), e2e `facturation.e2e.ts` sur base réelle.

**F26 · Registre des retenues : le reversement d'une retenue de N-1 est imputé sur janvier et masque un retard réel** [ret-01]
- **Emplacements :** src/modules/retenues/retenues.service.ts:199, :282, :318 · correspondance-retenues.ts:1188 · src/modules/exercice/exercice.service.ts:853
- **Condition :** 1
- **Constat :** le report à-nouveau, créé au brouillard, est exclu du registre. Le débit de janvier qui reverse décembre N-1 s'impute donc sur la retenue de janvier. Un mois réellement impayé n'est pas signalé, contrairement à ce qu'affirment le commentaire et l'avertissement.
- **Correction :** lire le solde d'ouverture des comptes de retenue comme un mois « antérieur » en tête de l'imputation. Tester le scénario décrit.
- **Fait le 2026-09-27 :** le solde d'ouverture de chaque nature est une ligne « antérieur » imputée la première, à l'échéance du dernier mois avant l'exercice (`retenues.service.ts`, `soldesDOuverture`) · lu sur le report à-nouveau validé, ou reconstitué sur le livre-journal depuis le dernier report quand l'exercice précédent est encore ouvert ; le report n'entre plus comme une retenue de janvier. Tests : `retenues-ouverture-f26.spec.ts` (neuf mutations tuées), e2e `retenues.e2e.ts` sur base réelle, exercice précédent ouvert puis clôturé.

### Immobilisations et stocks

**F27 · La dotation complémentaire de sortie n'est pas proratisée** [immo-01]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1280, :2273 · depreciation-immobilisation.spec.ts:396
- **Condition :** 1
- **Constat :** hors première annuité, `calculerDotation` rend l'annuité pleine sans lire la date de sortie. Un bien cédé le 30 juin reçoit douze mois de dotation, contrairement à l'AUDCIF (« la période écoulée entre l'ouverture de l'exercice et la date de cession »), et le spec fige l'erreur. La charge 68, le 28 soldé et la VCN portée au 81 sont faux.
- **Correction :** proratiser la dernière annuité à la date de sortie et corriger les deux specs.
- **Fait le 2026-09-27 :** hors première annuité, `calculerDotation` proratise sur la période qu'on lui passe, en mois, le mois de sortie compris (Guide, Partie 1 ch. 5, Application 16, « 180 × 9/12 ») ; un exercice ordinaire garde ses douze mois, le SMT SYSCOHADA reste sans prorata. Le spec qui figeait l'annuité pleine est corrigé. Tests : `sortie-f27-f28.spec.ts`, `depreciation-immobilisation.spec.ts`.

**F28 · La sortie pose le statut CÉDÉ avant ses contrôles : un échec laisse le bien sorti sans écriture** [immo-02]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:2250, :2284, :2377, :2398
- **Condition :** 3
- **Constat :** le verrou change le statut avant `unitesOeuvreDe`, `compteDeSortie` et les écritures, dont chacun peut lever. Le bien reste au bilan sans écriture de sortie, et toute nouvelle tentative bute sur « déjà sortie ».
- **Correction :** faire tous les contrôles avant le verrou, ou remettre EN_SERVICE en cas d'échec.
- **Fait le 2026-09-27 :** les deux · le relevé d'unités d'œuvre, le complément et les comptes de classe 8, de reprise et de produit sont résolus avant le verrou ; une écriture refusée après lui défait la dotation, les écritures posées dans l'ordre inverse, et remet le bien EN SERVICE (`defaireSortie`). Tests : `sortie-f27-f28.spec.ts` (neuf mutations tuées sur F27 et F28).

**F29 · Le renouvellement sort l'ancien composant puis échoue à créer le remplaçant (pièce de sécurité)** [immo-03]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:789, :1935-1966
- **Condition :** 3
- **Constat :** `renouveler` appelle `sortir` puis `creer`, sans transaction. Pour une pièce de sécurité, la date transmise contredit la règle de `verifierComposant`, ce qui donne un refus systématique après la sortie : ancien composant sorti, aucun remplaçant, aucune reprise possible.
- **Correction :** valider le remplaçant avant `sortir` et trancher au texte la date de la pièce de sécurité.
- **Fait le 2026-09-27 :** le remplaçant est créé d'abord, avec tous ses contrôles, puis l'ancien sorti ; une sortie refusée se défait (F28) et le remplaçant est retiré avec son écriture d'acquisition (`retirerRemplacant`). Le texte (« dès l'acquisition de l'immobilisation principale ») ne vise que le stock constitué avec le bien : la pièce de sécurité qui en remplace une autre s'amortit dès sa propre acquisition, lecture d'OmegaX dite dans le code. Au passage, `creer` fait tous ses contrôles avant l'écriture d'acquisition et la retire si la fiche est refusée. Tests : `renouvellement-f29.spec.ts` (huit mutations tuées).

**F30 · Le tableau des amortissements calcule une dotation pour des biens sortis les années précédentes** [immo-04]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1408, :1469-1523
- **Condition :** 1
- **Constat :** le filtre ne porte que sur la date d'acquisition, sans statut. Un bien cédé en N-1 reçoit une annuité dans la dotation, le cumul et le net de N, que `passerDotation` refuserait de poster.
- **Correction :** écarter les biens sortis avant l'exercice et, pour un bien sorti dans l'exercice, ne retenir que la dotation effectivement passée.
- **Fait le 2026-09-27 :** la requête écarte les biens sortis avant l'exercice ; un bien sorti dans l'exercice porte la dotation passée par sa sortie et rien de plus, marquée « sorti le », jamais « à passer » (`tableauAmortissements`, écran et classeur). Tests : `tableaux-immobilisations.spec.ts`.

**F31 · Le tableau des immobilisations additionne les biens sortis dans ses totaux** [immo-05]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1305-1360
- **Condition :** 1
- **Constat :** brut, amortissements et net des biens cédés entrent dans les sous-totaux et le total. Le recoupement avec la balance, que le commentaire annonce, tombe faux.
- **Correction :** exclure ou présenter à part les biens sortis à la date d'arrêté.
- **Fait le 2026-09-27 :** présentés à part (`sortis`), hors des sous-totaux et du total, à l'écran et après le total du classeur ; un bien sorti après la date d'arrêté reste dans son groupe. Tests : `tableaux-immobilisations.spec.ts`, `formules-excel.spec.ts` (six mutations tuées sur F30 et F31).

**F32 · Un bien repris (avec amortissement antérieur) ne peut pas être créé** [immo-06]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:889-898 · client/src/pages/ImmobilisationsPage.tsx:750
- **Condition :** 4
- **Constat :** `creer` poste toujours l'acquisition à la date d'acquisition, et une date hors de l'exercice est refusée. Le champ « Amortissement déjà pratiqué » n'est donc jamais atteignable. S'il l'était, le 2x repris au bilan d'ouverture serait doublé.
- **Correction :** créer la fiche d'un bien repris sans écriture d'acquisition.
- **Fait le 2026-09-27 :** `repris` au DTO et à l'écran (case « Bien repris », qui remplace la contrepartie par l'amortissement déjà pratiqué) ; la fiche naît sans écriture, `ecritureAcquisitionId` devenant nullable (migration `20261122000000_immobilisation_reprise`, `onDelete: Restrict` déclaré au schéma, aucune dérive). La reprise n'est admise que pour une acquisition antérieure à l'ouverture de l'exercice ; une telle acquisition non déclarée reprise est refusée avec ses deux issues, et un amortissement antérieur hors reprise aussi. Tests : `bien-repris-f32.spec.ts` (onze mutations tuées), `e2e/tests/immobilisations.e2e.ts` sur la base réelle.

**F33 · La durée d'une révision majeure n'est contrôlée que si elle est envoyée** [immo-09]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:766-769, :948 · client/src/pages/ImmobilisationsPage.tsx:210-228
- **Condition :** 1
- **Constat :** l'écran n'envoie aucune durée : le composant prend la durée de la famille et le refus du ch. 5 § 1 ne joue jamais. Une révision majeure s'amortit alors sur la durée de la structure.
- **Correction :** contrôler la durée effective et permettre de saisir la durée propre du composant.
- **Fait le 2026-09-27 :** le refus du ch. 5 § 1 porte sur la durée EFFECTIVE, celle saisie ou à défaut celle de la famille (`verifierComposant`, avant toute écriture) ; l'écran porte un champ « Durée d'amortissement », vide pour la durée de la famille. Tests : `revision-majeure-duree-f33.spec.ts` (quatre mutations tuées), `e2e/tests/immobilisations.e2e.ts`.

**F34 · L'amortissement est plafonné à douze mois alors que l'exercice peut en durer davantage** [transv-07]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1258-1280 · amortissement-degressif.ts:149 · src/modules/exercice/exercice.service.ts:271
- **Condition :** 1
- **Constat :** le logiciel admet un premier exercice de plus de douze mois (AUDCIF art. 7), mais la dotation prend `Math.min(12, …)` et une annuité d'un an. Un bien en service sur 18 mois reçoit 12/12, et le décompte des mois est écrit trois fois.
- **Correction :** proratiser sur la durée réelle de l'exercice, un seul `moisEntre` partagé, et un spec sur un exercice de 18 mois.
- **Fait le 2026-09-27 :** un seul décompte, `src/common/mois-entre.ts`, appelé par la première annuité, la dernière annuité de sortie, le plan fiscal, la comparabilité et la consolidation ; plus aucun plafond à douze mois. Un bien en service sur dix-huit mois reçoit dix-huit douzièmes, borné au reliquat ; le SMT SYSCOHADA garde une annuité par exercice (« sans prorata temporis », lecture dite). Le plan fiscal dégressif compte ses PÉRIODES IMPOSABLES (loi n° 23/053, art. 12 et 33) · un exercice de dix-huit mois en porte deux, donc deux annuités. Tests : `exercice-long-f34.spec.ts` (sept mutations tuées, dont une après ajout du test de la bascule de l'art. 35).

**F35 · La régularisation de boni ou de mali n'inscrit aucun mouvement au magasin** [stk-01]
- **Emplacements :** src/modules/stocks/magasin.service.ts:398-456 · client/src/pages/MagasinPage.tsx:288
- **Condition :** 1
- **Constat :** l'écriture est postée, mais la fiche garde la quantité théorique. Une nouvelle confrontation repropose le même écart, qui peut être passé deux fois, et la fiche n'égale plus jamais le compte.
- **Correction :** enregistrer dans la même opération la sortie (mali) ou l'entrée (boni), liée à l'écriture.
- **Fait le 2026-09-27 :** chaque différence régularisée entre au magasin à la date du comptage, liée à l'écriture · mali en sortie valorisée par la méthode, boni en entrée au coût total porté au compte ; une inscription refusée retire l'écriture. Une seconde confrontation au même comptage ne trouve plus rien. Tests : `magasin-regularisation-f35-f36.spec.ts`, `e2e/tests/magasin.e2e.ts`.

**F36 · La confrontation magasin / comptage ignore la date de l'inventaire** [stk-02]
- **Emplacements :** src/modules/stocks/magasin.service.ts:327, :346
- **Condition :** 1
- **Constat :** tous les mouvements sont rejoués, y compris ceux postérieurs au comptage. Le boni ou le mali est faux du montant des mouvements saisis après le comptage.
- **Correction :** recevoir la date du comptage et ne rejouer que les mouvements antérieurs ou égaux à cette date.
- **Fait le 2026-09-27 :** `dateComptage` exigée par la confrontation et la régularisation (écran : « Date du comptage ») ; la requête ne rejoue que les mouvements datés au plus tard de ce jour. Tests : même spec (dix mutations tuées sur F35 et F36), même parcours navigateur.

### Analytique et plan comptable

**F37 · Tableau d'exécution budgétaire : le budget de chaque section est compté deux fois** [analytique-01]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet-budget.service.ts:139, :151-154 · src/modules/analytique/analytique.service.ts:299-311 · projet-budget.spec.ts:105
- **Condition :** 1
- **Constat :** `doterBudget` écrit une ligne annuelle et les lignes mensuelles, et `executionBudgetaire` additionne le tout sans filtre sur le mois. Le budget des notes 35/24 vaut le double de la dotation.
- **Correction :** lire `mois: null` seulement, et donner au spec le jeu de budgets réel.
- **Fait le 2026-09-27 :** le tableau ne lit que la dotation annuelle (`mois: null`) ; la doublure du spec rend le jeu réel de `doterBudget`, annuelle et mensuelles, et honore `mois` · cinq tests tombent sans le filtre. Tests : `projet-budget.spec.ts`.

**F38 · La retouche d'un budget mensuel ne peut pas aboutir et désaligne l'annuel** [analytique-02]
- **Emplacements :** src/modules/analytique/analytique.service.ts:318-349 · migration 20260829085054:67
- **Condition :** 3
- **Constat :** le second upsert porte sur une clé composée avec `mois: null`, qu'aucun index NULLS NOT DISTINCT ne couvre. Le mois est déjà écrit hors transaction quand la suite échoue. Les sections Total et les plans sans budget ne sont pas refusés, contrairement à `doterBudget`.
- **Correction :** une transaction, un `findFirst` de l'annuelle puis un update ou un create, les mêmes refus que `doterBudget`, et une migration NULLS NOT DISTINCT.
- **Fait le 2026-09-27 :** une transaction, l'annuelle cherchée puis mise à jour ou créée ; les refus de la dotation (section Total, plan sans budgets, exercice d'un autre dossier) et le mois hors convention ; migration `20261123000000_budget_annuel_unique` (doublons retirés, annuelle recalée sur la somme des mois, index NULLS NOT DISTINCT, aucune dérive). Tests : `budget-mois-f38-f39.spec.ts`, `e2e/tests/budget.e2e.ts`, vu tomber en 500 sur l'ancien service.

**F39 · Aucune dotation possible sur un exercice de plus de douze mois** [analytique-03]
- **Emplacements :** src/modules/analytique/analytique.service.ts:304-311, :370-386 · prisma/schema.prisma:2413-2416
- **Condition :** 4
- **Constat :** `moisCouverts` rend les numéros de mois 1 à 12, qui se répètent sur 18 mois, et le `createMany` viole l'unicité. Un projet qui démarre au second semestre n'a pas de budget sur son premier exercice.
- **Correction :** refuser nommément la dotation mensuelle sur un exercice long (en ne posant que l'annuel), ou ajouter l'année à la clé.
- **Fait le 2026-09-27 :** première voie · sur un exercice de plus de douze mois, la dotation ne pose que l'annuelle, et la retouche d'un mois comme l'état budgétaire d'un mois sont refusés nommément. Tests : même spec (huit mutations tuées sur F38 et F39).

**F40 · La classe d'un compte créé est libre, par défaut la classe 1** [comptes-01]
- **Emplacements :** src/modules/comptes/compte.service.ts:98-131 · dto/creer-compte.dto.ts:15-16 · client/src/pages/PlanComptesPage.tsx:107, :173, :640-650 · src/modules/etats-financiers/etats-financiers.service.ts:191-192
- **Condition :** 1
- **Constat :** le formulaire part de CLASSE_1 et le serveur ne compare pas la classe au premier chiffre du numéro. Un 6xxx créé sans toucher la liste sort du résultat CH du bilan pendant que le compte de résultat le compte : les deux états divergent.
- **Correction :** déduire la classe du numéro au serveur et l'afficher calculée à l'écran.
- **Fait le 2026-09-27 :** la classe se lit dans le numéro (`comptes/classe-du-numero.ts`, écran `lib/classe-du-numero.ts`), une classe envoyée qui le contredit est refusée, l'import emprunte la même règle ; migration `20261124000000_classe_du_numero` qui remet les comptes déjà créés dans la classe de leur numéro (aucune dérive). Test : `classe-du-numero-f40.spec.ts` (dix mutations tuées), qui vérifie aussi les deux plans semés.

### Groupe et monnaie fonctionnelle

**F41 · La liasse du groupe poste toute la balance agrégée, à-nouveaux compris, en une écriture ordinaire** [groupe-01]
- **Emplacements :** src/modules/groupe/groupe.service.ts:1820, :1860-1864 · ecriture.service.ts:2886 · correspondance-tft-syscohada.ts:881 · note-annexe.service.ts:414
- **Condition :** 1
- **Constat :** `totalDebit`/`totalCredit` cumulent report et mouvements, puis sont postés sans le drapeau de clôture. Le TFT et les tableaux de variation du dossier de combinaison lisent alors tout le parc historique comme des acquisitions de l'exercice.
- **Correction :** une écriture d'ouverture marquée pour les reports puis une écriture pour les mouvements. Ajouter un test sur le TFT et une note de variation.
- **Fait le 2026-09-27 :** trois écritures au lieu d'une · l'à-nouveau (drapeau de clôture), les mouvements, et le solde des comptes de gestion (drapeau de solde, daté de la clôture), chacune avec les colonnes de la balance des dossiers ; chaque élimination réciproque et chaque liaison 184 à 187 sort de la colonne d'où vient sa ligne, et une ouverture qui ne se compense pas est prise sur les mouvements avec un avertissement ; chaque colonne est vérifiée avant la première pièce (`groupe.service.ts`, `colonnesDeCombinaison`, `partsHorsMouvement`). Vérifié sur PostgreSQL local, en base : pièces marquées et datées comme celles d'un dossier ordinaire. Test : `liasse-groupe-colonnes-f41.spec.ts` (douze mutations tuées). Le tableau des flux et les notes de variation lisent déjà ces colonnes (F4 à F6, `cloture.e2e.ts`).

**F42 · Le second jeu en monnaie fonctionnelle convertit l'à-nouveau et la clôture au cours de leur date** [mf-01]
- **Emplacements :** src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts:21, :162 · src/modules/exercice/exercice.service.ts:790, :855
- **Condition :** 1
- **Constat :** aucune écriture de clôture n'est écartée. L'à-nouveau est converti au cours du premier jour, ce que l'en-tête déclare faux, et l'écriture qui solde les 6/7 laisse un reliquat.
- **Correction :** écarter ces écritures, partir du solde fonctionnel de N-1 (ou refuser l'état au-delà du premier exercice), et tester les deux cas.
- **Fait le 2026-09-27 :** première voie · l'à-nouveau et le solde des comptes de gestion ne sont plus convertis ; l'ouverture est la clôture du même jeu pour l'exercice précédent (comptes 1 à 5 reportés, résultat converti au compte 13 de la clôture en francs, sur sa propre ligne si l'exercice précédent n'est pas clos) ; une reprise sans exercice précédent convertit son à-nouveau au cours de sa date, et l'état dit d'où vient son ouverture (`balance-fonctionnelle.service.ts`, `jeuFonctionnel`). Test : `balance-fonctionnelle-ouverture-f42.spec.ts` (huit mutations tuées), doublure du spec existant mise au filtre.

### Sécurité, plateforme et sur site

**F43 · Un administrateur de dossier peut se faire promouvoir opérateur de la plateforme par la casse de l'adresse** [socle-01]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:56 · src/modules/utilisateurs/utilisateur.service.ts:38 · src/modules/auth/auth.service.ts:204 · prisma/schema.prisma:831
- **Condition :** 2
- **Constat :** la promotion au démarrage cherche l'adresse sans tenir compte de la casse, alors que l'unicité et les créations y sont sensibles. Un compte « ADMIN@… » créé dans n'importe quel dossier est promu au déploiement suivant, active lui-même son second facteur et obtient la console.
- **Correction :** normaliser les adresses à toutes les portes, poser une unicité sur `lower(email)`, promouvoir par égalité exacte et jamais plus d'un compte.
- **Fait le 2026-09-27 :** `normaliserCourriel` (espaces retirés, minuscules) à chaque porte qui reçoit une adresse de compte (`@CourrielNormalise`, huit DTO) et dans les services (inscription, connexion, changement d'adresse, création d'utilisateur, relectures du siège et de la console) ; la promotion se fait par égalité exacte sur l'adresse normalisée, l'unicité en garantissant un compte au plus. Au lieu d'un index sur `lower(email)`, que le schéma Prisma ne sait pas porter : la migration `20261125000000_courriel_normalise` normalise les adresses existantes (sauf deux comptes ne différant que par la casse, laissés tels quels) et pose la contrainte `users_email_normalise` (NOT VALID), qui avec l'unicité existante rend deux comptes de casse différente impossibles ; aucune dérive. Tests : `courriel-f43.spec.ts` (neuf mutations tuées), `plateforme.spec.ts` remis à la nouvelle règle.

**F44 · Sur site, n'importe quel poste du réseau obtient la copie de la base de tous les dossiers** [socle-02, surSite-01]
- **Emplacements :** installation/windows/initialiser.ps1:76 · src/modules/auth/auth.controller.ts:54 · src/modules/sur-site/sur-site.controller.ts:61-66 · sauvegarde-sur-site.service.ts:163, :209-230
- **Condition :** 2
- **Constat :** l'inscription publique est ouverte à demeure et rend un administrateur de dossier. Les routes de sauvegarde (un `pg_dump` non chiffré de la base entière, copié vers un chemin libre) ne demandent que ce rôle.
- **Correction :** réserver les sauvegardes à un rôle d'installation, fermer l'inscription après le premier dossier, et chiffrer la copie externe.
- **Fait le 2026-09-27 :** le « rôle d'installation » est l'administrateur du DOSSIER D'INSTALLATION, le premier dossier du poste, lu à chaque demande plutôt que porté par une colonne (`AuthService.dossierDInstallation`, `AdministrateurInstallationGuard`) · il tient seul les trois routes de sauvegarde et la création des dossiers suivants (`POST /sur-site/dossiers`, même pipeline que l'inscription, plafond de la licence compris, aucune session rendue ; fenêtre Restitution). L'inscription publique sur site ne sert qu'au poste sans dossier, `INSCRIPTION_PUBLIQUE` n'y est plus lue, l'installateur ne l'écrit plus et la mise à jour la retire ; l'écran d'ouverture ne propose la création qu'au poste neuf. La copie externe est chiffrée (AES-256-GCM, clé tirée par scrypt d'une phrase choisie par l'administrateur, sel dans le fichier) · un secret tiré sur le poste mourrait avec le disque que la copie remplace. Sans phrase, rien ne part en clair ; les copies en clair déjà déposées sont retirées ; la clé dérivée ne sort par aucune route. Outil `dechiffrer-sauvegarde.cjs` livré avec le serveur, qui charge le module du serveur. Tests : `installation-f44.spec.ts`, `sur-site-divers.spec.ts`, `sur-site.spec.ts` et `assistant-creation-corps.spec.ts` côté écran ; quinze mutations tuées, deux sans compilation (le typage interdit d'envoyer une copie sans clé), et la sortie de cloisonnement des deux lectures de dossiers reste déclarative, `Tenant` n'étant pas un modèle cloisonné. Outil de déchiffrement essayé sur le code compilé, bonne et mauvaise phrase.

**F45 · La réinitialisation de l'administrateur d'un cabinet client rend toujours 404** [plateforme-01]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:421, :431 · extension-cloisonnement.ts:249
- **Condition :** 4
- **Constat :** la lecture de l'administrateur se fait hors de toute sortie de cloisonnement, si bien que la garde rend null pour un autre dossier. La route de dernier recours ne marche que pour le propre dossier de l'opérateur.
- **Correction :** envelopper la lecture dans `horsCloisonnement` et ajouter un test à travers la vraie garde.
- **Fait le 2026-09-27 :** la lecture de l'administrateur sort du cloisonnement comme l'écriture, sur l'adresse normalisée (F43), le filtre gardant le dossier désigné et le rôle d'administrateur. Test : `licence-client-cloisonnement.spec.ts`, à travers la vraie garde, doublure au filtre complet (trois mutations tuées).

**F46 · Les cellules d'un groupe ne suivent pas l'échéance ni le paiement de la mère** [plateforme-02, socle-09]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:162-181, :211-218 · src/modules/groupe/groupe.service.ts:294, :311
- **Condition :** 3
- **Constat :** `echeanceAbonnement` ne met à jour que la mère : après le premier paiement, les cellules expirent. Une cellule née sans échéance ne se coupe jamais, et seul `modifierLicence` cascade.
- **Correction :** appliquer la cascade dans `echeanceAbonnement` et poser l'échéance de la mère à la création de la cellule.
- **Fait le 2026-09-27 :** une seule règle, `licenceDeCellule` (type, statut et échéance de la mère recopiés tels quels, échéance nulle comprise), aux trois portes · la création par le siège (statut compris, calculée avant toute création), le rattachement par la console (`modifierGroupe`, qui laissait au dossier rattaché sa propre licence), et le paiement de l'abonnement (`echeanceAbonnement` reflète l'échéance retenue de la mère sur chaque cellule, sans toucher leur statut). Le dossier de l'éditeur n'entre dans aucun groupe, ni comme mère ni comme cellule · refléter sa licence ferait des cellules incoupables. Tests : `licence-cellules-f46.spec.ts`, doublure au filtre de la cascade (onze mutations tuées) ; la cascade est déclarée dans la liste des sorties de `cloisonnement.spec.ts`. Au passage, le journal de la réinitialisation (F45) écrit l'adresse normalisée.

**F47 · La création d'un cabinet rattaché à une mère d'un autre référentiel laisse un dossier inaccessible** [plateforme-04]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:345, :377, :384 · client/src/pages/PlateformePage.tsx:251
- **Condition :** 3
- **Constat :** `register` crée tout, puis `modifierGroupe` lève : le mot de passe n'est pas rendu et une nouvelle tentative échoue sur l'adresse. La seule reprise (F45) est cassée, et l'écran ne filtre pas les mères par référentiel.
- **Correction :** valider la mère avant `register` et filtrer `meresPossibles`.
- **Fait le 2026-09-27 :** `PlateformeService.verifierMere` (existence, un seul niveau, même référentiel, sous le SYSCOHADA le même système comptable, jamais le dossier de l'éditeur) est appelée par le rattachement ET par la création, avant `register` ; une cellule créée par la console naît avec le type de licence de sa mère, et un type ou une échéance envoyés avec une mère sont refusés plutôt qu'écrasés (F46). Le rattachement exige désormais aussi le système du siège, que `creerCellule` imposait déjà. Écran · `lib/meres-possibles.ts` applique la même règle aux deux listes de la console, remet la mère à vide quand le référentiel ou le système change, et masque les champs de licence d'une cellule. Tests : `creation-cellule-f47.spec.ts` (sept mutations tuées), `meres-possibles.spec.ts` (quatre) ; création d'une cellule par le siège vérifiée sur PostgreSQL local.

### Exploitation

**F48 · La procédure de restauration ne bascule pas le service, qui lit la chaîne poolée** [doc-01]
- **Emplacements :** docs/sauvegardes-et-restauration.md:182-187 · .github/workflows/deploy-cloud-run.yml:218 · docs/actions-du-proprietaire.md:196
- **Condition :** 6
- **Constat :** l'étape 4 ne fait changer que `API_DATABASE_URL`, alors que le service reçoit `API_DATABASE_URL_POOLED`, qui est posé. Suivie à la lettre, la procédure migre la base restaurée pendant que le service écrit dans l'ancienne.
- **Correction :** mettre à jour les deux secrets et vérifier dans le run la ligne « endpoint POOLÉ ».
- **Fait le 2026-09-27 :** l'étape 4 nomme les deux secrets et leur usage, dit pourquoi un seul ne suffit pas et exige qu'ils désignent la même base (hôte direct et hôte `-pooler`) ; une étape 5 fait vérifier la bascule sans afficher de chaîne · la ligne « Base · endpoint POOLÉ » du run, puis la preuve que le SERVICE écrit dans la base restaurée (un essai de mot de passe faux fait passer `tentativesEchouees` à 1, requête essayée sur PostgreSQL local). La liste des actions du propriétaire y renvoie. Test : `restauration-deux-secrets.spec.ts` (trois mutations tuées), qui gèle aussi la ligne que le workflow écrit et l'ordre des deux secrets donné au service.

### Trouvé en corrigeant F41

**F271 · Le siège ne peut pas créer de cellule, ni la console de cabinet : 500** [2026-09-27]
- **Emplacements :** src/modules/auth/auth.service.ts (`register`) · src/common/audit/extension-audit.ts · src/common/cloisonnement/extension-cloisonnement.ts
- **Condition :** 4
- **Constat :** la création du dossier s'exécutait encore au nom du dossier de la session. Son maillon d'audit ouvre la chaîne du nouveau dossier, la garde de cloisonnement le refusait comme une écriture chez un voisin, et la transaction tombait entière. Seule l'inscription publique, sans session, passait. Vu sur une base réelle.
- **Correction :** tirer l'identifiant du dossier avant sa création et exécuter toute la naissance à son nom.
- **Fait le 2026-09-27 :** `register` tire `idDossier`, bascule le contexte avant `creerTenant`, qui reçoit l'identifiant. Vérifié sur PostgreSQL local (cellule créée par le siège). Tests : `inscription-transaction.spec.ts`, `creation-dossier-identifiant.spec.ts`, `journal-audit.spec.ts` (mutations tuées).

---

## AVANT_1_0

### Saisie, lettrage, trésorerie et devises

**F49 · Aucun écran ni import ne pose la devise d'une ligne : la réévaluation ne trouve jamais de position** [saisie-01]
- **Emplacements :** client/src/pages/SaisiePage.tsx:849 · src/modules/devises/devises.service.ts:307 · src/modules/import/import.service.ts:808 · client/src/pages/DevisesPage.tsx:408
- **Condition :** 4
- **Constat :** la saisie et l'import n'écrivent jamais `deviseId` ni `montantDevise`. La fenêtre Devises rend toujours « Aucune position » et l'écart de change réalisé du lettrage n'est jamais calculé.
- **Correction :** ajouter devise, montant en devise et cours à la grille et à l'import, ou retirer la réévaluation en le disant.
- **Fait le 2026-09-27 :** la grille porte une exception « Opération en devise » (devise du dossier, montant, cours proposé au plus tard à la date de la pièce) et l'import trois colonnes facultatives ; le serveur refuse la monnaie de tenue, une devise d'un autre dossier et un montant qui n'est pas la contrevaleur au cours appliqué, et déduit le cours s'il manque (`comptabilite/ligne-en-devise.ts`, `controlesDEntree`, `import.service.ts`, `client/src/lib/ligne-en-devise.ts`). Vérifié sur base réelle · la réévaluation trouve les positions. Tests : `ligne-en-devise.spec.ts` (serveur et écran), `saisie-en-devise.spec.ts`, `brouillard.spec.ts`.

**F50 · Un lettrage partiel ne protège pas ses lignes** [saisie-03]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:867, :1876 · reimputation.ts:53
- **Condition :** 3
- **Constat :** les gardes testent `lettre`, qui est null dans un groupe partiel. Modifier, supprimer, corriger ou réimputer dénoue le groupe en silence : solde stocké faux, groupe à cheval sur deux comptes.
- **Correction :** tester `lettre || lettrageId` dans les quatre gardes, avec un test par geste.
- **Fait le 2026-09-27 :** une seule règle (`lettrage/ligne-lettree.ts`, `estTenueParUnLettrage`), dont le type exige les deux champs, appliquée aux quatre gardes et à leurs deux jumeaux · le remplacement du report provisoire et le retrait de la passation de paie. Tests : `ligne-lettree.spec.ts` (un par geste), `reimputation-service.spec.ts`, `a-nouveaux-provisoires.spec.ts`, `comptabilisation-paie.service.spec.ts`.

**F51 · Balance âgée : la colonne « Antérieur à l'exercice » reste vide pour les reports** [saisie-06]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:2341, :2373 · exercice.service.ts:859
- **Condition :** 1
- **Constat :** le report est daté de `dateDebut` et la borne exclut cette date. Une facture de N-1 sans échéance tombe dans les tranches de l'exercice : le total est juste, l'ancienneté fausse.
- **Correction :** ranger en ouverture les lignes de report, et tester un report sans échéance.
- **Fait le 2026-09-27 :** une ligne de report à-nouveau sans échéance va dans la colonne d'ouverture ; avec une échéance, c'est elle qui range (`ecriture.service.ts`, `balanceAgee`). Test : `balance-agee-date-et-report.spec.ts`.

**F52 · Balance âgée à une date passée : factures postérieures comptées, lettrages postérieurs ignorés** [saisie-07]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:2375, :2383 · client/src/pages/BalanceAgeePage.tsx:113
- **Condition :** 1
- **Constat :** l'écran laisse choisir la date, mais le service ne borne ni les écritures ni le lettrage à cette date. L'état « au 30/06 » ne décrit pas la situation au 30/06.
- **Correction :** borner à `date <= ref` et ignorer les lettrages postérieurs, ou figer la référence.
- **Fait le 2026-09-27 :** les écritures sont bornées à la date de référence, et une ligne est ouverte à cette date par la règle des notes par échéance (`ouverteALaCloture`) · un règlement postérieur ne la solde pas encore. Vérifié sur base réelle (facture de mars réglée en juillet : 1 000 au 30/06, 500 au 31/12 avec la facture d'août). Test : `balance-agee-date-et-report.spec.ts`.

**F53 · Justificatif de solde faux sur les comptes de gestion et le 13 à partir du deuxième exercice clos** [saisie-08]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:2530
- **Condition :** 1
- **Constat :** le filtre retire toute écriture de clôture hors premier exercice, y compris celle qui soldait les 6/7. Le solde listé cumule plusieurs années et le recoupement signale un écart inexistant.
- **Correction :** distinguer report et clôture (même racine que F5), ou restreindre le justificatif au bilan.
- **Fait le 2026-09-27 :** le justificatif garde l'écriture de solde des comptes de gestion et ne la dit plus « à-nouveau » (`ecriture.service.ts`, `justificatifSolde`). Test : `justificatif-solde.spec.ts`.

**F54 · Deux réévaluations dans le même exercice comptent l'écart deux fois** [saisie-09]
- **Emplacements :** src/modules/devises/devises.service.ts:307, :491, :547
- **Condition :** 1
- **Constat :** l'écart est passé sans devise, et le seul garde-fou porte sur la même date. Une seconde réévaluation repasse l'écart entier (effet latent tant que F49 n'est pas corrigé).
- **Correction :** refuser une seconde réévaluation non extournée, ou intégrer les écarts déjà passés.
- **Fait le 2026-09-27 :** une seule réévaluation passée par exercice, quelle que soit sa date · refus nommé au service, index unique en base (migration `20261126000000_une_reevaluation_par_exercice`). Le calcul, qui n'enregistre rien, reste ouvert pour une situation intermédiaire. Vérifié sur base réelle. Test : `reevaluation-f54-f55.spec.ts`.

**F55 · Les positions en devise reportées à-nouveau échappent à la réévaluation** [saisie-10]
- **Emplacements :** src/modules/devises/devises.service.ts:309 · src/modules/exercice/report-a-nouveau.ts:67
- **Condition :** 1
- **Constat :** le report ne recopie ni la devise ni le montant en devise, et le calcul ne lit que l'exercice. Une créance en dollars née en N-1 n'est jamais réévaluée.
- **Correction :** reporter devise et montant en devise (DÉTAIL et SOLDE).
- **Fait le 2026-09-27 :** en DÉTAIL chaque ligne reportée garde devise, montant et cours ; en SOLDE, une ligne par devise au cours moyen et le reste en francs (`exercice/report-a-nouveau.ts`, `versCompteRan`, clôture et report provisoire). Vérifié sur base réelle · une banque en dollars close en 2026 est réévaluée en 2027. Tests : `reevaluation-f54-f55.spec.ts`.

**F56 · Règlement des tiers : le caractère lettrable du compte est vérifié après la première pièce** [saisie-11]
- **Emplacements :** src/modules/reglements/reglements.service.ts:130-187 · lettrage.service.ts:104
- **Condition :** 3
- **Constat :** `lettrerManuel` lève après `ecritures.creer`, contrairement à la règle 4 de CLAUDE.md. Une pièce passe sans lettrage, le lot s'arrête, et un second clic règle deux fois.
- **Correction :** lire `lettrable` dans la phase de vérification, idéalement dans une transaction unique.
- **Fait le 2026-09-27 :** le caractère lettrable se vérifie avec le reste, avant la première pièce ; un lettrage refusé malgré tout (ligne prise entre-temps) retire la pièce qu'il accompagnait (`reglements.service.ts`). Test : `reglements.spec.ts`.

**F57 · Le lettrage automatique pose des groupes calculés hors transaction** [saisie-12]
- **Emplacements :** src/modules/lettrage/lettrage.service.ts:283-310, :948
- **Condition :** 3
- **Constat :** `creerGroupe` réaffecte les lignes sans vérifier qu'elles sont encore libres. Un lettrage concurrent perd des lignes et son solde stocké devient faux.
- **Correction :** relire les lignes avec `lettrageId: null` dans la transaction.
- **Fait le 2026-09-27 :** `creerGroupe` relit les lignes libres du compte dans la transaction et n'écrit que sur des lignes encore libres ; un écart de compte refuse tout (`lettrage.service.ts`). Tests : `lettrage.service.spec.ts` (ligne prise avant la transaction, et entre lecture et écriture).

**F58 · Changer la date d'un brouillard en journal mensuel garde son numéro de pièce** [saisie-13]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:910-925
- **Condition :** 5
- **Constat :** aucune renumérotation au changement de mois. Il en résulte un trou dans le mois d'origine et un doublon possible dans le mois d'arrivée.
- **Correction :** refuser le changement de mois, ou renuméroter dans la même transaction.
- **Fait le 2026-09-27 :** une pièce d'un journal mensuel déplacée dans un autre mois reçoit le numéro suivant de ce mois, dans la transaction sérialisable qui la déplace (`EcritureService.modifier`). Tests : `modifier-change-de-mois.spec.ts` ; vérifié sur base réelle.

**F59 · Un nouveau journal naît en numérotation MANUELLE, sans moyen de saisir un numéro** [saisie-14]
- **Emplacements :** client/src/pages/JournauxPage.tsx:38 · src/modules/journaux/journal.service.ts:80 · dto/creer-ecriture.dto.ts:116
- **Condition :** 3
- **Constat :** en MANUELLE, le numéro vaut null et aucun DTO ne porte de numéro. Toutes les pièces restent sans numéro (AUDCIF art. 17, 3°).
- **Correction :** défaut en continue par journal, ou choix obligatoire, avec la mention à l'écran.
- **Fait le 2026-09-27 :** défaut en continue par journal au serveur (`NUMEROTATION_PAR_DEFAUT`), à la base (migration `20261127000000_journal_numerotation_continue`) et à l'écran ; la manuelle choisie, l'écran dit que les pièces resteront sans numéro. Tests : `journal-creation.spec.ts`, `journaux-numerotation.spec.ts`.

**F60 · Le compte de trésorerie d'un journal n'est vérifié ni pour le dossier ni pour sa nature** [saisie-15]
- **Emplacements :** src/modules/journaux/journal.service.ts:49-53, :72-82, :114
- **Condition :** 2
- **Constat :** l'identifiant est écrit tel qu'il est reçu : un compte d'un autre dossier (rendu ensuite par `include`), de classe 6 ou Total, est accepté.
- **Correction :** lire le compte borné au dossier, en classe 5 et de type DETAIL.
- **Fait le 2026-09-27 :** `verifierCompteTresorerie` à la création et à la modification · compte du dossier, numéro en 5, compte de détail. Tests : `journal-creation.spec.ts`.

**F61 · La saisie ignore la troncature du journal chargé** [saisie-18]
- **Emplacements :** client/src/pages/SaisiePage.tsx:381-390, :877-887 · ecriture.service.ts:1926
- **Condition :** 3
- **Constat :** au-delà de 2 000 pièces, la dernière pièce affichée et les totaux sont faux, sans un mot. La fenêtre Journal, elle, le dit.
- **Correction :** lire `tronque` et `total`, et charger par ordre décroissant ou par pages.
- **Fait le 2026-09-27 :** la saisie demande les pièces les plus récentes d'abord (`plusRecentes=1`), prend les totaux du serveur et dit la tranche (`client/src/lib/journal-de-saisie.ts`). Tests : `journal-de-saisie.spec.ts`, `plafonds-de-fenetre.spec.ts`.

**F62 · Relevé bancaire : une écriture visée par deux lignes est donnée à la première (passe par référence)** [saisie-20]
- **Emplacements :** src/modules/rapprochement/releve-bancaire.ts:236-249
- **Condition :** 5
- **Constat :** la passe 1 ne compte pas les demandes par écriture, contrairement au commentaire et à CLAUDE.md. La fenêtre de dates n'y est pas non plus appliquée.
- **Correction :** compter les demandes comme en passe 2.
- **Fait le 2026-09-27 :** les deux passes partagent une même fonction · fenêtre de dates et unicité dans les deux sens. Tests : `releve-bancaire.spec.ts`.

**F63 · En-tête du lettrage : « aucun contrôle de clôture ici », alors que le service fige par la clôture** [saisie-21]
- **Emplacements :** src/modules/lettrage/lettrage.service.ts:75-90
- **Condition :** 5
- **Constat :** le commentaire dit le contraire du code, qui appelle `refuserSiLignesFigees`.
- **Correction :** réécrire l'en-tête et renvoyer à gel-cloture.ts.
- **Fait le 2026-09-27 :** en-tête réécrit, avec la lecture du cours CPCC (le lettrage se fait sur le report à-nouveau). Test : `gel-cloture.spec.ts`.

**F64 · Correction : « aucune des deux exceptions n'a de chemin », alors que la route existe** [saisie-22]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:1850-1853, :435
- **Condition :** 5
- **Constat :** `imputerAuxCapitauxPropresDOuverture` existe. Le commentaire et le message de refus déclarent la lacune à tort.
- **Correction :** renvoyer à cette route dans le commentaire et dans le refus.
- **Fait le 2026-09-27 :** commentaire et refus renvoient à l'imputation déclarée aux capitaux propres d'ouverture (fenêtre Exercices), le renvoi à « annuler la clôture » étant retiré. Test : `correction-negatif-service.spec.ts`.

**F65 · `modifier` dit refuser l'écriture d'une facture et la laisse modifier** [saisie-23]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:895-898 · detenteurs-ecriture.ts:55
- **Condition :** 5
- **Constat :** la facture est rangée dans ECRITURE_LAISSEE_PARTIR. L'écriture se modifie donc pendant que la facture la désigne toujours.
- **Correction :** compter la facture comme détentrice pour `modifier`, ou corriger le commentaire.
- **Fait le 2026-09-27 :** `modifier` refuse l'écriture qu'une facture désigne, en nommant la facture et le chemin (suppression au brouillard, la facture redevient à comptabiliser) ; la suppression reste permise. Tests : `brouillard.spec.ts`.

### Exercice, clôture, contrôles et révision

**F66 · La reprise d'un produit à recevoir double la créance au lieu de l'extourner** [rev-02]
- **Emplacements :** src/modules/regularisation/regularisation.service.ts:578-590
- **Condition :** 1
- **Constat :** le sens de la reprise est choisi par `estCharge`. Pour PRODUIT_A_RECEVOIR, la reprise reproduit l'écriture de constatation (D 418 / C 7x), et aucun test ne porte sur `reprendre`.
- **Correction :** prendre l'inverse exact de `debiteLeCompteDeGestion`, et tester chaque type.
- **Fait le 2026-09-27 :** la reprise lit la même règle que la constatation et en prend l'inverse. Test : `regularisation.spec.ts`, constatation plus reprise soldant chaque compte pour les cinq types ; vérifié sur base réelle (produit à recevoir).

**F67 · Charges à payer et produits à recevoir : servis par le serveur, absents de l'écran** [rev-03]
- **Emplacements :** client/src/pages/RegularisationPage.tsx:49-73, :160-168 · client/src/lib/types.ts:1703 · regularisation.service.ts:344-360
- **Condition :** 4
- **Constat :** l'écran ne connaît que trois types et n'envoie jamais `natureTiers`, et `simuler` applique le prorata au rattachement. Le rattachement, décrit comme livré, ne s'accomplit pas.
- **Correction :** exposer les deux types et la nature du tiers, faire rendre le montant entier par `simuler`, après correction de F66.
- **Fait le 2026-09-27 :** l'écran porte les cinq types et la nature du tiers que la table du serveur ouvre (`client/src/lib/regularisation-types.ts`) ; `simuler` rend le montant entier et le compte de tiers d'un rattachement ; la reprise affiche la date rendue par le serveur. Tests : `regularisation.spec.ts`, `regularisation-types.spec.ts`.

**F68 · Comptes dormants : solde multiplié par les reports, et comptes dormants à solde jamais signalés** [rev-06]
- **Emplacements :** src/modules/controles/controles.service.ts:535-590
- **Condition :** 1
- **Constat :** toutes les lignes de tous les exercices sont sommées, reports compris. Le report du 1er janvier compte en plus comme un mouvement, et `Math.max(...dates)` lève au-delà d'un gros volume.
- **Correction :** prendre le solde sur la balance du dernier exercice et le dernier mouvement hors clôture par `groupBy`.
- **Fait le 2026-09-27 :** le solde se lit par agrégats, à la règle de `balanceCumulee` (mouvements hors clôture, ouverture du seul premier exercice, soldes des comptes de gestion) ; le dernier mouvement ne compte ni report ni provisoire, et n'est cherché que pour les comptes dormants, une ligne par compte. Un compte que seul un report a touché n'est pas « jamais mouvementé ». Tests : `comptes-dormants.spec.ts`, `comptes-dormants-a-lecran.spec.ts`.

**F69 · Prorogation du SYCEBNL art. 22 servie aux sociétés, et sans limite de durée** [rev-08, mandat-02]
- **Emplacements :** src/modules/controles/controles.service.ts:2917-2977 · client/src/pages/MandatAuditeurPage.tsx:292-299 · mandat-auditeur.service.ts:157-169
- **Condition :** 1
- **Constat :** le contrôle 28 et l'aide citent l'art. 22 sans regarder le référentiel, et `echu` prend tout mandat échu, même ancien. Une SA lit que son commissaire est prorogé par un texte qui ne la régit pas.
- **Correction :** borner la prorogation au SYCEBNL et à l'exercice qui suit le dernier couvert.
- **Fait le 2026-09-27 :** la prorogation est servie par le texte du dossier (`regleDeProrogation`) et pour le seul exercice qui suit le dernier couvert (`estDansLaProrogation`). ÉCART À LA CORRECTION, LU AU TEXTE · l'AUSCGIE art. 709 proroge aussi le commissaire d'une SA, « sauf refus exprès », jusqu'à la plus prochaine assemblée ordinaire annuelle · la SA la reçoit donc, avec son article. La SARL n'en reçoit aucune (art. 377 ne renvoie qu'au choix, art. 381 à un texte hors corpus), ni refus à lui opposer. Tests : `mandat-auditeur.spec.ts`.

**F70 · Circularisation : taux de couverture calculé sur l'échantillon envoyé** [rev-09]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:439-452 · client/src/pages/CircularisationPage.tsx:419-421
- **Condition :** 1
- **Constat :** le dénominateur est le solde envoyé, alors que CLAUDE.md dit le total du cycle. Deux petites lettres confirmées affichent 100 %.
- **Correction :** prendre le total du cycle sur la balance comme dénominateur.
- **Fait le 2026-09-27 :** le taux rapporte les soldes confirmés des comptes du cycle au total du cycle à la date d'arrêté (`soldesDuCycle`, une seule lecture pour l'échantillon, la lettre et le taux), et l'écran nomme ce dénominateur. Tests : `circularisation.spec.ts`, `circularisation-gestes-a-lecran.spec.ts`.

**F71 · Demandes de confirmation ajoutées après l'envoi : jamais envoyées, oubliées à la clôture** [rev-10]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:191-195, :223-240, :367-369
- **Condition :** 3
- **Constat :** une demande A_ENVOYER ajoutée à une campagne envoyée ne part jamais, et la clôture ne la voit pas. Il n'y a pas non plus d'unicité par compte.
- **Correction :** refuser l'ajout hors préparation (ou envoyer les A_ENVOYER), bloquer la clôture sur A_ENVOYER, et poser l'unicité (campagneId, compteId).
- **Fait le 2026-09-27 :** l'ajout est refusé hors préparation, un second compte dans la même campagne aussi (index unique, migration `20261128000000_une_demande_par_compte`), la clôture refuse une demande jamais envoyée, et une demande qui n'est pas partie se retire (`DELETE /circularisation/demandes/:id`, bouton « Retirer ») · sans quoi le refus renvoyait à un geste impossible. Une campagne close ne se touche plus. Tests : `circularisation.spec.ts`, `circularisation-gestes-a-lecran.spec.ts`.

**F72 · Circularisation : solde lu à la fin de l'exercice, pas à la date d'arrêté** [rev-11]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:162, :205
- **Condition :** 1
- **Constat :** `balance` est appelée sans `arreteAu`. Une campagne intermédiaire envoie le solde de fin d'exercice.
- **Correction :** passer `dateArrete` et la borner à l'exercice.
- **Fait le 2026-09-27 :** la balance est lue à la date d'arrêté, livre-journal seul, et une date hors de l'exercice est refusée à la création de la campagne. Tests : `circularisation.spec.ts`.

**F73 · Faiblesses : escalade permise en mode « recommandation reçue »** [rev-13]
- **Emplacements :** src/modules/faiblesses/faiblesses.service.ts:481-510
- **Condition :** 1
- **Constat :** `escalader` requalifie la lettre d'un tiers, que `qualifier` refuse de toucher.
- **Correction :** poser le même refus.
- **Fait le 2026-09-27 :** `qualifier` et `escalader` passent par le même refus (`refuserSiLettreRecue`). Test : `faiblesses.spec.ts`.

**F74 · Faiblesses : report vers un registre d'une autre origine ou d'un exercice antérieur** [rev-14]
- **Emplacements :** src/modules/faiblesses/faiblesses.service.ts:418-470
- **Condition :** 1
- **Constat :** qualification, auteur et constat sont recopiés quelle que soit l'origine du registre cible, et un exercice antérieur est accepté.
- **Correction :** exiger la même origine et un exercice postérieur.
- **Fait le 2026-09-27 :** `motifRefusReport` exige la même origine et un exercice qui commence après celui de la source, lu dans les deux exercices ; l'écran ne propose que ces cibles (`client/src/lib/faiblesses-report.ts`). Tests : `faiblesses.spec.ts`, `faiblesses-report.spec.ts`.

**F75 · Questionnaire : réponse orpheline d'un item refermé, clôture bloquée** [rev-15]
- **Emplacements :** src/modules/questionnaire/questionnaire.service.ts:126, :298
- **Condition :** 3
- **Constat :** les exceptions sont comptées sur tous les items, y compris les items fermés, que l'utilisateur ne peut plus corriger.
- **Correction :** ne compter que les items ouverts, ou purger la réponse enfant au changement du parent.
- **Fait le 2026-09-27 :** les exceptions ne se comptent que sur les réponses d'items retenus et ouverts (`reponsesDesItemsOuverts`), à la clôture comme dans la synthèse ; la réponse refermée reste en base, rien n'est purgé. Test : `questionnaire.spec.ts`.

**F76 · Contrôle des conventions : confusion entre convention de bailleur et accord-cadre** [rev-16]
- **Emplacements :** src/modules/controles/controles.service.ts:2280-2292
- **Condition :** 1
- **Constat :** une association congolaise dont une subvention est échue lit qu'elle exerce « sans titre » au nom de l'art. 37.
- **Correction :** retirer la phrase sur l'art. 37.
- **Fait le 2026-09-27 :** le message ne vise plus que le reste à recevoir du bailleur ; l'accord-cadre garde son contrôle (29). Test : `convention-financement-controles.spec.ts`, qui gelait la phrase fausse.

**F77 · Brouillards invalidables comptés en retard par le planning et l'état du brouillard (correction F12 à moitié appliquée)** [rev-17, transv-12]
- **Emplacements :** src/modules/exercice/exercice.service.ts:316, :333-339 · src/modules/comptabilite/ecriture.service.ts:824, :1338-1383 · src/modules/controles/controles.service.ts:281, :863
- **Condition :** 1 et 5
- **Constat :** le contrôle 4 exclut l'à-nouveau provisoire et la clôture d'un exercice clos, mais pas le planning ni `brouillard()`. Un exercice clos garde à vie « écritures au brouillard, à valider », et `JOURS_CENTRALISATION` est déclaré deux fois.
- **Correction :** un module commun (délai, prédicat `brouillardInvalidable`, ancienneté) appelé par les trois.
- **Fait le 2026-09-27 :** `comptabilite/centralisation-brouillard.ts` porte le délai, `brouillardInvalidable`, son filtre de requête et l'ancienneté ; le contrôle 4, l'état du brouillard (qui rend désormais `invalidable`) et le planning l'appellent, et la constante n'est plus déclarée qu'une fois. Tests : `brouillard.spec.ts`, `planning-echeances.spec.ts`.

**F78 · Évolution mensuelle : la contrepassation de clôture présentée comme « Ouverture »** [rev-18]
- **Emplacements :** src/modules/controles/controles.service.ts:476-479 · client/src/pages/ControlesPage.tsx:310-331
- **Condition :** 1
- **Constat :** même racine que F5 : les classes 6 et 7 affichent en ouverture l'inverse du total de l'année.
- **Correction :** ne ranger en ouverture que le report daté du premier jour.
- **Fait le 2026-09-27 :** l'évolution mensuelle écarte l'écriture de solde des comptes de gestion, ni ouverture ni décembre (`controles.service.ts`). Test : `evolution-mensuelle.spec.ts`.

**F79 · Reprise de régularisation acceptée sur un exercice antérieur, en un seul clic** [rev-20]
- **Emplacements :** src/modules/regularisation/regularisation.service.ts:571 · client/src/pages/RegularisationPage.tsx:535-546
- **Condition :** 1
- **Constat :** seul l'exercice de constatation est refusé, et l'écran passe l'écriture dès le `onChange`.
- **Correction :** exiger un exercice postérieur, filtrer l'écran pareil, et confirmer.
- **Fait le 2026-09-27 :** la reprise exige un exercice qui commence après celui de la constatation (`exercicePosterieur`) ; l'écran ne propose que ceux-là (`exercicesDeReprise`) et demande confirmation avant de passer l'écriture. Tests : `regularisation.spec.ts`, `regularisation-types.spec.ts`.

**F80 · Aucun écran ne crée un exercice autre que le suivant** [chrome-07]
- **Emplacements :** src/modules/exercice/exercice.controller.ts:28-31 · client/src/pages/ExercicePage.tsx:246
- **Condition :** 4
- **Constat :** `POST /exercices` n'a aucun appel client. Un exercice antérieur (reprise), non contigu ou de liquidation ne peut pas être créé.
- **Correction :** ajouter un bloc « Créer un exercice » réservé à l'administrateur.
- **Fait le 2026-09-27 :** bloc replié « Créer un exercice » (début, fin, liquidation) dans la fenêtre Exercices, administrateur seul ; les règles de l'art. 7 restent celles du serveur. Test : `creer-exercice-a-lecran.spec.ts`.

**F81 · Planning de clôture : ni report de l'art. 110 bis, ni troncature du jour** [transv-09]
- **Emplacements :** src/modules/exercice/planning-cloture.ts:1033 · exercice.service.ts:368, :402 · retenues.service.ts:97, :187
- **Condition :** 1
- **Constat :** un jalon passe « en retard » dès minuit UTC du jour limite, et aussi un week-end ou un jour férié que le registre des retenues reporte. Le commentaire « UTC partout » est faux.
- **Correction :** une fonction d'échéance unique, avec report et comparaison au jour, dans une seule convention de fuseau.
- **Fait le 2026-09-27 :** `common/echeance.ts` · un jour est une date à minuit UTC, « aujourd'hui » le jour de Kinshasa, et une échéance n'est dépassée qu'au lendemain (`echeanceDepassee`). Le registre des retenues et `jour-ouvrable.ts` passent aux accesseurs UTC ; le planning reporte ses seules échéances fiscales (jalons 15, `echeanceFiscale`). Tests : `planning-echeances.spec.ts`, `report-jour-ouvrable.spec.ts` (trois fuseaux, en processus fils, heure d'été comprise).

### États financiers et notes

**F82 · Note 9 : cumul non arrêté à l'exercice demandé** [etats-03]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet.service.ts:330-337, :389-395
- **Condition :** 1
- **Constat :** une réimpression de N inclut N+1, contrairement au tableau emplois ressources de la même liasse.
- **Correction :** borner comme `balanceCumulee`.
- **Fait le 2026-09-27 :** couvert par F12 · la note 9 lit le cumul du projet par `balanceCumulee`, bornée aux exercices qui commencent au plus tard avec celui demandé (`ecriture.service.ts`). Tests : `balance-cumulee.spec.ts` (« s'arrête à l'exercice demandé »), `etats-financiers-projet.service.spec.ts`.

**F83 · Erreur avalée : toute panne du tableau budgétaire devient « aucun plan à budgets »** [notes-03, exp-02]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:1050-1055 · src/modules/exports/export.service.ts:4296-4308
- **Condition :** 3
- **Constat :** les deux `catch` nus remplacent toute erreur par le repli voulu. La note ou la grille vierge sort avec un motif faux.
- **Correction :** n'attraper que `NotFoundException`.
- **Fait le 2026-09-27 :** une exception propre, `AucunPlanABudgetsException`, et les deux `catch` ne rattrapent qu'elle · `NotFoundException` seul aurait aussi rattrapé un exercice introuvable. Tests : `note-annexe.service.spec.ts`, `liasse-etafi.spec.ts` (la panne ne frappe que la feuille, vu à la réinjection).

**F84 · Un compte rattaché sans solde devient invisible et impossible à détacher** [notes-04]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:601, :660-683 · client/src/components/NotesAnnexesRendu.tsx:230, :298-323
- **Condition :** 4
- **Constat :** la ligne non chiffrée est retirée et le bouton ✕ se bâtit sur les comptes mouvementés. Un rattachement erroné ne se défait plus.
- **Correction :** rendre les rattachements à part et bâtir la liste détachable dessus.
- **Fait le 2026-09-27 :** la ligne porte `comptesRattaches`, la ligne rattachée n'est plus retirée, et le bouton de détachement parcourt ces numéros (`note-annexe.service.ts`, `NotesAnnexesRendu.tsx`). Tests : `note-annexe.service.spec.ts`, `notes-rattachements.spec.ts`.

**F85 · Note 2 des SMT : « OmegaX ne tient pas d'inventaire physique », lacune déclarée à tort** [etats-06, efsy-02]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-smt.service.ts:627-652 · client/src/pages/EtatsSmtPage.tsx:521 · src/modules/etats-financiers-syscohada/etats-financiers-smt-syscohada.service.ts:1020, :1058 · client/src/pages/EtatsSmtSyscohadaPage.tsx:842
- **Condition :** 5
- **Constat :** `FicheInventaire`, `ArticleStock` et `MouvementStock` portent quantités et valeurs, et l'inventaire n'est pas masqué au SMT. Le cabinet ressaisit à la main ce que le dossier contient.
- **Correction :** servir quantité et valeur depuis la dernière campagne, sinon reformuler le motif.
- **Fait le 2026-09-27 :** servies depuis la dernière campagne de l'exercice qui a compté un stock (`stocks-depuis-inventaire.ts`), une ligne par fiche, quand les fiches d'un compte le reconstituent au centime ; sinon la ligne du compte reste et la raison est dite. Le total reste celui du bilan. Les deux SMT, leurs écrans et leurs liasses. Tests : `stocks-depuis-inventaire.spec.ts`, les deux specs de service SMT, `liasse-etafi.spec.ts`, `etats-a-lecran-f85-f92.spec.ts`.

**F86 · Exécution budgétaire : sous-totaux présentés comme des lignes de détail** [notes-05]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:1077-1084 · client/src/pages/EtatsFinanciersPage.tsx:991-1009
- **Condition :** 5
- **Constat :** `estTotal` est faux partout et `estRubrique` n'est pas lu : additionner la colonne compte chaque dépense deux fois.
- **Correction :** `estTotal: l.estRubrique` et un rendu distinct.
- **Fait le 2026-09-27 :** `estTotal: l.estRubrique` dans la note, et la ligne de rubrique en gras sur l'écran des états (`EtatsFinanciersPage.tsx`). Tests : `note-annexe.service.spec.ts`, `notes-rattachements.spec.ts`.

**F87 · Notes d'un exercice clos : saisies réécrites ou effacées sans trace** [notes-06]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:912-957 · src/common/audit/champs-audites.ts:275 · note-annexe.controller.ts:94-97
- **Condition :** 3
- **Constat :** `deleteMany` ou `upsert` sans lecture du statut, et `SaisieNote` est exclu de l'audit. La valeur antérieure est perdue.
- **Correction :** journaliser SaisieNote (ou refuser sur un exercice clos) et corriger le commentaire du rattachement.
- **Fait le 2026-09-27 :** journalisée, sans refus · une note se complète après la clôture du logiciel. `SaisieNote` entre à `MODELES_AUDITES`, et la cellule se retouche par son IDENTIFIANT (lue, puis modifiée, créée ou effacée) · un `deleteMany` ou un `upsert` sur la clé composée ne laissaient au journal aucun état antérieur. Commentaire corrigé · un rattachement n'est pas daté, il change la note de tous les exercices, clos compris. Tests : `note-annexe.service.spec.ts`, `classement-modeles.spec.ts`, `restitution.spec.ts`.

**F88 · Éligibilité SMT SYSCOHADA : verdict coloré qui compare des francs congolais à des F CFA** [efsy-03]
- **Emplacements :** src/modules/etats-financiers-syscohada/etats-financiers-smt-syscohada.service.ts:1439 · client/src/pages/EtatsSmtSyscohadaPage.tsx:1028
- **Condition :** 1
- **Constat :** la tenue est toujours en CDF, donc la comparaison n'a jamais d'objet, et pourtant elle colore trois verdicts.
- **Correction :** retirer le verdict tant qu'aucun cours n'est déclaré.
- **Fait le 2026-09-27 :** verdict retiré du service, du type et de l'écran · aucun cours n'est déclarable, la tenue étant toujours en francs. Test : `etats-financiers-smt-syscohada.service.spec.ts` (forme du seuil gelée).

**F89 · Postes internes RQP et TQP imprimés sur tout compte de résultat** [efsy-05]
- **Emplacements :** correspondance-compte-resultat-syscohada.ts:233, :439, :612 · src/modules/exports/export.service.ts:4982
- **Condition :** 5
- **Constat :** `REFS_POSTES_SUPPLEMENTAIRES` n'est lu par personne. Des clés internes partent en colonne REF de la liasse.
- **Correction :** filtrer RQP et TQP quand ils sont nuls, à l'écran et à l'export.
- **Fait le 2026-09-27 :** retirés du compte de résultat quand ils sont nuls en N, en N-1 et sur la même période ; servis, leur colonne REF reste vide (écran et liasse). Trouvé au passage · la formule de XE lisait « RQP » en « RQ » suivi de « P » et sortait illisible sur toute liasse SYSCOHADA ; une référence de formule est désormais un mot entier (`etat-etafi.ts`). Tests : `etats-financiers-syscohada.service.spec.ts`, `liasse-syscohada.spec.ts`.

**F90 · Situation intermédiaire au 31 décembre refusée à tort** [efsy-07]
- **Emplacements :** src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts:404 · client/src/pages/EtatsFinanciersSyscohadaPage.tsx:405
- **Condition :** 4
- **Constat :** `dateFin` est à minuit et l'arrêté à 23:59:59. On obtient un 400 « après la clôture », et le spec masque le cas.
- **Correction :** comparer à `finDeJournee(dateFin)` et aligner le spec.
- **Fait le 2026-09-27 :** `motifRefusDateArrete` compare à la fin de la journée de clôture ; les exercices du spec sont à minuit, comme en base. Tests : `situation-intermediaire.spec.ts`, `etats-financiers-syscohada.service.spec.ts`.

**F91 · Exports lancés depuis une situation intermédiaire : l'exercice entier est rendu** [efsy-08]
- **Emplacements :** client/src/pages/EtatsFinanciersSyscohadaPage.tsx:183, :199 · src/modules/exports/export.controller.ts:572
- **Condition :** 3
- **Constat :** `arreteAu` n'est pas transmis. Le fichier ne correspond pas à l'écran d'où il part.
- **Correction :** transmettre la date, ou désactiver les exports en le disant.
- **Fait le 2026-09-27 :** les deux exports se ferment tant qu'une date d'arrêté est posée, et l'écran le dit · une liasse est l'exercice entier. Test : `etats-a-lecran-f85-f92.spec.ts`.

**F92 · Comptes à solder à la clôture (104…) : constante jamais lue** [efsy-09]
- **Emplacements :** correspondance-bilan-syscohada.ts:261, :613
- **Condition :** 5
- **Constat :** les commentaires annoncent un signalement qui n'existe pas. Un 104 non soldé passe sans avertissement.
- **Correction :** lire la constante dans `bilan`, ou corriger les commentaires.
- **Fait le 2026-09-27 :** le bilan rend `comptesASolderALaCloture` (hors non rattachés, jamais sur une situation intermédiaire), l'écran et le contrôle du classeur les nomment avec leur fiche. Tests : `etats-financiers-syscohada.service.spec.ts`, `liasse-syscohada.spec.ts`.

**F93 · Tableau de bord d'un exercice clos : produits, charges et résultat à zéro** [pages-02]
- **Emplacements :** client/src/pages/DashboardPage.tsx:63-81
- **Condition :** 1
- **Constat :** le calcul se fait sur `solde`, que la clôture remet à zéro.
- **Correction :** calculer sur les mouvements hors clôture.
- **Fait le 2026-09-27 :** `indicateurs-tableau-de-bord.ts` lit les comptes de gestion hors colonne de clôture. Test : `indicateurs-tableau-de-bord.spec.ts`.

### Exports, documents obligatoires et restitution

**F94 · Trésorerie du rapport tirée du TFT associations pour tout dossier** [docob-02]
- **Emplacements :** src/modules/documents-obligatoires/rapport-activite.service.ts:120, :289-296 · export.service.ts:3158-3162 · client/src/pages/DocumentsObligatoiresPage.tsx:423-446
- **Condition :** 1
- **Constat :** une société SYSCOHADA, un projet ou un SMT reçoit l'indicateur « bouclé » d'un tableau qui n'est pas le sien.
- **Correction :** aiguiller la source selon le référentiel et le jeu, et rendre null sans TFT.
- **Fait le 2026-09-27 :** `tableauTresorerieDuDossier` choisit le TFT des associations, celui du Système normal SYSCOHADA, ou aucun (projets, deux SMT) ; la trésorerie figée porte son `tableau`, et une trésorerie plus ancienne ne se relit que chez une association (`tresorerieFigee`, `rapport-activite.service.ts`). Tests : `documents-obligatoires.spec.ts`.

**F95 · Livre d'inventaire et rapport SYSCOHADA : l'export et l'écran citent les articles SYCEBNL** [docob-03]
- **Emplacements :** src/modules/exports/export.service.ts:2941-2945, :2980, :3154 · rapport-activite.service.ts:105-108 · client/src/pages/DocumentsObligatoiresPage.tsx:226, :245-249, :323-331
- **Condition :** 1
- **Constat :** « Art. 14, point 1 », « article 24 » et « 16-3 » s'impriment pour une société, c'est-à-dire la transposition que CLAUDE.md interdit.
- **Correction :** faire porter par les services le libellé et l'article de sanction, et ajouter un test qui relit le classeur SYSCOHADA.
- **Fait le 2026-09-27 :** `fondementInventaire` (article, périmètre, sanction par `InventaireService.sanctionApplicable`) porté par la conformité du livre ; la fenêtre des événements postérieurs porte son article, et le refus d'une date antérieure cite le texte du dossier. Classeur et écran les lisent. Tests : `documents-obligatoires.spec.ts`, `parite-documents-obligatoires.spec.ts`, `documents-obligatoires-f95.spec.ts`.

**F96 · Restitution : une erreur de lecture d'une table n'est pas captée** [restit-01]
- **Emplacements :** src/modules/exports/restitution/restitution.service.ts:91-145, :259-281
- **Condition :** 6
- **Constat :** `lignesCsv` et `ligneDuDossierCsv` n'ont pas de protection, alors que le fichier décrit cette forme d'erreur comme fatale au serveur.
- **Correction :** envelopper les générateurs comme `contenuDocument`, consigner l'échec et détruire la sortie.
- **Fait le 2026-09-27 :** `lignesCsv` et `ligneDuDossierCsv` consignent l'échec et appellent `interrompre`, qui abandonne l'archive et DÉTRUIT la sortie ; `produire` attend la fin ou l'arrêt, `finalize` ne se résolvant plus sur une archive abandonnée (`restitution.service.ts`). Test : `restitution.spec.ts`.

**F97 · Manifeste et écran de restitution : « aucune pièce justificative numérisée », alors que les documents des tiers sont archivés** [restit-02, pages-05, doc-04]
- **Emplacements :** src/modules/exports/restitution/manifeste-restitution.ts:46-60, :71-74 · client/src/pages/RestitutionPage.tsx:45-58 · restitution.service.ts:233-243 · tables-restitution.ts:139-141 · prisma/schema.prisma:7647 · docs/restitution-du-dossier.md:25-27
- **Condition :** 5
- **Constat :** `DocumentTiers.contenu` est stocké et écrit dans `documents-tiers/`. Le manifeste affirme pourtant l'inverse, écrit « aucune autre colonne n'est retirée », et ne compte que trois imports.
- **Correction :** reformuler la réserve, nommer le dossier et la colonne sortis à part, corriger le décompte des imports et les specs.
- **Fait le 2026-09-27 :** manifeste, écran et document disent que les documents des tiers sont archivés dans `documents-tiers/`, que `DocumentTiers.contenu` sort à côté du CSV (seule colonne binaire, relue dans le schéma par un test), et nomment l'import général et les trois imports ciblés. Tests : `restitution.spec.ts`, `restitution-a-lecran.spec.ts`.

**F98 · Décompte « 54 tables » périmé** [restit-03, doc-04]
- **Emplacements :** restitution.service.ts:247 · lecture-bornee.spec.ts:129 · restitution.spec.ts:103, :230 · docs/restitution-du-dossier.md:19, :43
- **Condition :** 5
- **Constat :** le spec fige 126 modèles, la liste compte 121 tables et 17 bornes portées. Le chiffre écrit se lit comme une garantie.
- **Correction :** retirer les chiffres des commentaires, des titres de tests et du document.
- **Fait le 2026-09-27 :** « 54 tables » et « quinze modèles » retirés des commentaires, des titres de tests et de `docs/restitution-du-dossier.md` ; seul le décompte du test, qui existe pour tomber, reste en dur.

**F99 · Grand livre complet : la feuille Sommaire promise n'existe pas** [exp-03]
- **Emplacements :** src/modules/exports/export.service.ts:152, :790-891
- **Condition :** 5
- **Constat :** une seule feuille, sans totaux, et le brouillard y est mêlé sans colonne Statut.
- **Correction :** écrire le sommaire ou corriger la documentation, et ajouter Statut ou une mention.
- **Fait le 2026-09-27 :** feuille « Sommaire » (une ligne par compte et les totaux, depuis l'agrégat qui choisit les comptes) et colonne Statut sur chaque ligne ; `ouvrirFeuilleEnFlux` pose une feuille suivante après la première (`classeur-en-flux.ts`). Test : `grand-livre-complet-en-flux.spec.ts`.

**F100 · Exports du grand livre sans exerciceId obligatoire** [exp-04]
- **Emplacements :** src/modules/exports/export.controller.ts:28-40, :145-165
- **Condition :** 1
- **Constat :** sur appel direct, tous les exercices sont agrégés, reports compris, contre la règle EXERCICE_REQUIS posée par le contrôleur lui-même.
- **Correction :** poser EXERCICE_REQUIS.
- **Fait le 2026-09-27 :** `EXERCICE_REQUIS` sur les deux routes du grand livre (`export.controller.ts`). Test : `grand-livre-complet-en-flux.spec.ts`.

**F101 · Grand livre d'un compte et justificatif : classeur en mémoire sans plafond** [exp-05]
- **Emplacements :** src/modules/exports/export.service.ts:725-790, :1298-1420
- **Condition :** 6
- **Constat :** un compte de banque très mouvementé peut tuer le processus pour tous les cabinets.
- **Correction :** appeler `verifierVolume`, ou passer ces exports en flux.
- **Fait le 2026-09-27 :** `refuserClasseurEnMemoire` borne les deux classeurs encore bâtis en mémoire à 50 000 lignes, dernière mesure tenue, avec leur chemin de rechange ; `docs/capacite-mesuree.md` le dit. Test : `classeur-en-memoire-borne.spec.ts`.

**F102 · Documents remis à des tiers sans identification de l'entité ni de l'exercice** [exp-06]
- **Emplacements :** src/modules/exports/export.service.ts:2212-2291, :2599-2614, :2904-2927, :3099-3200
- **Condition :** 5
- **Constat :** la Note 9, le registre des donateurs, le livre d'inventaire et le rapport sortent sans cartouche, contre la règle du service et l'AUDCIF art. 22, 7°.
- **Correction :** `identiteLiasse`, `ecrireCartouche` et `numeroterPages`.
- **Fait le 2026-09-27 :** chaque feuille de la Note 9, du registre des donateurs, du livre d'inventaire et du rapport porte la coiffe d'identification (`coifferEtat`, entité, NIF, exercice, devise) et le pied numéroté et daté (`piedDePageEtat`), posés avant toute fusion. La coiffe des états périodiques a été retenue plutôt que le cartouche de la liasse · ces feuilles sont des tableaux, pas des pages du modèle. Test : `identification-documents-remis.spec.ts`.

**F103 · Deux commentaires contradictoires sur les notes non applicables** [exp-08]
- **Emplacements :** src/modules/exports/export.service.ts:2305-2311, :2503-2525
- **Condition :** 5
- **Constat :** le bandeau décrit l'ancien comportement. Un relecteur le rétablirait.
- **Correction :** réécrire le bandeau.
- **Fait le 2026-09-27 :** le bandeau dit l'écart assumé et renvoie à `construireClasseurNotes` ; le comportement reste gelé par `liasse-etafi.spec.ts`.

### Paie

**F104 · Quotité saisissable surestimée quand l'IRPP s'abstient** [paie-05]
- **Emplacements :** src/modules/personnel/personnel.service.ts:813 · quotite-saisissable.ts:382-388
- **Condition :** 1
- **Constat :** un impôt non chiffré est lu comme zéro dans la base de l'art. 114, sans abstention.
- **Correction :** passer null et s'abstenir (IMPOT_NON_CHIFFRE), de même pour la CNSS.
- **Fait le 2026-09-27 :** la simulation passe `null` à la quotité quand l'IRPP s'abstient, et quand aucune ligne de cotisation n'est à la charge du travailleur ; la quotité s'abstient alors (IMPOT_NON_CHIFFRE, COTISATION_NON_CHIFFREE) au lieu de lire zéro. Tests : `quotite-saisissable.spec.ts`, `simulation-paie.spec.ts`.

**F105 · Régime libératoire présumé au droit commun** [paie-06]
- **Emplacements :** src/modules/personnel/bareme-irpp.ts:49, :449-461 · personnel.service.ts:737-746
- **Condition :** 1
- **Constat :** `regimeApplicable` n'est appelé nulle part. Un employé de maison reçoit le barème progressif, contre le commentaire et CLAUDE.md.
- **Correction :** régime dans le DTO, abstention pour les régimes forfaitaires, ou retrait de la promesse.
- **Fait le 2026-09-27 :** `regimeSalarial` au DTO et à l'écran (« Régime de la retenue »), lu par `regimeApplicable` · un forfait de l'art. 121, alinéa 2 abstient la retenue, et un régime non déclaré garde le barème de l'art. 118 en le disant (`RESERVE_REGIME_NON_DECLARE`). Tests : `simulation-paie.spec.ts`, `personnel-regime-f105.spec.ts`.

**F106 · Réserve affichée « la quotité de l'art. 114 n'est pas calculée » sous une quotité calculée** [paie-07]
- **Emplacements :** src/modules/personnel/cotisations-paie.ts:451 · client/src/pages/PersonnelPage.tsx:2441
- **Condition :** 5
- **Constat :** garantie négative périmée, figée dans chaque bulletin.
- **Correction :** remplacer la réserve et geler la bonne par un test.
- **Fait le 2026-09-27 :** la réserve dit que la quotité est calculée à part, sur le minimum de la classe et après la défalcation du logement en nature ; la bulle de la saisie, qui disait encore qu'un logement en nature empêche le calcul, est corrigée du même geste. Tests : `cotisations-paie.spec.ts`, `personnel-regime-f105.spec.ts`.

**F107 · La suppression de l'écriture de paie est réécrite à la main** [paie-10]
- **Emplacements :** src/modules/personnel/comptabilisation-paie.service.ts:134-138, :152-183
- **Condition :** 5
- **Constat :** les gardes de `EcritureService.supprimer` et `retirerCompensation` sont en partie dupliquées : la même règle est écrite deux fois.
- **Correction :** appeler ces méthodes.
- **Fait le 2026-09-27 :** défaire la passation appelle `EcritureService.supprimer` en se nommant détenteur (`DETENTEUR_PAIE_DU_MOIS`), et la compensation d'un second clic `retirerCompensation`, qui délie désormais les bulletins dans sa propre transaction (`liberer`). Les gardes recopiées avaient oublié le pointage. Tests : `comptabilisation-paie.service.spec.ts`, `compensation-ecriture.spec.ts`.

**F108 · Montants de bulletin modèle à deux décimales refusés** [paie-11]
- **Emplacements :** src/modules/personnel/modeles-bulletin.ts:76
- **Condition :** 4
- **Constat :** la comparaison flottante refuse 19,99, 1,1 et 1234,1.
- **Correction :** tolérance, ou calcul en centimes.
- **Fait le 2026-09-27 :** les décimales se comptent sur l'écriture du nombre (`common/decimales.ts`, comme `maxDecimalPlaces`), pour les bulletins modèles ET pour les lots de virements, qui portaient le même défaut. Tests : `decimales.spec.ts`, `modeles-bulletin.spec.ts`, `lots-virement.spec.ts`.

**F109 · En-têtes et docstrings de paie qui nient ce que le module fait** [paie-13]
- **Emplacements :** src/modules/personnel/personnel.service.ts:95, :479-485, :885-889 · client/src/pages/PersonnelPage.tsx:18-20 · livre-de-paie.ts:118-119, :138 · assiettes-paie.ts:51-52 · cotisations-paie.ts:5-8
- **Condition :** 5
- **Constat :** « aucun bulletin », « aucune cotisation patronale », « arrêté pas lu » (alors que `lu: true`), « 1 à 30 » (au lieu de 33), et taux renvoyés à un fichier qui dit n'en porter aucun.
- **Correction :** réécrire selon l'état actuel.
- **Fait le 2026-09-27 :** en-têtes du service, de l'écran, du livre de paie (33 énonciations, `lu: true`), des assiettes et des cotisations réécrits ; la docstring du DTO et la bulle de la saisie demandaient d'y porter la quote-part CNSS, que la simulation déduit déjà · corrigées, libellé « Autres retenues art. 71 ». Les taux chiffrés dans `cotisations-paie.ts` sont confrontés aux citations du registre des retenues. Tests : `cotisations-paie.spec.ts`, `personnel-audit-final.spec.ts`.

**F110 · Date d'effet INPP : CLAUDE.md et un document affirment le 1er janvier 2026, le code la signature** [paie-14, transv-17, doc-02]
- **Emplacements :** CLAUDE.md:1316-1330, :1428-1442 · docs/paie-recherche-textes-2026-09-19.md:112-123, :144, :192 · src/modules/personnel/cotisations-paie.ts:104-148 · correspondance-retenues.ts:457-460
- **Condition :** 5
- **Constat :** le paragraphe « ILS NE SONT PLUS QUATRE » garde une correction déclarée fausse ailleurs dans le même fichier et annonce l'annexe du décret n° 25/22 à verser. Le docblock de `baremeDuMois` contredit sa comparaison au mois.
- **Correction :** barrer le paragraphe, poser un bandeau sur le document de recherche, aligner le docblock.
- **Fait le 2026-09-27 :** date relue à l'arrêté (art. 3, « à la date de sa signature », 24 septembre 2025), paragraphe barré dans CLAUDE.md, bandeau sur le document de recherche (INPP et art. 139), docblock de `baremeDuMois` aligné sur sa comparaison au mois. Comportement déjà gelé par `cotisations-paie.spec.ts`.

**F111 · Arrondi de l'art. 150 : appliqué à l'IRPP par la fiscalité, refusé par la paie** [transv-05]
- **Emplacements :** src/modules/personnel/bareme-irpp.ts:100 · src/modules/fiscalite/fiscalite.service.ts:73, :105 · CLAUDE.md:1237
- **Condition :** 1
- **Constat :** deux modules lisent la même loi et donnent deux réponses sur la retenue.
- **Correction :** trancher par écrit, appliquer ou corriger CLAUDE.md, et n'avoir qu'un seul porteur de l'arrondi.
- **Fait le 2026-09-27 :** tranché par le texte · l'art. 150 nomme l'IRPP, et l'art. 119 appelle IRPP la retenue mensuelle. La retenue du mois est arrondie (jamais l'impôt annuel de la mensualisation), l'écart s'affiche sur sa ligne, et `fiscalite/arrondi-article-150.ts` est le seul porteur. Tests : `bareme-irpp.spec.ts`, `personnel-audit-final.spec.ts`.

**F112 · Plancher d'assiette CNSS au SMIG affirmé par le registre, absent du moteur** [transv-06]
- **Emplacements :** src/modules/personnel/cotisations-paie.ts:312-320 · src/modules/retenues/correspondance-retenues.ts:447 · CLAUDE.md:1213
- **Condition :** 1
- **Constat :** décret n° 18/041 art. 8 et loi n° 16/009 art. 13 lus. Le moteur ne pose ni plancher ni réserve.
- **Correction :** appliquer le plancher ou s'abstenir avec motif.
- **Fait le 2026-09-27 :** `plancherCnss` · base CNSS relevée au SMIG journalier du manœuvre × jours payés (26 à défaut) ; sous le plancher sans jours déclarés, la CNSS s'abstient et les demande ; mai à décembre 2025 (payé 14 500, fixé 21 500) non tranché, abstention ; avant mai 2025, non vérifié et dit. L'INPP et l'ONEM restent sur l'assiette. Champ « Jours payés » à l'écran. Tests : `cotisations-paie.spec.ts`, `simulation-paie.spec.ts`, `personnel-audit-final.spec.ts`.

**F113 · « Jour de Kinshasa » écrit trois fois, ignoré par la remise du bulletin** [transv-11]
- **Emplacements :** src/modules/personnel/conversion-usd.ts:41 · plateforme/licences-sur-site.service.ts:16 · abonnements/abonnements.service.ts:45 · personnel/bulletin-paie.ts:175-181
- **Condition :** 5
- **Constat :** entre 0 h et 1 h, une remise faite le jour même est refusée comme future.
- **Correction :** un module commun, utilisé aussi par `motifRefusRemise`.
- **Fait le 2026-09-27 :** `jourDeKinshasaIso` rejoint `common/echeance.ts` ; les licences sur site et les abonnements l'appellent au lieu de leur copie, et `motifRefusRemise` compare le jour déclaré au jour de Kinshasa de l'émission et de l'instant. Tests : `common/echeance.spec.ts`, `bulletin-paie.spec.ts` (remise déclarée à 0 h 30, heure de Kinshasa).

### Fiscalité, facturation et commerce

**F114 · La pièce imprimée affiche un « Montant TTC » sans les autres impôts et taxes** [fact-03]
- **Emplacements :** src/modules/facturation/mentions-facture.ts:532-550 · client/src/pages/FacturationPage.tsx:654-657
- **Condition :** 1
- **Constat :** le total imprimé est inférieur à ce que la pièce facture elle-même.
- **Correction :** inclure ces taxes, ou renommer le total, et tester l'impression.
- **Fait le 2026-09-27 :** `totauxFacture` rend `montantAutresImpotsEtTaxes` et le TTC les comprend ; la pièce imprimée porte leur ligne quand la facture en déclare. Tests : `facturation.spec.ts`, `facturation-audit-final.spec.ts` (écran).

**F115 · Le registre des retenues range la retraite complémentaire (432) sous la CNSS** [ret-02]
- **Emplacements :** src/modules/retenues/correspondance-retenues.ts:437-440, :479
- **Condition :** 1
- **Constat :** 43200000 (complémentaire) et 4322/4328 sont comptés et datés comme de la CNSS.
- **Correction :** borner la CNSS à 431 et 4321, verser le reste aux autres organismes, et ajouter un test sur les semis.
- **Fait le 2026-09-27 :** CNSS sur 431 et 4321, hors 4314 ; autres organismes sur 432, 433, 438 et 4314, hors 4321, 4334 et 4335 ; une seule règle (`compteRelevantDe`) sert le registre. Test : `cnss-comptes-semes.spec.ts`, qui relit les deux semis.

**F116 · Facture passée au journal : compte de TVA non routé et ligne au taux zéro omise** [fact-04]
- **Emplacements :** src/modules/facturation/comptabilisation-facture.service.ts:74 · ecriture-facture.ts:80, :189 · client/src/lib/tva-saisie.ts:139, :176
- **Condition :** 5
- **Constat :** la règle de `tva-saisie.ts` est réécrite autrement. L'exportation ne compte plus au prorata.
- **Correction :** module commun de routage et du taux zéro, avec un test de parité.
- **Fait le 2026-09-27 :** `tva/routage-tva.ts`, version serveur de la règle de la saisie, et `routage-tva-parite.spec.ts` exécute les deux versions sur tous les comptes 2, 6 et 7 des deux semis. Le compte de TVA suit la contrepartie parmi les subdivisions ouvertes, à défaut le compte du taux ; une ligne imposable au taux zéro pose sa ligne de TVA à zéro avec son taux, sans jamais se fondre dans celle à 16 %. Tests : `comptabilisation-facture.spec.ts`, `ecriture-facture.spec.ts`.

**F117 · L'état détaillé de l'art. 134 garde les factures annulées par une note** [fact-05]
- **Emplacements :** src/modules/facturation/facturation.service.ts:475-485
- **Condition :** 1
- **Constat :** l'état recense une TVA dont la déduction a été reprise.
- **Correction :** écarter ou montrer à part les factures barrées.
- **Fait le 2026-09-27 :** l'état lit la note qui barre chaque facture. Barrée par une note du mois, la facture sort des lignes et des totaux ; barrée par une note postérieure, elle reste (déductible quand la déclaration est partie) et la reprise est dite au mois de la note. Les deux sont montrées à part, avec leur motif (décret n° 011/42, art. 127). Lecture d'OmegaX, le texte ne réglant pas l'état d'une facture barrée. Tests : `facturation.spec.ts`, `facturation-audit-final.spec.ts`.

**F118 · Une acceptation arrivée après le délai forme le contrat** [com-01]
- **Emplacements :** src/modules/commercial/commercial.service.ts:227-238 · vente-commerciale.ts:245, :273-282
- **Condition :** 1
- **Constat :** aucun contrôle de la date limite : le logiciel inscrit un contrat sur une offre qu'il déclare lui-même inacceptable (AUDCG art. 243).
- **Correction :** refuser ou qualifier distinctement l'acceptation tardive, et tester.
- **Fait le 2026-09-27 :** une acceptation (ou modification non substantielle) parvenue après la date limite laisse l'offre CADUQUE et ne forme aucun contrat (art. 243 et 244) · l'AUDCG ne réglant pas l'acceptation tardive, OmegaX garde le fait sans en faire un contrat ni un refus. Sans délai stipulé, rien n'est tranché. Le refus et la contre-proposition gardent leur sens. À l'écran, une offre caduque sans réponse reçoit encore une réponse (pas la révocation), et l'étiquette dit « réponse tardive ». Tests : `commercial.spec.ts`, `devis-audit-final.spec.ts`.

**F119 · La suppression d'une facture portée par une écriture n'est pas refusée au serveur** [fact-06]
- **Emplacements :** src/modules/facturation/facturation.service.ts:431-455 · client/src/pages/FacturationPage.tsx:198-203
- **Condition :** 3
- **Constat :** contrairement au commentaire, une note de crédit se supprime aussi et débarre la facture qu'elle annulait.
- **Correction :** refuser la suppression si `ecritureId` est posé ou si la pièce est une note de crédit.
- **Fait le 2026-09-27 :** `supprimer` refuse une pièce passée au journal (l'écriture se retire d'abord, au brouillard) et une note de crédit, qui débarrerait la facture qu'elle annule ; l'écran ne propose plus « Supprimer » sur une note. Tests : `note-de-credit.spec.ts`, `facturation-audit-final.spec.ts`.

**F120 · Taux de TVA d'une ligne de facture non vérifié comme appartenant au dossier** [fact-07, transv-16]
- **Emplacements :** src/modules/facturation/facturation.service.ts:218, :237, :293, :414 · comptabilisation-facture.service.ts:32, :74
- **Condition :** 2
- **Constat :** tiers et écriture sont vérifiés, le taux non. `LigneFacture` n'a pas de `tenantId`, donc la garde ne voit pas le lien.
- **Correction :** `tauxTva.findMany({ id: { in }, tenantId })`, refus de tout identifiant absent.
- **Fait le 2026-09-27 :** l'enregistrement refuse un taux absent du dossier ; la passation relit le dossier du taux de chaque ligne et refuse avant toute écriture (`facturation.service.ts`, `comptabilisation-facture.service.ts`). Tests : `facturation.spec.ts`, `comptabilisation-facture.spec.ts`.

**F121 · Le taux d'un taux de TVA mouvementé se modifie et réécrit les prorata passés** [tva-02]
- **Emplacements :** src/modules/tva/dto/taux-tva.dto.ts:25-45 · taux-tva.service.ts:714-718, :813-818
- **Condition :** 3
- **Constat :** la base hors taxes est reconstituée avec le taux courant.
- **Correction :** refuser la modification d'un taux référencé.
- **Fait le 2026-09-27 :** `modifier` refuse de changer le pourcentage d'un taux porté par une ligne d'écriture ou de facture (nouveau taux, ancien en sommeil) ; intitulé et comptes restent libres. Test : `taux-tva-modification.spec.ts`.

**F122 · Les comptes d'un taux de TVA ne se complètent pas depuis l'écran** [tva-03]
- **Emplacements :** client/src/pages/TauxTvaPage.tsx:100-102 · ecriture-facture.ts:191 · tva-saisie.ts:155 · taux-tva.service.ts:2394
- **Condition :** 4
- **Constat :** deux messages renvoient à un geste inexistant, et la liquidation saute ces lignes.
- **Correction :** rendre les comptes modifiables, dans la limite de F121.
- **Fait le 2026-09-27 :** « Modifier » dans Taux de taxes (intitulé, pourcentage si le serveur l'admet, deux comptes). Et le défaut trouvé en passant, plus large : la liquidation soldait le compte du TAUX, si bien qu'une TVA routée au 4432 laissait le 4431 débiteur et le 4432 créditeur, et qu'une ligne sur un taux sans compte déséquilibrait l'écriture. La déclaration cumule désormais aussi compte par compte (`parCompte`), la liquidation solde chaque compte réellement mouvementé, et la déduction admise se répartit au centime (`repartirAuCentime`, un écart au-delà de l'arrondi est un défaut qui lève). Tests : `declaration-familles-tva.spec.ts`, `taux-tva-modification.spec.ts`, `taux-tva-audit-final.spec.ts`.

**F123 · Exonérations : arrêté accordé sans référence ni dates, fin de validité jamais déduite** [exo-01]
- **Emplacements :** client/src/pages/ExonerationsPage.tsx:84-110 · src/modules/exonerations/exonerations.service.ts:135-169
- **Condition :** 4
- **Constat :** l'alerte de renouvellement ne s'arme jamais.
- **Correction :** saisie au passage à ACCORDÉ, et déduction de la fin dans `modifier`.
- **Fait le 2026-09-27 :** passer à ACCORDÉ (à la création comme à la modification) exige la référence et la date de l'arrêté et, pour un arrêté à durée, le début de validité (`motifRefusAccorde`) ; la fin se déduit aussi dans `modifier`. L'écran ouvre la saisie de l'arrêté au choix du statut. Une pièce cochée sur un dossier accordé n'est pas refusée. Tests : `exonerations.spec.ts`, `exonerations-audit-final.spec.ts`.

**F124 · La contre-proposition n'a aucun geste à l'écran** [com-02]
- **Emplacements :** client/src/pages/DevisPage.tsx:99-114 · src/modules/commercial/commercial.service.ts:159-178
- **Condition :** 4
- **Constat :** `contrePropositionDeId` n'est jamais envoyé : la négociation s'arrête et aucune offre d'un client ne s'enregistre.
- **Correction :** bouton « Enregistrer la contre-proposition ».
- **Fait le 2026-09-27 :** un devis rejeté substantiellement et sans suite propose « Enregistrer la contre-proposition », qui préremplit le formulaire (client, nature, objet) et envoie `contrePropositionDeId` ; le serveur inverse l'émetteur. Test : `devis-audit-final.spec.ts`.

**F125 · Réserves INPP et ONEM : promesse de rappel non tenue, liquidation niée, date fausse** [ret-03]
- **Emplacements :** src/modules/retenues/correspondance-retenues.ts:461-474 · retenues.service.ts:190-194
- **Condition :** 5
- **Constat :** l'effectif n'est jamais lu, « le logiciel ne liquide rien » contredit la paie, et « la veille » devrait être « le lendemain ».
- **Correction :** réécrire les réserves.
- **Fait le 2026-09-27 :** les deux réserves renvoient le calcul à la paie (fenêtre Personnel), l'INPP s'y abstenant sans nature ni effectif, et disent que le registre recense sans recalculer ; « la veille » devient « le lendemain ». Test : `reserves-inpp-onem.spec.ts`.

### Immobilisations, stocks, inventaire et provisions

**F126 · L'écriture d'acquisition est postée avant les refus (unités d'œuvre, SMT, lieu)** [immo-07]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:889, :921-933
- **Condition :** 3
- **Constat :** l'écriture reste orpheline au brouillard, et une nouvelle tentative double le 2x.
- **Correction :** déplacer les contrôles avant l'écriture.
- **Fait le 2026-09-27 :** résolu avec F29 · `creer` joue tous ses contrôles (unités d'œuvre, SMT, lieu, composant) avant l'écriture d'acquisition, et la retire si la fiche est refusée par la base. Tests : `renouvellement-f29.spec.ts`, « F29 · la création d'un bien ne laisse jamais une écriture sans fiche ».

**F127 · La sortie d'un bien principal laisse ses composants en service** [immo-08]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:2176-2415
- **Condition :** 3
- **Constat :** c'est le défaut que le schéma dit vouloir empêcher.
- **Correction :** refuser tant qu'un composant est en service, ou le sortir avec le principal.
- **Fait le 2026-09-27 :** `sortir` refuse un principal qui porte encore un composant en service, en les nommant, avant tout geste · la sortie de chaque composant est une décision (cession, mise au rebut, renouvellement) qui ne se prend pas d'office. Tests : `sortie-f27-f28.spec.ts`.

**F128 · Mode aux unités d'œuvre et durée propre inaccessibles depuis l'écran, mode de la famille ignoré** [immo-10]
- **Emplacements :** client/src/pages/ImmobilisationsPage.tsx:210, :922 · immobilisation.service.ts:920 · dto/immobilisation.dto.ts:37
- **Condition :** 4
- **Constat :** le formulaire n'envoie ni le mode, ni les unités, ni la durée, et `famille.modeAmortissement` n'est pas lu.
- **Correction :** champs au formulaire et héritage du mode de la famille.
- **Fait le 2026-09-27 :** le bien hérite du mode de sa famille quand il n'en déclare pas (`creer`), avec les préalables de ce mode ; le formulaire propose le mode, le total d'unités prévues et l'unité, sauf au SMT SYSCOHADA (Titre X, linéaire). La durée propre était déjà envoyée. Tests : `renouvellement-f29.spec.ts`, `immobilisations-audit-final.spec.ts`.

**F129 · La mise en sommeil d'une famille n'a aucun effet** [immo-11]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:557, :813 · client/src/pages/ImmobilisationsPage.tsx:725
- **Condition :** 5
- **Constat :** la création accepte une famille inactive, qui reste listée.
- **Correction :** refuser au serveur et filtrer le sélecteur.
- **Fait le 2026-09-27 :** `creer` refuse une famille en sommeil avant toute écriture, et le formulaire ne propose que les familles actives. Les biens déjà portés par la famille ne bougent pas. Tests : `renouvellement-f29.spec.ts`, `immobilisations-audit-final.spec.ts`.

**F130 · L'écriture du produit de cession n'est rattachée à rien** [immo-12]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:2394-2403 · src/modules/comptabilite/detenteurs-ecriture.ts:23
- **Condition :** 3
- **Constat :** elle se supprime depuis le journal pendant que la fiche garde le prix de cession.
- **Correction :** colonne `ecritureProduitCessionId` en RESTRICT, inscrite dans `COLONNES_QUI_RETIENNENT`.
- **Fait le 2026-09-27 :** `Immobilisation.ecritureProduitCessionId` (unique, `onDelete: Restrict` déclaré au schéma, migration `20261129000000`, dérive vérifiée nulle sur une base jetable), posée par `sortir` et remise à nul par `defaireSortie`, inscrite dans `COLONNES_QUI_RETIENNENT` et comptée par `detenteursDe`. Tests : `sortie-f27-f28.spec.ts`.

**F131 · Les deux tableaux calculent la valeur nette sans les dépréciations** [immo-13]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1344, :1523
- **Condition :** 1
- **Constat :** le fichier dit lui-même qu'une valeur nette sans 29 contredit la balance.
- **Correction :** charger et retrancher les dépréciations, ou ajouter la colonne.
- **Fait le 2026-09-27 :** les deux tableaux portent une colonne « Dépréciations » (cumul des 29, dotations moins reprises, à la date d'arrêté ou à la clôture de l'exercice) et la valeur nette la retranche, à l'écran comme dans le classeur, où la formule devient brut − amortissements − dépréciations. Tests : `tableaux-immobilisations.spec.ts`, `formules-excel.spec.ts`, `immobilisations-audit-final.spec.ts` (sept mutations tuées).

**F132 · Dérogatoire non protégé contre le double envoi** [immo-14]
- **Emplacements :** src/modules/immobilisations/degressif.service.ts:138, :192, :230
- **Condition :** 3
- **Constat :** en cas de P2002, l'écriture 851/151 reste orpheline.
- **Correction :** compensation comme dans `passerDotation`, et réponse 409.
- **Fait le 2026-09-27 :** `passer` et `solder` enregistrent la fiche par `enregistrer` · si elle est refusée, l'écriture 851/151 (ou 151/861) est retirée par la compensation commune (`retirerCompensation`), et un doublon répond 409. Tests : `amortissement-degressif.spec.ts` (trois mutations tuées).

**F133 · Mouvement de magasin : sortie supérieure au stock acceptée, sans correction possible** [stk-03]
- **Emplacements :** src/modules/stocks/magasin.service.ts:248, :302 · magasin.controller.ts:56
- **Condition :** 4
- **Constat :** la fiche ne se valorise plus et aucune route ne corrige un mouvement.
- **Correction :** refuser au serveur, et ouvrir une annulation motivée.
- **Fait le 2026-09-27 :** toute saisie qui rendrait une sortie impossible est refusée, la sienne comme une sortie déjà enregistrée après une sortie antidatée, en la nommant (`sortiesAuDelaDuStock`, rejeu en quantités sur la chronologie de la valorisation) ; une fiche déjà fausse ne bloque pas ce qui la corrige. Un mouvement s'annule avec son motif (`annuleLe`, `annulePar`, `motifAnnulation`, migration `20261130000000`, dérive nulle), refusé dans un exercice clôturé ou s'il servait une sortie ; annulé, il reste sur la fiche, sort de la valorisation, de la confrontation et des détenteurs de son écriture, que la fiche nomme tant qu'elle est au journal. Tests : `magasin-annulation-f133.spec.ts`, `magasin-audit-final.spec.ts`, `detenteurs-ecriture.spec.ts` (dix mutations tuées).

**F134 · Le statut RECENSEMENT n'est jamais atteint** [inv-01]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:817, :874 · client/src/pages/InventairePage.tsx:322
- **Condition :** 5
- **Constat :** les PV ne s'établissent qu'après le rapprochement, qu'ils devraient précéder.
- **Correction :** ajouter la transition, ou admettre PREPARATION.
- **Fait le 2026-09-27 :** le premier comptage saisi (quantité ou valeur) fait passer la campagne au recensement, et le PV d'une caisse s'établit dès la préparation, qu'il fait aussi passer au recensement ; une pièce ou un emplacement corrigés ne sont pas un comptage. Tests : `inventaire-audit-final.spec.ts` (serveur et écran).

**F135 · Le refus de rapprocher renvoie à une suppression de fiche qui n'existe pas** [inv-02]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:456 · inventaire.controller.ts:86
- **Condition :** 4
- **Constat :** la valoriser à zéro fabrique un manquant.
- **Correction :** ouvrir la suppression en préparation, ou corriger le message.
- **Fait le 2026-09-27 :** `DELETE /inventaire/fiches/:id`, en préparation et au recensement seulement, et le bouton « Retirer » à l'écran ; le refus de rapprocher dit « retirer celles qui n'ont pas lieu d'être ». Tests : `inventaire-audit-final.spec.ts`, `routes-avec-geste.spec.ts`.

**F136 · La sous-commission d'une fiche n'est pas vérifiée** [inv-03]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:377, :407
- **Condition :** 2
- **Constat :** une sous-commission d'une autre campagne ou d'un autre dossier est acceptée.
- **Correction :** lecture bornée par dossier et par campagne.
- **Fait le 2026-09-27 :** à la création comme au comptage, la sous-commission est lue bornée au dossier ET à la campagne de la fiche (`sousCommissionDeLaCampagne`). Tests : `inventaire-audit-final.spec.ts` (quatre mutations tuées).

**F137 · Une consignation est enregistrée même quand sa proposition d'écriture échoue** [emb-01]
- **Emplacements :** src/modules/emballages/emballages.service.ts:98, :111 · emballages.controller.ts:33
- **Condition :** 3
- **Constat :** des doublons EN_COURS s'accumulent dans les totaux, et aucune route ne les supprime.
- **Correction :** vérifier le compte du tiers avant la création, et ouvrir la suppression.
- **Fait le 2026-09-27 :** la proposition d'ouverture se calcule avant la création (compte du tiers, montant) et son refus empêche l'enregistrement ; `DELETE /emballages/consignations/:id` retire une consignation en cours et non rattachée, avec son bouton à l'écran. Tests : `consignation-audit-final.spec.ts`, `routes-avec-geste.spec.ts` (quatre mutations tuées).

**F138 · Le compte d'une provision n'est contrôlé ni contre le dossier ni contre sa nature** [prv-01]
- **Emplacements :** src/modules/provisions/provisions.service.ts:332-376 · client/src/pages/ProvisionsPage.tsx:257
- **Condition :** 2
- **Constat :** seul l'écran filtre. Le rapprochement publié peut viser un compte étranger à la nature de la provision.
- **Correction :** lecture bornée au dossier et racine exigée par `naturesDuReferentiel`.
- **Fait le 2026-09-27 :** `verifierCompte` lit le compte borné au dossier et exige la racine que `naturesDuReferentiel` donne à la nature, à la création comme à la modification (nature ou compte changé seul). Tests : `provisions.spec.ts` (quatre mutations tuées).

### Analytique, plan comptable et EBNL

**F139 · Rattachement d'une exécution : seules 200 écritures sont proposées, sans le dire** [analytique-04]
- **Emplacements :** src/modules/analytique/engagement.service.ts:320-327 · client/src/pages/EngagementsPage.tsx:74-78
- **Condition :** 3
- **Constat :** au-delà de 200 écritures, la facture est introuvable et le reste reste en Engagement.
- **Correction :** recherche côté serveur, ou `tronque` et `total`.
- **Fait le 2026-09-27 :** la route rend `{ ecritures, total, tronque }` et cherche au serveur (libellé, référence, numéro de pièce) ; l'écran porte la recherche et dit la tranche. Tests : `engagement-de-depense.spec.ts`, `engagements-audit-final.spec.ts`.

**F140 · Une écriture au brouillard se rattache à un engagement** [analytique-05]
- **Emplacements :** src/modules/analytique/engagement.service.ts:201-213, :314-319
- **Condition :** 1
- **Constat :** contraire au commentaire. Une même écriture peut aussi servir à plusieurs engagements.
- **Correction :** refuser le non-validé et borner le cumul rattaché.
- **Fait le 2026-09-27 :** une écriture au brouillard est refusée, et le cumul des rattachements d'une pièce, tous engagements du dossier confondus, est borné au total de ses débits. Tests : `engagement-de-depense.spec.ts` (six mutations tuées avec F139).

**F141 · Ventilation et OD analytique : même objet, deux règles** [analytique-06]
- **Emplacements :** src/modules/analytique/analytique.service.ts:399-447 · od-analytique.ts:46-62
- **Condition :** 5
- **Constat :** la ventilation accepte une classe non ventilée et des montants négatifs.
- **Correction :** fonction commune de refus.
- **Fait le 2026-09-27 :** `ventilerLigne` appelle les deux refus de l'OD (`motifRefusClasseVentilee`, `motifRefusMontantAnalytique`) · classe suivie par chaque plan touché, aucun montant négatif ni porté des deux côtés. Tests : `analytique.service.spec.ts` (trois mutations tuées).

**F142 · Suppression d'une section engagée : erreur technique, budget perdu** [analytique-07]
- **Emplacements :** src/modules/analytique/analytique.service.ts:149-161, :234-249 · prisma/schema.prisma:2467
- **Condition :** 5
- **Constat :** les engagements ne sont pas comptés, et `budgetSection.deleteMany` passe avant l'échec.
- **Correction :** `referencesVers` et un refus nommé.
- **Fait le 2026-09-27 :** section et plan se jugent par `referencesVers` (lu dans le schéma, liste d'identifiants admise pour les sections d'un plan), budgets seuls exclus, et le refus nomme chaque usage ; les suppressions passent en une transaction. Tests : `suppression-et-exercice-clos.spec.ts` (cinq mutations tuées).

**F143 · Budgets et engagements modifiables sur un exercice clos** [analytique-08]
- **Emplacements :** src/modules/analytique/engagement.service.ts:120-125, :189-239 · analytique.service.ts:285 · od-analytique.service.ts:140-142
- **Condition :** 5
- **Constat :** l'OD, elle, le refuse. La note budgétaire d'un exercice déposé change.
- **Correction :** même refus sur CLOTURE.
- **Fait le 2026-09-27 :** une seule règle (`exercice-budgetaire-clos.ts`) appelée par la dotation, la retouche d'un mois, le report des budgets, les six gestes sur un engagement, et la suppression d'une section ou d'un plan dotés sur un exercice clôturé ; l'écran masque ces gestes. Tests : `suppression-et-exercice-clos.spec.ts`, `engagement-de-depense.spec.ts`, `budgets-engagements-exercice-clos.spec.ts` (dix mutations tuées).

**F144 · Le plan comptable refuse les numéros de plus de 8 chiffres** [comptes-02]
- **Emplacements :** client/src/pages/PlanComptesPage.tsx:627-628
- **Condition :** 4
- **Constat :** l'écran impose `\d{3,8}` alors que la longueur est paramétrable jusqu'à 13.
- **Correction :** borner par `longueurCompte`.
- **Fait le 2026-09-27 :** `/auth/me` porte `longueurCompte`, le champ Numéro s'y borne, et changer la longueur relit la session. Tests : `me-fait-ong-etrangere.spec.ts`, `plan-comptes-longueur.spec.ts`.

**F145 · Décomptes périmés : plan SYSCOHADA à « 1401 » et « trente et une relations »** [comptes-03, doc-13]
- **Emplacements :** src/modules/comptes/compte-seed-syscohada.ts:64-65 · CLAUDE.md:187, :4337 · src/modules/auth/auth.service.ts:91 · inscription-transaction.spec.ts:112
- **Condition :** 5
- **Constat :** le spec fige 1443 comptes, et le schéma porte 34 relations.
- **Correction :** écrire la règle, pas un nombre.
- **Fait le 2026-09-27 :** les commentaires du semis, de l'inscription et de ce fichier ne portent plus de décompte · le seul chiffre reste celui de `compte-seed-syscohada.spec.ts`, dont la fonction est de tomber.

**F146 · « OmegaX ne détient aucun effectif » : garantie négative périmée affichée à l'utilisateur** [accord-01, doc-03]
- **Emplacements :** src/modules/accord-cadre/accord-cadre.service.ts:118-137 · client/src/pages/AccordCadrePage.tsx:202 · dto/accord-cadre.dto.ts:48 · CLAUDE.md:3890-3892 · personnel.service.ts:946-1003
- **Condition :** 5
- **Constat :** le registre du personnel calcule la part nationale expressément pour cet engagement.
- **Correction :** proposer la part (sans la substituer) et corriger les quatre phrases.
- **Fait le 2026-09-27 :** une seule lecture du registre (`personnel/effectif-registre.ts`) sert la fenêtre Personnel et l'état de l'accord-cadre (`propositionMainOeuvre`), la déclaration est pré-remplie et reste modifiable ; les phrases du service, du DTO, du contrôle, de l'aide et de ce fichier disent la règle en vigueur. Tests : `accord-cadre.spec.ts` (quatre mutations tuées), `accord-cadre-proposition.spec.ts`.

**F147 · Montant accordé d'une convention inférieur au total des tranches** [bailleurs-01]
- **Emplacements :** src/modules/bailleurs/convention-financement.service.ts:258-293, :327-336
- **Condition :** 1
- **Constat :** `modifier` ne relit pas les tranches, et le reste à recevoir est borné à zéro.
- **Correction :** refuser comme `ajouterTranche`.
- **Fait le 2026-09-27 :** `modifier` charge les tranches et refuse un montant accordé inférieur à leur total, avec le chiffre. Tests : `convention-de-financement.spec.ts` (doublure qui honore l'`include`, mutations tuées).

**F148 · Simulateur : prévu annuel face à un réalisé arrêté en cours d'année** [simulations-01]
- **Emplacements :** src/modules/simulations/simulations.service.ts:114-128 · client/src/pages/SimulationsBudgetairesPage.tsx:213
- **Condition :** 1
- **Constat :** sur un exercice clos, le prorata vaut 1 quelle que soit la date d'arrêté.
- **Correction :** calculer le prorata sur la date d'arrêté.
- **Fait le 2026-09-27 :** le prorata suit la date d'arrêté quel que soit le statut ; sans date, l'arrêté borné à la fin de l'exercice rend 1 par le calcul. Tests : `simulateur-budgetaire.spec.ts` (l'ancien code réinjecté tombe).

**F149 · Modèle de règlement : échéance négative possible, paramètre sans effet** [tiers-02]
- **Emplacements :** src/modules/tiers/tiers.service.ts:482-520, :544-593
- **Condition :** 1
- **Constat :** un Équilibre qui n'est pas en dernier rend une échéance négative. Le modèle n'est lu par aucune saisie, et le commentaire est périmé.
- **Correction :** placer l'Équilibre en dernier, et le dire à l'écran.
- **Fait le 2026-09-27 :** l'Équilibre est refusé ailleurs qu'en dernier et rien ne s'ajoute après lui ; le calcul le joue en dernier (modèles anciens) et borne pourcentage et montant au reste ; la bulle du simulateur dit la règle et que le modèle n'est appliqué par aucune saisie ; le commentaire périmé est réécrit. Tests : `modele-reglement-f149.spec.ts` (quatre mutations tuées), `modele-reglement-aide.spec.ts`.

### Groupe, consolidation et monnaie fonctionnelle

**F150 · Une participation ne se modifie pas, et sa suppression efface sans prévenir** [conso-01]
- **Emplacements :** src/modules/consolidation/perimetre.service.ts:305 · consolidation.controller.ts:67 · prisma/schema.prisma:6857 · client/src/pages/PerimetreConsolidationPage.tsx:342, :437
- **Condition :** 3
- **Constat :** le refus invite à « modifier » sans route pour le faire, et « Retirer » emporte l'acquisition et les écarts d'évaluation sans confirmation.
- **Correction :** route de modification rejouée par l'analyse, et confirmation des suppressions.
- **Fait le 2026-09-27 :** une participation se modifie (`PATCH /consolidation/liens/:id`, droits de vote et capital) et le périmètre est REJOUÉ par le moteur avant l'écriture · une participation croisée ou un total au-delà de 100 % est refusé ; les deux boutons Retirer demandent confirmation. Tests : `perimetre.service.spec.ts` (quatre cas), `perimetre-participation-f150.spec.ts`.

**F151 · Réserves du cumul contradictoires sur les éliminations fiscales** [conso-02]
- **Emplacements :** src/modules/consolidation/cumul.service.ts:613, :616 · client/src/pages/CumulConsolidation.tsx:706
- **Condition :** 5
- **Constat :** deux réserves affichées ensemble se contredisent.
- **Correction :** réécrire la première.
- **Fait le 2026-09-27 :** la première réserve du cumul dit que les balances des filiales sont réputées retraitées aux règles du groupe (D4C ch. XII-3) et que les éliminations fiscales, elles, sont jouées ; l'en-tête du moteur est réécrit. Test : `cumul.service.spec.ts`.

**F152 · TFT consolidé : mouvements bruts sans élimination des réciproques** [conso-04]
- **Emplacements :** src/modules/consolidation/flux-capitaux-consolides.ts:17 · cumul-consolidation.ts:1180, :1231
- **Condition :** 1
- **Constat :** un prêt intragroupe reste lu en investissement et en financement, alors que ZG est juste.
- **Correction :** refuser le tableau sur les comptes concernés, ou déclarer la part des mouvements à éliminer.
- **Fait le 2026-09-27 :** une opération réciproque portée sur un compte que le tableau des flux lit en MOUVEMENTS (`postesLisantEnMouvement`, table du ch. 5 lue, exclusions comprises) est nommée parmi les obstacles du tableau · l'élimination ne porte que sur le solde. Une créance ou une dette d'exploitation, lue en variation, n'est pas visée. Tests : `cumul-consolidation.spec.ts`, `correspondance-tft-syscohada.spec.ts`.

**F153 · Un siège « projets de développement » reçoit une liasse de groupe au modèle des associations** [groupe-02]
- **Emplacements :** src/modules/groupe/groupe.service.ts:179, :188-193
- **Condition :** 4
- **Constat :** le jeu du siège n'est pas lu, contrairement à CLAUDE.md § 6.
- **Correction :** reprendre le jeu du siège et ne remplacer que le SMT.
- **Fait le 2026-09-27 :** la combinaison reprend le jeu d'états du siège · seul le SMT est remplacé par les associations. Tests : `liaison-etablissements-syscohada.spec.ts` (câblage compris, doublure qui honore le `select`).

**F154 · Provisions et balance fonctionnelle choisissent d'office l'exercice le plus récent** [mf-04, pages-10]
- **Emplacements :** client/src/pages/BalanceFonctionnellePage.tsx:24-35 · client/src/pages/ProvisionsPage.tsx:209-212
- **Condition :** 5
- **Constat :** `useExercice` n'est pas lu, contrairement à la règle de `resoudreExercice`.
- **Correction :** initialiser sur l'exercice du contexte.
- **Fait le 2026-09-27 :** les deux fenêtres partent de l'exercice du contexte et ne retombent sur la liste qu'à défaut. Test : `exercice-du-contexte-f154.spec.ts`.

**F155 · Monnaie fonctionnelle : le cours « de SA date » est en fait le dernier cours connu** [doc-10]
- **Emplacements :** src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts:47-70, :105-111 · CLAUDE.md:605-610
- **Condition :** 5
- **Constat :** CLAUDE.md et le commentaire exigent l'arrêt de l'état sur une date sans cours. La mention imprimée dit « au cours de SA date ».
- **Correction :** une seule règle aux trois endroits.
- **Fait le 2026-09-27 :** le commentaire, la mention imprimée et le refus disent la même règle · le cours EN VIGUEUR à la date de l'écriture (le dernier saisi à cette date ou avant, jamais un postérieur). Test : `balance-fonctionnelle.spec.ts`.

### Sécurité, rôles et sessions

**F156 · La restriction de saisie par journal se contourne par la réimputation au brouillard** [socle-03]
- **Emplacements :** src/common/perimetre/extension-perimetre-journaux.ts:62 · src/modules/comptabilite/ecriture.service.ts:1544
- **Condition :** 2
- **Constat :** l'extension ne regarde que `Ecriture`, alors que la réimputation écrit sur `LigneEcriture`.
- **Correction :** vérifier le périmètre dans `reimputer`, ou étendre l'extension.
- **Fait le 2026-09-27 :** l'extension du périmètre de saisie garde aussi `LigneEcriture` · une écriture sur une ligne qui touche la saisie relit le journal de son écriture (création, modification, suppression, upsert), le lettrage et le pointage passant. Tests : `extension-perimetre-journaux.spec.ts` (cinq mutations tuées).

**F157 · Un administrateur peut se rétrograder et laisser le dossier sans administrateur** [socle-04]
- **Emplacements :** src/modules/utilisateurs/utilisateur.service.ts:117 · plateforme.service.ts:422
- **Condition :** 4
- **Constat :** la console ne peut pas rattraper ce cas, qui ne se règle alors que par SQL.
- **Correction :** refuser tout changement qui laisse le dossier sans administrateur actif.
- **Fait le 2026-09-27 :** un geste qui retire au dernier administrateur ACTIF son rôle ou son activité est refusé, décompte et écriture sous un verrou par dossier dans la transaction · deux administrateurs qui se rétrogradent l'un l'autre au même instant ne passent pas tous les deux. Tests : `dernier-administrateur.spec.ts` (neuf mutations tuées).

**F158 · Créer un utilisateur dont l'adresse existe ailleurs rend 500** [socle-05]
- **Emplacements :** src/modules/utilisateurs/utilisateur.service.ts:38-43
- **Condition :** 4
- **Constat :** la garde rend null, puis P2002 remonte faute de filtre.
- **Correction :** rattraper P2002 comme `changerAdresse`.
- **Fait le 2026-09-27 :** la contrainte d'unicité est rattrapée en 409, même message qu'à la lecture, sans dire à qui l'adresse appartient ; une autre panne remonte telle quelle. Test : `dernier-administrateur.spec.ts`.

**F159 · Hors de deux transactions, le journal d'audit atteste des actes annulés** [socle-06]
- **Emplacements :** src/common/audit/extension-audit.ts:277-288 · contexte-audit.ts:31 · src/modules/import/import.service.ts:564
- **Condition :** 3
- **Constat :** le maillon est écrit sur une connexion à part et survit à l'annulation. Chaque écriture prend en outre une seconde connexion.
- **Correction :** utilitaire unique autour de `journaliserDansTransaction`, test de source, et mise à jour du commentaire.
- **Fait le 2026-09-27 :** toute transaction du serveur passe par `transactionJournalisee` (common/audit/transaction-journalisee.ts), qui pose `journaliserDansTransaction` · vingt-quatre transactions et les huit formes TABLEAU converties, `avecRetrySerialisable`, l'inscription et l'import compris. Un test de source, commentaires retirés, refuse un `$transaction(` écrit ailleurs ; le commentaire de `contexte-audit.ts` est réécrit. Tests : `transaction-journalisee.spec.ts` (cinq mutations tuées), doublures des huit services converties.

**F160 · L'adresse IP hachée dans le journal d'audit est choisie par le client** [socle-07]
- **Emplacements :** src/common/audit/audit-contexte.interceptor.ts:30-33
- **Condition :** 3
- **Constat :** la première entrée de X-Forwarded-For se forge.
- **Correction :** utiliser `requete.ip` avec le bon nombre de sauts de confiance.
- **Fait le 2026-09-27 :** `requete.ip` seul, et le nombre de relais de confiance vient d'une règle (`common/sauts-de-confiance.ts`) · deux en ligne (Firebase Hosting puis Cloud Run), aucun sur site, `SAUTS_PROXY_CONFIANCE` prime et une valeur illisible arrête le démarrage. Avec un seul relais, le journal et la limitation de débit voyaient l'adresse du relais Firebase. Reste un appel direct à l'adresse `*.run.app`, qui se ferme dans l'infrastructure. Tests : `sauts-de-confiance.spec.ts` (Express réel, six mutations tuées).

**F161 · Le type « Éditeur » s'attribue encore à la création d'un cabinet et se transmet aux cellules** [socle-08]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:129-135, :342, :354 · dto/plateforme.dto.ts:38 · src/modules/groupe/groupe.service.ts:294 · src/modules/auth/dto/register.dto.ts:52
- **Condition :** 2
- **Constat :** contraire au geste nommé unique que prévoit CLAUDE.md.
- **Correction :** refuser PROPRIETAIRE à ces portes, et faire naître la cellule sous une licence ordinaire.
- **Fait le 2026-09-27 :** `AuthService.register`, pipeline commun de toutes les créations, refuse la licence de l'éditeur AVANT toute écriture ; la cellule ne pouvait déjà pas naître d'un siège éditeur (F46). Test : `inscription-transaction.spec.ts`.

**F162 · La console renvoie la double authentification à la fenêtre Utilisateurs** [socle-10, plateforme-07, doc-16]
- **Emplacements :** src/modules/plateforme/operateur-plateforme.guard.ts:31-33 · client/src/pages/UtilisateursPage.tsx:236 · client/src/components/ModaleMonCompte.tsx:78
- **Condition :** 5
- **Constat :** l'activation se fait dans Fichier > Mon compte…
- **Correction :** corriger le message.
- **Fait le 2026-09-27 :** le refus dit « activez-la dans Fichier > Mon compte… ». Test : `plateforme.spec.ts`.

**F163 · Commentaires du socle qui contredisent le code ou CLAUDE.md** [socle-11]
- **Emplacements :** src/common/guards/mot-de-passe-a-changer.guard.ts:20 · src/modules/auth/auth.service.ts:110 · src/modules/tenant/dto/parametres-dossier.dto.ts:220 · prisma/schema.prisma:454 · src/modules/licence/licence.guard.ts:5
- **Condition :** 5
- **Constat :** « GLOBAL, à dessein » (contre § 8), documents obligatoires « propres au SYCEBNL », phrase ASBL fausse, méthode inexistante, « Phase 1 ».
- **Correction :** réécrire les cinq commentaires.
- **Fait le 2026-09-27 :** les cinq commentaires disent le code · garde appelée par `JwtAuthGuard`, documents obligatoires communs, assujettissement à la TVA par le chiffre d'affaires (décret n° 011/42 art. 42), `modifierLongueurCompte`, et la garde de licence sans « Phase 1 ».

**F164 · Session expirée en cours de travail : aucune reprise, « Unauthorized » partout** [chrome-02]
- **Emplacements :** client/src/lib/api.ts:40-60 · client/src/App.tsx:11-21
- **Condition :** 4
- **Constat :** aucun traitement global du 401, et un message anglais.
- **Correction :** vider la session, renvoyer à la connexion, et message français côté serveur.
- **Fait le 2026-09-27 :** `JwtAuthGuard.handleRequest` rend un 401 en français marqué `session: 'perdue'` (une autre panne remonte telle quelle) ; le client lit ce drapeau à ses trois appels (`refus`), ferme la session qu'il tenait ouverte et l'écran de connexion affiche le motif. Un 401 sans drapeau (mot de passe actuel faux) ne déconnecte personne. Tests : `session-perdue.spec.ts` serveur et client (six mutations tuées).

**F165 · Le message de session perdue accuse les cookies tiers** [chrome-03]
- **Emplacements :** client/src/lib/auth.tsx:92-97, :125 · client/src/lib/api.ts:43-45 · client/src/lib/session-refusee.spec.ts:27-33
- **Condition :** 5
- **Constat :** depuis le relais `/api`, le cookie est de première partie. Le diagnostic est faux et le spec le fige.
- **Correction :** message exact, commentaires et spec corrigés.
- **Fait le 2026-09-27 :** le message dit que le navigateur n'a pas gardé le cookie de session et invite à vérifier les cookies du site ; commentaires et spec corrigés. Test : `session-refusee.spec.ts`.

### Plateforme, sur site, relances

**F166 · La relance préventive annonce la date du jour comme échéance** [relances-01]
- **Emplacements :** src/modules/relances/relances.service.ts:93, :120, :497, :528
- **Condition :** 1
- **Constat :** `{date}` vaut la date du courrier.
- **Correction :** un jeton dédié à l'échéance dans les modèles préventifs.
- **Fait le 2026-09-27 :** jeton `{echeance}` (échéance la plus ancienne des lignes réclamées), porté par les deux avis préventifs livrés ; une migration réécrit les modèles restés exactement ceux livrés, jamais un texte retouché. Les jetons sont dits dans une bulle du formulaire. Tests : `etats-de-relance.spec.ts`, `niveaux-relance-referentiel.spec.ts`, `remise-a-lecran.spec.ts`.

**F167 · Relance émise avec un niveau d'un autre état : comptes écartés sans un mot** [relances-02]
- **Emplacements :** src/modules/relances/relances.service.ts:449, :540 · client/src/pages/RelancesPage.tsx:105, :188
- **Condition :** 3
- **Constat :** les niveaux ne sont pas filtrés par type, et `continue` est muet.
- **Correction :** filtrer les niveaux, et rendre les exclus dans le bilan.
- **Fait le 2026-09-27 :** niveaux filtrés par l'état demandé, au serveur comme au sélecteur de l'écran ; un compte désigné sans rien à réclamer revient dans `sansObjet` avec son numéro et le motif de l'état, et la phrase d'émission le dit. Tests : `etats-de-relance.spec.ts`, `remise-a-lecran.spec.ts`.

**F168 · Préventive : retard toujours nul, niveau « -7 jours » proposé pour toute échéance future** [relances-03]
- **Emplacements :** src/modules/relances/relances.service.ts:423
- **Condition :** 1
- **Constat :** l'accumulateur part de 0.
- **Correction :** l'initialiser à -Infinity.
- **Fait le 2026-09-27 :** accumulateur à -Infinity. Test : `etats-de-relance.spec.ts`.

**F169 · Dernier niveau ancien qui bloque toute suggestion, historique chargé en entier** [relances-04]
- **Emplacements :** src/modules/relances/relances.service.ts:372, :438, :455
- **Condition :** 3
- **Constat :** « tout sélectionner » omet un client relancé il y a un an.
- **Correction :** ne retenir que les relances postérieures à l'échéance ouverte la plus ancienne, et borner la lecture.
- **Fait le 2026-09-27 :** seules comptent les relances postérieures à la plus ancienne PIÈCE encore ouverte du compte, et la lecture est bornée aux comptes retenus et à cette date. Écart voulu avec la correction proposée · borné à l'échéance, un avis préventif (parti avant elle) serait resuggéré chaque jour. Test : `etats-de-relance.spec.ts`.

**F170 · Le dossier de combinaison consomme le plafond de dossiers sur site** [surSite-02]
- **Emplacements :** src/modules/auth/auth.service.ts:83 · src/modules/groupe/groupe.service.ts:159
- **Condition :** 4
- **Constat :** `tenant.count()` n'a pas de filtre.
- **Correction :** `where: { combinaisonPour: null }`.
- **Fait le 2026-09-27 :** `where: { combinaisonPour: null }`. Test : `sur-site-divers.spec.ts`, doublure qui honore le filtre.

**F171 · « L'installation sur site relève de la phase 4 » : refus et paragraphes périmés** [plateforme-05, pages-06]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:112, :132 · client/src/pages/PlateformePage.tsx:544-546, :709 · src/modules/licence/licence.service.ts:17
- **Condition :** 5
- **Constat :** le sur site est livré par fichier signé, et le texte oriente vers une licence SaaS.
- **Correction :** nouveau motif, et explication déplacée dans `Aide`.
- **Fait le 2026-09-27 :** motif `MOTIF_SUR_SITE_NON_ATTRIBUABLE` (la licence sur site est un fichier signé, émis dans « Licences sur site ») ; une ligne sous chaque sélecteur, l'explication dans une bulle ; commentaires du service, de la licence et du schéma corrigés. Tests : `plateforme.spec.ts`, `licence-sur-site-non-attribuable.spec.ts`.

**F172 · Rattachement par la console sans le système comptable du siège** [plateforme-06]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:296-323 · src/modules/tenant/tenant.service.ts:202-224
- **Condition :** 5
- **Constat :** contraire à CLAUDE.md § 6 (« imposé aux deux portes »).
- **Correction :** comparer le système, et refuser sa modification sur une cellule ou une mère.
- **Fait le 2026-09-27 :** la console comparait déjà le système au rattachement (F47, `creation-cellule-f47.spec.ts`) ; `modifierSystemeSyscohada` refuse désormais sur une cellule et sur un siège qui a des cellules. Test : `coordonnees-dossier.spec.ts`.

**F173 · Abonnements hors du dossier de l'éditeur : « aucun dossier d'éditeur désigné »** [plateforme-08]
- **Emplacements :** src/modules/plateforme/abonnements/abonnements.service.ts:101, :226
- **Condition :** 5
- **Constat :** la lecture est cloisonnée, et le vrai refus n'est jamais atteint.
- **Correction :** lecture dans une sortie déclarée.
- **Fait le 2026-09-27 :** `PlateformeService.dossierEditeurId`, dans une sortie de cloisonnement déclarée (la liste des sorties reste inchangée). Tests : `plateforme.spec.ts`, `abonnements.service.spec.ts`.

**F174 · Garnissage de vitrine en échec : vitrine partielle impossible à refaire** [plateforme-09]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:547-601
- **Condition :** 3
- **Constat :** le dossier est marqué avant le garnissage.
- **Correction :** garnir avant de marquer, ou « regarnir » idempotent.
- **Fait le 2026-09-27 :** le garnissage se reprend sans rien recréer (tiers par son code, écriture par journal, date et libellé) ; une vitrine sans aucune écriture validée est complétée au lieu d'être refusée, et l'écran le dit avec l'adresse de la vitrine. Tests : `garnissage-demonstration.spec.ts`, `dossier-demonstration.spec.ts`, `demonstration-console.spec.ts`.

**F175 · Fenêtre Utilisateurs : deux actions avalent le refus du serveur** [utilisateurs-01]
- **Emplacements :** client/src/pages/UtilisateursPage.tsx:75, :118
- **Condition :** 3
- **Constat :** ni déverrouiller ni changer de rôle n'affichent l'erreur.
- **Correction :** try/catch comme `basculerActif`.
- **Fait le 2026-09-27 :** try/catch sur déverrouiller et changer de rôle, comme `basculerActif`. Test : `utilisateurs-refus.spec.ts`.

**F176 · Politique de confidentialité inexacte : destinataires tus, cloisonnement « au niveau de la base »** [confidentialite-01, pages-07]
- **Emplacements :** client/src/pages/ConfidentialitePage.tsx:81, :116, :123-125
- **Condition :** 5
- **Constat :** la messagerie SMTP et l'archive GitHub ne sont pas nommées, rien n'est prévu pour le sur site, et aucune RLS n'existe.
- **Correction :** nommer les prestataires, ajouter une variante sur site, et écrire « au niveau de chaque requête du serveur ».
- **Fait le 2026-09-27 :** GitHub et la messagerie nommés (le nom du prestataire SMTP reste à arrêter par VMG, et la page le dit) ; variante sur site lue sur `/sur-site/etat` ; « au niveau de chaque requête du serveur ». Test : `confidentialite-code-numerique.spec.ts`.

### Interface

**F177 · Échap ferme la fenêtre active en même temps que le menu ou la bulle : la pièce en cours est perdue** [chrome-01]
- **Emplacements :** client/src/components/chrome/Fenetre.tsx:110-118 · MenuBar.tsx:168 · Aide.tsx:79 · ModaleCorrection.tsx:90 · OutilsChrome.tsx:78
- **Condition :** 3
- **Constat :** quatre écouteurs réagissent sans `preventDefault`, et la saisie n'a pas de brouillon.
- **Correction :** respecter `defaultPrevented`, et demander confirmation si la pièce n'est pas enregistrée.
- **Fait le 2026-09-27 :** `lib/echap.ts` · une couche (menu, bulle, calculette, modale de correction) écoute en capture et consomme la touche quand elle agit ; la fenêtre ne se ferme que sur une touche libre et jamais sous une modale (`PortailModale` pose `data-modale`). La fermeture consulte les gardes (`useGardeFermeture`), et la saisie déclare sa pièce non enregistrée. Test : `echap.spec.ts`, `modales-dans-l-ecran.spec.ts`.

**F178 · Profil SMT : Devises masquée alors que la paie en dollars exige le cours du jour** [chrome-05]
- **Emplacements :** client/src/lib/profil-dossier.ts:28-30 · src/modules/personnel/conversion-usd.ts:61
- **Condition :** 4
- **Constat :** le message renvoie à une fenêtre invisible pour ce profil.
- **Correction :** retirer `/devises` de la liste, en masquant seulement la réévaluation.
- **Fait le 2026-09-27 :** `/devises` reste au SMT ; la réévaluation devient une sous-fonction (`sousFonctionServie('reevaluation')`), masquée dans Devises sauf si le dossier en porte déjà. Test : `profil-dossier.spec.ts`.

**F179 · Sauvegardes sur site : un échec de lecture s'affiche « Aucune copie »** [chrome-08]
- **Emplacements :** client/src/components/SauvegardesSurSite.tsx:44-52, :88-93, :124-125
- **Condition :** 3
- **Constat :** l'erreur est avalée et affichée comme un constat.
- **Correction :** afficher l'erreur, et distinguer « lu » de « vide ».
- **Fait le 2026-09-27 :** la liste part de null, un 403 masque le cadre, toute autre erreur s'affiche ; « Aucune copie » ne se dit que sur une liste lue, et une relecture échouée ne fait plus dire la sauvegarde ratée. Test : `sauvegardes-sur-site.spec.ts`.

**F180 · « À propos » annonce une « Version de développement »** [chrome-09]
- **Emplacements :** client/src/components/chrome/AProposModale.tsx:46 · package.json:3 · client/package.json:3
- **Condition :** 5
- **Constat :** aucun identifiant n'est affiché, alors que `finMaintenance` borne les versions sur site.
- **Correction :** injecter version et commit, avec la date du paquet sur site.
- **Fait le 2026-09-27 :** `vite.config.ts` pose version, révision (commit de la construction) et date ; `lib/version.ts` compose la ligne, ce qui manque se dit, et la date du paquet s'ajoute sur site. Test : `version.spec.ts`.

**F181 · Tableau de bord : un échec laisse « Chargement… » indéfiniment** [pages-03]
- **Emplacements :** client/src/pages/DashboardPage.tsx:38-43, :208
- **Condition :** 4
- **Constat :** aucun rejet géré.
- **Correction :** un état d'erreur affiché.
- **Fait le 2026-09-27 :** les deux lectures ont leur second argument ; « Indicateurs indisponibles » et « Dernières écritures illisibles » avec le motif, avant tout « Chargement… ». Test : `echecs-de-lecture-dits.spec.ts`.

**F182 · Journal d'audit : le filtre ne propose que 26 des 92 modèles** [pages-04]
- **Emplacements :** client/src/pages/JournalAuditPage.tsx:42, :151, :240 · src/common/audit/champs-audites.ts:22
- **Condition :** 5
- **Constat :** RIB, ordres de virement et bulletins ne sont pas filtrables.
- **Correction :** liste servie par le serveur, gelée par un test.
- **Fait le 2026-09-27 :** `GET /journal-audit/objets` (`libelles-objets-audites.ts`), un libellé par modèle de `MODELES_AUDITES`, ni plus ni moins ; l'écran ne tient plus de table. Tests : `libelles-objets-audites.spec.ts`, `journal-audit-fenetre.spec.ts`.

**F183 · Inventaire : un échec de lecture des caisses s'affiche « Aucune caisse sans PV »** [pages-08]
- **Emplacements :** client/src/pages/InventairePage.tsx:116, :1026
- **Condition :** 3
- **Constat :** l'erreur se lit comme une réponse favorable.
- **Correction :** un état null distinct, avec l'erreur affichée.
- **Fait le 2026-09-27 :** les caisses partent de null, un échec les remet à null avec son motif, et « Aucune caisse » ne se dit que sur une liste lue. Test : `echecs-de-lecture-dits.spec.ts`.

**F184 · Mandat : un échec s'affiche « Aucun mandat enregistré »** [pages-09]
- **Emplacements :** client/src/pages/MandatAuditeurPage.tsx:75-90, :280
- **Condition :** 3
- **Constat :** un échec de lecture passe pour une absence de mandat.
- **Correction :** initialiser à null et afficher l'erreur.
- **Fait le 2026-09-27 :** les mandats partent de null, la relecture pose l'erreur sans lever, et l'enregistrement refuse de compter le rang sur une liste non lue. Test : `echecs-de-lecture-dits.spec.ts`.

### Performance

**F185 · Lectures sans borne des écritures et des lignes sur les routes de travail** [saisie-17, rev-19, infra-02]
- **Emplacements :**
- **Complété le 2026-09-28 :** la clôture et l'à-nouveau provisoire ne lisent plus une à une que les lignes NON lettrées des comptes au DÉTAIL, par tranches ; un compte au SOLDE ou de gestion reçoit de la base son débit, son crédit et ses lignes en devise cumulées par devise et par sens (`lireComptesDuReport`, `SommesRan`), `sommesDesLignes` gardant la définition que la requête reproduit. Tests : `report-a-nouveau-agrege.spec.ts`, qui rend le report au centime comme la lecture ligne à ligne, `a-nouveaux-provisoires.spec.ts`, `cloture-annuelle.spec.ts`, `reevaluation-f54-f55.spec.ts`.
  - src/modules/controles/controles.service.ts:400-414, :535-548, :787-806
  - src/modules/controles/test-ecritures-journal.service.ts:35
  - src/modules/journaux/analyse-journaux.service.ts:206
  - src/modules/comptabilite/ecriture.service.ts:1339, :2148-2165, :2520
  - src/modules/lettrage/lettrage.service.ts:126
  - src/modules/rapprochement/rapprochement.service.ts:133
  - src/modules/relances/relances.service.ts:335
  - src/modules/exercice/exercice.service.ts:733-736, :909-917
- **Condition :** 6
- **Constat :** contrôles, ISA 240, analyse des journaux, dormants, clôture annuelle, brouillard, justificatif, lettrage, rapprochement et relances chargent tout. La mesure du dépôt montre que ce motif tue l'instance à 123 000 lignes.
- **Correction :** agrégats en base partout où seule une somme est lue, lectures par tranches, bornes ou `tronque` déclarés.
- **Fait le 2026-09-27 (en partie) :** la lecture par tranches vit au socle (`common/lecture-par-lots.ts` · `lireParLots`, `pageApres` par identifiant avec `skip: 1`, `Collecte`, `PremiersSelon`). Les contrôles, l'évolution mensuelle et le contrôle de caisse, l'analyse des journaux, le test ISA 240 et les relances lisent par tranches ; chaque anomalie bornée à deux cents occurrences dit son total (`nombre`). Le brouillard, l'échéancier, le lettrage et le rapprochement montrent une tranche avec `tronque` et gardent leurs totaux sur le périmètre entier (agrégats en base). Le justificatif de solde et le classeur ISA 240 REFUSENT au-delà de leur plafond · ce sont des documents. Tests : `lecture-par-lots.spec.ts`, `controles-par-tranches.spec.ts`, `lettrage-fenetre-bornee.spec.ts`, `rapprochement-fenetre-bornee.spec.ts`, `etats-de-relance.spec.ts`, et les specs du brouillard, de l'échéancier, du justificatif et de l'ISA 240 ; huit mutations, huit attrapées. La clôture annuelle et l'à-nouveau provisoire ne lisent plus de chaque ligne que les colonnes du report (`SELECT_LIGNE_RAN`), au lieu de l'écriture entière ; deux mutations, deux attrapées. **Reste :** ils lisent encore toutes les lignes, y compris celles des comptes au SOLDE, dont seul le cumul par devise sert · les agréger en base demande de réécrire `soldesParDevise` sur des sommes, et suit.

**F186 · Contrôle des cumuls analytiques : liste rendue sans borne** [analytique-10, infra-03]
- **Emplacements :** src/modules/analytique/etats-analytiques.service.ts:162-187, :259-314 · analytique.controller.ts:215
- **Condition :** 6
- **Constat :** une requête par plan dans une boucle, et toutes les lignes sans répartition renvoyées.
- **Correction :** `groupBy`, plafond avec `tronque` et `total`.
- **Fait le 2026-09-28 :** les cumuls généraux et analytiques de chaque plan viennent de deux agrégats en base sur un seul périmètre (dossier par l'écriture, exercice, fenêtre, classes ventilées). La liste des lignes sans répartition est plafonnée à 500 par plan (`PLAFOND_LIGNES_SANS_REPARTITION`), triée par date, pièce puis identifiant, avec son décompte exact (`nombreSansRepartition`) et `tronque` ; l'écran dit « n premières sur N ». Tests : `controle-cumuls-f186.spec.ts` (serveur, confronté à la lecture d'avant, et client) ; dix-neuf mutations, dix-neuf attrapées.

**F187 · Exécution budgétaire : tout l'exercice chargé à chaque ouverture des notes** [etats-05]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet-budget.service.ts:134-150, :309-315 · note-annexe.service.ts:1050
- **Condition :** 6
- **Constat :** même famille que ce qui avait fait tomber le banc, non corrigée ici.
- **Correction :** `lireParLots` ou agrégat SQL.
- **Fait le 2026-09-28 :** le tableau d'exécution budgétaire et la réconciliation de trésorerie lisent les écritures par tranches (`lireParLots`, `LOT_ECRITURES`), en ne gardant de chaque ligne que son compte et ses ventilations du plan ; les lignes fournisseurs ouvertes à la clôture se cherchent parmi les candidates de chaque tranche, plus sur tout l'exercice. Ce sont des documents · rien n'est tronqué, montants, lignes et mentions sont identiques. Test : `projet-budget.spec.ts`, dont les doublures comparent désormais dossier et exercice par leur valeur ; dix mutations, dix attrapées.

**F188 · Facturation, devis, exonérations sans borne, déclaration de TVA qui relit tout** [perf-01]
- **Emplacements :** src/modules/facturation/facturation.service.ts:144 · commercial.service.ts:117 · exonerations.service.ts:91 · taux-tva.service.ts:1692
- **Condition :** 6
- **Constat :** le volume croît sans limite avec l'ancienneté du dossier.
- **Correction :** filtre par période avec `tronque`.
- **Fait le 2026-09-28 :** facturier, devis et registre des exonérations se lisent sur une période (`du`, `au`, `common/periode-de-liste.ts` ; une date illisible est un 400), plafonnés à 500 avec `total` et `tronque`. Les compteurs du registre restent ceux du registre entier, lus par tranches, et un titre en alerte reste listé hors période. Les écrans demandent par défaut l'exercice courant (douze mois pour le registre), le disent, et n'affichent que la dernière lecture demandée. La déclaration de TVA et le prorata lisent leurs lignes par tranches SANS borner la fenêtre · la déchéance de l'art. 37 al. 2, l'exigibilité à l'encaissement et les avoirs de l'art. 52 remontent avant la période, et la borner changerait le résultat ; la mémoire est bornée, pas le temps. Tests : `liste-bornee-f188.spec.ts` (trois modules), `listes-bornees-f188.spec.ts`, `periode-de-liste.spec.ts`, `declaration-par-tranches.spec.ts` (égalité objet pour objet avec la lecture d'un bloc) ; quarante et une mutations, quarante et une attrapées.

**F189 · Balance fonctionnelle : toutes les lignes en mémoire** [mf-03]
- **Emplacements :** src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts:162
- **Condition :** 6
- **Constat :** collection sans borne, contraire au § 8 bis.
- **Correction :** agréger par compte, date et devise.
- **Fait le 2026-09-28 :** `jeuFonctionnel` lit les écritures par tranches (`LOT_ECRITURES`, borne du dossier écrite dans l'appel) et convertit au fil de l'eau au cours de leur date ; seuls les cumuls par compte restent en mémoire, et le refus des dates sans cours tombe après la dernière tranche en les listant toutes. Balance, écart de conversion et mention inchangés. Test : `balance-fonctionnelle-par-tranches-f189.spec.ts` (1 007 écritures en trois tranches, reprise close) ; dix mutations, dix attrapées.

**F190 · Supervision et balance agrégée du groupe : une balance par cellule, en série** [groupe-03]
- **Emplacements :** src/modules/groupe/groupe.service.ts:561, :1177, :1706
- **Condition :** 6
- **Constat :** environ 1 500 requêtes en série, et 600 comptages simultanés.
- **Correction :** un `groupBy` sur les couples dossier-exercice.
- **Fait le 2026-09-28 :** balance agrégée, supervision et liasse du groupe lisent par tranches de vingt dossiers (`groupe/lecture-des-dossiers.ts`), chacune bornée par ses couples dossier-exercice sous le périmètre du siège · les comptes et trois regroupements par compte, un regroupement pour les comptages. La balance de chaque dossier passe par le calcul désormais partagé avec `EcritureService.balance` (`comptabilite/balance-trois-colonnes.ts`) · une cellule vue du siège a la balance qu'elle voit chez elle. Test : `lecture-groupe-f190.spec.ts`, confronté au vrai service sous la vraie garde (quarante-cinq cellules, cellule décalée) ; dix-huit mutations, dix-huit attrapées.

### Exploitation, sur site et CI

**F191 · La copie « avant mise à jour » est écrasée au redémarrage qui suit une migration échouée** [infra-01]
- **Emplacements :** installation/demarrer.cjs:78, :81, :104 · installation/windows/omegax-service.xml:17
- **Condition :** 3
- **Constat :** WinSW relance le service et `pg_dump` réécrit le même fichier à partir de la base à moitié migrée.
- **Correction :** ne jamais écraser une copie existante.
- **Fait le 2026-09-28 :** la copie s'écrit sous un nom provisoire (`.partiel`) puis prend un nom horodaté, le repère `derniere-version.json` ne la nomme qu'ensuite (`enCours`), et une relance la REPREND sans relancer `pg_dump` tant que la migration n'a pas abouti (`planMiseAJour`, `src/modules/sur-site/copies-avant-mise-a-jour.ts`, `installation/demarrer.cjs`) ; un repère illisible fait copier, et la copie quotidienne passe aussi par un nom provisoire (`sauvegarde-sur-site.service.ts`). Tests : `lanceur-sur-site.spec.ts`, `copies-avant-mise-a-jour.spec.ts`, `sur-site-divers.spec.ts`.

**F192 · Les sauvegardes sur site sont lisibles par tout utilisateur Windows du poste** [infra-05]
- **Emplacements :** installation/windows/initialiser.ps1:16, :28 · sauvegarde-sur-site.service.ts:99 · installation/demarrer.cjs:76
- **Condition :** 2
- **Constat :** seuls `pgdata` et la configuration sont restreints.
- **Correction :** restreindre `$Donnees` ou le dossier `sauvegardes`.
- **Fait le 2026-09-28 :** `initialiser.ps1` restreint `C:\ProgramData\OmegaX` au système et aux administrateurs, avec héritage, avant les deux branches (poste neuf et mise à jour), Service réseau n'y gardant que la traversée ; un poste déjà installé est corrigé à la mise à jour suivante. Test : `paquet-sur-site.spec.ts`. Pas encore constaté sur un poste Windows.

**F193 · Sur site, une version hors maintenance migre la base avant d'être refusée** [infra-06]
- **Emplacements :** installation/demarrer.cjs:95, :98, :112 · src/modules/sur-site/licence-signee.ts:187
- **Condition :** 3
- **Constat :** contraire à docs/installation-sur-site.md § 6.
- **Correction :** vérifier la licence dans le lanceur avant la copie et les migrations.
- **Fait le 2026-09-28 :** le lanceur vérifie la licence avant la copie et les migrations, dès que la version change, par le service compilé du paquet (`motifRefusMigration`, `versionCouverte` partagée avec `verifierLicence`, `licence-signee.ts`, `licence-sur-site.service.ts`) ; seule une licence authentique pour ce poste qui ne couvre pas la version bloque, et le refus dit l'état de la base. Tests : `licence-signee.spec.ts`, `licence-sur-site.service.spec.ts`, `lanceur-sur-site.spec.ts`.

**F194 · La CI éprouve Node 20 et PostgreSQL 16, alors que la production tourne sous 22 et 18** [infra-08]
- **Emplacements :** .github/workflows/deploy-cloud-run.yml:46, :63 · .github/workflows/tests-navigateur.yml:31, :69 · Dockerfile:5
- **Condition :** 6
- **Constat :** le job censé prouver le démarrage réel tourne sur d'autres versions majeures.
- **Correction :** aligner sur Node 22 et PG 18 (plus 17 pour le sur site).
- **Fait le 2026-09-28 :** Node 22 dans les trois workflows qui font tourner le serveur, et le job `verifier` en deux jambes, PostgreSQL 18 (suite complète) et 17 (démarrage réel), chacune relisant la version servie (`deploy-cloud-run.yml`) ; `tests-navigateur.yml` passe en PostgreSQL 18. Test : `chaine-de-livraison.spec.ts`, qui lit les versions dans le `Dockerfile`, `sauvegarde-base.yml` et `paquet-sur-site.yml`.

**F195 · Dependabot se dit jugé par le job `verifier`, qui ne tourne pas sur les PR** [infra-09]
- **Emplacements :** .github/dependabot.yml:4 · .github/workflows/deploy-cloud-run.yml:6-16
- **Condition :** 5
- **Constat :** aucune montée de dépendance n'est testée avant la fusion.
- **Correction :** déclencheur `pull_request` pour `verifier`, ou commentaire corrigé.
- **Fait le 2026-09-28 :** `deploy-cloud-run.yml` se déclenche sur toute demande de tirage, sans filtre de chemins, et `migrer-et-deployer` ne suit qu'un push ou un lancement manuel sur `main` ; `firebase-hosting-pull-request.yml` écarte Dependabot, qui n'en reçoit pas les secrets. Test : `chaine-de-livraison.spec.ts`.

**F196 · Vitest n'est ni déclaré ni verrouillé** [infra-10]
- **Emplacements :** client/package.json:10 · client/vitest.config.ts:3 · deploy-cloud-run.yml:135 · firebase-hosting-merge.yml:27
- **Condition :** 6
- **Constat :** chaque CI prend la dernière version publiée.
- **Correction :** devDependency à version fixée.
- **Fait le 2026-09-28 :** la version de vitest s'écrit une fois, dans le script `test` du client (`npx --yes vitest@5.0.2 run`), et les deux workflows lancent `npm test` au lieu d'un `npx vitest run` nu. Pas en devDependency · vitest 5 exige vite 6.4 au moins et le client est sur vite 5, l'installer forcerait une montée de vite (dit dans `client/vitest.config.ts`). Test : `chaine-de-livraison.spec.ts`, qui exige la version exacte et le script dans les deux workflows, vu tomber sur un workflow et un script remis à nu.

**F197 · Marche locale des tests navigateur (CLAUDE.md § 10) contraire au montage réel** [infra-13]
- **Emplacements :** CLAUDE.md:3150 · e2e/tests/outils.ts:3 · .github/workflows/tests-navigateur.yml:53
- **Condition :** 5
- **Constat :** sans `VITE_API_URL=/api` et `OMEGAX_API_RELAIS`, chaque appel échoue.
- **Correction :** réécrire la procédure.
- **Fait le 2026-09-28 :** le § 10 de CLAUDE.md décrit le montage du job en trois étapes, relais `/api` compris (`OMEGAX_API_RELAIS`). Test : `reglement-interieur.spec.ts`, qui relit le paragraphe contre `tests-navigateur.yml`.

### Documentation

**F198 · docs/deploiement.md décrit une architecture abandonnée** [doc-05]
- **Emplacements :** docs/deploiement.md:62, :83-139, :150-157 · client/firebase.json:10-14 · src/bootstrap.ts:78-80
- **Condition :** 6
- **Constat :** Cloud SQL europe-west1, `gcloud run deploy` à la main, CORS ouvert par défaut, 58 migrations.
- **Correction :** retirer ou marquer les sections 1 à 6, et renvoyer au workflow.
- **Fait le 2026-09-28 :** un bandeau daté dit ce que les anciennes sections prescrivaient à tort (Cloud SQL, `gcloud run deploy` à la main, migrations « une fois », API ouverte à tout domaine) ; le document renvoie au workflow, à `docs/connexions-et-plafonds.md` et au § 5 de CLAUDE.md, et décrit ce qui tourne · Neon PG 18 à deux chaînes, relais `/api` de Firebase Hosting, `--env-vars-file`, CORS tel que `bootstrap.ts` l'applique, surveillance. Chaque référence relue au code.

**F199 · docs/actions-du-proprietaire.md : actions réglées listées, clé publique de licence omise** [doc-07]
- **Emplacements :** docs/actions-du-proprietaire.md:48-70, :98-122, :137-141 · src/modules/sur-site/cle-publique-editeur.ts:6-16 · .github/workflows/paquet-sur-site.yml:36-38 · docs/plan-ordonne-2026-09.md:46
- **Condition :** 5
- **Constat :** le heartbeat, la devise, la période close et l'OCR sont réglés. La clé `null`, qui bloque le paquet, n'est pas listée.
- **Correction :** refaire la liste contre le code et corriger le renvoi de section.
- **Fait le 2026-09-28 :** la liste est refaite contre le code · les points réglés (heartbeat, devise, période close, OCR, sauvegardes, mécénat, groupe) passent en fin avec leur date et leur fichier ; la paire Ed25519 et la clé publique `null` qui arrête le paquet (`cle-publique-editeur.ts`, `paquet-sur-site.yml`) sont ajoutées avec la marche à suivre ; le renvoi du plan ordonné est corrigé.

**F200 · Les deux audits du 2026-09-27 annoncent ouverts des constats corrigés** [doc-08]
- **Emplacements :** docs/audit-serveur-2026-09.md:20, :25-113, :593-663 · docs/audit-interface-2026-09.md:26, :141-255, :494-512
- **Condition :** 5
- **Constat :** B1 à B3, C5, C8, C10, C11, B4, F3, I1, C3 et C4 sont faits sans être marqués.
- **Correction :** marquer « Fait le… » avec fichier:ligne, et recompter.
- **Fait le 2026-09-28 :** les constats nommés, et les autres constats corrigés des deux rapports, sont marqués « Fait » avec fichier, ligne, test et commit, chacun relu dans le code ; les totaux sont recomptés. Restaient ouverts le constat C9 du serveur (aucun arrondi commun) et, à moitié, le constat I1 de l'interface.
- **Complété le 2026-09-28 :** le constat I1 est fermé · l'aiguillage refuse aussi l'adresse tapée d'une fenêtre réservée à l'administrateur, et le menu lit la même règle (`client/src/lib/reserve-admin.ts`, `AppShell.tsx`). Test : `fenetres-reservees-admin.spec.ts`.

**F201 · docs/conversion-monnaie-fonctionnelle.md condamne la méthode retenue** [doc-09]
- **Emplacements :** docs/conversion-monnaie-fonctionnelle.md:97-150 · balance-fonctionnelle.service.ts:21-31 · CLAUDE.md:566-600
- **Condition :** 5
- **Constat :** document dépassé, sans bandeau.
- **Correction :** bandeau de renvoi à M2.
- **Fait le 2026-09-28 :** un bandeau « dépassé sur la méthode » en tête renvoie au paragraphe M2 et au service, dit la méthode retenue et nomme les sections dépassées ; le corps n'est pas réécrit.

**F202 · Tirets cadratins hors des exceptions déclarées** [doc-11]
- **Emplacements :** src/modules/import/lecture-fichier.ts:45-46 · src/common/cloisonnement/extension-cloisonnement.ts:82 · docs/etats-financiers-liasses-referentiels.md (13 occurrences) · scripts/extraire-schemas-guides.cjs:91, :134 · src/modules/controles/regles-comptes-syscohada.ts:269, :339, :598 · CLAUDE.md:92-106
- **Condition :** 5
- **Constat :** interdits par le § 4.
- **Correction :** remplacer, et déclarer comme exceptions le fichier SYSCOHADA verbatim et le script.
- **Fait le 2026-09-28 :** les cadratins de ponctuation de `lecture-fichier.ts`, `extension-cloisonnement.ts` et `docs/etats-financiers-liasses-referentiels.md` sont retirés ; le § 4 de CLAUDE.md déclare chaque exception avec son nombre (173 occurrences sur 97 lignes, et non 97). Test : `src/common/cadratins.spec.ts`, qui relit le dépôt entier contre une liste fermée.

**F203 · Noms de modèles d'IA dans trois documents poussés** [doc-12]
- **Emplacements :** docs/plan-ordonne-2026-09.md:91, :116, :328, :367, :393, :411, :432, :484 · docs/plan-confrontations.md:104-105 · docs/plan-sycebnl-complet.md:57-68
- **Condition :** 5
- **Constat :** interdits par le § 4.
- **Correction :** ne garder que le niveau d'effort.
- **Fait le 2026-09-28 :** les noms de modèle sont retirés des trois documents, seul le niveau d'effort reste ; aucun nom de modèle dans `docs/`.

**F204 · README.md décrit un prototype de phase 1** [doc-18]
- **Emplacements :** README.md:1-105
- **Condition :** 5
- **Constat :** « sycebnl-suite », heartbeat, inscription non atomique, émojis.
- **Correction :** réduire à nom, propriétaire, pile, commandes et renvois.
- **Fait le 2026-09-28 :** le README se réduit au nom, au propriétaire, à la pile, aux commandes et aux renvois, chacun vérifié ; un bandeau dit ce qu'il décrivait jusque-là.

---

### Session

**F270 · « Rester connecté sur cet appareil »** [décision de Manasse, 2026-09-27]
- **Emplacements :** src/modules/auth/session.constants.ts · src/modules/auth/auth.controller.ts · client/src/pages/LoginPage.tsx
- **Condition :** 2
- **Constat :** toute session dure huit heures, sans choix, et son cookie survit à la fermeture du navigateur, y compris sur un poste partagé.
- **Correction :** case décochée par défaut. Décochée, cookie de session (fermé avec le navigateur) et huit heures au plus. Cochée, trente jours au plus, sept jours sans utilisation, prolongée à chaque usage sans dépasser les trente. Jamais pour la console de l'éditeur. Bouton « Déconnecter mes autres appareils » dans Mon compte.
- **Fait le 2026-09-28 :** case « Rester connecté sur cet appareil » décochée par défaut (`AuthPage.tsx`) · décochée, cookie de session sans échéance et jeton de huit heures ; cochée, sept jours sans usage et trente au plus depuis la connexion d'origine, prolongée à l'usage au plus une fois par jour (`session-longue.ts`, `emettreSession`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `poserCookieSession`) ; jamais pour un opérateur de la console. « Déconnecter mes autres appareils » dans Mon compte exige le mot de passe (`POST /auth/deconnecter-autres-appareils`, `ModaleMonCompte.tsx`), et `/auth/me` rend le jeton CSRF de la session (`synchroniserCsrf`). Tests : `session-longue.spec.ts`, `cycle-de-vie-acces.spec.ts`, `roles-cantonnes.spec.ts`, `rester-connecte.spec.ts`, `mon-compte.spec.ts`.

## APRES_1_0

### Saisie et trésorerie

**F205 · Rapprochement : les lignes de report à-nouveau sont proposées au pointage** [saisie-19]
- **Emplacements :** src/modules/rapprochement/rapprochement.service.ts:133, :365
- **Condition :** 1
- **Constat :** la ligne reste « non pointée » d'une année sur l'autre, et la pointer compte l'ouverture deux fois.
- **Correction :** l'écarter quand un rapprochement antérieur existe, ou la montrer à part.
- **Fait le 2026-09-28 :** le report à-nouveau n'est plus proposé au pointage · une seule ouverture par chaîne. Après un rapprochement clos, aucun à-nouveau ; sans rapprochement antérieur, seul celui du premier exercice du dossier, qui porte le bilan d'ouverture, comme dans `balanceCumulee`. La règle vit une fois (`estANouveauEcarte`, `filtreANouveauEcarte`, `rapprochement.service.ts`) · filtre sur la liste et les propositions, refus nommé (`motifRefusANouveau`) au pointage et à la confirmation ; une ligne déjà pointée sur ce rapprochement reste montrée pour se défaire. Test : `a-nouveau-rapprochement.spec.ts`. **Reste :** l'écran ne dit pas encore combien d'à-nouveaux sont écartés (`aNouveauEcartes`).

**F206 · Balance cumulée : l'« ouverture » inclut la clôture du premier exercice** [saisie-24]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:3029-3033
- **Condition :** 5
- **Constat :** le commentaire est contredit par le filtre. Aucun chiffre faux sur les consommateurs actuels.
- **Correction :** restreindre au report daté de l'ouverture.
- **Fait le 2026-09-27 :** l'ouverture de la balance cumulée exclut l'écriture de solde des comptes de gestion du premier exercice (`ecriture.service.ts`, `balanceCumulee`). Test : `balance-cumulee.spec.ts`.

**F207 · Liste des ordres de virement coupée à 500 sans le dire** [saisie-25]
- **Emplacements :** src/modules/reglements/ordres-virement.service.ts:152-158
- **Condition :** 3
- **Constat :** les ordres les plus anciens disparaissent de l'onglet.
- **Correction :** `total` et `tronque`, ou filtres.
- **Fait le 2026-09-28 :** `GET /ordres-virement` rend les `PLAFOND_ORDRES_LISTES` plus récents avec le total et le nombre d'ordres à imprimer, lus sur le dossier entier (`ordres-virement.service.ts`) ; l'onglet part de null et dit les ordres à imprimer qui ne sont pas dans la liste (`liste-ordres-virement.ts`, `OrdresVirement.tsx`). Tests : `ordres-virement.spec.ts` (serveur et écran), `liste-ordres-virement.spec.ts`. **Reste :** aucun filtre par état.

### Exercice et révision

**F208 · Aide de la date de reprise fausse pour le rattachement au SYCEBNL** [rev-21]
- **Emplacements :** client/src/pages/RegularisationPage.tsx:497-507
- **Condition :** 5
- **Constat :** le rattachement se reprend à l'ouverture, pas à la fin.
- **Correction :** faire dépendre le texte du type.
- **Fait le 2026-09-28 :** la bulle de la colonne « Reprise » suit le type autant que le référentiel (`momentDeReprise`, `aideDateReprise`, `regularisation-types.ts`), la même règle que `dateReprise` du serveur · le rattachement à l'ouverture des deux côtés, avec la fiche du compte 40 ou 41 du texte du dossier, la subvention pluriannuelle à la fin. Test : `regularisation-types.spec.ts`.
- **Complété le 2026-09-28, au serveur :** `dateReprise` reprend aussi le 476 et le 477 à l'ouverture dans les deux référentiels, seule la subvention pluriannuelle à la fin (SYCEBNL, Partie 3 ch. 6, section 1) · le Guide d'application SYCEBNL extourne le 476 « au début de l'exercice suivant » (Application 10), comme la Partie 3 ch. 4, section 1, ses écritures de fin d'exercice ; `reprendre` ne lit plus le référentiel, et l'écran dit la même règle (`momentDeReprise`, par le type seul). Tests : `regularisation.spec.ts`, `cession-courante.spec.ts`, `regularisation-types.spec.ts`.

**F209 · Commentaires et décomptes périmés (exercice, contrôles)** [rev-22]
- **Emplacements :** src/modules/exercice/exercice.service.ts:283, :564-571, :662-685 · planning-cloture.ts:205 · src/modules/controles/controles.controller.ts:10, :21 · dossier-revision.service.ts:39 · controles.service.ts:1581, :3052 · docs/organisation-comptable-cpcc.md:123
- **Condition :** 5
- **Constat :** « seize jalons », affectation « à écrire », `premierJourOuvert` null, « trois rôles », « 78 entrées », dépréciation « hors périmètre », « pas de module de paie ».
- **Correction :** décrire l'existant, sans chiffres déduits.
- **Fait le 2026-09-28 :** les commentaires décrivent l'existant sans chiffre déduit · jalons filtrés selon le référentiel, la forme et le droit, affectation écrite, `premierJourOuvert` servi, cinq rôles, fiches des deux référentiels, dépréciation portée par le module, registre du personnel (`exercice.service.ts`, `planning-cloture.ts`, `controles.controller.ts`, `controles.service.ts`, `dossier-revision.service.ts`, `docs/organisation-comptable-cpcc.md`).

**F210 · État de campagne DEPOUILLEE jamais atteint** [rev-23]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:360-364 · client/src/lib/types.ts:3609
- **Condition :** 5
- **Constat :** état mort de l'énumération.
- **Correction :** poser ce statut, ou le retirer.
- **Fait le 2026-09-28 :** une campagne passe à « dépouillée » quand chaque lettre partie est classée (`estDepouillee`, `suivreDepouillement`, `circularisation.service.ts`), au classement comme au retrait de la dernière lettre à envoyer, par un passage conditionnel qui ne rouvre jamais une campagne close. Le dépouillement n'accepte que les trois issues (réponse reçue, sans réponse, non distribuée) et refuse une lettre qui n'est pas partie. Tests : `circularisation.spec.ts`, `circularisation-gestes-a-lecran.spec.ts`. **Reste :** le statut de la campagne ne s'affiche pas à l'écran.

### États financiers

**F211 · Bilan SMT SYCEBNL : un 130 échappe au bilan** [etats-07]
- **Emplacements :** src/modules/etats-financiers/correspondance-smt.ts:164-172 · etats-financiers-smt.service.ts:152-161, :218-221
- **Condition :** 5
- **Constat :** contraire au commentaire et à la règle de `resultat-de-l-exercice.ts`.
- **Correction :** exclure 10 et 131 à 139 seulement, ou lister les non rattachés.
- **Fait le 2026-09-28 :** le poste HC du bilan SMT prend toute la classe 1 sauf le 10 et les 131 à 139, lus à la même source que HB (`COMPTES_RESULTAT_DE_L_EXERCICE`, `correspondance-smt.ts`) · un 130, qu'aucun plan SYCEBNL n'ouvre, va à HC et se nomme au détail comme le 128 ; le contrôle signale en plus un résultat N-1 resté aux 131 à 139 pendant que les classes 6 à 8 portent N. Tests : `correspondance-smt.spec.ts`, `etats-financiers-smt.service.spec.ts`.

**F212 · Commentaires périmés des états SYCEBNL** [etats-08]
- **Emplacements :** etats-financiers.communs.ts:5-13 · etats-financiers.controller.ts:76-82 · etats-financiers.service.ts:164-170 · etats-financiers-smt.service.ts:904-911, :967
- **Condition :** 5
- **Constat :** SMT « non construit », « bilan seulement », « 564/565 », « CDF ou USD ».
- **Correction :** mettre à jour, et servir `monnaieDuJeuLegal()`.
- **Fait le 2026-09-28 :** les commentaires décrivent l'existant (`etats-financiers.communs.ts`, `etats-financiers.controller.ts`, `calculerDW`, éligibilité SMT), et `deviseDossier` sert `monnaieDuJeuLegal(tenant.devise)`, une devise nulle rendant CDF. Test : `etats-financiers-smt.service.spec.ts`.

**F213 · Sources MOUVEMENT_DEBIT et MOUVEMENT_CREDIT mortes et fausses** [notes-08]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:396-400 · note-annexe.types.ts:86-92
- **Condition :** 5
- **Constat :** aucune rubrique ne les pose, et elles lisent le report.
- **Correction :** les retirer, ou les brancher sur les mouvements.
- **Fait le 2026-09-28 :** `SourceMontantNote` et le champ `source` sont retirés (`note-annexe.types.ts`), le montant d'un compte est toujours son solde signé (`calculerRubrique`), et une table qui voudrait poser `source` ne compile plus. Test : `source-montant-f213.spec.ts`.

**F214 · Notes associations : neuf rechargements de balance** [notes-09]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:974-978, :1144-1148
- **Condition :** 6
- **Constat :** agrégats redondants.
- **Correction :** passer les lignes déjà chargées, ou mémoriser.
- **Fait le 2026-09-28 :** une mémoire bornée à l'appel (`balanceMemorisee`, clé dossier, exercice, brouillard et arrêté) sert les lectures des notes et des états qu'elles appellent · trois balances au lieu de neuf, valeurs identiques. Test : `balance-memorisee-f214.spec.ts`, sur le vrai `EtatsFinanciersService`.

**F215 · Commentaires SMT SYSCOHADA « CDF ou USD »** [efsy-04]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:1359, :1429 · etats-financiers-syscohada.controller.ts:200
- **Condition :** 5
- **Constat :** contraires à monnaie-de-tenue.
- **Correction :** réécrire, et utiliser `monnaieDuJeuLegal`.
- **Fait le 2026-09-28 :** la tenue est dite en francs congolais dans le service et le contrôleur SMT, et `deviseDossier` sert `monnaieDuJeuLegal(tenant.devise)`, l'écran l'affichant sans repli. Tests : `etats-financiers-smt-syscohada.service.spec.ts`, `etats-smt-syscohada-audit-final.spec.ts`.

**F216 · Point 14 a) périmé : le remède du TFT est écrit** [efsy-06]
- **Emplacements :** correspondance-compte-resultat-syscohada.ts:211
- **Condition :** 5
- **Constat :** contredit la table du TFT.
- **Correction :** le réécrire comme fait.
- **Fait le 2026-09-28 :** le point 14 a) de `correspondance-compte-resultat-syscohada.ts` décrit un fait · FA lit RQP et TQP (`correspondance-tft-syscohada.ts`), et l'en-tête dit ce qui reste de b). Test : `correspondance-compte-resultat-syscohada.spec.ts`.

**F217 · brutN1 et amortissementN1 : faux zéro, champs morts** [efsy-10]
- **Emplacements :** etats-financiers-syscohada.service.ts:741-743
- **Condition :** 5
- **Constat :** personne ne les lit.
- **Correction :** `undefined`, ou retrait.
- **Fait le 2026-09-28 :** `brutN1` et `amortissementN1` sont retirés de `LigneBilanSyscohada`, au serveur comme au client · le modèle officiel ne donne à N-1 qu'une colonne, en net. Test : `etats-financiers-syscohada.service.spec.ts`.

**F218 · Commentaire SMT : orphelins « vides par construction »** [efsy-12]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:321
- **Condition :** 5
- **Constat :** le 130 est un orphelin voulu, et le 57 est en SA4.
- **Correction :** mettre à jour.
- **Fait le 2026-09-28 :** le commentaire des orphelins du bilan SMT nomme le 130 (13010000, 13090000) et la couverture réelle de `correspondance-smt-syscohada.ts`. Test : `etats-financiers-smt-syscohada.service.spec.ts`.

**F219 · « Un fichier de 45 notes » pour 46 codes** [efsy-13]
- **Emplacements :** correspondance-notes-syscohada.ts:21
- **Condition :** 5
- **Constat :** décompte faux.
- **Correction :** corriger.
- **Fait le 2026-09-28 :** le commentaire dit « un fichier unique portant les 46 codes », que `correspondance-notes-syscohada.spec.ts` compte déjà.

**F220 · arreteAu illisible : 500 au lieu de 400** [efsy-14]
- **Emplacements :** etats-financiers-syscohada.service.ts:404
- **Condition :** 4
- **Constat :** NaN passe les contrôles.
- **Correction :** refuser une date invalide.
- **Fait le 2026-09-28 :** `lireDateArrete` n'admet qu'une date AAAA-MM-JJ qui existe, relue en UTC, et lève un 400 en français avant toute lecture (« xyz », « 2026-02-30 », « 06/30/2026 », « 2026-6-30 »). Test : `etats-financiers-syscohada.service.spec.ts`.

**F221 · Liste des comptes avalée dans la fenêtre des notes SYSCOHADA** [efsy-15]
- **Emplacements :** client/src/pages/NotesAnnexesSyscohadaPage.tsx:94
- **Condition :** 3
- **Constat :** formulaire vide sans message.
- **Correction :** `setErreur`.
- **Fait le 2026-09-28 :** l'échec de `GET /comptes` a son état (`erreurComptes`) et son bandeau, qu'un refus de saisie ni « Fermer » n'écrasent (`NotesAnnexesSyscohadaPage.tsx`). Test : `NotesAnnexesSyscohadaPage.spec.ts`.

**F222 · Exercice introuvable : états à zéro « équilibrés »** [efsy-18]
- **Emplacements :** etats-financiers-syscohada.service.ts:706 · etats-financiers.communs.ts:62-66
- **Condition :** 3
- **Constat :** réponse fausse au lieu d'un refus.
- **Correction :** 404.
- **Fait le 2026-09-28 :** `trouverExerciceN1` lève un 404 en français pour un exercice absent du dossier (`etats-financiers.communs.ts`), et les états SMT passent par `exerciceDuDossier`, borné au dossier, au lieu de `findFirstOrThrow` · bilan, compte de résultat, tableau des flux, situation, NOTES 1 à 4 et éligibilité refusent au lieu de sortir à zéro. Tests : `etats-financiers-syscohada.service.spec.ts`, `etats-financiers-smt-syscohada.service.spec.ts`, `exercice-introuvable-f222.spec.ts`.

### Exports

**F223 · Commentaires périmés des exports** [exp-09]
- **Emplacements :** src/modules/exports/export.controller.ts:19-25, :99-103 · export.service.ts:213-231, :916-924, :1466-1472, :2777-2787
- **Condition :** 5
- **Constat :** six commentaires décrivent un état révolu.
- **Correction :** mettre à jour, et replacer la doc du livre.
- **Fait le 2026-09-28 :** les commentaires de `export.service.ts` sont remis sur leur déclaration et décrivent l'existant (garde-fou de volume, cartouche posé partout, test ISA 240, livre d'inventaire et rapport, liasse complète).

**F224 · Notes projets exportées sans les parties officielles** [exp-10]
- **Emplacements :** src/modules/exports/export.service.ts:2575
- **Condition :** 5
- **Constat :** deux présentations du même document.
- **Correction :** passer `PARTIES_NOTES_PROJETS`.
- **Fait le 2026-09-28 :** `notesProjetExcel` range sa fiche sous les quatre parties officielles (`PARTIES_NOTES_PROJETS`), comme la liasse projets. Test : `notes-projet-parties.spec.ts`, qui relit le classeur produit.

**F225 · Nom de fichier de restitution calculé et jamais servi** [restit-04]
- **Emplacements :** restitution.service.ts:254-256 · restitution.controller.ts:47, :95-98
- **Condition :** 5
- **Constat :** code mort, et deux dossiers le même jour portent le même nom.
- **Correction :** nommer dans le contrôleur.
- **Fait le 2026-09-28 :** le nom de l'archive porte la dénomination, l'identifiant du dossier et le jour (`nomDeLArchive`), lu avant les en-têtes · un dossier introuvable est une 404 nommée (`restitution.controller.ts`, `restitution.service.ts`). Tests : `restitution-nom.spec.ts`, `restitution.spec.ts`.

### Paie

**F226 · Rémunération du contrat sans devise : faux « en deçà du minimum »** [paie-08]
- **Emplacements :** prisma/schema.prisma:6490 · regles-contrat-travail.ts:689-711 · client/src/pages/PersonnelPage.tsx:1422
- **Condition :** 1
- **Constat :** un montant en dollars est comparé à un minimum en francs.
- **Correction :** unité à l'écran ou devise au contrat, et abstention hors franc.
- **Fait le 2026-09-28 :** le contrat porte la monnaie de sa rémunération (`ContratTravail.deviseRemuneration`, nullable, sans défaut ni rétro-remplissage, migration `20261205000000_contrat_devise_remuneration`) · le contrôle du minimum s'abstient sans elle (`DEVISE_NON_RENSEIGNEE`) et hors franc (`REMUNERATION_HORS_FRANC`), sans rien convertir (décret n° 25/22, art. 2 ; Code du travail, art. 89). Elle se complète une fois (`POST /personnel/contrats/:contratId/devise-remuneration`, 409 sur un changement), et elle comme la fin du contrat s'écrivent par une opération UNITAIRE, un `updateMany` ne laissant au journal d'audit que son filtre. Tests : `regles-contrat-travail.spec.ts`, `registre-borne-et-devise.spec.ts`, `personnel-audit-final.spec.ts`.

**F227 · Message de refus de barème qui exclut le SMIG** [paie-12]
- **Emplacements :** src/modules/personnel/baremes-dossier.ts:131-132
- **Condition :** 5
- **Constat :** le SMIG est saisissable.
- **Correction :** corriger le message.
- **Fait le 2026-09-28 :** le refus d'un barème non saisissable vit une fois (`MOTIF_BAREME_NON_SAISISSABLE`, `baremes-dossier.ts`) et nomme le SMIG journalier du manœuvre parmi ce qui se saisit ; le DTO sert le même message en français. Test : `registre-borne-et-devise.spec.ts`.

### Fiscalité

**F228 · Commentaire et message de la TVA dépassés** [tva-04]
- **Emplacements :** src/modules/tva/taux-tva.service.ts:846-849, :2197
- **Condition :** 5
- **Constat :** ils citent une condition absente, et la mention de l'art. 60 est lisible sur la facture.
- **Correction :** mettre à jour, et lire `mentionTvaDebits`.
- **Fait le 2026-09-28 :** le commentaire du prorata décrit `construireLigneTva`, et la déclaration LIT la mention de l'art. 60 portée par la facture d'achat rattachée (`mentionDebitsLueSurLaFacture`, `taux-tva.service.ts`) · elle dit la part prouvée par la pièce et celle que la fiche du fournisseur ne dit pas encore, sans dater la déduction, que la fiche du tiers date. La mention se saisit aussi sur une facture reçue. Tests : `tva-mention-debits-facture-f228.spec.ts`, `facturation-audit-final.spec.ts`.

**F229 · mentions-facture.ts resté à neuf groupes** [fact-08]
- **Emplacements :** src/modules/facturation/mentions-facture.ts:291, :603 · client/src/pages/FacturationPage.tsx:492
- **Condition :** 5
- **Constat :** douze groupes, dont dix dus, et une colonne « art. 100 ».
- **Correction :** réécrire, et intituler la colonne « Mentions obligatoires ».
- **Fait le 2026-09-28 :** aucune règle ne change · les commentaires et messages de `mentions-facture.ts` disent les douze points de l'art. 26 du décret n° 23/10, dont dix dus, et les neuf tirets de l'art. 100 du décret n° 011/42, adresse exacte comprise, selon la date de la pièce (`texteApplicable`) ; la colonne s'intitule « Mentions obligatoires ». Tests : `mentions-facture-f229.spec.ts`, `facturation-audit-final.spec.ts`. **Reste :** deux refus de `facturation.service.ts` nomment l'art. 100 quelle que soit la date.

### Analytique et EBNL

**F230 · DTO de ventilation par lot sans route** [analytique-11]
- **Emplacements :** src/modules/analytique/dto/analytique.dto.ts:158-177
- **Condition :** 5
- **Constat :** code mort.
- **Correction :** le retirer.
- **Fait le 2026-09-28 :** `VentilerLotDto`, `VentilerUneLigneDto` et `ListerEngagementsDto`, reçus par aucune route, sont retirés. Test : `dto-servis-f230.spec.ts`, qui lit les métadonnées de Nest et exige qu'aucun DTO exporté du module ne reste sans route.

**F231 · Jalon 11 attribué à tort aux conventions** [bailleurs-02]
- **Emplacements :** convention-financement.service.ts:103-106 · planning-cloture.ts:412-420
- **Condition :** 5
- **Constat :** ce jalon vise l'accord-cadre.
- **Correction :** retirer le renvoi.
- **Fait le 2026-09-28 :** le jalon 11 renvoie à l'accord-cadre (loi n° 004/2001, art. 37 ; contrôle 29), et le champ `expiree` des conventions de financement est décrit par ce qu'il fait, relu par le contrôle 24 · commentaires et titres de spec seuls (`convention-financement.service.ts`, `planning-cloture.ts`, `types.ts`).

### Groupe et IFRS

**F232 · Réciproques et résultats internes : exercice et appartenance non vérifiés** [conso-03]
- **Emplacements :** src/modules/consolidation/cumul.service.ts:210-235
- **Condition :** 5
- **Constat :** le cumul est refusé avec un message peu clair.
- **Correction :** contrôles de `ajouterProvisionChange`.
- **Fait le 2026-09-28 :** réciproques, résultats internes, provision pour pertes de change et fiscalité passent par `exerciceDuDossier` et `entiteDeLExercice` (`cumul.service.ts`) · 404 hors du dossier, 400 nommé pour une entité d'un autre exercice, et le cumul nomme une déclaration ancienne hors du périmètre. Tests : `cumul.service.spec.ts`.

**F233 · Notes IFRS consolidées sans note de transition** [ifrs-01]
- **Emplacements :** src/modules/ifrs/ifrs.service.ts:501, :751 · notes-ifrs.ts:574
- **Condition :** 5
- **Constat :** les comptes individuels la portent.
- **Correction :** passer `ia1.premiereApplication`.
- **Fait le 2026-09-28 :** les notes consolidées reçoivent la première application consolidée (`ia1.premiereApplication`, `ifrs.service.ts`) · la note de transition sort sur le premier exercice IFRS du groupe. Test : `ifrs.service.spec.ts`.

**F234 · Routes de lecture sans exerciceId obligatoire** [conso-05]
- **Emplacements :** consolidation.controller.ts:45 · ifrs.controller.ts:25 · perimetre.service.ts:70
- **Condition :** 5
- **Constat :** sur appel direct, tout le dossier est mêlé.
- **Correction :** `ParseUUIDPipe`.
- **Fait le 2026-09-28 :** périmètre, cumul, états consolidés et les deux lectures IFRS exigent l'exercice (`EXERCICE_REQUIS`, `consolidation/exercice-requis.ts`), et les services le refusent absent avant toute lecture (`exigerExercice`). Tests : `perimetre.service.spec.ts`, `ifrs.service.spec.ts`.

**F235 · Renommer une entité vers un nom pris rend 500** [conso-06]
- **Emplacements :** perimetre.service.ts:240-272 · prisma/schema.prisma:6834
- **Condition :** 5
- **Constat :** l'unicité n'est vérifiée qu'à la création.
- **Correction :** même vérification.
- **Fait le 2026-09-28 :** un nom d'entité est unique par exercice aux deux portes (`nomLibre`, `perimetre.service.ts`), une violation d'unicité simultanée rendant le même 400 nommé (`sousUniciteDuNom`). Test : `perimetre.service.spec.ts`.

**F236 · Commentaire « écarts de conversion pas encore calculés »** [conso-07]
- **Emplacements :** client/src/pages/EtatsConsolidesVue.tsx:14-15
- **Condition :** 5
- **Constat :** la tranche 4c les calcule.
- **Correction :** retirer.
- **Fait le 2026-09-28 :** le commentaire de tête d'`EtatsConsolidesVue.tsx` décrit l'existant · « non calculé » pour les « dont » et le résultat par action, colonne des écarts de conversion.

### Sécurité

**F237 · Dates d'option TVA et d'autorisation aux débits impossibles à effacer** [socle-12]
- **Emplacements :** parametres-dossier.dto.ts:243, :274 · tenant.service.ts:700-708
- **Condition :** 3
- **Constat :** la convention de la chaîne vide n'est pas appliquée.
- **Correction :** `ValidateIf` et conversion en null.
- **Fait le 2026-09-28 :** les deux dates passent par `dateSaisieOuEffacement` (`tenant/date-effacable.ts`) · absente, inchangée ; vide ou null, effacée ; illisible ou hors calendrier, refusée en 400 ; le jumeau de `modifierIdentite` (date de l'acte, date de l'attestation) est corrigé de même. L'onglet Régime fiscal porte enfin les deux cases, que rien n'écrivait (`ParametresDossierPage.tsx`, `lib/date-quittee.ts`). Tests : `dates-regime-effacables.spec.ts`, `dates-regime-a-lecran.spec.ts`, `date-quittee.spec.ts`.

**F238 · Verrouillage et durée de réponse révèlent l'existence d'un compte** [socle-14]
- **Emplacements :** src/modules/auth/auth.service.ts:206, :215, :237 · verrouillage.ts:40
- **Condition :** 2
- **Constat :** contraire à l'intention écrite.
- **Correction :** empreinte factice, et message identique.
- **Fait le 2026-09-28 :** adresse inconnue, mot de passe faux et compte verrouillé rendent le même message (`MOTIF_IDENTIFIANTS_INVALIDES`, `verrouillage.ts`), une adresse inconnue compare le mot de passe à `EMPREINTE_FACTICE` (même coût), et bcrypt tourne avant la lecture du verrou (`auth.service.ts`). Test : `cycle-de-vie-acces.spec.ts`.

**F239 · Filtres illisibles du journal d'audit : 500** [socle-15]
- **Emplacements :** journal-audit.controller.ts:38-41 · journal-audit.service.ts:92-93
- **Condition :** 4
- **Constat :** NaN et dates invalides passent.
- **Correction :** DTO de requête.
- **Fait le 2026-09-28 :** le filtre passe par un DTO de requête (`filtre-journal-audit.dto.ts`) · nombres faits de chiffres seuls et bornés, dates AAAA-MM-JJ ou ISO avec fuseau, jour existant, paramètre répété ou inconnu refusé, tout en 400 motivé ; le service garde un dernier refus avant toute lecture. Test : `filtre-journal-audit.spec.ts`.

**F240 · La garde de cloisonnement ne regarde pas le tenantId des données d'une mise à jour** [socle-16]
- **Emplacements :** src/common/cloisonnement/extension-cloisonnement.ts:188-240
- **Condition :** 2
- **Constat :** lacune de défense en profondeur, non exploitable aujourd'hui.
- **Correction :** appliquer `dossierCree` à `data` et à `update`.

### Plateforme

**F241 · Émission des relances : envoi SMTP dans la requête, sans borne** [relances-05]
- **Emplacements :** relances.dto.ts:46 · relances.service.ts:536 · courrier.service.ts:84
- **Condition :** 6
- **Constat :** un second clic envoie une seconde lettre.
- **Correction :** `ArrayMaxSize`, ou mise en file sans envoi immédiat.
- **Fait le 2026-09-28 :** l'émission des relances n'envoie rien · sélection bornée à 500 comptes sans doublon (DTO et service), relances et lettres écrites dans une transaction sous verrou par dossier (`ecrireEnFileSansTenter`, `courrier.service.ts`), remises par la reprise bornée que la fenêtre enchaîne. Une lettre du même compte, du même niveau et du même jour de Kinshasa, en file ou partie, n'est pas réécrite et revient dans `dejaEmises`. Tests : `emission-bornee-f241.spec.ts`, `courrier.service.spec.ts`, `remise-des-lettres.spec.ts`, `file-des-courriels.spec.ts`, `remise-a-lecran.spec.ts`.

**F242 · En-tête du tableau Utilisateurs : six cellules pour cinq colonnes** [utilisateurs-02]
- **Emplacements :** client/src/pages/UtilisateursPage.tsx:176
- **Condition :** 5
- **Constat :** « STATUT » apparaît deux fois.
- **Correction :** cinq cellules.
- **Fait le 2026-09-28 :** l'en-tête du tableau des utilisateurs porte cinq cellules pour cinq colonnes. Test : `entetes-de-grille-f242.spec.ts`, qui relit par le compilateur les grilles à colonnes figées de quatre pages.

**F243 · Commentaire de RelancesPage contraire au serveur** [relances-06]
- **Emplacements :** client/src/pages/RelancesPage.tsx:25-27 · relances.service.ts:68-75
- **Condition :** 5
- **Constat :** les modèles de relance sont désormais propres à chaque référentiel.
- **Correction :** aligner.
- **Fait le 2026-09-28 :** le commentaire d'en-tête de `RelancesPage.tsx` dit les niveaux propres à chaque référentiel (`NIVEAUX_DEFAUT`). Test : `remise-a-lecran.spec.ts`.

**F244 · Deux origines de courrier affichées en code brut** [courrier-01]
- **Emplacements :** client/src/lib/courrier-file.ts:153-164 · courrier.service.ts:31
- **Condition :** 5
- **Constat :** FACTURE_ABONNEMENT et LICENCE_SUR_SITE.
- **Correction :** ajouter les libellés.
- **Fait le 2026-09-28 :** les origines « Facture d'abonnement » et « Licence sur site » ont leur libellé (`courrier-file.ts`). Test : `file-des-courriels.spec.ts`, qui exige un libellé pour chaque constante `ORIGINE_` du serveur.

**F245 · Commentaires déplacés et chemin périmé (plateforme)** [plateforme-11]
- **Emplacements :** plateforme.controller.ts:126-147 · plateforme.service.ts:448-508 · prisma/schema.prisma:732
- **Condition :** 5
- **Constat :** JSDoc empilés, et `src/modules/abonnements` inexistant.
- **Correction :** replacer et corriger.
- **Fait le 2026-09-28 :** les JSDoc de la console sont remis au-dessus de leur route ou méthode, et le schéma cite `src/modules/plateforme/abonnements`. Test : `commentaires-f245.spec.ts`.

### Interface

**F246 · Garde-fou contre la boucle de rechargement effacé à chaque chargement** [chrome-04]
- **Emplacements :** client/src/main.tsx:5-21
- **Condition :** 5
- **Constat :** le commentaire n'est pas tenu.
- **Correction :** marqueur daté.
- **Fait le 2026-09-28 :** le marqueur de rechargement est daté et n'est plus effacé au chargement · un seul rechargement par fenêtre de cinq minutes, convention d'OmegaX, et un stockage refusé vaut refus (`rechargement-chunk.ts`, `main.tsx`). Test : `rechargement-chunk.spec.ts`.

**F247 · Le gestionnaire de paie ne peut pas saisir le cours du jour** [chrome-06]
- **Emplacements :** client/src/lib/roles-cantonnes.ts:13-19 · devises.controller.ts:12 · conversion-usd.ts:61
- **Condition :** 4
- **Constat :** sa paie en dollars dépend d'un comptable.
- **Correction :** ouvrir la cotation, ou adapter le message.
- **Fait le 2026-09-28 :** le gestionnaire de paie lit les devises et cote le cours de l'USD du jour de Kinshasa, et lui seul (`motifRefusCotationGestionnairePaie`, `conversion-usd.ts`, `devises.controller.ts`) ; le message du cours manquant dit où le coter, et la fenêtre Devises lui est ouverte pour ce seul geste (`roles-cantonnes.ts`, `DevisesPage.tsx`). Tests : `cotation-gestionnaire-paie.spec.ts`, `roles-cantonnes.spec.ts` (liste fermée des portes du gestionnaire), `devises-gestionnaire-paie.spec.ts`.

**F248 · Contexte d'exercice : chargement infini en cas d'échec** [chrome-10]
- **Emplacements :** client/src/lib/exercice.tsx:82-103
- **Condition :** 3
- **Constat :** ni try ni finally.
- **Correction :** try/finally, et erreur affichée.
- **Fait le 2026-09-28 :** `lireLesExercices` ne lève jamais et rend le motif d'un échec (`lecture-exercices.ts`) · le contexte referme son chargement et expose l'erreur, que la barre d'état et la fenêtre Exercices affichent, et l'accueil ne reste plus sur « Chargement… » sans exercice (`exercice.tsx`, `SelecteurExercice.tsx`, `ExercicePage.tsx`, `AccueilPage.tsx`). Tests : `lecture-exercices.spec.ts`, `prechargement.spec.ts`. **Reste :** les devis et la facturation ne disent pas encore que les exercices sont illisibles.

**F249 · Cache des comptes non vidé après un tiers ou une fusion** [chrome-11, pages-13]
- **Emplacements :** client/src/lib/api.ts:163-178 · client/src/pages/TiersPage.tsx:268, :322
- **Condition :** 3 et 5
- **Constat :** le plan est faux pendant 30 s.
- **Correction :** vider sur `/tiers` et sur les fusions.
- **Fait le 2026-09-28 :** une écriture sur `/tiers`, `/import`, `/natures-compte` ou `/ecritures/fusion-comptes` vide aussi le cache des comptes, avant l'envoi et à la réponse (`cheminsAViderApres`, `cache-referentiels.ts`, appelé par `api.ts`). Test : `cache-referentiels.spec.ts`.

**F250 · Barre de titre et sélecteur n'écrivent pas le même exercice** [chrome-12]
- **Emplacements :** client/src/components/chrome/AppShell.tsx:68, :655 · SelecteurExercice.tsx:22-30
- **Condition :** 5
- **Constat :** deux libellés sur le même écran.
- **Correction :** fonction `annee` partagée.

**F251 · RegisterPage se dit reliée à aucun bouton** [chrome-14]
- **Emplacements :** client/src/pages/RegisterPage.tsx:5-11 · AuthPage.tsx:358-367
- **Condition :** 5
- **Constat :** faux sur site.
- **Correction :** distinguer les deux modes.

**F252 · Branche morte « bientôt » dans l'assistant de création** [chrome-15, pages-18]
- **Emplacements :** client/src/components/NouveauFichierWizard.tsx:93-152, :432-453
- **Condition :** 5
- **Constat :** toutes les entrées sont disponibles, et le § 4 interdit ce motif.
- **Correction :** retirer le champ et la branche.
- **Fait le 2026-09-28 :** le champ `disponible` et le badge « bientôt » sont retirés de l'assistant de création (`NouveauFichierWizard.tsx`). Test : `annonces-syscohada.spec.ts`.

**F253 · Balance : commentaire périmé sur les comptes Total** [pages-12]
- **Emplacements :** client/src/pages/JournalPage.tsx:823-826 · ecriture.service.ts:2931
- **Condition :** 5
- **Constat :** le serveur les écarte.
- **Correction :** retirer.
- **Fait le 2026-09-28 :** les commentaires de `JournalPage.tsx` et de `balance()` disent que le serveur écarte les comptes Total (`lignesDeBalance`).

**F254 · Accueil : un état du brouillard inconnu s'affiche en vert** [pages-14]
- **Emplacements :** client/src/pages/AccueilPage.tsx:411-412
- **Condition :** 3
- **Constat :** une absence de réponse est présentée comme favorable.
- **Correction :** `?? false`.
- **Fait le 2026-09-28 :** l'état du brouillard non lu s'affiche comme non satisfait (`?? false`), et « aucun jalon en retard » ne se dit que sur une liste lue (`AccueilPage.tsx`). Test : `echecs-de-lecture-dits.spec.ts`.

**F255 · Lectures sans gestion d'erreur qui laissent des listes vides** [pages-15]
- **Emplacements :** client/src/pages/SaisiePage.tsx:250-255 · PasserEcritureFacture.tsx:27 · LibellesPage.tsx:127 · SimulationsBudgetairesPage.tsx:46 · EtatsPersonnalisesPage.tsx:34
- **Condition :** 3
- **Constat :** une erreur devient « Aucun… ».
- **Correction :** afficher l'erreur.
- **Fait le 2026-09-28 :** les journaux, le plan et les écritures de la saisie, les comptes de `PasserEcritureFacture.tsx`, les libellés, les simulations et les états personnalisés partent de null et affichent leur échec au lieu d'une liste vide ou de totaux à zéro. Test : `echecs-de-lecture-dits.spec.ts`. **Reste :** dans la saisie, l'état des journaux par mois, les devises, les plans analytiques et les modèles avalent encore leur échec.

**F256 · Formatage des montants dispersé en une trentaine de copies** [pages-16]
- **Emplacements :** client/src/pages/DashboardPage.tsx:114, :227 · RapprochementDetailPage.tsx:175 · InventairePage.tsx:84 · CircularisationPage.tsx:85 · ProvisionsPage.tsx:180 · BalanceFonctionnellePage.tsx:21
- **Condition :** 5
- **Constat :** options divergentes.
- **Correction :** formateur unique.

**F257 · Journal d'audit : une requête par frappe** [pages-17]
- **Emplacements :** client/src/pages/JournalAuditPage.tsx:106-119, :161-164
- **Condition :** 6
- **Constat :** pas de temporisation.
- **Correction :** temporiser.
- **Fait le 2026-09-28 :** le champ Auteur ne pose le filtre qu'après 250 ms sans frappe, la page revient à 1 dans la même mise à jour, et seule la dernière réponse demandée s'affiche (`JournalAuditPage.tsx`). Test : `journal-audit-temporisation.spec.ts`.

### Performance

**F258 · États SMT SYSCOHADA : écritures lues sans borne, trois fois** [efsy-17]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:386-396, :752 · client/src/pages/EtatsSmtSyscohadaPage.tsx:135
- **Condition :** 6
- **Constat :** contraire au § 8 bis.
- **Correction :** `groupBy`, et plafond déclaré sur la NOTE 4.
- **Fait le 2026-09-28 :** les états SMT ne lisent plus que les écritures qui touchent un 52 à 58, par tranches (`lireParLots`, `pageApres`), cumulées compte par compte ; l'écart se retrouve par différence avec la colonne mouvement de la balance, et la NOTE 4 porte un plafond déclaré qui refuse en 400 avec le chemin du grand livre (`etats-financiers-smt-syscohada.service.ts`, `EtatsSmtSyscohadaPage.tsx`). Test : `etats-financiers-smt-syscohada.service.spec.ts`.

**F259 · Collections du registre du personnel sans borne** [paie-15]
- **Emplacements :** src/modules/personnel/personnel.service.ts:128-140, :345-360 · avances-rubriques.service.ts:18-21, :62-64, :102-110
- **Condition :** 6
- **Constat :** contraire au § 8 bis.
- **Correction :** borne déclarée.
- **Fait le 2026-09-28 :** les listes du registre du personnel sont des tranches qui se disent · salariés 1 000, rubriques, bulletins modèles et avances 500, chacune avec son total compté par la base et `tronque` ; la confrontation lit les salariés par lots de 200 et garde les 500 premières fiches, totaux sur le registre entier (`personnel.service.ts`, `avances-rubriques.service.ts`, `liste-bornee-personnel.ts`). Tests : `registre-borne-et-devise.spec.ts`, `liste-bornee-personnel.spec.ts`, `personnel-audit-final.spec.ts`. **Reste :** les collections imbriquées de `lister`, l'effectif du registre et les versions SMIG de la confrontation.

**F260 · Console : collections sans borne et lecture dans une boucle** [plateforme-10]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:68 · abonnements.service.ts:107, :281
- **Condition :** 6
- **Constat :** les factures sont relues pour chaque abonnement.
- **Correction :** borne, et numéro calculé une fois.
- **Fait le 2026-09-28 :** cabinets, abonnements et licences sur site de la console sont bornés à `PLAFOND_LISTE_CONSOLE` avec total et `tronque` (`plafond-console.ts`), et la facturation parcourt le parc par tranches, le numéro calculé une fois. Test : `console-bornee-f260.spec.ts`.

**F261 · Index par tenantId absents** [socle-13, infra-16]
- **Emplacements :** prisma/schema.prisma:831, :1563, :1810, :3414
- **Condition :** 6
- **Constat :** User, Cloture, RapprochementBancaire, Immobilisation, LigneOdAnalytique et LigneRetraitementIfrs sont parcourues entières.
- **Correction :** `@@index([tenantId…])` par migration, puis contrôle de dérive.

### Exploitation

**F262 · L'épreuve de restauration accepte une base de 20 tables** [infra-15]
- **Emplacements :** .github/workflows/sauvegarde-base.yml:111
- **Condition :** 6
- **Constat :** le schéma compte 126 modèles.
- **Correction :** comparer à la base source.
- **Fait le 2026-09-28 :** la restauration de contrôle se compare table par table et ligne par ligne au décompte de la source, pris dans l'instantané que `pg_dump` exporte (`pg_export_snapshot`, `--snapshot`, `sauvegarde-base.yml`) ; le seuil de 20 tables est retiré. Test : `chaine-de-livraison.spec.ts`. À constater sur Neon au premier run.

**F263 · Scripts de scripts/ qui lisent des fichiers de session disparus** [infra-17]
- **Emplacements :** scripts/index-citations-lot-b.py:10 · scripts/lot-c-citations-sans-texte.py · scripts/lot-d-affirmations-sans-source.py · scripts/rapprocher-citations.py:10
- **Condition :** 5
- **Constat :** ils échouent hors de la session d'origine.
- **Correction :** retirer, ou paramétrer et ranger.
- **Fait le 2026-09-28 :** les quatre scripts du relevé des citations prennent leur répertoire de travail en argument (`scripts/citations_commun.py`), et `rapprocher-citations.py` la racine des compétences en argument ou par `OMEGAX_COMPETENCES` ; déroulé vérifié de bout en bout.

**F264 · Libellés et CSP périmés dans la configuration** [infra-18]
- **Emplacements :** package.json:2, :5 · client/firebase.json:78 · Dockerfile:1
- **Condition :** 5
- **Constat :** « sycebnl-suite », « MVP », « Compta Flow », et une URL Cloud Run inutile dans la CSP.
- **Correction :** mettre à jour, et `connect-src 'self'`.
- **Fait le 2026-09-28 :** `package.json` et son verrou s'appellent `omegax`, avec une description qui nomme les deux référentiels ; l'en-tête du `Dockerfile` nomme OmegaX ; le `connect-src` de `client/firebase.json` vaut `'self'`, la CSP du site étant égale à `POLITIQUE_INTERFACE`. Tests : `src/configuration-a-jour.spec.ts`, `chaine-de-livraison.spec.ts`.

**F265 · Copies avant mise à jour ni listées, ni tournées, ni recopiées** [surSite-03, infra-19]
- **Emplacements :** installation/demarrer.cjs:76-78 · src/modules/sur-site/sauvegarde-sur-site.service.ts:48, :129, :176
- **Condition :** 6
- **Constat :** hors `MOTIF_NOM`, elles s'accumulent sur le disque.
- **Correction :** nommer selon le motif ou l'étendre, et garder les N dernières.
- **Fait le 2026-09-28 :** les copies avant mise à jour forment une série (`omegax-AAAAMMJJ-HHMMSS-avant-mise-a-jour-<version>.dump`), listée avec les quotidiennes, tournée à part (cinq par défaut, `SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER`), recopiée hors du poste, et jamais retirée quand elle précède une migration qui n'a pas abouti (`copies-avant-mise-a-jour.ts`, `sauvegarde-sur-site.service.ts`). Tests : `copies-avant-mise-a-jour.spec.ts`, `lanceur-sur-site.spec.ts`, `sur-site-divers.spec.ts`.

### Documentation

**F266 · Table des workflows de CLAUDE.md § 5 incomplète** [doc-06]
- **Emplacements :** CLAUDE.md:118-125 · .github/workflows/surveillance.yml · paquet-sur-site.yml · firebase-hosting-pull-request.yml
- **Condition :** 6
- **Constat :** la surveillance de production n'y figure pas.
- **Correction :** compléter, et retirer « deux chaînes ».
- **Fait le 2026-09-28 :** la table du § 5 de CLAUDE.md porte les sept workflows, chaque déclencheur relu dans son `on:`. Test : `reglement-interieur.spec.ts`.

**F267 · Documents historiques présentés comme vivants** [doc-19]
- **Emplacements :** docs/plan-de-construction.md:1-40 · ecarts-sage-omegax.md:51-120 · audit-complet-2026-08.md:125-148 · releve-de-manques-referentiels.md:867-870 · plan-ordonne-2026-09.md:45-46 · decision-multi-classification.md:9-12 · etats-financiers-liasses-referentiels.md:1-10, :92-96
- **Condition :** 5
- **Constat :** état révolu, sans bandeau.
- **Correction :** bandeaux datés, et dossier `docs/historique/`.
- **Fait le 2026-09-28 :** `ecarts-sage-omegax.md` et `audit-complet-2026-08.md`, cités par ce seul document, sont rangés dans `docs/historique/` sous bandeau (`docs/historique/README.md`) ; les cinq autres, cités par le code ou la compétence, restent en place avec un bandeau daté qui dit ce qui a changé. Test : `src/common/documents-historiques.spec.ts`.

**F268 · Décompte des routes limitées en débit périmé** [doc-20]
- **Emplacements :** docs/connexions-et-plafonds.md:162-168 · auth.controller.ts:43-171 · sur-site.controller.ts:47
- **Condition :** 5
- **Constat :** six routes à 20 par minute, pas deux.
- **Correction :** renvoyer aux contrôleurs.
- **Fait le 2026-09-28 :** le § 7 de `docs/connexions-et-plafonds.md` ne compte plus les routes, il nomme le plafond commun et les deux contrôleurs qui posent des `@Throttle`. Test : `src/common/limitation-debit-documentee.spec.ts`.

**F269 · Arborescence de CLAUDE.md § 2 : module inexistant et dossiers omis** [doc-21]
- **Emplacements :** CLAUDE.md:52-60
- **Condition :** 5
- **Constat :** « ecritures » au lieu de « comptabilite », et `installation/`, `e2e/`, `scripts/` absents.
- **Correction :** corriger.
- **Fait le 2026-09-28 :** l'arborescence du § 2 de CLAUDE.md est relue contre le disque (`comptabilite/`, `sur-site`, `e2e/`, `installation/`, `scripts/`, `.claude/skills/`, `docs/historique/`). Test : `reglement-interieur.spec.ts`.

---

## Couverture

Aucune zone n'a lancé de test, de typage, de construction ni de serveur, conformément à la consigne. Les constats de performance reposent sur les mesures écrites du dépôt (auth.service.ts:90, docs/capacite-mesuree.md), pas sur une exécution.

- **Saisie.**
  - Parcourus en entier : comptabilite (ecriture.service sur toute sa longueur, recherche, réimputation, détenteurs), journaux, lettrage, rapprochement, règlements (contrôleurs, services, lots, ordres), modeles-saisie, import (importerBalance et importerEcritures), devises, banques.
  - Relus pour vérifier des dépendances : report à-nouveau, clôture, cumuls analytiques, tableau emplois ressources.
  - Côté client : tous les appels de la zone confrontés aux routes (aucune route manquante) et les gardes de droits.
  - Non parcourus : les specs, lecture-fichier.ts en détail, les DTO d'import et de rapprochement, et JournalPage hors appels.
- **Exercice.**
  - Parcourus en entier : exercice.service, gel-cloture, report-a-nouveau, report-periode-close, planning-cloture (structure), affectation, régularisation, operations-specifiques (catalogue survolé), questionnaire, faiblesses, circularisation, dossier-revision, test-ecritures-journal.
  - controles.service.ts lu bloc par bloc.
  - Écrans correspondants vérifiés contre les deux audits du 2026-09-27.
  - Non parcourus : contenu rédactionnel des catalogues, fichiers engendrés regles-comptes et schemas-guide, rapprochement-guide-plan, regles-auditeur ligne à ligne, specs.
- **États SYCEBNL.**
  - Lus en entier : contrôleur et services des états (associations, projet, budget, SMT), notes annexes et leurs écrans.
  - Lus en partie : tables de correspondance et EtatsFinanciersPage.
  - Non relus ligne à ligne : les grandes tables (compte de résultat, TFT, projets, 45 et 26 notes), le rendu JSX du bilan, du compte de résultat et du TFT, les onglets du SMT, comparabilite-exercices, les specs.
  - Remarque hors zone non retenue : le report DÉTAIL et le lettrage entre exercices.
- **États SYSCOHADA.**
  - Lus en entier : contrôleur, service du Système normal, service SMT, tables du bilan et du SMT, parties utiles du compte de résultat et du TFT, trois écrans.
  - Une hypothèse a été écartée : le compte de résultat ne tombe pas à zéro sur un exercice clos.
  - Non parcourus : corps des 46 tables de notes, postes FE à FQ, NoteAnnexeService SYSCOHADA, exports ETAFI, démonstration de l'écart de concordance SMT.
- **Exports.**
  - Lus en entier : export.controller, restitution (contrôleur, service, tables, manifeste), classeur-en-flux, documents-obligatoires, DocumentsObligatoiresPage, RestitutionPage.
  - export.service.ts lu sur les tranches 1-3555, 3554-3700, 4205-4445, 5830-5960 et 6295 à la fin.
  - Lus en diagonale seulement : 3700-4205, 4445-5830 et 5960-6295, ainsi que theme-etafi et etat-etafi.
- **Paie.**
  - Parcouru en entier : tout src/modules/personnel, sauf regles-contrat-travail hors contrôle de minimum.
  - Côté client : BulletinsPaie, PaieDuMois, BaremeMensuelIrpp, BaremesPaie ; PersonnelPage sur l'en-tête, les corps et les appels.
  - Non parcourus : le reste du rendu de PersonnelPage, lib/modeles-bulletin, lib/onglets-personnel, specs.
- **Fiscal.**
  - Parcourus : contrôleurs et DTO des six modules, facturation, commercial, exonérations, retenues, fiscalité (lecture, déficits, résultat, impôt), TVA (semis, prorata, requête de déclaration, liquidation), écrans et lib TVA.
  - Non parcourus ligne à ligne : corps de la déclaration de TVA (l. 1830-2350), prorataDefinitif, catalogue des retraitements, exemption IS EBNL, correspondance des exonérations, rendus détaillés, tests.
  - Aucune confrontation article par article.
- **Biens.**
  - Parcourus en entier : immobilisations, dégressif, stocks, magasin, inventaire (hors PV de caisse détaillé), emballages (services), provisions.
  - Écrans principaux vérifiés, rôles de toutes les routes d'écriture vérifiés.
  - Non couverts : détail des coupures du PV de caisse, rendu complet des écrans, confrontation des nomenclatures aux semis.
- **Groupe.**
  - Parcourus en entier : contrôleurs, services de périmètre, de cumul et des états consolidés, ifrs.service à partir de la l. 130, groupe.service, balance fonctionnelle, cascades du schéma, appels des écrans.
  - Par sondage : cumul-consolidation et flux-capitaux-consolides.
  - Non lus : etats-ifrs, etats-ifrs-consolides (hors 30-230), notes-ifrs (hors notes 7-9), notes-ifrs12, premiere-application-ifrs, variation des capitaux propres, flux-tresorerie-ifrs, rubriques-ifrs, canevas-tresorerie, specs.
- **Sécurité.**
  - Parcourus : bootstrap, cloisonnement (126 modèles classés), audit, gardes, décorateurs, périmètre des journaux, fonctions métier, références, auth, utilisateurs, tenant, licence.
  - Balayés par script : 67 contrôleurs (JwtAuthGuard, LicenceGuard, @Roles, ReferentielGuard, FONCTION_PAR_CONTROLEUR) ; cohérence serveur et client des référentiels sans divergence ; 205 relations sans onDelete explicite, aucun SET NULL dangereux.
  - Non parcourus : avis-acces au-delà de l'en-tête, vérification de l'appartenance au dossier de chaque identifiant reçu dans chaque service.
- **Plateforme.**
  - Parcourus en entier : plateforme, sur-site, courrier, relances.
  - Lus pour vérification : cloisonnement, licence, groupe, tenant, auth, installation, workflows.
  - Écrans principaux lus.
  - Non parcourus : LicencesSurSiteConsole, PanneauSurSite, SauvegardesSurSite hors appels, specs, reste du service tenant.
- **EBNL.**
  - Parcourus en entier : analytique, bailleurs, registre des donateurs, accord-cadre, constitution, mandat de l'auditeur et contrôle 28, simulations, états personnalisés, tiers, comptes.
  - Semis vérifiés par script.
  - Appels des écrans confrontés.
  - Non parcourus ligne à ligne : corps de TiersPage, ConventionsFinancementPage, RegistreDonateursPage, BailleursPage, PalmaresJournauxPage, JustificatifSoldePage, EvolutionSoldesPage, BalanceAgeePage, BalanceAuxiliairePage, documents-tiers.ts, catalogue de constitution au-delà des clés.
  - Le rejet de null par Prisma (F38) n'a pas été exécuté.
- **Client, chrome.**
  - Parcourus en entier : App, main, lib (api, auth, exercice, fenêtres, profils, rôles), chrome, PortailModale, SauvegardesSurSite.
  - Confrontation automatique des 591 appels aux 578 routes : aucun appel vers une route inexistante.
  - Menus et registre cohérents. Constats de l'audit d'interface revérifiés.
  - Non parcourus : contenu des pages, lexique, types, modules de règles au-delà de leur usage, composants IFRS et paie au-delà des appels, index.css, specs.
- **Client, pages.**
  - Lues en entier : une douzaine de pages ; une quinzaine en partie.
  - Balayages transversaux des 124 pages : appels et méthodes, liens internes, droits d'écriture, rejets non gérés, formats, § 9 ter.
  - Non parcourues ligne à ligne : les grandes pages métier (supposées couvertes par les autres zones).
  - L'usage du report comme N-1 dans le TFT SYSCOHADA de repli n'a pas été vérifié jusqu'au bout.
- **Cohérence.**
  - Recherche systématique sur src/, hors specs : constantes dupliquées, arrondis, tolérances, définitions croisées, jour de Kinshasa, ajout de mois, bornes d'entrée en vigueur, jour ouvrable, barèmes de paie, numérotation, clôtures, drapeau de clôture, SMT et seuils, groupBy hors EcritureService, appartenance en facturation.
  - Compétence lue : cnss-cotisations-sociales-rdc.
  - Non parcourus en détail : client, tables de correspondance poste par poste, IFRS et consolidation au-delà des utilitaires, export hors balance, migrations.
- **Documentation.**
  - CLAUDE.md balayé en entier par sections et par scripts (chemins, compteurs, cadratins, noms de modèles).
  - Décomptes vérifiés sur les specs et le compilé.
  - Documents d'exploitation, de restitution, d'audit, de paie et de comparaison lus.
  - Non parcourus article par article : releve-de-manques-fiscal, releve-de-manques-referentiels (sondé), audit-citations, organisation-comptable-cpcc, obligations annuelles, identifiants légaux, stocks-notes-de-cours, paie-p1, p2a, p6, p7, charte.
  - Les constats F et I des audits du 2026-09-27 n'ont pas tous été revérifiés, et la liste des corrigés non marqués (F200) peut être plus longue.
- **Exploitation.**
  - Parcourus en entier : sept workflows, dependabot, Dockerfile, fichiers ignore, package.json, configuration du client, firebase.json, installation (lanceur, scripts Windows), e2e, en-têtes des scripts.
  - Migrations contrôlées en ordre et présence.
  - findMany sans take et lectures en boucle relevés par script.
  - Non parcourus : environ 150 findMany sur des tables de structure, boucles en map ou Promise.all, SQL de chaque migration, docs de sauvegarde et de plafonds au-delà de recherches ciblées.
  - Deux points restent des inférences : l'ACL par défaut de ProgramData (F192) et le comportement de WinSW au-delà de deux échecs (F191).
