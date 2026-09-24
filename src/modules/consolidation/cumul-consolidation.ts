/**
 * CUMUL ET ÉLIMINATIONS · tranche 2 de la consolidation SYSCOHADA (décision du
 * 2026-09-24). Moteur PUR : il reçoit les balances RETRAITÉES des entités
 * retenues, les méthodes et pourcentages rendus par le périmètre, ce que le
 * cabinet a déclaré de chaque acquisition et des opérations réciproques, et
 * rend la balance consolidée avant répartition, avec le partage des capitaux
 * propres entre le groupe et les minoritaires.
 *
 * SOURCES, lues le 2026-09-24 · AUDCIF art. 80 à 86 (`titre-2-*`) et D4C
 * ch. XII-2 § 3, XII-3 § 2, XII-5 § 2 à 7, XII-6 (`titre-12-13-d4c-*`).
 *
 * CE QUE LE MOTEUR NE FAIT PAS, et qui est dit plutôt que tu :
 * - les RETRAITEMENTS d'homogénéisation et les éliminations de nature fiscale
 *   (ch. XII-3) · les balances reçues sont réputées retraitées, et un solde
 *   aux comptes 14 ou 15 d'une filiale est signalé ;
 * - la conversion des entités étrangères (tranche 4c) ;
 * - l'élimination des RÉSULTATS INTERNES inclus dans les stocks et les
 *   immobilisations (art. 86, 4°) · le texte veut une élimination totale sans
 *   dire qui du groupe ou des minoritaires du vendeur la supporte ;
 * - les variations de pourcentage (ch. XII-7) et l'entrée en cours d'exercice.
 */

export type MethodeIntegree = 'IG' | 'IP' | 'ME';

/** Une ligne de balance, SOLDE = débit − crédit. */
export interface LigneBalanceEntree {
  numero: string;
  intitule: string;
  solde: number;
  /** Mouvements propres de l'exercice · absents d'une balance importée à quatre colonnes. */
  mouvementDebit?: number | null;
  mouvementCredit?: number | null;
}

export interface EntiteACumuler {
  id: string;
  nom: string;
  estConsolidante: boolean;
  methode: MethodeIntegree;
  /** Pourcentage d'INTÉRÊT rendu par le périmètre (ch. XII-5 § 3). */
  pctInteret: number;
  balance: LigneBalanceEntree[] | null;
}

/**
 * Art. 82 · « rapporté au compte de résultat conformément à un plan
 * d'amortissement ». LIMITEE · durée saisie. NON_DETERMINABLE · dix ans
 * (ch. XII-6 § 4). La durée « non limitée » du D4C, sans amortissement,
 * contredit l'article 82 et n'est pas servie.
 */
export type ModeDureeEcart = 'LIMITEE' | 'NON_DETERMINABLE';
export const DUREE_ECART_NON_DETERMINABLE_ANNEES = 10;

export interface AcquisitionDeclaree {
  detentriceId: string;
  detenueId: string;
  /** Pourcentage de participation DIRECTE au capital. */
  pctCapital: number;
  /** Coût d'acquisition des titres, frais directs compris (ch. XII-6 § 2). */
  coutAcquisition: number;
  /** Compte de titres de la détentrice qui porte ce coût. */
  compteTitres: string;
  dateEntree: Date;
  /** Capitaux propres de la détenue à la date d'entrée, résultat à cette date compris (art. 82). */
  capitauxPropresEntree: number;
  modeDureeEcart: ModeDureeEcart;
  dureeEcartAnnees?: number | null;
  /** Dépréciation cumulée de l'écart, jugée au test du ch. XII-6 § 4 · jamais reprise. */
  depreciationEcartOuverture?: number;
  depreciationEcartCloture?: number;
  /** Dividendes reçus de la détenue dans l'exercice, et le compte qui les porte chez la détentrice. */
  dividendesExercice?: number;
  compteDividendes?: string | null;
  /** Ch. XII-5 § 6 · mise en équivalence négative portée en provision. */
  obligationNonDesengagement?: boolean;
  /** Ch. XII-6 § 1 et § 3 · la part de l'écart de consolidation affectée aux éléments identifiables. */
  ecartsEvaluation?: EcartEvaluation[];
}

/**
 * ÉCART D'ÉVALUATION · tranche 4a. « Différence entre la valeur d'entrée au
 * bilan consolidé (identifiables réestimés à la juste valeur) et la valeur
 * comptable dans l'entité contrôlée » (D4C ch. XII-6 § 1). L'art. 82 l'impose
 * « en priorité », avant tout écart d'acquisition. Rien ne se déduit · la
 * juste valeur d'un bâtiment n'est dans aucune balance.
 *
 * `montant` · de combien l'élément VAUT DE PLUS au bilan consolidé qu'aux
 * livres de la détenue, à la date d'entrée · positif augmente l'actif (classes
 * 2 et 3) ou le passif (16 à 19), négatif les diminue.
 *
 * Son SORT dans le temps se déclare, parce qu'il suit celui de l'élément ·
 * AMORTISSABLE sur la durée d'utilité restant à courir à l'entrée (une
 * immobilisation amortissable), NON_AMORTISSABLE (un terrain), REALISE à la
 * date où l'élément a quitté l'entité (un stock vendu, un bien cédé, un
 * litige éteint).
 */
export type ModeEcartEvaluation = 'AMORTISSABLE' | 'NON_AMORTISSABLE' | 'REALISE';

export interface EcartEvaluation {
  compte: string;
  /** Le 28 qui porte l'amortissement de l'écart · AMORTISSABLE seulement. */
  compteAmortissement?: string | null;
  libelle: string;
  montant: number;
  mode: ModeEcartEvaluation;
  dureeAnnees?: number | null;
  dateRealisation?: Date | null;
}

/**
 * CE QUE L'ENTITÉ DÉCLARE DE SA FISCALITÉ · tranche 4a (art. 92, D4C ch. XII-3
 * § 3). Le TAUX est celui « en vigueur à la clôture » (loi promulguée), et il
 * n'est écrit nulle part dans ce moteur · une filiale étrangère n'a pas le taux
 * de la mère. Les impôts différés des comptes INDIVIDUELS (décalages
 * temporaires, déficits reportables) se déclarent en MONTANTS D'IMPÔT · leur
 * base fiscale est dans la liasse de l'entité, pas dans sa balance. `null`
 * veut dire « pas de réponse », jamais zéro.
 */
export interface FiscaliteEntite {
  entiteId: string;
  /** En pour cent. */
  tauxImpot: number | null;
  idaOuverture: number | null;
  idaCloture: number | null;
  idpOuverture: number | null;
  idpCloture: number | null;
  /** Un impôt différé actif n'est comptabilisé que si son imputation est PROBABLE (ch. XII-3 § 3) · le motif s'écrit. */
  justificationIda?: string | null;
}

export interface OperationReciproque {
  entiteAId: string;
  compteA: string;
  entiteBId: string;
  compteB: string;
  montant: number;
  libelle: string;
}

/**
 * Un résultat interne inclus dans un actif · une marge prise par la VENDEUSE
 * sur un bien encore détenu par l'ACHETEUSE à la clôture (art. 86, 4°). Les
 * deux montants se DÉCLARENT · aucune balance ne dit quelle part d'un stock
 * vient d'un fournisseur du groupe, ni à quelle marge.
 *
 * `margeOuverture` et `margeCloture` sont la marge encore incluse dans l'actif
 * à chaque date, NETTE de ce qui en a été amorti pour une immobilisation. La
 * variation passe au résultat de l'exercice, le stock d'ouverture aux
 * réserves · le D4C demande de « analyser s'ils relèvent de l'exercice ou
 * d'exercices antérieurs (impact réserves) » (ch. XII-5 § 4).
 */
