import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Referentiel, SensDepreciation, StatutExercice, StatutImmobilisation } from '@prisma/client';
import {
  MOTIF_DEPRECIE,
  coefficientApplique,
  partsDuSupplement,
  MOTIF_DIVISION_20,
  MOTIF_ELEMENT_MONETAIRE,
  RACINES_ELEMENTS_MONETAIRES,
  estElementMonetaire,
  anneesRestantes,
  compteEcart,
  imputationSurEcart,
  lignesBien,
  natureReevaluable,
  reevaluerBien,
  supplementDotation,
  type BienAReevaluer,
  type Operation,
  type ResultatBien,
} from './reevaluation-bilan';
import { ReevaluationBilanService } from './reevaluation-bilan.service';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * LOT 14 · RÉÉVALUATION DES IMMOBILISATIONS (AUDCIF art. 35, 62 à 65 ;
 * Titre VIII ch. 28, ch. 12 § 2.5 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3 ; loi
 * n° 23/053, art. 129 à 138). Les exemples chiffrés du texte sont éprouvés
 * tels quels.
 */
const D = (s: string) => new Date(`${s}T00:00:00Z`);

const bien = (o: Partial<BienAReevaluer> = {}): BienAReevaluer => ({
  id: 'b1',
  designation: 'Machine',
  numeroCompte: '24110000',
  valeurOrigine: 1000,
  valeurResiduelle: 0,
  cumulAmortissements: 400,
  cumulDepreciation: 0,
  amortissable: true,
  lineaire: true,
  planCommence: true,
  anneesRestantes: 6,
  coefficientsAnterieurs: [],
  ...o,
});
const legale = (o: Partial<Operation> = {}): Operation => ({
  referentiel: 'SYSCOHADA',
  type: 'LEGALE',
  methodeLibre: null,
  neutraliteFiscale: false,
  coefficients: { AUTRES: 1.5 },
  bases: {},
  ...o,
});
const libre = (methodeLibre: 'AJUSTEMENT' | 'ELIMINATION', o: Partial<Operation> = {}): Operation => ({
  referentiel: 'SYSCOHADA',
  type: 'LIBRE',
  methodeLibre,
  neutraliteFiscale: false,
  coefficients: {},
  bases: {},
  ...o,
});
const ok = (r: ResultatBien | { refus: string }): ResultatBien => {
  if ('refus' in r) throw new Error(r.refus);
  return r;
};

describe('le périmètre · corporelles et financières, ni incorporel, ni avance', () => {
  it('22, 23, 24 corporelles · 26, 27 financières · 21, 25 hors périmètre, aux deux plans', () => {
    for (const ref of ['SYSCOHADA', 'SYCEBNL'] as const) {
      expect(natureReevaluable('22100000', ref)).toBe('CORPORELLE');
      expect(natureReevaluable('23110000', ref)).toBe('CORPORELLE');
      expect(natureReevaluable('24410000', ref)).toBe('CORPORELLE');
      expect(natureReevaluable('26100000', ref)).toBe('FINANCIERE');
      expect(natureReevaluable('27100000', ref)).toBe('FINANCIERE');
      for (const n of ['20110000', '21300000', '25100000', '28310000']) expect(natureReevaluable(n, ref)).toBeNull();
    }
  });

  it('un numéro, deux sens · au SYCEBNL, 202 à 205 sont des biens corporels et financiers reçus à vendre (D-29)', () => {
    expect(natureReevaluable('20300000', 'SYCEBNL')).toBe('CORPORELLE');
    expect(natureReevaluable('20500000', 'SYCEBNL')).toBe('FINANCIERE');
    expect(natureReevaluable('20300000', 'SYSCOHADA')).toBeNull();
    // Relu dans le semis · le 20 du SYCEBNL est bien celui des biens reçus destinés à la vente.
    const intitule = (n: string) => PLAN_COMPTES_SYCEBNL.find((c) => c.numero === n)?.intitule ?? '';
    for (const n of ['20200000', '20300000', '20400000', '20500000']) expect(intitule(n)).toMatch(/destinés à la vente/);
    expect(PLAN_COMPTES_SYSCOHADA.some((c) => c.numero.startsWith('20'))).toBe(false);
  });

  it('le bien reçu destiné à la vente reste dans l’opération à sa valeur, sans valeur actuelle exigée, motif écrit', () => {
    const r = ok(reevaluerBien(bien({ numeroCompte: '20300000', cumulAmortissements: 0 }), {}, libre('AJUSTEMENT', { referentiel: 'SYCEBNL' })));
    expect(r).toMatchObject({ ecart: 0, compteEcart: null, motifNonReevalue: MOTIF_DIVISION_20 });
  });
});

describe('ch. 28 § 4.2.1 · les deux exemples de la réévaluation légale', () => {
  it('exemple 1 · 1 000 brut, 400 amortis, k = 1,5, valeur actuelle au-dessus · 1 500, 600, 900', () => {
    const r = ok(reevaluerBien(bien(), { categorie: 'AUTRES', valeurActuelle: 1000 }, legale()));
    expect(r).toMatchObject({ brutApres: 1500, amortissementsApres: 600, valeurReevaluee: 900, ecart: 300, coefficientRetenu: 1.5, compteEcart: '10610000' });
  });

  it('exemple 2 · valeur actuelle 840 · k’ = 1,4, 1 400, 560, écart 240, et l’écriture du § 4.2.4.1', () => {
    const r = ok(reevaluerBien(bien(), { categorie: 'AUTRES', valeurActuelle: 840 }, legale()));
    expect(r).toMatchObject({ brutApres: 1400, amortissementsApres: 560, valeurReevaluee: 840, ecart: 240 });
    expect(r.coefficientRetenu).toBeCloseTo(1.4, 10);
    expect(r.coefficient).toBe(1.5);
    expect(lignesBien(r, 'AJUSTEMENT')).toEqual([
      { role: 'BIEN', debit: 400, credit: 0 },
      { role: 'AMORTISSEMENT', debit: 0, credit: 160 },
      { role: 'ECART', debit: 0, credit: 240 },
    ]);
  });

  it('neutralité fiscale · le 154 au lieu du 1061, du même montant', () => {
    const r = ok(reevaluerBien(bien(), { categorie: 'AUTRES', valeurActuelle: 840 }, legale({ neutraliteFiscale: true })));
    expect(r.compteEcart).toBe('15400000');
    expect(r.ecart).toBe(240);
  });

  it('neutralité fiscale sur un bien NON amortissable · l’écart reste au 106 (ch. 16 § 2.6, D-43)', () => {
    // Le 154 ne se reprend qu'au supplément de dotation (§ 4.2.4.2) · sur un
    // terrain, il resterait au passif pour toujours.
    const terrain = bien({ numeroCompte: '22200000', cumulAmortissements: 0, amortissable: false });
    const r = ok(reevaluerBien(terrain, { categorie: 'AUTRES', valeurActuelle: 1500 }, legale({ neutraliteFiscale: true })));
    expect(r).toMatchObject({ compteEcart: '10610000', ecart: 500 });
    const sycebnl = ok(
      reevaluerBien(terrain, { categorie: 'AUTRES', valeurActuelle: 1500, droitDeReprise: false }, legale({ neutraliteFiscale: true, referentiel: 'SYCEBNL' })),
    );
    expect(sycebnl.compteEcart).toBe('10611000');
    const source = readFileSync(join(__dirname, 'reevaluation-bilan.ts'), 'utf8');
    expect(source).toContain('décision proposée D-43');
  });

  it('légale · un bien totalement amorti est gardé sans valeur actuelle exigée (D-37)', () => {
    const r = ok(reevaluerBien(bien({ cumulAmortissements: 1000 }), { categorie: 'AUTRES' }, legale()));
    expect(r).toMatchObject({ ecart: 0, motifNonReevalue: expect.stringMatching(/Valeur nette nulle/) });
    // En libre, la valeur actuelle reste exigée · positive, elle appelle un nouveau plan.
    expect(reevaluerBien(bien({ cumulAmortissements: 1000 }), {}, libre('AJUSTEMENT'))).toHaveProperty('refus', expect.stringMatching(/Valeur actuelle/));
  });

  it('un bien non amortissable · D 2 / C 106 de l’écart, aucun 28', () => {
    const r = ok(reevaluerBien(bien({ numeroCompte: '22200000', cumulAmortissements: 0, amortissable: false }), { categorie: 'AUTRES', valeurActuelle: 5000 }, legale()));
    expect(lignesBien(r, 'AJUSTEMENT')).toEqual([
      { role: 'BIEN', debit: 500, credit: 0 },
      { role: 'ECART', debit: 0, credit: 500 },
    ]);
  });
});

