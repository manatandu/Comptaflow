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
 * discipline que pour le bilan et le compte d'exploitation de ce jeu · jamais
 * complété depuis l'autre jeu, jamais supposé que les mêmes libellés
 * rattachent les mêmes comptes. Deux jeux, deux tableaux de correspondance,
 * deux notes 24 qui n'ont rien à voir l'une avec l'autre (« Achats » côté
 * associations, « Tableau d'exécution budgétaire » ici).
 *
 * ## Comptes réutilisés d'un tableau déjà vérifié
 *
 * La classe 2 (immobilisations) n'a qu'une seule numérotation SYCEBNL, quel
 * que soit le jeu. Les notes 3A et 3B reprennent donc les préfixes déjà
 * établis et testés pour les notes 5A/5B/5C des associations · même compte,
 * même numéro, même découpage « immeuble de placement ». Ce n'est PAS un
 * comblement de lacune depuis l'autre jeu : c'est le même plan de comptes.
 *
 * ## Absence d'amortissement · cohérent avec le reste du jeu
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
 * La note 9 « Fonds du bailleur » a des colonnes DYNAMIQUES · une par
 * bailleur/sous-projet · que ce moteur à colonnes fixes ne représente pas.
 * Elle est servie par `EtatsFinanciersProjetService.noteBailleur()`
 * (l'état « Note 9 · Fonds du bailleur »), déjà construite, testée,
 * et cumulative depuis l'origine du projet (pas seulement l'exercice · voir
 * son propre en-tête). Transcrite ici comme un simple renvoi, pour que la
 * fiche récapitulative et la couverture (26 notes) restent exactes sans
 * dupliquer un calcul qui existe déjà ailleurs et fonctionne.
 *
 * ## NOTE 22 · lacune du texte officiel, non comblée
 *
 * Le texte officiel ne donne NI colonnes NI rubriques pour la note 22
 * « Dotations et charges pour provisions » · seulement un commentaire. La
 * combler avec la structure de la note 30 associations (qui traite le même
 * sujet) inventerait une note que le texte de CE jeu ne donne pas · exactement
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
 *    compte 441 du SYSCOHADA · interdit par la règle du skill lui-même
 *    (« ne pas transposer les comptes... du SYSCOHADA à une EBNL »).
 *    Déclarée en attente de rattachement.
 * 3. **Note 21** : le plan ne détaille, pour le compte 677 « Pertes sur
 *    titres de placement », qu'une seule subdivision · 6771 « Pertes sur
 *    cessions de titres de placement », qui reprend exactement le libellé
 *    de la rubrique. Le compte 678 « Pertes et charges sur risques
 *    financiers » n'a pas de rubrique dans cette note-ci : non comblé. Il
 *    est pris par le poste TK (compte 67) du compte d'exploitation, donc
 *    chiffré à l'état et ABSENT de la note 21, qui ne recoupe alors plus TK
 *    de son montant. Il ne ressort PAS en comptes non rattachés (l'écrit
 *    d'avant la passe R6 le disait à tort).
 * 4. **Note 19** : la rubrique « Perte de change sur créances » n'a aucun
 *    compte au plan SYCEBNL, qui n'ouvre sous le 65 que 651, 652, 654, 657,
 *    658 et 659. Déclarée en attente, sans compte prescrit · jamais
 *    rattachée au 676 « Pertes de change financières », qui relève de TK et
 *    de la note 21 et y serait compté deux fois (passe R6, D4).
 * 5. **Note 16** : la maquette ne porte aucune ligne de rabais, remises et
 *    ristournes, alors que le poste TD lit tout le 61, 619 compris. Non
 *    comblé : un solde sur 61900000 laisse le total de la note 16 en deçà
 *    de TD de son montant. La ligne de la note 25 des associations n'est
 *    pas empruntée (passe R6, D14).
 * 6. **Note 11** : la maquette ne liste pas les emprunts obligataires
 *    (181), que le poste DA (compte 18) du bilan prend. Non comblé : un
 *    solde au 181 n'est chiffré dans aucune rubrique de la note.
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
  { type: 'OUVERTURE' as const, libelle: "A · Montant brut à l'ouverture de l'exercice" },
  { type: 'AUGMENTATIONS' as const, libelle: 'AUGMENTATIONS B' },
  { type: 'DIMINUTIONS' as const, libelle: 'DIMINUTIONS C' },
  { type: 'CLOTURE' as const, libelle: "D = A + B - C (Montant brut à la clôture de l'exercice)" },
];

