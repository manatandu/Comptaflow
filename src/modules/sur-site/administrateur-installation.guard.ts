import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { estSurSite } from '../../common/mode-installation';
import { AuthService } from '../auth/auth.service';

/**
 * RÉSERVE UNE ROUTE À L'ADMINISTRATEUR DU DOSSIER D'INSTALLATION (audit final
 * F44) · sur site, les sauvegardes copient la base de TOUS les dossiers, et
 * la création d'un dossier engage la licence du poste. Le rôle seul ne
 * suffisait pas · n'importe quel administrateur de n'importe quel dossier,
 * y compris celui qu'un poste du réseau venait de créer par l'inscription
 * publique, obtenait la copie de tous les autres. S'applique APRÈS
 * `JwtAuthGuard`, qui pose l'utilisateur.
 */
@Injectable()
export class AdministrateurInstallationGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!estSurSite()) throw new ForbiddenException('Ce serveur n’est pas une installation sur site.');
    const user = ctx.switchToHttp().getRequest<{ user?: { role?: RoleUtilisateur; tenantId?: string } }>().user;
    const installation = await this.auth.dossierDInstallation();
    if (user?.role !== RoleUtilisateur.ADMIN_CABINET || !installation || user.tenantId !== installation) {
      throw new ForbiddenException(
        'Réservé à l’administrateur du dossier d’installation (le premier dossier créé sur ce poste) · une sauvegarde contient la base de tous les dossiers.',
      );
    }
    return true;
  }
}
