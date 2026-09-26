import { ResultatCumul } from '../consolidation/cumul-consolidation';
import { construireEtatsIfrs, RefusIfrs, RetraitementDeclare } from './etats-ifrs';
import { construireEtatsIfrsConsolides, motifRefusRegleConsolidation, POSTES_A_DECLARER, POSTES_RANGES } from './etats-ifrs-consolides';
import { motifRefusRegle } from './rubriques-ifrs';

/**
 * ÉTATS IFRS CONSOLIDÉS · une balance consolidée du D4C chiffrée à la main.
 * Actif · immobilisations 1 000, trésorerie 200, écart d'acquisition 100 amorti
 * de 20 · soit 1 280. Passif · fournisseurs 300. Résultat de l'ensemble · 900
 * de ventes, 600 d'achats, 10 de dotation de l'écart d'acquisition · 290, dont
 * 40 aux minoritaires. Capitaux propres hors résultat · capital 500, réserves
 * consolidées 130, intérêts minoritaires 60.
 */
const L = (cle: string, solde: number, poste = !/^\d/.test(cle)) => ({ cle, intitule: `Ligne ${cle}`, solde, poste });
const cumul = (extra: ReturnType<typeof L>[] = [], cp: Partial<ResultatCumul['capitauxPropres']> = {}): ResultatCumul =>
  ({
    lignes: [
      L('24100000', 1000), L('52100000', 200), L('40100000', -300), L('70100000', -900), L('60100000', 600),
      L('ECART_ACQUISITION', 100), L('AMORTISSEMENT_ECART_ACQUISITION', -20), L('DOTATION_ECART_ACQUISITION', 10),
      L('CAPITAL', -500), L('RESERVES_GROUPE', -130), L('INTERETS_MINORITAIRES', -60),
      ...extra,
    ],
    capitauxPropres: {
      capital: 500, primes: 0, ecartsReevaluation: 0, reservesGroupe: 130, ecartsConversion: 0,
      resultatGroupe: 250, interetsMinoritairesHorsResultat: 60, resultatMinoritaires: 40, resultatEnsemble: 290, ...cp,
    },
    conversions: [],
  }) as unknown as ResultatCumul;
