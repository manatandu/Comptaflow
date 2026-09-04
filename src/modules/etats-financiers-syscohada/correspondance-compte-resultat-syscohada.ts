/**
 * COMPTE DE RÉSULTAT SYSCOHADA révisé · Système normal. Tableau officiel de
 * correspondance « poste → comptes », formules des NEUF lignes de soldes
 * X* du modèle (XA à XI · huit soldes de gestion, chacun reçu par un
 * sous-compte du 13, plus XB chiffre d'affaires qui est un agrégat de
 * ventes sans sous-compte 13) et renvois aux notes annexes.
 *
 * Sources, toutes lues avant d'écrire, aucune ligne de mémoire :
 *  - AUDCIF, Titre IX, chapitre 4, section 2 (modèle du compte de résultat :
 *    codes REF, LIBELLÉS (casse comprise), colonne SIGNE, colonne NOTE,
 *    formules des soldes, « Logique de signe ») · skill
 *    `audcif-acte-uniforme`, `references/titre-9-ch1-5-bilan-resultat-flux.md`,
 *    lignes 442 à 500 (tableau lignes 449 à 492, logique de signe ligne 494).
 *    C'est la source des LIBELLÉS : le ch. 4 est le modèle déposé, le ch. 7
 *    n'en est que la table de correspondance (anomalie n° 9 pour les deux
 *    endroits où ils diffèrent) ;
 *  - AUDCIF, Titre IX, chapitre 7 (« Numéro de comptes à incorporer dans les
 *    postes », section « COMPTE DE RÉSULTAT » et ses « Clés de lecture ») ·
 *    même skill, `references/titre-9-ch6-7-notes-annexes-correspondance.md`,
 *    lignes 853 à 915 (fin du fichier). C'est la source primaire qui
 *    tranche tout désaccord de RATTACHEMENT ;
 *  - AUDCIF, Titre VII, COMPTE 13 (subdivisions 131 à 139 : le compte de
 *    bilan qui reçoit chaque solde intermédiaire), COMPTE 603, COMPTE 73
 *    (sens du solde de la production stockée), COMPTE 78, COMPTE 79
 *    (subdivisions éclatées entre plusieurs postes), COMPTE 87
 *    (subdivisions, anomalie n° 10) · `references/titre-7-comptes-classe-1.md`,
 *    `-classe-6.md`, `-classe-7.md`, `-classe-8.md` ;
 *  - AUDCIF, Titre IX, chapitre 6, lu DIRECTEMENT dans le même fichier
 *    `titre-9-ch6-7-notes-annexes-correspondance.md`, lignes 12 à 763 :
 *    en-têtes `#### NOTE N` (les 36 notes, numérotation 3A à 3F, 15A/15B,
 *    16A à 16C, 27A/27B · `CODES_NOTES_CH6` ci-dessous), NOTE 3C (l. 147),
 *    NOTE 3D (l. 159), NOTE 12 et son second tableau TRANSFERTS DE CHARGES
 *    « la note 12 sert BU et DV du bilan et TI et TM du compte de résultat »
 *    (l. 273 à 283), NOTE 27A (l. 475), NOTE 27B (l. 483), NOTE 28 (l. 513),
 *    NOTE 29 (l. 543), NOTE 30 (l. 557 à 570) ; le fichier
 *    `syscohada/liasse/references/notes-ohada.md` n'a servi qu'en
 *    recoupement ;
 *  - aide secondaire, recoupée et jamais suivie contre l'AUDCIF :
 *    `syscohada/liasse/references/correspondance.tsv` (moteur Python, avec
 *    ses corrections documentées en colonne `note`).
 *
 * Rien ici ne vient du SYCEBNL : ses postes, ses comptes et ses notes sont
 * un autre référentiel (CLAUDE.md §6) et aucun de ses numéros n'est cité
 * ici, même à titre d'exemple. Seul le MOULE (types, ordre d'affichage,
 * préfixes) est commun avec `etats-financiers/correspondance-compte-resultat.ts`.
 *
 * ## Convention de lecture des numéros de comptes
 *
 * Même règle que dans tout le dépôt (moteur `liasse/` des deux skills) : un
 * jeton de 2 chiffres englobe tous ses divisionnaires (« 61 » couvre
 * 61xxxxxx) ; un jeton de 3 ou 4 chiffres ne vaut que pour lui-même et ses
 * subdivisions (« 6031 » couvre 6031xxxx, pas 6032). Le rapprochement se fait
 * par PRÉFIXE et, en cas de chevauchement, le préfixe le PLUS LONG l'emporte
 * (`posteDuCompteSyscohada()`). Les jetons du ch. 7 sont disjoints entre
 * eux ; les DEUX SEULS emboîtements de la table sont voulus et viennent du
 * Titre VIII ch. 33 (« 652 » dans le « 65 » de RJ, « 752 » dans le « 75 » de
 * TH · complément n° 12) : c'est la règle du préfixe le plus long qui les
 * tranche, et le spec vérifie qu'il n'y en a pas d'autres. Cette même règle
 * protège d'un plan de comptes personnalisé qui ajouterait une subdivision
 * plus fine.
 *
 * ## Convention de signe · CELLE DU MODÈLE OFFICIEL, pas celle du SYCEBNL
 *
 * Le ch. 4 est explicite : « Les postes de charges (préfixe R) sont saisis
 * EN NÉGATIF ; les formules de totalisation sont des SOMMES, jamais des
 * différences. XA = TA + RA + RB, avec RA et RB négatifs. […] ne jamais
 * soustraire deux fois. »
 *
 * Le SYCEBNL (`etats-financiers/correspondance-compte-resultat.ts`) porte
 * ses charges en POSITIF parce que SON texte écrit des différences
 * (XC = XA − XB). Les deux conventions sont chacune littéralement fidèle à
 * leur texte ; on ne transpose pas l'une à l'autre. Pour le SYSCOHADA on
 * retient donc :
 *
 *     montant d'un poste = Σ (crédit − débit) de ses comptes,
 *     QUEL QUE SOIT le sens du poste (produit ou charge).
 *
 * Conséquences, toutes voulues :
 *  - un produit ressort positif, une charge ressort négative, exactement
 *    comme la liasse déposée doit se lire (colonne SIGNE du modèle) ;
 *  - les postes « –/+ » (RB, RD, RF, TE) ressortent dans le sens de leur
 *    solde sans aucun traitement : un déstockage de marchandises (6031
 *    débiteur) donne RB négatif, un stockage (6031 créditeur) RB positif ;
 *  - chaque solde intermédiaire est une somme pure de refs
 *    (`SOLDES_INTERMEDIAIRES`, résolue par `calculerSoldesIntermediaires`) ;
 *  - XI vaut la somme de TOUS les postes, donc la somme (crédit − débit) de
 *    toutes les classes 6, 7 et 8 : le contrôle « résultat du compte de
 *    résultat = résultat toutes classes de gestion » n'a plus qu'à
 *    comparer XI à cette somme, l'écart étant exactement le total des
 *    comptes non rattachés ;
 *  - une charge dont le poste ressort POSITIF (601 net créditeur, RRR
 *    obtenus supérieurs aux achats) ou un produit NÉGATIF n'est pas une
 *    erreur de calcul mais une anomalie à signaler (« Charge au solde
 *    créditeur », « Produit au solde débiteur » ·
 *    `syscohada/liasse/references/anomalies.md`, gravité A_VERIFIER) ·
 *    voir `signeConformeAuModele()`.
 *
 * Le client et l'export doivent AFFICHER ces montants tels quels (une charge
 * s'imprime avec son signe moins), jamais les re-négativer ni les mettre en
 * valeur absolue : c'est le format du modèle officiel.
 *
 * ## ANOMALIES et divergences des sources, signalées et non corrigées en
 * silence (CLAUDE.md §1 et §9)
 *
 * 1. **Étiquettes RT, RR, XM de la maquette du skill** · la maquette Excel
 *    reprise par `correspondance.tsv` étiquetait RK « RT », RQ « RR » et XH
 *    « XM » (colonne `note` du TSV : « corrigé: la maquette étiquetait RT »,
 *    « RR », « étiquette XM »). Le ch. 4 tranche lui-même : « Pas de code
 *    TP, TQ, TR, TS ; pas de RT ; RR n'existe pas (on passe de RQ à RS) ».
 *    RK, RQ et XH sont retenus.
 * 2. **Comptes 13 des soldes intermédiaires** · la même maquette décalait
 *    d'un cran les sous-comptes du 13 (marge commerciale en « 13 », valeur
 *    ajoutée en 132…). Le Titre VII, COMPTE 13, donne : 132 Marge
 *    commerciale, 133 Valeur ajoutée, 134 EBE, 135 Résultat d'exploitation,
 *    136 Résultat financier, 137 RAO, 138 RHAO, 131 Bénéfice / 139 Perte.
 *    C'est ce qui est porté en `compte13` sur chaque solde.
 * 3. **Signe de TE, TF, TG : le ch. 4 et le ch. 7 ne disent pas la même
 *    chose** · le modèle du ch. 4 marque TE « –/+ » et laisse la colonne
 *    SIGNE de TF et TG vide ; le tableau du ch. 7 marque « + » les trois.
 *    Retenu : TE « –/+ », parce que le Titre VII, COMPTE 73 (Commentaires)
 *    tranche directement : le compte, « débiteur, il représente la
 *    diminution de ces stocks (déstockage) […] Dans ce cas, il est porté en
 *    négatif du côté des produits dans le Compte de résultat » · même
 *    nature que le 603 dont la fiche dit que les sous-comptes « peuvent
 *    être de solde débiteur ou créditeur ». TF et TG « + » (le ch. 7 comble
 *    le blanc du ch. 4 et rien ne s'y oppose : 72 et 71 sont des produits
 *    ordinaires).
 * 4. **Renvoi de note sur le solde XD** · le modèle transcrit du ch. 4
 *    porte « 28 » en colonne NOTE sur la ligne XD (Excédent brut
 *    d'exploitation), alors qu'aucun autre solde X* ne renvoie à une note.
 *    Probable glissement de ligne dans la transcription (le 28 de TJ, juste
 *    dessous). Transcrit tel quel, sans l'inventer ni le retirer ; à
 *    vérifier sur le Journal officiel avant toute impression du renvoi.
 * 5. **RS (Impôts sur le résultat) sans renvoi de note** · colonne NOTE vide
 *    au ch. 4. Laissée vide.
 * 6. **88 Subventions d'équilibre en produit HAO (TO)** · le ch. 7 le range
 *    en TO avec 84 et 86, en ajoutant lui-même : « ce que la NOTE 30
 *    contredit ». Le ch. 7 est la source primaire du rattachement ; 88 va
 *    en TO, et la divergence est portée ici pour le jour où la note 30 sera
 *    construite.
 * 7. **654 / 754 (cessions courantes d'immobilisations)** restent en RJ et
 *    TH, activité ORDINAIRE, parce que le ch. 7 dit que « 65, 67 et 75, 77
 *    remontent en bloc : aucun éclatement ». Ce n'est pas une anomalie mais
 *    c'est la ligne que le TFT (CAFG) devra retraiter ; elle est notée ici
 *    pour que personne ne « corrige » RJ/TH en les basculant en HAO.
 * 8. **Comptes du semis sans poste** · aucun en classes 6, 7, 8 (le spec le
 *    vérifie compte par compte). Le ch. 7 rappelle que 606, 607 et 788
 *    n'existent pas au plan : leur absence de la table n'est pas une lacune.
 * 9. **Deux libellés diffèrent entre le ch. 4 et le ch. 7** · TJ s'écrit
 *    « Reprises d'amortissements, provisions et dépréciations » au ch. 4
 *    (l. 474) et « Reprises d'amortissements, de provisions et
 *    dépréciations » au ch. 7 (l. 878) ; RM s'écrit « Frais financiers et
 *    charges assimilées » au ch. 4 (l. 480) et « … assimilés » au ch. 7
 *    (l. 889). Retenu : le ch. 4 pour les deux, parce que c'est le modèle
 *    imprimé que la liasse reproduit, et parce qu'une seule source des
 *    libellés évite de panacher. Les autres libellés, TO « Autres Produits
 *    HAO » et RP « Autres Charges HAO » compris (majuscule dans les deux
 *    chapitres), sont identiques dans les deux sources.
 * 10. **Subdivisions du 87 : le Titre VII et le plan de comptes ne
 *    s'accordent pas** · le Titre VII, COMPTE 87, liste 871, 872, 878 ;
 *    `syscohada/comptes/references/plan-comptes.tsv` (dont le semis est
 *    généré) porte 871, 874, 878, « 874 Participation contractuelle aux
 *    bénéfices ». Sans effet sur cette table, RQ prenant le 87 en bloc
 *    (ch. 7) : les deux numérotations y tombent. Signalé pour qu'une
 *    subdivision 872 saisie par un dossier ne soit pas prise pour une
 *    erreur de plan, et pour le jour où le semis serait confronté au
 *    Titre VII.
 * 11. **Renvoi « 27 » de RK** · le ch. 4 renvoie RK à la note « 27 » ; le
 *    ch. 6 ne connaît pas de note 27 mais 27A (charges de personnel) et
 *    27B (effectifs, masse salariale). Le renvoi est transcrit tel quel
 *    sur le poste et `resoudreRenvoiNote()` le développe en 27A et 27B :
 *    c'est par cette fonction, et non par un split ad hoc, que le moteur
 *    de notes et l'export doivent passer, sinon le renvoi imprimé ne
 *    pointe sur aucune note existante.
 * 12. **Le modèle général est COMPLÉTÉ par deux postes de quote-part de
 *    résultat partagé** · ce n'est pas une correction du modèle, c'est le
 *    texte officiel qui le prescrit. AUDCIF Titre VIII, ch. 33 « Opérations
 *    faites en commun », section 7.2 (skill `audcif-acte-uniforme`,
 *    `references/titre-8-ch31-41-evenements-tiers-fusions-liquidation/`
 *    `03-chapitre-33-operations-faites-en-commun.md`, lignes 168 et 170) :
 *    « le modèle de Compte de résultat du Système comptable OHADA doit être
 *    complété pour intégrer les quotes-parts de résultat sur opérations
 *    faites en commun, qui ne sont pas prévues dans le modèle général […]
 *    Dès lors que l'entité réalise de telles opérations, elle utilise un
 *    poste supplémentaire de charges et un de produits, à la fin du niveau
 *    "Exploitation" : (charges) Quote-part de résultat partagé et (produits)
 *    Quote-part de résultat partagé ». D'où RQP (charges) et TQP (produits),
 *    portant le 652 et le 752 (Titre VII, COMPTE 65 et COMPTE 75 : « Quote-
 *    part de résultat sur opérations faites en commun » ; ch. 33 section 6.3
 *    pour les écritures, section 7.3 pour les sous-comptes 6521/6525 et
 *    7521/7525).
 *    PLACEMENT ET EFFET, qui sont tout l'objet du texte : « à la fin du
 *    niveau Exploitation » veut dire APRÈS RL et AVANT XE, le niveau
 *    exploitation du ch. 4 se terminant sur le RÉSULTAT D'EXPLOITATION. Le
 *    652 et le 752 quittent donc RJ et TH, où le rattachement en bloc du 65
 *    et du 75 (ch. 7) les faisait entrer dans la VALEUR AJOUTÉE (XC) et dans
 *    l'EXCÉDENT BRUT D'EXPLOITATION (XD) : une quote-part de résultat n'est
 *    ni de la valeur ajoutée, ni de l'excédent brut. Ils n'entrent plus que
 *    dans XE, et par lui dans XG et XI : le résultat net est INCHANGÉ et le
 *    compte de résultat continue de boucler avec le bilan (contrôle « XI =
 *    résultat de toutes les classes de gestion »).
 *    RQP et TQP sont des CLÉS INTERNES, pas des codes REF déposés : le ch. 33
 *    n'en donne aucun et le ch. 4 ferme sa série (« Pas de code TP, TQ, TR,
 *    TS ; pas de RT ; RR n'existe pas »). Trois lettres, donc, qu'aucun REF
 *    officiel ne peut porter. `REFS_POSTES_SUPPLEMENTAIRES` les expose.
 * 13. **Le ch. 33 nomme ces postes de deux façons** · section 7.2, la phrase
 *    qui les crée, écrit « Quote-part de résultat partagé » ; section 7.3
 *    écrit « le poste "Quote-part de résultat sur opérations faites en
 *    commun" », qui est l'intitulé des comptes 652 et 752 (Titre VII).
 *    Retenu comme LIBELLÉ : celui de la section 7.2.
 * 14. **Ce que le complément n° 12 entraîne HORS de ce fichier · déclaré,
 *    non corrigé ici** (ces fichiers relèvent d'autres chantiers) :
 *    a) TABLEAU DES FLUX · le poste FA (CAFG) part de XD (« le point
 *       d'entrée est l'EBE, jamais le résultat net », ch. 5 § 1.2.1) et ne
 *       reprend aucun des deux nouveaux postes. Le 652 et le 752 ayant
 *       quitté XD, la quote-part n'est plus dans la CAFG, alors que sa
 *       contrepartie (compte 463 Associés, opérations faites en commun ·
 *       ch. 33 section 3.2) continue d'être lue par la variation des
 *       créances et des dettes (FD et FE, qui n'excluent pas le 46). Pour un
 *       coparticipant, le flux de trésorerie opérationnel s'en trouve décalé
 *       du montant de la quote-part. Remède : deux termes
 *       `poste(1, 'COMPTE_RESULTAT', 'RQP' | 'TQP', 'N')` dans FA, à écrire
 *       dans `correspondance-tft-syscohada.ts`.
 *    b) NOTES ANNEXES · les deux postes renvoient aux notes du ch. 6 qui
 *       portent déjà le 652 et le 752 : la note 26 « AUTRES CHARGES », dont
 *       une rubrique est précisément « Quote-part de résultat sur opérations
 *       faites en commun » (comptes 652), et la note 21, qui prend le 75 en
 *       bloc. Deux conséquences : le total de la note 26 vaut désormais
 *       RJ + RQP et non plus RJ seul (son `renvoyeeDepuis` reste ['RJ']), et
 *       l'analyse en composantes que la section 7.3 du ch. 33 exige (6521 /
 *       6525 en charges, 7521 / 7525 en produits) n'est pas servie : la note
 *       26 ne descend pas sous le 652, la note 21 ne descend pas sous le 752.
 *    c) AFFICHAGE · « Dès lors que l'entité réalise de telles opérations »
 *       (section 7.2) : les deux lignes ne sont à imprimer que si l'entité en
 *       fait. `REFS_POSTES_SUPPLEMENTAIRES` existe pour qu'un consommateur
 *       puisse les masquer quand elles sont nulles en N et en N-1 ; le
 *       service les sert aujourd'hui comme toutes les autres lignes.
 */

