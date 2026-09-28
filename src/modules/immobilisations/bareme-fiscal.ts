import { BAREME_AMORTISSEMENT_013_2025, NatureBaremeFiscal } from './bareme-amortissement-013-2025';

/*
  LECTURE DU BARÈME FISCAL · arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2.

  Le barème ne commande RIEN dans le plan comptable. La durée d'utilité est une
  estimation de l'entité (AUDCIF art. 45) et le barème un plafond de déduction
  (loi n° 23/053, art. 28 · la dépréciation « se calcule au moyen d'un taux
  d'amortissement fixé par Arrêté »). La nature choisie PROPOSE une durée,
  et un écart se signale · il ne se refuse jamais, l'art. 4 de l'arrêté
  admettant d'autres taux justifiés « lors du contrôle, sous peine de rejet ».
*/

const PAR_CLE = new Map(BAREME_AMORTISSEMENT_013_2025.map((n) => [n.cle, n]));

/** La ligne du barème pour une clé « section.rang », ou `undefined`. */
export function natureDuBareme(cle: string): NatureBaremeFiscal | undefined {
  return PAR_CLE.get(cle);
}

/** Le barème entier, dans l'ordre de l'arrêté · servi tel quel à l'écran. */
export function baremeFiscal(): readonly NatureBaremeFiscal[] {
  return BAREME_AMORTISSEMENT_013_2025;
}
