import { Referentiel, SensDepreciation } from '@prisma/client';

/**
 * LES COMPTES QUI SUIVENT LE BIEN · amortissement, dépréciation et leurs
 * contreparties, lus dans le Titre VII de l'AUDCIF et dans la Partie 2 ch. 3
 * du SYCEBNL. Chaque règle est une fonction pure, appelée à la porte du
 * service (famille, dotation, dépréciation) et par tout lecteur qui en a
 * besoin (tableaux, sortie, contrôles), pour qu'aucune copie ne diverge.
 *
 * Passe R1 (A1, A4, A5) et R5 (B1) · 2026-09-30.
 */

/**
 * UN BIEN QUE LE PLAN NE FAIT PAS AMORTIR · le motif, ou `null`.
 *
 * Le module amortissait tout compte 20 à 27 · une écriture 68/28 sur un
 * terrain nu, un titre de participation ou un bien reçu en don destiné à la
 * vente s'équilibre, la balance boucle, et le résultat est minoré. Trois
 * familles de refus, chacune ÉCRITE dans les deux textes, et rien d'autre :
 *
 *  · SYCEBNL, division 20 hors 2011 · « les biens reçus en dons destinés à
 *    la vente sont comptabilisés à la valeur actuelle. Ils ne doivent pas être
 *    amortis mais la dépréciation doit être constatée en cas de perte de
 *    valeur » (Partie 2 ch. 3, présentation de la classe 2). L'usufruit
 *    temporaire (2011) s'amortit, lui, « sur la durée de la donation » (fiche
 *    du compte 20, au 280).
 *  · 25, 26 et 27 · le compte 28 n'ouvre AUCUNE subdivision pour eux (AUDCIF,
 *    fiche 28 : 281 à 284 ; SYCEBNL : 280 à 284), alors que « les comptes 28
 *    et 29 ont été développés selon la structure des comptes de la classe 2 »
 *    (AUDCIF, Titre VII ch. 2) et que le 29, lui, ouvre 295, 296 et 297. Une
 *    avance se solde, un titre se déprécie (« les moins-values sont inscrites
 *    au compte de dépréciations »).
 *  · Les terrains nus, bâtis, de carrières, aménagés, en concession et autres
 *    (222, 223, 225 à 228) · le 282 ne s'ouvre que sur « 2824 travaux de mise
 *    en valeur des terrains », et la fiche 22 des deux textes ne crédite le 282
 *    que « pour le montant des amortissements pratiqués sur les terrains
 *    agricoles ou forestiers et sur les travaux de mise en valeur des
 *    terrains ».
 *
 * CE QUE LA RÈGLE NE TRANCHE PAS, ET QUI RESTE AU CABINET · le 221 (terrains
 * agricoles et forestiers), que la fiche 22 dit amortissable quand le 282 ne
 * lui ouvre aucun sous-compte ; les incorporels à durée non limitée (fonds
 * commercial, marque) que le Titre VIII ch. 2 déclare non amortissables « en
 * principe » · c'est un jugement, pas un numéro. Aucune liste n'est inventée
 * pour eux. Les en-cours (2x9) sont tenus par la date de mise en service.
 *
 * La dépréciation (29) reste ouverte à tous ces biens.
 */
export function motifNonAmortissable(numeroCompte: string, referentiel: Referentiel): string | null {
  if (referentiel === Referentiel.SYCEBNL && numeroCompte.startsWith('20') && !numeroCompte.startsWith('2011')) {
    return (
      `Le compte ${numeroCompte} porte un bien reçu en don destiné à la vente · « Ils ne doivent pas être amortis ` +
      "mais la dépréciation doit être constatée en cas de perte de valeur » (SYCEBNL, Partie 2 ch. 3, classe 2). " +
      "Seul l'usufruit temporaire (2011) s'amortit."
    );
  }
  const texte =
    referentiel === Referentiel.SYSCOHADA ? 'AUDCIF, Titre VII, fiche du compte 28' : 'SYCEBNL, Partie 2 ch. 3, fiche du compte 28';
  if (/^2[567]/.test(numeroCompte)) {
    return (
      `Le compte ${numeroCompte} n'a aucun compte d'amortissement au plan · le compte 28 ne s'ouvre que sur les ` +
      `divisions 2${referentiel === Referentiel.SYCEBNL ? '0' : '1'} à 24 (${texte}). Une avance se solde, une ` +
      'immobilisation financière se déprécie au 29.'
    );
  }
  if (/^22[235678]/.test(numeroCompte)) {
    return (
      `Le compte ${numeroCompte} porte un terrain que le plan ne fait pas amortir · le 282 ne s'ouvre que sur ` +
      `« 2824 travaux de mise en valeur des terrains » (${texte}), et la fiche du compte 22 ne le crédite que pour ` +
      "les terrains agricoles ou forestiers et les travaux de mise en valeur. La dépréciation (29) reste ouverte."
    );
  }
  return null;
}

