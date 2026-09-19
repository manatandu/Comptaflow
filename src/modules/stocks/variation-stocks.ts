import { Referentiel } from '@prisma/client';
import {
  CorrespondanceStock,
  motifHorsVariation,
  variationDuCompte,
} from './nomenclature-stocks';

/**
 * LA VARIATION DE STOCKS EN INVENTAIRE INTERMITTENT · le trou qui faussait un
 * compte de résultat sans qu'aucune balance ne cesse de boucler.
 *
 * CE QUI SE PASSAIT AVANT. Le compte de résultat des deux référentiels porte
 * des lignes de variation de stocks · au SYSCOHADA les postes RB, RD et RF
 * (« Variation de stocks de marchandises », « de matières premières et
 * fournitures liées », « d'autres approvisionnements ») lus sur les comptes
 * 6031, 6032 et 6033, et la ligne du 73 en produits. Ces comptes existaient au
 * plan semé, ils étaient mouvementables à la main, et RIEN dans le logiciel ne
 * les produisait. Un dossier qui tient des stocks sortait donc un compte de
 * résultat dont les lignes de variation étaient à zéro : le résultat était faux
 * du montant de la variation, la balance bouclait, et seul le dépôt des états
 * le révélait. C'est le § 10 bis de CLAUDE.md dans sa forme la plus pure.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LE SCHÉMA, ÉCRIT DE LA MÊME MANIÈRE PAR LES DEUX TEXTES.
 *
 * AUDCIF, Titre VII ch. 3 section 3, fonctionnement du compte 31, inventaire
 * intermittent à la clôture :
 *   « le compte 31 est DÉBITÉ du montant du STOCK FINAL […] déterminé par
 *   inventaire extra-comptable […] par le crédit du 6031 » ;
 *   « le compte 31 est CRÉDITÉ du montant du STOCK INITIAL […] POUR SOLDE,
 *   par le débit du 6031 ».
 *
 * SYCEBNL, Partie 2 ch. 3 section 3, même compte, mêmes deux temps :
 *   « est débité le compte 31 […] du montant du stock final […] par le crédit
 *   du compte 6031 » ; « est crédité le compte 31 […] du montant du stock
 *   initial […] POUR SOLDE ; par le débit du compte 6031 ».
 * ────────────────────────────────────────────────────────────────────────
 *
 * POURQUOI LA FORME BRUTE ET NON LA FORME NETTE. Les deux textes admettent
 * l'une et l'autre · ils écrivent « du montant du stock final (OU du montant
 * de l'augmentation de l'exercice : stock final moins stock initial) ». Ce
 * module produit la forme BRUTE, deux lignes par compte, pour deux raisons.
 * Le mot « POUR SOLDE » n'est pas décoratif : le compte de stock doit être
 * VIDÉ de son stock initial, et la forme nette laisse ce solde en place sans
 * jamais l'avoir soldé. Et le journal garde la trace des deux mouvements, que
 * le réviseur demandera · une variation nette de zéro sur un stock qui a
 * entièrement tourné ne laisserait aucune écriture, alors qu'il s'est passé
 * quelque chose.
 *
 * CE MODULE NE POSTE RIEN DE LUI-MÊME. Il PROPOSE des lignes, et c'est le
 * comptable qui les passe · même parti que le redressement d'inventaire, la
 * proposition de TVA de la grille et le pré-lettrage. Le montant du stock
 * final vient d'un inventaire EXTRA-COMPTABLE qu'aucun livre ne porte : le
 * déduire serait l'inventer.
 */

