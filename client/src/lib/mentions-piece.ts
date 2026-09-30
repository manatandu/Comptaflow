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
  // Le manque se dit même quand la ligne est vide · un commerçant sans RCCM
  // n'a aucune ligne, et c'est justement le manque de l'AUDCG art. 59 (passe O2).
  if (m.manquantes.length === 0) return null;
  // Le texte nommé est celui qui parle pour ce dossier · une coopérative
  // relève de l'AUSCOOP art. 19 (et 183), jamais de l'AUSCGIE art. 17 (passe O6).
  const texte = m.manquantes.some((x) => x.includes('AUSCOOP'))
    ? 'AUSCOOP art. 19'
    : m.ligne !== null && m.manquantes.some((x) => !x.includes('AUDCG'))
      ? 'AUSCGIE art. 17'
      : 'Mentions de l’émetteur';
  return `${texte} · manquait au dossier à l'établissement de la pièce : ${m.manquantes.join(', ')}. Complétez Paramètres du dossier pour les pièces suivantes.`;
}


/**
 * CE QUI MANQUE À LA PIÈCE, tel que l'écran le dit (audit final F24). La
 * mention de l'art. 60 du décret n° 011/42 rend la pièce non conforme sans
 * être un groupe de l'art. 26 · l'écran affichait « Manque : » suivi d'une
 * liste vide. Elle est nommée avec son article.
 */
export function manquesDeLaPiece(m: {
  manquantes: { libelle: string }[];
  mentionDebitsManquante?: boolean;
  mentionDebits?: { texte: string; article: string };
}): string[] {
  const manques = m.manquantes.map((x) => x.libelle);
  if (m.mentionDebitsManquante && m.mentionDebits) manques.push(`« ${m.mentionDebits.texte} » (${m.mentionDebits.article})`);
  return manques;
}

/**
 * La case de l'art. 60 se PROPOSE cochée sur une vente d'un dossier autorisé
 * aux débits · elle ne se pose jamais d'office sur un achat, dont la mention
 * appartient au fournisseur.
 */
export function mentionDebitsProposee(sens: 'VENTE' | 'ACHAT', regimeExigibiliteTva: string | null | undefined): boolean {
  return sens === 'VENTE' && regimeExigibiliteTva === 'DEBITS';
}
