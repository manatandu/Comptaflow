import { Prisma, Referentiel, StatutExercice, StatutImmobilisation } from '@prisma/client';
import {
  comptesEnCoursDuBien,
  compteEnCoursPropose,
  compteInscritALaDate,
  motifRefusCompteEnCours,
  motifSansEnCours,
  RACINES_EN_COURS,
} from './immobilisation-en-cours';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { COLONNES_QUI_RETIENNENT } from '../comptabilite/detenteurs-ecriture';

/**
 * L'IMMOBILISATION EN COURS (2026-10-01, demande de Manasse) · le bien non
 * achevé s'inscrit au 219, 229, 239 ou 249 ; « après achèvement », il est
 * porté au débit de son compte définitif par le crédit de l'en-cours (AUDCIF
 * Titre VII, fiches des comptes 21 à 24 ; SYCEBNL Partie 2 ch. 3, fiches 23
 * et 24). Avant ce chantier, le bien restait au 231 et la mise en service ne
 * passait rien · une balance juste, un poste du bilan faux.
 */

const D = (s: string) => new Date(`${s}T00:00:00Z`);
type Ligne = { compteId: string; debit: number; credit: number };

function numerosDetail(plan: ReadonlyArray<unknown>): string[] {
  return (plan as ReadonlyArray<{ numero: string; typeCompte?: string }>)
    .filter((l) => l.typeCompte !== 'TOTAL' && l.numero.length === 8)
    .map((l) => l.numero);
}
const SEME = { SYSCOHADA: numerosDetail(PLAN_COMPTES_SYSCOHADA), SYCEBNL: numerosDetail(PLAN_COMPTES_SYCEBNL) };
const comme = (numeros: string[]) => numeros.map((numero) => ({ numero }));

describe('les racines lues dans chaque texte', () => {
  it('219, 229, 239, 249 aux deux référentiels · au SYCEBNL, 219 et 229 par décision de Manasse (ses fiches 21 et 22 taisent le virement)', () => {
    expect(RACINES_EN_COURS.SYSCOHADA).toEqual({ '21': '219', '22': '229', '23': '239', '24': '249' });
    expect(RACINES_EN_COURS.SYCEBNL).toEqual({ '21': '219', '22': '229', '23': '239', '24': '249' });
    expect(motifSansEnCours('SYCEBNL', '21310000')).toBeNull();
    expect(motifSansEnCours('SYCEBNL', '22210000')).toBeNull();
    expect(motifSansEnCours('SYSCOHADA', '21310000')).toBeNull();
  });

  it('chaque racine servie a des comptes de détail aux deux semis', () => {
    for (const ref of ['SYSCOHADA', 'SYCEBNL'] as const) {
      for (const racine of Object.values(RACINES_EN_COURS[ref])) {
        expect(SEME[ref].filter((n) => n.startsWith(racine)).length).toBeGreaterThan(0);
      }
    }
  });

  it('un en-cours n’est jamais le compte définitif, et la division se respecte', () => {
    expect(motifSansEnCours('SYSCOHADA', '23910000')).toMatch(/lui-même un compte en cours/);
    expect(motifRefusCompteEnCours('SYSCOHADA', '23110000', '23910000')).toBeNull();
    expect(motifRefusCompteEnCours('SYSCOHADA', '23110000', '24910000')).toMatch(/au 239/);
    expect(motifRefusCompteEnCours('SYCEBNL', '24410000', '24940000')).toBeNull();
    expect(motifRefusCompteEnCours('SYCEBNL', '21310000', '21930000')).toBeNull();
    expect(motifRefusCompteEnCours('SYCEBNL', '21310000', '23910000')).toMatch(/au 219/);
    expect(motifSansEnCours('SYSCOHADA', '25100000')).toMatch(/pas de compte en cours/);
  });
});

