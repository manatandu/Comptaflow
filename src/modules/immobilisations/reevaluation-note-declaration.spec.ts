import { JeuEtatsFinanciersSycebnl, Referentiel, SystemeComptableSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import { ReevaluationBilanService } from './reevaluation-bilan.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LIGNE A15 · la note des réévaluations (AUDCIF Titre VIII ch. 28 § 8 ; NOTE
 * 3E ; SYCEBNL NOTE 5H ; loi n° 23/053, art. 135) et les éléments de la
 * déclaration spéciale (art. 136, 137), servis des enregistrements du module.
 *
 * Application 99 · terrain 100 000 000 (k = 1,2, écart 20 000 000 au 1061),
 * bâtiment 300 000 000 dont 50 000 000 amortis (écart 50 000 000 au 1061),
 * réévalués au 31/12/2025. En 2026, l'annuité du bâtiment est 12 000 000.
 */
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const EX = {
  ex2025: { id: 'ex2025', tenantId: 'tn', dateDebut: D('2025-01-01'), dateFin: D('2025-12-31'), statut: 'OUVERT' },
  ex2026: { id: 'ex2026', tenantId: 'tn', dateDebut: D('2026-01-01'), dateFin: D('2026-12-31'), statut: 'OUVERT' },
} as const;

const REEVALUATION = {
  id: 'r1',
  tenantId: 'tn',
  exerciceId: 'ex2025',
  type: 'LEGALE',
  methodeLibre: null,
  neutraliteFiscale: false,
  dateReevaluation: D('2025-12-31'),
  decision: 'Conseil du 15/12/2025',
  traitementFiscal: 'Écart non imposé',
  methodeEvaluation: 'Méthode indiciaire légale',
  totalEcart: 70_000_000,
  categories: [{ cle: 'imm', libelle: 'Immeubles', coefficient: 1.2, source: 'Arrêté de 2025' }],
};

function ligne(o: {
  id: string;
  bien: string;
  numero: string;
  brutAvant: number;
  amortissementsAvant: number;
  valeurReevaluee: number;
  brutApres: number;
  amortissementsApres: number;
  ecart: number;
  dotation2026?: number;
}) {
  return {
    id: o.id,
    tenantId: 'tn',
    reevaluationId: 'r1',
    immobilisationId: o.bien,
    categorie: 'imm',
    coefficient: 1.2,
    valeurActuelle: o.valeurReevaluee * 2,
    coefficientRetenu: 1.2,
    brutAvant: o.brutAvant,
    amortissementsAvant: o.amortissementsAvant,
    valeurNetteAvant: o.brutAvant - o.amortissementsAvant,
    brutApres: o.brutApres,
    amortissementsApres: o.amortissementsApres,
    valeurReevaluee: o.valeurReevaluee,
    ecart: o.ecart,
    compteEcart: '10610000',
    motifNonReevalue: null,
    provisionReprise: 0,
    ecartImpute: 0,
    ecartTransfere: 0,
    reevaluation: { id: 'r1', dateReevaluation: D('2025-12-31') },
    immobilisation: {
      id: o.bien,
      designation: o.bien === 'ter' ? 'Terrain' : 'Bâtiment industriel',
      numeroInventaire: null,
      dateAcquisition: D('2021-01-01'),
      dateSortie: null,
      natureSortie: null,
      compteImmobilisation: { numero: o.numero },
      dotations: o.dotation2026 ? [{ montant: o.dotation2026, exerciceId: 'ex2026' }] : [],
      ecritureSortieEcartReevaluation: null,
    },
  };
}

const LIGNES = [
  ligne({ id: 'l1', bien: 'ter', numero: '22300000', brutAvant: 100_000_000, amortissementsAvant: 0, valeurReevaluee: 120_000_000, brutApres: 120_000_000, amortissementsApres: 0, ecart: 20_000_000 }),
  ligne({
    id: 'l2',
    bien: 'bat',
    numero: '23110000',
    brutAvant: 300_000_000,
    amortissementsAvant: 50_000_000,
    valeurReevaluee: 300_000_000,
    brutApres: 360_000_000,
    amortissementsApres: 60_000_000,
    ecart: 50_000_000,
    dotation2026: 12_000_000,
  }),
];

function monter(tenant: { referentiel: Referentiel; jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl | null; systemeComptableSyscohada?: SystemeComptableSyscohada | null }) {
  const prisma = {
    exercice: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(where.tenantId === 'tn' ? (EX[where.id as keyof typeof EX] ?? null) : null),
      ),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ nom: 'Société Essai', jeuEtatsFinanciersSycebnl: null, systemeComptableSyscohada: null, ...tenant }),
    },
    // LES DOUBLURES HONORENT LA REQUÊTE · dossier, date de la réévaluation, exercice.
    reevaluationBilan: {
      findMany: jest.fn(({ where }: { where: { tenantId: string; dateReevaluation: { lte: Date } } }) =>
        Promise.resolve(where.tenantId === 'tn' && REEVALUATION.dateReevaluation <= where.dateReevaluation.lte ? [REEVALUATION] : []),
      ),
      findFirst: jest.fn(({ where }: { where: { tenantId: string; exerciceId: string } }) =>
        Promise.resolve(where.tenantId === 'tn' && where.exerciceId === REEVALUATION.exerciceId ? { ...REEVALUATION, lignes: LIGNES } : null),
      ),
    },
    ligneReevaluationBilan: {
      findMany: jest.fn(({ where }: { where: { tenantId: string; reevaluation: { dateReevaluation: { lte: Date } } } }) =>
        Promise.resolve(where.tenantId === 'tn' && REEVALUATION.dateReevaluation <= where.reevaluation.dateReevaluation.lte ? LIGNES : []),
      ),
    },
    repriseProvisionReevaluation: { findFirst: jest.fn().mockResolvedValue(null) },
    compte: {
      findMany: jest.fn(({ where }: { where: { OR: Array<{ numero: { startsWith: string } }> } }) => {
        const plan = [
          { id: 'a', numero: '11100000', intitule: 'Réserve légale', estRetenu: true, typeCompte: TypeCompteDetailTotal.DETAIL },
          { id: 'b', numero: '11810000', intitule: 'Réserves facultatives', estRetenu: true, typeCompte: TypeCompteDetailTotal.DETAIL },
        ];
        return Promise.resolve(plan.filter((c) => where.OR.some((o) => c.numero.startsWith(o.numero.startsWith))));
      }),
    },
  } as unknown as PrismaService;
  return new ReevaluationBilanService(prisma, {} as EcritureService);
}

