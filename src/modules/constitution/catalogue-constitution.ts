import { FormeJuridiqueEbnl } from '@prisma/client';

/**
 * CHECKLIST DE CONSTITUTION D'UNE ASBL OU D'UNE ONG EN RDC.
 *
 * Le logiciel tenait déjà l'AVAL de cette chaîne · le module `exonerations`
 * porte les trois dossiers de facilités de la note circulaire n° 003/2013
 * (section B), et chacun exige « le certificat d'enregistrement EN COURS DE
 * VALIDITÉ délivré par le Ministère ayant le Plan dans ses attributions ». La
 * section A de la même note, celle qui dit COMMENT on obtient ce certificat,
 * n'était nulle part · le logiciel réclamait donc une pièce dont il ne savait
 * rien dire.
 *
 * TROIS FONDEMENTS, ET ILS NE SE VALENT PAS. C'est la décision centrale de ce
 * catalogue, et une checklist qui présenterait les dix pièces comme également
 * « légales » serait fausse :
 *
 *  · LOI · la pièce est exigée par la loi n° 004/2001 elle-même, article à
 *    l'appui ;
 *  · PRATIQUE_ADMINISTRATIVE · elle est exigée par une liste de
 *    l'administration · la note circulaire n° 003/2013, qui écrit d'elle-même
 *    qu'elle « ne crée pas de droit nouveau » et « liste les pièces qu'exige
 *    EN PRATIQUE ce ministère », ou la liste de la 2e Direction du Ministère
 *    de la Justice reproduite à l'annexe I du guide Kahasha. Refuser de la
 *    fournir bloque le dossier ; ce n'est pas pour autant une obligation
 *    légale ;
 *  · USAGE_SANS_BASE_LEGALE · le guide pratique du cabinet Kahasha l'écrit
 *    noir sur blanc pour l'acte de reconnaissance de l'autorité
 *    politico-administrative : « Actuellement, cette exigence ne découle
 *    d'AUCUN TEXTE LÉGAL. Elle procède de la pratique d'un ancien texte de
 *    loi, savoir le Décret-loi n° 195 du 29 janvier 1999 en son article 37,
 *    ABROGÉ par la loi n° 004/2001 ». Le même guide ajoute que « cette
 *    procédure informelle, non réglementée par un texte, peut se révéler
 *    dangereuse pour l'ONG et ne lui fournit aucune garantie ».
 *
 * La note circulaire réclame pourtant cette pièce à son point 4. Le catalogue
 * la garde donc, puisqu'un dossier sans elle est recalé, ET dit d'où elle
 * vient · taire l'un ou l'autre tromperait le cabinet dans un sens ou dans
 * l'autre.
 *
 * CE CATALOGUE NE CONSTITUE RIEN. Il n'engendre aucune pièce, ne remplit aucun
 * formulaire et ne saisit aucune administration · c'est une liste de contrôle,
 * et les modèles d'actes sont au guide, pas ici.
 */

export type Fondement = 'LOI' | 'PRATIQUE_ADMINISTRATIVE' | 'USAGE_SANS_BASE_LEGALE';

export interface PieceConstitution {
  cle: string;
  libelle: string;
  fondement: Fondement;
  /** L'article ou le paragraphe exact · jamais « la loi » tout court. */
  source: string;
  /** Réserve à afficher avec la pièce, quand le corpus en impose une. */
  reserve?: string;
}

export interface EtapeConstitution {
  cle: string;
  libelle: string;
  /** Devant qui la démarche se fait. */
  destinataire: string;
  source: string;
  pieces: PieceConstitution[];
  /** Ce que l'étape produit, et qui sert d'entrée à la suivante. */
  produit: string;
}

