/**
 * FACILITÉS ADMINISTRATIVES, FISCALES ET DOUANIÈRES DES ASBL ET ONG.
 *
 * Le fondement · article 39 de la loi n° 004/2001 : « L'État accorde aux
 * Organisations Non-Gouvernementales certaines facilités administratives et
 * fiscales, notamment : […] 2. l'exonération de droits sur l'importation des
 * biens et équipements liés à leur mission ». Ces facilités « seront
 * expressément déterminées par le Ministre ayant le plan dans ses
 * attributions, après l'obtention de la personnalité juridique », et leur
 * octroi « est constaté par un ARRÊTÉ INTERMINISTÉRIEL des Ministres du Plan
 * et des Finances après l'avis préalable des Ministres compétents concernés ».
 *
 * Côté douane, le principe est strict : « Il ne peut être accordé de franchise
 * des droits et taxes qu'en application des conventions internationales ou que
 * par la loi ou en vertu de celle-ci » (code des douanes, ordonnance-loi
 * n° 10/002, art. 338). L'article 339 énumère les cas admis en franchise, aux
 * conditions fixées par le ministre des Finances.
 *
 * Ce que fait le logiciel, et ce qu'il ne fait pas. Il ne calcule AUCUN droit
 * de douane et ne décide d'aucune exonération : c'est un registre. Il tient la
 * liste des arrêtés obtenus, celle des pièces que la note circulaire
 * n° 003/CAB/MIN/PL.SMRM/COFAF/2013 du Ministère du Plan exige pour chaque
 * type de demande, et la date de renouvellement · la seule chose qu'un
 * logiciel puisse utilement surveiller ici, parce qu'un arrêté prévisionnel
 * périmé se découvre d'ordinaire au port, la marchandise déjà débarquée.
 */

export type TypeDemandeExoneration = 'PONCTUEL' | 'PREVISIONNEL' | 'RENOUVELLEMENT';

export interface PieceDemandee {
  cle: string;
  libelle: string;
  /** Vrai quand la pièce n'est exigée que dans un cas particulier. */
  conditionnelle?: string;
}

export interface ModeleDemande {
  type: TypeDemandeExoneration;
  libelle: string;
  objet: string;
  baseLegale: string;
  /** Durée de validité en mois, quand le texte en fixe une. */
  validiteMois: number | null;
  pieces: PieceDemandee[];
}

/**
 * Les trois dossiers de la note circulaire 003/2013, section B. Les pièces
 * sont reprises dans l'ordre du texte : c'est l'ordre dans lequel le guichet
 * les vérifie, et une liste réordonnée « pour la logique » se relit mal contre
 * l'original.
 */
export const MODELES_DEMANDE: ModeleDemande[] = [
  {
    type: 'PONCTUEL',
    libelle: 'Arrêté interministériel ponctuel',
    objet:
      "Exonération pour UNE opération d'importation isolée : un conteneur, un lot de matériel, un don précis. " +
      "Le dossier se rattache à une lettre de transport (BL ou LTA) identifiée.",
    baseLegale:
      "Note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013 du 24 janvier 2013, section B.I ; loi n° 004/2001, art. 39.",
    validiteMois: null,
    pieces: [
      { cle: 'requete', libelle: 'Requête au Ministre du Plan, signée par le promoteur ou son délégué mandaté' },
      { cle: 'statuts', libelle: 'Statuts notariés (1 exemplaire)' },
      { cle: 'personnaliteJuridique', libelle: "Ordonnance, décret ou arrêté d'octroi de la personnalité juridique" },
      { cle: 'listeBiens', libelle: "Liste QUANTIFIÉE des biens à importer, en relation avec l'objet de l'ONG" },
      { cle: 'attestationDon', libelle: "Attestation de don ou factures d'achat" },
      { cle: 'lettreTransport', libelle: 'Lettre de transport (BL ou LTA) pour les biens importés' },
      { cle: 'projetUtilisation', libelle: "Projet d'utilisation des biens à exonérer" },
      { cle: 'certificatEnregistrement', libelle: "Certificat d'enregistrement en cours de validité (Ministère du Plan)" },
      { cle: 'numeroImpot', libelle: 'Numéro Impôt' },
      { cle: 'avisMinistereSectoriel', libelle: "Avis du Ministère ayant le secteur d'activités dans ses attributions" },
      { cle: 'rapportAnnuel', libelle: "Rapport annuel d'activités le plus récent" },
      {
        cle: 'autorisationSante',
        libelle: "Autorisation d'importation du Ministère de la Santé",
        conditionnelle: 'Produits pharmaceutiques uniquement',
      },
      {
        cle: 'accordCadre',
        libelle: 'Accord-cadre conclu avec le Ministère du Plan',
        conditionnelle: 'ONG internationales uniquement',
      },
    ],
  },
  {
    type: 'PREVISIONNEL',
    libelle: 'Arrêté interministériel prévisionnel',
    objet:
      "Exonération à validité prévisionnelle, pour un flux d'importations RÉCURRENT lié à l'objet de l'ONG. " +
      'Valable deux ans, renouvelable.',
    baseLegale:
      "Note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013, section B.II ; loi n° 004/2001, art. 39.",
    validiteMois: 24,
    pieces: [
      { cle: 'requete', libelle: 'Requête au Ministre du Plan, signée par le promoteur ou son délégué mandaté' },
      { cle: 'statuts', libelle: 'Statuts notariés (1 exemplaire)' },
      { cle: 'personnaliteJuridique', libelle: "Ordonnance, décret ou arrêté d'octroi de la personnalité juridique" },
      { cle: 'listeBiens', libelle: "Liste QUANTIFIÉE des biens à importer, en relation avec l'objet de l'ONG" },
      { cle: 'attestationDon', libelle: "Attestation de don ou factures d'achat" },
      { cle: 'lettreTransport', libelle: 'Lettre de transport (BL ou LTA) pour les biens importés' },
      { cle: 'projetUtilisation', libelle: "Projet d'utilisation des biens à exonérer" },
      { cle: 'certificatEnregistrement', libelle: "Certificat d'enregistrement en cours de validité (Ministère du Plan)" },
      {
        cle: 'rapportAnnuel',
        libelle: "Rapport annuel d'activités le plus récent",
        conditionnelle: 'ONG déjà opérationnelle uniquement',
      },
      {
        cle: 'accordCadre',
        libelle: 'Accord-cadre conclu avec le Ministère du Plan',
        conditionnelle: 'ONG internationales uniquement',
      },
      {
        cle: 'rapportCommissionAdHoc',
        libelle:
          "Rapport d'évaluation de la Commission ad hoc sur les activités de l'ONG sur le terrain (impact sur les " +
          'communautés locales)',
      },
    ],
  },
  {
    type: 'RENOUVELLEMENT',
    libelle: "Renouvellement de l'arrêté prévisionnel",
    objet:
      "Reconduction d'un arrêté prévisionnel arrivé à échéance. Le dossier est court : quatre pièces seulement, " +
      "mais il doit être déposé AVANT l'expiration · un arrêté périmé se découvre d'ordinaire au port.",
    baseLegale: "Note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013, section B.III.",
    validiteMois: 24,
    pieces: [
      { cle: 'requete', libelle: 'Requête au Ministre du Plan, signée par le promoteur ou son délégué mandaté' },
      { cle: 'ancienArrete', libelle: "Copie de l'ancien arrêté d'exonération" },
      { cle: 'rapportTerrain', libelle: "Rapport d'évaluation sur terrain" },
      { cle: 'listeBiens', libelle: "Liste QUANTIFIÉE des biens à importer, en relation avec l'objet de l'ONG" },
    ],
  },
];

