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

function service(
  lignes: LigneFausse[],
  dejaLiquidees: Array<[string, string]> = [],
  options: { regularisations?: Array<Record<string, unknown>>; recouvrementsAuBrouillard?: Array<Record<string, unknown>> } = {},
) {
  const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
  // Les liquidations ANTÉRIEURES semées n'ont rien figé (antérieures à la règle).
  const liquidations: Array<{ id: string; dateDebut: Date; dateFin: Date; tvaVentesFigee: boolean }> = dejaLiquidees.map(([du, au], i) => ({
    id: `liq-ant-${i}`,
    dateDebut: new Date(du),
    dateFin: new Date(`${au}T23:59:59.999Z`),
    tvaVentesFigee: false,
  }));
  // LA TVA FIGÉE · écrite par la liquidation, relue sur la ligne de vente.
  const figes: Array<{ liquidationId: string; ligneEcritureId: string; montant: number; reportee: boolean; recouvrementId: string | null }> = [];
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
            tvaVentesDeclarees: figes.filter((f) => f.ligneEcritureId === `l-${i}`),
            ecriture: {
              id: `e-${i}`,
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
    // LA DOUBLURE HONORE LA REQUÊTE · la dernière liquidation ANTÉRIEURE
    // (`dateFin < début`) et la liquidation CHEVAUCHANTE se lisent sur le
    // registre, comme en base.
    liquidationTva: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: any }) => {
        if (where.dateFin?.lt) {
          const avant = liquidations.filter((l) => l.dateFin < where.dateFin.lt).sort((a, b) => b.dateFin.getTime() - a.dateFin.getTime());
          return Promise.resolve(avant[0] ? { ...avant[0], ecriture: { id: 'e', libelle: 'liq' } } : null);
        }
        const c = liquidations.find((l) => l.dateDebut <= where.dateFin.gte && l.dateFin >= where.dateDebut.lte);
        return Promise.resolve(c ? { ...c, ecriture: { id: 'e', libelle: 'liq', date: c.dateFin } } : null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...liquidations])),
      create: jest.fn().mockImplementation(({ data }) => {
        const liq = { id: `liq-${liquidations.length + 1}`, dateDebut: data.dateDebut, dateFin: data.dateFin, tvaVentesFigee: !!data.tvaVentesFigee };
        liquidations.push(liq);
        return Promise.resolve(liq);
      }),
    },
    tvaVenteDeclaree: {
      createMany: jest.fn().mockImplementation(({ data }) => {
        figes.push(...data.map((d: any) => ({ liquidationId: d.liquidationId, ligneEcritureId: d.ligneEcritureId, montant: d.montant, reportee: d.reportee, recouvrementId: d.recouvrementId })));
        return Promise.resolve({ count: data.length });
      }),
    },
    regularisationTvaCreance: {
      findMany: jest.fn().mockResolvedValue(options.regularisations ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    // LA DOUBLURE HONORE LA MISE À JOUR · elle ne marque qu'une perte non
    // marquée et non annulée, comme le `where` le demande.
    mouvementCreanceDouteuse: {
      findMany: jest.fn().mockResolvedValue(options.recouvrementsAuBrouillard ?? []),
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
  return { svc: new TauxTvaService(prisma, ecritureService), ecrites, pertes, prisma, figes };
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

  it('MOIS SAUTÉ · février liquidé, avril jamais, mai la récupère (la règle du « mois précédent » la perdait)', async () => {
    const { svc } = service(jeu(), [['2026-02-01', '2026-02-28']]);
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
    // Validée en mai · la déclaration (livre-journal seul) la lit désormais,
    // avril étant liquidé sans elle.
    const apres = service(jeu(), [['2026-04-01', '2026-04-30']]);
    const mai = await apres.svc.declaration('t1', ...MAI);
    expect(mai.recuperationCreancesIrrecouvrables).toBe(160_000);
  });

  it('DÉCHÉANCE · une perte de 2024 jamais imputée n’est plus reprise en 2026, et c’est dit (art. 37 al. 2, décret art. 96)', async () => {
    const { svc } = service(
      [
        { numero: '44310000', date: '2024-06-20', debit: 48_000, perte: { id: 'mv-2024' } },
        { numero: '44310000', date: '2026-01-12', credit: 500_000 },
      ],
      [['2024-05-01', '2024-05-31']],
    );
    const janvier = await svc.declaration('t1', ...periode('2026-01-01', '2026-01-31'));
    expect(janvier.recuperationCreancesIrrecouvrables).toBe(0);
    expect(janvier.recuperationCreancesDechue).toBe(48_000);
    expect(janvier.pertesCreancesARecuperer).toEqual([]);
    expect(janvier.mentionExigibilite).toContain('DÉCHUE');
    // M2 · l'autre lecture en réserve, et le virement en charge par le cabinet.
    expect(janvier.mentionExigibilite).toMatch(/se vire en charge, par le cabinet.*RÉSERVE · une autre lecture fait courir le délai depuis l’exigibilité de la vente/);
    // Une perte de 2025 reste dans le délai en 2026.
    const dans = service([{ numero: '44310000', date: '2025-03-20', debit: 48_000, perte: { id: 'mv-2025' } }], [['2025-02-01', '2025-02-28']]);
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
      regularisationTvaCreance: {
        findMany: jest.fn().mockResolvedValue([{ id: 'reg-1' }]),
        update: jest.fn().mockImplementation(({ where }) => (ordre.push(`régul ${where.id}`), Promise.resolve({}))),
      },
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
    // BL-3 · ses régularisations redeviennent à imputer · sa TVA figée part avec elle (CASCADE).
    expect(ordre).toEqual(['maj mv-mars', 'maj mv-mai', 'régul reg-1', 'suppression']);
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

describe('troisième relecture · B-3, M1, M5', () => {
  it('B-3 · AUCUNE liquidation dans OmegaX · avril impute la perte de mars, mai et juin ne l’imputent pas, et le disent', async () => {
    const { svc } = service(jeu());
    const [avril, mai, juin] = await Promise.all([
      svc.declaration('t1', ...AVRIL),
      svc.declaration('t1', ...MAI),
      svc.declaration('t1', ...periode('2026-06-01', '2026-06-30')),
    ]);
    expect([avril, mai, juin].map((d) => d.recuperationCreancesIrrecouvrables)).toEqual([160_000, 0, 0]);
    expect([mai.recuperationCreancesNonImputees, juin.recuperationCreancesNonImputees]).toEqual([160_000, 160_000]);
    expect(mai.mentionExigibilite).toContain('PERTES SUR CRÉANCES NON IMPUTÉES');
    expect(mai.netAvantImputation).toBe(0);
  });

  it('M1 · jamais dans le mois même de la perte, même par quinzaine · au plus tôt le premier jour du mois civil qui suit', async () => {
    const { svc } = service(
      [
        { numero: '44310000', date: '2026-03-10', debit: 160_000, perte: { id: 'mv-q' } },
        { numero: '44310000', date: '2026-03-20', credit: 800_000 },
      ],
      [['2026-03-01', '2026-03-15']],
    );
    const seconde = await svc.declaration('t1', ...periode('2026-03-16', '2026-03-31'));
    expect(seconde.recuperationCreancesIrrecouvrables).toBe(0);
    expect((await svc.declaration('t1', ...AVRIL)).recuperationCreancesIrrecouvrables).toBe(160_000);
  });

  it('M5 · une période LIQUIDÉE montre ce qu’ELLE a liquidé, jamais une perte redevenue libre', async () => {
    // Mai est liquidé (sans la perte, validée plus tard) · la perte, libre, ne s'y affiche pas.
    const { svc } = service(jeu(), [
      ['2026-02-01', '2026-02-28'],
      ['2026-05-01', '2026-05-31'],
    ]);
    expect((await svc.declaration('t1', ...MAI)).recuperationCreancesIrrecouvrables).toBe(0);
    expect((await svc.declaration('t1', ...periode('2026-06-01', '2026-06-30'))).recuperationCreancesIrrecouvrables).toBe(160_000);
  });
});

/**
 * B-2 · UNE TRANCHE PAR ENCAISSEMENT. Deux recouvrements de la part reclassée,
 * 580 000 en août puis 290 000 en octobre, sur une prestation de 1 160 000
 * dont 160 000 de TVA · 80 000 exigibles en août, 40 000 en octobre. La
 * fraction cumulée faisait déclarer 120 000 en octobre, et août relu après
 * octobre gardait ses 80 000 · 200 000 pour 120 000 dus.
 */
describe('B-2 · deux recouvrements, deux périodes', () => {
  it('août 80 000, octobre 40 000 · août relu après octobre ne change pas', async () => {
    const groupe = {
      statut: 'SOLDE',
      solde: 0,
      soldeAt: new Date('2026-07-02'),
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10'), creanceDouteuseReclassement: null } },
        {
          debit: 0,
          credit: 1_160_000,
          ecriture: {
            date: new Date('2026-06-30'),
            creanceDouteuseReclassement: {
              mouvements: [
                { date: new Date('2026-08-10'), montant: 580_000 },
                { date: new Date('2026-10-05'), montant: 290_000 },
              ],
            },
          },
        },
      ],
    };
    const { svc } = service([
      {
        numero: '44320000',
        date: '2026-02-10',
        credit: 160_000,
        lignes: [
          { debit: 1_160_000, credit: 0, compte: { numero: '41110001', classe: ClasseCompte.CLASSE_4, tiersCompte: null }, lettrage: groupe },
          { debit: 0, credit: 1_000_000, compte: { numero: '70610000', classe: ClasseCompte.CLASSE_7, tiersCompte: null }, lettrage: null },
        ],
      },
    ]);
    const octobre = await svc.declaration('t1', ...periode('2026-10-01', '2026-10-31'));
    const aout = await svc.declaration('t1', ...periode('2026-08-01', '2026-08-31'));
    expect([aout.totalCollecte, octobre.totalCollecte]).toEqual([80_000, 40_000]);
  });
});

/**
 * B-1 ET QUATRIÈME RELECTURE · « DÉJÀ DÉCLARÉ » SE LIT SUR LE FIGÉ. Prestation
 * de 1 000 000 + 160 000 · `tvaDesVentesOrigine` rend le figé des
 * liquidations (net des régularisations en déduction) et, à côté, ce que le
 * moteur rend exigible sur le lettrage ACTUEL.
 */
describe('B-1 · tvaDesVentesOrigine', () => {
  function moteur(options: {
    lettrage: 'aucun' | 'reclassement' | 'reglementEtReclassement';
    figee?: number;
    regularisation?: number;
    ancienneLiquidation?: boolean;
  }) {
    const reclassement = { mouvements: [] as Array<{ id: string; date: Date; montant: number }> };
    const lignesGroupe: any[] = [
      { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10'), creanceDouteuseReclassement: null } },
    ];
    if (options.lettrage === 'reglementEtReclassement') {
      lignesGroupe.push({ debit: 0, credit: 580_000, ecriture: { date: new Date('2026-02-20'), creanceDouteuseReclassement: null } });
      lignesGroupe.push({ debit: 0, credit: 580_000, ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: reclassement } });
    } else if (options.lettrage === 'reclassement') {
      lignesGroupe.push({ debit: 0, credit: 1_160_000, ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: reclassement } });
    }
    const lettrage =
      options.lettrage === 'aucun'
        ? null
        : { statut: 'SOLDE', solde: 0, soldeAt: null, createdAt: new Date('2026-06-30T10:00:00Z'), lignes: lignesGroupe };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'fac',
            date: new Date('2026-02-10'),
            lignes: [
              { compteId: 'cli', tauxTvaId: null, debit: 1_160_000, credit: 0, compte: { numero: '41110001', classe: ClasseCompte.CLASSE_4 }, lettrage },
              { compteId: 'c706', tauxTvaId: null, debit: 0, credit: 1_000_000, compte: { numero: '70610000', classe: ClasseCompte.CLASSE_7 }, lettrage: null },
              { id: 'l-tva', compteId: 'c4432', tauxTvaId: 'tx16', debit: 0, credit: 160_000, compte: { numero: '44320000', classe: ClasseCompte.CLASSE_4 }, lettrage: null },
            ],
          },
        ]),
      },
      tvaVenteDeclaree: {
        findMany: jest.fn().mockResolvedValue(
          options.figee ? [{ ecritureId: 'fac', ligneEcritureId: 'l-tva', liquidationId: 'L-fev', montant: options.figee }] : [],
        ),
      },
      regularisationTvaCreance: {
        groupBy: jest.fn().mockResolvedValue(options.regularisation ? [{ ecritureVenteId: 'fac', _sum: { montant: options.regularisation } }] : []),
      },
      liquidationTva: {
        // Février liquidé · figé, ou antérieur à la règle.
        findMany: jest.fn().mockResolvedValue(
          options.figee || options.ancienneLiquidation
            ? [
                {
                  id: 'L-fev',
                  dateDebut: new Date('2026-02-01'),
                  dateFin: new Date('2026-02-28T23:59:59.999Z'),
                  createdAt: new Date('2026-03-05T09:00:00Z'),
                  tvaVentesFigee: !options.ancienneLiquidation,
                },
              ]
            : [],
        ),
      },
    } as unknown as PrismaService;
    return { svc: new TauxTvaService(prisma, {} as EcritureService), prisma };
  }
  const lire = async (m: ReturnType<typeof moteur>) => (await m.svc.tvaDesVentesOrigine('t1', 'cli', [{ ecritureId: 'fac', part: 1_160_000 }]))[0];

  it('prestation NON LETTRÉE, liquidée en février au comptant · 160 000 FIGÉS, le moteur la lit aussi exigible', async () => {
    const v = await lire(moteur({ lettrage: 'aucun', figee: 160_000 }));
    // Le comptant de février est figé · rien n'est plus « à venir ».
    expect(v).toMatchObject({ ttcClient: 1_160_000, fractionExigible: 1, declareeFigee: 160_000, exigibleAVenir: 0, ambigu: false, aLEncaissement: true });
  });

  it('lettrée APRÈS la liquidation · le moteur ne la lit plus exigible, le FIGÉ garde les 160 000 déclarés', async () => {
    const m = moteur({ lettrage: 'reclassement', figee: 160_000 });
    const v = await lire(m);
    expect(v).toMatchObject({ fractionExigible: 0, declareeFigee: 160_000, exigibleAVenir: 0 });
    expect((m.prisma as any).tvaVenteDeclaree.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', ecritureId: { in: ['fac'] } });
  });

  it('aucune liquidation · le comptant est À VENIR, rien de figé', async () => {
    expect(await lire(moteur({ lettrage: 'aucun' }))).toMatchObject({ declareeFigee: 0, exigibleAVenir: 160_000 });
  });

  it('la régularisation d’un recouvrement annulé se retranche du figé', async () => {
    expect((await lire(moteur({ lettrage: 'reclassement', figee: 80_000, regularisation: 80_000 }))).declareeFigee).toBe(0);
  });

  it('liquidation ANTÉRIEURE au figé, groupe recréé après elle avec un règlement antérieur à sa fin · AMBIGU, à déclarer', async () => {
    expect((await lire(moteur({ lettrage: 'reglementEtReclassement', ancienneLiquidation: true }))).ambigu).toBe(true);
    expect((await lire(moteur({ lettrage: 'reclassement', ancienneLiquidation: true }))).ambigu).toBe(false);
  });
});

