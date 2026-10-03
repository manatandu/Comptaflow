import { NatureCreanceDouteuse, Referentiel, TypeMouvementCreanceDouteuse } from '@prisma/client';

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES · la règle, sans base de données (ligne
 * A7, relevé CPCC C3, décision de Manasse du 2026-10-02).
 *
 * LES SOURCES, lues aux deux plans, et elles disent la même chose.
 *  - Fiche du COMPTE 41 (AUDCIF Titre VII ; SYCEBNL Partie 2 ch. 3) · le 41
 *    est « crédité des créances litigieuses ou douteuses, par le débit du
 *    compte 416 ». Les clients « qui CONTESTENT leurs dettes (créances
 *    litigieuses) ou SE DÉROBENT à leur paiement (créances douteuses) » se
 *    séparent dans des comptes distincts.
 *  - Fiche du COMPTE 49 · « La dépréciation doit être certaine quant à sa
 *    nature et l'élément d'actif en cause doit être INDIVIDUALISÉ » ; l'entité
 *    doit pouvoir « préciser exactement la nature et l'objet des créances à
 *    déprécier ; justifier les motifs qui rendent les créances douteuses et
 *    litigieuses ». « La charge est à constituer même si la dépréciation est
 *    d'un montant incertain. » Crédité « à la clôture de l'exercice » par le
 *    débit du 659, débité « à la clôture de l'exercice » de la reprise par le
 *    crédit du 759. Éléments de contrôle · « courriers et autres protêts,
 *    justificatifs du caractère douteux ou litigieux de la créance ».
 *  - Fiche du COMPTE 65 · « Les créances [...] IRRÉCOUVRABLES sont
 *    enregistrées au débit du compte 651 » ; exclusion · « l'amoindrissement de
 *    la valeur d'une créance dont les effets ne sont pas jugés irréversibles
 *    → 659 ». Éléments de contrôle · « notifications de cessation de paiement
 *    relevées ou courrier des avocats ».
 *  - Fiche du COMPTE 759 · crédité « du montant des dépréciations d'actif
 *    circulant [...] existant à l'ouverture de l'exercice, par [...] le débit
 *    du compte 49 ».
 *
 * TROIS RÈGLES QUE CE MODULE NE DÉFAIT PAS.
 *  1. AUCUN POURCENTAGE PAR ÂGE. Le texte veut un élément individualisé et un
 *     motif justifié · la dépréciation se DÉCLARE créance par créance, avec
 *     son motif et ses pièces, et aucune fonction ici ne lit l'âge d'une
 *     créance. Le séminaire CPCC parle de « l'âge de la créance » comme d'un
 *     critère de l'entité ; il reste au jugement du cabinet, jamais à un taux.
 *  2. SEUL L'ÉCART SE PASSE. À chaque clôture, le cabinet déclare la
 *     dépréciation NÉCESSAIRE ; la dépréciation EN PLACE est lue sur les
 *     revues des exercices antérieurs du module, jamais sur le solde du 491
 *     (qui porte d'autres créances, et des écritures passées à la main).
 *     Dotation de la hausse au 659, reprise de la baisse au 759.
 *  3. LA DÉPRÉCIATION NE DÉPASSE PAS LA CRÉANCE INSCRITE. Elle exprime la
 *     moins-value quand « la valeur économique réelle des créances est
 *     inférieure à leur valeur comptable » (fiche du compte 49) · elle est
 *     bornée par ce qui reste de la créance au 416, au montant où elle y est
 *     inscrite.
 *  4. LA BASE EST LE MONTANT TTC INSCRIT AU 416 (E1, décision de Manasse du
 *     2026-10-03, « TTC mais réfère-toi quand même à la loi »). La fiche du
 *     compte 49 compare la valeur économique réelle à la « VALEUR COMPTABLE »
 *     des créances, et la valeur comptable est celle que la fiche du compte 41
 *     inscrit · le 41 est « débité du montant des factures de ventes [...],
 *     par le crédit des comptes concernés de la classe 7 (montant hors taxes
 *     récupérables) [...] ; par le crédit du compte 443 (État, TVA
 *     facturée) », donc TAXE COMPRISE. La seule mention « hors TVA » du corpus
 *     (Titre VIII ch. 15 § 1.3.1, « pour le montant hors TVA si l'abandon est
 *     passible de TVA ») vise l'ABANDON de créance, pas la dépréciation. La
 *     TVA d'une créance devenue irrécouvrable se récupère au geste de PERTE,
 *     sous ses conditions (O.-L. n° 10/001, art. 52), jamais par la
 *     dépréciation.
 *
 * UN NUMÉRO, DEUX SENS · le 4161 et le 4162.
 *   SYSCOHADA · 4161 « Créances litigieuses », 4162 « Créances douteuses » ·
 *               le sous-compte dit la NATURE.
 *   SYCEBNL   · 4161 « Adhérents cotisations litigieuses ou douteuses »,
 *               4162 « Créances litigieuses ou douteuses » · le sous-compte
 *               dit le DÉBITEUR (adhérent ou client-usager), et la nature ne
 *               se lit plus qu'au 491 (4911 litigieuses, 4912 douteuses, aux
 *               deux plans).
 * Le 651 diverge aussi · 6511 « Clients » et 6515 au SYSCOHADA ; 6511
 * « Clients-usagers », 6512 « Adhérents », 6515 au SYCEBNL.
 */

