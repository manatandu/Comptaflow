import { ClasseCompte } from '@prisma/client';
import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA TVA D'UNE CRÉANCE IRRÉCOUVRABLE DANS LA DÉCLARATION (ligne A7, E2, K1, K3, K4).
 *
 * O.-L. n° 10/001, art. 52 · la TVA des ventes qui « restent impayés peut être
 * récupérée par voie d'imputation sur l'impôt dû pour les opérations faites
 * ultérieurement ». Décret n° 011/42, art. 126 · elle « est inscrite dans les
 * déductions afférentes à la déclaration du ou des mois suivants celui de la
 * constatation [...] de non-paiement, dans les conditions prévues pour exercer
 * le droit à déduction ».
 *
 * La perte (module des créances douteuses) passe D 651 / D 443 / C 416, la
 * ligne de 443 portant le taux de la vente d'origine. Propriétés gelées ici ·
 * la ligne n'est JAMAIS retranchée de la collecte de la période de la perte ;
 * elle est inscrite en déduction dans la première déclaration POSTÉRIEURE qui
 * est LIQUIDÉE, et une seule fois, la liquidation la marquant
 * (`liquidationRecuperationId`, K1) ; son annulation la rend à récupérer ; la
 * déchéance de l'art. 37, al. 2 la ferme. Une ligne D 443 hors de la
 * déclaration ferait payer la taxe deux fois sans aucun signal (§ 10 bis).
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

interface Perte {
  id: string;
  annuleeLe?: Date | null;
  liquidationRecuperation?: { dateDebut: Date; dateFin: Date } | null;
}

interface LigneFausse {
  numero: string;
  date: string;
  debit?: number;
  credit?: number;
  /** La ligne vient de la perte d'une créance douteuse. */
  perte?: Perte;
  /** La ligne vient de l'inscription en négatif d'une perte annulée. */
  negatifDePerte?: boolean;
  /** Les lignes de l'écriture lues par la déclaration (tiers, contreparties). */
  lignes?: unknown[];
}

function service(lignes: LigneFausse[]) {
  const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
  const liquidations: Array<{ id: string; dateDebut: Date; dateFin: Date }> = [];
  const pertes = new Map(lignes.filter((l) => l.perte).map((l) => [l.perte!.id, l.perte!]));
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { numero: string } }) => Promise.resolve({ id: `c-${where.numero}`, numero: where.numero })),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        return Promise.resolve(
          lignes.map((l, i) => ({
            id: `l-${i}`,
            tauxTvaId: TAUX.id,
            compteId: l.numero.startsWith('443') ? 'c443' : 'c445',
            compte: { numero: l.numero },
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            ecriture: {
              date: new Date(l.date),
              lignes: l.lignes ?? [],
              mouvementCreanceDouteuse: l.perte ? { annuleeLe: null, liquidationRecuperation: null, ...pertes.get(l.perte.id) } : null,
              corrigeEcriture: l.negatifDePerte ? { mouvementCreanceDouteuse: { id: 'mv-annule' } } : null,
            },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => {
        const liq = { id: `liq-${liquidations.length + 1}`, dateDebut: data.dateDebut, dateFin: data.dateFin };
        liquidations.push(liq);
        return Promise.resolve(liq);
      }),
    },
    // LA DOUBLURE HONORE LA MISE À JOUR · elle ne marque qu'une perte non
    // marquée et non annulée, comme le `where` le demande.
    mouvementCreanceDouteuse: {
      update: jest.fn().mockImplementation(({ where, data }) => {
        const p = pertes.get(where.id);
        if (!p || p.liquidationRecuperation || p.annuleeLe || where.liquidationRecuperationId !== null) {
          return Promise.reject(Object.assign(new Error('introuvable'), { code: 'P2025' }));
        }
        const liq = liquidations.find((x) => x.id === data.liquidationRecuperationId)!;
        p.liquidationRecuperation = { dateDebut: liq.dateDebut, dateFin: liq.dateFin };
        return Promise.resolve({});
      }),
    },
    $transaction: (f: (tx: unknown) => unknown) => f(prisma),
  } as unknown as PrismaService;
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { lignes: { compteId: string; debit?: number; credit?: number; libelle?: string }[] }) => {
      ecrites.push(dto.lignes);
      return Promise.resolve({ id: `e-liq-${ecrites.length}` });
    }),
  } as unknown as EcritureService;
  return { svc: new TauxTvaService(prisma, ecritureService), ecrites, pertes, prisma };
}

const periode = (du: string, au: string) => [new Date(du), new Date(`${au}T23:59:59.999Z`)] as const;
const liquider = (svc: TauxTvaService, du: string, au: string) =>
  svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex', dateDebut: du, dateFin: `${au}T23:59:59.999Z` });