export type SensPosteSyscohada = 'PRODUIT' | 'CHARGE';

/** Colonne SIGNE du modèle officiel (ch. 4, section 2). */
export type SigneOfficiel = '+' | '-' | '-/+';

export interface PosteCompteResultatSyscohada {
  /** Code REF officiel (TA à TO pour les produits, RA à RS pour les charges). */
  ref: string;
  libelle: string;
  sens: SensPosteSyscohada;
  /** Signe attendu du montant, tel que le modèle l'imprime. */
  signe: SigneOfficiel;
  /** Lettre A à D du modèle · les quatre composantes du chiffre d'affaires XB. */
  lettre?: 'A' | 'B' | 'C' | 'D';
  /** Préfixes de comptes, tels que cités au ch. 7. */
  comptes: string[];
  /** Renvois de la colonne NOTE du ch. 4 (« 3C & 28 » devient ['3C', '28']). */
  notes: string[];
  /**
   * Poste ABSENT du modèle général du ch. 4, ajouté par un chapitre du Titre
   * VIII qui prescrit lui-même de compléter la maquette · aujourd'hui les
   * deux quotes-parts de résultat partagé du ch. 33 (complément n° 12).
   * Marqué pour deux usages, et deux seulement : imprimer la maquette telle
   * que le ch. 4 la dépose (en filtrant ces postes) et masquer les lignes
   * nulles, le ch. 33 ne les prévoyant que « dès lors que l'entité réalise de
   * telles opérations ». JAMAIS pour les exclure d'un total : XE, XG et XI
   * les contiennent, faute de quoi le compte de résultat cesserait de boucler
   * avec le bilan.
   */
  supplementaire?: true;
}

