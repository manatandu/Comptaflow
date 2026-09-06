import { PeriodiciteAbonnement, Referentiel, TypeRegularisation } from '@prisma/client';
import { RegularisationService, dateReprise } from './regularisation.service';

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

  function service(
    debit: { id: string; numero: string },
    credit: { id: string; numero: string },
    referentiel = 'SYCEBNL',
  ) {
    const prisma = {
      modeleAbonnement: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j', code: 'OD' }) },
      // Le message de refus cite l'article du référentiel du dossier · voir
      // le test « cite le texte du dossier » plus bas.
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
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

/**
 * CHARGES À PAYER ET PRODUITS À RECEVOIR · l'autre moitié du rattachement.
 *
 * Trois défauts, tous silencieux, tous équilibrés :
 *
 *  1. LE PRORATA APPLIQUÉ À UNE CHARGE À PAYER. Une charge constatée d'avance
 *     est déjà comptabilisée et déborde ; une charge à payer n'est PAS
 *     comptabilisée et appartient entièrement à l'exercice. Proratisée, elle
 *     serait réduite à la fraction qui déborde la clôture · le plus souvent
 *     ZÉRO, puisque sa période se termine avant. La charge disparaîtrait du
 *     résultat, l'écriture s'équilibrerait, la balance boucherait.
 *  2. LE SENS INVERSÉ. Sur une charge constatée d'avance on CRÉDITE le compte
 *     de charge pour l'en retirer ; sur une charge à payer on le DÉBITE pour
 *     l'inscrire. Servir l'un pour l'autre améliore le résultat au lieu de le
 *     grever : deux fois le montant d'erreur.
 *  3. LE 4181, QUI NE VEUT PAS DIRE LA MÊME CHOSE DES DEUX CÔTÉS. Le
 *     SYSCOHADA y loge « Clients, factures à établir » ; le SYCEBNL y loge
 *     « Adhérents, APPELS DE FONDS à établir » et met les factures à établir
 *     au 4182. Une facture à établir rangée au 4181 dans une association
 *     devient une créance de cotisations sur des adhérents qui ne doivent
 *     rien.
 */
describe('Rattachement · le compte dépend de la nature du tiers ET du référentiel', () => {
  const CAP = TypeRegularisation.CHARGE_A_PAYER;
  const PAR = TypeRegularisation.PRODUIT_A_RECEVOIR;

  it('le 4181 du SYSCOHADA est la facture à établir · celui du SYCEBNL est l’appel de fonds', () => {
    expect(RegularisationService.compteRattachement(Referentiel.SYSCOHADA, 'CLIENTS', PAR).racine).toBe('4181');
    expect(RegularisationService.compteRattachement(Referentiel.SYCEBNL, 'CLIENTS', PAR).racine).toBe('4182');
  });

  it('les trois rattachements identiques le restent · personnel, organismes sociaux, État', () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      expect(RegularisationService.compteRattachement(referentiel, 'PERSONNEL', CAP).racine).toBe('4286');
      expect(RegularisationService.compteRattachement(referentiel, 'PERSONNEL', PAR).racine).toBe('4287');
      expect(RegularisationService.compteRattachement(referentiel, 'ORGANISMES_SOCIAUX', CAP).racine).toBe('4386');
      expect(RegularisationService.compteRattachement(referentiel, 'ORGANISMES_SOCIAUX', PAR).racine).toBe('4387');
      expect(RegularisationService.compteRattachement(referentiel, 'ETAT', CAP).racine).toBe('4486');
      expect(RegularisationService.compteRattachement(referentiel, 'ETAT', PAR).racine).toBe('4487');
    }
  });

  it('une charge à payer sur fournisseur va au 408, des deux côtés', () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      expect(RegularisationService.compteRattachement(referentiel, 'FOURNISSEURS', CAP).racine).toBe('4081');
    }
  });

  it('refuse un produit à recevoir sur un fournisseur · le plan n’y prévoit aucun sous-compte', () => {
    expect(() => RegularisationService.compteRattachement(Referentiel.SYSCOHADA, 'FOURNISSEURS', PAR)).toThrow(
      /créance sur fournisseur/,
    );
  });

  it('refuse une charge à payer sur un client · une somme due à un client est une dette envers lui', () => {
    expect(() => RegularisationService.compteRattachement(Referentiel.SYCEBNL, 'CLIENTS', CAP)).toThrow(
      /dette envers un client/,
    );
  });

  it('aucun compte de rattachement ne sort de la classe 4', () => {
    const natures = ['FOURNISSEURS', 'CLIENTS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'] as const;
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      for (const nature of natures) {
        for (const type of [CAP, PAR]) {
          let racine: string | null = null;
          try {
            racine = RegularisationService.compteRattachement(referentiel, nature, type).racine;
          } catch {
            continue; // le couple est refusé, c'est le sujet d'un autre test
          }
          expect(racine.startsWith('4')).toBe(true);
        }
      }
    }
  });
});

