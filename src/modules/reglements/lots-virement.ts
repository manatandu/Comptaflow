import { estEcheanceAReglerSur } from './reglement-tiers';

/**
 * LOTS DE VIREMENTS RÉCURRENTS · Moyens de Paiement de Sage : « lots
 * préétablis de virements/prélèvements récurrents et répétitifs : paramétrés
 * une fois, rappelés et ajustés à chaque échéance » (compétence `sage-i7`,
 * tresorerie-et-bi.md). Rien de plus · la définition est celle d'OmegaX.
 *
 * UN LOT N'EST PAS UN PAIEMENT. Il retient des fournisseurs et un montant
 * habituel ; rappelé, il PRÉSÉLECTIONNE leurs factures ouvertes dans
 * Règlement des tiers, et le règlement suit ses propres règles (une pièce par
 * tiers, lettrage, ordre de virement). Payer sans facture ouverte serait une
 * avance au 409, c'est-à-dire une autre opération · le rappel le dit au lieu
 * de la fabriquer.
 */
export interface LigneLot {
  compteId: string;
  montant: number;
}

export interface CompteLu {
  id: string;
  numero: string;
  typeCompte: 'DETAIL' | 'TOTAL';
}

export function motifRefusLot(nom: string, lignes: LigneLot[], comptes: CompteLu[]): string | null {
  if (!nom.trim()) return 'Un lot porte un nom.';
  if (lignes.length === 0) return 'Un lot porte au moins un fournisseur.';
  const vus = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.compteId)) return 'Un fournisseur ne figure qu’une fois dans un lot · son montant se règle à chaque rappel.';
    vus.add(l.compteId);
    if (!(l.montant > 0) || Math.round(l.montant * 100) !== l.montant * 100) {
      return 'Le montant habituel est positif, à deux décimales au plus.';
    }
    const c = comptes.find((x) => x.id === l.compteId);
    if (!c) return 'Compte introuvable dans ce dossier.';
    if (c.typeCompte !== 'DETAIL') return `Le compte ${c.numero} est un compte Total · un règlement porte sur un compte de détail.`;
    // Même règle que le règlement lui-même · ni 408 (factures non parvenues) ni
    // 409 (avances), qui ne sont pas des échéances.
    if (!estEcheanceAReglerSur(c.numero, 'FOURNISSEUR')) {
      return `Le compte ${c.numero} n'est pas un compte fournisseur réglable (40, hors 408 et 409) · un virement règle une dette fournisseur.`;
    }
  }
  return null;
}
