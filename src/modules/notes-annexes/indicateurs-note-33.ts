/**
 * NOTE 33 · FICHE DE SYNTHESE DES PRINCIPAUX INDICATEURS FINANCIERS
 * (SYCEBNL, Partie 4, ch. 2, section 4 · jeu associations et ordres
 * professionnels).
 *
 * Cette note ne lit AUCUN compte : elle est une synthèse des trois autres
 * états. Chaque indicateur est donc une combinaison de codes REF déjà
 * transcrits et déjà testés · `correspondance-bilan.ts`,
 * `correspondance-compte-resultat.ts`, `correspondance-tft.ts`. Refaire ici
 * une lecture du plan de comptes créerait une deuxième vérité, qui finirait
 * par diverger de l'état qu'elle est censée résumer.
 *
 * ## Ce que le texte laisse ouvert, et comment c'est tranché
 *
 * **« + Fonds propres et assimilés » vaut CZ, pas CK.** Le libellé de la note
 * reprend mot pour mot celui du poste CK « TOTAL FONDS PROPRES ET
 * ASSIMILES », mais l'arithmétique que la note POSE elle-même l'interdit :
 * elle veut Fonds propres + Dettes financières = RESSOURCES STABLES, et le
 * bilan pose DE (ressources stables) = CZ + DD, où CZ = CK + CY (fonds
 * affectés et reportés). Prendre CK laisserait les fonds affectés hors des
 * ressources stables, et la ligne CONTRÔLE de la note tomberait en faux chez
 * toute association qui en porte · c'est-à-dire chez presque toutes. La
 * lecture retenue est celle qui fait boucler le contrôle que le texte
 * prescrit lui-même.
 *
 * **Les écarts de conversion ne sont pas ventilés.** Le renvoi (c) demande de
 * les éliminer « afin de ramener les créances et les dettes concernées à leur
 * valeur initiale ». Le bilan les présente en deux postes autonomes (BY à
 * l'actif, DY au passif) et ne dit PAS à quelles créances ni à quelles dettes
 * ils se rapportent : les répartir demanderait une information que l'état ne
 * porte pas. Ils sont donc laissés hors des agrégats, et l'écart qu'ils créent
 * apparaît sur la ligne CONTRÔLE (elle vaut exactement BY - DY), au lieu
 * d'être réparti au jugé. C'est ce que la ligne CONTRÔLE est faite pour
 * montrer.
 *
 * **Le ratio d'utilisation des dons reste en SAISIE.** « Sommes versées
 * directement aux bénéficiaires / Sommes collectées brutes » ne correspond à
 * aucun poste ni à aucun compte du plan : le 652 « Subventions accordées par
 * l'entité » et le 654 « Dons en nature courants reçus à distribuer » en
 * relèvent sans doute, mais le texte ne le dit nulle part, et une aide versée
 * peut aussi passer par d'autres comptes. Le calculer reviendrait à publier un
 * ratio d'efficacité que personne n'a défini. Il reste saisi par le cabinet,
 * qui sait ce qu'il a versé.
 */
import { LigneBalancePourEtat, correspond } from '../etats-financiers/etats-financiers.communs';

/** Un poste d'état tel que les trois services les rendent. */
export interface PostePourIndicateurs {
  ref: string;
  montant: number;
  montantN1?: number;
}

export interface EtatsPourIndicateurs {
  bilan: { actif: PostePourIndicateurs[]; passif: PostePourIndicateurs[] };
  compteDeResultat: {
    produits: PostePourIndicateurs[];
    charges: PostePourIndicateurs[];
    totalCharges: number;
    totalChargesN1?: number;
    resultatActivitesOrdinaires: number;
    resultatActivitesOrdinairesN1?: number;
    resultatHao: number;
    resultatHaoN1?: number;
    resultatNet: number;
    resultatNetN1?: number;
  };
  /**
   * Le tableau de flux intercale des LIGNES DE SECTION sans code REF (« Flux
   * de trésorerie provenant des activités opérationnelles »), d'où un type
   * qui les tolère : les filtrer est le travail du lecteur, pas de l'appelant.
   */
  fluxTresorerie: { lignes: Array<{ ref?: string; montant?: number; montantN1?: number } | { section: string }> };
}

/**
 * Ce que la ligne porte comme unité · une variation ne se calcule pas pareil
 * selon le cas, et c'est le renvoi (b) qui l'impose : « Les variations des
 * ratios doivent être exprimées en nombre de points (par exemple de 2% à 5%
 * = 3 points). »
 */
