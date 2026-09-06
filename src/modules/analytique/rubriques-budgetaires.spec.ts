import { TypeCompteDetailTotal } from '@prisma/client';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import { PrismaService } from '../../common/prisma.service';
import { totalDesFeuilles, valeurDeLaLigne } from './rubriques-budgetaires';

/**
 * LES RUBRIQUES D'UNE NOMENCLATURE BUDGÉTAIRE.
 *
 * Une convention de bailleur ne se lit pas en liste plate : elle se lit
 * « 1 Personnel, dont 11 Salaires et 12 Charges sociales ». `SectionAnalytique`
 * porte cette hiérarchie depuis toujours (`type` DETAIL / TOTAL), et le schéma
 * promet que TOTAL « regroupe ses sections de même racine DANS LES ÉTATS ».
 *
 * Trois états lisaient l'objet, et aucun deux ne le lisaient pareil : la
 * balance analytique totalisait, l'état budgétaire ÉCARTAIT les rubriques de
 * sa requête, et le tableau officiel d'exécution budgétaire les gardait à zéro
 * tout en les faisant entrer dans son total général.
 */

const SECTIONS = [
  { id: 'r1', code: '1', type: TypeCompteDetailTotal.TOTAL },
  { id: 's11', code: '11', type: TypeCompteDetailTotal.DETAIL },
  { id: 's12', code: '12', type: TypeCompteDetailTotal.DETAIL },
  { id: 's2', code: '2', type: TypeCompteDetailTotal.DETAIL },
];

const MONTANTS: Record<string, number> = { s11: 300, s12: 200, s2: 500 };
const mesure = (id: string) => MONTANTS[id] ?? 0;

describe('Règle d’agrégation des rubriques', () => {
  it('une RUBRIQUE vaut la somme de ses feuilles, une FEUILLE vaut la sienne', () => {
    expect(valeurDeLaLigne(SECTIONS[0], SECTIONS, mesure)).toBe(500);
    expect(valeurDeLaLigne(SECTIONS[1], SECTIONS, mesure)).toBe(300);
  });

  it('LE TOTAL GÉNÉRAL NE SOMME QUE LES FEUILLES', () => {
    // Sommer les lignes affichées donnerait 500 (rubrique) + 300 + 200 + 500
    // = 1 500, soit 500 de trop · chaque dépense comptée autant de fois
    // qu'elle a de rubriques au-dessus d'elle. Toutes les lignes seraient
    // justes, et le total plausible.
    expect(totalDesFeuilles(SECTIONS, mesure)).toBe(1_000);
  });

  it('les rubriques S’EMBOÎTENT · une feuille compte dans chacune de ses racines', () => {
    const imbriquees = [
      { id: 'r1', code: '1', type: TypeCompteDetailTotal.TOTAL },
      { id: 'r11', code: '11', type: TypeCompteDetailTotal.TOTAL },
      { id: 's111', code: '111', type: TypeCompteDetailTotal.DETAIL },
    ];
    const m = (id: string) => (id === 's111' ? 700 : 0);
    expect(valeurDeLaLigne(imbriquees[0], imbriquees, m)).toBe(700);
    expect(valeurDeLaLigne(imbriquees[1], imbriquees, m)).toBe(700);
    // Et le total ne les additionne pas : 700, pas 1 400.
    expect(totalDesFeuilles(imbriquees, m)).toBe(700);
  });
});

function serviceAnalytique(options: {
  sections: Array<{ id: string; code: string; intitule: string; type: TypeCompteDetailTotal }>;
  budgets?: Array<{ sectionId: string; montant: number }>;
  ventilations?: Array<{ sectionId: string; debit: number; credit: number }>;
}) {
  const prisma = {
    planAnalytique: {
      findFirst: jest.fn().mockResolvedValue({ id: 'p1', code: 'BUD', intitule: 'Budget', gererBudgets: true }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'e1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    // Le faux HONORE `where.type` · sans quoi il rendrait les rubriques même
    // à un service qui les écarte, et validerait un service qui n'existe pas.
    sectionAnalytique: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(where?.type ? options.sections.filter((s) => s.type === where.type) : options.sections),
      ),
    },
    budgetSection: { findMany: jest.fn().mockResolvedValue(options.budgets ?? []) },
    ventilationAnalytique: {
      groupBy: jest.fn().mockResolvedValue(
        (options.ventilations ?? []).map((v) => ({ sectionId: v.sectionId, _sum: { debit: v.debit, credit: v.credit } })),
      ),
    },
  } as unknown as PrismaService;
  return new EtatsAnalytiquesService(prisma);
}

