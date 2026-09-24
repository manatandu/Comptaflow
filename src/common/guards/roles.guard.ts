import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleUtilisateur } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  AccesRolesCantonnes,
  CLE_ACCES_ROLES_CANTONNES,
} from '../decorators/acces-roles-cantonnes.decorator';
import { rolesSatisfaits } from './roles-cantonnes';

/**
 * S'applique après JwtAuthGuard (request.user doit déjà exister). Sans
 * @Roles(...) sur la route, elle laisse passer · l'absence de restriction
 * n'est pas un oubli, c'est le comportement par défaut pour les routes
 * ouvertes à tout utilisateur authentifié du tenant (consultation).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequis = this.reflector.getAllAndOverride<RoleUtilisateur[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequis || rolesRequis.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role: RoleUtilisateur | undefined = request.user?.role;
    // Les deux rôles cantonnés se lisent comme le rôle qu'ils remplacent,
    // là où la route le leur permet · voir roles-cantonnes.ts.
    const acces = this.reflector.getAllAndOverride<AccesRolesCantonnes>(CLE_ACCES_ROLES_CANTONNES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!role || !rolesSatisfaits(role, rolesRequis, acces)) {
      throw new ForbiddenException(`Rôle insuffisant · requis : ${rolesRequis.join(', ')}`);
    }
    return true;
  }
}
