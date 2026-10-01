/**
 * LA VENTILATION D'UN PRIX GLOBAL (lot 8) · règles pures.
 *
 * AUDCIF art. 38 · « Lorsque des biens différents sont acquis conjointement
 * [...] pour un coût global, le coût d'entrée de chacun est déterminé ainsi :
 * si les biens sont individualisés par la suite, le coût initial global est
 * ventilé PROPORTIONNELLEMENT à la valeur attribuable à chacun d'eux [...] ;
 * dans le cas où tous les biens ne peuvent être individuellement valorisés,
 * par référence à un PRIX DE MARCHÉ ou de façon FORFAITAIRE s'il n'existe pas
 * de prix de marché, ceux qui n'auront pu être ainsi directement valorisés le
 * seront PAR DIFFÉRENCE [...]. Mention doit être faite dans les Notes annexes
 * des modalités d'évaluation retenues. »
 *
 * L'ENSEMBLE IMMOBILIER A SON ORDRE (Titre VIII ch. 11 § 1.7.1) · « La
 * ventilation doit correspondre au montant porté dans l'ACTE NOTARIÉ.
 * Lorsque la ventilation n'est pas détaillée dans l'acte authentique [...]
 * PAR ORDRE DE PRIORITÉ, les deux méthodes applicables sont : 1. COMPARAISON
 * reposant sur des transactions réalisées sur des terrains nus [...] la
 * valeur du bâtiment représente la différence [...] ; 2. À DÉFAUT,
 * détermination de la part du terrain en fonction de la valeur du bâtiment
 * calculée à partir de son COÛT DE RECONSTRUCTION ». Un terrain (22) acquis
 * avec un bâtiment (23) ne se ventile donc ni au prorata ni au forfait, et la
 * reconstruction exige de dire pourquoi la comparaison n'a pas pu se faire.
 *
 * LE FONDS DE COMMERCE N'EST PAS COMPTABILISÉ COMME TEL (Titre VIII ch. 2
 * § 7.2.1) · les éléments séparables vont à leur nature (stocks en classe 3,
 * matériel en classe 2, droit au bail 216, brevets 212, marques 214) et
 * « l'élément RÉSIDUEL non affecté [...] au débit du compte 2151 Fonds
 * commercial ». Le plan SYSCOHADA semé n'ouvre que le 21500000 (le texte
 * écrit 2151, que le plan ne subdivise pas) · c'est lui qui reçoit le reste.
 * Le SYCEBNL n'ouvre ni 215 ni 216 · le fonds commercial lui est refusé.
 */

const centimes = (x: number) => Math.round(x * 100) / 100;

export type FondementVentilation =
  | 'ACTE'
  | 'VALEURS_ATTRIBUABLES'
  | 'COMPARAISON_TERRAINS_NUS'
  | 'COUT_RECONSTRUCTION'
  | 'PRIX_DE_MARCHE'
  | 'FORFAIT';

/** Le libellé imprimé dans la modalité gardée sur chaque fiche (Notes annexes). */
export const LIBELLE_FONDEMENT: Record<FondementVentilation, string> = {
  ACTE: "montants portés à l'acte",
  VALEURS_ATTRIBUABLES: 'au prorata des valeurs attribuables (AUDCIF art. 38, 1er tiret)',
  COMPARAISON_TERRAINS_NUS: 'terrain par comparaison avec des terrains nus, bâtiment par différence (AUDCIF Titre VIII ch. 11 § 1.7.1, 1.)',
  COUT_RECONSTRUCTION: 'bâtiment au coût de reconstruction, terrain par différence (AUDCIF Titre VIII ch. 11 § 1.7.1, 2.)',
  PRIX_DE_MARCHE: 'par référence à un prix de marché, le reste par différence (AUDCIF art. 38, 2e tiret)',
  FORFAIT: 'de façon forfaitaire, le reste par différence (AUDCIF art. 38, 2e tiret)',
};

export interface ElementAVentiler {
  numeroCompte: string;
  /** Montant à l'acte, valeur attribuable ou valeur directe · absent pour l'élément par différence. */
  montant?: number | null;
  parDifference?: boolean;
}

const estTerrain = (n: string) => n.startsWith('22');
const estBatiment = (n: string) => n.startsWith('23');

