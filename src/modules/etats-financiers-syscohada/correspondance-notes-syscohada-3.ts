import { SpecificationNote } from '../notes-annexes/note-annexe.types';

/**
 * NOTES ANNEXES du SYSCOHADA révisé · Système normal (AUDCIF art. 11),
 * TROISIÈME TRANCHE : notes 28 à 36.
 *
 * Sources, toutes LUES au moment de la transcription (règle §1 de CLAUDE.md,
 * jamais de mémoire, jamais complété depuis le SYCEBNL) :
 *  - AUDCIF Titre IX ch. 6 section 2, maquette des NOTE 28 à NOTE 36 ·
 *    skill `audcif-acte-uniforme`, references/titre-9-ch6-7-notes-annexes-
 *    correspondance.md, lignes 513 à 763 : titres, colonnes, rubriques dans
 *    l'ordre, renvois et commentaires y sont transcrits mot pour mot ;
 *  - AUDCIF Titre IX ch. 7 « Tableau de correspondance Postes/Comptes »
 *    (même fichier, lignes 764 à 940 : bilan actif, bilan passif, compte de
 *    résultat) · c'est LUI qui dit quels comptes portent les postes que les
 *    notes 28, 29 et 30 détaillent ; quand une note et le ch. 7 se
 *    contredisent, le ch. 7 tranche et la note est transcrite telle quelle,
 *    avec la contradiction signalée ;
 *  - AUDCIF Titre IX ch. 4 section 2 « Modèle de Compte de résultat »
 *    (references/titre-9-ch1-5-bilan-resultat-flux.md, lignes 440 à 497) ·
 *    colonne « Note » de chaque poste, d'où `renvoyeeDepuis` ; ch. 2 fiches
 *    R1 à R4 (lignes 130 à 192) pour les codes ZE, ZK, ZL, ZM de la note 36 ;
 *    ch. 5 § 1.2.1.1 (lignes 540 à 560) pour la formule de la CAFG que la
 *    note 34 reprend ;
 *  - AUDCIF Titre VII, fiches COMPTE 15, 19, 49, 59, 67, 77, 83, 84, 85, 86,
 *    87, 88 · CONTENU, SUBDIVISIONS et FONCTIONNEMENT y sont lus tous les
 *    trois pour arbitrer un rattachement, et non le seul intitulé d'une
 *    subdivision : c'est le fonctionnement qui dit la contrepartie, donc la
 *    nature du mouvement (voir l'anomalie n° 3 sur le 4997) ;
 *  - AUDCIF Titre VIII, references/titre-8-ch22-30-devises-contrats-
 *    concessions-reevaluation.md · ch. 22 § 2.3 (ligne 179) pour la
 *    contrepartie du 4997, et ch. 30 § 1.4.3 (ligne 1440) pour le seuil des
 *    informations sociales et environnementales confronté à celui de la
 *    note 35 ;
 *  - le plan de comptes SYSCOHADA (skill `syscohada`, comptes/references/
 *    plan-comptes.tsv, semé par `compte-seed-syscohada.ts`) · chaque
 *    préfixe cité existe dans ce semis, vérifié par le spec voisin ;
 *  - en AIDE seulement, le moteur Python du skill `syscohada`
 *    (liasse/references/notes-ohada.md, liasse/scripts/notes_sn.py,
 *    liasse/references/tft-formules-praticien.md) · chacune de ses
 *    affectations a été revérifiée au plan et au ch. 7, et les divergences
 *    sont dites ci-dessous.
 *
 * Même MOTEUR déclaratif que les notes SYCEBNL (`note-annexe.types.ts`) et
 * même forme d'objet que la première tranche (`correspondance-notes-
 * syscohada-1.ts`), dont les conventions (lecture des jetons de comptes,
 * signe, rubriques en attente, saisie, hors balance) s'appliquent ici sans
 * être répétées. Aucun compte, aucune rubrique, aucun titre n'est repris du
 * SYCEBNL : les deux référentiels ne partagent que la mécanique (CLAUDE.md
 * §6).
 *
 * ## Tableau de mouvements ventilé par nature (note 28)
 *
 * La note 28 ventile ses colonnes B (dotations) et C (reprises) en
 * exploitation / financier / hors activités ordinaires. Le compte de
 * provision ne dit PAS de quelle nature était la dotation : seule la
 * CONTREPARTIE de l'écriture le dit. Au plan SYSCOHADA (Titre VII) :
 *  - exploitation : dotations 691 (et 659 pour le court terme, Titre VII
 *    COMPTE 659), reprises 791 (et 759) ;
 *  - financier : dotations 697 (et 679), reprises 797 (et 779) ;
 *  - HAO : dotations 85 (et 839), reprises 86 (et 849).
 * Le moteur (`NoteAnnexeService`, `natureDeLaContrepartie`) range la classe
 * 8 en HAO, 67/77/697/797 en financier et le reste des classes 6 et 7 en
 * exploitation : cette règle par classe couvre exactement les comptes
 * SYSCOHADA ci-dessus, sans qu'aucun numéro SYCEBNL n'y soit nécessaire. Ce
 * qui ne relève d'aucune des trois natures (virement de provision à
 * provision) est présenté à part (`natureNonVentilee`), jamais rangé
 * d'office en exploitation.
 *
 * Les rubriques d'un tableau de mouvements ne portent PAS `natureCreditrice` :
 * c'est `sensAccroissement: 'CREDIT'` qui oriente A, B, C, D et le solde
 * réel (`colonnesDeMouvement`), et une double orientation fausserait
 * l'écart de clôture (défaut déjà rencontré sur le premier tableau au crédit
 * du moteur, voir le commentaire du service).
 *
 * ## ANOMALIES du texte officiel, rencontrées et tranchées ici
 *
 * Aucune n'est corrigée en silence (CLAUDE.md §9). Numérotées pour être
 * citées depuis les rubriques et le spec.
 *
 * 1. **NOTE 28, numérotation corrompue du second bloc** [texte officiel] ·
 *    les lignes sont imprimées 4, 5, 6, 7, 5, 7, 8, 9, 10, 11, 12 : le 5 et
 *    le 7 servent deux fois, et « Dépréciations fournisseurs » apparaît DEUX
 *    fois (en 6 et au second 5). Transcrit sans renuméroter (les rubriques
 *    ne portent pas de numéro) ; la ligne dupliquée n'est transcrite qu'UNE
 *    fois, parce qu'une seconde ligne « Dépréciations fournisseurs » ne
 *    pourrait porter ni compte (490 serait compté deux fois) ni saisie (une
 *    dépréciation se lit en balance) · le spec vérifie que le libellé n'y
 *    figure qu'une fois et que 490 n'est capté qu'une fois.
 *
 * 2. **NOTE 28, « TOTAL : DOTATIONS »** [texte officiel] · le sous-total du
 *    premier bloc est intitulé « DOTATIONS » alors qu'il ne totalise que les
 *    trois premières lignes (provisions réglementées, provisions pour
 *    risques et charges, dépréciations des immobilisations), et le second
 *    « TOTAL : CHARGES POUR DÉPRÉCIATIONS ET PROVISIONS À COURT TERME ».
 *    Intitulés reproduits tels quels ; les totaux portent bien les lignes
 *    de leur bloc.
 *
 * 3. **NOTE 28, comptes du bilan sans ligne propre** (règle 4 de la première
 *    tranche) · la note s'intitule « provisions et dépréciations inscrites
 *    au bilan » ; tout compte 15, 19, 29, 39, 49 et 59 du plan y a donc sa
 *    place, et trois n'ont pas de ligne nommée :
 *    - 594 « Dépréciations des comptes d'instruments de trésorerie » → ligne
 *      « Dépréciations disponibilité », parce que le ch. 7 le met dans BS
 *      avec 592 et 593 ;
 *    - 4997 « Provisions pour risques à court terme sur opérations
 *      financières » → ligne « à caractère financier », avec 599. Ce
 *      rattachement se prend sur le FONCTIONNEMENT, pas sur le seul
 *      intitulé de la subdivision, et le texte officiel s'y contredit
 *      [texte officiel] : le Titre VIII ch. 22 § 2.3 (opérations en
 *      devises) écrit « risques à court terme : débit 6791 Charges pour
 *      provisions sur risques financiers · crédit 4997 », donc une DOTATION
 *      FINANCIÈRE, tandis que le Titre VII COMPTE 49, Fonctionnement, ne
 *      donne au compte 49 ENTIER que deux contreparties, « par le débit du
 *      compte 659 … ou par le débit du compte 839 », et pose que « les
 *      dépréciations et les provisions pour risques à court terme
 *      correspondent à des charges d'exploitation ou H.A.O. selon leur
 *      nature » · aucune dotation financière n'y est prévue pour le 49. La
 *      contradiction est signalée, non tranchée en silence : la ligne suit
 *      le ch. 22, qui est le seul des deux à nommer le 4997.
 *      Deux conséquences à ne pas prendre pour des défauts. D'abord la
 *      ventilation des colonnes B et C ne suit PAS le libellé de la ligne
 *      mais la contrepartie réelle de l'écriture : un dossier qui crédite
 *      le 4997 par le débit du 659 (lecture du Titre VII) verra sa dotation
 *      dans la colonne « d'exploitation » de cette ligne « à caractère
 *      financier ». Ensuite le moteur Python du skill range le 4997 avec le
 *      4991 sur la ligne d'exploitation (« 499!4998 », colonnes C et F du
 *      gabarit) et ne laisse au financier que le 599 : divergence assumée,
 *      le ch. 22 et l'intitulé du compte l'emportant sur une construction
 *      qui n'est qu'une aide ;
 *    - 4998 « Provisions pour risques à court terme sur opérations HAO »,
 *      que le ch. 7 sort du 499 pour le mettre en DH → ligne
 *      « Dépréciations actif circulant HAO », seule ligne HAO du bloc court
 *      terme, bien que 4998 soit une provision de passif et non une
 *      dépréciation d'actif. Le moteur Python ne le range nulle part ; le
 *      laisser dehors ferait diverger la note du bilan.
 *
 * 4. **NOTE 29, compte 775 sans ligne** · « Intérêts dans loyers de location
 *    acquisition » (côté bailleur, Titre VII COMPTE 77) n'a pas de ligne
 *    parmi les revenus alors que son symétrique 672 en a une parmi les
 *    frais. Rangé en « Intérêts de prêts et créances diverses », ligne la
 *    plus proche (le moteur Python fait de même), pour que le sous-total
 *    des revenus recoupe TK (« 77 » en bloc, ch. 7).
 *
 * 5. **NOTE 30, participation des travailleurs et subventions d'équilibre
 *    parmi les « autres charges HAO »** [texte officiel] · le compte 88 est
 *    un PRODUIT (Titre VII COMPTE 88 : « crédité du montant des subventions
 *    d'équilibre » ; ch. 7 : TO = « 84, 86, 88 ») et le compte 87 une
 *    RÉPARTITION DU RÉSULTAT (Titre VII COMPTE 87), portée par le poste RQ
 *    distinct de RP. La note les range pourtant dans le bloc des charges.
 *    Transcrit à leur place : le 87, débiteur, s'ajoute au sous-total des
 *    charges ; le 88, créditeur, est lu à sa nature et présenté EN NÉGATIF
 *    dans le bloc des charges (`presenterEnNegatif`), pour que le TOTAL
 *    (produits moins charges) reste le solde réel du bloc HAO et que la
 *    ligne ne gonfle pas un sous-total de charges d'un produit. Le
 *    sous-total des charges HAO de la note n'est donc PAS RP : c'est
 *    RP + RQ − 88, et le spec le dit.
 *    Divergence avec le moteur Python du skill (`liasse/scripts/notes_sn.py`,
 *    NOTE 30) : lui DÉPLACE le 88 dans le bloc des produits (ligne 30 du
 *    gabarit, sous-total « B31 = SUM(B22:B30) »), là où la note l'imprime
 *    parmi les charges. Son sous-total de charges vaut alors RP + RQ et son
 *    sous-total de produits TO. Les deux lectures donnent le MÊME TOTAL,
 *    TO − RP − RQ ; seuls les deux sous-totaux diffèrent. Celle retenue ici
 *    garde la ligne à la place que le texte lui donne, une anomalie du texte
 *    officiel se signalant sans se corriger (CLAUDE.md §9).
 *
 * 6. **NOTE 30, comptes 833, 837, 843, 844, 847 sans ligne** · charges et
 *    produits liés aux opérations de restructuration (833/843), de
 *    liquidation (837/847) et indemnités et subventions HAO des entités
 *    agricoles (844) n'ont pas de ligne. Rangés dans « Charges HAO
 *    constatées (1) » et « Produits HAO constatés (1) », lignes « à
 *    détailler » qui sont le résidu de chaque bloc, pour que les blocs
 *    recoupent 83 + 85 + 87 + 88 et 84 + 86 (postes RP, RQ et TO).
 *
 * 7. **Notes 29 et 30, « TOTAL » non défini** · la maquette aligne un
 *    sous-total de charges, un sous-total de produits et un « TOTAL » sans
 *    formule. Retenu : produits moins charges (`moinsRubriques`), seule
 *    lecture qui fasse du TOTAL un solde (financier, hors activités
 *    ordinaires) et non l'addition d'une charge à un produit ; c'est aussi
 *    la formule du moteur Python pour la note 30.
 *
 * 8. **NOTE 31 hors balance** · cinq colonnes N à N-4. Le moteur des notes
 *    ne lit que deux exercices (N et N-1) ; N-2 à N-4 ne sont dans aucune
 *    balance chargée, et la moitié des lignes (actions, dividende par
 *    action, effectifs) n'est pas comptable. Toute la note est en saisie.
 *    Les renvois (⁷) à (⁹) citent des comptes (661 à 663 ; 664 et 668 ;
 *    667) · ils sont reproduits en texte, pas en rattachement, pour que la
 *    note reste d'une seule nature ; ces comptes sont chiffrés par la note
 *    27A (deuxième tranche).
 *
 * 9. **NOTES 32 et 33, en-têtes désalignés** [texte officiel] · la note 33
 *    annonce trois couples Quantité/Valeur pour deux origines déclarées
 *    (« dans l'État » / « hors de l'État »). Les deux notes portent des
 *    quantités par produit qu'aucune balance ne connaît : hors balance, en
 *    saisie, colonnes reproduites telles quelles (le troisième couple de la
 *    note 33 est transcrit sans intitulé d'origine, comme imprimé).
 *
 * 10. **NOTE 34, fiche de synthèse** · elle ne se lit pas dans la balance,
 *    elle se CALCULE depuis les trois états. Déclarée `horsBalance` pour que
 *    le moteur générique la présente sans inventer de chiffre, et doublée
 *    de `FICHE_SYNTHESE_SYSCOHADA`, description terme à terme (postes du
 *    compte de résultat, du bilan, du tableau des flux, comptes) que le
 *    service des états SYSCOHADA calcule à part. Quatre points signalés :
 *    - « Dettes financières* » = « emprunts et dettes financières diverses
 *      + dettes de location acquisition », soit DA + DB SEULEMENT : les
 *      provisions pour risques et charges (DC) en sont EXCLUES alors que DD
 *      les inclut. Les ressources stables de la note 34 ne sont donc PAS
 *      le poste DF du bilan ;
 *    - « Variation de la trésorerie nette » écrit « − Flux d'investissement »
 *      [texte officiel] alors que le modèle du TFT (ch. 5 section 2) pose
 *      ZG = B + C + F avec C déjà signé (décaissements négatifs) ; suivre la
 *      note inverserait le signe une seconde fois. Codé selon le modèle du
 *      TFT (+ ZC), formule officielle reproduite en texte ;
 *    - la formule énumérée de la CAFG (identique au ch. 5 § 1.2.1.1) ne
 *      cite pas les « autres charges HAO » (83) que la définition du même
 *      chapitre (« charges décaissables restantes ») inclut, et que FA du
 *      TFT retient (`correspondance-tft-syscohada.ts`). La ligne est
 *      ajoutée ici marquée `horsMaquette`, pour que la CAFG de la note
 *      puisse égaler FA ; le service choisit de la retenir ou non, en le
 *      disant ;
 *    - l'autofinancement (CAFG moins dividendes versés) n'existe QUE dans
 *      la note 34 ; les dividendes sont FN du TFT ;
 *    - la « Rentabilité économique » est la SEULE occurrence où le texte
 *      écrit « Capitaux propres + dettes financières » SANS l'astérisque
 *      [texte officiel], alors que les lignes de structure financière et
 *      d'endettement portent « Dettes financières* ». La définition étoilée
 *      (DA + DB) lui est appliquée par cohérence de la fiche, et cette
 *      assimilation est portée en `motif` sur les termes du dénominateur
 *      plutôt que faite en silence : l'autre lecture serait DD, qui inclut
 *      DC ;
 *    - la ligne « CONTRÔLE : TRÉSORERIE NETTE = (TRÉSORERIE-ACTIF) –
 *      (TRÉSORERIE-PASSIF) » ne peut PAS boucler exactement, et c'est une
 *      conséquence arithmétique de « Dettes financières* = DA + DB ». Le
 *      bilan pose AZ + BK + BT + BU = DF + DP + DT + DV avec
 *      DF = CP + DA + DB + DC ; en y portant (1) = CP + DA + DB − AZ et
 *      (4) = BK − DP, il vient (5) = (1) − (4) = (BT − DT) + (BU − DV) − DC.
 *      Même après l'élimination des écarts de conversion que demande le
 *      renvoi (b) (BU et DV), le contrôle reste séparé de la trésorerie
 *      nette par les provisions pour risques et charges DC. L'écart est donc
 *      STRUCTUREL, nul seulement si DC = 0 ; il est écrit sur la ligne de
 *      contrôle elle-même, pour n'être pris ni pour un défaut du service ni
 *      pour une anomalie du dossier.
 *
 * 11. **NOTE 35, seuil de 250 salariés** [texte officiel] · la note se dit
 *    « obligatoire pour les entités ayant un effectif de plus de 250
 *    salariés », alors que le Titre VIII ch. 30 § 1.4.3 fixe l'obligation
 *    d'informations sociales, environnementales et sociétales à « toute
 *    société ayant un effectif de plus de 500 salariés ». Contradiction
 *    entre deux titres du même texte, non tranchée ici : les deux seuils
 *    sont exportés (`SEUILS_NOTE_35`) et le commentaire de la note les
 *    porte tous deux.
 *
 * 12. **NOTE 36, tables lacunaires** [texte officiel] · la table 3 (pays du
 *    siège) saute de 00 à 21, de 23 à 39, de 41 à 49 et de 50 à 99 ; les
 *    codes intermédiaires ne sont pas définis. Les groupes d'activités 043
 *    (SIFIM) et 044 (correction territoriale) sont des agrégats de
 *    comptabilité nationale, pas des activités d'entité ; transcrits quand
 *    même, la table en compte 44. Et le renvoi (¹) de la fiche R2 (ch. 2)
 *    renvoie aux tables des codes par « NOTE 34 » alors qu'elles sont la
 *    NOTE 36 ; `renvoyeeDepuis` porte ZK, ZL, ZM (fiche R2) et ZE (code
 *    activité principale, fiche R1), au sens de l'article 15. La
 *    `SpecificationNote` de cette note ne porte que les QUATRE TITRES des
 *    tables : le moteur déclaratif ne sait afficher que des rubriques
 *    chiffrées ou saisies, pas une nomenclature. Les tables vivent dans les
 *    constantes exportées ci-dessus ; tant qu'un service ou un export ne les
 *    lit pas, la note 36 se rend en grille de quatre lignes vides. C'est
 *    voulu, pas un oubli de transcription.
 *
 * 13. **NOTE 28, ligne « Provisions réglementées » plus étroite que le
 *    compte 15** · le ch. 7 pose CM = « 15 » en bloc, mais le compte
 *    s'intitule « Provisions réglementées ET FONDS ASSIMILÉS » (Titre VII
 *    COMPTE 15) et son 153 « Fonds réglementés » (1531 Fonds national,
 *    1532 Prélèvement pour le Budget) n'est pas une provision. Le jeton
 *    reste « 15 » : l'exclure mettrait les fonds assimilés hors de toute
 *    note alors qu'ils sont au bilan. Le rattachement reste cohérent avec
 *    les colonnes, le Titre VII posant que le compte 15 ENTIER est créé
 *    « exclusivement par Dotations H.A.O. » et repris « exclusivement par
 *    Reprises H.A.O. ». Seul le libellé de la ligne est plus étroit que son
 *    contenu, et la ligne le dit.
 *
 * 14. **NOTE 28, le 1962 est un compte d'ACTIF logé dans le 19** · le
 *    ch. 7 pose DC = « 19 » en bloc, or le 1962 « Actif du régime de
 *    retraite » est débiteur : Titre VII COMPTE 19, « la prime versée est
 *    enregistrée au débit du 1962 par le crédit d'un compte de trésorerie ».
 *    Dans un tableau de mouvements au CRÉDIT, ses primes versées ressortent
 *    donc en diminution, et leur contrepartie étant de classe 5 elles
 *    tombent en `natureNonVentilee` plutôt que dans l'une des trois natures.
 *    Rattachement conforme au ch. 7, conservé et signalé sur la ligne ; la
 *    deuxième tranche fait le même constat pour la note 16A
 *    (`correspondance-notes-syscohada-2.ts`, son anomalie n° 3) : les deux
 *    tranches sont alignées.
 */