/** Les comptes de créances clients qui se reclassent au 416, par plan. */
export const RACINES_CREANCE_SOURCE: Readonly<Record<Referentiel, readonly string[]>> = {
  // 411 Clients (dont 4116 réserve de propriété, que l'Application 40 du
  // Guide reclasse au 4162), 413 chèques, effets et autres valeurs impayés.
  // Le 412 (effets en portefeuille) n'est pas repris · un effet impayé
  // revient d'abord au 413 (fiche du compte 41, « pour un meilleur suivi des
  // incidents de paiements »).
  [Referentiel.SYSCOHADA]: ['411', '413'],
  // 411 Adhérents, 412 Clients-usagers, 413 impayés · fiche SYCEBNL du 41,
  // « sont crédités les comptes 411 et 412 [...] des créances litigieuses ou
  // douteuses ».
  [Referentiel.SYCEBNL]: ['411', '412', '413'],
};

export const COMPTES_CREANCES_DOUTEUSES = {
  /** Fiche du compte 659, subdivision 6594 « sur créances », aux deux plans. */
  dotation: '6594',
  /** Fiche du compte 759, subdivision 7594 « sur créances », aux deux plans. */
  reprise: '7594',
  /** Racine du reclassement. */
  creances416: '416',
  /** Racine des pertes sur créances. */
  pertes651: '651',
} as const;

/** Le 491 de la nature, le même aux deux plans (4911 litigieuses, 4912 douteuses). */
export function compte491(nature: NatureCreanceDouteuse): string {
  return nature === NatureCreanceDouteuse.LITIGIEUSE ? '4911' : '4912';
}

/** Au SYCEBNL, le débiteur que le compte d'origine désigne · lu dans les intitulés du plan. */
export function debiteurSycebnl(numeroSource: string): 'ADHERENT' | 'CLIENT_USAGER' | null {
  if (numeroSource.startsWith('411') || numeroSource.startsWith('4131') || numeroSource.startsWith('4133')) return 'ADHERENT';
  if (numeroSource.startsWith('412') || numeroSource.startsWith('4132') || numeroSource.startsWith('4138')) return 'CLIENT_USAGER';
  return null;
}

/**
 * Le 416 PROPOSÉ, jamais imposé · `null` quand le plan ne permet pas de le
 * lire (un 413 collectif au SYCEBNL), et l'écran demande alors de choisir.
 */
export function compte416Propose(referentiel: Referentiel, nature: NatureCreanceDouteuse, numeroSource: string): string | null {
  if (referentiel === Referentiel.SYSCOHADA) return nature === NatureCreanceDouteuse.LITIGIEUSE ? '4161' : '4162';
  const debiteur = debiteurSycebnl(numeroSource);
  return debiteur === 'ADHERENT' ? '4161' : debiteur === 'CLIENT_USAGER' ? '4162' : null;
}

