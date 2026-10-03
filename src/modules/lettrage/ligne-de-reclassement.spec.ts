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
    /** Mineur 6 · les comptes des lignes de l'écriture (une TVA facturée au 443). */
    lignes: Array<{ compte: { numero: string } }>;
  };
}

const ligne = (
  id: string,
  compteId: string,
  debit: number,
  credit: number,
  reclassement: Ligne['ecriture']['creanceDouteuseReclassement'] = null,
  comptesDeLaPiece: string[] = [],
): Ligne => ({
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
    lignes: comptesDeLaPiece.map((numero) => ({ compte: { numero } })),
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
      // Mineur 6 · la doublure honore « l'écriture porte une ligne du 443 ».
      const prefixe = where?.ecriture?.lignes?.some?.compte?.numero?.startsWith;
      if (prefixe && !l.ecriture.lignes.some((x) => x.compte.numero.startsWith(prefixe))) return false;
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
      delete: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(groupes.splice(groupes.findIndex((g) => g.id === where.id), 1)[0])),
    },
  };
  return { service: new LettrageService(prisma as PrismaService), prisma, groupes, lignes };
}

// La facture (D 411, avec sa TVA facturée au 44310000), le reclassement (C 411
// de la créance en vigueur), et un autre règlement de même montant, ordinaire.
const facture = () => ligne('fac', '411', 1_160_000, 0, null, ['41110001', '70610000', '44310000']);
// La facture d'une association exonérée, sans TVA facturée.
const factureSansTva = () => ligne('fac', '411', 1_160_000, 0, null, ['41110001', '70610000']);
const reclassement = (annuleeLe: Date | null = null) => ligne('rcl', '411', 0, 1_160_000, { compteCreanceId: '411', annuleeLe });

