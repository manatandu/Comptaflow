/**
 * Maquettes officielles du SYSTÈME MINIMAL DE TRÉSORERIE (S.M.T) du
 * SYSCOHADA révisé et rattachement DÉRIVÉ des comptes.
 *
 * Sources, toutes LUES au moment de la transcription (CLAUDE.md §1 : jamais
 * de mémoire, jamais complété depuis le SYCEBNL) :
 *  - AUDCIF Titre X « Présentation des états financiers annuels du Système
 *    minimal de trésorerie », ch. 1 (règles de présentation, structure des
 *    états), ch. 2 (bilan et compte de résultat SMT), ch. 3 (NOTE 1 à
 *    NOTE 4 et journaux de suivi) · skill `audcif-acte-uniforme`,
 *    references/titre-10-systeme-minimal-tresorerie.md, lu en entier ·
 *    c'est la source primaire des libellés, des renvois de notes, des
 *    lettres A à G et de l'ordre des lignes ;
 *  - AUDCIF art. 11, 13, 21 et 28 (systèmes, seuils, comptabilité de
 *    trésorerie) · references/titre-1-ch1-3-champ-organisation-etats.md ;
 *  - AUDCIF Titre VII, fiches COMPTE 103, 104, 12, 13, 14, 15, 16, 17, 18,
 *    19, 49, 56, 57, 58, 59, 603, 62/63, 66, 68, 69, 73, 81 à 89 · pour
 *    justifier chaque rattachement ci-dessous ;
 *  - le plan de comptes SYSCOHADA semé (`compte-seed-syscohada.ts`, généré
 *    depuis skill `syscohada`, comptes/references/plan-comptes.tsv) · chaque
 *    préfixe cité ici y a été vérifié, et le spec voisin le revérifie ;
 *  - en AIDE seulement, la construction dérivée du moteur Python du skill
 *    `syscohada` (liasse/references/correspondance-smt.tsv et notes-smt.md) ·
 *    chacune de ses lignes a été recoupée au Titre X et au plan, et les
 *    écarts avec elle sont dits dans la section ANOMALIES ET CHOIX.
 *
 * Même FORME que `etats-financiers/correspondance-smt.ts` (SYCEBNL) pour que
 * le service SMT SYSCOHADA reprenne la même mécanique (postes de bilan lus
 * dans les soldes, postes de flux lus dans les CONTREPARTIES des mouvements
 * de trésorerie, retraitements de variation, ventilation de la Note 4,
 * contrôle d'éligibilité). Aucun compte, aucun poste, aucun libellé, aucun
 * code n'en est repris : les deux référentiels ne partagent que la
 * mécanique (CLAUDE.md §6).
 *
 * ## Le Titre X ne donne PAS de tableau de correspondance
 *
 * Le Titre IX ch. 7 fournit, pour le Système normal, un tableau officiel
 * poste → comptes, et `correspondance-bilan-syscohada.ts` s'y adosse ligne
 * à ligne. Le Titre X n'en comporte aucun : il ne donne que les maquettes
 * (libellé, renvoi de note, lettres A à G). Le rattachement ci-dessous est
 * donc DÉRIVÉ du plan de comptes SYSCOHADA lui-même (source officielle),
 * par lecture du libellé de chaque poste et de la fiche Titre VII de chaque
 * compte. « Caisse » va au 57 parce que le compte 57 s'intitule « Caisse »
 * (Titre VII COMPTE 57), pas parce qu'un tableau l'a écrit. Chaque poste
 * porte dans `fondement` la justification de son rattachement, et chaque
 * choix qui n'était pas le seul possible est dit dans la section ANOMALIES
 * ET CHOIX plutôt que masqué.
 *
 * ## Le Titre X ne donne PAS de codes REF
 *
 * Le Système normal code ses lignes (AD à DZ, TA à XI, ZA à ZH) ; les
 * maquettes du Titre X n'impriment aucun code, seulement les lettres A, B,
 * C, F et G du compte de résultat. Les codes ci-dessous sont donc CHOISIS
 * par OmegaX, et stables : « SA » actif SMT, « SP » passif SMT, « SR »
 * recettes, « SD » dépenses, « SV » variations, « SF » dotations, « SG »
 * résultat, numérotés dans l'ordre de la maquette, le total de chaque bloc
 * portant un suffixe lettre (SAZ, SPZ) ou la lettre officielle (SRA = A,
 * SDB = B, SC = C). Ils servent d'identifiant d'API et de clé d'export ;
 * ils ne sont imprimés nulle part comme s'ils étaient officiels. Ne pas
 * les renuméroter : le client, les exports et les tests s'y réfèrent.
 *
 * ## Comptabilité de trésorerie · ce qui commande la construction
 *
 * Titre X ch. 1 § 1 : le SMT « repose sur l'établissement d'un état des
 * recettes et des dépenses dégageant le résultat de l'exercice (recette
 * nette ou perte nette), dressé à partir d'une comptabilité de trésorerie »
 * (art. 21 : les petites entités de l'art. 13 « tiennent une comptabilité
 * de trésorerie »). Sa fiabilité repose sur « un journal unique de
 * trésorerie (NOTE 4) », « un journal de suivi des créances impayées et un
 * journal de suivi des dettes à payer » et la conservation des pièces. En
 * fin d'exercice, « inventaire extra-comptable » de QUATRE éléments :
 * créances et dettes d'exploitation, stocks et travaux en cours,
 * immobilisations acquises ou cédées, emprunts souscrits ou remboursés.
 *
 * D'où la structure du compte de résultat (ch. 2 § 2) : un solde de CAISSE
 * C = A – B, puis trois corrections de variation (stocks, créances, dettes)
 * et les dotations F, pour arriver au résultat G = C – D + E – F. Les postes
 * de recettes et de dépenses ne sont donc PAS lus dans les soldes des
 * classes 6, 7 et 8 (ce serait déjà de l'engagement, et les variations
 * compteraient deux fois) : ils sont lus dans les CONTREPARTIES des
 * mouvements de trésorerie, c'est-à-dire dans la matière du journal de la
 * NOTE 4. C'est la mécanique du service SMT SYCEBNL, reprise à l'identique.
 *
 * ## Un dossier SMT dans OmegaX reste en partie double
 *
 * OmegaX tient un livre-journal en partie double quel que soit le système.
 * Choisir le SMT (`systemeComptableSyscohada`) change la PRÉSENTATION des
 * états et le jeu produit, pas le moteur. Les deux tenues fonctionnent :
 * achat saisi 60 / 57 (trésorerie pure : classe 4 vide, variations nulles),
 * ou facture 60 / 401 puis règlement 401 / 57 (le règlement est la dépense
 * de caisse, la variation des dettes rétablit la charge non payée · le
 * résultat G est le même, mais la ventilation par nature se dégrade : un
 * règlement fournisseur tombe en « Autres dépenses » faute de dire de quelle
 * charge il s'agit ; le drill-down le montre compte par compte).
 *
 * ## ANOMALIES ET CHOIX · rien n'est corrigé en silence (CLAUDE.md §9)
 *
 * Numérotés pour être cités depuis le spec et le service.
 *
 * 1. **Lettres D et E non attribuées** [texte officiel] · la maquette du
 *    compte de résultat imprime « G = C – D + E – F » mais n'attribue les
 *    lettres D et E à aucune ligne ; les seules lettres portées sont A, B,
 *    C, F, G. La transcription du skill note en outre la coquille
 *    « Variaios des stocks » pour « Variation des stocks ». Lecture retenue,
 *    la seule cohérente avec les opérateurs imprimés : D = somme des deux
 *    lignes précédées de « – » (variation des stocks, variation des
 *    créances), E = la ligne précédée de « + » (variation des dettes
 *    d'exploitation). Exposée par `LETTRES_D_E` et `calculerResultatSmt`.
 *
 * 2. **Sens de la « Variation N / N-1 »** [texte officiel] · la maquette
 *    imprime « – Variation des stocks », « – Variation des créances »,
 *    « + Variation des dettes d'exploitation », sans dire dans quel ordre
 *    la différence se prend. Lue comme N - (N-1), cette signature est
 *    l'INVERSE du passage de la trésorerie au résultat (un stock ou une
 *    créance qui augmente AJOUTE au résultat, une dette qui augmente le
 *    RÉDUIT). Lue comme (N-1) - N, c'est-à-dire stock initial moins stock
 *    final comme le fait le compte 603 (Titre VII COMPTE 603 : variation
 *    des stocks de biens achetés, charge de sens « débiteur ou créditeur »),
 *    les trois opérateurs et la formule G = C – D + E – F deviennent
 *    exacts. Choix : les opérateurs officiels sont conservés tels quels
 *    (`signeOfficiel`) et chaque variation est DÉFINIE comme (N-1) - N
 *    (`DEFINITION_VARIATION`), ce qui est aussi la convention du 603. Le
 *    moteur Python du skill (correspondance-smt.tsv, ligne KZC) a fait le
 *    choix inverse (variation N - (N-1) et opérateurs retournés) : même
 *    résultat, autre présentation. `calculerResultatSmt` fixe la lecture et
 *    le spec la vérifie sur un exemple chiffré.
 *
 * 3. **Art. 28 contre Titre X ch. 1 § 2** [texte officiel] · l'article 28
 *    de l'AUDCIF dit que le SMT « repose sur l'établissement d'un Bilan,
 *    d'un Compte de résultat, d'un Tableau de flux de trésorerie et de
 *    Notes annexes », alors que le Titre X ch. 1 § 2 énumère TROIS
 *    documents (Bilan, Compte de résultat, Notes annexes) et ne donne
 *    aucune maquette de TFT pour le SMT. Choix : le jeu produit est celui
 *    du Titre X, qui seul fournit les maquettes ; aucun TFT n'est inventé.
 *    `DOCUMENTS_SMT` le dit.
 *
 * 4. **Renvoi NOTE 1 sur « Compte exploitant »** [texte officiel] · le
 *    bilan renvoie le poste passif « Compte exploitant » à la NOTE 1, qui
 *    est le « Tableau SMT de suivi du matériel, du mobilier et des
 *    cautions ». Le lien n'est pas évident (la Note 1 ne comporte aucune
 *    colonne d'apport ou de prélèvement). Transcrit tel quel, sans
 *    interprétation ; le renvoi imprimé reste « 1 ».
 *
 * 5. **Dépréciations de tiers et de trésorerie (49, 59)** · le Titre X n'a
 *    qu'une colonne de montant au bilan (pas de Brut / Amort. / Net) : les
 *    postes portent des valeurs NETTES. Les comptes 490 à 498
 *    (« dépréciations subies par des comptes de tiers », Titre VII COMPTE
 *    49) et 590, 591 (dépréciations des titres de placement et des valeurs
 *    à encaisser, COMPTE 59) viennent donc EN MOINS de « Clients et
 *    débiteurs divers », et 592 à 594 en moins de « Banque ». Ils sont
 *    rattachés SANS filtre de sens (`comptesSansFiltreDeSens`) parce que le
 *    filtre « débiteur » du poste les écarterait. Le 499 « Provisions pour
 *    risques à court terme » et le 599 « Provisions pour risque à court
 *    terme à caractère financier » ne sont pas des dépréciations d'actif
 *    mais des passifs : ils vont en « Fournisseurs et créditeurs divers ».
 *    ÉCART avec correspondance-smt.tsv, qui met le 49 EN BLOC (499 compris)
 *    en moins des créances ; ici seul 490 à 498 y va, le 499 reste au
 *    passif, comme au Système normal (ch. 7 : 499 en DN).
 *
 * 6. **Titres de placement (50) et valeurs à encaisser (51)** · ni caisse,
 *    ni banque au sens du libellé. Rattachés à « Clients et débiteurs
 *    divers » (comme le fait correspondance-smt.tsv) : un chèque à encaisser
 *    (513) est une créance en attente de règlement, un titre de placement
 *    une somme due par un émetteur. L'autre lecture possible (reste de la
 *    classe 5 en « Banque ») est celle du jeu SMT SYCEBNL pour SON plan ;
 *    elle n'est pas retenue ici, le libellé « Banque » du Titre X étant
 *    plus étroit que « Banque et autres » aurait été. Sans filtre de sens :
 *    ils restent à l'actif quel que soit leur solde.
 *
 * 7. **Banque (en + ou en –)** · 52 Banques, 53 Établissements financiers
 *    et assimilés, 54 Instruments de trésorerie, 55 Instruments de monnaie
 *    électronique, 56 Banques crédits de trésorerie et d'escompte, 58
 *    Régies d'avances, accréditifs et virements internes. Le « (en + ou en
 *    -) » de la maquette autorise le solde négatif : le découvert (52
 *    créditeur) et les crédits de trésorerie (56, créditeur par nature)
 *    restent à l'actif en négatif, il n'y a PAS de poste de trésorerie
 *    passif au SMT (lecture du skill sous la maquette, confirmée par
 *    l'absence de toute ligne de ce genre au passif). Les 585 et 588
 *    (virements internes) « doivent être soldés » à la clôture (Titre VII
 *    COMPTE 58) ; un reliquat n'est pas masqué, il ressort ici en « Banque »
 *    et se voit au drill-down. Un 57 créditeur « constitue une présomption
 *    d'irrégularité » (COMPTE 57) : il ressort en Caisse négative, jamais
 *    filtré.
 *
 * 8. **« Compte exploitant » élargi à tout 10, 11, 12, 14, 15** · le
 *    libellé vise le 103 « Capital personnel » et le 104 « Compte de
 *    l'exploitant » (Titre VII COMPTE 103 et 104 : capitaux propres de
 *    l'entité individuelle, le 104 étant « un démembrement du compte 103 »
 *    « systématiquement soldé à la clôture »). Mais la maquette n'ouvre que
 *    deux lignes de capitaux propres (Compte exploitant, Résultat) : les
 *    réserves (11), le report à nouveau (12, « élément des capitaux
 *    propres », COMPTE 12), les subventions d'investissement (14, « au
 *    passif du bilan, parmi les capitaux propres », COMPTE 14), les
 *    provisions réglementées (15) et le reste du 10 (101 capital social,
 *    102, 105, 106, 109) n'ont aucun autre poste d'accueil. Ils sont
 *    rattachés ici ; un 109 ou un 129 débiteur ressort en négatif (COMPTE
 *    109 et 12 : « en moins »), jamais filtré.
 *
 * 9. **« Emprunt » élargi à 16, 17, 18, 19** · le 16 « Emprunts et dettes
 *    assimilées » est le cœur du poste. Le 17 « Dettes de location
 *    acquisition » est un financement d'immobilisation (COMPTE 17), le 18
 *    porte les dettes liées à des participations et les comptes de liaison,
 *    le 19 « Provisions pour risques et charges » est un « passif externe
 *    (dette) » inscrit « dans les dettes financières et ressources
 *    assimilées » (COMPTE 19). Aucun n'a d'autre poste d'accueil dans une
 *    maquette à quatre lignes de passif. Les comptes de liaison 185 à 188
 *    sont rattachés en bloc avec le 18 : un solde débiteur y ressort en
 *    négatif et se voit, comme pour 585/588.
 *
 * 10. **Impôt sur le résultat (89) en « Dépenses sur impôts et taxes »** ·
 *    la maquette n'a qu'une ligne fiscale, sans distinguer les impôts et
 *    taxes (64) de l'impôt sur le résultat (89, « part de bénéfice affectée
 *    obligatoirement à l'État », Titre VII COMPTE 89). Un impôt payé passe
 *    ici, comme le fait correspondance-smt.tsv (ligne JD).
 *
 * 11. **Variation des stocks lue dans la classe 3, jamais dans 603 / 73** ·
 *    les comptes 603 et 73 sont des comptes d'inventaire (Titre VII COMPTE
 *    603 et 73) sans contrepartie de trésorerie : ils n'apparaissent jamais
 *    dans les postes de flux. La ligne « Variation des stocks » est lue
 *    dans le poste Stocks du bilan, clôture et ouverture, exactement comme
 *    la NOTE 2 la déduit (« VALEUR DU STOCK FINAL » moins « VALEUR DU STOCK
 *    INITIAL »). L'aide correspondance-smt.tsv, qui lit des SOLDES, écarte
 *    pour cette raison le 603 de sa ligne JA (« 60 sauf 603 ») et n'inscrit
 *    le 73 dans aucune de ses lignes de recettes ; lu en flux, il n'y a rien
 *    à exclure et rien n'est compté deux fois.
 *
 * 12. **Colonne « compte exploitant » de la NOTE 4** · le NB officiel dit
 *    que les colonnes de ventilation « peuvent être complétées en cas de
 *    besoin par des rajouts notamment "compte exploitant" ». Les apports et
 *    prélèvements temporaires de l'exploitant (104) et ses apports
 *    définitifs (103) sont le cas courant des entités visées : la colonne
 *    est ajoutée, marquée `rajoutAutorise: true` pour qu'aucun export ne la
 *    présente comme colonne imprimée par le texte. Elle reste purement
 *    INFORMATIVE : ces comptes n'entrent dans AUCUN poste SR/SD (anomalie
 *    n° 13), la colonne ne fait donc pas partie de la somme A ou B.
 *
 * 13. **Classes 1 et 2 exclues de SR2 / SD6** [choix motivé par le texte]
 *    · les totaux du compte de
 *    résultat sont intitulés « TOTAL DES RECETTES SUR PRODUITS » (A) et
 *    « TOTAL DÉPENSES SUR CHARGES » (B) : des rubriques de produits et de
 *    charges, pas la totalité des flux de caisse. Le ch. 1 § 1 traite par
 *    ailleurs « le montant des immobilisations acquises ou cédées » et « le
 *    montant des emprunts souscrits ou remboursés » comme deux des QUATRE
 *    éléments de l'inventaire EXTRA-COMPTABLE, à côté des deux autres
 *    (créances/dettes, stocks) qui, eux, alimentent les lignes D et E. Un
 *    emprunt encaissé (16), un remboursement d'emprunt, un apport ou un
 *    retrait de l'exploitant (103, 104) et l'acquisition ou la cession
 *    d'une immobilisation (classe 2) sont donc des mouvements de BILAN
 *    (postes Emprunt, Compte exploitant, Immobilisations via la NOTE 1 et
 *    les dotations F), jamais des lignes A ou B : les y inclure ferait
 *    entrer un flux de financement dans un résultat d'exploitation et
 *    casserait l'égalité entre G et le « Résultat exercice » du bilan.
 *    Exemple : un emprunt de 1 000 encaissé, seul mouvement de l'exercice,
 *    donnerait A = 1 000 et G = 1 000 alors que le résultat comptable (lu
 *    dans les classes 6/7/8 ou le compte 13) resterait nul.
 *
 *    C'est un ÉCART assumé avec la version précédente de ce fichier, qui
 *    prenait par exclusion TOUTE contrepartie des classes 1 à 8, en
 *    renvoyant le tri à un service qui aurait « isolé les classes 1 à 3 en
 *    flux hors exploitation » · une table doit trancher elle-même ce
 *    qu'elle rattache, un service à écrire ne rattrape rien. Le jeu SMT du
 *    SYCEBNL, bâti sur une autre maquette et un autre plan, n'est pas une
 *    source pour le SYSCOHADA (CLAUDE.md §6) et ne fixe donc pas non plus
 *    ce point : SR2 et SD6 sont ici bornés à
 *    `CONTREPARTIES_RESULTAT_SMT_SYSCOHADA`, dont le critère est écrit sur
 *    la constante · un compte n'entre en A ou en B que s'il est un produit
 *    ou une charge (classes 6, 7, 8) OU s'il appartient à un poste de bilan
 *    porteur d'une ligne de variation qui le corrigera (SA2 → SV1, SA3 →
 *    SV2, SP4 → SV3, soit les classes 3 et 4, plus 50, 51, 590, 591 et 599 ·
 *    anomalie n° 15). Les classes 1 et 2, elles, n'ont aucune ligne de
 *    variation : aucun de leurs comptes n'entre plus dans un poste de flux,
 *    ce que le spec vérifie compte par compte contre le plan semé. Ils sont
 *    nommés à part (`CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA`) pour que le
 *    service les présente en flux de financement et d'investissement plutôt
 *    que de les perdre. Les colonnes « Autres » de la NOTE 4 ne sont PAS
 *    bornées de la même façon : le journal doit porter tous les mouvements
 *    de trésorerie (anomalie n° 21).
 *
 *    ÉCART, également, avec l'aide `correspondance-smt.tsv` : elle limite
 *    KB à 71, 72, 75, 77, 78, 79, 82, 84, 86, 88 et JF à 61, 62 (hors 622),
 *    63, 65, 81, 83, 87 · aucune classe 4 dans l'un ni l'autre. Elle calcule
 *    apparemment A et B en ENGAGEMENT (soldes des classes 6/7/8), pas en
 *    trésorerie. Ce fichier-ci reste fidèle à la lecture par CONTREPARTIE
 *    de caisse (ch. 1 § 1 : « comptabilité de trésorerie »), seule cohérente
 *    avec les lignes D/E : une contrepartie de classe 4 DOIT rester en A/B
 *    pour que la variation des créances/dettes (NOTE 3) la corrige ensuite,
 *    sans quoi la correction s'appliquerait à un montant jamais compté.
 *    L'écart avec la classe 4 de l'aide est assumé, l'écart avec les
 *    classes 1 et 2 (déjà annoncé par l'en-tête de la version précédente
 *    mais non détaillé) est ici corrigé.
 *
 * 14. **Les comptes de TRÉSORERIE ne sont jamais leur propre contrepartie**
 *    · un virement interne caisse ↔ banque (57/52, 585/588…) a pour
 *    contrepartie un AUTRE compte de trésorerie : ni une recette sur
 *    activité, ni une dépense sur charge, seulement un déplacement d'un
 *    compte de trésorerie à un autre. `CONTREPARTIES_RESULTAT_SMT_SYSCOHADA`
 *    ne comporte donc aucun compte de trésorerie (52 à 58, 57 · voir
 *    `COMPTES_TRESORERIE_SMT_SYSCOHADA`, exportée pour le service, qui
 *    laisse 592 à 594 de côté puisque ce sont des dépréciations et non des
 *    avoirs · `COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA`) :
 *    un tel virement n'entre dans AUCUN poste de flux, il reste visible
 *    dans le journal de la NOTE 4 (« un journal par banque et un journal
 *    pour la caisse », ch. 3), seul à en rendre compte. Sans ce filtre,
 *    chaque virement aurait gonflé A ET B du même montant : sans effet sur
 *    C ni G (les deux s'annulent en A - B), mais en faussant les deux
 *    totaux imprimés.
 *
 * 15. **Titres de placement (50) et valeurs à encaisser (51) restent en
 *    A / B, comme les tiers** · à la différence des comptes de trésorerie
 *    eux-mêmes, 50, 51 (et les dépréciations 590, 591, ainsi que la
 *    provision 599 rattachée à SP4) suivent le sort de la classe 4 dans
 *    `CONTREPARTIES_RESULTAT_SMT_SYSCOHADA` : ils sont rattachés à SA3 ou
 *    à SP4 au bilan (anomalie n° 6) au même titre qu'une créance,
 *    et la variation de SA3 (SV2) ne corrige correctement le résultat que
 *    si les mouvements de caisse dont ils sont la contrepartie restent
 *    comptés en A ou B. Les exclure comme les comptes de trésorerie
 *    casserait la formule G = C – D + E – F.
 *
 * 16. **Dépréciation d'un compte de trésorerie (592 à 594, contrepartie
 *    679) : trou du texte, non comblé** [texte officiel] · Titre VII
 *    COMPTE 59 : les comptes 592 à 594 sont « crédités... par le débit du
 *    compte 679 » et « débités... par le crédit du compte 779 ». Cette
 *    écriture ne comporte AUCUNE contrepartie de trésorerie (679 et 779
 *    sont des comptes de charge et de produit financiers, non de caisse) :
 *    elle n'entre donc dans aucun poste SR/SD, ce qui est correct. Mais
 *    elle n'entre pas non plus dans F (`COMPTES_DOTATIONS_SMT_SYSCOHADA` =
 *    68, 69, 85 seulement, jamais 679) ni dans une ligne de variation : SA2
 *    (stocks), SA3 (créances) et SP4 (dettes) ont chacun leur ligne SV1 à
 *    SV3, mais SA5 (Banque) n'en a AUCUNE, faute de ligne officielle
 *    « Variation de banque » dans la maquette du ch. 2 § 2. Le G calculé
 *    ici ignore donc une dépréciation de compte bancaire (et sa reprise
 *    779), alors que le « Résultat exercice » du bilan (lu dans les
 *    classes 6/7/8 ou le compte 13) la reflète. C'est un TROU DU TEXTE, pas
 *    une erreur de ce fichier : le SMT, système minimal pour de très
 *    petites entités, n'a manifestement pas anticipé la dépréciation d'un
 *    compte bancaire. Aucune ligne non officielle n'est inventée pour le
 *    combler ; le service devra exposer l'écart entre G et le « Résultat
 *    exercice » comme un écart de concordance (même mécanisme que
 *    `resultatClasses678` / `resultatCompte13` / `doubleComptageProbable`),
 *    jamais le masquer. Les dotations 659 (stocks/créances, contrepartie
 *    39/49) et la part du 679 qui vise 590/591 n'ont PAS ce défaut : leurs
 *    comptes de contrepartie sont dans le périmètre NET de SA2/SA3, donc
 *    SV1/SV2 les rattrapent (Titre VII COMPTE 659 : « débité par le crédit
 *    des comptes 39 et 49 » ; COMPTE 59 : dépréciations « portées à l'actif
 *    du bilan, en diminution »). Seul le sous-ensemble qui vise la classe 5
 *    stricte (592 à 594, typiquement via 6798) échappe à toute variation.
 *
 * 17. **Charges d'intérêts (SD5) = compte 67 en entier** [choix, faute de
 *    ligne officielle plus fine] · le libellé de la maquette dit « Charges
 *    d'intérêts », mais le préfixe retenu est le 67 entier, qui vaut
 *    « l'ensemble des charges financières » (Titre VII COMPTE 67) : outre
 *    les intérêts (671, 672, 674, 675), il capte 673 Escomptes accordés,
 *    676 Pertes de change financières, 677 Pertes sur titres de placement,
 *    678 Pertes et charges sur risques financiers et 679 Charges pour
 *    dépréciations financières (plan de comptes SYSCOHADA). Ces charges-là
 *    ne sont pas des intérêts ; les sortir les aurait renvoyées en « Autres
 *    dépenses sur activités », ce que le texte ne dit pas davantage, et le
 *    montant serait le même en B. Le choix est celui de l'aide
 *    correspondance-smt.tsv (ligne JE, « 67 »), mais il est ÉCRIT ici et
 *    dans le fondement de SD5, pas masqué derrière une liste tronquée.
 *
 * 18. **Malis sur emballages (6224) comptés en « Dépenses sur loyers »**
 *    [anomalie du plan, signalée et non corrigée] · le poste SD2 prend le
 *    622 « Locations, charges locatives » par préfixe, donc aussi le 6224
 *    « Malis sur emballages » (plan de comptes SYSCOHADA, fiche Titre VII
 *    COMPTE 62). Un mali sur emballages consignés est une charge de
 *    non-restitution, pas un loyer. Il est néanmoins laissé là où le plan
 *    OFFICIEL le range : l'en écarter obligerait à inventer un aiguillage
 *    que le Titre X ne prévoit pas, couperait en deux un même compte
 *    divisionnaire entre « Dépenses sur loyers » et « Autres dépenses », et
 *    désaccorderait le poste SD2 de la colonne « Loyers » de la NOTE 4, qui
 *    n'a de toute façon aucune autre colonne d'accueil. L'écart est écrit
 *    ici et dans le fondement de SD2 plutôt que masqué ; le drill-down
 *    montre le 6224 ligne à ligne. Même lecture que l'aide
 *    correspondance-smt.tsv (ligne JB, « 622 » sans exclusion).
 *
 * 19. **NOTE 3 : deux tableaux, deux totaux** · le ch. 3 imprime un tableau
 *    Créances (« Nom du client », « TOTAL DES CRÉANCES ») et un tableau
 *    Dettes (« Nom du fournisseur », « TOTAL DES DETTES ») distincts, pas
 *    une liste fusionnée. `NOTES_SMT_SYSCOHADA[2]` porte désormais
 *    `sousTableaux`, sur le modèle des lignes de synthèse déjà transcrites
 *    pour la NOTE 2 (`LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA`).
 *
 * 20. **Demi-cadratin des libellés officiels, transcrit tel quel** · les
 *    maquettes des ch. 2 et 3 impriment un demi-cadratin (U+2013) dans
 *    « Banque (en + ou en –) », « insuffisance (–) de recettes (C = A – B) »,
 *    « – Variation des stocks » et « G = C – D + E – F ». Il est reproduit
 *    ici tel quel, comme dans les autres tables SYSCOHADA du module
 *    (`correspondance-notes-syscohada-3.ts`, `correspondance-tft-syscohada.ts`)
 *    : c'est le CADRATIN (U+2014) que CLAUDE.md §4
 *    interdit, pas le demi-cadratin, et un libellé d'état financier se
 *    transcrit à la lettre. Une version antérieure de ce fichier les avait
 *    ramenés au trait d'union ASCII ; le spec fige désormais la version
 *    littérale et vérifie l'absence de cadratin.
 *
 * 21. **La NOTE 4 est plus large que A et B, et c'est voulu** · les
 *    colonnes de ventilation du journal (ch. 3) et les postes du compte de
 *    résultat (ch. 2 § 2) sont DEUX découpages officiels distincts, qui ne
 *    se recouvrent pas. Le journal « ouvre sur un report à nouveau et se
 *    clôt sur un solde à reporter » (ch. 3) : il doit donc contenir TOUS
 *    les mouvements de trésorerie, sans quoi son solde ne serait pas celui
 *    de la caisse ou de la banque. Ses colonnes officielles le disent
 *    elles-mêmes, qui nomment « Matériel et Mobilier » côté recettes (une
 *    cession d'immobilisation, classe 2) et autorisent le rajout « compte
 *    exploitant » (103, 104, classe 1) · précisément ce que A et B
 *    excluent (anomalie n° 13). Les colonnes « Autres » restent donc
 *    résiduelles sur les classes 1 à 8 (`TOUTES_CLASSES_1_A_8`) : un
 *    emprunt encaissé, un achat d'immobilisation et un virement interne y
 *    figurent, et le NB (« prévoir un journal par banque et un journal pour
 *    la caisse ») justifie que le virement paraisse dans les deux journaux.
 *    Aucun double compte n'en résulte : la NOTE 4 n'alimente NI A NI B, que
 *    le service calcule depuis les postes SR/SD.
 *
 * 22. **Cession d'immobilisation : le prix entre en A, la valeur comptable
 *    n'entre nulle part** [texte officiel] · le 82 « Produits des cessions
 *    d'immobilisations » est « crédité des produits de cession d'actif…
 *    par le débit d'un compte de trésorerie » (Titre VII COMPTE 82) : c'est
 *    un produit et un encaissement, il entre en A (et dans la colonne
 *    « Matériel et Mobilier » de la NOTE 4, que le ch. 3 ouvre exprès). Sa
 *    contrepartie de charge, le 81 « Valeurs comptables des cessions
 *    d'immobilisations », est en revanche « débité… par le crédit du compte
 *    d'immobilisation concerné » (COMPTE 81), sans aucun décaissement :
 *    absente de B, absente de F (elle n'est pas une dotation), et le
 *    compte de résultat du ch. 2 § 2 n'ouvre AUCUNE ligne pour elle. Le G
 *    du SMT est donc majoré de la valeur comptable nette du bien cédé par
 *    rapport au résultat d'engagement, et le bilan SMT s'en écarte d'autant
 *    (l'actif baisse de cette valeur sans contrepartie au passif). Même
 *    constat pour une cession courante, 654 « Valeurs comptables des cessions
 *    courantes d'immobilisations » contre 754 « Produits des cessions
 *    courantes d'immobilisations » (plan de comptes SYSCOHADA). C'est un TROU DU
 *    TEXTE : le SMT ne connaît la vie des immobilisations que par le
 *    registre de la NOTE 1 et par la ligne F. Aucune ligne n'est inventée ;
 *    le service expose l'écart au contrôle de concordance, comme pour
 *    l'anomalie n° 16.
 */

