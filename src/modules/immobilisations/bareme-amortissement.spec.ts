import { BAREME_AMORTISSEMENT_013_2025 } from './bareme-amortissement-013-2025';
import { baremeFiscal, natureDuBareme } from './bareme-fiscal';

/**
 * Barème de l'arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2 · une table
 * ENGENDRÉE depuis la compétence fiscalite-rdc-socle.
 *
 * UNE TABLE ARITHMÉTIQUEMENT CLOSE EST UNE TABLE CORRECTEMENT LUE · chaque
 * taux imprimé est 100 / durée tronqué à deux décimales, et un test le refait
 * ligne par ligne au lieu de croire la transcription. Un taux mal recopié
 * (33,33 lu 33,3, une durée prise sur la ligne voisine) tombe ici, alors
 * qu'il passerait partout ailleurs · l'écart qu'il ferait signaler à l'écran
 * serait plausible et faux.
 */
describe('barème fiscal d’amortissement (arrêté n° 013/2025, art. 2)', () => {
  it('porte les 131 lignes de l’article 2', () => {
    // Décompte EN DUR · une ligne perdue ou doublée par l'extracteur doit
    // faire rouvrir la source, pas passer inaperçue.
    expect(BAREME_AMORTISSEMENT_013_2025).toHaveLength(131);
  });

  it('chaque taux est 100 / durée tronqué à deux décimales', () => {
    for (const n of BAREME_AMORTISSEMENT_013_2025) {
      const attendu = Math.trunc((100 / n.dureeAns) * 100 + 1e-9) / 100;
      expect({ cle: n.cle, taux: n.taux }).toEqual({ cle: n.cle, taux: attendu });
    }
  });

  it('le tronquage n’est pas un arrondi · trois ans font 33,33 et sept ans 14,28', () => {
    // 100/7 vaut 14,2857… · un arrondi rendrait 14,29, que l'arrêté n'imprime pas.
    const sept = BAREME_AMORTISSEMENT_013_2025.filter((n) => n.dureeAns === 7);
    expect(sept.length).toBeGreaterThan(0);
    for (const n of sept) expect(n.taux).toBe(14.28);
    const trois = BAREME_AMORTISSEMENT_013_2025.filter((n) => n.dureeAns === 3);
    expect(trois.length).toBeGreaterThan(0);
    for (const n of trois) expect(n.taux).toBe(33.33);
  });

  it('les clés « section.rang » sont uniques et suivent la section', () => {
    const cles = BAREME_AMORTISSEMENT_013_2025.map((n) => n.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const n of BAREME_AMORTISSEMENT_013_2025) {
      expect(n.cle.startsWith(`${n.section}.`)).toBe(true);
      expect(n.dureeAns).toBeGreaterThan(0);
      expect(n.designation.trim().length).toBeGreaterThan(0);
    }
  });

  it('natureDuBareme retrouve une ligne par sa clé, et seulement par elle', () => {
    expect(natureDuBareme('I.1')).toMatchObject({ designation: 'Brevets, licences et logiciels', dureeAns: 5, taux: 20 });
    expect(natureDuBareme('II.1')).toMatchObject({ dureeAns: 20, taux: 5 });
    expect(natureDuBareme('XX.99')).toBeUndefined();
    expect(baremeFiscal()).toBe(BAREME_AMORTISSEMENT_013_2025);
  });
});
