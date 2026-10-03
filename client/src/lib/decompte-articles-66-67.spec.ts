import {
  allocationsDuTempsRestant,
  avantagesDesSeulsJoursAvantLaMoitie,
  preavisPorteDesAvantages,
} from './decompte-emis';

/**
 * A9 · ce que l'écran dit et envoie selon l'exécution du préavis (Code du
 * travail, art. 63, al. 3 ; art. 66 ; art. 67). Le serveur tranche ; ici, on
 * vérifie que l'écran ne demande pas ce que le serveur refuse.
 */
describe('A9 (M2) · la rubrique du préavis ne porte d’avantages que payée par l’employeur', () => {
  it('les porte pour la dispense par l’employeur et le non-observé à sa charge', () => {
    expect(preavisPorteDesAvantages('DISPENSE_PAR_EMPLOYEUR', '', 'EMPLOYEUR')).toBe(true);
    expect(preavisPorteDesAvantages('NON_OBSERVE', '', 'EMPLOYEUR')).toBe(true);
    expect(preavisPorteDesAvantages('NON_OBSERVE', 'EMPLOYEUR', 'TRAVAILLEUR')).toBe(true);
  });

  it('ne les porte ni sous l’art. 66, ni sous l’art. 67, ni à la charge du travailleur', () => {
    expect(preavisPorteDesAvantages('DEPART_A_MI_PREAVIS', '', 'EMPLOYEUR')).toBe(false);
    expect(preavisPorteDesAvantages('DEPART_POUR_NOUVEL_EMPLOI', '', 'EMPLOYEUR')).toBe(false);
    expect(preavisPorteDesAvantages('NON_OBSERVE', 'TRAVAILLEUR', 'EMPLOYEUR')).toBe(false);
    expect(preavisPorteDesAvantages('NON_OBSERVE', '', 'TRAVAILLEUR')).toBe(false);
    expect(preavisPorteDesAvantages('PRESTE', '', 'EMPLOYEUR')).toBe(false);
  });
});

describe('A9 (M1) · les avantages imputés au travailleur parti avant la moitié', () => {
  it('ne visent que le préavis reçu, non observé par le travailleur', () => {
    expect(avantagesDesSeulsJoursAvantLaMoitie('NON_OBSERVE', 'TRAVAILLEUR', 'EMPLOYEUR')).toBe(true);
    // Le démissionnaire doit tout son préavis · rien ne se coupe à la moitié.
    expect(avantagesDesSeulsJoursAvantLaMoitie('NON_OBSERVE', '', 'TRAVAILLEUR')).toBe(false);
    expect(avantagesDesSeulsJoursAvantLaMoitie('NON_OBSERVE', 'EMPLOYEUR', 'EMPLOYEUR')).toBe(false);
  });
});

describe('A9 (M3) · l’aide des allocations familiales suit l’exécution déclarée', () => {
  it('dit dues, perdues ou non dues', () => {
    expect(allocationsDuTempsRestant('DEPART_A_MI_PREAVIS', '', 'EMPLOYEUR')).toContain('restent dues');
    expect(allocationsDuTempsRestant('DEPART_POUR_NOUVEL_EMPLOI', '', 'EMPLOYEUR')).toContain('perdues');
    expect(allocationsDuTempsRestant('NON_OBSERVE', 'TRAVAILLEUR', 'EMPLOYEUR')).toContain('ne sont pas dues');
    expect(allocationsDuTempsRestant('PRESTE', '', 'EMPLOYEUR')).not.toContain('restent dues');
  });
});
