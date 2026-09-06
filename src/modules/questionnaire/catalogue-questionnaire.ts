import { CycleQuestionnaire, Referentiel } from '@prisma/client';

/**
 * LE CATALOGUE · vingt-quatre items du CPCC, repris mot pour mot, et le reste
 * assumé comme une extension du cabinet.
 *
 * CE QUE LE CPCC PORTE VRAIMENT. Deux checklists, § VI « vérification de
 * l'inventaire physique » (immobilisations, stocks, caisses) et § VII
 * « vérification de l'inventaire documentaire » (banques, dettes, provisions,
 * créances). Sept rubriques, vingt-quatre items interrogatifs, quinze
 * impératifs. Rien d'autre : le séminaire n'a de questions ni sur les ventes,
 * ni sur les achats hors circularisation, ni sur la paie, ni sur les capitaux
 * propres, ni sur l'État, ni sur les régularisations. Une découpe « par
 * cycle » qui lui serait attribuée serait une invention.
 *
 * D'OÙ LA RÈGLE DE CE FICHIER, et c'est la seule qui compte : CHAQUE ITEM
 * PORTE SON ORIGINE. « CPCC » veut dire que le libellé est celui du
 * séminaire, à la virgule près, et il ne se réécrit pas · un test relit ce
 * fichier et fige les vingt-quatre libellés. « VMG » veut dire que la question
 * est de l'éditeur, construite sur la logique des items du CPCC, et rattachée
 * à un fondement nommé. La confondre avec l'autre produirait exactement le
 * défaut du § 10 bis de CLAUDE.md : un signalement plausible, sourcé en
 * apparence, et faux.
 *
 * TROIS PROPRIÉTÉS QUE LA SOURCE PORTE ELLE-MÊME, et qu'un moteur qui les
 * ignorerait trahirait sans rien casser :
 *
 *  1. LE CHAÎNAGE. « Si oui, une attestation a-t-elle été établie ? » ne se
 *     pose que si le comptage a eu lieu. « Si non, comment a-t-on procédé pour
 *     la sélection des fournisseurs à circulariser ? » ne se pose que si la
 *     circularisation N'A PAS couvert tout le monde · c'est la seule chaîne
 *     « Non → suite » explicitement écrite de tout le corpus, et l'item des
 *     créances la retourne (« Si oui, comment a-t-on sélectionné… »).
 *  2. LA POLARITÉ. Partout, « Non » ouvre une exception. UNE FOIS, non : « Y
 *     a-t-il un chevauchement avec l'exercice en cours sur le solde
 *     d'ouverture ? », où « Oui » est l'anomalie. Un moteur qui compterait les
 *     « Non » se tromperait exactement là, sur le seul item du CPCC qui porte
 *     sur la correspondance des bilans.
 *  3. LES ITEMS COMPOSITES. « A-t-on tenu compte de la caisse siège, de la
 *     caisse agence, de la caisse de secours ? » est UNE question et TROIS
 *     objets. Le libellé reste entier · les objets sont listés à côté, pour
 *     qu'un « Oui » global ne masque pas la caisse qu'on a oubliée.
 *
 * Le caractère « — » de l'item CPCC-PRO-5 est celui du texte source. Il est
 * conservé pour la même raison que les 97 de `regles-comptes-sycebnl.ts` : le
 * remplacer falsifierait une citation, et c'est sa fidélité qui la rend
 * opposable. Ne pas le « corriger ».
 */

export type OrigineItem = 'CPCC' | 'VMG';

/**
 * Quatre formes, et elles ne se répondent pas de la même façon.
 *
 * OUI_NON · l'item fermé, celui qui peut devenir une exception.
 * DONNEE · « À quels moments les biens ont-ils été valorisés ? », « Combien de
 *   réponses a-t-on reçues ? » · une date, un nombre. Un « Oui » n'y répond
 *   pas, et le module le refuse.
 * TEXTE_LIBRE · « Quelles dispositions assurent le bon fonctionnement du
 *   cut-off ? » · le CPCC attend une description, pas une case.
 * TRAVAIL · l'impératif (« Vérifier les titres de propriété de tous les biens
 *   immobilisés. »). Il se coche fait ou non fait avec son renvoi au papier de
 *   travail, et il ne compte pas dans le taux de réponse · les mélanger
 *   gonflerait un chiffre qui ne voudrait plus rien dire.
 */
