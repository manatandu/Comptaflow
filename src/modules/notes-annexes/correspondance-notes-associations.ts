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
      // `sens: 'DEBITEUR'` sur les comptes 52 et 53 : un compte bancaire
      // créditeur est un DÉCOUVERT, qui relève de la note 22 « Banques,
      // crédit d'escompte et de trésorerie » et du poste DW du passif — pas
      // des disponibilités. C'est exactement la règle que le bilan applique
      // au poste BW par `comptesTransferesSiCrediteur` ; sans elle la note 13
      // et le poste BW qu'elle documente donneraient deux montants différents.
      // Défaut relevé par le test qui recoupe les notes 13 et 22.
      { libelle: 'Banques locales', comptes: ['521'], sens: 'DEBITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'DEBITEUR' },
      { libelle: 'Banques, dépôt à terme', comptes: ['525'], sens: 'DEBITEUR' },
      // 523 (autres États zone monétaire) et 524 (hors zone monétaire) : le
      // texte de la note ne leur donne pas de ligne propre et les regroupe
      // sous « Autres Banques ».
      { libelle: 'Autres Banques', comptes: ['523', '524'], sens: 'DEBITEUR' },
      { libelle: 'Banques intérêts courus', comptes: ['526'], sens: 'DEBITEUR' },
      { libelle: 'Banques Postales', comptes: ['531'], sens: 'DEBITEUR' },
      { libelle: 'Autres établissement financiers', comptes: ['532', '533', '538'], sens: 'DEBITEUR' },
      { libelle: 'Etablissement financiers intérêts courus', comptes: ['536'], sens: 'DEBITEUR' },
      { libelle: 'Instruments de monnaie électronique', comptes: ['55'], sens: 'DEBITEUR' },
      // La caisse n'est PAS filtrée : une caisse créditrice est impossible en
      // fait, donc une anomalie du dossier. La masquer la rendrait invisible ;
      // elle ressort ici en négatif, où elle se voit.
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

  // ======================================================================
  // FONDS PROPRES ET RESSOURCES DURABLES
  // ======================================================================
  {
    code: '16',
    titre: 'RESERVES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['CD', 'CE'],
    rubriques: [
      { libelle: 'Réserves statutaires ou contractuelles', comptes: ['112'], natureCreditrice: true },
      { libelle: 'Autres réserves', comptes: ['118'], natureCreditrice: true },
      { libelle: 'TOTAL RESERVES', totalDeRubriques: [0, 1] },
      // Compte 12 : 121 excédents (créditeur), 129 déficits (débiteur), 128
      // résultat en instance. Le report à nouveau se lit au crédit et ressort
      // négatif quand les déficits l'emportent — ce qui est l'information.
      { libelle: 'Report à nouveau', comptes: ['12'], natureCreditrice: true },
    ],
    commentaire:
      'indiquer la date des délibérations ou des dispositions statutaires qui justifie la variation ' +
      'des réserves et du report à nouveau.',
  },
  {
    code: '17B',
    titre: 'FONDS AFFECTES ET REPORTES',
    // La colonne « Note » du modèle officiel est un renvoi croisé (art. 15),
    // pas un montant : elle est déclarée en saisie.
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Note' }, ...COLONNES_STANDARD],
    renvoyeeDepuis: ['CJ', 'CK'],
    rubriques: [
      // 162 bailleurs, 163 l'État, 164 autres organismes assimilés : les trois
      // comptes d'investissement du plan (161 est une avance à justifier, 169
      // un fonds à recevoir — ni l'un ni l'autre n'est un fonds affecté aux
      // investissements).
      { libelle: 'Fonds affectés aux investissements', comptes: ['162', '163', '164'], natureCreditrice: true },
      {
        libelle: "Fonds non consommés en fin d'exercice destinés à un projet spécifique",
        comptes: ['165'],
        natureCreditrice: true,
      },
      { libelle: "Fonds provenant des dons et legs d'immobilisations", comptes: ['167'], natureCreditrice: true },
      { libelle: 'Autres fonds affectés', comptes: ['161', '168', '169'], natureCreditrice: true },
      { libelle: 'TOTAL FONDS AFFECTES', totalDeRubriques: [0, 1, 2, 3] },
      {
        libelle: "Donations et legs non encore reçus d'immobilisations destinés à la vente",
        comptes: ['172'],
        natureCreditrice: true,
      },
      { libelle: "Donation temporaire d'usufruit", comptes: ['171'], natureCreditrice: true },
      { libelle: 'Autres fonds reportés', comptes: ['178'], natureCreditrice: true },
      { libelle: 'TOTAL FONDS REPORTES', totalDeRubriques: [5, 6, 7] },
      { libelle: 'TOTAL FONDS AFFECTES ET REPORTES', totalDeRubriques: [4, 8] },
    ],
    commentaire:
      "indiquer la date d'affectation des fonds aux investissements et leur mode de reprise ; indiquer la date " +
      "de la donation et du legs des immobilisations ainsi que la nature et leur montant ; indiquer la date de " +
      "l'acte juridique de la donation et du legs non encore reçus des immobilisations destinées à la vente ; " +
      "indiquer la date de l'acte juridique de la donation temporaire et la nature de l'usufruit, la durée de " +
      'jouissance ; justifier le caractère significatif du montant total de cette rubrique ; commenter toute ' +
      'variation significative.',
  },

  // ======================================================================
  // ACTIF CIRCULANT ET TRESORERIE
  // ======================================================================
  {
    code: '8',
    titre: 'STOCKS ET ENCOURS',
    // [texte officiel] Le modèle aligne « Variation de stock en valeur
    // absolue » PUIS « Variation en valeur » et « Variation en % ». Deux
    // lectures possibles de la première : la valeur absolue de l'écart N/N-1,
    // ou le mouvement des comptes de variation de stocks (603 et 73). La
    // lecture littérale du libellé est retenue ; l'autre est signalée ici et
    // devra être tranchée sur le Journal officiel.
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      { type: 'VARIATION_VALEUR_ABSOLUE' as const, libelle: 'Variation de stock en valeur absolue' },
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
    ],
    renvoyeeDepuis: ['BB'],
    rubriques: [
      { libelle: "Biens et services liés à l'activité", comptes: ['31', '371'] },
      { libelle: 'Marchandises, Matières premières', comptes: ['32', '372'] },
      { libelle: 'Autres approvisionnements', comptes: ['33', '373'] },
      { libelle: 'Dons en nature', comptes: ['34'] },
      { libelle: 'Produits finis', comptes: ['35', '36', '376'] },
      { libelle: 'Dons en nature HAO', comptes: ['38'] },
      { libelle: 'Autres stocks HAO', comptes: ['377', '378'] },
      { libelle: 'TOTAL STOCKS ET ENCOURS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Dépréciations des stocks', comptes: ['39'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [7, 8] },
    ],
    renvoiOfficiel:
      "(1) Les stocks H.A.O. ne doivent être inscrits dans l'actif circulant H.A.O. que lorsque leur montant " +
      "total est significatif (supérieur à 5 % du total de l'actif circulant).",
    commentaire:
      "indiquer la date de prise d'inventaire et décrire la procédure et les méthodes comptables d'évaluation ; " +
      'commenter toute variation significative des stocks ; indiquer le détail des stocks dépréciés ainsi que ' +
      'les événements et circonstances.',
  },
  {
    code: '22',
    titre: "BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE",
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['DW'],
    rubriques: [
      // Les quatre premières rubriques ne retiennent que les soldes
      // CRÉDITEURS : un compte bancaire débiteur est une disponibilité et
      // figure à la note 13, jamais ici. Le NB officiel le dit pour les
      // intérêts courus (« si le compte principal attaché est créditeur ») ;
      // le bilan applique la même règle par `comptesTransferesSiCrediteur`.
      { libelle: 'Banques locales', comptes: ['521'], sens: 'CREDITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'CREDITEUR' },
      { libelle: 'Autres Banques', comptes: ['523', '524', '525'], sens: 'CREDITEUR' },
      { libelle: 'Banques, intérêts courus', comptes: ['526'], sens: 'CREDITEUR' },
      { libelle: 'Crédit de trésorerie', comptes: ['56'], natureCreditrice: true },
      { libelle: 'TOTAL : BANQUES, CREDITS DE TRESORERIE', totalDeRubriques: [0, 1, 2, 3, 4] },
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [5] },
    ],
    commentaire:
      "commenter toute variation significative ; indiquer le nom de l'organisme, les conditions de crédit, " +
      "le taux d'intérêt, la durée du crédit.",
    renvoiOfficiel:
      'NB : « Banques et intérêts courus » figure dans cette rubrique si le compte principal attaché est créditeur.',
  },

  // ======================================================================
  // PRODUITS ET CHARGES DES ACTIVITES ORDINAIRES
  //
  // Comptes des classes 6 et 7. Les produits portent `natureCreditrice` :
  // leur solde est créditeur et s'affiche en positif, sans filtrage sur le
  // signe — un compte de produits momentanément débiteur reste présenté.
  // ======================================================================
  {
    code: '23',
    titre: 'REVENUS ET AUTRES PRODUITS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TA', 'TB', 'TC', 'TD', 'TE', 'TF'],
    rubriques: [
      { libelle: 'Cotisations des adhérents', comptes: ['701'], natureCreditrice: true },
      { libelle: 'Quote-part de dotation consomptible transférée', comptes: ['703'], natureCreditrice: true },
      { libelle: 'Revenus liés à la générosité', comptes: ['704'], natureCreditrice: true },
      { libelle: 'Ventes de marchandises, services et produits finis', comptes: ['705'], natureCreditrice: true },
      { libelle: 'Revenus des manifestations', comptes: ['706'], natureCreditrice: true },
      // 702 « quote-part de fonds d'administration transférés » est un compte
      // du jeu PROJETS DE DEVELOPPEMENT ; le modèle associations ne lui donne
      // pas de rubrique. Il est rangé ici avec les autres revenus plutôt que
      // laissé hors note, où son montant disparaîtrait sans trace.
      { libelle: 'Autres revenus', comptes: ['702', '707', '708'], natureCreditrice: true },
      { libelle: 'TOTAL : REVENUS', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      { libelle: "Subventions d'exploitation", comptes: ['71'], natureCreditrice: true },
      {
        libelle: "Autres produits et transferts de charges d'exploitation",
        comptes: ['72', '73', '75', '781', '791'],
        natureCreditrice: true,
      },
      { libelle: "TOTAL : SUBVENTIONS D'EXPLOITATION ET AUTRES PRODUITS", totalDeRubriques: [7, 8] },
      { libelle: 'TOTAL', totalDeRubriques: [6, 9] },
    ],
    commentaire: 'justifier toute variation significative ; détailler les revenus liés à la générosité.',
  },
  {
    code: '25',
    titre: 'TRANSPORTS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TH'],
    rubriques: [
      { libelle: 'Transports sur ventes', comptes: ['612'] },
      { libelle: 'Transports pour le compte de tiers', comptes: ['613'] },
      { libelle: 'Transport du personnel', comptes: ['614'] },
      { libelle: 'Transports de plis', comptes: ['616'] },
      // Le plan ne donne, pour tout le reste, que le compte 618 « Autres frais
      // de transport ». Les deux rubriques ci-dessous s'y trouvent donc
      // confondues : les rattacher toutes deux à 618 compterait deux fois le
      // même montant, en rattacher une seule serait arbitraire.
      enAttente(
        'voyages-deplacements',
        'Voyages et déplacements',
        "Le plan SYCEBNL s'arrête au compte 618 « Autres frais de transport », qui couvre à la fois les " +
          'voyages et déplacements et les transports administratifs : subdiviser 618 et rattacher ici ' +
          'le sous-compte des voyages et déplacements.',
      ),
      enAttente(
        'transports-administratifs',
        'Transports administratifs',
        "Même situation que « Voyages et déplacements » : subdiviser le compte 618 et rattacher ici le " +
          'sous-compte des transports administratifs.',
      ),
      { libelle: 'Rabais, remises et ristournes obtenus', comptes: ['619'], presenterEnNegatif: true },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '26',
    titre: 'SERVICES EXTERIEURS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TI'],
    rubriques: [
      { libelle: 'Sous-traitance générale', comptes: ['621'] },
      { libelle: 'Locations et charges locatives', comptes: ['622'] },
      { libelle: 'Redevances de location-acquisition', comptes: ['623'] },
      { libelle: 'Entretien, réparations et maintenance', comptes: ['624'] },
      { libelle: "Primes d'assurance", comptes: ['625'] },
      { libelle: 'Etudes, recherches et documentation', comptes: ['626'] },
      { libelle: 'Publicité, publications, relations publiques', comptes: ['627'] },
      { libelle: 'Frais de télécommunications', comptes: ['628'] },
      { libelle: 'Frais bancaires', comptes: ['631'] },
      { libelle: "Rémunérations d'intermédiaires et de conseils", comptes: ['632'] },
      { libelle: 'Frais de formation du personnel', comptes: ['633'] },
      {
        libelle: 'Redevances pour brevets, licences, logiciels, concessions et droits similaires',
        comptes: ['634'],
      },
      { libelle: 'Cotisations', comptes: ['635'] },
      { libelle: 'Frais de recherche de fonds', comptes: ['636'] },
      { libelle: "Rémunérations de personnel extérieur à l'entité", comptes: ['637'] },
      { libelle: 'Autres charges externes', comptes: ['638'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '27',
    titre: 'IMPOTS ET TAXES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TJ'],
    rubriques: [
      { libelle: 'Impôts et taxes directs', comptes: ['641'] },
      { libelle: 'Impôts et taxes indirects', comptes: ['645'] },
      { libelle: "Droits d'enregistrement", comptes: ['646'] },
      { libelle: 'Pénalités et amendes fiscales', comptes: ['647'] },
      { libelle: 'Autres impôts et taxes', comptes: ['648'] },
      // Renvoi (1) du modèle : « Ce compte a un solde créditeur, son montant
      // doit être précédé d'un signe (-) ».
      {
        libelle: 'Dégrèvements et annulations des impôts et taxes',
        comptes: ['649'],
        presenterEnNegatif: true,
        renvoi: "(1) Ce compte a un solde créditeur, son montant doit être précédé d'un signe (-).",
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
    ],
    commentaire:
      'commenter toute variation significative ; détailler les pénalités, les amendes et indiquer la cause.',
  },
  {
    code: '28',
    titre: 'AUTRES CHARGES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TK'],
    rubriques: [
      // 651 est subdivisé au plan : 6511 clients-usagers, 6512 adhérents,
      // 6515 autres débiteurs. Les deux rubriques du modèle s'y rattachent
      // donc sans jugement.
      { libelle: 'Pertes sur créances adhérents', comptes: ['6512'] },
      { libelle: 'Pertes sur Clients et autres débiteurs', comptes: ['6511', '6515'] },
      { libelle: "Subventions versées par l'entité", comptes: ['652'] },
      { libelle: 'Dons en nature courants à distribuer', comptes: ['654'] },
      { libelle: 'Pénalités et amendes pénales', comptes: ['657'] },
      { libelle: 'Autres charges diverses', comptes: ['658'] },
      {
        libelle: "Charges pour dépréciations et provisions pour risques à court terme d'exploitation",
        comptes: ['659'],
        renvoi: 'voir note 30',
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature et montant des provisions pour risques ' +
      'à court terme ; indiquer les bénéficiaires des subventions.',
  },
  {
    code: '29A',
    titre: 'CHARGES DE PERSONNEL',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TL'],
    rubriques: [
      { libelle: 'Rémunérations directes versées au personnel national', comptes: ['661'] },
      { libelle: 'Rémunérations directes versées au personnel non national', comptes: ['662'] },
      { libelle: 'Indemnités forfaitaires versées au personnel', comptes: ['663'] },
      // 664 est subdivisé au plan : 6641 national, 6642 non national.
      { libelle: 'Charges sociales (personnel national)', comptes: ['6641'] },
      { libelle: 'Charges sociales (personnel non national)', comptes: ['6642'] },
      { libelle: 'Habillement et équipement du personnel', comptes: ['665'] },
      { libelle: 'Rémunération transférée de personnel extérieur', comptes: ['667'] },
      { libelle: 'Autres charges sociales', comptes: ['668'] },
      {
        libelle: 'Dégrèvements et annulations des charges sociales',
        comptes: ['669'],
        presenterEnNegatif: true,
        renvoi: "(1) Ce compte a un solde créditeur, son montant doit être précédé d'un signe (-).",
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature et la durée du contrat du personnel extérieur.',
  },
  {
    code: '31',
    titre: 'CHARGES ET REVENUS FINANCIERS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TQ', 'UF'],
    rubriques: [
      { libelle: 'Intérêts des emprunts', comptes: ['671'] },
      { libelle: 'Intérêts dans loyers de location-acquisition', comptes: ['672'] },
      { libelle: 'Escomptes accordés', comptes: ['673'] },
      { libelle: 'Autres intérêts', comptes: ['674'] },
      { libelle: 'Pertes de change financières', comptes: ['676'] },
      { libelle: 'Pertes sur titres de placement', comptes: ['677'] },
      { libelle: 'Pertes et charges sur risques financiers', comptes: ['678'] },
      {
        libelle: 'Charges pour dépréciations et provisions à court terme à caractère financier',
        comptes: ['679'],
        renvoi: 'voir note 30',
      },
      { libelle: 'TOTAL : FRAIS FINANCIERS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      { libelle: 'Intérêts de prêts et créances diverses', comptes: ['771'], natureCreditrice: true },
      {
        libelle: 'Revenus de participations et autres titres immobilisés',
        comptes: ['772'],
        natureCreditrice: true,
      },
      { libelle: 'Escomptes obtenus', comptes: ['773'], natureCreditrice: true },
      { libelle: 'Revenus de placement', comptes: ['774'], natureCreditrice: true },
      // [texte officiel] Le modèle intitule cette rubrique « Intérêts dans
      // loyers de location-FINANCEMENT », alors que le plan de comptes et
      // toutes les autres rubriques du référentiel disent « location-
      // ACQUISITION ». Le libellé est reproduit tel quel. Le plan ne donne
      // aucun compte de produits pour ces intérêts (772 à 774 sont pris) :
      // la rubrique reste en attente de rattachement.
      enAttente(
        'interets-loyers-location-financement',
        'Intérêts dans loyers de location-financement',
        "Le plan SYCEBNL ne prévoit pas de compte de produits distinct pour les intérêts contenus dans les " +
          'loyers de location-acquisition perçus : subdiviser le compte 774 « Revenus de placement » ou 778 ' +
          'et rattacher ici le sous-compte correspondant.',
      ),
      { libelle: 'Gains de change financiers', comptes: ['776'], natureCreditrice: true },
      { libelle: 'Gains sur cessions de titres de placement', comptes: ['777'], natureCreditrice: true },
      { libelle: 'Gains sur risques financiers', comptes: ['778'], natureCreditrice: true },
      { libelle: 'Transferts de charges financières', comptes: ['787'], natureCreditrice: true },
      {
        libelle: 'Reprises de charges pour dépréciations et provisions à court terme à caractère financier',
        comptes: ['779', '797'],
        natureCreditrice: true,
        renvoi: 'voir note 30',
      },
      { libelle: 'TOTAL : REVENUS FINANCIERS', totalDeRubriques: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
      // [texte officiel] Le modèle écrit « TOTAL » sans formule. La lecture
      // retenue est celle du compte de résultat, où le résultat financier est
      // la différence des deux sous-totaux — un total qui les additionnerait
      // mêlerait charges et produits sans signification.
      { libelle: 'TOTAL', totalDeRubriques: [19], moinsRubriques: [8] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature des provisions pour risques à court terme.',
  },
  {
    code: '32',
    titre: 'AUTRES CHARGES ET PRODUITS HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TS', 'UH'],
    rubriques: [
      // [texte officiel] Le plan numérote les subdivisions du compte 832
      // « Dons en nature H.A.O. à distribuer » 8311 et 8315 — c'est-à-dire
      // dans la plage du compte 831. Anomalie déjà signalée dans le référentiel.
      // Conséquence ici : rattacher « Charges H.A.O. constatées » au seul
      // préfixe 831 y ferait tomber les dons en nature. Les intitulés
      // l'emportent sur la numérotation (postulat de prééminence de la réalité
      // sur l'apparence, Partie 1 ch. 2) : 8311 et 8315 sont exclus de 831 et
      // rattachés aux dons en nature. Signalé, non corrigé au référentiel.
      { libelle: 'Charges H.A.O. constatées (compte 831)', comptes: ['831'], exclusions: ['8311', '8315'] },
      {
        libelle: 'Dons en nature (compte 832) à détailler : non affectés / affectés',
        comptes: ['832', '8311', '8315'],
        renvoi: '(1) à détailler : non affectés / affectés',
      },
      { libelle: 'Pertes sur créances HAO', comptes: ['834'] },
      { libelle: 'Abandons de créances consentis', comptes: ['836'] },
      { libelle: 'Charges pour dépréciations et provisions pour risques à court terme HAO', comptes: ['839'] },
      { libelle: 'Dotations hors activités ordinaires', comptes: ['85'] },
      { libelle: 'TOTAL : AUTRES CHARGES HAO', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      // Même anomalie de numérotation au compte 842, traitée de même.
      {
        libelle: 'Produits H.A.O. constatés (compte 841)',
        comptes: ['841'],
        exclusions: ['8411', '8412', '8415'],
        natureCreditrice: true,
      },
      {
        libelle:
          'Contributions volontaires en nature (compte 842) à détailler : Dons en nature non affectés / ' +
          'Prestations de services en nature / Dons en nature affectés',
        comptes: ['842', '8411', '8412', '8415'],
        natureCreditrice: true,
        renvoi:
          '(1) à détailler : Dons en nature non affectés / Prestations de services en nature / Dons en nature affectés',
      },
      { libelle: 'Contributions volontaires en numéraire', comptes: ['843'], natureCreditrice: true },
      { libelle: 'Transferts de charges HAO', comptes: ['848'], natureCreditrice: true },
      {
        libelle: 'Reprises des charges pour dépréciations et provisions à court terme HAO',
        comptes: ['849'],
        natureCreditrice: true,
      },
      {
        libelle: "Reprises d'amortissements, provisions et dépréciations H.A.O.",
        comptes: ['86'],
        natureCreditrice: true,
      },
      { libelle: "Subventions d'équilibre", comptes: ['88'], natureCreditrice: true },
      { libelle: 'TOTAL : AUTRES PRODUITS HAO', totalDeRubriques: [7, 8, 9, 10, 11, 12, 13] },
      // Même lecture qu'à la note 31 : le « TOTAL » final est le solde H.A.O.
      { libelle: 'TOTAL', totalDeRubriques: [14], moinsRubriques: [6] },
    ],
    commentaire: 'commenter toute variation significative.',
  },

  // ======================================================================
  // IMMOBILISATIONS RECUES PAR DONS ET LEGS, USUFRUIT, LOCATION-ACQUISITION
  //
  // Compte 20 « Immobilisations destinées à la vente provenant de dons et
  // legs non encore reçus et usufruit temporaire ». Le plan y descend au
  // divisionnaire à l'ACTIF BRUT (2011 à 2017, 202 à 205) mais pas du tout
  // aux amortissements et dépréciations, où il ne donne que 280 et 290 —
  // d'où l'écart de finesse entre les notes 5A et 5D.
  // ======================================================================
  {
    code: '5A',
    titre: "DONS ET LEGS D'IMMOBILISATIONS NON REÇUS DESTINES A LA VENTE ET USUFRUIT TEMPORAIRE",
    colonnes: COLONNES_MOUVEMENTS,
    renvoyeeDepuis: ['AA'],
    // Le modèle groupe les rubriques sous des intitulés de section
    // (IMMOBILISATIONS INCORPORELLES, CORPORELLES, FINANCIERES) sans en
    // faire des lignes de sous-total — contrairement aux notes 5B et 5F, qui
    // écrivent « SOUS TOTAL : ». Aucun sous-total n'est donc ajouté ici : le
    // groupement est une affaire de présentation, pas de calcul.
    rubriques: [
      { libelle: 'Usufruit', comptes: ['2011'] },
      { libelle: 'Brevets, licences, logiciels et droits similaires', comptes: ['2012', '2013'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['2014', '2017'] },
      { libelle: 'Terrains', comptes: ['202'] },
      { libelle: 'Bâtiments', comptes: ['203'] },
      { libelle: 'Matériels et mobiliers', comptes: ['204'] },
      { libelle: 'Titres de participation', comptes: ['205'] },
      enAttente(
        'autres-immobilisations-financieres',
        'Autres immobilisations financières',
        "Le compte 20 ne prévoit, en immobilisations financières reçues par dons et legs, que le compte 205 " +
          '« Titres de participations » : subdiviser le compte 20 et rattacher ici le sous-compte des autres ' +
          'immobilisations financières.',
      ),
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
    commentaire:
      'toute variation significative doit être commentée ; pour les banques, DAT indiquer le nom de la banque, ' +
      "le montant et la date d'échéance.",
  },
  {
    code: '5C',
    titre: 'BIENS PRIS EN LOCATION-ACQUISITION',
    // La première colonne du modèle (« Nature du contrat : I crédit-bail
    // immobilier, M mobilier, A autres contrats ») qualifie le contrat, elle
    // ne porte pas de montant : déclarée en saisie.
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Nature du contrat (I ; M ; A)' }, ...COLONNES_MOUVEMENTS],
    // Les comptes de location-acquisition sont les divisionnaires « 6 » de
    // chaque famille d'immobilisations (Partie 2, ch. 2) : 2286 terrains,
    // 2316/2326 bâtiments, 2416/2426/2446 matériel et mobilier, 2456
    // matériel de transport.
    rubriques: [
      { libelle: 'Terrains', comptes: ['2286'] },
      { libelle: 'Bâtiments', comptes: ['2316', '2326'] },
      { libelle: 'Matériel, mobilier', comptes: ['2416', '2426', '2446'] },
      { libelle: 'Matériel de transport', comptes: ['2456'] },
      { libelle: 'TOTAL IMMOBILISATIONS EN LOCATION-ACQUISITION', totalDeRubriques: [0, 1, 2, 3] },
    ],
    renvoiOfficiel:
      'I : Crédit-bail immobilier ; M : Crédit-bail mobilier ; A : Autres contrats ' +
      '(dédoubler le poste si montant significatif).',
    commentaire: 'indiquer la nature du bien, le nom du bailleur et la durée du bail.',
  },
  {
    code: '5D',
    titre:
      "DONS ET LEGS D'IMMOBILISATIONS NON REÇUS DESTINES A LA VENTE ET USUFRUIT TEMPORAIRE " +
      '(AMORTISSEMENTS ET DEPRECIATIONS)',
    sensAccroissement: 'CREDIT',
    // Même formule et même réserve qu'à la note 5E : la colonne D
    // « Virements de poste à poste » ne se distingue pas d'un mouvement
    // ordinaire en balance et reste en saisie ; un virement non saisi se
    // signale de lui-même par l'écart de clôture.
    colonnes: [
      { type: 'OUVERTURE' as const, libelle: "A — Amortissements et dépréciations cumulés à l'ouverture" },
      { type: 'AUGMENTATIONS' as const, libelle: "B — Augmentations : Dotations de l'exercice" },
      {
        type: 'DIMINUTIONS' as const,
        libelle:
          "C — Diminutions : Amortissements et dépréciations relatifs aux éléments sortis de l'actif ; " +
          'Reprises amortissements et dépréciations',
      },
      { type: 'LIBRE' as const, libelle: 'D — Virements de poste à poste' },
      {
        type: 'CLOTURE' as const,
        libelle: 'E = A + B - C - D (Cumuls des amortissements et dépréciations à la clôture)',
      },
    ],
    // Le plan ne donne, pour tout le compte 20, que 280 « Amortissements
    // d'usufruit temporaire » et 290 « Dépréciations » (2901 usufruit, 2902
    // immobilisations destinées à la vente, sans distinction de nature).
    // Seul l'usufruit est donc déterminable ; les cinq autres rubriques
    // exigent que le dossier subdivise le compte 2902.
    rubriques: [
      { libelle: 'Usufruit', comptes: ['280', '2901'] },
      ...(
        [
          ['brevets-licences-logiciels', 'Brevets, licences, logiciels et droits similaires'],
          ['autres-incorporelles', 'Autres immobilisations incorporelles'],
          ['terrains', 'Terrains'],
          ['batiments', 'Bâtiments'],
          ['materiel-mobilier', 'Matériel, mobilier'],
        ] as const
      ).map(([cle, libelle]) =>
        enAttente(
          cle,
          libelle,
          'Le compte 2902 « Dépréciations des immobilisations destinées à la vente » ne distingue pas la ' +
            "nature des biens, et le plan ne prévoit pas d'amortissement pour eux (seul l'usufruit temporaire " +
            'en a un, compte 280) : subdiviser 2902 par nature et rattacher ici le sous-compte correspondant.',
        ),
      ),
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [3, 4, 5] },
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [6, 7] },
    ],
  },

  // ======================================================================
  // CREANCES ET DETTES — ventilation par échéance
  // ======================================================================
  {
    code: '6',
    titre: 'IMMOBILISATIONS FINANCIERES',
    // [texte officiel] Le modèle de cette note omet « Variation en valeur »,
    // que toutes les autres notes comparatives portent. Transcrit tel quel.
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
      { type: 'ECHEANCE_1AN' as const, libelle: 'Créances à un an au plus' },
      { type: 'ECHEANCE_2ANS' as const, libelle: "Créances à plus d'un an et à deux ans au plus" },
      { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Créances à plus de deux ans' },
    ],
    renvoyeeDepuis: ['AN', 'AP'],
    rubriques: [
      { libelle: 'Titres de participation', comptes: ['26'] },
      { libelle: 'Prêts et créances', comptes: ['271'] },
      { libelle: 'Prêt au personnel', comptes: ['272'] },
      { libelle: "Créances sur l'état", comptes: ['273'] },
      { libelle: 'Titres immobilisés', comptes: ['274'] },
      { libelle: 'Dépôts et cautionnements', comptes: ['275'] },
      { libelle: 'Intérêts courus', comptes: ['276'] },
      { libelle: 'Immobilisations financières diverses', comptes: ['278'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      { libelle: 'Dépréciations des titres de participation', comptes: ['296'], presenterEnNegatif: true },
      {
        libelle: 'Dépréciations des autres immobilisations financières',
        comptes: ['297'],
        presenterEnNegatif: true,
      },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [8, 9, 10] },
    ],
    commentaire:
      'justifier toute variation significative ; commenter toutes les créances anciennes ; indiquer le nombre ' +
      "et la date d'acquisition des actions ou des parts ; dépréciations : indiquer les évènements et les " +
      'circonstances qui ont motivé la dépréciation ou la reprise.',
  },
  {
    code: '10',
    titre: 'AUTRES CREANCES',
    colonnes: COLONNES_AVEC_ECHEANCES_CREANCES,
    renvoyeeDepuis: ['BH'],
    // Comptes de tiers POLYVALENTS : les classes 42 à 47 portent aussi bien
    // des créances que des dettes. `sens: 'DEBITEUR'` ne retient donc que
    // les soldes débiteurs — leur pendant créditeur relève des notes 20 et 21.
    rubriques: [
      { libelle: 'Personnel', comptes: ['42'], sens: 'DEBITEUR' },
      { libelle: 'Organismes sociaux', comptes: ['43'], sens: 'DEBITEUR' },
      { libelle: 'Etat et Collectivités publiques', comptes: ['44'], sens: 'DEBITEUR' },
      { libelle: 'Fondateurs, apporteurs et comptes courants', comptes: ['45'], sens: 'DEBITEUR' },
      {
        libelle: "Bailleurs, Etat et autres organismes, fonds d'administration",
        comptes: ['46'],
        sens: 'DEBITEUR',
      },
      { libelle: 'Débiteurs divers', comptes: ['471'], sens: 'DEBITEUR' },
      // Tout le reste du compte 47 : créances sur titres, subventions à
      // recevoir, générosités à recevoir, charges constatées d'avance, écarts
      // de conversion. Le modèle ne les nomme pas une à une.
      {
        // 475 « Générosités financières à recevoir » est ABSENT de cette liste :
        // le modèle officiel lui donne une ligne propre à la note 21. L'y
        // laisser aussi le compterait deux fois.
        libelle: 'Autres débiteurs divers',
        comptes: ['472', '473', '474', '476', '478'],
        sens: 'DEBITEUR',
      },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      {
        libelle: 'Dépréciations des autres créances',
        comptes: ['492', '493', '494', '497'],
        presenterEnNegatif: true,
      },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [7, 8] },
    ],
    commentaire:
      'justifier toute variation significative ; détailler les créances dont le montant est significatif ; ' +
      'justifier les créances anciennes ; indiquer les événements et circonstances motivant la dépréciation ' +
      'et la reprise.',
  },
  {
    code: '18A',
    titre: 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DA', 'DB', 'DC'],
    rubriques: [
      { libelle: 'Emprunts obligataires', comptes: ['181'], natureCreditrice: true },
      {
        libelle: 'Emprunts et dettes auprès des établissements de crédit',
        comptes: ['182'],
        natureCreditrice: true,
      },
      { libelle: "Avances reçues de l'Etat", comptes: ['183'], natureCreditrice: true },
      { libelle: 'Dépôts et cautionnements reçus', comptes: ['185'], natureCreditrice: true },
      { libelle: 'Intérêts courus', comptes: ['186'], natureCreditrice: true },
      { libelle: 'Autres emprunts et dettes', comptes: ['188'], natureCreditrice: true },
      { libelle: 'TOTAL EMPRUNTS ET DETTES FINANCIERES', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      { libelle: 'Crédit-bail immobilier', comptes: ['1871'], natureCreditrice: true },
      { libelle: 'Crédit-bail mobilier', comptes: ['1872'], natureCreditrice: true },
      { libelle: 'Location-vente', comptes: ['1873'], natureCreditrice: true },
      { libelle: 'Intérêts courus', comptes: ['1876'], natureCreditrice: true },
      {
        libelle: 'Autres dettes de location-acquisition',
        comptes: ['187'],
        exclusions: ['1871', '1872', '1873', '1876'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL DETTES DE LOCATION-ACQUISITION', totalDeRubriques: [7, 8, 9, 10, 11] },
      { libelle: 'Provisions pour litiges', comptes: ['191'], natureCreditrice: true },
      { libelle: 'Provisions pour charges sur donations et legs', comptes: ['192'], natureCreditrice: true },
      { libelle: 'Provisions pour pertes de change', comptes: ['194'], natureCreditrice: true },
      // 196 est polyvalent dans cette note : la provision au crédit, l'actif
      // du régime de retraite au débit. Le renvoi (1) du modèle le dit
      // expressément (« solde débiteur du compte ») ; l'actif vient en
      // diminution de la provision, d'où la présentation en négatif.
      {
        libelle: 'Provisions pour pensions et obligations similaires',
        comptes: ['196'],
        sens: 'CREDITEUR',
      },
      {
        libelle: 'Actif du régime de retraite',
        comptes: ['196'],
        sens: 'DEBITEUR',
        presenterEnNegatif: true,
        renvoi: '(1) solde débiteur du compte.',
      },
      { libelle: 'Autres provisions pour risques et charges', comptes: ['198'], natureCreditrice: true },
      {
        libelle: 'TOTAL PROVISIONS FINANCIERES POUR RISQUES ET CHARGES',
        totalDeRubriques: [13, 14, 15, 16, 17, 18],
      },
    ],
    commentaire:
      "pour chaque emprunt et dette de location-acquisition, mentionner la date d'octroi, le nom de l'organisme " +
      'financier, le montant initial, la durée du crédit, les garanties données ; indiquer les événements et ' +
      'circonstances motivant la provision et la reprise ; pour les pensions et obligations de retraite, ' +
      "indiquer la méthode d'évaluation retenue, le nom de la compagnie d'assurance ou du fonds de pension, le " +
      'descriptif de la convention signée, la périodicité des versements, le montant et la durée de la ' +
      'convention pour les actifs du régime.',
  },
  {
    code: '18B',
    titre: 'ACTIFS ET PASSIFS EVENTUELS',
    // Par définition, un actif ou un passif ÉVENTUEL n'est pas comptabilisé :
    // aucune balance ne le porte. La note est donc entièrement en saisie —
    // ni rattachable, ni en attente de rattachement.
    horsBalance: true,
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
    ],
    rubriques: [
      { libelle: 'Actif éventuel — Litiges', saisie: true },
      { libelle: 'Actif éventuel — Autres', saisie: true },
      { libelle: 'Passif éventuel — Litiges', saisie: true },
      { libelle: 'Passif éventuel — Autres', saisie: true },
    ],
    commentaire:
      'décrire les principales caractéristiques des actifs / passifs éventuels, l’horizon de temps auquel les ' +
      'encaissements / décaissements sont attendus et les éventuels remboursements à percevoir.',
  },
  // Notes 19, 20 et 21 : les comptes des classes 40 à 47 sont POLYVALENTS —
  // le même compte porte une créance ou une dette selon le sens de son solde.
  // Ces notes les filtrent donc au crédit (`sens: 'CREDITEUR'`), et la note 10
  // au débit. Employer `natureCreditrice`, qui ne filtre pas, ferait figurer
  // un compte débiteur DANS LES DEUX — en positif à la note 10, en négatif
  // ici : le même montant compté deux fois, comme le découvert bancaire l'a
  // été entre les notes 13 et 22.
  {
    code: '19',
    titre: "FOURNISSEURS D'EXPLOITATION",
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DJ'],
    rubriques: [
      { libelle: 'Fournisseurs, dettes en compte', comptes: ['4011', '4013'], sens: 'CREDITEUR' },
      { libelle: 'Fournisseurs, réserve de propriété', comptes: ['4016'], sens: 'CREDITEUR' },
      { libelle: 'Fournisseurs, retenue de garantie', comptes: ['4017'], sens: 'CREDITEUR' },
      { libelle: 'Fournisseurs effets à payer', comptes: ['402'], sens: 'CREDITEUR' },
      { libelle: 'Fournisseurs factures non parvenues', comptes: ['408'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL FOURNISSEURS', totalDeRubriques: [0, 1, 2, 3, 4] },
      // Le compte 409 « Fournisseurs débiteurs » est une CRÉANCE : il se lit
      // au débit et figure ici en positif, comme le fait la maquette.
      { libelle: 'Fournisseurs, avances et acomptes', comptes: ['4091'], sens: 'DEBITEUR' },
      { libelle: 'Fournisseurs sous-traitants, avances et acomptes', comptes: ['4093'], sens: 'DEBITEUR' },
      { libelle: 'Autres fournisseurs débiteurs', comptes: ['4094', '4098'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL FOURNISSEURS DEBITEURS', totalDeRubriques: [6, 7, 8] },
    ],
    commentaire: 'commenter toute variation significative ; commenter les dettes anciennes.',
  },
  {
    code: '20',
    titre: 'DETTES FISCALES ET SOCIALES',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DK', 'DL'],
    rubriques: [
      { libelle: 'Personnel, rémunérations dues', comptes: ['422'], sens: 'CREDITEUR' },
      { libelle: 'Personnel, congés à payer', comptes: ['4281'], sens: 'CREDITEUR' },
      { libelle: 'Charges sociales sur congés à payer', comptes: ['4382'], sens: 'CREDITEUR' },
      {
        libelle: 'Autres personnel',
        comptes: ['423', '424', '425', '427', '4286'],
        sens: 'CREDITEUR',
      },
      { libelle: 'Caisse de sécurité sociale', comptes: ['431'], sens: 'CREDITEUR' },
      { libelle: 'Caisse de retraite', comptes: ['432'], sens: 'CREDITEUR' },
      { libelle: 'Mutuelle de santé', comptes: ['4331'], sens: 'CREDITEUR' },
      { libelle: 'Assurance Retraite', comptes: ['4332'], sens: 'CREDITEUR' },
      { libelle: 'Autres charges sociales à payer', comptes: ['4381', '4386'], sens: 'CREDITEUR' },
      { libelle: 'Autres cotisations et organismes sociaux', comptes: ['4333'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES SOCIALES', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { libelle: 'Etat, autres impôts et taxes', comptes: ['442'], sens: 'CREDITEUR' },
      // 443 facturée, 444 due ou crédit, 445 récupérable, 446 autres taxes :
      // la rubrique est le solde net de TVA. 445 étant débiteur, un crédit de
      // TVA y ressort en négatif — c'est bien une créance sur l'Etat.
      { libelle: 'Etat, TVA', comptes: ['443', '444', '445', '446'], sens: 'CREDITEUR' },
      { libelle: 'Etat, impôts retenus à la source', comptes: ['447'], sens: 'CREDITEUR' },
      { libelle: 'Autres dettes Etat', comptes: ['448', '449'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES FISCALES', totalDeRubriques: [11, 12, 13, 14] },
      { libelle: 'TOTAL DETTES SOCIALES ET FISCALES', totalDeRubriques: [10, 15] },
    ],
    commentaire: 'commenter toute variation significative ; commenter les dettes anciennes.',
  },
  {
    code: '21',
    titre: 'AUTRES DETTES ET PROVISIONS POUR RISQUES ET CHARGES A COURT TERME',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DM', 'DN'],
    rubriques: [
      { libelle: "Fonds d'administration des projets — Bailleurs de fonds", comptes: ['462'], sens: 'CREDITEUR' },
      { libelle: "Fonds d'administration des projets — Etat", comptes: ['463'], sens: 'CREDITEUR' },
      {
        libelle: "Fonds d'administration des projets — Autres organismes de financement assimilés",
        comptes: ['464'],
        sens: 'CREDITEUR',
      },
      { libelle: "TOTAL BAILLEURS, FONDS D'ADMINISTRATION", totalDeRubriques: [0, 1, 2] },
      { libelle: 'Créditeurs divers', comptes: ['4711', '4712'], sens: 'CREDITEUR' },
      {
        libelle: 'Créditeurs, dons en nature courants non consommées',
        comptes: ['4713'],
        sens: 'CREDITEUR',
      },
      {
        libelle: 'Versements restant à effectuer sur titres de placement non libérés',
        comptes: ['4726'],
        sens: 'CREDITEUR',
      },
      // 475 « Générosités financières à recevoir » est un compte DÉBITEUR ;
      // le modèle le range pourtant dans cette note de dettes. Transcrit tel
      // quel, en lecture débitrice, donc en diminution du total.
      { libelle: 'Générosités financières à recevoir', comptes: ['475'], presenterEnNegatif: true },
      {
        libelle: 'Autres créditeurs divers',
        comptes: ['471', '472', '474', '477', '479'],
        exclusions: ['4711', '4712', '4713', '4726'],
        sens: 'CREDITEUR',
      },
      { libelle: 'TOTAL CREDITEURS DIVERS', totalDeRubriques: [4, 5, 6, 7, 8] },
      { libelle: 'TOTAL AUTRES DETTES', totalDeRubriques: [3, 9] },
      {
        libelle: 'Provisions pour risques et charges à court terme',
        comptes: ['499'],
        sens: 'CREDITEUR',
        renvoi: 'voir note 30',
      },
    ],
    commentaire: 'de toute variation significative ; des dettes anciennes.',
  },
];
