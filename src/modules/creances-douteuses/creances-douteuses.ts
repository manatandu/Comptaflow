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
 *  - Guide SYSCOHADA, Partie 1 ch. 6 § 3.3 et § 3.4, Application 19 · charges
 *    pour dépréciations au 6594 par le crédit du 4912 ; « à n+1, annulation
 *    systématique + nouvelle dépréciation, ou ajustement » · le module retient
 *    l'AJUSTEMENT (créance de 12 dépréciée à 75 % en n, 9 ; à 50 % en n+1,
 *    reprise de 3 au 7594).
 * SOURCE CORRIGÉE (E4) · le Titre VIII ch. 15 de l'AUDCIF est « Abandons de
 * créances, opérations d'affacturage et titrisation » · il ne fonde pas la
 * dépréciation, et n'est cité ici que pour l'abandon (règle 4).
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
 *   SYCEBNL   · fiche du compte 41, « 416 Créances adhérents,
 *               clients-usagers litigieuses ou douteuses (4161 Adhérents
 *               cotisations litigieuses ou douteuses, 4162 Créances
 *               litigieuses ou douteuses) » ; « sont crédités les comptes 411
 *               et 412 [...] des créances litigieuses ou douteuses ; par le
 *               débit : du compte 416 ». Le sous-compte dit le DÉBITEUR · le
 *               4161 reçoit les créances d'ADHÉRENTS (411, 4131, 4133), le
 *               4162 les autres (412, 4132, 4138). Il se DÉDUIT de cette
 *               table (E3, décision de Manasse du 2026-10-03, « réfère-toi à
 *               la loi »), et un autre 416 est refusé ; un 413 non subdivisé,
 *               ou tout compte hors de la table, reste au choix du cabinet,
 *               jamais deviné. La nature ne se lit plus qu'au 491 (4911
 *               litigieuses, 4912 douteuses, aux deux plans).
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

/** Au SYCEBNL, le débiteur que le compte d'origine désigne · la table de la fiche du compte 41 (E3). */
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

/**
 * LE 416 QUE LE PLAN IMPOSE, quand il se lit · au SYSCOHADA selon la NATURE,
 * au SYCEBNL selon le DÉBITEUR (E3). Croisé, le compte rangerait la créance
 * sous un sous-compte qui dit autre chose ; hors de la table, rien n'est imposé.
 */
