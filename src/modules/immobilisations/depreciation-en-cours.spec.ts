import { Referentiel, SensDepreciation } from '@prisma/client';
import {
  avertissementDepreciationEnCours,
  cumulsParCompte29,
  estCompteDepreciationEnCours,
  motifRefusCompte29DuBien,
} from './depreciation-en-cours';
import { ImmobilisationService } from './immobilisation.service';
import type { PrismaService } from '../../common/prisma.service';
import type { EcritureService } from '../comptabilite/ecriture.service';

/*
  LIGNE A22 · la dépréciation d'un bien en cours (2919, 2929, 2939, 2949) et
  son sort à la mise en service. Les fiches du compte 29 des deux textes ne
  connaissent que la dotation et la reprise · aucun virement n'est inventé ;
  un bien garde UN compte 29 tant qu'une dépréciation est en place ; au
  SYSCOHADA, la première dotation suit le compte où le bien est inscrit à la
  clôture (Titre VII ch. 2).
*/

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('les comptes 29x9', () => {
  it('2919, 2929, 2939, 2949 et leurs subdivisions déprécient un en-cours, pas le 2931 ni le 2959', () => {
    for (const n of ['29190000', '29290000', '29390000', '29490000', '29391000']) expect(estCompteDepreciationEnCours(n)).toBe(true);
    for (const n of ['29310000', '29410000', '29590000', '29690000']) expect(estCompteDepreciationEnCours(n)).toBe(false);
  });
});

describe('cumul porté par chaque compte 29', () => {
  it('dotations moins reprises, compte par compte, les comptes soldés écartés', () => {
    const c = cumulsParCompte29([
      { sens: 'DOTATION', montant: 1_000_000, compteDepreciationId: 'a' },
      { sens: 'REPRISE', montant: 400_000, compteDepreciationId: 'a' },
      { sens: 'DOTATION', montant: 300_000, compteDepreciationId: 'b' },
      { sens: 'REPRISE', montant: 300_000, compteDepreciationId: 'b' },
    ]);
    expect([...c.entries()]).toEqual([['a', 600_000]]);
  });
});

describe('un bien, un compte 29', () => {
  const numeros = new Map([
    ['c2939', '29390000'],
    ['c2931', '29310000'],
  ]);

  it('une reprise au 2931 d’une dépréciation dotée au 2939 est refusée · le 2931 deviendrait débiteur', () => {
    const motif = motifRefusCompte29DuBien({
      syscohada: true,
      compteChoisi: { id: 'c2931', numero: '29310000' },
      cumuls: new Map([['c2939', 500_000]]),
      numeros,
      inscritEnCours: false,
    });
    expect(motif).toMatch(/inscrite au 29390000 \(500000\.00\)/);
    expect(motif).toMatch(/aucun texte ne la vire/);
  });

  it('le compte qui porte la dépréciation reste admis, même après la mise en service (le 2939 d’un bien achevé)', () => {
    expect(
      motifRefusCompte29DuBien({
        syscohada: true,
        compteChoisi: { id: 'c2939', numero: '29390000' },
        cumuls: new Map([['c2939', 500_000]]),
        numeros,
        inscritEnCours: false,
      }),
    ).toBeNull();
  });

  it('SYCEBNL aussi · la règle tient à la fiche du compte 29, pas à la division', () => {
    expect(
      motifRefusCompte29DuBien({
        syscohada: false,
        compteChoisi: { id: 'c2931', numero: '29310000' },
        cumuls: new Map([['c2939', 500_000]]),
        numeros,
        inscritEnCours: false,
      }),
    ).toMatch(/inscrite au 29390000/);
  });

  it('un historique déjà réparti n’enferme pas · l’un des comptes qui portent reste admis', () => {
    const cumuls = new Map([
      ['c2939', 500_000],
      ['c2931', 200_000],
    ]);
    expect(motifRefusCompte29DuBien({ syscohada: true, compteChoisi: { id: 'c2931', numero: '29310000' }, cumuls, numeros, inscritEnCours: false })).toBeNull();
    expect(
      motifRefusCompte29DuBien({ syscohada: true, compteChoisi: { id: 'c2938', numero: '29380000' }, cumuls, numeros, inscritEnCours: false }),
    ).toMatch(/plusieurs comptes/);
  });
});

