import { Referentiel, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { ecartClasse9, motifRefusClasse9 } from './classe-9-equilibree';
import { EcritureService } from './ecriture.service';

/**
 * PASSE R1, C7 ET R5, A3 · les comptes 90 et 91 s'équilibrent entre eux, dans
 * les deux référentiels, chacun cité par SON texte.
 */
describe('classe 9 · l’équilibre des lignes 90 et 91 entre elles', () => {
  it('un bloc hors bilan équilibré passe, même à côté d’un bloc de bilan', () => {
    expect(
      ecartClasse9([
        { numero: '90220000', debit: 1_000 },
        { numero: '91220000', credit: 1_000 },
        { numero: '52110000', debit: 400 },
        { numero: '16200000', credit: 400 },
      ]),
    ).toBe(0);
  });

  it('D 904 / C 571 est refusé · la contrepartie d’un 90 n’est jamais un compte de bilan', () => {
    const ecart = ecartClasse9([
      { numero: '90400000', debit: 500 },
      { numero: '57100000', credit: 500 },
    ]);
    expect(ecart).toBe(500);
    expect(motifRefusClasse9(Referentiel.SYCEBNL, ecart)).toContain('ne doi[vent] pas impacter le bilan');
    expect(motifRefusClasse9(Referentiel.SYSCOHADA, ecart)).toContain('911 à 914');
  });

  it('les comptes 92 à 99 (analytique) ne sont pas visés', () => {
    expect(ecartClasse9([{ numero: '92100000', debit: 10 }, { numero: '60100000', credit: 10 }])).toBe(0);
  });
});

describe('classe 9 · le câblage dans les contrôles d’entrée', () => {
  function service() {
    const prisma = {
      exercice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ex',
          statut: StatutExercice.OUVERT,
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2026-12-31'),
        }),
      },
      compte: {
        // La doublure honore le dossier · un compte d'un autre dossier n'existe pas.
        findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] }; tenantId: string } }) =>
          Promise.resolve(
            where.tenantId === 't' ? where.id.in.map((id) => ({ id, numero: id, typeCompte: TypeCompteDetailTotal.DETAIL })) : [],
          ),
        ),
      },
      tenant: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 't' ? { referentiel: Referentiel.SYCEBNL } : null),
        ),
      },
    };
    const journal = { trouver: jest.fn().mockResolvedValue({ id: 'j', code: 'OD', estActif: true }) };
    const exercice = { cloturesApplicables: jest.fn().mockResolvedValue([]), verifierEcritureAutorisee: jest.fn() };
    const analytique = { verifierVentilationObligatoire: jest.fn(), verifierSectionsVentilees: jest.fn() };
    return new EcritureService(prisma as never, journal as never, exercice as never, analytique as never);
  }
  const piece = (lignes: Array<{ compteId: string; debit?: number; credit?: number }>) => ({
    exerciceId: 'ex',
    journalId: 'j',
    date: new Date('2026-06-30'),
    lignes,
    exigerVentilationObligatoire: false,
  });

  it('refuse à l’entrée la pièce qui solde un 90 contre la caisse', async () => {
    await expect(
      service().controlesDEntree('t', piece([{ compteId: '90400000', debit: 500 }, { compteId: '57100000', credit: 500 }])),
    ).rejects.toThrow(/comptes 90 et 91 ne s'équilibrent pas/);
  });

  it('laisse passer la pièce du Guide, 904 contre 914', async () => {
    await expect(
      service().controlesDEntree('t', piece([{ compteId: '90400000', debit: 500 }, { compteId: '91400000', credit: 500 }])),
    ).resolves.toBeDefined();
  });
});