export interface ResultatInterne {
  vendeuseId: string;
  acheteuseId: string;
  nature: 'STOCK' | 'IMMOBILISATION';
  /** Compte de l'ACHETEUSE où l'actif est inscrit · 3 pour un stock, 2 pour une immobilisation. */
  compteActif: string;
  margeOuverture: number;
  margeCloture: number;
  libelle: string;
}

/**
 * ÉCARTS DE CONVERSION DES COMPTES INDIVIDUELS · tranche 4b (D4C ch. XII-3
 * § 2) · « annulation au bilan de l'écart de conversion-actif et de la
 * provision pour perte de change ; au résultat, reclassement de la dotation en
 * perte de change. Écart de conversion-passif : annulation au bilan et
 * constatation d'un produit financier ». Les 478 et 479 de clôture sont dans
 * la balance ; ce qu'aucune balance N ne porte se DÉCLARE · les 478 et 479 de
 * la clôture N-1 (déjà constatés au résultat consolidé N-1, contre-passés dans
 * les comptes individuels N), et la provision pour pertes de change, qui loge
 * dans des comptes (4991, 4997) partagés avec d'autres risques.
 */
export interface ConversionIndividuelle {
  entiteId: string;
  actifN1: number;
  passifN1: number;
  provisions: { compteProvision: string; cloture: number; dotation: number; reprise: number }[];
}

/**
 * Le compte de provision décide de la dotation et de la reprise · AUDCIF
 * Titre VIII ch. 22 § 2.3 (dotations 6591, 6971, 6791 contre 4991, 194, 4997)
 * et Titre VII classe 7 (reprises 7591, 7971, 7791, de même rang).
 */
export const FAMILLES_PROVISION_CHANGE: { provision: string; dotation: string; reprise: string; nature: string }[] = [
  { provision: '194', dotation: '6971', reprise: '7971', nature: 'opérations financières, risque à long terme' },
  { provision: '4991', dotation: '6591', reprise: '7591', nature: 'opérations d’exploitation, risque à court terme' },
  { provision: '4997', dotation: '6791', reprise: '7791', nature: 'opérations financières, risque à court terme' },
];

/** Les postes que la consolidation crée · aucun numéro n'est inventé, le D4C n'impose aucun plan (ch. XII-5 § 2). */
export type PosteConsolidation =
  | 'ECART_ACQUISITION'
  | 'AMORTISSEMENT_ECART_ACQUISITION'
  | 'DEPRECIATION_ECART_ACQUISITION'
  | 'ECART_ACQUISITION_NEGATIF'
  | 'DOTATION_ECART_ACQUISITION'
  | 'REPRISE_ECART_ACQUISITION_NEGATIF'
  | 'TITRES_MIS_EN_EQUIVALENCE'
  | 'QUOTE_PART_RESULTAT_ME'
  | 'PROVISION_ME_NEGATIVE'
  | 'CAPITAL'
  | 'PRIMES_CONSOLIDANTE'
  | 'ECARTS_REEVALUATION_CONSOLIDANTE'
  | 'RESERVES_GROUPE'
  | 'INTERETS_MINORITAIRES'
  | 'RESULTAT_DEJA_CONSTATE'
  | 'ELIMINATION_RESULTATS_INTERNES'
  | 'ECARTS_EVALUATION_RESULTAT'
  | 'IMPOTS_DIFFERES_ACTIF'
  | 'IMPOTS_DIFFERES_PASSIF'
  | 'IMPOTS_DIFFERES_RESULTAT'
  | 'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT';

export const LIBELLE_POSTE: Record<PosteConsolidation, string> = {
  ECART_ACQUISITION: 'Écart d’acquisition',
  AMORTISSEMENT_ECART_ACQUISITION: 'Amortissements de l’écart d’acquisition',
  DEPRECIATION_ECART_ACQUISITION: 'Dépréciations de l’écart d’acquisition',
  ECART_ACQUISITION_NEGATIF: 'Écart d’acquisition négatif',
  DOTATION_ECART_ACQUISITION: 'Dotations aux amortissements et dépréciations de l’écart d’acquisition',
  REPRISE_ECART_ACQUISITION_NEGATIF: 'Écart d’acquisition négatif rapporté au résultat',
  TITRES_MIS_EN_EQUIVALENCE: 'Titres mis en équivalence',
  QUOTE_PART_RESULTAT_ME: 'Quote-part dans les résultats des entités mises en équivalence',
  PROVISION_ME_NEGATIVE: 'Provision · quote-part négative d’une entité mise en équivalence',
  CAPITAL: 'Capital (entité consolidante)',
  PRIMES_CONSOLIDANTE: 'Primes liées au capital (entité consolidante)',
  ECARTS_REEVALUATION_CONSOLIDANTE: 'Écarts de réévaluation (entité consolidante)',
  RESERVES_GROUPE: 'Réserves consolidées',
  INTERETS_MINORITAIRES: 'Intérêts minoritaires (hors résultat)',
  RESULTAT_DEJA_CONSTATE: 'Résultat déjà porté au compte 13 dans les comptes individuels',
  ELIMINATION_RESULTATS_INTERNES: 'Élimination des résultats internes inclus dans les actifs (art. 86, 4°)',
  ECARTS_EVALUATION_RESULTAT: 'Écarts d’évaluation rapportés au résultat (amortis ou réalisés)',
  IMPOTS_DIFFERES_ACTIF: 'Actifs d’impôts différés',
  IMPOTS_DIFFERES_PASSIF: 'Passifs d’impôts différés',
  IMPOTS_DIFFERES_RESULTAT: 'Impôts différés (charge ou produit de l’exercice)',
  ECARTS_CONVERSION_INDIVIDUELS_RESULTAT: 'Pertes et gains de change latents constatés (478 et 479 retraités)',
};

/** Les postes qui sont du résultat · le reste est du bilan. */
const POSTES_DE_RESULTAT = new Set<PosteConsolidation>([
  'DOTATION_ECART_ACQUISITION',
  'REPRISE_ECART_ACQUISITION_NEGATIF',
  'QUOTE_PART_RESULTAT_ME',
  'RESULTAT_DEJA_CONSTATE',
  'ELIMINATION_RESULTATS_INTERNES',
  'ECARTS_EVALUATION_RESULTAT',
  'IMPOTS_DIFFERES_RESULTAT',
  'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT',
]);

/** Clé interne · un ajustement de capitaux propres porté par la détentrice avant son partage. */
const AJUSTEMENT_RESERVES = '§AJUSTEMENT_RESERVES';

export interface LigneConsolidee {
  cle: string;
  intitule: string;
  solde: number;
  /** Poste créé par la consolidation, ou compte du plan. */
  poste: boolean;
}

export interface EcartCalcule {
  detentrice: string;
  detenue: string;
  methode: MethodeIntegree;
  coutAcquisition: number;
  quotePartCapitauxPropresEntree: number;
  ecart: number;
  dureeAnnees: number;
  amortissementCumuleOuverture: number;
  amortissementCumuleCloture: number;
  dotationExercice: number;
  depreciationCumuleeCloture: number;
}

