/**
 * LES SUITES D'UNE RÉÉVALUATION (ligne A15) · règles pures, sans base.
 *
 * Le lot 14 passe l'opération (`reevaluation-bilan.ts`). Ce qui la suit ·
 * l'information des notes annexes, le tableau des amortissements, la
 * déclaration spéciale et le sort de l'écart quand le bien sort.
 *
 * SOURCES LUES · AUDCIF Titre VIII ch. 28 § 4.2.2, § 4.2.4.2, § 6 et § 8 ;
 * Titre IX ch. 6, NOTE 3E ; Titre VII, fiches des comptes 106, 11 et 15 ;
 * SYCEBNL Partie 4 ch. 2, NOTE 5H, et fiches des comptes 10, 11 et 15 ; loi
 * n° 23/053, art. 19, 129, 132 à 138 (compilation DGI au 19 juillet 2026).
 */

export type Ref = 'SYSCOHADA' | 'SYCEBNL';

const EPSILON = 0.005;
const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * LA PART DE LA DOTATION DUE À LA RÉÉVALUATION · ch. 28 § 4.2.2, « Les
 * amortissements nouveaux sont donc égaux à ceux qui étaient initialement
 * prévus, multipliés par le coefficient k (ou k') ». La dotation de
 * l'exercice porte TOUTES les réévaluations antérieures du bien, d'où
 * D × (1 − 1/∏k') · la même chaîne que la reprise de la provision spéciale
 * (`partsDuSupplement`), sans la borne du reste à reprendre, puisqu'ici on
 * MONTRE l'amortissement supplémentaire (ch. 28 § 8, « les amortissements
 * supplémentaires résultant de la réévaluation » ; loi n° 23/053, art. 135),
 * qu'il soit au 106 ou au 154.
 *
 * Seules les réévaluations d'exercices ANTÉRIEURS comptent · la dotation de
 * l'exercice de réévaluation se passe avant elle, sur les valeurs anciennes
 * (art. 63 ; ch. 28 § 3.2), elle n'a donc aucun supplément.
 */
export function supplementDeLaDotation(dotation: number, coefficientsAnterieurs: number[]): number {
  const produit = coefficientsAnterieurs.reduce((p, k) => p * k, 1);
  if (!(produit > 1 + 1e-9) || !(Math.abs(dotation) > EPSILON)) return 0;
  return centimes(dotation * (1 - 1 / produit));
}

/** Une ligne de réévaluation d'un bien, telle que le module la garde. */
export interface LigneEcartDuBien {
  id: string;
  compteEcart: string | null;
  ecart: number;
  provisionReprise: number;
  ecartImpute: number;
  ecartTransfere: number;
}

export type TraitementALaSortie = 'RESERVE' | 'REPRISE_861' | 'NON_PASSE';

export interface SortDeLEcart {
  ligneId: string;
  compteEcart: string;
  montant: number;
  traitement: TraitementALaSortie;
  /** Pourquoi rien n'est passé · présent seulement pour `NON_PASSE`. */
  motif: string | null;
}

export const MOTIF_154_HORS_SERVICE =
  'Bien mis hors service · le reste de la provision spéciale de réévaluation (154) n’est pas repris. La loi ' +
  'n° 23/053 (art. 133, al. 3) ne règle que la CESSION d’un élément réévalué ; l’AUDCIF (Titre VIII ch. 28 § 6) ' +
  'fait transférer le solde de l’écart d’un bien mis hors service à une réserve non distribuable, quand la fiche du ' +
  'compte 15 ne réduit la provision que par les reprises H.A.O. Les textes ne tranchent pas · le cabinet décide ' +
  'et passe l’écriture lui-même.';

export const MOTIF_106_SYCEBNL =
  'Le texte du SYCEBNL ne dit pas ce que devient l’écart de réévaluation (106) d’un bien sorti · ni sa fiche du ' +
  'compte 10, ni la Partie 3 ch. 1 § 2.1.1.3. La règle de l’AUDCIF (Titre VIII ch. 28 § 6, réserve non ' +
  'distribuable) ne lui est pas prêtée, et le SYCEBNL n’ouvre aucune réserve « non distribuable ». L’écart reste ' +
  'au 106 · le cabinet décide et passe l’écriture lui-même.';

/**
 * LE SORT DE L'ÉCART QUAND LE BIEN SORT, ligne par ligne.
 *
 * 154 (neutralité) · à la CESSION, le reste non repris se reprend au 861 ·
 * loi n° 23/053, art. 133 al. 3, « la plus-value ou la moins-value est
 * calculée par rapport à la nouvelle valeur comptable, mais le résultat
 * comptable et le résultat fiscal ne doivent pas être modifiés car cette
 * réduction de la plus-value […] doit être exactement compensée par la
 * réintégration du solde de la plus-value de réévaluation se rapportant à
 * l'immobilisation cédée » ; la fiche du compte 15 des DEUX plans fait réduire
 * ou annuler la provision « exclusivement par Reprises H.A.O. » (SYCEBNL ·
 * « par le crédit du compte 86 »). Le 861 est celui de la reprise annuelle du
 * lot 14. Hors cession, rien (`MOTIF_154_HORS_SERVICE`).
 *
 * 106 · SYSCOHADA, toute sortie · ch. 28 § 6, « Le solde de l'écart de
 * réévaluation d'un bien cédé ou mis hors service doit faire l'objet d'un
 * transfert à un poste de réserve non distribuable ». Le solde est l'écart
 * de la ligne moins la perte de valeur déjà imputée sur lui (ch. 12 § 2.5) et
 * ce qui a déjà été transféré. SYCEBNL · rien (`MOTIF_106_SYCEBNL`).
 *
 * L'art. 133 al. 3 veut AUSSI le résultat comptable inchangé à la cession,
 * ce qu'un transfert du 106 à une réserve ne fait pas · mais le 106 « n'est
 * comptabilisé ni dans le Résultat, ni dans les Réserves » (ch. 28 § 5.1), et
 * la loi elle-même renvoie la comptabilisation aux art. 62 à 65 de l'AUDCIF
 * (art. 129, al. 1er). La compensation de l'art. 133 al. 3 et l'imposition
 * de l'art. 19 (« Si le bien est aliéné de quelque manière que ce soit, la
 * plus-value est imposable ») relèvent alors du résultat FISCAL · dites, jamais
 * retraitées ici (`catalogue-retraitements.ts`, le logiciel ne qualifie pas).
 */
export function sortDesEcarts(o: { referentiel: Ref; cession: boolean; lignes: LigneEcartDuBien[] }): SortDeLEcart[] {
  const sorts: SortDeLEcart[] = [];
  for (const l of o.lignes) {
    if (!l.compteEcart) continue;
    if (l.compteEcart.startsWith('154')) {
      const reste = centimes(l.ecart - l.provisionReprise);
      if (reste <= EPSILON) continue;
      sorts.push({
        ligneId: l.id,
        compteEcart: l.compteEcart,
        montant: reste,
        traitement: o.cession ? 'REPRISE_861' : 'NON_PASSE',
        motif: o.cession ? null : MOTIF_154_HORS_SERVICE,
      });
    } else if (l.compteEcart.startsWith('106')) {
      const solde = centimes(l.ecart - l.ecartImpute - l.ecartTransfere);
      if (solde <= EPSILON) continue;
      const syscohada = o.referentiel === 'SYSCOHADA';
      sorts.push({
        ligneId: l.id,
        compteEcart: l.compteEcart,
        montant: solde,
        traitement: syscohada ? 'RESERVE' : 'NON_PASSE',
        motif: syscohada ? null : MOTIF_106_SYCEBNL,
      });
    }
  }
  return sorts;
}

/**
 * LA RÉSERVE NON DISTRIBUABLE QUI REÇOIT LE 106 (SYSCOHADA seul) · le ch. 28
 * § 6 ne nomme pas le compte. La fiche du compte 11 le circonscrit · « réserves
 * indisponibles (légales, réglementées, statutaires) et réserves libres ou
 * facultatives » · d'où 111 Réserve légale, 112 Réserves statutaires ou
 * contractuelles et 113 Réserves réglementées. Le 118 « Autres réserves »
 * (1181 Réserves facultatives, 1188 Réserves diverses) porte les réserves
 * LIBRES, distribuables · refusé. Le choix entre les trois racines est celui du
 * cabinet (décision des organes, statuts), jamais présumé.
 */
export const RACINES_RESERVE_NON_DISTRIBUABLE = ['111', '112', '113'] as const;

export function motifRefusCompteReserve(numero: string | null | undefined): string | null {
  if (!numero) {
    return (
      'Choisissez la réserve non distribuable qui reçoit le solde de l’écart de réévaluation (AUDCIF Titre VIII ' +
      'ch. 28 § 6) · un compte sous 111, 112 ou 113, réserves indisponibles de la fiche du compte 11.'
    );
  }
  if (!RACINES_RESERVE_NON_DISTRIBUABLE.some((r) => numero.startsWith(r))) {
    return (
      `Le compte ${numero} n’est pas une réserve non distribuable · le solde de l’écart de réévaluation va à une ` +
      'réserve indisponible (111 Réserve légale, 112 Réserves statutaires ou contractuelles, 113 Réserves ' +
      'réglementées · fiche du compte 11), jamais au 118, qui porte les réserves libres (AUDCIF Titre VIII ch. 28 § 6).'
    );
  }
  return null;
}

/**
 * LES LIGNES DE L'ÉCRITURE QUI SOLDE L'ÉCART À LA SORTIE · par compte, deux
 * paires · D 106x / C réserve, D 154 / C 861. Les montants d'une même racine
 * s'additionnent par compte (un bien réévalué deux fois au même 1061).
 */
export function lignesSortDeLEcart(
  sorts: SortDeLEcart[],
): { reserve: Array<{ compteEcart: string; montant: number }>; reprise: number } {
  const parCompte = new Map<string, number>();
  let reprise = 0;
  for (const s of sorts) {
    if (s.traitement === 'RESERVE') parCompte.set(s.compteEcart, centimes((parCompte.get(s.compteEcart) ?? 0) + s.montant));
    else if (s.traitement === 'REPRISE_861') reprise = centimes(reprise + s.montant);
  }
  return {
    reserve: [...parCompte.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([compteEcart, montant]) => ({ compteEcart, montant })),
    reprise,
  };
}

/** Une rubrique de note qui range les comptes · libellé, préfixes et exclusions. */
export interface RubriquePoste {
  libelle: string;
  comptes?: readonly string[];
  exclusions?: readonly string[];
}

/**
 * LE POSTE DU BILAN D'UN BIEN · la rubrique de la note des immobilisations
 * brutes du jeu (NOTE 3A au SYSCOHADA, 5B des associations) qui lit son
 * compte, par la même règle que le calcul de la note (`correspond`, passée
 * par l'appelant). Aucun numéro écrit ici · un bien qu'aucune rubrique ne lit
 * garde son compte, jamais rangé ailleurs en silence.
 */
export function posteDuBien(
  numero: string,
  rubriques: readonly RubriquePoste[],
  correspond: (numero: string, prefixes: readonly string[], exclusions?: readonly string[]) => boolean,
): string {
  for (const r of rubriques) {
    if (r.comptes?.length && correspond(numero, r.comptes, r.exclusions ?? [])) return r.libelle;
  }
  return `Compte ${numero} (aucune rubrique de la note ne le lit)`;
}

/** Une réévaluation portée par un bien, telle que le tableau des amortissements la relit. */
export interface ReevaluationPortee {
  dateReevaluation: Date;
  coefficientRetenu: number;
  brutAvant: number;
  brutApres: number;
  amortissementsAvant: number;
  amortissementsApres: number;
}

/**
 * LE BIEN VU D'UN EXERCICE · la fiche porte la valeur d'AUJOURD'HUI, toutes
 * réévaluations passées comprises (`reevaluer` la met à jour). Le tableau des
 * amortissements d'un exercice la relit telle qu'ELLE ÉTAIT · sans les
 * réévaluations postérieures, qui n'existaient pas encore ; et la hausse (ou
 * l'élimination, méthode 2) du cumul par la réévaluation de l'exercice est
 * passée à sa CLÔTURE (art. 63 ; ch. 28 § 3.2), après la dotation (décision
 * D-38) · comptée dans le cumul d'ouverture, elle ferait dire au tableau un
 * cumul que la balance n'a jamais porté à l'ouverture.
 *
 * `produitAnterieur` · le produit des k' des réévaluations des exercices
 * antérieurs, qui multiplie l'annuité de celui-ci (ch. 28 § 4.2.2).
 */
export function vueDeLExercice(portees: ReevaluationPortee[], exercice: { dateDebut: Date; dateFin: Date }) {
  let produitAnterieur = 1;
  let produitPosterieur = 1;
  let ajustementCumulExercice = 0;
  let cumulPosterieur = 0;
  let brutPosterieur = 0;
  for (const r of portees) {
    const deltaCumul = r.amortissementsApres - r.amortissementsAvant;
    if (r.dateReevaluation < exercice.dateDebut) {
      produitAnterieur *= r.coefficientRetenu;
    } else if (r.dateReevaluation <= exercice.dateFin) {
      ajustementCumulExercice += deltaCumul;
    } else {
      cumulPosterieur += deltaCumul;
      brutPosterieur += r.brutApres - r.brutAvant;
      produitPosterieur *= r.coefficientRetenu;
    }
  }
  return {
    produitAnterieur,
    produitPosterieur,
    ajustementCumulExercice: centimes(ajustementCumulExercice),
    cumulPosterieur: centimes(cumulPosterieur),
    brutPosterieur: centimes(brutPosterieur),
  };
}
