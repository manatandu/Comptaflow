/**
 * LES DEUX ASSIETTES D'UN BULLETIN, ET LA RAISON POUR LAQUELLE ELLES NE SE
 * SERVENT JAMAIS L'UNE POUR L'AUTRE.
 *
 * SOURCES · Code du travail (loi n° 015/2002), article 7, point 8, pour la
 * RÉMUNÉRATION, qui est l'assiette sociale · loi n° 23/053 du 30 novembre
 * 2023, articles 68 à 71, pour l'assiette FISCALE.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA DÉCOUVERTE DE CE CHANTIER · LES DEUX LISTES D'EXCLUSION SE RESSEMBLENT
 * MOT POUR MOT, ET ELLES N'ONT PAS LA MÊME FORME.
 *
 * Le Code du travail sort CINQ choses de la rémunération, SANS AUCUNE
 * CONDITION · « Ne sont pas éléments de la rémunération : les soins de santé ;
 * l'indemnité de logement ou le logement en nature ; les allocations
 * familiales légales ; l'indemnité de transport ; les frais de voyage ainsi
 * que les avantages accordés exclusivement en vue de faciliter au travailleur
 * l'accomplissement de ses fonctions. »
 *
 * La loi fiscale nomme LES MÊMES CHOSES et les traite autrement. Son article
 * 68 les fait d'abord ENTRER dans l'imposable (« ainsi que TOUS les avantages
 * en argent et en nature »), puis son article 69 les immunise SOUS CONDITION.
 *
 * SERVIR LA LISTE SOCIALE À L'ASSIETTE FISCALE SOUS-IMPOSERAIT, sans qu'aucun
 * total du bulletin ne bouge · une indemnité de logement de 50 % du salaire
 * sort de l'assiette sociale de plein droit, et elle NE SORT PAS de l'assiette
 * fiscale, puisque la condition de l'article 69, 8, a) n'est pas remplie.
 * C'est la doctrine que le dépôt a payée à P1 : une liste d'exclusion se nomme
 * par sa FIN, jamais par sa forme.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ET LA LOI FISCALE EMPLOIE TROIS FORMULATIONS QUI NE VEULENT PAS DIRE LA MÊME
 * CHOSE. C'est elle-même qui les distingue, dans le même titre :
 *
 *  · « DANS LA LIMITE DE 5 % du revenu brut imposable » (art. 116, 1) · un
 *    PLAFOND · au-delà, seul l'excédent est repris ;
 *  · « DANS LA MESURE OÙ elles ne dépassent pas les taux légaux » (art. 69, 1)
 *    · un PLAFOND lui aussi · la mesure est ce qui reste sous le taux légal ;
 *  · « POUR AUTANT QUE l'indemnité de logement NE DÉPASSE 30 % de la
 *    rémunération » (art. 69, 8, a) · une CONDITION · remplie, l'immunité
 *    joue tout entière ; non remplie, elle ne joue pas du tout.
 *
 * LA LECTURE N'EST PAS UNE OPINION · c'est le même législateur qui écrit
 * « dans la limite de » quand il veut un plafond, à trois articles de là. Lire
 * l'article 69, 8, a) comme un plafond, ce que la pratique fait souvent,
 * reviendrait à écrire dans le texte des mots qu'il emploie ailleurs et pas
 * ici. OmegaX applique la condition, et NOMME l'autre lecture avec le montant
 * qu'elle changerait, plutôt que de trancher en silence.
 *
 * CE FICHIER NE CALCULE AUCUN IMPÔT · le barème est dans `bareme-irpp.ts`.
 * Il ne calcule aucune cotisation non plus · les taux sont au registre des
 * retenues, avec leur date d'effet.
 */

/**
 * Les natures qu'un élément de paie peut prendre. La liste d'INCLUSION du
 * Code du travail est ouverte (« Elle comprend NOTAMMENT ») ; sa liste
 * d'EXCLUSION est fermée. Une nature inconnue tombe donc DANS la rémunération,
 * conformément à la phrase qui ouvre l'article 7, point 8 · « la somme
 * représentative de l'ensemble des gains susceptibles d'être évalués en
 * espèces ». C'est le sens sûr : présumer l'exclusion minorerait l'assiette
 * sociale, donc les droits du travailleur.
 */
