import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  avertissementsDureeFiscale,
  CATEGORIES_ARTICLE_31,
  COMPTES_DEROGATOIRE,
  coefficientDegressif,
  derogatoireDeLExercice,
  motifRefusOptionDegressif,
  motifRegimeAnterieurDegressif,
  planFiscalDegressif,
} from './amortissement-degressif';
import { DegressifService } from './degressif.service';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const exercices = [2026, 2027, 2028, 2029, 2030, 2031, 2032].map((a) => ({ id: `e${a}`, dateDebut: d(`${a}-01-01`), dateFin: d(`${a}-12-31`) }));

describe('dégressif fiscal · loi n° 23/053, art. 31 à 35', () => {
  it('coefficients de l’art. 33 et exclusions de l’art. 32 (quatre ans reçoit 1,5, trois ans rien)', () => {
    expect([3, 4, 5, 6, 7, 20, 21].map(coefficientDegressif)).toEqual([null, 1.5, 2, 2, 2.5, 2.5, null]);
  });

  it("dix catégories, la liste limitative de l'art. 31", () => {
    expect(CATEGORIES_ARTICLE_31).toHaveLength(10);
  });

  it('prorata au mois de mise en service, taux sur la valeur résiduelle, bascule de l’art. 35, total égal à la base', () => {
    const plan = planFiscalDegressif({ base: 1_000_000, dureeFiscaleAns: 5, dateMiseEnService: d('2026-07-15'), exercices });
    expect(plan.map((l) => l.annuite)).toEqual([200_000, 320_000, 192_000, 115_200, 115_200, 57_600]);
    expect(plan.map((l) => l.mode)).toEqual(['DEGRESSIF', 'DEGRESSIF', 'DEGRESSIF', 'DEGRESSIF', 'LINEAIRE_ART_35', 'LINEAIRE_ART_35']);
    expect(plan.reduce((s, l) => s + l.annuite, 0)).toBe(1_000_000);
  });

  it('refuse le SYCEBNL, une personne physique, un incorporel, un bien d’occasion, une durée hors bornes, un bien déjà doté', () => {
    const ok = {
      referentiel: 'SYSCOHADA', personnePhysique: false, numeroCompteImmobilisation: '24110000', categorie: 'MATERIEL_INDUSTRIEL',
      bienNeuf: true, dureeFiscaleAns: 5, amortissementAnterieur: 0, dotationsPassees: 0, dateMiseEnService: d('2026-07-15') as Date | null,
    };
    expect(motifRefusOptionDegressif(ok)).toBeNull();
    expect(motifRefusOptionDegressif({ ...ok, referentiel: 'SYCEBNL' })).toMatch(/SYCEBNL/);
    expect(motifRefusOptionDegressif({ ...ok, personnePhysique: true })).toMatch(/sociétés/);
    expect(motifRefusOptionDegressif({ ...ok, numeroCompteImmobilisation: '21300000' })).toMatch(/incorporelles/);
    expect(motifRefusOptionDegressif({ ...ok, bienNeuf: false })).toMatch(/NEUFS/);
    expect(motifRefusOptionDegressif({ ...ok, categorie: 'VEHICULE' })).toMatch(/catégorie/);
    expect(motifRefusOptionDegressif({ ...ok, dureeFiscaleAns: 3 })).toMatch(/quatre à vingt/);
    expect(motifRefusOptionDegressif({ ...ok, dotationsPassees: 1 })).toMatch(/première dotation/);
    expect(motifRefusOptionDegressif({ ...ok, amortissementAnterieur: 10 })).toMatch(/repris/);
  });

  it('B1 · refuse un bien mis en service avant le 1er janvier 2026 (loi n° 23/053, art. 153 ; arrêté n° 013/2025, art. 6)', () => {
    const ok = {
      referentiel: 'SYSCOHADA', personnePhysique: false, numeroCompteImmobilisation: '24110000', categorie: 'MATERIEL_INDUSTRIEL',
      bienNeuf: true, dureeFiscaleAns: 5, amortissementAnterieur: 0, dotationsPassees: 0,
    };
    expect(motifRefusOptionDegressif({ ...ok, dateMiseEnService: d('2025-03-01') })).toMatch(/avant le 1er janvier 2026.*art\. 153.*art\. 6/);
    expect(motifRefusOptionDegressif({ ...ok, dateMiseEnService: d('2025-12-31') })).toMatch(/n'est pas calculé par OmegaX/);
    // La borne est la date d'entrée en vigueur elle-même, comprise.
    expect(motifRefusOptionDegressif({ ...ok, dateMiseEnService: d('2026-01-01') })).toBeNull();
    // Pas encore mis en service · l'option reste ouverte, la borne se revérifie au dérogatoire.
    expect(motifRefusOptionDegressif({ ...ok, dateMiseEnService: null })).toBeNull();
    expect(motifRegimeAnterieurDegressif(d('2025-03-01'))).toMatch(/reprise du solde du dérogatoire déjà passé reste ouverte/);
  });
});

describe('B5 · la durée fiscale confrontée à la nature du barème (arrêté n° 013/2025, art. 2 et 4)', () => {
  it('une durée plus courte que le barème se signale, avec la réserve de l’art. 4', () => {
    // III.14 · machines-outils légères, cinq ans.
    const a = avertissementsDureeFiscale({ natureFiscaleCle: 'III.14', dureeFiscaleAns: 4 });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/plus courte que celle du barème.*\(5 ans, arrêté n° 013\/2025, art\. 2\).*sous peine de rejet \(arrêté, art\. 4\)/);
  });

  it('un barème hors des quatre à vingt ans, et une durée déclarée qui y entre, se signalent avec l’art. 32, 1°', () => {
    // III.20 · matériels d'usine fixes, trois ans ; II.12 · autoroutes, quarante ans.
    expect(avertissementsDureeFiscale({ natureFiscaleCle: 'III.20', dureeFiscaleAns: 4 })[0]).toMatch(/3 ans.*art\. 32, 1°/);
    expect(avertissementsDureeFiscale({ natureFiscaleCle: 'II.12', dureeFiscaleAns: 20 })[0]).toMatch(/40 ans.*art\. 32, 1°/);
  });

  it('rien à signaler · durée égale ou plus longue, nature absente ou inconnue', () => {
    expect(avertissementsDureeFiscale({ natureFiscaleCle: 'III.14', dureeFiscaleAns: 5 })).toEqual([]);
    expect(avertissementsDureeFiscale({ natureFiscaleCle: 'III.14', dureeFiscaleAns: 8 })).toEqual([]);
    expect(avertissementsDureeFiscale({ natureFiscaleCle: null, dureeFiscaleAns: 4 })).toEqual([]);
    expect(avertissementsDureeFiscale({ natureFiscaleCle: 'ZZ.1', dureeFiscaleAns: 4 })).toEqual([]);
  });
});

