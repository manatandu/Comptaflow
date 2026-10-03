import { OrigineLettrage } from '@prisma/client';
import { LettrageService } from './lettrage.service';
import { PrismaService } from '../../common/prisma.service';
import { MOTIF_LETTRAGE_RECLASSEMENT, lignesDuCompteClientReclasse } from './ligne-de-reclassement';

/**
 * LIGNE A7 TER, B3 · le lettrage par montant appariait la facture de
 * 1 160 000 et le crédit du compte client par son reclassement au 416, de même
 * montant · groupe soldé `AUTOMATIQUE_MONTANT`, et la TVA d'une prestation
 * devenait exigible au reclassement (décret n° 011/42, art. 57 ; O.-L.
 * n° 10/001, art. 25, 2°). La doublure HONORE le filtre de liaison
 * (`ecriture.creanceDouteuseReclassement.is`), sans quoi le test dirait vrai
 * d'une requête qui ne filtre rien.
 */
interface Ligne {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  lettre: string | null;
  lettrageId: string | null;
  deviseId: null;
  montantDevise: null;
  libelle: null;
  ecriture: {
    tenantId: string;
    date: Date;
    reference: string | null;
    journalId: string;
    journal: { code: string };
    exercice: { statut: 'OUVERT' };
    creanceDouteuseReclassement: { compteCreanceId: string; annuleeLe: Date | null } | null;
  };
}

const ligne = (id: string, compteId: string, debit: number, credit: number, reclassement: Ligne['ecriture']['creanceDouteuseReclassement'] = null): Ligne => ({
  id,
  compteId,
  debit,
  credit,
  lettre: null,
  lettrageId: null,
  deviseId: null,
  montantDevise: null,
  libelle: null,
  ecriture: {
    tenantId: 't1',
    date: new Date('2026-11-15'),
    reference: null,
    journalId: 'jOD',
    journal: { code: 'OD' },
    exercice: { statut: 'OUVERT' },
    creanceDouteuseReclassement: reclassement,
  },
});

function monter(lignes: Ligne[]) {
  const groupes: Array<Record<string, unknown> & { id: string }> = [];
  let seq = 0;
  const filtrer = (where: any) =>
    lignes.filter((l) => {
      if (where?.id?.in && !where.id.in.includes(l.id)) return false;
      if (where?.compteId && l.compteId !== where.compteId) return false;
      if (where?.lettrageId === null && l.lettrageId !== null) return false;
      if (typeof where?.lettrageId === 'string' && l.lettrageId !== where.lettrageId) return false;
      if (where?.lettre === null && l.lettre !== null) return false;
      if (where?.lettre?.not === null && l.lettre === null) return false;
      if (where?.ecriture?.tenantId && l.ecriture.tenantId !== where.ecriture.tenantId) return false;
      const lien = where?.ecriture?.creanceDouteuseReclassement?.is;
      if (lien) {
        const r = l.ecriture.creanceDouteuseReclassement;
        if (!r) return false;
        if (lien.annuleeLe === null && r.annuleeLe !== null) return false;
        if (lien.compteCreanceId && r.compteCreanceId !== lien.compteCreanceId) return false;
      }
      return true;
    });
  const prisma: any = {
    $transaction: (fn: (tx: unknown) => unknown) => fn(prisma),
    cloture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: '411', tenantId: 't1', numero: '41110001', intitule: 'Client Kasa', lettrable: true }) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(filtrer(where))),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const cibles = filtrer(where);
        for (const l of cibles) Object.assign(l, data);
        return Promise.resolve({ count: cibles.length });
      }),
    },
    lettrage: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(groupes.find((g) => g.id === where.id) ?? null)),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const g = { id: `g${++seq}`, ...data };
        groupes.push(g);
        return Promise.resolve(g);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve(Object.assign(groupes.find((g) => g.id === where.id)!, data))),
    },
  };
  return { service: new LettrageService(prisma as PrismaService), prisma, groupes, lignes };
}

// La facture (D 411), le reclassement (C 411 de la créance en vigueur), et un
// autre règlement de même montant, ordinaire.
const facture = () => ligne('fac', '411', 1_160_000, 0);
const reclassement = (annuleeLe: Date | null = null) => ligne('rcl', '411', 0, 1_160_000, { compteCreanceId: '411', annuleeLe });

describe('A7 ter, B3 · la ligne du compte client d’un reclassement hors du lettrage', () => {
  it('le lettrage automatique n’apparie plus la facture et le reclassement de même montant', async () => {
    const { service, groupes } = monter([facture(), reclassement()]);
    const r = await service.lettrageAutomatique('t1', '411', 'u1');
    expect(r.groupes).toBe(0);
    expect(groupes).toHaveLength(0);
  });

  it('le pré-lettrage ne le propose pas', async () => {
    const { service } = monter([facture(), reclassement()]);
    const p = await service.preLettrage('t1', '411');
    expect(p.propositions).toHaveLength(0);
  });

  it('un règlement ordinaire de même montant reste apparié à la facture', async () => {
    const { service, groupes } = monter([facture(), reclassement(), ligne('reg', '411', 0, 1_160_000)]);
    await service.lettrageAutomatique('t1', '411', 'u1');
    expect(groupes).toHaveLength(1);
    expect(groupes[0].origine).toBe(OrigineLettrage.AUTOMATIQUE_MONTANT);
  });

  it('le lettrage MANUEL, le complément et la confirmation d’un pré-lettrage sont refusés par le motif nommé', async () => {
    const { service, groupes } = monter([facture(), reclassement(), ligne('acp', '411', 0, 100_000)]);
    await expect(service.lettrerManuel('t1', '411', ['fac', 'rcl'], 'u1')).rejects.toThrow(MOTIF_LETTRAGE_RECLASSEMENT);
    await service.lettrerManuel('t1', '411', ['fac', 'acp'], 'u1', { autoriserPartiel: true });
    await expect(service.completer('t1', groupes[0].id, ['rcl'])).rejects.toThrow(/Ne lettrez pas la facture avec le reclassement/);
    const { service: s2 } = monter([facture(), reclassement()]);
    await expect(
      s2.confirmerPreLettrage('t1', '411', 'u1', [{ ligneIds: ['fac', 'rcl'], origine: OrigineLettrage.AUTOMATIQUE_MONTANT }]),
    ).rejects.toThrow(/ligne A7 bis/);
  });

  it('un reclassement ANNULÉ ne retient plus rien · sa ligne se lettre comme une autre', async () => {
    const { service, groupes } = monter([facture(), reclassement(new Date('2026-12-01'))]);
    await service.lettrerManuel('t1', '411', ['fac', 'rcl'], 'u1');
    expect(groupes).toHaveLength(1);
  });

  it('seule la ligne du compte d’ORIGINE est retenue · la ligne 416 du même reclassement reste lettrable', async () => {
    const { prisma } = monter([ligne('d416', '416', 1_160_000, 0, { compteCreanceId: '411', annuleeLe: null }), reclassement()]);
    const tenues = await lignesDuCompteClientReclasse(prisma, 't1', ['d416', 'rcl']);
    expect([...tenues]).toEqual(['rcl']);
    // La requête porte le dossier et la liaison, jamais un libellé.
    expect(prisma.ligneEcriture.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['d416', 'rcl'] },
      ecriture: { tenantId: 't1', creanceDouteuseReclassement: { is: { annuleeLe: null } } },
    });
  });
});
