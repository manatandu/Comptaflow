import { MethodeConsolidation, ResultatEntite } from './perimetre-consolidation';

/**
 * NOTE DU PÉRIMÈTRE · le tableau type du D4C, ch. XII-8 § 6 · « Dénomination /
 * Secteur d'activité / % de contrôle (N, N-1) / Méthode (N, N-1 : IG, IP, ME,
 * NC) / % d'intérêt (N, N-1) », suivi des justifications que la même section
 * exige (ME d'une entité contrôlée, IG sous 40 % de droits de vote, exclusion
 * de l'IG au-delà de 50 %, ME sous 20 %, exclusion de la ME au-delà de 20 %,
 * motifs de non-consolidation).
 *
 * LE PÉRIMÈTRE VIT PAR EXERCICE, et une entité y est recréée chaque année ·
 * N et N-1 s'apparient donc par la DÉNOMINATION, unique dans un exercice, et
 * jamais par l'identifiant ni par le rang. Une entité absente de N-1 alors que
 * N-1 a un périmètre est une ENTRÉE, et ses colonnes N-1 restent vides plutôt
 * que de se lire « 0 % ».
 */

/** Le D4C ne connaît que quatre méthodes · une entité exclue (art. 96) est « NC ». */
export type MethodeNote = 'IG' | 'IP' | 'ME' | 'NC';
const versNote = (m: MethodeConsolidation): MethodeNote => (m === 'EXCLUE' ? 'NC' : m);

export interface LigneNotePerimetre {
  denomination: string;
  estConsolidante: boolean;
  secteurActivite: string | null;
  pctControleN: number;
  pctControleN1: number | null;
  methodeN: MethodeNote;
  methodeN1: MethodeNote | null;
  pctInteretN: number;
  pctInteretN1: number | null;
  /** Entrée dans le périmètre · présente en N, absente d'un périmètre N-1 qui existe. */
  entree: boolean;
}

export interface JustificationPerimetre {
  denomination: string;
  fondement: string;
  aJustifier: string[];
  exclusion: { libelle: string; justification: string } | null;
}

export interface NotePerimetre {
  lignes: LigneNotePerimetre[];
  /** Présentes en N-1 et plus en N · sorties du périmètre, à expliquer (ch. XII-8 § 6, variations de périmètre). */
  sorties: string[];
  justifications: JustificationPerimetre[];
  comparatifDisponible: boolean;
}

export function noteDuPerimetre(
  n: ResultatEntite[],
  secteurs: Map<string, string | null>,
  n1: ResultatEntite[] | null,
): NotePerimetre {
  const parNom = new Map((n1 ?? []).map((r) => [r.nom, r]));
  const lignes = n.map((r): LigneNotePerimetre => {
    const a = parNom.get(r.nom);
    return {
      denomination: r.nom,
      estConsolidante: r.estConsolidante,
      secteurActivite: secteurs.get(r.id) ?? null,
      pctControleN: r.pctControle,
      pctControleN1: a ? a.pctControle : null,
      methodeN: versNote(r.methode),
      methodeN1: a ? versNote(a.methode) : null,
      pctInteretN: r.pctInteret,
      pctInteretN1: a ? a.pctInteret : null,
      entree: n1 != null && !a,
    };
  });
  const nomsN = new Set(n.map((r) => r.nom));
  return {
    lignes,
    sorties: (n1 ?? []).filter((r) => !nomsN.has(r.nom)).map((r) => r.nom),
    justifications: n
      .filter((r) => !r.estConsolidante)
      .map((r) => ({
        denomination: r.nom,
        fondement: r.fondement,
        aJustifier: r.aJustifierEnNotes,
        exclusion: r.exclusion ? { libelle: r.exclusion.libelle, justification: r.exclusion.justification } : null,
      })),
    comparatifDisponible: n1 != null,
  };
}
