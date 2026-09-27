import { BadRequestException, ConflictException } from '@nestjs/common';
import { SensMouvementStock, StatutExercice } from '@prisma/client';
import { MagasinService } from './magasin.service';
import { sortiesAuDelaDuStock } from './valorisation-stocks';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F133 · le magasin ne descend jamais sous zéro, et un mouvement
 * faux s'annule avec son motif.
 */

interface Mvt {
  id: string;
  tenantId: string;
  articleId: string;
  ordre: number;
  date: Date;
  sens: SensMouvementStock;
  quantite: number;
  cout: number | null;
  piece: string;
  ecritureId: string | null;
  annuleLe: Date | null;
  motifAnnulation?: string | null;
}

const j = (s: string) => new Date(`${s}T00:00:00.000Z`);
const entree = (id: string, ordre: number, date: string, q: number, cout: number, ecritureId: string | null = null): Mvt => ({
  id, tenantId: 't1', articleId: 'a1', ordre, date: j(date), sens: SensMouvementStock.ENTREE, quantite: q, cout, piece: `BE-${ordre}`, ecritureId, annuleLe: null,
});
const sortie = (id: string, ordre: number, date: string, q: number): Mvt => ({
  id, tenantId: 't1', articleId: 'a1', ordre, date: j(date), sens: SensMouvementStock.SORTIE, quantite: q, cout: null, piece: `BS-${ordre}`, ecritureId: null, annuleLe: null,
});

function monter(mouvements: Mvt[], opts: { clotureAu?: string } = {}) {
  const create = jest.fn(async ({ data }: { data: unknown }) => ({ id: 'nouveau', ...(data as object) }));
  // La doublure HONORE le filtre · dossier, article, et « non annulé ».
  const findMany = jest.fn(async ({ where }: { where: { tenantId: string; articleId: string; annuleLe?: null } }) =>
    mouvements.filter(
      (m) => m.tenantId === where.tenantId && m.articleId === where.articleId && (where.annuleLe !== null || m.annuleLe === null),
    ),
  );
  const updateMany = jest.fn(async ({ where, data }: { where: { id: string; annuleLe: null }; data: Partial<Mvt> }) => {
    const m = mouvements.find((x) => x.id === where.id && x.annuleLe === null);
    if (!m) return { count: 0 };
    Object.assign(m, data);
    return { count: 1 };
  });
  const prisma = {
    articleStock: { findFirst: jest.fn(async () => ({ id: 'a1', actif: true, code: 'ART1' })) },
    ecriture: { findFirst: jest.fn(async () => ({ id: 'e1' })) },
    exercice: {
      findFirst: jest.fn(async ({ where }: { where: { statut: StatutExercice; dateDebut: { lte: Date }; dateFin: { gte: Date } } }) =>
        opts.clotureAu && where.statut === StatutExercice.CLOTURE && where.dateFin.gte <= j(opts.clotureAu)
          ? { dateFin: j(opts.clotureAu) }
          : null,
      ),
    },
    mouvementStock: {
      aggregate: jest.fn(async () => ({ _max: { ordre: Math.max(0, ...mouvements.map((m) => m.ordre)) } })),
      findMany,
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string; articleId: string } }) =>
        mouvements.find((m) => m.id === where.id && m.tenantId === where.tenantId && m.articleId === where.articleId) ?? null,
      ),
      create,
      updateMany,
    },
  };
  return { s: new MagasinService(prisma as unknown as PrismaService, {} as never), create, updateMany, mouvements };
}

const saisie = (sens: SensMouvementStock, date: string, quantite: number, cout?: number) =>
  ({ date, sens, quantite, cout, piece: 'P-1' }) as never;

