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
 *  · PRATIQUE_ADMINISTRATIVE · elle est exigée par la note circulaire
 *    n° 003/2013, qui écrit d'elle-même qu'elle « ne crée pas de droit
 *    nouveau » et « liste les pièces qu'exige EN PRATIQUE ce ministère ».
 *    Refuser de la fournir bloque le dossier ; ce n'est pas pour autant une
 *    obligation légale ;
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
 * ÉTAPE 1 · l'avis favorable du ministère de tutelle. Loi n° 004/2001, art. 5
 * al. 1, lu par le guide Kahasha : « pour les ONG locales, cet avis favorable
 * les AUTORISE PROVISOIREMENT à fonctionner. (Ce qui n'est pas le cas des avis
 * favorables accordés aux ONG étrangères) ».
 *
 * LE CONTENU DU DOSSIER N'EST PAS FIXÉ, et le dire est le seul service honnête
 * que ce catalogue puisse rendre ici : « la loi ne détermine NI la forme de la
 * requête (déclaration, lettre, …) NI la procédure (les formalités) à suivre NI
 * les frais à payer. Chaque Ministère les fixe librement. » Inventer une liste
 * de pièces ferait passer une supposition pour une exigence.
 */
const ETAPE_AVIS_TUTELLE: EtapeConstitution = {
  cle: 'avis-tutelle',
  libelle: 'Avis favorable du ministère de tutelle',
  destinataire: 'Ministère ayant dans ses attributions le secteur d’activités visé',
  source: 'Loi n° 004/2001, art. 5 al. 1 · guide pratique Kahasha, section 1 § 1',
  produit:
    'Avis favorable. Pour une ONG LOCALE, il vaut autorisation PROVISOIRE de fonctionner · ce n’est pas le cas ' +
    'pour une ONG étrangère.',
  pieces: [
    {
      cle: 'demande-ecrite',
      libelle: 'Demande écrite adressée au Ministre concerné',
      fondement: 'LOI',
      source: 'Loi n° 004/2001, art. 5 al. 1',
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
const ETAPE_PERSONNALITE: EtapeConstitution = {
  cle: 'personnalite-juridique',
  libelle: 'Octroi de la personnalité juridique',
  destinataire: 'Ministre de la Justice, sous couvert du ministère du secteur d’activités visé',
  source: 'Loi n° 004/2001, art. 4 · requête en DOUBLE exemplaire, contre récépissé',
  produit: 'Arrêté du Ministre de la Justice accordant la personnalité juridique.',
  pieces: [
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
  ],
};

/**
 * ÉTAPE 3 · l'enregistrement au Ministère du Plan. Les DIX pièces de la
 * section A de la note circulaire n° 003/2013, dans son ordre.
 *
 * C'est cette étape qui produit le CERTIFICAT D'ENREGISTREMENT que le module
 * `exonerations` réclame déjà « en cours de validité » à chacun de ses trois
 * dossiers de facilités.
 */
const ETAPE_ENREGISTREMENT_PLAN: EtapeConstitution = {
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
      libelle: 'Acte accordant la personnalité juridique',
      fondement: 'LOI',
      source: 'Loi n° 004/2001, art. 3 · repris au point 3 de la section A',
    },
    {
      cle: 'reconnaissance-provinciale',
      libelle: 'Acte de reconnaissance de l’autorité politico-administrative provinciale',
      fondement: 'USAGE_SANS_BASE_LEGALE',
      source: 'Note circulaire n° 003/2013, section A, point 4',
      reserve:
        'CETTE EXIGENCE NE DÉCOULE D’AUCUN TEXTE LÉGAL EN VIGUEUR. Le guide Kahasha (§ 6) : « elle procède de ' +
        'la pratique d’un ancien texte de loi, savoir le Décret-loi n° 195 du 29 janvier 1999 en son article 37, ' +
        'ABROGÉ par la loi n° 004/2001 », et « cette procédure informelle, non réglementée par un texte, peut se ' +
        'révéler dangereuse pour l’ONG et ne lui fournit aucune garantie, vu qu’elle est tributaire de la ' +
        'personne contactée ». Elle reste réclamée en pratique : la fournir, en le sachant.',
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

/**
 * LE PARCOURS DU DOSSIER, dans l'ordre où il se fait.
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
  const commun = [ETAPE_AVIS_TUTELLE, ETAPE_PERSONNALITE, ETAPE_ENREGISTREMENT_PLAN];
  return formeJuridique === FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE && droitEtranger
    ? [...commun, ETAPE_ONG_ETRANGERE]
    : commun;
}

/** Toutes les pièces du parcours, à plat · pour le décompte de l'écran. */
export function piecesDuParcours(
  formeJuridique: FormeJuridiqueEbnl,
  droitEtranger: boolean,
): PieceConstitution[] {
  return parcoursConstitution(formeJuridique, droitEtranger).flatMap((e) => e.pieces);
}