/**
 * ÉTAPE 1 · l'avis favorable du ministère de tutelle, pour une association sans
 * but lucratif de DROIT CONGOLAIS. L'art. 3 l'exige (« après avis favorable du Ministre ayant dans ses
 * attributions le secteur d'activités visé »), et l'art. 5 en dit l'effet.
 *
 * L'ART. 5 NE VISE PAS LA SEULE « ONG LOCALE » que le guide Kahasha nomme ·
 * il est aux dispositions générales du Titre I (Chapitre I, Section II), et
 * l'art. 48 al. 2 parle de l'autorisation provisoire d'une association
 * confessionnelle.
 * Son al. 2 donne l'autorisation provisoire au GOUVERNEUR de province pour
 * une ASBL enregistrée en province, et son al. 3 lui donne six mois de
 * validité · la checklist les disait nulle part.
 *
 * LE CONTENU DU DOSSIER N'EST PAS FIXÉ, et le dire est le seul service honnête
 * que ce catalogue puisse rendre ici : « la loi ne détermine NI la forme de la
 * requête (déclaration, lettre, …) NI la procédure (les formalités) à suivre NI
 * les frais à payer. Chaque Ministère les fixe librement. » Inventer une liste
 * de pièces ferait passer une supposition pour une exigence.
 *
 * LA DEMANDE ÉCRITE RESTE EN FONDEMENT LOI, mais sur les bons articles. Le
 * guide Kahasha la rattache à l'art. 5 al. 1, qui ne parle d'aucune demande ·
 * c'est l'art. 3 qui exige l'avis et l'art. 4 qui fait passer la requête
 * « sous-couvert » du ministre du secteur. Les deux supposent que ce ministre
 * est saisi, et la source le dit désormais.
 */
const ETAPE_AVIS_TUTELLE: EtapeConstitution = {
  cle: 'avis-tutelle',
  libelle: 'Avis favorable du ministère de tutelle',
  destinataire:
    'Ministère ayant dans ses attributions le secteur d’activités visé · pour une ASBL enregistrée en province, ' +
    'l’autorisation provisoire est accordée par le gouverneur de province (art. 5 al. 2)',
  source: 'Loi n° 004/2001, art. 3 et 5 · guide pratique Kahasha, section 1 § 1',
  produit:
    'Avis favorable. Il vaut autorisation provisoire de fonctionnement (art. 5 al. 1), accordée par le gouverneur ' +
    'de province pour une ASBL enregistrée en province (art. 5 al. 2), et valable six mois (art. 5 al. 3).',
  pieces: [
    {
      cle: 'demande-ecrite',
      libelle: 'Demande écrite adressée au Ministre concerné',
      fondement: 'LOI',
      source:
        'Loi n° 004/2001, art. 3 (avis exigé) et art. 4 (requête sous couvert du ministre du secteur) · rattachée ' +
        'à l’art. 5 al. 1 par le guide Kahasha',
      reserve:
        'La loi ne détermine ni la forme de la requête, ni les formalités, ni les frais · « chaque Ministère ' +
        'les fixe librement » (guide Kahasha). Se renseigner auprès du ministère visé : OmegaX ne peut pas ' +
        'lister ce qu’aucun texte n’écrit.',
    },
  ],
};

/**
 * ÉTAPE 2 · la personnalité juridique. Les cinq pièces sont celles de
 * l'ARTICLE 4 de la loi, citées par le guide Kahasha § 2 · elles ne relèvent
 * donc pas de la pratique administrative mais du texte lui-même.
 */