// --------------------------------------------------------------------------
// Colonnes officielles
// --------------------------------------------------------------------------

/** Notes 29, 30 et 34 · « Année N · Année N-1 · Variation en % », sans variation en valeur. */
const COLONNES_N_N1_POURCENT = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

/**
 * NOTE 28 · colonnes A, B (ventilée en trois natures), C (idem) et
 * « D = A + B – C ». Le texte nomme lui-même les colonnes ; les intitulés
 * de tête de groupe (« B · AUGMENTATIONS : DOTATIONS ») sont préfixés à
 * chaque sous-colonne, deux colonnes de même libellé étant indistinguables.
 */
const COLONNES_NOTE_28 = [
  { type: 'OUVERTURE' as const, libelle: "A · PROVISIONS À L'OUVERTURE DE L'EXERCICE" },
  { type: 'AUGMENTATION_EXPLOITATION' as const, libelle: "B · AUGMENTATIONS : DOTATIONS D'EXPLOITATION" },
  { type: 'AUGMENTATION_FINANCIERE' as const, libelle: 'B · AUGMENTATIONS : DOTATIONS FINANCIÈRES' },
  { type: 'AUGMENTATION_HAO' as const, libelle: 'B · AUGMENTATIONS : DOTATIONS HORS ACTIVITÉS ORDINAIRES' },
  { type: 'DIMINUTION_EXPLOITATION' as const, libelle: "C · DIMINUTIONS : REPRISES D'EXPLOITATION" },
  { type: 'DIMINUTION_FINANCIERE' as const, libelle: 'C · DIMINUTIONS : REPRISES FINANCIÈRES' },
  { type: 'DIMINUTION_HAO' as const, libelle: 'C · DIMINUTIONS : REPRISES HORS ACTIVITÉS ORDINAIRES' },
  { type: 'CLOTURE' as const, libelle: "D = A + B – C · PROVISIONS À LA CLÔTURE DE L'EXERCICE" },
];

