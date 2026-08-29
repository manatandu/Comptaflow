/**
 * Maquettes officielles du SYSTÈME MINIMAL DE TRÉSORERIE (S.M.T) et
 * rattachement des comptes.
 *
 * Source de la maquette : skill `sycebnl`,
 * `references/partie4-ch4-etats-smt.md` (Journal officiel OHADA, n° spécial
 * du 22 février 2023, Partie 4, chapitre 4, p. 433-438). Les codes REF
 * (GA-HZ au bilan, KA-KZC au compte de résultat), les libellés, les renvois
 * de notes et l'ordre des lignes en sont transcrits littéralement.
 *
 * ## Ce que le texte ne donne PAS, et qu'il faut donc dire
 *
 * Pour les deux autres jeux (associations ch. 2, projets ch. 3), le texte
 * officiel fournit un **tableau de correspondance poste → comptes**, et nos
 * fichiers `correspondance-bilan.ts` / `correspondance-projet-bilan.ts` s'y
 * adossent ligne à ligne. **Le chapitre 4 n'en comporte aucun.** Il ne donne
 * que la maquette : REF, libellé, renvoi de note.
 *
 * Le rattachement ci-dessous est donc **dérivé**, et il faut savoir de quoi :
 * du plan des comptes SYCEBNL lui-même (Partie 2, ch. 2 et ch. 3), c'est-à-dire
 * d'une source officielle, mais par lecture du libellé de chaque poste et non
 * par transcription d'une table. « Caisse » va au compte 57 parce que le
 * compte 57 s'intitule Caisse, pas parce qu'un tableau l'a écrit. Chaque
 * poste porte ci-dessous la justification de son rattachement.
 *
 * Là où la maquette est trop courte pour tout accueillir, le choix est
 * signalé plutôt que masqué (voir la réserve sur HC).
 *
 * ## Comptabilité de trésorerie · ce qui commande la construction
 *
 * Partie 4, ch. 1, § 1.3 : « Dans le cadre d'une comptabilité simplifiée de
 * trésorerie, le fait générateur de l'enregistrement comptable est
 * l'encaissement (recette) ou le décaissement (dépense). Toutefois ces
 * entités devront produire un tableau récapitulatif des dettes et des
 * créances de façon extra-comptable en fin d'exercice. »
 *
 * D'où la structure du compte de résultat : un solde de CAISSE (C = A - B),
 * puis trois retraitements de variation (stocks, créances, dettes) et les
 * dotations aux amortissements pour revenir au résultat net d'engagement.
 *
 * Ce trajet a une limite que le texte ne relève pas : il suppose que la
 * caisse ne bouge que pour des produits, des charges et des règlements de
 * tiers. Un apport en dotation encaissé ou un véhicule payé en banque
 * gonflent ou creusent KZ sans toucher au résultat, et la maquette n'ouvre
 * aucune ligne pour les reprendre. `EtatsFinanciersSmtService` calcule ce
 * montant sous le nom de FLUX HORS EXPLOITATION, l'expose et l'utilise dans
 * le contrôle de concordance · l'état imprimé, lui, reste celui du texte.
 * Ces lignes de variation n'ont de sens que si A et B sont de vrais flux de
 * trésorerie. Les postes KA-KB et JA-JF ne sont donc **pas** lus dans les
 * soldes des classes 6 et 7 (ce serait déjà de l'engagement, et le
 * retraitement compterait deux fois) : ils sont lus dans les CONTREPARTIES
 * des mouvements de trésorerie, c'est-à-dire dans le journal unique de
 * trésorerie de la Note 4. Voir `EtatsFinanciersSmtService`.
 *
 * ## Un dossier SMT dans OmegaX reste en partie double
 *
 * OmegaX tient un livre-journal en partie double, quel que soit le jeu
 * choisi. Choisir le SMT ne bascule pas le moteur en comptabilité de caisse :
 * cela change la PRÉSENTATION des états financiers et l'obligation de
 * production (art. 5). Les deux cas fonctionnent :
 *  - dossier réellement tenu en trésorerie (achat saisi 60 / 57 directement) :
 *    la classe 4 reste vide, les variations VB/VC sont nulles, KZC = KZ - JG ;
 *  - dossier tenu en engagement (facture 60 / 401, puis règlement 401 / 57) :
 *    le règlement est la dépense de caisse, et la variation des dettes VC
 *    rétablit la charge engagée non payée. Le résultat KZC est le même. Le
 *    prix à payer est que la ventilation PAR NATURE (JA à JF) se dégrade :
 *    un règlement fournisseur ne dit pas de quelle nature de charge il
 *    s'agit, et tombe donc en JF. C'est inhérent à la maquette, pas un
 *    défaut du moteur · et le drill-down le montre compte par compte.
 */

