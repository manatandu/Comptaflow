import { Referentiel, StatutEcriture, SystemeComptableSyscohada } from '@prisma/client';
import { ControlesService, RACINES_RESERVE_PROPRIETE } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * RÉSERVE DE PROPRIÉTÉ À MENTIONNER AUX NOTES ANNEXES (passe O3).
 *
 * AUDCIF Titre VIII ch. 9, section 3 · quatre montants dus aux Notes annexes
 * (immobilisations, stocks, clients, fournisseurs frappés de réserve de
 * propriété), dispense des montants dérisoires. La maquette SYSCOHADA n'en
 * porte qu'un en ligne propre (Note 7, 4116). Le contrôle se déclenche sur un
 * solde de clôture des comptes que le plan ouvre pour la clause, lus sur le
 * livre-journal seul, au Système normal seul.
 */

interface Ligne {
  numero: string;
  debit: number;
  credit: number;
  statut?: StatutEcriture;
  exerciceId?: string;
}

const l = (numero: string, debit: number, credit = 0, statut: StatutEcriture = StatutEcriture.VALIDEE, exerciceId = 'ex'): Ligne => ({
  numero,
  debit,
  credit,
  statut,
  exerciceId,
});

type FiltreGroupBy = {
  where?: {
    ecriture?: { tenantId?: string; exerciceId?: string; statut?: StatutEcriture };
    OR?: { compte?: { tenantId?: string; numero?: { startsWith?: string } } }[];
  };
};

function service(
  lignes: Ligne[],
  referentiel: Referentiel = Referentiel.SYSCOHADA,
  systeme: SystemeComptableSyscohada | null = SystemeComptableSyscohada.NORMAL,
) {
  // LA DOUBLURE HONORE LES FILTRES · exercice, statut (livre-journal) et
  // racines du OR, comme Postgres. Un identifiant de compte par numéro.
  const groupBy = jest.fn(async ({ where }: FiltreGroupBy) => {
    const prefixes = (where?.OR ?? []).map((o) => o.compte?.numero?.startsWith).filter(Boolean) as string[];
    const retenues = lignes.filter(
      (x) =>
        (where?.OR === undefined || prefixes.some((p) => x.numero.startsWith(p))) &&
        (where?.ecriture?.statut === undefined || x.statut === where.ecriture.statut) &&
        (where?.ecriture?.exerciceId === undefined || x.exerciceId === where.ecriture.exerciceId),
    );
    const parCompte = new Map<string, { debit: number; credit: number }>();
    for (const x of retenues) {
      const acc = parCompte.get(x.numero) ?? { debit: 0, credit: 0 };
      acc.debit += x.debit;
      acc.credit += x.credit;
      parCompte.set(x.numero, acc);
    }
    return [...parCompte.entries()].map(([numero, s]) => ({ compteId: `id-${numero}`, _sum: s }));
  });
  const numeros = [...new Set(lignes.map((x) => x.numero))];
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        dateArreteComptes: null,
      }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Dossier',
        referentiel,
        systemeComptableSyscohada: systeme,
        formeJuridiqueSyscohada: null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: {
      // Honore `id in` · la lecture des numéros ne rend que les comptes demandés.
      findMany: jest.fn(async (a: { where?: { id?: { in?: string[] } } }) => {
        const ids = a?.where?.id?.in;
        if (!ids) return [];
        return numeros.filter((n) => ids.includes(`id-${n}`)).map((n) => ({ id: `id-${n}`, numero: n }));
      }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reevaluationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  };
  return { svc: new ControlesService(prisma as unknown as PrismaService), groupBy };
}

const trouver = async (lignes: Ligne[], referentiel?: Referentiel, systeme?: SystemeComptableSyscohada | null) => {
  const { svc } = service(lignes, referentiel, systeme);
  const rapport = await svc.analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'RESERVE_PROPRIETE_A_MENTIONNER');
};

