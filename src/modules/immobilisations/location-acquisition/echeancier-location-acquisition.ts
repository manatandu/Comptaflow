import { NatureLocationAcquisition } from '@prisma/client';
import { ajouterMois } from '../../../common/ajouter-mois';

/**
 * LA LOCATION-ACQUISITION CHEZ LE PRENEUR · qualification, dette et
 * échéancier. AUDCIF, Titre VIII ch. 8, auquel renvoie la fiche du compte 18
 * du SYCEBNL. Moteur pur · aucune lecture de base, aucune écriture.
 */

export type Periodicite = 'MENSUELLE' | 'TRIMESTRIELLE' | 'SEMESTRIELLE' | 'ANNUELLE';
export const MOIS_PAR_PERIODE: Record<Periodicite, number> = {
  MENSUELLE: 1,
  TRIMESTRIELLE: 3,
  SEMESTRIELLE: 6,
  ANNUELLE: 12,
};

export interface ContratSaisi {
  nature: NatureLocationAcquisition;
  /** Date à laquelle le preneur peut utiliser le bien (« date de prise d'effet », § 1.3). */
  datePriseEffet: Date;
  dureeMois: number;
  periodicite: Periodicite;
  /** Loyers payés en début de période (à échoir) plutôt qu'en fin (échus). */
  termeAEchoir: boolean;
  loyer: number;
  /** Prix de levée de l'option d'achat · zéro s'il n'y en a pas. */
  prixOption: number;
  /** Le preneur est raisonnablement certain de lever l'option (§ 1.5.1). */
  optionRaisonnablementCertaine: boolean;
  /** Bien de faible valeur à neuf (§ 1.5.2, troisième tiret). */
  bienDeFaibleValeur: boolean;
  /**
   * L'UN DES DEUX · le taux d'intérêt implicite annuel (§ 2.1.3), ou la valeur
   * du bien « figurant dans le contrat », que le SYCEBNL admet comme valeur
   * d'entrée (fiche du compte 18) et dont le § 2.1.3 tire le taux implicite
   * (« valeur actuelle (au taux i) de l'ensemble des paiements locatifs =
   * valeur actuelle du bien (prix figurant dans le contrat) »).
   */
  tauxAnnuel?: number | null;
  valeurContrat?: number | null;
  /**
   * LOT 15 · GARANTIE DE VALEUR RÉSIDUELLE · § 2.1.2, les paiements locatifs
   * comprennent « les montants que le preneur s'attend à payer au titre d'une
   * garantie de valeur résiduelle ». Un paiement de fin de contrat, comme le
   * prix d'option (« Dette = Valeur actualisée des paiements de loyers +
   * Valeur actualisée des paiements estimés à la fin du contrat », § 2.1.3).
   * Zéro ou absent sans garantie.
   */
  garantieValeurResiduelle?: number;
  /**
   * LOT 15 · LOYER INDEXÉ · § 2.1.2, les loyers « qui dépendent d'un indice ou
   * d'un taux » sont des paiements locatifs, évalués à l'entrée « en
   * retenant l'indice ou le taux en vigueur au commencement du contrat ». Le
   * loyer saisi EST ce loyer-là ; l'indice et sa valeur à la prise d'effet se
   * déclarent, pour que le réviseur sache sur quoi la dette est assise. Rien
   * n'est recalculé quand l'indice bouge · le texte ne dit pas comment
   * (décision proposée, journal du plan), et l'écart entre le 623 réellement
   * porté et l'échéancier se montre à la clôture.
   */
  loyerIndexe?: boolean;
  indiceLoyer?: string | null;
  valeurIndiceCommencement?: number | null;
}

/**
 * LA QUALIFICATION · § 1.5.2, « sont spécifiquement considérés comme contrat
 * de location simple » les contrats de douze mois ou moins, ceux dont la
 * levée d'option est HYPOTHÉTIQUE, et ceux qui portent sur un bien de FAIBLE
 * VALEUR à neuf. Une location simple n'entre pas au bilan (§ 2.2) · ses
 * loyers vont en charges, et ce module la refuse en le disant.
 */
