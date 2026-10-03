/**
 * LE MOTIF D'ANNULATION D'UNE RÉÉVALUATION (ligne A6, D6) · la même règle que
 * le DTO du serveur (`AnnulerReevaluationDto`, 3 à 500 caractères), vérifiée
 * AVANT l'envoi. `null` si admis. AUCUN IMPORT DE REACT.
 */
export const MOTIF_ANNULATION_MIN = 3;
export const MOTIF_ANNULATION_MAX = 500;

export function motifRefusMotifAnnulation(motif: string): string | null {
  const n = motif.trim().length;
  if (n < MOTIF_ANNULATION_MIN) return `Le motif de l'annulation est obligatoire · ${MOTIF_ANNULATION_MIN} caractères au moins.`;
  if (n > MOTIF_ANNULATION_MAX) return `Le motif de l'annulation tient en ${MOTIF_ANNULATION_MAX} caractères au plus.`;
  return null;
}
