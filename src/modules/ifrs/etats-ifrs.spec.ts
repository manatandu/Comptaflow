import { construireEtatsIfrs, LigneLegale, RefusIfrs, RegleCorrespondance, RetraitementDeclare, rubriqueDuCompte } from './etats-ifrs';
import { motifRefusRegle, RUBRIQUES_IFRS } from './rubriques-ifrs';

/**
 * ÉTATS IFRS · chaque montant est chiffré à la main dans son commentaire.
 * Le cas · une balance SYSCOHADA de résultat 200, et un contrat de location
 * que le SYSCOHADA laisse en loyer (70) et qu'IFRS 16 porte au bilan · droit
 * d'utilisation 300 (§ 22), amorti de 60 (§ 31), charge d'intérêt 20 (§ 36),
 * le loyer de 70 venant réduire la dette.
 */
const b = (xs: [string, number][]): LigneLegale[] => xs.map(([numero, solde]) => ({ numero, intitule: numero, solde }));
const BALANCE = b([
  ['24100000', 1000], ['28410000', -200], ['31100000', 300], ['41100000', 750], ['52100000', 500],
  ['10100000', -1000], ['11800000', -300], ['16200000', -600], ['40100000', -250],
  ['70100000', -2070], ['60100000', 1200], ['66100000', 400], ['68100000', 100], ['62200000', 70], ['67100000', 50], ['89100000', 50],
]);
const R = (prefixe: string, rubrique: string): RegleCorrespondance => ({ prefixe, rubrique });
const REGLES = [
  R('24', 'SF_IMMOBILISATIONS_CORPORELLES'), R('284', 'SF_IMMOBILISATIONS_CORPORELLES'), R('31', 'SF_STOCKS'), R('41', 'SF_CREANCES_CLIENTS'),
  R('52', 'SF_TRESORERIE'), R('101', 'SF_CAPITAL'), R('11', 'SF_RESERVES'), R('16', 'SF_PASSIFS_FINANCIERS_NC'), R('40', 'SF_FOURNISSEURS'),
  R('70', 'PL_PRODUITS'), R('60', 'PL_ACHATS_CONSOMMES'), R('66', 'PL_CHARGES_PERSONNEL'), R('68', 'PL_AMORTISSEMENTS'),
  R('62', 'PL_AUTRES_CHARGES_OPERATIONNELLES'), R('67', 'PL_CHARGES_FINANCEMENT'), R('89', 'PL_IMPOT_RESULTAT'),
];
const LOCATION: RetraitementDeclare[] = [
  { id: 'a', libelle: 'Droit d’utilisation', fondement: 'IFRS 16 § 22 et § 26', lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 300 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -300 }] },
  {
    id: 'b',
    libelle: 'Amortissement, intérêt et loyer de l’exercice',
    fondement: 'IFRS 16 § 31 et § 36',
    lignes: [
      { rubrique: 'PL_AMORTISSEMENTS', montant: 60 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -60 },
      { rubrique: 'PL_CHARGES_FINANCEMENT', montant: 20 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -20 },
      { rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: -70 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: 70 },
    ],
  },
];
const EX26 = { dateDebut: new Date('2026-01-01') };
const jouer = (regles = REGLES, retr = LOCATION, activite: 'AUCUNE' | 'INVESTIR_ACTIFS' | 'FINANCER_CLIENTS' | null = 'AUCUNE', ex = EX26) =>
  construireEtatsIfrs(ex, BALANCE, regles, retr, activite);
const L = (xs: { cle: string }[], cle: string) => xs.find((x) => x.cle === cle) as any;

