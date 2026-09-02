import { Referentiel } from '@prisma/client';
import { AffectationService } from './affectation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AFFECTATION DU RÉSULTAT · le service qui vide enfin le compte 13.
 *
 * Quatre choses doivent tenir, et chacune répare un défaut réel :
 *
 *  1. LE MONTANT EST LE MOUVEMENT DU 13, PAS SON SOLDE. Quand l'exercice
 *     précédent n'a pas été affecté (le cas de tous les dossiers existants),
 *     son résultat a été reporté à l'ouverture et le solde du 131 vaut deux
 *     exercices cumulés. Lire le solde ferait affecter deux fois le résultat
 *     de l'année d'avant · c'est le piège que ce module doit précisément ne
 *     pas retomber dans.
 *
 *  2. LE COMPTE 13 DOIT ÊTRE SOLDÉ. Une affectation partielle le laisserait
 *     plein, donc n'affecterait rien du tout : le texte dit « le compte 13 est
 *     SOLDÉ lors de la comptabilisation de cette affectation ».
 *
 *  3. LES DESTINATIONS DÉPENDENT DU RÉFÉRENTIEL. Le SYCEBNL ne connaît pas les
 *     dividendes · une EBNL ne distribue rien.
 *
 *  4. LA RÉSERVE LÉGALE EST SANCTIONNÉE PAR LA NULLITÉ. Le contrôle refuse au
 *     lieu d'avertir, ce qui est rare dans ce logiciel et se justifie ici
 *     seulement parce que le texte prévoit la nullité de la délibération.
 */

interface LigneBalance {
  numero: string;
  mouvementDebit: number;
  mouvementCredit: number;
  solde: number;
}

const COMPTES = [
  { id: 'c131', numero: '13100000', intitule: 'Résultat net : bénéfice', typeCompte: 'DETAIL' },
  { id: 'c139', numero: '13900000', intitule: 'Résultat net : perte', typeCompte: 'DETAIL' },
  { id: 'c111', numero: '11100000', intitule: 'Réserve légale', typeCompte: 'DETAIL' },
  { id: 'c118', numero: '11810000', intitule: 'Réserves facultatives', typeCompte: 'DETAIL' },
  { id: 'c121', numero: '12100000', intitule: 'Report à nouveau créditeur', typeCompte: 'DETAIL' },
  { id: 'c129', numero: '12910000', intitule: 'Perte nette à reporter', typeCompte: 'DETAIL' },
  { id: 'c465', numero: '46500000', intitule: 'Associés, dividendes à payer', typeCompte: 'DETAIL' },
  { id: 'c10', numero: '10110000', intitule: 'Dotation', typeCompte: 'DETAIL' },
  { id: 'c12', numero: '12', intitule: 'Report à nouveau', typeCompte: 'TOTAL' },
  { id: 'c60', numero: '60100000', intitule: 'Achats', typeCompte: 'DETAIL' },
];

interface Options {
  referentiel?: Referentiel;
  balance?: LigneBalance[];
  statutExercice?: 'OUVERT' | 'CLOTURE';
  suivant?: { id: string; statut: string; dateDebut: Date; dateFin: Date } | null;
  affectationExistante?: unknown;
}

function service(o: Options = {}) {
  const creerEcriture = jest.fn().mockResolvedValue({ id: 'ecr1', numeroPiece: 12 });
  const creerAffectation = jest.fn().mockImplementation(({ data }: { data: unknown }) =>
    Promise.resolve({ id: 'aff1', ...(data as Record<string, unknown>) }),
  );
  const clos = {
    id: 'ex2026',
    statut: o.statutExercice ?? 'CLOTURE',
    dateDebut: new Date('2026-01-01'),
    dateFin: new Date('2026-12-31'),
  };
  const suivant =
    o.suivant === undefined
      ? { id: 'ex2027', statut: 'OUVERT', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') }
      : o.suivant;
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.dateDebut ? suivant : clos),
      ),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA }),
    },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(where.id ? COMPTES.filter((c) => where.id!.in.includes(c.id)) : COMPTES),
      ),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { numero: { startsWith: string } } }) =>
        Promise.resolve(COMPTES.find((c) => c.numero.startsWith(where.numero.startsWith)) ?? null),
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'jOD', code: 'OD' }) },
    affectationResultat: {
      findUnique: jest.fn().mockResolvedValue(o.affectationExistante ?? null),
      create: creerAffectation,
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const ecritures = {
    balance: jest.fn().mockResolvedValue({ lignes: o.balance ?? [], totaux: { debit: 0, credit: 0 } }),
    creer: creerEcriture,
  } as unknown as EcritureService;
  return { svc: new AffectationService(prisma, ecritures), creerEcriture, creerAffectation };
}

