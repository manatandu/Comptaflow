/**
 * LA DÉPRÉCIATION D'UN BIEN EN COURS ET SON SORT À LA MISE EN SERVICE (ligne
 * A22, relevé ancien des lots 1 et 15) · règles pures.
 *
 * CE QUE LES TEXTES ÉCRIVENT.
 *  · Les deux plans ouvrent un 29 pour l'en-cours de chaque division · AUDCIF
 *    Titre VII, fiche du compte 29, « 2919 immobilisations incorporelles en
 *    cours », « 2929 aménagements de terrains en cours », « 2939 bâtiments et
 *    installations en cours », « 2949 matériel en cours » ; SYCEBNL Partie 2
 *    ch. 2, mêmes numéros sous 291 à 294. Et les deux fiches du compte 29
 *    disent que « les dotations aux dépréciations doivent être pratiquées à
 *    la clôture de l'exercice [...] aussi bien sur les immobilisations
 *    acquises que sur celles EN COURS DE FABRICATION ».
 *  · Les fiches des comptes 21 à 24 écrivent le virement du BRUT à
 *    l'achèvement (« portés au débit des comptes 231 à 238 par le crédit du
 *    239 »), et aucune ne parle de la dépréciation.
 *  · Les deux fiches du compte 29 ne connaissent que DEUX mouvements · crédit
 *    par la dotation (691, 697, 853 ; SYCEBNL 69 ou 853), débit par la
 *    reprise (791, 797, 863 ; SYCEBNL 79 ou 863). AUCUN virement de 29 à 29.
 *
 * DÉCISION, PRISE PAR LES TEXTES (§ 1 du règlement intérieur, « une question
 * de fond se tranche par la loi »).
 *  (1) AUCUN VIREMENT n'est inventé · la mise en service ne touche pas au
 *      29x9, faute de texte qui le fasse, et le relevé du lot 1 (« non
 *      comblé · virement de la dépréciation 29x9 à l'achèvement ») reste
 *      vrai.
 *  (2) LA MISE EN SERVICE N'EST PAS REFUSÉE. Le refus « reprenez d'abord la
 *      dépréciation, puis refaites-la sur le compte définitif » enfermerait le
 *      bien · une seule dépréciation par bien et par exercice
 *      (`@@unique([immobilisationId, exerciceId])`), et la fiche du compte 29
 *      ne place reprise et dotation qu'« à la clôture de l'exercice » · la
 *      reprise et la dotation nouvelle tomberaient sur la même clôture, la
 *      seconde serait refusée, et une reprise sans recouvrement de valeur
 *      serait une écriture que le ch. 12 § 2.4.2 ne justifie pas. La
 *      dépréciation RESTE au 29x9 et la mise en service le DIT, montant et
 *      compte nommés, avec sa conséquence · le bilan lit le 29x9 par sa
 *      propre correspondance (au SYSCOHADA, « 2939p » rangé en AL par
 *      `correspondance-bilan-syscohada.ts`), si bien que le net du poste du
 *      bien achevé peut en être faussé jusqu'à la reprise. Comment placer
 *      cette dépréciation sous le poste du bien achevé (virement, que nul
 *      texte n'écrit, ou reprise et dotation à la même clôture, que le
 *      module n'admet pas) est une question que le corpus ne tranche pas ·
 *      remontée à Manasse (AVANCEMENT-A22.md).
 *  (3) UN BIEN, UN COMPTE 29 · tant qu'une dépréciation est en place, ses
 *      dotations et reprises suivantes s'inscrivent au compte qui la porte.
 *      Sans cela, une reprise au 2931 d'une dépréciation dotée au 2939 rend le
 *      2931 DÉBITEUR (la fiche du compte 29 dit des « corrections d'actif de
 *      sens négatif ») pendant que le 2939 reste créditeur pour un bien
 *      achevé, sur des écritures équilibrées · et la sortie, qui solde le
 *      compte de la dernière dépréciation, laisserait l'autre en place. C'est
 *      aussi la règle du reclassement, qui vire le cumul vers UN compte.
 *  (4) LA PREMIÈRE DOTATION SUIT LE COMPTE OÙ LE BIEN EST INSCRIT À LA
 *      CLÔTURE · SYSCOHADA seul, par la même phrase que la division (« les
 *      comptes 28 et 29 ont été développés selon la structure des comptes de
 *      la classe 2 », AUDCIF Titre VII ch. 2) · un bien au 239 se déprécie au
 *      2939, un bien au 231 jamais au 2939. Le SYCEBNL n'écrit pas cette
 *      phrase, et `comptes-du-bien.ts` ne lui transpose pas la division ;
 *      rien de plus ne lui est transposé ici.
 */

const EPSILON = 0.005;
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Un compte de dépréciation d'immobilisation en cours (2919, 2929, 2939, 2949 et leurs subdivisions). */
export function estCompteDepreciationEnCours(numero: string): boolean {
  return /^29[1-4]9/.test(numero);
}

export interface MouvementDepreciation {
  sens: 'DOTATION' | 'REPRISE';
  montant: number;
  compteDepreciationId: string;
}

