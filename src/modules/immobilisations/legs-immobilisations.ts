/**
 * LE LEGS D'IMMOBILISATIONS GREVÉ DE DETTES (lot 7, SYCEBNL seul) · règles
 * pures.
 *
 * SYCEBNL Partie 3 ch. 2 § 1.2.2 · « lors de l'enregistrement de la donation
 * au vu de l'acte » · D 2 Immobilisations / C 4861 Dettes des dons et legs
 * d'immobilisations / C 167 Fonds provenant des dons et legs d'immobilisations.
 * Application 5 du Guide · biens 447 000 000, dettes successorales
 * 25 000 000, 167 crédité de 422 000 000, en UNE pièce.
 *
 * UNE PIÈCE PAR BIEN (décision D-16 de Manasse, 2026-10-01) · chaque fiche
 * retient sa propre écriture d'acquisition, et la reprise du 167 se lit bien
 * par bien. Les dettes se RÉPARTISSENT au prorata des valeurs d'entrée, le
 * dernier bien prenant le reste au centime · les totaux du 4861 et du 167
 * restent ceux de l'acte. Répartition de l'éditeur, le texte n'en parlant pas
 * (il n'a qu'une pièce).
 *
 * Le 1679 « Engagement auprès du donateur » n'est pas un fonds reçu (il porte
 * au débit la provision du 192, § 1.2.2, « à la clôture ») · refusé ici.
 */

const centimes = (x: number) => Math.round(x * 100) / 100;

/** La part des dettes de chaque bien, au prorata des valeurs, au centime. */
export function repartirDettesLegs(valeurs: readonly number[], dettes: number): number[] {
  const total = valeurs.reduce((t, v) => t + v, 0);
  let reparti = 0;
  return valeurs.map((v, i) => {
    const part = i === valeurs.length - 1 ? centimes(dettes - reparti) : total > 0 ? centimes((dettes * v) / total) : 0;
    reparti = centimes(reparti + part);
    return part;
  });
}

export function motifRefusLegs(o: {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  numeroFonds: string;
  numeroDettes: string | null;
  dettes: number;
  valeurs: readonly number[];
}): string | null {
  if (o.referentiel !== 'SYCEBNL') {
    return "Le legs d'immobilisations au 167 et au 4861 est propre au SYCEBNL (Partie 3 ch. 2 § 1.2.2) · au SYSCOHADA, le 167 et le 486 n'ont pas ce sens.";
  }
  if (!o.numeroFonds.startsWith('167') || o.numeroFonds.startsWith('1679')) {
    return "Le fonds d'un legs à conserver est un 167 « Fonds provenant des dons et legs d'immobilisations » · le 1679 porte l'engagement auprès du donateur, pas le fonds reçu (SYCEBNL Partie 3 ch. 2 § 1.2.2).";
  }
  if (o.valeurs.length === 0) return "Un legs d'immobilisations porte au moins un bien.";
  if (o.valeurs.some((v) => !(v > 0))) return "Chaque bien du legs a une valeur d'entrée positive.";
  if (o.dettes < 0) return 'Les dettes du legs ne sont pas négatives.';
  if (o.dettes > 0) {
    if (!o.numeroDettes || !o.numeroDettes.startsWith('4861')) {
      return 'Les dettes reprises avec le legs vont au 4861 « Dettes des dons et legs d\'immobilisations » (SYCEBNL Partie 3 ch. 2 § 1.2.2).';
    }
    const total = o.valeurs.reduce((t, v) => t + v, 0);
    if (centimes(o.dettes) >= centimes(total)) {
      return "Les dettes égalent ou dépassent la valeur des biens · l'actif net reçu n'est pas positif, et le 167 n'aurait rien à porter.";
    }
  }
  return null;
}