/**
 * Colonnes de la note 3A, que le modèle découpe plus finement · « A (MONTANT
 * BRUT A L'OUVERTURE DE L'EXERCICE) | AUGMENTATIONS B (Acquisitions/Apports/
 * Créations ; Virements de poste à poste ; Suite à une Réévaluation pratiquée
 * au cours de l'exercice) | DIMINUTIONS C (Cessions/Scissions Hors service ;
 * Virements de poste à poste) | D = A + B - C » (Partie 4 ch. 3, NOTE 3A). La
 * 3B, elle, n'écrit que « AUGMENTATIONS B | DIMINUTIONS C » et garde
 * `COLONNES_MOUVEMENTS`.
 *
 * Même lecture qu'aux notes 5A et 5B des associations (passe R6, B11) · B et
 * C restent le mouvement débit et crédit LU EN BALANCE, pour que
 * D = A + B - C tienne ; la réévaluation est un MONTANT qu'aucune balance ne
 * distingue : LIBRE, vide, sous le motif écrit dans
 * `rubriques-en-saisie.spec.ts` (`VIDES_MOTIVEES`), jamais en saisie sur une
 * ligne chiffrée. Les deux sous-colonnes de virements sont SERVIES pour la
 * mise en service d'un bien en cours, reconnue par la liaison de la fiche
 * (décision D6 de Manasse, 2026-10-01, `virements-mise-en-service.ts`), et
 * ce montant sort des deux premières sous-colonnes, intitulées comme le texte
 * les nomme (« Acquisitions/Apports/Créations », « Cessions/Scissions Hors
 * service ») et non plus comme le total, qu'elles ne sont plus · la
 * réévaluation et un virement passé à la main y restent, faute de liaison.
 * Constante PROPRE à ce jeu · les deux jeux ne partagent aucun objet de note.
 */