// ---------------------------------------------------------------------------
// BILAN (Section 1)
// ---------------------------------------------------------------------------

export type SensSmt = 'ACTIF' | 'PASSIF';
export type QualificatifSensSmt = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanSmt {
  ref: string;
  libelle: string;
  sens: SensSmt;
  /** Renvoi de note tel que la maquette l'imprime · `null` quand elle n'en porte pas. */
  note: string | null;
  comptes: string[];
  exclusions?: string[];
  /** Ne retenir que les comptes dont le solde va dans ce sens (postes de tiers). */
  sens_qualificatif?: QualificatifSensSmt;
  /** Pourquoi ces comptes-là · le texte ne fournissant pas de table (voir en-tête). */
  fondement: string;
}

export const POSTES_BILAN_ACTIF: PosteBilanSmt[] = [
  {
    ref: 'GA',
    libelle: 'Immobilisations (1)',
    sens: 'ACTIF',
    note: '1',
    // Classe 2 ENTIÈRE, amortissements et dépréciations compris : la maquette
    // n'a qu'une colonne de montant (pas de Brut/Amort./Net comme le jeu
    // associations), le poste porte donc la valeur nette comptable. Les 28x et
    // 29x étant créditeurs, leur solde algébrique la réduit de lui-même.
    comptes: ['2'],
    fondement:
      "Classe 2 « Immobilisations » (Partie 2, ch. 1). Valeur nette : la maquette n'ouvre qu'une colonne de montant, et la Note 1 suit les immobilisations avec leur durée d'utilité. Renvoi (1) du texte : « A faire figurer sur l'état de situation si elles correspondent à des montants significatifs. »",
  },
  {
    ref: 'GB',
    libelle: 'Stocks',
    sens: 'ACTIF',
    note: '2',
    comptes: ['3'],
    fondement: 'Classe 3 « Stocks » (Partie 2, ch. 1), dépréciations 39 comprises, donc en valeur nette.',
  },
  {
    ref: 'GC',
    libelle: 'Adhérents, clients-usagers et autres débiteurs',
    sens: 'ACTIF',
    note: '3',
    // Classe 4 en entier, côté débiteur seulement · le poste passif HD prend
    // le côté créditeur. Aucun compte de tiers n'est perdu entre les deux.
    comptes: ['4'],
    sens_qualificatif: 'DEBITEUR',
    fondement:
      "Classe 4 « Tiers », soldes débiteurs. Le compte 41 s'intitule précisément « Adhérents, clients-usagers et comptes rattachés » (Partie 2, ch. 3) ; « et autres débiteurs » étend le poste au reste de la classe, qui n'a aucun autre poste d'accueil dans cette maquette à cinq lignes d'actif.",
  },
  {
    ref: 'GD',
    libelle: 'Caisse',
    sens: 'ACTIF',
    note: '4',
    comptes: ['57'],
    fondement: 'Compte 57 « Caisse » (Partie 2, ch. 3, COMPTE 57).',
  },
  {
    ref: 'GE',
    libelle: 'Banque (en + ou en -)',
    sens: 'ACTIF',
    note: '4',
    // Reste de la classe 5. Le « (en + ou en -) » du texte autorise
    // explicitement un solde négatif : un découvert (compte 56) reste ici et
    // n'est PAS basculé au passif, contrairement aux deux autres jeux qui ont
    // un poste de trésorerie-passif (DW). Cette maquette n'en a pas.
    comptes: ['5'],
    exclusions: ['57'],
    fondement:
      "Reste de la classe 5 « Trésorerie » : 52 Banques, 53 Établissements financiers, 55 Instruments de monnaie électronique, 56 Banques crédits de trésorerie et d'escompte, plus 50, 51, 58 et 59 qui n'ont aucun autre poste d'accueil. Le « (en + ou en -) » de la maquette autorise le solde négatif : le découvert reste à l'actif en négatif, faute de poste de trésorerie-passif dans ce jeu.",
  },
];

