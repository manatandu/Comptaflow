/**
 * LA RÉVISION DU PLAN D'AMORTISSEMENT ET LE MODE DÉGRESSIF (lot 11) · règles
 * pures.
 *
 * LA RÉVISION EST UN CHANGEMENT D'ESTIMATION. Cadre conceptuel du SYCEBNL
 * (§ 3.3.1.2, b) et Titre V de l'AUDCIF · les estimations portent « notamment
 * [...] aux durées d'amortissement » ; « une nouvelle estimation de la durée
 * de vie d'une immobilisation conduit à revoir le plan d'amortissement » ; et
 * « les changements d'estimation [...] n'ont qu'un effet sur l'exercice en
 * cours et les exercices futurs. L'incidence du changement correspondant à
 * l'exercice en cours est enregistrée dans les comptes de l'exercice ». Le
 * reliquat à l'ouverture de l'exercice de la décision se répartit donc sur la
 * durée résiduelle révisée, sans écriture · c'est la voie par défaut
 * (décision D-24).
 *
 * LE 798 EST L'EXCEPTION. Fiche du compte 28, des deux textes · « Lors des
 * reprises d'amortissements, en cas de révision du plan d'amortissement : est
 * débité le compte 28 [...] par le crédit du compte 798 ». AUDCIF, fiche du
 * compte 79 · « dans le CAS EXCEPTIONNEL d'une révision RÉTROACTIVE du plan
 * d'amortissement initial, la RÉDUCTION du cumul des amortissements est
 * opérée par le crédit du compte 798 ». Déclarée et motivée, et seulement
 * quand elle RÉDUIT le cumul · le texte ne donne aucun compte pour l'accroître.
 *
 * LA FICHE DU COMPTE 28 VEUT LA CORRECTION DITE · « la correction effectuée
 * sur les taux d'amortissement doit être révélée et quantifiée, de même que
 * les raisons de cette modification ». Le motif est exigé, et chaque révision
 * est gardée (`RevisionPlanAmortissement`).
 *
 * LE MODE DÉGRESSIF, AU TAUX DE LA LOI (décisions D-25 et D-26, SYCEBNL SEUL).
 * La fiche du compte 28 du SYCEBNL cite « le mode dégressif à taux décroissant
 * (charge décroissante) » sans en donner le taux. Manasse a tranché · le seul
 * dégressif servi est celui de la loi n° 23/053 · taux linéaire × 1,5, 2 ou
 * 2,5 selon la durée (art. 33), première annuité au prorata du mois de mise en
 * service (art. 34), bascule au linéaire quand l'annuité dégressive devient
 * inférieure au quotient de la valeur résiduelle par les années restantes
 * (art. 35). Les bornes de durée et l'exclusion des incorporels suivent
 * l'art. 32 · hors d'elles la loi ne donne aucun coefficient. Au SYSCOHADA, le
 * dégressif reste l'option FISCALE, tenue à part avec son dérogatoire
 * (`amortissement-degressif.ts`) · deux dégressifs sur un même bien ne se
 * distingueraient plus.
 */

import { coefficientDegressif } from './amortissement-degressif';

/** Art. 33 de la loi n° 23/053 · taux linéaire × coefficient, ou null hors des bornes de l'art. 32. */
export function tauxDegressifLoi(dureeAns: number): number | null {
  const coef = coefficientDegressif(dureeAns);
  return coef === null ? null : coef / dureeAns;
}

export function motifRefusModeDegressif(o: {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  numeroCompte: string;
  dureeAns: number | null | undefined;
}): string | null {
  if (o.referentiel !== 'SYCEBNL') {
    return "Au SYSCOHADA, le dégressif est l'option fiscale de la loi n° 23/053 (art. 31 à 35) · le bien reste au linéaire et le complément passe en amortissement dérogatoire (fenêtre Dégressif fiscal).";
  }
  if (o.numeroCompte.startsWith('21')) {
    return 'Une immobilisation incorporelle ne s\'amortit pas en dégressif · la loi n° 23/053 (art. 32) l\'exclut.';
  }
  if (o.numeroCompte.startsWith('2011')) {
    return "L'usufruit temporaire s'amortit sur la durée de la donation suivant le mode linéaire (SYCEBNL Partie 3 ch. 2 § 2.3).";
  }
  if (o.dureeAns == null || tauxDegressifLoi(o.dureeAns) === null) {
    return 'Le dégressif de la loi n° 23/053 vaut pour une durée de quatre à vingt ans entiers (art. 32 et 33) · hors de ces bornes, la loi ne donne aucun coefficient.';
  }
  return null;
}