export type UniteIndicateur = 'MONTANT' | 'POURCENT';

export interface IndicateurCalcule {
  /** Clé de la rubrique dans `NOTES_ASSOCIATIONS`, note 33. */
  cle: string;
  unite: UniteIndicateur;
  valeurN: number | null;
  valeurN1: number | null;
}

/** Somme des cessions d'immobilisations de l'exercice, pour la CAFG. */
export interface CessionsImmobilisations {
  /** Compte 81 · valeurs comptables des cessions (une charge H.A.O.). */
  valeurComptable: number;
  /** Compte 82 · produits des cessions (un produit H.A.O.). */
  produits: number;
}

/**
 * Comptes 81 et 82 d'un exercice · la CAFG les demande nommément, et le
 * compte de résultat les fond dans les postes TN et TM avec le reste des
 * opérations hors activités ordinaires.
 */
export function cessionsDeLExercice(lignes: LigneBalancePourEtat[]): CessionsImmobilisations {
  let valeurComptable = 0;
  let produits = 0;
  for (const l of lignes) {
    // Convention de signe du compte de résultat : une charge se lit
    // débit - crédit, un produit crédit - débit.
    if (correspond(l.numero, ['81'])) valeurComptable += l.totalDebit - l.totalCredit;
    if (correspond(l.numero, ['82'])) produits += l.totalCredit - l.totalDebit;
  }
  return { valeurComptable, produits };
}

/** Rubriques de la note 33 que le logiciel ne calcule pas · voir l'en-tête. */
export const INDICATEURS_LAISSES_EN_SAISIE = ['ratio-d-utilisation-des-dons-sommes-versees-dire'];

/**
 * Les 24 indicateurs calculables de la note 33, dans l'ordre de la maquette.
 *
 * `null` signifie « pas de valeur » et jamais zéro : un ratio dont le
 * dénominateur est nul n'a pas de valeur, et un exercice N-1 absent n'en a
 * pas non plus.
 */
