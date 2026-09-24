import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import { ResultatCumul } from './cumul-consolidation';
import { LigneEtatConsolide } from './etats-consolides';

/**
 * TABLEAU DES FLUX ET VARIATION DES CAPITAUX PROPRES CONSOLIDÉS · tranche 3b,
 * D4C ch. XII-8 § 4 et § 5.
 *
 * LES FLUX SE LISENT SUR DES MOUVEMENTS, PAS SUR DES SOLDES. Le D4C les veut
 * « bruts en principe » : un emprunt nouveau et un remboursement ne se
 * compensent pas, une acquisition et une cession non plus. Une différence de
 * soldes ne rend que leur somme. Le tableau est donc refusé tant qu'une
 * entité intégrée n'a pas fourni ses mouvements de l'exercice, et le refus
 * la nomme.
 *
 * LA TABLE DU CH. 5 N'EST PAS RÉÉCRITE · FA à FQ sont ceux du tableau
 * individuel, appliqués aux lignes consolidées (mouvements et soldes
 * cumulés à la fraction, éliminations faites sur les soldes), puis regroupés
 * au modèle consolidé. Seuls s'ajoutent les flux que la consolidation crée et
 * qu'aucun compte cumulé ne porte :
 *
 * - les DIVIDENDES REÇUS DES ENTITÉS MISES EN ÉQUIVALENCE · encaissés par la
 *   détentrice, éliminés de son résultat, et dont la contrepartie est la
 *   baisse des titres mis en équivalence, qui n'est pas un compte ;
 * - l'ÉLIMINATION DES RÉSULTATS INTERNES · elle réduit un stock ou une
 *   immobilisation sans trésorerie, ce que la variation du besoin en fonds de
 *   roulement ou des acquisitions lirait comme un encaissement · la CAFG
 *   consolidée la porte, comme le résultat consolidé ;
 * - les FLUX AVEC LES ACTIONNAIRES · les capitaux propres consolidés ne sont
 *   plus des comptes (ils sont partagés entre groupe et minoritaires). Les
 *   augmentations de capital, prélèvements et dividendes de la CONSOLIDANTE
 *   sont lus sur ses propres comptes, par la même table ; les dividendes des
 *   MINORITAIRES se lisent par la variation de leurs intérêts, résultat
 *   déduit, corrigée de ce qui reste à payer au 465 des filiales.
 */

const r2 = (x: number) => Math.round(x * 100) / 100;
const somme = (xs: (number | null | undefined)[]) => r2(xs.reduce<number>((s, x) => s + (x ?? 0), 0));
const EPS = 0.005;

const classeDe = (numero: string): ClasseCompte | null => {
  const c = `CLASSE_${numero[0]}` as ClasseCompte;
  return Object.values(ClasseCompte).includes(c) ? c : null;
};

/**
 * La balance consolidée AVEC ses mouvements · un compte soldé à la clôture
 * (un emprunt remboursé en entier) n'a plus de solde mais a des mouvements, et
 * c'est lui que le tableau des flux doit voir.
 */
export function lignesAvecMouvements(cumul: ResultatCumul): LigneBalancePourEtat[] {
  const parCle = new Map<string, LigneBalancePourEtat>();
  const ligne = (cle: string, intitule: string): LigneBalancePourEtat | null => {
    const classe = classeDe(cle);
    if (!classe) return null;
    let l = parCle.get(cle);
    if (!l) {
      l = {
        compteId: cle,
        numero: cle,
        intitule,
        classe,
        typeCompte: TypeCompteDetailTotal.DETAIL,
        totalDebit: 0,
        totalCredit: 0,
        reportDebit: 0,
        reportCredit: 0,
        mouvementDebit: 0,
        mouvementCredit: 0,
        solde: 0,
      };
      parCle.set(cle, l);
    }
    return l;
  };
  for (const c of cumul.lignes) {
    if (!/^\d/.test(c.cle)) continue;
    const l = ligne(c.cle, c.intitule);
    if (!l) continue;
    l.solde = c.solde;
    l.totalDebit = c.solde > 0 ? c.solde : 0;
    l.totalCredit = c.solde < 0 ? -c.solde : 0;
  }
  for (const m of cumul.mouvements) {
    const l = ligne(m.cle, m.intitule);
    if (!l) continue;
    l.mouvementDebit = m.debit;
    l.mouvementCredit = m.credit;
  }
  return [...parCle.values()];
}

