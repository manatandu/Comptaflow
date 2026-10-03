/**
 * LA CONTRE-PASSATION DES ÉCARTS DE CONVERSION, PAR COMPTE (relecture
 * adverse d'A5 bis, troisième tour).
 *
 * Source de la contre-passation, relue dans la compétence `syscohada`
 * (Guide, Partie 2 ch. 22, « Opérations en devises ») · « Écarts de
 * conversion à la clôture (478 actif / 479 passif), contrepassés à la
 * réouverture » ; Application 84, « Contrepassation de l'écart au 01/01/N+1 :
 * 411 · 4781 pour 2 500 000 » et « Contrepassation au 01/01/N+1 : 4791 · 411
 * pour 5 000 000 » ; Application 85, « Contrepassation au 01/01/N+1 : 4793 ·
 * 4812 pour 3 750 000 ». Les écarts sont ceux de l'AUDCIF art. 54 · les
 * disponibilités en sont exclues (art. 57, Application 86, aucune
 * contre-passation · `partagerLignesDEcarts`).
 *
 * Ce que la contre-passation doit faire se lit compte par compte · pour
 * chaque compte de l'écart de conversion (le tiers et son 478 ou 479), le
 * débit moins le crédit de l'écriture des écarts, à inverser au centime. Une
 * contre-passation faite À LA MAIN, hors du module, se DÉCLARE (même modèle
 * que les versions de la provision d'ouverture) · le cabinet désigne
 * l'écriture, et le serveur vérifie qu'elle inverse exactement chacun de ces
 * comptes. D'autres lignes, sur d'autres comptes, sont admises · une OD
 * d'ouverture peut grouper plusieurs gestes.
 */

const centimes = (x: number) => Math.round(x * 100);

/** Une ligne d'écriture, réduite à ce que la contre-passation lit. */
export interface LigneAContrePasser {
  compteId: string;
  compteNumero: string;
  debit: number;
  credit: number;
}

/** Ce qu'une contre-passation doit inverser sur un compte · débit moins crédit de l'écart, en centimes. */
export interface MontantAContrePasser {
  compteId: string;
  compteNumero: string;
  /** Débit moins crédit de l'écriture des écarts sur ce compte, en centimes. */
  netCentimes: number;
}

/**
 * Les montants à contre-passer, compte par compte · les lignes d'un même
 * compte (deux devises sur un 411) s'additionnent. Un compte dont le net est
 * nul n'a rien à contre-passer.
 */
export function montantsAContrePasser(lignes: LigneAContrePasser[]): MontantAContrePasser[] {
  const parCompte = new Map<string, MontantAContrePasser>();
  for (const l of lignes) {
    const m = parCompte.get(l.compteId) ?? { compteId: l.compteId, compteNumero: l.compteNumero, netCentimes: 0 };
    m.netCentimes += centimes(Number(l.debit)) - centimes(Number(l.credit));
    parCompte.set(l.compteId, m);
  }
  return [...parCompte.values()].filter((m) => m.netCentimes !== 0).sort((a, b) => a.compteNumero.localeCompare(b.compteNumero));
}

const enFrancs = (c: number) => (Math.abs(c) / 100).toFixed(2);

/**
 * Le libellé des montants à contre-passer, dans le sens de la
 * CONTRE-PASSATION (l'inverse de l'écart) · « 41110000 au crédit de
 * 500000.00, 47910000 au débit de 500000.00 ».
 */
export function libelleMontantsAContrePasser(montants: MontantAContrePasser[]): string {
  return montants.map((m) => `${m.compteNumero} au ${m.netCentimes > 0 ? 'crédit' : 'débit'} de ${enFrancs(m.netCentimes)}`).join(', ');
}

/**
 * Le libellé des montants de l'ÉCART lui-même, dans son sens · « 41110000 au
 * débit de 500000.00, 47910000 au crédit de 500000.00 ». Sert à nommer l'OD
 * qui RÉTABLIT un écart qu'un bilan d'ouverture a omis (quatrième tour, m1).
 */
export function libelleMontantsDeLEcart(montants: MontantAContrePasser[]): string {
  return montants.map((m) => `${m.compteNumero} au ${m.netCentimes > 0 ? 'débit' : 'crédit'} de ${enFrancs(m.netCentimes)}`).join(', ');
}

