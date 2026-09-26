import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATEGORIES_ARTICLE_31,
  COMPTES_DEROGATOIRE,
  coefficientDegressif,
  derogatoireDeLExercice,
  motifRefusOptionDegressif,
  planFiscalDegressif,
} from './amortissement-degressif';
import { DegressifService } from './degressif.service';

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
      bienNeuf: true, dureeFiscaleAns: 5, amortissementAnterieur: 0, dotationsPassees: 0,
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
  function monter(over: { dotations?: unknown[]; derogatoires?: unknown[]; systeme?: string } = {}) {
    const creer = jest.fn(async () => ({ id: 'ecr' }));
    const create = jest.fn(async ({ data }: { data: unknown }) => data);
    const prisma = {
      immobilisation: {
        findFirst: jest.fn(async () => ({
          id: 'i', designation: 'Presse', degressifFiscal: true, dureeFiscaleAns: 5, valeurOrigine: 1_000_000, valeurResiduelle: 0,
          dateMiseEnService: d('2026-07-15'), compteImmobilisation: { numero: '24110000' },
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
    return { s: new DegressifService(prisma as never, { creer } as never), creer, create };
  }

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
