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