const PIECES_ARTICLE_4: PieceConstitution[] = [
  {
    cle: 'liste-membres',
    libelle:
      'Liste des membres effectifs (noms, post-noms, prénoms, domicile ou résidence), signée par ceux chargés ' +
      'de l’administration ou de la direction',
    fondement: 'LOI',
    source: 'Loi n° 004/2001, art. 4, a)',
  },
  {
    cle: 'declaration-dirigeants',
    libelle:
      'Déclaration signée par la majorité des membres effectifs indiquant les noms, professions et domiciles ' +
      'de ceux chargés de l’administration ou de la direction',
    fondement: 'LOI',
    source: 'Loi n° 004/2001, art. 4, b)',
  },
  {
    cle: 'statuts-notaries',
    libelle:
      'Statuts NOTARIÉS, préalablement signés par tous les membres effectifs chargés de l’administration ou ' +
      'de la direction',
    fondement: 'LOI',
    source: 'Loi n° 004/2001, art. 4, c)',
  },
  {
    cle: 'bonne-conduite',
    libelle:
      'Certificats de bonne conduite, vie et mœurs de tous les membres effectifs chargés de l’administration ' +
      'ou de la direction',
    fondement: 'LOI',
    source: 'Loi n° 004/2001, art. 4, d)',
  },
  {
    cle: 'declaration-ressources',
    libelle: 'Déclaration relative aux ressources prévues pour réaliser l’objet de l’association',
    fondement: 'LOI',
    source: 'Loi n° 004/2001, art. 4, e)',
    reserve:
      'Cette déclaration DOIT ÊTRE RENOUVELÉE à la fin ou au début de chaque semestre · c’est la seule pièce ' +
      'de la constitution qui se répète, et l’oublier expose l’association aux suites de l’art. 19.',
  },
];

/**
 * UNE ASSOCIATION CONFESSIONNELLE PRODUIT UNE PIÈCE DE PLUS, et c'est la loi
 * qui l'ajoute · art. 52 : « Outre les conditions prévues aux articles 4, 6 et
 * 7 », elle doit « produire un dossier renfermant les principes fondamentaux
 * ainsi que les lignes maîtresses de l'enseignement religieux à dispenser ».
 * La liste de la Justice la reprend (annexe I du guide Kahasha, point 10,
 * « acte constitutif de la doctrine originale »).
 */
const PIECE_DOCTRINE: PieceConstitution = {
  cle: 'dossier-doctrine',
  libelle:
    'Dossier des principes fondamentaux et des lignes maîtresses de l’enseignement religieux à dispenser, ' +
    'traduisant clairement la doctrine de l’association',
  fondement: 'LOI',
  source: 'Loi n° 004/2001, art. 52, 1°',
};

function etapePersonnalite(confessionnelle: boolean): EtapeConstitution {
  return {
    cle: 'personnalite-juridique',
    libelle: 'Octroi de la personnalité juridique',
    destinataire: 'Ministre de la Justice, sous couvert du ministère du secteur d’activités visé',
    source:
      'Loi n° 004/2001, art. 4 · requête en DOUBLE exemplaire, contre récépissé' +
      (confessionnelle ? ' · art. 52 pour une association confessionnelle' : ''),
    // L'art. 5 al. 3 dit ce que l'absence d'arrêté ne dit pas · le guide
    // Kahasha le donne pour le cas le plus fréquent (« rares sont les cas où
    // le Ministre est intervenu par voie d'arrêté »). Le logiciel ne déduit
    // rien de l'absence d'arrêté au dossier, il nomme la règle.
    produit:
      'Arrêté du Ministre de la Justice accordant la personnalité juridique. Passé les six mois de ' +
      'l’autorisation provisoire, la personnalité juridique est censée être octroyée, et le Ministre de la ' +
      'Justice est tenu de délivrer l’arrêté dans le mois qui suit (art. 5 al. 3).',
    pieces: confessionnelle ? [...PIECES_ARTICLE_4, PIECE_DOCTRINE] : PIECES_ARTICLE_4,
  };
}

/**
 * ÉTAPE 3 · l'enregistrement au Ministère du Plan. Les DIX pièces de la
 * section A de la note circulaire n° 003/2013, dans son ordre.
 *
 * C'est cette étape qui produit le CERTIFICAT D'ENREGISTREMENT que le module
 * `exonerations` réclame déjà « en cours de validité » à chacun de ses trois
 * dossiers de facilités.
 *
 * La note vise « l'ASBL et Établissements d'Utilité Publique », congolaises
 * comme internationales (son point 10 les distingue). Seul l'ACTE du point 3
 * change de nom selon le régime · arrêté (art. 3), arrêté de l'EUP (art. 63)
 * ou décret d'autorisation (art. 30) · d'où le paramètre.
 */
