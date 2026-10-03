import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import { propositionPaieDuMois, type BulletinAComptabiliser } from './comptabilisation-paie';
import type { DecompteFinalDto, EmissionDecompteFinalDto, SimulationPaieDto } from './dto/personnel.dto';

/**
 * A8 · LE CÂBLAGE DE L'ÉMISSION DU DÉCOMPTE FINAL. La règle pure est dans
 * `decompte-final-emis.spec.ts` ; ici, le service la rejoue sur le registre,
 * fige le décompte comme un bulletin, et la paie du mois le passe au 6614.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const CONTRAT = {
  id: 'c-1',
  type: 'DUREE_INDETERMINEE',
  dateEntreeEnVigueur: d('2023-01-01'),
  dateFin: d('2026-05-31'),
  natureTravail: 'Comptable',
  categorieProfessionnelle: 'Maîtrise',
  remunerationBase: new Prisma.Decimal(260_000),
  periodiciteRemuneration: 'MOIS',
  deviseRemuneration: 'CDF',
};

const SALARIE = {
  id: 's-1',
  nom: 'Mukendi',
  postNom: 'Kabasele',
  prenoms: 'Élodie',
  matricule: 'M-014',
  numeroAffiliationCnss: 'CNSS-77',
  nomConjoint: null,
  _count: { enfants: 0 },
  contrats: [CONTRAT],
};

function service(opts: { salarie?: unknown; actif?: unknown } = {}) {
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'b-1', ...data }));
  const bulletinFindFirst = jest.fn().mockImplementation(({ where }) => {
    if (where.statut) return Promise.resolve(opts.actif ?? null);
    const data = create.mock.calls.at(-1)?.[0].data ?? {};
    return Promise.resolve({ id: where.id, ...data });
  });
  const prisma: Record<string, unknown> = {
    salarie: { findFirst: jest.fn().mockResolvedValue(opts.salarie === undefined ? SALARIE : opts.salarie) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
    versionBaremePaie: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    bulletinPaie: { findFirst: bulletinFindFirst, aggregate: jest.fn().mockResolvedValue({ _max: { numero: 41 } }), create, update: jest.fn() },
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return { svc: new PersonnelService(prisma as unknown as PrismaService), create };
}

/** Licenciement, dispense de préavis par l'employeur, trois ans, 10 000 FC par jour. */
const FAITS: DecompteFinalDto = {
  anneesAnciennete: 3,
  moisNonCouvertsParUnConge: 6,
  initiative: 'EMPLOYEUR',
  motif: 'LICENCIEMENT',
  typeContrat: 'DUREE_INDETERMINEE',
  executionPreavis: 'DISPENSE_PAR_EMPLOYEUR',
  remunerationJournaliereFc: 10_000,
  moyenneMensuelleArticle66Fc: 0,
  moyenneMensuelleArticle142Fc: 0,
  avantagesPendantPreavisFc: 0,
  gratificationFc: 0,
  enfantsBeneficiairesAllocations: 0,
} as DecompteFinalDto;

const PAIE = (over: Partial<SimulationPaieDto> = {}): SimulationPaieDto =>
  ({
    moisDePaie: '2026-05',
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de mai', montantFc: 260_000 }],
    natureEmployeurInpp: 'PRIVE',
    effectif: 12,
    ...over,
  }) as SimulationPaieDto;

const emission = (faits: Partial<DecompteFinalDto> = {}, paie: Partial<SimulationPaieDto> = {}): EmissionDecompteFinalDto => ({
  decompte: { ...FAITS, ...faits } as DecompteFinalDto,
  paie: PAIE(paie),
});