describe('le dérogatoire · écart entre annuité fiscale et dotation comptable', () => {
  it('dotation quand le fiscal dépasse, reprise dans la limite du cumul, excédent à réintégrer au-delà', () => {
    expect(derogatoireDeLExercice(200_000, 100_000, 0)).toEqual({ dotation: 100_000, reprise: 0, excedentAReintegrer: 0 });
    expect(derogatoireDeLExercice(57_600, 200_000, 100_000)).toEqual({ dotation: 0, reprise: 100_000, excedentAReintegrer: 42_400 });
    expect(derogatoireDeLExercice(115_200, 200_000, 500_000)).toEqual({ dotation: 0, reprise: 84_800, excedentAReintegrer: 0 });
  });

  it('les trois comptes sont ouverts au semis SYSCOHADA', () => {
    const semis = readFileSync(join(__dirname, '..', 'comptes', 'compte-seed-syscohada.ts'), 'utf8');
    for (const c of Object.values(COMPTES_DEROGATOIRE)) expect(semis).toContain(`'${c}'`);
  });
});

describe('DegressifService.passer', () => {
  function monter(over: { dotations?: unknown[]; derogatoires?: unknown[]; systeme?: string; doublon?: boolean; miseEnService?: Date } = {}) {
    const creer = jest.fn(async () => ({ id: 'ecr' }));
    const retirerCompensation = jest.fn(async () => undefined);
    // Un second clic passé entre la lecture et l'enregistrement · l'index
    // unique (bien, exercice, nature) refuse la seconde fiche.
    const create = jest.fn(async ({ data }: { data: unknown }) => {
      if (over.doublon) throw new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' });
      return data;
    });
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', designation: 'Presse', degressifFiscal: true, dureeFiscaleAns: 5, valeurOrigine: 1_000_000, valeurResiduelle: 0,
          dateMiseEnService: over.miseEnService ?? d('2026-07-15'), compteImmobilisation: { numero: '24110000' },
          dotations: over.dotations ?? [{ exerciceId: 'e2026', montant: 100_000 }],
          derogatoires: over.derogatoires ?? [],
        })),
      },
      exercice: { findMany: jest.fn(async () => exercices), findFirstOrThrow: jest.fn(async () => exercices[0]) },
      compte: { findUnique: jest.fn(async ({ where }: { where: { tenantId_numero: { numero: string } } }) => ({ id: where.tenantId_numero.numero })) },
      amortissementDerogatoire: { create },
      tenant: {
        findUniqueOrThrow: jest.fn(async () => ({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: over.systeme ?? 'NORMAL' })),
      },
    };
    return { s: new DegressifService(prisma as never, { creer, retirerCompensation } as never), creer, create, retirerCompensation };
  }

  it('un double envoi retire la seconde écriture 851/151 et répond 409 (audit final F132)', async () => {
    const { s, retirerCompensation } = monter({ doublon: true });
    const refus = s.passer('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' });
    await expect(refus).rejects.toBeInstanceOf(ConflictException);
    await expect(refus).rejects.toThrow(/déjà passé/);
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'ecr');
  });

  it('le solde d’un bien, doublé, retire aussi sa seconde écriture (audit final F132)', async () => {
    const { s, retirerCompensation } = monter({
      doublon: true,
      derogatoires: [{ exerciceId: 'e2026', nature: 'EXERCICE', dotation: 100_000, reprise: 0 }],
    });
    (s as unknown as { prisma: { exercice: { findFirst: jest.Mock } } }).prisma.exercice.findFirst = jest.fn(async () => exercices[0]);
    await expect(s.solder('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' })).rejects.toBeInstanceOf(ConflictException);
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'ecr');
  });

  it('une autre panne retire l’écriture aussi, et remonte telle quelle', async () => {
    const { s, create, retirerCompensation } = monter();
    create.mockRejectedValueOnce(new Error('coupure'));
    await expect(s.passer('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' })).rejects.toThrow('coupure');
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'ecr');
  });

  it('passe la dotation 851/151 de l’écart, et la consigne', async () => {
    const { s, creer, create } = monter();
    await s.passer('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' });
    expect((creer.mock.calls[0] as unknown as [string, string, { lignes: unknown[] }])[2].lignes).toEqual([
      { compteId: '85100000', debit: 100_000, credit: 0 },
      { compteId: '15100000', debit: 0, credit: 100_000 },
    ]);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ annuiteFiscale: 200_000, dotation: 100_000, ecritureId: 'ecr' }) });
  });

  it('refuse sans dotation comptable, et quand un exercice antérieur du plan manque', async () => {
    await expect(monter({ dotations: [] }).s.passer('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' })).rejects.toThrow(/dotation comptable/);
    await expect(
      monter({ dotations: [{ exerciceId: 'e2027', montant: 200_000 }] }).s.passer('t', 'u', 'i', { exerciceId: 'e2027', journalId: 'od' }),
    ).rejects.toThrow(/antérieur/);
  });

  it("la dotation comptable lue est celle de CET exercice, pas une autre", async () => {
    const { s } = monter({ derogatoires: [{ exerciceId: 'e2026', nature: 'EXERCICE', dotation: 100_000, reprise: 0 }] });
    await expect(s.passer('t', 'u', 'i', { exerciceId: 'e2027', journalId: 'od' })).rejects.toThrow(/dotation comptable/);
  });

  it('refuse un nouveau dérogatoire au Système minimal de trésorerie (Titre X, linéaire)', async () => {
    const { s, creer } = monter({ systeme: 'MINIMAL_TRESORERIE' });
    await expect(s.passer('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' })).rejects.toThrow(/Titre X ch\. 1 § 1/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('B1 · refuse, NOMMÉ, le dérogatoire d’un bien sous option mis en service avant 2026, sur tout exercice', async () => {
    const exercices2025 = [{ id: 'e2025', dateDebut: d('2025-01-01'), dateFin: d('2025-12-31') }, ...exercices];
    for (const exerciceId of ['e2025', 'e2026']) {
      const { s, creer } = monter({ miseEnService: d('2025-03-01'), dotations: [{ exerciceId, montant: 100_000 }] });
      (s as unknown as { prisma: { exercice: { findMany: jest.Mock } } }).prisma.exercice.findMany = jest.fn(async () => exercices2025);
      await expect(s.passer('t', 'u', 'i', { exerciceId, journalId: 'od' })).rejects.toThrow(/avant le 1er janvier 2026/);
      expect(creer).not.toHaveBeenCalled();
    }
  });

  it('B1 · la reprise du solde du dérogatoire déjà passé reste ouverte pour ce bien', async () => {
    const { s, creer } = monter({
      miseEnService: d('2025-03-01'),
      derogatoires: [{ exerciceId: 'e2025', nature: 'EXERCICE', dotation: 60_000, reprise: 0 }],
    });
    (s as unknown as { prisma: { exercice: { findFirst: jest.Mock } } }).prisma.exercice.findFirst = jest.fn(async () => exercices[0]);
    await s.solder('t', 'u', 'i', { exerciceId: 'e2026', journalId: 'od' });
    expect((creer.mock.calls[0] as unknown as [string, string, { lignes: unknown[] }])[2].lignes).toEqual([
      { compteId: '15100000', debit: 60_000, credit: 0 },
      { compteId: '86100000', debit: 0, credit: 60_000 },
    ]);
  });

  it('B1 · le plan d’un tel bien n’est ni prolongé ni recommencé, et le motif est rendu avec le cumul du 151', async () => {
    const { s } = monter({
      miseEnService: d('2025-03-01'),
      derogatoires: [{ exerciceId: 'e2025', nature: 'EXERCICE', dotation: 60_000, reprise: 0 }],
    });
    const plan = await s.planFiscal('t', 'i');
    expect(plan.lignes).toEqual([]);
    expect(plan.regimeAnterieur).toMatch(/avant le 1er janvier 2026/);
    expect(plan.cumulDerogatoire).toBe(60_000);
    // Un bien mis en service en 2026 garde son plan, et aucun motif.
    const courant = await monter().s.planFiscal('t', 'i');
    expect(courant.lignes.length).toBeGreaterThan(0);
    expect(courant.regimeAnterieur).toBeNull();
  });

  it('la reprise passe 151/861', async () => {
    const { s, creer } = monter({
      dotations: [{ exerciceId: 'e2026', montant: 100_000 }, { exerciceId: 'e2027', montant: 400_000 }],
      derogatoires: [{ exerciceId: 'e2026', nature: 'EXERCICE', dotation: 100_000, reprise: 0 }],
    });
    await s.passer('t', 'u', 'i', { exerciceId: 'e2027', journalId: 'od' });
    expect((creer.mock.calls[0] as unknown as [string, string, { lignes: unknown[] }])[2].lignes).toEqual([
      { compteId: '15100000', debit: 80_000, credit: 0 },
      { compteId: '86100000', debit: 0, credit: 80_000 },
    ]);
  });
});