function etapeEnregistrementPlan(acte: { libelle: string; source: string }): EtapeConstitution {
  return {
    cle: 'enregistrement-plan',
    libelle: 'Enregistrement au Ministère du Plan',
    destinataire:
      'Ministre ayant le Plan dans ses attributions, ou Secrétaire Général au Plan, copie au Directeur de la ' +
      'Coordination des Ressources Extérieures',
    source: 'Note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013 du 24 janvier 2013, section A',
    produit:
      'Certificat d’enregistrement · c’est la pièce que les trois dossiers de facilités exigent ensuite « en cours ' +
      'de validité » (fenêtre Exonérations).',
    pieces: [
      {
        cle: 'lettre-demande',
        libelle: 'Lettre de demande d’enregistrement',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 1',
      },
      {
        cle: 'statuts-reglement',
        libelle: 'Statuts notariés (1 exemplaire) et règlement intérieur',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 2',
      },
      {
        cle: 'acte-personnalite',
        libelle: acte.libelle,
        fondement: 'LOI',
        source: acte.source,
      },
      {
        cle: 'reconnaissance-provinciale',
        libelle: 'Acte de reconnaissance de l’autorité politico-administrative provinciale',
        fondement: 'USAGE_SANS_BASE_LEGALE',
        source: 'Note circulaire n° 003/2013, section A, point 4',
        reserve:
          'CETTE EXIGENCE NE DÉCOULE D’AUCUN TEXTE LÉGAL EN VIGUEUR. Le guide Kahasha (§ 6) : « cette procédure ' +
          'informelle, non réglementée par un texte, peut se révéler dangereuse pour l’ONG et ne lui fournit aucune ' +
          'garantie, vu qu’elle est tributaire de la personne contactée ». Elle reste réclamée en pratique : la ' +
          'fournir, en le sachant.',
      },
      {
        cle: 'autorisation-fonctionnement',
        libelle: 'Autorisation de fonctionnement du ministère du secteur d’activités',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 5',
      },
      {
        cle: 'plan-actions',
        libelle: 'Plan d’actions sur trois années',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 6',
      },
      {
        cle: 'rapport-activites',
        libelle: 'Rapport d’activités le plus récent',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 7',
      },
      {
        cle: 'copies-projets',
        libelle: 'Copies des projets en cours ou à réaliser',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 8',
      },
      {
        cle: 'rapport-visite',
        libelle:
          'Rapport de visite sur terrain établi par les services du Ministère du Plan du ressort provincial',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 9',
      },
      {
        cle: 'frais-dgrad',
        libelle: 'Frais DGRAD',
        fondement: 'PRATIQUE_ADMINISTRATIVE',
        source: 'Note circulaire n° 003/2013, section A, point 10',
        reserve:
          'AUCUN MONTANT N’EST DONNÉ ICI, ET C’EST VOULU. Le texte imprimé porte 50 USD (ASBL congolaise) et ' +
          '100 USD (internationale), mais ces deux montants sont BARRÉS À LA MAIN sur le scan et remplacés par une ' +
          'annotation manuscrite dont la lecture reste incertaine. Une annotation en marge n’a pas la valeur ' +
          'probante du texte imprimé · vérifier le barème en vigueur auprès de la DGRAD avant tout chiffrage.',
      },
    ],
  };
}

/**
 * ÉTAPE 4 · propre à l'ONG ÉTRANGÈRE. Elle N'EST PAS DÉTAILLÉE ICI, et c'est
 * délibéré : les quatre conditions de l'art. 37 vivent dans le module
 * `accord-cadre`, qui les tient avec leurs dates et leurs refus. Les recopier
 * aurait fait deux listes divergentes de la même règle, ce que le dossier a
 * déjà payé avec `calculerPropositions` et `construireLigneTva`.
 */