export const POSTES_BILAN_PASSIF: PosteBilanSmt[] = [
  {
    ref: 'HA',
    libelle: 'Dotations',
    sens: 'PASSIF',
    note: '5',
    comptes: ['10'],
    fondement:
      "Compte 10 « Dotation » (Partie 2, ch. 3, COMPTE 10). La Note 5 le confirme en le détaillant en « Dotation non consomptible / Droit d'entrée / Dotation consomptible ».",
  },
  // HB n'est PAS listé ici : il est arbitré entre les classes 6/7/8 et le
  // compte 13 selon que l'exercice est clôturé ou non · voir calculerHB()
  // dans le service, même mécanisme que CH (associations) et CC (projets).
  {
    ref: 'HC',
    libelle: 'Autres fonds propres',
    sens: 'PASSIF',
    note: null,
    comptes: ['1'],
    exclusions: ['10', '13'],
    fondement:
      "Reste de la classe 1. RÉSERVE À CONNAÎTRE : la classe 1 contient aussi le compte 18 « Emprunts et dettes assimilées » et le compte 19 « Provisions pour risques et charges », qui ne sont pas des fonds propres. La maquette du SMT n'ouvre que quatre lignes de passif et aucune ne peut les recevoir ; les laisser dehors déséquilibrerait le bilan d'un montant égal à l'emprunt. Ils sont donc rattachés ici, et le drill-down du poste les montre nommément. Une entité du SMT qui porterait un emprunt significatif dépasse en pratique les seuils de l'article 6 et relève du Système normal.",
  },
  {
    ref: 'HD',
    libelle: 'Fournisseurs et autres créditeurs',
    sens: 'PASSIF',
    note: '3',
    comptes: ['4'],
    sens_qualificatif: 'CREDITEUR',
    fondement:
      "Classe 4 « Tiers », soldes créditeurs · symétrique de GC. Le compte 40 s'intitule « Fournisseurs et comptes rattachés » (Partie 2, ch. 3), et la Note 3 nomme la colonne « NOM DES FOURNISSEURS ET AUTRES CRÉDITEURS ».",
  },
];

export interface TotalSmt {
  ref: string;
  libelle: string;
  deRefs: string[];
}

export const TOTAUX_BILAN_ACTIF: TotalSmt[] = [
  { ref: 'GZ', libelle: 'Total actif', deRefs: ['GA', 'GB', 'GC', 'GD', 'GE'] },
];

export const TOTAUX_BILAN_PASSIF: TotalSmt[] = [
  { ref: 'HZ', libelle: 'Total passif', deRefs: ['HA', 'HB', 'HC', 'HD'] },
];

export const ORDRE_BILAN_ACTIF = ['GA', 'GB', 'GC', 'GD', 'GE', 'GZ'];
export const ORDRE_BILAN_PASSIF = ['HA', 'HB', 'HC', 'HD', 'HZ'];

/** Renvoi (1) du bilan, imprimé sous l'actif · transcrit tel quel. */
export const RENVOI_IMMOBILISATIONS =
  "(1) A faire figurer sur l'état de situation si elles correspondent à des montants significatifs.";

// ---------------------------------------------------------------------------
// COMPTE DE RÉSULTAT (Section 2)
// ---------------------------------------------------------------------------

/**
 * Un poste de flux du compte de résultat SMT. `comptes` désigne ici les
 * comptes de CONTREPARTIE d'un mouvement de trésorerie (voir en-tête,
 * « Comptabilité de trésorerie »), pas des comptes dont on lirait le solde.
 */
export interface PosteFluxSmt {
  ref: string;
  libelle: string;
  sens: 'RECETTE' | 'DEPENSE';
  note: string | null;
  /** Préfixes de comptes de contrepartie captés par ce poste. */
  comptes: string[];
  exclusions?: string[];
  fondement: string;
}