export function indicateursNote33(
  etats: EtatsPourIndicateurs,
  cessionsN: CessionsImmobilisations,
  cessionsN1: CessionsImmobilisations,
  exerciceN1Disponible: boolean,
): IndicateurCalcule[] {
  const postesBilan = new Map([...etats.bilan.actif, ...etats.bilan.passif].map((p) => [p.ref, p]));
  const postesCr = new Map([...etats.compteDeResultat.produits, ...etats.compteDeResultat.charges].map((p) => [p.ref, p]));
  const postesFlux = new Map(
    etats.fluxTresorerie.lignes
      .filter(
        (l): l is { ref: string; montant: number; montantN1?: number } =>
          'ref' in l && l.ref !== undefined && 'montant' in l && l.montant !== undefined,
      )
      .map((l) => [l.ref, l]),
  );

  const bilanN = (ref: string) => postesBilan.get(ref)?.montant ?? 0;
  const bilanN1 = (ref: string) => postesBilan.get(ref)?.montantN1 ?? 0;
  const crN = (ref: string) => postesCr.get(ref)?.montant ?? 0;
  const crN1 = (ref: string) => postesCr.get(ref)?.montantN1 ?? 0;
  const fluxN = (ref: string) => postesFlux.get(ref)?.montant ?? 0;
  const fluxN1 = (ref: string) => postesFlux.get(ref)?.montantN1 ?? 0;

  /**
   * Un exercice, vu par la note. Écrit une fois et appliqué à N puis à N-1 ·
   * deux copies de vingt formules divergeraient à la première correction.
   */
  const pourUnExercice = (
    bl: (ref: string) => number,
    cr: (ref: string) => number,
    fl: (ref: string) => number,
    resultatAo: number,
    resultatHao: number,
    resultatNet: number,
    totalCharges: number,
    cessions: CessionsImmobilisations,
  ) => {
    // ANALYSE DE LA STRUCTURE FINANCIERE · l'ordre et les signes sont ceux de
    // la maquette, y compris ses lignes de sous-total.
    const fondsPropres = bl('CZ');
    const dettesFinancieres = bl('DD');
    const ressourcesStables = fondsPropres + dettesFinancieres;
    const actifImmobilise = bl('AZ');
    const fondsDeRoulement = ressourcesStables - actifImmobilise;
    // Circulant d'EXPLOITATION = circulant total moins sa part H.A.O.
    // (BA à l'actif, DF au passif), que la note isole sur ses propres lignes.
    const actifCirculantExploitation = bl('BT') - bl('BA');
    const passifCirculantExploitation = bl('DV') - bl('DF');
    const bfExploitation = actifCirculantExploitation - passifCirculantExploitation;
    const actifCirculantHao = bl('BA');
    const passifCirculantHao = bl('DF');
    const bfHao = actifCirculantHao - passifCirculantHao;
    const bfGlobal = bfExploitation + bfHao;
    const tresorerieNette = fondsDeRoulement - bfGlobal;
    const controleTresorerie = bl('BX') - bl('DX');

    // Créances au sens du renvoi (**) : « Fournisseurs avances versées +
    // Adhérents + Autres créances » · BC, BD et BE, à l'exclusion des stocks.
    const creances = bl('BC') + bl('BD') + bl('BE');
    const passifCirculant = bl('DV');

    return {
      'resultat-des-activites-ordinaires': resultatAo,
      'resultat-hors-activites-ordinaires': resultatHao,
      'resultat-net': resultatNet,
      // Renvoi (a), appliqué mot pour mot : résultat net + dotations
      // - reprises + valeurs comptables des cessions - produits des cessions.
      'capacite-d-autofinancement-globale-cafg':
        resultatNet + cr('TL') - cr('RH') + cessions.valeurComptable - cessions.produits,
      // Ratio en POURCENTAGE · le renvoi (b) parle de « 2 % à 5 % ».
      'ratio-de-cotisations-acquises-cotisations-charge':
        Math.abs(totalCharges) < 0.005 ? null : (cr('RA') / totalCharges) * 100,
      'fonds-propres-et-assimiles': fondsPropres,
      'dettes-financieres-et-ressources-assimilees': dettesFinancieres,
      'ressources-stables': ressourcesStables,
      'actif-immobilise': actifImmobilise,
      'fonds-de-roulement-1': fondsDeRoulement,
      'actif-circulant-d-exploitation': actifCirculantExploitation,
      'passif-circulant-d-exploitation': passifCirculantExploitation,
      'besoin-de-financement-d-exploitation-2': bfExploitation,
      'actif-circulant-hao': actifCirculantHao,
      'passif-circulant-hao': passifCirculantHao,
      'besoin-de-financement-hao-3': bfHao,
      'besoin-de-financement-global-4-2-3': bfGlobal,
      'tresorerie-nette-5-1-4': tresorerieNette,
      'controle-tresorerie-nette-tresorerie-actif-treso': controleTresorerie,
      'ratio-de-liquidite-generale-creances-tresorerie':
        Math.abs(passifCirculant) < 0.005 ? null : ((creances + bl('BX')) / passifCirculant) * 100,
      'flux-de-tresorerie-des-activites-operationnelles': fl('ZB'),
      'flux-de-tresorerie-des-activites-d-investissemen': fl('ZC'),
      // « Flux de trésorerie provenant des activités de financement (D+E) » ·
      // la maquette du TFT en fait un intitulé de section sans code REF : les
      // deux totaux ZD (fonds propres) et ZE (fonds étrangers) le composent.
      'flux-de-tresorerie-des-activites-de-financement': fl('ZD') + fl('ZE'),
      'variation-de-la-tresorerie-nette-de-la-periode': fl('ZF'),
    } as Record<string, number | null>;
  };

  const n = pourUnExercice(
    bilanN, crN, fluxN,
    etats.compteDeResultat.resultatActivitesOrdinaires,
    etats.compteDeResultat.resultatHao,
    etats.compteDeResultat.resultatNet,
    etats.compteDeResultat.totalCharges,
    cessionsN,
  );
  const n1 = exerciceN1Disponible
    ? pourUnExercice(
        bilanN1, crN1, fluxN1,
        etats.compteDeResultat.resultatActivitesOrdinairesN1 ?? 0,
        etats.compteDeResultat.resultatHaoN1 ?? 0,
        etats.compteDeResultat.resultatNetN1 ?? 0,
        etats.compteDeResultat.totalChargesN1 ?? 0,
        cessionsN1,
      )
    : null;

  const RATIOS = new Set([
    'ratio-de-cotisations-acquises-cotisations-charge',
    'ratio-de-liquidite-generale-creances-tresorerie',
  ]);

  return Object.keys(n).map((cle) => ({
    cle,
    unite: RATIOS.has(cle) ? ('POURCENT' as const) : ('MONTANT' as const),
    valeurN: n[cle],
    valeurN1: n1 ? n1[cle] : null,
  }));
}