const ETAPE_ONG_ETRANGERE: EtapeConstitution = {
  cle: 'conditions-ong-etrangere',
  libelle: 'Conditions propres à l’ONG de droit étranger (art. 37)',
  destinataire: 'Ministère du Plan, et Ambassade ou Consulat pour les attestations',
  source: 'Loi n° 004/2001, art. 37 · quatre conditions cumulatives',
  produit:
    'Accord-cadre signé, représentation établie, attestations produites et part de main-d’œuvre locale ' +
    'atteinte. Ces quatre-là se tiennent dans la fenêtre Accord-cadre (Ministère du Plan), pas ici.',
  pieces: [],
};

// ---------------------------------------------------------------------------
// ÉTABLISSEMENT D'UTILITÉ PUBLIQUE · Titre II, art. 58 à 73.
//
// UN EUP N'EST PAS UNE ASBL, et sa constitution ne suit pas l'art. 4. Il n'a
// pas de « membres effectifs » · il a un FONDATEUR, qui affecte des biens
// (art. 59), et des ADMINISTRATEURS (art. 62, 3°). Lui servir les cinq pièces
// de l'art. 4 lui réclamait, article à l'appui, une liste de membres que la loi
// ne lui fait pas tenir. `exemption-is-ebnl.ts` le savait déjà ; la checklist
// était le jumeau resté intact.
// ---------------------------------------------------------------------------

/**
 * ÉTAPE 1 de l'EUP · la déclaration du fondateur et l'autorisation provisoire.
 * Art. 60 : la décision se fait connaître « au Ministre ayant dans ses
 * attributions le secteur des activités visé, par une déclaration faite en
 * forme authentique aux fins d'approbation ». Art. 61 : ce ministre, « après
 * examen de la déclaration et des statuts y annexés », octroie une
 * autorisation provisoire de fonctionnement. Les quatre mentions des statuts
 * sont celles de l'art. 62.
 */
const ETAPE_DECLARATION_EUP: EtapeConstitution = {
  cle: 'declaration-eup',
  libelle: 'Déclaration du fondateur et autorisation provisoire',
  destinataire: 'Ministre ayant dans ses attributions le secteur des activités visé',
  source: 'Loi n° 004/2001, art. 60 à 62',
  produit:
    'Autorisation provisoire de fonctionnement du ministre du secteur (art. 61). Sauf volonté contraire du ' +
    'fondateur, les droits de l’établissement naissent ce jour-là (art. 63 al. 2).',
  pieces: [
    {
      cle: 'declaration-authentique',
      libelle: 'Déclaration du fondateur faite en forme authentique, aux fins d’approbation',
      fondement: 'LOI',
      source: 'Loi n° 004/2001, art. 60 al. 1',
      reserve:
        'Si le fondateur décède avant de la communiquer, ou s’il n’a pas d’exécuteur testamentaire, ses héritiers ' +
        'ou ayants cause communiquent l’acte authentique ou les dispositions testamentaires (art. 60 al. 2).',
    },
    {
      cle: 'statuts-eup',
      libelle:
        'Statuts annexés à la déclaration · objet, dénomination et siège, identité et nationalité des ' +
        'administrateurs (la moitié au moins de nationalité congolaise), destination des biens en cas de dissolution',
      fondement: 'LOI',
      source: 'Loi n° 004/2001, art. 61 et 62',
    },
  ],
};

/**
 * ÉTAPE 2 de l'EUP · l'arrêté du Ministre de la Justice. Art. 63 : « La
 * personnalité juridique est octroyée par arrêté du Ministre de la Justice
 * après avis favorable du Ministre ayant dans ses attributions le secteur
 * d'activités visé dans les douze mois à dater de l'autorisation provisoire.
 * Passé ce délai, l'établissement concerné peut ester en justice ou poser tout
 * autre acte au même titre que celui doté de la personnalité juridique. »
 *
 * LA LOI NE DIT PAS QUELLES PIÈCES LA JUSTICE REÇOIT pour un EUP. La liste de
 * la 2e Direction du Ministère de la Justice (annexe I du guide Kahasha) en
 * nomme trois qui lui sont propres, aux points 7, 9 et 11 · elles sont
 * portées en PRATIQUE_ADMINISTRATIVE, jamais en LOI.
 */