/** Colonne unique des notes purement déclaratives (35). */
const COLONNE_INFORMATIONS = [{ type: 'LIBRE' as const, libelle: 'Informations' }];

/**
 * NOTE 31 · cinq exercices, aucun n'étant lu en balance (anomalie n° 8).
 * Le renvoi (¹) est imprimé sur l'en-tête de la SEULE colonne « N-4 »
 * (ch. 6 : « `N` · `N-1` · `N-2` · `N-3` · `N-4` (¹) ») ; il est donc porté
 * là, tel quel. Son texte (« y compris l'exercice dont les états financiers
 * sont soumis à l'approbation de l'Assemblée ») qualifie pourtant les CINQ
 * colonnes, pas la dernière : marque transcrite à sa place imprimée,
 * portée non déduite [texte officiel].
 */
const COLONNES_CINQ_EXERCICES = [
  { type: 'LIBRE' as const, libelle: 'N' },
  { type: 'LIBRE' as const, libelle: 'N-1' },
  { type: 'LIBRE' as const, libelle: 'N-2' },
  { type: 'LIBRE' as const, libelle: 'N-3' },
  { type: 'LIBRE' as const, libelle: 'N-4 (¹)' },
];

/** Une colonne « Quantité / Valeur » des notes 32 et 33, préfixée de son groupe. */
const quantiteValeur = (groupe: string) => [
  { type: 'LIBRE' as const, libelle: `${groupe} · Quantité` },
  { type: 'LIBRE' as const, libelle: `${groupe} · Valeur` },
];

// --------------------------------------------------------------------------
// NOTE 35 · seuils, NOTE 36 · tables des codes (exportés tels quels)
// --------------------------------------------------------------------------

/**
 * Anomalie n° 11 · les deux seuils du texte, sans arbitrage. Le premier est
 * celui de la maquette de la note 35 (Titre IX ch. 6), le second celui du
 * Titre VIII ch. 30 § 1.4.3 (« toute société ayant un effectif de plus de
 * 500 salariés »). Un service qui voudrait décider de l'applicabilité de la
 * note doit choisir en le disant, jamais en prenant l'un pour l'autre.
 */
export const SEUILS_NOTE_35 = {
  effectifNote35TitreIX: 250,
  effectifTitreVIIIChapitre30: 500,
} as const;

export interface CodeTable {
  code: string;
  libelle: string;
}

/**
 * NOTE 36, table 1 · code forme juridique. Renvoi (1) du texte : « Remplacer
 * le premier 0 par 1 si l'entité bénéficie d'un agrément prioritaire ». Les
 * codes sont transcrits avec leurs deux chiffres accolés (« 0 0 » imprimé
 * avec une espace de séparation de cases).
 */
export const CODES_FORME_JURIDIQUE_SYSCOHADA: CodeTable[] = [
  { code: '00', libelle: 'Société Anonyme (SA) à participation publique' },
  { code: '01', libelle: 'Société Anonyme (SA)' },
  { code: '02', libelle: 'Société à Responsabilité Limitée (SARL)' },
  { code: '03', libelle: 'Société en Commandite Simple (SCS)' },
  { code: '04', libelle: 'Société en Nom Collectif (SNC)' },
  { code: '05', libelle: 'Société en Participation (SP)' },
  { code: '06', libelle: "Groupement d'Intérêt Économique (GIE)" },
  { code: '07', libelle: 'Association' },
  { code: '08', libelle: 'Société par Actions Simplifiée (SAS)' },
  { code: '09', libelle: 'Autre forme juridique (à préciser)' },
];

export const RENVOI_1_FORME_JURIDIQUE_SYSCOHADA =
  "(1) Remplacer le premier 0 par 1 si l'entité bénéficie d'un agrément prioritaire.";

/** NOTE 36, table 2 · code régime fiscal. */
export const CODES_REGIME_FISCAL_SYSCOHADA: CodeTable[] = [
  { code: '1', libelle: 'Réel normal' },
  { code: '2', libelle: 'Réel simplifié' },
  { code: '3', libelle: 'Synthétique' },
  { code: '4', libelle: 'Forfait' },
];

/**
 * NOTE 36, table 3 · code pays du siège social. Lacunaire [texte officiel],
 * anomalie n° 12 : les codes que la table ne définit pas n'existent pas ici
 * non plus. « 00 » est à remplacer par le code du pays OHADA (renvoi (2),
 * `CODES_PAYS_OHADA_SYSCOHADA`).
 */
export const CODES_PAYS_SIEGE_SYSCOHADA: CodeTable[] = [
  { code: '00', libelle: 'Pays OHADA (2)' },
  { code: '21', libelle: 'Autres pays africains' },
  { code: '23', libelle: 'France' },
  { code: '39', libelle: "Autres pays de l'Union Européenne" },
  { code: '40', libelle: 'U.S.A.' },
  { code: '41', libelle: 'Canada' },
  { code: '49', libelle: 'Autres pays américains' },
  { code: '50', libelle: 'Pays asiatiques' },
  { code: '99', libelle: 'Autres pays' },
];

/**
 * NOTE 36, renvoi (2) de la table 3 · codes des 17 États parties. La RDC
 * porte le code 17 : c'est la seule occurrence de la RDC dans tout le
 * Titre IX, et c'est le code que porte tout dossier de ce logiciel.
 */
export const CODES_PAYS_OHADA_SYSCOHADA: CodeTable[] = [
  { code: '01', libelle: 'Bénin' },
  { code: '02', libelle: 'Burkina' },
  { code: '03', libelle: "Côte d'Ivoire" },
  { code: '04', libelle: 'Guinée Bissau' },
  { code: '05', libelle: 'Mali' },
  { code: '06', libelle: 'Niger' },
  { code: '07', libelle: 'Sénégal' },
  { code: '08', libelle: 'Togo' },
  { code: '09', libelle: 'Cameroun' },
  { code: '10', libelle: 'Congo' },
  { code: '11', libelle: 'Gabon' },
  { code: '12', libelle: 'République Centrafricaine' },
  { code: '13', libelle: 'Tchad' },
  { code: '14', libelle: 'Comores' },
  { code: '15', libelle: 'Guinée' },
  { code: '16', libelle: 'Guinée Équatoriale' },
  { code: '17', libelle: 'Congo RDC' },
];

export const CODE_PAYS_OHADA_RDC = '17';

/**
 * NOTE 36 · codes activités économiques, nomenclature à six chiffres
 * (« groupe » sur 3 chiffres + « poste » sur 3 chiffres). Les 44 groupes
 * sont transcrits ; les postes (001, 002… ; 000 pour un groupe non
 * subdivisé) ne sont pas énumérés par le Titre IX, qui n'en donne que des
 * exemples · ils relèvent du Titre XI (nomenclatures NAEMA/NOPEMA). Le code
 * activité principale se déclare en ZE (fiche R1).
 */
export const GROUPES_ACTIVITES_SYSCOHADA: CodeTable[] = [
  { code: '001', libelle: 'Agriculture vivrière' },
  { code: '002', libelle: "Agriculture industrielle et d'exportation" },
  { code: '003', libelle: 'Élevage et chasse' },
  { code: '004', libelle: 'Sylviculture, exploitation forestière' },
  { code: '005', libelle: 'Pêche et aquaculture' },
  { code: '006', libelle: 'Industries extractives' },
  { code: '007', libelle: 'Production de viande et de poissons' },
  { code: '008', libelle: 'Travail des grains et fabrication de produits amylacés' },
  { code: '009', libelle: 'Transformation du café et du cacao' },
  { code: '010', libelle: 'Industrie des oléagineux' },
  { code: '011', libelle: 'Boulangerie, pâtisserie et pâtes alimentaires' },
  { code: '012', libelle: 'Industries laitières' },
  { code: '013', libelle: "Transformation des fruits et légumes et fabrication d'autres produits alimentaires" },
  { code: '014', libelle: 'Industrie des boissons' },
  { code: '015', libelle: 'Industries du tabac' },
  { code: '016', libelle: 'Industries textiles et habillement' },
  { code: '017', libelle: 'Industries du cuir et de la chaussure' },
  { code: '018', libelle: 'Industries du bois' },
  { code: '019', libelle: "Industries du papier et cartons, de l'édition et de l'imprimerie" },
  { code: '020', libelle: 'Raffinage du pétrole' },
  { code: '021', libelle: 'Industrie chimique' },
  { code: '022', libelle: 'Industries du caoutchouc et des plastiques' },
  { code: '023', libelle: "Fabrication d'autres produits minéraux non métalliques et de matériaux de construction" },
  { code: '024', libelle: 'Métallurgie et travail des métaux' },
  { code: '025', libelle: "Fabrication de machines, d'équipements et d'appareils électriques" },
  {
    code: '026',
    libelle:
      "Fabrication d'équipements et appareils audiovisuels et de communication ; fabrication d'instruments " +
      "médicaux, d'optique et d'horlogerie",
  },
  { code: '027', libelle: 'Fabrication de matériel de transport' },
  { code: '028', libelle: 'Industries diverses' },
  { code: '029', libelle: "Production et distribution d'eau, d'électricité et de gaz" },
  { code: '030', libelle: 'Construction' },
  { code: '031', libelle: 'Commerce' },
  { code: '032', libelle: 'Réparations' },
  { code: '033', libelle: 'Hôtels, restaurants' },
  { code: '034', libelle: 'Transport et communication' },
  { code: '035', libelle: 'Postes, télécommunications' },
  { code: '036', libelle: 'Activités financières' },
  { code: '037', libelle: 'Activités immobilières' },
  { code: '038', libelle: 'Services aux entités' },
  { code: '039', libelle: 'Administrations publiques' },
  { code: '040', libelle: 'Éducation' },
  { code: '041', libelle: 'Santé et action sociale' },
  { code: '042', libelle: 'Services collectifs, sociaux et personnels' },
  // Anomalie n° 12 : agrégats de comptabilité nationale, transcrits quand même.
  { code: '043', libelle: "Service d'intermédiation financière indirectement mesuré" },
  { code: '044', libelle: 'Correction territoriale' },
];

