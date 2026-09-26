import { LIBELLE_POSTE, PosteConsolidation, POSTES_DE_RESULTAT, ResultatCumul } from '../consolidation/cumul-consolidation';
import { NatureChangementPerimetre } from '../consolidation/flux-capitaux-consolides';
import { ActivitePrincipale, construireEtatsIfrs, EtatsIfrs, RefusIfrs, RegleCorrespondance, RetraitementDeclare } from './etats-ifrs';
import { RUBRIQUE_NCI, RUBRIQUE_PAR_CODE } from './rubriques-ifrs';

/**
 * ÉTATS IFRS CONSOLIDÉS, tranche C1 · état de la situation financière, compte
 * de résultat et état du résultat global, avec la répartition entre les
 * propriétaires de la société mère et les participations ne donnant pas le
 * contrôle. Moteur PUR.
 *
 * SOURCES, lues le 2026-09-25 · IFRS 18 § 76, § 87, § 104 et § 107 a (texte
 * français officiel du règlement (UE) 2026/338) ; IFRS 10 § 19, § 22, § B86 à
 * B96 ; IFRS 3 § 19, § 32, § 34, § B63 a ; IAS 36 § 90 ; IAS 21 § 39 c et § 41
 * (skill `ifrs`, traduction française officielle).
 *
 * LA MÊME ARCHITECTURE QUE LES COMPTES INDIVIDUELS, un étage plus haut · la
 * balance CONSOLIDÉE du D4C (`cumulerConsolidation`) est projetée sur les
 * rubriques d'IFRS 18, puis corrigée des retraitements CONSOLIDÉS déclarés. Le
 * cumul, les éliminations et le partage ne sont pas réécrits · un second moteur
 * de consolidation divergerait du premier au premier correctif.
 *
 * LES COMPTES se rangent par les règles de correspondance du dossier, les
 * mêmes qu'en comptes individuels · uniformité des méthodes, IFRS 10 § 19. LES
 * POSTES de la consolidation, qui ne sont pas des comptes, se rangent par une
 * table à deux étages. Ceux dont IFRS 18 nomme la ligne sont rangés ICI, avec
 * leur paragraphe · il n'y a pas de choix. Ceux qui dépendent de l'opération se
 * DÉCLARENT · une marge interne éliminée corrige la ligne où la marge avait été
 * portée, et seul le cabinet sait laquelle.
 *
 * TROIS ÉCARTS ENTRE LE D4C ET LES IFRS, nommés et jamais corrigés en silence ·
 * (1) l'écart d'acquisition est AMORTI (AUDCIF art. 82) quand IFRS 3 § B63 a le
 * garde au coût diminué des pertes de valeur, testé chaque année (IAS 36 § 90) ;
 * (2) l'écart d'acquisition NÉGATIF est étalé quand IFRS 3 § 34 le porte en
 * résultat à la date d'acquisition ; (3) les écarts de conversion vont
 * directement en capitaux propres quand IAS 21 § 39 c les fait passer par les
 * autres éléments du résultat global, la part des minoritaires leur étant
 * affectée (§ 41). Les deux premiers se retraitent, et le jeu reste non
 * publiable tant qu'aucun retraitement ne touche le poste.
 *
 * LE TROISIÈME SE RECLASSE, IL NE SE RETRAITE PAS (tranche IAS 21,
 * 2026-09-26) · le montant est au cumul, juste, et seule sa ligne change. La
 * variation de l'exercice est la différence de DEUX cumuls, N et N-1, que le
 * moteur reçoit tous deux · jamais une variation déduite d'un seul solde, qui
 * rendrait tout le cumul historique en OCI de l'année. Elle se sépare en part
 * du groupe, part des minoritaires (§ 41) et part née des mises en
 * équivalence (IFRS 18 § 89 a). Trois cas ne se séparent pas, et le disent ·
 * sans consolidation N-1 ; une entité convertie qui SORT (le cumul est alors
 * reclassé en résultat, § 48, ce que le D4C ne fait pas) ; une entité
 * convertie qui change de méthode ou de pourcentage d'intérêt (la variation
 * mêle un transfert entre groupe et minoritaires, IFRS 10 § B96). Une ENTRÉE
 * ne gêne pas · son écart naît dans l'exercice.
 */

/** Ce dont la variation des écarts de conversion de l'exercice a besoin · le cumul N-1 et ce qui a bougé du périmètre. */
export interface ComparaisonConversion {
  cumulPrecedent: ResultatCumul | null;
  changements: { nom: string; nature: NatureChangementPerimetre }[];
}