export function motifRefus416Croise(
  referentiel: Referentiel,
  nature: NatureCreanceDouteuse,
  numeroSource: string,
  numero416: string,
): string | null {
  const attendu = compte416Propose(referentiel, nature, numeroSource);
  if (!attendu || numero416.startsWith(attendu)) return null;
  if (referentiel === Referentiel.SYSCOHADA) {
    return (
      `Au SYSCOHADA, le ${attendu} reçoit les créances ${nature === NatureCreanceDouteuse.LITIGIEUSE ? 'litigieuses' : 'douteuses'} ` +
      '(4161 « Créances litigieuses », 4162 « Créances douteuses », fiche du compte 41) · le compte choisi ne correspond pas à la nature.'
    );
  }
  return (
    `Au SYCEBNL, le compte ${numeroSource} désigne ${attendu === '4161' ? 'un adhérent' : 'un client-usager'}, et sa créance va au ` +
    `${attendu} · fiche du compte 41, « 4161 Adhérents cotisations litigieuses ou douteuses, 4162 Créances litigieuses ou douteuses ».`
  );
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
  const croise = motifRefus416Croise(e.referentiel, e.nature, e.numeroSource, e.numero416);
  if (croise) return croise;
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
  /**
   * La TVA facturée que portait la créance entière, CALCULÉE PAR LE SERVEUR
   * sur les factures d'origine (K2) · jamais reçue de l'écran.
   */
  tvaFactureeCreance: number | null | undefined;
  /** La valeur que l'écran a montrée, s'il en envoie une · refusée au-delà d'un centime d'écart. */
  tvaFactureeSaisie?: number | null;
  /**
   * La part de cette TVA que la déclaration a DÉJÀ rendue exigible (B-1) · la
   * seule qui se récupère. Absente, toute la TVA facturée est tenue pour
   * exigible.
   */
  tvaExigibleCreance?: number | null;
  /**
   * Le plafond de la récupération, chiffré par le serveur sur le reste de la
   * créance (`tvaDeLaPerte`, quatrième relecture) · prime sur le prorata.
   */
  plafond?: number | null;
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
    return 'Les factures d’origine ne portent aucune TVA facturée lisible pour cette créance · rien ne se récupère.';
  }
  // LA TVA FACTURÉE NE VIENT PAS DE L'ÉCRAN (seconde relecture, K2) · elle
  // borne la récupération, et une valeur saisie plus haute ouvrait le
  // prorata à une TVA que la vente n'a jamais portée. Le serveur la calcule
  // sur les factures d'origine ; une valeur envoyée qui s'en écarte de plus
  // d'un centime est refusée, et c'est la sienne qui est figée.
  if (e.tvaFactureeSaisie != null && Math.abs(centimes(e.tvaFactureeSaisie) - centimes(facturee)) > 0.01 + 1e-9) {
    return (
      `La TVA facturée envoyée (${centimes(e.tvaFactureeSaisie).toFixed(2)}) n'est pas celle des factures d'origine ` +
      `(${centimes(facturee).toFixed(2)}) · elle se lit sur les ventes rattachées à la créance, jamais à la saisie.`
    );
  }
  const exigible = e.plafond ?? e.tvaExigibleCreance ?? facturee;
  if (!(exigible > 0.005)) {
    return (
      'Aucune part de la TVA de cette créance n’a été rendue exigible par la déclaration · elle n’a jamais été acquittée, ' +
      'il n’y a rien à récupérer (O.-L. n° 10/001, art. 25, 2° et 52). Elle sort d’office du 443 sans taux, avec la perte.'
    );
  }
  if (!(e.tvaRecuperee > 0)) return 'La TVA récupérée doit être positive.';
  const plafond = e.plafond ?? plafondTvaRecuperable(exigible, e.montantSorti, e.montantCreance);
  if (centimes(e.tvaRecuperee) > plafond + 0.005) {
    return (
      `La TVA récupérée (${centimes(e.tvaRecuperee).toFixed(2)}) dépasse le prorata, sur la part perdue, de la TVA facturée ` +
      `déjà exigible (${plafond.toFixed(2)}) · seule la taxe acquittée de la créance demeurée impayée se récupère (art. 52).`
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
  nature: NatureCreanceDouteuse;
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
  /**
   * Débit net de l'à-nouveau du 416 choisi, et ce que le module y porte déjà
   * à cette date · reste à la veille des créances reclassées avant, et
   * créances déjà déclarées (M-a).
   */
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
  const croise = motifRefus416Croise(e.referentiel, e.nature, e.numeroSource, e.numero416);
  if (croise) return croise;
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
      `Ce que le module porte déjà sur le ${e.numero416} à l'ouverture (${centimes(e.dejaDeclare416).toFixed(2)}, créances reclassées ` +
      `avant et non sorties, ou déjà déclarées) plus cette créance (${centimes(e.montant).toFixed(2)}) dépasse son à-nouveau ` +
      `(${centimes(e.aNouveau416).toFixed(2)}) · on ne déclare que ce que le bilan d'ouverture porte, et une seule fois.`
    );
  }
  if (centimes(e.dejaDeclare491 + e.depreciation) > centimes(e.aNouveau491) + 0.005) {
    return (
      `Les dépréciations que le module porte déjà sur le 491 à l'ouverture (${centimes(e.dejaDeclare491).toFixed(2)}) plus celle-ci ` +
      `(${centimes(e.depreciation).toFixed(2)}) dépassent son à-nouveau (${centimes(e.aNouveau491).toFixed(2)}).`
    );
  }
  return null;
}

/**
 * L'ANNULATION D'UN MOUVEMENT (seconde relecture, K4) · même règle que
 * l'annulation d'une revue (AUDCIF art. 20, al. 2, « exclusivement par
 * inscription en négatif des éléments erronés ; l'enregistrement exact est
 * ensuite opéré »). Refus · déjà annulé, exercice clôturé, revue qui a compté
 * le mouvement et n'est pas annulée, récupération de TVA déjà imputée par une
 * liquidation non annulée (sa déduction est acquise · on annule la
 * liquidation d'abord), motif absent.
 */
