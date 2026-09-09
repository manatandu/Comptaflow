import type { TauxTva } from './types';
import { compteTvaPourContrepartie } from './tva-syscohada';

/**
 * LA LIGNE DE TVA · une seule règle, deux endroits qui la posent.
 *
 * Elle vivait entière dans `ModelesSaisie.insererTva`, c'est-à-dire dans la
 * modale « Achat / Vente avec TVA », et elle y portait trois décisions que
 * personne d'autre ne savait prendre : le compte de taxe ROUTÉ selon la nature
 * de la contrepartie, l'arrondi, et la ligne au taux zéro qui qualifie une
 * exportation. La grille de saisie, elle, ne proposait rien : un comptable qui
 * saisit sa facture ligne à ligne devait connaître de tête le 4454 et calculer
 * ses 16 %.
 *
 * Réécrire ce calcul dans la grille aurait produit deux TVA plausibles et
 * différentes · c'est la même raison qui a sorti `calculerPropositions` du
 * lettrage automatique. La règle vit donc ici, et les deux écrans l'appellent.
 *
 * CE QU'ELLE NE FAIT PAS : elle ne pose rien. Elle rend une ligne, ou dit
 * pourquoi elle n'en rend pas. C'est l'écran qui l'insère, sur un geste de
 * l'utilisateur · un taux proposé qui s'imputerait tout seul serait une
 * imputation que personne n'a voulue.
 */

/** Le minimum qu'il faut connaître d'un compte pour poser une ligne dessus. */
export interface CompteSaisie {
  id: string;
  numero: string;
  intitule: string;
}

export interface LigneTvaProposee {
  compteId: string;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  /**
   * LE TAUX EST PORTÉ PAR LA LIGNE DE TVA, JAMAIS PAR LA LIGNE HT · c'est le
   * sens que le schéma lui donne (« la ligne de TVA elle-même, pas la ligne
   * HT ») et celui que la déclaration lit : `TauxTvaService.declaration` ne
   * retient que les lignes qui portent un `tauxTvaId` ET siègent sur un 443
   * ou un 445. Marquer la ligne de charge du taux du compte serait le huitième
   * « un champ, deux sens » du dossier : inerte aujourd'hui puisque le filtre
   * de compte l'écarte, faux le jour où quelqu'un relâche ce filtre.
   */
  tauxTvaId: string;
}

/**
 * Pourquoi il n'y a pas de ligne · les deux cas n'ont PAS la même gravité, et
 * les confondre était le risque de cette extraction. `SANS_COMPTE` est un
 * paramétrage manquant, qui arrête l'opération ; `TAXE_NULLE` est un résultat
 * juste, sur lequel les autres lignes restent bonnes.
 */
export type RaisonSansLigne = 'SANS_COMPTE' | 'TAXE_NULLE';

export type ResultatLigneTva =
  | { ligne: LigneTvaProposee; raison: null; motif: null }
  /** Rien à poser · `motif` le dit en toutes lettres, il s'affiche. */
  | { ligne: null; raison: RaisonSansLigne; motif: string };

/** Deux décimales, comme partout ailleurs dans la saisie. */
export function arrondi2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Un taux nul QUALIFIE l'opération · il ne se confond pas avec une taxe nulle. */
export function estTauxZero(taux: TauxTva): boolean {
  return Number(taux.taux) <= 0.000001;
}

/**
 * Le montant de taxe pour une base HT · sorti pour être lisible à l'écran
 * avant tout clic, la proposition devant se vérifier de tête.
 */
export function montantTva(ht: number, taux: TauxTva): number {
  return arrondi2(ht * (Number(taux.taux) / 100));
}

/**
 * DÉDUCTIBLE OU COLLECTÉE · cela se lit sur la NATURE de la contrepartie, pas
 * sur le sens de la ligne, et c'est la distinction que la grille imposait de
 * faire.
 *
 * Dans la modale, les deux coïncident : le modèle « Achat » n'ouvre que des
 * comptes de charge, le modèle « Vente » que des comptes de produit. Dans la
 * grille, non · un AVOIR FOURNISSEUR crédite un compte de charge, et déduire
 * la famille du sens y ferait poser la contre-taxe en 443 « TVA facturée sur
 * ventes », alors qu'un avoir sur achat reverse la TVA RÉCUPÉRABLE. Le montant
 * serait juste, le compte faux, et la déclaration ventilerait un reversement
 * de déduction en collecte.
 *
 * Ce n'est pas une règle inventée : c'est ce que 443 et 445 SIGNIFIENT. Une
 * charge porte une taxe récupérable, un produit une taxe facturée · le sens de
 * la ligne dit seulement si l'on pose ou si l'on reprend.
 */
export type FamilleTaxe = 'DEDUCTIBLE' | 'COLLECTEE';

export function familleTaxe(numeroContrepartie: string): FamilleTaxe | null {
  if (/^7/.test(numeroContrepartie)) return 'COLLECTEE';
  // Classe 2 comprise · l'acquisition d'immobilisation ouvre droit à déduction
  // et le plan lui donne son propre compte (4451).
  if (/^[26]/.test(numeroContrepartie)) return 'DEDUCTIBLE';
  return null;
}