// ---------------------------------------------------------------------------
// STRUCTURE DES ÉTATS (Titre X ch. 1 § 2)
// ---------------------------------------------------------------------------

/**
 * Les trois documents du Titre X ch. 1 § 2 : « le Bilan ; le Compte de
 * résultat ; et les Notes annexes ». Pas de TFT · voir anomalie n° 3.
 */
export const DOCUMENTS_SMT_SYSCOHADA = ['BILAN', 'COMPTE_DE_RESULTAT', 'NOTES_ANNEXES'] as const;

/**
 * Titre X ch. 1 § 1 : les QUATRE éléments de l'inventaire extra-comptable
 * de fin d'exercice, dont « les états récapitulatifs… doivent être
 * conservés en tant que pièce justificative ». Exposés pour que l'écran de
 * clôture SMT les rappelle un à un.
 */
export const INVENTAIRE_EXTRA_COMPTABLE_SMT = [
  "le montant des créances et des dettes d'exploitation, dans le cas où les ventes et les achats ne sont pas totalement réglés",
  'le montant des stocks (produits finis, matières premières, consommables...) et des travaux en cours',
  "le montant des immobilisations acquises ou cédées au cours de l'exercice",
  "le montant des emprunts souscrits ou remboursés au cours de l'exercice",
] as const;

