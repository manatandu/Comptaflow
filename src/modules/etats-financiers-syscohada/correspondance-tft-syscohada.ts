/**
 * TABLEAU DES FLUX DE TRÉSORERIE SYSCOHADA révisé · Système normal.
 * Postes ZA, FA à FQ, ZB à ZH · MÉTHODE INDIRECTE pour les activités
 * opérationnelles (la CAFG, puis la variation du besoin de financement).
 *
 * Sources, toutes LUES avant d'écrire, aucune ligne de mémoire (CLAUDE.md
 * §1), et rien d'emprunté au SYCEBNL dont le TFT est en méthode DIRECTE
 * avec d'autres postes, d'autres comptes et d'autres notes (CLAUDE.md §6) :
 *  - AUDCIF, Titre IX, chapitre 5 · section 1 « Règles générales de
 *    présentation » (§ 1.1 architecture, § 1.2.1 CAFG et sa formule,
 *    § 1.2.1.3 passage de la CAFG au flux opérationnel, § 1.3
 *    investissement et reconstitution des acquisitions, § 1.4 financement)
 *    et section 2 « Modèle de Tableau des flux de trésorerie » (codes REF,
 *    libellés, colonne signe, clés A à H, renvoi (1), contrôle) · skill
 *    `audcif-acte-uniforme`, references/titre-9-ch1-5-bilan-resultat-flux.md,
 *    lignes 502 à 775. C'est la source primaire qui tranche tout désaccord ;
 *  - AUDCIF, Titre IX, chapitre 7 (correspondance postes/comptes du bilan
 *    et du compte de résultat) · references/titre-9-ch6-7-notes-annexes-
 *    correspondance.md, lignes 764 à 917 · pour savoir QUELS comptes chaque
 *    poste de bilan ou de compte de résultat cité ici contient ;
 *  - AUDCIF, Titre VII, fiches COMPTE 10 (101 à 109), 11, 12, 13, 14, 16,
 *    17, 18, 19, 25, 27, 28, 40, 41, 44, 45, 46, 47, 48, 56, 58, 65, 67, 75,
 *    77, 79, 81, 82, 83, 85, 86 · le fonctionnement de chaque compte lu en
 *    mouvement ou en solde ci-dessous ; Titre VIII ch. 6 (démantèlement,
 *    compte 1984), ch. 20 (emprunt obligataire, comptes 47131/47132) et
 *    ch. 28 (réévaluation des bilans, 106/154 · corrige une citation « ch.
 *    30 » erronée d'une version antérieure : le ch. 30 traite des
 *    engagements financiers, pas de la réévaluation) ;
 *  - le plan de comptes SYSCOHADA semé (`compte-seed-syscohada.ts`, généré
 *    depuis skill `syscohada`, comptes/references/plan-comptes.tsv) · chaque
 *    préfixe cité ici y existe, vérifié par le spec voisin ;
 *  - en AIDE seulement, jamais suivie contre l'AUDCIF : la matrice du
 *    praticien (skill `syscohada`, liasse/references/tft-formules-
 *    praticien.md, source secondaire recoupée AUDCIF), le moteur Python qui
 *    la code (liasse/scripts/monter_liasse.py, `construire_formules_tft`)
 *    et la narrative du skill (etats-financiers/references/chapitre-1-
 *    logique-postes-masses.md § 4). Chaque divergence est portée dans la
 *    section ANOMALIES.
 *
 * Les deux tables voisines de ce module sont les briques que ce fichier
 * assemble : `correspondance-bilan-syscohada.ts` (postes AD à DZ, brut et
 * amortissements séparés, totaux BT, DT, BG, DP) et
 * `correspondance-compte-resultat-syscohada.ts` (postes TA à RS, soldes XA
 * à XI, convention crédit − débit). Un poste de flux ne recopie jamais leurs
 * comptes : il les désigne par REF, et lit à côté les quelques comptes que
 * le chapitre 5 retraite un à un.
 *
 * ## Pourquoi la méthode indirecte, et ce qu'elle exige de la balance
 *
 * Le ch. 5 § 1.2.1 impose le point d'entrée : « CAFG = EBE (cf. Compte de
 * résultat) – Charges décaissables restantes + Produits encaissables
 * restants », « le point d'entrée est l'EBE, jamais le résultat net ». Puis
 * § 1.2.1.3 : « Encaissements au cours de l'exercice N = Produits (N) +
 * Créances (N–1) – Créances (N) », « Décaissements = Achats (N) + Dettes
 * (N–1) – Dettes (N) », et « Achats de l'exercice = Achats consommés –
 * Δ Stocks ». D'où les cinq lignes FA à FE : la CAFG, puis quatre
 * VARIATIONS de postes du bilan entre N et N-1.
 *
 * Trois natures de lecture, et pas une de plus, suffisent donc à tout le
 * tableau (`TermeFluxTresorerie`) :
 *  - un POSTE d'état, par REF · lu sur N, sur N-1, ou en variation N − N-1
 *    (bilan) ; en montant de l'exercice (compte de résultat) ;
 *  - un SOLDE de gestion (crédit − débit, la convention du compte de
 *    résultat SYSCOHADA, `montantSigne`) · pour retirer ou rajouter une
 *    charge ou un produit que le ch. 5 nomme (654, 754, 797, 697, 85, 86,
 *    799, 6541, 6542, 811, 812, 816, 821, 822, 826) ;
 *  - un MOUVEMENT de l'exercice (débit ou crédit, report à-nouveau exclu ·
 *    `LigneBalancePourEtat.mouvementDebit/mouvementCredit`) ou une
 *    VARIATION de solde (N − N-1, dans un sens donné) · pour les comptes de
 *    bilan que le ch. 5 sort d'un poste ou y ajoute (dettes sur
 *    immobilisations, apporteurs, écarts de conversion, intérêts courus…).
 *
 * Ce que la balance NE PORTE PAS, le poste le dit (`nonDeterminables`) et le
 * service laisse la part correspondante hors du chiffre en le signalant ·
 * jamais une clé inventée (même discipline que le moteur Python, qui rend
 * `incomplet` plutôt qu'un chiffre). Ce qui exige un exercice N-1 est
 * marqué (`besoinsDuPoste`) : sans N-1, le poste reste vide et signalé,
 * jamais une variation calculée depuis zéro.
 *
 * ## Convention de signe · CELLE DU MODÈLE, comme au compte de résultat
 *
 * Le modèle (ch. 5 section 2) imprime un signe devant chaque poste
 * (« – Actif circulant HAO », « + Variation du passif circulant »,
 * « – Décaissements liés aux acquisitions… », « + Encaissements… ») et
 * TOUS ses totaux sont des SOMMES : « somme FA à FE », « somme FF à FJ »,
 * « D + E », « B + C + F », « G + A ». On retient donc, exactement comme
 * pour le compte de résultat SYSCOHADA (charges en négatif, soldes en
 * sommes pures) :
 *
 *     montant d'un poste = valeur SIGNÉE telle qu'elle entre dans le total,
 *     un décaissement ressort NÉGATIF, un encaissement POSITIF,
 *     une variation de créance ou de stock ressort déjà changée de signe.
 *
 * Chaque terme porte le signe (+1 / −1) avec lequel il entre dans le poste ;
 * le « – » imprimé par le modèle est DÉJÀ dans ces signes. `signeModele`
 * reproduit la colonne imprimée (pour l'affichage) et `signeAttendu` dit
 * si le poste doit ressortir positif, négatif ou libre · un FF positif
 * (des acquisitions négatives) n'est pas une erreur de calcul, c'est une
 * anomalie à montrer (`signeConformeAuModeleFlux`), jamais à redresser.
 * C'est aussi la correction v3 du moteur Python (« la cellule de FB, FC et
 * FD porte l'opposé de la variation calculée »), codée ici dans les termes
 * plutôt que rappelée dans une note.
 *
 * ## Le bouclage : deux calculs indépendants, jamais un seul
 *
 * Le modèle porte lui-même son contrôle : « ZH Trésorerie nette au 31
 * Décembre (G + A) · Contrôle : Trésorerie actif N – Trésorerie passif N »,
 * soit BT − DT du bilan. ZH est donc calculé DEUX FOIS · par cumul des flux
 * (ZA + ZB + ZC + ZF, `CONTROLE_ZH_PAR_LES_FLUX`) et par lecture directe du
 * bilan (`CONTROLE_ZH_PAR_LE_BILAN`) · et l'écart est présenté, jamais
 * corrigé : il chiffre exactement ce que la ventilation FA à FQ ne couvre
 * pas, et `COMPTES_TFT_NON_VENTILES_JUSTIFIES` en nomme les causes connues.
 *
 * ## ANOMALIES du texte officiel et divergences des aides, tranchées ici
 *
 * Aucune n'est corrigée en silence (CLAUDE.md §9). Numérotées pour être
 * citées depuis les postes, le spec et le service.
 *
 * 1. **Schéma de la section 1 incohérent avec le modèle de la section 2**
 *    `[texte officiel]` · le schéma donne deux fois la lettre F, écrit la
 *    variation « B + C + D » et numérote la clôture G ; le modèle retient
 *    F = D + E, G = B + C + F, H = G + A. Le MODÈLE fait foi (c'est lui qui
 *    est déposé) : ZF = ZD + ZE, ZG = ZB + ZC + ZF, ZH = ZG + ZA.
 *
 * 2. **Formule de reconstitution des acquisitions tronquée**
 *    `[texte officiel]` · § 1.3 s'interrompt sur « Avances et acomptes […]
 *    payés au cours des exercices précédents e du ». Non reconstituée. La
 *    lecture retenue pour FF et FG (variation du BRUT du poste, voir n° 3)
 *    n'a pas besoin de ce terme : une avance versée en N-1 puis imputée en
 *    N (débit 2x par crédit 25) augmente le brut ET crédite le 25, et le
 *    « + crédit 25 » du poste l'annule ; le terme tronqué est couvert sans
 *    avoir été deviné.
 *
 * 3. **Brut ou net pour la variation des immobilisations** · le ch. 5 § 1.3
 *    reconstitue les acquisitions depuis la variation des immobilisations
 *    NETTES en rajoutant dotations aux amortissements, dotations aux
 *    dépréciations et VNC cédées ; le praticien écrit « AD(N) − AD(N-1) +
 *    mouvement débit 281 + solde débiteur 6541, 811 » sans dire brut ou net,
 *    et le moteur Python le code sur le NET (`f_rub_net`). Or « + débit 28 »
 *    (amortissements sortis à la cession) n'est juste que sur le BRUT ; sur
 *    le net il faudrait « + crédit 28 » (dotations). Retenu : le BRUT du
 *    poste (colonne « Brut » du modèle de bilan, que
 *    `correspondance-bilan-syscohada.ts` expose à part), parce que
 *    Δbrut + amortissements sortis + VNC = Δbrut + valeur d'entrée cédée est
 *    algébriquement la formule officielle (Δnet + dotations + VNC), et
 *    qu'elle ne souffre pas du silence de cette formule sur les reprises de
 *    dépréciations (débit 29 par 791, hors CAFG, qui gonfleraient les
 *    acquisitions lues sur le net). Restent, incluses dans le débit du 28,
 *    les reprises d'amortissement 798 « cas de révision de plan
 *    d'amortissement » (Titre VII COMPTE 79, note ¹) et 862 « reprises
 *    d'amortissements HAO » : cas exceptionnels, signalés sur FF et FG ·
 *    voir anomalie n° 22.
 *
 * 4. **Intérêts courus** · le ch. 5 § 1.2.1.3 range « la variation des
 *    créances […] et des intérêts courus des immobilisations financières »
 *    dans FD et « la variation du passif circulant et des intérêts des
 *    emprunts et dettes financières courus » dans FE. Le praticien les
 *    laisse en FO/FP/FQ (1661, 1662, 183) avec ce NB : « les intérêts
 *    courus ont été considérés ici comme opération de financement ».
 *    L'AUDCIF est tenu : Δ276 en FD ; Δ166, Δ176, Δ183 en FE ; 166, 176,
 *    183, 276 exclus de FG, FH, FJ, FO, FP, FQ. Cohérent avec la CAFG, qui
 *    contient déjà la charge 671/672 et le produit 77 (courus compris).
 *
 * 5. **Obligataires (4713)** · le praticien ajoute « + mouvement débit
 *    4713 » à FO. Titre VIII ch. 20 : « 47131 débité pour le montant des
 *    obligations à placer par le crédit du 1611 », puis « 521 débité lors de
 *    la libération des fonds par le crédit du 47132 ». Le crédit du 161 et
 *    le débit du 4713 sont donc la MÊME émission : les additionner la
 *    compterait deux fois. Retenu, par la relation générale du ch. 5
 *    (Encaissements = flux + Créances(N-1) − Créances(N)) : crédit 161 moins
 *    la variation du solde débiteur du 4713, c'est-à-dire l'emprunt émis
 *    moins ce que les obligataires n'ont pas encore versé.
 *    **Corollaire indispensable, corrigé après relecture** : le 4713
 *    débiteur loge en BJ (ch. 7, BILAN ACTIF : « Soldes débiteurs : 185, 42,
 *    43, 44, 45, 46, 47 (sauf 478) »), donc dans BG, que FD lit en variation.
 *    Sans retrait, la souscription non libérée était comptée DEUX fois, en
 *    FD puis en FO, et l'écart se retrouvait tel quel entre ZH par les flux
 *    et ZH par le bilan (émission de 1 000 dont 400 non libérés : FO = 600,
 *    juste, mais FD portait −400 de plus). Le renvoi (1) du § 1.2.1.3 ordonne
 *    précisément ce retrait, « les variations liées aux dettes et créances
 *    rattachées aux opérations de financement ». FD porte donc + Δ4713
 *    débiteur, exactement comme il le fait pour 4494, 461 et 467.
 *    Le 4713 CRÉDITEUR (émission surcouverte, Titre VIII ch. 20 : « les
 *    souscriptions […] peuvent dépasser le nombre d'obligations à émettre »,
 *    le trop-versé restant à rembourser) est laissé dans DP, donc dans FE :
 *    l'encaissement est réel, et le sortir sans que FO le reprenne (FO ne
 *    lit que le sens débiteur) créerait un écart de bouclage là où il n'y a
 *    qu'un écart de répartition ZB/ZE. Signalé, pas corrigé.
 *
 * 6. **Écarts de conversion (478/479)** · le praticien lit 4781/4791/4783/
 *    4793 en VARIATION mais 4782/4792/4784/4794 en SOLDE N seul, et les
 *    5ᵉ chiffres qu'il cite (47811, 47818, 47911, 47918) n'existent ni au
 *    Titre VII ni au plan semé. Le ch. 5 parle de « variation des écarts de
 *    conversion d'exploitation ». Retenu : la VARIATION partout, chaque
 *    écart placé dans le poste dont il neutralise le mouvement (4782 → FJ,
 *    4792 → FH, 4784 → FO, 4794 → FQ, 4781/4791 → FD, 4783/4793 → FE) ;
 *    la part HAO des 4781/4791 (que FB devrait porter) n'est pas séparable
 *    à 4 chiffres et reste en FD ; la part « autres dettes financières » du
 *    4784 (FP) n'est pas séparable du 4784 et reste en FO. Effet sur ZB, ZC,
 *    ZE : aucun ; sur la répartition FB/FD et FO/FP : signalé.
 *    **Hypothèse à écrire, faute de source** : 4782, 4792, 4784 et 4794 sont
 *    lus en VARIATION alors que les postes qui les portent (FH, FJ, FO, FQ)
 *    sont bâtis sur des MOUVEMENTS de N. Les deux ne coïncident que si
 *    l'ajustement de clôture n'est PAS contre-passé à la réouverture, c'est-
 *    à-dire si le compte d'écart ne bouge que de l'incrément de l'exercice.
 *    S'il est contre-passé, la contre-passation transite par le crédit ou le
 *    débit du 27 ou du 16, et le solde N-1 ressort en faux encaissement d'un
 *    côté et en fausse acquisition de l'autre : FH/FJ et FO/FQ sont faussés
 *    du montant de l'écart de N-1, ZC et ZE restent justes. Le Titre VIII
 *    ch. 22 section 2 (transcrit) ne dit NI l'un NI l'autre `[texte
 *    officiel]` ; il écrit seulement que les différences sont « inscrites
 *    dans des subdivisions des créances et des dettes concernées » avec
 *    478/479 en contrepartie. Le Titre V (cadre conceptuel, § saisie de
 *    l'information de base) cite la « contre-passation à la réouverture »
 *    comme une pratique générale d'organisation, sans la prescrire ici.
 *    L'hypothèse retenue est donc la non contre-passation, faute de mieux,
 *    et son démenti se voit sur la seule répartition, jamais sur ZH.
 *
 * 7. **Titres de placement non libérés (4726)** · le ch. 5 (1) exclut de la
 *    variation du BF opérationnel « la variation du versement restant à
 *    effectuer sur titre de placement non libérés », mais son contrôle
 *    « ZH = Trésorerie actif N – Trésorerie passif N » lit BQ (compte 50)
 *    pour le montant TOTAL des titres, non libéré compris (Titre VIII
 *    ch. 13 : « 50 débité par le crédit des comptes de trésorerie et 472 »).
 *    Les deux ne peuvent tenir ensemble qu'avec 4726 = 0 `[texte officiel]`.
 *    Le praticien tranche en retranchant le 4726 de ZA et ZH ; ce fichier
 *    tient le contrôle LITTÉRAL du modèle (ZH = BT − DT, comme le service
 *    du bilan le calcule) et exclut 4726 de FE comme le (1) l'ordonne : un
 *    4726 non nul ressort alors en écart de bouclage, et
 *    `COMPTES_TFT_NON_VENTILES_JUSTIFIES` le désigne comme cause.
 *
 * 8. **2714 / 2715 / 2766 : le plan semé ne suit pas le Titre VII** · la
 *    fiche COMPTE 27 donne 2714 « Créances de location financement », 2715
 *    « Titres prêtés », 2766 « Intérêts courus sur créances de location
 *    financement » ; le plan officiel du skill (plan-comptes.tsv, 1403
 *    comptes) et donc le semis donnent 2714 « Titres prêtés », ni 2715 ni
 *    2766 `[texte officiel]`. L'exclusion « 27 sauf 2714, 2766 » du
 *    praticien (créances du bailleur en location-financement, sans flux à
 *    l'entrée) ne peut pas être appliquée par numéro : sur ce plan, 2714
 *    est un prêt de titres, lui aussi sans trésorerie (débit 2714 par
 *    crédit 26/274). Retenu : 27 entier sauf 276 dans FH et FJ ; les deux
 *    mouvements d'un prêt de titres se compensent entre FH et FJ ; un
 *    dossier en location-financement bailleur doit ouvrir des sous-comptes
 *    et sera vu en écart de répartition FH/FJ, jamais en écart de ZH.
 *
 * 9. **4856 n'existe pas, mais la créance loge quand même en 485** ·
 *    (corrigé, contradicteur relu) une première lecture supposait la
 *    créance sur cession de titres logée en débiteurs divers (4711, BJ)
 *    faute de sous-compte dédié, et donc récupérée par FD. Titre VII
 *    COMPTE 82 dit le contraire, SANS restriction de type : « [82]
 *    crédité des produits de cession d'actif, par le débit du compte de
 *    tiers 485 (Créances sur cessions d'immobilisations) ou par le débit
 *    d'un compte de trésorerie » ; COMPTE 48 confirme que 485 est le
 *    compte HAO générique des créances sur cession, ses subdivisions
 *    4851-4858 n'étant qu'une ventilation par nature de pièce, pas une
 *    restriction aux seules incorporelles/corporelles. La créance sur une
 *    cession financière à crédit se loge donc en 485, déjà lu par la
 *    VARIATION_SOLDE de FI (`variation(-1, ['414','485'], 'DEBITEUR')`) ·
 *    alors que le prix (826) et la VNC (816) de cette même cession sont
 *    lus en FJ : c'est la répartition **FI/FJ**, et non FD/FJ, qui est
 *    faussée du montant de la créance non recouvrée à la clôture ; ZC
 *    (somme FF à FJ) n'en est pas affecté. Signalé en non déterminable
 *    sur FJ, dont le motif visait encore le 4711 avant cette relecture ;
 *    FD n'a plus à s'en charger, sa part ne concerne que le 4721 (cession
 *    de titres de PLACEMENT, qui est de la trésorerie, pas de
 *    l'immobilisation financière).
 *
 * 10. **4816, 4817, 4818 non subdivisés** · Titre VII COMPTE 48 : « créer
 *     des sous-comptes pour distinguer les immobilisations corporelles des
 *     incorporelles » ; le praticien cite 48161/48162…, absents du plan
 *     semé. Pris EN ENTIER sous FG (corporelles, le cas courant des
 *     retenues de garantie sur marchés de construction), comme le bilan
 *     prend ses comptes « p » sous un seul poste (anomalie n° 1 de
 *     `correspondance-bilan-syscohada.ts`) : un dossier qui ouvre 48161
 *     sera capté par le préfixe 4816 et ira aussi en FG · signalé, plutôt
 *     qu'un écart de bouclage sur chaque retenue de garantie.
 *
 * 11. **Réévaluation (106, 154) « part relative aux immobilisations
 *     corporelles / financières »** · le praticien répartit le crédit de
 *     106 et 154 entre FG et FH par une part qu'aucune balance ne donne.
 *     Pris en entier sous FG (Titre VIII ch. 30 vise d'abord les
 *     immobilisations corporelles) ; FH le déclare non déterminable.
 *
 * 12. **Cessions d'immobilisations financières (FJ)** · le praticien écrit
 *     « 826 + crédit 27 » sans 26 ni 816. Si la cession passe par 816/826
 *     (Titre VII COMPTE 81 et 82, subdivisions « immobilisations
 *     financières »), le crédit du 27 est la valeur d'entrée et le 826 le
 *     prix : les additionner double la valeur d'entrée. Le ch. 5 § 1.3 vise
 *     « la cession ET le remboursement des immobilisations financières ».
 *     Retenu : crédit 26 + crédit 27 (sauf 276) + solde 826 + solde 816 ·
 *     qui vaut le prix dans les deux schémas d'écriture (avec 81/82 : VE +
 *     prix − VE ; sans : prix crédité directement au 27).
 *
 * 13. **Opérations sans trésorerie non neutralisables** · apports en nature
 *     (4611, 4614, 1052, 1053), conversion de dettes en capital (1054,
 *     1612, 1613 · « conversion de dettes en capitaux propres » exclue par
 *     le ch. 5 § 1.4), immobilisation transférée gratuitement (débit 2x
 *     par crédit 14, Titre VII COMPTE 14), solde du compte de l'exploitant
 *     à la clôture (104 par 103), et **affectation d'une perte dans une
 *     entité individuelle** : Titre VII COMPTE 103, « débité, à l'ouverture
 *     de l'exercice, du montant de l'affectation du résultat de l'exercice
 *     précédent, par le crédit du 139 » · FK lit ce crédit 139 (faux apport)
 *     et FM ce débit 103 (faux prélèvement). Chacune gonfle DEUX postes du
 *     même montant et de sens opposé (FK et FG, FK et FQ, FL et FG, FK et
 *     FM) : ZH n'en est pas affecté, les postes le sont. Sortir le 103 du
 *     débit de FM ne réglerait rien : le virement 104 → 103 de clôture
 *     laisserait alors un crédit 104 sans contrepartie en FK et fausserait
 *     ZD, cette fois pour de bon. Aucune balance ne permet de séparer ces
 *     débits ; signalé sur FK et FM, pas corrigé.
 *
 * 14. **Compte transitoire 475** · le praticien lit « solde débiteur 4752 »
 *     dans FD ; Titre VII COMPTE 47 : 4751 « compte actif », 4752 « compte
 *     passif ». Retenu par les intitulés : 4751 sorti de FD, 4752 sorti de
 *     FE (ajustement de la révision, sans flux).
 *
 * 15. **Codes ZA à ZH homonymes** des fiches R1 (ZA à ZI) et R2 (ZK à ZS)
 *     `[texte officiel]` : lever l'ambiguïté par l'état, jamais par le code
 *     seul (le client n'affiche ces REF que sous le titre du tableau).
 *
 * 16. **Compléments au praticien, chacun fondé sur le Titre VII** · 4493
 *     « État, fonds de dotation à recevoir » ajouté à FD/FK par symétrie
 *     avec 4581 (COMPTE 102 : « crédité par le débit du 4493 ») ; 4615/4616
 *     « versements reçus / anticipés sur augmentation de capital » ajoutés
 *     à FK (encaissés avant l'écriture de capital, ils disparaissaient du
 *     tableau puisque FE exclut tout le 461) ; débit 106 ajouté aux
 *     neutralisations de FK (COMPTE 106 : « débité des incorporations
 *     directes au capital ») ; crédit 1309 ajouté à côté du crédit 139
 *     (affectation d'une perte en instance) ; 4611, 4612, 4614, 4617
 *     ajoutés aux apporteurs débiteurs de FK (COMPTE 46, subdivisions du
 *     461, toutes « opérations sur le capital »).
 *
 * 17. **Comptes laissés hors du tableau, volontairement** · 4497 « avances
 *     sur subventions » (exploitation ou investissement, indécidable par
 *     numéro : laissé dans DP donc en FE, signalé) ; 184 à 188 (comptes de
 *     liaison, neutralisés dans la comptabilité fusionnée, Titre VII COMPTE
 *     18 · même traitement que l'anomalie n° 5 du bilan) ; 585, 588
 *     (virements internes à solder, COMPTE 58) ; 1962 « actif du régime de
 *     retraite » (COMPTE 19 : « la prime versée est enregistrée au débit du
 *     1962 par le crédit d'un compte de trésorerie » · un décaissement réel
 *     logé dans les ressources stables, qu'aucune ligne du ch. 5 ne nomme
 *     `[texte officiel]`) ; 4786, 4788, 4797, 4798 (anomalie n° 24). Voir
 *     `COMPTES_TFT_NON_VENTILES_JUSTIFIES` ; et
 *     `COMPTES_EXCLUS_SANS_REPRISE` pour 4726, 4751, 4752, retirés de FD/FE
 *     sans être repris ailleurs.
 *
 * 18. **Renvoi de note** · la colonne « Note » du modèle est vide sur toutes
 *     les lignes de la transcription lue ; aucun renvoi n'est inventé (la
 *     CAFG figure aussi en note 34, fiche de synthèse, mais le modèle ne
 *     l'y renvoie pas).
 *
 * 19. **La CAFG et les charges HAO (83)** `[texte officiel]` · la formule
 *     énumérée du ch. 5 § 1.2.1.1, reprise mot pour mot par la maquette de
 *     la NOTE 34 (ch. 6), ne porte AUCUNE ligne « – Charges HAO » : elle
 *     descend de l'EBE à « + Produits HAO + Transferts de charges HAO –
 *     Frais financiers – Pertes de change – Participation – Impôt sur les
 *     résultats ». Les produits HAO y entrent, les charges HAO n'en
 *     sortent pas. L'omission est intenable au regard de la définition
 *     générale du même § 1.2.1, « CAFG = EBE – Charges décaissables
 *     restantes + Produits encaissables restants » : le 83 (Autres charges
 *     HAO, ch. 7 poste RP) est décaissable, et le praticien l'écrit
 *     lui-même « − RP sauf 85 ». FA lit donc RP (moins le 85, sans
 *     décaissement) et l'écart avec la formule énumérée est porté ici et
 *     dans la `note` du poste, jamais comblé en silence.
 *
 * 20. **Désactualisation de la provision pour démantèlement (1984)** ·
 *     Titre VIII ch. 6 donne DEUX emplois du crédit du 1984, que la balance
 *     ne sépare pas : (a) à l'entrée de l'immobilisation, « le composant
 *     Démantèlement enlèvement et restauration du site est débité
 *     directement par le crédit du compte 1984 » (ou 6911/1984 puis
 *     24112/7911, neutre : 6911 est en RL et 7911 en TJ, tous deux hors
 *     XD) · c'est exactement le terme « – Coûts relatifs au démantèlement
 *     […] imputés aux immobilisations » du § 1.3, que FG doit retirer ;
 *     (b) à CHAQUE clôture, la désactualisation, « le compte 6971 est
 *     débité par le crédit du compte 1984 », SANS aucun débit de classe 2.
 *     Le cas (b) est déjà neutre dans la CAFG (FA retire le 697 de XF),
 *     mais le crédit 1984 lu en entier par FG le rajoute une seconde fois :
 *     ZH par les flux excède alors ZH par le bilan du montant de la
 *     désactualisation, chaque exercice. Non séparable par numéro (le 6971
 *     couvre aussi les autres provisions financières) : déclaré non
 *     déterminable sur FG, et `COMPTES_SANS_TRESORERIE_SYSCOHADA` le dit.
 *
 * 21. **Réévaluation d'un bien AMORTISSABLE : la part portée au 28** ·
 *     Titre VIII ch. 28 § 4.2.4.1 (et non ch. 30, qui traite des
 *     engagements financiers) : pour une immobilisation amortissable, le
 *     compte de classe 2 est débité de la différence de VALEUR D'ENTRÉE,
 *     par le crédit du 28 pour la différence de CUMUL D'AMORTISSEMENTS et
 *     du 1061 (ou 154) pour la seule différence de valeur nette comptable.
 *     FG lit −Δ BRUT (la totalité) et + crédit 106/154 (la part nette
 *     seulement) : la part « amortissements » de l'écart ressort en fausse
 *     acquisition, et cette fois ZH par les flux est faux (exemple 2 du
 *     texte : brut 1 000 → 1 400, cumul 400 → 560, écart 240 · FG = −400 +
 *     240 = −160 de décaissement inventé). Le corriger exigerait « + crédit
 *     28 de réévaluation », que rien ne sépare des dotations de l'exercice.
 *     Déclaré non déterminable sur FG. FF n'est pas concerné : le § 1.2 du
 *     même chapitre borne le champ d'application, « la réévaluation doit
 *     porter sur l'ensemble des immobilisations corporelles et financières »
 *     · les incorporelles en sont exclues.
 *
 * 22. **Reprise d'amortissements HAO (862)** · Titre VII COMPTE 28 : le 28
 *     est « débité de la reprise des amortissements par le crédit du 798
 *     […] ou par le crédit du 862 (Reprises d'amortissements HAO) ». FF et
 *     FG lisent le débit du 28 comme l'amortissement sorti à la cession
 *     (anomalie n° 3) : une reprise le gonfle en fausse acquisition. Le 798
 *     était déjà signalé ; le 862 ne l'était pas, alors qu'il est plus
 *     gênant encore, FA le retirant de TO (ch. 7 : TO = 84, 86, 88) donc de
 *     la CAFG. Dans les deux cas le produit de reprise reste hors du tableau
 *     (798 est en TJ, hors XD, jamais lu par FA ; 862 est retiré de TO)
 *     tandis que sa contrepartie au débit du 28 y entre : ZH par les flux
 *     ressort INFÉRIEUR à ZH par le bilan du montant de la reprise. Les deux
 *     sont désormais déclarés ensemble sur FF et FG.
 *
 * 23. **Résultat en instance d'affectation (130)** · Titre VII COMPTE 13 :
 *     « à la réouverture des comptes de l'exercice suivant, les entités ont
 *     la possibilité d'utiliser un compte spécial Résultat en instance
 *     d'affectation (130) », subdivisé en 1301 (bénéfice) et 1309 (perte).
 *     FK lisait le débit du 130 EN ENTIER mais n'en reprenait au crédit que
 *     le 1309 : le bénéfice viré au 1301 (débit 131 / crédit 1301, puis
 *     débit 1301 / crédit 11, 12, 465) sortait deux fois et ne rentrait
 *     qu'une · FK ressortait à −(bénéfice N-1) dans tout dossier passant
 *     par le 130. Corrigé : le crédit est lu sur le 130 en entier, comme le
 *     débit. Le cas de la perte était déjà juste et le reste (crédit 1309
 *     désormais couvert par le préfixe 130, sans doublon puisque le terme
 *     ne le cite plus à part).
 *
 * 24. **4786, 4788, 4797, 4798 : des écarts sans poste que le tableau lise**
 *     · Titre VII COMPTE 47 subdivise 478 et 479 jusqu'à 4786/4797
 *     « différences d'évaluation sur instruments de trésorerie » et
 *     4788/4798 « différences compensées par couverture de change », tous
 *     quatre au plan semé. Le ch. 7 les range en BU et DV, qui ne sont dans
 *     AUCUN total lu par le tableau (BG = BH + BI + BJ, DP = DH + DI + DJ +
 *     DK + DM + DN, et BJ comme DM excluent explicitement 478 et 479). Leur
 *     contrepartie, elle, est lue : le 54 (Instruments de trésorerie,
 *     COMPTE 47 : « en contrepartie du compte 54 ») est dans BS donc dans
 *     BT, et l'élément couvert est une créance ou une dette de BG/DP. Un
 *     mouvement sur ces quatre comptes creuse donc un écart entre ZH par
 *     les flux et ZH par le bilan que rien n'expliquerait. Ajoutés à
 *     `COMPTES_TFT_NON_VENTILES_JUSTIFIES` pour que le service les nomme à
 *     côté de l'écart.
 */

