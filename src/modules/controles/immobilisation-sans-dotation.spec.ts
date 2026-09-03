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
  dateMiseEnService: Date;
  valeurOrigine: number;
  valeurResiduelle: number;
  amortissementAnterieur: number;
  dotations: Array<{ exerciceId: string; montant: number }>;
};

const bien = (p: Partial<Immo> & { designation: string }): Immo => ({
  dateMiseEnService: new Date('2024-03-01'),
  valeurOrigine: 1_000_000,
  valeurResiduelle: 0,
  amortissementAnterieur: 0,
  dotations: [],
  ...p,
});

function service(immobilisations: Immo[]) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't' }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 21 lit le manuel des procédures (AUDCIF art. 16 al. 1) ·
    // sans ce faux, il croirait la table absente plutôt que le manuel.
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Le contrôle 12 (bien repris sans amortissement antérieur) interroge la
    // même table · il filtre sur dateMiseEnService < ouverture du dossier, que
    // ce faux ignore. Ses signalements éventuels ne gênent pas : on ne lit ici
    // que le code IMMO_SANS_DOTATION.
    immobilisation: { findMany: jest.fn().mockResolvedValue(immobilisations) },
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
});
