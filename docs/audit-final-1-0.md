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

**F57 · Le lettrage automatique pose des groupes calculés hors transaction** [saisie-12]
- **Emplacements :** src/modules/lettrage/lettrage.service.ts:283-310, :948
- **Condition :** 3
- **Constat :** `creerGroupe` réaffecte les lignes sans vérifier qu'elles sont encore libres. Un lettrage concurrent perd des lignes et son solde stocké devient faux.
- **Correction :** relire les lignes avec `lettrageId: null` dans la transaction.

**F58 · Changer la date d'un brouillard en journal mensuel garde son numéro de pièce** [saisie-13]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:910-925
- **Condition :** 5
- **Constat :** aucune renumérotation au changement de mois. Il en résulte un trou dans le mois d'origine et un doublon possible dans le mois d'arrivée.
- **Correction :** refuser le changement de mois, ou renuméroter dans la même transaction.

**F59 · Un nouveau journal naît en numérotation MANUELLE, sans moyen de saisir un numéro** [saisie-14]
- **Emplacements :** client/src/pages/JournauxPage.tsx:38 · src/modules/journaux/journal.service.ts:80 · dto/creer-ecriture.dto.ts:116
- **Condition :** 3
- **Constat :** en MANUELLE, le numéro vaut null et aucun DTO ne porte de numéro. Toutes les pièces restent sans numéro (AUDCIF art. 17, 3°).
- **Correction :** défaut en continue par journal, ou choix obligatoire, avec la mention à l'écran.

**F60 · Le compte de trésorerie d'un journal n'est vérifié ni pour le dossier ni pour sa nature** [saisie-15]
- **Emplacements :** src/modules/journaux/journal.service.ts:49-53, :72-82, :114
- **Condition :** 2
- **Constat :** l'identifiant est écrit tel qu'il est reçu : un compte d'un autre dossier (rendu ensuite par `include`), de classe 6 ou Total, est accepté.
- **Correction :** lire le compte borné au dossier, en classe 5 et de type DETAIL.

**F61 · La saisie ignore la troncature du journal chargé** [saisie-18]
- **Emplacements :** client/src/pages/SaisiePage.tsx:381-390, :877-887 · ecriture.service.ts:1926
- **Condition :** 3
- **Constat :** au-delà de 2 000 pièces, la dernière pièce affichée et les totaux sont faux, sans un mot. La fenêtre Journal, elle, le dit.
- **Correction :** lire `tronque` et `total`, et charger par ordre décroissant ou par pages.

**F62 · Relevé bancaire : une écriture visée par deux lignes est donnée à la première (passe par référence)** [saisie-20]
- **Emplacements :** src/modules/rapprochement/releve-bancaire.ts:236-249
- **Condition :** 5
- **Constat :** la passe 1 ne compte pas les demandes par écriture, contrairement au commentaire et à CLAUDE.md. La fenêtre de dates n'y est pas non plus appliquée.
- **Correction :** compter les demandes comme en passe 2.

**F63 · En-tête du lettrage : « aucun contrôle de clôture ici », alors que le service fige par la clôture** [saisie-21]
- **Emplacements :** src/modules/lettrage/lettrage.service.ts:75-90
- **Condition :** 5
- **Constat :** le commentaire dit le contraire du code, qui appelle `refuserSiLignesFigees`.
- **Correction :** réécrire l'en-tête et renvoyer à gel-cloture.ts.

**F64 · Correction : « aucune des deux exceptions n'a de chemin », alors que la route existe** [saisie-22]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:1850-1853, :435
- **Condition :** 5
- **Constat :** `imputerAuxCapitauxPropresDOuverture` existe. Le commentaire et le message de refus déclarent la lacune à tort.
- **Correction :** renvoyer à cette route dans le commentaire et dans le refus.

**F65 · `modifier` dit refuser l'écriture d'une facture et la laisse modifier** [saisie-23]
- **Emplacements :** src/modules/comptabilite/ecriture.service.ts:895-898 · detenteurs-ecriture.ts:55
- **Condition :** 5
- **Constat :** la facture est rangée dans ECRITURE_LAISSEE_PARTIR. L'écriture se modifie donc pendant que la facture la désigne toujours.
- **Correction :** compter la facture comme détentrice pour `modifier`, ou corriger le commentaire.

### Exercice, clôture, contrôles et révision

**F66 · La reprise d'un produit à recevoir double la créance au lieu de l'extourner** [rev-02]
- **Emplacements :** src/modules/regularisation/regularisation.service.ts:578-590
- **Condition :** 1
- **Constat :** le sens de la reprise est choisi par `estCharge`. Pour PRODUIT_A_RECEVOIR, la reprise reproduit l'écriture de constatation (D 418 / C 7x), et aucun test ne porte sur `reprendre`.
- **Correction :** prendre l'inverse exact de `debiteLeCompteDeGestion`, et tester chaque type.

**F67 · Charges à payer et produits à recevoir : servis par le serveur, absents de l'écran** [rev-03]
- **Emplacements :** client/src/pages/RegularisationPage.tsx:49-73, :160-168 · client/src/lib/types.ts:1703 · regularisation.service.ts:344-360
- **Condition :** 4
- **Constat :** l'écran ne connaît que trois types et n'envoie jamais `natureTiers`, et `simuler` applique le prorata au rattachement. Le rattachement, décrit comme livré, ne s'accomplit pas.
- **Correction :** exposer les deux types et la nature du tiers, faire rendre le montant entier par `simuler`, après correction de F66.

**F68 · Comptes dormants : solde multiplié par les reports, et comptes dormants à solde jamais signalés** [rev-06]
- **Emplacements :** src/modules/controles/controles.service.ts:535-590
- **Condition :** 1
- **Constat :** toutes les lignes de tous les exercices sont sommées, reports compris. Le report du 1er janvier compte en plus comme un mouvement, et `Math.max(...dates)` lève au-delà d'un gros volume.
- **Correction :** prendre le solde sur la balance du dernier exercice et le dernier mouvement hors clôture par `groupBy`.

**F69 · Prorogation du SYCEBNL art. 22 servie aux sociétés, et sans limite de durée** [rev-08, mandat-02]
- **Emplacements :** src/modules/controles/controles.service.ts:2917-2977 · client/src/pages/MandatAuditeurPage.tsx:292-299 · mandat-auditeur.service.ts:157-169
- **Condition :** 1
- **Constat :** le contrôle 28 et l'aide citent l'art. 22 sans regarder le référentiel, et `echu` prend tout mandat échu, même ancien. Une SA lit que son commissaire est prorogé par un texte qui ne la régit pas.
- **Correction :** borner la prorogation au SYCEBNL et à l'exercice qui suit le dernier couvert.

**F70 · Circularisation : taux de couverture calculé sur l'échantillon envoyé** [rev-09]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:439-452 · client/src/pages/CircularisationPage.tsx:419-421
- **Condition :** 1
- **Constat :** le dénominateur est le solde envoyé, alors que CLAUDE.md dit le total du cycle. Deux petites lettres confirmées affichent 100 %.
- **Correction :** prendre le total du cycle sur la balance comme dénominateur.

**F71 · Demandes de confirmation ajoutées après l'envoi : jamais envoyées, oubliées à la clôture** [rev-10]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:191-195, :223-240, :367-369
- **Condition :** 3
- **Constat :** une demande A_ENVOYER ajoutée à une campagne envoyée ne part jamais, et la clôture ne la voit pas. Il n'y a pas non plus d'unicité par compte.
- **Correction :** refuser l'ajout hors préparation (ou envoyer les A_ENVOYER), bloquer la clôture sur A_ENVOYER, et poser l'unicité (campagneId, compteId).

**F72 · Circularisation : solde lu à la fin de l'exercice, pas à la date d'arrêté** [rev-11]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:162, :205
- **Condition :** 1
- **Constat :** `balance` est appelée sans `arreteAu`. Une campagne intermédiaire envoie le solde de fin d'exercice.
- **Correction :** passer `dateArrete` et la borner à l'exercice.

**F73 · Faiblesses : escalade permise en mode « recommandation reçue »** [rev-13]
- **Emplacements :** src/modules/faiblesses/faiblesses.service.ts:481-510
- **Condition :** 1
- **Constat :** `escalader` requalifie la lettre d'un tiers, que `qualifier` refuse de toucher.
- **Correction :** poser le même refus.

**F74 · Faiblesses : report vers un registre d'une autre origine ou d'un exercice antérieur** [rev-14]
- **Emplacements :** src/modules/faiblesses/faiblesses.service.ts:418-470
- **Condition :** 1
- **Constat :** qualification, auteur et constat sont recopiés quelle que soit l'origine du registre cible, et un exercice antérieur est accepté.
- **Correction :** exiger la même origine et un exercice postérieur.

**F75 · Questionnaire : réponse orpheline d'un item refermé, clôture bloquée** [rev-15]
- **Emplacements :** src/modules/questionnaire/questionnaire.service.ts:126, :298
- **Condition :** 3
- **Constat :** les exceptions sont comptées sur tous les items, y compris les items fermés, que l'utilisateur ne peut plus corriger.
- **Correction :** ne compter que les items ouverts, ou purger la réponse enfant au changement du parent.

**F76 · Contrôle des conventions : confusion entre convention de bailleur et accord-cadre** [rev-16]
- **Emplacements :** src/modules/controles/controles.service.ts:2280-2292
- **Condition :** 1
- **Constat :** une association congolaise dont une subvention est échue lit qu'elle exerce « sans titre » au nom de l'art. 37.
- **Correction :** retirer la phrase sur l'art. 37.

**F77 · Brouillards invalidables comptés en retard par le planning et l'état du brouillard (correction F12 à moitié appliquée)** [rev-17, transv-12]
- **Emplacements :** src/modules/exercice/exercice.service.ts:316, :333-339 · src/modules/comptabilite/ecriture.service.ts:824, :1338-1383 · src/modules/controles/controles.service.ts:281, :863
- **Condition :** 1 et 5
- **Constat :** le contrôle 4 exclut l'à-nouveau provisoire et la clôture d'un exercice clos, mais pas le planning ni `brouillard()`. Un exercice clos garde à vie « écritures au brouillard, à valider », et `JOURS_CENTRALISATION` est déclaré deux fois.
- **Correction :** un module commun (délai, prédicat `brouillardInvalidable`, ancienneté) appelé par les trois.

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

**F80 · Aucun écran ne crée un exercice autre que le suivant** [chrome-07]
- **Emplacements :** src/modules/exercice/exercice.controller.ts:28-31 · client/src/pages/ExercicePage.tsx:246
- **Condition :** 4
- **Constat :** `POST /exercices` n'a aucun appel client. Un exercice antérieur (reprise), non contigu ou de liquidation ne peut pas être créé.
- **Correction :** ajouter un bloc « Créer un exercice » réservé à l'administrateur.

