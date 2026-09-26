/**
 * SIMULATEUR BUDGÉTAIRE (priorité 6 de la comparaison avec les autres produits
 * Sage, docs/comparaison-sage-i7-omegax.md).
 *
 * Ce que la compétence `sage-i7` porte de l'Édition pilotée, et rien de plus ·
 * « modélisation de scénarios (hypothèse de croissance du chiffre d'affaires,
 * poids des charges) comparée au réalisé, avec jauge de couleur
 * (vert/orange/rouge) indiquant la tendance ; permet d'enregistrer, charger,
 * supprimer plusieurs simulations ». Ni la maquette, ni les seuils, ni la
 * méthode ne sont décrits · la définition est celle d'OmegaX, et l'aide le dit.
 * Le cube de données de Sage n'est pas repris · les requêtes vivantes
 * suffisent (plan de construction).
 *
 * CINQ DÉCISIONS, DÉCLARÉES.
 *  1. LA MAILLE EST LE COMPTE À DEUX CHIFFRES DES CLASSES 6 ET 7, et son
 *     intitulé est lu dans le plan du dossier · les deux référentiels ne
 *     donnent pas le même sens aux mêmes numéros, aucun n'est écrit ici.
 *     Le hors activités ordinaires (classe 8) et l'impôt sur le résultat n'y
 *     sont pas · le résultat simulé est celui des ACTIVITÉS ORDINAIRES, et il
 *     porte ce nom.
 *  2. LE RÉALISÉ EST UN MOUVEMENT DE L'EXERCICE, écritures de clôture
 *     exclues · la clôture remet les comptes de gestion à zéro, et lu au
 *     solde un exercice clos vaudrait zéro partout.
 *  3. L'HYPOTHÈSE EST UN TAUX DE VARIATION PAR LIGNE · les produits suivent
 *     par défaut la croissance du chiffre d'affaires, les charges restent au
 *     réalisé de référence tant que le cabinet ne leur donne pas de taux. Une
 *     charge « variable » se déclare, elle ne se devine pas.
 *  4. LE PRÉVU À DATE EST LE PRÉVU ANNUEL AU PRORATA DES JOURS ÉCOULÉS · c'est
 *     une convention de lecture (activité supposée régulière), dite à l'écran.
 *     Sur un exercice clos, ou arrêté à sa date de fin, le prorata vaut 1.
 *  5. LES SEUILS DE LA JAUGE SONT CEUX DE LA SIMULATION, jamais écrits en dur
 *     comme une norme · aucun texte n'en fixe. Seul l'écart DÉFAVORABLE
 *     colore : un produit en retard, une charge en dépassement. Un écart
 *     favorable reste vert.
 */

export type NatureLigne = 'PRODUIT' | 'CHARGE';
export type Jauge = 'VERT' | 'ORANGE' | 'ROUGE';

export type Hypotheses = {
  /** Croissance du chiffre d'affaires, en %, appliquée par défaut à la classe 7. */
  croissanceProduitsPct: number;
  /** Taux propre d'une ligne, par racine à deux chiffres (« 60 », « 70 »…). */
  variations: Record<string, number>;
};

export type Seuils = { orangePct: number; rougePct: number };

export type MouvementCompte = { numero: string; mouvementDebit: number; mouvementCredit: number };

const RACINE = /^[67]\d$/;

/** La racine à deux chiffres d'un compte de gestion, ou null hors classes 6 et 7. */
export function racineDeGestion(numero: string): string | null {
  const r = numero.slice(0, 2);
  return RACINE.test(r) ? r : null;
}

export const natureDeLaRacine = (racine: string): NatureLigne => (racine.startsWith('7') ? 'PRODUIT' : 'CHARGE');

/**
 * Les montants par racine, dans le SENS de leur nature · un produit se lit
 * crédit moins débit, une charge débit moins crédit. Une remise obtenue
 * enregistrée en déduction d'une charge la diminue, sans changer de ligne.
 */
export function montantsParRacine(lignes: readonly MouvementCompte[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lignes) {
    const r = racineDeGestion(l.numero);
    if (!r) continue;
    const net = natureDeLaRacine(r) === 'PRODUIT' ? l.mouvementCredit - l.mouvementDebit : l.mouvementDebit - l.mouvementCredit;
    m.set(r, (m.get(r) ?? 0) + net);
  }
  return m;
}

export function motifRefusSimulation(h: Hypotheses, s: Seuils): string | null {
  const taux = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= -100 && x <= 1000;
  if (!taux(h.croissanceProduitsPct)) return 'La croissance du chiffre d’affaires est un pourcentage entre -100 et 1000.';
  for (const [r, v] of Object.entries(h.variations ?? {})) {
    if (!RACINE.test(r)) return `« ${r} » n'est pas un compte à deux chiffres des classes 6 ou 7.`;
    if (!taux(v)) return `Le taux de la ligne ${r} est un pourcentage entre -100 et 1000.`;
  }
  const seuil = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000;
  if (!seuil(s.orangePct) || !seuil(s.rougePct) || s.orangePct >= s.rougePct) {
    return 'Les seuils de la jauge sont deux pourcentages positifs, l’orange strictement sous le rouge.';
  }
  return null;
}