export type FormeItem = 'OUI_NON' | 'DONNEE' | 'TEXTE_LIBRE' | 'TRAVAIL';

export interface ItemQuestionnaire {
  code: string;
  cycle: CycleQuestionnaire;
  /** VERBATIM quand `origine` vaut CPCC. */
  libelle: string;
  origine: OrigineItem;
  forme: FormeItem;
  /**
   * La réponse qui ouvre une exception. « NON » par défaut · « OUI » sur le
   * seul item du CPCC dont la polarité est inversée.
   */
  polariteException?: 'OUI' | 'NON';
  /** L'item n'est posé que si son parent a reçu cette réponse-là. */
  ouvertPar?: { code: string; reponse: 'OUI' | 'NON' };
  /** Les objets qu'un libellé composite énumère · à couvrir un par un. */
  objets?: string[];
  /** Pour un item CPCC · où il se lit dans le compagnon du séminaire. */
  source?: string;
  /** Pour un item VMG · le texte ou l'item du CPCC dont il tire sa logique. */
  fondement?: string;
  /** Rare · un item qui n'a de sens que dans un référentiel. */
  referentiel?: Referentiel;
}

/* ------------------------------------------------------------------ *
 * § VI · CHECKLIST DE VÉRIFICATION DE L'INVENTAIRE PHYSIQUE
 * ------------------------------------------------------------------ */

const IMMOBILISATIONS: ItemQuestionnaire[] = [
  {
    code: 'CPCC-IMM-1',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle: 'À quels moments les biens ont-ils été valorisés ?',
    origine: 'CPCC',
    forme: 'DONNEE',
    source: '§ VI, Immobilisations',
  },
  {
    code: 'CPCC-IMM-2',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle:
      'A-t-on reçu les inventaires des biens immobilisés des différentes directions provinciales ou représentations ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Immobilisations',
  },
  {
    code: 'CPCC-IMM-3',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle:
      'Sélectionner quelques entrées au niveau du fichier des biens immobilisés, vérifier si toutes les conditions ont été remplies.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VI, Immobilisations',
  },
  {
    code: 'CPCC-IMM-4',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle:
      "Pour les biens pillés ou disparus : vérifier les PV de constat de disparition, entérinés par le Conseil d'Administration.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VI, Immobilisations',
  },
  {
    code: 'CPCC-IMM-5',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle:
      'En cas de différences constatées, consulter les responsables des Finances et des Services généraux (intendant ayant la gestion des biens immobilisés) pour précisions.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VI, Immobilisations',
  },
  {
    code: 'CPCC-IMM-6',
    cycle: CycleQuestionnaire.IMMOBILISATIONS,
    libelle: 'Vérifier les titres de propriété de tous les biens immobilisés.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VI, Immobilisations',
  },
];