export type NatureElementPaie =
  // Les dix que l'article 7, point 8 énumère comme éléments de la rémunération.
  | 'SALAIRE_OU_TRAITEMENT'
  | 'COMMISSION'
  | 'INDEMNITE_DE_VIE_CHERE'
  | 'PRIME'
  | 'PARTICIPATION_AUX_BENEFICES'
  | 'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE'
  | 'PRESTATION_SUPPLEMENTAIRE'
  | 'AVANTAGE_EN_NATURE'
  | 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE'
  | 'INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT'
  // Les cinq que le même point sort de la rémunération.
  | 'SOINS_DE_SANTE'
  | 'LOGEMENT_OU_SON_INDEMNITE'
  | 'ALLOCATIONS_FAMILIALES_LEGALES'
  | 'INDEMNITE_DE_TRANSPORT'
  | 'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION';

/**
 * Les cinq exclusions de l'article 7, point 8, recopiées. La liste est FERMÉE
 * et le test la tient à cinq · y ajouter une nature retirerait des droits au
 * travailleur (l'assiette sociale commande la pension), sur un bulletin dont
 * le net ne bougerait pas.
 */
export const HORS_REMUNERATION_ARTICLE_7: readonly NatureElementPaie[] = [
  'SOINS_DE_SANTE',
  'LOGEMENT_OU_SON_INDEMNITE',
  'ALLOCATIONS_FAMILIALES_LEGALES',
  'INDEMNITE_DE_TRANSPORT',
  'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
] as const;

/** La forme que prend une immunité de l'article 69. Voir l'en-tête du fichier. */
export type FormeImmunite =
  /** « dans la mesure où » · seul l'excédent est repris. */
  | 'PLAFOND'
  /** « pour autant que » · tout ou rien. */
  | 'CONDITION'
  /** Aucune condition dans le texte. */
  | 'TOTALE';

export type ImmuniteArticle69 = {
  readonly nature: NatureElementPaie;
  readonly point: string;
  readonly forme: FormeImmunite;
  readonly texte: string;
  /**
   * Vrai lorsque la condition ne se lit dans AUCUNE donnée qu'OmegaX détient ·
   * elle doit alors être attestée par le cabinet, et l'élément est mis en
   * abstention à défaut.
   */
  readonly conditionNonVerifiableParLeLogiciel: boolean;
};

/**
 * Ce que l'article 69 immunise parmi ce qu'un employeur verse. Les points 2 à
 * 7 (pensions, militaires, policiers, pensions alimentaires, bourses) ne sont
 * pas ici · aucun n'est un élément de paie versé par un employeur ordinaire,
 * et les faire figurer les ferait proposer à la saisie.
 */
export const IMMUNITES_ARTICLE_69: readonly ImmuniteArticle69[] = [
  {
    nature: 'ALLOCATIONS_FAMILIALES_LEGALES',
    point: 'article 69, 1',
    forme: 'PLAFOND',
    texte:
      "« les indemnités ou allocations familiales réellement accordées aux employés dans la mesure où elles ne dépassent pas les taux légaux »",
    conditionNonVerifiableParLeLogiciel: false,
  },
  {
    nature: 'LOGEMENT_OU_SON_INDEMNITE',
    point: 'article 69, 8, a)',
    forme: 'CONDITION',
    texte: "« pour autant que l'indemnité de logement ne dépasse 30 % de la rémunération »",
    conditionNonVerifiableParLeLogiciel: false,
  },
  {
    nature: 'INDEMNITE_DE_TRANSPORT',
    point: 'article 69, 8, b)',
    forme: 'CONDITION',
    texte:
      "« l'indemnité journalière de transport soit égale au coût du billet pratiqué localement avec un maximum de six courses de taxi pour les cadres et six courses de bus pour les autres membres du personnel. Dans tous les cas, la réalité et la nécessité du transport alloué à l'employé doivent être démontrées »",
    conditionNonVerifiableParLeLogiciel: true,
  },
  {
    nature: 'SOINS_DE_SANTE',
    point: 'article 69, 8, c)',
    forme: 'CONDITION',
    texte: "« les frais médicaux soient justifiés par les documents probants »",
    conditionNonVerifiableParLeLogiciel: true,
  },
] as const;

/** Article 69, 8, a) · le seul chiffre que le point porte. */
export const PLAFOND_LOGEMENT_POUR_CENT = 30;

