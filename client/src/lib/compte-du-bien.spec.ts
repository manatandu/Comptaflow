import {
  avertissementPetitMateriel,
  compteEnCoursInitial,
  comptesDefinitifs,
  comptesParDivision,
  contrepartiesSelonEnCours,
  modesPresents,
  type CompteDuBien,
} from './compte-du-bien';

describe('immobilisation en cours · le compte définitif et son en-cours', () => {
  const c = (numero: string, o: Partial<CompteDuBien> = {}): CompteDuBien => ({
    id: numero, numero, intitule: numero, compteAmortissement: null, compteDotation: null, motifComptes: null,
    motifNonAmortissable: null, sectionsBareme: null, division: { numero: numero.slice(0, 2), intitule: null }, locationAcquisition: false,
    estCompteEnCours: /^2[1-4]9/.test(numero), ...o,
  });
  it('« Pas encore mis en service » retire les 2x9 de la liste des comptes définitifs, et seulement alors', () => {
    const plan = [c('23110000'), c('23910000'), c('24410000'), c('24940000')];
    expect(comptesDefinitifs(plan, true).map((x) => x.numero)).toEqual(['23110000', '24410000']);
    expect(comptesDefinitifs(plan, false)).toHaveLength(4);
  });
  it('l’en-cours posé d’office est celui que le serveur présélectionne, rien sans présélection ni sur motif', () => {
    expect(compteEnCoursInitial(c('24410000', { compteEnCoursProposeId: 'x2494', motifSansEnCours: null }))).toBe('x2494');
    expect(compteEnCoursInitial(c('23110000', { compteEnCoursProposeId: null, motifSansEnCours: null }))).toBe('');
    expect(compteEnCoursInitial(c('21310000', { compteEnCoursProposeId: 'x', motifSansEnCours: 'Le SYCEBNL…' }))).toBe('');
    expect(compteEnCoursInitial(null)).toBe('');
  });
  it('inscrit en cours, « Travaux en cours achevés » n’est plus offert comme contrepartie', () => {
    const liste = [
      { id: '1', numero: '48120000', intitule: 'F', mode: 'ACHAT_A_CREDIT', libelleMode: 'Achat' },
      { id: '2', numero: '23910000', intitule: 'E', mode: 'EN_COURS_ACHEVE', libelleMode: 'Travaux' },
    ];
    expect(contrepartiesSelonEnCours(liste, true).map((c) => c.id)).toEqual(['1']);
    expect(contrepartiesSelonEnCours(liste, false)).toHaveLength(2);
  });
});

const seuil = { seuil: 1_400_000, cours: 2800, dateCours: '2026-03-02T00:00:00.000Z', motif: null };

describe('petit matériel · arrêté n° 014/2025, art. 2', () => {
  it('sous le seuil, la phrase est conditionnelle et cite l’article', () => {
    const a = avertissementPetitMateriel(1_000_000, seuil)!;
    expect(a).toContain('arrêté n° 014/2025, art. 2');
    expect(a).toContain('02/03/2026');
  });
  it('au seuil exactement, rien · « inférieure », pas « inférieure ou égale »', () => {
    expect(avertissementPetitMateriel(1_400_000, seuil)).toBeNull();
  });
  it('sans cours, rien n’est comparé', () => {
    expect(avertissementPetitMateriel(10, { seuil: null, cours: null, dateCours: null, motif: 'aucun cours' })).toBeNull();
    expect(avertissementPetitMateriel(10, null)).toBeNull();
  });
});

describe('liste des comptes du bien', () => {
  const c = (numero: string, div: string, intitule: string | null): CompteDuBien => ({
    id: numero, numero, intitule: numero, compteAmortissement: null, compteDotation: null, motifComptes: null,
    motifNonAmortissable: null, sectionsBareme: null, division: { numero: div, intitule }, locationAcquisition: false,
  });
  it('groupe par division sous l’intitulé du plan, dans l’ordre servi', () => {
    const g = comptesParDivision([c('21310000', '21', 'Immobilisations incorporelles'), c('24510000', '24', null), c('24520000', '24', null)]);
    expect(g.map((x) => [x.numero, x.intitule, x.comptes.length])).toEqual([
      ['21', 'Immobilisations incorporelles', 1],
      ['24', 'Division 24', 2],
    ]);
  });
  it('les modes viennent du serveur, une fois chacun, avec leur libellé', () => {
    expect(
      modesPresents([
        { id: '1', numero: '4812', intitule: '', mode: 'ACHAT_A_CREDIT', libelleMode: 'Achat à crédit' },
        { id: '2', numero: '4822', intitule: '', mode: 'ACHAT_A_CREDIT', libelleMode: 'Achat à crédit' },
        { id: '3', numero: '5211', intitule: '', mode: 'ACHAT_COMPTANT', libelleMode: 'Achat au comptant' },
      ]),
    ).toEqual([
      { mode: 'ACHAT_A_CREDIT', libelle: 'Achat à crédit' },
      { mode: 'ACHAT_COMPTANT', libelle: 'Achat au comptant' },
    ]);
  });
});