describe('F133 · une sortie au-delà du stock est refusée à la saisie', () => {
  it('le magasin qui détient 10 unités refuse d’en sortir 12', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000)]);
    await expect(m.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.SORTIE, '2026-03-01', 12))).rejects.toThrow(
      /12 unités alors que le magasin n'en détient que 10/,
    );
    expect(m.create).not.toHaveBeenCalled();
  });

  it('une sortie ANTIDATÉE avant l’entrée qui la servirait est refusée, même si le total final suffit', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000)]);
    await expect(m.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.SORTIE, '2026-01-15', 4))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('une sortie antidatée qui rendrait impossible une sortie déjà enregistrée est refusée, en la nommant', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000), sortie('s', 2, '2026-04-01', 8)]);
    await expect(m.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.SORTIE, '2026-03-01', 5))).rejects.toThrow(
      /rendrait impossible la sortie du 2026-04-01 \(pièce BS-2\)/,
    );
  });

  it('une sortie servie passe, et une fiche déjà fausse ne bloque pas ce qui la corrige', async () => {
    await expect(
      monter([entree('e', 1, '2026-02-01', 10, 1_000)]).s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.SORTIE, '2026-03-01', 10)),
    ).resolves.toBeDefined();
    // Une sortie impossible venue d'avant le refus · l'entrée qui la sert passe.
    const fausse = monter([sortie('s', 1, '2026-03-01', 5)]);
    await expect(
      fausse.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.ENTREE, '2026-02-01', 5, 500)),
    ).resolves.toBeDefined();
    // Et une entrée datée APRÈS elle, qui la laisse fausse, passe aussi · le
    // refus ne vise que ce que la saisie rend faux, jamais l'état d'avant.
    const toujoursFausse = monter([sortie('s', 1, '2026-03-01', 5)]);
    await expect(
      toujoursFausse.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.ENTREE, '2026-04-01', 5, 500)),
    ).resolves.toBeDefined();
  });

  it('un mouvement annulé n’est pas dans le magasin · il ne sert aucune sortie', async () => {
    const annulee = { ...entree('e', 1, '2026-02-01', 10, 1_000), annuleLe: j('2026-02-05') };
    const m = monter([annulee]);
    await expect(m.s.enregistrerMouvement('t1', 'u', 'a1', saisie(SensMouvementStock.SORTIE, '2026-03-01', 1))).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('F133 · l’annulation motivée', () => {
  it('annule avec motif, auteur et date, et dit si une écriture reste au journal', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000, 'ecr1')]);
    await expect(m.s.annulerMouvement('t1', 'u9', 'a1', 'e', { motif: '  Quantité saisie deux fois  ' })).resolves.toEqual({
      id: 'e',
      annule: true,
      ecritureACorriger: true,
    });
    expect(m.mouvements[0]).toMatchObject({ annulePar: 'u9', motifAnnulation: 'Quantité saisie deux fois' });
    expect(m.mouvements[0].annuleLe).toBeInstanceOf(Date);
  });

  it('refuse sans motif, deux fois, et d’un autre article ou dossier', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000)]);
    await expect(m.s.annulerMouvement('t1', 'u', 'a1', 'e', { motif: '   ' })).rejects.toThrow(/motif/);
    await expect(m.s.annulerMouvement('t2', 'u', 'a1', 'e', { motif: 'x' })).rejects.toThrow(/introuvable/);
    await m.s.annulerMouvement('t1', 'u', 'a1', 'e', { motif: 'x' });
    await expect(m.s.annulerMouvement('t1', 'u', 'a1', 'e', { motif: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse d’annuler l’entrée qui sert une sortie enregistrée après elle', async () => {
    const m = monter([entree('e', 1, '2026-02-01', 10, 1_000), sortie('s', 2, '2026-04-01', 8)]);
    await expect(m.s.annulerMouvement('t1', 'u', 'a1', 'e', { motif: 'erreur' })).rejects.toThrow(/rendrait impossible la sortie du 2026-04-01/);
    expect(m.updateMany).not.toHaveBeenCalled();
    // La sortie, elle, s'annule · elle ne sert personne.
    await expect(m.s.annulerMouvement('t1', 'u', 'a1', 's', { motif: 'erreur' })).resolves.toMatchObject({ annule: true });
  });

  it('refuse un mouvement daté dans un exercice clôturé', async () => {
    const m = monter([entree('e', 1, '2025-06-01', 10, 1_000)], { clotureAu: '2025-12-31' });
    await expect(m.s.annulerMouvement('t1', 'u', 'a1', 'e', { motif: 'erreur' })).rejects.toThrow(/exercice clôturé/);
  });
});

