/**
 * L'ATTESTATION DE L'ÉTAT DE L'ÉCART D'UNE RÉÉVALUATION (vérification finale
 * d'A5 bis) · la règle du serveur (`MOTIF_ATTESTATION_MIN`,
 * `MOTIF_ATTESTATION_MAX` de `DevisesService`, et le DTO), vérifiée avant
 * l'envoi, et l'avertissement que la modale montre AVANT l'attestation · le
 * cabinet doit savoir ce qu'il signe et ce qui reste refusé.
 */
export const MOTIF_ATTESTATION_MIN = 10;
export const MOTIF_ATTESTATION_MAX = 500;

export function motifRefusAttestation(motif: string, geste: 'ATTESTER' | 'RETIRER' = 'ATTESTER'): string | null {
  const n = motif.trim().length;
  if (n >= MOTIF_ATTESTATION_MIN && n <= MOTIF_ATTESTATION_MAX) return null;
  return `Le motif ${geste === 'ATTESTER' ? "de l'attestation" : 'du retrait'} compte de ${MOTIF_ATTESTATION_MIN} à ${MOTIF_ATTESTATION_MAX} caractères.`;
}

/** Ce que l'attestation change, et ce qu'elle ne change pas (trois refus restent). */
export const AVERTISSEMENT_ATTESTATION =
  "En attestant, le cabinet répond de l'état des comptes de l'écart (478, 479 et tiers). Les refus que la règle d'état tire de ces comptes deviennent des avertissements pour cette réévaluation. Restent refusés : la contre-passation de la banque ou de la caisse, dont l'écart est réalisé ; une seconde contre-passation par le module quand l'écart est déjà sorti des comptes ; la déclaration d'une inscription en négatif.";
