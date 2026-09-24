import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { AcquisitionDeclaree, cumulerConsolidation, EntiteACumuler, LigneBalanceEntree } from './cumul-consolidation';
import { apparierN1, construireEtatsConsolides, EtatsConsolides, LigneEtatConsolide, Resolveurs } from './etats-consolides';

/**
 * ÉTATS CONSOLIDÉS · les totaux sont ceux des corrigés du cours de
 * consolidation CPCC (Bamba Makola, ch. 3), recalculés à la main dans chaque
 * commentaire. La résolution des postes est la VRAIE, celle du bilan
 * individuel · ses deux dépendances ne servent qu'à charger des balances,
 * ce que ce moteur ne fait pas.
 */
const svc = new EtatsFinanciersSyscohadaService(null as never, null as never);
const R: Resolveurs = {
  bilan: (l) => svc.resoudreBilanSurLignes(l),
  compteResultat: (l) => svc.resoudreCompteResultatSurLignes(l),
};

const EX21 = { dateDebut: new Date('2021-01-01'), dateFin: new Date('2021-12-31') };
const entree = new Date('2021-01-01');
const b = (lignes: [string, number][]): LigneBalanceEntree[] => lignes.map(([numero, solde]) => ({ numero, intitule: numero, solde }));
const ent = (id: string, methode: EntiteACumuler['methode'], pct: number, balance: LigneBalanceEntree[], estConsolidante = false): EntiteACumuler => ({
  id,
  nom: id,
  estConsolidante,
  methode,
  pctInteret: pct,
  balance,
});
const acq = (d: string, t: string, pct: number, cout: number, cp: number, extra: Partial<AcquisitionDeclaree> = {}): AcquisitionDeclaree => ({
  detentriceId: d,
  detenueId: t,
  pctCapital: pct,
  coutAcquisition: cout,
  compteTitres: '26100000',
  dateEntree: entree,
  capitauxPropresEntree: cp,
  modeDureeEcart: 'NON_DETERMINABLE',
  ...extra,
});
const L = (lignes: LigneEtatConsolide[], cle: string) => {
  const l = lignes.find((x) => x.cle === cle);
  if (!l) throw new Error(`ligne ${cle} absente`);
  return l;
};
const actif = (e: EtatsConsolides, cle: string) => L(e.bilan.actif, cle).net;
const passif = (e: EtatsConsolides, cle: string) => L(e.bilan.passif, cle).net;
const cr = (e: EtatsConsolides, cle: string) => L(e.compteDeResultat, cle).net;

const ginger = (titres: [string, number][], ac: number) =>
  ent('GINGER', 'IG', 100, b([['24100000', 2700000], ...titres, ['52100000', ac], ['10100000', -2000000], ['11800000', -500000], ['70100000', -8000000], ['60100000', 7900000], ['40100000', -400000]]), true);
const bleuCiel = (methode: 'IG' | 'IP', pct: number) =>
  ent('BLEU CIEL', methode, pct, b([['24100000', 200000], ['52100000', 110000], ['10100000', -100000], ['11800000', -80000], ['70100000', -900000], ['60100000', 870000], ['40100000', -100000]]));

