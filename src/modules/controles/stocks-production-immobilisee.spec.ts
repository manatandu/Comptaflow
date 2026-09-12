import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * STOCKS ET PRODUCTION IMMOBILISÉE · ce qui a une signature, et ce qui n'en a
 * pas.
 *
 * Le § 8.2 du séminaire CPCC nomme deux minorations « par absence d'une
 * écriture de contrepartie » : la facture d'achat enregistrée sans
 * constatation du stock en cours de route, et la production immobilisée
 * jamais activée au compte 72. Les deux sont réelles, et aucune des deux ne se
 * détecte SOUS CETTE FORME · elles se définissent par ce qui manque.
 * « Solde du 72 égal à zéro » se vérifie chez toute entité qui achète au lieu
 * de produire, c'est-à-dire presque partout, et un contrôle qui s'allume
 * partout n'apprend qu'une chose : à être ignoré. Le DERNIER bloc de ce
 * fichier fige cette abstention.
 *
 * Ce qui est codé est l'autre moitié · non pas l'absence du compte, mais sa
 * PRÉSENCE SANS SA CONTREPARTIE. Là, le dossier a écrit quelque chose, et ce
 * qu'il a écrit ne boucle pas.
 *
 * ET LE PÉRIMÈTRE N'EST PAS LE MÊME DES DEUX CÔTÉS. Le stock en cours de route
 * est au 38 en SYSCOHADA et au 37 en SYCEBNL ; le numéro libéré porte autre
 * chose dans chaque plan (37 = produits intermédiaires en SYSCOHADA, 38 = dons
 * en nature H.A.O. en SYCEBNL). Signaler « le 38 » sans regarder le
 * référentiel accuserait une association d'avoir mal comptabilisé ses dons.
 */

const ligne = (numero: string, intitule: string, debit: number, credit = 0, exerciceId = 'ex') => ({
  debit,
  credit,
  compte: { numero, intitule },
  ecriture: { exerciceId },
});

type Ligne = ReturnType<typeof ligne>;

