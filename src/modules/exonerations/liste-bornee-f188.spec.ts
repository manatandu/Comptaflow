import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StatutExoneration, TypeDemandeExoneration } from '@prisma/client';
import { ExonerationsService, PLAFOND_LISTE_EXONERATIONS } from './exonerations.service';
import { ExonerationsController } from './exonerations.controller';
import { ListerExonerationsDto } from './dto/exoneration.dto';
import { JOURS_ALERTE_RENOUVELLEMENT, MODELES_DEMANDE } from './correspondance-exonerations';
import { LOT_LECTURE } from '../../common/lecture-par-lots';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F188 · le registre des exonérations rendait tous ses dossiers.
 * Il se lit sur une période (l'ouverture du dossier) et sous un plafond qui se
 * DIT ; un titre en alerte reste listé hors de la période, et les trois
 * compteurs restent ceux du registre ENTIER, calculés par la même règle.
 *
 * LA DOUBLURE HONORE `where` (OU compris), `orderBy` (NULL en dernier en ordre
 * croissant, comme PostgreSQL), `take`, le curseur et `select` · les compteurs
 * se lisent par tranches sur quelques colonnes, et une colonne oubliée au
 * `select` fausserait la complétude sans lever d'erreur.
 */
type Ligne = Record<string, unknown>;
type Ordre = Record<string, 'asc' | 'desc'>;

const JOUR = 24 * 60 * 60 * 1000;
const REFERENCE = '2026-06-01';
const valeur = (x: unknown) => (x instanceof Date ? x.getTime() : x);

function correspond(l: Ligne, ou: Ligne): boolean {
  return Object.entries(ou).every(([cle, attendu]) => {
    if (cle === 'OR') return (attendu as Ligne[]).some((o) => correspond(l, o));
    const x = l[cle];
    if (attendu && typeof attendu === 'object' && !(attendu instanceof Date)) {
      const bornes = attendu as Record<string, Date>;
      const inconnus = Object.keys(bornes).filter((k) => !['gte', 'lt', 'lte'].includes(k));
      if (inconnus.length) throw new Error(`Opérateur non servi par la doublure : ${inconnus.join(', ')}`);
      if (x === null || x === undefined) return false;
      const v = valeur(x) as number;
      return (
        (!bornes.gte || v >= bornes.gte.getTime()) &&
        (!bornes.lt || v < bornes.lt.getTime()) &&
        (!bornes.lte || v <= bornes.lte.getTime())
      );
    }
    return valeur(x) === valeur(attendu);
  });
}

function trier(lignes: Ligne[], ordre: Ordre | Ordre[]): Ligne[] {
  const cles = Array.isArray(ordre) ? ordre : [ordre];
  return [...lignes].sort((a, b) => {
    for (const o of cles) {
      const [cle, sens] = Object.entries(o)[0];
      const x = valeur(a[cle]) as number | string | null;
      const y = valeur(b[cle]) as number | string | null;
      if (x === y) continue;
      // PostgreSQL · NULL en dernier en ordre croissant, en premier en décroissant.
      if (x === null) return sens === 'asc' ? 1 : -1;
      if (y === null) return sens === 'asc' ? -1 : 1;
      return (x < y ? -1 : 1) * (sens === 'asc' ? 1 : -1);
    }
    return 0;
  });
}

const dossier = (id: string, sur: Ligne = {}): Ligne => ({
  id,
  tenantId: 't1',
  type: TypeDemandeExoneration.PREVISIONNEL,
  statut: StatutExoneration.EN_PREPARATION,
  objet: `Dossier ${id}`,
  referenceArrete: null,
  dateArrete: null,
  dateDebutValidite: null,
  dateFinValidite: null,
  lettreTransport: null,
  valeurBiens: null,
  franchiseDouaniere: null,
  piecesFournies: [],
  observations: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  createdBy: 'u1',
  updatedAt: new Date('2026-03-01T10:00:00.000Z'),
  ...sur,
});

const complet = MODELES_DEMANDE.find((m) => m.type === 'PREVISIONNEL')!
  .pieces.filter((p) => !p.conditionnelle)
  .map((p) => p.cle);

function harnais(tous: Ligne[]) {
  const findMany = jest.fn(
    async (a: { where: Ligne; orderBy: Ordre | Ordre[]; take?: number; cursor?: { id: string }; skip?: number; select?: Record<string, boolean> }) => {
      let rendus = trier(tous.filter((d) => correspond(d, a.where)), a.orderBy);
      if (a.cursor) rendus = rendus.slice(rendus.findIndex((d) => d.id === a.cursor!.id) + (a.skip ?? 0));
      rendus = rendus.slice(0, a.take ?? Infinity);
      const choix = a.select;
      return choix ? rendus.map((d) => Object.fromEntries(Object.keys(choix).filter((k) => choix[k]).map((k) => [k, d[k]]))) : rendus;
    },
  );
  const count = jest.fn(async (a: { where: Ligne }) => tous.filter((d) => correspond(d, a.where)).length);
  const prisma = { exoneration: { findMany, count } };
  return { svc: new ExonerationsService(prisma as unknown as PrismaService), prisma };
}

describe('F188 · le registre se lit sur une période, et sa tranche se dit', () => {
  it('sans période et sous le plafond, la liste et les compteurs sont ceux d’avant', async () => {
    const { svc } = harnais([
      dossier('sans-fin'),
      dossier('loin', { statut: StatutExoneration.ACCORDE, dateFinValidite: new Date('2027-01-15'), piecesFournies: complet }),
      dossier('bientot', { statut: StatutExoneration.ACCORDE, dateFinValidite: new Date('2026-07-15'), piecesFournies: complet }),
      dossier('perime', { statut: StatutExoneration.ACCORDE, dateFinValidite: new Date('2026-05-01'), piecesFournies: complet }),
      dossier('voisin', { tenantId: 'autre', statut: StatutExoneration.ACCORDE, dateFinValidite: new Date('2026-05-01') }),
    ]);
    const r = await svc.lister('t1', REFERENCE);
    // Échéance la plus proche d'abord, dossiers sans échéance en dernier.
    expect(r.dossiers.map((d) => d.id)).toEqual(['perime', 'bientot', 'loin', 'sans-fin']);
    expect([r.aRenouveler, r.expires, r.incomplets]).toEqual([1, 1, 1]);
    expect([r.total, r.tronque, r.periode]).toEqual([4, false, { du: null, au: null }]);
  });

  it('la période borne l’OUVERTURE du dossier, mais un titre en alerte reste listé, et les compteurs voient tout', async () => {
    const { svc } = harnais([
      dossier('recent', { createdAt: new Date('2026-04-01T08:00:00.000Z') }),
      dossier('ancien-muet', { createdAt: new Date('2024-01-10T08:00:00.000Z') }),
      dossier('ancien-incomplet', { createdAt: new Date('2024-02-10T08:00:00.000Z') }),
      dossier('ancien-a-renouveler', {
        createdAt: new Date('2024-07-01T08:00:00.000Z'),
        statut: StatutExoneration.ACCORDE,
        dateFinValidite: new Date('2026-07-15'),
        piecesFournies: complet,
      }),
      dossier('ancien-perime', {
        createdAt: new Date('2023-01-01T08:00:00.000Z'),
        statut: StatutExoneration.ACCORDE,
        dateFinValidite: new Date('2025-01-01'),
        piecesFournies: complet,
      }),
    ]);
    const r = await svc.lister('t1', REFERENCE, { du: '2026-01-01', au: '2026-12-31' });
    expect(r.dossiers.map((d) => d.id)).toEqual(['ancien-perime', 'ancien-a-renouveler', 'recent']);
    expect([r.total, r.tronque]).toEqual([3, false]);
    // Les deux dossiers muets hors période restent comptés comme incomplets.
    expect([r.aRenouveler, r.expires, r.incomplets]).toEqual([1, 1, 3]);
  });

  it('la frontière de l’alerte en requête est EXACTEMENT celle d’enrichir', async () => {
    const limite = new Date(new Date(REFERENCE).getTime() + JOURS_ALERTE_RENOUVELLEMENT * JOUR);
    const hors = { createdAt: new Date('2020-01-01T00:00:00.000Z'), statut: StatutExoneration.ACCORDE, piecesFournies: complet };
    const { svc } = harnais([
      dossier('au-seuil', { ...hors, dateFinValidite: limite }),
      dossier('juste-apres', { ...hors, dateFinValidite: new Date(limite.getTime() + 1) }),
    ]);
    const r = await svc.lister('t1', REFERENCE, { du: '2026-01-01' });
    expect(r.dossiers.map((d) => [d.id, d.alerte, d.joursAvantExpiration])).toEqual([['au-seuil', 'A_RENOUVELER', JOURS_ALERTE_RENOUVELLEMENT]]);
    expect(r.aRenouveler).toBe(1);
  });

  it('au-delà du plafond, la tranche le DIT, et les compteurs portent sur tout le registre', async () => {
    const tous = Array.from({ length: PLAFOND_LISTE_EXONERATIONS + 1 }, (_, i) =>
      dossier(`d${String(i).padStart(4, '0')}`, { createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000) }),
    );
    const { svc } = harnais(tous);
    const r = await svc.lister('t1', REFERENCE);
    expect(r.dossiers).toHaveLength(PLAFOND_LISTE_EXONERATIONS);
    expect([r.total, r.tronque, r.plafond]).toEqual([PLAFOND_LISTE_EXONERATIONS + 1, true, PLAFOND_LISTE_EXONERATIONS]);
    expect(r.incomplets).toBe(PLAFOND_LISTE_EXONERATIONS + 1);
    // Sans échéance, le plus récemment ouvert d'abord · le plus ancien ne tient pas.
    expect(r.dossiers[0].id).toBe(`d${String(PLAFOND_LISTE_EXONERATIONS).padStart(4, '0')}`);
  });

  it('les compteurs se lisent par TRANCHES, sans perdre ni recompter la ligne du curseur', async () => {
    const tous = Array.from({ length: LOT_LECTURE + 2 }, (_, i) => dossier(`c${String(i).padStart(5, '0')}`));
    const { svc, prisma } = harnais(tous);
    const r = await svc.lister('t1', REFERENCE);
    expect(r.incomplets).toBe(LOT_LECTURE + 2);
    const tranches = prisma.exoneration.findMany.mock.calls.filter((c) => c[0].select);
    expect(tranches).toHaveLength(2);
    expect(tranches.every((c) => c[0].take === LOT_LECTURE && c[0].where.tenantId === 't1')).toBe(true);
  });

  it('une date illisible est REFUSÉE avant toute lecture, jamais ignorée', async () => {
    const { svc, prisma } = harnais([dossier('a')]);
    await expect(svc.lister('t1', REFERENCE, { du: '2026-13-01' })).rejects.toThrow(BadRequestException);
    expect(prisma.exoneration.findMany).not.toHaveBeenCalled();
  });
});

describe('F188 · la porte transmet la période, et le DTO la déclare', () => {
  it('le contrôleur passe la date de référence et les deux dates au service', async () => {
    const lister = jest.fn().mockResolvedValue({});
    const ctl = new ExonerationsController({ lister } as unknown as ExonerationsService);
    await ctl.lister({ tenantId: 't1' } as never, { dateReference: REFERENCE, du: '2026-01-01', au: '2026-12-31' });
    expect(lister).toHaveBeenCalledWith('t1', REFERENCE, { du: '2026-01-01', au: '2026-12-31' });
  });

  it('le filtre global admet du et au, et refuse une date de référence illisible', async () => {
    const ok = plainToInstance(ListerExonerationsDto, { dateReference: REFERENCE, du: '2026-01-01', au: '2026-12-31' });
    expect(await validate(ok, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    const illisible = plainToInstance(ListerExonerationsDto, { dateReference: 'hier' });
    expect(await validate(illisible, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });
});
