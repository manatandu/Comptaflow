import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { CreerImmobilisationDto, MiseEnServiceDto } from './dto/immobilisation.dto';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { planFiscalDegressif } from './amortissement-degressif';
import { DegressifService } from './degressif.service';

/**
 * UN BIEN ACQUIS ET PAS ENCORE MIS EN SERVICE.
 *
 * AUDCIF art. 45 · « la date de début d'amortissement est la date à laquelle
 * l'actif immobilisé est en état de fonctionner et au lieu d'utilisation
 * prévu par l'entité ». La date était obligatoire à la création, si bien
 * qu'un bien livré en pièces, ou en attente d'installation, recevait une date
 * inventée et commençait à s'amortir avant de servir. La date est désormais
 * nulle tant que le bien n'est pas en service, et AUCUNE dotation ne court
 * nulle part (dotation, tableau, plan fiscal) avant qu'elle soit posée, une
 * fois, par sa route.
 */

type Faux = Record<string, unknown>;

const EXERCICE = { id: 'ex2026', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

function harnaisCreation() {
  const creations: Faux[] = [];
  const prisma = {
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'f1',
        estActif: true,
        compteImmobilisationId: 'cimmo',
        compteAmortissementId: 'camort',
        compteDotationId: 'cdot',
        dureeAmortissementAns: 5,
      }),
    },
    exercice: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(where.id === EXERCICE.id && where.tenantId === 't1' ? EXERCICE : null),
      ),
    },
    compte: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(
          where.tenantId !== 't1'
            ? null
            : where.id === 'c521'
              ? { id: 'c521', numero: '52110000' }
              : where.id === 'cimmo'
                ? { id: 'cimmo', numero: '24420000' }
                : null,
        ),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    immobilisation: {
      create: jest.fn(({ data }: { data: Faux }) => {
        creations.push(data);
        return Promise.resolve({ ...data, id: 'i1', valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] });
      }),
    },
  };
  const ecritures = { creer: jest.fn().mockResolvedValue({ id: 'eAcq' }) } as unknown as EcritureService;
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures), creations };
}

const ACQUIS = {
  familleId: 'f1',
  designation: 'Groupe électrogène livré en pièces',
  dateAcquisition: '2026-03-15',
  valeurOrigine: 50_000_000,
  exerciceId: 'ex2026',
  compteContrepartieId: 'c521',
  journalId: 'j1',
};

describe('création · la date de mise en service peut manquer', () => {
  it('un bien acquis sans date naît « non mis en service » · la fiche porte null, jamais une date inventée', async () => {
    const { svc, creations } = harnaisCreation();
    await svc.creer('t1', 'u1', ACQUIS as never);
    expect(creations).toHaveLength(1);
    expect(creations[0].dateMiseEnService).toBeNull();
  });

  it('une date fournie est gardée', async () => {
    const { svc, creations } = harnaisCreation();
    await svc.creer('t1', 'u1', { ...ACQUIS, dateMiseEnService: '2026-04-01' } as never);
    expect((creations[0].dateMiseEnService as Date).toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('un bien repris déjà amorti a forcément été mis en service · sans date, refusé', async () => {
    const { svc, creations } = harnaisCreation();
    await expect(
      svc.creer('t1', 'u1', {
        ...ACQUIS,
        dateAcquisition: '2022-03-15',
        repris: true,
        amortissementAnterieur: 10_000_000,
        compteContrepartieId: undefined,
        journalId: undefined,
      } as never),
    ).rejects.toThrow(/mis en service/);
    expect(creations).toEqual([]);
  });

  it('la nature du barème fiscal est gardée quand elle existe, refusée sinon', async () => {
    const ok = harnaisCreation();
    await ok.svc.creer('t1', 'u1', { ...ACQUIS, natureFiscaleCle: 'I.1' } as never);
    expect(ok.creations[0].natureFiscaleCle).toBe('I.1');

    const ko = harnaisCreation();
    await expect(ko.svc.creer('t1', 'u1', { ...ACQUIS, natureFiscaleCle: 'XX.99' } as never)).rejects.toThrow(
      /absente du barème/,
    );
    expect(ko.creations).toEqual([]);
  });

  it('le DTO laisse la date absente, et refuse une date illisible', async () => {
    const base = {
      familleId: '3f1c9a52-1f3b-4c8e-9d1a-2b6f0e7c4a10',
      designation: 'Groupe',
      dateAcquisition: '2026-03-15',
      valeurOrigine: 1_000,
      exerciceId: '7b2e4d61-8c9a-4f3e-a1b2-c3d4e5f60718',
    };
    expect(await validate(plainToInstance(CreerImmobilisationDto, base))).toEqual([]);
    const illisible = await validate(plainToInstance(CreerImmobilisationDto, { ...base, dateMiseEnService: 'demain' }));
    expect(illisible.map((e) => e.property)).toContain('dateMiseEnService');
  });
});

function harnaisMiseEnService(immo: Faux | null, echecCourse = false) {
  const update = jest.fn(({ where, data }: { where: Faux; data: Faux }) => {
    if (echecCourse) {
      return Promise.reject(new Prisma.PrismaClientKnownRequestError('course', { code: 'P2025', clientVersion: 'x' }));
    }
    return Promise.resolve({ id: where.id, ...data });
  });
  const updateMany = jest.fn();
  const prisma = {
    immobilisation: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(immo && where.id === 'i1' && where.tenantId === 't1' ? immo : null),
      ),
      update,
      updateMany,
    },
  };
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, {} as EcritureService), update, updateMany };
}

