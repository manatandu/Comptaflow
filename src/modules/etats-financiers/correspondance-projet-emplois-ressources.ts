/**
 * TABLEAU EMPLOIS-RESSOURCES · jeu SYCEBNL « projets de développement et
 * assimilés », codes REF FA à GZ.
 *
 * ## La source, et pourquoi ce fichier n'existait pas jusqu'ici
 *
 * Le chapitre 3 de la Partie 4 donne la MAQUETTE de ce tableau mais aucun
 * rattachement aux comptes, contrairement au bilan et au compte
 * d'exploitation du même chapitre. C'est pour cette raison que le tableau
 * était déclaré hors périmètre dans `etats-financiers-projet.service.ts` :
 * le construire aurait exigé d'inventer la correspondance.
 *
 * Cette correspondance existe, ailleurs : **Guide d'application du SYCEBNL,
 * chapitre 7, APPLICATION 21**, qui donne poste par poste la source dans la
 * balance. Le guide est un document officiel au même titre que l'annexe. Le
 * tableau ci-dessous en est la transcription.
 *
 * ## Ce que le guide demande, et qui n'est pas trivial
 *
 * Ce tableau n'est PAS une lecture de soldes. Il lit des MOUVEMENTS de la
 * balance (crédit pour les ressources, débit pour les emplois), puis les
 * corrige des variations de dettes pour ne retenir que ce qui a été
 * réellement encaissé ou décaissé. Ce sont les renvois (1) à (8) du guide,
 * transcrits dans `deductions` ci-dessous. Sans eux, une facture
 * d'investissement reçue et non payée gonflerait les emplois sans sortie de
 * trésorerie, et le contrôle final GZ (V = VI) ne boucherait plus.
 *
 * ## Anomalie du guide, signalée et corrigée en connaissance de cause
 *
 * `[texte officiel]` Les renvois (3) à (7) demandent de déduire
 * « + solde DÉBITEUR N-1 du compte 401 / 44 / 42 / 43 / 4813 − solde DÉBITEUR
 * N ». Or ces comptes sont des comptes de DETTES, dont le solde normal est
 * créditeur : lus à la lettre, ces renvois ne retrancheraient jamais rien.
 *
 * Le renvoi (2), qui traite exactement le même mécanisme pour le compte 481,
 * écrit lui « + solde CRÉDITEUR N-1 − solde CRÉDITEUR N ». Et le sens
 * économique ne laisse pas de doute : l'emploi décaissé vaut la charge
 * engagée moins l'augmentation de la dette, soit « charge + dette N-1 −
 * dette N ». C'est donc une coquille du guide, et le sens créditeur est
 * retenu partout. Le choix est écrit ici pour pouvoir être discuté, et non
 * enfoui dans le code.
 */

export type SensMouvement = 'DEBIT' | 'CREDIT';

/**
 * Une correction du guide, appliquée à un poste d'emploi.
 *
 * DEUX opérations distinctes, à ne pas confondre · c'est le piège de ces
 * renvois :
 *
 *  - `AJOUTER_VARIATION` (renvois 2 à 7) : le guide écrit « Déduire la
 *    variation des dettes (+ solde créditeur N-1 − solde créditeur N) ». La
 *    parenthèse n'est pas la quantité à soustraire, c'est la FORMULE de la
 *    correction : emploi décaissé = charge engagée + dette N-1 − dette N.
 *    Une dette qui augmente de 50 000 sur une charge de 200 000 donne bien
 *    150 000 décaissés. Lire la parenthèse comme une quantité à retrancher
 *    donnerait 250 000, soit plus que la charge elle-même.
 *  - `RETRANCHER_MOUVEMENT` (renvoi 8) : « Déduire le mouvement crédit du
 *    compte 166 ». Là, c'est bien une soustraction sèche d'un mouvement.
 */
export type OperationCorrection = 'AJOUTER_VARIATION' | 'RETRANCHER_MOUVEMENT';

export interface DeductionEmploisRessources {
  comptes: string[];
  exclusions?: string[];
  operation: OperationCorrection;
  /** Renvoi du guide dont cette correction est issue, cité pour la traçabilité. */
  renvoi: string;
}

export interface PosteEmploisRessources {
  ref: string;
  libelle: string;
  /** Section du tableau · commande le regroupement dans les totaux. */
  section: 'RESSOURCES' | 'IMMOBILISATIONS' | 'CHARGES' | 'FONDS_DEBUT' | 'FONDS_FIN';
  sens: SensMouvement;
  comptes: string[];
  exclusions?: string[];
  /** Poste lu en SOLDE et non en mouvement (FT, et les fonds disponibles). */
  lectureSolde?: 'DEBITEUR_CLOTURE' | 'DEBITEUR_OUVERTURE';
  deductions?: DeductionEmploisRessources[];
  fondement: string;
}

