/**
 * LA RÉÉVALUATION DES IMMOBILISATIONS (lot 14) · règles pures, sans base.
 *
 * SOURCES LUES · AUDCIF art. 35 et 62 à 65 ; Titre VIII ch. 28 (réévaluation
 * des bilans), ch. 12 § 2.5 (perte de valeur après réévaluation), ch. 16
 * § 2.6 (provision spéciale) ; Titre VII, fiches des comptes 106 et 15 ;
 * SYCEBNL Partie 3 ch. 1 § 2.1.1.3, Partie 2 ch. 2 (plan) et fiches des
 * comptes 10 et 15 ; loi n° 23/053, art. 129 à 138.
 *
 * LE PÉRIMÈTRE · « la réévaluation doit porter sur les immobilisations
 * corporelles et financières. [...] Toute réévaluation partielle est
 * interdite » (AUDCIF art. 62 ; SYCEBNL P3 ch. 1 § 2.1.1.3 ; loi n° 23/053,
 * art. 130, « Elle doit être globale »). Corporelles · divisions 22, 23 et 24 ;
 * financières · 26 et 27. Ni l'incorporel (21), ni l'avance (25), ni
 * l'usufruit temporaire (2011, incorporel du SYCEBNL). Au SYCEBNL, la
 * division 20 porte AUSSI des terrains, bâtiments, matériels et titres
 * (202 à 205) reçus en dons et legs et destinés à la vente · corporels et
 * financiers par nature, ils sont DANS le périmètre, mais le texte ne dit pas
 * comment l'opération les traite · ils restent à leur valeur, avec leur motif,
 * jamais écartés en silence (décision proposée D-29). Les ÉLÉMENTS
 * MONÉTAIRES de la division 27 (prêts, créances, dépôts, cautionnements,
 * intérêts courus) sont lus et gardés à leur valeur · le ch. 28 § 1.2 ne
 * réévalue qu'« un bien ou un élément non monétaire » (`estElementMonetaire`).
 * Le bien EN COURS (229, 239, 249) est une immobilisation corporelle · il est
 * dans l'opération, réévalué au compte où il est inscrit à la date de la
 * réévaluation (`compteInscritALaDate`, `reevaluation-bilan.service.ts`).
 *
 * LA VALEUR RÉÉVALUÉE · légale, méthode indiciaire, la valeur nette × k « fixé
 * par la loi » (ch. 28 § 4.2.1.1), plafonnée par la valeur actuelle · « La
 * valeur réévaluée est donc la plus faible des deux valeurs » (§ 3.1.1), et
 * alors « k' = Valeur actuelle / Valeur comptable » (§ 4.2.1.3) ; libre, la
 * valeur actuelle (§ 3.1.2, § 4.3). Art. 63 · elle « ne peut, en aucun cas,
 * dépasser sa juste valeur ». En RDC, le coefficient légal est fixé par
 * « un Arrêté du Ministre ayant les Finances dans ses attributions » (loi
 * n° 23/053, art. 129) · AUCUN COEFFICIENT N'EST ÉCRIT ICI, chacun se déclare
 * avec sa source.
 *
 * Exemples du texte, éprouvés par le spec · 1 000 brut, 400 amortis, k = 1,5 ·
 * 1 500, 600, 900 ; valeur actuelle 840 · k' = 1,4, 1 400, 560, écart 240
 * (§ 4.2.1.2 et 4.2.1.3). Libre · 150 000 000, 30 000 000 amortis, valeur
 * actuelle 135 000 000 · méthode 1, D 23 18 750 000 / C 283 3 750 000 / C 1062
 * 15 000 000 ; méthode 2, D 283 30 000 000 / C 23 30 000 000, puis D 23
 * 15 000 000 / C 1062 15 000 000, annuité suivante 135 000 000 / 24 =
 * 5 625 000 (§ 4.3.1, § 4.3.2).
 */

export type Ref = 'SYSCOHADA' | 'SYCEBNL';
export type TypeReevaluation = 'LEGALE' | 'LIBRE';
export type MethodeLibre = 'AJUSTEMENT' | 'ELIMINATION';
export type NatureReevaluable = 'CORPORELLE' | 'FINANCIERE';
/**
 * LA BASE DU COEFFICIENT DÉCLARÉ · ce que le coefficient de l'arrêté mesure,
 * quand un bien du périmètre porte déjà une réévaluation. Voir
 * `coefficientApplique`.
 */
export type BaseCoefficient = 'ORIGINE' | 'DERNIERE_REEVALUATION';

const EPSILON = 0.005;
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Le compte crédité de la reprise de la provision spéciale (ch. 28 § 4.2.4.2), même numéro aux deux plans. */
export const COMPTE_REPRISE_PROVISION_SPECIALE = '86100000';
/** La provision spéciale de réévaluation, même numéro et même intitulé aux deux semis. */
export const COMPTE_PROVISION_SPECIALE = '15400000';

/**
 * LA DIVISION DIT SI LE BIEN EST DANS LE PÉRIMÈTRE · null hors périmètre.
 * Mêmes divisions aux deux plans pour 22 à 24, 26 et 27 (relu dans les deux
 * semis par le spec).
 */