/** Ce qu'il faut savoir d'un compte de stock pour en tirer sa variation. */
export interface CompteAVarier {
  numero: string;
  intitule: string;
  /**
   * Solde du compte AVANT l'écriture de variation · c'est le stock initial,
   * repris du bilan d'ouverture. Débiteur positif.
   */
  soldeInitial: number;
  /**
   * Valeur du stock à la clôture, constatée par inventaire extra-comptable.
   * `null` veut dire « pas encore compté », qui n'est PAS zéro · un compte
   * non compté ne se solde pas, il se réclame.
   */
  stockFinal: number | null;
  /**
   * D'où vient ce montant · une campagne d'inventaire physique, ou une saisie.
   * Exigée avec le nombre, comme la source d'un relevé d'unités d'œuvre :
   * c'est elle que le réviseur demandera, pas le chiffre.
   */
  source: string;
}

export type MotifRefus =
  | 'PAS_UN_COMPTE_DE_STOCK'
  | 'HORS_VARIATION_AUTOMATIQUE'
  | 'STOCK_FINAL_NON_COMPTE'
  | 'STOCK_FINAL_NEGATIF'
  | 'SOURCE_ABSENTE';

export interface LigneProposee {
  compte: string;
  sens: 'DEBIT' | 'CREDIT';
  montant: number;
  libelle: string;
}

export interface VariationRefusee {
  numero: string;
  motif: MotifRefus;
  explication: string;
}

export interface VariationRetenue {
  numero: string;
  correspondance: CorrespondanceStock;
  soldeInitial: number;
  stockFinal: number;
  source: string;
  lignes: LigneProposee[];
}

export interface PropositionVariation {
  retenues: VariationRetenue[];
  refusees: VariationRefusee[];
  /** Comptes dont le stock n'a pas bougé · rien à passer, et c'est dit. */
  sansMouvement: string[];
  avertissements: string[];
}

/**
 * Construit la proposition d'écriture de variation pour une liste de comptes
 * de stock.
 *
 * NE LÈVE JAMAIS · un compte impossible à traiter est RENDU avec son motif,
 * plutôt que de faire échouer les autres. Un dossier qui porte dix comptes de
 * stock et un seul compte non inventorié doit voir les neuf autres.
 */