/**
 * L'annuité pleine du dégressif · le taux de l'art. 33 sur la valeur restant
 * à amortir, ou le linéaire de l'art. 35 s'il est plus fort.
 */
export function annuiteDegressive(reliquat: number, taux: number, anneesRestantes: number): number {
  const lineaire = anneesRestantes <= 1 ? reliquat : reliquat / anneesRestantes;
  return Math.max(reliquat * taux, lineaire);
}

export type NatureRevision = 'PROSPECTIVE' | 'RETROACTIVE';

/** Ce qui se refuse avant toute révision du plan. */
export function motifRefusRevision(o: {
  enService: boolean;
  debutAmortissement: Date | null;
  dureeNonLimitee: boolean;
  nonAmortissable: string | null;
  uniteOeuvre: boolean;
  degressifFiscal: boolean;
  /** L'ouverture de l'exercice de la décision. */
  ouvertureExercice: Date;
  exerciceClos: boolean;
  dotationDeLExercicePassee: boolean;
  nature: NatureRevision;
  nouvelleDureeAns: number;
  motif: string | null | undefined;
  /** Bien au DÉGRESSIF · la durée totale que la révision donnerait au plan. */
  degressifDureeTotale?: number | null;
}): string | null {
  if (!o.enService) return 'Le bien est sorti · son plan ne se révise plus.';
  if (o.nonAmortissable) return o.nonAmortissable;
  if (o.dureeNonLimitee) {
    return "Ce bien a une durée d'utilité non limitée · quand elle devient limitée, déclarez-le (« Durée limitée »), le plan part alors de la décision.";
  }
  if (o.uniteOeuvre) {
    return "Aux unités d'œuvre, le plan suit le total d'unités prévues, pas une durée en années · la révision de durée ne s'y applique pas.";
  }
  if (o.degressifFiscal) {
    return "Le bien porte l'option dégressive fiscale · réviser le plan comptable changerait le dérogatoire de chaque exercice. Reprenez d'abord le dérogatoire, ou passez la révision à la main.";
  }
  if (!o.debutAmortissement || o.debutAmortissement >= o.ouvertureExercice) {
    return "Le plan n'a encore couru sur aucun exercice clos · une révision ne vise qu'un plan déjà appliqué. La durée d'un bien qui commence s'établit à sa création.";
  }
  if (o.exerciceClos) return "La décision tombe dans un exercice clôturé · ses comptes ne s'ouvrent plus. Datez-la dans un exercice ouvert.";
  if (o.dotationDeLExercicePassee) {
    return "La dotation de l'exercice est déjà passée sur ce bien · la révision vaut pour l'exercice en cours, elle se décide avant la dotation.";
  }
  if (!Number.isInteger(o.nouvelleDureeAns) || o.nouvelleDureeAns < 1) {
    return o.nature === 'PROSPECTIVE'
      ? "La durée résiduelle se compte en années entières, une au moins."
      : 'La nouvelle durée du plan se compte en années entières, une au moins.';
  }
  if (o.degressifDureeTotale != null && tauxDegressifLoi(o.degressifDureeTotale) === null) {
    return `La révision porterait le plan à ${o.degressifDureeTotale} ans, hors des quatre à vingt ans où la loi n° 23/053 donne un coefficient (art. 32 et 33) · le dégressif n'aurait plus de taux.`;
  }
  if (!o.motif?.trim()) {
    return "La correction doit être « révélée et quantifiée, de même que les raisons de cette modification » (fiche du compte 28) · dites ce qui a changé.";
  }
  return null;
}

/** La révision rétroactive n'a de compte que pour RÉDUIRE le cumul (798). */
export function motifRefusRetroactive(o: {
  cumulActuel: number;
  cumulRejoue: number;
  amortissementAnterieur: number;
  partieDetachee: number;
  cumulDepreciation: number;
  lineaire: boolean;
}): string | null {
  if (!o.lineaire) {
    return 'La révision rétroactive rejoue un plan linéaire · pour un autre mode, révisez de façon prospective.';
  }
  if (o.amortissementAnterieur > 0.005 || o.partieDetachee > 0.005) {
    return "Le bien porte un amortissement antérieur à OmegaX ou une partie détachée · le plan passé ne se rejoue pas d'ici. Révisez de façon prospective.";
  }
  if (o.cumulDepreciation > 0.005) {
    return 'Le bien porte une dépréciation · le plan passé ne se rejoue pas sans elle. Révisez de façon prospective.';
  }
  if (!(o.cumulActuel - o.cumulRejoue > 0.005)) {
    return "La nouvelle durée n'abaisse pas le cumul des amortissements · le 798 ne porte qu'une réduction (AUDCIF, fiche du compte 79). Révisez de façon prospective.";
  }
  return null;
}
