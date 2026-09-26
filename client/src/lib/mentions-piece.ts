/**
 * AUSCGIE ART. 17 SUR LA PIÈCE IMPRIMÉE · ce que la facture ou le devis a
 * RECOPIÉ à sa date, et ce que l'écran doit en dire avant l'impression. La
 * pièce n'est jamais corrigée avec les mentions d'aujourd'hui.
 */
export type MentionsRecopiees = { denomination: string; ligne: string | null; manquantes: string[] };

export const PIECE_ANTERIEURE =
  "Mentions de l'AUSCGIE art. 17 non recopiées : pièce établie avant qu'OmegaX ne les porte.";

/**
 * Ce que l'écran doit signaler avant l'impression, ou null. La pièce n'est pas
 * corrigée · elle s'imprime telle qu'elle a été établie, et le manque se dit.
 */
export function avertissementArticle17(
  m: MentionsRecopiees | null,
  dossierEstUneSociete: boolean,
): string | null {
  if (m === null) return dossierEstUneSociete ? PIECE_ANTERIEURE : null;
  if (m.ligne === null || m.manquantes.length === 0) return null;
  return `AUSCGIE art. 17 · manquait au dossier à l'établissement de la pièce : ${m.manquantes.join(', ')}. Complétez Paramètres du dossier pour les pièces suivantes.`;
}

