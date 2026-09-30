import { ClasseCompte, FormeJuridiqueSyscohada, Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
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
  balance?: { numero: string; solde: number }[],
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
  if (!balance) return new ControlesService(prisma);
  // La balance du livre-journal · la doublure ne rend rien si le brouillard
  // est demandé, pour qu'un contrôle qui le lirait tombe.
  const ecritureService = {
    balance: jest.fn(async (_t: string, _e: string, inclureBrouillard: boolean) => ({
      lignes: inclureBrouillard
        ? []
        : balance.map((b) => ({
            compteId: b.numero,
            numero: b.numero,
            intitule: b.numero,
            classe: `CLASSE_${b.numero[0]}` as ClasseCompte,
            typeCompte: TypeCompteDetailTotal.DETAIL,
            totalDebit: Math.max(0, b.solde),
            totalCredit: Math.max(0, -b.solde),
            reportDebit: 0,
            reportCredit: 0,
            mouvementDebit: Math.max(0, b.solde),
            mouvementCredit: Math.max(0, -b.solde),
            clotureDebit: 0,
            clotureCredit: 0,
            solde: b.solde,
          })),
    })),
  } as unknown as EcritureService;
  // La résolution du bilan est la VRAIE · c'est elle que le contrôle doit lire.
  const etats = new EtatsFinanciersSyscohadaService(ecritureService, {} as never);
  return new ControlesService(prisma, ecritureService, etats);
}

const trouver = async (
  code: string,
  lignes: Ligne[],
  referentiel: Referentiel = Referentiel.SYSCOHADA,
  avecExercicePrecedent = true,
  forme: FormeJuridiqueSyscohada | null = null,
  balance?: { numero: string; solde: number }[],
) => {
  const rapport = await service(lignes, referentiel, avecExercicePrecedent, forme, balance).analyser('t', 'ex');
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

  it('une SARL lit l’interdiction de l’art. 356, et la convention de prêt n’est plus offerte sans condition (O1b-A5)', async () => {
    const a = await trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect(a!.consequence).toContain('interdits à peine de nullité (AUSCGIE art. 356)');
    expect(a!.action).toContain('seulement si le titulaire n’est pas visé par l’interdiction');
  });

  it('une SA lit les art. 450 et 507, une SAS l’art. 853-16 · chacune son article (O1b-B3, C5)', async () => {
    const [sa, sas, snc] = await Promise.all([
      trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_ANONYME),
      trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE),
      trouver('COMPTE_COURANT_ASSOCIE_DEBITEUR', [avance], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF),
    ]);
    expect(sa!.consequence).toContain('(AUSCGIE art. 450 et 507)');
    expect(sas!.consequence).toContain('(AUSCGIE art. 853-16)');
    // SNC · aucun article lu, l'action d'origine reste.
    expect(snc!.action).toContain('(convention de prêt, remboursement intervenu)');
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

describe('19 bis A · capitaux propres sous la moitié du capital (O1b-A4, D1, G3)', () => {
  // Capital 10 000 000, perte de 7 000 000 · capitaux propres 3 000 000.
  const perte = [
    { numero: '10130000', solde: -10_000_000 },
    { numero: '13900000', solde: 7_000_000 },
    { numero: '52110000', solde: 3_000_000 },
  ];
  const sa = FormeJuridiqueSyscohada.SOCIETE_ANONYME;
  it('une SA sous la moitié est informée, sur les art. 664 et 665, grandeurs lues par le bilan', async () => {
    const a = await trouver('CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL', [], Referentiel.SYSCOHADA, true, sa, perte);
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.occurrences.map((o) => o.montant)).toEqual([3_000_000, 10_000_000]);
    expect(a!.consequence).toContain('(AUSCGIE art. 664)');
    expect(a!.consequence).toContain('(art. 669)');
  });

  it('le capital non appelé et les subventions comptent aux capitaux propres · AUDCIF Titre VIII ch. 16, § 3.1', async () => {
    // 109 débiteur de 2 000 000 retranché au bilan, subvention de 1 000 000 ·
    // capitaux propres juridiques 3 000 000 + 1 000 000 = 4 000 000 < 5 000 000.
    const a = await trouver('CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL', [], Referentiel.SYSCOHADA, true, sa, [
      ...perte,
      { numero: '10900000', solde: 2_000_000 },
      { numero: '14100000', solde: -1_000_000 },
      { numero: '52110000', solde: 0 },
    ]);
    expect(a!.occurrences[0].montant).toBe(4_000_000);
  });

  it('une SARL lit les art. 371 à 373, pas le délai de l’art. 665', async () => {
    const a = await trouver(
      'CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL',
      [],
      Referentiel.SYSCOHADA,
      true,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      perte,
    );
    expect(a!.consequence).toContain('(AUSCGIE art. 371)');
    expect(a!.consequence).toContain('dans les deux ans qui suivent la clôture de l’exercice déficitaire');
  });

  it('se tait à la moitié, chez une SNC, et sans capital', async () => {
    const moitie = [
      { numero: '10130000', solde: -10_000_000 },
      { numero: '13900000', solde: 5_000_000 },
    ];
    const [aMoitie, snc] = await Promise.all([
      trouver('CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL', [], Referentiel.SYSCOHADA, true, sa, moitie),
      trouver('CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL', [], Referentiel.SYSCOHADA, true, FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF, perte),
    ]);
    expect([aMoitie, snc]).toEqual([undefined, undefined]);
  });
});

describe('le 109 et le 1011, de solde opposé et de montant identique (R1-A7)', () => {
  it('un appel qui touche le 1011 sans le 109 est nommé, deux soldes à l’appui', async () => {
    const a = await trouver('CAPITAL_NON_APPELE_DISCORDANT', [], Referentiel.SYSCOHADA, true, null, [
      { numero: '10110000', solde: -2_000_000 },
      { numero: '10900000', solde: 5_000_000 },
    ]);
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.occurrences.map((o) => [o.reference, o.montant])).toEqual([
      ['109', 5_000_000],
      ['1011', -2_000_000],
    ]);
    expect(a!.consequence).toContain('de solde opposé et de montant identique');
  });

  it('un 109 crédité sans le 1011 est nommé aussi · l’écart vaut dans les deux sens', async () => {
    const a = await trouver('CAPITAL_NON_APPELE_DISCORDANT', [], Referentiel.SYSCOHADA, true, null, [
      { numero: '10110000', solde: -5_000_000 },
      { numero: '10900000', solde: 2_000_000 },
    ]);
    expect(a).toBeDefined();
  });

  it('se tait quand les deux se compensent', async () => {
    const a = await trouver('CAPITAL_NON_APPELE_DISCORDANT', [], Referentiel.SYSCOHADA, true, null, [
      { numero: '10110000', solde: -5_000_000 },
      { numero: '10900000', solde: 5_000_000 },
    ]);
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