export function natureReevaluable(numeroCompte: string, referentiel: Ref): NatureReevaluable | null {
  if (/^2[234]/.test(numeroCompte)) return 'CORPORELLE';
  if (/^2[67]/.test(numeroCompte)) return 'FINANCIERE';
  // Un numéro, deux sens · le SYSCOHADA n'ouvre aucun 20 ; au SYCEBNL, 202
  // Terrains, 203 Bâtiments, 204 Matériels, 205 Titres de participations
  // (Partie 2 ch. 2 ; fiche du compte 20). Le référentiel est EXIGÉ, sans
  // défaut · un oubli le ferait lire de travers en silence.
  if (referentiel === 'SYCEBNL' && /^20[234]/.test(numeroCompte)) return 'CORPORELLE';
  if (referentiel === 'SYCEBNL' && numeroCompte.startsWith('205')) return 'FINANCIERE';
  return null;
}

/**
 * LES ÉLÉMENTS MONÉTAIRES DE LA DIVISION 27 · ch. 28 § 1.2 · « Toute
 * réévaluation d'un BIEN OU D'UN ÉLÉMENT NON MONÉTAIRE a pour conséquence la
 * substitution d'une valeur, dite réévaluée, à la valeur nette précédemment
 * comptabilisée ». Le même chapitre définit l'élément monétaire (§ 7.2.2.1,
 * A) · « les éléments d'actif et de passif devant être reçus ou payés dans un
 * nombre d'unités monétaires déterminé ou déterminable », qui « ne sont pas
 * retraités, car ils sont déjà exprimés dans l'unité monétaire en vigueur »
 * (exemples · « créances, dettes, banque, caisse ») ; et ses éléments non
 * monétaires sont « les immobilisations corporelles, les titres, les stocks
 * [...] ». Un prêt, une créance, un dépôt, un cautionnement, des intérêts
 * courus, un dépôt à terme se remboursent en un nombre déterminé d'unités ·
 * leur substituer une « valeur actuelle » n'a pas d'objet. Les titres (274),
 * les titres prêtés (2714 au SYSCOHADA, 2715 au SYCEBNL), l'or et les métaux
 * précieux (2785) et les « autres » (2788), que rien ne qualifie, restent
 * dans l'opération.
 *
 * Racines relues dans les DEUX semis par le spec (intitulés de prêt, de
 * créance, de dépôt, de cautionnement, d'intérêts courus, de billets de
 * fonds) · 2711, 2712 (SYSCOHADA seul), 2713, 2718, 272, 273, 275, 276, 277
 * (SYSCOHADA seul), 2781, 2782 (SYSCOHADA seul) et 2784.
 */
export const RACINES_ELEMENTS_MONETAIRES = ['2711', '2712', '2713', '2718', '272', '273', '275', '276', '277', '2781', '2782', '2784'];

export function estElementMonetaire(numeroCompte: string): boolean {
  return RACINES_ELEMENTS_MONETAIRES.some((r) => numeroCompte.startsWith(r));
}

/** La division 20 du SYCEBNL (biens reçus destinés à la vente), gardée à sa valeur (D-29). */
export function estBienRecuDestineALaVente(numeroCompte: string, referentiel: Ref): boolean {
  return referentiel === 'SYCEBNL' && /^20[2-5]/.test(numeroCompte);
}

/**
 * LE COMPTE QUI REÇOIT L'ÉCART · UN NUMÉRO, DEUX SENS.
 *
 * AUDCIF, fiche du compte 106 · « 1061 Écarts de réévaluation légale, 1062
 * Écarts de réévaluation libre » ; ch. 28 § 4.2.4.1 · « lorsque la législation
 * fiscale impose [...] la neutralité fiscale de l'opération, le compte 154
 * Provision spéciale de réévaluation doit être crédité au lieu du 1061 [...]
 * du même montant ». La provision spéciale n'est écrite que pour la
 * réévaluation LÉGALE (§ 4.3.1 crédite toujours le 1062). La neutralité se
 * DÉCLARE à chaque opération, jamais présumée (décision proposée D-30) · la
 * loi n° 23/053, art. 133 al. 2, l'obtient « par une réintégration dans les
 * bénéfices », sans nommer le 154.
 *
 * ANOMALIE DU TEXTE, SIGNALÉE · les fiches du compte 15 des deux textes font
 * créer les provisions réglementées « exclusivement par Dotations H.A.O. »
 * (débit du 85), quand le § 4.2.4.1 crédite le 154 par le débit du compte
 * d'immobilisation. Le chapitre qui règle l'opération est suivi.
 *
 * SYCEBNL, Partie 2 ch. 2 · « 1061 Écarts de réévaluation sur des biens SANS
 * DROIT DE REPRISE (10611 immobilisations corporelles, 10612 immobilisations
 * financières) ; 1062 [...] AVEC DROIT DE REPRISE (10621, 10622) » · le
 * numéro ne dit pas légale ou libre, il dit si le bien est grevé d'un droit
 * de reprise. Ce droit n'est pas une donnée de la fiche · il se DÉCLARE pour
 * chaque bien réévalué, sans défaut (décision proposée D-31). Le 154 du
 * SYCEBNL porte la même définition (fiche du compte 15) et suit la même
 * règle que l'AUDCIF.
 */
