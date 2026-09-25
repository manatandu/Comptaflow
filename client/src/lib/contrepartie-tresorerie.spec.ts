import { contrepartieDeLigne } from './contrepartie-tresorerie';

const caisse = { id: 'c571', numero: '57110000', intitule: 'Caisse' };
const journal = { type: 'TRESORERIE', compteTresorerieId: 'c571', contrepartieChaqueLigne: true };
const base = { comptes: [caisse], libelle: 'Rgl facture 05' };

describe('contrepartie à chaque ligne (Sage i7)', () => {
  it('un règlement fournisseur au débit du 401 est crédité en caisse', () => {
    expect(contrepartieDeLigne({ ...base, journal, compteLigneId: 'c401', debit: 10800, credit: 0 })).toEqual({
      compteId: 'c571', numero: '57110000', intitule: 'Caisse', libelle: 'Rgl facture 05', debit: 0, credit: 10800,
    });
  });
  it('un encaissement client au crédit du 411 est débité en caisse', () => {
    expect(contrepartieDeLigne({ ...base, journal, compteLigneId: 'c411', debit: 0, credit: 9000 })).toMatchObject({ debit: 9000, credit: 0 });
  });
  it('rien sur la ligne de trésorerie elle-même, rien sans l’option, rien hors trésorerie', () => {
    expect(contrepartieDeLigne({ ...base, journal, compteLigneId: 'c571', debit: 100, credit: 0 })).toBeNull();
    expect(contrepartieDeLigne({ ...base, journal: { ...journal, contrepartieChaqueLigne: false }, compteLigneId: 'c401', debit: 100, credit: 0 })).toBeNull();
    expect(contrepartieDeLigne({ ...base, journal: { ...journal, type: 'ACHATS' }, compteLigneId: 'c401', debit: 100, credit: 0 })).toBeNull();
  });
});