**F81 · Planning de clôture : ni report de l'art. 110 bis, ni troncature du jour** [transv-09]
- **Emplacements :** src/modules/exercice/planning-cloture.ts:1033 · exercice.service.ts:368, :402 · retenues.service.ts:97, :187
- **Condition :** 1
- **Constat :** un jalon passe « en retard » dès minuit UTC du jour limite, et aussi un week-end ou un jour férié que le registre des retenues reporte. Le commentaire « UTC partout » est faux.
- **Correction :** une fonction d'échéance unique, avec report et comparaison au jour, dans une seule convention de fuseau.

### États financiers et notes

**F82 · Note 9 : cumul non arrêté à l'exercice demandé** [etats-03]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet.service.ts:330-337, :389-395
- **Condition :** 1
- **Constat :** une réimpression de N inclut N+1, contrairement au tableau emplois ressources de la même liasse.
- **Correction :** borner comme `balanceCumulee`.

**F83 · Erreur avalée : toute panne du tableau budgétaire devient « aucun plan à budgets »** [notes-03, exp-02]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:1050-1055 · src/modules/exports/export.service.ts:4296-4308
- **Condition :** 3
- **Constat :** les deux `catch` nus remplacent toute erreur par le repli voulu. La note ou la grille vierge sort avec un motif faux.
- **Correction :** n'attraper que `NotFoundException`.

**F84 · Un compte rattaché sans solde devient invisible et impossible à détacher** [notes-04]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:601, :660-683 · client/src/components/NotesAnnexesRendu.tsx:230, :298-323
- **Condition :** 4
- **Constat :** la ligne non chiffrée est retirée et le bouton ✕ se bâtit sur les comptes mouvementés. Un rattachement erroné ne se défait plus.
- **Correction :** rendre les rattachements à part et bâtir la liste détachable dessus.

**F85 · Note 2 des SMT : « OmegaX ne tient pas d'inventaire physique », lacune déclarée à tort** [etats-06, efsy-02]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-smt.service.ts:627-652 · client/src/pages/EtatsSmtPage.tsx:521 · src/modules/etats-financiers-syscohada/etats-financiers-smt-syscohada.service.ts:1020, :1058 · client/src/pages/EtatsSmtSyscohadaPage.tsx:842
- **Condition :** 5
- **Constat :** `FicheInventaire`, `ArticleStock` et `MouvementStock` portent quantités et valeurs, et l'inventaire n'est pas masqué au SMT. Le cabinet ressaisit à la main ce que le dossier contient.
- **Correction :** servir quantité et valeur depuis la dernière campagne, sinon reformuler le motif.

**F86 · Exécution budgétaire : sous-totaux présentés comme des lignes de détail** [notes-05]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:1077-1084 · client/src/pages/EtatsFinanciersPage.tsx:991-1009
- **Condition :** 5
- **Constat :** `estTotal` est faux partout et `estRubrique` n'est pas lu : additionner la colonne compte chaque dépense deux fois.
- **Correction :** `estTotal: l.estRubrique` et un rendu distinct.

**F87 · Notes d'un exercice clos : saisies réécrites ou effacées sans trace** [notes-06]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:912-957 · src/common/audit/champs-audites.ts:275 · note-annexe.controller.ts:94-97
- **Condition :** 3
- **Constat :** `deleteMany` ou `upsert` sans lecture du statut, et `SaisieNote` est exclu de l'audit. La valeur antérieure est perdue.
- **Correction :** journaliser SaisieNote (ou refuser sur un exercice clos) et corriger le commentaire du rattachement.

**F88 · Éligibilité SMT SYSCOHADA : verdict coloré qui compare des francs congolais à des F CFA** [efsy-03]
- **Emplacements :** src/modules/etats-financiers-syscohada/etats-financiers-smt-syscohada.service.ts:1439 · client/src/pages/EtatsSmtSyscohadaPage.tsx:1028
- **Condition :** 1
- **Constat :** la tenue est toujours en CDF, donc la comparaison n'a jamais d'objet, et pourtant elle colore trois verdicts.
- **Correction :** retirer le verdict tant qu'aucun cours n'est déclaré.

**F89 · Postes internes RQP et TQP imprimés sur tout compte de résultat** [efsy-05]
- **Emplacements :** correspondance-compte-resultat-syscohada.ts:233, :439, :612 · src/modules/exports/export.service.ts:4982
- **Condition :** 5
- **Constat :** `REFS_POSTES_SUPPLEMENTAIRES` n'est lu par personne. Des clés internes partent en colonne REF de la liasse.
- **Correction :** filtrer RQP et TQP quand ils sont nuls, à l'écran et à l'export.

**F90 · Situation intermédiaire au 31 décembre refusée à tort** [efsy-07]
- **Emplacements :** src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts:404 · client/src/pages/EtatsFinanciersSyscohadaPage.tsx:405
- **Condition :** 4
- **Constat :** `dateFin` est à minuit et l'arrêté à 23:59:59. On obtient un 400 « après la clôture », et le spec masque le cas.
- **Correction :** comparer à `finDeJournee(dateFin)` et aligner le spec.

**F91 · Exports lancés depuis une situation intermédiaire : l'exercice entier est rendu** [efsy-08]
- **Emplacements :** client/src/pages/EtatsFinanciersSyscohadaPage.tsx:183, :199 · src/modules/exports/export.controller.ts:572
- **Condition :** 3
- **Constat :** `arreteAu` n'est pas transmis. Le fichier ne correspond pas à l'écran d'où il part.
- **Correction :** transmettre la date, ou désactiver les exports en le disant.

**F92 · Comptes à solder à la clôture (104…) : constante jamais lue** [efsy-09]
- **Emplacements :** correspondance-bilan-syscohada.ts:261, :613
- **Condition :** 5
- **Constat :** les commentaires annoncent un signalement qui n'existe pas. Un 104 non soldé passe sans avertissement.
- **Correction :** lire la constante dans `bilan`, ou corriger les commentaires.

**F93 · Tableau de bord d'un exercice clos : produits, charges et résultat à zéro** [pages-02]
- **Emplacements :** client/src/pages/DashboardPage.tsx:63-81
- **Condition :** 1
- **Constat :** le calcul se fait sur `solde`, que la clôture remet à zéro.
- **Correction :** calculer sur les mouvements hors clôture.

### Exports, documents obligatoires et restitution

**F94 · Trésorerie du rapport tirée du TFT associations pour tout dossier** [docob-02]
- **Emplacements :** src/modules/documents-obligatoires/rapport-activite.service.ts:120, :289-296 · export.service.ts:3158-3162 · client/src/pages/DocumentsObligatoiresPage.tsx:423-446
- **Condition :** 1
- **Constat :** une société SYSCOHADA, un projet ou un SMT reçoit l'indicateur « bouclé » d'un tableau qui n'est pas le sien.
- **Correction :** aiguiller la source selon le référentiel et le jeu, et rendre null sans TFT.

**F95 · Livre d'inventaire et rapport SYSCOHADA : l'export et l'écran citent les articles SYCEBNL** [docob-03]
- **Emplacements :** src/modules/exports/export.service.ts:2941-2945, :2980, :3154 · rapport-activite.service.ts:105-108 · client/src/pages/DocumentsObligatoiresPage.tsx:226, :245-249, :323-331
- **Condition :** 1
- **Constat :** « Art. 14, point 1 », « article 24 » et « 16-3 » s'impriment pour une société, c'est-à-dire la transposition que CLAUDE.md interdit.
- **Correction :** faire porter par les services le libellé et l'article de sanction, et ajouter un test qui relit le classeur SYSCOHADA.

**F96 · Restitution : une erreur de lecture d'une table n'est pas captée** [restit-01]
- **Emplacements :** src/modules/exports/restitution/restitution.service.ts:91-145, :259-281
- **Condition :** 6
- **Constat :** `lignesCsv` et `ligneDuDossierCsv` n'ont pas de protection, alors que le fichier décrit cette forme d'erreur comme fatale au serveur.
- **Correction :** envelopper les générateurs comme `contenuDocument`, consigner l'échec et détruire la sortie.

**F97 · Manifeste et écran de restitution : « aucune pièce justificative numérisée », alors que les documents des tiers sont archivés** [restit-02, pages-05, doc-04]
- **Emplacements :** src/modules/exports/restitution/manifeste-restitution.ts:46-60, :71-74 · client/src/pages/RestitutionPage.tsx:45-58 · restitution.service.ts:233-243 · tables-restitution.ts:139-141 · prisma/schema.prisma:7647 · docs/restitution-du-dossier.md:25-27
- **Condition :** 5
- **Constat :** `DocumentTiers.contenu` est stocké et écrit dans `documents-tiers/`. Le manifeste affirme pourtant l'inverse, écrit « aucune autre colonne n'est retirée », et ne compte que trois imports.
- **Correction :** reformuler la réserve, nommer le dossier et la colonne sortis à part, corriger le décompte des imports et les specs.

**F98 · Décompte « 54 tables » périmé** [restit-03, doc-04]
- **Emplacements :** restitution.service.ts:247 · lecture-bornee.spec.ts:129 · restitution.spec.ts:103, :230 · docs/restitution-du-dossier.md:19, :43
- **Condition :** 5
- **Constat :** le spec fige 126 modèles, la liste compte 121 tables et 17 bornes portées. Le chiffre écrit se lit comme une garantie.
- **Correction :** retirer les chiffres des commentaires, des titres de tests et du document.

**F99 · Grand livre complet : la feuille Sommaire promise n'existe pas** [exp-03]
- **Emplacements :** src/modules/exports/export.service.ts:152, :790-891
- **Condition :** 5
- **Constat :** une seule feuille, sans totaux, et le brouillard y est mêlé sans colonne Statut.
- **Correction :** écrire le sommaire ou corriger la documentation, et ajouter Statut ou une mention.

**F100 · Exports du grand livre sans exerciceId obligatoire** [exp-04]
- **Emplacements :** src/modules/exports/export.controller.ts:28-40, :145-165
- **Condition :** 1
- **Constat :** sur appel direct, tous les exercices sont agrégés, reports compris, contre la règle EXERCICE_REQUIS posée par le contrôleur lui-même.
- **Correction :** poser EXERCICE_REQUIS.

**F101 · Grand livre d'un compte et justificatif : classeur en mémoire sans plafond** [exp-05]
- **Emplacements :** src/modules/exports/export.service.ts:725-790, :1298-1420
- **Condition :** 6
- **Constat :** un compte de banque très mouvementé peut tuer le processus pour tous les cabinets.
- **Correction :** appeler `verifierVolume`, ou passer ces exports en flux.