describe('ch. 28 § 4.3 · l’exemple de la réévaluation libre, deux méthodes', () => {
  const batiment = bien({ numeroCompte: '23110000', valeurOrigine: 150_000_000, cumulAmortissements: 30_000_000, anneesRestantes: 24 });
  it('méthode 1 · D 23 18 750 000 / C 283 3 750 000 / C 1062 15 000 000', () => {
    const r = ok(reevaluerBien(batiment, { valeurActuelle: 135_000_000 }, libre('AJUSTEMENT')));
    expect(r).toMatchObject({ brutApres: 168_750_000, amortissementsApres: 33_750_000, ecart: 15_000_000, compteEcart: '10620000' });
    expect(lignesBien(r, 'AJUSTEMENT')).toEqual([
      { role: 'BIEN', debit: 18_750_000, credit: 0 },
      { role: 'AMORTISSEMENT', debit: 0, credit: 3_750_000 },
      { role: 'ECART', debit: 0, credit: 15_000_000 },
    ]);
  });

  it('méthode 2 · les deux étapes du texte, le 23 à 135 000 000 et le 283 à zéro', () => {
    const r = ok(reevaluerBien(batiment, { valeurActuelle: 135_000_000 }, libre('ELIMINATION')));
    expect(r).toMatchObject({ brutApres: 135_000_000, amortissementsApres: 0, deltaAmortissements: -30_000_000, ecart: 15_000_000 });
    expect(lignesBien(r, 'ELIMINATION')).toEqual([
      { role: 'AMORTISSEMENT', debit: 30_000_000, credit: 0 },
      { role: 'BIEN', debit: 0, credit: 30_000_000 },
      { role: 'BIEN', debit: 15_000_000, credit: 0 },
      { role: 'ECART', debit: 0, credit: 15_000_000 },
    ]);
  });

  it('les 24 annuités restantes du § 4.3.2 (30 − 6), 135 000 000 / 24 = 5 625 000', () => {
    const reste = anneesRestantes({
      dureeAns: 30,
      valeurOrigine: 150_000_000,
      valeurResiduelle: 0,
      valeurNette: 120_000_000,
      revision: null,
      ouvertureSuivante: D('2027-01-01'),
    });
    expect(reste).toBe(24);
    expect(135_000_000 / reste!).toBe(5_625_000);
  });

  it('un reste fractionnaire (premier exercice au prorata) n’est pas entier · null', () => {
    expect(
      anneesRestantes({ dureeAns: 10, valeurOrigine: 1000, valeurResiduelle: 0, valeurNette: 650, revision: null, ouvertureSuivante: D('2027-01-01') }),
    ).toBeNull();
  });

  it('une révision prospective active · sa durée résiduelle moins les années écoulées', () => {
    expect(
      anneesRestantes({
        dureeAns: 10,
        valeurOrigine: 1000,
        valeurResiduelle: 0,
        valeurNette: 400,
        revision: { effet: D('2025-01-01'), dureeResiduelleAns: 8 },
        ouvertureSuivante: D('2027-01-01'),
      }),
    ).toBe(6);
  });
});

describe('ce que l’opération refuse · elle ne se fait jamais en partie', () => {
  it('sans valeur actuelle déclarée (art. 63)', () => {
    expect(reevaluerBien(bien(), { categorie: 'AUTRES' }, legale())).toHaveProperty('refus', expect.stringMatching(/art\. 63/));
  });
  it('une valeur retenue sous la valeur nette · la dépréciation d’abord (ch. 12)', () => {
    expect(reevaluerBien(bien(), { categorie: 'AUTRES', valeurActuelle: 500 }, legale())).toHaveProperty('refus', expect.stringMatching(/dépréciation/));
    expect(reevaluerBien(bien(), { valeurActuelle: 599 }, libre('AJUSTEMENT'))).toHaveProperty('refus');
  });
  it('légale sans coefficient pour la catégorie du bien', () => {
    expect(reevaluerBien(bien(), { categorie: 'TITRES', valeurActuelle: 900 }, legale())).toHaveProperty('refus', expect.stringMatching(/coefficient/));
  });
  it('SYCEBNL sans droit de reprise déclaré', () => {
    expect(reevaluerBien(bien(), { valeurActuelle: 900 }, libre('AJUSTEMENT', { referentiel: 'SYCEBNL' }))).toHaveProperty('refus', expect.stringMatching(/droit de reprise/));
  });
  it('libre sur un bien totalement amorti déclaré à une valeur positive · le § 4.2.2 veut un nouveau plan', () => {
    expect(reevaluerBien(bien({ cumulAmortissements: 1000 }), { valeurActuelle: 300 }, libre('AJUSTEMENT'))).toHaveProperty('refus', expect.stringMatching(/4\.2\.2/));
  });
  it('méthode 2 hors du linéaire, ou sur un reste fractionnaire', () => {
    expect(reevaluerBien(bien({ lineaire: false }), { valeurActuelle: 900 }, libre('ELIMINATION'))).toHaveProperty('refus', expect.stringMatching(/linéaire/));
    expect(reevaluerBien(bien({ anneesRestantes: null }), { valeurActuelle: 900 }, libre('ELIMINATION'))).toHaveProperty('refus', expect.stringMatching(/entier/));
  });
  it('la provision spéciale ne s’écrit pas pour une réévaluation libre', () => {
    expect(compteEcart({ referentiel: 'SYSCOHADA', type: 'LIBRE', neutraliteFiscale: true, nature: 'CORPORELLE', amortissable: true, droitDeReprise: null })).toHaveProperty('motif');
  });
});

describe('§ 4.2.3 · le bien déprécié reste dans l’opération à sa valeur nette, avec son motif', () => {
  it('aucun écart, motif écrit, jamais écarté en silence', () => {
    const r = ok(reevaluerBien(bien({ cumulDepreciation: 100 }), { categorie: 'AUTRES', valeurActuelle: 2000 }, legale()));
    expect(r).toMatchObject({ ecart: 0, valeurReevaluee: 500, motifNonReevalue: MOTIF_DEPRECIE });
    expect(lignesBien(r, 'AJUSTEMENT')).toEqual([]);
  });
  it('appliqué aussi à la réévaluation libre (D-44), sans valeur actuelle exigée', () => {
    const r = ok(reevaluerBien(bien({ cumulDepreciation: 100 }), {}, libre('AJUSTEMENT')));
    expect(r).toMatchObject({ ecart: 0, motifNonReevalue: MOTIF_DEPRECIE });
  });
});