const STOCKS: ItemQuestionnaire[] = [
  {
    code: 'CPCC-STO-1',
    cycle: CycleQuestionnaire.STOCKS,
    libelle: 'Tous les lieux de stockage sont-ils pris en compte dans la procédure ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 1',
  },
  {
    code: 'CPCC-STO-2',
    cycle: CycleQuestionnaire.STOCKS,
    libelle: "Les zones concernées par l'inventaire sont-elles correctement identifiées et délimitées ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 2',
  },
  {
    code: 'CPCC-STO-3',
    cycle: CycleQuestionnaire.STOCKS,
    libelle:
      "Les modalités de coopération avec les auditeurs internes/externes sont-elles définies dans les instructions d'inventaire ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 3',
  },
  {
    code: 'CPCC-STO-4',
    cycle: CycleQuestionnaire.STOCKS,
    libelle: 'La préparation des articles à inventorier (rangement...) est-elle évoquée ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 4',
  },
  {
    code: 'CPCC-STO-5',
    cycle: CycleQuestionnaire.STOCKS,
    libelle:
      "Existe-t-il une description précise des articles plus difficiles à identifier (unité de mesure, etc.) ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 5',
  },
  {
    code: 'CPCC-STO-6',
    cycle: CycleQuestionnaire.STOCKS,
    libelle:
      "Quelles dispositions assurent le bon fonctionnement du cut-off (clôture des aires de réception et d'expédition, transferts internes...) ?",
    origine: 'CPCC',
    forme: 'TEXTE_LIBRE',
    source: '§ VI, Stocks, 6',
  },
  {
    code: 'CPCC-STO-7',
    cycle: CycleQuestionnaire.STOCKS,
    libelle: "Le traitement des marchandises en transit est-il considéré dans les instructions d'inventaire ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 7',
  },
  {
    code: 'CPCC-STO-8',
    cycle: CycleQuestionnaire.STOCKS,
    libelle: 'Les instructions prévoient-elles les modalités de mise à jour des fiches de stocks ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Stocks, 8',
  },
];

const CAISSES: ItemQuestionnaire[] = [
  {
    code: 'CPCC-CAI-1',
    cycle: CycleQuestionnaire.CAISSES,
    libelle: 'Le comptage des espèces a-t-il eu lieu au 31 décembre ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Caisses',
  },
  {
    code: 'CPCC-CAI-2',
    cycle: CycleQuestionnaire.CAISSES,
    libelle: 'Si oui, une attestation a-t-elle été établie ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    // La chaîne est dans le libellé même · « Si oui ».
    ouvertPar: { code: 'CPCC-CAI-1', reponse: 'OUI' },
    source: '§ VI, Caisses',
  },
  {
    code: 'CPCC-CAI-3',
    cycle: CycleQuestionnaire.CAISSES,
    libelle: 'A-t-on tenu compte de la caisse siège, de la caisse agence, de la caisse de secours ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    objets: ['Caisse siège', 'Caisse agence', 'Caisse de secours'],
    source: '§ VI, Caisses',
  },
  {
    code: 'CPCC-CAI-4',
    cycle: CycleQuestionnaire.CAISSES,
    libelle: "Y a-t-il un chevauchement avec l'exercice en cours sur le solde d'ouverture ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    // LE SEUL ITEM DU CORPUS où « Oui » est l'anomalie.
    polariteException: 'OUI',
    source: '§ VI, Caisses',
  },
  {
    code: 'CPCC-CAI-5',
    cycle: CycleQuestionnaire.CAISSES,
    libelle: 'Les procès-verbaux de comptage ont-ils été analysés ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VI, Caisses',
  },
];

/* ------------------------------------------------------------------ *
 * § VII · CHECKLIST DE VÉRIFICATION DE L'INVENTAIRE DOCUMENTAIRE
 * ------------------------------------------------------------------ */

const BANQUES: ItemQuestionnaire[] = [
  {
    code: 'CPCC-BAN-1',
    cycle: CycleQuestionnaire.BANQUES,
    libelle: 'A-t-on circularisé toutes les banques ?',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VII, Banques',
  },
  {
    code: 'CPCC-BAN-2',
    cycle: CycleQuestionnaire.BANQUES,
    libelle: 'Si oui, analyser les réponses reçues et les conclusions.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    ouvertPar: { code: 'CPCC-BAN-1', reponse: 'OUI' },
    source: '§ VII, Banques',
  },
  {
    code: 'CPCC-BAN-3',
    cycle: CycleQuestionnaire.BANQUES,
    libelle: 'Analyser les états de réconciliation de chaque banque.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Banques',
  },
];