export interface ResultatCumul {
  lignes: LigneConsolidee[];
  capitauxPropres: {
    /** 101 à 104 et 109 de la consolidante · les postes CA et CB de ses comptes individuels. */
    capital: number;
    /** 105 de la consolidante · présentées avec les réserves (« Primes et réserves consolidées », D4C ch. XII-8 § 2). */
    primes: number;
    /** 106 de la consolidante · lu en « Autres capitaux propres », LECTURE DÉCLARÉE, le D4C ne rattache aucun compte à ce poste. */
    ecartsReevaluation: number;
    reservesGroupe: number;
    resultatGroupe: number;
    interetsMinoritairesHorsResultat: number;
    resultatMinoritaires: number;
    resultatEnsemble: number;
  };
  ecarts: EcartCalcule[];
  avertissements: string[];
  equilibre: number;
  /**
   * MOUVEMENTS CONSOLIDÉS de l'exercice, compte par compte · somme des
   * mouvements des entités intégrées, à leur fraction. Ils ne servent qu'au
   * tableau des flux, qui ne se lit pas sur des soldes (D4C ch. XII-8 § 4).
   */
  mouvements: { cle: string; intitule: string; debit: number; credit: number }[];
  /** Ce qui empêche le tableau des flux d'être juste · chaque motif nomme l'entité. */
  obstaclesFlux: string[];
  /** Dividendes reçus des entités mises en équivalence · encaissés, et hors de tout compte cumulé. */
  dividendesRecusMe: number;
  /**
   * Part du résultat des écarts d'évaluation portée par des STOCKS · la
   * variation des stocks la lirait comme un encaissement, le tableau des flux
   * la corrige comme l'élimination des résultats internes.
   */
  ecartsEvaluationStocksResultat: number;
  ecartsEvaluation: EcartEvaluationCalcule[];
  /**
   * Ce qui MANQUE pour que les impôts différés soient complets · une entité
   * sans taux, ou qui n'a pas déclaré ceux de ses comptes individuels. Vide,
   * ils le sont.
   */
  impotsDifferesIncomplets: string[];
}

export interface EcartEvaluationCalcule {
  detenue: string;
  libelle: string;
  compte: string;
  montantEntree: number;
  restantOuverture: number;
  restantCloture: number;
  tauxImpot: number;
  impotDiffereCloture: number;
}

export class RefusConsolidation extends Error {}

// `|| 0` · jamais de zéro négatif, qui se lirait « -0,00 » sur un état.
const r2 = (x: number) => Math.round(x * 100) / 100 || 0;
const PREFIXES_CP_HORS_RESULTAT = ['10', '11', '12'];
const estCpHorsResultat = (n: string) => n === AJUSTEMENT_RESERVES || PREFIXES_CP_HORS_RESULTAT.some((p) => n.startsWith(p));
const estResultat13 = (n: string) => n.startsWith('13');
const estGestion = (n: string) => /^[678]/.test(n) || POSTES_DE_RESULTAT.has(n as PosteConsolidation);

/**
 * Mois écoulés du premier jour du mois d'entrée jusqu'au mois de `date`
 * inclus. CONVENTION DU DÉPÔT, pas du D4C, qui dit « linéairement » sans fixer
 * de prorata · c'est celle du module des immobilisations (loi n° 23/053,
 * art. 34), reprise pour qu'un même logiciel n'amortisse pas de deux façons.
 */
function moisEcoules(entree: Date, date: Date): number {
  const m = (date.getUTCFullYear() - entree.getUTCFullYear()) * 12 + (date.getUTCMonth() - entree.getUTCMonth()) + 1;
  return Math.max(0, m);
}

function planEcart(montantAbs: number, duree: number, entree: Date, date: Date): number {
  if (date.getTime() < Date.UTC(entree.getUTCFullYear(), entree.getUTCMonth(), 1)) return 0;
  const n = duree * 12;
  return r2((montantAbs * Math.min(moisEcoules(entree, date), n)) / n);
}

/**
 * Pourquoi un écart d'évaluation déclaré est irrecevable, ou `null`. Une seule
 * règle, que la déclaration et le cumul appellent · deux copies auraient
 * divergé au premier correctif, et l'une aurait accepté ce que l'autre refuse.
 */
export function motifRefusEcartEvaluation(ev: EcartEvaluation, dateEntree: Date | null): string | null {
  const classe = ev.compte[0];
  if (!(classe === '2' || classe === '3' || /^1[6-9]/.test(ev.compte))) {
    return (
      `Écart d’évaluation « ${ev.libelle} » au compte ${ev.compte} · il s’affecte à un élément IDENTIFIABLE, une immobilisation (2), un stock (3) ` +
      'ou un passif externe (16 à 19), jamais aux capitaux propres.'
    );
  }
  if (!(Math.abs(ev.montant) > 0.005)) return `Écart d’évaluation « ${ev.libelle} » sans montant.`;
  if (ev.mode === 'AMORTISSABLE' && (classe !== '2' || !(Number(ev.dureeAnnees) > 0) || !ev.compteAmortissement?.startsWith('28'))) {
    return (
      `Écart d’évaluation « ${ev.libelle} » amortissable · il faut une immobilisation (classe 2), la durée d’utilité restant à courir à ` +
      'l’entrée, et le compte 28 qui porte son amortissement.'
    );
  }
  if (ev.mode === 'REALISE' && (!ev.dateRealisation || (dateEntree && ev.dateRealisation.getTime() < dateEntree.getTime()))) {
    return `Écart d’évaluation « ${ev.libelle} » réalisé · la date de réalisation manque ou précède l’entrée.`;
  }
  return null;
}

/** Ce qui reste de l'écart à une date, au signe de son solde. */
function restantEcart(ev: EcartEvaluation, s: number, entree: Date, date: Date): number {
  if (ev.mode === 'NON_AMORTISSABLE') return s;
  if (ev.mode === 'REALISE') return date.getTime() >= ev.dateRealisation!.getTime() ? 0 : s;
  return r2(s - Math.sign(s) * planEcart(Math.abs(s), ev.dureeAnnees!, entree, date));
}