describe('un numéro, deux sens · le compte de l’écart lu dans CHAQUE semis', () => {
  const intitule = (plan: ReadonlyArray<unknown>, numero: string) => {
    const l = (plan as ReadonlyArray<unknown[] | { numero: string; intitule: string }>).find((x) => (Array.isArray(x) ? x[0] === numero : x.numero === numero));
    return l === undefined ? undefined : Array.isArray(l) ? String(l[1]) : l.intitule;
  };
  it('SYSCOHADA · 1061 légale, 1062 libre ; SYCEBNL · sans ou avec droit de reprise, corporelles ou financières', () => {
    const c = (o: Parameters<typeof compteEcart>[0]) => ('compte' in compteEcart(o) ? (compteEcart(o) as { compte: string }).compte : null);
    expect(c({ referentiel: 'SYSCOHADA', type: 'LEGALE', neutraliteFiscale: false, nature: 'CORPORELLE', amortissable: true, droitDeReprise: null })).toBe('10610000');
    expect(c({ referentiel: 'SYSCOHADA', type: 'LIBRE', neutraliteFiscale: false, nature: 'FINANCIERE', amortissable: true, droitDeReprise: null })).toBe('10620000');
    expect(c({ referentiel: 'SYCEBNL', type: 'LEGALE', neutraliteFiscale: false, nature: 'CORPORELLE', amortissable: true, droitDeReprise: false })).toBe('10611000');
    expect(c({ referentiel: 'SYCEBNL', type: 'LIBRE', neutraliteFiscale: false, nature: 'FINANCIERE', amortissable: true, droitDeReprise: false })).toBe('10612000');
    expect(c({ referentiel: 'SYCEBNL', type: 'LIBRE', neutraliteFiscale: false, nature: 'CORPORELLE', amortissable: true, droitDeReprise: true })).toBe('10621000');
    expect(c({ referentiel: 'SYCEBNL', type: 'LIBRE', neutraliteFiscale: false, nature: 'FINANCIERE', amortissable: true, droitDeReprise: true })).toBe('10622000');

    expect(intitule(PLAN_COMPTES_SYSCOHADA, '10610000')).toMatch(/réévaluation légale/i);
    expect(intitule(PLAN_COMPTES_SYSCOHADA, '10620000')).toMatch(/réévaluation libre/i);
    expect(intitule(PLAN_COMPTES_SYCEBNL, '10611000')).toMatch(/sans droit de reprise.*corporelles/i);
    expect(intitule(PLAN_COMPTES_SYCEBNL, '10612000')).toMatch(/sans droit de reprise.*financières/i);
    expect(intitule(PLAN_COMPTES_SYCEBNL, '10621000')).toMatch(/avec droit de reprise.*corporelles/i);
    expect(intitule(PLAN_COMPTES_SYCEBNL, '10622000')).toMatch(/avec droit de reprise.*financières/i);
    // Les numéros d'un plan ne sont pas ouverts dans l'autre · servis à
    // l'autre référentiel, ils tomberaient sur un compte absent.
    expect(intitule(PLAN_COMPTES_SYCEBNL, '10610000')).toBeUndefined();
    expect(intitule(PLAN_COMPTES_SYSCOHADA, '10611000')).toBeUndefined();
    for (const plan of [PLAN_COMPTES_SYSCOHADA, PLAN_COMPTES_SYCEBNL]) {
      expect(intitule(plan, '15400000')).toMatch(/provisions spéciales de réévaluation/i);
      expect(intitule(plan, '86100000')).toMatch(/reprises.*provisions réglementées/i);
    }
  });
});

describe('ch. 28 § 4.2.4.2 · la reprise de la provision spéciale, au supplément de la dotation', () => {
  it('140 de dotation à k’ = 1,4 · 40 repris (100 avant la réévaluation)', () => {
    expect(supplementDotation({ dotation: 140, coefficientRetenu: 1.4, produitPosterieur: 1, resteProvision: 240 })).toBe(40);
  });
  it('bornée au solde de la provision, nulle sans hausse', () => {
    expect(supplementDotation({ dotation: 140, coefficientRetenu: 1.4, produitPosterieur: 1, resteProvision: 25 })).toBe(25);
    expect(supplementDotation({ dotation: 140, coefficientRetenu: 1, produitPosterieur: 1, resteProvision: 240 })).toBe(0);
  });
  it('le 861, jamais le 799 du ch. 16 § 2.6 · l’anomalie est écrite dans la source', () => {
    const source = readFileSync(join(__dirname, 'reevaluation-bilan.ts'), 'utf8');
    expect(source).toContain("export const COMPTE_REPRISE_PROVISION_SPECIALE = '86100000'");
    expect(source).toContain('ANOMALIE DU TEXTE, SIGNALÉE');
  });
});