/**
 * Titre X ch. 1 § 1 : « Chaque immobilisation doit faire l'objet d'un
 * tableau d'amortissement basé sur le mode linéaire sans prorata
 * temporis. » Le point de vigilance du même paragraphe le chiffre : « une
 * année entière la première année, quelle que soit la date d'acquisition ».
 * Règle propre au SMT, distincte du prorata du Système normal (art. 45).
 *
 * CE COMMENTAIRE A LONGTEMPS MENTI · il annonçait que « le module
 * immobilisations la lit ici pour un dossier SMT plutôt que de la
 * réécrire », alors que la constante n'était consommée qu'en AFFICHAGE (pied
 * de la NOTE 1, fiche SMT, export). `ImmobilisationService.calculerDotation`
 * proratisait sans condition : l'écran disait « sans prorata temporis » et
 * l'écriture 681/28 portait 3/12 à la balance. C'est désormais vrai :
 * `ImmobilisationService.sansProrataTemporis` lit `prorataTemporis` ici, et
 * `amortissement-anterieur.spec.ts` gèle le chiffre.
 *
 * PORTÉE SYSCOHADA. Le SYCEBNL a son propre Système minimal de trésorerie
 * (Partie 4 ch. 4), dont le chapitre n'est pas encodé dans le skill
 * `sycebnl` · sa règle d'amortissement n'a donc PAS été transposée ici, et
 * un dossier SYCEBNL garde le prorata (CLAUDE.md §1 et §6).
 */
