import { lignesDepuisModele, lignesVersModele, type ModeleBulletin } from './modeles-bulletin';

// Aucun import de « vitest » · convention du dépôt.

const MODELE: ModeleBulletin = {
  id: 'm1',
  nom: 'Employé',
  categorie: null,
  deviseStipulation: 'CDF',
  lignes: [
    { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de base', montant: 600000 },
    { nature: 'PRIME', libelle: 'Prime de rendement', rubriqueId: 'r1', montant: null },
    { nature: 'PRIME', libelle: 'Prime supprimée', rubriqueId: 'r-vieille' },
  ],
};

describe('appliquer un bulletin modèle', () => {
  it('reprend les montants dans la même devise, jamais l’attestation', () => {
    const { lignes } = lignesDepuisModele(MODELE, 'CDF', [{ id: 'r1' }]);
    expect(lignes[0]).toEqual({ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de base', montantFc: '600000', attestee: '', remboursement: false });
    expect(lignes[1].rubriqueId).toBe('r1');
    expect(lignes[1].montantFc).toBe('');
  });

  it('dans une autre devise, laisse les montants à saisir et le dit', () => {
    const { lignes, avertissements } = lignesDepuisModele(MODELE, 'USD', [{ id: 'r1' }]);
    expect(lignes.every((l) => l.montantFc === '')).toBe(true);
    expect(avertissements[0]).toMatch(/en CDF, la paie en USD/);
  });

  it('une rubrique désactivée depuis ne s’applique pas, et c’est dit', () => {
    const { lignes, avertissements } = lignesDepuisModele(MODELE, 'CDF', [{ id: 'r1' }]);
    expect(lignes[2].rubriqueId).toBeUndefined();
    expect(avertissements.some((a) => a.includes('Prime supprimée'))).toBe(true);
  });
});

describe('enregistrer la saisie comme modèle', () => {
  it('garde nature, libellé, rubrique et montant ; écarte les lignes vides', () => {
    expect(
      lignesVersModele([
        { nature: 'PRIME', libelle: ' Prime ', montantFc: '1 250,50', attestee: 'oui', remboursement: true, rubriqueId: 'r1' },
        { nature: 'SALAIRE_OU_TRAITEMENT', libelle: '', montantFc: '', attestee: '', remboursement: false },
        { nature: 'COMMISSION', libelle: 'Commission', montantFc: '', attestee: '', remboursement: false },
      ]),
    ).toEqual([
      { nature: 'PRIME', libelle: 'Prime', rubriqueId: 'r1', montant: 1250.5 },
      { nature: 'COMMISSION', libelle: 'Commission', rubriqueId: null, montant: null },
    ]);
  });
});