export const POSTES_RECETTES: PosteFluxSmt[] = [
  {
    ref: 'KA',
    libelle: 'Revenus encaissés',
    sens: 'RECETTE',
    note: '4',
    comptes: ['70'],
    fondement:
      "Compte 70 « Revenus » (Partie 2, ch. 3, COMPTE 70) : cotisations, générosité du public, ventes, manifestations. C'est l'exacte matière des colonnes « Cotisations » et « Subventions » de la ventilation des recettes de la Note 4.",
  },
  {
    ref: 'KB',
    libelle: 'Autres recettes sur activités',
    sens: 'RECETTE',
    note: '4',
    // Tout encaissement dont la contrepartie n'est pas le compte 70 :
    // subventions (71), autres produits (75, 77, 78, 79), produits H.A.O.
    // (82, 84, 86, 88) et règlements de créances (classe 4) ou apports
    // (classe 1). Défini par exclusion pour ne rien laisser tomber.
    comptes: ['1', '2', '3', '4', '6', '7', '8'],
    exclusions: ['70'],
    fondement:
      "Toute autre contrepartie d'un encaissement : subventions (71), autres produits (75, 77, 78), produits H.A.O. (82, 84, 88), mais aussi le recouvrement d'une créance (classe 4) ou un apport en dotation (classe 1), qui sont des recettes au sens de la comptabilité de trésorerie même s'ils ne sont pas des produits. Défini par exclusion de KA pour qu'aucun encaissement ne disparaisse.",
  },
];

export const POSTES_DEPENSES: PosteFluxSmt[] = [
  {
    ref: 'JA',
    libelle: 'Dépenses sur achats',
    sens: 'DEPENSE',
    note: '4',
    comptes: ['60', '61'],
    fondement:
      "Compte 60 « Achats » et compte 61 « Transports » (Partie 2, ch. 3). La Note 4 ventile d'ailleurs les dépenses en « Achats de biens liés à l'activité », « Autres achats » et « Transport », trois colonnes que ce poste regroupe.",
  },
  {
    ref: 'JB',
    libelle: 'Dépenses sur loyers',
    sens: 'DEPENSE',
    note: '4',
    // 622 seulement. Le 623 « Redevances de location acquisition »
    // (crédit-bail, location-vente) est un financement d'immobilisation, pas
    // un loyer · il reste en JF.
    comptes: ['622'],
    fondement:
      "Compte 622 « Locations, charges locatives » (Partie 2, ch. 3, COMPTE 62), qui contient les 6221 à 6228 dont les fermages et loyers du foncier. Le 623 « Redevances de location acquisition » (crédit-bail) en est écarté : c'est un mode d'acquisition, pas un loyer.",
  },
  {
    ref: 'JC',
    libelle: 'Dépenses sur salaires',
    sens: 'DEPENSE',
    note: '4',
    comptes: ['66'],
    fondement: 'Compte 66 « Charges de personnel » (Partie 2, ch. 3, COMPTE 66).',
  },
  {
    ref: 'JD',
    libelle: 'Dépenses sur impôts et taxes',
    sens: 'DEPENSE',
    note: '4',
    comptes: ['64'],
    fondement: 'Compte 64 « Impôts et taxes » (Partie 2, ch. 3, COMPTE 64).',
  },
  {
    ref: 'JE',
    libelle: "Charges d'intérêts",
    sens: 'DEPENSE',
    note: '4',
    comptes: ['67'],
    fondement:
      "Compte 67 « Frais financiers et charges assimilées » (Partie 2, ch. 3, COMPTE 67). Le NB de la Note 4 cite nommément « Charges d'intérêts » comme colonne de ventilation à rajouter au besoin.",
  },
  {
    ref: 'JF',
    libelle: 'Autres dépenses sur activités',
    sens: 'DEPENSE',
    note: '4',
    // Défini par exclusion, comme KB : tout décaissement qui n'est ni achat,
    // ni loyer, ni salaire, ni impôt, ni intérêt. Y compris les règlements de
    // dettes (classe 4) et les acquisitions d'immobilisations (classe 2).
    comptes: ['1', '2', '3', '4', '6', '7', '8'],
    exclusions: ['60', '61', '622', '64', '66', '67'],
    fondement:
      "Tout autre décaissement : services extérieurs hors loyers (62 restant, 63), autres charges (65), charges H.A.O. (83), mais aussi l'acquisition d'une immobilisation (classe 2) et le règlement d'une dette (classe 4), qui sont des dépenses au sens de la comptabilité de trésorerie. Défini par exclusion pour qu'aucun décaissement ne disparaisse.",
  },
];

