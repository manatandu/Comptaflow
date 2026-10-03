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

/**
 * L'ASSIETTE SOCIALE DE L'INDEMNITÉ DE FIN DE CONTRAT · LECTURE D'OMEGAX, LE
 * CORPUS SE TAIT. Le Code du travail, art. 7, point 8, définit la rémunération
 * comme les gains « dus en vertu d'un contrat de travail », et ferme la liste
 * de ce qu'il en sort (soins de santé, logement ou son indemnité, allocations
 * familiales légales, transport, frais de voyage) · l'indemnité de préavis,
 * la somme convenue de l'art. 61 bis et les dommages-intérêts de l'art. 70 n'y
 * sont pas. Mais aucun texte lu ne les y range non plus, et la mention 20 du
 * modèle de livre de paie de 2008 (le brut, total des mentions 7, 10, 11, 12,
 * 13, 16 et 19) ne les nomme pas. OmegaX les garde dans l'assiette sociale,
 * le sens qui ne retire rien aux droits du travailleur, et le DIT sur la ligne.
 */
export const RESERVE_ASSIETTE_SOCIALE_INDEMNITE =
  "ASSIETTE SOCIALE · lecture d'OmegaX, le corpus se tait. L'indemnité de fin de contrat n'est ni nommée ni exclue " +
  "par l'art. 7, point 8 du Code du travail (liste d'exclusion fermée), et la mention 20 du modèle de livre de paie " +
  "de 2008 ne la range pas dans le brut. Elle reste dans l'assiette sociale ; ses avantages en logement ou en " +
  "transport, eux, sont ventilés sous leur nature, que l'art. 7 exclut.";

export const AVERTISSEMENT_SANS_COMPTE =
  "CE DOCUMENT NE PASSERA PAS AU JOURNAL tant que le compte de cette nature n'est pas tranché · aucune fiche du compte " +
  "66 des deux textes ne le nomme, et OmegaX n'en devine aucun (pas même le 6616). La paie du mois qui le porte sera " +
  "refusée à la passation.";

/** Les natures qu'une ventilation d'avantages admet (Code du travail, art. 63, al. 3 ; art. 70, al. 2 ; art. 7, point 8). */
export type NatureVentilation = 'LOGEMENT_OU_SON_INDEMNITE' | 'INDEMNITE_DE_TRANSPORT' | 'SOINS_DE_SANTE' | 'REMUNERATION';

/**
 * LA PART D'AVANTAGES D'UNE RUBRIQUE, ventilée par le cabinet. `REMUNERATION`
 * désigne un avantage que l'art. 7, point 8 garde dans la rémunération (« la
 * valeur des avantages en nature ») · il reste sous l'indemnité de fin de
 * contrat. Logement, transport et soins sortent de l'assiette sociale sous
 * leur nature, avec leurs conditions fiscales (art. 69, 8° de la loi
 * n° 23/053, attestation comprise).
 */
export type VentilationAvantage = {
  readonly rubrique: string;
  readonly nature: NatureVentilation;
  readonly libelle: string;
  readonly montantFc: number;
  readonly conditionArticle69Attestee?: boolean;
};

/** Un élément de paie tel que la simulation le reçoit. */
export type ElementDecompte = {
  readonly nature: NatureElementPaie;
  readonly libelle: string;
  readonly montantFc: number;
  readonly cleRubrique: string;
  readonly conditionArticle69Attestee?: boolean;
  readonly reserve: string | null;
};

/** Au centime, comme la base garde les montants (Decimal 18,2). */
export const auCentime = (fc: number): number => Math.round(fc * 100) / 100;

export const MOTIF_GRATIFICATION = 'Déclarez la gratification, zéro compris.';

/**
 * LE VERDICT DU DÉCOMPTE TRADUIT EN ÉLÉMENTS, ou les raisons de ne pas émettre.
 *
 * UN SOLDE PARTIEL NE S'ÉMET PAS · le décompte remis au travailleur devient
 * opposable (art. 103), et un total `null` est un solde que personne n'a fini
 * de chiffrer. Chaque rubrique indéterminée est nommée avec sa réserve.
 *
 * CHAQUE RUBRIQUE EST ARRONDIE AU CENTIME AVANT D'ÊTRE UN ÉLÉMENT · c'est le
 * montant que le document figé porte, et les totaux se comparent après.
 *
 * UNE RUBRIQUE À ZÉRO NE FAIT PAS D'ÉLÉMENT · le zéro est une réponse (faute
 * lourde, préavis presté), il reste dans le verdict figé ; il n'a rien à
 * passer au journal.
 *
 * LA PART « AVANTAGES » SE VENTILE, ou l'émission est refusée · logement et
 * transport sont exclus NOMMÉMENT de la rémunération (art. 7, point 8), et les
 * laisser dans l'indemnité les ferait cotiser.
 */