export function compteEcart(o: {
  referentiel: Ref;
  type: TypeReevaluation;
  neutraliteFiscale: boolean;
  nature: NatureReevaluable;
  /** Le plan fait-il amortir ce bien · seule une immobilisation amortissable reçoit le 154. */
  amortissable: boolean;
  droitDeReprise: boolean | null | undefined;
}): { compte: string } | { motif: string } {
  if (o.neutraliteFiscale) {
    if (o.type !== 'LEGALE') {
      return {
        motif:
          "La provision spéciale de réévaluation (154) ne s'écrit que pour une réévaluation légale · la " +
          'réévaluation libre crédite le 1062 (AUDCIF Titre VIII ch. 28 § 4.2.4.1 et § 4.3.1).',
      };
    }
    // TEXTE EN TENSION, LECTURE DÉCLARÉE (décision proposée D-43) · le
    // ch. 28 § 4.2.4.1 met le 154 « au lieu du 1061 » sans distinguer, mais
    // le ch. 16 § 2.6 crée la provision spéciale « pour constater l'écart
    // entre la valeur réévaluée et la valeur d'origine des immobilisations
    // AMORTISSABLES », reprise « au rythme des amortissements desdites
    // immobilisations », et le § 4.2.4.2 ne la reprend qu'« à concurrence du
    // supplément de la dotation aux amortissements ». Sur un terrain ou un
    // titre, un 154 ne se reprendrait jamais · et la loi n° 23/053, art. 133
    // al. 2, n'obtient la neutralité que sur « l'augmentation corrélative de
    // chaque annuité d'amortissements ». L'écart d'un bien non amortissable
    // reste donc au 106, qui est déjà sans influence sur le résultat (art.
    // 132) · aucun refus, aucun montant changé, seul le poste des capitaux
    // propres diffère. La BASE suit le ch. 28 (« du même montant » que
    // l'écart de valeur nette), non la « valeur d'origine » du ch. 16.
    if (o.amortissable) return { compte: COMPTE_PROVISION_SPECIALE };
  }
  if (o.referentiel === 'SYSCOHADA') return { compte: o.type === 'LEGALE' ? '10610000' : '10620000' };
  if (o.droitDeReprise === null || o.droitDeReprise === undefined) {
    return {
      motif:
        "Au SYCEBNL, l'écart se range selon que le bien est grevé ou non d'un droit de reprise (1061 sans, 1062 " +
        'avec · SYCEBNL Partie 2 ch. 2) · déclarez-le pour chaque bien réévalué.',
    };
  }
  const corporelle = o.nature === 'CORPORELLE';
  if (o.droitDeReprise) return { compte: corporelle ? '10621000' : '10622000' };
  return { compte: corporelle ? '10611000' : '10612000' };
}

export interface BienAReevaluer {
  id: string;
  designation: string;
  numeroCompte: string;
  valeurOrigine: number;
  valeurResiduelle: number;
  /** Dotations du module et cumul hors dotations (`amortissementsHorsDotations`). */
  cumulAmortissements: number;
  cumulDepreciation: number;
  /** Le plan fait-il amortir ce bien (division, projet de développement, durée non limitée) ? */
  amortissable: boolean;
  /** Linéaire (ni unités d'œuvre, ni dégressif) · seule la méthode 2 l'exige. */
  lineaire: boolean;
  /**
   * Années entières restant à courir à l'ouverture de l'exercice suivant ·
   * null quand le reste n'est pas un nombre entier d'années (premier exercice
   * au prorata) ou que le plan n'a pas commencé.
   */
  anneesRestantes: number | null;
  planCommence: boolean;
  /**
   * Les coefficients RETENUS (k') des réévaluations d'exercices antérieurs
   * déjà portées par ce bien, dans l'ordre · vide pour un bien jamais
   * réévalué. La valeur nette inscrite les contient déjà.
   */
  coefficientsAnterieurs: number[];
}

export interface SaisieBien {
  categorie?: string | null;
  valeurActuelle?: number | null;
  droitDeReprise?: boolean | null;
}

export interface Operation {
  referentiel: Ref;
  type: TypeReevaluation;
  methodeLibre: MethodeLibre | null;
  neutraliteFiscale: boolean;
  /** Légale · coefficient par catégorie, déclaré avec sa source. */
  coefficients: Record<string, number>;
  /**
   * Légale · ce que mesure le coefficient de chaque catégorie, exigé
   * seulement d'une catégorie dont un bien est déjà réévalué (null sinon).
   */
  bases: Record<string, BaseCoefficient | null | undefined>;
}

export interface ResultatBien {
  id: string;
  designation: string;
  nature: NatureReevaluable;
  valeurNetteAvant: number;
  /**
   * Légale · le coefficient APPLIQUÉ à la valeur nette inscrite, après la
   * conversion d'un coefficient déclaré depuis l'origine (`coefficientApplique`).
   */
  coefficient: number | null;
  /** Légale · le coefficient tel que déclaré pour la catégorie. */
  coefficientDeclare: number | null;
  /** Le produit des coefficients déjà appliqués au bien (1 s'il n'a jamais été réévalué). */
  produitAnterieur: number;
  coefficientRetenu: number;
  valeurReevaluee: number;
  brutApres: number;
  amortissementsApres: number;
  valeurResiduelleApres: number;
  deltaBrut: number;
  deltaAmortissements: number;
  ecart: number;
  compteEcart: string | null;
  /** Pourquoi le bien garde sa valeur nette · jamais écarté en silence. */
  motifNonReevalue: string | null;
}