const COLONNES_MOUVEMENTS_DETAILLEES = [
  { type: 'OUVERTURE' as const, libelle: "A · Montant brut à l'ouverture de l'exercice" },
  { type: 'AUGMENTATIONS' as const, libelle: 'B · Acquisitions/Apports/Créations' },
  { type: 'VIREMENTS_AUGMENTATION' as const, libelle: 'B · Virements de poste à poste' },
  { type: 'LIBRE' as const, libelle: "B · Suite à une réévaluation pratiquée au cours de l'exercice" },
  { type: 'DIMINUTIONS' as const, libelle: 'C · Cessions/Scissions Hors service' },
  { type: 'VIREMENTS_DIMINUTION' as const, libelle: 'C · Virements de poste à poste' },
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
    // Toujours due, même source que la note 2 des associations (passe R2, B1).
    applicableDOffice:
      'SYCEBNL Partie 4 ch. 1, section 6 · les Notes annexes « doivent comporter obligatoirement une ' +
      'déclaration explicite de conformité », portée par la rubrique B de cette note.',
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Informations' }],
    rubriques: [
      { cle: 'a-identite-organisation', libelle: 'A - IDENTITE, ORGANISATION', saisie: true },
      {
        cle: 'b-declaration-de-conformite-au-systeme-comptable', libelle:
          'B - DECLARATION DE CONFORMITE AU SYSTEME COMPTABLE DES ENTITES A BUT NON LUCRATIF ET FAITS ' +
          "MARQUANTS DE L'EXERCICE",
        saisie: true,
      },
      { cle: 'c-regles-methodes-comptables-et-derogation-aux-p', libelle: 'C - REGLES, METHODES COMPTABLES ET DEROGATION AUX PRINCIPES COMPTABLES', saisie: true },
      { cle: 'd-informations-complementaires-relatives-au-bila', libelle: "D - INFORMATIONS COMPLEMENTAIRES RELATIVES AU BILAN ET AU COMPTE D'EXPLOITATION", saisie: true },
    ],
    commentaire:
      'ne mentionner que les éléments ayant une incidence comptable significative ou nuisant à la ' +
      'comparabilité des exercices ; décrire les règles et méthodes utilisées pour l’établissement des états ' +
      'financiers.',
  },
  {
    code: '2',
    titre: 'INFORMATIONS SPECIFIQUES',
    // Les trois états auxquels ces sous-rubriques renvoient EXISTENT depuis
    // le 2026-08 (tableau emplois-ressources, tableau d'exécution
    // budgétaire, tableau de réconciliation de trésorerie, fenêtre États
    // financiers). Cette note reste pourtant en SAISIE, et ce n'est plus un
    // ajournement : son commentaire officiel demande « les faits marquants
    // pour chaque état financier » et « les écarts significatifs entre
    // budget et réalisation ». Ce sont des explications rédigées, pas des
    // chiffres · aucune balance et aucun tableau ne les portent. Elles sont
    // stockées depuis le 2026-09-03 (`SaisieNote`).
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Informations' }],
    rubriques: [
      { cle: 'a-tableau-emplois-ressources', libelle: 'A - TABLEAU EMPLOIS RESSOURCES', saisie: true },
      { cle: 'b-tableau-d-execution-budgetaire', libelle: "B - TABLEAU D'EXECUTION BUDGÉTAIRE", saisie: true },
      { cle: 'c-tableau-de-reconciliation-de-tresorerie', libelle: 'C - TABLEAU DE RECONCILIATION DE TRESORERIE', saisie: true },
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
    colonnes: COLONNES_MOUVEMENTS_DETAILLEES,
    renvoyeeDepuis: ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'],
    rubriques: [
      { libelle: 'Brevets, licences, logiciels et droits similaires', comptes: ['212', '213'] },
      { libelle: 'Avances et acomptes sur immobilisations incorporelles', comptes: ['251'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['214', '218', '219'] },
      // Même découpage « immeuble de placement » que la note 5B associations
      // (2281 seul divisionnaire de placement de la classe 22 ; 2315/2325
      // pour les bâtiments) · même plan de comptes, classe 2 (voir en-tête).
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
    // « Nature du contrat » qualifie le contrat, aucun compte ne la dit : elle
    // se SAISIT sur chaque ligne chiffrée, d'où les `cle`. Le total n'en porte
    // pas (`cellules-libres-en-saisie.ts`).
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Nature du contrat (I ; M ; A)', saisieSurLigneChiffree: true },
      ...COLONNES_MOUVEMENTS,
    ],
    // Mêmes divisionnaires « 6 » de chaque famille que la note 5C associations.
    rubriques: [
      { cle: 'location-acquisition-terrains', libelle: 'Terrains', comptes: ['2286'] },
      { cle: 'location-acquisition-batiments', libelle: 'Bâtiments', comptes: ['2316', '2326'] },
      {
        cle: 'location-acquisition-materiel-mobilier',
        libelle: 'Matériel, mobilier',
        comptes: ['2416', '2426', '2446'],
      },
      { cle: 'location-acquisition-materiel-transport', libelle: 'Matériel de transport', comptes: ['2456'] },
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'La ligne des autres créances HAO lit aussi le compte 488, que le poste BA du bilan ne prend pas (il ne lit que le 485) : le montant de la note peut dépasser celui du poste.',
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste DE du bilan comprend aussi le compte 4998 (provisions pour risques et charges à court terme H.A.O.), auquel le modèle de cette note ne donne aucune ligne.',
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste BB du bilan comprend aussi les comptes 34 (dons en nature) et 363 (actifs biologiques), auxquels le modèle de cette note ne donne aucune ligne.',
    // BB et TC renvoient ici, comme dans la colonne Note de la liasse
    // (NOTE_PAR_CLE_PROJETS, parité gelée par correspondance-notes-projets.spec).
    renvoyeeDepuis: ['BB', 'TC'],
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation (Valeur)' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation (%)' },
    ],
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
    renvoyeeDepuis: ['BC', 'BD', 'BE'],
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
    renvoyeeDepuis: ['BV', 'BW'],
    rubriques: [
      { libelle: 'Chèques à encaisser', comptes: ['513'] },
      { libelle: "Chèques à l'encaissement", comptes: ['514'] },
      { libelle: 'Cartes de crédit à encaisser', comptes: ['515'] },
      { libelle: 'Autres valeurs à encaisser', comptes: ['518'] },
      { libelle: 'TOTAL VALEURS A ENCAISSER', totalDeRubriques: [0, 1, 2, 3] },
      // Comptes 52/53 filtrés au débit · un solde créditeur est un découvert,
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
    // Les six colonnes de la maquette (Partie 4 ch. 3, note 8), et elles
    // seules. La devise, le montant en devise et les deux cours ne sont
    // portés par aucun compte : la comptabilité est tenue en monnaie légale.
    // « Variation en valeur », rangée après les deux cours, est l'écart
    // entre le cours d'origine et le cours de clôture, c'est-à-dire le solde
    // même des comptes 478 et 479 (fiche du compte 47, Partie 2 ch. 3 : ils
    // « permettent de constater, à la clôture de l'exercice, les écarts entre
    // créances et dettes en devises converties […] et leur évaluation […] à
    // la date de clôture »). Même lecture qu'à la note 14 des associations.
    // « Variation en % » dépend des cours et des montants en devise, qu'aucun
    // compte ne porte · elle reste à saisir. Jusqu'à la passe R6 (D19), une
    // colonne « Année N » absente de la maquette portait l'écart, et les deux
    // colonnes officielles imprimaient un N moins N-1 de ces écarts, autre
    // grandeur, vide sur un premier exercice.
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Devises' },
      { type: 'LIBRE' as const, libelle: 'Montant en devises' },
      { type: 'LIBRE' as const, libelle: 'Cours UML Année acquisition' },
      { type: 'LIBRE' as const, libelle: 'Cours UML 31/12' },
      { type: 'EXERCICE_N' as const, libelle: 'Variation en valeur' },
      { type: 'LIBRE' as const, libelle: 'Variation en %' },
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
    renvoyeeDepuis: ['CA', 'DF', 'RA'],
    // Colonnes dynamiques (une par bailleur/sous-projet) · voir en-tête de
    // fichier. Le tableau chiffré est servi par l'état « Note 9 · Fonds du
    // bailleur » (`EtatsFinanciersProjetService.noteBailleur`), et la liasse
    // comme le classeur des notes l'impriment à la place de ce renvoi
    // (`ExportService.feuilleNote9FondsDuBailleur`). Le libellé servi au
    // lecteur ne nomme plus ni route d'API ni classe (passe R6, D13) · la clé
    // de la rubrique, ancre des saisies, ne change pas.
    horsBalance: true,
    // Ce moteur ne lit pas le tableau servi par l'autre état · il ne sait
    // donc pas le déclarer vide. La note garde la coche « A » qu'elle avait
    // avant la passe R2 (B1), faute de quoi elle sortirait N/A sur la fiche
    // pendant que la liasse imprime son tableau chiffré.
    applicableDOffice:
      "Tableau servi par l'état « Note 9 · Fonds du bailleur », que le moteur des notes ne lit pas.",
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Fonds du bailleur' }],
    rubriques: [
      {
        cle: 'cette-note-a-des-colonnes-dynamiques-une-par-bai', libelle:
          'Tableau servi par l\'état « Note 9 · Fonds du bailleur », une colonne par bailleur, cumulé depuis ' +
          "l'origine du projet.",
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
    // « Echéances » qualifie la subvention, aucun compte ne la porte : elle se
    // SAISIT sur chaque ligne chiffrée, d'où les `cle`. Le total n'en porte
    // pas (`cellules-libres-en-saisie.ts`).
    colonnes: [...COLONNES_STANDARD, { type: 'LIBRE' as const, libelle: 'Echéances', saisieSurLigneChiffree: true }],
    renvoyeeDepuis: ['CD'],
    rubriques: [
      { cle: 'subventions-etat', libelle: 'État', comptes: ['1411'], natureCreditrice: true },
      { cle: 'subventions-region', libelle: 'Région', comptes: ['1412'], natureCreditrice: true },
      { cle: 'subventions-departement', libelle: 'Département', comptes: ['1413'], natureCreditrice: true },
      {
        cle: 'subventions-communes',
        libelle: 'Communes et collectivités publiques décentralisées',
        comptes: ['1414'],
        natureCreditrice: true,
      },
      {
        cle: 'subventions-entites-publiques-ou-mixtes',
        libelle: 'Entités publiques ou mixtes',
        comptes: ['1415'],
        natureCreditrice: true,
      },
      {
        cle: 'subventions-entites-privees',
        libelle: 'Entités et organismes privés',
        comptes: ['1416'],
        natureCreditrice: true,
      },
      {
        cle: 'subventions-organismes-internationaux',
        libelle: 'Organismes internationaux',
        comptes: ['1417'],
        natureCreditrice: true,
      },
      { cle: 'subventions-autres', libelle: 'Autres', comptes: ['1418', '148'], natureCreditrice: true },
      { libelle: 'TOTAL SUBVENTIONS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  {
    code: '11',
    titre: 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES',
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste DA du bilan comprend aussi le compte 181 (emprunts obligataires) et le poste DB le compte 192 (provisions pour charges sur donations et legs), auxquels le modèle de cette note ne donne aucune ligne.',
    colonnes: COLONNES_AVEC_ECHEANCES_DETTES,
    renvoyeeDepuis: ['DA', 'DB'],
    rubriques: [
      // Compte 181 « Emprunts obligataires » n'est PAS listé par cette note
      // (Partie 4 ch. 3, note 11), alors que le poste DA (compte 18) le prend ·
      // anomalie n° 6 de l'en-tête. Non comblé : un solde au 181 est au bilan
      // et n'est chiffré dans aucune rubrique de la note.
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste DH du bilan comprend aussi les soldes créditeurs des comptes 47 (hors 478 et 479), ainsi que des comptes 421, 4287 et 4387, auxquels le modèle de cette note ne donne aucune ligne.',
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
      // Le reliquat du 433 « Autres organismes sociaux » (fiche du compte 43,
      // Partie 2 ch. 3 : 4331 mutuelle, 4332 assurances retraite, 4333
      // assurances et organismes de santé) · 4331 et 4332 ont leur ligne, le
      // 4333 et les 4334 INPP et 4335 ONEM qu'OmegaX ouvre sous le 433 (et
      // que la paie crédite) tombent ici. Lu au seul 4333, un INPP ou un ONEM
      // créditeur à la clôture était au poste du bilan et hors de la note
      // (passe R6, D6).
      { libelle: 'Autres cotisations et organismes sociaux', comptes: ['433'], exclusions: ['4331', '4332'], sens: 'CREDITEUR' },
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est
    // ajoutée · les 53 créditeurs vont sur la ligne résiduelle « Autres
    // Banques », comme à la note 22 des associations (passe R6, C13), pour
    // que la note recoupe DW au lieu de les laisser dans aucune note.
    precisionEditeur:
      'La ligne « Autres Banques » comprend aussi les comptes 53 (établissements financiers et assimilés) à ' +
      'solde créditeur : la correspondance du bilan les porte en DW, et le modèle de cette note ne leur donne ' +
      'aucune ligne. La ligne est un choix d’OmegaX, pour que la note recoupe DW.',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['DW'],
    rubriques: [
      // Le plan ne prévoit qu'UN compte d'escompte (565, « escompte de
      // crédits ordinaires ») · aucun compte distinct pour un « escompte de
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
      // Avec les 53 CRÉDITEURS · même lecture qu'à la note 22 des
      // associations. Le 536 ne va pas sous « Banques, intérêts courus », le
      // renvoi ne visant que les banques.
      { libelle: 'Autres Banques', comptes: ['523', '524', '525', '53'], sens: 'CREDITEUR' },
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
    // RC n'a aucun renvoi au modèle vierge, qui n'imprime même pas la ligne
    // (anomalie n° 1 du compte d'exploitation) : le renvoi à la note 14, qui
    // porte la ligne du 71, est une précision d'OmegaX, posée ici ET dans la
    // liasse (NOTE_PAR_CLE_PROJETS), jamais d'un seul côté.
    renvoyeeDepuis: ['RB', 'RC', 'RD'],
    // DES PRODUITS · chaque rubrique se lit au CRÉDIT (`natureCreditrice`),
    // comme aux notes 21 et 23 de ce jeu. Lus au débit, tous les produits de
    // la note s'imprimaient en négatif (passe R6, D5).
    rubriques: [
      // Le plan subdivise 705 (Partie 2 ch. 3, compte 70 : « 7051 Ventes de
      // marchandises, 7052 Services vendus, 7053 Ventes de produits finis,
      // 7054 Ventes de produits intermédiaires, 7055 Ventes de produits
      // résiduels »). 7051 porte le libellé même de la ligne · il se rattache
      // par le plan. Le motif « 705 ne distingue pas la nature de la vente »
      // servi jusqu'à la passe R6 (D2) était faux depuis que le semis descend
      // au quatrième chiffre.
      { libelle: 'Ventes de marchandises', comptes: ['7051'], natureCreditrice: true },
      {
        ...enAttente(
          'ventes-produits-fabriques',
          'Ventes de produits fabriqués',
          'Le plan subdivise 705 (7052 Services vendus, 7053 Ventes de produits finis, 7054 Ventes de ' +
            'produits intermédiaires, 7055 Ventes de produits résiduels) sans sous-compte nommé « produits ' +
            'fabriqués » : rattacher ici ceux qui en relèvent.',
        ),
        natureCreditrice: true,
      },
      {
        ...enAttente(
          'ventes-travaux-services',
          'Ventes de travaux et services',
          'Le plan subdivise 705 (7052 Services vendus, 7053 à 7055 ventes de produits) sans sous-compte ' +
            'nommé « travaux » : rattacher ici ceux qui relèvent des travaux et services, 7052 compris.',
        ),
        natureCreditrice: true,
      },
      { libelle: 'Produits accessoires', comptes: ['707'], natureCreditrice: true },
      { libelle: 'Production immobilisée', comptes: ['72'], natureCreditrice: true },
      { libelle: "Subventions d'exploitation", comptes: ['71'], natureCreditrice: true },
      // [texte officiel] Le poste RD que cette note détaille lit « 707, 72,
      // 73 (+/-), 75, 77, 78 » (tableau de correspondance), la ligne de la
      // note dit « d'exploitation », et le plan appelle le 77 « revenus
      // financiers » et le 787 « transferts de charges financières », que la
      // note 21 détaille. La capture suit RD pour garder la note d'accord
      // avec le poste : les 77x et le 787 se lisent donc AUSSI en note 21. La
      // note 23 du jeu associations a tranché le même libellé en sens
      // inverse. Le 708, lui, n'est dans AUCUN poste (anomalie n° 5 de
      // `correspondance-projet-compte-exploitation.ts`) : il n'entre pas dans
      // la ligne qui détaille RD (passe R6, D5).
      {
        libelle: "Autres produits et transferts de charges d'exploitation",
        comptes: ['73', '75', '77', '78'],
        natureCreditrice: true,
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TB du compte d\'exploitation comprend aussi le compte 606 (achats autres activités), auquel le modèle de cette note ne donne aucune ligne.',
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
      // Le plan subdivise 604 et 605 (Partie 2 ch. 3, compte 60) : les
      // rubriques dont le libellé est celui d'un sous-compte semé se
      // rattachent par le plan (passe R6, D2). « Fourniture d'entretien »
      // est le 6054 « Fournitures d'entretien non stockables », seul
      // sous-compte de ce nom, comme « Eau », « Electricité » et « Autres
      // énergies » sont les 6051 à 6053 « Fournitures non stockables ».
      { libelle: 'Matières consommables', comptes: ['6041'] },
      { libelle: 'Matières combustibles', comptes: ['6042'] },
      { libelle: "Produits d'entretien", comptes: ['6043'] },
      enAttente(
        'fournitures-atelier',
        "Fournitures d'atelier, d'usine et de magasin",
        "Le plan n'ouvre que 6046 « Fournitures de magasin », qui ne couvre ni l'atelier ni l'usine : " +
          'rattacher ici les sous-comptes qui en relèvent.',
      ),
      { libelle: 'Eau', comptes: ['6051'] },
      { libelle: 'Electricité', comptes: ['6052'] },
      { libelle: 'Autres énergies', comptes: ['6053'] },
      { libelle: "Fourniture d'entretien", comptes: ['6054'] },
      enAttente(
        'fourniture-bureau',
        'Fourniture de bureau',
        'Le plan ouvre deux sous-comptes, 6047 « Fournitures de bureau » (stockées) et 6055 « Fournitures ' +
          'de bureau non stockables » : rattacher ici ceux que le projet mouvemente.',
      ),
      { libelle: 'Petit matériel et outillages', comptes: ['6056'] },
      enAttente(
        'achats-etudes',
        'Achats études, prestations de services, de travaux matériels et équipements',
        "Le plan ouvre 6057 « Achats d'études et prestations de service » et 6058 « Achats de travaux, " +
          'matériels et équipements » : rattacher ici ceux que le projet mouvemente.',
      ),
      { libelle: "Achats d'emballages", comptes: ['608'] },
      enAttente(
        'frais-sur-achats',
        'Frais sur achats',
        'Les frais sur achats sont aux 6015, 6025, 6045 et 6085 (Partie 2 ch. 3, compte 60). 6015 et 6085 ' +
          'sont déjà dans « Achats de biens et services liés à l\'activité » (601) et « Achats d\'emballages » ' +
          '(608) : les rattacher ici les compterait deux fois. Rattacher ici 6025 et 6045.',
      ),
      // Les rabais obtenus du 60 ont leurs sous-comptes (6019, 6029, 6049,
      // 6059, 6089, Partie 2 ch. 3, compte 60) · le 619 n'est que sous le 61.
      enAttente(
        'rabais-remises-ristournes',
        'Remises rabais, et ristournes obtenus',
        'Les rabais obtenus sur achats sont aux 6029, 6049 et 6059 : les rattacher ici. 6019 et 6089 sont ' +
          'déjà dans « Achats de biens et services liés à l\'activité » (601) et « Achats d\'emballages » ' +
          '(608) : les rattacher ici les compterait deux fois.',
      ),
      // Le TOTAL somme toutes les lignes qui le précèdent, rabais compris, dans
      // l'ordre du modèle · jusqu'à la passe R6 (D3), il s'arrêtait à l'index
      // 15 et laissait la ligne des rabais hors du total.
      { libelle: 'TOTAL ACHATS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
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
      // Le plan subdivise 618 (Partie 2 ch. 3, compte 61 : « 6181 Voyages et
      // déplacements, 6183 Transports administratifs ») · le motif « le plan
      // s'arrête au compte 618 » servi jusqu'à la passe R6 (D2) était faux.
      { libelle: 'Voyages et déplacements', comptes: ['6181'] },
      { libelle: 'Transports administratifs', comptes: ['6183'] },
      // La maquette s'arrête là : six rubriques et le TOTAL, sans ligne de
      // rabais (anomalie n° 5 de l'en-tête). La ligne empruntée à la note 25
      // des associations est retirée (passe R6, D14).
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
    ],
    commentaire: 'commenter toute variation significative.',
  },
  {
    code: '17',
    titre: 'SERVICES EXTERIEURS',
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TG du compte d\'exploitation comprend aussi le compte 636 (frais de recherche de fonds), auquel le modèle de cette note ne donne aucune ligne.',
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TI du compte d\'exploitation comprend aussi les comptes 6512 (pertes sur créances adhérents) et 652 (subventions accordées par l\'entité), auxquels le modèle de cette note ne donne aucune ligne.',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TI'],
    rubriques: [
      // 651 est subdivisé au plan : 6511 clients-usagers, 6512 adhérents,
      // 6515 autres débiteurs. Le semis ouvre les trois depuis la descente au
      // quatrième chiffre (CLAUDE.md § 7), et les rubriques captent 6511 et
      // 6515 nommément. Les rabattre sur '651' inventerait une ventilation ·
      // le 6512 n'a pas de ligne dans la maquette de ce jeu.
      { libelle: 'Pertes sur créances', comptes: ['6511'] },
      { libelle: 'Pertes sur autres débiteurs', comptes: ['6515'] },
      // Anomalie n° 4 de l'en-tête · le plan SYCEBNL n'ouvre aucune perte de
      // change sous le 65. Le 676 « Pertes de change financières » relève du
      // poste TK et de la note 21 : rattaché ici, il s'imprimait deux fois
      // et le TOTAL de la note ne recoupait plus TI (passe R6, D4).
      enAttente(
        'perte-change-creances',
        'Perte de change sur créances',
        "Le plan SYCEBNL n'ouvre aucun compte de perte de change sous le 65 (autres charges). Le 676 " +
          '« Pertes de change financières » relève des frais financiers (poste TK) et est déjà détaillé en ' +
          'note 21 : ne pas le rattacher ici. Rattacher ici, le cas échéant, le sous-compte propre du dossier.',
      ),
      { libelle: 'Pénalités et amendes pénales', comptes: ['657'] },
      { libelle: 'Dons et mécénat', comptes: ['654'] },
      { libelle: 'Autres charges diverses', comptes: ['658'] },
      // La maquette de ce jeu n'imprime aucun renvoi sur cette ligne (celui de
      // la note 28 des associations, « voir note 30 », est de l'autre jeu).
      { libelle: "Charges pour provisions pour risques à court terme d'exploitation", comptes: ['659'] },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les organismes bénéficiaires des dons.',
  },
  {
    code: '20A',
    titre: 'CHARGES DE PERSONNEL',
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TJ du compte d\'exploitation comprend aussi le compte 665 (habillement et équipement du personnel), auquel le modèle de cette note ne donne aucune ligne.',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['TJ'],
    rubriques: [
      { libelle: 'Rémunérations directes versées au personnel national', comptes: ['661'] },
      { libelle: 'Rémunérations directes versées au personnel non national', comptes: ['662'] },
      { libelle: 'Indemnités forfaitaires versées au personnel', comptes: ['663'] },
      // 664 subdivisé au plan en 6641 national / 6642 non national · le semis
      // ouvre les deux depuis la descente au quatrième chiffre (CLAUDE.md
      // § 7), et les rubriques les captent nommément. Ne jamais rabattre sur
      // '664', qui mêlerait les deux personnels.
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
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL · 1. Personnel propre',
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS · Nationaux (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS · Autres Etats de la Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS · Hors Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'EFFECTIFS · Total (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE · Nationaux (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE · Autres Etats de la Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE · Hors Région (M / F)' },
      { type: 'LIBRE' as const, libelle: 'MASSE SALARIALE · Total (M / F)' },
    ],
    rubriques: [
      { cle: 'ya-1-cadres-superieurs', libelle: 'YA. 1. Cadres supérieurs', saisie: true },
      { cle: 'yb-2-techniciens-superieurs-et-cadres-moyens', libelle: 'YB. 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { cle: 'yc-3-techniciens-agents-de-maitrise-et-ouvriers', libelle: 'YC. 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { cle: 'yd-4-employes-man-uvres-ouvriers-et-apprentis', libelle: 'YD. 4. Employés, manœuvres, ouvriers et apprentis', saisie: true },
      { cle: 'ye-total-1', libelle: 'YE. TOTAL (1)', saisie: true },
      { cle: 'yf-permanents', libelle: 'YF. Permanents', saisie: true },
      { cle: 'yg-saisonniers', libelle: 'YG. Saisonniers', saisie: true },
    ],
    renvoiOfficiel: 'M : Masculin ; F : Féminin.',
    commentaire: 'faire un commentaire si nécessaire en cas de mouvement significatif du personnel.',
  },
  {
    code: '20B',
    sousTableau: 'PERSONNEL EXTERIEUR ET BENEVOLE',
    titre: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL · 2. Personnel extérieur et bénévole',
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: "Facturation à l'entité" }],
    rubriques: [
      { cle: 'yh-1-cadres-superieurs', libelle: 'YH. 1. Cadres supérieurs', saisie: true },
      { cle: 'yi-2-techniciens-superieurs-et-cadres-moyens', libelle: 'YI. 2. Techniciens supérieurs et cadres moyens', saisie: true },
      { cle: 'yj-3-techniciens-agents-de-maitrise-et-ouvriers', libelle: 'YJ. 3. Techniciens, agents de maîtrise et ouvriers qualifiés', saisie: true },
      { cle: 'yk-4-employes-man-uvres-ouvriers-et-apprentis', libelle: 'YK. 4. Employés, manœuvres, ouvriers et apprentis', saisie: true },
      { cle: 'yl-total-2', libelle: 'YL. TOTAL (2)', saisie: true },
      { cle: 'ym-permanents', libelle: 'YM. Permanents', saisie: true },
      { cle: 'yn-saisonniers', libelle: 'YN. Saisonniers', saisie: true },
      { cle: 'yo-total-1-2', libelle: 'YO. TOTAL (1 + 2)', saisie: true },
    ],
  },
  {
    code: '21',
    titre: 'CHARGES ET REVENUS FINANCIERS',
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TK du compte d\'exploitation comprend aussi le compte 678 (pertes et charges sur risques financiers), auquel le modèle de cette note ne donne aucune ligne.',
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
    // RE et le second TJ (Dotations aux provisions) · maquette 21, décalée.
    renvoyeeDepuis: ['RE', 'TJ'],
    // LACUNE DU TEXTE OFFICIEL, non comblée · voir en-tête de fichier. Le
    // texte ne donne ni colonnes ni rubriques pour cette note, seulement un
    // commentaire. La combler avec la structure de la note 30 associations
    // inventerait une note que CE jeu ne donne pas.
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: '[texte officiel] Colonnes non données par la source' }],
    rubriques: [
      {
        cle: 'texte-officiel-le-referentiel-ne-donne-ni-colonn', libelle:
          '[texte officiel] Le référentiel ne donne ni colonnes ni rubriques pour cette note · seulement le ' +
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
    // Précision d'OmegaX, pas du texte officiel (passe R6, D7) · art. 15,
    // référence croisée, et renvoi (1) de la fiche récapitulative (« Leur
    // contenu peut être amélioré par les entités »). Aucune ligne n'est ajoutée.
    precisionEditeur:
      'Le poste TL du compte d\'exploitation comprend aussi les comptes 81, 838, 85 et 87, et le poste Produits H.A.O. (TK) les comptes 82 et 846, auxquels le modèle de cette note ne donne aucune ligne.',
    colonnes: COLONNES_STANDARD,
    // Le second TK (Produits H.A.O.) et TL · maquette 22, décalée.
    renvoyeeDepuis: ['TK', 'TL'],
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
    // Le budget n'est pas une donnée comptable, mais il EST dans le logiciel
    // depuis la brique budgétaire (`BudgetSection`, plan analytique à
    // budgets). Les rubriques ci-dessous ne servent plus que de repli : le
    // moteur remplace les lignes par celles de
    // `EtatsFinanciersProjetBudgetService.executionBudgetaire()`, cellules
    // verrouillées, dès que le dossier a une nomenclature budgétaire · voir
    // `NoteAnnexeService.injecterExecutionBudgetaire`. Même tableau que la
    // note 35 des associations, sous un autre numéro.
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
      { cle: 'lignes-de-la-nomenclature-budgetaire-du-projet', libelle: 'Lignes de la nomenclature budgétaire du projet', saisie: true },
      { cle: 'total', libelle: 'TOTAL', saisie: true },
    ],
    renvoiOfficiel: 'Remplir, code et libellé, suivant la nomenclature budgétaire du projet.',
  },
];
