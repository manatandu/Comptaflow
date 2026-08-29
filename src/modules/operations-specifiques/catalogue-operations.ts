import { OperationSpecifique } from './operation-specifique.types';

/**
 * CATALOGUE DES OPÉRATIONS SPÉCIFIQUES AUX EBNL — Partie 3 du référentiel
 * SYCEBNL, et les applications chiffrées du Guide d'application.
 *
 * Les codes B1 à B21 sont ceux de `docs/plan-sycebnl-complet.md`.
 *
 * ## Règle de numérotation appliquée à tout le catalogue
 *
 * Les comptes visés sont ceux du PLAN NORMALISÉ (Partie 2 ch. 2), jamais les
 * subdivisions que le Guide s'autorise dans ses exemples. Le Guide écrit par
 * endroits un cran plus bas — `6055` là où le plan donne `605`, `4751` là où
 * il donne `475`, `7925` là où il donne `792`. Ces sous-comptes n'existent pas
 * dans un plan standard : viser ce niveau rendrait les modèles inapplicables.
 * Chaque cas est noté sur la ligne concernée.
 *
 * ## Anomalies du texte officiel rencontrées ici (règle §2.6)
 *
 * 1. **App. 5** : la dotation aux amortissements du mobilier de bureau (bien
 *    en 2441) est imputée à « 28444 » alors que les trois autres lignes de la
 *    même écriture suivent le schéma « 28 + racine du bien » (2313→28313,
 *    2442→28442, 2451→28451), qui donnerait 28441. Le 28444 est
 *    l'amortissement des matériels SPORTIFS (2444).
 * 2. **App. 10** : la vente du don en nature H.A.O. est portée au crédit de
 *    « 8421 », alors que le plan des comptes, la fiche du compte 84 (Partie 2
 *    ch. 3) ET la Partie 3 ch. 4 § 2 donnent tous trois « 8411 Dons en nature
 *    HAO vendus ». Trois sources concordantes contre une : le modèle retient
 *    8411 et le signale.
 * 3. **App. 20** : le bénévolat vaut 2 880 450 dans l'écriture (8 325 h × 346,
 *    arithmétiquement exact) mais 2 864 880 dans le tableau de la Note 1.
 *    L'écart n'est pas expliqué. Le modèle calcule l'écriture — la seule des
 *    deux valeurs qui se vérifie.
 *
 * ⚠️ N'EST PAS une anomalie, vérification faite : App. 11 impute l'édifice
 * religieux en 2327, qui existe bien au plan — « Édifices religieux et
 * assimilés SUR SOL D'AUTRUI » (232 reprend les subdivisions de 231).
 */

// ---------------------------------------------------------------------------
// B14 — Dotation consomptible et non consomptible
// ---------------------------------------------------------------------------

