import { SensDepreciation } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE BIEN REPRIS · l'erreur qui ne se signale jamais.
 *
 * Le calcul de la dotation ne connaissait que les annuités passées PAR OmegaX.
 * Un bien mis en service en 2020, repris dans un dossier ouvert en 2026, n'en
 * portait donc aucune : le logiciel repartait de zéro et l'amortissait sa durée
 * ENTIÈRE une seconde fois.
 *
 * Rien ne cassait. Les écritures s'équilibraient, aucun total ne bougeait, et
 * la valeur nette comptable des états s'écartait silencieusement du solde du
 * compte 28 repris par le bilan d'ouverture. C'est la forme d'erreur la plus
 * coûteuse : celle qu'aucun contrôle d'équilibre n'attrape.
 *
 * Deux effets, et le second est le moins évident : l'amortissement antérieur
 * entre dans le CUMUL (donc dans le reliquat à doter et dans la VCN), et il
 * ferme la porte au PRORATA de première annuité · un bien repris a déjà passé
 * sa première année, ailleurs. Sans cela, il aurait subi un second prorata.
 */

type Faux = Record<string, unknown>;

interface Cas {
  valeurOrigine: number;
  valeurResiduelle?: number;
  dureeAns: number;
  dateMiseEnService: string;
  amortissementAnterieur?: number;
  dotations?: number[];
  /** Dépréciations ANTÉRIEURES · sens et montant, plus la clôture qui les date. */
  depreciations?: Array<{ sens: SensDepreciation; montant: number; exercice: { dateFin: Date } }>;
  exercice?: { dateDebut: string; dateFin: string };
}

/** Le montant que `passerDotation` calcule, saisi au vol dans l'écriture. */
async function dotation(c: Cas): Promise<number> {
  const exercice = c.exercice ?? { dateDebut: '2026-01-01', dateFin: '2026-12-31' };
  let montant = 0;
  const prisma = {
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'i1',
        designation: 'Bien',
        statut: 'EN_SERVICE',
        valeurOrigine: c.valeurOrigine,
        valeurResiduelle: c.valeurResiduelle ?? 0,
        dureeAmortissementAns: c.dureeAns,
        dateMiseEnService: new Date(c.dateMiseEnService),
        amortissementAnterieur: c.amortissementAnterieur ?? 0,
        compteDotationId: 'cd',
        compteAmortissementId: 'ca',
        dotations: (c.dotations ?? []).map((m, i) => ({ montant: m, exerciceId: `ex${i}` })),
        // Le module charge désormais les dépréciations avec le bien · elles
        // changent la base amortissable (AUDCIF Titre VIII ch. 12 § 2.4.1).
        // Un faux qui les omettrait ferait passer le service pour cassé.
        depreciations: c.depreciations ?? [],
      }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exN',
        dateDebut: new Date(exercice.dateDebut),
        dateFin: new Date(exercice.dateFin),
      }),
    },
    dotationAmortissement: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
  } as Faux;
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { lignes: { debit?: number }[] }) => {
      montant = dto.lignes[0].debit ?? 0;
      return Promise.resolve({ id: 'e1' });
    }),
  } as unknown as EcritureService;
  const svc = new ImmobilisationService(prisma as unknown as PrismaService, ecritures);
  await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
  return Math.round(montant * 100) / 100;
}

describe('Amortissement antérieur d’un bien repris', () => {
  const BIEN = { valeurOrigine: 5_000_000, dureeAns: 5, dateMiseEnService: '2020-04-10' };

  it('sans lui, le bien repart pour une durée ENTIÈRE · le défaut', async () => {
    // Le comportement à ne pas retrouver : quatre annuités déjà passées
    // ailleurs, et le logiciel dote comme si le bien était neuf.
    const m = await dotation(BIEN);
    expect(m).toBe(1_000_000);
  });

  it('avec lui, le reliquat seul est doté', async () => {
    // 4 000 000 déjà amortis sur 5 000 000 : il ne reste que 1 000 000, et
    // l'annuité pleine de 1 000 000 s'y arrête exactement.
    const m = await dotation({ ...BIEN, amortissementAnterieur: 4_000_000 });
    expect(m).toBe(1_000_000);
  });

  it('et le bien entièrement amorti ne dote plus rien', async () => {
    await expect(dotation({ ...BIEN, amortissementAnterieur: 5_000_000 })).rejects.toThrow(
      /déjà entièrement amorti/,
    );
  });

  it('le reliquat est PLAFONNÉ · on ne dote jamais au-delà de ce qui reste', async () => {
    // 4 600 000 amortis : il ne reste que 400 000, moins qu'une annuité.
    const m = await dotation({ ...BIEN, amortissementAnterieur: 4_600_000 });
    expect(m).toBe(400_000);
  });

  it('ferme la porte au PRORATA de première annuité', async () => {
    // Mise en service en octobre : sans amortissement antérieur, la première
    // annuité serait proratisée à 3/12. Un bien REPRIS a déjà passé sa
    // première année ailleurs · il reçoit l'annuité pleine.
    const proratise = await dotation({ ...BIEN, dateMiseEnService: '2026-10-05' });
    expect(proratise).toBe(250_000);

    const repris = await dotation({
      ...BIEN,
      dateMiseEnService: '2020-10-05',
      amortissementAnterieur: 1_000_000,
    });
    expect(repris).toBe(1_000_000);
  });

  it('s’ajoute aux dotations déjà passées dans le logiciel', async () => {
    // 3 000 000 repris + 1 000 000 doté ici = 4 000 000 · il reste 1 000 000.
    const m = await dotation({ ...BIEN, amortissementAnterieur: 3_000_000, dotations: [1_000_000] });
    expect(m).toBe(1_000_000);

    const solde = await dotation({
      ...BIEN,
      amortissementAnterieur: 3_000_000,
      dotations: [1_000_000, 800_000],
    });
    expect(solde).toBe(200_000);
  });

  it('tient compte de la valeur résiduelle · la base amortissable, pas la valeur d’origine', async () => {
    // 5 000 000 de valeur d'origine, 500 000 de résiduelle : la base vaut
    // 4 500 000, l'annuité 900 000.
    const m = await dotation({ ...BIEN, valeurResiduelle: 500_000, amortissementAnterieur: 3_600_000 });
    expect(m).toBe(900_000);
  });
});