/** État dont un terme lit un poste, par REF. */
export type EtatSource = 'BILAN' | 'COMPTE_RESULTAT';

/**
 * Comment lire un poste d'état. Un poste de bilan se lit sur N, sur N-1 ou
 * en variation (N − N-1) ; un poste du compte de résultat n'a que le
 * montant de l'exercice (« N »).
 */
export type LecturePoste = 'N' | 'N1' | 'VARIATION';

/**
 * Colonne du bilan actif à lire (modèle ch. 3 : Brut, Amortissements et
 * dépréciations, Net). Sans objet au passif et au compte de résultat.
 */
export type ColonneBilan = 'BRUT' | 'NET';

/**
 * Comment lire un ensemble de comptes :
 *  - `SOLDE_GESTION` · crédit − débit sur l'exercice N, la convention du
 *    compte de résultat SYSCOHADA (une charge ressort négative) ;
 *  - `MOUVEMENT_DEBIT` / `MOUVEMENT_CREDIT` · mouvements propres de
 *    l'exercice N, report à-nouveau exclu ;
 *  - `VARIATION_SOLDE` · solde N − solde N-1, chaque solde pris dans le sens
 *    `sensSolde` (une ligne dont le solde est de l'autre sens compte 0). Le
 *    solde N-1 se lit dans la balance de l'exercice N-1 ; à défaut, le
 *    report à-nouveau de N (`reportDebit − reportCredit`) EST la clôture
 *    N-1 pour un compte de bilan (modes SOLDE et DETAIL du semis) · même
 *    nombre, pas une approximation. Un POSTE de bilan en variation n'a pas
 *    cet équivalent, d'où `besoinsDuPoste().exerciceN1`.
 */