/** Le 651 PROPOSÉ selon le débiteur · `null` quand il ne se lit pas. */
export function comptePertePropose(referentiel: Referentiel, numeroSource: string): string | null {
  if (referentiel === Referentiel.SYSCOHADA) return '6511';
  const debiteur = debiteurSycebnl(numeroSource);
  return debiteur === 'ADHERENT' ? '6512' : debiteur === 'CLIENT_USAGER' ? '6511' : null;
}

export const centimes = (x: number) => Math.round(x * 100) / 100;

export interface PieceJustificative {
  nature: string;
  reference: string;
  date: string | null;
}

/** Les pièces lisibles · une pièce sans nature ni référence n'en est pas une. */
export function piecesLisibles(pieces: readonly { nature?: string | null; reference?: string | null; date?: string | null }[] | null | undefined): PieceJustificative[] {
  return (pieces ?? [])
    .map((p) => ({ nature: (p.nature ?? '').trim(), reference: (p.reference ?? '').trim(), date: p.date ? p.date.slice(0, 10) : null }))
    .filter((p) => p.nature.length > 0 && p.reference.length > 0);
}

const MOTIF_SANS_MOTIF =
  'Le motif est exigé · la fiche du compte 49 veut que l’entité puisse « justifier les motifs qui rendent les créances ' +
  'douteuses et litigieuses ».';
const MOTIF_SANS_PIECE =
  'Au moins une pièce justificative est exigée (nature et référence) · la fiche du compte 49 nomme les « courriers et ' +
  'autres protêts, justificatifs du caractère douteux ou litigieux de la créance ».';

function motifEtPieces(motif: string | null | undefined, pieces: PieceJustificative[]): string | null {
  if (!motif || motif.trim().length === 0) return MOTIF_SANS_MOTIF;
  if (pieces.length === 0) return MOTIF_SANS_PIECE;
  return null;
}

export interface EntreeReclassement {
  referentiel: Referentiel;
  nature: NatureCreanceDouteuse;
  numeroSource: string;
  sourceEstDetail: boolean;
  numero416: string;
  numero416EstDetail: boolean;
  montant: number;
  /** Solde débiteur du compte d'origine à la date du reclassement. */
  soldeDebiteur: number;
  /** Une ligne en devise non lettrée sur le compte d'origine. */
  ligneEnDevise: boolean;
  motif: string | null | undefined;
  pieces: PieceJustificative[];
  exerciceOuvert: boolean;
  dateDansExercice: boolean;
  journalGeneral: boolean;
}

export function motifRefusReclassement(e: EntreeReclassement): string | null {
  if (!e.exerciceOuvert) return "L'exercice est clôturé · le reclassement se passe dans un exercice ouvert.";
  if (!e.dateDansExercice) return "La date du reclassement doit tomber dans l'exercice choisi.";
  if (!e.journalGeneral) return "Le reclassement est une opération diverse · choisissez un journal d'opérations diverses.";
  const racines = RACINES_CREANCE_SOURCE[e.referentiel];
  if (!racines.some((r) => e.numeroSource.startsWith(r))) {
    return (
      `Le compte ${e.numeroSource} n'est pas une créance client qui se reclasse au 416 · ce plan n'admet que ` +
      `${racines.join(', ')} (fiche du compte 41, « crédité des créances litigieuses ou douteuses, par le débit du compte 416 »).`
    );
  }
  if (!e.sourceEstDetail) return `Le compte ${e.numeroSource} est un compte de regroupement · choisissez le compte du client.`;
  if (!e.numero416.startsWith(COMPTES_CREANCES_DOUTEUSES.creances416) || !e.numero416EstDetail) {
    return `Le compte ${e.numero416} n'est pas un compte de détail du 416 (créances litigieuses ou douteuses).`;
  }
  // Au SYSCOHADA, le sous-compte dit la nature · le croiser rangerait une
  // créance contestée parmi les créances dont le débiteur se dérobe.
  if (e.referentiel === Referentiel.SYSCOHADA) {
    const attendu = compte416Propose(e.referentiel, e.nature, e.numeroSource)!;
    if (!e.numero416.startsWith(attendu)) {
      return (
        `Au SYSCOHADA, le ${attendu} reçoit les créances ${e.nature === NatureCreanceDouteuse.LITIGIEUSE ? 'litigieuses' : 'douteuses'} ` +
        '(4161 « Créances litigieuses », 4162 « Créances douteuses », fiche du compte 41) · le compte choisi ne correspond pas à la nature.'
      );
    }
  }
  if (e.ligneEnDevise) {
    return (
      "Le compte du client porte une créance en devise non lettrée · une créance en devise se réévalue à la clôture (AUDCIF art. 54) " +
      'et se règle dans sa devise (art. 55), et son reclassement au 416 en perdrait la devise. Ce cas n’est pas servi par le module · ' +
      'lettrez ce qui est réglé, ou passez le reclassement à la main.'
    );
  }
  if (!(e.montant > 0)) return 'Le montant reclassé doit être positif.';
  if (centimes(e.montant) > centimes(e.soldeDebiteur) + 0.005) {
    return (
      `Le montant (${centimes(e.montant).toFixed(2)}) dépasse ce que le client doit à cette date ` +
      `(${centimes(Math.max(0, e.soldeDebiteur)).toFixed(2)}) · on ne reclasse qu'une créance inscrite.`
    );
  }
  return motifEtPieces(e.motif, e.pieces);
}