export function motifRefusAnnulationMouvement(p: {
  dejaAnnule: string | null;
  exerciceClos: boolean;
  revueNonAnnulee: string | null;
  /**
   * BL-3 · la liquidation qui a déclaré la TVA de ce mouvement (récupération
   * d'une perte, encaissement d'un recouvrement) est encore AU BROUILLARD ·
   * elle s'annule d'abord. Validée, l'annulation passe avec une
   * régularisation imputée dans la prochaine déclaration.
   */
  liquidationAuBrouillard?: { du: string; au: string } | null;
  motif: string | null | undefined;
}): string | null {
  if (p.dejaAnnule) return `Ce mouvement est déjà annulé, le ${p.dejaAnnule}.`;
  if (p.exerciceClos) {
    return "L'exercice de ce mouvement est clôturé · son erreur se corrige par le report à nouveau (AUDCIF art. 20, al. 3), hors de ce geste.";
  }
  if (p.revueNonAnnulee) {
    return (
      `La revue de la clôture du ${p.revueNonAnnulee} a compté ce mouvement dans le reste de la créance · annulez-la d'abord, ` +
      'puis annulez le mouvement, puis refaites la revue.'
    );
  }
  if (p.liquidationAuBrouillard) {
    return (
      `La liquidation du ${p.liquidationAuBrouillard.du} au ${p.liquidationAuBrouillard.au}, encore au brouillard, a déclaré la ` +
      "TVA de ce mouvement · annulez d'abord la liquidation (Déclaration de TVA), puis annulez le mouvement. Une liquidation " +
      'validée, elle, ne bloque pas · l’annulation passe avec une régularisation imputée dans la prochaine déclaration.'
    );
  }
  const m = (p.motif ?? '').trim();
  if (m.length < MOTIF_ANNULATION_MIN || m.length > MOTIF_ANNULATION_MAX) {
    return `Le motif de l'annulation est exigé, de ${MOTIF_ANNULATION_MIN} à ${MOTIF_ANNULATION_MAX} caractères (AUDCIF art. 20, al. 2).`;
  }
  return null;
}

/** Une vente du client candidate à l'origine d'une créance · son écriture, sa date, ce qui en reste à rattacher. */
export interface VenteCandidate {
  ecritureId: string;
  date: Date;
  /** TTC au compte du client, moins ce que d'autres créances en reprennent déjà. */
  ouvert: number;
}

/**
 * LA FACTURE D'ORIGINE SE CHOISIT, ELLE NE SE DEVINE PAS (seconde relecture,
 * K3). Le lettrage du reclassement avec la facture ne la désigne pas · il la
 * faisait lire comme ENCAISSÉE (décret n° 011/42, art. 57), et une prestation
 * de services devenait exigible au reclassement. Le cabinet choisit les
 * ventes dont la créance est issue ; la répartition du montant sur elles suit
 * leur date, la plus ancienne d'abord, la dernière en partiel (convention
 * d'OmegaX, dite à l'écran). Les ventes choisies doivent couvrir le montant,
 * et chacune doit servir.
 */
export function repartirSurLesOrigines(
  montant: number,
  choisies: readonly VenteCandidate[],
): { parts: { ecritureId: string; montant: number }[]; refus: string | null } {
  const ordre = [...choisies].sort((a, b) => a.date.getTime() - b.date.getTime() || a.ecritureId.localeCompare(b.ecritureId));
  const couvert = centimes(ordre.reduce((s, v) => s + Math.max(0, v.ouvert), 0));
  if (couvert + 0.005 < centimes(montant)) {
    return {
      parts: [],
      refus:
        `Les ventes choisies ne portent que ${couvert.toFixed(2)} au compte du client, hors ce que d'autres créances en reprennent · ` +
        `la créance de ${centimes(montant).toFixed(2)} ne peut en être issue. Choisissez toutes les ventes dont elle provient.`,
    };
  }
  const parts: { ecritureId: string; montant: number }[] = [];
  let reste = centimes(montant);
  for (const v of ordre) {
    if (reste <= 0.005) break;
    const part = centimes(Math.min(Math.max(0, v.ouvert), reste));
    if (part <= 0.005) continue;
    parts.push({ ecritureId: v.ecritureId, montant: part });
    reste = centimes(reste - part);
  }
  const inutiles = ordre.length - parts.length;
  if (inutiles > 0) {
    return { parts: [], refus: `${inutiles} vente(s) choisie(s) ne servent pas · les plus anciennes couvrent déjà la créance. Retirez-les.` };
  }
  return { parts, refus: null };
}

/**
 * LA PROPOSITION SANS AMBIGUÏTÉ · une seule vente ouverte égale au montant,
 * ou toutes les ventes ouvertes du client dont la somme l'égale au centime.
 * Ailleurs, rien n'est proposé et le cabinet choisit.
 */
