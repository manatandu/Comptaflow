import { Referentiel } from '@prisma/client';
import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifHorsReevaluation, seReevalueALaCloture } from './perimetre-reevaluation';

/**
 * AUDCIF Titre VIII ch. 22 · une immobilisation reste au cours du jour de
 * l'acquisition (§ 1.1), une avance sur immobilisation n'a « aucun écart de
 * conversion » (§ 1.2), les titres gardent le cours du jour de l'opération
 * (§ 1.3) ; seules les créances et dettes (§ 2.2) et les disponibilités
 * (section 4) prennent le cours de clôture. Le moteur réévaluait toute ligne
 * en devise : un 24 en USD recevait un écart au 478 ou 479.
 */
function service(referentiel: Referentiel, numero: string) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel }) },
    exercice: {
      // Aucun exercice antérieur ouvert · l'ordre des réévaluations ne bloque rien (A5).
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        statut: 'OUVERT',
      }),
    },
    ligneEcriture: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }),
      findMany: jest.fn().mockResolvedValue([
        {
          compteId: 'c1',
          deviseId: 'd1',
          debit: 2_800_000,
          credit: 0,
          montantDevise: 1000,
          compte: { id: 'c1', numero, intitule: 'Compte' },
          devise: { id: 'd1', code: 'USD' },
        },
      ]),
    },
    reevaluation: { findMany: jest.fn().mockResolvedValue([]), },
    provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
    // Le verrou des gestes de provision (A5) · une ligne par dossier.
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
    // Un à-nouveau validé existe, sans ligne sur les comptes de provision (A5).
    ecriture: { count: jest.fn().mockResolvedValue(1) },
    coursDevise: { findFirst: jest.fn().mockResolvedValue({ cours: 2500 }) },
  };
  return new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
}

describe('réévaluation · le périmètre du ch. 22', () => {
  it.each([
    ['24410000', '§ 1.1'],
    ['21300000', '§ 1.1'],
    ['25100000', '§ 1.2'],
    ['26100000', '§ 1.3'],
  ])('un %s en USD ne reçoit aucun écart, et le motif le dit (%s)', async (numero, paragraphe) => {
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      const r = await service(ref, numero).calculer('t1', { exerciceId: 'ex1' });
      expect(r.positions).toHaveLength(0);
      expect(r.perteLatente).toBe(0);
      expect(r.provision).toBe(0);
      expect(r.positionsNonReevaluees).toEqual([
        expect.objectContaining({ numero, deviseCode: 'USD', montantDevise: 1000, motif: expect.stringContaining(paragraphe) }),
      ]);
    }
  });

  it('un prêt (27) reste réévalué aux deux référentiels · c’est une créance', async () => {
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      const r = await service(ref, '27100000').calculer('t1', { exerciceId: 'ex1' });
      expect(r.positions[0].ecart).toBe(-300_000);
      expect(r.positionsNonReevaluees).toEqual([]);
    }
  });

  it('un numéro, deux sens · le 16 est un emprunt au SYSCOHADA, un fonds affecté au SYCEBNL', async () => {
    const syscohada = await service(Referentiel.SYSCOHADA, '16100000').calculer('t1', { exerciceId: 'ex1' });
    expect(syscohada.positions).toHaveLength(1);
    const sycebnl = await service(Referentiel.SYCEBNL, '16100000').calculer('t1', { exerciceId: 'ex1' });
    expect(sycebnl.positions).toHaveLength(0);
    expect(sycebnl.positionsNonReevaluees[0].motif).toContain('fonds propres');
    // Le 18 est une dette aux deux.
    const emprunt = await service(Referentiel.SYCEBNL, '18100000').calculer('t1', { exerciceId: 'ex1' });
    expect(emprunt.positions).toHaveLength(1);
  });

  it('stocks et gestion restent hors réévaluation, créances et trésorerie dedans', () => {
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      expect(motifHorsReevaluation('31100000', ref)).toContain('§ 1.4');
      expect(seReevalueALaCloture('60100000', ref)).toBe(false);
      expect(seReevalueALaCloture('70100000', ref)).toBe(false);
      expect(seReevalueALaCloture('41100000', ref)).toBe(true);
      expect(seReevalueALaCloture('40100000', ref)).toBe(true);
      expect(seReevalueALaCloture('52100000', ref)).toBe(true);
    }
    expect(seReevalueALaCloture('17100000', Referentiel.SYSCOHADA)).toBe(true);
    expect(seReevalueALaCloture('17100000', Referentiel.SYCEBNL)).toBe(false);
  });
});