describe('A15 · la note des réévaluations', () => {
  it('SYSCOHADA (NOTE 3E) · par poste, coûts historiques, montants réévalués, écart, supplément de l’exercice suivant', async () => {
    const note = await monter({ referentiel: Referentiel.SYSCOHADA }).noteReevaluations('tn', 'ex2026');
    expect(note.codeNote).toBe('3E');
    expect(note.reevaluations).toEqual([expect.objectContaining({ type: 'LEGALE', dateReevaluation: '2025-12-31', methodeEvaluation: 'Méthode indiciaire légale' })]);
    expect(note.postes).toEqual([
      expect.objectContaining({ poste: 'Terrains hors immeuble de placement', coutHistorique: 100_000_000, valeurReevaluee: 120_000_000, ecart106: 20_000_000, amortissementsSupplementaires: 0 }),
      // 12 000 000 × (1 − 1/1,2) = 2 000 000.
      expect.objectContaining({ poste: 'Bâtiments hors immeuble de placement', coutHistorique: 300_000_000, valeurReevaluee: 300_000_000, ecart106: 50_000_000, amortissementsSupplementaires: 2_000_000 }),
    ]);
    expect(note.total).toMatchObject({ coutHistorique: 400_000_000, ecart106: 70_000_000, amortissementsSupplementaires: 2_000_000 });
  });

  it('l’exercice de la réévaluation · aucun supplément (sa dotation se passe avant)', async () => {
    const note = await monter({ referentiel: Referentiel.SYSCOHADA }).noteReevaluations('tn', 'ex2025');
    expect(note.total).toMatchObject({ amortissementsSupplementaires: 0, ecart106: 70_000_000 });
  });

  it('SYCEBNL associations · NOTE 5H ; projets de développement et SMT · sans objet, dit', async () => {
    expect((await monter({ referentiel: Referentiel.SYCEBNL, jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS }).noteReevaluations('tn', 'ex2026')).codeNote).toBe('5H');
    const projet = await monter({ referentiel: Referentiel.SYCEBNL, jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT }).noteReevaluations('tn', 'ex2026');
    expect(projet).toMatchObject({ codeNote: null, motifSansObjet: expect.stringMatching(/5H des associations/) });
    const smt = await monter({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: SystemeComptableSyscohada.MINIMAL_TRESORERIE }).noteReevaluations('tn', 'ex2026');
    expect(smt).toMatchObject({ codeNote: null, motifSansObjet: expect.stringMatching(/Titre X/) });
  });

  it('un exercice d’un autre dossier est refusé, jamais servi', async () => {
    await expect(monter({ referentiel: Referentiel.SYSCOHADA }).noteReevaluations('autre', 'ex2026')).rejects.toThrow();
  });
});

describe('A15 · les éléments de la déclaration spéciale (art. 136, 137)', () => {
  it('par catégorie déclarée · lignes, totaux, et les trois mentions (échéance, modèle hors corpus, rien de déposé)', async () => {
    const d = await monter({ referentiel: Referentiel.SYSCOHADA }).declarationSpeciale('tn', 'ex2025');
    expect(d.reevaluation).toMatchObject({ type: 'LEGALE', totalEcart: 70_000_000 });
    expect(d.categories).toHaveLength(1);
    expect(d.categories[0]).toMatchObject({ libelle: 'Immeubles', coefficient: 1.2, source: 'Arrêté de 2025' });
    expect(d.total).toMatchObject({ brutAvant: 400_000_000, brutApres: 480_000_000, amortissementsApres: 60_000_000, ecart: 70_000_000 });
    expect(d.mentions.echeance).toMatch(/30 avril.*art\. 136/);
    expect(d.mentions.modele).toMatch(/n’est pas au corpus/);
    expect(d.mentions.depot).toMatch(/ne dépose rien/);
  });
  it('un exercice sans réévaluation · rien à déclarer, et c’est dit par l’absence de réévaluation', async () => {
    const d = await monter({ referentiel: Referentiel.SYSCOHADA }).declarationSpeciale('tn', 'ex2026');
    expect(d).toMatchObject({ reevaluation: null, categories: [], total: null });
  });
});

describe('A15 · les réserves proposées pour l’écart d’un bien sorti', () => {
  it('SYSCOHADA · sous 111, 112, 1138 seulement (le 118 des réserves libres n’est pas lu)', async () => {
    const r = await monter({ referentiel: Referentiel.SYSCOHADA }).comptesReserve('tn');
    expect(r.comptes.map((c) => c.numero)).toEqual(['11100000']);
  });
  it('SYCEBNL · aucune, et la liste vide dit pourquoi', async () => {
    const r = await monter({ referentiel: Referentiel.SYCEBNL }).comptesReserve('tn');
    expect(r).toMatchObject({ comptes: [], motifVide: expect.stringMatching(/n’est pas écrit/) });
  });
});