// --------------------------------------------------------------------------
// NOTE 34 · description calculable de la fiche de synthèse
// --------------------------------------------------------------------------

/**
 * D'où vient un terme de la fiche de synthèse.
 * - `COMPTE_RESULTAT` : un poste (T*, R*) ou un solde (X*) du compte de
 *   résultat SYSCOHADA (`POSTES_COMPTE_RESULTAT_SYSCOHADA`,
 *   `SOLDES_INTERMEDIAIRES`). Les postes T* et R* sont pris en VALEUR ABSOLUE
 *   (le modèle porte les R en négatif, ch. 4 « logique de signe ») et le
 *   `signe` du terme dit s'ils s'ajoutent ou se retranchent ; les soldes X*
 *   sont pris SIGNÉS, une perte restant une perte.
 * - `BILAN` : un poste ou un total du bilan SYSCOHADA, en NET, signé comme
 *   le bilan le présente.
 * - `FLUX_TRESORERIE` : un poste ou un total du TFT SYSCOHADA, signé comme
 *   le tableau le présente (les décaissements y sont négatifs).
 * - `COMPTE` : le solde d'un compte de gestion de la balance N, lu dans le
 *   sens de sa nature (`solde`), en valeur absolue.
 * - `LIGNE` : une ligne ANTÉRIEURE de la fiche (sous-total).
 */
export type SourceTermeFicheSynthese = 'COMPTE_RESULTAT' | 'BILAN' | 'FLUX_TRESORERIE' | 'COMPTE' | 'LIGNE';

export interface TermeFicheSynthese {
  signe: 1 | -1;
  source: SourceTermeFicheSynthese;
  /** REF de l'état, préfixe de compte, ou `cle` d'une ligne antérieure. */
  ref: string;
  /** Pour `COMPTE` : sens dans lequel le solde est lu en positif. */
  solde?: 'DEBITEUR' | 'CREDITEUR';
  /** Pourquoi ce terme, avec sa source. */
  motif?: string;
  /**
   * Terme ABSENT de la formule imprimée (anomalie n° 10). Le marqueur est
   * porté par le terme lui-même et pas seulement par la ligne qu'il vise :
   * un service qui sommerait `termes` sans le lire obtiendrait une CAFG
   * différente de `formuleOfficielle` SANS que rien ne le dise. Retenir ou
   * écarter le terme est un choix, il doit rester un choix visible.
   */
  horsMaquette?: boolean;
}

export type SectionFicheSynthese =
  | 'ACTIVITE'
  | 'CAPACITE_AUTOFINANCEMENT'
  | 'RENTABILITE'
  | 'STRUCTURE_FINANCIERE'
  | 'VARIATION_TRESORERIE'
  | 'ENDETTEMENT_FINANCIER_NET';

export interface LigneFicheSynthese {
  cle: string;
  section: SectionFicheSynthese;
  /** Intitulé exact du texte officiel. */
  libelle: string;
  /** Formule telle qu'imprimée, quand la note en donne une. */
  formuleOfficielle?: string;
  /** Somme signée de termes ; absent pour un ratio. */
  termes?: TermeFicheSynthese[];
  /** Ratio numérateur / dénominateur (analyse de la rentabilité). */
  ratio?: { numerateur: TermeFicheSynthese[]; denominateur: TermeFicheSynthese[] };
  /**
   * Renvoi (a) ou (b) du texte officiel. Le (b) demande d'éliminer les
   * écarts de conversion « afin de ramener les créances et les dettes
   * concernées à leur valeur initiale » : le retraitement (478/479, Titre
   * VIII ch. 22) est à faire par le service, il n'est pas décrit ici.
   */
  renvoi?: string;
  /**
   * Ligne que la maquette n'imprime pas mais que la définition de la CAFG
   * exige (anomalie n° 10). Le service décide de la retenir, en le disant.
   */
  horsMaquette?: boolean;
  /** Ligne de contrôle : ne s'ajoute à rien, se compare à une autre ligne. */
  controleDe?: string;
}

const cr = (signe: 1 | -1, ref: string, motif?: string): TermeFicheSynthese => ({ signe, source: 'COMPTE_RESULTAT', ref, motif });
const bilan = (signe: 1 | -1, ref: string, motif?: string): TermeFicheSynthese => ({ signe, source: 'BILAN', ref, motif });
const flux = (signe: 1 | -1, ref: string, motif?: string): TermeFicheSynthese => ({ signe, source: 'FLUX_TRESORERIE', ref, motif });
const compte = (signe: 1 | -1, ref: string, solde: 'DEBITEUR' | 'CREDITEUR', motif?: string): TermeFicheSynthese => ({
  signe, source: 'COMPTE', ref, solde, motif,
});
const ligne = (signe: 1 | -1, ref: string, horsMaquette?: true, motif?: string): TermeFicheSynthese => ({
  signe, source: 'LIGNE', ref, horsMaquette, motif,
});

/** Renvoi (b) du texte, reproduit mot pour mot ; porté par chaque ligne qui l'appelle. */
export const RENVOI_B_NOTE_34 =
  '(b) Les écarts de conversion doivent être éliminés afin de ramener les créances et les dettes concernées à ' +
  'leur valeur initiale.';

export const RENVOI_A_NOTE_34 = '(a) Résultat d’exploitation après impôt théorique sur le bénéfice.';

/**
 * Marque portée par toute rubrique de la note 34 que la maquette officielle
 * n'imprime PAS (anomalie n° 10). Elle vaut pour le lecteur du tableau, là
 * où `horsMaquette` ne vaut que pour le service.
 */
export const MARQUE_HORS_MAQUETTE_NOTE_34 =
  '[hors maquette] Ligne absente du modèle officiel de la note 34, ajoutée pour que la CAFG puisse égaler le ' +
  'poste FA du tableau des flux ; le service la retient ou l’écarte, en le disant.';

export const RENVOI_DETTES_FINANCIERES_NOTE_34 =
  'Dettes financières* = emprunts et dettes financières diverses + dettes de location acquisition (DA + DB).';

/**
 * NOTE 34, ligne à ligne, dans l'ordre de la maquette. Les postes cités
 * existent tous dans les tables SYSCOHADA du dépôt (vérifié par le spec) :
 * XA à XI et TK, TM, TO, RM, RP, RQ, RS au compte de résultat ; CP, DA, DB,
 * AZ, BA, BK, BT, DH, DP, DT au bilan ; ZB, ZC, ZF, FN au tableau des flux.
 * « Dettes financières* » est DA + DB partout (anomalie n° 10).
 */
