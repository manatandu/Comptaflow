import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE CALCUL DES TRANCHES, EXERCÉ · pas seulement relu.
 *
 * Le spec voisin (`balance-agee-modele`) lit le source et verrouille le
 * MODÈLE. Il ne prouve rien de l'arithmétique : un découpage mensuel faux
 * d'un jour le passerait sans broncher. Celui-ci fait tourner le service sur
 * un jeu d'échéances placées aux bornes exactes.
 *
 * Exercice 2025 entier, date de référence au 31/12/2025 · sept tranches
 * attendues, comme dans le modèle relevé :
 *
 *   0 · avant le 01/01/2025      (antérieur à l'exercice)
 *   1 · du 01/01 au 31/07        (180 jours et plus)
 *   2 · août   3 · septembre   4 · octobre   5 · novembre   6 · décembre
 */

function ligneEcriture(compte: string, debit: number, credit: number, echeance: string | null, date: string) {
  return {
    debit,
    credit,
    dateEcheance: echeance ? new Date(echeance) : null,
    compte: { id: `c-${compte}`, numero: compte, intitule: `Compte ${compte}` },
    ecriture: { date: new Date(date) },
  };
}

function service(
  lignes: ReturnType<typeof ligneEcriture>[],
  rattachements: Array<{ compteId: string; tiers: { id: string; code: string; nom: string } }> = [],
) {
  const prisma = {
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        dateDebut: new Date('2025-01-01'),
        dateFin: new Date('2025-12-31'),
      }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue(rattachements) },
  } as unknown as PrismaService;
  return new EcritureService(prisma, {} as never, {} as never, {} as never);
}

const AU_31_12 = { exerciceId: 'ex', dateReference: '2025-12-31' };

describe('balance âgée · découpage des tranches', () => {
  it('ouvre sept tranches sur un exercice civil entier', async () => {
    const r = await service([]).balanceAgee('t', AU_31_12);
    expect(r.tranches.map((t) => t.cle)).toEqual([
      'ouverture',
      'ancien',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
    ]);
    expect(r.tranches[1].libelleAge).toBe('180 jours et plus');
    expect(r.tranches[6].libelleAge).toBe('Moins de 30 jours');
    expect(r.tranches[6].libellePeriode).toBe('Du 01/12/2025 au 31/12/2025');
  });

  it('range chaque échéance dans SA tranche, bornes comprises', async () => {
    // Une échéance au premier jour d'un mois appartient à ce mois ; au dernier
    // jour aussi. C'est l'erreur classique d'un découpage à la louche.
    const r = await service([
      ligneEcriture('411001', 100, 0, '2024-12-31', '2025-01-05'), // avant l'exercice
      ligneEcriture('411001', 200, 0, '2025-07-31', '2025-07-31'), // dernier jour du bloc ancien
      ligneEcriture('411001', 400, 0, '2025-08-01', '2025-08-01'), // premier jour d'août
      ligneEcriture('411001', 800, 0, '2025-11-30', '2025-11-30'), // dernier jour de novembre
      ligneEcriture('411001', 1600, 0, '2025-12-01', '2025-12-01'), // premier jour de décembre
    ]).balanceAgee('t', AU_31_12);

    expect(r.debiteurs).toHaveLength(1);
    expect(r.debiteurs[0].montants).toEqual([100, 200, 400, 0, 0, 800, 1600]);
    expect(r.debiteurs[0].solde).toBe(3100);
  });

  it('reprend la date d’écriture quand l’échéance n’est pas saisie', async () => {
    const r = await service([ligneEcriture('411001', 500, 0, null, '2025-09-15')]).balanceAgee('t', AU_31_12);
    expect(r.debiteurs[0].montants[3]).toBe(500);
  });

  it('réunit sur UNE ligne les deux comptes d’un même tiers', async () => {
    // Un 411 d'exploitation et un 416 douteux appartenant au même client : son
    // exposition est une, et la couper en deux la sous-estime à la lecture.
    const r = await service(
      [
        ligneEcriture('411001', 300, 0, '2025-12-10', '2025-12-10'),
        ligneEcriture('416001', 700, 0, '2025-03-10', '2025-03-10'),
      ],
      [
        { compteId: 'c-411001', tiers: { id: 'T1', code: '410038', nom: 'CREC 8' } },
        { compteId: 'c-416001', tiers: { id: 'T1', code: '410038', nom: 'CREC 8' } },
      ],
    ).balanceAgee('t', AU_31_12);

    expect(r.debiteurs).toHaveLength(1);
    expect(r.debiteurs[0].libelle).toBe('410038 - CREC 8');
    expect(r.debiteurs[0].solde).toBe(1000);
  });

  it('sépare les soldes de sens contraire, sans les ventiler', async () => {
    const r = await service([
      ligneEcriture('411001', 1000, 0, '2025-12-10', '2025-12-10'),
      ligneEcriture('411002', 0, 400, '2025-12-10', '2025-12-10'),
    ]).balanceAgee('t', AU_31_12);

    expect(r.debiteurs).toHaveLength(1);
    expect(r.crediteurs).toHaveLength(1);
    expect(r.crediteurs[0].montants).toEqual([]);
    expect(r.totaux.debiteurs).toBe(1000);
    expect(r.totaux.crediteurs).toBe(-400);
    // Le net est ce qui doit recouper la balance auxiliaire.
    expect(r.totaux.net).toBe(600);
    // Les totaux par tranche ne portent QUE les débiteurs · y mêler les
    // créditeurs ferait un état dont les colonnes ne somment plus au total.
    expect(r.totaux.parTranche[6]).toBe(1000);
  });

  it('compense une correction en négatif dans la tranche d’origine', async () => {
    // AUDCIF art. 20 : l'erreur et sa contre-passation restent au journal. Les
    // deux lignes tombent dans la même tranche et s'y annulent, au lieu de
    // gonfler deux colonnes en sens opposés.
    const r = await service([
      ligneEcriture('411001', 900, 0, '2025-10-05', '2025-10-05'),
      ligneEcriture('411001', 0, 900, '2025-10-05', '2025-10-06'),
      ligneEcriture('411001', 250, 0, '2025-10-05', '2025-10-06'),
    ]).balanceAgee('t', AU_31_12);

    expect(r.debiteurs[0].montants[4]).toBe(250);
    expect(r.debiteurs[0].solde).toBe(250);
  });

  it('n’ouvre pas de bloc « reste de l’exercice » quand la fenêtre le couvre', async () => {
    // Date de référence au 31/03 : la fenêtre de cinq mois remonte à novembre
    // de l'exercice précédent, donc avant l'ouverture. Un bloc « du 01/01 à la
    // veille » couvrirait une période vide.
    const r = await service([]).balanceAgee('t', { exerciceId: 'ex', dateReference: '2025-03-31' });
    expect(r.tranches.map((t) => t.cle)).not.toContain('ancien');
    expect(r.tranches).toHaveLength(6);
  });

  it('borne une date de référence postérieure à la clôture', async () => {
    const r = await service([]).balanceAgee('t', { exerciceId: 'ex', dateReference: '2026-06-30' });
    expect(r.dateReference).toBe('2025-12-31');
  });
});
