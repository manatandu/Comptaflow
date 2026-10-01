/**
 * LES INCORPORELS À DURÉE D'UTILITÉ NON LIMITÉE (lot 10) · règles pures.
 *
 * AUDCIF Titre VIII ch. 2 · ce que le texte ne fait pas amortir tant que la
 * durée n'a pas de fin prévisible :
 *  · § 1.3.3 · le droit d'exclusivité public dont la durée s'avère
 *    « indéterminable » « n'est pas amorti avant que l'on puisse déterminer
 *    que sa durée d'utilisation a une fin » ;
 *  · § 3.2.2 c · le nom de domaine, « pour lequel l'usage n'est pas limité
 *    dans le temps, est un actif non amortissable » ;
 *  · § 4.2.2 · la marque n'est amortissable que si la durée de consommation
 *    de ses avantages « est déterminable », et il convient de « démontrer
 *    que cet actif incorporel n'a pas de fin prévisible » ;
 *  · § 7.2.2.1 · le fonds commercial « n'est pas amortissable car sa durée
 *    d'utilité est présumée non limitée ».
 *
 * TOUT INCORPOREL, SAUF CEUX QUE LE TEXTE FAIT AMORTIR (décision D-22 de
 * Manasse du 2026-10-01) · le § 4.2.2 vise « la marque ou tout autre actif
 * incorporel » ; une justification écrite est exigée, sauf au fonds
 * commercial que le texte présume non limité.
 *
 * SYSCOHADA SEUL (décision D-23) · la règle vient du Titre VIII de l'AUDCIF ;
 * le SYCEBNL n'en écrit aucune, et son plan n'ouvre ni 215 ni 216.
 *
 * LA BASCULE EST PROSPECTIVE (§ 4.2.2) · « la valeur actuelle de la marque à
 * la date du changement d'estimation (un test de dépréciation est réalisé et
 * la marque, le cas échéant, fait l'objet d'une dépréciation) est amortie
 * sur la durée d'utilité résiduelle ». Exemple du texte · décision le 1er
 * septembre N, arrêt le 30 août N+4, « amortissable sur une durée de 4 ans
 * [...] à compter de la date de la décision ».
 *
 * DIX ANS, deux cas du fonds commercial seulement (§ 7.2.2.1) · durée
 * limitée « et ne peut être estimée de manière fiable » ; SMT, « par
 * simplification ».
 */

export type FondementDureeDixAns = 'NON_ESTIMABLE' | 'SIMPLIFICATION_SMT';

/** Les incorporels que le texte fait toujours amortir, avec leur passage. */
export const INCORPORELS_TOUJOURS_AMORTIS: readonly { racine: string; motif: string }[] = [
  { racine: '211', motif: "Les frais de développement s'amortissent sur leur durée d'utilisation (AUDCIF Titre VIII ch. 1 § 2.2.2)." },
  { racine: '2121', motif: 'Un brevet bénéficie d\'une protection juridique, sa durée est déterminable · « les brevets sont amortissables » (ch. 2 § 1.1.3).' },
  { racine: '2122', motif: "Une licence s'amortit sur sa durée probable d'utilisation, qui « ne peut excéder la durée de l'autorisation » (ch. 2 § 1.2.3)." },
  { racine: '2131', motif: "Un logiciel se répartit « sur sa durée probable d'utilisation, selon un plan d'amortissement » (ch. 2 § 2.4)." },
  { racine: '216', motif: 'Le droit au bail « doit être amorti sur la durée du bail » (ch. 2 § 5.1).' },
  { racine: '2182', motif: 'Les coûts d\'obtention du contrat sont « amortis sur une base systématique » (ch. 2 § 8).' },
];

const MOTIF_SITE_INTERNET =
  "Un site internet s'amortit sur sa « durée réelle d'utilisation, en principe courte » (ch. 2 § 3.2.2 c) · seul le nom de domaine, dont l'usage n'est pas limité dans le temps, ne s'amortit pas. Déclarez-le comme nom de domaine.";

export const JUSTIFICATION_PRESUMEE_FONDS_COMMERCIAL =
  'Fonds commercial · durée d\'utilité présumée non limitée (AUDCIF Titre VIII ch. 2 § 7.2.2.1).';

export const MOTIF_NON_AMORTI =
  "Durée d'utilité non limitée · l'incorporel n'est pas amorti tant que sa durée n'a pas de fin prévisible (AUDCIF Titre VIII ch. 2 § 4.2.2). La dépréciation reste ouverte ; quand la durée devient limitée, déclarez-le.";