// Vente de 1 000 000 HT en janvier (160 000 de TVA), perdue le 20 mars · la
// perte récupère 160 000 au 443. Mars vend 800 000 de TVA, avril 3 200 000.
const jeu = (): LigneFausse[] => [
  { numero: '44310000', date: '2026-01-15', credit: 160_000 },
  { numero: '44310000', date: '2026-03-10', credit: 800_000 },
  { numero: '44310000', date: '2026-03-20', debit: 160_000, perte: { id: 'mv-mars' } },
  { numero: '44310000', date: '2026-04-12', credit: 3_200_000 },
];
const MARS = periode('2026-03-01', '2026-03-31');
const AVRIL = periode('2026-04-01', '2026-04-30');
const MAI = periode('2026-05-01', '2026-05-31');

describe('TVA d’une créance irrécouvrable · constatée en M, déduite après (art. 52, décret art. 126)', () => {
  it('mois M · la collecte n’est PAS minorée, la TVA est dite constatée, rien n’est déduit', async () => {
    const { svc } = service(jeu());
    const d = await svc.declaration('t1', ...MARS);
    expect(d.totalCollecte).toBe(800_000);
    expect(d.creancesIrrecouvrablesConstatees).toBe(160_000);
    expect(d.recuperationCreancesIrrecouvrables).toBe(0);
    expect(d.netAvantImputation).toBe(800_000);
    // Ni avoir sur vente, ni avoir sans note de crédit · la pièce est le duplicata.
    expect(d.avoirsCollecteConstates).toBe(0);
    expect(d.avoirsSansNoteDeCredit).toBe(0);
    expect(d.mentionExigibilite).toContain('CRÉANCES IRRÉCOUVRABLES CONSTATÉES');
  });

  it('M+1 · la TVA est inscrite en DÉDUCTION sur sa ligne propre, hors des avoirs de l’art. 52 et sans prorata', async () => {
    const { svc } = service(jeu());
    const d = await svc.declaration('t1', ...AVRIL);
    expect(d.totalCollecte).toBe(3_200_000);
    expect(d.recuperationCreancesIrrecouvrables).toBe(160_000);
    expect(d.pertesCreancesARecuperer).toEqual(['mv-mars']);
    expect(d.recuperationArt52).toBe(0);
    expect(d.avoirsCollecteNonImputes).toBe(0);
    expect(d.netAvantImputation).toBe(3_040_000);
    expect(d.lignes[0]).toMatchObject({ recuperationCreancesIrrecouvrables: 160_000, net: 3_040_000 });
    expect(d.mentionExigibilite).toContain('RÉCUPÉRATION SUR CRÉANCE IRRÉCOUVRABLE, ART. 52');
  });

  it('la liquidation de M+1 solde le 443 par la ligne de récupération, MARQUE la perte, et l’écriture reste équilibrée', async () => {
    const { svc, ecrites, pertes, prisma } = service(jeu());
    await liquider(svc, '2026-04-01', '2026-04-30');
    const lignes = ecrites[0];
    const recuperation = lignes.find((l) => /restées impayées \(art\. 52\)/.test(l.libelle ?? ''));
    expect(recuperation).toMatchObject({ compteId: 'c443', credit: 160_000 });
    expect(lignes.find((l) => l.libelle === 'TVA due')?.credit).toBe(3_040_000);
    const d = lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const c = lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(Math.round((d - c) * 100)).toBe(0);
    expect((prisma as any).mouvementCreanceDouteuse.update.mock.calls[0][0]).toEqual({
      where: { id: 'mv-mars', tenantId: 't1', liquidationRecuperationId: null, annuleeLe: null },
      data: { liquidationRecuperationId: 'liq-1' },
    });
    expect(pertes.get('mv-mars')!.liquidationRecuperation).toBeTruthy();
  });
});