/** La dépréciation EN PLACE avant un exercice · somme des écarts des revues antérieures du module. */
export function depreciationEnPlace(revues: readonly { exerciceDateFin: Date; ecart: number }[], avant: Date): number {
  return centimes(revues.filter((r) => r.exerciceDateFin.getTime() < avant.getTime()).reduce((s, r) => s + r.ecart, 0));
}

/** Ce qui reste de la créance au 416 à une date · le reclassé moins les pertes et recouvrements datés au plus tard ce jour. */
export function resteDeLaCreance(montant: number, mouvements: readonly { date: Date; montant: number }[], au: Date): number {
  return centimes(montant - mouvements.filter((m) => m.date.getTime() <= au.getTime()).reduce((s, m) => s + m.montant, 0));
}

/** L'écart à passer · positif, dotation (659) ; négatif, reprise (759). Rien d'autre n'entre dans le calcul. */
export function ecartDeDepreciation(enPlace: number, necessaire: number): number {
  return centimes(necessaire - enPlace);
}

export interface EntreeRevue {
  necessaire: number;
  enPlace: number;
  /** Reste de la créance au 416 à la clôture. */
  reste: number;
  motif: string | null | undefined;
  pieces: PieceJustificative[];
  exerciceOuvert: boolean;
  /** L'exercice précède le reclassement. */
  avantReclassement: boolean;
  /** Une revue d'un exercice postérieur est déjà passée (sa date). */
  revuePosterieure: string | null;
  /** Les exercices antérieurs encore ouverts, depuis le reclassement, sans revue. */
  anterieursSansRevue: string[];
  /** Refus du Système minimal de trésorerie pour une DOTATION. */
  refusSmt: string | null;
  journalGeneral: boolean;
}

export function motifRefusRevue(e: EntreeRevue): string | null {
  if (!e.exerciceOuvert) return "L'exercice est clôturé · la dépréciation se revoit à la clôture d'un exercice ouvert.";
  if (e.avantReclassement) return 'Cet exercice précède le reclassement de la créance · rien à y revoir.';
  if (e.revuePosterieure) {
    return (
      `La dépréciation de cette créance est déjà revue à la clôture du ${e.revuePosterieure} · revoir un exercice antérieur ` +
      'changerait la dépréciation en place que cette revue a lue. Retirez d’abord la revue postérieure.'
    );
  }
  if (e.anterieursSansRevue.length > 0) {
    return (
      `Revoyez d'abord la dépréciation de ${e.anterieursSansRevue.join(', ')}, encore ouvert · la dépréciation se constate ` +
      '« à la clôture de l’exercice » (fiche du compte 49), et revoir N+1 avant N doterait deux fois la même perte.'
    );
  }
  if (!e.journalGeneral) return "La revue passe une opération diverse · choisissez un journal d'opérations diverses.";
  if (!Number.isFinite(e.necessaire) || e.necessaire < 0) return 'La dépréciation nécessaire est un montant positif ou nul.';
  if (centimes(e.necessaire) > centimes(e.reste) + 0.005) {
    return (
      `La dépréciation nécessaire (${centimes(e.necessaire).toFixed(2)}) dépasse ce qui reste de la créance au 416 à la clôture ` +
      `(${centimes(e.reste).toFixed(2)}) · elle exprime une moins-value sur la créance (fiche du compte 49, « valeur économique ` +
      'réelle [...] inférieure à leur valeur comptable »), jamais plus que la créance.'
    );
  }
  const manque = motifEtPieces(e.motif, e.pieces);
  if (manque) return manque;
  if (ecartDeDepreciation(e.enPlace, e.necessaire) > 0 && e.refusSmt) return e.refusSmt;
  return null;
}

