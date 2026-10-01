import { readFileSync } from 'fs';
import { join } from 'path';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';
import { LOT_ECRITURES } from '../../common/lecture-par-lots';

/**
 * AUDIT FINAL F185 · LA BATTERIE LIT LES ÉCRITURES PAR TRANCHES.
 *
 * Elle chargeait toutes les écritures de l'exercice avec leurs lignes, ce que
 * le banc d'un million de lignes a montré mortel. La doublure ci-dessous se
 * comporte comme Prisma · ordre par identifiant, `take`, curseur et `skip` ·
 * pour que le parcours soit éprouvé tel qu'il tourne, et non sur une liste
 * rendue d'un bloc.
 */
function ecriture(i: number, avecReference: boolean) {
  const id = `e-${String(i).padStart(5, '0')}`;
  return {
    id,
    date: new Date('2026-05-10'),
    libelle: `Pièce ${i}`,
    reference: avecReference ? `PJ-${i}` : null,
    numeroPiece: i,
    createdAt: new Date('2026-05-10'),
    statut: 'VALIDEE',
    createdBy: 'u1',
    valideeBy: 'u2',
    secondRegardNom: null,
    estGenereeParCloture: false,
    estANouveauProvisoire: false,
    journal: { code: 'VT' },
    lignes: [
      { debit: 100, credit: 0, lettre: null, compte: { numero: '41110000' } },
      { debit: 0, credit: 100, lettre: null, compte: { numero: '70110000' } },
    ],
  };
}

function servicePagine(ecritures: ReturnType<typeof ecriture>[]) {
  const appels: Array<{ take?: number; cursor?: { id: string }; skip?: number }> = [];
  const findMany = jest.fn(async (args: { take?: number; cursor?: { id: string }; skip?: number; orderBy?: unknown }) => {
    appels.push(args);
    const tries = [...ecritures].sort((a, b) => a.id.localeCompare(b.id));
    let debut = 0;
    if (args.cursor) debut = tries.findIndex((e) => e.id === args.cursor!.id) + (args.skip ?? 0);
    return tries.slice(debut, args.take === undefined ? undefined : debut + args.take);
  });
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS }),
    },
    ecriture: { findMany },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau · aucun ici.
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { svc: new ControlesService(prisma), appels };
}

describe('batterie de contrôles · lecture par tranches (F185)', () => {
  it('parcourt tout l’exercice par lots bornés, curseur exclu', async () => {
    const n = 2 * LOT_ECRITURES + 7;
    const { svc, appels } = servicePagine(Array.from({ length: n }, (_, i) => ecriture(i, true)));
    await svc.analyser('t', 'ex');
    const lectures = appels.filter((a) => a.take !== undefined);
    expect(lectures).toHaveLength(3);
    expect(lectures.every((a) => a.take === LOT_ECRITURES)).toBe(true);
    expect(lectures[0].cursor).toBeUndefined();
    expect(lectures[1]).toMatchObject({ cursor: { id: `e-${String(LOT_ECRITURES - 1).padStart(5, '0')}` }, skip: 1 });
  });

  it('une anomalie du dernier lot est vue, et le nombre trouvé est dit quand la liste est bornée', async () => {
    const n = 2 * LOT_ECRITURES + 7;
    const { svc } = servicePagine(Array.from({ length: n }, (_, i) => ecriture(i, i < 1000)));
    const rapport = await svc.analyser('t', 'ex');
    const sansPiece = rapport.anomalies.find((a) => a.code === 'SANS_PIECE');
    expect(sansPiece?.occurrences).toHaveLength(7);
    expect(sansPiece?.nombre).toBeUndefined();
    expect(sansPiece?.occurrences[0].reference).toBe('VT n° 1000');
  });

  it('au-delà de deux cents, la liste s’arrête et le total se dit', async () => {
    const n = LOT_ECRITURES + 30;
    const { svc } = servicePagine(Array.from({ length: n }, (_, i) => ecriture(i, false)));
    const sansPiece = (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === 'SANS_PIECE');
    expect(sansPiece?.occurrences).toHaveLength(200);
    expect(sansPiece?.nombre).toBe(n);
  });

  it('les soldes de tiers se cumulent sur tous les lots', async () => {
    // Un client créditeur au total : 1 007 ventes à 100 au débit, un
    // encaissement de 200 000 au crédit dans le dernier lot.
    const ecritures = Array.from({ length: 2 * LOT_ECRITURES + 7 }, (_, i) => ecriture(i, true));
    ecritures.push({
      ...ecriture(99999, true),
      lignes: [
        { debit: 200_000, credit: 0, lettre: null, compte: { numero: '52110000' } },
        { debit: 0, credit: 200_000, lettre: null, compte: { numero: '41110000' } },
      ],
    });
    const { svc } = servicePagine(ecritures);
    const inverse = (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === 'TIERS_SOLDE_INVERSE');
    expect(inverse?.occurrences[0]).toMatchObject({ reference: '41110000', montant: (2 * LOT_ECRITURES + 7) * 100 - 200_000 });
  });
});

describe('F185 · toute collecte bornée dit son total', () => {
  it('chaque collecte servie en occurrences porte aussi son nombre quand elle est tronquée', () => {
    // Structure, pas distance · une collecte qui sert `.elements` sans
    // `nombreSiTronque` rendrait deux cents lignes pour mille, sans le dire.
    const source = readFileSync(join(__dirname, 'controles.service.ts'), 'utf8');
    const servies = new Set([...source.matchAll(/parcours\.(\w+)\.elements/g)].map((m) => m[1]));
    expect(servies.size).toBeGreaterThanOrEqual(8);
    for (const nom of servies) {
      expect({ nom, dit: source.includes(`nombreSiTronque(parcours.${nom})`) }).toEqual({ nom, dit: true });
    }
  });
});