describe('K1 · la récupération suit la LIQUIDATION, jamais le calendrier', () => {
  it('UNE SEULE FOIS · liquidée en avril, mai ne la reprend pas ; la déclaration d’avril, relue, la montre encore', async () => {
    const { svc } = service(jeu());
    await liquider(svc, '2026-04-01', '2026-04-30');
    const [avril, mai] = await Promise.all([svc.declaration('t1', ...AVRIL), svc.declaration('t1', ...MAI)]);
    expect([avril.recuperationCreancesIrrecouvrables, mai.recuperationCreancesIrrecouvrables]).toEqual([160_000, 0]);
    expect(avril.pertesCreancesARecuperer).toEqual([]);
    // La collecte de chaque mois reste celle des seules ventes.
    expect([avril.totalCollecte, mai.totalCollecte]).toEqual([3_200_000, 0]);
  });

  it('MOIS SAUTÉ · avril jamais liquidé, mai la récupère (la règle du « mois précédent » la perdait)', async () => {
    const { svc } = service(jeu());
    const mai = await svc.declaration('t1', ...MAI);
    expect(mai.recuperationCreancesIrrecouvrables).toBe(160_000);
    await liquider(svc, '2026-05-01', '2026-05-31');
    const juin = await svc.declaration('t1', ...periode('2026-06-01', '2026-06-30'));
    expect(juin.recuperationCreancesIrrecouvrables).toBe(0);
  });

  it('TRIMESTRE · le deuxième trimestre récupère la perte de mars ; une perte de mai y est seulement constatée', async () => {
    const lignes = [...jeu(), { numero: '44310000', date: '2026-05-18', debit: 32_000, perte: { id: 'mv-mai' } }];
    const { svc } = service(lignes);
    const t2 = await svc.declaration('t1', ...periode('2026-04-01', '2026-06-30'));
    expect(t2.recuperationCreancesIrrecouvrables).toBe(160_000);
    expect(t2.creancesIrrecouvrablesConstatees).toBe(32_000);
    expect(t2.pertesCreancesARecuperer).toEqual(['mv-mars']);
    await liquider(svc, '2026-04-01', '2026-06-30');
    const t3 = await svc.declaration('t1', ...periode('2026-07-01', '2026-09-30'));
    expect(t3.recuperationCreancesIrrecouvrables).toBe(32_000);
  });

  it('DEUX DEMI-MOIS · la première quinzaine liquidée la prend, la seconde ne la reprend pas', async () => {
    const { svc, prisma } = service(jeu());
    await liquider(svc, '2026-04-01', '2026-04-15');
    const seconde = await svc.declaration('t1', ...periode('2026-04-16', '2026-04-30'));
    expect(seconde.recuperationCreancesIrrecouvrables).toBe(0);
    // La seconde quinzaine n'a rien d'autre · rien à liquider, et la perte reste marquée une fois.
    await expect(liquider(svc, '2026-04-16', '2026-04-30')).rejects.toThrow('rien à comptabiliser');
    expect((prisma as any).mouvementCreanceDouteuse.update).toHaveBeenCalledTimes(1);
  });

  it('VALIDATION TARDIVE · la perte de mars restée au brouillard pendant la liquidation d’avril entre dans celle de mai', async () => {
    const auBrouillard = jeu().filter((l) => !l.perte);
    const avant = service(auBrouillard);
    const avril = await avant.svc.declaration('t1', ...AVRIL);
    expect(avril.recuperationCreancesIrrecouvrables).toBe(0);
    // Validée en mai · la déclaration (livre-journal seul) la lit désormais.
    const apres = service(jeu());
    const mai = await apres.svc.declaration('t1', ...MAI);
    expect(mai.recuperationCreancesIrrecouvrables).toBe(160_000);
  });

  it('DÉCHÉANCE · une perte de 2024 jamais imputée n’est plus reprise en 2026, et c’est dit (art. 37 al. 2, décret art. 96)', async () => {
    const { svc } = service([
      { numero: '44310000', date: '2024-06-20', debit: 48_000, perte: { id: 'mv-2024' } },
      { numero: '44310000', date: '2026-01-12', credit: 500_000 },
    ]);
    const janvier = await svc.declaration('t1', ...periode('2026-01-01', '2026-01-31'));
    expect(janvier.recuperationCreancesIrrecouvrables).toBe(0);
    expect(janvier.recuperationCreancesDechue).toBe(48_000);
    expect(janvier.pertesCreancesARecuperer).toEqual([]);
    expect(janvier.mentionExigibilite).toContain('DÉCHUE');
    // Une perte de 2025 reste dans le délai en 2026.
    const dans = service([{ numero: '44310000', date: '2025-03-20', debit: 48_000, perte: { id: 'mv-2025' } }]);
    expect((await dans.svc.declaration('t1', ...periode('2026-01-01', '2026-01-31'))).recuperationCreancesIrrecouvrables).toBe(48_000);
  });

  it('K4 · une perte ANNULÉE et son inscription en négatif ne comptent nulle part', async () => {
    const lignes: LigneFausse[] = [
      { numero: '44310000', date: '2026-03-10', credit: 800_000 },
      { numero: '44310000', date: '2026-03-20', debit: 160_000, perte: { id: 'mv-x', annuleeLe: new Date('2026-03-25') } },
      { numero: '44310000', date: '2026-03-25', debit: -160_000, negatifDePerte: true },
    ];
    const { svc } = service(lignes);
    const [mars, avril] = await Promise.all([svc.declaration('t1', ...MARS), svc.declaration('t1', ...AVRIL)]);
    expect(mars.totalCollecte).toBe(800_000);
    expect(mars.creancesIrrecouvrablesConstatees).toBe(0);
    expect(avril.recuperationCreancesIrrecouvrables).toBe(0);
    expect(avril.totalCollecte).toBe(0);
  });
});