describe('DegressifService.opter · borne de 2026 et nature du barème', () => {
  function monterOption(immo: Record<string, unknown>) {
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'i', ...data }));
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', degressifFiscal: false, amortissementAnterieur: 0, dotations: [], derogatoires: [],
          compteImmobilisation: { numero: '24110000' }, dateMiseEnService: d('2026-02-01'), natureFiscaleCle: null, ...immo,
        })),
        update,
      },
      tenant: {
        findUniqueOrThrow: jest.fn(async () => ({ referentiel: 'SYSCOHADA', formeJuridiqueSyscohada: 'SARL', systemeComptableSyscohada: 'NORMAL' })),
      },
    };
    return { s: new DegressifService(prisma as never, {} as never), update };
  }
  const dto = (dureeFiscaleAns: number) => ({ categorie: 'MATERIEL_INDUSTRIEL', bienNeuf: true, dureeFiscaleAns }) as never;

  it('B1 · refuse l’option d’un bien mis en service en 2025, sans rien écrire', async () => {
    const { s, update } = monterOption({ dateMiseEnService: d('2025-03-01') });
    await expect(s.opter('t', 'i', dto(5))).rejects.toThrow(/avant le 1er janvier 2026/);
    expect(update).not.toHaveBeenCalled();
  });

  it('B5 · l’option est prise, et l’écart avec le barème revient en avertissement', async () => {
    const { s, update } = monterOption({ natureFiscaleCle: 'III.14' });
    const r = await s.opter('t', 'i', dto(4));
    expect(update).toHaveBeenCalled();
    expect(r.avertissements[0]).toMatch(/plus courte que celle du barème/);
    expect((await monterOption({ natureFiscaleCle: 'III.14' }).s.opter('t', 'i', dto(5))).avertissements).toEqual([]);
  });

  it('B5 · avant l’option, le plan propose la durée de la nature du barème que le bien porte', async () => {
    const { s } = monterOption({ natureFiscaleCle: 'III.14' });
    const plan = await s.planFiscal('t', 'i');
    expect(plan.natureBareme).toEqual({ cle: 'III.14', designation: expect.stringMatching(/Machines-outils/), dureeAns: 5 });
  });
});

