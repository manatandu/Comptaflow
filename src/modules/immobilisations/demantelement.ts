import { moisEntre } from '../../common/mois-entre';

/**
 * LA PROVISION POUR DÉMANTÈLEMENT, DE L'ENTRÉE À SA REPRISE (lot 15) · moteur
 * pur, aucune lecture de base, aucune écriture.
 *
 * AUDCIF Titre VIII ch. 6, aux deux référentiels · au SYSCOHADA directement,
 * au SYCEBNL par l'introduction de sa classe 2 (« Valeur d'entrée des
 * immobilisations »), qui fait entrer « l'estimation initiale des coûts
 * relatifs au démantèlement » dans le coût du bien par le sous-compte
 * composant et le 1984, et par la fiche de son compte 19, qui renvoie au
 * ch. 18 de l'AUDCIF (provisions actualisées, « en contrepartie de charges
 * financières », § 3 et § 4.2).
 *
 * CE QUI EST SERVI ·
 *   · la valeur actualisée proposée à l'entrée du composant (§ 2.3) ·
 *     coût attendu × (1 + t)^-n ;
 *   · la DÉSACTUALISATION de chaque exercice (§ 2.3, « chaque année, la
 *     "désactualisation" de la provision doit être enregistrée en charges
 *     financières ») · D 6971 / C 1984 dans l'exemple du texte ;
 *   · la REPRISE quand l'obligation s'éteint (§ 4.1, engagement effectif des
 *     coûts ; § 4.2, cession du sous-jacent) · D 1984 / C 7911 « pour la
 *     quote-part de la provision intégrée initialement dans le coût de
 *     l'immobilisation » et C 7971 « pour la quote-part de la provision
 *     relative aux charges de désactualisation ».
 *
 * CE QUI NE L'EST PAS, ET SE DIT ·
 *   · la RÉVISION de l'estimation (§ 2.4) · ajouter ou déduire la variation
 *     du coût de l'actif suppose une écriture de l'actif ET une révision
 *     prospective du plan, ou une dépréciation · rien n'est calculé ;
 *   · la prise en charge par des tiers (§ 2.5) et la DÉGRADATION PROGRESSIVE
 *     (section 3), qui n'a pas d'actif en contrepartie et relève du registre
 *     des provisions ;
 *   · la charge du démantèlement lui-même (§ 4.1, 6244) · écriture ordinaire
 *     du cabinet.
 */

const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * § 2.3 · « le montant de la provision doit être la valeur actualisée des
 * dépenses attendues ». Exemple du texte · 10 000 000 × (1,12)^-10 =
 * 3 219 732 F (au franc près ; au centime, 3 219 732,37).
 */
export function valeurActualiseeDemantelement(coutFutur: number, tauxPourcent: number, annees: number): number {
  return centimes(coutFutur * Math.pow(1 + tauxPourcent / 100, -annees));
}

export interface ParametresDemantelement {
  estComposantDemantelement: boolean;
  coutFutur: number | null;
  tauxPourcent: number | null;
  valeurOrigine: number;
}

/** Les paramètres de l'actualisation ne se gardent que sur un composant démantèlement, et ensemble cohérents. */
export function motifRefusParametresDemantelement(p: ParametresDemantelement): string | null {
  const donnes = p.coutFutur != null || p.tauxPourcent != null;
  if (!donnes) return null;
  if (!p.estComposantDemantelement) {
    return "Le coût attendu et le taux d'actualisation ne se déclarent que pour un composant démantèlement (AUDCIF Titre VIII ch. 6).";
  }
  if (p.tauxPourcent == null) {
    return "Indiquez le taux d'actualisation avec le coût attendu · sans lui, la provision n'est pas actualisée et rien n'est à désactualiser (§ 2.3).";
  }
  // Un taux positif rend une valeur actuelle inférieure au coût attendu · une
  // provision d'entrée supérieure ne serait pas une valeur actualisée.
  if (p.coutFutur != null && p.valeurOrigine - p.coutFutur > 0.005) {
    return "La valeur d'entrée du composant dépasse le coût attendu au terme · une provision actualisée ne peut pas l'excéder (§ 2.3).";
  }
  return null;
}

/**
 * LES MOIS DE L'EXERCICE QUI PORTENT LA DÉSACTUALISATION · du mois d'entrée du
 * composant (s'il entre dans l'exercice) au dernier mois de l'exercice.
 * DÉCISION PROPOSÉE (journal du plan) · le texte compte en années (exemple ·
 * entrée le 2 janvier, désactualisation de l'année entière) et ne dit rien
 * d'une entrée en cours d'année ; OmegaX compte les mois traversés, comme la
 * première annuité (`moisEntre`), le 2 janvier ouvrant tout janvier, ce qui
 * rend exactement l'exemple.
 */
