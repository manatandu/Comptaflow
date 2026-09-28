import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LOT_CONFRONTATION,
  PLAFOND_CONFRONTATION,
  PLAFOND_REGISTRE_PERSONNEL,
  PersonnelService,
} from './personnel.service';
import { AvancesRubriquesService, PLAFOND_LISTES_PAIE } from './avances-rubriques.service';
import { BAREMES_SERVIS, MOTIF_BAREME_NON_SAISISSABLE, motifRefusVersion } from './baremes-dossier';
import { PLAFOND_CONTRATS_PAR_FICHE, PLAFOND_ENFANTS_PAR_FICHE, PLAFOND_GRILLES_SMIG } from './bornes-registre';
import {
  ContratTravailDto,
  DeviseRemunerationDto,
  MOTIF_MONNAIE_REMUNERATION,
  SalarieDto,
  VersionBaremePaieDto,
} from './dto/personnel.dto';
import { effectifDuRegistre } from './effectif-registre';
import { MOTIF_MONNAIE_EXIGEE, motifMonnaieExigee } from './regles-contrat-travail';

/**
 * AUDIT FINAL F226, F227 ET F259 · la monnaie du contrat, le refus de barème
 * qui excluait le SMIG, et les listes du registre sans borne.
 *
 * LES DOUBLURES HONORENT LES FILTRES · `where` (égalité, null et dates
 * compris, `lt`, `lte`, `gt`, `gte`, `not`, `in`, `OR`, `AND`, `NOT`, et les
 * filtres de relation `some`, `every`, `none`), `orderBy` (sens et place des
 * nuls, ceux de PostgreSQL par défaut), `cursor`, `skip`, `take`, et les
 * `include` · tranche et `_count`, filtré compris, calculé sur la collection
 * ENTIÈRE. Un filtre qu'elles ne savent pas lire les fait tomber plutôt que
 * de l'ignorer · une doublure qui rend tout ce qu'on lui donne validerait une
 * liste non bornée et une borne mal posée.
 */

type Ligne = Record<string, unknown>;

const estNul = (v: unknown) => v === null || v === undefined;

function comparer(x: unknown, y: unknown): number {
  const a = x instanceof Date ? x.getTime() : (x as string | number);
  const b = y instanceof Date ? y.getTime() : (y as string | number);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Une valeur de colonne contre un filtre de colonne. */
function vaut(v: unknown, filtre: unknown): boolean {
  if (filtre === undefined) return true;
  if (filtre === null) return estNul(v);
  if (filtre instanceof Date) return v instanceof Date && v.getTime() === filtre.getTime();
  if (typeof filtre !== 'object') return v === filtre;
  return Object.entries(filtre as Ligne).every(([op, x]) => {
    if (x === undefined) return true;
    switch (op) {
      case 'equals':
        return vaut(v, x);
      case 'not':
        return !vaut(v, x);
      case 'in':
        return (x as unknown[]).some((y) => vaut(v, y));
      case 'lt':
        return !estNul(v) && comparer(v, x) < 0;
      case 'lte':
        return !estNul(v) && comparer(v, x) <= 0;
      case 'gt':
        return !estNul(v) && comparer(v, x) > 0;
      case 'gte':
        return !estNul(v) && comparer(v, x) >= 0;
      default:
        throw new Error(`Filtre de colonne que la doublure ne sait pas honorer : ${op}`);
    }
  });
}

function correspond(l: Ligne, where: Ligne = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (k === 'OR') return (v as Ligne[]).some((w) => correspond(l, w));
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w: Ligne) => correspond(l, w));
    if (k === 'NOT') return !(Array.isArray(v) ? v : [v]).some((w: Ligne) => correspond(l, w));
    const val = l[k];
    // Un filtre de relation · la colonne est une collection embarquée.
    if (Array.isArray(val)) {
      return Object.entries(v as Record<string, Ligne>).every(([op, w]) => {
        if (op === 'some') return val.some((e: Ligne) => correspond(e, w));
        if (op === 'every') return val.every((e: Ligne) => correspond(e, w));
        if (op === 'none') return !val.some((e: Ligne) => correspond(e, w));
        throw new Error(`Filtre de relation que la doublure ne sait pas honorer : ${op}`);
      });
    }
    return vaut(val, v);
  });
}

/** Tri de PostgreSQL · les nuls en dernier en montant, en premier en descendant, sauf `nulls` dit. */
function trier(lignes: Ligne[], orderBy: unknown): Ligne[] {
  const cles = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Ligne[];
  return [...lignes].sort((a, b) => {
    for (const o of cles) {
      const [k, spec] = Object.entries(o)[0];
      const sens = typeof spec === 'string' ? spec : (spec as { sort: string }).sort;
      const nuls =
        typeof spec === 'object' && (spec as { nulls?: string }).nulls
          ? (spec as { nulls: string }).nulls
          : sens === 'asc'
            ? 'last'
            : 'first';
      const x = a[k];
      const y = b[k];
      if (estNul(x) && estNul(y)) continue;
      if (estNul(x)) return nuls === 'first' ? -1 : 1;
      if (estNul(y)) return nuls === 'first' ? 1 : -1;
      const c = comparer(x, y);
      if (c !== 0) return sens === 'asc' ? c : -c;
    }
    return 0;
  });
}

type ArgsLecture = {
  where?: Ligne;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  cursor?: { id: string };
  include?: Ligne;
};

/**
 * Une ligne telle que Prisma la rend avec son `include` · chaque collection
 * incluse est filtrée, triée et tranchée comme la requête le demande, et
 * `_count` compte la collection ENTIÈRE, sous son propre filtre.
 */
function projeter(ligne: Ligne, include?: Ligne): Ligne {
  if (!include) return { ...ligne };
  const rendu: Ligne = { ...ligne };
  for (const [k, spec] of Object.entries(include)) {
    if (k === '_count') {
      const select = (spec as { select: Ligne }).select;
      rendu._count = Object.fromEntries(
        Object.entries(select).map(([rel, s]) => {
          const tous = (ligne[rel] as Ligne[] | undefined) ?? [];
          const where = typeof s === 'object' && s !== null ? (s as { where?: Ligne }).where : undefined;
          return [rel, tous.filter((e) => correspond(e, where)).length];
        }),
      );
      continue;
    }
    const valeur = ligne[k];
    if (!Array.isArray(valeur) || spec === true) continue;
    const s = spec as ArgsLecture;
    let r = trier(
      valeur.filter((e: Ligne) => correspond(e, s.where)),
      s.orderBy,
    );
    if (s.skip) r = r.slice(s.skip);
    if (s.take !== undefined) r = r.slice(0, s.take);
    rendu[k] = r;
  }
  return rendu;
}

function lecture(source: Ligne[] | (() => Ligne[])) {
  return jest.fn(async (args: ArgsLecture = {}) => {
    const table = typeof source === 'function' ? source() : source;
    let r = trier(
      table.filter((l) => correspond(l, args.where)),
      args.orderBy,
    );
    if (args.cursor) r = r.slice(r.findIndex((l) => l.id === args.cursor!.id));
    if (args.skip) r = r.slice(args.skip);
    if (args.take !== undefined) r = r.slice(0, args.take);
    return r.map((l) => projeter(l, args.include));
  });
}

function compte(source: Ligne[] | (() => Ligne[])) {
  return jest.fn(async (args: { where?: Ligne } = {}) =>
    (typeof source === 'function' ? source() : source).filter((l) => correspond(l, args.where)).length,
  );
}

