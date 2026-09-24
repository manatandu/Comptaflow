import { Referentiel } from '@prisma/client';

/**
 * LA NOMENCLATURE DES STOCKS · UN NUMÉRO, DEUX SENS, DOUZE FOIS.
 *
 * C'est la plus grande occurrence du premier piège du dépôt, et elle dépasse
 * de loin les précédentes : le 192, le 4181, le 1061, le 38/37, le 397, le
 * 70510000, les deux articles 11, les trois « trois exercices » n'en
 * portaient qu'UNE à la fois. Ici, sur les quatorze numéros du cycle des
 * stocks, DOUZE changent de sens entre les deux plans ou n'existent que d'un
 * seul côté.
 *
 * ┌────────┬──────────────────────────────┬──────────────────────────────────┐
 * │ Numéro │ SYSCOHADA                    │ SYCEBNL                          │
 * ├────────┼──────────────────────────────┼──────────────────────────────────┤
 * │ 31     │ Marchandises                 │ Biens liés à l'activité          │
 * │ 32     │ Matières premières et four.  │ Marchandises, matières et four.  │
 * │ 33     │ Autres approvisionnements    │ Autres approvisionnements  (=)   │
 * │ 34     │ Produits en cours            │ Dons en nature                   │
 * │ 35     │ Services en cours            │ Produits finis et services cours │
 * │ 36     │ Produits finis               │ Produits finis, interm. et rés.  │
 * │ 37     │ Produits interm. et résiduels│ Stocks en cours de route         │
 * │ 38     │ Stocks en cours de route     │ Dons en nature H.A.O.            │
 * │ 39     │ Dépréciations                │ Dépréciations              (=)   │
 * │ 6031   │ Var. stocks marchandises     │ Var. stocks biens liés activité  │
 * │ 6032   │ Var. stocks matières prem.   │ Var. stocks marchandises         │
 * │ 6033   │ Var. stocks autres approv.   │ Var. stocks matières premières   │
 * │ 6034   │ (n'existe pas)               │ Var. stocks autres approv.       │
 * │ 6035   │ (n'existe pas)               │ Var. stocks dons en nature       │
 * │ 734    │ Var. stocks produits en cours│ (n'existe pas)                   │
 * │ 735    │ Var. en-cours de services    │ Var. en-cours prod. finis et sv. │
 * │ 737    │ Var. produits interm. et rés.│ (n'existe pas)                   │
 * │ 87     │ (n'existe pas)               │ Var. stocks dons en nature H.A.O.│
 * └────────┴──────────────────────────────┴──────────────────────────────────┘
 *
 * CE QUE COÛTERAIT UNE SEULE CONFUSION. Une association qui constate son
 * stock de biens destinés à ses bénéficiaires au 31 verrait sa variation
 * portée au 6031 · ce qui est juste chez elle. La même table appliquée à une
 * société y porterait la variation de ses MARCHANDISES, et son compte de
 * résultat afficherait au poste RA (Variation de stocks de marchandises) un
 * montant qui n'a rien à y faire. L'écriture est équilibrée, la balance
 * boucle, et seul le dépôt des états le révèle. C'est le § 10 bis dans sa
 * forme la plus pure.
 *
 * D'OÙ LA RÈGLE DE CE MODULE · AUCUN NUMÉRO DE COMPTE DE STOCK OU DE VARIATION
 * N'EST ÉCRIT AILLEURS QUE DANS CE FICHIER, et aucun n'y est écrit sans son
 * référentiel. Un test relit les deux semis et exige que chaque racine
 * reconnue y soit réellement ouverte sous l'intitulé qui la justifie · règle
 * sortie de la passe F2b, « ce qu'on affirme du plan se vérifie contre le
 * plan ».
 *
 * ────────────────────────────────────────────────────────────────────────
 * SOURCES, LUES ARTICLE PAR ARTICLE AVANT D'ÉCRIRE CE FICHIER.
 *
 * SYSCOHADA · AUDCIF, Titre VII, chapitre 3, section 3, comptes 31 à 39
 * (Partie 2, p. 354-381). SYCEBNL · Annexe « Système comptable des entités à
 * but non lucratif », Partie 2, chapitre 3, section 3 (J.O. OHADA n° spécial
 * du 22 février 2023, p. 165-187).
 * ────────────────────────────────────────────────────────────────────────
 */