export function moisDeDesactualisation(
  exercice: { dateDebut: Date; dateFin: Date },
  dateEntree: Date,
  /** La reprise en cours d'exercice arrête la désactualisation à sa date (voir `motifRefusReprise`). */
  arreteAu?: Date,
): number {
  const debut = dateEntree > exercice.dateDebut ? dateEntree : exercice.dateDebut;
  const fin = arreteAu && arreteAu < exercice.dateFin ? arreteAu : exercice.dateFin;
  return Math.max(0, moisEntre(debut, fin));
}

/**
 * RESTE-T-IL QUELQUE CHOSE À DÉSACTUALISER · non si le taux est nul ou absent
 * (§ 2.3, « lorsque l'effet de la valeur temps est significatif »), ni si la
 * provision a déjà atteint le coût attendu au terme. Sert à ne pas exiger une
 * désactualisation qui rendrait zéro, et que le module refuserait d'écrire.
 */
export function resteADesactualiser(p: { tauxPourcent: number | null; provision: number; coutFutur: number | null }): boolean {
  if (p.tauxPourcent == null || !(p.tauxPourcent > 0)) return false;
  return !(p.coutFutur != null && p.provision >= p.coutFutur - 0.005);
}

/**
 * LE COMPOSANT REPRIS AU BILAN D'OUVERTURE · sa provision est portée par
 * l'à-nouveau du 1984, mais ni sa valeur d'entrée créditée au 1984 ni les
 * désactualisations passées avant la reprise du dossier ne sont connues du
 * module · il n'a pas d'écriture d'acquisition (audit final F32). Désactualiser
 * ou reprendre sur la valeur de la fiche ventilerait faux entre le 7911 et le
 * 7971. DÉCISION PROPOSÉE (journal du plan) · refus nommé, la provision suit
 * par écritures ordinaires du cabinet.
 */
const MOTIF_COMPOSANT_REPRIS =
  "Composant repris au bilan d'ouverture · la provision 1984 vient de l'à-nouveau, et le module ne connaît ni la part " +
  "intégrée au coût ni les désactualisations passées avant la reprise du dossier. Passez sa désactualisation et sa reprise " +
  'par une écriture ordinaire (D 6971 / C 1984 ; D 1984 / C 7911 et C 7971 · AUDCIF Titre VIII ch. 6 § 2.3 et § 4).';

/**
 * LA DÉSACTUALISATION D'UN EXERCICE · la provision qui s'accroît de
 * l'écoulement du temps au taux retenu à l'entrée · provision d'ouverture ×
 * ((1 + t)^(mois / 12) − 1). Sur douze mois, c'est « 3 219 732 × 12 % =
 * 386 368 F » de l'exemple, et la provision suit (1 + t)^-n année après
 * année (10 000 000 × (1,12)^-9 = 3 606 100 F à la fin de N). Le coût attendu
 * au terme, s'il est déclaré, borne la provision · elle ne le dépasse jamais.
 */
export function desactualisationExercice(p: {
  provisionOuverture: number;
  tauxPourcent: number;
  mois: number;
  coutFutur: number | null;
}): number {
  if (p.mois <= 0 || p.provisionOuverture <= 0) return 0;
  let d = p.provisionOuverture * (Math.pow(1 + p.tauxPourcent / 100, p.mois / 12) - 1);
  if (p.coutFutur != null) d = Math.min(d, Math.max(0, p.coutFutur - p.provisionOuverture));
  return centimes(d);
}

export interface EtatDesactualisation {
  /** Le composant porte bien le type DEMANTELEMENT. */
  estComposantDemantelement: boolean;
  /** Refus du Système minimal de trésorerie, s'il s'applique (`motifRefusProvisionSmt`). */
  refusSystemeMinimal?: string | null;
  /** Repris au bilan d'ouverture, sans écriture d'acquisition. */
  repris?: boolean;
  /** Sa valeur d'entrée a été créditée au 1984 (voie directe du § 2.1). */
  entreParLaProvision: boolean;
  tauxPourcent: number | null;
  exerciceOuvert: boolean;
  dejaPassee: boolean;
  repriseFaite: boolean;
  enService: boolean;
  mois: number;
  /** Exercices antérieurs couverts par la provision et sans désactualisation. */
  exercicesManquants: string[];
}