describe('K1 · l’annulation d’une liquidation rend ses pertes à récupérer', () => {
  it('remet le lien à null, perte par perte, AVANT de supprimer le marqueur', async () => {
    const ordre: string[] = [];
    const tx = {
      mouvementCreanceDouteuse: {
        findMany: jest.fn().mockResolvedValue([{ id: 'mv-mars' }, { id: 'mv-mai' }]),
        update: jest.fn().mockImplementation(({ where }) => (ordre.push(`maj ${where.id}`), Promise.resolve({}))),
      },
      liquidationTva: { delete: jest.fn().mockImplementation(() => (ordre.push('suppression'), Promise.resolve({}))) },
    };
    const prisma = {
      liquidationTva: { findFirst: jest.fn().mockResolvedValue({ id: 'liq-1', ecritureId: 'e-liq' }) },
    } as unknown as PrismaService;
    const ecritureService = {
      supprimer: jest.fn(async (_t: string, _e: string, m: { liberer: (tx: unknown) => Promise<unknown> }) => m.liberer(tx)),
    } as unknown as EcritureService;
    await new TauxTvaService(prisma, ecritureService).annulerLiquidation('t1', 'liq-1');
    expect(tx.mouvementCreanceDouteuse.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', liquidationRecuperationId: 'liq-1' });
    expect(tx.mouvementCreanceDouteuse.update.mock.calls[0][0]).toEqual({ where: { id: 'mv-mars', tenantId: 't1' }, data: { liquidationRecuperationId: null } });
    expect(ordre).toEqual(['maj mv-mars', 'maj mv-mai', 'suppression']);
  });
});

/**
 * K3 · LE RECLASSEMENT N'EST PAS UN ENCAISSEMENT. Une prestation de services
 * (TVA exigible à l'encaissement, O.-L. n° 10/001, art. 25, 2°) facturée le
 * 10 février, reclassée en créance douteuse le 30 juin et lettrée avec ce
 * reclassement · la taxe ne devient pas exigible au 30 juin. Elle le devient
 * au RECOUVREMENT du module, à son prorata.
 */
describe('K3 · exigibilité d’une prestation reclassée en créance douteuse', () => {
  const groupe = (recouvrements: Array<{ date: Date; montant: number }>) => ({
    statut: 'SOLDE',
    solde: 0,
    soldeAt: new Date('2026-07-02'),
    lignes: [
      { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10'), creanceDouteuseReclassement: null } },
      { debit: 0, credit: 1_160_000, ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: { mouvements: recouvrements } } },
    ],
  });
  const facture = (recouvrements: Array<{ date: Date; montant: number }>): LigneFausse[] => [
    {
      numero: '44320000',
      date: '2026-02-10',
      credit: 160_000,
      lignes: [
        { debit: 1_160_000, credit: 0, compte: { numero: '41110001', classe: ClasseCompte.CLASSE_4, tiersCompte: null }, lettrage: groupe(recouvrements) },
        { debit: 0, credit: 1_000_000, compte: { numero: '70610000', classe: ClasseCompte.CLASSE_7, tiersCompte: null }, lettrage: null },
      ],
    },
  ];

  it('facture de services du 10 février, reclassement le 30 juin · rien n’est exigible en juin, tout reste en attente', async () => {
    const { svc } = service(facture([]));
    const [fevrier, juin] = await Promise.all([
      svc.declaration('t1', ...periode('2026-02-01', '2026-02-28')),
      svc.declaration('t1', ...periode('2026-06-01', '2026-06-30')),
    ]);
    expect(juin.totalCollecte).toBe(0);
    expect(fevrier.totalCollecte).toBe(0);
    expect(fevrier.tvaEnAttenteEncaissement).toBe(160_000);
  });

  it('recouvrement PARTIEL de 580 000 le 10 août · la moitié de la taxe devient exigible en août, et en août seulement', async () => {
    const { svc } = service(facture([{ date: new Date('2026-08-10'), montant: 580_000 }]));
    const [juin, aout] = await Promise.all([
      svc.declaration('t1', ...periode('2026-06-01', '2026-06-30')),
      svc.declaration('t1', ...periode('2026-08-01', '2026-08-31')),
    ]);
    expect(juin.totalCollecte).toBe(0);
    expect(aout.totalCollecte).toBe(80_000);
  });
});