export type LectureCompte = 'SOLDE_GESTION' | 'MOUVEMENT_DEBIT' | 'MOUVEMENT_CREDIT' | 'VARIATION_SOLDE';

export type SensSolde = 'DEBITEUR' | 'CREDITEUR';

export interface TermePoste {
  etat: EtatSource;
  ref: string;
  lecture: LecturePoste;
  /** Bilan actif seulement · défaut NET (passif et compte de résultat : sans objet). */
  colonne?: ColonneBilan;
}

export interface TermeComptes {
  prefixes: string[];
  exclusions?: string[];
  lecture: LectureCompte;
  /** Obligatoire pour VARIATION_SOLDE ; sans objet pour les autres lectures. */
  sensSolde?: SensSolde;
}

/**
 * Un terme = un signe × (un poste OU un ensemble de comptes). Exactement
 * l'un des deux est renseigné (le spec le vérifie).
 */
export interface TermeFluxTresorerie {
  /** Signe avec lequel le terme entre dans le poste · le « – » du modèle y est déjà. */
  signe: 1 | -1;
  poste?: TermePoste;
  comptes?: TermeComptes;
  /** Pourquoi ce terme, avec sa source · repris dans l'état au drill-down. */
  motif: string;
}

export type SectionFlux = 'OUVERTURE' | 'OPERATIONNEL' | 'INVESTISSEMENT' | 'CAPITAUX_PROPRES' | 'CAPITAUX_ETRANGERS';

