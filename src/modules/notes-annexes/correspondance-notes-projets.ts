import { SpecificationNote } from './note-annexe.types';

/**
 * NOTES ANNEXES du jeu SYCEBNL « projets de développement et assimilés ».
 *
 * Source : skill `sycebnl`, `references/partie4-ch3-etats-projets-developpement.md`,
 * sections « FICHE RECAPITULATIVE » et notes 1 à 24 (Journal officiel OHADA,
 * n° spécial du 22 février 2023, Partie 4, chapitre 3). Titres, libellés de
 * rubriques, colonnes et commentaires sont transcrits mot pour mot.
 *
 * Fichier INDÉPENDANT de `correspondance-notes-associations.ts` : même
 * discipline que pour le bilan et le compte d'exploitation de ce jeu — jamais
 * complété depuis l'autre jeu, jamais supposé que les mêmes libellés
 * rattachent les mêmes comptes. Deux jeux, deux tableaux de correspondance,
 * deux notes 24 qui n'ont rien à voir l'une avec l'autre (« Achats » côté
 * associations, « Tableau d'exécution budgétaire » ici).
 *
 * ## Comptes réutilisés d'un tableau déjà vérifié
 *
 * La classe 2 (immobilisations) n'a qu'une seule numérotation SYCEBNL, quel
 * que soit le jeu. Les notes 3A et 3B reprennent donc les préfixes déjà
 * établis et testés pour les notes 5A/5B/5C des associations — même compte,
 * même numéro, même découpage « immeuble de placement ». Ce n'est PAS un
 * comblement de lacune depuis l'autre jeu : c'est le même plan de comptes.
 *
 * ## Absence d'amortissement — cohérent avec le reste du jeu
 *
 * Aucune note de ce jeu ne porte de colonne amortissement/dépréciation des
 * immobilisations (note 3A : « IMMOBILISATIONS BRUTES » seulement, pas de
 * 3C/3D comme les 5D-5F associations). Cohérent avec
 * `correspondance-projet-bilan.ts` et `correspondance-projet-compte-exploitation.ts` :
 * ce jeu ne cite aucun compte 28x/29x/68, les immobilisations d'un projet
 * étant décomptabilisées en fin de projet, pas amorties (Partie 3, ch. 3).
 *
 * ## NOTE 9 absente d'ici
 *
 * La note 9 « Fonds du bailleur » a des colonnes DYNAMIQUES — une par
 * bailleur/sous-projet — que ce moteur à colonnes fixes ne représente pas.
 * Elle est servie par `EtatsFinanciersProjetService.noteBailleur()`
 * (`GET /etats-financiers/projet/note-bailleur`), déjà construite, testée,
 * et cumulative depuis l'origine du projet (pas seulement l'exercice — voir
 * son propre en-tête). Transcrite ici comme un simple renvoi, pour que la
 * fiche récapitulative et la couverture (26 notes) restent exactes sans
 * dupliquer un calcul qui existe déjà ailleurs et fonctionne.
 *
 * ## NOTE 22 — lacune du texte officiel, non comblée
 *
 * Le texte officiel ne donne NI colonnes NI rubriques pour la note 22
 * « Dotations et charges pour provisions » — seulement un commentaire. La
 * combler avec la structure de la note 30 associations (qui traite le même
 * sujet) inventerait une note que le texte de CE jeu ne donne pas — exactement
 * la faute que la règle §2.6 interdit. Transcrite en `horsBalance`, la
 * lacune elle-même déclarée comme contenu de la note plutôt que masquée.
 *
 * ## Anomalies relevées au dépouillement, signalées et non corrigées
 *
 * 1. **Note 7, NB** : « Banques et intérêts courus... figurent dans cette
 *    rubrique en négatif si le compte principal attaché est débiteur »
 *    `[texte officiel]`. Formulation inverse de celle, plus claire, du jeu
 *    associations (note 22 : « ... si le compte principal attaché est
 *    créditeur »). Non réinterprétée : les rubriques bancaires de cette note
 *    suivent la même discipline DÉBITEUR/CRÉDITEUR déjà établie pour les
 *    deux jeux (un compte créditeur est un découvert, il relève de la
 *    note 13), qui est le comportement cohérent avec le reste du référentiel,
 *    que le NB littéral ou son inverse.
 * 2. **Note 12** : la rubrique « Etat, impôts sur les bénéfices » ne
 *    correspond à AUCUN compte du plan SYCEBNL, qui commence sa classe 44 à
 *    442 (pas de 441, contrairement au SYSCOHADA). Ne pas lui prêter le
 *    compte 441 du SYSCOHADA — interdit par la règle du skill lui-même
 *    (« ne pas transposer les comptes... du SYSCOHADA à une EBNL »).
 *    Déclarée en attente de rattachement.
 * 3. **Note 21** : le plan ne détaille, pour le compte 677 « Pertes sur
 *    titres de placement », qu'une seule subdivision — 6771 « Pertes sur
 *    cessions de titres de placement », qui reprend exactement le libellé
 *    de la rubrique. Le compte 678 « Pertes et charges sur risques
 *    financiers », que le jeu associations rattache à sa note 31, n'a pas
 *    de rubrique dans cette note-ci : non comblé, un solde sur 678
 *    ressortira en comptes non rattachés.
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

const COLONNES_AVEC_ECHEANCES_DETTES = [
  ...COLONNES_STANDARD,
  { type: 'ECHEANCE_1AN' as const, libelle: 'Dettes à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Dettes à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Dettes à plus de deux ans' },
];

const COLONNES_MOUVEMENTS = [
  { type: 'OUVERTURE' as const, libelle: "A — Montant brut à l'ouverture de l'exercice" },
  { type: 'AUGMENTATIONS' as const, libelle: 'AUGMENTATIONS B' },
  { type: 'DIMINUTIONS' as const, libelle: 'DIMINUTIONS C' },
  { type: 'CLOTURE' as const, libelle: "D = A + B - C (Montant brut à la clôture de l'exercice)" },
];

/**
 * Rubrique que le plan de comptes NORMALISÉ ne permet pas de déterminer : le
 * dossier doit y rattacher ses propres sous-comptes (voir `RattachementNote`).
 */