export const AMORTISSEMENT_SMT = { mode: 'LINEAIRE', prorataTemporis: false } as const;

// ---------------------------------------------------------------------------
// BILAN (Titre X ch. 2 § 1)
// ---------------------------------------------------------------------------

export type SensSmtSyscohada = 'ACTIF' | 'PASSIF';
export type QualificatifSensSmtSyscohada = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanSmtSyscohada {
  /** Code choisi par OmegaX, stable · le Titre X n'en imprime aucun (voir en-tête). */
  ref: string;
  libelle: string;
  sens: SensSmtSyscohada;
  /** Renvoi de note tel que la maquette l'imprime · `null` quand elle n'en porte pas. */
  note: string | null;
  /** Préfixes captés, soumis à `sens_qualificatif` s'il est posé. */
  comptes: string[];
  exclusions?: string[];
  /** Ne retenir, LIGNE PAR LIGNE, que les comptes dont le solde va dans ce sens (postes de tiers). */
  sens_qualificatif?: QualificatifSensSmtSyscohada;
  /**
   * Préfixes rattachés au poste QUEL QUE SOIT le sens de leur solde, hors
   * filtre · les dépréciations (créditrices, en moins d'un poste d'actif)
   * et les provisions à court terme (créditrices, au passif). Voir
   * anomalies n° 5 et 6. Ce champ n'existe PAS dans `PosteBilanSmt` (jeu
   * SYCEBNL) : le service SYSCOHADA doit lire cette branche en plus du
   * filtre `sens_qualificatif` habituel, sinon 490 à 498, 50, 51, 590, 591
   * (actif) et 499, 599 (passif) disparaissent silencieusement du bilan
   * calculé, sans qu'aucune exception ni aucun test structurel ne le
   * signale (seul un test du futur service, sur un solde réel, l'attraperait).
   */
  comptesSansFiltreDeSens?: string[];
  /** Pourquoi ces comptes-là · le Titre X ne fournissant pas de table (voir en-tête). */
  fondement: string;
}

export const POSTES_BILAN_ACTIF_SMT_SYSCOHADA: PosteBilanSmtSyscohada[] = [
  {
    ref: 'SA1',
    libelle: 'Immobilisations (1)',
    sens: 'ACTIF',
    note: '1',
    // Classe 2 ENTIÈRE, 28 et 29 compris : une seule colonne de montant,
    // donc valeur nette · les amortissements et dépréciations, créditeurs,
    // réduisent d'eux-mêmes le solde algébrique du poste.
    comptes: ['2'],
    fondement:
      "Classe 2 « Immobilisations » entière, amortissements (28) et dépréciations (29) compris : la maquette n'ouvre qu'une colonne de montant, le poste porte la valeur nette. Renvoi (1) : « À faire figurer à l'actif du bilan si elles correspondent à des montants significatifs. » La NOTE 1 (registre des immobilisations exigé au ch. 1) en donne le détail.",
  },
  {
    ref: 'SA2',
    libelle: 'Stocks',
    sens: 'ACTIF',
    note: '2',
    comptes: ['3'],
    fondement:
      "Classe 3 « Stocks » entière, dépréciations (39) comprises, donc en valeur nette. La NOTE 2 « État des stocks » en donne le détail et la ligne « Variation des stocks » du compte de résultat se déduit de ses valeurs finale et initiale (ch. 3).",
  },
  {
    ref: 'SA3',
    libelle: 'Clients et débiteurs divers',
    sens: 'ACTIF',
    note: '3',
    // Classe 4 hors 49, côté DÉBITEUR ligne par ligne · SP4 prend le côté
    // créditeur. Le sens s'apprécie compte d'imputation par compte
    // d'imputation, jamais sur l'agrégat (Titre VII COMPTE 47 : « aucune
    // compensation n'est en principe admise »).
    comptes: ['4'],
    exclusions: ['49'],
    sens_qualificatif: 'DEBITEUR',
    // 490 à 498 en moins (dépréciations de tiers), 50 et 51 à l'actif quel
    // que soit leur solde, 590 et 591 en moins d'eux · anomalies n° 5 et 6.
    comptesSansFiltreDeSens: ['490', '491', '492', '493', '494', '495', '496', '497', '498', '50', '51', '590', '591'],
    fondement:
      "Classe 4 « Tiers », soldes débiteurs : le 41 s'intitule « Clients et comptes rattachés », le 47 « Débiteurs et créditeurs divers » (plan de comptes SYSCOHADA), et « débiteurs divers » étend le poste au reste de la classe qui n'a aucun autre poste d'accueil. En moins, les dépréciations 490 à 498 (« dépréciations subies par des comptes de tiers », Titre VII COMPTE 49) et 590, 591 (dépréciations des titres de placement et des valeurs à encaisser, COMPTE 59). Y sont joints les 50 « Titres de placement » et 51 « Valeurs à encaisser », qui ne sont ni caisse ni banque (anomalie n° 6). La NOTE 3 « État des créances et des dettes non échues » en donne le détail.",
  },
  {
    ref: 'SA4',
    libelle: 'Caisse',
    sens: 'ACTIF',
    // La maquette du Titre X n'imprime AUCUN renvoi de note pour Caisse ni
    // pour Banque (contrairement aux trois postes précédents) · transcrit
    // tel quel, même si la NOTE 4 en est le journal.
    note: null,
    comptes: ['57'],
    fondement:
      "Compte 57 « Caisse » (Titre VII COMPTE 57 : « opérations d'encaissement et de paiement effectuées en espèces »). Un solde créditeur « constitue une présomption d'irrégularité de la comptabilité » : il ressort en négatif, jamais filtré (anomalie n° 7).",
  },
  {
    ref: 'SA5',
    libelle: 'Banque (en + ou en –)',
    sens: 'ACTIF',
    note: null,
    // Aucun filtre de sens : le « (en + ou en –) » de la maquette autorise
    // le découvert à l'actif en négatif · il n'y a pas de trésorerie-passif
    // au SMT (anomalie n° 7).
    comptes: ['52', '53', '54', '55', '56', '58', '592', '593', '594'],
    fondement:
      "52 « Banques », 53 « Établissements financiers et assimilés », 54 « Instruments de trésorerie », 55 « Instruments de monnaie électronique », 56 « Banques, crédits de trésorerie et d'escompte » (créditeur par nature, Titre VII COMPTE 56 : d'où le « en – »), 58 « Régies d'avances, accréditifs et virements internes » ; en moins, leurs dépréciations 592, 593, 594 (COMPTE 59). Le 57 est en Caisse, les 50 et 51 en Clients et débiteurs divers (anomalie n° 6), les 590, 591 et 599 suivent les comptes qu'ils couvrent.",
  },
];

export const POSTES_BILAN_PASSIF_SMT_SYSCOHADA: PosteBilanSmtSyscohada[] = [
  {
    ref: 'SP1',
    libelle: 'Compte exploitant',
    sens: 'PASSIF',
    // Renvoi « 1 » imprimé par la maquette · anomalie n° 4.
    note: '1',
    comptes: ['10', '11', '12', '14', '15'],
    fondement:
      "103 « Capital personnel » et 104 « Compte de l'exploitant » (Titre VII COMPTE 103 et 104 : apports définitifs et temporaires, prélèvements de l'exploitant individuel), élargis au reste des capitaux propres que la maquette ne loge nulle part ailleurs : 10 entier, 11 Réserves, 12 Report à nouveau, 14 Subventions d'investissement, 15 Provisions réglementées et fonds assimilés (anomalie n° 8). Un 109 ou un 129 débiteur ressort en négatif (COMPTE 109 et 12 : « en moins »).",
  },
  // SP2 « Résultat exercice » n'est PAS listé ici : il est arbitré entre les
  // classes 6/7/8 et le compte 13 selon que l'exercice est clôturé ou non ·
  // voir REF_RESULTAT_SMT_SYSCOHADA et COMPTES_RESULTAT_SMT_SYSCOHADA.
  {
    ref: 'SP3',
    libelle: 'Emprunt',
    sens: 'PASSIF',
    note: null,
    comptes: ['16', '17', '18', '19'],
    fondement:
      "16 « Emprunts et dettes assimilées » (Titre VII COMPTE 16 : « ressources financières externes… remboursables à terme »), élargi à 17 « Dettes de location acquisition », 18 « Dettes liées à des participations et comptes de liaison » et 19 « Provisions pour risques et charges » (« passif externe (dette) », COMPTE 19), que la maquette ne loge nulle part ailleurs (anomalie n° 9). L'inventaire extra-comptable du ch. 1 vise « le montant des emprunts souscrits ou remboursés ».",
  },
  {
    ref: 'SP4',
    libelle: 'Fournisseurs et créditeurs divers',
    sens: 'PASSIF',
    note: '3',
    comptes: ['4'],
    exclusions: ['49'],
    sens_qualificatif: 'CREDITEUR',
    // 499 et 599 : provisions pour risques à court terme, créditrices par
    // nature, au passif · anomalie n° 5.
    comptesSansFiltreDeSens: ['499', '599'],
    fondement:
      "Classe 4 « Tiers », soldes créditeurs · symétrique de SA3 : le 40 s'intitule « Fournisseurs et comptes rattachés », le 47 « Débiteurs et créditeurs divers ». S'y ajoutent le 499 « Provisions pour risques à court terme » (Titre VII COMPTE 49) et le 599 « Provisions pour risque à court terme à caractère financier » (COMPTE 59), passifs et non dépréciations d'actif. La NOTE 3 en donne le détail (« Nom du fournisseur »).",
  },
];