describe('oracle A · intégration globale à 55 %', () => {
  const cumul = cumulerConsolidation(EX21, [ginger([['26100000', 55000]], 245000), bleuCiel('IG', 55)], [acq('GINGER', 'BLEU CIEL', 55, 55000, 100000)], []);
  const e = construireEtatsConsolides(cumul, R);

  it('bilan · total 3 255 000 des deux côtés', () => {
    // Actif · 2 700 000 + 200 000 d'immobilisations, 245 000 + 110 000 de banque.
    expect(actif(e, 'IMMOBILISATIONS_CORPORELLES')).toBe(2900000);
    expect(actif(e, 'TRESORERIE_ACTIF')).toBe(355000);
    expect(actif(e, 'TOTAL_GENERAL_ACTIF')).toBe(3255000);
    expect(passif(e, 'TOTAL_GENERAL_PASSIF')).toBe(3255000);
  });

  it('passif · capital, réserves consolidées, résultat du groupe, minoritaires, dettes', () => {
    expect(passif(e, 'CAPITAL')).toBe(2000000);
    expect(passif(e, 'PRIMES_RESERVES_CONSOLIDEES')).toBe(544000);
    expect(passif(e, 'RESULTAT_CONSOLIDANTE')).toBe(116500);
    expect(passif(e, 'PART_CONSOLIDANTE')).toBe(2660500);
    expect(passif(e, 'PART_MINORITAIRES')).toBe(94500);
    expect(passif(e, 'TOTAL_CAPITAUX_PROPRES')).toBe(2755000);
    expect(passif(e, 'FOURNISSEURS')).toBe(500000);
  });

  it('compte de résultat · 130 000 pour l’ensemble, partagé 116 500 / 13 500', () => {
    // Ventes 8 000 000 + 900 000 ; achats 7 900 000 + 870 000.
    expect(cr(e, 'CHIFFRE_AFFAIRES')).toBe(8900000);
    expect(cr(e, 'ACHATS_CONSOMMES')).toBe(-8770000);
    expect(cr(e, 'RESULTAT_ENSEMBLE')).toBe(130000);
    expect(cr(e, 'RESULTAT_CONSOLIDANTE_CR')).toBe(116500);
    expect(cr(e, 'RESULTAT_MINORITAIRES')).toBe(13500);
  });

  it('les trois contrôles bouclent', () => {
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });

  it('les impôts différés sont NON CALCULÉS, jamais zéro, et l’état n’est pas publiable pour autant', () => {
    expect(L(e.bilan.actif, 'IMPOTS_DIFFERES_ACTIF').net).toBeNull();
    expect(L(e.bilan.passif, 'IMPOTS_DIFFERES_PASSIF').net).toBeNull();
    expect(L(e.compteDeResultat, 'IMPOTS_DIFFERES').net).toBeNull();
    expect(e.publiable).toBe(false);
    expect(e.motifsNonPubliable[0]).toMatch(/tranche 4/);
  });
});

describe('oracle B · intégration proportionnelle à 50 %', () => {
  const cumul = cumulerConsolidation(EX21, [ginger([['26200000', 50000]], 250000), bleuCiel('IP', 50)], [
    acq('GINGER', 'BLEU CIEL', 50, 50000, 100000, { compteTitres: '26200000' }),
  ], []);
  const e = construireEtatsConsolides(cumul, R);

  it('bilan · total 3 105 000, aucun minoritaire', () => {
    // 2 700 000 + 100 000 ; 250 000 + 55 000.
    expect(actif(e, 'TOTAL_GENERAL_ACTIF')).toBe(3105000);
    expect(passif(e, 'TOTAL_GENERAL_PASSIF')).toBe(3105000);
    expect(passif(e, 'PART_MINORITAIRES')).toBe(0);
    expect(cr(e, 'RESULTAT_ENSEMBLE')).toBe(115000);
  });
});

describe('oracle C · mise en équivalence à 25 %', () => {
  const gm = ent('GINGER', 'IG', 100, b([['24100000', 1950000], ['26300000', 50000], ['26800000', 10000], ['52100000', 2750000], ['10100000', -1000000], ['11800000', -975000], ['13100000', -275000], ['19100000', -250000], ['40100000', -2260000]]), true);
  const bc = ent('BLEU CIEL', 'ME', 25, b([['24100000', 400000], ['52100000', 460000], ['10100000', -200000], ['11800000', -180000], ['13100000', -60000], ['40100000', -420000]]));
  const cumul = cumulerConsolidation(EX21, [gm, bc], [acq('GINGER', 'BLEU CIEL', 25, 50000, 200000, { compteTitres: '26300000' })], []);
  const e = construireEtatsConsolides(cumul, R);

  it('bilan · total 4 820 000, titres mis en équivalence 110 000, GECAMINES reste en participations', () => {
    // 1 950 000 + 110 000 + 10 000 + 2 750 000.
    expect(actif(e, 'TITRES_MIS_EN_EQUIVALENCE')).toBe(110000);
    expect(actif(e, 'PARTICIPATIONS_CREANCES_RATTACHEES')).toBe(10000);
    expect(actif(e, 'TOTAL_GENERAL_ACTIF')).toBe(4820000);
    expect(passif(e, 'TOTAL_GENERAL_PASSIF')).toBe(4820000);
    expect(passif(e, 'PROVISIONS')).toBe(250000);
  });

  it('un résultat porté au 13 n’est pas ventilé · il est montré, compté, et rend l’état non publiable', () => {
    // Résultat de la mère 275 000 au 13 ; quote-part ME 25 % × 60 000 = 15 000.
    expect(cr(e, 'RESULTAT_DEJA_CONSTATE')).toBe(275000);
    expect(cr(e, 'PART_RESULTATS_ME')).toBe(15000);
    expect(cr(e, 'RESULTAT_ENSEMBLE')).toBe(290000);
    expect(e.motifsNonPubliable.join(' ')).toMatch(/APRÈS clôture/);
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });
});