/**
 * Les 35 postes portant des comptes, dans l'ORDRE DU MODÈLE (ch. 4) · les
 * produits (T*) et les charges (R*) y sont entrelacés, ce n'est pas une
 * liste par nature. Les soldes X* sont à part (`SOLDES_INTERMEDIAIRES`) et
 * `ORDRE_AFFICHAGE_COMPTE_RESULTAT` recompose la maquette complète.
 *
 * 33 postes viennent du modèle général du ch. 4 ; les DEUX derniers du niveau
 * exploitation, RQP et TQP, viennent du Titre VIII ch. 33, qui prescrit de
 * compléter ce modèle (complément n° 12) et qui les marque `supplementaire`.
 */
export const POSTES_COMPTE_RESULTAT_SYSCOHADA: PosteCompteResultatSyscohada[] = [
  // ---- Marge commerciale ---------------------------------------------------
  { ref: 'TA', libelle: 'Ventes de marchandises', sens: 'PRODUIT', signe: '+', lettre: 'A', comptes: ['701'], notes: ['21'] },
  { ref: 'RA', libelle: 'Achats de marchandises', sens: 'CHARGE', signe: '-', comptes: ['601'], notes: ['22'] },
  {
    ref: 'RB',
    libelle: 'Variation de stocks de marchandises',
    sens: 'CHARGE',
    signe: '-/+',
    // Le 603 est ÉCLATÉ : 6031 seul ici, 6032 en RD, 6033 en RF (ch. 7,
    // clés de lecture : « Le compte 603 ne remonte jamais en bloc »).
    comptes: ['6031'],
    notes: ['6'],
  },
  // ---- Chiffre d'affaires --------------------------------------------------
  { ref: 'TB', libelle: 'Ventes de produits fabriqués', sens: 'PRODUIT', signe: '+', lettre: 'B', comptes: ['702', '703', '704'], notes: ['21'] },
  { ref: 'TC', libelle: 'Travaux, services vendus', sens: 'PRODUIT', signe: '+', lettre: 'C', comptes: ['705', '706'], notes: ['21'] },
  { ref: 'TD', libelle: 'Produits accessoires', sens: 'PRODUIT', signe: '+', lettre: 'D', comptes: ['707'], notes: ['21'] },
  // ---- Valeur ajoutée ------------------------------------------------------
  {
    ref: 'TE',
    libelle: 'Production stockée (ou déstockage)',
    sens: 'PRODUIT',
    signe: '-/+', // ch. 4 ; le ch. 7 dit « + » · anomalie n° 3 en tête de fichier
    comptes: ['73'],
    notes: ['6'],
  },
  { ref: 'TF', libelle: 'Production immobilisée', sens: 'PRODUIT', signe: '+', comptes: ['72'], notes: ['21'] }, // signe vide au ch. 4, « + » au ch. 7
  { ref: 'TG', libelle: "Subventions d'exploitation", sens: 'PRODUIT', signe: '+', comptes: ['71'], notes: ['21'] }, // idem
  { ref: 'TH', libelle: 'Autres produits', sens: 'PRODUIT', signe: '+', comptes: ['75'], notes: ['21'] }, // 754 inclus · anomalie n° 7
  {
    ref: 'TI',
    libelle: "Transferts de charges d'exploitation",
    sens: 'PRODUIT',
    signe: '+',
    // Le 78 est éclaté : 781 ici, 787 en TM. Le plan n'a que ces deux
    // divisionnaires du 78 (ch. 7, clés de lecture).
    comptes: ['781'],
    notes: ['12'],
  },
  { ref: 'RC', libelle: 'Achats de matières premières et fournitures liées', sens: 'CHARGE', signe: '-', comptes: ['602'], notes: ['22'] },
  { ref: 'RD', libelle: 'Variation de stocks de matières premières et fournitures liées', sens: 'CHARGE', signe: '-/+', comptes: ['6032'], notes: ['6'] },
  {
    ref: 'RE',
    libelle: 'Autres achats',
    sens: 'CHARGE',
    signe: '-',
    // 604, 605, 608 · « il n'existe ni 606 ni 607 au plan de comptes : le
    // tableau est complet sur la classe 60 » (ch. 7, clés de lecture).
    comptes: ['604', '605', '608'],
    notes: ['22'],
  },
  { ref: 'RF', libelle: "Variation de stocks d'autres approvisionnements", sens: 'CHARGE', signe: '-/+', comptes: ['6033'], notes: ['6'] },
  { ref: 'RG', libelle: 'Transports', sens: 'CHARGE', signe: '-', comptes: ['61'], notes: ['23'] },
  { ref: 'RH', libelle: 'Services extérieurs', sens: 'CHARGE', signe: '-', comptes: ['62', '63'], notes: ['24'] },
  { ref: 'RI', libelle: 'Impôts et taxes', sens: 'CHARGE', signe: '-', comptes: ['64'], notes: ['25'] },
  { ref: 'RJ', libelle: 'Autres charges', sens: 'CHARGE', signe: '-', comptes: ['65'], notes: ['26'] }, // 654 inclus · anomalie n° 7
  // ---- Excédent brut d'exploitation ---------------------------------------
  {
    ref: 'RK',
    libelle: 'Charges de personnel',
    sens: 'CHARGE',
    signe: '-',
    comptes: ['66'],
    // Le ch. 4 renvoie à « 27 » ; le ch. 6 subdivise la note en 27A (charges
    // de personnel, soldes) et 27B (effectifs, déclaratif). Transcrit tel
    // quel ; `resoudreRenvoiNote('27')` donne 27A et 27B · anomalie n° 11.
    notes: ['27'],
  },
  // ---- Résultat d'exploitation ---------------------------------------------
  {
    ref: 'TJ',
    libelle: "Reprises d'amortissements, provisions et dépréciations", // ch. 4 ; le ch. 7 écrit « de provisions » · anomalie n° 9
    sens: 'PRODUIT',
    signe: '+',
    // Le 79 est éclaté : 791, 798, 799 ici, 797 en TL. La reprise de
    // subvention d'investissement (799) est donc un produit D'EXPLOITATION
    // (ch. 7, clés de lecture ; Titre VII, COMPTE 79).
    comptes: ['791', '798', '799'],
    notes: ['28'],
  },
  {
    ref: 'RL',
    libelle: 'Dotations aux amortissements, aux provisions et dépréciations',
    sens: 'CHARGE',
    signe: '-',
    // 68 et 69 éclatés par destination : 681 et 691 (exploitation) ici,
    // 697 (financier) en RN. Le semis ne connaît que 681 sous 68.
    comptes: ['681', '691'],
    notes: ['3C', '28'],
  },
  // ---- Fin du niveau « Exploitation » · les deux postes que le ch. 33 ajoute
  // au modèle général (complément n° 12 en tête de fichier). Ils sont placés
  // APRÈS RL, donc hors de XC et de XD et dans XE : c'est ce que « à la fin du
  // niveau "Exploitation" » veut dire, et c'est tout l'effet recherché par le
  // texte. L'ordre charges puis produits est celui de la phrase du ch. 33
  // (« un poste supplémentaire de charges et un de produits »).
  {
    ref: 'RQP',
    libelle: 'Quote-part de résultat partagé', // ch. 33 section 7.2 · anomalie n° 13
    sens: 'CHARGE',
    signe: '-',
    // 652 et ses deux subdivisions : 6521 quote-part transférée de bénéfices
    // (comptabilité du gérant), 6525 pertes imputées par transfert
    // (comptabilité des associés non gérants) · Titre VII COMPTE 65, ch. 33
    // sections 6.3 et 7.3. Le préfixe le plus long l'emporte sur le « 65 »
    // que RJ prend en bloc.
    comptes: ['652'],
    // Note 26 « AUTRES CHARGES » : la seule note du ch. 6 qui porte une
    // rubrique « Quote-part de résultat sur opérations faites en commun »
    // (comptes 652) · complément n° 14 b pour ce qu'elle ne fait pas.
    notes: ['26'],
    supplementaire: true,
  },
  {
    ref: 'TQP',
    libelle: 'Quote-part de résultat partagé', // même libellé que RQP, c'est le texte
    sens: 'PRODUIT',
    signe: '+',
    // 752 et ses deux subdivisions : 7521 quote-part transférée de pertes
    // (gérant), 7525 bénéfices attribués par transfert (non-gérants) · Titre
    // VII COMPTE 75. Le préfixe le plus long l'emporte sur le « 75 » de TH.
    comptes: ['752'],
    // Note 21 « CHIFFRE D'AFFAIRES ET AUTRES PRODUITS », qui porte le 75 en
    // bloc, 752 compris · complément n° 14 b.
    notes: ['21'],
    supplementaire: true,
  },
  // ---- Résultat financier --------------------------------------------------
  { ref: 'TK', libelle: 'Revenus financiers et assimilés', sens: 'PRODUIT', signe: '+', comptes: ['77'], notes: ['29'] },
  { ref: 'TL', libelle: 'Reprises de provisions et dépréciations financières', sens: 'PRODUIT', signe: '+', comptes: ['797'], notes: ['28'] },
  { ref: 'TM', libelle: 'Transferts de charges financières', sens: 'PRODUIT', signe: '+', comptes: ['787'], notes: ['12'] },
  { ref: 'RM', libelle: 'Frais financiers et charges assimilées', sens: 'CHARGE', signe: '-', comptes: ['67'], notes: ['29'] }, // ch. 4 ; « assimilés » au ch. 7 · anomalie n° 9
  { ref: 'RN', libelle: 'Dotations aux provisions et aux dépréciations financières', sens: 'CHARGE', signe: '-', comptes: ['697'], notes: ['3C', '28'] },
  // ---- Résultat hors activités ordinaires ---------------------------------
  { ref: 'TN', libelle: "Produits des cessions d'immobilisations", sens: 'PRODUIT', signe: '+', comptes: ['82'], notes: ['3D'] },
  // La majuscule de « Produits » et « Charges » est celle des deux chapitres, pas une coquille.
  { ref: 'TO', libelle: 'Autres Produits HAO', sens: 'PRODUIT', signe: '+', comptes: ['84', '86', '88'], notes: ['30'] }, // 88 · anomalie n° 6
  { ref: 'RO', libelle: "Valeurs comptables des cessions d'immobilisations", sens: 'CHARGE', signe: '-', comptes: ['81'], notes: ['3D'] },
  { ref: 'RP', libelle: 'Autres Charges HAO', sens: 'CHARGE', signe: '-', comptes: ['83', '85'], notes: ['30'] },
  // ---- Résultat net --------------------------------------------------------
  { ref: 'RQ', libelle: 'Participation des travailleurs', sens: 'CHARGE', signe: '-', comptes: ['87'], notes: ['30'] }, // « RR » dans la maquette · anomalie n° 1
  { ref: 'RS', libelle: 'Impôts sur le résultat', sens: 'CHARGE', signe: '-', comptes: ['89'], notes: [] }, // pas de renvoi au ch. 4 · anomalie n° 5
];