describe('DegressifService.opter au Système minimal de trésorerie', () => {
  it('refuse l’option, le Titre X ne connaissant que le linéaire', async () => {
    const update = jest.fn();
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', degressifFiscal: false, amortissementAnterieur: 0, dotations: [], derogatoires: [],
          compteImmobilisation: { numero: '24110000' },
        })),
        update,
      },
      tenant: {
        findUniqueOrThrow: jest.fn(async () => ({
          referentiel: 'SYSCOHADA', formeJuridiqueSyscohada: 'SARL', systemeComptableSyscohada: 'MINIMAL_TRESORERIE',
        })),
      },
    };
    const s = new DegressifService(prisma as never, {} as never);
    await expect(
      s.opter('t', 'i', { categorie: 'MATERIEL_INDUSTRIEL', bienNeuf: true, dureeFiscaleAns: 5 } as never),
    ).rejects.toThrow(/Titre X ch\. 1 § 1/);
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * AMORTISSEMENT EXCEPTIONNEL · loi n° 23/053, art. 36 à 38, décisions D-8 à
 * D-10 du 2026-10-01. 60 % plein la première période (le renvoi « article
 * 31 » de l'art. 38, 1° se lit « article 34 », comme l'O.-L. n° 69/009 écartait
 * le prorata), puis le dégressif et la bascule ; ouvert à toute entreprise ;
 * prorata d'export déclaré et calculé, refusé sous 20 %.
 */
