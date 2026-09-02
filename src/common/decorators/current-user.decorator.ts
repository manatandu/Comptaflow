import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  /**
   * Préchargés par JwtStrategy dans LA MÊME requête que l'utilisateur, pour
   * que LicenceGuard et ReferentielGuard n'aient plus à requêter la base à
   * chaque appel API (3 requêtes de garde par appel ramenées à 1). Optionnels :
   * un test qui construit request.user à la main sans eux fait retomber les
   * gardes sur leur lecture directe.
   */
  /**
   * Posé quand le mot de passe a transité par un tiers · MotDePasseAChangerGuard
   * ferme alors toutes les routes sauf celles qui permettent d'en sortir.
   * Optionnel pour les tests qui construisent request.user à la main.
   */
  doitChangerMotDePasse?: boolean;
  referentiel?: string;
  licence?: import('@prisma/client').Licence | null;
  /**
   * Console /plateforme (voir OperateurPlateformeGuard). Relu en base à
   * chaque requête par JwtStrategy, comme le rôle : une révocation prend
   * effet immédiatement. Optionnel pour les tests qui construisent
   * request.user à la main · absent vaut false.
   */
  estOperateurPlateforme?: boolean;
}

/**
 * Raccourci pour lire l'utilisateur authentifié posé sur `request.user` par
 * JwtStrategy. Évite le `@Req() request: any` + cast répété dans chaque
 * contrôleur · pose la même convention partout.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