export const FICHE_SYNTHESE_SYSCOHADA: LigneFicheSynthese[] = [
  // ---- ANALYSE DE L'ACTIVITÉ · SOLDES INTERMÉDIAIRES DE GESTION -----------
  { cle: 'chiffre-affaires', section: 'ACTIVITE', libelle: "Chiffre d'affaires", termes: [cr(1, 'XB')] },
  { cle: 'marge-commerciale', section: 'ACTIVITE', libelle: 'Marge commerciale', termes: [cr(1, 'XA')] },
  { cle: 'valeur-ajoutee', section: 'ACTIVITE', libelle: 'Valeur ajoutée', termes: [cr(1, 'XC')] },
  { cle: 'ebe', section: 'ACTIVITE', libelle: "Excédent brut d'exploitation (EBE)", termes: [cr(1, 'XD')] },
  { cle: 'resultat-exploitation', section: 'ACTIVITE', libelle: "Résultat d'exploitation", termes: [cr(1, 'XE')] },
  { cle: 'resultat-financier', section: 'ACTIVITE', libelle: 'Résultat financier', termes: [cr(1, 'XF')] },
  { cle: 'resultat-activites-ordinaires', section: 'ACTIVITE', libelle: 'Résultat des activités ordinaires', termes: [cr(1, 'XG')] },
  { cle: 'resultat-hao', section: 'ACTIVITE', libelle: 'Résultat hors activités ordinaires', termes: [cr(1, 'XH')] },
  { cle: 'resultat-net', section: 'ACTIVITE', libelle: 'Résultat net', termes: [cr(1, 'XI')] },

  // ---- DÉTERMINATION DE LA CAPACITÉ D'AUTOFINANCEMENT ---------------------
  // Formule identique à celle du ch. 5 § 1.2.1.1 ; lecture terme à terme
  // alignée sur FA du TFT (`correspondance-tft-syscohada.ts`) pour que la
  // CAFG de la note égale celle du tableau des flux.
  { cle: 'caf-ebe', section: 'CAPACITE_AUTOFINANCEMENT', libelle: 'EBE', termes: [cr(1, 'XD')] },
  {
    cle: 'caf-vnc-cessions-courantes',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: "+ Valeurs comptables des cessions courantes d'immobilisation (compte 654)",
    termes: [compte(1, '654', 'DEBITEUR', 'Charge déjà retirée de l’EBE par RJ (65 en bloc, ch. 7) : réintégrée, la cession courante étant un flux d’investissement.')],
  },
  {
    cle: 'caf-produits-cessions-courantes',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: "– Produits des cessions courantes d'immobilisation (compte 754)",
    termes: [compte(-1, '754', 'CREDITEUR', 'Produit compris dans l’EBE par TH (75 en bloc) : retranché, le prix de cession étant encaissé en investissement.')],
  },
  {
    cle: 'caf-exploitation',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: "= CAPACITÉ D'AUTOFINANCEMENT D'EXPLOITATION",
    formuleOfficielle: 'EBE + 654 – 754',
    termes: [ligne(1, 'caf-ebe'), ligne(1, 'caf-vnc-cessions-courantes'), ligne(1, 'caf-produits-cessions-courantes')],
  },
  {
    cle: 'caf-revenus-financiers',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '+ Revenus financiers',
    // TK = 77 en bloc (ch. 7). Les gains de change (776) ont leur propre
    // ligne juste après : retirés ici pour n'être comptés qu'une fois.
    termes: [cr(1, 'TK', '77 en bloc (ch. 7).'), compte(-1, '776', 'CREDITEUR', 'Gains de change présentés sur la ligne suivante.')],
  },
  { cle: 'caf-gains-change', section: 'CAPACITE_AUTOFINANCEMENT', libelle: '+ Gains de change', termes: [compte(1, '776', 'CREDITEUR')] },
  {
    cle: 'caf-transferts-charges-financieres',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '+ Transferts de charges financières',
    termes: [cr(1, 'TM', '787 (ch. 7).')],
  },
  {
    cle: 'caf-produits-hao',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '+ Produits HAO',
    // TO = 84, 86, 88 (ch. 7). Les reprises HAO (86) ne sont pas
    // encaissables (Titre VII COMPTE 86 : reprises par débit de 15, 19, 29) ;
    // les transferts de charges HAO (848) ont leur propre ligne.
    termes: [
      cr(1, 'TO', '84, 86, 88 (ch. 7).'),
      compte(-1, '86', 'CREDITEUR', 'Reprises HAO : produit non encaissable, comme dans FA du TFT.'),
      compte(-1, '848', 'CREDITEUR', 'Transferts de charges HAO présentés sur la ligne suivante.'),
    ],
  },
  { cle: 'caf-transferts-charges-hao', section: 'CAPACITE_AUTOFINANCEMENT', libelle: '+ Transferts de charges HAO', termes: [compte(1, '848', 'CREDITEUR')] },
  {
    cle: 'caf-frais-financiers',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '– Frais financiers',
    // RM = 67 en bloc (ch. 7). Les pertes de change (676) ont leur ligne.
    termes: [cr(-1, 'RM', '67 en bloc (ch. 7).'), compte(1, '676', 'DEBITEUR', 'Pertes de change présentées sur la ligne suivante.')],
  },
  { cle: 'caf-pertes-change', section: 'CAPACITE_AUTOFINANCEMENT', libelle: '– Pertes de change', termes: [compte(-1, '676', 'DEBITEUR')] },
  {
    cle: 'caf-autres-charges-hao',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '– Autres charges HAO (hors dotations)',
    horsMaquette: true,
    // Anomalie n° 10 : absente de la formule imprimée, présente dans la
    // définition (« charges décaissables restantes ») et dans FA du TFT.
    termes: [cr(-1, 'RP', '83, 85 (ch. 7).'), compte(1, '85', 'DEBITEUR', 'Dotations HAO : charge non décaissable, retirée comme dans FA.')],
  },
  { cle: 'caf-participation', section: 'CAPACITE_AUTOFINANCEMENT', libelle: '– Participation', termes: [cr(-1, 'RQ', '87 (ch. 7).')] },
  { cle: 'caf-impots', section: 'CAPACITE_AUTOFINANCEMENT', libelle: '– Impôts sur les résultats', termes: [cr(-1, 'RS', '89 (ch. 7).')] },
  {
    cle: 'cafg',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: "= CAPACITÉ D'AUTOFINANCEMENT GLOBALE (C.A.F.G.)",
    formuleOfficielle:
      'CAF d’exploitation + revenus financiers + gains de change + transferts de charges financières + produits HAO ' +
      '+ transferts de charges HAO – frais financiers – pertes de change – participation – impôts sur les résultats',
    termes: [
      ligne(1, 'caf-exploitation'),
      ligne(1, 'caf-revenus-financiers'),
      ligne(1, 'caf-gains-change'),
      ligne(1, 'caf-transferts-charges-financieres'),
      ligne(1, 'caf-produits-hao'),
      ligne(1, 'caf-transferts-charges-hao'),
      ligne(1, 'caf-frais-financiers'),
      ligne(1, 'caf-pertes-change'),
      // HORS MAQUETTE : ce terme n'est pas dans `formuleOfficielle` ci-dessus
      // (anomalie n° 10). Sans le marqueur, une somme naïve des `termes`
      // donnerait une CAFG différente de la formule imprimée sans le dire.
      ligne(
        1,
        'caf-autres-charges-hao',
        true,
        'Absent de la formule énumérée du ch. 5 § 1.2.1.1, exigé par sa définition (« charges décaissables ' +
          'restantes ») et retenu par FA du TFT : le retenir aligne la CAFG de la note sur celle du tableau des ' +
          'flux, l’écarter la ramène à la formule imprimée. Choix du service, à dire dans les deux cas.',
      ),
      ligne(1, 'caf-participation'),
      ligne(1, 'caf-impots'),
    ],
  },
  {
    cle: 'dividendes-distribues',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: "– Distributions de dividendes opérées durant l'exercice",
    termes: [flux(1, 'FN', 'Dividendes versés, poste FN du TFT, déjà négatif dans le tableau.')],
  },
  {
    cle: 'autofinancement',
    section: 'CAPACITE_AUTOFINANCEMENT',
    libelle: '= AUTOFINANCEMENT',
    formuleOfficielle: 'CAFG – distributions de dividendes',
    termes: [ligne(1, 'cafg'), ligne(1, 'dividendes-distribues')],
  },

  // ---- ANALYSE DE LA RENTABILITÉ -------------------------------------------
  {
    cle: 'rentabilite-economique',
    section: 'RENTABILITE',
    libelle: 'Rentabilité économique',
    formuleOfficielle: "Résultat d'exploitation (a) / (Capitaux propres + dettes financières)",
    renvoi: RENVOI_A_NOTE_34,
    // (a) « après impôt théorique » : le taux d'impôt n'est pas dans le
    // texte comptable ; le service l'applique depuis la fiscalité du dossier.
    ratio: {
      numerateur: [cr(1, 'XE', 'Avant l’impôt théorique du renvoi (a).')],
      denominateur: [
        bilan(1, 'CP'),
        bilan(
          1,
          'DA',
          '[texte officiel] La formule écrit ici « dettes financières » SANS astérisque, seule occurrence de la ' +
            'fiche ; la définition étoilée (DA + DB) lui est assimilée par cohérence avec les lignes de structure ' +
            'financière et d’endettement. L’autre lecture serait DD, qui inclut les provisions DC. Assimilation ' +
            'dite, non faite en silence.',
        ),
        bilan(1, 'DB', 'Même assimilation que DA : voir le motif porté par ce terme.'),
      ],
    },
  },
  {
    cle: 'rentabilite-financiere',
    section: 'RENTABILITE',
    libelle: 'Rentabilité financière',
    formuleOfficielle: 'Résultat net / Capitaux propres',
    ratio: { numerateur: [cr(1, 'XI')], denominateur: [bilan(1, 'CP')] },
  },

  // ---- ANALYSE DE LA STRUCTURE FINANCIÈRE ----------------------------------
  { cle: 'capitaux-propres', section: 'STRUCTURE_FINANCIERE', libelle: 'Capitaux propres et ressources assimilées', termes: [bilan(1, 'CP')] },
  {
    cle: 'dettes-financieres',
    section: 'STRUCTURE_FINANCIERE',
    libelle: '+ Dettes financières* et autres ressources assimilées (b)',
    renvoi: `${RENVOI_DETTES_FINANCIERES_NOTE_34} ${RENVOI_B_NOTE_34}`,
    // DA + DB SEULEMENT : DC exclu (anomalie n° 10). Les « autres ressources
    // assimilées » du libellé n'ajoutent rien, le renvoi les définit.
    termes: [bilan(1, 'DA'), bilan(1, 'DB')],
  },
  {
    cle: 'ressources-stables',
    section: 'STRUCTURE_FINANCIERE',
    libelle: '= Ressources stables',
    termes: [ligne(1, 'capitaux-propres'), ligne(1, 'dettes-financieres')],
  },
  { cle: 'actif-immobilise', section: 'STRUCTURE_FINANCIERE', libelle: '– Actif immobilisé (b)', renvoi: RENVOI_B_NOTE_34, termes: [bilan(-1, 'AZ')] },
  {
    cle: 'fonds-de-roulement',
    section: 'STRUCTURE_FINANCIERE',
    libelle: '= FONDS DE ROULEMENT (1)',
    termes: [ligne(1, 'ressources-stables'), ligne(1, 'actif-immobilise')],
  },
  {
    cle: 'actif-circulant-exploitation',
    section: 'STRUCTURE_FINANCIERE',
    libelle: "Actif circulant d'exploitation (b)",
    renvoi: RENVOI_B_NOTE_34,
    // BK = BA + BB + BG (bilan) : l'exploitation est BK sans le HAO (BA).
    termes: [bilan(1, 'BK', 'Total actif circulant.'), bilan(-1, 'BA', 'Actif circulant HAO, compté en (3).')],
  },
  {
    cle: 'passif-circulant-exploitation',
    section: 'STRUCTURE_FINANCIERE',
    libelle: "– Passif circulant d'exploitation (b)",
    renvoi: RENVOI_B_NOTE_34,
    // DP = DH + DI + DJ + DK + DM + DN : l'exploitation est DP sans DH.
    termes: [bilan(-1, 'DP', 'Total passif circulant.'), bilan(1, 'DH', 'Dettes circulantes HAO, comptées en (3).')],
  },
  {
    cle: 'besoin-financement-exploitation',
    section: 'STRUCTURE_FINANCIERE',
    libelle: "= BESOIN DE FINANCEMENT D'EXPLOITATION (2)",
    termes: [ligne(1, 'actif-circulant-exploitation'), ligne(1, 'passif-circulant-exploitation')],
  },
  { cle: 'actif-circulant-hao', section: 'STRUCTURE_FINANCIERE', libelle: 'Actif circulant HAO (b)', renvoi: RENVOI_B_NOTE_34, termes: [bilan(1, 'BA')] },
  { cle: 'passif-circulant-hao', section: 'STRUCTURE_FINANCIERE', libelle: '– Passif circulant HAO (b)', renvoi: RENVOI_B_NOTE_34, termes: [bilan(-1, 'DH')] },
  {
    cle: 'besoin-financement-hao',
    section: 'STRUCTURE_FINANCIERE',
    libelle: '= BESOIN DE FINANCEMENT HAO (3)',
    termes: [ligne(1, 'actif-circulant-hao'), ligne(1, 'passif-circulant-hao')],
  },
  {
    cle: 'besoin-financement-global',
    section: 'STRUCTURE_FINANCIERE',
    libelle: 'BESOIN DE FINANCEMENT GLOBAL (4)',
    formuleOfficielle: '(4) = (2) + (3)',
    termes: [ligne(1, 'besoin-financement-exploitation'), ligne(1, 'besoin-financement-hao')],
  },
  {
    cle: 'tresorerie-nette',
    section: 'STRUCTURE_FINANCIERE',
    libelle: 'TRÉSORERIE NETTE (5)',
    formuleOfficielle: '(5) = (1) – (4)',
    termes: [ligne(1, 'fonds-de-roulement'), ligne(-1, 'besoin-financement-global')],
  },
  {
    cle: 'controle-tresorerie-nette',
    section: 'STRUCTURE_FINANCIERE',
    libelle: 'CONTRÔLE : TRÉSORERIE NETTE = (TRÉSORERIE-ACTIF) – (TRÉSORERIE-PASSIF)',
    formuleOfficielle: 'BT – DT',
    controleDe: 'tresorerie-nette',
    // Anomalie n° 10 : ce contrôle ne peut pas boucler exactement, et l'écart
    // est CALCULABLE, donc à annoncer plutôt qu'à découvrir. Du bilan
    // AZ + BK + BT + BU = DF + DP + DT + DV avec DF = CP + DA + DB + DC, et de
    // (1) = CP + DA + DB – AZ, (4) = BK – DP, il vient
    // (5) = (BT – DT) + (BU – DV) – DC.
    renvoi:
      '[texte officiel] Ce contrôle ne boucle que si les provisions pour risques et charges (DC) sont nulles. ' +
      '« Dettes financières* » valant DA + DB, les ressources stables de la note excluent DC alors que le bilan ' +
      'l’inclut dans DF : la trésorerie nette (5) vaut (BT – DT) + (BU – DV) – DC. Le renvoi (b) élimine les ' +
      'écarts de conversion (BU, DV) ; l’écart résiduel est exactement DC. Écart STRUCTUREL du texte, ni un défaut ' +
      'du calcul ni une anomalie du dossier.',
    termes: [bilan(1, 'BT'), bilan(-1, 'DT')],
  },

  // ---- ANALYSE DE LA VARIATION DE LA TRÉSORERIE ----------------------------
  { cle: 'flux-operationnels', section: 'VARIATION_TRESORERIE', libelle: 'Flux de trésorerie des activités opérationnelles', termes: [flux(1, 'ZB')] },
  {
    cle: 'flux-investissement',
    section: 'VARIATION_TRESORERIE',
    libelle: "– Flux de trésorerie des activités d'investissement",
    formuleOfficielle: '– Flux de trésorerie des activités d’investissement [texte officiel]',
    // Anomalie n° 10 : le modèle du TFT (ch. 5 section 2) pose ZG = B + C + F
    // avec C déjà signé. Codé +ZC ; le libellé garde le « – » imprimé.
    termes: [flux(1, 'ZC', 'ZC est déjà signé (décaissements négatifs) : + ZC, selon le modèle du TFT et non le « – » de la note.')],
  },
  { cle: 'flux-financement', section: 'VARIATION_TRESORERIE', libelle: '+ Flux de trésorerie des activités de financement', termes: [flux(1, 'ZF')] },
  {
    cle: 'variation-tresorerie-nette',
    section: 'VARIATION_TRESORERIE',
    libelle: '= VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE',
    formuleOfficielle: 'ZG = B + C + F (modèle du TFT, ch. 5 section 2)',
    termes: [ligne(1, 'flux-operationnels'), ligne(1, 'flux-investissement'), ligne(1, 'flux-financement')],
  },

  // ---- ANALYSE DE LA VARIATION DE L'ENDETTEMENT FINANCIER NET --------------
  {
    cle: 'endettement-financier-brut',
    section: 'ENDETTEMENT_FINANCIER_NET',
    libelle: 'Endettement financier brut (Dettes financières* + Trésorerie-passif)',
    renvoi: RENVOI_DETTES_FINANCIERES_NOTE_34,
    termes: [bilan(1, 'DA'), bilan(1, 'DB'), bilan(1, 'DT')],
  },
  { cle: 'tresorerie-actif', section: 'ENDETTEMENT_FINANCIER_NET', libelle: '– Trésorerie-actif', termes: [bilan(-1, 'BT')] },
  {
    cle: 'endettement-financier-net',
    section: 'ENDETTEMENT_FINANCIER_NET',
    libelle: '= ENDETTEMENT FINANCIER NET',
    termes: [ligne(1, 'endettement-financier-brut'), ligne(1, 'tresorerie-actif')],
  },
];