/**
 * Cas de franchise du code des douanes qu'une EBNL peut rencontrer · article
 * 339, 1° de l'ordonnance-loi n° 10/002. La liste complète compte seize
 * lettres (a à p) ; ne sont retenues ici que celles qu'une association, une
 * ONG ou une congrégation invoque réellement. Les autres (privilèges
 * diplomatiques, devises des banques, timbres) n'ont pas leur place dans un
 * registre d'ASBL, et les faire figurer diluerait la liste utile.
 *
 * Chaque cas reste soumis à un arrêté d'application du ministre des Finances
 * (« aux conditions déterminées par le ministre ayant les finances dans ses
 * attributions ») : le Code pose le principe, pas la procédure.
 */
export const FRANCHISES_DOUANIERES_EBNL = [
  {
    lettre: 'e',
    libelle: 'Dons distribués gratuitement par un organisme charitable agréé',
    texte:
      'Denrées alimentaires, médicaments, vêtements et couvertures constituant des dons adressés à des organismes ' +
      'charitables ou philanthropiques AGRÉÉS, destinés à être distribués gratuitement par ces organismes ou sous ' +
      'leur contrôle à des personnes nécessiteuses.',
  },
  {
    lettre: 'h',
    libelle: "Matériels et articles destinés à la recherche ou à l'éducation",
    texte: "Matériels et articles destinés à la recherche et/ou à l'éducation.",
  },
  {
    lettre: 'i',
    libelle: "Objets religieux destinés à l'exercice du culte",
    texte: "Objets religieux destinés à être utilisés dans l'exercice du culte.",
  },
  {
    lettre: 'l',
    libelle: "Dons ou matériels fournis gratuitement à l'État ou à une entité territoriale",
    texte:
      "Dons ou matériels fournis gratuitement à la République Démocratique du Congo et aux entités territoriales " +
      'dotées de la personnalité juridique.',
  },
  {
    lettre: 'm',
    libelle: 'Marchandises importées dans le cadre de la coopération bilatérale ou multilatérale',
    texte: 'Marchandises importées dans le cadre des projets de coopération bilatérale ou multilatérale.',
  },
] as const;

/**
 * Délai d'alerte avant expiration d'un arrêté prévisionnel.
 *
 * Soixante jours : c'est le temps qu'il faut pour réunir le rapport
 * d'évaluation sur terrain que le renouvellement exige (section B.III, pièce
 * 3), lequel suppose une descente. Alerter à trente jours reviendrait à
 * alerter trop tard, la mission de terrain n'étant plus organisable ; le
 * logiciel préviendrait alors d'une échéance déjà manquée.
 */
export const JOURS_ALERTE_RENOUVELLEMENT = 60;

export const AVERTISSEMENT_FRANCHISE =
  "Aucune franchise ne se présume : « Il ne peut être accordé de franchise des droits et taxes qu'en application " +
  'des conventions internationales ou que par la loi ou en vertu de celle-ci » (code des douanes, ordonnance-loi ' +
  "n° 10/002, art. 338). Un arrêté interministériel du Plan et des Finances est le titre ; sans lui, les droits sont " +
  'dus, et la marchandise reste au port.';