describe('amortissement exceptionnel · art. 36 à 38', () => {
  it('60 % du coût de revient la première année, SANS prorata, puis le dégressif et la bascule, total égal à la base', () => {
    const plan = planFiscalDegressif({
      base: 1_000_000,
      dureeFiscaleAns: 5,
      dateMiseEnService: d('2026-07-15'),
      exercices,
      exceptionnel: true,
    });
    // Le dégressif seul donnait 200 000 en 2026 (six mois de 40 %).
    expect(plan[0]).toMatchObject({ annuite: 600_000, mode: 'EXCEPTIONNEL_ART_38' });
    expect(plan.map((l) => l.annuite)).toEqual([600_000, 160_000, 96_000, 57_600, 57_600, 28_800]);
    expect(plan[4].mode).toBe('LINEAIRE_ART_35');
    expect(plan.reduce((s, l) => s + l.annuite, 0)).toBe(1_000_000);
  });

  it('un premier exercice long garde la première annuité exceptionnelle et ajoute la suivante', () => {
    const long = [{ id: 'eLong', dateDebut: d('2026-01-01'), dateFin: d('2027-12-31') }];
    const plan = planFiscalDegressif({ base: 1_000_000, dureeFiscaleAns: 5, dateMiseEnService: d('2026-03-01'), exercices: long, exceptionnel: true });
    expect(plan[0]).toMatchObject({ annuite: 760_000, mode: 'EXCEPTIONNEL_ART_38' });
  });

  const base = {
    referentiel: 'SYSCOHADA', personnePhysique: false, numeroCompteImmobilisation: '24110000', categorie: 'MATERIEL_INDUSTRIEL',
    bienNeuf: true, dureeFiscaleAns: 5, amortissementAnterieur: 0, dotationsPassees: 0, dateMiseEnService: d('2026-07-15') as Date | null,
  };
  const declaration = { activiteIndustrielle: true, chiffreAffairesExportHt: 200, chiffreAffairesTotalHt: 1000, source: 'Déclaration IS 2026' };

  it('le seuil de 20 % est inclus, 19,99 % est refusé avec le prorata dit', () => {
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: declaration })).toBeNull();
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: { ...declaration, chiffreAffairesExportHt: 199.9 } })).toContain('19.99 %');
  });

  it('ouvert à une entreprise individuelle (art. 36), quand le dégressif seul lui reste fermé (art. 31)', () => {
    expect(motifRefusOptionDegressif({ ...base, personnePhysique: true, exceptionnel: declaration })).toBeNull();
    expect(motifRefusOptionDegressif({ ...base, personnePhysique: true })).toContain('sociétés');
  });

  it('refuse sans activité industrielle attestée, sans chiffres, sans source, ou un export supérieur au total', () => {
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: { ...declaration, activiteIndustrielle: false } })).toContain('ouvrés ou semi-ouvrés');
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: { ...declaration, chiffreAffairesTotalHt: null } })).toContain('saisissez');
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: { ...declaration, source: '  ' } })).toContain('source');
    expect(motifRefusOptionDegressif({ ...base, exceptionnel: { ...declaration, chiffreAffairesExportHt: 1200 } })).toContain('dépasser');
  });

  it('loi n° 23/053, art. 37 · les conditions des art. 31 et 32 restent exigées (incorporel, occasion, durée hors bornes) et le référentiel associatif reste fermé', () => {
    expect(motifRefusOptionDegressif({ ...base, numeroCompteImmobilisation: '21300000', exceptionnel: declaration })).toContain('art. 32');
    expect(motifRefusOptionDegressif({ ...base, bienNeuf: false, exceptionnel: declaration })).toContain('NEUFS');
    expect(motifRefusOptionDegressif({ ...base, dureeFiscaleAns: 3, exceptionnel: declaration })).toContain('quatre à vingt');
    expect(motifRefusOptionDegressif({ ...base, referentiel: 'SYCEBNL', exceptionnel: declaration })).toContain('SYCEBNL');
  });
});

