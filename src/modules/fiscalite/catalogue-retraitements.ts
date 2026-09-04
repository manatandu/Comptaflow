import { SensRetraitementFiscal } from '@prisma/client';

/**
 * CATALOGUE DES RETRAITEMENTS FISCAUX · loi n° 23/053 du 30 novembre 2023,
 * Titre II (impôt sur les sociétés), applicable depuis le 1er janvier 2026.
 *
 * Ce fichier est une TABLE DE RÉFÉRENCES, au même titre que
 * `retenues/correspondance-retenues.ts` et `exercice/planning-cloture.ts` :
 * il nomme les redressements et cite leur article, il ne décide rien.
 *
 * Pourquoi une saisie, et non une déduction automatique depuis la balance ·
 * la qualification fiscale d'une charge ne se lit pas dans son numéro de
 * compte. Le compte 6582 « Dons » et le 835 « Dons et libéralités accordés »
 * reçoivent des versements déductibles dans la limite de 0,5 % du chiffre
 * d'affaires (art. 44) ET d'autres qui ne le sont pas ; le 647 mêle des
 * pénalités de recouvrement et des amendes fiscales, que l'article 50, 3°
 * exclut toutes de la déduction. Un
 * logiciel qui trancherait seul se tromperait en silence, et l'erreur ne se
 * découvrirait qu'au contrôle. Le comptable saisit, OmegaX calcule et
 * justifie.
 *
 * L'IPR et l'IBP n'existent plus : l'article 152 de la loi 23/053 a abrogé
 * les titres III et IV de l'ordonnance-loi n° 69/009. Aucune entrée de ce
 * catalogue ne s'y réfère.
 *
 * AUCUN MONTANT EN VALEUR ABSOLUE ici · seuls des POURCENTAGES d'assiette,
 * qui sont la règle elle-même. Les montants fixes (forfaits, seuils en
 * dollars) vivent dans le service, avec leur date de vérification.
 */

/**
 * Assiette d'un plafond légal · ce sur quoi le pourcentage se calcule, ET,
 * par voie de conséquence, la PORTÉE du plafond.
 *
 * LA DISTINCTION COMMANDE LE CALCUL, elle n'est pas décorative :
 *
 *  · `CHIFFRE_AFFAIRES` · le plafond est un montant unique pour toute la
 *    NATURE de charge, quel que soit le nombre de comptes qui la portent.
 *    L'art. 44 admet les versements « dans la limite de 0,5 % du chiffre
 *    d'affaires de l'exercice », l'art. 49, 1° les cadeaux « dans les limites
 *    de deux pour mille (2 ‰) du chiffre d'affaires hors taxes » et l'art. 43
 *    les redevances « dans la limite de 3,5 % du chiffre d'affaires hors
 *    taxes » · aucun de ces trois textes ne rattache la limite à un compte.
 *    L'appliquer compte par compte laisserait passer autant de fois le
 *    plafond qu'il y a de comptes, et le dépassement ne se verrait nulle
 *    part : le calcul aurait l'air normal, seul l'impôt serait faux.
 *
 *  · `CHARGE` · le plafond est une FRACTION de la charge elle-même, et rien
 *    d'autre. L'art. 49, 2° admet les frais de représentation « dans la
 *    limite de 60 % de leur montant » et l'art. 49, 7° les frais de
 *    communication « dans la limite de 50 % de leur montant ». Une fraction
 *    est linéaire : 60 % de chacun des comptes font 60 % de leur somme, et
 *    l'application compte par compte donne exactement le même total. Rien à
 *    globaliser ici, et globaliser n'y changerait rien.
 */
export type AssiettePlafond =
  /**
   * Chiffre d'affaires de l'exercice (postes TA à TD du compte de résultat) ·
   * plafond GLOBAL par nature de charge.
   */
  | 'CHIFFRE_AFFAIRES'
  /** Montant de la charge elle-même · une fraction seulement est admise. */
  | 'CHARGE';

export interface DefinitionRetraitement {
  code: string;
  sens: SensRetraitementFiscal;
  libelle: string;
  /** Ce qu'il faut avoir vérifié avant de porter une somme sur cette ligne. */
  aide: string;
  source: string;
  /**
   * Plafond légal, quand la loi en pose un. `part` est la FRACTION ADMISE en
   * déduction : au-delà, l'excédent se réintègre. Absent = pas de plafond
   * chiffré, la déductibilité s'apprécie au cas par cas.
   *
   * La PORTÉE du plafond se lit dans `assiette`, et elle change le calcul :
   * un plafond assis sur le chiffre d'affaires est GLOBAL pour toute la
   * nature de charge, un plafond assis sur la charge est une fraction de
   * chaque charge. Voir le commentaire de `AssiettePlafond`.
   */
  plafond?: { part: number; assiette: AssiettePlafond; enonce: string };
}

