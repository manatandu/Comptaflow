import { PeriodiciteAbonnement } from '@prisma/client';
import { RegularisationService } from './regularisation.service';

/**
 * Le prorata et l'échéancier, isolés de la base : ce sont les deux calculs qui
 * décident du résultat de l'exercice et du nombre d'écritures générées, et
 * qu'aucune relecture ne garantit.
 *
 * Le prorata se compte en JOURS et non en mois : une convention du 15 septembre
 * au 14 septembre suivant ne se découpe pas en mois entiers, et l'arrondir au
 * mois déplacerait plusieurs points de pourcentage du résultat d'un exercice à
 * l'autre.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('prorata de la part différée', () => {
  const finExercice = d('2026-12-31');

  it('ne diffère rien quand la période finit avant la clôture', () => {
    expect(
      RegularisationService.prorataDiffere(1_200_000, d('2026-01-01'), d('2026-06-30'), finExercice),
    ).toBe(0);
  });

  it('diffère tout quand la période commence après la clôture', () => {
    expect(
      RegularisationService.prorataDiffere(1_200_000, d('2027-01-01'), d('2027-12-31'), finExercice),
    ).toBe(1_200_000);
  });

  it('coupe une année civile décalée au prorata des jours', () => {
    // Du 1er juillet 2026 au 30 juin 2027 : 365 jours, dont 181 après la
    // clôture du 31/12/2026.
    const differe = RegularisationService.prorataDiffere(
      365_000,
      d('2026-07-01'),
      d('2027-06-30'),
      finExercice,
    );
    expect(differe).toBeCloseTo(181_000, 0);
  });

  it('compte les bornes des deux côtés', () => {
    // Du 1er au 31 décembre : 31 jours, aucun après la clôture.
    expect(
      RegularisationService.prorataDiffere(310_000, d('2026-12-01'), d('2026-12-31'), finExercice),
    ).toBe(0);
    // Du 31 décembre au 1er janvier : 2 jours, 1 après la clôture.
    expect(
      RegularisationService.prorataDiffere(200, d('2026-12-31'), d('2027-01-01'), finExercice),
    ).toBe(100);
  });

  it('renvoie zéro sur une période vide ou inversée', () => {
    expect(RegularisationService.prorataDiffere(1000, d('2026-06-30'), d('2026-06-01'), finExercice)).toBe(0);
  });
});

describe('échéancier d’abonnement', () => {
  it('mensuel sur un an : douze échéances', () => {
    const dates = RegularisationService.echeancesDe(
      d('2026-01-15'),
      d('2026-12-31'),
      PeriodiciteAbonnement.MENSUELLE,
    );
    expect(dates).toHaveLength(12);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(dates[11].toISOString().slice(0, 10)).toBe('2026-12-15');
  });

  it('trimestriel sur un an : quatre échéances', () => {
    const dates = RegularisationService.echeancesDe(
      d('2026-01-01'),
      d('2026-12-31'),
      PeriodiciteAbonnement.TRIMESTRIELLE,
    );
    expect(dates.map((x) => x.toISOString().slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);
  });

  it('annuel sur trois ans : trois échéances', () => {
    const dates = RegularisationService.echeancesDe(
      d('2026-03-01'),
      d('2028-12-31'),
      PeriodiciteAbonnement.ANNUELLE,
    );
    expect(dates).toHaveLength(3);
  });

  it('ne produit aucune échéance si la fin précède le début', () => {
    expect(
      RegularisationService.echeancesDe(d('2026-06-01'), d('2026-01-01'), PeriodiciteAbonnement.MENSUELLE),
    ).toHaveLength(0);
  });
});

/**
 * LE PASSAGE PAR LE TIERS, refusé à la création d'un abonnement.
 *
 * Un abonnement est un contrat récurrent : il a par construction une
 * contrepartie nommée, qui reviendra à chaque échéance. Le laisser solder une
 * charge directement en trésorerie, c'est fabriquer douze écritures par an
 * dont aucune ne dit à qui l'on paie. SYCEBNL, Partie 3, ch. 3, § 2.2 et 2.4.
 */
describe('abonnement · contrepartie de la charge', () => {
  const compte = (id: string, numero: string) => ({ id, numero, intitule: `Compte ${numero}` });

  function service(debit: { id: string; numero: string }, credit: { id: string; numero: string }) {
    const prisma = {
      modeleAbonnement: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j', code: 'OD' }) },
      compte: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === debit.id ? debit : credit),
        ),
      },
    };
    return { svc: new RegularisationService(prisma as never, {} as never), prisma };
  }

  const dto = {
    code: 'LOYER',
    intitule: 'Loyer du siège',
    journalId: 'j',
    compteDebitId: 'd',
    compteCreditId: 'c',
    periodicite: PeriodiciteAbonnement.MENSUELLE,
    dateDebut: '2026-01-01',
    dateFin: '2026-12-31',
    montant: 300_000,
  };

  it('refuse D/622 par C/521, le cas relevé sur les abonnements', async () => {
    const { svc } = service(compte('d', '62210000'), compte('c', '52110000'));
    await expect(svc.creerAbonnement('t', 'u', dto as never)).rejects.toThrow(/directement sur la trésorerie/);
  });

  it('nomme la voie à suivre dans le message, pas seulement le refus', async () => {
    const { svc } = service(compte('d', '62210000'), compte('c', '57100000'));
    await expect(svc.creerAbonnement('t', 'u', dto as never)).rejects.toThrow(/compte fournisseur \(40\)/);
  });

  it('accepte le schéma du référentiel : la charge contre le tiers', async () => {
    const { svc, prisma } = service(compte('d', '62210000'), compte('c', '40110000'));
    prisma.modeleAbonnement.create.mockResolvedValue({ id: 'a' });
    await svc.creerAbonnement('t', 'u', dto as never);
    expect(prisma.modeleAbonnement.create).toHaveBeenCalled();
  });

  it('laisse intacts les abonnements qui ne portent aucune charge', async () => {
    // Une régularisation d'actif (486 charges constatées d'avance contre 401)
    // n'est pas concernée : le débit n'est pas une charge.
    const { svc, prisma } = service(compte('d', '48600000'), compte('c', '52110000'));
    prisma.modeleAbonnement.create.mockResolvedValue({ id: 'a' });
    await svc.creerAbonnement('t', 'u', dto as never);
    expect(prisma.modeleAbonnement.create).toHaveBeenCalled();
  });
});