/** Colonne signe du modèle officiel (ch. 5 section 2) · vide pour FA et ZA. */
export type SigneModeleFlux = '+' | '-' | '';

export type SigneAttenduFlux = 'POSITIF' | 'NEGATIF' | 'LIBRE';

export interface PosteFluxTresorerieSyscohada {
  ref: string;
  /** Libellé exact du modèle, signe imprimé retiré (il est dans `signeModele`). */
  libelle: string;
  section: SectionFlux;
  signeModele: SigneModeleFlux;
  signeAttendu: SigneAttenduFlux;
  /** Renvoi de bas de tableau (« (1) » sur FB et FE). */
  renvoi?: string;
  termes: TermeFluxTresorerie[];
  /**
   * Ce que le ch. 5 demande et que la balance ne permet pas d'ISOLER. Deux
   * cas, que le `motif` distingue toujours et que le service reproduit tel
   * quel : la part manque au chiffre (aucun terme ne la lit), ou elle y est
   * comprise à tort faute de sous-compte. Dans les deux cas elle est
   * affichée, jamais approximée par une clé inventée. Ne pas lire cette
   * liste comme « ces comptes sont exclus du poste » : le motif seul le dit.
   */
  nonDeterminables?: { comptes: string[]; motif: string }[];
  /** Commentaire de rattachement reproduit dans l'état. */
  note?: string;
}

/** Aides d'écriture · un terme sur un poste ou sur des comptes. */
function poste(signe: 1 | -1, etat: EtatSource, ref: string, lecture: LecturePoste, motif: string, colonne?: ColonneBilan): TermeFluxTresorerie {
  return { signe, poste: colonne ? { etat, ref, lecture, colonne } : { etat, ref, lecture }, motif };
}
function gestion(signe: 1 | -1, prefixes: string[], motif: string, exclusions?: string[]): TermeFluxTresorerie {
  return { signe, comptes: exclusions ? { prefixes, exclusions, lecture: 'SOLDE_GESTION' } : { prefixes, lecture: 'SOLDE_GESTION' }, motif };
}
function debit(signe: 1 | -1, prefixes: string[], motif: string, exclusions?: string[]): TermeFluxTresorerie {
  return { signe, comptes: exclusions ? { prefixes, exclusions, lecture: 'MOUVEMENT_DEBIT' } : { prefixes, lecture: 'MOUVEMENT_DEBIT' }, motif };
}
function credit(signe: 1 | -1, prefixes: string[], motif: string, exclusions?: string[]): TermeFluxTresorerie {
  return { signe, comptes: exclusions ? { prefixes, exclusions, lecture: 'MOUVEMENT_CREDIT' } : { prefixes, lecture: 'MOUVEMENT_CREDIT' }, motif };
}
function variation(signe: 1 | -1, prefixes: string[], sensSolde: SensSolde, motif: string, exclusions?: string[]): TermeFluxTresorerie {
  return {
    signe,
    comptes: exclusions ? { prefixes, exclusions, lecture: 'VARIATION_SOLDE', sensSolde } : { prefixes, lecture: 'VARIATION_SOLDE', sensSolde },
    motif,
  };
}

/** Renvoi (1) du modèle, reproduit tel quel sous FB et FE. */
export const RENVOI_1_TFT_SYSCOHADA =
  "À l'exclusion des variations des créances et dettes liées aux activités d'investissement (variation des créances " +
  "sur cession d'immobilisation et des dettes sur acquisition ou production d'immobilisation) et de financement " +
  "(par exemple variation des créances sur subventions d'investissements reçues).";

/**
 * ZA · « Trésorerie nette au 1er janvier (Trésorerie actif N-1 – Trésorerie
 * passif N-1) » : le libellé officiel dit lui-même la formule, BT − DT du
 * bilan N-1. Sans exercice N-1, le poste reste vide et signalé (jamais un
 * faux zéro) · anomalie n° 7 pour le 4726.
 */
export const POSTE_TRESORERIE_OUVERTURE_SYSCOHADA: PosteFluxTresorerieSyscohada = {
  ref: 'ZA',
  // Le modèle (ch. 5 section 2) imprime « Trésorerie actif N-1 – Trésorerie
  // passif N-1 » avec un demi-cadratin, qui n'est PAS le cadratin interdit
  // par CLAUDE.md §4 · libellé recopié au caractère près.
  libelle: 'Trésorerie nette au 1er janvier (Trésorerie actif N-1 – Trésorerie passif N-1)',
  section: 'OUVERTURE',
  signeModele: '',
  signeAttendu: 'LIBRE',
  termes: [
    poste(1, 'BILAN', 'BT', 'N1', 'Trésorerie actif N-1 · total BT du bilan (BQ + BR + BS, nets).', 'NET'),
    poste(-1, 'BILAN', 'DT', 'N1', 'Trésorerie passif N-1 · total DT du bilan (DQ + DR).'),
  ],
};

/**
 * FA à FE · activités opérationnelles, méthode indirecte (ch. 5 § 1.2).
 */