const pasTrouvee = () =>
  new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5' });

const pad = (n: number, l: number) => String(n).padStart(l, '0');

function contrat(over: Ligne = {}): Ligne {
  return {
    id: 'c-1',
    tenantId: 't1',
    type: 'DUREE_INDETERMINEE',
    constateParEcrit: true,
    dateEntreeEnVigueur: new Date('2026-01-05T00:00:00Z'),
    dateConclusion: new Date('2026-01-02T00:00:00Z'),
    lieuConclusion: 'Kinshasa',
    dateFinPrevue: null,
    ouvrageDetermine: null,
    motifRemplacement: null,
    emploiPermanent: true,
    natureTravail: 'Gardiennage',
    lieuExecution: 'Kinshasa',
    categorieProfessionnelle: null,
    classeProfessionnelle: 1,
    periodiciteRemuneration: 'MOIS',
    manoeuvreSansSpecialite: false,
    remunerationBase: 1000,
    deviseRemuneration: 'USD',
    avantagesConvenus: 'Transport',
    clauseEssai: false,
    essaiConstateParEcrit: false,
    essaiDureeJours: null,
    dureePreavisJours: 14,
    viseParOnem: true,
    dateVisaOnem: null,
    renouvelleDeId: null,
    dateFin: null,
    motifFin: null,
    ...over,
  };
}

function enfant(over: Ligne = {}): Ligne {
  return {
    id: 'e-1',
    tenantId: 't1',
    salarieId: 's-1',
    nom: 'Mukendi',
    postNom: null,
    prenoms: 'Grâce',
    dateNaissance: new Date('2015-06-01T00:00:00Z'),
    ...over,
  };
}

function salarie(over: Ligne = {}): Ligne {
  return {
    id: 's-1',
    tenantId: 't1',
    matricule: null,
    nom: 'Mukendi',
    postNom: 'Tshibangu',
    prenoms: 'Jean',
    sexe: 'MASCULIN',
    numeroAffiliationCnss: 'CNSS-0099',
    dateNaissance: new Date('1990-04-12T00:00:00Z'),
    millesimeNaissance: null,
    lieuNaissance: 'Mbuji-Mayi',
    nationalite: 'Congolaise',
    nomConjoint: null,
    aptitudeConstateeLe: new Date('2026-01-02T00:00:00Z'),
    aptitudeProvisoire: false,
    declarationEngagementLe: new Date('2026-01-10T00:00:00Z'),
    declarationDepartLe: null,
    actif: true,
    enfants: [],
    contrats: [contrat()],
    ...over,
  };
}

/**
 * Le dossier · les salariés portent leurs enfants et leurs contrats, que les
 * tables `enfantACharge` et `contratTravail` relisent à plat. Les contrats
 * passés à part sont ceux qu'aucune fiche ne porte (écritures unitaires).
 */
