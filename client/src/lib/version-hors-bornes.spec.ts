import { messageVersionHorsBornes } from './version-hors-bornes';

/**
 * LIGNE A5, NEUVIÈME RELECTURE (mineur 1) · l'écran DIT le refus sous le
 * plancher. Remplacé par rien, il laissait la ligne sans motif, et les tests
 * de source restaient verts.
 */
const base = {
  provisionModuleOuverture: 100_000,
  ouvertureFiable: false,
  plancherVersion: 100_000,
  plafondVersion: 100_001,
  enVigueur: null,
};

describe('message d’une version hors de ses bornes', () => {
  it('dans ses bornes · rien', () => {
    expect(messageVersionHorsBornes({ ...base, horsBornes: null })).toBeNull();
  });
  it('sous le plancher · la double dotation et les bornes', () => {
    const m = messageVersionHorsBornes({ ...base, horsBornes: 'PLANCHER' })!;
    expect(m).toMatch(/sous celle du module \(100.000,00\)/);
    expect(m).toMatch(/la perte déjà provisionnée serait dotée une seconde fois/);
    expect(m).toMatch(/Admis entre 100.000,00 et 100.001,00/);
  });
  it('contestation dont la provision du module a changé · les deux montants', () => {
    const m = messageVersionHorsBornes({
      ...base,
      horsBornes: 'PLANCHER',
      enVigueur: {
        id: 'v',
        montant: 0,
        dateReference: '2027-01-01',
        source: 's',
        motif: null,
        provisionModuleContestee: true,
        motifContestation: 'm',
        provisionModuleContesteeMontant: 0,
        utilisee: false,
      },
    })!;
    expect(m).toMatch(/a changé depuis la contestation \(0,00 contestés, 100.000,00 aujourd’hui\)/);
  });
  it('au-dessus du plafond · la reprise rendrait le compte débiteur', () => {
    expect(messageVersionHorsBornes({ ...base, horsBornes: 'PLAFOND' })).toMatch(/dépasse le solde reconstitué à la clôture précédente/);
  });
});