**F102 · Documents remis à des tiers sans identification de l'entité ni de l'exercice** [exp-06]
- **Emplacements :** src/modules/exports/export.service.ts:2212-2291, :2599-2614, :2904-2927, :3099-3200
- **Condition :** 5
- **Constat :** la Note 9, le registre des donateurs, le livre d'inventaire et le rapport sortent sans cartouche, contre la règle du service et l'AUDCIF art. 22, 7°.
- **Correction :** `identiteLiasse`, `ecrireCartouche` et `numeroterPages`.

**F103 · Deux commentaires contradictoires sur les notes non applicables** [exp-08]
- **Emplacements :** src/modules/exports/export.service.ts:2305-2311, :2503-2525
- **Condition :** 5
- **Constat :** le bandeau décrit l'ancien comportement. Un relecteur le rétablirait.
- **Correction :** réécrire le bandeau.

### Paie

**F104 · Quotité saisissable surestimée quand l'IRPP s'abstient** [paie-05]
- **Emplacements :** src/modules/personnel/personnel.service.ts:813 · quotite-saisissable.ts:382-388
- **Condition :** 1
- **Constat :** un impôt non chiffré est lu comme zéro dans la base de l'art. 114, sans abstention.
- **Correction :** passer null et s'abstenir (IMPOT_NON_CHIFFRE), de même pour la CNSS.

**F105 · Régime libératoire présumé au droit commun** [paie-06]
- **Emplacements :** src/modules/personnel/bareme-irpp.ts:49, :449-461 · personnel.service.ts:737-746
- **Condition :** 1
- **Constat :** `regimeApplicable` n'est appelé nulle part. Un employé de maison reçoit le barème progressif, contre le commentaire et CLAUDE.md.
- **Correction :** régime dans le DTO, abstention pour les régimes forfaitaires, ou retrait de la promesse.

**F106 · Réserve affichée « la quotité de l'art. 114 n'est pas calculée » sous une quotité calculée** [paie-07]
- **Emplacements :** src/modules/personnel/cotisations-paie.ts:451 · client/src/pages/PersonnelPage.tsx:2441
- **Condition :** 5
- **Constat :** garantie négative périmée, figée dans chaque bulletin.
- **Correction :** remplacer la réserve et geler la bonne par un test.

**F107 · La suppression de l'écriture de paie est réécrite à la main** [paie-10]
- **Emplacements :** src/modules/personnel/comptabilisation-paie.service.ts:134-138, :152-183
- **Condition :** 5
- **Constat :** les gardes de `EcritureService.supprimer` et `retirerCompensation` sont en partie dupliquées : la même règle est écrite deux fois.
- **Correction :** appeler ces méthodes.

**F108 · Montants de bulletin modèle à deux décimales refusés** [paie-11]
- **Emplacements :** src/modules/personnel/modeles-bulletin.ts:76
- **Condition :** 4
- **Constat :** la comparaison flottante refuse 19,99, 1,1 et 1234,1.
- **Correction :** tolérance, ou calcul en centimes.

**F109 · En-têtes et docstrings de paie qui nient ce que le module fait** [paie-13]
- **Emplacements :** src/modules/personnel/personnel.service.ts:95, :479-485, :885-889 · client/src/pages/PersonnelPage.tsx:18-20 · livre-de-paie.ts:118-119, :138 · assiettes-paie.ts:51-52 · cotisations-paie.ts:5-8
- **Condition :** 5
- **Constat :** « aucun bulletin », « aucune cotisation patronale », « arrêté pas lu » (alors que `lu: true`), « 1 à 30 » (au lieu de 33), et taux renvoyés à un fichier qui dit n'en porter aucun.
- **Correction :** réécrire selon l'état actuel.

**F110 · Date d'effet INPP : CLAUDE.md et un document affirment le 1er janvier 2026, le code la signature** [paie-14, transv-17, doc-02]
- **Emplacements :** CLAUDE.md:1316-1330, :1428-1442 · docs/paie-recherche-textes-2026-09-19.md:112-123, :144, :192 · src/modules/personnel/cotisations-paie.ts:104-148 · correspondance-retenues.ts:457-460
- **Condition :** 5
- **Constat :** le paragraphe « ILS NE SONT PLUS QUATRE » garde une correction déclarée fausse ailleurs dans le même fichier et annonce l'annexe du décret n° 25/22 à verser. Le docblock de `baremeDuMois` contredit sa comparaison au mois.
- **Correction :** barrer le paragraphe, poser un bandeau sur le document de recherche, aligner le docblock.

**F111 · Arrondi de l'art. 150 : appliqué à l'IRPP par la fiscalité, refusé par la paie** [transv-05]
- **Emplacements :** src/modules/personnel/bareme-irpp.ts:100 · src/modules/fiscalite/fiscalite.service.ts:73, :105 · CLAUDE.md:1237
- **Condition :** 1
- **Constat :** deux modules lisent la même loi et donnent deux réponses sur la retenue.
- **Correction :** trancher par écrit, appliquer ou corriger CLAUDE.md, et n'avoir qu'un seul porteur de l'arrondi.

**F112 · Plancher d'assiette CNSS au SMIG affirmé par le registre, absent du moteur** [transv-06]
- **Emplacements :** src/modules/personnel/cotisations-paie.ts:312-320 · src/modules/retenues/correspondance-retenues.ts:447 · CLAUDE.md:1213
- **Condition :** 1
- **Constat :** décret n° 18/041 art. 8 et loi n° 16/009 art. 13 lus. Le moteur ne pose ni plancher ni réserve.
- **Correction :** appliquer le plancher ou s'abstenir avec motif.

**F113 · « Jour de Kinshasa » écrit trois fois, ignoré par la remise du bulletin** [transv-11]
- **Emplacements :** src/modules/personnel/conversion-usd.ts:41 · plateforme/licences-sur-site.service.ts:16 · abonnements/abonnements.service.ts:45 · personnel/bulletin-paie.ts:175-181
- **Condition :** 5
- **Constat :** entre 0 h et 1 h, une remise faite le jour même est refusée comme future.
- **Correction :** un module commun, utilisé aussi par `motifRefusRemise`.

### Fiscalité, facturation et commerce

**F114 · La pièce imprimée affiche un « Montant TTC » sans les autres impôts et taxes** [fact-03]
- **Emplacements :** src/modules/facturation/mentions-facture.ts:532-550 · client/src/pages/FacturationPage.tsx:654-657
- **Condition :** 1
- **Constat :** le total imprimé est inférieur à ce que la pièce facture elle-même.
- **Correction :** inclure ces taxes, ou renommer le total, et tester l'impression.

**F115 · Le registre des retenues range la retraite complémentaire (432) sous la CNSS** [ret-02]
- **Emplacements :** src/modules/retenues/correspondance-retenues.ts:437-440, :479
- **Condition :** 1
- **Constat :** 43200000 (complémentaire) et 4322/4328 sont comptés et datés comme de la CNSS.
- **Correction :** borner la CNSS à 431 et 4321, verser le reste aux autres organismes, et ajouter un test sur les semis.

**F116 · Facture passée au journal : compte de TVA non routé et ligne au taux zéro omise** [fact-04]
- **Emplacements :** src/modules/facturation/comptabilisation-facture.service.ts:74 · ecriture-facture.ts:80, :189 · client/src/lib/tva-saisie.ts:139, :176
- **Condition :** 5
- **Constat :** la règle de `tva-saisie.ts` est réécrite autrement. L'exportation ne compte plus au prorata.
- **Correction :** module commun de routage et du taux zéro, avec un test de parité.

**F117 · L'état détaillé de l'art. 134 garde les factures annulées par une note** [fact-05]
- **Emplacements :** src/modules/facturation/facturation.service.ts:475-485
- **Condition :** 1
- **Constat :** l'état recense une TVA dont la déduction a été reprise.
- **Correction :** écarter ou montrer à part les factures barrées.

**F118 · Une acceptation arrivée après le délai forme le contrat** [com-01]
- **Emplacements :** src/modules/commercial/commercial.service.ts:227-238 · vente-commerciale.ts:245, :273-282
- **Condition :** 1
- **Constat :** aucun contrôle de la date limite : le logiciel inscrit un contrat sur une offre qu'il déclare lui-même inacceptable (AUDCG art. 243).
- **Correction :** refuser ou qualifier distinctement l'acceptation tardive, et tester.

**F119 · La suppression d'une facture portée par une écriture n'est pas refusée au serveur** [fact-06]
- **Emplacements :** src/modules/facturation/facturation.service.ts:431-455 · client/src/pages/FacturationPage.tsx:198-203
- **Condition :** 3
- **Constat :** contrairement au commentaire, une note de crédit se supprime aussi et débarre la facture qu'elle annulait.
- **Correction :** refuser la suppression si `ecritureId` est posé ou si la pièce est une note de crédit.

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

**F122 · Les comptes d'un taux de TVA ne se complètent pas depuis l'écran** [tva-03]
- **Emplacements :** client/src/pages/TauxTvaPage.tsx:100-102 · ecriture-facture.ts:191 · tva-saisie.ts:155 · taux-tva.service.ts:2394
- **Condition :** 4
- **Constat :** deux messages renvoient à un geste inexistant, et la liquidation saute ces lignes.
- **Correction :** rendre les comptes modifiables, dans la limite de F121.

**F123 · Exonérations : arrêté accordé sans référence ni dates, fin de validité jamais déduite** [exo-01]
- **Emplacements :** client/src/pages/ExonerationsPage.tsx:84-110 · src/modules/exonerations/exonerations.service.ts:135-169
- **Condition :** 4
- **Constat :** l'alerte de renouvellement ne s'arme jamais.
- **Correction :** saisie au passage à ACCORDÉ, et déduction de la fin dans `modifier`.

**F124 · La contre-proposition n'a aucun geste à l'écran** [com-02]
- **Emplacements :** client/src/pages/DevisPage.tsx:99-114 · src/modules/commercial/commercial.service.ts:159-178
- **Condition :** 4
- **Constat :** `contrePropositionDeId` n'est jamais envoyé : la négociation s'arrête et aucune offre d'un client ne s'enregistre.
- **Correction :** bouton « Enregistrer la contre-proposition ».

**F125 · Réserves INPP et ONEM : promesse de rappel non tenue, liquidation niée, date fausse** [ret-03]
- **Emplacements :** src/modules/retenues/correspondance-retenues.ts:461-474 · retenues.service.ts:190-194
- **Condition :** 5
- **Constat :** l'effectif n'est jamais lu, « le logiciel ne liquide rien » contredit la paie, et « la veille » devrait être « le lendemain ».
- **Correction :** réécrire les réserves.

