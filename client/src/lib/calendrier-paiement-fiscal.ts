import type { RegimeImposition } from './types';

/**
 * CALENDRIER LÉGAL DE PAIEMENT DE L'IMPÔT, PAR RÉGIME.
 *
 * CE QUI ÉTAIT FAUX, ET POURQUOI RIEN NE LE VOYAIT. L'écran de fiscalité
 * écrivait « art. 57 bis LPF · 30 % le 25 juillet, 30 % le 25 septembre,
 * 20 % le 25 novembre » EN DUR, hors de toute condition de régime, sous le
 * champ des versements déjà effectués. La phrase est juste pour un redevable
 * de l'impôt sur les sociétés et pour une personne physique au régime réel ;
 * elle est fausse pour une petite entreprise, qui relève de l'alinéa 3 de
 * l'art. 57 et de l'art. 57 quater, et qui paie en DEUX quotités ; elle n'a
 * aucun objet pour une micro-entreprise. Aucun type ne l'attrapait, aucun
 * test non plus : un texte d'interface n'a pas de contrat.
 *
 * D'où ce module, à la place d'un littéral logé dans le JSX : le calendrier
 * devient une valeur indexée par le régime, donc une chose qu'un test peut
 * interroger régime par régime.
 *
 * LES TEXTES, DANS L'ORDRE OÙ ILS S'APPLIQUENT.
 *
 * · Art. 57 bis LPF (loi de finances n° 25/060) vise « les acomptes
 *   provisionnels visés à l'article 57, ALINÉA 2 ». Cet alinéa 2 ne couvre
 *   que l'impôt sur les sociétés et l'IRPP au régime réel. Trois acomptes de
 *   30 %, 30 % et 20 %, à verser au plus tard les 25 juillet, 25 septembre
 *   et 25 novembre · la rédaction de 2023 disait « avant le 1er août, le
 *   1er octobre, le 1er décembre », ce n'est plus le texte en vigueur.
 *
 * · Art. 57, al. 3 et art. 57 quater LPF : la petite entreprise acquitte son
 *   impôt en deux quotités, 60 % puis 40 %, la première au plus tard le
 *   31 janvier de l'année qui suit celle de la réalisation des revenus. Ce
 *   n'est pas un acompte sur l'exercice suivant, c'est le paiement de cet
 *   impôt-ci, ce que le libellé de la ligne doit dire.
 *
 * · La micro-entreprise ne reçoit ni acompte ni quotité : aucun des deux
 *   textes ne la vise. Le calendrier vaut donc `null`, et l'écran n'affiche
 *   RIEN plutôt qu'un article emprunté à un autre régime. Un champ de
 *   versements reste ouvert · ce qui a été payé a été payé, et se déduit du
 *   solde quel que soit le régime.
 */
export interface MentionCalendrierPaiement {
  /** Intitulé de la ligne des versements déjà effectués. */
  libelleVersements: string;
  /**
   * Rappel du calendrier légal sous ce libellé, ou `null` quand aucun texte
   * n'en impose un au régime. Ne jamais y substituer une valeur de repli :
   * une phrase par défaut redeviendrait la phrase en dur qu'on retire ici.
   */
  calendrier: string | null;
}

const ACOMPTES_ARTICLE_57_BIS =
  'art. 57 bis LPF · 30 % le 25 juillet, 30 % le 25 septembre, 20 % le 25 novembre';

const QUOTITES_ARTICLE_57_QUATER =
  'art. 57, al. 3 et 57 quater LPF · 60 % au plus tard le 31 janvier, 40 % ensuite';

const CALENDRIER_PAR_REGIME: Record<RegimeImposition, MentionCalendrierPaiement> = {
  IMPOT_SOCIETES: {
    libelleVersements: 'Acomptes provisionnels déjà versés',
    calendrier: ACOMPTES_ARTICLE_57_BIS,
  },
  IRPP_REGIME_REEL: {
    libelleVersements: 'Acomptes provisionnels déjà versés',
    calendrier: ACOMPTES_ARTICLE_57_BIS,
  },
  IRPP_PETITE_ENTREPRISE: {
    libelleVersements: 'Quotités déjà versées',
    calendrier: QUOTITES_ARTICLE_57_QUATER,
  },
  IRPP_MICRO_ENTREPRISE: {
    libelleVersements: 'Versements déjà effectués sur cet impôt',
    calendrier: null,
  },
};

/** Le libellé et le calendrier à afficher sous la ligne des versements. */
export function mentionCalendrierPaiement(regime: RegimeImposition): MentionCalendrierPaiement {
  return CALENDRIER_PAR_REGIME[regime];
}

/**
 * Les régimes auxquels l'art. 57 bis sert des acomptes. Sert au test, et
 * dit dans le code ce que l'alinéa 2 couvre.
 */
export const REGIMES_AUX_ACOMPTES: ReadonlyArray<RegimeImposition> = ['IMPOT_SOCIETES', 'IRPP_REGIME_REEL'];
