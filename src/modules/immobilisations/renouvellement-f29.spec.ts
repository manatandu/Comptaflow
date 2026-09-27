import { ModeAmortissement, Referentiel, TypeComposant } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F29 · LE RENOUVELLEMENT D'UN COMPOSANT.
 *
 * `renouveler` sortait l'ancien composant, PUIS créait le remplaçant. Pour une
 * pièce de sécurité, la création était refusée à coup sûr (la date du
 * remplaçant ne pouvait pas être celle de l'acquisition du principal) · l'ancien
 * était sorti, aucun remplaçant n'existait, et « déjà sortie » fermait toute
 * reprise.
 *
 * Deux corrections. Le remplaçant se crée d'abord, et se retire si la sortie
 * échoue. Et la pièce de sécurité qui en remplace une autre s'amortit dès SA
 * propre acquisition · le texte (« dès l'acquisition de l'immobilisation
 * principale ») ne vise que le stock constitué avec le bien, et une pièce ne
 * s'amortit pas avant d'exister.
 */

type Faux = Record<string, unknown>;

const PRINCIPAL = {
  id: 'machine',
  dateAcquisition: new Date('2020-01-10'),
  dureeAmortissementAns: 10,
  compteImmobilisation: { numero: '24110000', intitule: 'Matériel industriel' },
};

const PIECE = {
  familleId: 'f1',
  designation: 'Pièce de sécurité · moteur de secours',
  dateAcquisition: '2026-04-01',
  dateMiseEnService: '2026-04-01',
  valeurOrigine: 5_000_000,
  dureeAmortissementAns: 5,
  compteContrepartieId: 'ctreso',
  exerciceId: 'exN',
  journalId: 'j1',
  immobilisationPrincipaleId: 'machine',
  typeComposant: TypeComposant.PIECE_DE_SECURITE,
  justificationDecomposition: 'Moteur de secours tenu en réserve · durée distincte de la machine',
};

function harnais(options: { createEchoue?: boolean } = {}) {
  const ecrituresSupprimees: string[] = [];
  const ecrituresPostees: string[] = [];
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'f1',
        compteImmobilisationId: 'cimmo',
        compteAmortissementId: 'camort',
        compteDotationId: 'cdot',
        dureeAmortissementAns: 10,
      }),
    },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'ctreso', numero: '52110000' }) },
    // L'exercice où la fiche naît · la doublure honore l'identifiant ET le
    // dossier, un bien ne se crée jamais sur l'exercice d'un voisin (F32).
    exercice: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(
          where.id === 'exN' && where.tenantId === 't1' ? { dateDebut: new Date('2026-01-01') } : null,
        ),
      ),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: 'NORMAL',
        jeuEtatsFinanciersSycebnl: null,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'machine') return Promise.resolve(PRINCIPAL);
        if (where.id === 'nouveau') return Promise.resolve({ ecritureAcquisitionId: 'eAcq' });
        return Promise.resolve({
          id: 'ancien',
          designation: 'Ancien moteur de secours',
          statut: 'EN_SERVICE',
          familleId: 'f1',
          immobilisationPrincipaleId: 'machine',
          typeComposant: TypeComposant.PIECE_DE_SECURITE,
          justificationDecomposition: 'Moteur de secours',
        });
      }),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) =>
        options.createEchoue
          ? Promise.reject(new Error('contrainte'))
          : Promise.resolve({ ...data, id: 'nouveau', valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] }),
      ),
      deleteMany,
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    ecriture: {
      delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        ecrituresSupprimees.push(where.id);
        return Promise.resolve({});
      }),
    },
  } as Faux;
  const ecritures = {
    creer: jest.fn().mockImplementation(() => {
      ecrituresPostees.push('eAcq');
      return Promise.resolve({ id: 'eAcq' });
    }),
  } as unknown as EcritureService;
  return {
    svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures),
    deleteMany,
    ecrituresSupprimees,
    ecrituresPostees,
  };
}

const RENOUVELLEMENT = {
  dateRenouvellement: '2026-04-01',
  designation: 'Nouveau moteur de secours',
  coutRenouvellement: 5_000_000,
  dureeAmortissementAns: 5,
  compteContrepartieId: 'ctreso',
  exerciceId: 'exN',
  journalId: 'j1',
};

