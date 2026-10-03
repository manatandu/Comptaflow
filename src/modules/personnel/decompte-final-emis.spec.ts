import { readFileSync } from 'fs';
import { join } from 'path';
import { decompteFinal, type ParametresDecompte } from './decompte-final';
import {
  AVERTISSEMENT_SANS_COMPTE,
  CLE_ARRIERES,
  RESERVE_ASSIETTE_SOCIALE_INDEMNITE,
  auCentime,
  avertissementsPassation,
  motifsDoubleCompte,
  motifsElementsNegatifs,
  MOTIF_GRATIFICATION,
  NATURE_DES_RUBRIQUES,
  RESERVE_VERSEMENT_UNIQUE,
  arrieresDesElements,
  elementsDuDecompte,
  motifRefusMoisDeCessation,
  motifRefusTypeContrat,
} from './decompte-final-emis';
import { passationPaie, IMPUTATION_PAR_NATURE, NATURES_SANS_IMPUTATION, NOMENCLATURE_PAIE } from './passation-paie';
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
    expect(refus).toContain(MOTIF_GRATIFICATION);
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

describe('A8 · premier tour de relecture · la règle pure', () => {
  it('(k) arrondit chaque rubrique au centime avant d’en faire un élément', () => {
    const v = decompteFinal({ ...LICENCIEMENT, remunerationJournaliereFc: 10_000.0003 });
    const { elements, refus } = elementsDuDecompte(v);
    expect(refus).toEqual([]);
    for (const e of elements) expect(auCentime(e.montantFc)).toBe(e.montantFc);
  });

  it("ASSIETTE · des avantages compris dans le préavis et NON ventilés refusent · logement et transport sont exclus nommément (art. 7, point 8)", () => {
    const v = decompteFinal({ ...LICENCIEMENT, avantagesPendantPreavisFc: 35_000 });
    const { refus } = elementsDuDecompte(v);
    expect(refus.join(' ')).toContain('ventilez-les');
  });

  it('ASSIETTE · ventilés, ils sortent sous leur nature, le reste garde la réserve « corpus muet »', () => {
    const v = decompteFinal({ ...LICENCIEMENT, avantagesPendantPreavisFc: 35_000 });
    const { elements, refus } = elementsDuDecompte(v, [
      { rubrique: 'preavis', nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 20_000 },
      { rubrique: 'preavis', nature: 'REMUNERATION', libelle: 'Véhicule de fonction', montantFc: 15_000 },
    ]);
    expect(refus).toEqual([]);
    const preavis = elements.filter((e) => e.cleRubrique === 'preavis');
    expect(preavis.map((e) => [e.nature, e.montantFc])).toEqual([
      ['INDEMNITE_DE_FIN_DE_CONTRAT', 350_000],
      ['LOGEMENT_OU_SON_INDEMNITE', 20_000],
      ['INDEMNITE_DE_FIN_DE_CONTRAT', 15_000],
    ]);
    expect(preavis[0].reserve).toBe(RESERVE_ASSIETTE_SOCIALE_INDEMNITE);
    expect(preavis[1].reserve).toBeNull();
    // La phrase retirée ne revient pas · la réserve dit que le corpus se tait.
    expect(RESERVE_ASSIETTE_SOCIALE_INDEMNITE).toContain('le corpus se tait');
    expect(RESERVE_ASSIETTE_SOCIALE_INDEMNITE).toContain('mention 20');
  });

  it('ASSIETTE · une ventilation qui ne fait pas le compte, ou qui vise une rubrique sans avantages, refuse', () => {
    const v = decompteFinal({ ...LICENCIEMENT, avantagesPendantPreavisFc: 35_000 });
    expect(
      elementsDuDecompte(v, [{ rubrique: 'preavis', nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 30_000 }]).refus.join(' '),
    ).toContain('30000.00 FC ventilés');
    const sans = decompteFinal(LICENCIEMENT);
    expect(
      elementsDuDecompte(sans, [{ rubrique: 'preavis', nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 1 }]).refus.join(' '),
    ).toContain('aucun avantage à ventiler');
  });

  it('(m) refuse une nature payée à la fois par le mois et par une rubrique du décompte', () => {
    const { elements } = elementsDuDecompte(decompteFinal(LICENCIEMENT));
    expect(motifsDoubleCompte([{ nature: 'SALAIRE_OU_TRAITEMENT', montantFc: 1 }], elements)).toEqual([]);
    const m = motifsDoubleCompte([{ nature: 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE', montantFc: 10 }], elements);
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('versée deux fois');
  });

  it('(j) un élément négatif ou illisible est nommé, jamais ramené à zéro', () => {
    expect(motifsElementsNegatifs([{ libelle: 'Salaire', montantFc: 10 }])).toEqual([]);
    expect(motifsElementsNegatifs([{ libelle: 'Salaire', montantFc: -1 }])[0]).toContain('« Salaire »');
    expect(motifsElementsNegatifs([{ libelle: 'Prime', montantFc: Number.NaN }])).toHaveLength(1);
    // Et les arriérés ne posent plus de plancher · la somme dit ce qu'on lui donne.
    expect(arrieresDesElements([{ nature: 'SALAIRE_OU_TRAITEMENT', montantFc: -5 }])).toBe(-5);
  });

  it("(n) les allocations familiales avertissent qu'elles ne passeront pas au journal, rien n'est imputé à leur place", () => {
    // Le montant de la colonne 19 dépend de la grille du mois · le câblage le
    // rejoue sur le registre (`decompte-final-emis-service.spec.ts`) ; ici, la règle.
    const elements = [
      { nature: 'INDEMNITE_DE_FIN_DE_CONTRAT' },
      { nature: 'ALLOCATIONS_FAMILIALES_LEGALES' },
      { nature: 'ALLOCATIONS_FAMILIALES_LEGALES' },
    ];
    const a = avertissementsPassation(elements, NATURES_SANS_IMPUTATION);
    expect(a).toEqual([`ALLOCATIONS_FAMILIALES_LEGALES · ${AVERTISSEMENT_SANS_COMPTE}`]);
    expect(avertissementsPassation(elementsDuDecompte(decompteFinal(LICENCIEMENT)).elements, NATURES_SANS_IMPUTATION)).toEqual([]);
  });
});