export interface EntreesFluxConsolides {
  cumulN: ResultatCumul;
  cumulN1: ResultatCumul;
  /** Comptes propres de la consolidante, N avec mouvements et N-1 · pour ses flux avec ses actionnaires. */
  consolidanteN: LigneBalancePourEtat[];
  consolidanteN1: LigneBalancePourEtat[];
  /** Vide si le périmètre et les pourcentages sont les mêmes qu'en N-1 · sinon ce qui a changé. */
  variationsPerimetre: string[];
}

/** La table individuelle du tableau des flux, fournie par le service des états SYSCOHADA. */
export type ResolveurFlux = (lignesN: LigneBalancePourEtat[], lignesN1: LigneBalancePourEtat[]) => Map<string, number>;

export interface TableauFluxConsolide {
  lignes: LigneEtatConsolide[] | null;
  obstacles: string[];
  controle: { tresorerieParLesFlux: number; tresorerieParLeBilan: number; ecart: number; ok: boolean } | null;
}

const solde = (lignes: { numero: string; solde: number }[], prefixe: string) =>
  somme(lignes.filter((l) => l.numero.startsWith(prefixe)).map((l) => l.solde));
const soldeCumul = (cumul: ResultatCumul, cle: string) => cumul.lignes.find((l) => l.cle === cle)?.solde ?? 0;
const minoritairesTotal = (cumul: ResultatCumul) =>
  r2(cumul.capitauxPropres.interetsMinoritairesHorsResultat + cumul.capitauxPropres.resultatMinoritaires);