/** Un bénéfice de `montant` porté par le MOUVEMENT du 131. */
const benefice = (montant: number, extra: LigneBalance[] = []): LigneBalance[] => [
  { numero: '13100000', mouvementDebit: 0, mouvementCredit: montant, solde: -montant },
  ...extra,
];

const DECISION = { dateDecision: '2027-06-30', organe: 'Assemblée générale ordinaire', reference: 'PV-2027-01' };

describe('Affectation · le montant à affecter', () => {
  it('lit le MOUVEMENT du compte 13, pas son solde', async () => {
    // Le 131 porte 5 000 000 de solde, dont 3 000 000 reportés de l'exercice
    // précédent jamais affecté. Seuls 2 000 000 sont le résultat de CET
    // exercice · affecter 5 000 000 affecterait deux fois celui d'avant.
    const { svc } = service({
      balance: [{ numero: '13100000', mouvementDebit: 0, mouvementCredit: 2_000_000, solde: -5_000_000 }],
    });
    const p = await svc.preparer('t1', 'ex2026');
    expect(p.montant).toBe(2_000_000);
    expect(p.estBenefice).toBe(true);
  });

  it('reconnaît une perte au mouvement du 139', async () => {
    const { svc } = service({
      balance: [{ numero: '13900000', mouvementDebit: 800_000, mouvementCredit: 0, solde: 800_000 }],
    });
    const p = await svc.preparer('t1', 'ex2026');
    expect(p.montant).toBe(800_000);
    expect(p.estBenefice).toBe(false);
  });

  it('refuse d’affecter un exercice qui n’est pas clôturé', async () => {
    const { svc } = service({ statutExercice: 'OUVERT' });
    await expect(svc.preparer('t1', 'ex2026')).rejects.toThrow(/après la clôture/);
  });
});

describe('Affectation · le compte 13 doit être SOLDÉ', () => {
  it('refuse une affectation partielle, et dit ce qui reste', async () => {
    const { svc } = service({ balance: benefice(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c121', montant: 600_000 }],
      }),
    ).rejects.toThrow(/reste 400000.00 à affecter/);
  });

  it('accepte une affectation qui épuise le résultat', async () => {
    const { svc, creerEcriture } = service({ balance: benefice(1_000_000) });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [
        { compteId: 'c111', montant: 100_000 },
        { compteId: 'c121', montant: 900_000 },
      ],
    });
    expect(creerEcriture).toHaveBeenCalledTimes(1);
  });
});

