import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';

/**
 * QUI DOIT DÉSIGNER UN CONTRÔLEUR DES COMPTES, ET SOUS QUELLES CONDITIONS.
 *
 * Le contrôle vivait en dur sur l'article 19 du SYCEBNL et le servait à tout
 * dossier. Une SARL recevait donc les seuils d'une association, avec le nom
 * d'un référentiel qui n'est pas le sien · et dans le sens le plus fâcheux,
 * puisque les critères du SYCEBNL sont ALTERNATIFS (un seul suffit) là où
 * l'AUSCGIE en demande DEUX sur trois, avec des montants plus élevés. Le
 * logiciel alertait donc une entreprise bien en deçà de son obligation
 * réelle, et il l'aurait laissée tranquille si elle avait franchi la sienne
 * autrement.
 *
 * Les règles ci-dessous sont lues à leur source, pas de mémoire :
 *
 *  · SYCEBNL art. 19 · trois critères ALTERNATIFS ;
 *  · AUSCGIE art. 702 · la société anonyme désigne un commissaire aux comptes
 *    SANS condition de taille ;
 *  · AUSCGIE art. 376 (SARL) et art. 853-13 (SAS) · DEUX des trois ;
 *  · AUSCGIE art. 289-1 (SNC) · DEUX des trois, à des seuils plus élevés ;
 *  · AUSCGIE art. 293-1 (SCS) · « Les dispositions relatives aux sociétés en
 *    nom collectif sont applicables aux sociétés en commandite simple, sous
 *    réserve des règles prévues au présent livre », et le livre de la SCS
 *    (art. 293 à 308) ne porte aucune règle sur le commissaire aux comptes ·
 *    l'art. 289-1 lui vaut donc tel quel. Elle a longtemps été déclarée
 *    « sans seuil lu », lacune déclarée à tort dans le sens qui dispense ;
 *  · AUSCGIE art. 875 et 880 (GIE) · aucun seuil, le contrôle est celui du
 *    contrat, SAUF émission d'obligations, où un commissaire aux comptes est
 *    obligatoire, nommé pour six exercices. L'émission se lit au compte 161
 *    « Emprunts obligataires » ;
 *  · AUSCOOP art. 121 (coopérative) · trois conditions pour la COOP-CA, et
 *    désignation facultative pour la SCOOPS. OmegaX ne la mesure pas, et dit
 *    pourquoi (`MOTIF_COOPERATIVE`) · ce n'est PAS l'AUSCGIE, que l'AUSCOOP
 *    art. 1er al. 3 écarte.
 *
 * LA SORTIE DE L'OBLIGATION n'est pas traitée · les art. 376, 853-13 et
 * 289-1 disent tous que la société n'est plus tenue « dès lors qu'elle n'a
 * pas rempli deux (2) des conditions fixées ci-dessus pendant les deux (2)
 * exercices précédant l'expiration du mandat du commissaire aux comptes ».
 * Deux exercices sous les seuils au milieu d'un mandat ne libèrent donc rien,
 * et le contrôle ne regarde qu'un exercice. Ne sont pas traitées non plus la
 * SAS qui contrôle ou est contrôlée par une autre société (art. 853-13
 * dernier alinéa, renvoyant à l'art. 174), ni l'entreprenant, dont aucun
 * texte lu ne donne de seuil chiffré. Une règle absente est déclarée
 * absente · elle n'est pas remplacée par la plus proche.
 *
 * LES MONTANTS NE SE COMPARENT PAS BRUTS. Les seuils sont écrits en francs
 * CFA, le dossier est tenu en francs congolais (loi n° 23/053 art. 141, 1° ;
 * AUDCIF art. 17, 1°). Voir `seuilsAuditeur` · sans équivalent établi, les
 * deux critères monétaires ne sont PAS mesurés.
 */
export type RegleAuditeur =
  | {
      genre: 'ALTERNATIF';
      source: string;
      seuilBilan: number;
      seuilProduits: number;
      libelleProduits: string;
      seuilEffectif: number;
    }
  | {
      genre: 'DEUX_SUR_TROIS';
      source: string;
      seuilBilan: number;
      seuilProduits: number;
      libelleProduits: string;
      seuilEffectif: number;
    }
  | { genre: 'TOUJOURS'; source: string; motif: string }
  | { genre: 'AUCUNE_REGLE_LUE'; motif: string };