export function motifLocationSimple(c: Pick<ContratSaisi, 'nature' | 'dureeMois' | 'optionRaisonnablementCertaine' | 'bienDeFaibleValeur'>): string | null {
  const simple = ' · location simple, les loyers vont en charges et le bien n\'entre pas au bilan (AUDCIF Titre VIII ch. 8 § 1.5.2 et § 2.2).';
  if (c.dureeMois <= 12) return `Contrat de ${c.dureeMois} mois, douze mois ou moins${simple}`;
  if (c.bienDeFaibleValeur) return `Bien de faible valeur à neuf${simple}`;
  if (c.nature !== NatureLocationAcquisition.LOCATION_VENTE && !c.optionRaisonnablementCertaine) {
    return `Levée de l'option non raisonnablement certaine (hypothétique)${simple}`;
  }
  return null;
}

/**
 * LE TAUX PÉRIODIQUE TIRÉ D'UN TAUX ANNUEL · CONVENTION D'OMEGAX, dite. Le
 * § 2.1.3 définit le taux implicite sans dire comment un taux annuel se lit
 * sur des loyers mensuels ; OmegaX retient le taux ÉQUIVALENT,
 * (1 + t)^(mois/12) − 1, qui rend le même coût sur l'année qu'un loyer
 * annuel. Le taux proportionnel (t/12) ne serait pas le taux annoncé.
 */
export function tauxPeriodiqueEquivalent(tauxAnnuel: number, moisParPeriode: number): number {
  return Math.pow(1 + tauxAnnuel, moisParPeriode / 12) - 1;
}

/** Les instants des paiements, en périodes depuis la prise d'effet. */
function instants(c: ContratSaisi): { t: number; montant: number; option: boolean; garantie: boolean }[] {
  const n = c.dureeMois / MOIS_PAR_PERIODE[c.periodicite];
  const evts: { t: number; montant: number; option: boolean; garantie: boolean }[] = [];
  for (let k = 1; k <= n; k++) evts.push({ t: c.termeAEchoir ? k - 1 : k, montant: c.loyer, option: false, garantie: false });
  if (c.prixOption > 0) evts.push({ t: n, montant: c.prixOption, option: true, garantie: false });
  // La garantie se paie au terme, après la cession du bien par le bailleur
  // (§ 2.1.2, remarque 2) · sa ligne suit celle de l'option.
  const garantie = c.garantieValeurResiduelle ?? 0;
  if (garantie > 0) evts.push({ t: n, montant: garantie, option: false, garantie: true });
  return evts;
}

/** Valeur actualisée des paiements au taux périodique i (§ 2.1.2). */
export function valeurActualisee(c: ContratSaisi, i: number): number {
  return instants(c).reduce((s, e) => s + e.montant / Math.pow(1 + i, e.t), 0);
}

/**
 * Le taux périodique qui égalise la valeur actualisée des paiements et la
 * valeur du contrat (§ 2.1.3), par dichotomie · la valeur actualisée décroît
 * avec le taux. Null si la valeur du contrat dépasse la somme des paiements
 * (taux négatif) ou si elle n'est pas positive.
 */