/**
 * SP2 « Résultat exercice » · même arbitrage que CJ au Système normal
 * (`correspondance-bilan-syscohada.ts`) : Titre VII COMPTE 13, le compte 13
 * est crédité (classe 7 et comptes créditeurs de la classe 8) et débité
 * (classe 6 et comptes débiteurs de la classe 8) « pour solde » À LA
 * CLÔTURE de l'exercice. Avant clôture le résultat vit donc dans les
 * classes 6/7/8, après clôture dans le 13. [Le 13 est aussi mouvementé une
 * SECONDE fois, après clôture, lors de l'affectation du résultat de
 * l'exercice PRÉCÉDENT (virement vers 12, 11, 101, 103 ou 465, COMPTE 13
 * « Fonctionnement » et COMPTE 103 : « crédité, à l'ouverture de l'exercice,
 * du montant de l'affectation du résultat de l'exercice précédent, par le
 * débit du 131 ») ; cette seconde écriture ne concerne pas le résultat de
 * l'exercice EN COURS et ne remet pas en cause l'arbitrage ci-dessous.] Le
 * service prend l'une OU l'autre source, jamais les deux, et expose
 * `resultatClasses678` / `resultatCompte13` / `doubleComptageProbable`.
 */
export const REF_RESULTAT_SMT_SYSCOHADA = 'SP2';
export const LIBELLE_RESULTAT_SMT_SYSCOHADA = 'Résultat exercice';
export const COMPTES_RESULTAT_SMT_SYSCOHADA = ['13'];

export interface TotalSmtSyscohada {
  ref: string;
  libelle: string;
  deRefs: string[];
}

export const TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA: TotalSmtSyscohada[] = [
  { ref: 'SAZ', libelle: 'Total actif', deRefs: ['SA1', 'SA2', 'SA3', 'SA4', 'SA5'] },
];

export const TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA: TotalSmtSyscohada[] = [
  { ref: 'SPZ', libelle: 'Total passif', deRefs: ['SP1', 'SP2', 'SP3', 'SP4'] },
];

/** Ordre d'impression, celui de la maquette du ch. 2 § 1. */
export const ORDRE_BILAN_ACTIF_SMT_SYSCOHADA = ['SA1', 'SA2', 'SA3', 'SA4', 'SA5', 'SAZ'];
export const ORDRE_BILAN_PASSIF_SMT_SYSCOHADA = ['SP1', 'SP2', 'SP3', 'SP4', 'SPZ'];

/** Renvoi (1) du bilan, imprimé sous l'actif · transcrit tel quel. */
export const RENVOI_IMMOBILISATIONS_SMT_SYSCOHADA =
  "(1) À faire figurer à l'actif du bilan si elles correspondent à des montants significatifs.";

export function trouvePosteBilanSmtSyscohada(ref: string): PosteBilanSmtSyscohada | undefined {
  return [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA].find((p) => p.ref === ref);
}

/**
 * Les comptes de TRÉSORERIE au sens strict, c'est-à-dire ceux dont le
 * mouvement EST la recette ou la dépense : 52 Banques, 53 Établissements
 * financiers et assimilés, 54 Instruments de trésorerie, 55 Instruments de
 * monnaie électronique, 56 Banques crédits de trésorerie et d'escompte,
 * 57 Caisse, 58 Régies d'avances, accréditifs et virements internes (plan de
 * comptes SYSCOHADA · ce sont les comptes de SA4 et SA5, dépréciations
 * exclues).
 *
 * Exportée parce qu'aucune définition improvisée ne convient ici, et qu'une
 * erreur de périmètre ne lèverait aucune exception :
 *  - « classe 5 hors 59 » (la définition de `estTresorerie` du service SMT
 *    SYCEBNL, écrite pour SON plan) y ferait entrer 50 et 51, que ce fichier
 *    rattache à SA3 « Clients et débiteurs divers » (anomalie n° 6). Un
 *    encaissement par chèque (Dr 513 / Cr 411) serait alors lu comme une
 *    recette de 100 avec 411 pour contrepartie, alors que SA3 n'a pas bougé
 *    (411 baisse, 513 monte, tous deux dans SA3) : SV2 vaudrait 0 et G
 *    serait majoré de 100 ;
 *  - « SA4 + SA5 » y ferait entrer 592 à 594, qui sont des dépréciations et
 *    non des avoirs (`COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA`) : leur
 *    contrepartie 679 / 779 deviendrait un faux flux.
 * Un mouvement dont la contrepartie est elle-même dans cette liste est un
 * virement interne : il n'entre ni en A ni en B (anomalie n° 14).
 */
export const COMPTES_TRESORERIE_SMT_SYSCOHADA = ['52', '53', '54', '55', '56', '57', '58'];

/**
 * Les dépréciations des comptes de trésorerie (Titre VII COMPTE 59 : 592
 * comptes banques, 593 établissements financiers, 594 instruments de
 * trésorerie). Ni un avoir dont le mouvement serait une recette ou une
 * dépense, ni une contrepartie possible d'un mouvement de trésorerie : leur
 * seule contrepartie est 679 à la dotation et 779 à la reprise (COMPTE 59,
 * Fonctionnement). Nommées ici parce que c'est le seul sous-ensemble du
 * bilan SMT qu'aucune ligne du compte de résultat ne rattrape · anomalie
 * n° 16.
 */
export const COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA = ['592', '593', '594'];

// ---------------------------------------------------------------------------
// COMPTE DE RÉSULTAT (Titre X ch. 2 § 2)
// ---------------------------------------------------------------------------

/**
 * Un poste de flux du compte de résultat SMT. `comptes` désigne ici les
 * comptes de CONTREPARTIE d'un mouvement de trésorerie (voir en-tête,
 * « Comptabilité de trésorerie »), pas des comptes dont on lirait le solde.
 */
export interface PosteFluxSmtSyscohada {
  ref: string;
  libelle: string;
  sens: 'RECETTE' | 'DEPENSE';
  /** Renvoi de note imprimé par la maquette (colonne « Note »). */
  note: string | null;
  /** Préfixes de comptes de contrepartie captés par ce poste. */
  comptes: string[];
  exclusions?: string[];
  fondement: string;
}

/**
 * Tout ce qu'une contrepartie de trésorerie peut être : les classes 1 à 8.
 * Sert de base résiduelle aux colonnes « Autres » de la NOTE 4, qui doivent
 * couvrir TOUS les mouvements de trésorerie (anomalie n° 21), et NON aux
 * postes A / B du compte de résultat, plus étroits (anomalie n° 13).
 */
const TOUTES_CLASSES_1_A_8 = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * PÉRIMÈTRE DES POSTES A ET B · les contreparties de trésorerie qui entrent
 * dans « TOTAL DES RECETTES SUR PRODUITS » (A) et « TOTAL DÉPENSES SUR
 * CHARGES » (B). Un compte y entre s'il remplit l'une des deux conditions,
 * et lui seul (anomalie n° 13) :
 *
 *  1. c'est un compte de PRODUIT ou de CHARGE · classes 6, 7 et 8. Les deux
 *     totaux de la maquette (ch. 2 § 2) ne parlent que de « recettes sur
 *     produits » et de « dépenses sur charges » ;
 *  2. c'est un compte d'un poste de bilan PORTEUR D'UNE LIGNE DE VARIATION ·
 *     SA2 Stocks (ligne SV1), SA3 Clients et débiteurs divers (SV2), SP4
 *     Fournisseurs et créditeurs divers (SV3), soit la classe 3, la classe 4
 *     entière (49 compris) et, avec elles, 50, 51, 590, 591 (SA3) et 599
 *     (SP4). Le mouvement doit alors rester en A ou B pour que la variation
 *     le corrige ensuite : l'exclure fausserait G d'autant. Recouvrement
 *     d'une créance de 100 : compté en A, SV2 vaut +100, G = 100 - 100 = 0 ;
 *     non compté en A, G = 0 - 100 = -100, faux.
 *
 * A contrario, les classes 1 et 2 n'ont AUCUNE ligne de variation : les y
 * inclure ferait entrer un flux de financement ou d'investissement dans le
 * résultat (`CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA`). Et les comptes de
 * trésorerie eux-mêmes ne sont jamais leur propre contrepartie
 * (`COMPTES_TRESORERIE_SMT_SYSCOHADA`, anomalie n° 14).
 *
 * Le spec vérifie ce critère compte par compte contre le plan semé : est
 * dans ce périmètre, parmi les classes 1 à 5, exactement ce que SA2, SA3 ou
 * SP4 réclament au bilan.
 */
export const CONTREPARTIES_RESULTAT_SMT_SYSCOHADA = ['3', '4', '50', '51', '590', '591', '599', '6', '7', '8'];

/**
 * Les contreparties de trésorerie qui restent HORS de A et de B. Elles ne
 * disparaissent pas pour autant : le journal de la NOTE 4 les enregistre
 * (anomalie n° 21) et le bilan les porte. Le service les présente à part,
 * jamais dans le compte de résultat · sans quoi un emprunt de 1 000 encaissé
 * donnerait G = 1 000 pour un résultat comptable nul.
 */
export const CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA = [
  {
    cle: 'financement',
    comptes: ['1'],
    intitule: "Financement · apports et prélèvements de l'exploitant, emprunts",
    fondement:
      "Classe 1 : 103 « Capital personnel » et 104 « Compte de l'exploitant » (Titre VII COMPTE 103 et 104), 16 « Emprunts et dettes assimilées » (COMPTE 16), 14 « Subventions d'investissement », qui figurent « au passif du bilan, parmi les capitaux propres » et non en produit (COMPTE 14). Le Titre X ch. 1 § 1 range « le montant des emprunts souscrits ou remboursés » parmi les QUATRE éléments de l'inventaire extra-comptable, à côté des immobilisations et distinctement des recettes et des dépenses. Ces mouvements se lisent aux postes de bilan SP1 et SP3.",
  },
  {
    cle: 'investissement',
    comptes: ['2'],
    intitule: 'Investissement · immobilisations acquises ou cédées',
    fondement:
      "Classe 2 : le Titre X ch. 1 § 1 range « le montant des immobilisations acquises ou cédées au cours de l'exercice » parmi les quatre éléments de l'inventaire extra-comptable et impose le registre des immobilisations (NOTE 1) avec son tableau d'amortissement ; l'usure du bien entre au compte de résultat par la ligne F « DOTATIONS AMORTISSEMENTS », jamais son prix d'achat. Ces mouvements se lisent au poste de bilan SA1 et à la NOTE 1.",
  },
];
export const POSTES_RECETTES_SMT_SYSCOHADA: PosteFluxSmtSyscohada[] = [
  {
    ref: 'SR1',
    libelle: 'Recettes sur ventes ou prestations de services',
    sens: 'RECETTE',
    note: '4',
    comptes: ['70'],
    fondement:
      "Compte 70 « Ventes » : 701 marchandises, 702 à 704 produits, 705 travaux facturés, 706 services vendus, 707 produits accessoires (plan de comptes SYSCOHADA) · exactement « ventes ou prestations de services ». C'est la colonne « Ventes » de la ventilation des recettes de la NOTE 4.",
  },
  {
    ref: 'SR2',
    libelle: 'Autres recettes sur activités',
    sens: 'RECETTE',
    note: '4',
    // Résiduel du périmètre de A, pas de la trésorerie : toute contrepartie
    // d'encaissement qui n'est pas une vente (SR1) et qui entre en A
    // (CONTREPARTIES_RESULTAT_SMT_SYSCOHADA · anomalie n° 13). Un emprunt
    // encaissé, un apport de l'exploitant ou le prix d'une immobilisation
    // encaissé en classe 2 n'y sont PAS : ils sont hors A et B.
    comptes: CONTREPARTIES_RESULTAT_SMT_SYSCOHADA,
    exclusions: ['70'],
    fondement:
      "Toute autre contrepartie d'un encaissement qui entre en A : 71 Subventions d'exploitation, 75 Autres produits, 77 Revenus financiers, 82 Produits des cessions d'immobilisations (Titre VII COMPTE 82 : « crédité des produits de cession d'actif… par le débit d'un compte de trésorerie »), 84 Produits H.A.O., 88 Subventions d'équilibre (plan de comptes SYSCOHADA), et le recouvrement d'une créance (classe 4) ou l'encaissement d'un titre de placement (50, 51), que la variation SV2 corrige ensuite. Les produits calculés (78 Transferts de charges, 79 Reprises, 86 Reprises H.A.O., 849 Reprises de charges H.A.O.) restent dans les préfixes captés pour qu'une écriture aberrante ne disparaisse pas, mais ils n'ont par construction aucune contrepartie de trésorerie (Titre VII COMPTE 19, 29, 49, 59 : les reprises se font par le débit du compte de dépréciation, jamais par la caisse) : ils ne se présentent pas ici. Colonne « Autres » de la NOTE 4, dont le périmètre est plus large (anomalie n° 21).",
  },
];

