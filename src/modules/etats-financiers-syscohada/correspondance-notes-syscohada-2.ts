import { SpecificationNote } from '../notes-annexes/note-annexe.types';

/**
 * NOTES ANNEXES du SYSCOHADA révisé · Système normal (AUDCIF art. 11),
 * DEUXIÈME TRANCHE : notes 16A, 16B, 16B bis, 16C, 17, 18, 19, 20, 21, 22,
 * 23, 24, 25, 26, 27A et 27B.
 *
 * Sources, toutes LUES au moment de la transcription (règle §1 de CLAUDE.md,
 * jamais de mémoire, jamais complété depuis le SYCEBNL) :
 *  - AUDCIF Titre IX ch. 6 « Notes annexes du Système normal », section 2
 *    (liste officielle et maquette des NOTE 1 à NOTE 36) · skill
 *    `audcif-acte-uniforme`, references/titre-9-ch6-7-notes-annexes-
 *    correspondance.md, lignes 324 à 512 pour cette tranche : titres,
 *    colonnes, rubriques dans l'ordre, renvois et commentaires y sont
 *    transcrits mot pour mot ;
 *  - AUDCIF Titre IX ch. 7 « Tableau de correspondance Postes/Comptes »
 *    (même fichier, lignes 764 à 917 : bilan passif DA à DR, bilan actif BH,
 *    compte de résultat TA à RK et leurs « Clés de lecture ») · c'est LUI qui
 *    définit chaque poste qu'une note documente ; quand une note et le ch. 7
 *    se contredisent, le ch. 7 tranche ;
 *  - AUDCIF Titre IX ch. 3 section 2 (modèle de bilan, colonne « Note ») et
 *    ch. 4 section 2 (modèle du compte de résultat, colonne « Note ») ·
 *    references/titre-9-ch1-5-bilan-resultat-flux.md, d'où `renvoyeeDepuis` ;
 *  - AUDCIF Titre VII, fiches COMPTE 16, 17, 18, 19, 42, 43, 44, 45, 46, 47,
 *    56, 60, 61, 62/63, 64, 65, 659, 66, 70, 71, 72, 75 · pour arbitrer
 *    chaque rattachement discuté ci-dessous ;
 *  - le plan de comptes SYSCOHADA (skill `syscohada`, comptes/references/
 *    plan-comptes.tsv et ses renvois [2], [3], [5] à [8] dans
 *    regles-et-notes.md, semé par `compte-seed-syscohada.ts`) · chaque
 *    préfixe cité existe dans ce semis, vérifié par le spec voisin ;
 *  - en AIDE seulement, le moteur Python du skill `syscohada`
 *    (liasse/references/notes-ohada.md, liasse/scripts/notes_sn.py) ·
 *    chacune de ses affectations a été revérifiée au plan et au ch. 7, et
 *    chaque divergence est signalée dans la section ANOMALIES.
 *
 * Même MOTEUR déclaratif que les notes SYCEBNL (`note-annexe.types.ts`) et
 * même forme d'objet que la première tranche
 * (`correspondance-notes-syscohada-1.ts`), qui pose les règles communes ·
 * elles ne sont pas répétées ici, seulement rappelées :
 *
 * 1. une rubrique n'est rattachée que lorsque le plan la détermine SANS
 *    jugement (le libellé de la rubrique est celui d'un compte ou d'une
 *    famille de comptes du plan) ;
 * 2. une rubrique que le plan ne détermine pas porte `subdivisionAttendue`
 *    et une `cle` ; aucune rubrique de cette tranche n'en porte, les notes
 *    16A à 27A descendant au divisionnaire du plan. « Descendre au
 *    divisionnaire » n'est pas « ne demander aucun arbitrage » : la note 18
 *    « caisse de retraite » en a demandé un (anomalie n° 8), tranché PAR LE
 *    PLAN et non par la ressemblance de libellé, donc sans attente de
 *    sous-comptes du dossier ;
 * 3. une rubrique hors comptabilité (hypothèses actuarielles, actifs et
 *    passifs éventuels, effectifs) est en `saisie`, et une note qui n'a que
 *    cela est `horsBalance` ;
 * 4. un compte que le ch. 7 met dans le poste documenté par la note, mais
 *    auquel la note ne donne AUCUNE ligne, est rangé dans la ligne
 *    résiduelle de la note et SIGNALÉ. Le laisser dehors ferait diverger la
 *    note de son poste, et c'est ce recoupement (note ↔ poste) que le spec
 *    vérifie compte par compte.
 *
 * ## Convention de signe
 *
 * Une rubrique de dette ou de produit porte `natureCreditrice` (présentée en
 * positif SANS filtre : un compte momentanément débiteur ressort en négatif,
 * où il se voit). Les comptes de tiers que le ch. 7 éclate PAR LE SENS DU
 * SOLDE portent `sens: 'CREDITEUR'`, qui filtre ligne de balance par ligne
 * de balance, jamais sur l'agrégat (Titre VII COMPTE 47 : « aucune
 * compensation n'est en principe admise »). Les qualificatifs du ch. 7 sont
 * cités ICI EN ENTIER, parce qu'une citation tronquée se relit comme une
 * règle : « Soldes créditeurs : 42, 43, 44 » pour DK ; « Soldes créditeurs :
 * 185, 45, 46, 47 (sauf 479) » pour DM ; « Soldes créditeurs : 52, 53, 561,
 * 566 » pour DR. Le filtre n'est posé que sur 42/43/44, 185/45/46/47 et
 * 52/53, PAS sur 561 et 566, qui n'ont aucun poste d'accueil débiteur ·
 * écart avec la lettre du ch. 7, anomalie n° 27. Le solde débiteur des
 * comptes filtrés relève des notes de créances de la première tranche
 * (note 8), jamais d'ici : c'est ce que le spec anti double comptage
 * vérifie sur l'union des deux tranches. Une rubrique de charge se lit au
 * débit (défaut du moteur) ; un compte de RRR obtenus (solde créditeur) y
 * ressort de lui-même en négatif, comme la maquette qui le retranche.
 *
 * ## Colonnes
 *
 * Les notes 16A, 18 et 19 portent « Variation en valeur absolue » ET
 * « Variation en % » ; les notes 17 et 20 à 27A n'ont que « Variation
 * en % » ; les notes 16A, 17, 18 et 19 ajoutent les trois échéances de
 * dettes. Reproduit note par note, sans uniformiser.
 *
 * « Variation en valeur absolue » est typée `VARIATION_VALEUR` (N moins
 * N-1, signée), et NON `VARIATION_VALEUR_ABSOLUE` (|N − N-1|) : arbitrage
 * pris ici, contre la lecture littérale, parce que deux autres maquettes du
 * ch. 6 le tranchent. La NOTE 14 « Primes et réserves » n'a QUE les
 * colonnes « Année N · Année N-1 · Variation en valeur absolue », sans
 * colonne « en % » : « absolue » y oppose le MONTANT au TAUX, il n'y a rien
 * d'autre à quoi l'opposer. Et le premier tableau de la NOTE 12 met
 * « Variation en valeur absolue » en regard de « Cours UML Année
 * acquisition » et « Cours UML 31/12 » : une variation de cours prise en
 * |.| perdrait le sens même de l'écart de conversion, actif ou passif.
 * Conséquence assumée : la première tranche lit ses notes 8 et 14 en
 * `VARIATION_VALEUR_ABSOLUE`, d'où un écart de lecture d'une tranche à
 * l'autre pour un même libellé de colonne · anomalie n° 33, à aligner du
 * côté de la première tranche, qui n'est pas modifiée d'ici.
 *
 * ## ANOMALIES du texte officiel et choix de rattachement, tous signalés
 *
 * Aucune n'est corrigée en silence (CLAUDE.md §9). Numérotation propre à
 * cette tranche, citée depuis les rubriques et le spec.
 *
 * 1. **NOTE 16B et NOTE 16B bis portent le même intitulé** « Engagements de
 *    retraite et avantages assimilés (méthode actuarielle) » [texte
 *    officiel]. Reproduit tel quel ; les deux notes se distinguent par leur
 *    code et par leurs sous-tableaux.
 *
 * 2. **NOTE 16A « provisions de droits à déduction »** · le plan n'a que le
 *    1985 « Provisions pour droits à réduction ou avantage en nature (chèques
 *    cadeau, cartes de fidélité…) », à la même position dans la liste des
 *    198x (Titre VII COMPTE 19). « déduction » pour « réduction » est lu
 *    comme une coquille de la maquette ; rattaché à 1985, libellé de la
 *    note conservé.
 *
 * 3. **NOTE 16A « actif du régime de retraite » (1962)** est un compte de
 *    sens DÉBITEUR intercalé dans les provisions : Titre VII COMPTE 19, « la
 *    prime versée est enregistrée au débit du 1962 ». Il est présenté avec
 *    la même `natureCreditrice` que ses voisins, donc EN NÉGATIF, pour que
 *    le « TOTAL PROVISIONS POUR RISQUES ET CHARGES » soit le 19 en net,
 *    c'est-à-dire DC (ch. 7 : « 19 »).
 *
 * 4. **NOTE 16A « intérêts courus » du bloc emprunts** = 166 ET 183. Seul le
 *    166 s'intitule « Intérêts courus » au plan ; le 183 s'intitule
 *    « Intérêts courus sur dettes liées à des participations » (plan-comptes.
 *    tsv, Titre VII COMPTE 18), donc l'argument du libellé identique ne vaut
 *    que pour le 166. Ce qui range le 183 ici, c'est qu'il est un compte
 *    d'INTÉRÊTS COURUS et que la note ne donne qu'une ligne pour eux dans le
 *    bloc emprunts, la ligne « dettes liées à des participations » désignant
 *    le principal (181 et 182). Le moteur Python range 183 avec 181/182 ;
 *    divergence signalée, DA (« 16, 181, 182, 183, 184 ») reste couvert dans
 *    les deux lectures, seule la ventilation en lignes change.
 *
 * 5. **NOTE 16A « avances assorties de conditions particulières » (167)**
 *    figure AUSSI à la note 15B « Autres fonds propres » (première tranche,
 *    anomalie n° 8) : les deux notes détaillent le même 16 et ne
 *    s'additionnent pas.
 *
 * 6. **NOTE 17 : 404 « Fournisseurs, acquisitions courantes
 *    d'immobilisations »** est dans DJ (« 40 sauf 409 ») sans ligne propre.
 *    Le plan tranche lui-même : 4041/4042 sont des « dettes en comptes »
 *    (ligne « dettes en compte »), 4046/4047 des « effets à payer » (ligne
 *    « effets à payer »). De même 4013/4023/4083 (sous-traitants), 4016,
 *    4017 et 4086 suivent leur compte de rattachement, hors groupe.
 *
 * 7. **NOTE 18 : « personnel avances et acomptes » (421, de sens débiteur)
 *    parmi les dettes sociales** [texte officiel, relevé au ch. 6]. DK ne
 *    reçoit que les soldes créditeurs (ch. 7) : la ligne est donc filtrée
 *    `CREDITEUR` comme toute la note, et un 421 débiteur relève de la
 *    note 8. Une avance en solde créditeur (trop-perçu) s'y voit ; un solde
 *    débiteur n'y est jamais présenté en négatif.
 *
 * 8. **NOTE 18 « caisse de retraite » · arbitrage, pas une évidence.** Le
 *    libellé de la maquette convient LITTÉRALEMENT à deux choses : au 432
 *    « Caisses de retraite complémentaire », et aux 4313 « Caisse de
 *    retraite obligatoire » et 4314 « Caisse de retraite facultative », qui
 *    sont AU PLAN des sous-comptes de 431 « Sécurité sociale » (plan-comptes.
 *    tsv, Titre VII COMPTE 43). Retenu : 432 seul, les 4313/4314 restant
 *    dans « caisse de sécurité sociale » avec tout le 431. Trois raisons,
 *    aucune tirée de la ressemblance de libellé · la maquette aligne six
 *    lignes sociales qui épousent exactement les divisionnaires du plan
 *    (421, 422, reste du 42, 431, 432, reste du 43), éclater le 431
 *    mélangerait deux niveaux de plan dans une même ligne, et le moteur
 *    Python lit de même (notes_sn.py, NOTE 18 : 14 → 431, 15 → 432).
 *    L'arbitrage aurait pu justifier une `subdivisionAttendue` ; elle est
 *    écartée parce que le recoupement compte par compte avec DK exige que
 *    TOUT 42/43/44 créditeur ait une ligne, ce qu'une rubrique en attente ne
 *    donne pas.
 *
 * 9. **NOTE 18 : 446, 448, 449 sans ligne** (« État, autres taxes sur le
 *    chiffre d'affaires », « charges à payer et produits à recevoir »,
 *    « créances et dettes diverses ») → ligne résiduelle « autres dettes
 *    État ». Le moteur Python met 446 dans « impôts et taxes » ; 446 n'est
 *    ni le 442 ni une TVA, la ligne résiduelle est retenue.
 *
 * 10. **NOTE 19 : périmètre du « TOTAL DETTES ASSOCIÉS »** · la maquette
 *    aligne « organismes internationaux » AVANT les cinq lignes d'associés
 *    et ne pose qu'un seul total : lue à la lettre, l'énumération l'y
 *    inclurait. Retenu : le total associés ne couvre que le 46 (apporteurs,
 *    associés, groupe) ; « organismes internationaux » (45) entre
 *    directement dans « TOTAL AUTRES DETTES ». Ce qui appuie ce périmètre
 *    est la DISPOSITION du modèle : le gabarit Excel porte « organismes
 *    internationaux » en ligne 10, une LIGNE VIERGE en 11, puis les cinq
 *    lignes d'associés en 12 à 16 (notes_sn.py, NOTE 19). Ce n'est PAS le
 *    gabarit qui pose la totalisation : les formules `B17 = SUM(B12:B16)` et
 *    `B33 = B10+B17+B26+B31` figurent dans `TOTAUX_FIXES`, liste que
 *    l'auteur du moteur présente lui-même comme des CORRECTIONS aux
 *    totalisations « manquantes ou tronquées » du modèle Excel. C'est donc
 *    une lecture du moteur, concordante avec la ligne vierge, pas un texte
 *    officiel : signalé comme tel plutôt que présenté comme tranché.
 *
 * 11. **NOTE 19 : 186, 187 et 188 (comptes de liaison charges, produits et
 *    sociétés en participation)** ont chacun une ligne alors que le ch. 7 ne
 *    les met dans AUCUN poste (DM : « 185, 45, 46, 47 » ; bilan,
 *    `COMPTES_BILAN_SANS_POSTE_JUSTIFIES`). La note 19 est donc PLUS large
 *    que DM, exactement comme la note 8 (première tranche, anomalie n° 6) ;
 *    le spec tolère ces trois préfixes et eux seuls.
 *
 * 12. **NOTE 19 « autres créditeurs divers »** reçoit les 47 créditeurs sans
 *    ligne : 4711, 4717, 4718, 4719, 4721, 473, 474, 476, 477. Le 478
 *    (écart de conversion-actif, poste BU, note 12 de la première tranche)
 *    en est EXCLU bien que DM ne retire que 479 : la note 12 le présente
 *    déjà sans filtre, et un 478 créditeur (anomalie du dossier) y ressort
 *    en négatif ; le montrer une seconde fois ici le compterait deux fois.
 *    **Conséquence, dite en clair : c'est un écart NOTE ↔ POSTE.** Le ch. 7
 *    met en DM « Soldes créditeurs : 185, 45, 46, 47 (sauf 479) », donc un
 *    478 créditeur EST en DM et le poste DM du dépôt le capte bien ; la
 *    note 19 ne recoupe alors plus DM, du montant de ce 478 créditeur. Cas
 *    anormal seulement (un 478 est débiteur par construction), toléré par
 *    le spec, à revoir avec la note 12 de la première tranche, qui présente
 *    le 478 sans filtre de sens.
 *
 * 13. **NOTE 20 : premier sous-total intitulé « BANQUES, CRÉDITS D'ESCOMPTE
 *    ET DE TRÉSORERIE »** alors qu'il ne totalise que les escomptes [texte
 *    officiel] ; c'est l'intitulé du TOTAL GÉNÉRAL repris à mi-tableau.
 *    Reproduit tel quel.
 *
 * 14. **NOTE 20 : le 53 créditeur** (DR : « Soldes créditeurs : 52, 53, 561,
 *    566 ») n'a aucune ligne dans la maquette → « autres banques », avec
 *    523, 524, 525. **Conséquence à dire, parce qu'elle n'est pas voulue
 *    mais subie** : le jeton « 53 » emporte le 536 « Établissements
 *    financiers, intérêts courus » (plan-comptes.tsv, Titre VII COMPTE 53),
 *    si bien qu'un compte d'intérêts courus se range dans « autres
 *    banques » alors que la note a une ligne « banques intérêts courus ».
 *    Ce n'est pas un choix de ventilation, c'est le ricochet du jeton ; il
 *    est laissé tel quel parce que la ligne d'intérêts courus de la note
 *    dit « BANQUES » (le 52), quand le 53 est « Établissements financiers
 *    et assimilés », et que la maquette ne leur donne aucune ligne propre.
 *    DR reste couvert, aucun compte n'est compté deux fois.
 *
 * 15. **NOTE 20, NB sur « banques intérêts courus »** : « figure dans cette
 *    rubrique si le compte principal attaché est créditeur ». La balance ne
 *    connaît pas le compte principal. **Arbitrage pris ici** : 526 filtré
 *    `CREDITEUR`, c'est-à-dire la lettre de DR, qui qualifie tout le 52 par
 *    le sens du solde · c'est la seule règle que la balance permette
 *    d'appliquer, et elle ne fait perdre aucun compte, un 526 débiteur
 *    étant capté par BS et par la note 11. La première tranche lit 526 et
 *    536 SANS filtre à sa note 11 (son anomalie n° 7) : un 526 créditeur
 *    figure donc dans les deux notes, en négatif à la 11 et en positif ici.
 *    L'écart subsiste tant que la note 11 n'est pas alignée ; il est chez
 *    elle, pas ici, et cette tranche ne modifie pas son fichier. Le 566
 *    « Banques, crédits de trésorerie, intérêts courus » suit le 561 dans
 *    la ligne « crédit de trésorerie » (c'est un sous-compte du 56, pas du
 *    52) ; le moteur Python le met avec 526.
 *
 * 16. **NOTE 21 : aucune ligne pour les RRR accordés non ventilés (7019,
 *    7029, 7039, 7049, 7059, 7069)** alors que « TOTAL : VENTES
 *    MARCHANDISES » doit égaler TA (« 701 »), et de même pour TB et TC. Une
 *    ligne « Rabais, remises et ristournes accordés (non ventilés) » est
 *    AJOUTÉE dans chaque bloc, hors maquette ; elle ressort en négatif de
 *    par le sens du compte. Les noyer dans « ventes dans la région » serait
 *    un rattachement au jugé ; les omettre romprait le recoupement avec le
 *    compte de résultat. Ces lignes ajoutées NE sont PAS marquées par le
 *    champ `renvoi` : `note-annexe.types.ts` le réserve au « renvoi de bas
 *    de tableau du texte officiel, reproduit tel quel », et y loger une
 *    phrase de notre cru la ferait lire comme officielle à l'écran et à
 *    l'export. Elles sont listées dans `RUBRIQUES_HORS_MAQUETTE_NOTES_2`,
 *    exporté en bas de ce fichier, que le spec relit.
 *
 * 17. **NOTE 22 : même lacune pour 6015/6019 et 6025/6029** (frais sur
 *    achats et RRR sur marchandises et sur matières premières) alors que
 *    les totaux des deux premiers blocs doivent égaler RA (« 601 ») et RC
 *    (« 602 »). Deux lignes ajoutées par bloc, hors maquette, listées dans
 *    `RUBRIQUES_HORS_MAQUETTE_NOTES_2` comme celles de la note 21. Les
 *    lignes « frais sur achats » et « rabais, remises et ristournes » du
 *    bloc « autres achats » ne portent alors que 6045, 6085 et 6049, 6059,
 *    6089, pour que « TOTAL : AUTRES ACHATS » égale RE (« 604, 605, 608 »).
 *
 * 18. **NOTE 22 « remises rabais, remises et ristournes »** répète
 *    « remises » [texte officiel] ; libellé reproduit, lire RRR.
 *
 * 19. **NOTE 22, regroupements imposés par le plan** : « fournitures
 *    d'atelier, d'usine et de magasin » = 6044 + 6046 ; « fourniture de
 *    bureau » = 6047 (stockées) + 6055 (non stockables) ; « achats études,
 *    prestations de services, de travaux matériels et équipements » = 6057
 *    + 6058. Chaque compte porte dans son libellé le mot de la rubrique.
 *
 * 20. **NOTE 23 : le Titre VII COMPTE 61 liste un 619 « Rabais, remises,
 *    ristournes (non ventilés) »** que le plan de comptes (TSV du skill et
 *    semis) n'a PAS ; la note n'a d'ailleurs aucune ligne de RRR. Rien à
 *    rattacher, signalé pour mémoire. Le 6183 est « Transports
 *    administratifs » au plan et un libellé dupliqué au Titre VII.
 *
 * 21. **NOTE 24 : 637 et 638 sans ligne** → « autres charges externes ». Le
 *    637 « Rémunérations de personnel extérieur à l'entité » est viré pour
 *    solde au 667 à la clôture (Titre VII COMPTE 63) : un 637 non soldé
 *    ressort ici, et c'est un contrôle de clôture, pas un oubli.
 *
 * 22. **NOTE 26 : 656 (perte de change commerciale) et 657 (pénalités et
 *    amendes pénales) sans ligne** → « autres charges diverses » avec 6588.
 *    Le 647 (pénalités et amendes FISCALES) est à la note 25, le 657
 *    (PÉNALES) ici ; le Titre VII classe 8 les tient tous deux en activités
 *    ordinaires.
 *
 * 23. **NOTE 27B : le bloc « 1. Personnel propre » n'est pas intitulé**
 *    [texte officiel], seul « 2. Personnel extérieur » l'est. Les codes YA à
 *    YG portent implicitement le personnel de l'entité ; les deux blocs sont
 *    transcrits en sous-tableaux, codes YA à YO en saisie, seize colonnes
 *    (deux tableaux × quatre zones × M/F).
 *
 * 24. **NOTE 16B, second tableau** : le texte ne précise pas ses colonnes ;
 *    « Année N · Année N-1 » retenu, comme les deux autres tableaux.
 *
 * 25. **Les modèles d'état renvoient au NUMÉRO DE TÊTE, pas au code de
 *    tableau.** Le compte de résultat (ch. 4 section 2) renvoie « 27 » sans
 *    lettre pour RK : `renvoyeeDepuis: ['RK']` est posé sur 27A et sur 27B.
 *    Le modèle de bilan (ch. 3 section 2) fait de même avec « 16 » pour DA,
 *    DB et DC : d'où `renvoyeeDepuis: ['DA', 'DB', 'DC']` sur la 16A, et
 *    `['DC']` sur les tableaux des notes 16B et 16B bis, qui traitent les
 *    engagements de retraite, c'est-à-dire la matière du 19 (DC) et non
 *    celle du 16 ni du 17. Ce choix est une LECTURE, pas la lettre du
 *    modèle : le « 16 » de DA et DB englobe formellement 16B et 16B bis
 *    aussi. Symétriquement, la 16C ne porte AUCUN `renvoyeeDepuis`, le ch. 6
 *    disant qu'elle « n'est appelée par aucun poste du bilan » (les actifs
 *    et passifs éventuels ne sont pas comptabilisés) · alors que le même
 *    « 16 » du modèle l'englobe formellement elle aussi. Les deux écarts
 *    sont assumés dans le même sens : le renvoi désigne le tableau qui
 *    documente réellement le poste.
 *
 * 26. **NOTE 16A : les colonnes d'échéance couvrent aussi les provisions**
 *    (une seule ligne de colonnes pour les trois blocs) ; reproduit.
 *
 * 27. **DR : « Soldes créditeurs : 52, 53, 561, 566 », mais 561 et 566 ne
 *    sont pas filtrés** (note 20, ligne « crédit de trésorerie »). Le
 *    qualificatif du ch. 7 porte sur les quatre préfixes ; il n'est appliqué
 *    qu'à 52 et 53. Raison : un 561 ou un 566 débiteur n'a AUCUN poste
 *    d'accueil au ch. 7 (BS ne prend que « 52, 53, 54, 55, 57, 581, 582 »),
 *    et le Titre VII COMPTE 56 fait d'un 561 débiteur une anomalie. Le
 *    filtrer le ferait disparaître de la note et du bilan sans autre trace
 *    qu'un total faux ; sans filtre il ressort en NÉGATIF, visible. C'est
 *    la décision déjà prise au bilan du dépôt
 *    (`correspondance-bilan-syscohada.ts`, DR, son anomalie n° 3), reprise
 *    ici pour que note et poste disent la même chose · mais c'est un ÉCART
 *    avec la lettre du ch. 7, pas son application.
 *
 * 28. **NOTE 17 : le Titre VII contredit le ch. 7 sur les fournisseurs
 *    débiteurs.** Titre VII COMPTE 40, Commentaires : « aucune compensation
 *    ne pourrait s'effectuer entre les comptes fournisseurs à solde débiteur
 *    et les comptes fournisseurs à solde créditeur : les premiers figurent à
 *    l'actif du bilan, les seconds au passif ». Le ch. 7, lui, écrit DJ
 *    « 40 (sauf 409) » SANS qualificatif de sens et ne met aucun 40 (hors
 *    409) à l'actif : BJ ne reçoit que « 185, 42, 43, 44, 45, 46, 47 ». Le
 *    ch. 7 tranche (c'est la règle de ce fichier) et la note le suit, en
 *    `natureCreditrice` sans filtre. Conséquence : un 401 à solde débiteur
 *    ressort ici, et en DJ, EN NÉGATIF au passif, là où le Titre VII le
 *    voudrait à l'actif. Contradiction du texte officiel, signalée et non
 *    corrigée ; la sortir vers un poste d'actif serait inventer ce poste.
 *
 * 29. **NOTE 16C : la maquette donne TROIS lignes par bloc** · « Actif
 *    éventuel : litiges, …, … ; Passif éventuel : litiges, …, … ». Les deux
 *    lignes en pointillés sont à compléter par l'entité. Transcrit tel
 *    quel : deux sous-tableaux « ACTIF ÉVENTUEL » et « PASSIF ÉVENTUEL »
 *    (le moteur n'a pas de ligne d'en-tête de bloc · une rubrique porte des
 *    comptes, un total, une attente ou une saisie, jamais un titre), chacun
 *    avec « Litiges » puis les deux lignes « … » du modèle. La transcription
 *    antérieure composait deux libellés par bloc (« Actif éventuel :
 *    litiges », « Actif éventuel : autres (à préciser) ») qui n'étaient pas
 *    ceux du texte et perdaient une ligne : corrigé.
 *
 * 30. **NOTE 21 « autres produits » = « 75 » en bloc (TH)**, donc y compris
 *    le 759 « Reprises de charges pour dépréciations et provisions pour
 *    risques à court terme d'exploitation », que le Titre VII isole
 *    (COMPTE 75 « sauf 759 », puis COMPTE 759). La maquette de la note 21
 *    n'a aucune ligne de reprises et le ch. 7 ne coupe pas le 75 : le 759
 *    reste donc dans « autres produits ». Asymétrie à signaler avec la
 *    note 26, qui isole son symétrique, le 659, sur sa propre ligne avec
 *    renvoi à la note 28 (anomalie n° 22) · mais la note 26 y est forcée par
 *    sa maquette, qui porte cette ligne, quand celle de la note 21 ne la
 *    porte pas.
 *
 * 31. **Écarts entre le Titre VII et le plan de comptes**, relevés en
 *    transcrivant cette tranche, tous sans effet sur le calcul (les
 *    rubriques concernées citent 526, 47, 623 et 638 en bloc) mais dus par
 *    CLAUDE.md §9 :
 *    - COMPTE 52 : le Titre VII subdivise 526 en « 5261 en monnaie locale ·
 *      5265 en devises » ; le plan (TSV et semis) porte « 5261 charges à
 *      payer · 5267 produits à recevoir » ;
 *    - COMPTE 47 : le Titre VII liste un « 4714 créances sur cessions de
 *      titres de placement » que le plan n'a pas · le plan porte ce libellé
 *      en 4721 ;
 *    - COMPTE 62 : le Titre VII donne « 6235 autres contrats de location
 *      acquisition », le plan « 6238 » ;
 *    - COMPTE 63 : le Titre VII liste un « 6388 charges externes diverses »
 *      absent du plan, qui s'arrête à 6385.
 *    Même nature que l'anomalie n° 20 (le 619 du COMPTE 61, absent du plan).
 *
 * 32. **Divergence avec l'aide Python sur la NOTE 16A** : notes-ohada.md la
 *    classe en « Mouvements » (donc avec un échéancier de mouvements),
 *    quand la maquette du ch. 6 ne lui donne que « Année N · Année N-1 ·
 *    les deux variations · les trois échéances », sans colonnes A/B/C/D.
 *    Lue en SOLDE, comme le ch. 6, qui tranche.
 *
 * 33. **« Variation en valeur absolue » lue en `VARIATION_VALEUR`** ·
 *    voir la section « Colonnes » ci-dessus pour les deux maquettes qui le
 *    tranchent (notes 12 et 14 du ch. 6). Écart de lecture avec la première
 *    tranche, qui lit ce même libellé en `VARIATION_VALEUR_ABSOLUE`.
 *
 * ## Une note sur le champ `cle`
 *
 * `note-annexe.types.ts` fait la `cle` obligatoire pour une rubrique en
 * attente et « facultative ailleurs » ; `note-annexe.service.ts` pose la
 * convention plus stricte qu'« une rubrique que le plan officiel détermine
 * ne porte PAS de clé ». Cette tranche en pose deux fois hors attente, et
 * le dit : les deux « Intérêts courus » de la note 16A portent le MÊME
 * libellé officiel dans deux blocs différents et rien d'autre ne les
 * distinguerait ; les YA à YO de la note 27B sont, de l'aveu du ch. 6, « les
 * seuls codes de rubrique portés par une Note annexe ». Aucune n'est
 * rattachable pour autant · `rubriqueRattachable` refuse toute rubrique sans
 * `subdivisionAttendue`, et le spec voisin vérifie qu'aucune clé de cette
 * tranche n'en porte.
 */