export function tauxImplicitePeriodique(c: ContratSaisi, valeur: number): number | null {
  if (!(valeur > 0) || valeurActualisee(c, 0) < valeur - 0.005) return null;
  let bas = 0;
  let haut = 1;
  while (valeurActualisee(c, haut) > valeur) haut *= 2;
  for (let k = 0; k < 200; k++) {
    const milieu = (bas + haut) / 2;
    if (valeurActualisee(c, milieu) > valeur) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

export interface LigneEcheancier {
  rang: number;
  date: Date;
  /** Loyer, ou prix de levée de l'option sur la ligne qui le porte. */
  paiement: number;
  interets: number;
  capital: number;
  restant: number;
  option: boolean;
  /** Lot 15 · la ligne de la garantie de valeur résiduelle (§ 2.1.2). */
  garantie: boolean;
}

export interface Echeancier {
  /** Dette initiale (§ 2.1.2), au centime. */
  dette: number;
  /** Taux périodique retenu. */
  tauxPeriodique: number;
  lignes: LigneEcheancier[];
}

const centimes = (x: number) => Math.round(x * 100) / 100;

/** Le motif qui refuse la saisie du contrat, avant tout calcul, ou null. */
export function motifRefusContrat(c: ContratSaisi): string | null {
  const p = MOIS_PAR_PERIODE[c.periodicite];
  if (!Number.isInteger(c.dureeMois) || c.dureeMois <= 0) return 'Durée du contrat illisible.';
  if (c.dureeMois % p !== 0) return `La durée (${c.dureeMois} mois) n'est pas un nombre entier de périodes de ${p} mois.`;
  if (!(c.loyer > 0)) return 'Le loyer doit être positif.';
  if (c.prixOption < 0) return "Le prix de levée de l'option ne peut pas être négatif.";
  const parTaux = c.tauxAnnuel != null;
  const parValeur = c.valeurContrat != null;
  if (parTaux === parValeur) return 'Indiquez soit le taux implicite annuel, soit la valeur du bien figurant au contrat, l’un des deux.';
  if (parTaux && !(c.tauxAnnuel! >= 0)) return 'Le taux implicite ne peut pas être négatif.';
  const refusComplements = motifRefusComplements(c);
  if (refusComplements) return refusComplements;
  return motifLocationSimple(c);
}

/**
 * LA DETTE ET SON ÉCHÉANCIER · coût amorti au taux effectif (§ 2.1.4) · à
 * chaque paiement, les intérêts sont le restant dû capitalisé depuis le
 * paiement précédent, le capital le reste du paiement. Chaque ligne est au
 * centime, et la DERNIÈRE solde le restant exactement · son capital est le
 * restant dû et ses intérêts le reste du paiement, sans quoi un résidu
 * d'arrondi resterait à la dette après le dernier loyer.
 *
 * Exemple du texte (§ 2.1.4) · 8 loyers annuels de 90 000 échus à 7,86 %
 * donnent une dette d'environ 520 000 ; le premier loyer porte 40 872
 * d'intérêts (520 000 × 7,86 %) et 49 128 de capital.
 */
export function construireEcheancier(c: ContratSaisi): Echeancier {
  const motif = motifRefusContrat(c);
  if (motif) throw new Error(motif);
  const p = MOIS_PAR_PERIODE[c.periodicite];
  let i: number;
  let dette: number;
  if (c.valeurContrat != null) {
    const t = tauxImplicitePeriodique(c, c.valeurContrat);
    if (t == null) {
      throw new Error(
        'La valeur du contrat dépasse la somme des loyers et du prix d’option · aucun taux implicite positif ne les égalise (§ 2.1.3).',
      );
    }
    i = t;
    dette = centimes(c.valeurContrat);
  } else {
    i = tauxPeriodiqueEquivalent(c.tauxAnnuel!, p);
    dette = centimes(valeurActualisee(c, i));
  }
  const evts = instants(c);
  const lignes: LigneEcheancier[] = [];
  let restant = dette;
  let tPrecedent = 0;
  evts.forEach((e, k) => {
    const dernier = k === evts.length - 1;
    let interets = centimes(restant * (Math.pow(1 + i, e.t - tPrecedent) - 1));
    let capital = centimes(e.montant - interets);
    if (dernier) {
      capital = restant;
      interets = centimes(e.montant - capital);
    }
    restant = centimes(restant - capital);
    lignes.push({
      rang: k + 1,
      date: ajouterMois(c.datePriseEffet, e.t * p),
      paiement: e.montant,
      interets,
      capital,
      restant,
      option: e.option,
      garantie: e.garantie,
    });
    tPrecedent = e.t;
  });
  return { dette, tauxPeriodique: i, lignes };
}

/**
 * LOT 15 · ce que le preneur déclare en sus des loyers (§ 2.1.2) · une
 * garantie jamais négative ; un loyer indexé, son indice nommé et sa valeur
 * à la prise d'effet, sans quoi « l'indice en vigueur au commencement du
 * contrat » ne serait écrit nulle part.
 */
export function motifRefusComplements(c: Pick<ContratSaisi, 'garantieValeurResiduelle' | 'loyerIndexe' | 'indiceLoyer' | 'valeurIndiceCommencement'>): string | null {
  if ((c.garantieValeurResiduelle ?? 0) < 0) return 'Le montant attendu au titre de la garantie de valeur résiduelle ne peut pas être négatif.';
  if (c.loyerIndexe) {
    if (!c.indiceLoyer?.trim()) {
      return "Nommez l'indice ou le taux dont dépend le loyer · il est retenu « en vigueur au commencement du contrat » (AUDCIF Titre VIII ch. 8 § 2.1.2).";
    }
    if (!(c.valeurIndiceCommencement != null && c.valeurIndiceCommencement > 0)) {
      return "Indiquez la valeur de l'indice à la prise d'effet · le loyer saisi est celui qu'elle donne (AUDCIF Titre VIII ch. 8 § 2.1.2).";
    }
  } else if (c.indiceLoyer?.trim() || c.valeurIndiceCommencement != null) {
    return "Un indice ne se déclare que pour un loyer indexé.";
  }
  return null;
}
