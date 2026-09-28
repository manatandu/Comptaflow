// Les décorateurs de class-validator lisent les métadonnées de conception ·
// hors du contexte Nest, personne ne charge ce polyfill à notre place.
import 'reflect-metadata';
import { BadRequestException, CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Test } from '@nestjs/testing';
import { JournalAuditController } from './journal-audit.controller';
import { FiltreJournal, JournalAuditService, motifFiltreIllisible } from './journal-audit.service';
import { FiltreJournalAuditDto, lireDateDuFiltre, PAGE_JOURNAL_MAX } from './filtre-journal-audit.dto';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { LicenceGuard } from '../../modules/licence/licence.guard';
import { RolesGuard } from '../guards/roles.guard';
import { configurerApplication } from '../../bootstrap';

/**
 * AUDIT FINAL F239 · UN FILTRE ILLISIBLE DU JOURNAL D'AUDIT EST UN REFUS (400),
 * JAMAIS UNE PANNE (500), ET JAMAIS UN CRITÈRE IGNORÉ.
 *
 * Le contrôleur convertissait lui-même ses paramètres · `Number('abc')` rendait
 * NaN, `new Date('hier')` une date invalide, et Prisma les refusait en 500.
 * Pire que la panne, deux lectures silencieuses · `new Date('1')` est le
 * 1er janvier 2001 et `new Date('2026-02-30')` le 2 mars, deux bornes
 * plausibles appliquées sans que personne ne les ait demandées.
 */

/** Un événement tel que la base le rend, réduit à ce que le filtre lit. */
interface EvenementFactice {
  id: string;
  rang: number;
  tenantId: string;
  horodatage: Date;
  acteurEmail: string;
  entite: string;
  entiteId: string | null;
}

const EVENEMENTS: EvenementFactice[] = [
  { id: 'e-1', rang: 1, tenantId: 'dossier-1', horodatage: new Date('2026-08-31T23:00:00Z'), acteurEmail: 'a@cabinet.cd', entite: 'Compte', entiteId: 'c-1' },
  { id: 'e-2', rang: 2, tenantId: 'dossier-1', horodatage: new Date('2026-09-01T00:00:00Z'), acteurEmail: 'a@cabinet.cd', entite: 'Journal', entiteId: 'j-1' },
  { id: 'e-3', rang: 3, tenantId: 'dossier-1', horodatage: new Date('2026-09-15T10:00:00Z'), acteurEmail: 'b@cabinet.cd', entite: 'Compte', entiteId: 'c-2' },
  { id: 'e-4', rang: 4, tenantId: 'dossier-1', horodatage: new Date('2026-09-30T12:00:00Z'), acteurEmail: 'a@cabinet.cd', entite: 'Compte', entiteId: 'c-3' },
  { id: 'e-5', rang: 1, tenantId: 'dossier-2', horodatage: new Date('2026-09-10T10:00:00Z'), acteurEmail: 'a@cabinet.cd', entite: 'Compte', entiteId: 'c-9' },
];

/**
 * LA DOUBLURE HONORE LE FILTRE ET REFUSE CE QUE PRISMA REFUSE · un faux qui
 * rendrait tout, quels que soient `where`, `skip` et `take`, ne verrait ni un
 * filtre perdu ni une valeur que la vraie base jetterait en 500. Elle lève
 * donc, comme Prisma, sur un entier inexact, une date invalide ou un filtre
 * qui n'est pas une chaîne (un paramètre répété arrive en tableau).
 *
 * Et sur deux valeurs que JavaScript tient pour valides (audit final F239,
 * relecture) · un texte qui porte le caractère nul, que PostgreSQL refuse
 * (« invalid byte sequence for encoding UTF8: 0x00 »), et une date dont
 * `toISOString()` sort des quatre chiffres d'année (« +010000-… »), que le
 * moteur de Prisma refuse (« Could not convert argument value »). Les deux
 * refus ont été constatés sur une base PostgreSQL réelle avec le client
 * Prisma du dépôt, pas supposés.
 */
