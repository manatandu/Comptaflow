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
 * Les quatre règles ci-dessous sont lues à leur source, pas de mémoire :
 *
 *  · SYCEBNL art. 19 · trois critères ALTERNATIFS ;
 *  · AUSCGIE art. 702 · la société anonyme désigne un commissaire aux comptes
 *    SANS condition de taille ;
 *  · AUSCGIE art. 376 (SARL) et art. 853-13 (SAS) · DEUX des trois ;
 *  · AUSCGIE art. 289-1 (SNC) · DEUX des trois, à des seuils plus élevés.
 *
 * Ce que ce module ne fait PAS, et le dit : il ne traite ni la sortie de
 * l'obligation (les trois articles la subordonnent à deux exercices
 * consécutifs sous les seuils, or le contrôle ne regarde qu'un exercice), ni
 * la SAS qui contrôle ou est contrôlée par une autre société (art. 853-13
 * dernier alinéa, renvoyant à l'art. 174), ni la SCS, le GIE, la coopérative
 * ou l'entreprenant, dont aucun texte lu ne donne de seuil chiffré. Une règle
 * absente est déclarée absente · elle n'est pas remplacée par la plus proche.
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
    genre: 'DEUX_SUR_TROIS',
    source: 'AUSCGIE, article 289-1',
    seuilBilan: 250_000_000,
    seuilProduits: 500_000_000,
    libelleProduits: "Chiffre d'affaires annuel",
    seuilEffectif: 50,
  },
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
  return {
    genre: 'AUCUNE_REGLE_LUE',
    motif:
      "Aucun seuil chiffré n'a été lu dans l'AUSCGIE pour cette forme juridique · le logiciel ne mesure donc rien " +
      "plutôt que de lui appliquer le seuil d'une autre forme.",
  };
}