const DETTES_FOURNISSEURS: ItemQuestionnaire[] = [
  {
    code: 'CPCC-DET-1',
    cycle: CycleQuestionnaire.DETTES_FOURNISSEURS,
    libelle: 'Obtenir la balance auxiliaire des fournisseurs, par ancienneté.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Dettes (fournisseurs)',
  },
  {
    code: 'CPCC-DET-2',
    cycle: CycleQuestionnaire.DETTES_FOURNISSEURS,
    libelle: 'Vérifier si la circularisation a eu lieu pour tous les fournisseurs.',
    origine: 'CPCC',
    forme: 'OUI_NON',
    source: '§ VII, Dettes (fournisseurs)',
  },
  {
    code: 'CPCC-DET-3',
    cycle: CycleQuestionnaire.DETTES_FOURNISSEURS,
    libelle: "Si non, comment a-t-on procédé pour la sélection des fournisseurs à circulariser ?",
    origine: 'CPCC',
    forme: 'TEXTE_LIBRE',
    // LA SEULE CHAÎNE « Non → suite » explicitement écrite du corpus.
    ouvertPar: { code: 'CPCC-DET-2', reponse: 'NON' },
    source: '§ VII, Dettes (fournisseurs)',
  },
  {
    code: 'CPCC-DET-4',
    cycle: CycleQuestionnaire.DETTES_FOURNISSEURS,
    libelle:
      "Comment les conclusions ont-elles été traitées lors de l'arrêté des comptes au 31 décembre, en cas de différences constatées ?",
    origine: 'CPCC',
    forme: 'TEXTE_LIBRE',
    source: '§ VII, Dettes (fournisseurs)',
  },
  {
    code: 'CPCC-DET-5',
    cycle: CycleQuestionnaire.DETTES_FOURNISSEURS,
    libelle: 'Analyser les impayés et les clauses des deux parties.',
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Dettes (fournisseurs)',
  },
];

/**
 * PROVISIONS · aucune question, six impératifs. C'est la rubrique où le CPCC
 * ne demande rien par « oui ou non » et tout par « obtenir », « pointer »,
 * « vérifier », « s'assurer ». Le dernier ouvre à lui seul le registre des
 * faiblesses.
 */
const PROVISIONS: ItemQuestionnaire[] = [
  {
    code: 'CPCC-PRO-1',
    cycle: CycleQuestionnaire.PROVISIONS,
    libelle:
      "Obtenir le tableau des mouvements des provisions par rapport à l'exercice précédent (dotations, utilisations, reprises).",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Provisions',
  },
  {
    code: 'CPCC-PRO-2',
    cycle: CycleQuestionnaire.PROVISIONS,
    libelle: "Pointer les montants à l'ouverture avec les comptes de l'exercice précédent.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Provisions',
  },
  {
    code: 'CPCC-PRO-3',
    cycle: CycleQuestionnaire.PROVISIONS,
    libelle: "Vérifier l'évaluation des risques provisionnés à la fin de l'exercice.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Provisions',
  },
  {
    code: 'CPCC-PRO-4',
    cycle: CycleQuestionnaire.PROVISIONS,
    libelle: "Obtenir tous les justificatifs des mouvements enregistrés dans l'exercice (autorisation).",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Provisions',
  },
  {
    code: 'CPCC-PRO-5',
    cycle: CycleQuestionnaire.PROVISIONS,
    // Le tiret est celui du texte source · citation verbatim, ne pas corriger.
    libelle:
      "S'assurer que tous les risques en cours ont fait l'objet d'une provision : garanties, pertes sur marchés, litiges — revue des procès-verbaux de conseil.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    objets: ['Garanties', 'Pertes sur marchés', 'Litiges'],
    source: '§ VII, Provisions',
  },
  {
    code: 'CPCC-PRO-6',
    cycle: CycleQuestionnaire.PROVISIONS,
    libelle: "Faire le suivi des faiblesses relevées lors de l'audit précédent.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Provisions',
  },
];

