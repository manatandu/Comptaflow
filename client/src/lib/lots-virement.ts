/**
 * RAPPEL D'UN LOT DE VIREMENTS · ce que le lot PRÉSÉLECTIONNE dans Règlement
 * des tiers. Rien n'est passé ici · le comptable ajuste, puis le règlement
 * suit ses propres règles au serveur (qui refuse tout excédent sur le dû).
 * Règle du lot côté serveur : src/modules/reglements/lots-virement.ts.
 */
export interface LotVirement {
  id: string;
  nom: string;
  journalId: string | null;
  lignes: { compteId: string; numero: string; intitule: string; montant: number }[];
}

export interface GroupeEcheances {
  compteId: string;
  lignes: { id: string; echeance: string; montant: number }[];
}

export interface RappelLot {
  cochees: string[];
  /** Montant saisi par compte · absent quand le dû des factures cochées est payé entier. */
  montants: Record<string, string>;
  constats: string[];
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Les factures les plus ANCIENNES d'abord, jusqu'à couvrir le montant habituel ·
 * au-delà du dû rien n'est inventé. Un fournisseur sans facture ouverte n'est
 * pas payé : payer sans facture serait une avance (409), une autre opération.
 */
export function rappelerLot(lot: LotVirement, groupes: GroupeEcheances[]): RappelLot {
  const cochees: string[] = [];
  const montants: Record<string, string> = {};
  const constats: string[] = [];
  for (const l of lot.lignes) {
    const g = groupes.find((x) => x.compteId === l.compteId);
    const nom = `${l.numero} ${l.intitule}`;
    if (!g || g.lignes.length === 0) {
      constats.push(`${nom} · aucune facture ouverte à cette date, rien n'est proposé (payer sans facture serait une avance).`);
      continue;
    }
    const ordonnees = [...g.lignes].sort((a, b) => a.echeance.localeCompare(b.echeance));
    let cumul = 0;
    for (const e of ordonnees) {
      if (cumul >= l.montant) break;
      cochees.push(e.id);
      cumul = arrondi(cumul + e.montant);
    }
    if (cumul < l.montant) {
      constats.push(`${nom} · dû ${fmt(cumul)}, sous le montant habituel de ${fmt(l.montant)} · seul le dû est proposé.`);
    } else if (cumul > l.montant) {
      montants[l.compteId] = String(l.montant);
    }
  }
  return { cochees, montants, constats };
}

/** Le lot qu'on enregistre depuis la sélection du moment · le montant réglé de chaque tiers. */
export function lignesDepuisSelection(
  groupes: GroupeEcheances[],
  cochees: Set<string>,
  montants: Record<string, string>,
): { compteId: string; montant: number }[] {
  return groupes
    .map((g) => {
      const du = arrondi(g.lignes.filter((l) => cochees.has(l.id)).reduce((s, l) => s + l.montant, 0));
      const saisi = montants[g.compteId];
      return { compteId: g.compteId, montant: saisi ? Number(saisi.replace(',', '.')) : du };
    })
    .filter((x) => x.montant > 0);
}