function monterPersonnel(salaries: Ligne[], contrats: Ligne[] = [], versions: Ligne[] = []) {
  const salarieFindMany = lecture(salaries);
  const salarieCount = compte(salaries);
  const enfantsAPlat = () => salaries.flatMap((s) => (s.enfants as Ligne[] | undefined) ?? []);
  const contratsAPlat = () => [...salaries.flatMap((s) => (s.contrats as Ligne[] | undefined) ?? []), ...contrats];

  const create = jest.fn(async (args: { data: Ligne }) => ({ id: 'c-neuf', ...args.data }));
  const updateMany = jest.fn(async (args: { where: Ligne; data: Ligne }) => {
    const touches = contrats.filter((c) => correspond(c, args.where));
    for (const c of touches) Object.assign(c, args.data);
    return { count: touches.length };
  });
  // L'écriture UNITAIRE honore tout son filtre, condition « encore nulle »
  // comprise, et rend l'erreur de Prisma quand rien n'y répond.
  const update = jest.fn(async (args: { where: Ligne; data: Ligne }) => {
    const c = contrats.find((x) => correspond(x, args.where));
    if (!c) throw pasTrouvee();
    Object.assign(c, args.data);
    return { ...c };
  });

  const salarieUpdate = jest.fn(async (args: { where: Ligne; data: Ligne; include?: Ligne }) => {
    const s = salaries.find((x) => correspond(x, args.where));
    if (!s) throw pasTrouvee();
    Object.assign(s, args.data);
    return projeter(s, args.include);
  });
  const salarieUpdateMany = jest.fn(async (args: { where: Ligne; data: Ligne }) => {
    const touches = salaries.filter((s) => correspond(s, args.where));
    for (const s of touches) Object.assign(s, args.data);
    return { count: touches.length };
  });
  const salarieGroupBy = jest.fn(async (args: { by: string[]; where: Ligne; _count: { _all: true } }) => {
    const groupes = new Map<string, Ligne & { _count: { _all: number } }>();
    for (const s of salaries.filter((x) => correspond(x, args.where))) {
      const cle = Object.fromEntries(args.by.map((k) => [k, s[k] ?? null]));
      const g = groupes.get(JSON.stringify(cle)) ?? { ...cle, _count: { _all: 0 } };
      g._count._all += 1;
      groupes.set(JSON.stringify(cle), g);
    }
    return [...groupes.values()];
  });

  const enfantDelete = jest.fn(async (args: { where: Ligne }) => {
    for (const s of salaries) {
      const liste = (s.enfants as Ligne[] | undefined) ?? [];
      const i = liste.findIndex((e) => correspond(e, args.where));
      if (i >= 0) return liste.splice(i, 1)[0];
    }
    throw pasTrouvee();
  });
  let neufs = 0;
  const enfantCreate = jest.fn(async (args: { data: Ligne }) => {
    const s = salaries.find((x) => x.id === args.data.salarieId && x.tenantId === args.data.tenantId);
    if (!s) throw new Error('Salarié introuvable pour cet enfant.');
    neufs += 1;
    const e = { id: `e-neuf-${pad(neufs, 3)}`, ...args.data };
    (s.enfants as Ligne[]).push(e);
    return e;
  });
  const enfantDeleteMany = jest.fn(async (args: { where: Ligne }) => {
    let n = 0;
    for (const s of salaries) {
      const garde = ((s.enfants as Ligne[] | undefined) ?? []).filter((e) => !correspond(e, args.where));
      n += ((s.enfants as Ligne[] | undefined) ?? []).length - garde.length;
      s.enfants = garde;
    }
    return { count: n };
  });

  const versionAggregate = jest.fn(async (args: { where: Ligne }) => {
    const retenues = versions.filter((v) => correspond(v, args.where));
    const debuts = retenues.map((v) => v.aPartirDu as string).sort();
    return { _count: { _all: retenues.length }, _min: { aPartirDu: debuts[0] ?? null } };
  });
  const contratAggregate = jest.fn(async (args: { where: Ligne }) => {
    const fins = contratsAPlat()
      .filter((c) => correspond(c, args.where))
      .map((c) => c.dateFin)
      .filter((d): d is Date => d instanceof Date);
    return { _max: { dateFin: fins.length ? new Date(Math.max(...fins.map((d) => d.getTime()))) : null } };
  });

  const prisma: Ligne & { $transaction: jest.Mock } = {
    tenant: {
      findUniqueOrThrow: jest.fn(async () => ({ nom: 'ASBL Bomoko', numeroAffiliationCnssEmployeur: 'CNSS-EMP-4471' })),
    },
    versionBaremePaie: { findMany: lecture(versions), aggregate: versionAggregate },
    salarie: {
      findMany: salarieFindMany,
      count: salarieCount,
      findFirst: jest.fn(async (args: { where: Ligne }) => salaries.find((s) => correspond(s, args.where)) ?? null),
      update: salarieUpdate,
      updateMany: salarieUpdateMany,
      groupBy: salarieGroupBy,
    },
    enfantACharge: {
      findMany: lecture(enfantsAPlat),
      delete: enfantDelete,
      create: enfantCreate,
      deleteMany: enfantDeleteMany,
    },
    contratTravail: {
      findFirst: jest.fn(async (args: { where: Ligne }) => {
        const c = contrats.find((x) => correspond(x, args.where));
        return c ? { ...c } : null;
      }),
      aggregate: contratAggregate,
      count: compte(contratsAPlat),
      updateMany,
      update,
      create,
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return {
    svc: new PersonnelService(prisma as never),
    salarieFindMany,
    salarieCount,
    create,
    updateMany,
    update,
    salarieUpdate,
    salarieUpdateMany,
    enfantDelete,
    enfantCreate,
    enfantDeleteMany,
    salarieFindFirst: (prisma.salarie as { findFirst: jest.Mock }).findFirst,
    contratCount: (prisma.contratTravail as { count: jest.Mock }).count,
    versionFindMany: (prisma.versionBaremePaie as { findMany: jest.Mock }).findMany,
    prisma: prisma as never as {
      contratTravail: { findFirst: jest.Mock };
      enfantACharge: { findMany: jest.Mock };
    },
    brut: prisma as never,
  };
}

const AUJOURDHUI = new Date('2026-03-15T10:00:00Z');

describe('F226 · la monnaie du contrat, jusqu’à la confrontation', () => {
  it('un salaire en dollars n’est jamais « en deçà » d’un minimum en francs', async () => {
    // 1 000 USD par mois lus comme 1 000 FC passaient très en deçà des
    // 559 000 FC de la classe 1 en janvier 2026.
    const { svc } = monterPersonnel([salarie()]);
    const r = await svc.confronter('t1', AUJOURDHUI);
    const v = r.fiches[0].remunerationMinimale;
    expect(v.conforme).toBeNull();
    expect(v.abstention).toBe('REMUNERATION_HORS_FRANC');
    expect(v.convenueFc).toBeNull();
    expect(v.manqueFc).toBeNull();
  });

  it('sans monnaie déclarée, le contrôle s’abstient et le dit', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: [contrat({ deviseRemuneration: null })] })]);
    const v = (await svc.confronter('t1', AUJOURDHUI)).fiches[0].remunerationMinimale;
    expect(v.conforme).toBeNull();
    expect(v.abstention).toBe('DEVISE_NON_RENSEIGNEE');
  });

  it('en francs, le contrôle mord toujours', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: [contrat({ deviseRemuneration: 'CDF' })] })]);
    const r = await svc.confronter('t1', AUJOURDHUI);
    expect(r.fiches[0].remunerationMinimale.conforme).toBe(false);
    expect(r.fiches[0].remunerationMinimale.manqueFc).toBe(559_000 - 1000);
  });

  it('la création du contrat écrit la monnaie, et null quand elle n’est pas dite', async () => {
    const { svc, create } = monterPersonnel([salarie()]);
    await svc.creerContrat('t1', 'u-1', 's-1', {
      type: 'DUREE_INDETERMINEE',
      dateEntreeEnVigueur: '2026-01-05',
      remunerationBase: 1000,
      deviseRemuneration: 'USD',
    } as never);
    expect(create.mock.calls[0][0].data.deviseRemuneration).toBe('USD');
    await svc.creerContrat('t1', 'u-1', 's-1', { type: 'DUREE_INDETERMINEE', dateEntreeEnVigueur: '2026-01-05' } as never);
    expect(create.mock.calls[1][0].data.deviseRemuneration).toBeNull();
  });

  describe('déclarer la monnaie d’un contrat saisi sans elle', () => {
    it('la complète quand elle manque', async () => {
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc } = monterPersonnel([], lignes);
      const r = await svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF');
      expect(lignes[0].deviseRemuneration).toBe('CDF');
      expect(r).toMatchObject({ id: 'c-1', deviseRemuneration: 'CDF' });
    });

    it('ne change jamais une monnaie déjà déclarée', async () => {
      const lignes = [contrat({ deviseRemuneration: 'CDF' })];
      const { svc, updateMany, update } = monterPersonnel([], lignes);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'USD')).rejects.toBeInstanceOf(ConflictException);
      expect(lignes[0].deviseRemuneration).toBe('CDF');
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('pose la condition « encore nulle » dans l’écriture même', async () => {
      // Un autre poste a déclaré entre la lecture et l'écriture.
      const lignes = [contrat({ deviseRemuneration: 'USD' })];
      const { svc, prisma, update } = monterPersonnel([], lignes);
      prisma.contratTravail.findFirst.mockResolvedValueOnce({ id: 'c-1', deviseRemuneration: null } as never);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBeInstanceOf(ConflictException);
      expect(lignes[0].deviseRemuneration).toBe('USD');
      expect(update.mock.calls[0][0].where).toEqual({ id: 'c-1', tenantId: 't1', deviseRemuneration: null });
    });

    it('écrit par une opération UNITAIRE, que le journal d’audit recopie avant et après', async () => {
      // Relecture adverse de F226 · un `updateMany` ne laisse au journal
      // que son filtre et son compte, et la monnaie déclarée, qui décide si
      // le minimum se contrôle, n'y paraissait pas.
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc, update, updateMany } = monterPersonnel([], lignes);
      await svc.declarerDeviseRemuneration('t1', 'c-1', 'USD');
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0].data).toEqual({ deviseRemuneration: 'USD' });
    });

    it('une autre erreur de la base remonte telle quelle, jamais en faux conflit', async () => {
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc, update } = monterPersonnel([], lignes);
      const panne = new Error('connexion perdue');
      update.mockRejectedValueOnce(panne);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBe(panne);
    });

    it('une monnaie inconnue est refusée en français, aux deux portes', async () => {
      const complete = await validate(plainToInstance(DeviseRemunerationDto, { deviseRemuneration: 'EUR' }));
      expect(complete.find((e) => e.property === 'deviseRemuneration')?.constraints?.isEnum).toBe(MOTIF_MONNAIE_REMUNERATION);
      const cree = await validate(
        plainToInstance(ContratTravailDto, {
          type: 'DUREE_INDETERMINEE',
          dateEntreeEnVigueur: '2026-01-05',
          deviseRemuneration: 'EUR',
        }),
      );
      expect(cree.find((e) => e.property === 'deviseRemuneration')?.constraints?.isEnum).toBe(MOTIF_MONNAIE_REMUNERATION);
      expect(await validate(plainToInstance(DeviseRemunerationDto, { deviseRemuneration: 'USD' }))).toEqual([]);
    });

    it('un contrat d’un autre dossier n’existe pas', async () => {
      const lignes = [contrat({ tenantId: 't2', deviseRemuneration: null })];
      const { svc } = monterPersonnel([], lignes);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBeInstanceOf(NotFoundException);
      expect(lignes[0].deviseRemuneration).toBeNull();
    });
  });

  describe('la fin du contrat, au journal d’audit comme la monnaie', () => {
    // Relecture de cohérence du lot 5 · la date de fin choisit le mois de
    // référence du contrôle du minimum. Écrite par `updateMany`, elle ne
    // laissait au journal que le filtre et le compte.
    it('écrit la date et le motif de fin par une opération UNITAIRE, bornée au dossier', async () => {
      const lignes = [contrat({ deviseRemuneration: 'CDF' })];
      const { svc, update, updateMany } = monterPersonnel([], lignes);
      const r = await svc.terminerContrat('t1', 'c-1', { dateFin: '2026-06-30', motifFin: ' Démission ' } as never);
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toEqual({
        where: { id: 'c-1', tenantId: 't1' },
        data: { dateFin: new Date('2026-06-30'), motifFin: 'Démission' },
      });
      expect(lignes[0].dateFin).toEqual(new Date('2026-06-30'));
      expect(r).toMatchObject({ id: 'c-1', motifFin: 'Démission' });
    });

    it('un contrat d’un autre dossier n’est pas terminé', async () => {
      const lignes = [contrat({ tenantId: 't2' })];
      const { svc, update } = monterPersonnel([], lignes);
      await expect(svc.terminerContrat('t1', 'c-1', { dateFin: '2026-06-30' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
      expect(lignes[0].dateFin).toBeNull();
    });
  });
});

/**
 * SUITE DE F226 · UN MONTANT CONVENU NE S'ENREGISTRE PLUS SANS SA MONNAIE, et
 * les contrats déjà saisis sans elle sont comptés, jamais remplis d'office
 * (décision de Manasse, `MOTIF_MONNAIE_EXIGEE`).
 */
describe('F226, suite · la monnaie exigée à la création, les anciens contrats comptés', () => {
  // Le pipe de production, tel que `bootstrap.ts` le pose · c'est lui qui
  // rend le 400 du corps de la requête.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const passerAuPipe = (corps: Ligne) =>
    pipe.transform(corps, { type: 'body', metatype: ContratTravailDto });
  const base = { type: 'DUREE_INDETERMINEE', dateEntreeEnVigueur: '2026-01-05' };

  describe('à la porte, le corps de la requête', () => {
    it('refuse en 400 un montant sans monnaie, avec le motif nommé', async () => {
      for (const devise of [undefined, null]) {
        const refus = await passerAuPipe({ ...base, remunerationBase: 800, deviseRemuneration: devise }).catch((e) => e);
        expect(refus).toBeInstanceOf(BadRequestException);
        expect(refus.getStatus()).toBe(400);
        expect((refus.getResponse() as { message: string[] }).message).toContain(MOTIF_MONNAIE_EXIGEE);
      }
    });

    it('un montant nul est un montant · la monnaie reste due', async () => {
      const refus = await passerAuPipe({ ...base, remunerationBase: 0 }).catch((e) => e);
      expect(refus).toBeInstanceOf(BadRequestException);
    });

    it('accepte un contrat sans rémunération, sans rien exiger', async () => {
      await expect(passerAuPipe({ ...base })).resolves.toBeInstanceOf(ContratTravailDto);
    });

    it('accepte un montant avec sa monnaie, dans les deux monnaies', async () => {
      for (const devise of ['CDF', 'USD']) {
        await expect(
          passerAuPipe({ ...base, remunerationBase: 800, deviseRemuneration: devise }),
        ).resolves.toMatchObject({ remunerationBase: 800, deviseRemuneration: devise });
      }
    });
  });

  describe('au service, pour qui contournerait le corps', () => {
    it('refuse un montant sans monnaie avant toute lecture, et n’écrit rien', async () => {
      const { svc, create, salarieFindFirst } = monterPersonnel([salarie()]);
      const refus = await svc
        .creerContrat('t1', 'u-1', 's-1', { ...base, remunerationBase: 800 } as never)
        .catch((e) => e);
      expect(refus).toBeInstanceOf(BadRequestException);
      expect(refus.message).toBe(MOTIF_MONNAIE_EXIGEE);
      expect(create).not.toHaveBeenCalled();
      expect(salarieFindFirst).not.toHaveBeenCalled();
    });

    it('écrit un contrat sans rémunération, et un montant avec sa monnaie', async () => {
      const { svc, create } = monterPersonnel([salarie()]);
      await svc.creerContrat('t1', 'u-1', 's-1', { ...base } as never);
      await svc.creerContrat('t1', 'u-1', 's-1', { ...base, remunerationBase: 800, deviseRemuneration: 'USD' } as never);
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1][0].data).toMatchObject({ remunerationBase: 800, deviseRemuneration: 'USD' });
    });

    it('la règle pure · due sur un montant, jamais sans montant', () => {
      expect(motifMonnaieExigee(800, undefined)).toBe(MOTIF_MONNAIE_EXIGEE);
      expect(motifMonnaieExigee(800, '')).toBe(MOTIF_MONNAIE_EXIGEE);
      expect(motifMonnaieExigee(0, null)).toBe(MOTIF_MONNAIE_EXIGEE);
      expect(motifMonnaieExigee(null, null)).toBeNull();
      expect(motifMonnaieExigee(undefined, undefined)).toBeNull();
      expect(motifMonnaieExigee(800, 'CDF')).toBeNull();
    });
  });

  describe('le registre compte les contrats à compléter', () => {
    const dossier = () => [
      // À compléter · un montant, pas de monnaie. L'un est chez un salarié
      // parti, le décompte vaut tout le registre.
      salarie({ id: 's-a', nom: 'Amani', contrats: [contrat({ id: 'c-a', deviseRemuneration: null })] }),
      salarie({
        id: 's-b',
        nom: 'Bisimwa',
        actif: false,
        contrats: [contrat({ id: 'c-b', deviseRemuneration: null })],
      }),
      // Pas à compléter · monnaie dite, ou aucun montant.
      salarie({
        id: 's-c',
        nom: 'Chako',
        contrats: [
          contrat({ id: 'c-c1', deviseRemuneration: 'CDF' }),
          contrat({ id: 'c-c2', remunerationBase: null, deviseRemuneration: null }),
        ],
      }),
      // Un autre dossier ne compte pas.
      salarie({ id: 's-x', tenantId: 't2', nom: 'Zola', contrats: [contrat({ id: 'c-x', tenantId: 't2', deviseRemuneration: null })] }),
    ];

    it('compte par la base, sur le dossier entier, inactifs compris', async () => {
      const { svc, contratCount } = monterPersonnel(dossier());
      const r = await svc.lister('t1');
      expect(r.contratsACompleter).toBe(2);
      expect(contratCount).toHaveBeenCalledWith({
        where: { tenantId: 't1', remunerationBase: { not: null }, deviseRemuneration: null },
      });
    });

    it('le filtre montre ces salariés-là et eux seuls, partis compris', async () => {
      const { svc } = monterPersonnel(dossier());
      const r = await svc.lister('t1', false, true);
      expect(r.salaries.map((s) => s.id)).toEqual(['s-a', 's-b']);
      expect(r.total).toBe(2);
      expect(r.contratsACompleter).toBe(2);
    });

    it('rien n’est rempli d’office · la lecture n’écrit aucune monnaie', async () => {
      const lignes = dossier();
      const { svc, update, updateMany } = monterPersonnel(lignes);
      await svc.lister('t1');
      await svc.confronter('t1', AUJOURDHUI);
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect((lignes[0].contrats as Ligne[])[0].deviseRemuneration).toBeNull();
    });
  });
});

