import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * « LA CONSTATATION DE LA DOTATION AUX AMORTISSEMENTS D'UNE IMMOBILISATION
 * AMORTISSABLE EST OBLIGATOIRE MÊME EN CAS D'ABSENCE OU D'INSUFFISANCE DE
 * BÉNÉFICE » · AUDCIF art. 45, dernier alinéa. L'article n'est pas dans la
 * liste d'exclusion de l'art. 3 du SYCEBNL, dont la fiche du COMPTE 28 dit la
 * même chose : la règle vaut des deux côtés.
 *
 * CE QUE RIEN NE VOYAIT. Une immobilisation dont la dotation n'est pas passée
 * laisse le résultat surévalué du montant non doté et la valeur nette
 * comptable à la valeur brute. Aucun total ne bouge : les écritures
 * s'équilibrent, la balance boucle, le bilan boucle. Et la clôture rend
 * l'oubli irréparable, l'exercice n'acceptant plus aucune écriture.
 *
 * Le contrôle doit signaler ce cas SANS crier à tort sur les trois situations
 * où l'absence de dotation est normale : le bien pas encore en service, le
 * bien intégralement amorti, et le bien dont la dotation a bien été passée.
 */

type Immo = {
  designation: string;
  dateMiseEnService: Date | null;
  valeurOrigine: number;
  valeurResiduelle: number;
  amortissementAnterieur: number;
  dotations: Array<{ exerciceId: string; montant: number }>;
  compteImmobilisation: { numero: string };
};

const bien = (p: Partial<Immo> & { designation: string }): Immo => ({
  dateMiseEnService: new Date('2024-03-01'),
  valeurOrigine: 1_000_000,
  valeurResiduelle: 0,
  amortissementAnterieur: 0,
  dotations: [],
  compteImmobilisation: { numero: '24410000' },
  ...p,
});

// La doublure HONORE le filtre de date avec la sémantique SQL · une date
// nulle ne satisfait jamais `lt`/`lte`, et `not: null` l'écarte. Une doublure
// qui rendrait tout ce qu'on lui donne validerait un service qui laisserait
// passer le bien jamais mis en service.
type FiltreDate = { not?: null; lt?: Date; lte?: Date } | undefined;
function passeFiltreDate(d: Date | null, f: FiltreDate): boolean {
  if (!f) return true;
  if ('not' in f && f.not === null && d === null) return false;
  if (f.lt !== undefined && (d === null || !(d < f.lt))) return false;
  if (f.lte !== undefined && (d === null || !(d <= f.lte))) return false;
  return true;
}

function service(
  immobilisations: Immo[],
  referentiel: 'SYCEBNL' | 'SYSCOHADA' = 'SYSCOHADA',
  jeuEtatsFinanciersSycebnl: string | null = null,
) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel, jeuEtatsFinanciersSycebnl }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
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
    // Le contrôle 12 (bien repris sans amortissement antérieur) interroge la
    // même table, filtrée sur dateMiseEnService < ouverture du dossier.
    immobilisation: {
      findMany: jest.fn(async (args: { where?: { dateMiseEnService?: FiltreDate } }) =>
        immobilisations.filter((i) => passeFiltreDate(i.dateMiseEnService, args?.where?.dateMiseEnService)),
      ),
    },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const signale = async (immobilisations: Immo[]) => {
  const rapport = await service(immobilisations).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'IMMO_SANS_DOTATION');
};