describe('F29 · la pièce de sécurité qui en remplace une autre', () => {
  it('s’amortit dès SA propre acquisition · le renouvellement n’est plus refusé', async () => {
    const { svc } = harnais();
    await expect(
      (svc as unknown as { creer: (...a: unknown[]) => Promise<unknown> }).creer('t1', 'u1', PIECE, {
        composantRemplaceId: 'ancien',
      }),
    ).resolves.toBeDefined();
  });

  it('refuse un remplaçant qui ne démarrerait qu’à son intégration · c’est une pièce de rechange', async () => {
    const { svc } = harnais();
    await expect(
      (svc as unknown as { creer: (...a: unknown[]) => Promise<unknown> }).creer(
        't1',
        'u1',
        { ...PIECE, dateMiseEnService: '2026-09-01' },
        { composantRemplaceId: 'ancien' },
      ),
    ).rejects.toThrow(/dès son acquisition/);
  });

  it('hors renouvellement, la pièce de sécurité démarre toujours à l’acquisition du principal', async () => {
    const { svc } = harnais();
    await expect(svc.creer('t1', 'u1', PIECE as never)).rejects.toThrow(/acquisition de l'immobilisation principale/);
  });
});

describe('F29 · le remplaçant d’abord, la sortie ensuite', () => {
  it('crée le remplaçant AVANT de sortir l’ancien', async () => {
    const { svc } = harnais();
    const creer = jest.spyOn(svc, 'creer');
    const sortir = jest.spyOn(svc, 'sortir').mockResolvedValue({} as never);
    await svc.renouveler('t1', 'u1', 'ancien', RENOUVELLEMENT as never);
    expect(creer.mock.invocationCallOrder[0]).toBeLessThan(sortir.mock.invocationCallOrder[0]);
  });

  it('une sortie refusée retire le remplaçant et son écriture d’acquisition', async () => {
    const { svc, deleteMany, ecrituresSupprimees } = harnais();
    jest.spyOn(svc, 'sortir').mockRejectedValue(new Error('compte 81200000 introuvable'));
    await expect(svc.renouveler('t1', 'u1', 'ancien', RENOUVELLEMENT as never)).rejects.toThrow(/81200000/);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'nouveau', tenantId: 't1' } });
    expect(ecrituresSupprimees).toEqual(['eAcq']);
  });

  it('un composant déjà sorti ne se renouvelle pas · rien n’est créé', async () => {
    const { svc } = harnais();
    const trouver = (svc as unknown as { prisma: { immobilisation: { findFirst: jest.Mock } } }).prisma.immobilisation
      .findFirst;
    trouver.mockResolvedValueOnce({ id: 'ancien', statut: 'CEDEE', immobilisationPrincipaleId: 'machine' });
    const creer = jest.spyOn(svc, 'creer');
    await expect(svc.renouveler('t1', 'u1', 'ancien', RENOUVELLEMENT as never)).rejects.toThrow(/déjà sorti/);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('F29 · la création d’un bien ne laisse jamais une écriture sans fiche', () => {
  it('un refus de mode tombe AVANT l’écriture d’acquisition', async () => {
    const { svc, ecrituresPostees } = harnais();
    const { immobilisationPrincipaleId: _p, typeComposant: _t, justificationDecomposition: _j, ...structure } = PIECE;
    await expect(
      svc.creer('t1', 'u1', { ...structure, modeAmortissement: ModeAmortissement.UNITES_DOEUVRE } as never),
    ).rejects.toThrow(/TOTAL D'UNITÉS PRÉVUES/);
    expect(ecrituresPostees).toEqual([]);
  });

  it('une fiche refusée par la base retire l’écriture d’acquisition déjà posée', async () => {
    const { svc, ecrituresSupprimees } = harnais({ createEchoue: true });
    const { immobilisationPrincipaleId: _p, typeComposant: _t, justificationDecomposition: _j, ...structure } = PIECE;
    await expect(svc.creer('t1', 'u1', structure as never)).rejects.toThrow(/contrainte/);
    expect(ecrituresSupprimees).toEqual(['eAcq']);
  });
});
