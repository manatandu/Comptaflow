/**
 * LE COMPOSANT NON IDENTIFIÉ À L'ORIGINE (lot 8) · règles pures.
 *
 * AUDCIF Titre VIII ch. 4 § 4.2 · « Il peut arriver, pendant l'utilisation de
 * l'immobilisation, qu'un REMPLACEMENT IMPRÉVU soit nécessaire. Si aucun
 * composant n'avait été identifié, IL FAUT REVOIR LA DÉCOMPOSITION. » Le
 * nouvel élément s'immobilise sur une ligne distincte avec son propre plan.
 *
 * LA PARTIE REMPLACÉE SORT DE LA STRUCTURE (décision de Manasse du
 * 2026-10-01, D-19). Le § 4.2 ne dit que l'entrée ; laissée dans la
 * structure, l'ancienne pièce resterait au bilan à côté de la nouvelle, et le
 * même élément serait compté deux fois. L'art. 38-2 décomptabilise la
 * révision précédente, et le § 4.1 sort la valeur nette du composant
 * remplacé · même règle ici, une fois la décomposition revue.
 *
 * SA VALEUR D'ORIGINE S'ESTIME, ELLE NE SE DEVINE PAS. Le cabinet la déclare
 * avec l'une des quatre voies du § 3.1.2 (« décomposition non validée par des
 * pièces justificatives ») et sa source · répartition du coût actuel à neuf
 * selon les données techniques ; pourcentage constaté sur des immobilisations
 * récentes ou rénovées ; informations des fournisseurs ; pièces des dépenses
 * effectives de renouvellement. La dernière « pourrait avoir comme
 * conséquence de SURÉVALUER la valeur des composants [...] et même, parfois,
 * d'aboutir à une "structure" [...] de VALEUR NULLE. Des correctifs de valeur
 * des composants sont, dans ce cas, NÉCESSAIRES » · elle est admise et
 * l'avertissement est rendu, et une estimation qui viderait la structure est
 * refusée.
 *
 * LES AMORTISSEMENTS SUIVENT AU PRORATA · la partie a été amortie avec la
 * structure, sur le même plan · cumul à l'ouverture × valeur estimée ÷
 * valeur d'origine de la structure. L'annuité de l'exercice, jusqu'à la date
 * du remplacement, est celle que la sortie calcule.
 */

const centimes = (x: number) => Math.round(x * 100) / 100;

export type MethodeEstimationPartie =
  | 'COUT_ACTUEL_A_NEUF'
  | 'POURCENTAGE_IMMOBILISATIONS_RECENTES'
  | 'INFORMATIONS_FOURNISSEURS'
  | 'DEPENSES_DE_RENOUVELLEMENT';

export const LIBELLE_METHODE_PARTIE: Record<MethodeEstimationPartie, string> = {
  COUT_ACTUEL_A_NEUF: 'répartition du coût actuel à neuf selon les données techniques',
  POURCENTAGE_IMMOBILISATIONS_RECENTES: 'pourcentage constaté sur des immobilisations récentes ou rénovées',
  INFORMATIONS_FOURNISSEURS: 'informations obtenues des fournisseurs',
  DEPENSES_DE_RENOUVELLEMENT: 'pièces des dépenses effectives de renouvellement',
};

export const AVERTISSEMENT_DEPENSES_RENOUVELLEMENT =
  "Estimée sur la dépense de renouvellement, la partie remplacée « pourrait » être surévaluée (AUDCIF Titre VIII ch. 4 § 3.1.2) · vérifiez que la structure garde une valeur cohérente avec ce qu'elle porte encore.";

export interface StructureADecomposer {
  valeurOrigine: number;
  valeurResiduelle: number;
  /** Dotations des exercices antérieurs + amortissement antérieur − amortissements déjà détachés. */
  cumulOuverture: number;
  estComposant: boolean;
  modeLineaire: boolean;
  /** Dépréciation nette inscrite au 29 sur la structure. */
  cumulDepreciation: number;
  degressifOuDerogatoire: boolean;
  /** Entrée par un fonds (14, 167, 171, 172) ou portant une subvention rattachée. */
  financeeParUnFonds: boolean;
  /** La dotation de l'exercice du remplacement, ou d'un exercice postérieur, est passée. */
  dotationDejaPassee: boolean;
  enService: boolean;
}