function prismaFactice() {
  const appels: Array<Record<string, unknown>> = [];
  const filtrer = (where: Record<string, unknown>) => {
    for (const cle of ['tenantId', 'entite', 'entiteId', 'acteurEmail']) {
      const v = where[cle];
      if (v !== undefined && typeof v !== 'string') throw new Error(`Argument ${cle} invalide`);
      if (typeof v === 'string' && v.includes('\u0000')) {
        throw new Error('invalid byte sequence for encoding "UTF8": 0x00');
      }
    }
    const h = (where.horodatage ?? {}) as { gte?: unknown; lte?: unknown };
    for (const borne of [h.gte, h.lte]) {
      if (borne !== undefined && !(borne instanceof Date && !Number.isNaN(borne.getTime()))) {
        throw new Error('Date invalide');
      }
      if (borne instanceof Date && !/^\d{4}-/.test(borne.toISOString())) {
        throw new Error('Could not convert argument value');
      }
    }
    return EVENEMENTS.filter(
      (e) =>
        e.tenantId === where.tenantId &&
        (where.entite === undefined || e.entite === where.entite) &&
        (where.entiteId === undefined || e.entiteId === where.entiteId) &&
        (where.acteurEmail === undefined || e.acteurEmail === where.acteurEmail) &&
        (h.gte === undefined || e.horodatage >= (h.gte as Date)) &&
        (h.lte === undefined || e.horodatage <= (h.lte as Date)),
    );
  };
  const prisma = {
    evenementAudit: {
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        appels.push({ count: where });
        return filtrer(where).length;
      }),
      findMany: jest.fn(
        async ({ where, skip, take }: { where: Record<string, unknown>; skip: number; take: number }) => {
          appels.push({ findMany: where, skip, take });
          if (!Number.isInteger(skip) || !Number.isInteger(take)) throw new Error('Entier invalide');
          return filtrer(where)
            .sort((a, b) => b.rang - a.rang)
            .slice(skip, skip + take);
        },
      ),
    },
  };
  return { prisma, appels };
}