describe('A8 · émettre le décompte final · rejoué, figé, numéroté avec les bulletins', () => {
  it('fige un double du livre de paie de nature DECOMPTE_FINAL, salaire du mois et indemnités ensemble', async () => {
    const { svc, create } = service();
    const relu = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    const data = create.mock.calls[0][0].data;
    expect(data.nature).toBe('DECOMPTE_FINAL');
    expect(data.numero).toBe(42);
    expect(data.moisDePaie).toBe('2026-05');
    // 260 000 de salaire + 35 jours × 10 000 de préavis (art. 64) + 6 jours × 10 000 de congé (art. 141).
    expect(data.totalVerseFc).toBe(260_000 + 350_000 + 60_000);
    const natures = (data.entree.elements as { nature: string; montantFc: number }[]).map((e) => [e.nature, e.montantFc]);
    expect(natures).toEqual([
      ['SALAIRE_OU_TRAITEMENT', 260_000],
      ['INDEMNITE_DE_FIN_DE_CONTRAT', 350_000],
      ['ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE', 60_000],
    ]);
    // Le verdict du décompte voyage avec le calcul, et les arriérés SONT les éléments du mois.
    expect(data.calcul.decompte.totalDuAuTravailleurFc).toBe(670_000);
    expect(data.entree.decompte.arrieresFc).toBe(260_000);
    // Retenues et net · rejoués par la simulation, jamais reçus.
    expect(data.irppFc).toBeGreaterThan(0);
    expect(data.cotisationsTravailleurFc).toBeGreaterThan(0);
    expect(data.netAPayerFc).toBeCloseTo(670_000 - data.cotisationsTravailleurFc - data.irppFc, 2);
    expect(relu.reserves.join(' ')).toContain('BARÈME DU MOIS');
  });

  it('se passe au journal par la paie du mois · D 6614 / C 422, le 422 soldé au net', async () => {
    const { svc, create } = service();
    await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    const data = create.mock.calls[0][0].data;
    const b: BulletinAComptabiliser = {
      id: 'b-1',
      numero: data.numero,
      nomComplet: data.nomComplet,
      statut: 'EMIS',
      ecritureId: null,
      netAPayerFc: data.netAPayerFc,
      entree: data.entree,
      calcul: data.calcul,
    };
    const p = propositionPaieDuMois('2026-05', 'SYCEBNL', [b]);
    expect(p.refus).toEqual([]);
    expect(p.lignes.find((l) => l.compte === '66140000')).toEqual(expect.objectContaining({ sens: 'DEBIT', montantFc: 350_000 }));
    expect(p.lignes.find((l) => l.compte === '66130000')).toEqual(expect.objectContaining({ sens: 'DEBIT', montantFc: 60_000 }));
    expect(p.lignes.find((l) => l.bloc === 'BRUT' && l.compte === '42200000')).toEqual(
      expect.objectContaining({ sens: 'CREDIT', montantFc: 670_000 }),
    );
    expect(p.equilibree).toBe(true);
    expect(p.solde422Fc).toBeCloseTo(data.netAPayerFc, 2);
  });

  it('COEXISTENCE · un bulletin actif du mois refuse le décompte, sans rien créer', async () => {
    const { svc, create } = service({ actif: { numero: 7, nature: 'MOIS' } });
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission())).rejects.toThrow(/Le bulletin n° 7.*remplace le bulletin du mois de cessation/);
    expect(create).not.toHaveBeenCalled();
  });

  it('COEXISTENCE · un décompte actif du mois refuse le bulletin, et inversement', async () => {
    const { svc, create } = service({ actif: { numero: 9, nature: 'DECOMPTE_FINAL' } });
    // Un salaire au-dessus du plancher CNSS (décret n° 18/041, art. 8) · le
    // bulletin seul serait émissible, c'est le décompte actif qui le refuse.
    const bulletin = PAIE({ elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 }] } as Partial<SimulationPaieDto>);
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-1', bulletin)).rejects.toThrow(/Le décompte final n° 9.*remplace/);
    expect(create).not.toHaveBeenCalled();
  });

  it('REFUSE un solde partiel, rubriques nommées', async () => {
    const { svc, create } = service();
    const e = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ executionPreavis: undefined })).catch((x) => x);
    expect(e).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(e.getResponse())).toContain('préavis non chiffrée');
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse un contrat que le registre ne dit pas terminé dans le mois", async () => {
    const { svc, create } = service({ salarie: { ...SALARIE, contrats: [{ ...CONTRAT, dateFin: null }] } });
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission())).rejects.toThrow(/pas terminé/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse le type de contrat que le registre contredit', async () => {
    const { svc } = service();
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ typeContrat: 'DUREE_DETERMINEE' }))).rejects.toThrow(/contredit/);
  });

  it('refuse une stipulation en dollars · le décompte se chiffre en francs', async () => {
    const { svc } = service();
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({}, { deviseStipulation: 'USD' }))).rejects.toThrow(/francs congolais/);
  });

  it('refuse des arriérés déclarés qui contredisent les éléments du mois, et un mois sans éléments sans zéro déclaré', async () => {
    const { svc } = service();
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ arrieresFc: 100_000 }))).rejects.toThrow(/diffèrent/);
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({}, { elements: [] }))).rejects.toThrow(/zéro arriéré/);
  });

  it("refuse un mois de cessation qui n'est pas le mois de paie", async () => {
    const { svc } = service();
    await expect(svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ moisDeCessation: '2026-04' }))).rejects.toThrow(/diffèrent/);
  });

  it("n'impose pas les allocations familiales du décompte · elles sont leur propre taux légal (art. 69, 1)", async () => {
    const sans = service();
    await sans.svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    const avec = service();
    await avec.svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ enfantsBeneficiairesAllocations: 2, joursAllocationsFamiliales: 10 }));
    const a = sans.create.mock.calls[0][0].data;
    const b = avec.create.mock.calls[0][0].data;
    expect(b.totalVerseFc).toBeGreaterThan(a.totalVerseFc);
    // Même impôt, même assiette sociale · l'allocation est hors rémunération et immunisée.
    expect(b.irppFc).toBe(a.irppFc);
    expect(b.assietteSocialeFc).toBe(a.assietteSocialeFc);
  });
});