/** Le cumul de dépréciation que chaque compte 29 porte pour ce bien · les comptes à zéro sont écartés. */
export function cumulsParCompte29(depreciations: readonly MouvementDepreciation[]): Map<string, number> {
  const cumuls = new Map<string, number>();
  for (const d of depreciations) {
    const signe = d.sens === 'DOTATION' ? 1 : -1;
    cumuls.set(d.compteDepreciationId, centimes((cumuls.get(d.compteDepreciationId) ?? 0) + signe * d.montant));
  }
  for (const [id, cumul] of cumuls) if (Math.abs(cumul) <= EPSILON) cumuls.delete(id);
  return cumuls;
}

/**
 * Pourquoi ce compte 29 ne reçoit pas ce mouvement · null s'il convient.
 * `cumuls` rend le cumul porté par chaque compte (`cumulsParCompte29`),
 * `numeros` le numéro de chacun. `inscritEnCours` dit si le bien est au 2x9 à
 * la date de l'écriture (la clôture de l'exercice).
 */
export function motifRefusCompte29DuBien(o: {
  syscohada: boolean;
  compteChoisi: { id: string; numero: string };
  cumuls: ReadonlyMap<string, number>;
  numeros: ReadonlyMap<string, string>;
  inscritEnCours: boolean;
}): string | null {
  const porteurs = [...o.cumuls.entries()];
  if (porteurs.length > 0) {
    if (porteurs.some(([id]) => id === o.compteChoisi.id) && porteurs.length === 1) return null;
    const liste = porteurs.map(([id, c]) => `${o.numeros.get(id) ?? id} (${c.toFixed(2)})`).join(', ');
    if (porteurs.length > 1) {
      // Un historique déjà réparti sur deux comptes · rien ne le répare
      // d'office, et un troisième compte l'aggraverait.
      if (porteurs.some(([id]) => id === o.compteChoisi.id)) return null;
      return (
        `La dépréciation de ce bien est inscrite sur plusieurs comptes (${liste}) · un mouvement nouveau ne s'inscrit ` +
        "que sur l'un d'eux (fiche du compte 29, dotation au crédit, reprise au débit du même compte)."
      );
    }
    const enCours = estCompteDepreciationEnCours(o.numeros.get(porteurs[0][0]) ?? '');
    return (
      `La dépréciation de ce bien est inscrite au ${liste} · ses dotations et reprises suivantes s'y inscrivent tant ` +
      "qu'elle n'est pas reprise en entier, sans quoi ce compte resterait créditeur et l'autre deviendrait débiteur " +
      '(fiche du compte 29).' +
      (enCours
        ? " Elle a été constatée quand le bien était en cours · aucun texte ne la vire au compte du bien achevé (les fiches du compte 29 ne connaissent que la dotation et la reprise), elle reste donc à ce compte."
        : '')
    );
  }
  if (!o.syscohada) return null;
  const choisiEnCours = estCompteDepreciationEnCours(o.compteChoisi.numero);
  if (o.inscritEnCours && !choisiEnCours) {
    return (
      `Ce bien est encore inscrit en cours à la clôture · sa dépréciation s'inscrit au 29x9 de sa division (2919, 2929, ` +
      `2939 ou 2949), pas au ${o.compteChoisi.numero} · « les comptes 28 et 29 ont été développés selon la structure des ` +
      'comptes de la classe 2 » (AUDCIF, Titre VII ch. 2).'
    );
  }
  if (!o.inscritEnCours && choisiEnCours) {
    return (
      `Le compte ${o.compteChoisi.numero} déprécie une immobilisation EN COURS · ce bien est inscrit à son compte ` +
      'définitif à la clôture, sa dépréciation va au 29 de ce compte (AUDCIF, Titre VII ch. 2 et fiche du compte 29).'
    );
  }
  return null;
}

/**
 * Ce que la mise en service dit d'une dépréciation laissée au 29x9 · null
 * sans rien à dire. Rien n'est passé (décision (1) et (2) ci-dessus).
 */
export function avertissementDepreciationEnCours(
  cumuls: ReadonlyMap<string, number>,
  numeros: ReadonlyMap<string, string>,
): string | null {
  const enCours = [...cumuls.entries()].filter(([id, c]) => c > EPSILON && estCompteDepreciationEnCours(numeros.get(id) ?? ''));
  if (enCours.length === 0) return null;
  const liste = enCours.map(([id, c]) => `${c.toFixed(2)} au ${numeros.get(id)}`).join(', ');
  return (
    `La dépréciation constatée pendant les travaux (${liste}) reste à ce compte · aucun texte ne la vire au compte ` +
    "du bien achevé, les fiches du compte 29 ne connaissant que la dotation et la reprise. Elle s'ajuste à la " +
    'clôture sur ce même compte, le plan du bien se ré-étale sur la valeur nette, et le bilan la range sous le ' +
    'poste de ce compte, qui n’est pas forcément celui du bien achevé, tant qu’elle n’est pas reprise.'
  );
}
