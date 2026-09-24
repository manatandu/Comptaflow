import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IMPUTATION_PAR_NATURE,
  NATURES_SANS_IMPUTATION,
  NOMENCLATURE_PAIE,
  compteDuRole,
  passationPaie,
  type EntreePassation,
  type RoleComptePaie,
} from './passation-paie';
import { HORS_REMUNERATION_ARTICLE_7 } from './assiettes-paie';

const SEMIS = join(__dirname, '..', 'comptes');
const SEMIS_SYCEBNL = readFileSync(join(SEMIS, 'compte-seed.ts'), 'utf8');
const SEMIS_SYSCOHADA = readFileSync(join(SEMIS, 'compte-seed-syscohada.ts'), 'utf8');

const roles = Object.keys(NOMENCLATURE_PAIE) as RoleComptePaie[];

/**
 * L'AUDIT DE COHÉRENCE DU CHANTIER, et c'est le test qui compte.
 *
 * Règle sortie de la passe F2b : CE QU'ON AFFIRME DU PLAN SE VÉRIFIE CONTRE LE
 * PLAN. Deux specs, en deux passes, ont déjà gardé une phrase fausse sur le
 * semis ; ici la prémisse est relue à chaque exécution.
 */
describe('Chaque numéro de la nomenclature est RÉELLEMENT ouvert dans son semis', () => {
  it.each(roles)('%s · le numéro SYSCOHADA est semé au plan SYSCOHADA', (role) => {
    expect(SEMIS_SYSCOHADA).toContain(`'${NOMENCLATURE_PAIE[role].SYSCOHADA}'`);
  });

  it.each(roles)('%s · le numéro SYCEBNL est semé au plan SYCEBNL', (role) => {
    expect(SEMIS_SYCEBNL).toContain(`'${NOMENCLATURE_PAIE[role].SYCEBNL}'`);
  });

  it("vérifie que les numéros DIVERGENTS ne sont PAS ouverts dans l'autre plan", () => {
    // C'est la moitié qui coûte cher : servir 43130000 à une association
    // l'enverrait sur un compte que son plan n'ouvre pas, et la saisie
    // refuserait APRÈS que le comptable a tout chiffré.
    for (const role of roles) {
      if (!NOMENCLATURE_PAIE[role].divergent) continue;
      expect(SEMIS_SYCEBNL).not.toContain(`'${NOMENCLATURE_PAIE[role].SYSCOHADA}'`);
      expect(SEMIS_SYSCOHADA).not.toContain(`'${NOMENCLATURE_PAIE[role].SYCEBNL}'`);
    }
  });

  it("gèle le décompte · UN SEUL rôle diverge sur les dix-sept", () => {
    const divergents = roles.filter((x) => NOMENCLATURE_PAIE[x].divergent);
    expect(roles).toHaveLength(17);
    expect(divergents).toEqual(['CNSS_PENSIONS']);
  });

  it('recalcule le drapeau divergent au lieu de le croire', () => {
    for (const role of roles) {
      const n = NOMENCLATURE_PAIE[role];
      expect(n.divergent).toBe(n.SYSCOHADA !== n.SYCEBNL);
    }
  });
});