export const MOTIF_DEPRECIE =
  "Bien déprécié · « la dépréciation a pour objet de ramener la valeur comptable nette de l'élément à la valeur " +
  "actuelle à la date du bilan. En conséquence, l'élément ne saurait être réévalué à cette date » (AUDCIF Titre VIII " +
  'ch. 28 § 4.2.3). Il reste dans l’opération à sa valeur nette.';

export const MOTIF_DIVISION_20 =
  'Bien reçu en don ou legs et destiné à la vente (division 20) · inscrit à sa valeur actuelle par le crédit du ' +
  'fonds reporté (172) et déprécié au 2902 (SYCEBNL, fiche du compte 20 ; Partie 3 ch. 2). Le texte ne dit pas ' +
  'comment la réévaluation le traite · il reste dans l’opération à sa valeur, sans écart.';

export const MOTIF_ELEMENT_MONETAIRE =
  'Élément monétaire (prêt, créance, dépôt, cautionnement, intérêts courus) · la réévaluation ne vise que « un bien ou ' +
  'un élément non monétaire » (AUDCIF Titre VIII ch. 28 § 1.2), l’élément monétaire étant déjà « exprimé dans ' +
  'l’unité monétaire en vigueur » (§ 7.2.2.1) · il reste dans l’opération à sa valeur, sans valeur actuelle à déclarer.';

export const MOTIF_VALEUR_NETTE_NULLE =
  'Valeur nette nulle · le coefficient ne s’applique à rien. Un bien totalement amorti qui garde une valeur ' +
  'actuelle positive appelle un nouveau plan (ch. 28 § 4.2.2), que l’opération ne définit pas.';

/** Le produit des coefficients retenus (k') d'une suite de réévaluations · 1 pour aucune. */
export function produitCoefficients(coefficients: number[]): number {
  return coefficients.reduce((p, k) => p * k, 1);
}

/** Au-delà de cet écart, un produit de coefficients n'est plus « 1 » (Decimal(18, 10) en base). */
const EPSILON_COEFFICIENT = 1e-9;

/**
 * LE COEFFICIENT APPLIQUÉ À LA VALEUR NETTE INSCRITE · ch. 28 § 4.2.1.1,
 * « La valeur comptable (nette des amortissements) est à multiplier par le
 * coefficient ou l'indice de l'année ». La valeur comptable est celle qui est
 * INSCRITE à la date de la réévaluation · pour un bien déjà réévalué, elle
 * contient les coefficients des réévaluations antérieures (§ 4.2.1.1, « la
 * valeur d'entrée sera elle-même multipliée par le coefficient k. Il en sera
 * de même du cumul des amortissements » ; loi n° 23/053, art. 132 al. 2, la
 * « valeur comptable figurant au bilan après réévaluation »).
 *
 * LE TEXTE NE DIT PAS CE QUE MESURE LE COEFFICIENT · le § 4.2.1.1 parle de
 * « l'indice de l'année » sans dire laquelle (§ 3.1.1 · « si l'indice de
 * l'année P est de 1,80 [...] 100 unités monétaires de l'année P ont le même
 * pouvoir d'achat général [...] que 180 unités monétaires à fin N »), et la
 * loi n° 23/053, art. 129, laisse l'arrêté « fixer les coefficients de
 * réévaluation à appliquer ». Un indice qui mesure le pouvoir d'achat depuis
 * l'année d'acquisition, appliqué à une valeur déjà réévaluée, compte deux
 * fois l'inflation déjà constatée · le séminaire du CPCC sur l'arrêté des
 * comptes 2024 (témoin, pas une source) donne des coefficients par année
 * d'acquisition, cumulés depuis l'origine (Canon · 1,03 en 2021, 1,17 en
 * 2022, valeur brute 450 000 portée à 526 500), et 1,17 sur la valeur
 * réévaluée en 2021 la porterait à 542 295. OmegaX NE TRANCHE PAS ce que
 * l'arrêté mesure · la catégorie le DÉCLARE dès qu'un bien du périmètre porte
 * déjà une réévaluation, sans défaut, et un bien déjà réévalué sans réponse
 * est refusé. Depuis l'origine, le coefficient est converti par ce qui a déjà
 * été appliqué au bien · k ÷ produit des k' antérieurs (valeur nette inscrite
 * × k ÷ ∏k' = valeur nette sans réévaluation × k). Le plafond par la valeur
 * actuelle (k', § 4.2.1.3) joue APRÈS la conversion.
 *
 * Un coefficient converti INFÉRIEUR À 1 (l'arrêté mesure moins que ce qui a
 * déjà été appliqué) ferait une valeur indiciaire sous la valeur nette · le
 * texte ne règle pas ce cas (§ 4.2.1.3 ne réduit k que par la valeur
 * actuelle) · refusé, avec le calcul, jamais ramené à 1 en silence.
 */
