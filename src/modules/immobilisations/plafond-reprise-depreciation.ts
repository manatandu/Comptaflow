/**
 * LE PLAFOND DE REPRISE D'UNE DÉPRÉCIATION (lot 12) · règles pures.
 *
 * AUDCIF Titre VIII ch. 12 § 2.4.2 · « la valeur comptable de l'immobilisation
 * augmentée en raison de la reprise ne doit pas être supérieure à la valeur
 * comptable qui aurait été déterminée (nette des amortissements) si aucune
 * perte de valeur n'avait été comptabilisée au cours des exercices
 * antérieurs. Cette disposition vise à éviter la réévaluation ultérieure
 * d'une immobilisation dépréciée. »
 *
 * La règle vaut aux deux référentiels · l'art. 46 de l'AUDCIF n'est pas exclu
 * par l'art. 3 du SYCEBNL, et la fiche du compte 29 du SYCEBNL renvoie
 * elle-même au Titre VIII de l'AUDCIF pour la dépréciation (« voir SYSCOHADA,
 * titre VIII, chapitre 13 » · [texte officiel] le chapitre de la dépréciation
 * des immobilisations est le 12, le 13 est celui du portefeuille-titres ;
 * renvoi signalé, non corrigé).
 *
 * LE PLAN D'ORIGINE SE REJOUE, IL NE SE DÉDUIT PAS. Après une perte de valeur,
 * l'annuité baisse (§ 2.4.1) · la valeur « sans dépréciation » n'est donc ni la
 * valeur nette actuelle plus le cumul du 29, ni rien qu'une soustraction
 * donne. Le service rejoue le même moteur de dotation exercice par exercice,
 * dépréciation nulle (`ImmobilisationService.valeurSansDepreciation`). Exemple
 * du § 2.4.2 · 30 000 000 sur dix ans, dépréciés de 4 000 000 en fin N ; en fin
 * N+2, valeur nette 15 000 000, valeur sans dépréciation 18 000 000 · reprise
 * au plus 3 000 000.
 *
 * L'ORDRE DU TEXTE · « la nouvelle valeur comptable APRÈS amortissement ET
 * reprise ». Les deux valeurs se comparent en fin d'exercice, dotation de
 * l'exercice comprise, qu'elle soit déjà passée ou seulement due.
 */

const EPSILON = 0.005;
const arrondir = (x: number) => Math.round(x * 100) / 100;

/**
 * Le plus que la reprise peut rendre · l'écart entre la valeur sans
 * dépréciation et la valeur nette, sans jamais dépasser ce que le 29 porte
 * (au-delà, le 29 deviendrait débiteur · fiche du compte 29, « corrections
 * d'actif de sens négatif »).
 */
export function plafondRepriseDepreciation(o: {
  cumulDepreciation: number;
  valeurNette: number;
  valeurSansDepreciation: number;
}): number {
  const ecart = Math.max(0, o.valeurSansDepreciation - o.valeurNette);
  return arrondir(Math.max(0, Math.min(o.cumulDepreciation, ecart)));
}

export function motifRefusRepriseDepreciation(o: {
  montant: number;
  cumulDepreciation: number;
  valeurNette: number;
  valeurSansDepreciation: number;
}): string | null {
  if (o.montant > o.cumulDepreciation + EPSILON) {
    return `La reprise ne peut pas dépasser la dépréciation encore inscrite (${o.cumulDepreciation.toFixed(2)})`;
  }
  const plafond = plafondRepriseDepreciation(o);
  if (o.montant > plafond + EPSILON) {
    return (
      `La reprise est plafonnée à ${plafond.toFixed(2)} · après reprise, la valeur nette ne peut pas dépasser ` +
      `celle qu'aurait le bien sans dépréciation, plan d'origine rejoué (${arrondir(o.valeurSansDepreciation).toFixed(2)} ; ` +
      `valeur nette en fin d'exercice ${arrondir(o.valeurNette).toFixed(2)}). Au-delà, la reprise réévaluerait le bien ` +
      '(AUDCIF Titre VIII ch. 12 § 2.4.2).'
    );
  }
  return null;
}
