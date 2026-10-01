import { LigneEcheancier } from './echeancier-location-acquisition';

/**
 * LA CLÔTURE D'UN CONTRAT DE LOCATION-ACQUISITION · moteur pur.
 *
 * AUDCIF Titre VIII ch. 8 § 2.1.8 · les loyers vont au 623 en cours
 * d'exercice ; à la clôture, « le compte 623 [...] est crédité par le débit des
 * comptes 17 [...] et 672 », et « les intérêts courus sont comptabilisés au
 * débit du 672 par le crédit du 176 ». Fiche du COMPTE 17 (Titre VII) · il est
 * « débité, à l'ouverture de l'exercice, du montant des intérêts courus pris
 * en compte à la clôture de l'exercice précédent, par le crédit du 672 ». La
 * fiche du compte 18 du SYCEBNL renvoie à ce chapitre (1871 à 1873, 1876).
 *
 * LES LOYERS RETENUS SONT CEUX DE L'ÉCHÉANCIER tombés dans l'exercice · la
 * fiche du 17 dit « la fraction des redevances PAYÉES durant l'exercice ».
 * L'échéance tient lieu de paiement, et l'écart avec ce que le cabinet a
 * réellement porté au 623 se montre (voir le service), jamais ne se comble.
 *
 * LE PRIX DE LEVÉE DE L'OPTION (§ 2.1.9) · « le prix de rachat P représente
 * la dernière "annuité" de l'emprunt équivalent ». LEVÉE, « aucune écriture
 * n'est à passer » au-delà du schéma · le cabinet paie P au 623 comme un
 * loyer, et la clôture de son exercice le vire au 17 avec la dernière
 * échéance. NON LEVÉE, sa ligne n'est jamais virée · le bien sort par une
 * cession au bailleur (service). Non déclarée à l'échéance, la clôture est
 * refusée · virer P ou ne pas le virer, c'est trancher à la place du cabinet.
 */

export interface VentilationExercice {
  /** Loyers échus dans l'exercice, à transférer du 623. */
  loyers: number;
  /** Leur part de remboursement de la dette (débit du 17). */
  capital: number;
  /** Leur part d'intérêts (débit du 672). */
  interets: number;
  /** Intérêts courus à la clôture, non encore échus (672 / 176). */
  interetsCourus: number;
  /** Les échéances retenues, pour le dire à l'écran. */
  rangs: number[];
  /** L'option échoit dans l'exercice et sa levée n'est pas déclarée. */
  optionNonDeclaree: boolean;
}

const centimes = (x: number) => Math.round(x * 100) / 100;
const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * LES INTÉRÊTS COURUS · CONVENTION D'OMEGAX, dite. Le texte ne dit pas comment
 * les compter. Ils courent sur le restant dû après la dernière échéance
 * passée (ou depuis la prise d'effet), au taux périodique effectif, pour la
 * fraction de la période écoulée, comptée EN JOURS jusqu'à l'échéance
 * suivante · (1 + i)^(jours écoulés / jours de la période) − 1. Une fraction
 * linéaire du taux dirait autre chose que le coût amorti du § 2.1.4. Sans
 * échéance suivante, rien ne court.
 */
export function ventilerExercice(
  lignes: readonly LigneEcheancier[],
  datePriseEffet: Date,
  dette: number,
  tauxPeriodique: number,
  exercice: { dateDebut: Date; dateFin: Date },
  /** null tant que le cabinet n'a rien déclaré. */
  optionLevee: boolean | null = null,
): VentilationExercice {
  const debut = jour(exercice.dateDebut);
  const fin = jour(exercice.dateFin);
  const dansLExercice = (l: LigneEcheancier) => jour(l.date) >= debut && jour(l.date) <= fin;
  const loyersEchus = lignes.filter((l) => dansLExercice(l) && (!l.option || optionLevee === true));
  const optionNonDeclaree = lignes.some((l) => l.option && dansLExercice(l)) && optionLevee === null;
  const loyers = centimes(loyersEchus.reduce((s, l) => s + l.paiement, 0));
  const capital = centimes(loyersEchus.reduce((s, l) => s + l.capital, 0));
  // Les intérêts sont le reste du loyer, pour que 17 + 672 rende exactement le 623.
  const interets = centimes(loyers - capital);

  const passees = lignes.filter((l) => jour(l.date) <= fin);
  const derniere = passees[passees.length - 1];
  // Une option NON LEVÉE ne sera jamais payée · rien ne court vers elle.
  const suivante = lignes.find((l) => jour(l.date) > fin && !(l.option && optionLevee === false));
  let interetsCourus = 0;
  if (suivante) {
    const depuis = derniere ? jour(derniere.date) : jour(datePriseEffet);
    const restant = derniere ? derniere.restant : dette;
    const ecoules = (fin - depuis) / 86_400_000;
    const periode = (jour(suivante.date) - depuis) / 86_400_000;
    if (periode > 0 && ecoules > 0 && restant > 0) {
      // Le jour de clôture est compté · l'intérêt court jusqu'au soir du 31.
      const fraction = Math.min(1, (ecoules + 1) / periode);
      interetsCourus = centimes(restant * (Math.pow(1 + tauxPeriodique, fraction) - 1));
    }
  }
  return { loyers, capital, interets, interetsCourus, rangs: loyersEchus.map((l) => l.rang), optionNonDeclaree };
}