/** Vue par nature, pour les consommateurs qui veulent produits d'un côté et charges de l'autre. */
export const POSTES_PRODUITS_SYSCOHADA = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter((p) => p.sens === 'PRODUIT');
export const POSTES_CHARGES_SYSCOHADA = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter((p) => p.sens === 'CHARGE');

/**
 * Les postes qui ne sont PAS au modèle général du ch. 4, DÉRIVÉS du drapeau
 * `supplementaire` et jamais réécrits à la main (complément n° 12). Deux
 * usages, et deux seulement : imprimer la maquette déposée telle quelle, et
 * masquer ces lignes quand elles sont nulles, le ch. 33 ne les prévoyant que
 * « dès lors que l'entité réalise de telles opérations ». Les retrancher d'un
 * total romprait le bouclage du compte de résultat avec le bilan.
 */
export const REFS_POSTES_SUPPLEMENTAIRES: readonly string[] = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter(
  (p) => p.supplementaire,
).map((p) => p.ref);

/**
 * Un solde intermédiaire de gestion = somme signée de refs déjà résolues
 * (postes de base ou soldes antérieurs dans la liste). Aucune différence :
 * c'est la « logique de signe » du ch. 4.
 */
export interface SoldeIntermediaire {
  ref: string;
  libelle: string;
  /** Formule telle qu'imprimée au modèle, pour l'affichage et l'export. */
  formuleOfficielle: string;
  /** Refs sommées · toutes antérieures dans l'ordre d'affichage. */
  deRefs: string[];
  /**
   * Sous-compte du 13 qui reçoit ce solde quel que soit son signe (Titre
   * VII, COMPTE 13 : 132 à 138). Absent pour XB, qui n'est pas un résultat
   * (le COMPTE 13 ne le liste pas) et pour XI, dont le compte dépend du
   * signe (`compte13ParSigne`). Un seul des deux champs est porté ; le
   * service passe par `compte13DuSolde()` et n'a aucune chaîne à analyser.
   */
  compte13?: string;
  /** XI seulement : 131 si bénéfice, 139 si perte (Titre VII, COMPTE 13). */
  compte13ParSigne?: { benefice: string; perte: string };
  /** Renvois de la colonne NOTE du ch. 4 sur la ligne du solde. */
  notes: string[];
}

