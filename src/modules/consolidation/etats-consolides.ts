import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { CompteDuPoste, LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import type {
  PosteBilanCalcule,
  ResolutionBilan,
  ResolutionCompteResultat,
} from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { ResultatCumul } from './cumul-consolidation';

/**
 * ÉTATS CONSOLIDÉS · bilan et compte de résultat au modèle du D4C, ch. XII-8
 * § 2 et § 3, lus sur la balance CONSOLIDÉE de la tranche 2.
 *
 * LA CORRESPONDANCE POSTES/COMPTES N'EST PAS RÉÉCRITE. Le D4C ne donne aucune
 * table de comptes pour ses modèles · il regroupe des postes. Les montants
 * sont donc lus par la résolution INDIVIDUELLE du SYSCOHADA (AUDCIF Titre IX
 * ch. 7), appliquée à la balance consolidée, puis regroupés au modèle
 * consolidé. Une seconde table aurait divergé de la première au premier
 * correctif, et les deux bilans seraient plausibles chacun de leur côté.
 *
 * LES POSTES CRÉÉS PAR LA CONSOLIDATION (écart d'acquisition, titres mis en
 * équivalence, capitaux propres partagés) sont lus sur leurs CLÉS, jamais sur
 * un numéro · le D4C n'impose aucun plan (ch. XII-5 § 2).
 *
 * TROIS SORTES DE LIGNES QUE LE MODÈLE NE PORTE PAS, DITES COMME TELLES.
 * (1) Ce que le D4C porte et qu'OmegaX ne calcule pas encore · écarts de
 * conversion des entités étrangères (tranche 4c), « dont » des immobilisations
 * corporelles, résultat par action · montant `null`, jamais zéro : un zéro se
 * lit « il n'y en a pas ». (2) Ce que le modèle individuel porte et que le
 * modèle consolidé ne prévoit pas · quote-part de résultat partagé (AUDCIF
 * Titre VIII ch. 33) et participation des travailleurs · une ligne propre,
 * plutôt que de la fondre dans un poste voisin sans le dire. (3) Ce qui doit
 * être RETRAITÉ avant publication (ch. XII-3 § 2) · écarts de conversion des
 * comptes individuels, provisions réglementées, comptes sans poste · montrés
 * et comptés, pour que le bilan boucle et que rien ne disparaisse, mais ils
 * rendent l'état NON PUBLIABLE.
 */

export type NatureLigne = 'POSTE' | 'DETAIL' | 'TOTAL' | 'A_RETRAITER';

export interface LigneEtatConsolide {
  /** Identifiant stable · c'est lui, jamais le rang, qui apparie N et N-1. */
  cle: string;
  libelle: string;
  nature: NatureLigne;
  brut?: number | null;
  amortissement?: number | null;
  /** `null` · non calculé, la raison est dans `reserve`. */
  net: number | null;
  netN1?: number | null;
  /** D'où vient le montant, quand ce n'est pas l'évidence du libellé. */
  lecture?: string;
  reserve?: string;
}

export interface ControleEtatConsolide {
  cle: string;
  libelle: string;
  ecart: number;
  ok: boolean;
}

export interface EtatsConsolides {
  bilan: { actif: LigneEtatConsolide[]; passif: LigneEtatConsolide[] };
  compteDeResultat: LigneEtatConsolide[];
  controles: ControleEtatConsolide[];
  publiable: boolean;
  motifsNonPubliable: string[];
}

/** La résolution individuelle, fournie par le service des états SYSCOHADA. */
export interface Resolveurs {
  bilan(lignes: LigneBalancePourEtat[]): { resolution: ResolutionBilan; nonRattaches: CompteDuPoste[] };
  compteResultat(lignes: LigneBalancePourEtat[]): ResolutionCompteResultat;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const EPS = 0.005;
const RESERVE_CONVERSION = 'Calculé avec la tranche 4c (conversion des entités étrangères) · non calculé ici, et non nul pour autant.';

/**
 * Participations et créances RATTACHÉES · le D4C les réunit dans un poste,
 * quand le modèle individuel range les créances rattachées au 27 (AS). Lues
 * au plan semé · 277 « Créances rattachées à des participations et avances à
 * des GIE », 2767 « Créances rattachées à des participations » (intérêts
 * courus), et leur dépréciation 2977.
 */
const CREANCES_RATTACHEES = ['277', '2767'];
const DEPRECIATION_CREANCES_RATTACHEES = ['2977'];

const classeDe = (numero: string): ClasseCompte | null => {
  const c = `CLASSE_${numero[0]}` as ClasseCompte;
  return Object.values(ClasseCompte).includes(c) ? c : null;
};

/** Une balance consolidée vue comme une balance individuelle · seulement les clés qui SONT des comptes. */
export function lignesPourResolution(cumul: ResultatCumul): LigneBalancePourEtat[] {
  const lignes: LigneBalancePourEtat[] = [];
  for (const l of cumul.lignes) {
    if (!/^\d/.test(l.cle)) continue;
    const classe = classeDe(l.cle);
    if (!classe) continue;
    const debit = l.solde > 0 ? l.solde : 0;
    const credit = l.solde < 0 ? -l.solde : 0;
    lignes.push({
      compteId: l.cle,
      numero: l.cle,
      intitule: l.intitule,
      classe,
      typeCompte: TypeCompteDetailTotal.DETAIL,
      totalDebit: debit,
      totalCredit: credit,
      reportDebit: 0,
      reportCredit: 0,
      mouvementDebit: debit,
      mouvementCredit: credit,
      solde: l.solde,
    });
  }
  return lignes;
}

const somme = (xs: (number | null | undefined)[]) => r2(xs.reduce<number>((s, x) => s + (x ?? 0), 0));

export function construireEtatsConsolides(cumul: ResultatCumul, resolveurs: Resolveurs): EtatsConsolides {
  const lignes = lignesPourResolution(cumul);
  const { resolution, nonRattaches } = resolveurs.bilan(lignes);
  const cr = resolveurs.compteResultat(lignes);
  const P = (ref: string): PosteBilanCalcule | undefined => resolution.parRef.get(ref);
  const net = (ref: string) => r2(P(ref)?.montant ?? 0);
  const k = (cle: string) => cumul.lignes.find((l) => l.cle === cle)?.solde ?? 0;
  const cp = cumul.capitauxPropres;

  // Comptes que le bilan individuel ne capte pas · classes 1 à 5 sans poste,
  // et classe 9, hors états. Au sens de leur solde, pour que le bilan boucle.
  const sansPoste = [...nonRattaches, ...lignes.filter((l) => l.classe === ClasseCompte.CLASSE_9).map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }))];
  const sansPosteDebiteur = somme(sansPoste.filter((c) => c.montant > 0).map((c) => c.montant));
  const sansPosteCrediteur = somme(sansPoste.filter((c) => c.montant < 0).map((c) => -c.montant));
  const listeSansPoste = (signe: 1 | -1) =>
    sansPoste
      .filter((c) => signe * c.montant > 0)
      .map((c) => c.numero)
      .join(', ');

  // ─── ACTIF ────────────────────────────────────────────────────────────────
  const ecartBrut = r2(k('ECART_ACQUISITION'));
  const ecartAmort = r2(-(k('AMORTISSEMENT_ECART_ACQUISITION') + k('DEPRECIATION_ECART_ACQUISITION')));
  const ad = P('AD');
  const ai = P('AI');
  const ap = P('AP');
  const ar = P('AR');
  const as = P('AS');
  const brutRattache = somme((as?.comptesBrut ?? []).filter((c) => CREANCES_RATTACHEES.some((p) => c.numero.startsWith(p))).map((c) => c.montant));
  const amortRattache = somme(
    (as?.comptes ?? []).filter((c) => DEPRECIATION_CREANCES_RATTACHEES.some((p) => c.numero.startsWith(p))).map((c) => -c.montant),
  );
  const partBrut = somme([ar?.brut, brutRattache]);
  const partAmort = somme([ar?.amortissement, amortRattache]);
  const pretsBrut = r2((as?.brut ?? 0) - brutRattache);
  const pretsAmort = r2((as?.amortissement ?? 0) - amortRattache);
  const tme = r2(k('TITRES_MIS_EN_EQUIVALENCE'));

  const ligneActif = (cle: string, libelle: string, nature: NatureLigne, brut: number, amort: number, extra: Partial<LigneEtatConsolide> = {}): LigneEtatConsolide => ({
    cle,
    libelle,
    nature,
    brut: r2(brut),
    amortissement: r2(amort),
    net: r2(brut - amort),
    ...extra,
  });

  const incorporelles = ligneActif('IMMOBILISATIONS_INCORPORELLES', 'Immobilisations incorporelles', 'TOTAL', ecartBrut + (ad?.brut ?? 0), ecartAmort + (ad?.amortissement ?? 0));
  const corporelles = ligneActif('IMMOBILISATIONS_CORPORELLES', 'Immobilisations corporelles', 'POSTE', ai?.brut ?? 0, ai?.amortissement ?? 0);
  const avances = ligneActif('AVANCES_IMMOBILISATIONS', 'Avances et acomptes versés sur immobilisations', 'POSTE', ap?.brut ?? 0, ap?.amortissement ?? 0);
  const financieres = ligneActif('IMMOBILISATIONS_FINANCIERES', 'Immobilisations financières', 'TOTAL', tme + partBrut + pretsBrut, partAmort + pretsAmort);
  // IMPÔTS DIFFÉRÉS · art. 89, « en faisant distinctement apparaître […] les
  // impôts différés ». Montrés tels que calculés, actif et passif SÉPARÉS ·
  // le D4C ne dit rien d'une compensation. Incomplets, ils le disent sur la
  // ligne et l'état cesse d'être publiable · jamais un zéro muet.
  const reserveId = cumul.impotsDifferesIncomplets.length > 0 ? `Incomplets · ${cumul.impotsDifferesIncomplets.join(' ; ')}` : undefined;
  const ida = ligneActif('IMPOTS_DIFFERES_ACTIF', 'Actifs d’impôts différés', 'POSTE', k('IMPOTS_DIFFERES_ACTIF'), 0, {
    lecture: 'Écarts d’évaluation, marges internes éliminées et impôts différés déclarés des comptes individuels (art. 92).',
    reserve: reserveId,
  });
  const totalImmobilise = ligneActif(
    'TOTAL_ACTIF_IMMOBILISE',
    'TOTAL ACTIF IMMOBILISÉ',
    'TOTAL',
    somme([incorporelles.brut, corporelles.brut, avances.brut, financieres.brut, ida.brut]),
    somme([incorporelles.amortissement, corporelles.amortissement, avances.amortissement, financieres.amortissement]),
  );
  const bb = P('BB');
  const stocks = ligneActif('STOCKS', 'Stocks', 'POSTE', bb?.brut ?? 0, bb?.amortissement ?? 0);
  const bi = P('BI');
  const clients = ligneActif('CLIENTS', 'Clients', 'DETAIL', bi?.brut ?? 0, bi?.amortissement ?? 0);
  const autresCr = ['BH', 'BJ', 'BA'].map(P);
  const autresCreances = ligneActif(
    'AUTRES_CREANCES',
    'Autres créances',
    'DETAIL',
    somme(autresCr.map((p) => p?.brut)),
    somme(autresCr.map((p) => p?.amortissement)),
    { lecture: 'Postes individuels BH (fournisseurs, avances versées), BJ (autres créances) et BA (actif circulant HAO) · le modèle consolidé n’a pas de ligne HAO, lecture déclarée.' },
  );
  const creances = ligneActif('CREANCES', 'Créances et emplois assimilés', 'TOTAL', somme([clients.brut, autresCreances.brut]), somme([clients.amortissement, autresCreances.amortissement]));
  const totalCirculant = ligneActif('TOTAL_ACTIF_CIRCULANT', 'TOTAL ACTIF CIRCULANT', 'TOTAL', somme([stocks.brut, creances.brut]), somme([stocks.amortissement, creances.amortissement]));
  const bt = P('BT');
  const tresoActif = ligneActif('TRESORERIE_ACTIF', 'TOTAL TRÉSORERIE-ACTIF', 'TOTAL', bt?.brut ?? 0, bt?.amortissement ?? 0);
  const bu = ligneActif('ECART_CONVERSION_ACTIF_INDIVIDUEL', 'Écarts de conversion-Actif des comptes individuels', 'A_RETRAITER', net('BU'), 0, {
    reserve: 'À éliminer avant consolidation (D4C, ch. XII-3 § 2) · un écart de conversion individuel n’est pas un actif du groupe.',
  });
  const sansPosteActif = ligneActif('COMPTES_SANS_POSTE_ACTIF', 'Comptes débiteurs sans poste', 'A_RETRAITER', sansPosteDebiteur, 0, {
    reserve: sansPosteDebiteur > EPS ? `Comptes ${listeSansPoste(1)} · aucun poste du bilan ne les capte.` : undefined,
  });
  const totalActif = ligneActif(
    'TOTAL_GENERAL_ACTIF',
    'TOTAL GÉNÉRAL',
    'TOTAL',
    somme([totalImmobilise.brut, totalCirculant.brut, tresoActif.brut, bu.brut, sansPosteActif.brut]),
    somme([totalImmobilise.amortissement, totalCirculant.amortissement, tresoActif.amortissement]),
  );

  const actif: LigneEtatConsolide[] = [
    incorporelles,
    ligneActif('ECART_ACQUISITION', 'Écart d’acquisition', 'DETAIL', ecartBrut, ecartAmort, {
      lecture: 'Amortissements et dépréciations de l’écart réunis · art. 82, la dépréciation n’est jamais reprise.',
    }),
    ligneActif('AUTRES_INCORPORELLES', 'Autres immobilisations incorporelles', 'DETAIL', ad?.brut ?? 0, ad?.amortissement ?? 0),
    corporelles,
    { cle: 'DONT_IMMEUBLE_PLACEMENT', libelle: 'dont immeuble de placement', nature: 'DETAIL', net: null, reserve: 'Non calculé · aucun compte du plan ne distingue l’immeuble de placement.' },
    { cle: 'DONT_LOCATION_ACQUISITION', libelle: 'dont location acquisition', nature: 'DETAIL', net: null, reserve: 'Non calculé · le bien pris en location acquisition se loge au même compte que le bien acquis.' },
    avances,
    financieres,
    ligneActif('TITRES_MIS_EN_EQUIVALENCE', 'Titres mis en équivalence', 'DETAIL', tme, 0),
    ligneActif('PARTICIPATIONS_CREANCES_RATTACHEES', 'Participations et créances rattachées', 'DETAIL', partBrut, partAmort, {
      lecture: 'Titres non consolidés (26, dépréciation 296) et créances rattachées (277 et 2767, dépréciation 2977).',
    }),
    ligneActif('PRETS_ET_AUTRES', 'Prêts et autres immobilisations financières', 'DETAIL', pretsBrut, pretsAmort),
    ida,
    totalImmobilise,
    stocks,
    creances,
    clients,
    autresCreances,
    totalCirculant,
    tresoActif,
    ...[bu, sansPosteActif].filter((l) => Math.abs(l.net ?? 0) > EPS),
    totalActif,
  ];

  // ─── PASSIF ───────────────────────────────────────────────────────────────
  const lp = (cle: string, libelle: string, nature: NatureLigne, montant: number | null, extra: Partial<LigneEtatConsolide> = {}): LigneEtatConsolide => ({
    cle,
    libelle,
    nature,
    net: montant == null ? null : r2(montant),
    ...extra,
  });
  const capital = lp('CAPITAL', 'Capital', 'POSTE', -k('CAPITAL'), { lecture: 'Comptes 101 à 104 et 109 de l’entité consolidante.' });
  const primesReserves = lp('PRIMES_RESERVES_CONSOLIDEES', 'Primes et réserves consolidées', 'POSTE', -(k('PRIMES_CONSOLIDANTE') + k('RESERVES_GROUPE')), {
    lecture: 'Primes (105) de la consolidante, ses réserves et report à nouveau, et la part du groupe dans les capitaux propres des entités consolidées depuis leur entrée.',
  });
  const ecartsConv = lp('ECARTS_CONVERSION', 'Écarts de conversion', 'POSTE', null, { reserve: RESERVE_CONVERSION });
  const resultatConsolidante = lp('RESULTAT_CONSOLIDANTE', 'Résultat net (part de l’entité consolidante)', 'POSTE', cp.resultatGroupe);
  const autresCp = lp('AUTRES_CAPITAUX_PROPRES', 'Autres capitaux propres', 'POSTE', -k('ECARTS_REEVALUATION_CONSOLIDANTE'), {
    lecture: 'Écarts de réévaluation (106) de la consolidante · lecture déclarée, le D4C ne rattache aucun compte à ce poste.',
  });
  const partConsolidante = lp('PART_CONSOLIDANTE', 'Part de l’entité consolidante', 'TOTAL', somme([capital.net, primesReserves.net, resultatConsolidante.net, autresCp.net]));
  const partMinoritaires = lp('PART_MINORITAIRES', 'Part des minoritaires', 'POSTE', -k('INTERETS_MINORITAIRES') + cp.resultatMinoritaires, {
    lecture: 'Intérêts minoritaires dans les capitaux propres et dans le résultat.',
  });
  const totalCp = lp('TOTAL_CAPITAUX_PROPRES', 'Total capitaux propres de l’ensemble consolidé', 'TOTAL', somme([partConsolidante.net, partMinoritaires.net]));
  const subventions = lp('SUBVENTIONS_INVESTISSEMENT', 'Subventions d’investissement', 'POSTE', net('CL'), {
    lecture: 'Rubrique spécifique, non assimilée aux capitaux propres (D4C, ch. XII-8 § 2).',
    reserve:
      Math.abs(net('CL')) > EPS
        ? 'Le ch. XII-3 § 2 fait par ailleurs reclasser les subventions en produits constatés d’avance avant consolidation · les deux paragraphes ne disent pas la même chose, et le texte ne les articule pas.'
        : undefined,
  });
  const emprunts = lp('EMPRUNTS', 'Emprunts et dettes financières', 'DETAIL', net('DA'));
  const location = lp('DETTES_LOCATION_ACQUISITION', 'Dettes de location acquisition', 'DETAIL', net('DB'));
  const provisions = lp('PROVISIONS', 'Provisions pour risques et charges', 'DETAIL', net('DC') - k('PROVISION_ME_NEGATIVE'), {
    lecture: 'Provisions des entités intégrées, et quote-part négative d’une entité mise en équivalence quand le groupe est tenu de ne pas s’en désengager.',
  });
  const ecartNegatif = lp('ECART_ACQUISITION_NEGATIF', 'Écart d’acquisition négatif', 'DETAIL', -k('ECART_ACQUISITION_NEGATIF'), {
    lecture: 'Poste particulier de passif (art. 82), net de la part déjà rapportée au résultat.',
  });
  const idp = lp('IMPOTS_DIFFERES_PASSIF', 'Passifs d’impôts différés', 'DETAIL', -k('IMPOTS_DIFFERES_PASSIF'), {
    lecture: 'Écarts d’évaluation et impôts différés déclarés des comptes individuels · jamais sur l’écart d’acquisition (D4C ch. XII-3 § 3).',
    reserve: reserveId,
  });
  const totalDettesFin = lp('TOTAL_DETTES_FINANCIERES', 'Total dettes financières et ressources assimilées', 'TOTAL', somme([emprunts.net, location.net, provisions.net, ecartNegatif.net, idp.net]));
  const ressourcesStables = lp('TOTAL_RESSOURCES_STABLES', 'TOTAL RESSOURCES STABLES', 'TOTAL', somme([totalCp.net, subventions.net, totalDettesFin.net]));
  const fournisseurs = lp('FOURNISSEURS', 'Fournisseurs et comptes rattachés', 'DETAIL', net('DJ'));
  const autresDettes = lp('AUTRES_DETTES', 'Autres dettes', 'DETAIL', somme(['DH', 'DI', 'DK', 'DM', 'DN'].map(net)), {
    lecture: 'Postes individuels DH (dettes HAO), DI (clients, avances reçues), DK, DM et DN (fiscales, sociales et autres) · le modèle consolidé n’a pas de ligne HAO, lecture déclarée.',
  });
  const totalPassifCirculant = lp('TOTAL_PASSIF_CIRCULANT', 'TOTAL PASSIF CIRCULANT', 'TOTAL', somme([fournisseurs.net, autresDettes.net]));
  const tresoPassif = lp('TRESORERIE_PASSIF', 'TOTAL TRÉSORERIE-PASSIF', 'TOTAL', net('DT'));
  const cm = lp('PROVISIONS_REGLEMENTEES', 'Provisions réglementées des comptes individuels', 'A_RETRAITER', net('CM'), {
    reserve: 'À contre-passer avant consolidation (D4C, ch. XII-3 § 2) · elles n’ont de cause que fiscale.',
  });
  const dv = lp('ECART_CONVERSION_PASSIF_INDIVIDUEL', 'Écarts de conversion-Passif des comptes individuels', 'A_RETRAITER', net('DV'), {
    reserve: 'À éliminer avant consolidation (D4C, ch. XII-3 § 2).',
  });
  const sansPostePassif = lp('COMPTES_SANS_POSTE_PASSIF', 'Comptes créditeurs sans poste', 'A_RETRAITER', sansPosteCrediteur, {
    reserve: sansPosteCrediteur > EPS ? `Comptes ${listeSansPoste(-1)} · aucun poste du bilan ne les capte.` : undefined,
  });
  const aRetraiterPassif = [cm, dv, sansPostePassif].filter((l) => Math.abs(l.net ?? 0) > EPS);
  const totalPassif = lp('TOTAL_GENERAL_PASSIF', 'TOTAL GÉNÉRAL', 'TOTAL', somme([ressourcesStables.net, totalPassifCirculant.net, tresoPassif.net, ...aRetraiterPassif.map((l) => l.net)]));

  const passif: LigneEtatConsolide[] = [
    capital,
    primesReserves,
    ecartsConv,
    resultatConsolidante,
    autresCp,
    partConsolidante,
    partMinoritaires,
    totalCp,
    subventions,
    emprunts,
    location,
    provisions,
    ...(Math.abs(ecartNegatif.net ?? 0) > EPS ? [ecartNegatif] : []),
    idp,
    totalDettesFin,
    ressourcesStables,
    fournisseurs,
    autresDettes,
    totalPassifCirculant,
    tresoPassif,
    ...aRetraiterPassif,
    totalPassif,
  ];

  // ─── COMPTE DE RÉSULTAT ───────────────────────────────────────────────────
  // Montants signés comme au modèle individuel · produits positifs, charges
  // négatives (credit − débit). Une clé de consolidation porte un solde
  // débiteur positif, d'où le signe inversé.
  const m = (...refs: string[]) => somme(refs.map((ref) => cr.montantsParRef[ref]));
  const lc = (cle: string, libelle: string, nature: NatureLigne, montant: number | null, extra: Partial<LigneEtatConsolide> = {}): LigneEtatConsolide => ({
    cle,
    libelle,
    nature,
    net: montant == null ? null : r2(montant),
    ...extra,
  });
  const ca = lc('CHIFFRE_AFFAIRES', 'Chiffre d’affaires', 'TOTAL', m('TA', 'TB', 'TC', 'TD'));
  const autresProduits = lc('AUTRES_PRODUITS_EXPLOITATION', 'Autres produits d’exploitation', 'POSTE', m('TE', 'TF', 'TG', 'TH', 'TI'));
  const achats = lc('ACHATS_CONSOMMES', 'Achats consommés', 'POSTE', m('RA', 'RB', 'RC', 'RD', 'RE', 'RF'), { lecture: 'Achats et variations de stocks (RA à RF).' });
  const servicesExt = lc('SERVICES_EXTERIEURS', 'Services extérieurs', 'POSTE', m('RG', 'RH'), { lecture: 'Transports (RG) et services extérieurs (RH).' });
  const impotsTaxes = lc('IMPOTS_TAXES', 'Impôts et taxes', 'POSTE', m('RI'));
  const autresCharges = lc('AUTRES_CHARGES', 'Autres charges', 'POSTE', m('RJ'));
  const va = lc('VALEUR_AJOUTEE', 'VALEUR AJOUTÉE', 'TOTAL', somme([ca.net, autresProduits.net, achats.net, servicesExt.net, impotsTaxes.net, autresCharges.net]));
  const personnel = lc('CHARGES_PERSONNEL', 'Charges de personnel', 'POSTE', m('RK'));
  const ebe = lc('EXCEDENT_BRUT_EXPLOITATION', 'EXCÉDENT BRUT D’EXPLOITATION', 'TOTAL', somme([va.net, personnel.net]));
  const reprises = lc('REPRISES', 'Reprises d’amortissements, provisions et dépréciations', 'POSTE', m('TJ') - k('REPRISE_ECART_ACQUISITION_NEGATIF'), {
    lecture: 'Reprises des entités intégrées (TJ) et écart d’acquisition négatif rapporté au résultat.',
  });
  const dotations = lc('DOTATIONS', 'Dotations aux amortissements, provisions et dépréciations', 'POSTE', m('RL') - k('DOTATION_ECART_ACQUISITION'), {
    lecture: 'Dotations des entités intégrées (RL) et amortissement et dépréciation de l’écart d’acquisition.',
  });
  const quotePartPartage = lc('QUOTE_PART_RESULTAT_PARTAGE', 'Quote-part de résultat partagé', 'POSTE', m('RQP', 'TQP'), {
    lecture: 'Ligne du modèle individuel complété (AUDCIF Titre VIII ch. 33) que le modèle consolidé ne porte pas · montrée plutôt que fondue.',
  });
  const eliminationInterne = lc('ELIMINATION_RESULTATS_INTERNES', 'Élimination des résultats internes (art. 86, 4°)', 'POSTE', -k('ELIMINATION_RESULTATS_INTERNES'), {
    lecture:
      'Marges internes incluses dans les stocks et immobilisations à la clôture, moins celles de l’ouverture · une ligne propre, parce que la marge ' +
      'éliminée peut venir d’une vente, d’une cession HAO ou d’une production immobilisée, et qu’aucun texte ne dit sur laquelle la présenter.',
  });
  const ecartsEvaluation = lc('ECARTS_EVALUATION_RESULTAT', 'Écarts d’évaluation rapportés au résultat', 'POSTE', -k('ECARTS_EVALUATION_RESULTAT'), {
    lecture:
      'Amortissement de l’écart d’évaluation d’une immobilisation, et écart d’un stock vendu ou d’un élément sorti · une ligne propre, parce qu’il ' +
      'relève tantôt des dotations, tantôt du coût des ventes, et qu’aucun texte ne dit sur laquelle le présenter.',
  });
  const rex = lc('RESULTAT_EXPLOITATION', 'RÉSULTAT D’EXPLOITATION (A)', 'TOTAL', somme([ebe.net, reprises.net, dotations.net, quotePartPartage.net, eliminationInterne.net, ecartsEvaluation.net]));
  const prodFin = lc('PRODUITS_FINANCIERS', 'Produits financiers', 'POSTE', m('TK', 'TL', 'TM'));
  const chFin = lc('CHARGES_FINANCIERES', 'Charges financières', 'POSTE', m('RM', 'RN'));
  const rfin = lc('RESULTAT_FINANCIER', 'RÉSULTAT FINANCIER (B)', 'TOTAL', somme([prodFin.net, chFin.net]));
  const rao = lc('RESULTAT_ACTIVITES_ORDINAIRES', 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (C = A + B)', 'TOTAL', somme([rex.net, rfin.net]));
  const prodHao = lc('PRODUITS_HAO', 'Produits HAO', 'POSTE', m('TN', 'TO'));
  const chHao = lc('CHARGES_HAO', 'Charges HAO', 'POSTE', m('RO', 'RP'));
  const rhao = lc('RESULTAT_HAO', 'RÉSULTAT HAO (D)', 'TOTAL', somme([prodHao.net, chHao.net]));
  const rai = lc('RESULTAT_AVANT_IMPOTS', 'RÉSULTAT AVANT IMPÔTS (E = C + D)', 'TOTAL', somme([rao.net, rhao.net]));
  const participation = lc('PARTICIPATION_TRAVAILLEURS', 'Participation des travailleurs', 'POSTE', m('RQ'), {
    lecture: 'Poste du modèle individuel (RQ) que le modèle consolidé ne porte pas · montré plutôt que fondu dans les impôts.',
  });
  const impotsExigibles = lc('IMPOTS_EXIGIBLES', 'Impôts exigibles sur résultat', 'POSTE', m('RS'));
  const impotsDifferes = lc('IMPOTS_DIFFERES', 'Impôts différés', 'POSTE', -k('IMPOTS_DIFFERES_RESULTAT'), { reserve: reserveId });
  const dejaConstate = lc('RESULTAT_DEJA_CONSTATE', 'Résultat porté au compte 13 dans les comptes individuels', 'A_RETRAITER', -k('RESULTAT_DEJA_CONSTATE'), {
    reserve: 'Balance reçue APRÈS clôture · le résultat n’est pas ventilé par nature, et le compte de résultat consolidé ne peut pas l’être non plus. Demander la balance avant clôture.',
  });
  const nonVentiles = somme(cr.comptesNonRattaches.map((c) => c.montant));
  const gestionSansPoste = lc('COMPTES_GESTION_SANS_POSTE', 'Comptes de gestion sans poste', 'A_RETRAITER', nonVentiles, {
    reserve: nonVentiles !== 0 ? `Comptes ${cr.comptesNonRattaches.map((c) => c.numero).join(', ')} · aucun poste du compte de résultat ne les capte.` : undefined,
  });
  const aRetraiterCr = [dejaConstate, gestionSansPoste].filter((l) => Math.abs(l.net ?? 0) > EPS);
  const rei = lc(
    'RESULTAT_ENTITES_INTEGREES',
    'RÉSULTAT NET DES ENTITÉS INTÉGRÉES',
    'TOTAL',
    somme([rai.net, participation.net, impotsExigibles.net, impotsDifferes.net, ...aRetraiterCr.map((l) => l.net)]),
  );
  const partMe = lc('PART_RESULTATS_ME', 'Part dans les résultats nets des entités mises en équivalence', 'POSTE', -k('QUOTE_PART_RESULTAT_ME'));
  const ensemble = lc('RESULTAT_ENSEMBLE', 'RÉSULTAT NET DE L’ENSEMBLE CONSOLIDÉ', 'TOTAL', somme([rei.net, partMe.net]));

  const compteDeResultat: LigneEtatConsolide[] = [
    ca,
    lc('VENTES_MARCHANDISES', 'Ventes de marchandises', 'DETAIL', m('TA')),
    lc('VENTES_PRODUITS_FABRIQUES', 'Ventes de produits fabriqués', 'DETAIL', m('TB')),
    lc('TRAVAUX_SERVICES_VENDUS', 'Travaux, services vendus', 'DETAIL', m('TC')),
    lc('PRODUITS_ACCESSOIRES', 'Produits accessoires', 'DETAIL', m('TD')),
    autresProduits,
    achats,
    servicesExt,
    impotsTaxes,
    autresCharges,
    va,
    personnel,
    ebe,
    reprises,
    dotations,
    ...(Math.abs(quotePartPartage.net ?? 0) > EPS ? [quotePartPartage] : []),
    ...(Math.abs(eliminationInterne.net ?? 0) > EPS ? [eliminationInterne] : []),
    ...(Math.abs(ecartsEvaluation.net ?? 0) > EPS ? [ecartsEvaluation] : []),
    rex,
    prodFin,
    chFin,
    rfin,
    rao,
    prodHao,
    chHao,
    rhao,
    rai,
    ...(Math.abs(participation.net ?? 0) > EPS ? [participation] : []),
    impotsExigibles,
    impotsDifferes,
    ...aRetraiterCr,
    rei,
    partMe,
    ensemble,
    lc('RESULTAT_MINORITAIRES', 'Part des minoritaires', 'POSTE', cp.resultatMinoritaires),
    lc('RESULTAT_CONSOLIDANTE_CR', 'Part de l’entité consolidante', 'POSTE', cp.resultatGroupe),
    lc('RESULTAT_PAR_ACTION', 'Résultat de base et dilué par action', 'POSTE', null, {
      reserve: 'Non calculé · il demande le nombre moyen pondéré d’actions ordinaires et les actions potentielles dilutives, qu’aucune table ne tient.',
    }),
  ];

  // ─── CONTRÔLES ────────────────────────────────────────────────────────────
  const controle = (cle: string, libelle: string, a: number | null, b: number | null): ControleEtatConsolide => {
    const ecart = r2((a ?? 0) - (b ?? 0));
    return { cle, libelle, ecart, ok: Math.abs(ecart) <= EPS };
  };
  const controles = [
    controle('BILAN_EQUILIBRE', 'Total de l’actif net = total du passif', totalActif.net, totalPassif.net),
    controle('RESULTAT_CR_CUMUL', 'Résultat de l’ensemble au compte de résultat = résultat du cumul', ensemble.net, cp.resultatEnsemble),
    controle('RESULTAT_PARTAGE', 'Part de la consolidante + part des minoritaires = résultat de l’ensemble', cp.resultatGroupe + cp.resultatMinoritaires, ensemble.net),
  ];

  const motifsNonPubliable = [
    'Conversion des entités étrangères non traitée (tranche 4c) · OmegaX ne sait pas encore dire si une entité du périmètre tient ses comptes dans une autre monnaie (art. 87, D4C ch. XII-4).',
    ...cumul.impotsDifferesIncomplets.map((m) => `Impôts différés incomplets · ${m}`),
    ...[...actif, ...passif, ...compteDeResultat]
      .filter((l) => l.nature === 'A_RETRAITER')
      .map((l) => `${l.libelle} · ${l.reserve ?? 'à retraiter'}`),
    ...controles.filter((c) => !c.ok).map((c) => `Contrôle en échec · ${c.libelle} (écart ${c.ecart}).`),
  ];

  return {
    bilan: { actif, passif },
    compteDeResultat,
    controles,
    publiable: motifsNonPubliable.length === 0,
    motifsNonPubliable,
  };
}

/** Appariement N / N-1 PAR CLÉ · une ligne propre à un seul exercice ne décale jamais les autres. */
export function apparierN1(n: LigneEtatConsolide[], n1: LigneEtatConsolide[] | null): LigneEtatConsolide[] {
  const parCle = new Map((n1 ?? []).map((l) => [l.cle, l.net]));
  return n.map((l) => ({ ...l, netN1: n1 == null ? null : (parCle.has(l.cle) ? parCle.get(l.cle)! : 0) }));
}