export const POSTES_DEPENSES_SMT_SYSCOHADA: PosteFluxSmtSyscohada[] = [
  {
    ref: 'SD1',
    libelle: 'Dépenses sur achats',
    sens: 'DEPENSE',
    note: '4',
    // 60 entier. Le 603 « Variations des stocks de biens achetés » est un
    // compte d'inventaire sans contrepartie de trésorerie (anomalie n° 11) :
    // il ne se présente jamais ici, et la variation des stocks est lue dans
    // la classe 3, pas dans le 603.
    comptes: ['60'],
    fondement:
      "Compte 60 « Achats et variations de stocks » : 601 achats de marchandises, 602 achats de matières premières et fournitures liées, 604 achats stockés de matières et fournitures consommables, 605 autres achats, 608 achats d'emballages (plan de comptes SYSCOHADA, libellés exacts). Ce sont les colonnes « Achats marchandises » et « Achats matières et fournitures » de la NOTE 4, que ce poste regroupe : le 605 y est rangé par défaut d'une colonne plus fine, alors qu'il contient aussi 6057 « Achats d'études et prestations de services » et 6058 « Achats de travaux, matériels et équipements » (plan de comptes SYSCOHADA), qui ne sont pas au sens strict des « matières et fournitures » ; la maquette n'ouvrant que deux colonnes d'achats, c'est la plus proche des deux et le drill-down le montre compte par compte. Le 61 « Transports » n'est pas un achat : il reste en SD6.",
  },
  {
    ref: 'SD2',
    libelle: 'Dépenses sur loyers',
    sens: 'DEPENSE',
    note: '4',
    // 622 ENTIER. Le 623 « Redevances de location acquisition » (crédit-bail,
    // location-vente · Titre VII COMPTE 62 et COMPTE 17) est l'acquisition
    // d'une immobilisation, pas un loyer · il reste en SD6, comme tout le
    // reste du 62. Le 6224 « Malis sur emballages » n'est pas un loyer non
    // plus, mais le plan officiel le loge lui-même sous le 622 : il est
    // SIGNALÉ (anomalie n° 18), pas ré-aiguillé.
    comptes: ['622'],
    fondement:
      "Compte 622 « Locations, charges locatives » (Titre VII COMPTE 62, plan de comptes SYSCOHADA : 6221 locations de terrains, 6222 locations de bâtiments, 6223 locations de matériels et outillages, 6224 malis sur emballages, 6225 locations d'emballages, 6226 fermages et loyers du foncier, 6228 locations et charges locatives diverses). Le 623 « Redevances de location acquisition » en est écarté : c'est un mode d'acquisition d'immobilisation (COMPTE 17), pas un loyer. Le 6224 « Malis sur emballages » n'en est PAS écarté bien qu'il ne soit pas un loyer : le plan officiel le loge sous le 622 et la maquette n'ouvre pas de ligne où le mettre (anomalie n° 18). Colonne « Loyers » de la NOTE 4, de même périmètre.",
  },
  {
    ref: 'SD3',
    libelle: 'Dépenses sur salaires',
    sens: 'DEPENSE',
    note: '4',
    comptes: ['66'],
    fondement:
      "Compte 66 « Charges de personnel » (Titre VII COMPTE 66), y compris le 666 « Rémunérations et charges sociales de l'exploitant individuel », que la fiche range expressément dans le 66. Colonne « Salaires » de la NOTE 4.",
  },
  {
    ref: 'SD4',
    libelle: 'Dépenses sur impôts et taxes',
    sens: 'DEPENSE',
    note: '4',
    comptes: ['64', '89'],
    fondement:
      "Compte 64 « Impôts et taxes » (plan de comptes SYSCOHADA), et le 89 « Impôts sur le résultat » (Titre VII COMPTE 89) parce que la maquette n'a que cette ligne fiscale (anomalie n° 10). Colonne « Impôts et taxes » de la NOTE 4.",
  },
  {
    ref: 'SD5',
    libelle: "Charges d'intérêts",
    sens: 'DEPENSE',
    // La maquette n'imprime AUCUN renvoi de note sur cette ligne (colonne
    // Note vide, seule ligne de dépense dans ce cas) · transcrit tel quel.
    note: null,
    // Préfixe 67 ENTIER, donc PLUS LARGE que le libellé « Charges
    // d'intérêts » de la maquette · choix assumé, anomalie n° 17.
    comptes: ['67'],
    fondement:
      "Compte 67 « Frais financiers et charges assimilées » (Titre VII COMPTE 67 : « l'ensemble des charges financières dues à différents tiers intervenant dans le financement de l'entité »). Les intérêts proprement dits sont 671 intérêts des emprunts, 672 intérêts dans loyers de location acquisition, 674 autres intérêts, 675 escomptes des effets de commerce (plan de comptes SYSCOHADA) ; le poste prend néanmoins le 67 ENTIER, donc aussi 673 Escomptes accordés, 676 Pertes de change financières, 677 Pertes sur titres de placement, 678 Pertes et charges sur risques financiers et 679 Charges pour dépréciations et provisions pour risques à court terme financières · la maquette n'ouvrant aucune autre ligne financière, la seule autre issue serait « Autres dépenses sur activités », moins parlante (anomalie n° 17). Le 679 n'a de toute façon pas de contrepartie de trésorerie (COMPTE 59 : il est débité par le crédit du 59) et ne se présente pas. Seule ligne du compte de résultat sans renvoi de note dans la maquette.",
  },
  {
    ref: 'SD6',
    libelle: 'Autres dépenses sur activités',
    sens: 'DEPENSE',
    note: '4',
    // Résiduel du périmètre de B, comme SR2 l'est de A : tout décaissement
    // qui n'est ni achat, ni loyer, ni salaire, ni impôt, ni intérêt et qui
    // entre en B. L'acquisition d'une immobilisation (classe 2), le
    // remboursement d'un emprunt (16) et le prélèvement de l'exploitant
    // (103, 104) n'y sont PAS (anomalie n° 13).
    comptes: CONTREPARTIES_RESULTAT_SMT_SYSCOHADA,
    // Le 70 n'est PAS exclu ici : un remboursement de vente décaissé (Dr 70 /
    // Cr 57) est bien une dépense, et chaque contrepartie du périmètre doit
    // tomber dans un poste de recette ET un poste de dépense · c'est le SENS
    // du mouvement de trésorerie, lu par le service, qui tranche lequel des
    // deux s'applique (le spec vérifie cette symétrie).
    exclusions: ['60', '622', '64', '66', '67', '89'],
    fondement:
      "Tout autre décaissement qui entre en B : 61 Transports, 62 hors 622, 63 Services extérieurs, 65 Autres charges, 83 Charges H.A.O., 87 Participation des travailleurs (plan de comptes SYSCOHADA), et le règlement d'une dette (classe 4) ou l'acquisition d'un titre de placement (50, 51), que la variation SV3 ou SV2 corrige ensuite. Le 81 « Valeurs comptables des cessions d'immobilisations » reste dans les préfixes captés mais ne se présente jamais : il est « débité… par le crédit du compte d'immobilisation concerné (classe 2) » (Titre VII COMPTE 81), sans contrepartie de trésorerie · d'où l'écart de l'anomalie n° 22. Le 70 y retombe aussi, du côté des dépenses seulement : un remboursement de vente est un décaissement, et la maquette n'ouvre aucune autre ligne pour le loger. Colonne « Autres » de la NOTE 4, dont le périmètre est plus large (anomalie n° 21).",
  },
];

/**
 * Les trois lignes de variation et la ligne de dotations qui font passer du
 * solde de trésorerie (C) au résultat (G). L'opérateur imprimé par la
 * maquette est conservé dans `signeOfficiel` ; la variation est DÉFINIE
 * comme (N-1) - N, seule lecture qui rende la formule exacte · anomalies
 * n° 1 et 2, à lire avant de toucher à `calculerResultatSmt`.
 */
export interface RetraitementSmtSyscohada {
  ref: string;
  libelle: string;
  /** Renvoi de note imprimé par la maquette. */
  note: string | null;
  /** Opérateur imprimé devant la ligne : -1 pour « – », +1 pour « + ». */
  signeOfficiel: 1 | -1;
  /** Lettre de la formule G = C – D + E – F que la ligne alimente (D ou E pour les variations, F pour les dotations). */
  lettre: 'D' | 'E' | 'F';
  /** Poste du bilan dont la ligne prend la variation · `null` pour les dotations, lues en classe 6/8. */
  posteBilan: string | null;
  fondement: string;
}

/** Anomalie n° 2 : la « Variation N / N-1 » est prise dans le sens (N-1) - N, comme le 603 (stock initial moins stock final). */
export const DEFINITION_VARIATION_SMT_SYSCOHADA = 'N1_MOINS_N' as const;