/**
 * Part de l'exercice écoulée à la date d'arrêté, en jours, bornée à [0, 1].
 * On compte des JOURS DE CALENDRIER, jamais des durées · l'arrêté est posé à
 * 23 h 59 et une différence arrondie en comptait un de trop (182 au 30 juin).
 */
export function prorataTemporis(dateDebut: Date, dateFin: Date, arreteAu: Date): number {
  const jourDe = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  const total = jourDe(dateFin) - jourDe(dateDebut) + 1;
  const ecoules = jourDe(arreteAu) - jourDe(dateDebut) + 1;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, ecoules / total));
}

/** L'écart défavorable, en % du prévu · positif quand la ligne dérape. */
export function ecartDefavorablePct(nature: NatureLigne, prevu: number, realise: number): number | null {
  if (prevu === 0) return null;
  const ecart = nature === 'PRODUIT' ? prevu - realise : realise - prevu;
  return (ecart / Math.abs(prevu)) * 100;
}

export function jaugeDe(ecartPct: number | null, s: Seuils): Jauge | null {
  if (ecartPct === null) return null;
  if (ecartPct <= s.orangePct) return 'VERT';
  if (ecartPct <= s.rougePct) return 'ORANGE';
  return 'ROUGE';
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export type LigneSimulee = {
  racine: string;
  intitule: string;
  nature: NatureLigne;
  reference: number;
  tauxPct: number;
  prevuAnnuel: number;
  prevuADate: number;
  realise: number | null;
  ecartDefavorablePct: number | null;
  jauge: Jauge | null;
};

export function simuler(p: {
  reference: Map<string, number>;
  realise: Map<string, number> | null;
  intitules: Map<string, string>;
  hypotheses: Hypotheses;
  seuils: Seuils;
  prorata: number;
}) {
  const racines = [...new Set([...p.reference.keys(), ...(p.realise?.keys() ?? []), ...Object.keys(p.hypotheses.variations ?? {})])].sort();
  const lignes: LigneSimulee[] = racines.map((racine) => {
    const nature = natureDeLaRacine(racine);
    const reference = arrondi(p.reference.get(racine) ?? 0);
    const tauxPct = p.hypotheses.variations?.[racine] ?? (nature === 'PRODUIT' ? p.hypotheses.croissanceProduitsPct : 0);
    const prevuAnnuel = arrondi(reference * (1 + tauxPct / 100));
    const prevuADate = arrondi(prevuAnnuel * p.prorata);
    const realise = p.realise ? arrondi(p.realise.get(racine) ?? 0) : null;
    const ecart = realise === null ? null : ecartDefavorablePct(nature, prevuADate, realise);
    return {
      racine,
      intitule: p.intitules.get(racine) ?? '',
      nature,
      reference,
      tauxPct,
      prevuAnnuel,
      prevuADate,
      realise,
      ecartDefavorablePct: ecart === null ? null : arrondi(ecart),
      // Une ligne réalisée sans rien de prévu n'a pas d'écart en % · elle est
      // montrée, et sa jauge est laissée vide plutôt que peinte au hasard.
      jauge: jaugeDe(ecart, p.seuils),
    };
  });

  const total = (nature: NatureLigne, champ: 'reference' | 'prevuAnnuel' | 'prevuADate' | 'realise') =>
    arrondi(lignes.filter((l) => l.nature === nature).reduce((s, l) => s + ((l[champ] as number | null) ?? 0), 0));
  const totaux = (champ: 'reference' | 'prevuAnnuel' | 'prevuADate' | 'realise') => {
    const produits = total('PRODUIT', champ);
    const charges = total('CHARGE', champ);
    return { produits, charges, resultatActivitesOrdinaires: arrondi(produits - charges) };
  };
  const prevuADate = totaux('prevuADate');
  const realise = p.realise ? totaux('realise') : null;
  // La jauge du résultat · un résultat en dessous du prévu est défavorable,
  // comme un produit.
  const ecartResultat = realise ? ecartDefavorablePct('PRODUIT', prevuADate.resultatActivitesOrdinaires, realise.resultatActivitesOrdinaires) : null;
  return {
    lignes,
    totaux: {
      reference: totaux('reference'),
      prevuAnnuel: totaux('prevuAnnuel'),
      prevuADate,
      realise,
      jaugeResultat: jaugeDe(ecartResultat, p.seuils),
      ecartResultatPct: ecartResultat === null ? null : arrondi(ecartResultat),
    },
  };
}
