import { SetMetadata } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Pose la liste des rôles autorisés sur une route. Sans ce décorateur,
 * RolesGuard laisse passer tout utilisateur authentifié (voir son
 * commentaire) · @Roles() sert à RESTREINDRE, pas à ouvrir.
 */
export const Roles = (...roles: RoleUtilisateur[]) => SetMetadata(ROLES_KEY, roles);