function enAttente(cle: string, libelle: string, attendu: string) {
  return { cle, libelle, subdivisionAttendue: attendu };
}

export const NOTES_PROJETS: SpecificationNote[] = [
  // ======================================================================
  // PARTIE 1 : INFORMATIONS GENERALES
  // ======================================================================
  {
    code: '1',
    titre: 'INFORMATIONS OBLIGATOIRES',
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Informations' }],
    rubriques: [
      { libelle: 'A - IDENTITE, ORGANISATION', saisie: true },
      {
        libelle:
          'B - DECLARATION DE CONFORMITE AU SYSTEME COMPTABLE DES ENTITES A BUT NON LUCRATIF ET FAITS ' +
          "MARQUANTS DE L'EXERCICE",
        saisie: true,
      },
      { libelle: 'C - REGLES, METHODES COMPTABLES ET DEROGATION AUX PRINCIPES COMPTABLES', saisie: true },
      { libelle: "D - INFORMATIONS COMPLEMENTAIRES RELATIVES AU BILAN ET AU COMPTE D'EXPLOITATION", saisie: true },
    ],
    commentaire:
      'ne mentionner que les éléments ayant une incidence comptable significative ou nuisant à la ' +
      'comparabilité des exercices ; décrire les règles et méthodes utilisées pour l’établissement des états ' +
      'financiers.',
  },
  {
    code: '2',
    titre: 'INFORMATIONS SPECIFIQUES',
    // Chaque sous-rubrique renvoie à un état qui n'est pas encore construit
    // (tableau emplois-ressources, tableau d'exécution budgétaire, tableau
    // de réconciliation de trésorerie — phase 2). Transcrite en saisie,
    // jamais calculée à moitié.
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Informations' }],
    rubriques: [
      { libelle: 'A - TABLEAU EMPLOIS RESSOURCES', saisie: true },
      { libelle: "B - TABLEAU D'EXECUTION BUDGÉTAIRE", saisie: true },
      { libelle: 'C - TABLEAU DE RECONCILIATION DE TRESORERIE', saisie: true },
    ],
    commentaire:
      "indiquer les faits marquants pour chaque état financier ; expliquer les écarts significatifs entre " +
      "budget et réalisation du tableau d'exécution budgétaire.",
  },

  // ======================================================================
  // PARTIE 3 : NOTES SUR LE BILAN
  // ======================================================================
  {
    code: '3A',
    titre: 'IMMOBILISATIONS BRUTES',
    colonnes: COLONNES_MOUVEMENTS,
    renvoyeeDepuis: ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'],
    rubriques: [
      { libelle: 'Brevets, licences, logiciels et droits similaires', comptes: ['212', '213'] },
      { libelle: 'Avances et acomptes sur immobilisations incorporelles', comptes: ['251'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['214', '218', '219'] },
      // Même découpage « immeuble de placement » que la note 5B associations
      // (2281 seul divisionnaire de placement de la classe 22 ; 2315/2325
      // pour les bâtiments) — même plan de comptes, classe 2 (voir en-tête).
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
      { libelle: 'Dépôts et cautionnement', comptes: ['275'] },
      { libelle: 'Autres immobilisations financières', comptes: ['26', '27'], exclusions: ['275'] },
      {
        libelle: 'TOTAL GENERAL',
        totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    ],
    commentaire: "toute variation significative doit être commentée ; joindre l'inventaire physique des immobilisations.",
  },
  {
    code: '3B',
    titre: 'BIENS PRIS EN LOCATION-ACQUISITION',
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Nature du contrat (I ; M ; A)' }, ...COLONNES_MOUVEMENTS],
    // Mêmes divisionnaires « 6 » de chaque famille que la note 5C associations.
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
    commentaire:
      "indiquer la nature du bien, le nom du bailleur et la durée du bail ; joindre l'inventaire physique des " +
      'immobilisations.',
  },
  {
    code: '4',
    sousTableau: 'ACTIF CIRCULANT HAO',
    titre: 'ACTIF CIRCULANT HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BA'],
    rubriques: [
      { libelle: "Créances sur cessions d'immobilisations", comptes: ['485'] },
      { libelle: 'Autres créances hors activités ordinaires', comptes: ['488'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1] },
      { libelle: 'Dépréciations des créances HAO', comptes: ['498'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [2, 3] },
    ],
    commentaire:
      'commenter toute variation significative ; dépréciations : indiquer les événements et circonstances ; ' +
      "indiquer la date et la nature de l'immobilisation achetée et/ou cédée.",
  },
  {
    code: '4',
    sousTableau: 'DETTES CIRCULANTES HAO',
    titre: 'DETTES CIRCULANTES HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['DE'],
    rubriques: [
      { libelle: "Fournisseurs d'investissements", comptes: ['481'], sens: 'CREDITEUR' },
      { libelle: 'Autres dettes hors activités ordinaires', comptes: ['484'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1] },
    ],
  },
  {
    code: '5',
    titre: 'STOCKS ET ENCOURS',
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation (Valeur)' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation (%)' },
    ],
    renvoyeeDepuis: ['BB'],
    rubriques: [
      { libelle: "Biens liés à l'activité", comptes: ['31'] },
      { libelle: 'Marchandises', comptes: ['321', '322'] },
      { libelle: 'Matières premières et fournitures liées', comptes: ['323', '324', '325'] },
      { libelle: 'Autres approvisionnements', comptes: ['33'] },
      // Le compte 35 « Produits finis et services en cours » n'est pas
      // subdivisé entre les deux notions : les deux rubriques y sont
      // confondues, comme 618 pour « Voyages et déplacements » /
      // « Transports administratifs » côté associations.
      enAttente(
        'produits-en-cours',
        'Produits en cours',
        'Le compte 35 « Produits finis et services en cours » ne distingue pas les produits en cours des ' +
          'services en cours : subdiviser 35 et rattacher ici le sous-compte des produits en cours.',
      ),
      enAttente(
        'services-en-cours',
        'Services en cours',
        'Même situation que « Produits en cours » : subdiviser le compte 35 et rattacher ici le sous-compte ' +
          'des services en cours.',
      ),
      { libelle: 'Produits finis', comptes: ['361', '362'] },
      { libelle: 'Produits intermédiaires', comptes: ['367'] },
      { libelle: 'Stocks HAO', comptes: ['38'] },
      { libelle: 'Stocks en cours de route, en consignation ou en dépôt', comptes: ['37'] },
      {
        libelle: 'TOTAL STOCKS ET ENCOURS',
        totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      },
      { libelle: 'Dépréciations des stocks', comptes: ['39'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [10, 11] },
    ],
    commentaire: 'commenter toute variation significative des stocks.',
  },
  {
    code: '6',
    titre: 'CLIENTS-USAGERS ET AUTRES CREANCES',
    colonnes: COLONNES_AVEC_ECHEANCES_CREANCES,
    renvoyeeDepuis: ['BE'],
    rubriques: [
      { libelle: 'Fournisseurs, débiteurs', comptes: ['409'] },
      { libelle: 'Clients-usagers', comptes: ['41'], exclusions: ['411', '419'] },
      { libelle: 'Personnel', comptes: ['42'], sens: 'DEBITEUR' },
      { libelle: 'Organismes sociaux', comptes: ['43'], sens: 'DEBITEUR' },
      { libelle: 'Etat et Collectivités publiques', comptes: ['44'], sens: 'DEBITEUR' },
      { libelle: 'Autres débiteurs divers', comptes: ['47'], exclusions: ['478'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      {
        libelle: 'Dépréciations des créances',
        comptes: ['490', '491', '492', '493', '494', '497'],
        presenterEnNegatif: true,
      },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [6, 7] },
    ],
    commentaire:
      'justifier toute variation significative ; détailler les créances dont le montant est significatif ; ' +
      'justifier les créances anciennes ; indiquer les événements et circonstances motivant la dépréciation ' +
      'et la reprise.',
  },
  {
    code: '7',
    titre: 'DISPONIBILITES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BW'],
    rubriques: [
      { libelle: 'Chèques à encaisser', comptes: ['513'] },
      { libelle: "Chèques à l'encaissement", comptes: ['514'] },
      { libelle: 'Cartes de crédit à encaisser', comptes: ['515'] },
      { libelle: 'Autres valeurs à encaisser', comptes: ['518'] },
      { libelle: 'TOTAL VALEURS A ENCAISSER', totalDeRubriques: [0, 1, 2, 3] },
      // Comptes 52/53 filtrés au débit — un solde créditeur est un découvert,
      // il relève de la note 13. Voir anomalie n° 1 en tête de fichier sur le
      // NB officiel, dont le sens littéral n'est pas appliqué tel quel.
      { libelle: 'Banques locales', comptes: ['521'], sens: 'DEBITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'DEBITEUR' },
      { libelle: 'Banques, dépôt à terme et assimilés', comptes: ['525'], sens: 'DEBITEUR' },
      { libelle: 'Autres Banques', comptes: ['523', '524'], sens: 'DEBITEUR' },
      { libelle: 'Banques intérêts courus', comptes: ['526'], sens: 'DEBITEUR' },
      { libelle: 'Banques postales', comptes: ['531'], sens: 'DEBITEUR' },
      { libelle: 'Autres établissement financiers', comptes: ['532', '533', '538'], sens: 'DEBITEUR' },
      { libelle: 'Etablissement financiers intérêts courus', comptes: ['536'], sens: 'DEBITEUR' },
      { libelle: 'Instruments de monnaie électronique', comptes: ['55'], sens: 'DEBITEUR' },
      // Caisse non filtrée : une caisse créditrice est une anomalie de
      // saisie qui doit rester visible (même raison que note 13 associations).
      { libelle: 'Caisse', comptes: ['57'] },
      {
        libelle: 'TOTAL BANQUES ET CAISSES',
        totalDeRubriques: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      },
      { libelle: 'Dépréciations', comptes: ['592', '593', '595'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [4, 15, 16] },
    ],
    renvoiOfficiel:
      'NB : Banques et intérêts courus et Etablissement financiers intérêts courus figurent dans cette ' +
      'rubrique en négatif si le compte principal attaché est débiteur. Voir anomalie n° 1 en tête de fichier.',
    commentaire:
      'indiquer la date de rapprochement des comptes bancaires ; indiquer la date d’inventaire de la caisse et ' +
      'des instruments de monnaie électronique ; justifier toute variation significative ; détailler les ' +
      'instruments de monnaie électronique si le montant est significatif ; indiquer les événements et ' +
      'circonstances motivant la dépréciation et la reprise.',
  },
  {
    code: '8',
    titre: 'ECARTS DE CONVERSION',
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Devises' },
      { type: 'LIBRE' as const, libelle: 'Montant en devises' },
      { type: 'LIBRE' as const, libelle: 'Cours UML Année acquisition' },
      { type: 'LIBRE' as const, libelle: 'Cours UML 31/12' },
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
    ],
    renvoyeeDepuis: ['BY', 'DY'],
    rubriques: [
      { libelle: 'Ecarts de conversion-actif', comptes: ['478'], sens: 'DEBITEUR' },
      { libelle: 'Ecart de conversion-passif', comptes: ['479'], sens: 'CREDITEUR' },
    ],
    renvoiOfficiel: 'UML : Unités Monétaires légales.',
    commentaire: 'faire un commentaire.',
  },
  {
    code: '9',
    titre: 'FONDS DU BAILLEUR',
    // Colonnes dynamiques (une par bailleur/sous-projet) — voir en-tête de
    // fichier. Servie par un endpoint séparé, déjà construit et testé.
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Voir GET /etats-financiers/projet/note-bailleur' }],
    rubriques: [
      {
        libelle:
          'Cette note a des colonnes dynamiques (une par bailleur/sous-projet) que ce moteur ne représente ' +
          'pas. Elle est servie par EtatsFinanciersProjetService.noteBailleur(), déjà construite, testée et ' +
          "cumulée depuis l'origine du projet.",
        saisie: true,
      },
    ],
    renvoiOfficiel:
      '(1) Le nombre de colonnes est fonction du nombre de bailleurs et/ou sous-projets. (2) Le montant ' +
      'consommé au titre d’un exercice représente le solde du compte 702 Quote-part de fonds d’administration ' +
      'transférés qu’il convient de subdiviser par nature de projet.',
    commentaire:
      "indiquer pour chaque projet le niveau d'utilisation des fonds affectés en pourcentage par catégorie de " +
      "fonds (fonds d'investissement et fonds d'administration) et de façon globale ; expliquer les motifs " +
      "liés aux éventuels retards dans le cadre de l'exécution des projets.",
  },
  {
    code: '10',
    titre: 'SUBVENTIONS',
    colonnes: [...COLONNES_STANDARD, { type: 'LIBRE' as const, libelle: 'Echéances' }],
    renvoyeeDepuis: ['CD'],
    rubriques: [
      { libelle: 'État', comptes: ['1411'], natureCreditrice: true },
      { libelle: 'Région', comptes: ['1412'], natureCreditrice: true },
      { libelle: 'Département', comptes: ['1413'], natureCreditrice: true },
      { libelle: 'Communes et collectivités publiques décentralisées', comptes: ['1414'], natureCreditrice: true },
      { libelle: 'Entités publiques ou mixtes', comptes: ['1415'], natureCreditrice: true },
      { libelle: 'Entités et organismes privés', comptes: ['1416'], natureCreditrice: true },
      { libelle: 'Organismes internationaux', comptes: ['1417'], natureCreditrice: true },
      { libelle: 'Autres', comptes: ['1418', '148'], natureCreditrice: true },
      { libelle: 'TOTAL SUBVENTIONS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  {
    code: '11',
    titre: 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DA', 'DB'],
    rubriques: [
      // Compte 181 « Emprunts obligataires » n'est PAS listé par cette note
      // (contrairement à la note 1 associations) : non comblé, voir en-tête.
      { libelle: 'Emprunts et dettes auprès des établissements de crédit', comptes: ['182'], natureCreditrice: true },
      { libelle: "Avances reçues de l'Etat", comptes: ['183'], natureCreditrice: true },
      { libelle: 'Dépôts et cautionnements reçus', comptes: ['185'], natureCreditrice: true },
      { libelle: 'Intérêts courus', comptes: ['186'], natureCreditrice: true },
      { libelle: 'Autres emprunts et dettes', comptes: ['188'], natureCreditrice: true },
      { libelle: 'TOTAL EMPRUNTS ET DETTES FINANCIERES', totalDeRubriques: [0, 1, 2, 3, 4] },
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
      { libelle: 'TOTAL DETTES DE LOCATION-ACQUISITION', totalDeRubriques: [6, 7, 8, 9, 10] },
      { libelle: 'Provisions pour litiges', comptes: ['191'], natureCreditrice: true },
      { libelle: 'Provisions pour pertes de change', comptes: ['194'], natureCreditrice: true },
      { libelle: 'Provisions pour pensions et obligations assimilées', comptes: ['196'], natureCreditrice: true },
      { libelle: 'Provisions pour amendes et pénalités', comptes: ['1981'], natureCreditrice: true },
      { libelle: 'Autres provisions', comptes: ['198'], exclusions: ['1981'], natureCreditrice: true },
      {
        libelle: 'TOTAL PROVISIONS FINANCIERES POUR RISQUES ET CHARGES',
        totalDeRubriques: [12, 13, 14, 15, 16],
      },
    ],
    commentaire:
      "pour chaque emprunt et dette de location-acquisition, mentionner la date d'octroi, le nom de " +
      "l'organisme financier, le montant initial, la durée du crédit, les garanties données par la société ; " +
      'indiquer les événements et circonstances motivant la provision et la reprise ; pour les pensions et ' +
      "obligations de retraite, indiquer la méthode d'évaluation retenue, le nom de la compagnie d'assurance " +
      'ou du fonds de pension, le descriptif de la convention, la périodicité des versements, le montant et ' +
      'la durée de la convention pour les actifs du régime.',
  },
  {
    code: '12',
    titre: 'DETTES FOURNISSEURS ET ASSIMILEES, FISCALES ET SOCIALES',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DG', 'DH'],
    rubriques: [
      { libelle: 'Fournisseurs', comptes: ['40'], exclusions: ['409'], sens: 'CREDITEUR' },
      { libelle: 'Clients-usagers créditeurs', comptes: ['419'], sens: 'CREDITEUR' },
      { libelle: 'DETTES FOURNISSEURS ET ASSIMILEES', totalDeRubriques: [0, 1] },
      { libelle: 'Personnel, rémunérations dues', comptes: ['422'], sens: 'CREDITEUR' },
      { libelle: 'Personnel, congés à payer', comptes: ['4281'], sens: 'CREDITEUR' },
      { libelle: 'Charges sociales sur congés à payer', comptes: ['4382'], sens: 'CREDITEUR' },
      { libelle: 'Autres personnel', comptes: ['423', '424', '425', '427', '4286'], sens: 'CREDITEUR' },
      { libelle: 'Caisse de sécurité sociale', comptes: ['431'], sens: 'CREDITEUR' },
      { libelle: 'Caisse de retraite', comptes: ['432'], sens: 'CREDITEUR' },
      { libelle: 'Mutuelle de santé', comptes: ['4331'], sens: 'CREDITEUR' },
      { libelle: 'Assurance Retraite', comptes: ['4332'], sens: 'CREDITEUR' },
      { libelle: 'Autres charges sociales à payer', comptes: ['4381', '4386'], sens: 'CREDITEUR' },
      { libelle: 'Autres cotisations et organismes sociaux', comptes: ['4333'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES SOCIALES', totalDeRubriques: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      // Voir anomalie n° 2 en tête de fichier : aucun compte 441 au plan
      // SYCEBNL (classe 44 commence à 442).
      enAttente(
        'etat-impots-benefices',
        'Etat, impôts sur les bénéfices',
        "Le plan SYCEBNL ne comporte aucun compte d'« impôt sur les bénéfices » (sa classe 44 commence au " +
          "compte 442, sans équivalent du 441 SYSCOHADA) : créer un sous-compte dédié sous la classe 44 si " +
          "cet impôt s'applique au projet, et le rattacher ici.",
      ),
      { libelle: 'Etat, autres impôts et taxes', comptes: ['442'], sens: 'CREDITEUR' },
      { libelle: 'Etat, TVA', comptes: ['443', '444', '445', '446'], sens: 'CREDITEUR' },
      { libelle: 'Etat, impôts retenus à la source', comptes: ['447'], sens: 'CREDITEUR' },
      { libelle: 'Autres dettes Etat', comptes: ['448', '449'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES FISCALES', totalDeRubriques: [14, 15, 16, 17, 18] },
      {
        libelle: 'TOTAL DETTES FOURNISSEURS ET ASSIMILEES, DETTES FISCALES ET SOCIALES',
        totalDeRubriques: [2, 13, 19],
      },
    ],
    commentaire: 'commenter toute variation significative ; commenter les dettes anciennes.',
  },
  {
    code: '13',
    titre: "BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE",
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['DW'],
    rubriques: [
      // Le plan ne prévoit qu'UN compte d'escompte (565, « escompte de
      // crédits ordinaires ») — aucun compte distinct pour un « escompte de
      // crédit de campagne ». Non comblé.
      enAttente(
        'escomptes-credit-campagne',
        'Escomptes de crédit de campagne',
        "Le plan SYCEBNL n'a pas de compte distinct pour l'escompte de crédit de campagne (seul le compte " +
          '565 « Escompte de crédits ordinaires » existe) : créer un sous-compte dédié et le rattacher ici.',
      ),
      { libelle: 'Escomptes de crédit ordinaires', comptes: ['565'], natureCreditrice: true },
      { libelle: "TOTAL : BANQUES, CREDITS D'ESCOMPTE ET DE TRESORERIE", totalDeRubriques: [0, 1] },
      { libelle: 'Banques locales', comptes: ['521'], sens: 'CREDITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'CREDITEUR' },
      { libelle: 'Autres Banques', comptes: ['523', '524', '525'], sens: 'CREDITEUR' },
      { libelle: 'Banques, intérêts courus', comptes: ['526'], sens: 'CREDITEUR' },
      { libelle: 'Crédit de trésorerie', comptes: ['56'], exclusions: ['565'], natureCreditrice: true },
      { libelle: 'TOTAL : BANQUES, CREDITS DE TRESORERIE', totalDeRubriques: [3, 4, 5, 6, 7] },
      { libelle: 'TOTAL GENERAL', totalDeRubriques: [2, 8] },
    ],
    renvoiOfficiel:
      '« Banques et intérêts courus » figure dans cette rubrique si le compte principal attaché est ' +
      'créditeur.',
    commentaire:
      "commenter toute variation significative ; indiquer le nom de l'organisme, les conditions de crédit, " +
      "le taux d'intérêt, la durée du crédit.",
  },

  // ======================================================================
  // PARTIE 4 : NOTES SUR LE COMPTE D'EXPLOITATION
  // ======================================================================
  {
    code: '14',
    titre: 'REVENUS ET AUTRES PRODUITS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['RB', 'RD'],
    rubriques: [
      // Le compte 705 « ventes marchandises/services/produits finis » n'est
      // pas subdivisé — la même confusion que « Matières consommables » côté
      // achats associations. Trois lignes du modèle, un seul compte.
      enAttente(
        'ventes-marchandises',
        'Ventes de marchandises',
        'Le compte 705 « Ventes marchandises, services et produits finis » ne distingue pas la nature de la ' +
          'vente : subdiviser 705 et rattacher ici le sous-compte des ventes de marchandises.',
      ),
      enAttente(
        'ventes-produits-fabriques',
        'Ventes de produits fabriqués',
        'Même situation que « Ventes de marchandises » : subdiviser le compte 705 et rattacher ici le ' +
          'sous-compte des ventes de produits fabriqués.',
      ),
      enAttente(
        'ventes-travaux-services',
        'Ventes de travaux et services',
        'Même situation que « Ventes de marchandises » : subdiviser le compte 705 et rattacher ici le ' +
          'sous-compte des ventes de travaux et services.',
      ),
      { libelle: 'Produits accessoires', comptes: ['707'] },
      { libelle: 'Production immobilisée', comptes: ['72'] },
      { libelle: "Subventions d'exploitation", comptes: ['71'] },
      {
        libelle: "Autres produits et transferts de charges d'exploitation",
        comptes: ['708', '73', '75', '77', '78'],
      },
      { libelle: 'TOTAL : AUTRES PRODUITS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire:
      'justifier toute variation significative ; détailler produits intermédiaires, produits résiduels, ' +
      'produits accessoires, autres produits si significatifs.',
  },
  {
    code: '15',
    titre: 'ACHATS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TA', 'TB'],
    rubriques: [
      { libelle: "Achats de biens et services liés à l'activité", comptes: ['601'] },
      // Compte 602 combine marchandises et matières premières/fournitures :
      // les deux rubriques suivantes s'y confondent, comme pour les achats
      // associations.
      enAttente(
        'achats-marchandises',
        'Achats de marchandises',
        'Le compte 602 combine marchandises, matières premières et fournitures liées : subdiviser 602 et ' +
          'rattacher ici le sous-compte des achats de marchandises.',
      ),
      enAttente(
        'achats-matieres-fournitures',
        'Achats de matières premières et fournitures liées',
        'Même situation que « Achats de marchandises » : subdiviser le compte 602 et rattacher ici le ' +
          'sous-compte des matières premières et fournitures liées.',
      ),
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
      enAttente(
        'achats-etudes',
        'Achats études, prestations de services, de travaux matériels et équipements',
        'Sous-compte de 605 pour les achats d’études, prestations de services, travaux et équipements.',
      ),
      { libelle: "Achats d'emballages", comptes: ['608'] },
      enAttente('frais-sur-achats', 'Frais sur achats', 'Sous-compte de 605 pour les frais accessoires sur achats.'),
      // Voir en-tête (référence à l'anomalie associations 24/25) : le compte
      // 619 est listé au plan sous les classes 60 et 61, sans être ventilé.
      enAttente(
        'rabais-remises-ristournes',
        'Remises rabais, et ristournes obtenus',
        'Le compte 619 est listé au plan sous les classes 60 (Achats) ET 61 (Transports), sans être ' +
          "ventilé entre les deux. Le rattacher d'office ici compterait deux fois le même solde avec la " +
          'note 16 « Transports » : subdiviser 619 en un sous-compte propre aux achats et le rattacher ici.',
      ),
      { libelle: 'TOTAL ACHATS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '16',
    titre: 'TRANSPORTS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TD'],
    rubriques: [
      { libelle: 'Transports sur ventes', comptes: ['612'] },
      { libelle: 'Transports pour le compte de tiers', comptes: ['613'] },
      { libelle: 'Transport du personnel', comptes: ['614'] },
      { libelle: 'Transports de plis', comptes: ['616'] },
      enAttente(
        'voyages-deplacements',
        'Voyages et déplacements',
        "Le plan SYCEBNL s'arrête au compte 618 « Autres frais de transport », qui couvre à la fois les " +
          'voyages et déplacements et les transports administratifs : subdiviser 618 et rattacher ici le ' +
          'sous-compte des voyages et déplacements.',
      ),
      enAttente(
        'transports-administratifs',
        'Transports administratifs',
        "Même situation que « Voyages et déplacements » : subdiviser le compte 618 et rattacher ici le " +
          'sous-compte des transports administratifs.',
      ),
      enAttente(
        'rabais-remises-ristournes',
        'Rabais, remises et ristournes obtenus',
        'Le compte 619 est listé au plan sous les classes 60 (Achats) ET 61 (Transports), sans être ' +
          "ventilé entre les deux. Le rattacher d'office ici compterait deux fois le même solde avec la " +
          "note 15 « Achats » : subdiviser 619 en un sous-compte propre aux transports et le rattacher ici.",
      ),
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '17',
    titre: 'SERVICES EXTERIEURS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TG'],
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
      { libelle: 'Redevances pour brevets, licences, logiciels, concessions et droits similaires', comptes: ['634'] },
      { libelle: 'Cotisations', comptes: ['635'] },
      { libelle: "Rémunérations de personnel extérieur à l'entité", comptes: ['637'] },
      { libelle: 'Autres charges externes', comptes: ['638'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '18',
    titre: 'IMPOTS ET TAXES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TH'],
    rubriques: [
      { libelle: 'Impôts et taxes directs', comptes: ['641'] },
      { libelle: 'Impôts et taxes indirects', comptes: ['645'] },
      { libelle: "Droits d'enregistrement", comptes: ['646'] },
      { libelle: 'Pénalités et amendes fiscales', comptes: ['647'] },
      { libelle: 'Autres impôts et taxes', comptes: ['648'] },
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
    code: '19',
    titre: 'AUTRES CHARGES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TI'],
    rubriques: [
      // 651 est subdivisé au plan : 6511 clients-usagers, 6515 autres
      // débiteurs (pas de 6512 « adhérents » utile ici, ce jeu n'en a pas).
      { libelle: 'Pertes sur créances', comptes: ['6511'] },
      { libelle: 'Pertes sur autres débiteurs', comptes: ['6515'] },
      { libelle: 'Perte de change sur créances', comptes: ['676'] },
      { libelle: 'Pénalités et amendes pénales', comptes: ['657'] },
      { libelle: 'Dons et mécénat', comptes: ['654'] },
      { libelle: 'Autres charges diverses', comptes: ['658'] },
      {
        libelle: "Charges pour provisions pour risques à court terme d'exploitation",
        comptes: ['659'],
        renvoi: 'voir note 22',
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les organismes bénéficiaires des dons.',
  },
  {
    code: '20A',
    titre: 'CHARGES DE PERSONNEL',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TJ'],
    rubriques: [
      { libelle: 'Rémunérations directes versées au personnel national', comptes: ['661'] },
      { libelle: 'Rémunérations directes versées au personnel non national', comptes: ['662'] },
      { libelle: 'Indemnités forfaitaires versées au personnel', comptes: ['663'] },
      { libelle: 'Charges sociales (personnel national)', comptes: ['6641'] },
      { libelle: 'Charges sociales (personnel non national)', comptes: ['6642'] },
      { libelle: 'Rémunération transférée de personnel extérieur', comptes: ['667'] },
      { libelle: 'Autres charges sociales', comptes: ['668'] },
      {
        libelle: 'Dégrèvements et annulations des charges sociales',
        comptes: ['669'],
        presenterEnNegatif: true,
        renvoi: "(1) Ce compte a un solde créditeur, son montant doit être précédé d'un signe (-).",
      },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer la nature et la durée du contrat du personnel ' +
      'extérieur.',
  },
  {
    code: '20B',
    sousTableau: 'PERSONNEL PROPRE',
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL — 1. Personnel propre',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS — Nationaux (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS — Autres Etats de la Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS — Hors Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS — Total (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE — Nationaux (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE — Autres Etats de la Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE — Hors Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE — Total (M / F)' },
    ],
    rubriques: [
      { libelle: 'YA. 1. Cadres supérieurs', saisie: true },
      { libelle: 'YB. 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { libelle: 'YC. 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { libelle: 'YD. 4. Employés, manœuvres, ouvriers et apprentis', saisie: true },
      { libelle: 'YE. TOTAL (1)', saisie: true },
      { libelle: 'YF. Permanents', saisie: true },
      { libelle: 'YG. Saisonniers', saisie: true },
    ],
    renvoiOfficiel: 'M : Masculin ; F : Féminin.',
    commentaire: 'faire un commentaire si nécessaire en cas de mouvement significatif du personnel.',
  },
  {
    code: '20B',
    sousTableau: 'PERSONNEL EXTERIEUR ET BENEVOLE',
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL — 2. Personnel extérieur et bénévole',
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: "Facturation à l'entité" }],
    rubriques: [
      { libelle: 'YH. 1. Cadres supérieurs', saisie: true },
      { libelle: 'YI. 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { libelle: 'YJ. 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { libelle: 'YK. 4. Employés, manœuvres, ouvriers et apprentis', saisie: true },
      { libelle: 'YL. TOTAL (2)', saisie: true },
      { libelle: 'YM. Permanents', saisie: true },
      { libelle: 'YN. Saisonniers', saisie: true },
      { libelle: 'YO. TOTAL (1 + 2)', saisie: true },
    ],
  },
  {
    code: '21',
    titre: 'CHARGES ET REVENUS FINANCIERS',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TK'],
    rubriques: [
      { libelle: 'Intérêts des emprunts', comptes: ['671'] },
      { libelle: 'Intérêts dans loyers de location-acquisition', comptes: ['672'] },
      { libelle: 'Escomptes accordés', comptes: ['673'] },
      { libelle: 'Autres intérêts', comptes: ['674'] },
      { libelle: 'Pertes de change financières', comptes: ['676'] },
      // Voir anomalie n° 3 en tête de fichier : 678 non repris par cette note.
      { libelle: 'Pertes sur cessions de titres de placement', comptes: ['677'] },
      { libelle: 'Charges pour provisions à court terme à caractère financier', comptes: ['679'] },
      { libelle: 'TOTAL : FRAIS FINANCIERS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Intérêts de prêts et créances diverses', comptes: ['771'], natureCreditrice: true },
      {
        libelle: 'Revenus de participations et autres titres immobilisés',
        comptes: ['772'],
        natureCreditrice: true,
      },
      { libelle: 'Escomptes obtenus', comptes: ['773'], natureCreditrice: true },
      { libelle: 'Revenus de placement', comptes: ['774'], natureCreditrice: true },
      { libelle: 'Gains de change financiers', comptes: ['776'], natureCreditrice: true },
      { libelle: 'Gains sur cessions de titres de placement', comptes: ['777'], natureCreditrice: true },
      { libelle: 'Transferts de charges financières', comptes: ['787'], natureCreditrice: true },
      {
        libelle: 'Reprises de charges pour provisions à court terme à caractère financier',
        comptes: ['779'],
        natureCreditrice: true,
      },
      {
        libelle: 'TOTAL : REVENUS FINANCIERS',
        totalDeRubriques: [8, 9, 10, 11, 12, 13, 14, 15],
      },
      // Résultat financier = revenus - frais, comme aux notes 31/32 associations.
      { libelle: 'TOTAL', totalDeRubriques: [16], moinsRubriques: [7] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '22',
    titre: 'DOTATIONS ET CHARGES POUR PROVISIONS',
    // LACUNE DU TEXTE OFFICIEL, non comblée — voir en-tête de fichier. Le
    // texte ne donne ni colonnes ni rubriques pour cette note, seulement un
    // commentaire. La combler avec la structure de la note 30 associations
    // inventerait une note que CE jeu ne donne pas.
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: '[texte officiel] Colonnes non données par la source' }],
    rubriques: [
      {
        libelle:
          '[texte officiel] Le référentiel ne donne ni colonnes ni rubriques pour cette note — seulement le ' +
          'commentaire ci-dessous. Non comblé depuis la note 30 du jeu associations, qui traite le même ' +
          'sujet mais reste un jeu distinct (règle §2.6). Le compte 69 « Dotations aux provisions » est déjà ' +
          'rattaché au poste TJ du compte d’exploitation ; seul le détail par nature manque ici.',
        saisie: true,
      },
    ],
    commentaire:
      'indiquer les événements et circonstances qui ont conduit à la constitution et à la reprise de la ' +
      'provision.',
  },
  {
    code: '23',
    titre: 'AUTRES CHARGES ET PRODUITS HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TL'],
    rubriques: [
      // Même anomalie de numérotation 8311/8315 que la note 32 associations
      // (subdivisions du compte 832 numérotées dans la plage du 831).
      { libelle: 'Charges H.A.O. constatées (compte 831)', comptes: ['831'], exclusions: ['8311', '8315'] },
      {
        libelle: 'Dons en nature (compte 832) à détailler : non affectés / affectés',
        comptes: ['832', '8311', '8315'],
        renvoi: '(1) à détailler : non affectés / affectés',
      },
      { libelle: 'Pertes sur créances HAO', comptes: ['834'] },
      { libelle: 'Abandons de créances consentis', comptes: ['836'] },
      { libelle: 'Charges pour provisions pour risques à court terme HAO', comptes: ['839'] },
      { libelle: 'TOTAL : AUTRES CHARGES HAO', totalDeRubriques: [0, 1, 2, 3, 4] },
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
          '(1) à détailler : Dons en nature non affectés / Prestations de services en nature / Dons en ' +
          'nature affectés',
      },
      { libelle: 'Contributions volontaires en numéraire', comptes: ['843'], natureCreditrice: true },
      { libelle: 'Transferts de charges HAO', comptes: ['848'], natureCreditrice: true },
      {
        libelle: 'Reprises des charges pour provisions à court terme HAO',
        comptes: ['849'],
        natureCreditrice: true,
      },
      { libelle: 'Reprises de provisions H.A.O', comptes: ['86'], natureCreditrice: true },
      { libelle: "Subventions d'équilibre", comptes: ['88'], natureCreditrice: true },
      { libelle: 'TOTAL : AUTRES PRODUITS HAO', totalDeRubriques: [6, 7, 8, 9, 10, 11, 12] },
      { libelle: 'TOTAL', totalDeRubriques: [13], moinsRubriques: [5] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '24',
    titre: "TABLEAU D'EXECUTION BUDGETAIRE",
    // Le budget n'est pas une donnée comptable — même situation que la note
    // 35 associations. Suppose la brique budgétaire (phase 8).
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Code' },
      { type: 'LIBRE' as const, libelle: 'Libellé' },
      { type: 'LIBRE' as const, libelle: "Budget de l'exercice (1)" },
      { type: 'LIBRE' as const, libelle: 'Décaissement (2)' },
      { type: 'LIBRE' as const, libelle: 'Engagement (3)' },
      { type: 'LIBRE' as const, libelle: 'Réalisation (4 = 2 + 3)' },
      { type: 'LIBRE' as const, libelle: 'Crédit Disponible (5 = 1 - 4)' },
      { type: 'LIBRE' as const, libelle: 'Exécution budget (%) (4/1)' },
    ],
    rubriques: [
      { libelle: 'Lignes de la nomenclature budgétaire du projet', saisie: true },
      { libelle: 'TOTAL', saisie: true },
    ],
    renvoiOfficiel: 'Remplir, code et libellé, suivant la nomenclature budgétaire du projet.',
  },
];
