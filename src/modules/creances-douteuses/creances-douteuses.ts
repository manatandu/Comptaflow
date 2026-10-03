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
 * LES RÈGLES QUE CE MODULE NE DÉFAIT PAS.
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
 *     passible de TVA ») vise l'ABANDON de créance, pas la dépréciation.
 *  5. LA PERTE PASSE AU TTC ENTIER, D 651 / C 416, TOUJOURS (A7 scindée,
 *     décision de Manasse du 2026-10-03). La TVA d'une créance réellement et
 *     définitivement irrécouvrable se récupère par imputation (O.-L.
 *     n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127, duplicata
 *     surchargé), mais ce module ne la chiffre pas · le cabinet la déclare
 *     lui-même, et la ligne A7 bis du plan en garde le chantier. AUCUNE LIGNE
 *     443 n'est écrite ici.
 *  6. LE RECLASSEMENT NE LETTRE PAS LE COMPTE DU CLIENT, et n'exige aucun
 *     lettrage. Lettré avec la facture, il serait lu par le moteur de la TVA
 *     comme un ENCAISSEMENT (décret n° 011/42, art. 57) · la TVA d'une
 *     prestation de services deviendrait exigible au reclassement (O.-L.
 *     n° 10/001, art. 25, 2°) sans qu'aucun prix ne soit perçu.
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

/**
 * AU SYCEBNL, LE 651 SE LIT SUR LE DÉBITEUR, COMME LE 416 (ligne A7 ter, m3).
 * Fiche SYCEBNL du compte 65 · « 651 Pertes sur créances adhérents clients et
 * autres débiteurs (6511 Clients - usagers, 6512 Adhérents, 6515 Autres
 * débiteurs) ». La fiche nomme les sous-comptes par leur débiteur sans écrire
 * de renvoi depuis le compte d'origine · la règle est une ANALOGIE de celle du
 * 416 (E3, fiche du compte 41, qui range les créances d'adhérents au 4161) ·
 * la perte d'un adhérent (411, 4131, 4133) va au 6512, celle d'un
 * client-usager (412, 4132, 4138) au 6511. Croisé, le compte rangerait la
 * perte sous un débiteur qui n'est pas le sien ; un 413 non subdivisé, ou un
 * compte hors de la table, reste au choix. Rien au SYSCOHADA, où la créance se
 * range par sa nature, jamais par son débiteur.
 */
export function motifRefus651Croise(referentiel: Referentiel, numeroSource: string, numeroPerte: string): string | null {
  if (referentiel !== Referentiel.SYCEBNL) return null;
  const attendu = comptePertePropose(referentiel, numeroSource);
  if (!attendu || numeroPerte.startsWith(attendu)) return null;
  return (
    `Au SYCEBNL, le compte ${numeroSource} désigne ${attendu === '6512' ? 'un adhérent' : 'un client-usager'}, et sa perte va au ` +
    `${attendu} · fiche du compte 65, « 6511 Clients - usagers, 6512 Adhérents, 6515 Autres débiteurs ». Règle lue par analogie ` +
    'avec le 416 (fiche du compte 41, « 4161 Adhérents cotisations litigieuses ou douteuses »).'
  );
}

/** La méthode de comptabilisation des cotisations déclarée par le dossier (`Tenant.methodeCotisations`). */
export type MethodeCotisationsDeclaree = 'APPEL' | 'ENCAISSEMENT' | null;

const PARAGRAPHE_5421 =
  'cadre conceptuel du SYCEBNL, § 5.4.2.1, « Toutefois, si l’entité ne peut justifier d’un droit d’agir en recouvrement, les ' +
  'cotisations et le droit d’entrée sont comptabilisés lors de leur encaissement effectif »';

/** La fiche SYCEBNL du compte 41, sur les impayés (Commentaires). */
const FICHE_41_IMPAYES =
  'fiche SYCEBNL du compte 41, « Les chèques, effets à payer et autres valeurs revenus impayés doivent être enregistrés dans le ' +
  'compte 413 Adhérents, clients-usagers chèques, et autres valeurs impayés pour un meilleur suivi des incidents de paiements »';

/**
 * A7 ter, mineur 8 · UN IMPAYÉ D'ADHÉRENT (4131 chèques, 4133 autres valeurs)
 * sous la méthode de l'ENCAISSEMENT · le corpus ne tranche pas. La fiche du
 * compte 41 impose le 413 pour les valeurs revenues impayées ; le § 5.4.2.1
 * dit que la cotisation se comptabilise « lors de son encaissement
 * effectif ». Un chèque remis puis rejeté a-t-il été encaissé ? Aucun texte
 * lu ne le dit · rien tranché n'est pas bloqué, le reclassement passe avec
 * cet avertissement, et la question est remontée à Manasse (suivi, A7 bis).
 */