function service(lignes: Ligne[], referentiel: Referentiel) {
  const courant = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
  const precedent = { id: 'exN1', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockImplementation((args: { where?: { dateFin?: { lt?: Date } } }) =>
        args?.where?.dateFin?.lt ? Promise.resolve(precedent) : Promise.resolve(courant),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    // Mandat du contrôleur des comptes · contrôle 28. Vide ici, ces specs ne
    // le testent pas ; une doublure muette sur une lecture réelle validerait
    // un service qui n'existe pas.
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const trouver = async (code: string, lignes: Ligne[], referentiel: Referentiel = Referentiel.SYSCOHADA) => {
  const rapport = await service(lignes, referentiel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === code);
};

/** Un stock en cours de route mouvementé, avec sa contrepartie au 603. */
const stockEnRouteBoucle = (racine: string) => [
  ligne(`${racine}100000`, 'Marchandises en cours de route', 5_000_000),
  ligne('60310000', 'Variations des stocks de marchandises', 0, 5_000_000),
];

describe('dépréciation de stocks · la nomenclature est fermée, et pas la même', () => {
  it('accepte le 398 en SYSCOHADA', async () => {
    const a = await trouver('DEPRECIATION_STOCK_HORS_NOMENCLATURE', [
      ...stockEnRouteBoucle('38'),
      ligne('39800000', 'Dépréciations des stocks en cours de route', 0, 400_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('refuse le 398 en SYCEBNL, dont le plan ne l’ouvre pas', async () => {
    const a = await trouver(
      'DEPRECIATION_STOCK_HORS_NOMENCLATURE',
      [
        ...stockEnRouteBoucle('37'),
        ligne('39800000', 'Dépréciations des stocks en cours de route', 0, 400_000),
      ],
      Referentiel.SYCEBNL,
    );
    expect(a).toBeDefined();
    expect(a!.occurrences[0].reference).toBe('39800000');
    // Le message nomme les cinq subdivisions du plan, pas les huit de l'autre.
    expect(a!.consequence).toContain('391, 392, 393, 396, 397');
  });

  it('refuse le 394 et le 395 en SYCEBNL, absents de son compte 39', async () => {
    for (const numero of ['39400000', '39500000']) {
      const a = await trouver(
        'DEPRECIATION_STOCK_HORS_NOMENCLATURE',
        [...stockEnRouteBoucle('37'), ligne(numero, 'Dépréciation', 0, 100_000)],
        Referentiel.SYCEBNL,
      );
      expect({ numero, signale: Boolean(a) }).toEqual({ numero, signale: true });
    }
  });

  it('les accepte en SYSCOHADA, qui les ouvre', async () => {
    for (const numero of ['39400000', '39500000']) {
      const a = await trouver('DEPRECIATION_STOCK_HORS_NOMENCLATURE', [
        ...stockEnRouteBoucle('38'),
        ligne(numero, 'Dépréciation', 0, 100_000),
        ligne('34100000', 'Produits en cours', 900_000),
        ligne('35100000', 'Services en cours', 900_000),
      ]);
      expect({ numero, signale: Boolean(a) }).toEqual({ numero, signale: false });
    }
  });
});

describe('une dépréciation sans le poste qu’elle déduit', () => {
  it('signale un 391 créditeur quand le 31 est à zéro', async () => {
    const a = await trouver('DEPRECIATION_STOCK_SANS_STOCK', [
      ...stockEnRouteBoucle('38'),
      ligne('39100000', 'Dépréciations des stocks de marchandises', 0, 750_000),
    ]);
    expect(a).toBeDefined();
    expect(a!.occurrences[0].montant).toBe(750_000);
    expect(a!.occurrences[0].detail).toContain('31');
    expect(a!.consequence).toContain('DÉDUCTION');
  });

  it('se tait dès que le stock adossé porte un solde', async () => {
    const a = await trouver('DEPRECIATION_STOCK_SANS_STOCK', [
      ...stockEnRouteBoucle('38'),
      ligne('31100000', 'Marchandises', 12_000_000),
      ligne('39100000', 'Dépréciations des stocks de marchandises', 0, 750_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('rapproche 39X de 3X, et le fait des deux côtés malgré le sens différent du 397', async () => {
    // Au SYSCOHADA le 397 déprécie les produits intermédiaires ; au SYCEBNL il
    // déprécie les stocks en cours de route. Le rapprochement 397 → 37 vaut
    // dans les deux plans · c'est l'INTITULÉ qui change, pas le numéro.
    for (const referentiel of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      const racine = referentiel === Referentiel.SYSCOHADA ? '38' : '37';
      const a = await trouver(
        'DEPRECIATION_STOCK_SANS_STOCK',
        [...stockEnRouteBoucle(racine), ligne('39700000', 'Dépréciation', 0, 300_000)],
        referentiel,
      );
      // En SYCEBNL le 37 porte le stock en cours de route, mouvementé ci-dessus ·
      // la dépréciation a son poste. En SYSCOHADA le 37 est vide.
      expect({ referentiel, signale: Boolean(a) }).toEqual({
        referentiel,
        signale: referentiel === Referentiel.SYSCOHADA,
      });
    }
  });

  it('ne signale pas une dépréciation débitrice · c’est une reprise', async () => {
    const a = await trouver('DEPRECIATION_STOCK_SANS_STOCK', [
      ...stockEnRouteBoucle('38'),
      ligne('39100000', 'Dépréciations des stocks de marchandises', 750_000),
    ]);
    expect(a).toBeUndefined();
  });
});

describe('stock en cours de route sans variation de stock', () => {
  it('signale le 38 en SYSCOHADA quand aucun 603 n’a bougé', async () => {
    const a = await trouver('STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION', [
      ligne('38100000', 'Marchandises en cours de route', 5_000_000),
    ]);
    expect(a).toBeDefined();
    expect(a!.occurrences[0].montant).toBe(5_000_000);
    expect(a!.occurrences[0].reference).toMatch(/^38 /);
  });

  it('signale le 37 en SYCEBNL, et jamais le 38, qui y porte les dons en nature H.A.O.', async () => {
    const surLe37 = await trouver(
      'STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION',
      [ligne('37100000', 'Biens liés à l’activité en cours de route', 5_000_000)],
      Referentiel.SYCEBNL,
    );
    expect(surLe37).toBeDefined();
    expect(surLe37!.occurrences[0].reference).toMatch(/^37 /);

    const surLe38 = await trouver(
      'STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION',
      [ligne('38100000', 'Dons en nature HAO non affectés', 5_000_000)],
      Referentiel.SYCEBNL,
    );
    // Le signaler accuserait une association d'avoir mal comptabilisé ses dons.
    expect(surLe38).toBeUndefined();
  });

  it('ne signale pas le 37 en SYSCOHADA, qui y porte les produits intermédiaires', async () => {
    const a = await trouver('STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION', [
      ligne('37100000', 'Produits intermédiaires', 5_000_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('se tait dès qu’une variation de stock a été passée', async () => {
    const a = await trouver('STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION', stockEnRouteBoucle('38'));
    expect(a).toBeUndefined();
  });
});

describe('production immobilisée sans immobilisation', () => {
  it('signale un 72 crédité quand aucun 21, 23 ou 24 n’a été débité', async () => {
    const a = await trouver('PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION', [
      ...stockEnRouteBoucle('38'),
      ligne('72200000', 'Immobilisations corporelles', 0, 18_000_000),
    ]);
    expect(a).toBeDefined();
    expect(a!.occurrences[0].montant).toBe(18_000_000);
    expect(a!.consequence).toContain('PAR LE DÉBIT');
  });

  it('se tait dès qu’une immobilisation est entrée · 21, 23 ou 24', async () => {
    for (const racine of ['21', '23', '24']) {
      const a = await trouver('PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION', [
        ...stockEnRouteBoucle('38'),
        ligne('72200000', 'Immobilisations corporelles', 0, 18_000_000),
        ligne(`${racine}100000`, 'Immobilisation produite', 18_000_000),
      ]);
      expect({ racine, signale: Boolean(a) }).toEqual({ racine, signale: false });
    }
  });

  it('vaut pour les deux référentiels · le compte 72 est identique des deux côtés', async () => {
    for (const referentiel of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      const racine = referentiel === Referentiel.SYSCOHADA ? '38' : '37';
      const a = await trouver(
        'PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION',
        [...stockEnRouteBoucle(racine), ligne('72100000', 'Immobilisations incorporelles', 0, 4_000_000)],
        referentiel,
      );
      expect({ referentiel, signale: Boolean(a) }).toEqual({ referentiel, signale: true });
    }
  });

  it('ne signale pas un 72 débité · c’est le solde de fin d’exercice au 13', async () => {
    const a = await trouver('PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION', [
      ...stockEnRouteBoucle('38'),
      ligne('72200000', 'Immobilisations corporelles', 18_000_000),
    ]);
    expect(a).toBeUndefined();
  });
});

describe('ce que le module refuse de signaler', () => {
  it('ne dit rien d’un dossier qui n’a ni stock en cours de route ni production immobilisée', async () => {
    // C'EST LE TEST CENTRAL. Le grief du CPCC est réel et son critère ne
    // l'est pas : « solde du 72 égal à zéro » se vérifie chez toute entité
    // qui achète au lieu de produire. Le coder aurait allumé un avertissement
    // sur la quasi-totalité des dossiers, et emporté les vrais signalements
    // avec lui.
    const rapport = await service(
      [
        ligne('60100000', 'Achats de marchandises', 40_000_000),
        ligne('40100000', 'Fournisseurs', 0, 40_000_000),
      ],
      Referentiel.SYSCOHADA,
    ).analyser('t', 'ex');
    const codes = rapport.anomalies.map((a) => a.code);
    expect(codes).not.toContain('PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION');
    expect(codes).not.toContain('STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION');
    expect(codes).not.toContain('DEPRECIATION_STOCK_SANS_STOCK');
  });

  it('ne porte aucun critère fondé sur l’absence pure du compte 72', () => {
    const source = readFileSync(join(__dirname, 'controles.service.ts'), 'utf8');
    // Un contrôle qui s'allumerait sur un 72 à zéro. La forme exacte compte
    // peu · ce qui compte est qu'aucune comparaison de ce genre n'apparaisse
    // dans le voisinage du code du contrôle.
    const bloc = source.slice(
      source.indexOf('PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION'),
      source.indexOf('const ordre: Record<Gravite, number>'),
    );
    expect(bloc).not.toMatch(/productionImmobilisee\.credit\s*<=/);
    expect(bloc).not.toMatch(/productionImmobilisee[^\n]*===\s*0/);
  });
});
