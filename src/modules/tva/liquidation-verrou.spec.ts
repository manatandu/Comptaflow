import { BadRequestException } from '@nestjs/common';
import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LIQUIDER DEUX FOIS LA MÊME PÉRIODE DOUBLE LA DETTE, EN SILENCE.
 *
 * Le bouton « Comptabiliser » posait une écriture de solde des comptes 443 et
 * 445 sans laisser aucune trace de la période traitée. Le presser deux fois
 * posait DEUX écritures : la première solde les comptes de taxe, la seconde
 * les rend débiteurs ou créditeurs du même montant en sens inverse, et le
 * compte 444 porte le double de la dette réelle. Rien ne le signalait · ni à
 * l'écran, ni au contrôle, ni dans la déclaration suivante. Le code lui-même
 * l'annonçait : « Aucun verrou anti-double-liquidation pour l'instant ».
 *
 * CE QUI EST INTERDIT EST LE CHEVAUCHEMENT, pas la répétition à l'identique.
 * Liquider janvier puis liquider le premier trimestre est le même double
 * comptage, et un verrou qui ne comparerait que l'égalité des bornes le
 * laisserait passer. Ces tests couvrent les quatre formes de recouvrement.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

function ligneTva(date: string, tva: number) {
  return {
    id: `l-${date}`,
    compteId: 'c443',
    compte: { numero: '44310000' },
    debit: 0,
    credit: tva,
    ecriture: { date: new Date(date), lignes: [] },
  };
}

