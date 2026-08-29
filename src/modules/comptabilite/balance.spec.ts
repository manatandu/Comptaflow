import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';

/**
 * BALANCE GÉNÉRALE · la fonction dont dépendent les états financiers, les
 * exports, l'analytique et le plan comptable. Elle a été réécrite pour cesser
 * de rapatrier chaque ligne d'écriture et pour sortir de l'agrégation en N²
 * des comptes Total ; ces tests figent le RÉSULTAT, seule chose qui ne doit
 * pas bouger.
 *
 * Les trois pièges qu'ils gardent :
 *  · le report à-nouveau et le mouvement de l'exercice se distinguent par
 *    `estGenereeParCloture`, porté par l'écriture · les confondre fausse les
 *    colonnes « à-nouveau » de tous les états ;
 *  · un compte Total agrège ses enfants de DÉTAIL, jamais un autre Total ·
 *    sinon une hiérarchie à trois niveaux compte deux fois les mêmes
 *    mouvements ;
 *  · les comptes Total n'entrent pas dans les totaux généraux, pour la même
 *    raison.
 */

function comptes() {
  return [
    { id: 'c10', numero: '10', intitule: 'Dotation', classe: 'CLASSE_1', typeCompte: 'TOTAL' },
    { id: 'c101', numero: '101', intitule: 'Dotation · sous-total', classe: 'CLASSE_1', typeCompte: 'TOTAL' },
    { id: 'c1011', numero: '10110000', intitule: 'Dotation numéraire', classe: 'CLASSE_1', typeCompte: 'DETAIL' },
    { id: 'c1015', numero: '10150000', intitule: 'Dotation nature', classe: 'CLASSE_1', typeCompte: 'DETAIL' },
    { id: 'c52', numero: '52', intitule: 'Banques', classe: 'CLASSE_5', typeCompte: 'TOTAL' },
    { id: 'c521', numero: '52100000', intitule: 'Banque locale', classe: 'CLASSE_5', typeCompte: 'DETAIL' },
    { id: 'c60', numero: '60', intitule: 'Achats', classe: 'CLASSE_6', typeCompte: 'TOTAL' },
  ];
}

function service(
  reports: Array<{ compteId: string; debit: number; credit: number }>,
  mouvements: Array<{ compteId: string; debit: number; credit: number }>,
) {
  const groupe = (l: typeof reports) => l.map((x) => ({ compteId: x.compteId, _sum: { debit: x.debit, credit: x.credit } }));
  const groupBy = jest.fn().mockImplementation(({ where }) =>
    Promise.resolve(groupe(where.ecriture.estGenereeParCloture ? reports : mouvements)),
  );
  const prisma = {
    compte: { findMany: jest.fn().mockResolvedValue(comptes()) },
    ligneEcriture: { groupBy },
  } as unknown as PrismaService;
  const svc = new EcritureService(
    prisma,
    {} as JournalService,
    {} as ExerciceService,
    {} as AnalytiqueService,
  );
  return { svc, groupBy };
}

const ligne = (r: { lignes: Array<{ numero: string }> }, numero: string) =>
  r.lignes.find((l) => l.numero === numero) as unknown as {
    numero: string;
    totalDebit: number;
    totalCredit: number;
    reportDebit: number;
    mouvementDebit: number;
    mouvementCredit: number;
    solde: number;
    typeCompte: string;
  };

describe('Balance générale', () => {
  it('sépare le report à-nouveau du mouvement de l’exercice', async () => {
    const { svc } = service(
      [{ compteId: 'c1011', debit: 500_000, credit: 0 }],
      [{ compteId: 'c1011', debit: 0, credit: 120_000 }],
    );
    const r = await svc.balance('t1', 'e1');
    const l = ligne(r, '10110000');
    expect(l.reportDebit).toBe(500_000);
    expect(l.mouvementCredit).toBe(120_000);
    expect(l.totalDebit).toBe(500_000);
    expect(l.totalCredit).toBe(120_000);
    expect(l.solde).toBe(380_000);
  });

  it('un compte Total agrège ses enfants de DÉTAIL, à tous les niveaux de préfixe', async () => {
    const { svc } = service(
      [],
      [
        { compteId: 'c1011', debit: 300_000, credit: 0 },
        { compteId: 'c1015', debit: 200_000, credit: 0 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    // « 101 » ne voit que 1011 et 1015 · les deux commencent par 101.
    expect(ligne(r, '101').totalDebit).toBe(500_000);
    // « 10 » les voit aussi, par un préfixe plus court.
    expect(ligne(r, '10').totalDebit).toBe(500_000);
  });

  it('un compte Total ne s’agrège JAMAIS dans un autre Total · sinon on compte deux fois', async () => {
    // « 10 » vaut 500 000 par ses deux enfants de détail, et non 1 000 000 :
    // le sous-total « 101 » porte déjà les mêmes mouvements. C'est la faute
    // classique d'une hiérarchie à plusieurs niveaux.
    const { svc } = service(
      [],
      [
        { compteId: 'c1011', debit: 300_000, credit: 0 },
        { compteId: 'c1015', debit: 200_000, credit: 0 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    expect(ligne(r, '10').totalDebit).toBe(500_000);
  });

  it('les comptes Total n’entrent pas dans les totaux généraux', async () => {
    const { svc } = service(
      [],
      [
        { compteId: 'c1011', debit: 0, credit: 400_000 },
        { compteId: 'c521', debit: 400_000, credit: 0 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    // Débit et crédit s'équilibrent : 400 000 de part et d'autre, et non le
    // double, alors que « 10 », « 101 » et « 52 » portent les mêmes montants.
    expect(r.totaux.debit).toBe(400_000);
    expect(r.totaux.credit).toBe(400_000);
  });

  it('un compte sans mouvement disparaît de la balance · y compris un Total vide', async () => {
    const { svc } = service([], [{ compteId: 'c521', debit: 90_000, credit: 0 }]);
    const r = await svc.balance('t1', 'e1');
    expect(r.lignes.map((l) => l.numero).sort()).toEqual(['52', '52100000']);
    // « 60 », « 10 », « 101 » n'ont rien : ils ne s'affichent pas.
    expect(ligne(r, '60')).toBeUndefined();
  });

  it('ne rapatrie pas les lignes · deux agrégations en base, pas une par compte', async () => {
    // Le point de la réécriture : la somme se fait DANS Postgres. Deux appels
    // et deux seulement, quel que soit le nombre de comptes ou d'écritures.
    const { svc, groupBy } = service([], [{ compteId: 'c521', debit: 10, credit: 0 }]);
    await svc.balance('t1', 'e1');
    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('exclut le brouillard quand on le demande', async () => {
    const { svc, groupBy } = service([], []);
    await svc.balance('t1', 'e1', false);
    expect(groupBy.mock.calls[0][0].where.ecriture.statut).toBe('VALIDEE');
    const { svc: svc2, groupBy: g2 } = service([], []);
    await svc2.balance('t1', 'e1');
    expect(g2.mock.calls[0][0].where.ecriture.statut).toBeUndefined();
  });
});