describe('F239 · la lecture d’une date du filtre', () => {
  it('rend l’instant exact des deux formes admises', () => {
    expect(lireDateDuFiltre('2026-09-01')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(lireDateDuFiltre('2026-09-28T10:00:00Z')?.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    expect(lireDateDuFiltre('2026-09-28T10:00+01:00')?.toISOString()).toBe('2026-09-28T09:00:00.000Z');
    expect(lireDateDuFiltre('2026-09-28T10:00:00.250Z')?.toISOString()).toBe('2026-09-28T10:00:00.250Z');
    // Le 29 février d'une année bissextile existe · le contrôle du calendrier
    // ne doit pas refuser ce qui est vrai.
    expect(lireDateDuFiltre('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('refuse ce que `new Date` lirait de travers · « 1 » n’est pas le 1er janvier 2001', () => {
    // Chacune de ces chaînes est lue par `new Date` comme un instant valide.
    expect(Number.isNaN(new Date('1').getTime())).toBe(false);
    expect(Number.isNaN(new Date('2026-02-30').getTime())).toBe(false);
    expect(Number.isNaN(new Date('2026-09-28T10:00').getTime())).toBe(false);
    for (const texte of ['1', '2026-02-30', '2026-09-31', '2027-02-29', '2026-09-28T10:00', '2026-09-28 10:00Z']) {
      expect([texte, lireDateDuFiltre(texte)]).toEqual([texte, null]);
    }
  });

  it('refuse l’instant que la base ne reçoit pas · un fuseau fait franchir l’an 9999 ou l’an 0', () => {
    // Bien écrites, et lues par `new Date` comme des instants valides, mais
    // hors des quatre chiffres d'année une fois ramenées en UTC.
    expect(new Date('9999-12-31T23:30-01:00').toISOString()).toBe('+010000-01-01T00:30:00.000Z');
    expect(new Date('0000-01-01T00:00+01:00').toISOString()).toBe('-000001-12-31T23:00:00.000Z');
    for (const texte of ['9999-12-31T23:30-01:00', '9999-12-31T23:00-23:59', '0000-01-01T00:00+01:00']) {
      expect([texte, lireDateDuFiltre(texte)]).toEqual([texte, null]);
    }
    // La borne elle-même reste admise · le refus ne mord pas sur le vrai.
    expect(lireDateDuFiltre('9999-12-31T23:59:59.999Z')?.toISOString()).toBe('9999-12-31T23:59:59.999Z');
    expect(lireDateDuFiltre('0001-01-01')?.toISOString()).toBe('0001-01-01T00:00:00.000Z');
  });

  it('refuse l’illisible tout court', () => {
    for (const texte of ['hier', '', '2026-13-01', '2026-09-28T25:00Z', '2026-09-28T10:60Z', '2026-09-28T10:00+24:00', '20260928']) {
      expect([texte, lireDateDuFiltre(texte)]).toEqual([texte, null]);
    }
  });
});

describe('F239 · le contrôleur lit son filtre par le DTO', () => {
  it('un seul paramètre de requête, entier, typé par le DTO · sans quoi le ValidationPipe ne le voit pas', () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, JournalAuditController, 'lister') as Record<
      string,
      { index: number; data?: unknown }
    >;
    const requetes = Object.entries(args).filter(([cle]) => cle.startsWith(`${RouteParamtypes.QUERY}:`));
    expect(requetes).toHaveLength(1);
    const [, { index, data }] = requetes[0];
    expect(data).toBeUndefined();
    const types = Reflect.getMetadata('design:paramtypes', JournalAuditController.prototype, 'lister') as unknown[];
    expect(types[index]).toBe(FiltreJournalAuditDto);
  });

  it('transmet le filtre tel quel au service, sous le dossier de la session', async () => {
    const lister = jest.fn().mockResolvedValue({ total: 0 });
    const controleur = new JournalAuditController({ lister } as unknown as JournalAuditService);
    const filtre = Object.assign(new FiltreJournalAuditDto(), { page: 2, entite: 'Compte' });
    await controleur.lister({ tenantId: 'dossier-1' } as never, filtre);
    expect(lister).toHaveBeenCalledWith('dossier-1', filtre);
  });
});

describe('F239 · le service refuse un filtre converti de travers, en dernière ligne', () => {
  const casIllisibles: Array<[string, FiltreJournal]> = [
    ['page NaN', { page: Number.NaN }],
    ['page décimale', { page: 1.5 }],
    ['taille NaN', { taille: Number.NaN }],
    ['taille infinie', { taille: Number.POSITIVE_INFINITY }],
    ['début invalide', { depuis: new Date('hier') }],
    ['fin invalide', { jusqua: new Date('pas une date') }],
    ['début au-delà de l’an 9999', { depuis: new Date('+010000-01-01T00:00:00Z') }],
    ['fin avant l’an 0', { jusqua: new Date('-000001-12-31T23:00:00Z') }],
    ['objet avec le caractère nul', { entite: 'Compte\u0000' }],
    ['identifiant avec le caractère nul', { entiteId: '\u0000' }],
    ['auteur avec le caractère nul', { acteurEmail: 'a\u0000@cabinet.cd' }],
  ];

  it.each(casIllisibles)('%s · 400 avant toute lecture', async (_nom, filtre) => {
    const { prisma, appels } = prismaFactice();
    const service = new JournalAuditService(prisma as unknown as PrismaService);
    await expect(service.lister('dossier-1', filtre)).rejects.toBeInstanceOf(BadRequestException);
    expect(appels).toHaveLength(0);
  });

  it('nomme le critère fautif', () => {
    expect(motifFiltreIllisible({ page: Number.NaN })).toMatch(/Numéro de page/);
    expect(motifFiltreIllisible({ jusqua: new Date('x') })).toMatch(/Date de fin/);
    expect(motifFiltreIllisible({ depuis: new Date('+010000-01-01T00:00:00Z') })).toMatch(/Date de début/);
    expect(motifFiltreIllisible({ entite: 'a\u0000' })).toMatch(/^Objet/);
    expect(motifFiltreIllisible({ entiteId: 'a\u0000' })).toMatch(/Identifiant d’objet/);
    expect(motifFiltreIllisible({ acteurEmail: 'a\u0000' })).toMatch(/Auteur/);
    expect(motifFiltreIllisible({ page: 3, taille: 50, depuis: new Date('2026-09-01') })).toBeNull();
  });
});

describe('F239 · sur un vrai serveur Nest, avec le ValidationPipe de production', () => {
  let app: INestApplication;
  let port: number;
  let appels: Array<Record<string, unknown>>;

  /** La session est posée par une garde de substitution · le sujet est le filtre, pas l'authentification. */
  const sessionFactice: CanActivate = {
    canActivate(ctx: ExecutionContext) {
      ctx.switchToHttp().getRequest().user = { id: 'u-1', tenantId: 'dossier-1', role: 'ADMIN_CABINET' };
      return true;
    },
  };

  beforeAll(async () => {
    const factice = prismaFactice();
    appels = factice.appels;
    const mod = await Test.createTestingModule({
      controllers: [JournalAuditController],
      providers: [JournalAuditService, { provide: PrismaService, useValue: factice.prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(sessionFactice)
      .overrideGuard(LicenceGuard)
      .useValue(sessionFactice)
      .overrideGuard(RolesGuard)
      .useValue(sessionFactice)
      .compile();
    app = mod.createNestApplication();
    // Le MÊME montage que le serveur publié · c'est lui qui pose le pipe global.
    configurerApplication(app);
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    appels.length = 0;
  });

  const lire = async (requete: string) => {
    const reponse = await fetch(`http://127.0.0.1:${port}/journal-audit${requete}`);
    return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
  };

  it.each([
    ['?page=abc', /Numéro de page illisible/],
    ['?page=', /Numéro de page illisible/],
    ['?page=0', /Numéro de page illisible/],
    ['?page=1.5', /Numéro de page illisible/],
    ['?page=0x10', /Numéro de page illisible/],
    ['?page=1e2', /Numéro de page illisible/],
    [`?page=${PAGE_JOURNAL_MAX + 1}`, /hors limite/],
    ['?page=99999999999999999999', /hors limite/],
    ['?taille=abc', /Taille de page illisible/],
    ['?taille=0', /Taille de page illisible/],
    ['?taille=201', /Taille de page illisible/],
    ['?depuis=hier', /Date de début illisible/],
    ['?depuis=1', /Date de début illisible/],
    ['?depuis=2026-02-30', /Date de début illisible/],
    ['?jusqua=2026-09-30T23:59', /Date de fin illisible/],
    ['?jusqua=', /Date de fin illisible/],
    ['?entite=Compte&entite=Journal', /Objet illisible/],
    ['?acteurEmail=a@cabinet.cd&acteurEmail=b@cabinet.cd', /Auteur illisible/],
    // Le motif du DTO (« · le caractère nul », « · attendu ») et non celui du
    // service, plus court · c'est la PORTE qui doit refuser, le service n'est
    // que la dernière ligne.
    ['?entite=Compte%00', /Objet illisible · le caractère nul/],
    ['?entiteId=%00', /Identifiant d’objet illisible · le caractère nul/],
    ['?acteurEmail=a%00@cabinet.cd', /Auteur illisible · le caractère nul/],
    ['?depuis=9999-12-31T23:30-01:00', /Date de début illisible · attendu/],
    ['?jusqua=0000-01-01T00:00%2B01:00', /Date de fin illisible · attendu/],
  ])('%s · 400, avec sa raison, et la base n’est pas lue', async (requete, raison) => {
    const { statut, corps } = await lire(requete);
    expect([requete, statut]).toEqual([requete, 400]);
    expect(String(corps.message)).toMatch(raison);
    expect(appels).toHaveLength(0);
  });

  it('un paramètre inconnu est refusé · ignoré, il se lirait « aucun résultat » sur un filtre jamais appliqué', async () => {
    const { statut } = await lire('?auteur=a@cabinet.cd');
    expect(statut).toBe(400);
    expect(appels).toHaveLength(0);
  });

  it('un filtre lisible est appliqué tel qu’il est écrit, bornes comprises', async () => {
    const { statut, corps } = await lire(
      '?page=1&taille=50&entite=Compte&acteurEmail=a@cabinet.cd&depuis=2026-09-01&jusqua=2026-09-30T12:00:00Z',
    );
    expect(statut).toBe(200);
    // e-1 est la veille, e-2 un autre objet, e-3 un autre auteur, e-5 un autre dossier.
    expect((corps.evenements as Array<{ id: string }>).map((e) => e.id)).toEqual(['e-4']);
    expect(corps).toMatchObject({ total: 1, page: 1, taille: 50 });
  });

  it('les chiffres de la page arrivent en nombres · la deuxième page commence où la première s’arrête', async () => {
    const { statut, corps } = await lire('?page=2&taille=2');
    expect(statut).toBe(200);
    expect(corps).toMatchObject({ total: 4, page: 2, taille: 2 });
    expect((corps.evenements as Array<{ id: string }>).map((e) => e.id)).toEqual(['e-2', 'e-1']);
  });

  it('sans filtre, la première page par défaut', async () => {
    const { statut, corps } = await lire('');
    expect(statut).toBe(200);
    expect(corps).toMatchObject({ total: 4, page: 1, taille: 50 });
  });
});