### Immobilisations, stocks, inventaire et provisions

**F126 · L'écriture d'acquisition est postée avant les refus (unités d'œuvre, SMT, lieu)** [immo-07]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:889, :921-933
- **Condition :** 3
- **Constat :** l'écriture reste orpheline au brouillard, et une nouvelle tentative double le 2x.
- **Correction :** déplacer les contrôles avant l'écriture.

**F127 · La sortie d'un bien principal laisse ses composants en service** [immo-08]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:2176-2415
- **Condition :** 3
- **Constat :** c'est le défaut que le schéma dit vouloir empêcher.
- **Correction :** refuser tant qu'un composant est en service, ou le sortir avec le principal.

**F128 · Mode aux unités d'œuvre et durée propre inaccessibles depuis l'écran, mode de la famille ignoré** [immo-10]
- **Emplacements :** client/src/pages/ImmobilisationsPage.tsx:210, :922 · immobilisation.service.ts:920 · dto/immobilisation.dto.ts:37
- **Condition :** 4
- **Constat :** le formulaire n'envoie ni le mode, ni les unités, ni la durée, et `famille.modeAmortissement` n'est pas lu.
- **Correction :** champs au formulaire et héritage du mode de la famille.

**F129 · La mise en sommeil d'une famille n'a aucun effet** [immo-11]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:557, :813 · client/src/pages/ImmobilisationsPage.tsx:725
- **Condition :** 5
- **Constat :** la création accepte une famille inactive, qui reste listée.
- **Correction :** refuser au serveur et filtrer le sélecteur.

**F130 · L'écriture du produit de cession n'est rattachée à rien** [immo-12]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:2394-2403 · src/modules/comptabilite/detenteurs-ecriture.ts:23
- **Condition :** 3
- **Constat :** elle se supprime depuis le journal pendant que la fiche garde le prix de cession.
- **Correction :** colonne `ecritureProduitCessionId` en RESTRICT, inscrite dans `COLONNES_QUI_RETIENNENT`.

**F131 · Les deux tableaux calculent la valeur nette sans les dépréciations** [immo-13]
- **Emplacements :** src/modules/immobilisations/immobilisation.service.ts:1344, :1523
- **Condition :** 1
- **Constat :** le fichier dit lui-même qu'une valeur nette sans 29 contredit la balance.
- **Correction :** charger et retrancher les dépréciations, ou ajouter la colonne.

**F132 · Dérogatoire non protégé contre le double envoi** [immo-14]
- **Emplacements :** src/modules/immobilisations/degressif.service.ts:138, :192, :230
- **Condition :** 3
- **Constat :** en cas de P2002, l'écriture 851/151 reste orpheline.
- **Correction :** compensation comme dans `passerDotation`, et réponse 409.

**F133 · Mouvement de magasin : sortie supérieure au stock acceptée, sans correction possible** [stk-03]
- **Emplacements :** src/modules/stocks/magasin.service.ts:248, :302 · magasin.controller.ts:56
- **Condition :** 4
- **Constat :** la fiche ne se valorise plus et aucune route ne corrige un mouvement.
- **Correction :** refuser au serveur, et ouvrir une annulation motivée.

**F134 · Le statut RECENSEMENT n'est jamais atteint** [inv-01]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:817, :874 · client/src/pages/InventairePage.tsx:322
- **Condition :** 5
- **Constat :** les PV ne s'établissent qu'après le rapprochement, qu'ils devraient précéder.
- **Correction :** ajouter la transition, ou admettre PREPARATION.

**F135 · Le refus de rapprocher renvoie à une suppression de fiche qui n'existe pas** [inv-02]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:456 · inventaire.controller.ts:86
- **Condition :** 4
- **Constat :** la valoriser à zéro fabrique un manquant.
- **Correction :** ouvrir la suppression en préparation, ou corriger le message.

**F136 · La sous-commission d'une fiche n'est pas vérifiée** [inv-03]
- **Emplacements :** src/modules/inventaire/inventaire.service.ts:377, :407
- **Condition :** 2
- **Constat :** une sous-commission d'une autre campagne ou d'un autre dossier est acceptée.
- **Correction :** lecture bornée par dossier et par campagne.

**F137 · Une consignation est enregistrée même quand sa proposition d'écriture échoue** [emb-01]
- **Emplacements :** src/modules/emballages/emballages.service.ts:98, :111 · emballages.controller.ts:33
- **Condition :** 3
- **Constat :** des doublons EN_COURS s'accumulent dans les totaux, et aucune route ne les supprime.
- **Correction :** vérifier le compte du tiers avant la création, et ouvrir la suppression.

**F138 · Le compte d'une provision n'est contrôlé ni contre le dossier ni contre sa nature** [prv-01]
- **Emplacements :** src/modules/provisions/provisions.service.ts:332-376 · client/src/pages/ProvisionsPage.tsx:257
- **Condition :** 2
- **Constat :** seul l'écran filtre. Le rapprochement publié peut viser un compte étranger à la nature de la provision.
- **Correction :** lecture bornée au dossier et racine exigée par `naturesDuReferentiel`.

### Analytique, plan comptable et EBNL

**F139 · Rattachement d'une exécution : seules 200 écritures sont proposées, sans le dire** [analytique-04]
- **Emplacements :** src/modules/analytique/engagement.service.ts:320-327 · client/src/pages/EngagementsPage.tsx:74-78
- **Condition :** 3
- **Constat :** au-delà de 200 écritures, la facture est introuvable et le reste reste en Engagement.
- **Correction :** recherche côté serveur, ou `tronque` et `total`.

**F140 · Une écriture au brouillard se rattache à un engagement** [analytique-05]
- **Emplacements :** src/modules/analytique/engagement.service.ts:201-213, :314-319
- **Condition :** 1
- **Constat :** contraire au commentaire. Une même écriture peut aussi servir à plusieurs engagements.
- **Correction :** refuser le non-validé et borner le cumul rattaché.

**F141 · Ventilation et OD analytique : même objet, deux règles** [analytique-06]
- **Emplacements :** src/modules/analytique/analytique.service.ts:399-447 · od-analytique.ts:46-62
- **Condition :** 5
- **Constat :** la ventilation accepte une classe non ventilée et des montants négatifs.
- **Correction :** fonction commune de refus.

**F142 · Suppression d'une section engagée : erreur technique, budget perdu** [analytique-07]
- **Emplacements :** src/modules/analytique/analytique.service.ts:149-161, :234-249 · prisma/schema.prisma:2467
- **Condition :** 5
- **Constat :** les engagements ne sont pas comptés, et `budgetSection.deleteMany` passe avant l'échec.
- **Correction :** `referencesVers` et un refus nommé.

**F143 · Budgets et engagements modifiables sur un exercice clos** [analytique-08]
- **Emplacements :** src/modules/analytique/engagement.service.ts:120-125, :189-239 · analytique.service.ts:285 · od-analytique.service.ts:140-142
- **Condition :** 5
- **Constat :** l'OD, elle, le refuse. La note budgétaire d'un exercice déposé change.
- **Correction :** même refus sur CLOTURE.

**F144 · Le plan comptable refuse les numéros de plus de 8 chiffres** [comptes-02]
- **Emplacements :** client/src/pages/PlanComptesPage.tsx:627-628
- **Condition :** 4
- **Constat :** l'écran impose `\d{3,8}` alors que la longueur est paramétrable jusqu'à 13.
- **Correction :** borner par `longueurCompte`.

**F145 · Décomptes périmés : plan SYSCOHADA à « 1401 » et « trente et une relations »** [comptes-03, doc-13]
- **Emplacements :** src/modules/comptes/compte-seed-syscohada.ts:64-65 · CLAUDE.md:187, :4337 · src/modules/auth/auth.service.ts:91 · inscription-transaction.spec.ts:112
- **Condition :** 5
- **Constat :** le spec fige 1443 comptes, et le schéma porte 34 relations.
- **Correction :** écrire la règle, pas un nombre.

**F146 · « OmegaX ne détient aucun effectif » : garantie négative périmée affichée à l'utilisateur** [accord-01, doc-03]
- **Emplacements :** src/modules/accord-cadre/accord-cadre.service.ts:118-137 · client/src/pages/AccordCadrePage.tsx:202 · dto/accord-cadre.dto.ts:48 · CLAUDE.md:3890-3892 · personnel.service.ts:946-1003
- **Condition :** 5
- **Constat :** le registre du personnel calcule la part nationale expressément pour cet engagement.
- **Correction :** proposer la part (sans la substituer) et corriger les quatre phrases.

**F147 · Montant accordé d'une convention inférieur au total des tranches** [bailleurs-01]
- **Emplacements :** src/modules/bailleurs/convention-financement.service.ts:258-293, :327-336
- **Condition :** 1
- **Constat :** `modifier` ne relit pas les tranches, et le reste à recevoir est borné à zéro.
- **Correction :** refuser comme `ajouterTranche`.

**F148 · Simulateur : prévu annuel face à un réalisé arrêté en cours d'année** [simulations-01]
- **Emplacements :** src/modules/simulations/simulations.service.ts:114-128 · client/src/pages/SimulationsBudgetairesPage.tsx:213
- **Condition :** 1
- **Constat :** sur un exercice clos, le prorata vaut 1 quelle que soit la date d'arrêté.
- **Correction :** calculer le prorata sur la date d'arrêté.

**F149 · Modèle de règlement : échéance négative possible, paramètre sans effet** [tiers-02]
- **Emplacements :** src/modules/tiers/tiers.service.ts:482-520, :544-593
- **Condition :** 1
- **Constat :** un Équilibre qui n'est pas en dernier rend une échéance négative. Le modèle n'est lu par aucune saisie, et le commentaire est périmé.
- **Correction :** placer l'Équilibre en dernier, et le dire à l'écran.

### Groupe, consolidation et monnaie fonctionnelle

**F150 · Une participation ne se modifie pas, et sa suppression efface sans prévenir** [conso-01]
- **Emplacements :** src/modules/consolidation/perimetre.service.ts:305 · consolidation.controller.ts:67 · prisma/schema.prisma:6857 · client/src/pages/PerimetreConsolidationPage.tsx:342, :437
- **Condition :** 3
- **Constat :** le refus invite à « modifier » sans route pour le faire, et « Retirer » emporte l'acquisition et les écarts d'évaluation sans confirmation.
- **Correction :** route de modification rejouée par l'analyse, et confirmation des suppressions.

**F151 · Réserves du cumul contradictoires sur les éliminations fiscales** [conso-02]
- **Emplacements :** src/modules/consolidation/cumul.service.ts:613, :616 · client/src/pages/CumulConsolidation.tsx:706
- **Condition :** 5
- **Constat :** deux réserves affichées ensemble se contredisent.
- **Correction :** réécrire la première.

**F152 · TFT consolidé : mouvements bruts sans élimination des réciproques** [conso-04]
- **Emplacements :** src/modules/consolidation/flux-capitaux-consolides.ts:17 · cumul-consolidation.ts:1180, :1231
- **Condition :** 1
- **Constat :** un prêt intragroupe reste lu en investissement et en financement, alors que ZG est juste.
- **Correction :** refuser le tableau sur les comptes concernés, ou déclarer la part des mouvements à éliminer.

**F153 · Un siège « projets de développement » reçoit une liasse de groupe au modèle des associations** [groupe-02]
- **Emplacements :** src/modules/groupe/groupe.service.ts:179, :188-193
- **Condition :** 4
- **Constat :** le jeu du siège n'est pas lu, contrairement à CLAUDE.md § 6.
- **Correction :** reprendre le jeu du siège et ne remplacer que le SMT.

**F154 · Provisions et balance fonctionnelle choisissent d'office l'exercice le plus récent** [mf-04, pages-10]
- **Emplacements :** client/src/pages/BalanceFonctionnellePage.tsx:24-35 · client/src/pages/ProvisionsPage.tsx:209-212
- **Condition :** 5
- **Constat :** `useExercice` n'est pas lu, contrairement à la règle de `resoudreExercice`.
- **Correction :** initialiser sur l'exercice du contexte.

**F155 · Monnaie fonctionnelle : le cours « de SA date » est en fait le dernier cours connu** [doc-10]
- **Emplacements :** src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts:47-70, :105-111 · CLAUDE.md:605-610
- **Condition :** 5
- **Constat :** CLAUDE.md et le commentaire exigent l'arrêt de l'état sur une date sans cours. La mention imprimée dit « au cours de SA date ».
- **Correction :** une seule règle aux trois endroits.

### Sécurité, rôles et sessions

**F156 · La restriction de saisie par journal se contourne par la réimputation au brouillard** [socle-03]
- **Emplacements :** src/common/perimetre/extension-perimetre-journaux.ts:62 · src/modules/comptabilite/ecriture.service.ts:1544
- **Condition :** 2
- **Constat :** l'extension ne regarde que `Ecriture`, alors que la réimputation écrit sur `LigneEcriture`.
- **Correction :** vérifier le périmètre dans `reimputer`, ou étendre l'extension.

**F157 · Un administrateur peut se rétrograder et laisser le dossier sans administrateur** [socle-04]
- **Emplacements :** src/modules/utilisateurs/utilisateur.service.ts:117 · plateforme.service.ts:422
- **Condition :** 4
- **Constat :** la console ne peut pas rattraper ce cas, qui ne se règle alors que par SQL.
- **Correction :** refuser tout changement qui laisse le dossier sans administrateur actif.

**F158 · Créer un utilisateur dont l'adresse existe ailleurs rend 500** [socle-05]
- **Emplacements :** src/modules/utilisateurs/utilisateur.service.ts:38-43
- **Condition :** 4
- **Constat :** la garde rend null, puis P2002 remonte faute de filtre.
- **Correction :** rattraper P2002 comme `changerAdresse`.

**F159 · Hors de deux transactions, le journal d'audit atteste des actes annulés** [socle-06]
- **Emplacements :** src/common/audit/extension-audit.ts:277-288 · contexte-audit.ts:31 · src/modules/import/import.service.ts:564
- **Condition :** 3
- **Constat :** le maillon est écrit sur une connexion à part et survit à l'annulation. Chaque écriture prend en outre une seconde connexion.
- **Correction :** utilitaire unique autour de `journaliserDansTransaction`, test de source, et mise à jour du commentaire.

**F160 · L'adresse IP hachée dans le journal d'audit est choisie par le client** [socle-07]
- **Emplacements :** src/common/audit/audit-contexte.interceptor.ts:30-33
- **Condition :** 3
- **Constat :** la première entrée de X-Forwarded-For se forge.
- **Correction :** utiliser `requete.ip` avec le bon nombre de sauts de confiance.

**F161 · Le type « Éditeur » s'attribue encore à la création d'un cabinet et se transmet aux cellules** [socle-08]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:129-135, :342, :354 · dto/plateforme.dto.ts:38 · src/modules/groupe/groupe.service.ts:294 · src/modules/auth/dto/register.dto.ts:52
- **Condition :** 2
- **Constat :** contraire au geste nommé unique que prévoit CLAUDE.md.
- **Correction :** refuser PROPRIETAIRE à ces portes, et faire naître la cellule sous une licence ordinaire.

**F162 · La console renvoie la double authentification à la fenêtre Utilisateurs** [socle-10, plateforme-07, doc-16]
- **Emplacements :** src/modules/plateforme/operateur-plateforme.guard.ts:31-33 · client/src/pages/UtilisateursPage.tsx:236 · client/src/components/ModaleMonCompte.tsx:78
- **Condition :** 5
- **Constat :** l'activation se fait dans Fichier > Mon compte…
- **Correction :** corriger le message.

**F163 · Commentaires du socle qui contredisent le code ou CLAUDE.md** [socle-11]
- **Emplacements :** src/common/guards/mot-de-passe-a-changer.guard.ts:20 · src/modules/auth/auth.service.ts:110 · src/modules/tenant/dto/parametres-dossier.dto.ts:220 · prisma/schema.prisma:454 · src/modules/licence/licence.guard.ts:5
- **Condition :** 5
- **Constat :** « GLOBAL, à dessein » (contre § 8), documents obligatoires « propres au SYCEBNL », phrase ASBL fausse, méthode inexistante, « Phase 1 ».
- **Correction :** réécrire les cinq commentaires.

**F164 · Session expirée en cours de travail : aucune reprise, « Unauthorized » partout** [chrome-02]
- **Emplacements :** client/src/lib/api.ts:40-60 · client/src/App.tsx:11-21
- **Condition :** 4
- **Constat :** aucun traitement global du 401, et un message anglais.
- **Correction :** vider la session, renvoyer à la connexion, et message français côté serveur.

**F165 · Le message de session perdue accuse les cookies tiers** [chrome-03]
- **Emplacements :** client/src/lib/auth.tsx:92-97, :125 · client/src/lib/api.ts:43-45 · client/src/lib/session-refusee.spec.ts:27-33
- **Condition :** 5
- **Constat :** depuis le relais `/api`, le cookie est de première partie. Le diagnostic est faux et le spec le fige.
- **Correction :** message exact, commentaires et spec corrigés.

### Plateforme, sur site, relances

**F166 · La relance préventive annonce la date du jour comme échéance** [relances-01]
- **Emplacements :** src/modules/relances/relances.service.ts:93, :120, :497, :528
- **Condition :** 1
- **Constat :** `{date}` vaut la date du courrier.
- **Correction :** un jeton dédié à l'échéance dans les modèles préventifs.

**F167 · Relance émise avec un niveau d'un autre état : comptes écartés sans un mot** [relances-02]
- **Emplacements :** src/modules/relances/relances.service.ts:449, :540 · client/src/pages/RelancesPage.tsx:105, :188
- **Condition :** 3
- **Constat :** les niveaux ne sont pas filtrés par type, et `continue` est muet.
- **Correction :** filtrer les niveaux, et rendre les exclus dans le bilan.

**F168 · Préventive : retard toujours nul, niveau « -7 jours » proposé pour toute échéance future** [relances-03]
- **Emplacements :** src/modules/relances/relances.service.ts:423
- **Condition :** 1
- **Constat :** l'accumulateur part de 0.
- **Correction :** l'initialiser à -Infinity.

**F169 · Dernier niveau ancien qui bloque toute suggestion, historique chargé en entier** [relances-04]
- **Emplacements :** src/modules/relances/relances.service.ts:372, :438, :455
- **Condition :** 3
- **Constat :** « tout sélectionner » omet un client relancé il y a un an.
- **Correction :** ne retenir que les relances postérieures à l'échéance ouverte la plus ancienne, et borner la lecture.

**F170 · Le dossier de combinaison consomme le plafond de dossiers sur site** [surSite-02]
- **Emplacements :** src/modules/auth/auth.service.ts:83 · src/modules/groupe/groupe.service.ts:159
- **Condition :** 4
- **Constat :** `tenant.count()` n'a pas de filtre.
- **Correction :** `where: { combinaisonPour: null }`.

**F171 · « L'installation sur site relève de la phase 4 » : refus et paragraphes périmés** [plateforme-05, pages-06]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:112, :132 · client/src/pages/PlateformePage.tsx:544-546, :709 · src/modules/licence/licence.service.ts:17
- **Condition :** 5
- **Constat :** le sur site est livré par fichier signé, et le texte oriente vers une licence SaaS.
- **Correction :** nouveau motif, et explication déplacée dans `Aide`.

**F172 · Rattachement par la console sans le système comptable du siège** [plateforme-06]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:296-323 · src/modules/tenant/tenant.service.ts:202-224
- **Condition :** 5
- **Constat :** contraire à CLAUDE.md § 6 (« imposé aux deux portes »).
- **Correction :** comparer le système, et refuser sa modification sur une cellule ou une mère.

**F173 · Abonnements hors du dossier de l'éditeur : « aucun dossier d'éditeur désigné »** [plateforme-08]
- **Emplacements :** src/modules/plateforme/abonnements/abonnements.service.ts:101, :226
- **Condition :** 5
- **Constat :** la lecture est cloisonnée, et le vrai refus n'est jamais atteint.
- **Correction :** lecture dans une sortie déclarée.

**F174 · Garnissage de vitrine en échec : vitrine partielle impossible à refaire** [plateforme-09]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:547-601
- **Condition :** 3
- **Constat :** le dossier est marqué avant le garnissage.
- **Correction :** garnir avant de marquer, ou « regarnir » idempotent.

**F175 · Fenêtre Utilisateurs : deux actions avalent le refus du serveur** [utilisateurs-01]
- **Emplacements :** client/src/pages/UtilisateursPage.tsx:75, :118
- **Condition :** 3
- **Constat :** ni déverrouiller ni changer de rôle n'affichent l'erreur.
- **Correction :** try/catch comme `basculerActif`.

**F176 · Politique de confidentialité inexacte : destinataires tus, cloisonnement « au niveau de la base »** [confidentialite-01, pages-07]
- **Emplacements :** client/src/pages/ConfidentialitePage.tsx:81, :116, :123-125
- **Condition :** 5
- **Constat :** la messagerie SMTP et l'archive GitHub ne sont pas nommées, rien n'est prévu pour le sur site, et aucune RLS n'existe.
- **Correction :** nommer les prestataires, ajouter une variante sur site, et écrire « au niveau de chaque requête du serveur ».

### Interface

**F177 · Échap ferme la fenêtre active en même temps que le menu ou la bulle : la pièce en cours est perdue** [chrome-01]
- **Emplacements :** client/src/components/chrome/Fenetre.tsx:110-118 · MenuBar.tsx:168 · Aide.tsx:79 · ModaleCorrection.tsx:90 · OutilsChrome.tsx:78
- **Condition :** 3
- **Constat :** quatre écouteurs réagissent sans `preventDefault`, et la saisie n'a pas de brouillon.
- **Correction :** respecter `defaultPrevented`, et demander confirmation si la pièce n'est pas enregistrée.

**F178 · Profil SMT : Devises masquée alors que la paie en dollars exige le cours du jour** [chrome-05]
- **Emplacements :** client/src/lib/profil-dossier.ts:28-30 · src/modules/personnel/conversion-usd.ts:61
- **Condition :** 4
- **Constat :** le message renvoie à une fenêtre invisible pour ce profil.
- **Correction :** retirer `/devises` de la liste, en masquant seulement la réévaluation.

**F179 · Sauvegardes sur site : un échec de lecture s'affiche « Aucune copie »** [chrome-08]
- **Emplacements :** client/src/components/SauvegardesSurSite.tsx:44-52, :88-93, :124-125
- **Condition :** 3
- **Constat :** l'erreur est avalée et affichée comme un constat.
- **Correction :** afficher l'erreur, et distinguer « lu » de « vide ».

**F180 · « À propos » annonce une « Version de développement »** [chrome-09]
- **Emplacements :** client/src/components/chrome/AProposModale.tsx:46 · package.json:3 · client/package.json:3
- **Condition :** 5
- **Constat :** aucun identifiant n'est affiché, alors que `finMaintenance` borne les versions sur site.
- **Correction :** injecter version et commit, avec la date du paquet sur site.

**F181 · Tableau de bord : un échec laisse « Chargement… » indéfiniment** [pages-03]
- **Emplacements :** client/src/pages/DashboardPage.tsx:38-43, :208
- **Condition :** 4
- **Constat :** aucun rejet géré.
- **Correction :** un état d'erreur affiché.

**F182 · Journal d'audit : le filtre ne propose que 26 des 92 modèles** [pages-04]
- **Emplacements :** client/src/pages/JournalAuditPage.tsx:42, :151, :240 · src/common/audit/champs-audites.ts:22
- **Condition :** 5
- **Constat :** RIB, ordres de virement et bulletins ne sont pas filtrables.
- **Correction :** liste servie par le serveur, gelée par un test.

**F183 · Inventaire : un échec de lecture des caisses s'affiche « Aucune caisse sans PV »** [pages-08]
- **Emplacements :** client/src/pages/InventairePage.tsx:116, :1026
- **Condition :** 3
- **Constat :** l'erreur se lit comme une réponse favorable.
- **Correction :** un état null distinct, avec l'erreur affichée.

**F184 · Mandat : un échec s'affiche « Aucun mandat enregistré »** [pages-09]
- **Emplacements :** client/src/pages/MandatAuditeurPage.tsx:75-90, :280
- **Condition :** 3
- **Constat :** un échec de lecture passe pour une absence de mandat.
- **Correction :** initialiser à null et afficher l'erreur.

### Performance

**F185 · Lectures sans borne des écritures et des lignes sur les routes de travail** [saisie-17, rev-19, infra-02]
- **Emplacements :**
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

**F186 · Contrôle des cumuls analytiques : liste rendue sans borne** [analytique-10, infra-03]
- **Emplacements :** src/modules/analytique/etats-analytiques.service.ts:162-187, :259-314 · analytique.controller.ts:215
- **Condition :** 6
- **Constat :** une requête par plan dans une boucle, et toutes les lignes sans répartition renvoyées.
- **Correction :** `groupBy`, plafond avec `tronque` et `total`.

**F187 · Exécution budgétaire : tout l'exercice chargé à chaque ouverture des notes** [etats-05]
- **Emplacements :** src/modules/etats-financiers/etats-financiers-projet-budget.service.ts:134-150, :309-315 · note-annexe.service.ts:1050
- **Condition :** 6
- **Constat :** même famille que ce qui avait fait tomber le banc, non corrigée ici.
- **Correction :** `lireParLots` ou agrégat SQL.

**F188 · Facturation, devis, exonérations sans borne, déclaration de TVA qui relit tout** [perf-01]
- **Emplacements :** src/modules/facturation/facturation.service.ts:144 · commercial.service.ts:117 · exonerations.service.ts:91 · taux-tva.service.ts:1692
- **Condition :** 6
- **Constat :** le volume croît sans limite avec l'ancienneté du dossier.
- **Correction :** filtre par période avec `tronque`.

**F189 · Balance fonctionnelle : toutes les lignes en mémoire** [mf-03]
- **Emplacements :** src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts:162
- **Condition :** 6
- **Constat :** collection sans borne, contraire au § 8 bis.
- **Correction :** agréger par compte, date et devise.

**F190 · Supervision et balance agrégée du groupe : une balance par cellule, en série** [groupe-03]
- **Emplacements :** src/modules/groupe/groupe.service.ts:561, :1177, :1706
- **Condition :** 6
- **Constat :** environ 1 500 requêtes en série, et 600 comptages simultanés.
- **Correction :** un `groupBy` sur les couples dossier-exercice.

### Exploitation, sur site et CI

**F191 · La copie « avant mise à jour » est écrasée au redémarrage qui suit une migration échouée** [infra-01]
- **Emplacements :** installation/demarrer.cjs:78, :81, :104 · installation/windows/omegax-service.xml:17
- **Condition :** 3
- **Constat :** WinSW relance le service et `pg_dump` réécrit le même fichier à partir de la base à moitié migrée.
- **Correction :** ne jamais écraser une copie existante.

**F192 · Les sauvegardes sur site sont lisibles par tout utilisateur Windows du poste** [infra-05]
- **Emplacements :** installation/windows/initialiser.ps1:16, :28 · sauvegarde-sur-site.service.ts:99 · installation/demarrer.cjs:76
- **Condition :** 2
- **Constat :** seuls `pgdata` et la configuration sont restreints.
- **Correction :** restreindre `$Donnees` ou le dossier `sauvegardes`.

**F193 · Sur site, une version hors maintenance migre la base avant d'être refusée** [infra-06]
- **Emplacements :** installation/demarrer.cjs:95, :98, :112 · src/modules/sur-site/licence-signee.ts:187
- **Condition :** 3
- **Constat :** contraire à docs/installation-sur-site.md § 6.
- **Correction :** vérifier la licence dans le lanceur avant la copie et les migrations.

**F194 · La CI éprouve Node 20 et PostgreSQL 16, alors que la production tourne sous 22 et 18** [infra-08]
- **Emplacements :** .github/workflows/deploy-cloud-run.yml:46, :63 · .github/workflows/tests-navigateur.yml:31, :69 · Dockerfile:5
- **Condition :** 6
- **Constat :** le job censé prouver le démarrage réel tourne sur d'autres versions majeures.
- **Correction :** aligner sur Node 22 et PG 18 (plus 17 pour le sur site).

**F195 · Dependabot se dit jugé par le job `verifier`, qui ne tourne pas sur les PR** [infra-09]
- **Emplacements :** .github/dependabot.yml:4 · .github/workflows/deploy-cloud-run.yml:6-16
- **Condition :** 5
- **Constat :** aucune montée de dépendance n'est testée avant la fusion.
- **Correction :** déclencheur `pull_request` pour `verifier`, ou commentaire corrigé.

**F196 · Vitest n'est ni déclaré ni verrouillé** [infra-10]
- **Emplacements :** client/package.json:10 · client/vitest.config.ts:3 · deploy-cloud-run.yml:135 · firebase-hosting-merge.yml:27
- **Condition :** 6
- **Constat :** chaque CI prend la dernière version publiée.
- **Correction :** devDependency à version fixée.

**F197 · Marche locale des tests navigateur (CLAUDE.md § 10) contraire au montage réel** [infra-13]
- **Emplacements :** CLAUDE.md:3150 · e2e/tests/outils.ts:3 · .github/workflows/tests-navigateur.yml:53
- **Condition :** 5
- **Constat :** sans `VITE_API_URL=/api` et `OMEGAX_API_RELAIS`, chaque appel échoue.
- **Correction :** réécrire la procédure.

### Documentation

**F198 · docs/deploiement.md décrit une architecture abandonnée** [doc-05]
- **Emplacements :** docs/deploiement.md:62, :83-139, :150-157 · client/firebase.json:10-14 · src/bootstrap.ts:78-80
- **Condition :** 6
- **Constat :** Cloud SQL europe-west1, `gcloud run deploy` à la main, CORS ouvert par défaut, 58 migrations.
- **Correction :** retirer ou marquer les sections 1 à 6, et renvoyer au workflow.

**F199 · docs/actions-du-proprietaire.md : actions réglées listées, clé publique de licence omise** [doc-07]
- **Emplacements :** docs/actions-du-proprietaire.md:48-70, :98-122, :137-141 · src/modules/sur-site/cle-publique-editeur.ts:6-16 · .github/workflows/paquet-sur-site.yml:36-38 · docs/plan-ordonne-2026-09.md:46
- **Condition :** 5
- **Constat :** le heartbeat, la devise, la période close et l'OCR sont réglés. La clé `null`, qui bloque le paquet, n'est pas listée.
- **Correction :** refaire la liste contre le code et corriger le renvoi de section.

**F200 · Les deux audits du 2026-09-27 annoncent ouverts des constats corrigés** [doc-08]
- **Emplacements :** docs/audit-serveur-2026-09.md:20, :25-113, :593-663 · docs/audit-interface-2026-09.md:26, :141-255, :494-512
- **Condition :** 5
- **Constat :** B1 à B3, C5, C8, C10, C11, B4, F3, I1, C3 et C4 sont faits sans être marqués.
- **Correction :** marquer « Fait le… » avec fichier:ligne, et recompter.

**F201 · docs/conversion-monnaie-fonctionnelle.md condamne la méthode retenue** [doc-09]
- **Emplacements :** docs/conversion-monnaie-fonctionnelle.md:97-150 · balance-fonctionnelle.service.ts:21-31 · CLAUDE.md:566-600
- **Condition :** 5
- **Constat :** document dépassé, sans bandeau.
- **Correction :** bandeau de renvoi à M2.

**F202 · Tirets cadratins hors des exceptions déclarées** [doc-11]
- **Emplacements :** src/modules/import/lecture-fichier.ts:45-46 · src/common/cloisonnement/extension-cloisonnement.ts:82 · docs/etats-financiers-liasses-referentiels.md (13 occurrences) · scripts/extraire-schemas-guides.cjs:91, :134 · src/modules/controles/regles-comptes-syscohada.ts:269, :339, :598 · CLAUDE.md:92-106
- **Condition :** 5
- **Constat :** interdits par le § 4.
- **Correction :** remplacer, et déclarer comme exceptions le fichier SYSCOHADA verbatim et le script.

**F203 · Noms de modèles d'IA dans trois documents poussés** [doc-12]
- **Emplacements :** docs/plan-ordonne-2026-09.md:91, :116, :328, :367, :393, :411, :432, :484 · docs/plan-confrontations.md:104-105 · docs/plan-sycebnl-complet.md:57-68
- **Condition :** 5
- **Constat :** interdits par le § 4.
- **Correction :** ne garder que le niveau d'effort.

**F204 · README.md décrit un prototype de phase 1** [doc-18]
- **Emplacements :** README.md:1-105
- **Condition :** 5
- **Constat :** « sycebnl-suite », heartbeat, inscription non atomique, émojis.
- **Correction :** réduire à nom, propriétaire, pile, commandes et renvois.

---

### Session

**F270 · « Rester connecté sur cet appareil »** [décision de Manasse, 2026-09-27]
- **Emplacements :** src/modules/auth/session.constants.ts · src/modules/auth/auth.controller.ts · client/src/pages/LoginPage.tsx
- **Condition :** 2
- **Constat :** toute session dure huit heures, sans choix, et son cookie survit à la fermeture du navigateur, y compris sur un poste partagé.
- **Correction :** case décochée par défaut. Décochée, cookie de session (fermé avec le navigateur) et huit heures au plus. Cochée, trente jours au plus, sept jours sans utilisation, prolongée à chaque usage sans dépasser les trente. Jamais pour la console de l'éditeur. Bouton « Déconnecter mes autres appareils » dans Mon compte.

## APRES_1_0

### Saisie et trésorerie

**F205 · Rapprochement : les lignes de report à-nouveau sont proposées au pointage** [saisie-19]
- **Emplacements :** src/modules/rapprochement/rapprochement.service.ts:133, :365
- **Condition :** 1
- **Constat :** la ligne reste « non pointée » d'une année sur l'autre, et la pointer compte l'ouverture deux fois.
- **Correction :** l'écarter quand un rapprochement antérieur existe, ou la montrer à part.

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

### Exercice et révision

**F208 · Aide de la date de reprise fausse pour le rattachement au SYCEBNL** [rev-21]
- **Emplacements :** client/src/pages/RegularisationPage.tsx:497-507
- **Condition :** 5
- **Constat :** le rattachement se reprend à l'ouverture, pas à la fin.
- **Correction :** faire dépendre le texte du type.

**F209 · Commentaires et décomptes périmés (exercice, contrôles)** [rev-22]
- **Emplacements :** src/modules/exercice/exercice.service.ts:283, :564-571, :662-685 · planning-cloture.ts:205 · src/modules/controles/controles.controller.ts:10, :21 · dossier-revision.service.ts:39 · controles.service.ts:1581, :3052 · docs/organisation-comptable-cpcc.md:123
- **Condition :** 5
- **Constat :** « seize jalons », affectation « à écrire », `premierJourOuvert` null, « trois rôles », « 78 entrées », dépréciation « hors périmètre », « pas de module de paie ».
- **Correction :** décrire l'existant, sans chiffres déduits.

**F210 · État de campagne DEPOUILLEE jamais atteint** [rev-23]
- **Emplacements :** src/modules/circularisation/circularisation.service.ts:360-364 · client/src/lib/types.ts:3609
- **Condition :** 5
- **Constat :** état mort de l'énumération.
- **Correction :** poser ce statut, ou le retirer.

### États financiers

**F211 · Bilan SMT SYCEBNL : un 130 échappe au bilan** [etats-07]
- **Emplacements :** src/modules/etats-financiers/correspondance-smt.ts:164-172 · etats-financiers-smt.service.ts:152-161, :218-221
- **Condition :** 5
- **Constat :** contraire au commentaire et à la règle de `resultat-de-l-exercice.ts`.
- **Correction :** exclure 10 et 131 à 139 seulement, ou lister les non rattachés.

**F212 · Commentaires périmés des états SYCEBNL** [etats-08]
- **Emplacements :** etats-financiers.communs.ts:5-13 · etats-financiers.controller.ts:76-82 · etats-financiers.service.ts:164-170 · etats-financiers-smt.service.ts:904-911, :967
- **Condition :** 5
- **Constat :** SMT « non construit », « bilan seulement », « 564/565 », « CDF ou USD ».
- **Correction :** mettre à jour, et servir `monnaieDuJeuLegal()`.

**F213 · Sources MOUVEMENT_DEBIT et MOUVEMENT_CREDIT mortes et fausses** [notes-08]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:396-400 · note-annexe.types.ts:86-92
- **Condition :** 5
- **Constat :** aucune rubrique ne les pose, et elles lisent le report.
- **Correction :** les retirer, ou les brancher sur les mouvements.

**F214 · Notes associations : neuf rechargements de balance** [notes-09]
- **Emplacements :** src/modules/notes-annexes/note-annexe.service.ts:974-978, :1144-1148
- **Condition :** 6
- **Constat :** agrégats redondants.
- **Correction :** passer les lignes déjà chargées, ou mémoriser.

**F215 · Commentaires SMT SYSCOHADA « CDF ou USD »** [efsy-04]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:1359, :1429 · etats-financiers-syscohada.controller.ts:200
- **Condition :** 5
- **Constat :** contraires à monnaie-de-tenue.
- **Correction :** réécrire, et utiliser `monnaieDuJeuLegal`.

**F216 · Point 14 a) périmé : le remède du TFT est écrit** [efsy-06]
- **Emplacements :** correspondance-compte-resultat-syscohada.ts:211
- **Condition :** 5
- **Constat :** contredit la table du TFT.
- **Correction :** le réécrire comme fait.