export interface EntreeMouvement {
  type: TypeMouvementCreanceDouteuse;
  montant: number;
  /** Reste de la créance au 416 à la date du mouvement. */
  reste: number;
  motif: string | null | undefined;
  pieces: PieceJustificative[];
  exerciceOuvert: boolean;
  dateDansExercice: boolean;
  avantReclassement: boolean;
  /** Une revue déjà passée à une clôture postérieure ou égale à la date. */
  revueApres: string | null;
  journalAttendu: boolean;
  /** Perte · le 651 choisi, ou proposé. */
  numeroPerte?: string | null;
  numeroPerteEstDetail?: boolean;
}

export function motifRefusMouvement(e: EntreeMouvement): string | null {
  if (!e.exerciceOuvert) return "L'exercice est clôturé.";
  if (!e.dateDansExercice) return "La date doit tomber dans l'exercice choisi.";
  if (e.avantReclassement) return 'La date précède le reclassement de la créance au 416.';
  if (e.revueApres) {
    return (
      `La dépréciation est déjà revue à la clôture du ${e.revueApres}, sur un reste qui ne comptait pas ce mouvement · ` +
      'annulez cette revue (au brouillard, son écriture est supprimée ; validée, elle est inscrite en négatif), passez le ' +
      'mouvement, puis refaites la revue (AUDCIF art. 20, al. 2).'
    );
  }
  if (!e.journalAttendu) {
    return e.type === TypeMouvementCreanceDouteuse.RECOUVREMENT
      ? 'Un recouvrement se passe dans un journal de trésorerie qui porte son compte de trésorerie.'
      : "La perte se passe dans un journal d'opérations diverses.";
  }
  if (!(e.montant > 0)) return 'Le montant doit être positif.';
  if (centimes(e.montant) > centimes(e.reste) + 0.005) {
    return `Le montant (${centimes(e.montant).toFixed(2)}) dépasse ce qui reste de la créance au 416 (${centimes(e.reste).toFixed(2)}).`;
  }
  if (e.type === TypeMouvementCreanceDouteuse.PERTE) {
    if (!e.numeroPerte) {
      return 'Choisissez le compte de perte sous le 651 · le compte du client ne dit pas si le débiteur est un adhérent ou un client-usager.';
    }
    if (!e.numeroPerte.startsWith(COMPTES_CREANCES_DOUTEUSES.pertes651) || !e.numeroPerteEstDetail) {
      return (
        `Le compte ${e.numeroPerte} n'est pas un compte de détail du 651 · les créances irrécouvrables « sont enregistrées au débit ` +
        'du compte 651 » (fiche du compte 65).'
      );
    }
  }
  return motifEtPieces(e.motif, e.pieces);
}

/**
 * LA TVA D'UNE CRÉANCE IRRÉCOUVRABLE (E2, décision de Manasse du 2026-10-03,
 * « réfère-toi à la loi »).
 *  - O.-L. n° 10/001, art. 52 · la TVA « acquittée à l'occasion des ventes ou
 *    des services qui [...] restent impayés peut être récupérée par voie
 *    d'imputation sur l'impôt dû pour les opérations faites ultérieurement » ;
 *    « lorsque la créance est réellement et définitivement irrécouvrable, la
 *    rectification de la facture consiste en l'envoi d'un duplicata de la
 *    facture initiale ».
 *  - Décret n° 011/42, art. 126 · inscrite « dans les déductions afférentes à
 *    la déclaration du ou des mois suivants celui de la constatation [...] de
 *    non-paiement ».
 *  - Décret n° 011/42, art. 127 · duplicata surchargé de la mention « FACTURE
 *    DEMEUREE IMPAYEE POUR LA SOMME DE ... PRIX HORS TVA ET POUR LA SOMME DE
 *    ... TVA CORRESPONDANTE QUI NE PEUT FAIRE L'OBJET D'UNE DEDUCTION » ; « La
 *    preuve de la créance irrécouvrable incombe à l'assujetti ».
 *  - AUDCIF, fiche du compte 70 · « le compte 443 est débité des taxes
 *    facturées des retours sur ventes », par le crédit du 41.
 * D'où l'écriture · D 651 pour le hors taxe, D 443 pour la TVA récupérée, C 416
 * pour le TTC sorti. JAMAIS D'OFFICE · sans ces conditions, la perte reste
 * D 651 / C 416 pour le TTC entier.
 */