export const CODE_LIBRE = 'AUTRE';

export const CATALOGUE_RETRAITEMENTS: DefinitionRetraitement[] = [
  // --- RÉINTÉGRATIONS · article 50, charges expressément non déductibles ---
  {
    code: 'DEPENSES_PERSONNELLES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Dépenses à caractère personnel',
    aide: "Dépenses du dirigeant ou des associés étrangères à l'exploitation, passées en charges. Une dépense mixte se ventile ; à défaut de ventilation possible, c'est l'article 20 qui commande, la charge devant être exposée dans l'intérêt direct de l'entreprise.",
    source: 'Loi n° 23/053, art. 50, 1° (et art. 20 pour les conditions générales)',
  },
  {
    code: 'IMPOT_SUR_LE_RESULTAT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Impôt sur les sociétés et impôt minimum comptabilisés en charges',
    aide: "L'impôt sur le résultat n'est pas une charge déductible de son propre calcul. En SYSCOHADA, il s'agit du compte 89. Le minimum forfaitaire de perception suit la même règle.",
    source: 'Loi n° 23/053, art. 45 et art. 50, 2°',
  },
  {
    code: 'PRELEVEMENT_EXPATRIES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Prélèvement exceptionnel sur les rémunérations du personnel expatrié',
    aide: "Prélèvement de 25 % à charge de l'entreprise, assis sur le montant brut des rémunérations. Il est expressément exclu des charges déductibles, alors qu'il est bien une charge comptable.",
    source: 'Loi n° 23/053, art. 50, 2° (prélèvement : art. 145 à 149)',
  },
  {
    code: 'AMENDES_PENALITES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Amendes, confiscations et pénalités de toute nature',
    aide: "Y compris les honoraires et frais payés à cet effet. Attention au piège comptable : le SYSCOHADA range les amendes fiscales et pénales dans les charges ORDINAIRES, ce qui ne les rend pas déductibles pour autant.",
    source: 'Loi n° 23/053, art. 50, 3°',
  },
  {
    code: 'BIENS_DONNES_EN_LOCATION',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Dépenses relatives aux biens donnés en location, amortissements compris',
    aide: "Sauf location par une institution de crédit-bail agréée par la Banque Centrale du Congo, dont les amortissements restent déductibles (art. 28).",
    source: 'Loi n° 23/053, art. 50, 4°',
  },
  {
    code: 'PROVISIONS_NON_ADMISES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Provisions et dépréciations non admises',
    aide: "Les provisions ne sont PAS déductibles, à quatre exceptions près : reconstitution de gisements miniers, créances des établissements de crédit et de microfinance, engagements réglementés des sociétés d'assurance et de réassurance, sous certification du commissaire aux comptes. Toute autre dotation de la classe 69 se réintègre.",
    source: 'Loi n° 23/053, art. 50, 5°',
  },
  {
    code: 'DEPENSES_SOMPTUAIRES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Dépenses somptuaires',
    aide: "Chasse et pêche sportives, bateaux de plaisance, aéronefs de tourisme, résidences d'agrément, et toute dépense de même nature.",
    source: 'Loi n° 23/053, art. 50, 6°',
  },
  {
    code: 'FRAIS_SIEGE_ETRANGER',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Frais généraux du siège à l’étranger et frais exposés à l’étranger',
    aide: "Concerne les établissements stables d'une société non-résidente : la quote-part de frais généraux du siège et les frais engagés à l'étranger par la société ne sont pas déductibles du résultat de l'établissement congolais.",
    source: 'Loi n° 23/053, art. 50, 7°',
  },

  // --- RÉINTÉGRATIONS · dépassements de plafonds ---
  {
    code: 'DONS_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Dons, libéralités et subventions au-delà du plafond',
    aide: "Seuls sont déductibles les versements au Fonds Social de la RDC, à des organismes de recherche, à des œuvres ou organismes d'utilité publique à caractère philanthropique et social, et à des associations sportives situées en RDC. Double condition de forme : un relevé joint à la déclaration, et un résultat net imposable POSITIF avant déduction. L'excédent se réintègre.",
    source: 'Loi n° 23/053, art. 44',
    plafond: { part: 0.005, assiette: 'CHIFFRE_AFFAIRES', enonce: "0,5 % du chiffre d'affaires de l'exercice, plafond global pour l'ensemble des versements de l'article 44" },
  },
  {
    code: 'CADEAUX_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Cadeaux et objets publicitaires au-delà du plafond',
    aide: "Le plafond est de deux pour mille, non de deux pour cent · l'erreur de virgule est fréquente et se paie au contrôle.",
    source: 'Loi n° 23/053, art. 49, 1°',
    plafond: { part: 0.002, assiette: 'CHIFFRE_AFFAIRES', enonce: "2 pour mille du chiffre d'affaires hors taxes, plafond global pour l'ensemble des cadeaux et objets publicitaires" },
  },
  {
    code: 'REPRESENTATION_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Frais de représentation, fraction non déductible',
    aide: "Soixante pour cent du montant sont déductibles, le solde se réintègre · le plafond porte sur la charge elle-même, pas sur le chiffre d'affaires.",
    source: 'Loi n° 23/053, art. 49, 2°',
    plafond: { part: 0.6, assiette: 'CHARGE', enonce: '60 % du montant engagé' },
  },
  {
    code: 'COMMUNICATION_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Frais de communication, fraction non déductible',
    aide: "Cinquante pour cent des frais de communication sont déductibles. Les frais d'internet le sont à 100 % si l'usage est exclusivement professionnel : dans ce cas, ne rien porter ici.",
    source: 'Loi n° 23/053, art. 49, 7°',
    plafond: { part: 0.5, assiette: 'CHARGE', enonce: '50 % du montant engagé' },
  },
  {
    code: 'REDEVANCES_LIEES_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Redevances versées à des entités liées au-delà du plafond',
    aide: "Concessions de licences, brevets, marques et procédés versées à une entité liée. Le débiteur doit en outre prouver que les dépenses correspondent à des opérations réelles et ne sont pas exagérées.",
    source: 'Loi n° 23/053, art. 43',
    plafond: { part: 0.035, assiette: 'CHIFFRE_AFFAIRES', enonce: "3,5 % du chiffre d'affaires hors taxes, plafond global pour l'ensemble des redevances versées à des entités liées" },
  },
  {
    code: 'INTERETS_ASSOCIES_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Intérêts servis aux associés au-delà du taux admis',
    aide: "Le taux admis est celui des avances de la Banque Centrale du Congo majoré de deux points. Trois conditions s'y ajoutent : une convention de prêt écrite et enregistrée, la libération intégrale du capital souscrit, et, pour les associés dirigeants, des sommes laissées à disposition n'excédant pas le capital social libéré. Le taux de référence change · le relever à la date des intérêts.",
    source: 'Loi n° 23/053, art. 39 à 41',
  },
  {
    code: 'INTERETS_ENTITE_LIEE_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Intérêts payés à une entité liée au-delà du plafond',
    aide: "Trois conditions cumulatives : remboursement du principal dans les cinq ans, taux n'excédant pas la moyenne annuelle des taux effectifs pratiqués par les établissements de crédit du pays de l'entreprise prêteuse, et plafond de 15 % du résultat retraité de l'entité emprunteuse.",
    source: 'Loi n° 23/053, art. 42',
  },
  {
    code: 'AMORTISSEMENTS_EXCEDENT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Amortissements excédant les taux fiscaux',
    aide: "Les taux linéaires admis sont fixés par l'arrêté ministériel n° 013/CAB/MIN/FINANCES/2025 du 19 février 2025 · cent trente et une lignes, neuf familles. La différence entre la dotation comptable et l'annuité fiscale se réintègre. Le dégressif n'est ouvert, sur option, qu'aux biens neufs limitativement énumérés, à l'exclusion notamment des véhicules de tourisme et des immobilisations incorporelles.",
    source: 'Loi n° 23/053, art. 28 à 38 ; arrêté ministériel n° 013/CAB/MIN/FINANCES/2025',
  },
  {
    code: 'REMUNERATIONS_NON_DECLAREES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Rémunérations et honoraires non déclarés ou non justifiés',
    aide: "Salaires, commissions, honoraires et rémunérations de services ne sont déductibles que s'ils ont fait l'objet des déclarations aux impôts correspondants. Commissions, courtages, ristournes, vacations et gratifications exigent en outre l'indication exacte du nom et du domicile du bénéficiaire, de la date du paiement et de la somme allouée à chacun ; à défaut, elles s'ajoutent au bénéfice de celui qui les a payées.",
    source: 'Loi n° 23/053, art. 21 à 24 et art. 26',
  },
  {
    code: 'SOMMES_NON_RESIDENTS',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Sommes versées à des non-résidents non justifiées',
    aide: "Vers une personne liée : triple condition de réalité du service, d'impossibilité pour une personne établie en RDC de le rendre, et de prix de pleine concurrence. Les sommes versées à une personne établie dans un État ou territoire NON COOPÉRATIF ne sont jamais déductibles, qu'il y ait ou non lien de dépendance.",
    source: 'Loi n° 23/053, art. 46 à 48',
  },
  {
    code: 'PRIX_DE_TRANSFERT',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Bénéfices indirectement transférés à des entreprises liées hors RDC',
    aide: "Majoration ou diminution des prix d'achat ou de vente, redevances excessives, renonciation à recette, abandon de créance, remise de dette, avantage hors proportion avec le service rendu. La condition de dépendance n'est PAS exigée lorsque le transfert s'opère avec une entreprise établie dans un État à régime fiscal privilégié ou non coopératif.",
    source: 'Loi n° 23/053, art. 53',
  },
  {
    code: 'ECARTS_CONVERSION_CREANCES_DETTES',
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Gains de change latents sur créances et dettes en devises',
    aide: "Distinction commandée par l'article 17 : les écarts sur les AVOIRS en devise entrent dans le résultat imposable de l'exercice ; ceux sur les CRÉANCES ET DETTES libellées en monnaies étrangères n'y entrent qu'au dénouement de l'opération. Les gains latents comptabilisés se retranchent donc, les pertes latentes se réintègrent · porter ici ce qui doit être neutralisé dans un sens, et sur la ligne symétrique dans l'autre.",
    source: 'Loi n° 23/053, art. 17',
  },

  // --- DÉDUCTIONS ---
  {
    code: 'PERTES_CHANGE_LATENTES',
    sens: SensRetraitementFiscal.DEDUCTION,
    libelle: 'Pertes de change latentes déjà réintégrées, dénouées sur l’exercice',
    aide: "Seules les pertes de change EFFECTIVEMENT RÉALISÉES sont déductibles, et les gains effectivement réalisés imposables. Cette ligne sert à déduire, à l'exercice du dénouement, ce qui avait été neutralisé les exercices précédents.",
    source: 'Loi n° 23/053, art. 14 et art. 49, 4°',
  },
  {
    code: 'PLUS_VALUES_NON_REALISEES',
    sens: SensRetraitementFiscal.DEDUCTION,
    libelle: 'Plus-values simplement exprimées en comptabilité',
    aide: "Les accroissements résultant de plus-values non traitées comme des bénéfices ne sont pas imposables, sous condition d'une comptabilité régulière, du respect des obligations déclaratives et de l'absence de taxation d'office. L'exemption n'est maintenue qu'à cinq conditions cumulatives, dont l'absence d'amortissement, de distribution ou de prélèvement sur ces plus-values, et leur inscription à un compte spécial du passif, distinct des réserves et du capital.",
    source: 'Loi n° 23/053, art. 19',
  },
  {
    code: 'PLUS_VALUES_FUSION',
    sens: SensRetraitementFiscal.DEDUCTION,
    libelle: 'Plus-values de fusion ou d’apport partiel d’actif exonérées',
    aide: "Exonération réservée aux plus-values, autres que sur marchandises, résultant de l'attribution d'actions ou de parts à la suite d'une fusion, d'une scission ou d'un apport partiel d'actif au profit d'une SA, SAS ou SARL ayant son siège en RDC. Deux obligations à constater dans l'acte : reprise du prix de revient de l'apporteuse pour les amortissements et plus-values ultérieures, et inscription immédiate au passif des provisions pour renouvellement figurant chez elle.",
    source: 'Loi n° 23/053, art. 54',
  },
  {
    code: 'SUBVENTIONS_EQUIPEMENT_ETALEES',
    sens: SensRetraitementFiscal.DEDUCTION,
    libelle: 'Subventions d’équipement, fraction non encore imposable',
    aide: "Une subvention d'équipement n'est pas comprise dans les résultats de l'année d'encaissement : elle se rapporte au rythme des amortissements pratiqués sur le prix de revient de l'immobilisation. Pour une immobilisation non amortissable, par fractions égales sur la durée d'inaliénabilité prévue à l'acte, ou par dixièmes à défaut de clause. Les subventions d'exploitation et d'équilibre, elles, sont imposables dès l'encaissement.",
    source: 'Loi n° 23/053, art. 18',
  },
  {
    code: 'REVENUS_DEJA_IMPOSES',
    sens: SensRetraitementFiscal.DEDUCTION,
    libelle: 'Éléments déjà imposés au cours de l’exercice',
    aide: "Déduction destinée à éviter la double imposition d'un même revenu dans le chef d'un même redevable.",
    source: 'Loi n° 23/053, art. 55',
  },
  {
    code: CODE_LIBRE,
    sens: SensRetraitementFiscal.REINTEGRATION,
    libelle: 'Autre retraitement',
    aide: "Ligne libre, pour un redressement que ce catalogue ne nomme pas. Écrivez le fondement dans le commentaire : c'est lui qui sera opposé au vérificateur, et une ligne sans justification est une ligne indéfendable.",
    source: 'À renseigner par le comptable',
  },
];

/** Accès par code · un retraitement enregistré garde son code d'origine. */
export const RETRAITEMENT_PAR_CODE = new Map(CATALOGUE_RETRAITEMENTS.map((r) => [r.code, r]));