describe('états IFRS · projection de la balance légale et retraitements déclarés', () => {
  const e = jouer();

  it('compte de résultat par catégorie · sous-totaux des § 70 à 72', () => {
    // Opérationnel · SYSCOHADA 2 070 − 1 200 − 400 − 100 − 70 = 300 ; IFRS · amortissements 160, loyer 0 · 310.
    expect(L(e.resultat, 'RESULTAT_OPERATIONNEL')).toMatchObject({ legal: 300, retraitements: 10, ifrs: 310 });
    expect(L(e.resultat, 'RESULTAT_AVANT_FINANCEMENT_IMPOTS').ifrs).toBe(310);
    // Financement 50 + 20, impôt 50 · résultat net 190, contre 200 au SYSCOHADA.
    expect(L(e.resultat, 'PL_CHARGES_FINANCEMENT')).toMatchObject({ legal: -50, retraitements: -20, ifrs: -70 });
    expect(L(e.resultat, 'RESULTAT_NET')).toMatchObject({ legal: 200, retraitements: -10, ifrs: 190 });
  });

  it('état de la situation financière · courant et non courant, et il boucle', () => {
    // Corporelles 1 000 − 200 + 300 − 60 = 1 040 ; dette 600 + 300 + 20 − 70 = 850.
    expect(L(e.situation, 'SF_IMMOBILISATIONS_CORPORELLES')).toMatchObject({ legal: 800, retraitements: 240, ifrs: 1040 });
    expect(L(e.situation, 'SF_PASSIFS_FINANCIERS_NC').ifrs).toBe(850);
    expect(L(e.situation, 'SF_RESULTAT').ifrs).toBe(190);
    // Actif 1 040 + 300 + 750 + 500 = 2 590 ; capitaux propres 1 000 + 300 + 190 = 1 490, plus 850 et 250.
    expect(L(e.situation, 'TOTAL_ACTIF').ifrs).toBe(2590);
    expect(L(e.situation, 'TOTAL_CAPITAUX_PROPRES_PASSIF').ifrs).toBe(2590);
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });

  it('rapprochement SYSCOHADA → IFRS · résultat 200 → 190, capitaux propres 1 500 → 1 490', () => {
    expect(e.rapprochements).toEqual({
      resultatSyscohada: 200,
      retraitementsResultat: -10,
      resultatIfrs: 190,
      capitauxPropresSyscohada: 1500,
      retraitementsCapitauxPropres: -10,
      capitauxPropresIfrs: 1490,
    });
  });

  it('chaque poste dit les comptes qui le composent · le plus long préfixe l’emporte', () => {
    expect(L(e.situation, 'SF_IMMOBILISATIONS_CORPORELLES').comptes.map((c: any) => c.numero)).toEqual(['24100000', '28410000']);
    expect(rubriqueDuCompte('24110000', [R('2', 'SF_GOODWILL'), R('241', 'SF_IMMOBILISATIONS_CORPORELLES'), R('24', 'SF_STOCKS')])).toBe('SF_IMMOBILISATIONS_CORPORELLES');
  });

  it('un exercice ouvert avant 2027 applique IFRS 18 par anticipation, et le dit (§ C1)', () => {
    expect(e.mentions.join(' ')).toMatch(/par anticipation.*§ C1/);
    expect(jouer(REGLES, LOCATION, 'AUCUNE', { dateDebut: new Date('2027-01-01') }).mentions).toEqual([]);
  });

  it('le jeu reste non publiable · il lui manque le tableau des flux, les notes et la première application', () => {
    expect(e.motifsNonPubliable).toHaveLength(1);
    expect(e.motifsNonPubliable[0]).toMatch(/^Jeu incomplet · le tableau des flux de trésorerie \(IAS 7\), les notes et la première application \(IFRS 1\)/);
  });
});

describe('états IFRS · ce qui manque est montré, compté, et nommé', () => {
  it('un compte de bilan sans rubrique · montré, compté, et l’état boucle quand même', () => {
    const e = jouer(REGLES.filter((r) => r.prefixe !== '52'));
    expect(e.nonClasses).toEqual([{ numero: '52100000', intitule: '52100000', solde: 500 }]);
    expect(L(e.situation, 'SF_NON_CLASSES_ACTIF').ifrs).toBe(500);
    expect(e.controles.find((c) => c.cle === 'SITUATION_EQUILIBREE')?.ok).toBe(true);
    expect(e.motifsNonPubliable.join(' ')).toMatch(/1 compte\(s\) sans rubrique IFRS · 52100000/);
  });

  it('un compte de gestion sans rubrique reste dans le résultat opérationnel', () => {
    const e = jouer(REGLES.filter((r) => r.prefixe !== '66'));
    expect(L(e.resultat, 'PL_NON_CLASSES').ifrs).toBe(-400);
    expect(L(e.resultat, 'RESULTAT_NET').ifrs).toBe(190);
    expect(e.controles.every((c) => c.ok)).toBe(true);
  });

  it('activité principale · non déclarée ou financement de clients rend l’état non publiable ; investissement s’indique', () => {
    expect(jouer(REGLES, LOCATION, null).motifsNonPubliable.join(' ')).toMatch(/activité principale n’est pas déclarée/);
    expect(jouer(REGLES, LOCATION, 'FINANCER_CLIENTS').motifsNonPubliable.join(' ')).toMatch(/§ 73/);
    expect(jouer(REGLES, LOCATION, 'INVESTIR_ACTIFS').mentions.join(' ')).toMatch(/§ 51 a/);
  });

  it('refus · une règle qui envoie un compte de gestion au bilan, un retraitement déséquilibré ou sans fondement', () => {
    expect(() => jouer([...REGLES, R('6', 'SF_STOCKS')])).toThrow(RefusIfrs);
    expect(motifRefusRegle('41', 'PL_PRODUITS')).toMatch(/compte de bilan/);
    expect(motifRefusRegle('9', 'SF_STOCKS')).toMatch(/classes 1 à 8/);
    expect(() => jouer(REGLES, [{ ...LOCATION[0], lignes: [{ rubrique: 'SF_STOCKS', montant: 10 }, { rubrique: 'SF_RESERVES', montant: -9 }] }])).toThrow(/déséquilibré/);
    expect(() => jouer(REGLES, [{ ...LOCATION[0], fondement: ' ' }])).toThrow(/sans fondement/);
  });

  it('le catalogue porte un paragraphe par rubrique, et chaque code est unique', () => {
    expect(RUBRIQUES_IFRS.every((r) => /§/.test(r.ref))).toBe(true);
    expect(new Set(RUBRIQUES_IFRS.map((r) => r.code)).size).toBe(RUBRIQUES_IFRS.length);
  });
});