/**
 * Les quatre lignes de retraitement qui font passer du solde de caisse (KZ)
 * au résultat net (KZC). La maquette imprime elle-même l'opérateur dans le
 * libellé (« + Variations des stocks… », « - Variation des dettes… ») ;
 * `signe` le reprend pour que le total soit calculé comme la colonne se lit.
 */
export interface RetraitementSmt {
  ref: string;
  libelle: string;
  signe: 1 | -1;
  fondement: string;
}

export const RETRAITEMENTS: RetraitementSmt[] = [
  {
    ref: 'VA',
    libelle: '+ Variations des stocks sur les achats [N - (N-1)]',
    signe: 1,
    fondement:
      "Poste GB du bilan, clôture moins OUVERTURE de l'exercice (report à nouveau). Un stock qui augmente correspond à des achats décaissés mais non consommés : la dépense de caisse est retranchée du résultat, la variation la rend.",
  },
  {
    ref: 'VB',
    libelle: '+ Variation des créances [N - (N-1)]',
    signe: 1,
    fondement:
      "Poste GC du bilan, clôture moins OUVERTURE de l'exercice (report à nouveau). Une créance qui augmente correspond à un revenu acquis non encaissé : absent de A, la variation le rend.",
  },
  {
    ref: 'VC',
    libelle: "- Variation des dettes d'exploitation [N - (N-1)]",
    signe: -1,
    fondement:
      "Poste HD du bilan, clôture moins OUVERTURE de l'exercice (report à nouveau). Une dette qui augmente correspond à une charge engagée non payée : absente de B, la variation la retranche. L'opérateur « - » est celui du texte officiel.",
  },
  {
    ref: 'JG',
    libelle: 'DOTATIONS AUX AMORTISSEMENTS',
    signe: -1,
    fondement:
      "Compte 68 « Dotations aux amortissements » (Partie 2, ch. 3, COMPTE 68). Charge sans décaissement, donc absente de B : retranchée ici. La maquette n'imprime pas d'opérateur devant cette ligne, mais elle vient après le solde de caisse et ne peut que le diminuer.",
  },
];

export const COMPTES_DOTATIONS_AMORTISSEMENTS = ['68'];

// ---------------------------------------------------------------------------
// NOTE 4 · JOURNAL UNIQUE DE TRÉSORERIE (Section 3)
// ---------------------------------------------------------------------------

/**
 * Colonnes de ventilation de la Note 4, transcrites du texte :
 * « Ventilation recettes (Cotisations ; Subventions ; Autres ; Matériel
 * Mobilier et autres) » et « Ventilation dépenses (Achats de biens liés à
 * l'activité ; Autres achats ; Transport ; Services extérieurs ; Salaires ;
 * Autres) ». Elles ne recoupent PAS les postes KA-JF du compte de résultat :
 * ce sont deux découpages officiels différents, tous deux repris tels quels.
 */
export interface ColonneVentilationSmt {
  cle: string;
  libelle: string;
  comptes: string[];
  exclusions?: string[];
}

export const VENTILATION_RECETTES: ColonneVentilationSmt[] = [
  // 701 Cotisations (Partie 2, ch. 3, COMPTE 70).
  { cle: 'cotisations', libelle: 'Cotisations', comptes: ['701'] },
  // 71 Subventions d'exploitation ; 88 Subventions d'équilibre.
  { cle: 'subventions', libelle: 'Subventions', comptes: ['71', '88'] },
  // « Matériel Mobilier et autres » : côté recettes, la cession d'une
  // immobilisation · compte 82 Produits des cessions, et le compte 24
  // lui-même si la cession est saisie directement en diminution de l'actif.
  { cle: 'materiel', libelle: 'Matériel, mobilier et autres', comptes: ['82', '2'] },
  {
    cle: 'autres',
    libelle: 'Autres',
    comptes: ['1', '3', '4', '6', '7', '8'],
    exclusions: ['701', '71', '82', '88'],
  },
];

export const VENTILATION_DEPENSES: ColonneVentilationSmt[] = [
  // 601 Achats de biens liés à l'activité (Partie 2, ch. 3, COMPTE 60).
  { cle: 'achatsActivite', libelle: "Achats de biens liés à l'activité", comptes: ['601'] },
  { cle: 'autresAchats', libelle: 'Autres achats', comptes: ['60'], exclusions: ['601'] },
  { cle: 'transport', libelle: 'Transport', comptes: ['61'] },
  { cle: 'servicesExterieurs', libelle: 'Services extérieurs', comptes: ['62', '63'] },
  { cle: 'salaires', libelle: 'Salaires', comptes: ['66'] },
  {
    cle: 'autres',
    libelle: 'Autres',
    comptes: ['1', '2', '3', '4', '6', '7', '8'],
    exclusions: ['60', '61', '62', '63', '66'],
  },
];