const ETAPE_PERSONNALITE_EUP: EtapeConstitution = {
  cle: 'personnalite-juridique',
  libelle: 'Octroi de la personnalité juridique',
  destinataire: 'Ministre de la Justice, après avis favorable du ministre du secteur d’activités visé',
  source: 'Loi n° 004/2001, art. 63',
  produit:
    'Arrêté du Ministre de la Justice, dans les douze mois de l’autorisation provisoire. Passé ce délai, ' +
    'l’établissement peut ester en justice ou poser tout autre acte au même titre que celui doté de la ' +
    'personnalité juridique (art. 63 al. 1).',
  pieces: [
    {
      cle: 'cession-biens-eup',
      libelle: 'Déclaration de cession des biens, signée par le cédant et le bénéficiaire, notariée',
      fondement: 'PRATIQUE_ADMINISTRATIVE',
      source: 'Liste de la 2e Direction du Ministère de la Justice (guide Kahasha, annexe I), point 7',
    },
    {
      cle: 'designation-administrateurs-eup',
      libelle: 'Déclaration de désignation des administrateurs, signée par le fondateur ou le promoteur',
      fondement: 'PRATIQUE_ADMINISTRATIVE',
      source: 'Liste de la 2e Direction du Ministère de la Justice (guide Kahasha, annexe I), point 9',
    },
    {
      cle: 'dispositions-testamentaires-eup',
      libelle: 'Dispositions testamentaires',
      fondement: 'PRATIQUE_ADMINISTRATIVE',
      source: 'Liste de la 2e Direction du Ministère de la Justice (guide Kahasha, annexe I), point 11',
      reserve: 'Quand la création de l’établissement résulte d’un acte de dernière volonté (art. 60 al. 4).',
    },
  ],
};

// ---------------------------------------------------------------------------
// ASSOCIATION DE DROIT ÉTRANGER · Chapitre II, Section II, art. 29 à 34.
//
// ELLE N'OBTIENT PAS UN ARRÊTÉ DE PERSONNALITÉ, ELLE OBTIENT UNE AUTORISATION ·
// art. 30 : « Aucune association étrangère ne peut exercer ses activités en
// République Démocratique du Congo sans une autorisation du Président de la
// République donnée par décret sur proposition du Ministre de la Justice ».
// Autorisée, elle a la capacité que lui reconnaît la loi de son siège (art. 34).
// `exemption-is-ebnl.ts` (passe F12, C3) porte déjà cette règle ; la checklist
// servait l'arrêté du Ministre de la Justice, et c'est le jumeau qui se corrige.
//
// Et pour une ONG, la table de l'art. 2 de l'arrêté n° 007/2025 et le guide
// Kahasha parlent d'une ORDONNANCE présidentielle là où la loi dit DÉCRET ·
// aucune source lue ne dit si c'est un acte sous deux noms ou deux actes, et
// le logiciel nomme les deux sans trancher, comme `exemption-is-ebnl.ts`.
// ---------------------------------------------------------------------------

/**
 * ÉTAPE 1 de l'association étrangère · art. 31 al. 1 : elle « requiert au
 * préalable, l'avis et l'enregistrement auprès du Ministère ayant dans ses
 * attributions le secteur d'activités visé ». LA SECTION II (art. 29 à 34) NE
 * PRÉVOIT AUCUNE AUTORISATION PROVISOIRE DE FONCTIONNEMENT · la promettre ici
 * ferait croire à six mois d'activité que cette section n'ouvre pas.
 *
 * L'association confessionnelle ne passe pas par là · art. 32, elle « adresse
 * sa demande d'enregistrement et d'autorisation au Ministre de la Justice ».
 */
const ETAPE_AVIS_ENREGISTREMENT_ETRANGERE: EtapeConstitution = {
  cle: 'avis-enregistrement-secteur',
  libelle: 'Avis et enregistrement au ministère du secteur',
  destinataire: 'Ministère ayant dans ses attributions le secteur d’activités visé',
  source: 'Loi n° 004/2001, art. 31 al. 1',
  produit:
    'Avis favorable et enregistrement, préalables à la demande d’autorisation (art. 31 al. 2). Les art. 29 à 34 ' +
    'ne prévoient aucune autorisation provisoire de fonctionnement.',
  pieces: [],
};

