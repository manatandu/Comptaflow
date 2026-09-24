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
 * - les ÉCARTS D'ÉVALUATION (ch. XII-6 § 1) · ils donnent tous lieu à impôt
 *   différé, et vont avec la tranche 4 ;
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
}

export interface OperationReciproque {
  entiteAId: string;
  compteA: string;
  entiteBId: string;
  compteB: string;
  montant: number;
  libelle: string;
}

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
  | 'RESERVES_GROUPE'
  | 'INTERETS_MINORITAIRES'
  | 'RESULTAT_DEJA_CONSTATE';

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
  RESERVES_GROUPE: 'Réserves consolidées',
  INTERETS_MINORITAIRES: 'Intérêts minoritaires (hors résultat)',
  RESULTAT_DEJA_CONSTATE: 'Résultat déjà porté au compte 13 dans les comptes individuels',
};

/** Les postes qui sont du résultat · le reste est du bilan. */
const POSTES_DE_RESULTAT = new Set<PosteConsolidation>([
  'DOTATION_ECART_ACQUISITION',
  'REPRISE_ECART_ACQUISITION_NEGATIF',
  'QUOTE_PART_RESULTAT_ME',
  'RESULTAT_DEJA_CONSTATE',
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
    capital: number;
    reservesGroupe: number;
    resultatGroupe: number;
    interetsMinoritairesHorsResultat: number;
    resultatMinoritaires: number;
    resultatEnsemble: number;
  };
  ecarts: EcartCalcule[];
  avertissements: string[];
  equilibre: number;
}

export class RefusConsolidation extends Error {}

const r2 = (x: number) => Math.round(x * 100) / 100;
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

export function cumulerConsolidation(
  exercice: { dateDebut: Date; dateFin: Date },
  entites: EntiteACumuler[],
  acquisitions: AcquisitionDeclaree[],
  reciproques: OperationReciproque[],
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
    if (!e.estConsolidante && e.methode !== 'ME' && e.balance.some((l) => /^1[45]/.test(l.numero) && Math.abs(l.solde) > 0.005)) {
      avertissements.push(
        `« ${e.nom} » porte des soldes aux comptes 14 ou 15 · les subventions d’investissement se reclassent en produits constatés ` +
          'd’avance et les provisions réglementées se contre-passent avant consolidation (D4C, ch. XII-3 § 2). La balance reçue doit être retraitée.',
      );
    }
  }

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
    for (const l of e.balance!) {
      m.set(l.numero, r2((m.get(l.numero) ?? 0) + l.solde * f));
      if (!intitules.has(l.numero) || e.estConsolidante) intitules.set(l.numero, l.intitule);
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

  // ─── 2. Élimination des titres, écarts, mise en équivalence, dividendes ───
  const ecarts: EcartCalcule[] = [];
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
    const quotePart = r2(d * a.capitauxPropresEntree);
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

  // ─── 3. Partage des capitaux propres ──────────────────────────────────────
  // Groupe · pourcentage d'intérêt ; minoritaires · le complément (ch. XII-5
  // § 7, consolidation directe). Pour une entité intégrée proportionnellement,
  // les montants sont déjà à la fraction : la part du groupe y est
  // intérêt ÷ fraction, le reste revient aux minoritaires de la détentrice.
  let capital = 0;
  let reservesGroupe = 0;
  let resultatGroupe = 0;
  let imHorsResultat = 0;
  let resultatMinoritaires = 0;
  const agregat = new Map<string, number>();
  for (const [id, m] of comptes) {
    const e = parId.get(id)!;
    let cpCapital = 0;
    let cpAutres = 0;
    let res = 0;
    for (const [cle, solde] of m) {
      if (estCpHorsResultat(cle)) {
        if (cle.startsWith('10')) cpCapital -= solde;
        else cpAutres -= solde;
      } else if (estResultat13(cle) || estGestion(cle)) res -= solde;
    }
    const g = e.estConsolidante ? 1 : e.pctInteret / 100 / fraction.get(id)!;
    if (e.estConsolidante) {
      capital += cpCapital;
      reservesGroupe += cpAutres;
    } else {
      reservesGroupe += g * (cpCapital + cpAutres);
      imHorsResultat += (1 - g) * (cpCapital + cpAutres);
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
  reservesGroupe = r2(reservesGroupe);
  imHorsResultat = r2(imHorsResultat);
  resultatGroupe = r2(resultatGroupe);
  resultatMinoritaires = r2(resultatMinoritaires);
  agregat.set('CAPITAL', -capital);
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
      reservesGroupe,
      resultatGroupe,
      interetsMinoritairesHorsResultat: imHorsResultat,
      resultatMinoritaires,
      resultatEnsemble,
    },
    ecarts,
    avertissements,
    equilibre,
  };
}