describe('Affectation · l’écriture qui solde le 13', () => {
  it('DÉBITE le 131 et crédite les destinations, pour un bénéfice', async () => {
    const { svc, creerEcriture } = service({ balance: benefice(1_000_000) });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [
        { compteId: 'c111', montant: 100_000 },
        { compteId: 'c121', montant: 900_000 },
      ],
    });
    const dto = creerEcriture.mock.calls[0][2];
    expect(dto.lignes[0]).toMatchObject({ compteId: 'c131', debit: 1_000_000 });
    expect(dto.lignes[1]).toMatchObject({ compteId: 'c111', credit: 100_000 });
    expect(dto.lignes[2]).toMatchObject({ compteId: 'c121', credit: 900_000 });
  });

  it('CRÉDITE le 139 et débite les destinations, pour une perte', async () => {
    const { svc, creerEcriture } = service({
      balance: [{ numero: '13900000', mouvementDebit: 500_000, mouvementCredit: 0, solde: 500_000 }],
    });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [{ compteId: 'c129', montant: 500_000 }],
    });
    const dto = creerEcriture.mock.calls[0][2];
    expect(dto.lignes[0]).toMatchObject({ compteId: 'c139', credit: 500_000 });
    expect(dto.lignes[1]).toMatchObject({ compteId: 'c129', debit: 500_000 });
  });

  it('passe l’écriture dans l’exercice SUIVANT, à la date de la décision', async () => {
    // « décidée par les organes compétents au cours de l'exercice suivant » ·
    // et de toute façon un exercice clôturé n'accepte plus d'écriture.
    // La réserve légale est dotée ici parce que le dossier est SYSCOHADA : sans
    // elle, le contrôle de l'AUSCGIE refuserait l'affectation avant même
    // d'arriver à l'écriture. Ce n'est pas un détail de montage · c'est la
    // preuve que la garde s'applique par défaut, et non seulement quand on
    // pense à la tester.
    const { svc, creerEcriture } = service({ balance: benefice(1_000_000) });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [
        { compteId: 'c111', montant: 100_000 },
        { compteId: 'c121', montant: 900_000 },
      ],
    });
    const dto = creerEcriture.mock.calls[0][2];
    expect(dto.exerciceId).toBe('ex2027');
    expect(dto.date).toBe('2027-06-30');
    expect(dto.libelle).toContain('2026');
  });

  it('refuse une date de décision hors de l’exercice d’accueil', async () => {
    const { svc } = service({ balance: benefice(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        dateDecision: '2026-06-30',
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c121', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/date de décision/);
  });

  it('refuse quand aucun exercice ne suit · il faut l’ouvrir d’abord', async () => {
    const { svc } = service({ balance: benefice(1_000_000), suivant: null });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c121', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/Aucun exercice ne suit/);
  });
});

describe('Affectation · les destinations dépendent du référentiel', () => {
  it('refuse les dividendes à une entité à but non lucratif', async () => {
    const { svc } = service({ referentiel: Referentiel.SYCEBNL, balance: benefice(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c465', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/ne distribue pas de résultat à ses membres/);
  });

  it('les accepte d’une société', async () => {
    const { svc, creerEcriture } = service({ balance: benefice(1_000_000) });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [
        { compteId: 'c111', montant: 100_000 },
        { compteId: 'c465', montant: 900_000 },
      ],
    });
    expect(creerEcriture).toHaveBeenCalled();
  });

  it('refuse un compte qui n’est pas une destination du résultat', async () => {
    // Un compte de charges ne reçoit pas un résultat · le texte énumère la
    // classe 1 et, en SYSCOHADA, le 465.
    const { svc } = service({ balance: benefice(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c60', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/n'est pas une destination admise/);
  });

  it('refuse un compte de totalisation', async () => {
    const { svc } = service({ balance: benefice(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c12', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/compte de totalisation/);
  });
});

describe('Affectation · la réserve légale bloque, elle n’avertit pas', () => {
  const avecCapital = (montant: number) =>
    benefice(montant, [
      { numero: '10110000', mouvementDebit: 0, mouvementCredit: 0, solde: -10_000_000 },
      { numero: '11100000', mouvementDebit: 0, mouvementCredit: 0, solde: 0 },
    ]);

  it('refuse une affectation qui dote moins du dixième', async () => {
    const { svc } = service({ balance: avecCapital(1_000_000) });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [
          { compteId: 'c111', montant: 50_000 },
          { compteId: 'c121', montant: 950_000 },
        ],
      }),
    ).rejects.toThrow(/au moins 100000.00/);
  });

  it('accepte au-delà du minimum · c’est un plancher, pas un montant', async () => {
    const { svc, creerEcriture } = service({ balance: avecCapital(1_000_000) });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [
        { compteId: 'c111', montant: 300_000 },
        { compteId: 'c121', montant: 700_000 },
      ],
    });
    expect(creerEcriture).toHaveBeenCalled();
  });

  it('ne l’exige pas d’une entité à but non lucratif', async () => {
    const { svc, creerEcriture } = service({
      referentiel: Referentiel.SYCEBNL,
      balance: benefice(1_000_000),
    });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [{ compteId: 'c121', montant: 1_000_000 }],
    });
    expect(creerEcriture).toHaveBeenCalled();
  });

  it('ne l’exige pas sur une perte', async () => {
    const { svc, creerEcriture } = service({
      balance: [
        { numero: '13900000', mouvementDebit: 400_000, mouvementCredit: 0, solde: 400_000 },
        { numero: '10110000', mouvementDebit: 0, mouvementCredit: 0, solde: -10_000_000 },
      ],
    });
    await svc.enregistrer('t1', 'u1', {
      ...DECISION,
      exerciceId: 'ex2026',
      lignes: [{ compteId: 'c129', montant: 400_000 }],
    });
    expect(creerEcriture).toHaveBeenCalled();
  });
});

describe('Affectation · une seule par exercice', () => {
  it('refuse une seconde décision sur le même exercice', async () => {
    const { svc } = service({
      balance: benefice(1_000_000),
      affectationExistante: { id: 'aff0', dateDecision: new Date('2027-05-01') },
    });
    await expect(
      svc.enregistrer('t1', 'u1', {
        ...DECISION,
        exerciceId: 'ex2026',
        lignes: [{ compteId: 'c121', montant: 1_000_000 }],
      }),
    ).rejects.toThrow(/déjà été affecté le 2027-05-01/);
  });
});