/** Acte uniforme SYCEBNL du 22 décembre 2022, art. 19. Sanctions : art. 24 à 27. */
export const REGLE_SYCEBNL: RegleAuditeur = {
  genre: 'ALTERNATIF',
  source: 'Acte uniforme SYCEBNL du 22 décembre 2022, article 19 (sanctions : articles 24 à 27)',
  seuilBilan: 100_000_000,
  seuilProduits: 200_000_000,
  libelleProduits: 'Ressources annuelles',
  seuilEffectif: 20,
};

/**
 * SARL (art. 376) et SAS (art. 853-13) · les deux articles posent les MÊMES
 * trois conditions, mot pour mot, et la même règle de deux sur trois.
 */
const DEUX_SUR_TROIS_125_250: Omit<Extract<RegleAuditeur, { genre: 'DEUX_SUR_TROIS' }>, 'source'> = {
  genre: 'DEUX_SUR_TROIS',
  seuilBilan: 125_000_000,
  seuilProduits: 250_000_000,
  libelleProduits: "Chiffre d'affaires annuel",
  seuilEffectif: 50,
};

/**
 * SNC (art. 289-1), et SCS par le renvoi de l'art. 293-1 · mêmes critères,
 * seuils plus élevés que la SARL.
 */
const DEUX_SUR_TROIS_250_500: Omit<Extract<RegleAuditeur, { genre: 'DEUX_SUR_TROIS' }>, 'source'> = {
  genre: 'DEUX_SUR_TROIS',
  seuilBilan: 250_000_000,
  seuilProduits: 500_000_000,
  libelleProduits: "Chiffre d'affaires annuel",
  seuilEffectif: 50,
};

const REGLES_SYSCOHADA: Partial<Record<FormeJuridiqueSyscohada, RegleAuditeur>> = {
  // « Les sociétés anonymes ne faisant pas publiquement appel à l'épargne sont
  // tenues de designer un commissaire aux comptes et un suppléant. » Aucune
  // condition de taille : la mesure des seuils n'a pas lieu d'être.
  [FormeJuridiqueSyscohada.SOCIETE_ANONYME]: {
    genre: 'TOUJOURS',
    source: 'AUSCGIE, article 702',
    motif:
      "Toute société anonyme désigne un commissaire aux comptes et un suppléant, sans condition de taille · deux et " +
      "deux suppléants si elle fait publiquement appel à l'épargne.",
  },
  [FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE]: {
    ...DEUX_SUR_TROIS_125_250,
    source: 'AUSCGIE, article 376',
  },
  [FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE]: {
    ...DEUX_SUR_TROIS_125_250,
    source: 'AUSCGIE, article 853-13',
  },
  [FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF]: {
    ...DEUX_SUR_TROIS_250_500,
    source: 'AUSCGIE, article 289-1',
  },
  // Art. 293-1 · les dispositions de la SNC s'appliquent à la SCS « sous
  // réserve des règles prévues au présent livre », qui n'en porte aucune sur
  // le commissaire aux comptes. Même règle que la SNC, par ce renvoi.
  [FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE]: {
    ...DEUX_SUR_TROIS_250_500,
    source: "AUSCGIE, article 289-1, applicable par l'article 293-1",
  },
};

/**
 * AUSCOOP art. 121 · « Les sociétés coopératives avec conseil
 * d'administration sont tenues de désigner au moins un commissaire aux
 * comptes lorsqu'elles remplissent les conditions suivantes : nombre total de
 * coopérateurs supérieur à mille ; chiffre d'affaire supérieur à cent
 * millions ; total de bilan supérieur à cinq millions. […] La désignation d'un
 * commissaire aux comptes est facultative pour la société coopérative
 * simplifiée. »
 *
 * Rien n'est mesuré, pour deux raisons que le dossier ou le texte imposent :
 * la forme du dossier ne distingue pas la SCOOPS de la COOP-CA (un fait à
 * déclarer, jamais à déduire), et l'article n'écrit l'unité monétaire d'aucun
 * de ses deux montants. Le nombre de coopérateurs n'est d'ailleurs dans aucun
 * livre.
 */