export interface EntreeRecuperationTva {
  assujetti: boolean;
  /** Le montant TTC sorti du 416 par la perte. */
  montantSorti: number;
  /** Le montant de la créance reclassée ou déclarée. */
  montantCreance: number;
  tvaRecuperee: number;
  /** La TVA facturée que portait la créance entière. */
  tvaFactureeCreance: number | null | undefined;
  numeroCompteTva: string | null;
  compteTvaEstDetail: boolean;
  duplicataReference: string | null | undefined;
  duplicataDateEnvoi: string | null | undefined;
  /** Date de la perte, AAAA-MM-JJ. */
  datePerte: string;
}

/** La TVA récupérable au plus · le prorata de la TVA facturée sur la part sortie. */
export function plafondTvaRecuperable(tvaFactureeCreance: number, montantSorti: number, montantCreance: number): number {
  if (!(montantCreance > 0)) return 0;
  return centimes((tvaFactureeCreance * montantSorti) / montantCreance);
}

/** La ventilation de la perte · hors taxe au 651 et TVA au 443, leur somme égale au TTC sorti au centime. */
export function ventilationPerte(montantSorti: number, tvaRecuperee: number): { horsTaxe: number; tva: number } {
  const tva = centimes(tvaRecuperee);
  return { horsTaxe: centimes(centimes(montantSorti) - tva), tva };
}

export function motifRefusRecuperationTva(e: EntreeRecuperationTva): string | null {
  if (!e.assujetti) {
    return (
      "Le dossier n'est pas déclaré assujetti à la TVA (Paramètres du dossier) · il n'a pas acquitté de TVA à récupérer " +
      '(O.-L. n° 10/001, art. 52). La perte passe au TTC entier.'
    );
  }
  if (!e.numeroCompteTva || !e.numeroCompteTva.startsWith('443') || !e.compteTvaEstDetail) {
    return (
      'Choisissez le compte de TVA facturée de la vente d’origine, un compte de détail du 443 · la fiche du compte 70 débite le ' +
      '443 « des taxes facturées des retours sur ventes ».'
    );
  }
  const facturee = e.tvaFactureeCreance;
  if (facturee == null || !(facturee > 0) || facturee >= e.montantCreance) {
    return 'Déclarez la TVA facturée que portait la créance · positive, et inférieure à la créance taxe comprise.';
  }
  if (!(e.tvaRecuperee > 0)) return 'La TVA récupérée doit être positive.';
  const plafond = plafondTvaRecuperable(facturee, e.montantSorti, e.montantCreance);
  if (centimes(e.tvaRecuperee) > plafond + 0.005) {
    return (
      `La TVA récupérée (${centimes(e.tvaRecuperee).toFixed(2)}) dépasse le prorata de la TVA facturée sur la part perdue ` +
      `(${plafond.toFixed(2)}) · seule la TVA de la créance demeurée impayée se récupère (art. 52).`
    );
  }
  if (!e.duplicataReference || e.duplicataReference.trim().length === 0 || !e.duplicataDateEnvoi) {
    return (
      'Le duplicata surchargé envoyé au client est exigé, avec sa référence et sa date d’envoi · « la rectification de la facture ' +
      'consiste en l’envoi d’un duplicata de la facture initiale » (O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 127, mention ' +
      '« FACTURE DEMEUREE IMPAYEE »).'
    );
  }
  if (e.duplicataDateEnvoi.slice(0, 10) > e.datePerte.slice(0, 10)) {
    return 'Le duplicata doit avoir été envoyé au plus tard le jour de la perte · c’est lui qui rectifie la facture.';
  }
  const v = ventilationPerte(e.montantSorti, e.tvaRecuperee);
  if (!(v.horsTaxe > 0) || centimes(v.horsTaxe + v.tva) !== centimes(e.montantSorti)) {
    return 'Le hors taxe et la TVA doivent faire, au centime, le montant TTC sorti du 416.';
  }
  return null;
}

