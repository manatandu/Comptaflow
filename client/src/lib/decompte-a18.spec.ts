import {
  SAISIE_STIPULATIONS_VIDE,
  motifDecompteNonEmissible,
  motifStipulationsIncompletes,
  retenuesReprises,
  stipulationsDuDecompte,
  type RetenueProposee,
} from './decompte-emis';

/**
 * A18 · l'écran du décompte · stipulations et retenues proposées. Pas
 * d'import de vitest · le jest de la racine relit aussi ces fichiers.
 */
describe('A18 · stipulations du décompte, telles que saisies', () => {
  it("rien de saisi n'envoie rien · la gratification n'est pas présumée", () => {
    expect(stipulationsDuDecompte(SAISIE_STIPULATIONS_VIDE)).toEqual({});
    expect(motifStipulationsIncompletes(SAISIE_STIPULATIONS_VIDE)).toBeNull();
  });

  it('une gratification complète part avec sa période et sa source, rognées', () => {
    const s = {
      ...SAISIE_STIPULATIONS_VIDE,
      gratificationAnnuelleFc: '1 200 000',
      gratificationSource: ' Contrat, art. 6 ',
      gratificationDebut: '2027-01-01',
      gratificationFin: '2027-03-31',
    };
    expect(stipulationsDuDecompte(s)).toEqual({
      gratificationStipulee: { montantAnnuelFc: 1_200_000, source: 'Contrat, art. 6', debutPeriode: '2027-01-01', finPeriode: '2027-03-31' },
    });
  });

  it("une source vide part vide · c'est le serveur qui la nomme manquante", () => {
    const s = { ...SAISIE_STIPULATIONS_VIDE, indemniteStipuleeFc: '500000' };
    expect(stipulationsDuDecompte(s)).toEqual({ indemniteStipulee: { montantFc: 500_000, source: '' } });
  });

  it('une stipulation entamée sans montant ou sans période est nommée et refuse le clic', () => {
    const sansPeriode = { ...SAISIE_STIPULATIONS_VIDE, gratificationAnnuelleFc: '1200000', gratificationSource: 'Contrat' };
    const motif = motifStipulationsIncompletes(sansPeriode);
    expect(motif).toContain('période de référence');
    expect(stipulationsDuDecompte(sansPeriode)).toEqual({});
    expect(
      motifDecompteNonEmissible({
        salarieId: 's-1',
        moisDeCessation: '2027-03',
        anneesAnciennete: '3',
        moisNonCouvertsParUnConge: '6',
        arrieresFc: '',
        nombreElementsDuMois: 1,
        motifStipulations: motif,
      }),
    ).toBe(motif);
    expect(motifStipulationsIncompletes({ ...SAISIE_STIPULATIONS_VIDE, indemniteSource: 'Convention' })).toContain('indemnité stipulée');
  });
});

describe('A18 · retenues proposées reprises dans la saisie', () => {
  const r = (avanceId: string, montantProposeFc: number): RetenueProposee => ({
    avanceId,
    littera: 'c',
    libelle: avanceId,
    soldeFc: 1_000,
    montantProposeFc,
    reserve: null,
  });

  it('reprend au centime, garde les autres saisies, retire une proposition à zéro', () => {
    const avant = { autre: '50.00', a2: '10.00' };
    expect(retenuesReprises(avant, [r('a1', 0.1 + 0.2), r('a2', 0)])).toEqual({ autre: '50.00', a1: '0.30' });
  });
});