const CREANCES: ItemQuestionnaire[] = [
  {
    code: 'CPCC-CRE-1',
    cycle: CycleQuestionnaire.CREANCES,
    libelle: "Analyser le contrôle interne relatif à l'inventaire.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-2',
    cycle: CycleQuestionnaire.CREANCES,
    libelle:
      "Existe-t-il une balance auxiliaire des dettes sociales/fiscales/autres ? une balance auxiliaire du compte personnel ? une balance auxiliaire des débiteurs divers ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    objets: [
      'Balance auxiliaire des dettes sociales, fiscales et autres',
      'Balance auxiliaire du compte personnel',
      'Balance auxiliaire des débiteurs divers',
    ],
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-3',
    cycle: CycleQuestionnaire.CREANCES,
    libelle: "Si oui, sont-elles tenues suivant l'âge des créances ?",
    origine: 'CPCC',
    forme: 'OUI_NON',
    ouvertPar: { code: 'CPCC-CRE-2', reponse: 'OUI' },
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-4',
    cycle: CycleQuestionnaire.CREANCES,
    libelle:
      "A-t-on procédé à la circularisation de toutes les créances ? Si oui, comment a-t-on sélectionné les créances à circulariser ?",
    origine: 'CPCC',
    forme: 'TEXTE_LIBRE',
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-5',
    cycle: CycleQuestionnaire.CREANCES,
    libelle:
      "Combien de réponses a-t-on reçues ? Si le pourcentage est insignifiant, a-t-on relancé pour insister sur l'importance attendue des réponses ?",
    origine: 'CPCC',
    forme: 'DONNEE',
    // « Insignifiant » n'est chiffré nulle part par la source · le module ne
    // pose donc aucun seuil, et se garde d'en inventer un.
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-6',
    cycle: CycleQuestionnaire.CREANCES,
    libelle: 'En cas de différences constatées, quelles ont été les décisions des responsables ?',
    origine: 'CPCC',
    forme: 'TEXTE_LIBRE',
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-7',
    cycle: CycleQuestionnaire.CREANCES,
    libelle:
      "Vérifier si l'on a dû catégoriser les créances (douteuses, irrécupérables, litigieuses, recouvrables) après étude du dossier de chaque créance.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    objets: ['Douteuses', 'Irrécupérables', 'Litigieuses', 'Recouvrables'],
    source: '§ VII, Créances',
  },
  {
    code: 'CPCC-CRE-8',
    cycle: CycleQuestionnaire.CREANCES,
    libelle: "Étudier le bien-fondé de l'octroi de crédit aux différents débiteurs.",
    origine: 'CPCC',
    forme: 'TRAVAIL',
    source: '§ VII, Créances',
  },
];

/* ------------------------------------------------------------------ *
 * LES CYCLES QUE LE CPCC NE COUVRE PAS
 *
 * Aucune question ci-dessous n'est du séminaire, et aucune ne doit lui être
 * attribuée. Elles sont construites sur la logique de ses vingt-quatre items ·
 * la même forme, le même chaînage, la même polarité, y compris l'inversion
 * qu'il pose une fois · et chacune est rattachée à un fondement nommé, texte
 * ou item du CPCC dont elle est la transposition.
 * ------------------------------------------------------------------ */