describe('la présélection · seulement là où le texte apparie les subdivisions', () => {
  it('SYCEBNL, 249 « mêmes subdivisions que 241-248 » · chaque 24x semé trouve son 249x semé', () => {
    const candidats = comme(comptesEnCoursDuBien('SYCEBNL', '24100000', comme(SEME.SYCEBNL)).map((c) => c.numero));
    for (const x of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const definitifs = SEME.SYCEBNL.filter((n) => n.startsWith(`24${x}`));
      expect(definitifs.length).toBeGreaterThan(0);
      for (const d of definitifs) expect(compteEnCoursPropose('SYCEBNL', d, candidats)?.numero).toBe(`249${x}0000`);
    }
  });

  it('AUDCIF · aucune correspondance écrite, rien n’est présélectionné sur plusieurs candidats', () => {
    const candidats = comptesEnCoursDuBien('SYSCOHADA', '24410000', comme(SEME.SYSCOHADA));
    expect(candidats.length).toBeGreaterThan(1);
    expect(compteEnCoursPropose('SYSCOHADA', '24410000', candidats)).toBeNull();
    expect(compteEnCoursPropose('SYCEBNL', '23110000', comptesEnCoursDuBien('SYCEBNL', '23110000', comme(SEME.SYCEBNL)))).toBeNull();
  });

  it('un candidat unique se présélectionne toujours', () => {
    expect(compteEnCoursPropose('SYSCOHADA', '23110000', [{ numero: '23910000' }])?.numero).toBe('23910000');
  });
});

describe('le seul lecteur du compte où le bien est inscrit', () => {
  const bien = { compteImmobilisationId: 'c231', compteEnCoursId: 'c239', dateMiseEnService: null as Date | null };
  it('l’en-cours tant que la mise en service n’a pas eu lieu, le définitif à partir du jour même', () => {
    expect(compteInscritALaDate(bien, D('2026-06-30'))).toBe('c239');
    const enService = { ...bien, dateMiseEnService: D('2026-07-01') };
    expect(compteInscritALaDate(enService, D('2026-06-30'))).toBe('c239');
    expect(compteInscritALaDate(enService, D('2026-07-01'))).toBe('c231');
  });
  it('un bien jamais inscrit en cours reste à son compte', () => {
    expect(compteInscritALaDate({ ...bien, compteEnCoursId: null }, D('2026-06-30'))).toBe('c231');
  });
});

describe('la fiche retient l’écriture de mise en service', () => {
  it('colonne classée parmi celles qui retiennent', () => {
    expect(COLONNES_QUI_RETIENNENT).toContain('Immobilisation.ecritureMiseEnServiceId');
  });
});

const COMPTES: Record<string, string> = { c231: '23110000', c239: '23910000', c249: '24910000', c521: '52110000', c2392: '23920000' };

function harnaisCreation(referentiel: Referentiel = Referentiel.SYSCOHADA) {
  const creations: Record<string, unknown>[] = [];
  const creer = jest.fn().mockResolvedValue({ id: 'eAcq' });
  const prisma = {
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'f1',
        estActif: true,
        compteImmobilisationId: 'c231',
        compteAmortissementId: 'c283',
        compteDotationId: 'c681',
        dureeAmortissementAns: 20,
      }),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ dateDebut: D('2026-01-01') }) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(where.tenantId === 't1' && COMPTES[where.id] ? { id: where.id, numero: COMPTES[where.id] } : null),
      ),
    },
    immobilisation: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        creations.push(data);
        return Promise.resolve({ ...data, id: 'i1', valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] });
      }),
    },
  };
  return { svc: new ImmobilisationService(prisma as never, { creer } as never), creer, creations };
}

const BATIMENT = {
  familleId: 'f1',
  designation: 'Siège en construction',
  dateAcquisition: '2026-03-15',
  valeurOrigine: 40_000_000,
  exerciceId: 'e26',
  compteContrepartieId: 'c521',
  journalId: 'j1',
  compteEnCoursId: 'c239',
};

