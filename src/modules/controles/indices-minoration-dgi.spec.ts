import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
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

// `soldeDeGestion` marque une ligne de l'écriture qui solde les classes 6 à 8
// à la clôture, VALIDÉE depuis l'audit final F4.
const ligne = (numero: string, intitule: string, debit: number, credit = 0, exerciceId = 'ex', soldeDeGestion = false) => ({
  debit,
  credit,
  compte: { numero, intitule },
  ecriture: { exerciceId },
  soldeDeGestion,
});

type Ligne = ReturnType<typeof ligne>;

function service(
  lignes: Ligne[],
  referentiel: Referentiel,
  avecExercicePrecedent = true,
  forme: FormeJuridiqueSyscohada | null = null,
) {
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
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel, formeJuridiqueSyscohada: forme }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    // LA DOUBLURE HONORE LE FILTRE DU SOLDE DE CLÔTURE · elle n'écarte ces
    // lignes que si la requête le demande, comme Postgres.
    ligneEcriture: {
      // ET L'EXERCICE DEMANDÉ, quand la requête le nomme (passe F5) · sans
      // lui, un contrôle qui lirait le mauvais exercice passerait.
      findMany: jest.fn(async (args: { where?: { ecriture?: { estSoldeDesComptesDeGestion?: boolean; exerciceId?: unknown } } }) =>
        lignes.filter(
          (l) =>
            !(l.soldeDeGestion && args?.where?.ecriture?.estSoldeDesComptesDeGestion === false) &&
            (typeof args?.where?.ecriture?.exerciceId !== 'string' || l.ecriture.exerciceId === args.where.ecriture.exerciceId),
        ),
      ),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 21 lit le manuel des procédures (AUDCIF art. 16 al. 1) ·
    // sans ce faux, il croirait la table absente plutôt que le manuel.
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    // Mandat du contrôleur des comptes · contrôle 28. Vide ici, ces specs ne
    // le testent pas ; une doublure muette sur une lecture réelle validerait
    // un service qui n'existe pas.
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau · aucun ici.
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 15 retranche du solde des comptes 29 ce que le module
    // d'immobilisations y a lui-même posté · sans ce faux, il croirait la
    // table absente.
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const trouver = async (
  code: string,
  lignes: Ligne[],
  referentiel: Referentiel = Referentiel.SYSCOHADA,
  avecExercicePrecedent = true,
  forme: FormeJuridiqueSyscohada | null = null,
) => {
  const rapport = await service(lignes, referentiel, avecExercicePrecedent, forme).analyser('t', 'ex');
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

  it('signale encore un exercice CLOS · le solde de clôture n’est pas un transfert (régression de F4)', async () => {
    // L'écriture validée qui solde les comptes de gestion remet le 613 à
    // zéro · lue avec elle, le contrôle se taisait sur tout exercice clos.
    const a = await trouver('TRANSPORT_TIERS_SANS_TRANSFERT', [
      ligne('61300000', 'Transports pour le compte de tiers', 2_400_000),
      ligne('61300000', 'Transports pour le compte de tiers', 0, 2_400_000, 'ex', true),
    ]);
    expect(a).toBeDefined();
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

describe('19 bis · compte courant d’associé débiteur (passe F5, art. 73, al. 2, 2°, a)', () => {
  const avance = ligne('46210000', 'Associés, comptes courants', 3_000_000);
  it('signale un 462 débiteur d’une société SYSCOHADA, sans chiffrer de retenue', async () => {
    const a = await trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect([a?.gravite, a?.occurrences[0].montant, a?.consequence.includes('sauf preuve contraire')]).toEqual(['INFORMATION', 3_000_000, true]);
  });

  it('ne lit que l’exercice analysé', async () => {
    const a = await trouver(
      'COMPTE_COURANT_ASSOCIE_DEBITEUR',
      [ligne('46210000', 'Associés, comptes courants', 3_000_000, 0, 'exN1')],
      Referentiel.SYSCOHADA,
      true,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    );
    expect(a).toBeUndefined();
  });

  it('se tait au SYCEBNL, où le 462 porte les fonds d’administration des projets, et chez une personne physique', async () => {
    const [ebnl, physique] = await Promise.all([
      trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYCEBNL),
      trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE),
    ]);
    expect([ebnl, physique]).toEqual([undefined, undefined]);
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
