import { FORMES_SYSCOHADA } from './formes-juridiques-syscohada';

// Aucun import de « vitest » · convention du dépôt.

/**
 * LA SAS · l'exception de l'AUSCGIE art. 853-3 se lit en entier (passes O1b,
 * C3 et G5). « à l'exception des articles 387 alinéa 1er, 414 à 561, 690, 751
 * à 753 » · les art. 414 à 561 couvrent l'administration et la direction de la
 * SA autant que ses assemblées.
 */
describe('Forme SAS · le renvoi au régime de la SA et ses exceptions', () => {
  const sas = FORMES_SYSCOHADA.find((f) => f.valeur === 'SOCIETE_PAR_ACTIONS_SIMPLIFIEE')!;

  it('nomme l’administration et la direction, pas seulement les assemblées', () => {
    expect(sas.detail).toContain("l'administration, la direction et les assemblées (art. 414 à 561)");
  });

  it('nomme les art. 690 et 751 à 753, et le président qui exerce les attributions du conseil', () => {
    expect(sas.detail).toContain('(art. 690)');
    expect(sas.detail).toContain('art. 751 à 753');
    expect(sas.detail).toContain('exercées par le président (art. 853-3)');
  });
});