export function construireTableauFluxConsolide(e: EntreesFluxConsolides, flux: ResolveurFlux): TableauFluxConsolide {
  const obstacles = [...e.cumulN.obstaclesFlux, ...e.variationsPerimetre];
  if (obstacles.length > 0) return { lignes: null, obstacles, controle: null };

  const conso = flux(lignesAvecMouvements(e.cumulN), lignesAvecMouvements(e.cumulN1));
  const mere = flux(e.consolidanteN, e.consolidanteN1);
  const f = (ref: string) => r2(conso.get(ref) ?? 0);
  const fm = (ref: string) => r2(mere.get(ref) ?? 0);

  const L = (cle: string, libelle: string, nature: LigneEtatConsolide['nature'], net: number | null, extra: Partial<LigneEtatConsolide> = {}): LigneEtatConsolide => ({
    cle,
    libelle,
    nature,
    net: net == null ? null : r2(net),
    ...extra,
  });

  // ─── A · trésorerie d'ouverture ──────────────────────────────────────────
  const a = L('TRESORERIE_OUVERTURE', 'Trésorerie nette au 1er janvier (A)', 'TOTAL', f('ZA'), {
    lecture: 'Trésorerie-actif moins trésorerie-passif du bilan consolidé N-1.',
  });

  // ─── B · activités opérationnelles ───────────────────────────────────────
  // Les écarts d'évaluation rapportés au résultat par des STOCKS vendus sont de
  // la même famille · la baisse du stock consolidé serait lue comme un
  // encaissement par la variation du besoin de financement.
  const elimination = -soldeCumul(e.cumulN, 'ELIMINATION_RESULTATS_INTERNES') - e.cumulN.ecartsEvaluationStocksResultat;
  const cafg = L('CAFG', 'Capacité d’autofinancement globale (CAFG)', 'POSTE', f('FA') + elimination, {
    lecture:
      'Formule du ch. 5 § 1.2.1.1 (FA) sur les comptes consolidés' +
      (Math.abs(elimination) > EPS ? ', diminuée des résultats internes éliminés (art. 86, 4°) et des écarts d’évaluation des stocks sortis, que la variation des stocks et des acquisitions lirait sinon comme un encaissement.' : '.'),
  });
  const bf = L('VARIATION_BF', 'Variation du besoin de financement lié aux activités opérationnelles', 'POSTE', somme(['FB', 'FC', 'FD', 'FE'].map(f)), {
    lecture: 'Actif circulant HAO, stocks, créances et passif circulant (FB à FE).',
  });
  const divMe = L('DIVIDENDES_RECUS_ME', 'Dividendes reçus des entités mises en équivalence', 'POSTE', e.cumulN.dividendesRecusMe, {
    lecture: 'Encaissés par la détentrice et éliminés de son résultat · leur contrepartie est la baisse des titres mis en équivalence.',
  });
  const b = L('FLUX_OPERATIONNELS', 'Flux de trésorerie provenant des activités opérationnelles (B)', 'TOTAL', somme([cafg.net, bf.net, divMe.net]));

  // ─── C · activités d'investissement ──────────────────────────────────────
  const c1 = L('DECAISSEMENTS_INCORPORELLES', 'Décaissements liés aux acquisitions d’immobilisations incorporelles', 'POSTE', f('FF'));
  const c2 = L('DECAISSEMENTS_CORPORELLES', 'Décaissements liés aux acquisitions d’immobilisations corporelles', 'POSTE', f('FG'));
  const c3 = L('DECAISSEMENTS_FINANCIERES', 'Décaissements liés aux acquisitions d’immobilisations financières', 'POSTE', f('FH'));
  const c4 = L('ENCAISSEMENTS_CESSIONS', 'Encaissements liés aux cessions d’immobilisations incorporelles et corporelles', 'POSTE', f('FI'));
  const c5 = L('ENCAISSEMENTS_FINANCIERES', 'Encaissements liés aux cessions et remboursements d’immobilisations financières', 'POSTE', f('FJ'));
  const perimetre = L('INCIDENCE_PERIMETRE', 'Incidence des variations de périmètre', 'POSTE', 0, {
    lecture: 'Nulle · même périmètre et mêmes pourcentages qu’en N-1, condition de production du tableau.',
  });
  const c = L('FLUX_INVESTISSEMENT', 'Flux de trésorerie provenant des activités d’investissement (C)', 'TOTAL', somme([c1, c2, c3, c4, c5, perimetre].map((l) => l.net)));

  // ─── D · activités de financement ────────────────────────────────────────
  const capital = L('AUGMENTATIONS_CAPITAL', 'Augmentations de capital (consolidante)', 'POSTE', fm('FK'), {
    lecture: 'Apports nouveaux lus sur les comptes de la consolidante (FK) · un capital de filiale qui bouge arrête le tableau.',
  });
  const subventions = L('SUBVENTIONS_INVESTISSEMENT', 'Subventions d’investissement reçues', 'POSTE', f('FL'), {
    lecture: 'Poste du modèle individuel (FL) que le modèle consolidé ne nomme pas · montré plutôt que fondu.',
  });
  const prelevements = L('PRELEVEMENTS_CAPITAL', 'Prélèvements et remboursements de capital (consolidante)', 'POSTE', fm('FM'));
  const dividendesMere = L('DIVIDENDES_CONSOLIDANTE', 'Dividendes versés par la consolidante', 'POSTE', fm('FN'), {
    lecture: 'Débit du 465 de la consolidante (FN).',
  });
  // Minoritaires · ce qui leur a été ATTRIBUÉ se lit par la variation de
  // leurs intérêts, résultat de l'exercice déduit ; ce qui reste dû à la
  // clôture est au 465 des filiales, que la variation du passif circulant
  // (FE) laisse de côté comme au modèle individuel.
  const attribueMinoritaires = r2(minoritairesTotal(e.cumulN1) + e.cumulN.capitauxPropres.resultatMinoritaires - minoritairesTotal(e.cumulN));
  const dus465Filiales = (cumul: ResultatCumul, mere: LigneBalancePourEtat[]) =>
    r2(-somme(cumul.lignes.filter((l) => l.cle.startsWith('465')).map((l) => l.solde)) + solde(mere, '465'));
  const hausseDus = r2(dus465Filiales(e.cumulN, e.consolidanteN) - dus465Filiales(e.cumulN1, e.consolidanteN1));
  const dividendesMinoritaires = L('DIVIDENDES_MINORITAIRES', 'Dividendes versés aux minoritaires', 'POSTE', -(attribueMinoritaires - hausseDus), {
    lecture:
      'Attribués aux minoritaires (leurs intérêts N-1, plus leur part du résultat N, moins leurs intérêts N), moins ce qui reste dû au 465 des filiales.',
  });
  const emprunts = L('EMPRUNTS', 'Emprunts', 'POSTE', f('FO'));
  const autresDettes = L('AUTRES_DETTES_FINANCIERES', 'Autres dettes financières', 'POSTE', f('FP'));
  const remboursements = L('REMBOURSEMENTS', 'Remboursements des emprunts et autres dettes financières', 'POSTE', f('FQ'));
  const lignesD = [capital, subventions, prelevements, dividendesMere, dividendesMinoritaires, emprunts, autresDettes, remboursements];
  const d = L('FLUX_FINANCEMENT', 'Flux de trésorerie provenant des activités de financement (D)', 'TOTAL', somme(lignesD.map((l) => l.net)));

  // ─── E à H ────────────────────────────────────────────────────────────────
  const eVar = L('VARIATION_PERIODE', 'Variation de la trésorerie nette de la période (E = B + C + D)', 'TOTAL', somme([b.net, c.net, d.net]));
  const fClot = L('TRESORERIE_CLOTURE', 'Trésorerie nette au 31 décembre (F = A + E)', 'TOTAL', somme([a.net, eVar.net]));
  // Le tableau n'est établi que sans entité convertie et sans monnaie
  // manquante · l'une et l'autre sont des obstacles du cumul. G est alors nul.
  const g = L('INCIDENCE_DEVISES', 'Incidence des variations de cours des devises (G)', 'POSTE', 0, {
    lecture: 'Aucune entité du périmètre n’est convertie · une entité convertie refuse le tableau, son incidence n’étant pas séparée par cette version.',
  });
  const h = L('VARIATION_HORS_DEVISES', 'Variation de la trésorerie nette (H = E − G)', 'TOTAL', r2((eVar.net ?? 0) - (g.net ?? 0)));

  // Trésorerie de clôture par le bilan · la même lecture que A, un exercice
  // plus tard, pour que le contrôle compare deux fois la même définition.
  const tresorerieParLeBilan = tresoreriePublieeN(e.cumulN, flux);
  const ecart = r2((fClot.net ?? 0) - tresorerieParLeBilan);
  const controle = { tresorerieParLesFlux: fClot.net ?? 0, tresorerieParLeBilan, ecart, ok: Math.abs(ecart) <= EPS };

  const lignes = [
    a,
    cafg,
    bf,
    ...(Math.abs(divMe.net ?? 0) > EPS ? [divMe] : []),
    b,
    c1,
    c2,
    c3,
    c4,
    c5,
    perimetre,
    c,
    ...lignesD.filter((l) => l === capital || l === dividendesMere || l === emprunts || l === remboursements || Math.abs(l.net ?? 0) > EPS),
    d,
    eVar,
    fClot,
    g,
    h,
  ];
  return { lignes, obstacles: [], controle };
}