export const RETRAITEMENTS_SMT_SYSCOHADA: RetraitementSmtSyscohada[] = [
  {
    ref: 'SV1',
    libelle: '– Variation des stocks N / N-1',
    note: '2',
    signeOfficiel: -1,
    lettre: 'D',
    posteBilan: 'SA2',
    fondement:
      "Poste SA2 Stocks, valeur initiale moins valeur finale (NOTE 2 : « VALEUR DU STOCK FINAL », « VALEUR DU STOCK INITIAL » ; convention du compte 603, Titre VII COMPTE 603). Précédée de « – » dans la maquette : un stock qui augmente (variation négative) rend au résultat les achats décaissés non consommés.",
  },
  {
    ref: 'SV2',
    libelle: '– Variation des créances N / N-1',
    note: '3',
    signeOfficiel: -1,
    lettre: 'D',
    posteBilan: 'SA3',
    fondement:
      "Poste SA3 Clients et débiteurs divers, montant au 1er janvier moins montant au 31 décembre (NOTE 3, colonnes « Montant au 31 décembre » et « Montant au 1er janvier »). Précédée de « – » dans la maquette : une créance qui augmente (variation négative) rend au résultat les ventes non encaissées, absentes de A.",
  },
  {
    ref: 'SV3',
    libelle: "+ Variation des dettes d'exploitation N / N-1",
    note: '3',
    signeOfficiel: 1,
    lettre: 'E',
    posteBilan: 'SP4',
    fondement:
      "Poste SP4 Fournisseurs et créditeurs divers, montant au 1er janvier moins montant au 31 décembre (NOTE 3). Précédée de « + » dans la maquette : une dette qui augmente (variation négative) retranche du résultat les charges engagées non payées, absentes de B.",
  },
  {
    ref: 'SF',
    libelle: 'DOTATIONS AMORTISSEMENTS',
    note: null,
    signeOfficiel: -1,
    lettre: 'F',
    posteBilan: null,
    fondement:
      "Lettre F de la formule G = C – D + E – F. Comptes 68 « Dotations aux amortissements » (Titre VII COMPTE 68), 69 « Dotations aux provisions et aux dépréciations » (COMPTE 69) et 85 « Dotations hors activités ordinaires » (COMPTE 85) : charges calculées sans décaissement, absentes de B, retranchées ici. Amortissement « linéaire sans prorata temporis » (Titre X ch. 1 § 1). La maquette n'imprime pas d'opérateur devant la ligne, la formule en fait un « – F ».",
  },
];

/**
 * Comptes de dotations lus en SOLDE pour la ligne SF (F). Le 68 seul est
 * intitulé « amortissements » ; 69 et 85 y sont joints parce qu'une
 * dotation aux dépréciations (69) ou une dotation H.A.O. (85) est aussi
 * une charge sans décaissement et que la maquette n'a pas d'autre ligne
 * pour elle · même choix que correspondance-smt.tsv (ligne JG). Les
 * reprises (79, 86), produits sans encaissement, ne viennent PAS en
 * diminution de F : la maquette n'ouvre aucune ligne « reprises », et le
 * contrôle de concordance du service les fera ressortir en écart plutôt que
 * de les absorber ici. Elles restent captées par le préfixe de SR2, comme
 * tout produit, mais ne s'y présentent jamais faute de contrepartie de
 * trésorerie (voir le fondement de SR2) : les deux commentaires disent la
 * même chose.
 *
 * NE PAS Y AJOUTER les « charges provisionnées » à court terme · 659
 * (« Charges pour dépréciations et provisions pour risques à court terme
 * d'exploitation » : 6591 risques, 6593 stocks, 6594 créances, 6598 autres),
 * 679 (les mêmes, financières : 6791, 6795, 6798) et 839 (les mêmes,
 * H.A.O.). Ce sont bien des charges sans décaissement, et les fiches Titre
 * VII COMPTE 68 (« Exclusions… les charges provisionnées → 659 ou 679 ») et
 * COMPTE 69 (« Exclusions… la dépréciation probable des éléments de l'actif
 * circulant (stocks, clients) → 659 ; des éléments de trésorerie → 679 »)
 * les désignent expressément comme les dotations aux dépréciations des
 * classes 3, 4 et 5. Mais leur effet est DÉJÀ dans le résultat SMT par les
 * lignes de variation, puisque leurs contreparties sont dans le périmètre
 * NET des postes de bilan : 6593 → 39 (dans SA2, ligne SV1), 6594 → 49x
 * (SA3, SV2), 6591 → 499 (SP4, SV3), 6795 → 590 et 6791 → 599 (SA3 et SP4)
 * · Titre VII COMPTE 659 (« Débité par le crédit des comptes de dépréciation
 * de l'actif circulant, comptes 39 et 49, et du compte 499 ») et COMPTE 59
 * (dépréciations « portées à l'actif du bilan, en diminution »). Les ajouter
 * à F « pour compléter » les compterait DEUX FOIS. Seule la part du 6798 qui
 * vise 592 à 594 échappe à toute variation, et c'est un trou du texte, pas un
 * oubli : voir anomalie n° 16.
 */
export const COMPTES_DOTATIONS_SMT_SYSCOHADA = ['68', '69', '85'];

/** Anomalie n° 1 : lecture des lettres D et E que la maquette n'attribue pas. */
export const LETTRES_D_E_SMT_SYSCOHADA = {
  D: ['SV1', 'SV2'],
  E: ['SV3'],
} as const;

export interface TotalCompteResultatSmtSyscohada {
  ref: string;
  libelle: string;
  /** Lettre officielle de la maquette. */
  lettre: 'A' | 'B' | 'C' | 'G';
  /**
   * Lignes que le total lit, toutes définies AVANT lui dans
   * `ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA`. Le champ existe pour que la
   * composition de A, B, C et G ne soit pas codée en dur dans le service et
   * qu'un poste ajouté sans être rattaché à son total se voie (le spec
   * confronte ces listes aux postes et le calcul à `calculerResultatSmt`).
   * Le signe n'y est PAS : A et B sont des sommes, mais C = A – B et
   * G = C – D + E – F sont des formules signées, dont l'unique
   * implémentation est `calculerResultatSmt` · anomalies n° 1 et 2.
   */
  deRefs: string[];
}

/** Lignes de total et de solde, libellés de la maquette. */
export const TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA: TotalCompteResultatSmtSyscohada[] = [
  { ref: 'SRA', libelle: 'TOTAL DES RECETTES SUR PRODUITS', lettre: 'A', deRefs: ['SR1', 'SR2'] },
  { ref: 'SDB', libelle: 'TOTAL DÉPENSES SUR CHARGES', lettre: 'B', deRefs: ['SD1', 'SD2', 'SD3', 'SD4', 'SD5', 'SD6'] },
  {
    ref: 'SC',
    libelle: 'SOLDE : Excédent (+) ou insuffisance (–) de recettes (C = A – B)',
    lettre: 'C',
    deRefs: ['SRA', 'SDB'],
  },
  {
    ref: 'SG',
    libelle: 'RÉSULTAT EXERCICE (G = C – D + E – F)',
    lettre: 'G',
    deRefs: ['SC', 'SV1', 'SV2', 'SV3', 'SF'],
  },
];

/** Ordre d'impression du compte de résultat, celui de la maquette du ch. 2 § 2. */
export const ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA = [
  'SR1', 'SR2', 'SRA',
  'SD1', 'SD2', 'SD3', 'SD4', 'SD5', 'SD6', 'SDB',
  'SC',
  'SV1', 'SV2', 'SV3',
  'SF',
  'SG',
];

export interface ValeursResultatSmt {
  /** A · total des recettes. */
  recettes: number;
  /** B · total des dépenses. */
  depenses: number;
  /** Poste SA2 à la clôture (N) et à l'ouverture (N-1). */
  stocks: { n: number; n1: number };
  /** Poste SA3 à la clôture et à l'ouverture. */
  creances: { n: number; n1: number };
  /** Poste SP4 à la clôture et à l'ouverture. */
  dettes: { n: number; n1: number };
  /** F · dotations (solde débiteur des COMPTES_DOTATIONS_SMT_SYSCOHADA). */
  dotations: number;
}

export interface ResultatSmtCalcule {
  A: number;
  B: number;
  C: number;
  /** Montant imprimé sur chaque ligne de retraitement, dans la convention (N-1) - N. */
  lignes: Record<'SV1' | 'SV2' | 'SV3' | 'SF', number>;
  D: number;
  E: number;
  F: number;
  G: number;
}

/**
 * La formule officielle G = C – D + E – F, avec C = A – B, appliquée dans la
 * lecture des anomalies n° 1 et 2. Fonction pure pour que le spec la
 * confronte à un exemple chiffré : le résultat obtenu doit être celui d'une
 * comptabilité d'engagement (recettes + ventes non encaissées + stockage -
 * dépenses - charges non payées - dotations). Le service ne doit pas
 * recomposer la formule ailleurs.
 */
export function calculerResultatSmt(v: ValeursResultatSmt): ResultatSmtCalcule {
  const A = v.recettes;
  const B = v.depenses;
  const C = A - B;
  // Anomalie n° 2 : (N-1) - N, convention du 603.
  const lignes = {
    SV1: v.stocks.n1 - v.stocks.n,
    SV2: v.creances.n1 - v.creances.n,
    SV3: v.dettes.n1 - v.dettes.n,
    SF: v.dotations,
  };
  const D = LETTRES_D_E_SMT_SYSCOHADA.D.reduce((s, ref) => s + lignes[ref], 0);
  const E = LETTRES_D_E_SMT_SYSCOHADA.E.reduce((s, ref) => s + lignes[ref], 0);
  const F = lignes.SF;
  return { A, B, C, lignes, D, E, F, G: C - D + E - F };
}

// ---------------------------------------------------------------------------
// NOTES ANNEXES (Titre X ch. 3)
// ---------------------------------------------------------------------------

/**
 * Un tableau d'une note qui en comporte plusieurs · la NOTE 3 en imprime
 * DEUX (anomalie n° 19), chacun avec ses colonnes et sa ligne de total.
 */
export interface SousTableauNoteSmtSyscohada {
  cle: string;
  /** Intitulé du tableau tel que le ch. 3 le donne. */
  intitule: string;
  colonnes: string[];
  /** Libellé de la ligne de total, transcrit. */
  ligneTotal: string;
}

export interface NoteSmtSyscohada {
  numero: number;
  intitule: string;
  /** État que la note détaille. */
  partie: 'BILAN' | 'COMPTE_DE_RESULTAT';
  /**
   * Colonnes de la maquette officielle, dans l'ordre du texte · `null`
   * quand la note est faite de plusieurs tableaux, qui portent alors
   * chacun les leurs (`sousTableaux`). Exactement l'un des deux champs est
   * renseigné, le spec le vérifie.
   */
  colonnes: string[] | null;
  sousTableaux?: SousTableauNoteSmtSyscohada[];
}

/**
 * Les quatre notes du ch. 3, dans l'ordre du texte. Le ch. 1 § 2 n'énumère
 * que les notes 1 à 3 comme composantes des Notes annexes et range la NOTE 4
 * (journal de trésorerie) parmi les pièces de base de la tenue ; le ch. 3
 * la numérote pourtant comme note et le compte de résultat y renvoie en
 * colonne « Note ». Les quatre sont donc produites.
 */