describe('F259 · le registre du personnel, une liste de travail bornée', () => {
  const registre = (n: number, over: (i: number) => Ligne = () => ({})) =>
    Array.from({ length: n }, (_, i) =>
      salarie({ id: `s-${pad(i, 4)}`, nom: `S${pad(i, 4)}`, contrats: [], ...over(i) }),
    );

  it('rend une tranche, et compte le registre ENTIER', async () => {
    const lignes = [...registre(PLAFOND_REGISTRE_PERSONNEL + 1), salarie({ id: 's-inactif', nom: 'Zola', actif: false, contrats: [] })];
    const { svc } = monterPersonnel(lignes);
    const r = await svc.lister('t1');
    expect(r.salaries).toHaveLength(PLAFOND_REGISTRE_PERSONNEL);
    expect(r.total).toBe(PLAFOND_REGISTRE_PERSONNEL + 1);
    expect(r.tronque).toBe(true);
    expect(r.plafond).toBe(PLAFOND_REGISTRE_PERSONNEL);
  });

  it('le total suit le même périmètre que la liste · les inactifs selon la case', async () => {
    const lignes = [...registre(2), salarie({ id: 's-inactif', nom: 'Zola', actif: false, contrats: [] })];
    const { svc } = monterPersonnel(lignes);
    const actifs = await svc.lister('t1');
    expect(actifs.total).toBe(2);
    expect(actifs.tronque).toBe(false);
    const tous = await svc.lister('t1', true);
    expect(tous.total).toBe(3);
    expect(tous.salaries).toHaveLength(3);
    expect(tous.tronque).toBe(false);
  });

  it('le contrat en cours et le nombre de contrats restent servis', async () => {
    const { svc } = monterPersonnel([salarie()]);
    const r = await svc.lister('t1');
    expect(r.salaries[0].contratEnCours).toMatchObject({ id: 'c-1' });
    expect(r.salaries[0].nombreContrats).toBe(1);
  });

  describe('la confrontation, lue par tranches', () => {
    // L'identifiant va à rebours du nom · l'ordre de lecture (par
    // identifiant) n'est pas l'ordre de l'écran (par nom), et une tranche
    // retenue dans l'ordre de lecture garderait les mauvais contrats.
    const n = PLAFOND_CONFRONTATION + 1;
    const lignes = [
      ...Array.from({ length: n }, (_, i) =>
        salarie({
          id: `s-${pad(9999 - i, 4)}`,
          nom: `S${pad(i, 4)}`,
          postNom: null,
          prenoms: null,
          contrats: [contrat({ id: `c-${pad(i, 4)}`, deviseRemuneration: 'CDF' })],
        }),
      ),
      // Un salarié d'un autre dossier · la doublure honore la borne.
      salarie({ id: 's-0000', tenantId: 't2', nom: 'Autre dossier' }),
    ];

    it('rend les premières fiches dans l’ordre du nom, et le dit', async () => {
      const { svc } = monterPersonnel(lignes);
      const r = await svc.confronter('t1', AUJOURDHUI);
      expect(r.fiches).toHaveLength(PLAFOND_CONFRONTATION);
      expect(r.totalFiches).toBe(n);
      expect(r.tronque).toBe(true);
      expect(r.fiches[0].salarie).toBe('S0000');
      expect(r.fiches[PLAFOND_CONFRONTATION - 1].salarie).toBe(`S${pad(PLAFOND_CONFRONTATION - 1, 4)}`);
      expect(r.fiches.some((f) => f.salarie === `S${pad(n - 1, 4)}`)).toBe(false);
    });

    it('compte les signalements sur le registre ENTIER, pas sur la tranche', async () => {
      const { svc } = monterPersonnel(lignes);
      const r = await svc.confronter('t1', AUJOURDHUI);
      // Des contrats identiques · chacun porte le même nombre de signalements
      // (ici, le minimum en deçà de la classe 1).
      const f = r.fiches[0];
      const parFiche =
        f.mentionsManquantes.length +
        f.requalifications.length +
        f.declarations.filter((d) => d.enRetard).length +
        (f.remunerationMinimale.conforme === false ? 1 : 0);
      expect(parFiche).toBeGreaterThan(0);
      expect(r.totalSignalements).toBe(parFiche * n);
    });

    it('lit les salariés par lots bornés, chacun dans le dossier', async () => {
      const { svc, salarieFindMany } = monterPersonnel(lignes);
      await svc.confronter('t1', AUJOURDHUI);
      expect(salarieFindMany.mock.calls.length).toBe(Math.ceil(n / LOT_CONFRONTATION));
      for (const [args] of salarieFindMany.mock.calls) {
        expect(args?.where).toEqual({ tenantId: 't1' });
        expect(args?.take).toBe(LOT_CONFRONTATION);
      }
    });

    it('une liste qui tient dans la borne n’est pas dite tronquée', async () => {
      const { svc } = monterPersonnel([salarie()]);
      const r = await svc.confronter('t1', AUJOURDHUI);
      expect(r.fiches).toHaveLength(1);
      expect(r.totalFiches).toBe(1);
      expect(r.tronque).toBe(false);
    });
  });
});