**F217 · brutN1 et amortissementN1 : faux zéro, champs morts** [efsy-10]
- **Emplacements :** etats-financiers-syscohada.service.ts:741-743
- **Condition :** 5
- **Constat :** personne ne les lit.
- **Correction :** `undefined`, ou retrait.

**F218 · Commentaire SMT : orphelins « vides par construction »** [efsy-12]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:321
- **Condition :** 5
- **Constat :** le 130 est un orphelin voulu, et le 57 est en SA4.
- **Correction :** mettre à jour.

**F219 · « Un fichier de 45 notes » pour 46 codes** [efsy-13]
- **Emplacements :** correspondance-notes-syscohada.ts:21
- **Condition :** 5
- **Constat :** décompte faux.
- **Correction :** corriger.

**F220 · arreteAu illisible : 500 au lieu de 400** [efsy-14]
- **Emplacements :** etats-financiers-syscohada.service.ts:404
- **Condition :** 4
- **Constat :** NaN passe les contrôles.
- **Correction :** refuser une date invalide.

**F221 · Liste des comptes avalée dans la fenêtre des notes SYSCOHADA** [efsy-15]
- **Emplacements :** client/src/pages/NotesAnnexesSyscohadaPage.tsx:94
- **Condition :** 3
- **Constat :** formulaire vide sans message.
- **Correction :** `setErreur`.

