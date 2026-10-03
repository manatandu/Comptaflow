import { DevisesService } from './devises.service';
import { partagerLignesDEcarts } from './ecarts-disponibilites';

/**
 * LA CONTRE-PASSATION DES ÉCARTS DE CONVERSION · « à l'ouverture de l'exercice
 * SUIVANT ». L'écran servait tout exercice ouvert autre que le courant, et le
 * serveur l'acceptait · une extourne posée sur un exercice antérieur annulait
 * la réévaluation dans la période même où elle avait été constatée, écriture
 * équilibrée, balance bouclée.
 *
 * ET LES DISPONIBILITÉS N'EN SONT PAS (ligne A5 bis) · AUDCIF art. 57, leur
 * écart est inscrit « directement dans les produits et charges de
 * l'exercice » ; Application 86 du Guide, 676 / 5215 sans contre-passation.
 * Seuls le 478, le 479 et le compte de tiers qu'ils ajustent se
 * contre-passent (Application 84 · « 411 · 4781 » au 01/01/N+1 ; Application 85 ·
 * « 4793 · 4812 »).
 */

interface LigneFaite {
  compteId: string;
  numero: string;
  debit: number;
  credit: number;
}

const ligne = (l: LigneFaite) => ({ compteId: l.compteId, debit: l.debit, credit: l.credit, libelle: null, compte: { numero: l.numero } });

/**
 * Caisse de 1 000 USD (5712) et créance client de 1 000 USD (4111) réévaluées
 * au 31/12 · cours historique 2 800, clôture 2 500 · perte de 300 000 sur
 * chacune. Comptes pris tels que `reevaluer` les sert au SYSCOHADA · 4781
 * « diminution des créances d'exploitation », 676 « Pertes de change
 * financières ».
 */
const CAISSE_ET_CREANCE: LigneFaite[] = [
  { compteId: 'c-4781', numero: '47810000', debit: 300_000, credit: 0 },
  { compteId: 'c-4111', numero: '41110000', debit: 0, credit: 300_000 },
  { compteId: 'c-676', numero: '67600000', debit: 300_000, credit: 0 },
  { compteId: 'c-5712', numero: '57120000', debit: 0, credit: 300_000 },
];

function monter(
  dateDebutSuivant: string,
  lignes: LigneFaite[] = [
    { compteId: 'c1', numero: '41110000', debit: 100, credit: 0 },
    { compteId: 'c2', numero: '47910000', debit: 0, credit: 100 },
  ],
  options: { ecartsDisponibilites?: unknown; lignesDuCompte?: { compteId: string; deviseId: string }[] } = {},
) {
  const creer = jest.fn().mockResolvedValue({ id: 'ex' });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    reevaluation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'r1',
        exerciceId: 'n',
        dateReevaluation: new Date('2026-12-31'),
        ecritureExtourneId: null,
        coursUtilises: null,
        ecartsDisponibilites: options.ecartsDisponibilites ?? null,
        ecritureEcarts: { lignes: lignes.map(ligne) },
      }),
      updateMany,
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e', statut: 'OUVERT', dateDebut: new Date(dateDebutSuivant) }),
    },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(
        (options.lignesDuCompte ?? []).map((l) => ({ ...l, debit: 2_800_000, credit: 0, montantDevise: 1000 })),
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od' }) },
  };
  return { svc: new DevisesService(prisma as never, { creer, retirerCompensation: jest.fn() } as never), creer, updateMany };
}

const equilibree = (lignes: { debit?: number; credit?: number }[]) =>
  Math.abs(lignes.reduce((t, l) => t + (l.debit ?? 0) - (l.credit ?? 0), 0)) < 0.005;

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

describe('A5 bis · la contre-passation ne touche pas les disponibilités (AUDCIF art. 57)', () => {
  it('caisse et créance en USD · seuls le 4781 et le 4111 sont inversés, la caisse et son 676 restent, écriture équilibrée', async () => {
    const { svc, creer } = monter('2027-01-01', CAISSE_ET_CREANCE, { lignesDuCompte: [{ compteId: 'c-5712', deviseId: 'usd' }] });
    await svc.extourner('t', 'u', 'r1', 'e');
    const lignes = creer.mock.calls[0][2].lignes as { compteId: string; debit?: number; credit?: number }[];
    expect(lignes).toEqual([
      expect.objectContaining({ compteId: 'c-4781', credit: 300_000 }),
      expect.objectContaining({ compteId: 'c-4111', debit: 300_000 }),
    ]);
    expect(lignes.map((l) => l.compteId)).not.toContain('c-5712');
    expect(lignes.map((l) => l.compteId)).not.toContain('c-676');
    expect(equilibree(lignes)).toBe(true);
  });

  it('les cinq racines de disponibilités et le 776 restent hors de la contre-passation', () => {
    const lignes = [
      { compteNumero: '52150000', debit: 10, credit: 0 },
      { compteNumero: '53100000', debit: 10, credit: 0 },
      { compteNumero: '55100000', debit: 10, credit: 0 },
      { compteNumero: '57120000', debit: 10, credit: 0 },
      { compteNumero: '58500000', debit: 10, credit: 0 },
      { compteNumero: '77600000', debit: 0, credit: 50 },
      { compteNumero: '40110000', debit: 7, credit: 0 },
      { compteNumero: '47930000', debit: 0, credit: 7 },
      // Un découvert (56) est une DETTE · son écart est latent, il se contre-passe.
      { compteNumero: '56100000', debit: 3, credit: 0 },
      { compteNumero: '47940000', debit: 0, credit: 3 },
    ];
    const partage = partagerLignesDEcarts(lignes);
    expect(partage.motifRefus).toBeNull();
    expect(partage.aContrePasser.map((l) => l.compteNumero)).toEqual(['40110000', '47930000', '56100000', '47940000']);
    expect(partage.realisees).toHaveLength(6);
  });

  it('une écriture des écarts retouchée, qui ne se partage pas en deux parts équilibrées · refusée, rien passé', async () => {
    const retouchee = CAISSE_ET_CREANCE.map((l) => (l.compteId === 'c-676' ? { ...l, debit: 250_000 } : l));
    retouchee.push({ compteId: 'c-4111b', numero: '41110000', debit: 50_000, credit: 0 });
    const { svc, creer } = monter('2027-01-01', retouchee);
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/deux parts équilibrées/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une réévaluation qui ne porte que des disponibilités · rien à contre-passer, refus nommé', async () => {
    const { svc, creer } = monter('2027-01-01', CAISSE_ET_CREANCE.slice(2));
    await expect(svc.extourner('t', 'u', 'r1', 'e')).rejects.toThrow(/art\. 57/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('réévaluation antérieure à A5 bis · l’écart de la caisse est relu sur son écriture (une seule devise) et gardé', async () => {
    const { svc, updateMany } = monter('2027-01-01', CAISSE_ET_CREANCE, { lignesDuCompte: [{ compteId: 'c-5712', deviseId: 'usd' }] });
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      ecritureExtourneId: 'ex',
      ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }],
    });
  });

  it('écart déjà gardé par la réévaluation · rien n’est relu ni réécrit', async () => {
    const { svc, updateMany } = monter('2027-01-01', CAISSE_ET_CREANCE, {
      ecartsDisponibilites: [{ compteId: 'c-5712', deviseId: 'usd', ecart: -300_000 }],
    });
    await svc.extourner('t', 'u', 'r1', 'e');
    expect(updateMany.mock.calls[0][0].data).toEqual({ ecritureExtourneId: 'ex' });
  });
});
