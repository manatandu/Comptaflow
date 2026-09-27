import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { ouverteALaCloture } from '../lettrage/ouverte-a-la-cloture';

/**
 * AUDIT FINAL F51 ET F52 · la balance âgée.
 *
 * F51 · le report à-nouveau est daté du premier jour de l'exercice, et la
 * colonne « Antérieur à l'exercice » s'arrêtait la veille · une facture de
 * N-1 sans échéance tombait dans les tranches de l'exercice.
 *
 * F52 · l'écran laisse choisir une date, et le service ne bornait ni les
 * écritures ni le lettrage · l'état « au 30/06 » comptait une facture d'août
 * et taisait une facture de mars réglée en juillet.
 */

interface Ligne {
  debit: number;
  credit: number;
  dateEcheance: Date | null;
  compte: { id: string; numero: string; intitule: string };
  ecriture: { date: Date; estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean };
}

const ligne = (debit: number, date: string, echeance: string | null, report = false): Ligne => ({
  debit,
  credit: 0,
  dateEcheance: echeance ? new Date(echeance) : null,
  compte: { id: 'c411', numero: '41110000', intitule: 'Clients' },
  ecriture: { date: new Date(date), estGenereeParCloture: report, estSoldeDesComptesDeGestion: false },
});

function service(lignes: Ligne[]) {
  const findMany = jest.fn().mockResolvedValue(lignes);
  const prisma = {
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
    ligneEcriture: { findMany },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { s: new EcritureService(prisma, {} as never, {} as never, {} as never), findMany };
}

describe('F51 · une ligne de report sans échéance est antérieure à l’exercice', () => {
  it('va dans la colonne d’ouverture, pas dans les tranches de l’exercice', async () => {
    const { s } = service([ligne(1000, '2026-01-01', null, true)]);
    const r = await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-12-31' });
    expect(r.tranches[0].cle).toBe('ouverture');
    expect(r.debiteurs[0].montants[0]).toBe(1000);
  });

  it('avec une échéance, c’est l’échéance qui range, comme pour toute ligne', async () => {
    const { s } = service([ligne(1000, '2026-01-01', '2026-12-15', true)]);
    const r = await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-12-31' });
    expect(r.debiteurs[0].montants[r.tranches.findIndex((t) => t.cle === '2026-12')]).toBe(1000);
    expect(r.debiteurs[0].montants[0]).toBe(0);
  });

  it('une facture saisie le premier jour, qui n’est pas un report, reste dans l’exercice', async () => {
    const { s } = service([ligne(1000, '2026-01-01', null, false)]);
    const r = await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-12-31' });
    expect(r.debiteurs[0].montants[0]).toBe(0);
    expect(r.debiteurs[0].solde).toBe(1000);
  });

  it('l’écriture de solde des comptes de gestion n’est pas un report', async () => {
    const solde = ligne(1000, '2026-01-01', null, true);
    solde.ecriture.estSoldeDesComptesDeGestion = true;
    const { s } = service([solde]);
    const r = await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-12-31' });
    expect(r.debiteurs[0].montants[0]).toBe(0);
  });
});

describe('F52 · la balance âgée décrit la situation à la date de référence', () => {
  it('ne lit que les écritures datées au plus tard ce jour, ouvertes ce jour', async () => {
    const { s, findMany } = service([]);
    await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-06-30' });
    const where = findMany.mock.calls[0][0].where;
    const ref = new Date('2026-06-30');
    expect(where.ecriture).toEqual({ tenantId: 't', exerciceId: 'ex', date: { lte: ref } });
    expect(where.AND).toEqual([ouverteALaCloture(ref)]);
    // L'ancien filtre écartait toute ligne lettrée, même par un règlement postérieur.
    expect(where.lettre).toBeUndefined();
  });

  it('une date au-delà de l’exercice est ramenée à sa clôture', async () => {
    const { s, findMany } = service([]);
    await s.balanceAgee('t', { exerciceId: 'ex', dateReference: '2027-03-31' });
    expect(findMany.mock.calls[0][0].where.ecriture.date).toEqual({ lte: new Date('2026-12-31') });
  });
});