describe("Le piège du 432, et la correction évidente qui est elle-même un piège", () => {
  it('route la retraite OBLIGATOIRE vers 43130000 en SYSCOHADA et 43210000 en SYCEBNL', () => {
    expect(compteDuRole('CNSS_PENSIONS', 'SYSCOHADA')).toBe('43130000');
    expect(compteDuRole('CNSS_PENSIONS', 'SYCEBNL')).toBe('43210000');
  });

  it("ne route JAMAIS vers 43200000, qui est la retraite COMPLÉMENTAIRE au SYSCOHADA", () => {
    // Corriger 4313 en 432 rangerait la cotisation obligatoire sous une nature
    // facultative dans un plan sur deux, sur une écriture équilibrée.
    for (const role of roles) {
      expect(NOMENCLATURE_PAIE[role].SYSCOHADA).not.toBe('43200000');
      expect(NOMENCLATURE_PAIE[role].SYCEBNL).not.toBe('43220000');
    }
    expect(SEMIS_SYSCOHADA).toContain("'43200000', 'Caisses de retraite complémentaire'");
    expect(SEMIS_SYCEBNL).toContain("'43220000', 'Caisses de retraite · complémentaire'");
  });

  it("ne reprend PAS le 4331 ni le 4332 du séminaire CPCC pour l'INPP et l'ONEM", () => {
    // Le séminaire écrit « C/ 4331 INPP · C/ 4332 ONEM ». Faux dans les DEUX
    // plans : 4331 est « Mutuelle », 4332 « Assurances retraite ».
    expect(compteDuRole('INPP', 'SYSCOHADA')).toBe('43340000');
    expect(compteDuRole('ONEM', 'SYCEBNL')).toBe('43350000');
    for (const r of ['SYSCOHADA', 'SYCEBNL'] as const) {
      expect(compteDuRole('INPP', r)).not.toMatch(/^4331|^4332/);
      expect(compteDuRole('ONEM', r)).not.toMatch(/^4331|^4332/);
    }
  });
});

describe('Les deux tables de natures se complètent exactement', () => {
  it("couvre les quinze natures, sans trou ni recouvrement", () => {
    const imputees = Object.keys(IMPUTATION_PAR_NATURE);
    const sansImputation = Object.keys(NATURES_SANS_IMPUTATION);
    expect(imputees.length + sansImputation.length).toBe(15);
    expect(imputees.filter((n) => sansImputation.includes(n))).toEqual([]);
  });

  it("n'impute AUCUNE des quatre natures que le texte ne tranche pas", () => {
    for (const nature of Object.keys(NATURES_SANS_IMPUTATION)) {
      expect(IMPUTATION_PAR_NATURE[nature as never]).toBeUndefined();
    }
    expect(Object.keys(NATURES_SANS_IMPUTATION).sort()).toEqual([
      'ALLOCATIONS_FAMILIALES_LEGALES',
      'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
      'PARTICIPATION_AUX_BENEFICES',
      'SOINS_DE_SANTE',
    ]);
  });

  it("impute bien le logement et le transport, que l'assiette SOCIALE exclut", () => {
    // Piège symétrique de P2a : sortir de l'assiette n'est pas sortir de la
    // comptabilité. Le logement est payé, donc il est en charge.
    expect(HORS_REMUNERATION_ARTICLE_7).toContain('LOGEMENT_OU_SON_INDEMNITE');
    expect(IMPUTATION_PAR_NATURE.LOGEMENT_OU_SON_INDEMNITE).toBe('INDEMNITE_DE_LOGEMENT');
    expect(IMPUTATION_PAR_NATURE.INDEMNITE_DE_TRANSPORT).toBe('INDEMNITE_DE_TRANSPORT');
  });
});