export const POSTES_OPERATIONNELS_SYSCOHADA: PosteFluxTresorerieSyscohada[] = [
  {
    ref: 'FA',
    libelle: "Capacité d'Autofinancement Globale (CAFG)",
    section: 'OPERATIONNEL',
    signeModele: '',
    signeAttendu: 'LIBRE',
    // Formule du ch. 5 § 1.2.1.1, terme à terme SAUF RP : la formule
    // énumérée n'y porte aucune ligne « – Charges HAO », omission relevée en
    // anomalie n° 19 et comblée ici par la définition générale du § 1.2.1
    // (« – Charges décaissables restantes »). Les lignes « Revenus
    // financiers », « Gains de change » (776), « Transferts de charges
    // financières » (787), « Frais financiers », « Pertes de change » (676)
    // sont TK, TM et RM du compte de résultat, le ch. 7 faisant remonter 77
    // et 67 en bloc ; « Produits HAO » et « Transferts de charges HAO »
    // (848) sont TO ; « Participation » RQ ; « Impôt » RS. Les dotations et
    // reprises (697, 797, 85, 86) sont retirées : ni décaissables ni
    // encaissables. 659/679/839 et 759/779/849 restent : le Titre VII
    // (COMPTE 659, 759) les qualifie lui-même de « décaissements » et
    // « encaissements probables à brève échéance » et les loge dans l'EBE ;
    // la variation des dépréciations (39, 49, 59) et provisions à court terme
    // (499, 599) lue en NET dans FB à FE les neutralise.
    termes: [
      poste(1, 'COMPTE_RESULTAT', 'XD', 'N', "Excédent brut d'exploitation · « le point d'entrée est l'EBE, jamais le résultat net » (ch. 5 § 1.2.1)."),
      //
      // LES DEUX QUOTES-PARTS SUR OPÉRATIONS FAITES EN COMMUN.
      //
      // Le ch. 33 § 7.2 fait sortir le 652 et le 752 des postes ordinaires
      // pour les loger dans « un poste supplémentaire de charges et un de
      // produits, à la fin du niveau Exploitation » · RQP et TQP, servis par
      // `correspondance-compte-resultat-syscohada.ts`. Ils ont donc quitté XC
      // et XD, et la CAFG, qui part de XD, les avait PERDUS.
      //
      // Or leur contrepartie de bilan, le compte 463 « Associés, opérations
      // faites en commun » (ch. 33 § 3.2), continue d'être lue par la
      // variation des créances et des dettes (FD et FE, qui n'excluent pas le
      // 46). Le flux opérationnel d'un coparticipant était donc décalé du
      // montant de la quote-part, et ZH par les flux cessait d'égaler ZH par
      // le bilan · l'écart s'imprimait, mais la LIGNE CAFG, elle, était
      // fausse sans que rien ne la marque, et la note 34 la reprend sans
      // contrôle de bouclage à elle.
      //
      // Le remède était rédigé dans le dépôt depuis la mise en service des
      // deux postes (point 14 a) du commentaire d'en-tête de
      // `correspondance-compte-resultat-syscohada.ts`) et n'avait pas été
      // écrit. Ce sont ces deux termes.
      poste(1, 'COMPTE_RESULTAT', 'RQP', 'N', 'Quote-part de résultat sur opérations faites en commun, charges (652) · ch. 33 § 7.2.'),
      poste(1, 'COMPTE_RESULTAT', 'TQP', 'N', 'Quote-part de résultat sur opérations faites en commun, produits (752) · ch. 33 § 7.2.'),
      gestion(-1, ['654'], '« + Valeurs comptables des cessions courantes d\'immobilisation (compte 654) » · charge retirée de l\'EBE (RJ), donc + VNC ; la cession courante est un flux d\'investissement (FF/FG).'),
      gestion(-1, ['754'], '« – Produits des cessions courantes d\'immobilisation (compte 754) » · produit retiré de l\'EBE (TH) ; le prix encaissé est en FI.'),
      poste(1, 'COMPTE_RESULTAT', 'XF', 'N', 'Résultat financier · revenus financiers, gains de change, transferts de charges financières, frais financiers, pertes de change (TK, TM, RM).'),
      gestion(-1, ['797'], 'Reprises de provisions et dépréciations financières (TL) retirées de XF · sans encaissement.'),
      gestion(-1, ['697'], 'Dotations aux provisions et dépréciations financières (RN) retirées de XF · sans décaissement.'),
      poste(1, 'COMPTE_RESULTAT', 'TO', 'N', 'Autres produits HAO · « + Produits HAO + Transferts de charges HAO » (84 dont 848, 88).'),
      gestion(-1, ['86'], 'Reprises HAO retirées de TO · sans encaissement (Titre VII COMPTE 86 : reprises par débit de 15, 19, 29).'),
      poste(
        1,
        'COMPTE_RESULTAT',
        'RP',
        'N',
        'Autres charges HAO (83, 85) · [texte officiel] AUCUNE ligne « – Charges HAO » dans la formule énumérée du ' +
          "ch. 5 § 1.2.1.1 ni dans la maquette de la NOTE 34 ; terme fondé sur la définition générale « – Charges " +
          'décaissables restantes » du § 1.2.1, et sur le praticien (« − RP sauf 85 ») · anomalie n° 19.',
      ),
      gestion(-1, ['85'], 'Dotations HAO retirées de RP · sans décaissement (Titre VII COMPTE 85 : par crédit de 15, 19, 28, 29).'),
      poste(1, 'COMPTE_RESULTAT', 'RQ', 'N', '« – Participation » · participation des travailleurs (87), déjà négative dans la convention du compte de résultat.'),
      poste(1, 'COMPTE_RESULTAT', 'RS', 'N', '« – Impôt sur les résultats » (89), déjà négatif.'),
    ],
    note:
      "CAFG = EBE + 654 − 754 (= CAF d'exploitation) + revenus financiers + gains de change + transferts de charges " +
      'financières + produits HAO + transferts de charges HAO − frais financiers − pertes de change − participation − ' +
      "impôt (ch. 5 § 1.2.1.1). Les cessions HAO (81/82) n'y entrent pas : elles relèvent de FF à FJ. " +
      "[texte officiel] Cette formule énumérée, identique dans la NOTE 34, ne comporte AUCUNE ligne « – Charges HAO » " +
      'alors que sa définition générale retranche les « charges décaissables restantes » : le poste 83 est donc ' +
      'retranché ici (par RP, dont le 85 sans décaissement est retiré), écart assumé et signalé, anomalie n° 19.',
  },
  {
    ref: 'FB',
    libelle: 'Actif circulant HAO',
    section: 'OPERATIONNEL',
    signeModele: '-',
    signeAttendu: 'LIBRE',
    renvoi: '(1)',
    // « – Variation de l'actif circulant HAO (N − N-1) (1) » : BA net (485,
    // 488 moins 498), moins la créance sur cessions d'immobilisations 485
    // que le (1) renvoie à FI. Le net est voulu : la dotation 839 est restée
    // dans la CAFG (voir FA), la variation du 498 la neutralise ici.
    termes: [
      poste(-1, 'BILAN', 'BA', 'VARIATION', "Variation de l'actif circulant HAO, poste BA net · une hausse pèse en négatif (renvoi (a) du ch. 5).", 'NET'),
      variation(1, ['485'], 'DEBITEUR', "Créances sur cessions d'immobilisations retirées de BA · renvoi (1) : elles vont en FI."),
    ],
    nonDeterminables: [
      {
        comptes: ['4781', '4791'],
        motif: "Part HAO des écarts de conversion sur créances (le praticien cite 47818/47918, absents du plan semé) · non séparable à 4 chiffres, prise en FD (anomalie n° 6).",
      },
    ],
  },
  {
    ref: 'FC',
    libelle: 'Variation des stocks',
    section: 'OPERATIONNEL',
    signeModele: '-',
    signeAttendu: 'LIBRE',
    // « Achats de l'exercice = Achats consommés – Δ Stocks » (ch. 5
    // § 1.2.1.3) : la variation des stocks 603/73, restée dans l'EBE, est
    // annulée par la variation de BB. Net de 39 (dotation 6593 dans l'EBE).
    termes: [poste(-1, 'BILAN', 'BB', 'VARIATION', 'Variation des stocks et encours, poste BB net · renvoi (a) : « si les stocks augmentent, la variation est négative ».', 'NET')],
  },
  {
    ref: 'FD',
    libelle: 'Variation des créances',
    section: 'OPERATIONNEL',
    signeModele: '-',
    signeAttendu: 'LIBRE',
    // « – Variation des créances et emplois assimilés et des intérêts courus
    // des immobilisations financières (N − N-1) (a) et (1) ». BG = BH + BI +
    // BJ (nets). Sont retirés, par le (1), les créances qui ne sont pas
    // « rattachables à un compte de charge ou de produit retenu pour le
    // calcul de la CAFG » : 414 (cessions courantes → FI), 4493/4581 (fonds
    // de dotation → FK), 4494/4582 (subventions d'investissement → FL), 461
    // et 467 (apporteurs → FK), 4751 (transitoire, sans flux · anomalie
    // n° 14), 4713 (obligataires : le montant souscrit non encore libéré,
    // rattaché à l'émission d'emprunt lue en FO · anomalie n° 5).
    // 4495/4496 (subventions d'exploitation et d'équilibre à
    // recevoir) RESTENT : 71 et 88 sont dans la CAFG. Les écarts de
    // conversion neutralisent la réévaluation des créances en devises
    // (anomalie n° 6).
    termes: [
      poste(-1, 'BILAN', 'BG', 'VARIATION', 'Variation des créances et emplois assimilés, total BG net (BH + BI + BJ).', 'NET'),
      variation(1, ['414'], 'DEBITEUR', "Créances sur cessions courantes d'immobilisations · renvoi (1), lues en FI."),
      variation(1, ['4493', '458'], 'DEBITEUR', 'Fonds de dotation et subventions à recevoir (4493, 4581, 4582) · financement, lus en FK et FL.'),
      variation(1, ['4494'], 'DEBITEUR', "Subventions d'investissement à recevoir · exemple même du renvoi (1), lues en FL."),
      variation(1, ['461', '467'], 'DEBITEUR', '« variation des apporteurs sur le capital » et « restant dû sur capital appelé » (ch. 5 (1)) · lues en FK.'),
      variation(1, ['4751'], 'DEBITEUR', 'Compte transitoire actif de la révision SYSCOHADA · sans flux (Titre VII COMPTE 47).'),
      variation(
        1,
        ['4713'],
        'DEBITEUR',
        'Obligataires, souscrit non encore libéré · le 4713 débiteur loge en BJ (ch. 7) donc dans BG, et FO le ' +
          'retranche déjà du crédit 161 : sans ce retrait il serait compté deux fois. Renvoi (1) du § 1.2.1.3, ' +
          '« dettes et créances rattachées aux opérations de financement » · anomalie n° 5.',
      ),
      variation(-1, ['276'], 'DEBITEUR', "« intérêts courus des immobilisations financières » · le ch. 5 les range ici, hors AS (anomalie n° 4)."),
      variation(-1, ['4781'], 'DEBITEUR', "Écart de conversion actif, diminution des créances d'exploitation · réévaluation sans flux qui a réduit BG (anomalie n° 6)."),
      variation(1, ['4791'], 'CREDITEUR', "Écart de conversion passif, augmentation des créances d'exploitation · a gonflé BG sans flux."),
    ],
    nonDeterminables: [
      {
        comptes: ['4721'],
        motif:
          'Créance sur cession de titres de PLACEMENT (Titre VII COMPTE 47) · le titre de placement est de la ' +
          "trésorerie (BQ, compte 50) et non une immobilisation financière : la créance reste en FD, aucun poste " +
          "d'investissement ne la réclame. La créance sur cession d'immobilisation financière, elle, loge en 485 " +
          'et est lue par FI (anomalie n° 9).',
      },
    ],
  },
  {
    ref: 'FE',
    libelle: 'Variation du passif circulant',
    section: 'OPERATIONNEL',
    signeModele: '+',
    signeAttendu: 'LIBRE',
    renvoi: '(1)',
    // « + Variation du passif circulant et des intérêts des emprunts et
    // dettes financières courus (N − N-1) (b) et (1) ». DP = DH + DI + DJ +
    // DK + DM + DN. Retirés : 404 (acquisitions courantes d'immobilisations),
    // 481, 482 (fournisseurs d'investissements) → FF/FG/FH ; 461 (apporteurs,
    // dont 4615/4616/4619) → FK/FM ; 465 (dividendes à payer) → FN ; 4726
    // (titres de placement non libérés · anomalie n° 7) ; 4752 (transitoire).
    // 484, 4998, 499, 599 RESTENT : contreparties de 83x, 839, 659, 679
    // gardés dans la CAFG. 4497 « avances sur subventions » reste, faute
    // de pouvoir dire exploitation ou investissement (anomalie n° 17).
    termes: [
      poste(1, 'BILAN', 'DP', 'VARIATION', 'Variation du passif circulant, total DP · renvoi (b) : « si les dettes augmentent, la variation est positive ».'),
      variation(-1, ['404', '481', '482'], 'CREDITEUR', "Dettes sur acquisition d'immobilisations · renvoi (1), lues en FF, FG, FH."),
      variation(-1, ['461', '465'], 'CREDITEUR', 'Apporteurs (opérations sur le capital) et dividendes à payer · financement, lus en FK, FM, FN.'),
      variation(-1, ['4726'], 'CREDITEUR', '« versement restant à effectuer sur titre de placement non libérés » (ch. 5 (1)) · anomalie n° 7.'),
      variation(-1, ['4752'], 'CREDITEUR', 'Compte transitoire passif de la révision SYSCOHADA · sans flux (anomalie n° 14).'),
      variation(1, ['166', '176', '183'], 'CREDITEUR', '« intérêts des emprunts et dettes financières courus » · le ch. 5 les range ici, hors DA/DB (anomalie n° 4).'),
      variation(-1, ['4783'], 'DEBITEUR', "Écart de conversion actif, augmentation des dettes d'exploitation · a gonflé DP sans flux (anomalie n° 6)."),
      variation(1, ['4793'], 'CREDITEUR', "Écart de conversion passif, diminution des dettes d'exploitation · a réduit DP sans flux."),
    ],
  },
];

/**
 * FF à FJ · activités d'investissement (ch. 5 § 1.3). Les acquisitions
 * sont RECONSTITUÉES (variation du brut + valeur d'entrée cédée, anomalie
 * n° 3) puis ramenées au décaissé par la variation des dettes sur
 * immobilisations (renvoi (1) du § 1.3 : « Déduire du montant des
 * acquisitions de l'exercice la variation des dettes sur acquisitions
 * d'immobilisations »). Les cessions sont le prix (82, 754) moins la
 * variation des créances sur cessions (renvoi (2)).
 */