**F222 · Exercice introuvable : états à zéro « équilibrés »** [efsy-18]
- **Emplacements :** etats-financiers-syscohada.service.ts:706 · etats-financiers.communs.ts:62-66
- **Condition :** 3
- **Constat :** réponse fausse au lieu d'un refus.
- **Correction :** 404.

### Exports

**F223 · Commentaires périmés des exports** [exp-09]
- **Emplacements :** src/modules/exports/export.controller.ts:19-25, :99-103 · export.service.ts:213-231, :916-924, :1466-1472, :2777-2787
- **Condition :** 5
- **Constat :** six commentaires décrivent un état révolu.
- **Correction :** mettre à jour, et replacer la doc du livre.

**F224 · Notes projets exportées sans les parties officielles** [exp-10]
- **Emplacements :** src/modules/exports/export.service.ts:2575
- **Condition :** 5
- **Constat :** deux présentations du même document.
- **Correction :** passer `PARTIES_NOTES_PROJETS`.

**F225 · Nom de fichier de restitution calculé et jamais servi** [restit-04]
- **Emplacements :** restitution.service.ts:254-256 · restitution.controller.ts:47, :95-98
- **Condition :** 5
- **Constat :** code mort, et deux dossiers le même jour portent le même nom.
- **Correction :** nommer dans le contrôleur.