describe('Rattachement · il ne se proratise pas', () => {
  it('le montant rattaché est le montant total · la charge est de cet exercice tout entière', () => {
    expect(RegularisationService.montantRattache(TypeRegularisation.CHARGE_A_PAYER, 1_234_567.891)).toBe(1_234_567.89);
  });

  it('même quand la période se termine bien avant la clôture · c’est là que le prorata rendrait ZÉRO', () => {
    // Une prestation de novembre facturée en février : le prorata de la part
    // qui déborde le 31 décembre vaut zéro, et la charge s'évanouirait.
    expect(
      RegularisationService.prorataDiffere(900_000, d('2026-11-01'), d('2026-11-30'), d('2026-12-31')),
    ).toBe(0);
    expect(RegularisationService.montantRattache(TypeRegularisation.CHARGE_A_PAYER, 900_000)).toBe(900_000);
  });
});

describe('Rattachement · la contre-passation est à l’ouverture, des deux côtés', () => {
  const cible = { dateDebut: d('2027-01-01'), dateFin: d('2027-12-31') };

  it('une charge à payer s’extourne à l’ouverture même en SYCEBNL, où une quote-part se reprend à la clôture', () => {
    // Les deux textes emploient la même phrase dans la fiche de leurs comptes
    // 40 et 41 : « À l'ouverture de l'exercice, ces écritures sont
    // contre-passées ». Le référentiel n'a pas son mot à dire ici, alors qu'il
    // l'a pour une quote-part de 476/477.
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      expect(dateReprise(referentiel, TypeRegularisation.CHARGE_A_PAYER, cible)).toEqual(cible.dateDebut);
      expect(dateReprise(referentiel, TypeRegularisation.PRODUIT_A_RECEVOIR, cible)).toEqual(cible.dateDebut);
    }
  });

  it('la règle du 476/477 n’est pas touchée · le SYCEBNL reprend toujours à la clôture', () => {
    expect(dateReprise(Referentiel.SYCEBNL, TypeRegularisation.CHARGE_CONSTATEE_AVANCE, cible)).toEqual(cible.dateFin);
    expect(dateReprise(Referentiel.SYSCOHADA, TypeRegularisation.CHARGE_CONSTATEE_AVANCE, cible)).toEqual(
      cible.dateDebut,
    );
    expect(dateReprise(Referentiel.SYSCOHADA, TypeRegularisation.SUBVENTION_PLURIANNUELLE, cible)).toEqual(
      cible.dateFin,
    );
  });
});

describe('Rattachement · le sens s’inverse entre l’étalement et le rattachement', () => {
  it('une charge constatée d’avance CRÉDITE le 6x, une charge à payer le DÉBITE', () => {
    // Le premier retire une charge déjà comptabilisée ; le second inscrit une
    // charge qui n'est nulle part. Servir l'un pour l'autre améliorerait le
    // résultat au lieu de le grever · deux fois le montant d'erreur, sur une
    // écriture parfaitement équilibrée.
    expect(RegularisationService.debiteLeCompteDeGestion(TypeRegularisation.CHARGE_CONSTATEE_AVANCE)).toBe(false);
    expect(RegularisationService.debiteLeCompteDeGestion(TypeRegularisation.CHARGE_A_PAYER)).toBe(true);
  });

  it('un produit constaté d’avance DÉBITE le 7x, un produit à recevoir le CRÉDITE', () => {
    expect(RegularisationService.debiteLeCompteDeGestion(TypeRegularisation.PRODUIT_CONSTATE_AVANCE)).toBe(true);
    expect(RegularisationService.debiteLeCompteDeGestion(TypeRegularisation.PRODUIT_A_RECEVOIR)).toBe(false);
  });

  it('la subvention pluriannuelle garde le sens du produit constaté d’avance', () => {
    expect(RegularisationService.debiteLeCompteDeGestion(TypeRegularisation.SUBVENTION_PLURIANNUELLE)).toBe(true);
  });

  it('les cinq types sont couverts · un type ajouté sans décider de son sens fait tomber ce test', () => {
    const tous = Object.values(TypeRegularisation);
    expect(tous).toHaveLength(5);
    for (const type of tous) expect(typeof RegularisationService.debiteLeCompteDeGestion(type)).toBe('boolean');
  });
});