describe('création · le bien non achevé entre à son en-cours', () => {
  it('l’écriture d’acquisition débite le 239, la fiche garde le 231 comme compte définitif', async () => {
    const { svc, creer, creations } = harnaisCreation();
    await svc.creer('t1', 'u1', BATIMENT as never);
    expect((creer.mock.calls[0][2] as { lignes: Ligne[] }).lignes[0]).toEqual({ compteId: 'c239', debit: 40_000_000, credit: 0 });
    expect(creations[0]).toMatchObject({ compteImmobilisationId: 'c231', compteEnCoursId: 'c239', dateMiseEnService: null });
  });

  it('sans en-cours, rien ne change · le 231 est débité et la fiche n’a pas d’en-cours', async () => {
    const { svc, creer, creations } = harnaisCreation();
    await svc.creer('t1', 'u1', { ...BATIMENT, compteEnCoursId: undefined } as never);
    expect((creer.mock.calls[0][2] as { lignes: Ligne[] }).lignes[0].compteId).toBe('c231');
    expect(creations[0].compteEnCoursId).toBeNull();
  });

  it('refus avant toute écriture · date de mise en service fournie, en-cours d’une autre division, en-cours financé par un en-cours', async () => {
    for (const corps of [
      { ...BATIMENT, dateMiseEnService: '2026-04-01' },
      { ...BATIMENT, compteEnCoursId: 'c249' },
      { ...BATIMENT, compteContrepartieId: 'c2392' },
    ]) {
      const { svc, creer, creations } = harnaisCreation();
      await expect(svc.creer('t1', 'u1', corps as never)).rejects.toThrow();
      expect(creer).not.toHaveBeenCalled();
      expect(creations).toEqual([]);
    }
  });

  it('SYCEBNL · le 239 est ouvert par sa fiche 23', async () => {
    const { svc, creer } = harnaisCreation(Referentiel.SYCEBNL);
    await svc.creer('t1', 'u1', BATIMENT as never);
    expect((creer.mock.calls[0][2] as { lignes: Ligne[] }).lignes[0].compteId).toBe('c239');
  });
});

function harnaisMiseEnService(
  immo: Record<string, unknown>,
  o: { course?: boolean; statutExercice?: StatutExercice; finIncorporation?: Date } = {},
) {
  const creer = jest.fn().mockResolvedValue({ id: 'eMes' });
  const supprimees: string[] = [];
  const update = jest.fn(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) =>
    o.course
      ? Promise.reject(new Prisma.PrismaClientKnownRequestError('course', { code: 'P2025', clientVersion: 'x' }))
      : Promise.resolve({ id: where.id, ...data }),
  );
  const prisma = {
    immobilisation: { findFirst: jest.fn().mockResolvedValue(immo), update },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e26', statut: o.statutExercice ?? StatutExercice.OUVERT, dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
    // La doublure honore le filtre · seule une incorporation de CE bien compte.
    coutEmpruntIncorpore: {
      aggregate: jest.fn(({ where }: { where: { tenantId: string; immobilisationId: string } }) =>
        Promise.resolve({
          _max: { dateFin: where.tenantId === 't1' && where.immobilisationId === 'i1' ? (o.finIncorporation ?? null) : null },
        }),
      ),
    },
    ecriture: {
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        supprimees.push(where.id);
        return Promise.resolve({});
      }),
    },
  };
  return { svc: new ImmobilisationService(prisma as never, { creer } as never), creer, update, supprimees };
}

const EN_COURS = {
  id: 'i1',
  designation: 'Siège',
  dateAcquisition: D('2026-03-15'),
  dateMiseEnService: null,
  statut: StatutImmobilisation.EN_SERVICE,
  // 40 000 000 d'acquisition + 1 500 000 de coûts d'emprunt incorporés (lot 13).
  valeurOrigine: new Prisma.Decimal(41_500_000),
  compteImmobilisationId: 'c231',
  compteEnCoursId: 'c239',
};
const CORPS = { date: '2026-09-30', exerciceId: 'e26', journalId: 'j1' };

