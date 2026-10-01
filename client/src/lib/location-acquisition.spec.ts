import { corpsCreation, corpsSimulation, coutsNets, saisieInitiale } from './location-acquisition';

const saisie = { ...saisieInitiale('2026-01-01'), dureeMois: '96', periodicite: 'ANNUELLE' as const, loyer: '90000', tauxPourcent: '7,86', optionRaisonnablementCertaine: true };

describe('contrat de location-acquisition · mise en forme', () => {
  it('le taux saisi en pourcent part en fraction, la valeur reste nulle', () => {
    const c = corpsSimulation('c1', saisie)!;
    expect(c.tauxAnnuel).toBeCloseTo(0.0786, 10);
    expect(c.valeurContrat).toBeNull();
    expect(c.dureeMois).toBe(96);
  });
  it('à la valeur du contrat, le taux reste nul', () => {
    const c = corpsSimulation('c1', { ...saisie, base: 'valeur', valeurContrat: '520000' })!;
    expect(c.tauxAnnuel).toBeNull();
    expect(c.valeurContrat).toBe(520000);
  });
  it('rien ne part tant qu’un chiffre manque', () => {
    expect(corpsSimulation('c1', { ...saisie, loyer: '' })).toBeNull();
    expect(corpsSimulation('', saisie)).toBeNull();
    expect(corpsSimulation('c1', { ...saisie, base: 'valeur', valeurContrat: '' })).toBeNull();
  });
  it('la contrepartie des coûts ne part que si leur net n’est pas nul', () => {
    const bien = { designation: 'Presse', dureeAmortissementAns: 10, exerciceId: 'e', journalId: 'j' };
    expect(corpsCreation('c1', { ...saisie, compteContrepartieCoutsId: 'k' }, bien)!.compteContrepartieCoutsId).toBeUndefined();
    const avec = { ...saisie, coutsDirects: '3000', avantagesRecus: '1000', compteContrepartieCoutsId: 'k' };
    expect(coutsNets(avec)).toBe(2000);
    expect(corpsCreation('c1', avec, bien)!.compteContrepartieCoutsId).toBe('k');
  });
});
