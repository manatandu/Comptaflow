import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * CONTRÔLE 30 · UN RAPPROCHEMENT QUI TIENT UN À-NOUVEAU (2026-09-28).
 *
 * La règle du rapprochement écarte désormais tout report à-nouveau du
 * pointage, mais ne défait rien de ce qui a été pointé avant elle · aucun
 * éditeur relu ne rouvre d'office. Le contrôle DÉTECTE. Il ne doit pas non
 * plus fabriquer d'anomalie (§ 10 bis) · le premier rapprochement d'avant la
 * règle, parti de zéro sans solde déclaré, a légitimement pointé le bilan
 * d'ouverture du premier exercice, qui était la seule entrée de l'ouverture.
 *
 * La doublure de `rapprochementBancaire.findMany` HONORE le filtre qui
 * distingue les deux lectures (les rapprochements de l'exercice, puis les
 * clos du compte) · une doublure qui rendrait la même liste aux deux
 * validerait une ancre lue n'importe où.
 */

type Faux = Record<string, unknown>;
const D = (s: string) => new Date(`${s}T00:00:00Z`);

const an = (exerciceId: string, date: string, debit: number) => ({
  debit,
  credit: 0,
  ecriture: { date: D(date), exerciceId, estGenereeParCloture: true, estSoldeDesComptesDeGestion: false },
});

interface RapFaux {
  id: string;
  compteId: string;
  statut: 'EN_COURS' | 'CLOTURE';
  dateReleve: Date;
  clotureAt: Date | null;
  soldeDepartDeclare: number | null;
  compte: { numero: string; intitule: string };
  lignes: ReturnType<typeof an>[];
}

function analyser(rapprochements: RapFaux[]) {
  const prisma = {
    exercice: {
      findFirst: jest.fn(async ({ orderBy }: { orderBy?: unknown }) =>
        // Sans tri, l'exercice contrôlé · trié, le premier du dossier.
        orderBy
          ? { id: 'ex2025' }
          : { id: 'ex2026', statut: 'OUVERT', dateDebut: D('2026-01-01'), dateFin: D('2026-12-31'), dateArreteComptes: D('2027-04-28') },
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier', referentiel: Referentiel.SYCEBNL }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 32 lit les contre-passations de réévaluation de l'exercice · aucune ici.
    reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
    rapprochementBancaire: {
      findMany: jest.fn(async ({ where }: { where: { statut?: string; dateReleve?: { gte: Date; lte: Date } } }) => {
        if (where.statut === 'CLOTURE') return rapprochements.filter((r) => r.statut === 'CLOTURE');
        const b = where.dateReleve!;
        return rapprochements.filter(
          (r) => r.lignes.length > 0 && r.dateReleve.getTime() >= b.gte.getTime() && r.dateReleve.getTime() <= b.lte.getTime(),
        );
      }),
    },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService).analyser('t', 'ex2026');
}

const anomalie = async (r: RapFaux[]) =>
  (await analyser(r)).anomalies.find((a) => a.code === 'RAPPROCHEMENT_A_NOUVEAU_POINTE');

const compte = { numero: '52110000', intitule: 'Banque' };

describe('contrôle 30 · un à-nouveau pointé est trouvé, à sa place dans la chaîne', () => {
  it('un rapprochement clos après un autre, qui tient le report de 2026, est signalé', async () => {
    const a = await anomalie([
      { id: 'rap0', compteId: 'c', statut: 'CLOTURE', dateReleve: D('2025-12-31'), clotureAt: D('2026-01-10'), soldeDepartDeclare: null, compte, lignes: [] },
      {
        id: 'rap1',
        compteId: 'c',
        statut: 'CLOTURE',
        dateReleve: D('2026-02-28'),
        clotureAt: D('2026-03-05'),
        soldeDepartDeclare: null,
        compte,
        lignes: [an('ex2026', '2026-01-01', 1300)],
      },
    ]);
    expect(a?.gravite).toBe('AVERTISSEMENT');
    expect(a?.occurrences).toEqual([
      {
        reference: '52110000 Banque · relevé du 2026-02-28',
        detail: 'Rapprochement clos · report à-nouveau du 2026-01-01 pointé',
        date: '2026-01-01',
        montant: 1300,
      },
    ]);
  });

  it('un premier rapprochement en cours, à départ déclaré, qui tient le bilan d’ouverture, est signalé', async () => {
    const a = await anomalie([
      {
        id: 'rap1',
        compteId: 'c',
        statut: 'EN_COURS',
        dateReleve: D('2026-02-28'),
        clotureAt: null,
        soldeDepartDeclare: 1000,
        compte,
        lignes: [an('ex2025', '2026-01-01', 1000)],
      },
    ]);
    expect(a?.occurrences.map((o) => o.detail)).toEqual(['Rapprochement en cours · report à-nouveau du 2026-01-01 pointé']);
  });

  it('le premier rapprochement d’avant la règle, parti de zéro, qui tient le bilan d’ouverture du premier exercice, ne l’est pas', async () => {
    const a = await anomalie([
      {
        id: 'rap0',
        compteId: 'c',
        statut: 'CLOTURE',
        dateReleve: D('2026-02-28'),
        clotureAt: D('2026-03-05'),
        soldeDepartDeclare: null,
        compte,
        lignes: [an('ex2025', '2026-01-01', 1000)],
      },
    ]);
    expect(a).toBeUndefined();
  });

  it('le même, s’il tient le report d’un exercice suivant, l’est · les lignes recopiées étaient au dossier', async () => {
    const a = await anomalie([
      {
        id: 'rap0',
        compteId: 'c',
        statut: 'CLOTURE',
        dateReleve: D('2026-02-28'),
        clotureAt: D('2026-03-05'),
        soldeDepartDeclare: null,
        compte,
        lignes: [an('ex2026', '2026-01-01', 1300)],
      },
    ]);
    expect(a?.occurrences).toHaveLength(1);
  });
});