// --------------------------------------------------------------------------
// Les notes
// --------------------------------------------------------------------------

/** Rubrique de note déclarative : un libellé, une saisie, rien à rattacher. */
/**
 * Rubrique renseignée hors comptabilité. La CLÉ vient en premier · c'est elle
 * qui ancre la saisie du dossier (`SaisieNote`), le libellé n'ancre rien : une
 * correction de transcription ne doit pas effacer un texte d'annexe rédigé par
 * le cabinet.
 */
const saisie = (cle: string, libelle: string, renvoi?: string) => ({ cle, libelle, saisie: true as const, renvoi });

export const NOTES_SYSCOHADA_3: SpecificationNote[] = [
  // ======================================================================
  // NOTE 28 · tableau de mouvements ventilé par nature
  // ======================================================================
  {
    code: '28',
    titre: 'PROVISIONS ET DÉPRÉCIATIONS INSCRITES AU BILAN',
    sensAccroissement: 'CREDIT',
    colonnes: COLONNES_NOTE_28,
    // Ch. 4 : XD, TJ, RL (« 3C & 28 »), TL, RN (« 3C & 28 »). Le renvoi de
    // XD (un solde) est transcrit tel quel, comme au compte de résultat.
    renvoyeeDepuis: ['XD', 'TJ', 'RL', 'TL', 'RN'],
    rubriques: [
      // Premier bloc · CM = « 15 », DC = « 19 » (ch. 7 passif) ; 29 = colonne
      // « amortissements et dépréciations » de AE à AS (ch. 7 actif).
      {
        libelle: 'Provisions réglementées',
        comptes: ['15'],
        // Anomalie n° 13 : le libellé de la ligne est plus étroit que le compte.
        renvoi:
          '[texte officiel] Le ch. 7 pose CM = « 15 » en bloc et le compte 15 s’intitule « Provisions réglementées ' +
          'ET FONDS ASSIMILÉS » : le 153 « Fonds réglementés » (1531, 1532) n’est pas une provision, mais il est au ' +
          'bilan et n’a pas d’autre note. Colonnes HAO conformes au Titre VII COMPTE 15 (« exclusivement par ' +
          'Dotations H.A.O. », repris « exclusivement par Reprises H.A.O. »).',
      },
      {
        libelle: 'Provisions financières pour risques et charges',
        comptes: ['19'],
        // Anomalie n° 14 : un compte d'actif logé dans le 19 par le ch. 7.
        renvoi:
          '[texte officiel] Le ch. 7 pose DC = « 19 » en bloc, or le 1962 « Actif du régime de retraite » est ' +
          'DÉBITEUR (Titre VII COMPTE 19 : « la prime versée est enregistrée au débit du 1962 par le crédit d’un ' +
          'compte de trésorerie »). Dans ce tableau au crédit ses primes versées ressortent en diminution, avec une ' +
          'contrepartie de classe 5 : elles tombent en part non ventilée par nature, ce qui est la lacune du texte, ' +
          'pas celle du dossier.',
      },
      { libelle: 'Dépréciation des immobilisations', comptes: ['29'] },
      { libelle: 'TOTAL : DOTATIONS', totalDeRubriques: [0, 1, 2] }, // anomalie n° 2
      // Second bloc · numérotation corrompue, anomalie n° 1.
      { libelle: 'Dépréciations des stocks', comptes: ['39'] }, // BB
      // 498 (BA) ; 4998 sans ligne, DH → ici (anomalie n° 3).
      {
        libelle: 'Dépréciations actif circulant HAO',
        comptes: ['498', '4998'],
        renvoi:
          '[texte officiel] Le 4998 « Provisions pour risques à court terme sur opérations HAO » est une PROVISION ' +
          'DE PASSIF que le ch. 7 sort du 499 pour le porter en DH ; la note n’a pas d’autre ligne HAO dans ce bloc, ' +
          'il est donc rattaché ici, sur une ligne de dépréciation d’actif. Colonnes HAO conformes (dotation 839, ' +
          'reprise 849 · Titre VII COMPTE 84). Le moteur Python du skill l’exclut de la note (« 499!4998 ») : le ' +
          'laisser dehors ferait diverger la note du bilan.',
      },
      { libelle: 'Dépréciations fournisseurs', comptes: ['490'] }, // BH · une seule fois (anomalie n° 1)
      { libelle: 'Dépréciations clients', comptes: ['491'] }, // BI
      { libelle: 'Dépréciations autres créances', comptes: ['492', '493', '494', '495', '496', '497'] }, // BJ
      { libelle: 'Dépréciations titres de placement', comptes: ['590'] }, // BQ
      { libelle: 'Dépréciations valeurs à encaisser', comptes: ['591'] }, // BR
      { libelle: 'Dépréciations disponibilité', comptes: ['592', '593', '594'] }, // BS · 594 : anomalie n° 3
      // DN = « 499 (sauf 4998), 599 » (ch. 7) : 4991 exploitation ; 4997 et
      // 599 à caractère financier (anomalie n° 3).
      { libelle: 'Dépréciations et provisions pour risques à court termes exploitation', comptes: ['4991'] },
      {
        libelle: 'Dépréciations et provisions pour risques à court termes à caractère financier',
        comptes: ['4997', '599'],
        // Anomalie n° 3 : le texte officiel se contredit sur la nature du 4997.
        renvoi:
          '[texte officiel] Le 4997 est rangé au financier d’après le Titre VIII ch. 22 § 2.3, qui écrit ' +
          '« risques à court terme : débit 6791 Charges pour provisions sur risques financiers · crédit 4997 ». Le ' +
          'Titre VII COMPTE 49, Fonctionnement, dit l’inverse pour le compte 49 entier : ses seules contreparties y ' +
          'sont 659 et 839, et « les dépréciations et les provisions pour risques à court terme correspondent à des ' +
          'charges d’exploitation ou H.A.O. selon leur nature ». Contradiction signalée, non tranchée en silence. ' +
          'Deux suites : la ventilation B et C suit la CONTREPARTIE RÉELLE de l’écriture, donc un dossier qui ' +
          'crédite le 4997 par le débit du 659 verra sa dotation en colonne « d’exploitation » sur cette ligne ; et ' +
          'le moteur Python du skill range le 4997 avec le 4991 en exploitation, ne laissant ici que le 599.',
      },
      {
        libelle: 'TOTAL : CHARGES POUR DÉPRÉCIATIONS ET PROVISIONS À COURT TERME',
        totalDeRubriques: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      },
      { libelle: 'TOTAL PROVISIONS ET DÉPRÉCIATIONS', totalDeRubriques: [3, 14] },
    ],
    renvoiOfficiel:
      '[texte officiel] La numérotation du second bloc est corrompue : le 5 et le 7 sont employés deux fois chacun, ' +
      'et « Dépréciations fournisseurs » apparaît deux fois (en 6 et en 5). Transcrit sans renuméroter, la ligne ' +
      'dupliquée n’étant portée qu’une fois. Le sous-total intermédiaire est intitulé « TOTAL : DOTATIONS » alors ' +
      'qu’il ne totalise que les trois premières lignes.',
    commentaire:
      'indiquer les événements et circonstances qui ont conduit à la constitution et à la reprise de la ' +
      'dépréciation et de la provision.',
  },

  // ======================================================================
  // NOTE 29 · charges et revenus financiers · RM = « 67 », TK = « 77 »
  // ======================================================================
  {
    code: '29',
    titre: 'CHARGES ET REVENUS FINANCIERS',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['TK', 'RM'],
    rubriques: [
      // Frais financiers · Titre VII COMPTE 67, divisionnaire par ligne.
      { libelle: 'Intérêts des emprunts', comptes: ['671'] },
      // 672 reste dans les flux opérationnels du TFT (ch. 5), contrairement
      // au remboursement de la dette 17 : la note le montre comme un frais.
      { libelle: 'Intérêts dans loyers de locations acquisition', comptes: ['672'] },
      { libelle: 'Escomptes accordés', comptes: ['673'] },
      { libelle: 'Autres intérêts', comptes: ['674'] },
      { libelle: 'Escomptes des effets de commerce', comptes: ['675'] },
      { libelle: 'Pertes de change', comptes: ['676'] },
      { libelle: 'Pertes sur cessions de titres de placement', comptes: ['6771'] },
      { libelle: "Malis provenant d'attribution gratuite d'actions au personnel salarié et aux dirigeants", comptes: ['6772'] },
      { libelle: 'Pertes sur risques financiers', comptes: ['678'] },
      {
        libelle: 'Charges pour dépréciation et provisions à court terme à caractère financier (voir note 28)',
        comptes: ['679'],
        renvoi: '28',
      },
      { libelle: 'SOUS TOTAL : FRAIS FINANCIERS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      // Revenus financiers · Titre VII COMPTE 77 ; 775 sans ligne → 771
      // (anomalie n° 4).
      { libelle: 'Intérêts de prêts et créances diverses', comptes: ['771', '775'], natureCreditrice: true },
      { libelle: 'Revenus de participations', comptes: ['772'], natureCreditrice: true },
      { libelle: 'Escomptes obtenus', comptes: ['773'], natureCreditrice: true },
      { libelle: 'Revenus de placement', comptes: ['774'], natureCreditrice: true },
      { libelle: 'Gains de change', comptes: ['776'], natureCreditrice: true },
      { libelle: 'Gains sur cessions de titres de placement', comptes: ['777'], natureCreditrice: true },
      { libelle: 'Gains sur risques financiers', comptes: ['778'], natureCreditrice: true },
      {
        libelle: 'Reprises de charges pour dépréciation et provisions à court terme à caractère financier (voir note 28)',
        comptes: ['779'],
        natureCreditrice: true,
        renvoi: '28',
      },
      { libelle: 'SOUS TOTAL : REVENUS FINANCIERS', totalDeRubriques: [11, 12, 13, 14, 15, 16, 17, 18] },
      // Anomalie n° 7 : TOTAL = revenus − frais.
      { libelle: 'TOTAL', totalDeRubriques: [19], moinsRubriques: [10] },
    ],
    commentaire:
      'commenter toute variation significative ; en cas de paiement à terme, indiquer le montant des intérêts ' +
      'non comptabilisés.',
  },

  // ======================================================================
  // NOTE 30 · autres charges et produits HAO · RP = « 83, 85 », RQ = « 87 »,
  // TO = « 84, 86, 88 » (ch. 7)
  // ======================================================================
  {
    code: '30',
    titre: 'AUTRES CHARGES ET PRODUITS HAO',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['TO', 'RP', 'RQ'],
    rubriques: [
      // Autres charges HAO · Titre VII COMPTE 83 ; 833 et 837 sans ligne →
      // ici (anomalie n° 6).
      {
        libelle: 'Charges HAO constatées (1)',
        comptes: ['831', '833', '837'],
        renvoi: '(1) à détailler',
      },
      { libelle: 'Pertes sur créances HAO', comptes: ['834'] },
      { libelle: 'Dons et libéralités accordés', comptes: ['835'] },
      { libelle: 'Abandons de créances consentis', comptes: ['836'] },
      { libelle: 'Charges provisionnées HAO', comptes: ['839'] },
      { libelle: 'Dotations hors activités ordinaires', comptes: ['85'] },
      // Anomalie n° 5 : 87 est une répartition du résultat (RQ), 88 un
      // produit (TO). Transcrits à la place que la note leur donne.
      { libelle: 'Participation des travailleurs', comptes: ['87'] },
      {
        libelle: "Subventions d'équilibre",
        comptes: ['88'],
        presenterEnNegatif: true,
        renvoi:
          '[texte officiel] produit (compte 88, poste TO) rangé par la note parmi les charges HAO ; présenté en ' +
          'négatif dans ce bloc, pour que le sous-total reste le solde réel du bloc et non une charge gonflée d’un ' +
          'produit. Divergence assumée avec le moteur Python du skill, qui DÉPLACE le 88 dans le bloc des produits ' +
          '(sous-total « B31 = SUM(B22:B30) ») : le TOTAL est le même dans les deux lectures (TO – RP – RQ), seuls ' +
          'les deux sous-totaux diffèrent, et la ligne reste ici à la place que le texte lui donne.',
      },
      { libelle: 'SOUS TOTAL : AUTRES CHARGES HAO', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      // Autres produits HAO · Titre VII COMPTE 84 ; 843, 844, 847 sans
      // ligne → ici (anomalie n° 6).
      {
        libelle: 'Produits HAO constatés (1)',
        comptes: ['841', '843', '844', '847'],
        natureCreditrice: true,
        renvoi: '(1) à détailler',
      },
      { libelle: 'Dons et libéralités obtenus', comptes: ['845'], natureCreditrice: true },
      { libelle: 'Abandons de créances obtenus', comptes: ['846'], natureCreditrice: true },
      { libelle: 'Transferts de charges HAO', comptes: ['848'], natureCreditrice: true },
      {
        libelle: 'Reprises des charges pour dépréciations et provisions à court terme HAO',
        comptes: ['849'],
        natureCreditrice: true,
      },
      { libelle: 'Reprises hors activités ordinaires', comptes: ['86'], natureCreditrice: true },
      { libelle: 'SOUS TOTAL : AUTRES PRODUITS HAO', totalDeRubriques: [9, 10, 11, 12, 13, 14] },
      // Anomalie n° 7 : TOTAL = produits − charges.
      { libelle: 'TOTAL', totalDeRubriques: [15], moinsRubriques: [8] },
    ],
    renvoiOfficiel:
      '(1) à détailler. [texte officiel] Les subventions d’équilibre (compte 88) sont un produit ; la note les ' +
      'range dans les « autres charges HAO ». De même la participation des travailleurs (compte 87) est une ' +
      'répartition du résultat, portée par le poste RQ distinct du poste RP.',
    commentaire: 'commenter toute variation significative.',
  },

  // ======================================================================
  // NOTE 31 · cinq derniers exercices · hors balance (anomalie n° 8)
  // ======================================================================
  {
    code: '31',
    titre: 'RÉPARTITION DU RÉSULTAT ET AUTRES ÉLÉMENTS CARACTÉRISTIQUES DES CINQ DERNIERS EXERCICES',
    horsBalance: true,
    colonnes: COLONNES_CINQ_EXERCICES,
    // Chaque renvoi appelé par une rubrique porte son TEXTE COMPLET et non sa
    // seule marque : l'export met `renvoi` en commentaire de cellule, où un
    // « (²) » isolé n'apprendrait rien au lecteur. Le bas de tableau
    // (`renvoiOfficiel`) les reprend tous, dans l'ordre du texte.
    rubriques: [
      saisie(
        'structure-du-capital-a-la-cloture-de-l-exercice',
        "STRUCTURE DU CAPITAL À LA CLÔTURE DE L'EXERCICE (²)",
        '(²) Indication, en cas de libération partielle du capital, du montant du capital non appelé.',
      ),
      saisie('capital-social', 'Capital social'),
      saisie('actions-ordinaires', 'Actions ordinaires'),
      saisie('actions-a-dividendes-prioritaires-a-d-p-sans-dro', 'Actions à dividendes prioritaires (A.D.P) sans droit de vote'),
      saisie('actions-nouvelles-a-emettre-par-conversion-d-obl', "Actions nouvelles à émettre : par conversion d'obligations"),
      saisie('actions-nouvelles-a-emettre-par-exercice-de-droi', 'Actions nouvelles à émettre : par exercice de droits de souscription'),
      saisie(
        'operations-et-resultats-de-l-exercice',
        "OPÉRATIONS ET RÉSULTATS DE L'EXERCICE (³)",
        '(³) Les éléments de cette rubrique sont ceux figurant au compte de résultat.',
      ),
      saisie('chiffre-d-affaires-hors-taxes', "Chiffre d'affaires hors taxes"),
      saisie('resultat-des-activites-ordinaires-r-a-o-hors-dot', 'Résultat des activités ordinaires (R.A.O) hors dotations et reprises (exploitation et financières)'),
      saisie('participation-des-travailleurs-aux-benefices', 'Participation des travailleurs aux bénéfices'),
      saisie('impot-sur-le-resultat', 'Impôt sur le résultat'),
      saisie('resultat-net', 'Résultat net (⁴)', '(⁴) Le résultat, lorsqu’il est négatif, doit être mis entre parenthèses.'),
      saisie('resultat-et-dividende-distribues', 'RÉSULTAT ET DIVIDENDE DISTRIBUÉS'),
      saisie('resultat-distribue', 'Résultat distribué (⁵)', '(⁵) L’exercice N correspond au dividende proposé du dernier exercice.'),
      saisie('dividende-attribue-a-chaque-action', 'Dividende attribué à chaque action'),
      saisie('personnel-et-politique-salariale', 'PERSONNEL ET POLITIQUE SALARIALE'),
      saisie('effectif-moyen-des-travailleurs-au-cours-de-l-ex', "Effectif moyen des travailleurs au cours de l'exercice (⁶)", '(⁶) Personnel propre.'),
      saisie('effectif-moyen-de-personnel-exterieur', 'Effectif moyen de personnel extérieur'),
      saisie('masse-salariale-distribuee-au-cours-de-l-exercic', "Masse salariale distribuée au cours de l'exercice (⁷)", '(⁷) Total des comptes 661, 662, 663.'),
      saisie(
        'avantages-sociaux-verses-au-cours-de-l-exercice',
        "Avantages sociaux versés au cours de l'exercice (⁸) [Sécurité sociale, œuvres sociales]",
        '(⁸) Total des comptes 664, 668.',
      ),
      saisie('personnel-exterieur-facture-a-l-entite', "Personnel extérieur facturé à l'entité (⁹)", '(⁹) Compte 667.'),
    ],
    renvoiOfficiel:
      '(¹) Y compris l’exercice dont les états financiers sont soumis à l’approbation de l’Assemblée. ' +
      '(²) Indication, en cas de libération partielle du capital, du montant du capital non appelé. ' +
      '(³) Les éléments de cette rubrique sont ceux figurant au compte de résultat. ' +
      '(⁴) Le résultat, lorsqu’il est négatif, doit être mis entre parenthèses. ' +
      '(⁵) L’exercice N correspond au dividende proposé du dernier exercice. ' +
      '(⁶) Personnel propre. (⁷) Total des comptes 661, 662, 663. (⁸) Total des comptes 664, 668. (⁹) Compte 667.',
  },

  // ======================================================================
  // NOTES 32 et 33 · quantités par produit · hors balance (anomalie n° 9)
  // ======================================================================
  {
    code: '32',
    titre: "PRODUCTION DE L'EXERCICE",
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'DÉSIGNATION DU PRODUIT' },
      { type: 'LIBRE' as const, libelle: 'UNITÉ CHOISIE' },
      { type: 'LIBRE' as const, libelle: 'PRODUCTION QUANTITÉ' },
      ...quantiteValeur('PRODUCTION VENDUE DANS LE PAYS'),
      ...quantiteValeur("PRODUCTION VENDUE DANS LES AUTRES PAYS DE L'OHADA"),
      ...quantiteValeur('PRODUCTION VENDUE HORS OHADA'),
      ...quantiteValeur('PRODUCTION IMMOBILISÉE'),
      ...quantiteValeur("STOCK OUVERTURE DE L'EXERCICE"),
      ...quantiteValeur("STOCK CLÔTURE DE L'EXERCICE"),
    ],
    // La maquette est une grille vide par produit ; seules ses deux lignes
    // finales sont nommées.
    rubriques: [saisie('non-ventile', 'NON VENTILÉ'), saisie('total', 'TOTAL')],
  },
  {
    code: '33',
    titre: 'ACHATS DESTINÉS À LA PRODUCTION',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'DÉSIGNATION DES MATIÈRES ET PRODUITS' },
      { type: 'LIBRE' as const, libelle: 'UNITÉ CHOISIE' },
      ...quantiteValeur("ACHATS EFFECTUÉS AU COURS DE L'EXERCICE · PRODUITS DE L'ÉTAT · achetés dans l'État"),
      ...quantiteValeur("ACHATS EFFECTUÉS AU COURS DE L'EXERCICE · PRODUITS IMPORTÉS · achetés hors de l'État"),
      // Troisième couple imprimé sans intitulé d'origine (anomalie n° 9).
      ...quantiteValeur("ACHATS EFFECTUÉS AU COURS DE L'EXERCICE · [sans intitulé, texte officiel]"),
      { type: 'LIBRE' as const, libelle: 'VARIATION DES STOCKS (en valeur)' },
    ],
    rubriques: [saisie('non-ventiles', 'NON VENTILÉS'), saisie('total', 'TOTAL')],
    renvoiOfficiel:
      '[texte officiel] Les en-têtes des notes 32 et 33 sont désalignés : la note 33 annonce trois couples ' +
      'Quantité/Valeur pour deux origines déclarées (« dans l’État » / « hors de l’État »).',
  },

  // ======================================================================
  // NOTE 34 · fiche de synthèse · calculée par le service des états, hors
  // balance pour le moteur des notes (anomalie n° 10, FICHE_SYNTHESE_SYSCOHADA)
  // ======================================================================
  {
    code: '34',
    titre: 'FICHE DE SYNTHÈSE DES PRINCIPAUX INDICATEURS FINANCIERS',
    // Servie par le service des états financiers SYSCOHADA depuis
    // `FICHE_SYNTHESE_SYSCOHADA` (bilan, compte de résultat, tableau des
    // flux) : le moteur des notes ne lit pas les états, il ne doit rien
    // inventer ici.
    horsBalance: true,
    colonnes: COLONNES_N_N1_POURCENT,
    // Le marqueur `horsMaquette` ne survivrait pas à ce map : il est reversé
    // dans le `renvoi`, que l'export rend en commentaire de cellule. Sans
    // quoi la ligne ajoutée à la CAFG s'afficherait comme les autres, sans
    // rien qui dise qu'elle n'est pas dans la maquette officielle.
    rubriques: FICHE_SYNTHESE_SYSCOHADA.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      saisie: true as const,
      renvoi: l.horsMaquette ? `${MARQUE_HORS_MAQUETTE_NOTE_34}${l.renvoi ? ` ${l.renvoi}` : ''}` : l.renvoi,
    })),
    renvoiOfficiel:
      'EN MILLIERS DE FRANCS. (a) Résultat d’exploitation après impôt théorique sur le bénéfice. (b) Les écarts de ' +
      'conversion doivent être éliminés afin de ramener les créances et les dettes concernées à leur valeur ' +
      'initiale. Dettes financières* = emprunts et dettes financières diverses + dettes de location acquisition ' +
      '(DA + DB). [texte officiel] La variation de la trésorerie nette est écrite « – Flux d’investissement » alors ' +
      'que le modèle du TFT pose ZG = B + C + F avec C déjà signé.',
  },

  // ======================================================================
  // NOTE 35 · informations sociales, environnementales et sociétales ·
  // déclarative (anomalie n° 11 sur le seuil)
  // ======================================================================
  {
    code: '35',
    titre: 'LISTE DES INFORMATIONS SOCIALES, ENVIRONNEMENTALES ET SOCIÉTALES À FOURNIR',
    horsBalance: true,
    colonnes: COLONNE_INFORMATIONS,
    rubriques: [
      saisie('informations-sociales', 'INFORMATIONS SOCIALES'),
      saisie('emploi-effectif-total-et-repartition-des-salarie', 'Emploi : effectif total et répartition des salariés par sexe, âge et zone géographique'),
      saisie('emploi-embauches-et-licenciements', 'Emploi : embauches et licenciements'),
      saisie('emploi-remunerations-et-leur-evolution', 'Emploi : rémunérations et leur évolution'),
      saisie('relations-sociales-organisation-du-dialogue-soci', 'Relations sociales : organisation du dialogue social'),
      saisie('relations-sociales-bilan-des-accords-collectifs', 'Relations sociales : bilan des accords collectifs'),
      saisie('sante-et-securite-conditions-de-sante-et-de-secu', 'Santé et sécurité : conditions de santé et de sécurité au travail'),
      saisie(
        'sante-et-securite-bilan-des-accords-signes-avec',
        'Santé et sécurité : bilan des accords signés avec les organisations syndicales ou les représentants du ' +
          'personnel en matière de santé et de sécurité au travail',
      ),
      saisie('formation-politiques-mises-en-uvre-en-matiere-de', 'Formation : politiques mises en œuvre en matière de formation'),
      saisie('formation-nombre-total-d-heures-de-formation', "Formation : nombre total d'heures de formation"),
      saisie('egalite-de-traitement-mesures-prises-en-faveur-d', "Égalité de traitement : mesures prises en faveur de l'égalité entre les femmes et les hommes"),
      saisie('egalite-de-traitement-mesures-prises-en-faveur-d-2', "Égalité de traitement : mesures prises en faveur de l'emploi et de l'insertion des personnes handicapées"),
      saisie('informations-environnementales', 'INFORMATIONS ENVIRONNEMENTALES'),
      saisie(
        'politique-generale-en-matiere-environnementale-o',
        'Politique générale en matière environnementale : organisation de la société pour prendre en compte les ' +
          "questions environnementales et, le cas échéant, les démarches d'évaluation ou de certification",
      ),
      saisie(
        'politique-generale-en-matiere-environnementale-a',
        "Politique générale en matière environnementale : actions de formation et d'information des salariés " +
          "menées en matière de protection de l'environnement",
      ),
      saisie(
        'politique-generale-en-matiere-environnementale-m',
        'Politique générale en matière environnementale : moyens consacrés à la prévention des risques ' +
          'environnementaux et des pollutions',
      ),
      saisie(
        'pollution-et-gestion-des-dechets-mesures-de-prev',
        "Pollution et gestion des déchets : mesures de prévention, de réduction ou de réparation de rejets dans l'air, " +
          "l'eau et le sol affectant gravement l'environnement",
      ),
      saisie('pollution-et-gestion-des-dechets-mesures-de-prev-2', "Pollution et gestion des déchets : mesures de prévention, de recyclage et d'élimination des déchets"),
      saisie(
        'pollution-et-gestion-des-dechets-prise-en-compte',
        'Pollution et gestion des déchets : prise en compte des nuisances sonores et de toute autre forme de ' +
          'pollution spécifique à une activité',
      ),
      saisie(
        'utilisation-durable-des-ressources-consommation',
        "Utilisation durable des ressources : consommation d'eau et approvisionnement en eau en fonction des " +
          'contraintes locales',
      ),
      saisie(
        'utilisation-durable-des-ressources-consommation-2',
        'Utilisation durable des ressources : consommation de matières premières et mesures prises pour améliorer ' +
          "l'efficacité dans leur utilisation",
      ),
      saisie(
        'utilisation-durable-des-ressources-consommation-3',
        "Utilisation durable des ressources : consommation d'énergie, mesures prises pour améliorer l'efficacité " +
          'énergétique et recours aux énergies renouvelables',
      ),
      saisie('changement-climatique-rejets-de-gaz-a-effet-de-s', 'Changement climatique : rejets de gaz à effet de serre'),
      saisie('protection-de-la-biodiversite-mesures-prises-pou', 'Protection de la biodiversité : mesures prises pour préserver ou développer la biodiversité'),
      saisie('informations-relatives-aux-engagements-societaux', 'INFORMATIONS RELATIVES AUX ENGAGEMENTS SOCIÉTAUX EN FAVEUR DU DÉVELOPPEMENT DURABLE'),
      saisie(
        'impact-territorial-economique-et-social-de-l-act',
        "Impact territorial, économique et social de l'activité de la société : en matière d'emploi et de " +
          'développement régional',
      ),
      saisie('impact-territorial-economique-et-social-de-l-act-2', "Impact territorial, économique et social de l'activité de la société : sur les populations riveraines ou locales"),
      saisie(
        'relations-entretenues-avec-les-personnes-ou-les',
        "Relations entretenues avec les personnes ou les organisations intéressées par l'activité de la société " +
          "(associations d'insertion, établissements d'enseignement…) : conditions du dialogue avec ces personnes ou " +
          'organisations',
      ),
      saisie(
        'relations-entretenues-avec-les-personnes-ou-les-2',
        "Relations entretenues avec les personnes ou les organisations intéressées par l'activité de la société : " +
          'actions de partenariat ou de mécénat',
      ),
      saisie('sous-traitance-et-fournisseurs-prise-en-compte-d', "Sous-traitance et fournisseurs : prise en compte dans la politique d'achat des enjeux sociaux et environnementaux"),
    ],
    renvoiOfficiel:
      `Note obligatoire pour les entités ayant un effectif de plus de ${SEUILS_NOTE_35.effectifNote35TitreIX} salariés. ` +
      `[texte officiel] Le Titre VIII ch. 30 § 1.4.3 fixe la même obligation à plus de ${SEUILS_NOTE_35.effectifTitreVIIIChapitre30} ` +
      'salariés : contradiction entre les deux titres, non tranchée ici.',
  },

  // ======================================================================
  // NOTE 36 · tables des codes · nomenclature (constantes exportées ci-dessus)
  // ======================================================================
  {
    code: '36',
    titre: 'TABLES DES CODES',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Code' },
      { type: 'LIBRE' as const, libelle: 'Libellé' },
    ],
    // Fiche R2 : ZK forme juridique, ZL régime fiscal, ZM pays du siège ;
    // fiche R1 : ZE code activité principale. Le renvoi (¹) de la fiche R2
    // dit « NOTE 34 » [texte officiel], anomalie n° 12.
    renvoyeeDepuis: ['ZK', 'ZL', 'ZM', 'ZE'],
    rubriques: [
      saisie('1-code-forme-juridique-1', '1 · Code forme juridique (1)', RENVOI_1_FORME_JURIDIQUE_SYSCOHADA),
      saisie('2-code-regime-fiscal', '2 · Code régime fiscal'),
      saisie('3-code-pays-du-siege-social-2', '3 · Code pays du siège social (2)', `(2) Pays OHADA : Congo RDC = ${CODE_PAYS_OHADA_RDC}.`),
      saisie('codes-activites-economiques-44-groupes-nomenclat', 'Codes activités économiques (44 groupes, nomenclature à six chiffres)'),
    ],
    renvoiOfficiel:
      '[texte officiel] La table 3 est lacunaire : elle saute de 00 à 21, puis de 23 à 39, de 41 à 49, de 50 à 99 ; ' +
      'les codes intermédiaires ne sont pas définis. Le renvoi (¹) de la fiche R2 désigne la NOTE 34 alors que les ' +
      'tables des codes sont la NOTE 36.',
  },
];

/**
 * Codes officiels de cette tranche, dans l'ordre de la liste du ch. 6
 * section 2. Exporté pour que le spec compare la transcription à la liste
 * plutôt qu'à elle-même.
 */
export const CODES_NOTES_SYSCOHADA_3 = ['28', '29', '30', '31', '32', '33', '34', '35', '36'];
