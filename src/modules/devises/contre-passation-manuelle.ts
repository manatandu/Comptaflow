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

/**
 * L'ÉTAT RÉEL DE L'ÉCART, JUGÉ CONTRE CE QU'ATTEND LE MODULE (cinquième tour,
 * décision du coordinateur · une seule règle, fondée sur les soldes et non
 * plus sur la reconnaissance d'écritures, servie à `extourner`, au portillon,
 * à la déclaration et à l'écran).
 *
 * LE VECTEUR · un montant, en centimes, par compte de l'écart de la
 * réévaluation (le 478 ou le 479, et le compte de tiers ou de dette) :
 *  · sur le 478 et le 479, le SOLDE réel dans l'exercice qui reçoit la
 *    contre-passation, à l'instant du geste · ils ne portent que des écarts
 *    de conversion (fiches des comptes 478 et 479), leur solde se lit sans
 *    rien deviner ;
 *  · sur le tiers, dont le solde mêle l'écart aux opérations de l'entité,
 *    l'attendu PLUS l'écart d'ouverture (AUDCIF art. 34) et les mouvements
 *    des écritures hors module qui touchent le 478 ou le 479 de l'écart
 *    (`ecartTiers`) · la seule part du tiers qui ne soit pas une opération.
 * L'ATTENDU · la somme des écarts encore en place · ceux du module
 * (réévaluations non contre-passées) et ceux passés hors du module dans un
 * exercice antérieur à la contre-passation, dans le sens de l'écart (un autre
 * écart, légitime, sur le même 4791 · X1).
 *
 * Le lu se lit comme l'attendu moins les écarts d'un SOUS-ENSEMBLE des écarts
 * en place, déjà contre-passés hors du module · la recherche est exhaustive,
 * bornée à douze écarts qui touchent ces comptes.
 *  · aucun sous-ensemble ne rend le lu · ANOMALIE ;
 *  · tous ceux qui le rendent contiennent la réévaluation · CONTRE_PASSEE ;
 *  · aucun ne la contient (le vide compris, lu = attendu) · EN_PLACE ;
 *  · sinon · AMBIGU (deux écarts de mêmes comptes et mêmes montants).
 */
export type VerdictDeLEtat = 'EN_PLACE' | 'CONTRE_PASSEE' | 'ANOMALIE' | 'AMBIGU';

export const PLAFOND_SOUS_ENSEMBLES = 12;

export function verdictDeLEtat(p: {
  comptes: string[];
  lu: Map<string, number>;
  enPlace: Array<{ id: string; ecart: Map<string, number> }>;
  reevaluationId: string;
}): { verdict: VerdictDeLEtat; attendu: Map<string, number>; trop: boolean } {
  const attendu = new Map<string, number>();
  for (const c of p.comptes) attendu.set(c, p.enPlace.reduce((t, r) => t + (r.ecart.get(c) ?? 0), 0));
  const manque = p.comptes.map((c) => (attendu.get(c) ?? 0) - (p.lu.get(c) ?? 0));
  // Seuls comptent les écarts qui touchent ces comptes · les autres n'entrent
  // dans aucune somme.
  const utiles = p.enPlace.filter((r) => p.comptes.some((c) => (r.ecart.get(c) ?? 0) !== 0));
  if (utiles.length > PLAFOND_SOUS_ENSEMBLES) return { verdict: 'ANOMALIE', attendu, trop: true };
  let avec = 0;
  let sans = 0;
  for (let masque = 0; masque < 1 << utiles.length; masque++) {
    const somme = p.comptes.map((c) => utiles.reduce((t, r, i) => (masque & (1 << i) ? t + (r.ecart.get(c) ?? 0) : t), 0));
    if (!somme.every((s, i) => s === manque[i])) continue;
    if (utiles.some((r, i) => masque & (1 << i) && r.id === p.reevaluationId)) avec++;
    else sans++;
  }
  const verdict: VerdictDeLEtat =
    avec === 0 && sans === 0 ? 'ANOMALIE' : avec > 0 && sans > 0 ? 'AMBIGU' : avec > 0 ? 'CONTRE_PASSEE' : 'EN_PLACE';
  return { verdict, attendu, trop: false };
}

/** Une écriture HORS MODULE qui touche le 478 ou le 479 de l'écart, depuis la réévaluation. */
export interface EcritureSurLEcart {
  id: string;
  numeroPiece: number | null;
  date: Date;
  /** Dans l'exercice qui reçoit la contre-passation · elle s'y corrige. Avant lui, son effet s'inverse à son ouverture. */
  dansLaCible: boolean;
  /** Elle inverse exactement l'écart de la réévaluation, tiers compris (`motifRefusInversion`). */
  exacte: boolean;
  /** Elle porte le 478 ou le 479 contre un compte étranger à l'écart (une banque, un autre client). */
  horsDeLEcart: boolean;
  /** Débit moins crédit, en centimes, sur chaque compte de l'écart. */
  effet: Map<string, number>;
}

/** Un geste que l'issue demande, dans l'ordre. */
export type GesteDIssue = { type: 'RETABLIR' } | { type: 'NEUTRALISER'; ecritures: EcritureSurLEcart[] };

/** L'issue PROUVÉE · après ces gestes, l'état rejugé dit ce qui reste à faire. */
export type IssueDeLEtat =
  | { gestes: GesteDIssue[]; fin: 'CONTRE_PASSER' }
  | { gestes: GesteDIssue[]; fin: 'DECLARER'; ecriture: EcritureSurLEcart };