export function coefficientApplique(o: {
  coefficient: number;
  base: BaseCoefficient | null | undefined;
  produitAnterieur: number;
}): { coefficient: number } | { refus: string } {
  if (Math.abs(o.produitAnterieur - 1) <= EPSILON_COEFFICIENT) return { coefficient: o.coefficient };
  if (o.base !== 'ORIGINE' && o.base !== 'DERNIERE_REEVALUATION') {
    return {
      refus:
        `bien déjà réévalué (coefficients déjà appliqués · ${o.produitAnterieur.toFixed(6)}) · déclarez pour sa ` +
        'catégorie si le coefficient de l’arrêté court depuis l’acquisition ou depuis la dernière réévaluation. Le ' +
        'coefficient s’applique à la valeur nette inscrite, réévaluations antérieures comprises (AUDCIF Titre VIII ' +
        'ch. 28 § 4.2.1.1), et le texte ne dit pas ce que l’arrêté mesure (loi n° 23/053, art. 129).',
    };
  }
  if (o.base === 'DERNIERE_REEVALUATION') return { coefficient: o.coefficient };
  const converti = o.coefficient / o.produitAnterieur;
  if (converti < 1 - EPSILON_COEFFICIENT) {
    return {
      refus:
        `coefficient depuis l’acquisition ${o.coefficient} ÷ coefficients déjà appliqués ${o.produitAnterieur.toFixed(6)} = ` +
        `${converti.toFixed(6)}, inférieur à 1 · la valeur indiciaire serait sous la valeur nette inscrite, cas que ` +
        'le texte ne règle pas (AUDCIF Titre VIII ch. 28 § 4.2.1.1 et § 4.2.1.3).',
    };
  }
  return { coefficient: converti };
}

/**
 * LE CALCUL D'UN BIEN · { refus } quand l'opération ne peut pas le porter,
 * et elle s'arrête alors entière (une réévaluation partielle est interdite).
 */
