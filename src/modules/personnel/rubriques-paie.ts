import { HORS_REMUNERATION_ARTICLE_7, type NatureElementPaie } from './assiettes-paie';
import { NATURES_SANS_IMPUTATION } from './passation-paie';

/**
 * RUBRIQUES DE PAIE DU CABINET · les primes conventionnelles et indemnités
 * propres à l'entreprise (comparaison Sage, Paie et RH : « rubriques créées par
 * l'utilisateur »). Sage laisse la rubrique décider de ses assiettes ; OmegaX
 * ne le fait pas, et c'est la décision centrale.
 *
 * UNE RUBRIQUE NOMME, LA NATURE DÉCIDE. L'article 7, point 8 du Code du travail
 * range dans la rémunération « notamment » dix natures (liste OUVERTE) et en
 * sort cinq (liste FERMÉE) ; la loi n° 23/053, art. 68, rend imposables « tous
 * les avantages en argent et en nature ». Une prime conventionnelle est donc
 * de la rémunération, dans les deux assiettes. La rubrique en prend la nature,
 * et c'est la nature qui commande les assiettes (assiettes-paie.ts) et le
 * compte (passation-paie.ts) · aucune case « soumis à cotisation » ni
 * « imposable » n'existe sur une rubrique, parce que ce n'est pas au cabinet
 * de le décider.
 *
 * DEUX FAMILLES DE NATURES SONT REFUSÉES À UNE RUBRIQUE.
 *  · LES CINQ EXCLUSIONS DE L'ARTICLE 7 · une prime baptisée « transport »
 *    sortirait de l'assiette sociale sur le seul nom qu'on lui donne, et la
 *    pension du travailleur baisserait sur un bulletin dont le net ne bouge
 *    pas. Une vraie indemnité de transport se saisit avec la nature du
 *    catalogue, qui porte ses conditions (art. 69, 8, b).
 *  · LES NATURES SANS IMPUTATION (participation aux bénéfices) · une rubrique
 *    que la passation refuserait à chaque bulletin n'est pas une rubrique.
 */
// Les dix natures de la rémunération que l'article 7, point 8 énumère · les
// cinq exclusions n'y sont pas, par construction, et le test le vérifie.
export const NATURES_DES_RUBRIQUES: readonly NatureElementPaie[] = (
  [
    'SALAIRE_OU_TRAITEMENT',
    'COMMISSION',
    'INDEMNITE_DE_VIE_CHERE',
    'PRIME',
    'PARTICIPATION_AUX_BENEFICES',
    'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE',
    'PRESTATION_SUPPLEMENTAIRE',
    'AVANTAGE_EN_NATURE',
    'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE',
    'INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT',
  ] as const
).filter((n) => !NATURES_SANS_IMPUTATION[n]);

export function motifRefusRubrique(r: { code?: string; libelle?: string; nature?: string; fondement?: string }): string | null {
  if (!r.code?.trim()) return 'Le code de la rubrique est obligatoire.';
  if (!r.libelle?.trim()) return 'Le libellé de la rubrique est obligatoire.';
  if (!r.fondement?.trim()) {
    return "Le fondement est obligatoire (article de la convention collective, clause du contrat, décision de l'employeur) · c'est lui qu'un réviseur demandera avant le montant.";
  }
  const nature = r.nature as NatureElementPaie;
  if (HORS_REMUNERATION_ARTICLE_7.includes(nature)) {
    return (
      "Cette nature fait partie des cinq exclusions de l'article 7, point 8 du Code du travail · une rubrique du cabinet ne peut pas " +
      "sortir un montant de l'assiette sociale par son seul nom. Saisissez une vraie indemnité de cette nature avec l'élément du catalogue."
    );
  }
  if (NATURES_SANS_IMPUTATION[nature]) return `Nature refusée à une rubrique · ${NATURES_SANS_IMPUTATION[nature]}`;
  if (!NATURES_DES_RUBRIQUES.includes(nature)) return 'Nature de rubrique inconnue.';
  return null;
}