/**
 * LA DÉPRÉCIATION EN PLACE D'UNE CRÉANCE avant une date · la dépréciation
 * DÉCLARÉE à l'ouverture d'un dossier repris (si la déclaration est datée au
 * plus tard ce jour) plus les écarts des revues antérieures du module.
 */
export function enPlaceAvant(
  c: { declareeOuverture: boolean; depreciationOuverture: number; dateReclassement: Date },
  revues: readonly { exerciceDateFin: Date; ecart: number }[],
  avant: Date,
): number {
  const declaree = c.declareeOuverture && c.dateReclassement.getTime() <= avant.getTime() ? c.depreciationOuverture : 0;
  return centimes(declaree + depreciationEnPlace(revues, avant));
}

/**
 * UNE REVUE EST À FAIRE quand elle changerait quelque chose (relecture
 * adverse, B1) · une reprise est due (la dépréciation en place dépasse ce
 * qui reste au 416), ou la créance n'a jamais été revue alors qu'il en reste.
 * Ailleurs, la revue est facultative et l'écran ne le signale pas.
 */
export function revueAFaire(p: { revueDeLExercice: boolean; enPlace: number; reste: number; aucuneRevue: boolean }): boolean {
  if (p.revueDeLExercice) return false;
  if (p.enPlace > p.reste + 0.005) return true;
  return p.aucuneRevue && p.reste > 0.005;
}

/** Une créance qui porterait, sans revue, une dépréciation orpheline à la clôture. */
export interface DepreciationOrpheline {
  creance: string;
  enPlace: number;
  reste: number;
}

/**
 * LA CLÔTURE REFUSE UNE DÉPRÉCIATION ORPHELINE (relecture adverse, B1) ·
 * fiche du compte 49, « débité à la clôture de l'exercice de la reprise des
 * dépréciations [...] dont les raisons qui les ont motivées ont cessé
 * d'exister » ; fiche du compte 759. Une créance perdue ou recouvrée dans
 * l'exercice, sans revue, laisserait au 491 une dépréciation sans créance,
 * et le résultat minoré de la reprise.
 */
export function motifClotureDepreciationsOrphelines(liste: readonly DepreciationOrpheline[]): string | null {
  if (liste.length === 0) return null;
  const detail = liste
    .slice(0, 20)
    .map((o) => `${o.creance} (dépréciation en place ${o.enPlace.toFixed(2)}, reste au 416 ${o.reste.toFixed(2)})`)
    .join(' ; ');
  return (
    `${liste.length} créance(s) douteuse(s) portent une dépréciation supérieure à ce qui reste de la créance, sans revue de cet ` +
    `exercice · ${detail}${liste.length > 20 ? ' ; …' : ''}. Passez la revue de chacune dans « Créances douteuses ou litigieuses » ` +
    '(la reprise au 759 se proposera) avant de clôturer · fiche du compte 49, « débité à la clôture de l’exercice de la reprise des ' +
    'dépréciations [...] dont les raisons qui les ont motivées ont cessé d’exister ».'
  );
}

/** La plage du motif d'annulation, celle de l'annulation d'une réévaluation des devises. */
export const MOTIF_ANNULATION_MIN = 3;
export const MOTIF_ANNULATION_MAX = 500;