/** Ordre de résolution = ordre du modèle : chaque solde ne lit que ce qui le précède. */
export const SOLDES_INTERMEDIAIRES: SoldeIntermediaire[] = [
  {
    ref: 'XA',
    libelle: 'MARGE COMMERCIALE',
    formuleOfficielle: 'Somme TA à RB',
    deRefs: ['TA', 'RA', 'RB'],
    compte13: '132',
    notes: [],
  },
  {
    ref: 'XB',
    libelle: "CHIFFRE D'AFFAIRES",
    formuleOfficielle: 'A + B + C + D',
    // Somme de POSTES (lettres A à D), pas de XA : le ch. 7 le souligne
    // (« Le poste XB est une somme de postes, pas de comptes »). Le 70
    // complet, 701 à 707.
    deRefs: ['TA', 'TB', 'TC', 'TD'],
    // Le chiffre d'affaires n'a pas de sous-compte 13 (Titre VII, COMPTE 13
    // ne le liste pas) : ce n'est pas un résultat, c'est un agrégat de
    // ventes. C'est pourquoi le modèle a neuf lignes X* pour huit soldes.
    notes: [],
  },
  {
    ref: 'XC',
    libelle: 'VALEUR AJOUTÉE',
    formuleOfficielle: '(XB + RA + RB) + (somme TE à RJ)',
    // « somme TE à RJ » s'entend dans l'ordre du modèle, produits et charges
    // entrelacés : TE TF TG TH TI RC RD RE RF RG RH RI RJ.
    deRefs: ['XB', 'RA', 'RB', 'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ'],
    compte13: '133',
    notes: [],
  },
  {
    ref: 'XD',
    libelle: "EXCÉDENT BRUT D'EXPLOITATION",
    formuleOfficielle: 'XC + RK',
    deRefs: ['XC', 'RK'],
    compte13: '134',
    notes: ['28'], // transcrit tel quel · anomalie n° 4 en tête de fichier
  },
  {
    ref: 'XE',
    libelle: "RÉSULTAT D'EXPLOITATION",
    // Le ch. 4 imprime « XD + TJ + RL ». Le ch. 33 plaçant ses deux postes à
    // la FIN du niveau exploitation, le résultat d'exploitation du modèle
    // COMPLÉTÉ les additionne (complément n° 12) : imprimer la formule du
    // ch. 4 seule la mettrait en contradiction avec la somme des lignes
    // situées juste au-dessus.
    formuleOfficielle: 'XD + TJ + RL + RQP + TQP',
    deRefs: ['XD', 'TJ', 'RL', 'RQP', 'TQP'],
    compte13: '135',
    notes: [],
  },
  {
    ref: 'XF',
    libelle: 'RÉSULTAT FINANCIER',
    formuleOfficielle: 'Somme TK à RN',
    deRefs: ['TK', 'TL', 'TM', 'RM', 'RN'],
    compte13: '136',
    notes: [],
  },
  {
    ref: 'XG',
    libelle: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES',
    formuleOfficielle: 'XE + XF',
    deRefs: ['XE', 'XF'],
    compte13: '137',
    notes: [],
  },
  {
    ref: 'XH',
    libelle: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES',
    formuleOfficielle: 'Somme TN à RP',
    deRefs: ['TN', 'TO', 'RO', 'RP'],
    compte13: '138', // « XM » et 137 dans la maquette · anomalies n° 1 et 2
    notes: [],
  },
  {
    ref: 'XI',
    libelle: 'RÉSULTAT NET',
    formuleOfficielle: 'XG + XH + RQ + RS',
    deRefs: ['XG', 'XH', 'RQ', 'RS'],
    // 131 si bénéfice, 139 si perte (Titre VII, COMPTE 13) · seul solde
    // dont le compte dépend du signe, d'où le champ dédié.
    compte13ParSigne: { benefice: '131', perte: '139' },
    notes: [],
  },
];