/** Une racine de compte de stock et le compte de variation qui lui répond. */
export interface CorrespondanceStock {
  /** Racine du compte de stock, telle que le plan du référentiel l'ouvre. */
  racine: string;
  /** Intitulé DANS CE RÉFÉRENTIEL · jamais celui de l'autre. */
  intitule: string;
  /** Racine du compte de variation, dans le même référentiel. */
  variation: string;
  intituleVariation: string;
}

/**
 * SYSCOHADA. Chaque ligne est prise au « Fonctionnement » du compte lu dans
 * l'AUDCIF, jamais déduite du numéro.
 *
 * LE 34, LE 35 ET LE 37 DESCENDENT AU TROISIÈME CHIFFRE, ET CE N'EST PAS UN
 * RAFFINEMENT · c'est la seule écriture qui puisse être PASSÉE. Le compte 73
 * n'ouvre, au Titre VII, que « 734 (7341 Produits en cours · 7342 Travaux en
 * cours), 735 (7351 Études en cours · 7352 Prestations de services en cours),
 * 736, 737 (7371 Produits intermédiaires · 7372 Produits résiduels) ». Les
 * comptes 734, 735 et 737 sont donc des EN-TÊTES DE DIVISION, semés en type
 * TOTAL, et un compte TOTAL ne reçoit jamais d'écriture (CLAUDE.md § 7). Une
 * correspondance qui les nommerait produirait une écriture refusée à la
 * saisie, après que le comptable a tout chiffré · exactement le défaut que la
 * garde des modèles de saisie existe pour éviter.
 *
 * Le 736 et les 6031 à 6033, eux, sont directement imputables · le plan ne
 * leur ouvre aucune subdivision. La correspondance reste donc à deux chiffres
 * pour les uns, à trois pour les autres, et c'est le PLAN qui décide, pas une
 * règle de forme. Un test exige de chaque compte de variation qu'il soit semé
 * sous sa forme complétée à huit chiffres · c'est ce qui distingue un compte
 * imputable d'un en-tête, et c'est lui qui a trouvé l'erreur.
 */
const SYSCOHADA_CORRESPONDANCES: CorrespondanceStock[] = [
  {
    racine: '31',
    intitule: 'Marchandises',
    variation: '6031',
    intituleVariation: 'Variations des stocks de marchandises',
  },
  {
    racine: '32',
    intitule: 'Matières premières et fournitures liées',
    variation: '6032',
    intituleVariation: 'Variations des stocks de matières premières et fournitures liées',
  },
  {
    racine: '33',
    intitule: 'Autres approvisionnements',
    variation: '6033',
    intituleVariation: "Variations des stocks d'autres approvisionnements",
  },
  {
    racine: '341',
    intitule: 'Produits en cours',
    variation: '7341',
    intituleVariation: 'Variations des stocks de produits en cours',
  },
  {
    racine: '342',
    intitule: 'Travaux en cours',
    variation: '7342',
    intituleVariation: 'Variations des stocks de travaux en cours',
  },
  {
    racine: '351',
    intitule: 'Études en cours',
    variation: '7351',
    intituleVariation: 'Variations des en-cours d\u2019études',
  },
  {
    racine: '352',
    intitule: 'Prestations de services en cours',
    variation: '7352',
    intituleVariation: 'Variations des en-cours de prestations de services',
  },
  {
    racine: '36',
    intitule: 'Produits finis',
    variation: '736',
    intituleVariation: 'Variations des stocks de produits finis',
  },
  {
    racine: '371',
    intitule: 'Produits intermédiaires',
    variation: '7371',
    intituleVariation: 'Variations des stocks de produits intermédiaires',
  },
  {
    racine: '372',
    intitule: 'Produits résiduels',
    variation: '7372',
    intituleVariation: 'Variations des stocks de produits résiduels',
  },
];