export const aDesEcartsDeConversion = (c: ResultatCumul) =>
  c.conversions.length > 0 ||
  Math.abs(c.capitauxPropres.ecartsConversion) > EPS ||
  Math.abs(c.capitauxPropres.ecartsConversionMinoritaires ?? 0) > EPS ||
  Math.abs(c.lignes.find((l) => l.cle === 'ECARTS_CONVERSION')?.solde ?? 0) > EPS;

/**
 * La variation des écarts de conversion de l'exercice, ou le motif qui
 * l'empêche · `null` des deux côtés quand le groupe n'a aucune entité
 * convertie.
 */
export function variationConversionExercice(
  cumul: ResultatCumul,
  comparaison: ComparaisonConversion | null | undefined,
): { variation: { groupe: number; minoritaires: number; me: number } | null; motif: string | null } {
  const precedent = comparaison?.cumulPrecedent ?? null;
  if (!aDesEcartsDeConversion(cumul) && !(precedent && aDesEcartsDeConversion(precedent))) return { variation: null, motif: null };
  const prefixe = 'Écarts de conversion · IAS 21 § 39 c les veut dans les autres éléments du résultat global de l’exercice, et § 41 en affecte la part aux participations ne donnant pas le contrôle.';
  if (!precedent) {
    return { variation: null, motif: `${prefixe} Sans consolidation de l’exercice précédent, la variation de l’exercice ne se sépare pas du cumul · ils restent en capitaux propres.` };
  }
  const converties = new Set([...cumul.conversions, ...precedent.conversions].map((c) => c.entite.trim().toLowerCase()));
  const genants = (comparaison?.changements ?? []).filter((c) => c.nature !== 'ENTREE' && converties.has(c.nom.trim().toLowerCase()));
  const sorties = genants.filter((c) => c.nature === 'SORTIE').map((c) => c.nom);
  const autres = genants.filter((c) => c.nature !== 'SORTIE').map((c) => c.nom);
  const motifs: string[] = [];
  if (sorties.length) motifs.push(`${sorties.join(', ')} sort du périmètre · le cumul de ses écarts se reclasse en résultat (IAS 21 § 48), ce que cette version ne sert pas.`);
  if (autres.length) motifs.push(`${autres.join(', ')} change de méthode ou de pourcentage d’intérêt · la variation mêle un transfert entre groupe et minoritaires (IFRS 10 § B96), que cette version ne sépare pas.`);
  if (motifs.length) return { variation: null, motif: `${prefixe} ${motifs.join(' ')}` };
  const a = cumul.capitauxPropres;
  const b = precedent.capitauxPropres;
  const d = (x: number | undefined, y: number | undefined) => Math.round(((x ?? 0) - (y ?? 0)) * 100) / 100;
  return {
    variation: { groupe: d(a.ecartsConversion, b.ecartsConversion), minoritaires: d(a.ecartsConversionMinoritaires, b.ecartsConversionMinoritaires), me: d(a.ecartsConversionMe, b.ecartsConversionMe) },
    motif: null,
  };
}

/** Les postes dont IFRS 18 nomme la ligne · rangés par OmegaX, avec le paragraphe qui les place. */
export const POSTES_RANGES: Partial<Record<PosteConsolidation, { rubrique: string; fondement: string }>> = {
  ECART_ACQUISITION: { rubrique: 'SF_GOODWILL', fondement: 'IFRS 18 § 103 d, IFRS 3 § 32' },
  AMORTISSEMENT_ECART_ACQUISITION: { rubrique: 'SF_GOODWILL', fondement: 'IFRS 18 § 103 d · à retraiter, IFRS 3 § B63 a' },
  DEPRECIATION_ECART_ACQUISITION: { rubrique: 'SF_GOODWILL', fondement: 'IFRS 18 § 103 d, IAS 36 § 90' },
  TITRES_MIS_EN_EQUIVALENCE: { rubrique: 'SF_PARTICIPATIONS_MEE', fondement: 'IFRS 18 § 103 g' },
  QUOTE_PART_RESULTAT_ME: { rubrique: 'PL_QUOTE_PART_MEE', fondement: 'IFRS 18 § 75 a iii' },
  IMPOTS_DIFFERES_ACTIF: { rubrique: 'SF_IMPOTS_DIFFERES_ACTIF', fondement: 'IFRS 18 § 103 r' },
  IMPOTS_DIFFERES_PASSIF: { rubrique: 'SF_IMPOTS_DIFFERES_PASSIF', fondement: 'IFRS 18 § 103 r' },
  IMPOTS_DIFFERES_RESULTAT: { rubrique: 'PL_IMPOT_RESULTAT', fondement: 'IFRS 18 § 67, § 75 a iv' },
  CAPITAL: { rubrique: 'SF_CAPITAL', fondement: 'IFRS 18 § 104 b' },
  RESERVES_GROUPE: { rubrique: 'SF_RESERVES', fondement: 'IFRS 18 § 104 b' },
  ECARTS_CONVERSION: { rubrique: 'SF_AUTRES_COMPOSANTES_CP', fondement: 'IAS 21 § 41 · composante distincte des capitaux propres' },
  INTERETS_MINORITAIRES: { rubrique: RUBRIQUE_NCI, fondement: 'IFRS 18 § 104 a, IFRS 10 § 22' },
};