/**
 * Trésorerie nette de clôture PAR LE BILAN · la même lecture que A, un
 * exercice plus tard (ZA du tableau dont N est l'ANTÉRIEUR). C'est ce qui
 * garantit que le contrôle compare deux fois la même définition.
 */
function tresoreriePublieeN(cumulN: ResultatCumul, flux: ResolveurFlux): number {
  return r2(flux([], lignesAvecMouvements(cumulN)).get('ZA') ?? 0);
}

// ─── Variation des capitaux propres ────────────────────────────────────────

export type ColonneCp = 'capital' | 'primes' | 'reserves' | 'resultat' | 'conversion' | 'reevaluation' | 'groupe' | 'minoritaires' | 'total';

export interface LigneVariationCp {
  cle: string;
  libelle: string;
  montants: Record<ColonneCp, number | null>;
  lecture?: string;
}

export interface VariationCapitauxPropres {
  lignes: LigneVariationCp[];
  reserves: string[];
}

/**
 * D4C ch. XII-8 § 5 · colonnes Capital, Primes, Réserves consolidées,
 * Résultat, Écarts de conversion, Écarts de réévaluation, Part du groupe, Part
 * des minoritaires, Total. Le bloc de l'exercice N seulement · le bloc N-1 du
 * modèle part des capitaux propres de clôture N-2, que cette version ne
 * consolide pas.
 */