// ---------------------------------------------------------------------------
// I. RESSOURCES (FA à FD)
// ---------------------------------------------------------------------------

export const POSTES_RESSOURCES: PosteEmploisRessources[] = [
  {
    ref: 'FA',
    libelle: 'Fonds reçus, Bailleurs',
    section: 'RESSOURCES',
    sens: 'CREDIT',
    comptes: ['161', '162', '462'],
    fondement:
      "Guide d'application, Application 21 : « Balance mouvement crédit : comptes 161, 162, 462 (si plusieurs bailleurs, créer des sous-comptes de 161, 162, 462 pour remplir FB) ».",
  },
  {
    ref: 'FC',
    libelle: 'Fonds contrepartie État',
    section: 'RESSOURCES',
    sens: 'CREDIT',
    comptes: ['163', '463'],
    fondement: "Guide d'application, Application 21 : « Balance mouvement crédit : comptes 163, 463 ».",
  },
  {
    ref: 'FD',
    libelle: 'Autres fonds reçus',
    section: 'RESSOURCES',
    sens: 'CREDIT',
    comptes: ['164', '464', '707', '77'],
    fondement:
      "Guide d'application, Application 21 : « Balance mouvement crédit : comptes 164, 464, 707 (1), 77 ». Renvoi (1) : « Produits d'exploitation à recevoir en cas de vente de cahier de charges, location de voiture, sous-location de bureau, etc. »",
  },
];

// ---------------------------------------------------------------------------
// A. TOTAL DES IMMOBILISATIONS (FE à FL)
// ---------------------------------------------------------------------------

/** Renvoi (2), commun aux postes FE à FJ. */
const DEDUCTION_DETTES_INVESTISSEMENT: DeductionEmploisRessources = {
  comptes: ['481'],
  exclusions: ['4813'],
  operation: 'AJOUTER_VARIATION',
  renvoi:
    "Renvoi (2) : « Déduire la variation des dettes fournisseurs d'investissements (+ solde créditeur N-1 du compte 481 concerné sauf 4813 − solde créditeur N du compte 481 concerné sauf 4813). »",
};