type Confrontation = Awaited<ReturnType<PersonnelService['confronter']>>;

describe('F259, reste · les collections imbriquées d’une fiche, bornées et comptées', () => {
  // Cent vingt contrats terminés, un par mois de 2001 à 2010, et le contrat
  // EN COURS entré en 2000 · le plus ANCIEN des cent vingt et un. Une tranche
  // prise par entrée en vigueur décroissante le perdrait, et la liste
  // afficherait « aucun contrat en cours » en face d'un salarié en poste.
  const contrats = () => [
    contrat({ id: 'c-en-cours', dateEntreeEnVigueur: new Date(Date.UTC(2000, 0, 3)), dateFin: null }),
    ...Array.from({ length: 120 }, (_, i) =>
      contrat({
        id: `c-${pad(i, 4)}`,
        dateEntreeEnVigueur: new Date(Date.UTC(2001 + Math.floor(i / 12), i % 12, 1)),
        dateFin: new Date(Date.UTC(2001 + Math.floor(i / 12), i % 12, 28)),
      }),
    ),
  ];
  const enfants = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      enfant({ id: `e-${pad(i, 3)}`, prenoms: `E${pad(i, 3)}`, dateNaissance: new Date(Date.UTC(2000, 0, 1 + i)) }),
    );

  it('les contrats · une tranche qui garde le contrat en cours, et le nombre compté par la base', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: contrats() })]);
    const f = (await svc.lister('t1')).salaries[0];
    expect(f.contrats).toHaveLength(PLAFOND_CONTRATS_PAR_FICHE);
    expect(f.contratEnCours).toMatchObject({ id: 'c-en-cours' });
    expect(f.nombreContrats).toBe(121);
    expect(f.contratsTronques).toBe(true);
    // Les terminés retenus sont les plus récents · le 21e plus ancien reste,
    // le 20e ne tient plus dans la tranche.
    const ids = f.contrats.map((c) => c.id);
    expect(ids).toContain('c-0021');
    expect(ids).not.toContain('c-0020');
    // Et la fiche les montre dans l'ordre qu'elle a toujours eu · par entrée
    // en vigueur décroissante, le contrat en cours en dernier ici.
    expect(ids[0]).toBe('c-0119');
    expect(ids[ids.length - 1]).toBe('c-en-cours');
  });

  it('les enfants · une tranche, et le nombre compté par la base', async () => {
    const { svc } = monterPersonnel([salarie({ enfants: enfants(60) })]);
    const f = (await svc.lister('t1')).salaries[0];
    expect(f.enfants).toHaveLength(PLAFOND_ENFANTS_PAR_FICHE);
    expect(f.nombreEnfants).toBe(60);
    expect(f.enfantsTronques).toBe(true);
    // Les aînés d'abord, dans l'ordre des dates de naissance.
    expect(f.enfants[0].id).toBe('e-000');
    expect(f.enfants.map((e) => e.id)).not.toContain('e-059');
  });

  it('sous la borne, rien ne change · tout est rendu, rien n’est dit tronqué', async () => {
    const deux = [
      contrat({ id: 'c-a', dateEntreeEnVigueur: new Date(Date.UTC(2024, 0, 1)), dateFin: new Date(Date.UTC(2025, 11, 31)) }),
      contrat({ id: 'c-b', dateEntreeEnVigueur: new Date(Date.UTC(2026, 0, 5)), dateFin: null }),
    ];
    const { svc } = monterPersonnel([salarie({ contrats: deux, enfants: enfants(3) })]);
    const f = (await svc.lister('t1')).salaries[0];
    expect(f.contrats.map((c) => c.id)).toEqual(['c-b', 'c-a']);
    expect(f.contratEnCours).toMatchObject({ id: 'c-b' });
    expect(f.nombreContrats).toBe(2);
    expect(f.contratsTronques).toBe(false);
    expect(f.enfants).toHaveLength(3);
    expect(f.nombreEnfants).toBe(3);
    expect(f.enfantsTronques).toBe(false);
  });
});