export function motifRefusDesactualisation(e: EtatDesactualisation): string | null {
  if (!e.estComposantDemantelement) return "Seul un composant démantèlement porte une provision à désactualiser (AUDCIF Titre VIII ch. 6).";
  // La désactualisation CRÉE une dotation · refusée au SMT, quand la reprise,
  // qui solde, y reste ouverte (common/systeme-minimal.ts).
  if (e.refusSystemeMinimal) return e.refusSystemeMinimal;
  if (e.repris) return MOTIF_COMPOSANT_REPRIS;
  if (!e.entreParLaProvision) {
    return "Ce composant n'est pas entré par le crédit du 1984 · aucune provision pour démantèlement n'est rattachée à lui (§ 2.1).";
  }
  if (e.tauxPourcent == null) return "Aucun taux d'actualisation déclaré sur le composant · la provision n'est pas actualisée, rien à désactualiser (§ 2.3).";
  if (!e.exerciceOuvert) return 'Exercice clôturé · aucune écriture ne peut y entrer (AUDCIF art. 20).';
  if (e.repriseFaite) return "La provision a été reprise · l'obligation est éteinte, plus rien ne se désactualise (§ 4).";
  if (!e.enService) return "Le bien est sorti · reprenez la provision (§ 4.2), elle ne se désactualise plus.";
  if (e.dejaPassee) return 'La désactualisation de cet exercice est déjà passée.';
  if (e.mois <= 0) return "Le composant est entré après la fin de cet exercice · rien n'y court.";
  if (e.exercicesManquants.length) {
    return (
      `Désactualisation non passée pour ${e.exercicesManquants.join(', ')} · passez-la d'abord, dans l'ordre ; ` +
      "la provision d'ouverture de cet exercice serait sinon trop faible."
    );
  }
  return null;
}

/**
 * LA REPRISE · le 1984 se solde par deux crédits (§ 4.1, § 4.2) · la valeur
 * d'entrée du composant au 7911, le cumul des désactualisations au 7971.
 */
export function ventilationReprise(provisionInitiale: number, desactualisations: readonly number[]): {
  exploitation: number;
  financiere: number;
  total: number;
} {
  const exploitation = centimes(provisionInitiale);
  const financiere = centimes(desactualisations.reduce((s, d) => s + d, 0));
  return { exploitation, financiere, total: centimes(exploitation + financiere) };
}

/**
 * LA REPRISE ARRÊTE LA DÉSACTUALISATION, ELLE NE L'EFFACE PAS · § 2.3, la
 * désactualisation s'enregistre « chaque année » tant que l'obligation court.
 * Reprise sans elle, la provision serait soldée à une valeur trop faible et la
 * charge financière courue jusqu'à l'extinction ne serait jamais constatée,
 * sans qu'aucun total ne le dise (la reprise solde le 1984 quel qu'il soit).
 * D'où deux refus · un exercice ANTÉRIEUR traversé sans sa désactualisation
 * (à passer d'abord, dans l'ordre) ; une désactualisation de l'exercice de
 * reprise déjà passée AU-DELÀ de la date de reprise (elle courrait après
 * l'extinction). La désactualisation de l'exercice de reprise, arrêtée à sa
 * date, est passée par la reprise elle-même (`DemantelementService.reprendre`).
 */
export function motifRefusReprise(e: {
  estComposantDemantelement: boolean;
  entreParLaProvision: boolean;
  exerciceOuvert: boolean;
  repriseFaite: boolean;
  dateDansExercice: boolean;
  repris?: boolean;
  exercicesManquants?: string[];
  /** Date jusqu'à laquelle la désactualisation de l'exercice est déjà passée, si elle dépasse la reprise. */
  desactualiseeJusquAu?: string | null;
}): string | null {
  if (!e.estComposantDemantelement) return "Seul un composant démantèlement porte une provision à reprendre (AUDCIF Titre VIII ch. 6).";
  if (e.repris) return MOTIF_COMPOSANT_REPRIS;
  if (!e.entreParLaProvision) {
    return "Ce composant n'est pas entré par le crédit du 1984 · aucune provision pour démantèlement n'est rattachée à lui (§ 2.1).";
  }
  if (!e.exerciceOuvert) return 'Exercice clôturé · aucune écriture ne peut y entrer (AUDCIF art. 20).';
  if (e.repriseFaite) return 'La provision de ce composant a déjà été reprise.';
  if (!e.dateDansExercice) return "La date de la reprise doit tomber dans l'exercice choisi.";
  if (e.exercicesManquants?.length) {
    return (
      `Désactualisation non passée pour ${e.exercicesManquants.join(', ')} · passez-la d'abord, dans l'ordre ; ` +
      'reprise sans elle, la provision serait soldée trop faible et la charge financière courue jamais constatée (§ 2.3).'
    );
  }
  if (e.desactualiseeJusquAu) {
    return (
      `La désactualisation de cet exercice est déjà passée jusqu'au ${e.desactualiseeJusquAu}, après la date de reprise · ` +
      "elle courrait au-delà de l'extinction de l'obligation. La reprise ne peut précéder cette date."
    );
  }
  return null;
}
