import type { FormeJuridiqueSyscohada, Referentiel } from './types';

/**
 * CE QUE L'ÉCRAN DES PARAMÈTRES PROPOSE SELON LA FORME · miroir des règles du
 * serveur (`src/modules/tenant/mentions-societe.ts`), qui seul refuse.
 * Masquer n'est pas refuser (CLAUDE.md § 6) · l'écran évite seulement de
 * proposer un geste que la route rejettera.
 */

/**
 * AUSCGIE art. 269-1 · la clause de variabilité n'est ouverte qu'aux
 * « sociétés anonymes ne faisant pas appel public à l'épargne et sociétés
 * par actions simplifiées ». Miroir de `FORMES_CAPITAL_VARIABLE`.
 */
export const FORMES_CAPITAL_VARIABLE: readonly FormeJuridiqueSyscohada[] = [
  'SOCIETE_ANONYME',
  'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
];

/** Les cinq sociétés commerciales de l'AUSCGIE art. 6, que vise l'art. 17. */
const SOCIETES_COMMERCIALES: readonly FormeJuridiqueSyscohada[] = [
  'SOCIETE_ANONYME',
  'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
  'SOCIETE_RESPONSABILITE_LIMITEE',
  'SOCIETE_NOM_COLLECTIF',
  'SOCIETE_COMMANDITE_SIMPLE',
];

export const estCooperative = (forme: FormeJuridiqueSyscohada | null | undefined) => forme === 'SOCIETE_COOPERATIVE';

/** La case « À capital variable » n'est proposée qu'à la SA et à la SAS. */
export const proposeCapitalVariable = (forme: FormeJuridiqueSyscohada | null | undefined) =>
  !!forme && FORMES_CAPITAL_VARIABLE.includes(forme);

/**
 * Le champ « Adresse » est celle du SIÈGE SOCIAL pour qui l'imprime à ce titre
 * · AUSCGIE art. 17 et 23 à 25 pour une société commerciale, AUSCOOP art. 19
 * pour la coopérative. Une ville seule n'en est pas une (art. 25).
 */
export function libelleAdresse(referentiel: Referentiel | undefined, forme: FormeJuridiqueSyscohada | null | undefined): string {
  if (referentiel !== 'SYSCOHADA' || !forme) return 'Adresse';
  return SOCIETES_COMMERCIALES.includes(forme) || estCooperative(forme) ? 'Adresse du siège social' : 'Adresse';
}

/** L'une des cinq sociétés commerciales de l'AUSCGIE art. 6. */
export const estSocieteCommerciale = (forme: FormeJuridiqueSyscohada | null | undefined) =>
  !!forme && SOCIETES_COMMERCIALES.includes(forme);

/**
 * LES FAITS DE LA DÉNOMINATION QUE CHAQUE FORME PORTE · miroir des refus de
 * `TenantService.modifierIdentite`. Le mode d'administration est celui de la
 * SA (AUSCGIE art. 386 et 414), l'associé unique celui de la SAS (art. 853-2),
 * la dissolution et les liquidateurs ceux des cinq sociétés commerciales
 * (art. 203 et 204) et de la coopérative (AUSCOOP art. 183).
 */
export function faitsDeLaForme(forme: FormeJuridiqueSyscohada | null | undefined): {
  modeAdministration: boolean;
  associeUnique: boolean;
  dissolution: boolean;
} {
  return {
    modeAdministration: forme === 'SOCIETE_ANONYME',
    associeUnique: forme === 'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
    dissolution: estSocieteCommerciale(forme) || estCooperative(forme),
  };
}

export type ModeAdministrationSaisi = 'CONSEIL_ADMINISTRATION' | 'ADMINISTRATEUR_GENERAL' | 'PAS_ENCORE_DIT';
export type ReponseFaitSaisie = 'OUI' | 'NON' | 'PAS_ENCORE_DIT';

/**
 * Le corps que l'écran envoie à PATCH /dossier/identite pour une société ou
 * une coopérative · un fait n'est envoyé qu'à la forme qui le porte, sans quoi
 * la route le refuserait (ou, laissé à « pas encore dit », l'écran effacerait
 * en aveugle une réponse héritée d'une autre forme).
 */
export function faitsDeLaFormeAEnvoyer(
  forme: FormeJuridiqueSyscohada | null | undefined,
  saisie: { modeAdministrationSa: ModeAdministrationSaisi; associeUniqueSas: ReponseFaitSaisie; dateDissolution: string; liquidateurs: string },
): Record<string, string> {
  const faits = faitsDeLaForme(forme);
  return {
    ...(faits.modeAdministration ? { modeAdministrationSa: saisie.modeAdministrationSa } : {}),
    ...(faits.associeUnique ? { associeUniqueSas: saisie.associeUniqueSas } : {}),
    ...(faits.dissolution ? { dateDissolution: saisie.dateDissolution, liquidateurs: saisie.liquidateurs } : {}),
  };
}

/**
 * Une TRANSFORMATION au sens de l'AUSCGIE art. 181 change une société
 * commerciale en une autre · miroir de `motifRefusTransformation`. Ailleurs,
 * le changement de forme ne se date pas (une correction vaut pour tous les
 * exercices, et le passage vers une forme qui n'est pas une société relève de
 * l'art. 188).
 */
export const transformationDatable = (
  ancienne: FormeJuridiqueSyscohada | null | undefined,
  nouvelle: FormeJuridiqueSyscohada,
) => !!ancienne && ancienne !== nouvelle && estSocieteCommerciale(ancienne) && estSocieteCommerciale(nouvelle);