describe('mise en service d’un bien inscrit en cours', () => {
  it('UNE écriture D définitif / C en cours, du montant porté (coûts d’emprunt compris), datée de la mise en service, retenue par la fiche', async () => {
    const { svc, creer, update } = harnaisMiseEnService(EN_COURS);
    await svc.mettreEnService('t1', 'u1', 'i1', CORPS);
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][2]).toMatchObject({
      exerciceId: 'e26',
      journalId: 'j1',
      date: '2026-09-30',
      lignes: [
        { compteId: 'c231', debit: 41_500_000, credit: 0 },
        { compteId: 'c239', debit: 0, credit: 41_500_000 },
      ],
    });
    expect(update.mock.calls[0][0].where).toEqual({ id: 'i1', tenantId: 't1', dateMiseEnService: null });
    expect(update.mock.calls[0][0].data.ecritureMiseEnServiceId).toBe('eMes');
  });

  it('un bien porté d’emblée à son compte définitif ne passe toujours rien', async () => {
    const { svc, creer, update } = harnaisMiseEnService({ ...EN_COURS, compteEnCoursId: null });
    await svc.mettreEnService('t1', 'u1', 'i1', { date: '2026-09-30' });
    expect(creer).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toEqual({ dateMiseEnService: D('2026-09-30') });
  });

  it('sans journal, hors de l’exercice, ou exercice clôturé · refusé avant toute écriture', async () => {
    for (const [immo, corps, o] of [
      [EN_COURS, { date: '2026-09-30' }, {}],
      [EN_COURS, { ...CORPS, date: '2027-01-05' }, {}],
      [EN_COURS, CORPS, { statutExercice: StatutExercice.CLOTURE }],
    ] as const) {
      const m = harnaisMiseEnService(immo, o);
      await expect(m.svc.mettreEnService('t1', 'u1', 'i1', corps)).rejects.toThrow();
      expect(m.creer).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    }
  });

  it('refusée avant la fin d’une période de coûts d’emprunt déjà incorporée, admise à cette fin (ch. 7 § 2.2.3)', async () => {
    const avant = harnaisMiseEnService(EN_COURS, { finIncorporation: D('2026-10-31') });
    await expect(avant.svc.mettreEnService('t1', 'u1', 'i1', CORPS)).rejects.toThrow(/2026-10-31/);
    expect(avant.creer).not.toHaveBeenCalled();
    expect(avant.update).not.toHaveBeenCalled();
    // Même règle pour un bien porté d'emblée à son compte définitif.
    const definitif = harnaisMiseEnService({ ...EN_COURS, compteEnCoursId: null }, { finIncorporation: D('2026-10-31') });
    await expect(definitif.svc.mettreEnService('t1', 'u1', 'i1', { date: '2026-09-30' })).rejects.toThrow(/§ 2\.2\.3/);
    const aLaFin = harnaisMiseEnService(EN_COURS, { finIncorporation: D('2026-09-30') });
    await aLaFin.svc.mettreEnService('t1', 'u1', 'i1', CORPS);
    expect(aLaFin.creer).toHaveBeenCalledTimes(1);
  });

  it('une course perdue retire l’écriture de CETTE requête et rend un 409', async () => {
    const m = harnaisMiseEnService(EN_COURS, { course: true });
    await expect(m.svc.mettreEnService('t1', 'u1', 'i1', CORPS)).rejects.toMatchObject({ status: 409 });
    expect(m.supprimees).toEqual(['eMes']);
  });
});