export const POSTES_IMMOBILISATIONS: PosteEmploisRessources[] = [
  {
    ref: 'FE',
    libelle: 'Immobilisations incorporelles',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['21'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « Balance mouvement débit : compte 21 (2) ».",
  },
  {
    ref: 'FF',
    libelle: 'Terrains',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['22'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « Balance mouvement débit : compte 22 (2) ».",
  },
  {
    ref: 'FG',
    libelle: 'Bâtiments',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['231', '232', '233', '2391', '2392', '2393', '2396'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « comptes 231, 232, 233, 2391, 2392, 2393, 2396 (2) ».",
  },
  {
    ref: 'FH',
    libelle: 'Aménagements, agencements et installations',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['234', '235', '238', '2394', '2395', '2398'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « comptes 234, 235, 238, 2394, 2395, 2398 (2) ».",
  },
  {
    ref: 'FI',
    libelle: 'Matériel, mobilier et actifs biologiques',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['24'],
    exclusions: ['245', '2495'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « comptes 24 (sauf 245 et 2495) (2) ».",
  },
  {
    ref: 'FJ',
    libelle: 'Matériel de transport',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['245', '2495'],
    deductions: [DEDUCTION_DETTES_INVESTISSEMENT],
    fondement: "Application 21 : « comptes 245 et 2495 (2) ».",
  },
  {
    ref: 'FK',
    libelle: 'Avances et acomptes versés sur immobilisations',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    comptes: ['25'],
    // Aucun renvoi sur ce poste dans le guide · une avance EST un décaissement.
    fondement: "Application 21 : « Balance mouvement débit : comptes 25 ».",
  },
  {
    ref: 'FL',
    libelle: 'Immobilisations financières',
    section: 'IMMOBILISATIONS',
    sens: 'DEBIT',
    // Renvoi (3) : « ne pas tenir compte du mouvement débit du compte 276
    // (intérêts courus sur immobilisations financières) ».
    comptes: ['26', '27'],
    exclusions: ['276'],
    deductions: [
      {
        comptes: ['4813'],
        operation: 'AJOUTER_VARIATION',
        renvoi:
          "Renvoi (3) : « Déduire la variation des dettes rattachées aux versements restant à effectuer sur titres de participation et titres immobilisés non libérés » (compte 4813). Voir l'anomalie signalée en tête de fichier sur le sens débiteur/créditeur.",
      },
    ],
    fondement: "Application 21 : « Balance mouvement débit : comptes 26, 27 (3) ».",
  },
];

// ---------------------------------------------------------------------------
// B. TOTAL DES CHARGES DE FONCTIONNEMENT (FM à FT)
// ---------------------------------------------------------------------------

/** Renvoi (4), commun aux postes FM, FN et FO. */
const DEDUCTION_DETTES_EXPLOITATION: DeductionEmploisRessources = {
  comptes: ['401'],
  operation: 'AJOUTER_VARIATION',
  renvoi:
    "Renvoi (4) : « Déduire la variation des dettes fournisseurs d'exploitation. En sus, ne pas tenir compte de la variation des stocks (compte 603) figurant dans le compte 60 Achats, ni des comptes 60 Achats et dettes équivalentes transférés en immobilisations (livraison à soi-même). »",
};

export const POSTES_CHARGES: PosteEmploisRessources[] = [
  {
    ref: 'FM',
    libelle: 'Achats de biens et services',
    section: 'CHARGES',
    sens: 'DEBIT',
    // Renvoi (4) : le 603 (variations de stocks) est expressément écarté du
    // compte 60 · ce n'est pas un achat décaissé mais un retraitement de
    // stock.
    comptes: ['60'],
    exclusions: ['603'],
    deductions: [DEDUCTION_DETTES_EXPLOITATION],
    fondement: "Application 21 : « Balance mouvement débit : compte 60 (4) ».",
  },
  {
    ref: 'FN',
    libelle: 'Transports',
    section: 'CHARGES',
    sens: 'DEBIT',
    comptes: ['61'],
    deductions: [DEDUCTION_DETTES_EXPLOITATION],
    fondement: "Application 21 : « Balance mouvement débit : compte 61 (4) ».",
  },
  {
    ref: 'FO',
    libelle: 'Services extérieurs',
    section: 'CHARGES',
    sens: 'DEBIT',
    comptes: ['62', '63'],
    deductions: [DEDUCTION_DETTES_EXPLOITATION],
    fondement: "Application 21 : « Balance mouvement débit : comptes 62, 63 (4) ».",
  },
  {
    ref: 'FP',
    libelle: 'Impôts et taxes',
    section: 'CHARGES',
    sens: 'DEBIT',
    comptes: ['64'],
    deductions: [
      {
        comptes: ['44'],
        operation: 'AJOUTER_VARIATION',
        renvoi: "Renvoi (5) : « Déduire la variation des dettes fiscales » (compte 44).",
      },
    ],
    fondement: "Application 21 : « Balance mouvement débit : compte 64 (5) ».",
  },
  {
    ref: 'FQ',
    libelle: 'Autres charges',
    section: 'CHARGES',
    sens: 'DEBIT',
    // Renvoi (6) : « ne pas tenir compte des dépréciations et provisions à
    // court terme (comptes 49) » · le 659 est la charge correspondante.
    comptes: ['65'],
    exclusions: ['659'],
    deductions: [
      {
        comptes: ['47'],
        operation: 'AJOUTER_VARIATION',
        renvoi:
          "Renvoi (6) : « Déduire la variation des dettes rattachées au compte 65 Autres charges. En sus, ne pas tenir compte des comptes Autres charges transférés en immobilisations ni des dépréciations et provisions à court terme (comptes 49). » Le guide ne nomme pas le compte de tiers concerné (« le compte de tiers concerné ») : le 47 Débiteurs et créditeurs divers est retenu, c'est celui que la Partie 2 associe aux autres charges.",
      },
    ],
    fondement: "Application 21 : « Balance mouvement débit : compte 65 (6) ».",
  },
  {
    ref: 'FR',
    libelle: 'Charges de personnel',
    section: 'CHARGES',
    sens: 'DEBIT',
    comptes: ['66'],
    deductions: [
      {
        comptes: ['42', '43'],
        operation: 'AJOUTER_VARIATION',
        renvoi:
          "Renvoi (7) : « Déduire la variation des dettes rattachées aux charges de personnel » (comptes 42 et 43).",
      },
    ],
    fondement: "Application 21 : « Balance mouvement débit : compte 66 (7) ».",
  },
  {
    ref: 'FS',
    libelle: 'Charges financières',
    section: 'CHARGES',
    sens: 'DEBIT',
    // Renvoi (8) : « ne pas tenir compte des dépréciations et provisions à
    // court terme (comptes 49) ».
    comptes: ['67'],
    exclusions: ['679'],
    deductions: [
      {
        comptes: ['166'],
        operation: 'RETRANCHER_MOUVEMENT',
        renvoi:
          "Renvoi (8) : « Déduire le mouvement crédit du compte 166. » Seule déduction du guide qui porte sur un MOUVEMENT et non sur une variation de solde · elle est traitée comme telle.",
      },
    ],
    fondement: "Application 21 : « Balance mouvement débit : compte 67 (8) ».",
  },
  {
    ref: 'FT',
    libelle: 'Avances sur charges (à justifier)',
    section: 'CHARGES',
    sens: 'DEBIT',
    comptes: ['4091', '4093'],
    // Seul poste d'emploi lu en SOLDE et non en mouvement · le guide écrit
    // « Balance solde débiteur », et c'est logique : une avance non encore
    // justifiée est une position, pas un flux de la période.
    lectureSolde: 'DEBITEUR_CLOTURE',
    fondement: "Application 21 : « Balance solde débiteur : comptes 4091, 4093 ».",
  },
];

// ---------------------------------------------------------------------------
// FONDS DISPONIBLES (FU à FZ)
// ---------------------------------------------------------------------------

/**
 * Comptes de trésorerie du projet · le guide écrit « comptes 51, 52, 53, 55,
 * 57 » pour les six postes FU à FZ, la seule différence entre eux étant la
 * NATURE DU FONDS (bailleur, contrepartie État, autres) et la DATE
 * (ouverture pour FU-FW, clôture pour FX-FZ).
 *
 * La ventilation par nature de fonds suppose de savoir quel compte de
 * trésorerie porte quel fonds. OmegaX le sait pour les fonds bailleurs :
 * `Compte.bailleurId` rattache un compte à un bailleur, et le schéma pose
 * explicitement que ce rattachement n'est pas réservé aux comptes 16x/46x.
 * Il ne le sait PAS pour la contrepartie État, qu'aucun modèle ne désigne :
 * le poste correspondant reste donc à zéro et l'état le déclare, plutôt que
 * de répartir au jugé. Le total (GW et GY) est juste dans tous les cas, et
 * c'est lui qui porte le contrôle GZ.
 */
export const COMPTES_TRESORERIE_PROJET = ['51', '52', '53', '55', '57'];

export interface TotalEmploisRessources {
  ref: string;
  libelle: string;
  deRefs: string[];
}

export const TOTAUX: TotalEmploisRessources[] = [
  { ref: 'GR', libelle: 'I. RESSOURCES', deRefs: ['FA', 'FB', 'FC', 'FD'] },
  { ref: 'GS', libelle: 'A- TOTAL DES IMMOBILISATIONS', deRefs: ['FE', 'FF', 'FG', 'FH', 'FI', 'FJ', 'FK', 'FL'] },
  { ref: 'GT', libelle: 'B- TOTAL DES CHARGES DE FONCTIONNEMENT', deRefs: ['FM', 'FN', 'FO', 'FP', 'FQ', 'FR', 'FS', 'FT'] },
  { ref: 'GU', libelle: 'II. EMPLOIS (A+B)', deRefs: ['GS', 'GT'] },
  { ref: 'GW', libelle: 'IV. FONDS DISPONIBLE EN DEBUT EXERCICE', deRefs: ['FU', 'FV', 'FW'] },
  { ref: 'GY', libelle: 'VI. FONDS DISPONIBLE EN FIN EXERCICE', deRefs: ['FX', 'FY', 'FZ'] },
];

/** Ordre d'impression officiel · détail et totaux mêlés, comme la maquette. */
export const ORDRE_AFFICHAGE = [
  'FA', 'FB', 'FC', 'FD', 'GR',
  'FE', 'FF', 'FG', 'FH', 'FI', 'FJ', 'FK', 'FL', 'GS',
  'FM', 'FN', 'FO', 'FP', 'FQ', 'FR', 'FS', 'FT', 'GT',
  'GU', 'GV',
  'FU', 'FV', 'FW', 'GW', 'GX',
  'FX', 'FY', 'FZ', 'GY', 'GZ',
];

export const LIBELLES_CALCULES: Record<string, string> = {
  GV: 'III. EXCEDENT / DEFICIT DES FONDS RECUS SUR LES EMPLOIS (I-II)',
  GX: "V. MONTANT NET DE L'ENCAISSE DISPONIBLE (III+IV)",
  GZ: 'VII. CONTRÔLE : TOTAL V = TOTAL VI',
  FB: 'Fonds reçus, Bailleurs',
  FU: 'Fonds Bailleur en début exercice N',
  FV: 'Fonds de contrepartie État en début exercice N',
  FW: 'Autres fonds en début exercice N',
  FX: 'Fonds Bailleur en fin exercice N',
  FY: 'Fonds de contrepartie État en fin exercice N',
  FZ: 'Autres fonds en fin exercice N',
};