describe('F133 · sortiesAuDelaDuStock, sur la chronologie de la valorisation', () => {
  it('rejoue en QUANTITÉS · une entrée dont le coût manque sert quand même la sortie', () => {
    expect(
      sortiesAuDelaDuStock([
        { ordre: 1, date: '2026-01-01', sens: 'ENTREE', quantite: 5, cout: null },
        { ordre: 2, date: '2026-01-10', sens: 'SORTIE', quantite: 3, cout: null },
      ]),
    ).toEqual([]);
  });

  it('rejoue par date puis par ordre, quelle que soit la saisie', () => {
    const r = sortiesAuDelaDuStock([
      { ordre: 2, date: '2026-01-10', sens: 'SORTIE', quantite: 3, cout: null },
      { ordre: 1, date: '2026-02-01', sens: 'ENTREE', quantite: 5, cout: 50 },
    ]);
    expect(r.map((x) => x.ordre)).toEqual([2]);
  });
});

describe('F133 · un mouvement annulé reste sur la fiche et sort du calcul', () => {
  function avecLecture(mouvements: Mvt[]) {
    const m = monter(mouvements);
    const prisma = (m.s as unknown as { prisma: Record<string, Record<string, unknown>> }).prisma;
    prisma.articleStock.findFirst = jest.fn(async () => ({
      id: 'a1', code: 'ART1', designation: 'Ciment', uniteMesure: 'sac', methodeValorisation: 'PEPS', actif: true,
      compte: { numero: '32100000', intitule: 'Matières premières' },
    }));
    prisma.tenant = { findUniqueOrThrow: jest.fn(async () => ({ referentiel: 'SYSCOHADA', methodeInventaireStocks: 'PERMANENT' })) };
    // Confrontation · l'article porte ses mouvements filtrés comme la requête le demande.
    prisma.articleStock.findMany = jest.fn(
      async ({ include }: { include: { mouvements: { where: { date: { lte: Date }; annuleLe?: null } } } }) => [
        {
          id: 'a1', code: 'ART1', designation: 'Ciment', uniteMesure: 'sac', methodeValorisation: 'PEPS',
          compte: { numero: '32100000', intitule: 'Matières premières' },
          mouvements: mouvements.filter(
            (x) => x.date <= include.mouvements.where.date.lte && (include.mouvements.where.annuleLe !== null || x.annuleLe === null),
          ),
        },
      ],
    );
    return m;
  }

  const PARC = () => [
    { ...entree('e1', 1, '2026-02-01', 10, 1_000, 'ecr1'), annuleLe: j('2026-02-03'), motifAnnulation: 'Saisie en double' },
    entree('e2', 2, '2026-02-01', 10, 1_000),
  ];

  it('la fiche montre la ligne annulée avec son motif, l’écriture à corriger, et ne la valorise pas', async () => {
    const f = await avecLecture(PARC()).s.ficheDeStock('t1', 'a1');
    expect(f.lignes.find((l) => l.id === 'e1')).toMatchObject({
      annuleLe: '2026-02-03',
      motifAnnulation: 'Saisie en double',
      ecritureACorriger: true,
      ecritureManquante: false,
    });
    expect({ q: f.totaux.quantiteFinale, v: f.totaux.valeurFinale }).toEqual({ q: 10, v: 1_000 });
  });

  it('la confrontation au comptage ne le compte pas · aucun faux mali', async () => {
    const r = await avecLecture(PARC()).s.confronter('t1', [{ articleId: 'a1', quantitePhysique: 10 }] as never, '2026-12-31');
    expect(r.confrontation?.differences).toEqual([]);
  });
});