### Paie

**F226 · Rémunération du contrat sans devise : faux « en deçà du minimum »** [paie-08]
- **Emplacements :** prisma/schema.prisma:6490 · regles-contrat-travail.ts:689-711 · client/src/pages/PersonnelPage.tsx:1422
- **Condition :** 1
- **Constat :** un montant en dollars est comparé à un minimum en francs.
- **Correction :** unité à l'écran ou devise au contrat, et abstention hors franc.

**F227 · Message de refus de barème qui exclut le SMIG** [paie-12]
- **Emplacements :** src/modules/personnel/baremes-dossier.ts:131-132
- **Condition :** 5
- **Constat :** le SMIG est saisissable.
- **Correction :** corriger le message.

### Fiscalité

**F228 · Commentaire et message de la TVA dépassés** [tva-04]
- **Emplacements :** src/modules/tva/taux-tva.service.ts:846-849, :2197
- **Condition :** 5
- **Constat :** ils citent une condition absente, et la mention de l'art. 60 est lisible sur la facture.
- **Correction :** mettre à jour, et lire `mentionTvaDebits`.

**F229 · mentions-facture.ts resté à neuf groupes** [fact-08]
- **Emplacements :** src/modules/facturation/mentions-facture.ts:291, :603 · client/src/pages/FacturationPage.tsx:492
- **Condition :** 5
- **Constat :** douze groupes, dont dix dus, et une colonne « art. 100 ».
- **Correction :** réécrire, et intituler la colonne « Mentions obligatoires ».

### Analytique et EBNL

**F230 · DTO de ventilation par lot sans route** [analytique-11]
- **Emplacements :** src/modules/analytique/dto/analytique.dto.ts:158-177
- **Condition :** 5
- **Constat :** code mort.
- **Correction :** le retirer.