/**
 * L'écriture désignée inverse-t-elle EXACTEMENT chaque compte de l'écart de
 * conversion ? `null` si oui, sinon le refus, compte par compte.
 *
 * L'INVERSION SE PORTE DU CÔTÉ OPPOSÉ, EN MONTANTS POSITIFS (quatrième tour,
 * BLOQUANT 1). Comparer des nets par compte laissait passer une INSCRIPTION
 * EN NÉGATIF · « 4111 au débit de −500 000 » vaut un crédit de 500 000 au
 * net, et la correction d'une OD passée dans le mauvais sens se déclarait
 * comme la contre-passation, que l'OD fautive et son négatif ne font pas
 * (411 à 2 900 000 au lieu de 2 400 000). Une contre-passation est
 * l'écriture inverse, « 411 · 4781 » pour une perte, « 4791 · 411 » pour un
 * gain (Guide, Partie 2 ch. 22, Application 84) · sur chaque compte de
 * l'écart, aucune ligne négative, rien du côté de l'écart, et du côté opposé
 * exactement son montant · ni plus (elle déplacerait autre chose sur le
 * même compte, que la réévaluation suivante ne saurait pas lire), ni moins
 * (une part de l'écart resterait en place, et serait repassée).
 */
export function motifRefusInversion(attendus: MontantAContrePasser[], lignesDeLEcriture: LigneAContrePasser[]): string | null {
  if (attendus.length === 0) {
    return "Cette réévaluation n'a aucun écart de conversion à contre-passer · il n'y a rien à déclarer.";
  }
  const ecarts: string[] = [];
  for (const a of attendus) {
    const surLeCompte = lignesDeLEcriture.filter((l) => l.compteId === a.compteId);
    if (surLeCompte.some((l) => Number(l.debit) < 0 || Number(l.credit) < 0)) {
      ecarts.push(`${a.compteNumero} · montants négatifs (inscription en négatif) · une correction annule une écriture, elle ne contre-passe pas un écart`);
      continue;
    }
    const debits = surLeCompte.reduce((t, l) => t + centimes(Number(l.debit)), 0);
    const credits = surLeCompte.reduce((t, l) => t + centimes(Number(l.credit)), 0);
    // L'écart au débit (perte sur une dette, gain sur une créance) se
    // contre-passe au crédit, et inversement.
    const oppose = a.netCentimes > 0 ? credits : debits;
    const memeCote = a.netCentimes > 0 ? debits : credits;
    const sensOppose = a.netCentimes > 0 ? 'crédit' : 'débit';
    const sensEcart = a.netCentimes > 0 ? 'débit' : 'crédit';
    if (oppose === Math.abs(a.netCentimes) && memeCote === 0) continue;
    const lu = oppose === 0 ? 'rien' : `${sensOppose} de ${enFrancs(oppose)}`;
    ecarts.push(
      `${a.compteNumero} · attendu ${sensOppose} de ${enFrancs(a.netCentimes)}, l'écriture porte ${lu}` +
        (memeCote !== 0 ? `, et un ${sensEcart} de ${enFrancs(memeCote)}` : ''),
    );
  }
  if (ecarts.length === 0) return null;
  return (
    "L'écriture désignée n'inverse pas exactement l'écart de conversion de cette réévaluation · " +
    `${ecarts.join(' ; ')}. Une contre-passation partielle laisserait une part de l'écart en place, que la réévaluation ` +
    "suivante repasserait ; une contre-passation qui déborde déplacerait autre chose sur le même compte. Désignez l'écriture " +
    'qui contre-passe chacun de ces comptes au centime, du côté opposé et en montants positifs. Une écriture qui contre-passe ' +
    "plusieurs réévaluations à la fois, ou une part seulement de l'écart, ne se déclare pas · corrigez-la par inscription en " +
    "négatif (AUDCIF art. 20, al. 2), puis contre-passez chaque réévaluation séparément."
  );
}

/**
 * Les disponibilités dont l'écriture désignée a inversé l'écart RÉALISÉ ·
 * même mesure, compte par compte, sur les lignes de banque ou de caisse de
 * l'écriture des écarts (`realisees` du partage). Une contre-passation faite
 * à la main comme le faisait le module avant A5 bis inverse aussi la banque ·
 * la réévaluation suivante la mesure alors depuis son coût historique, et le
 * contrôle 34 le nomme (AUDCIF art. 57).
 */
export function disponibilitesInversees(
  realisees: LigneAContrePasser[],
  lignesDeLEcriture: LigneAContrePasser[],
  estDisponibilite: (numero: string) => boolean,
): Set<string> {
  const inversees = new Set<string>();
  for (const a of montantsAContrePasser(realisees.filter((l) => estDisponibilite(l.compteNumero)))) {
    const net = lignesDeLEcriture
      .filter((l) => l.compteId === a.compteId)
      .reduce((t, l) => t + centimes(Number(l.debit)) - centimes(Number(l.credit)), 0);
    if (net === -a.netCentimes) inversees.add(a.compteId);
  }
  return inversees;
}
