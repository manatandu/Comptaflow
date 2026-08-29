import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * ÉVOLUTION MENSUELLE · vue tirée du reporting CARRIGRES, où chaque compte
 * occupe une ligne et chaque mois une colonne. Trois choses doivent tenir :
 * le découpage en mois suit l'EXERCICE et non l'année civile, le report
 * à-nouveau ne pollue pas janvier, et le mois aberrant est celui qu'on veut
 * effectivement voir.
 */

function ligne(numero: string, date: string, montant: number, report = false) {
  return {
    debit: montant > 0 ? montant : 0,
    credit: montant < 0 ? -montant : 0,
    compte: {
      id: `c-${numero}`,
      numero,
      intitule: `Compte ${numero}`,
      classe: ClasseCompte.CLASSE_6,
      typeCompte: TypeCompteDetailTotal.DETAIL as TypeCompteDetailTotal,
    },
    ecriture: { date: new Date(date), estGenereeParCloture: report },
  };
}

function service(lignes: ReturnType<typeof ligne>[], exercice: { dateDebut: string; dateFin: string }) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date(exercice.dateDebut),
        dateFin: new Date(exercice.dateFin),
      }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const ANNEE_CIVILE = { dateDebut: '2026-01-01', dateFin: '2026-12-31' };

describe('évolution mensuelle par compte', () => {
  it('ouvre douze colonnes pour un exercice civil, dans l’ordre', async () => {
    const s = service([ligne('601000', '2026-03-10', 1000)], ANNEE_CIVILE);
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.mois).toHaveLength(12);
    expect(r.mois[0].cle).toBe('2026-01');
    expect(r.mois[11].cle).toBe('2026-12');
  });

  it('suit un exercice décalé, sans se caler sur l’année civile', async () => {
    // Premier exercice ouvert au 1er septembre : quatre mois, pas douze.
    const s = service([ligne('601000', '2026-10-05', 500)], { dateDebut: '2026-09-01', dateFin: '2026-12-31' });
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.mois.map((m) => m.cle)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(r.comptes[0].valeurs).toEqual([0, 500, 0, 0]);
  });

  it('range le report à-nouveau à part, jamais dans janvier', async () => {
    // Sans cela, janvier porterait tout le passé du compte et aucune
    // comparaison mensuelle ne serait lisible.
    const s = service(
      [ligne('411000', '2026-01-01', 900_000, true), ligne('411000', '2026-01-20', 1_000)],
      ANNEE_CIVILE,
    );
    const r = await s.evolutionMensuelle('t', 'ex');
    const c = r.comptes[0];
    expect(c.report).toBe(900_000);
    expect(c.valeurs[0]).toBe(1_000);
    expect(c.cumul).toBe(1_000);
    expect(c.soldeFinal).toBe(901_000);
  });

  it('somme les mouvements du même mois et signe le net', async () => {
    const s = service(
      [ligne('601000', '2026-05-02', 3_000), ligne('601000', '2026-05-28', -500)],
      ANNEE_CIVILE,
    );
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.comptes[0].valeurs[4]).toBe(2_500);
  });

  it('désigne le mois qui s’écarte le plus, quand il y a de quoi comparer', async () => {
    // Onze mois à 1 000, un mois à 12 000 : c'est juillet qu'il faut regarder.
    const lignes = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((m) =>
      ligne('622000', `2026-${String(m).padStart(2, '0')}-15`, 1_000),
    );
    lignes.push(ligne('622000', '2026-07-15', 12_000));
    const s = service(lignes, ANNEE_CIVILE);
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.comptes[0].moisAberrant).toBe('2026-07');
  });

  it('ne crie pas à l’anomalie sur un compte mouvementé une ou deux fois', async () => {
    // Un loyer payé deux fois dans l'année n'a pas de « mois aberrant » :
    // signaler l'écart y serait du bruit, pas une information.
    const s = service(
      [ligne('622000', '2026-02-15', 1_000), ligne('622000', '2026-08-15', 9_000)],
      ANNEE_CIVILE,
    );
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.comptes[0].moisAberrant).toBeNull();
  });

  it('écarte les comptes restés sans mouvement ni report', async () => {
    const s = service([ligne('601000', '2026-03-10', 0)], ANNEE_CIVILE);
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.comptes).toHaveLength(0);
  });

  it('ignore les comptes Total, qui agrègent déjà leur racine', async () => {
    const l = ligne('600000', '2026-03-10', 5_000);
    l.compte.typeCompte = TypeCompteDetailTotal.TOTAL;
    const s = service([l], ANNEE_CIVILE);
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.comptes).toHaveLength(0);
  });

  it('totalise chaque colonne quand une classe est demandée', async () => {
    const s = service(
      [ligne('601000', '2026-04-01', 1_000), ligne('602000', '2026-04-02', 2_000)],
      ANNEE_CIVILE,
    );
    const r = await s.evolutionMensuelle('t', 'ex', { classe: ClasseCompte.CLASSE_6 });
    expect(r.totaux).not.toBeNull();
    expect(r.totaux![3]).toBe(3_000);
  });

  it('ne totalise rien hors filtre de classe : la partie double ramènerait à zéro', async () => {
    // Une ligne de totaux à zéro sur douze colonnes ressemble à un bug alors
    // que c'est une tautologie. Mieux vaut ne rien afficher.
    const s = service(
      [ligne('601000', '2026-04-01', 1_000), ligne('521000', '2026-04-01', -1_000)],
      ANNEE_CIVILE,
    );
    const r = await s.evolutionMensuelle('t', 'ex');
    expect(r.totaux).toBeNull();
  });
});