/**
 * Les postes qui se DÉCLARENT · leur ligne dépend de l'opération. Le
 * `RESULTAT_DEJA_CONSTATE` n'y est pas · le D4C le range parmi ce qui est à
 * retraiter avant publication, il n'a de place dans aucun état.
 */
export const POSTES_A_DECLARER: PosteConsolidation[] = [
  'PRIMES_CONSOLIDANTE',
  'ECARTS_REEVALUATION_CONSOLIDANTE',
  'DOTATION_ECART_ACQUISITION',
  'ECART_ACQUISITION_NEGATIF',
  'REPRISE_ECART_ACQUISITION_NEGATIF',
  'PROVISION_ME_NEGATIVE',
  'ELIMINATION_RESULTATS_INTERNES',
  'ECARTS_EVALUATION_RESULTAT',
  'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT',
];

export interface RegleConsolidation {
  poste: string;
  rubrique: string;
}

/** Pourquoi une règle de poste est irrecevable, ou `null`. La porte et le calcul appellent la même règle. */
export function motifRefusRegleConsolidation(poste: string, rubrique: string): string | null {
  if (!POSTES_A_DECLARER.includes(poste as PosteConsolidation)) {
    if (poste in POSTES_RANGES) return `Le poste « ${LIBELLE_POSTE[poste as PosteConsolidation]} » est rangé par IFRS 18 elle-même (${POSTES_RANGES[poste as PosteConsolidation]!.fondement}).`;
    return `« ${poste} » n’est pas un poste de consolidation qui se déclare.`;
  }
  const r = RUBRIQUE_PAR_CODE.get(rubrique);
  if (!r) return `La rubrique « ${rubrique} » n’existe pas au catalogue IFRS 18 d’OmegaX.`;
  if (r.code === RUBRIQUE_NCI) return 'Les participations ne donnant pas le contrôle ne reçoivent que le partage de la consolidation (IFRS 10 § 22).';
  if (r.etat === 'RESULTAT_GLOBAL') return `« ${r.libelle} » est un autre élément du résultat global · il se déclare en retraitement, jamais par une règle.`;
  const resultat = POSTES_DE_RESULTAT.has(poste as PosteConsolidation);
  if (resultat && r.etat !== 'RESULTAT') return `Le poste « ${LIBELLE_POSTE[poste as PosteConsolidation]} » est du résultat · il va au compte de résultat.`;
  if (!resultat && r.etat !== 'SITUATION') return `Le poste « ${LIBELLE_POSTE[poste as PosteConsolidation]} » est du bilan · il va à l’état de la situation financière.`;
  return null;
}

export interface EtatsIfrsConsolides extends EtatsIfrs {
  /** Les postes de la consolidation et la rubrique qui les reçoit, pour l'écran. */
  postes: { poste: string; libelle: string; solde: number; rubrique: string | null; fondement: string | null; declare: boolean }[];
}

const EPS = 0.005;