export const POSTES_INVESTISSEMENT_SYSCOHADA: PosteFluxTresorerieSyscohada[] = [
  {
    ref: 'FF',
    libelle: "Décaissements liés aux acquisitions d'immobilisations incorporelles",
    section: 'INVESTISSEMENT',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    termes: [
      poste(-1, 'BILAN', 'AD', 'VARIATION', 'Variation du BRUT des immobilisations incorporelles (211 à 219) · anomalie n° 3.', 'BRUT'),
      debit(-1, ['281'], 'Amortissements sortis à la cession (débit 281 par crédit 654/81) · avec la VNC ci-dessous, reconstitue la valeur d\'entrée cédée.'),
      gestion(1, ['6541', '811'], 'VNC des immobilisations incorporelles cédées (solde débiteur, donc négatif en convention gestion) · « + Valeur comptable nette des immobilisations cédées ».'),
      debit(-1, ['251'], 'Avances et acomptes versés dans l\'exercice sur immobilisations incorporelles · décaissés (Titre VII COMPTE 25).'),
      credit(1, ['251'], 'Avances imputées sur la facture définitive (débit 21x par crédit 251) · déjà décaissées, en N ou avant (anomalie n° 2).'),
      debit(-1, ['4041', '4046', '4811', '4821'], 'Règlements de dettes sur immobilisations incorporelles (fournisseurs d\'acquisitions courantes 404 et d\'investissements 481/482).'),
      credit(1, ['4041', '4046', '4811', '4821'], 'Acquisitions à crédit non encore réglées · « déduire la variation des dettes sur acquisitions » (§ 1.3 (1)).'),
    ],
    nonDeterminables: [
      {
        comptes: ['798', '862'],
        motif:
          "Reprises d'amortissements incluses dans le débit du 281 (Titre VII COMPTE 28 : « débité de la reprise des " +
          'amortissements par le crédit du 798 […] ou par le crédit du 862 ») · comptées ici en fausse acquisition, ' +
          "non séparables du débit de cession. Le 862 pèse doublement : FA le retire de TO, donc la reprise HAO n'est " +
          'nulle part dans la CAFG (anomalies n° 3 et 22).',
      },
      { comptes: ['4816', '4817', '4818'], motif: 'Réserve de propriété, retenues de garantie, factures non parvenues sur investissements · non subdivisées, prises en FG (anomalie n° 10).' },
    ],
  },
  {
    ref: 'FG',
    libelle: "Décaissements liés aux acquisitions d'immobilisations corporelles",
    section: 'INVESTISSEMENT',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    termes: [
      poste(-1, 'BILAN', 'AI', 'VARIATION', 'Variation du BRUT des immobilisations corporelles (22, 23, 24) · anomalie n° 3.', 'BRUT'),
      debit(-1, ['282', '283', '284'], 'Amortissements sortis à la cession · reconstitue avec la VNC la valeur d\'entrée cédée.'),
      gestion(1, ['6542', '812'], 'VNC des immobilisations corporelles cédées.'),
      debit(-1, ['252'], 'Avances et acomptes versés dans l\'exercice sur immobilisations corporelles.'),
      credit(1, ['252'], 'Avances imputées sur la facture définitive · déjà décaissées (anomalie n° 2).'),
      debit(-1, ['4042', '4047', '4812', '4816', '4817', '4818', '4822'], 'Règlements de dettes sur immobilisations corporelles · 4816 à 4818 pris ici en entier (anomalie n° 10).'),
      credit(1, ['4042', '4047', '4812', '4816', '4817', '4818', '4822'], 'Acquisitions à crédit non encore réglées (§ 1.3 (1)).'),
      credit(1, ['17'], '« acquisition » par contrat de location acquisition : « transaction sans effet de trésorerie » (§ 1.3 et § 1.4) · crédit 17 par débit 2x ; 176 exclu, ses intérêts courus sont en FE.', ['176']),
      credit(
        1,
        ['1984'],
        '« Coûts relatifs au démantèlement […] imputés aux immobilisations » (§ 1.3) · crédit 1984 par débit du ' +
          "composant 2x, sans flux (Titre VIII ch. 6) ; le praticien cite 19842, absent du plan semé. ATTENTION : le " +
          'même crédit 1984 porte aussi la désactualisation annuelle (6971 par 1984, sans débit de classe 2), non ' +
          'séparable · anomalie n° 20.',
      ),
      credit(
        1,
        ['106', '154'],
        "« Écart et provision spéciale de réévaluation de l'exercice de réévaluation » (§ 1.3 ; Titre VIII ch. 28 " +
          '§ 4.2.4.1 : 1061, ou 154 si la neutralité fiscale est imposée) · pris en entier ici (anomalie n° 11), et ' +
          "ne couvrant que la part « valeur nette comptable » de l'écart (anomalie n° 21).",
      ),
    ],
    nonDeterminables: [
      {
        comptes: ['798', '862'],
        motif:
          "Reprises d'amortissements incluses dans le débit de 282 à 284 (Titre VII COMPTE 28 : par le crédit du 798 " +
          'ou du 862) · fausses acquisitions, non séparables ; le 862 échappe en outre à la CAFG, FA le retirant de ' +
          'TO (anomalies n° 3 et 22).',
      },
      {
        comptes: ['1984'],
        motif:
          'Désactualisation annuelle de la provision pour démantèlement (Titre VIII ch. 6 : « le compte 6971 est ' +
          'débité par le crédit du compte 1984 »), incluse dans le crédit 1984 lu ci-dessus alors même que rien ' +
          "n'est débité en classe 2 · gonfle FG et creuse un écart de bouclage du même montant, non séparable du " +
          'coût de démantèlement imputé à l\'immobilisation (anomalie n° 20).',
      },
      {
        comptes: ['28'],
        motif:
          "Part « amortissements » de l'écart de réévaluation d'un bien amortissable (Titre VIII ch. 28 § 4.2.4.1 : " +
          'classe 2 débitée de la différence de valeur d\'entrée, 28 crédité de la différence de cumul, 1061 ou 154 ' +
          "de la seule différence de VNC) · comprise dans le Δ brut retiré ci-dessus mais absente du crédit 106/154, " +
          'donc en fausse acquisition ; le « + crédit 28 de réévaluation » qui la corrigerait est indissociable des ' +
          'dotations de l\'exercice (anomalie n° 21).',
      },
      { comptes: ['72'], motif: "Production immobilisée : le ch. 5 la range ici (« y compris les immobilisations produites par l'entité »), et l'EBE la contient déjà en +72 · l'aller-retour est exact, non isolable par poste." },
      { comptes: ['14'], motif: 'Immobilisation transférée gratuitement (débit 2x par crédit 14, Titre VII COMPTE 14) · gonfle FG et FL du même montant (anomalie n° 13).' },
    ],
  },
  {
    ref: 'FH',
    libelle: "Décaissements liés aux acquisitions d'immobilisations financières",
    section: 'INVESTISSEMENT',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    // Ici pas de variation de poste : le débit de 26/27 est l'acquisition
    // (titres, prêts, dépôts et cautionnements versés, Titre VII COMPTE 27
    // « débité de la valeur d'apport ou d'acquisition des titres, du montant
    // des prêts accordés… par le crédit des comptes de tiers et de
    // trésorerie et par le crédit du 4813 »).
    termes: [
      debit(-1, ['26', '27'], 'Acquisitions de titres de participation, prêts, dépôts et cautionnements · 276 exclu (intérêts courus, en FD · anomalie n° 4).', ['276']),
      debit(-1, ['4813'], 'Versements effectués sur titres non libérés (Titre VII COMPTE 27 et 48).'),
      credit(1, ['4813'], 'Part non libérée à l\'acquisition (débit 26/274 par crédit 4813) · pas encore décaissée.'),
      variation(
        1,
        ['4792'],
        'CREDITEUR',
        'Écart de conversion passif, augmentation des créances financières · débit 27 sans flux.' +
          " Lu en VARIATION dans un poste bâti sur des MOUVEMENTS : exact si l'ajustement de clôture n'est pas " +
          'contre-passé à la réouverture, hypothèse écrite faute de source (anomalie n° 6).',
      ),
    ],
    nonDeterminables: [
      {
        comptes: ['106', '154'],
        motif:
          'Part de la réévaluation relative aux immobilisations financières · prise en entier en FG (anomalie ' +
          "n° 11), alors que le débit de 26/27 qu'elle porte est lu ici en fausse acquisition : ZC est juste, la " +
          'répartition FG/FH ne l\'est pas. Titre VIII ch. 28 § 1.2 : « la réévaluation doit porter sur ' +
          "l'ensemble des immobilisations corporelles et financières ».",
      },
      { comptes: ['2714'], motif: 'Titres prêtés (plan semé) ou créances de location financement (Titre VII) · sans flux à l\'entrée, non isolables par numéro (anomalie n° 8).' },
    ],
  },
  {
    ref: 'FI',
    libelle: "Encaissements liés aux cessions d'immobilisations incorporelles et corporelles",
    section: 'INVESTISSEMENT',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    // § 1.3 (2) : « prix de cession des immobilisations – variation des
    // créances sur cessions d'immobilisations (N − N-1) ». Le prix est le
    // 82 (HAO) ET le 754 (courant, retiré de la CAFG en FA) ; la créance
    // est 485 (HAO) et 414 (courante). Le praticien, une fois son signe
    // corrigé (20/08/2026), dit la même chose en mouvements.
    termes: [
      gestion(1, ['754', '821', '822'], "Prix de cession (Titre VII COMPTE 82 : « produit net de la cession ») · 754 pour les cessions courantes, 821/822 pour les HAO."),
      variation(-1, ['414', '485'], 'DEBITEUR', 'Variation des créances sur cessions courantes (414) et HAO (485) · une cession à crédit non encaissée est retranchée.'),
    ],
  },
  {
    ref: 'FJ',
    libelle: "Encaissements liés aux cessions d'immobilisations financières",
    section: 'INVESTISSEMENT',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    termes: [
      credit(1, ['26', '27'], '« cession et remboursement des immobilisations financières » (§ 1.3) · crédit de 26/27 : remboursement de prêt, restitution de dépôt, ou valeur d\'entrée cédée ; 276 exclu (anomalie n° 4).', ['276']),
      gestion(1, ['826', '816'], "Prix (826) et VNC (816, négative) des cessions de titres passées par 81/82 · avec le crédit de 26/27 ci-dessus, la somme vaut le prix (anomalie n° 12)."),
      variation(
        -1,
        ['4782'],
        'DEBITEUR',
        'Écart de conversion actif, diminution des créances financières · crédit 27 sans flux.' +
          " Lu en VARIATION dans un poste bâti sur des MOUVEMENTS : exact si l'ajustement de clôture n'est pas " +
          'contre-passé à la réouverture, hypothèse écrite faute de source (anomalie n° 6).',
      ),
    ],
    nonDeterminables: [
      {
        comptes: ['485'],
        motif:
          "Cession d'immobilisation financière à crédit : Titre VII COMPTE 82 crédite le 82 « par le débit du compte " +
          'de tiers 485 » SANS restriction de nature, et le COMPTE 48 fait du 485 le compte générique des créances ' +
          "sur cessions · la créance est donc lue par la variation 414/485 de FI, alors que le prix (826) et la VNC " +
          '(816) de la même cession sont lus ici. Répartition FI/FJ faussée du montant non recouvré à la clôture, ' +
          'ZC intact (anomalie n° 9).',
      },
      { comptes: ['2714'], motif: 'Titres prêtés restitués (ou créances de location financement remboursées) · anomalie n° 8.' },
    ],
  },
];

/**
 * FK à FN · financement par les capitaux propres (ch. 5 § 1.4) : « entrées
 * de trésorerie provenant des augmentations de capital en numéraire »,
 * « des subventions d'investissement », « sorties liées aux distributions
 * de dividendes » ; hors tableau : « conversion de dettes en capitaux
 * propres », « augmentation du capital par incorporation de réserves ».
 */
