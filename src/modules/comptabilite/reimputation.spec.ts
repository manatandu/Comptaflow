import { LigneAReimputer, lignesDeReimputation, motifRefusLigne } from './reimputation';

const base: LigneAReimputer = {
  id: 'l1',
  compteId: 'c601',
  compteNumero: '60110000',
  debit: 1000,
  credit: 0,
  lettre: null,
  rapprochementId: null,
  tauxTvaId: null,
  statut: 'VALIDEE',
  exerciceClos: false,
  estGenereeParCloture: false,
  tenueParImmobilisation: false,
};

describe("Réimputation d'écritures · AUDCIF art. 20 et 22, 2°", () => {
  it('une ligne validée se réimpute par inscription en NÉGATIF puis enregistrement exact, jamais par contre-passation', () => {
    const [negatif, exact] = lignesDeReimputation(base, 'c604');
    expect(negatif).toEqual({ compteId: 'c601', debit: -1000, credit: -0, signeAnalytique: -1 });
    expect(exact).toEqual({ compteId: 'c604', debit: 1000, credit: 0, signeAnalytique: 1 });
    // La paire s'équilibre et laisse le compte erroné à zéro des deux côtés.
    expect(negatif.debit + exact.debit).toBe(0);
  });

  it('accepte une ligne ordinaire, brouillard ou validée', () => {
    expect(motifRefusLigne(base, 'c604')).toBeNull();
    expect(motifRefusLigne({ ...base, statut: 'BROUILLARD' }, 'c604')).toBeNull();
  });

  it('refuse, en le nommant, ce que la réimputation rendrait faux', () => {
    expect(motifRefusLigne(base, 'c601')).toMatch(/déjà sur le compte cible/);
    expect(motifRefusLigne({ ...base, exerciceClos: true }, 'c604')).toMatch(/report à nouveau/);
    expect(motifRefusLigne({ ...base, estGenereeParCloture: true }, 'c604')).toMatch(/clôture/);
    expect(motifRefusLigne({ ...base, tenueParImmobilisation: true }, 'c604')).toMatch(/module Immobilisations/);
    expect(motifRefusLigne({ ...base, lettre: 'AB' }, 'c604')).toMatch(/lettrée \(AB\)/);
    expect(motifRefusLigne({ ...base, rapprochementId: 'r' }, 'c604')).toMatch(/rapprochement/);
    expect(motifRefusLigne({ ...base, tauxTvaId: 't' }, 'c604')).toMatch(/déclaration/);
  });
});