/**
 * LEQUEL DES DEUX MONTANTS EST « LE TAUX LÉGAL » DE L'ARTICLE 69, 1 ·
 * LA QUESTION EST TRANCHÉE, ET ELLE ÉTAIT MAL POSÉE.
 *
 * P2a l'avait laissée ouverte en la formulant ainsi : « le corpus porte deux
 * montants d'allocation familiale, lequel vaut ? ». La réponse est qu'il n'y
 * a PAS DEUX LECTURES D'UNE MÊME RÈGLE · IL Y A DEUX OBLIGATIONS, portées
 * par DEUX DÉBITEURS DIFFÉRENTS, qui se trouvent partager un nom.
 *
 *  · LES 8 100 FC PAR MOIS ET PAR ENFANT · arrêté ministériel n° 137/2018,
 *    article 3. Son article 4 dit ce qu'il en est : « Les allocations
 *    familiales sont SERVIES DIRECTEMENT PAR LA CAISSE par voie bancaire ou
 *    par guichet espèces. » L'arrêté n° 143/2018 le redit à son article 1er,
 *    et son article 3 achève la démonstration pour le cas exceptionnel où
 *    l'employeur paie : « LA CAISSE MET À LA DISPOSITION DE L'EMPLOYEUR
 *    chargé du paiement […] le montant total des sommes à payer ». Même
 *    alors, l'employeur est un GUICHET, jamais le débiteur. Cette somme
 *    n'est donc pas versée par l'employeur, elle n'entre pas dans le revenu
 *    professionnel de l'article 68, et il n'y a rien à immuniser.
 *
 *  · LA COLONNE 19 DES ANNEXES DU DÉCRET n° 25/22 · les « ALLOCATIONS
 *    FAMILIALES MINIMA » que le titre du décret annonce, fondées sur
 *    l'article 87 du Code du travail. Celles-là, l'EMPLOYEUR les doit.
 *    C'est cela qu'un bulletin porte, et c'est donc cela que l'article 69, 1
 *    vise.
 *
 * LE MOT QUI TRANCHE EST DANS L'ARTICLE 69, 1 LUI-MÊME · il immunise les
 * allocations familiales « RÉELLEMENT ACCORDÉES AUX EMPLOYÉS ». Une
 * prestation servie par la Caisse n'est pas accordée par l'employeur. Le
 * plafond d'une immunité se lit sur le DÉBITEUR de la somme qu'il borne.
 */
export const RESOLUTION_TAUX_LEGAL_ALLOCATIONS =
  "ARTICLE 69, 1 · le « taux légal » qui borne l'immunité est celui de la COLONNE 19 des annexes du décret " +
  "n° 25/22, converti au mois par le multiplicateur de l'article 7 et multiplié par le nombre d'enfants " +
  "bénéficiaires. Ce n'est PAS le montant de 8 100 FC de l'article 3 de l'arrêté ministériel n° 137/2018 : " +
  "celui-là est une prestation SERVIE DIRECTEMENT PAR LA CAISSE (art. 4 du même arrêté, art. 1er de " +
  "l'arrêté n° 143/2018), que l'employeur n'accorde pas et qui n'entre donc jamais dans le revenu " +
  "professionnel de l'article 68. L'article 69, 1 ne vise que ce qui est « RÉELLEMENT ACCORDÉ AUX EMPLOYÉS ».";

export type ElementPaie = {
  readonly nature: NatureElementPaie;
  readonly libelle: string;
  readonly montantFc: number;
  /**
   * Article 68, 1 · sont imposables les traitements et indemnités « QUI NE
   * REPRÉSENTENT PAS le remboursement de dépenses professionnelles
   * effectives ». C'est une QUALIFICATION du cabinet, jamais une déduction
   * d'un libellé · elle se déclare.
   */
  readonly remboursementDeDepenseProfessionnelleEffective?: boolean;
  /**
   * Articles 69, 8, b) et c) · la réalité du transport et les documents
   * probants des frais médicaux ne sont dans aucun livre. `true` atteste que
   * la condition est remplie, `false` qu'elle ne l'est pas, `null` ou absent
   * met l'élément en ABSTENTION · jamais en immunité par défaut.
   */
  readonly conditionArticle69Attestee?: boolean | null;
};

export type ElementHorsRemuneration = {
  readonly libelle: string;
  readonly montantFc: number;
  readonly motif: string;
};

export type SortFiscal = {
  readonly libelle: string;
  readonly montantFc: number;
  readonly imposableFc: number | null;
  readonly motif: string;
};

export type MotifAbstentionFiscale =
  | 'CONDITION_ARTICLE_69_NON_ATTESTEE'
  | 'TAUX_LEGAL_ALLOCATIONS_FAMILIALES_NON_FOURNI';

