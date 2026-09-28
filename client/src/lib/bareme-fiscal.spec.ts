import { avertissementEcartBareme, sectionsDuBareme, type NatureBaremeFiscal } from './bareme-fiscal';

const vehicule: NatureBaremeFiscal = {
  cle: 'V.1',
  section: 'V',
  intituleSection: 'Section d’essai',
  numero: 1,
  designation: 'Nature d’essai',
  dureeAns: 4,
  taux: 25,
};

describe('avertissement d’écart au barème fiscal (arrêté n° 013/2025)', () => {
  it('se tait sans nature, sur une durée égale ou illisible', () => {
    expect(avertissementEcartBareme(3, null, '2026-12-31')).toBeNull();
    expect(avertissementEcartBareme(4, vehicule, '2026-12-31')).toBeNull();
    expect(avertissementEcartBareme(null, vehicule, '2026-12-31')).toBeNull();
    expect(avertissementEcartBareme(0, vehicule, '2026-12-31')).toBeNull();
  });

  it('nomme l’art. 4 sur une durée plus courte, et ne refuse rien', () => {
    const a = avertissementEcartBareme(3, vehicule, '2026-12-31');
    expect(a).toContain('plus courte');
    expect(a).toContain('art. 4');
    expect(a).toContain('4 ans');
  });

  it('signale une durée plus longue sans invoquer l’art. 4', () => {
    const a = avertissementEcartBareme(5, vehicule, '2026-12-31');
    expect(a).toContain('plus longue');
    expect(a).not.toContain('art. 4');
  });

  it('ne s’oppose pas à un exercice clos avant le 1er janvier 2026 (art. 6)', () => {
    expect(avertissementEcartBareme(3, vehicule, '2025-12-31')).toBeNull();
    expect(avertissementEcartBareme(3, vehicule, '2026-01-01')).not.toBeNull();
    // Fin inconnue · le barème est en vigueur, l'écart se dit.
    expect(avertissementEcartBareme(3, vehicule, null)).not.toBeNull();
  });

  it('regroupe les lignes par section dans l’ordre servi', () => {
    const autre = { ...vehicule, cle: 'I.1', section: 'I', intituleSection: 'Autre section d’essai' };
    const g = sectionsDuBareme([autre, vehicule, { ...vehicule, cle: 'V.2', numero: 2 }]);
    expect(g.map((x) => x.section)).toEqual(['I', 'V']);
    expect(g[1].lignes.map((l) => l.cle)).toEqual(['V.1', 'V.2']);
  });
});