export function reevaluerBien(bien: BienAReevaluer, saisie: SaisieBien, op: Operation): ResultatBien | { refus: string } {
  const nature = natureReevaluable(bien.numeroCompte, op.referentiel);
  if (!nature) return { refus: `« ${bien.designation} » (${bien.numeroCompte}) n'est ni une immobilisation corporelle ni une immobilisation financière.` };
  const valeurNette = centimes(bien.valeurOrigine - bien.cumulAmortissements - bien.cumulDepreciation);
  const garde = (motif: string): ResultatBien => ({
    id: bien.id,
    designation: bien.designation,
    nature,
    valeurNetteAvant: valeurNette,
    coefficient: null,
    coefficientDeclare: null,
    produitAnterieur: produitCoefficients(bien.coefficientsAnterieurs),
    coefficientRetenu: 1,
    valeurReevaluee: valeurNette,
    brutApres: bien.valeurOrigine,
    amortissementsApres: bien.cumulAmortissements,
    valeurResiduelleApres: bien.valeurResiduelle,
    deltaBrut: 0,
    deltaAmortissements: 0,
    ecart: 0,
    compteEcart: null,
    motifNonReevalue: motif,
  });

  // D-29 · la division 20 du SYCEBNL, avant toute autre question (elle ne
  // demande ni valeur actuelle ni catégorie).
  if (estBienRecuDestineALaVente(bien.numeroCompte, op.referentiel)) return garde(MOTIF_DIVISION_20);

  // Ch. 28 § 1.2 · un élément MONÉTAIRE de la division 27 n'a pas de valeur
  // réévaluée · ni valeur actuelle ni catégorie ne lui sont demandées.
  if (estElementMonetaire(bien.numeroCompte)) return garde(MOTIF_ELEMENT_MONETAIRE);

  // § 4.2.3 · un bien déprécié est déjà à sa valeur actuelle. Le paragraphe
  // est rangé sous la réévaluation LÉGALE (§ 4.2) ; il est appliqué aussi à
  // la libre, dont la valeur réévaluée « est toujours la valeur actuelle »
  // (§ 3.1.2) · la même valeur actuelle, au même jour, que la dépréciation
  // vient de constater, ne fait aucun écart (décision proposée D-44).
  if (bien.cumulDepreciation > EPSILON) return garde(MOTIF_DEPRECIE);

  // LÉGALE · un bien totalement amorti n'a rien que le coefficient multiplie
  // (valeur nette × k = 0, § 4.2.1.1) · il est gardé sans qu'on lui demande
  // une valeur actuelle qui ne servirait à rien (décision proposée D-37). En
  // libre, la valeur actuelle reste exigée · positive, elle appellerait un
  // nouveau plan (§ 4.2.2), refusé plus bas.
  if (op.type === 'LEGALE' && valeurNette <= EPSILON) return garde(MOTIF_VALEUR_NETTE_NULLE);

  const va = saisie.valeurActuelle;
  if (va === null || va === undefined || !Number.isFinite(va) || va < 0) {
    return {
      refus:
        `Valeur actuelle de « ${bien.designation} » non déclarée · la valeur réévaluée « ne peut, en aucun cas, ` +
        'dépasser sa juste valeur à la date prise en compte pour point de départ de la réévaluation, c’est-à-dire sa ' +
        'valeur actuelle » (AUDCIF art. 63), et la méthode indiciaire « n’échappe pas à la détermination des valeurs ' +
        'actuelles » (ch. 28 § 3.1.2).',
    };
  }

  if (valeurNette <= EPSILON) {
    if (op.type === 'LIBRE' && va > EPSILON) {
      return {
        refus:
          `« ${bien.designation} » est totalement amorti et vous lui déclarez une valeur actuelle de ${va.toFixed(2)} · ` +
          '« un plan d’amortissement doit être défini » (ch. 28 § 4.2.2), ce que cette opération ne fait pas. ' +
          'Déclarez sa valeur actuelle à zéro, ou réévaluez-le hors de ce module.',
      };
    }
    return garde(MOTIF_VALEUR_NETTE_NULLE);
  }

  let coefficient: number | null = null;
  let coefficientDeclare: number | null = null;
  const produitAnterieur = produitCoefficients(bien.coefficientsAnterieurs);
  let valeurReevaluee: number;
  if (op.type === 'LEGALE') {
    const cle = saisie.categorie ?? '';
    const k = op.coefficients[cle];
    if (!cle || k === undefined || !Number.isFinite(k) || k <= 0) {
      return {
        refus:
          `Catégorie de « ${bien.designation} » sans coefficient déclaré · la valeur indiciaire est la valeur nette ` +
          '« multipliée par le coefficient ou l’indice de l’année (correspondant à la catégorie de biens) » ' +
          '(ch. 28 § 4.2.1.1), fixé par arrêté du Ministre des Finances (loi n° 23/053, art. 129).',
      };
    }
    const applique = coefficientApplique({ coefficient: k, base: op.bases[cle], produitAnterieur });
    if ('refus' in applique) return { refus: `« ${bien.designation} » · ${applique.refus}` };
    coefficientDeclare = k;
    coefficient = applique.coefficient;
    // § 3.1.1 · « la plus faible des deux valeurs : valeur indiciaire ; valeur actuelle ».
    valeurReevaluee = Math.min(centimes(valeurNette * coefficient), centimes(va));
  } else {
    // § 3.1.2 · « la valeur réévaluée est toujours la valeur actuelle ».
    valeurReevaluee = centimes(va);
  }

  if (valeurReevaluee < valeurNette - EPSILON) {
    return {
      refus:
        `« ${bien.designation} » · la valeur retenue (${valeurReevaluee.toFixed(2)}) est inférieure à sa valeur nette ` +
        `(${valeurNette.toFixed(2)}). Une perte de valeur se constate par une dépréciation (AUDCIF Titre VIII ch. 12) ` +
        'avant la réévaluation, qui ne fait que substituer une valeur réévaluée à la valeur nette (art. 62 et 63).',
    };
  }

  const compte = compteEcart({
    referentiel: op.referentiel,
    type: op.type,
    neutraliteFiscale: op.neutraliteFiscale,
    nature,
    amortissable: bien.amortissable,
    droitDeReprise: saisie.droitDeReprise,
  });
  const ecart = centimes(valeurReevaluee - valeurNette);
  if ('motif' in compte && ecart > EPSILON) return { refus: compte.motif };

  // k' = valeur retenue / valeur comptable (§ 4.2.1.3) · k lui-même quand
  // la valeur actuelle ne plafonne pas.
  const coefficientRetenu = valeurReevaluee / valeurNette;
  const valeurResiduelleApres = centimes(bien.valeurResiduelle * coefficientRetenu);
  const elimination = op.type === 'LIBRE' && op.methodeLibre === 'ELIMINATION';

  if (elimination && bien.amortissable && bien.planCommence && ecart > EPSILON) {
    // Méthode 2 · la valeur nette réévaluée devient la valeur brute, amortie
    // « en appliquant à la nouvelle valeur comptable le plan d'amortissement
    // initialement prévu » sur les annuités restantes (§ 4.3.2 · 135 000 000
    // / 24). Le moteur ne compte qu'en années entières (lot 11, durée
    // résiduelle) · un reste fractionnaire n'est pas porté par cette voie.
    if (!bien.lineaire) {
      return {
        refus:
          `« ${bien.designation} » n'est pas amorti en linéaire · la méthode 2 du § 4.3.1 répartit la nouvelle valeur ` +
          'sur les annuités restantes, ce que le moteur ne fait qu’au linéaire. Retenez la méthode 1, qui donne les ' +
          'mêmes annuités multipliées par le coefficient.',
      };
    }
    if (bien.anneesRestantes === null || bien.anneesRestantes < 1) {
      return {
        refus:
          `« ${bien.designation} » · la durée restant à courir n'est pas un nombre entier d'années (premier exercice ` +
          'au prorata), et la méthode 2 la porterait mal. Retenez la méthode 1, qui donne les mêmes annuités ' +
          'multipliées par le coefficient (§ 4.3.1).',
      };
    }
    return {
      id: bien.id,
      designation: bien.designation,
      nature,
      valeurNetteAvant: valeurNette,
      coefficient,
      coefficientDeclare,
      produitAnterieur,
      coefficientRetenu,
      valeurReevaluee,
      brutApres: valeurReevaluee,
      amortissementsApres: 0,
      valeurResiduelleApres,
      deltaBrut: centimes(valeurReevaluee - bien.valeurOrigine),
      deltaAmortissements: centimes(-bien.cumulAmortissements),
      ecart,
      compteEcart: 'compte' in compte ? compte.compte : null,
      motifNonReevalue: null,
    };
  }

  // Légale, ou libre méthode 1 · « la valeur d'entrée sera elle-même
  // multipliée par le coefficient k. Il en sera de même du cumul des
  // amortissements » (§ 4.2.1.1). Le cumul est arrondi au centime, et la
  // valeur brute s'en déduit, pour que la valeur nette soit EXACTEMENT la
  // valeur retenue.
  const amortissementsApres = centimes(bien.cumulAmortissements * coefficientRetenu);
  const brutApres = centimes(valeurReevaluee + amortissementsApres);
  return {
    id: bien.id,
    designation: bien.designation,
    nature,
    valeurNetteAvant: valeurNette,
    coefficient,
    coefficientDeclare,
    produitAnterieur,
    coefficientRetenu,
    valeurReevaluee,
    brutApres,
    amortissementsApres,
    valeurResiduelleApres,
    deltaBrut: centimes(brutApres - bien.valeurOrigine),
    deltaAmortissements: centimes(amortissementsApres - bien.cumulAmortissements),
    ecart,
    compteEcart: ecart > EPSILON && 'compte' in compte ? compte.compte : null,
    motifNonReevalue: ecart > EPSILON ? null : 'Valeur retenue égale à la valeur nette · aucun écart.',
  };
}