describe('F259, reste · la fiche se modifie par son identifiant, bornée au dossier', () => {
  const dto = (over: Ligne = {}) => ({ nom: 'Mukendi', sexe: 'MASCULIN', nationalite: 'Belge', ...over }) as never;

  it('écrit par une opération UNITAIRE, jamais par `updateMany`', async () => {
    const lignes = [salarie({ enfants: [enfant()] })];
    const { svc, salarieUpdate, salarieUpdateMany, enfantDeleteMany } = monterPersonnel(lignes);
    const f = await svc.modifierSalarie('t1', 's-1', dto());
    expect(salarieUpdateMany).not.toHaveBeenCalled();
    expect(enfantDeleteMany).not.toHaveBeenCalled();
    expect(salarieUpdate).toHaveBeenCalledTimes(1);
    expect(salarieUpdate.mock.calls[0][0].where).toEqual({ id: 's-1', tenantId: 't1' });
    expect(lignes[0].nationalite).toBe('Belge');
    expect(f).toMatchObject({ id: 's-1', nationalite: 'Belge', nombreContrats: 1, nombreEnfants: 1 });
  });

  it('un salarié d’un autre dossier n’existe pas, et rien n’est écrit', async () => {
    const lignes = [salarie({ tenantId: 't2', enfants: [enfant({ tenantId: 't2' })] })];
    const { svc, salarieUpdate, salarieUpdateMany, enfantDelete, enfantCreate } = monterPersonnel(lignes);
    await expect(
      svc.modifierSalarie('t1', 's-1', dto({ enfants: [{ nom: 'Autre' }] })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(salarieUpdate).not.toHaveBeenCalled();
    expect(salarieUpdateMany).not.toHaveBeenCalled();
    expect(enfantDelete).not.toHaveBeenCalled();
    expect(enfantCreate).not.toHaveBeenCalled();
    expect(lignes[0].nationalite).toBe('Congolaise');
  });

  it('des enfants inchangés ne se réécrivent pas', async () => {
    const lignes = [salarie({ enfants: [enfant()] })];
    const { svc, enfantDelete, enfantCreate } = monterPersonnel(lignes);
    await svc.modifierSalarie('t1', 's-1', dto({ enfants: [{ nom: 'Mukendi', prenoms: 'Grâce', dateNaissance: '2015-06-01' }] }));
    expect(enfantDelete).not.toHaveBeenCalled();
    expect(enfantCreate).not.toHaveBeenCalled();
    expect((lignes[0].enfants as Ligne[]).map((e) => e.id)).toEqual(['e-1']);
  });

  it('des enfants changés se remplacent un par un, chacun par son identifiant', async () => {
    const lignes = [salarie({ enfants: [enfant(), enfant({ id: 'e-2', prenoms: 'Paul' })] })];
    const { svc, enfantDelete, enfantCreate, enfantDeleteMany } = monterPersonnel(lignes);
    const f = await svc.modifierSalarie(
      't1',
      's-1',
      dto({ enfants: [{ nom: 'Mukendi', prenoms: 'Grâce', dateNaissance: '2015-06-01' }, { nom: 'Mukendi', prenoms: 'Ruth' }] }),
    );
    expect(enfantDeleteMany).not.toHaveBeenCalled();
    expect(enfantDelete.mock.calls.map(([a]) => a.where)).toEqual([
      { id: 'e-1', tenantId: 't1' },
      { id: 'e-2', tenantId: 't1' },
    ]);
    expect(enfantCreate.mock.calls.map(([a]) => a.data)).toEqual([
      { tenantId: 't1', salarieId: 's-1', nom: 'Mukendi', postNom: null, prenoms: 'Grâce', dateNaissance: new Date('2015-06-01') },
      { tenantId: 't1', salarieId: 's-1', nom: 'Mukendi', postNom: null, prenoms: 'Ruth', dateNaissance: null },
    ]);
    expect(f.nombreEnfants).toBe(2);
    expect(f.enfants.map((e) => e.prenoms).sort()).toEqual(['Grâce', 'Ruth']);
  });

  it('une fiche qui porte plus d’enfants que l’écran n’en montre ne se remplace pas', async () => {
    const lignes = [salarie({ enfants: Array.from({ length: PLAFOND_ENFANTS_PAR_FICHE + 1 }, (_, i) => enfant({ id: `e-${pad(i, 3)}` })) })];
    const { svc, enfantDelete, enfantCreate, salarieUpdate } = monterPersonnel(lignes);
    await expect(svc.modifierSalarie('t1', 's-1', dto({ enfants: [{ nom: 'Seul' }] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(enfantDelete).not.toHaveBeenCalled();
    expect(enfantCreate).not.toHaveBeenCalled();
    expect(salarieUpdate).not.toHaveBeenCalled();
    expect(lignes[0].enfants).toHaveLength(PLAFOND_ENFANTS_PAR_FICHE + 1);
  });

  it('sans enfants dans la demande, les enfants ne sont pas même relus', async () => {
    const { svc, prisma } = monterPersonnel([salarie({ enfants: [enfant()] })]);
    await svc.modifierSalarie('t1', 's-1', dto());
    expect(prisma.enfantACharge.findMany).not.toHaveBeenCalled();
  });

  it('le corps de la requête ne porte pas plus d’enfants que la fiche n’en montre', async () => {
    const corps = (n: number) =>
      plainToInstance(SalarieDto, {
        nom: 'Mukendi',
        sexe: 'MASCULIN',
        enfants: Array.from({ length: n }, (_, i) => ({ nom: `E${i}` })),
      });
    const trop = (await validate(corps(PLAFOND_ENFANTS_PAR_FICHE + 1))).find((e) => e.property === 'enfants');
    expect(trop?.constraints?.arrayMaxSize).toContain(String(PLAFOND_ENFANTS_PAR_FICHE));
    expect((await validate(corps(PLAFOND_ENFANTS_PAR_FICHE))).find((e) => e.property === 'enfants')).toBeUndefined();
  });
});

describe('F259, reste · la confrontation lit les grilles SMIG par une borne déclarée', () => {
  // Deux cent quarante-cinq grilles mensuelles de février 2026 à juin 2046,
  // chacune à un taux qui lui est propre · une grille lue se reconnaît à son
  // taux. Plus une grille postérieure au dernier mois qu'un contrat puisse
  // viser, une version ONEM, et une grille d'un autre dossier.
  const AU = new Date('2046-06-15T10:00:00Z');
  const moisDe = (i: number) => {
    const d = new Date(Date.UTC(2026, 1 + i, 1));
    return d.toISOString().slice(0, 10);
  };
  const grille = (aPartirDu: string, smig: number, over: Ligne = {}): Ligne => ({
    id: `v-${aPartirDu}`,
    tenantId: 't1',
    bareme: 'SMIG',
    aPartirDu,
    reference: `Arrêté ${aPartirDu}`,
    valeurs: { smigJournalierFc: smig },
    ...over,
  });
  const versions = () => [
    ...Array.from({ length: 245 }, (_, i) => grille(moisDe(i), 30_000 + i * 10)),
    grille('2046-09-01', 99_999),
    { id: 'v-onem', tenantId: 't1', bareme: 'ONEM', aPartirDu: '2026-03-01', reference: 'ONEM', valeurs: { taux: 0.01 } },
    grille('2030-01-01', 1, { id: 'v-autre', tenantId: 't2' }),
  ];
  const enFrancs = (over: Ligne) =>
    contrat({ deviseRemuneration: 'CDF', periodiciteRemuneration: 'MOIS', classeProfessionnelle: 1, remunerationBase: 1000, ...over });
  const contratsDuSalarie = () => [
    enFrancs({ id: 'c-janvier', dateEntreeEnVigueur: new Date(Date.UTC(2025, 6, 1)), dateFin: new Date(Date.UTC(2026, 0, 31)) }),
    enFrancs({ id: 'c-avril', dateEntreeEnVigueur: new Date(Date.UTC(2026, 1, 1)), dateFin: new Date(Date.UTC(2026, 3, 30)) }),
    enFrancs({ id: 'c-aout', dateEntreeEnVigueur: new Date(Date.UTC(2026, 4, 1)), dateFin: new Date(Date.UTC(2026, 7, 31)) }),
    enFrancs({ id: 'c-en-cours', dateEntreeEnVigueur: new Date(Date.UTC(2026, 8, 1)), dateFin: null }),
  ];
  const verdictDe = (r: Confrontation, id: string) => r.fiches.find((f) => f.contratId === id)!.remunerationMinimale;

  it('au-delà de la borne, s’abstient sur les seuls contrats qu’une grille non lue régirait', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: contratsDuSalarie() })], [], versions());
    const r = await svc.confronter('t1', AU);

    // Avril 2026 · sa grille est parmi les cinq plus anciennes, non lues.
    const avril = verdictDe(r, 'c-avril');
    expect(avril.abstention).toBe('GRILLES_SMIG_NON_LUES');
    expect(avril.conforme).toBeNull();
    expect(avril.explication).toContain('2026-02');
    expect(avril.explication).toContain('2026-07');
    // Janvier 2026 · avant toute grille du cabinet, l'annexe du décret.
    expect(verdictDe(r, 'c-janvier').minimumFc).toBe(21_500 * 26);
    // Août 2026 · la plus ancienne des grilles lues à s'appliquer.
    expect(verdictDe(r, 'c-aout').minimumFc).toBe((30_000 + 6 * 10) * 26);
    // Le contrat en cours · la grille du mois courant, jamais la postérieure.
    expect(verdictDe(r, 'c-en-cours').minimumFc).toBe((30_000 + 244 * 10) * 26);

    expect(r.grillesSmig).toEqual({ lues: PLAFOND_GRILLES_SMIG, total: 245, plafond: PLAFOND_GRILLES_SMIG, tronque: true });
  });

  it('la requête est bornée, au dossier, au SMIG et au dernier mois qu’un contrat vise', async () => {
    const { svc, versionFindMany } = monterPersonnel([salarie({ contrats: contratsDuSalarie() })], [], versions());
    await svc.confronter('t1', AU);
    expect(versionFindMany).toHaveBeenCalledTimes(1);
    const args = versionFindMany.mock.calls[0][0];
    expect(args.take).toBe(PLAFOND_GRILLES_SMIG);
    expect(args.where).toEqual({ tenantId: 't1', bareme: 'SMIG', aPartirDu: { lt: '2046-07-01' } });
    expect(args.orderBy).toEqual({ aPartirDu: 'desc' });
  });

  it('un contrat terminé APRÈS le mois courant recule la borne jusqu’à lui', async () => {
    const tardif = [enFrancs({ id: 'c-tardif', dateEntreeEnVigueur: new Date(Date.UTC(2046, 0, 1)), dateFin: new Date(Date.UTC(2046, 9, 31)) })];
    const { svc, versionFindMany } = monterPersonnel([salarie({ contrats: tardif })], [], versions());
    const r = await svc.confronter('t1', AU);
    expect(versionFindMany.mock.calls[0][0].where.aPartirDu).toEqual({ lt: '2046-11-01' });
    // La grille de septembre 2046 régit ce contrat · elle est lue.
    expect(verdictDe(r, 'c-tardif').minimumFc).toBe(99_999 * 26);
  });

  it('sous la borne, rien ne change · tout est lu, rien n’est dit tronqué', async () => {
    const trois = [grille('2026-02-01', 22_000), grille('2026-03-01', 23_000), grille('2026-04-01', 24_000)];
    const { svc } = monterPersonnel([salarie({ contrats: [enFrancs({ id: 'c-avril', dateFin: new Date(Date.UTC(2026, 3, 30)) })] })], [], trois);
    const r = await svc.confronter('t1', AU);
    expect(verdictDe(r, 'c-avril').minimumFc).toBe(24_000 * 26);
    expect(verdictDe(r, 'c-avril').abstention).toBeNull();
    expect(r.grillesSmig).toEqual({ lues: 3, total: 3, plafond: PLAFOND_GRILLES_SMIG, tronque: false });
  });
});

describe('F259, reste · les enfants sans date de naissance, comptés par la base', () => {
  const situation = (r: Confrontation) =>
    r.fiches[0].mentionsManquantes.find((m) => m.point === 'SITUATION_FAMILIALE');

  it('tous datés · aucun manque au point 7', async () => {
    const { svc } = monterPersonnel([salarie({ enfants: [enfant(), enfant({ id: 'e-2' }), enfant({ id: 'e-3' })] })]);
    expect(situation(await svc.confronter('t1', AUJOURDHUI))).toBeUndefined();
  });

  it('un seul sans date · le manque le compte, lui et lui seul', async () => {
    const { svc } = monterPersonnel([
      salarie({ enfants: [enfant(), enfant({ id: 'e-2', dateNaissance: null }), enfant({ id: 'e-3' })] }),
    ]);
    const m = situation(await svc.confronter('t1', AUJOURDHUI));
    expect(m?.motif.startsWith('1 enfant(s)')).toBe(true);
  });
});

describe('F259, reste · l’effectif, compté par la base', () => {
  const ALA = new Date('2026-06-30T00:00:00Z');
  const c = (id: string, over: Ligne) => contrat({ id, dateEntreeEnVigueur: new Date('2026-01-05T00:00:00Z'), dateFin: null, ...over });
  const registre = () => [
    // Deux CDD simultanés · une personne, pas deux.
    salarie({
      id: 's-a',
      nationalite: 'Congolaise',
      sexe: 'MASCULIN',
      contrats: [c('a-1', { type: 'DUREE_DETERMINEE' }), c('a-2', { type: 'DUREE_DETERMINEE' })],
    }),
    // Un CDD terminé et un CDI en vigueur · permanente par le CDI.
    salarie({
      id: 's-b',
      nationalite: 'RDC ',
      sexe: 'FEMININ',
      contrats: [
        c('b-1', { type: 'DUREE_DETERMINEE', dateEntreeEnVigueur: new Date('2025-01-06T00:00:00Z'), dateFin: new Date('2025-12-31T00:00:00Z') }),
        c('b-2', { type: 'DUREE_INDETERMINEE' }),
      ],
    }),
    // Parti avant la date · hors de l'effectif.
    salarie({ id: 's-c', nationalite: 'Belge', contrats: [c('c-1', { dateFin: new Date('2026-03-31T00:00:00Z') })] }),
    // Pas encore entré à la date.
    salarie({ id: 's-d', contrats: [c('d-1', { dateEntreeEnVigueur: new Date('2026-09-01T00:00:00Z') })] }),
    // Un autre dossier.
    salarie({ id: 's-e', tenantId: 't2', contrats: [c('e-1', { tenantId: 't2' })] }),
    // Termine le jour même · encore à l'effectif.
    salarie({ id: 's-f', nationalite: ' congolaise', sexe: 'MASCULIN', contrats: [c('f-1', { dateFin: ALA })] }),
    salarie({ id: 's-g', nationalite: 'Belge', sexe: 'FEMININ', contrats: [c('g-1', {})] }),
  ];

  it('une personne par salarié en vigueur, et les permanents par leur CDI', async () => {
    const { brut } = monterPersonnel(registre());
    const e = await effectifDuRegistre(brut, 't1', ALA);
    expect(e).toMatchObject({ effectif: 4, hommes: 2, femmes: 2, permanents: 3, nationaux: 3, sansNationalite: 0 });
    expect(e.partMainOeuvreNationale).toBe(75);
    expect(e.reserve).toBeNull();
  });

  it('une nationalité manquante rend la part nulle, et le dit', async () => {
    const lignes = [...registre(), salarie({ id: 's-h', nationalite: null, contrats: [c('h-1', {})] })];
    const { brut } = monterPersonnel(lignes);
    const e = await effectifDuRegistre(brut, 't1', ALA);
    expect(e.effectif).toBe(5);
    expect(e.sansNationalite).toBe(1);
    expect(e.partMainOeuvreNationale).toBeNull();
    expect(e.reserve).toContain('1 salarié(s)');
  });
});

describe('F259 · rubriques, bulletins modèles et avances, bornés', () => {
  function monter(tables: { rubriques?: Ligne[]; modeles?: Ligne[]; avances?: Ligne[] }) {
    const r = tables.rubriques ?? [];
    const m = tables.modeles ?? [];
    const a = tables.avances ?? [];
    return new AvancesRubriquesService({
      rubriquePaie: { findMany: lecture(r), count: compte(r) },
      modeleBulletin: { findMany: lecture(m), count: compte(m) },
      avanceSalaire: { findMany: lecture(a), count: compte(a) },
    } as never);
  }
  const avance = (i: number, salarieId: string): Ligne => ({
    id: `a-${pad(i, 4)}`,
    tenantId: 't1',
    salarieId,
    salarie: { nom: 'Mukendi', postNom: null, prenoms: null, matricule: null },
    type: 'AVANCE',
    categoriePret: null,
    dateOctroi: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
    montantFc: 100_000,
    retenueMensuelleFc: null,
    objet: 'Rentrée',
    pieceJustificative: 'Reconnaissance',
    retenues: [],
  });

  it('les avances · une tranche, et le total du périmètre demandé', async () => {
    const avances = [
      ...Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => avance(i, 's1')),
      ...Array.from({ length: 3 }, (_, i) => avance(900 + i, 's2')),
    ];
    const s = monter({ avances });
    const tout = await s.listerAvances('t1');
    expect(tout.avances).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(tout.total).toBe(PLAFOND_LISTES_PAIE + 4);
    expect(tout.tronque).toBe(true);
    const duSalarie = await s.listerAvances('t1', 's2');
    expect(duSalarie.avances).toHaveLength(3);
    expect(duSalarie.total).toBe(3);
    expect(duSalarie.tronque).toBe(false);
    // Le solde reste calculé sur chaque ligne rendue.
    expect(duSalarie.avances[0].soldeFc).toBe(100_000);
  });

  it('les rubriques · une tranche, les natures permises toujours servies', async () => {
    const rubriques = Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => ({
      id: `r-${i}`,
      tenantId: 't1',
      code: `R${pad(i, 4)}`,
    }));
    const r = await monter({ rubriques }).listerRubriques('t1');
    expect(r.rubriques).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(r.total).toBe(PLAFOND_LISTES_PAIE + 1);
    expect(r.tronque).toBe(true);
    expect(r.naturesPermises.length).toBeGreaterThan(0);
  });

  it('les bulletins modèles · une tranche qui le dit', async () => {
    const modeles = Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => ({
      id: `m-${i}`,
      tenantId: 't1',
      nom: `M${pad(i, 4)}`,
    }));
    const r = await monter({ modeles }).listerModeles('t1');
    expect(r.modeles).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(r.total).toBe(PLAFOND_LISTES_PAIE + 1);
    expect(r.tronque).toBe(true);
    const court = await monter({ modeles: modeles.slice(0, 2) }).listerModeles('t1');
    expect(court.tronque).toBe(false);
  });
});