/**
 * SYCEBNL.
 *
 * LE COMPTE 32 DESCEND AU TROISIÈME CHIFFRE, et c'est le texte qui l'impose :
 * il réunit sous un seul numéro ce que le SYSCOHADA sépare en 31 et 32, et il
 * lui répond par DEUX comptes de variation · « par le crédit : du compte 6032
 * Variations des stocks de marchandises ET du compte 6033 Variations des
 * stocks de matières premières et fournitures liées ». Une correspondance
 * posée sur la racine 32 entière porterait les matières premières au compte
 * des marchandises.
 *
 * Les subdivisions sont celles du texte et du semis : 321 et 322 Marchandises
 * A et B, 323 et 324 Matières A et B, 325 Fournitures liées.
 */
const SYCEBNL_CORRESPONDANCES: CorrespondanceStock[] = [
  {
    racine: '31',
    intitule: "Biens liés à l'activité",
    variation: '6031',
    intituleVariation: "Variations des stocks de biens et services liés à l'activité",
  },
  {
    racine: '321',
    intitule: 'Marchandises A',
    variation: '6032',
    intituleVariation: 'Variations des stocks de marchandises',
  },
  {
    racine: '322',
    intitule: 'Marchandises B',
    variation: '6032',
    intituleVariation: 'Variations des stocks de marchandises',
  },
  {
    racine: '323',
    intitule: 'Matières A',
    variation: '6033',
    intituleVariation: 'Variations des stocks de matières premières et fournitures liées',
  },
  {
    racine: '324',
    intitule: 'Matières B',
    variation: '6033',
    intituleVariation: 'Variations des stocks de matières premières et fournitures liées',
  },
  {
    racine: '325',
    intitule: 'Fournitures liées',
    variation: '6033',
    intituleVariation: 'Variations des stocks de matières premières et fournitures liées',
  },
  {
    racine: '33',
    intitule: 'Autres approvisionnements',
    variation: '6034',
    intituleVariation: "Variations des stocks d'autres approvisionnements",
  },
  {
    racine: '35',
    intitule: 'Produits finis et services en cours',
    variation: '735',
    intituleVariation: 'Variations des en-cours de produits finis et services',
  },
  {
    racine: '36',
    intitule: 'Produits finis, produits intermédiaires et résiduels',
    variation: '736',
    intituleVariation:
      'Variations des stocks de produits finis, produits intermédiaires et résiduels',
  },
];

/**
 * CE QUI EST VOLONTAIREMENT HORS DE LA VARIATION AUTOMATIQUE, et pourquoi.
 *
 * Une racine de stock absente des tables ci-dessus n'est pas un oubli : son
 * mécanisme n'est PAS « annuler le stock initial, constater le stock final »,
 * et le traiter comme tel produirait une écriture équilibrée et fausse. Le
 * module les NOMME au lieu de les taire · une lacune tue se lit comme une
 * dispense (leçon de la passe F1).
 */
export interface StockHorsVariation {
  racine: string;
  referentiels: Referentiel[];
  intitule: string;
  motif: string;
}