const REGLES = [
  { prefixe: '24', rubrique: 'SF_IMMOBILISATIONS_CORPORELLES' }, { prefixe: '52', rubrique: 'SF_TRESORERIE' },
  { prefixe: '40', rubrique: 'SF_FOURNISSEURS' }, { prefixe: '70', rubrique: 'PL_PRODUITS' }, { prefixe: '60', rubrique: 'PL_ACHATS_CONSOMMES' },
];
const DOTATION = [{ poste: 'DOTATION_ECART_ACQUISITION', rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES' }];
const EX = { dateDebut: new Date('2026-01-01') };
const ANNULATION: RetraitementDeclare = {
  id: 'g',
  libelle: 'Annulation de l’amortissement de l’écart d’acquisition',
  fondement: 'IFRS 3 § B63 a, IAS 36 § 90',
  lignes: [
    { rubrique: 'SF_GOODWILL', montant: 20 },
    { rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: -10 },
    { rubrique: 'SF_RESERVES', montant: -10 },
  ],
  partMinoritairesResultat: 0,
  partMinoritairesCapitauxPropres: 0,
};
const jouer = (retr: RetraitementDeclare[] = [], c = cumul(), regles = DOTATION) => construireEtatsIfrsConsolides(EX, c, REGLES, regles, retr, 'AUCUNE');
const X = (xs: { cle: string }[], cle: string) => xs.find((x) => x.cle === cle) as any;

describe('IFRS consolidés · la balance du D4C projetée, la part des minoritaires répartie', () => {
  const e = jouer();

  it('§ 104 · capitaux propres des propriétaires, puis participations ne donnant pas le contrôle, et l’état boucle', () => {
    expect(X(e.situation, 'SF_GOODWILL').ifrs).toBe(80);
    expect(X(e.situation, 'SF_RESULTAT')).toMatchObject({ legal: 250, ifrs: 250 });
    // 500 + 130 + 250 = 880 aux propriétaires ; 60 + 40 = 100 aux minoritaires.
    expect(X(e.situation, 'TOTAL_CAPITAUX_PROPRES_PROPRIETAIRES').ifrs).toBe(880);
    expect(X(e.situation, 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatchObject({ legal: 100, retraitements: 0, ifrs: 100 });
    expect(X(e.situation, 'TOTAL_CAPITAUX_PROPRES').ifrs).toBe(980);
    expect(X(e.situation, 'TOTAL_ACTIF').ifrs).toBe(1280);
    expect(e.controles.every((c) => c.ok)).toBe(true);
    const cp = e.situation.map((l) => l.cle);
    expect(cp.indexOf('TOTAL_CAPITAUX_PROPRES_PROPRIETAIRES')).toBeLessThan(cp.indexOf('SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE'));
  });

  it('§ 76 et § 87 · le résultat net et le résultat global répartis sous leur total', () => {
    expect(X(e.resultat, 'RESULTAT_NET').ifrs).toBe(290);
    expect(X(e.resultat, 'RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').ifrs).toBe(40);
    expect(X(e.resultat, 'RN_PROPRIETAIRES').ifrs).toBe(250);
    const cles = e.resultat.map((l) => l.cle);
    expect(cles.slice(-3)).toEqual(['RESULTAT_NET', 'RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', 'RN_PROPRIETAIRES']);
    expect(X(e.resultatGlobal, 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').ifrs).toBe(40);
    expect(X(e.resultatGlobal, 'RG_PROPRIETAIRES').ifrs).toBe(250);
  });

  it('une consolidation D4C incomplète rend le jeu IFRS non publiable, avec son motif', () => {
    const c = { ...cumul(), impotsDifferesIncomplets: ['Filiale B · taux non déclaré'], conversionsIncompletes: ['Filiale C · monnaie non déclarée'] } as ResultatCumul;
    const m = jouer([ANNULATION], c).motifsNonPubliable;
    expect(m).toContain('Consolidation · impôts différés incomplets · Filiale B · taux non déclaré');
    expect(m).toContain('Consolidation · conversion · Filiale C · monnaie non déclarée');
  });

  it('les postes rangés par IFRS 18 et les postes déclarés sont rendus avec leur rubrique', () => {
    expect(e.postes.find((p) => p.poste === 'ECART_ACQUISITION')).toMatchObject({ rubrique: 'SF_GOODWILL', declare: false });
    expect(e.postes.find((p) => p.poste === 'DOTATION_ECART_ACQUISITION')).toMatchObject({ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', declare: true });
    expect(X(e.resultat, 'PL_AUTRES_CHARGES_OPERATIONNELLES').legal).toBe(-10);
  });

  it('IFRS 3 § B63 a · l’amortissement de l’écart d’acquisition rend le jeu non publiable tant qu’il n’est pas retraité', () => {
    expect(e.motifsNonPubliable.some((m) => /AUDCIF art\. 82 · IFRS 3 § B63 a/.test(m))).toBe(true);
    const r = jouer([ANNULATION]);
    expect(r.motifsNonPubliable.some((m) => /IFRS 3 § B63 a/.test(m))).toBe(false);
    // Goodwill 100, résultat 300 dont 260 aux propriétaires, réserves 140.
    expect(X(r.situation, 'SF_GOODWILL').ifrs).toBe(100);
    expect(X(r.resultat, 'RESULTAT_NET').ifrs).toBe(300);
    expect(X(r.resultat, 'RN_PROPRIETAIRES').ifrs).toBe(260);
    expect(X(r.situation, 'SF_RESERVES').ifrs).toBe(140);
    expect(X(r.situation, 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').ifrs).toBe(100);
    expect(r.controles.every((c) => c.ok)).toBe(true);
  });

  it('IFRS 10 § B94 · la part déclarée des minoritaires passe des propriétaires aux minoritaires, sans rien changer au total', () => {
    const depreciation: RetraitementDeclare = {
      id: 'd',
      libelle: 'Dépréciation d’un équipement de la filiale',
      fondement: 'IAS 36 § 59',
      lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 30 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -30 }, { rubrique: 'SF_RESERVES', montant: 5 }, { rubrique: 'SF_TRESORERIE', montant: -5 }],
      partMinoritairesResultat: -12,
      partMinoritairesCapitauxPropres: -2,
    };
    const r = jouer([ANNULATION, depreciation]);
    // Résultat 300 − 30 = 270 ; minoritaires 40 − 12 = 28 ; propriétaires 242.
    expect(X(r.resultat, 'RESULTAT_NET').ifrs).toBe(270);
    expect(X(r.resultat, 'RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatchObject({ legal: 40, retraitements: -12, ifrs: 28 });
    expect(X(r.resultat, 'RN_PROPRIETAIRES').ifrs).toBe(242);
    // Minoritaires · 60 + 28 − 2 = 86 ; réserves 140 − 5 + 2 = 137.
    expect(X(r.situation, 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatchObject({ legal: 100, retraitements: -14, ifrs: 86 });
    // La colonne des retraitements porte le transfert, pas seulement le total · 10 − 5 + 2.
    expect(X(r.situation, 'SF_RESERVES')).toMatchObject({ legal: 130, retraitements: 7, ifrs: 137 });
    expect(X(r.resultatGlobal, 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').ifrs).toBe(28);
    expect(r.controles.every((c) => c.ok)).toBe(true);
  });

  it('§ 87 · la part des minoritaires d’un autre élément du résultat global leur est attribuée, et retirée aux propriétaires', () => {
    const reevaluation: RetraitementDeclare = {
      id: 'o',
      libelle: 'Réévaluation d’un terrain de la filiale',
      fondement: 'IAS 16 § 39',
      lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 50 }, { rubrique: 'OCI_NR_AUTRES', montant: -50 }],
      partMinoritairesOci: 10,
    };
    const r = jouer([reevaluation]);
    // Résultat global 290 + 50 = 340 ; minoritaires 40 + 10 = 50 ; propriétaires 290.
    expect(X(r.resultatGlobal, 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatchObject({ legal: 40, retraitements: 10, ifrs: 50 });
    expect(X(r.resultatGlobal, 'RG_PROPRIETAIRES')).toMatchObject({ legal: 250, retraitements: 40, ifrs: 290 });
    expect(X(r.situation, 'SF_OCI_EXERCICE').ifrs).toBe(40);
    expect(X(r.situation, 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').ifrs).toBe(110);
    expect(X(r.situation, 'TOTAL_CAPITAUX_PROPRES').ifrs).toBe(1030);
    expect(r.controles.every((c) => c.ok)).toBe(true);
  });

  it('un effet sans sa part des minoritaires, une part de trop ou de signe contraire, est refusé', () => {
    const base: RetraitementDeclare = { ...ANNULATION, partMinoritairesResultat: null };
    expect(() => jouer([base])).toThrow(/effet au résultat net \(10\).*IFRS 10 § B94/);
    expect(() => jouer([{ ...ANNULATION, partMinoritairesResultat: 11 }])).toThrow(/ne le dépasse pas/);
    expect(() => jouer([{ ...ANNULATION, partMinoritairesResultat: -3 }])).toThrow(/a le signe de l’effet/);
    expect(() => jouer([{ ...ANNULATION, partMinoritairesOci: 1 }])).toThrow(/sans effet aux autres éléments/);
    expect(() => jouer([{ ...ANNULATION, lignes: [{ rubrique: 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', montant: 5 }, { rubrique: 'SF_RESERVES', montant: -5 }] }])).toThrow(RefusIfrs);
  });

  it('en comptes individuels, une part des minoritaires est refusée et la rubrique n’existe pas', () => {
    const b = [{ numero: '24100000', intitule: 'x', solde: 10 }, { numero: '10100000', intitule: 'y', solde: -10 }];
    const r = [{ prefixe: '24', rubrique: 'SF_IMMOBILISATIONS_CORPORELLES' }, { prefixe: '10', rubrique: 'SF_CAPITAL' }];
    expect(() => construireEtatsIfrs(EX, b, r, [{ ...ANNULATION, partMinoritairesResultat: 0, partMinoritairesCapitauxPropres: null }], 'AUCUNE')).toThrow(/n’existe que dans les comptes consolidés/);
    expect(construireEtatsIfrs(EX, b, r, [], 'AUCUNE').situation.some((l) => l.cle === 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toBe(false);
    // Hors consolidation, une clé de poste n'est pas un compte des classes 1 à 8 · écartée comme la classe 9, jamais lue comme un poste.
    const avecCle = construireEtatsIfrs(EX, [...b, { numero: 'ECART_ACQUISITION', intitule: 'z', solde: 5 }], r, [], 'AUCUNE');
    expect(avecCle.nonClasses).toEqual([]);
    expect(X(avecCle.situation, 'TOTAL_ACTIF').ifrs).toBe(10);
    expect(motifRefusRegle('10', 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatch(/IFRS 10 § 22/);
  });
});

describe('IFRS consolidés · ce que le D4C porte autrement', () => {
  it('IFRS 3 § 34 · un écart d’acquisition négatif étalé rend le jeu non publiable tant qu’il n’est pas soldé', () => {
    const c = cumul([L('ECART_ACQUISITION_NEGATIF', -50), L('RESERVES_GROUPE_BIS', 50, true)]);
    const e = jouer([], c, [...DOTATION, { poste: 'ECART_ACQUISITION_NEGATIF', rubrique: 'SF_PROVISIONS_NC' }]);
    expect(e.motifsNonPubliable.some((m) => /IFRS 3 § 34/.test(m))).toBe(true);
    const solde: RetraitementDeclare = {
      id: 'n', libelle: 'Profit d’acquisition', fondement: 'IFRS 3 § 34',
      lignes: [{ rubrique: 'SF_PROVISIONS_NC', montant: 50 }, { rubrique: 'SF_RESERVES', montant: -50 }], partMinoritairesCapitauxPropres: 0,
    };
    expect(jouer([solde], c, [...DOTATION, { poste: 'ECART_ACQUISITION_NEGATIF', rubrique: 'SF_PROVISIONS_NC' }]).motifsNonPubliable.some((m) => /IFRS 3 § 34/.test(m))).toBe(false);
  });

  it('IAS 21 § 39 c · des écarts de conversion rendent le jeu non publiable', () => {
    const c = cumul([L('ECARTS_CONVERSION', -15), L('60200000', 15)]);
    expect(jouer([ANNULATION], c).motifsNonPubliable.some((m) => /IAS 21 § 39 c/.test(m))).toBe(true);
    expect(jouer([ANNULATION]).motifsNonPubliable.some((m) => /IAS 21/.test(m))).toBe(false);
  });

  it('IAS 21 § 39 c et § 41 · la variation de l’exercice passe en OCI, la part des minoritaires leur est attribuée', () => {
    // Cumul N · groupe 15, minoritaires 5, dont 4 nés d'une mise en
    // équivalence. N-1 · 10, 3 et 1. Variation · groupe 5, minoritaires 2,
    // mises en équivalence 3.
    const n = cumul([L('ECARTS_CONVERSION', -15), L('INTERETS_MINORITAIRES', -5), L('24100000', 20)], { ecartsConversion: 15, ecartsConversionMinoritaires: 5, ecartsConversionMe: 4, interetsMinoritairesHorsResultat: 65 });
    (n as any).conversions = [{ entite: 'Filiale' }];
    const n1 = cumul([], { ecartsConversion: 10, ecartsConversionMinoritaires: 3, ecartsConversionMe: 1 });
    (n1 as any).conversions = [{ entite: 'Filiale' }];
    const e = construireEtatsIfrsConsolides(EX, n, REGLES, DOTATION, [ANNULATION], 'AUCUNE', { cumulPrecedent: n1, changements: [] });
    expect(X(e.resultatGlobal, 'OCI_R_AUTRES').legal).toBe(4);
    expect(X(e.resultatGlobal, 'OCI_R_QUOTE_PART_MEE').legal).toBe(3);
    expect(X(e.resultatGlobal, 'TOTAL_OCI').legal).toBe(7);
    expect(X(e.resultatGlobal, 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').legal).toBe(42);
    expect(X(e.resultatGlobal, 'RG_PROPRIETAIRES').legal).toBe(255);
    // Le cumul de N-1 reste en composante, la variation revient par l'OCI de l'exercice.
    expect(X(e.situation, 'SF_AUTRES_COMPOSANTES_CP').legal).toBe(10);
    expect(X(e.situation, 'SF_OCI_EXERCICE').legal).toBe(5);
    expect(X(e.situation, 'TOTAL_CAPITAUX_PROPRES_PROPRIETAIRES').legal).toBe(895);
    expect(X(e.situation, 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').legal).toBe(105);
    expect(X(e.situation, 'TOTAL_CAPITAUX_PROPRES').legal).toBe(1000);
    expect(e.controles.every((c) => c.ok)).toBe(true);
    expect(e.motifsNonPubliable.some((m) => /IAS 21/.test(m))).toBe(false);
    expect(e.mentions.some((m) => /IAS 21 § 39 c/.test(m) && /§ 41/.test(m))).toBe(true);

    // Sans consolidation N-1, rien n'est reclassé, et c'est dit.
    const sans = construireEtatsIfrsConsolides(EX, n, REGLES, DOTATION, [ANNULATION], 'AUCUNE', { cumulPrecedent: null, changements: [] });
    expect(X(sans.resultatGlobal, 'TOTAL_OCI').legal).toBe(0);
    expect(X(sans.situation, 'SF_AUTRES_COMPOSANTES_CP').legal).toBe(15);
    expect(sans.motifsNonPubliable.some((m) => /IAS 21 § 39 c/.test(m) && /exercice précédent/.test(m))).toBe(true);

    // Une entrée ne gêne pas ; un changement sur une entité non convertie non plus.
    const entree = construireEtatsIfrsConsolides(EX, n, REGLES, DOTATION, [ANNULATION], 'AUCUNE', {
      cumulPrecedent: n1,
      changements: [{ nom: 'Filiale', nature: 'ENTREE' }, { nom: 'Autre', nature: 'SORTIE' }],
    });
    expect(X(entree.resultatGlobal, 'TOTAL_OCI').legal).toBe(7);
    // Une sortie (§ 48) ou un changement de pourcentage (IFRS 10 § B96) d'une entité convertie ne se sépare pas.
    const sortie = construireEtatsIfrsConsolides(EX, n, REGLES, DOTATION, [ANNULATION], 'AUCUNE', { cumulPrecedent: n1, changements: [{ nom: ' filiale ', nature: 'SORTIE' }] });
    expect(X(sortie.resultatGlobal, 'TOTAL_OCI').legal).toBe(0);
    expect(sortie.motifsNonPubliable.some((m) => /IAS 21 § 48/.test(m))).toBe(true);
    const pct = construireEtatsIfrsConsolides(EX, n, REGLES, DOTATION, [ANNULATION], 'AUCUNE', { cumulPrecedent: n1, changements: [{ nom: 'Filiale', nature: 'POURCENTAGE' }] });
    expect(X(pct.resultatGlobal, 'TOTAL_OCI').legal).toBe(0);
    expect(pct.motifsNonPubliable.some((m) => /IFRS 10 § B96/.test(m))).toBe(true);
  });

  it('un poste à déclarer qui ne l’est pas est nommé, et reste sur la ligne « sans rubrique »', () => {
    const e = jouer([], cumul(), []);
    expect(e.motifsNonPubliable).toContain('Poste de consolidation « Dotations aux amortissements et dépréciations de l’écart d’acquisition » sans rubrique IFRS · déclarez la ligne où il se range.');
    expect(X(e.resultat, 'PL_NON_CLASSES').ifrs).toBe(-10);
  });

  it('les règles de postes · seuls les postes à déclarer, vers le bon état, jamais les minoritaires', () => {
    expect(motifRefusRegleConsolidation('ECART_ACQUISITION', 'SF_GOODWILL')).toMatch(/rangé par IFRS 18 elle-même/);
    expect(motifRefusRegleConsolidation('RESULTAT_DEJA_CONSTATE', 'PL_PRODUITS')).toMatch(/n’est pas un poste de consolidation qui se déclare/);
    expect(motifRefusRegleConsolidation('ELIMINATION_RESULTATS_INTERNES', 'SF_STOCKS')).toMatch(/est du résultat/);
    expect(motifRefusRegleConsolidation('PRIMES_CONSOLIDANTE', 'PL_PRODUITS')).toMatch(/est du bilan/);
    expect(motifRefusRegleConsolidation('PRIMES_CONSOLIDANTE', 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE')).toMatch(/IFRS 10 § 22/);
    expect(motifRefusRegleConsolidation('PRIMES_CONSOLIDANTE', 'OCI_R_AUTRES')).toMatch(/autre élément du résultat global/);
    expect(motifRefusRegleConsolidation('PRIMES_CONSOLIDANTE', 'SF_RESERVES')).toBeNull();
    expect(() => jouer([], cumul(), [{ poste: 'ECART_ACQUISITION', rubrique: 'SF_GOODWILL' }])).toThrow(RefusIfrs);
    // Aucun poste n'est à la fois rangé et déclaré.
    expect(POSTES_A_DECLARER.filter((p) => p in POSTES_RANGES)).toEqual([]);
  });

  it('le résultat projeté est contrôlé contre le résultat de l’ensemble du D4C', () => {
    const e = jouer([], cumul([], { resultatEnsemble: 300 }));
    expect(e.controles.find((c) => c.cle === 'RESULTAT_ENSEMBLE')).toMatchObject({ ok: false, ecart: -10 });
  });
});