// --------------------------------------------------------------------------
// Colonnes officielles, par famille de notes
// --------------------------------------------------------------------------

/** Notes 17 et 20 à 27A · « Année N · Année N-1 · Variation en % ». */
const COLONNES_N_N1_POURCENT = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

/**
 * Notes 16A, 18 et 19 · les deux variations. Le libellé officiel est
 * conservé mot pour mot ; le TYPE est `VARIATION_VALEUR` (N moins N-1,
 * signée) et non `VARIATION_VALEUR_ABSOLUE` · anomalie n° 33 et section
 * « Colonnes » de l'en-tête. Prendre |N − N-1| perdrait le sens de la
 * variation dans une colonne qui n'existe que pour l'opposer au « % ».
 */
const COLONNES_N_N1_VALEUR_ABSOLUE_POURCENT = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur absolue' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

/** Les trois échéances de dettes, mot pour mot. */
const ECHEANCES_DETTES = [
  { type: 'ECHEANCE_1AN' as const, libelle: 'Dettes à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Dettes à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Dettes à plus de deux ans' },
];

/** Notes 16A, 18 et 19. */
const COLONNES_DETTES_DEUX_VARIATIONS_ECHEANCES = [...COLONNES_N_N1_VALEUR_ABSOLUE_POURCENT, ...ECHEANCES_DETTES];

