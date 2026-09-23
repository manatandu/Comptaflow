import { NatureFacture } from '@prisma/client';
import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * I3 · LA RÉCUPÉRATION DE L'ART. 52 EST SUBORDONNÉE À UNE PIÈCE.
 *
 * O.-L. n° 10/001, art. 52 al. 2 : « Pour les opérations annulées ou
 * résiliées, la récupération de la taxe acquittée est subordonnée à
 * l'établissement et à l'envoi au client d'une facture nouvelle ou note de
 * crédit annulant et remplaçant la facture initiale. »
 *
 * La déclaration écrivait « OmegaX ne peut pas le vérifier ». Depuis que la
 * facturation émet la note et la rattache à l'écriture, il le peut pour les
 * notes qu'il a émises. Le montant n'est PAS retiré, il est SIGNALÉ : une note
 * émise hors d'OmegaX est une pièce valable que le logiciel ne voit pas.
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

interface LigneFausse {
  date: string;
  debit?: number;
  credit?: number;
  nature?: NatureFacture;
}

function service(lignes: LigneFausse[], derniere: { dateDebut: Date; dateFin: Date } | null = null) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where, include }: { where: Record<string, unknown>; include?: any }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        // La requête DOIT demander la pièce · sinon la nature ne serait jamais
        // lue en production, quoi que ce doublon renvoie.
        const demandeLaPiece = !!include?.ecriture?.include?.facture;
        return Promise.resolve(
          lignes.map((l, i) => ({
            id: `l${i}`,
            tauxTvaId: TAUX.id,
            compte: { numero: '44310000' },
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            ecriture: {
              date: new Date(l.date),
              lignes: [],
              facture: demandeLaPiece && l.nature ? { nature: l.nature } : null,
            },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const dateFin = where.dateFin as { lt?: Date } | undefined;
        if (dateFin?.lt === undefined || !derniere) return Promise.resolve(null);
        return Promise.resolve({ id: 'liq', ...derniere, net: 0, ecritureId: 'e-liq' });
      }),
    },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const AVRIL = new Date('2026-04-01');
const FIN_AVRIL = new Date('2026-04-30T23:59:59.999Z');

describe('Avoir sur vente · la note de crédit qui le justifie', () => {
  it('un avoir SANS note de crédit est signalé, et son montant n’est pas retiré', async () => {
    const d = await service([
      { date: '2026-03-10', credit: 3_200_000 },
      { date: '2026-03-20', debit: 1_600_000 },
    ]).declaration('t1', MARS, FIN_MARS);
    expect(d.avoirsSansNoteDeCredit).toBe(1_600_000);
    expect(d.avoirsCollecteConstates).toBe(1_600_000);
    expect(d.mentionExigibilite).toContain('AVOIRS SANS NOTE DE CRÉDIT');
    expect(d.mentionExigibilite).toContain('article 52, alinéa 2');
  });

  it('un avoir JUSTIFIÉ par une note émise par OmegaX n’est pas signalé', async () => {
    const d = await service([
      { date: '2026-03-10', credit: 3_200_000 },
      { date: '2026-03-20', debit: 1_600_000, nature: NatureFacture.NOTE_DE_CREDIT },
    ]).declaration('t1', MARS, FIN_MARS);
    expect(d.avoirsSansNoteDeCredit).toBe(0);
    expect(d.mentionExigibilite).not.toContain('AVOIRS SANS NOTE DE CRÉDIT');
    // Le montant, lui, est le même dans les deux cas.
    expect(d.avoirsCollecteConstates).toBe(1_600_000);
  });

  it('une FACTURE rattachée à l’écriture ne justifie pas un avoir · seule la note le fait', async () => {
    const d = await service([{ date: '2026-03-20', debit: 1_600_000, nature: NatureFacture.FACTURE }]).declaration(
      't1',
      MARS,
      FIN_MARS,
    );
    expect(d.avoirsSansNoteDeCredit).toBe(1_600_000);
  });

  it('au mois de l’IMPUTATION aussi, l’avoir sans note est signalé', async () => {
    // Mars liquidé, avoir constaté le 20 mars, imputé en avril. C'est en avril
    // que la taxe est récupérée, et c'est là que la condition mord.
    const d = await service(
      [
        { date: '2026-03-20', debit: 1_600_000 },
        { date: '2026-04-10', credit: 2_000_000 },
      ],
      { dateDebut: MARS, dateFin: FIN_MARS },
    ).declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.recuperationArt52).toBe(1_600_000);
    expect(d.avoirsSansNoteDeCredit).toBe(1_600_000);
  });

  it('un avoir déjà imputé avant la dernière liquidation n’est pas signalé une seconde fois', async () => {
    const d = await service(
      [{ date: '2026-02-20', debit: 1_600_000 }],
      { dateDebut: MARS, dateFin: FIN_MARS },
    ).declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.avoirsSansNoteDeCredit).toBe(0);
  });

  it('la phrase qui disait « OmegaX ne peut pas le vérifier » ne le dit plus', async () => {
    // UNE GARANTIE NÉGATIVE VIEILLIT · elle était vraie avant I3, elle est
    // fausse depuis. Ce qui reste invisible est nommé à la place.
    const d = await service([{ date: '2026-03-20', debit: 1_600_000 }]).declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).not.toContain('OmegaX ne peut pas le vérifier');
    expect(d.mentionExigibilite).toContain('il ne voit pas une note émise ailleurs');
  });
});