export const STOCKS_HORS_VARIATION_AUTOMATIQUE: StockHorsVariation[] = [
  {
    racine: '34',
    referentiels: [Referentiel.SYCEBNL],
    intitule: 'Dons en nature',
    motif:
      "Le don en nature ne suit pas le schéma de la variation de stocks. Le texte constate le stock " +
      'final au débit du 34 par le crédit du 6035, PUIS crédite le 4713 « Créditeurs, dons en nature ' +
      "courants non consommés » par le débit du 754, et « les écritures de fin d'exercice doivent être " +
      "EXTOURNÉES au début de l'exercice suivant ». Il n'y a donc pas d'annulation du stock initial : " +
      "l'extourne l'a déjà fait. Passer ici la variation ordinaire compterait le stock deux fois.",
  },
  {
    racine: '38',
    referentiels: [Referentiel.SYCEBNL],
    intitule: 'Dons en nature H.A.O.',
    motif:
      "Même mécanisme que le 34, avec ses comptes propres · constatation par le crédit du 87, puis " +
      'crédit du 488 « Créditeurs, dons en nature H.A.O. non consommés » par le débit du 841, et ' +
      "extourne à l'ouverture. Le 87 est de surcroît un compte H.A.O., que le compte de résultat ne " +
      'lit pas au même endroit que les variations ordinaires.',
  },
  {
    racine: '38',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: 'Stocks en cours de route, en consignation ou en dépôt',
    motif:
      "Les deux textes répondent au compte des stocks en cours de route par « les sous-comptes 603 " +
      "CONCERNÉS », au pluriel et sans en nommer un seul : le compte de variation dépend de la NATURE " +
      'de la marchandise en route, que le numéro du 38 ne porte pas. OmegaX ne la devine pas. ' +
      "L'écriture se passe à la main, et le contrôle STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION la réclame " +
      'déjà quand elle manque.',
  },
  {
    racine: '388',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: 'Stock provenant d’immobilisations mises hors service ou au rebut',
    motif:
      "Ce n'est pas un stock en cours de route, bien qu'il soit rangé sous le 38, et il a son propre " +
      "mécanisme (AUDCIF Titre VIII, dépréciation des stocks, § 2.8) · les matières récupérées d'une " +
      "immobilisation y entrent EN COURS d'exercice, puis « en fin d'exercice, le compte 388 est SOLDÉ par " +
      "le débit du compte 603 Variations des stocks de biens achetés. Si des éléments de ce stock subsistent " +
      "à cette date, ils sont inscrits dans les comptes appropriés de la classe 3 par le crédit du compte " +
      "603 ». Le compte de classe 3 qui les reçoit dépend de leur nature, qu'OmegaX ne connaît pas · " +
      "l'écriture se passe à la main, et le contrôle STOCK_IMMOBILISATIONS_388_NON_SOLDE la réclame. " +
      "Le SYCEBNL porte le même objet sous le 378, sans cette règle de solde.",
  },
  {
    racine: '378',
    referentiels: [Referentiel.SYCEBNL],
    intitule: "Stock provenant d'immobilisations mises hors service ou au rebut",
    motif:
      "Ce n'est pas un stock en cours de route, bien qu'il soit rangé sous le 37 · le SYCEBNL le décrit " +
      "comme « les éléments récupérés ou démontés d'immobilisations corporelles. Ce compte est débité par le " +
      "crédit du compte d'immobilisation concerné » (Partie 2 ch. 3, compte 37). Le texte n'écrit aucune " +
      "règle de solde en fin d'exercice, là où l'AUDCIF solde son 388 par le 603 · OmegaX ne transpose pas " +
      "cette règle. L'écriture de variation, s'il y en a une, se passe à la main.",
  },
  {
    racine: '37',
    referentiels: [Referentiel.SYCEBNL],
    intitule: 'Stocks en cours de route, en consignation ou en dépôt',
    motif:
      "Même raison qu'au 38 du SYSCOHADA, sous le numéro que le SYCEBNL donne au même objet · « par le " +
      "crédit : des sous-comptes 603 concernés ». C'est la nature du bien en route qui décide, pas son " +
      'compte de passage.',
  },
  {
    racine: '343',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: 'Produits intermédiaires en cours',
    motif:
      "ANOMALIE DU PLAN OFFICIEL, signalée et non comblée. Le compte 34 ouvre les subdivisions " +
      '« 343 Produits intermédiaires en cours », « 344 Produits résiduels en cours » et « 345 Stocks ' +
      "d'actifs biologiques en cours », mais le compte 734 qui leur répond n'en ouvre que DEUX : " +
      '« 7341 Produits en cours » et « 7342 Travaux en cours ». Il n\u2019existe donc aucun compte de ' +
      "variation imputable pour ces trois subdivisions. Les rattacher au 7341 leur prêterait une " +
      'nature qu\u2019elles n\u2019ont pas ; le 734 lui-même est un en-tête et ne reçoit pas d\u2019écriture. ' +
      "L'écriture se passe à la main, sur le sous-compte que le cabinet aura ouvert, et la Note " +
      'annexe doit en porter le détail.',
  },
  {
    racine: '344',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: 'Produits résiduels en cours',
    motif:
      'Même anomalie du plan officiel que le 343 · le compte 734 n\u2019ouvre que 7341 et 7342, et ' +
      'aucun compte de variation imputable ne répond aux produits résiduels EN COURS. À ne pas ' +
      'confondre avec le 372 Produits résiduels, qui est un stock achevé et dispose bien de son 7372.',
  },
  {
    racine: '345',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: "Stocks d'actifs biologiques en cours",
    motif:
      'Même anomalie du plan officiel que le 343 · le compte 734 n\u2019ouvre que 7341 et 7342.',
  },
  {
    racine: '373',
    referentiels: [Referentiel.SYSCOHADA],
    intitule: "Stocks d'actifs biologiques",
    motif:
      "ANOMALIE DU PLAN OFFICIEL, signalée et non comblée. Le compte 37 ouvre « 373 Stocks d'actifs " +
      "biologiques (3731 Animaux, 3732 Végétaux, 3738 Autres stocks) », mais le compte 737 qui lui " +
      'répond n\u2019ouvre que « 7371 Produits intermédiaires » et « 7372 Produits résiduels ». Un actif ' +
      "biologique n'est ni l'un ni l'autre, et le 737 est un en-tête qui ne reçoit pas d'écriture.",
  },
  {
    racine: '39',
    referentiels: [Referentiel.SYCEBNL, Referentiel.SYSCOHADA],
    intitule: 'Dépréciations des stocks',
    motif:
      "Une dépréciation n'est pas une variation de stock. Elle se constate au crédit du 39 par le débit " +
      'du 6593 (ou du 839 en H.A.O.) et se reprend par le crédit du 7593 (ou du 849), sur la différence ' +
      'entre valeur nette comptable et valeur nette de réalisation. Le stock brut, lui, ne bouge pas.',
  },
];

