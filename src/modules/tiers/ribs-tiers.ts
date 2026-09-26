import { ibanValide, normaliserIban } from '../banques/banques';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';

/**
 * COORDONNÉES BANCAIRES DES TIERS ET ORDRE DE VIREMENT (priorité 1 de la
 * comparaison avec les autres produits Sage, docs/comparaison-sage-i7-omegax.md).
 *
 * Ce que la compétence `sage-i7` porte, et rien de plus : des « RIB/IBAN/BIC
 * par tiers » (Moyens de Paiement), « l'édition des ordres de paiement », et
 * « le règlement n'est effectif qu'après impression · état "en attente
 * d'impression" ». Ni la maquette de l'ordre, ni ses mentions, ni les formats
 * d'échange (SEPA, ETEBAC) ne sont décrits · la définition est donc celle
 * d'OmegaX, et l'écran le dit. Les formats d'échange ne sont PAS servis ·
 * aucune banque congolaise n'en publie la norme dans le corpus lu.
 *
 * UN SEUL CONTRÔLE DE FORMAT, comme pour les RIB du dossier (banques.ts) ·
 * l'IBAN, norme publiée (ISO 13616). Les formats nationaux se conservent sans
 * se vérifier.
 */

export interface CoordonneesRib {
  banque?: string | null;
  titulaire?: string | null;
  codeBanque?: string | null;
  codeGuichet?: string | null;
  numeroCompte?: string | null;
  cle?: string | null;
  iban?: string | null;
  codeBic?: string | null;
  devise?: string | null;
}

const vide = (v: string | null | undefined) => !v || !v.trim();

/**
 * Un RIB de tiers est refusé s'il ne permet PAS DE PAYER · sans banque, ou
 * sans aucun numéro de compte (ni IBAN ni numéro national). Un RIB incomplet
 * enregistré serait recopié sur un ordre que la banque rejettera, après que
 * la pièce de règlement a été passée.
 */
export function motifRefusRibTiers(rib: CoordonneesRib): string | null {
  if (vide(rib.banque)) return "La banque du tiers est obligatoire · l'ordre de virement la nomme.";
  if (vide(rib.iban) && vide(rib.numeroCompte)) {
    return "Un RIB sans IBAN ni numéro de compte ne permet pas de payer · renseignez l'un des deux.";
  }
  if (!vide(rib.iban) && !ibanValide(rib.iban!)) {
    return "IBAN invalide · la clé de contrôle (ISO 13616, modulo 97) ne correspond pas. Vérifiez la saisie.";
  }
  return null;
}

/**
 * Les coordonnées telles qu'elles s'impriment sur l'ordre · l'IBAN s'il
 * existe (il contient le reste), sinon le RIB national dans l'ordre de la
 * fiche Sage (code banque, code guichet, numéro de compte, clé).
 */
export function coordonneesImprimees(rib: CoordonneesRib): string {
  if (!vide(rib.iban)) {
    const iban = normaliserIban(rib.iban!);
    return `IBAN ${iban.replace(/(.{4})/g, '$1 ').trim()}`;
  }
  return [rib.codeBanque, rib.codeGuichet, rib.numeroCompte, rib.cle]
    .filter((v) => !vide(v))
    .map((v) => v!.trim())
    .join(' ');
}

/**
 * Le compte du donneur d'ordre doit être tenu dans la MONNAIE DE TENUE · les
 * montants de l'ordre sont ceux des pièces de règlement, qui sont en francs
 * congolais (loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°). Un ordre en
 * francs sur un compte en dollars demanderait à la banque de débiter une
 * somme dans une monnaie que le compte ne porte pas. Un RIB sans devise est
 * pris pour la monnaie de tenue · c'est ce qu'un compte congolais saisi sans
 * précision est le plus souvent, et le refuser bloquerait chaque dossier qui
 * n'a pas rempli le champ.
 */
export function motifRefusDeviseDonneur(devise: string | null | undefined, journalCode: string): string | null {
  if (vide(devise)) return null;
  const code = devise!.trim().toUpperCase();
  if (code === MONNAIE_DE_TENUE) return null;
  return (
    `Le RIB du journal ${journalCode} est tenu en ${code} · les règlements sont en ${MONNAIE_DE_TENUE}, ` +
    "monnaie de tenue. Un ordre de virement ne s'émet que sur un compte en " +
    `${MONNAIE_DE_TENUE}.`
  );
}

/**
 * L'ÉTAT D'UN ORDRE, et ce qu'il permet. « Le règlement n'est effectif
 * qu'après impression » (Sage) · A_IMPRIMER est l'état « en attente
 * d'impression », la première impression le fait passer à IMPRIME et en
 * garde la date et l'auteur. Une réimpression ne change rien que le compteur ·
 * c'est la PREMIÈRE qui a remis l'ordre à la banque. Un ordre annulé ne
 * s'imprime plus, et ne s'annule pas deux fois.
 */
export type StatutOrdre = 'A_IMPRIMER' | 'IMPRIME' | 'ANNULE';

export function motifRefusImpression(statut: StatutOrdre): string | null {
  return statut === 'ANNULE' ? "L'ordre est annulé · il ne se réimprime pas." : null;
}

export function motifRefusAnnulation(statut: StatutOrdre, motif: string | null | undefined): string | null {
  if (statut === 'ANNULE') return "L'ordre est déjà annulé.";
  if (vide(motif)) return "Le motif d'annulation est obligatoire · un ordre remis à la banque et retiré doit laisser sa raison.";
  return null;
}