const entree = (over: Partial<EntreePassation> = {}): EntreePassation => ({
  referentiel: 'SYSCOHADA',
  elements: [
    { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
    { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
  ],
  cotisations: [
    { cle: 'cnss-pf', charge: 'EMPLOYEUR', montantFc: 65_000 },
    { cle: 'cnss-pension-employeur', charge: 'EMPLOYEUR', montantFc: 50_000 },
    { cle: 'cnss-pension-travailleur', charge: 'TRAVAILLEUR', montantFc: 50_000 },
    { cle: 'cnss-rp', charge: 'EMPLOYEUR', montantFc: 15_000 },
    { cle: 'inpp', charge: 'EMPLOYEUR', montantFc: 35_000 },
    { cle: 'onem', charge: 'EMPLOYEUR', montantFc: 5_000 },
  ],
  abstentionsCotisations: [],
  irppFc: 100_000,
  netAPayerFc: 1_250_000,
  ...over,
});

describe("L'écriture proposée", () => {
  it("s'équilibre, et le contrôle est fait quand même", () => {
    const v = passationPaie(entree());
    expect(v.refus).toEqual([]);
    expect(v.equilibree).toBe(true);
    // Brut (1 400 000) + retenues (50 000 + 100 000) + patronales (170 000)
    expect(v.totalDebitFc).toBeCloseTo(1_720_000, 6);
    expect(v.totalCreditFc).toBeCloseTo(1_720_000, 6);
  });

  it('présente les trois blocs du Guide, dans son ordre', () => {
    // Guide SYSCOHADA, Partie 1 ch. 3 section 4 et Application 10.
    const blocs = passationPaie(entree()).lignes.map((l) => l.bloc);
    expect([...new Set(blocs)]).toEqual(['BRUT', 'RETENUES', 'PATRONALES']);
    const premierRetenue = blocs.indexOf('RETENUES');
    expect(blocs.slice(premierRetenue).includes('BRUT')).toBe(false);
  });

  it('crédite le 422 du BRUT ENTIER', () => {
    const v = passationPaie(entree());
    const c422 = v.lignes.filter((l) => l.bloc === 'BRUT' && l.compte === '42200000');
    expect(c422).toHaveLength(1);
    expect(c422[0].sens).toBe('CREDIT');
    expect(c422[0].montantFc).toBeCloseTo(1_400_000, 6);
  });

  it('débite le 422 des retenues, et son solde est le net du bulletin', () => {
    const v = passationPaie(entree());
    const d422 = v.lignes.filter((l) => l.bloc === 'RETENUES' && l.compte === '42200000');
    expect(d422).toHaveLength(1);
    expect(d422[0].sens).toBe('DEBIT');
    expect(d422[0].montantFc).toBeCloseTo(150_000, 6);
    const solde = v.lignes
      .filter((l) => l.compte === '42200000')
      .reduce((n, l) => n + (l.sens === 'CREDIT' ? l.montantFc : -l.montantFc), 0);
    expect(solde).toBeCloseTo(1_250_000, 6);
  });

  it("n'impute JAMAIS l'impôt retenu en charge · c'est une retenue sur le salarié", () => {
    const v = passationPaie(entree());
    const irpp = v.lignes.filter((l) => l.compte === '44720000');
    expect(irpp).toHaveLength(1);
    expect(irpp[0]).toMatchObject({ bloc: 'RETENUES', sens: 'CREDIT' });
    expect(irpp[0].montantFc).toBeCloseTo(100_000, 6);
    // Aucune charge de classe 6 n'est débitée hors du brut et des patronales.
    const charges = v.lignes.filter((l) => l.sens === 'DEBIT' && l.compte.startsWith('6'));
    const total = charges.reduce((n, l) => n + l.montantFc, 0);
    expect(total).toBeCloseTo(1_400_000 + 170_000, 6);
  });

  it('sépare la part ouvrière (retenue) de la part patronale (charge) du même compte', () => {
    // Même dette envers la Caisse, deux origines : l'une sort du 422, l'autre
    // du 664. Les fusionner effacerait laquelle des deux est une charge.
    const v = passationPaie(entree());
    const pension = v.lignes.filter((l) => l.compte === '43130000');
    expect(pension.map((l) => l.bloc)).toEqual(['RETENUES', 'PATRONALES']);
    expect(pension.every((l) => l.sens === 'CREDIT')).toBe(true);
    expect(pension.reduce((n, l) => n + l.montantFc, 0)).toBeCloseTo(100_000, 6);
  });

  it('change de numéro de pension selon le référentiel, et le DIT', () => {
    const sys = passationPaie(entree({ referentiel: 'SYSCOHADA' }));
    const syc = passationPaie(entree({ referentiel: 'SYCEBNL' }));
    expect(sys.lignes.some((l) => l.compte === '43130000')).toBe(true);
    expect(syc.lignes.some((l) => l.compte === '43210000')).toBe(true);
    expect(syc.lignes.some((l) => l.compte === '43130000')).toBe(false);
    const ligne = syc.lignes.find((l) => l.compte === '43210000')!;
    expect(ligne.reserve).toContain('PROPRE AU RÉFÉRENTIEL');
  });

  it("met le logement en CHARGE, bien qu'il soit hors assiette sociale", () => {
    const v = passationPaie(entree());
    const logement = v.lignes.find((l) => l.compte === '66310000')!;
    expect(logement.sens).toBe('DEBIT');
    expect(logement.montantFc).toBeCloseTo(400_000, 6);
  });

  it('regroupe deux éléments de même nature sur un seul compte', () => {
    const v = passationPaie(
      entree({
        elements: [
          { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 600_000 },
          { nature: 'COMMISSION', libelle: 'Commission', montantFc: 400_000 },
          { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
        ],
      }),
    );
    const appointements = v.lignes.filter((l) => l.compte === '66110000');
    expect(appointements).toHaveLength(1);
    expect(appointements[0].montantFc).toBeCloseTo(1_000_000, 6);
  });
});

describe('Les quatre refus, et chacun contre un défaut qui laisse la balance bouclée', () => {
  it("refuse une nature que le texte ne tranche pas, en la NOMMANT", () => {
    const v = passationPaie(
      entree({
        elements: [
          { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
          { nature: 'SOINS_DE_SANTE', libelle: 'Frais médicaux', montantFc: 80_000 },
        ],
      }),
    );
    expect(v.lignes).toEqual([]);
    expect(v.refus[0].motif).toBe('NATURE_SANS_IMPUTATION');
    expect(v.refus[0].explication).toContain('Frais médicaux');
    expect(v.refus[0].explication).toContain('66840000');
  });

  it("refuse tant qu'une cotisation est en abstention", () => {
    // L'écriture SERAIT équilibrée, avec une charge de personnel minorée du
    // montant manquant. C'est le §10 bis dans sa forme la plus discrète.
    const v = passationPaie(
      entree({ abstentionsCotisations: ["INPP · la NATURE de l'employeur n'est pas renseignée."] }),
    );
    expect(v.lignes).toEqual([]);
    expect(v.refus[0].motif).toBe('COTISATION_EN_ABSTENTION');
    expect(v.refus[0].explication).toContain('ÉQUILIBRÉE');
  });

  it("refuse tant que l'impôt du mois n'est pas chiffré", () => {
    expect(passationPaie(entree({ irppFc: null })).refus[0].motif).toBe('IMPOT_INDETERMINE');
    expect(passationPaie(entree({ netAPayerFc: null })).refus[0].motif).toBe('IMPOT_INDETERMINE');
  });

  it("REFUSE une écriture déséquilibrée au lieu de la rattraper", () => {
    // Un net faux de 1 FC : le moteur ne pose aucune ligne de bouclage.
    const v = passationPaie(entree({ netAPayerFc: 1_250_001 }));
    expect(v.lignes).toEqual([]);
    expect(v.refus[0].motif).toBe('ECRITURE_DESEQUILIBREE');
    expect(v.refus[0].explication).toContain('défaut du moteur');
  });
});

describe('Ce que la passation annonce', () => {
  it('dit que le règlement est une SECONDE écriture', () => {
    const v = passationPaie(entree());
    const dues = v.lignes.find((l) => l.compte === '42200000')!;
    expect(dues.reserve).toContain('SECONDE ÉCRITURE');
  });

  it("dit qu'elle propose et ne poste pas, et nomme le journal", () => {
    const r = passationPaie(entree()).reserves.join(' ');
    expect(r).toContain('PROPOSE');
    expect(r).toContain('OPÉRATIONS DIVERSES');
  });

  it("écarte le chemin du livre de cours pour les avantages en nature", () => {
    const r = passationPaie(entree()).reserves.join(' ');
    expect(r).toContain('66170000');
    expect(r).toContain('§ 4.5');
    expect(r).toContain('781');
  });
});
