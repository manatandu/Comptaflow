import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA TVA D'UNE CRÉANCE IRRÉCOUVRABLE DANS LA DÉCLARATION (ligne A7, E2).
 *
 * O.-L. n° 10/001, art. 52 · la TVA des ventes qui « restent impayés peut être
 * récupérée par voie d'imputation sur l'impôt dû pour les opérations faites
 * ultérieurement ». Décret n° 011/42, art. 126 · elle « est inscrite dans les
 * déductions afférentes à la déclaration du ou des mois suivants celui de la
 * constatation [...] de non-paiement, dans les conditions prévues pour exercer
 * le droit à déduction ».
 *
 * La perte (module des créances douteuses) passe D 651 / D 443 / C 416, la
 * ligne de 443 portant le taux de la vente d'origine. Trois propriétés gelées
 * ici · la ligne n'est JAMAIS retranchée de la collecte du mois de la perte ;
 * elle est inscrite en déduction dans la déclaration du MOIS QUI SUIT, sur sa
 * propre ligne, une seule fois ; et la liquidation de ce mois-là la solde au
 * 443, l'écriture restant équilibrée. Une ligne D 443 hors de la déclaration
 * ferait payer la taxe deux fois sans aucun signal (§ 10 bis).
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

interface LigneFausse {
  numero: string;
  date: string;
  debit?: number;
  credit?: number;
  /** La ligne vient de la perte d'une créance douteuse. */
  perte?: boolean;
}

function service(lignes: LigneFausse[]) {
  const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
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
          lignes.map((l) => ({
            id: `l-${l.numero}-${l.date}-${l.debit ?? 0}`,
            tauxTvaId: TAUX.id,
            compteId: l.numero === '44310000' ? 'c443' : 'c445',
            compte: { numero: l.numero },
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            ecriture: { date: new Date(l.date), lignes: [], mouvementCreanceDouteuse: l.perte ? { id: 'mv-1' } : null },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { lignes: { compteId: string; debit?: number; credit?: number; libelle?: string }[] }) => {
      ecrites.push(dto.lignes);
      return Promise.resolve({ id: 'e-liq' });
    }),
  } as unknown as EcritureService;
  return { svc: new TauxTvaService(prisma, ecritureService), ecrites };
}

// Vente de 1 000 000 HT en janvier (160 000 de TVA), perdue le 20 mars · la
// perte récupère 160 000 au 443. Avril vend aussi, 3 200 000 de TVA.
const JEU: LigneFausse[] = [
  { numero: '44310000', date: '2026-01-15', credit: 160_000 },
  { numero: '44310000', date: '2026-03-10', credit: 800_000 },
  { numero: '44310000', date: '2026-03-20', debit: 160_000, perte: true },
  { numero: '44310000', date: '2026-04-12', credit: 3_200_000 },
];
const MARS = [new Date('2026-03-01'), new Date('2026-03-31T23:59:59.999Z')] as const;
const AVRIL = [new Date('2026-04-01'), new Date('2026-04-30T23:59:59.999Z')] as const;
const MAI = [new Date('2026-05-01'), new Date('2026-05-31T23:59:59.999Z')] as const;

describe('TVA d’une créance irrécouvrable · déclaration des mois M et M+1 (art. 52, décret art. 126)', () => {
  it('mois M · la collecte n’est PAS minorée, la TVA est dite constatée, rien n’est déduit', async () => {
    const { svc } = service(JEU);
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

  it('mois M+1 · la TVA est inscrite en DÉDUCTION sur sa ligne propre, hors des avoirs de l’art. 52 et sans prorata', async () => {
    const { svc } = service(JEU);
    const d = await svc.declaration('t1', ...AVRIL);
    expect(d.totalCollecte).toBe(3_200_000);
    expect(d.recuperationCreancesIrrecouvrables).toBe(160_000);
    expect(d.recuperationArt52).toBe(0);
    expect(d.avoirsCollecteNonImputes).toBe(0);
    expect(d.netAvantImputation).toBe(3_040_000);
    expect(d.lignes[0]).toMatchObject({ recuperationCreancesIrrecouvrables: 160_000, net: 3_040_000 });
    expect(d.mentionExigibilite).toContain('RÉCUPÉRATION SUR CRÉANCE IRRÉCOUVRABLE, ART. 52');
  });

  it('UNE SEULE FOIS · ni M+2, ni la collecte de M, ni une collecte négative ne la reprennent', async () => {
    const { svc } = service(JEU);
    const [mars, avril, mai] = await Promise.all([svc.declaration('t1', ...MARS), svc.declaration('t1', ...AVRIL), svc.declaration('t1', ...MAI)]);
    const deductions = [mars, avril, mai].map((d) => d.recuperationCreancesIrrecouvrables + d.recuperationArt52);
    expect(deductions).toEqual([0, 160_000, 0]);
    // La collecte de chaque mois reste celle des seules ventes · la ligne D 443
    // n'est jamais lue comme une TVA collectée négative.
    expect([mars.totalCollecte, avril.totalCollecte, mai.totalCollecte]).toEqual([800_000, 3_200_000, 0]);
  });

  it('la liquidation de M+1 solde le 443 par la ligne de récupération, et l’écriture reste équilibrée', async () => {
    const { svc, ecrites } = service(JEU);
    await svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex', dateDebut: '2026-04-01', dateFin: '2026-04-30T23:59:59.999Z' });
    const lignes = ecrites[0];
    const recuperation = lignes.find((l) => /restées impayées \(art\. 52\)/.test(l.libelle ?? ''));
    expect(recuperation).toMatchObject({ compteId: 'c443', credit: 160_000 });
    const due = lignes.find((l) => l.libelle === 'TVA due');
    expect(due?.credit).toBe(3_040_000);
    const d = lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const c = lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(Math.round((d - c) * 100)).toBe(0);
  });
});