/**
 * LES LIGNES DE L'ÉCRITURE D'UN BIEN · comptes par leur rôle, l'appelant les
 * résout. Méthode 1 (et légale) · D 2 de la hausse brute / C 28 de la hausse
 * du cumul / C écart (§ 4.2.4.1, § 4.3.1). Méthode 2 · les deux étapes du
 * texte, D 28 / C 2 du cumul puis D 2 / C écart.
 */
export function lignesBien(
  r: ResultatBien,
  methode: 'AJUSTEMENT' | 'ELIMINATION',
): Array<{ role: 'BIEN' | 'AMORTISSEMENT' | 'ECART'; debit: number; credit: number }> {
  if (r.ecart <= EPSILON) return [];
  const lignes: Array<{ role: 'BIEN' | 'AMORTISSEMENT' | 'ECART'; debit: number; credit: number }> = [];
  if (methode === 'ELIMINATION' && r.amortissementsApres === 0 && r.deltaAmortissements < -EPSILON) {
    const cumul = -r.deltaAmortissements;
    lignes.push({ role: 'AMORTISSEMENT', debit: cumul, credit: 0 }, { role: 'BIEN', debit: 0, credit: cumul });
    lignes.push({ role: 'BIEN', debit: r.ecart, credit: 0 }, { role: 'ECART', debit: 0, credit: r.ecart });
    return lignes;
  }
  if (r.deltaBrut > EPSILON) lignes.push({ role: 'BIEN', debit: r.deltaBrut, credit: 0 });
  if (r.deltaAmortissements > EPSILON) lignes.push({ role: 'AMORTISSEMENT', debit: 0, credit: r.deltaAmortissements });
  lignes.push({ role: 'ECART', debit: 0, credit: r.ecart });
  return lignes;
}

/**
 * LES ANNÉES ENTIÈRES RESTANT À COURIR à l'ouverture de l'exercice suivant ·
 * null quand le reste n'est pas entier. Révision prospective active (lot 11) ·
 * sa durée résiduelle moins les années écoulées depuis son effet ; sinon
 * durée × (valeur nette − valeur résiduelle) / base, le plan linéaire étant
 * constant (« annuités constantes »).
 */
export function anneesRestantes(o: {
  dureeAns: number;
  valeurOrigine: number;
  valeurResiduelle: number;
  valeurNette: number;
  revision: { effet: Date; dureeResiduelleAns: number } | null;
  ouvertureSuivante: Date;
}): number | null {
  if (o.revision && o.revision.effet <= o.ouvertureSuivante) {
    const mois =
      (o.ouvertureSuivante.getUTCFullYear() - o.revision.effet.getUTCFullYear()) * 12 +
      (o.ouvertureSuivante.getUTCMonth() - o.revision.effet.getUTCMonth());
    if (mois % 12 !== 0) return null;
    const reste = o.revision.dureeResiduelleAns - mois / 12;
    return reste >= 1 ? reste : null;
  }
  const base = o.valeurOrigine - o.valeurResiduelle;
  if (!(o.dureeAns > 0) || base <= EPSILON) return null;
  const reste = (o.dureeAns * (o.valeurNette - o.valeurResiduelle)) / base;
  const entier = Math.round(reste);
  return Math.abs(reste - entier) < 1e-4 && entier >= 1 ? entier : null;
}

