import { decompteFinal, PREFIXE_GRATIFICATION_STIPULEE, type ParametresDecompte } from './decompte-final';
import { elementsDuDecompte, MOTIF_GRATIFICATION } from './decompte-final-emis';

/** Licenciement d'un CDI, préavis dispensé, tout chiffré (même base que la suite d'A8). */
const BASE: ParametresDecompte = {
  anneesAnciennete: 3,
  moisNonCouvertsParUnConge: 6,
  moinsDeDixHuitAns: false,
  initiative: 'EMPLOYEUR',
  motif: 'LICENCIEMENT',
  typeContrat: 'DUREE_INDETERMINEE',
  executionPreavis: 'DISPENSE_PAR_EMPLOYEUR',
  remunerationJournaliereFc: 10_000,
  moyenneMensuelleArticle66Fc: 0,
  moyenneMensuelleArticle142Fc: 0,
  avantagesPendantPreavisFc: 0,
  arrieresFc: 0,
  enfantsBeneficiairesAllocations: 0,
};

const STIPULEE = { montantAnnuelFc: 1_200_000, source: 'Contrat de travail, art. 6', debutPeriode: '2027-01-01', finPeriode: '2027-03-31' };

describe('A18 · gratification au prorata, PROPOSÉE seulement si stipulée', () => {
  it("sans stipulation · aucune proposition, le montant reste null et l'émission le refuse (jamais zéro)", () => {
    const v = decompteFinal(BASE);
    expect(v.propositionGratification).toBeNull();
    expect(v.rubriques.find((r) => r.cle === 'gratification')?.montantFc).toBeNull();
    expect(elementsDuDecompte(v).refus).toContain(MOTIF_GRATIFICATION);
  });

  it("stipulée et non confirmée · proposée (300 000 FC = 1 200 000 × 3 / 12), le total reste null jusqu'à confirmation", () => {
    const v = decompteFinal({ ...BASE, gratificationStipulee: STIPULEE });
    expect(v.propositionGratification).toEqual(expect.objectContaining({ montantFc: 300_000, moisEntiers: 3 }));
    const r = v.rubriques.find((x) => x.cle === 'gratification');
    expect(r?.montantFc).toBeNull();
    expect(r?.reserve?.startsWith(PREFIXE_GRATIFICATION_STIPULEE)).toBe(true);
    expect(v.totalBrutFc).toBeNull();
    const { refus } = elementsDuDecompte(v);
    expect(refus.some((m) => m.includes('proposée 300000.00 FC'))).toBe(true);
  });

  it('confirmée · le montant saisi entre au brut sous la nature gratification', () => {
    const v = decompteFinal({ ...BASE, gratificationStipulee: STIPULEE, gratificationFc: 300_000 });
    const { elements, refus } = elementsDuDecompte(v);
    expect(refus).toEqual([]);
    expect(elements.find((e) => e.cleRubrique === 'gratification')).toEqual(
      expect.objectContaining({ nature: 'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE', montantFc: 300_000 }),
    );
    expect(v.rubriques.find((r) => r.cle === 'gratification')?.reserve).toContain('confirmée sur la proposition');
  });

  it('un montant retenu différent de la proposition est admis, et la différence est dite', () => {
    const v = decompteFinal({ ...BASE, gratificationStipulee: STIPULEE, gratificationFc: 312_000 });
    expect(v.rubriques.find((r) => r.cle === 'gratification')?.montantFc).toBe(312_000);
    expect(v.rubriques.find((r) => r.cle === 'gratification')?.reserve).toContain('diffère de la proposition');
  });

  it("une stipulation sans source refuse la rubrique, même avec un montant saisi · la source est ce qui manque", () => {
    const v = decompteFinal({ ...BASE, gratificationStipulee: { ...STIPULEE, source: '' }, gratificationFc: 300_000 });
    expect(v.rubriques.find((r) => r.cle === 'gratification')?.montantFc).toBeNull();
    expect(elementsDuDecompte(v).refus.some((m) => m.includes('source'))).toBe(true);
  });
});

describe('A18 · indemnité de fin de contrat stipulée, recopiée et jamais calculée', () => {
  it('passe sous la nature de fin de contrat (6614), à son montant exact, en plus des sommes légales', () => {
    const sans = decompteFinal({ ...BASE, gratificationFc: 0 });
    const avec = decompteFinal({ ...BASE, gratificationFc: 0, indemniteStipulee: { montantFc: 500_000, source: 'Convention collective, art. 40' } });
    expect((avec.totalBrutFc as number) - (sans.totalBrutFc as number)).toBe(500_000);
    const { elements, refus } = elementsDuDecompte(avec);
    expect(refus).toEqual([]);
    expect(elements.find((e) => e.cleRubrique === 'indemnite-stipulee')).toEqual(
      expect.objectContaining({ nature: 'INDEMNITE_DE_FIN_DE_CONTRAT', montantFc: 500_000 }),
    );
    expect(avec.rubriques.find((r) => r.cle === 'indemnite-stipulee')?.fondement).toContain('Convention collective, art. 40');
  });

  it("absente · aucune rubrique, ce n'est pas un manque", () => {
    expect(decompteFinal({ ...BASE, gratificationFc: 0 }).rubriques.some((r) => r.cle === 'indemnite-stipulee')).toBe(false);
  });

  it("sans source · non chiffrée, l'émission refuse", () => {
    const v = decompteFinal({ ...BASE, gratificationFc: 0, indemniteStipulee: { montantFc: 500_000, source: '' } });
    expect(v.totalBrutFc).toBeNull();
    expect(elementsDuDecompte(v).refus.some((m) => m.includes('Indemnité de fin de contrat stipulée'))).toBe(true);
  });
});