describe('F227 · le refus de barème dit ce qui se saisit, SMIG compris', () => {
  it('nomme chaque barème servi parmi ceux qui se saisissent', () => {
    const motif = motifRefusVersion({ bareme: 'IRPP', aPartirDu: '2027-01-01', reference: 'Loi n° 99/2027', valeurs: {} }, []);
    expect(motif).toBe(MOTIF_BAREME_NON_SAISISSABLE);
    // La première phrase est celle de ce qui SE SAISIT · le SMIG y est.
    const seSaisit = MOTIF_BAREME_NON_SAISISSABLE.split(' · ')[0];
    for (const b of BAREMES_SERVIS) expect(seSaisit).toContain(b);
    expect(MOTIF_BAREME_NON_SAISISSABLE).toContain("barème de l'IRPP");
  });

  it('le corps de la requête reçoit le même refus, en français', async () => {
    const dto = plainToInstance(VersionBaremePaieDto, {
      bareme: 'IRPP',
      aPartirDu: '2027-01-01',
      reference: 'Loi n° 99/2027',
      valeurs: {},
    });
    const erreurs = await validate(dto);
    const bareme = erreurs.find((e) => e.property === 'bareme');
    expect(bareme?.constraints?.isEnum).toBe(MOTIF_BAREME_NON_SAISISSABLE);
    // Et un barème servi passe la même porte.
    const smig = plainToInstance(VersionBaremePaieDto, {
      bareme: 'SMIG',
      aPartirDu: '2027-01-01',
      reference: 'Arrêté n° 99/2027',
      valeurs: { smigJournalierFc: 25_000 },
    });
    expect((await validate(smig)).find((e) => e.property === 'bareme')).toBeUndefined();
  });
});