export function detacherPartieRemplacee(
  s: StructureADecomposer,
  o: { valeurEstimee: number; methode: MethodeEstimationPartie; source: string },
): { valeurPartie: number; amortissementsPartie: number; avertissement: string | null } | { motif: string } {
  if (!s.enService) return { motif: 'La structure est sortie · elle ne reçoit plus de remplacement.' };
  if (s.estComposant) {
    return {
      motif:
        "Ce bien est déjà un composant · son remplacement se passe par le renouvellement du composant (AUDCIF Titre VIII ch. 4 § 4.1), pas par une nouvelle décomposition.",
    };
  }
  if (!s.modeLineaire) {
    return { motif: "La partie remplacée se détache d'une structure amortie en linéaire · aux unités d'œuvre, le prorata du cumul n'a pas de sens. Passez l'opération à la main." };
  }
  if (s.cumulDepreciation > 0.005) {
    return { motif: 'La structure porte une dépréciation (29) · la part de la partie remplacée ne se répartit pas d\'office. Passez l\'opération à la main.' };
  }
  if (s.degressifOuDerogatoire) {
    return { motif: "La structure est au dégressif fiscal ou porte un amortissement dérogatoire (151) · sa part ne se répartit pas d'office. Passez l'opération à la main." };
  }
  if (s.financeeParUnFonds) {
    return { motif: "La structure est financée par un fonds ou une subvention rattachée · la reprise de la part sortie ne se répartit pas d'office. Passez l'opération à la main." };
  }
  if (s.dotationDejaPassee) {
    return {
      motif:
        "La dotation de l'exercice du remplacement est déjà passée sur la structure · la partie remplacée doit sortir avant, sinon son annuité serait comptée deux fois.",
    };
  }
  if (!o.source?.trim()) {
    return { motif: "Indiquez la source de l'estimation (données techniques, immobilisation de référence, fournisseur, pièce de renouvellement) · AUDCIF Titre VIII ch. 4 § 3.1.2." };
  }
  const valeurPartie = centimes(o.valeurEstimee);
  if (!(valeurPartie > 0)) return { motif: 'La valeur d\'origine estimée de la partie remplacée est positive.' };
  if (valeurPartie >= centimes(s.valeurOrigine - s.valeurResiduelle)) {
    return {
      motif:
        "L'estimation absorbe toute la base de la structure · « une \"structure\" de l'immobilisation principale de valeur nulle » appelle des correctifs (AUDCIF Titre VIII ch. 4 § 3.1.2). Revoyez l'estimation.",
    };
  }
  const amortissementsPartie = s.valeurOrigine > 0 ? centimes((Math.max(0, s.cumulOuverture) * valeurPartie) / s.valeurOrigine) : 0;
  return {
    valeurPartie,
    amortissementsPartie,
    avertissement: o.methode === 'DEPENSES_DE_RENOUVELLEMENT' ? AVERTISSEMENT_DEPENSES_RENOUVELLEMENT : null,
  };
}

/**
 * LE CUMUL HORS DOTATIONS D'UNE FICHE · ce qui a été amorti avant OmegaX,
 * moins ce qui est parti avec une partie détachée. Un seul calcul pour tous
 * les lecteurs du cumul · une fiche dont on aurait oublié de retrancher la
 * part détachée verrait sa valeur nette minorée et son plan finir trop tôt.
 */
export function amortissementsHorsDotations(i: {
  amortissementAnterieur: unknown;
  amortissementsDetaches?: unknown;
}): number {
  return Math.max(0, Number(i.amortissementAnterieur ?? 0)) - Number(i.amortissementsDetaches ?? 0);
}