export type Abstention = {
  readonly motif: MotifAbstentionFiscale;
  readonly libelle: string;
  readonly montantFc: number;
  readonly explication: string;
};

export type VerdictAssiettes = {
  /**
   * La rémunération au sens de l'article 7, point 8 du Code du travail ·
   * c'est elle que les cotisations sociales frappent, et c'est elle que
   * l'arrêté n° 146/2018 reprend à son article 17.
   */
  readonly assietteSocialeFc: number;
  readonly horsRemuneration: readonly ElementHorsRemuneration[];
  /**
   * L'assiette fiscale AVANT les retenues de l'article 71 · articles 68 et 69.
   * `null` lorsqu'au moins une abstention empêche de la chiffrer.
   */
  readonly assietteFiscaleBruteFc: number | null;
  readonly sortsFiscaux: readonly SortFiscal[];
  /** Article 71 · ce qui se déduit du brut. */
  readonly retenuesArticle71Fc: number;
  /** Article 70 · la base d'imposition, nette des retenues de l'article 71. */
  readonly assietteFiscaleNetteFc: number | null;
  readonly abstentions: readonly Abstention[];
  readonly reserves: readonly string[];
};

export type ParametresAssiettes = {
  /**
   * Article 69, 1 · le « taux légal » des allocations familiales, POUR LA
   * PÉRIODE DE PAIE ET POUR L'EFFECTIF D'ENFANTS CONCERNÉ. Voir
   * `RESOLUTION_TAUX_LEGAL_ALLOCATIONS` plus bas : la question des deux
   * montants est TRANCHÉE, et c'est la colonne 19 du décret n° 25/22 qui la
   * borne. Le service le calcule ; ce champ reste ouvert pour le cas où le
   * mois de paie sort des annexes, et l'absence vaut alors abstention.
   */
  readonly tauxLegalAllocationsFamilialesFc?: number | null;
  /**
   * Article 71 · « les versements réellement effectués à titre définitif, soit
   * à des caisses de pension officielles, soit obligatoirement sous le
   * patronage de l'employeur […] en vue de la constitution au profit du
   * redevable d'une rente viagère, d'une pension, d'une assurance-maladie ou
   * d'une assurance-chômage ». La quote-part ouvrière de la CNSS y entre : le
   * régime général est une caisse de pension officielle et le versement est
   * définitif. C'est le texte qui le dit, pas le livre de cours.
   */
  readonly retenuesArticle71Fc?: number;
};

const estHorsRemuneration = (nature: NatureElementPaie): boolean =>
  HORS_REMUNERATION_ARTICLE_7.includes(nature);

const MOTIF_HORS_REMUNERATION: Readonly<Record<string, string>> = {
  SOINS_DE_SANTE: 'les soins de santé',
  LOGEMENT_OU_SON_INDEMNITE: "l'indemnité de logement ou le logement en nature",
  ALLOCATIONS_FAMILIALES_LEGALES: 'les allocations familiales légales',
  INDEMNITE_DE_TRANSPORT: "l'indemnité de transport",
  FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION:
    "les frais de voyage ainsi que les avantages accordés exclusivement en vue de faciliter au travailleur l'accomplissement de ses fonctions",
};

/**
 * L'ASSIETTE SOCIALE · article 7, point 8 du Code du travail, repris par
 * l'article 17 de l'arrêté ministériel n° 146/2018.
 *
 * Elle est INCONDITIONNELLE. Aucune des cinq exclusions ne porte de seuil, de
 * plafond ni de justification à produire · leur montant ne change rien, leur
 * nature suffit. C'est exactement ce qui la distingue de l'assiette fiscale,
 * et le seul moyen de ne pas les confondre est de ne jamais les calculer au
 * même endroit.
 */
export function assietteSociale(elements: readonly ElementPaie[]): {
  montantFc: number;
  horsRemuneration: readonly ElementHorsRemuneration[];
} {
  const horsRemuneration: ElementHorsRemuneration[] = [];
  let montantFc = 0;

  for (const element of elements) {
    if (estHorsRemuneration(element.nature)) {
      horsRemuneration.push({
        libelle: element.libelle,
        montantFc: element.montantFc,
        motif:
          "Article 7, point 8 du Code du travail · ne sont pas éléments de la rémunération " +
          `${MOTIF_HORS_REMUNERATION[element.nature]}. L'exclusion ne porte aucune condition.`,
      });
      continue;
    }
    montantFc += element.montantFc;
  }

  return { montantFc, horsRemuneration };
}

