import { SpecificationNote } from './note-annexe.types';

/**
 * NOTES ANNEXES du jeu SYCEBNL « associations et ordres professionnels ».
 *
 * Source : skill `sycebnl`, `references/partie4-ch2-etats-associations.md`,
 * section 4 (Journal officiel OHADA, n° spécial du 22 février 2023, Partie 4,
 * chapitre 2). Titres, libellés de rubriques, colonnes et commentaires sont
 * transcrits mot pour mot.
 *
 * ## Le rattachement aux comptes n'est PAS donné par le texte
 *
 * Contrairement au bilan et au compte de résultat, les notes n'ont pas de
 * tableau de correspondance officiel : elles n'énumèrent que des libellés.
 * Deux conséquences, tenues fermement ici (règle §2.6) :
 *
 * 1. Un rattachement n'est écrit que lorsqu'il découle **sans jugement** du
 *    plan de comptes normalisé (Partie 2, ch. 2) : le libellé de la rubrique
 *    est celui du compte, au même niveau de subdivision. C'est le cas de
 *    toutes les notes de trésorerie ci-dessous, où le plan descend au
 *    divisionnaire (501 à 508, 513 à 518, 521 à 526…).
 * 2. Quand la rubrique réclame une finesse que le plan normalisé n'a pas, elle
 *    porte `subdivisionAttendue` et reste **non rattachée**. Elle apparaît
 *    dans la note en attente, jamais à zéro. Exemple documenté : la Note 24
 *    « Achats » veut des lignes séparées pour « Matières consommables »,
 *    « Produits d'entretien », « Eau », « Électricité »… alors que le plan
 *    s'arrête au compte 604. Les rattacher au jugé serait une invention ; les
 *    rattacher par ressemblance de libellé serait pire — « Matières
 *    consommables » existe au plan en compte 331, qui est un compte de STOCK.
 *
 * ## Rubriques créditrices intercalées dans une note d'actif
 *
 * Plusieurs notes mêlent, dans un même tableau, des rubriques débitrices et des
 * rubriques créditrices — la Note 9 énumère les créances sur les adhérents PUIS
 * les avances qu'ils ont versées. Ces dernières portent `sens: 'CREDITEUR'`,
 * qui fait deux choses à la fois : ne retenir que les soldes créditeurs, et
 * présenter le montant en positif dans son sens de lecture, comme la maquette.
 * Sans ce qualificatif elles ressortaient en négatif — défaut attrapé par un
 * test avant livraison.
 *
 * ## Ordre des rubriques
 *
 * L'ordre est celui du texte, y compris quand une note mêle des postes
 * d'actif et de passif (Note 9, Note 19) : la maquette officielle le fait.
 * Les index de `totalDeRubriques` renvoient à la position dans ce même
 * tableau, et ne référencent jamais une rubrique postérieure — vérifié par un
 * test structurel.
 */

const COLONNES_STANDARD = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

const COLONNES_AVEC_ECHEANCES_CREANCES = [
  ...COLONNES_STANDARD,
  { type: 'ECHEANCE_1AN' as const, libelle: 'Créances à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Créances à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Créances à plus de deux ans' },
];

/** Même ventilation, côté passif — notes 18A et 19 à 21. */
const COLONNES_AVEC_ECHEANCES_DETTES = [
  ...COLONNES_STANDARD,
  { type: 'ECHEANCE_1AN' as const, libelle: 'Dettes à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Dettes à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Dettes à plus de deux ans' },
];

/**
 * Colonnes des TABLEAUX DE SITUATIONS ET MOUVEMENTS (notes 5A à 5F, 30).
 * Le texte officiel nomme lui-même les colonnes A, B, C et pose « D = A + B - C ».
 */
const COLONNES_MOUVEMENTS = [
  { type: 'OUVERTURE' as const, libelle: "A — Montant brut à l'ouverture" },
  { type: 'AUGMENTATIONS' as const, libelle: 'AUGMENTATIONS B' },
  { type: 'DIMINUTIONS' as const, libelle: 'DIMINUTIONS C' },
  { type: 'CLOTURE' as const, libelle: 'D = A + B - C (Montant brut à la clôture)' },
];