/** Les coûts d'entrée de chaque bien, ou le motif du refus. */
export function ventilerPrixGlobal(o: {
  prix: number;
  fondement: FondementVentilation;
  elements: readonly ElementAVentiler[];
  /** Exigé pour le coût de reconstruction · la comparaison passe d'abord (§ 1.7.1). */
  motifSansComparaison?: string | null;
}): { montants: number[] } | { motif: string } {
  const { prix, fondement, elements } = o;
  if (!(prix > 0)) return { motif: 'Le prix global est positif.' };
  if (elements.length < 2) {
    return { motif: "Un prix global se ventile entre au moins deux biens · un bien seul s'enregistre à son coût (AUDCIF art. 38)." };
  }
  const ensembleImmobilier = elements.some((e) => estTerrain(e.numeroCompte)) && elements.some((e) => estBatiment(e.numeroCompte));
  if (ensembleImmobilier && !['ACTE', 'COMPARAISON_TERRAINS_NUS', 'COUT_RECONSTRUCTION'].includes(fondement)) {
    return {
      motif:
        "Un terrain acquis avec son bâtiment se ventile selon l'acte notarié, sinon par comparaison avec des terrains nus, à défaut au coût de reconstruction du bâtiment, par ordre de priorité (AUDCIF Titre VIII ch. 11 § 1.7.1).",
    };
  }
  const differences = elements.filter((e) => e.parDifference);
  const valorises = elements.filter((e) => !e.parDifference);
  if (valorises.some((e) => !(Number(e.montant) > 0))) {
    return { motif: 'Chaque bien valorisé porte un montant positif.' };
  }
  const somme = centimes(valorises.reduce((t, e) => t + Number(e.montant), 0));

  if (fondement === 'ACTE' || fondement === 'VALEURS_ATTRIBUABLES') {
    if (differences.length > 0) {
      return { motif: "Aucun bien ne se valorise par différence quand chacun a son montant · la différence est la méthode de l'art. 38, 2e tiret." };
    }
    if (fondement === 'ACTE') {
      if (somme !== centimes(prix)) {
        return { motif: `Les montants de l'acte totalisent ${somme.toFixed(2)} et le prix global ${centimes(prix).toFixed(2)} · ils doivent être égaux.` };
      }
      return { montants: elements.map((e) => centimes(Number(e.montant))) };
    }
    // Au prorata, le dernier bien prend le reste au centime · le total reste le prix.
    let reparti = 0;
    const montants = elements.map((e, i) => {
      const part = i === elements.length - 1 ? centimes(prix - reparti) : centimes((prix * Number(e.montant)) / somme);
      reparti = centimes(reparti + part);
      return part;
    });
    if (montants.some((m) => !(m > 0))) return { motif: 'La ventilation au prorata laisse un bien sans coût.' };
    return { montants };
  }

  if (differences.length !== 1) {
    return { motif: 'Un seul bien se valorise par différence, les autres directement (AUDCIF art. 38, 2e tiret).' };
  }
  const reste = centimes(prix - somme);
  if (!(reste > 0)) {
    return {
      motif: `Les valeurs directes (${somme.toFixed(2)}) atteignent ou dépassent le prix global (${centimes(prix).toFixed(2)}) · le bien valorisé par différence n'aurait aucun coût.`,
    };
  }
  const parDiff = differences[0];
  if (fondement === 'COMPARAISON_TERRAINS_NUS') {
    if (!valorises.every((e) => estTerrain(e.numeroCompte)) || !estBatiment(parDiff.numeroCompte)) {
      return { motif: 'Par comparaison avec des terrains nus, le terrain (22) se valorise et le bâtiment (23) prend la différence (AUDCIF Titre VIII ch. 11 § 1.7.1, 1.).' };
    }
  }
  if (fondement === 'COUT_RECONSTRUCTION') {
    if (!valorises.every((e) => estBatiment(e.numeroCompte)) || !estTerrain(parDiff.numeroCompte)) {
      return { motif: 'Au coût de reconstruction, le bâtiment (23) se valorise et le terrain (22) prend la différence (AUDCIF Titre VIII ch. 11 § 1.7.1, 2.).' };
    }
    if (!o.motifSansComparaison?.trim()) {
      return {
        motif:
          "Le coût de reconstruction ne vient qu'« à défaut » de la comparaison avec des terrains nus · dites pourquoi aucune transaction comparable n'a pu être retenue (AUDCIF Titre VIII ch. 11 § 1.7.1).",
      };
    }
  }
  return { montants: elements.map((e) => (e.parDifference ? reste : centimes(Number(e.montant)))) };
}

/**
 * Le fonds de commerce · le reste après les éléments séparables et les
 * stocks va au fonds commercial (21500000). Rend ce reste, ou le motif.
 */
export function ventilerFondsDeCommerce(o: {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  prix: number;
  /** Éléments immobilisés séparables, chacun à sa valeur. */
  elements: readonly { numeroCompte: string; montant: number }[];
  stocks: readonly { numeroCompte: string; montant: number }[];
}): { fondsCommercial: number } | { motif: string } {
  if (o.referentiel !== 'SYSCOHADA') {
    return {
      motif:
        "Le fonds commercial (215) et le droit au bail (216) n'existent qu'au plan SYSCOHADA · le SYCEBNL n'en ouvre aucun, et l'association ne se livre à des opérations commerciales qu'à titre accessoire (loi n° 004/2001, art. 1er).",
    };
  }
  if (!(o.prix > 0)) return { motif: 'Le prix global est positif.' };
  for (const e of o.elements) {
    if (e.numeroCompte.startsWith('215')) {
      return { motif: "Le fonds commercial est l'élément résiduel · il ne se saisit pas, il se calcule (AUDCIF Titre VIII ch. 2 § 7.2.1)." };
    }
    if (!/^2[1-4]/.test(e.numeroCompte)) {
      return { motif: `Le compte ${e.numeroCompte} n'est pas une immobilisation incorporelle ou corporelle (21 à 24) · un élément du fonds va à sa nature.` };
    }
    if (!(e.montant > 0)) return { motif: 'Chaque élément séparable porte une valeur positive.' };
  }
  for (const s of o.stocks) {
    if (!/^3[0-8]/.test(s.numeroCompte)) {
      return { motif: `Le compte ${s.numeroCompte} n'est pas un compte de stock (classe 3, hors dépréciations 39).` };
    }
    if (!(s.montant > 0)) return { motif: 'Chaque stock repris porte une valeur positive.' };
  }
  const somme = centimes([...o.elements, ...o.stocks].reduce((t, e) => t + e.montant, 0));
  const reste = centimes(o.prix - somme);
  if (reste < 0) {
    return {
      motif: `Les éléments séparables et les stocks (${somme.toFixed(2)}) dépassent le prix (${centimes(o.prix).toFixed(2)}) · leurs valeurs sont à revoir, aucun fonds commercial négatif ne s'inscrit.`,
    };
  }
  if (o.elements.length === 0 && reste === 0) {
    return { motif: "Aucun élément immobilisé ni fonds commercial · une reprise de stocks seule n'est pas une acquisition d'immobilisation." };
  }
  return { fondsCommercial: reste };
}