/** Note 17 · pas de « variation en valeur absolue ». */
const COLONNES_DETTES_POURCENT_ECHEANCES = [...COLONNES_N_N1_POURCENT, ...ECHEANCES_DETTES];

/**
 * Notes entièrement hors balance (16B, 16B bis, 16C) : les colonnes sont
 * LIBRE parce qu'aucune ne se calcule · un taux d'actualisation ou un passif
 * éventuel ne se lit dans aucun compte.
 */
const COLONNES_SAISIE_N_N1 = [
  { type: 'LIBRE' as const, libelle: 'Année N' },
  { type: 'LIBRE' as const, libelle: 'Année N-1' },
];

/**
 * Note 27B · seize colonnes : deux tableaux (effectifs, masse salariale ou
 * facturation) × quatre zones × M/F. Le second argument nomme le tableau de
 * droite, qui change d'intitulé entre les deux blocs (anomalie n° 23).
 */
function colonnesEffectifs(tableauDroite: string) {
  const zones = ['Nationaux', "Autres États de l'OHADA", 'Hors OHADA', 'TOTAL'];
  const sexes = ['M', 'F'];
  const bloc = (tableau: string) =>
    zones.flatMap((zone) => sexes.map((sexe) => ({ type: 'LIBRE' as const, libelle: `${tableau} · ${zone} · ${sexe}` })));
  return [...bloc('EFFECTIFS'), ...bloc(tableauDroite)];
}