/**
 * Sous-compte du 13 où ce solde doit se retrouver à la clôture, ou
 * `undefined` pour XB. Pour XI le signe tranche (bénéfice 131, perte 139) ;
 * un résultat nul est rangé en 131 par convention, le COMPTE 13 ne
 * prévoyant pas ce cas.
 */
export function compte13DuSolde(solde: SoldeIntermediaire, montant: number): string | undefined {
  if (solde.compte13ParSigne) return montant < 0 ? solde.compte13ParSigne.perte : solde.compte13ParSigne.benefice;
  return solde.compte13;
}

/**
 * Codes des 36 notes annexes tels qu'ils figurent en en-tête du ch. 6
 * (`#### NOTE N`, lignes 97 à 707 de `titre-9-ch6-7-notes-annexes-correspondance.md`).
 * Le « 16B bis » du texte est transcrit tel quel. Cette liste sert à
 * vérifier qu'un renvoi résolu pointe sur une note qui existe ; elle ne
 * décrit pas les notes (c'est le rôle du module notes-annexes SYSCOHADA).
 */
export const CODES_NOTES_CH6: readonly string[] = [
  '1', '2', '3A', '3B', '3C', '3D', '3E', '3F', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  '13', '14', '15A', '15B', '16A', '16B', '16B bis', '16C', '17', '18', '19', '20', '21', '22',
  '23', '24', '25', '26', '27A', '27B', '28', '29', '30', '31', '32', '33', '34', '35', '36',
];