/**
 * Rubrique que le plan de comptes NORMALISÉ ne permet pas de déterminer : le
 * dossier doit y rattacher ses propres sous-comptes (voir `RattachementNote`).
 * Le texte passé en second argument est montré tel quel à l'utilisateur.
 */
function enAttente(cle: string, libelle: string, attendu: string) {
  return { cle, libelle, subdivisionAttendue: attendu };
}

export const NOTES_ASSOCIATIONS: SpecificationNote[] = [
  {
    code: '7',
    titre: 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BA', 'DF'],
    rubriques: [
      { libelle: "Créances sur cessions d'immobilisations", comptes: ['485'] },
      { libelle: "Créances reçues par dons et legs d'immobilisations", comptes: ['4865'] },
      { libelle: 'Autres créances hors activités ordinaires', comptes: ['488'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2] },
      { libelle: 'Dépréciations des créances HAO', comptes: ['498'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [3, 4] },
      { libelle: "Fournisseurs d'investissements", comptes: ['481'], sens: 'CREDITEUR' },
      { libelle: "Dettes sur dons et legs d'immobilisations", comptes: ['4861'], sens: 'CREDITEUR' },
      { libelle: 'Autres dettes hors activités ordinaires', comptes: ['484', '488'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES CIRCULANTES HAO', totalDeRubriques: [6, 7, 8] },
    ],
    commentaire:
      "commenter toute variation significative ; dépréciations : indiquer les événements et circonstances ; indiquer la date et la nature de l'immobilisation achetée et/ou cédée.",
  },

  {
    code: '11',
    titre: 'TITRES DE PLACEMENT',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BU'],
    rubriques: [
      { libelle: 'Titres de trésor et bons de caisse à court terme', comptes: ['501'] },
      { libelle: 'Actions', comptes: ['502'] },
      { libelle: 'Obligations', comptes: ['503'] },
      { libelle: 'Bons de souscription', comptes: ['504'] },
      { libelle: 'Titres négociables hors région', comptes: ['505'] },
      { libelle: 'Intérêts courus', comptes: ['506'] },
      { libelle: 'Autres valeurs assimilées', comptes: ['508'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Dépréciations des titres de placement', comptes: ['590'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [7, 8] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },

  {
    code: '12',
    titre: 'VALEURS A ENCAISSER',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BV'],
    rubriques: [
      { libelle: 'Chèques à encaisser', comptes: ['513'] },
      { libelle: "Chèques à l'encaissement", comptes: ['514'] },
      { libelle: 'Cartes de crédit à encaisser', comptes: ['515'] },
      { libelle: 'Autres valeurs à encaisser', comptes: ['518'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3] },
      { libelle: 'Dépréciations des valeurs à encaisser', comptes: ['591'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [4, 5] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },

  {
    code: '13',
    titre: 'DISPONIBILITES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BW'],
    rubriques: [
      { libelle: 'Banques locales', comptes: ['521'] },
      { libelle: 'Banques autres états région', comptes: ['522'] },
      { libelle: 'Banques, dépôt à terme', comptes: ['525'] },
      // 523 (autres États zone monétaire) et 524 (hors zone monétaire) : le
      // texte de la note ne leur donne pas de ligne propre et les regroupe
      // sous « Autres Banques ».
      { libelle: 'Autres Banques', comptes: ['523', '524'] },
      { libelle: 'Banques intérêts courus', comptes: ['526'] },
      { libelle: 'Banques Postales', comptes: ['531'] },
      { libelle: 'Autres établissement financiers', comptes: ['532', '533', '538'] },
      { libelle: 'Etablissement financiers intérêts courus', comptes: ['536'] },
      { libelle: 'Instruments de monnaie électronique', comptes: ['55'] },
      { libelle: 'Caisse', comptes: ['57'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { libelle: 'Dépréciations', comptes: ['592', '593', '595'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [10, 11] },
    ],
    commentaire:
      'indiquer la date de rapprochement des comptes bancaires ; indiquer la date d’inventaire de la caisse et des instruments de monnaie électronique ; justifier toute variation significative.',
  },

  {
    code: '9',
    titre: 'ADHERENTS, CLIENTS-USAGERS',
    colonnes: COLONNES_AVEC_ECHEANCES_CREANCES,
    renvoyeeDepuis: ['BD', 'DG'],
    rubriques: [
      { libelle: 'Adhérents', comptes: ['411'] },
      { libelle: 'Clients-usagers', comptes: ['412'] },
      { libelle: 'Adhérents, clients-usagers, chèques, effets et autres valeurs impayés', comptes: ['416'] },
      { libelle: 'Adhérents, créances litigieuses ou douteuses', comptes: ['417'] },
      { libelle: 'Adhérents, clients-usagers, produits à recevoir', comptes: ['418'] },
      { libelle: 'TOTAL BRUT ADHERENTS, CLIENTS-USAGERS', totalDeRubriques: [0, 1, 2, 3, 4] },
      { libelle: 'Dépréciations des comptes adhérents et clients-usagers', comptes: ['491'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [5, 6] },
      { libelle: 'Adhérents, avances reçues', comptes: ['4191'], sens: 'CREDITEUR' },
      { libelle: 'Clients-usagers, avances et acomptes reçus', comptes: ['4192'], sens: 'CREDITEUR' },
      { libelle: 'Autres clients créditeurs', comptes: ['419'], exclusions: ['4191', '4192'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL CLIENTS CREDITEURS', totalDeRubriques: [8, 9, 10] },
    ],
    commentaire:
      'commenter toute variation significative ; commenter les créances anciennes ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },
  {
    code: '24',
    titre: 'ACHATS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TA', 'TC', 'TD'],
    // C'est la note qui a révélé la nécessité d'une couche de rattachement :
    // elle veut vingt-et-une lignes de détail là où le plan normalisé s'arrête
    // aux comptes 601, 602, 604, 605, 606 et 608. Seuls les quatre premiers
    // blocs et les deux derniers sont déterminables ; tout le bloc central
    // suppose des sous-comptes du dossier.
    rubriques: [
      enAttente(
        'biens-services-etat-partie',
        "Achats de biens et services liés à l'activité dans l'Etat partie",
        "Sous-compte de 601 réservé aux achats réalisés dans l'État partie.",
      ),
      enAttente(
        'biens-services-region',
        "Achats de biens et services liés à l'activité dans les autres Etats parties de la Région",
        'Sous-compte de 601 réservé aux achats réalisés dans les autres États parties de la Région.',
      ),
      enAttente(
        'biens-services-hors-region',
        "Achats de biens et services liés à l'activité hors Région",
        'Sous-compte de 601 réservé aux achats réalisés hors Région.',
      ),
      { libelle: "TOTAL : ACHATS DE BIENS ET SERVICES LIES A L'ACTIVITE", totalDeRubriques: [0, 1, 2] },
      enAttente(
        'marchandises-etat-partie',
        "Achats de marchandises et matières premières dans l'Etat partie",
        "Sous-compte de 602 réservé aux achats réalisés dans l'État partie.",
      ),
      enAttente(
        'marchandises-region',
        'Achats de marchandises et matières premières dans les autres Etats parties de la Région',
        'Sous-compte de 602 réservé aux achats réalisés dans les autres États parties de la Région.',
      ),
      enAttente(
        'marchandises-hors-region',
        'Achats de marchandises et matières premières hors Région',
        'Sous-compte de 602 réservé aux achats réalisés hors Région.',
      ),
      { libelle: 'TOTAL : ACHATS MARCHANDISES ET MATIERES PREMIERES', totalDeRubriques: [4, 5, 6] },
      // Le plan SYCEBNL s'arrête à « 604 Achats stockés de matières et
      // fournitures consommables », sans subdivision. Un rapprochement par
      // ressemblance de libellé serait pire que rien : « Matières consommables »
      // existe au plan en compte 331, qui est un compte de STOCK.
      enAttente('matieres-consommables', 'Matières consommables', 'Sous-compte de 604 pour les matières consommables.'),
      enAttente('matieres-combustibles', 'Matières combustibles', 'Sous-compte de 604 pour les matières combustibles.'),
      enAttente('produits-entretien', "Produits d'entretien", "Sous-compte de 604 pour les produits d'entretien."),
      enAttente(
        'fournitures-atelier',
        "Fournitures d'atelier, d'usine et de magasin",
        "Sous-compte de 604 pour les fournitures d'atelier, d'usine et de magasin.",
      ),
      enAttente('eau', 'Eau', 'Sous-compte de 605 pour la consommation d’eau.'),
      enAttente('electricite', 'Electricité', 'Sous-compte de 605 pour la consommation d’électricité.'),
      enAttente('autres-energies', 'Autres énergies', 'Sous-compte de 605 pour les autres énergies.'),
      enAttente('fourniture-entretien', "Fourniture d'entretien", "Sous-compte de 605 pour les fournitures d'entretien."),
      enAttente('fourniture-bureau', 'Fourniture de bureau', 'Sous-compte de 605 pour les fournitures de bureau.'),
      enAttente('petit-materiel', 'Petit matériel et outillages', 'Sous-compte de 605 pour le petit matériel et l’outillage.'),
      { libelle: 'Achats autres activités', comptes: ['606'] },
      enAttente(
        'achats-etudes',
        'Achats études, prestations de services, de travaux matériels et équipements',
        'Sous-compte de 605 pour les achats d’études, prestations de services, travaux et équipements.',
      ),
      { libelle: "Achats d'emballages", comptes: ['608'] },
      enAttente('frais-sur-achats', 'Frais sur achats', 'Sous-compte de 605 pour les frais accessoires sur achats.'),
      // 619 au plan officiel — « rabais, remises et ristournes obtenus (non
      // ventilés) », présenté en soustraction des achats.
      { libelle: 'Rabais, remises et ristournes obtenus', comptes: ['619'], presenterEnNegatif: true },
      { libelle: 'TOTAL AUTRES ACHATS', totalDeRubriques: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature des fournitures ; détailler achats autres activités.',
  },

  // ======================================================================
  // TABLEAUX DE SITUATIONS ET MOUVEMENTS
  //
  // A = report à-nouveau (l'ouverture) ; B et C = mouvements PROPRES de
  // l'exercice ; D = A + B - C, recalculé. La distinction report/mouvements
  // vient de `EcritureService.balance` : sans elle, un bâtiment détenu depuis
  // 2020 serait présenté en acquisition de l'exercice.
  //
  // Découpage des comptes de la classe 2 (Partie 2, ch. 2). Trois rubriques
  // de la maquette n'ont PAS de compte au plan normalisé — « immeuble de
  // placement » n'est subdivisé qu'à l'actif brut (2281, 2315, 2325, 2396),
  // jamais dans les amortissements (28) ni dans les dépréciations (29). Elles
  // sont donc déclarées en attente de rattachement, pas rattachées au jugé.
  // ======================================================================
  {
    code: '5B',
    titre: 'IMMOBILISATIONS BRUTES',
    colonnes: COLONNES_MOUVEMENTS,
    renvoyeeDepuis: ['AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM'],
    rubriques: [
      { libelle: 'Brevets, licences et droits similaires', comptes: ['212'] },
      { libelle: 'Logiciels et sites internet', comptes: ['213'] },
      { libelle: 'Avances et acomptes sur immobilisations incorporelles', comptes: ['251'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['214', '218', '219'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2, 3] },
      // 2281 « Terrains - immeubles de placement » est le SEUL divisionnaire
      // de placement de la classe 22 : la rubrique « hors placement » est donc
      // tout le reste de 22, et l'exclusion suffit à la déterminer.
      { libelle: 'Terrains hors immeuble de placement', comptes: ['22'], exclusions: ['2281'] },
      { libelle: 'Terrains - immeuble de placement', comptes: ['2281'] },
      {
        libelle: 'Bâtiments hors immeuble de placement',
        comptes: ['231', '232', '233', '2391', '2392', '2393'],
        exclusions: ['2315', '2325'],
      },
      { libelle: 'Bâtiments - immeuble de placement', comptes: ['2315', '2325', '2396'] },
      { libelle: 'Aménagements, agencements et installations', comptes: ['234', '235', '238', '2394', '2395', '2398'] },
      {
        libelle: 'Matériel, mobilier et actifs biologiques',
        comptes: ['241', '242', '243', '244', '246', '247', '248', '249'],
        exclusions: ['2495'],
      },
      { libelle: 'Matériel de transport', comptes: ['245', '2495'] },
      { libelle: 'Avances et acomptes sur immobilisations corporelles', comptes: ['252'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [5, 6, 7, 8, 9, 10, 11, 12] },
      { libelle: 'Titres de participation', comptes: ['26'] },
      { libelle: 'Autres immobilisations financières', comptes: ['27'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS FINANCIERES', totalDeRubriques: [14, 15] },
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [4, 13, 16] },
    ],
    commentaire:
      'toute variation significative doit être commentée ; pour les banques, DAT indiquer le nom de la banque, ' +
      'le montant et la date d\'échéance ; donner le détail des produits et charges liés aux immeubles de placement.',
  },
  {
    code: '5E',
    titre: 'IMMOBILISATIONS (AMORTISSEMENTS)',
    sensAccroissement: 'CREDIT',
    // Le texte officiel donne CINQ colonnes et la formule « E = A + B - C - D »,
    // où D est « Virements de poste à poste ».
    //
    // [texte officiel] Deux difficultés, signalées et non corrigées :
    //   1. La formule retranche D. Un virement de poste à poste est pourtant
    //      un transfert : ce qui sort d'un poste entre dans un autre, et la
    //      colonne ne peut être soustraite des deux côtés sans déséquilibrer
    //      le tableau. La note 5A, qui traite le même sujet, place au contraire
    //      les « Virements de poste à poste » DANS les augmentations B ET dans
    //      les diminutions C. La formule de la 5E est reproduite telle quelle.
    //   2. Un virement de poste à poste ne se distingue pas, en balance, d'un
    //      mouvement ordinaire : les deux sont un débit et un crédit sur des
    //      comptes d'amortissement. La colonne D est donc déclarée LIBRE
    //      (saisie), et la colonne de clôture reste D = A + B - C. Un virement
    //      non saisi se signale alors de lui-même par `ecartCloture`.
    colonnes: [
      { type: 'OUVERTURE' as const, libelle: "A — Amortissements cumulés à l'ouverture" },
      { type: 'AUGMENTATIONS' as const, libelle: "B — Augmentations : Dotations de l'exercice" },
      {
        type: 'DIMINUTIONS' as const,
        libelle: "C — Diminutions : Amortissements relatifs aux éléments sortis de l'actif ; Reprises amortissements",
      },
      { type: 'LIBRE' as const, libelle: 'D — Virements de poste à poste' },
      { type: 'CLOTURE' as const, libelle: 'E = A + B - C - D (Cumuls des amortissements à la clôture)' },
    ],
    renvoyeeDepuis: ['AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM'],
    rubriques: [
      { libelle: 'Brevets, licences et droits similaires', comptes: ['2812'] },
      { libelle: 'Logiciels et sites internet', comptes: ['2813'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['2814', '2817', '2818'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2] },
      { libelle: 'Terrains hors immeuble de placement', comptes: ['282'] },
      enAttente(
        'terrains-immeuble-placement',
        'Terrains-immeuble de placement',
        'Le compte 282 « Amortissements des terrains » n\'est pas subdivisé par destination : ' +
          'créer un sous-compte des terrains-immeubles de placement et le rattacher ici.',
      ),
      { libelle: 'Bâtiments hors immeuble de placement', comptes: ['2831', '2832', '2833'] },
      enAttente(
        'batiments-immeuble-placement',
        'Bâtiments immeubles de placement',
        'Le compte 283 n\'a pas de divisionnaire « immeuble de placement » (contrairement à l\'actif brut, ' +
          'comptes 2315 et 2325) : créer un sous-compte dédié et le rattacher ici.',
      ),
      { libelle: 'Aménagements, agencements et installations', comptes: ['2834', '2835', '2838'] },
      {
        libelle: 'Matériel, mobilier et actifs biologiques',
        comptes: ['2841', '2842', '2843', '2844', '2846', '2847', '2848'],
      },
      { libelle: 'Matériel de transport', comptes: ['2845'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [4, 5, 6, 7, 8, 9, 10] },
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [3, 11] },
    ],
    commentaire:
      'indiquer les modes d\'amortissement utilisés ; la durée d\'utilité ou les taux d\'amortissements utilisés.',
  },
  {
    code: '5F',
    titre: 'IMMOBILISATIONS (DEPRECIATIONS)',
    sensAccroissement: 'CREDIT',
    colonnes: [
      { type: 'OUVERTURE' as const, libelle: "A — Dépréciations cumulées à l'ouverture" },
      { type: 'AUGMENTATIONS' as const, libelle: "B — Augmentations : dotations de l'exercice" },
      { type: 'DIMINUTIONS' as const, libelle: "C — Diminutions : reprises de l'exercice" },
      { type: 'CLOTURE' as const, libelle: 'D = A + B - C (Cumul des dépréciations à la clôture)' },
    ],
    renvoyeeDepuis: ['AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM'],
    rubriques: [
      { libelle: 'Brevets, licences et droits similaires', comptes: ['2912'] },
      { libelle: 'Logiciels et sites internet', comptes: ['2913'] },
      { libelle: 'Avances et acomptes sur immobilisations incorporelles', comptes: ['2951'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['2914', '2918', '2919'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2, 3] },
      { libelle: 'Terrains hors immeuble de placement', comptes: ['292'] },
      enAttente(
        'terrains-immeuble-placement',
        'Terrains - immeuble de placement',
        'Le compte 292 « Dépréciations des terrains » n\'est pas subdivisé par destination : ' +
          'créer un sous-compte des terrains-immeubles de placement et le rattacher ici.',
      ),
      { libelle: 'Bâtiments hors immeuble de placement', comptes: ['2931', '2932', '2933', '2939'] },
      enAttente(
        'batiments-immeuble-placement',
        'Bâtiments - immeuble de placement',
        'Le compte 293 n\'a pas de divisionnaire « immeuble de placement » (contrairement à l\'actif brut, ' +
          'comptes 2315 et 2325) : créer un sous-compte dédié et le rattacher ici.',
      ),
      { libelle: 'Aménagements, agencements et installations', comptes: ['2934', '2935', '2938'] },
      {
        libelle: 'Matériel, mobilier et actifs biologiques',
        comptes: ['2941', '2942', '2943', '2944', '2946', '2947', '2948', '2949'],
      },
      { libelle: 'Matériel de transport', comptes: ['2945'] },
      { libelle: 'Avances et acomptes sur immobilisations corporelles', comptes: ['2952'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [5, 6, 7, 8, 9, 10, 11, 12] },
      { libelle: 'Titres de participation', comptes: ['296'] },
      { libelle: 'Autres immobilisations financières', comptes: ['297'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS FINANCIERES', totalDeRubriques: [14, 15] },
      { libelle: 'TOTAL DES IMMOBILISATIONS DEPRECIEES', totalDeRubriques: [4, 13, 16] },
    ],
    commentaire:
      'indiquer les événements et circonstances qui ont conduit à la dépréciation et à la reprise.',
  },
];
