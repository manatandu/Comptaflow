import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Referentiel, StatutLicence, TypeLicence } from '@prisma/client';
import { OperateurPlateformeGuard } from './operateur-plateforme.guard';
import { PlateformeService } from './plateforme.service';
import { ModifierLicenceDto } from './dto/plateforme.dto';

/**
 * CONSOLE DE L'OPÉRATEUR DE PLATEFORME · trois garanties se jouent ici.
 * 1. La garde ne laisse passer QUE le drapeau strictement vrai · un
 *    request.user forgé sans lui (ou avec une valeur « truthy » non
 *    booléenne) est refusé.
 * 2. La création d'un cabinet réutilise le pipeline d'inscription avec un
 *    référentiel SYCEBNL imposé et un mot de passe GÉNÉRÉ, renvoyé une seule
 *    fois · et le jeton de session du nouveau dossier n'est JAMAIS remis à
 *    l'opérateur.
 * 3. EXPIREE ne se décrète pas (l'expiration est un fait de calendrier), et
 *    la chaîne vide efface l'échéance, même convention que les paramètres
 *    du dossier.
 */

const contexte = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('OperateurPlateformeGuard', () => {
  const garde = new OperateurPlateformeGuard();

  it('refuse un utilisateur ordinaire, un drapeau absent et un drapeau non booléen', () => {
    expect(() => garde.canActivate(contexte({ userId: 'u1', estOperateurPlateforme: false }))).toThrow(ForbiddenException);
    expect(() => garde.canActivate(contexte({ userId: 'u1' }))).toThrow(ForbiddenException);
    expect(() => garde.canActivate(contexte(undefined))).toThrow(ForbiddenException);
    // !== true : 'true' (chaîne), 1, {} … ne passent pas non plus.
    expect(() => garde.canActivate(contexte({ userId: 'u1', estOperateurPlateforme: 'true' }))).toThrow(ForbiddenException);
  });

  it("laisse passer l'opérateur (drapeau strictement vrai)", () => {
    expect(garde.canActivate(contexte({ userId: 'u1', estOperateurPlateforme: true }))).toBe(true);
  });
});