**F231 · Jalon 11 attribué à tort aux conventions** [bailleurs-02]
- **Emplacements :** convention-financement.service.ts:103-106 · planning-cloture.ts:412-420
- **Condition :** 5
- **Constat :** ce jalon vise l'accord-cadre.
- **Correction :** retirer le renvoi.

### Groupe et IFRS

**F232 · Réciproques et résultats internes : exercice et appartenance non vérifiés** [conso-03]
- **Emplacements :** src/modules/consolidation/cumul.service.ts:210-235
- **Condition :** 5
- **Constat :** le cumul est refusé avec un message peu clair.
- **Correction :** contrôles de `ajouterProvisionChange`.

**F233 · Notes IFRS consolidées sans note de transition** [ifrs-01]
- **Emplacements :** src/modules/ifrs/ifrs.service.ts:501, :751 · notes-ifrs.ts:574
- **Condition :** 5
- **Constat :** les comptes individuels la portent.
- **Correction :** passer `ia1.premiereApplication`.

**F234 · Routes de lecture sans exerciceId obligatoire** [conso-05]
- **Emplacements :** consolidation.controller.ts:45 · ifrs.controller.ts:25 · perimetre.service.ts:70
- **Condition :** 5
- **Constat :** sur appel direct, tout le dossier est mêlé.
- **Correction :** `ParseUUIDPipe`.

**F235 · Renommer une entité vers un nom pris rend 500** [conso-06]
- **Emplacements :** perimetre.service.ts:240-272 · prisma/schema.prisma:6834
- **Condition :** 5
- **Constat :** l'unicité n'est vérifiée qu'à la création.
- **Correction :** même vérification.

**F236 · Commentaire « écarts de conversion pas encore calculés »** [conso-07]
- **Emplacements :** client/src/pages/EtatsConsolidesVue.tsx:14-15
- **Condition :** 5
- **Constat :** la tranche 4c les calcule.
- **Correction :** retirer.

### Sécurité

**F237 · Dates d'option TVA et d'autorisation aux débits impossibles à effacer** [socle-12]
- **Emplacements :** parametres-dossier.dto.ts:243, :274 · tenant.service.ts:700-708
- **Condition :** 3
- **Constat :** la convention de la chaîne vide n'est pas appliquée.
- **Correction :** `ValidateIf` et conversion en null.

**F238 · Verrouillage et durée de réponse révèlent l'existence d'un compte** [socle-14]
- **Emplacements :** src/modules/auth/auth.service.ts:206, :215, :237 · verrouillage.ts:40
- **Condition :** 2
- **Constat :** contraire à l'intention écrite.
- **Correction :** empreinte factice, et message identique.

**F239 · Filtres illisibles du journal d'audit : 500** [socle-15]
- **Emplacements :** journal-audit.controller.ts:38-41 · journal-audit.service.ts:92-93
- **Condition :** 4
- **Constat :** NaN et dates invalides passent.
- **Correction :** DTO de requête.

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

**F242 · En-tête du tableau Utilisateurs : six cellules pour cinq colonnes** [utilisateurs-02]
- **Emplacements :** client/src/pages/UtilisateursPage.tsx:176
- **Condition :** 5
- **Constat :** « STATUT » apparaît deux fois.
- **Correction :** cinq cellules.

**F243 · Commentaire de RelancesPage contraire au serveur** [relances-06]
- **Emplacements :** client/src/pages/RelancesPage.tsx:25-27 · relances.service.ts:68-75
- **Condition :** 5
- **Constat :** les modèles de relance sont désormais propres à chaque référentiel.
- **Correction :** aligner.

**F244 · Deux origines de courrier affichées en code brut** [courrier-01]
- **Emplacements :** client/src/lib/courrier-file.ts:153-164 · courrier.service.ts:31
- **Condition :** 5
- **Constat :** FACTURE_ABONNEMENT et LICENCE_SUR_SITE.
- **Correction :** ajouter les libellés.

**F245 · Commentaires déplacés et chemin périmé (plateforme)** [plateforme-11]
- **Emplacements :** plateforme.controller.ts:126-147 · plateforme.service.ts:448-508 · prisma/schema.prisma:732
- **Condition :** 5
- **Constat :** JSDoc empilés, et `src/modules/abonnements` inexistant.
- **Correction :** replacer et corriger.

### Interface

**F246 · Garde-fou contre la boucle de rechargement effacé à chaque chargement** [chrome-04]
- **Emplacements :** client/src/main.tsx:5-21
- **Condition :** 5
- **Constat :** le commentaire n'est pas tenu.
- **Correction :** marqueur daté.

**F247 · Le gestionnaire de paie ne peut pas saisir le cours du jour** [chrome-06]
- **Emplacements :** client/src/lib/roles-cantonnes.ts:13-19 · devises.controller.ts:12 · conversion-usd.ts:61
- **Condition :** 4
- **Constat :** sa paie en dollars dépend d'un comptable.
- **Correction :** ouvrir la cotation, ou adapter le message.

**F248 · Contexte d'exercice : chargement infini en cas d'échec** [chrome-10]
- **Emplacements :** client/src/lib/exercice.tsx:82-103
- **Condition :** 3
- **Constat :** ni try ni finally.
- **Correction :** try/finally, et erreur affichée.

**F249 · Cache des comptes non vidé après un tiers ou une fusion** [chrome-11, pages-13]
- **Emplacements :** client/src/lib/api.ts:163-178 · client/src/pages/TiersPage.tsx:268, :322
- **Condition :** 3 et 5
- **Constat :** le plan est faux pendant 30 s.
- **Correction :** vider sur `/tiers` et sur les fusions.

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

**F253 · Balance : commentaire périmé sur les comptes Total** [pages-12]
- **Emplacements :** client/src/pages/JournalPage.tsx:823-826 · ecriture.service.ts:2931
- **Condition :** 5
- **Constat :** le serveur les écarte.
- **Correction :** retirer.

**F254 · Accueil : un état du brouillard inconnu s'affiche en vert** [pages-14]
- **Emplacements :** client/src/pages/AccueilPage.tsx:411-412
- **Condition :** 3
- **Constat :** une absence de réponse est présentée comme favorable.
- **Correction :** `?? false`.

**F255 · Lectures sans gestion d'erreur qui laissent des listes vides** [pages-15]
- **Emplacements :** client/src/pages/SaisiePage.tsx:250-255 · PasserEcritureFacture.tsx:27 · LibellesPage.tsx:127 · SimulationsBudgetairesPage.tsx:46 · EtatsPersonnalisesPage.tsx:34
- **Condition :** 3
- **Constat :** une erreur devient « Aucun… ».
- **Correction :** afficher l'erreur.

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

### Performance

**F258 · États SMT SYSCOHADA : écritures lues sans borne, trois fois** [efsy-17]
- **Emplacements :** etats-financiers-smt-syscohada.service.ts:386-396, :752 · client/src/pages/EtatsSmtSyscohadaPage.tsx:135
- **Condition :** 6
- **Constat :** contraire au § 8 bis.
- **Correction :** `groupBy`, et plafond déclaré sur la NOTE 4.

**F259 · Collections du registre du personnel sans borne** [paie-15]
- **Emplacements :** src/modules/personnel/personnel.service.ts:128-140, :345-360 · avances-rubriques.service.ts:18-21, :62-64, :102-110
- **Condition :** 6
- **Constat :** contraire au § 8 bis.
- **Correction :** borne déclarée.

**F260 · Console : collections sans borne et lecture dans une boucle** [plateforme-10]
- **Emplacements :** src/modules/plateforme/plateforme.service.ts:68 · abonnements.service.ts:107, :281
- **Condition :** 6
- **Constat :** les factures sont relues pour chaque abonnement.
- **Correction :** borne, et numéro calculé une fois.

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

**F263 · Scripts de scripts/ qui lisent des fichiers de session disparus** [infra-17]
- **Emplacements :** scripts/index-citations-lot-b.py:10 · scripts/lot-c-citations-sans-texte.py · scripts/lot-d-affirmations-sans-source.py · scripts/rapprocher-citations.py:10
- **Condition :** 5
- **Constat :** ils échouent hors de la session d'origine.
- **Correction :** retirer, ou paramétrer et ranger.

**F264 · Libellés et CSP périmés dans la configuration** [infra-18]
- **Emplacements :** package.json:2, :5 · client/firebase.json:78 · Dockerfile:1
- **Condition :** 5
- **Constat :** « sycebnl-suite », « MVP », « Compta Flow », et une URL Cloud Run inutile dans la CSP.
- **Correction :** mettre à jour, et `connect-src 'self'`.

**F265 · Copies avant mise à jour ni listées, ni tournées, ni recopiées** [surSite-03, infra-19]
- **Emplacements :** installation/demarrer.cjs:76-78 · src/modules/sur-site/sauvegarde-sur-site.service.ts:48, :129, :176
- **Condition :** 6
- **Constat :** hors `MOTIF_NOM`, elles s'accumulent sur le disque.
- **Correction :** nommer selon le motif ou l'étendre, et garder les N dernières.

### Documentation

**F266 · Table des workflows de CLAUDE.md § 5 incomplète** [doc-06]
- **Emplacements :** CLAUDE.md:118-125 · .github/workflows/surveillance.yml · paquet-sur-site.yml · firebase-hosting-pull-request.yml
- **Condition :** 6
- **Constat :** la surveillance de production n'y figure pas.
- **Correction :** compléter, et retirer « deux chaînes ».

**F267 · Documents historiques présentés comme vivants** [doc-19]
- **Emplacements :** docs/plan-de-construction.md:1-40 · ecarts-sage-omegax.md:51-120 · audit-complet-2026-08.md:125-148 · releve-de-manques-referentiels.md:867-870 · plan-ordonne-2026-09.md:45-46 · decision-multi-classification.md:9-12 · etats-financiers-liasses-referentiels.md:1-10, :92-96
- **Condition :** 5
- **Constat :** état révolu, sans bandeau.
- **Correction :** bandeaux datés, et dossier `docs/historique/`.

**F268 · Décompte des routes limitées en débit périmé** [doc-20]
- **Emplacements :** docs/connexions-et-plafonds.md:162-168 · auth.controller.ts:43-171 · sur-site.controller.ts:47
- **Condition :** 5
- **Constat :** six routes à 20 par minute, pas deux.
- **Correction :** renvoyer aux contrôleurs.

**F269 · Arborescence de CLAUDE.md § 2 : module inexistant et dossiers omis** [doc-21]
- **Emplacements :** CLAUDE.md:52-60
- **Condition :** 5
- **Constat :** « ecritures » au lieu de « comptabilite », et `installation/`, `e2e/`, `scripts/` absents.
- **Correction :** corriger.

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