export function origineProposee(montant: number, candidates: readonly VenteCandidate[]): string[] {
  const m = centimes(montant);
  const exactes = candidates.filter((v) => Math.abs(centimes(v.ouvert) - m) < 0.005);
  if (exactes.length === 1) return [exactes[0].ecritureId];
  if (exactes.length > 1) return [];
  const total = centimes(candidates.reduce((s, v) => s + Math.max(0, v.ouvert), 0));
  return candidates.length > 0 && Math.abs(total - m) < 0.005 ? candidates.map((v) => v.ecritureId) : [];
}

/**
 * LA TVA FACTURÉE DE LA CRÉANCE, ET SA PART DÉJÀ EXIGIBLE (K2, B-1) · sur
 * chaque vente d'origine, la TVA de la vente au prorata de la part que la
 * créance en reprend (TTC au compte du client). La part exigible est celle
 * que le moteur de la déclaration a rendue exigible (`fractionExigible`),
 * imputée d'abord sur ce qui n'est PAS dans la créance (la part réglée l'a
 * été la première) · le reste de la créance n'a jamais été déclaré. Un seul
 * compte de TVA ; le TAUX n'est exigé que pour la part exigible, qui seule
 * entre dans une déclaration.
 */
export function tvaFactureeDesOrigines(
  origines: readonly {
    part: number;
    ttcClient: number;
    fractionExigible?: number;
    tva: { compteId: string; numero: string; tauxTvaId: string | null; montant: number }[];
  }[],
):
  | { compteId: string; numero: string; tauxTvaId: string | null; raisonTaux: string | null; tvaFacturee: number; tvaExigible: number }
  | { raison: string } {
  if (origines.length === 0) {
    return { raison: 'Aucune facture d’origine n’est rattachée à cette créance · la TVA facturée et son taux ne se lisent pas.' };
  }
  const comptes = new Map<string, string>();
  const taux = new Set<string | null>();
  let facturee = 0;
  let exigible = 0;
  for (const o of origines) {
    const tvaVente = o.tva.reduce((s, l) => s + l.montant, 0);
    for (const l of o.tva) {
      comptes.set(l.compteId, l.numero);
      taux.add(l.tauxTvaId);
    }
    if (!(o.ttcClient > 0)) continue;
    const tvaCreance = (tvaVente * o.part) / o.ttcClient;
    const horsCreance = tvaVente - tvaCreance;
    const declaree = tvaVente * Math.min(1, Math.max(0, o.fractionExigible ?? 1));
    facturee += tvaCreance;
    exigible += Math.min(tvaCreance, Math.max(0, declaree - horsCreance));
  }
  if (comptes.size === 0) return { raison: 'Les ventes d’origine ne portent aucune TVA facturée.' };
  if (comptes.size > 1) return { raison: 'Les ventes d’origine portent plusieurs comptes de TVA · la récupération ne se répartit pas d’office.' };
  const [[compteId, numero]] = [...comptes.entries()];
  const raisonTaux = taux.has(null)
    ? 'Une ligne de TVA des ventes d’origine ne porte aucun taux · le taux de la vente ne se lit pas.'
    : taux.size !== 1
      ? 'Les ventes d’origine portent plusieurs taux de TVA · le taux de la récupération serait deviné.'
      : null;
  return {
    compteId,
    numero,
    tauxTvaId: raisonTaux ? null : [...taux][0]!,
    raisonTaux,
    tvaFacturee: centimes(facturee),
    tvaExigible: centimes(exigible),
  };
}

/**
 * UN MOUVEMENT DE L'EXERCICE SANS REVUE (seconde relecture, M-c) · une
 * information, jamais un refus · la dépréciation en place n'a pas été revue
 * après la perte ou le recouvrement. Le refus à la clôture reste celui des
 * dépréciations orphelines (B1).
 */
export function mouvementsSansRevue(p: { revueDeLExercice: boolean; mouvementsDeLExercice: number }): number {
  return p.revueDeLExercice ? 0 : p.mouvementsDeLExercice;
}

/** Une vente d'origine telle que le moteur de la TVA la rend (`tvaDesVentesOrigine`). */
export interface VenteOrigineTva {
  part: number;
  ttcClient: number;
  tva: { compteId: string; numero: string; tauxTvaId: string | null; montant: number }[];
  fractionExigible?: number;
  /** Ce que les déclarations à venir porteront encore (hors du figé). */
  exigibleAVenir?: number;
  declareeFigee?: number;
  ambigu?: boolean;
}

