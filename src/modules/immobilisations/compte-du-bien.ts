import { Referentiel } from '@prisma/client';

/**
 * LE COMPTE DU BIEN COMMANDE LE RESTE (2026-10-01, décision de Manasse).
 *
 * L'écran demandait une « famille » · un gabarit hérité de Sage (code,
 * intitulé, trois comptes, durée et mode par défaut) que personne ne savait
 * lire. Le cabinet choisit désormais le COMPTE de classe 2 du bien, et ce qui
 * en découle se lit dans le plan, par des règles écrites dans les textes :
 *
 *  · LE 28 SUIT LA DIVISION DU BIEN · AUDCIF, Titre VII ch. 2, « les comptes
 *    28 et 29 ont été développés selon la structure des comptes de la classe
 *    2 » ; SYCEBNL, Partie 2 ch. 2, même ossature (283 « 2834 aménagements/
 *    agencements/installations techniques, 2835 aménagements de bureaux »).
 *    Le compte d'amortissement d'un 2xy... est donc le 28xy, cherché dans le
 *    plan SEMÉ du dossier, jamais composé à l'aveugle · un numéro absent du
 *    plan est refusé à la saisie après tout le chiffrage.
 *  · LA DOTATION SUIT LA NATURE · 681 « d'exploitation (6812 immobilisations
 *    incorporelles, 6813 corporelles) » aux deux plans ; au SYCEBNL, « 680
 *    usufruit temporaire » pour le 2011 (Partie 2 ch. 2, compte 68).
 *
 * La famille ne disparaît pas du modèle · elle devient le support technique de
 * ces trois comptes, trouvée ou créée par le service pour le compte choisi,
 * pour que le reste du module (tableaux, contreparties, reclassement) ne
 * change pas de mécanique.
 */

export interface ComptesSuivantLeBien {
  /** Numéro du compte d'amortissement (28), ou null s'il ne se trouve pas. */
  amortissement: string | null;
  /** Numéro du compte de dotation (68), ou null s'il ne se trouve pas. */
  dotation: string | null;
  /** Ce qui manque, dit au cabinet · null quand les deux comptes sont trouvés. */
  motif: string | null;
}

/**
 * Le premier compte de DÉTAIL du plan qui commence par la racine, le plus
 * court d'abord (le compte complété « 28450000 » avant un « 28451000 » que le
 * cabinet aurait ouvert dessous).
 */
function premierDetail(racine: string, numerosDetail: readonly string[]): string | null {
  const candidats = numerosDetail.filter((n) => n.startsWith(racine)).sort((a, b) => a.localeCompare(b));
  return candidats[0] ?? null;
}

/**
 * Les comptes 28 et 68 d'un bien porté au compte `numeroBien`, lus dans le
 * plan du dossier (`numerosDetail` · ses comptes de DÉTAIL actifs).
 *
 * Un bien que le plan ne fait pas amortir (terrain nu, avance, titre ·
 * `motifNonAmortissable`) n'a pas de 28 de sa division · le compte retenu est
 * alors le premier 28 de sa division ou, à défaut, de la classe, et il reste
 * INERTE, la dotation étant refusée par `passerDotation`. Le schéma exige les
 * trois comptes sur la famille ; c'est la limite écrite dans `verifierFamille`.
 */
export function comptesSuivantLeBien(
  referentiel: Referentiel,
  numeroBien: string,
  numerosDetail: readonly string[],
  nonAmortissable = false,
): ComptesSuivantLeBien {
  const division = numeroBien.slice(0, 2);
  const usufruit = referentiel === Referentiel.SYCEBNL && division === '20';
  const racine28 = usufruit ? '280' : `28${numeroBien.charAt(1)}${numeroBien.charAt(2)}`;
  let amortissement = premierDetail(racine28, numerosDetail);
  if (!amortissement && nonAmortissable) {
    amortissement = premierDetail(`28${numeroBien.charAt(1)}`, numerosDetail) ?? premierDetail('28', numerosDetail);
  }
  const racine68 = usufruit ? '680' : division === '21' ? '6812' : '6813';
  const dotation = premierDetail(racine68, numerosDetail);

  const manques: string[] = [];
  if (!amortissement) manques.push(`aucun compte ${racine28} au plan du dossier`);
  if (!dotation) manques.push(`aucun compte ${racine68} au plan du dossier`);
  return {
    amortissement,
    dotation,
    motif: manques.length
      ? `Compte ${numeroBien} · ${manques.join(' ; ')}. Ouvrez-le dans le plan de comptes avant de porter ce bien.`
      : null,
  };
}

/**
 * Les divisions qui portent un bien · 21 à 24, plus le 20 au SYCEBNL (biens
 * reçus en don, usufruit temporaire). Les 25 à 27 (avances, titres, autres
 * immobilisations financières) ne sont pas des biens amortissables et ne
 * naissent pas par cette fenêtre.
 */
export function estCompteDeBien(referentiel: Referentiel, numero: string): boolean {
  const division = numero.slice(0, 2);
  if (['21', '22', '23', '24'].includes(division)) return true;
  return referentiel === Referentiel.SYCEBNL && division === '20';
}

