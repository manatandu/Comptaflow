/**
 * A8 · LE DÉCOMPTE FINAL ÉMIS, FIGÉ, PUIS PASSÉ AU JOURNAL.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES TEXTES DISENT, VERBATIM.
 *
 * ARRÊTÉ n° 12/CAB.MIN/ETPS/042 DU 8 AOÛT 2008, ART. 2 · « Lors de la
 * résiliation du contrat de travail, pour quelque cause que ce soit,
 * l'employeur doit remettre au travailleur un décompte écrit des payements
 * effectués prévus à l'article 103 du Code du Travail. »
 *
 * CODE DU TRAVAIL, ART. 100 · « Toute somme restant due en exécution d'un
 * contrat de travail, lors de la cessation définitive des services effectifs,
 * doit être payée au travailleur [...] au plus tard dans les deux jours
 * ouvrables qui suivent la date de la cessation des services. »
 *
 * AUDCIF, TITRE VIII CH. 21 § 5.2 · « L'indemnité de cessation d'emploi est
 * comptabilisée au débit d'un compte de charge de personnel par le crédit du
 * compte 42 Personnel. » La fiche du compte 66 des deux textes nomme le
 * compte · 6614 « Indemnités de préavis, de licenciement et de recherche
 * d'embauche » (voir `passation-paie.ts`).
 * ────────────────────────────────────────────────────────────────────────
 *
 * CE QUE CES PHRASES FONT AU MODÈLE.
 *
 *  · LE DÉCOMPTE EST UN BULLETIN. Même document (un double du livre de paie),
 *    même numérotation continue (art. 214), même indélébilité (art. 4), même
 *    annulation motivée, même remise déclarée. Il vit dans `BulletinPaie`,
 *    nature `DECOMPTE_FINAL` · une table à part aurait ouvert une seconde
 *    séquence de numéros, et deux feuilles « n° 12 » dans un même livre.
 *  · IL REMPLACE LE BULLETIN DU MOIS DE CESSATION (décision de Manasse du
 *    2026-10-02). Il porte le salaire de ce mois avec les indemnités, et la
 *    règle « un seul actif par salarié et par mois » de P8 vaut pour les deux
 *    natures ensemble · un bulletin actif refuse le décompte, et inversement.
 *  · L'IMPÔT EST CELUI DU BARÈME DU MOIS (décision de Manasse du 2026-10-02) ·
 *    loi n° 23/053, art. 118 et 119, le revenu du mois de cessation,
 *    indemnités comprises, annualisé comme celui d'un bulletin. La réserve
 *    sur le versement unique est écrite (`RESERVE_VERSEMENT_UNIQUE`).
 *  · LA PASSATION EST CELLE DE LA PAIE DU MOIS (P9) · même écriture, mêmes
 *    trois temps, mêmes comptes, la nature `INDEMNITE_DE_FIN_DE_CONTRAT`
 *    portant le 6614. Aucun second chemin vers le journal.
 *
 * CE FICHIER EST PUR · il traduit le verdict de `decompte-final.ts` en
 * éléments de paie et dit pourquoi il refuse. Le service rejoue tout.
 */

import type { NatureElementPaie } from './assiettes-paie';
import { estVerseEnEspeces } from './passation-paie';
import type { RubriqueDecompte, VerdictDecompteFinal } from './decompte-final';

/**
 * LA NATURE DE CHAQUE RUBRIQUE DU DÉCOMPTE, et la seule table qui la donne.
 * La rubrique « arriérés » n'y est pas · elle est REMPLACÉE par les éléments
 * du mois saisis nature par nature (salaire, logement, transport...), sans
 * quoi un montant global mêlerait des éléments que l'article 7, point 8 range
 * de part et d'autre de la rémunération. Une rubrique nouvelle dans
 * `decompte-final.ts` qui n'est pas ici est REFUSÉE à l'émission, jamais
 * rangée par défaut · le test le gèle.
 */
export const NATURE_DES_RUBRIQUES: Readonly<Record<string, NatureElementPaie>> = {
  // Art. 63, al. 3 (préavis non observé) et art. 61 bis (somme convenue).
  preavis: 'INDEMNITE_DE_FIN_DE_CONTRAT',
  // Art. 70 · dommages-intérêts de la rupture d'un CDD par l'employeur.
  'dommages-interets-art-70': 'INDEMNITE_DE_FIN_DE_CONTRAT',
  // Art. 144 · l'indemnité compensatoire de congé, élément de la rémunération
  // que l'article 7, point 8 nomme (« l'allocation de congé ou l'indemnité
  // compensatoire de congé »).
  conge: 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE',
  // Art. 7, point 8 · « les sommes versées à titre de gratification ».
  gratification: 'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE',
  // Art. 66, al. 2 et 142, al. 3 · hors du brut, une exclusion de l'art. 7.
  'allocations-familiales': 'ALLOCATIONS_FAMILIALES_LEGALES',
};

/** La rubrique que les éléments du mois remplacent. */
export const CLE_ARRIERES = 'arrieres';

export const RESERVE_VERSEMENT_UNIQUE =
  "IMPÔT AU BARÈME DU MOIS (loi n° 23/053, art. 118 et 119) · le revenu du mois de cessation, indemnités comprises, est " +
  "annualisé comme celui d'un bulletin (décision du cabinet du 2026-10-02). Un versement unique qui couvre plusieurs " +
  "périodes (préavis, congé) monte dans les tranches du barème, et la retenue peut dépasser l'impôt que ces sommes " +
  "auraient porté, mois après mois. La loi lue ne prévoit pour elles ni étalement ni taux distinct · l'art. 68, 6° les " +
  "rend imposables, et la retenue reste un ACOMPTE sur l'impôt annuel (art. 116 et 121), régularisé à la déclaration.";

