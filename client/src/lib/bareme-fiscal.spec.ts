import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  avertissementEcartBareme,
  avertissementPlancherLocationAcquisition,
  PLANCHERS_LOCATION_ACQUISITION,
  plancherLocationAcquisition,
  sectionsDuBareme,
  naturesProposees,
  comptesProposesPourNature,
  SOURCE_AIDE_SEUIL_IMMOBILISATION,
  texteAideSeuilImmobilisation,
  type NatureBaremeFiscal,
} from './bareme-fiscal';

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

describe('plancher de la location-acquisition (arrêté n° 013/2025, art. 5)', () => {
  it('lit les trois planchers du texte · 7, 4 et 3 ans', () => {
    expect(plancherLocationAcquisition('SYSCOHADA', '23160000')?.dureeMinimaleAns).toBe(7);
    expect(plancherLocationAcquisition('SYCEBNL', '23260000')?.dureeMinimaleAns).toBe(7);
    expect(plancherLocationAcquisition('SYSCOHADA', '24160000')?.dureeMinimaleAns).toBe(4);
    expect(plancherLocationAcquisition('SYCEBNL', '24260000')?.dureeMinimaleAns).toBe(4);
    expect(plancherLocationAcquisition('SYSCOHADA', '24460000')?.dureeMinimaleAns).toBe(4);
    expect(plancherLocationAcquisition('SYCEBNL', '24560000')?.dureeMinimaleAns).toBe(3);
  });

  it('ne vise ni un bien acquis en propre ni un terrain', () => {
    expect(plancherLocationAcquisition('SYSCOHADA', '24510000')).toBeNull();
    expect(plancherLocationAcquisition('SYSCOHADA', '23110000')).toBeNull();
    expect(plancherLocationAcquisition('SYCEBNL', '22860000')).toBeNull();
    expect(plancherLocationAcquisition(null, '24560000')).toBeNull();
  });

  it('signale une durée sous le plancher, avec l’art. 5, et ne refuse rien', () => {
    const a = avertissementPlancherLocationAcquisition(2, 'SYSCOHADA', '24560000', '2026-12-31');
    expect(a).toContain('art. 5');
    expect(a).toContain('3 ans');
    expect(a).toContain('Matériel de transport');
    const b = avertissementPlancherLocationAcquisition(5, 'SYCEBNL', '23160000', '2026-12-31');
    expect(b).toContain('7 ans');
  });

  it('se tait au plancher et au-dessus, hors location-acquisition, sur une durée illisible', () => {
    expect(avertissementPlancherLocationAcquisition(3, 'SYSCOHADA', '24560000', '2026-12-31')).toBeNull();
    expect(avertissementPlancherLocationAcquisition(8, 'SYSCOHADA', '23160000', '2026-12-31')).toBeNull();
    expect(avertissementPlancherLocationAcquisition(2, 'SYSCOHADA', '24510000', '2026-12-31')).toBeNull();
    expect(avertissementPlancherLocationAcquisition(null, 'SYSCOHADA', '24560000', '2026-12-31')).toBeNull();
  });

  it('ne s’oppose pas à un exercice clos avant le 1er janvier 2026 (art. 6)', () => {
    expect(avertissementPlancherLocationAcquisition(2, 'SYSCOHADA', '24560000', '2025-12-31')).toBeNull();
    expect(avertissementPlancherLocationAcquisition(2, 'SYSCOHADA', '24560000', null)).not.toBeNull();
  });

  it('dit la lecture d’OmegaX sur le matériel et mobilier', () => {
    expect(avertissementPlancherLocationAcquisition(2, 'SYCEBNL', '24460000', '2026-12-31')).toContain('lecture d');
  });

  /*
   * LA PRÉMISSE SE RELIT DANS LES DEUX SEMIS · chaque racine doit y être
   * ouverte en Détail (huit chiffres) sous un intitulé « location-acquisition »,
   * sans quoi le plancher viserait un compte d'une autre nature.
   */
  const racine = join(__dirname, '..', '..', '..');
  const semis = {
    SYCEBNL: readFileSync(join(racine, 'src/modules/comptes/compte-seed.ts'), 'utf8'),
    SYSCOHADA: readFileSync(join(racine, 'src/modules/comptes/compte-seed-syscohada.ts'), 'utf8'),
  };
  it.each(['SYCEBNL', 'SYSCOHADA'] as const)('chaque racine %s est un sous-compte de location-acquisition semé', (plan) => {
    const fautifs = PLANCHERS_LOCATION_ACQUISITION[plan].filter((p) => {
      const ligne = semis[plan].split('\n').find((l) => l.includes(`'${p.racine.padEnd(8, '0')}'`));
      return !ligne || !/location\s*-\s*acquisition/i.test(ligne);
    });
    expect(fautifs.map((p) => p.racine)).toEqual([]);
  });
});

