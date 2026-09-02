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
 *  · UNE BALANCE LISTE DES COMPTES MOUVEMENTÉS, PAS UNE HIÉRARCHIE. Les
 *    lignes de sous-totalisation par compte principal (10, 40, 60…) ont été
 *    retirées : une balance se lit compte par compte, dans l'ordre croissant
 *    des numéros. Aucun des six appelants internes ne les utilisait, tous les
 *    écartaient ;
 *  · un compte MOUVEMENTÉ dont le solde retombe à zéro reste dans la liste.
 *    L'exclure casserait l'égalité de la balance, dont les colonnes de totaux
 *    additionnent des mouvements et non des soldes.
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

interface LigneBalance {
  numero: string;
  totalDebit: number;
  totalCredit: number;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  solde: number;
  typeCompte: string;
}

const lignes = (r: { lignes: Array<{ numero: string }> }) => r.lignes as unknown as LigneBalance[];
const ligne = (r: { lignes: Array<{ numero: string }> }, numero: string) =>
  lignes(r).find((l) => l.numero === numero)!;

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

  /**
   * L'IDENTITÉ QUE L'ÉCRAN AFFICHE · la balance est présentée en six
   * colonnes (solde d'ouverture D/C · mouvements D/C · solde de clôture D/C),
   * et cette présentation ne vaut que si, LIGNE À LIGNE,
   *
   *     solde d'ouverture + mouvement débit − mouvement crédit = solde de clôture
   *
   * Sans cette égalité, la balance affichée serait un tableau de chiffres qui
   * ne se recoupent pas · le premier contrôle qu'un comptable fait à l'œil.
   */
  it('ligne à ligne, ouverture + mouvements = clôture · l’identité des six colonnes', async () => {
    const { svc } = service(
      [
        { compteId: 'c1011', debit: 500_000, credit: 0 },
        { compteId: 'c521', debit: 0, credit: 80_000 },
      ],
      [
        { compteId: 'c1011', debit: 0, credit: 120_000 },
        { compteId: 'c521', debit: 300_000, credit: 45_000 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    for (const l of lignes(r)) {
      expect(l.reportDebit - l.reportCredit + l.mouvementDebit - l.mouvementCredit).toBe(l.solde);
    }
    // Et le cas concret, pour que l'échec soit lisible : 500 000 à l'ouverture,
    // 120 000 au crédit de l'exercice, 380 000 à la clôture.
    const c = ligne(r, '10110000');
    expect(c.reportDebit - c.reportCredit).toBe(500_000);
    expect(c.solde).toBe(380_000);
  });

  it('ne porte AUCUNE ligne de sous-totalisation par compte principal', async () => {
    const { svc } = service(
      [],
      [
        { compteId: 'c1011', debit: 300_000, credit: 0 },
        { compteId: 'c1015', debit: 200_000, credit: 0 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    // « 10 » et « 101 » sont des comptes Total du plan · ils ne recevront
    // jamais d'écriture (un numéro à deux ou trois chiffres est impossible à
    // saisir) et n'ont plus à figurer dans une balance.
    expect(r.lignes.map((l) => l.numero)).toEqual(['10110000', '10150000']);
    expect(r.lignes.every((l) => l.typeCompte === 'DETAIL')).toBe(true);
  });

  it('liste les comptes dans l’ordre croissant de leur numéro', async () => {
    const { svc } = service(
      [],
      [
        { compteId: 'c521', debit: 400_000, credit: 0 },
        { compteId: 'c1011', debit: 0, credit: 400_000 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    // L'ordre vient du plan, pas de l'ordre d'arrivée des mouvements.
    expect(r.lignes.map((l) => l.numero)).toEqual(['10110000', '52100000']);
  });

  it('totalise sur toutes les lignes rendues, sans rien à écarter', async () => {
    const { svc } = service(
      [],
      [
        { compteId: 'c1011', debit: 0, credit: 400_000 },
        { compteId: 'c521', debit: 400_000, credit: 0 },
      ],
    );
    const r = await svc.balance('t1', 'e1');
    // Débit et crédit s'équilibrent : 400 000 de part et d'autre, et non le
    // double comme lorsque « 10 », « 101 » et « 52 » portaient les mêmes
    // montants en sous-total.
    expect(r.totaux.debit).toBe(400_000);
    expect(r.totaux.credit).toBe(400_000);
  });

  it('garde un compte mouvementé dont le solde retombe à zéro', async () => {
    // Un débit de 400 000 et un crédit de 400 000 sur le même compte : son
    // solde est nul, mais il a bougé, et ses mouvements entrent dans
    // l'égalité de la balance. L'exclure la casserait.
    const { svc } = service([], [{ compteId: 'c521', debit: 400_000, credit: 400_000 }]);
    const r = await svc.balance('t1', 'e1');
    expect(r.lignes.map((l) => l.numero)).toEqual(['52100000']);
    expect(ligne(r, '52100000').solde).toBe(0);
    expect(r.totaux).toEqual({ debit: 400_000, credit: 400_000 });
  });

  it('un compte sans mouvement disparaît de la balance', async () => {
    const { svc } = service([], [{ compteId: 'c521', debit: 90_000, credit: 0 }]);
    const r = await svc.balance('t1', 'e1');
    expect(r.lignes.map((l) => l.numero)).toEqual(['52100000']);
    // « 60 », « 10 », « 101 » n'ont rien : ils ne s'affichent pas · et ne
    // s'afficheraient plus même s'ils portaient un agrégat.
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