describe('ch. 12 § 2.5 · la perte d’un bien réévalué s’impute d’abord sur l’écart', () => {
  it('exemple du texte · perte 15 000 000, écart 6 000 000 · 6 000 000 au 1062, 9 000 000 en charges', () => {
    expect(imputationSurEcart(15_000_000, [{ id: 'l1', compteEcart: '10620000', reste: 6_000_000 }])).toEqual({
      parEcart: [{ id: 'l1', compteEcart: '10620000', montant: 6_000_000 }],
      enCharge: 9_000_000,
    });
  });
  it('la provision spéciale (154) ne reçoit rien', () => {
    expect(imputationSurEcart(100, [{ id: 'l1', compteEcart: '15400000', reste: 500 }])).toEqual({ parEcart: [], enCharge: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Le service · périmètre, opération entière, écriture, fiches mises à jour.
// ─────────────────────────────────────────────────────────────────────────

type Fiche = {
  id: string;
  designation: string;
  numero: string;
  valeurOrigine: number;
  amortissementAnterieur?: number;
  dotations?: Array<{ montant: number; exerciceId: string; dateFin: Date }>;
  depreciations?: Array<{ sens: SensDepreciation; montant: number }>;
  degressifFiscal?: boolean;
  dateMiseEnService?: Date | null;
  dureeAmortissementAns?: number;
  statut?: StatutImmobilisation;
  dateSortie?: Date | null;
  /** Numéro du compte en cours (2x9) quand le bien y est inscrit. */
  enCours?: string;
  /** Coefficients retenus des réévaluations d'exercices antérieurs, dans l'ordre. */
  anterieurs?: number[];
};

function monterService(fiches: Fiche[], o: { referentiel?: Referentiel; existante?: boolean } = {}) {
  const creer = jest.fn().mockResolvedValue({ id: 'ec' });
  const mises: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const lignesCreees: unknown[] = [];
  const revisions: Array<Record<string, unknown>> = [];
  const prisma: Record<string, unknown> = {
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', statut: StatutExercice.OUVERT, dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA, jeuEtatsFinanciersSycebnl: null }) },
    immobilisation: {
      findMany: jest.fn((a: { where: { id?: unknown } }) => {
        if (a.where.id) {
          return Promise.resolve(
            fiches.map((f) => ({
              id: f.id,
              compteImmobilisationId: `c${f.numero}`,
              compteEnCoursId: f.enCours ? `c${f.enCours}` : null,
              dateMiseEnService: f.dateMiseEnService === undefined ? D('2023-01-01') : f.dateMiseEnService,
              compteAmortissementId: `a${f.numero}`,
            })),
          );
        }
        return Promise.resolve(
          fiches.map((f) => ({
            id: f.id,
            designation: f.designation,
            compteImmobilisationId: `c${f.numero}`,
            compteEnCoursId: f.enCours ? `c${f.enCours}` : null,
            compteImmobilisation: { numero: f.numero, intitule: 'x' },
            compteEnCours: f.enCours ? { id: `c${f.enCours}`, numero: f.enCours, intitule: 'en cours' } : null,
            valeurOrigine: f.valeurOrigine,
            valeurResiduelle: 0,
            amortissementAnterieur: f.amortissementAnterieur ?? 0,
            amortissementsDetaches: 0,
            reprisesAmortissement: 0,
            amortissementsReevaluation: 0,
            dureeNonLimitee: false,
            dateMiseEnService: f.dateMiseEnService === undefined ? D('2023-01-01') : f.dateMiseEnService,
            dureeAmortissementAns: f.dureeAmortissementAns ?? 10,
            statut: f.statut ?? StatutImmobilisation.EN_SERVICE,
            dateSortie: f.dateSortie ?? null,
            modeAmortissement: 'LINEAIRE',
            degressifFiscal: !!f.degressifFiscal,
            dateEffetRevisionPlan: null,
            dureeResiduelleRevisee: null,
            dotations: (f.dotations ?? []).map((d) => ({ montant: d.montant, exerciceId: d.exerciceId, exercice: { dateFin: d.dateFin } })),
            depreciations: f.depreciations ?? [],
            lignesReevaluation: (f.anterieurs ?? []).map((k, i) => ({
              coefficientRetenu: k,
              reevaluation: { dateReevaluation: D(`${2020 + i}-12-31`) },
            })),
          })),
        );
      }),
      update: jest.fn((a: { where: { id: string }; data: Record<string, unknown> }) => {
        mises.push(a);
        return Promise.resolve(a);
      }),
    },
    reevaluationBilan: {
      findFirst: jest.fn().mockResolvedValue(o.existante ? { id: 'r0', lignes: [] } : null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'r1', ...data })),
    },
    ligneReevaluationBilan: {
      createMany: jest.fn(({ data }: { data: unknown[] }) => {
        lignesCreees.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    compte: {
      findMany: jest.fn(({ where }: { where: { numero: { in: string[] } } }) => Promise.resolve(where.numero.in.map((numero) => ({ id: `n${numero}`, numero })))),
    },
    revisionPlanAmortissement: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        revisions.push(data);
        return Promise.resolve({ id: 'rv', ...data });
      }),
    },
    ligneEcriture: { deleteMany: jest.fn() },
    ecriture: { delete: jest.fn() },
  };
  prisma.$transaction = jest.fn((f: (tx: unknown) => unknown) => f(prisma));
  return { svc: new ReevaluationBilanService(prisma as never, { creer } as never), creer, prisma, mises, lignesCreees, revisions };
}

const machine: Fiche = {
  id: 'b1',
  designation: 'Machine',
  numero: '24110000',
  valeurOrigine: 1000,
  amortissementAnterieur: 300,
  dotations: [{ montant: 100, exerciceId: 'e26', dateFin: D('2026-12-31') }],
};
const corpsLegal = {
  exerciceId: 'e26',
  journalId: 'j',
  type: 'LEGALE' as const,
  decision: 'Conseil du 15 mars',
  traitementFiscal: 'Écart exonéré',
  methodeEvaluation: 'Méthode indiciaire légale',
  categories: [{ cle: 'AUTRES', libelle: 'Autres biens', coefficient: 1.5, source: 'Arrêté n° X' }],
  lignes: [{ immobilisationId: 'b1', categorie: 'AUTRES', valeurActuelle: 840 }],
};

describe('le service · l’opération entière, une écriture, les fiches réévaluées', () => {
  it('D 24 400 / C 28 160 / C 1061 240 au 31 décembre, la fiche à 1 400 et 160 de plus au cumul', async () => {
    const { svc, creer, mises, lignesCreees, revisions } = monterService([machine]);
    const r = await svc.reevaluer('t', 'u', corpsLegal);
    expect(r.totalEcart).toBe(240);
    expect(creer.mock.calls[0][2]).toMatchObject({
      date: '2026-12-31',
      lignes: [
        { compteId: 'c24110000', debit: 400, credit: 0 },
        { compteId: 'a24110000', debit: 0, credit: 160 },
        { compteId: 'n10610000', debit: 0, credit: 240 },
      ],
    });
    expect(mises).toEqual([{ where: { id: 'b1' }, data: { valeurOrigine: 1400, valeurResiduelle: 0, amortissementsReevaluation: { increment: 160 } } }]);
    expect(lignesCreees).toHaveLength(1);
    expect(revisions).toEqual([]);
  });

  it('méthode 2 · la révision prospective prend effet à l’ouverture suivante, sur les annuités restantes', async () => {
    const batiment: Fiche = {
      id: 'b1',
      designation: 'Bâtiment',
      numero: '23110000',
      valeurOrigine: 150_000_000,
      amortissementAnterieur: 25_000_000,
      dureeAmortissementAns: 30,
      dotations: [{ montant: 5_000_000, exerciceId: 'e26', dateFin: D('2026-12-31') }],
    };
    const { svc, mises, revisions } = monterService([batiment]);
    await svc.reevaluer('t', 'u', {
      ...corpsLegal,
      type: 'LIBRE',
      methodeLibre: 'ELIMINATION',
      categories: undefined,
      lignes: [{ immobilisationId: 'b1', valeurActuelle: 135_000_000 }],
    } as never);
    expect(mises[0].data).toEqual({
      valeurOrigine: 135_000_000,
      valeurResiduelle: 0,
      amortissementsReevaluation: { increment: -30_000_000 },
      dateEffetRevisionPlan: D('2027-01-01'),
      dureeResiduelleRevisee: 24,
    });
    // L'historique des révisions (lot 11) nomme la révision que la méthode 2 pose.
    expect(revisions).toEqual([
      expect.objectContaining({ immobilisationId: 'b1', exerciceId: 'e26', nature: 'PROSPECTIVE', dureeAvantAns: 30, dureeApresAns: 24, motif: expect.stringMatching(/méthode 2/) }),
    ]);
  });

  it('réévaluation PARTIELLE refusée · un bien du périmètre manque, rien n’est écrit', async () => {
    const autre: Fiche = { ...machine, id: 'b2', designation: 'Camion' };
    const { svc, creer } = monterService([machine, autre]);
    await expect(svc.reevaluer('t', 'u', corpsLegal)).rejects.toThrow(/partielle est interdite.*Camion/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('dotation de l’exercice non passée · refusée, la dotation se passe avant', async () => {
    const { svc, creer } = monterService([{ ...machine, dotations: [] }]);
    await expect(svc.reevaluer('t', 'u', corpsLegal)).rejects.toThrow(/Dotation de l'exercice non passée/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('bien sous option dégressive fiscale · refusé, le dérogatoire ne se recalcule pas', async () => {
    const { svc, creer } = monterService([{ ...machine, degressifFiscal: true }]);
    await expect(svc.reevaluer('t', 'u', corpsLegal)).rejects.toThrow(/dégressive fiscale/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une seconde réévaluation du même exercice · 409', async () => {
    const { svc, creer } = monterService([machine], { existante: true });
    await expect(svc.reevaluer('t', 'u', corpsLegal)).rejects.toThrow(/déjà enregistrée/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('légale sans catégorie déclarée, ou sans décision des organes de gestion · refusée', async () => {
    const { svc, creer } = monterService([machine]);
    await expect(svc.reevaluer('t', 'u', { ...corpsLegal, categories: [] })).rejects.toThrow(/catégorie/);
    await expect(svc.reevaluer('t', 'u', { ...corpsLegal, decision: '  ' })).rejects.toThrow(/art\. 35/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('la provision spéciale demandée sur une réévaluation libre · refusée à la porte, même sans écart', async () => {
    const { svc, creer } = monterService([machine]);
    await expect(
      svc.reevaluer('t', 'u', {
        ...corpsLegal,
        type: 'LIBRE',
        methodeLibre: 'AJUSTEMENT',
        neutraliteFiscale: true,
        categories: undefined,
        lignes: [{ immobilisationId: 'b1', valeurActuelle: 600 }],
      } as never),
    ).rejects.toThrow(/154.*que pour une réévaluation légale/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('le bien déprécié reste dans l’opération sans écart, avec son motif', async () => {
    const deprecie: Fiche = { ...machine, id: 'b2', designation: 'Camion', depreciations: [{ sens: SensDepreciation.DOTATION, montant: 50 }] };
    const { svc, lignesCreees, mises } = monterService([machine, deprecie]);
    await svc.reevaluer('t', 'u', { ...corpsLegal, lignes: [...corpsLegal.lignes, { immobilisationId: 'b2', categorie: 'AUTRES', valeurActuelle: 0 }] });
    expect(lignesCreees).toContainEqual(expect.objectContaining({ immobilisationId: 'b2', ecart: 0, motifNonReevalue: MOTIF_DEPRECIE }));
    expect(mises.map((m) => m.where.id)).toEqual(['b1']);
  });

  it('le périmètre lit les divisions 22, 23, 24, 26 et 27, en service à la clôture OU sorties après elle', async () => {
    const { svc, prisma } = monterService([machine]);
    await svc.perimetre('t', 'e26');
    const where = (prisma.immobilisation as { findMany: jest.Mock }).findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't', dateAcquisition: { lte: D('2026-12-31') } });
    expect(where.AND[0]).toEqual({ OR: [{ statut: StatutImmobilisation.EN_SERVICE }, { dateSortie: { gt: D('2026-12-31') } }] });
    expect(where.AND[1].OR.map((x: { compteImmobilisation: { numero: { startsWith: string } } }) => x.compteImmobilisation.numero.startsWith)).toEqual(['22', '23', '24', '26', '27']);
  });

  it('au SYCEBNL, le périmètre lit aussi 202 à 205, et le bien reçu à vendre reste à sa valeur, sans dotation exigée (D-29)', async () => {
    const recu: Fiche = { id: 'b2', designation: 'Maison léguée à vendre', numero: '20300000', valeurOrigine: 800, dotations: [] };
    const { svc, prisma, lignesCreees, mises } = monterService([machine, recu], { referentiel: Referentiel.SYCEBNL });
    const p = await svc.perimetre('t', 'e26');
    const where = (prisma.immobilisation as { findMany: jest.Mock }).findMany.mock.calls[0][0].where;
    expect(where.AND[1].OR.map((x: { compteImmobilisation: { numero: { startsWith: string } } }) => x.compteImmobilisation.numero.startsWith)).toEqual([
      '22', '23', '24', '26', '27', '202', '203', '204', '205',
    ]);
    expect(p.biens.find((b) => b.id === 'b2')).toMatchObject({ bloquant: null, motifGarde: 'RECU_DESTINE_A_LA_VENTE' });
    await svc.reevaluer('t', 'u', {
      ...corpsLegal,
      lignes: [{ ...corpsLegal.lignes[0], droitDeReprise: false }, { immobilisationId: 'b2' }],
    });
    expect(lignesCreees).toContainEqual(expect.objectContaining({ immobilisationId: 'b2', ecart: 0, motifNonReevalue: MOTIF_DIVISION_20 }));
    expect(mises.map((m) => m.where.id)).toEqual(['b1']);
  });

  it('un bien sorti APRÈS la clôture arrête l’opération · il était à l’actif à la date de la réévaluation', async () => {
    const cede: Fiche = { ...machine, id: 'b2', designation: 'Camion cédé', statut: StatutImmobilisation.CEDEE, dateSortie: D('2027-02-10') };
    const { svc, creer } = monterService([machine, cede]);
    await expect(
      svc.reevaluer('t', 'u', { ...corpsLegal, lignes: [...corpsLegal.lignes, { immobilisationId: 'b2', categorie: 'AUTRES', valeurActuelle: 840 }] }),
    ).rejects.toThrow(/Camion cédé.*sorti le 2027-02-10, après la clôture/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('le câblage du module · dotation, dépréciation, révision', () => {
  function monterImmo(o: { reevalueApres?: boolean; lignes?: Array<{ id: string; ecart: number; ecartImpute: number; compteEcart: string; dateFin: Date }> } = {}) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const majLignes: unknown[] = [];
    const prisma: Record<string, unknown> = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          designation: 'Bâtiment industriel',
          statut: StatutImmobilisation.EN_SERVICE,
          compteImmobilisationId: 'c231',
          compteImmobilisation: { numero: '23110000' },
          valeurOrigine: 100_000_000,
          amortissementAnterieur: 0,
          amortissementsReevaluation: 0,
          dateMiseEnService: D('2020-01-01'),
          dotations: [],
          depreciations: [],
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e27', statut: StatutExercice.OUVERT, dateDebut: D('2027-01-01'), dateFin: D('2027-12-31') }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
      dotationAmortissement: { findUnique: jest.fn().mockResolvedValue(null) },
      ligneReevaluationBilan: {
        findFirst: jest.fn().mockResolvedValue(o.reevalueApres ? { id: 'l1' } : null),
        findMany: jest.fn().mockResolvedValue(
          (o.lignes ?? []).map((l) => ({ id: l.id, ecart: l.ecart, ecartImpute: l.ecartImpute, compteEcart: l.compteEcart, reevaluation: { exercice: { dateFin: l.dateFin } } })),
        ),
        update: jest.fn((a: unknown) => {
          majLignes.push(a);
          return Promise.resolve(a);
        }),
      },
      compte: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, numero: where.id === 'c29' ? '29310000' : where.id === 'c69' ? '69140000' : '79140000' })),
        findMany: jest.fn(({ where }: { where: { numero: { in: string[] } } }) => Promise.resolve(where.numero.in.map((numero) => ({ id: `n${numero}`, numero })))),
      },
      depreciationImmobilisation: { create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'd1', ...data })) },
      ecriture: { delete: jest.fn() },
      ligneEcriture: { deleteMany: jest.fn() },
    };
    prisma.$transaction = jest.fn((f: (tx: unknown) => unknown) => f(prisma));
    return { svc: new ImmobilisationService(prisma as never, { creer } as never), creer, prisma, majLignes };
  }

  it('la dotation d’un exercice réévalué à sa clôture se refuse · elle se passe avant', async () => {
    const { svc, creer, prisma } = monterImmo({ reevalueApres: true });
    await expect(svc.passerDotation('t', 'u', 'b1', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow(/avant la réévaluation/);
    expect(creer).not.toHaveBeenCalled();
    const where = (prisma.ligneReevaluationBilan as { findFirst: jest.Mock }).findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: 't', immobilisationId: 'b1', reevaluation: { exercice: { dateFin: { gte: D('2027-12-31') } } } });
  });

  it('ch. 12 § 2.5 · D 1062 6 000 000, D 6914 9 000 000 / C 2931 15 000 000, l’écart imputé noté', async () => {
    const { svc, creer, majLignes } = monterImmo({ lignes: [{ id: 'l1', ecart: 6_000_000, ecartImpute: 0, compteEcart: '10620000', dateFin: D('2026-12-31') }] });
    const cree = await svc.enregistrerDepreciation('t', 'u', 'b1', {
      exerciceId: 'e27',
      journalId: 'j',
      sens: SensDepreciation.DOTATION,
      montant: 15_000_000,
      compteDepreciationId: 'c29',
      compteContrepartieId: 'c69',
      indice: 'Sinistre',
    });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'n10620000', debit: 6_000_000, credit: 0 },
      { compteId: 'c69', debit: 9_000_000, credit: 0 },
      { compteId: 'c29', debit: 0, credit: 15_000_000 },
    ]);
    expect(cree).toMatchObject({ montant: 15_000_000, montantImputeEcart: 6_000_000 });
    expect(majLignes).toEqual([{ where: { id: 'l1' }, data: { ecartImpute: { increment: 6_000_000 } } }]);
  });

  it('la reprise d’une dépréciation sur un bien réévalué · abstention dite, rien d’écrit', async () => {
    const { svc, creer } = monterImmo({ lignes: [{ id: 'l1', ecart: 6_000_000, ecartImpute: 0, compteEcart: '10620000', dateFin: D('2026-12-31') }] });
    await expect(
      svc.enregistrerDepreciation('t', 'u', 'b1', {
        exerciceId: 'e27',
        journalId: 'j',
        sens: SensDepreciation.REPRISE,
        montant: 1,
        compteDepreciationId: 'c29',
        compteContrepartieId: 'c79',
        indice: 'x',
      }),
    ).rejects.toThrow(/réévalué/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une dépréciation dans l’exercice même de la réévaluation · refusée', async () => {
    const { svc, creer } = monterImmo({ lignes: [{ id: 'l1', ecart: 6_000_000, ecartImpute: 0, compteEcart: '10620000', dateFin: D('2027-12-31') }] });
    await expect(
      svc.enregistrerDepreciation('t', 'u', 'b1', {
        exerciceId: 'e27',
        journalId: 'j',
        sens: SensDepreciation.DOTATION,
        montant: 1,
        compteDepreciationId: 'c29',
        compteContrepartieId: 'c69',
        indice: 'x',
      }),
    ).rejects.toThrow(/AVANT la réévaluation/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('après la réévaluation, le MOTEUR de dotation dote sur la valeur réévaluée', () => {
  // Les fiches telles que `reevaluer` les laisse · la dotation suivante se
  // calcule par le seul moteur du module (`passerDotation`), rien d'autre.
  function doter(fiche: Record<string, unknown>) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const prisma: Record<string, unknown> = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          designation: 'Bien',
          statut: StatutImmobilisation.EN_SERVICE,
          compteImmobilisation: { numero: '24110000' },
          compteDotationId: 'c681',
          compteAmortissementId: 'c28',
          valeurResiduelle: 0,
          modeAmortissement: 'LINEAIRE',
          amortissementsDetaches: 0,
          reprisesAmortissement: 0,
          dureeNonLimitee: false,
          depreciations: [],
          ...fiche,
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e27', statut: StatutExercice.OUVERT, dateDebut: D('2027-01-01'), dateFin: D('2027-12-31') }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
      dotationAmortissement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'd', ...data })),
      },
      ligneReevaluationBilan: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { svc: new ImmobilisationService(prisma as never, { creer } as never), creer };
  }

  it('légale (exemple 2) · 1 400 brut, cumul 400 + 160 · l’annuité passe de 100 à 140 (10 % de 1 400, § 4.2.2)', async () => {
    const { svc, creer } = doter({
      valeurOrigine: 1400,
      amortissementAnterieur: 300,
      amortissementsReevaluation: 160,
      dureeAmortissementAns: 10,
      dateMiseEnService: D('2023-01-01'),
      dotations: [{ montant: 100, exerciceId: 'e26', exercice: { dateFin: D('2026-12-31') } }],
    });
    await svc.passerDotation('t', 'u', 'b1', { exerciceId: 'e27', journalId: 'j' });
    expect(creer.mock.calls[0][2].lignes[0]).toEqual({ compteId: 'c681', debit: 140, credit: 0 });
  });

  it('libre méthode 2 (exemple du § 4.3.2) · 135 000 000 sur 24 annuités = 5 625 000', async () => {
    const { svc, creer } = doter({
      valeurOrigine: 135_000_000,
      amortissementAnterieur: 25_000_000,
      amortissementsReevaluation: -30_000_000,
      dureeAmortissementAns: 30,
      dateMiseEnService: D('2021-01-01'),
      dateEffetRevisionPlan: D('2027-01-01'),
      dureeResiduelleRevisee: 24,
      dotations: [{ montant: 5_000_000, exerciceId: 'e26', exercice: { dateFin: D('2026-12-31') } }],
    });
    await svc.passerDotation('t', 'u', 'b1', { exerciceId: 'e27', journalId: 'j' });
    expect(creer.mock.calls[0][2].lignes[0]).toEqual({ compteId: 'c681', debit: 5_625_000, credit: 0 });
  });
});

describe('le service · la reprise de la provision spéciale, D 154 / C 861', () => {
  function monterReprise(
    o: { dotation?: number | null; deja?: boolean; reste?: number; statut?: StatutImmobilisation; dateSortie?: Date | null } = {},
  ) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const majLignes: unknown[] = [];
    const prisma: Record<string, unknown> = {
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e27', statut: StatutExercice.OUVERT, dateDebut: D('2027-01-01'), dateFin: D('2027-12-31') }) },
      ligneReevaluationBilan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'l1',
            ecart: 240,
            provisionReprise: 240 - (o.reste ?? 240),
            coefficientRetenu: 1.4,
            immobilisation: {
              id: 'b1',
              designation: 'Machine',
              statut: o.statut ?? StatutImmobilisation.EN_SERVICE,
              dateSortie: o.dateSortie ?? null,
              dotations: o.dotation === null ? [] : [{ montant: o.dotation ?? 140 }],
              lignesReevaluation: [
                {
                  id: 'l1',
                  coefficientRetenu: 1.4,
                  compteEcart: '15400000',
                  ecart: 240,
                  provisionReprise: 240 - (o.reste ?? 240),
                  reevaluation: { dateReevaluation: D('2026-12-31') },
                },
              ],
            },
          },
        ]),
        update: jest.fn((a: unknown) => {
          majLignes.push(a);
          return Promise.resolve(a);
        }),
      },
      repriseProvisionReevaluation: {
        findFirst: jest.fn().mockResolvedValue(o.deja ? { id: 'r0', montant: 40, ecritureId: 'e0' } : null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'rp', ...data })),
      },
      compte: { findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) => Promise.resolve({ id: `n${where.tenantId_numero.numero}` })) },
      ligneEcriture: { deleteMany: jest.fn() },
      ecriture: { delete: jest.fn() },
    };
    prisma.$transaction = jest.fn((f: (tx: unknown) => unknown) => f(prisma));
    return { svc: new ReevaluationBilanService(prisma as never, { creer } as never), creer, prisma, majLignes };
  }

  it('propose 40 sur une dotation de 140 à k’ = 1,4, lu sur les seules réévaluations au 154 d’un exercice antérieur', async () => {
    const { svc, prisma } = monterReprise();
    const p = await svc.propositionRepriseProvision('t', 'e27');
    expect(p.total).toBe(40);
    const where = (prisma.ligneReevaluationBilan as { findMany: jest.Mock }).findMany.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: 't', compteEcart: { startsWith: '154' }, reevaluation: { exercice: { dateFin: { lt: D('2027-12-31') } } } });
  });

  it('un bien sorti à la clôture n’est pas proposé · nommé à part, sa provision restante dite (ch. 28 § 4.2.4.2 et § 6)', async () => {
    const sorti = monterReprise({ statut: StatutImmobilisation.CEDEE, dateSortie: D('2027-06-30'), dotation: 70 });
    const p = await sorti.svc.propositionRepriseProvision('t', 'e27');
    expect(p.lignes).toEqual([]);
    expect(p.total).toBe(0);
    expect(p.sortis).toEqual([expect.objectContaining({ ligneId: 'l1', resteProvision: 240, motif: expect.stringMatching(/Bien sorti/) })]);
    await expect(sorti.svc.passerRepriseProvision('t', 'u', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow(/Aucun supplément/);
    expect(sorti.creer).not.toHaveBeenCalled();
    // Sorti APRÈS la clôture de l'exercice · encore un élément d'actif ce jour-là.
    const apres = monterReprise({ statut: StatutImmobilisation.CEDEE, dateSortie: D('2028-02-01') });
    expect((await apres.svc.propositionRepriseProvision('t', 'e27')).total).toBe(40);
  });

  it('passe D 15400000 / C 86100000 et compte la reprise sur la ligne', async () => {
    const { svc, creer, majLignes } = monterReprise();
    await svc.passerRepriseProvision('t', 'u', { exerciceId: 'e27', journalId: 'j' });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'n15400000', debit: 40, credit: 0 },
      { compteId: 'n86100000', debit: 0, credit: 40 },
    ]);
    expect(majLignes).toEqual([{ where: { id: 'l1' }, data: { provisionReprise: { increment: 40 } } }]);
  });

  it('sans dotation passée, le supplément ne se devine pas · rien à reprendre ; une seconde reprise · 409', async () => {
    const sans = monterReprise({ dotation: null });
    const p = await sans.svc.propositionRepriseProvision('t', 'e27');
    expect(p.lignes[0]).toMatchObject({ montant: 0, motif: expect.stringMatching(/non passée/) });
    await expect(sans.svc.passerRepriseProvision('t', 'u', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow(/Aucun supplément/);
    const deja = monterReprise({ deja: true });
    await expect(deja.svc.passerRepriseProvision('t', 'u', { exerciceId: 'e27', journalId: 'j' })).rejects.toThrow(/déjà passée/);
    expect(sans.creer).not.toHaveBeenCalled();
    expect(deja.creer).not.toHaveBeenCalled();
  });
});