describe('oracle D et E · chaîne AMOR → BOUMAT → KONGO CEMENT', () => {
  const amor = ent('AMOR', 'IG', 100, b([['24100000', 400000], ['26100000', 150000], ['31100000', 100000], ['10100000', -450000], ['11800000', -100000], ['13100000', -50000], ['40100000', -50000]]), true);
  const boumat = ent('BOUMAT', 'IG', 80, b([['24100000', 200000], ['26100000', 50000], ['31100000', 20000], ['10100000', -150000], ['11800000', -50000], ['13100000', -50000], ['40100000', -20000]]));
  const kc = ent('KONGO CEMENT', 'IG', 48, b([['24100000', 100000], ['31100000', 40000], ['10100000', -80000], ['11800000', -20000], ['13100000', -10000], ['40100000', -30000]]));
  const cumul = cumulerConsolidation(EX21, [amor, boumat, kc], [
    acq('AMOR', 'BOUMAT', 80, 150000, 187500),
    acq('BOUMAT', 'KONGO CEMENT', 60, 50000, 83333.33),
  ], []);
  const e = construireEtatsConsolides(cumul, R);

  it('bilan · total 860 000, minoritaires 97 200', () => {
    // 700 000 d'immobilisations et 160 000 de stocks.
    expect(actif(e, 'STOCKS')).toBe(160000);
    expect(actif(e, 'TOTAL_GENERAL_ACTIF')).toBe(860000);
    expect(passif(e, 'TOTAL_GENERAL_PASSIF')).toBe(860000);
    expect(passif(e, 'PART_MINORITAIRES')).toBe(97200);
  });
});

describe('les postes que le modèle consolidé regroupe autrement que le modèle individuel', () => {
  const M = ent('M', 'IG', 100, b([
    ['26100000', 800],
    ['27710000', 300], // créance rattachée à une participation
    ['29770000', -50], // sa dépréciation
    ['27400000', 200], // prêt
    ['10110000', -1000],
    ['10900000', 100],
    ['10500000', -300],
    ['10600000', -200],
    ['11800000', -100],
    ['47800000', 40], // écart de conversion-actif individuel
    ['52100000', 210],
  ]), true);
  const F = ent('F', 'IG', 80, b([['24500000', 1000], ['10100000', -1000]]));
  const cumul = cumulerConsolidation({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }, [M, F], [
    acq('M', 'F', 80, 800, 1000, { dateEntree: new Date('2024-01-01') }),
  ], []);
  const e = construireEtatsConsolides(cumul, R);

  it('les créances rattachées rejoignent les participations, pas les prêts', () => {
    expect(L(e.bilan.actif, 'PARTICIPATIONS_CREANCES_RATTACHEES')).toMatchObject({ brut: 300, amortissement: 50, net: 250 });
    expect(L(e.bilan.actif, 'PRETS_ET_AUTRES')).toMatchObject({ brut: 200, amortissement: 0, net: 200 });
  });

  it('capital sans les primes ni la réévaluation ; primes avec les réserves ; réévaluation en autres capitaux propres', () => {
    expect(passif(e, 'CAPITAL')).toBe(900);
    expect(passif(e, 'PRIMES_RESERVES_CONSOLIDEES')).toBe(400); // 300 + 100, écart d'acquisition nul
    expect(passif(e, 'AUTRES_CAPITAUX_PROPRES')).toBe(200);
  });

  it('l’écart de conversion individuel est à retraiter · montré, compté, et le bilan boucle', () => {
    expect(L(e.bilan.actif, 'ECART_CONVERSION_ACTIF_INDIVIDUEL')).toMatchObject({ nature: 'A_RETRAITER', net: 40 });
    expect(e.controles.find((c) => c.cle === 'BILAN_EQUILIBRE')?.ok).toBe(true);
    expect(e.motifsNonPubliable.join(' ')).toMatch(/Écarts de conversion-Actif des comptes individuels/);
  });
});