export const NOTES_SMT_SYSCOHADA: NoteSmtSyscohada[] = [
  {
    numero: 1,
    intitule: 'Tableau SMT de suivi du matériel, du mobilier et des cautions',
    partie: 'BILAN',
    colonnes: ['Date', 'Désignation', 'Montant', 'Date de sortie', 'Prix de cession'],
  },
  {
    numero: 2,
    intitule: 'État des stocks',
    partie: 'BILAN',
    colonnes: ['Référence', 'Désignation', 'Quantité', 'Prix unitaire', 'Montant'],
  },
  {
    numero: 3,
    intitule: 'État des créances et des dettes non échues',
    partie: 'BILAN',
    // « Deux tableaux » (ch. 3) : les colonnes ne sont pas les mêmes (« Nom
    // du client » d'un côté, « Nom du fournisseur » de l'autre) et chacun
    // porte sa ligne de total · les fusionner en une liste unique aurait
    // inventé un libellé que le texte n'imprime pas (anomalie n° 19).
    colonnes: null,
    sousTableaux: [
      {
        cle: 'creances',
        intitule: 'Créances',
        colonnes: ['Date', 'Nom du client', 'Montant au 31 décembre', 'Montant au 1er janvier', 'Variation %'],
        ligneTotal: 'TOTAL DES CRÉANCES',
      },
      {
        cle: 'dettes',
        intitule: 'Dettes',
        colonnes: ['Date', 'Nom du fournisseur', 'Montant au 31 décembre', 'Montant au 1er janvier', 'Variation %'],
        ligneTotal: 'TOTAL DES DETTES',
      },
    ],
  },
  {
    numero: 4,
    intitule: 'Journal de trésorerie SMT',
    partie: 'COMPTE_DE_RESULTAT',
    colonnes: ['Date', 'Libellés', 'Recettes', 'Dépenses', 'Solde'],
  },
];

/** Lignes de synthèse de la NOTE 2, transcrites · leur différence alimente SV1. */
export const LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA = ['VALEUR DU STOCK FINAL', 'VALEUR DU STOCK INITIAL'] as const;

/**
 * Les deux journaux de suivi du ch. 3, « pièces de suivi (non numérotées
 * comme note) » · avec la NOTE 4, « les trois pièces de base dont
 * l'existence conditionne la fiabilité du SMT (ch. 1 § 1) ».
 */
export const JOURNAUX_DE_SUIVI_SMT_SYSCOHADA = [
  {
    cle: 'creancesImpayees',
    intitule: 'Journal de suivi des créances impayées SMT',
    colonnes: ['Date', 'N° facture', 'Nom du client', 'Montant', 'Date paiement'],
  },
  {
    cle: 'dettesAPayer',
    intitule: 'Journal de suivi des dettes à payer SMT',
    colonnes: ['Date', 'N° facture', 'Nom du fournisseur', 'Montant', 'Date paiement'],
  },
] as const;

// ---------------------------------------------------------------------------
// NOTE 4 · JOURNAL DE TRÉSORERIE SMT · VENTILATION
// ---------------------------------------------------------------------------

/**
 * Colonnes de ventilation de la NOTE 4, transcrites du ch. 3 : « Ventilation
 * recettes : Ventes · Autres · Matériel et Mobilier » et « Ventilation
 * dépenses : Achats marchandises · Achats matières et fournitures · Loyers ·
 * Salaires · Impôts et taxes · Autres ». Elles ne recoupent pas exactement
 * les postes SR/SD du compte de résultat (deux découpages officiels, tous
 * deux repris tels quels). Le journal ouvre sur un « report à nouveau » et
 * se clôt sur un « solde à reporter », « un journal par banque et un
 * journal pour la caisse ».
 */
export interface ColonneVentilationSmtSyscohada {
  cle: string;
  libelle: string;
  comptes: string[];
  exclusions?: string[];
  /** Colonne ajoutée sur le fondement du NB officiel, pas imprimée par la maquette · anomalie n° 12. */
  rajoutAutorise?: true;
}

// Les colonnes sont rangées dans l'ORDRE D'IMPRESSION du ch. 3 (« Ventes ·
// Autres · Matériel et Mobilier »), les rajouts du NB à la suite. Chaque
// colonne portant ses propres `comptes` et `exclusions`, l'ordre du tableau
// n'a aucun effet sur le calcul : « Autres » reste la colonne résiduelle
// même imprimée en deuxième position.
export const VENTILATION_RECETTES_SMT_SYSCOHADA: ColonneVentilationSmtSyscohada[] = [
  // 70 Ventes (plan de comptes SYSCOHADA).
  { cle: 'ventes', libelle: 'Ventes', comptes: ['70'] },
  {
    cle: 'autres',
    libelle: 'Autres',
    // Résiduel sur les classes 1 à 8, plus large que le poste SR2 du compte
    // de résultat : le journal ouvre sur un « report à nouveau » et se clôt
    // sur un « solde à reporter », il doit donc porter TOUS les mouvements
    // de trésorerie, emprunt encaissé et virement interne compris
    // (anomalie n° 21).
    comptes: TOUTES_CLASSES_1_A_8,
    exclusions: ['70', '82', '2', '103', '104'],
  },
  // « Matériel et Mobilier » côté recettes : la cession d'une
  // immobilisation · 82 Produits des cessions d'immobilisations (Titre VII
  // COMPTE 82 : « crédité des produits de cession d'actif… par le débit d'un
  // compte de trésorerie »), et la classe 2 elle-même si la sortie est
  // saisie directement en diminution de l'actif. Le préfixe '2' capte aussi
  // 28 et 29, qui ne peuvent PAS être la contrepartie d'un encaissement
  // (leur contrepartie est 68, 85 ou 69, jamais la trésorerie · Titre VII
  // COMPTE 68 et 69) : seule une sortie d'actif brut se présente ici.
  { cle: 'materielMobilier', libelle: 'Matériel et Mobilier', comptes: ['82', '2'] },
  // NB officiel : rajout « compte exploitant » · apports définitifs (103)
  // et temporaires (104) de l'exploitant, Titre VII COMPTE 103 et 104.
  { cle: 'compteExploitant', libelle: 'Compte exploitant', comptes: ['103', '104'], rajoutAutorise: true },
];

export const VENTILATION_DEPENSES_SMT_SYSCOHADA: ColonneVentilationSmtSyscohada[] = [
  // 601 Achats de marchandises.
  { cle: 'achatsMarchandises', libelle: 'Achats marchandises', comptes: ['601'] },
  // Reste du 60 : 602 « Achats de matières premières et fournitures liées »,
  // 604 « Achats stockés de matières et fournitures consommables », 605
  // « Autres achats », 608 « Achats d'emballages » (plan de comptes
  // SYSCOHADA, intitulés exacts). Le 605 y est rangé bien qu'il contienne
  // aussi 6057 « Achats d'études et prestations de services » et 6058
  // « Achats de travaux, matériels et équipements », qui ne sont pas des
  // « matières et fournitures » au sens de la colonne : la maquette n'ouvre
  // que deux colonnes d'achats et c'est la plus proche des deux (le
  // drill-down montre le détail compte par compte). Le 603 (inventaire,
  // anomalie n° 11) n'a pas de contrepartie de trésorerie et ne se présente
  // pas.
  { cle: 'achatsMatieresFournitures', libelle: 'Achats matières et fournitures', comptes: ['60'], exclusions: ['601'] },
  // 622 entier, même périmètre que le poste SD2 · le 6224 « Malis sur
  // emballages » y figure sans être un loyer, comme au compte de résultat
  // (anomalie n° 18).
  { cle: 'loyers', libelle: 'Loyers', comptes: ['622'] },
  { cle: 'salaires', libelle: 'Salaires', comptes: ['66'] },
  { cle: 'impotsTaxes', libelle: 'Impôts et taxes', comptes: ['64', '89'] },
  {
    cle: 'autres',
    libelle: 'Autres',
    // Résiduel sur les classes 1 à 8, comme du côté des recettes : achat
    // d'une immobilisation, remboursement d'emprunt et virement interne y
    // figurent, faute de quoi le journal ne se reboucherait pas sur le
    // « solde à reporter » (anomalie n° 21).
    comptes: TOUTES_CLASSES_1_A_8,
    exclusions: ['60', '622', '66', '64', '89', '103', '104'],
  },
  // NB officiel : rajout « compte exploitant » · prélèvements de
  // l'exploitant (104), retraits d'apports (103). Imprimé après les colonnes
  // officielles, comme le NB l'autorise (« complétées… par des rajouts »).
  { cle: 'compteExploitant', libelle: 'Compte exploitant', comptes: ['103', '104'], rajoutAutorise: true },
];

/** NB officiel de la NOTE 4, imprimé sous le journal · transcrit tel quel. */
export const NB_JOURNAL_TRESORERIE_SMT_SYSCOHADA =
  'NB : prévoir un journal par banque et un journal pour la caisse. Les colonnes « ventilation recettes et dépenses » ' +
  'peuvent être complétées en cas de besoin par des rajouts notamment « compte exploitant ».';

// ---------------------------------------------------------------------------
// SEUILS D'ÉLIGIBILITÉ (AUDCIF art. 13)
// ---------------------------------------------------------------------------

/**
 * Article 13 : « Sont éligibles au Système minimal de trésorerie, les
 * entités dont le chiffre d'affaires hors taxes annuel est inférieur aux
 * seuils suivants : soixante (60) millions de F CFA ou l'équivalent dans
 * l'unité monétaire ayant cours légal dans l'État partie, pour les entités
 * de négoce ; quarante (40) millions de F CFA ou l'équivalent, pour les
 * entités artisanales et assimilées ; trente (30) millions de F CFA ou
 * l'équivalent, pour les entités de services. » (« sauf option » pour le
 * Système normal, art. 13 al. 1 et art. 11.)
 *
 * OmegaX ne connaît PAS la catégorie d'activité du dossier (négoce,
 * artisanat, services) : `Tenant` ne la porte pas, et la qualifier à la
 * place de l'entité serait écrire une règle que le texte confie à
 * l'entité. Le contrôle d'éligibilité présente donc le chiffre d'affaires
 * HT de l'exercice FACE AUX TROIS SEUILS, et laisse l'entité qualifier son
 * activité · l'arbitrage reste humain.
 *
 * Les seuils sont en F CFA. La RDC n'est pas en zone franc : la conversion
 * en CDF dépend d'un cours qui n'appartient pas au texte. Le contrôle
 * affiche le chiffre d'affaires en monnaie de tenue du dossier ET rappelle
 * chaque seuil en F CFA avec sa clause « ou l'équivalent », sans convertir
 * à la place de l'entité.
 */
export interface SeuilSmtArt13 {
  cle: 'negoce' | 'artisanat' | 'services';
  /** Catégorie telle que l'art. 13 la nomme. */
  categorie: string;
  montantFcfa: number;
}

export const SEUILS_SMT_ART13_FCFA: SeuilSmtArt13[] = [
  { cle: 'negoce', categorie: 'Entités de négoce', montantFcfa: 60_000_000 },
  { cle: 'artisanat', categorie: 'Entités artisanales et assimilées', montantFcfa: 40_000_000 },
  { cle: 'services', categorie: 'Entités de services', montantFcfa: 30_000_000 },
];

/** Clause de l'art. 13, à imprimer à côté de chaque seuil. */
export const CLAUSE_EQUIVALENT_ART13 = "ou l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie";

/**
 * Chiffre d'affaires hors taxes de l'art. 13 : compte 70 « Ventes » entier ·
 * c'est la définition du Système normal, ch. 4 (XB « CHIFFRE D'AFFAIRES
 * (A + B + C + D) » = 701 + 702 à 704 + 705, 706 + 707, voir
 * `correspondance-compte-resultat-syscohada.ts`), le Titre X n'en donnant
 * pas d'autre. Lu en solde de la classe 7 (montant facturé), pas en
 * encaissements : l'art. 13 parle de chiffre d'affaires, pas de recettes.
 */
export const COMPTES_CHIFFRE_AFFAIRES_ART13 = ['70'];
