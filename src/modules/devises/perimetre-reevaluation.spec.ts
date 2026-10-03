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
type LigneEnDevise = { debit: number; credit: number; montantDevise: number };

function service(
  referentiel: Referentiel,
  numero: string,
  lignes: LigneEnDevise[] = [{ debit: 2_800_000, credit: 0, montantDevise: 1000 }],
) {
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
      findMany: jest.fn().mockResolvedValue(
        lignes.map((l) => ({
          compteId: 'c1',
          deviseId: 'd1',
          ...l,
          compte: { id: 'c1', numero, intitule: 'Compte' },
          devise: { id: 'd1', code: 'USD' },
        })),
      ),
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

/**
 * UNE POSITION DÉNOUÉE NE SE RÉÉVALUE PAS (ligne A6). Le jeu du séminaire
 * CPCC · dette fournisseur de 1 160 USD à 1 680 (1 948 800), réglée en entier
 * à 1 800 (2 088 000) par une pièce SANS ligne d'écart · solde en devise nul,
 * 139 200 restent au débit du 401, perte RÉALISÉE (art. 55). Réévaluée, elle
 * passait au 478 contre le 401 pour 139 200 et se provisionnait (A5), puis
 * l'extourne de l'ouverture la rouvrait. Ce qui casserait en silence · la
 * position remise dans les positions, l'écriture restant équilibrée.
 */
describe('réévaluation · une position dénouée dans sa devise', () => {
  const regleeSansEcart: LigneEnDevise[] = [
    { debit: 0, credit: 1_948_800, montantDevise: 1160 },
    { debit: 2_088_000, credit: 0, montantDevise: 1160 },
  ];

  it('soldée en devise, reste en francs · hors réévaluation, motif « réalisé » nommé, aux deux référentiels', async () => {
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      const r = await service(ref, '40110000', regleeSansEcart).calculer('t1', { exerciceId: 'ex1' });
      expect(r.positions).toHaveLength(0);
      expect(r.perteLatente).toBe(0);
      expect(r.gainLatent).toBe(0);
      expect(r.provision).toBe(0);
      expect(r.positionsNonReevaluees).toEqual([
        expect.objectContaining({ numero: '40110000', montantDevise: 0, motif: expect.stringContaining('139200.00') }),
      ]);
      expect(r.positionsNonReevaluees[0].motif).toMatch(/RÉALISÉ.*art\. 55/);
    }
  });

  it('réglée au coût historique (A6) · rien ne reste, rien n’est dit', async () => {
    const r = await service(Referentiel.SYSCOHADA, '40110000', [
      { debit: 0, credit: 1_948_800, montantDevise: 1160 },
      { debit: 1_948_800, credit: 0, montantDevise: 1160 },
    ]).calculer('t1', { exerciceId: 'ex1' });
    expect(r.positions).toHaveLength(0);
    expect(r.positionsNonReevaluees).toEqual([]);
  });

  it('réglée en partie au coût historique (A6) · le reste se réévalue sur sa seule valeur d’origine', async () => {
    // 600 USD réglés au coût historique de 1 008 000 · 560 USD restent à
    // 940 800 (560 × 1 680), réévalués au cours de clôture de 2 500.
    const r = await service(Referentiel.SYSCOHADA, '40110000', [
      { debit: 0, credit: 1_948_800, montantDevise: 1160 },
      { debit: 1_008_000, credit: 0, montantDevise: 600 },
    ]).calculer('t1', { exerciceId: 'ex1' });
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].montantDevise).toBe(-560);
    expect(r.positions[0].valeurComptable).toBe(-940_800);
    expect(r.positions[0].ecart).toBe(-(560 * 2500 - 940_800));
  });

  it('une disponibilité soldée en devise garde sa conversion (art. 57), déjà réalisée', async () => {
    const r = await service(Referentiel.SYSCOHADA, '52110000', [
      { debit: 1_680_000, credit: 0, montantDevise: 1000 },
      { debit: 0, credit: 1_800_000, montantDevise: 1000 },
    ]).calculer('t1', { exerciceId: 'ex1' });
    expect(r.positionsNonReevaluees).toEqual([]);
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].estTresorerie).toBe(true);
  });
});