export interface JugementDeLEtat {
  verdict: VerdictDeLEtat;
  /** L'attendu, compte par compte (écarts en place). */
  attendu: Map<string, number>;
  /** Le lu, compte par compte (le solde sur le 478 et le 479 ; l'attendu plus `ecartTiers` sur le tiers). */
  lu: Map<string, number>;
  trop: boolean;
  /** `null` · aucune issue que le calcul prouve juste · « rapprochez ». */
  issue: IssueDeLEtat | null;
}

/**
 * LE JUGEMENT, ET L'ISSUE QUE LE CALCUL PROUVE. Chaque message n'annonce
 * qu'une issue dont l'état, rejugé après ses gestes, rend le module juste
 * (EN_PLACE · « contre-passez ») ou la déclaration admise (CONTRE_PASSEE avec
 * une écriture qui inverse exactement l'écart · « déclarez-la »). Les gestes
 * essayés, dans l'ordre, du moindre au plus lourd :
 *  · aucun ;
 *  · RÉTABLIR l'écart, quand l'ouverture l'omet exactement, sur tous ses
 *    comptes (`retablissable` · AUDCIF art. 34 ; SYCEBNL art. 16, 4)) ;
 *  · NEUTRALISER les écritures qui portent le 478 ou le 479 contre un compte
 *    étranger à l'écart, puis toutes celles qui ne l'inversent pas
 *    exactement, puis toutes sauf une exacte, puis toutes · chacune avec et
 *    sans rétablissement.
 * Aucune ne convient · `issue` vaut `null`, le message chiffre et dit de
 * rapprocher. Une lecture tronquée (`ecritures` à `null`) n'essaie que le
 * rétablissement.
 */
export function jugerLEtat(p: {
  comptes47: string[];
  comptesTiers: string[];
  /** Le solde réel de chaque 478 ou 479 de l'écart. */
  lu47: Map<string, number>;
  /** Sur chaque compte de tiers · écart d'ouverture plus mouvements des écritures hors module non tenues pour en place. */
  ecartTiers: Map<string, number>;
  enPlace: Array<{ id: string; ecart: Map<string, number> }>;
  reevaluationId: string;
  /** L'écart de la réévaluation sur chacun de ses comptes (débit moins crédit, centimes). */
  ecartX: Map<string, number>;
  retablissable: boolean;
  /** Les écritures hors module tenues dans `lu47` et `ecartTiers` · `null` si la lecture est tronquée. */
  ecritures: EcritureSurLEcart[] | null;
}): JugementDeLEtat {
  const comptes = [...p.comptes47, ...p.comptesTiers];
  const attendu = new Map<string, number>();
  for (const c of comptes) attendu.set(c, p.enPlace.reduce((t, r) => t + (r.ecart.get(c) ?? 0), 0));
  const lu = new Map<string, number>();
  for (const c of p.comptes47) lu.set(c, p.lu47.get(c) ?? 0);
  for (const c of p.comptesTiers) lu.set(c, (attendu.get(c) ?? 0) + (p.ecartTiers.get(c) ?? 0));
  const juger = (gestes: GesteDIssue[]) => {
    const apres = new Map(lu);
    for (const g of gestes) {
      if (g.type === 'RETABLIR') {
        for (const c of comptes) apres.set(c, (apres.get(c) ?? 0) + (p.ecartX.get(c) ?? 0));
      } else {
        for (const e of g.ecritures) for (const c of comptes) apres.set(c, (apres.get(c) ?? 0) - (e.effet.get(c) ?? 0));
      }
    }
    return verdictDeLEtat({ comptes, lu: apres, enPlace: p.enPlace, reevaluationId: p.reevaluationId });
  };
  const premier = juger([]);
  const essais: GesteDIssue[][] = [[]];
  const avecRetablissement = (gestes: GesteDIssue[]) => {
    essais.push(gestes);
    if (p.retablissable) essais.push([...gestes, { type: 'RETABLIR' }]);
  };
  if (p.retablissable) essais.push([{ type: 'RETABLIR' }]);
  if (p.ecritures && p.ecritures.length > 0) {
    const vus = new Set<string>();
    const lot = (liste: EcritureSurLEcart[]) => {
      if (liste.length === 0) return;
      const cle = liste.map((e) => e.id).sort().join(',');
      if (vus.has(cle)) return;
      vus.add(cle);
      avecRetablissement([{ type: 'NEUTRALISER', ecritures: liste }]);
    };
    const toutes = p.ecritures;
    lot(toutes.filter((e) => e.horsDeLEcart && !e.exacte));
    lot(toutes.filter((e) => !e.exacte));
    for (const gardee of toutes.filter((e) => e.exacte).slice(0, 3)) lot(toutes.filter((e) => e.id !== gardee.id));
    lot(toutes);
  }
  for (const gestes of essais) {
    const j = gestes.length === 0 ? premier : juger(gestes);
    if (j.verdict === 'EN_PLACE') {
      return { verdict: premier.verdict, attendu, lu, trop: premier.trop, issue: { gestes, fin: 'CONTRE_PASSER' } };
    }
    if (j.verdict === 'CONTRE_PASSEE' || j.verdict === 'AMBIGU') {
      const neutralisees = new Set(gestes.flatMap((g) => (g.type === 'NEUTRALISER' ? g.ecritures.map((e) => e.id) : [])));
      const exacte = (p.ecritures ?? []).find((e) => e.exacte && !neutralisees.has(e.id));
      if (exacte) return { verdict: premier.verdict, attendu, lu, trop: premier.trop, issue: { gestes, fin: 'DECLARER', ecriture: exacte } };
    }
  }
  return { verdict: premier.verdict, attendu, lu, trop: premier.trop, issue: null };
}
