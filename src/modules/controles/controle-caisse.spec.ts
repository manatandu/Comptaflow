import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Le contrôle de caisse, tel que le manuel Sage écrit pour une ONG le pose :
 * « Il est impossible de clôturer un journal de caisse s'il a été créditeur
 * pour un jour de la période ; afin d'éviter cela, il est impératif
 * d'enregistrer les écritures d'approvisionnement avant les dépenses. »
 *
 * Ces tests figent la lecture JOUR PAR JOUR : une caisse peut finir l'exercice
 * positive tout en étant passée sous zéro un mardi, et c'est ce mardi-là qu'il
 * faut nommer. Un contrôle qui ne regarderait que le solde final laisserait
 * passer exactement le cas qu'il est censé attraper.
 */

type Faux = Record<string, unknown>;

function service(lignes: { date: string; debit: number; credit: number }[]) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    compte: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          numero: '57100000',
          intitule: 'Caisse siège',
          typeCompte: 'DETAIL',
          journauxTresorerie: [{ code: 'CA', intitule: 'Caisse' }],
        },
      ]),
    },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(
        lignes.map((l) => ({
          compteId: 'c1',
          debit: l.debit,
          credit: l.credit,
          ecriture: { date: new Date(l.date) },
        })),
      ),
    },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

describe('contrôle de caisse', () => {
  it('ne signale rien quand la caisse reste positive', async () => {
    const r = await service([
      { date: '2026-03-01', debit: 500000, credit: 0 },
      { date: '2026-03-05', debit: 0, credit: 200000 },
    ]).controleCaisse('t1', 'ex1');
    expect(r[0].nombreJoursNegatifs).toBe(0);
    expect(r[0].premierJourNegatif).toBeNull();
    expect(r[0].soldeFinal).toBe(300000);
  });

  it('nomme le jour exact du passage sous zéro', async () => {
    const r = await service([
      { date: '2026-03-01', debit: 100000, credit: 0 },
      { date: '2026-03-04', debit: 0, credit: 250000 },
      { date: '2026-03-10', debit: 400000, credit: 0 },
    ]).controleCaisse('t1', 'ex1');
    expect(r[0].premierJourNegatif).toBe('2026-03-04');
    expect(r[0].nombreJoursNegatifs).toBe(1);
    // Le solde final est positif : un contrôle qui ne regarderait que lui
    // manquerait complètement l'anomalie.
    expect(r[0].soldeFinal).toBe(250000);
  });

  it('attrape une dépense saisie avant son approvisionnement le même jour n’est PAS une anomalie', async () => {
    // Sur une même journée, l'ordre de saisie n'a pas d'importance : c'est le
    // solde au soir qui compte. C'est exactement ce que veut dire le conseil
    // du manuel, qui vise l'ordre des JOURS et non celui des lignes.
    const r = await service([
      { date: '2026-03-01', debit: 0, credit: 250000 },
      { date: '2026-03-01', debit: 400000, credit: 0 },
    ]).controleCaisse('t1', 'ex1');
    expect(r[0].nombreJoursNegatifs).toBe(0);
  });

  it('tolère le centime : un arrondi ne déclenche pas d’alerte', async () => {
    const r = await service([
      { date: '2026-03-01', debit: 100, credit: 0 },
      { date: '2026-03-02', debit: 0, credit: 100.004 },
    ]).controleCaisse('t1', 'ex1');
    expect(r[0].nombreJoursNegatifs).toBe(0);
  });

  it('compte chaque journée négative, pas seulement la première', async () => {
    const r = await service([
      { date: '2026-03-01', debit: 0, credit: 100000 },
      { date: '2026-03-02', debit: 0, credit: 50000 },
      { date: '2026-03-03', debit: 200000, credit: 0 },
    ]).controleCaisse('t1', 'ex1');
    expect(r[0].nombreJoursNegatifs).toBe(2);
    expect(r[0].premierJourNegatif).toBe('2026-03-01');
    expect(r[0].journees.map((j) => j.soldeFinJournee)).toEqual([-100000, -150000, 50000]);
  });
});
