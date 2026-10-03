import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import { propositionPaieDuMois, type BulletinAComptabiliser } from './comptabilisation-paie';
import type { DecompteFinalDto, EmissionDecompteFinalDto, SimulationPaieDto } from './dto/personnel.dto';
import {
  DecompteFinalDto as DecompteFinalDtoClasse,
  EmissionDecompteFinalDto as EmissionDecompteFinalDtoClasse,
  MOTIF_ANCIENNETE_EXIGEE,
  MOTIF_MOIS_NON_COUVERTS_EXIGES,
} from './dto/personnel.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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
  prisma.$executeRaw = jest.fn().mockResolvedValue(0);
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return { svc: new PersonnelService(prisma as unknown as PrismaService), create, prisma };
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

  // ─── Premier tour de relecture (A8) ──────────────────────────────────────

  it("(h) prend le verrou du dossier EN TÊTE de la transaction, avant de lire l'actif du mois", async () => {
    const { svc, prisma } = service();
    await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    const verrou = prisma.$executeRaw as jest.Mock;
    expect(verrou).toHaveBeenCalledTimes(1);
    const gabarit = (verrou.mock.calls[0][0] as readonly string[]).join('?');
    expect(gabarit).toContain('pg_advisory_xact_lock(hashtext(');
    expect(verrou.mock.calls[0][1]).toBe('bulletins-paie:t-1');
    const findFirst = (prisma.bulletinPaie as { findFirst: jest.Mock }).findFirst;
    const lectureActif = findFirst.mock.calls.findIndex((c) => c[0].where.statut !== undefined);
    expect(lectureActif).toBeGreaterThanOrEqual(0);
    expect(verrou.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[lectureActif]);
  });

  it('(g) les motifs du refus arrivent DANS le message, que l’écran lit', async () => {
    const { svc } = service();
    const e = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ executionPreavis: undefined })).catch((x) => x);
    const reponse = e.getResponse() as { message: string; motifs: string[] };
    expect(reponse.message).toContain('préavis non chiffrée');
    expect(reponse.motifs.length).toBeGreaterThan(0);
  });

  it('(l) une gratification non déclarée refuse avec un motif qui dit quoi faire', async () => {
    const { svc, create } = service();
    const e = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ gratificationFc: undefined })).catch((x) => x);
    expect((e.getResponse() as { message: string }).message).toContain('Déclarez la gratification, zéro compris.');
    expect(create).not.toHaveBeenCalled();
  });

  it('(j) un élément du mois NÉGATIF est refusé, jamais ramené à zéro', async () => {
    const { svc, create } = service();
    const e = await svc
      .emettreDecompteFinal('t-1', 'u-1', 's-1', emission({}, { elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: -5 }] } as Partial<SimulationPaieDto>))
      .catch((x) => x);
    expect(e).toBeInstanceOf(BadRequestException);
    expect((e.getResponse() as { message: string }).message).toContain('négatif');
    expect(create).not.toHaveBeenCalled();
  });

  it("(j) un taux légal d'allocations DÉCLARÉ n'est pas écrasé en silence · refusé quand le décompte calcule les allocations", async () => {
    const { svc, create } = service();
    const e = await svc
      .emettreDecompteFinal(
        't-1',
        'u-1',
        's-1',
        emission({ enfantsBeneficiairesAllocations: 2, joursAllocationsFamiliales: 10 }, { tauxLegalAllocationsFamilialesFc: 1_000 }),
      )
      .catch((x) => x);
    expect((e.getResponse() as { message: string }).message).toContain('taux légal des allocations familiales est déclaré');
    expect(create).not.toHaveBeenCalled();
  });

  it('(m) une nature payée par le mois ET par le décompte est refusée · le congé ne se verse pas deux fois', async () => {
    const { svc, create } = service();
    const paie = {
      elements: [
        { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de mai', montantFc: 260_000 },
        { nature: 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE', libelle: 'Congé', montantFc: 10_000 },
      ],
    } as Partial<SimulationPaieDto>;
    const e = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({}, paie)).catch((x) => x);
    expect((e.getResponse() as { message: string }).message).toContain('versée deux fois');
    expect(create).not.toHaveBeenCalled();
  });

  it("(n) des allocations familiales au décompte AVERTISSENT qu'il ne passera pas au journal, sans rien imputer", async () => {
    const { svc, create } = service();
    const relu = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ enfantsBeneficiairesAllocations: 2, joursAllocationsFamiliales: 10 }));
    expect(relu.avertissements.join(' ')).toContain('NE PASSERA PAS AU JOURNAL');
    const data = create.mock.calls[0][0].data;
    expect(data.calcul.avertissementsDecompteEmis.join(' ')).toContain('ALLOCATIONS_FAMILIALES_LEGALES');
    // Et la passation, elle, refuse · aucun compte deviné, pas même le 6616.
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
    expect(p.refus.length).toBeGreaterThan(0);
    expect(p.lignes.some((l) => l.compte === '66160000')).toBe(false);
  });

  it("(n) sans allocations, aucun avertissement · la réponse le dit vide", async () => {
    const { svc } = service();
    const relu = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    expect(relu.avertissements).toEqual([]);
  });

  it("(k) chaque rubrique est arrondie au centime avant d'être un élément", async () => {
    const { svc, create } = service();
    await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ remunerationJournaliereFc: 10_000.0003 }));
    const elements = create.mock.calls[0][0].data.entree.elements as { montantFc: number }[];
    for (const e of elements) expect(Math.round(e.montantFc * 100) / 100).toBe(e.montantFc);
    expect(elements.find((e) => (e as { nature?: string }).nature === 'INDEMNITE_DE_FIN_DE_CONTRAT')?.montantFc).toBe(350_000.01);
  });

  it("ASSIETTE · des avantages compris dans le préavis et non ventilés refusent l'émission", async () => {
    const { svc, create } = service();
    const e = await svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission({ avantagesPendantPreavisFc: 35_000 })).catch((x) => x);
    expect((e.getResponse() as { message: string }).message).toContain('ventilez-les');
    expect(create).not.toHaveBeenCalled();
  });

  it("ASSIETTE · ventilés en logement, les avantages sortent de l'assiette sociale sous leur nature", async () => {
    const base = service();
    await base.svc.emettreDecompteFinal('t-1', 'u-1', 's-1', emission());
    const ventile = service();
    await ventile.svc.emettreDecompteFinal('t-1', 'u-1', 's-1', {
      ...emission({ avantagesPendantPreavisFc: 35_000 }),
      ventilationAvantages: [{ rubrique: 'preavis', nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement pendant le préavis', montantFc: 35_000 }],
    });
    const a = base.create.mock.calls[0][0].data;
    const b = ventile.create.mock.calls[0][0].data;
    const natures = (b.entree.elements as { nature: string; montantFc: number }[]).map((x) => [x.nature, x.montantFc]);
    expect(natures).toContainEqual(['INDEMNITE_DE_FIN_DE_CONTRAT', 350_000]);
    expect(natures).toContainEqual(['LOGEMENT_OU_SON_INDEMNITE', 35_000]);
    expect(b.totalVerseFc).toBe(a.totalVerseFc + 35_000);
    expect(b.assietteSocialeFc).toBe(a.assietteSocialeFc);
    // La réserve « corpus muet » voyage avec le document.
    expect(b.calcul.reservesDecompteEmis.join(' ')).toContain("lecture d'OmegaX, le corpus se tait");
  });
});