describe('immobilisation amortissable sans dotation sur l’exercice', () => {
  it('signale le bien en service dont la dotation n’a pas été passée', async () => {
    const a = await signale([bien({ designation: 'Véhicule de service' })]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences).toHaveLength(1);
    expect(a!.occurrences[0].reference).toBe('Véhicule de service');
    // La conséquence doit dire ce qui est faux, pas seulement ce qui manque ·
    // un avertissement qu'on ne comprend pas est un avertissement qu'on ignore.
    expect(a!.consequence).toContain('résultat est surévalué');
    expect(a!.consequence).toContain('art. 45');
  });

  it('se tait quand la dotation de l’exercice a été passée', async () => {
    const a = await signale([
      bien({ designation: 'Véhicule', dotations: [{ exerciceId: 'ex', montant: 200_000 }] }),
    ]);
    expect(a).toBeUndefined();
  });

  it('se tait sur un bien intégralement amorti', async () => {
    // Plus rien à doter · l'absence de dotation y est la situation normale.
    const a = await signale([
      bien({ designation: 'Ordinateur de 2020', amortissementAnterieur: 1_000_000 }),
    ]);
    expect(a).toBeUndefined();
  });

  it('se tait sur un bien amorti jusqu’à sa valeur résiduelle', async () => {
    // Le montant amortissable est la valeur d'entrée MOINS la valeur
    // résiduelle prévisionnelle (art. 45) · pas la valeur d'entrée entière.
    const a = await signale([
      bien({
        designation: 'Camion',
        valeurOrigine: 1_000_000,
        valeurResiduelle: 200_000,
        amortissementAnterieur: 800_000,
      }),
    ]);
    expect(a).toBeUndefined();
  });

  it('signale encore un bien qui n’est amorti qu’en partie', async () => {
    const a = await signale([
      bien({ designation: 'Camion', valeurResiduelle: 200_000, amortissementAnterieur: 500_000 }),
    ]);
    expect(a).toBeDefined();
  });

  it('cite chaque bien concerné, pas seulement leur nombre', async () => {
    const a = await signale([
      bien({ designation: 'Véhicule' }),
      bien({ designation: 'Mobilier' }),
      bien({ designation: 'Ordinateur', dotations: [{ exerciceId: 'ex', montant: 1 }] }),
    ]);
    expect(a!.occurrences.map((o) => o.reference)).toEqual(['Véhicule', 'Mobilier']);
  });

  it('se tait sur un bien acquis et jamais mis en service (AUDCIF art. 45)', async () => {
    // L'amortissement court de la mise en état de fonctionner · un bien sans
    // date de mise en service n'a rien à doter, et le lui reprocher serait un
    // signalement faux.
    const a = await signale([bien({ designation: 'Groupe électrogène en caisse', dateMiseEnService: null })]);
    expect(a).toBeUndefined();
  });

  it('le contrôle 12 ne réclame pas d\'antérieur à un bien jamais mis en service', async () => {
    // Le bien de 2024 SERT DE TÉMOIN · il est bien signalé, si bien que le
    // silence sur l'autre n'est pas celui d'un contrôle qui ne tourne pas.
    const rapport = await service([
      bien({ designation: 'Groupe électrogène en caisse', dateMiseEnService: null }),
      bien({ designation: 'Véhicule repris', dateMiseEnService: new Date('2024-03-01') }),
    ]).analyser('t', 'ex');
    const repris = rapport.anomalies.find((x) => x.code === 'IMMO_REPRISE_SANS_ANTERIEUR');
    expect(repris!.occurrences.map((o) => o.reference)).toEqual(['Véhicule repris']);
  });

  // PASSES R1-A1 ET R5-B1 · « Immobilisation AMORTISSABLE ». Le bien que le
  // plan ne fait pas amortir n'a ni dotation à passer ni antérieur à
  // reprendre · les deux contrôles lisent la règle du module. Le véhicule sert
  // de TÉMOIN, pour que le silence ne soit pas celui d'un contrôle muet.
  const nonAmortissables: Array<[string, 'SYCEBNL' | 'SYSCOHADA', string]> = [
    ['Terrain nu', 'SYSCOHADA', '22210000'],
    ['Titres de participation', 'SYSCOHADA', '26110000'],
    ['Dépôt et cautionnement', 'SYCEBNL', '27500000'],
    ['Bien reçu en don destiné à la vente', 'SYCEBNL', '20300000'],
  ];
  for (const [designation, referentiel, numero] of nonAmortissables) {
    it(`${referentiel} · ni dotation ni antérieur réclamés sur « ${designation} » (${numero})`, async () => {
      const rapport = await service(
        [bien({ designation, compteImmobilisation: { numero } }), bien({ designation: 'Véhicule' })],
        referentiel,
      ).analyser('t', 'ex');
      const sans = rapport.anomalies.find((x) => x.code === 'IMMO_SANS_DOTATION')!;
      const repris = rapport.anomalies.find((x) => x.code === 'IMMO_REPRISE_SANS_ANTERIEUR')!;
      expect(sans.occurrences.map((o) => o.reference)).toEqual(['Véhicule']);
      expect(repris.occurrences.map((o) => o.reference)).toEqual(['Véhicule']);
    });
  }

  it('l’usufruit temporaire (2011) s’amortit, et reste réclamé au SYCEBNL', async () => {
    const a = await service(
      [bien({ designation: 'Usufruit temporaire', compteImmobilisation: { numero: '20110000' } })],
      'SYCEBNL',
    ).analyser('t', 'ex');
    expect(a.anomalies.find((x) => x.code === 'IMMO_SANS_DOTATION')!.occurrences[0].reference).toBe('Usufruit temporaire');
  });
});

/**
 * UN PROJET DE DÉVELOPPEMENT N'AMORTIT RIEN · Acte uniforme SYCEBNL, art. 7
 * et 9 (« les charges sans amortissement, ni dépréciation »), décision D-1 du
 * 2026-10-01. Lui réclamer une dotation, ou un amortissement antérieur repris,
 * serait un contrôle qui fabrique une anomalie (§ 10 bis).
 */
describe('projet de développement · aucun des deux contrôles d’amortissement', () => {
  const projet = (immos: Immo[]) =>
    service(immos, 'SYCEBNL', 'PROJETS_DEVELOPPEMENT').analyser('t', 'ex');

  it('se tait sur un bien du projet sans dotation', async () => {
    const r = await projet([bien({ designation: 'Véhicule du projet' })]);
    expect(r.anomalies.find((a) => a.code === 'IMMO_SANS_DOTATION')).toBeUndefined();
  });

  it('se tait sur un bien du projet mis en service avant le dossier', async () => {
    const r = await projet([bien({ designation: 'Groupe électrogène', dateMiseEnService: new Date('2020-01-01') })]);
    expect(r.anomalies.find((a) => a.code === 'IMMO_REPRISE_SANS_ANTERIEUR')).toBeUndefined();
  });

  it('une association du même référentiel reste signalée', async () => {
    const r = await service([bien({ designation: 'Véhicule' })], 'SYCEBNL', 'ASSOCIATIONS_ORDRES_PROFESSIONNELS').analyser('t', 'ex');
    expect(r.anomalies.find((a) => a.code === 'IMMO_SANS_DOTATION')).toBeDefined();
  });
});
