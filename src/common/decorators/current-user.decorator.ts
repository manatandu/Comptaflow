import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

/**
 * Raccourci pour lire l'utilisateur authentifié posé sur `request.user` par
 * JwtStrategy. Évite le `@Req() request: any` + cast répété dans chaque
 * contrôleur — pose la même convention partout.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
