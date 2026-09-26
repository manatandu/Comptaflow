/**
 * L'ÉCRITURE D'UNE FACTURE · moteur PUR. La facture ne portait aucun montant
 * au grand livre et pointait vers une écriture passée à la main ; ce moteur
 * PROPOSE cette écriture à partir de la pièce, pour que le comptable n'ait
 * plus à ressaisir ce que la facture dit déjà.
 *
 * LE SCHÉMA EST CELUI DES FICHES DES COMPTES 40 ET 41, identique dans les
 * deux plans · une VENTE débite le compte du client pour le TTC, crédite le
 * produit (classe 7) pour le hors taxes et l'État (443, TVA facturée) pour la
 * taxe ; un ACHAT débite la charge (classe 6) ou l'immobilisation (classe 2)
 * et l'État (445, TVA récupérable), et crédite le fournisseur. Une NOTE DE
 * CRÉDIT porte des montants positifs (c'est sa nature qui porte le sens) ·
 * l'écriture est donc l'inverse exact de celle de la facture.
 *
 * RIEN N'EST DEVINÉ. Le compte de gestion est CHOISI par le comptable (un même
 * client achète un service ou une marchandise, et le numéro ne le dit pas), le
 * compte de TVA est celui du TAUX porté par la ligne, et le compte du tiers
 * est son compte PRINCIPAL. Il manque l'un des trois, et rien n'est proposé.
 */

export interface LigneFacturePourEcriture {
  designation: string;
  montantHT: number;
  montantTva: number;
  /** Compte de TVA du taux de la ligne (collecte sur une vente, déductible sur un achat), ou null. */
  compteTvaId: string | null;
  tauxTvaId: string | null;
  /** Compte de gestion choisi pour CETTE ligne, à défaut celui de la facture. */
  compteGestionId?: string | null;
}

export interface FacturePourEcriture {
  sens: 'VENTE' | 'ACHAT';
  nature: 'FACTURE' | 'NOTE_DE_CREDIT';
  numeroSerie: string;
  contrepartieNom: string;
  compteTiersId: string | null;
  autresImpotsEtTaxes: number | null;
  lignes: LigneFacturePourEcriture[];
}

export interface LigneProposee {
  compteId: string;
  libelle: string;
  debit: number;
  credit: number;
  tauxTvaId?: string;
}

const arrondi = (x: number) => Math.round(x * 100) / 100;

export function ecritureDeFacture(
  f: FacturePourEcriture,
  compteGestionParDefaut: string | null,
): { lignes: LigneProposee[]; libelle: string } | { refus: string } {
  if (!f.compteTiersId) {
    return { refus: 'Le tiers de la facture n’a pas de compte principal · rattachez-lui un compte au plan des tiers, ou renseignez le tiers sur la facture.' };
  }
  if (f.autresImpotsEtTaxes && f.autresImpotsEtTaxes > 0) {
    return { refus: 'La facture porte d’autres impôts et taxes · leur compte dépend de leur nature, l’écriture se passe à la main.' };
  }
  if (!f.lignes.length) return { refus: 'La facture n’a aucune ligne.' };

  const libelle = `${f.nature === 'NOTE_DE_CREDIT' ? 'Note de crédit' : 'Facture'} ${f.numeroSerie} · ${f.contrepartieNom}`.slice(0, 250);
  // Le sens « naturel » de chaque bloc pour une FACTURE de vente ; tout le
  // reste s'en déduit par deux inversions (achat, note de crédit).
  const inverse = (f.sens === 'ACHAT') !== (f.nature === 'NOTE_DE_CREDIT');
  const poser = (compteId: string, libelleLigne: string, montantAuCredit: number, tauxTvaId?: string): LigneProposee => {
    const m = arrondi(montantAuCredit);
    const credit = inverse ? -m : m;
    return { compteId, libelle: libelleLigne.slice(0, 250), debit: credit < 0 ? -credit : 0, credit: credit > 0 ? credit : 0, ...(tauxTvaId ? { tauxTvaId } : {}) };
  };

  const gestion = new Map<string, number>();
  const tva = new Map<string, { montant: number; tauxTvaId: string }>();
  for (const l of f.lignes) {
    const compte = l.compteGestionId || compteGestionParDefaut;
    if (!compte) return { refus: `Aucun compte de ${f.sens === 'VENTE' ? 'produit' : 'charge'} choisi pour la ligne « ${l.designation} ».` };
    gestion.set(compte, (gestion.get(compte) ?? 0) + l.montantHT);
    if (l.montantTva > 0) {
      if (!l.compteTvaId || !l.tauxTvaId) {
        return { refus: `La ligne « ${l.designation} » porte de la TVA sans taux rattaché à un compte ${f.sens === 'VENTE' ? 'de TVA facturée' : 'de TVA récupérable'} · complétez le taux dans Taux de taxes.` };
      }
      const t = tva.get(l.compteTvaId) ?? { montant: 0, tauxTvaId: l.tauxTvaId };
      t.montant += l.montantTva;
      tva.set(l.compteTvaId, t);
    }
  }

  const lignes: LigneProposee[] = [];
  for (const [compte, m] of gestion) lignes.push(poser(compte, libelle, m));
  for (const [compte, t] of tva) lignes.push(poser(compte, `TVA · ${libelle}`, t.montant, t.tauxTvaId));
  // Le tiers reçoit la somme EXACTE des autres lignes · jamais un TTC
  // recalculé à part, qui pourrait différer d'un centime et déséquilibrer.
  const totalAutres = arrondi(lignes.reduce((s, l) => s + l.credit - l.debit, 0));
  lignes.unshift({ compteId: f.compteTiersId, libelle, debit: totalAutres > 0 ? totalAutres : 0, credit: totalAutres < 0 ? -totalAutres : 0 });
  if (totalAutres === 0) return { refus: 'La facture est à zéro · il n’y a rien à passer.' };
  return { lignes, libelle };
}