/**
 * LES DEUX ASSIETTES, RENDUES ENSEMBLE POUR QU'ON VOIE QU'ELLES DIFFÈRENT.
 *
 * L'ordre de calcul est celui que le livre de cours de P0 donnait et que les
 * textes confirment · brut, puis assiette sociale, puis cotisations, puis
 * assiette fiscale NETTE de ces cotisations (art. 70 et 71), puis barème.
 * Le calculer dans l'autre sens surestime l'impôt de tout ce que l'article 71
 * laisse déduire.
 */
export function assiettes(
  elements: readonly ElementPaie[],
  parametres: ParametresAssiettes = {},
): VerdictAssiettes {
  const sociale = assietteSociale(elements);
  const sortsFiscaux: SortFiscal[] = [];
  const abstentions: Abstention[] = [];
  const reserves: string[] = [];

  let brutFiscalFc = 0;
  let indetermine = false;

  for (const element of elements) {
    // Article 68, 1 · un remboursement de dépenses professionnelles EFFECTIVES
    // n'entre pas dans les traitements imposables. Il ne s'agit pas d'une
    // immunité de l'article 69 : la somme n'est pas un revenu.
    if (element.remboursementDeDepenseProfessionnelleEffective === true) {
      sortsFiscaux.push({
        libelle: element.libelle,
        montantFc: element.montantFc,
        imposableFc: 0,
        motif:
          "Article 68, 1 · sont imposables les traitements et indemnités « qui ne représentent pas le remboursement de dépenses professionnelles effectives ». Le caractère effectif est qualifié par le cabinet.",
      });
      continue;
    }

    const immunite = IMMUNITES_ARTICLE_69.find((i) => i.nature === element.nature);

    if (!immunite) {
      // Article 68 · tout le reste est imposable, avantages en nature compris,
      // « comptés pour leur valeur réelle » (dernier alinéa).
      brutFiscalFc += element.montantFc;
      sortsFiscaux.push({
        libelle: element.libelle,
        montantFc: element.montantFc,
        imposableFc: element.montantFc,
        motif:
          "Article 68 · imposable. L'article 69 ferme sa liste d'immunités, et cette nature n'y figure pas.",
      });
      continue;
    }

    if (immunite.forme === 'PLAFOND') {
      // Article 69, 1 · « dans la mesure où elles ne dépassent pas les taux
      // légaux ». Seul l'excédent est repris.
      const tauxLegal = parametres.tauxLegalAllocationsFamilialesFc;
      if (tauxLegal === undefined || tauxLegal === null) {
        indetermine = true;
        abstentions.push({
          motif: 'TAUX_LEGAL_ALLOCATIONS_FAMILIALES_NON_FOURNI',
          libelle: element.libelle,
          montantFc: element.montantFc,
          explication:
            `${immunite.point} immunise les allocations familiales ${immunite.texte}. Le « taux légal » est la ` +
            "colonne 19 du décret n° 25/22 (voir RESOLUTION_TAUX_LEGAL_ALLOCATIONS), mais AUCUNE ANNEXE DE CE DÉCRET NE " +
            "COUVRE CE MOIS DE PAIE, ou le nombre d'enfants bénéficiaires n'est pas renseigné. Le plafond ne se place donc pas.",
        });
        sortsFiscaux.push({
          libelle: element.libelle,
          montantFc: element.montantFc,
          imposableFc: null,
          motif: `${immunite.point} · plafond non chiffrable, voir l'abstention.`,
        });
        continue;
      }
      const excedent = Math.max(0, element.montantFc - tauxLegal);
      brutFiscalFc += excedent;
      sortsFiscaux.push({
        libelle: element.libelle,
        montantFc: element.montantFc,
        imposableFc: excedent,
        motif:
          `${immunite.point} · ${immunite.texte}. Taux légal retenu : ${tauxLegal.toFixed(2)} FC. ` +
          (excedent > 0
            ? `Seul l'excédent de ${excedent.toFixed(2)} FC est imposable.`
            : "L'allocation est entièrement immunisée."),
      });
      continue;
    }

    // Forme CONDITION · tout ou rien.
    if (immunite.conditionNonVerifiableParLeLogiciel) {
      const atteste = element.conditionArticle69Attestee;
      if (atteste === undefined || atteste === null) {
        indetermine = true;
        abstentions.push({
          motif: 'CONDITION_ARTICLE_69_NON_ATTESTEE',
          libelle: element.libelle,
          montantFc: element.montantFc,
          explication:
            `${immunite.point} n'immunise que ${immunite.texte}. Cette condition n'est dans aucun livre comptable : ` +
            "elle se constate sur pièces, et le cabinet l'atteste. Sans attestation, OmegaX ne l'immunise pas de lui-même et ne l'impose pas non plus.",
        });
        sortsFiscaux.push({
          libelle: element.libelle,
          montantFc: element.montantFc,
          imposableFc: null,
          motif: `${immunite.point} · condition non attestée, voir l'abstention.`,
        });
        continue;
      }
      const imposableFc = atteste ? 0 : element.montantFc;
      brutFiscalFc += imposableFc;
      sortsFiscaux.push({
        libelle: element.libelle,
        montantFc: element.montantFc,
        imposableFc,
        motif: atteste
          ? `${immunite.point} · condition attestée par le cabinet, l'immunité joue.`
          : `${immunite.point} · condition NON remplie, l'immunité ne joue pas. Le montant entier est imposable (${immunite.forme.toLowerCase()}, non plafond).`,
      });
      continue;
    }

    // Article 69, 8, a) · la seule condition que le logiciel sait vérifier.
    const plafondFc = (sociale.montantFc * PLAFOND_LOGEMENT_POUR_CENT) / 100;
    const conditionRemplie = element.montantFc <= plafondFc;
    const imposableFc = conditionRemplie ? 0 : element.montantFc;
    brutFiscalFc += imposableFc;
    sortsFiscaux.push({
      libelle: element.libelle,
      montantFc: element.montantFc,
      imposableFc,
      motif:
        `${immunite.point} · ${immunite.texte}. Plafond de comparaison : ${plafondFc.toFixed(2)} FC. ` +
        (conditionRemplie
          ? "La condition est remplie, l'immunité joue tout entière."
          : "La condition n'est PAS remplie, et le point est écrit « pour autant que », non « dans la limite de » : l'immunité ne joue pas du tout, le montant entier est imposable."),
    });
    if (!conditionRemplie) {
      reserves.push(
        "LECTURE DE L'ARTICLE 69, 8, a) · le point immunise le logement « POUR AUTANT QUE » l'indemnité ne " +
          "dépasse 30 % de la rémunération, quand l'article 116 de la même loi écrit « DANS LA LIMITE DE » lorsqu'il " +
          "veut un plafond. OmegaX impose donc le montant ENTIER. Lu comme un plafond, seul l'excédent de " +
          `${(element.montantFc - plafondFc).toFixed(2)} FC le serait. Le point n'est tranché par aucune source lue.`,
      );
    }
    reserves.push(
      "BASE DES 30 % · l'article 69, 8, a) dit « de la rémunération » sans la définir. OmegaX la prend au sens de " +
        "l'article 7, point 8 du Code du travail, qui en exclut justement le logement, soit " +
        `${sociale.montantFc.toFixed(2)} FC. Une lecture qui y inclurait le logement élargirait le plafond.`,
    );
  }

  const retenuesArticle71Fc = Math.max(0, parametres.retenuesArticle71Fc ?? 0);
  const assietteFiscaleBruteFc = indetermine ? null : brutFiscalFc;
  const assietteFiscaleNetteFc =
    assietteFiscaleBruteFc === null
      ? null
      : Math.max(0, assietteFiscaleBruteFc - retenuesArticle71Fc);

  if (retenuesArticle71Fc > 0) {
    reserves.push(
      "ARTICLE 71 · les retenues déduites sont « les versements réellement effectués à titre définitif, soit à des " +
        "caisses de pension officielles, soit obligatoirement sous le patronage de l'employeur ». La quote-part " +
        "ouvrière de la CNSS y entre, le régime général de la loi n° 16/009 étant une caisse de pension officielle. " +
        "Les cotisations patronales n'y entrent pas : elles ne sont pas retenues sur le revenu du travailleur.",
    );
  }

  return {
    assietteSocialeFc: sociale.montantFc,
    horsRemuneration: sociale.horsRemuneration,
    assietteFiscaleBruteFc,
    sortsFiscaux,
    retenuesArticle71Fc,
    assietteFiscaleNetteFc,
    abstentions,
    reserves: [...new Set(reserves)],
  };
}