export const NOTES_SYSCOHADA_2: SpecificationNote[] = [
  // ======================================================================
  // NOTE 16A · DA, DB et DC à elle seule (ch. 7 : « 16, 181, 182, 183, 184 »,
  // « 17 », « 19 »)
  // ======================================================================
  {
    code: '16A',
    titre: 'DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES',
    colonnes: COLONNES_DETTES_DEUX_VARIATIONS_ECHEANCES,
    renvoyeeDepuis: ['DA', 'DB', 'DC'],
    rubriques: [
      // ---- Emprunts · Titre VII COMPTE 16 (161 à 168) et COMPTE 18 (181 à 184)
      { libelle: 'Emprunts obligataires', comptes: ['161'], natureCreditrice: true },
      { libelle: 'Emprunts et dettes auprès des établissements de crédit', comptes: ['162'], natureCreditrice: true },
      { libelle: "Avances reçues de l'État", comptes: ['163'], natureCreditrice: true },
      { libelle: 'Avances reçues et comptes courants bloqués', comptes: ['164'], natureCreditrice: true },
      { libelle: 'Dépôts et cautionnements reçus', comptes: ['165'], natureCreditrice: true },
      // Anomalie n° 4 : le 166 s'intitule « Intérêts courus » au plan, le 183
      // « Intérêts courus sur dettes liées à des participations » ; les deux
      // sont des intérêts courus et la note n'a qu'une ligne pour eux ici.
      // La `cle` distingue cette rubrique de son homonyme du bloc location.
      { cle: 'interets-courus-emprunts', libelle: 'Intérêts courus', comptes: ['166', '183'], natureCreditrice: true },
      // Anomalie n° 5 : aussi à la note 15B.
      { libelle: 'Avances assorties de conditions particulières', comptes: ['167'], natureCreditrice: true },
      { libelle: 'Autres emprunts et dettes', comptes: ['168'], natureCreditrice: true },
      // 181 « Dettes liées à des participations », 182 « … à des sociétés en participation ».
      { libelle: 'Dettes liées à des participations', comptes: ['181', '182'], natureCreditrice: true },
      {
        libelle: 'Comptes permanents bloqués des établissements et succursales',
        comptes: ['184'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL EMPRUNTS ET DETTES FINANCIÈRES', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      // ---- Location acquisition · Titre VII COMPTE 17 (172, 173, 174, 176, 178)
      { libelle: 'Crédit bail immobilier', comptes: ['172'], natureCreditrice: true },
      { libelle: 'Crédit bail mobilier', comptes: ['173'], natureCreditrice: true },
      { libelle: 'Location vente', comptes: ['174'], natureCreditrice: true },
      { cle: 'interets-courus-location', libelle: 'Intérêts courus', comptes: ['176'], natureCreditrice: true },
      { libelle: 'Autres dettes de location acquisition', comptes: ['178'], natureCreditrice: true },
      { libelle: 'TOTAL DETTES DE LOCATION ACQUISITION', totalDeRubriques: [11, 12, 13, 14, 15] },
      // ---- Provisions · Titre VII COMPTE 19 (191 à 198)
      { libelle: 'Provisions pour litiges', comptes: ['191'], natureCreditrice: true },
      { libelle: 'Provisions pour garantie donnés aux clients', comptes: ['192'], natureCreditrice: true },
      { libelle: 'Provisions pour pertes sur marchés à achèvement futur', comptes: ['193'], natureCreditrice: true },
      { libelle: 'Provisions pour pertes de change', comptes: ['194'], natureCreditrice: true },
      { libelle: 'Provisions pour impôts', comptes: ['195'], natureCreditrice: true },
      { libelle: 'Provisions pour pensions et obligations assimilées', comptes: ['1961'], natureCreditrice: true },
      // Anomalie n° 3 : compte débiteur, présenté en négatif pour que le total soit DC.
      { libelle: 'Actif du régime de retraite', comptes: ['1962'], natureCreditrice: true },
      { libelle: 'Provisions pour restructuration', comptes: ['197'], natureCreditrice: true },
      { libelle: 'Provisions pour amendes et pénalités', comptes: ['1981'], natureCreditrice: true },
      { libelle: 'Provisions de propre assureur', comptes: ['1983'], natureCreditrice: true },
      { libelle: 'Provisions pour démantèlement et remise en état', comptes: ['1984'], natureCreditrice: true },
      // Anomalie n° 2 : « déduction » pour « réduction ».
      { libelle: 'Provisions de droits à déduction', comptes: ['1985'], natureCreditrice: true },
      {
        libelle: 'Autres provisions',
        comptes: ['198'],
        exclusions: ['1981', '1983', '1984', '1985'],
        natureCreditrice: true,
      },
      {
        libelle: 'TOTAL PROVISIONS POUR RISQUES ET CHARGES',
        totalDeRubriques: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
      },
    ],
    commentaire:
      "pour chaque emprunt et dette de location acquisition, mentionner la date d'octroi, le nom de l'organisme " +
      'financier, le montant initial, la durée du crédit, les garanties données par la société ; indiquer les ' +
      'événements et circonstances qui ont conduit à la provision et à la reprise ; pour les pensions et ' +
      "obligations de retraite : indiquer la méthode d'évaluation retenue ; pour les actifs du régime, indiquer " +
      "le nom de la compagnie d'assurance ou du fonds de pension, le descriptif de la convention signée avec " +
      "l'organisme, la périodicité des versements, le montant et la durée de la convention ; indication de la " +
      'valeur retenue pour les principales hypothèses actuarielles à la date de clôture et leur base de ' +
      'détermination.',
  },

  // ======================================================================
  // NOTE 16B · trois tableaux, tous hors balance (Titre VIII ch. 21 : les
  // paramètres actuariels ne sont dans aucun compte)
  // ======================================================================
  {
    code: '16B',
    sousTableau: 'HYPOTHÈSES ACTUARIELLES',
    // Anomalie n° 1 : même intitulé que la 16B bis.
    titre: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)',
    horsBalance: true,
    colonnes: COLONNES_SAISIE_N_N1,
    renvoyeeDepuis: ['DC'],
    rubriques: [
      { libelle: "Taux d'augmentation des salaires", saisie: true },
      { libelle: "Taux d'actualisation", saisie: true },
      { libelle: "Taux d'inflation", saisie: true },
      {
        libelle: "Probabilité d'être présent dans l'entité à la date de départ à la retraite (expérience passée)",
        saisie: true,
      },
      { libelle: "Probabilité d'être en vie à l'âge de départ à la retraite (table de mortalité)", saisie: true },
      { libelle: 'Taux de rendement effectif des actifs du régime', saisie: true },
    ],
    commentaire: "commenter les variations d'hypothèses actuarielles utilisées pour le calcul.",
  },
  {
    code: '16B',
    sousTableau: "VARIATION DE LA VALEUR DE L'ENGAGEMENT DE RETRAITE AU COURS DE L'EXERCICE",
    titre: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)',
    horsBalance: true,
    // Anomalie n° 24 : colonnes non précisées par le texte.
    colonnes: COLONNES_SAISIE_N_N1,
    renvoyeeDepuis: ['DC'],
    // L'obligation à la clôture n'est PAS rattachée au 1961 : le 1961 ne
    // porte l'obligation actuarielle que si l'entité a opté pour cette
    // méthode (Titre VII COMPTE 19, dérogation ouverte aux entités non
    // cotées). Le déduire du compte serait un jugement sur la méthode.
    rubriques: [
      { libelle: "Obligation au titre des engagements de retraite à l'ouverture", saisie: true },
      { libelle: "Coût des services rendus au cours de l'exercice", saisie: true },
      { libelle: 'Coût financier', saisie: true },
      { libelle: 'Pertes actuarielles / (gain)', saisie: true },
      { libelle: "Prestations payées au cours de l'exercice", saisie: true },
      { libelle: 'Coût des services passés', saisie: true },
      { libelle: 'Obligation au titre des engagements de retraite à la clôture', saisie: true },
    ],
    commentaire: "indiquer le montant de la charge par nature comptabilisée au cours de l'exercice.",
  },
  {
    code: '16B',
    sousTableau: 'ANALYSE DE SENSIBILITÉ DES HYPOTHÈSES ACTUARIELLES',
    titre: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Année N · Augmentation' },
      { type: 'LIBRE' as const, libelle: 'Année N · Diminution' },
      { type: 'LIBRE' as const, libelle: 'Année N-1 · Augmentation' },
      { type: 'LIBRE' as const, libelle: 'Année N-1 · Diminution' },
    ],
    renvoyeeDepuis: ['DC'],
    rubriques: [
      { libelle: "Taux d'actualisation (variation de …%)", saisie: true },
      { libelle: 'Taux de progression des salaires (variation de …%)', saisie: true },
      { libelle: 'Taux de départ du personnel (variation de …%)', saisie: true },
    ],
    commentaire: "indiquer l'impact des variations obtenues sur le montant des engagements de retraite.",
  },

  // ======================================================================
  // NOTE 16B bis · deux tableaux, hors balance
  // ======================================================================
  {
    code: '16B bis',
    sousTableau: 'ACTIF/PASSIF NET COMPTABILISÉ AU TITRE DES RÉGIMES FINANCÉS',
    // Anomalie n° 1.
    titre: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)',
    horsBalance: true,
    colonnes: COLONNES_SAISIE_N_N1,
    renvoyeeDepuis: ['DC'],
    // La « valeur actuelle des actifs affectés » n'est pas le solde du 1962 :
    // le 1962 est débité des PRIMES VERSÉES (Titre VII COMPTE 19), pas d'une
    // juste valeur. Saisie, pas rattachement.
    rubriques: [
      { libelle: "Valeur actuelle de l'obligation résultant de régimes financés", saisie: true },
      { libelle: 'Valeur actuelle des actifs affectés aux plans de retraite', saisie: true },
      { libelle: 'Excédent / déficit de régime', saisie: true },
    ],
    commentaire: "indiquer le montant comptabilisé au passif (ou actif) à la clôture de l'exercice.",
  },
  {
    code: '16B bis',
    sousTableau: 'VALEUR ACTUELLE DES ACTIFS DU RÉGIME',
    titre: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Année N · Rendement attendu' },
      { type: 'LIBRE' as const, libelle: 'Année N · Juste valeur des actifs' },
      { type: 'LIBRE' as const, libelle: 'Année N-1 · Rendement attendu' },
      { type: 'LIBRE' as const, libelle: 'Année N-1 · Juste valeur des actifs' },
    ],
    renvoyeeDepuis: ['DC'],
    rubriques: [
      { libelle: 'Actions', saisie: true },
      { libelle: 'Obligations', saisie: true },
      { libelle: 'Autres', saisie: true },
      { libelle: 'Total', saisie: true },
    ],
    commentaire:
      "expliquer comment les taux de rendement par catégorie d'actifs et global ont été déterminés ; indiquer " +
      'le montant des rendements réels des actifs affectés aux plans en N et N-1.',
  },

  // ======================================================================
  // NOTE 16C · Titre VIII ch. 18 et 30 : non comptabilisés, appelée par
  // aucun poste
  // ======================================================================
  // Anomalie n° 29 : la maquette pose DEUX blocs de TROIS lignes, « litiges »
  // puis deux lignes en pointillés que l'entité complète. Le moteur n'a pas
  // de ligne d'en-tête de bloc (une rubrique porte des comptes, un total, une
  // attente ou une saisie, jamais un titre) : les deux blocs deviennent deux
  // sous-tableaux, ce qui rend les libellés du texte tels quels au lieu de
  // les recomposer, et rend les deux lignes vierges au lieu d'en perdre une.
  {
    code: '16C',
    sousTableau: 'ACTIF ÉVENTUEL',
    titre: 'ACTIFS ET PASSIFS ÉVENTUELS',
    horsBalance: true,
    colonnes: COLONNES_SAISIE_N_N1,
    rubriques: [
      { libelle: 'Litiges', saisie: true },
      // Les deux lignes en pointillés du modèle : l'entité y écrit la nature
      // de l'actif éventuel. Reproduites telles quelles, à deux exemplaires.
      { libelle: '…', saisie: true },
      { libelle: '…', saisie: true },
    ],
    commentaire:
      "décrire les principales caractéristiques des actifs / passifs éventuels, l'horizon de temps auquel les " +
      'encaissements / décaissements sont attendus et les éventuels remboursements à percevoir.',
  },
  {
    code: '16C',
    sousTableau: 'PASSIF ÉVENTUEL',
    titre: 'ACTIFS ET PASSIFS ÉVENTUELS',
    horsBalance: true,
    colonnes: COLONNES_SAISIE_N_N1,
    rubriques: [
      { libelle: 'Litiges', saisie: true },
      { libelle: '…', saisie: true },
      { libelle: '…', saisie: true },
    ],
    commentaire:
      "décrire les principales caractéristiques des actifs / passifs éventuels, l'horizon de temps auquel les " +
      'encaissements / décaissements sont attendus et les éventuels remboursements à percevoir.',
  },

  // ======================================================================
  // NOTE 17 · DJ (« 40 sauf 409 ») et BH (« 409 »)
  // ======================================================================
  {
    code: '17',
    titre: "FOURNISSEURS D'EXPLOITATION",
    colonnes: COLONNES_DETTES_POURCENT_ECHEANCES,
    renvoyeeDepuis: ['DJ', 'BH'],
    // DJ n'est pas qualifié par le sens au ch. 7 : `natureCreditrice`, sans
    // filtre · un fournisseur débiteur ressort en négatif, où il se voit,
    // comme au poste DJ. Le bloc « débiteurs » (409) se lit au débit.
    // Le Titre VII COMPTE 40 dit l'inverse (« aucune compensation… les
    // premiers figurent à l'actif du bilan, les seconds au passif ») ; le
    // ch. 7 tranche et aucun poste d'actif ne reçoit le 40 hors 409 ·
    // contradiction du texte officiel, anomalie n° 28.
    rubriques: [
      // Anomalie n° 6 : 4041/4042 sont des dettes en compte, 4046/4047 des effets à payer.
      {
        libelle: 'Fournisseurs dettes en compte (hors groupe)',
        comptes: ['401', '4041', '4042'],
        exclusions: ['4012'],
        natureCreditrice: true,
      },
      {
        libelle: 'Fournisseurs effets à payer (hors groupe)',
        comptes: ['402', '4046', '4047'],
        exclusions: ['4022'],
        natureCreditrice: true,
      },
      { libelle: 'Fournisseurs, dettes et effets à payer groupe', comptes: ['4012', '4022'], natureCreditrice: true },
      {
        libelle: 'Fournisseurs factures non parvenues (hors groupe)',
        comptes: ['408'],
        exclusions: ['4082'],
        natureCreditrice: true,
      },
      { libelle: 'Fournisseurs factures non parvenues groupe', comptes: ['4082'], natureCreditrice: true },
      { libelle: 'TOTAL FOURNISSEURS', totalDeRubriques: [0, 1, 2, 3, 4] },
      // 4093 « Sous-traitants avances et acomptes versés » est hors groupe.
      { libelle: 'Fournisseurs, avances et acomptes (hors groupe)', comptes: ['4091', '4093'] },
      { libelle: 'Fournisseurs, avances et acomptes groupe', comptes: ['4092'] },
      // 4094 emballages à rendre, 4098 RRR et avoirs à obtenir.
      { libelle: 'Autres fournisseurs débiteurs', comptes: ['409'], exclusions: ['4091', '4092', '4093'] },
      { libelle: 'TOTAL FOURNISSEURS DÉBITEURS', totalDeRubriques: [6, 7, 8] },
    ],
    commentaire:
      'commenter toutes variations significatives ; indiquer pour les dettes du groupe le nom de la société du ' +
      'groupe et le % de titres détenus ; commenter les dettes anciennes.',
  },

  // ======================================================================
  // NOTE 18 · DK (« Soldes créditeurs : 42, 43, 44 »)
  // ======================================================================
  {
    code: '18',
    titre: 'DETTES FISCALES ET SOCIALES',
    colonnes: COLONNES_DETTES_DEUX_VARIATIONS_ECHEANCES,
    renvoyeeDepuis: ['DK'],
    rubriques: [
      // Anomalie n° 7.
      { libelle: 'Personnel avances et acomptes', comptes: ['421'], sens: 'CREDITEUR' },
      { libelle: 'Personnel rémunérations dues', comptes: ['422'], sens: 'CREDITEUR' },
      // 423 à 428 : oppositions, œuvres sociales, représentants, participation, dépôts, charges à payer.
      { libelle: 'Autres personnel', comptes: ['42'], exclusions: ['421', '422'], sens: 'CREDITEUR' },
      // Anomalie n° 8 : 4313/4314 restent ici, sous-comptes de 431 au plan.
      { libelle: 'Caisse de sécurité sociale', comptes: ['431'], sens: 'CREDITEUR' },
      { libelle: 'Caisse de retraite', comptes: ['432'], sens: 'CREDITEUR' },
      // 433 autres organismes sociaux, 438 charges à payer et produits à recevoir.
      { libelle: 'Autres organismes sociaux', comptes: ['43'], exclusions: ['431', '432'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES SOCIALES', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      { libelle: 'État, impôts sur les bénéfices', comptes: ['441'], sens: 'CREDITEUR' },
      { libelle: 'État, impôts et taxes', comptes: ['442'], sens: 'CREDITEUR' },
      // 443 facturée, 444 due ou crédit, 445 récupérable (créditrice par exception).
      { libelle: 'État, TVA', comptes: ['443', '444', '445'], sens: 'CREDITEUR' },
      { libelle: 'État, impôts retenus à la source', comptes: ['447'], sens: 'CREDITEUR' },
      // Anomalie n° 9 : 446, 448, 449.
      {
        libelle: 'Autres dettes État',
        comptes: ['44'],
        exclusions: ['441', '442', '443', '444', '445', '447'],
        sens: 'CREDITEUR',
      },
      { libelle: 'TOTAL DETTES FISCALES', totalDeRubriques: [7, 8, 9, 10, 11] },
      { libelle: 'TOTAL DETTES SOCIALES ET FISCALES', totalDeRubriques: [6, 12] },
    ],
    commentaire: 'commenter toute variation significative ; commenter les dettes anciennes.',
  },

  // ======================================================================
  // NOTE 19 · DM (« Soldes créditeurs : 185, 45, 46, 47 (sauf 479) ») et
  // DN (« 499 (sauf 4998), 599 »)
  // ======================================================================
  {
    code: '19',
    titre: 'AUTRES DETTES ET PROVISIONS POUR RISQUES À COURT TERME',
    colonnes: COLONNES_DETTES_DEUX_VARIATIONS_ECHEANCES,
    renvoyeeDepuis: ['DM', 'DN'],
    rubriques: [
      // Anomalie n° 10 : hors du total associés, dans le total autres dettes.
      { libelle: 'Organismes internationaux', comptes: ['45'], sens: 'CREDITEUR' },
      { libelle: 'Apporteurs, opérations sur le capital', comptes: ['461'], sens: 'CREDITEUR' },
      { libelle: 'Associés, compte courant', comptes: ['462'], sens: 'CREDITEUR' },
      { libelle: 'Associés dividendes à payer', comptes: ['465'], sens: 'CREDITEUR' },
      { libelle: 'Groupe, comptes courants', comptes: ['466'], sens: 'CREDITEUR' },
      // 463 opérations faites en commun et GIE, 467 restant dû sur capital appelé.
      {
        libelle: 'Autres dettes associés',
        comptes: ['46'],
        exclusions: ['461', '462', '465', '466'],
        sens: 'CREDITEUR',
      },
      { libelle: 'TOTAL DETTES ASSOCIÉS', totalDeRubriques: [1, 2, 3, 4, 5] },
      { libelle: 'Créditeurs divers', comptes: ['4712'], sens: 'CREDITEUR' },
      { libelle: 'Obligataires', comptes: ['4713'], sens: 'CREDITEUR' },
      { libelle: "Rémunérations d'administrateurs", comptes: ['4715'], sens: 'CREDITEUR' },
      // 4716 « Compte d'affacturage » : le factor.
      { libelle: 'Compte du factor', comptes: ['4716'], sens: 'CREDITEUR' },
      {
        libelle: 'Versements restant à effectuer sur titres de placement non libérés',
        comptes: ['4726'],
        sens: 'CREDITEUR',
      },
      // 475 (4751 actif, 4752 passif) : le filtre ne garde que le sens créditeur.
      {
        libelle: 'Compte transitoire ajustement spécial lié à la révision du SYSCOHADA',
        comptes: ['475'],
        sens: 'CREDITEUR',
      },
      // Anomalie n° 12.
      {
        libelle: 'Autres créditeurs divers',
        comptes: ['47'],
        exclusions: ['4712', '4713', '4715', '4716', '4726', '475', '478', '479'],
        sens: 'CREDITEUR',
      },
      { libelle: 'TOTAL CRÉDITEURS DIVERS', totalDeRubriques: [7, 8, 9, 10, 11, 12, 13] },
      {
        libelle: 'Comptes permanents non bloqués des établissements et des succursales',
        comptes: ['185'],
        sens: 'CREDITEUR',
      },
      // Anomalie n° 11 : 186, 187 et 188 sont hors de tout poste au ch. 7.
      { libelle: 'Comptes de liaison charges et produits', comptes: ['186', '187'], sens: 'CREDITEUR' },
      { libelle: 'Comptes de liaison des sociétés en participation', comptes: ['188'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL COMPTES DE LIAISON', totalDeRubriques: [15, 16, 17] },
      { libelle: 'TOTAL AUTRES DETTES', totalDeRubriques: [0, 6, 14, 18] },
      // DN · sans filtre de sens : une provision est créditrice par nature.
      {
        libelle: 'Provisions pour risques à court terme (voir note 28)',
        comptes: ['499', '599'],
        exclusions: ['4998'],
        natureCreditrice: true,
        renvoi: '28',
      },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer le taux de rémunération si compte courant rémunéré ; ' +
      'commenter les dettes anciennes ; compte transitoire ajustement spécial : indiquer le détail du compte et ' +
      "la durée restant pour l'apurement.",
  },

  // ======================================================================
  // NOTE 20 · DQ (« 564, 565 ») et DR (« Soldes créditeurs : 52, 53, 561, 566 »)
  // ======================================================================
  {
    code: '20',
    titre: "BANQUES, CRÉDIT D'ESCOMPTE ET DE TRÉSORERIE",
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['DQ', 'DR'],
    rubriques: [
      { libelle: 'Escomptes de crédit de campagne', comptes: ['564'], natureCreditrice: true },
      { libelle: 'Escomptes de crédit ordinaires', comptes: ['565'], natureCreditrice: true },
      // Anomalie n° 13 : intitulé du texte, reproduit.
      { libelle: "TOTAL : BANQUES, CRÉDITS D'ESCOMPTE ET DE TRÉSORERIE", totalDeRubriques: [0, 1] },
      // 52 et 53 : filtre CREDITEUR, la règle même de DR (et le miroir de la
      // note 11, première tranche, qui filtre DEBITEUR).
      { libelle: 'Banques locales', comptes: ['521'], sens: 'CREDITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'CREDITEUR' },
      // Anomalie n° 14 : le 53 n'a aucune ligne dans la maquette et arrive
      // ici en bloc, 536 (intérêts courus des établissements financiers)
      // compris · par ricochet du jeton, pas par choix de ventilation.
      { libelle: 'Autres banques', comptes: ['523', '524', '525', '53'], sens: 'CREDITEUR' },
      // Anomalie n° 15 : le NB officiel conditionne la présence au sens du
      // compte principal, que la balance ne connaît pas ; le filtre par le
      // sens du 526 lui-même est la seule règle applicable, et c'est celle
      // que DR pose pour tout le 52.
      { libelle: 'Banques intérêts courus', comptes: ['526'], sens: 'CREDITEUR' },
      // Anomalie n° 27 : 561 et 566 ne sont PAS filtrés bien que DR le dise,
      // faute de poste d'accueil débiteur ; un solde débiteur y est anormal
      // et doit se voir en négatif plutôt que disparaître.
      { libelle: 'Crédit de trésorerie', comptes: ['561', '566'], natureCreditrice: true },
      { libelle: 'TOTAL : BANQUES, CRÉDITS DE TRÉSORERIE', totalDeRubriques: [3, 4, 5, 6, 7] },
      { libelle: 'TOTAL GÉNÉRAL', totalDeRubriques: [2, 8] },
    ],
    renvoiOfficiel: 'NB : Banques intérêts courus figure dans cette rubrique si le compte principal attaché est créditeur.',
    commentaire:
      "commenter toute variation significative ; indiquer le nom de l'organisme, les conditions de crédit, le " +
      "taux d'intérêt, la durée du crédit.",
  },

  // ======================================================================
  // NOTE 21 · TA (« 701 »), TB (« 702, 703, 704 »), TC (« 705, 706 »),
  // TD (« 707 »), TF (« 72 »), TG (« 71 »), TH (« 75 »)
  // ======================================================================
  {
    code: '21',
    titre: "CHIFFRE D'AFFAIRES ET AUTRES PRODUITS",
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['TA', 'TB', 'TC', 'TD', 'TF', 'TG', 'TH'],
    // Titre VII COMPTE 70 : chaque 701 à 706 est ventilé 70x1 dans la
    // Région, 70x2 hors Région (renvoi [7] du plan : hors entités du
    // groupe), 70x3 et 70x4 groupe (Région et hors Région), 70x5 sur
    // internet, 70x9 RRR accordés non ventilés.
    rubriques: [
      { libelle: 'Ventes de marchandises dans la région', comptes: ['7011'], natureCreditrice: true },
      { libelle: 'Ventes de marchandises hors région', comptes: ['7012'], natureCreditrice: true },
      { libelle: 'Ventes de marchandises groupe', comptes: ['7013', '7014'], natureCreditrice: true },
      { libelle: 'Ventes de marchandises sur internet', comptes: ['7015'], natureCreditrice: true },
      // Anomalie n° 16.
      {
        libelle: 'Rabais, remises et ristournes accordés sur ventes de marchandises (non ventilés)',
        comptes: ['7019'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL : VENTES MARCHANDISES', totalDeRubriques: [0, 1, 2, 3, 4] },
      // TB = produits finis (702), intermédiaires (703), résiduels (704).
      {
        libelle: 'Ventes de produits fabriqués dans la région',
        comptes: ['7021', '7031', '7041'],
        natureCreditrice: true,
      },
      { libelle: 'Ventes de produits fabriqués hors région', comptes: ['7022', '7032', '7042'], natureCreditrice: true },
      {
        libelle: 'Ventes de produits fabriqués groupe',
        comptes: ['7023', '7024', '7033', '7034', '7043', '7044'],
        natureCreditrice: true,
      },
      {
        libelle: 'Ventes de produits fabriqués sur internet',
        comptes: ['7025', '7035', '7045'],
        natureCreditrice: true,
      },
      {
        libelle: 'Rabais, remises et ristournes accordés sur ventes de produits fabriqués (non ventilés)',
        comptes: ['7029', '7039', '7049'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL : VENTES DE PRODUITS FABRIQUÉS', totalDeRubriques: [6, 7, 8, 9, 10] },
      // TC = travaux facturés (705), services vendus (706).
      { libelle: 'Ventes de travaux et services dans la région', comptes: ['7051', '7061'], natureCreditrice: true },
      { libelle: 'Ventes de travaux et services hors région', comptes: ['7052', '7062'], natureCreditrice: true },
      {
        libelle: 'Ventes de travaux et services groupe',
        comptes: ['7053', '7054', '7063', '7064'],
        natureCreditrice: true,
      },
      { libelle: 'Ventes de travaux et services sur internet', comptes: ['7055', '7065'], natureCreditrice: true },
      {
        libelle: 'Rabais, remises et ristournes accordés sur travaux et services (non ventilés)',
        comptes: ['7059', '7069'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL : VENTES DE TRAVAUX ET SERVICES VENDUS', totalDeRubriques: [12, 13, 14, 15, 16] },
      { libelle: 'Produits accessoires', comptes: ['707'], natureCreditrice: true },
      { libelle: "TOTAL : CHIFFRES D'AFFAIRES", totalDeRubriques: [5, 11, 17, 18] },
      { libelle: 'Production immobilisée', comptes: ['72'], natureCreditrice: true },
      { libelle: "Subventions d'exploitation", comptes: ['71'], natureCreditrice: true },
      // Anomalie n° 30 : TH = « 75 » en bloc, donc 759 (reprises de charges
      // pour dépréciations et provisions à court terme) compris, alors que
      // le Titre VII l'isole du reste du 75. La maquette n'a pas de ligne de
      // reprises ; couper le 75 ici ferait diverger la note de TH.
      { libelle: 'Autres produits', comptes: ['75'], natureCreditrice: true },
      { libelle: 'TOTAL : AUTRES PRODUITS', totalDeRubriques: [20, 21, 22] },
      { libelle: 'TOTAL', totalDeRubriques: [19, 23] },
    ],
    commentaire:
      'justifier toute variation significative ; détailler produits intermédiaires, produits résiduels, produits ' +
      'accessoires, autres produits si significatifs.',
  },

  // ======================================================================
  // NOTE 22 · RA (« 601 »), RC (« 602 »), RE (« 604, 605, 608 »)
  // ======================================================================
  {
    code: '22',
    titre: 'ACHATS',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['RA', 'RC', 'RE'],
    // Titre VII COMPTE 60 : 60x1 dans la Région et 60x2 hors Région (renvoi
    // [5] du plan : hors entités du groupe), 60x3 et 60x4 groupe, 60x5
    // frais sur achats (renvoi [6]), 60x9 RRR obtenus non ventilés.
    rubriques: [
      { libelle: 'Achats de marchandises dans la région', comptes: ['6011'] },
      { libelle: 'Achats de marchandises hors région', comptes: ['6012'] },
      { libelle: 'Achats de marchandises groupe', comptes: ['6013', '6014'] },
      // Anomalie n° 17.
      { libelle: 'Frais sur achats de marchandises', comptes: ['6015'] },
      {
        libelle: 'Rabais, remises et ristournes obtenus sur achats de marchandises (non ventilés)',
        comptes: ['6019'],
      },
      { libelle: 'TOTAL : ACHATS DE MARCHANDISES', totalDeRubriques: [0, 1, 2, 3, 4] },
      { libelle: 'Achats de matières premières et fournitures liées dans la région', comptes: ['6021'] },
      { libelle: 'Achats de matières premières et fournitures liées hors région', comptes: ['6022'] },
      { libelle: 'Achats de matières premières et fournitures liées groupe', comptes: ['6023', '6024'] },
      {
        libelle: 'Frais sur achats de matières premières et fournitures liées',
        comptes: ['6025'],
      },
      {
        libelle: 'Rabais, remises et ristournes obtenus sur achats de matières premières (non ventilés)',
        comptes: ['6029'],
      },
      { libelle: 'TOTAL : ACHATS MATIÈRES PREMIÈRES ET FOURNITURES LIÉES', totalDeRubriques: [6, 7, 8, 9, 10] },
      // ---- Autres achats · 604 (stockés), 605 (autres), 608 (emballages)
      { libelle: 'Matières consommables', comptes: ['6041'] },
      { libelle: 'Matières combustibles', comptes: ['6042'] },
      { libelle: "Produits d'entretien", comptes: ['6043'] },
      // Anomalie n° 19.
      { libelle: "Fournitures d'atelier, d'usine et de magasin", comptes: ['6044', '6046'] },
      { libelle: 'Eau', comptes: ['6051'] },
      { libelle: 'Électricité', comptes: ['6052'] },
      { libelle: 'Autres énergies', comptes: ['6053'] },
      { libelle: "Fourniture d'entretien", comptes: ['6054'] },
      { libelle: 'Fourniture de bureau', comptes: ['6047', '6055'] },
      { libelle: 'Petit matériel et outillages', comptes: ['6056'] },
      {
        libelle: 'Achats études, prestations de services, de travaux matériels et équipements',
        comptes: ['6057', '6058'],
      },
      { libelle: "Achats d'emballages", comptes: ['608'], exclusions: ['6085', '6089'] },
      { libelle: 'Frais sur achats', comptes: ['6045', '6085'] },
      // Anomalie n° 18 : libellé reproduit.
      { libelle: 'Remises rabais, remises et ristournes', comptes: ['6049', '6059', '6089'] },
      {
        libelle: 'TOTAL : AUTRES ACHATS',
        totalDeRubriques: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
      },
    ],
    commentaire: 'commenter toute variation significative.',
  },

  // ======================================================================
  // NOTE 23 · RG (« 61 »)
  // ======================================================================
  {
    code: '23',
    titre: 'TRANSPORTS',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['RG'],
    // Anomalie n° 20 : pas de 619 au plan, pas de ligne RRR dans la note.
    rubriques: [
      { libelle: 'Transports sur ventes', comptes: ['612'] },
      { libelle: 'Transports pour le compte de tiers', comptes: ['613'] },
      { libelle: 'Transport du personnel', comptes: ['614'] },
      { libelle: 'Transports de plis', comptes: ['616'] },
      { libelle: 'Autres transports', comptes: ['618'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4] },
    ],
    commentaire: 'commenter toute variation significative.',
  },

  // ======================================================================
  // NOTE 24 · RH (« 62, 63 »), un seul poste pour deux comptes principaux
  // ======================================================================
  {
    code: '24',
    titre: 'SERVICES EXTÉRIEURS',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['RH'],
    rubriques: [
      { libelle: 'Sous-traitance générale', comptes: ['621'] },
      { libelle: 'Locations et charges locatives', comptes: ['622'] },
      // 623 cité en bloc : le Titre VII le subdivise en 6232/6233/6234/6235,
      // le plan en 6232/6233/6234/6238 · anomalie n° 31, sans effet ici.
      { libelle: 'Redevances de location acquisition', comptes: ['623'] },
      { libelle: 'Entretien, réparations et maintenance', comptes: ['624'] },
      { libelle: "Primes d'assurance", comptes: ['625'] },
      { libelle: 'Études, recherches et documentation', comptes: ['626'] },
      { libelle: 'Publicité, publications, relations publiques', comptes: ['627'] },
      { libelle: 'Frais de télécommunications', comptes: ['628'] },
      { libelle: 'Frais bancaires', comptes: ['631'] },
      { libelle: "Rémunérations d'intermédiaires et de conseils", comptes: ['632'] },
      { libelle: 'Frais de formation du personnel', comptes: ['633'] },
      { libelle: 'Redevances pour brevets, licences, logiciels, concession et droits similaires', comptes: ['634'] },
      { libelle: 'Cotisations', comptes: ['635'] },
      // Anomalie n° 21 : 637 et 638. Le 638 est cité par le jeton « 63 »,
      // donc en bloc : le 6388 que le Titre VII lui donne et que le plan n'a
      // pas (anomalie n° 31) est sans effet sur ce calcul.
      { libelle: 'Autres charges externes', comptes: ['63'], exclusions: ['631', '632', '633', '634', '635'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
    ],
    commentaire: 'commenter toute variation significative.',
  },

  // ======================================================================
  // NOTE 25 · RI (« 64 »)
  // ======================================================================
  {
    code: '25',
    titre: 'IMPÔTS ET TAXES',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['RI'],
    rubriques: [
      { libelle: 'Impôts et taxes directs', comptes: ['641'] },
      { libelle: 'Impôts et taxes indirects', comptes: ['645'] },
      { libelle: "Droits d'enregistrement", comptes: ['646'] },
      { libelle: 'Pénalités et amendes fiscales', comptes: ['647'] },
      { libelle: 'Autres impôts et taxes', comptes: ['648'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4] },
    ],
    commentaire: 'commenter toute variation significative ; détailler les pénalités et amendes et indiquer la cause.',
  },

  // ======================================================================
  // NOTE 26 · RJ (« 65 »), 659 compris (le ch. 7 remonte le 65 en bloc)
  // ======================================================================
  {
    code: '26',
    titre: 'AUTRES CHARGES',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['RJ'],
    rubriques: [
      { libelle: 'Pertes sur créances clients', comptes: ['6511'] },
      { libelle: 'Pertes sur autres débiteurs', comptes: ['6515'] },
      { libelle: 'Quote-part de résultat sur opérations faites en commun', comptes: ['652'] },
      { libelle: "Valeur comptable des cessions courantes d'immobilisations", comptes: ['654'] },
      { libelle: "Indemnités de fonction et autres rémunérations d'administrateurs", comptes: ['6581'] },
      { libelle: 'Dons et mécénat', comptes: ['6582', '6583'] },
      // Anomalie n° 22 : 656, 657 et 6588.
      {
        libelle: 'Autres charges diverses',
        comptes: ['65'],
        exclusions: ['651', '652', '654', '6581', '6582', '6583', '659'],
      },
      {
        libelle: "Charges pour provisions et provisions pour risques à court terme d'exploitation (voir note 28)",
        comptes: ['659'],
        renvoi: '28',
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
    commentaire:
      "commenter toute variation significative ; indiquer la date du PV de l'AGO ou du CA qui fixe les " +
      'rémunérations des administrateurs ; indiquer les organismes bénéficiaires des dons.',
  },

  // ======================================================================
  // NOTE 27A · RK (« 66 »)
  // ======================================================================
  {
    code: '27A',
    titre: 'CHARGES DE PERSONNEL',
    colonnes: COLONNES_N_N1_POURCENT,
    // Anomalie n° 25.
    renvoyeeDepuis: ['RK'],
    rubriques: [
      // 661 personnel national, 662 personnel non national : une seule ligne dans la note.
      { libelle: 'Rémunérations directes versées au personnel', comptes: ['661', '662'] },
      { libelle: 'Indemnités forfaitaires versées au personnel', comptes: ['663'] },
      { libelle: 'Charges sociales', comptes: ['664'] },
      { libelle: "Rémunérations et charges sociales de l'exploitant individuel", comptes: ['666'] },
      // Titre VIII ch. 27 et Titre VII COMPTE 66 : le 667 reçoit le 637 en clôture.
      { libelle: 'Rémunération transférée de personnel extérieur', comptes: ['667'] },
      { libelle: 'Autres charges sociales', comptes: ['668'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature et la durée du contrat du personnel extérieur.',
  },

  // ======================================================================
  // NOTE 27B · codes YA à YO, les seuls codes de rubrique portés par une
  // note annexe ; deux sous-tableaux (anomalie n° 23)
  // ======================================================================
  {
    code: '27B',
    sousTableau: '1. Personnel propre',
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTÉRIEUR',
    horsBalance: true,
    // Un effectif n'est dans aucun compte ; la masse salariale par sexe et
    // par zone n'y est pas davantage (le 66 distingue national / non
    // national, pas les zones OHADA ni le sexe). Tout est en saisie.
    colonnes: colonnesEffectifs('MASSE SALARIALE'),
    renvoyeeDepuis: ['RK'],
    rubriques: [
      { cle: 'YA', libelle: 'YA · 1. Cadres supérieurs', saisie: true },
      { cle: 'YB', libelle: 'YB · 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { cle: 'YC', libelle: 'YC · 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { cle: 'YD', libelle: 'YD · 4. Employés, manœuvres, ouvriers, et apprentis', saisie: true },
      { cle: 'YE', libelle: 'YE · TOTAL (1)', saisie: true },
      { cle: 'YF', libelle: 'YF · Permanents', saisie: true },
      { cle: 'YG', libelle: 'YG · Saisonniers', saisie: true },
    ],
    commentaire: 'faire un commentaire si nécessaire en cas de mouvement significatif du personnel.',
  },
  {
    code: '27B',
    sousTableau: '2. Personnel extérieur',
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTÉRIEUR',
    horsBalance: true,
    colonnes: colonnesEffectifs("FACTURATION À L'ENTITÉ"),
    renvoyeeDepuis: ['RK'],
    rubriques: [
      { cle: 'YH', libelle: 'YH · 1. Cadres supérieurs', saisie: true },
      { cle: 'YI', libelle: 'YI · 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { cle: 'YJ', libelle: 'YJ · 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { cle: 'YK', libelle: 'YK · 4. Employés, manœuvres, ouvriers, et apprentis', saisie: true },
      { cle: 'YL', libelle: 'YL · TOTAL (2)', saisie: true },
      { cle: 'YM', libelle: 'YM · Permanents', saisie: true },
      { cle: 'YN', libelle: 'YN · Saisonniers', saisie: true },
      { cle: 'YO', libelle: 'YO · TOTAL (1 + 2)', saisie: true },
    ],
  },
];

/**
 * Codes officiels de cette tranche, dans l'ordre de la liste du ch. 6
 * section 2. Exporté pour que le spec compare la transcription à la liste
 * plutôt qu'à elle-même.
 */
export const CODES_NOTES_SYSCOHADA_2 = [
  '16A', '16B', '16B bis', '16C', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27A', '27B',
];

/**
 * Préfixes que cette tranche cite SANS qu'aucun poste du ch. 7 ne les
 * réclame · anomalie n° 11. Exporté pour que le spec tolère exactement
 * ceux-là et rien d'autre.
 */
export const COMPTES_NOTES_2_HORS_POSTE_JUSTIFIES: { prefixe: string; note: string; anomalie: number }[] = [
  { prefixe: '186', note: '19', anomalie: 11 },
  { prefixe: '187', note: '19', anomalie: 11 },
  { prefixe: '188', note: '19', anomalie: 11 },
];

/**
 * Rubriques que cette tranche AJOUTE aux maquettes des notes 21 et 22 pour
 * que le total de chaque bloc égale son poste du compte de résultat · les
 * comptes de RRR et de frais sur achats « non ventilés » du plan (60x5,
 * 60x9, 70x9) n'ont aucune ligne officielle. Anomalies n° 16 et 17.
 *
 * Cette liste EXISTE parce que la marque ne peut pas vivre sur la rubrique :
 * le seul champ libre de `RubriqueNote` est `renvoi`, que
 * `note-annexe.types.ts` réserve au « renvoi de bas de tableau du texte
 * officiel, reproduit tel quel ». Y loger notre propre phrase la ferait
 * lire comme officielle à l'écran comme à l'export · exactement ce que
 * CLAUDE.md §9 interdit. Le spec relit cette liste pour vérifier que les
 * lignes ajoutées sont celles-là et rien d'autre.
 */
export const RUBRIQUES_HORS_MAQUETTE_NOTES_2: { note: string; libelle: string; anomalie: number }[] = [
  {
    note: '21',
    libelle: 'Rabais, remises et ristournes accordés sur ventes de marchandises (non ventilés)',
    anomalie: 16,
  },
  {
    note: '21',
    libelle: 'Rabais, remises et ristournes accordés sur ventes de produits fabriqués (non ventilés)',
    anomalie: 16,
  },
  {
    note: '21',
    libelle: 'Rabais, remises et ristournes accordés sur travaux et services (non ventilés)',
    anomalie: 16,
  },
  { note: '22', libelle: 'Frais sur achats de marchandises', anomalie: 17 },
  {
    note: '22',
    libelle: 'Rabais, remises et ristournes obtenus sur achats de marchandises (non ventilés)',
    anomalie: 17,
  },
  { note: '22', libelle: 'Frais sur achats de matières premières et fournitures liées', anomalie: 17 },
  {
    note: '22',
    libelle: 'Rabais, remises et ristournes obtenus sur achats de matières premières (non ventilés)',
    anomalie: 17,
  },
];