/**
 * LES SECTIONS DU BARÈME (arrêté n° 013/2025, art. 2) PROPOSÉES POUR UN COMPTE.
 *
 * AUCUN TEXTE NE RELIE UN COMPTE DU PLAN À UNE SECTION DE L'ARRÊTÉ · c'est une
 * proposition de l'éditeur, faite pour filtrer la liste et jamais pour
 * refuser. L'écran garde « toutes les catégories » à un clic, et la catégorie
 * choisie ne commande rien d'autre que la durée proposée.
 *
 *  · 21 incorporel → I « Éléments incorporels » ;
 *  · 22 terrains → aucune (un terrain ne s'amortit pas) ;
 *  · 23 bâtiments et aménagements → II « Constructions », VI « Matériel,
 *    mobilier, agencement et installation » (agencements, aménagements) ;
 *  · 241 matériel et outillage industriel et commercial → III, IV, VIII ;
 *  · 242 agricole → IX ; 243 emballages → III ; 244 matériel et mobilier →
 *    VI, VII ; 245 transport → V ; 246 actifs biologiques → IX ;
 *    247 agencements du matériel → VI ; 248 autres → III à IX.
 * Intitulés des sections lus dans `bareme-amortissement-013-2025.ts`
 * (engendré) ; intitulés des comptes lus dans les deux semis.
 */
export function sectionsBaremeDuCompte(numeroBien: string): string[] | null {
  if (numeroBien.startsWith('21')) return ['I'];
  if (numeroBien.startsWith('22')) return [];
  if (numeroBien.startsWith('23')) return ['II', 'VI'];
  const parSousCompte: Record<string, string[]> = {
    '241': ['III', 'IV', 'VIII'],
    '242': ['IX'],
    '243': ['III'],
    '244': ['VI', 'VII'],
    '245': ['V'],
    '246': ['IX'],
    '247': ['VI'],
    '248': ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'],
  };
  return parSousCompte[numeroBien.slice(0, 3)] ?? null;
}

/**
 * LE MODE D'ACQUISITION · comment le bien arrive, qui choisit la famille de
 * contreparties. Chaque racine de `racinesContrepartieAcquisition` appartient
 * à un mode et un seul ; le refus de `creer` reste celui de la liste fermée,
 * le mode ne fait que la ranger pour l'écran.
 */
export type ModeAcquisition =
  | 'ACHAT_A_CREDIT'
  | 'ACHAT_COMPTANT'
  | 'APPORT'
  | 'FONDS_AFFECTES'
  | 'SUBVENTION_EN_NATURE'
  | 'DON_LEGS'
  | 'PRODUCTION_PROPRE'
  | 'EN_COURS_ACHEVE'
  | 'AVANCE_SOLDEE'
  | 'TITRES_NON_LIBERES'
  | 'DEMANTELEMENT'
  | 'CONSTRUCTION_FIN_DE_BAIL';

export const LIBELLES_MODE_ACQUISITION: Record<ModeAcquisition, string> = {
  ACHAT_A_CREDIT: 'Achat à crédit (fournisseur d’investissement)',
  ACHAT_COMPTANT: 'Achat au comptant (trésorerie)',
  APPORT: 'Apport (capital, dotation, apporteurs, fondateurs)',
  FONDS_AFFECTES: 'Fonds affectés aux investissements',
  SUBVENTION_EN_NATURE: 'Subvention d’investissement en nature',
  DON_LEGS: 'Don ou legs',
  PRODUCTION_PROPRE: 'Production par l’entité elle-même',
  EN_COURS_ACHEVE: 'Travaux en cours achevés',
  AVANCE_SOLDEE: 'Avance soldée à la facture définitive',
  TITRES_NON_LIBERES: 'Titres · part non libérée',
  DEMANTELEMENT: 'Composant démantèlement (provision)',
  CONSTRUCTION_FIN_DE_BAIL: 'Construction reçue gratuitement en fin de bail',
};

/** Le mode d'une racine de contrepartie admise, selon le référentiel. */
export function modeDeLaRacine(referentiel: Referentiel, racine: string): ModeAcquisition {
  if (racine === '4813') return 'TITRES_NON_LIBERES';
  if (racine.startsWith('48') || racine.startsWith('404')) return 'ACHAT_A_CREDIT';
  if (['52', '53', '55', '57'].some((r) => racine.startsWith(r))) return 'ACHAT_COMPTANT';
  if (racine === '72') return 'PRODUCTION_PROPRE';
  if (/^2[1-4]9/.test(racine)) return 'EN_COURS_ACHEVE';
  if (racine === '251' || racine === '252') return 'AVANCE_SOLDEE';
  if (racine === '1984') return 'DEMANTELEMENT';
  // LA SUBVENTION EN NATURE, aux deux référentiels · le 14 n'enregistre que
  // des subventions d'investissement, aide « accordée par l'État, les
  // collectivités publiques, les organismes internationaux ou les tiers »
  // (fiche du compte 14), jamais un don ni un legs. Les deux modes ont été
  // confondus sous « Don, legs ou subvention en nature » jusqu'au
  // 2026-10-01 (relevé par Manasse) · au SYSCOHADA, le libellé laissait
  // croire qu'un don passait au 14.
  if (racine === '14') return 'SUBVENTION_EN_NATURE';
  if (referentiel === Referentiel.SYSCOHADA && racine === '841') return 'CONSTRUCTION_FIN_DE_BAIL';
  if (referentiel === Referentiel.SYCEBNL) {
    if (['162', '163', '164', '165'].includes(racine)) return 'FONDS_AFFECTES';
    // Dons et legs d'immobilisations (167), biens reçus en don ou en legs
    // (171, 172) · propres au SYCEBNL (Partie 3 ch. 2).
    if (racine === '167' || racine === '171' || racine === '172') return 'DON_LEGS';
  }
  // 101 à 104 (capital, dotation), 46 (apporteurs), 45 (fondateurs).
  return 'APPORT';
}

/** Le mode d'un compte de contrepartie, par la plus longue racine admise qu'il porte. */
export function modeDuCompteDeContrepartie(
  referentiel: Referentiel,
  numero: string,
  racines: readonly string[],
): ModeAcquisition | null {
  const racine = racines.filter((r) => numero.startsWith(r)).sort((a, b) => b.length - a.length)[0];
  return racine ? modeDeLaRacine(referentiel, racine) : null;
}
