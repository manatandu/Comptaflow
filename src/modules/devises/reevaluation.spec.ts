import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * La distinction que le SYCEBNL prend soin de poser, et qu'un logiciel
 * généraliste écrase : une CRÉANCE en devise donne à la clôture un écart
 * LATENT (478/479), une DISPONIBILITÉ en devise donne un écart RÉALISÉ
 * (676/776). Le texte le dit mot pour mot : « Le compte 676 ne doit pas être
 * confondu avec le compte 478 qui n'enregistre que les pertes probables de
 * change », et « les écarts de conversion négatifs constatés à la clôture sur
 * les disponibilités en devises sont considérés comme étant des pertes de
 * change supportées ».
 *
 * S'y ajoute la prudence : la perte probable est provisionnée, le gain
 * probable ne l'est jamais.
 */

type Faux = Record<string, unknown>;

interface LigneTest {
  compteNumero: string;
  deviseCode: string;
  debit: number;
  credit: number;
  montantDevise: number;
}

function service(lignes: LigneTest[], coursCloture: number | null) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        statut: 'OUVERT',
      }),
    },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(
        lignes.map((l, i) => ({
          compteId: `c-${l.compteNumero}`,
          deviseId: `d-${l.deviseCode}`,
          debit: l.debit,
          credit: l.credit,
          montantDevise: l.montantDevise,
          compte: { id: `c-${l.compteNumero}`, numero: l.compteNumero, intitule: `Compte ${i}` },
          devise: { id: `d-${l.deviseCode}`, code: l.deviseCode },
        })),
      ),
    },
    coursDevise: {
      findFirst: jest.fn().mockResolvedValue(coursCloture === null ? null : { cours: coursCloture }),
    },
  } as Faux;
  return new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
}

describe('réévaluation · créances et dettes contre disponibilités', () => {
  it('une créance en USD qui se déprécie donne une PERTE LATENTE, provisionnée', async () => {
    // Créance de 1 000 USD inscrite à 2 800 000 (cours 2 800), cours de
    // clôture 2 500 : la créance ne vaut plus que 2 500 000.
    const r = await service(
      [{ compteNumero: '41200000', deviseCode: 'USD', debit: 2_800_000, credit: 0, montantDevise: 1000 }],
      2500,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].ecart).toBe(-300_000);
    expect(r.perteLatente).toBe(300_000);
    expect(r.perteRealisee).toBe(0);
    // Prudence : la perte probable est provisionnée.
    expect(r.provision).toBe(300_000);
  });

  it('une créance qui s’apprécie donne un GAIN LATENT, jamais provisionné', async () => {
    const r = await service(
      [{ compteNumero: '41200000', deviseCode: 'USD', debit: 2_500_000, credit: 0, montantDevise: 1000 }],
      2800,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.gainLatent).toBe(300_000);
    expect(r.perteLatente).toBe(0);
    expect(r.provision).toBe(0);
  });

  it('une disponibilité en devise donne un écart RÉALISÉ, sans provision', async () => {
    // Compte 52 : banque en devises. L'écart va au résultat, pas au 478.
    const r = await service(
      [{ compteNumero: '52120000', deviseCode: 'USD', debit: 2_800_000, credit: 0, montantDevise: 1000 }],
      2500,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions[0].estTresorerie).toBe(true);
    expect(r.perteRealisee).toBe(300_000);
    expect(r.perteLatente).toBe(0);
    // Un écart réalisé n'appelle aucune provision : il est déjà au résultat.
    expect(r.provision).toBe(0);
  });

  it('une dette en devise se réévalue comme une position nette créditrice', async () => {
    // Dette de 1 000 USD inscrite à 2 500 000 ; cours de clôture 2 800 : la
    // dette coûte désormais 2 800 000, l'entité y perd 300 000.
    const r = await service(
      [{ compteNumero: '40110000', deviseCode: 'USD', debit: 0, credit: 2_500_000, montantDevise: 1000 }],
      2800,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions[0].montantDevise).toBe(-1000);
    expect(r.positions[0].valeurComptable).toBe(-2_500_000);
    expect(r.positions[0].valeurReevaluee).toBe(-2_800_000);
    expect(r.perteLatente).toBe(300_000);
  });

  it('agrège les lignes d’un même compte et d’une même devise', async () => {
    const r = await service(
      [
        { compteNumero: '41200000', deviseCode: 'USD', debit: 2_800_000, credit: 0, montantDevise: 1000 },
        { compteNumero: '41200000', deviseCode: 'USD', debit: 0, credit: 1_400_000, montantDevise: 500 },
      ],
      2500,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].montantDevise).toBe(500);
    expect(r.positions[0].valeurComptable).toBe(1_400_000);
    expect(r.positions[0].ecart).toBe(-150_000);
  });

  it('signale la devise sans cours coté plutôt que de réévaluer à l’aveugle', async () => {
    const r = await service(
      [{ compteNumero: '41200000', deviseCode: 'EUR', debit: 3_000_000, credit: 0, montantDevise: 1000 }],
      null,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions).toHaveLength(0);
    expect(r.coursManquants).toEqual(['EUR']);
  });

  it('ignore une position soldée', async () => {
    const r = await service(
      [
        { compteNumero: '41200000', deviseCode: 'USD', debit: 2_800_000, credit: 0, montantDevise: 1000 },
        { compteNumero: '41200000', deviseCode: 'USD', debit: 0, credit: 2_800_000, montantDevise: 1000 },
      ],
      2500,
    ).calculer('t1', { exerciceId: 'ex1' });

    expect(r.positions).toHaveLength(0);
  });
});