/** Libellé de l'acte de l'art. 30, et l'écart de désignation qui l'accompagne. */
const ACTE_ETRANGER =
  'Décret du Président de la République, sur proposition du Ministre de la Justice, autorisant l’association à ' +
  'exercer ses activités en RDC (art. 30)';
const RESERVE_ORDONNANCE =
  'Pour une ONG, la table de l’art. 2 de l’arrêté n° 007/2025 et le guide Kahasha nomment une « ordonnance ' +
  'présidentielle » là où la loi parle d’un décret · OmegaX ne tranche pas entre les deux désignations.';

/**
 * ÉTAPE 2 de l'association étrangère. Art. 31 al. 3 : « Pour être recevable,
 * la demande d'autorisation devra se conformer aux dispositions de
 * l'article 4 », d'où les cinq pièces, sourcées par ce renvoi. Pour une
 * confessionnelle, l'art. 32 et l'art. 52, 1°.
 */
function etapeAutorisationEtrangere(confessionnelle: boolean, ong: boolean): EtapeConstitution {
  const renvoi = confessionnelle ? ' · par l’art. 52' : ' · par le renvoi de l’art. 31 al. 3';
  return {
    cle: 'personnalite-juridique',
    libelle: 'Autorisation d’exercer en RDC',
    destinataire: confessionnelle
      ? 'Ministre de la Justice (art. 32)'
      : 'Ministre de la Justice, après avis favorable du ministère du secteur d’activités visé (art. 31 al. 2)',
    source: confessionnelle ? 'Loi n° 004/2001, art. 30, 32 et 52' : 'Loi n° 004/2001, art. 30 et 31',
    produit:
      `${ACTE_ETRANGER}. Autorisée, l’association a la capacité juridique que lui reconnaît la loi de son siège, ` +
      'sans plus de droits qu’une association de droit congolais (art. 34).' +
      (ong ? ` ${RESERVE_ORDONNANCE}` : ''),
    pieces: [
      ...PIECES_ARTICLE_4.map((p) => ({ ...p, source: p.source + renvoi })),
      ...(confessionnelle ? [PIECE_DOCTRINE] : []),
    ],
  };
}

/**
 * CE QUE LA LOI N° 004/2001 NE RÉGIT PAS, et l'écran le dit au lieu de servir
 * une liste. L'unité de gestion de projet est « hors loi 004/2001 » selon le
 * schéma lui-même · lui servir le parcours d'une ASBL lui réclamerait,
 * article à l'appui, des pièces que la loi ne lui demande pas. La forme AUTRE
 * ne dit pas de quel titre l'entité relève (Titre I ou Titre II, dont les
 * procédures diffèrent) · le logiciel s'abstient plutôt que de choisir.
 */
export function motifHorsParcours(formeJuridique: FormeJuridiqueEbnl): string | null {
  switch (formeJuridique) {
    case FormeJuridiqueEbnl.UNITE_GESTION_PROJET:
      return 'Ce dossier n’est pas concerné par la loi n° 004/2001 · une unité de gestion de projet ne se constitue pas selon cette loi.';
    case FormeJuridiqueEbnl.AUTRE:
      return 'Forme juridique non précisée · la procédure diffère selon que l’entité est une association sans but lucratif (Titre I) ou un établissement d’utilité publique (Titre II). Précisez la forme dans les paramètres du dossier.';
    default:
      return null;
  }
}

