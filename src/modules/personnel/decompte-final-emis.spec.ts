import { readFileSync } from 'fs';
import { join } from 'path';
import { decompteFinal, type ParametresDecompte } from './decompte-final';
import {
  CLE_ARRIERES,
  NATURE_DES_RUBRIQUES,
  RESERVE_VERSEMENT_UNIQUE,
  arrieresDesElements,
  elementsDuDecompte,
  motifRefusMoisDeCessation,
  motifRefusTypeContrat,
} from './decompte-final-emis';
import { passationPaie, IMPUTATION_PAR_NATURE, NOMENCLATURE_PAIE } from './passation-paie';
import { HORS_REMUNERATION_ARTICLE_7, IMMUNITES_ARTICLE_69 } from './assiettes-paie';

/** Un licenciement d'un CDI, préavis non presté par dispense de l'employeur, tout chiffré. */
const LICENCIEMENT: ParametresDecompte = {
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
  gratificationFc: 0,
  enfantsBeneficiairesAllocations: 0,
};

describe('A8 · le verdict du décompte traduit en éléments de paie', () => {
  it('range chaque rubrique chiffrée sous sa nature, le préavis au 6614 par la nature de fin de contrat', () => {
    const v = decompteFinal(LICENCIEMENT);
    const { elements, refus } = elementsDuDecompte(v);
    expect(refus).toEqual([]);
    // Article 64 · 14 + 7 × 3 = 35 jours ouvrables, à 10 000 FC.
    const preavis = elements.find((e) => e.cleRubrique === 'preavis');
    expect(preavis).toEqual(expect.objectContaining({ nature: 'INDEMNITE_DE_FIN_DE_CONTRAT', montantFc: 350_000 }));
    // Article 141 · six mois, un jour par mois, aucune tranche d'ancienneté.
    const conge = elements.find((e) => e.cleRubrique === 'conge');
    expect(conge).toEqual(expect.objectContaining({ nature: 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE', montantFc: 60_000 }));
    // Les zéros sont des réponses, pas des éléments · rien à passer.
    expect(elements.map((e) => e.cleRubrique).sort()).toEqual(['conge', 'preavis']);
  });

  it("REFUSE un solde partiel, en nommant chaque rubrique non chiffrée (un total null n'est pas un total)", () => {
    const v = decompteFinal({ ...LICENCIEMENT, executionPreavis: null, gratificationFc: null });
    expect(v.totalBrutFc).toBeNull();
    const { refus } = elementsDuDecompte(v);
    expect(refus.some((m) => m.startsWith('Indemnité compensatrice de préavis non chiffrée'))).toBe(true);
    expect(refus.some((m) => m.startsWith('Gratification non chiffrée'))).toBe(true);
  });

  it("ne range JAMAIS une rubrique inconnue par défaut", () => {
    const v = decompteFinal(LICENCIEMENT);
    const inventee = { ...v, rubriques: [...v.rubriques, { cle: 'prime-de-depart', libelle: 'Prime de départ', montantFc: 1, fondement: 'x', reserve: null }] };
    const { refus, elements } = elementsDuDecompte(inventee);
    expect(refus).toHaveLength(1);
    expect(refus[0]).toContain('Prime de départ');
    expect(elements.some((e) => e.cleRubrique === 'prime-de-depart')).toBe(false);
  });

  it('couvre EXACTEMENT les rubriques que le moteur du décompte sait produire', () => {
    // Lu dans la SOURCE du moteur · une rubrique nouvelle y fait tomber ce test
    // tant que quelqu'un n'a pas décidé de sa nature, et donc de son compte.
    const source = readFileSync(join(__dirname, 'decompte-final.ts'), 'utf8');
    const cles = [...new Set([...source.matchAll(/cle: '([a-z0-9-]+)'/g)].map((m) => m[1]))].sort();
    const servies = [CLE_ARRIERES, ...Object.keys(NATURE_DES_RUBRIQUES)].sort();
    expect(cles).toEqual(servies);
  });

  it("garde l'indemnité de fin de contrat DANS la rémunération et DANS l'imposable", () => {
    // Article 7, point 8 · la liste d'exclusion est fermée ; loi n° 23/053,
    // art. 68, 6° · imposable, aucune immunité de l'art. 69 ne la vise.
    expect(HORS_REMUNERATION_ARTICLE_7).not.toContain('INDEMNITE_DE_FIN_DE_CONTRAT');
    expect(IMMUNITES_ARTICLE_69.map((i) => i.nature)).not.toContain('INDEMNITE_DE_FIN_DE_CONTRAT');
    expect(IMPUTATION_PAR_NATURE.INDEMNITE_DE_FIN_DE_CONTRAT).toBe('INDEMNITES_DE_PREAVIS_ET_LICENCIEMENT');
  });

  it("n'ouvre la nature NI à l'élément saisi NI aux rubriques du cabinet", () => {
    const dto = readFileSync(join(__dirname, 'dto', 'personnel.dto.ts'), 'utf8');
    const rubriques = readFileSync(join(__dirname, 'rubriques-paie.ts'), 'utf8');
    expect(dto.includes("'INDEMNITE_DE_FIN_DE_CONTRAT'")).toBe(false);
    expect(rubriques.includes("'INDEMNITE_DE_FIN_DE_CONTRAT'")).toBe(false);
  });

  it('écrit la réserve du versement unique avec ses deux articles', () => {
    expect(RESERVE_VERSEMENT_UNIQUE).toContain('art. 118 et 119');
    expect(RESERVE_VERSEMENT_UNIQUE).toContain('68, 6°');
  });
});

describe('A8 · au journal, D 6614 / C 422 dans les trois temps de la paie', () => {
  it.each(['SYSCOHADA', 'SYCEBNL'] as const)('passe le préavis au 66140000 et le 422 au brut en %s', (referentiel) => {
    const v = passationPaie({
      referentiel,
      elements: [
        { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire des jours prestés', montantFc: 100_000 },
        { nature: 'INDEMNITE_DE_FIN_DE_CONTRAT', libelle: 'Indemnité compensatrice de préavis', montantFc: 350_000 },
      ],
      cotisations: [{ cle: 'cnss-pension-travailleur', charge: 'TRAVAILLEUR', montantFc: 22_500 }],
      abstentionsCotisations: [],
      irppFc: 40_000,
      netAPayerFc: 450_000 - 22_500 - 40_000,
    });
    expect(v.refus).toEqual([]);
    const brut = v.lignes.filter((l) => l.bloc === 'BRUT');
    expect(brut.find((l) => l.compte === '66140000')).toEqual(expect.objectContaining({ sens: 'DEBIT', montantFc: 350_000 }));
    expect(brut.find((l) => l.compte === '42200000')).toEqual(expect.objectContaining({ sens: 'CREDIT', montantFc: 450_000 }));
    expect(NOMENCLATURE_PAIE.INDEMNITES_DE_PREAVIS_ET_LICENCIEMENT[referentiel]).toBe('66140000');
    expect(v.equilibree).toBe(true);
  });
});

describe('A8 · les arriérés sont les éléments du mois versés en espèces', () => {
  it('additionne au centime et écarte ce qui est fourni en nature', () => {
    expect(
      arrieresDesElements([
        { nature: 'SALAIRE_OU_TRAITEMENT', montantFc: 100_000.105 },
        { nature: 'LOGEMENT_OU_SON_INDEMNITE', montantFc: 20_000 },
        { nature: 'LOGEMENT_OU_SON_INDEMNITE', montantFc: 50_000, enNature: true },
        { nature: 'AVANTAGE_EN_NATURE', montantFc: 9_000 },
      ]),
    ).toBe(120_000.11);
  });
});

describe('A8 · le décompte suit le registre', () => {
  it("refuse un contrat sans fin, ou un mois qui n'est pas celui de la fin", () => {
    expect(motifRefusMoisDeCessation(null, '2026-05')).toContain('pas terminé');
    expect(motifRefusMoisDeCessation(new Date(Date.UTC(2026, 4, 31)), '2026-06')).toContain('2026-05');
    expect(motifRefusMoisDeCessation(new Date(Date.UTC(2026, 4, 31)), '2026-05')).toBeNull();
  });

  it('prend le type du contrat au registre, jamais celui que le client envoie', () => {
    expect(motifRefusTypeContrat('DUREE_INDETERMINEE', 'DUREE_INDETERMINEE')).toBeNull();
    expect(motifRefusTypeContrat('DUREE_INDETERMINEE', 'DUREE_DETERMINEE')).toContain('contredit');
    expect(motifRefusTypeContrat('APPRENTISSAGE', 'DUREE_DETERMINEE')).toContain('autre type');
  });
});