const VENTES_CLIENTS: ItemQuestionnaire[] = [
  {
    code: 'VMG-CLI-1',
    cycle: CycleQuestionnaire.VENTES_CLIENTS,
    libelle: 'Obtenir la balance auxiliaire des clients et adhérents, par ancienneté.',
    origine: 'VMG',
    forme: 'TRAVAIL',
    fondement: "Transposition de CPCC-DET-1, qui demande la même balance du côté des fournisseurs.",
  },
  {
    code: 'VMG-CLI-2',
    cycle: CycleQuestionnaire.VENTES_CLIENTS,
    libelle:
      "La séparation des exercices a-t-elle été vérifiée sur les dernières livraisons et les dernières factures de vente de l'exercice ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement:
      "AUDCIF, postulat de spécialisation des exercices. Même objet que le cut-off que CPCC-STO-6 demande côté magasin, porté ici sur les produits.",
  },
  {
    code: 'VMG-CLI-3',
    cycle: CycleQuestionnaire.VENTES_CLIENTS,
    libelle: "Si non, comment s'est-on assuré que les produits de l'exercice sont complets ?",
    origine: 'VMG',
    forme: 'TEXTE_LIBRE',
    ouvertPar: { code: 'VMG-CLI-2', reponse: 'NON' },
    fondement: "Même chaîne « Non → suite » que CPCC-DET-3, la seule que le séminaire écrive.",
  },
  {
    code: 'VMG-CLI-4',
    cycle: CycleQuestionnaire.VENTES_CLIENTS,
    libelle: "Des avoirs ont-ils été émis après la clôture sur des ventes de l'exercice ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    // Polarité inversée, comme CPCC-CAI-4 · « Oui » est le fait à examiner.
    polariteException: 'OUI',
    fondement:
      "AUDCIF Titre VIII ch. 31, événements postérieurs à la clôture. Polarité inversée sur le modèle de CPCC-CAI-4.",
  },
  {
    code: 'VMG-CLI-5',
    cycle: CycleQuestionnaire.VENTES_CLIENTS,
    libelle: "Les produits constatés d'avance ont-ils été identifiés et rattachés à l'exercice suivant ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: "AUDCIF, spécialisation des exercices · comptes 477.",
  },
];

const ACHATS: ItemQuestionnaire[] = [
  {
    code: 'VMG-ACH-1',
    cycle: CycleQuestionnaire.ACHATS,
    libelle:
      "La séparation des exercices a-t-elle été vérifiée sur les derniers bons de réception et les dernières factures d'achat ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: "AUDCIF, spécialisation des exercices. Pendant de VMG-CLI-2 du côté des charges.",
  },
  {
    code: 'VMG-ACH-2',
    cycle: CycleQuestionnaire.ACHATS,
    libelle: "Si non, comment s'est-on assuré que les charges de l'exercice sont complètes ?",
    origine: 'VMG',
    forme: 'TEXTE_LIBRE',
    ouvertPar: { code: 'VMG-ACH-1', reponse: 'NON' },
    fondement: 'Même chaîne « Non → suite » que CPCC-DET-3.',
  },
  {
    code: 'VMG-ACH-3',
    cycle: CycleQuestionnaire.ACHATS,
    libelle: 'Les factures non parvenues ont-elles été rattachées par une charge à payer ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: "AUDCIF Titre VIII, rattachement des charges · comptes 408 et 4081.",
  },
  {
    code: 'VMG-ACH-4',
    cycle: CycleQuestionnaire.ACHATS,
    libelle:
      'Le rapprochement entre la commande, le bon de réception et la facture est-il pratiqué sur les achats significatifs ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    objets: ['Commande', 'Bon de réception', 'Facture'],
    fondement:
      "Transposition de CPCC-CRE-1, « analyser le contrôle interne relatif à l'inventaire », au cycle des achats. Item composite sur le modèle de CPCC-CAI-3.",
  },
];