export const estFondsCommercial = (numero: string) => numero.startsWith('215');

export function motifRefusDureeNonLimitee(o: {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  numeroCompte: string;
  justification?: string | null;
  nomDeDomaine?: boolean;
}): string | null {
  if (o.referentiel !== 'SYSCOHADA') {
    return "La durée d'utilité non limitée vient du Titre VIII de l'AUDCIF (ch. 2) · le SYCEBNL n'en écrit aucune, l'incorporel s'y amortit sur sa durée d'utilité.";
  }
  if (!o.numeroCompte.startsWith('21')) {
    return "Seule une immobilisation incorporelle (21) peut avoir une durée d'utilité non limitée · un bien corporel s'amortit, ou ne s'amortit pas selon son compte (terrain).";
  }
  if (o.numeroCompte.startsWith('219')) {
    return "Une immobilisation incorporelle en cours n'est pas encore en service · sa durée d'utilité se déclare à l'achèvement.";
  }
  const exclu = INCORPORELS_TOUJOURS_AMORTIS.find((e) => o.numeroCompte.startsWith(e.racine));
  if (exclu) return exclu.motif;
  if (o.numeroCompte.startsWith('2132') && !o.nomDeDomaine) return MOTIF_SITE_INTERNET;
  if (!estFondsCommercial(o.numeroCompte) && !o.justification?.trim()) {
    return "Démontrez que l'incorporel n'a pas de fin prévisible et que ses avantages économiques devraient perdurer (AUDCIF Titre VIII ch. 2 § 4.2.2) · la justification est exigée.";
  }
  return null;
}

/** Le fonds commercial amorti dix ans · seulement dans les deux cas du § 7.2.2.1. */
export function motifRefusDureeDixAns(o: {
  numeroCompte: string;
  fondement: FondementDureeDixAns;
  dureeAns: number | null | undefined;
  systemeMinimal: boolean;
}): string | null {
  if (!estFondsCommercial(o.numeroCompte)) {
    return 'Les dix ans du § 7.2.2.1 ne visent que le fonds commercial (215).';
  }
  if (o.dureeAns !== 10) return 'Ce fondement fixe la durée à dix ans · « le dixième de la base amortissable » (ch. 2 § 7.2.2.1).';
  if (o.fondement === 'SIMPLIFICATION_SMT' && !o.systemeMinimal) {
    return 'La simplification des dix ans est ouverte aux « petites entités assujetties au Système minimal de trésorerie » (ch. 2 § 7.2.2.1) · ce dossier tient le Système normal.';
  }
  return null;
}

/** La durée devient limitée · ce qui se refuse avant la bascule. */
export function motifRefusBascule(o: {
  dureeNonLimitee: boolean;
  enService: boolean;
  dateDecision: Date;
  debutPossible: Date | null;
  dureeResiduelleAns: number;
  testDepreciation: string | null | undefined;
  motif: string | null | undefined;
}): string | null {
  if (!o.dureeNonLimitee) return "La durée d'utilité de ce bien est déjà limitée · elle se révise, elle ne bascule pas.";
  if (!o.enService) return 'Le bien est sorti · sa durée ne se déclare plus.';
  if (!o.debutPossible) return "Le bien n'est pas encore mis en service · la durée se déclare avec la mise en service.";
  if (o.dateDecision < o.debutPossible) return 'La décision précède la mise en service du bien.';
  if (!(o.dureeResiduelleAns >= 1)) return "La durée d'utilité résiduelle se compte en années entières, une au moins.";
  if (!o.motif?.trim()) return "Dites ce qui rend la durée limitée (décision d'arrêter, contrat, autorisation) · AUDCIF Titre VIII ch. 2 § 7.2.2.1.";
  if (!o.testDepreciation?.trim()) {
    return "« Un test de dépréciation est réalisé » à la date du changement d'estimation (ch. 2 § 4.2.2) · indiquez son résultat, et passez d'abord la dépréciation s'il y en a une.";
  }
  return null;
}

/** La date d'où part le plan · la bascule, sinon la mise en service. */
export function debutAmortissement(i: { dateDebutAmortissement?: Date | null; dateMiseEnService: Date | null }): Date | null {
  return i.dateDebutAmortissement ?? i.dateMiseEnService;
}