describe('DegressifService.opter · amortissement exceptionnel', () => {
  function monter(forme: string) {
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'i', ...data }));
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', degressifFiscal: false, amortissementAnterieur: 0, dotations: [], derogatoires: [],
          compteImmobilisation: { numero: '24110000' }, dateMiseEnService: d('2026-02-01'), natureFiscaleCle: null,
        })),
        update,
      },
      tenant: {
        findUniqueOrThrow: jest.fn(async () => ({ referentiel: 'SYSCOHADA', formeJuridiqueSyscohada: forme, systemeComptableSyscohada: 'NORMAL' })),
      },
    };
    return { s: new DegressifService(prisma as never, {} as never), update };
  }
  const option = {
    categorie: 'MATERIEL_INDUSTRIEL', bienNeuf: true, dureeFiscaleAns: 5, exceptionnel: true, activiteIndustrielle: true,
    chiffreAffairesExportHt: 300_000, chiffreAffairesTotalHt: 1_000_000, sourceChiffreAffaires: ' États financiers 2026 ',
  };

  it('garde la déclaration de l’art. 36 sur le bien, même pour une entreprise individuelle', async () => {
    const { s, update } = monter('ENTREPRISE_INDIVIDUELLE');
    await s.opter('t', 'i', option as never);
    expect(update.mock.calls[0][0].data).toMatchObject({
      degressifFiscal: true,
      amortissementExceptionnel: true,
      chiffreAffairesExportHt: 300_000,
      chiffreAffairesTotalHt: 1_000_000,
      sourceChiffreAffairesExport: 'États financiers 2026',
    });
  });

  it('refuse sous 20 % sans rien écrire', async () => {
    const { s, update } = monter('SARL');
    await expect(s.opter('t', 'i', { ...option, chiffreAffairesExportHt: 150_000 } as never)).rejects.toThrow(/15\.00 %/);
    expect(update).not.toHaveBeenCalled();
  });

  it('le dégressif seul ne pose aucune déclaration d’export', async () => {
    const { s, update } = monter('SARL');
    await s.opter('t', 'i', { categorie: 'MATERIEL_INDUSTRIEL', bienNeuf: true, dureeFiscaleAns: 5 } as never);
    expect(update.mock.calls[0][0].data.amortissementExceptionnel).toBeUndefined();
  });
});

describe('DegressifService.planFiscal · un bien sous exceptionnel', () => {
  it('rend la première annuité à 60 %, sans prorata, et le prorata déclaré', async () => {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', degressifFiscal: true, amortissementExceptionnel: true, dureeFiscaleAns: 5, categorieDegressif: 'MATERIEL_INDUSTRIEL',
          valeurOrigine: 1_000_000, valeurResiduelle: 0, amortissementAnterieur: 0, dotations: [], derogatoires: [],
          chiffreAffairesExportHt: 250_000, chiffreAffairesTotalHt: 1_000_000, sourceChiffreAffairesExport: 'EF 2026',
          compteImmobilisation: { numero: '24110000' }, dateMiseEnService: d('2026-07-15'), natureFiscaleCle: null,
        })),
      },
      exercice: { findMany: jest.fn(async () => exercices) },
    };
    const plan = await new DegressifService(prisma as never, {} as never).planFiscal('t', 'i');
    expect(plan.lignes[0]).toMatchObject({ annuiteFiscale: 600_000, mode: 'EXCEPTIONNEL_ART_38' });
    expect(plan).toMatchObject({ amortissementExceptionnel: true, prorataExport: 0.25, sourceChiffreAffairesExport: 'EF 2026' });
  });
});
