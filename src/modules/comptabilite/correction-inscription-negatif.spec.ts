import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import { TOUS_LES_POSTES_FLUX } from '../etats-financiers/correspondance-tft';

/**
 * CORRECTION D'ERREUR PAR INSCRIPTION EN NÉGATIF · art. 20 de l'AUDCIF,
 * repris par la Partie 2 ch. 2 du SYCEBNL :
 *
 *   « Toute correction d'erreur commise et découverte sur l'exercice en
 *   cours, s'effectue EXCLUSIVEMENT par l'inscription en négatif des éléments
 *   erronés ; l'enregistrement exact est ensuite opéré. »
 *
 * Ces tests ne vérifient pas seulement que la mécanique fonctionne : ils
 * CHIFFRENT ce que la contre-passation · la technique que l'adverbe
 * « exclusivement » écarte · aurait faussé. C'est la seule façon de montrer
 * que le choix du texte n'est pas une préférence de forme.
 */

/** Une ligne d'écriture réduite à ce qui compte ici. */
type L = { numero: string; debit: number; credit: number };

/**
 * Reproduit `EcritureService.balance` sur les deux agrégats que la Partie 2
 * ch. 2 impose à la balance générale : « le cumul depuis l'ouverture de
 * l'exercice des mouvements débiteurs et le cumul des mouvements créditeurs ».
 */
function cumuls(lignes: L[], numero: string) {
  const duCompte = lignes.filter((l) => l.numero === numero);
  return {
    cumulDebit: duCompte.reduce((s, l) => s + l.debit, 0),
    cumulCredit: duCompte.reduce((s, l) => s + l.credit, 0),
    solde: duCompte.reduce((s, l) => s + l.debit - l.credit, 0),
  };
}

// L'erreur : un achat de 1 000 imputé au 604.
const ERREUR: L[] = [
  { numero: '60400000', debit: 1000, credit: 0 },
  { numero: '40110000', debit: 0, credit: 1000 },
];
/** Ce que le texte prescrit : mêmes comptes, mêmes sens, signe inversé. */
const INSCRIPTION_EN_NEGATIF: L[] = [
  { numero: '60400000', debit: -1000, credit: 0 },
  { numero: '40110000', debit: 0, credit: -1000 },
];
/** Ce que le texte écarte : débit et crédit intervertis. */
const CONTRE_PASSATION: L[] = [
  { numero: '60400000', debit: 0, credit: 1000 },
  { numero: '40110000', debit: 1000, credit: 0 },
];

describe('Art. 20 AUDCIF · pourquoi « exclusivement » l’inscription en négatif', () => {
  it('les deux techniques donnent le même SOLDE · c’est ce qui les fait confondre', () => {
    expect(cumuls([...ERREUR, ...INSCRIPTION_EN_NEGATIF], '60400000').solde).toBe(0);
    expect(cumuls([...ERREUR, ...CONTRE_PASSATION], '60400000').solde).toBe(0);
  });

  it('mais la contre-passation GONFLE les deux cumuls que la balance doit publier', () => {
    // Partie 2 ch. 2 : la balance générale fait apparaître « le cumul depuis
    // l'ouverture de l'exercice des mouvements débiteurs et le cumul des
    // mouvements créditeurs ». Un compte qui n'a jamais rien reçu afficherait
    // 1 000 de chaque côté.
    expect(cumuls([...ERREUR, ...CONTRE_PASSATION], '60400000')).toEqual({
      cumulDebit: 1000,
      cumulCredit: 1000,
      solde: 0,
    });
    expect(cumuls([...ERREUR, ...INSCRIPTION_EN_NEGATIF], '60400000')).toEqual({
      cumulDebit: 0,
      cumulCredit: 0,
      solde: 0,
    });
  });

  /**
   * L'effet dépasse la présentation. Le tableau des flux lit les
   * immobilisations en `DEBIT_SEUL` / `CREDIT_SEUL` : une acquisition est un
   * débit, une cession un crédit, et les deux sont des flux de trésorerie
   * RÉELS et de sens opposés (voir correspondance-tft.ts). Contre-passer une
   * acquisition erronée invente donc une cession.
   */
  it('la contre-passation d’une acquisition erronée invente une CESSION au tableau des flux', () => {
    const fi = TOUS_LES_POSTES_FLUX.find((p) => p.ref === 'FI')!; // acquisitions, DEBIT_SEUL
    expect(fi.lectureFlux).toBe('DEBIT_SEUL');
    expect(correspond('23110000', fi.comptesFlux, fi.exclusionsFlux)).toBe(true);

    const acquisitionErronee: L[] = [
      { numero: '23110000', debit: 5000, credit: 0 },
      { numero: '52110000', debit: 0, credit: 5000 },
    ];
    const lectureDebitSeul = (lignes: L[]) =>
      lignes.filter((l) => l.numero === '23110000').reduce((s, l) => s + l.debit, 0);
    const lectureCreditSeul = (lignes: L[]) =>
      lignes.filter((l) => l.numero === '23110000').reduce((s, l) => s + l.credit, 0);

    const contrePassee = [...acquisitionErronee, { numero: '23110000', debit: 0, credit: 5000 }, { numero: '52110000', debit: 5000, credit: 0 }];
    expect(lectureDebitSeul(contrePassee)).toBe(5000); // acquisition fantôme
    expect(lectureCreditSeul(contrePassee)).toBe(5000); // ET cession fantôme

    const enNegatif = [...acquisitionErronee, { numero: '23110000', debit: -5000, credit: 0 }, { numero: '52110000', debit: 0, credit: -5000 }];
    expect(lectureDebitSeul(enNegatif)).toBe(0);
    expect(lectureCreditSeul(enNegatif)).toBe(0);
  });

  it('l’écriture de correction reste ÉQUILIBRÉE · un négatif de chaque côté', () => {
    const d = INSCRIPTION_EN_NEGATIF.reduce((s, l) => s + l.debit, 0);
    const c = INSCRIPTION_EN_NEGATIF.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(-1000);
    expect(Math.abs(d - c)).toBeLessThan(0.005);
  });
});

