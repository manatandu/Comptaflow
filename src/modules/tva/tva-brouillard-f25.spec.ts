import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F25 · LA DÉCLARATION DE TVA NE LIT QUE LE LIVRE-JOURNAL.
 *
 * Une écriture au brouillard n'est pas entrée au livre-journal (AUDCIF
 * art. 22, 2°) : elle peut encore être modifiée ou supprimée. La déclaration,
 * le prorata et la liquidation la lisaient pourtant, si bien qu'une taxe
 * déclarée pouvait reposer sur une pièce qui disparaîtrait le lendemain.
 * Le résultat fiscal et le registre des retenues, eux, ne lisaient déjà que le
 * livre-journal.
 *
 * L'autre moitié est aussi importante que la première · filtrer seul ferait
 * disparaître de la déclaration une facture oubliée au brouillard, sans que
 * rien à l'écran ne le dise, et la taxe de la période serait minorée d'autant.
 * La déclaration COMPTE donc ce qui reste au brouillard et le NOMME.
 *
 * La doublure honore le statut · une doublure qui rendrait les mêmes lignes
 * quel que soit le filtre validerait un code qui ne filtre pas.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'Taux normal 16 %',
  taux: 16,
  compteCollecteId: 'c4431',
  compteDeductibleId: 'c4452',
  estActif: true,
};

interface LigneTva {
  numero: string;
  debit: number;
  credit: number;
  statut: 'VALIDEE' | 'BROUILLARD';
}

type Where = {
  compte?: { numero?: { startsWith: string }; OR?: { numero: { startsWith: string } }[]; classe?: string };
  ecriture?: { statut?: string };
};

function service(lignes: LigneTva[]) {
  const lectures: Where[] = [];
  const garde = (where: Where, statut: string | undefined) => !statut || where.ecriture?.statut === statut;
  const prisma = {
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ regimeExigibiliteTva: 'DEBITS', referentiel: 'SYSCOHADA', dateAutorisationDebitsTva: null }),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    compte: { findMany: jest.fn().mockResolvedValue([{ id: 'c4452' }]) },
    ecriture: {
      count: jest.fn().mockImplementation(({ where }: { where: { statut?: string } }) =>
        Promise.resolve(lignes.filter((l) => l.statut === where.statut).length),
      ),
    },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Where }) => {
        lectures.push(where);
        if (!where.compte?.OR) return Promise.resolve([]);
        const racines = where.compte.OR.map((c) => c.numero.startsWith);
        return Promise.resolve(
          lignes
            .filter((l) => garde(where, l.statut) && racines.some((r) => l.numero.startsWith(r)))
            .map((l, i) => ({
              id: `l${i}`,
              tauxTvaId: TAUX.id,
              compte: { numero: l.numero },
              debit: l.debit,
              credit: l.credit,
              ecriture: { date: new Date('2026-03-15'), lignes: [] },
            })),
        );
      }),
      aggregate: jest.fn().mockImplementation(({ where }: { where: Where }) => {
        lectures.push(where);
        const racine = where.compte?.numero?.startsWith;
        const retenues = racine
          ? lignes.filter((l) => l.numero.startsWith(racine) && l.statut === where.ecriture?.statut)
          : [];
        return Promise.resolve({
          _sum: {
            debit: retenues.reduce((s, l) => s + l.debit, 0),
            credit: retenues.reduce((s, l) => s + l.credit, 0),
          },
        });
      }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return { svc: new TauxTvaService(prisma, {} as EcritureService), lectures, prisma };
}

const DEBUT = new Date('2026-03-01');
const FIN = new Date('2026-03-31');

describe('Déclaration de TVA · le livre-journal seul (audit final F25)', () => {
  it('une facture au brouillard n’entre pas dans la déclaration', async () => {
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 100_000, statut: 'VALIDEE' },
      { numero: '44310000', debit: 0, credit: 40_000, statut: 'BROUILLARD' },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalCollecte).toBe(100_000);
  });

  it('ce qui reste au brouillard est compté et NOMMÉ dans la déclaration', async () => {
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 100_000, statut: 'VALIDEE' },
      { numero: '44310000', debit: 0, credit: 40_000, statut: 'BROUILLARD' },
      { numero: '44520000', debit: 8_000, credit: 0, statut: 'BROUILLARD' },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.tvaAuBrouillard).toEqual({ collecte: 40_000, deductible: 8_000, ecritures: 2 });
    const mention = d.mentionExigibilite;
    expect(mention).toContain('TVA RESTÉE AU BROUILLARD, HORS DE CETTE DÉCLARATION');
    expect(mention).toContain(`${(40_000).toLocaleString('fr-FR')} CDF de TVA facturée`);
    expect(mention).toContain(`${(8_000).toLocaleString('fr-FR')} CDF de TVA récupérable`);
    expect(mention).toContain('AUDCIF art. 22, 2°');
  });

  it('sans rien au brouillard, la déclaration ne dit rien de plus', async () => {
    const { svc } = service([{ numero: '44310000', debit: 0, credit: 100_000, statut: 'VALIDEE' }]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.tvaAuBrouillard.ecritures).toBe(0);
    expect(d.mentionExigibilite).not.toContain('TVA RESTÉE AU BROUILLARD');
  });

  it('toute lecture de lignes de la déclaration porte un statut · aucune ne lit les deux', async () => {
    // Une lecture sans statut mêlerait brouillard et livre-journal · c'est
    // exactement le défaut, et il suffit d'une seule pour le rouvrir (le
    // prorata en compte trois).
    const { svc, lectures } = service([{ numero: '44310000', debit: 0, credit: 100_000, statut: 'VALIDEE' }]);
    await svc.declaration('t1', DEBUT, FIN);
    expect(lectures.length).toBeGreaterThan(3);
    for (const w of lectures) expect(['VALIDEE', 'BROUILLARD']).toContain(w.ecriture?.statut);
  });

  it('le prorata définitif ne lit que le livre-journal', async () => {
    const { svc, lectures } = service([{ numero: '44520000', debit: 16_000, credit: 0, statut: 'VALIDEE' }]);
    await svc.prorataDefinitif('t1', 2026);
    expect(lectures.length).toBeGreaterThan(0);
    for (const w of lectures) expect(w.ecriture?.statut).toBe('VALIDEE');
  });
});

describe('Liquidation · refusée tant que la période porte de la TVA au brouillard (F25)', () => {
  it('nomme le nombre d’écritures et les montants, et ne liquide rien', async () => {
    const { svc, prisma } = service([
      { numero: '44310000', debit: 0, credit: 100_000, statut: 'VALIDEE' },
      { numero: '44310000', debit: 0, credit: 40_000, statut: 'BROUILLARD' },
    ]);
    await expect(
      svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-03-01', dateFin: '2026-03-31' }),
    ).rejects.toThrow(/1 écriture\(s\) de la période portent encore de la TVA au brouillard/);
    expect((prisma as unknown as { liquidationTva: { create: jest.Mock } }).liquidationTva.create).not.toHaveBeenCalled();
  });
});
