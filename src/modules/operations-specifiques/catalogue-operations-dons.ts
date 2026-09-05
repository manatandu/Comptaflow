import { OperationSpecifique } from './operation-specifique.types';

/**
 * Suite du catalogue · Partie 3 chapitres 4 à 6 (dons, cotisations, autres
 * opérations spécifiques) et Guide, Applications 9 à 20. Voir l'en-tête de
 * `catalogue-operations.ts` pour la règle de numérotation et la liste des
 * anomalies du texte officiel.
 */

// ---------------------------------------------------------------------------
// B2 · Dons en nature à distribuer
// ---------------------------------------------------------------------------

const B2: OperationSpecifique = {
  code: 'B2',
  libelle: 'Dons en nature à distribuer',
  source: 'Partie 3 ch. 4 § 1 · Guide, Application 9',
  portee: 'ASSOCIATIONS',
  politiqueADecider:
    "L'opération est-elle RÉCURRENTE ou non ? Le référentiel scinde le traitement sur ce seul critère (Partie 3 ch. 4 § 1.1) : « au débit du compte 654 par le crédit du compte 7542 EN CAS DE RÉCURRENCE et au débit du compte 832 par le crédit du compte 8415 EN CAS DE NON RÉCURRENCE ». Une collecte régulière auprès de sociétés agro-industrielles est récurrente ; un don exceptionnel ne l'est pas.",
  modeles: [
    {
      code: 'B2-RECEPTION-COURANT',
      libelle: 'Réception de dons en nature à distribuer · opération récurrente',
      objet: "Enregistre à leur valeur actuelle les dons en nature destinés à être distribués en l'état.",
      source:
        "Partie 3 ch. 4 § 1.1 : « les dons en nature destinés à être distribués en l'état sont enregistrés à leur VALEUR ACTUELLE au fur et à mesure de leur réception […] au débit du compte 654 par le crédit du compte 7542 en cas de récurrence ».",
      applicationGuide: 'App. 9',
      parametres: [{ nom: 'valeur', libelle: 'Valeur actuelle des dons reçus', type: 'MONTANT' }],
      lignes: [
        {
          compte: '654',
          libelle: 'Dons en nature courants à distribuer', sens: 'DEBIT', auChoix: true,
          montant: { mode: 'PARAMETRE', parametre: 'valeur' },
          note: "Non affectés (6541) ou affectés (6545) · le texte écrit « le compte 654 » sans trancher, c'est à l'entité de le faire.",
        },
        { compte: '7542', libelle: 'Dons en nature courants reçus à distribuer', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
      ],
    },
    {
      code: 'B2-RECEPTION-HAO',
      libelle: 'Réception de dons en nature à distribuer · opération non récurrente',
      objet: "Même opération, hors activités ordinaires quand le don n'a pas de caractère répétitif.",
      source: 'Partie 3 ch. 4 § 1.1 : « au débit du compte 832 par le crédit du compte 8415 en cas de non récurrence ».',
      applicationGuide: 'App. 9',
      parametres: [{ nom: 'valeur', libelle: 'Valeur actuelle des dons reçus', type: 'MONTANT' }],
      lignes: [
        {
          compte: '832',
          libelle: 'Dons en nature H.A.O. à distribuer', sens: 'DEBIT',
          montant: { mode: 'PARAMETRE', parametre: 'valeur' },
          note: 'Le 832 que le texte prescrit ici existe désormais au plan semé · il ne fallait plus passer par sa racine voisine 831.',
        },
        { compte: '8415', libelle: 'Dons en nature H.A.O. reçus à distribuer', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
      ],
      anomalie:
        "[texte officiel] Le plan des comptes et la fiche du compte 83 numérotent les subdivisions du compte 832 « 8311 / 8315 », c'est-à-dire sous la racine du compte 831. L'incohérence est celle du texte ; le plan semé reproduit les deux, le 832 prescrit ici comme ses subdivisions mal numérotées.",
    },
    {
      code: 'B2-STOCK-CLOTURE',
      libelle: 'Inventaire des dons en nature non distribués',
      objet: "Constate en stock les dons reçus mais non encore distribués à la clôture.",
      source:
        "Partie 3 ch. 4 § 1.2 : « un inventaire des dons doit être réalisé » ; compte 34 Stock de dons en nature par le crédit du 6035 Variations de stocks de dons en nature à distribuer.",
      applicationGuide: 'App. 9',
      parametres: [{ nom: 'stock', libelle: 'Valeur des dons non distribués', type: 'MONTANT' }],
      lignes: [
        { compte: '345', libelle: 'Stock de dons en nature', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'stock' } },
        { compte: '6035', libelle: 'Variations de stocks de dons en nature à distribuer', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'stock' } },
      ],
      aExtourner: true,
    },
    {
      code: 'B2-REVENUS-NON-CONSOMMES',
      libelle: 'Neutralisation des revenus de dons non consommés',
      objet: "Diffère à l'exercice suivant le produit correspondant aux dons non encore distribués.",
      source:
        "Partie 3 ch. 4 § 1.2 : « lorsqu'il s'agit de dons en nature courants non consommés » · compte 7542 au débit par le crédit du 4713 Créditeurs, dons en nature courants non consommés. « Les écritures de fin d'exercice doivent être extournées au début de l'exercice suivant. »",
      applicationGuide: 'App. 9',
      parametres: [{ nom: 'nonConsomme', libelle: 'Dons non consommés', type: 'MONTANT' }],
      lignes: [
        { compte: '7542', libelle: 'Dons en nature courants reçus à distribuer', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'nonConsomme' } },
        { compte: '4713', libelle: 'Créditeurs, dons en nature courants non consommés', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'nonConsomme' } },
      ],
      aExtourner: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// B3 · Dons en nature à vendre
// ---------------------------------------------------------------------------

const B3: OperationSpecifique = {
  code: 'B3',
  libelle: 'Dons en nature destinés à la vente',
  source: 'Partie 3 ch. 4 § 2 · Guide, Application 10',
  portee: 'ASSOCIATIONS',
  politiqueADecider:
    "Le bien reçu n'entre PAS au bilan avant sa cession : « les dons en nature reçus destinés à la vente sont SUIVIS EN EXTRA COMPTABLE jusqu'à la date de cession » (Partie 3 ch. 4 § 2). Le suivi passe par les comptes de contributions volontaires (classe 9), hors bilan et hors résultat, et « en fin d'exercice les dons non vendus doivent être MENTIONNÉS DANS UNE NOTE ANNEXE ».",
  modeles: [
    {
      code: 'B3-SUIVI-EXTRA-COMPTABLE',
      libelle: 'Suivi extra-comptable du don reçu à vendre',
      objet: 'Enregistre le bien reçu en classe 9, hors bilan, jusqu’à sa cession.',
      source: 'Partie 3 ch. 4 § 2 et Guide App. 10 : compte 901 Mise à disposition gratuite de biens par le crédit du 910 Dons en nature.',
      applicationGuide: 'App. 10',
      parametres: [{ nom: 'valeur', libelle: 'Valeur du bien reçu', type: 'MONTANT' }],
      lignes: [
        { compte: '901', libelle: 'Mise à disposition gratuite de biens', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
        { compte: '910', libelle: 'Dons en nature', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
      ],
    },
    {
      code: 'B3-VENTE-COURANTE',
      libelle: 'Vente du don en nature · opération récurrente',
      objet: 'Constate le produit de la vente du bien reçu en don.',
      source: 'Partie 3 ch. 4 § 2 : « les produits de la vente sont inscrits dans le compte 7081 Ventes de dons en nature EN CAS DE RÉCURRENCE ».',
      applicationGuide: 'App. 10',
      parametres: [{ nom: 'prix', libelle: 'Prix de vente', type: 'MONTANT' }],
      lignes: [
        { compte: '412', libelle: 'Clients-usagers', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'prix' } },
        { compte: '7081', libelle: 'Ventes de dons en nature', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'prix' } },
      ],
    },
    {
      code: 'B3-VENTE-HAO',
      libelle: 'Vente du don en nature · opération non récurrente',
      objet: 'Même vente, hors activités ordinaires.',
      source:
        "Partie 3 ch. 4 § 2 : « et dans le compte 8411 Dons en nature vendus, EN CAS DE NON-RÉCURRENCE ». Confirmé par le plan des comptes et par la fiche du compte 84 (Partie 2 ch. 3), qui donnent tous deux 8411.",
      applicationGuide: 'App. 10',
      parametres: [{ nom: 'prix', libelle: 'Prix de vente', type: 'MONTANT' }],
      lignes: [
        { compte: '52', libelle: 'Banque', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'prix' } },
        { compte: '8411', libelle: 'Dons en nature H.A.O. vendus', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'prix' } },
      ],
      anomalie:
        "[texte officiel] Le Guide (App. 10) impute cette vente au compte « 8421 », alors que la Partie 3 ch. 4 § 2, le plan des comptes ET la fiche du compte 84 donnent tous trois 8411 « Dons en nature HAO vendus ». Trois sources concordantes contre une : le modèle retient 8411.",
    },
    {
      code: 'B3-FRAIS-NEUTRALISES',
      libelle: 'Neutralisation des frais engagés sur un don non vendu',
      objet: "Reporte à l'exercice suivant les frais engagés sur un bien qui n'est pas encore vendu.",
      source:
        "Guide App. 10, note préliminaire : « les frais afférents aux dons non vendus en fin d'exercice sont neutralisés par le compte 476 Charges comptabilisées d'avance, EXTOURNÉ AU DÉBUT DE L'EXERCICE SUIVANT ».",
      applicationGuide: 'App. 10',
      parametres: [{ nom: 'frais', libelle: 'Frais engagés sur le bien non vendu', type: 'MONTANT' }],
      lignes: [
        { compte: '476', libelle: "Charges constatées d'avance", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'frais' } },
        {
          compte: '8310', libelle: 'Charges H.A.O. constatées', sens: 'CREDIT',
          montant: { mode: 'PARAMETRE', parametre: 'frais' },
          note: 'Le Guide intitule ce compte « 8311 Charges sur dons et legs » ; au plan, 8311 porte les DONS EN NATURE H.A.O. à distribuer, et les charges H.A.O. relèvent du 831. C’est donc 8310 qui accueille un frais.',
        },
      ],
      aExtourner: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// B4 · Dons en numéraire et revenus des manifestations
// ---------------------------------------------------------------------------

const B4: OperationSpecifique = {
  code: 'B4',
  libelle: 'Dons en numéraire, legs, denier du culte, zakat, célébrations, mécénat',
  source: 'Partie 3 ch. 4 § 3 · Guide, Application 11',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B4-ENCAISSEMENT',
      libelle: 'Encaissement de revenus liés à la générosité',
      objet: "Constate un don, un legs, un denier du culte, une zakat, une dîme, une célébration, un mécénat ou un parrainage encaissé.",
      source:
        "Partie 3 ch. 4 § 3 : « ces revenus sont enregistrés dans le compte 704 Revenus liés à la générosité ». Les huit natures y ont chacune leur subdivision.",
      applicationGuide: 'App. 11',
      parametres: [{ nom: 'montant', libelle: 'Montant encaissé', type: 'MONTANT' }],
      lignes: [
        { compte: '5', libelle: 'Trésorerie', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'montant' }, note: 'Caisse pour une quête, banque pour un chèque ou un virement.' },
        { compte: '704', libelle: 'Revenus liés à la générosité', sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'montant' }, note: 'Choisir la nature : dons, legs, deniers du culte, zakat/dîme/quête, célébrations, mécénats, parrainage, autres.' },
      ],
    },
    {
      code: 'B4-GENEROSITE-A-RECEVOIR',
      libelle: 'Générosité promise non encore reçue',
      objet: "Rattache à l'exercice une promesse ferme et écrite, non encore encaissée à la clôture.",
      source:
        "Partie 3 ch. 4 § 3 : « les revenus de générosité PROMIS NON ENCORE REÇUS en fin d'exercice DONT L'ENTITÉ A LA CERTITUDE DE LES ENCAISSER (lettre d'engagement, convention etc.) doivent faire l'objet d'un rattachement à l'exercice par le biais du compte 475 ».",
      applicationGuide: 'App. 11',
      parametres: [{ nom: 'promesse', libelle: 'Montant promis', type: 'MONTANT' }],
      lignes: [
        { compte: '475', libelle: 'Générosités financières à recevoir', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'promesse' } },
        { compte: '704', libelle: 'Revenus liés à la générosité', sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'promesse' } },
      ],
    },
    {
      code: 'B4-RECETTES-MANIFESTATION',
      libelle: "Recettes d'une manifestation",
      objet: 'Constate les recettes encaissées lors d’une kermesse, d’une fête ou d’une collecte publique.',
      source: 'Compte 706 Revenus des manifestations (Partie 2 ch. 2, subdivisions du compte 70).',
      applicationGuide: 'App. 11',
      parametres: [{ nom: 'recettes', libelle: 'Recettes encaissées', type: 'MONTANT' }],
      lignes: [
        { compte: '5', libelle: 'Trésorerie', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'recettes' } },
        { compte: '706', libelle: 'Revenus des manifestations', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'recettes' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B5 · Frais de recherche de fonds
// ---------------------------------------------------------------------------

const B5: OperationSpecifique = {
  code: 'B5',
  libelle: 'Frais de recherche de fonds',
  source: 'Partie 3 ch. 4 § 4 · Guide, Application 12',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B5-FRAIS',
      libelle: 'Engagement de frais de recherche de fonds',
      objet: 'Isole dans un compte dédié les dépenses engagées pour rechercher des dons.',
      source:
        "Partie 3 ch. 4 § 4 : « une association est souvent amenée à engager des dépenses pour rechercher des dons notamment par voie de courrier, de publicité dans les revues, de calendrier, de bloc-notes, de stylos etc. Ces charges doivent être enregistrées dans un COMPTE SPÉCIFIQUE : 636 Frais de recherche de fonds. »",
      applicationGuide: 'App. 12',
      parametres: [{ nom: 'frais', libelle: 'Frais engagés', type: 'MONTANT' }],
      lignes: [
        { compte: '636', libelle: 'Frais de recherche de fonds', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'frais' } },
        { compte: '401', libelle: 'Fournisseurs', sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'frais' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B7 · Contribution du fondateur
// ---------------------------------------------------------------------------

const B7: OperationSpecifique = {
  code: 'B7',
  libelle: "Contribution du fondateur d'une fondation",
  source: 'Partie 3 ch. 5 § 2 · Guide, Application 14',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B7-CONTRIBUTION',
      libelle: 'Versement du fondateur pour les frais de fonctionnement',
      objet: "Constate un versement ponctuel du fondateur, distinct de la dotation.",
      source:
        "Partie 3 ch. 5 § 2 : compte 752 Contribution du fondateur. À ne pas confondre avec la dotation (compte 10), qui est une ressource durable · ici le versement couvre des charges de l'exercice.",
      applicationGuide: 'App. 14',
      parametres: [{ nom: 'versement', libelle: 'Versement du fondateur', type: 'MONTANT' }],
      lignes: [
        { compte: '5', libelle: 'Trésorerie', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'versement' } },
        { compte: '752', libelle: 'Contribution du fondateur', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'versement' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B8 · Subventions et aides financières versées par l'entité
// ---------------------------------------------------------------------------

const B8: OperationSpecifique = {
  code: 'B8',
  libelle: "Subventions et aides financières versées par l'entité",
  source: 'Partie 3 ch. 5 § 3 · Guide, Application 15',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B8-SUBVENTION-VERSEE',
      libelle: "Versement d'une aide financière à un tiers",
      objet: "Constate une aide accordée par l'entité elle-même.",
      source:
        "Glossaire, SUBVENTIONS VERSÉES : « dons en numéraire OCTROYÉS PAR l'entité à but non lucratif ». Compte 652 (Partie 3 ch. 5 § 3).",
      applicationGuide: 'App. 15',
      parametres: [{ nom: 'aide', libelle: 'Aide versée', type: 'MONTANT' }],
      lignes: [
        { compte: '652', libelle: "Subventions accordées par l'entité", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'aide' } },
        { compte: '5', libelle: 'Trésorerie', sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'aide' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B9 · Subventions d'exploitation pluriannuelles
// ---------------------------------------------------------------------------

const B9: OperationSpecifique = {
  code: 'B9',
  libelle: "Subventions d'exploitation se répartissant sur plusieurs exercices",
  source: 'Partie 3 ch. 6 § 1 · Guide, Application 16',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B9-NOTIFICATION',
      libelle: "Notification d'une subvention d'exploitation",
      objet: 'Constate la créance et le produit dès la notification.',
      source:
        "Glossaire, SUBVENTION D'EXPLOITATION : « aide dont bénéficie l'entité pour lui permettre de compenser l'insuffisance de revenus et de produits pour faire face à certaines charges d'exploitation ».",
      applicationGuide: 'App. 16',
      parametres: [{ nom: 'subvention', libelle: 'Subvention notifiée', type: 'MONTANT' }],
      lignes: [
        { compte: '4732', libelle: "Subventions d'exploitation à recevoir", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'subvention' } },
        { compte: '71', libelle: "Subventions d'exploitation", sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'subvention' }, note: "Choisir selon l'origine du financeur." },
      ],
    },
    {
      code: 'B9-QUOTE-PART-DIFFEREE',
      libelle: 'Report de la quote-part des exercices suivants',
      objet: "Diffère la part de subvention qui se rapporte aux exercices à venir.",
      source:
        "Partie 3 ch. 6 § 1 : « lorsqu'une convention stipule que la subvention est accordée pour toute la durée du projet qui s'étalera sur plusieurs exercices, à la clôture du premier exercice, il convient d'EXTOURNER la part de subvention se rapportant aux exercices ultérieurs au crédit d'un compte 477 Produits constatés d'avance par le débit du compte 71 ».",
      applicationGuide: 'App. 16',
      parametres: [{ nom: 'partDifferee', libelle: 'Part se rapportant aux exercices ultérieurs', type: 'MONTANT' }],
      lignes: [
        { compte: '71', libelle: "Subventions d'exploitation", sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'partDifferee' } },
        { compte: '477', libelle: "Produits constatés d'avance", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'partDifferee' } },
      ],
    },
    {
      code: 'B9-RATTACHEMENT',
      libelle: "Rattachement de la quote-part de l'exercice",
      objet: "Reprend au résultat la part de subvention qui revient à l'exercice en cours.",
      source:
        "Partie 3 ch. 6 § 1 : « à la fin de chaque exercice ultérieur concerné, la quote-part de la subvention d'exploitation y afférant est REPRISE au débit du compte 477 par le crédit du compte 71 ».",
      applicationGuide: 'App. 16',
      parametres: [{ nom: 'quotePart', libelle: "Quote-part de l'exercice", type: 'MONTANT' }],
      lignes: [
        { compte: '477', libelle: "Produits constatés d'avance", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'quotePart' } },
        { compte: '71', libelle: "Subventions d'exploitation", sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'quotePart' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B10 · Abandons de frais engagés par les bénévoles
// ---------------------------------------------------------------------------

const B10: OperationSpecifique = {
  code: 'B10',
  libelle: 'Abandons de frais engagés par les bénévoles',
  source: 'Partie 3 ch. 6 § 2 · Guide, Application 17',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B10-FRAIS-ENGAGES',
      libelle: 'Constatation des frais engagés par les bénévoles',
      objet: "Enregistre les frais avancés par un bénévole et la dette de l'entité envers lui.",
      source:
        "Partie 3 ch. 6 § 2 : « les frais engagés par les bénévoles dans le cadre d'une activité de l'entité (billets d'avions, frais de courses, notes de frais etc.) QUI DONNENT DROIT À UN REMBOURSEMENT sont enregistrés au débit des comptes de charges par nature par le crédit du compte 4572 Bénévoles ».",
      applicationGuide: 'App. 17',
      parametres: [{ nom: 'frais', libelle: 'Frais engagés', type: 'MONTANT' }],
      lignes: [
        { compte: '6', libelle: 'Charges par nature', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'frais' }, note: 'Choisir le compte de charge correspondant (voyages, missions, réceptions, fournitures…).' },
        { compte: '4572', libelle: 'Bénévoles', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'frais' } },
      ],
    },
    {
      code: 'B10-ABANDON',
      libelle: 'Abandon des frais au profit de l’entité',
      objet: "Solde la dette envers le bénévole qui renonce à son remboursement.",
      source:
        "Partie 3 ch. 6 § 2 : « lorsque les bénévoles RENONCENT au remboursement des frais engagés, le compte 4572 est débité pour solde par le crédit du compte 7583 Abandons de frais par les bénévoles OU d'une subdivision du compte 846 Abandons de créances obtenus lorsque l'abandon a un CARACTÈRE NON RÉCURRENT ».",
      applicationGuide: 'App. 17',
      parametres: [{ nom: 'abandon', libelle: 'Frais abandonnés', type: 'MONTANT' }],
      lignes: [
        { compte: '4572', libelle: 'Bénévoles', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'abandon' } },
        { compte: '7583', libelle: 'Abandons de frais par les bénévoles', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'abandon' }, note: 'Compte 846 si l’abandon a un caractère non récurrent.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B11 · Convention de mécénat
// ---------------------------------------------------------------------------

const B11: OperationSpecifique = {
  code: 'B11',
  libelle: 'Convention de mécénat',
  source: 'Partie 3 ch. 6 § 3 · Guide, Application 18',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B11-SIGNATURE',
      libelle: "Signature d'une convention de mécénat",
      objet: 'Constate la créance sur le mécène dès la signature, avant tout versement.',
      source:
        "Partie 3 ch. 6 § 3 : « lors de la signature d'une convention de mécénat concernant le versement de fonds, l'entité PEUT constater une créance sur le mécène au débit du compte 4751 Mécènes par le crédit du compte 7046 Mécénats ».",
      applicationGuide: 'App. 18',
      parametres: [{ nom: 'convention', libelle: 'Montant de la convention', type: 'MONTANT' }],
      lignes: [
        {
          compte: '4571',
          libelle: 'Mécènes et assimilés',
          sens: 'DEBIT',
          montant: { mode: 'PARAMETRE', parametre: 'convention' },
          // LE TEXTE OFFICIEL SE CONTREDIT, ET C'EST L'INTITULÉ QUI TRANCHE.
          //
          // La Partie 3 ch. 6 § 3 et le cas chiffré de l'Application 18
          // écrivent tous deux « 4751 Mécènes ». Mais le PLAN DES COMPTES
          // (Partie 2, ch. 2 ET ch. 3, compte 45) ne connaît pas de 4751 :
          // il porte « 457 Mécènes, bénévoles et assimilés », subdivisé en
          // « 4571 Mécènes et assimilés » et « 4572 Bénévoles et assimilés ».
          // Et le 475 du plan s'intitule « Générosités financières à
          // recevoir », pas « Mécènes ».
          //
          // L'intitulé « Mécènes » n'existe donc QU'EN 4571. Le « 4751 » du
          // chapitre 6 est une transposition de chiffres, répétée dans le
          // guide. On suit la nomenclature, pas la coquille.
          //
          // LA RÈGLE DE FOND, qui vaut au-delà du seul mécénat : le compte
          // 45 accueille les FONDATEURS, APPORTEURS et comptes courants, le
          // 47 les DÉBITEURS ET CRÉDITEURS DIVERS. Un mécène qui s'engage
          // par convention relève de la première famille · c'est un
          // apporteur de ressources nommé, pas un tiers divers. Une
          // générosité simplement promise par un tiers quelconque reste au
          // 475 (voir le modèle de promesse de don, plus haut).
          note:
            'Le texte de la Partie 3 ch. 6 et le Guide écrivent 4751 · le plan des comptes ne connaît ' +
            'que 4571 Mécènes et assimilés, et intitule le 475 « Générosités financières à recevoir ».',
        },
        { compte: '7046', libelle: 'Mécénats', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'convention' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B12 · Restitution de subvention non utilisée
// ---------------------------------------------------------------------------

const B12: OperationSpecifique = {
  code: 'B12',
  libelle: 'Restitution de subvention non utilisée conformément à son objet',
  source: 'Partie 3 ch. 6 § 4 · Guide, Application 19',
  portee: 'TOUS',
  modeles: [
    {
      code: 'B12-CONSTATATION',
      libelle: 'Constatation de la quote-part à reverser',
      objet: "Constate l'obligation de restituer une subvention dont les clauses n'ont pas été respectées.",
      source:
        "Partie 3 ch. 6 § 4 : « lors de la naissance de l'évènement déterminant l'obligation de restitution, il convient de débiter POUR SOLDE le compte 71 Subvention d'exploitation OU le compte 14 Subvention d'investissement SELON LE CAS, par le crédit du compte 4739 ».",
      applicationGuide: 'App. 19',
      parametres: [{ nom: 'aReverser', libelle: 'Quote-part à reverser', type: 'MONTANT' }],
      lignes: [
        { compte: '14', libelle: "Subvention à restituer (investissement) ou 71 (exploitation)", sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'aReverser' }, note: "Choisir 14 pour une subvention d'investissement, 71 pour une subvention d'exploitation." },
        { compte: '4739', libelle: 'Subventions à reverser', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'aReverser' } },
      ],
    },
    {
      code: 'B12-REVERSEMENT',
      libelle: 'Reversement au tiers financeur',
      objet: 'Solde la dette de restitution par le règlement effectif.',
      source: "Partie 3 ch. 6 § 4 : « lors du règlement des fonds au tiers financeur, les comptes 4739 sont soldés au débit par le crédit du compte de trésorerie ».",
      applicationGuide: 'App. 19',
      parametres: [{ nom: 'reversement', libelle: 'Montant reversé', type: 'MONTANT' }],
      lignes: [
        { compte: '4739', libelle: 'Subventions à reverser', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'reversement' } },
        { compte: '5', libelle: 'Trésorerie', sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'reversement' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B13 · Contributions volontaires en nature
// ---------------------------------------------------------------------------

const B13: OperationSpecifique = {
  code: 'B13',
  libelle: 'Contributions volontaires en nature (bénévolat, mises à disposition, prestations)',
  source: 'Partie 3 ch. 6 § 5 · Guide, Application 20',
  portee: 'ASSOCIATIONS',
  politiqueADecider:
    "Ces contributions sont GRATUITES : « elles n'entraînent pas de flux financiers à l'exception des dons en nature à vendre. Elles ne sont donc PAS INSCRITES AU COMPTE DE RÉSULTAT mais doivent faire l'objet d'informations dans la Note annexe 1 » (Partie 3 ch. 6 § 5.2.3). D'où la classe 9, hors bilan et hors résultat. Reste à fixer la BASE D'ÉVALUATION : « la valeur actuelle des biens et services » pour les biens, « le SMIG horaire » pour le bénévolat dans l'exemple du Guide · un taux que le dossier doit justifier.",
  modeles: [
    {
      code: 'B13-BIENS',
      libelle: 'Contribution volontaire en biens',
      objet: "Enregistre hors bilan un bien mis gratuitement à disposition de l'entité.",
      source:
        "Partie 3 ch. 6 § 5.2 : débit des comptes spéciaux 900 Secours en nature, 901 Mise à disposition gratuite de biens, 902 Prestations en nature, 904 Personnel bénévole ; crédit des comptes 910 Dons en nature, 911 Prestations en nature, 914 Bénévolat.",
      applicationGuide: 'App. 20',
      parametres: [{ nom: 'valeur', libelle: 'Valeur actuelle des biens reçus', type: 'MONTANT' }],
      lignes: [
        { compte: '901', libelle: 'Mise à disposition gratuite de biens', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
        { compte: '910', libelle: 'Dons en nature', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
      ],
    },
    {
      code: 'B13-BENEVOLAT',
      libelle: 'Contribution volontaire en travail (bénévolat)',
      objet: 'Valorise hors bilan les heures offertes par les bénévoles.',
      source:
        "Guide App. 20 : « l'évaluation des heures de bénévolat sur la base du SMIG horaire ». Le montant est le produit des heures par le taux horaire retenu.",
      applicationGuide: 'App. 20',
      parametres: [
        { nom: 'heures', libelle: 'Nombre total d’heures offertes', type: 'MONTANT', aide: 'Ex. 450 bénévoles × 18,5 h de moyenne = 8 325 h (App. 20).' },
        { nom: 'tauxHoraire', libelle: 'Taux horaire de valorisation', type: 'TAUX', aide: 'SMIG horaire dans l’exemple du Guide ; à justifier par le dossier.' },
      ],
      lignes: [
        { compte: '904', libelle: 'Personnel bénévole', sens: 'DEBIT', montant: { mode: 'PROPORTION', parametre: 'heures', taux: 'tauxHoraire' } },
        { compte: '914', libelle: 'Bénévolat', sens: 'CREDIT', montant: { mode: 'PROPORTION', parametre: 'heures', taux: 'tauxHoraire' } },
      ],
      anomalie:
        "[texte officiel] Dans l'App. 20, le bénévolat vaut 2 880 450 dans l'écriture comptable (8 325 h × 346, arithmétiquement exact) mais 2 864 880 dans le tableau de la Note 1, sans que l'écart soit expliqué. Ce modèle calcule heures × taux · la seule des deux valeurs qui se vérifie.",
    },
  ],
};

// ---------------------------------------------------------------------------
// B20 et B21 · opérations décrites par le texte SANS cas chiffré
// ---------------------------------------------------------------------------

/**
 * Deux opérations du plan de complétude n'ont PAS d'écriture-type ici, et
 * c'est délibéré : le référentiel les décrit sans leur donner ni schéma
 * d'écriture ni application chiffrée. En fabriquer une reviendrait à inventer
 * un traitement que le texte ne prescrit pas (règle §2.6).
 *
 * - **B20 · Promesses de financement.** Le cadre conceptuel (§ 5.4.2.4)
 *   distingue la promesse FERME ET ÉCRITE, qui se constate en créance, de la
 *   promesse CONDITIONNELLE, qui relève de la seule Note annexe. Le cas ferme
 *   est couvert en pratique par `B4-GENEROSITE-A-RECEVOIR` (compte 475) et
 *   par `B11-SIGNATURE` (mécénat) ; le cas conditionnel n'appelle aucune
 *   écriture, par construction.
 *
 * - **B21 · Première année d'application du SYCEBNL.** La Partie 3 ch. 6 § 6
 *   fixe une méthode, pas des écritures : « faire l'inventaire et
 *   comptabiliser TOUS les actifs et passifs suivant le plan des comptes du
 *   Système comptable des entités à but non lucratif » et, à l'inverse, « NE
 *   PAS comptabiliser des éléments en tant qu'actifs ou passifs si le
 *   Système comptable ne l'autorise pas ». Les écritures dépendent
 *   entièrement du bilan d'ouverture réel du dossier.
 */
export const OPERATIONS_DONS_ET_AUTRES: OperationSpecifique[] = [B2, B3, B4, B5, B7, B8, B9, B10, B11, B12, B13];