/**
 * Renvois du ch. 4 que le ch. 6 subdivise · anomalie n° 11. Une seule
 * entrée aujourd'hui ; en ajouter une ici, jamais dans un consommateur.
 */
export const RENVOIS_NOTES_SUBDIVISES: Readonly<Record<string, readonly string[]>> = {
  '27': ['27A', '27B'],
};

/**
 * Développe un renvoi de la colonne NOTE en codes de notes du ch. 6 :
 * « 27 » devient 27A et 27B, tout autre renvoi est rendu tel quel. Le
 * moteur de notes et l'export passent par ici ; le spec vérifie que chaque
 * renvoi de la table, une fois résolu, existe dans `CODES_NOTES_CH6`.
 */
export function resoudreRenvoiNote(renvoi: string): string[] {
  return [...(RENVOIS_NOTES_SUBDIVISES[renvoi] ?? [renvoi])];
}

/**
 * Ordre d'affichage officiel · postes et soldes entrelacés comme au modèle
 * du ch. 4. C'est la maquette complète, ligne par ligne, RQP et TQP compris :
 * le ch. 33 les veut « à la fin du niveau "Exploitation" », donc entre RL et
 * XE (complément n° 12).
 */
export const ORDRE_AFFICHAGE_COMPTE_RESULTAT: string[] = [
  'TA', 'RA', 'RB', 'XA',
  'TB', 'TC', 'TD', 'XB',
  'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ', 'XC',
  'RK', 'XD',
  'TJ', 'RL', 'RQP', 'TQP', 'XE',
  'TK', 'TL', 'TM', 'RM', 'RN', 'XF',
  'XG',
  'TN', 'TO', 'RO', 'RP', 'XH',
  'RQ', 'RS', 'XI',
];

