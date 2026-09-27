import { TypeComposant } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F33 · LA DURÉE D'UNE RÉVISION MAJEURE EST CELLE QUI SERA AMORTIE.
 *
 * Le refus du ch. 5 § 1 (une révision majeure s'amortit sur l'intervalle entre
 * deux révisions, jamais sur la durée de la structure) ne jouait que sur une
 * durée ENVOYÉE. L'écran n'en envoyait aucune : le composant prenait la durée
 * de sa famille, souvent celle de la structure, et s'amortissait dessus sans
 * que rien ne le refuse. Le contrôle porte désormais sur la durée effective.
 */

type Faux = Record<string, unknown>;

function harnais(dureeFamille: number) {
  const creations: Faux[] = [];
  const ecritures: string[] = [];
  const prisma = {
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p1',
        dateAcquisition: new Date('2026-01-01T00:00:00.000Z'),
        dureeAmortissementAns: 6,
        compteImmobilisation: { numero: '24100000', intitule: 'Matériel industriel' },
      }),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        creations.push(data);
        return Promise.resolve({ ...data, id: 'c1', valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] });
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    exercice: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(where.id === 'ex1' && where.tenantId === 't1' ? { dateDebut: new Date('2026-01-01') } : null),
      ),
    },
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'f1',
        estActif: true,
        compteImmobilisationId: 'ci',
        compteAmortissementId: 'ca',
        compteDotationId: 'cd',
        dureeAmortissementAns: dureeFamille,
      }),
    },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c521', numero: '52110000' }) },
  } as Faux;
  const ecritureService = {
    creer: jest.fn().mockImplementation(() => {
      ecritures.push('eAcq');
      return Promise.resolve({ id: 'eAcq' });
    }),
  } as unknown as EcritureService;
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritureService), creations, ecritures };
}

const REVISION = {
  familleId: 'f1',
  designation: 'Révision majeure',
  dateAcquisition: '2026-01-01',
  dateMiseEnService: '2026-01-01',
  valeurOrigine: 10_000_000,
  compteContrepartieId: 'c521',
  exerciceId: 'ex1',
  journalId: 'j1',
  immobilisationPrincipaleId: 'p1',
  typeComposant: TypeComposant.REVISION_MAJEURE,
  justificationDecomposition: 'Contrat de révision biennale.',
};

describe('F33 · la durée d’une révision majeure est la durée effective', () => {
  it('sans durée saisie, celle de la famille est contrôlée · égale à la structure, refusée avant toute écriture', async () => {
    const { svc, creations, ecritures } = harnais(6);
    await expect(svc.creer('t1', 'u1', REVISION as never)).rejects.toThrow(/DEUX ans/);
    expect(ecritures).toEqual([]);
    expect(creations).toEqual([]);
  });

  it('sans durée saisie, une famille plus longue que la structure est refusée aussi', async () => {
    const { svc } = harnais(10);
    await expect(svc.creer('t1', 'u1', REVISION as never)).rejects.toThrow(/intervalle/);
  });

  it('une durée propre plus courte que la structure l’emporte sur la famille', async () => {
    const { svc, creations } = harnais(6);
    await svc.creer('t1', 'u1', { ...REVISION, dureeAmortissementAns: 2 } as never);
    expect(creations[0]).toMatchObject({ dureeAmortissementAns: 2 });
  });

  it('une famille plus courte que la structure suffit, sans durée saisie', async () => {
    const { svc, creations } = harnais(2);
    await svc.creer('t1', 'u1', REVISION as never);
    expect(creations[0]).toMatchObject({ dureeAmortissementAns: 2 });
  });

  it('un composant ordinaire n’est pas concerné par la règle de l’intervalle', async () => {
    const { svc, creations } = harnais(6);
    await svc.creer('t1', 'u1', { ...REVISION, typeComposant: TypeComposant.COMPOSANT } as never);
    expect(creations).toHaveLength(1);
  });
});
