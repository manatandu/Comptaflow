/**
 * CONTREPARTIE À CHAQUE LIGNE · option des journaux de trésorerie de Sage 100
 * i7 (« Générer une contrepartie à chaque ligne », manuel de formation, codes
 * journaux et journal Caisse de janvier). Règle pure, testée sans React.
 *
 * Une ligne saisie dans un journal de trésorerie dont l'option est cochée
 * reçoit sa ligne sur le compte de trésorerie du journal, du même montant,
 * même libellé, SENS INVERSE : un règlement fournisseur débité au 401 est
 * crédité en caisse, un encaissement client crédité au 411 est débité en
 * caisse. Rien sur la ligne de trésorerie elle-même, ni hors trésorerie.
 */
export interface JournalContrepartie {
  type: string;
  compteTresorerieId: string | null;
  contrepartieChaqueLigne?: boolean;
}

export interface CompteContrepartie {
  id: string;
  numero: string;
  intitule: string;
}

export function contrepartieDeLigne(params: {
  journal: JournalContrepartie | null | undefined;
  compteLigneId: string;
  comptes: CompteContrepartie[];
  debit: number;
  credit: number;
  libelle: string;
}): { compteId: string; numero: string; intitule: string; libelle: string; debit: number; credit: number } | null {
  const { journal, compteLigneId, comptes, debit, credit, libelle } = params;
  if (!journal || journal.type !== 'TRESORERIE' || !journal.contrepartieChaqueLigne || !journal.compteTresorerieId) return null;
  if (compteLigneId === journal.compteTresorerieId) return null;
  if (!(debit > 0) && !(credit > 0)) return null;
  const treso = comptes.find((c) => c.id === journal.compteTresorerieId);
  if (!treso) return null;
  return { compteId: treso.id, numero: treso.numero, intitule: treso.intitule, libelle, debit: credit, credit: debit };
}