const NOMENCLATURE = [
  { id: 'r1', code: '1', intitule: 'Personnel', type: TypeCompteDetailTotal.TOTAL },
  { id: 's11', code: '11', intitule: 'Salaires', type: TypeCompteDetailTotal.DETAIL },
  { id: 's12', code: '12', intitule: 'Charges sociales', type: TypeCompteDetailTotal.DETAIL },
];

describe('État budgétaire · prévu, réalisé, écart', () => {
  it('REND LA RUBRIQUE, avec le budget et le réalisé de ses feuilles', async () => {
    // La requête portait `type: DETAIL` : le bailleur qui lit « Personnel »
    // n'avait aucune ligne Personnel, seulement ses deux feuilles, et
    // additionnait à la main.
    const s = serviceAnalytique({
      sections: NOMENCLATURE,
      budgets: [
        { sectionId: 's11', montant: 800 },
        { sectionId: 's12', montant: 200 },
      ],
      ventilations: [
        { sectionId: 's11', debit: 600, credit: 0 },
        { sectionId: 's12', debit: 150, credit: 0 },
      ],
    });
    const etat = await s.etatBudgetaire('t1', { planId: 'p1', exerciceId: 'e1' });
    const personnel = etat.lignes.find((l) => l.code === '1')!;
    expect(personnel.estRubrique).toBe(true);
    expect(personnel.budget).toBe(1_000);
    expect(personnel.realise).toBe(750);
    expect(personnel.ecart).toBe(250);
  });

  it('le TOTAL ne double pas la rubrique', async () => {
    const s = serviceAnalytique({
      sections: NOMENCLATURE,
      budgets: [
        { sectionId: 's11', montant: 800 },
        { sectionId: 's12', montant: 200 },
      ],
      ventilations: [{ sectionId: 's11', debit: 600, credit: 0 }],
    });
    const etat = await s.etatBudgetaire('t1', { planId: 'p1', exerciceId: 'e1' });
    expect(etat.totaux.budget).toBe(1_000);
    expect(etat.totaux.realise).toBe(600);
  });

  it('une RUBRIQUE n’est jamais « hors budget » · le signalement appartient à la feuille', async () => {
    // `horsBudget` vise une section mouvementée que personne n'a dotée. Le
    // porter sur la rubrique ferait crier le sous-total dès qu'UNE de ses
    // feuilles est concernée, et masquerait laquelle.
    // Rubrique ENTIÈREMENT non dotée et pourtant mouvementée : c'est le seul
    // cas où le drapeau s'allumerait sur le sous-total. Il doit rester sur la
    // feuille, qui dit LAQUELLE des sections a été mouvementée sans budget.
    const s = serviceAnalytique({
      sections: NOMENCLATURE,
      budgets: [],
      ventilations: [{ sectionId: 's12', debit: 50, credit: 0 }],
    });
    const etat = await s.etatBudgetaire('t1', { planId: 'p1', exerciceId: 'e1' });
    const rubrique = etat.lignes.find((l) => l.code === '1')!;
    expect(rubrique.budget).toBe(0);
    expect(rubrique.realise).toBe(50);
    expect(rubrique.horsBudget).toBe(false);
    expect(etat.lignes.find((l) => l.code === '12')!.horsBudget).toBe(true);
  });
});

describe('Balance analytique', () => {
  it('totalise ses rubriques et ne les compte pas dans le total', async () => {
    const s = serviceAnalytique({
      sections: NOMENCLATURE,
      ventilations: [
        { sectionId: 's11', debit: 600, credit: 100 },
        { sectionId: 's12', debit: 150, credit: 0 },
      ],
    });
    const b = await s.balance('t1', { planId: 'p1', exerciceId: 'e1' });
    expect(b.lignes.find((l) => l.code === '1')!.debit).toBe(750);
    expect(b.lignes.find((l) => l.code === '1')!.credit).toBe(100);
    expect(b.totaux.debit).toBe(750);
    expect(b.totaux.solde).toBe(650);
  });
});
