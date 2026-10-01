import { DevisesService } from './devises.service';

/**
 * LA CONTRE-PASSATION DES ÉCARTS DE CONVERSION · « à l'ouverture de l'exercice
 * SUIVANT ». L'écran servait tout exercice ouvert autre que le courant, et le
 * serveur l'acceptait · une extourne posée sur un exercice antérieur annulait
 * la réévaluation dans la période même où elle avait été constatée, écriture
 * équilibrée, balance bouclée.
 */
function monter(dateDebutSuivant: string) {
  const creer = jest.fn().mockResolvedValue({ id: 'ex' });
  const prisma = {
    reevaluation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'r1',
        dateReevaluation: new Date('2026-12-31'),
        ecritureExtourneId: null,
        ecritureEcarts: { lignes: [{ compteId: 'c1', debit: 100, credit: 0, libelle: null }, { compteId: 'c2', debit: 0, credit: 100, libelle: null }] },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e', statut: 'OUVERT', dateDebut: new Date(dateDebutSuivant) }),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od' }) },
  };
  return { svc: new DevisesService(prisma as never, { creer, retirerCompensation: jest.fn() } as never), creer };
}

describe('contre-passation de la réévaluation', () => {
  it('sur l’exercice qui suit · passée à son ouverture, sens inverse', async () => {
    const { svc, creer } = monter('2027-01-01');
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(creer.mock.calls[0][2]).toMatchObject({ date: '2027-01-01', lignes: [{ compteId: 'c1', credit: 100 }, { compteId: 'c2', debit: 100 }] });
  });

  it('sur un exercice antérieur ou celui de la réévaluation · refusée avant toute écriture', async () => {
    for (const debut of ['2025-01-01', '2026-01-01']) {
      const { svc, creer } = monter(debut);
      await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/exercice suivant/);
      expect(creer).not.toHaveBeenCalled();
    }
  });
});
