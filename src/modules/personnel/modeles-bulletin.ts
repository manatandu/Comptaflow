import { HORS_REMUNERATION_ARTICLE_7, type NatureElementPaie } from './assiettes-paie';

/**
 * BULLETINS MODÈLES · Sage Paie les décrit comme des « gabarits de rubriques
 * pré-activées par catégorie de salarié (cadre/employé) » (skill sage-i7). La
 * définition est celle d'OmegaX : une liste nommée d'éléments (nature,
 * libellé, rubrique du cabinet, montant facultatif) qui PRÉ-REMPLIT la saisie
 * d'une paie. Rien de plus.
 *
 * QUATRE RÈGLES À NE PAS DÉFAIRE.
 *  1. UN MODÈLE PRÉ-REMPLIT, IL NE DÉCIDE RIEN · la simulation et l'émission
 *     rejouent tout (nature relue sur la rubrique, assiettes, barème). Un
 *     modèle faux produit une saisie à corriger, jamais un bulletin faux.
 *  2. LA RUBRIQUE DÉCIDE DE LA NATURE, dans le modèle comme au bulletin · une
 *     ligne rattachée à une rubrique prend sa nature, et une rubrique
 *     désactivée ou d'un autre dossier est refusée.
 *  3. CE QUI TIENT À UN MOIS OU À UN SALARIÉ N'Y ENTRE PAS · l'attestation de
 *     l'art. 69, 8 (réalité du transport, pièces médicales) se donne à chaque
 *     paie, les retenues d'avance et les personnes à charge sont propres au
 *     salarié. Un modèle qui les porterait attesterait d'avance.
 *  4. LE MONTANT EST FACULTATIF, ET IL EST DANS UNE DEVISE · un modèle en
 *     dollars ne pré-remplit pas les montants d'une paie stipulée en francs,
 *     ni l'inverse · il laisse le montant à saisir plutôt que de convertir.
 */

export const NATURES_MODELE: readonly NatureElementPaie[] = [
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
  ...HORS_REMUNERATION_ARTICLE_7,
];

export const MAX_LIGNES_MODELE = 40;

export interface LigneModeleBulletin {
  nature: string;
  libelle: string;
  rubriqueId?: string | null;
  montant?: number | null;
}

export interface RubriqueConnue {
  id: string;
  nature: string;
  actif: boolean;
}

export function motifRefusModele(
  m: { nom?: string; deviseStipulation?: string; lignes?: LigneModeleBulletin[] },
  rubriques: RubriqueConnue[],
): string | null {
  if (!m.nom?.trim()) return 'Le nom du modèle est obligatoire.';
  if (m.deviseStipulation !== 'CDF' && m.deviseStipulation !== 'USD') return 'La devise du modèle est CDF ou USD.';
  const lignes = m.lignes ?? [];
  if (lignes.length === 0) return 'Un modèle porte au moins un élément.';
  if (lignes.length > MAX_LIGNES_MODELE) return `Un modèle porte au plus ${MAX_LIGNES_MODELE} éléments.`;
  for (const [i, l] of lignes.entries()) {
    const n = i + 1;
    if (!l.libelle?.trim()) return `Élément ${n} · le libellé est obligatoire.`;
    if (l.rubriqueId) {
      const r = rubriques.find((x) => x.id === l.rubriqueId);
      if (!r) return `Élément ${n} · rubrique introuvable dans ce dossier.`;
      if (!r.actif) return `Élément ${n} · la rubrique est désactivée.`;
    } else if (!NATURES_MODELE.includes(l.nature as NatureElementPaie)) {
      return `Élément ${n} · nature inconnue.`;
    }
    if (l.montant !== undefined && l.montant !== null) {
      if (!Number.isFinite(l.montant) || l.montant < 0) return `Élément ${n} · le montant est positif ou nul.`;
      if (Math.round(l.montant * 100) !== l.montant * 100) return `Élément ${n} · deux décimales au plus.`;
    }
  }
  return null;
}

/** La nature d'une ligne rattachée est celle de SA rubrique, jamais celle envoyée. */
export function normaliserLignes(lignes: LigneModeleBulletin[], rubriques: RubriqueConnue[]): LigneModeleBulletin[] {
  return lignes.map((l) => {
    const r = l.rubriqueId ? rubriques.find((x) => x.id === l.rubriqueId) : undefined;
    return {
      nature: r ? r.nature : l.nature,
      libelle: l.libelle.trim(),
      rubriqueId: r ? r.id : null,
      montant: l.montant ?? null,
    };
  });
}