describe('les écritures du module visent le compte où le bien est inscrit', () => {
  it('coûts d’emprunt incorporés · débit du 239 tant que le bien n’est pas achevé', async () => {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const prisma: Record<string, unknown> = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          designation: 'Siège',
          statut: StatutImmobilisation.EN_SERVICE,
          compteImmobilisationId: 'c231',
          compteEnCoursId: 'c239',
          compteImmobilisation: { numero: '23110000' },
          dateMiseEnService: null,
          dotations: [],
          depreciations: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', statut: StatutExercice.OUVERT, dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
      ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _sum: { debit: 10_800_000, credit: 0 } }) },
      coutEmpruntIncorpore: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { montant: 0 } }),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'k1', ...data })),
      },
      compte: { findUnique: jest.fn().mockResolvedValue({ id: 'n72210000' }) },
    };
    prisma.$transaction = jest.fn((f: (tx: unknown) => unknown) => f(prisma));
    const svc = new ImmobilisationService(prisma as never, { creer } as never);
    await svc.incorporerCoutsEmprunt('t', 'u', 'b1', {
      exerciceId: 'e26',
      journalId: 'j',
      nature: 'SPECIFIQUE',
      debutPreparation: '2026-04-01',
      finPreparation: '2027-11-15',
      dateDebut: '2026-04-01',
      dateFin: '2026-12-31',
      base: 120_000_000,
      tauxPourcent: 12,
      produitsPlacement: 800_000,
    });
    expect((creer.mock.calls[0][2] as { lignes: Ligne[] }).lignes[0]).toEqual({ compteId: 'c239', debit: 10_000_000, credit: 0 });
  });

  it('sortie d’un bien abandonné avant son achèvement · crédit du 239, jamais du 231', async () => {
    const creer = jest.fn().mockImplementation((_t: string, _u: string, dto: { lignes: Ligne[] }) => Promise.resolve({ id: `e${dto.lignes.length}`, ...dto }));
    const immo = {
      id: 'i1',
      designation: 'Siège',
      statut: 'EN_SERVICE',
      valeurOrigine: 5_000_000,
      valeurResiduelle: 0,
      dureeAmortissementAns: 20,
      dateMiseEnService: null,
      dateAcquisition: D('2026-03-15'),
      amortissementAnterieur: 0,
      amortissementsDetaches: 0,
      reprisesAmortissement: 0,
      modeAmortissement: 'LINEAIRE',
      compteImmobilisationId: 'c231',
      compteEnCoursId: 'c239',
      compteImmobilisation: { id: 'c231', numero: '23110000', intitule: 'Bâtiments' },
      compteDotationId: 'cd',
      compteAmortissementId: 'ca',
      dotations: [],
      depreciations: [],
    };
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue(immo),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...immo }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
      compte: { findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) => Promise.resolve({ id: `n${where.tenantId_numero.numero}` })) },
    };
    const svc = new ImmobilisationService(prisma as never, { creer } as never);
    await svc.sortir('t1', 'u1', 'i1', { dateSortie: '2026-08-31', type: 'MISE_HORS_SERVICE', exerciceId: 'e26', journalId: 'j1' } as never);
    const lignes = (creer.mock.calls[0][2] as { lignes: Ligne[] }).lignes;
    expect(lignes[0]).toEqual({ compteId: 'c239', debit: 0, credit: 5_000_000 });
    expect(lignes.some((l) => l.compteId === 'c231')).toBe(false);
  });

  it('renouvellement d’un composant · refusé tant que le bien est inscrit en cours, ou à une date antérieure à sa mise en service', async () => {
    for (const [miseEnService, attendu] of [
      [null, /encore inscrit en cours/],
      [D('2026-09-30'), /2026-09-30/],
    ] as const) {
      const prisma = {
        immobilisation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'k1',
            statut: 'EN_SERVICE',
            immobilisationPrincipaleId: 'i1',
            compteImmobilisationId: 'c241',
            compteEnCoursId: 'c249',
            dateMiseEnService: miseEnService,
            dateAcquisition: D('2026-03-15'),
            dotations: [],
            depreciations: [],
          }),
        },
      };
      const svc = new ImmobilisationService(prisma as never, {} as never);
      const creer = jest.spyOn(svc, 'creer');
      await expect(
        svc.renouveler('t1', 'u1', 'k1', { exerciceId: 'e26', journalId: 'j1', dateRenouvellement: '2026-06-30', designation: 'x', coutRenouvellement: 10, compteContrepartieId: 'b' } as never),
      ).rejects.toThrow(attendu);
      expect(creer).not.toHaveBeenCalled();
    }
  });

  it('reclassement · refusé tant que le bien est inscrit en cours, avant toute écriture', async () => {
    const creer = jest.fn();
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          statut: 'EN_SERVICE',
          compteImmobilisationId: 'c231',
          compteEnCoursId: 'c239',
          dateMiseEnService: null,
          dateAcquisition: D('2026-03-15'),
          dotations: [],
          depreciations: [],
        }),
      },
    };
    const svc = new ImmobilisationService(prisma as never, { creer } as never);
    await expect(
      svc.reclasser('t1', 'u1', 'i1', { exerciceId: 'e26', journalId: 'j1', dateReclassement: '2026-06-30', motif: 'x', nouvelleFamilleId: 'f2' } as never),
    ).rejects.toThrow(/inscrit en cours/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('reclassement · refusé à une date antérieure à la mise en service, quand le bien était encore au 2x9', async () => {
    const creer = jest.fn();
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          statut: 'EN_SERVICE',
          compteImmobilisationId: 'c231',
          compteEnCoursId: 'c239',
          dateMiseEnService: D('2026-09-30'),
          dateAcquisition: D('2026-03-15'),
          dotations: [],
          depreciations: [],
        }),
      },
    };
    const svc = new ImmobilisationService(prisma as never, { creer } as never);
    await expect(
      svc.reclasser('t1', 'u1', 'i1', { exerciceId: 'e26', journalId: 'j1', dateReclassement: '2026-06-30', motif: 'x', nouvelleFamilleId: 'f2' } as never),
    ).rejects.toThrow(/2026-09-30/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('tableau des immobilisations · le bien non achevé est rangé sous son en-cours', () => {
  it('groupe au 239 avant la mise en service, au 231 après', async () => {
    const bien = (dateMiseEnService: Date | null) => ({
      id: 'a',
      designation: 'Siège',
      numeroInventaire: null,
      compteImmobilisationId: 'c231',
      compteEnCoursId: 'c239',
      compteImmobilisation: { id: 'c231', numero: '23110000', intitule: 'Bâtiments' },
      compteEnCours: { id: 'c239', numero: '23910000', intitule: 'Bâtiments en cours' },
      dateAcquisition: D('2026-03-15'),
      dateMiseEnService,
      valeurOrigine: 40_000_000,
      dureeAmortissementAns: 20,
      amortissementAnterieur: 0,
      statut: 'EN_SERVICE',
      dateSortie: null,
      dotations: [],
      depreciations: [],
    });
    const monter = (b: unknown) =>
      new ImmobilisationService({ immobilisation: { findMany: jest.fn().mockResolvedValue([b]) } } as never, {} as never);
    const avant = await monter(bien(null)).tableauImmobilisations('t1', { dateArret: '2026-06-30' });
    expect(avant.groupes.map((g) => g.numero)).toEqual(['23910000']);
    const apres = await monter(bien(D('2026-06-01'))).tableauImmobilisations('t1', { dateArret: '2026-06-30' });
    expect(apres.groupes.map((g) => g.numero)).toEqual(['23110000']);
  });
});

describe('tableau des amortissements · le bien non achevé est rangé sous son en-cours', () => {
  it('au 239 tant qu’il n’est pas achevé à la clôture, sans dotation ; au 231 une fois mis en service', async () => {
    // Le bien en cours figure au tableau pour sa valeur brute et nette · rangé
    // sous son 231, il gonflait le sous-total d'un compte que la balance
    // laisse vide.
    const bien = (dateMiseEnService: Date | null) => ({
      id: 'a',
      designation: 'Siège',
      numeroInventaire: null,
      compteImmobilisationId: 'c231',
      compteEnCoursId: 'c239',
      compteImmobilisation: { id: 'c231', numero: '23110000', intitule: 'Bâtiments' },
      compteEnCours: { id: 'c239', numero: '23910000', intitule: 'Bâtiments en cours' },
      dateAcquisition: D('2026-03-15'),
      dateMiseEnService,
      valeurOrigine: 40_000_000,
      valeurResiduelle: 0,
      dureeAmortissementAns: 20,
      dureeNonLimitee: false,
      modeAmortissement: 'LINEAIRE',
      amortissementAnterieur: 0,
      amortissementsDetaches: 0,
      reprisesAmortissement: 0,
      statut: 'EN_SERVICE',
      dateSortie: null,
      dotations: [],
      depreciations: [],
      consommationsUniteOeuvre: [],
    });
    const monter = (b: unknown) =>
      new ImmobilisationService(
        {
          tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
          exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
          immobilisation: { findMany: jest.fn().mockResolvedValue([b]) },
        } as never,
        {} as never,
      );
    const avant = await monter(bien(null)).tableauAmortissements('t1', 'e26');
    expect(avant.groupes.map((g) => [g.numero, g.dotation])).toEqual([['23910000', 0]]);
    const apres = await monter(bien(D('2026-07-01'))).tableauAmortissements('t1', 'e26');
    expect(apres.groupes.map((g) => g.numero)).toEqual(['23110000']);
  });
});
