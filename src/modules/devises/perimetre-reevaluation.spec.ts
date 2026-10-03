import { Referentiel } from '@prisma/client';
import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifDateReevaluation, motifHorsReevaluation, seReevalueALaCloture } from './perimetre-reevaluation';

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
      // D5 · le cours retenu est rendu, devise par devise, pour être gardé.
      expect(r.coursUtilises).toEqual({ d1: 2500 });
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

/**
 * RELECTURE ADVERSE B1 · LE CAS MIXTE. Sur le 401, SYSCOHADA · facture A de
 * 1 160 USD à 1 680 (1 948 800) ; 600 USD réglés par l'écran au coût
 * historique (1 008 000, 656 de 42 000 sur sa ligne) ; le solde de 560 USD
 * payé à 1 900 (1 064 000) ajouté à la main au groupe, resté PARTIEL avec
 * 123 200 à passer ; facture B de 500 USD à 1 700 (850 000), ouverte ;
 * clôture à 1 850. La position entière n'est pas nulle en devise (500 USD),
 * `motifPositionDenouee` ne jouait pas, et la réévaluation passait 198 200
 * au 478 et en provision, au lieu des 75 000 de la seule facture B · le 656
 * de 123 200 passé ensuite comptait la perte deux fois.
 */
describe('réévaluation · un groupe partiel dénoué sur un compte qui porte d’autres positions', () => {
  const ligne = (debit: number, credit: number, montantDevise: number, lettrageId: string | null) => ({
    compteId: 'c401',
    deviseId: 'd1',
    debit,
    credit,
    montantDevise,
    lettrageId,
    compte: { id: 'c401', numero: '40110000', intitule: 'NZUZI' },
    devise: { id: 'd1', code: 'USD' },
  });
  const lignes = [
    ligne(0, 1_948_800, 1160, 'L'),
    ligne(1_008_000, 0, 600, 'L'),
    ligne(1_064_000, 0, 560, 'L'),
    ligne(0, 850_000, 500, null),
  ];

  function monter() {
    const findMany = jest.fn(async ({ where }: { where: { lettrageId?: { in: string[] } } }) =>
      where.lettrageId
        ? lignes
            .filter((l) => l.lettrageId && where.lettrageId!.in.includes(l.lettrageId))
            .map((l) => ({ ...l, lettrage: { code: 'A' } }))
        : lignes,
    );
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
      exercice: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'ex1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' }),
      },
      ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }), findMany },
      reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
      provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
      verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
      ecriture: { count: jest.fn().mockResolvedValue(1) },
      coursDevise: { findFirst: jest.fn().mockResolvedValue({ cours: 1850 }) },
    };
    return new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
  }

  it('seule la facture B se réévalue · 75 000 de perte latente, pas 198 200', async () => {
    const r = await monter().calculer('t1', { exerciceId: 'ex1' });
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0]).toMatchObject({ montantDevise: -500, valeurComptable: -850_000, ecart: -75_000 });
    expect(r.perteLatente).toBe(75_000);
  });

  it('le groupe dénoué est NOMMÉ, avec son réalisé à passer', async () => {
    const r = await monter().calculer('t1', { exerciceId: 'ex1' });
    expect(r.positionsNonReevaluees).toEqual([
      expect.objectContaining({ numero: '40110000', deviseCode: 'USD', montantDevise: 0, motif: expect.stringMatching(/^lettrage a · position dénouée.*123200\.00/) }),
    ]);
  });
});

/**
 * RELECTURE ADVERSE, MINEUR 1 · UN GROUPE À CHEVAL SUR N ET N+1. En N · la
 * facture de 1 160 USD et 600 USD réglés au coût historique, groupe L
 * partiel. En N+1 · l'à-nouveau de la dette (560 USD, 940 800, hors groupe) et
 * le solde de 560 USD payé à 1 900 (1 064 000), ajouté au groupe L. Lu sur
 * toutes ses lignes, L se disait soldé en devise · son règlement de N+1
 * sortait de la position, et l'à-nouveau était réévalué comme une dette
 * vivante de 560 USD. Borné à l'exercice, L n'est pas dénoué en N+1, la
 * position de N+1 est soldée en devise et n'est pas réévaluée.
 */