export function elementsDuDecompte(
  verdict: VerdictDecompteFinal,
  ventilation: readonly VentilationAvantage[] = [],
): {
  elements: ElementDecompte[];
  refus: string[];
} {
  const refus: string[] = [];
  const elements: ElementDecompte[] = [];
  const toutes: readonly RubriqueDecompte[] = [...verdict.rubriques, ...verdict.horsBrut];
  const ventilees = new Set<string>();
  for (const r of toutes) {
    if (r.montantFc === null) {
      refus.push(r.cle === 'gratification' ? MOTIF_GRATIFICATION : `${r.libelle} non chiffrée · ${r.reserve ?? r.fondement}`);
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
    const montant = auCentime(r.montantFc);
    if (montant === 0) continue;
    const reserve = nature === 'INDEMNITE_DE_FIN_DE_CONTRAT' ? RESERVE_ASSIETTE_SOCIALE_INDEMNITE : null;
    const avantages = auCentime(r.avantagesInclusFc ?? 0);
    if (avantages <= 0) {
      elements.push({ nature, libelle: r.libelle, montantFc: montant, cleRubrique: r.cle, reserve });
      continue;
    }
    const lignes = ventilation.filter((v) => v.rubrique === r.cle);
    ventilees.add(r.cle);
    const ventile = auCentime(lignes.reduce((n, v) => n + auCentime(v.montantFc), 0));
    if (lignes.length === 0 || ventile !== avantages || lignes.some((v) => !(v.montantFc > 0))) {
      refus.push(
        `${r.libelle} · ${avantages.toFixed(2)} FC d'avantages de toute nature sont compris dans ce montant · ventilez-les ` +
          'par nature (logement, transport, soins, ou avantage gardé dans la rémunération), au centime' +
          (lignes.length ? ` (${ventile.toFixed(2)} FC ventilés).` : '.'),
      );
      continue;
    }
    elements.push({ nature, libelle: r.libelle, montantFc: auCentime(montant - avantages), cleRubrique: r.cle, reserve });
    for (const v of lignes) {
      const natureV: NatureElementPaie = v.nature === 'REMUNERATION' ? 'INDEMNITE_DE_FIN_DE_CONTRAT' : v.nature;
      elements.push({
        nature: natureV,
        libelle: v.libelle,
        montantFc: auCentime(v.montantFc),
        cleRubrique: r.cle,
        ...(typeof v.conditionArticle69Attestee === 'boolean' ? { conditionArticle69Attestee: v.conditionArticle69Attestee } : {}),
        reserve: natureV === 'INDEMNITE_DE_FIN_DE_CONTRAT' ? RESERVE_ASSIETTE_SOCIALE_INDEMNITE : null,
      });
    }
  }
  for (const v of ventilation) {
    if (!ventilees.has(v.rubrique)) {
      refus.push(`« ${v.libelle} » · la rubrique ${v.rubrique} ne comprend aucun avantage à ventiler.`);
    }
  }
  if (refus.length === 0 && (verdict.totalBrutFc === null || verdict.totalDuAuTravailleurFc === null)) {
    refus.push('Le total du décompte est indéterminé.');
  }
  return { elements: elements.filter((e) => e.montantFc > 0), refus };
}

/**
 * LE DOUBLE COMPTE · une même nature payée deux fois, par le mois et par le
 * décompte. Le congé, la gratification et les allocations familiales ont
 * chacun leur rubrique au décompte (art. 144, art. 7 point 8, art. 66 et 142) ·
 * les saisir aussi parmi les éléments du mois les verserait deux fois.
 */
export const NATURES_PROPRES_AU_DECOMPTE: readonly NatureElementPaie[] = [
  'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE',
  'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE',
  'ALLOCATIONS_FAMILIALES_LEGALES',
];

export function motifsDoubleCompte(
  elementsDuMois: readonly { nature: NatureElementPaie; montantFc: number }[],
  indemnites: readonly ElementDecompte[],
): string[] {
  return NATURES_PROPRES_AU_DECOMPTE.filter(
    (n) => elementsDuMois.some((e) => e.nature === n && e.montantFc > 0) && indemnites.some((e) => e.nature === n),
  ).map(
    (n) =>
      `${n} figure à la fois parmi les éléments du mois et dans une rubrique du décompte · elle serait versée deux fois. ` +
      'Retirez-la des éléments du mois, le décompte la porte.',
  );
}

/** Un élément négatif n'est pas un élément de paie · une retenue a sa propre voie (art. 112). */
export function motifsElementsNegatifs(elements: readonly { libelle: string; montantFc: number }[]): string[] {
  return elements
    .filter((e) => !(typeof e.montantFc === 'number' && Number.isFinite(e.montantFc) && e.montantFc >= 0))
    .map((e) => `« ${e.libelle} » · montant négatif ou illisible · un élément de paie ne se saisit pas en négatif.`);
}

/**
 * LES NATURES QUE LA PASSATION N'IMPUTE PAS, présentes sur le document ·
 * l'émission AVERTIT (le document se remet au travailleur), la passation
 * refusera (P3). Rien n'est imputé à leur place.
 */
export function avertissementsPassation(
  elements: readonly { nature: string }[],
  sansImputation: Readonly<Partial<Record<string, string>>>,
): string[] {
  const natures = [...new Set(elements.map((e) => e.nature).filter((n) => sansImputation[n]))];
  return natures.map((n) => `${n} · ${AVERTISSEMENT_SANS_COMPTE}`);
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
    // Aucun plancher à zéro · un négatif est REFUSÉ avant
    // (`motifsElementsNegatifs`), il ne se lit pas comme rien.
    .reduce((n, e) => n + Math.round(e.montantFc * 100), 0);
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