export function construireLigneTva(params: {
  referentiel: string | undefined;
  /** Recette (vente, produit) ou dépense (achat, charge) · commande le sens. */
  sens: 'recette' | 'depense';
  /** Le compte de charge ou de produit auquel la taxe se rattache. */
  contrepartie: CompteSaisie;
  /** La base hors taxe. */
  ht: number;
  taux: TauxTva;
  comptes: CompteSaisie[];
  numerosDuPlan: ReadonlySet<string>;
}): ResultatLigneTva {
  const { referentiel, sens, contrepartie, ht, taux, comptes, numerosDuPlan } = params;
  const recette = sens === 'recette';

  const famille = familleTaxe(contrepartie.numero);
  if (!famille) {
    return {
      ligne: null,
      raison: 'SANS_COMPTE',
      motif: `Le compte ${contrepartie.numero} n'est ni une charge ni un produit · la TVA se rattache à l'opération, pas à un compte de bilan.`,
    };
  }

  // ROUTAGE PAR NATURE D'OPÉRATION · le plan SYSCOHADA subdivise 443 et 445,
  // et le compte semé sur le taux est générique. `null` = rien à router (cas
  // du SYCEBNL, qui ne subdivise pas), le compte du taux fait alors foi.
  //
  // Le routage se fait sur la FAMILLE et non sur le sens de la ligne · voir
  // `familleTaxe` : un avoir fournisseur reste dans le 445.
  const numeroRoute = compteTvaPourContrepartie(
    referentiel,
    famille === 'COLLECTEE' ? 'recette' : 'depense',
    contrepartie.numero,
    numerosDuPlan,
  );
  const compteRoute = numeroRoute ? comptes.find((c) => c.numero === numeroRoute) : undefined;
  const compteTaxeId =
    compteRoute?.id ?? (famille === 'COLLECTEE' ? taux.compteCollecteId : taux.compteDeductibleId);
  const compteTaxe = compteTaxeId ? comptes.find((c) => c.id === compteTaxeId) : undefined;
  if (!compteTaxe) {
    // AUCUN COMPTE N'EST DEVINÉ ICI. Un 445 déduit du numéro du taux serait
    // une règle inventée : le dossier rattache ses comptes de taxe lui-même,
    // depuis la fenêtre des taux, et son silence se dit plutôt qu'il ne se
    // comble.
    return {
      ligne: null,
      raison: 'SANS_COMPTE',
      motif: `Le taux ${taux.code} n'a pas de compte de TVA rattaché pour ce sens · rattachez-le depuis la fenêtre des taux de taxe.`,
    };
  }

  const tva = montantTva(ht, taux);
  const tauxZero = estTauxZero(taux);
  /*
    LA LIGNE AU TAUX ZÉRO DOIT EXISTER, et c'est tout l'enjeu du prorata d'un
    exportateur. L'article 43 de l'O.-L. n° 10/001 met au numérateur « le
    montant annuel des recettes afférentes aux opérations ouvrant droit à
    déduction […] Y COMPRIS LES EXPORTATIONS ET OPÉRATIONS ASSIMILÉES ».
    Côté serveur, `calculerProrata` reconnaît l'exportation par la LIGNE DE TVA
    qui porte ce taux : sans elle, il ne voit qu'un crédit de produit nu et ne
    PEUT pas la distinguer d'une recette exonérée.

    Deux zéros que la lecture pressée confond : un TAUX nul, qui qualifie
    l'opération et doit laisser une trace, et une TAXE nulle faute de base, qui
    ne qualifie rien.
  */
  if (!(tva > 0.005) && !tauxZero) {
    return { ligne: null, raison: 'TAXE_NULLE', motif: 'La taxe calculée est nulle · il n’y a pas de ligne à poser.' };
  }

  return {
    raison: null,
    motif: null,
    ligne: {
      compteId: compteTaxe.id,
      numero: compteTaxe.numero,
      intitule: compteTaxe.intitule,
      libelle: tauxZero
        ? `TVA ${Number(taux.taux)} % · ligne de qualification pour le prorata (art. 43)`
        : `TVA ${Number(taux.taux)} %`,
      debit: recette ? 0 : tva,
      credit: recette ? tva : 0,
      tauxTvaId: taux.id,
    },
  };
}

/**
 * LE SENS D'UNE LIGNE DÉJÀ SAISIE · ce que la grille sait d'elle et que la
 * modale, elle, demande à l'utilisateur.
 *
 * Une charge s'inscrit au DÉBIT, un produit au CRÉDIT · la taxe suit. Rien
 * n'est déduit du NUMÉRO du compte : un compte de charge peut être crédité
 * (avoir fournisseur), et lire la classe plutôt que le sens ferait déduire une
 * TVA sur un avoir qui doit la reverser.
 */
export function sensDeLaLigne(ligne: { debit: number; credit: number }): 'recette' | 'depense' | null {
  if (ligne.debit > 0.005 && ligne.credit <= 0.005) return 'depense';
  if (ligne.credit > 0.005 && ligne.debit <= 0.005) return 'recette';
  return null;
}
