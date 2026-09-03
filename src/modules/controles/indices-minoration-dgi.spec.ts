import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LES TROIS INDICES DE MINORATION RELEVÉS PAR LA DGI.
 *
 * Source : séminaire CPCC sur l'arrêté des comptes 2024, module « Travaux de
 * fin d'exercice : détermination du résultat comptable et du résultat fiscal »,
 * animé par la Division chargée de la Formation de la DGI. Le module présente
 * des écritures dont l'ABSENCE est lue par l'administration comme une
 * « intention de MINORER la base imposable ».
 *
 * AUCUN TAUX N'EST REPRIS DE CE SÉMINAIRE · il décrit l'IBP, abrogé au
 * 1er janvier 2026 par la loi n° 23/053 et remplacé par l'IS et l'IRPP. Seuls
 * les mécanismes d'écriture sont retenus, et aucun ne dépend d'un taux. C'est
 * la raison d'être du dernier test de ce fichier.
 */

const ligne = (numero: string, intitule: string, debit: number, credit = 0, exerciceId = 'ex') => ({
  debit,
  credit,
  compte: { numero, intitule },
  ecriture: { exerciceId },
});

type Ligne = ReturnType<typeof ligne>;

function service(lignes: Ligne[], referentiel: Referentiel, avecExercicePrecedent = true) {
  const courant = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
  const precedent = { id: 'exN1', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockImplementation((args: { where?: { dateFin?: { lt?: Date } } }) =>
        // La recherche de l'exercice PRÉCÉDENT porte un filtre dateFin < début ·
        // c'est ce qui la distingue de la lecture de l'exercice courant.
        args?.where?.dateFin?.lt ? Promise.resolve(avecExercicePrecedent ? precedent : null) : Promise.resolve(courant),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const trouver = async (
  code: string,
  lignes: Ligne[],
  referentiel: Referentiel = Referentiel.SYSCOHADA,
  avecExercicePrecedent = true,
) => {
  const rapport = await service(lignes, referentiel, avecExercicePrecedent).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === code);
};

describe('17 · transport pour le compte de tiers sans transfert de charges', () => {
  it('signale un solde 613 quand aucun 781 n’a bougé', async () => {
    const a = await trouver('TRANSPORT_TIERS_SANS_TRANSFERT', [
      ligne('61300000', 'Transports pour le compte de tiers', 2_400_000),
    ]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences[0].montant).toBe(2_400_000);
    expect(a!.consequence).toContain('minoré');
  });

  it('se tait dès qu’un transfert de charges a été passé', async () => {
    const a = await trouver('TRANSPORT_TIERS_SANS_TRANSFERT', [
      ligne('61300000', 'Transports pour le compte de tiers', 2_400_000),
      ligne('78100000', 'Transferts de charges d’exploitation', 0, 2_400_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('ne s’adresse pas à une entité à but non lucratif', async () => {
    // Loi n° 23/053, art. 5 · une EBNL est exemptée d'impôt sur les sociétés,
    // le risque d'assiette n'a donc pas d'objet pour elle.
    const a = await trouver(
      'TRANSPORT_TIERS_SANS_TRANSFERT',
      [ligne('61300000', 'Transports pour le compte de tiers', 2_400_000)],
      Referentiel.SYCEBNL,
    );
    expect(a).toBeUndefined();
  });
});

describe('18 · extourne de régularisation d’un montant différent', () => {
  const constatee = (montant: number) => ligne('47600000', 'Charges constatées d’avance', montant, 0, 'exN1');
  const extournee = (montant: number) => ligne('47600000', 'Charges constatées d’avance', 0, montant, 'ex');

  it('signale une extourne inférieure au solde repris', async () => {
    const a = await trouver('EXTOURNE_REGULARISATION_INCOHERENTE', [constatee(10_000), extournee(8_000)]);
    expect(a).toBeDefined();
    expect(a!.occurrences[0].montant).toBe(-2_000);
    expect(a!.occurrences[0].detail).toContain('10000.00');
  });

  it('signale une extourne supérieure au solde repris', async () => {
    const a = await trouver('EXTOURNE_REGULARISATION_INCOHERENTE', [constatee(10_000), extournee(12_000)]);
    expect(a!.occurrences[0].montant).toBe(2_000);
  });

  it('se tait quand l’extourne est exacte', async () => {
    expect(await trouver('EXTOURNE_REGULARISATION_INCOHERENTE', [constatee(10_000), extournee(10_000)])).toBeUndefined();
  });

  it('lit le 477 dans son sens propre, créditeur', async () => {
    // Un produit constaté d'avance est CRÉDITEUR à la clôture et se DÉBITE à
    // l'extourne · l'inverse du 476. Lire les deux dans le même sens ferait
    // crier le contrôle sur tous les 477 justes.
    const a = await trouver('EXTOURNE_REGULARISATION_INCOHERENTE', [
      ligne('47700000', 'Produits constatés d’avance', 0, 6_000, 'exN1'),
      ligne('47700000', 'Produits constatés d’avance', 6_000, 0, 'ex'),
    ]);
    expect(a).toBeUndefined();
  });

  it('vaut pour les deux référentiels · ce n’est pas un risque d’assiette', async () => {
    const a = await trouver(
      'EXTOURNE_REGULARISATION_INCOHERENTE',
      [constatee(10_000), extournee(3_000)],
      Referentiel.SYCEBNL,
    );
    expect(a).toBeDefined();
  });

  it('se tait sur un premier exercice, faute de solde à reprendre', async () => {
    expect(
      await trouver('EXTOURNE_REGULARISATION_INCOHERENTE', [extournee(8_000)], Referentiel.SYSCOHADA, false),
    ).toBeUndefined();
  });
});

describe('19 · avances clients reportées d’un exercice à l’autre', () => {
  it('signale une avance créditrice à la clôture précédente', async () => {
    const a = await trouver('AVANCE_CLIENT_REPORTEE', [
      ligne('41910000', 'Clients, avances et acomptes reçus', 0, 5_000_000, 'exN1'),
    ]);
    expect(a).toBeDefined();
    // INFORMATION et non AVERTISSEMENT · c'est une position de contrôle de
    // l'administration, pas une règle de l'AUDCIF.
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.consequence).toContain('pas une règle de l’AUDCIF');
    expect(a!.occurrences[0].montant).toBe(5_000_000);
  });

  it('se tait quand l’avance a été soldée dans l’exercice précédent', async () => {
    const a = await trouver('AVANCE_CLIENT_REPORTEE', [
      ligne('41910000', 'Clients, avances et acomptes reçus', 0, 5_000_000, 'exN1'),
      ligne('41910000', 'Clients, avances et acomptes reçus', 5_000_000, 0, 'exN1'),
    ]);
    expect(a).toBeUndefined();
  });

  it('ne s’adresse pas à une entité à but non lucratif', async () => {
    const a = await trouver(
      'AVANCE_CLIENT_REPORTEE',
      [ligne('41910000', 'Clients, avances et acomptes reçus', 0, 5_000_000, 'exN1')],
      Referentiel.SYCEBNL,
    );
    expect(a).toBeUndefined();
  });
});

describe('le millésime du séminaire ne contamine pas les messages', () => {
  it('ne cite ni l’IBP ni l’IPR, abrogés au 1er janvier 2026', async () => {
    const rapport = await service(
      [
        ligne('61300000', 'Transports pour le compte de tiers', 2_400_000),
        ligne('47600000', 'Charges constatées d’avance', 10_000, 0, 'exN1'),
        ligne('47600000', 'Charges constatées d’avance', 0, 8_000, 'ex'),
        ligne('41910000', 'Clients, avances et acomptes reçus', 0, 5_000_000, 'exN1'),
      ],
      Referentiel.SYSCOHADA,
    ).analyser('t', 'ex');
    const textes = rapport.anomalies.map((a) => `${a.libelle} ${a.consequence} ${a.action}`).join(' ');
    // Le séminaire raisonne en IBP et en IPR · les reprendre daterait le
    // logiciel d'un régime abrogé.
    expect(textes).not.toMatch(/\bIBP\b|\bIPR\b|impôt sur les bénéfices et profits/i);
  });
});