describe('le comparatif N-1 s’apparie par clé', () => {
  const n: LigneEtatConsolide[] = [
    { cle: 'A', libelle: 'A', nature: 'POSTE', net: 10 },
    { cle: 'X', libelle: 'X', nature: 'A_RETRAITER', net: 5 },
    { cle: 'B', libelle: 'B', nature: 'POSTE', net: 20 },
    { cle: 'N', libelle: 'N', nature: 'POSTE', net: null },
  ];
  it('une ligne absente de N-1 vaut zéro, sans décaler les suivantes', () => {
    const n1: LigneEtatConsolide[] = [
      { cle: 'A', libelle: 'A', nature: 'POSTE', net: 7 },
      { cle: 'B', libelle: 'B', nature: 'POSTE', net: 17 },
      { cle: 'N', libelle: 'N', nature: 'POSTE', net: null },
    ];
    expect(apparierN1(n, n1).map((l) => l.netN1)).toEqual([7, 0, 17, null]);
  });
  it('sans exercice antérieur consolidé, la colonne est vide et non nulle', () => {
    expect(apparierN1(n, null).every((l) => l.netN1 === null)).toBe(true);
  });
});

describe('écart d’acquisition amorti ET déprécié', () => {
  // Coût 900, quote-part 0,8 × 1 000 = 800 · écart 100, dix ans depuis janvier
  // 2024 · 24 mois à l'ouverture (20), 36 à la clôture (30), dotation 10.
  // Dépréciation déclarée 10 à la clôture, 0 à l'ouverture.
  const M = ent('M', 'IG', 100, b([['26100000', 900], ['52100000', 100], ['10100000', -1000]]), true);
  const F = ent('F', 'IG', 80, b([['24500000', 1000], ['10100000', -1000]]));
  const cumul = cumulerConsolidation({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }, [M, F], [
    acq('M', 'F', 80, 900, 1000, { dateEntree: new Date('2024-01-01'), depreciationEcartCloture: 10 }),
  ], []);
  const e = construireEtatsConsolides(cumul, R);

  it('à l’actif · brut 100, amortissements et dépréciation 40, net 60', () => {
    expect(L(e.bilan.actif, 'ECART_ACQUISITION')).toMatchObject({ brut: 100, amortissement: 40, net: 60 });
    expect(L(e.bilan.actif, 'IMMOBILISATIONS_INCORPORELLES')).toMatchObject({ net: 60 });
  });

  it('au compte de résultat · la dotation de l’exercice, amortissement et dépréciation (10 + 10)', () => {
    expect(cr(e, 'DOTATIONS')).toBe(-20);
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });
});

describe('résultats internes au compte de résultat consolidé', () => {
  const M = ent('M', 'IG', 100, b([['26100000', 800], ['31100000', 300], ['52100000', 900], ['10100000', -1000], ['11800000', -500], ['70100000', -1000], ['60100000', 500]]), true);
  const F = ent('F', 'IG', 80, b([['31100000', 500], ['52100000', 1500], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));
  const cumul = cumulerConsolidation({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }, [M, F], [
    acq('M', 'F', 80, 800, 1000, { dateEntree: new Date('2024-01-01') }),
  ], [], [{ vendeuseId: 'F', acheteuseId: 'M', nature: 'STOCK', compteActif: '31100000', margeOuverture: 40, margeCloture: 100, libelle: 'x' }]);
  const e = construireEtatsConsolides(cumul, R);

  it('une ligne propre dans le résultat d’exploitation, stock net de la marge, et tout boucle', () => {
    // Stock 300 + 500 − 100 ; résultat 500 + 400 − 60.
    expect(cr(e, 'ELIMINATION_RESULTATS_INTERNES')).toBe(-60);
    expect(actif(e, 'STOCKS')).toBe(700);
    expect(cr(e, 'RESULTAT_ENSEMBLE')).toBe(840);
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });
});