export function construireVariationCapitauxPropres(
  cumulN: ResultatCumul,
  cumulN1: ResultatCumul,
  consolidanteN: LigneBalancePourEtat[],
): VariationCapitauxPropres {
  const ligne = (
    cle: string,
    libelle: string,
    m: Partial<Record<Exclude<ColonneCp, 'groupe' | 'total'>, number>>,
    lecture?: string,
  ): LigneVariationCp => {
    const v = (k: keyof typeof m) => r2(m[k] ?? 0);
    const groupe = somme([v('capital'), v('primes'), v('reserves'), v('resultat'), v('conversion'), v('reevaluation')]);
    return {
      cle,
      libelle,
      montants: {
        capital: v('capital'),
        primes: v('primes'),
        reserves: v('reserves'),
        resultat: v('resultat'),
        conversion: v('conversion'),
        reevaluation: v('reevaluation'),
        groupe,
        minoritaires: v('minoritaires'),
        total: r2(groupe + v('minoritaires')),
      },
      ...(lecture ? { lecture } : {}),
    };
  };
  const n1 = cumulN1.capitauxPropres;
  const n = cumulN.capitauxPropres;
  // Dividendes mis en paiement par la consolidante · crédit du 465 (Titre VII,
  // COMPTE 46 : « crédité des dividendes mis en paiement »).
  const distribues = somme(consolidanteN.filter((l) => l.numero.startsWith('465')).map((l) => l.mouvementCredit));
  const autresReserves = r2(n.reservesGroupe - n1.reservesGroupe - n1.resultatGroupe + distribues);

  const lignes = [
    ligne('CLOTURE_N1', 'Capitaux propres à la clôture N-1', {
      capital: n1.capital,
      primes: n1.primes,
      reserves: n1.reservesGroupe,
      resultat: n1.resultatGroupe,
      conversion: n1.ecartsConversion,
      reevaluation: n1.ecartsReevaluation,
      minoritaires: minoritairesTotal(cumulN1),
    }),
    ligne('AFFECTATION_N1', 'Affectation du résultat N-1', { reserves: n1.resultatGroupe, resultat: -n1.resultatGroupe }),
    ligne('DISTRIBUTIONS_CONSOLIDANTE', 'Distributions de la consolidante', { reserves: -distribues }, 'Crédit du 465 de la consolidante, dividendes mis en paiement.'),
    ligne('VARIATION_CAPITAL', 'Variation du capital et des primes', { capital: r2(n.capital - n1.capital), primes: r2(n.primes - n1.primes) }),
    ligne('VARIATION_CONVERSION', 'Variation des écarts de conversion', { conversion: r2(n.ecartsConversion - n1.ecartsConversion) }),
    ligne('VARIATION_REEVALUATION', 'Variation des écarts de réévaluation', { reevaluation: r2(n.ecartsReevaluation - n1.ecartsReevaluation) }),
    ligne('RESULTAT_N', 'Résultat de l’exercice', { resultat: n.resultatGroupe, minoritaires: n.resultatMinoritaires }),
    ligne(
      'AUTRES_RESERVES',
      'Autres variations des réserves consolidées',
      { reserves: autresReserves },
      'Ce que ni l’affectation ni les distributions n’expliquent · une incorporation de réserves au capital, par exemple. Une ligne non nulle est à justifier en Notes annexes.',
    ),
    ligne(
      'MINORITAIRES_DISTRIBUTIONS',
      'Distributions et autres variations des intérêts minoritaires',
      { minoritaires: r2(minoritairesTotal(cumulN) - minoritairesTotal(cumulN1) - n.resultatMinoritaires) },
    ),
    ligne('CLOTURE_N', 'Capitaux propres à la clôture N', {
      capital: n.capital,
      primes: n.primes,
      reserves: n.reservesGroupe,
      resultat: n.resultatGroupe,
      conversion: n.ecartsConversion,
      reevaluation: n.ecartsReevaluation,
      minoritaires: minoritairesTotal(cumulN),
    }),
  ];
  return {
    lignes,
    reserves: [
      'Bloc de l’exercice N-1 du modèle (clôture N-2 corrigée, mouvements N-1) · il suppose de consolider N-2, ce que cette version ne fait pas.',
    ],
  };
}