export function motifRefusAnnulationRevue(p: {
  dejaAnnulee: string | null;
  exerciceClos: boolean;
  posterieureNonAnnulee: string | null;
  motif: string | null | undefined;
}): string | null {
  if (p.dejaAnnulee) return `Cette revue est déjà annulée, le ${p.dejaAnnulee}.`;
  if (p.exerciceClos) {
    return "L'exercice de cette revue est clôturé · son erreur se corrige par le report à nouveau (AUDCIF art. 20, al. 3), hors de ce geste.";
  }
  if (p.posterieureNonAnnulee) {
    return (
      `La revue de la clôture du ${p.posterieureNonAnnulee}, postérieure, n'est pas annulée · elle part de la dépréciation que celle-ci ` +
      'a passée. On annule de la plus récente à la plus ancienne.'
    );
  }
  const m = (p.motif ?? '').trim();
  if (m.length < MOTIF_ANNULATION_MIN || m.length > MOTIF_ANNULATION_MAX) {
    return `Le motif de l'annulation est exigé, de ${MOTIF_ANNULATION_MIN} à ${MOTIF_ANNULATION_MAX} caractères (AUDCIF art. 20, al. 2).`;
  }
  return null;
}

export interface EntreeDeclaration {
  referentiel: Referentiel;
  numeroSource: string;
  numero416: string;
  numero416EstDetail: boolean;
  montant: number;
  depreciation: number;
  source: string | null | undefined;
  /** La date est le premier jour d'un exercice du dossier. */
  dateDebutExercice: boolean;
  exerciceOuvert: boolean;
  /** L'à-nouveau de l'exercice existe. */
  aNouveau: boolean;
  /** Débit net de l'à-nouveau du 416 choisi, et ce qui est déjà déclaré sur lui à cette date. */
  aNouveau416: number;
  dejaDeclare416: number;
  /** Crédit net de l'à-nouveau du 491 de la nature, et ce qui est déjà déclaré sur lui. */
  aNouveau491: number;
  dejaDeclare491: number;
}

/**
 * DOSSIER REPRIS (relecture adverse, M3) · une créance déjà au 416 et sa
 * dépréciation déjà au 491 avant OmegaX se DÉCLARENT, sans écriture, au
 * début d'un exercice, source exigée, et bornées par l'à-nouveau · sans quoi
 * la première revue doterait une seconde fois ce que le 491 porte déjà.
 */
export function motifRefusDeclaration(e: EntreeDeclaration): string | null {
  if (!e.exerciceOuvert) return "L'exercice est clôturé.";
  if (!e.dateDebutExercice) {
    return "La déclaration se date au premier jour d'un exercice du dossier, celui de l'à-nouveau qui porte la créance.";
  }
  const racines = RACINES_CREANCE_SOURCE[e.referentiel];
  if (!racines.some((r) => e.numeroSource.startsWith(r))) {
    return `Le compte ${e.numeroSource} n'est pas un compte client de ce plan (${racines.join(', ')}) · il désigne le débiteur.`;
  }
  if (!e.numero416.startsWith(COMPTES_CREANCES_DOUTEUSES.creances416) || !e.numero416EstDetail) {
    return `Le compte ${e.numero416} n'est pas un compte de détail du 416.`;
  }
  if (!e.source || e.source.trim().length === 0) {
    return (
      'La source est exigée (balance de reprise, dossier de l’ancien cabinet, état des créances douteuses) · une déclaration ' +
      'sans source ne se vérifie pas.'
    );
  }
  if (!(e.montant > 0)) return 'Le montant de la créance doit être positif.';
  if (!(e.depreciation >= 0) || e.depreciation > e.montant + 0.005) {
    return 'La dépréciation existante est un montant positif ou nul, jamais au-delà de la créance.';
  }
  if (!e.aNouveau) {
    return "Cet exercice n'a pas encore d'à-nouveau (bilan d'ouverture ou report) · la déclaration se borne par lui, passez-le d'abord.";
  }
  if (centimes(e.dejaDeclare416 + e.montant) > centimes(e.aNouveau416) + 0.005) {
    return (
      `Les créances déclarées sur le ${e.numero416} (${centimes(e.dejaDeclare416 + e.montant).toFixed(2)}) dépassent son à-nouveau ` +
      `(${centimes(e.aNouveau416).toFixed(2)}) · on ne déclare que ce que le bilan d'ouverture porte.`
    );
  }
  if (centimes(e.dejaDeclare491 + e.depreciation) > centimes(e.aNouveau491) + 0.005) {
    return (
      `Les dépréciations déclarées sur le 491 (${centimes(e.dejaDeclare491 + e.depreciation).toFixed(2)}) dépassent son à-nouveau ` +
      `(${centimes(e.aNouveau491).toFixed(2)}).`
    );
  }
  return null;
}