/**
 * LA REPRISE DE LA PROVISION SPÉCIALE · ch. 28 § 4.2.4.2, « à la clôture de
 * chaque exercice, à la reprise de provision spéciale de réévaluation à
 * concurrence du SUPPLÉMENT DE LA DOTATION aux amortissements dégagé
 * annuellement sur les éléments d'actif réévalués, par le biais du compte 861
 * Reprises de provisions réglementées » ; loi n° 23/053, art. 133 al. 2,
 * « l'augmentation corrélative de chaque annuité d'amortissements ». Les
 * annuités nouvelles étant « égales à celles qui étaient initialement
 * prévues, multipliées par le coefficient k (ou k') » (§ 4.2.2), le
 * supplément d'une dotation D après UNE réévaluation vaut D × (1 − 1/k').
 *
 * PLUSIEURS RÉÉVALUATIONS SE CHAÎNENT · la dotation de l'exercice porte
 * TOUTES les réévaluations antérieures du bien, et le supplément qu'elles
 * dégagent ensemble est D × (1 − 1/∏k'), jamais Σ D × (1 − 1/k'ᵢ) (Canon du
 * séminaire du CPCC, 1,03 puis 1,17 ÷ 1,03, dotation 175 500 · 25 500, et
 * non 26 111,60, la somme comptant deux fois la première réévaluation sur
 * une dotation qui contient la seconde). La part de CHAQUE opération est la
 * dotation qu'il y aurait eu sans les réévaluations qui la SUIVENT, moins
 * celle qu'il y aurait eu sans elle non plus · D ÷ ∏k' postérieurs ×
 * (1 − 1/k'ᵢ) ; les parts s'additionnent exactement au supplément total, et
 * chacune est celle que dégage la provision de cette opération, constituée
 * sur la valeur nette inscrite à SA date (Canon · 4 500 de la première, au
 * rythme de 154 500 − 150 000 par an, 21 000 de la seconde, 175 500 −
 * 154 500). Bornée au solde non repris de l'opération.
 *
 * ANOMALIE DU TEXTE, SIGNALÉE · le ch. 16 § 2.6 fait reprendre la même
 * provision « par l'intermédiaire du compte 799 ». Le ch. 28, qui règle
 * l'opération, et les fiches du compte 15 des deux textes (« réduites ou
 * annulées exclusivement par Reprises H.A.O. ») écrivent 86 · c'est le 861
 * qui est suivi.
 */
export function supplementDotation(o: {
  dotation: number;
  coefficientRetenu: number;
  /** Le produit des k' des réévaluations du bien POSTÉRIEURES à celle-ci et antérieures à l'exercice (1 sans aucune). */
  produitPosterieur: number;
  resteProvision: number;
}): number {
  if (o.coefficientRetenu <= 1 + 1e-9 || o.dotation <= EPSILON || o.resteProvision <= EPSILON) return 0;
  if (!(o.produitPosterieur > 0)) return 0;
  return Math.min(centimes(o.resteProvision), centimes((o.dotation / o.produitPosterieur) * (1 - 1 / o.coefficientRetenu)));
}

/**
 * LES PARTS DE CHAQUE RÉÉVALUATION D'UN BIEN · `supplementDotation` sur la
 * chaîne entière, dans l'ordre des dates. Les opérations au 106 comptent
 * dans la chaîne (elles ont multiplié la dotation) mais ne reçoivent rien ·
 * seule une provision spéciale (154) se reprend.
 */
export function partsDuSupplement(
  dotation: number,
  chaine: Array<{ id: string; coefficientRetenu: number; resteProvision: number; provisionSpeciale: boolean }>,
): Array<{ id: string; produitPosterieur: number; montant: number }> {
  return chaine.map((op, i) => {
    const produitPosterieur = produitCoefficients(chaine.slice(i + 1).map((x) => x.coefficientRetenu));
    return {
      id: op.id,
      produitPosterieur,
      montant: op.provisionSpeciale
        ? supplementDotation({ dotation, coefficientRetenu: op.coefficientRetenu, produitPosterieur, resteProvision: op.resteProvision })
        : 0,
    };
  });
}

/**
 * LA PERTE DE VALEUR D'UN BIEN RÉÉVALUÉ · ch. 12 § 2.5, « la perte de valeur
 * s'impute sur l'écart de réévaluation ; le solde éventuel est enregistré en
 * charges ». Exemple du texte · perte 15 000 000, écart 6 000 000 · D 1062
 * 6 000 000 et D 6914 9 000 000 / C 2931 15 000 000. L'écart s'entend du 106 ·
 * la provision spéciale (154), provision réglementée, n'est pas un écart de
 * capitaux propres et ne reçoit rien (décision proposée D-34).
 */
export function imputationSurEcart(
  montant: number,
  ecarts: Array<{ id: string; compteEcart: string; reste: number }>,
): { parEcart: Array<{ id: string; compteEcart: string; montant: number }>; enCharge: number } {
  let reste = centimes(montant);
  const parEcart: Array<{ id: string; compteEcart: string; montant: number }> = [];
  for (const e of ecarts) {
    if (reste <= EPSILON) break;
    if (!e.compteEcart.startsWith('106') || e.reste <= EPSILON) continue;
    const m = Math.min(reste, centimes(e.reste));
    parEcart.push({ id: e.id, compteEcart: e.compteEcart, montant: m });
    reste = centimes(reste - m);
  }
  return { parEcart, enCharge: reste };
}