export function proposerVariations(
  comptes: CompteAVarier[],
  referentiel: Referentiel,
): PropositionVariation {
  const retenues: VariationRetenue[] = [];
  const refusees: VariationRefusee[] = [];
  const sansMouvement: string[] = [];
  const avertissements: string[] = [];

  for (const c of comptes) {
    const hors = motifHorsVariation(c.numero, referentiel);
    if (hors) {
      refusees.push({
        numero: c.numero,
        motif: 'HORS_VARIATION_AUTOMATIQUE',
        explication: `${hors.intitule} · ${hors.motif}`,
      });
      continue;
    }

    const correspondance = variationDuCompte(c.numero, referentiel);
    if (!correspondance) {
      refusees.push({
        numero: c.numero,
        motif: 'PAS_UN_COMPTE_DE_STOCK',
        explication:
          `Le compte ${c.numero} ne correspond à aucun compte de stock du plan ` +
          `${referentiel}. Les nomenclatures des deux référentiels ne se transposent pas : ` +
          "vérifiez le compte dans le plan du dossier avant de l'inventorier.",
      });
      continue;
    }

    // PAS ENCORE COMPTÉ N'EST PAS ZÉRO. Le lire comme zéro solderait le stock
    // entier par le compte de variation, et le compte de résultat
    // enregistrerait une consommation de tout le stock. Même refus que le
    // rapprochement d'inventaire sur une fiche non valorisée.
    if (c.stockFinal === null) {
      refusees.push({
        numero: c.numero,
        motif: 'STOCK_FINAL_NON_COMPTE',
        explication:
          `Le stock final du compte ${c.numero} (${correspondance.intitule}) n'a pas été ` +
          "constaté. Les deux textes le veulent « déterminé par inventaire extra-comptable » · " +
          'le lire comme zéro solderait le stock entier en charge.',
      });
      continue;
    }

    if (c.stockFinal < 0) {
      refusees.push({
        numero: c.numero,
        motif: 'STOCK_FINAL_NEGATIF',
        explication:
          `Le stock final du compte ${c.numero} est négatif. Un stock est un ACTIF : il se ` +
          "compte en quantités détenues, qui ne descendent pas sous zéro. Un montant négatif " +
          "vient d'une erreur de comptage ou de valorisation.",
      });
      continue;
    }

    if (!c.source.trim()) {
      refusees.push({
        numero: c.numero,
        motif: 'SOURCE_ABSENTE',
        explication:
          `Le stock final du compte ${c.numero} est chiffré sans sa source. Un montant ` +
          "d'inventaire extra-comptable ne se vérifie que par le document qui le porte · " +
          "campagne d'inventaire, feuille de comptage, état du magasin.",
      });
      continue;
    }

    // UN SOLDE CRÉDITEUR SUR UN COMPTE DE STOCK EST ANORMAL, et il se dit.
    // Aucun texte lu ne le traite : la variation reste calculable, mais un
    // stock au crédit vient d'une imputation fautive, et la passer sans rien
    // dire la figerait dans les états.
    if (c.soldeInitial < 0) {
      avertissements.push(
        `Le compte ${c.numero} (${c.intitule}) présente un solde CRÉDITEUR de ` +
          `${Math.abs(c.soldeInitial)}. Un compte de stock est un compte d'actif, son solde est ` +
          "débiteur. Vérifiez les imputations avant de passer la variation : l'écriture " +
          'proposée ci-dessous reprend ce solde tel quel.',
      );
    }

    if (c.soldeInitial === 0 && c.stockFinal === 0) {
      sansMouvement.push(c.numero);
      continue;
    }

    const lignes: LigneProposee[] = [];
    // 1. ANNULATION DU STOCK INITIAL, « POUR SOLDE ».
    if (c.soldeInitial !== 0) {
      lignes.push({
        compte: c.numero,
        sens: c.soldeInitial > 0 ? 'CREDIT' : 'DEBIT',
        montant: Math.abs(c.soldeInitial),
        libelle: `Annulation du stock initial · ${correspondance.intitule}`,
      });
      lignes.push({
        compte: correspondance.variation,
        sens: c.soldeInitial > 0 ? 'DEBIT' : 'CREDIT',
        montant: Math.abs(c.soldeInitial),
        libelle: `Annulation du stock initial · ${correspondance.intitule}`,
      });
    }
    // 2. CONSTATATION DU STOCK FINAL.
    if (c.stockFinal !== 0) {
      lignes.push({
        compte: c.numero,
        sens: 'DEBIT',
        montant: c.stockFinal,
        libelle: `Stock final au ${correspondance.intitule} · ${c.source}`,
      });
      lignes.push({
        compte: correspondance.variation,
        sens: 'CREDIT',
        montant: c.stockFinal,
        libelle: `Stock final au ${correspondance.intitule} · ${c.source}`,
      });
    }

    retenues.push({
      numero: c.numero,
      correspondance,
      soldeInitial: c.soldeInitial,
      stockFinal: c.stockFinal,
      source: c.source,
      lignes,
    });
  }

  return { retenues, refusees, sansMouvement, avertissements };
}

/**
 * Toutes les lignes retenues, mises bout à bout · c'est l'écriture unique que
 * le comptable passera. Elle est équilibrée PAR CONSTRUCTION, chaque compte
 * posant ses deux couples débit/crédit de même montant.
 */
export function lignesDeLEcriture(proposition: PropositionVariation): LigneProposee[] {
  return proposition.retenues.flatMap((r) => r.lignes);
}

/** Le total débit et le total crédit · servis pour être VÉRIFIÉS, jamais supposés. */
export function totaux(lignes: LigneProposee[]): { debit: number; credit: number } {
  return lignes.reduce(
    (acc, l) => ({
      debit: acc.debit + (l.sens === 'DEBIT' ? l.montant : 0),
      credit: acc.credit + (l.sens === 'CREDIT' ? l.montant : 0),
    }),
    { debit: 0, credit: 0 },
  );
}