describe('la première dotation suit le compte où le bien est inscrit (SYSCOHADA, Titre VII ch. 2)', () => {
  const vide = new Map<string, number>();
  const aucun = new Map<string, string>();

  it('un bien au 239 se déprécie au 2939, jamais au 2931', () => {
    expect(
      motifRefusCompte29DuBien({ syscohada: true, compteChoisi: { id: 'x', numero: '29310000' }, cumuls: vide, numeros: aucun, inscritEnCours: true }),
    ).toMatch(/encore inscrit en cours/);
    expect(
      motifRefusCompte29DuBien({ syscohada: true, compteChoisi: { id: 'x', numero: '29390000' }, cumuls: vide, numeros: aucun, inscritEnCours: true }),
    ).toBeNull();
  });

  it('un bien achevé ne se déprécie jamais au 29x9', () => {
    expect(
      motifRefusCompte29DuBien({ syscohada: true, compteChoisi: { id: 'x', numero: '29390000' }, cumuls: vide, numeros: aucun, inscritEnCours: false }),
    ).toMatch(/EN COURS/);
  });

  it('SYCEBNL · rien n’est transposé, son texte n’écrit pas la phrase du Titre VII ch. 2', () => {
    expect(
      motifRefusCompte29DuBien({ syscohada: false, compteChoisi: { id: 'x', numero: '29310000' }, cumuls: vide, numeros: aucun, inscritEnCours: true }),
    ).toBeNull();
  });
});

describe('ce que la mise en service dit', () => {
  it('une dépréciation au 29x9 est nommée, montant et compte, sans rien passer', () => {
    const texte = avertissementDepreciationEnCours(new Map([['c', 750_000]]), new Map([['c', '29390000']]));
    expect(texte).toMatch(/750000\.00 au 29390000/);
    expect(texte).toMatch(/aucun texte ne la vire/);
  });

  it('rien à dire sans dépréciation, ou quand elle est au compte du bien achevé', () => {
    expect(avertissementDepreciationEnCours(new Map(), new Map())).toBeNull();
    expect(avertissementDepreciationEnCours(new Map([['c', 750_000]]), new Map([['c', '29310000']]))).toBeNull();
  });
});

/*
  LE CÂBLAGE (F4a) · la porte de la dépréciation lit le cumul par compte et
  le compte où le bien est inscrit à la clôture ; la mise en service rend
  l'avertissement. Le passage de la porte se prouve par l'étape qui la suit
  (la lecture des réévaluations du bien), interrompue par une sentinelle.
*/
function harnais(o: {
  referentiel?: Referentiel;
  compte29: string;
  enCours: boolean;
  dateMiseEnService?: Date | null;
  depreciations?: { sens: SensDepreciation; montant: number; compteId: string; numero: string }[];
}) {
  const immo = {
    id: 'i1',
    designation: 'Entrepôt',
    statut: 'EN_SERVICE',
    valeurOrigine: 10_000_000,
    valeurResiduelle: 0,
    compteImmobilisationId: 'c231',
    compteImmobilisation: { id: 'c231', numero: '23110000' },
    compteEnCoursId: o.enCours ? 'c239' : null,
    dateMiseEnService: o.dateMiseEnService ?? null,
    dotations: [],
    depreciations: (o.depreciations ?? []).map((d) => ({
      sens: d.sens,
      montant: d.montant,
      compteDepreciationId: d.compteId,
      compteDepreciation: { numero: d.numero },
      exercice: { dateFin: D('2025-12-31') },
    })),
  };
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
    immobilisation: { findFirst: jest.fn().mockResolvedValue(immo) },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'c29' ? { id: 'c29', numero: o.compte29 } : where.id === 'c69' ? { id: 'c69', numero: '69130000' } : { id: where.id, numero: '79140000' },
        ),
      ),
    },
    ligneReevaluationBilan: { findMany: jest.fn().mockRejectedValue(new Error('SUITE')) },
  };
  return new ImmobilisationService(prisma as unknown as PrismaService, {} as EcritureService);
}