export function cumulerConsolidation(
  exercice: { dateDebut: Date; dateFin: Date },
  entites: EntiteACumuler[],
  acquisitions: AcquisitionDeclaree[],
  reciproques: OperationReciproque[],
  resultatsInternes: ResultatInterne[] = [],
  fiscalites: FiscaliteEntite[] = [],
  conversions: ConversionIndividuelle[] = [],
): ResultatCumul {
  const avertissements: string[] = [];
  const parId = new Map(entites.map((e) => [e.id, e]));
  const consolidante = entites.find((e) => e.estConsolidante);
  if (!consolidante) throw new RefusConsolidation('Aucune entité consolidante.');
  const nomDe = (id: string) => parId.get(id)?.nom ?? id;

  // ─── 1. Balances, à la fraction d'intégration ─────────────────────────────
  // IG · 100 % (art. 81, al. 1). IP · « la fraction représentative des
  // intérêts de l'entité consolidante (ou des entités détentrices) » (art. 81,
  // al. 2) · lue sur la participation DIRECTE de l'unique détentrice, puisque
  // le texte parle de « l'entité détentrice ». ME · rien n'est cumulé.
  const fraction = new Map<string, number>();
  for (const e of entites) {
    if (!e.balance) {
      throw new RefusConsolidation(`La balance de « ${e.nom} » manque · une entité retenue ne se consolide pas sans ses comptes.`);
    }
    const ecart = r2(e.balance.reduce((s, l) => s + l.solde, 0));
    if (Math.abs(ecart) > 0.005) {
      throw new RefusConsolidation(`La balance de « ${e.nom} » n’est pas équilibrée (écart de ${ecart}).`);
    }
    if (e.estConsolidante || e.methode === 'IG') fraction.set(e.id, 1);
    else if (e.methode === 'IP') {
      const detentrices = acquisitions.filter((a) => a.detenueId === e.id);
      if (detentrices.length !== 1) {
        throw new RefusConsolidation(
          `« ${e.nom} » est intégrée proportionnellement et a ${detentrices.length} détentrices déclarées · l’art. 81 parle de « la fraction ` +
            'représentative des intérêts » de l’entité détentrice, et aucun texte lu ne dit laquelle retenir quand il y en a plusieurs.',
        );
      }
      fraction.set(e.id, detentrices[0].pctCapital / 100);
    }
    // La consolidante aussi · sa balance est lue au grand livre, qui n'est pas retraité.
    // Les provisions réglementées (15) sont contre-passées plus bas (tranche
    // 4b) · reste la subvention d'investissement, que le ch. XII-3 § 2 fait
    // reclasser en produits constatés d'avance et que le ch. XII-8 § 2 présente
    // sur sa propre ligne, hors capitaux propres · les deux ne s'articulent pas.
    if ((e.estConsolidante || e.methode !== 'ME') && e.balance.some((l) => /^14/.test(l.numero) && Math.abs(l.solde) > 0.005)) {
      avertissements.push(
        `« ${e.nom} » porte des subventions d’investissement (14) · présentées sur leur ligne propre, hors capitaux propres (D4C ch. XII-8 § 2) ; ` +
          'le ch. XII-3 § 2 les reclasse en produits constatés d’avance, sans incidence sur le résultat ni impôt différé.',
      );
    }
  }

  const obstaclesFlux: string[] = [];
  const mouvements = new Map<string, { debit: number; credit: number }>();
  const comptes = new Map<string, Map<string, number>>();
  const intitules = new Map<string, string>();
  const ajouter = (entiteId: string, cle: string, montant: number) => {
    const m = comptes.get(entiteId)!;
    m.set(cle, r2((m.get(cle) ?? 0) + montant));
  };
  for (const e of entites) {
    if (e.methode === 'ME' && !e.estConsolidante) continue;
    const f = fraction.get(e.id)!;
    const m = new Map<string, number>();
    comptes.set(e.id, m);
    let sansMouvements = false;
    for (const l of e.balance!) {
      m.set(l.numero, r2((m.get(l.numero) ?? 0) + l.solde * f));
      if (!intitules.has(l.numero) || e.estConsolidante) intitules.set(l.numero, l.intitule);
      if (l.mouvementDebit == null || l.mouvementCredit == null) {
        sansMouvements = true;
        continue;
      }
      const mv = mouvements.get(l.numero) ?? { debit: 0, credit: 0 };
      mv.debit = r2(mv.debit + l.mouvementDebit * f);
      mv.credit = r2(mv.credit + l.mouvementCredit * f);
      mouvements.set(l.numero, mv);
      // Un capital de filiale qui bouge dans l'exercice fait entrer ou sortir
      // des minoritaires · leur apport ou leur remboursement est un flux de
      // financement que le cumul ne sépare pas.
      if (!e.estConsolidante && /^10[1-5]/.test(l.numero) && (Math.abs(l.mouvementDebit) > 0.005 || Math.abs(l.mouvementCredit) > 0.005)) {
        obstaclesFlux.push(`Le capital de « ${e.nom} » a bougé dans l’exercice (compte ${l.numero}) · la part des minoritaires dans ce flux n’est pas séparée.`);
      }
    }
    if (sansMouvements) {
      obstaclesFlux.push(`La balance de « ${e.nom} » ne porte pas les mouvements de l’exercice · importez-la à six colonnes (report, mouvements, solde).`);
    }
    if (e.balance!.some((l) => l.numero.startsWith('13') && Math.abs(l.solde) > 0.005)) {
      obstaclesFlux.push(`La balance de « ${e.nom} » est arrêtée APRÈS clôture (résultat au compte 13) · la capacité d’autofinancement ne se calcule pas sans ses charges et produits.`);
    }
  }
  const integree = (id: string) => comptes.has(id);

  // Capitaux propres (hors résultat) et résultat d'une balance, en solde CRÉDITEUR positif.
  const lireCp = (b: LigneBalanceEntree[]) => {
    let cp = 0;
    let res = 0;
    for (const l of b) {
      if (estCpHorsResultat(l.numero)) cp -= l.solde;
      else if (estResultat13(l.numero) || estGestion(l.numero)) res -= l.solde;
    }
    return { cp: r2(cp), res: r2(res) };
  };

  // ─── Fiscalité déclarée ───────────────────────────────────────────────────
  const fisc = new Map(fiscalites.map((f) => [f.entiteId, f]));
  const taux = (id: string) => {
    const t = fisc.get(id)?.tauxImpot;
    return t == null ? null : t / 100;
  };
  const impotsDifferesIncomplets: string[] = [];
  /** Un impôt différé au bilan, rangé par son SENS · jamais compensé entre sources, le D4C n'en dit rien. */
  const poserImpotDiffere = (id: string, soldeCloture: number) => {
    if (Math.abs(soldeCloture) <= 0.005) return;
    ajouter(id, soldeCloture > 0 ? 'IMPOTS_DIFFERES_ACTIF' : 'IMPOTS_DIFFERES_PASSIF', soldeCloture);
  };

  // ─── 2. Élimination des titres, écarts, mise en équivalence, dividendes ───
  const ecarts: EcartCalcule[] = [];
  const ecartsEvaluation: EcartEvaluationCalcule[] = [];
  let ecartsEvaluationStocksResultat = 0;
  let dividendesRecusMe = 0;
  const veilleOuverture = new Date(exercice.dateDebut.getTime() - 86_400_000);
  for (const a of acquisitions) {
    const detenue = parId.get(a.detenueId);
    const detentrice = parId.get(a.detentriceId);
    if (!detenue || !detentrice) continue; // hors périmètre retenu · les titres restent au coût
    if (!integree(a.detentriceId) || fraction.get(a.detentriceId) !== 1) {
      throw new RefusConsolidation(
        `« ${detentrice.nom} » détient « ${detenue.nom} » sans être intégrée globalement · les titres d’une entité intégrée ` +
          'proportionnellement ou mise en équivalence ne se substituent pas par ce moteur.',
      );
    }
    if (a.dateEntree.getTime() > exercice.dateDebut.getTime()) {
      throw new RefusConsolidation(
        `« ${detenue.nom} » est entrée dans le périmètre en cours d’exercice · la part du résultat antérieure à l’entrée ` +
          '(art. 82) ne se lit pas dans une balance annuelle, et cette tranche ne la sépare pas.',
      );
    }
    const soldeTitres = comptes.get(a.detentriceId)!.get(a.compteTitres) ?? 0;
    if (soldeTitres + 0.005 < a.coutAcquisition) {
      avertissements.push(
        `Le compte ${a.compteTitres} de « ${detentrice.nom} » porte ${soldeTitres} quand le coût déclaré des titres de ` +
          `« ${detenue.nom} » est ${a.coutAcquisition} · vérifiez le compte ou le coût.`,
      );
    }
    const d = a.pctCapital / 100;

    // ÉCARTS D'ÉVALUATION · ils entrent dans les capitaux propres de la détenue
    // à l'entrée, NETS de leur impôt différé (« tous les écarts d'évaluation
    // donnent lieu à imposition différée », ch. XII-6 § 1), et réduisent
    // d'autant l'écart d'acquisition (art. 82, « en priorité »). Ils
    // appartiennent aux majoritaires ET aux minoritaires (§ 3) · ils sont donc
    // portés par la DÉTENUE, avant son partage.
    const evs = a.ecartsEvaluation ?? [];
    let reestimation = 0;
    if (evs.length > 0) {
      if (detenue.methode === 'ME') {
        throw new RefusConsolidation(
          `Écart d’évaluation déclaré sur « ${detenue.nom} », mise en équivalence · ses comptes n’étant pas repris, il n’y a pas d’écart d’évaluation (D4C ch. XII-6 § 3).`,
        );
      }
      const t = taux(a.detenueId);
      if (t == null) {
        throw new RefusConsolidation(
          `Écart d’évaluation sur « ${detenue.nom} » sans taux d’impôt déclaré pour elle · tous les écarts d’évaluation donnent lieu à imposition ` +
            'différée (D4C ch. XII-6 § 1), au taux en vigueur à la clôture (ch. XII-3 § 3).',
        );
      }
      const f = fraction.get(a.detenueId)!;
      for (const ev of evs) {
        const refus = motifRefusEcartEvaluation(ev, a.dateEntree);
        if (refus) throw new RefusConsolidation(refus);
        const classe = ev.compte[0];
        const passif = classe === '1';
        const s = passif ? -ev.montant : ev.montant;
        reestimation += s * (1 - t);
        const rOuv = restantEcart(ev, s, a.dateEntree, veilleOuverture);
        const rClo = restantEcart(ev, s, a.dateEntree, exercice.dateFin);
        const D = a.detenueId;
        if (ev.mode === 'AMORTISSABLE') {
          ajouter(D, ev.compte, r2(f * s));
          ajouter(D, ev.compteAmortissement!, -r2(f * (s - rClo)));
        } else {
          ajouter(D, ev.compte, r2(f * rClo));
        }
        const resultatEcart = r2(f * (rOuv - rClo));
        ajouter(D, 'ECARTS_EVALUATION_RESULTAT', resultatEcart);
        if (classe === '3') ecartsEvaluationStocksResultat += resultatEcart;
        ajouter(D, AJUSTEMENT_RESERVES, -r2(f * rOuv * (1 - t)));
        poserImpotDiffere(D, -r2(t * f * rClo));
        ajouter(D, 'IMPOTS_DIFFERES_RESULTAT', -r2(t * resultatEcart));
        ecartsEvaluation.push({
          detenue: detenue.nom,
          libelle: ev.libelle,
          compte: ev.compte,
          montantEntree: ev.montant,
          restantOuverture: passif ? -rOuv : rOuv,
          restantCloture: passif ? -rClo : rClo,
          tauxImpot: t * 100,
          impotDiffereCloture: -r2(t * f * rClo),
        });
      }
    }
    const quotePart = r2(d * (a.capitauxPropresEntree + reestimation));
    const ecart = r2(a.coutAcquisition - quotePart);
    const duree = a.modeDureeEcart === 'NON_DETERMINABLE' ? DUREE_ECART_NON_DETERMINABLE_ANNEES : (a.dureeEcartAnnees ?? 0);
    if (Math.abs(ecart) > 0.005 && !(duree > 0)) {
      throw new RefusConsolidation(
        `L’écart d’acquisition sur « ${detenue.nom} » n’a pas de durée · l’art. 82 le rapporte au résultat selon un plan ` +
          'd’amortissement. Durée d’utilité, ou dix ans si elle n’est pas déterminable de façon fiable (ch. XII-6 § 4).',
      );
    }
    const amortOuv = duree > 0 ? planEcart(Math.abs(ecart), duree, a.dateEntree, veilleOuverture) : 0;
    const amortClo = duree > 0 ? planEcart(Math.abs(ecart), duree, a.dateEntree, exercice.dateFin) : 0;
    const depOuv = r2(a.depreciationEcartOuverture ?? 0);
    const depClo = r2(a.depreciationEcartCloture ?? 0);
    if (depClo + 0.005 < depOuv) {
      throw new RefusConsolidation(`La dépréciation de l’écart sur « ${detenue.nom} » baisse · elle n’est jamais reprise (ch. XII-6 § 4).`);
    }
    if (ecart < 0 && (depOuv > 0 || depClo > 0)) {
      throw new RefusConsolidation(`Un écart d’acquisition négatif ne se déprécie pas (« ${detenue.nom} »).`);
    }
    ecarts.push({
      detentrice: detentrice.nom,
      detenue: detenue.nom,
      methode: detenue.methode,
      coutAcquisition: a.coutAcquisition,
      quotePartCapitauxPropresEntree: quotePart,
      ecart,
      dureeAnnees: duree,
      amortissementCumuleOuverture: amortOuv,
      amortissementCumuleCloture: amortClo,
      dotationExercice: r2(amortClo - amortOuv + (depClo - depOuv)),
      depreciationCumuleeCloture: depClo,
    });

    const H = a.detentriceId;
    ajouter(H, a.compteTitres, -a.coutAcquisition);
    const ligneTitres = detentrice.balance?.find((l) => l.numero === a.compteTitres);
    if (ligneTitres && (Math.abs(ligneTitres.mouvementDebit ?? 0) > 0.005 || Math.abs(ligneTitres.mouvementCredit ?? 0) > 0.005)) {
      obstaclesFlux.push(
        `Le compte ${a.compteTitres} de « ${detentrice.nom} » a bougé dans l’exercice · un achat ou une cession de titres de « ${detenue.nom} » ` +
          'change le pourcentage, ce que ce moteur ne traite pas.',
      );
    }

    if (detenue.methode === 'IG' || detenue.methode === 'IP') {
      // Art. 81 · aux titres se substituent les éléments de la détenue, déjà
      // cumulés ; la quote-part d'entrée de ses capitaux propres sort des
      // réserves de la détentrice, l'écart va à son poste (art. 82).
      ajouter(H, AJUSTEMENT_RESERVES, quotePart);
      if (ecart >= 0) {
        ajouter(H, 'ECART_ACQUISITION', ecart);
        ajouter(H, 'AMORTISSEMENT_ECART_ACQUISITION', -amortClo);
        ajouter(H, 'DEPRECIATION_ECART_ACQUISITION', -depClo);
        ajouter(H, 'DOTATION_ECART_ACQUISITION', r2(amortClo - amortOuv + depClo - depOuv));
        ajouter(H, AJUSTEMENT_RESERVES, r2(amortOuv + depOuv));
      } else {
        ajouter(H, 'ECART_ACQUISITION_NEGATIF', r2(ecart + amortClo));
        ajouter(H, 'REPRISE_ECART_ACQUISITION_NEGATIF', -r2(amortClo - amortOuv));
        ajouter(H, AJUSTEMENT_RESERVES, -amortOuv);
      }
    } else {
      // MISE EN ÉQUIVALENCE · « substituer à la valeur comptable des titres la
      // quote-part des capitaux propres (résultat inclus) » (art. 81, al. 3),
      // l'écart positif étant « inclus dans la valeur comptable des titres »
      // (ch. XII-6 § 4).
      if (ecart < 0) {
        throw new RefusConsolidation(
          `Écart d’acquisition négatif sur « ${detenue.nom} », mise en équivalence · le D4C ne traite que l’écart positif d’une entité mise en équivalence.`,
        );
      }
      const { cp, res } = lireCp(detenue.balance!);
      const quotePartResultat = r2(d * res);
      const valeur = r2(d * (cp + res) + ecart - amortClo - depClo);
      const dotation = r2(amortClo - amortOuv + depClo - depOuv);
      const partResultat = r2(quotePartResultat - dotation);
      if (valeur >= 0) {
        ajouter(H, 'TITRES_MIS_EN_EQUIVALENCE', valeur);
      } else if (a.obligationNonDesengagement) {
        ajouter(H, 'PROVISION_ME_NEGATIVE', valeur);
      } else {
        // « Retenue pour une valeur nulle » (ch. XII-5 § 6) · la perte au-delà
        // n'est pas constatée, et le montant écarté est dit.
        avertissements.push(
          `Quote-part négative de « ${detenue.nom} » (${valeur}) retenue pour une valeur nulle (ch. XII-5 § 6) · ` +
            'si la détentrice a l’obligation ou l’intention de ne pas se désengager, déclarez-le, la partie négative passe en provision.',
        );
      }
      const valeurRetenue = valeur >= 0 || a.obligationNonDesengagement ? valeur : 0;
      ajouter(H, 'QUOTE_PART_RESULTAT_ME', -quotePartResultat);
      ajouter(H, 'DOTATION_ECART_ACQUISITION', dotation);
      // Le reste de la variation des capitaux propres va aux réserves.
      ajouter(H, AJUSTEMENT_RESERVES, -r2(valeurRetenue - a.coutAcquisition - partResultat));
    }

    // DIVIDENDES · « éliminés du résultat de la période (rapportés aux
    // réserves) » (ch. XII-5 § 4 et § 6, art. 86, 4°).
    const div = r2(a.dividendesExercice ?? 0);
    if (div > 0 && detenue.methode === 'ME') dividendesRecusMe += div;
    if (div > 0) {
      if (!a.compteDividendes) {
        throw new RefusConsolidation(`Dividendes de « ${detenue.nom} » déclarés sans le compte qui les porte chez « ${detentrice.nom} ».`);
      }
      if (!a.compteDividendes.startsWith('772')) {
        avertissements.push(`Dividendes de « ${detenue.nom} » lus au compte ${a.compteDividendes}, hors du 772 « Revenus de participations ».`);
      }
      ajouter(H, a.compteDividendes, div);
      ajouter(H, AJUSTEMENT_RESERVES, -div);
    }
  }

  // ─── 2 bis. Résultats internes inclus dans les actifs (art. 86, 4°) ───────
  // L'élimination est OBLIGATOIRE (art. 86, 4°), et « totale » entre entités
  // intégrées globalement (D4C ch. XII-5 § 4) · au PRODUIT des pourcentages
  // d'intégration dès qu'une entité intégrée proportionnellement est en jeu
  // (§ 6). QUI LA SUPPORTE, aucun des deux textes ne l'écrit. LECTURE
  // D'OMEGAX · l'art. 85 bâtit le résultat consolidé des « éléments
  // constitutifs » du résultat de chaque entité, après retraitement, et la
  // marge est un élément du résultat de la VENDEUSE · l'élimination la retraite
  // donc AVANT le partage, et elle se répartit comme ce résultat, au
  // pourcentage d'intérêt de la vendeuse. Une vendeuse qui est la consolidante
  // la porte tout entière au groupe.
  for (const ri of resultatsInternes) {
    for (const id of [ri.vendeuseId, ri.acheteuseId]) {
      const e = parId.get(id);
      if (!e) throw new RefusConsolidation(`Résultat interne « ${ri.libelle} » · une des deux entités n’est pas retenue.`);
      if (!integree(id)) {
        throw new RefusConsolidation(
          `Résultat interne « ${ri.libelle} » avec « ${e.nom} », mise en équivalence · son élimination se fait sur les titres mis en ` +
            'équivalence (D4C ch. XII-5 § 6), que cette tranche ne traite pas.',
        );
      }
    }
    if (ri.vendeuseId === ri.acheteuseId) {
      throw new RefusConsolidation(`Résultat interne « ${ri.libelle} » · la vendeuse et l’acheteuse sont la même entité, rien n’est interne au groupe.`);
    }
    if (!(ri.margeCloture >= 0) || !(ri.margeOuverture >= 0)) {
      throw new RefusConsolidation(`Résultat interne « ${ri.libelle} » · une marge se déclare positive · une perte interne ne s’élimine pas par ce chemin.`);
    }
    const classeAttendue = ri.nature === 'STOCK' ? '3' : '2';
    if (!ri.compteActif.startsWith(classeAttendue)) {
      throw new RefusConsolidation(
        `Résultat interne « ${ri.libelle} » · ${ri.nature === 'STOCK' ? 'un stock' : 'une immobilisation'} s’inscrit en classe ${classeAttendue}, pas au compte ${ri.compteActif}.`,
      );
    }
    const facteur = fraction.get(ri.vendeuseId)! * fraction.get(ri.acheteuseId)!;
    const cloture = r2(ri.margeCloture * facteur);
    const ouverture = r2(ri.margeOuverture * facteur);
    const soldeActif = comptes.get(ri.acheteuseId)!.get(ri.compteActif) ?? 0;
    if (soldeActif + 0.005 < cloture) {
      throw new RefusConsolidation(
        `Résultat interne « ${ri.libelle} » · ${cloture} à éliminer excède le solde du compte ${ri.compteActif} de « ${nomDe(ri.acheteuseId)} » (${soldeActif}).`,
      );
    }
    ajouter(ri.vendeuseId, 'ELIMINATION_RESULTATS_INTERNES', r2(cloture - ouverture));
    ajouter(ri.vendeuseId, AJUSTEMENT_RESERVES, ouverture);
    ajouter(ri.vendeuseId, ri.compteActif, -cloture);
    // Art. 92, 2° et ch. XII-3 § 3 · l'élimination abaisse la valeur de l'actif
    // sous sa base fiscale, la vendeuse ayant été imposée sur la marge · un
    // impôt différé ACTIF, au taux de la VENDEUSE, qui a payé l'impôt.
    const t = taux(ri.vendeuseId);
    if (t == null) {
      impotsDifferesIncomplets.push(
        `Résultat interne « ${ri.libelle} » · aucun taux d’impôt déclaré pour « ${nomDe(ri.vendeuseId)} », l’impôt différé sur la marge éliminée n’est pas calculé.`,
      );
    } else {
      poserImpotDiffere(ri.vendeuseId, r2(t * cloture));
      ajouter(ri.vendeuseId, 'IMPOTS_DIFFERES_RESULTAT', -r2(t * (cloture - ouverture)));
      ajouter(ri.vendeuseId, AJUSTEMENT_RESERVES, -r2(t * ouverture));
    }
  }

  // ─── 2 bis bis. Éliminations de nature fiscale (art. 86, 3°) ──────────────
  // PROVISIONS RÉGLEMENTÉES (15) · « contre-passer ; incidence de l'exercice →
  // résultat, exercices antérieurs → réserves » (D4C ch. XII-3 § 2). Le compte
  // 15 n'est « créé ou augmenté EXCLUSIVEMENT par Dotations HAO » (851) et
  // « réduit ou annulé EXCLUSIVEMENT par Reprises HAO » (861) · Titre VII,
  // compte 15 · l'incidence de l'exercice se LIT donc sur le 851 et le 861, et
  // rien n'est déclaré. Ce sont des « réserves non libérées d'impôt, sur
  // lesquelles pèse une charge latente ou différée d'impôt » · leur
  // élimination porte un impôt différé PASSIF (art. 92, 2°).
  for (const [id, m] of comptes) {
    let c15 = 0;
    let d851 = 0;
    let s861 = 0;
    const cles: string[] = [];
    for (const [cle, solde] of m) {
      if (cle.startsWith('15')) c15 += solde;
      else if (cle.startsWith('851')) d851 += solde;
      else if (cle.startsWith('861')) s861 += solde;
      else continue;
      cles.push(cle);
    }
    if (cles.every((c) => Math.abs(m.get(c) ?? 0) <= 0.005)) continue;
    for (const c of cles) {
      m.set(c, 0);
      mouvements.delete(c);
    }
    ajouter(id, AJUSTEMENT_RESERVES, r2(c15 + d851 + s861));
    const t = taux(id);
    if (t == null) {
      impotsDifferesIncomplets.push(
        `« ${nomDe(id)} » · aucun taux d’impôt déclaré, l’impôt différé sur ses provisions réglementées contre-passées n’est pas calculé.`,
      );
    } else {
      poserImpotDiffere(id, r2(t * c15));
      ajouter(id, 'IMPOTS_DIFFERES_RESULTAT', r2(t * (d851 + s861)));
      ajouter(id, AJUSTEMENT_RESERVES, -r2(t * (c15 + d851 + s861)));
    }
  }

  // ÉCARTS DE CONVERSION DES COMPTES INDIVIDUELS (478, 479) · sur
  // DÉCLARATION, faute de quoi ils restent au bilan comme « à retraiter » et
  // l'état n'est pas publiable. Tout le 478 et tout le 479 sont annulés, le
  // texte ne distinguant aucun sous-compte. Au résultat, la variation de la
  // position latente nette (clôture N moins clôture N-1, cette dernière déjà
  // au résultat consolidé N-1) ; la dotation et la reprise de la provision
  // sortent de leurs comptes, la position latente les remplace. Aucun impôt
  // différé n'est calculé · il dépend du traitement fiscal des écarts latents,
  // qu'OmegaX ne tranche pas, et se déclare avec ceux de l'entité.
  for (const cv of conversions) {
    const m = comptes.get(cv.entiteId);
    if (!m) continue;
    const f = fraction.get(cv.entiteId)!;
    let X = 0;
    let Y = 0;
    for (const [cle, solde] of m) {
      if (cle.startsWith('478')) X += solde;
      else if (cle.startsWith('479')) Y -= solde;
      else continue;
      m.set(cle, 0);
      mouvements.delete(cle);
    }
    let P = 0;
    let D = 0;
    let R = 0;
    // Les MOUVEMENTS suivent pour la dotation et la reprise, qui sont des
    // comptes de gestion · la provision, compte de bilan, se lit au tableau
    // des flux par sa variation de solde, qui est retirée N comme N-1.
    const retirer = (prefixe: string, montant: number, sens: 1 | -1, quoi: string, suivreMouvements: boolean) => {
      if (montant <= 0.005) return;
      const cle = [...m.keys()].sort().find((k) => k.startsWith(prefixe) && sens * (m.get(k) ?? 0) + 0.005 >= montant);
      if (!cle) {
        throw new RefusConsolidation(
          `« ${nomDe(cv.entiteId)} » · ${quoi} de ${montant} déclarée, et aucun compte ${prefixe} de sa balance ne la porte.`,
        );
      }
      ajouter(cv.entiteId, cle, -sens * montant);
      const mv = suivreMouvements ? mouvements.get(cle) : undefined;
      if (mv) {
        if (sens === 1) mv.debit = r2(Math.max(0, mv.debit - montant));
        else mv.credit = r2(Math.max(0, mv.credit - montant));
      }
    };
    for (const p of cv.provisions) {
      const fam = FAMILLES_PROVISION_CHANGE.find((x) => p.compteProvision.startsWith(x.provision));
      if (!fam) {
        throw new RefusConsolidation(
          `« ${nomDe(cv.entiteId)} » · la provision pour pertes de change se loge au 194, au 4991 ou au 4997 (Titre VIII ch. 22 § 2.3), pas au ${p.compteProvision}.`,
        );
      }
      if (p.cloture < 0 || p.dotation < 0 || p.reprise < 0 || p.cloture - p.dotation + p.reprise < -0.005) {
        throw new RefusConsolidation(
          `« ${nomDe(cv.entiteId)} » · provision ${p.compteProvision} · clôture, dotation et reprise se déclarent positives, et la provision d’ouverture qu’elles donnent (clôture − dotation + reprise) ne peut être négative.`,
        );
      }
      const c = r2(f * p.cloture);
      const d = r2(f * p.dotation);
      const rp = r2(f * p.reprise);
      retirer(p.compteProvision, c, -1, 'provision pour pertes de change', false);
      retirer(fam.dotation, d, 1, 'dotation', true);
      retirer(fam.reprise, rp, -1, 'reprise', true);
      P += c;
      D += d;
      R += rp;
    }
    const X1 = r2(f * cv.actifN1);
    const Y1 = r2(f * cv.passifN1);
    ajouter(cv.entiteId, 'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT', r2(X - Y - (X1 - Y1)));
    ajouter(cv.entiteId, AJUSTEMENT_RESERVES, r2(X1 - Y1 - (P - D + R)));
  }

  // ─── 2 ter. Impôts différés des comptes individuels ───────────────────────
  // Approche résultat, 1° et 3° (art. 92) · décalages temporaires et déficits
  // reportables. DÉCLARÉS en montants d'impôt, à la fraction d'intégration.
  for (const id of comptes.keys()) {
    const e = parId.get(id)!;
    const fi = fisc.get(id);
    if (!fi || fi.idaOuverture == null || fi.idaCloture == null || fi.idpOuverture == null || fi.idpCloture == null) {
      impotsDifferesIncomplets.push(
        `« ${e.nom} » n’a pas déclaré les impôts différés de ses comptes individuels (décalages temporaires, déficits reportables, art. 92) · zéro est une réponse, l’absence n’en est pas une.`,
      );
      continue;
    }
    for (const v of [fi.idaOuverture, fi.idaCloture, fi.idpOuverture, fi.idpCloture]) {
      if (v < 0) throw new RefusConsolidation(`« ${e.nom} » · un impôt différé se déclare en montant positif, son sens est celui de la colonne.`);
    }
    if ((fi.idaCloture > 0.005 || fi.idaOuverture > 0.005) && !fi.justificationIda?.trim()) {
      throw new RefusConsolidation(
        `« ${e.nom} » déclare un impôt différé actif sans dire pourquoi son imputation est probable · il n’est comptabilisé que s’il est « probable que la ` +
          'différence s’inversera dans un avenir prévisible et qu’un bénéfice imposable existera » (D4C ch. XII-3 § 3).',
      );
    }
    const f = fraction.get(id)!;
    poserImpotDiffere(id, r2(f * fi.idaCloture));
    poserImpotDiffere(id, -r2(f * fi.idpCloture));
    ajouter(id, 'IMPOTS_DIFFERES_RESULTAT', r2(-f * (fi.idaCloture - fi.idaOuverture) + f * (fi.idpCloture - fi.idpOuverture)));
    ajouter(id, AJUSTEMENT_RESERVES, r2(-f * fi.idaOuverture + f * fi.idpOuverture));
  }

  // ─── 3. Partage des capitaux propres ──────────────────────────────────────
  // Groupe · pourcentage d'intérêt ; minoritaires · le complément (ch. XII-5
  // § 7, consolidation directe). Pour une entité intégrée proportionnellement,
  // les montants sont déjà à la fraction : la part du groupe y est
  // intérêt ÷ fraction, le reste revient aux minoritaires de la détentrice.
  let capital = 0;
  let primes = 0;
  let ecartsReevaluation = 0;
  let reservesGroupe = 0;
  let resultatGroupe = 0;
  let imHorsResultat = 0;
  let resultatMinoritaires = 0;
  const agregat = new Map<string, number>();
  for (const [id, m] of comptes) {
    const e = parId.get(id)!;
    // Le 10 de la consolidante se lit comme dans ses comptes individuels ·
    // capital 101 à 104 et 109 (postes CA et CB), primes 105 (CD), écarts de
    // réévaluation 106 (CE). Une filiale, elle, partage TOUS ses capitaux
    // propres, primes comprises · aucun n'est du capital du groupe.
    let cpCapital = 0;
    let cpPrimes = 0;
    let cpReevaluation = 0;
    let cpAutres = 0;
    let res = 0;
    for (const [cle, solde] of m) {
      if (estCpHorsResultat(cle)) {
        if (cle.startsWith('105')) cpPrimes -= solde;
        else if (cle.startsWith('106')) cpReevaluation -= solde;
        else if (cle.startsWith('10')) cpCapital -= solde;
        else cpAutres -= solde;
      } else if (estResultat13(cle) || estGestion(cle)) res -= solde;
    }
    const g = e.estConsolidante ? 1 : e.pctInteret / 100 / fraction.get(id)!;
    if (e.estConsolidante) {
      capital += cpCapital;
      primes += cpPrimes;
      ecartsReevaluation += cpReevaluation;
      reservesGroupe += cpAutres;
    } else {
      const cp = cpCapital + cpPrimes + cpReevaluation + cpAutres;
      reservesGroupe += g * cp;
      imHorsResultat += (1 - g) * cp;
    }
    resultatGroupe += g * res;
    resultatMinoritaires += (1 - g) * res;
    for (const [cle, solde] of m) {
      if (estCpHorsResultat(cle)) continue;
      const k = estResultat13(cle) ? 'RESULTAT_DEJA_CONSTATE' : cle;
      agregat.set(k, r2((agregat.get(k) ?? 0) + solde));
    }
  }

  // ─── 4. Comptes réciproques ───────────────────────────────────────────────
  // Sur l'AGRÉGAT, après le partage · une vente interne retirée au vendeur et
  // à l'acheteur ne change pas le résultat de l'ensemble (ch. XII-5 § 4), et
  // l'éliminer avant le partage déplacerait du résultat entre groupe et
  // minoritaires dès que les deux entités n'ont pas le même intérêt.
  for (const o of reciproques) {
    for (const id of [o.entiteAId, o.entiteBId]) {
      const e = parId.get(id);
      if (!e) throw new RefusConsolidation(`Opération réciproque « ${o.libelle} » · une des deux entités n’est pas retenue.`);
      if (!integree(id)) {
        throw new RefusConsolidation(
          `Opération réciproque « ${o.libelle} » avec « ${e.nom} », mise en équivalence · ses comptes ne sont pas cumulés, il n’y a rien à éliminer (art. 86, 6°).`,
        );
      }
    }
    // IG avec IP · dans la limite du pourcentage d'intégration de l'IP ; deux
    // IP · le plus faible des deux (ch. XII-5 § 5).
    const facteur = Math.min(fraction.get(o.entiteAId)!, fraction.get(o.entiteBId)!);
    const m = r2(o.montant * facteur);
    const sA = comptes.get(o.entiteAId)!.get(o.compteA) ?? 0;
    const sB = comptes.get(o.entiteBId)!.get(o.compteB) ?? 0;
    if (Math.sign(sA) === Math.sign(sB) || sA === 0 || sB === 0) {
      throw new RefusConsolidation(
        `Opération réciproque « ${o.libelle} » · les comptes ${o.compteA} de « ${nomDe(o.entiteAId)} » et ${o.compteB} de ` +
          `« ${nomDe(o.entiteBId)} » doivent être de sens contraire, et non nuls.`,
      );
    }
    if (Math.abs(sA) + 0.005 < m || Math.abs(sB) + 0.005 < m) {
      throw new RefusConsolidation(
        `Opération réciproque « ${o.libelle} » · ${m} à éliminer excède le solde de l’un des deux comptes. La procédure de ` +
          'confirmation de solde (ch. XII-3 § 2) doit d’abord rapprocher les deux montants.',
      );
    }
    agregat.set(o.compteA, r2((agregat.get(o.compteA) ?? 0) - Math.sign(sA) * m));
    agregat.set(o.compteB, r2((agregat.get(o.compteB) ?? 0) - Math.sign(sB) * m));
  }

  capital = r2(capital);
  primes = r2(primes);
  ecartsReevaluation = r2(ecartsReevaluation);
  reservesGroupe = r2(reservesGroupe);
  imHorsResultat = r2(imHorsResultat);
  resultatGroupe = r2(resultatGroupe);
  resultatMinoritaires = r2(resultatMinoritaires);
  agregat.set('CAPITAL', -capital);
  agregat.set('PRIMES_CONSOLIDANTE', -primes);
  agregat.set('ECARTS_REEVALUATION_CONSOLIDANTE', -ecartsReevaluation);
  agregat.set('RESERVES_GROUPE', -reservesGroupe);
  agregat.set('INTERETS_MINORITAIRES', -imHorsResultat);

  const lignes: LigneConsolidee[] = [...agregat.entries()]
    .filter(([, s]) => Math.abs(s) > 0.005)
    .map(([cle, solde]) => {
      const poste = cle in LIBELLE_POSTE;
      return { cle, solde, poste, intitule: poste ? LIBELLE_POSTE[cle as PosteConsolidation] : (intitules.get(cle) ?? cle) };
    })
    .sort((a, b) => Number(a.poste) - Number(b.poste) || a.cle.localeCompare(b.cle));
  const equilibre = r2(lignes.reduce((s, l) => s + l.solde, 0));
  const resultatEnsemble = r2(-lignes.filter((l) => estResultat13(l.cle) || estGestion(l.cle)).reduce((s, l) => s + l.solde, 0));

  return {
    lignes,
    capitauxPropres: {
      capital,
      primes,
      ecartsReevaluation,
      reservesGroupe,
      resultatGroupe,
      interetsMinoritairesHorsResultat: imHorsResultat,
      resultatMinoritaires,
      resultatEnsemble,
    },
    ecarts,
    avertissements,
    equilibre,
    mouvements: [...mouvements.entries()]
      .map(([cle, m]) => ({ cle, intitule: intitules.get(cle) ?? cle, ...m }))
      .sort((a, b) => a.cle.localeCompare(b.cle)),
    obstaclesFlux,
    dividendesRecusMe: r2(dividendesRecusMe),
    ecartsEvaluationStocksResultat: r2(ecartsEvaluationStocksResultat),
    ecartsEvaluation,
    impotsDifferesIncomplets,
  };
}