// ─── Variation du périmètre ───────────────────────────────────────────────

interface EntiteComparee {
  nom: string;
  estConsolidante: boolean;
  methode: string;
  pctInteret: number;
}

const RETENUES = new Set(['IG', 'IP', 'ME']);

/**
 * Ce qui a bougé entre les deux périmètres, parmi les entités RETENUES. Une
 * entrée, une sortie, un changement de méthode ou de pourcentage d'intérêt
 * fait naître une « incidence des variations de périmètre » que le D4C
 * (ch. XII-8 § 4) veut sur sa propre ligne, et que cette version ne calcule
 * pas · la lire comme zéro verserait le prix d'acquisition et la trésorerie de
 * l'entrée dans les flux ordinaires, sur un tableau qui boucle quand même.
 * L'appariement se fait par la DÉNOMINATION, comme la note du périmètre,
 * parce que le périmètre est recréé à chaque exercice.
 */
export function variationsDuPerimetre(n: EntiteComparee[], n1: EntiteComparee[]): string[] {
  const retenues = (xs: EntiteComparee[]) =>
    new Map(xs.filter((e) => e.estConsolidante || RETENUES.has(e.methode)).map((e) => [e.nom.trim().toLowerCase(), e]));
  const a = retenues(n);
  const b = retenues(n1);
  const motifs: string[] = [];
  for (const [cle, e] of a) {
    const p = b.get(cle);
    if (!p) motifs.push(`${e.nom} entre dans le périmètre en N (${e.methode}).`);
    else if (p.methode !== e.methode) motifs.push(`${e.nom} change de méthode (${p.methode} en N-1, ${e.methode} en N).`);
    else if (Math.abs(p.pctInteret - e.pctInteret) > EPS)
      motifs.push(`${e.nom} change de pourcentage d’intérêt (${p.pctInteret} % en N-1, ${e.pctInteret} % en N).`);
  }
  for (const [cle, p] of b) if (!a.has(cle)) motifs.push(`${p.nom} sort du périmètre en N.`);
  return motifs.map(
    (m) => `${m} L’incidence des variations de périmètre (D4C ch. XII-8 § 4) n’est pas calculée par cette version · le tableau n’est pas établi.`,
  );
}