const PAIE: ItemQuestionnaire[] = [
  {
    code: 'VMG-PAI-1',
    cycle: CycleQuestionnaire.PAIE_ET_CHARGES_SOCIALES,
    libelle: "Existe-t-il un état récapitulatif de la paie de l'exercice, rapproché des comptes de charges de personnel ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: 'AUDCIF art. 17, justification des soldes par un document probant.',
  },
  {
    code: 'VMG-PAI-2',
    cycle: CycleQuestionnaire.PAIE_ET_CHARGES_SOCIALES,
    libelle: 'Si oui, les écarts entre cet état et la comptabilité ont-ils été expliqués ?',
    origine: 'VMG',
    forme: 'TEXTE_LIBRE',
    ouvertPar: { code: 'VMG-PAI-1', reponse: 'OUI' },
    fondement: "Chaîne « Si oui → suite », sur le modèle de CPCC-CAI-2 et CPCC-CRE-3.",
  },
  {
    code: 'VMG-PAI-3',
    cycle: CycleQuestionnaire.PAIE_ET_CHARGES_SOCIALES,
    libelle:
      "A-t-on tenu compte des congés dus, des gratifications et des indemnités de fin de carrière à la clôture ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    objets: ['Congés dus', 'Gratifications', 'Indemnités de fin de carrière'],
    fondement:
      "AUDCIF Titre VIII ch. 21 pour les avantages postérieurs à l'emploi. Item composite sur le modèle de CPCC-CAI-3.",
  },
  {
    code: 'VMG-PAI-4',
    cycle: CycleQuestionnaire.PAIE_ET_CHARGES_SOCIALES,
    libelle: 'Des rémunérations ont-elles été payées en espèces sans pièce signée par le bénéficiaire ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    polariteException: 'OUI',
    fondement: "AUDCIF art. 17, toute écriture s'appuie sur une pièce justificative datée. Polarité inversée.",
  },
];

const ETAT: ItemQuestionnaire[] = [
  {
    code: 'VMG-ETA-1',
    cycle: CycleQuestionnaire.ETAT_ET_COLLECTIVITES,
    libelle: 'Les soldes des comptes « État et collectivités publiques » ont-ils été rapprochés des déclarations déposées ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement:
      "Transposition de CPCC-BAN-3, « analyser les états de réconciliation de chaque banque », au tiers État.",
  },
  {
    code: 'VMG-ETA-2',
    cycle: CycleQuestionnaire.ETAT_ET_COLLECTIVITES,
    libelle: 'Si non, comment le solde de chaque sous-compte a-t-il été justifié ?',
    origine: 'VMG',
    forme: 'TEXTE_LIBRE',
    ouvertPar: { code: 'VMG-ETA-1', reponse: 'NON' },
    fondement: 'Même chaîne « Non → suite » que CPCC-DET-3.',
  },
  {
    code: 'VMG-ETA-3',
    cycle: CycleQuestionnaire.ETAT_ET_COLLECTIVITES,
    libelle: "Des pénalités ou amendes figurent-elles parmi les charges de l'exercice ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    polariteException: 'OUI',
    fondement:
      "Fait à documenter plutôt qu'anomalie comptable · le traitement fiscal des amendes se décide au dossier fiscal, pas ici. Polarité inversée.",
  },
];

const CAPITAUX_PROPRES: ItemQuestionnaire[] = [
  {
    code: 'VMG-CAP-1',
    cycle: CycleQuestionnaire.CAPITAUX_PROPRES,
    libelle:
      "L'affectation du résultat de l'exercice précédent a-t-elle été décidée par l'organe compétent, et le procès-verbal est-il au dossier ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    objets: ["Décision de l'organe compétent", 'Procès-verbal au dossier'],
    fondement:
      "Même exigence de procès-verbal que CPCC-IMM-4 pour les biens disparus, portée sur l'affectation du résultat.",
  },
  {
    code: 'VMG-CAP-2',
    cycle: CycleQuestionnaire.CAPITAUX_PROPRES,
    libelle:
      "Le report à nouveau a-t-il varié d'un montant autre que celui de l'affectation décidée ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    polariteException: 'OUI',
    fondement:
      "AUDCIF art. 34, correspondance du bilan de clôture et du bilan d'ouverture. Même objet que CPCC-CAI-4, qui interroge le solde d'ouverture de la caisse. Polarité inversée.",
  },
  {
    code: 'VMG-CAP-3',
    cycle: CycleQuestionnaire.CAPITAUX_PROPRES,
    libelle:
      "Les subventions d'investissement ont-elles fait l'objet d'une reprise au rythme de l'amortissement du bien financé ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: "AUDCIF Titre VIII, subventions d'investissement · comptes 14 et 79.",
  },
];