describe('PlateformeService · bootstrap des opérateurs', () => {
  it("accorde le drapeau aux adresses d'OPERATEURS_PLATEFORME, sans jamais le retirer", async () => {
    const appels: unknown[] = [];
    const prisma = {
      user: {
        updateMany: async (args: unknown) => {
          appels.push(args);
          return { count: 1 };
        },
      },
    } as never;
    const config = { get: () => ' cabinet@exemple.cd , Associe@Exemple.CD ' } as never;
    const service = new PlateformeService(prisma, config, undefined as never);
    await service.onModuleInit();

    expect(appels).toHaveLength(2);
    // Insensible à la casse · l'adresse d'inscription peut différer de celle
    // de la variable d'environnement.
    expect(appels[0]).toEqual({
      where: { email: { equals: 'cabinet@exemple.cd', mode: 'insensitive' }, estOperateurPlateforme: false },
      data: { estOperateurPlateforme: true },
    });
    expect((appels[1] as { where: { email: { equals: string } } }).where.email.equals).toBe('Associe@Exemple.CD');
    // ACCORD SEULEMENT : aucun appel ne pose false.
    for (const a of appels) {
      expect((a as { data: Record<string, unknown> }).data).toEqual({ estOperateurPlateforme: true });
    }
  });

  it('variable absente : aucun appel en base (et surtout aucune destitution)', async () => {
    const prisma = {
      user: {
        updateMany: async () => {
          throw new Error('ne doit pas être appelé');
        },
      },
    } as never;
    const config = { get: () => undefined } as never;
    const service = new PlateformeService(prisma, config, undefined as never);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('PlateformeService · licences', () => {
  const service = (stubs: { licence?: Record<string, unknown> }) =>
    new PlateformeService(
      {
        licence: {
          findUnique: async () => stubs.licence ?? null,
          update: async (args: { data: Record<string, unknown> }) => {
            (stubs as { data?: unknown }).data = args.data;
            return { ...stubs.licence, ...args.data };
          },
        },
      } as never,
      { get: () => undefined } as never,
      undefined as never,
    );

  it('cabinet sans licence : introuvable', async () => {
    await expect(service({}).modifierLicence('t-inconnu', { statut: StatutLicence.SUSPENDUE })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('un PATCH vide est refusé plutôt que silencieusement sans effet', async () => {
    await expect(service({ licence: { tenantId: 't1' } }).modifierLicence('t1', {})).rejects.toThrow(BadRequestException);
  });

  it("la chaîne vide efface l'échéance, une date ISO la pose", async () => {
    const stubs: { licence?: Record<string, unknown>; data?: Record<string, unknown> } = { licence: { tenantId: 't1' } };
    const s = service(stubs);
    await s.modifierLicence('t1', { dateExpiration: '' });
    expect(stubs.data!.dateExpiration).toBeNull();
    await s.modifierLicence('t1', { dateExpiration: '2027-08-31' });
    expect((stubs.data!.dateExpiration as Date).toISOString().slice(0, 10)).toBe('2027-08-31');
  });

  it('EXPIREE ne se décrète pas · le DTO ne connaît qu’ACTIVE et SUSPENDUE', async () => {
    const decret = plainToInstance(ModifierLicenceDto, { statut: 'EXPIREE' });
    expect(await validate(decret)).not.toHaveLength(0);
    const suspension = plainToInstance(ModifierLicenceDto, { statut: 'SUSPENDUE' });
    expect(await validate(suspension)).toHaveLength(0);
  });
});

describe('PlateformeService · création d’un cabinet client', () => {
  it('réutilise le pipeline d’inscription : SYCEBNL imposé, mot de passe généré, jeton jamais retransmis', async () => {
    let dtoRecu: Record<string, unknown> | undefined;
    const authService = {
      register: async (dto: Record<string, unknown>) => {
        dtoRecu = dto;
        return {
          tenant: { id: 't-nouveau', nom: dto.nomEntite },
          exercice: { id: 'ex1' },
          accessToken: 'jeton-du-client',
        };
      },
    } as never;
    const majLicence: unknown[] = [];
    const prisma = {
      licence: {
        update: async (args: unknown) => {
          majLicence.push(args);
          return {};
        },
      },
    } as never;
    const s = new PlateformeService(prisma, { get: () => undefined } as never, authService);

    const resultat = await s.creerCabinet({
      nomEntite: 'ASBL Lumière',
      emailAdmin: 'admin@lumiere.cd',
      typeLicence: TypeLicence.ABONNEMENT,
      dateExpiration: '2027-09-01',
    });

    expect(dtoRecu!.referentiel).toBe(Referentiel.SYCEBNL);
    expect(dtoRecu!.email).toBe('admin@lumiere.cd');
    // Généré, jamais choisi · 16 caractères base64url, bien au-delà du
    // minimum de 10 du RegisterDto.
    expect(typeof dtoRecu!.motDePasse).toBe('string');
    expect((dtoRecu!.motDePasse as string).length).toBeGreaterThanOrEqual(16);
    expect(resultat.motDePasseTemporaire).toBe(dtoRecu!.motDePasse);
    // La session du nouveau dossier appartient au client, pas à l'opérateur.
    expect(resultat).not.toHaveProperty('accessToken');
    // L'échéance demandée est posée sur la licence créée.
    expect(majLicence).toHaveLength(1);
    expect((majLicence[0] as { where: { tenantId: string } }).where.tenantId).toBe('t-nouveau');
  });

  it('deux créations ne partagent jamais le même mot de passe', async () => {
    const motsDePasse: string[] = [];
    const authService = {
      register: async (dto: { motDePasse: string; nomEntite: string }) => {
        motsDePasse.push(dto.motDePasse);
        return { tenant: { id: 't', nom: dto.nomEntite }, exercice: null, accessToken: 'x' };
      },
    } as never;
    const s = new PlateformeService({} as never, { get: () => undefined } as never, authService);
    await s.creerCabinet({ nomEntite: 'A', emailAdmin: 'a@a.cd' });
    await s.creerCabinet({ nomEntite: 'B', emailAdmin: 'b@b.cd' });
    expect(motsDePasse[0]).not.toBe(motsDePasse[1]);
  });
});

describe('PlateformeService · groupe d’établissements', () => {
  const service = (tenants: Record<string, { id: string; dossierMereId: string | null; cellules: number }>) => {
    const maj: Array<{ where: unknown; data: unknown }> = [];
    const s = new PlateformeService(
      {
        tenant: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            const t = tenants[where.id];
            return t ? { id: t.id, dossierMereId: t.dossierMereId, _count: { cellules: t.cellules } } : null;
          },
          update: async (args: { where: unknown; data: unknown }) => {
            maj.push(args);
            return {};
          },
        },
      } as never,
      { get: () => undefined } as never,
      undefined as never,
    );
    return { s, maj };
  };

  const TENANTS = {
    mere: { id: 'mere', dossierMereId: null, cellules: 2 },
    cellule: { id: 'cellule', dossierMereId: 'mere', cellules: 0 },
    libre: { id: 'libre', dossierMereId: null, cellules: 0 },
  };

  it('rattache un dossier libre à une mère, et le détache avec null', async () => {
    const { s, maj } = service(TENANTS);
    await s.modifierGroupe('libre', { dossierMereId: 'mere' });
    expect(maj[0]).toEqual({ where: { id: 'libre' }, data: { dossierMereId: 'mere' } });
    await s.modifierGroupe('cellule', { dossierMereId: null });
    expect(maj[1]).toEqual({ where: { id: 'cellule' }, data: { dossierMereId: null } });
  });

  it('un seul niveau, dans un seul sens : ni sa propre mère, ni une mère qui est cellule, ni une mère rétrogradée en cellule', async () => {
    const { s } = service(TENANTS);
    await expect(s.modifierGroupe('libre', { dossierMereId: 'libre' })).rejects.toThrow(BadRequestException);
    // La mère désignée est elle-même une cellule · deux étages refusés.
    await expect(s.modifierGroupe('libre', { dossierMereId: 'cellule' })).rejects.toThrow(BadRequestException);
    // Un dossier qui a des cellules ne devient pas cellule.
    await expect(s.modifierGroupe('mere', { dossierMereId: 'libre' })).rejects.toThrow(BadRequestException);
    // Mère inexistante.
    await expect(s.modifierGroupe('libre', { dossierMereId: 'fantome' })).rejects.toThrow(NotFoundException);
  });
});
