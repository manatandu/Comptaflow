import { avertissementPetitMateriel, comptesParDivision, modesPresents, type CompteDuBien } from './compte-du-bien';

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
