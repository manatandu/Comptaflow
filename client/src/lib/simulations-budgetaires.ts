/**
 * SIMULATEUR BUDGÉTAIRE · types et lecture du formulaire. Les règles vivent au
 * serveur (src/modules/simulations/simulateur-budgetaire.ts) · l'écran ne
 * recalcule rien, il ne fait que traduire la saisie.
 */
export type Jauge = 'VERT' | 'ORANGE' | 'ROUGE';

export interface SimulationBudgetaire {
  id: string;
  nom: string;
  exerciceReferenceId: string;
  exerciceCibleId: string;
  hypotheses: { croissanceProduitsPct: number; variations: Record<string, number> };
  seuilOrangePct: number | string;
  seuilRougePct: number | string;
}

export interface LigneSimulee {
  racine: string;
  intitule: string;
  nature: 'PRODUIT' | 'CHARGE';
  reference: number;
  tauxPct: number;
  prevuAnnuel: number;
  prevuADate: number;
  realise: number | null;
  ecartDefavorablePct: number | null;
  jauge: Jauge | null;
}

type Totaux = { produits: number; charges: number; resultatActivitesOrdinaires: number };

export interface CalculSimulation {
  arreteAu: string | null;
  prorata: number;
  reserves: string[];
  lignes: LigneSimulee[];
  totaux: {
    reference: Totaux;
    prevuAnnuel: Totaux;
    prevuADate: Totaux;
    realise: Totaux | null;
    jaugeResultat: Jauge | null;
    ecartResultatPct: number | null;
  };
}

const nombre = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

/**
 * « 60=5 ; 66 = -2,5 » devient { 60: 5, 66: -2.5 }. Une entrée illisible est
 * RENDUE comme motif, jamais ignorée · ignorée, la ligne garderait son taux
 * par défaut sans que personne ne le sache.
 */
export function lireVariations(texte: string): { variations: Record<string, number> } | { motif: string } {
  const variations: Record<string, number> = {};
  for (const morceau of texte.split(/[;\n]/).map((m) => m.trim()).filter(Boolean)) {
    const m = /^(\d{2})\s*=\s*(-?[\d\s]+(?:[.,]\d+)?)$/.exec(morceau);
    if (!m) return { motif: `« ${morceau} » ne se lit pas · écrire « racine = taux », par exemple « 66 = 5 ».` };
    variations[m[1]] = nombre(m[2]);
  }
  return { variations };
}

export const ecrireVariations = (v: Record<string, number>) =>
  Object.entries(v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([r, t]) => `${r} = ${t.toLocaleString('fr-FR')}`)
    .join(' ; ');

export const CLASSE_JAUGE: Record<Jauge, string> = {
  VERT: 'bg-positive-soft text-positive',
  ORANGE: 'bg-warning-soft text-warning',
  ROUGE: 'bg-danger-soft text-danger',
};