describe('A7 ter, B3 · la ligne du compte client d’un reclassement hors du lettrage, TOUJOURS (règle d’A7)', () => {
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

  // B-2 (second tour) · LA RÈGLE D'A7 RÉTABLIE · le mineur 6 laissait lettrer
  // une facture SANS TVA avec son reclassement · figé par une clôture de
  // période, ce groupe enfermait la créance (annulation du reclassement et
  // délettrage refusés, scénario c2 sur base réelle). Refusé, toujours.
  it('B-2 · sans TVA facturée aussi, la facture et son reclassement ne se lettrent pas, ni à la main ni en automatique', async () => {
    const auto = monter([factureSansTva(), reclassement()]);
    const r = await auto.service.lettrageAutomatique('t1', '411', 'u1');
    expect(r.groupes).toBe(0);
    expect(auto.groupes).toHaveLength(0);
    const manuel = monter([factureSansTva(), reclassement()]);
    await expect(manuel.service.lettrerManuel('t1', '411', ['fac', 'rcl'], 'u1')).rejects.toThrow(MOTIF_LETTRAGE_RECLASSEMENT);
    expect(manuel.groupes).toHaveLength(0);
  });

  it('B-2 · avec n’importe quelle autre pièce · un groupe partiel qui porte le reclassement ne se complète pas', async () => {
    const { service, groupes } = monter([facture(), reclassement(), ligne('avr', '411', 1_160_000, 0)]);
    await expect(service.lettrerManuel('t1', '411', ['avr', 'rcl'], 'u1')).rejects.toThrow(MOTIF_LETTRAGE_RECLASSEMENT);
    expect(groupes).toHaveLength(0);
  });

  // Scénario e4 · U (la facture reclassée, sans TVA), T (service taxé), R (le
  // reclassement de U), P (le règlement de T), tous de 1 160 000. Une passe
  // sans R · U et T, de même montant, face à P · la passe apparie le premier
  // débit, U avec P, exactement comme l'ancienne passe unique d'A7 · c'est
  // l'ambiguïté connue du lettrage par MONTANT (une présomption, que le
  // pré-lettrage rend au comptable), pas une paire que le reclassement crée.
  it('B-2 · e4 · une seule passe sans le reclassement · aucune paire nouvelle, R reste ouvert', async () => {
    const lignesE4 = [
      ligne('U', '411', 1_160_000, 0, null, ['41110001', '70110000']),
      ligne('T', '411', 1_160_000, 0, null, ['41110001', '70610000', '44320000']),
      ligne('R', '411', 0, 1_160_000, { compteCreanceId: '411', annuleeLe: null }),
      ligne('P', '411', 0, 1_160_000, null, ['52110000', '41110001']),
    ];
    const { service, groupes, lignes } = monter(lignesE4);
    const r = await service.lettrageAutomatique('t1', '411', 'u1');
    expect(r.groupes).toBe(1);
    expect(groupes).toHaveLength(1);
    // Le reclassement n'entre dans aucun groupe.
    expect(lignes.find((l) => l.id === 'R')!.lettrageId).toBeNull();
    // La paire est celle de l'ancienne passe unique · le premier débit de même montant que P.
    expect(lignes.filter((l) => l.lettrageId !== null).map((l) => l.id).sort()).toEqual(['P', 'U']);
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

describe('A7 ter, B2 (b) · le lettrage qu’un module pose sur ses propres lignes', () => {
  // Les lignes 416 d'une créance éteinte · reclassement 1 160 000, recouvrement 760 000, perte 400 000.
  const lignes416 = () => [ligne('r', '416', 1_160_000, 0), ligne('m1', '416', 0, 760_000), ligne('m2', '416', 0, 400_000)];

  it('pose un groupe SOLDÉ, d’origine MODULE (lui seul le défait), lettre servie sur chaque ligne', async () => {
    const { service, groupes, lignes } = monter(lignes416());
    const r = await service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1');
    expect(r).toEqual({ code: 'A' });
    expect(groupes[0]).toMatchObject({ statut: 'SOLDE', origine: OrigineLettrage.MODULE, compteId: '416' });
    expect(lignes.map((l) => l.lettre)).toEqual(['A', 'A', 'A']);
  });

  it('rend un MOTIF, jamais une exception, quand rien ne se pose · solde non nul, ligne déjà lettrée, compte non lettrable', async () => {
    const { service, groupes } = monter(lignes416());
    expect(await service.lettrerLignesDuModule('t1', '416', ['r', 'm1'], 'u1')).toEqual({ motif: expect.stringMatching(/ne soldent pas/) });
    const deja = monter(lignes416());
    deja.lignes[1].lettrageId = 'g-x';
    expect(await deja.service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1')).toEqual({ motif: expect.stringMatching(/déjà lettrée/) });
    const ferme = monter(lignes416());
    ferme.prisma.compte.findFirst.mockResolvedValue({ id: '416', tenantId: 't1', numero: '41610000', lettrable: false });
    expect(await ferme.service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1')).toEqual({ motif: expect.stringMatching(/pas déclaré lettrable/) });
    expect(groupes).toHaveLength(0);
  });

  it('défait le groupe dans la transaction de l’appelant · lignes libérées, groupe supprimé ; un groupe verrouillé refuse', async () => {
    const { service, groupes, lignes, prisma } = monter(lignes416());
    await service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1');
    await service.defaireLettrageDuModule(prisma, 't1', groupes[0].id);
    expect(groupes).toHaveLength(0);
    expect(lignes.every((l) => l.lettre === null && l.lettrageId === null)).toBe(true);
    const v = monter(lignes416());
    await v.service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1');
    v.groupes[0].verrouille = true;
    await expect(v.service.defaireLettrageDuModule(v.prisma, 't1', v.groupes[0].id)).rejects.toThrow(/verrouillé/);
    // Mineur 7 · un groupe d'une autre origine n'est jamais défait par le module.
    const manuel = monter(lignes416());
    await manuel.service.lettrerLignesDuModule('t1', '416', ['r', 'm1', 'm2'], 'u1');
    manuel.groupes[0].origine = OrigineLettrage.MANUEL;
    await expect(manuel.service.defaireLettrageDuModule(manuel.prisma, 't1', manuel.groupes[0].id)).rejects.toThrow(/n'a pas été posé par le module/);
    expect(manuel.groupes).toHaveLength(1);
  });
});