describe('RESERVE_PROPRIETE_A_MENTIONNER', () => {
  it('se déclenche sur un solde de clôture, rend les soldes par racine et rappelle les quatre montants', async () => {
    const a = await trouver([l('41160000', 5_000_000), l('41160000', 0, 1_000_000), l('90830000', 0, 2_500_000)]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.occurrences).toEqual([
      { reference: '4116 Clients, réserve de propriété', detail: 'Solde débiteur à la clôture (livre-journal)', montant: 4_000_000 },
      { reference: '9083 Achats avec clause de réserve de propriété', detail: 'Solde créditeur à la clôture (livre-journal)', montant: -2_500_000 },
    ]);
    expect(a!.consequence).toContain('AUDCIF, Titre VIII ch. 9, section 3');
    expect(a!.consequence).toContain('immobilisations, des stocks, des clients (et autres créances) et des fournisseurs');
    expect(a!.consequence).toContain('Note 7 (4116)');
    expect(a!.action).toContain('Note 2 D');
    expect(a!.action).toContain('emplacement retenu par OmegaX');
    expect(a!.action).toContain('dérisoires');
    expect(a!.action).toContain('inventaire permanent (§ 3.1)');
  });

  it('additionne les sous-comptes d’une même racine, chacune des cinq', async () => {
    const a = await trouver([
      l('40160000', 0, 300),
      l('40161000', 0, 200),
      l('48160000', 0, 700),
      l('90430000', 900),
    ]);
    expect(a!.occurrences.map((o) => [o.reference.slice(0, 4), o.montant])).toEqual([
      ['4016', -500],
      ['4816', -700],
      ['9043', 900],
    ]);
  });

  it('ne lit que le livre-journal · une écriture au brouillard ne le déclenche pas', async () => {
    expect(await trouver([l('48160000', 0, 700, StatutEcriture.BROUILLARD)])).toBeUndefined();
  });

  it('ne lit que l’exercice demandé', async () => {
    expect(await trouver([l('41160000', 800, 0, StatutEcriture.VALIDEE, 'autre')])).toBeUndefined();
  });

  it('se tait sur un compte soldé et sur les comptes voisins (4011, 4117)', async () => {
    expect(await trouver([l('41160000', 500), l('41160000', 0, 500), l('40110000', 0, 900), l('41170000', 400)])).toBeUndefined();
  });

  it('est borné au SYSCOHADA Système normal · ni le Système minimal, ni le SYCEBNL', async () => {
    const lignes = [l('41160000', 500)];
    expect(await trouver(lignes, Referentiel.SYSCOHADA, SystemeComptableSyscohada.MINIMAL_TRESORERIE)).toBeUndefined();
    expect(await trouver(lignes, Referentiel.SYCEBNL, null)).toBeUndefined();
    expect(await trouver(lignes, Referentiel.SYSCOHADA, SystemeComptableSyscohada.NORMAL)).toBeDefined();
  });

  it('câblage · une seule lecture regroupée, livre-journal de l’exercice, bornée au dossier, sur les cinq racines', async () => {
    const { svc, groupBy } = service([l('41160000', 500)]);
    await svc.analyser('t', 'ex');
    const appel = groupBy.mock.calls
      .map((c) => c[0] as FiltreGroupBy)
      .find((c) => (c.where?.OR ?? []).some((o) => o.compte?.numero?.startsWith === '4116'));
    expect(appel?.where?.ecriture).toEqual({ tenantId: 't', exerciceId: 'ex', statut: StatutEcriture.VALIDEE });
    expect(appel?.where?.OR).toEqual(
      ['4016', '4816', '4116', '9043', '9083'].map((r) => ({ compte: { tenantId: 't', numero: { startsWith: r } } })),
    );
    expect(RACINES_RESERVE_PROPRIETE.map((r) => r.racine)).toEqual(['4016', '4816', '4116', '9043', '9083']);
  });
});

describe('RESERVE_PROPRIETE_A_MENTIONNER · la prémisse relue dans le semis SYSCOHADA', () => {
  it('chaque racine est ouverte au plan semé, sous un intitulé de réserve de propriété', () => {
    const semis = require('fs').readFileSync(require('path').join(__dirname, '../comptes/compte-seed-syscohada.ts'), 'utf8') as string;
    for (const { racine } of RACINES_RESERVE_PROPRIETE) {
      expect(semis).toMatch(new RegExp(`'${racine}0000', '[^']*[Rr]éserve de propriété`));
    }
  });
});