const REGULARISATIONS: ItemQuestionnaire[] = [
  {
    code: 'VMG-REG-1',
    cycle: CycleQuestionnaire.REGULARISATIONS,
    libelle: "Les charges constatées d'avance et les produits constatés d'avance ont-ils été recensés à la clôture ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    objets: ["Charges constatées d'avance", "Produits constatés d'avance"],
    fondement: 'AUDCIF, spécialisation des exercices · comptes 476 et 477.',
  },
  {
    code: 'VMG-REG-2',
    cycle: CycleQuestionnaire.REGULARISATIONS,
    libelle: "Les écritures d'abonnement ont-elles été soldées à la clôture ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    fondement: "AUDCIF, spécialisation des exercices · un abonnement non soldé laisse une charge répartie à cheval.",
  },
  {
    code: 'VMG-REG-3',
    cycle: CycleQuestionnaire.REGULARISATIONS,
    libelle: "Des écritures ont-elles été passées après la date d'arrêté des comptes ?",
    origine: 'VMG',
    forme: 'OUI_NON',
    polariteException: 'OUI',
    fondement:
      "AUDCIF art. 23 et Titre VIII ch. 31 · une écriture postérieure à l'arrêté est un fait à documenter, pas une faute en soi. Polarité inversée.",
  },
];

const ENGAGEMENTS: ItemQuestionnaire[] = [
  {
    code: 'VMG-ENG-1',
    cycle: CycleQuestionnaire.ENGAGEMENTS_HORS_BILAN,
    libelle: 'Les cautions, avals et garanties donnés ont-ils été recensés ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    objets: ['Cautions', 'Avals', 'Garanties données'],
    fondement:
      "Prolongement de CPCC-PRO-5, qui demande de s'assurer que « tous les risques en cours ont fait l'objet d'une provision : garanties… ». Un engagement qui n'est pas provisionné doit au moins être recensé.",
  },
  {
    code: 'VMG-ENG-2',
    cycle: CycleQuestionnaire.ENGAGEMENTS_HORS_BILAN,
    libelle: 'Si oui, sont-ils mentionnés en Notes annexes ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    ouvertPar: { code: 'VMG-ENG-1', reponse: 'OUI' },
    fondement: "Chaîne « Si oui → suite » sur le modèle de CPCC-CAI-2.",
  },
  {
    code: 'VMG-ENG-3',
    cycle: CycleQuestionnaire.ENGAGEMENTS_HORS_BILAN,
    libelle: 'Les contributions volontaires en nature ont-elles été suivies en classe 9 ?',
    origine: 'VMG',
    forme: 'OUI_NON',
    // SYCEBNL seulement · les comptes 900 à 914 n'existent que là. Au
    // SYSCOHADA la classe 9 est celle de la comptabilité analytique, et poser
    // cette question à une société commerciale serait un contresens.
    referentiel: Referentiel.SYCEBNL,
    fondement:
      "SYCEBNL, Partie 2 ch. 3 section 9 · contributions volontaires en nature, comptes spéciaux 900 à 914, hors bilan et hors résultat.",
  },
];

/** Le catalogue entier, dans l'ordre des rubriques du CPCC puis des ajouts. */
export const ITEMS_QUESTIONNAIRE: readonly ItemQuestionnaire[] = [
  ...IMMOBILISATIONS,
  ...STOCKS,
  ...CAISSES,
  ...BANQUES,
  ...DETTES_FOURNISSEURS,
  ...PROVISIONS,
  ...CREANCES,
  ...VENTES_CLIENTS,
  ...ACHATS,
  ...PAIE,
  ...ETAT,
  ...CAPITAUX_PROPRES,
  ...REGULARISATIONS,
  ...ENGAGEMENTS,
];

export const ITEM_PAR_CODE = new Map(ITEMS_QUESTIONNAIRE.map((i) => [i.code, i]));