const B14: OperationSpecifique = {
  code: 'B14',
  libelle: 'Dotation consomptible et non consomptible',
  source: 'Partie 3 ch. 1 · Guide, Application 1',
  portee: 'ASSOCIATIONS',
  politiqueADecider:
    "Les statuts prévoient-ils une phase de SOUSCRIPTION puis de LIBÉRATION des apports ? Le Guide (App. 1, note préliminaire) renvoie « à la loi de l'État partie régissant les EBNL, aux statuts et au règlement intérieur » : si oui, les comptes 451 Apporteurs constatent les deux étapes ; sinon, l'apport s'enregistre directement à sa réalisation.",
  modeles: [
    {
      code: 'B14-SOUSCRIPTION-DEFINITIF',
      libelle: 'Souscription des apports à titre définitif',
      objet: "Constate la créance sur les apporteurs qui dotent l'entité de façon définitive.",
      source:
        "Partie 3 ch. 1 : les apports durables mis à disposition de façon DÉFINITIVE constituent une dotation non consomptible SANS droit de reprise ; ceux destinés à couvrir les charges de fonctionnement, une dotation CONSOMPTIBLE.",
      applicationGuide: 'App. 1',
      parametres: [
        { nom: 'apportsNature', libelle: 'Apports en nature (biens durables)', type: 'MONTANT' },
        { nom: 'apportsNumeraire', libelle: 'Apports en numéraire destinés au fonctionnement', type: 'MONTANT' },
      ],
      lignes: [
        { compte: '4511', libelle: 'Apporteurs en nature', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNature' } },
        { compte: '4512', libelle: 'Apporteurs en numéraire', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNumeraire' } },
        { compte: '1015', libelle: 'Dotation non consomptible sans droit de reprise — en nature', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNature' } },
        { compte: '1041', libelle: 'Dotation consomptible', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNumeraire' } },
      ],
    },
    {
      code: 'B14-SOUSCRIPTION-PROVISOIRE',
      libelle: 'Souscription des apports à titre provisoire',
      objet: 'Constate la créance sur les apporteurs dont la convention fixe des modalités de reprise.',
      source:
        'Partie 3 ch. 1 : les apports durables mis à disposition de façon PROVISOIRE constituent une dotation non consomptible AVEC droit de reprise.',
      applicationGuide: 'App. 1',
      parametres: [
        { nom: 'apportsNature', libelle: 'Apports en nature repris ultérieurement', type: 'MONTANT' },
        { nom: 'apportsNumeraire', libelle: 'Apports en numéraire repris ultérieurement', type: 'MONTANT' },
      ],
      lignes: [
        { compte: '4511', libelle: 'Apporteurs en nature', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNature' } },
        { compte: '4512', libelle: 'Apporteurs en numéraire', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNumeraire' } },
        { compte: '1025', libelle: 'Dotation non consomptible avec droit de reprise — en nature', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNature' } },
        { compte: '1021', libelle: 'Dotation non consomptible avec droit de reprise — en numéraire', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'apportsNumeraire' } },
      ],
    },
    {
      code: 'B14-QUOTE-PART-CONSOMPTIBLE',
      libelle: 'Quote-part de dotation consomptible transférée au résultat',
      objet: 'À la clôture, couvre les charges de fonctionnement engagées sur la dotation consomptible.',
      source:
        "Glossaire, DOTATION CONSOMPTIBLE : « ressource de financement durable REPRISE AU COMPTE RÉSULTAT pour couvrir des charges de l'exercice ».",
      applicationGuide: 'App. 1',
      parametres: [{ nom: 'chargesCouvertes', libelle: 'Charges couvertes par la dotation consomptible', type: 'MONTANT' }],
      lignes: [
        { compte: '1049', libelle: 'Dotation consomptible inscrite au compte de résultat', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'chargesCouvertes' } },
        { compte: '703', libelle: 'Quote-part des dotations consomptibles transférées', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'chargesCouvertes' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B6 — Cotisations des membres et droit d'entrée
// ---------------------------------------------------------------------------

const B6: OperationSpecifique = {
  code: 'B6',
  libelle: "Cotisations des adhérents et droit d'entrée",
  source: 'Partie 3 ch. 5 § 1 · Guide, Applications 2 et 13',
  portee: 'ASSOCIATIONS',
  politiqueADecider:
    "Fait générateur du produit : à l'APPEL ou à l'ENCAISSEMENT ? Le Guide (App. 2, note préliminaire) le conditionne à un fait vérifiable : « SI l'entité peut justifier le droit d'agir pour recouvrer l'appel, le compte 411 Adhérents peut être utilisé pour constater la créance. SINON, constater le produit lors de l'encaissement effectif. » Ce n'est donc pas une préférence de méthode mais l'existence, dans les statuts, d'une voie de recouvrement.",
  modeles: [
    {
      code: 'B6-APPEL-DROIT-ENTREE',
      libelle: "Appel du droit d'entrée, du dépôt restituable et des cotisations",
      objet: 'Constate la créance sur les nouveaux membres et la ventile selon les statuts.',
      source:
        "Glossaire, DROIT D'ENTRÉE : « fonds versé une seule fois lors de l'adhésion de tout nouveau membre EN SUS de la cotisation périodique (fonds propres de l'entité) ». Le dépôt restituable est une dette, pas un produit.",
      applicationGuide: 'App. 2',
      parametres: [
        { nom: 'appelGlobal', libelle: "Montant global de l'appel", type: 'MONTANT' },
        { nom: 'tauxDepot', libelle: 'Part en dépôt restituable (statuts)', type: 'TAUX', defaut: 0.15 },
        { nom: 'tauxCotisation', libelle: 'Part en appel de cotisations (statuts)', type: 'TAUX', defaut: 0.1 },
      ],
      lignes: [
        { compte: '411', libelle: 'Adhérents', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'appelGlobal' } },
        {
          compte: '1851', libelle: 'Dépôts reçus', sens: 'CREDIT',
          montant: { mode: 'PROPORTION', parametre: 'appelGlobal', taux: 'tauxDepot' },
          note: 'Dette restituable, pas un produit — délai fixé par les statuts.',
        },
        { compte: '701', libelle: 'Cotisations des adhérents', sens: 'CREDIT', montant: { mode: 'PROPORTION', parametre: 'appelGlobal', taux: 'tauxCotisation' } },
        {
          compte: '103', libelle: "Droit d'entrée", sens: 'CREDIT', montant: { mode: 'COMPLEMENT' },
          note: "« le solde = droit d'entrée » (App. 2) — calculé, jamais saisi.",
        },
      ],
    },
    {
      code: 'B6-APPEL-COTISATION',
      libelle: 'Appel de cotisation périodique',
      objet: 'Constate la cotisation appelée sur la période, quand les statuts ouvrent une voie de recouvrement.',
      source: 'Partie 3 ch. 5 § 1 : compte 411 Adhérents par le crédit du 701 Cotisations des adhérents.',
      applicationGuide: 'App. 13',
      parametres: [{ nom: 'cotisation', libelle: 'Cotisation appelée', type: 'MONTANT' }],
      lignes: [
        { compte: '411', libelle: 'Adhérents', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'cotisation' } },
        { compte: '701', libelle: 'Cotisations des adhérents', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'cotisation' } },
      ],
    },
    {
      code: 'B6-COTISATION-DOUTEUSE',
      libelle: 'Transfert en cotisations douteuses',
      objet: 'Isole les cotisations dont le recouvrement est compromis, avant de les déprécier.',
      source: 'Partie 3 ch. 5 § 1 : compte 4161 Adhérents, cotisations douteuses.',
      applicationGuide: 'App. 13',
      parametres: [{ nom: 'creanceDouteuse', libelle: 'Cotisations dont le recouvrement est compromis', type: 'MONTANT' }],
      lignes: [
        { compte: '4161', libelle: 'Adhérents, cotisations douteuses', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'creanceDouteuse' } },
        { compte: '411', libelle: 'Adhérents', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'creanceDouteuse' } },
      ],
    },
    {
      code: 'B6-DEPRECIATION-COTISATION',
      libelle: 'Dépréciation des cotisations douteuses',
      objet: 'Constate la perte probable sur les cotisations transférées en douteux.',
      source: 'Partie 3 ch. 5 § 1 : compte 659 Charges pour dépréciations par le crédit du 4912.',
      applicationGuide: 'App. 13',
      parametres: [
        { nom: 'creanceDouteuse', libelle: 'Cotisations douteuses', type: 'MONTANT' },
        { nom: 'tauxDepreciation', libelle: 'Taux de dépréciation retenu', type: 'TAUX', defaut: 0.8 },
      ],
      lignes: [
        { compte: '659', libelle: 'Charges pour dépréciations sur créances', sens: 'DEBIT', montant: { mode: 'PROPORTION', parametre: 'creanceDouteuse', taux: 'tauxDepreciation' }, note: 'Le Guide écrit 6594 — subdivision du 659.' },
        { compte: '4912', libelle: 'Dépréciations des créances douteuses', sens: 'CREDIT', montant: { mode: 'PROPORTION', parametre: 'creanceDouteuse', taux: 'tauxDepreciation' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B15 — Subventions d'investissement
// ---------------------------------------------------------------------------

const B15: OperationSpecifique = {
  code: 'B15',
  libelle: "Subventions d'investissement",
  source: 'Partie 3 ch. 1 § 2.5 · Guide, Application 3',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B15-NOTIFICATION',
      libelle: "Notification d'une subvention d'équipement",
      objet: 'Constate la créance dès la notification, avant tout encaissement.',
      source:
        "Glossaire, SUBVENTION D'INVESTISSEMENT : « aide financière accordée à l'entité en vue d'ACQUÉRIR OU DE CRÉER des valeurs immobilisées ».",
      applicationGuide: 'App. 3',
      parametres: [{ nom: 'subvention', libelle: 'Subvention notifiée', type: 'MONTANT' }],
      lignes: [
        { compte: '4731', libelle: "Subventions d'investissement à recevoir", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'subvention' } },
        { compte: '141', libelle: "Subventions d'équipement", sens: 'CREDIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'subvention' }, note: "Choisir selon l'origine : État, collectivités, organismes internationaux…" },
      ],
    },
    {
      code: 'B15-REPRISE',
      libelle: "Reprise de la subvention d'investissement",
      objet: "Rapporte au résultat la quote-part de subvention correspondant à l'amortissement du bien financé.",
      source:
        "Guide App. 3 : pour un bien AMORTISSABLE, la reprise suit le rythme de l'amortissement. Pour une immobilisation NON AMORTISSABLE (un terrain), « la subvention est reprise sur 10 ans en l'absence de clause d'inaliénabilité, à raison de 1/10 par exercice, SANS PRORATA TEMPORIS ».",
      applicationGuide: 'App. 3',
      parametres: [
        { nom: 'baseSubvention', libelle: 'Subvention affectée au bien', type: 'MONTANT' },
        { nom: 'duree', libelle: 'Durée de reprise (années)', type: 'DUREE_ANNEES', defaut: 10, aide: "Durée d'amortissement du bien ; 10 ans pour un bien non amortissable sans clause d'inaliénabilité." },
        { nom: 'mois', libelle: "Mois d'utilisation sur l'exercice", type: 'MOIS', defaut: 12, aide: 'Laisser 12 pour un bien non amortissable : le texte exclut le prorata temporis.' },
      ],
      lignes: [
        { compte: '141', libelle: "Subventions d'équipement", sens: 'DEBIT', auChoix: true, montant: { mode: 'ANNUITE', parametre: 'baseSubvention', parametreDuree: 'duree', parametreMois: 'mois' } },
        { compte: '799', libelle: "Reprises de subventions d'investissement", sens: 'CREDIT', montant: { mode: 'ANNUITE', parametre: 'baseSubvention', parametreDuree: 'duree', parametreMois: 'mois' } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B1 — Fonds affectés à un projet spécifique
// ---------------------------------------------------------------------------

const B1: OperationSpecifique = {
  code: 'B1',
  libelle: 'Fonds affectés à un projet spécifique',
  source: 'Partie 3 ch. 2 · Guide, Application 4',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B1-RECEPTION',
      libelle: 'Réception de fonds affectés à un projet',
      objet: "Enregistre au passif des fonds dont l'affectation est imposée par le donateur ou le bailleur.",
      source:
        "Glossaire, FONDS AFFECTÉS : « ressources reçues par les EBNL affectées à un projet précis, dont on ne saurait se détourner de l'intention du donateur ou du bailleur ». Ce n'est donc PAS un produit à la réception.",
      applicationGuide: 'App. 4',
      parametres: [{ nom: 'fonds', libelle: 'Fonds reçus', type: 'MONTANT' }],
      lignes: [
        { compte: '52', libelle: 'Banque', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'fonds' } },
        { compte: '165', libelle: 'Fonds affectés à un projet spécifique', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'fonds' } },
      ],
    },
    {
      code: 'B1-REPRISE',
      libelle: 'Reprise des fonds affectés consommés',
      objet: 'À la clôture, rapporte au résultat la seule part des fonds réellement consommée par le projet.',
      source:
        "Guide App. 4 : les fonds consommés sont repris au crédit du 792. La part NON consommée reste au passif — c'est l'objet du compte 165 (glossaire : « fonds que les tiers financeurs ont affecté à un but déterminé qui ne sont pas entièrement consommés en fin d'exercice »).",
      applicationGuide: 'App. 4',
      parametres: [{ nom: 'consomme', libelle: "Part des fonds consommée sur l'exercice", type: 'MONTANT' }],
      lignes: [
        { compte: '165', libelle: 'Fonds affectés à un projet spécifique', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'consomme' } },
        { compte: '792', libelle: 'Reprises de fonds affectés', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'consomme' }, note: 'Le Guide écrit 7925 — subdivision du 792.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B16 — Dons et legs d'immobilisations à conserver
// ---------------------------------------------------------------------------

const B16: OperationSpecifique = {
  code: 'B16',
  libelle: "Dons et legs d'immobilisations destinés à être conservés",
  source: 'Partie 3 ch. 2 § 2.2 · Guide, Application 5',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B16-RECEPTION-LEGS',
      libelle: "Réception d'un legs d'immobilisations",
      objet: "Inscrit à l'actif les biens légués, déduction faite des dettes successorales reprises.",
      source:
        "Glossaire, FONDS PROPRES PROVENANT DE LEGS ET DE DONS D'IMMOBILISATIONS : « dons et legs d'immobilisations destinés à être CONSERVÉS par l'entité ». Les dettes successorales sont portées au 4861, le net au 167.",
      applicationGuide: 'App. 5',
      parametres: [
        { nom: 'valeurBiens', libelle: 'Valeur des biens légués', type: 'MONTANT' },
        { nom: 'dettes', libelle: 'Dettes successorales reprises', type: 'MONTANT', defaut: 0 },
      ],
      lignes: [
        { compte: '2', libelle: 'Immobilisations reçues', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'valeurBiens' }, note: 'Choisir le compte correspondant à la nature du bien (bâtiment, mobilier, matériel…).' },
        { compte: '4861', libelle: "Dettes des dons et legs d'immobilisations", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'dettes' } },
        { compte: '167', libelle: "Fonds provenant des dons et legs d'immobilisations", sens: 'CREDIT', auChoix: true, montant: { mode: 'COMPLEMENT' }, note: 'Affectés (1671) ou non affectés (1672) selon la volonté du donateur.' },
      ],
    },
    {
      code: 'B16-PROVISION-CHARGE',
      libelle: 'Provision pour charge attachée au legs',
      objet: "Constate l'obligation mise à la charge de l'entité par le testateur.",
      source: 'Guide App. 5 : compte 1679 Engagement auprès du donateur par le crédit du 192 Provisions pour charges sur legs et dons.',
      applicationGuide: 'App. 5',
      parametres: [{ nom: 'obligation', libelle: "Coût estimé de l'obligation", type: 'MONTANT' }],
      lignes: [
        { compte: '1679', libelle: 'Engagement auprès du donateur', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'obligation' } },
        { compte: '192', libelle: 'Provisions pour charges sur legs et dons', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'obligation' } },
      ],
    },
    {
      code: 'B16-REPRISE-FONDS',
      libelle: 'Reprise des fonds à hauteur des amortissements',
      objet: "Rapporte au résultat la part du legs correspondant à l'amortissement des biens reçus.",
      source:
        "Guide App. 5 : reprise « à concurrence de la dotation aux amortissements des immobilisations acquises par ces fonds ». Glossaire, FONDS AFFECTÉS : « ces fonds sont repris dans la MÊME QUOTITÉ que les dotations aux amortissements ».",
      applicationGuide: 'App. 5',
      parametres: [{ nom: 'dotation', libelle: "Dotation aux amortissements de l'exercice sur ces biens", type: 'MONTANT' }],
      lignes: [
        { compte: '167', libelle: 'Fonds provenant des dons et legs', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'dotation' } },
        { compte: '792', libelle: "Reprises de fonds affectés provenant de dons et legs d'immobilisations", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'dotation' }, note: 'Le Guide écrit 7923 — subdivision du 792.' },
      ],
      anomalie:
        "[texte officiel] Dans l'écriture d'amortissement de la même application, le mobilier de bureau (bien en 2441) est amorti en « 28444 » alors que les trois autres lignes suivent le schéma « 28 + racine du bien » (2313→28313, 2442→28442, 2451→28451), qui donnerait 28441 ; 28444 est l'amortissement des matériels sportifs. Sans effet ici : le plan s'arrête à 2844, qui couvre les deux.",
    },
  ],
};

// ---------------------------------------------------------------------------
// B17 — Legs et donations non encore reçus, destinés à la vente
// ---------------------------------------------------------------------------

const B17: OperationSpecifique = {
  code: 'B17',
  libelle: "Legs et donations non encore reçus d'immobilisations destinées à la vente",
  source: 'Partie 3 ch. 2 § 2.2 · Guide, Application 6',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B17-COMPTABILISATION',
      libelle: "Acceptation d'un legs de biens destinés à la vente",
      objet: 'Inscrit les biens légués et le fonds reporté correspondant, avant leur mise à disposition.',
      source:
        "Glossaire, FONDS REPORTÉS : « donations ou legs d'immobilisations NON ENCORE REÇUS destinés à la vente ou encore des donations temporaires d'usufruit ».",
      applicationGuide: 'App. 6',
      parametres: [
        { nom: 'batiments', libelle: 'Bâtiments destinés à la vente', type: 'MONTANT', defaut: 0 },
        { nom: 'materiels', libelle: 'Matériels destinés à la vente', type: 'MONTANT', defaut: 0 },
      ],
      lignes: [
        { compte: '203', libelle: 'Bâtiments destinés à la vente provenant de legs non encore reçus', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'batiments' } },
        { compte: '204', libelle: 'Matériels destinés à la vente provenant de legs non encore reçus', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'materiels' } },
        { compte: '172', libelle: "Legs non encore reçus d'immobilisations destinées à la vente", sens: 'CREDIT', montant: { mode: 'COMPLEMENT' } },
      ],
    },
    {
      code: 'B17-DEPRECIATION',
      libelle: 'Dépréciation des biens destinés à la vente',
      objet: 'Constate la perte de valeur révélée par le test de dépréciation à la clôture.',
      source: 'Guide App. 6 : compte 695 Dotations aux dépréciations par le crédit du 2902.',
      applicationGuide: 'App. 6',
      parametres: [{ nom: 'depreciation', libelle: 'Dépréciation constatée', type: 'MONTANT' }],
      lignes: [
        { compte: '695', libelle: 'Dotations aux dépréciations des immobilisations destinées à la vente', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'depreciation' }, note: 'Le Guide écrit 6952 — subdivision du 695.' },
        { compte: '2902', libelle: 'Dépréciations des immobilisations destinées à la vente', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'depreciation' } },
      ],
    },
    {
      code: 'B17-SOLDE-FONDS',
      libelle: 'Solde du fonds reporté après cession',
      objet: 'Rapporte au résultat le fonds reporté, une fois les biens vendus.',
      source: 'Guide App. 6 : compte 172 par le crédit du 796 Reprises des fonds reportés.',
      applicationGuide: 'App. 6',
      parametres: [{ nom: 'fondsReporte', libelle: 'Fonds reporté à solder', type: 'MONTANT' }],
      lignes: [
        { compte: '172', libelle: "Legs non encore reçus d'immobilisations destinées à la vente", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'fondsReporte' } },
        { compte: '796', libelle: 'Reprises des fonds reportés', sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'fondsReporte' }, note: 'Le Guide écrit 7962 — subdivision du 796.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B18 — Donation temporaire d'usufruit
// ---------------------------------------------------------------------------

const B18: OperationSpecifique = {
  code: 'B18',
  libelle: "Donation temporaire d'usufruit",
  source: 'Partie 3 ch. 2 § 2.3 · Guide, Application 7',
  portee: 'ASSOCIATIONS',
  modeles: [
    {
      code: 'B18-RECEPTION',
      libelle: "Réception d'un usufruit temporaire",
      objet: "Inscrit le droit d'usage reçu et le fonds reporté correspondant.",
      source:
        "Glossaire, DONATION TEMPORAIRE D'USUFRUIT : « le donateur donne le droit d'user et de percevoir les revenus d'un de ses biens à un bénéficiaire nommément désigné, PENDANT UNE DURÉE DÉTERMINÉE ».",
      applicationGuide: 'App. 7',
      parametres: [{ nom: 'valeur', libelle: "Valeur estimée de l'usufruit", type: 'MONTANT' }],
      lignes: [
        { compte: '2011', libelle: 'Usufruit temporaire', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
        { compte: '171', libelle: "Donation temporaire d'usufruit", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'valeur' } },
      ],
    },
    {
      code: 'B18-AMORTISSEMENT',
      libelle: "Amortissement de l'usufruit",
      objet: "Étale la valeur de l'usufruit sur la durée de la donation.",
      source: 'Guide App. 7 : compte 680 par le crédit du 280 Amortissements d’usufruit temporaire.',
      applicationGuide: 'App. 7',
      parametres: [
        { nom: 'valeur', libelle: "Valeur de l'usufruit", type: 'MONTANT' },
        { nom: 'duree', libelle: 'Durée de la donation (années)', type: 'DUREE_ANNEES' },
        { nom: 'mois', libelle: "Mois d'usage sur l'exercice", type: 'MOIS', defaut: 12 },
      ],
      lignes: [
        { compte: '680', libelle: "Dotations aux amortissements d'usufruit temporaire", sens: 'DEBIT', montant: { mode: 'ANNUITE', parametre: 'valeur', parametreDuree: 'duree', parametreMois: 'mois' } },
        { compte: '280', libelle: "Amortissements d'usufruit temporaire", sens: 'CREDIT', montant: { mode: 'ANNUITE', parametre: 'valeur', parametreDuree: 'duree', parametreMois: 'mois' } },
      ],
    },
    {
      code: 'B18-REPRISE',
      libelle: "Reprise du fonds d'usufruit au même rythme",
      objet: "Neutralise au résultat l'amortissement de l'usufruit, qui n'appauvrit pas l'entité.",
      source: 'Guide App. 7 : compte 171 par le crédit du 796, « au même rythme » que l’amortissement.',
      applicationGuide: 'App. 7',
      parametres: [{ nom: 'dotation', libelle: "Amortissement de l'usufruit sur l'exercice", type: 'MONTANT' }],
      lignes: [
        { compte: '171', libelle: "Donation temporaire d'usufruit", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'dotation' } },
        { compte: '796', libelle: "Reprises de fonds provenant d'usufruit temporaire", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'dotation' }, note: 'Le Guide écrit 7961 — subdivision du 796.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// B19 — Projets de développement : fonds du bailleur
// ---------------------------------------------------------------------------

const B19: OperationSpecifique = {
  code: 'B19',
  libelle: 'Projets de développement — fonds du bailleur',
  source: 'Partie 3 ch. 3 · Guide, Application 8',
  portee: 'PROJETS',
  modeles: [
    {
      code: 'B19-DECAISSEMENT',
      libelle: 'Décaissement du bailleur',
      objet: 'Ventile les fonds reçus entre part investissement et part fonctionnement, selon la clé du bailleur.',
      source:
        "Glossaire, FONDS D'ADMINISTRATION : « fonds ou biens consommables que le bailleur du projet a mis à disposition pour couvrir les CHARGES DE FONCTIONNEMENT ».",
      applicationGuide: 'App. 8',
      parametres: [
        { nom: 'virement', libelle: 'Virement global reçu', type: 'MONTANT' },
        { nom: 'partInvestissement', libelle: 'Part investissement (clé du budget)', type: 'TAUX', defaut: 0.8 },
      ],
      lignes: [
        { compte: '52', libelle: 'Banque', sens: 'DEBIT', auChoix: true, montant: { mode: 'PARAMETRE', parametre: 'virement' } },
        { compte: '162', libelle: 'Fonds affectés aux investissements du projet', sens: 'CREDIT', montant: { mode: 'PROPORTION', parametre: 'virement', taux: 'partInvestissement' } },
        { compte: '462', libelle: "Bailleurs — fonds d'administration", sens: 'CREDIT', montant: { mode: 'COMPLEMENT' } },
      ],
    },
    {
      code: 'B19-TRANSFERT-ADMINISTRATION',
      libelle: "Transfert des fonds d'administration au résultat",
      objet: 'Neutralise les charges de fonctionnement du projet par un produit de même montant.',
      source:
        "Glossaire, FONDS D'ADMINISTRATION : « ces fonds sont repris dans les revenus AU FUR ET À MESURE DE L'ENGAGEMENT DES EMPLOIS ».",
      applicationGuide: 'App. 8',
      parametres: [{ nom: 'chargesEngagees', libelle: 'Charges de fonctionnement engagées', type: 'MONTANT' }],
      lignes: [
        { compte: '462', libelle: "Bailleurs — fonds d'administration", sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'chargesEngagees' } },
        { compte: '702', libelle: "Quote-part de fonds d'administration transférés", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'chargesEngagees' } },
      ],
    },
    {
      code: 'B19-FONDS-NON-CONSOMMES',
      libelle: "Fonds d'investissement non consommés à la clôture",
      objet: "Isole la part des fonds d'investissement que le projet n'a pas employée sur l'exercice.",
      source: "Guide App. 8, écriture du 31/12/N : compte 162 par le crédit du 165 Fonds non consommés en fin d'exercice, « extourne au 1er janvier N+1 ».",
      applicationGuide: 'App. 8',
      parametres: [{ nom: 'nonConsomme', libelle: "Fonds d'investissement non consommés", type: 'MONTANT' }],
      lignes: [
        { compte: '162', libelle: 'Fonds affectés aux investissements du projet', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'nonConsomme' } },
        { compte: '165', libelle: "Fonds non consommés en fin d'exercice", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'nonConsomme' } },
      ],
      aExtourner: true,
    },
    {
      code: 'B19-AJUSTEMENT-CLE',
      libelle: 'Ajustement de la clé investissement / fonctionnement',
      objet: "Corrige la répartition estimée à la réception, une fois l'emploi réel des fonds connu.",
      source:
        "Guide App. 8, « Ajustements N+1 » : « à la réception, à DÉFAUT D'INFORMATION PRÉCISE DU BAILLEUR, l'entité avait estimé » la clé ; l'écart se corrige entre les comptes 162 et 462.",
      applicationGuide: 'App. 8',
      parametres: [{ nom: 'ajustement', libelle: "Montant à transférer de l'investissement vers l'administration", type: 'MONTANT' }],
      lignes: [
        { compte: '162', libelle: 'Fonds affectés aux investissements du projet', sens: 'DEBIT', montant: { mode: 'PARAMETRE', parametre: 'ajustement' } },
        { compte: '462', libelle: "Bailleurs — fonds d'administration", sens: 'CREDIT', montant: { mode: 'PARAMETRE', parametre: 'ajustement' } },
      ],
    },
  ],
};

export const OPERATIONS_FONDS_PROPRES: OperationSpecifique[] = [B14, B6, B15, B1, B16, B17, B18, B19];