describe('la révision rétroactive d’un bien réévalué · refusée, la prospective reste ouverte', () => {
  it('le refus est écrit dans `reviserPlan`, sur le cumul changé par la réévaluation', () => {
    const source = readFileSync(join(__dirname, 'immobilisation.service.ts'), 'utf8');
    const debut = source.indexOf('async reviserPlan(');
    const corps = source.slice(debut, source.indexOf('\n  async ', debut + 10));
    expect(corps).toMatch(/dto\.nature !== 'PROSPECTIVE' && Number\(immo\.amortissementsReevaluation \?\? 0\) !== 0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Relecture du relecteur · bien en cours, éléments monétaires, biens sortis.
// ─────────────────────────────────────────────────────────────────────────

describe('ch. 28 § 1.2 · « un bien ou un élément NON MONÉTAIRE » · prêts, créances et dépôts gardés à leur valeur', () => {
  it('un dépôt, un prêt, des intérêts courus · gardés sans valeur actuelle ni catégorie exigées, motif écrit', () => {
    for (const numero of ['27510000', '27210000', '27610000', '27840000', '27110000']) {
      const r = ok(reevaluerBien(bien({ numeroCompte: numero, amortissable: false, cumulAmortissements: 0 }), {}, legale()));
      expect(r.motifNonReevalue).toBe(MOTIF_ELEMENT_MONETAIRE);
      expect(r.ecart).toBe(0);
    }
  });

  it('un titre immobilisé (274), des titres prêtés, l’or (2785) restent DANS l’opération · la valeur actuelle reste exigée', () => {
    for (const numero of ['27410000', '27140000', '27150000', '27850000', '26110000']) {
      expect(estElementMonetaire(numero)).toBe(false);
      expect(reevaluerBien(bien({ numeroCompte: numero, amortissable: false, cumulAmortissements: 0 }), { categorie: 'A' }, legale())).toMatchObject({
        refus: expect.stringMatching(/Valeur actuelle/),
      });
    }
  });

  it('chaque racine écartée est, dans les DEUX semis, un prêt, une créance, un dépôt, un cautionnement ou des intérêts courus', () => {
    const MONETAIRE = /prêt|créance|dépôt|cautionnement|intérêts courus|billets de fonds|retenues de garantie|fonds réglementé|concédant|avances à des/i;
    const lire = (plan: ReadonlyArray<unknown>) =>
      (plan as ReadonlyArray<unknown[] | { numero: string; intitule: string }>).map((x) =>
        Array.isArray(x) ? { numero: String(x[0]), intitule: String(x[1]) } : { numero: x.numero, intitule: x.intitule },
      );
    let vus = 0;
    for (const plan of [lire(PLAN_COMPTES_SYSCOHADA), lire(PLAN_COMPTES_SYCEBNL)]) {
      for (const c of plan.filter((x) => x.numero.length === 8 && estElementMonetaire(x.numero))) {
        vus++;
        // L'intitulé d'une feuille s'abrège sous son en-tête (2764 « Titres
        // immobilisés » sous 276 « Intérêts courus » au SYSCOHADA) · lu avec
        // celui de sa division à trois chiffres.
        const division = plan.find((x) => x.numero === c.numero.slice(0, 3))?.intitule ?? '';
        expect(`${c.numero} ${c.intitule} · ${division}`).toMatch(MONETAIRE);
        // Les titres prêtés sont des TITRES · aucune racine écartée ne les prend.
        expect(c.intitule).not.toMatch(/titres prêtés/i);
      }
      // Les titres immobilisés et l'or restent dans le périmètre.
      for (const c of plan.filter((x) => /^27(4|85)/.test(x.numero))) expect(estElementMonetaire(c.numero)).toBe(false);
    }
    expect(vus).toBeGreaterThan(20);
    expect(RACINES_ELEMENTS_MONETAIRES).toContain('275');
  });

  it('le service garde l’élément monétaire sans valeur actuelle déclarée · l’opération passe', async () => {
    const depot: Fiche = { id: 'b2', designation: 'Dépôt de garantie', numero: '27510000', valeurOrigine: 500, dateMiseEnService: null };
    const { svc, creer, lignesCreees } = monterService([machine, depot]);
    const r = await svc.reevaluer('t', 'u', { ...corpsLegal, lignes: [...corpsLegal.lignes, { immobilisationId: 'b2' }] });
    expect(r.totalEcart).toBe(240);
    expect(creer.mock.calls[0][2].lignes.some((l: { compteId: string }) => l.compteId === 'c27510000')).toBe(false);
    expect(lignesCreees).toContainEqual(expect.objectContaining({ immobilisationId: 'b2', ecart: 0, motifNonReevalue: MOTIF_ELEMENT_MONETAIRE }));
    const p = await svc.perimetre('t', 'e26');
    expect(p.biens.find((b) => b.id === 'b2')?.motifGarde).toBe('ELEMENT_MONETAIRE');
  });
});

describe('ch. 28 § 1.2 · le bien EN COURS est dans l’opération, réévalué à son compte en cours (`compteInscritALaDate`)', () => {
  const chantier: Fiche = {
    id: 'b3',
    designation: 'Entrepôt en construction',
    numero: '23110000',
    enCours: '23910000',
    valeurOrigine: 1000,
    dateMiseEnService: null,
  };

  it('D 239 de l’écart, jamais le 231 · le bien n’est pas encore achevé à la clôture', async () => {
    const { svc, creer } = monterService([machine, chantier]);
    const r = await svc.reevaluer('t', 'u', {
      ...corpsLegal,
      lignes: [...corpsLegal.lignes, { immobilisationId: 'b3', categorie: 'AUTRES', valeurActuelle: 1500 }],
    });
    expect(r.totalEcart).toBe(740);
    const lignes = creer.mock.calls[0][2].lignes as Array<{ compteId: string; debit: number; credit: number }>;
    expect(lignes).toContainEqual(expect.objectContaining({ compteId: 'c23910000', debit: 500, credit: 0 }));
    expect(lignes.some((l) => l.compteId === 'c23110000')).toBe(false);
    const p = await svc.perimetre('t', 'e26');
    const b = p.biens.find((x) => x.id === 'b3')!;
    expect(b.numeroCompte).toBe('23910000');
    expect(b.enCours).toBe(true);
  });

  it('mis en service avant la clôture · réévalué à son compte DÉFINITIF', async () => {
    const acheve = { ...chantier, dateMiseEnService: D('2026-09-30'), dotations: [{ montant: 25, exerciceId: 'e26', dateFin: D('2026-12-31') }] };
    const { svc, creer } = monterService([machine, acheve]);
    await svc.reevaluer('t', 'u', {
      ...corpsLegal,
      lignes: [...corpsLegal.lignes, { immobilisationId: 'b3', categorie: 'AUTRES', valeurActuelle: 1500 }],
    });
    const lignes = creer.mock.calls[0][2].lignes as Array<{ compteId: string }>;
    expect(lignes.some((l) => l.compteId === 'c23110000')).toBe(true);
    expect(lignes.some((l) => l.compteId === 'c23910000')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Deux réévaluations successives du même bien · séminaire du CPCC sur
// l'arrêté des comptes 2024, jour 2, § II.5 (témoin, pas une source ·
// Canon, 450 000 au 1er janvier 2021, trois ans, 1,03 en 2021 puis 1,17 en
// 2022, cumulés depuis l'acquisition) et exemple 2 du ch. 28 § 4.2.1.3
// prolongé d'une seconde opération.
// ─────────────────────────────────────────────────────────────────────────

const canon = (o: Partial<BienAReevaluer> = {}) =>
  bien({ designation: 'Imprimante Canon', numeroCompte: '24420000', valeurOrigine: 450000, cumulAmortissements: 149985, anneesRestantes: 2, ...o });

describe('ch. 28 § 4.2.1.1 · le coefficient s’applique à la valeur nette INSCRITE, réévaluations antérieures comprises', () => {
  it('Canon, première opération (2021, k = 1,03) · 463 500 brut, 154 484,55 amortis, écart 9 000,45', () => {
    const r = ok(reevaluerBien(canon(), { categorie: 'INFO', valeurActuelle: 1e9 }, legale({ coefficients: { INFO: 1.03 } })));
    expect([r.brutApres, r.amortissementsApres, r.ecart]).toEqual([463500, 154484.55, 9000.45]);
    expect(r.produitAnterieur).toBe(1);
  });

  it('Canon, seconde opération (2022, 1,17 depuis l’acquisition) · converti 1,17 ÷ 1,03, 526 500 et 350 964,90 du séminaire, écart 21 004,20', () => {
    const avant = canon({ valeurOrigine: 463500, cumulAmortissements: 308969.1, anneesRestantes: 1, coefficientsAnterieurs: [1.03] });
    const op = legale({ coefficients: { INFO: 1.17 }, bases: { INFO: 'ORIGINE' } });
    const r = ok(reevaluerBien(avant, { categorie: 'INFO', valeurActuelle: 1e9 }, op));
    expect(r.coefficientDeclare).toBe(1.17);
    expect(r.coefficient).toBeCloseTo(1.17 / 1.03, 12);
    expect(r.produitAnterieur).toBe(1.03);
    expect([r.brutApres, r.amortissementsApres, r.valeurReevaluee, r.ecart]).toEqual([526500, 350964.9, 175535.1, 21004.2]);
    // Appliqué tel quel à la valeur réévaluée, 1,17 la porterait à 542 295 de brut (+ 35 % d'écart de trop).
    expect(r.brutApres).not.toBe(542295);
  });

  it('un bien déjà réévalué sans base déclarée pour sa catégorie · refus nommé, rien de deviné', () => {
    const avant = canon({ valeurOrigine: 463500, cumulAmortissements: 308969.1, coefficientsAnterieurs: [1.03] });
    const r = reevaluerBien(avant, { categorie: 'INFO', valeurActuelle: 1e9 }, legale({ coefficients: { INFO: 1.17 } }));
    expect(r).toEqual({ refus: expect.stringMatching(/Imprimante Canon.*déjà réévalué.*depuis l’acquisition ou depuis la dernière réévaluation/) });
  });

  it('base « depuis la dernière réévaluation » · le coefficient s’applique tel quel', () => {
    const avant = canon({ valeurOrigine: 463500, cumulAmortissements: 308969.1, coefficientsAnterieurs: [1.03] });
    const op = legale({ coefficients: { INFO: 1.17 / 1.03 }, bases: { INFO: 'DERNIERE_REEVALUATION' } });
    const r = ok(reevaluerBien(avant, { categorie: 'INFO', valeurActuelle: 1e9 }, op));
    expect([r.brutApres, r.ecart]).toEqual([526500, 21004.2]);
  });

  it('un bien jamais réévalué n’exige aucune base · la catégorie peut la taire', () => {
    expect(coefficientApplique({ coefficient: 1.5, base: null, produitAnterieur: 1 })).toEqual({ coefficient: 1.5 });
    expect(coefficientApplique({ coefficient: 1.5, base: 'ORIGINE', produitAnterieur: 1 })).toEqual({ coefficient: 1.5 });
  });

  it('exemple 2 prolongé · 1 400 brut, 700 amortis (k’ = 1,4), puis 1,8 depuis l’origine · 1,8 ÷ 1,4, valeur nette 900 = (1 000 − 500) × 1,8', () => {
    const avant = bien({ valeurOrigine: 1400, cumulAmortissements: 700, coefficientsAnterieurs: [1.4] });
    const op = legale({ coefficients: { AUTRES: 1.8 }, bases: { AUTRES: 'ORIGINE' } });
    const r = ok(reevaluerBien(avant, { categorie: 'AUTRES', valeurActuelle: 1e9 }, op));
    expect([r.brutApres, r.amortissementsApres, r.valeurReevaluee, r.ecart]).toEqual([1800, 900, 900, 200]);
    // Le plafond par la valeur actuelle (k', § 4.2.1.3) joue APRÈS la conversion.
    const plafonne = ok(reevaluerBien(avant, { categorie: 'AUTRES', valeurActuelle: 800 }, op));
    expect(plafonne.valeurReevaluee).toBe(800);
    expect(plafonne.coefficientRetenu).toBeCloseTo(800 / 700, 12);
    expect([plafonne.brutApres, plafonne.amortissementsApres]).toEqual([1600, 800]);
  });

  it('un coefficient converti inférieur à 1 · refusé avec le calcul, jamais ramené à 1', () => {
    const r = coefficientApplique({ coefficient: 1.2, base: 'ORIGINE', produitAnterieur: 1.4 });
    expect(r).toEqual({ refus: expect.stringMatching(/1\.2 ÷ .*1\.400000 = 0\.857143, inférieur à 1/) });
  });
});

describe('ch. 28 § 4.2.4.2 · la reprise CHAÎNÉE sur les réévaluations successives du bien', () => {
  it('Canon 2023, dotation 175 500 · 25 500 au total (175 500 − 150 000), et non 26 111,65 · 4 500 à la première, 21 000 à la seconde', () => {
    const chaine = [
      { id: 'op2021', coefficientRetenu: 1.03, resteProvision: 1e9, provisionSpeciale: true },
      { id: 'op2022', coefficientRetenu: 1.17 / 1.03, resteProvision: 1e9, provisionSpeciale: true },
    ];
    const parts = partsDuSupplement(175500, chaine);
    expect(parts.map((p) => p.montant)).toEqual([4500, 21000]);
    expect(parts[0].produitPosterieur).toBeCloseTo(1.17 / 1.03, 12);
    expect(parts[1].produitPosterieur).toBe(1);
    expect(parts[0].montant + parts[1].montant).toBe(25500);
  });

  it('Canon, provision de 2021 déjà reprise de 4 499,55 en 2022 · le solde (4 500,90) couvre la part, rien ne reste en route', () => {
    const parts = partsDuSupplement(175500, [
      { id: 'op2021', coefficientRetenu: 1.03, resteProvision: 9000.45 - 4499.55, provisionSpeciale: true },
      { id: 'op2022', coefficientRetenu: 1.17 / 1.03, resteProvision: 21004.2, provisionSpeciale: true },
    ]);
    expect(parts.map((p) => p.montant)).toEqual([4500, 21000]);
  });

  it('exemple 2 prolongé · dotation 180 (10 % de 1 800), 100 sans réévaluation · 40 et 40, soit 80, jamais 51,43 + 40', () => {
    const parts = partsDuSupplement(180, [
      { id: 'a', coefficientRetenu: 1.4, resteProvision: 240, provisionSpeciale: true },
      { id: 'b', coefficientRetenu: 900 / 700, resteProvision: 200, provisionSpeciale: true },
    ]);
    expect(parts.map((p) => p.montant)).toEqual([40, 40]);
  });

  it('une réévaluation au 106 compte dans la chaîne sans rien recevoir', () => {
    const parts = partsDuSupplement(180, [
      { id: 'a', coefficientRetenu: 1.4, resteProvision: 0, provisionSpeciale: false },
      { id: 'b', coefficientRetenu: 900 / 700, resteProvision: 200, provisionSpeciale: true },
    ]);
    expect(parts.map((p) => p.montant)).toEqual([0, 40]);
  });
});

describe('le service · la base du coefficient et la reprise chaînée', () => {
  const canonFiche: Fiche = {
    id: 'b1',
    designation: 'Imprimante Canon',
    numero: '24420000',
    valeurOrigine: 463500,
    amortissementAnterieur: 154484.55,
    dotations: [{ montant: 154484.55, exerciceId: 'e26', dateFin: D('2026-12-31') }],
    dureeAmortissementAns: 3,
    anterieurs: [1.03],
  };
  const corps = (base?: 'ORIGINE' | 'DERNIERE_REEVALUATION') => ({
    ...corpsLegal,
    categories: [{ cle: 'INFO', libelle: 'Matériel informatique', coefficient: 1.17, source: 'Arrêté n° X', ...(base ? { base } : {}) }],
    lignes: [{ immobilisationId: 'b1', categorie: 'INFO', valeurActuelle: 1e9 }],
  });

  it('le périmètre rend les coefficients déjà appliqués au bien, dans l’ordre', async () => {
    const { svc } = monterService([{ ...canonFiche, anterieurs: [1.03, 1.1] }]);
    const p = await svc.perimetre('t', 'e26');
    expect(p.biens[0].coefficientsAnterieurs).toEqual([1.03, 1.1]);
  });

  it('sans base déclarée sur un bien déjà réévalué · refusé, rien d’écrit', async () => {
    const { svc, creer } = monterService([canonFiche]);
    await expect(svc.reevaluer('t', 'u', corps())).rejects.toThrow(/déjà réévalué/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('depuis l’origine · la ligne porte le coefficient APPLIQUÉ (1,17 ÷ 1,03), la catégorie le déclaré et sa base', async () => {
    const { svc, creer, lignesCreees, prisma } = monterService([canonFiche]);
    const r = await svc.reevaluer('t', 'u', corps('ORIGINE'));
    expect(r.totalEcart).toBe(21004.2);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c24420000', debit: 63000, credit: 0, libelle: expect.any(String) },
      { compteId: 'a24420000', debit: 0, credit: 41995.8, libelle: expect.any(String) },
      { compteId: 'n10610000', debit: 0, credit: 21004.2, libelle: expect.any(String) },
    ]);
    expect((lignesCreees[0] as { coefficient: number }).coefficient).toBeCloseTo(1.17 / 1.03, 12);
    const cree = (prisma.reevaluationBilan as { create: jest.Mock }).create.mock.calls[0][0].data;
    expect(cree.categories).toEqual([expect.objectContaining({ cle: 'INFO', coefficient: 1.17, base: 'ORIGINE' })]);
  });

  it('la lecture du périmètre borne les réévaluations antérieures à l’exercice', async () => {
    const { svc, prisma } = monterService([canonFiche]);
    await svc.perimetre('t', 'e26');
    const include = (prisma.immobilisation as { findMany: jest.Mock }).findMany.mock.calls[0][0].include;
    expect(include.lignesReevaluation.where).toEqual({ reevaluation: { exercice: { dateFin: { lt: D('2026-12-31') } } } });
  });

  it('la proposition chaîne les deux opérations au 154 du Canon · 4 500 + 21 000 = 25 500', async () => {
    const op = (id: string, k: number, ecart: number, date: string) => ({
      id,
      coefficientRetenu: k,
      compteEcart: '15400000',
      ecart,
      provisionReprise: 0,
      reevaluation: { dateReevaluation: D(date) },
    });
    const chaine = [op('l2', 1.17 / 1.03, 21004.2, '2022-12-31'), op('l1', 1.03, 9000.45, '2021-12-31')];
    const immobilisation = {
      id: 'b1',
      designation: 'Imprimante Canon',
      statut: StatutImmobilisation.EN_SERVICE,
      dateSortie: null,
      dotations: [{ montant: 175500 }],
      lignesReevaluation: chaine,
    };
    const prisma: Record<string, unknown> = {
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e23', statut: StatutExercice.OUVERT, dateDebut: D('2023-01-01'), dateFin: D('2023-12-31') }) },
      ligneReevaluationBilan: { findMany: jest.fn().mockResolvedValue(chaine.map((l) => ({ ...l, immobilisation }))) },
      repriseProvisionReevaluation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new ReevaluationBilanService(prisma as never, {} as never);
    const p = await svc.propositionRepriseProvision('t', 'e23');
    const parId = Object.fromEntries(p.lignes.map((l) => [l.ligneId, l.montant]));
    expect(parId).toEqual({ l1: 4500, l2: 21000 });
    expect(p.total).toBe(25500);
  });
});