export const MOTIF_COOPERATIVE =
  "AUSCOOP, article 121 · la société coopérative avec conseil d'administration désigne au moins un commissaire aux " +
  'comptes lorsqu’elle compte plus de mille coopérateurs, un chiffre d’affaires supérieur à cent millions et un ' +
  'total de bilan supérieur à cinq millions ; la désignation est facultative pour la société coopérative simplifiée. ' +
  'OmegaX ne le mesure pas · le dossier ne dit pas s’il s’agit d’une SCOOPS ou d’une COOP-CA, et l’article n’écrit ' +
  'pas l’unité monétaire de ses deux montants.';

/**
 * AUSCGIE art. 880, al. 1er · « Le contrôle de la gestion et le contrôle des
 * états financiers de synthèse sont exercés dans les conditions prévues par
 * le contrat. » Toutefois, dès que le GIE émet des obligations (art. 875), le
 * contrôle des états financiers « doit être exercé par un (1) ou plusieurs
 * commissaires aux comptes […] nommé par l'assemblée pour une durée de six (6)
 * exercices ».
 */
export const MOTIF_GIE_SANS_OBLIGATIONS =
  'AUSCGIE, article 880 · le contrôle des états financiers du groupement est exercé dans les conditions prévues par ' +
  'le contrat · un commissaire aux comptes n’est obligatoire que si le groupement émet des obligations (articles 875 ' +
  'et 880), ce qui se lit au compte 161 « Emprunts obligataires ».';

export const REGLE_GIE_EMETTEUR: RegleAuditeur = {
  genre: 'TOUJOURS',
  source: 'AUSCGIE, articles 875 et 880',
  motif:
    "Le groupement émet des obligations (compte 161 « Emprunts obligataires ») · le contrôle de ses états " +
    "financiers est exercé par un ou plusieurs commissaires aux comptes nommés par l'assemblée pour six " +
    'exercices, avec le statut du commissaire aux comptes de société anonyme.',
};

/**
 * Règle applicable à un dossier · le référentiel d'abord, la forme juridique
 * ensuite. Une forme sans règle lue rend `AUCUNE_REGLE_LUE` plutôt que la
 * règle d'une forme voisine : mieux vaut ne rien annoncer qu'annoncer le seuil
 * d'autrui.
 */
export function regleAuditeur(
  referentiel: Referentiel,
  formeSyscohada: FormeJuridiqueSyscohada | null,
  // GIE seulement · le compte 161 porte-t-il un solde ? `null` quand la
  // question n'a pas été posée aux livres (lecture sans exercice).
  gieEmetDesObligations: boolean | null = null,
): RegleAuditeur {
  if (referentiel === Referentiel.SYCEBNL) return REGLE_SYCEBNL;
  if (!formeSyscohada) {
    return {
      genre: 'AUCUNE_REGLE_LUE',
      motif:
        "La forme juridique du dossier n'est pas renseignée · l'obligation de désigner un commissaire aux comptes en " +
        'dépend entièrement. Renseignez-la dans Structure → Paramètres du dossier.',
    };
  }
  const regle = REGLES_SYSCOHADA[formeSyscohada];
  if (regle) return regle;
  if (formeSyscohada === FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE) {
    if (gieEmetDesObligations) return REGLE_GIE_EMETTEUR;
    return {
      genre: 'AUCUNE_REGLE_LUE',
      motif:
        gieEmetDesObligations === false
          ? `${MOTIF_GIE_SANS_OBLIGATIONS} Il ne porte aucun solde sur l'exercice.`
          : MOTIF_GIE_SANS_OBLIGATIONS,
    };
  }
  if (formeSyscohada === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) {
    return { genre: 'AUCUNE_REGLE_LUE', motif: MOTIF_COOPERATIVE };
  }
  return {
    genre: 'AUCUNE_REGLE_LUE',
    motif:
      "Aucun seuil chiffré n'a été lu dans l'AUSCGIE pour cette forme juridique · le logiciel ne mesure donc rien " +
      "plutôt que de lui appliquer le seuil d'une autre forme.",
  };
}