describe('réévaluation · un groupe à cheval sur deux exercices', () => {
  type L = { exercice: string; debit: number; credit: number; montantDevise: number; lettrageId: string | null };
  const toutes: L[] = [
    { exercice: 'N', debit: 0, credit: 1_948_800, montantDevise: 1160, lettrageId: 'L' },
    { exercice: 'N', debit: 1_008_000, credit: 0, montantDevise: 600, lettrageId: 'L' },
    { exercice: 'N1', debit: 0, credit: 940_800, montantDevise: 560, lettrageId: null },
    { exercice: 'N1', debit: 1_064_000, credit: 0, montantDevise: 560, lettrageId: 'L' },
  ];
  const habiller = (l: L) => ({
    compteId: 'c401',
    deviseId: 'd1',
    debit: l.debit,
    credit: l.credit,
    montantDevise: l.montantDevise,
    lettrageId: l.lettrageId,
    lettrage: { code: 'A' },
    compte: { id: 'c401', numero: '40110000', intitule: 'NZUZI' },
    devise: { id: 'd1', code: 'USD' },
  });

  it('borné à N+1, le groupe n’est pas dénoué · la position soldée en devise ne se réévalue pas', async () => {
    const findMany = jest.fn(async ({ where }: { where: { lettrageId?: { in: string[] }; ecriture: { exerciceId?: string } } }) =>
      toutes
        .filter((l) => (where.ecriture.exerciceId === undefined || l.exercice === where.ecriture.exerciceId))
        .filter((l) => (where.lettrageId ? l.lettrageId !== null && where.lettrageId.in.includes(l.lettrageId) : true))
        .map(habiller),
    );
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
      exercice: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'N1', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' }),
      },
      ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }), findMany },
      reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
      provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
      verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
      ecriture: { count: jest.fn().mockResolvedValue(1) },
      coursDevise: { findFirst: jest.fn().mockResolvedValue({ cours: 1850 }) },
    };
    const r = await new DevisesService(prisma as unknown as PrismaService, {} as EcritureService).calculer('t1', { exerciceId: 'N1' });
    // La lecture du groupe porte l'exercice de la position.
    expect(findMany.mock.calls.some(([a]) => a.where.lettrageId && a.where.ecriture.exerciceId === 'N1')).toBe(true);
    expect(r.positions).toHaveLength(0);
    expect(r.positionsNonReevaluees).toEqual([expect.objectContaining({ numero: '40110000', montantDevise: 0, motif: expect.stringMatching(/^position dénouée/) })]);
  });
});

/**
 * DÉCISION D1 (2026-10-03, « réfère-toi à la loi ») · la réévaluation se fait
 * à la date de CLÔTURE · AUDCIF art. 54 (« subsistent au bilan à la date de
 * clôture », « dernier cours de change à cette date ») ; Titre VIII ch. 22
 * § 2.2. Une réévaluation du 30 septembre portait au 478 une position que le
 * règlement de novembre dénouait, et le réalisé passait à côté.
 */
describe('réévaluation · à la date de clôture seulement', () => {
  function monterD1(reevaluations: Array<{ id: string; dateReevaluation: Date }> = []) {
    const prisma = {
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' }) },
      // La liste lit aussi l'exercice suivant et sa réévaluation (relecture adverse d'A5 bis, M1 et B2) · aucune ici.
      reevaluation: { findMany: jest.fn().mockResolvedValue(reevaluations), findFirst: jest.fn().mockResolvedValue(null) },
    };
    return new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
  }

  it('une date autre que la fin de l’exercice · 400 nommé, simulation comprise, avant tout calcul', async () => {
    await expect(monterD1().reevaluer('t1', 'u1', { exerciceId: 'ex1', dateReevaluation: '2026-09-30' })).rejects.toThrow(
      /se fait à la date de CLÔTURE, le 2026-12-31 · le 2026-09-30 n'en est pas une.*art\. 54/,
    );
    await expect(monterD1().reevaluer('t1', 'u1', { exerciceId: 'ex1', dateReevaluation: '2026-09-30', simulation: true })).rejects.toThrow(
      /date de CLÔTURE/,
    );
  });

  it('la règle pure · la fin de l’exercice passe, au jour près', () => {
    expect(motifDateReevaluation('2026-12-31', new Date('2026-12-31'))).toBeNull();
    expect(motifDateReevaluation('2026-12-30', new Date('2026-12-31'))).toMatch(/CLÔTURE/);
  });

  it('une réévaluation déjà passée à une autre date n’est pas retouchée · elle est SIGNALÉE', async () => {
    const r = await monterD1([
      { id: 'a', dateReevaluation: new Date('2026-09-30') },
      { id: 'b', dateReevaluation: new Date('2026-12-31') },
    ]).listerReevaluations('t1', 'ex1');
    expect(r.find((x) => x.id === 'a')?.horsCloture).toMatch(/CLÔTURE/);
    expect(r.find((x) => x.id === 'b')?.horsCloture).toBeNull();
  });
});