export const RESERVE_DU_PAR_LE_TRAVAILLEUR =
  "SOMMES DUES PAR LE TRAVAILLEUR (art. 63, al. 3 ; art. 70) · ni retenues sur le net, ni comptées au total. L'article " +
  "112 ferme la liste des retenues sur la rémunération, et OmegaX n'opère aucune compensation qu'il ne nomme pas.";

export const RESERVE_EN_FRANCS =
  "Le décompte se chiffre en francs congolais · ses rubriques (taux journalier, moyennes des douze mois) le sont, " +
  "et une stipulation en dollars ne s'y mêle pas.";

/** Un élément de paie tel que la simulation le reçoit. */
export type ElementDecompte = {
  readonly nature: NatureElementPaie;
  readonly libelle: string;
  readonly montantFc: number;
  readonly cleRubrique: string;
};

/**
 * LE VERDICT DU DÉCOMPTE TRADUIT EN ÉLÉMENTS, ou les raisons de ne pas émettre.
 *
 * UN SOLDE PARTIEL NE S'ÉMET PAS · le décompte remis au travailleur devient
 * opposable (art. 103), et un total `null` est un solde que personne n'a fini
 * de chiffrer. Chaque rubrique indéterminée est nommée avec sa réserve.
 *
 * UNE RUBRIQUE À ZÉRO NE FAIT PAS D'ÉLÉMENT · le zéro est une réponse (faute
 * lourde, préavis presté), il reste dans le verdict figé ; il n'a rien à
 * passer au journal.
 */
export function elementsDuDecompte(verdict: VerdictDecompteFinal): {
  elements: ElementDecompte[];
  refus: string[];
} {
  const refus: string[] = [];
  const elements: ElementDecompte[] = [];
  const toutes: readonly RubriqueDecompte[] = [...verdict.rubriques, ...verdict.horsBrut];
  for (const r of toutes) {
    if (r.montantFc === null) {
      refus.push(`${r.libelle} non chiffrée · ${r.reserve ?? r.fondement}`);
      continue;
    }
    if (r.cle === CLE_ARRIERES) continue;
    const nature = NATURE_DES_RUBRIQUES[r.cle];
    if (!nature) {
      refus.push(`${r.libelle} · aucune nature de paie n'est déclarée pour cette rubrique, elle n'est pas rangée par défaut.`);
      continue;
    }
    if (r.montantFc < 0) {
      refus.push(`${r.libelle} négative (${r.montantFc.toFixed(2)} FC) · un décompte ne porte pas de montant négatif.`);
      continue;
    }
    if (r.montantFc === 0) continue;
    elements.push({ nature, libelle: r.libelle, montantFc: r.montantFc, cleRubrique: r.cle });
  }
  if (refus.length === 0 && (verdict.totalBrutFc === null || verdict.totalDuAuTravailleurFc === null)) {
    refus.push('Le total du décompte est indéterminé.');
  }
  return { elements, refus };
}

/**
 * LES ARRIÉRÉS SONT LES ÉLÉMENTS DU MOIS VERSÉS EN ESPÈCES. Le salaire des
 * jours prestés et ce qui reste dû au mois de cessation se saisissent comme
 * sur un bulletin, nature par nature ; leur total versé tient lieu de la
 * rubrique « arriérés » du décompte (art. 100). Un avantage FOURNI en nature
 * n'est pas une somme restant due · il n'y entre pas (`estVerseEnEspeces`).
 */
export function arrieresDesElements(
  elements: readonly { nature: NatureElementPaie; montantFc: number; enNature?: boolean }[],
): number {
  const centimes = elements
    .filter((e) => estVerseEnEspeces(e.nature, e.enNature))
    .reduce((n, e) => n + Math.round(Math.max(0, e.montantFc) * 100), 0);
  return centimes / 100;
}

/**
 * LE MOIS DE CESSATION EST CELUI DE LA FIN DU CONTRAT. Le décompte se remet
 * « lors de la résiliation » (arrêté de 2008, art. 2) · un contrat sans date
 * de fin n'est pas résilié, et un mois qui n'est pas celui de la fin n'est
 * pas celui que le décompte remplace.
 */
export function motifRefusMoisDeCessation(dateFin: Date | null, moisDeCessation: string): string | null {
  if (!dateFin) {
    return "Le contrat n'est pas terminé au registre · déclarez d'abord sa fin (date et motif), le décompte final se remet à la résiliation.";
  }
  const mois = dateFin.toISOString().slice(0, 7);
  if (mois !== moisDeCessation) {
    return `Le contrat prend fin en ${mois} · le décompte final porte sur le mois de cessation, pas sur ${moisDeCessation}.`;
  }
  return null;
}

/** Ce que le registre déclare du contrat, confronté à ce que le décompte suppose. */
export function motifRefusTypeContrat(typeRegistre: string, typeDeclare: string): string | null {
  if (typeRegistre !== 'DUREE_INDETERMINEE' && typeRegistre !== 'DUREE_DETERMINEE') {
    return "Le décompte final ne chiffre que le contrat à durée indéterminée ou déterminée (art. 64, 69 et 70) · ce contrat est d'un autre type au registre.";
  }
  if (typeRegistre !== typeDeclare) {
    return `Le registre porte un contrat ${typeRegistre === 'DUREE_INDETERMINEE' ? 'à durée indéterminée' : 'à durée déterminée'} · le type déclaré au décompte le contredit.`;
  }
  return null;
}
