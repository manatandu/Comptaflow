/**
 * LA REPRISE D'UNE SUBVENTION D'INVESTISSEMENT EN NATURE · moteur pur.
 *
 * Fiche du compte 14, la même à l'AUDCIF (Titre VII) et au SYCEBNL (Partie 2
 * ch. 3) · « La quote-part de subvention reprise dans le résultat de
 * l'exercice est égale : soit au montant de la dotation de l'exercice aux
 * comptes d'amortissements des immobilisations amortissables acquises ou
 * créées au moyen de la subvention ; soit, pour les immobilisations non
 * amortissables, à un montant déterminé en fonction du nombre d'années
 * pendant lesquelles elles sont inaliénables aux termes du contrat, ou, à
 * défaut de clause d'inaliénabilité, à une somme égale au dixième du montant
 * de la subvention. » Et « à la date de cession de l'actif acquis à l'aide de
 * la subvention [...] pour la partie de la subvention non encore rapportée au
 * résultat ».
 *
 * La subvention suivie est celle que l'écriture d'acquisition du bien a
 * portée au crédit d'un 14 (bien transféré gratuitement). Un bien payé en
 * partie par une subvention reçue en numéraire n'a pas ce lien, et ne se
 * propose pas. Quand le 14 ne finance qu'une part du coût, la reprise suit la
 * même part de la dotation · lecture de l'éditeur, la fiche ne visant que le
 * bien « acquis au moyen de la subvention ».
 *
 * Rien n'est posté ici · le module PROPOSE, le cabinet passe (décision de
 * Manasse du 2026-10-01). Une reprise passée à la main hors du module n'est
 * pas connue de lui · le cumul ne compte que les siennes, et c'est dit.
 */

export type NatureReprise = 'EXERCICE' | 'SORTIE';

export interface EntreeReprise {
  subvention: number;
  valeurOrigine: number;
  amortissable: boolean;
  /** Dotation passée pour l'exercice, ou null si elle ne l'est pas encore. */
  dotationExercice: number | null;
  /** Reprises déjà passées par le module. */
  cumulRepris: number;
  /** Le bien est sorti dans cet exercice. */
  sorti: boolean;
  /** Clause d'inaliénabilité, en années, pour un bien non amortissable. */
  dureeInalienabiliteAns?: number | null;
}

export interface PropositionReprise {
  montant: number;
  nature: NatureReprise;
  /** Ce qui empêche la proposition, ou null. */
  motif: string | null;
}

const centimes = (x: number) => Math.round(x * 100) / 100;

export function proposerReprise(e: EntreeReprise): PropositionReprise {
  const reste = centimes(e.subvention - e.cumulRepris);
  if (reste <= 0) return { montant: 0, nature: e.sorti ? 'SORTIE' : 'EXERCICE', motif: 'La subvention est entièrement reprise.' };
  if (e.sorti) return { montant: reste, nature: 'SORTIE', motif: null };
  if (e.amortissable) {
    if (e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    const part = e.valeurOrigine > 0 ? Math.min(1, e.subvention / e.valeurOrigine) : 1;
    return { montant: Math.min(reste, centimes(e.dotationExercice * part)), nature: 'EXERCICE', motif: null };
  }
  const annees = e.dureeInalienabiliteAns && e.dureeInalienabiliteAns > 0 ? e.dureeInalienabiliteAns : 10;
  return { montant: Math.min(reste, centimes(e.subvention / annees)), nature: 'EXERCICE', motif: null };
}
