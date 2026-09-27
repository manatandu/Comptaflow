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
 * compte de TVA est celui que la saisie routerait sur cette contrepartie, à
 * défaut celui du TAUX (audit final F116), et le compte du tiers est son
 * compte PRINCIPAL. Il manque l'un des trois, et rien n'est proposé.
 */

export interface LigneFacturePourEcriture {
  designation: string;
  montantHT: number;
  montantTva: number;
  /**
   * Compte de TVA de la ligne, ROUTÉ selon sa contrepartie comme à la saisie
   * (`tva/routage-tva.ts`), à défaut celui du taux · ou null.
   */
  compteTvaId: string | null;
  tauxTvaId: string | null;
  /**
   * Le taux de la ligne est-il le taux ZÉRO ? Sa ligne de TVA, à zéro, est posée
   * quand même · c'est elle qui met l'exportation au numérateur du prorata
   * (O.-L. n° 10/001, art. 43 ; audit final F116).
   */
  tauxZero?: boolean;
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
  // PAR COMPTE ET PAR TAUX · une ligne au taux zéro fondue dans une ligne à
  // 16 % sur le même compte y perdrait sa qualification.
  const tva = new Map<string, { compteId: string; montant: number; tauxTvaId: string }>();
  for (const l of f.lignes) {
    const compte = l.compteGestionId || compteGestionParDefaut;
    if (!compte) return { refus: `Aucun compte de ${f.sens === 'VENTE' ? 'produit' : 'charge'} choisi pour la ligne « ${l.designation} ».` };
    gestion.set(compte, (gestion.get(compte) ?? 0) + l.montantHT);
    if (l.montantTva > 0 || (l.tauxZero && l.tauxTvaId)) {
      if (!l.compteTvaId || !l.tauxTvaId) {
        return { refus: `La ligne « ${l.designation} » porte de la TVA sans taux rattaché à un compte ${f.sens === 'VENTE' ? 'de TVA facturée' : 'de TVA récupérable'} · complétez le taux dans Taux de taxes.` };
      }
      const cle = `${l.compteTvaId}|${l.tauxTvaId}`;
      const t = tva.get(cle) ?? { compteId: l.compteTvaId, montant: 0, tauxTvaId: l.tauxTvaId };
      t.montant += l.montantTva;
      tva.set(cle, t);
    }
  }

  const lignes: LigneProposee[] = [];
  for (const [compte, m] of gestion) lignes.push(poser(compte, libelle, m));
  for (const t of tva.values()) lignes.push(poser(t.compteId, `TVA · ${libelle}`, t.montant, t.tauxTvaId));
  // Le tiers reçoit la somme EXACTE des autres lignes · jamais un TTC
  // recalculé à part, qui pourrait différer d'un centime et déséquilibrer.
  const totalAutres = arrondi(lignes.reduce((s, l) => s + l.credit - l.debit, 0));
  lignes.unshift({ compteId: f.compteTiersId, libelle, debit: totalAutres > 0 ? totalAutres : 0, credit: totalAutres < 0 ? -totalAutres : 0 });
  if (totalAutres === 0) return { refus: 'La facture est à zéro · il n’y a rien à passer.' };
  return { lignes, libelle };
}