const EN_ATTENTE = { id: 'i1', dateAcquisition: new Date('2026-03-15'), dateMiseEnService: null, statut: 'EN_SERVICE' };

describe('route de mise en service', () => {
  it('pose la date par une écriture UNITAIRE, conditionnée à une date encore nulle', async () => {
    const { svc, update, updateMany } = harnaisMiseEnService(EN_ATTENTE);
    await svc.mettreEnService('t1', 'i1', { date: '2026-05-02' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'i1', tenantId: 't1', dateMiseEnService: null });
    expect((arg.data.dateMiseEnService as Date).toISOString().slice(0, 10)).toBe('2026-05-02');
  });

  it('une seule fois · un bien déjà mis en service est refusé en 409, sans écriture', async () => {
    const { svc, update } = harnaisMiseEnService({ ...EN_ATTENTE, dateMiseEnService: new Date('2026-04-01') });
    await expect(svc.mettreEnService('t1', 'i1', { date: '2026-05-02' })).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it('jamais avant l’acquisition', async () => {
    const { svc, update } = harnaisMiseEnService(EN_ATTENTE);
    await expect(svc.mettreEnService('t1', 'i1', { date: '2026-03-14' })).rejects.toThrow(/précéder l'acquisition/);
    expect(update).not.toHaveBeenCalled();
  });

  it('le jour même de l’acquisition est admis', async () => {
    const { svc, update } = harnaisMiseEnService(EN_ATTENTE);
    await svc.mettreEnService('t1', 'i1', { date: '2026-03-15' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('un bien sorti n’a plus de plan à ouvrir', async () => {
    const { svc, update } = harnaisMiseEnService({ ...EN_ATTENTE, statut: 'CEDEE' });
    await expect(svc.mettreEnService('t1', 'i1', { date: '2026-05-02' })).rejects.toThrow(/sorti de l'actif/);
    expect(update).not.toHaveBeenCalled();
  });

  it('le bien d’un autre dossier n’existe pas', async () => {
    const { svc, update } = harnaisMiseEnService(EN_ATTENTE);
    await expect(svc.mettreEnService('t2', 'i1', { date: '2026-05-02' })).rejects.toMatchObject({ status: 404 });
    expect(update).not.toHaveBeenCalled();
  });

  it('une course perdue contre un autre poste rend un 409 nommé, jamais une erreur de base', async () => {
    const { svc } = harnaisMiseEnService(EN_ATTENTE, true);
    await expect(svc.mettreEnService('t1', 'i1', { date: '2026-05-02' })).rejects.toMatchObject({ status: 409 });
  });

  it('le DTO exige la date', async () => {
    const erreurs = await validate(plainToInstance(MiseEnServiceDto, {}));
    expect(erreurs.map((e) => e.property)).toEqual(['date']);
  });
});

function bienTableau(dateMiseEnService: Date | null) {
  return {
    id: 'a',
    designation: 'Groupe en attente',
    numeroInventaire: null,
    compteImmobilisation: { id: 'c', numero: '24420000', intitule: 'Matériel' },
    dateAcquisition: new Date('2026-03-15'),
    dateMiseEnService,
    valeurOrigine: 12_000,
    valeurResiduelle: 0,
    dureeAmortissementAns: 5,
    amortissementAnterieur: 0,
    modeAmortissement: 'LINEAIRE',
    statut: 'EN_SERVICE',
    dateSortie: null,
    dotations: [],
    depreciations: [],
  };
}

function serviceTableau(biens: unknown[]) {
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
      }),
    },
    immobilisation: { findMany: jest.fn().mockResolvedValue(biens) },
    exercice: {
      findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(where.id === EXERCICE.id && where.tenantId === 't1' ? EXERCICE : null),
      ),
    },
  };
  return new ImmobilisationService(prisma as unknown as PrismaService, {} as EcritureService);
}

describe('aucune dotation tant que le bien n’est pas mis en service', () => {
  it('tableau des amortissements · dotation nulle et douze mois vides', async () => {
    const t = await serviceTableau([bienTableau(null)]).tableauAmortissements('t1', EXERCICE.id);
    const l = t.groupes[0].lignes[0];
    expect(l.dotation).toBe(0);
    expect(l.parMois.every((m: number) => m === 0)).toBe(true);
  });

  it('le même bien mis en service en juin est doté · la seule différence est la date', async () => {
    const t = await serviceTableau([bienTableau(new Date('2026-06-01'))]).tableauAmortissements('t1', EXERCICE.id);
    expect(t.groupes[0].lignes[0].dotation).toBeGreaterThan(0);
  });

  it('passer la dotation est refusé, et le refus dit pourquoi', async () => {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({ ...bienTableau(null), famille: null }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          referentiel: Referentiel.SYSCOHADA,
          systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
        }),
      },
      dotationAmortissement: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const creer = jest.fn();
    const svc = new ImmobilisationService(prisma as unknown as PrismaService, { creer } as unknown as EcritureService);
    await expect(svc.passerDotation('t1', 'u1', 'a', { exerciceId: EXERCICE.id, journalId: 'j1' } as never)).rejects.toThrow(
      /pas encore mis en service/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('plan fiscal dégressif · aucun exercice sans date de mise en service', () => {
    const exercices = [EXERCICE];
    expect(planFiscalDegressif({ base: 10_000, dureeFiscaleAns: 5, dateMiseEnService: null, exercices })).toEqual([]);
    expect(
      planFiscalDegressif({ base: 10_000, dureeFiscaleAns: 5, dateMiseEnService: new Date('2026-01-01'), exercices }),
    ).toHaveLength(1);
  });

  it('dérogatoire · refusé et nommé sur un bien pas encore mis en service', async () => {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          ...bienTableau(null),
          degressifFiscal: true,
          dureeFiscaleAns: 5,
          compteImmobilisation: { numero: '24420000' },
          derogatoires: [],
        }),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' }) },
      exercice: { findMany: jest.fn().mockResolvedValue([EXERCICE]) },
    };
    const creer = jest.fn();
    const svc = new DegressifService(prisma as unknown as PrismaService, { creer } as unknown as EcritureService);
    await expect(svc.passer('t1', 'u1', 'a', { exerciceId: EXERCICE.id, journalId: 'j1' } as never)).rejects.toThrow(
      /pas encore mis en service/,
    );
    expect(creer).not.toHaveBeenCalled();
  });
});