/** NB officiel de la Note 4, imprimé sous le journal · transcrit tel quel. */
export const NB_JOURNAL_TRESORERIE =
  "NB : Prévoir un journal par banque et un journal pour la caisse. Les colonnes « ventilation recettes et dépenses » " +
  "peuvent être complétées en cas de besoin par des rajouts notamment « Charges d'intérêts ». Il est possible si " +
  'nécessaire, de regrouper les opérations mensuellement dans un seul journal de trésorerie.';

// ---------------------------------------------------------------------------
// FICHE RÉCAPITULATIVE DES NOTES ANNEXES (Section 3)
// ---------------------------------------------------------------------------

/**
 * Cinq notes, transcrites de la fiche récapitulative officielle. L'ordre
 * d'impression de la fiche est celui du texte : les notes 1, 2, 3 et 5
 * portent sur le bilan, la note 4 sur le compte de résultat · d'où le 5
 * avant le 4 dans la fiche.
 */
export interface NoteSmt {
  numero: number;
  intitule: string;
  partie: 'BILAN' | 'COMPTE_DE_RESULTAT';
}

export const NOTES_SMT: NoteSmt[] = [
  { numero: 1, intitule: "Tableau d'acquisition et de suivi du matériel, du mobilier et des cautions", partie: 'BILAN' },
  { numero: 2, intitule: 'Etat des stocks', partie: 'BILAN' },
  { numero: 3, intitule: 'Etat des créances et des dettes non échues', partie: 'BILAN' },
  { numero: 5, intitule: 'Dotations', partie: 'BILAN' },
  { numero: 4, intitule: 'Journal unique de trésorerie', partie: 'COMPTE_DE_RESULTAT' },
];

// ---------------------------------------------------------------------------
// SEUIL D'ÉLIGIBILITÉ (art. 6)
// ---------------------------------------------------------------------------

/**
 * Article 6 : cinq catégories de ressources, chacune plafonnée à trente
 * millions de francs CFA « ou l'équivalent dans l'unité monétaire ayant cours
 * légal dans l'État partie ». Le contrôle d'éligibilité les reprend une à une
 * (voir `EtatsFinanciersSmtService.eligibilite`).
 *
 * Le seuil est exprimé en FCFA par le texte. La RDC n'étant pas en zone
 * franc, la conversion en CDF dépend d'un cours qui n'appartient pas au
 * texte : le contrôle affiche donc le montant en monnaie de tenue du dossier
 * ET rappelle le seuil légal en FCFA, sans convertir à la place de l'entité.
 */
export const SEUIL_SMT_FCFA = 30_000_000;

export interface CategorieRessourceSmt {
  cle: string;
  libelle: string;
  comptes: string[];
  exclusions?: string[];
}

export const CATEGORIES_RESSOURCES_ART6: CategorieRessourceSmt[] = [
  // 1) subventions
  { cle: 'subventions', libelle: 'Subventions', comptes: ['71', '88'] },
  // 2) cotisations et autres revenus · compte 70 hors la générosité (704),
  //    que le point 3 traite séparément.
  { cle: 'cotisationsRevenus', libelle: 'Cotisations et autres revenus', comptes: ['70'], exclusions: ['704'] },
  // 3) dons et/ou legs · 704 Générosité du public (dons, legs, denier du
  //    culte, zakat, dîme, mécénat, parrainage), voir Partie 3, ch. 4.
  { cle: 'donsLegs', libelle: 'Dons et legs', comptes: ['704'] },
  // 4) ressources du projet de développement · 702 Fonds d'administration
  //    reçus du bailleur (Partie 3, ch. 3).
  { cle: 'ressourcesProjet', libelle: 'Ressources du projet de développement', comptes: ['702'] },
  // 5) autres ressources · le reste de la classe 7 et les produits H.A.O.
  { cle: 'autresRessources', libelle: 'Autres ressources', comptes: ['7', '84'], exclusions: ['70', '71'] },
];