describe('aide « Seuil d’immobilisation » (arrêté n° 014/2025)', () => {
  it('porte le champ exact · valeur unitaire, trois catégories, IS et IRPP, date d’effet', () => {
    const t = texteAideSeuilImmobilisation('2026-12-31');
    expect(t).toContain('valeur unitaire');
    expect(t).toContain('petit matériel');
    expect(t).toContain('outillage');
    expect(t).toContain('matériel de bureau');
    expect(t).toContain('500 USD');
    expect(t).toContain('IRPP');
    expect(t).toContain('1er janvier 2026');
    expect(t).toContain('classe 6');
    expect(SOURCE_AIDE_SEUIL_IMMOBILISATION).toContain('014/CAB/MIN/FINANCES/2025');
    expect(SOURCE_AIDE_SEUIL_IMMOBILISATION).toContain('art. 28 et 89');
  });

  it('dit qu’un exercice clos avant le 1er janvier 2026 n’est pas visé (art. 3)', () => {
    expect(texteAideSeuilImmobilisation('2025-12-31')).toContain('ne s\'y applique pas');
    expect(texteAideSeuilImmobilisation('2026-12-31')).not.toContain('ne s\'y applique pas');
    expect(texteAideSeuilImmobilisation(null)).not.toContain('ne s\'y applique pas');
  });

  it('l’écran sert cette aide et l’avertissement de l’art. 5', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'ImmobilisationsPage.tsx'), 'utf8');
    expect(page).toContain('texte={texteAideSeuilImmobilisation(exerciceCourant?.dateFin)}');
    expect(page).toContain('source={SOURCE_AIDE_SEUIL_IMMOBILISATION}');
    expect(page).toContain('avertissementPlancherLocationAcquisition(');
    expect(page).toContain('art. 2, 4, 5 et 6');
  });
});

describe('le retraitement fiscal porte aussi l’art. 5', () => {
  it('AMORTISSEMENTS_EXCEDENT cite le plancher de la location-acquisition', () => {
    const catalogue = readFileSync(
      join(__dirname, '..', '..', '..', 'src/modules/fiscalite/catalogue-retraitements.ts'),
      'utf8',
    );
    // Le bloc de l'entrée, découpé de son code au code suivant.
    const debut = catalogue.indexOf("code: 'AMORTISSEMENTS_EXCEDENT'");
    const bloc = catalogue.slice(debut, catalogue.indexOf('code:', debut + 10));
    expect(debut).toBeGreaterThan(-1);
    expect(bloc).toContain('location-acquisition');
    expect(bloc).toContain('trois ans (matériel de transport), art. 5');
    expect(bloc).toContain('013/CAB/MIN/FINANCES/2025, art. 2 et 5');
  });
});

describe('lot 6 · le barème et les comptes dans les deux sens (D-4)', () => {
  const n = (cle: string, section: string, comptes: string[] = []): NatureBaremeFiscal => ({
    cle, section, intituleSection: section, numero: 1, designation: cle, dureeAns: 5, taux: 20, comptes,
  });
  const bareme = [n('V.14', 'V', ['24510000']), n('V.18', 'V', ['24510000', '24210000']), n('VI.2', 'VI', ['24440000']), n('IX.3', 'IX', ['24210000'])];

  it('le compte ne propose que ses natures ; toutes les catégories à un clic ; repli sur les sections', () => {
    const compte = { naturesBareme: ['V.14', 'V.18'], sectionsBareme: ['V', 'IX'] };
    expect(naturesProposees(bareme, compte, false).map((x) => x.cle)).toEqual(['V.14', 'V.18']);
    expect(naturesProposees(bareme, compte, true)).toHaveLength(4);
    expect(naturesProposees(bareme, { naturesBareme: [], sectionsBareme: ['VI'] }, false).map((x) => x.cle)).toEqual(['VI.2']);
    expect(naturesProposees(bareme, null, false)).toHaveLength(4);
  });

  it('la nature propose ses comptes, le premier en tête, et se tait si le compte choisi en est un', () => {
    const plan = [
      { id: 'a', numero: '24210000' },
      { id: 'b', numero: '24510000' },
    ];
    expect(comptesProposesPourNature(bareme[1], plan, null).map((c) => c.id)).toEqual(['b', 'a']);
    expect(comptesProposesPourNature(bareme[1], plan, { numero: '24511000' })).toEqual([]);
    expect(comptesProposesPourNature(bareme[2], plan, { numero: '24210000' })).toEqual([]);
    expect(comptesProposesPourNature(undefined, plan, null)).toEqual([]);
  });
});