function estImpayeAdherent(numeroSource: string): boolean {
  return numeroSource.startsWith('4131') || numeroSource.startsWith('4133');
}

/**
 * LA MÉTHODE LUE EST CELLE DÉCLARÉE AUJOURD'HUI · `Tenant.methodeCotisations`
 * ne garde aucun historique (A7 ter, mineur 8) · une créance née sous une
 * méthode antérieure se juge sur la méthode déclarée au jour du geste, et le
 * message le dit.
 */
const METHODE_DU_JOUR = 'méthode déclarée aujourd’hui dans Paramètres du dossier, qui ne garde pas l’historique de ses changements';

/**
 * UNE COTISATION COMPTABILISÉE À L'ENCAISSEMENT N'EST PAS UNE CRÉANCE (ligne
 * A7 ter, m9). Au SYCEBNL, le 4161 reçoit les « Adhérents cotisations
 * litigieuses ou douteuses » (fiche du compte 41), et la cotisation n'est une
 * créance que si elle a été APPELÉE (§ 5.4.2.1, « le fait générateur [...] est
 * l'appel de cotisation »). Le dossier qui a DÉCLARÉ l'encaissement ne peut
 * justifier d'un droit d'agir · une cotisation impayée n'y est pas
 * comptabilisée, et rien ne se reclasse au 4161 (refus). Méthode non
 * déclarée · AVERTISSEMENT seulement, comme `METHODE_COTISATIONS_NON_PRECISEE`
 * (rien tranché n'est pas bloqué).
 */
export function motifRefusCotisationsEncaissement(
  referentiel: Referentiel,
  numeroSource: string,
  methode: MethodeCotisationsDeclaree,
): string | null {
  if (referentiel !== Referentiel.SYCEBNL || methode !== 'ENCAISSEMENT') return null;
  if (debiteurSycebnl(numeroSource) !== 'ADHERENT') return null;
  // Mineur 8 · un impayé d'adhérent (4131, 4133) n'est pas refusé · le corpus ne tranche pas (avertissement).
  if (estImpayeAdherent(numeroSource)) return null;
  return (
    `Le dossier comptabilise les cotisations à leur ENCAISSEMENT (${METHODE_DU_JOUR}) · ${PARAGRAPHE_5421}. Une cotisation ` +
    `non encaissée n'y est pas une créance, et ne se reclasse pas au 4161 · si le compte ${numeroSource} porte une créance, c'est ` +
    "la méthode déclarée ou l'écriture d'appel qui est à revoir."
  );
}