export function construireEtatsIfrsConsolides(
  exercice: { dateDebut: Date },
  cumul: ResultatCumul,
  regles: RegleCorrespondance[],
  reglesConsolidation: RegleConsolidation[],
  retraitements: RetraitementDeclare[],
  activitePrincipale: ActivitePrincipale | null,
  comparaison?: ComparaisonConversion | null,
): EtatsIfrsConsolides {
  const declarees = new Map<string, string>();
  for (const r of reglesConsolidation) {
    const m = motifRefusRegleConsolidation(r.poste, r.rubrique);
    if (m) throw new RefusIfrs(m);
    declarees.set(r.poste, r.rubrique);
  }
  const rubriqueDuPoste = (cle: string) => POSTES_RANGES[cle as PosteConsolidation]?.rubrique ?? declarees.get(cle) ?? null;
  const conversion = variationConversionExercice(cumul, comparaison);
  const etat = construireEtatsIfrs(
    exercice,
    cumul.lignes.map((l) => ({ numero: l.cle, intitule: l.intitule, solde: l.solde })),
    regles,
    retraitements,
    activitePrincipale,
    {
      rubriqueDuPoste,
      estPosteDeResultat: (cle) => POSTES_DE_RESULTAT.has(cle as PosteConsolidation),
      resultatMinoritaires: cumul.capitauxPropres.resultatMinoritaires,
      resultatEnsemble: cumul.capitauxPropres.resultatEnsemble,
      ...(conversion.variation ? { conversionExercice: conversion.variation } : {}),
    },
  );

  // Ce qui rend la consolidation D4C incomplète la rend incomplète ici · la
  // projection IFRS part de la même balance, elle n'en comble aucun manque.
  etat.motifsNonPubliable.push(
    ...(cumul.conversionsIncompletes ?? []).map((m) => `Consolidation · conversion · ${m}`),
    ...(cumul.impotsDifferesIncomplets ?? []).map((m) => `Consolidation · impôts différés incomplets · ${m}`),
  );

  const solde = (poste: PosteConsolidation) => cumul.lignes.find((l) => l.cle === poste)?.solde ?? 0;
  const touche = (rubrique: string | null) => !!rubrique && retraitements.some((r) => r.lignes.some((l) => l.rubrique === rubrique));

  // (1) IFRS 3 § B63 a · un écart d'acquisition amorti au D4C ne l'est pas en
  // IFRS. Tant qu'aucun retraitement ne touche le goodwill, l'amortissement
  // cumulé et la dotation de l'exercice sont dans l'état IFRS.
  if ((Math.abs(solde('AMORTISSEMENT_ECART_ACQUISITION')) > EPS || Math.abs(solde('DOTATION_ECART_ACQUISITION')) > EPS) && !touche('SF_GOODWILL')) {
    etat.motifsNonPubliable.push(
      'Écart d’acquisition amorti selon l’AUDCIF art. 82 · IFRS 3 § B63 a l’évalue au montant de la date d’acquisition diminué des pertes de valeur, testé chaque année (IAS 36 § 90). Déclarez le retraitement qui annule l’amortissement, et la perte de valeur s’il y en a une.',
    );
  }
  // (2) IFRS 3 § 34 · le profit d'une acquisition à des conditions
  // avantageuses va en résultat à la date d'acquisition, il ne s'étale pas.
  if (Math.abs(solde('ECART_ACQUISITION_NEGATIF')) > EPS && !touche(rubriqueDuPoste('ECART_ACQUISITION_NEGATIF'))) {
    etat.motifsNonPubliable.push(
      'Écart d’acquisition négatif étalé selon le D4C · IFRS 3 § 34 comptabilise le profit en résultat net à la date d’acquisition. Déclarez le retraitement qui solde le poste.',
    );
  }
  // (3) IAS 21 § 39 c et § 41 · la variation de l'exercice est reclassée en
  // OCI par le moteur ; ce qui ne se sépare pas est nommé.
  if (conversion.motif) etat.motifsNonPubliable.push(conversion.motif);
  if (conversion.variation) {
    etat.mentions.push(
      'Écarts de conversion · la variation de l’exercice est présentée dans les autres éléments du résultat global (IAS 21 § 39 c), la part des participations ne donnant pas le contrôle leur est attribuée (§ 41) et le cumul reste une composante distincte des capitaux propres jusqu’à la sortie de l’entité (§ 48).',
    );
  }
  for (const p of POSTES_A_DECLARER) {
    if (Math.abs(solde(p)) > EPS && !declarees.has(p)) {
      etat.motifsNonPubliable.push(`Poste de consolidation « ${LIBELLE_POSTE[p]} » sans rubrique IFRS · déclarez la ligne où il se range.`);
    }
  }

  const postes = cumul.lignes
    .filter((l) => l.poste)
    .map((l) => {
      const range = POSTES_RANGES[l.cle as PosteConsolidation];
      return {
        poste: l.cle,
        libelle: l.intitule,
        solde: l.solde,
        rubrique: rubriqueDuPoste(l.cle),
        fondement: range?.fondement ?? null,
        declare: POSTES_A_DECLARER.includes(l.cle as PosteConsolidation),
      };
    });
  return { ...etat, postes };
}