/**
 * Préfixes de comptes qui composent le CHIFFRE D'AFFAIRES, DÉRIVÉS du poste
 * XB et jamais réécrits à la main.
 *
 * XB vaut « A + B + C + D », c'est-à-dire les postes TA à TD, et le ch. 7
 * souligne que « le poste XB est une somme de POSTES, pas de comptes ». La
 * liste qui en sort est donc 701 à 707 · mais elle en sort, elle n'y est pas
 * posée. Deux modules en ont besoin (le résultat fiscal, et la mesure du
 * seuil de désignation du commissaire aux comptes) et chacun l'avait
 * recopiée : deux copies d'une liste officielle, c'est une occasion de
 * divergence de plus, sur exactement le genre de donnée que ce dépôt
 * s'interdit d'écrire de mémoire.
 */
export const PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA: readonly string[] = (() => {
  const xb = SOLDES_INTERMEDIAIRES.find((s) => s.ref === 'XB');
  if (!xb) throw new Error("Le solde XB (chiffre d'affaires) a disparu du modèle du ch. 4.");
  return xb.deRefs.flatMap((ref) => {
    const poste = POSTES_COMPTE_RESULTAT_SYSCOHADA.find((p) => p.ref === ref);
    if (!poste) throw new Error(`Le poste ${ref}, sommé par XB, n'existe pas au modèle.`);
    return poste.comptes ?? [];
  });
})();

export function trouvePosteCompteResultat(ref: string): PosteCompteResultatSyscohada | undefined {
  return POSTES_COMPTE_RESULTAT_SYSCOHADA.find((p) => p.ref === ref);
}
export function trouveSoldeIntermediaire(ref: string): SoldeIntermediaire | undefined {
  return SOLDES_INTERMEDIAIRES.find((s) => s.ref === ref);
}

/**
 * Poste auquel rattacher un numéro de compte, ou `null` s'il n'entre dans
 * aucun poste : comptes de bilan (classes 1 à 5) et classe 9 (engagements
 * hors bilan et analytique, « hors états de synthèse » selon le ch. 7).
 * Un compte de classe 6, 7 ou 8 qui revient `null` est un compte NON
 * RATTACHÉ : le service doit le montrer, jamais l'absorber.
 */
export function posteDuCompteSyscohada(numeroCompte: string): PosteCompteResultatSyscohada | null {
  let meilleur: PosteCompteResultatSyscohada | null = null;
  let longueurMeilleurPrefixe = 0;

  for (const poste of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
    for (const prefixe of poste.comptes) {
      if (numeroCompte.startsWith(prefixe) && prefixe.length > longueurMeilleurPrefixe) {
        meilleur = poste;
        longueurMeilleurPrefixe = prefixe.length;
      }
    }
  }

  return meilleur;
}

/**
 * Montant SIGNÉ d'une ligne de balance selon la convention de ce fichier :
 * crédit − débit, pour un produit comme pour une charge. C'est la seule
 * formule à utiliser pour alimenter un poste ; en mettre une autre côté
 * charges (débit − crédit) casserait toutes les sommes des soldes.
 */
export function montantSigne(totalDebit: number, totalCredit: number): number {
  return totalCredit - totalDebit;
}

/**
 * Le montant d'un poste est-il du signe que le modèle attend ? Un poste
 * « –/+ » est toujours conforme. Un « + » négatif ou un « – » positif est
 * une anomalie A_VERIFIER (charge créditrice, produit débiteur), pas une
 * erreur de calcul : à remonter, jamais à redresser.
 */
export function signeConformeAuModele(poste: PosteCompteResultatSyscohada, montant: number): boolean {
  if (poste.signe === '-/+' || Math.abs(montant) < 0.005) return true;
  return poste.signe === '+' ? montant > 0 : montant < 0;
}

/**
 * Résout les neuf lignes X* (XA à XI) à partir des montants SIGNÉS des
 * postes de base (clé = ref). Une ref absente vaut 0 · un poste sans
 * compte mouvementé n'est pas une erreur. Les soldes sont calculés dans
 * l'ordre de `SOLDES_INTERMEDIAIRES`, chacun ne lisant que ce qui le
 * précède ; le spec verrouille cette propriété.
 *
 * Retourne postes ET soldes dans une même table, prête pour l'affichage
 * dans `ORDRE_AFFICHAGE_COMPTE_RESULTAT` et pour l'export.
 */
export function calculerSoldesIntermediaires(montantsParRef: Record<string, number>): Record<string, number> {
  const resultat: Record<string, number> = { ...montantsParRef };
  for (const solde of SOLDES_INTERMEDIAIRES) {
    resultat[solde.ref] = solde.deRefs.reduce((somme, ref) => somme + (resultat[ref] ?? 0), 0);
  }
  return resultat;
}