export function avertissementMethodeCotisations(
  referentiel: Referentiel,
  numeroSource: string,
  methode: MethodeCotisationsDeclaree,
): string | null {
  if (referentiel !== Referentiel.SYCEBNL) return null;
  if (debiteurSycebnl(numeroSource) !== 'ADHERENT') return null;
  if (methode === 'ENCAISSEMENT' && estImpayeAdherent(numeroSource)) {
    return (
      `Le dossier comptabilise les cotisations à leur ENCAISSEMENT (${METHODE_DU_JOUR}) et le compte ${numeroSource} est un ` +
      `impayé d'adhérent · ${FICHE_41_IMPAYES} ; ${PARAGRAPHE_5421}. Aucun texte lu ne dit si une valeur remise puis revenue ` +
      'impayée a été encaissée · le reclassement au 4161 est admis, vérifiez que l’entité peut en poursuivre le recouvrement.'
    );
  }
  if (methode !== null) return null;
  return (
    'La méthode de comptabilisation des cotisations n’est pas déclarée (Paramètres du dossier) · le reclassement au 4161 suppose ' +
    `une cotisation APPELÉE, dont l'entité peut poursuivre le recouvrement ; sinon, ${PARAGRAPHE_5421}.`
  );
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

/**
 * Une créance en devise non réglée ne se reclasse ni ne se déclare (AUDCIF
 * art. 54 et 55). Jugée sur la POSITION NETTE par devise (A7 ter, mineur 2),
 * jamais sur la présence d'une ligne non lettrée · une facture en dollars de
 * N réglée en N+1 sur sa ligne d'à-nouveau provisoire laisse en N une ligne
 * non lettrée et une position nulle.
 */
export const MOTIF_CREANCE_EN_DEVISE =
  "Le compte du client porte une créance en devise non réglée (position en devise non soldée) · une créance en devise se réévalue à la clôture (AUDCIF art. 54) " +
  'et se règle dans sa devise (art. 55), et son reclassement au 416 en perdrait la devise. Ce cas n’est pas servi par le module · ' +
  'lettrez ce qui est réglé, ou passez le reclassement à la main.';

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
  /**
   * Son solde au plus tard enregistré, brouillard compris (B-α) · un
   * règlement daté après le reclassement a déjà soldé une part que le
   * reclassement antidaté reprendrait.
   */
  soldeDernier?: number;
  /** Une position en devise non soldée sur le compte d'origine (mineur 2 · nette, par devise). */
  positionEnDevise: boolean;
  motif: string | null | undefined;
  pieces: PieceJustificative[];
  exerciceOuvert: boolean;
  dateDansExercice: boolean;
  journalGeneral: boolean;
  /** m9 · la méthode des cotisations déclarée (SYCEBNL) · absente, rien n'est vérifié. */
  methodeCotisations?: MethodeCotisationsDeclaree;
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
  const cotisations = e.methodeCotisations === undefined ? null : motifRefusCotisationsEncaissement(e.referentiel, e.numeroSource, e.methodeCotisations);
  if (cotisations) return cotisations;
  if (e.positionEnDevise) return MOTIF_CREANCE_EN_DEVISE;
  if (!(e.montant > 0)) return 'Le montant reclassé doit être positif.';
  if (centimes(e.montant) > centimes(e.soldeDebiteur) + 0.005) {
    return (
      `Le montant (${centimes(e.montant).toFixed(2)}) dépasse ce que le client doit à cette date ` +
      `(${centimes(Math.max(0, e.soldeDebiteur)).toFixed(2)}) · on ne reclasse qu'une créance inscrite.`
    );
  }
  if (e.soldeDernier != null && centimes(e.montant) > centimes(e.soldeDernier) + 0.005) {
    return (
      `Le montant (${centimes(e.montant).toFixed(2)}) dépasse ce que le client doit au plus tard enregistré ` +
      `(${centimes(Math.max(0, e.soldeDernier)).toFixed(2)}, brouillard compris) · des règlements datés après le reclassement en ont ` +
      'déjà soldé une part ; reclassée, elle laisserait le compte du client créditeur et le 416 porterait une créance réglée.'
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

/** Ce qui reste de la créance après TOUS ses mouvements, quelle que soit leur date (B-α). */
export function resteFinalDeLaCreance(montant: number, mouvements: readonly { montant: number }[]): number {
  return centimes(montant - mouvements.reduce((s, m) => s + m.montant, 0));
}

/**
 * UN RESTE NÉGATIF A UNE ISSUE (B-α) · une perte ou un recouvrement antidaté,
 * passé avant cette borne, a sorti du 416 plus que la créance. Le 416 est
 * créditeur d'autant et le 651 (ou la trésorerie) faux · ni la revue ni la
 * clôture ne le corrigent, l'annulation du mouvement en trop le fait.
 */
export function motifResteNegatif(creance: string, resteFinal: number): string | null {
  if (!(resteFinal < -0.005)) return null;
  return (
    `La créance ${creance} a un reste négatif au 416 après tous ses mouvements (${centimes(resteFinal).toFixed(2)}) · une perte ou un ` +
    'recouvrement dépasse la créance. Annulez le mouvement en trop s’il est dans un exercice ouvert (« Annuler une perte ou un ' +
    'recouvrement », AUDCIF art. 20, al. 2), repassez le bon montant, puis la revue. Si les mouvements en cause sont tous dans un ' +
    "exercice clôturé, aucun geste d'OmegaX ne lève encore ce refus · signalez-le à l'éditeur, qui le tient au suivi (ligne A7)."
  );
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
  /** B-α · un reste négatif nommé avec son issue (`motifResteNegatif`). */
  resteNegatif?: string | null;
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
  if (e.resteNegatif) return e.resteNegatif;
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
  /**
   * B-α · ce qui reste après TOUS les mouvements non annulés, quelle que
   * soit leur date · un mouvement antidaté ne passe pas sous celui qui a été
   * enregistré après lui.
   */
  resteFinal?: number;
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
  /** m3 · le plan et le compte d'origine, qui disent le 651 du débiteur au SYCEBNL. */
  referentiel?: Referentiel;
  numeroSource?: string;
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
  if (e.resteFinal != null && centimes(e.montant) > centimes(e.resteFinal) + 0.005) {
    return (
      `Le montant (${centimes(e.montant).toFixed(2)}) dépasse ce qui reste de la créance après tous ses mouvements ` +
      `(${centimes(Math.max(0, e.resteFinal)).toFixed(2)}) · une perte ou un recouvrement datés après celui-ci en ont déjà sorti ` +
      'une part du 416 ; passé, il laisserait le 416 créditeur. Annulez d’abord le mouvement postérieur s’il est faux.'
    );
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
    if (e.referentiel && e.numeroSource) {
      const croise = motifRefus651Croise(e.referentiel, e.numeroSource, e.numeroPerte);
      if (croise) return croise;
    }
  }
  return motifEtPieces(e.motif, e.pieces);
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
  /** B-α · le reste après tous les mouvements, quand il est négatif · l'issue est nommée. */
  resteFinal?: number;
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
  // B-α · un reste négatif ne se répare pas par la revue · son issue d'abord.
  const negatifs = liste.filter((o) => o.resteFinal != null && o.resteFinal < -0.005);
  if (negatifs.length > 0) {
    return negatifs
      .slice(0, 20)
      .map((o) => motifResteNegatif(o.creance, o.resteFinal!))
      .join(' ') + (negatifs.length > 20 ? ` (${negatifs.length} créances en tout.)` : '');
  }
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

/**
 * LE RETRAIT D'UNE CRÉANCE, UNE RÈGLE POUR LE SERVEUR ET L'ÉCRAN (ligne A7
 * ter, m6) · on ne retire que ce qui n'a rien produit · aucune revue ni aucun
 * mouvement, même annulés (ils se gardent, AUDCIF art. 20, al. 2), un exercice
 * ouvert, et une écriture de reclassement encore au BROUILLARD, ni lettrée ni
 * pointée (AUDCIF art. 22, 2°). L'écran recevait des listes de l'exercice et
 * recalculait de travers (une revue annulée d'un autre exercice, l'exercice
 * de la créance) · il reçoit ce verdict, servi.
 */
export function motifNonRetirable(p: {
  revuesTotal: number;
  mouvementsTotal: number;
  exerciceClos: boolean;
  ecriture: { statut: 'BROUILLARD' | 'VALIDEE'; tenue: boolean } | null;
}): string | null {
  if (p.revuesTotal > 0 || p.mouvementsTotal > 0) {
    return (
      'Cette créance porte déjà une revue ou un mouvement (même annulés, ils se gardent) · la créance ne se retire plus, ' +
      'sa sortie se fait par la perte ou le recouvrement.'
    );
  }
  if (p.exerciceClos) return "L'exercice de cette créance est clôturé.";
  if (p.ecriture && p.ecriture.statut !== 'BROUILLARD') {
    return "L'écriture du reclassement est validée · elle ne se retire plus, le reclassement s'annule (inscription en négatif).";
  }
  if (p.ecriture && p.ecriture.tenue) return "Une ligne de l'écriture du reclassement est lettrée ou pointée · défaites-la d'abord.";
  return null;
}

/**
 * B2b (relecture adverse d'A7 ter) · LE LETTRAGE DU MODULE FIGÉ PAR UNE
 * CLÔTURE. Une clôture de période, totale ou d'exercice fige le lettrage
 * (`gel-cloture.ts`) · le groupe que le module a posé à l'extinction de la
 * créance ne se défait plus dès qu'une de ses lignes tombe sous la clôture
 * (le reclassement du 15 novembre, la période close au 30). Il RESTE EN
 * PLACE · soldé sur les lignes qu'il réunit, ce qu'il affirme reste vrai.
 *
 * Validée, l'écriture du geste s'annule par inscription en négatif à côté de
 * lui (AUDCIF art. 20, al. 2), datée au premier jour non clôturé si sa date
 * l'est (art. 22, 4°) · la ligne en négatif, ouverte, porte le reste rétabli.
 * Au brouillard, la supprimer laisserait le groupe « soldé » sur une ligne
 * disparue · refus nommé, avec l'issue · valider, puis annuler.
 */
export function motifLettrageFigeAuBrouillard(code: string, figee: string, objet: 'le mouvement' | 'le reclassement'): string {
  return (
    `Le lettrage ${code} des lignes de la créance au 416 ne se défait plus · ${figee}. ` +
    `Supprimer cette écriture au brouillard le laisserait soldé sur une ligne disparue · validez l'écriture puis annulez ${objet} ` +
    "(l'inscription en négatif laisse le lettrage en place, et sa ligne ouverte porte le reste rétabli)."
  );
}

/**
 * A7 ter, mineur 4 · UNE DÉCLARATION BORNÉE PAR LE REPORT RECONSTITUÉ n'est
 * jamais présentée comme sûre · sans à-nouveau qui fait foi, le 416 et le 491
 * d'ouverture se lisent sur la clôture précédente reconstituée, brouillard
 * compris, qu'une écriture passée ensuite dans l'exercice précédent change.
 */
export const INFORMATION_BORNE_RECONSTITUEE =
  "Déclarée sur le report RECONSTITUÉ de l'exercice précédent · l'à-nouveau de cet exercice n'est pas passé, et la borne " +
  "du 416 et du 491 n'est pas sûre (une écriture passée ensuite dans l'exercice précédent la change). Clôturez l'exercice " +
  "précédent ou passez un bilan d'ouverture, puis vérifiez la déclaration.";

/**
 * Second tour d'A7 ter, B-1 · LE MODULE NE CONSEILLE PLUS LE LETTRAGE MANUEL du
 * 416 · un groupe ainsi posé, figé ensuite par une clôture de période,
 * enfermait la créance. Quand les lignes de l'exercice ne soldent pas seules
 * (reclassement d'un exercice précédent, créance déclarée à l'ouverture), ce
 * qui manque est porté par l'à-nouveau, que rien ne relie à la créance · le
 * cabinet DÉSIGNE ces lignes, le module pose le groupe lui-même.
 */
export function motifLignesANouveauADesigner(numero416: string): string {
  return (
    `Créance éteinte · ses lignes de l'exercice ne soldent pas seules au ${numero416} · le reste est porté par l'à-nouveau ` +
    '(reclassement d’un exercice précédent, ou créance déclarée à l’ouverture), qu’aucune liaison ne relie à la créance. ' +
    'Désignez ces lignes d’à-nouveau dans « Lettrer au 416 » · le module pose le lettrage lui-même.'
  );
}

/** B2b · ce que l'annulation dit quand le lettrage du module reste en place. */
export function informationLettrageMaintenu(code: string, figee: string): string {
  return (
    `Le lettrage ${code} des lignes de la créance reste en place (${figee}) · l'annulation est inscrite en négatif à côté, ` +
    'et sa ligne ouverte porte le reste rétabli de la créance.'
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

/**
 * L'ANNULATION D'UN RECLASSEMENT (m2) · même règle que la revue (B2) et le
 * mouvement (K4) · AUDCIF art. 20, al. 2. Refusée tant qu'une revue ou un
 * mouvement NON ANNULÉ porte sur la créance · ils ont lu le montant reclassé ;
 * on annule du plus récent au plus ancien.
 */
export function motifRefusAnnulationReclassement(p: {
  dejaAnnulee: string | null;
  exerciceClos: boolean;
  revuesNonAnnulees: number;
  mouvementsNonAnnules: number;
  motif: string | null | undefined;
}): string | null {
  if (p.dejaAnnulee) return `Ce reclassement est déjà annulé, le ${p.dejaAnnulee}.`;
  if (p.exerciceClos) {
    return "L'exercice du reclassement est clôturé · son erreur se corrige par le report à nouveau (AUDCIF art. 20, al. 3), hors de ce geste.";
  }
  if (p.revuesNonAnnulees > 0 || p.mouvementsNonAnnules > 0) {
    return (
      `La créance porte ${p.revuesNonAnnulees} revue(s) et ${p.mouvementsNonAnnules} perte(s) ou recouvrement(s) non annulés · ` +
      'ils ont lu le montant reclassé. Annulez-les d’abord, du plus récent au plus ancien, puis le reclassement.'
    );
  }
  const m = (p.motif ?? '').trim();
  if (m.length < MOTIF_ANNULATION_MIN || m.length > MOTIF_ANNULATION_MAX) {
    return `Le motif de l'annulation est exigé, de ${MOTIF_ANNULATION_MIN} à ${MOTIF_ANNULATION_MAX} caractères (AUDCIF art. 20, al. 2).`;
  }
  return null;
}

/**
 * LE 491 SE CHOISIT SOUS LA RACINE DE SA NATURE (m5) · 4911 pour une créance
 * litigieuse, 4912 pour une douteuse (aux deux plans), un compte de détail.
 */
export function motifRefus491(nature: NatureCreanceDouteuse, numero491: string, estDetail: boolean): string | null {
  const racine = compte491(nature);
  if (numero491.startsWith(racine) && estDetail) return null;
  return (
    `Le compte ${numero491} n'est pas un compte de détail du ${racine} · une créance ` +
    `${nature === NatureCreanceDouteuse.LITIGIEUSE ? 'litigieuse' : 'douteuse'} se déprécie au ${racine} (fiche du compte 49).`
  );
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
  /** m4 · le compte d'origine est de détail · absent, non vérifié. */
  sourceEstDetail?: boolean;
  /** m4 · les comptes choisis en sommeil (numéros) · absent, non vérifié. */
  comptesEnSommeil?: string[];
  /** m4 · une position en devise non soldée sur le compte du client (mineur 2 · nette, par devise). */
  positionEnDevise?: boolean;
  /**
   * A7 quater, m3 · les francs que portent, dans l'à-nouveau du 416 choisi,
   * des positions en devise non soldées · une AUTRE créance, en devise, que le
   * module ne suit pas. Retranchés de la borne, jamais un refus.
   */
  enDevise416?: number;
  /** m9 · la méthode des cotisations déclarée (SYCEBNL). */
  methodeCotisations?: MethodeCotisationsDeclaree;
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
  // m4 · mêmes refus que le reclassement · un compte de regroupement ne
  // désigne pas le débiteur, un compte en sommeil ne reçoit plus de créance
  // suivie, une créance en devise ne se suit pas ici (AUDCIF art. 54 et 55).
  if (e.sourceEstDetail === false) return `Le compte ${e.numeroSource} est un compte de regroupement · choisissez le compte du client.`;
  if (e.comptesEnSommeil && e.comptesEnSommeil.length > 0) {
    return `Le compte ${e.comptesEnSommeil.join(', ')} est en sommeil · réveillez-le dans Plan comptable, ou choisissez-en un autre.`;
  }
  const cotisations = e.methodeCotisations === undefined ? null : motifRefusCotisationsEncaissement(e.referentiel, e.numeroSource, e.methodeCotisations);
  if (cotisations) return cotisations;
  // A7 QUATER, m3 · LE REFUS NE MORD QUE SUR LE COMPTE DU CLIENT. Le 416 est
  // partagé · une créance en dollars d'un autre client, passée au 416 à la
  // main, refusait la déclaration de toute créance en francs, sans issue.
  // Ses francs sont retranchés de la borne (`enDevise416`) · la créance en
  // francs déclarée ne peut pas emprunter la contrevaleur de celle en devise.
  if (e.positionEnDevise) {
    return (
      'Le compte du client porte une créance en devise non réglée (position en devise non soldée) · une créance en devise se réévalue à la clôture ' +
      '(AUDCIF art. 54) et se règle dans sa devise (art. 55), et sa déclaration au module en perdrait la devise. Ce cas n’est ' +
      'pas servi par le module · lettrez ce qui est réglé en devise ; une créance en devise encore due se suit hors du module.'
    );
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
  const enDevise416 = centimes(e.enDevise416 ?? 0);
  const borne416 = centimes(e.aNouveau416 - enDevise416);
  if (centimes(e.dejaDeclare416 + e.montant) > borne416 + 0.005) {
    return (
      `Ce que le module porte déjà sur le ${e.numero416} à l'ouverture (${centimes(e.dejaDeclare416).toFixed(2)}, créances reclassées ` +
      `avant et non sorties, ou déjà déclarées) plus cette créance (${centimes(e.montant).toFixed(2)}) dépasse son à-nouveau ` +
      `(${centimes(e.aNouveau416).toFixed(2)}` +
      (Math.abs(enDevise416) >= 0.005
        ? `, dont ${enDevise416.toFixed(2)} portés par une créance en devise non réglée, hors du module et retranchés`
        : '') +
      `) · on ne déclare que ce que le bilan d'ouverture porte, et une seule fois.`
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
 * le mouvement et n'est pas annulée, motif absent.
 */
export function motifRefusAnnulationMouvement(p: {
  dejaAnnule: string | null;
  exerciceClos: boolean;
  revueNonAnnulee: string | null;
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
  const m = (p.motif ?? '').trim();
  if (m.length < MOTIF_ANNULATION_MIN || m.length > MOTIF_ANNULATION_MAX) {
    return `Le motif de l'annulation est exigé, de ${MOTIF_ANNULATION_MIN} à ${MOTIF_ANNULATION_MAX} caractères (AUDCIF art. 20, al. 2).`;
  }
  return null;
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