export const POSTES_CAPITAUX_PROPRES_SYSCOHADA: PosteFluxTresorerieSyscohada[] = [
  {
    ref: 'FK',
    libelle: 'Augmentations de capital par apports nouveaux',
    section: 'CAPITAUX_PROPRES',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    // Variation du capital et des primes, moins ce qui n'est pas encore
    // versé (109, apporteurs débiteurs, 467), plus ce qui l'est d'avance
    // (4615, 4616), moins les mouvements qui augmentent le capital sans
    // apport (incorporation de 11, 12, 13, 106) · les neutralisations
    // d'affectation du résultat (débit 130/131 contre crédit 11/12/465/103,
    // débit 11/12 contre crédit 130/139) se compensent deux à deux · à
    // condition de lire le CRÉDIT du 130 en entier, 1301 compris : sans lui,
    // le bénéfice viré au compte d'instance sortait deux fois et ne rentrait
    // qu'une, et FK ressortait à −(bénéfice N-1) (anomalie n° 23).
    // Le choix « 130, 131 » plutôt que « 13 » en bloc n'offre AUCUNE
    // protection contre l'écriture de clôture, contrairement à ce qu'affirmait
    // une version antérieure : le Titre VII COMPTE 13 dit que le compte est
    // « débité, à la clôture de l'exercice, du montant des charges de
    // l'exercice, par le crédit des comptes de la classe 6 », et ce débit-là
    // porte sur le 131. La vraie garde est double, et elle est ailleurs :
    // `EcritureService.balance` range les écritures générées par la clôture
    // dans `report*` et jamais dans `mouvement*` (que ces termes lisent), et
    // le service travaille de toute façon sur une balance AVANT clôture, que
    // le compte de résultat exige lui aussi. Ce que le choix « 130, 131 »
    // apporte réellement : il laisse dehors les soldes intermédiaires de
    // gestion 132 à 138, qui ne sont que des étapes de calcul.
    termes: [
      variation(1, ['101', '102', '105'], 'CREDITEUR', 'Variation du capital (social, par dotation) et des primes liées au capital (Titre VII COMPTE 101, 102, 105).'),
      variation(-1, ['109'], 'DEBITEUR', 'Capital souscrit non appelé · créance de la société, pas un encaissement (COMPTE 109).'),
      variation(-1, ['461', '467'], 'DEBITEUR', 'Apporteurs débiteurs (4611 à 4614, 4617, 4618) et restant dû sur capital appelé (467) · souscrit, non versé (ch. 5 (1) ; anomalie n° 16).'),
      variation(1, ['4615', '4616'], 'CREDITEUR', 'Versements reçus ou anticipés sur augmentation de capital · encaissés avant l\'écriture de capital (COMPTE 46 ; anomalie n° 16).'),
      variation(-1, ['4493', '4581'], 'DEBITEUR', 'Fonds de dotation à recevoir (État 4493, organismes internationaux 4581) · la dotation 102 non encore encaissée (COMPTE 102).'),
      debit(-1, ['11', '12', '130', '131'], 'Incorporation de réserves, de report à nouveau ou de résultat au capital (COMPTE 101 : « par le débit du 11, 12, 13 ») et affectation du résultat · sans apport.'),
      debit(-1, ['106'], "Incorporation directe de l'écart de réévaluation au capital (COMPTE 106) · sans apport (anomalie n° 16)."),
      credit(
        1,
        ['11', '12', '130', '139'],
        'Contreparties des affectations et absorptions de pertes (COMPTE 11, 12, 13) · se compensent avec les ' +
          'débits ci-dessus. Le 130 est lu EN ENTIER, symétriquement à son débit : le 1301 (bénéfice en instance) ' +
          "était orphelin et faisait ressortir FK à −(bénéfice N-1) dès qu'un dossier utilisait le compte spécial " +
          'de réouverture (anomalie n° 23) ; le 1309 y est désormais compris, sans doublon.',
      ),
      credit(1, ['465'], "Dividendes mis en paiement par débit du résultat, des réserves ou du report (COMPTE 46) · neutralise l'affectation ; le versement est en FN."),
      credit(1, ['4619'], 'Capital à rembourser (débit 101 par crédit 4619) · neutralise la baisse du capital ; le remboursement est en FM.'),
      credit(1, ['103', '104'], "Entité individuelle : apports définitifs (103) et temporaires (104) de l'exploitant (COMPTE 103, 104)."),
    ],
    nonDeterminables: [
      { comptes: ['4611', '4614', '1052', '1053', '1054'], motif: 'Apports en nature, fusion, conversion de dettes · sans trésorerie, gonflent FK et FG ou FQ du même montant (anomalie n° 13).' },
      {
        comptes: ['103', '139'],
        motif:
          "Entité individuelle · virement du solde du 104 au 103 à la clôture, et affectation d'une PERTE (Titre VII " +
          "COMPTE 103 : « débité, à l'ouverture de l'exercice, du montant de l'affectation du résultat […] par le " +
          'crédit du 139 ») · le crédit 139 entre ici en faux apport et le débit 103 en faux prélèvement dans FM. ' +
          'ZD reste juste, la répartition FK/FM non (anomalie n° 13).',
      },
    ],
  },
  {
    ref: 'FL',
    libelle: "Subventions d'investissement reçues",
    section: 'CAPITAUX_PROPRES',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    termes: [
      variation(1, ['14'], 'CREDITEUR', "Variation des subventions d'investissement (Titre VII COMPTE 14)."),
      gestion(1, ['799'], 'Quote-part reprise au résultat (débit 14 par crédit 799) · a réduit le 14 sans flux ; produit hors CAFG (TJ), rajouté ici.'),
      variation(-1, ['4494', '4582'], 'DEBITEUR', "Subventions d'investissement à recevoir (État, organismes internationaux · COMPTE 14 : « par le débit du 4494 ou 4582 ») · accordées, non encaissées."),
    ],
    nonDeterminables: [
      { comptes: ['14'], motif: 'Subvention reçue en nature (immobilisation transférée gratuitement) · gonfle FL et FG (anomalie n° 13).' },
      { comptes: ['4497'], motif: "Avances sur subventions : exploitation ou investissement indécidable par numéro · laissées en FE (anomalie n° 17)." },
    ],
  },
  {
    ref: 'FM',
    libelle: 'Prélèvements sur le capital',
    section: 'CAPITAUX_PROPRES',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    termes: [
      debit(-1, ['4619'], 'Remboursement effectif du capital à rembourser (COMPTE 46, COMPTE 101 : « remboursement d\'une partie du capital »).'),
      debit(-1, ['103', '104'], "Entité individuelle : retraits de l'exploitant (COMPTE 104 : « débité des retraits de fonds ou prélèvements »)."),
    ],
    nonDeterminables: [
      { comptes: ['104'], motif: 'Prélèvements en nature (1047) et solde de clôture 104/103 · sans flux, non séparables (anomalie n° 13).' },
      {
        comptes: ['103'],
        motif:
          "Affectation d'une PERTE dans une entité individuelle (Titre VII COMPTE 103 : « débité, à l'ouverture de " +
          "l'exercice, du montant de l'affectation du résultat de l'exercice précédent, par le crédit du 139 ») · " +
          'faux prélèvement ici, faux apport en FK par le crédit 139, ZD juste. Le retirer du terme ci-dessus ' +
          'casserait le virement de clôture 104 → 103, dont le crédit 104 est lu par FK (anomalie n° 13).',
      },
    ],
  },
  {
    ref: 'FN',
    libelle: 'Dividendes versés',
    section: 'CAPITAUX_PROPRES',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    termes: [debit(-1, ['465'], 'Dividendes réglés (COMPTE 46 : « débité des sommes réglées au titre des dividendes ») · la retenue à la source ressort en FE via 44.')],
  },
];

/**
 * FO à FQ · financement par les capitaux étrangers (ch. 5 § 1.4) : « entrées
 * provenant de nouveaux emprunts », « sorties liées aux remboursements
 * d'emprunts » et « au remboursement de la dette de location-acquisition ».
 */
export const POSTES_CAPITAUX_ETRANGERS_SYSCOHADA: PosteFluxTresorerieSyscohada[] = [
  {
    ref: 'FO',
    libelle: 'Emprunts',
    section: 'CAPITAUX_ETRANGERS',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    termes: [
      credit(1, ['161', '162'], 'Emprunts obligataires et auprès des établissements de crédit contractés (Titre VII COMPTE 16 : « crédité du montant net des emprunts par le débit des comptes de trésorerie »).'),
      variation(-1, ['4713'], 'DEBITEUR', 'Obligataires : émis mais non encore libéré (Titre VIII ch. 20, 47131/47132) · anomalie n° 5.'),
      variation(
        -1,
        ['4784'],
        'DEBITEUR',
        'Écart de conversion actif, augmentation des dettes financières · crédit 16 sans flux ; pris en entier ici.' +
          " Lu en VARIATION dans un poste bâti sur des MOUVEMENTS : exact si l'ajustement de clôture n'est pas " +
          'contre-passé à la réouverture, hypothèse écrite faute de source (anomalie n° 6).',
      ),
    ],
    nonDeterminables: [{ comptes: ['1612', '1613'], motif: 'Obligations converties ou remboursées en actions · sans trésorerie, gonflent FQ et FK (anomalie n° 13).' }],
  },
  {
    ref: 'FP',
    libelle: 'Autres dettes financières',
    section: 'CAPITAUX_ETRANGERS',
    signeModele: '+',
    signeAttendu: 'POSITIF',
    termes: [
      credit(
        1,
        ['163', '164', '165', '167', '168', '181', '182'],
        "Avances de l'État, comptes courants bloqués, dépôts et cautionnements reçus, avances conditionnées, autres " +
          'emprunts, dettes liées à des participations (COMPTE 16, 18) · 166 et 183 exclus (anomalie n° 4). Le 1685 ' +
          "(participation des travailleurs bloquée, subdivision du 168 au COMPTE 16) est bien lu : son crédit n'est " +
          'pas un encaissement, mais il neutralise la charge 87 que RQ laisse dans la CAFG · ZH juste, répartition ' +
          'ZB/ZE faussée du même montant.',
      ),
    ],
    note:
      'Le crédit du 1685 (participation des travailleurs bloquée, Titre VII COMPTE 16) entre dans ce poste sans être ' +
      "un encaissement : il ne s'y trouve que pour neutraliser la charge 87 laissée dans la CAFG par RQ. L'exclure " +
      'ferait sortir la participation du tableau et fausserait ZH ; le garder ne fausse que la répartition ZB/ZE, ' +
      'dite ici plutôt que masquée.',
    nonDeterminables: [
      { comptes: ['4784'], motif: 'Part de l\'écart de conversion relative à ces dettes · prise en entier en FO (anomalie n° 6).' },
      { comptes: ['184'], motif: 'Comptes permanents bloqués des établissements · liaison interne (COMPTE 18), non rattaché (anomalie n° 17).' },
    ],
  },
  {
    ref: 'FQ',
    libelle: 'Remboursements des emprunts et autres dettes financières',
    section: 'CAPITAUX_ETRANGERS',
    signeModele: '-',
    signeAttendu: 'NEGATIF',
    termes: [
      debit(-1, ['16', '17', '181', '182'], 'Principal remboursé (COMPTE 16 : « débité, à la date d\'échéance, du montant du principal remboursé ») et « remboursement de la dette de location-acquisition » (§ 1.4, COMPTE 17 : débit 17 par crédit 623) · 166, 176 exclus (anomalie n° 4).', ['166', '176']),
      variation(
        1,
        ['4794'],
        'CREDITEUR',
        'Écart de conversion passif, diminution des dettes financières · débit 16 sans flux.' +
          " Lu en VARIATION dans un poste bâti sur des MOUVEMENTS : exact si l'ajustement de clôture n'est pas " +
          'contre-passé à la réouverture, hypothèse écrite faute de source (anomalie n° 6).',
      ),
    ],
  },
];

export const TOUS_LES_POSTES_FLUX_SYSCOHADA: PosteFluxTresorerieSyscohada[] = [
  POSTE_TRESORERIE_OUVERTURE_SYSCOHADA,
  ...POSTES_OPERATIONNELS_SYSCOHADA,
  ...POSTES_INVESTISSEMENT_SYSCOHADA,
  ...POSTES_CAPITAUX_PROPRES_SYSCOHADA,
  ...POSTES_CAPITAUX_ETRANGERS_SYSCOHADA,
];

/** Sous-totaux et totaux du modèle · toutes des SOMMES de refs antérieures. */
export interface TotalFluxTresorerieSyscohada {
  ref: string;
  libelle: string;
  /** Clé A à H de la colonne de droite du modèle. */
  cle?: string;
  deRefs: string[];
}

/**
 * Formules du modèle (ch. 5 section 2), lettres comprises · anomalie n° 1 :
 * c'est le modèle et non le schéma de la section 1 qui fait foi. L'ORDRE
 * compte : chaque total ne lit que des refs déjà résolues (spec dédié).
 */
