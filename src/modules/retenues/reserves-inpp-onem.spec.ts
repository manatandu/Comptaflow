import { NATURES_RETENUES } from './correspondance-retenues';

/**
 * AUDIT FINAL F125 · les réserves INPP et ONEM du registre. Elles promettaient
 * un rappel du taux par l'effectif que rien ne tenait, niaient une liquidation
 * que la paie fait, et plaçaient « la veille » un changement de taux survenu
 * le lendemain. On gèle ce qu'elles DISENT, jamais l'absence d'un mot.
 */
const reserve = (cle: string) => NATURES_RETENUES.find((n) => n.cle === cle)!.reserve ?? '';

describe('F125 · réserves INPP et ONEM', () => {
  it('renvoient le calcul de la cotisation à la paie, et disent ce que le registre fait', () => {
    for (const cle of ['inpp', 'onem']) {
      expect(reserve(cle)).toContain('La cotisation se calcule dans la paie (fenêtre Personnel)');
      expect(reserve(cle)).toMatch(/Ce registre, lui, ne recalcule rien : il recense ce que votre comptabilité porte sur le compte 433[45]/);
    }
    expect(reserve('inpp')).toContain('s\'y abstient tant qu\'ils ne le sont pas');
  });

  it('l’ONEM a changé de taux le 25 septembre 2025, le lendemain de l’INPP', () => {
    expect(reserve('inpp')).toContain('même discipline que l\'ONEM, dont le taux a changé le lendemain');
    expect(reserve('onem')).toContain('à partir du 25 septembre 2025');
  });
});

/**
 * PASSE D2 · la ligne CNSS dit ce qu'elle taisait : les feuilles de paie
 * jointes (art. 24 et 28), les sanctions (arrêté n° 138/2018), les deux voies
 * de déclaration (art. 21), les autres assujettis (art. 3 et 17, point 2) et
 * la majoration notifiée (arrêté n° 140/2018). L'INPP cite l'art. 15 b).
 */
describe('Passe D2 · la ligne CNSS et la base légale INPP', () => {
  const cnss = NATURES_RETENUES.find((n) => n.cle === 'cnss')!;
  const inpp = NATURES_RETENUES.find((n) => n.cle === 'inpp')!;
  const texteCnss = `${cnss.baseLegale} ${cnss.reserve}`;

  it('les feuilles de paie jointes, et leur absence qui vaut défaut de déclaration', () => {
    expect(texteCnss).toMatch(/article 24 impose de joindre.*feuilles de paie/);
    expect(texteCnss).toMatch(/article 28 fait de leur absence un DÉFAUT DE DÉCLARATION/);
    expect(texteCnss).toContain('anomalie de renvoi');
  });

  it("les sanctions de l'arrêté n° 138/2018, sans montant", () => {
    expect(texteCnss).toContain('138/2018');
    expect(texteCnss).toMatch(/vingt-unième jour/);
    expect(texteCnss).toMatch(/majorée de 30 %/);
    expect(texteCnss).toMatch(/ce registre n'en chiffre aucun/);
  });

  it('les deux voies de déclaration, sans en choisir une', () => {
    expect(texteCnss).toMatch(/Mod\. DC en trois exemplaires/);
    expect(texteCnss).toMatch(/guichet unique/);
    expect(texteCnss).toMatch(/ne tranche pas entre eux/);
  });

  it("les autres assujettis et leur assiette propre, et l'apprenti", () => {
    expect(texteCnss).toMatch(/ASSOCIÉ ACTIF/);
    expect(texteCnss).toContain('art. 17, point 2');
    expect(texteCnss).toMatch(/jetons de présence/);
    expect(texteCnss).toMatch(/APPRENTI.*risques professionnels/);
  });

  it("la majoration des risques professionnels jusqu'au double, à deux niveaux", () => {
    expect(texteCnss).toMatch(/majorable par la Caisse jusqu'au double/);
    expect(texteCnss).toContain('140/2018');
  });

  it("l'INPP naît de l'art. 15 b) du Code du travail", () => {
    expect(inpp.baseLegale).toMatch(/^Code du travail, art\. 15 b\)/);
    expect(inpp.baseLegale).toContain('trimestre précédent');
  });
});
