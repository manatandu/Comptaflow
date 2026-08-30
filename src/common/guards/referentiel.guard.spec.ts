import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReferentielGuard } from './referentiel.guard';
import { PrismaService } from '../prisma.service';

/**
 * DIVISION SYCEBNL / SYSCOHADA · cette garde est la barrière de dernier
 * recours (défense en profondeur, l'interface filtre déjà). Ce qui doit
 * tenir : sans décorateur, tout passe (comportement des modules communs) ;
 * avec décorateur, seul le référentiel du dossier compte, jamais son rôle
 * ni sa licence — ce n'est pas son rayon.
 */

function contexte(referentielsRequis: string[] | undefined, tenantId = 't1') {
  const request = { user: { tenantId } };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(referentielsRequis),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
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
});
