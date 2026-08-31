import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { LicenceService } from './licence.service';

/**
 * À poser sur toute route métier (comptabilité, facturation, etc.) une fois
 * l'authentification branchée (Phase 1) : `@UseGuards(AuthGuard, LicenceGuard)`.
 * Le tenantId est attendu sur `request.user.tenantId` une fois l'auth en place.
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