/**
 * LE 28 ET LE 29 SUIVENT LA DIVISION DU BIEN · SYSCOHADA.
 *
 * AUDCIF, Titre VII ch. 2 · « les comptes 28 et 29 ont été développés selon
 * la structure des comptes de la classe 2 » : 281/291 pour le 21, 282/292
 * pour le 22, 283/293 pour le 23, 284/294 pour le 24, 295 à 297 pour les 25 à
 * 27. Un bâtiment amorti au 2844 sortait brut au poste AK du bilan pendant que
 * le matériel, au poste AM, était minoré jusqu'au négatif · le total de
 * l'actif restait juste et rien ne le signalait. Au-delà de la division, le
 * sous-compte reste au cabinet.
 *
 * Le SYCEBNL n'est pas visé · sa structure est la même (280 à 284, 290 à 297),
 * mais son texte n'écrit pas la phrase du ch. 2, et rien n'est transposé.
 */
function motifRefusDivision(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte: string,
  racine: '28' | '29',
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  const attendu = `${racine}${numeroBien.charAt(1)}`;
  if (numeroCompte.startsWith(attendu)) return null;
  return (
    `Le compte ${numeroCompte} ne correspond pas à la division du bien (${numeroBien}) · attendu un ${attendu}. ` +
    '« Les comptes 28 et 29 ont été développés selon la structure des comptes de la classe 2 » (AUDCIF, Titre VII ch. 2).'
  );
}

export function motifRefusCompteAmortissement(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte28: string,
): string | null {
  return motifRefusDivision(referentiel, numeroBien, numeroCompte28, '28');
}

export function motifRefusCompteDepreciation(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte29: string,
): string | null {
  return motifRefusDivision(referentiel, numeroBien, numeroCompte29, '29');
}

/**
 * LA CONTREPARTIE D'UNE DÉPRÉCIATION · SYSCOHADA, fiche du compte 29.
 *
 * « Le compte 29 est crédité de la dotation aux provisions, par le débit du
 * 691 […], ou du 697 […], ou du 853 […]. Le compte 29 est débité de la reprise
 * de provision, par le crédit du 791 […], du 797 […], ou du 863. » Le serveur
 * ne bornait rien · une dotation passait au débit d'un 681, une reprise au
 * crédit d'un 758, sur une écriture équilibrée. Le choix entre exploitation,
 * financier et H.A.O. reste au comptable.
 *
 * Le SYCEBNL écrit sa propre fiche 29, non transposée ici.
 */
export const CONTREPARTIES_DEPRECIATION_SYSCOHADA: Record<SensDepreciation, readonly string[]> = {
  [SensDepreciation.DOTATION]: ['691', '697', '853'],
  [SensDepreciation.REPRISE]: ['791', '797', '863'],
};

export function motifRefusContrepartieDepreciation(
  referentiel: Referentiel,
  sens: SensDepreciation,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  const admises = CONTREPARTIES_DEPRECIATION_SYSCOHADA[sens];
  if (admises.some((r) => numeroContrepartie.startsWith(r))) return null;
  return (
    `Le compte ${numeroContrepartie} n'est pas une contrepartie de ${sens === SensDepreciation.DOTATION ? 'dotation' : 'reprise'} ` +
    `de dépréciation · la fiche du compte 29 (AUDCIF, Titre VII) nomme ${admises.join(', ')}.`
  );
}

/**
 * LA CRÉANCE NÉE D'UNE CESSION · SYSCOHADA, deux exclusions écrites, et deux
 * seulement (passe R1, B6).
 *
 *  · Fiche du compte 41, Exclusions · « Les créances sur des tiers nées des
 *    opérations autres que la vente des marchandises, des produits
 *    intermédiaires, des produits finis ou services → 485 (Créances sur
 *    cessions d'immobilisations). » Une cession H.A.O. (produit au 82) ne se
 *    porte donc pas sur un client.
 *  · Fiche du compte 48, Commentaires · les créances sur cessions sont H.A.O.
 *    hors de l'activité courante ; « dans le cas contraire, elles constituent
 *    des créances rattachées au compte Client (compte 414) et sont débitées
 *    par le crédit du compte 754 ». Une cession courante ne se porte donc pas
 *    au 485.
 *
 * Le bilan range le 485 en BA et le 41 en BI · l'écriture s'équilibre et le
 * besoin de financement H.A.O. que le 48 existe pour mesurer est faux. Le
 * reste de la contrepartie demeure libre : les fiches 82 et 754 disent « par
 * le débit des comptes de tiers concernés ou des comptes de trésorerie », et
 * une liste fermée refuserait un chèque, un apport contre titres ou une
 * compensation que le texte admet.
 */
export function motifRefusContrepartieCession(
  referentiel: Referentiel,
  cessionCourante: boolean,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  if (!cessionCourante && numeroContrepartie.startsWith('41')) {
    return (
      `Une cession hors activités ordinaires ne se porte pas sur un compte client (${numeroContrepartie}) · « Les ` +
      "créances sur des tiers nées des opérations autres que la vente […] → 485 (Créances sur cessions " +
      "d'immobilisations) » (AUDCIF, Titre VII, fiche du compte 41, Exclusions)."
    );
  }
  if (cessionCourante && numeroContrepartie.startsWith('485')) {
    return (
      `Une cession courante ne se porte pas au ${numeroContrepartie} · ses créances « constituent des créances ` +
      "rattachées au compte Client (compte 414) et sont débitées par le crédit du compte 754 » (AUDCIF, Titre VII, " +
      'fiche du compte 48).'
    );
  }
  return null;
}
