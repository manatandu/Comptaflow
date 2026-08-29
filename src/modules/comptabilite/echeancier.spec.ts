import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * ÉCHÉANCIER DE TRÉSORERIE · l'état regarde EN AVANT, contrairement à la
 * balance âgée. Les tests portent sur ce qui le distingue : le sens des
 * lignes, la projection cumulée, et l'alerte de rupture.
 */

function ligne(
  id: string,
  numero: string,
  montant: { debit?: number; credit?: number },
  options: { echeance?: string; tiers?: string; reference?: string } = {},
) {
  return {
    id,
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    libelle: null,
    dateEcheance: options.echeance ? new Date(options.echeance) : null,
    compte: {
      id: `c-${numero}`,
      numero,
      intitule: `Compte ${numero}`,
      tiersCompte: options.tiers ? { tiers: { nom: options.tiers } } : null,
    },
    ecriture: { date: new Date('2026-01-15'), libelle: `Écriture ${id}`, reference: options.reference ?? null },
  };
}

function tresorerie(numero: string, debit: number, credit = 0) {
  return { debit, credit, compte: { numero } };
}

function service(tiers: ReturnType<typeof ligne>[], treso: ReturnType<typeof tresorerie>[]) {
  const prisma = {
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        // La requête de trésorerie filtre sur `compte.numero.startsWith`,
        // celle des tiers sur un OR de racines : c'est ce qui les distingue.
        Promise.resolve(where.compte?.numero?.startsWith === '5' ? treso : tiers),
      ),
    },
  } as unknown as PrismaService;
  return new EcritureService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
  );
}

const REF = '2026-06-15';

describe('Échéancier de trésorerie', () => {
  it('une créance est un ENCAISSEMENT, une dette un DÉCAISSEMENT', async () => {
    const s = service(
      [
        ligne('a', '41100000', { debit: 500_000 }, { echeance: '2026-06-30', tiers: 'Mutuelle Kin' }),
        ligne('b', '40110000', { credit: 300_000 }, { echeance: '2026-06-20' }),
      ],
      [tresorerie('52110000', 1_000_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    expect(e.details.find((d) => d.ligneId === 'a')!.sens).toBe('ENCAISSEMENT');
    expect(e.details.find((d) => d.ligneId === 'b')!.sens).toBe('DECAISSEMENT');
    expect(e.details.find((d) => d.ligneId === 'a')!.tiers).toBe('Mutuelle Kin');
  });

  it('couvre les classes 42, 43 et 44 · c’est là qu’une ASBL se met en défaut', async () => {
    const s = service(
      [
        ligne('sal', '42200000', { credit: 800_000 }, { echeance: '2026-06-30' }),
        ligne('cnss', '43100000', { credit: 200_000 }, { echeance: '2026-07-15' }),
        ligne('irpp', '44200000', { credit: 150_000 }, { echeance: '2026-07-15' }),
      ],
      [tresorerie('57100000', 400_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    expect(e.details).toHaveLength(3);
    expect(e.details.every((d) => d.sens === 'DECAISSEMENT')).toBe(true);
  });

  it('projette la trésorerie de tranche en tranche et NOMME la première rupture', async () => {
    // 400 000 en caisse, 800 000 de salaires à 15 jours : la rupture tombe
    // dans la tranche « De 8 à 30 jours ».
    const s = service(
      [ligne('sal', '42200000', { credit: 800_000 }, { echeance: '2026-06-30' })],
      [tresorerie('57100000', 400_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    expect(e.tresorerieActuelle).toBe(400_000);
    const t = e.tranches.find((x) => x.cle === 'j8a30')!;
    expect(t.decaissements).toBe(800_000);
    expect(t.tresorerieProjetee).toBe(-400_000);
    expect(e.alerte).not.toBeNull();
    expect(e.alerte!.tranche).toBe('j8a30');
  });

  it('ne signale aucune alerte quand la caisse suit', async () => {
    const s = service(
      [ligne('f', '40110000', { credit: 100_000 }, { echeance: '2026-06-30' })],
      [tresorerie('52110000', 900_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    expect(e.alerte).toBeNull();
    expect(e.tranches.at(-1)!.tresorerieProjetee).toBe(800_000);
  });

  it('classe en ÉCHU ce dont la date est passée, et compte les lignes sans échéance', async () => {
    const s = service(
      [
        ligne('retard', '40110000', { credit: 250_000 }, { echeance: '2026-05-01' }),
        // Sans échéance : la date de l'écriture (15/01/2026) fait foi, donc échu.
        ligne('sansDate', '40110000', { credit: 50_000 }),
      ],
      [tresorerie('52110000', 1_000_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    const echu = e.tranches.find((t) => t.cle === 'echu')!;
    expect(echu.decaissements).toBe(300_000);
    expect(e.lignesSansEcheance).toBe(1);
  });

  it('écarte le compte 59 de la trésorerie disponible · une dépréciation n’est pas de l’argent', async () => {
    const s = service([], [tresorerie('52110000', 1_000_000), tresorerie('59100000', 0, 200_000)]);
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    expect(e.tresorerieActuelle).toBe(1_000_000);
  });

  it('une correction en négatif s’annule dans les TOTAUX, tout en restant visible au détail', async () => {
    const s = service(
      [
        ligne('f', '40110000', { credit: 400_000 }, { echeance: '2026-06-30' }),
        // Inscription en négatif (art. 20 AUDCIF) : un crédit négatif.
        ligne('corr', '40110000', { credit: -400_000 }, { echeance: '2026-06-30' }),
      ],
      [tresorerie('52110000', 500_000)],
    );
    const e = await s.echeancier('t1', { exerciceId: 'e1', dateReference: REF });
    // Le détail est ligne à ligne, contrairement à la balance âgée qui agrège
    // par compte : les deux écritures restent visibles avec leur pièce, ce qui
    // est le but d'un état d'en-cours. C'est dans les totaux de tranche
    // qu'elles se compensent, et c'est la projection qui compte.
    expect(e.details).toHaveLength(2);
    const t = e.tranches.find((x) => x.cle === 'j8a30')!;
    expect(t.net).toBe(0);
    expect(e.alerte).toBeNull();
  });
});