const DOTATION = { exerciceId: 'e26', journalId: 'j1', sens: SensDepreciation.DOTATION, montant: 100_000, compteDepreciationId: 'c29', compteContrepartieId: 'c69', indice: 'Chantier arrêté' };

describe('câblage de la porte de la dépréciation', () => {
  it('SYSCOHADA · bien au 239 à la clôture, dotation au 2931 refusée, au 2939 admise', async () => {
    await expect(harnais({ compte29: '29310000', enCours: true }).enregistrerDepreciation('t1', 'u1', 'i1', DOTATION as never)).rejects.toThrow(
      /encore inscrit en cours/,
    );
    await expect(harnais({ compte29: '29390000', enCours: true }).enregistrerDepreciation('t1', 'u1', 'i1', DOTATION as never)).rejects.toThrow('SUITE');
  });

  it('bien mis en service AVANT la clôture · il est au 231, le 2939 refusé pour une première dotation', async () => {
    await expect(
      harnais({ compte29: '29390000', enCours: true, dateMiseEnService: D('2026-06-01') }).enregistrerDepreciation('t1', 'u1', 'i1', DOTATION as never),
    ).rejects.toThrow(/EN COURS/);
  });

  it('dépréciation en place au 2939 · la reprise au 2931 est refusée, au 2939 admise', async () => {
    const depreciations = [{ sens: SensDepreciation.DOTATION, montant: 400_000, compteId: 'c2939', numero: '29390000' }];
    const reprise = { ...DOTATION, sens: SensDepreciation.REPRISE, compteContrepartieId: 'c79' };
    await expect(
      harnais({ compte29: '29310000', enCours: true, dateMiseEnService: D('2026-06-01'), depreciations }).enregistrerDepreciation('t1', 'u1', 'i1', reprise as never),
    ).rejects.toThrow(/inscrite au 29390000/);
  });
});

describe('câblage de la mise en service', () => {
  function harnaisMes(depreciations: { sens: SensDepreciation; montant: number; compteDepreciationId: string; compteDepreciation: { numero: string } }[]) {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          designation: 'Entrepôt',
          dateAcquisition: D('2025-03-01'),
          dateMiseEnService: null,
          statut: 'EN_SERVICE',
          valeurOrigine: 10_000_000,
          compteImmobilisationId: 'c231',
          compteEnCoursId: null,
          depreciations,
        }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'i1', ...data })),
      },
      coutEmpruntIncorpore: { aggregate: jest.fn().mockResolvedValue({ _max: { dateFin: null } }) },
      ligneReevaluationBilan: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return new ImmobilisationService(prisma as unknown as PrismaService, {} as EcritureService);
  }

  it('la dépréciation du 2939 reste et la réponse le dit', async () => {
    const r = await harnaisMes([
      { sens: SensDepreciation.DOTATION, montant: 400_000, compteDepreciationId: 'c2939', compteDepreciation: { numero: '29390000' } },
    ]).mettreEnService('t1', 'u1', 'i1', { date: '2026-06-01' } as never);
    expect(r.avertissementDepreciation).toMatch(/400000\.00 au 29390000/);
  });

  it('sans dépréciation, rien n’est dit', async () => {
    const r = await harnaisMes([]).mettreEnService('t1', 'u1', 'i1', { date: '2026-06-01' } as never);
    expect(r.avertissementDepreciation).toBeNull();
  });
});