/**
 * LE PARCOURS DU DOSSIER, dans l'ordre où il se fait, AIGUILLÉ PAR LA FORME ET
 * PAR LE DROIT · trois régimes que la loi sépare, chacun avec ses articles :
 *
 *  · l'association sans but lucratif de DROIT CONGOLAIS (association, ONG,
 *    confessionnelle) · art. 3 à 5, et 52 pour la confessionnelle ;
 *  · l'association de DROIT ÉTRANGER · art. 29 à 34 ;
 *  · l'ÉTABLISSEMENT D'UTILITÉ PUBLIQUE · art. 58 à 63. Le drapeau « droit
 *    étranger » n'y change rien : le Titre II n'a pas de section étrangère.
 *
 * L'étape de l'ONG étrangère n'apparaît QUE pour un dossier qui s'en déclare
 * une · la servir à tous ferait croire à une exigence que l'art. 37 réserve à
 * la sous-section II, ce que le module `accord-cadre` refuse déjà côté
 * enregistrement. Même borne, deux endroits.
 */
export function parcoursConstitution(
  formeJuridique: FormeJuridiqueEbnl,
  droitEtranger: boolean,
): EtapeConstitution[] {
  if (motifHorsParcours(formeJuridique) !== null) return [];

  if (formeJuridique === FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE) {
    return [
      ETAPE_DECLARATION_EUP,
      ETAPE_PERSONNALITE_EUP,
      etapeEnregistrementPlan({
        libelle: 'Arrêté du Ministre de la Justice accordant la personnalité juridique',
        source: 'Loi n° 004/2001, art. 63 · repris au point 3 de la section A',
      }),
    ];
  }

  const confessionnelle = formeJuridique === FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE;
  const ong = formeJuridique === FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE;

  if (droitEtranger) {
    return [
      ...(confessionnelle ? [] : [ETAPE_AVIS_ENREGISTREMENT_ETRANGERE]),
      etapeAutorisationEtrangere(confessionnelle, ong),
      etapeEnregistrementPlan({
        libelle: 'Décret d’autorisation d’exercer en RDC',
        source: 'Loi n° 004/2001, art. 30 · repris au point 3 de la section A',
      }),
      ...(ong ? [ETAPE_ONG_ETRANGERE] : []),
    ];
  }

  return [
    ETAPE_AVIS_TUTELLE,
    etapePersonnalite(confessionnelle),
    etapeEnregistrementPlan({
      libelle: 'Acte accordant la personnalité juridique',
      source: 'Loi n° 004/2001, art. 3 · repris au point 3 de la section A',
    }),
  ];
}

/**
 * LES CHAMPS D'IDENTIFICATION QU'UNE FORME PORTE, une seule règle · c'est elle
 * qui décide si la checklist peut dire « non renseigné au dossier », et l'écran
 * des paramètres doit la lire aussi (constat D1-B3), sans quoi il affiche un
 * manque que personne ne peut lever.
 *
 *  · l'ENREGISTREMENT au ministère du secteur est une formalité de l'ONG
 *    (art. 36) et de l'association de droit étranger (art. 31 al. 1). Ce n'est
 *    pas l'AVIS favorable des art. 3 et 5, qui est un autre acte. La
 *    confessionnelle étrangère adresse la sienne au Ministre de la Justice
 *    (art. 32), pas au ministère du secteur ;
 *  · le CERTIFICAT du Ministère du Plan est porté pour les entités que les
 *    paramètres ouvrent déjà (ONG, EUP, unité de gestion de projet).
 */
export function champsIdentificationDeLaForme(
  formeJuridique: FormeJuridiqueEbnl,
  droitEtranger: boolean,
): { enregistrementSecteur: boolean; certificatPlan: boolean } {
  const ong = formeJuridique === FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE;
  return {
    enregistrementSecteur: ong || (droitEtranger && formeJuridique === FormeJuridiqueEbnl.ASSOCIATION),
    certificatPlan:
      ong ||
      formeJuridique === FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE ||
      formeJuridique === FormeJuridiqueEbnl.UNITE_GESTION_PROJET,
  };
}

/** Toutes les pièces du parcours, à plat · pour le décompte de l'écran. */
export function piecesDuParcours(
  formeJuridique: FormeJuridiqueEbnl,
  droitEtranger: boolean,
): PieceConstitution[] {
  return parcoursConstitution(formeJuridique, droitEtranger).flatMap((e) => e.pieces);
}