/**
 * LA TVA D'UNE PERTE, CHIFFRÉE SUR LE RESTE DE LA CRÉANCE (quatrième relecture
 * d'A7). Sur chaque vente d'origine · ce qui est DÉJÀ DÉCLARÉ (le figé des
 * liquidations, plus ce qu'une période encore ouverte déclarera) s'impute
 * d'abord sur la part HORS créance,
 * puis sur la TVA des RECOUVREMENTS (qui rendent exigible leur propre part,
 * jamais celle du reste) · ce qui en reste est la part déclarée de la TVA du
 * reste, diminuée de ce que les pertes antérieures en ont consommé.
 *  · TVA du reste = TVA facturée × reste ÷ montant de la créance ;
 *  · la perte en prend le prorata ; sa part déclarée est le PLAFOND de la
 *    récupération (art. 52), le reste sort sans taux, d'office.
 * Jeux du relecteur · recouvrement de 580 000 puis perte de 580 000 · 80 000
 * non exigibles, plafond 0 (BL-1) ; groupe recréé après la liquidation · la
 * part impayée n'est pas déclarée, plafond 0 (BL-4).
 */
export function tvaDeLaPerte(p: {
  origines: readonly VenteOrigineTva[];
  montantCreance: number;
  recouvrements: number;
  reste: number;
  perte: number;
  declareePertesAnterieures: number;
  /** La part déjà déclarée DÉCLARÉE par le cabinet (TVA reconstituée ambiguë). */
  declareeParLeCabinet?: number | null;
}):
  | {
      compteId: string;
      numero: string;
      tauxTvaId: string | null;
      raisonTaux: string | null;
      tvaFacturee: number;
      tvaReste: number;
      declareeReste: number;
      plafond: number;
      nonExigible: number;
      ambigu: boolean;
    }
  | { raison: string } {
  const lue = tvaFactureeDesOrigines(p.origines.map((o) => ({ ...o, fractionExigible: 1 })));
  if ('raison' in lue) return lue;
  const M = p.montantCreance;
  let declareeCreance = 0;
  for (const o of p.origines) {
    if (!(o.ttcClient > 0) || !(M > 0)) continue;
    const T = o.tva.reduce((s, l) => s + l.montant, 0);
    const tc = (T * o.part) / o.ttcClient;
    const hors = T - tc;
    const recouvre = (tc * p.recouvrements) / M;
    // Déjà déclarée (figé) ou à déclarer par une période encore ouverte ·
    // jamais une relecture des lettrages pour le passé figé.
    const declaree = Math.min(T, Math.max(0, (o.declareeFigee ?? 0) + (o.exigibleAVenir ?? 0)));
    declareeCreance += Math.min(Math.max(0, tc - recouvre), Math.max(0, declaree - hors - recouvre));
  }
  const ambigu = p.origines.some((o) => o.ambigu);
  const tvaReste = M > 0 ? (lue.tvaFacturee * p.reste) / M : 0;
  const declareeReste = Math.min(
    tvaReste,
    Math.max(0, p.declareeParLeCabinet != null ? p.declareeParLeCabinet : declareeCreance - p.declareePertesAnterieures),
  );
  const prorata = p.reste > 0 ? Math.min(1, p.perte / p.reste) : 0;
  return {
    compteId: lue.compteId,
    numero: lue.numero,
    tauxTvaId: lue.tauxTvaId,
    raisonTaux: lue.raisonTaux,
    tvaFacturee: lue.tvaFacturee,
    tvaReste: centimes(tvaReste),
    declareeReste: centimes(declareeReste),
    plafond: centimes(declareeReste * prorata),
    nonExigible: centimes((tvaReste - declareeReste) * prorata),
    ambigu,
  };
}

/**
 * LA TVA RECONSTITUÉE AMBIGUË SE DÉCLARE (quatrième relecture) · une
 * liquidation antérieure au figé a pu lire un lettrage qui a bougé depuis ·
 * la part déjà déclarée ne se lit plus, le cabinet la déclare avec sa source.
 */
export function motifRefusTvaAmbigue(p: { ambigu: boolean; declaree: number | null | undefined; source: string | null | undefined }): string | null {
  if (!p.ambigu) return null;
  if (p.declaree == null || !(p.declaree >= 0) || !p.source || p.source.trim().length === 0) {
    return (
      'La TVA d’une vente d’origine a été déclarée par une liquidation antérieure à la règle du figé, et son lettrage a bougé ' +
      'depuis · ce qu’elle a déclaré ne se lit plus. Déclarez la part de la TVA de la créance déjà déclarée, avec sa source ' +
      '(déclaration déposée, état de liquidation), avant de passer la perte.'
    );
  }
  return null;
}