export const TOTAUX_FLUX_SYSCOHADA: TotalFluxTresorerieSyscohada[] = [
  // Ligne intercalée par le modèle SANS code REF (« Variation du BF lié aux
  // activités opérationnelles (FB+FC+FD+FE) : … ») · reproduite telle
  // quelle, pas affublée d'un code que le texte ne donne pas.
  { ref: '', libelle: 'Variation du BF lié aux activités opérationnelles (FB+FC+FD+FE)', deRefs: ['FB', 'FC', 'FD', 'FE'] },
  { ref: 'ZB', libelle: 'Flux de trésorerie provenant des activités opérationnelles (somme FA à FE)', cle: 'B', deRefs: ['FA', 'FB', 'FC', 'FD', 'FE'] },
  { ref: 'ZC', libelle: "Flux de trésorerie provenant des activités d'investissement (somme FF à FJ)", cle: 'C', deRefs: ['FF', 'FG', 'FH', 'FI', 'FJ'] },
  { ref: 'ZD', libelle: 'Flux de trésorerie provenant des capitaux propres (somme FK à FN)', cle: 'D', deRefs: ['FK', 'FL', 'FM', 'FN'] },
  { ref: 'ZE', libelle: 'Flux de trésorerie provenant des capitaux étrangers (somme FO à FQ)', cle: 'E', deRefs: ['FO', 'FP', 'FQ'] },
  { ref: 'ZF', libelle: 'Flux de trésorerie provenant des activités de financement (D + E)', cle: 'F', deRefs: ['ZD', 'ZE'] },
  { ref: 'ZG', libelle: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE (B + C + F)', cle: 'G', deRefs: ['ZB', 'ZC', 'ZF'] },
  { ref: 'ZH', libelle: 'Trésorerie nette au 31 Décembre (G + A)', cle: 'H', deRefs: ['ZG', 'ZA'] },
];

/**
 * Les DEUX contrôles de bouclage, calculés indépendamment par le service et
 * présentés avec leur écart :
 *  - par les flux · ZH = ZA + ZB + ZC + ZF (c'est ZG + ZA développé) ;
 *  - par le bilan · « Contrôle : Trésorerie actif N – Trésorerie passif N »,
 *    soit BT − DT du bilan de l'exercice, tel que le service du bilan le
 *    calcule (52/53 créditeurs déjà transférés en DR).
 */
export const CONTROLE_ZH_PAR_LES_FLUX: string[] = ['ZA', 'ZB', 'ZC', 'ZF'];
export const CONTROLE_ZH_PAR_LE_BILAN: TermeFluxTresorerie[] = [
  poste(1, 'BILAN', 'BT', 'N', 'Trésorerie actif N · total BT du bilan.', 'NET'),
  poste(-1, 'BILAN', 'DT', 'N', 'Trésorerie passif N · total DT du bilan.'),
];

/**
 * Ordre d'affichage officiel, en-têtes de rubrique compris · le modèle
 * intercale des intitulés en italique entre les postes chiffrés.
 */
export const ORDRE_AFFICHAGE_FLUX_SYSCOHADA: Array<{ ref: string } | { section: string }> = [
  { ref: 'ZA' },
  { section: 'Flux de trésorerie provenant des activités opérationnelles' },
  ...POSTES_OPERATIONNELS_SYSCOHADA.map((p) => ({ ref: p.ref })),
  { ref: '' }, // « Variation du BF lié aux activités opérationnelles (FB+FC+FD+FE) »
  { ref: 'ZB' },
  { section: "Flux de trésorerie provenant des activités d'investissements" },
  ...POSTES_INVESTISSEMENT_SYSCOHADA.map((p) => ({ ref: p.ref })),
  { ref: 'ZC' },
  { section: 'Flux de trésorerie provenant du financement par les capitaux propres' },
  ...POSTES_CAPITAUX_PROPRES_SYSCOHADA.map((p) => ({ ref: p.ref })),
  { ref: 'ZD' },
  { section: 'Trésorerie provenant du financement par les capitaux étrangers' },
  ...POSTES_CAPITAUX_ETRANGERS_SYSCOHADA.map((p) => ({ ref: p.ref })),
  { ref: 'ZE' },
  { ref: 'ZF' },
  { ref: 'ZG' },
  { ref: 'ZH' },
];

export function trouvePosteFluxSyscohada(ref: string): PosteFluxTresorerieSyscohada | undefined {
  return TOUS_LES_POSTES_FLUX_SYSCOHADA.find((p) => p.ref === ref);
}
export function trouveTotalFluxSyscohada(ref: string): TotalFluxTresorerieSyscohada | undefined {
  return TOTAUX_FLUX_SYSCOHADA.find((t) => t.ref === ref);
}

/**
 * Ce qu'un poste exige de la balance, pour que le service laisse VIDE et
 * signale ce qu'il ne peut pas lire, plutôt que d'approximer :
 *  - `exerciceN1` · un poste de bilan lu sur N-1 ou en variation : sans
 *    exercice antérieur, aucun équivalent (voir `LectureCompte`) ;
 *  - `soldesAnterieurs` · une variation de solde de compte : lisible dans
 *    N-1 ou dans le report à-nouveau de N ;
 *  - `mouvements` · des mouvements de l'exercice : `LigneBalancePourEtat`
 *    les porte toujours (mouvementDebit/mouvementCredit).
 */
export function besoinsDuPoste(p: PosteFluxTresorerieSyscohada): { exerciceN1: boolean; soldesAnterieurs: boolean; mouvements: boolean } {
  return {
    exerciceN1: p.termes.some((t) => t.poste && t.poste.etat === 'BILAN' && t.poste.lecture !== 'N'),
    soldesAnterieurs: p.termes.some((t) => t.comptes?.lecture === 'VARIATION_SOLDE'),
    mouvements: p.termes.some((t) => t.comptes?.lecture === 'MOUVEMENT_DEBIT' || t.comptes?.lecture === 'MOUVEMENT_CREDIT'),
  };
}

/**
 * Le montant d'un poste est-il du signe que le modèle attend ? Un poste
 * LIBRE l'est toujours. Un FF positif (des acquisitions négatives) ou un
 * FK négatif est une anomalie à remonter, jamais une erreur de calcul à
 * redresser · même règle que `signeConformeAuModele` du compte de résultat.
 */
export function signeConformeAuModeleFlux(p: PosteFluxTresorerieSyscohada, montant: number): boolean {
  if (p.signeAttendu === 'LIBRE' || Math.abs(montant) < 0.005) return true;
  return p.signeAttendu === 'POSITIF' ? montant > 0 : montant < 0;
}

/** Tous les préfixes de comptes cités par les termes et les non-déterminables · pour le spec d'existence au plan. */
export function comptesCitesParLeTftSyscohada(): { ref: string; prefixe: string }[] {
  const cites: { ref: string; prefixe: string }[] = [];
  for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
    for (const t of p.termes) {
      for (const prefixe of t.comptes?.prefixes ?? []) cites.push({ ref: p.ref, prefixe });
      for (const prefixe of t.comptes?.exclusions ?? []) cites.push({ ref: p.ref, prefixe });
    }
    for (const nd of p.nonDeterminables ?? []) for (const prefixe of nd.comptes) cites.push({ ref: p.ref, prefixe });
  }
  return cites;
}

/**
 * Comptes de bilan dont le mouvement est SANS TRÉSORERIE par construction et
 * que le tableau ne lit jamais en mouvement ni en variation : ils
 * n'expliquent aucun écart de bouclage, et les afficher à côté d'un écart nul
 * apprendrait au lecteur à ignorer le bloc `comptesNonVentiles`. Chacun
 * est couvert autrement : à travers le NET d'un poste de bilan (28, 29, 39,
 * 49, 59 dans AD/AI/BA/BB/BG), ou parce que sa contrepartie de gestion est
 * hors CAFG (681, 691, 697, 791, 797, 85, 86 pour 15, 19, 28, 29), ou parce
 * que le résultat n'est pas un flux (132 à 138, soldés à la clôture).
 */
export const COMPTES_SANS_TRESORERIE_SYSCOHADA: { prefixe: string; motif: string }[] = [
  { prefixe: '29', motif: 'Dépréciations des immobilisations · contrepartie de 691/697/85 et 791/797/86, tous hors CAFG.' },
  { prefixe: '39', motif: 'Dépréciations des stocks · contrepartie de 6593/7593 gardés dans la CAFG, neutralisée par le NET de BB (FC).' },
  { prefixe: '49', motif: 'Dépréciations et provisions à court terme sur tiers · neutralisées par le NET de BA/BG et par DN (FB, FD, FE).' },
  { prefixe: '59', motif: 'Dépréciations et provisions à court terme sur trésorerie · dans le net de BT et en DN.' },
  { prefixe: '151', motif: 'Amortissements dérogatoires · dotation 851 et reprise 861, retirées de la CAFG.' },
  { prefixe: '152', motif: 'Plus-values de cession à réinvestir · provision réglementée, 851/861 hors CAFG.' },
  { prefixe: '153', motif: 'Fonds réglementés · 851/861 hors CAFG.' },
  { prefixe: '155', motif: 'Provisions réglementées relatives aux immobilisations · 851/861 hors CAFG.' },
  { prefixe: '156', motif: 'Provisions réglementées relatives aux stocks · 851/861 hors CAFG.' },
  { prefixe: '157', motif: 'Provisions pour investissement · 851/861 hors CAFG.' },
  { prefixe: '158', motif: 'Autres provisions et fonds réglementés · 851/861 hors CAFG.' },
  { prefixe: '191', motif: "Provisions pour risques et charges · 691/697/85 et 791/797/86, hors CAFG (seul le 1984 est lu, en FG, et pour sa seule part imputée aux immobilisations · anomalie n° 20)." },
  { prefixe: '192', motif: 'Idem 191.' },
  { prefixe: '193', motif: 'Idem 191.' },
  { prefixe: '194', motif: 'Idem 191.' },
  { prefixe: '195', motif: 'Idem 191.' },
  { prefixe: '1961', motif: 'Idem 191 · 1962 (actif du régime de retraite) est à part, voir COMPTES_TFT_NON_VENTILES_JUSTIFIES.' },
  { prefixe: '197', motif: 'Idem 191.' },
  { prefixe: '1981', motif: 'Idem 191.' },
  { prefixe: '1983', motif: 'Idem 191.' },
  { prefixe: '1985', motif: 'Idem 191.' },
  { prefixe: '1988', motif: 'Idem 191.' },
  { prefixe: '132', motif: 'Soldes intermédiaires de gestion (Titre VII COMPTE 13) · étapes de calcul, soldées entre elles.' },
  { prefixe: '133', motif: 'Idem 132.' },
  { prefixe: '134', motif: 'Idem 132.' },
  { prefixe: '135', motif: 'Idem 132.' },
  { prefixe: '136', motif: 'Idem 132.' },
  { prefixe: '137', motif: 'Idem 132.' },
  { prefixe: '138', motif: 'Idem 132 · résultat HAO, fusion, scission, liquidation.' },
];

/**
 * Comptes qu'AUCUN poste ne lit, et pour lesquels c'est VOULU · chacun
 * renvoie à une anomalie de l'en-tête. Le service ne les masque jamais :
 * mouvementés, ils remontent en `comptesNonVentiles` à côté de l'écart de
 * bouclage qu'ils expliquent. Le spec vérifie que chaque préfixe existe au
 * plan et qu'aucun terme ne le lit.
 */
export const COMPTES_TFT_NON_VENTILES_JUSTIFIES: { prefixe: string; anomalie: number; motif: string }[] = [
  { prefixe: '1962', anomalie: 17, motif: "Actif du régime de retraite · prime versée à l'assureur (Titre VII COMPTE 19), décaissement réel qu'aucune ligne du ch. 5 ne nomme : ressort en écart de bouclage." },
  { prefixe: '184', anomalie: 17, motif: 'Comptes permanents bloqués des établissements et succursales · liaison interne (Titre VII COMPTE 18).' },
  { prefixe: '186', anomalie: 17, motif: 'Comptes de liaison charges · neutralisés dans la comptabilité fusionnée.' },
  { prefixe: '187', anomalie: 17, motif: 'Comptes de liaison produits · idem.' },
  { prefixe: '188', anomalie: 17, motif: 'Comptes de liaison des sociétés en participation · aucun poste.' },
  { prefixe: '4786', anomalie: 24, motif: "Différences d'évaluation sur instruments de trésorerie, ACTIF · contrepartie du 54 (Titre VII COMPTE 47), qui est dans BS donc dans BT : le ch. 7 range le 478 en BU, hors de tout total que le tableau lit." },
  { prefixe: '4788', anomalie: 24, motif: 'Différences compensées par couverture de change, ACTIF · contrepartie de la créance ou dette couverte (BG/DP), mais rangée en BU par le ch. 7 : aucun poste ne la lit.' },
  { prefixe: '4797', anomalie: 24, motif: "Différences d'évaluation sur instruments de trésorerie, PASSIF · symétrique du 4786, rangée en DV, hors de DP." },
  { prefixe: '4798', anomalie: 24, motif: 'Différences compensées par couverture de change, PASSIF · symétrique du 4788, rangée en DV, hors de DP.' },
  { prefixe: '585', anomalie: 17, motif: 'Virements de fonds · à solder à la clôture (COMPTE 58) ; un résidu fausse BT.' },
  { prefixe: '588', anomalie: 17, motif: 'Autres virements internes · idem.' },
];

/**
 * Comptes RETIRÉS de FD ou FE (par le renvoi (1) ou par leur nature) sans
 * être repris par aucun autre poste · à la différence des retraits vers
 * FF-FQ (414, 404, 461…), leur variation ne réapparaît nulle part. 4751 et
 * 4752 sont sans flux par construction (ajustement de la révision) ; 4726
 * est le cas de l'anomalie n° 7 : sa variation est exactement l'écart entre
 * ZH par les flux et ZH par le bilan. Le service les nomme à côté de
 * l'écart, comme les non-ventilés.
 */
export const COMPTES_EXCLUS_SANS_REPRISE: { prefixe: string; anomalie: number; motif: string }[] = [
  { prefixe: '4726', anomalie: 7, motif: 'Versements restant à effectuer sur titres de placement non libérés · exclu de FE par le (1), compté dans BT par le contrôle : un solde non nul est un écart de bouclage du même montant.' },
  { prefixe: '4751', anomalie: 14, motif: 'Compte transitoire actif de la révision SYSCOHADA · sans flux, retiré de FD.' },
  { prefixe: '4752', anomalie: 14, motif: 'Compte transitoire passif de la révision SYSCOHADA · sans flux, retiré de FE.' },
];