function harnais(options: { liquidationExistante?: { dateDebut: string; dateFin: string } } = {}) {
  const existante = options.liquidationExistante
    ? {
        id: 'liq1',
        dateDebut: new Date(options.liquidationExistante.dateDebut),
        dateFin: new Date(options.liquidationExistante.dateFin),
        ecriture: { id: 'ecr1', libelle: 'Liquidation TVA · période existante', date: new Date() },
      }
    : null;

  // Le faux reproduit la SÉMANTIQUE du where Prisma, pas son résultat : c'est
  // le test de chevauchement lui-même qu'on veut exercer, pas un booléen que
  // le harnais aurait décidé à sa place.
  const findFirst = jest.fn().mockImplementation(({ where }) => {
    if (!existante) return Promise.resolve(null);
    const debutDemande = where.dateFin.gte as Date;
    const finDemande = where.dateDebut.lte as Date;
    const chevauche = existante.dateDebut <= finDemande && existante.dateFin >= debutDemande;
    return Promise.resolve(chevauche ? existante : null);
  });

  const create = jest.fn().mockResolvedValue({ id: 'liq2' });
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue([ligneTva('2026-01-15', 160_000)]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 160_000, debit: 0 } }),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ compteId: 'c443', _sum: { debit: 0, credit: 160_000 } }]),
    },
    compte: {
      findMany: jest.fn().mockResolvedValue([{ id: 'c443' }]),
      // Le compte d'arrivée de la liquidation (444) doit exister · son absence
      // est un autre test, celui de `liquidation-credit-tva`.
      findFirst: jest.fn(({ where }: { where: { numero: string } }) =>
        Promise.resolve({ id: `c-${where.numero}`, numero: where.numero }),
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
    liquidationTva: { findFirst, create, findMany: jest.fn().mockResolvedValue([]) },
    ecriture: { delete: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const ecritureService = {
    creer: jest.fn().mockResolvedValue({ id: 'ecr-new', numeroPiece: 12 }),
    supprimer: jest.fn().mockResolvedValue({}),
  } as unknown as EcritureService;

  return { service: new TauxTvaService(prisma, ecritureService), prisma, create, ecritureService };
}

const JANVIER = { dateDebut: '2026-01-01', dateFin: '2026-01-31' };

describe('verrou anti-double-liquidation de la TVA', () => {
  it('refuse de liquider deux fois exactement la même période', async () => {
    const { service } = harnais({ liquidationExistante: JANVIER });
    await expect(
      service.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex', ...JANVIER }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une période INCLUSE dans une période déjà liquidée', async () => {
    // Le trimestre est liquidé ; liquider janvier seul redoublerait sa part.
    const { service } = harnais({
      liquidationExistante: { dateDebut: '2026-01-01', dateFin: '2026-03-31' },
    });
    await expect(
      service.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex', ...JANVIER }),
    ).rejects.toThrow(/liquidation couvre déjà/i);
  });

  it('refuse une période INCLUANT une période déjà liquidée', async () => {
    // Janvier est liquidé ; liquider le trimestre entier le compterait deux fois.
    const { service } = harnais({ liquidationExistante: JANVIER });
    await expect(
      service.comptabiliserLiquidation('t1', 'u1', {
        exerciceId: 'ex',
        dateDebut: '2026-01-01',
        dateFin: '2026-03-31',
      }),
    ).rejects.toThrow(/liquidation couvre déjà/i);
  });

  it('refuse une période À CHEVAL sur une période déjà liquidée', async () => {
    const { service } = harnais({
      liquidationExistante: { dateDebut: '2026-01-01', dateFin: '2026-02-15' },
    });
    await expect(
      service.comptabiliserLiquidation('t1', 'u1', {
        exerciceId: 'ex',
        dateDebut: '2026-02-01',
        dateFin: '2026-02-28',
      }),
    ).rejects.toThrow(/liquidation couvre déjà/i);
  });

  it('laisse passer une période DISJOINTE, et pose la trace', async () => {
    const { service, create } = harnais({ liquidationExistante: JANVIER });
    const r = await service.comptabiliserLiquidation('t1', 'u1', {
      exerciceId: 'ex',
      dateDebut: '2026-02-01',
      dateFin: '2026-02-28',
    });
    expect(r.ecriture.id).toBe('ecr-new');
    // Sans la trace, le verrou se rouvrirait à la liquidation suivante.
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.ecritureId).toBe('ecr-new');
  });

  it('reprend l’écriture si la trace échoue · sinon le trou se rouvre en silence', async () => {
    // `EcritureService.creer` ne participe pas à une transaction : une écriture
    // de liquidation sans marqueur laisserait la période liquidable de nouveau.
    const { service, prisma, create } = harnais();
    create.mockRejectedValueOnce(new Error('contrainte'));
    await expect(
      service.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex', ...JANVIER }),
    ).rejects.toThrow('contrainte');
    expect((prisma.ecriture.delete as jest.Mock)).toHaveBeenCalledWith({ where: { id: 'ecr-new' } });
  });

  it('annonce l’état de liquidation DANS la déclaration', async () => {
    // Un verrou qui ne se manifeste qu'au clic fait travailler l'utilisateur
    // pour rien, puis le contredit.
    const { service } = harnais({ liquidationExistante: JANVIER });
    const d = await service.declaration('t1', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(d.liquidation.faite).toBe(true);
    if (d.liquidation.faite) expect(d.liquidation.memePeriode).toBe(true);

    const libre = harnais();
    const d2 = await libre.service.declaration('t1', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(d2.liquidation.faite).toBe(false);
  });

  it('distingue une liquidation qui RECOUVRE la période sans lui correspondre', async () => {
    const { service } = harnais({
      liquidationExistante: { dateDebut: '2026-01-01', dateFin: '2026-03-31' },
    });
    const d = await service.declaration('t1', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(d.liquidation.faite).toBe(true);
    if (d.liquidation.faite) expect(d.liquidation.memePeriode).toBe(false);
  });

  it('annule une liquidation en supprimant son écriture · le verrou a une marche arrière', async () => {
    // Sans elle, qui a liquidé « janvier » au lieu de « janvier à mars » ne
    // pourrait plus jamais liquider février ni mars.
    const { service, prisma, ecritureService } = harnais();
    (prisma.liquidationTva.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'liq1',
      ecritureId: 'ecr1',
    });
    const r = await service.annulerLiquidation('t1', 'liq1');
    expect(ecritureService.supprimer).toHaveBeenCalledWith('t1', 'ecr1');
    expect(r.supprime).toBe(true);
  });
});
