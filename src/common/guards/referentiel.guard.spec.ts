import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Referentiel } from '@prisma/client';
import { ReferentielGuard } from './referentiel.guard';
import { ReferentielsAutorises } from '../decorators/referentiels.decorator';
import { PrismaService } from '../prisma.service';

/**
 * DIVISION SYCEBNL / SYSCOHADA · cette garde est la barrière de dernier
 * recours (défense en profondeur, l'interface filtre déjà). Ce qui doit
 * tenir : sans décorateur, tout passe (comportement des modules communs) ;
 * avec décorateur, seul le référentiel du dossier compte, jamais son rôle
 * ni sa licence · ce n'est pas son rayon.
 */

function contexte(
  referentielsRequis: string[] | undefined,
  tenantId: string | undefined = 't1',
  prefetch?: string,
) {
  const request = { user: { tenantId, ...(prefetch ? { referentiel: prefetch } : {}) } };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(referentielsRequis),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { ctx, reflector, request };
}

function service(referentiel: string | null) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(referentiel ? { referentiel } : null),
    },
  } as unknown as PrismaService;
}

describe('ReferentielGuard', () => {
  it('laisse tout passer quand la route ne porte aucun @ReferentielsAutorises', async () => {
    const { ctx, reflector } = contexte(undefined);
    const guard = new ReferentielGuard(reflector, service('SYSCOHADA'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('laisse passer un dossier du bon référentiel', async () => {
    const { ctx, reflector } = contexte(['SYCEBNL']);
    const guard = new ReferentielGuard(reflector, service('SYCEBNL'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('refuse un dossier du mauvais référentiel', async () => {
    const { ctx, reflector } = contexte(['SYCEBNL']);
    const guard = new ReferentielGuard(reflector, service('SYSCOHADA'));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('refuse un tenant introuvable plutôt que de laisser passer par défaut', async () => {
    const { ctx, reflector } = contexte(['SYCEBNL']);
    const guard = new ReferentielGuard(reflector, service(null));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('refuse quand le tenant ne peut pas être résolu depuis la requête', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['SYCEBNL']) } as unknown as Reflector;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    const guard = new ReferentielGuard(reflector, service('SYCEBNL'));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  /**
   * LE CHEMIN CHAUD · JwtStrategy précharge `request.user.referentiel`, et la
   * garde s'en sert pour ne PAS interroger la base à chaque requête. Le test
   * ne vérifie pas seulement que ça marche, il vérifie qu'aucune requête n'est
   * partie · sans quoi l'optimisation se perdrait au premier refactor sans
   * que rien ne casse.
   */
  it('utilise le référentiel préchargé par le jeton, sans lire la base', async () => {
    const { ctx, reflector } = contexte(['SYCEBNL'], 't1', 'SYCEBNL');
    const prisma = service('SYSCOHADA');
    const guard = new ReferentielGuard(reflector, prisma);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((prisma.tenant.findUnique as jest.Mock)).not.toHaveBeenCalled();
  });

  it('refuse sur le référentiel préchargé, sans se rattraper sur la base', async () => {
    // Le préchargement ne doit pas être qu'un raccourci pour dire oui : quand
    // il porte le mauvais référentiel, la garde refuse SANS aller demander à
    // la base un second avis qui, ici, aurait laissé passer.
    const { ctx, reflector } = contexte(['SYCEBNL'], 't1', 'SYSCOHADA');
    const prisma = service('SYCEBNL');
    const guard = new ReferentielGuard(reflector, prisma);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect((prisma.tenant.findUnique as jest.Mock)).not.toHaveBeenCalled();
  });

  /**
   * PRIORITÉ MÉTHODE SUR CLASSE · avec un VRAI Reflector, pas un mock qui
   * rendrait toujours la même liste. `getAllAndOverride([handler, class])`
   * doit retenir le décorateur porté par la méthode et ignorer celui de la
   * classe · c'est ce qui permet d'ouvrir une route aux deux référentiels
   * dans un contrôleur par ailleurs réservé à l'un d'eux. Un mock ne peut
   * pas prouver ça : il ne connaît ni la méthode ni la classe.
   */
  describe('avec un vrai Reflector', () => {
    @ReferentielsAutorises(Referentiel.SYCEBNL)
    class ControleurSycebnl {
      @ReferentielsAutorises(Referentiel.SYSCOHADA)
      routeSyscohada() {
        return null;
      }

      routeHeritee() {
        return null;
      }
    }

    function contexteReel(methode: keyof ControleurSycebnl) {
      const request = { user: { tenantId: 't1' } };
      return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ControleurSycebnl.prototype[methode],
        getClass: () => ControleurSycebnl,
      } as unknown as ExecutionContext;
    }

    it('le décorateur de la méthode l’emporte sur celui de la classe', async () => {
      const guard = new ReferentielGuard(new Reflector(), service('SYSCOHADA'));
      await expect(guard.canActivate(contexteReel('routeSyscohada'))).resolves.toBe(true);

      const guardRefus = new ReferentielGuard(new Reflector(), service('SYCEBNL'));
      await expect(guardRefus.canActivate(contexteReel('routeSyscohada'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('une méthode sans décorateur hérite de celui de la classe', async () => {
      const guard = new ReferentielGuard(new Reflector(), service('SYCEBNL'));
      await expect(guard.canActivate(contexteReel('routeHeritee'))).resolves.toBe(true);

      const guardRefus = new ReferentielGuard(new Reflector(), service('SYSCOHADA'));
      await expect(guardRefus.canActivate(contexteReel('routeHeritee'))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