/** Les correspondances du référentiel du dossier, et jamais celles de l'autre. */
export function correspondancesDuReferentiel(referentiel: Referentiel): CorrespondanceStock[] {
  return referentiel === Referentiel.SYCEBNL
    ? SYCEBNL_CORRESPONDANCES
    : SYSCOHADA_CORRESPONDANCES;
}

/**
 * Le compte de variation qui répond à un compte de stock, ou `null`.
 *
 * LA PLUS LONGUE RACINE L'EMPORTE · même discipline que le routage des taux de
 * TVA. Sans elle, le 321 d'un dossier SYCEBNL tomberait sur une correspondance
 * posée en « 32 » si elle existait, et les matières premières partiraient au
 * compte des marchandises.
 */
export function variationDuCompte(
  numero: string,
  referentiel: Referentiel,
): CorrespondanceStock | null {
  const candidates = correspondancesDuReferentiel(referentiel).filter((c) =>
    numero.startsWith(c.racine),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.racine.length > a.racine.length ? b : a));
}

/**
 * Le motif pour lequel un compte de stock n'a pas de variation automatique,
 * ou `null` quand il n'en fait pas partie.
 */
export function motifHorsVariation(
  numero: string,
  referentiel: Referentiel,
): StockHorsVariation | null {
  const candidates = STOCKS_HORS_VARIATION_AUTOMATIQUE.filter(
    (h) => h.referentiels.includes(referentiel) && numero.startsWith(h.racine),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.racine.length > a.racine.length ? b : a));
}
