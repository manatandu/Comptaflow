import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { LicenceService } from './licence.service';

/**
 * À poser sur toute route métier (comptabilité, facturation, etc.), APRÈS la
 * garde d'authentification · `@UseGuards(JwtAuthGuard, LicenceGuard)`. Le
 * dossier se lit sur `request.user.tenantId`, que `JwtAuthGuard` pose.
 * Restent hors d'elle, à dessein · la console de l'opérateur, la restitution
 * du dossier et les sauvegardes sur site (CLAUDE.md § 8).
 */
@Injectable()
export class LicenceGuard implements CanActivate {
  constructor(private readonly licenceService: LicenceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant non résolu');
    }

    // Licence préchargée par JwtStrategy (le cas normal) : évaluation pure,
    // zéro requête. Un request.user construit sans elle (tests, appels
    // internes) retombe sur la lecture directe.
    const { autorise, motif } =
      request.user.licence !== undefined
        ? this.licenceService.evaluerLicence(request.user.licence)
        : await this.licenceService.estAccesAutorise(tenantId);
    if (!autorise) {
      throw new ForbiddenException(motif ?? 'Accès refusé : licence invalide');
    }

    return true;
  }
}