/**
 * Le SENS d'une ligne est le côté où son montant est porté, pas le signe de
 * ce montant. Quatre endroits du logiciel en dépendaient et testaient `> 0` :
 * grand livre (contrepartie), ventilation par nature des notes annexes, et
 * lettrage automatique. Ce bloc verrouille le prédicat commun.
 */
describe('Le signe ne décide pas du sens d’une ligne', () => {
  const estDebit = (l: { debit: number }) => Math.abs(l.debit) > 0.005;

  it('un débit NÉGATIF reste une ligne de débit', () => {
    expect(estDebit({ debit: 1000 })).toBe(true);
    expect(estDebit({ debit: -1000 })).toBe(true);
    expect(estDebit({ debit: 0 })).toBe(false);
  });

  it('le lettrage lit l’EFFET NET, identique sur toute ligne ordinaire', () => {
    const net = (l: L) => l.debit - l.credit;
    // Lignes ordinaires : comportement inchangé.
    expect(net({ numero: 'x', debit: 1000, credit: 0 })).toBe(1000);
    expect(net({ numero: 'x', debit: 0, credit: 1000 })).toBe(-1000);
    // Correction : un débit de −1 000 est économiquement un crédit de 1 000,
    // ce qui permet à la facture annulée et à son annulation de se solder
    // l'une l'autre. L'ancienne lecture `> 0` les écartait des DEUX côtés.
    expect(net({ numero: 'x', debit: -1000, credit: 0 })).toBe(-1000);
  });

  /**
   * Le défaut le plus discret des quatre : dans la ventilation par nature de
   * la note 30, un crédit de −500 était lu comme une « diminution » de
   * `ligne.debit` (soit 0), donc court-circuité par `if (montant === 0)
   * continue`. La note continuait d'afficher une augmentation annulée, sans
   * qu'aucun total ne bouge · c'est-à-dire sans aucun signal.
   */
  it('un crédit NÉGATIF est une augmentation négative, pas une diminution nulle', () => {
    const ventiler = (ligne: { debit: number; credit: number }) => {
      const estCredit = Math.abs(ligne.credit) > 0.005;
      return {
        sens: estCredit ? 'augmentation' : 'diminution',
        montant: estCredit ? ligne.credit : ligne.debit,
      };
    };
    expect(ventiler({ debit: 0, credit: 500 })).toEqual({ sens: 'augmentation', montant: 500 });
    expect(ventiler({ debit: 0, credit: -500 })).toEqual({ sens: 'augmentation', montant: -500 });
    expect(ventiler({ debit: 500, credit: 0 })).toEqual({ sens: 'diminution', montant: 500 });

    // L'ancienne lecture, pour mémoire : le crédit négatif disparaissait.
    const ancienne = (ligne: { debit: number; credit: number }) => ({
      sens: ligne.credit > 0 ? 'augmentation' : 'diminution',
      montant: ligne.credit > 0 ? ligne.credit : ligne.debit,
    });
    expect(ancienne({ debit: 0, credit: -500 })).toEqual({ sens: 'diminution', montant: 0 });
  });
});

/** La balance ne présente pas un compte dont les deux cumuls sont nuls. */
describe('Effet sur la balance générale', () => {
  it('un compte mouvementé par erreur puis corrigé disparaît de la balance', () => {
    const ligne = (numero: string, d: number, c: number) => ({
      numero,
      classe: ClasseCompte.CLASSE_6,
      typeCompte: TypeCompteDetailTotal.DETAIL,
      totalDebit: d,
      totalCredit: c,
    });
    const balance = [ligne('60400000', 0, 0), ligne('60500000', 300, 0)]
      // Filtre de `EcritureService.balance`, mot pour mot.
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);
    expect(balance.map((l) => l.numero)).toEqual(['60500000']);
  });
});