describe('A8 (B2) · ancienneté et mois non couverts exigés à l’ÉMISSION, pas au calcul seul', () => {
  const corps = (decompte: Record<string, unknown>) => ({ decompte, paie: PAIE() });

  it("refuse l'émission sans ancienneté ni mois non couverts, par un motif nommé", async () => {
    const { anneesAnciennete, moisNonCouvertsParUnConge, ...reste } = FAITS;
    void anneesAnciennete;
    void moisNonCouvertsParUnConge;
    const erreurs = await validate(plainToInstance(EmissionDecompteFinalDtoClasse, corps(reste)));
    const messages = JSON.stringify(erreurs);
    expect(messages).toContain(MOTIF_ANCIENNETE_EXIGEE);
    expect(messages).toContain(MOTIF_MOIS_NON_COUVERTS_EXIGES);
  });

  it('admet le zéro déclaré', async () => {
    const erreurs = await validate(plainToInstance(EmissionDecompteFinalDtoClasse, corps({ ...FAITS, anneesAnciennete: 0, moisNonCouvertsParUnConge: 0 })));
    expect(JSON.stringify(erreurs)).not.toContain(MOTIF_ANCIENNETE_EXIGEE);
  });

  it('le calcul seul ne porte pas le motif de l’émission', async () => {
    const { anneesAnciennete, ...reste } = FAITS;
    void anneesAnciennete;
    const erreurs = await validate(plainToInstance(DecompteFinalDtoClasse, reste));
    expect(JSON.stringify(erreurs)).not.toContain(MOTIF_ANCIENNETE_EXIGEE);
  });
});