/**
 * LA TVA COLLECTÉE FIGÉE À LA LIQUIDATION (quatrième relecture, règle 1).
 * Prestation de 1 000 000 + 160 000 du 10 février, sans lettrage · le moteur
 * la lit au comptant, la liquidation de février la FIGE.
 */
describe('quatrième relecture · la TVA figée', () => {
  const tiers = (lettrage: unknown) => [
    { debit: 1_160_000, credit: 0, compte: { numero: '41110001', classe: ClasseCompte.CLASSE_4, tiersCompte: null }, lettrage },
    { debit: 0, credit: 1_000_000, compte: { numero: '70610000', classe: ClasseCompte.CLASSE_7, tiersCompte: null }, lettrage: null },
  ];
  const prestation = (): LigneFausse => ({ numero: '44320000', date: '2026-02-10', credit: 160_000, lignes: tiers(null) });
  const FEVRIER = periode('2026-02-01', '2026-02-28');

  it('la liquidation fige la TVA rendue exigible, vente par vente ; relue, la période rend son figé, même si le lettrage a bougé', async () => {
    const vente = prestation();
    const { svc, figes } = service([vente]);
    await liquider(svc, '2026-02-01', '2026-02-28');
    expect(figes).toEqual([{ liquidationId: 'liq-1', ligneEcritureId: 'l-0', montant: 160_000, reportee: false, recouvrementId: null }]);
    // Le lettrage bouge · la vente est lettrée avec un reclassement.
    vente.lignes = tiers({
      statut: 'SOLDE',
      solde: 0,
      soldeAt: null,
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10') } },
        { debit: 0, credit: 1_160_000, ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: { mouvements: [] } } },
      ],
    });
    const relue = await svc.declaration('t1', ...FEVRIER);
    expect(relue.totalCollecte).toBe(160_000);
    expect(relue.mentionExigibilite).toContain('PÉRIODE LIQUIDÉE');
  });

  it('M-a · une vente déclarée au comptant ne recollecte RIEN au recouvrement', async () => {
    const vente = prestation();
    const { svc } = service([vente]);
    await liquider(svc, '2026-02-01', '2026-02-28');
    vente.lignes = tiers({
      statut: 'SOLDE',
      solde: 0,
      soldeAt: null,
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10') } },
        {
          debit: 0,
          credit: 1_160_000,
          ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: { mouvements: [{ id: 'rec-1', date: new Date('2026-08-10'), montant: 580_000 }] } },
        },
      ],
    });
    expect((await svc.declaration('t1', ...periode('2026-08-01', '2026-08-31'))).totalCollecte).toBe(0);
  });

  it('les tranches d’un recouvrement figées à son nom · le recouvrement est nommé sur la ligne figée', async () => {
    const vente = prestation();
    vente.lignes = tiers({
      statut: 'SOLDE',
      solde: 0,
      soldeAt: null,
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10') } },
        {
          debit: 0,
          credit: 1_160_000,
          ecriture: { date: new Date('2026-06-30'), creanceDouteuseReclassement: { mouvements: [{ id: 'rec-1', date: new Date('2026-08-10'), montant: 580_000 }] } },
        },
      ],
    });
    const { svc, figes } = service([vente]);
    await liquider(svc, '2026-08-01', '2026-08-31');
    expect(figes).toEqual([{ liquidationId: 'liq-1', ligneEcritureId: 'l-0', montant: 80_000, reportee: false, recouvrementId: 'rec-1' }]);
  });

  it('M-b · un règlement daté dans une période liquidée, lettré après elle, se REPORTE à la première période non liquidée', async () => {
    const vente = prestation();
    // Lettrée d'abord avec le reclassement · rien d'exigible en mars, mars liquidé (figé vide pour elle).
    const groupe = {
      statut: 'PARTIEL',
      solde: 580_000,
      soldeAt: null,
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10') } },
        { debit: 0, credit: 580_000, ecriture: { date: new Date('2026-03-15') } },
      ],
    };
    vente.lignes = tiers({ ...groupe, solde: 1_160_000, lignes: [groupe.lignes[0]] });
    // Une autre vente de mars, au comptant, pour que mars se liquide.
    const { svc, figes } = service([vente, { numero: '44310000', date: '2026-03-10', credit: 800_000 }]);
    await liquider(svc, '2026-03-01', '2026-03-31');
    expect(figes.filter((f) => f.ligneEcritureId === 'l-0')).toEqual([]);
    // Le règlement du 15 mars est lettré après la liquidation de mars.
    vente.lignes = tiers(groupe);
    const juin = await svc.declaration('t1', ...periode('2026-06-01', '2026-06-30'));
    expect(juin.collecteReportee).toBe(80_000);
    expect(juin.totalCollecte).toBe(80_000);
    expect(juin.mentionExigibilite).toContain('TRANCHES REPORTÉES');
  });

  it('M-c · un AVOIR lettré n’est pas un encaissement · seule la part réglée devient exigible, à la date du règlement', async () => {
    const vente = prestation();
    vente.lignes = tiers({
      statut: 'SOLDE',
      solde: 0,
      soldeAt: null,
      lignes: [
        { debit: 1_160_000, credit: 0, ecriture: { date: new Date('2026-02-10') } },
        { debit: 0, credit: 580_000, ecriture: { date: new Date('2026-03-05'), facture: { nature: 'NOTE_DE_CREDIT' } } },
        { debit: 0, credit: 580_000, ecriture: { date: new Date('2026-05-20') } },
      ],
    });
    const { svc } = service([vente]);
    const [mars, mai] = await Promise.all([svc.declaration('t1', ...MARS), svc.declaration('t1', ...MAI)]);
    expect([mars.totalCollecte, mai.totalCollecte]).toEqual([0, 80_000]);
  });

  it('BL-2 · la liquidation est REFUSÉE tant qu’un recouvrement dont la TVA dépend est au brouillard dans la période', async () => {
    const { svc, prisma } = service(jeu(), [], { recouvrementsAuBrouillard: [{ date: new Date('2026-04-20'), montant: 580_000 }] });
    await expect(liquider(svc, '2026-04-01', '2026-04-30')).rejects.toThrow(/recouvrement\(s\) de créances douteuses de la période sont encore au brouillard/);
    expect((prisma as any).mouvementCreanceDouteuse.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      type: 'RECOUVREMENT',
      tvaEnDepend: true,
      annuleeLe: null,
      ecriture: { statut: 'BROUILLARD' },
    });
  });

  it('BL-3 · la régularisation d’un recouvrement annulé après liquidation s’impute en DÉDUCTION une seule fois, et la liquidation la marque', async () => {
    const { svc, prisma, ecrites } = service(jeu(), [], {
      regularisations: [{ id: 'reg-1', sens: 'DEDUCTION', montant: 80_000, compteId: 'c443', tauxTvaId: 'tx16', liquidationImputationId: null }],
    });
    const avril = await svc.declaration('t1', ...AVRIL);
    expect(avril.regularisationDeduction).toBe(80_000);
    expect(avril.netAvantImputation).toBe(3_200_000 - 160_000 - 80_000);
    await liquider(svc, '2026-04-01', '2026-04-30');
    expect((prisma as any).regularisationTvaCreance.update).toHaveBeenCalledWith({
      where: { id: 'reg-1', tenantId: 't1', liquidationImputationId: null },
      data: { liquidationImputationId: 'liq-1' },
    });
    expect(ecrites[0].find((l) => /art\. 52/.test(l.libelle ?? ''))).toMatchObject({ compteId: 'c443', credit: 240_000 });
  });
});
